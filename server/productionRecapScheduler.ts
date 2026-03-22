import { pool } from "./db";
import { storage } from "./storage";
import { generateRecapFromFullTranscript } from "./recapGenerator";
import { ITUNES_ID_TO_SLUG } from "./podcastLandingMap";

const INTERVAL_MS = 5 * 60 * 1000;
const HEADLINE_CATCHUP_INTERVAL_MS = 15 * 60 * 1000;
const BATCH_SIZE = 3;
const PER_PODCAST = 3;
// 3 episodes × 4min timeout + 30s delays + buffer = ~14min minimum, set to 20min for headroom
const BATCH_TIMEOUT_MS = 20 * 60 * 1000;
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

      const epTitle = ep.episode_title || "Untitled";
      const epSlug = epTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 200);
      const episodeTimeout = new Promise<ProcessEpisodeResult>((resolve) => setTimeout(async () => {
        console.warn(`[ProdRecap] Episode timed out after 4min: "${epTitle.slice(0, 60)}"`);
        try {
          await pool.query(
            `INSERT INTO landing_page_recaps (user_id, podcast_slug, episode_slug, episode_title, podcast_name, source, status, recap)
             VALUES (NULL, $1, $2, $3, $4, 'production_scheduler', 'generation_failed', $5)
             ON CONFLICT DO NOTHING`,
            [podcastSlug, epSlug, epTitle, podcastName, "Timed out after 4 minutes"]
          );
        } catch {}
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

// ── Active Episode Catch-Up Scanner ─────────────────────────────────────────
// Runs every 2 hours. For every published podcast that hasn't received a new
// transcript in the last 3 hours, we proactively ask Taddy for its most recent
// episodes and save any transcripts that are missing from our DB.
// This is the primary safety net against Taddy webhook delays or drops —
// we NEVER rely solely on incoming webhooks for critical content.

const CATCHUP_SCAN_INTERVAL_MS = 2 * 60 * 60 * 1000;
const CATCHUP_SCAN_STALENESS_HOURS = 3;
const CATCHUP_SCAN_EPISODE_LIMIT = 3;
const CATCHUP_SCAN_MAX_PODCASTS = 60;
const CATCHUP_INTER_PODCAST_DELAY_MS = 400;
let catchupScanRunning = false;

async function runCatchupScan() {
  if (catchupScanRunning) {
    console.log("[CatchupScan] Already running, skipping");
    return;
  }
  catchupScanRunning = true;

  try {
    const { isTaddyBudgetExhausted, getEpisodesByItunesId, getEpisodeTranscript } = await import("./taddyClient");

    if (isTaddyBudgetExhausted()) {
      console.log("[CatchupScan] Taddy budget exhausted, skipping scan");
      return;
    }

    const stalenessThreshold = new Date(Date.now() - CATCHUP_SCAN_STALENESS_HOURS * 3600 * 1000).toISOString();

    const { rows: stalePodcasts } = await pool.query(
      `SELECT pd.itunes_id, pd.name, pd.slug,
              MAX(et.fetched_at) as last_fetched
       FROM podcast_directory pd
       LEFT JOIN episode_transcripts et ON et.podcast_id = pd.itunes_id
       WHERE pd.status = 'published'
       GROUP BY pd.itunes_id, pd.name, pd.slug
       HAVING MAX(et.fetched_at) IS NULL
           OR MAX(et.fetched_at) < $1
       ORDER BY MAX(et.fetched_at) ASC NULLS FIRST
       LIMIT $2`,
      [stalenessThreshold, CATCHUP_SCAN_MAX_PODCASTS]
    );

    if (stalePodcasts.length === 0) {
      console.log("[CatchupScan] All podcasts are current, no catch-up needed");
      return;
    }

    console.log(`[CatchupScan] Checking ${stalePodcasts.length} podcast(s) for missed episodes`);
    let recovered = 0;
    let apiErrors = 0;

    for (const podcast of stalePodcasts) {
      if (isTaddyBudgetExhausted()) {
        console.log("[CatchupScan] Budget exhausted mid-scan, stopping");
        break;
      }

      try {
        const episodes = await getEpisodesByItunesId(
          podcast.itunes_id,
          CATCHUP_SCAN_EPISODE_LIMIT,
          podcast.name
        );

        if (!episodes || episodes.length === 0) continue;

        for (const ep of episodes) {
          if (!ep.uuid || !ep.name) continue;

          const { rows: existing } = await pool.query(
            `SELECT id FROM episode_transcripts WHERE episode_guid = $1 LIMIT 1`,
            [ep.uuid]
          );
          if (existing.length > 0) continue;

          if (isTaddyBudgetExhausted()) break;

          const transcript = await getEpisodeTranscript(ep.uuid);
          if (!transcript) continue;

          const datePublished = ep.datePublished
            ? Math.floor(ep.datePublished)
            : null;

          await pool.query(
            `INSERT INTO episode_transcripts
               (podcast_id, episode_guid, episode_title, transcript, audio_url, date_published, fetched_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (episode_guid) DO NOTHING`,
            [podcast.itunes_id, ep.uuid, ep.name, transcript, ep.audioUrl || null, datePublished]
          );

          recovered++;
          console.log(`[CatchupScan] Recovered missed episode: "${ep.name?.slice(0, 60)}" (${podcast.name})`);
        }

        await new Promise(r => setTimeout(r, CATCHUP_INTER_PODCAST_DELAY_MS));
      } catch (err: any) {
        console.error(`[CatchupScan] Error checking "${podcast.name}": ${err.message}`);
        apiErrors++;
      }
    }

    const summary = `${recovered} episode(s) recovered, ${apiErrors} error(s)`;
    console.log(`[CatchupScan] Complete — ${summary}`);

    if (recovered > 0) {
      console.log("[CatchupScan] Triggering recap batch for recovered episodes");
      runBatch().catch((e: any) => console.error("[CatchupScan] Post-recovery batch error:", e.message));
    }
  } catch (err: any) {
    console.error(`[CatchupScan] Fatal error: ${err.message}`, err.stack);
  } finally {
    catchupScanRunning = false;
  }
}

// ── Recap Pipeline Health Monitor ───────────────────────────────────────────
// Runs every 30 minutes. Two alert modes:
//
//   CRITICAL — transcripts are in the DB but the recap scheduler isn't
//              processing them. Something is broken in our own code.
//
//   WARNING  — no new recaps in 5+ hours during active hours (8am–11pm UTC),
//              and no pending transcripts. Likely means Taddy hasn't delivered
//              today's episodes yet (or the catch-up scanner is still running).

const RECAP_HEALTH_INTERVAL_MS = 30 * 60 * 1000;
const RECAP_STALL_WARNING_HOURS = 5;
let recapStallAlertSent = false;

async function checkRecapPipelineHealth() {
  try {
    const { rows: [latestRow] } = await pool.query(
      `SELECT MAX(created_at) as latest FROM landing_page_recaps`
    );
    const latestRecapAt = latestRow?.latest ? new Date(latestRow.latest).getTime() : 0;
    const hoursSinceLastRecap = (Date.now() - latestRecapAt) / 3600000;

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const processingGracePeriod = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { rows: [pendingRow] } = await pool.query(
      `SELECT COUNT(*) as cnt, MIN(et.fetched_at) as oldest
       FROM episode_transcripts et
       INNER JOIN podcast_directory pd ON pd.itunes_id = et.podcast_id AND pd.status = 'published'
       WHERE et.transcript IS NOT NULL AND et.transcript != ''
         AND et.date_published IS NOT NULL
         AND et.date_published >= EXTRACT(EPOCH FROM $1::timestamptz)::int
         AND et.fetched_at < $2
         AND NOT EXISTS (
           SELECT 1 FROM landing_page_recaps lpr
           WHERE lpr.itunes_id = et.podcast_id
             AND lower(trim(lpr.episode_title)) = lower(trim(et.episode_title))
         )`,
      [threeDaysAgo, processingGracePeriod]
    );

    const pendingCount = parseInt(pendingRow?.cnt || "0", 10);
    const oldestPending = pendingRow?.oldest;

    if (pendingCount > 0 && hoursSinceLastRecap >= 1) {
      const oldestAgeMin = oldestPending
        ? Math.round((Date.now() - new Date(oldestPending).getTime()) / 60000)
        : 0;

      if (!recapStallAlertSent) {
        const { sendCriticalApiAlert } = await import("./adminAlertService");
        const sent = await sendCriticalApiAlert({
          apiName: "Recap Pipeline Monitor",
          errorType: "Transcripts Not Being Processed",
          errorMessage: `${pendingCount} episode transcript(s) have been in the database for 30+ minutes but no recap has been generated in ${Math.round(hoursSinceLastRecap * 10) / 10} hours. The oldest pending transcript is ${oldestAgeMin} minutes old. The recap scheduler may be stuck or failing silently. Last successful recap: ${latestRecapAt ? new Date(latestRecapAt).toUTCString() : "never"}.`,
          severity: "critical",
          adminPath: "/admin",
          footerText: "This alert will reset automatically once a new recap is generated.",
        });
        if (sent) {
          recapStallAlertSent = true;
          console.log(`[RecapHealth] CRITICAL alert sent — ${pendingCount} transcripts pending, ${Math.round(hoursSinceLastRecap * 10) / 10}h since last recap`);
        }
      }
      return;
    }

    const utcHour = new Date().getUTCHours();
    const isActiveHours = utcHour >= 8 && utcHour < 23;

    if (hoursSinceLastRecap >= RECAP_STALL_WARNING_HOURS && isActiveHours && !recapStallAlertSent) {
      const { sendCriticalApiAlert } = await import("./adminAlertService");
      const sent = await sendCriticalApiAlert({
        apiName: "Recap Pipeline Monitor",
        errorType: "Recap Generation Stall",
        errorMessage: `No new recaps have been generated in ${Math.round(hoursSinceLastRecap * 10) / 10} hours (since ${latestRecapAt ? new Date(latestRecapAt).toUTCString() : "startup"}). There are currently no ready-to-process transcripts in the database, which means Taddy has not yet delivered transcripts for today's episodes. The catch-up scanner runs every 2 hours and will proactively fetch any missed episodes. If this persists beyond 8 hours, check Taddy webhook delivery.`,
        severity: "warning",
        adminPath: "/admin",
        footerText: "This alert will reset automatically once a new recap is generated.",
      });
      if (sent) {
        recapStallAlertSent = true;
        console.log(`[RecapHealth] Warning sent — ${Math.round(hoursSinceLastRecap * 10) / 10}h stall, no pending transcripts`);
      }
      return;
    }

    if (recapStallAlertSent && hoursSinceLastRecap < 1) {
      console.log("[RecapHealth] Pipeline recovered — resetting alert flag");
      recapStallAlertSent = false;
    }
  } catch (err: any) {
    console.error(`[RecapHealth] Check error: ${err.message}`, err.stack);
  }
}

const STALL_CHECK_INTERVAL_MS = 30 * 60 * 1000;

// ── NPR News Now ingestion monitor ──────────────────────────────────────────
const NPR_NEWS_NOW_ITUNES_ID = "121493675";
const NPR_INGESTION_THRESHOLD_MINUTES = 90;
const NPR_GRACE_PERIOD_MINUTES = 120;

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
        severity: "critical",
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
      severity: "critical",
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

async function runMissedEpisodeCatchup() {
  console.log("[MissedCatchup] Starting one-time 7-day backfill scan...");
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const cutoffTimestamp = Math.floor(sevenDaysAgo.getTime() / 1000);

    const { rows: episodes } = await pool.query(
      `WITH ranked AS (
         SELECT et.id, et.podcast_id, et.episode_title, et.transcript, et.description,
                et.date_published, et.duration, et.audio_url, et.image_url, et.fetched_at,
                ROW_NUMBER() OVER (PARTITION BY et.podcast_id ORDER BY et.date_published DESC) AS rn
         FROM episode_transcripts et
         INNER JOIN podcast_directory pd ON pd.itunes_id = et.podcast_id AND pd.status = 'published'
         WHERE et.transcript IS NOT NULL AND et.transcript != ''
           AND et.date_published IS NOT NULL
           AND et.date_published >= $1
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
       WHERE rn <= $2
       ORDER BY date_published DESC`,
      [cutoffTimestamp, PER_PODCAST]
    );

    if (episodes.length === 0) {
      console.log("[MissedCatchup] No missed episodes found — all clear.");
      return;
    }

    console.log(`[MissedCatchup] Found ${episodes.length} missed episode(s) to backfill.`);
    let generated = 0;
    let failed = 0;

    for (const ep of episodes) {
      const info = await getPodcastInfo(ep.podcast_id);
      if (!info) {
        console.log(`[MissedCatchup] Skip: no podcast info for itunesId=${ep.podcast_id}`);
        failed++;
        continue;
      }

      const podcastSlug = ITUNES_ID_TO_SLUG[ep.podcast_id] || info.slug || info.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);

      console.log(`[MissedCatchup] Processing: "${ep.episode_title?.slice(0, 60)}" (${info.name})`);

      const processPromise = processEpisode(ep, podcastSlug, info.name, ep.podcast_id, info.hosts || "", info.artwork_url || "");
      const mcEpTitle = ep.episode_title || "Untitled";
      const mcEpSlug = mcEpTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 200);
      const episodeTimeout = new Promise<ProcessEpisodeResult>((resolve) => setTimeout(async () => {
        console.warn(`[MissedCatchup] Episode timed out after 4min: "${mcEpTitle.slice(0, 60)}"`);
        try {
          await pool.query(
            `INSERT INTO landing_page_recaps (user_id, podcast_slug, episode_slug, episode_title, podcast_name, source, status, recap)
             VALUES (NULL, $1, $2, $3, $4, 'production_scheduler', 'generation_failed', $5)
             ON CONFLICT DO NOTHING`,
            [podcastSlug, mcEpSlug, mcEpTitle, info.name, "Timed out after 4 minutes"]
          );
        } catch {}
        resolve({ success: false });
      }, 4 * 60 * 1000));
      const result = await Promise.race([processPromise, episodeTimeout]);

      if (result.success) generated++;
      else failed++;

      if (episodes.indexOf(ep) < episodes.length - 1) {
        await new Promise(r => setTimeout(r, 30_000));
      }
    }

    console.log(`[MissedCatchup] Done: ${generated} generated, ${failed} failed`);
  } catch (err: any) {
    console.error("[MissedCatchup] Error:", err.message);
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

    checkNprNewsNowIngestion();
    setInterval(checkNprNewsNowIngestion, STALL_CHECK_INTERVAL_MS);

    checkRecapPipelineHealth();
    setInterval(checkRecapPipelineHealth, RECAP_HEALTH_INTERVAL_MS);

    setTimeout(() => {
      runCatchupScan();
      setInterval(runCatchupScan, CATCHUP_SCAN_INTERVAL_MS);
    }, 10 * 60 * 1000);

    setTimeout(() => {
      runMissedEpisodeCatchup();
    }, 3 * 60 * 1000);
  }, 120_000);
}
