import { storage } from "./storage";
import { pool } from "./db";
import { getUncachableResendClient } from "./resendClient";
import { markdownToEmailHtml, recapHasContent, type EpisodeMetaForEmail } from "./emailTemplate";
import { generateRecap, generateRecapFromTranscript, type ParsedEpisode } from "./recapGenerator";
import { searchPodcastByItunesId, getRecentEpisodesWithTranscripts, getEpisodeTranscript, getEpisodeTranscriptSegments, getEpisodesByItunesId, searchEpisodeByName } from "./taddyClient";
import { parseRawTaddySegments, parseTranscriptToSegments } from "./transcriptParser";
import { ITUNES_ID_TO_SLUG } from "./podcastLandingMap";
import { activeEpGenItunesIds } from "./epGenState";
import { SQL_NORMALIZE_TITLE } from "./utils/normalizeTitle";

const SCHEDULER_INTERVAL_MS = 60 * 1000;
const ADMIN_NOTIFY_EMAIL = "hiderekjohnson@gmail.com";
const recentlyGenerated = new Set<string>();
let schedulerConsecutiveFailures = 0;
const MAX_SCHEDULER_BACKOFF_MS = 10 * 60 * 1000;

function podcastNameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function buildEpisodeMeta(podcastNames: string[]): Promise<Record<string, EpisodeMetaForEmail>> {
  const meta: Record<string, EpisodeMetaForEmail> = {};
  if (podcastNames.length === 0) return meta;

  try {
    const { pool: dbPool } = await import("./db");
    const client = await dbPool.connect();
    try {
      for (const name of podcastNames) {
        const derivedSlug = podcastNameToSlug(name);

        const dirRow = await client.query(
          `SELECT slug, artwork_url FROM podcast_directory WHERE LOWER(name) = LOWER($1) LIMIT 1`,
          [name]
        );
        const canonicalSlug = dirRow.rows[0]?.slug || derivedSlug;

        const recapRow = await client.query(
          `SELECT artwork_url, entity_contexts_cache, resources, episode_slug, episode_title, guests, duration, publish_date
           FROM landing_page_recaps
           WHERE slug = $1
           ORDER BY publish_date DESC LIMIT 1`,
          [canonicalSlug]
        );

        if (recapRow.rows.length === 0) {
          meta[derivedSlug] = { canonicalSlug, artworkUrl: dirRow.rows[0]?.artwork_url || null };
          continue;
        }

        const row = recapRow.rows[0];
        const artworkUrl = row.artwork_url || dirRow.rows[0]?.artwork_url || null;

        const knownNames: Record<string, string> = {
          "openai": "OpenAI", "nvidia": "NVIDIA", "spacex": "SpaceX", "airbnb": "Airbnb",
          "amd": "AMD", "ai": "AI", "meta": "Meta", "tesla": "Tesla", "netflix": "Netflix",
          "tiktok": "TikTok", "bytedance": "ByteDance", "shopify": "Shopify", "coinbase": "Coinbase",
          "doordash": "DoorDash", "youtube": "YouTube", "linkedin": "LinkedIn", "deepmind": "DeepMind",
          "ibm": "IBM", "sba": "SBA", "tsmc": "TSMC", "bmw": "BMW",
        };

        let entityCacheData = row.entity_contexts_cache;
        if (!entityCacheData && row.episode_slug) {
          try {
            const recapIdRes = await client.query(
              `SELECT id, sponsors FROM landing_page_recaps WHERE slug = $1 AND episode_slug = $2 LIMIT 1`,
              [canonicalSlug, row.episode_slug]
            );
            if (recapIdRes.rows[0]?.id) {
              const transcriptRes = await client.query(
                `SELECT et.transcript FROM episode_transcripts et
                 JOIN podcast_directory pd ON pd.itunes_id::text = et.podcast_id
                 WHERE pd.slug = $1 AND et.episode_title = (SELECT episode_title FROM landing_page_recaps WHERE id = $2)
                 LIMIT 1`,
                [canonicalSlug, recapIdRes.rows[0].id]
              );
              if (transcriptRes.rows[0]?.transcript) {
                let sponsorNames: string[] = [];
                try {
                  const sponsors = recapIdRes.rows[0].sponsors
                    ? (typeof recapIdRes.rows[0].sponsors === "string" ? JSON.parse(recapIdRes.rows[0].sponsors) : recapIdRes.rows[0].sponsors)
                    : [];
                  sponsorNames = sponsors.map((s: any) => (s.name || "")).filter(Boolean);
                } catch {}

                const { generateEntityContextsForRecap } = await import("./entityContextGenerator");
                const generated = await generateEntityContextsForRecap(
                  recapIdRes.rows[0].id, canonicalSlug, name,
                  row.episode_title || row.episode_slug, transcriptRes.rows[0].transcript, sponsorNames,
                  row.episode_slug,
                );
                if (Object.keys(generated).length > 0) {
                  entityCacheData = JSON.stringify(generated);
                }
              }
            }
          } catch (err) {
            console.warn(`[EmailScheduler] Entity context generation failed for ${canonicalSlug}:`, err);
          }
        }

        const companyNames: string[] = [];
        const personNames: string[] = [];
        let companiesCount = 0;
        let peopleCount = 0;
        if (entityCacheData) {
          const cache = typeof entityCacheData === "string" ? JSON.parse(entityCacheData) : entityCacheData;
          for (const key of Object.keys(cache)) {
            const isLikelyPerson = /^[a-z]+-[a-z]+(-[a-z]+)?$/.test(key) && !["openai", "anthropic", "nvidia", "google", "amazon", "spacex", "airbnb", "spotify", "amd", "apple", "microsoft", "meta", "tesla", "stripe", "shopify", "uber", "lyft", "doordash", "robinhood", "coinbase", "palantir", "databricks", "snowflake", "figma", "notion", "discord", "slack", "zoom", "netflix", "disney", "hulu", "warner", "paramount", "sony", "samsung", "intel", "qualcomm", "broadcom", "oracle", "salesforce", "adobe", "twilio", "snap", "pinterest", "reddit", "tiktok", "bytedance", "alibaba", "tencent", "baidu", "huawei"].includes(key);
            const displayName = knownNames[key] || key.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            if (isLikelyPerson) {
              personNames.push(displayName);
              peopleCount++;
            } else {
              companyNames.push(displayName);
              companiesCount++;
            }
          }
        }

        let booksCount = 0;
        const bookTitles: string[] = [];
        const parsedResources = row.resources
          ? (typeof row.resources === "string" ? JSON.parse(row.resources) : row.resources)
          : [];
        if (Array.isArray(parsedResources)) {
          const books = parsedResources.filter((r: any) => r.type === "book");
          booksCount = books.length;
          for (const b of books) {
            if (b.name) bookTitles.push(b.name);
          }
        }

        let quotesCount = 0;
        if (row.episode_slug) {
          const quotesResult = await client.query(
            `SELECT COUNT(*)::int as cnt FROM episode_quotes WHERE podcast_slug = $1 AND episode_slug = $2`,
            [canonicalSlug, row.episode_slug]
          );
          quotesCount = quotesResult.rows[0]?.cnt || 0;
        }

        const guestNames: string[] = [];
        if (row.guests) {
          const guests = typeof row.guests === "string" ? JSON.parse(row.guests) : row.guests;
          if (Array.isArray(guests)) {
            for (const g of guests) {
              if (g.name) guestNames.push(g.name);
            }
          }
        }

        let episodeDate = "";
        if (row.publish_date) {
          try {
            const d = new Date(row.publish_date);
            episodeDate = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          } catch (e) {}
        }

        let mentionTeaserPeople = "";
        let mentionTeaserCompanies = "";
        let mentionTeaserBooks = "";

        const entityContexts: Record<string, string> = {};
        if (entityCacheData) {
          const cache = typeof entityCacheData === "string" ? JSON.parse(entityCacheData) : entityCacheData;
          if (cache && typeof cache === "object") {
            for (const [slug, ctx] of Object.entries(cache)) {
              if (typeof ctx === "string" && ctx) entityContexts[slug] = ctx;
            }
          }
        }

        if (peopleCount > 0 || companiesCount > 0 || booksCount > 0) {
          try {
            const { openai } = await import("./replit_integrations/image/client");
            const contextSummary: string[] = [];
            for (const [slug, ctx] of Object.entries(entityContexts)) {
              const name = knownNames[slug] || slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
              contextSummary.push(`${name}: ${ctx}`);
            }
            const bookContexts = bookTitles.map(t => {
              const res = Array.isArray(parsedResources) ? parsedResources.find((r: any) => r.name === t) : null;
              return `Book: "${t}" - ${res?.context || res?.description || "recommended"}`;
            });

            const aiResp_teaser = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [{
                role: "user",
                content: `You write teaser lines for a podcast recap email's "Mentioned in this episode" section. Each line starts with an emoji, a count, and an em dash, then YOUR FRAGMENT completes it.

FORMAT (follow exactly):
- For PEOPLE: lead with the most recognisable person's name, then intrigue
  "including [Most Famous Name], and not for the reason you'd think"
- For COMPANIES: lead with a short direct quote (under 10 words, in quotation marks) -- the most surprising or provocative thing said about any company
  "one was called \\"the most dangerous company in AI right now\\""
- For BOOKS: lead with the specific book title if there is only one, or the most notable title if multiple, then a hook
  "they said everyone should read it this weekend"

CRITICAL RULES:
- For people: ALWAYS name the single most recognisable person from the list. Pick the biggest name the reader would instantly recognise.
- For companies: ALWAYS include a real short quote from the episode context below. Put it in quotation marks. Keep the quote under 10 words.
- For books: if only 1 book, name it. If multiple, name the most notable one and add intrigue about the rest.
- Keep each fragment under 80 characters total.
- Start lowercase (it follows an em dash in the email).
- Be SPECIFIC to this episode -- reference real claims from the context below.

GOOD examples:
- People: "including Elon Musk, and not for the reason you'd think"
- People: "including Sam Altman -- one host called his strategy reckless"
- Companies: "one was called \\"a ticking time bomb for the industry\\""
- Companies: "one was described as \\"printing money while nobody watches\\""
- Books: "they said The Almanack of Naval Ravikant changed everything"
- Books: "including one they called mandatory reading for founders"

Episode entities and what was said about them:
${contextSummary.join('\n')}
${bookContexts.join('\n')}

People count: ${peopleCount}
Companies count: ${companiesCount}
Books count: ${booksCount}

Respond with JSON: { "people": "fragment or empty", "companies": "fragment or empty", "books": "fragment or empty" }
Only include keys where count > 0.`
              }],
              max_tokens: 300,
              temperature: 0.8,
              response_format: { type: "json_object" },
            });

            const { logCompletionUsage } = await import("./apiUsageTracker");
            logCompletionUsage(aiResp_teaser, "gpt-4o-mini", "email_teaser");
            const content = aiResp_teaser.choices[0]?.message?.content;
            if (content) {
              const parsed = JSON.parse(content);
              mentionTeaserPeople = parsed.people || "";
              mentionTeaserCompanies = parsed.companies || "";
              mentionTeaserBooks = parsed.books || "";
            }
          } catch (err) {
            console.warn("[EmailScheduler] AI teaser generation failed, using plain counts:", err);
          }
        }

        meta[derivedSlug] = {
          canonicalSlug,
          artworkUrl,
          companiesCount,
          peopleCount,
          booksCount,
          quotesCount,
          companyNames,
          personNames,
          bookTitles,
          guests: guestNames,
          episodeDuration: row.duration || "",
          episodeDate,
          mentionTeaserPeople,
          mentionTeaserCompanies,
          mentionTeaserBooks,
        };
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn("[EmailScheduler] Failed to build episode metadata:", err);
  }

  return meta;
}

export interface EmailCopySystem {
  subject: string;
  previewText: string;
  leadHeadline: string;
  supportingDetail: string;
  coverlines: string;
  leadEpisodePodcast: string;
}

