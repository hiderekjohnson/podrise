import { storage } from "./storage";
import { openai } from "./replit_integrations/image/client";
import { ITUNES_ID_TO_SLUG } from "./podcastLandingMap";
import { pool } from "./db";
import { TOPICS } from "../client/src/data/topicData";
import { searchSpotifyEpisode } from "./spotifyClient";

const CURATED_TOPIC_SLUGS = TOPICS.map(t => t.slug);

const BANNED_INSIGHT_HOOKS = [
  /^dude[,!.\s]/i,
  /^here'?s (a |the )?(twist|thing|kicker|takeaway|secret|strategy|result)[:\s!?—–-]/i,
  /^turns out[,:\s]/i,
  /^imagine\b/i,
  /^what'?s wild is/i,
  /^the kicker[?:\s]/i,
  /^the takeaway[?:\s]/i,
  /^the secret[?:\s]/i,
  /^the strategy[?:\s]/i,
  /^the result[?:\s]/i,
  /^you know what/i,
  /^guess what/i,
  /^fun fact[:\s]/i,
  /^plot twist[:\s]/i,
  /^get this[:\s]/i,
  /^wait for it/i,
  /^brace yourself/i,
  /^ready for this/i,
  /^here'?s where it gets/i,
  /^did you know/i,
  /^so,?\s/i,
  /^well,?\s/i,
  /^okay so/i,
  /^check this out/i,
  /^mind.?blown/i,
];

const BANNED_INSIGHT_INTERIOR = [
  /dude,?\s+did you know/gi,
  /did you know\s+(that\s+)?/gi,
  /here'?s the (thing|twist|kicker|secret)/gi,
];

function sanitizeInsight(insight: string): string {
  let cleaned = insight;
  for (const pattern of BANNED_INSIGHT_HOOKS) {
    const match = cleaned.match(pattern);
    if (match) {
      cleaned = cleaned.slice(match[0].length).replace(/^[\s,.:!?—–-]+/, '');
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      console.log(`[RecapGenerator] Sanitized insight hook: "${match[0].trim()}" removed`);
    }
  }
  for (const pattern of BANNED_INSIGHT_INTERIOR) {
    const before = cleaned;
    cleaned = cleaned.replace(pattern, '');
    if (cleaned !== before) {
      cleaned = cleaned.replace(/^[\s,.:!?—–-]+/, '').replace(/\s{2,}/g, ' ');
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      console.log(`[RecapGenerator] Sanitized interior phrase from insight`);
    }
  }
  cleaned = cleaned.replace(/!/g, '.');
  return cleaned;
}

interface PodcastInfo {
  name: string;
  id: string;
}

export interface EpisodeStats {
  included: number;
  noNewEpisode: number;
  error: number;
  details: { podcast: string; status: "included" | "no_new_episode" | "error"; episodeCount?: number; errorMessage?: string }[];
}

export interface ExtractedQuote {
  speakerName: string;
  speakerRole: string;
  quoteText: string;
  context: string;
  quoteType: "Hero Quote" | "Hot Take" | "Prediction" | "Spicy" | "Tweetable";
}

export interface ParsedEpisode {
  podcastName: string;
  episodeTitle: string;
  episodeDuration?: string;
  episodeDate?: string;
  whatHappened: string;
  keyInsights: string[];
  guests?: { name: string; title: string }[];
  resources?: { name: string; type: string; description: string; url?: string; author?: string; context?: string }[];
}

interface RecapResult {
  summary: string;
  dateStr: string;
  episodeStats: EpisodeStats;
  parsedEpisodes: ParsedEpisode[];
  recappedPodcasts: string[];
}

type RecapMode = "yesterday" | "latest";


function selectEpisodes(allResults: any[], mode: RecapMode, yesterdayStart?: Date, yesterdayEnd?: Date): any[] {
  const podcastEpisodes = allResults.filter((r: any) => r.wrapperType === "podcastEpisode");

  if (mode === "yesterday" && yesterdayStart && yesterdayEnd) {
    return podcastEpisodes.filter((r: any) => {
      const releaseDate = new Date(r.releaseDate);
      return releaseDate >= yesterdayStart && releaseDate < yesterdayEnd;
    });
  }

  if (podcastEpisodes.length === 0) return [];
  podcastEpisodes.sort((a: any, b: any) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());
  return [podcastEpisodes[0]];
}

