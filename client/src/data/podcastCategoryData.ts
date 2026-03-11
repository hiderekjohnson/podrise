import { PODCAST_LANDINGS, type PodcastLandingConfig } from "./podcastLandingData";

export interface CategoryTopic {
  slug: string;
  name: string;
  description: string;
}

export interface PodcastCategory {
  slug: string;
  name: string;
  description: string;
  topics: CategoryTopic[];
}

export const PODCAST_CATEGORIES: PodcastCategory[] = [
  {
    slug: "business",
    name: "Business",
    description: "The best business podcasts covering entrepreneurship, leadership, marketing, strategy, and more.",
    topics: [
      { slug: "entrepreneurship", name: "Entrepreneurship", description: "Stories and strategies from founders building companies from scratch." },
      { slug: "startups", name: "Startups", description: "From idea to scale — fundraising, product-market fit, and growth." },
      { slug: "leadership", name: "Leadership", description: "Frameworks and insights for leading teams and organizations." },
      { slug: "marketing", name: "Marketing", description: "Brand building, growth hacking, and modern marketing strategies." },
      { slug: "saas", name: "SaaS", description: "Software-as-a-service business models, metrics, and scaling." },
      { slug: "venture-capital", name: "Venture Capital", description: "How VCs evaluate deals, build portfolios, and shape the future." },
      { slug: "strategy", name: "Strategy", description: "Business strategy, competitive analysis, and decision-making." },
      { slug: "side-hustles", name: "Side Hustles", description: "Building income streams outside your day job." },
      { slug: "bootstrapping", name: "Bootstrapping", description: "Growing businesses without outside funding." },
    ],
  },
  {
    slug: "technology",
    name: "Technology",
    description: "Top technology podcasts covering AI, software engineering, product management, and emerging tech.",
    topics: [
      { slug: "ai", name: "AI", description: "Artificial intelligence, machine learning, and the future of computing." },
      { slug: "software-engineering", name: "Software Engineering", description: "Best practices in software development and engineering culture." },
      { slug: "product-management", name: "Product Management", description: "Building and shipping great products." },
      { slug: "crypto-web3", name: "Crypto & Web3", description: "Blockchain, cryptocurrency, and decentralized technologies." },
      { slug: "automation", name: "Automation", description: "Automating workflows, processes, and business operations." },
    ],
  },
  {
    slug: "finance",
    name: "Finance",
    description: "Leading finance podcasts on investing, personal finance, markets, and wealth building.",
    topics: [
      { slug: "investing", name: "Investing", description: "Market analysis, portfolio strategy, and investment philosophy." },
      { slug: "personal-finance", name: "Personal Finance", description: "Budgeting, saving, and building long-term wealth." },
      { slug: "crypto", name: "Crypto", description: "Cryptocurrency markets, DeFi, and digital assets." },
      { slug: "markets", name: "Markets", description: "Stock markets, economic trends, and financial analysis." },
      { slug: "financial-independence", name: "Financial Independence", description: "Strategies for achieving financial freedom." },
    ],
  },
  {
    slug: "health",
    name: "Health",
    description: "Top health podcasts exploring longevity, fitness, mental health, and science-backed wellness.",
    topics: [
      { slug: "longevity", name: "Longevity", description: "Science of aging, lifespan extension, and healthspan optimization." },
      { slug: "fitness", name: "Fitness", description: "Exercise science, training methods, and physical performance." },
      { slug: "mental-health", name: "Mental Health", description: "Psychology, therapy, and emotional wellbeing." },
      { slug: "functional-medicine", name: "Functional Medicine", description: "Root-cause approaches to health and healing." },
      { slug: "nutrition", name: "Nutrition", description: "Diet science, supplementation, and food as medicine." },
    ],
  },
  {
    slug: "self-improvement",
    name: "Self-Improvement",
    description: "Podcasts for personal growth — productivity, mindfulness, motivation, and career development.",
    topics: [
      { slug: "productivity", name: "Productivity", description: "Systems, habits, and tools for getting more done." },
      { slug: "mindfulness", name: "Mindfulness", description: "Meditation, presence, and mental clarity practices." },
      { slug: "motivation", name: "Motivation", description: "Inspiration and drive for achieving your goals." },
      { slug: "career-growth", name: "Career Growth", description: "Advancing your career and professional development." },
    ],
  },
  {
    slug: "society-culture",
    name: "Society & Culture",
    description: "Podcasts exploring interviews, comedy, storytelling, and the human experience.",
    topics: [
      { slug: "interviews", name: "Interviews", description: "Long-form conversations with fascinating people." },
      { slug: "comedy", name: "Comedy", description: "Humor, entertainment, and comedic storytelling." },
      { slug: "storytelling", name: "Storytelling", description: "Narrative-driven shows exploring real stories." },
    ],
  },
  {
    slug: "news",
    name: "News & Politics",
    description: "Stay informed with the best news and politics podcasts covering daily briefings and analysis.",
    topics: [
      { slug: "politics", name: "Politics", description: "Political analysis, policy debates, and government affairs." },
      { slug: "daily-briefings", name: "Daily Briefings", description: "Quick daily news updates and analysis." },
      { slug: "international", name: "International", description: "Global news, foreign affairs, and world events." },
    ],
  },
  {
    slug: "education",
    name: "Education",
    description: "Educational podcasts covering history, philosophy, science, and big ideas.",
    topics: [
      { slug: "history", name: "History", description: "Historical events, figures, and lessons from the past." },
      { slug: "philosophy", name: "Philosophy", description: "Philosophical ideas, ethics, and ways of thinking." },
      { slug: "science", name: "Science", description: "Scientific discoveries, research, and explanations." },
    ],
  },
  {
    slug: "psychology",
    name: "Psychology",
    description: "Psychology podcasts exploring human behavior, cognitive science, and the mind.",
    topics: [],
  },
  {
    slug: "science",
    name: "Science",
    description: "Science podcasts covering space, biology, physics, and the natural world.",
    topics: [],
  },
];