export async function generateEmailSubjectAndPreview(summary: string, episodeCount: number = 1): Promise<EmailCopySystem> {
  const fallbackSubject = `Your podcasts dropped new episodes`;
  const fallbackPreview = `One of your podcasts made a claim yesterday that changes how you think about it`;
  const fallbackHeadline = `Something worth knowing came up in your podcasts`;
  const fallbackDetail = `One of them made a claim yesterday that changes how you think about it`;
  try {
    const { openai } = await import("./replit_integrations/image/client");

    const coverlinesInstruction = episodeCount > 1
      ? `5. COVERLINES
- One fluid italic sentence. Start with "Also yesterday \u2014" then connect all remaining episodes with "and."
- NEVER use the words: deep dive, candid discussion, explores, examines, reshaping, narratives.
- Must name at least one specific person or surprising claim from each remaining episode.
- Must read like gossip between two people who actually listened, not a TV guide description.
- BAD: "Also yesterday \u2014 a deep dive into geopolitical chaos, and a candid discussion on how AI is reshaping global narratives"
- GOOD: "Also yesterday \u2014 two comedians made more sense of the world than most journalists, and one of them said something about AI that nobody in media wants to admit"`
      : `5. COVERLINES: Return empty string "" since there is only one episode.`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You write email copy for a daily podcast recap email. The reader receives this email THE MORNING AFTER the episodes dropped. All copy must reflect this \u2014 never say "today's episodes", "in today's recap", or "this episode." Always write as if you are telling someone what happened yesterday.

CRITICAL RULE \u2014 LEAD EPISODE SELECTION (overrides everything else):
Before writing any copy, scan all episodes in the recap and pick the one with the single most surprising, specific, or aspirational claim. That is the lead episode.
\u2022 The ENTIRE header \u2014 headline, supporting detail, and subject line \u2014 must be written from the lead episode's content ONLY. Never from any other episode.
\u2022 All remaining episodes are teased in the coverlines only.
\u2022 You must return the lead episode's podcast name in the "leadEpisodePodcast" field so the system can place it first in the email.

The subject line, preheader, lead headline, supporting detail, and coverlines are ONE COMPLETE SYSTEM. Generate all of them together from the recap content below.

THE SINGLE TEST FOR EVERY LINE: Would a tabloid editor print this on a front page? If it sounds like a university press release, a LinkedIn post, or a podcast description, rewrite it until it doesn't.

1. SUBJECT LINE
- The single most surprising, aspirational, or counterintuitive claim from any episode.
- Under 50 characters. No emojis.
- Never use "digest", "recap", "daily", "newsletter", "update", "roundup", "briefing", "episode", or "PodRise".
- Creates a question in the reader's mind that can only be answered by opening.
- Sounds like a smart friend texting you something they just heard.

2. PREHEADER
- EXACTLY 120 characters (count carefully).
- Two connected thoughts separated by an em dash (\u2014). Never use double hyphens --.
- First 60 characters work standalone in Gmail desktop.
- Full 120 characters work as a compelling iOS lock screen notification.
- Never repeat the subject line verbatim.

3. LEAD HEADLINE
- Under 8 words. Must never wrap to a third line in a 600px email.
- NEVER use the words: reveals, discusses, explores, examines, features, showcases, delves, unpacks. Those are press release words and they kill the hook instantly.
- Must be personal, specific, and make the reader feel like they are about to miss something.
- Written like a New York Post front page. Active language only.
- NO full stop at the end.
- BAD: "Sarah's List reveals the companies that could make you a millionaire"
- GOOD: "The company list Sam Parr's wife used to make her first million"
- BAD: "ZuruTech and Varda have the potential to transform entire industries"
- GOOD: "The founder building homes for a tenth of the cost nobody knows about"

4. SUPPORTING DETAIL
- One sentence. Never names more than one company or person.
- NEVER use phrases like "have the potential to", "transform entire industries", "by 2026" as a throwaway ending, or "poised for growth."
- Must contain exactly one specific surprising detail \u2014 a number, a direct comparison, or a claim that sounds almost too bold to be true.
- Must leave the most interesting part unsaid so the only way to get the rest is to scroll.
- BAD: "These firms including ZuruTech and Varda have the potential to transform entire industries by 2026"
- GOOD: "One of them builds homes for a tenth of the cost \u2014 and the founder has already done it in three other industries"

${coverlinesInstruction}

There are ${episodeCount} episode(s) in this email.

Recap content:
${summary.slice(0, 4000)}

Respond with JSON: { "subject": "...", "preheader": "...", "leadHeadline": "...", "supportingDetail": "...", "coverlines": "...", "leadEpisodePodcast": "..." }
The "leadEpisodePodcast" field must contain the EXACT podcast name as it appears in the recap headers (the ## lines). The preheader MUST be exactly 120 characters. Count them.`
      }],
      max_tokens: 600,
      temperature: 0.9,
      response_format: { type: "json_object" },
    });
    const { logCompletionUsage } = await import("./apiUsageTracker");
    logCompletionUsage(resp, "gpt-4o-mini", "email_subject");

    const content = resp.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      const subj = String(parsed.subject || "").trim();
      let prev = String(parsed.preheader || "").trim();
      const headline = String(parsed.leadHeadline || "").trim();
      const detail = String(parsed.supportingDetail || "").trim();
      const covers = String(parsed.coverlines || "").trim();
      const leadPodcast = String(parsed.leadEpisodePodcast || "").trim();
      if (prev.length > 130) prev = prev.slice(0, 127) + "...";
      if (subj && subj.length <= 80) {
        return {
          subject: subj,
          previewText: prev || fallbackPreview,
          leadHeadline: headline || fallbackHeadline,
          supportingDetail: detail || fallbackDetail,
          coverlines: covers,
          leadEpisodePodcast: leadPodcast,
        };
      }
    }
  } catch (err) {
    console.warn("[EmailScheduler] AI subject/preheader/hook generation failed:", err);
  }
  return { subject: fallbackSubject, previewText: fallbackPreview, leadHeadline: fallbackHeadline, supportingDetail: fallbackDetail, coverlines: "", leadEpisodePodcast: "" };
}

export function reorderMarkdownLeadFirst(markdown: string, leadEpisodePodcast: string): string {
  if (!leadEpisodePodcast) return markdown;

  const h2Sections = markdown.split(/^(?=## )/m);
  const preamble: string[] = [];
  const episodes: string[] = [];

  for (const section of h2Sections) {
    if (section.startsWith("## ")) {
      episodes.push(section);
    } else {
      preamble.push(section);
    }
  }

  if (episodes.length <= 1) return markdown;

  const leadNorm = leadEpisodePodcast.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const leadIdx = episodes.findIndex(ep => {
    const titleLine = ep.split("\n")[0].replace(/^## /, "").trim();
    const titleNorm = titleLine.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return titleNorm.includes(leadNorm) || leadNorm.includes(titleNorm);
  });

  if (leadIdx > 0) {
    const [lead] = episodes.splice(leadIdx, 1);
    episodes.unshift(lead);
    console.log(`[EmailScheduler] Reordered: moved "${leadEpisodePodcast}" to first position`);
  } else if (leadIdx === 0) {
    console.log(`[EmailScheduler] Lead episode "${leadEpisodePodcast}" already first`);
  } else {
    console.log(`[EmailScheduler] Could not find lead episode "${leadEpisodePodcast}" in markdown sections`);
  }

  return [...preamble, ...episodes].join("");
}

async function sendAdminNotification(userEmail: string, subject: string) {
  const { client, fromEmail } = await getUncachableResendClient();
  await client.emails.send({
    from: `PodRise System <${fromEmail}>`,
    to: ADMIN_NOTIFY_EMAIL,
    subject: `⚡ New email pending approval - ${userEmail} (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })} ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })})`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="margin: 0 0 16px; font-size: 18px; color: #1a1a1a;">New Email Pending Approval</h2>
        <div style="background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <p style="margin: 0 0 8px; font-size: 14px; color: #92400E;"><strong>For:</strong> ${userEmail}</p>
          <p style="margin: 0; font-size: 14px; color: #92400E;"><strong>Subject:</strong> ${subject}</p>
        </div>
        <p style="margin: 0 0 16px; font-size: 14px; color: #666;">A new recap email has been generated and is waiting for your review. Please log in to the admin dashboard to preview and approve it.</p>
        <a href="https://podrise.com/admin" style="display: inline-block; background: #2563EB; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600;">Review in Admin Dashboard</a>
      </div>
    `,
  });
  console.log(`[EmailScheduler] Admin notification sent to ${ADMIN_NOTIFY_EMAIL}`);
}

async function updateLandingPageRecaps(userPodcasts: string[], parsedEpisodes: ParsedEpisode[]) {
  const podcastIdMap = new Map<string, string>();
  const podcastNameMap = new Map<string, string>();
  for (const raw of userPodcasts) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.id && parsed.name) {
        podcastIdMap.set(parsed.name.toLowerCase(), parsed.id);
        podcastNameMap.set(parsed.name.toLowerCase(), parsed.name);
      }
    } catch {}
  }

  for (const ep of parsedEpisodes) {
    const epNameLower = (ep.podcastName || "").toLowerCase();
    const itunesId = podcastIdMap.get(epNameLower);
    if (!itunesId) continue;
    const slug = ITUNES_ID_TO_SLUG[itunesId];
    if (!slug) continue;

    await storage.upsertExampleRecap({
      slug,
      podcastName: ep.podcastName,
      itunesId,
      episodeTitle: ep.episodeTitle,
      episodeDate: ep.episodeDate || "",
      episodeDuration: ep.episodeDuration,
      tldl: "",
      whatHappened: ep.whatHappened,
      keyInsights: ep.keyInsights,
      quote: "",
      quoteAttribution: "",
    });
    console.log(`[EmailScheduler] Updated landing page example recap for ${slug} (${ep.episodeTitle})`);
  }
}

function getUserLocalDate(timezone: string): string {
  try {
    return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
  } catch {
    return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  }
}

function getUserLocalTime(timezone: string): { hours: number; minutes: number } {
  try {
    const now = new Date();
    const formatted = now.toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    const [hours, minutes] = formatted.split(":").map(Number);
    return { hours, minutes };
  } catch {
    return { hours: -1, minutes: -1 };
  }
}

function isDeliveryTime(deliveryTime: string, timezone: string): boolean {
  const parts = deliveryTime.split(":").map(Number);
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return false;
  const [targetHour, targetMinute] = parts;
  const { hours, minutes } = getUserLocalTime(timezone);
  if (hours === -1) return false;
  const targetTotal = targetHour * 60 + targetMinute;
  const currentTotal = hours * 60 + minutes;
  const diff = currentTotal - targetTotal;
  return diff >= 0 && diff <= 5;
}

function getYesterdayInTimezone(timezone: string): { start: Date; end: Date; label: string; dateStr: string } {
  try {
    const nowInTz = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
    const todayLocal = new Date(nowInTz + "T00:00:00");
    const yesterdayLocal = new Date(todayLocal);
    yesterdayLocal.setDate(yesterdayLocal.getDate() - 1);
    const label = yesterdayLocal.toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
    const dateStr = yesterdayLocal.toISOString().split("T")[0];
    return { start: yesterdayLocal, end: todayLocal, label, dateStr };
  } catch {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {
      start, end,
      label: start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
      dateStr: start.toISOString().split("T")[0],
    };
  }
}

function isUserOnVacation(user: any): boolean {
  if (!user.vacationUntil) return false;
  const timezone = user.deliveryTimezone || "America/New_York";
  const userLocalDate = getUserLocalDate(timezone);
  return userLocalDate < user.vacationUntil;
}

async function generateForUser(user: any, force: boolean, recapPrompt?: string): Promise<"generated" | "skipped" | "failed"> {
  if (!user.podcasts || user.podcasts.length === 0 || !user.email) {
    return "skipped";
  }

  if (!user.emailVerified) {
    return "skipped";
  }

  if (isUserOnVacation(user)) {
    console.log(`[EmailScheduler] Skipping user ${user.id}: on vacation until ${user.vacationUntil}`);
    return "skipped";
  }

  const timezone = user.deliveryTimezone || "America/New_York";

  try {
    const { start: yesterdayStart, end: yesterdayEnd, label: yesterdayLabel, dateStr } = getYesterdayInTimezone(timezone);

    if (!force) {
      const existing = await storage.getPendingEmailsForUser(user.id, dateStr);
      const activeEmails = existing.filter((e: any) => e.status === "held" || e.status === "pending");
      if (activeEmails.length > 0) {
        console.log(`[EmailScheduler] Skipping user ${user.id}: active pending email already exists for ${dateStr}`);
        return "skipped";
      }
    } else {
      const existing = await storage.getPendingEmailsForUser(user.id, dateStr);
      const heldOnes = existing.filter((e: any) => e.status === "held" || e.status === "pending");
      for (const p of heldOnes) {
        await storage.updatePendingEmailStatus(p.id, "cancelled", "Replaced by forced regeneration");
      }
    }

    console.log(`[EmailScheduler] Generating recap for user ${user.id} (${user.email})...`);

    const result = await generateRecap(user, yesterdayStart, yesterdayEnd, yesterdayLabel, dateStr, "yesterday", recapPrompt);
    if (!result) {
      console.log(`[EmailScheduler] No new episodes for user ${user.id}, skipping.`);
      return "skipped";
    }

    const h2Count = (result.summary.match(/^## /gm) || []).length;
    console.log(`[EmailScheduler] User ${user.id} recap: ${result.summary.length} chars, ${h2Count} h2 sections`);
    if (!recapHasContent(result.summary)) {
      console.warn(`[EmailScheduler] Recap for user ${user.id} has 0 parsed episodes. First 500 chars: ${result.summary.slice(0, 500)}`);
      return "skipped";
    }

    const podcastNames = result.parsedEpisodes.map((ep: any) => ep.podcastName).filter(Boolean);
    const episodeMeta = await buildEpisodeMeta(podcastNames);
    const episodeCount = result.parsedEpisodes.length || 1;
    const emailCopy = await generateEmailSubjectAndPreview(result.summary, episodeCount);

    if (emailCopy.leadEpisodePodcast) {
      try {
        const leadEp = result.parsedEpisodes.find((ep: any) =>
          ep.podcastName && ep.podcastName.toLowerCase() === emailCopy.leadEpisodePodcast.toLowerCase()
        );
        const leadTitle = leadEp?.episodeTitle || "";
        if (leadTitle) {
          const { rows: storedHeadlines } = await pool.query(
            `SELECT tabloid_headline, tabloid_sub_headline FROM landing_page_recaps
             WHERE LOWER(podcast_name) = LOWER($1) AND LOWER(episode_title) = LOWER($2)
               AND tabloid_headline IS NOT NULL AND tabloid_headline != ''
             LIMIT 1`,
            [emailCopy.leadEpisodePodcast, leadTitle]
          );
          if (storedHeadlines.length > 0 && storedHeadlines[0].tabloid_headline) {
            emailCopy.leadHeadline = storedHeadlines[0].tabloid_headline;
            if (storedHeadlines[0].tabloid_sub_headline) {
              emailCopy.supportingDetail = storedHeadlines[0].tabloid_sub_headline;
            }
          }
        }
      } catch (err) {
        console.warn("[EmailScheduler] Failed to fetch stored tabloid headline:", err);
      }
    }

    const reorderedSummary = reorderMarkdownLeadFirst(result.summary, emailCopy.leadEpisodePodcast);

    let referralData: { referralCode: string; referralCount: number; nextTierName?: string; nextTierThreshold?: number } | undefined;
    try {
      let code = user.referralCode;
      if (!code) {
        const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        let generated = "";
        for (let i = 0; i < 8; i++) generated += chars[Math.floor(Math.random() * chars.length)];
        await pool.query(`UPDATE users SET referral_code = $1 WHERE id = $2 AND referral_code IS NULL`, [generated, user.id]);
        const refreshed = await storage.getUserById(user.id);
        code = refreshed?.referralCode || generated;
      }
      const referralCount = await storage.getReferralCount(user.id);
      const tiers = await storage.getReferralTiers();
      const activeTiers = tiers.filter(t => t.active);
      const nextTier = activeTiers.find(t => referralCount < t.threshold);
      referralData = {
        referralCode: code,
        referralCount,
        nextTierName: nextTier?.rewardName,
        nextTierThreshold: nextTier?.threshold,
      };
    } catch (e) {
      console.error("[EmailScheduler] Failed to fetch referral data:", e);
    }

    const emailHtml = markdownToEmailHtml(reorderedSummary, user.email, episodeMeta, emailCopy, referralData);

    const deliveryTime = user.deliveryTime || "07:00";
    const subject = emailCopy.subject;

    await storage.createRecap({
      userId: user.id,
      recapDate: result.dateStr,
      podcasts: result.recappedPodcasts,
      summary: reorderedSummary,
    });

    await storage.createPendingEmail({
      userId: user.id,
      recipientEmail: user.email,
      podcasts: result.recappedPodcasts,
      recapDate: result.dateStr,
      summary: reorderedSummary,
      emailHtml,
      subject,
      scheduledFor: deliveryTime,
      timezone,
      episodeStats: JSON.stringify(result.episodeStats),
      source: force ? "manual" : "scheduled",
      status: "held",
    });

    console.log(`[EmailScheduler] Email generated and held for review - user ${user.id} (${deliveryTime} ${timezone})`);

    try {
      await updateLandingPageRecaps(user.podcasts, result.parsedEpisodes);
    } catch (lpErr) {
      console.warn(`[EmailScheduler] Failed to update landing page recaps:`, lpErr);
    }

    try {
      await sendAdminNotification(user.email, subject);
    } catch (notifyErr) {
      console.warn(`[EmailScheduler] Failed to send admin notification:`, notifyErr);
    }

    return "generated";
  } catch (err) {
    console.error(`[EmailScheduler] Generation failed for user ${user.id}:`, err);
    return "failed";
  }
}

async function processSchedulerTick() {
  let users: any[];
  try {
    users = await storage.getAllUsers();
    schedulerConsecutiveFailures = 0;
  } catch (err: any) {
    schedulerConsecutiveFailures++;
    const backoff = Math.min(
      SCHEDULER_INTERVAL_MS * Math.pow(2, schedulerConsecutiveFailures),
      MAX_SCHEDULER_BACKOFF_MS,
    );
    console.error(
      `[EmailScheduler] Failed to fetch users (failure #${schedulerConsecutiveFailures}, next retry in ${Math.round(backoff / 1000)}s):`,
      err.message,
    );
    return;
  }

  for (const user of users) {
    if (!user.podcasts || user.podcasts.length === 0 || !user.email) continue;
    if (!user.emailVerified) continue;
    if (isUserOnVacation(user)) continue;

    const timezone = user.deliveryTimezone || "America/New_York";
    const deliveryTime = user.deliveryTime || "07:00";
    const { hours, minutes } = getUserLocalTime(timezone);

    if (!isDeliveryTime(deliveryTime, timezone)) continue;

    console.log(`[EmailScheduler] Delivery time match for user ${user.id} (${user.email}): target=${deliveryTime}, current=${hours}:${String(minutes).padStart(2, "0")} in ${timezone}`);

    const cacheKey = `${user.id}_${getUserLocalDate(timezone)}`;
    if (recentlyGenerated.has(cacheKey)) {
      console.log(`[EmailScheduler] Skipping user ${user.id}: already generated this session (cache key: ${cacheKey})`);
      continue;
    }
    recentlyGenerated.add(cacheKey);

    await generateForUser(user, false);
  }

  if (recentlyGenerated.size > 10000) {
    recentlyGenerated.clear();
  }
}

export async function triggerPregeneration() {
  console.log(`[EmailScheduler] Manual trigger: generating for all users...`);

  let users: any[];
  try {
    users = await storage.getAllUsers();
  } catch (err) {
    console.error("[EmailScheduler] Failed to fetch users:", err);
    return;
  }

  let generated = 0, skipped = 0, failed = 0;
  for (const user of users) {
    const result = await generateForUser(user, true);
    if (result === "generated") generated++;
    else if (result === "skipped") skipped++;
    else failed++;
  }

  console.log(`[EmailScheduler] Manual generation complete: ${generated} generated, ${skipped} skipped, ${failed} failed`);

  try {
    const cleaned = await storage.clearOldPendingEmails(7);
    if (cleaned > 0) console.log(`[EmailScheduler] Cleaned up ${cleaned} old pending emails`);
  } catch {}
}

export async function sendHeldEmail(pendingId: number): Promise<void> {
  const pendingList = await storage.getPendingEmails("held");
  const pending = pendingList.find((p: any) => p.id === pendingId);
  if (!pending) {
    throw new Error("Email not found or not in held status");
  }

  if (!recapHasContent(pending.summary)) {
    await storage.updatePendingEmailStatus(pending.id, "error", "No episode content in recap");
    throw new Error("Email has no episode content");
  }

  const podcastNamesFromSummary = (pending.summary.match(/^## (.+)$/gm) || []).map((h: string) => h.replace(/^## /, "").trim());
  const episodeMeta = await buildEpisodeMeta(podcastNamesFromSummary);
  const { parseDigestMarkdown } = await import("./emailTemplate");
  const parsedDigest = parseDigestMarkdown(pending.summary);
  const episodeCount = parsedDigest.episodes.length || 1;
  const emailCopy = await generateEmailSubjectAndPreview(pending.summary, episodeCount);

  if (emailCopy.leadEpisodePodcast) {
    try {
      const leadEp = parsedDigest.episodes.find((ep: any) =>
        ep.podcastName && ep.podcastName.toLowerCase() === emailCopy.leadEpisodePodcast.toLowerCase()
      );
      const leadTitle = leadEp?.episodeTitle || "";
      if (leadTitle) {
        const { rows: storedHeadlines } = await pool.query(
          `SELECT tabloid_headline, tabloid_sub_headline FROM landing_page_recaps
           WHERE LOWER(podcast_name) = LOWER($1) AND LOWER(episode_title) = LOWER($2)
             AND tabloid_headline IS NOT NULL AND tabloid_headline != ''
           LIMIT 1`,
          [emailCopy.leadEpisodePodcast, leadTitle]
        );
        if (storedHeadlines.length > 0 && storedHeadlines[0].tabloid_headline) {
          emailCopy.leadHeadline = storedHeadlines[0].tabloid_headline;
          if (storedHeadlines[0].tabloid_sub_headline) {
            emailCopy.supportingDetail = storedHeadlines[0].tabloid_sub_headline;
          }
        }
      }
    } catch (err) {
      console.warn("[EmailScheduler] sendHeldEmail: Failed to fetch stored tabloid headline:", err);
    }
  }

  const reorderedSummary = reorderMarkdownLeadFirst(pending.summary, emailCopy.leadEpisodePodcast);
  const freshHtml = markdownToEmailHtml(reorderedSummary, pending.recipientEmail, episodeMeta, emailCopy);

  const baseUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "https://podrise.com";
  const htmlWithClickTracking = freshHtml.replace(/href="(https?:\/\/[^"]+)"/g, (_match: string, url: string) => {
    if (url.includes("/api/track/") || url.includes("unsubscribe") || url.includes("mailto:")) return `href="${url}"`;
    return `href="${baseUrl}/api/track/click/${pending.id}?url=${encodeURIComponent(url)}"`;
  });
  const trackingPixel = `<img src="${baseUrl}/api/track/open/${pending.id}" width="1" height="1" style="display:block;width:1px;height:1px;border:0;" alt="" />`;
  const htmlWithTracking = htmlWithClickTracking.replace("</body>", `${trackingPixel}</body>`);

  const { client, fromEmail } = await getUncachableResendClient();
  const freshSubject = emailCopy.subject;
  const sendResult = await client.emails.send({
    from: `PodRise <${fromEmail}>`,
    to: pending.recipientEmail,
    subject: freshSubject,
    html: htmlWithTracking,
  });

  if (sendResult.error) {
    await storage.updatePendingEmailStatus(pending.id, "error", sendResult.error.message || "Send failed");
    throw new Error(sendResult.error.message || "Send failed");
  }

  console.log(`[EmailScheduler] Held email ${pending.id} sent to ${pending.recipientEmail}, id: ${sendResult.data?.id}`);
  await storage.updatePendingEmailHtml(pending.id, freshHtml);
  await storage.updatePendingEmailStatus(pending.id, "sent");

  await storage.logEmail({
    userId: pending.userId,
    recipientEmail: pending.recipientEmail,
    podcasts: pending.podcasts,
    source: pending.source || "scheduled",
    emailHtml: freshHtml,
  });
}

function slugifyEpisodeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-")
    .slice(0, 8)
    .join("-");
}

function normalizeTitleForMatch(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/^\d+[\.\)\-:\s]+\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[''""]/g, "'")
    .trim();
}