export async function generateRecap(
  user: { id: number; podcasts: string[] },
  yesterdayStart: Date,
  yesterdayEnd: Date,
  yesterdayLabel: string,
  dateStr: string,
  mode: RecapMode = "yesterday",
  _promptOverride?: string
): Promise<RecapResult | null> {
  const podcastInfos: PodcastInfo[] = user.podcasts.map((raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      return { name: parsed.name || raw, id: parsed.id || raw };
    } catch {
      return { name: raw, id: raw };
    }
  });

  const podcastNamesWithEpisodes: string[] = [];
  const podcastIdsWithEpisodes: string[] = [];
  let hasAnyEpisodes = false;
  let totalDurationMin = 0;
  const episodeMetadata: Map<string, { duration: string; date: string; podcastId: string }> = new Map();
  const episodeLinks: Map<string, string> = new Map();
  const episodeSpotifyLinks: Map<string, string> = new Map();
  const stats: EpisodeStats = { included: 0, noNewEpisode: 0, error: 0, details: [] };

  for (const podcast of podcastInfos) {
    try {
      const lookupUrl = `https://itunes.apple.com/lookup?id=${podcast.id}&media=podcast&entity=podcastEpisode&limit=20&sort=recent`;
      const lookupRes = await fetch(lookupUrl);
      const lookupJson = await lookupRes.json();
      const episodes = selectEpisodes(lookupJson.results || [], mode, yesterdayStart, yesterdayEnd);

      if (episodes.length === 0) {
        stats.noNewEpisode++;
        stats.details.push({ podcast: podcast.name, status: "no_new_episode" });
      }

      if (episodes.length > 0) {
        for (const ep of episodes) {
          const durationMs = ep.trackTimeMillis || 0;
          const durationMin = Math.round(durationMs / 60000);
          totalDurationMin += durationMin;
          const durationStr = durationMin >= 60
            ? `${Math.floor(durationMin / 60)} hr ${durationMin % 60} min`
            : `${durationMin} minutes`;

          const releaseDate = ep.releaseDate ? new Date(ep.releaseDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
          const epTitle = ep.trackName || "Untitled Episode";
          const metaKey = `${podcast.name}::${epTitle}`;
          episodeMetadata.set(metaKey, { duration: durationStr, date: releaseDate, podcastId: podcast.id });

          const appleUrl = ep.trackViewUrl || ep.collectionViewUrl || "";
          const spotifyEpisodeUrl = await searchSpotifyEpisode(podcast.name, ep.trackName || "");
          if (appleUrl) episodeLinks.set(metaKey, appleUrl);
          if (spotifyEpisodeUrl) episodeSpotifyLinks.set(metaKey, spotifyEpisodeUrl);
        }
        hasAnyEpisodes = true;
        podcastNamesWithEpisodes.push(podcast.name);
        podcastIdsWithEpisodes.push(podcast.id);
        stats.included++;
        stats.details.push({ podcast: podcast.name, status: "included", episodeCount: episodes.length });
      }
    } catch (outerErr) {
      console.error(`[Recap] Error processing podcast ${podcast.name}:`, outerErr);
      stats.error++;
      stats.details.push({ podcast: podcast.name, status: "error", errorMessage: outerErr instanceof Error ? outerErr.message : String(outerErr) });
    }
  }

  if (!hasAnyEpisodes) {
    console.log(`[Recap] No recent episodes found for user ${user.id} - no recap generated`);
    return null;
  }

  const podcastNames = podcastNamesWithEpisodes.join(" · ");

  const totalHours = Math.floor(totalDurationMin / 60);
  const totalMins = totalDurationMin % 60;
  const durationLong = totalHours > 0
    ? (totalMins > 0 ? `${totalHours} hour${totalHours !== 1 ? "s" : ""} and ${totalMins} minute${totalMins !== 1 ? "s" : ""}` : `${totalHours} hour${totalHours !== 1 ? "s" : ""}`)
    : `${totalMins} minute${totalMins !== 1 ? "s" : ""}`;

  const recapEpisodes: ParsedEpisode[] = [];
  const markdownSections: string[] = [];
  markdownSections.push(podcastNames);

  for (const [metaKey, meta] of episodeMetadata) {
    const [podName, epTitle] = metaKey.split("::");
    const podcastId = meta.podcastId;
    const podSlug = ITUNES_ID_TO_SLUG[podcastId] || podName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
    const epSlug = (epTitle || "")
      .toLowerCase()
      .replace(/['']/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .split("-")
      .slice(0, 8)
      .join("-");

    let recap: any = null;
    try {
      recap = await storage.getLandingPageRecapBySlug(podSlug, epSlug);
    } catch {}

    if (!recap) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM landing_page_recaps WHERE itunes_id = $1 AND LOWER(episode_title) = LOWER($2) LIMIT 1`,
          [podcastId, epTitle]
        );
        if (rows.length > 0) recap = rows[0];
      } catch {}
    }

    if (recap) {
      console.log(`[Recap] Using stored recap for "${epTitle}" (${podName})`);

      const tldl = recap.tldl || "";
      const whatHappened = recap.whatHappened || recap.what_happened || "";
      let keyInsights: string[] = [];
      if (Array.isArray(recap.keyInsights || recap.key_insights)) {
        keyInsights = recap.keyInsights || recap.key_insights;
      }
      const quote = recap.quote || "";
      const quoteAttribution = recap.quoteAttribution || recap.quote_attribution || "";

      const recapSlug = recap.episodeSlug || recap.episode_slug || epSlug;
      const recapPageUrl = `https://podrise.com/podcasts/${podSlug}/${recapSlug}`;

      const lines: string[] = [];
      lines.push(`## ${(podName || "UNKNOWN PODCAST").toUpperCase()}`);
      lines.push("");
      lines.push(`**[${epTitle || "Untitled Episode"}](${recapPageUrl})**`);
      lines.push("");
      const metaParts: string[] = [];
      if (meta.duration) metaParts.push(meta.duration);
      if (meta.date) metaParts.push(meta.date);
      if (metaParts.length > 0) lines.push(metaParts.join(" · "));

      let epAppleUrl = episodeLinks.get(metaKey) || "";
      let epSpotifyUrl = episodeSpotifyLinks.get(metaKey) || "";
      if (!epAppleUrl) {
        for (const [k, v] of episodeLinks) {
          if (k.toLowerCase() === metaKey.toLowerCase()) { epAppleUrl = v; break; }
        }
      }
      if (!epSpotifyUrl) {
        for (const [k, v] of episodeSpotifyLinks) {
          if (k.toLowerCase() === metaKey.toLowerCase()) { epSpotifyUrl = v; break; }
        }
      }
      const linkParts: string[] = [];
      linkParts.push(`[📖 Full Recap](${recapPageUrl})`);
      if (epAppleUrl) linkParts.push(`[Apple Podcasts](${epAppleUrl})`);
      if (epSpotifyUrl) linkParts.push(`[Spotify](${epSpotifyUrl})`);
      lines.push(linkParts.join(" · "));
      lines.push("");
      if (tldl) {
        lines.push(`**TLDL:** ${tldl}`);
        lines.push("");
      }
      if (whatHappened) {
        lines.push("**What Happened**");
        const firstParagraphs = whatHappened.split("\n\n").slice(0, 3).join("\n\n");
        lines.push(firstParagraphs);
        lines.push("");
      }
      if (keyInsights.length > 0) {
        lines.push("**Key Insights:**");
        for (const insight of keyInsights) {
          lines.push(`- ${insight}`);
        }
        lines.push("");
      }
      if (quote && quoteAttribution) {
        lines.push("**Quote**");
        lines.push(`${quoteAttribution}:`);
        lines.push(`> "${quote}"`);
        lines.push("");
      }
      lines.push("---");
      markdownSections.push(lines.join("\n"));

      recapEpisodes.push({
        podcastName: podName,
        episodeTitle: epTitle,
        episodeDuration: meta.duration,
        episodeDate: meta.date,
        tldl,
        whatHappened: whatHappened.split("\n\n").slice(0, 3).join("\n\n"),
        keyInsights,
        quote: quote || undefined,
        quoteAttribution: quoteAttribution || undefined,
      });
    } else {
      console.log(`[Recap] No stored recap for "${epTitle}" - skipping from email`);
    }
  }

  if (recapEpisodes.length === 0) {
    console.log(`[Recap] No stored recaps found for any discovered episodes - no email generated`);
    return null;
  }

  markdownSections.splice(1, 0, `**${durationLong}** Total duration · ${recapEpisodes.length} episode${recapEpisodes.length !== 1 ? "s" : ""}`);
  markdownSections.splice(2, 0, "---");

  const recappedPodcasts = user.podcasts.filter((raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      return podcastIdsWithEpisodes.includes(parsed.id);
    } catch {
      return podcastNamesWithEpisodes.includes(raw);
    }
  });

  const summary = markdownSections.join("\n\n");
  return { summary, dateStr, episodeStats: stats, parsedEpisodes: recapEpisodes, recappedPodcasts };
}

