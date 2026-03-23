import { pool } from "./db";
import { storage } from "./storage";
import { generateRecapFromFullTranscript } from "./recapGenerator";
import { ITUNES_ID_TO_SLUG } from "./podcastLandingMap";

const TRANSCRIPT_FETCH_INTERVAL_MS = 90 * 1000;
const RECAP_GENERATION_INTERVAL_MS = 5 * 60 * 1000;
const HEADLINE_CATCHUP_INTERVAL_MS = 15 * 60 * 1000;
const EPISODE_TIMEOUT_MS = 15 * 60 * 1000;
const HEADLINE_RETRY_COUNT = 2;
const HEADLINE_RETRY_DELAY_MS = 3000;
const PER_PODCAST = 1;

let isSchedulerStarted = false;

let transcriptFetcherBusy = false;
let transcriptFetcherLastRunAt = 0;
let transcriptFetcherNextRunAt = 0;
let currentlyFetchingEpisode: { guid: string; title: string; podcastName: string } | null = null;

let recapGeneratorBusy = false;
let recapGeneratorLastRunAt = 0;
let recapGeneratorNextRunAt = 0;
let currentlyGeneratingEpisode: { guid: string; title: string; podcastName: string } | null = null;

let currentlyGeneratingGuid: string | null = null;
let currentlyGeneratingTitle: string | null = null;

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

async function fetchOneTranscript() {
  if (transcriptFetcherBusy) return;

  const { rows: flagRows } = await pool.query(
    `SELECT enabled FROM feature_flags WHERE key = 'pipeline_transcript_fetch_enabled' LIMIT 1`
  );
  if (flagRows.length > 0 && flagRows[0].enabled === false) {
    return;
  }

  transcriptFetcherBusy = true;
  transcriptFetcherLastRunAt = Date.now();

  try {
    const { rows } = await pool.query(
      `SELECT id, podcast_id, podcast_name, episode_guid, episode_title, taddy_uuid, attempts, date_published
       FROM pending_transcript_queue
       WHERE status IN ('queued', 'pending')
       ORDER BY priority ASC, created_at ASC
       LIMIT 1`
    );

    if (rows.length === 0) return;

    const item = rows[0];
    console.log(`[Pipeline] Fetching transcript: "${item.episode_title?.slice(0, 60)}" (${item.podcast_name})`);

    currentlyFetchingEpisode = {
      guid: item.episode_guid,
      title: item.episode_title,
      podcastName: item.podcast_name,
    };

    await pool.query(
      `UPDATE pending_transcript_queue SET status = 'fetching', last_attempt_at = NOW() WHERE id = $1`,
      [item.id]
    );

    const { getEpisodeTranscript, isTaddyBudgetExhausted } = await import("./taddyClient");

    if (isTaddyBudgetExhausted()) {
      console.log(`[Pipeline] Taddy budget exhausted, keeping "${item.episode_title?.slice(0, 60)}" in queue`);
      await pool.query(
        `UPDATE pending_transcript_queue SET status = 'queued' WHERE id = $1`,
        [item.id]
      );
      return;
    }

    const transcript = await getEpisodeTranscript(item.episode_guid);

    if (!transcript) {
      const newAttempts = (item.attempts || 0) + 1;
      if (newAttempts >= 5) {
        await pool.query(
          `UPDATE pending_transcript_queue SET status = 'failed', attempts = $2, error_message = 'No transcript available after 5 attempts' WHERE id = $1`,
          [item.id, newAttempts]
        );
        console.log(`[Pipeline] No transcript after ${newAttempts} attempts: "${item.episode_title?.slice(0, 60)}"`);
      } else {
        await pool.query(
          `UPDATE pending_transcript_queue SET status = 'queued', attempts = $2 WHERE id = $1`,
          [item.id, newAttempts]
        );
        console.log(`[Pipeline] No transcript yet (attempt ${newAttempts}/5): "${item.episode_title?.slice(0, 60)}"`);
      }
      return;
    }

    const { rows: epRows } = await pool.query(
      `SELECT id FROM episode_transcripts WHERE episode_guid = $1 LIMIT 1`,
      [item.episode_guid]
    );

    const podcast = await getPodcastInfo(item.podcast_id);

    if (epRows.length === 0) {
      let datePublished: number | null = item.date_published ? Number(item.date_published) : null;
      if (!datePublished) {
        try {
          const { getEpisodesByItunesId } = await import("./taddyClient");
          const episodes = await getEpisodesByItunesId(item.podcast_id, 5, item.podcast_name);
          const match = episodes?.find((e: any) => e.uuid === item.episode_guid);
          if (match?.datePublished) {
            datePublished = Math.floor(match.datePublished);
          }
        } catch {}
      }

      await pool.query(
        `INSERT INTO episode_transcripts (podcast_id, episode_guid, episode_title, transcript, fetched_at, date_published)
         VALUES ($1, $2, $3, $4, NOW(), $5)
         ON CONFLICT (episode_guid) DO UPDATE SET transcript = EXCLUDED.transcript, fetched_at = NOW(), date_published = COALESCE(EXCLUDED.date_published, episode_transcripts.date_published)`,
        [item.podcast_id, item.episode_guid, item.episode_title, transcript, datePublished]
      );
    } else {
      await pool.query(
        `UPDATE episode_transcripts SET transcript = $1, fetched_at = NOW() WHERE episode_guid = $2`,
        [transcript, item.episode_guid]
      );
    }

    await pool.query(
      `UPDATE pending_transcript_queue SET status = 'transcript_ready', attempts = attempts + 1, last_attempt_at = NOW() WHERE id = $1`,
      [item.id]
    );

    console.log(`[Pipeline] Transcript saved: "${item.episode_title?.slice(0, 60)}" (${item.podcast_name})`);
  } catch (err: any) {
    console.error(`[Pipeline] Transcript fetch error: ${err.message}`);
    // Reset any item left in 'fetching' so it can be retried on the next tick
    try {
      await pool.query(
        `UPDATE pending_transcript_queue
         SET status = 'queued', attempts = COALESCE(attempts, 0) + 1,
             error_message = $1, last_attempt_at = NOW()
         WHERE status = 'fetching'`,
        [`Uncaught error: ${err.message?.slice(0, 200)}`]
      );
    } catch (resetErr: any) {
      console.error(`[Pipeline] Failed to reset stuck fetching item: ${resetErr.message}`);
    }
  } finally {
    transcriptFetcherBusy = false;
    currentlyFetchingEpisode = null;
    transcriptFetcherNextRunAt = Date.now() + TRANSCRIPT_FETCH_INTERVAL_MS;
  }
}

