import { storage } from "./storage";
import type { TranscriptSegment } from "@shared/schema";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderSegment(seg: TranscriptSegment, baseUrl: string): string {
  const anchorUrl = `${baseUrl}#${seg.anchorId}`;
  const timestampHtml = seg.timestampLabel
    ? `<a href="#${seg.anchorId}" class="ts-link" data-anchor="${seg.anchorId}">${escapeHtml(seg.timestampLabel)}</a>`
    : "";
  const speakerHtml = seg.speakerName
    ? `<span class="speaker">${escapeHtml(seg.speakerName)}</span>`
    : "";
  const copyBtn = `<button class="copy-btn" data-url="${escapeHtml(anchorUrl)}" title="Copy link to this moment" aria-label="Copy link">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
  </button>`;

  return `<div class="seg" id="${seg.anchorId}">
  <div class="seg-meta">
    ${timestampHtml}
    ${speakerHtml}
    ${copyBtn}
  </div>
  <p class="seg-text">${escapeHtml(seg.text)}</p>
</div>`;
}

export async function renderTranscriptPage(podcastSlug: string, episodeSlug: string): Promise<string | null> {
  const segments = await storage.getTranscriptSegmentsBySlug(podcastSlug, episodeSlug);
  if (!segments || segments.length === 0) return null;

  const recap = await storage.getLandingPageRecapBySlug(podcastSlug, episodeSlug);

  const podcastName = recap?.podcastName || podcastSlug;
  const episodeTitle = recap?.episodeTitle || episodeSlug;
  const publishDate = recap?.publishDate || "";
  const artworkUrl = recap?.artworkUrl || "";
  const hosts = recap?.hosts || "";
  const duration = recap?.duration || "";
  const appleEpisodeUrl = (recap as any)?.appleEpisodeUrl || "";
  const appleLink = appleEpisodeUrl || `https://podcasts.apple.com/search?term=${encodeURIComponent(podcastName)}`;
  const spotifyLink = `https://open.spotify.com/search/${encodeURIComponent(episodeTitle + ' ' + podcastName)}`;

  const formattedDate = publishDate
    ? new Date(publishDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";

  const totalWords = segments.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
  const readingMinutes = Math.ceil(totalWords / 200);
  const hasTimestamps = segments.some(s => s.timestampLabel);

  const recapUrl = `/podcasts/${podcastSlug}/${episodeSlug}`;
  const podcastUrl = `/podcasts/${podcastSlug}`;
  const canonicalUrl = `https://podcap.io/podcasts/${podcastSlug}/${episodeSlug}/transcript`;
  const pageTitle = `${podcastName}, ${episodeTitle}, Full Transcript`;
  const metaDesc = `Read the full transcript of "${episodeTitle}" from ${podcastName}. Timestamped, searchable transcript with direct links to any moment.`;

  const segmentsHtml = segments.map(s => renderSegment(s, canonicalUrl)).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(metaDesc)}" />
  <link rel="canonical" href="${canonicalUrl}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(pageTitle)}" />
  <meta property="og:description" content="${escapeHtml(metaDesc)}" />
  <meta property="og:url" content="${canonicalUrl}" />
  ${artworkUrl ? `<meta property="og:image" content="${escapeHtml(artworkUrl)}" />` : ""}
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(metaDesc)}" />
  <link rel="icon" type="image/png" href="/favicon.png" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #f8f9fb;
      color: #1a1a2e;
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
    }
    a { color: #1a8cff; text-decoration: none; }
    a:hover { text-decoration: underline; }

    .header {
      position: sticky; top: 0; z-index: 50;
      background: rgba(248,249,251,0.8);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(0,0,0,0.04);
    }
    .header-inner {
      max-width: 720px; margin: 0 auto;
      padding: 0 16px; height: 56px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .logo { height: 28px; }
    .back-link { font-size: 14px; font-weight: 500; color: #64748b; text-decoration: none; }
    .back-link:hover { color: #1a1a2e; text-decoration: none; }

    .container { max-width: 720px; margin: 0 auto; padding: 40px 16px 80px; }

    .hero { display: flex; gap: 20px; align-items: flex-start; margin-bottom: 0; }
    .artwork {
      width: 88px; height: 88px; border-radius: 16px;
      object-fit: cover; flex-shrink: 0;
      box-shadow: 0 4px 16px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04);
    }
    @media (min-width: 640px) {
      .artwork { width: 112px; height: 112px; }
    }
    .hero-info { min-width: 0; padding-top: 4px; }
    .podcast-name {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.05em; color: #1a8cff; margin-bottom: 8px;
    }
    .podcast-name:hover { text-decoration: underline; }
    .podcast-name svg { width: 14px; height: 14px; }
    .ep-title { font-size: 22px; font-weight: 800; line-height: 1.25; color: #1a1a2e; margin-bottom: 12px; }
    @media (min-width: 640px) { .ep-title { font-size: 28px; } }
    .ep-meta {
      font-size: 14px; color: #94a3b8;
      display: flex; gap: 12px; flex-wrap: wrap; align-items: center;
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
      text-decoration: none; transition: background 0.15s;
    }
    .listen-btn:hover { background: rgba(0,0,0,0.08); text-decoration: none; }
    .listen-btn svg { width: 14px; height: 14px; }

    .stats-bar {
      display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
      font-size: 13px; color: #64748b;
      padding: 12px 16px;
      background: white;
      border: 1px solid rgba(0,0,0,0.06);
      border-radius: 12px;
      margin-bottom: 16px;
    }
    .stats-bar svg { flex-shrink: 0; }
    .stat-item { display: flex; align-items: center; gap: 5px; }
    .stat-divider { width: 1px; height: 16px; background: rgba(0,0,0,0.08); }

    .search-bar {
      position: relative;
      margin-bottom: 16px;
    }
    .search-bar input {
      width: 100%; height: 44px;
      padding: 0 16px 0 40px;
      border: 1px solid rgba(0,0,0,0.08);
      border-radius: 12px;
      background: white;
      font-size: 14px; color: #1a1a2e;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .search-bar input:focus {
      border-color: #1a8cff;
      box-shadow: 0 0 0 3px rgba(26,140,255,0.1);
    }
    .search-bar input::placeholder { color: #94a3b8; }
    .search-bar .search-icon {
      position: absolute; left: 13px; top: 50%;
      transform: translateY(-50%);
      color: #94a3b8; pointer-events: none;
    }
    .search-count {
      position: absolute; right: 12px; top: 50%;
      transform: translateY(-50%);
      font-size: 12px; color: #94a3b8;
      pointer-events: none;
    }

    .page-tabs {
      display: flex; align-items: center;
      border-bottom: 1px solid rgba(0,0,0,0.06);
      margin-bottom: 24px;
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

    .recap-helper {
      font-size: 14px; color: #64748b;
      margin-bottom: 24px;
    }
    .recap-helper a { font-weight: 600; }

    .seg {
      padding: 14px 16px;
      border-radius: 10px;
      margin-bottom: 6px;
      scroll-margin-top: 80px;
      transition: background-color 0.3s ease;
      background: white;
      border: 1px solid rgba(0,0,0,0.04);
    }
    .seg.highlighted {
      background: rgba(26,140,255,0.06);
      border-color: rgba(26,140,255,0.15);
    }
    .seg.search-match {
      border-color: rgba(26,140,255,0.2);
    }
    .seg.search-hidden {
      display: none;
    }
    .seg-meta {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 6px; min-height: 22px;
    }
    .ts-link {
      font-size: 12px; font-weight: 700; color: #1a8cff;
      font-variant-numeric: tabular-nums;
      cursor: pointer; text-decoration: none;
      background: rgba(26,140,255,0.08);
      padding: 2px 8px;
      border-radius: 6px;
    }
    .ts-link:hover { background: rgba(26,140,255,0.14); text-decoration: none; }
    .speaker {
      font-size: 13px; font-weight: 700; color: #1a1a2e;
    }
    .copy-btn {
      background: none; border: none; cursor: pointer;
      color: #94a3b8; padding: 2px; border-radius: 4px;
      opacity: 0; transition: opacity 0.15s, color 0.15s;
      display: inline-flex; align-items: center;
      margin-left: auto;
    }
    .seg:hover .copy-btn { opacity: 1; }
    .copy-btn:hover { color: #1a8cff; }
    .copy-btn.copied { color: #22c55e; opacity: 1; }
    .seg-text {
      font-size: 15px; line-height: 1.75; color: #334155;
    }
    mark {
      background: rgba(26,140,255,0.15);
      color: inherit;
      border-radius: 2px;
      padding: 0 1px;
    }

    .scroll-top {
      position: fixed; bottom: 24px; right: 24px;
      width: 44px; height: 44px;
      border-radius: 50%;
      background: white;
      border: 1px solid rgba(0,0,0,0.08);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      cursor: pointer;
      display: none; align-items: center; justify-content: center;
      color: #64748b;
      transition: opacity 0.2s, transform 0.2s;
      z-index: 40;
    }
    .scroll-top:hover { transform: scale(1.1); color: #1a8cff; }
    .scroll-top.visible { display: flex; }

    .footer {
      margin-top: 48px; padding-top: 24px;
      border-top: 1px solid rgba(0,0,0,0.06);
      text-align: center; font-size: 12px; color: #94a3b8;
    }
    .footer img { height: 20px; opacity: 0.3; margin-bottom: 8px; }

    @media (max-width: 640px) {
      .hero { gap: 14px; }
      .ep-title { font-size: 18px; }
      .seg-text { font-size: 14px; line-height: 1.7; }
      .seg { padding: 12px 14px; }
      .container { padding: 24px 16px 60px; }
      .stats-bar { gap: 10px; font-size: 12px; }
      .listen-buttons { gap: 6px; }
      .listen-btn { padding: 5px 10px; font-size: 11px; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-inner">
      <a href="/">
        <img src="/favicon.png" alt="PodCap" class="logo" />
      </a>
      <a href="${podcastUrl}" class="back-link">&larr; All ${escapeHtml(podcastName)} Recaps</a>
    </div>
  </header>

  <main class="container">
    <div class="hero">
      ${artworkUrl ? `<img src="${escapeHtml(artworkUrl)}" alt="${escapeHtml(podcastName)}" class="artwork" />` : ""}
      <div class="hero-info">
        <a href="${podcastUrl}" class="podcast-name">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
          ${escapeHtml(podcastName)}
        </a>
        <h1 class="ep-title">${escapeHtml(episodeTitle)}</h1>
        <div class="ep-meta">
          ${formattedDate ? `<span class="meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${formattedDate}</span>` : ""}
          ${duration ? `<span class="meta-dot"></span><span class="meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${escapeHtml(duration)}</span>` : ""}
          ${hosts ? `<span class="meta-dot"></span><span>${escapeHtml(hosts)}</span>` : ""}
        </div>
        <div class="listen-buttons">
          <a href="${escapeHtml(appleLink)}" target="_blank" rel="noopener noreferrer" class="listen-btn" data-testid="link-apple-podcasts">
            <svg viewBox="0 0 24 24" fill="#9933CC"><path d="M12.28 2C6.88 2 2.45 6.43 2.45 11.83c0 3.46 1.83 6.58 4.67 8.37-.08-.7-.15-1.77.03-2.53.16-.69 1.05-4.45 1.05-4.45s-.27-.54-.27-1.33c0-1.24.72-2.17 1.62-2.17.76 0 1.13.57 1.13 1.26 0 .77-.49 1.92-.74 2.98-.21.89.45 1.62 1.33 1.62 1.6 0 2.83-1.69 2.83-4.12 0-2.15-1.55-3.66-3.76-3.66-2.56 0-4.06 1.92-4.06 3.91 0 .77.3 1.6.67 2.05.07.09.08.17.06.26-.07.28-.22.89-.25 1.02-.04.17-.13.2-.31.12-1.16-.54-1.88-2.23-1.88-3.59 0-2.93 2.13-5.62 6.14-5.62 3.22 0 5.73 2.3 5.73 5.37 0 3.2-2.02 5.78-4.82 5.78-.94 0-1.83-.49-2.13-1.07l-.58 2.21c-.21.81-.78 1.82-1.16 2.44.87.27 1.79.41 2.75.41 5.4 0 9.83-4.43 9.83-9.83C22.11 6.43 17.68 2 12.28 2z"/></svg>
            Listen on Apple Podcasts
          </a>
          <a href="${escapeHtml(spotifyLink)}" target="_blank" rel="noopener noreferrer" class="listen-btn" data-testid="link-spotify">
            <svg viewBox="0 0 24 24" fill="#1DB954"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
            Listen on Spotify
          </a>
        </div>
      </div>
    </div>

    <nav class="page-tabs" data-testid="nav-recap-transcript-tabs">
      <a href="${recapUrl}" class="page-tab" data-testid="tab-recap-link">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        Episode Recap
      </a>
      <span class="page-tab active" data-testid="tab-transcript-active">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        Full Transcript
      </span>
    </nav>

    <p class="recap-helper">
      Too long to read? <a href="${recapUrl}">View the 2-minute episode recap</a>.
    </p>

    <div class="stats-bar">
      <div class="stat-item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        ${segments.length.toLocaleString()} segments
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">${totalWords.toLocaleString()} words</div>
      <div class="stat-divider"></div>
      <div class="stat-item">~${readingMinutes} min read</div>
    </div>

    <div class="search-bar">
      <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <input type="text" id="transcript-search" placeholder="Search transcript..." autocomplete="off" />
      <span class="search-count" id="search-count"></span>
    </div>

    <article id="segments-container">
      ${segmentsHtml}
    </article>

    <button class="scroll-top" id="scroll-top" title="Back to top" aria-label="Scroll to top">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>
    </button>

    <footer class="footer">
      <a href="/"><img src="/favicon.png" alt="PodCap" /></a>
      <p>PodCap is not affiliated with ${escapeHtml(podcastName)}. Transcripts are generated from publicly available episode data.</p>
      <p style="margin-top: 8px;">
        <a href="${recapUrl}">Episode Recap</a> &middot; <a href="${podcastUrl}">${escapeHtml(podcastName)} Hub</a> &middot; <a href="/">PodCap Home</a>
      </p>
    </footer>
  </main>

  <script>
    (function() {
      var hash = window.location.hash;
      if (hash) {
        var el = document.getElementById(hash.slice(1));
        if (el) {
          setTimeout(function() {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('highlighted');
          }, 100);
        }
      }

      document.addEventListener('click', function(e) {
        var link = e.target.closest('.ts-link');
        if (link) {
          e.preventDefault();
          var anchor = link.getAttribute('data-anchor');
          history.replaceState(null, '', '#' + anchor);
          document.querySelectorAll('.seg.highlighted').forEach(function(s) { s.classList.remove('highlighted'); });
          var el = document.getElementById(anchor);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('highlighted');
          }
        }

        var btn = e.target.closest('.copy-btn');
        if (btn) {
          var url = btn.getAttribute('data-url');
          navigator.clipboard.writeText(url).then(function() {
            btn.classList.add('copied');
            setTimeout(function() { btn.classList.remove('copied'); }, 1500);
          });
        }
      });

      var searchInput = document.getElementById('transcript-search');
      var searchCount = document.getElementById('search-count');
      var segments = document.querySelectorAll('.seg');
      var debounceTimer;

      searchInput.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function() {
          var query = searchInput.value.trim().toLowerCase();
          if (!query) {
            segments.forEach(function(seg) {
              seg.classList.remove('search-hidden', 'search-match');
              var textEl = seg.querySelector('.seg-text');
              textEl.innerHTML = textEl.textContent;
            });
            searchCount.textContent = '';
            return;
          }
          var matchCount = 0;
          segments.forEach(function(seg) {
            var textEl = seg.querySelector('.seg-text');
            var originalText = textEl.textContent;
            var lowerText = originalText.toLowerCase();
            if (lowerText.includes(query)) {
              seg.classList.remove('search-hidden');
              seg.classList.add('search-match');
              matchCount++;
              var escaped = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
              var regex = new RegExp('(' + escaped + ')', 'gi');
              textEl.innerHTML = originalText.replace(regex, '<mark>$1</mark>');
            } else {
              seg.classList.add('search-hidden');
              seg.classList.remove('search-match');
              textEl.innerHTML = originalText;
            }
          });
          searchCount.textContent = matchCount + ' match' + (matchCount !== 1 ? 'es' : '');
        }, 200);
      });

      var scrollBtn = document.getElementById('scroll-top');
      window.addEventListener('scroll', function() {
        if (window.scrollY > 600) {
          scrollBtn.classList.add('visible');
        } else {
          scrollBtn.classList.remove('visible');
        }
      });
      scrollBtn.addEventListener('click', function() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    })();
  </script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-J16JE1L8GE"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-J16JE1L8GE');</script>
</body>
</html>`;
}
