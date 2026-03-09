const TADDY_API_URL = "https://api.taddy.org";
const taddyUserId = process.env.TADDY_USER_ID;
const taddyApiKey = process.env.TADDY_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!taddyUserId || !taddyApiKey || !DATABASE_URL) {
  console.error("Missing env vars");
  process.exit(1);
}

const { Client } = require("pg");

async function taddyRequest(query) {
  const res = await fetch(TADDY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-USER-ID": taddyUserId, "X-API-KEY": taddyApiKey },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) { console.error("Taddy error:", res.status); return null; }
  return res.json();
}

async function getEpisodeTranscript(uuid) {
  const data = await taddyRequest(`{ getEpisodeTranscript(uuid: "${uuid}") { id text speaker startTimecode endTimecode } }`);
  if (data?.errors?.length) return null;
  const segments = data?.data?.getEpisodeTranscript;
  if (!segments || !Array.isArray(segments) || segments.length === 0) return null;
  return segments.map(s => `${s.speaker ? `[${s.speaker}] ` : ""}${s.text}`).join("\n");
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  const { rows: dirRows } = await db.query("SELECT slug, itunes_id FROM podcast_directory WHERE has_landing_page = true AND itunes_id IS NOT NULL");
  const { rows: recapRows } = await db.query("SELECT slug, COUNT(*)::int as cnt FROM landing_page_recaps GROUP BY slug");
  const { rows: tRows } = await db.query("SELECT episode_guid FROM episode_transcripts");

  const recapCounts = {};
  for (const r of recapRows) recapCounts[r.slug] = r.cnt;
  const existingGuids = new Set(tRows.map(r => r.episode_guid));

  const TARGET = 25;
  const podcasts = dirRows
    .map(r => ({ slug: r.slug, itunesId: r.itunes_id, existing: recapCounts[r.slug] || 0 }))
    .filter(p => p.existing < TARGET)
    .sort((a, b) => a.existing - b.existing);

  const creditsData = await taddyRequest("{ getTranscriptCreditsRemaining }");
  console.log(`Credits: ${creditsData?.data?.getTranscriptCreditsRemaining}, Podcasts: ${podcasts.length}`);

  let totalDownloaded = 0, totalNoEp = 0, totalErrors = 0;

  for (let i = 0; i < podcasts.length; i++) {
    const p = podcasts[i];
    const needed = TARGET - p.existing;
    const numId = parseInt(p.itunesId, 10);
    if (isNaN(numId)) continue;

    try {
      const epLimit = Math.min(needed + 5, 50);
      let data = await taddyRequest(`{ getPodcastSeries(itunesId: ${numId}) { uuid name taddyTranscribeStatus episodes(sortOrder: LATEST, limitPerPage: ${epLimit}) { uuid name datePublished taddyTranscribeStatus } } }`);
      let series = data?.data?.getPodcastSeries;

      if (series?.uuid && (!series.episodes || series.episodes.length === 0)) {
        await sleep(800);
        data = await taddyRequest(`{ getPodcastSeries(uuid: "${series.uuid}") { uuid name taddyTranscribeStatus episodes(sortOrder: LATEST, limitPerPage: ${epLimit}) { uuid name datePublished taddyTranscribeStatus } } }`);
        const retry = data?.data?.getPodcastSeries;
        if (retry?.episodes?.length > 0) series = retry;
      }

      if (!series?.episodes?.length) {
        totalNoEp++;
        console.log(`[${i+1}/${podcasts.length}] ${p.slug}: no episodes (found=${!!series})`);
        await sleep(400);
        continue;
      }

      let dl = 0;
      for (const ep of series.episodes) {
        if (dl >= needed) break;
        if (existingGuids.has(ep.uuid)) continue;
        if (ep.taddyTranscribeStatus !== "COMPLETED") continue;

        try {
          const transcript = await getEpisodeTranscript(ep.uuid);
          if (transcript && transcript.length > 100) {
            await db.query(
              "INSERT INTO episode_transcripts (podcast_id, episode_guid, episode_title, transcript) VALUES ($1, $2, $3, $4) ON CONFLICT (episode_guid) DO NOTHING",
              [p.itunesId, ep.uuid, ep.name, transcript]
            );
            existingGuids.add(ep.uuid);
            dl++;
            totalDownloaded++;
          }
        } catch (e) { totalErrors++; }
        await sleep(250);
      }

      console.log(`[${i+1}/${podcasts.length}] ${p.slug}: +${dl} transcripts (total: ${totalDownloaded})`);
    } catch (err) {
      totalErrors++;
      console.log(`[${i+1}/${podcasts.length}] ${p.slug}: ERROR - ${err.message?.slice(0, 100)}`);
    }
    await sleep(400);
  }

  const creditsAfter = await taddyRequest("{ getTranscriptCreditsRemaining }");
  console.log(`\nDONE: ${totalDownloaded} downloaded, ${totalNoEp} no episodes, ${totalErrors} errors, credits: ${creditsAfter?.data?.getTranscriptCreditsRemaining}`);
  await db.end();
}

main().catch(e => { console.error(e); process.exit(1); });
