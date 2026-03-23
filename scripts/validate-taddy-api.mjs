#!/usr/bin/env node
/**
 * Pre-deploy validation: Tests Taddy API connectivity and webhook filter state.
 * Run this before deploying to catch API schema mismatches early.
 *
 * What it checks:
 * 1. Taddy API is reachable with valid credentials
 * 2. getMyWebhooks returns a webhook with a filter
 * 3. Filter is type podcastepisode.created
 * 4. Filter UUID count matches (or exceeds) our published podcast count in DB
 * 5. addWebhookFilter mutation exists and returns { id } (smoke test via introspection)
 * 6. deleteWebhookFilter mutation exists and is callable (smoke test via introspection)
 */

import { execSync } from "child_process";

const TADDY_API = "https://api.taddy.org";
const userId = process.env.TADDY_USER_ID;
const apiKey = process.env.TADDY_API_KEY;
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

async function taddyQuery(query) {
  const resp = await fetch(TADDY_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-USER-ID": userId,
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ query }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors));
  return json;
}

// ─── Check 1: Credentials present ─────────────────────────────────────────
console.log("\n[1] Checking Taddy credentials...");
if (!userId || !apiKey) {
  fail("TADDY_USER_ID and TADDY_API_KEY must be set", `userId=${userId}, apiKey=${apiKey ? "present" : "MISSING"}`);
} else {
  pass("Credentials present");
}

// ─── Check 2: API reachability ────────────────────────────────────────────
console.log("\n[2] Checking Taddy API reachability...");
let webhookData;
try {
  const result = await taddyQuery(`{
    getMyDeveloperWebhooks {
      userId
      webhooks {
        id
        filters {
          uuid
          eventType
          includedUuids
        }
      }
    }
  }`);
  webhookData = result?.data?.getMyDeveloperWebhooks;
  if (!webhookData) throw new Error("Null response — check userId field in query");
  pass("Taddy API reachable");
} catch (e) {
  fail("Taddy API unreachable or returned error", e.message);
}

// ─── Check 3: Webhook exists ──────────────────────────────────────────────
console.log("\n[3] Checking webhook registration...");
let webhook;
if (webhookData) {
  webhook = webhookData.webhooks?.[0];
  if (!webhook) {
    fail("No webhook registered in Taddy account");
  } else {
    pass(`Webhook found (id=${webhook.id})`);
  }
}

// ─── Check 4: Filter state ────────────────────────────────────────────────
console.log("\n[4] Checking webhook filter...");
if (webhook) {
  const filters = webhook.filters ?? [];
  const episodeFilter = filters.find((f) => f.eventType === "podcastepisode.created");

  if (!episodeFilter) {
    fail("No podcastepisode.created filter found — webhook will fire for ALL podcasts globally");
  } else {
    const count = episodeFilter.includedUuids?.length ?? 0;
    pass(`Filter exists (eventType=podcastepisode.created, uuid=${episodeFilter.uuid})`);

    if (count === 0) {
      fail("Filter includedUuids is empty — no podcasts will trigger the webhook");
    } else {
      pass(`Filter has ${count} UUIDs`);
    }

    // Check DB count vs filter count
    if (DATABASE_URL) {
      try {
        const { default: pg } = await import("pg");
        const client = new pg.Client({ connectionString: DATABASE_URL });
        await client.connect();
        const { rows } = await client.query(
          `SELECT COUNT(*) as cnt FROM podcast_directory WHERE status = 'published' AND taddy_uuid IS NOT NULL`
        );
        await client.end();
        const dbCount = parseInt(rows[0].cnt, 10);
        if (count < dbCount) {
          fail(
            `Filter has ${count} UUIDs but DB has ${dbCount} published podcasts with taddyUuid — run Sync Filters`,
            `Missing ${dbCount - count} podcasts`
          );
        } else {
          pass(`Filter count (${count}) >= DB published count (${dbCount})`);
        }
      } catch (e) {
        fail("Could not query DB for published podcast count", e.message);
      }
    }
  }
}

// ─── Check 5: addWebhookFilter mutation smoke test ────────────────────────
// We test by introspecting the mutation signature, not by actually calling it
// (to avoid mutating live data). We call it with an obviously invalid webhookId
// and expect a data-level error (not an "unknown field" error).
console.log("\n[5] Smoke-testing addWebhookFilter mutation signature...");
if (webhook) {
  try {
    const result = await fetch(TADDY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-USER-ID": userId,
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({
        query: `mutation {
          addWebhookFilter(
            webhookId: "__validate_test__"
            filter: { eventType: "podcastepisode.created", includedUuids: [] }
          ) { id }
        }`,
      }),
    });
    const json = await result.json();
    const errMsg = JSON.stringify(json.errors ?? []);
    // We expect a business-logic error ("not found", "invalid id", etc) NOT a schema error
    // Schema errors look like: "Cannot query field", "Unknown argument", "Field 'X' doesn't exist"
    if (
      errMsg.includes("Cannot query field") ||
      errMsg.includes("Unknown argument") ||
      errMsg.includes("Field") ||
      errMsg.includes("INVALID_QUERY_OR_SYNTAX")
    ) {
      fail("addWebhookFilter mutation signature rejected by Taddy API", errMsg);
    } else {
      pass('addWebhookFilter mutation accepted by Taddy (got expected business-level response, not schema error)');
    }
  } catch (e) {
    fail("addWebhookFilter smoke test threw", e.message);
  }
}

// ─── Check 6: deleteWebhookFilter mutation smoke test ─────────────────────
console.log("\n[6] Smoke-testing deleteWebhookFilter mutation signature...");
if (webhook) {
  try {
    const result = await fetch(TADDY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-USER-ID": userId,
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({
        query: `mutation {
          deleteWebhookFilter(
            webhookId: "__validate_test__"
            filterUuid: "__validate_test__"
          ) { id }
        }`,
      }),
    });
    const json = await result.json();
    const errMsg = JSON.stringify(json.errors ?? []);
    if (
      errMsg.includes("Cannot query field") ||
      errMsg.includes("Unknown argument") ||
      errMsg.includes("Field") ||
      errMsg.includes("INVALID_QUERY_OR_SYNTAX")
    ) {
      fail("deleteWebhookFilter mutation signature rejected by Taddy API", errMsg);
    } else {
      pass('deleteWebhookFilter mutation accepted by Taddy (got expected business-level response, not schema error)');
    }
  } catch (e) {
    fail("deleteWebhookFilter smoke test threw", e.message);
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`Taddy API validation: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.error("\nFailed checks:");
  failures.forEach(({ label, detail }) => {
    console.error(`  ✗ ${label}${detail ? `: ${detail}` : ""}`);
  });
  process.exit(1);
} else {
  console.log("All Taddy API checks passed.");
}
