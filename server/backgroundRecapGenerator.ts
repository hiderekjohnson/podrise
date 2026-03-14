import { pool } from "./db";
import { generateRecapFromFullTranscript, extractQuotesFromTranscript } from "./recapGenerator";
import { ITUNES_ID_TO_SLUG } from "./podcastLandingMap";

const CONCURRENCY = 2;
const BATCH_SIZE = 50;

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

      await pool.query(
        `INSERT INTO landing_page_recaps
         (slug, itunes_id, podcast_name, episode_title, episode_slug, publish_date, duration, artwork_url, hosts, tldl, what_happened, key_insights, quote, quote_attribution, key_topics, topic_contexts, top_questions, audio_url, sponsors, guests, resources, published)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         ON CONFLICT (slug, episode_slug) DO UPDATE SET
           tldl = EXCLUDED.tldl, what_happened = EXCLUDED.what_happened, key_insights = EXCLUDED.key_insights,
           quote = EXCLUDED.quote, quote_attribution = EXCLUDED.quote_attribution, key_topics = EXCLUDED.key_topics,
           topic_contexts = EXCLUDED.topic_contexts, top_questions = EXCLUDED.top_questions, audio_url = EXCLUDED.audio_url,
           sponsors = EXCLUDED.sponsors, guests = EXCLUDED.guests, resources = EXCLUDED.resources,
           published = EXCLUDED.published`,
        [
          podcastSlug, itunesId, podcastName, epTitle, epSlug, publishDate,
          durationStr, ep.image_url || podcastArtwork, hosts,
          recap.tldl, recap.whatHappened,
          recap.keyInsights, recap.quote, recap.quoteAttribution,
          recap.keyTopics,
          recap.topicContexts ? JSON.stringify(recap.topicContexts) : null,
          recap.topQuestions ? JSON.stringify(recap.topQuestions) : null,
          ep.audio_url || "",
          recap.sponsors ? JSON.stringify(recap.sponsors) : "[]",
          recap.guests ? JSON.stringify(recap.guests) : "[]",
          recap.resources ? JSON.stringify(recap.resources) : "[]",
          false,
        ]
      );

      let quoteCount = 0;
      try {
        const guestsJson = recap.guests ? JSON.stringify(recap.guests) : null;
        const extractedQuotes = await extractQuotesFromTranscript(
          ep.transcript,
          podcastName,
          epTitle,
          hosts || null,
          guestsJson,
        );
        if (extractedQuotes.length > 0) {
          await pool.query(
            `DELETE FROM episode_quotes WHERE podcast_slug = $1 AND episode_slug = $2`,
            [podcastSlug, epSlug]
          );
          for (let qi = 0; qi < extractedQuotes.length; qi++) {
            const q = extractedQuotes[qi];
            await pool.query(
              `INSERT INTO episode_quotes (podcast_slug, episode_slug, speaker_name, speaker_role, quote_text, context, quote_type, sort_order)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [podcastSlug, epSlug, q.speakerName, q.speakerRole || "", q.quoteText, q.context || "", q.quoteType || "Tweetable", qi]
            );
          }
          quoteCount = extractedQuotes.length;
          console.log(`[BgRecap] Extracted ${quoteCount} quotes for "${epTitle.slice(0, 50)}"`);
        }
      } catch (quoteErr: any) {
        console.warn(`[BgRecap] Quote extraction failed for "${epTitle.slice(0, 50)}": ${quoteErr.message}`);
      }

      const qa = validateRecap(recap, epTitle, quoteCount);
      if (!qa.passed) {
        const criticals = qa.issues.filter(i => i.severity === "critical");
        if (attempt < maxAttempts) {
          console.log(`[BgRecap] QA retry (${attempt}/${maxAttempts}) for "${epTitle.slice(0, 50)}": ${criticals.map(c => c.message).join("; ")}`);
          await pool.query(`DELETE FROM landing_page_recaps WHERE slug = $1 AND episode_slug = $2`, [podcastSlug, epSlug]);
          continue;
        }
        console.warn(`[BgRecap] QA accepted with ${criticals.length} critical(s) for "${epTitle.slice(0, 50)}"`);
      }

      return "generated";
    } catch (err: any) {
      if (attempt < maxAttempts) {
        console.error(`[BgRecap] Error attempt ${attempt} for "${epTitle.slice(0, 50)}":`, err.message);
        continue;
      }
      console.error(`[BgRecap] FAIL after ${maxAttempts} attempts for "${epTitle.slice(0, 50)}":`, err.message);
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
  const globalLimit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;
  const filterPodcast = podcastArg ? podcastArg.split("=")[1] : undefined;

  console.log("[BgRecap] Starting background recap generation...");
  console.log(`[BgRecap] Config: concurrency=${CONCURRENCY}, batch=${BATCH_SIZE}${globalLimit ? `, limit=${globalLimit}` : ""}${filterPodcast ? `, podcast=${filterPodcast}` : ""}`);

  const client = await pool.connect();
  try {
    let podcastFilter = "";
    const params: any[] = [];
    if (filterPodcast) {
      params.push(filterPodcast);
      podcastFilter = ` AND et.podcast_id = $${params.length}`;
    }

    const { rows: episodes } = await client.query(
      `SELECT et.id, et.podcast_id, et.episode_title, et.transcript, et.description,
              et.date_published, et.duration, et.audio_url, et.image_url
       FROM episode_transcripts et
       WHERE et.transcript IS NOT NULL AND et.transcript != ''
         AND NOT EXISTS (
           SELECT 1 FROM landing_page_recaps lpr
           WHERE lpr.itunes_id = et.podcast_id
             AND (lower(trim(lpr.episode_title)) = lower(trim(et.episode_title))
               OR lpr.episode_slug = lower(regexp_replace(trim(et.episode_title), '[^a-zA-Z0-9]+', '-', 'g')))
         )${podcastFilter}
       ORDER BY et.date_published DESC NULLS LAST
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