export const TOPIC_TO_TOPICS_PAGE_MAP: Record<string, string> = {
  "ai": "artificial-intelligence",
  "entrepreneurship": "entrepreneurship",
  "venture-capital": "venture-capital",
  "investing": "investing",
  "personal-finance": "personal-finance",
  "leadership": "leadership",
  "marketing": "marketing",
  "product-management": "product-management",
  "saas": "saas",
  "crypto": "crypto-web3",
  "crypto-web3": "crypto-web3",
  "productivity": "productivity",
  "longevity": "health-longevity",
  "psychology": "psychology",
  "self-improvement": "self-improvement",
  "startups": "startups",
  "bootstrapping": "bootstrapping",
  "side-hustles": "side-hustles",
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "business": ["business", "entrepreneurship", "startup", "saas", "management", "strategy", "acquisitions", "growth", "marketing", "online marketing", "side hustles", "company analysis", "business of tech", "organizational", "coaching", "lifestyle"],
  "technology": ["tech", "ai", "software", "engineering", "product management", "automotive", "consumer tech", "internet culture", "venture capital / software", "apple", "true crime"],
  "finance": ["finance", "investing", "markets", "wealth", "personal finance", "financial independence", "consumer advice", "money", "economics", "economic", "crypto"],
  "health": ["health", "fitness", "medicine", "longevity", "functional medicine", "performance science", "nutrition"],
  "self-improvement": ["self-improvement", "personal development", "motivation", "mindset", "empowerment", "productivity", "philosophy / self-improvement", "coaching"],
  "society-culture": ["society", "culture", "interviews", "comedy", "human stories", "narrative", "entertainment", "film", "tv", "arts", "sports", "relationships", "design"],
  "news": ["news", "politics", "law", "government", "daily", "international", "media", "weekly"],
  "education": ["education", "history", "language", "debates", "big ideas", "general knowledge", "philosophy / education", "philosophy / science"],
  "psychology": ["psychology", "behavior", "mental health", "wellbeing", "cognitive"],
  "science": ["science", "space", "fact-checking"],
};

