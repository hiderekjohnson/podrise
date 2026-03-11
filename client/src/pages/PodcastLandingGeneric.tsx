import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useParams, Link } from "wouter";
import { Loader2, ArrowRight, Clock, Calendar, Mic, Users, Star, Search, X, Compass, Headphones, Sparkles, Send, MessageSquare, ShoppingBag, Globe, Building2, Tag, UserCircle, BookOpen, ChevronRight } from "lucide-react";
import { SiX, SiApplepodcasts, SiSpotify, SiYoutube, SiLinkedin, SiInstagram, SiTiktok, SiFacebook, SiDiscord } from "react-icons/si";
import { ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Footer } from "@/components/Footer";
import { PodCapHeader } from "@/components/PodCapHeader";
import { PodcastPageLayout, type PodcastTab } from "@/components/PodcastPageLayout";

import { getPodcastBySlug, PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { PEOPLE_DIRECTORY } from "@/data/entityDirectoryData";
import type { PodcastLandingConfig } from "@/data/podcastLandingData";
import { EpisodeCard } from "@/components/EpisodeCard";
import { PodCapWordmark } from "@/components/PodCapHeader";

function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={i} className="bg-primary/20 text-foreground rounded px-0.5">{part}</mark> : part
  );
}



function extractAsin(url: string): string | null {
  const patterns = [
    /\/dp\/([A-Za-z0-9]{10})/,
    /\/gp\/product\/([A-Za-z0-9]{10})/,
    /\/product\/([A-Za-z0-9]{10})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

function getBlinkistBookUrl(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `https://www.blinkist.com/en/books/${slug}-en`;
}

function PodcastBookCover({ title, asin, slug }: { title: string; asin: string | null; slug?: string | null }) {
  const [localFailed, setLocalFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [olSrc, setOlSrc] = useState<string | null>(null);
  const [olFailed, setOlFailed] = useState(false);

  const localUrl = slug ? `/books/${slug}.jpg` : null;
  const coverUrl = asin ? `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_SX100_.jpg` : null;

  useEffect(() => {
    setLocalFailed(false);
    setFailed(false);
    setOlSrc(null);
    setOlFailed(false);
  }, [title, asin, slug]);

  useEffect(() => {
    if (localUrl && !localFailed) return;
    if (coverUrl && !failed) return;
    if (olSrc || olFailed) return;
    const q = encodeURIComponent(title);
    fetch(`https://openlibrary.org/search.json?q=${q}&limit=1&fields=cover_i`)
      .then(r => r.json())
      .then(data => {
        const coverId = data?.docs?.[0]?.cover_i;
        if (coverId) setOlSrc(`https://covers.openlibrary.org/b/id/${coverId}-M.jpg`);
        else setOlFailed(true);
      })
      .catch(() => setOlFailed(true));
  }, [title, coverUrl, failed, olSrc, olFailed, localUrl, localFailed]);

  const imgSrc = (localUrl && !localFailed) ? localUrl : (coverUrl && !failed) ? coverUrl : (olSrc && !olFailed) ? olSrc : null;

  if (imgSrc) {
    return (
      <img
        src={imgSrc}
        alt={title}
        className="w-full h-full object-cover rounded-lg"
        onError={() => {
          if (localUrl && !localFailed) setLocalFailed(true);
          else if (coverUrl && !failed) setFailed(true);
          else setOlFailed(true);
        }}
      />
    );
  }

  return <BookOpen className="w-5 h-5 text-amber-400/50" />;
}

interface PodcastBook {
  name: string;
  author: string | null;
  description: string;
  url: string;
  context: string[];
  episodes: { slug: string; title: string }[];
  mentionCount: number;
  asin: string | null;
  slug: string | null;
  pageCount: number | null;
  publishYear: number | null;
  rating: number | null;
}

function PodcastBooksTab({ slug, podcastName }: { slug: string; podcastName: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"mentions" | "alpha">("mentions");
  const [visibleCount, setVisibleCount] = useState(20);
  const [expandedBook, setExpandedBook] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<{ books: PodcastBook[]; total: number }>({
    queryKey: ["/api/podcasts", slug, "books"],
  });

  const books = data?.books || [];
  const query = searchQuery.toLowerCase().trim();

  const filtered = books.filter(b => {
    if (!query) return true;
    return b.name.toLowerCase().includes(query) ||
      (b.author || "").toLowerCase().includes(query) ||
      b.description.toLowerCase().includes(query);
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "alpha") return a.name.localeCompare(b.name);
    return b.mentionCount - a.mentionCount;
  });

  const visible = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;

  return (
    <section className="pb-16" data-testid="section-books-tab">
      <div className="flex items-center gap-2.5 mb-2">
        <BookOpen className="w-5 h-5 text-amber-600" />
        <h2 className="text-[17px] font-display font-bold text-foreground">Recommended Reading</h2>
      </div>
      <p className="text-[15px] text-muted-foreground mb-6">
        Books mentioned across {podcastName} episodes - sorted by how often they come up in conversation.
      </p>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
          <input
            type="text"
            placeholder="Search books, authors..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setVisibleCount(20); }}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-zinc-900 text-[15px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
            data-testid="input-books-search"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2" data-testid="button-books-clear-search">
              <X className="w-4 h-4 text-muted-foreground/40 hover:text-foreground" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSortBy("mentions")}
            className={`px-3 py-2 rounded-lg text-[13px] font-semibold transition-colors ${sortBy === "mentions" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="button-sort-mentions"
          >
            Most mentioned
          </button>
          <button
            onClick={() => setSortBy("alpha")}
            className={`px-3 py-2 rounded-lg text-[13px] font-semibold transition-colors ${sortBy === "alpha" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="button-sort-alpha"
          >
            A–Z
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-5 animate-pulse">
              <div className="flex gap-4">
                <div className="w-14 h-20 bg-muted rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-muted rounded w-2/3" />
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-4 bg-muted rounded w-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-12">
          <BookOpen className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-[15px] font-semibold text-foreground mb-1">Couldn't load books</p>
          <p className="text-[15px] text-muted-foreground">Something went wrong. Try refreshing the page.</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-[15px] font-semibold text-foreground mb-1">
            {searchQuery ? "No books match your search" : "No books found yet"}
          </p>
          <p className="text-[15px] text-muted-foreground">
            {searchQuery ? "Try a different search term." : "Book data is still being extracted for this podcast."}
          </p>
        </div>
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground/50 mb-4" data-testid="text-books-count">
            {sorted.length} book{sorted.length !== 1 ? "s" : ""}{searchQuery ? ` matching "${searchQuery}"` : ""}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {visible.map((book, i) => {
              const asin = book.asin || extractAsin(book.url || "");
              const blinkistUrl = getBlinkistBookUrl(book.name);
              const bookSlug = book.slug;

              return (
                <div
                  key={book.name}
                  className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-5 hover:border-amber-500/[0.15] hover:shadow-md hover:shadow-black/[0.03] transition-all flex flex-col"
                  data-testid={`book-row-${i}`}
                >
                  <div className="flex gap-4">
                    {bookSlug ? (
                      <Link href={`/bookstore/${bookSlug}`} className="w-16 h-[88px] rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/30 dark:border-amber-700/20 flex items-center justify-center shrink-0 overflow-hidden">
                        <PodcastBookCover title={book.name} asin={asin} slug={bookSlug} />
                      </Link>
                    ) : (
                      <div className="w-16 h-[88px] rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/30 dark:border-amber-700/20 flex items-center justify-center shrink-0 overflow-hidden">
                        <PodcastBookCover title={book.name} asin={asin} slug={bookSlug} />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      {bookSlug ? (
                        <Link href={`/bookstore/${bookSlug}`} className="text-[15px] font-bold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors leading-snug" data-testid={`book-title-${i}`}>
                          {book.name}
                        </Link>
                      ) : (
                        <h3 className="text-[15px] font-bold text-foreground leading-snug" data-testid={`book-title-${i}`}>
                          {book.name}
                        </h3>
                      )}
                      {book.author && book.author !== "null" && (
                        <p className="text-sm text-muted-foreground mt-0.5" data-testid={`book-author-${i}`}>
                          by {book.author}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/[0.08] px-2 py-0.5 rounded-full" data-testid={`book-mentions-${i}`}>
                          <Mic className="w-3 h-3" />
                          {book.mentionCount} {book.mentionCount === 1 ? "mention" : "mentions"}
                        </span>
                        {book.rating && (
                          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            {book.rating.toFixed(1)}
                          </span>
                        )}
                        {book.pageCount && (
                          <span className="text-xs text-muted-foreground">{book.pageCount}p</span>
                        )}
                        {book.publishYear && (
                          <span className="text-xs text-muted-foreground">{book.publishYear}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {book.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed mt-3" data-testid={`book-description-${i}`}>
                      {book.description.length > 180 ? book.description.slice(0, 180).replace(/\s+\S*$/, "") + "." : book.description}
                    </p>
                  )}

                  <div className="mt-auto pt-3 flex items-center justify-end">
                    {bookSlug ? (
                      <Link
                        href={`/bookstore/${bookSlug}`}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
                        data-testid={`book-view-${i}`}
                      >
                        View
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    ) : (
                      <a
                        href={blinkistUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
                        data-testid={`book-buy-${i}`}
                      >
                        Summary
                        <ExternalLink className="w-3 h-3 text-amber-700/40 dark:text-amber-400/40" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {hasMore && (
            <button
              onClick={() => setVisibleCount(prev => prev + 20)}
              className="w-full mt-6 py-3 rounded-xl border border-black/[0.06] dark:border-white/[0.08] text-[15px] font-semibold text-primary hover:bg-primary/[0.04] transition-colors"
              data-testid="button-load-more-books"
            >
              Show more books ({sorted.length - visibleCount} remaining)
            </button>
          )}

          <p className="text-[11px] text-muted-foreground/40 mt-5 text-center">
            Blinkist links open summaries of recommended books.
          </p>
        </>
      )}
    </section>
  );
}

export default function PodcastLandingGeneric() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const staticConfig = getPodcastBySlug(slug || "");
  const [, navigate] = useLocation();
  const { data: user } = useAuth();

  const getTabFromUrl = () => {
    const urlTab = new URLSearchParams(window.location.search).get("tab");
    if (urlTab === "discover" || urlTab === "episodes" || urlTab === "books") return urlTab;
    return "episodes" as PodcastTab;
  };
  const [activeTab, setActiveTab] = useState<PodcastTab>(getTabFromUrl);

  useEffect(() => {
    setActiveTab(getTabFromUrl());
  }, [slug]);

  const { data: dbEntry } = useQuery<any>({
    queryKey: ["/api/podcasts/by-slug", slug],
    enabled: !!slug,
  });

  const { data: podcastHosts } = useQuery<any[]>({
    queryKey: ["/api/podcasts", slug, "hosts"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${slug}/hosts`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!slug,
  });

  const config = dbEntry ? {
    slug: dbEntry.slug,
    name: dbEntry.name,
    itunesId: dbEntry.itunesId,
    category: dbEntry.category || "",
    hosts: dbEntry.hosts || "",
    description: dbEntry.description || "",
    keywords: dbEntry.keywords || "",
    faqTopics: dbEntry.faqTopics || "",
    artworkUrl: dbEntry.artworkUrl || "",
    appleUrl: dbEntry.appleUrl,
    spotifyUrl: dbEntry.spotifyUrl,
    youtubeUrl: dbEntry.youtubeUrl,
    avgEpisodeLength: dbEntry.avgEpisodeLength,
    frequency: dbEntry.frequency,
    totalEpisodes: dbEntry.totalEpisodes,
    yearStarted: dbEntry.yearStarted,
    knownFor: dbEntry.knownFor,
    hostBios: (() => { try { return typeof dbEntry.hostBios === "string" ? JSON.parse(dbEntry.hostBios) : Array.isArray(dbEntry.hostBios) ? dbEntry.hostBios : undefined; } catch { return undefined; } })(),
    relatedSlugs: dbEntry.relatedSlugs,
    aboutPodcast: dbEntry.aboutPodcast,
    appleRating: (dbEntry as any).appleRating,
    appleRatingCount: (dbEntry as any).appleRatingCount,
    twitterHandle: dbEntry.twitterHandle,
    instagramUrl: (dbEntry as any).instagramUrl,
    tiktokUrl: (dbEntry as any).tiktokUrl,
    facebookUrl: (dbEntry as any).facebookUrl,
    discordUrl: (dbEntry as any).discordUrl,
    websiteUrl: (dbEntry as any).websiteUrl,
    storeUrl: (dbEntry as any).storeUrl,
  } as PodcastLandingConfig & { twitterHandle?: string | null; instagramUrl?: string | null; tiktokUrl?: string | null; facebookUrl?: string | null; discordUrl?: string | null; websiteUrl?: string | null; storeUrl?: string | null } : staticConfig ? { ...staticConfig, twitterHandle: null as string | null, instagramUrl: null as string | null, tiktokUrl: null as string | null, facebookUrl: null as string | null, discordUrl: null as string | null, websiteUrl: null as string | null, storeUrl: null as string | null } : null;

  useEffect(() => {
    if (!config) return;

    const { name, slug: s, keywords, hosts, description, artworkUrl } = config;
    const url = `https://podcap.io/podcasts/${s}`;

    document.title = `${name} Podcast Summary, Latest Episode Recap | PodCap`;

    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };

    setMeta("name", "description", `Get free daily ${name} podcast summaries and episode recaps. ${name} podcast recap of every new episode by ${hosts} - ${description} delivered to your inbox.`);
    setMeta("name", "keywords", `${name} podcast summary, ${name} episode summary, ${name} podcast recap, ${name} recap, ${keywords}, podcast summary, daily podcast recap`);
    setMeta("property", "og:title", `${name} Podcast Summary, Latest Episode Recap | PodCap`);
    setMeta("property", "og:description", `Daily ${name} podcast summaries and episode recaps. ${description.charAt(0).toUpperCase() + description.slice(1)} - delivered free to your inbox.`);
    setMeta("property", "og:url", url);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", "PodCap");
    if (artworkUrl) {
      setMeta("property", "og:image", artworkUrl);
      setMeta("name", "twitter:card", "summary_large_image");
      setMeta("name", "twitter:image", artworkUrl);
    } else {
      setMeta("name", "twitter:card", "summary");
    }
    setMeta("name", "twitter:title", `${name} Podcast Summary, Latest Episode Recap | PodCap`);
    setMeta("name", "twitter:description", `Free daily ${name} podcast summaries and episode recaps delivered to your inbox.`);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) { canonical = document.createElement("link"); canonical.setAttribute("rel", "canonical"); document.head.appendChild(canonical); }
    canonical.setAttribute("href", url);

    let jsonLd = document.querySelector('script[data-seo="podcast-landing"]');
    if (!jsonLd) { jsonLd = document.createElement("script"); jsonLd.setAttribute("type", "application/ld+json"); jsonLd.setAttribute("data-seo", "podcast-landing"); document.head.appendChild(jsonLd); }
    jsonLd.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": `${name} Podcast Summary, Latest Episode Recap`,
      "description": `Free daily ${name} podcast summary and episode recap. ${description.charAt(0).toUpperCase() + description.slice(1)} delivered to your inbox.`,
      "url": url,
      "publisher": { "@type": "Organization", "name": "PodCap", "url": "https://podcap.io" },
      "about": { "@type": "PodcastSeries", "name": name },
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD", "description": `Free daily ${name} podcast recap delivered by email` },
    });

    return () => {
      const ld = document.querySelector('script[data-seo="podcast-landing"]');
      if (ld) ld.remove();
    };
  }, [config?.name]);

  if (user) {
    navigate("/dashboard");
    return null;
  }

  if (!config && !dbEntry && !staticConfig) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <PodCapHeader />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Podcast not found</h1>
            <p className="text-muted-foreground mb-4">We couldn't find a landing page for this podcast.</p>
            <a href="/" className="text-primary hover:underline">Back to home</a>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const { name, hosts, category, itunesId, artworkUrl, spotifyUrl, youtubeUrl, avgEpisodeLength, frequency, totalEpisodes, yearStarted, knownFor, hostBios, relatedSlugs, aboutPodcast, description, appleRating, appleRatingCount } = config;
  const twitterHandle = (config as any).twitterHandle as string | null | undefined;
  const instagramUrl = (config as any).instagramUrl as string | null | undefined;
  const tiktokUrl = (config as any).tiktokUrl as string | null | undefined;
  const facebookUrl = (config as any).facebookUrl as string | null | undefined;
  const discordUrl = (config as any).discordUrl as string | null | undefined;
  const websiteUrl = (config as any).websiteUrl as string | null | undefined;
  const storeUrl = (config as any).storeUrl as string | null | undefined;

  const appleUrl = config.appleUrl || `https://podcasts.apple.com/podcast/id${itunesId}`;
  const effectiveSpotifyUrl = spotifyUrl || `https://open.spotify.com/search/${encodeURIComponent(name)}`;

  const relatedPodcasts = (relatedSlugs || [])
    .map(s => getPodcastBySlug(s))
    .filter((p): p is PodcastLandingConfig => !!p)
    .slice(0, 3);

  const { data: episodeRecaps = [] } = useQuery<any[]>({
    queryKey: ["/api/podcasts", slug, "recaps"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${slug}/recaps?limit=10`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!slug,
  });

  const { data: entityLinks } = useQuery<{
    companies: Array<{ slug: string; name: string; description: string; count: number }>;
    people: Array<{ slug: string; name: string; title: string; count: number }>;
    topics: Array<{ topic: string; count: number }>;
    guests: Array<{ name: string; title?: string; episodeTitle: string; episodeSlug: string; publishDate: string }>;
  }>({
    queryKey: ["/api/podcasts", slug, "entity-links"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${slug}/entity-links`);
      if (!res.ok) return { companies: [], people: [], topics: [], guests: [] };
      return res.json();
    },
    enabled: !!slug,
    staleTime: 1000 * 60 * 30,
  });

  const formatRatingCount = (count: number) => {
    if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}K`;
    return count.toLocaleString();
  };

  const snapshotItems = [
    appleRating ? { icon: Star, label: "Apple Rating", value: `${appleRating} stars${appleRatingCount ? ` (${formatRatingCount(appleRatingCount)})` : ''}` } : null,
    category ? { icon: Compass, label: "Category", value: category } : null,
    avgEpisodeLength ? { icon: Clock, label: "Avg. Episode", value: `${avgEpisodeLength} min` } : null,
    frequency ? { icon: Calendar, label: "Frequency", value: frequency } : null,
    totalEpisodes ? { icon: Mic, label: "Episodes", value: `${totalEpisodes.toLocaleString()}+` } : null,
    yearStarted ? { icon: Calendar, label: "Since", value: `${yearStarted}` } : null,
  ].filter(Boolean) as { icon: typeof Star; label: string; value: string }[];

  return (
    <PodcastPageLayout
      config={config}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === "episodes" && (
        <section className="pb-16" data-testid="section-episode-list">
          {episodeRecaps.length > 0 ? (
            <>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mb-5">
                Quick summaries of the latest episodes - key takeaways in minutes, not hours.
              </p>
              <div className="flex flex-col gap-5">
                {episodeRecaps.slice(0, 10).map((ep: any) => (
                  <EpisodeCard
                    key={ep.episodeSlug}
                    episodeSlug={ep.episodeSlug}
                    podcastSlug={slug}
                    publishDate={ep.publishDate}
                    episodeTitle={ep.episodeTitle}
                    tldl={ep.tldl}
                    duration={ep.duration}
                  />
                ))}
              </div>
              <div className="flex justify-center mt-8">
                <Link href={`/podcasts/${slug}/episodes`}>
                  <span className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-display font-bold text-base bg-primary/[0.06] text-primary hover:bg-primary/[0.1] transition-colors" data-testid="link-view-all-episodes">
                    View All Episode Recaps
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </Link>
              </div>
            </>
          ) : (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-primary/[0.06] flex items-center justify-center mx-auto mb-4">
                <Mic className="w-6 h-6 text-primary/30" />
              </div>
              <p className="text-muted-foreground font-medium">Episode recaps are being generated.</p>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]/60 mt-1">Check back soon for the latest summaries.</p>
            </div>
          )}
        </section>
      )}

      {activeTab === "about" && (
        <section className="pb-16" data-testid="section-about-podcast">
          {aboutPodcast && (
            <div className="bg-white border border-black/[0.06] rounded-xl p-6 mb-6" data-testid="text-about-podcast">
              <p className="text-[15px] leading-[1.85] text-foreground/75">{aboutPodcast}</p>
            </div>
          )}

          {snapshotItems.length > 0 && (
            <div className="mb-6" data-testid="section-snapshot">
              <h3 className="text-[15px] font-bold text-muted-foreground uppercase tracking-wider mb-3">At a Glance</h3>
              <div className={`grid gap-3 grid-cols-2 ${snapshotItems.length <= 2 ? "sm:grid-cols-2" : snapshotItems.length === 3 ? "sm:grid-cols-3" : snapshotItems.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3 lg:grid-cols-5"}`}>
                {snapshotItems.map((item, i) => (
                  <div key={i} className="bg-white border border-black/[0.06] rounded-xl px-4 py-4" data-testid={`snapshot-${item.label.toLowerCase().replace(/\s/g, "-")}`}>
                    <p className="text-[15px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1">{item.label}</p>
                    <p className="text-base font-bold text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {knownFor && knownFor.length > 0 && (
            <div className="mb-6" data-testid="section-known-for">
              <h3 className="text-[15px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Known For</h3>
              <div className="bg-white border border-black/[0.06] rounded-xl p-5">
                <ul className="space-y-3">
                  {knownFor.map((item, i) => (
                    <li key={i} className="flex items-start gap-3" data-testid={`known-for-${i}`}>
                      <span className="shrink-0 mt-2 w-1.5 h-1.5 rounded-full bg-primary" />
                      <span className="text-[17px] text-foreground/75 leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {(() => {
            const richHosts = podcastHosts && podcastHosts.length > 0 ? podcastHosts : null;
            const fallbackHosts = !richHosts && hostBios && hostBios.length > 0 ? hostBios : null;
            const displayHosts = richHosts || fallbackHosts;
            if (!displayHosts || displayHosts.length === 0) return null;
            return (
              <div className="mb-6" data-testid="section-host-bios">
                <h3 className="text-[15px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
                  {displayHosts.length === 1 ? "Host" : "Hosts"}
                </h3>
                <div className={`grid gap-3 ${displayHosts.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
                  {displayHosts.map((host: any, i: number) => (
                    <div key={host.id || i} className="bg-white border border-black/[0.06] rounded-xl p-5" data-testid={`host-bio-${i}`}>
                      <div className="flex items-center gap-3 mb-3">
                        {host.photoUrl ? (
                          <img src={host.photoUrl} alt={host.name} className="w-12 h-12 rounded-full object-cover shrink-0 ring-2 ring-black/[0.04]" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-primary/[0.08] flex items-center justify-center shrink-0">
                            <Users className="w-5 h-5 text-primary/60" />
                          </div>
                        )}
                        {(() => {
                          const personEntry = PEOPLE_DIRECTORY.find((p) => p.name === host.name);
                          return personEntry ? (
                            <div>
                              <Link href={`/people/${personEntry.slug}`} className="text-[15px] font-bold text-foreground hover:text-primary transition-colors" data-testid={`link-host-profile-${i}`}>
                                {host.name}
                              </Link>
                              <Link href={`/people/${personEntry.slug}`} className="block text-xs text-muted-foreground hover:text-primary/80 transition-colors mt-0.5" data-testid={`link-host-profile-cta-${i}`}>
                                View full profile →
                              </Link>
                            </div>
                          ) : (
                            <h4 className="text-[15px] font-bold text-foreground">{host.name}</h4>
                          );
                        })()}
                      </div>
                      {host.bio && (() => {
                        const paragraphs = host.bio.split(/\n\n+/).filter((p: string) => p.trim());
                        return (
                          <div className="text-base text-[#3F3F46] dark:text-[#A1A1AA] leading-relaxed mb-3 space-y-2.5">
                            {paragraphs.map((para: string, pi: number) => {
                              const lines = para.split('\n').filter((l: string) => l.trim());
                              const bulletLines = lines.filter((l: string) => /^[•\-\*]\s/.test(l.trim()));
                              if (bulletLines.length > 0 && bulletLines.length === lines.length) {
                                return (
                                  <ul key={pi} className="space-y-1 pl-1">
                                    {bulletLines.map((line: string, li: number) => (
                                      <li key={li} className="flex items-start gap-2">
                                        <span className="text-primary/50 mt-[3px] text-xs">●</span>
                                        <span>{line.replace(/^[•\-\*]\s*/, '')}</span>
                                      </li>
                                    ))}
                                  </ul>
                                );
                              }
                              const hasInlineBullets = para.includes('•') && !para.startsWith('•');
                              if (hasInlineBullets) {
                                const parts = para.split(/\s*•\s*/);
                                const intro = parts[0];
                                const items = parts.slice(1).filter((s: string) => s.trim());
                                return (
                                  <div key={pi}>
                                    {intro && <p className="mb-1.5">{intro}</p>}
                                    {items.length > 0 && (
                                      <ul className="space-y-1 pl-1">
                                        {items.map((item: string, li: number) => (
                                          <li key={li} className="flex items-start gap-2">
                                            <span className="text-primary/50 mt-[3px] text-xs">●</span>
                                            <span>{item.trim()}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                );
                              }
                              return <p key={pi}>{para}</p>;
                            })}
                          </div>
                        );
                      })()}
                      {(host.twitterHandle || host.linkedinUrl || host.instagramHandle || host.websiteUrl) && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {host.twitterHandle && (
                            <a href={`https://x.com/${host.twitterHandle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[15px] font-medium text-muted-foreground hover:text-foreground bg-black/[0.03] hover:bg-black/[0.06] rounded-lg transition-colors" data-testid={`host-twitter-${i}`}>
                              <SiX className="w-3 h-3" />
                              {host.twitterHandle.startsWith('@') ? host.twitterHandle : `@${host.twitterHandle}`}
                              <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                            </a>
                          )}
                          {host.linkedinUrl && (
                            <a href={host.linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[15px] font-medium text-muted-foreground hover:text-foreground bg-black/[0.03] hover:bg-black/[0.06] rounded-lg transition-colors" data-testid={`host-linkedin-${i}`}>
                              <SiLinkedin className="w-3 h-3" />
                              LinkedIn
                              <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                            </a>
                          )}
                          {host.instagramHandle && (
                            <a href={`https://instagram.com/${host.instagramHandle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[15px] font-medium text-muted-foreground hover:text-foreground bg-black/[0.03] hover:bg-black/[0.06] rounded-lg transition-colors" data-testid={`host-instagram-${i}`}>
                              <SiInstagram className="w-3 h-3" />
                              {host.instagramHandle.startsWith('@') ? host.instagramHandle : `@${host.instagramHandle}`}
                              <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                            </a>
                          )}
                          {host.websiteUrl && (
                            <a href={host.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[15px] font-medium text-muted-foreground hover:text-foreground bg-black/[0.03] hover:bg-black/[0.06] rounded-lg transition-colors" data-testid={`host-website-${i}`}>
                              <Globe className="w-3 h-3" />
                              Website
                              <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="mb-6" data-testid="section-listen">
            <h3 className="text-[15px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Listen On</h3>
            <div className="flex flex-wrap gap-2.5">
              <a
                href={appleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-base font-medium text-foreground transition-colors"
                data-testid="link-apple-podcasts"
              >
                <SiApplepodcasts className="w-4 h-4 text-[#872EC4]" />
                Apple Podcasts
                <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
              </a>
              <a
                href={effectiveSpotifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-base font-medium text-foreground transition-colors"
                data-testid="link-spotify"
              >
                <SiSpotify className="w-4 h-4 text-[#1DB954]" />
                Spotify
                <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
              </a>
              {youtubeUrl && (
                <a
                  href={youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-base font-medium text-foreground transition-colors"
                  data-testid="link-youtube"
                >
                  <SiYoutube className="w-4 h-4 text-[#FF0000]" />
                  YouTube
                  <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                </a>
              )}
            </div>
          </div>

          {(twitterHandle || instagramUrl || tiktokUrl || facebookUrl || discordUrl || websiteUrl || storeUrl) && (
            <div className="mb-6" data-testid="section-follow">
              <h3 className="text-[15px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Follow</h3>
              <div className="flex flex-wrap gap-2.5">
                {twitterHandle && (
                  <a
                    href={`https://x.com/${twitterHandle.replace("@", "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-base font-medium text-foreground transition-colors"
                    data-testid="link-x-profile"
                  >
                    <SiX className="w-3.5 h-3.5" />
                    {twitterHandle}
                    <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                  </a>
                )}
                {instagramUrl && (
                  <a
                    href={instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-base font-medium text-foreground transition-colors"
                    data-testid="link-instagram"
                  >
                    <SiInstagram className="w-4 h-4 text-[#E4405F]" />
                    Instagram
                    <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                  </a>
                )}
                {tiktokUrl && (
                  <a
                    href={tiktokUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-base font-medium text-foreground transition-colors"
                    data-testid="link-tiktok"
                  >
                    <SiTiktok className="w-4 h-4" />
                    TikTok
                    <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                  </a>
                )}
                {facebookUrl && (
                  <a
                    href={facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-base font-medium text-foreground transition-colors"
                    data-testid="link-facebook"
                  >
                    <SiFacebook className="w-4 h-4 text-[#1877F2]" />
                    Facebook
                    <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                  </a>
                )}
                {discordUrl && (
                  <a
                    href={discordUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-base font-medium text-foreground transition-colors"
                    data-testid="link-discord"
                  >
                    <SiDiscord className="w-4 h-4 text-[#5865F2]" />
                    Discord
                    <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                  </a>
                )}
                {websiteUrl && (
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-base font-medium text-foreground transition-colors"
                    data-testid="link-website"
                  >
                    <Globe className="w-4 h-4 text-muted-foreground" />
                    Website
                    <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                  </a>
                )}
                {storeUrl && (
                  <a
                    href={storeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-base font-medium text-foreground transition-colors"
                    data-testid="link-store"
                  >
                    <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                    Store
                    <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                  </a>
                )}
              </div>
            </div>
          )}

          <p className="text-[15px] text-muted-foreground/40 mt-8">
            PodCap is not affiliated with, endorsed by, or sponsored by {name}, {hosts}, or any podcast listed on this site.
          </p>
        </section>
      )}

      {activeTab === "books" && (
        <PodcastBooksTab slug={slug} podcastName={config.name} />
      )}

      {activeTab === "discover" && (
        <section className="pb-16 space-y-10" data-testid="section-discover">
          {entityLinks?.guests && entityLinks.guests.length > 0 && (
            <div data-testid="section-recent-guests">
              <div className="flex items-center gap-2.5 mb-4">
                <UserCircle className="w-5 h-5 text-primary" />
                <h3 className="text-[17px] font-display font-bold text-foreground">Recent Guests</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {entityLinks.guests.map((guest, i) => {
                  const personSlug = entityLinks.people.find(p => p.name === guest.name)?.slug;
                  const date = new Date(guest.publishDate + "T00:00:00");
                  const formatted = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  return (
                    <div key={i} className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-4 flex flex-col gap-1.5" data-testid={`card-guest-${i}`}>
                      <div className="flex items-center justify-between gap-2">
                        {personSlug ? (
                          <Link href={`/people/${personSlug}`} className="text-[15px] font-bold text-foreground hover:text-primary transition-colors" data-testid={`link-guest-person-${i}`}>{guest.name}</Link>
                        ) : (
                          <span className="text-[15px] font-bold text-foreground">{guest.name}</span>
                        )}
                      </div>
                      {guest.title && <p className="text-[15px] text-muted-foreground/60 leading-snug">{guest.title}</p>}
                      <Link href={`/podcasts/${slug}/${guest.episodeSlug}`} className="text-[15px] text-primary/70 hover:text-primary transition-colors line-clamp-1 mt-0.5" data-testid={`link-guest-episode-${i}`}>
                        {guest.episodeTitle}
                      </Link>
                      <span className="text-[15px] text-muted-foreground/40">{formatted}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {entityLinks?.companies && entityLinks.companies.length > 0 && (
            <div data-testid="section-top-companies">
              <div className="flex items-center gap-2.5 mb-4">
                <Building2 className="w-5 h-5 text-primary" />
                <h3 className="text-[17px] font-display font-bold text-foreground">Most Discussed Companies</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {entityLinks.companies.map((company, i) => (
                  <Link key={company.slug} href={`/companies/${company.slug}`} className="block" data-testid={`link-company-${company.slug}`}>
                    <div className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-4 flex items-center gap-4 hover:border-primary/[0.15] hover:shadow-md hover:shadow-black/[0.04] transition-all group">
                      <img
                        src={`/logos/${company.slug}.png`}
                        alt={company.name}
                        className="w-10 h-10 rounded-lg object-contain bg-white p-1 border border-black/[0.06] shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold text-foreground group-hover:text-primary transition-colors">{company.name}</p>
                        <p className="text-[15px] text-muted-foreground/60 mt-0.5 line-clamp-1">{company.description}</p>
                      </div>
                      <span className="shrink-0 inline-flex items-center px-2 py-1 rounded-lg text-[13px] font-bold bg-primary/[0.08] text-primary">{company.count} ep{company.count !== 1 ? "s" : ""}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {entityLinks?.people && entityLinks.people.length > 0 && (
            <div data-testid="section-top-people">
              <div className="flex items-center gap-2.5 mb-4">
                <Users className="w-5 h-5 text-primary" />
                <h3 className="text-[17px] font-display font-bold text-foreground">Most Mentioned People</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {entityLinks.people.map((person) => (
                  <Link key={person.slug} href={`/people/${person.slug}`} className="block" data-testid={`link-person-${person.slug}`}>
                    <div className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-4 flex items-center gap-4 hover:border-primary/[0.15] hover:shadow-md hover:shadow-black/[0.04] transition-all group">
                      <img
                        src={`/people/${person.slug}.png`}
                        alt={person.name}
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                        onError={(e) => {
                          const el = e.target as HTMLImageElement;
                          el.onerror = null;
                          el.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(person.name)}&background=6366f1&color=fff&size=80`;
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold text-foreground group-hover:text-primary transition-colors">{person.name}</p>
                        {person.title && <p className="text-[15px] text-muted-foreground/60 mt-0.5 line-clamp-1">{person.title}</p>}
                      </div>
                      <span className="shrink-0 inline-flex items-center px-2 py-1 rounded-lg text-[13px] font-bold bg-primary/[0.08] text-primary">{person.count} ep{person.count !== 1 ? "s" : ""}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {entityLinks?.topics && entityLinks.topics.length > 0 && (
            <div data-testid="section-top-topics">
              <div className="flex items-center gap-2.5 mb-4">
                <Tag className="w-5 h-5 text-primary" />
                <h3 className="text-[17px] font-display font-bold text-foreground">Top Topics Discussed</h3>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {entityLinks.topics.map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl text-[15px] font-medium text-foreground capitalize" data-testid={`tag-topic-${i}`}>
                    {t.topic}
                    <span className="text-muted-foreground/40 text-[13px] font-bold">({t.count})</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {relatedPodcasts.length > 0 && (
            <div data-testid="section-related-podcasts">
              <div className="flex items-center gap-2.5 mb-4">
                <Headphones className="w-5 h-5 text-primary" />
                <h3 className="text-[17px] font-display font-bold text-foreground">Related Podcasts</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {relatedPodcasts.map((rp) => (
                  <a
                    key={rp.slug}
                    href={`/podcasts/${rp.slug}`}
                    className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-4 flex items-center gap-4 hover:border-primary/[0.15] hover:shadow-md hover:shadow-black/[0.04] transition-all group"
                    data-testid={`related-podcast-${rp.slug}`}
                  >
                    {rp.artworkUrl ? (
                      <img src={rp.artworkUrl} alt={rp.name} className="w-14 h-14 rounded-xl object-cover shadow-sm shadow-black/[0.06] shrink-0 ring-1 ring-black/[0.04]" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-primary/[0.06] flex items-center justify-center shrink-0">
                        <Headphones className="w-5 h-5 text-primary/30" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-bold text-foreground truncate group-hover:text-primary transition-colors">{rp.name}</p>
                      <p className="text-[15px] text-muted-foreground/60 mt-0.5 uppercase tracking-wider font-semibold">{rp.category}</p>
                    </div>
                    <ArrowRight className="shrink-0 w-4 h-4 text-muted-foreground/20 group-hover:text-primary transition-colors" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {!entityLinks && (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-primary/[0.06] flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-6 h-6 text-primary/30 animate-spin" />
              </div>
              <p className="text-muted-foreground font-medium">Loading discover content...</p>
            </div>
          )}
        </section>
      )}
    </PodcastPageLayout>
  );
}
