import OpenAI from "openai";
import { pool } from "./db";
import { storage } from "./storage";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface TopicKeywordConfig {
  primary: string[];
  secondary: string[];
  minScore: number;
}

export const topicKeywordsMap: Record<string, TopicKeywordConfig> = {
  "ai": {
    primary: ["artificial intelligence", "machine learning", "deep learning", "neural network", "large language model"],
    secondary: ["GPT", "LLM", "ChatGPT", "OpenAI", "Anthropic", "Claude", "AI agent", "AI model", "generative AI", "computer vision", "natural language processing"],
    minScore: 4,
  },
  "entrepreneurship": {
    primary: ["entrepreneurship", "entrepreneur", "founded", "co-founded"],
    secondary: ["founder", "startup", "bootstrap", "bootstrapped", "side hustle", "building a business"],
    minScore: 3,
  },
  "startups": {
    primary: ["startup", "startups", "product-market fit", "seed round", "series A"],
    secondary: ["early-stage", "pivot", "launch", "incubator", "accelerator", "Y Combinator"],
    minScore: 3,
  },
  "venture-capital": {
    primary: ["venture capital", "venture capitalist", "VC firm", "fundraising round"],
    secondary: ["VC", "series A", "series B", "seed funding", "term sheet", "cap table", "valuation"],
    minScore: 3,
  },
  "investing": {
    primary: ["investing", "investment strategy", "stock market", "portfolio management"],
    secondary: ["stocks", "bonds", "ETF", "hedge fund", "asset allocation", "returns", "bull market", "bear market"],
    minScore: 3,
  },
  "personal-finance": {
    primary: ["personal finance", "financial independence", "wealth building", "financial planning"],
    secondary: ["budgeting", "saving", "retirement", "debt", "credit score", "net worth", "FIRE"],
    minScore: 3,
  },
  "leadership": {
    primary: ["leadership", "leading teams", "executive leadership"],
    secondary: ["CEO", "executive", "leader", "vision", "organizational culture", "servant leadership", "management"],
    minScore: 3,
  },
  "marketing": {
    primary: ["marketing strategy", "digital marketing", "brand strategy"],
    secondary: ["marketing", "brand", "growth hacking", "advertising", "SEO", "content marketing", "social media marketing"],
    minScore: 3,
  },
  "sales": {
    primary: ["sales strategy", "sales process", "selling"],
    secondary: ["sales", "revenue", "pipeline", "cold calling", "B2B sales", "closing deals"],
    minScore: 3,
  },
  "productivity": {
    primary: ["productivity", "time management", "deep work"],
    secondary: ["habits", "routines", "efficiency", "focus", "workflow", "GTD"],
    minScore: 3,
  },
  "decision-making": {
    primary: ["decision making", "decision-making", "mental model"],
    secondary: ["cognitive bias", "heuristic", "judgment", "rational thinking", "first principles"],
    minScore: 3,
  },
  "technology": {
    primary: ["technology", "software engineering", "tech industry"],
    secondary: ["software", "engineering", "computing", "cloud", "infrastructure", "developer"],
    minScore: 3,
  },
  "economics": {
    primary: ["economics", "economic policy", "macroeconomics"],
    secondary: ["economy", "monetary policy", "inflation", "recession", "GDP", "Federal Reserve", "fiscal policy"],
    minScore: 3,
  },
  "future-of-work": {
    primary: ["future of work", "remote work", "workplace transformation"],
    secondary: ["gig economy", "hybrid work", "automation replacing", "freelance", "work from home"],
    minScore: 3,
  },
  "health-longevity": {
    primary: ["longevity", "healthspan", "lifespan"],
    secondary: ["nutrition", "fitness", "sleep", "wellness", "anti-aging", "biohacking", "metabolic health"],
    minScore: 3,
  },
  "psychology": {
    primary: ["psychology", "psychological", "neuroscience"],
    secondary: ["behavior", "mental health", "cognitive", "therapy", "emotional intelligence", "trauma"],
    minScore: 3,
  },
  "peak-performance": {
    primary: ["peak performance", "high performance"],
    secondary: ["biohacking", "optimize", "performance", "elite athlete", "mental toughness"],
    minScore: 3,
  },
  "self-improvement": {
    primary: ["self-improvement", "personal development", "personal growth"],
    secondary: ["mindset", "motivation", "discipline", "self-help", "life coaching", "transformation"],
    minScore: 3,
  },
  "negotiation": {
    primary: ["negotiation", "negotiating", "negotiator"],
    secondary: ["persuasion", "influence", "conflict resolution", "bargaining", "deal-making"],
    minScore: 3,
  },
  "career-growth": {
    primary: ["career growth", "career development", "professional development"],
    secondary: ["career", "promotion", "job search", "networking", "mentorship", "career change"],
    minScore: 3,
  },
  "creativity": {
    primary: ["creativity", "creative process", "creative thinking"],
    secondary: ["creative", "design", "storytelling", "artistic", "imagination", "inspiration"],
    minScore: 3,
  },
  "media-content": {
    primary: ["media industry", "content creation", "journalism"],
    secondary: ["media", "streaming", "podcast", "newsletter", "content strategy"],
    minScore: 3,
  },
  "geopolitics": {
    primary: ["geopolitics", "geopolitical", "foreign policy", "international relations"],
    secondary: ["diplomacy", "international", "sanctions", "trade war", "national security"],
    minScore: 3,
  },
  "creator-economy": {
    primary: ["creator economy", "content creator", "creator"],
    secondary: ["influencer", "newsletter", "monetize", "audience building", "personal brand", "YouTube", "TikTok"],
    minScore: 3,
  },
  "saas": {
    primary: ["saas", "software as a service", "recurring revenue"],
    secondary: ["churn", "ARR", "MRR", "subscription", "B2B software", "cloud software"],
    minScore: 3,
  },
  "open-source": {
    primary: ["open source", "open-source", "free software"],
    secondary: ["GitHub", "Linux", "open model", "open weights", "community-driven"],
    minScore: 3,
  },
  "product-management": {
    primary: ["product management", "product manager", "product strategy"],
    secondary: ["roadmap", "user research", "product-led", "feature prioritization", "product team"],
    minScore: 3,
  },
  "product-market-fit": {
    primary: ["product-market fit", "product market fit", "PMF"],
    secondary: ["market validation", "customer discovery", "pivoting", "finding fit", "demand validation"],
    minScore: 3,
  },
  "automation": {
    primary: ["automation", "workflow automation", "process automation"],
    secondary: ["automate", "automated", "RPA", "no-code", "low-code", "Zapier"],
    minScore: 3,
  },
  "robotics": {
    primary: ["robotics", "robot", "autonomous vehicle"],
    secondary: ["humanoid", "drone", "manufacturing automation", "self-driving", "autonomous"],
    minScore: 3,
  },
  "crypto-web3": {
    primary: ["cryptocurrency", "bitcoin", "blockchain", "web3"],
    secondary: ["crypto", "ethereum", "DeFi", "NFT", "token", "decentralized", "smart contract"],
    minScore: 3,
  },
  "climate-energy": {
    primary: ["climate change", "clean energy", "renewable energy"],
    secondary: ["climate", "solar", "nuclear", "carbon", "sustainability", "electric vehicle", "EV", "energy transition"],
    minScore: 3,
  },
  "defense-tech": {
    primary: ["defense tech", "defense technology", "military technology"],
    secondary: ["defense", "military", "cybersecurity", "national security", "pentagon", "aerospace", "Anduril", "Palantir"],
    minScore: 3,
  },
  "women-in-business": {
    primary: ["women in business", "female founder", "women entrepreneurs"],
    secondary: ["women in tech", "female CEO", "women investors", "gender gap", "women leadership"],
    minScore: 3,
  },
  "young-entrepreneurs": {
    primary: ["young entrepreneur", "teenage founder", "young founder"],
    secondary: ["Gen Z", "college dropout", "young CEO", "millennial founder", "student entrepreneur"],
    minScore: 3,
  },
  "bootstrapping": {
    primary: ["bootstrapping", "bootstrapped", "self-funded"],
    secondary: ["bootstrap", "profitable", "no funding", "indie hacker", "revenue-funded"],
    minScore: 3,
  },
  "side-hustles": {
    primary: ["side hustle", "side project", "passive income"],
    secondary: ["freelance", "extra income", "hustle", "side business", "moonlighting"],
    minScore: 3,
  },
};