let landingPageRefreshRanToday = "";

let landingRecapRunning = false;
let landingRecapProgress = {
  status: "idle" as "idle" | "running" | "completed" | "error",
  currentPodcast: "",
  podcastsProcessed: 0,
  podcastsTotal: 0,
  recapsCreated: 0,
  recapsSkipped: 0,
  errors: 0,
  startedAt: null as string | null,
  completedAt: null as string | null,
};

export function getLandingRecapProgress() {
  return { ...landingRecapProgress };
}

export async function refreshLandingPageRecaps(force: boolean = false, dateRange?: { from: string; to: string }) {
  const todayKey = new Date().toISOString().split("T")[0];
  if (!force && landingPageRefreshRanToday === todayKey) return;

  if (landingRecapRunning) {
    console.log("[LandingRecaps] Already running, skipping");
    return;
  }

  landingRecapRunning = true;
  landingRecapProgress = {
    status: "running",
    currentPodcast: "",
    podcastsProcessed: 0,
    podcastsTotal: 0,
    recapsCreated: 0,
    recapsSkipped: 0,
    errors: 0,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  console.log(`[LandingRecaps] Starting daily landing page recap refresh...`);

  let landingPodcasts: any[];
  try {
    const allDir = await storage.getPodcastDirectory();
    landingPodcasts = allDir.filter((p: any) => p.hasLandingPage && p.itunesId && p.slug);
  } catch (err) {
    console.error("[LandingRecaps] Failed to fetch podcast directory:", err);
    landingRecapProgress.status = "error";
    landingRecapRunning = false;
    return;
  }

  landingRecapProgress.podcastsTotal = landingPodcasts.length;
  console.log(`[LandingRecaps] Processing ${landingPodcasts.length} landing page podcasts...`);
  let newRecaps = 0;
  let skipped = 0;
  let errors = 0;

  for (const podcast of landingPodcasts) {
    if (activeEpGenItunesIds.has(podcast.itunesId)) {
      skipped++;
      continue;
    }
    landingRecapProgress.currentPodcast = podcast.name;
    try {
      const lookupUrl = `https://itunes.apple.com/lookup?id=${podcast.itunesId}&media=podcast&entity=podcastEpisode&limit=10&sort=recent`;
      const lookupRes = await fetch(lookupUrl);
      const lookupJson = await lookupRes.json();
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const episodes = (lookupJson.results || []).filter((r: any) => {
        if (r.wrapperType !== "podcastEpisode") return false;
        if (!dateRange) {
          const releaseDate = r.releaseDate ? new Date(r.releaseDate) : null;
          if (!releaseDate || releaseDate < threeDaysAgo) return false;
        }
        return true;
      });

      if (episodes.length === 0) {
        skipped++;
        continue;
      }

      let podcastNewRecaps = 0;
      for (const ep of episodes) {
        const epTitle = ep.trackName || "Untitled";
        const epSlug = slugifyEpisodeTitle(epTitle);

        const existingRecap = await storage.getLandingPageRecapBySlug(podcast.slug, epSlug);
        if (existingRecap) {
          skipped++;
          continue;
        }

        const episodeGuid = ep.episodeGuid || `${podcast.itunesId}_${ep.trackId || epTitle}`;
        let transcriptText: string | null = null;

        const cached = await storage.getTranscriptByEpisodeGuid(episodeGuid);
        if (cached) {
          transcriptText = cached.transcript;
        } else {
          const { pool: dbPool } = await import("./db");
          const client = await dbPool.connect();
          try {
            const titleMatch = await client.query(
              `SELECT transcript FROM episode_transcripts WHERE podcast_id = $1 AND ${SQL_NORMALIZE_TITLE('episode_title')} = ${SQL_NORMALIZE_TITLE('$2')} LIMIT 1`,
              [podcast.itunesId, epTitle]
            );
            if (titleMatch.rows.length > 0) {
              transcriptText = titleMatch.rows[0].transcript;
            }
          } finally {
            client.release();
          }
        }

        if (!transcriptText) {
          try {
            const taddyPodcast = await searchPodcastByItunesId(podcast.itunesId, podcast.name, podcast.taddyUuid);
            if (taddyPodcast?.uuid) {
              if (!podcast.taddyUuid) {
                storage.updatePodcastTaddyUuid(podcast.itunesId, taddyPodcast.uuid).catch(() => {});
              }
              const taddyEpisodes = await getRecentEpisodesWithTranscripts(taddyPodcast.uuid, 25);
              const itunesNorm = normalizeTitleForMatch(epTitle);
              const taddyMatch = taddyEpisodes.find((te: any) => {
                if (!te.name) return false;
                const taddyNorm = normalizeTitleForMatch(te.name);
                return taddyNorm === itunesNorm || taddyNorm.includes(itunesNorm) || itunesNorm.includes(taddyNorm);
              });
              if (taddyMatch?.uuid) {
                const rawSegments = await getEpisodeTranscriptSegments(taddyMatch.uuid);
                if (rawSegments && rawSegments.length > 0) {
                  const lines: string[] = [];
                  for (const seg of rawSegments) {
                    const speaker = seg.speaker ? `[${seg.speaker}] ` : "";
                    lines.push(`${speaker}${seg.text}`);
                  }
                  transcriptText = lines.join("\n");
                  await storage.saveTranscript({
                    podcastId: podcast.itunesId,
                    episodeGuid,
                    episodeTitle: epTitle,
                    transcript: transcriptText,
                  });
                }
              }
            }
          } catch (taddyErr) {
            console.warn(`[LandingRecaps] Taddy lookup failed for ${podcast.name}:`, taddyErr);
          }
        }

        if (!transcriptText) {
          skipped++;
          continue;
        }

        const recap = await generateRecapFromTranscript(transcriptText, podcast.name, epTitle);
        if (!recap) {
          errors++;
          continue;
        }

        const durationMs = ep.trackTimeMillis || 0;
        const durationMin = Math.round(durationMs / 60000);
        const durationStr = durationMin >= 60
          ? `${Math.floor(durationMin / 60)} hr ${durationMin % 60} min`
          : `${durationMin} min`;
        const releaseDate = ep.releaseDate
          ? new Date(ep.releaseDate).toISOString().split("T")[0]
          : todayKey;

        if (dateRange && (releaseDate < dateRange.from || releaseDate > dateRange.to)) {
          skipped++;
          continue;
        }

        const appleEpisodeUrl = ep.trackViewUrl
          ? ep.trackViewUrl.replace(/&uo=\d+/, "")
          : null;

        let showNotes: string | null = null;
        try {
          const { searchEpisodeShowNotes } = await import("./taddyClient");
          showNotes = await searchEpisodeShowNotes(podcast.name, recap.episodeTitle);
        } catch {}
        if (!showNotes && recap.whatHappened) {
          showNotes = recap.whatHappened;
        }

        const { searchSpotifyEpisode } = await import("./spotifyClient");
        const spotifyEpisodeUrl = await searchSpotifyEpisode(podcast.name, recap.episodeTitle) || "";
        const savedRecap = await storage.upsertLandingPageRecap({
          slug: podcast.slug,
          itunesId: podcast.itunesId,
          podcastName: podcast.name,
          episodeTitle: recap.episodeTitle,
          episodeSlug: epSlug,
          publishDate: releaseDate,
          duration: durationStr,
          artworkUrl: (podcast.artworkUrl || ep.artworkUrl600 || "").replace(/\d+x\d+bb/, "1200x1200bb") || null,
          hosts: podcast.hosts || null,
          tldl: "",
          whatHappened: recap.whatHappened,
          keyInsights: recap.keyInsights,
          quote: "",
          quoteAttribution: "",
          appleEpisodeUrl: appleEpisodeUrl,
          spotifyEpisodeUrl,
          audioUrl: ep.episodeUrl || null,
          keyTopics: [],
          topicContexts: null,
          topQuestions: null,
          guests: recap.guests ? JSON.stringify(recap.guests) : "[]",
          sponsors: "[]",
          resources: recap.resources ? JSON.stringify(recap.resources) : "[]",
          showNotes,
        });

        if (podcastNewRecaps === 0) {
          await storage.upsertExampleRecap({
            slug: podcast.slug,
            podcastName: podcast.name,
            itunesId: podcast.itunesId,
            episodeTitle: recap.episodeTitle,
            episodeDate: releaseDate,
            episodeDuration: durationStr,
            tldl: "",
            whatHappened: recap.whatHappened,
            keyInsights: recap.keyInsights,
            quote: "",
            quoteAttribution: "",
          });
        }

        podcastNewRecaps++;
        newRecaps++;
        landingRecapProgress.recapsCreated = newRecaps;
        console.log(`[LandingRecaps] Generated recap for ${podcast.name} - "${epTitle}"`);

        if (savedRecap?.id) {
          try {
            const { validateAndEnrichRecap } = await import("./recapValidator");
            await validateAndEnrichRecap(
              savedRecap.id, podcast.slug, epSlug, podcast.name,
              recap.episodeTitle, podcast.itunesId, transcriptText, podcast.hosts || null
            );
          } catch (valErr) {
            console.warn(`[LandingRecaps] Validation failed for "${epTitle}":`, valErr);
          }
        }
      }
    } catch (err) {
      console.error(`[LandingRecaps] Error processing ${podcast.name}:`, err);
      errors++;
      landingRecapProgress.errors = errors;
    }
    landingRecapProgress.podcastsProcessed++;
    landingRecapProgress.recapsSkipped = skipped;
  }

  landingPageRefreshRanToday = todayKey;
  landingRecapProgress.status = "completed";
  landingRecapProgress.completedAt = new Date().toISOString();
  landingRecapProgress.currentPodcast = "";
  landingRecapRunning = false;
  console.log(`[LandingRecaps] Complete: ${newRecaps} new recaps, ${skipped} skipped, ${errors} errors`);
}

export async function backfillTopicsAndQuestions() {
  const { pool: dbPool } = await import("./db");
  const { generateRecapFromTranscript } = await import("./recapGenerator");
  const client = await dbPool.connect();
  try {
    const { rows: recaps } = await client.query(
      `SELECT id, slug, episode_slug, podcast_name, episode_title FROM landing_page_recaps WHERE key_topics IS NULL ORDER BY id`
    );
    console.log(`[BackfillTopics] Found ${recaps.length} recaps missing key topics`);

    let updated = 0;
    let errors = 0;
    for (const recap of recaps) {
      try {
        const segments = await storage.getTranscriptSegmentsBySlug(recap.slug, recap.episode_slug);
        if (!segments || segments.length === 0) {
          continue;
        }

        const transcriptText = segments.map(s => s.text).join(" ");
        const result = await generateRecapFromTranscript(transcriptText, recap.podcast_name, recap.episode_title);
        if (!result || !result.keyTopics?.length) {
          continue;
        }

        await client.query(
          `UPDATE landing_page_recaps SET key_topics = $1 WHERE id = $2`,
          [result.keyTopics, recap.id]
        );
        updated++;
        console.log(`[BackfillTopics] Updated ${recap.podcast_name} - "${recap.episode_title}" (${updated}/${recaps.length})`);
      } catch (err) {
        errors++;
        console.warn(`[BackfillTopics] Error processing recap ${recap.id}:`, err);
      }
    }
    console.log(`[BackfillTopics] Complete: ${updated} updated, ${errors} errors, ${recaps.length - updated - errors} skipped`);
  } finally {
    client.release();
  }
}

let quoteBackfillRunning = false;
let quoteBackfillProgress = { status: "idle", processed: 0, total: 0, generated: 0, errors: 0 };

export function getQuoteBackfillProgress() {
  return quoteBackfillProgress;
}

export async function backfillEpisodeQuotes() {
  if (quoteBackfillRunning) {
    console.log("[QuoteBackfill] Already running, skipping");
    return;
  }
  quoteBackfillRunning = true;
  quoteBackfillProgress = { status: "running", processed: 0, total: 0, generated: 0, errors: 0 };

  const { pool: dbPool } = await import("./db");
  const { extractQuotesFromTranscript } = await import("./recapGenerator");
  const client = await dbPool.connect();
  try {
    const { rows: recapsWithoutQuotes } = await client.query(
      `SELECT lpr.id, lpr.slug, lpr.episode_slug, lpr.podcast_name, lpr.episode_title, lpr.hosts, lpr.guests
       FROM landing_page_recaps lpr
       LEFT JOIN episode_quotes eq ON eq.podcast_slug = lpr.slug AND eq.episode_slug = lpr.episode_slug
       WHERE eq.id IS NULL
       ORDER BY lpr.created_at DESC`
    );

    quoteBackfillProgress.total = recapsWithoutQuotes.length;
    console.log(`[QuoteBackfill] Found ${recapsWithoutQuotes.length} episodes without quotes`);

    for (const recap of recapsWithoutQuotes) {
      quoteBackfillProgress.processed++;
      try {
        const { rows: transcriptRows } = await client.query(
          `SELECT et.transcript FROM episode_transcripts et
           JOIN podcast_directory pd ON pd.itunes_id::text = et.podcast_id
           WHERE pd.slug = $1 AND et.episode_title ILIKE $2
           LIMIT 1`,
          [recap.slug, recap.episode_title]
        );

        if (transcriptRows.length === 0) continue;

        const transcriptText = transcriptRows[0].transcript;
        if (!transcriptText) continue;

        const extractedQuotes = await extractQuotesFromTranscript(
          transcriptText,
          recap.podcast_name,
          recap.episode_title,
          recap.hosts || null,
          recap.guests || null,
        );

        if (extractedQuotes.length > 0) {
          const quotesToSave = extractedQuotes.map((q: any) => ({
            podcastSlug: recap.slug,
            episodeSlug: recap.episode_slug,
            speakerName: q.speakerName,
            speakerRole: q.speakerRole || null,
            quoteText: q.quoteText,
            context: q.context,
            quoteType: q.quoteType,
          }));
          await storage.saveEpisodeQuotes(quotesToSave);
          quoteBackfillProgress.generated++;
          console.log(`[QuoteBackfill] Generated ${extractedQuotes.length} quotes for ${recap.podcast_name} - "${recap.episode_title}" (${quoteBackfillProgress.processed}/${quoteBackfillProgress.total})`);
        }
      } catch (err) {
        quoteBackfillProgress.errors++;
        console.warn(`[QuoteBackfill] Error for ${recap.podcast_name} - "${recap.episode_title}":`, err);
      }
    }

    console.log(`[QuoteBackfill] Complete: ${quoteBackfillProgress.generated} episodes got quotes, ${quoteBackfillProgress.errors} errors, ${quoteBackfillProgress.total} total`);
  } finally {
    client.release();
    quoteBackfillRunning = false;
    quoteBackfillProgress.status = "completed";
  }
}

export async function generateTabloidHeadline(episodeTitle: string, podcastName: string, tldl: string, whatHappened: string, keyInsights: string[]): Promise<{ tabloidHeadline: string; tabloidSubHeadline: string } | null> {
  try {
    const { openai } = await import("./replit_integrations/image/client");

    const insightsText = (keyInsights || []).slice(0, 5).join("\n- ");
    const contentSummary = `Podcast: ${podcastName}\nEpisode: ${episodeTitle}\n\nTL;DL: ${tldl}\n\nWhat Happened:\n${whatHappened?.slice(0, 1500) || ""}\n\nKey Insights:\n- ${insightsText}`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You write tabloid-style headlines for a podcast recap service. Given the episode summary below, write ONE headline and ONE sub-headline.

THE SINGLE TEST: Would a tabloid editor print this on a front page? If it sounds like a university press release, a LinkedIn post, or a podcast description, rewrite it until it doesn't.

HEADLINE RULES:
- Under 8 words. Active language only.
- NEVER use: reveals, discusses, explores, examines, features, showcases, delves, unpacks, deep dive, candid discussion, reshaping, narratives.
- Must be personal, specific, and make the reader feel like they are about to miss something.
- Written like a New York Post front page. NO full stop at the end.
- BAD: "Expert reveals secrets to better health"
- GOOD: "The food critic who saved his own life"

SUB-HEADLINE RULES:
- 1-2 sentences. Must contain exactly one specific surprising detail — a number, a direct comparison, or a claim that sounds almost too bold to be true.
- Must leave the most interesting part unsaid so the reader wants to learn more.
- BAD: "A comprehensive discussion about health and wellness strategies"
- GOOD: "He eliminated sugar and white flour to reclaim his health — and he now spends 25 minutes savoring just one raisin"

Episode content:
${contentSummary.slice(0, 3000)}

Respond with JSON: { "tabloidHeadline": "...", "tabloidSubHeadline": "..." }`
      }],
      max_tokens: 200,
      temperature: 0.9,
      response_format: { type: "json_object" },
    });

    const { logCompletionUsage } = await import("./apiUsageTracker");
    logCompletionUsage(resp, "gpt-4o-mini", "tabloid_headline");

    const content = resp.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      let headline = String(parsed.tabloidHeadline || "").trim().replace(/\.$/, "");
      const subHeadline = String(parsed.tabloidSubHeadline || "").trim();
      if (headline && subHeadline) {
        const wordCount = headline.split(/\s+/).length;
        if (wordCount > 10) {
          headline = headline.split(/\s+/).slice(0, 8).join(" ");
        }
        return { tabloidHeadline: headline, tabloidSubHeadline: subHeadline };
      }
    }
  } catch (err) {
    console.warn("[TabloidHeadline] AI generation failed:", err);
  }
  return null;
}

let tabloidBackfillRunning = false;
let tabloidBackfillProgress = { status: "idle", processed: 0, total: 0, generated: 0, errors: 0 };

export function getTabloidBackfillProgress() {
  return tabloidBackfillProgress;
}

export async function backfillTabloidHeadlines(sinceDate?: string) {
  if (tabloidBackfillRunning) {
    console.log("[TabloidBackfill] Already running, skipping");
    return;
  }
  tabloidBackfillRunning = true;
  tabloidBackfillProgress = { status: "running", processed: 0, total: 0, generated: 0, errors: 0 };

  const { pool: dbPool } = await import("./db");
  const client = await dbPool.connect();
  try {
    const dateFilter = sinceDate ? ` AND publish_date >= '${sinceDate}'` : '';
    const { rows: recapsWithout } = await client.query(
      `SELECT id, episode_title, podcast_name, tldl, what_happened, key_insights
       FROM landing_page_recaps
       WHERE (tabloid_headline IS NULL OR tabloid_headline = '')${dateFilter}
       ORDER BY created_at DESC`
    );

    tabloidBackfillProgress.total = recapsWithout.length;
    console.log(`[TabloidBackfill] Found ${recapsWithout.length} episodes without tabloid headlines`);

    for (const recap of recapsWithout) {
      tabloidBackfillProgress.processed++;
      try {
        let keyInsights: string[] = [];
        try {
          if (typeof recap.key_insights === "string") {
            keyInsights = JSON.parse(recap.key_insights);
          } else if (Array.isArray(recap.key_insights)) {
            keyInsights = recap.key_insights;
          }
        } catch {}

        const result = await generateTabloidHeadline(
          recap.episode_title,
          recap.podcast_name,
          recap.tldl,
          recap.what_happened,
          keyInsights
        );

        if (result) {
          await client.query(
            `UPDATE landing_page_recaps SET tabloid_headline = $1, tabloid_sub_headline = $2 WHERE id = $3`,
            [result.tabloidHeadline, result.tabloidSubHeadline, recap.id]
          );
          tabloidBackfillProgress.generated++;
          console.log(`[TabloidBackfill] Generated for "${recap.episode_title?.slice(0, 50)}" (${tabloidBackfillProgress.processed}/${tabloidBackfillProgress.total})`);
        }

        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err) {
        tabloidBackfillProgress.errors++;
        console.warn(`[TabloidBackfill] Error for "${recap.episode_title?.slice(0, 50)}":`, err);
      }
    }

    console.log(`[TabloidBackfill] Complete: ${tabloidBackfillProgress.generated} generated, ${tabloidBackfillProgress.errors} errors, ${tabloidBackfillProgress.total} total`);
  } finally {
    client.release();
    tabloidBackfillRunning = false;
    tabloidBackfillProgress.status = "completed";
  }
}

let transcriptDownloadRunning = false;

export async function bulkDownloadTranscripts() {
  if (transcriptDownloadRunning) {
    console.log("[TranscriptDL] Already running, skipping");
    return;
  }
  transcriptDownloadRunning = true;

  try {
    const { pool: dbPool } = await import("./db");
    const taddyUserId = process.env.TADDY_USER_ID;
    const taddyApiKey = process.env.TADDY_API_KEY;
    if (!taddyUserId || !taddyApiKey) {
      console.log("[TranscriptDL] Taddy credentials not configured, skipping");
      return;
    }

    const allDir = await storage.getPodcastDirectory();
    const landingPodcasts = allDir.filter((p: any) => p.hasLandingPage && p.itunesId && p.slug);

    const client = await dbPool.connect();
    let recapCounts: Record<string, number> = {};
    let existingGuids: Set<string> = new Set();
    try {
      const { rows } = await client.query("SELECT slug, COUNT(*)::int as cnt FROM landing_page_recaps GROUP BY slug");
      for (const r of rows) recapCounts[r.slug] = r.cnt;
      const { rows: tRows } = await client.query("SELECT episode_guid FROM episode_transcripts");
      for (const r of tRows) existingGuids.add(r.episode_guid);
    } finally {
      client.release();
    }

    const TARGET = 25;
    const podcastsNeedingWork = landingPodcasts
      .filter((p: any) => (recapCounts[p.slug] || 0) < TARGET)
      .sort((a: any, b: any) => (recapCounts[a.slug] || 0) - (recapCounts[b.slug] || 0));

    const DL_BATCH_SIZE = 20;
    console.log(`[TranscriptDL] Starting transcript download for ${podcastsNeedingWork.length} podcasts (${existingGuids.size} transcripts already stored, batches of ${DL_BATCH_SIZE})`);

    let totalDownloaded = 0;
    let totalSkipped = 0;
    let podcastIndex = 0;

    for (const podcast of podcastsNeedingWork) {
      podcastIndex++;
      try {
        const numId = parseInt(podcast.itunesId, 10);
        if (isNaN(numId)) continue;

        const existing = recapCounts[podcast.slug] || 0;
        const needed = TARGET - existing;
        const epLimit = Math.min(needed + 5, 25);

        let series: any = null;

        if (podcast.taddyUuid) {
          const uuidRes = await fetch("https://api.taddy.org", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-USER-ID": taddyUserId, "X-API-KEY": taddyApiKey },
            body: JSON.stringify({ query: `{ getPodcastSeries(uuid: "${podcast.taddyUuid}") { uuid name episodes(sortOrder: LATEST, limitPerPage: ${epLimit}) { uuid name taddyTranscribeStatus } } }` }),
            signal: AbortSignal.timeout(20000),
          });
          const uuidData = await uuidRes.json();
          series = uuidData?.data?.getPodcastSeries;
        } else {
          const taddyRes = await fetch("https://api.taddy.org", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-USER-ID": taddyUserId, "X-API-KEY": taddyApiKey },
            body: JSON.stringify({ query: `{ getPodcastSeries(itunesId: ${numId}) { uuid name episodes(sortOrder: LATEST, limitPerPage: ${epLimit}) { uuid name taddyTranscribeStatus } } }` }),
            signal: AbortSignal.timeout(20000),
          });
          const taddyData = await taddyRes.json();
          series = taddyData?.data?.getPodcastSeries;

          if (!series) {
            console.log(`[TranscriptDL] iTunes ID ${numId} not found on Taddy, skipping "${podcast.name}"`);
          }

          if (series?.uuid) {
            storage.updatePodcastTaddyUuid(podcast.itunesId, series.uuid).catch(() => {});
          }
        }

        if (series?.uuid && (!series.episodes || series.episodes.length === 0)) {
          await new Promise(r => setTimeout(r, 1000));
          const retryRes = await fetch("https://api.taddy.org", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-USER-ID": taddyUserId, "X-API-KEY": taddyApiKey },
            body: JSON.stringify({ query: `{ getPodcastSeries(uuid: "${series.uuid}") { uuid name episodes(sortOrder: LATEST, limitPerPage: ${epLimit}) { uuid name taddyTranscribeStatus } } }` }),
            signal: AbortSignal.timeout(20000),
          });
          const retryData = await retryRes.json();
          const retry = retryData?.data?.getPodcastSeries;
          if (retry?.episodes?.length > 0) series = retry;
        }

        if (!series?.episodes?.length) {
          totalSkipped++;
          await new Promise(r => setTimeout(r, 300));
          continue;
        }

        let downloaded = 0;
        for (const ep of series.episodes) {
          if (downloaded >= needed) break;
          if (existingGuids.has(ep.uuid)) continue;
          if (ep.taddyTranscribeStatus !== "COMPLETED") continue;

          try {
            const transcriptData = await fetch("https://api.taddy.org", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-USER-ID": taddyUserId, "X-API-KEY": taddyApiKey },
              body: JSON.stringify({ query: `{ getEpisodeTranscript(uuid: "${ep.uuid}") { text speaker } }` }),
              signal: AbortSignal.timeout(30000),
            });
            const tData = await transcriptData.json();
            const segments = tData?.data?.getEpisodeTranscript;
            if (segments && Array.isArray(segments) && segments.length > 0) {
              const text = segments.map((s: any) => (s.speaker ? `[${s.speaker}] ` : "") + s.text).join("\n");
              if (text.length > 100) {
                await storage.saveTranscript({
                  podcastId: podcast.itunesId,
                  episodeGuid: ep.uuid,
                  episodeTitle: ep.name || "Untitled",
                  transcript: text,
                });
                existingGuids.add(ep.uuid);
                downloaded++;
                totalDownloaded++;
              }
            }
          } catch {}
          await new Promise(r => setTimeout(r, 300));
        }

        if (downloaded > 0) {
          console.log(`[TranscriptDL] ${podcast.name}: downloaded ${downloaded} transcripts (total: ${totalDownloaded})`);
        }
      } catch (err: any) {
        if (err?.name !== "AbortError" && err?.name !== "TimeoutError") {
          console.warn(`[TranscriptDL] Error for ${podcast.name}:`, err?.message?.slice(0, 100));
        }
      }
      await new Promise(r => setTimeout(r, 500));

      if (podcastIndex % DL_BATCH_SIZE === 0 && podcastIndex < podcastsNeedingWork.length) {
        console.log(`[TranscriptDL] Batch pause after ${podcastIndex}/${podcastsNeedingWork.length} podcasts (${totalDownloaded} downloaded so far). Waiting 5s...`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    console.log(`[TranscriptDL] Complete: ${totalDownloaded} new transcripts downloaded, ${totalSkipped} podcasts not on Taddy`);
  } catch (err) {
    console.error("[TranscriptDL] Fatal error:", err);
  } finally {
    transcriptDownloadRunning = false;
  }
}

let dailyTranscriptRefreshRunning = false;

export async function refreshNewTranscripts() {
  if (dailyTranscriptRefreshRunning) {
    console.log("[DailyTranscripts] Already running, skipping");
    return;
  }
  dailyTranscriptRefreshRunning = true;

  try {
    const { pool: dbPool } = await import("./db");
    const taddyUserId = process.env.TADDY_USER_ID;
    const taddyApiKey = process.env.TADDY_API_KEY;
    if (!taddyUserId || !taddyApiKey) {
      console.log("[DailyTranscripts] Taddy credentials not configured, skipping");
      return;
    }

    const allDir = await storage.getPodcastDirectory();
    const landingPodcasts = allDir.filter((p: any) => p.hasLandingPage && p.taddyUuid && p.itunesId);

    const client = await dbPool.connect();
    let existingGuids: Set<string>;
    try {
      const { rows } = await client.query("SELECT episode_guid FROM episode_transcripts");
      existingGuids = new Set(rows.map((r: any) => r.episode_guid));
    } finally {
      client.release();
    }

    console.log(`[DailyTranscripts] Checking ${landingPodcasts.length} podcasts for new episodes (${existingGuids.size} transcripts already stored)`);

    let totalDownloaded = 0;
    let totalChecked = 0;
    const BATCH_SIZE = 20;

    for (const podcast of landingPodcasts) {
      totalChecked++;
      try {
        const seriesRes = await fetch("https://api.taddy.org", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-USER-ID": taddyUserId, "X-API-KEY": taddyApiKey },
          body: JSON.stringify({ query: `{ getPodcastSeries(uuid: "${podcast.taddyUuid}") { uuid episodes(sortOrder: LATEST, limitPerPage: 10) { uuid name description datePublished duration audioUrl imageUrl seasonNumber episodeNumber episodeType subtitle } } }` }),
          signal: AbortSignal.timeout(20000),
        });
        if (seriesRes.status === 429) {
          console.log("[DailyTranscripts] Rate limited, pausing 30s...");
          await new Promise(r => setTimeout(r, 30000));
          continue;
        }
        const seriesData = await seriesRes.json();
        const episodes = seriesData?.data?.getPodcastSeries?.episodes;
        if (!episodes || !Array.isArray(episodes) || episodes.length === 0) {
          await new Promise(r => setTimeout(r, 300));
          continue;
        }

        let downloaded = 0;
        for (const ep of episodes) {
          if (existingGuids.has(ep.uuid)) continue;

          try {
            const tRes = await fetch("https://api.taddy.org", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-USER-ID": taddyUserId, "X-API-KEY": taddyApiKey },
              body: JSON.stringify({ query: `{ getEpisodeTranscript(uuid: "${ep.uuid}") { text speaker } }` }),
              signal: AbortSignal.timeout(30000),
            });
            if (tRes.status === 429) {
              console.log("[DailyTranscripts] Rate limited on transcript, pausing 30s...");
              await new Promise(r => setTimeout(r, 30000));
              continue;
            }
            const tData = await tRes.json();
            const segments = tData?.data?.getEpisodeTranscript;
            if (segments && Array.isArray(segments) && segments.length > 0) {
              const text = segments.map((s: any) => (s.speaker ? `[${s.speaker}] ` : "") + s.text).join("\n");
              if (text.length > 100) {
                await storage.saveTranscript({
                  podcastId: podcast.itunesId,
                  episodeGuid: ep.uuid,
                  episodeTitle: ep.name || "Untitled",
                  transcript: text,
                  description: ep.description || undefined,
                  subtitle: ep.subtitle || undefined,
                  datePublished: ep.datePublished || undefined,
                  duration: ep.duration || undefined,
                  audioUrl: ep.audioUrl || undefined,
                  imageUrl: ep.imageUrl || undefined,
                  seasonNumber: ep.seasonNumber || undefined,
                  episodeNumber: ep.episodeNumber || undefined,
                  episodeType: ep.episodeType || undefined,
                });
                existingGuids.add(ep.uuid);
                downloaded++;
                totalDownloaded++;
              }
            }
          } catch {}
          await new Promise(r => setTimeout(r, 400));
        }

        if (downloaded > 0) {
          console.log(`[DailyTranscripts] ${podcast.name}: ${downloaded} new transcript(s)`);
        }
      } catch (err: any) {
        if (err?.name !== "AbortError" && err?.name !== "TimeoutError") {
          console.warn(`[DailyTranscripts] Error for ${podcast.name}:`, err?.message?.slice(0, 100));
        }
      }
      await new Promise(r => setTimeout(r, 400));

      if (totalChecked % BATCH_SIZE === 0 && totalChecked < landingPodcasts.length) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    console.log(`[DailyTranscripts] Complete: ${totalDownloaded} new transcripts across ${landingPodcasts.length} podcasts`);
  } catch (err) {
    console.error("[DailyTranscripts] Fatal error:", err);
  } finally {
    dailyTranscriptRefreshRunning = false;
  }
}

export async function enrichPodcastMetadata(singleItunesId?: string) {
  const { openai } = await import("./replit_integrations/image/client");
  const { pool: dbPool } = await import("./db");

  let podcasts: any[];
  if (singleItunesId) {
    const entry = await storage.getPodcastDirectoryEntry(singleItunesId);
    if (!entry) {
      console.warn(`[Enrich] No directory entry for iTunes ID ${singleItunesId}`);
      return { enriched: 0, errors: 0 };
    }
    podcasts = [entry];
  } else {
    const allDir = await storage.getPodcastDirectory();
    const currentYear = new Date().getFullYear();
    podcasts = allDir.filter((p: any) => p.hasLandingPage && (!p.aboutPodcast || !p.knownFor || !p.hostBios || !p.yearStarted || p.yearStarted >= currentYear));
  }

  console.log(`[Enrich] Enriching metadata for ${podcasts.length} podcasts...`);
  let enriched = 0;
  let errors = 0;

  for (const podcast of podcasts) {
    try {
      let itunesData: any = null;
      try {
        const lookupRes = await fetch(`https://itunes.apple.com/lookup?id=${podcast.itunesId}&media=podcast`);
        const lookupJson = await lookupRes.json();
        itunesData = lookupJson.results?.[0];
      } catch {}

      let episodeSummaries = "";
      try {
        const client = await dbPool.connect();
        try {
          const { rows } = await client.query(
            `SELECT episode_title, tldl FROM landing_page_recaps WHERE slug = $1 ORDER BY publish_date DESC LIMIT 10`,
            [podcast.slug]
          );
          if (rows.length > 0) {
            episodeSummaries = rows.map((r: any) => `- "${r.episode_title}": ${r.tldl}`).join("\n");
          }
        } finally {
          client.release();
        }
      } catch {}

      const itunesDescription = itunesData?.description || itunesData?.collectionName || "";
      const itunesTrackCount = itunesData?.trackCount;
      const itunesGenre = itunesData?.primaryGenreName || "";
      const releaseDate = itunesData?.releaseDate;
      const artworkUrl = (itunesData?.artworkUrl600 || itunesData?.artworkUrl100 || podcast.artworkUrl || "").replace(/\d+x\d+bb/, "1200x1200bb");

      const prompt = `You are generating metadata for a podcast page on PodRise.com. Be factual and concise.

Podcast: "${podcast.name}"
${podcast.hosts ? `Known hosts: ${podcast.hosts}` : ""}
${itunesDescription ? `iTunes description: ${itunesDescription}` : ""}
${itunesGenre ? `Genre: ${itunesGenre}` : ""}
${episodeSummaries ? `Recent episode summaries:\n${episodeSummaries}` : ""}

Generate the following as a JSON object:
{
  "aboutPodcast": "A 2-3 sentence description of this podcast - what it covers, who hosts it, and who it's for. Write in third person, factual tone.",
  "knownFor": ["4-6 short phrases this podcast is known for, like 'Long-form tech founder interviews' or 'Deep dives into AI research'. Be specific to this show."],
  "hostBios": [{"name": "Host Name", "bio": "1-2 sentence bio of this host. Include their role/background."}],
  "frequency": "Weekly|Twice weekly|Daily|Biweekly|Monthly",
  "category": "One of: Technology, Business, Society & Culture, Comedy, News, Science, Education, Health & Fitness, Sports, True Crime, Arts",
  "avgEpisodeLength": estimated average episode length in minutes as an integer,
  "yearStarted": the year this podcast first launched/premiered as an integer (e.g. 2017)
}

RULES:
- Only include hosts you are confident about. If unsure of hosts, use the podcast name context.
- hostBios must be an array of objects with "name" and "bio" keys.
- frequency should be your best estimate based on the podcast.
- avgEpisodeLength should be an integer (minutes).
- Be factual - don't invent details you don't know.
- Respond ONLY with valid JSON, no markdown.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
        temperature: 0.3,
        response_format: { type: "json_object" },
      });
      const { logCompletionUsage: logEnrich } = await import("./apiUsageTracker");
      logEnrich(completion, "gpt-4o", "podcast_metadata_enrichment");

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        errors++;
        continue;
      }

      const parsed = JSON.parse(content.trim());

      const updateData: any = {
        itunesId: podcast.itunesId,
        slug: podcast.slug,
        name: podcast.name,
        hasLandingPage: true,
      };

      if (!podcast.aboutPodcast && parsed.aboutPodcast) updateData.aboutPodcast = parsed.aboutPodcast;
      if (!podcast.knownFor && Array.isArray(parsed.knownFor)) updateData.knownFor = parsed.knownFor;
      if (!podcast.hostBios && Array.isArray(parsed.hostBios)) updateData.hostBios = parsed.hostBios;
      if (!podcast.frequency && parsed.frequency) updateData.frequency = parsed.frequency;
      if (!podcast.category && parsed.category) updateData.category = parsed.category;
      if (!podcast.avgEpisodeLength && parsed.avgEpisodeLength) updateData.avgEpisodeLength = parseInt(parsed.avgEpisodeLength);
      if (!podcast.description && itunesDescription) updateData.description = itunesDescription;
      if (!podcast.artworkUrl && artworkUrl) updateData.artworkUrl = artworkUrl;
      if (!podcast.totalEpisodes && itunesTrackCount) updateData.totalEpisodes = itunesTrackCount;
      if (parsed.yearStarted) {
        const yr = parseInt(parsed.yearStarted);
        const curYear = new Date().getFullYear();
        if (yr > 2000 && yr < curYear && (!podcast.yearStarted || podcast.yearStarted >= curYear)) {
          updateData.yearStarted = yr;
        }
      }
      if (!podcast.hosts && parsed.hostBios?.length > 0) {
        updateData.hosts = parsed.hostBios.map((h: any) => h.name).join(" & ");
      }

      await storage.upsertPodcastDirectoryEntry(updateData);
      enriched++;
      console.log(`[Enrich] ✓ ${podcast.name}`);

      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      errors++;
      console.error(`[Enrich] Failed for ${podcast.name}:`, err);
    }
  }

  console.log(`[Enrich] Complete: ${enriched} enriched, ${errors} errors`);
  return { enriched, errors };
}

let batchExpansionRunning = false;
let batchExpansionProgress: {
  status: "idle" | "running" | "completed" | "error";
  currentPodcast: string;
  podcastsProcessed: number;
  podcastsTotal: number;
  episodesCreated: number;
  episodesSkipped: number;
  episodesFailed: number;
  errors: string[];
  startedAt: string | null;
  completedAt: string | null;
} = {
  status: "idle",
  currentPodcast: "",
  podcastsProcessed: 0,
  podcastsTotal: 0,
  episodesCreated: 0,
  episodesSkipped: 0,
  episodesFailed: 0,
  errors: [],
  startedAt: null,
  completedAt: null,
};

export function getBatchExpansionProgress() {
  return { ...batchExpansionProgress };
}

export async function batchExpandEpisodes(targetPerPodcast: number = 50) {
  if (batchExpansionRunning) {
    console.log("[BatchExpand] Already running, skipping");
    return;
  }

  batchExpansionRunning = true;
  batchExpansionProgress = {
    status: "running",
    currentPodcast: "",
    podcastsProcessed: 0,
    podcastsTotal: 0,
    episodesCreated: 0,
    episodesSkipped: 0,
    episodesFailed: 0,
    errors: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  const keepAliveInterval = setInterval(async () => {
    try {
      const port = process.env.PORT || 5000;
      await fetch(`http://127.0.0.1:${port}/api/health`);
      console.log(`[BatchExpand] Keep-alive ping sent (${batchExpansionProgress.episodesCreated} created, ${batchExpansionProgress.podcastsProcessed}/${batchExpansionProgress.podcastsTotal} podcasts)`);
    } catch {}
  }, 2 * 60 * 1000);

  const { pool: dbPool } = await import("./db");

  try {
    let landingPodcasts: any[];
    try {
      const allDir = await storage.getPodcastDirectory();
      landingPodcasts = allDir.filter((p: any) => p.hasLandingPage && p.itunesId && p.slug);
    } catch (err) {
      console.error("[BatchExpand] Failed to fetch podcast directory:", err);
      batchExpansionProgress.status = "error";
      batchExpansionProgress.errors.push("Failed to fetch podcast directory");
      batchExpansionRunning = false;
      return;
    }

    batchExpansionProgress.podcastsTotal = landingPodcasts.length;
    console.log(`[BatchExpand] Starting batch expansion for ${landingPodcasts.length} podcasts (target: ${targetPerPodcast} episodes each)`);

    for (const podcast of landingPodcasts) {
      batchExpansionProgress.currentPodcast = podcast.name;

      try {
        const client = await dbPool.connect();
        let existingCount: number;
        try {
          const { rows } = await client.query(
            `SELECT COUNT(*)::int as count FROM landing_page_recaps WHERE slug = $1`,
            [podcast.slug]
          );
          existingCount = rows[0].count;
        } finally {
          client.release();
        }

        if (existingCount >= targetPerPodcast) {
          console.log(`[BatchExpand] ${podcast.name}: already has ${existingCount}/${targetPerPodcast} episodes, skipping`);
          batchExpansionProgress.podcastsProcessed++;
          continue;
        }

        const needed = targetPerPodcast - existingCount;
        console.log(`[BatchExpand] ${podcast.name}: has ${existingCount}, needs ${needed} more`);

        const lookupUrl = `https://itunes.apple.com/lookup?id=${podcast.itunesId}&media=podcast&entity=podcastEpisode&limit=${Math.min(targetPerPodcast + 10, 200)}&sort=recent`;
        const lookupRes = await fetch(lookupUrl);
        const lookupJson = await lookupRes.json();
        const itunesEpisodes = (lookupJson.results || []).filter((r: any) => r.wrapperType === "podcastEpisode");
        console.log(`[BatchExpand] ${podcast.name}: iTunes returned ${itunesEpisodes.length} episodes`);

        if (itunesEpisodes.length === 0) {
          batchExpansionProgress.podcastsProcessed++;
          continue;
        }

        let taddyEpisodesList: any[] = [];
        try {
          taddyEpisodesList = await getEpisodesByItunesId(podcast.itunesId, 50, podcast.name);
          console.log(`[BatchExpand] ${podcast.name}: Taddy returned ${taddyEpisodesList.length} episodes`);
        } catch {
          console.warn(`[BatchExpand] ${podcast.name}: Taddy episodes fetch failed`);
        }

        let podcastCreated = 0;
        for (const ep of itunesEpisodes) {
          if (podcastCreated >= needed) break;

          const epTitle = ep.trackName || "Untitled";
          const epSlug = slugifyEpisodeTitle(epTitle);

          const existingRecap = await storage.getLandingPageRecapBySlug(podcast.slug, epSlug);
          if (existingRecap) {
            batchExpansionProgress.episodesSkipped++;
            continue;
          }

          const episodeGuid = ep.episodeGuid || `${podcast.itunesId}_${ep.trackId || epTitle}`;

          let transcriptText: string | null = null;
          let rawSegments: any[] | null = null;

          const cached = await storage.getTranscriptByEpisodeGuid(episodeGuid);
          if (cached) {
            transcriptText = cached.transcript;
          }

          if (!transcriptText) {
            const dbClient = await dbPool.connect();
            try {
              const titleMatch = await dbClient.query(
                `SELECT transcript FROM episode_transcripts WHERE podcast_id = $1 AND ${SQL_NORMALIZE_TITLE('episode_title')} = ${SQL_NORMALIZE_TITLE('$2')} LIMIT 1`,
                [podcast.itunesId, epTitle]
              );
              if (titleMatch.rows.length > 0) {
                transcriptText = titleMatch.rows[0].transcript;
              }
            } finally {
              dbClient.release();
            }
          }

          if (!transcriptText) {
            try {
              let taddyEpisodeUuid: string | null = null;

              if (taddyEpisodesList.length > 0) {
                const itunesNorm = normalizeTitleForMatch(epTitle);
                const taddyMatch = taddyEpisodesList.find((te: any) => {
                  if (!te.name) return false;
                  const taddyNorm = normalizeTitleForMatch(te.name);
                  return taddyNorm === itunesNorm || taddyNorm.includes(itunesNorm) || itunesNorm.includes(taddyNorm);
                });
                if (taddyMatch?.uuid) {
                  taddyEpisodeUuid = taddyMatch.uuid;
                  console.log(`[BatchExpand] "${epTitle}": matched via Taddy list → ${taddyEpisodeUuid}`);
                }
              }

              if (!taddyEpisodeUuid) {
                await new Promise(r => setTimeout(r, 1500));
                const searchResult = await searchEpisodeByName(podcast.name, epTitle);
                if (searchResult?.uuid) {
                  taddyEpisodeUuid = searchResult.uuid;
                  console.log(`[BatchExpand] "${epTitle}": found via search → ${taddyEpisodeUuid} ("${searchResult.name}")`);
                } else {
                  console.log(`[BatchExpand] "${epTitle}": no Taddy search match`);
                }
              }

              if (taddyEpisodeUuid) {
                await new Promise(r => setTimeout(r, 500));
                rawSegments = await getEpisodeTranscriptSegments(taddyEpisodeUuid);
                if (rawSegments && rawSegments.length > 0) {
                  const lines: string[] = [];
                  for (const seg of rawSegments) {
                    const speaker = seg.speaker ? `[${seg.speaker}] ` : "";
                    lines.push(`${speaker}${seg.text}`);
                  }
                  transcriptText = lines.join("\n");
                  await storage.saveTranscript({
                    podcastId: podcast.itunesId,
                    episodeGuid,
                    episodeTitle: epTitle,
                    transcript: transcriptText,
                  });
                  console.log(`[BatchExpand] "${epTitle}": transcript fetched (${rawSegments.length} segments)`);
                } else {
                  console.log(`[BatchExpand] "${epTitle}": Taddy UUID found but no transcript available`);
                }
              }
            } catch (taddyErr) {
              console.warn(`[BatchExpand] Taddy transcript fetch failed for "${epTitle}":`, taddyErr);
            }
          }

          if (!transcriptText) {
            batchExpansionProgress.episodesSkipped++;
            continue;
          }

          try {
            const recap = await generateRecapFromTranscript(transcriptText, podcast.name, epTitle);
            if (!recap) {
              batchExpansionProgress.episodesFailed++;
              continue;
            }

            const durationMs = ep.trackTimeMillis || 0;
            const durationMin = Math.round(durationMs / 60000);
            const durationStr = durationMin >= 60
              ? `${Math.floor(durationMin / 60)} hr ${durationMin % 60} min`
              : `${durationMin} min`;
            const releaseDate = ep.releaseDate
              ? new Date(ep.releaseDate).toISOString().split("T")[0]
              : new Date().toISOString().split("T")[0];

            const appleEpisodeUrl = ep.trackViewUrl
              ? ep.trackViewUrl.replace(/&uo=\d+/, "")
              : null;

            let showNotes: string | null = null;
            try {
              const { searchEpisodeShowNotes } = await import("./taddyClient");
              showNotes = await searchEpisodeShowNotes(podcast.name, recap.episodeTitle);
            } catch {}
            if (!showNotes && recap.whatHappened) {
              showNotes = recap.whatHappened;
            }

            const { searchSpotifyEpisode: searchSpotifyEp } = await import("./spotifyClient");
            const batchSpotifyUrl = await searchSpotifyEp(podcast.name, recap.episodeTitle) || "";
            const batchSavedRecap = await storage.upsertLandingPageRecap({
              slug: podcast.slug,
              itunesId: podcast.itunesId,
              podcastName: podcast.name,
              episodeTitle: recap.episodeTitle,
              episodeSlug: epSlug,
              publishDate: releaseDate,
              duration: durationStr,
              artworkUrl: (podcast.artworkUrl || ep.artworkUrl600 || "").replace(/\d+x\d+bb/, "1200x1200bb") || null,
              hosts: podcast.hosts || null,
              tldl: "",
              whatHappened: recap.whatHappened,
              keyInsights: recap.keyInsights,
              quote: "",
              quoteAttribution: "",
              appleEpisodeUrl: appleEpisodeUrl,
              spotifyEpisodeUrl: batchSpotifyUrl,
              audioUrl: ep.episodeUrl || null,
              keyTopics: [],
              topicContexts: null,
              topQuestions: null,
              guests: recap.guests ? JSON.stringify(recap.guests) : "[]",
              sponsors: "[]",
              resources: recap.resources ? JSON.stringify(recap.resources) : "[]",
              showNotes,
            });

            podcastCreated++;
            batchExpansionProgress.episodesCreated++;
            console.log(`[BatchExpand] ✓ ${podcast.name} - "${epTitle}" (${existingCount + podcastCreated}/${targetPerPodcast})`);

            await new Promise(r => setTimeout(r, 500));
          } catch (recapErr) {
            batchExpansionProgress.episodesFailed++;
            const errMsg = `${podcast.name} - "${epTitle}": ${recapErr}`;
            batchExpansionProgress.errors.push(errMsg);
            console.error(`[BatchExpand] Recap generation failed: ${errMsg}`);
          }
        }
      } catch (podcastErr) {
        const errMsg = `${podcast.name}: ${podcastErr}`;
        batchExpansionProgress.errors.push(errMsg);
        console.error(`[BatchExpand] Error processing ${podcast.name}:`, podcastErr);
      }

      batchExpansionProgress.podcastsProcessed++;
    }

    batchExpansionProgress.status = "completed";
    batchExpansionProgress.completedAt = new Date().toISOString();
    batchExpansionProgress.currentPodcast = "";
    console.log(`[BatchExpand] Complete: ${batchExpansionProgress.episodesCreated} created, ${batchExpansionProgress.episodesSkipped} skipped, ${batchExpansionProgress.episodesFailed} failed`);
  } catch (err) {
    batchExpansionProgress.status = "error";
    batchExpansionProgress.errors.push(`Fatal error: ${err}`);
    console.error("[BatchExpand] Fatal error:", err);
  } finally {
    clearInterval(keepAliveInterval);
    batchExpansionRunning = false;
  }
}

