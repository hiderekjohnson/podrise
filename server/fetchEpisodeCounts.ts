import { pool } from "./db";
import { writeFileSync } from "fs";

const STATUS_FILE = "/tmp/backfill_status.json";
const DELAY_MS = 300;

interface AppleResult {
  trackCount: number;
  correctedItunesId?: string;
}

async function fetchAppleTrackCount(itunesId: string, podcastName: string): Promise<AppleResult> {
  const res = await fetch(`https://itunes.apple.com/lookup?id=${itunesId}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Apple API error: ${res.status}`);
  const data = await res.json();
  const result = data?.results?.[0];
  if (result?.trackCount) return { trackCount: result.trackCount };

  await new Promise(r => setTimeout(r, 300));
  const searchRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(podcastName)}&media=podcast&limit=5`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!searchRes.ok) return { trackCount: 0 };
  const searchData = await searchRes.json();
  const nameLower = podcastName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const match = searchData?.results?.find((r: any) => {
    const cName = (r.collectionName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return cName === nameLower || cName.includes(nameLower) || nameLower.includes(cName);
  });
  if (match?.trackCount) {
    const correctedId = String(match.collectionId);
    console.log(`  ↳ Found via search: "${match.collectionName}" (Apple ID: ${correctedId}, ${match.trackCount} episodes)`);
    return { trackCount: match.trackCount, correctedItunesId: correctedId !== itunesId ? correctedId : undefined };
  }
  return { trackCount: 0 };
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows: podcasts } = await client.query(
      `SELECT name, itunes_id, taddy_uuid FROM podcast_directory ORDER BY name ASC`
    );

    const { rows: transcriptCounts } = await client.query(
      `SELECT podcast_id, COUNT(*)::int as cnt FROM episode_transcripts GROUP BY podcast_id`
    );
    const tcMap = new Map(transcriptCounts.map((r: any) => [r.podcast_id, r.cnt]));

    console.log(`Fetching episode counts from Apple for ${podcasts.length} podcasts...\n`);

    const podcastResults: Record<string, { name: string; totalEpisodes: number; error?: string }> = {};
    const processedNames: string[] = [];
    let correctedCount = 0;

    for (let i = 0; i < podcasts.length; i++) {
      const p = podcasts[i];
      const num = i + 1;

      try {
        const { trackCount, correctedItunesId } = await fetchAppleTrackCount(p.itunes_id, p.name);
        const transcripts = tcMap.get(p.itunes_id) || 0;
        podcastResults[p.name] = { name: p.name, totalEpisodes: trackCount };

        await client.query(
          `UPDATE podcast_directory SET total_episodes = $1 WHERE itunes_id = $2`,
          [trackCount, p.itunes_id]
        );

        if (correctedItunesId) {
          const { rows: existing } = await client.query(
            `SELECT id FROM podcast_directory WHERE itunes_id = $1`, [correctedItunesId]
          );
          if (existing.length === 0) {
            await client.query(
              `UPDATE podcast_directory SET itunes_id = $1 WHERE itunes_id = $2`,
              [correctedItunesId, p.itunes_id]
            );
            console.log(`  ↳ Corrected iTunes ID: ${p.itunes_id} → ${correctedItunesId}`);
            correctedCount++;
          } else {
            console.log(`  ↳ Skipped ID correction (${correctedItunesId} already exists)`);
          }
        }

        console.log(`[${num}/${podcasts.length}] ${p.name} — ${trackCount} episodes, ${transcripts} transcripts`);
      } catch (err: any) {
        podcastResults[p.name] = { name: p.name, totalEpisodes: 0, error: err.message?.slice(0, 200) };
        console.log(`[${num}/${podcasts.length}] ${p.name} — ERROR: ${err.message?.slice(0, 100)}`);
      }

      processedNames.push(p.name);
      writeFileSync(STATUS_FILE, JSON.stringify({
        currentIndex: num,
        currentName: p.name,
        totalPodcasts: podcasts.length,
        processedNames,
        podcastResults,
        running: i < podcasts.length - 1,
      }));

      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    console.log(`\nDone! Episode counts saved to database. ${correctedCount} iTunes IDs corrected.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
