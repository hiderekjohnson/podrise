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
    { name: "Navigating Wealth", itunesId: "1848166539", taddyUuid: "9f88e0b3-54ed-410a-89d1-439082819880" },
    { name: ".NET Rocks", itunesId: "130068596", taddyUuid: "5316bcfb-fe3d-4da8-b914-5ee5063d1de4" },
    { name: "Forward Thinking Investors", itunesId: "1584856434", taddyUuid: "af5af061-681b-43db-b724-fda95b8d56fe" },
    { name: "Democracy Now", itunesId: "73802554", taddyUuid: "ab840175-dbbf-46f2-b48d-e3c4924f2fdc" },
    { name: "The Driverless Digest Podcast", itunesId: "1811181944", taddyUuid: "ab0646bb-f0e9-4285-a222-0e96c0e7edb0" },
    { name: "Mixergy", itunesId: "348690336", taddyUuid: "2df15982-8241-4762-839d-de477b69e9b7" },
    { name: "BG2 Pod", itunesId: "1727278168", taddyUuid: "c34324ca-a737-4ff2-bd7f-469cd3441744" },
    { name: "The Art of Investing", itunesId: "1825201965", taddyUuid: "bd77c3bc-a11e-495e-b77c-682a1789d9ff" },
    { name: "The Majority Report", itunesId: "402306412", taddyUuid: "0ba796b3-81ce-4f3c-972e-9cf480ff69ec" },
    { name: "Land of the Giants", itunesId: "1465767420", taddyUuid: "bda1891d-94a3-4335-8fd9-0ddee5a8b4a4" },
    { name: "The Eric Ries Show", itunesId: "1744818044", taddyUuid: "a7948b77-7bfa-476f-bbf0-d524725b3a89" },
    { name: "Moneywise", itunesId: "1725976637", taddyUuid: "7664ee20-a5a1-4d83-a758-61ab8570dbec" },
    { name: "Dare to Lead with Brené Brown", itunesId: "1730985049", taddyUuid: "64f4482c-37b6-4e47-8742-7fec33566c50" },
    { name: "FoundMyFitness", itunesId: "818198322", taddyUuid: "32bd516c-e999-4285-81fb-1e21b4819599" },
    { name: "Software Engineering Daily", itunesId: "1019576853", taddyUuid: "5b3e8f27-6461-4f17-a532-09ec5744d6cf" },
    { name: "Dwarkesh Podcast", itunesId: "1516093381", taddyUuid: "9f937338-ef55-471e-a148-9b7791217728" },
    { name: "Build with Maggie Crowley", itunesId: "1445050691", taddyUuid: "18ce06db-804f-4437-ba59-807757256592" },
    { name: "The McKinsey Podcast", itunesId: "285260960", taddyUuid: "c3534bf9-70c0-4366-a01b-f592e650bec7" },
    { name: "Choiceology with Katy Milkman", itunesId: "1337886873", taddyUuid: "b063fb27-ec79-443d-a5ed-5d580cccfef2" },
    { name: "BigDeal", itunesId: "1736593333", taddyUuid: "47f70cb4-c833-4da3-a3e8-b2f30756a2a6" },
    { name: "The Next Wave", itunesId: "1738550343", taddyUuid: "06a5f145-01b0-499e-b269-4cc488b57df0" },
    { name: "Search Engine", itunesId: "1614253637", taddyUuid: "7295df02-3649-4241-958b-0f1467d8d6b4" },
    { name: "Gradient Dissent", itunesId: "1504567418", taddyUuid: "ea5b81ad-432e-47e6-8a1f-4148959ba7bc" },
    { name: "Joe Lonsdale: American Optimist", itunesId: "1573141757", taddyUuid: "56e88649-f002-4a8c-bd89-cc6f6f3776c0" },
    { name: "No Priors", itunesId: "1668002688", taddyUuid: "7740f569-b86e-4eb7-af87-25c7014738fd" },
    { name: "AI For Humans", itunesId: "1682409647", taddyUuid: "c8a06a09-84fe-4d4c-bd2a-c79c2ac5d69d" },
    { name: "The Ramsey Show", itunesId: "77001367", taddyUuid: "244db1ab-37d8-4a35-ab58-a388e054b767" },
    { name: "Marketplace Tech", itunesId: "73330855", taddyUuid: "1a46b121-a816-4371-b2b6-18f7f68672ed" },
    { name: "Darknet Diaries", itunesId: "1296350485", taddyUuid: "4aa0f263-0d63-40c8-a519-c988474c0a57" },
    { name: "The Logan Bartlett Show", itunesId: "1606770839", taddyUuid: "58e4e281-6194-4111-95bb-95d51f222ca4" },
    { name: "Hard Fork", itunesId: "1528594034", taddyUuid: "ff1d51d4-4fc9-4161-b23b-f0079f6dd5a0" },
    { name: "Latent Space", itunesId: "1674008350", taddyUuid: "55c52e8b-0ecf-454a-a06e-5ab937368fd4" },
    { name: "Compound Insights", itunesId: "1491984289", taddyUuid: "c40ff9d7-2d8a-4f84-b478-2ecf37cefe31" },
    { name: "Acquired", itunesId: "1050462261", taddyUuid: "5337c76a-b031-4bc9-aa9f-a23d014413e6" },
    { name: "ReThinking with Adam Grant", itunesId: "1554567118", taddyUuid: "b1951f8e-0f0f-4f45-819f-450710387594" },
    { name: "The Tony Robbins Podcast", itunesId: "1098413063", taddyUuid: "5ef8b6d4-3d14-42a1-a4b3-5c41c2bf69e0" },
    { name: "Exponent", itunesId: "826420969", taddyUuid: "5726259c-6ef9-4eda-b79b-541129a09607" },
    { name: "Exponential View with Azeem Azhar", itunesId: "1172218725", taddyUuid: "cbb06af9-6b82-404d-a429-15599fb747e3" },
    { name: "New Heights with Jason & Travis Kelce", itunesId: "1643745036", taddyUuid: "d89c88f6-0411-4935-ba19-bd829cafbe40" },
    { name: "The Pitch", itunesId: "1008577710", taddyUuid: "a6b46afb-4dca-4fbe-bea1-50da270bfe48" },
    { name: "Product Hunt Radio", itunesId: "862714883", taddyUuid: "36cdd280-b1d6-446c-9fb1-adba264d3c03" },
    { name: "Philosophize This!", itunesId: "659155419", taddyUuid: "ce09ccb7-e48e-430c-80a0-0d3d631c99f1" },
    { name: "Moonshots with Peter Diamandis", itunesId: "1648228034", taddyUuid: "3b8de1a5-3c52-42d6-8043-f0b84e689770" },
    { name: "The Ultimate Human with Gary Brecka", itunesId: "1709740887", taddyUuid: "729f5c3b-c15d-4d7c-984b-ae681f9c980f" },
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
