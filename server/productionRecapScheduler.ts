import { pool } from "./db";
import { storage } from "./storage";
import { generateRecapFromFullTranscript } from "./recapGenerator";
import { ITUNES_ID_TO_SLUG } from "./podcastLandingMap";
import { isLikelySponsorProduct } from "./productFilter";

const INTERVAL_MS = 15 * 60 * 1000;
const BATCH_SIZE = 1;
const PER_PODCAST = 1;
let batchRunning = false;

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
      epTitle,
      podcastName,
      hosts,
      ep.description || ""
    );

    if (!recap) return false;

    const publishDate = ep.date_published
      ? new Date(ep.date_published * 1000).toISOString().slice(0, 10)
      : null;

    let tabloidHeadline: string | null = null;
    let tabloidSubHeadline: string | null = null;
    try {
      const { generateTabloidHeadline } = await import("./emailScheduler");
      const tabloidResult = await generateTabloidHeadline(
        epTitle, podcastName, recap.tldl, recap.whatHappened, recap.keyInsights || []
      );
      if (tabloidResult) {
        tabloidHeadline = tabloidResult.tabloidHeadline;
        tabloidSubHeadline = tabloidResult.tabloidSubHeadline;
      }
    } catch (err: any) {
      console.warn(`[ProdRecap] Tabloid headline generation failed for "${epTitle?.slice(0, 50)}": ${err.message}`);
    }

    const upsertedRecap = await storage.upsertLandingPageRecap({
      slug: podcastSlug,
      itunesId,
      podcastName,
      episodeTitle: epTitle,
      episodeSlug: epSlug,
      publishDate: publishDate || new Date().toISOString().slice(0, 10),
      duration: ep.duration ? String(ep.duration) : null,
      artworkUrl: artwork,
      hosts: hosts || "",
      tldl: recap.tldl,
      whatHappened: recap.whatHappened,
      keyInsights: recap.keyInsights || [],
      quote: recap.quote,
      quoteAttribution: recap.quoteAttribution,
      keyTopics: recap.keyTopics || [],
      guests: JSON.stringify(recap.guests || []),
      tabloidHeadline,
      tabloidSubHeadline,
      published: true,
    });
    const canonicalSlug = upsertedRecap.episodeSlug;

    if (recap.quotes && recap.quotes.length > 0) {
      for (const q of recap.quotes.slice(0, 5)) {
        await pool.query(
          `INSERT INTO episode_quotes (podcast_slug, episode_slug, episode_title, speaker_name, quote_text, context)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
          [podcastSlug, canonicalSlug, epTitle, q.speaker || recap.quoteAttribution || podcastName, q.text, q.context || ""]
        ).catch(() => {});
      }
    }

    if (recap.products && recap.products.length > 0) {
      for (const p of recap.products) {
        if (!p.name || !p.context) continue;
        const filterResult = isLikelySponsorProduct(p);
        const initialStatus = filterResult.isFiltered ? "rejected" : "pending";
        const rejectionReason = filterResult.reason;

        try {
          const { rows: existing } = await pool.query(
            `SELECT id FROM extracted_products WHERE LOWER(name) = LOWER($1) AND podcast_slug = $2 AND episode_title = $3 LIMIT 1`,
            [p.name, podcastSlug, epTitle]
          );
          if (existing.length > 0) continue;

          let imageUrl: string | null = null;
          if (!filterResult.isFiltered && p.purchaseUrl) {
            try {
              const { resolveProductImage } = await import("./productImageResolver");
              imageUrl = await resolveProductImage(p.purchaseUrl);
            } catch {}
          }

          await pool.query(
            `INSERT INTO extracted_products (name, company, description, purchase_url, context, mention_type, category, episode_title, episode_slug, podcast_slug, status, rejection_reason, image_url)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
            [p.name, p.company || null, p.description || null, p.purchaseUrl || null, p.context, p.mentionType || "personal_use", p.category || "service_or_tool", epTitle, canonicalSlug, podcastSlug, initialStatus, rejectionReason, imageUrl]
          );
        } catch {}
      }
    }

    if (recap.books && recap.books.length > 0) {
      for (const book of recap.books) {
        if (!book.title) continue;
        try {
          await pool.query(
            `INSERT INTO book_insights (podcast_slug, episode_slug, episode_title, book_title, author, context)
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
            [podcastSlug, canonicalSlug, epTitle, book.title, book.author || null, book.context || ""]
          ).catch(() => {});
        } catch {}
      }
    }

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
    console.log("[ProdRecap] Previous batch still running, skipping this cycle");
    return;
  }
  batchRunning = true;
  try {
    const { rows: episodes } = await pool.query(
      `WITH ranked AS (
         SELECT et.id, et.podcast_id, et.episode_title, et.transcript, et.description,
                et.date_published, et.duration, et.audio_url, et.image_url,
                ROW_NUMBER() OVER (PARTITION BY et.podcast_id ORDER BY et.date_published DESC NULLS LAST) AS rn
         FROM episode_transcripts et
         WHERE et.transcript IS NOT NULL AND et.transcript != ''
           AND NOT EXISTS (
             SELECT 1 FROM landing_page_recaps lpr
             WHERE lpr.itunes_id = et.podcast_id
               AND (lower(trim(lpr.episode_title)) = lower(trim(et.episode_title))
                 OR lpr.episode_slug = lower(regexp_replace(trim(et.episode_title), '[^a-zA-Z0-9]+', '-', 'g')))
           )
       )
       SELECT id, podcast_id, episode_title, transcript, description,
              date_published, duration, audio_url, image_url
       FROM ranked
       WHERE rn <= $1
       ORDER BY date_published DESC NULLS LAST
       LIMIT $2`,
      [PER_PODCAST, BATCH_SIZE]
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

      const success = await processEpisode(ep, podcastSlug, podcastName, ep.podcast_id, hosts, artwork);
      if (success) generated++;
      else failed++;
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

export function startProductionRecapScheduler() {
  if (process.env.NODE_ENV !== "production") {
    console.log("[ProdRecap] Not in production, skipping scheduler");
    return;
  }

  console.log(`[ProdRecap] Starting scheduler (every ${INTERVAL_MS / 60000} min, ${BATCH_SIZE} episodes/batch)`);

  setTimeout(() => {
    runBatch();
    setInterval(runBatch, INTERVAL_MS);
  }, 60_000);
}
