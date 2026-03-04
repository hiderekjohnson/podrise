const TADDY_API_URL = "https://api.taddy.org";

interface TaddyEpisode {
  uuid: string;
  name: string;
  datePublished: number;
  audioUrl: string;
  transcript: string | null;
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

  const query = `{
    getPodcastSeries(itunesId: ${numericId}) {
      uuid
      name
      itunesId
    }
  }`;

  const data = await taddyRequest(query);
  return data?.data?.getPodcastSeries || null;
}

export async function getRecentEpisodesWithTranscripts(
  podcastUuid: string,
  limit: number = 10
): Promise<TaddyEpisode[]> {
  const query = `{
    getPodcastSeries(uuid: "${podcastUuid}") {
      uuid
      name
      episodes(first: ${limit}, sortOrder: LATEST) {
        data {
          uuid
          name
          datePublished
          audioUrl
          transcript
        }
      }
    }
  }`;

  const data = await taddyRequest(query);
  const episodes = data?.data?.getPodcastSeries?.episodes?.data || [];
  return episodes;
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