async function generateOneRecap() {
  if (recapGeneratorBusy) return;

  const { rows: flagRows } = await pool.query(
    `SELECT enabled FROM feature_flags WHERE key = 'pipeline_recap_generation_enabled' LIMIT 1`
  );
  if (flagRows.length > 0 && flagRows[0].enabled === false) {
    return;
  }

  recapGeneratorBusy = true;
  recapGeneratorLastRunAt = Date.now();

  try {
    const { rows } = await pool.query(
      `SELECT ptq.id, ptq.podcast_id, ptq.podcast_name, ptq.episode_guid, ptq.episode_title,
              et.transcript, et.description, et.date_published, et.duration, et.audio_url, et.image_url
       FROM pending_transcript_queue ptq
       INNER JOIN episode_transcripts et ON et.episode_guid = ptq.episode_guid
       WHERE ptq.status = 'transcript_ready'
         AND et.transcript IS NOT NULL AND et.transcript != ''
       ORDER BY ptq.priority ASC, ptq.created_at ASC
       LIMIT 1`
    );

    if (rows.length === 0) return;

    const item = rows[0];
    const podcast = await getPodcastInfo(item.podcast_id);

    // Fall back to queue metadata for podcasts not in the directory
    const podcastName = podcast?.name || item.podcast_name || "Unknown Podcast";
    const podcastSlug = ITUNES_ID_TO_SLUG[item.podcast_id] || podcast?.slug || podcastName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
    const epTitle = item.episode_title || "Untitled";
    const epSlug = makeEpisodeSlug(epTitle);

    const { rows: existingRows } = await pool.query(
      `SELECT id FROM landing_page_recaps
       WHERE itunes_id = $1
         AND (
           (episode_guid IS NOT NULL AND episode_guid = $2)
           OR (episode_guid IS NULL AND lower(trim(episode_title)) = lower(trim($3)))
         )
       LIMIT 1`,
      [item.podcast_id, item.episode_guid, epTitle]
    );
    if (existingRows.length > 0) {
      console.log(`[Pipeline] Recap already exists: "${epTitle.slice(0, 60)}"`);
      await pool.query(
        `UPDATE pending_transcript_queue SET status = 'completed' WHERE id = $1`,
        [item.id]
      );
      return;
    }

    console.log(`[Pipeline] Generating recap: "${epTitle.slice(0, 60)}" (${podcastName})`);
    currentlyGeneratingEpisode = { guid: item.episode_guid, title: epTitle, podcastName };
    currentlyGeneratingGuid = item.episode_guid;
    currentlyGeneratingTitle = epTitle;

    await pool.query(
      `UPDATE pending_transcript_queue SET status = 'generating_recap', last_attempt_at = NOW() WHERE id = $1`,
      [item.id]
    );

    const recapPromise = generateRecapFromFullTranscript(
      item.transcript, podcastName, epTitle, item.description || null
    );
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), EPISODE_TIMEOUT_MS));
    const recap = await Promise.race([recapPromise, timeoutPromise]);

    if (!recap) {
      console.log(`[Pipeline] Recap generation failed/timed out: "${epTitle.slice(0, 60)}"`);
      await pool.query(
        `UPDATE pending_transcript_queue SET status = 'failed', error_message = 'Recap generation failed or timed out' WHERE id = $1`,
        [item.id]
      );
      return;
    }

    const publishDate = item.date_published
      ? new Date(item.date_published * 1000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    let tabloidHeadline: string | null = null;
    let tabloidSubHeadline: string | null = null;
    try {
      const { generateTabloidHeadline } = await import("./emailScheduler");
      for (let attempt = 1; attempt <= HEADLINE_RETRY_COUNT + 1; attempt++) {
        try {
          const headlinePromise = generateTabloidHeadline(epTitle, podcastName, "", recap.whatHappened, recap.keyInsights || []);
          const headlineTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 30_000));
          const result = await Promise.race([headlinePromise, headlineTimeout]);
          if (result) {
            tabloidHeadline = result.tabloidHeadline;
            tabloidSubHeadline = result.tabloidSubHeadline;
            break;
          }
        } catch (headlineErr: any) {
          console.warn(`[Pipeline] Headline attempt ${attempt} failed: ${headlineErr.message}`);
        }
        if (attempt <= HEADLINE_RETRY_COUNT) await new Promise(r => setTimeout(r, HEADLINE_RETRY_DELAY_MS));
      }
    } catch {}

    if (!tabloidHeadline) {
      console.warn(`[Pipeline] No headline generated for "${epTitle.slice(0, 60)}" — recap will publish without one; catchUpMissingHeadlines will backfill it`);
    }

    const upsertedRecap = await storage.upsertLandingPageRecap({
      slug: podcastSlug,
      itunesId: item.podcast_id,
      podcastName,
      episodeTitle: epTitle,
      episodeSlug: epSlug,
      publishDate,
      episodeGuid: item.episode_guid || null,
      duration: item.duration ? String(item.duration) : null,
      artworkUrl: podcast?.artwork_url || "",
      hosts: podcast?.hosts || "",
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
      showNotes: item.description || null,
      published: true,
    });

    if (upsertedRecap?.id) {
      try {
        const { validateAndEnrichRecap } = await import("./recapValidator");
        await validateAndEnrichRecap(
          upsertedRecap.id, podcastSlug, upsertedRecap.episodeSlug, podcastName,
          epTitle, item.podcast_id, item.transcript || null, podcast?.hosts || null
        );
      } catch (valErr) {
        console.warn(`[Pipeline] Validation failed for "${epTitle.slice(0, 50)}":`, valErr);
      }
    }

    await pool.query(
      `UPDATE pending_transcript_queue SET status = 'completed', last_attempt_at = NOW() WHERE id = $1`,
      [item.id]
    );

    console.log(`[Pipeline] Published: "${epTitle.slice(0, 60)}" (${podcastName})`);
  } catch (err: any) {
    console.error(`[Pipeline] Recap generation error: ${err.message}`);
    // Reset any item left in 'generating_recap' so it can be retried on the next tick
    try {
      await pool.query(
        `UPDATE pending_transcript_queue
         SET status = 'transcript_ready',
             error_message = $1, last_attempt_at = NOW()
         WHERE status = 'generating_recap'`,
        [`Uncaught error: ${err.message?.slice(0, 200)}`]
      );
    } catch (resetErr: any) {
      console.error(`[Pipeline] Failed to reset stuck generating_recap item: ${resetErr.message}`);
    }
  } finally {
    recapGeneratorBusy = false;
    currentlyGeneratingEpisode = null;
    currentlyGeneratingGuid = null;
    currentlyGeneratingTitle = null;
    recapGeneratorNextRunAt = Date.now() + RECAP_GENERATION_INTERVAL_MS;
  }
}

