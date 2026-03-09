import { pool } from "./db";
import { storage } from "./storage";
import { writeFileSync } from "fs";

const STATUS_FILE = "/tmp/backfill_status.json";

interface PodcastResult {
  name: string;
  error?: string;
}

interface BackfillState {
  currentIndex: number;
  currentName: string;
  totalPodcasts: number;
  processedNames: string[];
  podcastResults: Record<string, PodcastResult>;
  running: boolean;
}

function writeStatus(data: BackfillState) {
  try {
    writeFileSync(STATUS_FILE, JSON.stringify(data));
  } catch {}
}

const TADDY_API_URL = "https://api.taddy.org";
const EPISODES_PER_PAGE = 25;
const TARGET_TRANSCRIPTS_PER_PODCAST = 25;
const DELAY_BETWEEN_REQUESTS_MS = 400;
const DELAY_BETWEEN_PODCASTS_MS = 1000;
const TRANSCRIPT_FETCH_TIMEOUT_MS = 30000;
const EPISODE_LIST_TIMEOUT_MS = 20000;
const MAX_PAGES_PER_PODCAST = 10;

async function taddyRequest(query: string, timeoutMs: number = 20000): Promise<any> {
  const userId = process.env.TADDY_USER_ID;
  const apiKey = process.env.TADDY_API_KEY;
  if (!userId || !apiKey) throw new Error("Taddy credentials not configured");

  const res = await fetch(TADDY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-USER-ID": userId,
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Taddy API ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

async function downloadTranscript(episodeUuid: string): Promise<string | null> {
  const query = `{ getEpisodeTranscript(uuid: "${episodeUuid}") { id text speaker } }`;
  const data = await taddyRequest(query, TRANSCRIPT_FETCH_TIMEOUT_MS);

  if (data?.errors?.length) {
    const msg = data.errors[0]?.message || "";
    if (msg.includes("Pro or Business")) return null;
    throw new Error(`Transcript error: ${msg.slice(0, 200)}`);
  }

  const segments = data?.data?.getEpisodeTranscript;
  if (!segments || !Array.isArray(segments) || segments.length === 0) return null;

  const text = segments.map((s: any) => (s.speaker ? `[${s.speaker}] ` : "") + s.text).join("\n");
  return text.length > 100 ? text : null;
}

export async function runBackfillTranscripts() {
  console.log("========================================");
  console.log("TRANSCRIPT BACKFILL - Phase 1");
  console.log("Target: 25 transcripts per podcast");
  console.log("========================================");

  const client = await pool.connect();
  let podcasts: Array<{ itunesId: string; name: string; taddyUuid: string }>;
  let existingByPodcast: Map<string, Set<string>>;

  try {
    const { rows: podcastRows } = await client.query(
      "SELECT itunes_id, name, taddy_uuid FROM podcast_directory WHERE has_landing_page = true AND taddy_uuid IS NOT NULL ORDER BY name ASC"
    );
    podcasts = podcastRows.map(r => ({ itunesId: r.itunes_id, name: r.name, taddyUuid: r.taddy_uuid }));

    const { rows: transcriptRows } = await client.query("SELECT podcast_id, episode_guid FROM episode_transcripts");
    existingByPodcast = new Map();
    for (const r of transcriptRows) {
      if (!existingByPodcast.has(r.podcast_id)) {
        existingByPodcast.set(r.podcast_id, new Set());
      }
      existingByPodcast.get(r.podcast_id)!.add(r.episode_guid);
    }
  } finally {
    client.release();
  }

  const totalPodcasts = podcasts.length;
  let totalNewDownloads = 0;
  let totalFailed = 0;
  const startTime = Date.now();
  const processedNames: string[] = [];
  const podcastResults: Record<string, PodcastResult> = {};

  console.log(`${totalPodcasts} podcasts to process (alphabetically A-Z)`);
  console.log(`${Array.from(existingByPodcast.values()).reduce((sum, s) => sum + s.size, 0)} transcripts already in database`);
  console.log("========================================\n");

  const state: BackfillState = { currentIndex: 0, currentName: "", totalPodcasts, processedNames, podcastResults, running: true };
  writeStatus(state);

  for (let i = 0; i < podcasts.length; i++) {
    const podcast = podcasts[i];
    const podcastNum = i + 1;
    const existingGuids = existingByPodcast.get(podcast.itunesId) || new Set();
    const existingCount = existingGuids.size;
    const needed = TARGET_TRANSCRIPTS_PER_PODCAST - existingCount;

    state.currentIndex = podcastNum;
    state.currentName = podcast.name;
    writeStatus(state);

    if (needed <= 0) {
      console.log(`[${podcastNum}/${totalPodcasts}] ${podcast.name} - ALREADY DONE (${existingCount} transcripts)`);
      processedNames.push(podcast.name);
      writeStatus(state);
      continue;
    }

    let downloaded = 0;
    let failed = 0;
    let totalEpisodesScanned = 0;
    let availableTranscripts = 0;

    try {
      for (let page = 1; page <= MAX_PAGES_PER_PODCAST; page++) {
        if (downloaded >= needed) break;

        const query = `{ getPodcastSeries(uuid: "${podcast.taddyUuid}") { uuid episodes(sortOrder: LATEST, limitPerPage: ${EPISODES_PER_PAGE}, page: ${page}) { uuid name taddyTranscribeStatus } } }`;
        const data = await taddyRequest(query, EPISODE_LIST_TIMEOUT_MS);
        const episodes = data?.data?.getPodcastSeries?.episodes;

        if (!episodes || !Array.isArray(episodes) || episodes.length === 0) break;

        totalEpisodesScanned += episodes.length;

        for (const ep of episodes) {
          if (downloaded >= needed) break;
          if (ep.taddyTranscribeStatus !== "COMPLETED") continue;

          availableTranscripts++;

          if (existingGuids.has(ep.uuid)) continue;

          try {
            const text = await downloadTranscript(ep.uuid);
            if (text) {
              await storage.saveTranscript({
                podcastId: podcast.itunesId,
                episodeGuid: ep.uuid,
                episodeTitle: ep.name || "Untitled",
                transcript: text,
              });
              existingGuids.add(ep.uuid);
              downloaded++;
              totalNewDownloads++;
            }
          } catch (err: any) {
            failed++;
            totalFailed++;
          }

          await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS_MS));
        }

        if (episodes.length < EPISODES_PER_PAGE) break;
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS_MS));
      }

      const finalCount = existingCount + downloaded;
      const status = finalCount >= TARGET_TRANSCRIPTS_PER_PODCAST ? "DONE" : `${finalCount}/${TARGET_TRANSCRIPTS_PER_PODCAST}`;
      const details = [];
      if (downloaded > 0) details.push(`${downloaded} new`);
      if (existingCount > 0) details.push(`${existingCount} existing`);
      if (failed > 0) details.push(`${failed} failed`);

      let errorMsg: string | undefined;
      if (finalCount < TARGET_TRANSCRIPTS_PER_PODCAST) {
        if (availableTranscripts === 0 && totalEpisodesScanned > 0) {
          errorMsg = `No transcripts available on Taddy (${totalEpisodesScanned} episodes scanned, none transcribed)`;
          details.push("no transcripts on Taddy");
        } else if (availableTranscripts > 0 && availableTranscripts < needed) {
          errorMsg = `Only ${availableTranscripts + existingCount} transcripts available on Taddy (need ${TARGET_TRANSCRIPTS_PER_PODCAST})`;
        } else if (failed > 0) {
          errorMsg = `${failed} transcript downloads failed`;
        } else if (totalEpisodesScanned === 0) {
          errorMsg = "No episodes found on Taddy for this podcast";
        }
      }

      podcastResults[podcast.name] = { name: podcast.name, error: errorMsg };

      console.log(`[${podcastNum}/${totalPodcasts}] ${podcast.name} - ${status} (${details.join(", ")})`);
      processedNames.push(podcast.name);
    } catch (err: any) {
      totalFailed++;
      const errorMsg = err.message?.slice(0, 200) || "Unknown error";
      podcastResults[podcast.name] = { name: podcast.name, error: errorMsg };
      console.log(`[${podcastNum}/${totalPodcasts}] ${podcast.name} - ERROR: ${errorMsg}`);
      processedNames.push(podcast.name);
    }

    writeStatus(state);
    await new Promise(r => setTimeout(r, DELAY_BETWEEN_PODCASTS_MS));
  }

  state.running = false;
  state.currentName = "";
  state.currentIndex = totalPodcasts;
  writeStatus(state);

  const elapsed = (Date.now() - startTime) / 1000;
  console.log("\n========================================");
  console.log("BACKFILL COMPLETE");
  console.log(`${totalNewDownloads} new transcripts downloaded`);
  console.log(`${totalFailed} failures`);
  console.log(`Time: ${Math.floor(elapsed / 60)}m ${Math.floor(elapsed % 60)}s`);
  console.log("========================================");
}

if (process.argv[1]?.includes("backfillTranscripts")) {
  runBackfillTranscripts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