function normalizeBookTitle(title: string): string {
  const base = title.split(/[:\-–]/)[0];
  return base
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function mergeExtractedBooks(
  existingResources: any[],
  extractedBooks: { name: string; type: string; description: string; url: string; author: string | null; context: string }[],
  logPrefix: string = "[BookMerge]"
): any[] {
  const seen = new Set(
    existingResources
      .filter(r => r.type === "book" && typeof r.name === "string" && r.name.trim())
      .map(r => normalizeBookTitle(r.name))
  );

  const merged = [...existingResources];
  for (const book of extractedBooks) {
    if (typeof book.name !== "string" || !book.name.trim()) continue;
    const key = normalizeBookTitle(book.name);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(book);
      console.log(`${logPrefix} Book post-processor caught missed book: "${book.name}" by ${book.author}`);
    }
  }
  return merged;
}

export async function generateKeyInsightsFromRecap(
  recap: string,
  podcastName: string,
  episodeTitle: string,
): Promise<string[]> {
  console.log(`[RecapGenerator] Pass 2: Generating key takeaways from recap for "${episodeTitle}"...`);
  const prompt = `You write the "Key Takeaways" section for a podcast recap site. Each takeaway delivers a concrete fact or insight the reader didn't know before.

Your reader will never listen to this episode. These 4 takeaways are the only thing they'll read. Make each one deliver real knowledge.

Episode: "${episodeTitle}" from ${podcastName}

RECAP:
${recap}

WHAT MAKES A GREAT TAKEAWAY:
- It delivers a SPECIFIC FACT the reader can walk away with. A number, a mechanism, a strategy, a company name, a concrete result.
- It is 2-3 sentences of straight-to-the-point information. No hooks, no setup, no "here's the twist" framing.
- It stands completely alone - no "in this episode" or "the guest explained" framing needed.
- It reads like a briefing note, not a conversation. Professional, direct, informative.

NEVER start a takeaway with a person's name. Lead with the insight, not the attribution.

TONE RULES - CRITICAL:
- Write in a NEUTRAL, INFORMATIVE tone. Like a news brief or research summary.
- NEVER use conversational hooks: "Dude, did you know...", "Here's the thing:", "Here's a twist:", "Imagine...", "Turns out...", "The kicker?", "The takeaway?", "The strategy?", "The result?", "The secret?", "What's wild is..."
- NEVER address the reader with "you" or use rhetorical questions
- NEVER use exclamation marks
- NEVER editorialize with "proving that...", "showing that...", "a reminder that..."

EXAMPLES OF GREAT TAKEAWAYS:
- "Cal AI hit $30M in annual revenue before its founder turned 20, primarily through performance-based influencer marketing rather than traditional ads. The company paid fitness creators per conversion, not per post, which kept customer acquisition costs low while scaling rapidly."
- "Seagrass captures carbon 35 times faster than rainforests, but it's disappearing at a rate of about 7% per year globally due to coastal development and pollution. Ocean-based carbon sequestration may be more impactful than land-based reforestation for climate goals."
- "SailDrone deploys autonomous sailboats that stay at sea for months collecting ocean data for NOAA and the U.S. Navy. The company has mapped more of the ocean floor than any organization in history, covering areas that manned vessels cannot economically reach."

EXAMPLES OF BAD TAKEAWAYS (never write these):
- "Dude, did you know seagrass captures carbon 35 times more effectively than rainforests?" (conversational hook)
- "Here's a twist: while space gets the glamour, ocean defense is the real deal." (hook + editorial)
- "Imagine being 19 and selling your AI app to MyFitnessPal after being rejected by Ivy League schools!" (hook + exclamation)
- "Zach's decision-making secret? He used expected value." (rhetorical question hook)
- "Sound symbolism plays a vital role in brand naming." (vague, no specifics)
- "Zach's journey shows the importance of perseverance." (generic motivational filler)

BANNED WORDS: discusses, explores, highlights, shares, emphasizes, explains, reveals, showcases, illustrates, demonstrates, underscores, stresses, crucial, critical, essential, pivotal, important, innovative, groundbreaking, game-changing, leveraging, revolutionizing
BANNED PHRASES: "Here's a twist", "Here's the thing", "Turns out", "Imagine", "Dude", "The kicker", "The takeaway", "The strategy?", "The secret?", "proving that", "showing that", "a reminder that"

Write exactly 4 takeaways. Respond ONLY with JSON: {"keyInsights": ["takeaway1", "takeaway2", "takeaway3", "takeaway4"]}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2000,
      temperature: 0.4,
      response_format: { type: "json_object" },
    });
    const { logCompletionUsage } = await import("./apiUsageTracker");
    logCompletionUsage(completion, "gpt-4o", "recap_insights");
    const content = completion.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content.trim());
      if (Array.isArray(parsed.keyInsights) && parsed.keyInsights.length === 4) {
        const sanitized = parsed.keyInsights.map((insight: string) => sanitizeInsight(insight));
        console.log(`[RecapGenerator] Pass 2 complete: 4 key takeaways generated from recap`);
        return sanitized;
      }
    }
  } catch (err) {
    console.warn(`[RecapGenerator] Pass 2 failed for "${episodeTitle}", falling back to inline insights:`, err);
  }
  return [];
}

export async function generateRecapFromTranscript(
  transcript: string,
  podcastName: string,
  episodeTitle: string,
  showNotes?: string | null,
): Promise<ParsedEpisode | null> {
  const showNotesSection = showNotes ? `\nShow Notes (use for guest full names, social links, and additional context):\n${showNotes}\n` : "";

  const pass1Prompt = `You are PodRise, an AI that writes comprehensive podcast episode recaps. All content MUST come from the transcript. Use show notes for guest full names.

Podcast: ${podcastName}
Episode: "${episodeTitle}"${showNotesSection}
Transcript:
${transcript}

Respond ONLY with valid JSON (no markdown, no code fences):
{
  "podcastName": "${podcastName}",
  "episodeTitle": "${episodeTitle}",
  "whatHappened": "6-8 paragraphs, each 2-4 sentences. Separate with \\n\\n.",
  "keyInsights": ["insight1", "insight2", "insight3", "insight4"],
  "guests": [{"name": "Full Name", "title": "Title at Company"}],
  "resources": [{"name": "Book Title", "type": "book", "description": "Brief description.", "url": "URL or null", "author": "Author or null", "context": "3-5 sentences on WHO mentioned it, WHY, and what SPECIFIC argument it supported."}]
}

RECAP RULES (whatHappened):
- Give the reader actual knowledge from the episode without needing to listen
- Every paragraph must contain specific ideas, facts, numbers, or insights - not just what topics were discussed
- Start with the most interesting idea, NOT "In this episode..."
- Use speakers' full names. Never say "the guest" or "the host"
- BANNED PHRASES: "In this episode...", "The conversation explores/shifts to...", "The hosts discuss...", "[Person] shares/reveals/explains that..."
- BANNED WORDS: discusses, explores, highlights, shares, emphasizes, delves, leveraging, groundbreaking, game-changing
- No em dashes or smart quotes. Use regular dashes (-) and straight quotes
- BAD: "The conversation shifts to AI, where the guest maps out the landscape."
- GOOD: "The AI landscape looks like a three-way war. OpenAI owns consumers, Anthropic is winning enterprise deals, and Google surged back with Gemini plus distribution through Search, Android, and Gmail."

OTHER RULES:
- keyInsights: 4 standalone insights, each 2-3 sentences with concrete details (numbers, names, mechanisms). Neutral tone, no hooks ("Here's the thing:"), no "you", no exclamation marks
- guests: ALL guests (not hosts), full names only. Empty array if none
- resources: Books only, with 3-5 sentence context starting with speaker's full name. Include Amazon URL if known. No sponsors or SaaS products`;

  console.log(`[RecapGenerator] Pass 1: Generating recap + structured data for "${episodeTitle}"...`);

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const usePrompt = attempt === 1 ? pass1Prompt : pass1Prompt + "\n\nIMPORTANT: Keep your response CONCISE. Limit whatHappened to 4 short paragraphs. Keep guest bios to 1 sentence. The total JSON response must be under 8000 characters.";
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: usePrompt }],
        max_tokens: 16384,
        temperature: 0.7,
        response_format: { type: "json_object" },
      });
      const { logCompletionUsage } = await import("./apiUsageTracker");
      logCompletionUsage(completion, "gpt-4o", "recap_generation");

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        if (attempt < maxAttempts) continue;
        return null;
      }

      let jsonContent = content.trim();
      if (jsonContent.startsWith("```")) {
        jsonContent = jsonContent.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
      }

      const parsed = JSON.parse(jsonContent);
      const resources: any[] = Array.isArray(parsed.resources) ? parsed.resources : [];
      const whatHappened = (parsed.whatHappened || "").replace(/\\n\\n/g, "\n\n").replace(/\\n/g, "\n");
      const keyInsights: string[] = Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [];

      console.log(`[RecapGenerator] Single-pass generation complete for "${episodeTitle}"`);

      function sanitizeText(text: string): string {
        if (!text) return text;
        return text
          .replace(/\u2014/g, " - ")
          .replace(/\u2013/g, "-")
          .replace(/[\u2018\u2019]/g, "'")
          .replace(/[\u201C\u201D]/g, '"');
      }

      function sanitizeDeep(obj: any): any {
        if (typeof obj === "string") return sanitizeText(obj);
        if (Array.isArray(obj)) return obj.map(sanitizeDeep);
        if (obj && typeof obj === "object") {
          const out: any = {};
          for (const [k, v] of Object.entries(obj)) out[k] = sanitizeDeep(v);
          return out;
        }
        return obj;
      }

      return sanitizeDeep({
        podcastName: parsed.podcastName || podcastName,
        episodeTitle: parsed.episodeTitle || episodeTitle,
        whatHappened,
        keyInsights,
        guests: Array.isArray(parsed.guests) ? parsed.guests.filter((g: any) => {
          if (!g.name || !g.name.trim()) return false;
          const nameParts = g.name.trim().split(/\s+/);
          if (nameParts.length < 2) {
            console.log(`[RecapGenerator] Filtered first-name-only guest: "${g.name}"`);
            return false;
          }
          return true;
        }).map((g: any) => ({ name: g.name, title: g.title || "" })) : [],
        resources,
      });
    } catch (err) {
      if (attempt < maxAttempts) {
        console.warn(`[RecapGenerator] Attempt ${attempt} failed for "${episodeTitle}", retrying with concise prompt...`);
        continue;
      }
      console.error(`[RecapGenerator] Failed to generate recap for "${episodeTitle}" after ${maxAttempts} attempts:`, err);
      return null;
    }
  }
  return null;
}

