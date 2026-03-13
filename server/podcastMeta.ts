import { PODCAST_SEO } from "@shared/podcastSeoData";
import { TOPICS } from "../client/src/data/topicData";
import { pool } from "./db";

interface PageMeta {
  title: string;
  description: string;
  image: string;
  url: string;
  twitterCard?: string;
  replaceFavicon?: boolean;
  jsonLd?: object | object[];
  ssrHtml?: string;
}

const STATIC_PAGES: Record<string, PageMeta | (() => PageMeta)> = {
  "/": () => {
    const topPodcasts = PODCAST_SEO.slice(0, 30);
    const podcastLinks = topPodcasts.map(p => `<li><a href="/podcasts/${escapeAttr(p.slug)}">${escapeAttr(p.name)}</a></li>`).join("");
    return {
      title: "PodCap - AI-Powered Podcast Intelligence Platform",
      description: "Get free AI-powered daily recaps for 240+ top podcasts. Episode summaries, key insights, notable quotes, and trending topics delivered to your inbox.",
      image: "https://podcap.io/favicon.png",
      url: "https://podcap.io",
      twitterCard: "summary",
      replaceFavicon: false,
      ssrHtml: `<div style="max-width:900px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>PodCap - Podcast Intelligence Platform</h1><p>AI-powered daily recaps for ${PODCAST_SEO.length}+ top podcasts. Get episode summaries, key insights, notable quotes, and trending topics.</p><nav><ul style="display:flex;gap:16px;list-style:none;padding:0;"><li><a href="/podcasts">All Podcasts</a></li><li><a href="/people">People</a></li><li><a href="/companies">Companies</a></li><li><a href="/insights">Insights</a></li><li><a href="/bookstore">Bookstore</a></li><li><a href="/trends">Trends</a></li></ul></nav><h2>Featured Podcasts</h2><ul style="column-count:2;column-gap:24px;list-style:none;padding:0;">${podcastLinks}</ul></div>`,
    };
  },
  "/contact": {
    title: "Contact Us - PodCap | Daily Podcast Summaries",
    description: "Get in touch with the PodCap team. Questions, feedback, or just want to say hello - we'd love to hear from you.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/contact",
    twitterCard: "summary",
    replaceFavicon: false,
    ssrHtml: `<div style="max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>Contact PodCap</h1><p>Have questions, feedback, or just want to say hello? We'd love to hear from you.</p><p>Email: <a href="mailto:hello@podcap.io">hello@podcap.io</a></p><a href="/">Back to Home</a></div>`,
  },
  "/about": {
    title: "About PodCap - The Story Behind Your Daily Podcast Summaries",
    description: "PodCap was built by Derek Johnson after 15 years running Tatango.com. Even semi-retired, he couldn't keep up with his favorite podcasts. So he built an AI-powered daily podcast summary service.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/about",
    twitterCard: "summary",
    replaceFavicon: false,
    ssrHtml: `<article style="max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>About PodCap</h1><p>PodCap was built by Derek Johnson after 15 years running Tatango.com. Even semi-retired, he couldn't keep up with his favorite podcasts. So he built an AI-powered daily podcast summary service.</p><p>PodCap provides AI-powered recaps for 240+ top podcasts, delivering key insights, notable quotes, and actionable takeaways to your inbox every morning.</p><a href="/">Back to Home</a></article>`,
  },
  "/leaderboard": () => {
    const podcastLinks = PODCAST_SEO.slice(0, 50).map((p, i) => `<li>${i + 1}. <a href="/podcasts/${escapeAttr(p.slug)}">${escapeAttr(p.name)}</a></li>`).join("");
    return {
      title: "PodCap Leaderboard - Most Popular Podcasts",
      description: "See which podcasts are trending on PodCap. Discover the most popular shows and create your own free daily AI-powered recap.",
      image: "https://podcap.io/favicon.png",
      url: "https://podcap.io/leaderboard",
      twitterCard: "summary",
      replaceFavicon: false,
      ssrHtml: `<div style="max-width:900px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>PodCap Leaderboard - Most Popular Podcasts</h1><p>See which podcasts are trending on PodCap.</p><ol style="padding-left:20px;">${podcastLinks}</ol><a href="/podcasts">Browse All Podcasts</a></div>`,
    };
  },
  "/podcasts": {
    title: "All Podcasts - Browse 240+ Shows with Free Daily Recaps | PodCap",
    description: "Browse the full PodCap podcast directory. Get free AI-powered daily recaps for 240+ top podcasts including Joe Rogan, Lex Fridman, All-In, Huberman Lab, and more.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/podcasts",
    twitterCard: "summary",
    replaceFavicon: false,
  },
  "/people": () => {
    const entries = Object.entries(ENTITY_PEOPLE_META).slice(0, 100);
    const links = entries.map(([slug, p]) => `<li><a href="/people/${escapeAttr(slug)}">${escapeAttr(p.name)}</a> - ${escapeAttr(p.title)}</li>`).join("");
    return {
      title: "People in Podcasts - Notable Figures & Podcast Appearances | PodCap",
      description: "Discover notable people mentioned across top podcasts. See which episodes discuss Elon Musk, Sam Altman, Warren Buffett, and other influential figures.",
      image: "https://podcap.io/favicon.png",
      url: "https://podcap.io/people",
      twitterCard: "summary",
      replaceFavicon: false,
      ssrHtml: `<div style="max-width:900px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>People in Podcasts</h1><p>Notable figures mentioned across ${PODCAST_SEO.length}+ top podcasts. Discover who's being talked about and what's being said.</p><ul style="column-count:2;column-gap:24px;list-style:none;padding:0;">${links}</ul><a href="/">Back to Home</a></div>`,
    };
  },
  "/companies": () => {
    const entries = Object.entries(ENTITY_COMPANIES_META).slice(0, 100);
    const links = entries.map(([slug, c]) => `<li><a href="/companies/${escapeAttr(slug)}">${escapeAttr(c.name)}</a></li>`).join("");
    return {
      title: "Companies in Podcasts - Brands & Organizations Discussed | PodCap",
      description: "Discover companies discussed across top podcasts. See which episodes mention OpenAI, Tesla, NVIDIA, and other notable companies.",
      image: "https://podcap.io/favicon.png",
      url: "https://podcap.io/companies",
      twitterCard: "summary",
      replaceFavicon: false,
      ssrHtml: `<div style="max-width:900px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>Companies in Podcasts</h1><p>Notable companies and brands discussed across ${PODCAST_SEO.length}+ top podcasts.</p><ul style="column-count:2;column-gap:24px;list-style:none;padding:0;">${links}</ul><a href="/">Back to Home</a></div>`,
    };
  },
  "/insights": () => {
    const topicLinks = TOPICS.map(t => `<li><a href="/insights/${escapeAttr(t.slug)}">${escapeAttr(t.name)}</a> - ${escapeAttr(t.description.slice(0, 100))}</li>`).join("");
    return {
      title: "Podcast Insights - Trending Topics Across Top Podcasts | PodCap",
      description: "Explore trending topics across 240+ top podcasts. From AI and startups to health and investing, see what the smartest people are talking about.",
      image: "https://podcap.io/favicon.png",
      url: "https://podcap.io/insights",
      twitterCard: "summary",
      replaceFavicon: false,
      ssrHtml: `<div style="max-width:900px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>Podcast Insights - Trending Topics</h1><p>Explore what the world's top podcasts are talking about. Trending topics, emerging themes, and key narratives across ${PODCAST_SEO.length}+ shows.</p><ul style="list-style:none;padding:0;">${topicLinks}</ul><a href="/">Back to Home</a></div>`,
    };
  },
  "/trends": {
    title: "The Pulse - Podcast Trends & Trending Topics | PodCap",
    description: "See what's trending across the podcast world. Track people, companies, and topics gaining momentum across 240+ top podcasts.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/trends",
    twitterCard: "summary",
    replaceFavicon: false,
    ssrHtml: `<div style="max-width:900px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>The Pulse - Podcast Trends</h1><p>Track what's trending across the podcast world. See which people, companies, and topics are gaining momentum across ${PODCAST_SEO.length}+ top podcasts.</p><nav><ul style="display:flex;gap:16px;list-style:none;padding:0;"><li><a href="/people">People</a></li><li><a href="/companies">Companies</a></li><li><a href="/insights">Topics</a></li></ul></nav><a href="/">Back to Home</a></div>`,
  },
  "/enterprise": {
    title: "PodCap Enterprise - Podcast Intelligence for Teams",
    description: "Podcast intelligence for teams. Monitor industry trends, track competitors, and discover insights from hundreds of top podcasts.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/enterprise",
    twitterCard: "summary",
    replaceFavicon: false,
    ssrHtml: `<div style="max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>PodCap Enterprise</h1><p>Podcast intelligence for teams. Monitor industry trends, track competitors, and discover insights from hundreds of top podcasts.</p><a href="/">Back to Home</a></div>`,
  },
  "/support": {
    title: "Support - PodCap Help Center",
    description: "Get help with PodCap. Find answers to common questions and get support for your podcast intelligence needs.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/support",
    twitterCard: "summary",
    replaceFavicon: false,
    ssrHtml: `<div style="max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>PodCap Support</h1><p>Need help? Contact us at <a href="mailto:hello@podcap.io">hello@podcap.io</a>.</p><a href="/">Back to Home</a></div>`,
  },
  "/privacy": {
    title: "Privacy Policy - PodCap",
    description: "PodCap's privacy policy. Learn how we collect, use, and protect your personal information.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/privacy",
    twitterCard: "summary",
    replaceFavicon: false,
    ssrHtml: `<div style="max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>Privacy Policy</h1><p>PodCap respects your privacy. This policy explains how we collect, use, and protect your personal information when you use our podcast intelligence platform.</p><a href="/">Back to Home</a></div>`,
  },
  "/terms": {
    title: "Terms of Service - PodCap",
    description: "PodCap's terms of service. Read our terms and conditions for using the podcast intelligence platform.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/terms",
    twitterCard: "summary",
    replaceFavicon: false,
    ssrHtml: `<div style="max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>Terms of Service</h1><p>These terms govern your use of PodCap, an AI-powered podcast intelligence platform.</p><a href="/">Back to Home</a></div>`,
  },
  "/we-heart-podcasters": {
    title: "We Heart Podcasters - PodCap for Podcast Creators",
    description: "PodCap loves podcasters. Learn how we support podcast creators with tools, visibility, and audience growth.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/we-heart-podcasters",
    twitterCard: "summary",
    replaceFavicon: false,
    ssrHtml: `<div style="max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>We Heart Podcasters</h1><p>PodCap is built for podcast lovers and creators. We help podcasters reach new audiences by making their best content discoverable through AI-powered recaps, insights, and entity tracking.</p><p><a href="/podcaster/claim">Claim Your Podcast</a></p><a href="/">Back to Home</a></div>`,
  },
  "/updates": {
    title: "Product Updates - PodCap",
    description: "See the latest product updates and feature releases from PodCap.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/updates",
    twitterCard: "summary",
    replaceFavicon: false,
    ssrHtml: `<div style="max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>PodCap Product Updates</h1><p>See the latest features and improvements to the PodCap podcast intelligence platform.</p><a href="/">Back to Home</a></div>`,
  },
  "/get-started": {
    title: "Get Started - Create Your Free PodCap Account",
    description: "Sign up for free and get daily AI-powered podcast recaps delivered to your inbox. Choose from 240+ top podcasts.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/register",
    twitterCard: "summary",
    replaceFavicon: false,
    ssrHtml: `<div style="max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>Get Started with PodCap</h1><p>Sign up for free and get daily AI-powered podcast recaps delivered to your inbox. Choose from ${PODCAST_SEO.length}+ top podcasts.</p><a href="/podcasts">Browse Podcasts</a></div>`,
  },
};

