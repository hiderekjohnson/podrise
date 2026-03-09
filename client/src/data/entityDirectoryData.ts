export interface PersonEntry {
  slug: string;
  name: string;
  title: string;
  imageUrl?: string;
  searchTerms: string[];
}

export interface CompanyEntry {
  slug: string;
  name: string;
  description: string;
  logoUrl?: string;
  searchTerms: string[];
}

export const PEOPLE_DIRECTORY: PersonEntry[] = [
  {
    slug: "elon-musk",
    name: "Elon Musk",
    title: "CEO of Tesla & SpaceX",
    searchTerms: ["Elon Musk", "Elon"],
  },
  {
    slug: "sam-altman",
    name: "Sam Altman",
    title: "CEO of OpenAI",
    searchTerms: ["Sam Altman"],
  },
  {
    slug: "joe-rogan",
    name: "Joe Rogan",
    title: "Host of The Joe Rogan Experience",
    searchTerms: ["Joe Rogan"],
  },
  {
    slug: "lex-fridman",
    name: "Lex Fridman",
    title: "Host of Lex Fridman Podcast",
    searchTerms: ["Lex Fridman"],
  },
  {
    slug: "naval-ravikant",
    name: "Naval Ravikant",
    title: "Co-founder of AngelList",
    searchTerms: ["Naval Ravikant", "Naval"],
  },
  {
    slug: "peter-thiel",
    name: "Peter Thiel",
    title: "Co-founder of PayPal & Palantir",
    searchTerms: ["Peter Thiel", "Thiel"],
  },
  {
    slug: "chamath-palihapitiya",
    name: "Chamath Palihapitiya",
    title: "CEO of Social Capital",
    searchTerms: ["Chamath Palihapitiya", "Chamath"],
  },
  {
    slug: "jason-calacanis",
    name: "Jason Calacanis",
    title: "Angel Investor & Host of This Week in Startups",
    searchTerms: ["Jason Calacanis", "Calacanis"],
  },
  {
    slug: "marc-andreessen",
    name: "Marc Andreessen",
    title: "Co-founder of Andreessen Horowitz",
    searchTerms: ["Marc Andreessen", "Andreessen"],
  },
  {
    slug: "jensen-huang",
    name: "Jensen Huang",
    title: "CEO of NVIDIA",
    searchTerms: ["Jensen Huang"],
  },
];

export const COMPANIES_DIRECTORY: CompanyEntry[] = [
  {
    slug: "openai",
    name: "OpenAI",
    description: "AI research and deployment company behind ChatGPT and GPT-4",
    searchTerms: ["OpenAI", "ChatGPT", "GPT-4", "GPT4"],
  },
  {
    slug: "tesla",
    name: "Tesla",
    description: "Electric vehicle and clean energy company",
    searchTerms: ["Tesla"],
  },
  {
    slug: "nvidia",
    name: "NVIDIA",
    description: "Semiconductor company powering AI and gaming",
    searchTerms: ["NVIDIA", "Nvidia"],
  },
  {
    slug: "google",
    name: "Google",
    description: "Technology company and search engine giant",
    searchTerms: ["Google", "Alphabet", "DeepMind", "Gemini AI"],
  },
  {
    slug: "microsoft",
    name: "Microsoft",
    description: "Technology company behind Windows, Azure, and Copilot",
    searchTerms: ["Microsoft", "Azure"],
  },
  {
    slug: "apple",
    name: "Apple",
    description: "Consumer electronics and software company",
    searchTerms: ["Apple Inc", "Apple's"],
  },
  {
    slug: "amazon",
    name: "Amazon",
    description: "E-commerce and cloud computing giant",
    searchTerms: ["Amazon", "AWS"],
  },
  {
    slug: "anthropic",
    name: "Anthropic",
    description: "AI safety company behind Claude",
    searchTerms: ["Anthropic", "Claude AI"],
  },
  {
    slug: "meta",
    name: "Meta",
    description: "Social media and metaverse company (formerly Facebook)",
    searchTerms: ["Meta Platforms", "Facebook", "Instagram", "Zuckerberg"],
  },
  {
    slug: "spacex",
    name: "SpaceX",
    description: "Aerospace manufacturer and space transportation company",
    searchTerms: ["SpaceX", "Starship", "Starlink"],
  },
];

export function getPersonBySlug(slug: string): PersonEntry | undefined {
  return PEOPLE_DIRECTORY.find((p) => p.slug === slug);
}

export function getCompanyBySlug(slug: string): CompanyEntry | undefined {
  return COMPANIES_DIRECTORY.find((c) => c.slug === slug);
}
