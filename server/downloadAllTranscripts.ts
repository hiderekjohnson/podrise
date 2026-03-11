import pg from "pg";
import { storage } from "./storage";

const TADDY_API_URL = "https://api.taddy.org";
const DELAY_MS = 800;
const TRANSCRIPT_DELAY_MS = 500;
const EPISODES_PER_PAGE = 25;
const BATCH_SIZE = parseInt(process.env.BACKFILL_BATCH_SIZE || "10", 10);
const BATCH_PAUSE_MS = 15000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const TARGET_MIN = 100;
const MAX_PAGES = 8;

const backfillPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  min: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

async function taddyRequest(query: string, retries = MAX_RETRIES): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(TADDY_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-USER-ID": process.env.TADDY_USER_ID!,
          "X-API-KEY": process.env.TADDY_API_KEY!,
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(60000),
      });
      if (res.status === 429) {
        const wait = Math.min(30000, RETRY_DELAY_MS * attempt * 2);
        console.log(`    Rate limited (429). Waiting ${wait / 1000}s before retry ${attempt}/${retries}...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        if (attempt < retries) {
          console.log(`    Taddy API error ${res.status}. Retry ${attempt}/${retries} in ${RETRY_DELAY_MS * attempt / 1000}s...`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
          continue;
        }
        throw new Error(`Taddy API error: ${res.status}`);
      }
      return res.json();
    } catch (err: any) {
      if (attempt < retries && (err.name === 'TimeoutError' || err.name === 'AbortError' || err.message?.includes('fetch'))) {
        console.log(`    Network error: ${err.message}. Retry ${attempt}/${retries} in ${RETRY_DELAY_MS * attempt / 1000}s...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

async function downloadTranscript(uuid: string): Promise<string | null> {
  const query = `{ getEpisodeTranscript(uuid: "${uuid}") { id text speaker } }`;
  const data = await taddyRequest(query);

  if (data?.errors?.length) {
    const msg = data.errors[0]?.message || "";
    if (msg.includes("Pro or Business")) return null;
  }

  const segments = data?.data?.getEpisodeTranscript;
  if (!segments || !Array.isArray(segments) || segments.length === 0) return null;
  const text = segments.map((s: any) => (s.speaker ? `[${s.speaker}] ` : "") + s.text).join("\n");
  return text.length > 100 ? text : null;
}

async function processPodcast(name: string, itunesId: string, taddyUuid: string, currentCount: number) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing: ${name} (have ${currentCount}, need ${TARGET_MIN})`);
  console.log(`${"=".repeat(60)}`);

  const client = await backfillPool.connect();
  const { rows: existingRows } = await client.query(
    `SELECT episode_guid, episode_title FROM episode_transcripts WHERE podcast_id = $1`, [itunesId]
  );
  client.release();

  const existingGuids = new Set(existingRows.map((r: any) => r.episode_guid));
  const existingTitles = new Set(existingRows.map((r: any) => r.episode_title?.toLowerCase()));
  const needed = TARGET_MIN - existingRows.length;
  if (needed <= 0) {
    console.log(`  Already have ${existingRows.length} transcripts, skipping.`);
    return;
  }

  let newDownloads = 0;
  let metadataUpdates = 0;
  let failed = 0;
  let noTranscriptAvailable = 0;
  let consecutiveNoTranscript = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    if (newDownloads >= needed) break;
    if (consecutiveNoTranscript >= 15) {
      console.log(`    15 consecutive episodes with no transcript available, stopping.`);
      break;
    }

    try {
      const query = `{ getPodcastSeries(uuid: "${taddyUuid}") { uuid episodes(sortOrder: LATEST, limitPerPage: ${EPISODES_PER_PAGE}, page: ${page}) { uuid name description subtitle datePublished duration imageUrl audioUrl seasonNumber episodeNumber episodeType } } }`;
      const data = await taddyRequest(query);
      const episodes = data?.data?.getPodcastSeries?.episodes;
      if (!episodes || !Array.isArray(episodes) || episodes.length === 0) break;

      for (const ep of episodes) {
        if (newDownloads >= needed) break;

        const alreadyByGuid = existingGuids.has(ep.uuid);
        const alreadyByTitle = ep.name && existingTitles.has(ep.name.toLowerCase());

        if (alreadyByGuid || alreadyByTitle) {
          const c = await backfillPool.connect();
          try {
            const isComplete = !!(ep.description && ep.datePublished && ep.duration && ep.audioUrl);
            await c.query(
              `UPDATE episode_transcripts SET description = $1, date_published = $2, duration = $3, audio_url = $4, image_url = $5, season_number = $6, episode_number = $7, episode_type = $8, subtitle = $9, fetched_at = NOW(), complete_record = (transcript IS NOT NULL AND transcript != '' AND $13::boolean) WHERE podcast_id = $10 AND (episode_guid = $11 OR episode_title = $12)`,
              [ep.description, ep.datePublished, ep.duration, ep.audioUrl, ep.imageUrl, ep.seasonNumber, ep.episodeNumber, ep.episodeType, ep.subtitle, itunesId, ep.uuid, ep.name, isComplete]
            );
            metadataUpdates++;
          } catch (err: any) {
            // metadata update failed, continue
          } finally { c.release(); }
          continue;
        }

        try {
          const text = await downloadTranscript(ep.uuid);
          if (text) {
            await storage.saveTranscript({
              podcastId: itunesId,
              episodeGuid: ep.uuid,
              episodeTitle: ep.name || "Untitled",
              transcript: text,
              description: ep.description || undefined,
              subtitle: ep.subtitle || undefined,
              datePublished: ep.datePublished || undefined,
              duration: ep.duration || undefined,
              audioUrl: ep.audioUrl || undefined,
              imageUrl: ep.imageUrl || undefined,
              seasonNumber: ep.seasonNumber || undefined,
              episodeNumber: ep.episodeNumber || undefined,
              episodeType: ep.episodeType || undefined,
            });
            existingGuids.add(ep.uuid);
            existingTitles.add((ep.name || "").toLowerCase());
            newDownloads++;
            consecutiveNoTranscript = 0;
            if (newDownloads % 10 === 0) console.log(`    ... ${newDownloads} new transcripts downloaded`);
          } else {
            noTranscriptAvailable++;
            consecutiveNoTranscript++;
          }
        } catch (err: any) {
          console.log(`    Error for "${ep.name}": ${err.message?.slice(0, 100)}`);
          failed++;
          consecutiveNoTranscript++;
        }

        await new Promise(r => setTimeout(r, TRANSCRIPT_DELAY_MS));
      }

      if (episodes.length < EPISODES_PER_PAGE) break;
      await new Promise(r => setTimeout(r, DELAY_MS));
    } catch (err: any) {
      console.log(`    Error fetching page ${page}: ${err.message}. Stopping pagination.`);
      break;
    }
  }

  const finalCount = existingRows.length + newDownloads;
  console.log(`  Results: ${newDownloads} new, ${metadataUpdates} metadata updated, ${noTranscriptAvailable} no transcript on Taddy, ${failed} failed`);
  console.log(`  Final transcript count: ${finalCount}`);
}

async function main() {
  const client = await backfillPool.connect();
  const { rows } = await client.query(`
    SELECT pd.name, pd.itunes_id::text as itunes_id, pd.taddy_uuid, pd.slug,
           COUNT(et.id)::int as transcript_count
    FROM podcast_directory pd
    LEFT JOIN episode_transcripts et ON et.podcast_id = pd.itunes_id::text
    WHERE pd.has_landing_page = true AND pd.taddy_uuid IS NOT NULL
    GROUP BY pd.name, pd.itunes_id, pd.taddy_uuid, pd.slug
    HAVING COUNT(et.id) < ${TARGET_MIN}
    ORDER BY COUNT(et.id) ASC
  `);
  client.release();

  const podcasts = rows.map((r: any) => ({
    name: r.name,
    itunesId: r.itunes_id,
    taddyUuid: r.taddy_uuid,
    slug: r.slug,
    currentCount: r.transcript_count,
  }));

  console.log(`Found ${podcasts.length} podcasts with fewer than ${TARGET_MIN} transcripts`);
  console.log(`Processing in batches of ${BATCH_SIZE} with ${BATCH_PAUSE_MS / 1000}s pause between batches`);
  console.log(`Delay: ${DELAY_MS}ms pages, ${TRANSCRIPT_DELAY_MS}ms transcripts | Retries: ${MAX_RETRIES} | Max pages: ${MAX_PAGES}\n`);
  for (const p of podcasts) {
    console.log(`  ${String(p.currentCount).padStart(4)} transcripts | ${p.slug}`);
  }

  for (let i = 0; i < podcasts.length; i++) {
    const p = podcasts[i];
    console.log(`\n[${i + 1}/${podcasts.length}] ${p.slug} (currently ${p.currentCount} transcripts)`);
    try {
      await processPodcast(p.name, p.itunesId, p.taddyUuid, p.currentCount);
    } catch (err: any) {
      console.error(`  FATAL ERROR processing ${p.slug}: ${err.message}`);
      console.log(`  Skipping to next podcast after 10s pause...`);
      await new Promise(r => setTimeout(r, 10000));
    }

    if ((i + 1) % BATCH_SIZE === 0 && i + 1 < podcasts.length) {
      const c = await backfillPool.connect();
      const { rows: countRows } = await c.query("SELECT COUNT(*)::int as cnt FROM episode_transcripts");
      c.release();
      console.log(`\n--- Batch of ${BATCH_SIZE} complete. Total transcripts in DB: ${countRows[0].cnt}. Pausing ${BATCH_PAUSE_MS / 1000}s... ---\n`);
      await new Promise(r => setTimeout(r, BATCH_PAUSE_MS));
    }
  }

  const finalClient = await backfillPool.connect();
  const { rows: finalCount } = await finalClient.query("SELECT COUNT(*)::int as cnt FROM episode_transcripts");
  finalClient.release();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`ALL DONE! Total transcripts in DB: ${finalCount[0].cnt}`);
  console.log(`${"=".repeat(60)}`);
  await backfillPool.end();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
