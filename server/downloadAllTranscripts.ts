import pg from "pg";
import { storage } from "./storage";

const TADDY_API_URL = "https://api.taddy.org";
const DELAY_MS = 400;
const EPISODES_PER_PAGE = 25;
const BATCH_SIZE = parseInt(process.env.BACKFILL_BATCH_SIZE || "20", 10);
const BATCH_PAUSE_MS = 5000;

const backfillPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  min: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

async function taddyRequest(query: string): Promise<any> {
  const res = await fetch(TADDY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-USER-ID": process.env.TADDY_USER_ID!,
      "X-API-KEY": process.env.TADDY_API_KEY!,
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Taddy API error: ${res.status}`);
  return res.json();
}

async function downloadTranscript(uuid: string): Promise<string | null> {
  const query = `{ getEpisodeTranscript(uuid: "${uuid}") { id text speaker } }`;
  const data = await taddyRequest(query);
  const segments = data?.data?.getEpisodeTranscript;
  if (!segments || !Array.isArray(segments) || segments.length === 0) return null;
  return segments.map((s: any) => s.text).join(" ");
}

async function processPodcast(name: string, itunesId: string, taddyUuid: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing: ${name}`);
  console.log(`${"=".repeat(60)}`);

  const client = await backfillPool.connect();
  const { rows: existingRows } = await client.query(
    `SELECT episode_guid, episode_title FROM episode_transcripts WHERE podcast_id = $1`, [itunesId]
  );
  client.release();

  const existingGuids = new Set(existingRows.map((r: any) => r.episode_guid));
  const existingTitles = new Set(existingRows.map((r: any) => r.episode_title));

  let allEpisodes: any[] = [];
  for (let page = 1; page <= 200; page++) {
    const query = `{ getPodcastSeries(uuid: "${taddyUuid}") { uuid episodes(sortOrder: LATEST, limitPerPage: ${EPISODES_PER_PAGE}, page: ${page}) { uuid name description subtitle datePublished duration imageUrl audioUrl seasonNumber episodeNumber episodeType taddyTranscribeStatus } } }`;
    const data = await taddyRequest(query);
    const episodes = data?.data?.getPodcastSeries?.episodes;
    if (!episodes || !Array.isArray(episodes) || episodes.length === 0) break;
    allEpisodes = allEpisodes.concat(episodes);
    if (episodes.length < EPISODES_PER_PAGE) break;
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`  Total episodes on Taddy: ${allEpisodes.length}`);
  console.log(`  Already have: ${existingRows.length} transcripts`);

  const transcribed = allEpisodes.filter(e => e.taddyTranscribeStatus === "COMPLETED");
  console.log(`  Transcribed on Taddy: ${transcribed.length}`);

  let newDownloads = 0;
  let metadataUpdates = 0;
  let failed = 0;
  let skippedNoTranscript = 0;

  for (const ep of allEpisodes) {
    const alreadyByGuid = existingGuids.has(ep.uuid);
    const alreadyByTitle = existingTitles.has(ep.name);

    if (alreadyByGuid || alreadyByTitle) {
      // Update metadata for existing episode
      const c = await pool.connect();
      try {
        const isComplete = !!(ep.description && ep.datePublished && ep.duration && ep.audioUrl);
        await c.query(
          `UPDATE episode_transcripts SET description = $1, date_published = $2, duration = $3, audio_url = $4, image_url = $5, season_number = $6, episode_number = $7, episode_type = $8, subtitle = $9, fetched_at = NOW(), complete_record = (transcript IS NOT NULL AND transcript != '' AND $13::boolean) WHERE podcast_id = $10 AND (episode_guid = $11 OR episode_title = $12)`,
          [ep.description, ep.datePublished, ep.duration, ep.audioUrl, ep.imageUrl, ep.seasonNumber, ep.episodeNumber, ep.episodeType, ep.subtitle, itunesId, ep.uuid, ep.name, isComplete]
        );
        metadataUpdates++;
      } finally { c.release(); }
      continue;
    }

    if (ep.taddyTranscribeStatus !== "COMPLETED") {
      skippedNoTranscript++;
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
        existingTitles.add(ep.name);
        newDownloads++;
        if (newDownloads % 10 === 0) console.log(`    ... ${newDownloads} new transcripts downloaded`);
      }
    } catch (err: any) {
      failed++;
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`  Results: ${newDownloads} new, ${metadataUpdates} metadata updated, ${skippedNoTranscript} not transcribed on Taddy, ${failed} failed`);

  const c = await backfillPool.connect();
  const { rows } = await c.query("SELECT COUNT(*)::int as cnt FROM episode_transcripts WHERE podcast_id = $1", [itunesId]);
  c.release();
  console.log(`  Final transcript count: ${rows[0].cnt}`);
}

async function main() {
  const TARGET_MIN = 100;

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
  console.log(`Processing in batches of ${BATCH_SIZE} with ${BATCH_PAUSE_MS / 1000}s pause between batches\n`);
  for (const p of podcasts) {
    console.log(`  ${String(p.currentCount).padStart(4)} transcripts | ${p.slug}`);
  }

  for (let i = 0; i < podcasts.length; i++) {
    const p = podcasts[i];
    console.log(`\n[${i + 1}/${podcasts.length}] ${p.slug} (currently ${p.currentCount} transcripts)`);
    await processPodcast(p.name, p.itunesId, p.taddyUuid);

    if ((i + 1) % BATCH_SIZE === 0 && i + 1 < podcasts.length) {
      console.log(`\n--- Batch of ${BATCH_SIZE} complete. Pausing ${BATCH_PAUSE_MS / 1000}s to reduce DB load... ---\n`);
      await new Promise(r => setTimeout(r, BATCH_PAUSE_MS));
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("ALL DONE!");
  console.log(`${"=".repeat(60)}`);
  await backfillPool.end();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