export function startEmailScheduler() {
  console.log(`[EmailScheduler] Starting email scheduler (per-user generation at delivery time, emails held for review)...`);

  async function schedulerLoop() {
    await processSchedulerTick();
    const delay =
      schedulerConsecutiveFailures > 0
        ? Math.min(
            SCHEDULER_INTERVAL_MS * Math.pow(2, schedulerConsecutiveFailures),
            MAX_SCHEDULER_BACKOFF_MS,
          )
        : SCHEDULER_INTERVAL_MS;
    setTimeout(schedulerLoop, delay);
  }
  setTimeout(schedulerLoop, 5000);

  setInterval(() => {
    const now = new Date();
    const etHour = parseInt(now.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit" }));
    if (etHour === 5) {
      refreshNewTranscripts()
        .then(() => refreshLandingPageRecaps())
        .catch(err => console.error("[DailyRefresh] Error:", err));
    }
  }, 15 * 60 * 1000);

  setTimeout(async () => {
    try {
      await ensureLandingPageDirectoryEntries();
    } catch (err) {
      console.error("[LandingRecaps] Directory seed error:", err);
    }
    try {
      await backfillTranscriptSegments();
    } catch (err) {
      console.error("[TranscriptBackfill] Backfill error:", err);
    }
    refreshNewTranscripts()
      .then(() => refreshLandingPageRecaps())
      .catch(err => console.error("[InitialRefresh] Error:", err));
  }, 30000);
}

async function ensureLandingPageDirectoryEntries() {
  const { SLUG_TO_ITUNES_ID } = await import("./podcastLandingMap");
  const allDir = await storage.getPodcastDirectory();
  const existingByItunes = new Map(allDir.map((p: any) => [p.itunesId, p]));

  let updated = 0;
  for (const [slug, itunesId] of Object.entries(SLUG_TO_ITUNES_ID)) {
    const existing = existingByItunes.get(itunesId);
    if (existing) {
      if (!existing.hasLandingPage || existing.slug !== slug) {
        await storage.upsertPodcastDirectoryEntry({
          ...existing,
          slug,
          hasLandingPage: true,
        });
        updated++;
      }
    } else {
      try {
        const lookupRes = await fetch(`https://itunes.apple.com/lookup?id=${itunesId}&media=podcast`);
        const lookupData = await lookupRes.json();
        const info = lookupData.results?.[0];
        await storage.upsertPodcastDirectoryEntry({
          itunesId,
          slug,
          name: info?.collectionName || slug,
          artworkUrl: (info?.artworkUrl600 || info?.artworkUrl100 || "").replace(/\d+x\d+bb/, "1200x1200bb") || null,
          hasLandingPage: true,
        });
        updated++;
      } catch {
        await storage.upsertPodcastDirectoryEntry({
          itunesId,
          slug,
          name: slug,
          hasLandingPage: true,
        });
        updated++;
      }
    }
  }
  if (updated > 0) {
    console.log(`[LandingRecaps] Ensured ${updated} podcast directory entries with has_landing_page=true`);
  }

  try {
    const allDirAfter = await storage.getPodcastDirectory();
    const needsEnrichment = allDirAfter.filter((p: any) => p.hasLandingPage && (!p.aboutPodcast || !p.knownFor || !p.hostBios));
    if (needsEnrichment.length > 0) {
      console.log(`[LandingRecaps] Auto-enriching ${needsEnrichment.length} podcasts missing about metadata...`);
      enrichPodcastMetadata().catch(err => console.error("[LandingRecaps] Auto-enrich error:", err));
    }
  } catch (enrichErr) {
    console.error("[LandingRecaps] Auto-enrich check error:", enrichErr);
  }
}

export async function backfillTranscriptSegments() {
  const { pool: dbPool } = await import("./db");
  const { ITUNES_ID_TO_SLUG } = await import("./podcastLandingMap");
  let totalProcessed = 0;

  while (true) {
    const client = await dbPool.connect();
    try {
      const { rows: transcripts } = await client.query(
        `SELECT et.id, et.podcast_id, et.episode_guid, et.episode_title, et.transcript
         FROM episode_transcripts et
         WHERE NOT EXISTS (
           SELECT 1 FROM transcript_segments ts WHERE ts.episode_guid = et.episode_guid
         )
         LIMIT 50`
      );

      if (transcripts.length === 0) break;

      for (const t of transcripts) {
        try {
          const podcastSlug = ITUNES_ID_TO_SLUG[t.podcast_id] || t.podcast_id;
          const episodeSlug = slugifyEpisodeTitle(t.episode_title);
          const segments = parseTranscriptToSegments(
            t.transcript,
            podcastSlug,
            episodeSlug,
            t.episode_guid,
            t.id
          );
          if (segments.length > 0) {
            await storage.saveTranscriptSegments(segments);
            totalProcessed++;
          }
        } catch (err) {
          console.warn(`[TranscriptBackfill] Error processing ${t.episode_title}:`, err);
        }
      }
    } finally {
      client.release();
    }
  }

  if (totalProcessed > 0) {
    console.log(`[TranscriptBackfill] Backfilled ${totalProcessed} transcripts into segments`);
  }
}

export async function reIngestTranscriptSegments() {
  const { pool: dbPool } = await import("./db");
  const { ITUNES_ID_TO_SLUG } = await import("./podcastLandingMap");
  let upgraded = 0;
  let errors = 0;
  let skipped = 0;
  let noTimestamps = 0;
  const BATCH_SIZE = 100;
  const DELAY_MS = 300;

  const client = await dbPool.connect();
  try {
    const { rows: transcripts } = await client.query(
      `SELECT DISTINCT et.id, et.podcast_id, et.episode_guid, et.episode_title
       FROM episode_transcripts et
       INNER JOIN transcript_segments ts ON ts.episode_guid = et.episode_guid
       WHERE ts.timestamp_seconds IS NULL
       AND et.podcast_id IN (SELECT itunes_id FROM podcast_directory WHERE has_landing_page = true)
       AND NOT EXISTS (
         SELECT 1 FROM transcript_segments ts2 
         WHERE ts2.episode_guid = et.episode_guid 
         AND ts2.timestamp_seconds IS NOT NULL
       )
       ORDER BY et.podcast_id, et.id`
    );

    if (transcripts.length === 0) {
      console.log("[TranscriptReIngest] No transcripts need re-ingestion");
      return;
    }

    console.log(`[TranscriptReIngest] Re-ingesting ${transcripts.length} transcripts from Taddy for timestamps...`);

    for (let i = 0; i < transcripts.length; i++) {
      const t = transcripts[i];
      try {
        const podcastSlug = ITUNES_ID_TO_SLUG[t.podcast_id] || t.podcast_id;
        const episodeSlug = slugifyEpisodeTitle(t.episode_title);

        const rawSegments = await getEpisodeTranscriptSegments(t.episode_guid);
        if (!rawSegments || rawSegments.length === 0) {
          skipped++;
          await new Promise(r => setTimeout(r, DELAY_MS));
          continue;
        }

        const hasTimestamps = rawSegments.some(s => s.startTimecode != null);
        if (!hasTimestamps) {
          noTimestamps++;
          continue;
        }

        const parsedSegments = parseRawTaddySegments(rawSegments, podcastSlug, episodeSlug, t.episode_guid, t.id);
        if (parsedSegments.length > 0) {
          await storage.saveTranscriptSegments(parsedSegments);
          upgraded++;
        }
      } catch (err) {
        errors++;
      }

      const processed = i + 1;
      if (processed % BATCH_SIZE === 0 || processed === transcripts.length) {
        console.log(`[TranscriptReIngest] Progress: ${processed}/${transcripts.length} (${upgraded} upgraded, ${noTimestamps} no timestamps on Taddy, ${skipped} skipped, ${errors} errors)`);
      }

      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    console.log(`[TranscriptReIngest] Complete: ${upgraded} upgraded, ${noTimestamps} no timestamps on Taddy, ${skipped} skipped, ${errors} errors out of ${transcripts.length} total`);
  } finally {
    client.release();
  }
}

export async function backfillShowNotes() {
  const { pool: dbPool } = await import("./db");
  const { searchEpisodeShowNotes } = await import("./taddyClient");
  const client = await dbPool.connect();
  try {
    const { rows: recaps } = await client.query(
      `SELECT id, slug, podcast_name, episode_title FROM landing_page_recaps WHERE show_notes IS NULL ORDER BY slug, id`
    );
    console.log(`[BackfillShowNotes] Found ${recaps.length} recaps missing show notes`);

    let updated = 0;
    let notFound = 0;
    let errors = 0;

    for (let i = 0; i < recaps.length; i++) {
      const recap = recaps[i];
      try {
        const showNotes = await searchEpisodeShowNotes(recap.podcast_name, recap.episode_title);
        if (showNotes) {
          await client.query(
            `UPDATE landing_page_recaps SET show_notes = $1 WHERE id = $2`,
            [showNotes, recap.id]
          );
          updated++;
        } else {
          notFound++;
        }

        if ((i + 1) % 25 === 0) {
          console.log(`[BackfillShowNotes] Progress: ${i + 1}/${recaps.length} (${updated} updated, ${notFound} not found, ${errors} errors)`);
        }

        await new Promise(resolve => setTimeout(resolve, 400));
      } catch (err) {
        errors++;
        console.warn(`[BackfillShowNotes] Error for "${recap.episode_title}" (${recap.slug}):`, err);
      }
    }

    console.log(`[BackfillShowNotes] Complete: ${updated} updated, ${notFound} not found, ${errors} errors out of ${recaps.length} total`);
  } finally {
    client.release();
  }
}

export async function backfillAppleEpisodeUrls() {
  const { pool: dbPool } = await import("./db");
  const client = await dbPool.connect();
  try {
    const { rows: recaps } = await client.query(
      `SELECT id, slug, itunes_id, episode_title FROM landing_page_recaps WHERE apple_episode_url IS NULL AND itunes_id IS NOT NULL`
    );
    console.log(`[BackfillAppleUrls] Found ${recaps.length} recaps missing Apple episode URLs`);

    const byItunesId = new Map<string, typeof recaps>();
    for (const r of recaps) {
      const list = byItunesId.get(r.itunes_id) || [];
      list.push(r);
      byItunesId.set(r.itunes_id, list);
    }

    let updated = 0;
    let errors = 0;

    for (const [itunesId, podcastRecaps] of byItunesId) {
      try {
        const lookupUrl = `https://itunes.apple.com/lookup?id=${itunesId}&media=podcast&entity=podcastEpisode&limit=200&sort=recent`;
        const lookupRes = await fetch(lookupUrl);
        const lookupJson = await lookupRes.json();
        const episodes = (lookupJson.results || []).filter((r: any) => r.wrapperType === "podcastEpisode");

        for (const recap of podcastRecaps) {
          const titleNorm = recap.episode_title.toLowerCase().trim();
          const match = episodes.find((ep: any) => {
            const epNorm = (ep.trackName || "").toLowerCase().trim();
            return epNorm === titleNorm || epNorm.includes(titleNorm) || titleNorm.includes(epNorm);
          });
          if (match?.trackViewUrl) {
            const cleanUrl = match.trackViewUrl.replace(/&uo=\d+/, "");
            await client.query(
              `UPDATE landing_page_recaps SET apple_episode_url = $1, audio_url = COALESCE(audio_url, $2) WHERE id = $3`,
              [cleanUrl, match.episodeUrl || null, recap.id]
            );
            updated++;
          }
        }

        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err) {
        errors++;
        console.warn(`[BackfillAppleUrls] Error for iTunes ID ${itunesId}:`, err);
      }
    }

    console.log(`[BackfillAppleUrls] Complete: ${updated} updated, ${errors} errors`);
  } finally {
    client.release();
  }
}

export async function backfillSpotifyEpisodeUrls() {
  const { pool: dbPool } = await import("./db");
  const { searchSpotifyEpisode } = await import("./spotifyClient");
  const client = await dbPool.connect();
  try {
    const { rows: recaps } = await client.query(
      `SELECT id, podcast_name, episode_title FROM landing_page_recaps WHERE (spotify_episode_url IS NULL OR spotify_episode_url = '' OR spotify_episode_url LIKE '%/search/%') ORDER BY id`
    );
    console.log(`[BackfillSpotifyUrls] Found ${recaps.length} recaps missing Spotify episode URLs`);

    let updated = 0;
    let errors = 0;

    for (let i = 0; i < recaps.length; i++) {
      const recap = recaps[i];
      try {
        const url = await searchSpotifyEpisode(recap.podcast_name, recap.episode_title);
        await client.query(
          `UPDATE landing_page_recaps SET spotify_episode_url = $1 WHERE id = $2`,
          [url || "", recap.id]
        );
        updated++;
      } catch (err) {
        errors++;
      }

      const processed = i + 1;
      if (processed % 100 === 0 || processed === recaps.length) {
        console.log(`[BackfillSpotifyUrls] Progress: ${processed}/${recaps.length} (${updated} updated, ${errors} errors)`);
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`[BackfillSpotifyUrls] Complete: ${updated} updated, ${errors} errors`);
  } finally {
    client.release();
  }
}

export async function backfillPodcastPlatformLinks() {
  const { pool: dbPool } = await import("./db");
  const { searchSpotifyShow } = await import("./spotifyClient");
  const client = await dbPool.connect();
  try {
    const { rows: podcasts } = await client.query(
      `SELECT id, itunes_id, name, slug, apple_url, spotify_url, youtube_url FROM podcast_directory WHERE has_landing_page = true ORDER BY id`
    );
    console.log(`[BackfillPodcastLinks] Found ${podcasts.length} podcasts to check`);

    let appleUpdated = 0, spotifyUpdated = 0, youtubeUpdated = 0, errors = 0;

    for (let i = 0; i < podcasts.length; i++) {
      const p = podcasts[i];
      try {
        const updates: string[] = [];
        const vals: any[] = [];
        let paramIdx = 1;

        if (!p.apple_url && p.itunes_id) {
          try {
            const lookupUrl = `https://itunes.apple.com/lookup?id=${p.itunes_id}`;
            const resp = await fetch(lookupUrl);
            if (resp.ok) {
              const data = await resp.json();
              const result = data.results?.[0];
              if (result?.collectionViewUrl) {
                updates.push(`apple_url = $${paramIdx++}`);
                vals.push(result.collectionViewUrl.replace(/&uo=\d+/, ""));
                appleUpdated++;
              }
            }
          } catch {}
          await new Promise(r => setTimeout(r, 300));
        }

        if (!p.spotify_url) {
          try {
            const spotifyUrl = await searchSpotifyShow(p.name);
            if (spotifyUrl) {
              updates.push(`spotify_url = $${paramIdx++}`);
              vals.push(spotifyUrl);
              spotifyUpdated++;
            } else {
              updates.push(`spotify_url = $${paramIdx++}`);
              vals.push(`https://open.spotify.com/search/${encodeURIComponent(p.name)}`);
              spotifyUpdated++;
            }
          } catch {
            updates.push(`spotify_url = $${paramIdx++}`);
            vals.push(`https://open.spotify.com/search/${encodeURIComponent(p.name)}`);
            spotifyUpdated++;
          }
          await new Promise(r => setTimeout(r, 200));
        }

        if (!p.youtube_url) {
          const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(p.name + " podcast")}`;
          updates.push(`youtube_url = $${paramIdx++}`);
          vals.push(ytSearchUrl);
          youtubeUpdated++;
        }

        if (updates.length > 0) {
          vals.push(p.id);
          await client.query(
            `UPDATE podcast_directory SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${paramIdx}`,
            vals
          );
        }

        if ((i + 1) % 10 === 0 || i === podcasts.length - 1) {
          console.log(`[BackfillPodcastLinks] Progress: ${i + 1}/${podcasts.length} (Apple: ${appleUpdated}, Spotify: ${spotifyUpdated})`);
        }
      } catch (err) {
        errors++;
        console.warn(`[BackfillPodcastLinks] Error for "${p.name}":`, err);
      }
    }

    console.log(`[BackfillPodcastLinks] Complete: Apple=${appleUpdated}, Spotify=${spotifyUpdated}, YouTube=${youtubeUpdated}, errors=${errors}`);
  } finally {
    client.release();
  }
}

export async function backfillPodcastHosts() {
  const { pool: dbPool } = await import("./db");
  const client = await dbPool.connect();
  try {
    const { rows: podcasts } = await client.query(
      `SELECT pd.id, pd.itunes_id, pd.name, pd.slug, pd.hosts
       FROM podcast_directory pd
       WHERE pd.has_landing_page = true AND (pd.hosts IS NULL OR pd.hosts = '')
       ORDER BY pd.id`
    );
    console.log(`[BackfillPodcastHosts] Found ${podcasts.length} podcasts missing hosts`);

    let updated = 0, errors = 0;

    for (let i = 0; i < podcasts.length; i++) {
      const p = podcasts[i];
      try {
        const { rows: hostRows } = await client.query(
          `SELECT name FROM podcast_hosts WHERE podcast_slug = $1 ORDER BY sort_order, id`,
          [p.slug]
        );

        if (hostRows.length > 0) {
          const hostsStr = hostRows.map((h: any) => h.name).join(", ");
          await client.query(
            `UPDATE podcast_directory SET hosts = $1, updated_at = NOW() WHERE id = $2`,
            [hostsStr, p.id]
          );
          updated++;
          continue;
        }

        if (p.itunes_id) {
          try {
            const lookupUrl = `https://itunes.apple.com/lookup?id=${p.itunes_id}`;
            const resp = await fetch(lookupUrl);
            if (resp.ok) {
              const data = await resp.json();
              const result = data.results?.[0];
              if (result?.artistName && result.artistName !== p.name) {
                await client.query(
                  `UPDATE podcast_directory SET hosts = $1, updated_at = NOW() WHERE id = $2`,
                  [result.artistName, p.id]
                );
                updated++;
              }
            }
          } catch {}
          await new Promise(r => setTimeout(r, 300));
        }

        if ((i + 1) % 10 === 0) {
          console.log(`[BackfillPodcastHosts] Progress: ${i + 1}/${podcasts.length} (${updated} updated)`);
        }
      } catch (err) {
        errors++;
        console.warn(`[BackfillPodcastHosts] Error for "${p.name}":`, err);
      }
    }

    console.log(`[BackfillPodcastHosts] Complete: ${updated} updated, ${errors} errors`);
  } finally {
    client.release();
  }
}

export async function backfillEpisodeShowNotesFromItunes() {
  const { pool: dbPool } = await import("./db");
  const client = await dbPool.connect();
  try {
    const { rows: recaps } = await client.query(
      `SELECT id, slug, itunes_id, episode_title, podcast_name
       FROM landing_page_recaps
       WHERE (show_notes IS NULL OR show_notes = '') AND itunes_id IS NOT NULL
       ORDER BY slug, id`
    );
    console.log(`[BackfillItunesShowNotes] Found ${recaps.length} recaps missing show notes`);

    const byItunesId = new Map<string, typeof recaps>();
    for (const r of recaps) {
      const list = byItunesId.get(r.itunes_id) || [];
      list.push(r);
      byItunesId.set(r.itunes_id, list);
    }

    let updated = 0, notFound = 0, errors = 0;

    for (const [itunesId, podcastRecaps] of byItunesId) {
      try {
        const lookupUrl = `https://itunes.apple.com/lookup?id=${itunesId}&media=podcast&entity=podcastEpisode&limit=200&sort=recent`;
        const resp = await fetch(lookupUrl);
        if (!resp.ok) { errors++; continue; }
        const data = await resp.json();
        const episodes = (data.results || []).filter((r: any) => r.wrapperType === "podcastEpisode");

        for (const recap of podcastRecaps) {
          const titleNorm = recap.episode_title.toLowerCase().trim();
          const match = episodes.find((ep: any) => {
            const epNorm = (ep.trackName || "").toLowerCase().trim();
            return epNorm === titleNorm || epNorm.includes(titleNorm) || titleNorm.includes(epNorm);
          });

          if (match?.description) {
            await client.query(
              `UPDATE landing_page_recaps SET show_notes = $1 WHERE id = $2`,
              [match.description, recap.id]
            );
            updated++;
          } else {
            notFound++;
          }
        }

        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        errors++;
        console.warn(`[BackfillItunesShowNotes] Error for iTunes ID ${itunesId}:`, err);
      }
    }

    console.log(`[BackfillItunesShowNotes] Complete: ${updated} updated, ${notFound} not found, ${errors} errors`);
  } finally {
    client.release();
  }
}

export async function backfillEpisodeHosts() {
  const { pool: dbPool } = await import("./db");
  const client = await dbPool.connect();
  try {
    const { rows: recaps } = await client.query(
      `SELECT r.id, r.slug, r.hosts as episode_hosts, pd.hosts as podcast_hosts
       FROM landing_page_recaps r
       JOIN podcast_directory pd ON pd.slug = r.slug
       WHERE (r.hosts IS NULL OR r.hosts = '') AND pd.hosts IS NOT NULL AND pd.hosts != ''
       ORDER BY r.id`
    );
    console.log(`[BackfillEpisodeHosts] Found ${recaps.length} episodes missing hosts`);

    let updated = 0, errors = 0;

    for (let i = 0; i < recaps.length; i++) {
      try {
        await client.query(
          `UPDATE landing_page_recaps SET hosts = $1 WHERE id = $2`,
          [recaps[i].podcast_hosts, recaps[i].id]
        );
        updated++;
      } catch (err) {
        errors++;
      }

      if ((i + 1) % 100 === 0 || i === recaps.length - 1) {
        console.log(`[BackfillEpisodeHosts] Progress: ${i + 1}/${recaps.length} (${updated} updated)`);
      }
    }

    console.log(`[BackfillEpisodeHosts] Complete: ${updated} updated, ${errors} errors`);
  } finally {
    client.release();
  }
}

export async function enrichPeopleWithAI() {
  const { pool: dbPool } = await import("./db");
  const { openai } = await import("./replit_integrations/image/client");
  const client = await dbPool.connect();
  try {
    const { rows: people } = await client.query(
      `SELECT id, slug, name, bio, title, company, photo_url, twitter_handle, linkedin_url, website_url
       FROM entity_people
       WHERE (bio IS NULL OR bio = '')
          OR (title IS NULL OR title = '')
          OR (company IS NULL OR company = '')
          OR (twitter_handle IS NULL OR twitter_handle = '')
          OR (linkedin_url IS NULL OR linkedin_url = '')
          OR (website_url IS NULL OR website_url = '')
          OR (photo_url IS NULL OR photo_url = '')
       ORDER BY id`
    );
    console.log(`[EnrichPeople] Found ${people.length} people to enrich`);

    let updated = 0, errors = 0;

    for (let i = 0; i < people.length; i++) {
      const person = people[i];
      try {
        const resp = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{
            role: "user",
            content: `Generate a structured profile for this public figure. Only include information you are confident about. Return JSON with these fields:
- bio: A concise 1-2 sentence bio (what they're known for)
- title: Their current professional title (e.g. "CEO", "Venture Capitalist", "Podcast Host")
- company: Their current primary company/organization
- twitter_handle: Their X/Twitter handle without @ (e.g. "elonmusk"), or null if unknown
- linkedin_url: Their LinkedIn profile URL, or null if unknown
- website_url: Their personal website URL, or null if unknown
- photo_url: A publicly accessible URL of their headshot/photo (from Wikipedia, company site, etc.), or null if unknown

Person: ${person.name}
${person.title ? `Known title: ${person.title}` : ""}
${person.company ? `Known company: ${person.company}` : ""}

Respond ONLY with valid JSON.`
          }],
          max_tokens: 500,
          temperature: 0.3,
          response_format: { type: "json_object" },
        });

        const content = resp.choices[0]?.message?.content;
        if (content) {
          const data = JSON.parse(content);
          const setClauses: string[] = [];
          const vals: any[] = [];
          let idx = 1;

          if (data.bio && !person.bio) { setClauses.push(`bio = $${idx++}`); vals.push(data.bio); }
          if (data.title && !person.title) { setClauses.push(`title = $${idx++}`); vals.push(data.title); }
          if (data.company && !person.company) { setClauses.push(`company = $${idx++}`); vals.push(data.company); }
          if (data.twitter_handle && !person.twitter_handle) { setClauses.push(`twitter_handle = $${idx++}`); vals.push(data.twitter_handle.replace(/^@/, "")); }
          if (data.linkedin_url && !person.linkedin_url) { setClauses.push(`linkedin_url = $${idx++}`); vals.push(data.linkedin_url); }
          if (data.website_url && !person.website_url) { setClauses.push(`website_url = $${idx++}`); vals.push(data.website_url); }
          if (data.photo_url && !person.photo_url) { setClauses.push(`photo_url = $${idx++}`); vals.push(data.photo_url); }

          if (setClauses.length > 0) {
            vals.push(person.id);
            await client.query(
              `UPDATE entity_people SET ${setClauses.join(", ")}, updated_at = NOW() WHERE id = $${idx}`,
              vals
            );
            updated++;
          }
        }

        if ((i + 1) % 5 === 0 || i === people.length - 1) {
          console.log(`[EnrichPeople] Progress: ${i + 1}/${people.length} (${updated} updated)`);
        }

        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        errors++;
        console.warn(`[EnrichPeople] Error for "${person.name}":`, err);
      }
    }

    console.log(`[EnrichPeople] Complete: ${updated} updated, ${errors} errors out of ${people.length}`);
  } finally {
    client.release();
  }
}

