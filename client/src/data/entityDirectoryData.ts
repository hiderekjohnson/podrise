export interface PersonEntry {
  slug: string;
  name: string;
  title: string;
  bio: string;
  imageUrl: string;
  searchTerms: string[];
  hostedPodcastSlugs: string[];
  socialLinks: {
    twitter?: string;
    linkedin?: string;
    instagram?: string;
    website?: string;
  };
}

export interface CompanyEntry {
  slug: string;
  name: string;
  description: string;
  background: string;
  logoUrl: string;
  searchTerms: string[];
  details: {
    headquarters: string;
    founded: string;
    employees: string;
    marketCap?: string;
    ceo: string;
    industry: string;
    website: string;
  };
}

export const PEOPLE_DIRECTORY: PersonEntry[] = [
  {
    slug: "elon-musk",
    name: "Elon Musk",
    title: "CEO of Tesla & SpaceX",
    bio: "Elon Musk is a business magnate and investor known for leading Tesla, SpaceX, and xAI. He acquired Twitter (now X) in 2022. Previously co-founded PayPal and Neuralink. He is one of the wealthiest people in the world and a frequent topic in business, technology, and political podcasts.",
    imageUrl: "https://unavatar.io/x/elonmusk",
    searchTerms: ["Elon Musk"],
    hostedPodcastSlugs: [],
    socialLinks: {
      twitter: "https://x.com/elonmusk",
      website: "https://tesla.com",
    },
  },
  {
    slug: "sam-altman",
    name: "Sam Altman",
    title: "CEO of OpenAI",
    bio: "Sam Altman is the CEO of OpenAI, the company behind ChatGPT and GPT-4. He previously served as president of Y Combinator. Altman is a central figure in the AI revolution and is frequently discussed across technology and business podcasts for his role in shaping the future of artificial intelligence.",
    imageUrl: "https://unavatar.io/x/sama",
    searchTerms: ["Sam Altman"],
    hostedPodcastSlugs: [],
    socialLinks: {
      twitter: "https://x.com/sama",
      linkedin: "https://linkedin.com/in/samaltman",
      website: "https://openai.com",
    },
  },
  {
    slug: "joe-rogan",
    name: "Joe Rogan",
    title: "Host of The Joe Rogan Experience",
    bio: "Joe Rogan is a comedian, UFC commentator, and host of The Joe Rogan Experience, one of the most popular podcasts in the world with an exclusive Spotify deal. His wide-ranging interviews span science, politics, comedy, and culture, making him a frequent reference point across the podcast ecosystem.",
    imageUrl: "https://unavatar.io/x/joerogan",
    searchTerms: ["Joe Rogan"],
    hostedPodcastSlugs: ["joerogan"],
    socialLinks: {
      twitter: "https://x.com/joerogan",
      instagram: "https://instagram.com/joerogan",
      website: "https://joerogan.com",
    },
  },
  {
    slug: "lex-fridman",
    name: "Lex Fridman",
    title: "Host of Lex Fridman Podcast",
    bio: "Lex Fridman is an AI researcher at MIT and host of the Lex Fridman Podcast, known for long-form, deep conversations with scientists, entrepreneurs, and world leaders. His interviews cover AI, physics, philosophy, and the human condition, earning him a massive global following.",
    imageUrl: "https://unavatar.io/x/lexfridman",
    searchTerms: ["Lex Fridman"],
    hostedPodcastSlugs: ["lexfridman"],
    socialLinks: {
      twitter: "https://x.com/lexfridman",
      linkedin: "https://linkedin.com/in/lexfridman",
      website: "https://lexfridman.com",
    },
  },
  {
    slug: "naval-ravikant",
    name: "Naval Ravikant",
    title: "Co-founder of AngelList",
    bio: "Naval Ravikant is an entrepreneur, angel investor, and philosopher best known for co-founding AngelList. He is widely admired for his tweets and essays on wealth creation, happiness, and personal freedom. His ideas are frequently cited across business and self-improvement podcasts.",
    imageUrl: "https://unavatar.io/x/naval",
    searchTerms: ["Naval Ravikant", "Naval"],
    hostedPodcastSlugs: [],
    socialLinks: {
      twitter: "https://x.com/naval",
      website: "https://nav.al",
    },
  },
  {
    slug: "peter-thiel",
    name: "Peter Thiel",
    title: "Co-founder of PayPal & Palantir",
    bio: "Peter Thiel is a billionaire entrepreneur and venture capitalist who co-founded PayPal and Palantir Technologies. He was the first outside investor in Facebook. Known for his contrarian thinking, his book 'Zero to One' is widely referenced in startup and business discussions.",
    imageUrl: "https://unavatar.io/x/peterthiel",
    searchTerms: ["Peter Thiel", "Thiel"],
    hostedPodcastSlugs: [],
    socialLinks: {
      twitter: "https://x.com/peterthiel",
      website: "https://thielfoundation.org",
    },
  },
  {
    slug: "chamath-palihapitiya",
    name: "Chamath Palihapitiya",
    title: "CEO of Social Capital",
    bio: "Chamath Palihapitiya is a venture capitalist, engineer, and co-host of the All-In Podcast. He is the founder and CEO of Social Capital and was an early senior executive at Facebook. He is known for his outspoken views on markets, tech, and politics.",
    imageUrl: "https://unavatar.io/x/chaaborz",
    searchTerms: ["Chamath Palihapitiya", "Chamath"],
    hostedPodcastSlugs: ["allin"],
    socialLinks: {
      twitter: "https://x.com/chaaborz",
      linkedin: "https://linkedin.com/in/chamath",
      website: "https://socialcapital.com",
    },
  },
  {
    slug: "jason-calacanis",
    name: "Jason Calacanis",
    title: "Angel Investor & Host of This Week in Startups",
    bio: "Jason Calacanis is a serial entrepreneur, angel investor, and host of This Week in Startups and co-host of the All-In Podcast. He was an early investor in Uber, Robinhood, and Calm. Known for his energetic takes on startups, venture capital, and technology trends.",
    imageUrl: "https://unavatar.io/x/jason",
    searchTerms: ["Jason Calacanis", "Calacanis"],
    hostedPodcastSlugs: ["allin", "thisweekinstartups"],
    socialLinks: {
      twitter: "https://x.com/jason",
      linkedin: "https://linkedin.com/in/jasoncalacanis",
      website: "https://calacanis.com",
    },
  },
  {
    slug: "marc-andreessen",
    name: "Marc Andreessen",
    title: "Co-founder of Andreessen Horowitz",
    bio: "Marc Andreessen is a software engineer, entrepreneur, and venture capitalist. He co-created Mosaic, the first widely used web browser, and co-founded Netscape. He now leads Andreessen Horowitz (a16z), one of Silicon Valley's most influential VC firms. His 'software is eating the world' thesis is a defining narrative of the tech industry.",
    imageUrl: "https://unavatar.io/x/pmarca",
    searchTerms: ["Marc Andreessen", "Andreessen"],
    hostedPodcastSlugs: ["a16z"],
    socialLinks: {
      twitter: "https://x.com/pmarca",
      website: "https://a16z.com",
    },
  },
  {
    slug: "jensen-huang",
    name: "Jensen Huang",
    title: "CEO of NVIDIA",
    bio: "Jensen Huang is the co-founder and CEO of NVIDIA, which has become one of the most valuable companies in the world due to the AI boom. Under his leadership, NVIDIA's GPUs became the backbone of AI training and inference. He is widely discussed in technology, finance, and AI podcasts.",
    imageUrl: "https://unavatar.io/x/nvidia",
    searchTerms: ["Jensen Huang"],
    hostedPodcastSlugs: [],
    socialLinks: {
      twitter: "https://x.com/nvidia",
      website: "https://nvidia.com",
    },
  },
];