export async function generateRecapFromFullTranscript(
  transcript: string,
  podcastName: string,
  episodeTitle: string,
  showNotes?: string | null,
): Promise<ParsedEpisode | null> {
  const { processFullTranscript } = await import("./transcriptChunker");
  const fullText = (transcript || "").trim();
  if (!fullText) return null;

  const CHUNK_SIZE = 28000;
  const needsChunking = fullText.length > CHUNK_SIZE;

  if (!needsChunking) {
    console.log(`[RecapGenerator] Transcript is ${fullText.length} chars — single-pass (no chunking needed)`);
    return generateRecapFromTranscript(transcript, podcastName, episodeTitle, showNotes);
  }

  console.log(`[RecapGenerator] Full-transcript mode: ${fullText.length} chars for "${episodeTitle}" — chunking...`);

  const notesExtractionPrompt = `You are a meticulous podcast research assistant. Extract ALL noteworthy content from this transcript segment.

Podcast: ${podcastName}
Episode: "${episodeTitle}"

For this segment, extract:
1. KEY FACTS & INSIGHTS: Every specific claim, number, statistic, story, or insight. Include the actual substance - not "they discussed AI" but "GPT-4 costs 10x less than GPT-3 per token and processes images"
2. BOOKS MENTIONED: Books that are genuinely discussed, recommended, or referenced for their content. For each book, extract rich context: WHO mentioned it, WHY they brought it up, and what SPECIFIC argument, story, or claim it supported. CRITICAL: Do NOT extract a book if the speaker is merely using the book's title as a concept or metaphor
3. GUESTS: Anyone introduced as a guest, interviewee, or joining the show - full name and title if mentioned

Respond with JSON:
{
  "notes": ["Specific fact or insight 1", "Specific fact or insight 2", ...],
  "books": [{"title": "Book Title", "author": "Author Name", "context": "3-5 sentences: WHO mentioned it, WHY they brought it up, what SPECIFIC argument or story it supported."}],
  "guests": [{"name": "Full Name", "title": "Their title/role"}]
}

Be EXHAUSTIVE. Include everything noteworthy - it's better to include too much than miss something. Every paragraph of the transcript should yield at least one note.`;

  const { results: chunkNotes, coverage } = await processFullTranscript<any>(
    fullText,
    async (chunk, chunkIndex, totalChunks) => {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: notesExtractionPrompt },
            { role: "user", content: `Extract all noteworthy content from this transcript segment.\n\nSegment ${chunkIndex + 1} of ${totalChunks} (${chunk.length} chars):\n\n${chunk}` }
          ],
          max_tokens: 4096,
          temperature: 0.3,
          response_format: { type: "json_object" },
        });
        const { logCompletionUsage } = await import("./apiUsageTracker");
        logCompletionUsage(completion, "gpt-4o", "recap_chunk_extraction");
        const raw = completion.choices[0]?.message?.content || "{}";
        const parsed = JSON.parse(raw);
        return [parsed];
      } catch (e) {
        console.error(`[RecapGenerator] Notes extraction failed for chunk ${chunkIndex + 1}:`, e);
        return [];
      }
    },
    CHUNK_SIZE
  );

  console.log(`[RecapGenerator] Extracted notes from ${coverage.chunkCount} chunks (${coverage.totalChars} chars, ${coverage.coveragePct}% coverage)`);

  const allNotes: string[] = [];
  const allBooks: any[] = [];
  const allGuests: any[] = [];

  for (const cn of chunkNotes) {
    if (cn.notes) allNotes.push(...cn.notes);
    if (cn.books) allBooks.push(...cn.books);
    if (cn.guests) allGuests.push(...cn.guests);
  }

  console.log(`[RecapGenerator] Merged: ${allNotes.length} notes, ${allBooks.length} books, ${allGuests.length} guests`);

  const showNotesSection = showNotes ? `\nShow Notes:\n${showNotes}\n` : "";

  const synthesisPrompt = `You are PodRise, an AI that writes comprehensive podcast episode recaps. Synthesize the extracted notes into a complete recap.

Podcast: ${podcastName}
Episode: "${episodeTitle}"${showNotesSection}

=== NOTES FROM FULL TRANSCRIPT ===
${allNotes.map((n, i) => `${i + 1}. ${n}`).join("\n")}

=== BOOKS MENTIONED ===
${allBooks.map(b => `- "${b.title}" by ${b.author || "Unknown"}: ${b.context || ""}`).join("\n") || "None"}

=== GUESTS ===
${allGuests.map(g => `- ${g.name}${g.title ? ` (${g.title})` : ""}`).join("\n") || "None"}

Respond ONLY with valid JSON:
{
  "podcastName": "${podcastName}",
  "episodeTitle": "${episodeTitle}",
  "whatHappened": "6-8 paragraphs, each 2-4 sentences. Separate with \\n\\n.",
  "keyInsights": ["insight1", "insight2", "insight3", "insight4"],
  "guests": [{"name": "Full Name", "title": "Title"}],
  "resources": [{"name": "Name", "type": "book", "description": "Brief description.", "url": "URL or null", "author": "Author or null", "context": "3-5 sentences on WHO mentioned it, WHY, and what SPECIFIC argument it supported."}]
}

RECAP RULES (whatHappened):
- Give the reader actual knowledge from the episode without needing to listen
- Every paragraph must contain specific ideas, facts, numbers, or insights - not just what topics were discussed
- Start with the most interesting idea, NOT "In this episode..."
- Use speakers' full names. Never say "the guest" or "the host"
- BANNED PHRASES: "In this episode...", "The conversation explores/shifts to...", "The hosts discuss...", "[Person] shares/reveals/explains that..."
- BANNED WORDS: discusses, explores, highlights, shares, emphasizes, delves, leveraging, groundbreaking, game-changing
- No em dashes or smart quotes. Use regular dashes (-) and straight quotes
- BAD: "The conversation shifts to AI, where the guest maps out the landscape."
- GOOD: "The AI landscape looks like a three-way war. OpenAI owns consumers, Anthropic is winning enterprise deals, and Google surged back with Gemini plus distribution through Search, Android, and Gmail."

OTHER RULES:
- keyInsights: 4 standalone insights, each 2-3 sentences with concrete details (numbers, names, mechanisms). Neutral tone, no hooks ("Here's the thing:"), no "you", no exclamation marks
- guests: ALL guests (not hosts), full names only. Empty array if none
- resources: Books only, with 3-5 sentence context starting with speaker's full name. Include Amazon URL if known`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: synthesisPrompt }],
      max_tokens: 16384,
      temperature: 0.7,
      response_format: { type: "json_object" },
    });
    const { logCompletionUsage } = await import("./apiUsageTracker");
    logCompletionUsage(completion, "gpt-4o", "recap_synthesis");

    const content = completion.choices[0]?.message?.content;
    if (!content) return null;

    let jsonContent = content.trim();
    if (jsonContent.startsWith("```")) {
      jsonContent = jsonContent.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }

    const parsed = JSON.parse(jsonContent);
    const whatHappened = (parsed.whatHappened || "").replace(/\\n\\n/g, "\n\n").replace(/\\n/g, "\n");
    const keyInsights: string[] = Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [];

    function sanitizeText(text: string): string {
      if (!text) return text;
      return text
        .replace(/\u2014/g, " - ")
        .replace(/\u2013/g, "-")
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"');
    }
    function sanitizeDeep(obj: any): any {
      if (typeof obj === "string") return sanitizeText(obj);
      if (Array.isArray(obj)) return obj.map(sanitizeDeep);
      if (obj && typeof obj === "object") {
        const out: any = {};
        for (const [k, v] of Object.entries(obj)) out[k] = sanitizeDeep(v);
        return out;
      }
      return obj;
    }

    console.log(`[RecapGenerator] Full-transcript recap complete for "${episodeTitle}" (${coverage.chunkCount} chunks, ${coverage.totalChars} chars)`);

    return sanitizeDeep({
      podcastName: parsed.podcastName || podcastName,
      episodeTitle: parsed.episodeTitle || episodeTitle,
      whatHappened,
      keyInsights,
      guests: Array.isArray(parsed.guests) ? parsed.guests.filter((g: any) => {
          if (!g.name || !g.name.trim()) return false;
          const nameParts = g.name.trim().split(/\s+/);
          if (nameParts.length < 2) {
            console.log(`[RecapGenerator] Filtered first-name-only guest: "${g.name}"`);
            return false;
          }
          return true;
        }).map((g: any) => ({ name: g.name, title: g.title || "" })) : [],
      resources: Array.isArray(parsed.resources) ? parsed.resources : [],
    });
  } catch (err) {
    console.error(`[RecapGenerator] Full-transcript synthesis failed for "${episodeTitle}":`, err);
    return null;
  }
}

