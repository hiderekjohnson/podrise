interface PodcastMeta {
  slug: string;
  name: string;
  artist: string;
  artworkUrl: string;
  appleUrl: string;
  description: string;
}

const PODCAST_PAGES: PodcastMeta[] = [
  {
    slug: "myfirstmillion",
    name: "My First Million",
    artist: "Sam Parr & Shaan Puri",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/fc/be/b0/fcbeb0f0-fb7a-509e-1cd0-ab60222ee7e5/mza_17824311072672278584.jpeg/600x600bb.jpg",
    appleUrl: "https://podcasts.apple.com/us/podcast/my-first-million/id1469759170",
    description: "Get a free AI-powered daily summary of the My First Million podcast by Sam Parr and Shaan Puri. Key business ideas, startup strategies, and side hustles delivered to your inbox every morning.",
  },
  {
    slug: "empowerher",
    name: "empowerHER",
    artist: "Kacia Ghetmiri",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/7f/d5/91/7fd591fe-a825-c9e3-bb6e-03f6e80588a9/mza_13023608203325049565.jpg/600x600bb.jpg",
    appleUrl: "https://podcasts.apple.com/us/podcast/empowerher/id1444456380",
    description: "Get a free AI-powered daily summary of the empowerHER podcast by Kacia Ghetmiri. Personal growth, empowerment, faith, and confidence insights delivered to your inbox every morning.",
  },
];

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

function replaceMetaTags(html: string, meta: PageMeta): string {
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${meta.title}</title>`
  );

  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${meta.description}" />`
  );

  html = html.replace(
    /<meta property="og:title" content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${meta.title}" />`
  );

  html = html.replace(
    /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${meta.description}" />`
  );

  html = html.replace(
    /<meta property="og:image" content="[^"]*"\s*\/?>/,
    `<meta property="og:image" content="${meta.image}" />`
  );

  html = html.replace(
    /<meta property="og:url" content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${meta.url}" />`
  );

  html = html.replace(
    /<meta name="twitter:card" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:card" content="${meta.twitterCard || "summary_large_image"}" />`
  );

  html = html.replace(
    /<meta name="twitter:title" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${meta.title}" />`
  );

  html = html.replace(
    /<meta name="twitter:description" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${meta.description}" />`
  );

  html = html.replace(
    /<meta name="twitter:image" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:image" content="${meta.image}" />`
  );

  if (meta.replaceFavicon !== false) {
    html = html.replace(
      /<link rel="icon" type="image\/png" href="\/favicon\.png"\s*\/?>/,
      `<link rel="icon" type="image/jpeg" href="${meta.image}" />`
    );

    html = html.replace(
      /<link rel="apple-touch-icon" href="\/favicon\.png"\s*\/?>/,
      `<link rel="apple-touch-icon" href="${meta.image}" />`
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

  const match = cleanUrl.match(/^\/podcasts\/([a-zA-Z0-9_-]+)/);
  if (!match) return html;

  const slug = match[1].toLowerCase();
  const podcast = PODCAST_PAGES.find((p) => p.slug === slug);
  if (!podcast) return html;

  return replaceMetaTags(html, {
    title: `${podcast.name} Podcast Summary — Free Daily Recap | PodCap`,
    description: podcast.description,
    image: podcast.artworkUrl,
    url: `https://podcap.io/podcasts/${podcast.slug}`,
    twitterCard: "summary_large_image",
  });
}
