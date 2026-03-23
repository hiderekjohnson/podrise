const TADDY_API_URL = "https://api.taddy.org";

const podcastCache = new Map<string, { result: TaddySearchResult | null; expiry: number }>();
const episodeCache = new Map<string, { result: TaddyEpisode[]; expiry: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

const MONTHLY_BUDGET_LIMIT = 450000;
const BUDGET_WARNING_THRESHOLD = 400000;
let inMemoryCallCount = 0;
let inMemoryMonthKey = "";
let rateLimitedUntil = 0;
let lastBudgetSyncAt = 0;
const BUDGET_SYNC_INTERVAL_MS = 5 * 60 * 1000;

// --- Per-minute sliding-window rate limiter ---
// Taddy allows 250 req/min. We self-limit to 60 to stay well clear (24% of their limit).
const PER_MINUTE_LIMIT = 60;
const requestTimestamps: number[] = [];

function perMinuteSlotAvailable(): boolean {
  const cutoff = Date.now() - 60_000;
  while (requestTimestamps.length > 0 && requestTimestamps[0] < cutoff) {
    requestTimestamps.shift();
  }
  return requestTimestamps.length < PER_MINUTE_LIMIT;
}

async function waitForRateLimitSlot(): Promise<void> {
  const start = Date.now();
  let logged = false;
  while (!perMinuteSlotAvailable()) {
    if (!logged) {
      const { used } = getTaddyPerMinuteStatus();
      console.warn(`[TaddyRateLimit] At capacity (${used}/${PER_MINUTE_LIMIT} req/min) — throttling next request`);
      logged = true;
    }
    const waitMs = Math.min((requestTimestamps[0] + 60_000) - Date.now() + 50, 2000);
    if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
    if (Date.now() - start > 90_000) {
      console.warn("[TaddyRateLimit] Waited >90s for a slot — proceeding anyway to avoid stall");
      break;
    }
  }
  requestTimestamps.push(Date.now());
}

export function getTaddyPerMinuteStatus(): { used: number; limit: number } {
  const cutoff = Date.now() - 60_000;
  const recent = requestTimestamps.filter(t => t >= cutoff).length;
  return { used: recent, limit: PER_MINUTE_LIMIT };
}

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function syncBudgetFromDb(): Promise<void> {
  try {
    const { pool } = await import("./db");
    const monthKey = getCurrentMonthKey();
    const { rows } = await pool.query(
      `SELECT call_count FROM taddy_api_usage WHERE month_key = $1 LIMIT 1`,
      [monthKey]
    );
    if (rows.length > 0) {
      inMemoryCallCount = rows[0].call_count;
    } else {
      inMemoryCallCount = 0;
    }
    inMemoryMonthKey = monthKey;
    lastBudgetSyncAt = Date.now();
  } catch (err) {
    console.warn("[TaddyBudget] Failed to sync from DB:", err);
  }
}

async function incrementBudgetCounter(): Promise<void> {
  const monthKey = getCurrentMonthKey();
  if (monthKey !== inMemoryMonthKey) {
    inMemoryCallCount = 0;
    inMemoryMonthKey = monthKey;
  }
  inMemoryCallCount++;

  try {
    const { pool } = await import("./db");
    await pool.query(
      `INSERT INTO taddy_api_usage (month_key, call_count, updated_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (month_key) DO UPDATE SET call_count = taddy_api_usage.call_count + 1, updated_at = NOW()`,
      [monthKey]
    );
  } catch {
  }
}

export function isTaddyBudgetExhausted(): boolean {
  if (Date.now() < rateLimitedUntil) return true;
  const monthKey = getCurrentMonthKey();
  if (monthKey !== inMemoryMonthKey) return false;
  return inMemoryCallCount >= MONTHLY_BUDGET_LIMIT;
}

export function isTaddyBudgetWarning(): boolean {
  const monthKey = getCurrentMonthKey();
  if (monthKey !== inMemoryMonthKey) return false;
  return inMemoryCallCount >= BUDGET_WARNING_THRESHOLD;
}

export function getTaddyBudgetStatus(): { monthKey: string; callCount: number; limit: number; exhausted: boolean; rateLimitedUntil: number } {
  return {
    monthKey: getCurrentMonthKey(),
    callCount: inMemoryCallCount,
    limit: MONTHLY_BUDGET_LIMIT,
    exhausted: isTaddyBudgetExhausted(),
    rateLimitedUntil,
  };
}

export function markTaddyRateLimited(durationMs: number = 60000): void {
  rateLimitedUntil = Date.now() + durationMs;
  console.warn(`[TaddyBudget] Rate limited, backing off for ${durationMs / 1000}s`);
}

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
    return null;
  }

  const cacheKey = `podcast_${numericId}`;
  const cached = podcastCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.result;
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
    console.log(`[Taddy] iTunes ID ${numericId} not found, no name fallback — returning null`);
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
    console.log(`[Taddy] Episodes by itunesId ${numericId} not found, no name fallback — returning empty`);
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

