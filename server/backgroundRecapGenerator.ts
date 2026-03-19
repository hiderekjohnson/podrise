import { pool } from "./db";
import { storage } from "./storage";
import { generateRecapFromFullTranscript } from "./recapGenerator";
import { ITUNES_ID_TO_SLUG } from "./podcastLandingMap";


const CONCURRENCY = 2;
const BATCH_SIZE = 50;
const HEADLINE_RETRY_COUNT = 2;
const HEADLINE_RETRY_DELAY_MS = 3000;

interface EpisodeRow {
  id: number;
  podcast_id: string;
  episode_title: string;
  transcript: string;
  description: string | null;
  date_published: number | null;
  duration: number | null;
  audio_url: string | null;
  image_url: string | null;
}

async function getPodcastInfo(client: any, itunesId: string) {
  const { rows } = await client.query(
    `SELECT name, slug, hosts, artwork_url, itunes_id FROM podcast_directory WHERE itunes_id = $1`,
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
        console.log(`[BgRecap] Generated tabloid headline for "${epTitle?.slice(0, 50)}" (attempt ${attempt})`);
        return true;
      }
      console.warn(`[BgRecap] Tabloid headline returned null for "${epTitle?.slice(0, 50)}" (attempt ${attempt}/${HEADLINE_RETRY_COUNT + 1})`);
    } catch (headlineErr: any) {
      console.error(`[BgRecap] Tabloid headline generation error for "${epTitle?.slice(0, 50)}" (attempt ${attempt}/${HEADLINE_RETRY_COUNT + 1}): ${headlineErr.message}`, headlineErr.stack);
    }
    if (attempt <= HEADLINE_RETRY_COUNT) {
      await new Promise(r => setTimeout(r, HEADLINE_RETRY_DELAY_MS));
    }
  }
  console.error(`[BgRecap] Tabloid headline generation failed after ${HEADLINE_RETRY_COUNT + 1} attempts for "${epTitle?.slice(0, 50)}"`);
  return false;
}

async function lookupAppleEpisodeUrl(itunesId: string, episodeTitle: string, podcastName: string): Promise<string> {
  try {
    const url = `https://itunes.apple.com/lookup?id=${itunesId}&media=podcast&entity=podcastEpisode&limit=200`;
    const resp = await fetch(url);
    if (!resp.ok) return `https://podcasts.apple.com/podcast/id${itunesId}`;
    const data = await resp.json();
    const results = data.results || [];
    const titleLower = episodeTitle.toLowerCase().trim();
    for (const ep of results) {
      if (ep.wrapperType === "podcastEpisode") {
        const epTitle = (ep.trackName || "").toLowerCase().trim();
        if (epTitle === titleLower || epTitle.includes(titleLower) || titleLower.includes(epTitle)) {
          return ep.trackViewUrl || ep.collectionViewUrl || `https://podcasts.apple.com/podcast/id${itunesId}`;
        }
      }
    }
    return `https://podcasts.apple.com/podcast/id${itunesId}`;
  } catch {
    return `https://podcasts.apple.com/podcast/id${itunesId}`;
  }
}

