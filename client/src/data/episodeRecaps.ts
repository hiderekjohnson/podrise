export interface EpisodeRecap {
  podcastSlug: string;
  episodeSlug: string;
  episodeTitle: string;
  publishDate: string;
  artworkUrl: string;
  podcastName: string;
  hosts: string;
  tldl: string;
  whatHappened: string;
  keyInsights: string[];
  quote?: string;
  quoteAttribution?: string;
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
    publishDate: "2026-03-05",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/fc/be/b0/fcbeb0f0-fb7a-509e-1cd0-ab60222ee7e5/mza_17824311072672278584.jpeg/600x600bb.jpg",
    podcastName: "My First Million",
    hosts: "Sam Parr & Shaan Puri",
    tldl: "Zach, a 19-year-old entrepreneur, shares his journey of building and selling his app, Cal AI, which achieved $30 million in revenue before its sale. His story highlights the power of audacity and self-belief in overcoming obstacles, including college rejections.",
    whatHappened: "The episode kicks off with Zach reflecting on his incredible journey from high school to selling his company at just 19. He reveals that he recently sold his app, Cal AI, which helps users log their meals through AI, for an undisclosed amount after hitting $30 million in revenue. The hosts marvel at his accomplishments, noting how calm and mature he sounds compared to the last time he appeared on the podcast, where he was still in high school during a lunch break.\n\nZach shares his experience with college admissions, revealing how he was rejected from multiple prestigious schools despite having a stellar GPA and a successful business. He tweets about the rejections, which goes viral and leads to support from notable figures, including the mayor of Miami. This unexpected publicity helps him find his footing and ultimately leads him to the University of Miami, where he is now a freshman, balancing school with his entrepreneurial ambitions.\n\nAs the conversation progresses, Zach discusses the importance of self-belief and how he always envisioned achieving his goals. He reflects on the audacity of claiming he would build a $50 million app while still in his teens and how that mindset fueled his success. The hosts emphasize that his blend of programming skills and marketing savvy has been crucial in his journey, allowing him to lead a team effectively and innovate in a competitive space.",
    keyInsights: [
      "Zach's app, Cal AI, generated $30 million in revenue before its sale, showcasing the potential of innovative tech solutions in the fitness industry.",
      "Despite being a high achiever, Zach faced college rejections, highlighting the often unpredictable nature of admissions processes.",
      "The viral response to his college rejection tweet led to unexpected networking opportunities, including support from influential people in his community.",
      "Zach emphasizes that success is not solely about being a coding prodigy; rather, it's about combining skills and audacity to manifest one's goals."
    ],
    quote: "I always believed in my heart I was going to do it. I just wanted it so badly that I needed it to be true.",
    quoteAttribution: "Zach"
  },
  {
    podcastSlug: "myfirstmillion",
    episodeSlug: "asked-450m-vc-where-to-invest-2026",
    episodeTitle: "I Asked a $450M VC Where to Invest in 2026",
    publishDate: "2026-03-03",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/fc/be/b0/fcbeb0f0-fb7a-509e-1cd0-ab60222ee7e5/mza_17824311072672278584.jpeg/600x600bb.jpg",
    podcastName: "My First Million",
    hosts: "Sam Parr & Shaan Puri",
    tldl: "Investing can yield asymmetric returns, where the potential upside far outweighs the downside. Building relationships and opportunities in life mirrors investment strategies, emphasizing the importance of expanding one's network.",
    whatHappened: "The conversation opens with a discussion about risk and reward in investing, highlighting how a $3 million investment can lead to a potential $300 million return. The guest, referred to as 'The Most Interesting Man in Tech,' walks through his framework for evaluating asymmetric bets — situations where the downside is capped but the upside is essentially unlimited.\n\nThe discussion broadens into how this same framework applies to life decisions. The guest argues that most people underinvest in social opportunities — hosting events, attending conferences, making introductions — because they don't see the compounding effect of relationship-building. He shares how building personal 'yachts' (memorable gathering experiences) can significantly enhance both personal and professional growth.\n\nThe hosts dig into the practical mechanics of increasing one's surface area for luck. Only a small fraction of investments — or relationships — will drive the majority of returns. The key insight is that volume matters: you need to increase the number of interactions and opportunities to find the few that will be transformative.",
    keyInsights: [
      "Investing allows for asymmetric risk where potential gains vastly exceed potential losses, as illustrated by the $3 million to $300 million example.",
      "Only a small fraction of investments will drive the majority of returns, suggesting that both in investing and life, focus should be on the few impactful connections or opportunities.",
      "Increasing social interactions and opportunities can lead to unexpected and rewarding outcomes, reinforcing the idea of expanding one's network.",
      "Building personal 'yachts' through hosting events or gatherings can significantly enhance relationship-building and create a compounding effect on personal and professional growth."
    ],
    quote: "There's a possibility of it being $300 million. But the downside is capped at $3 million.",
    quoteAttribution: "The Most Interesting Man in Tech"
  },
  {
    podcastSlug: "myfirstmillion",
    episodeSlug: "think-and-grow-rich-is-a-lie",
    episodeTitle: "'Think and Grow Rich' Is a Lie. (But The Advice Still Works)",
    publishDate: "2026-02-26",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/fc/be/b0/fcbeb0f0-fb7a-509e-1cd0-ab60222ee7e5/mza_17824311072672278584.jpeg/600x600bb.jpg",
    podcastName: "My First Million",
    hosts: "Sam Parr & Shaan Puri",
    tldl: "Despite the dubious backstory of Napoleon Hill, the principles in 'Think and Grow Rich' continue to resonate and provide valuable advice for achieving success.",
    whatHappened: "The conversation kicks off with a surprising revelation about 'Think and Grow Rich,' a book celebrated for its motivational content but whose author's credibility is deeply flawed. One host shares that the entire backstory is essentially fabricated — Napoleon Hill was a con man whose life was marked by failures, legal troubles, and outright deception. Hill likely never had the extended conversations with Andrew Carnegie that he claimed formed the foundation of the book.\n\nDespite this damning biography, the hosts argue that the advice itself holds up remarkably well. They walk through the key principles — the 'definite chief aim' of writing down exactly what you want, the 'mastermind' concept of surrounding yourself with brilliant collaborators, and the power of auto-suggestion and daily repetition. Both hosts share personal anecdotes of using these frameworks successfully in their own entrepreneurial journeys.\n\nThe conversation evolves into a broader discussion about whether it matters if self-help wisdom comes from flawed sources. The hosts compare it to fables — nobody cares that the tortoise and the hare never actually raced, because the underlying lesson about persistence is universally true. They conclude that the book's enduring popularity is proof that the ideas work, regardless of the messenger's integrity.",
    keyInsights: [
      "Napoleon Hill's life was marked by failures and legal issues, casting doubt on the credibility of his claims in 'Think and Grow Rich.'",
      "The concept of 'mastermind' was popularized by Hill, emphasizing collaboration among successful individuals.",
      "Writing down goals and repeating them daily can significantly increase the likelihood of achieving those goals.",
      "Despite the author's questionable integrity, the advice in 'Think and Grow Rich' remains relevant and effective for personal development."
    ],
    quote: "Everything I just told you is a lie. Except for Think and Grow Rich, amazing book. One of the best-selling books of all time.",
    quoteAttribution: "Sam Parr"
  },
  {
    podcastSlug: "myfirstmillion",
    episodeSlug: "dumb-iphone-apps-making-people-rich",
    episodeTitle: "Dumb iPhone Apps Are Making People Rich Again (Here's how)",
    publishDate: "2026-02-24",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/fc/be/b0/fcbeb0f0-fb7a-509e-1cd0-ab60222ee7e5/mza_17824311072672278584.jpeg/600x600bb.jpg",
    podcastName: "My First Million",
    hosts: "Sam Parr & Shaan Puri",
    tldl: "The episode reveals how founders are successfully launching simple yet effective iPhone apps that tap into everyday habits, often validated by viral marketing. A key takeaway is the importance of leveraging social media to gauge demand before building the product.",
    whatHappened: "The conversation kicks off with Pat from Starter Story sharing his recent milestone of being acquired by HubSpot, just days before the episode's recording. Despite the impending deal closure, he feels comfortable discussing the journey openly. Pat reveals the negotiation process and how he arrived at his target number — a figure he felt was authentic to his valuation of the business he'd built.\n\nThe discussion shifts to a fascinating trend Pat has been tracking: six out of twelve founders he speaks to weekly are finding massive success with simple iOS apps. These aren't complex AI products or enterprise tools — they're dead-simple apps that solve one micro-problem. One app literally forces you to do push-ups. Another went viral on social media before it was even built, proving demand before a single line of code was written.\n\nPat's secret weapon at Starter Story was requiring interviewees to disclose their actual revenue numbers. This transparency set the platform apart and provided genuinely useful data to aspiring entrepreneurs. The hosts dig into the broader lesson: founders are now flipping the traditional product development playbook. Instead of 'build it and they will come,' the new approach is 'see if they come, then build it.'",
    keyInsights: [
      "Six out of twelve founders Pat speaks to weekly are finding success with iOS apps, indicating a strong market opportunity.",
      "Pat's negotiation for the sale of Starter Story was influenced by a self-defined target number, which he felt was authentic to his valuation of the business.",
      "Requiring interviewees to disclose their revenue helped Starter Story stand out by providing valuable insights to aspiring entrepreneurs.",
      "Founders are now leveraging social media for validation before creating products, exemplified by an app that went viral before it was even developed."
    ],
    quote: "If we build it, they will come. It's like, if they come, then we'll build it, I guess.",
    quoteAttribution: "Pat"
  },
  {
    podcastSlug: "myfirstmillion",
    episodeSlug: "selling-acs-to-tourism-king-of-jamaica",
    episodeTitle: "From selling ACs to becoming the tourism king of Jamaica",
    publishDate: "2026-02-20",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/fc/be/b0/fcbeb0f0-fb7a-509e-1cd0-ab60222ee7e5/mza_17824311072672278584.jpeg/600x600bb.jpg",
    podcastName: "My First Million",
    hosts: "Sam Parr & Shaan Puri",
    tldl: "Gordon Stewart, a Jamaican entrepreneur, transformed the tourism landscape in Jamaica by reimagining resorts and focusing on service and speed, ultimately creating the Sandals brand. His story highlights the importance of identifying unique market opportunities and continuously adapting to consumer needs.",
    whatHappened: "Gordon Stewart, affectionately known as Butch, started his entrepreneurial journey in Jamaica by selling air conditioning units door-to-door. He recognized an untapped market in the Caribbean for AC units and differentiated himself from competitors like General Electric by offering rapid installation and exceptional service. His hustle paid off, allowing him to establish Appliance Traders Limited and dominate the AC market in Jamaica, which set the stage for his next venture into the hospitality industry.\n\nIn 1981, Butch took a bold step by purchasing a rundown hotel called Bayrock, despite skepticism surrounding tourism in Jamaica at the time. His vision was to create a luxurious, all-inclusive experience for couples seeking a carefree vacation. He rebranded the hotel as Sandals and implemented a business model that emphasized a single price for everything included, ensuring guests wouldn't feel nickel-and-dimed. Butch studied successful resorts to integrate their best ideas while crafting a unique identity around romance and exclusivity, positioning Sandals as a couples-only resort.\n\nButch's hands-on approach and commitment to quality led him to buy more distressed hotels across the Caribbean, where he meticulously improved operations based on guest feedback. His philosophy of continuous tweaking and adaptation helped Sandals become a leader in the hospitality market, employing thousands of locals and revitalizing the Jamaican economy. Stewart's story exemplifies the power of innovation and a customer-centric approach in building a successful business.",
    keyInsights: [
      "Butch Stewart identified a gap in the AC market in Jamaica, leveraging speed and service as his key differentiators against larger competitors.",
      "The creation of Sandals was rooted in a clear vision of offering couples an all-inclusive luxury experience, which was a radical departure from typical resort offerings at the time.",
      "Stewart's approach to hotel management included studying competitors and incorporating the best ideas, while also being hands-on to ensure quality at every level.",
      "His philosophy of continuous improvement and dedication to customer satisfaction played a crucial role in establishing brand loyalty and repeat business."
    ],
    quote: "The most valuable real estate and the hardest real estate to build is the one in the consumer's mind.",
    quoteAttribution: "Butch Stewart"
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
