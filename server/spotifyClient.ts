let connectionSettings: any;

async function getAccessToken(): Promise<string> {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=spotify',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!accessToken) {
    throw new Error('Spotify not connected');
  }

  return accessToken;
}

export async function searchSpotifyEpisode(podcastName: string, episodeTitle: string): Promise<string | null> {
  try {
    const token = await getAccessToken();
    const query = encodeURIComponent(`${episodeTitle} ${podcastName}`);
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${query}&type=episode&limit=5`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
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
