import { pool } from "./db";
import { writeFileSync } from "fs";

const STATUS_FILE = "/tmp/backfill_status.json";
const DELAY_MS = 300;

async function fetchAppleTrackCount(itunesId: string): Promise<number> {
  const res = await fetch(`https://itunes.apple.com/lookup?id=${itunesId}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Apple API error: ${res.status}`);
  const data = await res.json();
  const result = data?.results?.[0];
  return result?.trackCount || 0;
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows: podcasts } = await client.query(
      `SELECT name, itunes_id FROM podcast_directory ORDER BY name ASC`
    );

    const { rows: transcriptCounts } = await client.query(
      `SELECT podcast_id, COUNT(*)::int as cnt FROM episode_transcripts GROUP BY podcast_id`
    );
    const tcMap = new Map(transcriptCounts.map((r: any) => [r.podcast_id, r.cnt]));

    console.log(`Fetching episode counts from Apple for ${podcasts.length} podcasts...\n`);

    const podcastResults: Record<string, { name: string; totalEpisodes: number; error?: string }> = {};
    const processedNames: string[] = [];
    let badIdCount = 0;

    for (let i = 0; i < podcasts.length; i++) {
      const p = podcasts[i];
      const num = i + 1;

      try {
        const trackCount = await fetchAppleTrackCount(p.itunes_id);
        const transcripts = tcMap.get(p.itunes_id) || 0;

        if (trackCount === 0) {
          badIdCount++;
          podcastResults[p.name] = { name: p.name, totalEpisodes: 0, error: `iTunes ID ${p.itunes_id} not found on Apple` };
          console.log(`[${num}/${podcasts.length}] ${p.name} - BAD ID (${p.itunes_id} not found on Apple)`);
        } else {
          podcastResults[p.name] = { name: p.name, totalEpisodes: trackCount };
          await client.query(
            `UPDATE podcast_directory SET total_episodes = $1 WHERE itunes_id = $2`,
            [trackCount, p.itunes_id]
          );
          console.log(`[${num}/${podcasts.length}] ${p.name} - ${trackCount} episodes, ${transcripts} transcripts`);
        }
      } catch (err: any) {
        podcastResults[p.name] = { name: p.name, totalEpisodes: 0, error: err.message?.slice(0, 200) };
        console.log(`[${num}/${podcasts.length}] ${p.name} - ERROR: ${err.message?.slice(0, 100)}`);
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

    console.log(`\nDone! ${badIdCount > 0 ? `${badIdCount} podcasts have bad iTunes IDs that need manual correction.` : "All IDs verified."}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
