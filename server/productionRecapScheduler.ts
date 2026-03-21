import { pool } from "./db";
import { storage } from "./storage";
import { generateRecapFromFullTranscript } from "./recapGenerator";
import { ITUNES_ID_TO_SLUG } from "./podcastLandingMap";

const INTERVAL_MS = 5 * 60 * 1000;
const HEADLINE_CATCHUP_INTERVAL_MS = 15 * 60 * 1000;
const BATCH_SIZE = 3;
const PER_PODCAST = 3;
const BATCH_TIMEOUT_MS = 10 * 60 * 1000;
const HEADLINE_RETRY_COUNT = 2;
const HEADLINE_RETRY_DELAY_MS = 3000;
let batchRunning = false;
let batchStartedAt = 0;
let catchUpRunning = false;

async function getPodcastInfo(itunesId: string) {
  const { rows } = await pool.query(
    `SELECT name, slug, hosts, artwork_url, itunes_id FROM podcast_directory WHERE itunes_id = $1 AND status = 'published'`,
    [itunesId]
  );
  return rows[0] || null;
}

function makeEpisodeSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

async function generateTabloidHeadlineWithRetry(
  recapId: number,
  epTitle: string,
  podcastName: string,
  whatHappened: string,
  keyInsights: string[],
): Promise<boolean> {
  const { generateTabloidHeadline } = await import("./emailScheduler");
  for (let attempt = 1; attempt <= HEADLINE_RETRY_COUNT + 1; attempt++) {
    try {
      const headlineResult = await generateTabloidHeadline(
        epTitle, podcastName, "", whatHappened, keyInsights
      );
      if (headlineResult) {
        await pool.query(
          `UPDATE landing_page_recaps SET tabloid_headline = $1, tabloid_sub_headline = $2 WHERE id = $3`,
          [headlineResult.tabloidHeadline, headlineResult.tabloidSubHeadline, recapId]
        );
        console.log(`[ProdRecap] Generated tabloid headline for "${epTitle?.slice(0, 50)}" (attempt ${attempt})`);
        return true;
      }
      console.warn(`[ProdRecap] Tabloid headline returned null for "${epTitle?.slice(0, 50)}" (attempt ${attempt}/${HEADLINE_RETRY_COUNT + 1})`);
    } catch (headlineErr: any) {
      console.error(`[ProdRecap] Tabloid headline generation error for "${epTitle?.slice(0, 50)}" (attempt ${attempt}/${HEADLINE_RETRY_COUNT + 1}): ${headlineErr.message}`, headlineErr.stack);
    }
    if (attempt <= HEADLINE_RETRY_COUNT) {
      await new Promise(r => setTimeout(r, HEADLINE_RETRY_DELAY_MS));
    }
  }
  console.error(`[ProdRecap] Tabloid headline generation failed after ${HEADLINE_RETRY_COUNT + 1} attempts for "${epTitle?.slice(0, 50)}"`);
  return false;
}

async function catchUpMissingHeadlines() {
  if (catchUpRunning) {
    console.log(`[ProdRecap] Headline catch-up already running, skipping`);
    return;
  }
  catchUpRunning = true;
  try {
    const { rows } = await pool.query(`
      SELECT id, episode_title, podcast_name, what_happened, key_insights
      FROM landing_page_recaps
      WHERE tabloid_headline IS NULL
        AND what_happened IS NOT NULL
        AND what_happened != ''
      ORDER BY created_at DESC
      LIMIT 50
    `);

    if (rows.length === 0) {
      return;
    }

    console.log(`[ProdRecap] Headline catch-up: found ${rows.length} recap(s) missing tabloid headlines`);

    let success = 0;
    let failed = 0;
    for (const row of rows) {
      const keyInsights = Array.isArray(row.key_insights) ? row.key_insights : [];
      const result = await generateTabloidHeadlineWithRetry(
        row.id,
        row.episode_title,
        row.podcast_name,
        row.what_happened,
        keyInsights,
      );
      if (result) success++;
      else failed++;
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`[ProdRecap] Headline catch-up complete: ${success} generated, ${failed} failed`);
  } catch (err: any) {
    console.error(`[ProdRecap] Headline catch-up error: ${err.message}`, err.stack);
  } finally {
    catchUpRunning = false;
  }
}