export async function extractBooksFromTranscript(
  transcript: string,
  podcastName: string,
  episodeTitle: string,
): Promise<{ name: string; type: string; description: string; url: string; author: string | null; context: string }[]> {
  const prompt = `You are a book extraction specialist. Your ONLY job is to find every book mentioned, recommended, quoted, referenced, or discussed in this podcast transcript.

Podcast: ${podcastName}
Episode: "${episodeTitle}"

Transcript:
${transcript}

Find books that are GENUINELY discussed, recommended, or referenced for their content:
- Books explicitly recommended ("you should read...", "I loved this book...")
- Books quoted or referenced ("as [author] wrote in [book]...")
- Books discussed at length or briefly for their actual content/thesis
- Books mentioned in passing but clearly referring to the actual book ("that reminds me of [book]...")

CRITICAL: Do NOT extract a book if the speaker is merely using the book's title as a common word, concept, metaphor, or adjective. Examples:
- "you need grit to succeed" = using "grit" as a common word, NOT a reference to Angela Duckworth's book
- "have more range in your skills" = using "range" as a common word, NOT a reference to David Epstein's book
- "that takes mastery" = using "mastery" as a common word, NOT a reference to Robert Greene's book
ONLY extract when the speaker specifically references the book itself, its author, or its thesis/content

For each book, provide:
- name: The exact book title
- author: The author's full name (look it up if you know it, even if the transcript only gives a last name)
- description: A 1-sentence description of what the book is about
- context: 3-5 sentences of RICH, EPISODE-SPECIFIC context. This is the most important field. You MUST answer: WHO mentioned this book? WHY did they bring it up? What SPECIFIC argument, story, or point did it support? Include concrete details from the conversation - names, numbers, anecdotes, the actual claim being made. Write as if explaining to a friend why this book came up. BAD: "Mentioned as a recommended read on building habits." BAD: "James Clear's book on habit formation." GOOD: "Sam Parr brought this up when discussing how he restructured his morning routine after selling The Hustle. He said Atomic Habits changed his approach to productivity - instead of setting big goals, he started focusing on 1% daily improvements. Shaan pushed back saying the book oversimplifies willpower, but Sam argued the identity-based habit framework was the single most useful idea he'd encountered in any business book."
- url: An Amazon direct product URL in format https://www.amazon.com/dp/ASIN if you know the ASIN, otherwise https://www.amazon.com/s?k=Book+Title+Author+Name

Respond ONLY with a valid JSON object:
{
  "books": [
    {"name": "Book Title", "type": "book", "description": "Brief description.", "url": "https://www.amazon.com/dp/ASIN", "author": "Author Name", "context": "3-5 sentences of rich episode-specific context."}
  ]
}

RULES:
- Include books that are genuinely discussed or referenced for their content
- Do NOT extract books where the title is used as a common word/concept/adjective rather than a reference to the actual book
- Do NOT include podcasts, newsletters, websites, apps, SaaS products, or abstract concepts
- Do NOT fabricate books that weren't mentioned in the transcript
- If no books are mentioned, return {"books": []}
- Try to find the correct Amazon ASIN for well-known books
- The context field MUST include who said it, why they brought it up, and what specific point it supported. Generic descriptions are a SERIOUS error`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 8192,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });
    const { logCompletionUsage } = await import("./apiUsageTracker");
    logCompletionUsage(completion, "gpt-4o", "recap_book_extraction");

    const content = completion.choices[0]?.message?.content;
    if (!content) return [];

    let jsonContent = content.trim();
    if (jsonContent.startsWith("```")) {
      jsonContent = jsonContent.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }

    const parsed = JSON.parse(jsonContent);
    return Array.isArray(parsed.books) ? parsed.books : [];
  } catch (err) {
    console.error(`[BookExtractor] Failed for "${episodeTitle}":`, err);
    return [];
  }
}

