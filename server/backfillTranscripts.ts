import { pool } from "./db";
import { storage } from "./storage";

const TADDY_API_URL = "https://api.taddy.org";
const EPISODES_PER_PAGE = 25;
const MAX_PAGES = 200;
const DELAY_BETWEEN_REQUESTS_MS = 400;
const DELAY_BETWEEN_PODCASTS_MS = 1000;
const TRANSCRIPT_FETCH_TIMEOUT_MS = 30000;
const EPISODE_LIST_TIMEOUT_MS = 20000;

interface BackfillStats {
  totalPodcasts: number;
  podcastsProcessed: number;
  podcastsSkipped: number;
  podcastsFailed: number;
  episodesFound: number;
  episodesWithTranscript: number;
  transcriptsAlreadyStored: number;
  transcriptsDownloaded: number;
  transcriptsFailed: number;
  startedAt: string;
}

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

async function getAllEpisodesForPodcast(taddyUuid: string): Promise<Array<{ uuid: string; name: string; taddyTranscribeStatus: string; datePublished: number }>> {
  const allEpisodes: any[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const query = `{ getPodcastSeries(uuid: "${taddyUuid}") { uuid totalEpisodesCount episodes(sortOrder: LATEST, limitPerPage: ${EPISODES_PER_PAGE}, page: ${page}) { uuid name taddyTranscribeStatus datePublished } } }`;

    const data = await taddyRequest(query, EPISODE_LIST_TIMEOUT_MS);
    const episodes = data?.data?.getPodcastSeries?.episodes;

    if (!episodes || !Array.isArray(episodes) || episodes.length === 0) {
      break;
    }

    allEpisodes.push(...episodes);

    if (episodes.length < EPISODES_PER_PAGE) {
      break;
    }

    await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS_MS));
  }

  return allEpisodes;
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

function printProgress(stats: BackfillStats, currentPodcast: string) {
  const elapsed = (Date.now() - new Date(stats.startedAt).getTime()) / 1000;
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);
  console.log(
    `[Backfill] ${stats.podcastsProcessed}/${stats.totalPodcasts} podcasts | ` +
    `${stats.transcriptsDownloaded} new transcripts | ` +
    `${stats.transcriptsAlreadyStored} already had | ` +
    `${stats.transcriptsFailed} failed | ` +
    `${mins}m${secs}s elapsed | ` +
    `Current: ${currentPodcast}`
  );
}

export async function runBackfillTranscripts() {
  console.log("[Backfill] ========================================");
  console.log("[Backfill] Starting transcript backfill...");
  console.log("[Backfill] ========================================");

  const client = await pool.connect();
  let podcasts: Array<{ itunesId: string; name: string; taddyUuid: string }>;
  let existingGuids: Set<string>;

  try {
    const { rows: podcastRows } = await client.query(
      "SELECT itunes_id, name, taddy_uuid FROM podcast_directory WHERE has_landing_page = true AND taddy_uuid IS NOT NULL ORDER BY name"
    );
    podcasts = podcastRows.map(r => ({ itunesId: r.itunes_id, name: r.name, taddyUuid: r.taddy_uuid }));

    const { rows: transcriptRows } = await client.query("SELECT episode_guid FROM episode_transcripts");
    existingGuids = new Set(transcriptRows.map(r => r.episode_guid));
  } finally {
    client.release();
  }

  console.log(`[Backfill] ${podcasts.length} podcasts to process`);
  console.log(`[Backfill] ${existingGuids.size} transcripts already in database`);

  const stats: BackfillStats = {
    totalPodcasts: podcasts.length,
    podcastsProcessed: 0,
    podcastsSkipped: 0,
    podcastsFailed: 0,
    episodesFound: 0,
    episodesWithTranscript: 0,
    transcriptsAlreadyStored: 0,
    transcriptsDownloaded: 0,
    transcriptsFailed: 0,
    startedAt: new Date().toISOString(),
  };

  for (const podcast of podcasts) {
    try {
      const episodes = await getAllEpisodesForPodcast(podcast.taddyUuid);

      if (episodes.length === 0) {
        stats.podcastsSkipped++;
        stats.podcastsProcessed++;
        continue;
      }

      stats.episodesFound += episodes.length;
      const withTranscript = episodes.filter(e => e.taddyTranscribeStatus === "COMPLETED");
      stats.episodesWithTranscript += withTranscript.length;

      let downloadedForPodcast = 0;
      let skippedForPodcast = 0;
      let failedForPodcast = 0;

      for (const ep of withTranscript) {
        if (existingGuids.has(ep.uuid)) {
          stats.transcriptsAlreadyStored++;
          skippedForPodcast++;
          continue;
        }

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
            stats.transcriptsDownloaded++;
            downloadedForPodcast++;
          }
        } catch (err: any) {
          stats.transcriptsFailed++;
          failedForPodcast++;
          console.warn(`[Backfill] Failed transcript for "${ep.name}": ${err.message?.slice(0, 150)}`);
        }

        await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS_MS));
      }

      if (downloadedForPodcast > 0 || failedForPodcast > 0) {
        console.log(`[Backfill] ${podcast.name}: ${episodes.length} episodes, ${withTranscript.length} with transcript, ${downloadedForPodcast} downloaded, ${skippedForPodcast} already had, ${failedForPodcast} failed`);
      }

      stats.podcastsProcessed++;
      if (stats.podcastsProcessed % 10 === 0) {
        printProgress(stats, podcast.name);
      }
    } catch (err: any) {
      stats.podcastsFailed++;
      stats.podcastsProcessed++;
      console.error(`[Backfill] FAILED podcast ${podcast.name}: ${err.message?.slice(0, 200)}`);
    }

    await new Promise(r => setTimeout(r, DELAY_BETWEEN_PODCASTS_MS));
  }

  console.log("[Backfill] ========================================");
  console.log("[Backfill] COMPLETE");
  console.log(`[Backfill] Podcasts: ${stats.podcastsProcessed} processed, ${stats.podcastsSkipped} skipped, ${stats.podcastsFailed} failed`);
  console.log(`[Backfill] Episodes found: ${stats.episodesFound} total, ${stats.episodesWithTranscript} with transcripts available`);
  console.log(`[Backfill] Transcripts: ${stats.transcriptsDownloaded} downloaded, ${stats.transcriptsAlreadyStored} already stored, ${stats.transcriptsFailed} failed`);
  const elapsed = (Date.now() - new Date(stats.startedAt).getTime()) / 1000;
  console.log(`[Backfill] Time: ${Math.floor(elapsed / 60)}m ${Math.floor(elapsed % 60)}s`);
  console.log("[Backfill] ========================================");

  return stats;
}

if (process.argv[1]?.includes("backfillTranscripts")) {
  runBackfillTranscripts()
    .then((stats) => {
      console.log(JSON.stringify(stats, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("[Backfill] Fatal error:", err);
      process.exit(1);
    });
}