function buildPodcastDirectoryHtml(): string {
  const links = PODCAST_SEO
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => {
      const nameStr = escapeAttr(p.name);
      const label = /podcast/i.test(p.name) ? `${nameStr} Recaps` : `${nameStr} Podcast Recaps`;
      return `<li><a href="/podcasts/${escapeAttr(p.slug)}">${label}</a></li>`;
    })
    .join("");
  return `<div id="ssr-podcast-directory" style="max-width:900px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>All Podcasts - Free Daily Recaps</h1><p>Browse ${PODCAST_SEO.length}+ podcasts with free AI-powered daily recaps delivered to your inbox.</p><ul style="column-count:2;column-gap:24px;list-style:none;padding:0;">${links}</ul></div>`;
}

function injectDirectoryHtml(html: string): string {
  const directoryHtml = buildPodcastDirectoryHtml();
  return html.replace(
    '<div id="root"></div>',
    `<div id="root">${directoryHtml}</div>`
  );
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeJsonLd(str: string): string {
  return str.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function truncateAtWord(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  const truncated = str.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace < maxLen * 0.6) return truncated + "...";
  return truncated.slice(0, lastSpace) + "...";
}

function replaceMetaTags(html: string, meta: PageMeta): string {
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeAttr(meta.title)}</title>`
  );

  html = html.replace(/<title>\s*<\/title>/g, "");

  const canonicalTag = `<link rel="canonical" href="${escapeAttr(meta.url)}" />`;
  if (!html.includes('rel="canonical"')) {
    html = html.replace("</head>", `${canonicalTag}\n</head>`);
  } else {
    html = html.replace(
      /<link rel="canonical" href="[^"]*"\s*\/?>/,
      canonicalTag
    );
  }

  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${escapeAttr(meta.description)}" />`
  );

  html = html.replace(
    /<meta property="og:title" content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${escapeAttr(meta.title)}" />`
  );

  html = html.replace(
    /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${escapeAttr(meta.description)}" />`
  );

  html = html.replace(
    /<meta property="og:image" content="[^"]*"\s*\/?>/,
    `<meta property="og:image" content="${escapeAttr(meta.image)}" />`
  );

  html = html.replace(
    /<meta property="og:url" content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${escapeAttr(meta.url)}" />`
  );

  html = html.replace(
    /<meta name="twitter:card" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:card" content="${meta.twitterCard || "summary_large_image"}" />`
  );

  html = html.replace(
    /<meta name="twitter:title" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`
  );

  html = html.replace(
    /<meta name="twitter:description" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`
  );

  html = html.replace(
    /<meta name="twitter:image" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:image" content="${escapeAttr(meta.image)}" />`
  );

  if (meta.replaceFavicon !== false) {
    html = html.replace(
      /<link rel="icon" type="image\/png" sizes="32x32" href="\/favicon\.png"\s*\/?>/,
      `<link rel="icon" type="image/jpeg" href="${escapeAttr(meta.image)}" />`
    );

    html = html.replace(
      /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"\s*\/?>/,
      `<link rel="apple-touch-icon" href="${escapeAttr(meta.image)}" />`
    );
  }

  if (meta.jsonLd) {
    const blocks = Array.isArray(meta.jsonLd) ? meta.jsonLd : [meta.jsonLd];
    const jsonLdScripts = blocks
      .map(b => `<script type="application/ld+json">${escapeJsonLd(JSON.stringify(b))}</script>`)
      .join("\n");
    html = html.replace("</head>", `${jsonLdScripts}\n</head>`);
  }

  if (meta.ssrHtml) {
    html = html.replace(
      '<div id="root"></div>',
      `<div id="root">${meta.ssrHtml}</div>`
    );
  }

  return html;
}

