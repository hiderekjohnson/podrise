import { pool } from "./db";

interface RecapValidationResult {
  recapId: number;
  slug: string;
  episodeSlug: string;
  episodeTitle: string;
  missing: string[];
  fixed: string[];
  errors: string[];
}

interface ProcessingEvent {
  timestamp: string;
  recapId: number;
  episodeTitle: string;
  podcastName: string;
  source: string;
  missing: string[];
  fixed: string[];
  errors: string[];
}

const processingLog: ProcessingEvent[] = [];
const MAX_LOG_SIZE = 500;

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS recap_processing_failures (
        id SERIAL PRIMARY KEY,
        recap_id INTEGER,
        podcast_slug TEXT,
        episode_slug TEXT,
        episode_title TEXT,
        podcast_name TEXT,
        source TEXT DEFAULT 'validator',
        failure_type TEXT,
        details TEXT,
        resolved BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_rpf_resolved ON recap_processing_failures(resolved)`);
    tableReady = true;
  } catch {}
}

export function getProcessingHealth() {
  const last24h = processingLog.filter(e => {
    const t = new Date(e.timestamp).getTime();
    return Date.now() - t < 24 * 60 * 60 * 1000;
  });
  const withIssues = last24h.filter(e => e.missing.length > 0);
  const fullyFixed = last24h.filter(e => e.missing.length > 0 && e.errors.length === 0 &&
    e.missing.every(m => e.fixed.includes(m) || e.fixed.some(f => f.startsWith(m))));
  const stillBroken = last24h.filter(e => e.errors.length > 0 ||
    e.missing.some(m => !e.fixed.includes(m) && !e.fixed.some(f => f.startsWith(m))));

  const fieldCounts: Record<string, number> = {};
  for (const e of withIssues) {
    for (const m of e.missing) {
      fieldCounts[m] = (fieldCounts[m] || 0) + 1;
    }
  }

  return {
    last24h: {
      total: last24h.length,
      clean: last24h.length - withIssues.length,
      hadIssues: withIssues.length,
      autoFixed: fullyFixed.length,
      stillBroken: stillBroken.length,
    },
    commonMissingFields: Object.entries(fieldCounts).sort((a, b) => b[1] - a[1]).slice(0, 10),
    recentIssues: stillBroken.slice(-20).map(e => ({
      time: e.timestamp,
      title: e.episodeTitle.slice(0, 60),
      podcast: e.podcastName,
      missing: e.missing,
      fixed: e.fixed,
      errors: e.errors,
    })),
  };
}

async function logFailure(recapId: number, podcastSlug: string, episodeSlug: string,
  episodeTitle: string, podcastName: string, failureType: string, details: string) {
  await ensureTable();
  try {
    await pool.query(
      `INSERT INTO recap_processing_failures (recap_id, podcast_slug, episode_slug, episode_title, podcast_name, failure_type, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [recapId, podcastSlug, episodeSlug, episodeTitle, podcastName, failureType, details]
    );
  } catch (err: any) {
    console.error(`[RecapValidator] Failed to log failure:`, err.message);
  }
}

export async function validateAndEnrichRecap(
  recapId: number,
  podcastSlug: string,
  episodeSlug: string,
  podcastName: string,
  episodeTitle: string,
  itunesId: string | null,
  transcript: string | null,
  hosts: string | null,
): Promise<RecapValidationResult> {
  const result: RecapValidationResult = {
    recapId,
    slug: podcastSlug,
    episodeSlug,
    episodeTitle,
    missing: [],
    fixed: [],
    errors: [],
  };

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, tldl, what_happened, quote, key_insights, guests, sponsors, resources,
              top_questions, topic_contexts, show_notes, apple_episode_url, spotify_episode_url,
              audio_url, tabloid_headline, tabloid_sub_headline, podcast_name, itunes_id
       FROM landing_page_recaps WHERE id = $1`,
      [recapId]
    );

    if (rows.length === 0) {
      result.errors.push("Recap not found");
      return result;
    }

    const recap = rows[0];
    const isEmpty = (v: any) => v === null || v === undefined || v === "" || v === "[]";

    if (isEmpty(recap.apple_episode_url)) result.missing.push("apple_url");
    if (isEmpty(recap.spotify_episode_url)) result.missing.push("spotify_url");
    if (isEmpty(recap.audio_url)) result.missing.push("audio_url");

    if (result.missing.length === 0) {
      return result;
    }

    console.log(`[RecapValidator] Episode "${episodeTitle.slice(0, 50)}" missing: ${result.missing.join(", ")}`);

    if (result.missing.includes("apple_url") && itunesId) {
      try {
        const lookupUrl = `https://itunes.apple.com/lookup?id=${itunesId}&media=podcast&entity=podcastEpisode&limit=25`;
        const resp = await fetch(lookupUrl);
        const data = await resp.json();
        const eps = (data.results || []).filter((r: any) => r.wrapperType === "podcastEpisode");
        const titleLower = episodeTitle.toLowerCase().trim();
        const matched = eps.find((e: any) => (e.trackName || "").toLowerCase().trim() === titleLower);
        if (matched?.trackViewUrl) {
          await client.query(
            `UPDATE landing_page_recaps SET apple_episode_url = $1 WHERE id = $2`,
            [matched.trackViewUrl.replace(/&uo=\d+/, ""), recapId]
          );
          result.fixed.push("apple_url");
        }
        if (!recap.audio_url && matched?.episodeUrl) {
          await client.query(
            `UPDATE landing_page_recaps SET audio_url = $1 WHERE id = $2`,
            [matched.episodeUrl, recapId]
          );
          result.fixed.push("audio_url");
        }
      } catch (err: any) {
        result.errors.push(`apple: ${err.message?.slice(0, 80)}`);
      }
    }

    const fixedCount = result.fixed.length;
    const stillMissing = result.missing.filter(f => !result.fixed.includes(f) && !result.fixed.some(fx => fx.startsWith(f)));
    if (fixedCount > 0) {
      console.log(`[RecapValidator] Fixed ${fixedCount} fields for "${episodeTitle.slice(0, 50)}": ${result.fixed.join(", ")}`);
    }
    if (stillMissing.length > 0) {
      console.warn(`[RecapValidator] Still missing for "${episodeTitle.slice(0, 50)}": ${stillMissing.join(", ")}`);
    }
    if (result.errors.length > 0) {
      console.error(`[RecapValidator] Errors for "${episodeTitle.slice(0, 50)}": ${result.errors.join("; ")}`);
    }

    processingLog.push({
      timestamp: new Date().toISOString(),
      recapId,
      episodeTitle,
      podcastName,
      source: "auto",
      missing: result.missing,
      fixed: result.fixed,
      errors: result.errors,
    });
    if (processingLog.length > MAX_LOG_SIZE) {
      processingLog.splice(0, processingLog.length - MAX_LOG_SIZE);
    }

    if (stillMissing.length > 0 || result.errors.length > 0) {
      const details = [
        stillMissing.length > 0 ? `missing: ${stillMissing.join(", ")}` : "",
        result.errors.length > 0 ? `errors: ${result.errors.join("; ")}` : "",
      ].filter(Boolean).join(" | ");
      await logFailure(recapId, podcastSlug, episodeSlug, episodeTitle, podcastName,
        result.errors.length > 0 ? "enrichment_error" : "incomplete",
        details
      );
    }

    return result;
  } finally {
    client.release();
  }
}