export function getSchedulerStatus() {
  return {
    isSchedulerStarted,
    batchRunning: recapGeneratorBusy,
    batchStartedAt: recapGeneratorLastRunAt,
    lastSuccessfulBatchAt: recapGeneratorLastRunAt,
    currentlyGeneratingGuid,
    currentlyGeneratingTitle,
  };
}

export function getPipelineStatus() {
  return {
    isSchedulerStarted,
    transcriptFetcher: {
      busy: transcriptFetcherBusy,
      lastRunAt: transcriptFetcherLastRunAt,
      nextRunAt: transcriptFetcherNextRunAt,
      currentEpisode: currentlyFetchingEpisode,
      intervalMs: TRANSCRIPT_FETCH_INTERVAL_MS,
    },
    recapGenerator: {
      busy: recapGeneratorBusy,
      lastRunAt: recapGeneratorLastRunAt,
      nextRunAt: recapGeneratorNextRunAt,
      currentEpisode: currentlyGeneratingEpisode,
      intervalMs: RECAP_GENERATION_INTERVAL_MS,
    },
  };
}

export async function triggerRecapBatch() {
  return generateOneRecap();
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
        return true;
      }
    } catch (headlineErr: any) {
      console.error(`[Pipeline] Tabloid headline error (attempt ${attempt}): ${headlineErr.message}`);
    }
    if (attempt <= HEADLINE_RETRY_COUNT) {
      await new Promise(r => setTimeout(r, HEADLINE_RETRY_DELAY_MS));
    }
  }
  return false;
}

