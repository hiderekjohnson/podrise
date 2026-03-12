import { PODCAST_SEO } from "@shared/podcastSeoData";
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

const STATIC_PAGES: Record<string, PageMeta> = {
  "/contact": {
    title: "Contact Us - PodCap | Daily Podcast Summaries",
    description: "Get in touch with the PodCap team. Questions, feedback, or just want to say hello - we'd love to hear from you.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/contact",
    twitterCard: "summary",
    replaceFavicon: false,
  },
  "/about": {
    title: "About PodCap - The Story Behind Your Daily Podcast Summaries",
    description: "PodCap was built by Derek Johnson after 15 years running Tatango.com. Even semi-retired, he couldn't keep up with his favorite podcasts. So he built an AI-powered daily podcast summary service.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/about",
    twitterCard: "summary",
    replaceFavicon: false,
  },
  "/leaderboard": {
    title: "PodCap Leaderboard - Most Popular Podcasts",
    description: "See which podcasts are trending on PodCap. Discover the most popular shows and create your own free daily AI-powered recap.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/leaderboard",
    twitterCard: "summary",
    replaceFavicon: false,
  },
  "/podcasts": {
    title: "All Podcasts - Browse 240+ Shows with Free Daily Recaps | PodCap",
    description: "Browse the full PodCap podcast directory. Get free AI-powered daily recaps for 240+ top podcasts including Joe Rogan, Lex Fridman, All-In, Huberman Lab, and more.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/podcasts",
    twitterCard: "summary",
    replaceFavicon: false,
  },
  "/people": {
    title: "People in Podcasts - Notable Figures & Podcast Appearances | PodCap",
    description: "Discover notable people mentioned across top podcasts. See which episodes discuss Elon Musk, Sam Altman, Warren Buffett, and other influential figures.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/people",
    twitterCard: "summary",
    replaceFavicon: false,
  },
  "/companies": {
    title: "Companies in Podcasts - Brands & Organizations Discussed | PodCap",
    description: "Discover companies discussed across top podcasts. See which episodes mention OpenAI, Tesla, NVIDIA, and other notable companies.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/companies",
    twitterCard: "summary",
    replaceFavicon: false,
  },
  "/bookstore": {
    title: "Podcast Bookstore - Books Recommended on Top Podcasts | PodCap",
    description: "Browse books recommended, discussed, and mentioned across the world's top podcasts. Find your next read from trusted podcast hosts and guests.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/bookstore",
    twitterCard: "summary",
    replaceFavicon: false,
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
  if (ep.publish_date) html += `<p><strong>Published:</strong> ${ep.publish_date}</p>`;
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

  const staticPage = STATIC_PAGES[cleanUrl];
  if (staticPage) {
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
      return replaceMetaTags(html, {
        title: `All ${podcast.name} Episode Recaps | PodCap`,
        description: desc,
        image: podcast.artworkUrl.startsWith("/") ? `https://podcap.io${podcast.artworkUrl}` : podcast.artworkUrl,
        url: `https://podcap.io/podcasts/${podcast.slug}/episodes`,
        twitterCard: "summary_large_image",
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
      return replaceMetaTags(html, {
        title: `${podcast.name} Podcast Summary - Free Daily Recap | PodCap`,
        description: desc,
        image: podcast.artworkUrl.startsWith("/") ? `https://podcap.io${podcast.artworkUrl}` : podcast.artworkUrl,
        url: `https://podcap.io/podcasts/${podcast.slug}`,
        twitterCard: "summary_large_image",
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
        `SELECT title, author, description FROM book_enrichments WHERE slug = $1 LIMIT 1`,
        [bookSlug]
      );
      if (rows.length > 0) {
        const book = rows[0];
        return replaceMetaTags(html, {
          title: `${book.title} by ${book.author || "Unknown"} - Podcast Book Recommendation | PodCap`,
          description: book.description
            ? truncateAtWord(book.description, 150)
            : `${book.title} was recommended on podcasts. See which episodes mention this book and what hosts said about it.`,
          image: "https://podcap.io/favicon.png",
          url: `https://podcap.io/bookstore/${bookSlug}`,
          twitterCard: "summary",
          replaceFavicon: false,
        });
      }
    } catch {}
  }

  if (!html.includes('rel="canonical"')) {
    const fallbackUrl = `https://podcap.io${cleanUrl === "/" ? "" : cleanUrl}`;
    html = html.replace("</head>", `<link rel="canonical" href="${escapeAttr(fallbackUrl)}" />\n</head>`);
  }

  html = html.replace(/<title>\s*<\/title>/g, "");

  return html;
}
