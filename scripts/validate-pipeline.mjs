#!/usr/bin/env node
/**
 * Pre-deploy validation: Checks pipeline DB state and feature flags.
 * Run this before deploying to catch schema issues, missing columns, stuck entries, etc.
 *
 * What it checks:
 * 1. DB connection works
 * 2. episode_guid column exists in landing_page_recaps (dedup column)
 * 3. pending_transcript_queue table has expected shape
 * 4. No queue entries stuck in 'processing' for > 30min (indicates crashed scheduler)
 * 5. Feature flags table has pipeline kill switches
 * 6. Published podcasts with taddyUuid count
 * 7. Queue status summary
 */

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

let passed = 0;
let failed = 0;
const failures = [];

function pass(label) {
  console.log(`  ✓ ${label}`);
  passed++;
}

function fail(label, detail) {
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    → ${detail}`);
  failed++;
  failures.push({ label, detail });
}

function warn(label, detail) {
  console.warn(`  ⚠ ${label}`);
  if (detail) console.warn(`    → ${detail}`);
}

if (!DATABASE_URL) {
  console.error("DATABASE_URL not set — cannot run pipeline checks");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });

try {
  // ─── Check 1: DB connection ─────────────────────────────────────────────
  console.log("\n[1] Checking DB connection...");
  await client.connect();
  pass("DB connected");

  // ─── Check 2: episode_guid in landing_page_recaps ───────────────────────
  console.log("\n[2] Checking episode_guid column in landing_page_recaps...");
  const { rows: guidCol } = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'landing_page_recaps'
      AND column_name = 'episode_guid'
  `);
  if (guidCol.length === 0) {
    fail(
      "episode_guid column missing from landing_page_recaps",
      "Run: ALTER TABLE landing_page_recaps ADD COLUMN episode_guid text;"
    );
  } else {
    pass(`episode_guid column present (type: ${guidCol[0].data_type})`);
  }

  // ─── Check 3: pending_transcript_queue table shape ──────────────────────
  console.log("\n[3] Checking pending_transcript_queue table columns...");
  const { rows: queueCols } = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'pending_transcript_queue'
    ORDER BY ordinal_position
  `);
  if (queueCols.length === 0) {
    fail("pending_transcript_queue table does not exist");
  } else {
    const colNames = queueCols.map((r) => r.column_name);
    const requiredCols = [
      "id", "podcast_id", "episode_guid", "episode_title",
      "status", "attempts", "created_at",
    ];
    const missing = requiredCols.filter((c) => !colNames.includes(c));
    if (missing.length) {
      fail(`pending_transcript_queue missing columns: ${missing.join(", ")}`);
    } else {
      pass(`pending_transcript_queue has all required columns (${colNames.length} total)`);
    }
  }

  // ─── Check 4: Stuck 'processing' entries ────────────────────────────────
  console.log("\n[4] Checking for stuck pipeline queue entries...");
  const { rows: stuck } = await client.query(`
    SELECT id, episode_title, status, attempts, last_attempt_at
    FROM pending_transcript_queue
    WHERE status = 'processing'
      AND last_attempt_at < NOW() - INTERVAL '30 minutes'
    LIMIT 10
  `);
  if (stuck.length > 0) {
    warn(
      `${stuck.length} queue entr${stuck.length === 1 ? "y" : "ies"} stuck in 'processing' for >30min`,
      `IDs: ${stuck.map((r) => r.id).join(", ")} — may indicate crashed scheduler`
    );
  } else {
    pass("No stuck 'processing' entries");
  }

  // ─── Check 5: Feature flags ──────────────────────────────────────────────
  console.log("\n[5] Checking pipeline feature flags...");
  // Check if feature_flags table exists first
  const { rows: flagTableExists } = await client.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'feature_flags'
  `);
  if (flagTableExists.length === 0) {
    fail("feature_flags table does not exist");
  } else {
    const { rows: flags } = await client.query(`
      SELECT key, enabled FROM feature_flags
      WHERE key IN ('pipeline_transcript_fetch_enabled', 'pipeline_recap_generation_enabled')
    `);
    const flagMap = Object.fromEntries(flags.map((r) => [r.key, r.enabled]));

    const transcriptFlag = flagMap["pipeline_transcript_fetch_enabled"];
    const recapFlag = flagMap["pipeline_recap_generation_enabled"];

    if (transcriptFlag === undefined) {
      fail(
        "feature flag 'pipeline_transcript_fetch_enabled' not found",
        "Pipeline transcript fetch kill switch is missing from DB"
      );
    } else {
      pass(`pipeline_transcript_fetch_enabled = ${transcriptFlag}`);
      if (transcriptFlag === false) {
        warn("Transcript fetch is DISABLED — pipeline will not fetch transcripts");
      }
    }

    if (recapFlag === undefined) {
      fail(
        "feature flag 'pipeline_recap_generation_enabled' not found",
        "Pipeline recap generation kill switch is missing from DB"
      );
    } else {
      pass(`pipeline_recap_generation_enabled = ${recapFlag}`);
      if (recapFlag === false) {
        warn("Recap generation is DISABLED — pipeline will not generate recaps");
      }
    }
  }

  // ─── Check 6: Published podcasts with taddyUuid ─────────────────────────
  console.log("\n[6] Checking published podcasts with taddyUuid...");
  const { rows: podcastStats } = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'published') as published,
      COUNT(*) FILTER (WHERE status = 'published' AND taddy_uuid IS NOT NULL) as published_with_uuid,
      COUNT(*) FILTER (WHERE status = 'published' AND taddy_uuid IS NULL) as published_without_uuid
    FROM podcast_directory
  `);
  const stats = podcastStats[0];
  pass(`Published podcasts: ${stats.published} total`);
  if (parseInt(stats.published_without_uuid) > 0) {
    warn(
      `${stats.published_without_uuid} published podcast(s) missing taddyUuid`,
      "These will NOT trigger the pipeline — run Sync Filters after adding UUIDs"
    );
  } else {
    pass(`All ${stats.published_with_uuid} published podcasts have taddyUuid`);
  }

  // ─── Check 7: Queue status summary ──────────────────────────────────────
  console.log("\n[7] Queue status summary...");
  const { rows: summary } = await client.query(`
    SELECT status, COUNT(*) as count
    FROM pending_transcript_queue
    GROUP BY status
    ORDER BY status
  `);
  if (summary.length === 0) {
    pass("Queue is empty (no pending episodes)");
  } else {
    summary.forEach(({ status, count }) => {
      const label = `Queue: ${count} entr${count === "1" ? "y" : "ies"} with status '${status}'`;
      if (status === "failed") {
        warn(label);
      } else {
        pass(label);
      }
    });
  }

} catch (e) {
  fail("Unexpected error during pipeline validation", e.message);
} finally {
  await client.end().catch(() => {});
}

// ─── Summary ──────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`Pipeline validation: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.error("\nFailed checks:");
  failures.forEach(({ label, detail }) => {
    console.error(`  ✗ ${label}${detail ? `: ${detail}` : ""}`);
  });
  process.exit(1);
} else {
  console.log("All pipeline checks passed.");
}
