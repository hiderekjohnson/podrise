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

  const c = await pool.connect();
  const { rows } = await c.query("SELECT COUNT(*)::int as cnt FROM episode_transcripts WHERE podcast_id = $1", [itunesId]);
  c.release();
  console.log(`  Final transcript count: ${rows[0].cnt}`);
}

async function main() {
  const podcasts = [
    { name: "The Majority Report", itunesId: "402306412", taddyUuid: "0ba796b3-81ce-4f3c-972e-9cf480ff69ec" },
    { name: "Choiceology with Katy Milkman", itunesId: "1337886873", taddyUuid: "b063fb27-ec79-443d-a5ed-5d580cccfef2" },
    { name: "WorkLife with Adam Grant", itunesId: "1346314086", taddyUuid: "03c24b5e-e7f7-4d15-9f98-5fd24768cfe5" },
    { name: "Business Breakdowns", itunesId: "1559120677", taddyUuid: "2e9dc2d8-f665-4f48-bbf5-fd29ec04a675" },
    { name: "The Knowledge Project", itunesId: "990149481", taddyUuid: "b799cc23-b4aa-4b72-87a7-7cc21f53f730" },
    { name: "The Happiness Lab", itunesId: "1474245040", taddyUuid: "74aa0609-30bb-4977-87f0-39c3c2cbe656" },
    { name: "All the Hacks", itunesId: "1560751222", taddyUuid: "b1c68418-e4d9-4c00-a261-b8f52421769b" },
    { name: "Machine Learning Street Talk", itunesId: "1510472996", taddyUuid: "bb2dbbbc-fe75-44e0-8388-ff54c38b4c95" },
    { name: "The Infinite Monkey Cage", itunesId: "343580439", taddyUuid: "b6cbe576-61e4-4b04-9320-4c38ac1c9bc9" },
    { name: "At The Table with Patrick Lencioni", itunesId: "1474171732", taddyUuid: "2bb7e7f4-001d-4864-ab11-c444e60e7d5b" },
    { name: "Last Week in AI", itunesId: "1502782720", taddyUuid: "7ea10282-8d3d-4d66-a9d0-8fd58f1c40fd" },
    { name: "Prof G Markets", itunesId: "1744631325", taddyUuid: "2a0afe72-164a-4443-9f5a-558ae6db44f4" },
    { name: "Future of Life Institute Podcast", itunesId: "1170991978", taddyUuid: "ef6657b7-6246-480a-9ca6-b12629a0ad8f" },
    { name: "Conversations with Tyler", itunesId: "983795625", taddyUuid: "76173726-6913-4683-9cb0-a5a90ba57244" },
    { name: "Startups For the Rest of Us", itunesId: "366931951", taddyUuid: "9f0ea3c6-03b6-482e-a0a5-3a597bc2fd3f" },
    { name: "Lenny's Podcast", itunesId: "1627920305", taddyUuid: "b65486a6-7cff-4966-bbea-2bc239e90aa4" },
    { name: "Cognitive Revolution", itunesId: "1669813431", taddyUuid: "f1b8da40-6222-4419-96b1-8a79653e84be" },
    { name: "The Bootstrapped Founder", itunesId: "1497896808", taddyUuid: "d6c00a6a-e636-4fbc-93cd-7c7dd6dbb605" },
    { name: "Founders", itunesId: "1141877104", taddyUuid: "b655b099-46a9-4eab-9f7c-d6c25ee4140b" },
    { name: "Science Vs", itunesId: "1051557000", taddyUuid: "3a8d3cdf-b2aa-4c97-abdf-5b6787cbf0fe" },
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
