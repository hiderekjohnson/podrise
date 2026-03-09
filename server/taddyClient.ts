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

export async function searchPodcastByName(podcastName: string): Promise<TaddySearchResult | null> {
  const cacheKey = `podcast_name_${podcastName.toLowerCase().trim()}`;
  const cached = podcastCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.result;
  }

  const searchName = podcastName.replace(/"/g, '\\"').slice(0, 150);
  const query = `{
    searchForTerm(term: "${searchName}", filterForTypes: PODCASTSERIES, limitPerPage: 5) {
      searchId
      podcastSeries {
        uuid
        name
        itunesId
      }
    }
  }`;

  const data = await taddyRequest(query);
  const results = data?.data?.searchForTerm?.podcastSeries;
  if (!results || !Array.isArray(results) || results.length === 0) {
    podcastCache.set(cacheKey, { result: null, expiry: Date.now() + CACHE_TTL_MS });
    return null;
  }

  const nameNorm = podcastName.toLowerCase().trim();
  if (nameNorm.length < 3) {
    podcastCache.set(cacheKey, { result: null, expiry: Date.now() + CACHE_TTL_MS });
    return null;
  }

  const exactMatch = results.find((r: any) => r.name?.toLowerCase()?.trim() === nameNorm);
  const partialMatch = results.find((r: any) => {
    const rNorm = r.name?.toLowerCase()?.trim() || "";
    return rNorm.includes(nameNorm) || nameNorm.includes(rNorm);
  });
  const result = exactMatch || partialMatch || null;

  if (!result) {
    podcastCache.set(cacheKey, { result: null, expiry: Date.now() + CACHE_TTL_MS });
    return null;
  }

  podcastCache.set(cacheKey, { result, expiry: Date.now() + CACHE_TTL_MS });
  return result;
}

export async function searchPodcastByItunesId(itunesId: string, podcastName?: string, storedTaddyUuid?: string): Promise<TaddySearchResult | null> {
  const numericId = parseInt(itunesId, 10);
  if (isNaN(numericId)) {
    console.warn(`Invalid iTunes ID for Taddy lookup: ${itunesId}`);
    if (podcastName) return searchPodcastByName(podcastName);
    return null;
  }

  const cacheKey = `podcast_${numericId}`;
  const cached = podcastCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.result;
  }
  const nameFallbackCached = podcastCache.get(`podcast_name_fallback_${numericId}`);
  if (nameFallbackCached && nameFallbackCached.expiry > Date.now()) {
    return nameFallbackCached.result;
  }

  if (storedTaddyUuid) {
    const result: TaddySearchResult = { uuid: storedTaddyUuid, name: podcastName || "", itunesId: numericId };
    podcastCache.set(cacheKey, { result, expiry: Date.now() + CACHE_TTL_MS });
    return result;
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
  if (result) {
    podcastCache.set(cacheKey, { result, expiry: Date.now() + CACHE_TTL_MS });
    return result;
  }

  if (podcastName) {
    console.log(`[Taddy] iTunes ID ${numericId} not found, falling back to name search for "${podcastName}"`);
    const nameResult = await searchPodcastByName(podcastName);
    if (nameResult) {
      const nameCacheKey = `podcast_name_fallback_${numericId}`;
      podcastCache.set(nameCacheKey, { result: nameResult, expiry: Date.now() + CACHE_TTL_MS });
    }
    return nameResult;
  }

  return null;
}

export async function getRecentEpisodesWithTranscripts(
  podcastUuid: string,
  limit: number = 10
): Promise<TaddyEpisode[]> {
  limit = Math.min(limit, 25);
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
    return [];
  }
  const episodes = data?.data?.getPodcastSeries?.episodes || [];
  if (episodes.length > 0) {
    episodeCache.set(cacheKey, { result: episodes, expiry: Date.now() + CACHE_TTL_MS });
  }
  return episodes;
}