interface ProcessEpisodeResult {
  success: boolean;
}

async function processEpisode(ep: any, podcastSlug: string, podcastName: string, itunesId: string, hosts: string, artwork: string): Promise<ProcessEpisodeResult> {
  const epSlug = makeEpisodeSlug(ep.episode_title);
  const epTitle = ep.episode_title;

  try {
    const recap = await generateRecapFromFullTranscript(
      ep.transcript,
      podcastName,
      epTitle,
      ep.description || null,
    );

    if (!recap) return { success: false };

    const publishDate = ep.date_published
      ? new Date(ep.date_published * 1000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const { rows: existingRows } = await pool.query(
      `SELECT id FROM landing_page_recaps WHERE itunes_id = $1 AND lower(trim(episode_title)) = lower(trim($2)) LIMIT 1`,
      [itunesId, epTitle]
    );
    if (existingRows.length > 0) {
      console.log(`[ProdRecap] Skip duplicate: "${epTitle?.slice(0, 60)}" already exists (id=${existingRows[0].id})`);
      return { success: true };
    }

    let tabloidHeadline: string | null = null;
    let tabloidSubHeadline: string | null = null;
    try {
      const { generateTabloidHeadline } = await import("./emailScheduler");
      const headlineTimeout = 30_000;
      for (let attempt = 1; attempt <= HEADLINE_RETRY_COUNT + 1; attempt++) {
        try {
          const headlinePromise = generateTabloidHeadline(epTitle, podcastName, "", recap.whatHappened, recap.keyInsights || []);
          const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), headlineTimeout));
          const result = await Promise.race([headlinePromise, timeoutPromise]);
          if (result) {
            tabloidHeadline = result.tabloidHeadline;
            tabloidSubHeadline = result.tabloidSubHeadline;
            console.log(`[ProdRecap] Generated tabloid headline for "${epTitle?.slice(0, 50)}" (attempt ${attempt})`);
            break;
          }
          console.warn(`[ProdRecap] Tabloid headline returned null/timeout for "${epTitle?.slice(0, 50)}" (attempt ${attempt}/${HEADLINE_RETRY_COUNT + 1})`);

        } catch (headlineErr: any) {
          console.error(`[ProdRecap] Tabloid headline error for "${epTitle?.slice(0, 50)}" (attempt ${attempt}/${HEADLINE_RETRY_COUNT + 1}): ${headlineErr.message}`);
        }
        if (attempt <= HEADLINE_RETRY_COUNT) await new Promise(r => setTimeout(r, HEADLINE_RETRY_DELAY_MS));
      }
    } catch (headlineErr: any) {
      console.warn(`[ProdRecap] Inline headline generation failed for "${epTitle?.slice(0, 50)}": ${headlineErr.message}`);
    }

    const upsertedRecap = await storage.upsertLandingPageRecap({
      slug: podcastSlug,
      itunesId,
      podcastName,
      episodeTitle: epTitle,
      episodeSlug: epSlug,
      publishDate,
      duration: ep.duration ? String(ep.duration) : null,
      artworkUrl: artwork,
      hosts: hosts || "",
      tldl: "",
      whatHappened: recap.whatHappened,
      keyInsights: recap.keyInsights || [],
      quote: "",
      quoteAttribution: "",
      keyTopics: [],
      guests: JSON.stringify(recap.guests || []),
      resources: JSON.stringify(recap.resources || []),
      tabloidHeadline,
      tabloidSubHeadline,
      showNotes: ep.description || null,
      published: true,
    });
    const canonicalSlug = upsertedRecap.episodeSlug;

    if (upsertedRecap?.id) {
      try {
        const { validateAndEnrichRecap } = await import("./recapValidator");
        await validateAndEnrichRecap(
          upsertedRecap.id, podcastSlug, canonicalSlug, podcastName,
          epTitle, itunesId, ep.transcript || null, hosts || null
        );
      } catch (valErr) {
        console.warn(`[ProdRecap] Validation failed for "${epTitle?.slice(0, 50)}":`, valErr);
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error(`[ProdRecap] Error processing "${epTitle?.slice(0, 50)}": ${err.message}`);
    try {
      await pool.query(
        `INSERT INTO recap_processing_failures (recap_id, podcast_slug, episode_slug, episode_title, podcast_name, source, failure_type, details)
         VALUES (NULL, $1, $2, $3, $4, 'production_scheduler', 'generation_failed', $5)`,
        [podcastSlug, epSlug, epTitle, podcastName, err.message?.slice(0, 500)]
      );
    } catch {}
    return { success: false };
  }
}

