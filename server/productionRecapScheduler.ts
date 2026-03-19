import { pool } from "./db";
import { storage } from "./storage";
import { generateRecapFromFullTranscript } from "./recapGenerator";
import { ITUNES_ID_TO_SLUG } from "./podcastLandingMap";

const INTERVAL_MS = 5 * 60 * 1000;
const BATCH_SIZE = 3;
const PER_PODCAST = 3;
const BATCH_TIMEOUT_MS = 10 * 60 * 1000;
let batchRunning = false;
let batchStartedAt = 0;

async function getPodcastInfo(itunesId: string) {
  const { rows } = await pool.query(
    `SELECT name, slug, hosts, artwork_url, itunes_id FROM podcast_directory WHERE itunes_id = $1`,
    [itunesId]
  );
  return rows[0] || null;
}

function makeEpisodeSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

async function processEpisode(ep: any, podcastSlug: string, podcastName: string, itunesId: string, hosts: string, artwork: string): Promise<boolean> {
  const epSlug = makeEpisodeSlug(ep.episode_title);
  const epTitle = ep.episode_title;

  try {
    const recap = await generateRecapFromFullTranscript(
      ep.transcript,
      podcastName,
      epTitle,
      ep.description || null,
    );

    if (!recap) return false;

    const publishDate = ep.date_published
      ? new Date(ep.date_published * 1000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const { rows: existingRows } = await pool.query(
      `SELECT id FROM landing_page_recaps WHERE itunes_id = $1 AND lower(trim(episode_title)) = lower(trim($2)) LIMIT 1`,
      [itunesId, epTitle]
    );
    if (existingRows.length > 0) {
      console.log(`[ProdRecap] Skip duplicate: "${epTitle?.slice(0, 60)}" already exists (id=${existingRows[0].id})`);
      return true;
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
      tabloidHeadline: null,
      tabloidSubHeadline: null,
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

    return true;
  } catch (err: any) {
    console.error(`[ProdRecap] Error processing "${epTitle?.slice(0, 50)}": ${err.message}`);
    try {
      await pool.query(
        `INSERT INTO recap_processing_failures (recap_id, podcast_slug, episode_slug, episode_title, podcast_name, source, failure_type, details)
         VALUES (NULL, $1, $2, $3, $4, 'production_scheduler', 'generation_failed', $5)`,
        [podcastSlug, epSlug, epTitle, podcastName, err.message?.slice(0, 500)]
      );
    } catch {}
    return false;
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

      const episodeTimeout = new Promise<boolean>((resolve) => setTimeout(() => {
        console.warn(`[ProdRecap] Episode timed out after 4min: "${ep.episode_title?.slice(0, 60)}"`);
        resolve(false);
      }, 4 * 60 * 1000));
      const success = await Promise.race([
        processEpisode(ep, podcastSlug, podcastName, ep.podcast_id, hosts, artwork),
        episodeTimeout
      ]);
      if (success) generated++;
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
  }, 120_000);
}
