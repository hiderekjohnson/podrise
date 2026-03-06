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

function isEpisodeSection(title: string, body: string): boolean {
  if (/big ideas|conversation ammo/i.test(title)) return false;
  return /\*\*TLDL|\*\*TL;?DR|\*\*Key (Insights|Takeaways)/i.test(body) || /^\*\*.+\*\*$/m.test(body);
}

function parseDigestMarkdown(markdown: string): ParsedDigest {
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
        const ammoMatch = line.match(/^\*\*(.+?)\*\*\s*[—–\-:]\s*(.+)$/);
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
          episode.episodeTitle = titleMatch[1];
          i++;
        }
      }

      while (i < lines.length && !lines[i].trim()) i++;
      if (i < lines.length && !lines[i].startsWith("**") && !lines[i].startsWith(">") && !lines[i].startsWith("-") && !/^🎧/.test(lines[i])) {
        episode.metaLine = lines[i].trim();
        i++;
      }

      while (i < lines.length && !lines[i].trim()) i++;
      if (i < lines.length && /🎧/.test(lines[i])) {
        episode.linksLine = lines[i].trim();
        i++;
      }

      const remainingText = lines.slice(i).join("\n");

      const tldlMatch = remainingText.match(/\*\*TLDL:?\*\*\s*(.+?)(?=\n\s*\n\s*\*\*|\n\*\*[A-Z])/si);
      if (tldlMatch) {
        episode.tldl = tldlMatch[1].trim();
      } else {
        const tldrMatch = remainingText.match(/\*\*TL;?DR:?\*\*\s*(.+?)(?=\n\s*\n\s*\*\*|\n\*\*[A-Z])/si);
        if (tldrMatch) {
          episode.tldl = tldrMatch[1].trim();
        } else {
          const simpleMatch = remainingText.match(/\*\*(?:TLDL|TL;?DR):?\*\*\s*(.+?)$/mi);
          if (simpleMatch) episode.tldl = simpleMatch[1].trim();
        }
      }

      const whatHappenedMatch = remainingText.match(/\*\*What Happened\*\*\s*\n([\s\S]+?)(?=\n\s*\n\s*\*\*Key|\n\*\*Key|\n\*\*Quote)/i);
      if (whatHappenedMatch) {
        episode.whatHappened = whatHappenedMatch[1].trim();
      } else {
        const discussionMatch = remainingText.match(/\*\*(.+?(?:Talk|Debate|Focus|Explain|Discuss|Cover|Explore|Happened).+?)\*\*\s*\n([\s\S]+?)(?=\n\s*\n\s*\*\*Key|\n\*\*Key|\n\*\*Quote)/i);
        if (discussionMatch) {
          episode.whatHappened = discussionMatch[2].trim();
        } else {
          const altMatch = remainingText.match(/\*\*(What .+?)\*\*\s*\n([\s\S]+?)(?=\n\s*\n\s*\*\*Key|\n\*\*Key|\n\*\*Quote)/i);
          if (altMatch) episode.whatHappened = altMatch[2].trim();
        }
      }

      const insightsMatch = remainingText.match(/\*\*Key (?:Insights|Takeaways):?\*\*\s*\n((?:[-•]\s*.+\n?)+)/i);
      if (insightsMatch) {
        episode.keyInsights = insightsMatch[1]
          .split("\n")
          .filter(l => /^[-•]\s/.test(l.trim()))
          .map(l => l.replace(/^[-•]\s*/, "").trim());
      }

      const quoteBlockMatch = remainingText.match(/\*\*Quote\*\*\s*\n(.+?):\s*\n>\s*"?(.+?)"?\s*$/ms);
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

function renderLinks(linksLine: string): string {
  if (!linksLine) return "";
  const rendered = linksLine
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#2563eb;text-decoration:none;font-weight:600;" target="_blank">$1</a>')
    .replace(/🎧\s*/, "");
  return `<div style="margin:12px 0 0 0;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;margin-bottom:6px;">LISTEN TO THE FULL EPISODE</div>
          <p style="margin:0;font-size:13px;color:#6b7280;">&#127911; ${rendered}</p>
        </div>`;
}

function renderInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#2563eb;text-decoration:underline;" target="_blank">$1</a>');
}

