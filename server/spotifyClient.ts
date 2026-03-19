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