function decodeHtmlEntities(str: string): string {
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function buildEpisodeSsrHtml(ep: any, podcast: any): string {
  const guests = (() => {
    try { return JSON.parse(ep.guests || "[]"); } catch { return []; }
  })();
  const insights = ep.key_insights || [];
  const topQuestions = (() => {
    try { return JSON.parse(ep.top_questions || "[]"); } catch { return []; }
  })();

  let html = `<article style="max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;">`;
  html += `<nav aria-label="Breadcrumb" style="font-size:14px;margin-bottom:16px;"><a href="/">Home</a> &gt; <a href="/podcasts">Podcasts</a> &gt; <a href="/podcasts/${escapeAttr(ep.slug)}">${escapeAttr(ep.podcast_name)}</a> &gt; <span>${escapeAttr(decodeHtmlEntities(ep.episode_title))}</span></nav>`;
  html += `<h1>${escapeAttr(decodeHtmlEntities(ep.episode_title))} - ${escapeAttr(ep.podcast_name)} Recap</h1>`;
  html += `<p><strong>Podcast:</strong> ${escapeAttr(ep.podcast_name)}</p>`;
  if (ep.publish_date) html += `<p><strong>Published:</strong> ${escapeAttr(String(ep.publish_date))}</p>`;
  if (ep.duration) html += `<p><strong>Duration:</strong> ${escapeAttr(ep.duration)}</p>`;
  if (guests.length > 0) {
    html += `<p><strong>Guests:</strong> ${guests.map((g: any) => escapeAttr(g.name)).join(", ")}</p>`;
  }
  if (ep.tldl) {
    html += `<h2>Summary</h2><p>${escapeAttr(decodeHtmlEntities(ep.tldl))}</p>`;
  }
  if (ep.what_happened) {
    html += `<h2>What Happened</h2>`;
    const paragraphs = decodeHtmlEntities(ep.what_happened).split("\n\n");
    for (const p of paragraphs) {
      html += `<p>${escapeAttr(p)}</p>`;
    }
  }
  if (insights.length > 0) {
    html += `<h2>Key Insights</h2><ul>`;
    for (const insight of insights) {
      html += `<li>${escapeAttr(decodeHtmlEntities(insight))}</li>`;
    }
    html += `</ul>`;
  }
  if (topQuestions.length > 0) {
    html += `<h2>Key Questions Answered</h2>`;
    for (const q of topQuestions) {
      html += `<h3>${escapeAttr(decodeHtmlEntities(q.question))}</h3>`;
      html += `<p>${escapeAttr(decodeHtmlEntities(q.answer))}</p>`;
    }
  }
  html += `</article>`;
  return html;
}

function buildEpisodeJsonLd(ep: any, podcast: any): object {
  const guests = (() => {
    try { return JSON.parse(ep.guests || "[]"); } catch { return []; }
  })();
  const hosts = podcast?.hosts || ep.hosts || "";

  const jsonLd: any = {
    "@context": "https://schema.org",
    "@type": "PodcastEpisode",
    "name": decodeHtmlEntities(ep.episode_title),
    "description": decodeHtmlEntities(ep.tldl || ""),
    "url": `https://podcap.io/podcasts/${ep.slug}/${ep.episode_slug}`,
    "datePublished": ep.publish_date || undefined,
    "partOfSeries": {
      "@type": "PodcastSeries",
      "name": ep.podcast_name,
      "url": `https://podcap.io/podcasts/${ep.slug}`,
    },
  };

  if (ep.duration) {
    const durationMatch = ep.duration.match(/(\d+)\s*(hr|hour|min)/gi);
    if (durationMatch) {
      let totalMinutes = 0;
      for (const part of durationMatch) {
        const num = parseInt(part);
        if (/hr|hour/i.test(part)) totalMinutes += num * 60;
        else totalMinutes += num;
      }
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      jsonLd.timeRequired = `PT${hours > 0 ? hours + "H" : ""}${mins}M`;
    }
  }

  if (ep.audio_url) {
    jsonLd.associatedMedia = {
      "@type": "MediaObject",
      "contentUrl": ep.audio_url,
    };
  }

  if (ep.artwork_url) {
    const img = ep.artwork_url.startsWith("/") ? `https://podcap.io${ep.artwork_url}` : ep.artwork_url;
    jsonLd.image = img;
  }

  const people: any[] = [];
  if (hosts) {
    const hostNames = hosts.replace(/&amp;/g, "&").split(/,\s*|&\s*|\band\b/i).map((h: string) => h.trim()).filter(Boolean);
    for (const name of hostNames) {
      people.push({ "@type": "Person", "name": name });
    }
  }
  for (const guest of guests) {
    people.push({ "@type": "Person", "name": guest.name });
  }
  if (people.length > 0) {
    jsonLd.actor = people;
  }

  return jsonLd;
}

function buildBreadcrumbJsonLd(items: { name: string; url: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": item.name,
      "item": item.url,
    })),
  };
}