async function runBatch() {
  if (batchRunning) {
    const elapsed = Date.now() - batchStartedAt;
    if (elapsed > BATCH_TIMEOUT_MS) {
      console.warn(`[ProdRecap] Batch stuck for ${Math.round(elapsed / 60000)}min — forcing reset`);
      batchRunning = false;
    } else {
      console.log(`[ProdRecap] Previous batch still running (${Math.round(elapsed / 1000)}s), skipping`);
      return;
    }
  }
  batchRunning = true;
  batchStartedAt = Date.now();
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const cutoffTimestamp = Math.floor(threeDaysAgo.getTime() / 1000);
    const { rows: episodes } = await pool.query(
      `WITH ranked AS (
         SELECT et.id, et.podcast_id, et.episode_title, et.transcript, et.description,
                et.date_published, et.duration, et.audio_url, et.image_url, et.fetched_at,
                ROW_NUMBER() OVER (PARTITION BY et.podcast_id ORDER BY et.date_published DESC) AS rn
         FROM episode_transcripts et
         INNER JOIN podcast_directory pd ON pd.itunes_id = et.podcast_id AND pd.status = 'published'
         WHERE et.transcript IS NOT NULL AND et.transcript != ''
           AND et.date_published IS NOT NULL
           AND et.date_published >= $3
           AND NOT EXISTS (
             SELECT 1 FROM landing_page_recaps lpr
             WHERE lpr.itunes_id = et.podcast_id
               AND (lower(trim(lpr.episode_title)) = lower(trim(et.episode_title))
                 OR lpr.episode_slug = lower(regexp_replace(trim(et.episode_title), '[^a-zA-Z0-9]+', '-', 'g')))
           )
       )
       SELECT id, podcast_id, episode_title, transcript, description,
              date_published, duration, audio_url, image_url, fetched_at
       FROM ranked
       WHERE rn <= $1
       ORDER BY date_published DESC
       LIMIT $2`,
      [PER_PODCAST, BATCH_SIZE, cutoffTimestamp]
    );

    if (episodes.length === 0) {
      return;
    }

    console.log(`[ProdRecap] Processing ${episodes.length} episodes...`);

    let generated = 0;
    let failed = 0;

    for (const ep of episodes) {
      const info = await getPodcastInfo(ep.podcast_id);
      if (!info) {
        console.log(`[ProdRecap] Skip: no podcast info for itunesId=${ep.podcast_id}`);
        continue;
      }

      const podcastSlug = ITUNES_ID_TO_SLUG[ep.podcast_id] || info.slug || info.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
      const podcastName = info.name;
      const hosts = info.hosts || "";
      const artwork = info.artwork_url || "";

      console.log(`[ProdRecap] Processing: "${ep.episode_title?.slice(0, 60)}" (${podcastName})`);

      const processPromise = processEpisode(ep, podcastSlug, podcastName, ep.podcast_id, hosts, artwork);

      const episodeTimeout = new Promise<ProcessEpisodeResult>((resolve) => setTimeout(() => {
        console.warn(`[ProdRecap] Episode timed out after 4min: "${ep.episode_title?.slice(0, 60)}"`);
        resolve({ success: false });
      }, 4 * 60 * 1000));
      const result = await Promise.race([processPromise, episodeTimeout]);
      if (result.success) generated++;
      else failed++;

      if (episodes.indexOf(ep) < episodes.length - 1) {
        await new Promise(r => setTimeout(r, 30_000));
      }
    }

    if (generated > 0 || failed > 0) {
      console.log(`[ProdRecap] Batch done: ${generated} generated, ${failed} failed`);
    }
  } catch (err: any) {
    console.error("[ProdRecap] Batch error:", err.message);
  } finally {
    batchRunning = false;
  }
}