export async function enrichSinglePerson(slug: string): Promise<boolean> {
  const { pool: dbPool } = await import("./db");
  const { openai } = await import("./replit_integrations/image/client");
  const { rows: [person] } = await dbPool.query(
    `SELECT id, slug, name, bio, title, company, photo_url, twitter_handle, linkedin_url, website_url FROM entity_people WHERE slug = $1`,
    [slug]
  );
  if (!person) return false;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `Generate a structured profile for this public figure. Only include information you are confident about. Return JSON with these fields:
- bio: A concise 1-2 sentence bio (what they're known for)
- title: Their current professional title
- company: Their current primary company/organization
- twitter_handle: Their X/Twitter handle without @ (e.g. "elonmusk"), or null if unknown
- linkedin_url: Their LinkedIn profile URL, or null if unknown
- website_url: Their personal website URL, or null if unknown
- photo_url: A publicly accessible URL of their headshot/photo (from Wikipedia, company site, etc.), or null if unknown

Person: ${person.name}

Respond ONLY with valid JSON.`
      }],
      max_tokens: 500,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = resp.choices[0]?.message?.content;
    if (content) {
      const data = JSON.parse(content);
      await dbPool.query(
        `UPDATE entity_people SET
          bio = COALESCE($1, bio), title = COALESCE($2, title), company = COALESCE($3, company),
          twitter_handle = COALESCE($4, twitter_handle), linkedin_url = COALESCE($5, linkedin_url),
          website_url = COALESCE($6, website_url), photo_url = COALESCE($7, photo_url), updated_at = NOW()
        WHERE slug = $8`,
        [data.bio || null, data.title || null, data.company || null,
         data.twitter_handle ? data.twitter_handle.replace(/^@/, "") : null,
         data.linkedin_url || null, data.website_url || null, data.photo_url || null, slug]
      );
      return true;
    }
  } catch (err) {
    console.warn(`[EnrichPerson] Error for "${person.name}":`, err);
  }
  return false;
}

