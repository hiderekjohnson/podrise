import { storage } from "./storage";
import { openai } from "./replit_integrations/image/client";
import { ITUNES_ID_TO_SLUG } from "./podcastLandingMap";
import { pool } from "./db";
import { TOPICS } from "../client/src/data/topicData";

const CURATED_TOPIC_SLUGS = TOPICS.map(t => t.slug);

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

export interface ExtractedProduct {
  name: string;
  company: string;
  description: string;
  purchaseUrl: string;
  context: string;
  mentionType: "recommendation" | "personal_use";
  category: "physical_product" | "service_or_tool" | "experience";
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
  tldl: string;
  whatHappened: string;
  keyInsights: string[];
  quote?: string;
  quoteAttribution?: string;
  keyTopics?: string[];
  topicContexts?: Record<string, string>;
  sponsors?: { name: string; description: string; couponCode?: string; url?: string; howToRedeem?: string }[];
  guests?: { name: string; title: string; bio: string; twitter?: string; linkedin?: string; instagram?: string; website?: string; photoUrl?: string; topicsDiscussed: string[] }[];
  resources?: { name: string; type: string; description: string; url?: string; author?: string; context?: string }[];
  products?: ExtractedProduct[];
  extractedQuotes?: ExtractedQuote[];
}

interface RecapResult {
  summary: string;
  dateStr: string;
  episodeStats: EpisodeStats;
  parsedEpisodes: ParsedEpisode[];
  recappedPodcasts: string[];
}

type RecapMode = "yesterday" | "latest";