function buildStatsCards(episodeCount: number): string {
  return `<table width="100%" cellpadding="0" cellspacing="4" border="0" style="margin:20px 0;">
      <tr>
        <td width="49%" style="text-align:center;padding:16px 8px;border-radius:10px;background:#f0f7ff;">
          <div style="font-size:18px;margin-bottom:4px;">&#127911;</div>
          <div style="font-size:28px;font-weight:800;color:#1a1a1a;">${episodeCount}</div>
          <div style="font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Podcasts recapped</div>
        </td>
        <td width="2%"></td>
        <td width="49%" style="text-align:center;padding:16px 8px;border-radius:10px;background:#ecfdf5;">
          <div style="font-size:18px;margin-bottom:4px;">&#9889;</div>
          <div style="font-size:28px;font-weight:800;color:#059669;">Today</div>
          <div style="font-size:11px;color:#059669;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Time saved</div>
        </td>
      </tr>
    </table>`;
}

function buildTldlSummary(episodes: ParsedEpisode[]): string {
  if (episodes.length === 0) return "";

  const items = episodes
    .filter(ep => ep.tldl)
    .map(ep => `<div style="margin-bottom:16px;">
          <div style="font-size:13px;font-weight:800;color:#1a1a1a;margin-bottom:4px;">&#127911; ${escapeHtml(ep.podcastName)}</div>
          <p style="font-size:14px;color:#374151;line-height:1.5;margin:0;">${renderInlineMarkdown(escapeHtml(ep.tldl))}</p>
        </div>`)
    .join("");

  return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:20px 0;">
      <h2 style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#2563eb;margin:0 0 4px 0;">TLDL</h2>
      <p style="font-size:11px;color:#94a3b8;font-style:italic;margin:0 0 16px 0;">Too Long, Didn't Listen</p>
      ${items}
    </div>`;
}

function buildEpisodeCard(episode: ParsedEpisode): string {
  const metaParts = episode.metaLine.split(/\s*·\s*/).map(p => p.trim()).filter(Boolean);
  let guestHtml = "";
  let durationHtml = "";

  if (metaParts.length >= 3) {
    const guestName = metaParts[0];
    const guestTitle = metaParts[1];
    durationHtml = metaParts[metaParts.length - 1];
    guestHtml = `
        <td style="vertical-align:top;padding-left:20px;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;margin-bottom:4px;">GUEST</div>
          <div style="font-size:15px;font-weight:600;color:#1a1a1a;">${escapeHtml(guestName)}</div>
          <div style="font-size:13px;color:#6b7280;">${escapeHtml(guestTitle)}</div>
        </td>`;
  } else if (metaParts.length === 2) {
    durationHtml = metaParts[1];
  } else {
    durationHtml = metaParts[0] || "";
  }

  const insightsHtml = episode.keyInsights
    .map(insight => `<tr>
            <td style="padding:0 8px 8px 0;vertical-align:top;width:18px;">
              <div style="width:7px;height:7px;border-radius:50%;background:#2563eb;margin-top:7px;"></div>
            </td>
            <td style="padding-bottom:8px;font-size:14px;color:#374151;line-height:1.5;">${renderInlineMarkdown(escapeHtml(insight))}</td>
          </tr>`)
    .join("");

  let quoteHtml = "";
  if (episode.quote) {
    const attrHtml = episode.quoteAttribution
      ? `<div style="font-size:12px;color:#6b7280;margin-bottom:6px;">${escapeHtml(episode.quoteAttribution)}:</div>`
      : "";
    quoteHtml = `<div style="margin:16px 0 0 0;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;margin-bottom:8px;">QUOTE</div>
          ${attrHtml}
          <div style="background:#fefce8;border-left:3px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 16px;">
            <table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="vertical-align:top;padding-right:10px;font-size:22px;color:#f59e0b;">&#8220;&#8220;</td>
              <td style="font-size:14px;color:#1a1a1a;font-style:italic;line-height:1.5;">"${escapeHtml(episode.quote)}"</td>
            </tr></table>
          </div>
        </div>`;
  }

  const whatHappenedHtml = episode.whatHappened
    ? `<div style="margin:16px 0;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#2563eb;margin-bottom:8px;">WHAT HAPPENED</div>
          ${episode.whatHappened.split(/\n\n+/).map(p =>
            `<p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 12px 0;">${renderInlineMarkdown(escapeHtml(p.trim()))}</p>`
          ).join("")}
        </div>`
    : "";

  return `<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin:24px 0;">
      <!--[if mso]>
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#4f7df5;padding:14px 20px;">
      <![endif]-->
      <div style="background-color:#4f7df5;background-image:linear-gradient(135deg,#4f7df5,#6c9aff);padding:14px 20px;">
        <h2 style="color:#ffffff;font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin:0;">&#127911; ${escapeHtml(episode.podcastName)}</h2>
      </div>
      <!--[if mso]>
      </td></tr></table>
      <![endif]-->
      <div style="padding:20px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="vertical-align:top;">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;margin-bottom:4px;">EPISODE</div>
              <div style="font-size:16px;font-weight:700;color:#1a1a1a;line-height:1.3;">${escapeHtml(episode.episodeTitle)}</div>
            </td>
            ${guestHtml}
          </tr>
        </table>
        ${durationHtml ? `<div style="margin-top:12px;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;margin-bottom:4px;">LENGTH</div>
          <div style="font-size:15px;font-weight:600;color:#1a1a1a;">${escapeHtml(durationHtml)}</div>
        </div>` : ""}
        ${renderLinks(episode.linksLine)}
        ${whatHappenedHtml}
        ${insightsHtml ? `<div style="margin:16px 0 0 0;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#2563eb;margin-bottom:10px;">KEY INSIGHTS</div>
          <table cellpadding="0" cellspacing="0" border="0">
            ${insightsHtml}
          </table>
        </div>` : ""}
        ${quoteHtml}
      </div>
    </div>`;
}

export interface EmailTemplateConfig {
  headerTitle: string;
  headerSubtitle: string;
  headline: string;
  subtitle: string;
  signoffLine1: string;
  signoffLine2: string;
  psLine1: string;
  psLine2: string;
  showPs: string;
  footerText: string;
  headerColor: string;
  accentColor: string;
}

export const DEFAULT_TEMPLATE: EmailTemplateConfig = {
  headerTitle: "☕ PodCap Daily",
  headerSubtitle: "Your personalized podcast digest",
  headline: "We listened to {{audio_length}} of your favorite podcasts yesterday so you don't have to.",
  subtitle: "Here's everything worth knowing in a few minutes.",
  signoffLine1: "That's your PodCap Daily. ☕",
  signoffLine2: "Same time tomorrow?",
  psLine1: "P.S. Know someone who likes the same podcasts as you?",
  psLine2: "Forward them this email. They'll thank you later.",
  showPs: "true",
  footerText: "You're receiving this because you signed up for PodCap Daily.",
  headerColor: "#2563eb",
  accentColor: "#2563eb",
};

export const MERGE_TAGS: { tag: string; description: string; example: string }[] = [
  { tag: "{{audio_length}}", description: "Total listening time of all episodes", example: "5 hours and 32 minutes" },
  { tag: "{{episode_count}}", description: "Number of podcast episodes", example: "3" },
  { tag: "{{podcast_names}}", description: "Names of podcasts covered", example: "My First Million · The All-In Podcast" },
  { tag: "{{date}}", description: "Today's date", example: "Thursday, March 5, 2026" },
  { tag: "{{email}}", description: "Recipient's email address", example: "you@example.com" },
];

function replaceMergeTags(text: string, vars: Record<string, string>): string {
  return text
    .replace(/\{\{audio_length\}\}/g, vars.audio_length || "your favorite podcasts")
    .replace(/\{\{episode_count\}\}/g, vars.episode_count || "0")
    .replace(/\{\{podcast_names\}\}/g, vars.podcast_names || "")
    .replace(/\{\{date\}\}/g, vars.date || "")
    .replace(/\{\{email\}\}/g, vars.email || "");
}

export function recapHasContent(markdown: string): boolean {
  const parsed = parseDigestMarkdown(markdown);
  return parsed.episodes.length > 0;
}

export function markdownToEmailHtml(markdown: string, recipientEmail: string, templateOverrides?: Partial<EmailTemplateConfig>): string {
  const parsed = parseDigestMarkdown(markdown);

  const durationMatch = parsed.statsHeader.match(/\*?\*?([^*]+)\*?\*?\s*Total duration/i);
  const totalDuration = durationMatch ? durationMatch[1].replace(/\*/g, "").trim() : "";

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const t: EmailTemplateConfig = { ...DEFAULT_TEMPLATE, ...templateOverrides };

  const mergeVars: Record<string, string> = {
    audio_length: totalDuration || parsed.episodes.length + " of your favorite podcasts",
    episode_count: String(parsed.episodes.length),
    podcast_names: parsed.podcastNames || "",
    date: dateStr,
    email: recipientEmail,
  };

  const headline = escapeHtml(replaceMergeTags(t.headline, mergeVars));
  const subtitle = escapeHtml(replaceMergeTags(t.subtitle, mergeVars));
  const headerTitle = escapeHtml(replaceMergeTags(t.headerTitle, mergeVars));
  const headerSubtitle = escapeHtml(replaceMergeTags(t.headerSubtitle, mergeVars));
  const signoff1 = escapeHtml(replaceMergeTags(t.signoffLine1, mergeVars));
  const signoff2 = escapeHtml(replaceMergeTags(t.signoffLine2, mergeVars));
  const psLine1 = escapeHtml(replaceMergeTags(t.psLine1, mergeVars));
  const psLine2 = escapeHtml(replaceMergeTags(t.psLine2, mergeVars));
  const footerText = escapeHtml(replaceMergeTags(t.footerText, mergeVars));

  const episodeCardsHtml = parsed.episodes.map(ep => buildEpisodeCard(ep)).join("");

  const showPs = t.showPs === "true";

  const manageBanner = `<div style="background:#f0f7ff;border:1px solid #dbeafe;border-radius:8px;padding:10px 16px;margin-bottom:24px;text-align:center;">
        <p style="color:#1e40af;font-size:12px;margin:0;">Want to change your podcasts? <a href="https://podcap.io/login" style="color:${escapeHtml(t.accentColor)};font-weight:600;text-decoration:underline;">Manage your subscriptions</a></p>
      </div>`;

  const headerGradientDark = adjustColor(t.headerColor, -20);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--[if mso]>
  <style>table{border-collapse:collapse;}td{padding:0;}</style>
  <![endif]-->
  <title>PodCap Daily Digest</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;margin-top:20px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <!--[if mso]>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${escapeHtml(t.headerColor)};padding:32px 24px;text-align:center;">
    <![endif]-->
    <div style="background-color:${escapeHtml(t.headerColor)};background-image:linear-gradient(135deg,${escapeHtml(headerGradientDark)},${escapeHtml(t.headerColor)});padding:32px 24px;text-align:center;">
      <h1 style="color:#ffffff;font-size:28px;font-weight:800;margin:0;letter-spacing:-0.5px;">${headerTitle}</h1>
      <p style="color:rgba(255,255,255,0.75);font-size:14px;margin:8px 0 0 0;">${headerSubtitle}</p>
    </div>
    <!--[if mso]>
    </td></tr></table>
    <![endif]-->
    <div style="padding:28px;">
      <h2 style="font-size:22px;font-weight:800;color:#1a1a1a;margin:0 0 12px 0;line-height:1.4;">${headline}</h2>
      <p style="font-size:15px;color:#374151;margin:0 0 24px 0;">${subtitle}</p>
      ${episodeCardsHtml}
      <div style="text-align:center;margin:24px 0 8px 0;">
        <p style="font-size:16px;font-weight:700;color:#1a1a1a;margin:0 0 4px 0;">${signoff1}</p>
        <p style="font-size:13px;color:#6b7280;margin:0;">${signoff2}</p>
      </div>
      ${showPs ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;margin:20px 0;text-align:center;">
        <p style="font-size:14px;font-weight:600;color:#1a1a1a;margin:0 0 6px 0;">${psLine1}</p>
        <p style="font-size:13px;color:#6b7280;margin:0;">${psLine2}</p>
      </div>` : ""}
      ${manageBanner}
    </div>
    <div style="background:#f9fafb;padding:20px 28px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">
        ${footerText} <a href="https://podcap.io" style="color:#9ca3af;text-decoration:underline;">podcap.io</a>
      </p>
      <p style="color:#9ca3af;font-size:12px;margin:4px 0 0 0;">
        <a href="https://podcap.io/login" style="color:#9ca3af;text-decoration:underline;">Manage your podcasts</a> &middot; Sent to ${escapeHtml(recipientEmail)}
      </p>
    </div>
  </div>
</body>
</html>`;
}

function adjustColor(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const num = parseInt(h, 16);
  let r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + amount));
  let g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  let b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