export async function enrichCompaniesWithAI() {
  const { pool: dbPool } = await import("./db");
  const { openai } = await import("./replit_integrations/image/client");
  const client = await dbPool.connect();
  try {
    const { rows: companies } = await client.query(
      `SELECT id, slug, name, description, industry, website_url, twitter_handle, logo_url
       FROM entity_companies
       WHERE (description IS NULL OR description = '')
          OR (industry IS NULL OR industry = '')
          OR (website_url IS NULL OR website_url = '')
          OR (twitter_handle IS NULL OR twitter_handle = '')
          OR (logo_url IS NULL OR logo_url = '')
       ORDER BY id`
    );
    console.log(`[EnrichCompanies] Found ${companies.length} companies to enrich`);

    let updated = 0, errors = 0;

    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];
      try {
        const resp = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{
            role: "user",
            content: `Generate a structured profile for this company/organization. Only include information you are confident about. Return JSON with these fields:
- description: A concise 1-2 sentence description of what the company does
- industry: The primary industry (e.g. "Technology", "Finance", "Media", "Venture Capital")
- website_url: The company's main website URL, or null if unknown
- twitter_handle: The company's X/Twitter handle without @ (e.g. "openai"), or null if unknown
- logo_url: A publicly accessible URL of the company's logo (from their website, Wikipedia, etc.), or null if unknown

Company: ${company.name}
${company.industry ? `Known industry: ${company.industry}` : ""}

Respond ONLY with valid JSON.`
          }],
          max_tokens: 500,
          temperature: 0.3,
          response_format: { type: "json_object" },
        });

        const content = resp.choices[0]?.message?.content;
        if (content) {
          const data = JSON.parse(content);
          const setClauses: string[] = [];
          const vals: any[] = [];
          let idx = 1;

          if (data.description && !company.description) { setClauses.push(`description = $${idx++}`); vals.push(data.description); }
          if (data.industry && !company.industry) { setClauses.push(`industry = $${idx++}`); vals.push(data.industry); }
          if (data.website_url && !company.website_url) { setClauses.push(`website_url = $${idx++}`); vals.push(data.website_url); }
          if (data.twitter_handle && !company.twitter_handle) { setClauses.push(`twitter_handle = $${idx++}`); vals.push(data.twitter_handle.replace(/^@/, "")); }
          if (data.logo_url && !company.logo_url) { setClauses.push(`logo_url = $${idx++}`); vals.push(data.logo_url); }

          if (setClauses.length > 0) {
            vals.push(company.id);
            await client.query(
              `UPDATE entity_companies SET ${setClauses.join(", ")}, updated_at = NOW() WHERE id = $${idx}`,
              vals
            );
            updated++;
          }
        }

        if ((i + 1) % 5 === 0 || i === companies.length - 1) {
          console.log(`[EnrichCompanies] Progress: ${i + 1}/${companies.length} (${updated} updated)`);
        }

        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        errors++;
        console.warn(`[EnrichCompanies] Error for "${company.name}":`, err);
      }
    }

    console.log(`[EnrichCompanies] Complete: ${updated} updated, ${errors} errors out of ${companies.length}`);
  } finally {
    client.release();
  }
}