async function catchUpMissingHeadlines() {
  if (catchUpRunning) return;
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

    if (rows.length === 0) return;

    console.log(`[Pipeline] Headline catch-up: ${rows.length} recap(s) missing headlines`);
    let success = 0;
    for (const row of rows) {
      const keyInsights = Array.isArray(row.key_insights) ? row.key_insights : [];
      const result = await generateTabloidHeadlineWithRetry(row.id, row.episode_title, row.podcast_name, row.what_happened, keyInsights);
      if (result) success++;
      await new Promise(r => setTimeout(r, 2000));
    }
    console.log(`[Pipeline] Headline catch-up: ${success}/${rows.length} generated`);
  } catch (err: any) {
    console.error(`[Pipeline] Headline catch-up error: ${err.message}`);
  } finally {
    catchUpRunning = false;
  }
}

async function cleanupDuplicateRecaps() {
  try {
    // Prefer records WITH episode_guid over title-only records.
    // When both or neither have a guid, keep the older record (lower id).
    const { rows } = await pool.query(`
      DELETE FROM landing_page_recaps
      WHERE id IN (
        SELECT
          CASE
            WHEN newer.episode_guid IS NOT NULL AND older.episode_guid IS NULL THEN older.id
            ELSE newer.id
          END
        FROM landing_page_recaps older
        JOIN landing_page_recaps newer
          ON newer.itunes_id = older.itunes_id
         AND lower(trim(newer.episode_title)) = lower(trim(older.episode_title))
         AND newer.id > older.id
        WHERE newer.created_at >= NOW() - INTERVAL '7 days'
      )
      RETURNING id, episode_title
    `);
    if (rows.length > 0) {
      console.log(`[Pipeline] Cleaned up ${rows.length} duplicate recap(s)`);
    }
  } catch (err: any) {
    console.error(`[Pipeline] Duplicate cleanup error: ${err.message}`);
  }
}