export interface TaddySeriesWithEpisodes {
  uuid: string;
  name: string;
  taddyTranscribeStatus?: string;
  episodes: Array<{
    uuid: string;
    name: string;
    datePublished?: number;
    taddyTranscribeStatus?: string;
  }>;
}

export async function getPodcastSeriesWithEpisodes(
  opts: { uuid?: string; itunesId?: number },
  epLimit: number = 25
): Promise<TaddySeriesWithEpisodes | null> {
  epLimit = Math.min(epLimit, 25);
  let query: string;
  if (opts.uuid) {
    query = `{
      getPodcastSeries(uuid: "${opts.uuid}") {
        uuid
        name
        taddyTranscribeStatus
        episodes(sortOrder: LATEST, limitPerPage: ${epLimit}) {
          uuid
          name
          datePublished
          taddyTranscribeStatus
        }
      }
    }`;
  } else if (opts.itunesId) {
    query = `{
      getPodcastSeries(itunesId: ${opts.itunesId}) {
        uuid
        name
        taddyTranscribeStatus
        episodes(sortOrder: LATEST, limitPerPage: ${epLimit}) {
          uuid
          name
          datePublished
          taddyTranscribeStatus
        }
      }
    }`;
  } else {
    return null;
  }

  const data = await taddyRequest(query);
  return data?.data?.getPodcastSeries || null;
}

export async function getTranscriptCreditsRemaining(): Promise<number | null> {
  const data = await taddyRequest("{ getTranscriptCreditsRemaining }");
  return data?.data?.getTranscriptCreditsRemaining ?? null;
}

export async function registerWebhook(endpointUrl: string, events: string[] = ["new_episodes_released"]): Promise<any> {
  const eventsStr = events.map(e => `"${e}"`).join(", ");
  const query = `mutation { addWebhookUrlForUser(endpointUrl: "${endpointUrl}", webhookEvents: [${eventsStr}]) { id endpointUrl isVerified isActive webhookSecret events } }`;
  const data = await taddyRequest(query);
  return data?.data?.addWebhookUrlForUser;
}

export async function addWebhookFilter(webhookId: string, filter: { eventType: string; includedUuids?: string[] }): Promise<any> {
  const uuidsStr = filter.includedUuids ? `[${filter.includedUuids.map(u => `"${u}"`).join(", ")}]` : "[]";
  const query = `mutation { addWebhookFilter(webhookId: "${webhookId}", filter: { eventType: "${filter.eventType}", includedUuids: ${uuidsStr} }) { uuid eventType hasIncludedUuids includedUuids } }`;
  const data = await taddyRequest(query);
  return data?.data?.addWebhookFilter;
}

export async function removeWebhookFilter(filterUuid: string): Promise<any> {
  const query = `mutation { removeWebhookFilter(uuid: "${filterUuid}") { uuid } }`;
  const data = await taddyRequest(query);
  return data?.data?.removeWebhookFilter;
}

export async function getMyWebhooks(): Promise<any> {
  const query = `{ getMyDeveloperWebhooks { userId webhooks { id endpointUrl isVerified isActive events webhookSecret filters { uuid eventType hasIncludedUuids includedUuids } } } }`;
  const data = await taddyRequest(query);
  return data?.data?.getMyDeveloperWebhooks;
}

