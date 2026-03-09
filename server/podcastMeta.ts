import { PODCAST_SEO, EPISODE_SEO } from "@shared/podcastSeoData";

interface PageMeta {
  title: string;
  description: string;
  image: string;
  url: string;
  twitterCard?: string;
  replaceFavicon?: boolean;
}

const STATIC_PAGES: Record<string, PageMeta> = {
  "/contact": {
    title: "Contact Us — PodCap | Daily Podcast Summaries",
    description: "Get in touch with the PodCap team. Questions, feedback, or just want to say hello — we'd love to hear from you.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/contact",
    twitterCard: "summary",
    replaceFavicon: false,
  },
  "/about": {
    title: "About PodCap — The Story Behind Your Daily Podcast Summaries",
    description: "PodCap was built by Derek Johnson after 15 years running Tatango.com. Even semi-retired, he couldn't keep up with his favorite podcasts. So he built an AI-powered daily podcast summary service.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/about",
    twitterCard: "summary",
    replaceFavicon: false,
  },
  "/leaderboard": {
    title: "PodCap Leaderboard — Most Popular Podcasts",
    description: "See which podcasts are trending on PodCap. Discover the most popular shows and create your own free daily AI-powered recap.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/leaderboard",
    twitterCard: "summary",
    replaceFavicon: false,
  },
  "/podcasts": {
    title: "All Podcasts — Browse 87+ Shows with Free Daily Recaps | PodCap",
    description: "Browse the full PodCap podcast directory. Get free AI-powered daily recaps for 87+ top podcasts including Joe Rogan, Lex Fridman, All-In, Huberman Lab, and more.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/podcasts",
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
  return `<div id="ssr-podcast-directory" style="max-width:900px;margin:0 auto;padding:40px 20px;font-family:sans-serif;"><h1>All Podcasts — Free Daily Recaps</h1><p>Browse ${PODCAST_SEO.length}+ podcasts with free AI-powered daily recaps delivered to your inbox.</p><ul style="column-count:2;column-gap:24px;list-style:none;padding:0;">${links}</ul></div>`;
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

function replaceMetaTags(html: string, meta: PageMeta): string {
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeAttr(meta.title)}</title>`
  );

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
      /<link rel="icon" type="image\/png" href="\/favicon\.png"\s*\/?>/,
      `<link rel="icon" type="image/jpeg" href="${escapeAttr(meta.image)}" />`
    );

    html = html.replace(
      /<link rel="apple-touch-icon" href="\/favicon\.png"\s*\/?>/,
      `<link rel="apple-touch-icon" href="${escapeAttr(meta.image)}" />`
    );
  }

  return html;
}

export function injectPodcastMeta(html: string, url: string): string {
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
        image: podcast.artworkUrl,
        url: `https://podcap.io/podcasts/${podcast.slug}/episodes`,
        twitterCard: "summary_large_image",
      });
    }
  }

  const transcriptMatch = cleanUrl.match(/^\/podcasts\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/transcript$/);
  if (transcriptMatch) {
    const podcastSlug = transcriptMatch[1].toLowerCase();
    const episodeSlug = transcriptMatch[2].toLowerCase();
    const episode = EPISODE_SEO.find(e => e.podcastSlug === podcastSlug && e.episodeSlug === episodeSlug);
    if (episode) {
      const desc = `Read the full transcript of "${episode.episodeTitle}" from ${episode.podcastName}. Timestamped, searchable transcript with direct links to any moment.`;
      return replaceMetaTags(html, {
        title: `${episode.podcastName}, ${episode.episodeTitle}, Full Transcript`,
        description: desc,
        image: episode.artworkUrl,
        url: `https://podcap.io/podcasts/${podcastSlug}/${episodeSlug}/transcript`,
        twitterCard: "summary",
      });
    }
  }

  const episodeMatch = cleanUrl.match(/^\/podcasts\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)$/);
  if (episodeMatch) {
    const podcastSlug = episodeMatch[1].toLowerCase();
    const episodeSlug = episodeMatch[2].toLowerCase();
    const episode = EPISODE_SEO.find(e => e.podcastSlug === podcastSlug && e.episodeSlug === episodeSlug);
    if (episode) {
      const desc = episode.tldl.length > 155 ? episode.tldl.slice(0, 155) + "..." : episode.tldl;
      return replaceMetaTags(html, {
        title: `${episode.episodeTitle} — ${episode.podcastName} Recap | PodCap`,
        description: desc,
        image: episode.artworkUrl,
        url: `https://podcap.io/podcasts/${podcastSlug}/${episodeSlug}`,
        twitterCard: "summary_large_image",
      });
    }
  }

  const podcastMatch = cleanUrl.match(/^\/podcasts\/([a-zA-Z0-9_-]+)$/);
  if (podcastMatch) {
    const slug = podcastMatch[1].toLowerCase();
    const podcast = PODCAST_SEO.find(p => p.slug === slug);
    if (podcast) {
      const desc = `Get free daily ${podcast.name} podcast summaries and episode recaps. ${podcast.description.charAt(0).toUpperCase() + podcast.description.slice(1)} by ${podcast.hosts} — delivered to your inbox.`;
      return replaceMetaTags(html, {
        title: `${podcast.name} Podcast Summary — Free Daily Recap | PodCap`,
        description: desc,
        image: podcast.artworkUrl,
        url: `https://podcap.io/podcasts/${podcast.slug}`,
        twitterCard: "summary_large_image",
      });
    }
  }

  return html;
}