const TOPIC_KEYWORDS: Record<string, Record<string, string[]>> = {
  "business": {
    "entrepreneurship": ["entrepreneurship", "entrepreneur", "founder", "how i built", "bootstrap", "goal digger"],
    "startups": ["startup", "startups", "early-stage", "startup funding", "the pitch", "startup chat"],
    "leadership": ["leadership", "leader", "management", "ceo", "executive", "military", "coaching for leaders", "adam grant", "brene brown", "lencioni", "jocko"],
    "marketing": ["marketing", "brand", "social media", "advertising", "seo", "content", "online marketing"],
    "saas": ["saas", "software-as-a-service"],
    "venture-capital": ["venture capital", "vc", "fundraising", "a16z", "twenty minute vc", "capital allocators"],
    "strategy": ["strategy", "management / strategy", "company analysis", "mckinsey", "business history"],
    "side-hustles": ["side hustle", "side hustles"],
    "bootstrapping": ["bootstrap", "bootstrapping", "rest of us"],
  },
  "technology": {
    "ai": ["ai", "artificial intelligence", "machine learning", "gpt", "llm", "deep learning", "cognitive revolution", "latent space"],
    "software-engineering": ["software engineering", "software development", "engineering", "pragmatic engineer", "net rocks"],
    "product-management": ["product management", "product", "lenny", "decoder"],
    "crypto-web3": ["crypto", "web3", "blockchain", "bitcoin", "ethereum"],
    "automation": ["automation", "automate"],
  },
  "finance": {
    "investing": ["investing", "investment", "investor", "stocks", "portfolio", "value investing", "hedge fund", "billionaires", "motley fool"],
    "personal-finance": ["personal finance", "money", "budgeting", "financial independence", "wealth building", "retirement", "ramsey", "clark howard", "white coat investor", "money guy", "afford anything"],
    "crypto": ["crypto", "bitcoin", "ethereum", "defi", "web3"],
    "markets": ["markets", "market", "economic trends", "animal spirits", "unhedged", "odd lots", "prof g markets"],
    "financial-independence": ["financial independence", "fire", "chooseFI"],
  },
  "health": {
    "longevity": ["longevity", "aging", "lifespan", "healthspan", "peter attia", "foundmyfitness"],
    "fitness": ["fitness", "exercise", "training", "workout", "david goggins"],
    "mental-health": ["mental health", "anxiety", "depression", "therapy"],
    "functional-medicine": ["functional medicine", "mark hyman", "farmacy"],
    "nutrition": ["nutrition", "diet", "food", "supplement"],
  },
  "self-improvement": {
    "productivity": ["productivity", "habits", "routines", "efficiency", "time management", "focus", "deep work"],
    "mindfulness": ["mindfulness", "meditation", "presence", "stoic", "daily stoic"],
    "motivation": ["motivation", "inspiration", "motivational", "mel robbins", "ed mylett"],
    "career-growth": ["career", "professional development", "career growth"],
  },
  "society-culture": {
    "interviews": ["interviews", "interview", "human stories", "conversations"],
    "comedy": ["comedy", "comedic", "humor", "conan", "smartless"],
    "storytelling": ["narrative", "storytelling", "this american life", "radiolab", "99% invisible"],
  },
  "news": {
    "politics": ["politics", "political", "government", "pod save", "law"],
    "daily-briefings": ["daily", "morning", "briefing", "news / daily"],
    "international": ["international", "global", "world", "foreign"],
  },
  "education": {
    "history": ["history", "historical"],
    "philosophy": ["philosophy", "philosophical", "stoic"],
    "science": ["science", "scientific"],
  },
};

export function getCategoryForPodcast(podcast: PodcastLandingConfig): string[] {
  const raw = podcast.category.toLowerCase();
  const matches: string[] = [];
  for (const [catSlug, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => raw.includes(kw))) {
      matches.push(catSlug);
    }
  }
  return matches.length > 0 ? matches : ["business"];
}

export function getTopicsForPodcast(podcast: PodcastLandingConfig, categorySlug: string): string[] {
  const raw = (podcast.category + " " + (podcast.keywords || "") + " " + podcast.name).toLowerCase();
  const topicMap = TOPIC_KEYWORDS[categorySlug];
  if (!topicMap) return [];
  const matches: string[] = [];
  for (const [topicSlug, keywords] of Object.entries(topicMap)) {
    if (keywords.some(kw => raw.includes(kw))) {
      matches.push(topicSlug);
    }
  }
  return matches;
}

export function getPodcastsForCategory(categorySlug: string): PodcastLandingConfig[] {
  return PODCAST_LANDINGS.filter(p => getCategoryForPodcast(p).includes(categorySlug));
}

export function getPodcastsForTopic(categorySlug: string, topicSlug: string): PodcastLandingConfig[] {
  return getPodcastsForCategory(categorySlug).filter(p => getTopicsForPodcast(p, categorySlug).includes(topicSlug));
}

export function getCategoryBySlug(slug: string): PodcastCategory | undefined {
  return PODCAST_CATEGORIES.find(c => c.slug === slug);
}

export function getQualifyingTopics(categorySlug: string): CategoryTopic[] {
  const category = getCategoryBySlug(categorySlug);
  if (!category) return [];
  return category.topics.filter(t => getPodcastsForTopic(categorySlug, t.slug).length >= 6);
}

export function getAllCategoryLinks(): { slug: string; name: string; count: number }[] {
  return PODCAST_CATEGORIES
    .map(c => ({ slug: c.slug, name: c.name, count: getPodcastsForCategory(c.slug).length }))
    .filter(c => c.count >= 6)
    .sort((a, b) => b.count - a.count);
}

export function getTopicsPageSlug(topicSlug: string): string | null {
  return TOPIC_TO_TOPICS_PAGE_MAP[topicSlug] || null;
}

export const ALL_CATEGORY_SLUGS = PODCAST_CATEGORIES.map(c => c.slug);
