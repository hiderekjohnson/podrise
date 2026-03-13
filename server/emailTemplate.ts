interface ParsedEpisode {
  podcastName: string;
  episodeTitle: string;
  metaLine: string;
  linksLine: string;
  tldl: string;
  whatHappened: string;
  keyInsights: string[];
  quoteAttribution: string;
  quote: string;
}

interface ParsedDigest {
  statsHeader: string;
  podcastNames: string;
  bigIdeas: { emoji: string; text: string; source: string }[];
  episodes: ParsedEpisode[];
  conversationAmmo: { tag: string; text: string }[];
}

export interface EpisodeMetaForEmail {
  canonicalSlug?: string;
  artworkUrl?: string | null;
  companiesCount?: number;
  peopleCount?: number;
  booksCount?: number;
  quotesCount?: number;
  companyNames?: string[];
  personNames?: string[];
  bookTitles?: string[];
  guests?: string[];
  episodeDuration?: string;
  episodeDate?: string;
  mentionTeaserPeople?: string;
  mentionTeaserCompanies?: string;
  mentionTeaserBooks?: string;
}

function isEpisodeSection(title: string, body: string): boolean {
  if (/big ideas|conversation ammo/i.test(title)) return false;
  return /\*?\*?TLDL\*?\*?[:\s]|\*?\*?TL;?DR\*?\*?[:\s]|\*?\*?Key (Insights|Takeaways)\*?\*?/i.test(body) || /^\*\*.+\*\*$/m.test(body) || /What Happened/i.test(body);
}