export async function deleteWebhook(webhookId: string): Promise<any> {
  const query = `mutation { deleteWebhookForUser(id: "${webhookId}") { id } }`;
  const data = await taddyRequest(query);
  return data?.data?.deleteWebhookForUser;
}

async function taddyRequest(query: string, skipBudgetCheck: boolean = false): Promise<any> {
  const userId = process.env.TADDY_USER_ID;
  const apiKey = process.env.TADDY_API_KEY;

  if (!userId || !apiKey) {
    console.warn("Taddy API credentials not configured");
    return null;
  }

  if (Date.now() - lastBudgetSyncAt > BUDGET_SYNC_INTERVAL_MS || lastBudgetSyncAt === 0) {
    await syncBudgetFromDb();
  }

  if (!skipBudgetCheck && isTaddyBudgetExhausted()) {
    console.warn("[TaddyBudget] Budget exhausted, skipping API call");
    return null;
  }

  await incrementBudgetCounter();

  // Throttle: wait for a per-minute slot before sending the request
  await waitForRateLimitSlot();

  const response = await fetch(TADDY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-USER-ID": userId,
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ query }),
  });

  if (response.status === 429) {
    markTaddyRateLimited(120000);
    console.error("[Taddy] Rate limited (429)");
    import("./adminAlertService").then(({ sendCriticalApiAlert, classifyTaddyError }) =>
      sendCriticalApiAlert({ apiName: "Taddy", errorType: classifyTaddyError(429, ""), errorMessage: "Taddy API returned HTTP 429. Episode ingestion is blocked.", adminPath: "/admin/internal-tools/alerts" })
    ).catch(() => {});
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    if (text.includes("API_RATE_LIMIT_EXCEEDED")) {
      markTaddyRateLimited(300000);
      console.error("[Taddy] API rate limit exceeded");
    }
    import("./adminAlertService").then(({ sendCriticalApiAlert, isCriticalTaddyError, classifyTaddyError }) => {
      if (isCriticalTaddyError(response.status, text)) {
        sendCriticalApiAlert({ apiName: "Taddy", errorType: classifyTaddyError(response.status, text), errorMessage: `Taddy API error (HTTP ${response.status}): ${text.substring(0, 300)}. Episode ingestion may be blocked.`, adminPath: "/admin/internal-tools/alerts" }).catch(() => {});
      }
    }).catch(() => {});
    if (text.includes("API_RATE_LIMIT_EXCEEDED")) return null;
    console.error("Taddy API error:", response.status, text);
    return null;
  }

  const data = await response.json();

  const errorMessages = (data?.errors || []).map((e: { message?: string }) => e?.message || "").join(" ");
  if (errorMessages.includes("API_RATE_LIMIT_EXCEEDED")) {
    markTaddyRateLimited(300000);
    console.error("[Taddy] API rate limit exceeded (in response)");
    import("./adminAlertService").then(({ sendCriticalApiAlert, classifyTaddyError }) =>
      sendCriticalApiAlert({ apiName: "Taddy", errorType: classifyTaddyError(200, errorMessages), errorMessage: "Taddy API rate limit exceeded in response body. Episode ingestion is blocked.", adminPath: "/admin/internal-tools/alerts" })
    ).catch(() => {});
    return null;
  }
  if (data?.errors?.length > 0) {
    import("./adminAlertService").then(({ sendCriticalApiAlert, isCriticalTaddyError, classifyTaddyError }) => {
      if (isCriticalTaddyError(200, errorMessages)) {
        sendCriticalApiAlert({ apiName: "Taddy", errorType: classifyTaddyError(200, errorMessages), errorMessage: `Taddy GraphQL errors: ${errorMessages.substring(0, 300)}`, adminPath: "/admin/internal-tools/alerts" }).catch(() => {});
      }
    }).catch(() => {});
  }

  if (isTaddyBudgetWarning()) {
    console.warn(`[TaddyBudget] Warning: ${inMemoryCallCount}/${MONTHLY_BUDGET_LIMIT} calls used this month`);
  }

  return data;
}
