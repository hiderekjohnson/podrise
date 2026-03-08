function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface EpisodeCardData {
  episodeSlug: string;
  podcastSlug: string;
  publishDate?: string;
  episodeTitle: string;
  tldl?: string;
  duration?: string;
  testIdPrefix?: string;
}

export function renderEpisodeCardHtml(ep: EpisodeCardData): string {
  const prefix = ep.testIdPrefix || "card-episode";
  const epDate = ep.publishDate
    ? new Date(ep.publishDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  return `<a href="/podcasts/${ep.podcastSlug}/${ep.episodeSlug}" class="more-ep-card" data-testid="${prefix}-${ep.episodeSlug}">
  <div class="more-ep-meta">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
    <span>${epDate}</span>
    ${ep.duration ? `<span class="more-ep-dot"></span><span>${escapeHtml(ep.duration)}</span>` : ""}
  </div>
  <div class="more-ep-title">${escapeHtml(ep.episodeTitle)}</div>
  ${ep.tldl ? `<div class="more-ep-desc">${escapeHtml(ep.tldl)}</div>` : ""}
  <div class="more-ep-cta">
    See full episode recap
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
  </div>
</a>`;
}

export function getEpisodeCardStyles(): string {
  return `
    .more-ep-card {
      display: block;
      background: white; border: 1px solid rgba(0,0,0,0.06);
      border-radius: 12px; padding: 20px 20px;
      margin-bottom: 20px; text-decoration: none;
      transition: box-shadow 0.15s, border-color 0.15s;
    }
    .more-ep-card:hover {
      box-shadow: 0 4px 12px rgba(0,0,0,0.04);
      border-color: rgba(26,140,255,0.15);
      text-decoration: none;
    }
    .more-ep-meta {
      display: flex; align-items: center; gap: 8px;
      font-size: 12px; font-weight: 600; color: rgba(100,116,139,0.6);
      margin-bottom: 8px;
    }
    .more-ep-meta svg { width: 14px; height: 14px; color: rgba(100,116,139,0.4); }
    .more-ep-dot {
      width: 3px; height: 3px; border-radius: 50%; background: rgba(0,0,0,0.12);
    }
    .more-ep-title {
      font-size: 15px; font-weight: 700; color: #1a1a2e; line-height: 1.4;
    }
    .more-ep-card:hover .more-ep-title { color: #1a8cff; }
    .more-ep-desc {
      font-size: 14px; color: #64748b; line-height: 1.6;
      margin-top: 6px;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .more-ep-cta {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 14px; font-weight: 500; color: rgba(26,140,255,0.5);
      margin-top: 12px;
    }
    .more-ep-card:hover .more-ep-cta { color: #1a8cff; }
    .more-ep-cta svg { width: 14px; height: 14px; }
  `;
}