async function processEpisode(
  ep: EpisodeRow,
  podcastSlug: string,
  podcastName: string,
  itunesId: string,
  hosts: string,
  podcastArtwork: string,
): Promise<"generated" | "failed"> {
  const { validateRecap } = await import("./recapGenerator");
  const epTitle = ep.episode_title || "Untitled";
  const epSlug = makeEpisodeSlug(epTitle);

  const publishDate = ep.date_published
    ? new Date(ep.date_published * 1000).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  const durationSec = ep.duration || 0;
  const durationMin = Math.round(durationSec / 60);
  const durationStr = durationMin >= 60
    ? `${Math.floor(durationMin / 60)} hr ${durationMin % 60} min`
    : `${durationMin} minutes`;

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const recap = await generateRecapFromFullTranscript(
        ep.transcript,
        podcastName,
        epTitle,
        ep.description || null,
      );

      if (!recap) {
        if (attempt < maxAttempts) {
          console.log(`[BgRecap] Recap null for "${epTitle}", retrying (${attempt}/${maxAttempts})...`);
          continue;
        }
        console.log(`[BgRecap] FAIL: Could not generate recap for "${epTitle}" after ${maxAttempts} attempts`);
        return "failed";
      }

      const appleEpisodeUrl = await lookupAppleEpisodeUrl(itunesId, epTitle, podcastName);
      const spotifyEpisodeUrl = "";
      const showNotes = ep.description || null;

      const upsertedRecap = await storage.upsertLandingPageRecap({
        slug: podcastSlug,
        itunesId,
        podcastName,
        episodeTitle: epTitle,
        episodeSlug: epSlug,
        publishDate,
        duration: durationStr,
        artworkUrl: ep.image_url || podcastArtwork,
        hosts,
        tldl: "",
        whatHappened: recap.whatHappened,
        keyInsights: recap.keyInsights,
        quote: "",
        quoteAttribution: "",
        keyTopics: [],
        topicContexts: null,
        topQuestions: null,
        audioUrl: ep.audio_url || "",
        sponsors: "[]",
        guests: recap.guests ? JSON.stringify(recap.guests) : "[]",
        resources: recap.resources ? JSON.stringify(recap.resources) : "[]",
        published: false,
        appleEpisodeUrl: appleEpisodeUrl || null,
        spotifyEpisodeUrl,
        showNotes,
      });

      const canonicalSlug = upsertedRecap.episodeSlug;

      const qa = validateRecap(recap, epTitle, 0);
      if (!qa.passed) {
        const criticals = qa.issues.filter(i => i.severity === "critical");
        if (attempt < maxAttempts) {
          console.log(`[BgRecap] QA retry (${attempt}/${maxAttempts}) for "${epTitle.slice(0, 50)}": ${criticals.map(c => c.message).join("; ")}`);
          await pool.query(`DELETE FROM landing_page_recaps WHERE slug = $1 AND episode_slug = $2`, [podcastSlug, canonicalSlug]);
          continue;
        }
        console.warn(`[BgRecap] QA accepted with ${criticals.length} critical(s) for "${epTitle.slice(0, 50)}"`);
      }

      if (upsertedRecap?.id) {
        try {
          const { validateAndEnrichRecap } = await import("./recapValidator");
          await validateAndEnrichRecap(
            upsertedRecap.id, podcastSlug, canonicalSlug, podcastName,
            epTitle, itunesId, ep.transcript || null, hosts || null
          );
        } catch (valErr: any) {
          console.warn(`[BgRecap] Validation failed for "${epTitle?.slice(0, 50)}":`, valErr);
        }

        await generateTabloidHeadlineWithRetry(upsertedRecap.id, epTitle, podcastName, recap.whatHappened, recap.keyInsights || []);
      }

      return "generated";
    } catch (err: any) {
      if (attempt < maxAttempts) {
        console.error(`[BgRecap] Error attempt ${attempt} for "${epTitle.slice(0, 50)}":`, err.message);
        continue;
      }
      console.error(`[BgRecap] FAIL after ${maxAttempts} attempts for "${epTitle.slice(0, 50)}":`, err.message);
      try {
        await pool.query(
          `INSERT INTO recap_processing_failures (recap_id, podcast_slug, episode_slug, episode_title, podcast_name, source, failure_type, details)
           VALUES (NULL, $1, $2, $3, $4, 'background_generator', 'generation_failed', $5)`,
          [podcastSlug, epSlug, epTitle, podcastName, err.message?.slice(0, 500)]
        );
      } catch {}
      return "failed";
    }
  }
  return "failed";
}

async function publishCompletedRecaps(podcastSlug: string) {
  const result = await pool.query(
    `UPDATE landing_page_recaps SET published = true WHERE slug = $1 AND published = false`,
    [podcastSlug]
  );
  return result.rowCount || 0;
}