interface EpisodeForPulse {
  slug: string;
  episodeSlug: string;
  podcastName: string;
  episodeTitle: string;
  tldl: string;
  whatHappened: string;
  keyInsights: string[];
  quote: string | null;
  quoteAttribution: string | null;
  hosts: string | null;
  guests: string | null;
  keyTopics: string[] | null;
  resources: string | null;
  relevanceScore: number;
}

interface QuoteData {
  speakerName: string;
  speakerRole: string | null;
  quoteText: string;
  context: string;
  podcastSlug: string;
  episodeSlug: string;
}

interface GeneratedPulse {
  headline: string;
  summary: string;
  body: string;
  keyThemes: string[];
  episodeCount: number;
  sourceEpisodes: { podcastSlug: string; episodeSlug: string; podcastName: string; episodeTitle: string }[];
}

function scoreEpisode(ep: any, config: TopicKeywordConfig): number {
  let score = 0;
  const title = (ep.episode_title || "").toLowerCase();
  const body = `${ep.what_happened || ""} ${ep.tldl || ""} ${ep.key_insights || ""}`.toLowerCase();

  for (const kw of config.primary) {
    const kwLower = kw.toLowerCase();
    if (title.includes(kwLower)) score += 5;
    const bodyMatches = body.split(kwLower).length - 1;
    score += Math.min(bodyMatches, 5) * 2;
  }

  for (const kw of config.secondary) {
    const kwLower = kw.toLowerCase();
    if (kw.length <= 3) {
      const regex = new RegExp(`\\b${kw}\\b`, "gi");
      if (regex.test(title)) score += 3;
      const bodyHits = (body.match(new RegExp(`\\b${kw.toLowerCase()}\\b`, "gi")) || []).length;
      score += Math.min(bodyHits, 4);
    } else {
      if (title.includes(kwLower)) score += 3;
      const bodyMatches = body.split(kwLower).length - 1;
      score += Math.min(bodyMatches, 4);
    }
  }

  return score;
}