function buildPersonSsrHtml(name: string, title: string, slug: string): string {
  return `<article style="max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>${escapeAttr(name)} - Podcast Episodes &amp; Appearances</h1><p>${escapeAttr(title)}</p><p>Discover all podcast episodes where ${escapeAttr(name)} is mentioned. Get AI-powered recaps and key insights from each appearance.</p><a href="/people">Browse All People</a></article>`;
}

function buildCompanySsrHtml(name: string, description: string, slug: string): string {
  return `<article style="max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>${escapeAttr(name)} on Podcasts - Episodes &amp; Mentions</h1><p>${escapeAttr(description)}</p><p>Discover all podcast episodes where ${escapeAttr(name)} is discussed. Get AI-powered recaps and key insights from each mention.</p><a href="/companies">Browse All Companies</a></article>`;
}

async function getEpisodeMeta(podcastSlug: string, episodeSlug: string): Promise<PageMeta | null> {
  try {
    const { rows } = await pool.query(
      `SELECT episode_title, podcast_name, slug, episode_slug, tldl, what_happened,
              key_insights, top_questions, guests, publish_date, duration, 
              artwork_url, hosts, audio_url
       FROM landing_page_recaps
       WHERE slug = $1 AND episode_slug = $2
       LIMIT 1`,
      [podcastSlug, episodeSlug]
    );
    if (rows.length === 0) return null;
    const ep = rows[0];
    const podcast = PODCAST_SEO.find(p => p.slug === podcastSlug);
    const title = `${decodeHtmlEntities(ep.episode_title)} - ${ep.podcast_name} Recap | PodCap`;
    const desc = ep.tldl
      ? truncateAtWord(decodeHtmlEntities(ep.tldl), 150)
      : `Listen to the recap of ${decodeHtmlEntities(ep.episode_title)} from ${ep.podcast_name} on PodCap.`;
    const image = ep.artwork_url?.startsWith("/")
      ? `https://podcap.io${ep.artwork_url}`
      : (ep.artwork_url || (podcast?.artworkUrl?.startsWith("/") ? `https://podcap.io${podcast.artworkUrl}` : podcast?.artworkUrl) || "https://podcap.io/favicon.png");

    const breadcrumbs = buildBreadcrumbJsonLd([
      { name: "Home", url: "https://podcap.io/" },
      { name: "Podcasts", url: "https://podcap.io/podcasts" },
      { name: ep.podcast_name, url: `https://podcap.io/podcasts/${podcastSlug}` },
      { name: decodeHtmlEntities(ep.episode_title), url: `https://podcap.io/podcasts/${podcastSlug}/${episodeSlug}` },
    ]);

    return {
      title,
      description: desc,
      image,
      url: `https://podcap.io/podcasts/${podcastSlug}/${episodeSlug}`,
      twitterCard: "summary_large_image",
      jsonLd: [buildEpisodeJsonLd(ep, podcast), breadcrumbs],
      ssrHtml: buildEpisodeSsrHtml(ep, podcast),
    };
  } catch (err) {
    console.error("[SEO] Error fetching episode meta:", err);
    return null;
  }
}

