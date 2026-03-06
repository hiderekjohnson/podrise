export interface EpisodeRecap {
  podcastSlug: string;
  episodeSlug: string;
  episodeTitle: string;
  publishDate: string;
  duration: string;
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
    duration: "96 min",
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
    duration: "80 min",
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
    duration: "71 min",
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
    duration: "69 min",
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
    duration: "68 min",
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
  },
  {
    podcastSlug: "myfirstmillion",
    episodeSlug: "elons-wildest-interview-yet-our-reaction",
    episodeTitle: "Elon's wildest interview yet — our reaction",
    publishDate: "2026-02-18",
    duration: "95 min",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/fc/be/b0/fcbeb0f0-fb7a-509e-1cd0-ab60222ee7e5/mza_17824311072672278584.jpeg/600x600bb.jpg",
    podcastName: "My First Million",
    hosts: "Sam Parr & Shaan Puri",
    tldl: "Elon Musk's recent interview showcases a unique dynamic with Dwarkesh, who challenges Musk's ideas in a way that's both technical and engaging. This conversation highlights Musk's hiring philosophy and his intense sense of urgency in achieving goals.",
    whatHappened: "The episode kicks off with a lively discussion about a recent podcast featuring Elon Musk, where Dwarkesh, a sharp and technical podcaster, takes a bold approach by pushing back against Musk's grand ideas. The hosts share their excitement, noting how Dwarkesh's energy and authenticity make for an engaging listen. Rather than simply marveling at Musk's predictions, Dwarkesh digs deeper, questioning the feasibility of concepts like launching thousands of rockets in rapid succession. This leads to a fascinating exchange where Musk defends his visions with technical reasoning, revealing both his confidence and the complexities of his ambitious projects.\n\nAs the conversation unfolds, Musk's hiring philosophy comes to light. He emphasizes the importance of exceptional ability over resumes, stating that he seeks evidence of outstanding accomplishments in potential hires. This perspective stems from his extensive experience in hiring for SpaceX, where he often interviews candidates himself. He shares that if he doesn't feel impressed within the first 20 minutes of a conversation, he tends to disregard the resume entirely. This insight into his hiring process reflects his broader approach to leadership, which values execution and results above all else.\n\nThroughout the episode, Musk's intense urgency and unique mindset are further explored. He candidly admits to aiming for deadlines he knows he might miss, yet believes this approach fosters productivity. The hosts resonate with Musk's character, humorously comparing his candidness to their own personalities. The discussion wraps up with a sense of admiration for both Musk's achievements and Dwarkesh's ability to challenge him, leaving listeners with a deeper understanding of what drives these extraordinary individuals.",
    keyInsights: [
      "Dwarkesh's technical acumen allows him to effectively challenge Musk's ideas, leading to a more dynamic conversation.",
      "Musk's hiring philosophy emphasizes seeking evidence of exceptional ability over relying on resumes.",
      "He believes in setting ambitious deadlines, even if it means missing them half the time, to encourage productivity.",
      "Musk's approach to leadership focuses on execution, stating, 'if you get things done, I love you. And if you don't, I hate you.'"
    ],
    quote: "I'm looking for evidence of exceptional ability. If in that first 20 minutes, I'm not saying, Wow, I believe the conversation and I don't believe the resume.",
    quoteAttribution: "Elon Musk"
  },
  {
    podcastSlug: "myfirstmillion",
    episodeSlug: "scott-galloway-why-im-selling-my-american-stocks",
    episodeTitle: "Scott Galloway: Why I'm selling my American stocks",
    publishDate: "2026-02-16",
    duration: "92 min",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/fc/be/b0/fcbeb0f0-fb7a-509e-1cd0-ab60222ee7e5/mza_17824311072672278584.jpeg/600x600bb.jpg",
    podcastName: "My First Million",
    hosts: "Sam Parr & Shaan Puri",
    tldl: "Scott Galloway challenges the perception of billionaires and shares his journey from wealth accumulation to seeking a meaningful purpose, emphasizing the importance of spending and giving back.",
    whatHappened: "Scott Galloway kicks off the conversation with a humorous take on his spending habits, likening himself to a '50s gangster just diagnosed with breast cancer — suddenly generous with his money. He shares how his perspective on wealth has shifted as he's gotten older, moving from accumulation to distribution. Galloway argues that the ultra-wealthy have a moral obligation to spend and give back rather than hoarding resources, challenging the narrative that billionaires are inherently admirable.\n\nThe discussion dives into Galloway's decision to sell his American stocks, driven by his concerns about the current economic and political landscape. He draws parallels between economic trends and historical patterns, suggesting that America's dominance in global markets may not be as secure as many assume. His argument centers on diversification — both in investments and in life — as a hedge against uncertainty.\n\nGalloway also reflects on his personal journey, discussing how his career in academia and media has given him a platform to challenge conventional wisdom. He shares candidly about the tension between enjoying wealth and using it responsibly, ultimately landing on the idea that purpose — not money — is what drives lasting fulfillment. The hosts push back and probe, creating a dynamic exchange about what it means to be wealthy in America today.",
    keyInsights: [
      "Galloway believes the ultra-wealthy have a moral obligation to spend and give back rather than accumulate indefinitely.",
      "His decision to sell American stocks is driven by concerns about geopolitical uncertainty and the belief that diversification is essential.",
      "He argues that old people have basically been ripping the economy for the last 30 or 40 years, calling for intergenerational economic fairness.",
      "Purpose and meaningful contribution, not wealth accumulation, are what drive lasting fulfillment according to Galloway."
    ],
    quote: "I feel like I have a deficit. I think I've taken more from the country and from taxpayers and from the system than I've given back.",
    quoteAttribution: "Scott Galloway"
  },
  {
    podcastSlug: "myfirstmillion",
    episodeSlug: "this-ai-agent-completes-your-to-do-list",
    episodeTitle: "This AI agent completes your To-Do list (plus 4 AI tools that'll blow you away)",
    publishDate: "2026-02-13",
    duration: "77 min",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/fc/be/b0/fcbeb0f0-fb7a-509e-1cd0-ab60222ee7e5/mza_17824311072672278584.jpeg/600x600bb.jpg",
    podcastName: "My First Million",
    hosts: "Sam Parr & Shaan Puri",
    tldl: "This episode explores groundbreaking AI tools that can enhance productivity and creativity, with a focus on one tool that autonomously manages to-do lists and tasks. Listeners learn how to leverage these innovations for business and personal efficiency.",
    whatHappened: "The conversation kicks off with the hosts, Sam and Garrett, challenging each other to showcase intriguing AI tools that push the boundaries of what's possible. They play a game called 'Blow My Mind' where each person presents an AI product that genuinely surprised them. The energy is infectious as they trade demos and reactions, moving beyond the standard ChatGPT conversation into territory that feels genuinely futuristic.\n\nThe standout tool is an AI agent that functions as a persistent background worker — it takes your to-do list and autonomously completes tasks while you focus on other things. The hosts demonstrate how it can research competitors, draft emails, schedule meetings, and even make purchasing decisions based on your preferences. The concept of having AI workers running 24/7 in the background represents a paradigm shift from the current model of prompting AI one question at a time.\n\nThe episode also covers tools for AI-generated video, voice cloning, and automated content creation. Each demo sparks a discussion about the business implications — who wins, who loses, and where the real money will be made. The hosts are particularly excited about the democratization of capabilities that previously required entire teams, noting that solo entrepreneurs now have access to tools that rival what large companies could do just a year ago.",
    keyInsights: [
      "AI background workers that autonomously complete to-do list tasks represent a paradigm shift from prompt-based AI interaction.",
      "Solo entrepreneurs now have access to AI tools that rival the capabilities of entire teams from just a year ago.",
      "The hosts predict that AI agents working in the background will become as common as having email within the next few years.",
      "Voice cloning and AI video generation have reached a quality level that makes them viable for business content creation."
    ],
    quote: "The idea of having background workers that are going to be constantly working for you... this is getting to a point where you have like a mini workforce.",
    quoteAttribution: "Garrett Camp"
  },
  {
    podcastSlug: "myfirstmillion",
    episodeSlug: "my-mother-in-laws-side-hustle-made-1m",
    episodeTitle: "My mother-in-law's side hustle made $1M selling pillows?!?",
    publishDate: "2026-02-11",
    duration: "50 min",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/fc/be/b0/fcbeb0f0-fb7a-509e-1cd0-ab60222ee7e5/mza_17824311072672278584.jpeg/600x600bb.jpg",
    podcastName: "My First Million",
    hosts: "Sam Parr & Shaan Puri",
    tldl: "Smithy Sodine, starting with just $10,000 and no prior online business experience, built a successful pillow company that generates millions annually. Her journey is a testament to taking action and learning on the go.",
    whatHappened: "The episode opens with Sam reminiscing about a pivotal conversation he had with his mother-in-law, Smithy, who approached him with an idea to start a business selling decorative pillows. With only $10,000 in startup capital and zero experience running an online business, Smithy dove in headfirst. Sam recounts how he initially underestimated the idea but was proven spectacularly wrong as the business took off.\n\nSmithy walks through the nuts and bolts of how she built the brand — from sourcing materials and finding manufacturers to setting up an online store and learning digital marketing from scratch. What makes her story compelling is the simplicity of it all. She didn't raise venture capital, didn't hire consultants, and didn't spend months on market research. She found a product she was passionate about, identified a gap in the decorative pillow market, and started selling.\n\nThe conversation takes an inspiring turn as Smithy reveals the business now generates millions in annual revenue with healthy margins. Sam reflects on what her success teaches about entrepreneurship — that overthinking and over-planning often prevent people from starting. Smithy's approach of learning by doing, combined with genuine passion for her product and exceptional customer service, created a business that runs almost on autopilot today.",
    keyInsights: [
      "Starting a business doesn't require extensive research or experience — taking action can lead to unexpected success.",
      "Finding a niche market can help in building a successful brand — Smithy targeted decorative pillows, an area she was passionate about.",
      "Strong customer service can differentiate a business and build lasting relationships with clients.",
      "Investing wisely and managing finances effectively can enable a small startup to grow into a multi-million dollar business."
    ],
    quote: "It was so simple to start this business in terms of financial investment. I started it with $10,000 and I've never invested another penny in it.",
    quoteAttribution: "Smithy Sodine"
  },
  {
    podcastSlug: "myfirstmillion",
    episodeSlug: "6-trends-youve-never-heard-of-that-might",
    episodeTitle: "6 Trends You've Never Heard Of (That Might Explode)",
    publishDate: "2026-02-09",
    duration: "73 min",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/fc/be/b0/fcbeb0f0-fb7a-509e-1cd0-ab60222ee7e5/mza_17824311072672278584.jpeg/600x600bb.jpg",
    podcastName: "My First Million",
    hosts: "Sam Parr & Shaan Puri",
    tldl: "Drinking is declining in popularity, while health and wellness trends are on the rise, leading to a surge in non-alcoholic alternatives and psychedelics. The shift in habits is reshaping the landscape of social interactions and wellness practices.",
    whatHappened: "The episode kicks off with an energetic exchange between Sam and Shaan, as Shaan shares six intriguing trends he's been tracking that have captured his attention. Notably, he highlights the decline in alcohol consumption, illustrated by skyrocketing spirit inventories. With a mix of humor and sincerity, they explore how the societal perception of drinking has shifted to prioritize health and wellness, leading to a growing acceptance of non-alcoholic beverages.\n\nShaan reflects on his own journey of sobriety, admitting he never anticipated the rise of the non-alcoholic beer movement, which has been championed by various startups. As they delve deeper, the conversation shifts to the intriguing question of what behaviors alcohol once fulfilled — leading them to consider substitutes like psychedelics, social media, and even nicotine-free products. They discuss the launch of Ultra, a company focused on cognitive enhancement through non-nicotine pouches, which has quickly gained traction among high performers.\n\nAmusing anecdotes about their personal experiences with nicotine and fitness equipment punctuate the discussion, highlighting the differences between their current lifestyles and past habits. The episode wraps up with a look at the cyclical nature of trends, suggesting that while the decline in drinking is significant now, it may eventually swing back as social habits evolve. Shaan also pitches a resource from his former company, The Hustle, aimed at aspiring entrepreneurs seeking side hustle ideas, ensuring listeners leave with actionable insights.",
    keyInsights: [
      "Alcohol consumption is declining as health trends rise, leading to increased popularity of non-alcoholic beverages.",
      "The rise of psychedelics is becoming a common practice among individuals seeking new experiences and personal growth.",
      "Ultra, a company selling non-nicotine focus pouches, has rapidly gained popularity among high performers, indicating a shift in how people seek cognitive enhancement.",
      "Trends in social behavior, such as decreased drinking, might be cyclical, suggesting that current preferences could change over time."
    ],
    quote: "Drinking ain't cool anymore. Being healthy is cool and drinking isn't cool.",
    quoteAttribution: "Shaan Puri"
  }
];

export function getEpisodesByPodcast(podcastSlug: string): EpisodeRecap[] {
  return EPISODE_RECAPS.filter(e => e.podcastSlug === podcastSlug);
}

export function getEpisodesByPodcastPaginated(podcastSlug: string, page: number, perPage: number = 25): { episodes: EpisodeRecap[]; totalPages: number; total: number } {
  const all = getEpisodesByPodcast(podcastSlug);
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage;
  return { episodes: all.slice(start, start + perPage), totalPages, total };
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
