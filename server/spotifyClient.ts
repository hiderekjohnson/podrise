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

export async function searchSpotifyEpisode(podcastName: string, episodeTitle: string): Promise<string | null> {
  try {
    const token = await getAccessToken();
    const query = encodeURIComponent(`${episodeTitle} ${podcastName}`);
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${query}&type=episode&limit=5`,
      {
        headers: { "Authorization": `Bearer ${token}` }
      }
    );

    if (!res.ok) return null;

    const data = await res.json();
    const episodes = data?.episodes?.items;
    if (!episodes || episodes.length === 0) return null;

    const titleNorm = episodeTitle.toLowerCase().trim();
    const podNorm = podcastName.toLowerCase().trim();

    const match = episodes.find((ep: any) => {
      const epName = (ep.name || "").toLowerCase().trim();
      const showName = (ep.show?.name || "").toLowerCase().trim();
      const titleMatch = epName === titleNorm || epName.includes(titleNorm) || titleNorm.includes(epName);
      const showMatch = showName.includes(podNorm) || podNorm.includes(showName);
      return titleMatch && showMatch;
    }) || episodes.find((ep: any) => {
      const epName = (ep.name || "").toLowerCase().trim();
      return epName === titleNorm || epName.includes(titleNorm) || titleNorm.includes(epName);
    });

    if (match?.external_urls?.spotify) {
      return match.external_urls.spotify;
    }

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