async function cleanupCompletedQueueItems() {
  try {
    const { rows } = await pool.query(`
      DELETE FROM pending_transcript_queue
      WHERE status = 'completed' AND created_at < NOW() - INTERVAL '7 days'
      RETURNING id
    `);
    if (rows.length > 0) {
      console.log(`[Pipeline] Cleaned up ${rows.length} completed queue item(s)`);
    }
  } catch {}
}

const CATCHUP_SCAN_INTERVAL_MS = 30 * 60 * 1000;
const CATCHUP_SCAN_STALENESS_HOURS = 1;
const CATCHUP_SCAN_EPISODE_LIMIT = 10;
const CATCHUP_SCAN_MAX_PODCASTS = 300;
const CATCHUP_INTER_PODCAST_DELAY_MS = 400;
const CATCHUP_MAX_EPISODE_AGE_DAYS = 5;
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
       ORDER BY MAX(et.fetched_at) DESC NULLS LAST
       LIMIT $2`,
      [stalenessThreshold, CATCHUP_SCAN_MAX_PODCASTS]
    );

    if (stalePodcasts.length === 0) {
      console.log("[CatchupScan] All podcasts are current");
      return;
    }

    console.log(`[CatchupScan] Checking ${stalePodcasts.length} podcast(s) for missed episodes (limit ${CATCHUP_SCAN_EPISODE_LIMIT} eps each)`);
    let queued = 0;
    let skippedHasTranscript = 0;
    let skippedInQueue = 0;
    let skippedTooOld = 0;
    let taddyEmptyCount = 0;

    for (const podcast of stalePodcasts) {
      if (isTaddyBudgetExhausted()) {
        console.log("[CatchupScan] Budget exhausted mid-scan, stopping");
        break;
      }

      try {
        const episodes = await getEpisodesByItunesId(podcast.itunes_id, CATCHUP_SCAN_EPISODE_LIMIT, podcast.name);
        if (!episodes || episodes.length === 0) {
          taddyEmptyCount++;
          continue;
        }

        const latestEpDate = episodes[0]?.datePublished
          ? new Date(episodes[0].datePublished * 1000).toISOString().slice(0, 10)
          : "unknown";
        console.log(`[CatchupScan] "${podcast.name}": Taddy returned ${episodes.length} ep(s), latest dated ${latestEpDate}`);

        for (const ep of episodes) {
          if (!ep.uuid || !ep.name) continue;

          if (ep.datePublished) {
            const ageDays = (Date.now() / 1000 - ep.datePublished) / 86400;
            if (ageDays > CATCHUP_MAX_EPISODE_AGE_DAYS) {
              skippedTooOld++;
              continue;
            }
          }

          // Skip if transcript already exists
          const { rows: existingTranscript } = await pool.query(
            `SELECT id FROM episode_transcripts WHERE episode_guid = $1 LIMIT 1`,
            [ep.uuid]
          );
          if (existingTranscript.length > 0) {
            skippedHasTranscript++;
            continue;
          }

          // Skip if already in queue (in any non-failed state)
          const { rows: existingQueue } = await pool.query(
            `SELECT id, status FROM pending_transcript_queue WHERE episode_guid = $1 LIMIT 1`,
            [ep.uuid]
          );
          if (existingQueue.length > 0 && existingQueue[0].status !== 'failed') {
            skippedInQueue++;
            continue;
          }

          await storage.queueTranscriptFetch({
            podcastId: podcast.itunes_id,
            podcastName: podcast.name,
            episodeGuid: ep.uuid,
            episodeTitle: ep.name,
            priority: 20,
            datePublished: ep.datePublished ? Math.floor(ep.datePublished) : null,
          });
          queued++;
          console.log(`[CatchupScan] Queued: "${ep.name?.slice(0, 60)}" (${podcast.name})`);
        }

        await new Promise(r => setTimeout(r, CATCHUP_INTER_PODCAST_DELAY_MS));
      } catch (err: any) {
        console.error(`[CatchupScan] Error checking "${podcast.name}": ${err.message}`);
      }
    }

    console.log(`[CatchupScan] Complete — ${queued} queued | ${skippedHasTranscript} already transcribed | ${skippedInQueue} already in queue | ${skippedTooOld} too old | ${taddyEmptyCount} empty from Taddy`);
  } catch (err: any) {
    console.error(`[CatchupScan] Fatal error: ${err.message}`, err.stack);
  } finally {
    catchupScanRunning = false;
  }
}

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

    if (recapStallAlertSent && hoursSinceLastRecap < 1) {
      console.log("[RecapHealth] Pipeline recovered — resetting alert flag");
      recapStallAlertSent = false;
      return;
    }

    const utcHour = new Date().getUTCHours();
    const isActiveHours = utcHour >= 8 && utcHour < 23;

    if (hoursSinceLastRecap >= RECAP_STALL_WARNING_HOURS && isActiveHours && !recapStallAlertSent) {
      const { sendCriticalApiAlert } = await import("./adminAlertService");
      const sent = await sendCriticalApiAlert({
        apiName: "Recap Pipeline Monitor",
        errorType: "Recap Generation Stall",
        errorMessage: `No new recaps in ${Math.round(hoursSinceLastRecap * 10) / 10} hours. Last recap: ${latestRecapAt ? new Date(latestRecapAt).toUTCString() : "never"}.`,
        severity: "warning",
        adminPath: "/admin",
        footerText: "This alert will reset automatically once a new recap is generated.",
      });
      if (sent) {
        recapStallAlertSent = true;
        console.log(`[RecapHealth] Warning sent — ${Math.round(hoursSinceLastRecap * 10) / 10}h stall`);
      }
    }
  } catch (err: any) {
    console.error(`[RecapHealth] Check error: ${err.message}`);
  }
}

export function startProductionRecapScheduler() {
  if (process.env.NODE_ENV !== "production") {
    console.log("[Pipeline] Not in production, skipping scheduler");
    return;
  }

  console.log(`[Pipeline] Starting scheduler — transcript fetch every ${TRANSCRIPT_FETCH_INTERVAL_MS / 1000}s, recap generation every ${RECAP_GENERATION_INTERVAL_MS / 60000}min`);
  isSchedulerStarted = true;

  transcriptFetcherNextRunAt = Date.now() + 30_000;
  recapGeneratorNextRunAt = Date.now() + 60_000;

  setTimeout(async () => {
    await cleanupDuplicateRecaps();
    await cleanupCompletedQueueItems();

    await pool.query(
      `UPDATE pending_transcript_queue SET status = 'queued' WHERE status IN ('fetching', 'generating_recap', 'pending')`
    ).catch(() => {});

    fetchOneTranscript();
    setInterval(fetchOneTranscript, TRANSCRIPT_FETCH_INTERVAL_MS);

    generateOneRecap();
    setInterval(generateOneRecap, RECAP_GENERATION_INTERVAL_MS);

    catchUpMissingHeadlines();
    setInterval(catchUpMissingHeadlines, HEADLINE_CATCHUP_INTERVAL_MS);

    checkRecapPipelineHealth();
    setInterval(checkRecapPipelineHealth, RECAP_HEALTH_INTERVAL_MS);

    // CatchupScan disabled — processing existing queue only
    // setTimeout(() => {
    //   runCatchupScan();
    //   setInterval(runCatchupScan, CATCHUP_SCAN_INTERVAL_MS);
    // }, 60 * 1000);
  }, 30_000);
}
