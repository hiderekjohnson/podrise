import { storage } from "./storage";
import { openai } from "./replit_integrations/image/client";
import { ITUNES_ID_TO_SLUG } from "./podcastLandingMap";
import { pool } from "./db";

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

export async function generateRecapFromTranscript(
  transcript: string,
  podcastName: string,
  episodeTitle: string,
  showNotes?: string | null,
): Promise<ParsedEpisode | null> {
  const showNotesSection = showNotes ? `\nShow Notes (use for guest full names, social links, and additional context):\n${showNotes}\n` : "";
  const prompt = `You are PodCap, an AI that writes comprehensive podcast episode recaps. Generate a complete recap for this episode.

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
  "whatHappened": "A flowing 2-minute read narrative summary (6-10 short paragraphs). Write it like a well-crafted article recap - not bullet points or chapter headings. Each paragraph should be 2-4 sentences. Cover the full arc of the episode from opening to conclusion. Separate paragraphs with \\n\\n.",
  "keyInsights": ["Insight 1", "Insight 2", "Insight 3", "Insight 4"],
  "quote": "A memorable line from the transcript",
  "quoteAttribution": "Speaker Name on topic",
  "keyTopics": ["Topic 1", "Topic 2", "Topic 3", "Topic 4", "Topic 5"],
  "topicContexts": {"topic-slug": "1-2 sentence description of how this specific topic was covered in this episode, referencing specific points or perspectives discussed."},
  "topQuestions": [
    {"question": "SEO-optimized question containing the key entity or concept?", "answer": "2-4 sentence answer that naturally repeats the key entity/concept name. Drawn from transcript."},
    {"question": "Question 2?", "answer": "Answer 2."},
    {"question": "Question 3?", "answer": "Answer 3."},
    {"question": "Question 4?", "answer": "Answer 4."},
    {"question": "Question 5?", "answer": "Answer 5."}
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

RULES:
- All core fields required: tldl, whatHappened (6-10 paragraphs), keyInsights (exactly 4), quote, quoteAttribution, keyTopics (4-6), topQuestions (exactly 5)
- Write like a sharp friend catching you up
- Be specific and concrete
- Quotes MUST be from the transcript
- whatHappened must be a flowing 2-minute read narrative (6-10 short paragraphs, 2-4 sentences each). Write like a well-crafted article recap - NOT chapter headings or bullet summaries. Cover the full arc: what opened the episode, the key discussions, turning points, and how it concluded. Use \\n\\n between paragraphs
- keyTopics: 4-6 specific phrases that read like search queries. Include the specific company, person, or concept name. BAD: "Engineering in sports", "Financial dynamics of racing", "Global appeal of motorsport". GOOD: "Liberty Media acquisition of F1", "Formula 1 engineering competition", "Economics of F1 teams", "Global growth of Formula 1". Always be specific - never generic
- topicContexts: For each keyTopic, write a 1-2 sentence episode-specific description of how that topic was covered. Use the kebab-case slug of the broad category as the key (e.g. "ai", "startups", "self-improvement", "career-growth", "leadership", "real-estate", "crypto", "health-wellness", "marketing", "venture-capital", "finance", "geopolitics", "sports-business", "entertainment", "ecommerce", "climate-energy", "science", "true-crime", "politics", "education", "social-media", "mental-health", "food-beverage", "space-exploration", "cybersecurity", "gaming", "music-industry", "travel", "podcasting", "media", "legal", "biotech-pharma", "automotive", "saas", "creator-economy", "parenting", "relationships", "philosophy", "history", "data-privacy"). Reference specific points, people, or perspectives from this episode. Write like a sharp analyst, not generic marketing copy
- topQuestions: 5 SEO-optimized questions phrased like real Google searches someone would type. Each question MUST contain the specific entity, person, concept, or framework name (e.g. "What is the regret minimization framework?" not "What framework was discussed?"). Each answer should be 2-4 sentences that naturally repeat the key entity/concept name at least once. Answers must read naturally - not keyword-stuffed. Draw all content from the transcript
- sponsors: Extract ALL sponsors/advertisers mentioned in the transcript (ad reads, promo codes, sponsored segments). Include coupon codes and URLs when mentioned. Return empty array [] if no sponsors are mentioned
- guests: Extract ALL guests who appear on the episode (NOT the regular hosts). Use their FULL NAME (first and last). Include their professional title/position at their company. Write a 2-3 sentence bio based on how they are introduced. Include social media handles if mentioned in the transcript or commonly known (twitter, linkedin, instagram, website). Do NOT include photoUrl - set it to null. Return empty array [] if no guests (solo host episodes or host-only conversations)
- resources: Extract ALL books mentioned, recommended, quoted, referenced, or discussed - even briefly. Also include physical products or tools that someone could actually BUY on Amazon. For books: include the full title, author name, and a 1-2 sentence "context" explaining how/why the book came up in conversation. For URLs, use https://www.amazon.com/dp/ASIN if you know the ASIN, or https://www.amazon.com/s?k=Book+Title+Author for search fallback. Do NOT include abstract concepts, philosophies, anecdotes, websites, newsletters, services, SaaS products, or the podcast itself. Do NOT include sponsors here either. If no purchasable items or books are mentioned, return empty array []`;

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const usePrompt = attempt === 1 ? prompt : prompt + "\n\nIMPORTANT: Keep your response CONCISE. Limit whatHappened to 2 short paragraphs. Limit each topQuestions answer to 1-2 paragraphs. Keep guest bios to 1 sentence. The total JSON response must be under 8000 characters.";
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
      return {
        podcastName: parsed.podcastName || podcastName,
        episodeTitle: parsed.episodeTitle || episodeTitle,
        tldl: parsed.tldl || "",
        whatHappened: (parsed.whatHappened || "").replace(/\\n\\n/g, "\n\n").replace(/\\n/g, "\n"),
        keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [],
        quote: parsed.quote,
        quoteAttribution: parsed.quoteAttribution,
        keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : [],
        topicContexts: parsed.topicContexts && typeof parsed.topicContexts === "object" ? parsed.topicContexts : {},
        topQuestions: Array.isArray(parsed.topQuestions) ? parsed.topQuestions : [],
        sponsors: Array.isArray(parsed.sponsors) ? parsed.sponsors : [],
        guests: Array.isArray(parsed.guests) ? parsed.guests : [],
        resources: Array.isArray(parsed.resources) ? parsed.resources : [],
      };
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
