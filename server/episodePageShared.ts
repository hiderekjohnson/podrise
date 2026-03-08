function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface EpisodePageData {
  podcastName: string;
  podcastSlug: string;
  episodeTitle: string;
  episodeSlug: string;
  artworkUrl: string;
  formattedDate: string;
  duration: string;
  hosts: string;
  appleLink: string;
  spotifyLink: string;
  activeTab: "recap" | "transcript";
}

const APPLE_PODCASTS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ap-grad" x1="12" y1="24" x2="12" y2="0" gradientUnits="userSpaceOnUse"><stop stop-color="#822cbe"/><stop offset="1" stop-color="#d94afa"/></linearGradient></defs><rect width="24" height="24" rx="5.4" fill="url(#ap-grad)"/><path d="M12 5.6a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 4.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM12 13.1a1.15 1.15 0 0 0-1.15 1.15v.1l.35 4.3a.8.8 0 0 0 .8.75h.01a.8.8 0 0 0 .8-.75l.34-4.3v-.1A1.15 1.15 0 0 0 12 13.1Z" fill="white"/></svg>`;

const SPOTIFY_SVG = `<svg viewBox="0 0 24 24" fill="#1DB954"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`;

const HEADPHONES_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`;

const CALENDAR_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

const CLOCK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

const FILETEXT_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;

export function getEpisodePageTopStyles(): string {
  return `
    .header {
      position: sticky; top: 0; z-index: 50;
      background: rgba(248,249,251,0.8);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(0,0,0,0.04);
    }
    .header-inner {
      max-width: 896px; margin: 0 auto;
      padding: 0 16px; height: 56px;
      display: flex; align-items: center;
    }
    @media (min-width: 640px) {
      .header-inner { padding: 0 24px; }
    }
    .logo { height: 28px; }

    .container { max-width: 768px; margin: 0 auto; padding: 40px 16px 96px; }
    @media (min-width: 640px) {
      .container { padding: 40px 24px 96px; }
    }

    .hero { display: flex; gap: 20px; align-items: flex-start; margin-bottom: 40px; }
    @media (min-width: 640px) {
      .hero { gap: 24px; }
    }
    .artwork {
      width: 88px; height: 88px; border-radius: 16px;
      object-fit: cover; flex-shrink: 0;
      box-shadow: 0 10px 15px -3px rgba(0,0,0,0.08);
      outline: 1px solid rgba(0,0,0,0.04);
      outline-offset: -1px;
      cursor: pointer;
      transition: box-shadow 0.15s;
    }
    .artwork:hover {
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.12);
    }
    @media (min-width: 640px) {
      .artwork { width: 112px; height: 112px; }
    }
    .hero-info { min-width: 0; padding-top: 4px; }
    .podcast-name {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.05em; color: #1a8cff;
    }
    .podcast-name:hover { text-decoration: underline; }
    .podcast-name svg { width: 14px; height: 14px; }
    .ep-title {
      font-size: 22px; font-weight: 800; line-height: 1.25;
      color: #1a1a2e; margin-top: 8px; margin-bottom: 12px;
    }
    @media (min-width: 640px) { .ep-title { font-size: 28px; } }
    .ep-meta {
      font-size: 14px; color: #94a3b8;
      display: flex; flex-wrap: wrap; align-items: center;
      gap: 12px;
    }
    .ep-meta .meta-item { display: inline-flex; align-items: center; gap: 6px; }
    .ep-meta .meta-item svg { width: 14px; height: 14px; }
    .ep-meta .meta-dot { width: 4px; height: 4px; border-radius: 50%; background: rgba(0,0,0,0.15); }

    .listen-buttons {
      display: flex; align-items: center; gap: 8px; margin-top: 16px;
    }
    .listen-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 14px; border-radius: 8px;
      font-size: 12px; font-weight: 600;
      background: rgba(0,0,0,0.04); color: #1a1a2e;
      text-decoration: none; transition: background-color 0.15s;
    }
    .listen-btn:hover { background: rgba(0,0,0,0.08); text-decoration: none; }
    .listen-btn svg { width: 14px; height: 14px; flex-shrink: 0; }

    .page-tabs {
      display: flex; align-items: center;
      border-bottom: 1px solid rgba(0,0,0,0.06);
      margin-bottom: 40px;
    }
    .page-tab {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 20px;
      font-size: 14px; font-weight: 600;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      color: #64748b;
      text-decoration: none;
      transition: color 0.15s, border-color 0.15s;
    }
    .page-tab:hover { color: #1a1a2e; border-color: rgba(0,0,0,0.08); text-decoration: none; }
    .page-tab.active { color: #1a8cff; border-color: #1a8cff; }
    .page-tab svg { width: 16px; height: 16px; }
  `;
}

export function renderEpisodePageHeader(): string {
  return `<header class="header">
  <div class="header-inner">
    <a href="/">
      <img src="/podcap-logo.png" alt="PodCap" class="logo" data-testid="link-home-logo" />
    </a>
  </div>
</header>`;
}

export function renderEpisodePageHero(data: EpisodePageData): string {
  const {
    podcastName, podcastSlug, episodeTitle, episodeSlug,
    artworkUrl, formattedDate, duration, hosts,
    appleLink, spotifyLink, activeTab,
  } = data;

  const podcastUrl = `/podcasts/${podcastSlug}`;
  const recapUrl = `/podcasts/${podcastSlug}/${episodeSlug}`;
  const transcriptUrl = `/podcasts/${podcastSlug}/${episodeSlug}/transcript`;

  return `<div class="hero">
  ${artworkUrl ? `<a href="${podcastUrl}"><img src="${escapeHtml(artworkUrl)}" alt="${escapeHtml(podcastName)}" class="artwork" data-testid="img-episode-artwork" /></a>` : ""}
  <div class="hero-info">
    <a href="${podcastUrl}" class="podcast-name" data-testid="link-podcast-name">
      ${HEADPHONES_SVG}
      ${escapeHtml(podcastName)}
    </a>
    <h1 class="ep-title" data-testid="text-episode-title">${escapeHtml(episodeTitle)}</h1>
    <div class="ep-meta">
      ${formattedDate ? `<span class="meta-item" data-testid="text-episode-date">${CALENDAR_SVG}${formattedDate}</span>` : ""}
      ${duration ? `<span class="meta-dot"></span><span class="meta-item" data-testid="text-episode-duration">${CLOCK_SVG}${escapeHtml(duration)}</span>` : ""}
      ${hosts ? `<span class="meta-dot"></span><span>${escapeHtml(hosts)}</span>` : ""}
    </div>
    <div class="listen-buttons" data-testid="listen-buttons">
      <a href="${escapeHtml(appleLink)}" target="_blank" rel="noopener noreferrer" class="listen-btn" data-testid="link-apple-podcasts">
        ${APPLE_PODCASTS_SVG}
        Listen on Apple Podcasts
      </a>
      <a href="${escapeHtml(spotifyLink)}" target="_blank" rel="noopener noreferrer" class="listen-btn" data-testid="link-spotify">
        ${SPOTIFY_SVG}
        Listen on Spotify
      </a>
    </div>
  </div>
</div>

<nav class="page-tabs" data-testid="nav-recap-transcript-tabs">
  ${activeTab === "recap"
    ? `<span class="page-tab active" data-testid="tab-recap-active">${FILETEXT_SVG} Episode Recap</span>`
    : `<a href="${recapUrl}" class="page-tab" data-testid="tab-recap-link">${FILETEXT_SVG} Episode Recap</a>`
  }
  ${activeTab === "transcript"
    ? `<span class="page-tab active" data-testid="tab-transcript-active">${FILETEXT_SVG} Full Transcript</span>`
    : `<a href="${transcriptUrl}" class="page-tab" data-testid="tab-transcript-link">${FILETEXT_SVG} Full Transcript</a>`
  }
</nav>`;
}