async function cleanupDuplicateRecaps() {
  try {
    const { rows } = await pool.query(`
      DELETE FROM landing_page_recaps
      WHERE id IN (
        SELECT lpr.id FROM landing_page_recaps lpr
        WHERE lpr.created_at >= NOW() - INTERVAL '7 days'
          AND EXISTS (
            SELECT 1 FROM landing_page_recaps older
            WHERE older.itunes_id = lpr.itunes_id
              AND lower(trim(older.episode_title)) = lower(trim(lpr.episode_title))
              AND older.id < lpr.id
          )
      )
      RETURNING id, episode_title
    `);
    if (rows.length > 0) {
      console.log(`[ProdRecap] Cleaned up ${rows.length} recent duplicate recap(s)`);
    } else {
      console.log(`[ProdRecap] No recent duplicates found`);
    }
  } catch (err: any) {
    console.error(`[ProdRecap] Duplicate cleanup error: ${err.message}`);
  }

  try {
    const { rows: nullDateRows } = await pool.query(`
      DELETE FROM landing_page_recaps
      WHERE id IN (
        SELECT lpr.id FROM landing_page_recaps lpr
        WHERE lpr.created_at >= NOW() - INTERVAL '7 days'
          AND EXISTS (
            SELECT 1 FROM episode_transcripts et
            WHERE et.podcast_id = lpr.itunes_id
              AND lower(trim(et.episode_title)) = lower(trim(lpr.episode_title))
              AND et.date_published IS NULL
          )
          AND NOT EXISTS (
            SELECT 1 FROM episode_transcripts et2
            WHERE et2.podcast_id = lpr.itunes_id
              AND lower(trim(et2.episode_title)) = lower(trim(lpr.episode_title))
              AND et2.date_published IS NOT NULL
          )
      )
      RETURNING id, episode_title
    `);
    if (nullDateRows.length > 0) {
      console.log(`[ProdRecap] Removed ${nullDateRows.length} recap(s) created from episodes with no real publish date`);
    } else {
      console.log(`[ProdRecap] No null-date recaps to clean`);
    }
  } catch (err: any) {
    console.error(`[ProdRecap] Null-date cleanup error: ${err.message}`);
  }
}

const STALL_CHECK_INTERVAL_MS = 30 * 60 * 1000;

// Stall threshold: 6 hours.
// Verified via: SELECT MAX(gap) FROM (
//   SELECT created_at - LAG(created_at) OVER (ORDER BY created_at) AS gap
//   FROM landing_page_recaps
// ) t;
// Result: max gap ~3-4 hours (overnight / low-activity windows).
// 6 hours provides comfortable margin above the largest normal gap while still
// catching genuine pipeline failures promptly. Adjust if pipeline cadence changes.
const STALL_THRESHOLD_HOURS = 6;

let stallAlertSent = false;

