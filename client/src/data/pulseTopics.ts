import { VALID_PULSE_SLUGS } from "@shared/pulseSlugs";

export type PulseCategory = "industry" | "interest" | "role";

export interface PulseTopic {
  slug: string;
  name: string;
  category: PulseCategory;
  description: string;
  browseTopicSlug?: string;
}

export { VALID_PULSE_SLUGS };

export const PULSE_TOPICS: PulseTopic[] = [
  {
    slug: "venture-capital-pe",
    name: "Venture Capital & Private Equity",
    category: "industry",
    description: "Deal flow, fund strategy, and market cycles from the world's top investors.",
    browseTopicSlug: "venture-capital",
  },
  {
    slug: "artificial-intelligence",
    name: "Artificial Intelligence",
    category: "industry",
    description: "Breakthroughs in AI, LLMs, and machine learning reshaping every industry.",
    browseTopicSlug: "ai",
  },
  {
    slug: "real-estate",
    name: "Real Estate",
    category: "industry",
    description: "Commercial and residential markets, REITs, and property investment trends.",
  },
  {
    slug: "financial-services",
    name: "Financial Services",
    category: "industry",
    description: "Banking, fintech, insurance, and the evolution of financial infrastructure.",
  },
  {
    slug: "healthcare-biotech",
    name: "Healthcare & Biotech",
    category: "industry",
    description: "Drug development, health systems, and biotech innovation at the frontier.",
  },
  {
    slug: "technology-saas",
    name: "Technology & SaaS",
    category: "industry",
    description: "Enterprise software, cloud platforms, and the SaaS business model.",
    browseTopicSlug: "saas",
  },
  {
    slug: "media-advertising",
    name: "Media & Advertising",
    category: "industry",
    description: "The evolving media landscape, ad tech, and attention economy.",
    browseTopicSlug: "media-content",
  },
  {
    slug: "defense-national-security",
    name: "Defense & National Security",
    category: "industry",
    description: "Defense tech, cybersecurity, and the intersection of Silicon Valley and the Pentagon.",
    browseTopicSlug: "defense-tech",
  },
  {
    slug: "climate-energy",
    name: "Climate & Energy",
    category: "industry",
    description: "Clean energy, climate policy, and the companies driving the energy transition.",
    browseTopicSlug: "climate-energy",
  },
  {
    slug: "legal",
    name: "Legal",
    category: "industry",
    description: "Legal tech, regulatory shifts, and the business of law.",
  },
  {
    slug: "crypto-web3",
    name: "Crypto & Web3",
    category: "industry",
    description: "Bitcoin, DeFi, blockchain infrastructure, and the decentralized web.",
    browseTopicSlug: "crypto-web3",
  },
  {
    slug: "entrepreneurship-startups",
    name: "Entrepreneurship & Startups",
    category: "interest",
    description: "Founder stories, startup strategy, and the journey from idea to scale.",
    browseTopicSlug: "entrepreneurship",
  },
  {
    slug: "marketing",
    name: "Marketing",
    category: "role",
    description: "Growth strategies, brand building, and modern marketing playbooks.",
    browseTopicSlug: "marketing",
  },
  {
    slug: "sales",
    name: "Sales",
    category: "role",
    description: "Pipeline management, deal tactics, and revenue acceleration.",
    browseTopicSlug: "sales",
  },
  {
    slug: "product",
    name: "Product",
    category: "role",
    description: "Product strategy, roadmapping, and building what users actually want.",
    browseTopicSlug: "product-management",
  },
  {
    slug: "engineering",
    name: "Engineering",
    category: "role",
    description: "Software architecture, technical leadership, and engineering culture.",
    browseTopicSlug: "engineering",
  },
  {
    slug: "finance",
    name: "Finance",
    category: "role",
    description: "Corporate finance, capital allocation, and financial strategy.",
    browseTopicSlug: "finance",
  },
  {
    slug: "executive-leadership",
    name: "Executive & Leadership",
    category: "role",
    description: "C-suite strategy, board governance, and high-stakes decision making.",
    browseTopicSlug: "executive",
  },
  {
    slug: "founder-ceo",
    name: "Founder & CEO",
    category: "role",
    description: "The founder journey — hiring, fundraising, and scaling under pressure.",
    browseTopicSlug: "founder",
  },
  {
    slug: "operations",
    name: "Operations",
    category: "role",
    description: "Operational excellence, systems thinking, and scaling processes.",
  },
  {
    slug: "investing",
    name: "Investing",
    category: "interest",
    description: "Market analysis, portfolio strategy, and investment philosophy.",
    browseTopicSlug: "investing",
  },
  {
    slug: "people-hr",
    name: "People & HR",
    category: "role",
    description: "Talent strategy, culture building, and the future of work.",
  },
  {
    slug: "business-development",
    name: "Business Development",
    category: "role",
    description: "Partnerships, market expansion, and strategic growth initiatives.",
  },
  {
    slug: "health-longevity",
    name: "Health & Longevity",
    category: "interest",
    description: "Nutrition, exercise, sleep science, and the quest to live better, longer.",
    browseTopicSlug: "health-longevity",
  },
  {
    slug: "psychology",
    name: "Psychology",
    category: "interest",
    description: "Behavioral science, mental models, and understanding the human mind.",
    browseTopicSlug: "psychology",
  },
  {
    slug: "personal-finance",
    name: "Personal Finance",
    category: "interest",
    description: "Budgeting, wealth building, and practical financial advice.",
    browseTopicSlug: "personal-finance",
  },
  {
    slug: "productivity",
    name: "Productivity",
    category: "interest",
    description: "Systems, tools, and habits that help you get more done with less stress.",
    browseTopicSlug: "productivity",
  },
  {
    slug: "geopolitics",
    name: "Geopolitics",
    category: "interest",
    description: "Global power dynamics, trade wars, and international strategy.",
    browseTopicSlug: "geopolitics",
  },
  {
    slug: "fitness-performance",
    name: "Fitness & Performance",
    category: "interest",
    description: "Training, biohacking, and the science of peak human performance.",
    browseTopicSlug: "peak-performance",
  },
  {
    slug: "science-innovation",
    name: "Science & Innovation",
    category: "interest",
    description: "Cutting-edge research, breakthrough discoveries, and the future of science.",
  },
];

export const PULSE_INDUSTRIES = PULSE_TOPICS.filter(t => t.category === "industry");
export const PULSE_INTERESTS = PULSE_TOPICS.filter(t => t.category === "interest");
export const PULSE_ROLES = PULSE_TOPICS.filter(t => t.category === "role");

export function getPulseTopicBySlug(slug: string): PulseTopic | undefined {
  return PULSE_TOPICS.find(t => t.slug === slug);
}
