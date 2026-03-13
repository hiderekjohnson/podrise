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

function formatDateShortForPrompt(dateStr: string): string {
  const parts = dateStr.split("-");
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
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
Key points:
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

  const podcastNames = [...new Set(episodes.map(ep => ep.podcastName))];

  const prompt = `You are writing THE PULSE, a ${topicName.toLowerCase()} podcast briefing for ${formatDateShortForPrompt(dateStr)}.

YOUR VOICE: You listened to every ${topicName.toLowerCase()} podcast so the reader did not have to, and now you are texting them the good parts. Smart, direct, conversational. Not a consulting deck. Not a report. A smart friend who is genuinely excited about what they heard.

TARGET READER: A busy professional who decides in 3 seconds whether to keep reading. Every sentence earns its place or gets cut.

TARGET LENGTH: The entire briefing fits on one screen without scrolling. About 250-350 words for the body. That is it.

Here are the ${topicName.toLowerCase()}-related podcast episodes from ${formatDateForDisplay(dateStr)}:

${episodeBriefs}
${quotesSection}

WHAT TO WRITE:

1. HEADLINE: Specific and datestamped. Must contain "${topicName.toLowerCase()} podcast" or "${topicName.toLowerCase()} podcasts". Never generic. Bad: "Mindset, Scaling, and AI: Core Pillars of Entrepreneurial Success". Good: "What ${topicName} Podcasts Are Talking About This Week, ${formatDateShortForPrompt(dateStr)}". The headline should not work if you changed the date to 2019.

2. SUMMARY: One punchy sentence. The single most interesting thing from today.

3. BODY in markdown:

   OPEN WITH THE BEST QUOTE. Find the single sharpest, most specific quote across all episodes. Lead with it. Build down from there.

   Then 2-3 short sections with **bold headers**. Each section: 2-3 sentences MAX. Include specific details (numbers, strategies, names). Synthesize across episodes when possible.

   Then ONE "**Worth Noting**" item. Not a list. One sentence about the single most surprising or counterintuitive data point from today.

   If books were mentioned, add a "**On the Reading List**" line with titles linked to /bookstore/book-slug-in-kebab-case.

4. KEY THEMES: 3-5 short labels.

BANNED WORDS AND PHRASES (if you use any of these, the output is rejected):
landscape, navigating, rapidly evolving, key discussions, sustained growth, competitive advantage, undergoing significant changes, it is crucial, delve, transformative, key insights, pillars, comprehensive, leveraging, paradigm, synergy, holistic, cutting-edge, groundbreaking, game-changing, actionable, robust, ecosystem, empower, stakeholder, thought leader

LINKING RULES:
- Episode titles: [Episode Title](/podcasts/slug/episode-slug)
- Podcast names: [Podcast Name](/podcasts/slug)
- People: [Person Name](/people/first-last)
- Companies: [Company Name](/companies/slug)
- Books: [Book Title](/bookstore/book-slug-in-kebab-case)
- Links MUST start with / (relative paths)
- Link a name once, leave later mentions unlinked

STYLE RULES:
- Never use em dashes. Use commas, periods, or colons instead.
- Do not use curly or smart apostrophes.
- No numbered lists in the main body.
- Write in present tense when possible.
- Specific over vague. "Grew revenue 40% in 6 months" not "experienced significant growth."
- If it sounds like it came from a consulting firm, rewrite it.

PODCASTS REFERENCED: ${podcastNames.join(", ")}

Respond with ONLY valid JSON (no markdown fences):
{
  "headline": "The headline with date and topic",
  "summary": "One punchy sentence",
  "body": "The full briefing in markdown. Use \\n\\n for paragraph breaks.",
  "keyThemes": ["Theme 1", "Theme 2", "Theme 3"]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2500,
      temperature: 0.8,
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