const ENTITY_PEOPLE_META: Record<string, { name: string; title: string }> = {};
const ENTITY_COMPANIES_META: Record<string, { name: string; description: string }> = {};
export function registerEntityPeople(entities: { slug: string; name: string; title: string }[]) {
  for (const e of entities) {
    ENTITY_PEOPLE_META[e.slug] = { name: e.name, title: e.title };
  }
}

export function registerEntityCompanies(entities: { slug: string; name: string; description: string }[]) {
  for (const e of entities) {
    ENTITY_COMPANIES_META[e.slug] = { name: e.name, description: e.description };
  }
}

export async function injectPodcastMeta(html: string, url: string): Promise<string> {
  let cleanUrl = url.split("?")[0].split("#")[0];
  if (cleanUrl.length > 1 && cleanUrl.endsWith("/")) {
    cleanUrl = cleanUrl.slice(0, -1);
  }

  if (cleanUrl === "/bookstore") {
    let ssrHtml = "";
    try {
      const { rows: books } = await pool.query(
        `SELECT slug, book_title, author FROM book_enrichments WHERE slug IS NOT NULL ORDER BY book_title LIMIT 200`
      );
      if (books.length > 0) {
        const bookLinks = books.map(b => `<li><a href="/bookstore/${escapeAttr(b.slug)}">${escapeAttr(b.book_title)}</a>${b.author ? ` by ${escapeAttr(b.author)}` : ""}</li>`).join("");
        ssrHtml = `<div style="max-width:900px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>Podcast Bookstore</h1><p>Books recommended, discussed, and mentioned across the world's top podcasts.</p><ul style="column-count:2;column-gap:24px;list-style:none;padding:0;">${bookLinks}</ul><a href="/">Back to Home</a></div>`;
      }
    } catch (err) { console.error("[SSR] bookstore listing error:", err); }
    return replaceMetaTags(html, {
      title: "Podcast Bookstore - Books Recommended on Top Podcasts | PodCap",
      description: "Browse books recommended, discussed, and mentioned across the world's top podcasts. Find your next read from trusted podcast hosts and guests.",
      image: "https://podcap.io/favicon.png",
      url: "https://podcap.io/bookstore",
      twitterCard: "summary",
      replaceFavicon: false,
      ssrHtml,
    });
  }

  const staticEntry = STATIC_PAGES[cleanUrl];
  if (staticEntry) {
    let staticPage: PageMeta;
    try {
      staticPage = typeof staticEntry === "function" ? staticEntry() : staticEntry;
    } catch (err) {
      console.error("[SSR] static page error for", cleanUrl, err);
      return html;
    }
    let result = replaceMetaTags(html, staticPage);
    if (cleanUrl === "/podcasts") {
      result = injectDirectoryHtml(result);
    }
    return result;
  }

  const archiveMatch = cleanUrl.match(/^\/podcasts\/([a-zA-Z0-9_-]+)\/episodes$/);
  if (archiveMatch) {
    const slug = archiveMatch[1].toLowerCase();
    const podcast = PODCAST_SEO.find(p => p.slug === slug);
    if (podcast) {
      const desc = `Browse all ${podcast.name} episode recaps on PodCap. Every episode summarized with key insights and takeaways by ${podcast.hosts}.`;
      let ssrHtml = "";
      try {
        const { rows: eps } = await pool.query(
          `SELECT episode_title, episode_slug, publish_date, tldl FROM landing_page_recaps WHERE slug = $1 ORDER BY publish_date DESC LIMIT 100`,
          [slug]
        );
        if (eps.length > 0) {
          const epLinks = eps.map(e => `<li><a href="/podcasts/${escapeAttr(slug)}/${escapeAttr(e.episode_slug)}">${escapeAttr(decodeHtmlEntities(e.episode_title))}</a>${e.publish_date ? ` <small>(${escapeAttr(String(e.publish_date))})</small>` : ""}</li>`).join("");
          ssrHtml = `<div style="max-width:900px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>All ${escapeAttr(podcast.name)} Episode Recaps</h1><p>Browse all episode recaps for ${escapeAttr(podcast.name)} hosted by ${escapeAttr(podcast.hosts)}.</p><ul style="list-style:none;padding:0;">${epLinks}</ul><a href="/podcasts/${escapeAttr(slug)}">Back to ${escapeAttr(podcast.name)}</a></div>`;
        }
      } catch (err) { console.error("[SSR] archive page error:", err); }
      return replaceMetaTags(html, {
        title: `All ${podcast.name} Episode Recaps | PodCap`,
        description: desc,
        image: podcast.artworkUrl.startsWith("/") ? `https://podcap.io${podcast.artworkUrl}` : podcast.artworkUrl,
        url: `https://podcap.io/podcasts/${podcast.slug}/episodes`,
        twitterCard: "summary_large_image",
        ssrHtml,
      });
    }
  }

  const episodeMatch = cleanUrl.match(/^\/podcasts\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)$/);
  if (episodeMatch) {
    const podcastSlug = episodeMatch[1].toLowerCase();
    const episodeSlug = episodeMatch[2].toLowerCase();
    const meta = await getEpisodeMeta(podcastSlug, episodeSlug);
    if (meta) {
      return replaceMetaTags(html, meta);
    }
  }

  const podcastMatch = cleanUrl.match(/^\/podcasts\/([a-zA-Z0-9_-]+)$/);
  if (podcastMatch) {
    const slug = podcastMatch[1].toLowerCase();
    const podcast = PODCAST_SEO.find(p => p.slug === slug);
    if (podcast) {
      const desc = `Get free daily ${podcast.name} podcast summaries and episode recaps. ${podcast.description.charAt(0).toUpperCase() + podcast.description.slice(1)} by ${podcast.hosts} - delivered to your inbox.`;
      let ssrHtml = "";
      try {
        const { rows: eps } = await pool.query(
          `SELECT episode_title, episode_slug, publish_date, tldl FROM landing_page_recaps WHERE slug = $1 ORDER BY publish_date DESC LIMIT 20`,
          [slug]
        );
        if (eps.length > 0) {
          const epLinks = eps.map(e => {
            const title = escapeAttr(decodeHtmlEntities(e.episode_title));
            const summary = e.tldl ? `<p>${escapeAttr(truncateAtWord(decodeHtmlEntities(e.tldl), 150))}</p>` : "";
            return `<li style="margin-bottom:16px;"><a href="/podcasts/${escapeAttr(slug)}/${escapeAttr(e.episode_slug)}">${title}</a>${e.publish_date ? ` <small>(${escapeAttr(String(e.publish_date))})</small>` : ""}${summary}</li>`;
          }).join("");
          ssrHtml = `<div style="max-width:900px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>${escapeAttr(podcast.name)} - Podcast Recaps</h1><p>${escapeAttr(podcast.description)}. Hosted by ${escapeAttr(podcast.hosts)}.</p><h2>Latest Episodes</h2><ul style="list-style:none;padding:0;">${epLinks}</ul><a href="/podcasts/${escapeAttr(slug)}/episodes">View All Episodes</a> | <a href="/podcasts">Browse All Podcasts</a></div>`;
        }
      } catch (err) { console.error("[SSR] podcast page error:", err); }
      return replaceMetaTags(html, {
        title: `${podcast.name} Podcast Summary - Free Daily Recap | PodCap`,
        description: desc,
        image: podcast.artworkUrl.startsWith("/") ? `https://podcap.io${podcast.artworkUrl}` : podcast.artworkUrl,
        url: `https://podcap.io/podcasts/${podcast.slug}`,
        twitterCard: "summary_large_image",
        ssrHtml,
      });
    }
  }

  const personMatch = cleanUrl.match(/^\/people\/([a-zA-Z0-9_-]+)$/);
  if (personMatch) {
    const slug = personMatch[1].toLowerCase();
    const person = ENTITY_PEOPLE_META[slug];
    if (person) {
      return replaceMetaTags(html, {
        title: `${person.name} - Podcast Episodes & Appearances | PodCap`,
        description: `Discover podcast episodes where ${person.name} (${person.title}) is mentioned. Get AI-powered recaps and key insights from each appearance.`,
        image: "https://podcap.io/favicon.png",
        url: `https://podcap.io/people/${slug}`,
        twitterCard: "summary",
        replaceFavicon: false,
        ssrHtml: buildPersonSsrHtml(person.name, person.title, slug),
      });
    }
  }

  const companyMatch = cleanUrl.match(/^\/companies\/([a-zA-Z0-9_-]+)$/);
  if (companyMatch) {
    const slug = companyMatch[1].toLowerCase();
    const company = ENTITY_COMPANIES_META[slug];
    if (company) {
      return replaceMetaTags(html, {
        title: `${company.name} on Podcasts - Episodes & Mentions | PodCap`,
        description: `Discover podcast episodes where ${company.name} is discussed. ${company.description}. Get AI-powered recaps and insights.`,
        image: "https://podcap.io/favicon.png",
        url: `https://podcap.io/companies/${slug}`,
        twitterCard: "summary",
        replaceFavicon: false,
        ssrHtml: buildCompanySsrHtml(company.name, company.description, slug),
      });
    }
  }

  const bookMatch = cleanUrl.match(/^\/bookstore\/([a-zA-Z0-9_-]+)$/);
  if (bookMatch) {
    const bookSlug = bookMatch[1].toLowerCase();
    try {
      const { rows } = await pool.query(
        `SELECT book_title, author, description FROM book_enrichments WHERE slug = $1 LIMIT 1`,
        [bookSlug]
      );
      if (rows.length > 0) {
        const book = rows[0];
        let ssrHtml = `<article style="max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>${escapeAttr(book.book_title)}</h1>`;
        if (book.author) ssrHtml += `<p><strong>Author:</strong> ${escapeAttr(book.author)}</p>`;
        if (book.description) ssrHtml += `<p>${escapeAttr(book.description)}</p>`;
        try {
          const { rows: mentions } = await pool.query(
            `SELECT r.episode_title, r.episode_slug, r.slug, r.podcast_name
             FROM landing_page_recaps r
             WHERE r.resources::text ILIKE $1
             ORDER BY r.publish_date DESC LIMIT 20`,
            [`%${book.book_title.replace(/'/g, "''")}%`]
          );
          if (mentions.length > 0) {
            ssrHtml += `<h2>Episodes Mentioning This Book</h2><ul>`;
            for (const m of mentions) {
              ssrHtml += `<li><a href="/podcasts/${escapeAttr(m.slug)}/${escapeAttr(m.episode_slug)}">${escapeAttr(decodeHtmlEntities(m.episode_title))}</a> - ${escapeAttr(m.podcast_name)}</li>`;
            }
            ssrHtml += `</ul>`;
          }
        } catch (err) { console.error("[SSR] book mentions error:", err); }
        ssrHtml += `<a href="/bookstore">Browse All Books</a></article>`;
        return replaceMetaTags(html, {
          title: `${book.book_title} by ${book.author || "Unknown"} - Podcast Book Recommendation | PodCap`,
          description: book.description
            ? truncateAtWord(book.description, 150)
            : `${book.book_title} was recommended on podcasts. See which episodes mention this book and what hosts said about it.`,
          image: "https://podcap.io/favicon.png",
          url: `https://podcap.io/bookstore/${bookSlug}`,
          twitterCard: "summary",
          replaceFavicon: false,
          ssrHtml,
        });
      }
    } catch (err) { console.error("[SSR] book detail error:", err); }
  }

  const insightMatch = cleanUrl.match(/^\/insights\/([a-zA-Z0-9_-]+)$/);
  if (insightMatch) {
    const topicSlug = insightMatch[1].toLowerCase();
    const topic = TOPICS.find(t => t.slug === topicSlug);
    if (topic) {
      return replaceMetaTags(html, {
        title: `${topic.name} - Podcast Insights & Analysis | PodCap`,
        description: truncateAtWord(topic.description, 150),
        image: "https://podcap.io/favicon.png",
        url: `https://podcap.io/insights/${topicSlug}`,
        twitterCard: "summary",
        replaceFavicon: false,
        ssrHtml: `<article style="max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>${escapeAttr(topic.name)} - Podcast Insights</h1><p>${escapeAttr(topic.description)}</p><a href="/insights">Browse All Topics</a> | <a href="/">Back to Home</a></article>`,
      });
    }
  }

  if (!html.includes('rel="canonical"')) {
    const fallbackUrl = `https://podcap.io${cleanUrl === "/" ? "" : cleanUrl}`;
    html = html.replace("</head>", `<link rel="canonical" href="${escapeAttr(fallbackUrl)}" />\n</head>`);
  }

  html = html.replace(/<title>\s*<\/title>/g, "");

  return html;
}
