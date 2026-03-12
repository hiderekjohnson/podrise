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
  topQuestions?: { question: string; answer: string }[];
  sponsors?: { name: string; description: string; couponCode?: string; url?: string; howToRedeem?: string }[];
  guests?: { name: string; title: string; bio: string; twitter?: string; linkedin?: string; instagram?: string; website?: string; photoUrl?: string; topicsDiscussed: string[] }[];
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

async function generateKeyInsightsFromRecap(
  recap: string,
  podcastName: string,
  episodeTitle: string,
): Promise<string[]> {
  console.log(`[RecapGenerator] Pass 2: Generating key takeaways from recap for "${episodeTitle}"...`);
  const prompt = `You extract the 4 best standalone insights from a podcast episode recap.

Your goal: a reader who never listens to the episode walks away having actually learned something from each takeaway.

Here is the recap for "${episodeTitle}" from ${podcastName}:

${recap}

Write exactly 4 key takeaways. Each must:
- Teach the reader something specific they did not know
- Be 2-3 tight sentences that could be read completely out of context and still be worth reading
- Include concrete details (a name, a number, a company, a mechanism) woven into the insight naturally
- Have a point of view or tension - not "X is important" but "X works because of Y, which most people get wrong"
- Be specific to THIS episode - if you swapped in a different episode title it should not make sense

BANNED WORDS: discusses, explores, highlights, shares, emphasizes, explains, points out, praises, recounts, acknowledges, underscores, reveals, showcases, illustrates, demonstrates, notes, stresses, leveraging, revolutionizing, pioneering, groundbreaking, innovative, game-changing
BANNED PATTERNS: "[Person] [verb] [topic]" (never start with a speaker name followed by a verb), "The importance of X", "[Company] is [verb]ing [industry] by [marketing speak]"

LITMUS TEST: "If I texted this to a smart friend with zero context, would they find it interesting?" If not, rewrite.

BAD: "Bill Gurley discusses the transformative impact of AI on the workplace."
BAD: "ZuruTech is revolutionizing home construction by leveraging advanced robotics."
BAD: "Scaling a business successfully often comes down to influencer marketing."
GOOD: "AI acts as a multiplier for curious, proactive people and a threat to passive ones. The gap between those two groups is going to widen quickly, and which side you land on is largely a choice."
GOOD: "Cal AI hit $30M in annual revenue before its founder turned 20, primarily by paying fitness influencers for performance-based posts rather than traditional ads. The playbook was simple - find creators whose audiences already want what you sell, and pay per result, not per post."

Respond ONLY with a JSON object: {"keyInsights": ["insight1", "insight2", "insight3", "insight4"]}`;

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
    console.warn(`[RecapGenerator] Pass 2 failed for "${episodeTitle}", falling back to Pass 1 insights:`, err);
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
  "topQuestions": [
    {"question": "SEO-optimized question containing the key entity or concept?", "answer": "2-3 sentence answer with specific facts from the episode."},
    {"question": "Question 2?", "answer": "Answer 2."},
    {"question": "Question 3?", "answer": "Answer 3."}
  ],
  "sponsors": [
    {"name": "Sponsor Name", "description": "What the sponsor does.", "couponCode": "CODE or null", "url": "https://sponsor.com or null", "howToRedeem": "How to use the offer or null"}
  ],
  "guests": [
    {"name": "Full Name", "title": "Professional Title / Position at Company", "bio": "2-3 sentence bio based on how they are introduced or described in the transcript.", "twitter": "@handle or null", "linkedin": "https://linkedin.com/in/handle or null", "instagram": "@handle or null", "website": "https://their-site.com or null", "topicsDiscussed": ["Topic 1", "Topic 2"]}
  ],
  "resources": [
    {"name": "Resource Name", "type": "book|tool|product", "description": "Brief description of the item.", "url": "URL if mentioned or null", "author": "Author/creator if known or null", "context": "How it was mentioned in the episode."}
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
- All core fields required: tldl, whatHappened (6-8 paragraphs), quote, quoteAttribution, keyTopics (4-6), topQuestions (exactly 3), resources (search the ENTIRE transcript for every book mentioned)
- BOOKS ARE CRITICAL: Before writing resources, scan the FULL transcript word by word for ANY book title, author name, or phrase like "this book", "read this", "his book", "her book", "the book called", "a book by", "I read", "have you read", "recommended reading". Even if a book is mentioned once in passing, include it. Missing a book is a serious error
- quote: Find the single most SHAREABLE line from the transcript. Look for something surprising, counterintuitive, provocative, funny, or profound - the kind of line someone would screenshot and post. It MUST be verbatim from the transcript. Prefer lines with a strong point of view, a vivid metaphor, or a surprising claim. Avoid generic motivational statements like "believe in yourself" or "hard work pays off." The quote should make someone curious about the episode. BAD: "I think self-belief has gotten me so far." GOOD: "Six out of ten people would choose a completely different career if they could start over. Six out of ten." quoteAttribution should be just the speaker's name (e.g. "Bill Gurley"), not "Speaker Name on topic"
- keyTopics: 4-6 specific phrases that read like search queries. Include the specific company, person, or concept name. BAD: "Engineering in sports", "Financial dynamics of racing". GOOD: "Liberty Media acquisition of F1", "Formula 1 engineering competition". Always be specific - never generic
- topicContexts: DO NOT create slugs from keyTopics. Instead, identify which of these predefined broad categories apply to this episode, and write a 1-2 sentence episode-specific description for each relevant one. ONLY use these exact slugs as keys: ${CURATED_TOPIC_SLUGS.map(s => `"${s}"`).join(", ")}. Only include categories that are genuinely discussed in the episode (typically 3-6). Reference specific points, people, or perspectives from this episode. Write like a sharp analyst, not generic marketing copy
- topQuestions: exactly 3 questions phrased like real Google searches. Each question MUST contain at least one of: the podcast name, a guest name, or a specific named entity (person, company, framework, book). NEVER generic questions. BAD: "What is the best way to find your passion?" GOOD: "What does Bill Gurley say about finding your passion on My First Million?" Each answer should be 2-3 sentences maximum that deliver the ACTUAL answer with specific facts or claims from the episode. Answers must follow the same rules as the recap: no speaker attribution patterns ("[Person] emphasizes/highlights/explains..."), no banned words, just the substance. BAD answer: "Bill Gurley emphasizes the importance of frameworks like regret minimization." GOOD answer: "The regret minimization framework asks you to imagine your 80-year-old self looking back - what would that person regret not trying? Jeff Bezos used exactly this thought experiment to decide to leave his hedge fund job and start Amazon."
- sponsors: Extract ALL sponsors/advertisers. Include coupon codes and URLs when mentioned. Return empty array [] if none
- guests: Extract ALL guests (NOT regular hosts). CRITICAL: Use FULL NAME (first AND last). Search the entire transcript for last names. A guest is anyone who is interviewed, joins the conversation, or is introduced on the show - even if they only appear briefly. Look for introductions like "joining us", "our guest", "we have", "[Name] is here", or any person who speaks who is not a regular host. If the episode title mentions a person by name or title (e.g. "$450M VC", "$100B Founder"), that person is almost certainly a guest - find their full name. Return empty array [] ONLY if the episode truly has no guests (e.g. hosts-only discussion episodes)
- resources: Extract ALL books mentioned - even briefly. Include full title and author name. The "context" field must answer why this book was mentioned and what specific argument it supported. Do NOT describe the book generically. BAD context: "Daniel H. Pink explores how embracing regret can improve decision-making." GOOD context: "Recommended in the context of the central argument that 6 out of 10 people regret their career choices - Pink's research on how regrets of inaction outweigh mistakes was cited as the foundation for the whole conversation." Do NOT include sponsors, SaaS products, or abstract concepts. Return empty array [] if none`;

  console.log(`[RecapGenerator] Pass 1: Generating recap + structured data for "${episodeTitle}"...`);

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const usePrompt = attempt === 1 ? pass1Prompt : pass1Prompt + "\n\nIMPORTANT: Keep your response CONCISE. Limit whatHappened to 4 short paragraphs. Limit each topQuestions answer to 1-2 paragraphs. Keep guest bios to 1 sentence. The total JSON response must be under 8000 characters.";
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
      let resources: any[] = Array.isArray(parsed.resources) ? parsed.resources : [];

      try {
        resources = mergeExtractedBooks(
          resources,
          await extractBooksFromTranscript(transcript, podcastName, episodeTitle),
          "[RecapGenerator]"
        );
      } catch (err) {
        console.warn(`[RecapGenerator] Book post-processing failed for "${episodeTitle}":`, err);
      }

      const whatHappened = (parsed.whatHappened || "").replace(/\\n\\n/g, "\n\n").replace(/\\n/g, "\n");

      let keyInsights: string[] = [];
      const pass2Insights = await generateKeyInsightsFromRecap(whatHappened, podcastName, episodeTitle);
      if (pass2Insights.length === 4) {
        keyInsights = pass2Insights;
      } else if (Array.isArray(parsed.keyInsights)) {
        keyInsights = parsed.keyInsights;
        console.warn(`[RecapGenerator] Using Pass 1 fallback insights for "${episodeTitle}"`);
      }

      console.log(`[RecapGenerator] Two-pass generation complete for "${episodeTitle}"`);

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
        tldl: parsed.tldl || "",
        whatHappened,
        keyInsights,
        quote: parsed.quote,
        quoteAttribution: parsed.quoteAttribution,
        keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : [],
        topicContexts: parsed.topicContexts && typeof parsed.topicContexts === "object" ? parsed.topicContexts : {},
        topQuestions: Array.isArray(parsed.topQuestions) ? parsed.topQuestions : [],
        sponsors: Array.isArray(parsed.sponsors) ? parsed.sponsors : [],
        guests: Array.isArray(parsed.guests) ? parsed.guests : [],
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

Find ALL books mentioned in any context:
- Books explicitly recommended ("you should read...", "I loved this book...")
- Books quoted or referenced ("as [author] wrote in [book]...")
- Books discussed at length or briefly
- Books mentioned in passing ("that reminds me of [book]...")
- Textbooks, memoirs, novels, business books, self-help - any published book

For each book, provide:
- name: The exact book title
- author: The author's full name (look it up if you know it, even if the transcript only gives a last name)
- description: A 1-sentence description of what the book is about
- context: 1-2 sentences explaining exactly what was said about this book in the episode - why it was mentioned, what point it supported, or why it was recommended. This should feel like transcript context, not a generic description.
- url: An Amazon direct product URL in format https://www.amazon.com/dp/ASIN if you know the ASIN, otherwise https://www.amazon.com/s?k=Book+Title+Author+Name

Respond ONLY with a valid JSON object:
{
  "books": [
    {"name": "Book Title", "type": "book", "description": "Brief description.", "url": "https://www.amazon.com/dp/ASIN", "author": "Author Name", "context": "What was said about this book in the episode."}
  ]
}

RULES:
- Include EVERY book mentioned, no matter how briefly
- Do NOT include podcasts, newsletters, websites, apps, SaaS products, or abstract concepts
- Do NOT fabricate books that weren't mentioned in the transcript
- If no books are mentioned, return {"books": []}
- Try to find the correct Amazon ASIN for well-known books`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4096,
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

export interface ExtractedQuote {
  speakerName: string;
  speakerRole: string;
  quoteText: string;
  context: string;
  quoteType: "Hero Quote" | "Hot Take" | "Prediction" | "Spicy" | "Tweetable";
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

  const prompt = `You are an editorial quote curator for PodCap, a podcast intelligence platform. Your audience cares about AI, startups, money, and the future of work. Extract the most shareable, culturally relevant quotes from this transcript.

Podcast: ${podcastName}
Episode: "${episodeTitle}"${hostsInfo}${guestInfo}

Transcript:
${transcript}

EXTRACTION RULES:
- Always prefer quotes from GUESTS over the host. Include host quotes only if genuinely exceptional.
- A quote is worth extracting if someone would screenshot it and send it to a friend.
- Prioritize: contrarian or spicy takes, tweetable self-contained lines, hot topic relevance (AI, future of work, money, startups), specific opinions and predictions over general wisdom, memorable phrasing.
- Skip: personal travel or family stories, generic motivational filler, factual statements with no opinion, rambling passages that need editing to land, host filler and transitions.
- Pull 3 to 5 quotes. One MUST be the clear hero quote. At least one must be a hot take or prediction. Include a bonus exchange-style quote if there is a memorable back-and-forth.
- Quotes MUST be verbatim from the transcript. Do NOT clean up, edit, or rephrase.

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
- quoteText must be VERBATIM from transcript - do not clean up grammar or rephrase
- context must be a short phrase starting with "On..." (e.g. "On why AI will replace managers")
- speakerRole should be specific (not just "Guest" - use their actual title)
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
