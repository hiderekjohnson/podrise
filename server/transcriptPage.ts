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

  const formattedDate = publishDate
    ? new Date(publishDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";

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
      background: rgba(248,249,251,0.92);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(0,0,0,0.04);
    }
    .header-inner {
      max-width: 800px; margin: 0 auto;
      padding: 0 20px; height: 56px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .logo { height: 28px; }
    .back-link { font-size: 14px; font-weight: 500; color: #64748b; }
    .back-link:hover { color: #1a1a2e; text-decoration: none; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 20px 80px; }
    .breadcrumb { font-size: 13px; color: #94a3b8; margin-bottom: 24px; }
    .breadcrumb a { color: #64748b; }
    .breadcrumb span { margin: 0 6px; }
    .hero { display: flex; gap: 20px; align-items: flex-start; margin-bottom: 32px; }
    .artwork {
      width: 80px; height: 80px; border-radius: 16px;
      object-fit: cover; flex-shrink: 0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }
    .hero-info { min-width: 0; }
    .podcast-name {
      font-size: 12px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.05em; color: #1a8cff; margin-bottom: 6px;
    }
    .ep-title { font-size: 22px; font-weight: 800; line-height: 1.3; color: #1a1a2e; margin-bottom: 8px; }
    .ep-meta { font-size: 13px; color: #94a3b8; display: flex; gap: 12px; flex-wrap: wrap; }
    .transcript-label {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.08em; color: #94a3b8;
      padding: 6px 12px; background: rgba(0,0,0,0.03);
      border-radius: 8px; margin-bottom: 24px;
    }
    .recap-link-box {
      background: linear-gradient(135deg, rgba(26,140,255,0.04), rgba(26,140,255,0.02));
      border: 1px solid rgba(26,140,255,0.1); border-radius: 12px;
      padding: 14px 18px; margin-bottom: 32px;
      font-size: 14px;
    }
    .recap-link-box a { font-weight: 600; }
    .seg {
      padding: 16px 0;
      border-bottom: 1px solid rgba(0,0,0,0.04);
      scroll-margin-top: 80px;
      transition: background-color 0.3s ease;
    }
    .seg.highlighted {
      background: rgba(26,140,255,0.06);
      border-radius: 8px;
      padding-left: 16px; padding-right: 16px;
      margin-left: -16px; margin-right: -16px;
    }
    .seg-meta {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 6px; min-height: 22px;
    }
    .ts-link {
      font-size: 13px; font-weight: 600; color: #1a8cff;
      font-variant-numeric: tabular-nums;
      cursor: pointer; text-decoration: none;
    }
    .ts-link:hover { text-decoration: underline; }
    .speaker {
      font-size: 14px; font-weight: 700; color: #1a1a2e;
    }
    .copy-btn {
      background: none; border: none; cursor: pointer;
      color: #94a3b8; padding: 2px; border-radius: 4px;
      opacity: 0; transition: opacity 0.15s, color 0.15s;
      display: inline-flex; align-items: center;
    }
    .seg:hover .copy-btn { opacity: 1; }
    .copy-btn:hover { color: #1a8cff; }
    .copy-btn.copied { color: #22c55e; opacity: 1; }
    .seg-text { font-size: 15px; line-height: 1.8; color: #334155; }
    .footer {
      margin-top: 48px; padding-top: 24px;
      border-top: 1px solid rgba(0,0,0,0.06);
      text-align: center; font-size: 12px; color: #94a3b8;
    }
    .footer img { height: 20px; opacity: 0.3; margin-bottom: 8px; }
    @media (max-width: 640px) {
      .hero { gap: 14px; }
      .artwork { width: 60px; height: 60px; border-radius: 12px; }
      .ep-title { font-size: 18px; }
      .seg-text { font-size: 14px; }
      .container { padding: 24px 16px 60px; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-inner">
      <a href="/">
        <img src="/favicon.png" alt="PodCap" class="logo" />
      </a>
      <a href="${recapUrl}" class="back-link">← Episode Recap</a>
    </div>
  </header>

  <main class="container">
    <nav class="breadcrumb">
      <a href="${podcastUrl}">${escapeHtml(podcastName)}</a>
      <span>›</span>
      <a href="${recapUrl}">Episode Recap</a>
      <span>›</span>
      Transcript
    </nav>

    <div class="hero">
      ${artworkUrl ? `<img src="${escapeHtml(artworkUrl)}" alt="${escapeHtml(podcastName)}" class="artwork" />` : ""}
      <div class="hero-info">
        <div class="podcast-name"><a href="${podcastUrl}">${escapeHtml(podcastName)}</a></div>
        <h1 class="ep-title">${escapeHtml(episodeTitle)}</h1>
        <div class="ep-meta">
          ${formattedDate ? `<span>${formattedDate}</span>` : ""}
          ${duration ? `<span>${escapeHtml(duration)}</span>` : ""}
          ${hosts ? `<span>${escapeHtml(hosts)}</span>` : ""}
        </div>
      </div>
    </div>

    <div class="transcript-label">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
      Full Transcript — ${segments.length} segments
    </div>

    <div class="recap-link-box">
      Looking for a quick summary? <a href="${recapUrl}">Read the episode recap →</a>
    </div>

    <article>
      ${segmentsHtml}
    </article>

    <footer class="footer">
      <a href="/"><img src="/favicon.png" alt="PodCap" /></a>
      <p>PodCap is not affiliated with ${escapeHtml(podcastName)}. Transcripts are generated from publicly available episode data.</p>
      <p style="margin-top: 8px;">
        <a href="${recapUrl}">Episode Recap</a> · <a href="${podcastUrl}">${escapeHtml(podcastName)} Hub</a> · <a href="/">PodCap Home</a>
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
    })();
  </script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-J16JE1L8GE"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-J16JE1L8GE');</script>
</body>
</html>`;
}
