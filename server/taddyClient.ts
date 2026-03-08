const TADDY_API_URL = "https://api.taddy.org";

const podcastCache = new Map<string, { result: TaddySearchResult | null; expiry: number }>();
const episodeCache = new Map<string, { result: TaddyEpisode[]; expiry: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

interface TaddyEpisode {
  uuid: string;
  name: string;
  datePublished: number;
  audioUrl: string;
}

export interface TaddyTranscriptSegment {
  id: string;
  text: string;
  speaker: string | null;
  startTimecode: number | null;
  endTimecode: number | null;
}

interface TaddySearchResult {
  uuid: string;
  name: string;
  itunesId: number;
}

export async function searchPodcastByItunesId(itunesId: string): Promise<TaddySearchResult | null> {
  const numericId = parseInt(itunesId, 10);
  if (isNaN(numericId)) {
    console.warn(`Invalid iTunes ID for Taddy lookup: ${itunesId}`);
    return null;
  }

  const cacheKey = `podcast_${numericId}`;
  const cached = podcastCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.result;
  }

  const query = `{
    getPodcastSeries(itunesId: ${numericId}) {
      uuid
      name
      itunesId
    }
  }`;

  const data = await taddyRequest(query);
  const result = data?.data?.getPodcastSeries || null;
  podcastCache.set(cacheKey, { result, expiry: Date.now() + CACHE_TTL_MS });
  return result;
}

export async function getRecentEpisodesWithTranscripts(
  podcastUuid: string,
  limit: number = 10
): Promise<TaddyEpisode[]> {
  const cacheKey = `episodes_${podcastUuid}_${limit}`;
  const cached = episodeCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.result;
  }

  const query = `{
    getPodcastSeries(uuid: "${podcastUuid}") {
      uuid
      name
      episodes(sortOrder: LATEST, limitPerPage: ${limit}) {
        uuid
        name
        datePublished
        audioUrl
      }
    }
  }`;

  const data = await taddyRequest(query);
  if (!data?.data?.getPodcastSeries?.episodes) {
    console.log(`[Taddy] Episodes response for ${podcastUuid}:`, JSON.stringify(data?.data?.getPodcastSeries || data?.errors || "null").slice(0, 500));
  }
  const episodes = data?.data?.getPodcastSeries?.episodes || [];
  episodeCache.set(cacheKey, { result: episodes, expiry: Date.now() + CACHE_TTL_MS });
  return episodes;
}

export async function getEpisodeTranscriptSegments(episodeUuid: string): Promise<TaddyTranscriptSegment[] | null> {
  const query = `{
    getEpisodeTranscript(uuid: "${episodeUuid}") {
      id
      text
      speaker
      startTimecode
      endTimecode
    }
  }`;

  const data = await taddyRequest(query);

  if (data?.errors?.length) {
    const errMsg = data.errors[0]?.message || "";
    if (errMsg.includes("Pro or Business")) {
      console.warn(`[Taddy] Transcript requires paid plan for episode ${episodeUuid}`);
    } else {
      console.warn(`[Taddy] Transcript error for ${episodeUuid}: ${errMsg}`);
    }
    return null;
  }

  const segments: TaddyTranscriptSegment[] = data?.data?.getEpisodeTranscript;
  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    return null;
  }

  return segments;
}

export async function getEpisodeTranscript(episodeUuid: string): Promise<string | null> {
  const query = `{
    getEpisodeTranscript(uuid: "${episodeUuid}") {
      id
      text
      speaker
      startTimecode
      endTimecode
    }
  }`;

  const data = await taddyRequest(query);

  if (data?.errors?.length) {
    const errMsg = data.errors[0]?.message || "";
    if (errMsg.includes("Pro or Business")) {
      console.warn(`[Taddy] Transcript requires paid plan for episode ${episodeUuid}`);
    } else {
      console.warn(`[Taddy] Transcript error for ${episodeUuid}: ${errMsg}`);
    }
    return null;
  }

  const segments: TaddyTranscriptSegment[] = data?.data?.getEpisodeTranscript;

  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    return null;
  }

  const lines: string[] = [];
  for (const seg of segments) {
    const speaker = seg.speaker ? `[${seg.speaker}] ` : "";
    lines.push(`${speaker}${seg.text}`);
  }

  return lines.join("\n");
}

async function taddyRequest(query: string): Promise<any> {
  const userId = process.env.TADDY_USER_ID;
  const apiKey = process.env.TADDY_API_KEY;

  if (!userId || !apiKey) {
    console.warn("Taddy API credentials not configured");
    return null;
  }

  const response = await fetch(TADDY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-USER-ID": userId,
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    console.error("Taddy API error:", response.status, await response.text());
    return null;
  }

  return response.json();
}