function buildSpotifySearchUrl(podcastName: string, episodeTitle: string): string {
  const query = encodeURIComponent(`${podcastName} ${episodeTitle}`);
  return `https://open.spotify.com/search/${query}`;
}

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
          const spotifySearchUrl = buildSpotifySearchUrl(podcast.name, ep.trackName || "");
          if (appleUrl) episodeLinks.set(metaKey, appleUrl);
          if (spotifySearchUrl) episodeSpotifyLinks.set(metaKey, spotifySearchUrl);
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
      const recapPageUrl = `https://podcap.io/podcasts/${podSlug}/${recapSlug}`;

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
      temperature: 0.7,
      response_format: { type: "json_object" },
    });
    const content = completion.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content.trim());
      if (Array.isArray(parsed.keyInsights) && parsed.keyInsights.length === 4) {
        console.log(`[RecapGenerator] Pass 2 complete: 4 key takeaways generated from recap`);
        return parsed.keyInsights;
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

  const pass1Prompt = `You are PodCap, an AI that writes comprehensive podcast episode recaps. Generate a complete recap for this episode.

All facts, quotes, and insights MUST come directly from the provided transcript. NEVER fabricate content. Use the show notes to find guest full names, social media handles, and links.

Podcast: ${podcastName}
Episode: "${episodeTitle}"${showNotesSection}
Transcript:
${transcript}

Respond ONLY with a valid JSON object (no markdown, no code fences):

{
  "podcastName": "${podcastName}",
  "episodeTitle": "${episodeTitle}",
  "tldl": "2-3 sentence summary of the core thesis.",
  "whatHappened": "The episode recap. 6-8 paragraphs, each 2-4 sentences. Separate paragraphs with \\n\\n.",
  "quote": "The single most surprising, counterintuitive, or shareable line from the transcript. Something that makes you stop scrolling.",
  "quoteAttribution": "Speaker Name",
  "keyTopics": ["Topic 1", "Topic 2", "Topic 3", "Topic 4", "Topic 5"],
  "topicContexts": {"ai": "Episode-specific description of how AI was covered...", "startups": "Episode-specific description of how startups were covered..."},
  "sponsors": [
    {"name": "Sponsor Name", "description": "What the sponsor does.", "couponCode": "CODE or null", "url": "https://sponsor.com or null", "howToRedeem": "How to use the offer or null"}
  ],
  "guests": [
    {"name": "Full Name", "title": "Professional Title / Position at Company", "bio": "2-3 sentence bio based on how they are introduced or described in the transcript.", "twitter": "@handle or null", "linkedin": "https://linkedin.com/in/handle or null", "instagram": "@handle or null", "website": "https://their-site.com or null", "topicsDiscussed": ["Topic 1", "Topic 2"]}
  ],
  "keyInsights": ["insight1", "insight2", "insight3", "insight4"],
  "resources": [
    {"name": "Resource Name", "type": "book|tool|product", "description": "Brief description of the item.", "url": "URL if mentioned or null", "author": "Author/creator if known or null", "context": "3-5 sentences: WHO mentioned it, WHY they brought it up, what SPECIFIC argument or story it supported."}
  ],
  "products": [
    {"name": "Specific Product Name", "company": "Brand/Company", "description": "1 sentence what it is", "purchaseUrl": "best URL to buy or null", "context": "3-5 sentence editorial summary of why they use/recommend it", "mentionType": "recommendation|personal_use", "category": "physical_product|service_or_tool|experience"}
  ],
  "extractedQuotes": [
    {"speakerName": "Full Name", "speakerRole": "Their title (e.g. CEO of Acme)", "quoteText": "Verbatim quote from transcript", "context": "On why...", "quoteType": "Hero Quote|Hot Take|Prediction|Spicy|Tweetable"}
  ]
}

RULES FOR whatHappened (THE RECAP):
- The recap has one job: give the reader the actual knowledge from the episode without them needing to listen
- Write like a well-informed friend walking you through the best parts of the conversation
- Every paragraph must contain at least one specific idea, fact, number, or insight
- If a paragraph only describes what was talked about without saying what was actually said, delete it and rewrite with the real content
- Start with the most interesting idea, NOT with "In this episode of [show name]..."
- 6-8 paragraphs, each 2-4 sentences, flowing naturally from one idea to the next
- BANNED PHRASES: "In this episode...", "The conversation explores/shifts/turns to...", "The hosts discuss/touch on/delve into...", "The discussion shifts to...", "They also highlight/emphasize/underscore...", "The episode wraps up with...", "Ultimately, the episode...", "The duo reflects on...", "Later, the group...", "A memorable segment explores...", "[Person] shares/reveals/explains that...", "broader themes like...", "actionable insights on..."
- BANNED WORDS: discusses, explores, highlights, shares, emphasizes, explains, underscores, delves, touches on, reflects on, recounts, acknowledges, showcases, illustrates, demonstrates, stresses, leveraging, revolutionizing, pioneering, groundbreaking, innovative, game-changing
- BANNED CHARACTERS: Never use em dashes (\u2014). Use regular dashes (-) instead. Never use curly/smart quotes (\u2018 \u2019 \u201C \u201D). Use straight quotes (' ") instead
- BAD PARAGRAPH: "The conversation shifts to AI, where the guest maps out the landscape. He identifies key players like OpenAI, Anthropic, and Google, analyzing their strategies."
- GOOD PARAGRAPH: "The AI landscape right now looks like a three-way war. OpenAI owns consumers - ChatGPT has become the default for most people - while Anthropic is quietly winning enterprise deals. Google, which looked dead six months ago, has surged back with Gemini and has one massive advantage nobody else can match: distribution through Search, Android, and Gmail reaching billions of users daily."

OTHER RULES:
- All core fields required: tldl, whatHappened (6-8 paragraphs), quote, quoteAttribution, keyTopics (4-6), keyInsights (exactly 4), extractedQuotes (3-5), resources (search the ENTIRE transcript for every book mentioned)
- BOOKS ARE CRITICAL: Before writing resources, scan the FULL transcript for genuine book references. Include books that are discussed, recommended, or referenced for their content. IMPORTANT: Do NOT extract a book if the speaker merely uses the book title as a concept, metaphor, or adjective (e.g., "you need grit" is NOT a reference to Angela Duckworth's book "Grit"; "have more range" is NOT a reference to David Epstein's "Range"). Only extract when the actual book, its author, or its thesis/content is specifically discussed
- quote: Find the single most SHAREABLE line from the transcript. Look for something surprising, counterintuitive, provocative, funny, or profound - the kind of line someone would screenshot and post. It MUST be verbatim from the transcript. Prefer lines with a strong point of view, a vivid metaphor, or a surprising claim. Avoid generic motivational statements like "believe in yourself" or "hard work pays off." The quote should make someone curious about the episode. BAD: "I think self-belief has gotten me so far." GOOD: "Six out of ten people would choose a completely different career if they could start over. Six out of ten." quoteAttribution should be just the speaker's name (e.g. "Bill Gurley"), not "Speaker Name on topic"
- keyInsights: Exactly 4 standalone insights. Each must teach the reader something specific they did not know. 2-3 tight sentences of straight-to-the-point information. Include concrete details (a name, a number, a company, a mechanism). NEVER start with a person's name. Write in a NEUTRAL, INFORMATIVE tone like a news brief. NEVER use conversational hooks ("Dude, did you know...", "Here's the thing:", "Here's a twist:", "Imagine...", "Turns out..."). NEVER address the reader with "you" or rhetorical questions. NEVER use exclamation marks. NEVER editorialize with "proving that...", "showing that...", "a reminder that...". BANNED WORDS: discusses, explores, highlights, shares, emphasizes, explains, points out, leveraging, revolutionizing, pioneering, groundbreaking, innovative, game-changing. BANNED PATTERNS: "[Person] [verb] [topic]", "The importance of X". BANNED PHRASES: "Here's a twist", "Here's the thing", "Turns out", "Imagine", "Dude", "The kicker", "proving that", "showing that", "a reminder that". BAD: "Dude, did you know a $500,000 ad with Mr. Beast initially tanked?" BAD: "Here's a twist: ocean defense is the real deal." BAD: "Imagine being 19 and selling your AI app!" GOOD: "AI acts as a multiplier for curious, proactive people and a threat to passive ones. The gap between those two groups is going to widen quickly, and which side you land on is largely a choice." GOOD: "Cal AI hit $30M in annual revenue before its founder turned 20, primarily by paying fitness influencers for performance-based posts rather than traditional ads. The playbook was simple - find creators whose audiences already want what you sell, and pay per result, not per post."
- extractedQuotes: 3-5 verbatim quotes from the transcript. QUALITY GATE: Each quote must be AT LEAST 15 words long and contain a specific claim, opinion, number, or insight. If it could be said in any conversation about any topic, it is NOT a quote worth extracting.
  SPEAKER IDENTIFICATION IS MANDATORY: "Unknown" is NEVER acceptable as a speakerName. Use context clues: who was just introduced, who is the guest vs host, who has the expertise being discussed, whose perspective is being shared. The podcast hosts are mentioned in the episode metadata - any non-host speaker is likely the guest. If the episode title names a person, most quotes likely come from them.
  Prefer GUESTS over hosts. Exactly ONE must be quoteType "Hero Quote". At least ONE must be "Hot Take" or "Prediction". Other types: "Spicy", "Tweetable". quoteText MUST be verbatim from transcript. context must be a short phrase starting with "On..." (e.g. "On why AI will replace managers"). speakerRole must be specific (not just "Guest" or "Episode Host" - use their actual title like "CEO of Acme" or "Venture Capitalist").
  BAD QUOTES (never extract these - they are conversational filler, NOT shareable):
    - "I think your biggest skill is your audacity." (compliment, not insight)
    - "I'm impressed with your decision making." (reaction, not content)
    - "That's really interesting." (filler)
    - "I think the CEO job is the loneliest job in America." (vague, no specifics)
  GOOD QUOTES (these have substance, specifics, and a point of view):
    - "Six out of ten people would choose a completely different career if they could start over. Six out of ten. That number floored me."
    - "We did $30 million in revenue before I turned 20, and the entire playbook was paying fitness influencers per result, not per post."
    - "The only thing Jeff Bezos looks for when hiring is insane determinism. Not intelligence, not credentials - just the refusal to accept that something can't be done."
- keyTopics: 4-6 specific phrases that read like search queries. Include the specific company, person, or concept name. BAD: "Engineering in sports", "Financial dynamics of racing". GOOD: "Liberty Media acquisition of F1", "Formula 1 engineering competition". Always be specific - never generic
- topicContexts: DO NOT create slugs from keyTopics. Instead, identify which of these predefined broad categories apply to this episode, and write a 1-2 sentence episode-specific description for each relevant one. ONLY use these exact slugs as keys: ${CURATED_TOPIC_SLUGS.map(s => `"${s}"`).join(", ")}. Only include categories that are genuinely discussed in the episode (typically 3-6). Reference specific points, people, or perspectives from this episode. Write like a sharp analyst, not generic marketing copy
- sponsors: Extract ALL sponsors/advertisers. Include coupon codes and URLs when mentioned. Return empty array [] if none
- guests: Extract ALL guests (NOT regular hosts). CRITICAL: Use FULL NAME (first AND last). Search the entire transcript for last names. A guest is anyone who is interviewed, joins the conversation, or is introduced on the show - even if they only appear briefly. Look for introductions like "joining us", "our guest", "we have", "[Name] is here", or any person who speaks who is not a regular host. If the episode title mentions a person by name or title (e.g. "$450M VC", "$100B Founder"), that person is almost certainly a guest - find their full name. Return empty array [] ONLY if the episode truly has no guests (e.g. hosts-only discussion episodes)
- products: Extract GENUINE personal endorsements of products, services, tools, apps, experiences — NOT sponsors/ads. The speaker must have personal experience ("I use this", "I bought one", "Game changer for me"). SKIP anything near "sponsored by", "use code", "promo code", "brought to you by", "quick break". SKIP books (tracked in resources), stocks/crypto, social media platforms, generic categories without brand names. 0-5 items per episode is normal. Context must be 3-5 sentences summarizing WHY they use/recommend it, what problem it solves, and what makes it stand out - written as an editorial summary, NOT a raw transcript pull. BAD context: "Yeah, yeah. My friend's got a very, very interesting startup called Wild Type, which is like sustainable sushi grade salmon." (raw transcript). GOOD context: "Wild Type produces lab-grown sushi-grade salmon that eliminates the need for traditional fishing or farming. The hosts were drawn to it as a solution to overfishing and ocean ecosystem damage, noting that cultivated seafood could let people enjoy sushi without the environmental cost. The company's first product is already being served at select restaurants."
- resources: Extract ALL books mentioned - even briefly. Include full title and author name. THE CONTEXT FIELD IS THE MOST IMPORTANT PART OF EVERY BOOK ENTRY. Each context MUST be 3-5 sentences of RICH, EPISODE-SPECIFIC detail. MINIMUM 3 full sentences per book - one-sentence contexts are a SERIOUS ERROR. It must answer: (1) WHO specifically mentioned this book (full name), (2) WHY they brought it up - what argument they were making, (3) What SPECIFIC story, anecdote, statistic, or claim from the book they referenced.
  NEVER start context with "Referenced to...", "Mentioned as...", "Discussed in the context of...", "Highlighted as...", "Brought up to...". ALWAYS start with a speaker's full name.
  BAD context (too short, generic): "Mentioned as a recommended read."
  BAD context (1 sentence, vague): "James Clear's concept was referenced to emphasize the importance of systems."
  BAD context (no speaker, passive voice): "Discussed in the context of its original emphasis on perseverance, with a shift to highlight the importance of passion in achieving success."
  GOOD context (3 sentences, specific, named speaker): "Bill Gurley brings up 'Grit' to challenge its central thesis. While Angela Duckworth argues that grit is the key to success, Gurley points out that perseverance without genuine passion leads to burnout and career regret. He connects this to his research showing six out of ten people would choose a different career, arguing that many grind through jobs they hate because they were told perseverance alone would pay off."
  GOOD context: "Morgan Housel frames James Clear not merely as an author but as an entrepreneur who treats his books as products. This perspective shifts the conversation from traditional writing to the strategic elements of launching and marketing a book. Housel admires Clear's scientific thinking in structuring Atomic Habits, emphasizing how Clear meticulously crafted the table of contents."
  Do NOT include sponsors, SaaS products, or abstract concepts. Return empty array [] if none`;

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

      const rawProducts = Array.isArray(parsed.products) ? parsed.products : [];
      const validProducts: ExtractedProduct[] = [];
      const seenNames = new Set<string>();
      for (const p of rawProducts) {
        if (!p.name || typeof p.name !== "string") continue;
        const key = p.name.toLowerCase().trim();
        if (seenNames.has(key)) continue;
        seenNames.add(key);
        const validCategories = ["physical_product", "service_or_tool", "experience"];
        const validMentionTypes = ["recommendation", "personal_use"];
        validProducts.push({
          name: p.name,
          company: p.company || "",
          description: p.description || "",
          purchaseUrl: p.purchaseUrl || "",
          context: p.context || "",
          mentionType: validMentionTypes.includes(p.mentionType) ? p.mentionType : "personal_use",
          category: validCategories.includes(p.category) ? p.category : "service_or_tool",
        });
      }

      const rawQuotes = Array.isArray(parsed.extractedQuotes) ? parsed.extractedQuotes : [];
      const guestNames = Array.isArray(parsed.guests) ? parsed.guests.map((g: any) => g.name).filter(Boolean) : [];
      const validQuotes: ExtractedQuote[] = rawQuotes
        .filter((q: any) => q.speakerName && q.quoteText && q.context && q.quoteType)
        .filter((q: any) => {
          const wordCount = q.quoteText.trim().split(/\s+/).length;
          if (wordCount < 12) {
            console.log(`[RecapGenerator] Filtered short quote (${wordCount} words): "${q.quoteText.slice(0, 60)}..."`);
            return false;
          }
          return true;
        })
        .map((q: any) => {
          let name = q.speakerName;
          let role = q.speakerRole || "";
          if (name === "Unknown" || name === "Episode Host" || name === "Host") {
            if (guestNames.length === 1) {
              name = guestNames[0];
              role = parsed.guests[0]?.title || role;
              console.log(`[RecapGenerator] Fixed "Unknown" speaker -> "${name}"`);
            }
          }
          return { speakerName: name, speakerRole: role, quoteText: q.quoteText, context: q.context, quoteType: q.quoteType };
        })
        .filter((q: ExtractedQuote) => q.speakerName !== "Unknown");

      const pass2Insights = await generateKeyInsightsFromRecap(whatHappened, podcastName, episodeTitle);
      const finalInsights = pass2Insights.length === 4 ? pass2Insights : keyInsights;

      return sanitizeDeep({
        podcastName: parsed.podcastName || podcastName,
        episodeTitle: parsed.episodeTitle || episodeTitle,
        tldl: parsed.tldl || "",
        whatHappened,
        keyInsights: finalInsights,
        quote: parsed.quote,
        quoteAttribution: parsed.quoteAttribution,
        keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : [],
        topicContexts: parsed.topicContexts && typeof parsed.topicContexts === "object" ? parsed.topicContexts : {},
        sponsors: Array.isArray(parsed.sponsors) ? parsed.sponsors : [],
        guests: Array.isArray(parsed.guests) ? parsed.guests : [],
        resources,
        products: validProducts,
        extractedQuotes: validQuotes,
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
1. KEY FACTS & INSIGHTS: Every specific claim, number, statistic, story, or insight. Include the actual substance — not "they discussed AI" but "GPT-4 costs 10x less than GPT-3 per token and processes images"
2. BEST QUOTES: Memorable, surprising, or shareable lines — copy them VERBATIM with speaker attribution (use full name, NEVER "Unknown"). Each quote must be at least 15 words and contain a specific claim, opinion, number, or insight. SKIP conversational filler like "That's amazing", compliments like "Your biggest skill is your audacity", and reactions like "I'm impressed". If the episode title names a person, that person is likely the guest — attribute their quotes to them by name
3. BOOKS MENTIONED: Books that are genuinely discussed, recommended, or referenced for their content. For each book, extract rich context: WHO mentioned it, WHY they brought it up, and what SPECIFIC argument, story, or claim it supported. CRITICAL: Do NOT extract a book if the speaker is merely using the book's title as a concept, metaphor, or adjective rather than actually talking about the book itself. For example, if someone says "you need grit to succeed" they are using the word "grit" as a concept, NOT recommending Angela Duckworth's book. Only extract it if they specifically reference the book, the author, or the book's content/thesis
4. GUESTS: Anyone introduced as a guest, interviewee, or joining the show — full name and title if mentioned
5. SPONSORS: Any ad reads, sponsor mentions, coupon codes, or "brought to you by" segments
6. RESOURCES: Tools, products, services, websites, companies discussed substantively (not just name-dropped)
7. GENUINE PRODUCT ENDORSEMENTS: Products, services, tools, apps, or experiences that hosts/guests genuinely endorse from personal experience (NOT sponsors/ads)

PRODUCT ENDORSEMENT RULES:
- ONLY extract products where the speaker has PERSONAL EXPERIENCE: "I use this", "I bought one", "We use this at our company", "Game changer for me"
- NEVER extract items that are clearly ads/sponsors — look for phrases like "this episode is sponsored by", "use code", "promo code", "brought to you by", "quick word from our sponsor", "let's take a quick break", "special offer", "free trial"
- NEVER extract books (tracked separately), stocks/ETFs/crypto, social media platforms, or companies discussed only as business cases
- NEVER extract generic categories without specific brand names ("standing desks" vs "FlexiSpot standing desk")
- The context field must be 3-5 sentences summarizing WHY they use/recommend it, what problem it solves, and what makes it stand out. Write as an editorial summary, NOT a raw transcript pull. Do not copy verbatim transcript text - rewrite it cleanly.
- Categories: "physical_product" (tangible items), "service_or_tool" (digital/SaaS/apps), "experience" (places, events, memberships)
- 0-5 genuine products per segment is normal. Many segments will have ZERO — that's fine.

Respond with JSON:
{
  "notes": ["Specific fact or insight 1", "Specific fact or insight 2", ...],
  "quotes": [{"text": "Verbatim quote", "speaker": "Name"}],
  "books": [{"title": "Book Title", "author": "Author Name", "context": "3-5 sentences: WHO mentioned it, WHY they brought it up, what SPECIFIC argument or story it supported. Include concrete details from the conversation."}],
  "guests": [{"name": "Full Name", "title": "Their title/role"}],
  "sponsors": [{"name": "Sponsor", "description": "What they do", "code": "COUPON or null", "url": "url or null"}],
  "resources": [{"name": "Resource Name", "type": "tool|product|website", "description": "What it is", "url": "url or null", "context": "How it was mentioned"}],
  "products": [{"name": "Specific Product Name", "company": "Brand/Company", "description": "1 sentence what it is", "purchaseUrl": "best URL to buy or null", "context": "3-5 sentence editorial summary of why they use/recommend it", "mentionType": "recommendation|personal_use", "category": "physical_product|service_or_tool|experience"}]
}

Be EXHAUSTIVE. Include everything noteworthy — it's better to include too much than miss something. Every paragraph of the transcript should yield at least one note.`;

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
  const allQuotes: any[] = [];
  const allBooks: any[] = [];
  const allGuests: any[] = [];
  const allSponsors: any[] = [];
  const allResources: any[] = [];
  const allProducts: ExtractedProduct[] = [];

  for (const cn of chunkNotes) {
    if (cn.notes) allNotes.push(...cn.notes);
    if (cn.quotes) allQuotes.push(...cn.quotes);
    if (cn.books) allBooks.push(...cn.books);
    if (cn.guests) allGuests.push(...cn.guests);
    if (cn.sponsors) allSponsors.push(...cn.sponsors);
    if (cn.resources) allResources.push(...cn.resources);
    if (cn.products && Array.isArray(cn.products)) {
      for (const p of cn.products) {
        if (p.name && typeof p.name === "string") {
          const validCategories = ["physical_product", "service_or_tool", "experience"];
          const validMentionTypes = ["recommendation", "personal_use"];
          allProducts.push({
            name: p.name,
            company: p.company || "",
            description: p.description || "",
            purchaseUrl: p.purchaseUrl || "",
            context: p.context || "",
            mentionType: validMentionTypes.includes(p.mentionType) ? p.mentionType : "personal_use",
            category: validCategories.includes(p.category) ? p.category : "service_or_tool",
          });
        }
      }
    }
  }

  const dedupedProducts: ExtractedProduct[] = [];
  const seenProductNames = new Set<string>();
  for (const p of allProducts) {
    const key = p.name.toLowerCase().trim();
    if (!seenProductNames.has(key)) {
      seenProductNames.add(key);
      dedupedProducts.push(p);
    }
  }

  console.log(`[RecapGenerator] Merged: ${allNotes.length} notes, ${allQuotes.length} quotes, ${allBooks.length} books, ${allGuests.length} guests, ${allSponsors.length} sponsors, ${dedupedProducts.length} products`);

  const showNotesSection = showNotes ? `\nShow Notes:\n${showNotes}\n` : "";

  const synthesisPrompt = `You are PodCap, an AI that writes comprehensive podcast episode recaps. You have been given EXHAUSTIVE NOTES extracted from the FULL transcript of this episode (every word was read). Now synthesize them into a complete, high-quality recap.

Podcast: ${podcastName}
Episode: "${episodeTitle}"${showNotesSection}

=== EXTRACTED NOTES FROM FULL TRANSCRIPT ===
${allNotes.map((n, i) => `${i + 1}. ${n}`).join("\n")}

=== BEST QUOTES ===
${allQuotes.map(q => `"${q.text}" - ${q.speaker}`).join("\n") || "None extracted"}

=== BOOKS MENTIONED ===
${allBooks.map(b => `- "${b.title}" by ${b.author || "Unknown"}: ${b.context || ""}`).join("\n") || "None"}

=== GUESTS ===
${allGuests.map(g => `- ${g.name}${g.title ? ` (${g.title})` : ""}`).join("\n") || "None"}

=== SPONSORS ===
${allSponsors.map(s => `- ${s.name}: ${s.description || ""}${s.code ? ` (code: ${s.code})` : ""}${s.url ? ` ${s.url}` : ""}`).join("\n") || "None"}

=== OTHER RESOURCES ===
${allResources.map(r => `- ${r.name} (${r.type || "resource"}): ${r.description || ""} — ${r.context || ""}`).join("\n") || "None"}

Respond ONLY with a valid JSON object:
{
  "podcastName": "${podcastName}",
  "episodeTitle": "${episodeTitle}",
  "tldl": "2-3 sentence summary of the core thesis.",
  "whatHappened": "The episode recap. 6-8 paragraphs, each 2-4 sentences. Separate paragraphs with \\n\\n.",
  "quote": "The single most surprising, counterintuitive, or shareable line. Must be from the quotes above.",
  "quoteAttribution": "Speaker Name",
  "keyInsights": ["insight1", "insight2", "insight3", "insight4"],
  "keyTopics": ["Topic 1", "Topic 2", "Topic 3", "Topic 4", "Topic 5"],
  "topicContexts": {"slug": "Episode-specific description..."},
  "sponsors": [{"name": "Sponsor Name", "description": "What they do.", "couponCode": "CODE or null", "url": "url or null", "howToRedeem": "How to use or null"}],
  "guests": [{"name": "Full Name", "title": "Title", "bio": "2-3 sentence bio.", "twitter": "@handle or null", "linkedin": "url or null", "instagram": "@handle or null", "website": "url or null", "topicsDiscussed": ["Topic"]}],
  "resources": [{"name": "Name", "type": "book|tool|product", "description": "Brief description.", "url": "URL or null", "author": "Author or null", "context": "3-5 sentences: WHO mentioned it, WHY they brought it up, what SPECIFIC argument or story it supported."}],
  "extractedQuotes": [
    {"speakerName": "Full Name", "speakerRole": "Their title (e.g. CEO of Acme)", "quoteText": "Verbatim quote from transcript", "context": "On why...", "quoteType": "Hero Quote|Hot Take|Prediction|Spicy|Tweetable"}
  ]
}

RULES FOR whatHappened (THE RECAP - MOST IMPORTANT OUTPUT):
- The recap has one job: give the reader the actual knowledge from the episode without them needing to listen
- Write like a well-informed friend walking you through the best parts of the conversation
- Every paragraph must contain at least one specific idea, fact, number, or insight from the notes
- If a paragraph only describes what was talked about without saying what was actually said, delete it and rewrite with the real content
- Start with the most interesting idea, NOT with "In this episode of [show name]..."
- 6-8 paragraphs, each 2-4 sentences, flowing naturally from one idea to the next
- ALWAYS use speakers' full names. NEVER say "the guest", "the host", "the speaker", "the duo", "the group" - always use their actual name
- BANNED PHRASES: "In this episode...", "The conversation explores/shifts/turns to...", "The hosts discuss/touch on/delve into...", "The discussion shifts to...", "They also highlight/emphasize/underscore...", "The episode wraps up with...", "Ultimately, the episode...", "The duo reflects on...", "Later, the group...", "A memorable segment explores...", "[Person] shares/reveals/explains that...", "broader themes like...", "actionable insights on...", "The guest highlights...", "The host notes..."
- BANNED WORDS: discusses, explores, highlights, shares, emphasizes, explains, underscores, delves, touches on, reflects on, recounts, acknowledges, showcases, illustrates, demonstrates, stresses, leveraging, revolutionizing, pioneering, groundbreaking, innovative, game-changing
- BANNED CHARACTERS: Never use em dashes. Use regular dashes (-) instead. Never use curly/smart quotes. Use straight quotes (' ") instead
- BAD PARAGRAPH: "The conversation shifts to AI, where the guest maps out the landscape. He identifies key players like OpenAI, Anthropic, and Google, analyzing their strategies."
- BAD PARAGRAPH: "The guest highlights that legal constraints on naming can actually aid the process."
- GOOD PARAGRAPH: "The AI landscape right now looks like a three-way war. OpenAI owns consumers - ChatGPT has become the default for most people - while Anthropic is quietly winning enterprise deals. Google, which looked dead six months ago, has surged back with Gemini and has one massive advantage nobody else can match: distribution through Search, Android, and Gmail reaching billions of users daily."
- GOOD PARAGRAPH: "Legal constraints on naming turn out to be an unexpected ally. About 80% of candidate names get killed by trademark conflicts, which forces the team toward stranger, more distinctive options - exactly the kind that tend to win in the market."

OTHER RULES:
- quote: Pick the most SHAREABLE line from the quotes list above. Something surprising, counterintuitive, or profound
- keyInsights: THE MOST IMPORTANT FIELD. Exactly 4 standalone insights a reader walks away having LEARNED. Each must be 2-3 tight sentences of straight-to-the-point information. Each insight must contain at least one concrete detail (a specific number, company name, dollar amount, person, mechanism, or framework). NEVER start an insight with a person's name followed by a verb. NEVER describe what someone said - instead deliver the actual knowledge. LITMUS TEST: "If I removed the podcast name and episode title, would this insight still be worth reading on its own?" If not, rewrite it.
  TONE RULES - CRITICAL:
  - Write in a NEUTRAL, INFORMATIVE tone. Like a news brief or research summary.
  - NEVER use conversational hooks: "Dude, did you know...", "Here's the thing:", "Here's a twist:", "Imagine...", "Turns out...", "The kicker?", "The takeaway?", "The strategy?", "The result?", "The secret?", "What's wild is..."
  - NEVER address the reader with "you" or use rhetorical questions
  - NEVER use exclamation marks
  - NEVER editorialize with "proving that...", "showing that...", "a reminder that...", "it's closer than you think", "it's not what you'd expect"
  BANNED WORDS: discusses, explores, highlights, shares, emphasizes, explains, points out, praises, recounts, acknowledges, underscores, reveals, showcases, illustrates, demonstrates, notes, stresses, leveraging, revolutionizing, pioneering, groundbreaking, innovative, game-changing, crucial, critical, essential, important
  BANNED PATTERNS: "[Person] [verb] [topic]" (NEVER start with a speaker name), "The importance of X", "[Company] is [verb]ing [industry]", "X is crucial/critical/essential for Y"
  BANNED PHRASES: "Here's a twist", "Here's the thing", "Turns out", "Imagine", "Dude", "The kicker", "The takeaway", "The strategy?", "The secret?", "proving that", "showing that", "a reminder that"
  BAD: "Dude, did you know a $500,000 ad with Mr. Beast initially tanked?" (conversational hook)
  BAD: "Here's a twist: while space gets the glamour, ocean defense is the real deal." (hook + editorial)
  BAD: "Imagine being 19 and selling your AI app after being rejected by Ivy League schools!" (hook + exclamation)
  BAD: "Lab-grown seafood could be the future - it's closer than you think." (editorial punchline)
  GOOD: "Swiffer is a $5 billion brand. Clorox's Ready Mop does a couple hundred million. The products are nearly identical - the difference is almost entirely the name. The team behind Swiffer generated over 2,000 candidate names before landing on one that was short, surprising, and sounded like the motion of mopping."
  GOOD: "The most counterintuitive part of naming a billion-dollar brand is that legal constraints actually help. Roughly 80% of candidate names get killed by trademark conflicts, which forces the team toward stranger, more distinctive options - exactly the kind that tend to win in the market."
- extractedQuotes: 3-5 quotes from the BEST QUOTES above. QUALITY GATE: Each quote must be AT LEAST 15 words long and contain a specific claim, opinion, number, or insight. Conversational filler, compliments, and reactions are NOT quotes.
  SPEAKER IDENTIFICATION IS MANDATORY: "Unknown" is NEVER acceptable as a speakerName. Use the episode title, guest list, and host names to determine who said each quote. If the episode title names a person (e.g. "Bill Gurley: ..."), most substantive quotes come from that person. Any speaker who is not a known host is the guest.
  Prefer GUESTS over hosts. Exactly ONE must be quoteType "Hero Quote". At least ONE must be "Hot Take" or "Prediction". Other types: "Spicy", "Tweetable". quoteText MUST be verbatim. context must start with "On..." (e.g. "On why AI will replace managers"). speakerRole must be specific (their actual title, not "Guest" or "Episode Host").
  BAD QUOTES (never select these): "I think your biggest skill is your audacity." / "I'm impressed with your decision making." / "That's a great point." — these are conversational reactions with no substance.
  GOOD QUOTES: Lines with specific numbers, contrarian claims, vivid metaphors, or predictions that someone would screenshot and share
- keyTopics: 4-6 specific phrases that read like search queries with specific names
- topicContexts: Use ONLY these slugs as keys: ${CURATED_TOPIC_SLUGS.map(s => `"${s}"`).join(", ")}. Only include categories genuinely discussed (typically 3-6)
- resources: Include books from the === BOOKS MENTIONED === section above ONLY if the speaker genuinely discussed the book, its author, or its content. Do NOT include a book if the title was merely used as a concept, metaphor, or adjective (e.g., "you need grit" is using the word, not referencing Angela Duckworth's book; "have more range" is a general concept, not a reference to David Epstein's "Range"). Each book's context MUST be 3-5 sentences of RICH, EPISODE-SPECIFIC detail. It must answer THREE questions: (1) WHO specifically mentioned this book (use their full name), (2) WHY did they bring it up - what argument were they making, (3) What SPECIFIC story, anecdote, statistic, or claim from the book did they reference.
  CONTEXT QUALITY RULES:
  - MINIMUM 3 full sentences per book. One-sentence contexts are a SERIOUS ERROR.
  - NEVER start with "Referenced to...", "Mentioned as...", "Discussed in the context of...", "Highlighted as...", "Brought up to..."
  - ALWAYS start with a speaker's name and what they actually said about the book
  - Include specific details from the conversation: numbers, anecdotes, quotes about the book
  BAD CONTEXT (1 sentence, generic, no specifics): "Referenced to support the idea that having a diverse set of skills and interests can lead to more innovative thinking."
  BAD CONTEXT (1 sentence, vague): "Bill Gurley discusses 'Grit' to highlight how perseverance, without passion, can lead to burnout."
  BAD CONTEXT (no speaker, no specifics): "Discussed in the context of its original emphasis on perseverance, with a shift to highlight the importance of passion."
  GOOD CONTEXT (3+ sentences, specific, named speaker): "Bill Gurley brings up 'Grit' to challenge its central thesis. While Angela Duckworth argues that grit - passion plus perseverance - is the key to success, Gurley points out that perseverance without genuine passion leads to burnout and career regret. He connects this directly to his research finding that six out of ten people would choose a different career, arguing that many grind through jobs they hate because they were told perseverance alone would pay off."
  GOOD CONTEXT: "Sam Parr calls 'Mastery' a life-changing book that fundamentally shifted how he thinks about career development. He credits Robert Greene's framework of apprenticeship, creative-active, and mastery phases with helping him recognize that true expertise requires a period of deliberate, sometimes painful, learning. Parr specifically ties Greene's concept of finding one's 'Life's Task' to Bill Gurley's point about the cost of ignoring your real calling."
  For books, include Amazon URL if you know the ASIN`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: synthesisPrompt }],
      max_tokens: 16384,
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

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

    const rawQuotes = Array.isArray(parsed.extractedQuotes) ? parsed.extractedQuotes : [];
    const synthGuestNames = Array.isArray(parsed.guests) ? parsed.guests.map((g: any) => g.name).filter(Boolean) : [];
    const validQuotes: ExtractedQuote[] = rawQuotes
      .filter((q: any) => q.speakerName && q.quoteText && q.context && q.quoteType)
      .filter((q: any) => {
        const wordCount = q.quoteText.trim().split(/\s+/).length;
        if (wordCount < 12) {
          console.log(`[RecapGenerator] Filtered short quote (${wordCount} words): "${q.quoteText.slice(0, 60)}..."`);
          return false;
        }
        return true;
      })
      .map((q: any) => {
        let name = q.speakerName;
        let role = q.speakerRole || "";
        if (name === "Unknown" || name === "Episode Host" || name === "Host") {
          if (synthGuestNames.length === 1) {
            name = synthGuestNames[0];
            role = parsed.guests[0]?.title || role;
            console.log(`[RecapGenerator] Fixed "Unknown" speaker -> "${name}"`);
          }
        }
        return { speakerName: name, speakerRole: role, quoteText: q.quoteText, context: q.context, quoteType: q.quoteType };
      })
      .filter((q: ExtractedQuote) => q.speakerName !== "Unknown");

    console.log(`[RecapGenerator] Full-transcript recap complete for "${episodeTitle}" (${coverage.chunkCount} chunks, ${coverage.totalChars} chars)`);

    const pass2Insights = await generateKeyInsightsFromRecap(whatHappened, podcastName, episodeTitle);
    const finalInsights = pass2Insights.length === 4 ? pass2Insights : keyInsights;

    return sanitizeDeep({
      podcastName: parsed.podcastName || podcastName,
      episodeTitle: parsed.episodeTitle || episodeTitle,
      tldl: parsed.tldl || "",
      whatHappened,
      keyInsights: finalInsights,
      quote: parsed.quote,
      quoteAttribution: parsed.quoteAttribution,
      keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : [],
      topicContexts: parsed.topicContexts && typeof parsed.topicContexts === "object" ? parsed.topicContexts : {},
      sponsors: Array.isArray(parsed.sponsors) ? parsed.sponsors : [],
      guests: Array.isArray(parsed.guests) ? parsed.guests : [],
      resources: Array.isArray(parsed.resources) ? parsed.resources : [],
      products: dedupedProducts,
      extractedQuotes: validQuotes,
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

  if (!recap.tldl || recap.tldl.length < 50) {
    issues.push({ field: "tldl", severity: "critical", message: `tldl too short (${recap.tldl?.length || 0} chars, need 50+)` });
  }

  if (!recap.whatHappened || recap.whatHappened.length < 200) {
    issues.push({ field: "whatHappened", severity: "critical", message: `whatHappened too short (${recap.whatHappened?.length || 0} chars, need 200+)` });
  }

  if (!recap.keyInsights || recap.keyInsights.length < 3) {
    issues.push({ field: "keyInsights", severity: "critical", message: `Only ${recap.keyInsights?.length || 0} key insights (need 3+)` });
  }

  if (!recap.quote || recap.quote.length < 10) {
    issues.push({ field: "quote", severity: "critical", message: "Missing or too short hero quote" });
  }

  if (!recap.quoteAttribution || recap.quoteAttribution.length < 3) {
    issues.push({ field: "quoteAttribution", severity: "critical", message: "Missing quote attribution" });
  }

  if (recap.quoteAttribution && /^speaker\s*\d/i.test(recap.quoteAttribution)) {
    issues.push({ field: "quoteAttribution", severity: "critical", message: `Generic speaker attribution: "${recap.quoteAttribution}"` });
  }

  if (!recap.keyTopics || recap.keyTopics.length < 3) {
    issues.push({ field: "keyTopics", severity: "warning", message: `Only ${recap.keyTopics?.length || 0} key topics (want 3+)` });
  }


  if (quoteCount < 3) {
    issues.push({ field: "quotes", severity: "critical", message: `Only ${quoteCount} episode quotes (need 3+)` });
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

  const prompt = `You are an editorial quote curator for PodCap, a podcast intelligence platform. Extract the most shareable, culturally relevant quotes from this transcript.

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

