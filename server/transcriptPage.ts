import { storage } from "./storage";
import type { TranscriptSegment } from "@shared/schema";
import { renderEpisodeCardHtml, getEpisodeCardStyles } from "./episodeCardHtml";
import { getEpisodePageTopStyles, renderEpisodePageHeader, renderEpisodePageHero } from "./episodePageShared";

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
  const allRecaps = await storage.getLandingPageRecaps(podcastSlug, 50);
  const currentIdx = allRecaps.findIndex(r => r.episodeSlug === episodeSlug);
  const otherEpisodes = currentIdx >= 0 ? allRecaps.slice(currentIdx + 1, currentIdx + 6) : [];

  const itunesId = recap?.itunesId || allRecaps.find(r => r.itunesId)?.itunesId || "";
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
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #f8f9fb;
      color: #1a1a2e;
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
    }
    a { color: #1a8cff; text-decoration: none; }
    a:hover { text-decoration: underline; }

    ${getEpisodePageTopStyles()}

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

    .inline-cta {
      position: relative; overflow: hidden;
      background: linear-gradient(135deg, rgba(26,140,255,0.06), rgba(26,140,255,0.03), transparent);
      border: 1px solid rgba(26,140,255,0.1);
      border-radius: 16px;
      padding: 28px; margin-top: 48px; margin-bottom: 64px;
    }
    @media (min-width: 640px) {
      .inline-cta { padding: 36px; }
    }
    .inline-cta-bg {
      position: absolute; bottom: -32px; right: -32px; opacity: 0.04;
    }
    .inline-cta-bg svg { width: 160px; height: 160px; color: #1a8cff; }
    .inline-cta-inner {
      position: relative;
      display: grid; grid-template-columns: 1fr; gap: 32px; align-items: center;
    }
    @media (min-width: 768px) {
      .inline-cta-inner { grid-template-columns: 1fr auto; gap: 40px; }
    }
    .inline-cta-content { display: flex; flex-direction: column; gap: 16px; text-align: center; }
    @media (min-width: 768px) {
      .inline-cta-content { text-align: left; }
    }
    .inline-cta h2 {
      font-size: 20px; font-weight: 800; color: #1a1a2e; line-height: 1.3;
    }
    @media (min-width: 640px) {
      .inline-cta h2 { font-size: 24px; }
    }
    .inline-cta-desc {
      font-size: 15px; color: #64748b; line-height: 1.6; max-width: 28rem;
    }
    .inline-cta-form {
      display: flex; flex-direction: column; gap: 12px; margin-top: 4px;
    }
    @media (min-width: 640px) {
      .inline-cta-form { flex-direction: row; }
    }
    .inline-cta-input {
      flex: 1; height: 48px; padding: 0 16px;
      background: white; border: 1px solid rgba(0,0,0,0.08);
      border-radius: 12px; font-size: 16px; color: #1a1a2e;
      font-weight: 500; outline: none;
      box-shadow: 0 1px 2px rgba(0,0,0,0.03);
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .inline-cta-input:focus {
      border-color: rgba(26,140,255,0.3);
      box-shadow: 0 0 0 3px rgba(26,140,255,0.08);
    }
    .inline-cta-input::placeholder { color: rgba(148,163,184,0.4); }
    .inline-cta-submit {
      height: 48px; padding: 0 24px;
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      border-radius: 12px; border: none;
      font-size: 16px; font-weight: 700;
      background: #1a8cff; color: white;
      cursor: pointer; white-space: nowrap;
      box-shadow: 0 4px 12px rgba(26,140,255,0.2);
      transition: filter 0.15s, box-shadow 0.15s;
    }
    .inline-cta-submit:hover { filter: brightness(1.05); box-shadow: 0 6px 16px rgba(26,140,255,0.25); }
    .inline-cta-submit svg { width: 16px; height: 16px; }
    .inline-cta-artwork {
      display: none;
      width: 128px; height: 128px; border-radius: 16px;
      object-fit: cover;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.08);
      outline: 1px solid rgba(0,0,0,0.04);
      outline-offset: -1px;
    }
    @media (min-width: 768px) {
      .inline-cta-artwork { display: block; }
    }
    @media (min-width: 1024px) {
      .inline-cta-artwork { width: 144px; height: 144px; }
    }

    .more-episodes { margin-top: 48px; }
    .more-episodes h2 {
      font-size: 18px; font-weight: 800; color: #1a1a2e; margin-bottom: 20px;
    }
    ${getEpisodeCardStyles()}
    .view-all-link {
      display: flex; justify-content: center; margin-top: 20px;
    }
    .view-all-btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 10px 20px; border-radius: 12px;
      font-size: 14px; font-weight: 700;
      background: rgba(26,140,255,0.06); color: #1a8cff;
      text-decoration: none; transition: background 0.15s;
    }
    .view-all-btn:hover { background: rgba(26,140,255,0.1); text-decoration: none; }
    .view-all-btn svg { width: 16px; height: 16px; }

    .sticky-bar {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 50;
      background: rgba(255,255,255,0.95);
      backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
      border-top: 1px solid rgba(0,0,0,0.08);
      box-shadow: 0 -4px 20px rgba(0,0,0,0.06);
      transform: translateY(100%);
      opacity: 0;
      transition: transform 0.4s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease;
    }
    .sticky-bar.visible {
      transform: translateY(0);
      opacity: 1;
    }
    .sticky-bar-inner {
      max-width: 896px; margin: 0 auto;
      padding: 12px 16px;
      display: flex; align-items: center; gap: 12px;
    }
    @media (min-width: 640px) {
      .sticky-bar-inner { padding: 12px 24px; }
    }
    .sticky-icon {
      width: 32px; height: 32px; border-radius: 8px;
      background: rgba(26,140,255,0.08);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .sticky-icon svg { width: 16px; height: 16px; color: #1a8cff; }
    .sticky-label {
      font-size: 14px; font-weight: 600; color: #1a1a2e;
      white-space: nowrap; flex-shrink: 0;
    }
    .sticky-label span { color: #1a8cff; }
    .sticky-form {
      display: flex; flex: 1; gap: 8px;
    }
    .sticky-input {
      flex: 1; height: 36px; padding: 0 12px;
      background: rgba(0,0,0,0.03);
      border: 1px solid rgba(0,0,0,0.06);
      border-radius: 8px; font-size: 14px; color: #1a1a2e;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .sticky-input:focus {
      border-color: rgba(26,140,255,0.3);
      box-shadow: 0 0 0 3px rgba(26,140,255,0.08);
    }
    .sticky-input::placeholder { color: rgba(148,163,184,0.4); }
    .sticky-submit {
      height: 36px; padding: 0 16px;
      border-radius: 8px; border: none;
      font-size: 14px; font-weight: 700;
      background: #1a8cff; color: white;
      cursor: pointer; white-space: nowrap;
      box-shadow: 0 1px 3px rgba(26,140,255,0.2);
      transition: filter 0.15s;
    }
    .sticky-submit:hover { filter: brightness(1.05); }
    .sticky-dismiss {
      position: absolute; top: 8px; right: 8px;
      padding: 6px; border-radius: 6px;
      background: none; border: none;
      color: rgba(100,116,139,0.4); cursor: pointer;
      transition: color 0.15s, background 0.15s;
    }
    .sticky-dismiss:hover { color: #64748b; background: rgba(0,0,0,0.04); }
    .sticky-dismiss svg { width: 16px; height: 16px; }
    @media (max-width: 640px) {
      .sticky-bar-inner { flex-wrap: wrap; }
      .sticky-form { width: 100%; }
      .sticky-dismiss { top: 4px; right: 4px; }
    }

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
  ${renderEpisodePageHeader()}

  <main class="container">
    ${renderEpisodePageHero({
      podcastName,
      podcastSlug,
      episodeTitle,
      episodeSlug,
      artworkUrl,
      formattedDate,
      duration,
      hosts,
      appleLink,
      spotifyLink,
      activeTab: "transcript",
    })}

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

    <section class="inline-cta" id="inline-cta" data-testid="section-episode-cta">
      <div class="inline-cta-bg">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
      </div>
      <div class="inline-cta-inner">
        <div class="inline-cta-content">
          <h2>Get ${escapeHtml(podcastName)} recaps<br /> in your inbox</h2>
          <p class="inline-cta-desc">Never miss an episode. PodCap sends you a concise recap of every new ${escapeHtml(podcastName)} episode — free, no app needed.</p>
          <form class="inline-cta-form" id="inline-cta-form" data-testid="form-signup-episode">
            <input class="inline-cta-input" type="email" placeholder="your@email.com" required data-testid="input-email-episode" />
            <button class="inline-cta-submit" type="submit" data-testid="button-signup-episode">
              Get Free Recaps
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </button>
          </form>
        </div>
        ${artworkUrl ? `<img src="${escapeHtml(artworkUrl)}" alt="${escapeHtml(podcastName)}" class="inline-cta-artwork" data-testid="img-cta-artwork" />` : ""}
      </div>
    </section>

    ${otherEpisodes.length > 0 ? `
    <section class="more-episodes" data-testid="section-more-episodes">
      <h2>More from ${escapeHtml(podcastName)}</h2>
      ${otherEpisodes.map(ep => renderEpisodeCardHtml({
        episodeSlug: ep.episodeSlug,
        podcastSlug,
        publishDate: ep.publishDate || undefined,
        episodeTitle: ep.episodeTitle,
        tldl: ep.tldl || undefined,
        duration: ep.duration || undefined,
        testIdPrefix: "card-more-episode",
      })).join("\n")}
      <div class="view-all-link">
        <a href="${podcastUrl}" class="view-all-btn" data-testid="link-all-episodes">
          View all ${escapeHtml(podcastName)} episodes
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </a>
      </div>
    </section>
    ` : ""}

    <footer class="footer">
      <a href="/"><img src="/podcap-logo.png" alt="PodCap" /></a>
      <p>PodCap is not affiliated with ${escapeHtml(podcastName)}. Transcripts are generated from publicly available episode data.</p>
    </footer>
  </main>

  <div class="sticky-bar" id="sticky-bar" data-testid="sticky-signup-bar">
    <div class="sticky-bar-inner">
      <div class="sticky-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
      </div>
      <p class="sticky-label">Never miss a <span>${escapeHtml(podcastName)}</span> recap</p>
      <form class="sticky-form" id="sticky-form" data-testid="form-sticky-signup">
        <input class="sticky-input" type="email" placeholder="your@email.com" required data-testid="input-email-sticky" />
        <button class="sticky-submit" type="submit" data-testid="button-sticky-signup">Subscribe free</button>
      </form>
      <button class="sticky-dismiss" id="sticky-dismiss" aria-label="Dismiss" data-testid="button-dismiss-sticky">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>
  </div>

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
      var tabSearchInput = document.getElementById('tab-search-input');
      var searchCount = document.getElementById('search-count');
      var segments = document.querySelectorAll('.seg');
      var debounceTimer;

      function runSearch(query) {
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
          if (lowerText.includes(query.toLowerCase())) {
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
      }

      function syncInputs(source, target, value) {
        if (target && target !== source) target.value = value;
      }

      function handleSearchInput(e) {
        var val = e.target.value;
        syncInputs(e.target, searchInput, val);
        syncInputs(e.target, tabSearchInput, val);
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function() {
          runSearch(val.trim());
        }, 200);
      }

      searchInput.addEventListener('input', handleSearchInput);
      if (tabSearchInput) {
        tabSearchInput.addEventListener('input', handleSearchInput);
        tabSearchInput.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') e.preventDefault();
        });
      }

      var urlParams = new URLSearchParams(window.location.search);
      var initialQuery = urlParams.get('q');
      if (initialQuery) {
        searchInput.value = initialQuery;
        if (tabSearchInput) tabSearchInput.value = initialQuery;
        runSearch(initialQuery.trim());
        setTimeout(function() {
          var firstMatch = document.querySelector('.seg.search-match');
          if (firstMatch) firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }

      var scrollBtn = document.getElementById('scroll-top');
      var stickyBar = document.getElementById('sticky-bar');
      var inlineCta = document.getElementById('inline-cta');
      var stickyDismissed = false;

      function isInView(el) {
        var rect = el.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0;
      }

      window.addEventListener('scroll', function() {
        if (window.scrollY > 600) {
          scrollBtn.classList.add('visible');
        } else {
          scrollBtn.classList.remove('visible');
        }

        if (stickyDismissed) return;
        if (window.scrollY > 600 && !isInView(inlineCta)) {
          stickyBar.classList.add('visible');
        } else {
          stickyBar.classList.remove('visible');
        }
      });
      scrollBtn.addEventListener('click', function() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      document.getElementById('sticky-dismiss').addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        stickyDismissed = true;
        stickyBar.classList.remove('visible');
        stickyBar.style.display = 'none';
      });

      var podcastMeta = ${JSON.stringify({ id: itunesId, name: podcastName, artworkUrl: artworkUrl })};
      function handleSignup(form) {
        form.addEventListener('submit', function(e) {
          e.preventDefault();
          var emailInput = this.querySelector('input[type="email"]');
          var emailVal = emailInput.value.trim();
          if (!emailVal || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(emailVal)) return;
          fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: emailVal,
              podcasts: [JSON.stringify(podcastMeta)]
            })
          }).then(function(res) {
            if (res.ok) {
              window.location.href = '/dashboard?welcome=true';
            } else {
              alert('This email may already be registered. Try logging in.');
            }
          }).catch(function() {
            alert('Something went wrong. Please try again.');
          });
        });
      }
      handleSignup(document.getElementById('sticky-form'));
      handleSignup(document.getElementById('inline-cta-form'));
    })();
  </script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-J16JE1L8GE"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-J16JE1L8GE');</script>
</body>
</html>`;
}