export async function enrichSingleCompany(slug: string): Promise<boolean> {
  const { pool: dbPool } = await import("./db");
  const { openai } = await import("./replit_integrations/image/client");
  const { rows: [company] } = await dbPool.query(
    `SELECT id, slug, name, description, industry, website_url, twitter_handle, logo_url FROM entity_companies WHERE slug = $1`,
    [slug]
  );
  if (!company) return false;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `Generate a structured profile for this company/organization. Only include information you are confident about. Return JSON with these fields:
- description: A concise 1-2 sentence description of what the company does
- industry: The primary industry (e.g. "Technology", "Finance", "Media", "Venture Capital")
- website_url: The company's main website URL, or null if unknown
- twitter_handle: The company's X/Twitter handle without @ (e.g. "openai"), or null if unknown
- logo_url: A publicly accessible URL of the company's logo (from their website, Wikipedia, etc.), or null if unknown

Company: ${company.name}

Respond ONLY with valid JSON.`
      }],
      max_tokens: 500,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = resp.choices[0]?.message?.content;
    if (content) {
      const data = JSON.parse(content);
      await dbPool.query(
        `UPDATE entity_companies SET
          description = COALESCE($1, description), industry = COALESCE($2, industry),
          website_url = COALESCE($3, website_url), twitter_handle = COALESCE($4, twitter_handle),
          logo_url = COALESCE($5, logo_url), updated_at = NOW()
        WHERE slug = $6`,
        [data.description || null, data.industry || null,
         data.website_url || null,
         data.twitter_handle ? data.twitter_handle.replace(/^@/, "") : null,
         data.logo_url || null, slug]
      );
      return true;
    }
  } catch (err) {
    console.warn(`[EnrichCompany] Error for "${company.name}":`, err);
  }
  return false;
}