function tryParseGuests(guestsJson: string | null): string {
  if (!guestsJson) return "";
  try {
    const guests = JSON.parse(guestsJson);
    if (Array.isArray(guests)) {
      return guests.map((g: any) => {
        const name = g.name || "";
        const title = g.title || g.role || "";
        return title ? `${name} (${title})` : name;
      }).filter(Boolean).join(", ");
    }
    return "";
  } catch {
    return guestsJson;
  }
}

function tryParseResources(resources: string | null): string[] {
  if (!resources) return [];
  try {
    const parsed = JSON.parse(resources);
    if (Array.isArray(parsed)) {
      return parsed.map((r: any) => {
        if (typeof r === "string") return r;
        return r.title || r.name || "";
      }).filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}

export async function getEpisodesForTopic(topicSlug: string, dateStr: string): Promise<EpisodeForPulse[]> {
  const config = topicKeywordsMap[topicSlug];
  if (!config) return [];

  const allKeywords = [...config.primary, ...config.secondary];
  const conditions = allKeywords.map((_, i) => {
    const p = `$${i + 2}`;
    return `(episode_title ILIKE ${p} OR what_happened ILIKE ${p} OR tldl ILIKE ${p} OR key_insights::text ILIKE ${p})`;
  }).join(" OR ");
  const params = [dateStr, ...allKeywords.map(k => `%${k}%`)];

  const { rows } = await pool.query(
    `SELECT slug, episode_slug, podcast_name, episode_title, tldl, what_happened, key_insights, quote, quote_attribution, hosts, guests, key_topics, resources
     FROM landing_page_recaps
     WHERE publish_date = $1 AND (${conditions})
     ORDER BY id`,
    params
  );

  const scored = rows.map(r => ({
    slug: r.slug,
    episodeSlug: r.episode_slug,
    podcastName: r.podcast_name,
    episodeTitle: r.episode_title,
    tldl: r.tldl,
    whatHappened: r.what_happened,
    keyInsights: r.key_insights || [],
    quote: r.quote,
    quoteAttribution: r.quote_attribution,
    hosts: r.hosts,
    guests: r.guests ? (typeof r.guests === 'string' ? r.guests : JSON.stringify(r.guests)) : null,
    keyTopics: r.key_topics,
    resources: r.resources ? (typeof r.resources === 'string' ? r.resources : JSON.stringify(r.resources)) : null,
    relevanceScore: scoreEpisode(r, config),
  })).filter(ep => ep.relevanceScore >= config.minScore);

  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return scored;
}

async function getQuotesForEpisodes(episodes: EpisodeForPulse[]): Promise<QuoteData[]> {
  const allQuotes: QuoteData[] = [];
  for (const ep of episodes) {
    try {
      const quotes = await storage.getEpisodeQuotes(ep.slug, ep.episodeSlug);
      for (const q of quotes) {
        allQuotes.push({
          speakerName: q.speakerName,
          speakerRole: q.speakerRole,
          quoteText: q.quoteText,
          context: q.context,
          podcastSlug: ep.slug,
          episodeSlug: ep.episodeSlug,
        });
      }
    } catch {}
  }
  return allQuotes;
}

function formatDateForDisplay(dateStr: string): string {
  const parts = dateStr.split("-");
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export async function generatePulse(topicSlug: string, dateStr: string, topicName: string): Promise<GeneratedPulse | null> {
  const episodes = await getEpisodesForTopic(topicSlug, dateStr);
  if (episodes.length === 0) return null;

  const quotes = await getQuotesForEpisodes(episodes);

  const episodeBriefs = episodes.map((ep, i) => {
    const guestInfo = tryParseGuests(ep.guests);
    const resources = tryParseResources(ep.resources);
    const insightsStr = ep.keyInsights.map((ins, j) => `  ${j + 1}. ${ins}`).join("\n");

    return `[Episode ${i + 1}] "${ep.episodeTitle}" - ${ep.podcastName}
Host: ${ep.hosts || "Unknown"}${guestInfo ? `\nGuests: ${guestInfo}` : ""}
Summary: ${ep.tldl}
Recap: ${ep.whatHappened}
Key Insights:
${insightsStr}
${ep.quote ? `Featured Quote: "${ep.quote}" - ${ep.quoteAttribution || ep.hosts}` : ""}
${resources.length > 0 ? `Resources/Books: ${resources.join(", ")}` : ""}
Episode link: /podcasts/${ep.slug}/${ep.episodeSlug}
Podcast link: /podcasts/${ep.slug}`;
  }).join("\n\n---\n\n");

  const quotesSection = quotes.length > 0
    ? `\n\nDETAILED QUOTES FROM TODAY'S EPISODES:\n${quotes.map(q =>
      `"${q.quoteText}" - ${q.speakerName}${q.speakerRole ? ` (${q.speakerRole})` : ""} [from /podcasts/${q.podcastSlug}/${q.episodeSlug}]`
    ).join("\n")}`
    : "";

  const prompt = `You are writing THE PULSE for ${topicName} on ${formatDateForDisplay(dateStr)}.

THE PULSE is a daily intelligence briefing for professionals who want to stay informed about ${topicName} by extracting insights from podcast conversations. This is NOT about podcast news or the podcast industry. We do not care who appeared on what show. We care about the IDEAS, STRATEGIES, LESSONS, and KNOWLEDGE shared in these conversations.

Think of yourself as a team of analysts at a top consulting firm. Your analysts listened to every relevant podcast yesterday and are now presenting a briefing to a VP or CEO: "Here is what you need to know about ${topicName} based on what the smartest people were discussing yesterday."

OUR MISSION: Unlock the world's knowledge trapped inside millions of podcasts, transforming billions of hours of spoken conversations into searchable, structured information anyone can instantly learn from.

Here are the ${topicName}-related podcast episodes from ${formatDateForDisplay(dateStr)}:

${episodeBriefs}
${quotesSection}

WHAT TO WRITE:
1. A compelling HEADLINE (8-15 words) that captures the most important theme or insight from today's episodes. This should read like a headline from a premium industry briefing, not a podcast roundup.

2. A brief SUMMARY (1-2 sentences) that gives a professional the gist of what they will learn.

3. The BODY - a structured intelligence briefing in markdown. Structure it as follows:

   Start with an executive overview paragraph (3-4 sentences) that synthesizes the biggest theme or most important insight across all episodes. What is the one thing a busy professional needs to know today?

   Then organize insights into 2-4 thematic sections using **bold section headers**. Each section should:
   - Synthesize insights from multiple episodes when possible, not just summarize one episode at a time
   - Include specific, actionable information (numbers, strategies, frameworks, quotes)
   - Link to relevant episode pages, podcast pages, people pages, and company pages naturally
   - Include direct quotes embedded in the text (from the episode quotes or featured quotes provided)

   After the main sections, add a **Worth Noting** section with 2-3 shorter observations, interesting data points, or secondary insights that did not fit the main themes

   End with a **Books and Resources** section if any books or resources were mentioned across the episodes

4. KEY THEMES - a list of 3-5 theme labels that describe the main areas covered today

LINKING RULES:
- Link episode titles to their episode pages: [Episode Title](/podcasts/slug/episode-slug)
- Link podcast names to their podcast pages: [Podcast Name](/podcasts/slug)
- Link well-known people to their pages: [Person Name](/people/first-last)
- Link well-known companies to their pages: [Company Name](/companies/slug)
- Link book titles to their book pages: [Book Title](/bookstore/book-slug-in-kebab-case)
- Links MUST start with a forward slash / (relative paths, not full URLs)
- Do not over-link. Link a name/title once then leave subsequent mentions unlinked

VOICE AND TONE:
- Authoritative and analytical, like a premium industry briefing (McKinsey, CB Insights, a16z newsletters)
- Focus on WHAT WAS SAID that matters, not WHO was on what show
- Specific over vague: include numbers, frameworks, strategies, quotes
- Write for a time-pressed professional who needs to be informed
- Never use em dashes. Use commas, periods, or colons instead
- Do not use curly or smart apostrophes

CONSTRAINTS:
- Include 2-4 direct quotes from the episodes, attributed to the speaker
- Every insight should trace back to a specific episode (linked)
- Focus on learnings and knowledge, not podcast industry talk
- Do not mention episode downloads, podcast ratings, or industry metrics
- Do not write "dropped today" or "hit the airwaves" style language
- Minimum 500 words, maximum 900 words for the body
- Do not use numbered lists for the main content sections. Use prose with embedded bullet points only when listing specific strategies, steps, or resources

Respond with ONLY valid JSON (no markdown fences):
{
  "headline": "The headline",
  "summary": "1-2 sentence summary for professionals",
  "body": "The full intelligence briefing in markdown. Use \\n\\n for paragraph breaks.",
  "keyThemes": ["Theme 1", "Theme 2", "Theme 3"]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4000,
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
    const body = (parsed.body || "").replace(/\\n\\n/g, "\n\n").replace(/\\n/g, "\n");

    return {
      headline: parsed.headline || "The Pulse",
      summary: parsed.summary || "",
      body,
      keyThemes: parsed.keyThemes || [],
      episodeCount: episodes.length,
      sourceEpisodes: episodes.map(ep => ({
        podcastSlug: ep.slug,
        episodeSlug: ep.episodeSlug,
        podcastName: ep.podcastName,
        episodeTitle: ep.episodeTitle,
      })),
    };
  } catch (err) {
    console.error(`[PulseGenerator] Failed for ${topicSlug} on ${dateStr}:`, err);
    return null;
  }
}

export async function generateAndSavePulse(topicSlug: string, dateStr: string, topicName: string) {
  console.log(`[Pulse] Generating pulse for ${topicName} (${topicSlug}) on ${dateStr}...`);

  const pulse = await generatePulse(topicSlug, dateStr, topicName);
  if (!pulse) {
    console.log(`[Pulse] No relevant episodes found for ${topicSlug} on ${dateStr}`);
    return null;
  }

  console.log(`[Pulse] Generated pulse from ${pulse.episodeCount} episodes. Saving...`);

  const saved = await storage.upsertTopicPulse({
    topicSlug,
    publishDate: dateStr,
    headline: pulse.headline,
    summary: pulse.summary,
    body: pulse.body,
    keyThemes: pulse.keyThemes,
    episodeCount: pulse.episodeCount,
    sourceEpisodes: pulse.sourceEpisodes,
  });

  console.log(`[Pulse] Saved pulse id=${saved.id} for ${topicSlug} on ${dateStr}`);
  return saved;
}
