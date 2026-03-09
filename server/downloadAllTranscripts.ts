import { pool } from "./db";
import { storage } from "./storage";

const TADDY_API_URL = "https://api.taddy.org";
const DELAY_MS = 400;
const EPISODES_PER_PAGE = 25;

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

  const client = await pool.connect();
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
        await c.query(
          `UPDATE episode_transcripts SET description = $1, date_published = $2, duration = $3, audio_url = $4, image_url = $5, season_number = $6, episode_number = $7, episode_type = $8, subtitle = $9, fetched_at = NOW() WHERE podcast_id = $10 AND (episode_guid = $11 OR episode_title = $12)`,
          [ep.description, ep.datePublished, ep.duration, ep.audioUrl, ep.imageUrl, ep.seasonNumber, ep.episodeNumber, ep.episodeType, ep.subtitle, itunesId, ep.uuid, ep.name]
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

  const c = await pool.connect();
  const { rows } = await c.query("SELECT COUNT(*)::int as cnt FROM episode_transcripts WHERE podcast_id = $1", [itunesId]);
  c.release();
  console.log(`  Final transcript count: ${rows[0].cnt}`);
}

async function main() {
  const podcasts = [
    { name: "Navigating Wealth", itunesId: "1848166539", taddyUuid: "9f88e0b3-54ed-410a-89d1-439082819880" },
    { name: ".NET Rocks", itunesId: "130068596", taddyUuid: "5316bcfb-fe3d-4da8-b914-5ee5063d1de4" },
    { name: "Forward Thinking Investors", itunesId: "1584856434", taddyUuid: "af5af061-681b-43db-b724-fda95b8d56fe" },
    { name: "Democracy Now", itunesId: "73802554", taddyUuid: "ab840175-dbbf-46f2-b48d-e3c4924f2fdc" },
    { name: "The Driverless Digest Podcast", itunesId: "1811181944", taddyUuid: "ab0646bb-f0e9-4285-a222-0e96c0e7edb0" },
    { name: "Mixergy", itunesId: "348690336", taddyUuid: "2df15982-8241-4762-839d-de477b69e9b7" },
    { name: "The Majority Report", itunesId: "402306412", taddyUuid: "0ba796b3-81ce-4f3c-972e-9cf480ff69ec" },
    { name: "The Pragmatic Engineer", itunesId: "1769051199", taddyUuid: "142bd630-e265-43e2-b091-182b2b166088" },
    { name: "BG2 Pod", itunesId: "1727278168", taddyUuid: "c34324ca-a737-4ff2-bd7f-469cd3441744" },
    { name: "The Art of Investing", itunesId: "1825201965", taddyUuid: "bd77c3bc-a11e-495e-b77c-682a1789d9ff" },
  ];

  console.log(`Starting full transcript download for ${podcasts.length} podcasts (least remaining first)\n`);

  for (let i = 0; i < podcasts.length; i++) {
    const p = podcasts[i];
    console.log(`\n[${i + 1}/${podcasts.length}]`);
    await processPodcast(p.name, p.itunesId, p.taddyUuid);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("ALL DONE!");
  console.log(`${"=".repeat(60)}`);
  await pool.end();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
