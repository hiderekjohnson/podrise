let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set");
  }

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`Spotify token request failed: ${res.status}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return cachedToken.token;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/^(ep\.?|episode|e)\s*#?\d+[\s:\-–—|]*/i, "")
    .replace(/[''""]/g, "'")
    .replace(/[:\-–—|]/g, " ")
    .replace(/[^\w\s']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function simplifyTitle(title: string): string {
  const normalized = normalizeTitle(title);
  const words = normalized.split(" ");
  if (words.length > 6) {
    return words.slice(0, 6).join(" ");
  }
  return normalized;
}

function titlesMatch(a: string, b: string): boolean {
  const aTrimmed = a.trim();
  const bTrimmed = b.trim();
  if (!aTrimmed || !bTrimmed) return false;
  if (aTrimmed.toLowerCase() === bTrimmed.toLowerCase()) return true;
  if (aTrimmed.toLowerCase().includes(bTrimmed.toLowerCase()) || bTrimmed.toLowerCase().includes(aTrimmed.toLowerCase())) return true;

  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;

  return false;
}

function showNamesMatch(a: string, b: string): boolean {
  const normA = a.toLowerCase().trim();
  const normB = b.toLowerCase().trim();
  if (!normA || !normB) return false;
  return normA === normB || normA.includes(normB) || normB.includes(normA);
}

async function searchSpotifyEpisodeWithQuery(token: string, query: string, episodeTitle: string, podcastName: string): Promise<string | null> {
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=episode&limit=10`,
    {
      headers: { "Authorization": `Bearer ${token}` }
    }
  );

  if (!res.ok) return null;

  const data = await res.json();
  const episodes = data?.episodes?.items;
  if (!episodes || episodes.length === 0) return null;

  const match = episodes.find((ep: any) => {
    const epName = ep.name || "";
    const showName = ep.show?.name || "";
    return titlesMatch(epName, episodeTitle) && showNamesMatch(showName, podcastName);
  }) || episodes.find((ep: any) => {
    const epName = ep.name || "";
    return titlesMatch(epName, episodeTitle);
  });

  if (match?.external_urls?.spotify) {
    return match.external_urls.spotify;
  }

  return null;
}

export async function searchSpotifyEpisode(podcastName: string, episodeTitle: string): Promise<string | null> {
  try {
    const token = await getAccessToken();

    const fullQuery = `${episodeTitle} ${podcastName}`;
    const result = await searchSpotifyEpisodeWithQuery(token, fullQuery, episodeTitle, podcastName);
    if (result) return result;

    const titleOnlyResult = await searchSpotifyEpisodeWithQuery(token, episodeTitle, episodeTitle, podcastName);
    if (titleOnlyResult) return titleOnlyResult;

    const simplified = simplifyTitle(episodeTitle);
    if (simplified !== episodeTitle.toLowerCase().trim() && simplified !== normalizeTitle(episodeTitle)) {
      const simplifiedResult = await searchSpotifyEpisodeWithQuery(token, `${simplified} ${podcastName}`, episodeTitle, podcastName);
      if (simplifiedResult) return simplifiedResult;
    }

    console.warn(`[Spotify] No episode match found for "${episodeTitle}" on podcast "${podcastName}"`);
    return null;
  } catch (err) {
    console.warn("[Spotify] Search error:", err);
    return null;
  }
}

export async function searchSpotifyShow(podcastName: string): Promise<string | null> {
  try {
    const token = await getAccessToken();
    const query = encodeURIComponent(podcastName);
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${query}&type=show&limit=5`,
      {
        headers: { "Authorization": `Bearer ${token}` }
      }
    );

    if (!res.ok) return null;

    const data = await res.json();
    const shows = data?.shows?.items;
    if (!shows || shows.length === 0) return null;

    const nameNorm = podcastName.toLowerCase().trim();
    const match = shows.find((s: any) => {
      const showName = (s.name || "").toLowerCase().trim();
      return showName === nameNorm || showName.includes(nameNorm) || nameNorm.includes(showName);
    }) || shows[0];

    if (match?.external_urls?.spotify) {
      return match.external_urls.spotify;
    }

    return null;
  } catch (err) {
    console.warn("[Spotify] Show search error:", err);
    return null;
  }
}