export const COMPANIES_DIRECTORY: CompanyEntry[] = [
  {
    slug: "openai",
    name: "OpenAI",
    description: "AI research and deployment company behind ChatGPT and GPT-4",
    background: "OpenAI was founded in 2015 as a non-profit AI research lab by Sam Altman, Elon Musk, and others. It transitioned to a capped-profit model and launched ChatGPT in November 2022, igniting the generative AI revolution. OpenAI develops the GPT series of large language models, DALL-E for image generation, and the Sora video model. It is one of the most discussed companies in technology today.",
    logoUrl: "https://logo.clearbit.com/openai.com",
    searchTerms: ["OpenAI", "ChatGPT", "GPT-4", "GPT4"],
    details: {
      headquarters: "San Francisco, CA",
      founded: "2015",
      employees: "~3,500",
      marketCap: "$300B+ (estimated valuation)",
      ceo: "Sam Altman",
      industry: "Artificial Intelligence",
      website: "https://openai.com",
    },
  },
  {
    slug: "tesla",
    name: "Tesla",
    description: "Electric vehicle and clean energy company",
    background: "Tesla, Inc. designs, manufactures, and sells electric vehicles, energy storage systems, and solar products. Founded in 2003 and led by Elon Musk since 2008, Tesla has revolutionized the auto industry and is the world's most valuable automaker. The company's vehicles, autonomous driving technology, and energy products are frequently discussed across business and technology podcasts.",
    logoUrl: "https://logo.clearbit.com/tesla.com",
    searchTerms: ["Tesla"],
    details: {
      headquarters: "Austin, TX",
      founded: "2003",
      employees: "~140,000",
      marketCap: "$800B+",
      ceo: "Elon Musk",
      industry: "Electric Vehicles & Clean Energy",
      website: "https://tesla.com",
    },
  },
  {
    slug: "nvidia",
    name: "NVIDIA",
    description: "Semiconductor company powering AI and gaming",
    background: "NVIDIA Corporation is an American multinational technology company that designs GPUs and system-on-chip units. Originally known for graphics processing in gaming, NVIDIA has become the dominant supplier of chips used in AI training and inference. Its data center revenue has skyrocketed with the AI boom, making it one of the most valuable companies in the world.",
    logoUrl: "https://logo.clearbit.com/nvidia.com",
    searchTerms: ["NVIDIA", "Nvidia"],
    details: {
      headquarters: "Santa Clara, CA",
      founded: "1993",
      employees: "~30,000",
      marketCap: "$3T+",
      ceo: "Jensen Huang",
      industry: "Semiconductors & AI Computing",
      website: "https://nvidia.com",
    },
  },
  {
    slug: "google",
    name: "Google",
    description: "Technology company and search engine giant",
    background: "Google LLC, a subsidiary of Alphabet Inc., is the world's leading search engine and a major player in advertising, cloud computing, and artificial intelligence. Google developed the Transformer architecture that underpins modern AI, and its AI lab DeepMind created AlphaGo and Gemini. Google's products — Search, YouTube, Android, Chrome, Gmail — are used by billions worldwide.",
    logoUrl: "https://logo.clearbit.com/google.com",
    searchTerms: ["Google", "Alphabet", "DeepMind", "Gemini AI"],
    details: {
      headquarters: "Mountain View, CA",
      founded: "1998",
      employees: "~180,000",
      marketCap: "$2T+",
      ceo: "Sundar Pichai",
      industry: "Technology & Internet Services",
      website: "https://google.com",
    },
  },
  {
    slug: "microsoft",
    name: "Microsoft",
    description: "Technology company behind Windows, Azure, and Copilot",
    background: "Microsoft Corporation is a global technology leader known for Windows, Office, Azure cloud, and LinkedIn. Microsoft has invested heavily in OpenAI and integrated AI across its product suite with Copilot. Under CEO Satya Nadella, Microsoft has transformed into a cloud-first, AI-first company and briefly became the world's most valuable company.",
    logoUrl: "https://logo.clearbit.com/microsoft.com",
    searchTerms: ["Microsoft", "Azure"],
    details: {
      headquarters: "Redmond, WA",
      founded: "1975",
      employees: "~220,000",
      marketCap: "$3T+",
      ceo: "Satya Nadella",
      industry: "Technology & Cloud Computing",
      website: "https://microsoft.com",
    },
  },
  {
    slug: "apple",
    name: "Apple",
    description: "Consumer electronics and software company",
    background: "Apple Inc. designs and sells consumer electronics, software, and services. Known for the iPhone, Mac, iPad, Apple Watch, and its services ecosystem (App Store, Apple Music, iCloud, Apple TV+). Apple is one of the world's most valuable companies and its product launches, design philosophy, and ecosystem strategy are perennial podcast topics.",
    logoUrl: "https://logo.clearbit.com/apple.com",
    searchTerms: ["Apple Inc", "Apple's"],
    details: {
      headquarters: "Cupertino, CA",
      founded: "1976",
      employees: "~160,000",
      marketCap: "$3.5T+",
      ceo: "Tim Cook",
      industry: "Consumer Electronics & Software",
      website: "https://apple.com",
    },
  },
  {
    slug: "amazon",
    name: "Amazon",
    description: "E-commerce and cloud computing giant",
    background: "Amazon.com, Inc. is the world's largest e-commerce company and a leader in cloud computing through Amazon Web Services (AWS). Founded by Jeff Bezos in 1994, Amazon has expanded into streaming (Prime Video), AI (Alexa, Bedrock), logistics, and grocery (Whole Foods). AWS powers a significant portion of the internet's infrastructure.",
    logoUrl: "https://logo.clearbit.com/amazon.com",
    searchTerms: ["Amazon", "AWS"],
    details: {
      headquarters: "Seattle, WA",
      founded: "1994",
      employees: "~1,500,000",
      marketCap: "$2T+",
      ceo: "Andy Jassy",
      industry: "E-commerce & Cloud Computing",
      website: "https://amazon.com",
    },
  },
  {
    slug: "anthropic",
    name: "Anthropic",
    description: "AI safety company behind Claude",
    background: "Anthropic is an AI safety startup founded in 2021 by Dario and Daniela Amodei, former OpenAI executives. The company builds Claude, a family of large language models focused on being helpful, harmless, and honest. Anthropic has raised billions from investors including Google and Amazon, and is considered one of the leading AI companies alongside OpenAI.",
    logoUrl: "https://logo.clearbit.com/anthropic.com",
    searchTerms: ["Anthropic"],
    details: {
      headquarters: "San Francisco, CA",
      founded: "2021",
      employees: "~1,500",
      marketCap: "$60B+ (estimated valuation)",
      ceo: "Dario Amodei",
      industry: "Artificial Intelligence & AI Safety",
      website: "https://anthropic.com",
    },
  },
  {
    slug: "meta",
    name: "Meta",
    description: "Social media and metaverse company (formerly Facebook)",
    background: "Meta Platforms, Inc. (formerly Facebook) is the parent company of Facebook, Instagram, WhatsApp, and Threads. Founded by Mark Zuckerberg in 2004, Meta rebranded in 2021 to reflect its focus on building the metaverse. The company is also a major player in AI, with its LLaMA open-source models and AI research lab (FAIR) being widely discussed in tech podcasts.",
    logoUrl: "https://logo.clearbit.com/meta.com",
    searchTerms: ["Meta Platforms", "Facebook", "Zuckerberg"],
    details: {
      headquarters: "Menlo Park, CA",
      founded: "2004",
      employees: "~67,000",
      marketCap: "$1.5T+",
      ceo: "Mark Zuckerberg",
      industry: "Social Media & Technology",
      website: "https://meta.com",
    },
  },
  {
    slug: "spacex",
    name: "SpaceX",
    description: "Aerospace manufacturer and space transportation company",
    background: "Space Exploration Technologies Corp. (SpaceX) is an American aerospace manufacturer founded by Elon Musk in 2002. SpaceX develops the Falcon 9 and Falcon Heavy rockets, the Dragon spacecraft, and the Starship launch system. Its Starlink subsidiary provides satellite internet worldwide. SpaceX has revolutionized space travel with reusable rockets and is working toward Mars colonization.",
    logoUrl: "https://logo.clearbit.com/spacex.com",
    searchTerms: ["SpaceX", "Starship", "Starlink"],
    details: {
      headquarters: "Hawthorne, CA",
      founded: "2002",
      employees: "~13,000",
      marketCap: "$350B+ (estimated valuation)",
      ceo: "Elon Musk",
      industry: "Aerospace & Space Transportation",
      website: "https://spacex.com",
    },
  },
];

export function getPersonBySlug(slug: string): PersonEntry | undefined {
  return PEOPLE_DIRECTORY.find((p) => p.slug === slug);
}

export function getCompanyBySlug(slug: string): CompanyEntry | undefined {
  return COMPANIES_DIRECTORY.find((c) => c.slug === slug);
}