export interface RecapQAIssue {
  field: string;
  severity: "critical" | "warning";
  message: string;
}

export function validateRecap(
  recap: Partial<ParsedEpisode>,
  episodeTitle: string,
  quoteCount: number,
): { passed: boolean; issues: RecapQAIssue[] } {
  const issues: RecapQAIssue[] = [];

  if (!recap.whatHappened || recap.whatHappened.length < 200) {
    issues.push({ field: "whatHappened", severity: "critical", message: `whatHappened too short (${recap.whatHappened?.length || 0} chars, need 200+)` });
  }

  if (!recap.keyInsights || recap.keyInsights.length < 3) {
    issues.push({ field: "keyInsights", severity: "critical", message: `Only ${recap.keyInsights?.length || 0} key insights (need 3+)` });
  }

  const guestPattern = /\|\s*([A-Z][a-z]+ [A-Z][a-z]+)|ft\.?\s+([A-Z][a-z]+ [A-Z])|[-:]\s*([A-Z][a-z]+ [A-Z][a-z]+)\s*$/;
  if (guestPattern.test(episodeTitle) && (!recap.guests || recap.guests.length === 0)) {
    issues.push({ field: "guests", severity: "warning", message: `Episode title suggests guest but none extracted: "${episodeTitle}"` });
  }

  const allText = JSON.stringify(recap);
  if (/\u2014/.test(allText)) {
    issues.push({ field: "sanitization", severity: "warning", message: "Em dashes found in content" });
  }
  if (/[\u2018\u2019\u201C\u201D]/.test(allText)) {
    issues.push({ field: "sanitization", severity: "warning", message: "Smart quotes found in content" });
  }

  const criticalCount = issues.filter(i => i.severity === "critical").length;
  return { passed: criticalCount === 0, issues };
}

