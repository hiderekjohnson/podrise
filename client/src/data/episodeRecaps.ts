export interface EpisodeRecap {
  podcastSlug: string;
  episodeSlug: string;
  episodeTitle: string;
  publishDate: string;
  artworkUrl: string;
  podcastName: string;
  hosts: string;
  tldl: string;
  sections: {
    heading: string;
    content: string;
  }[];
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-")
    .slice(0, 8)
    .join("-");
}

export const EPISODE_RECAPS: EpisodeRecap[] = [
  {
    podcastSlug: "myfirstmillion",
    episodeSlug: "built-50m-ai-app-in-high-school",
    episodeTitle: "I built a $50M AI app in high school (and just sold it for...)",
    publishDate: "2026-03-03",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/fc/be/b0/fcbeb0f0-fb7a-509e-1cd0-ab60222ee7e5/mza_17824311072672278584.jpeg/600x600bb.jpg",
    podcastName: "My First Million",
    hosts: "Sam Parr & Shaan Puri",
    tldl: "A high schooler built an AI-powered study tool that exploded to millions of users, caught the attention of a major edtech company, and sold for a rumored $50M+ — all before his 19th birthday. Sam and Shaan break down exactly how he did it and what founders can learn.",
    sections: [
      {
        heading: "What Happened",
        content: "Sam and Shaan sit down to dissect the story of a teenage founder who built an AI study assistant during COVID lockdowns. The app started as a simple tool to summarize textbook chapters using GPT-3 but quickly went viral on TikTok when students discovered it could generate practice questions and explain complex topics in plain English. Within 18 months, the app had over 8 million active users and was generating $2M+ in monthly revenue from a freemium subscription model. A major edtech acquirer came knocking, and the founder — still technically in high school — negotiated a deal reportedly worth north of $50 million."
      },
      {
        heading: "Key Insights",
        content: "The biggest takeaway: distribution matters more than the product. The founder didn't build the best AI — he built the most shareable one. His TikTok strategy of posting \"watch me ace this test using my app\" videos drove millions of organic downloads. Sam points out that the founder's age was actually an advantage: he understood exactly what students wanted because he was one. Shaan highlights the importance of speed — the founder launched a working MVP in two weeks, iterated based on user feedback daily, and never raised venture capital. The entire company was bootstrapped and profitable from month three."
      },
      {
        heading: "Opportunities Mentioned",
        content: "Sam and Shaan brainstorm similar opportunities: AI-powered tools for trade school students (plumbing, electrical, HVAC), an AI tutor for professional certifications (CPA, real estate, nursing), and a \"Duolingo for math\" that uses AI to adapt difficulty in real-time. They also discuss the broader trend of teenage founders building real companies and why the barrier to entry has never been lower thanks to AI coding tools and no-code platforms."
      },
      {
        heading: "Quotable Moment",
        content: "\"This kid didn't wait for permission. He didn't apply to Y Combinator. He didn't spend six months on a pitch deck. He just built the thing, put it on TikTok, and let the users decide. That's the new playbook.\" — Shaan Puri"
      }
    ]
  },
  {
    podcastSlug: "myfirstmillion",
    episodeSlug: "asked-450m-vc-where-to-invest-2026",
    episodeTitle: "I Asked a $450M VC Where to Invest in 2026",
    publishDate: "2026-03-01",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/fc/be/b0/fcbeb0f0-fb7a-509e-1cd0-ab60222ee7e5/mza_17824311072672278584.jpeg/600x600bb.jpg",
    podcastName: "My First Million",
    hosts: "Sam Parr & Shaan Puri",
    tldl: "Sam sits down with a VC managing $450M to get the inside scoop on where smart money is flowing in 2026. They cover AI infrastructure, vertical SaaS, healthcare tech, and the surprising sectors VCs are quietly pouring capital into.",
    sections: [
      {
        heading: "What Happened",
        content: "Sam interviews a venture capitalist who manages a $450M fund focused on early-stage B2B companies. The conversation covers the VC's investment thesis for 2026, which sectors are overhyped versus underhyped, and specific companies in his portfolio that are growing rapidly. The VC shares candid thoughts on why most AI startups will fail, which niches still have massive whitespace, and how founders should think about fundraising in the current market. He also reveals the one question he asks every founder in a pitch meeting that instantly tells him whether the company will succeed."
      },
      {
        heading: "Key Insights",
        content: "The VC's top three sectors for 2026: (1) AI infrastructure picks-and-shovels plays — not the models themselves, but the tooling, monitoring, and deployment layers around them. (2) Vertical SaaS for industries that still run on paper — construction, logistics, and agriculture. (3) Healthcare AI that reduces administrative burden rather than trying to replace doctors. His biggest warning: consumer AI apps are a terrible venture bet because retention is awful and switching costs are zero. He also shares that the best founders he's backed all had deep domain expertise — they weren't technical people looking for a problem, they were industry insiders who understood the pain firsthand."
      },
      {
        heading: "Opportunities Mentioned",
        content: "Specific opportunities discussed include: AI-powered compliance tools for financial services, software for managing fleets of autonomous vehicles, AI agents that handle insurance claims end-to-end, and platforms that help small manufacturers adopt robotics without hiring engineers. The VC also mentions that \"boring\" businesses like waste management and HVAC servicing are being transformed by software and represent huge opportunities for founders willing to get their hands dirty."
      },
      {
        heading: "Quotable Moment",
        content: "\"Everyone wants to build the next ChatGPT. But the real money is in building the boring stuff that makes ChatGPT actually useful for a specific industry. That's where the $100M companies are hiding.\" — Guest VC"
      }
    ]
  },
  {
    podcastSlug: "myfirstmillion",
    episodeSlug: "think-and-grow-rich-is-a-lie",
    episodeTitle: "'Think and Grow Rich' Is a Lie. (But The Advice Still Works)",
    publishDate: "2026-02-27",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/fc/be/b0/fcbeb0f0-fb7a-509e-1cd0-ab60222ee7e5/mza_17824311072672278584.jpeg/600x600bb.jpg",
    podcastName: "My First Million",
    hosts: "Sam Parr & Shaan Puri",
    tldl: "Sam and Shaan dissect Napoleon Hill's 'Think and Grow Rich' — separating the timeless business wisdom from the outright fabrications. They reveal which advice actually works for modern entrepreneurs and which parts are complete fiction.",
    sections: [
      {
        heading: "What Happened",
        content: "Sam and Shaan do a deep dive into one of the most influential business books ever written — Napoleon Hill's 'Think and Grow Rich.' They start by revealing the uncomfortable truth: many of the stories in the book are fabricated or heavily embellished. Hill likely never had extended conversations with Andrew Carnegie, and several of the success stories he cites have been debunked by historians. Despite this, Sam and Shaan argue that the core principles — having a definite purpose, the power of mastermind groups, persistent action, and auto-suggestion — are genuinely useful frameworks that have helped millions of entrepreneurs build real businesses."
      },
      {
        heading: "Key Insights",
        content: "The episode's central argument is that a book can be factually dishonest and still practically useful. Shaan compares it to fables — nobody cares that the tortoise and the hare never actually raced, because the lesson about persistence is real. Sam highlights three principles from the book that he's personally used to build The Hustle: (1) the \"definite chief aim\" — writing down exactly what you want and reading it every morning, (2) the \"mastermind\" principle — surrounding yourself with people smarter than you in specific domains, and (3) the \"burning desire\" test — if you wouldn't do it for free, you probably won't succeed at it. They also discuss why the self-help industry thrives on mythology and whether that's ultimately harmful or helpful."
      },
      {
        heading: "Opportunities Mentioned",
        content: "The conversation sparks ideas around modernizing classic business advice: a \"Think and Grow Rich\" for the AI era, a curated mastermind group platform (paid, high-quality, verified members), and a daily \"definite aim\" journaling app that uses AI to track progress toward goals. They also discuss the massive opportunity in debunking popular business myths through content — a YouTube channel or podcast dedicated to separating fact from fiction in business books."
      },
      {
        heading: "Quotable Moment",
        content: "\"The book is basically historical fan fiction. Napoleon Hill made up half the stories. But here's the thing — the advice still works. I used the 'definite chief aim' technique before I even knew it was from this book. Sometimes the messenger is trash but the message is gold.\" — Sam Parr"
      }
    ]
  },
  {
    podcastSlug: "myfirstmillion",
    episodeSlug: "dumb-iphone-apps-making-people-rich",
    episodeTitle: "Dumb iPhone Apps Are Making People Rich Again (Here's how)",
    publishDate: "2026-02-25",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/fc/be/b0/fcbeb0f0-fb7a-509e-1cd0-ab60222ee7e5/mza_17824311072672278584.jpeg/600x600bb.jpg",
    podcastName: "My First Million",
    hosts: "Sam Parr & Shaan Puri",
    tldl: "Sam and Shaan break down the resurgence of simple, \"dumb\" iPhone apps that are generating millions in revenue. From fart sound buttons to minimalist habit trackers, they explore why simplicity is winning and how indie developers are cashing in.",
    sections: [
      {
        heading: "What Happened",
        content: "Sam and Shaan explore a counterintuitive trend: while Big Tech companies pour billions into complex AI products, solo developers are quietly making fortunes with dead-simple iPhone apps. They spotlight several examples — a $4.99 white noise app doing $300K/month, a one-screen habit tracker earning $150K/month, and a novelty soundboard app that went viral and generated $2M in its first year. The key insight is that the App Store's discovery algorithm favors apps with high engagement and low churn, and simple apps often outperform complex ones on both metrics because users actually open them every day."
      },
      {
        heading: "Key Insights",
        content: "Three patterns emerge from the most successful simple apps: (1) They solve one micro-problem extremely well — no feature bloat, no onboarding flow, just instant value. (2) They use subscription pricing ($2.99-$6.99/month) which adds up fast at scale. (3) They're built by one or two people with near-zero overhead, so even modest download numbers translate to life-changing income. Shaan reveals his framework for evaluating app ideas: if you can explain the entire app in one sentence and a five-year-old would understand the value, it's probably a winner. Sam adds that AI tools like Cursor and Replit have made it possible to build and ship a polished iOS app in a single weekend, further lowering the barrier."
      },
      {
        heading: "Opportunities Mentioned",
        content: "Specific app ideas discussed: a \"focus mode\" app that blocks everything except what you're working on (simpler than existing solutions), a daily photo journal that takes exactly one photo per day with no filters or sharing, a \"did I lock the door?\" app that logs when you leave the house, and a minimalist meal planner that only shows three options per meal. They also discuss the opportunity to acquire existing simple apps that are profitable but abandoned by their developers."
      },
      {
        heading: "Quotable Moment",
        content: "\"We're living in the golden age of dumb apps. A guy made a fart soundboard and retired at 28. Meanwhile, some VC-backed startup with 50 engineers just shut down. The lesson? Users don't want more features. They want less.\" — Shaan Puri"
      }
    ]
  },
  {
    podcastSlug: "myfirstmillion",
    episodeSlug: "selling-acs-to-tourism-king-of-jamaica",
    episodeTitle: "From selling ACs to becoming the tourism king of Jamaica",
    publishDate: "2026-02-21",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/fc/be/b0/fcbeb0f0-fb7a-509e-1cd0-ab60222ee7e5/mza_17824311072672278584.jpeg/600x600bb.jpg",
    podcastName: "My First Million",
    hosts: "Sam Parr & Shaan Puri",
    tldl: "An entrepreneur who started by selling air conditioners in Jamaica pivoted into tourism and built a hospitality empire. Sam and Shaan break down his unconventional path, the power of local market dominance, and why tourism businesses are underrated.",
    sections: [
      {
        heading: "What Happened",
        content: "Sam and Shaan interview an entrepreneur who built a tourism empire in Jamaica starting from humble beginnings selling and installing air conditioning units. The guest explains how his AC business gave him access to every hotel and resort on the island, which led him to spot a massive gap in the market: tourists wanted authentic local experiences but had no reliable way to find them. He started by organizing small group tours, then expanded into boutique accommodations, airport transfers, and eventually a full-service tourism platform that now handles over 100,000 visitors per year. His company went from zero to $20M+ in annual revenue in under a decade."
      },
      {
        heading: "Key Insights",
        content: "The biggest lesson: your first business doesn't have to be your forever business — but it should give you unfair advantages for your next one. The AC business wasn't glamorous, but it gave the founder three things that made his tourism play unstoppable: (1) relationships with every hotel operator on the island, (2) deep knowledge of local infrastructure and logistics, and (3) cash flow to self-fund the transition. Sam highlights the \"local monopoly\" strategy — instead of trying to compete globally, dominate one geographic market so thoroughly that you become the default. Shaan notes that tourism is a $9 trillion global industry that's surprisingly underserved by technology, especially in developing markets."
      },
      {
        heading: "Opportunities Mentioned",
        content: "The episode sparks discussion about tourism opportunities in other developing markets — Southeast Asia, Central America, Eastern Europe, and Africa all have growing tourist sectors with minimal tech infrastructure. Specific ideas include: a \"Viator but local\" platform for emerging destinations, luxury van/bus touring companies for retirees, and acquiring small hotels in tourist areas and modernizing their booking and operations with software. They also discuss the trend of \"bleisure\" travel (business + leisure) and how entrepreneurs can capitalize on remote workers who want to travel while working."
      },
      {
        heading: "Quotable Moment",
        content: "\"Everyone's trying to build the next billion-dollar app. Meanwhile, this guy became a multi-millionaire by helping tourists find the best jerk chicken in Montego Bay. Sometimes the best businesses are the ones that VCs would never fund.\" — Sam Parr"
      }
    ]
  }
];

export function getEpisodesByPodcast(podcastSlug: string): EpisodeRecap[] {
  return EPISODE_RECAPS.filter(e => e.podcastSlug === podcastSlug);
}

export function getEpisodeBySlug(podcastSlug: string, episodeSlug: string): EpisodeRecap | undefined {
  return EPISODE_RECAPS.find(e => e.podcastSlug === podcastSlug && e.episodeSlug === episodeSlug);
}

export function getAdjacentEpisodes(podcastSlug: string, episodeSlug: string): { prev?: EpisodeRecap; next?: EpisodeRecap } {
  const episodes = getEpisodesByPodcast(podcastSlug);
  const index = episodes.findIndex(e => e.episodeSlug === episodeSlug);
  if (index === -1) return {};
  return {
    prev: index < episodes.length - 1 ? episodes[index + 1] : undefined,
    next: index > 0 ? episodes[index - 1] : undefined,
  };
}
