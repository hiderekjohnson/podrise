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
  "/leaderboard": {
    title: "PodCap Leaderboard — Most Popular Podcasts",
    description: "See which podcasts are trending on PodCap. Discover the most popular shows and create your own free daily AI-powered recap.",
    image: "https://podcap.io/favicon.png",
    url: "https://podcap.io/leaderboard",
    twitterCard: "summary",
    replaceFavicon: false,
  },
};

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
  const cleanUrl = url.split("?")[0].split("#")[0];

  const staticPage = STATIC_PAGES[cleanUrl];
  if (staticPage) {
    return replaceMetaTags(html, staticPage);
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