export async function extractQuotesFromTranscript(
  transcript: string,
  podcastName: string,
  episodeTitle: string,
  hosts?: string | null,
  guests?: string | null,
): Promise<ExtractedQuote[]> {
  const hostsInfo = hosts ? `\nKnown hosts: ${hosts}` : "";
  let guestInfo = "";
  if (guests) {
    try {
      const parsed = JSON.parse(guests);
      if (Array.isArray(parsed) && parsed.length > 0) {
        guestInfo = "\nKnown guests: " + parsed.map((g: any) => `${g.name}${g.title ? ` (${g.title})` : ""}`).join(", ");
      }
    } catch {}
  }

  const prompt = `You are an editorial quote curator for PodRise, a podcast intelligence platform. Extract the most shareable, culturally relevant quotes from this transcript.

Podcast: ${podcastName}
Episode: "${episodeTitle}"${hostsInfo}${guestInfo}

Transcript:
${transcript}

EXTRACTION RULES:
- Always prefer quotes from GUESTS over the host. Include host quotes only if genuinely exceptional.
- QUALITY GATE: Each quote must be AT LEAST 15 words long and contain a specific claim, opinion, number, or insight. If the line could be said in ANY conversation about ANY topic, it is NOT worth extracting.
- Prioritize: contrarian/spicy takes, tweetable self-contained lines, specific opinions and predictions, memorable phrasing, lines with concrete numbers or facts.
- SKIP: generic motivational filler, conversational reactions ("That's amazing", "I'm impressed"), compliments between speakers ("Your biggest skill is your audacity"), factual statements with no opinion, rambling passages.
- Pull 3 to 5 quotes. One MUST be the clear hero quote. At least one must be a hot take or prediction.
- Quotes MUST be verbatim from the transcript. Do NOT clean up, edit, or rephrase.

BAD QUOTES (never extract these):
- "I think your biggest skill is your audacity." (compliment between speakers, no insight)
- "I'm impressed with your decision making." (reaction, not content)
- "I think the CEO job is the loneliest job in America." (vague, no specifics)
- "That's really interesting." (filler)

GOOD QUOTES (these have substance worth sharing):
- "Six out of ten people would choose a completely different career if they could start over. Six out of ten. That number floored me."
- "We did $30 million in revenue before I turned 20, and the entire playbook was paying fitness influencers per result, not per post."
- "The only thing he looks for when hiring is insane determinism. Not intelligence, not credentials - just the refusal to accept that something can't be done."

SPEAKER IDENTIFICATION:
- "Unknown" is NEVER acceptable as a speakerName. You MUST identify every speaker.
- Use context clues: the episode title often names the guest, introductions at the start of the episode identify speakers, the speaking style and expertise help distinguish host from guest.
- If the episode title mentions a person by name (e.g. "Bill Gurley: ..."), most substantive quotes likely come from that person.
- Any speaker who is not a known host is the guest. Use the guest's full name and actual title.

Respond ONLY with a valid JSON object (no markdown, no code fences):

{
  "quotes": [
    {
      "speakerName": "Full Name",
      "speakerRole": "Their title or role (e.g. CEO of Acme, Investor, Host of Pod)",
      "quoteText": "The verbatim quote from the transcript",
      "context": "One-line context setter (e.g. On why he thinks most startup advice is wrong)",
      "quoteType": "Hero Quote"
    }
  ]
}

QUOTE TYPES (use exactly one per quote):
- "Hero Quote" - The single best, most powerful line from the episode
- "Hot Take" - A contrarian or provocative opinion
- "Prediction" - A forward-looking claim about what will happen
- "Spicy" - An edgy or surprising statement
- "Tweetable" - A clean, self-contained line perfect for sharing

RULES:
- Return 3-5 quotes total
- Exactly ONE must be "Hero Quote"
- At least ONE must be "Hot Take" or "Prediction"
- quoteText must be VERBATIM from transcript
- context must be a short phrase starting with "On..." (e.g. "On why AI will replace managers")
- speakerRole should be specific (not just "Guest" or "Episode Host" - use their actual title)
- Do NOT use em dashes in any output - use hyphens, commas, or rephrase instead`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4096,
      temperature: 0.7,
      response_format: { type: "json_object" },
    });
    const { logCompletionUsage } = await import("./apiUsageTracker");
    logCompletionUsage(completion, "gpt-4o", "recap_quote_extraction");

    const content = completion.choices[0]?.message?.content;
    if (!content) return [];

    let jsonContent = content.trim();
    if (jsonContent.startsWith("```")) {
      jsonContent = jsonContent.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }

    const parsed = JSON.parse(jsonContent);
    const quotes = Array.isArray(parsed.quotes) ? parsed.quotes : [];
    return quotes.filter((q: any) => q.speakerName && q.quoteText && q.context && q.quoteType);
  } catch (err) {
    console.error(`[QuoteExtractor] Failed for "${episodeTitle}":`, err);
    return [];
  }
}