function normalizeMarkdownHeaders(markdown: string): string {
  if (/^## /m.test(markdown)) return markdown;

  const lines = markdown.split("\n");
  const result: string[] = [];
  let pastHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!pastHeader) {
      if (/^\*\*\d+\*\*\s*Podcasts/i.test(trimmed) || (trimmed === "---" && i > 2)) {
        pastHeader = true;
      }
      result.push(line);
      continue;
    }

    if (trimmed === "---") {
      result.push(line);
      continue;
    }

    const nextLines = lines.slice(i + 1, i + 4).filter(l => l.trim());
    const nextNonEmpty = nextLines[0] || "";
    const looksLikePodcastTitle = trimmed &&
      !trimmed.startsWith("*") && !trimmed.startsWith(">") &&
      !trimmed.startsWith("-") && !trimmed.startsWith("#") &&
      !trimmed.startsWith("🎧") && !trimmed.startsWith("TLDL") &&
      !trimmed.startsWith("What ") && !trimmed.startsWith("Key ") &&
      !trimmed.startsWith("Quote") &&
      trimmed.length < 80 && trimmed.length > 2;
    const bodyBelow = nextLines.join("\n");
    const hasEpisodeContent = /\*\*TLDL|\*\*TL;?DR|\*\*Key (Insights|Takeaways)/i.test(bodyBelow) || /^\*\*.+\*\*/.test(nextNonEmpty.trim());

    if (looksLikePodcastTitle && hasEpisodeContent) {
      result.push(`## ${trimmed.toUpperCase()}`);
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}

function parseDigestMarkdown(markdown: string): ParsedDigest {
  markdown = normalizeMarkdownHeaders(markdown);
  const result: ParsedDigest = {
    statsHeader: "",
    podcastNames: "",
    bigIdeas: [],
    episodes: [],
    conversationAmmo: [],
  };

  const h2Sections = markdown.split(/^## /m);

  if (h2Sections.length > 0) {
    const preH2 = h2Sections[0].trim();
    const cleanPre = preH2.replace(/^---+$/gm, "").trim();
    const statsLines = cleanPre.split("\n").filter(l => l.trim() && !/^\*\*Stats header/i.test(l));
    if (statsLines.length >= 1) {
      result.podcastNames = statsLines[0].replace(/\*\*/g, "").trim();
    }
    if (statsLines.length >= 2) {
      result.statsHeader = statsLines.slice(1).join("\n").trim();
    }
  }

  for (let s = 1; s < h2Sections.length; s++) {
    const section = h2Sections[s];
    const sectionTitle = section.split("\n")[0].trim();
    const sectionBody = section.slice(section.indexOf("\n") + 1).trim();

    if (/big ideas today/i.test(sectionTitle)) {
      const ideaLines = sectionBody.split("\n").filter(l => l.trim());
      let currentEmoji = "";
      let currentText = "";
      let currentSource = "";

      for (const line of ideaLines) {
        const ideaMatch = line.match(/^(.{1,4}?)\s*\*\*(.+?)\*\*/);
        if (ideaMatch && /\p{Emoji}/u.test(ideaMatch[1])) {
          if (currentText) {
            result.bigIdeas.push({ emoji: currentEmoji, text: currentText, source: currentSource });
          }
          currentEmoji = ideaMatch[1].trim();
          currentText = ideaMatch[2];
          currentSource = "";
        }
        const sourceMatch = line.match(/^\*Source:\s*(.+?)\*$/);
        if (sourceMatch) {
          currentSource = sourceMatch[1].trim();
        }
      }
      if (currentText) {
        result.bigIdeas.push({ emoji: currentEmoji, text: currentText, source: currentSource });
      }
      continue;
    }

    if (/conversation ammo/i.test(sectionTitle)) {
      const lines = sectionBody.split("\n").filter(l => l.trim());
      for (const line of lines) {
        const ammoMatch = line.match(/^\*\*(.+?)\*\*\s*[---:]\s*(.+)$/);
        if (ammoMatch) {
          result.conversationAmmo.push({ tag: ammoMatch[1], text: ammoMatch[2] });
        }
      }
      continue;
    }

    if (isEpisodeSection(sectionTitle, sectionBody)) {
      const episode: ParsedEpisode = {
        podcastName: sectionTitle,
        episodeTitle: "",
        metaLine: "",
        linksLine: "",
        tldl: "",
        whatHappened: "",
        keyInsights: [],
        quoteAttribution: "",
        quote: "",
      };

      const lines = sectionBody.split("\n");
      let i = 0;

      while (i < lines.length && !lines[i].trim()) i++;
      if (i < lines.length) {
        const titleMatch = lines[i].match(/^\*\*(.+?)\*\*\s*$/);
        if (titleMatch) {
          let titleText = titleMatch[1];
          const linkInTitle = titleText.match(/\[([^\]]+)\]\([^)]+\)/);
          if (linkInTitle) titleText = linkInTitle[1];
          episode.episodeTitle = titleText;
          i++;
        } else {
          const plainTitle = lines[i].trim();
          if (plainTitle && !plainTitle.startsWith("TLDL") && !plainTitle.startsWith("**") && !plainTitle.startsWith(">") && !plainTitle.startsWith("-") && !plainTitle.startsWith("🎧") && !/^(What Happened|Key Insights|Quote)/i.test(plainTitle)) {
            episode.episodeTitle = plainTitle.replace(/\s+$/, '');
            i++;
          }
        }
      }

      while (i < lines.length && !lines[i].trim()) i++;
      if (i < lines.length && /\[.*Full Recap.*\]\(|^\[📖/.test(lines[i].trim())) {
        i++;
      }

      while (i < lines.length && !lines[i].trim()) i++;
      if (i < lines.length && !lines[i].startsWith("**") && !lines[i].startsWith(">") && !lines[i].startsWith("-") && !/^🎧/.test(lines[i]) && !/^TLDL/i.test(lines[i].trim()) && !/\[.*Full Recap.*\]\(/.test(lines[i])) {
        episode.metaLine = lines[i].trim();
        i++;
      }

      while (i < lines.length && !lines[i].trim()) i++;
      if (i < lines.length && /🎧/.test(lines[i])) {
        episode.linksLine = lines[i].trim();
        i++;
      }

      const remainingText = lines.slice(i).join("\n");

      const tldlMatch = remainingText.match(/\*?\*?TLDL:?\*?\*?\s*(.+?)(?=\n\s*\n\s*\*?\*?(?:What Happened|Key Insights|Key Takeaways|Quote)|\n\*\*[A-Z])/si);
      if (tldlMatch) {
        episode.tldl = tldlMatch[1].trim();
      } else {
        const tldrMatch = remainingText.match(/\*?\*?TL;?DR:?\*?\*?\s*(.+?)(?=\n\s*\n\s*\*?\*?(?:What Happened|Key Insights|Key Takeaways|Quote)|\n\*\*[A-Z])/si);
        if (tldrMatch) {
          episode.tldl = tldrMatch[1].trim();
        } else {
          const simpleMatch = remainingText.match(/\*?\*?(?:TLDL|TL;?DR):?\*?\*?\s*(.+?)$/mi);
          if (simpleMatch) episode.tldl = simpleMatch[1].trim();
        }
      }

      const whatHappenedMatch = remainingText.match(/\*?\*?What Happened\*?\*?\s*\n([\s\S]+?)(?=\n\s*\n\s*\*?\*?Key|\n\*?\*?Quote)/i);
      if (whatHappenedMatch) {
        episode.whatHappened = whatHappenedMatch[1].trim();
      } else {
        const discussionMatch = remainingText.match(/\*\*(.+?(?:Talk|Debate|Focus|Explain|Discuss|Cover|Explore|Happened).+?)\*\*\s*\n([\s\S]+?)(?=\n\s*\n\s*\*?\*?Key|\n\*?\*?Quote)/i);
        if (discussionMatch) {
          episode.whatHappened = discussionMatch[2].trim();
        } else {
          const altMatch = remainingText.match(/\*?\*?(?:What .+?)\*?\*?\s*\n([\s\S]+?)(?=\n\s*\n\s*\*?\*?Key|\n\*?\*?Quote)/i);
          if (altMatch) episode.whatHappened = altMatch[1].trim();
        }
      }

      const insightsMatch = remainingText.match(/\*?\*?Key (?:Insights|Takeaways):?\*?\*?\s*\n((?:[-*]\s*.+\n?)+)/i);
      if (insightsMatch) {
        episode.keyInsights = insightsMatch[1]
          .split("\n")
          .filter(l => /^[-*]\s/.test(l.trim()))
          .map(l => l.replace(/^[-*]\s*/, "").trim());
      }

      const quoteBlockMatch = remainingText.match(/\*?\*?Quote\*?\*?\s*\n(.+?):\s*\n>\s*"?(.+?)"?\s*$/ms);
      if (quoteBlockMatch) {
        episode.quoteAttribution = quoteBlockMatch[1].trim();
        episode.quote = quoteBlockMatch[2].replace(/^[""\u201C]|[""\u201D]$/g, "").trim();
      } else {
        const quoteMatches = remainingText.match(/^>\s*"?(.+?)"?\s*$/gm);
        if (quoteMatches) {
          const lastQuote = quoteMatches[quoteMatches.length - 1];
          episode.quote = lastQuote.replace(/^>\s*/, "").replace(/^[""\u201C]|[""\u201D]$/g, "").trim();
        }
      }

      result.episodes.push(episode);
    }
  }

  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#6366F1;text-decoration:underline;" target="_blank">$1</a>')
    .replace(/\[([^\]]+)\](?!\()/g, "$1");
}

function podcastNameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const ACCENT_COLORS = ["#6366F1", "#8B5CF6", "#4F46E5", "#7C3AED", "#6D28D9"];

function getAccentColor(index: number): string {
  return ACCENT_COLORS[index % ACCENT_COLORS.length];
}

function parseDuration(metaLine: string): string {
  const parts = metaLine.split(/\s*[*]\s*/).map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    if (/\d+\s*(hr|min|hour|minute)/i.test(part)) return part;
  }
  const metaParts = metaLine.split(/\s*·\s*/).map(p => p.trim()).filter(Boolean);
  for (const part of metaParts) {
    if (/\d+\s*(hr|min|hour|minute)/i.test(part)) return part;
  }
  return "";
}

function parseEpisodeDate(metaLine: string): string {
  const metaParts = metaLine.split(/\s*·\s*/).map(p => p.trim()).filter(Boolean);
  for (const part of metaParts) {
    if (/\d{4}/.test(part) && /[A-Za-z]/.test(part)) return part;
  }
  return "";
}

function computeTotalDuration(episodes: ParsedEpisode[]): string {
  let totalMinutes = 0;
  for (const ep of episodes) {
    const dur = parseDuration(ep.metaLine);
    const hrMatch = dur.match(/(\d+)\s*hr/);
    const minMatch = dur.match(/(\d+)\s*min/);
    if (hrMatch) totalMinutes += parseInt(hrMatch[1]) * 60;
    if (minMatch) totalMinutes += parseInt(minMatch[1]);
  }
  if (totalMinutes <= 0) return "";
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

function buildKeyTakeaways(insights: string[], accentColor: string): string {
  if (insights.length === 0) return "";
  const items = insights.map((insight, idx) => {
    const marginBottom = idx < insights.length - 1 ? "margin-bottom:12px;" : "";
    return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="${marginBottom}"><tr>
        <td width="20" valign="top" style="padding-top:8px;"><div style="width:6px;height:6px;background:${accentColor};border-radius:50%;"></div></td>
        <td style="font-size:17px;color:#3F3F46;line-height:1.7;">${renderInlineMarkdown(escapeHtml(insight))}</td>
      </tr></table>`;
  }).join("");

  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#F7F7FC;border-radius:12px;margin-bottom:18px;border-left:3px solid ${accentColor};">
    <tr><td style="padding:18px 22px;">
      <p style="font-size:12px;font-weight:700;color:${accentColor};letter-spacing:0.12em;text-transform:uppercase;margin:0 0 14px;">Key Takeaways</p>
      ${items}
    </td></tr>
  </table>`;
}

function buildRecapText(whatHappened: string): string {
  if (!whatHappened) return "";
  const paragraphs = whatHappened.split(/\n\n+/).filter(p => p.trim());
  return paragraphs.map((p, idx) => {
    const marginBottom = idx < paragraphs.length - 1 ? "14px" : "20px";
    return `<p style="font-size:17px;color:#52525B;line-height:1.8;margin:0 0 ${marginBottom};">${renderInlineMarkdown(escapeHtml(p.trim()))}</p>`;
  }).join("");
}

function buildEntityTeaser(meta: EpisodeMetaForEmail | undefined, recapUrl: string): string {
  if (!meta) return "";

  const peopleCount = meta.peopleCount || 0;
  const companiesCount = meta.companiesCount || 0;
  const booksCount = meta.booksCount || 0;

  if (peopleCount === 0 && companiesCount === 0 && booksCount === 0) return "";

  const lines: string[] = [];
  if (peopleCount > 0) {
    const teaser = String(meta.mentionTeaserPeople || "").trim();
    const suffix = teaser ? ` \u2014 ${escapeHtml(teaser)}` : "";
    lines.push(`<tr><td style="padding:0 0 8px;">
      <table cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td width="28" valign="top" style="font-size:17px;line-height:1.6;padding-top:1px;">&#x1F464;</td>
        <td style="font-size:16px;color:#52525B;line-height:1.6;"><strong style="font-weight:700;color:#18181B;">${peopleCount}</strong> ${peopleCount === 1 ? "person" : "people"}${suffix}</td>
      </tr></table>
    </td></tr>`);
  }
  if (companiesCount > 0) {
    const teaser = String(meta.mentionTeaserCompanies || "").trim();
    const suffix = teaser ? ` \u2014 ${escapeHtml(teaser)}` : "";
    lines.push(`<tr><td style="padding:0 0 8px;">
      <table cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td width="28" valign="top" style="font-size:17px;line-height:1.6;padding-top:1px;">&#x1F3E2;</td>
        <td style="font-size:16px;color:#52525B;line-height:1.6;"><strong style="font-weight:700;color:#18181B;">${companiesCount}</strong> ${companiesCount === 1 ? "company" : "companies"}${suffix}</td>
      </tr></table>
    </td></tr>`);
  }
  if (booksCount > 0) {
    const teaser = String(meta.mentionTeaserBooks || "").trim();
    const suffix = teaser ? ` \u2014 ${escapeHtml(teaser)}` : "";
    lines.push(`<tr><td style="padding:0 0 8px;">
      <table cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td width="28" valign="top" style="font-size:17px;line-height:1.6;padding-top:1px;">&#x1F4DA;</td>
        <td style="font-size:16px;color:#52525B;line-height:1.6;"><strong style="font-weight:700;color:#18181B;">${booksCount}</strong> ${booksCount === 1 ? "book" : "books"}${suffix}</td>
      </tr></table>
    </td></tr>`);
  }

  const mentionsUrl = `${recapUrl}#mentions`;

  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:22px 0 18px;">
    <tr><td style="background:#F7F7FC;border-left:3px solid #6366F1;border-radius:0 8px 8px 0;padding:18px 22px 22px;">
      <p style="font-size:12px;font-weight:700;color:#A1A1AA;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 14px;">Mentioned in this episode</p>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        ${lines.join("")}
      </table>
      <p style="font-size:11px;font-weight:700;color:#A1A1AA;letter-spacing:0.14em;text-transform:uppercase;margin:20px 0 0;">Not mentioned anywhere else in this email</p>
      <p style="margin:12px 0 0;">
        <a href="${escapeHtml(mentionsUrl)}" style="font-size:14px;font-weight:600;color:#6366F1;text-decoration:none;">Find out exactly why they came up &#8594;</a>
      </p>
    </td></tr>
  </table>`;
}

function buildEpisodeCard(episode: ParsedEpisode, index: number, meta?: EpisodeMetaForEmail): string {
  const accentColor = getAccentColor(index);
  const derivedSlug = podcastNameToSlug(episode.podcastName);
  const slug = meta?.canonicalSlug || derivedSlug;
  const duration = parseDuration(episode.metaLine);
  const epDate = parseEpisodeDate(episode.metaLine);
  const metaStr = [duration, epDate].filter(Boolean).join(" \u00a0\u00b7\u00a0 ");
  const podcastUrl = `https://podcap.io/podcasts/${slug}`;
  const epSlug = episode.episodeTitle
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-")
    .slice(0, 8)
    .join("-");
  const recapUrl = `https://podcap.io/podcasts/${slug}/${epSlug}`;

  let artworkUrl = meta?.artworkUrl;
  if (artworkUrl && artworkUrl.startsWith("/")) {
    artworkUrl = `https://podcap.io${artworkUrl}`;
  }
  const artworkHtml = artworkUrl
    ? `<a href="${escapeHtml(podcastUrl)}" style="text-decoration:none;display:block;">
        <img src="${escapeHtml(artworkUrl)}" alt="${escapeHtml(episode.podcastName)}" width="64" height="64" style="width:64px;height:64px;border-radius:12px;display:block;object-fit:cover;" />
      </a>`
    : `<a href="${escapeHtml(podcastUrl)}" style="text-decoration:none;display:block;">
        <table cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td style="width:64px;height:64px;background:linear-gradient(145deg,#0f172a,#312e81);border-radius:12px;text-align:center;vertical-align:middle;">
            <span style="font-size:16px;font-weight:700;color:rgba(255,255,255,0.5);">${escapeHtml(slug.slice(0, 3).toUpperCase())}</span>
          </td>
        </tr></table>
      </a>`;

  const guestNames = meta?.guests || [];
  const metaDuration = meta?.episodeDuration || duration;
  const metaDate = meta?.episodeDate || epDate;
  const metaInfoParts = [metaDuration, metaDate].filter(Boolean);
  const metaInfoStr = metaInfoParts.join(" \u00a0\u00b7\u00a0 ");
  const guestStr = guestNames.length > 0 ? guestNames.join(", ") : "";

  return `<tr><td id="ep-${index}" class="ep-block" style="padding:28px 28px 26px;border-bottom:1px solid #F0F0F2;background:#ffffff;">

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:16px;"><tr>
    <td width="68" valign="top">
      ${artworkHtml}
    </td>
    <td style="padding-left:12px;" valign="middle">
      <a href="${escapeHtml(podcastUrl)}" style="text-decoration:none;">
        <p style="font-size:14px;font-weight:700;color:${accentColor};letter-spacing:0.06em;text-transform:uppercase;margin:0 0 3px;">${escapeHtml(episode.podcastName)}</p>
      </a>
      ${metaInfoStr ? `<p style="font-size:13px;color:#A1A1AA;margin:0 0 ${guestStr ? "2px" : "0"};">${escapeHtml(metaInfoStr)}</p>` : ""}
      ${guestStr ? `<p style="font-size:13px;color:#71717A;margin:0;">with ${escapeHtml(guestStr)}</p>` : ""}
    </td>
  </tr></table>

  <h2 class="ep-title" style="font-size:22px;font-weight:700;color:#09090B;letter-spacing:-0.02em;line-height:1.35;margin:0 0 18px;">
    ${escapeHtml(episode.episodeTitle)}
  </h2>

  ${buildKeyTakeaways(episode.keyInsights, accentColor)}

  ${buildRecapText(episode.whatHappened)}

  ${buildEntityTeaser(meta, recapUrl)}

</td></tr>`;
}

export function recapHasContent(markdown: string): boolean {
  const parsed = parseDigestMarkdown(markdown);
  return parsed.episodes.length > 0;
}

export function markdownToEmailHtml(markdown: string, recipientEmail: string, episodeMeta?: Record<string, EpisodeMetaForEmail>, customPreviewText?: string, hookSentence?: string): string {
  const parsed = parseDigestMarkdown(markdown);

  const totalDuration = computeTotalDuration(parsed.episodes);
  const episodeCount = parsed.episodes.length;

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const previewText = customPreviewText || `${episodeCount} of your followed podcasts dropped new episodes - ${parsed.episodes.map(e => e.podcastName).join(", ")}.`;

  const episodeCardsHtml = parsed.episodes.map((ep, idx) => {
    const derivedSlug = podcastNameToSlug(ep.podcastName);
    const meta = episodeMeta?.[derivedSlug];
    return buildEpisodeCard(ep, idx, meta);
  }).join("\n");

  const hookText = hookSentence || "";
  const logoUrl = "https://podcap.io/favicon.png";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Your Daily Podcast Recap</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;}
    img{border:0;outline:none;text-decoration:none;display:block;}
    body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;background:#F7F7FC;margin:0;padding:0;}
    @media only screen and (max-width:620px){
      .outer-pad{padding:0!important;}.card{border-radius:0!important;}
      .topbar{padding:16px 20px!important;}
      .ep-block{padding:26px 20px!important;}
      .quiet-block{padding:18px 20px!important;}
      .footer-inner{padding:20px!important;}
      .ep-title{font-size:18px!important;}
    }
  </style>
</head>
<body style="background:#08080F;margin:0;padding:0;">

<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#08080F;line-height:1px;">${escapeHtml(previewText)} &#8204; &#8204; &#8204; &#8204; &#8204; &#8204; &#8204; &#8204; &#8204; &#8204; &#8204; &#8204;</div>

<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#F7F7FC;">
<tr><td align="center" class="outer-pad" style="padding:28px 16px;">
<table class="card" width="600" cellpadding="0" cellspacing="0" role="presentation" style="width:600px;max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 48px rgba(0,0,0,0.4);">

<!-- TOP BAR -->
<tr><td class="topbar" style="padding:18px 28px;border-bottom:1px solid #F0F0F2;background:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
    <td valign="middle">
      <a href="https://podcap.io" style="text-decoration:none;display:inline-block;">
        <table cellpadding="0" cellspacing="0" role="presentation" style="display:inline-table;"><tr>
          <td valign="middle">
            <img src="${escapeHtml(logoUrl)}" alt="PodCap" width="32" height="32" style="width:32px;height:32px;border-radius:9px;display:block;" />
          </td>
          <td style="padding-left:9px;vertical-align:middle;">
            <span style="font-size:20px;font-weight:600;color:#09090B;letter-spacing:-0.04em;">Pod</span><span style="font-size:20px;font-weight:300;color:#6366F1;letter-spacing:-0.04em;">Cap</span>
          </td>
        </tr></table>
      </a>
    </td>
    <td align="right" valign="middle"><span style="font-size:14px;color:#A1A1AA;font-family:'Courier New',monospace;">${escapeHtml(dateStr)}</span></td>
  </tr></table>
</td></tr>

<!-- HOOK -->
${hookText ? `<tr><td style="padding:24px 28px;background:#ffffff;border-bottom:1px solid #F0F0F2;">
  <p style="font-size:18px;font-weight:400;color:#09090B;line-height:1.5;margin:0;">${escapeHtml(hookText)}</p>
</td></tr>` : ""}

${episodeCardsHtml}

<!-- FOOTER -->
<tr><td class="footer-inner" style="padding:24px 28px;background:#F7F7FC;border-top:1px solid #F0F0F2;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:14px;"><tr>
    <td valign="middle">
      <a href="https://podcap.io" style="text-decoration:none;display:inline-block;">
        <table cellpadding="0" cellspacing="0" role="presentation" style="display:inline-table;"><tr>
          <td valign="middle">
            <img src="${escapeHtml(logoUrl)}" alt="PodCap" width="28" height="28" style="width:28px;height:28px;border-radius:8px;display:block;" />
          </td>
          <td style="padding-left:8px;vertical-align:middle;">
            <span style="font-size:16px;font-weight:600;color:#09090B;letter-spacing:-0.04em;">Pod</span><span style="font-size:16px;font-weight:300;color:#6366F1;letter-spacing:-0.04em;">Cap</span>
          </td>
        </tr></table>
      </a>
    </td>
    <td align="right" valign="middle">
      <a href="https://podcap.io" style="font-family:'Courier New',monospace;font-size:12px;color:#A1A1AA;text-decoration:none;">podcap.io</a>
    </td>
  </tr></table>

  <p style="font-size:13px;color:#A1A1AA;line-height:1.65;margin:0 0 12px;max-width:460px;">Unlocking the world's knowledge trapped inside millions of podcasts - transforming billions of hours of conversation into structured information anyone can instantly learn from.</p>

  <div style="height:1px;background:#E4E4E7;margin-bottom:12px;"></div>

  <p style="font-size:13px;color:#A1A1AA;margin:0 0 8px;">Sent daily when new episodes drop.</p>
  <p style="font-size:13px;margin:0;">
    <a href="https://podcap.io/login" style="color:#6366F1;text-decoration:none;font-weight:500;">Manage podcasts</a>
    &nbsp;&nbsp;&#183;&nbsp;&nbsp;
    <a href="https://podcap.io/login" style="color:#6366F1;text-decoration:none;font-weight:500;">Email preferences</a>
    &nbsp;&nbsp;&#183;&nbsp;&nbsp;
    <a href="https://podcap.io/login" style="color:#A1A1AA;text-decoration:none;">Unsubscribe</a>
  </p>
</td></tr>

</table>

<table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;"><tr>
  <td style="padding:14px 0;text-align:center;">
    <p style="font-size:12px;color:#27272A;margin:0;">&copy; 2026 PodCap</p>
  </td>
</tr></table>

</td></tr>
</table>
</body>
</html>`;
}
