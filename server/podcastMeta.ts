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

export function injectPodcastMeta(html: string, url: string): string {
  const match = url.match(/^\/podcasts\/([a-zA-Z0-9_-]+)/);
  if (!match) return html;

  const slug = match[1].toLowerCase();
  const podcast = PODCAST_PAGES.find((p) => p.slug === slug);
  if (!podcast) return html;

  const title = `${podcast.name} Podcast Summary — Free Daily Recap | PodCap`;

  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${title}</title>`
  );

  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/?>/, 
    `<meta name="description" content="${podcast.description}" />`
  );

  html = html.replace(
    /<meta property="og:title" content="[^"]*"\s*\/?>/, 
    `<meta property="og:title" content="${title}" />`
  );

  html = html.replace(
    /<meta property="og:description" content="[^"]*"\s*\/?>/, 
    `<meta property="og:description" content="${podcast.description}" />`
  );

  const ogImageTag = `<meta property="og:image" content="${podcast.artworkUrl}" />`;
  const ogTypeTag = `<meta property="og:type" content="website" />`;
  const twitterCardTag = `<meta name="twitter:card" content="summary_large_image" />`;
  const twitterTitleTag = `<meta name="twitter:title" content="${title}" />`;
  const twitterDescTag = `<meta name="twitter:description" content="${podcast.description}" />`;
  const twitterImageTag = `<meta name="twitter:image" content="${podcast.artworkUrl}" />`;

  const faviconLink = `<link rel="icon" type="image/jpeg" href="${podcast.artworkUrl}" />`;
  html = html.replace(
    /<link rel="icon" type="image\/png" href="\/favicon\.png"\s*\/?>/, 
    faviconLink
  );

  const injectedTags = `${ogImageTag}\n    ${ogTypeTag}\n    ${twitterCardTag}\n    ${twitterTitleTag}\n    ${twitterDescTag}\n    ${twitterImageTag}`;
  html = html.replace(
    /<\/head>/,
    `    ${injectedTags}\n  </head>`
  );

  return html;
}