async function main() {
  const limitArg = process.argv.find(a => a.startsWith("--limit="));
  const podcastArg = process.argv.find(a => a.startsWith("--podcast="));
  const perPodcastArg = process.argv.find(a => a.startsWith("--per-podcast="));
  const globalLimit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;
  const filterPodcast = podcastArg ? podcastArg.split("=")[1] : undefined;
  const perPodcastLimit = perPodcastArg ? parseInt(perPodcastArg.split("=")[1]) : 20;

  console.log("[BgRecap] Starting background recap generation...");
  console.log(`[BgRecap] Config: concurrency=${CONCURRENCY}, batch=${BATCH_SIZE}, perPodcast=${perPodcastLimit}${globalLimit ? `, limit=${globalLimit}` : ""}${filterPodcast ? `, podcast=${filterPodcast}` : ""}`);

  const client = await pool.connect();
  try {
    let podcastFilter = "";
    const params: any[] = [perPodcastLimit];
    if (filterPodcast) {
      params.push(filterPodcast);
      podcastFilter = ` AND et.podcast_id = $${params.length}`;
    }

    const { rows: episodes } = await client.query(
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
           )${podcastFilter}
       )
       SELECT id, podcast_id, episode_title, transcript, description,
              date_published, duration, audio_url, image_url
       FROM ranked
       WHERE rn <= $1
       ORDER BY date_published DESC NULLS LAST
       ${globalLimit ? `LIMIT ${globalLimit}` : ""}`,
      params
    );
    client.release();

    console.log(`[BgRecap] Found ${episodes.length} episodes needing recaps`);
    if (episodes.length === 0) {
      console.log("[BgRecap] Nothing to do. Exiting.");
      return;
    }

    const podcastIds = [...new Set(episodes.map(e => e.podcast_id))];
    const podcastInfoMap = new Map<string, any>();

    const infoClient = await pool.connect();
    for (const pid of podcastIds) {
      const info = await getPodcastInfo(infoClient, pid);
      if (info) podcastInfoMap.set(pid, info);
    }
    infoClient.release();

    let totalGenerated = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    for (let i = 0; i < episodes.length; i += BATCH_SIZE) {
      const batch = episodes.slice(i, i + BATCH_SIZE);
      console.log(`\n[BgRecap] === Batch ${Math.floor(i / BATCH_SIZE) + 1}: episodes ${i + 1}-${i + batch.length} of ${episodes.length} ===`);

      const queue = [...batch];
      const results: ("generated" | "failed" | "skipped")[] = [];

      async function worker() {
        while (queue.length > 0) {
          const ep = queue.shift()!;
          const info = podcastInfoMap.get(ep.podcast_id);
          if (!info) {
            console.log(`[BgRecap] Skip: no podcast info for itunesId=${ep.podcast_id}, episode="${ep.episode_title?.slice(0, 50)}"`);
            results.push("skipped");
            totalSkipped++;
            continue;
          }

          const podcastSlug = ITUNES_ID_TO_SLUG[ep.podcast_id] || info.slug || info.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
          const podcastName = info.name;
          const hosts = info.hosts || "";
          const artwork = info.artwork_url || "";

          console.log(`[BgRecap] [${totalGenerated + totalFailed + totalSkipped + 1}/${episodes.length}] Processing: "${ep.episode_title?.slice(0, 60)}" (${podcastName}) — ${(ep.transcript?.length || 0).toLocaleString()} chars`);

          const result = await processEpisode(ep, podcastSlug, podcastName, ep.podcast_id, hosts, artwork);
          results.push(result);
          if (result === "generated") totalGenerated++;
          else totalFailed++;
        }
      }

      const workers = Array.from({ length: CONCURRENCY }, () => worker());
      await Promise.all(workers);

      const batchGenerated = results.filter(r => r === "generated").length;
      console.log(`[BgRecap] Batch complete: ${batchGenerated} generated, ${results.filter(r => r === "failed").length} failed`);
    }

    console.log(`\n[BgRecap] === PUBLISHING ===`);
    const podcastSlugsToPublish = new Set<string>();
    for (const ep of episodes) {
      const info = podcastInfoMap.get(ep.podcast_id);
      if (info) {
        const slug = ITUNES_ID_TO_SLUG[ep.podcast_id] || info.slug || info.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
        podcastSlugsToPublish.add(slug);
      }
    }

    let totalPublished = 0;
    for (const slug of podcastSlugsToPublish) {
      const count = await publishCompletedRecaps(slug);
      if (count > 0) {
        console.log(`[BgRecap] Published ${count} recaps for ${slug}`);
        totalPublished += count;
      }
    }

    console.log(`\n[BgRecap] === COMPLETE ===`);
    console.log(`[BgRecap] Generated: ${totalGenerated}, Failed: ${totalFailed}, Skipped: ${totalSkipped}`);
    console.log(`[BgRecap] Published: ${totalPublished} recaps`);
  } catch (err) {
    console.error("[BgRecap] Fatal error:", err);
    client.release();
    process.exit(1);
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error("[BgRecap] Unhandled error:", err);
  process.exit(1);
});