export async function getEpisodesByItunesId(
  itunesId: string,
  limit: number = 25,
  podcastName?: string
): Promise<TaddyEpisode[]> {
  limit = Math.min(limit, 25);
  const numericId = parseInt(itunesId, 10);
  if (isNaN(numericId)) return [];

  const cacheKey = `episodes_itunes_${numericId}_${limit}`;
  const cached = episodeCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.result;
  }

  const query = `{
    getPodcastSeries(itunesId: ${numericId}) {
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
  let seriesData = data?.data?.getPodcastSeries;

  if (!seriesData && podcastName) {
    console.log(`[Taddy] Episodes by itunesId ${numericId} not found, falling back to name search for "${podcastName}"`);
    const nameResult = await searchPodcastByName(podcastName);
    if (nameResult?.uuid) {
      const episodes = await getRecentEpisodesWithTranscripts(nameResult.uuid, limit);
      if (episodes.length > 0) {
        episodeCache.set(cacheKey, { result: episodes, expiry: Date.now() + CACHE_TTL_MS });
      }
      return episodes;
    }
  }

  if (!seriesData?.episodes) {
    console.log(`[Taddy] Episodes by itunesId ${numericId}:`, JSON.stringify(data?.data?.getPodcastSeries || data?.errors || "null").slice(0, 300));
    return [];
  }
  const episodes = seriesData?.episodes || [];
  if (episodes.length > 0) {
    episodeCache.set(cacheKey, { result: episodes, expiry: Date.now() + CACHE_TTL_MS });
  }
  return episodes;
}

export async function searchEpisodeByName(
  podcastName: string,
  episodeName: string
): Promise<{ uuid: string; name: string } | null> {
  const searchTerm = `${podcastName} ${episodeName}`.replace(/"/g, '\\"').slice(0, 150);

  const query = `{
    searchForTerm(term: "${searchTerm}", filterForTypes: PODCASTEPISODE, limitPerPage: 5) {
      searchId
      podcastEpisodes {
        uuid
        name
        podcastSeries {
          uuid
          name
        }
      }
    }
  }`;

  const data = await taddyRequest(query);
  const episodes = data?.data?.searchForTerm?.podcastEpisodes;
  if (!episodes || !Array.isArray(episodes) || episodes.length === 0) {
    return null;
  }

  const podcastNorm = podcastName.toLowerCase().trim();
  const match = episodes.find((ep: any) => {
    const seriesName = ep.podcastSeries?.name?.toLowerCase()?.trim() || "";
    return seriesName.includes(podcastNorm) || podcastNorm.includes(seriesName);
  });

  return match || null;
}

export async function searchEpisodeShowNotes(
  podcastName: string,
  episodeName: string
): Promise<string | null> {
  const searchTerm = `${podcastName} ${episodeName}`.replace(/"/g, '\\"').slice(0, 150);

  const query = `{
    searchForTerm(term: "${searchTerm}", filterForTypes: PODCASTEPISODE, limitPerPage: 5) {
      searchId
      podcastEpisodes {
        uuid
        name
        description
        podcastSeries {
          uuid
          name
        }
      }
    }
  }`;

  const data = await taddyRequest(query);
  const episodes = data?.data?.searchForTerm?.podcastEpisodes;
  if (!episodes || !Array.isArray(episodes) || episodes.length === 0) {
    return null;
  }

  const podcastNorm = podcastName.toLowerCase().trim();
  const episodeNorm = episodeName.toLowerCase().trim();
  const match = episodes.find((ep: any) => {
    const seriesName = ep.podcastSeries?.name?.toLowerCase()?.trim() || "";
    const epName = ep.name?.toLowerCase()?.trim() || "";
    const seriesMatch = seriesName.includes(podcastNorm) || podcastNorm.includes(seriesName);
    const nameMatch = epName.includes(episodeNorm) || episodeNorm.includes(epName);
    return seriesMatch && nameMatch;
  }) || episodes.find((ep: any) => {
    const seriesName = ep.podcastSeries?.name?.toLowerCase()?.trim() || "";
    return seriesName.includes(podcastNorm) || podcastNorm.includes(seriesName);
  });

  if (!match?.description) return null;
  return match.description;
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