async function checkRecapStall() {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM landing_page_recaps WHERE created_at >= NOW() - INTERVAL '${STALL_THRESHOLD_HOURS} hours'`
    );
    const recentCount = parseInt(result.rows[0].count);

    if (recentCount > 0) {
      if (stallAlertSent) {
        console.log("[ProdRecap] Stall resolved — new recaps detected, resetting alert flag");
      }
      stallAlertSent = false;
      return;
    }

    if (stallAlertSent) {
      console.log("[ProdRecap] Stall persists but alert already sent — suppressing duplicate");
      return;
    }

    const lastResult = await pool.query(
      `SELECT created_at FROM landing_page_recaps ORDER BY created_at DESC LIMIT 1`
    );
    const lastAt = lastResult.rows[0]?.created_at;
    const lastStr = lastAt ? new Date(lastAt).toISOString() : "never";
    const { sendCriticalApiAlert } = await import("./adminAlertService");
    const sent = await sendCriticalApiAlert({
      apiName: "Recap Pipeline",
      errorType: "Recap Stall Detected",
      errorMessage: `No new episode recaps have been created in the last ${STALL_THRESHOLD_HOURS} hours. Last recap was created at ${lastStr}. This may indicate an issue with Taddy, OpenAI, or the transcript pipeline.`,
      severity: "critical",
      adminPath: "/admin/internal-tools/alerts",
      footerText: "You will not receive another alert until this stall resolves.",
    });
    if (sent) {
      stallAlertSent = true;
      console.log("[ProdRecap] Stall alert sent — flag set, no further alerts until resolved");
    } else {
      console.warn("[ProdRecap] Stall alert email failed to send — will retry next interval");
    }
  } catch (err) {
    console.error("[ProdRecap] Stall check error:", err);
  }
}

// ── NPR News Now ingestion monitor ──────────────────────────────────────────
// NPR News Now (iTunes ID 121493675) publishes every hour on the hour.
// We run this check every 30 minutes. If our most recent transcript for that
// podcast is older than 90 minutes we fire a high-severity alert — that means
// we likely missed at least one episode, either because Taddy's webhook failed
// or because our transcript pipeline stalled on this specific show.
const NPR_NEWS_NOW_ITUNES_ID = "121493675";
const NPR_INGESTION_THRESHOLD_MINUTES = 90;
const NPR_GRACE_PERIOD_MINUTES = 120; // don't alert if podcast was just approved

let nprIngestionAlertSent = false;

async function checkNprNewsNowIngestion() {
  try {
    const { rows: pdRows } = await pool.query(
      `SELECT status, has_landing_page, updated_at FROM podcast_directory WHERE itunes_id = $1 LIMIT 1`,
      [NPR_NEWS_NOW_ITUNES_ID]
    );
    const pd = pdRows[0];
    if (!pd || pd.status !== "published") return;

    const minutesSincePublished = pd.updated_at
      ? (Date.now() - new Date(pd.updated_at).getTime()) / 60000
      : Infinity;
    if (minutesSincePublished < NPR_GRACE_PERIOD_MINUTES) {
      console.log(`[NPRMonitor] Podcast recently published (${Math.round(minutesSincePublished)}m ago), skipping check`);
      return;
    }

    const { rows } = await pool.query(
      `SELECT et.episode_title, et.date_published, et.fetched_at,
              lpr.id AS recap_id, lpr.created_at AS recap_created_at
       FROM episode_transcripts et
       LEFT JOIN landing_page_recaps lpr
         ON lpr.itunes_id = et.podcast_id
        AND (lower(trim(lpr.episode_title)) = lower(trim(et.episode_title))
          OR lpr.episode_slug = lower(regexp_replace(trim(et.episode_title), '[^a-zA-Z0-9]+', '-', 'g')))
       WHERE et.podcast_id = $1
       ORDER BY et.fetched_at DESC
       LIMIT 1`,
      [NPR_NEWS_NOW_ITUNES_ID]
    );

    if (rows.length === 0) {
      if (nprIngestionAlertSent) {
        console.log("[NPRMonitor] Still no transcripts for NPR News Now");
        return;
      }
      const { sendCriticalApiAlert } = await import("./adminAlertService");
      const sent = await sendCriticalApiAlert({
        apiName: "NPR News Now Monitor",
        errorType: "No Episodes Ingested",
        errorMessage: `NPR News Now (publishes every hour) has been live for ${Math.round(minutesSincePublished)} minutes but has zero transcripts in our system. The Taddy webhook may not be delivering episodes for this podcast. Check the webhook logs and confirm Taddy is tracking iTunes ID ${NPR_NEWS_NOW_ITUNES_ID}.`,
        severity: "high",
        adminPath: "/podcast/npr-news-now",
        footerText: "You will not receive another alert until a new episode is detected.",
      });
      if (sent) {
        nprIngestionAlertSent = true;
        console.log("[NPRMonitor] No-transcripts alert sent for NPR News Now");
      }
      return;
    }

    const latest = rows[0];
    const latestFetchedAt = new Date(latest.fetched_at).getTime();
    const minutesSinceLastEpisode = (Date.now() - latestFetchedAt) / 60000;

    if (minutesSinceLastEpisode <= NPR_INGESTION_THRESHOLD_MINUTES) {
      if (nprIngestionAlertSent) {
        console.log("[NPRMonitor] NPR News Now ingestion recovered — resetting alert flag");
      }
      nprIngestionAlertSent = false;
      return;
    }

    if (nprIngestionAlertSent) {
      console.log(`[NPRMonitor] Stall persists — ${Math.round(minutesSinceLastEpisode)}m since last NPR News Now episode`);
      return;
    }

    const lastTitle = latest.episode_title || "Unknown";
    const lastFetchedStr = new Date(latest.fetched_at).toUTCString();
    const hasRecap = !!latest.recap_id;
    const recapStr = hasRecap
      ? `Recap was generated at ${new Date(latest.recap_created_at).toUTCString()}.`
      : "No recap has been generated for the last episode yet.";

    const { sendCriticalApiAlert } = await import("./adminAlertService");
    const sent = await sendCriticalApiAlert({
      apiName: "NPR News Now Monitor",
      errorType: "Episode Ingestion Stall",
      errorMessage: `NPR News Now (publishes every hour) has not delivered a new episode in ${Math.round(minutesSinceLastEpisode)} minutes — we should have seen at least ${Math.floor(minutesSinceLastEpisode / 60)} new episode(s) by now.\n\nLast episode ingested: "${lastTitle}" at ${lastFetchedStr}.\n${recapStr}\n\nPossible causes: Taddy webhook not firing, transcript fetch failure, or NPR changed their publish schedule.`,
      severity: "high",
      adminPath: "/podcast/npr-news-now",
      footerText: "You will not receive another alert until a new episode is detected.",
    });
    if (sent) {
      nprIngestionAlertSent = true;
      console.log(`[NPRMonitor] Ingestion stall alert sent — ${Math.round(minutesSinceLastEpisode)}m since last episode`);
    } else {
      console.warn("[NPRMonitor] Failed to send ingestion stall alert — will retry next interval");
    }
  } catch (err) {
    console.error("[NPRMonitor] Check error:", err);
  }
}

export function startProductionRecapScheduler() {
  if (process.env.NODE_ENV !== "production") {
    console.log("[ProdRecap] Not in production, skipping scheduler");
    return;
  }

  console.log(`[ProdRecap] Starting scheduler (every ${INTERVAL_MS / 60000} min, ${BATCH_SIZE} episodes/batch)`);

  setTimeout(async () => {
    await cleanupDuplicateRecaps();
    runBatch();
    setInterval(runBatch, INTERVAL_MS);

    catchUpMissingHeadlines();
    setInterval(catchUpMissingHeadlines, HEADLINE_CATCHUP_INTERVAL_MS);

    checkRecapStall();
    setInterval(checkRecapStall, STALL_CHECK_INTERVAL_MS);

    checkNprNewsNowIngestion();
    setInterval(checkNprNewsNowIngestion, STALL_CHECK_INTERVAL_MS);
  }, 120_000);
}
