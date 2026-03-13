import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { motion } from "framer-motion";
import { BookOpen, ExternalLink, Mic, ArrowLeft, Calendar, ChevronRight, ChevronDown, Star, Share2, Copy, Check, User, FileText, ShoppingCart, Quote, MessageCircle, Hash, TrendingUp } from "lucide-react";
import { BookCover as SharedBookCover } from "@/components/BookCover";
import { SiX } from "react-icons/si";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { PEOPLE_DIRECTORY } from "@/data/entityDirectoryData";

const PEOPLE_SLUG_MAP: Record<string, string> = {};
PEOPLE_DIRECTORY.forEach(p => { PEOPLE_SLUG_MAP[p.name.toLowerCase()] = p.slug; });

function AuthorWithLinks({ author }: { author: string }) {
  const parts = author.split(/(\s+and\s+)/i);
  return (
    <>
      {parts.map((part, i) => {
        const slug = PEOPLE_SLUG_MAP[part.trim().toLowerCase()];
        if (slug) {
          return (
            <Link key={i} href={`/people/${slug}`} className="text-amber-700 dark:text-amber-400 hover:underline">
              {part}
            </Link>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

interface BookEpisode {
  podcastSlug: string;
  podcastName: string;
  episodeSlug: string;
  episodeTitle: string;
  context: string;
  publishedAt: string | null;
  hosts: string | null;
  guests: string | null;
  recommendedBy: string | null;
  recommenderRole: "host" | "guest" | "author" | null;
}

interface RelatedBook {
  name: string;
  author: string | null;
  slug: string;
  mentionCount: number;
  asin: string | null;
  googleBooksId: string | null;
  isbn: string | null;
  hasCover: boolean | null;
  topics: string[];
}

interface TopHost {
  name: string;
  count: number;
}

interface BookDetail {
  name: string;
  author: string | null;
  description: string | null;
  podcastBuzz: string | null;
  slug: string;
  asin: string | null;
  googleBooksId: string | null;
  isbn: string | null;
  hasCover: boolean | null;
  amazonUrl: string;
  audibleUrl: string;
  blinkistUrl: string | null;
  topics: string[];
  rating: number | null;
  ratingCount: number | null;
  pageCount: number | null;
  publishYear: number | null;
  podcastScore: number | null;
  mentionCount: number;
  podcastCount: number;
  podcastNames: string[];
  firstMentioned: string | null;
  lastMentioned: string | null;
  topHosts: TopHost[];
  episodes: BookEpisode[];
  relatedBooks: RelatedBook[];
}

function BookCover({ title, slug, googleBooksId, isbn, hasCover, size = "lg" }: { title: string; asin?: string | null; slug?: string | null; googleBooksId?: string | null; isbn?: string | null; hasCover?: boolean | null; size?: "sm" | "md" | "lg" | "xl" }) {
  const sizeClasses: Record<string, string> = {
    sm: "w-12 h-[72px]",
    md: "w-[88px] h-[132px]",
    lg: "w-28 h-[168px]",
    xl: "w-36 h-[216px] sm:w-44 sm:h-[264px]",
  };
  return (
    <SharedBookCover
      title={title}
      slug={slug}
      googleBooksId={googleBooksId}
      isbn={isbn}
      hasCover={hasCover}
      size={size}
      className={`${sizeClasses[size]} rounded-xl object-cover shrink-0 shadow-lg border border-black/[0.06] dark:border-white/[0.08]`}
    />
  );
}

function SmallBookCover({ title, slug, googleBooksId, isbn, hasCover }: { title: string; asin?: string | null; slug?: string | null; googleBooksId?: string | null; isbn?: string | null; hasCover?: boolean | null }) {
  return (
    <SharedBookCover
      title={title}
      slug={slug}
      googleBooksId={googleBooksId}
      isbn={isbn}
      hasCover={hasCover}
      size="sm"
      className="w-16 h-24 rounded-lg object-cover shrink-0 shadow-md border border-black/[0.06] dark:border-white/[0.08]"
    />
  );
}

function SEOHead({ book }: { book: BookDetail }) {
  const title = `Why ${book.podcastCount} Podcasts Recommend ${book.name}${book.author ? ` by ${book.author}` : ""} | PodCap`;
  const description = `${book.name} has been recommended ${book.mentionCount} times across ${book.podcastCount} podcasts including ${book.podcastNames.slice(0, 2).join(" and ")}${book.podcastNames.length > 2 ? " and more" : ""}. See who recommends it and what they say.`;

  if (typeof document !== "undefined") {
    document.title = title;
    const setOrCreate = (attr: string, key: string, value: string) => {
      const selector = `meta[${attr}="${key}"]`;
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", value);
    };
    setOrCreate("name", "description", description);
    setOrCreate("property", "og:title", title);
    setOrCreate("property", "og:description", description);
    setOrCreate("property", "og:url", `https://podcap.io/bookstore/${book.slug}`);
    setOrCreate("property", "og:type", "book");
    setOrCreate("name", "twitter:card", "summary");

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.href = `https://podcap.io/bookstore/${book.slug}`;

    let schemaScript = document.querySelector('script[data-book-schema]') as HTMLScriptElement;
    if (!schemaScript) {
      schemaScript = document.createElement("script");
      schemaScript.type = "application/ld+json";
      schemaScript.setAttribute("data-book-schema", "true");
      document.head.appendChild(schemaScript);
    }
    schemaScript.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Book",
      name: book.name,
      ...(book.author ? { author: { "@type": "Person", name: book.author } } : {}),
      ...(book.description ? { description: book.description } : {}),
      ...(book.rating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: book.rating, bestRating: 5, ...(book.ratingCount ? { ratingCount: book.ratingCount } : {}) } } : {}),
      ...(book.publishYear ? { datePublished: String(book.publishYear) } : {}),
      ...(book.pageCount ? { numberOfPages: book.pageCount } : {}),
      url: `https://podcap.io/bookstore/${book.slug}`,
    });
  }
  return null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

function ShareButton({ book }: { book: BookDetail }) {
  const [copied, setCopied] = useState(false);
  const url = `https://podcap.io/bookstore/${book.slug}`;
  const tweetText = `${book.name}${book.author ? ` by ${book.author}` : ""} — recommended on ${book.podcastCount} podcasts\n${url}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center gap-2" data-testid="share-buttons">
      <a
        href={`https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="p-2 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors"
        data-testid="button-share-x"
        title="Share on X"
      >
        <SiX className="w-3.5 h-3.5 text-foreground" />
      </a>
      <button
        onClick={handleCopy}
        className="p-2 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors"
        data-testid="button-copy-link"
        title="Copy link"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-[#6366F1]" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
    </div>
  );
}

function RecommendationCard({ ep, index, peopleMap }: { ep: BookEpisode; index: number; peopleMap: Map<string, { slug: string; name: string; imageUrl: string }> }) {
  const person = ep.recommendedBy ? peopleMap.get(ep.recommendedBy.toLowerCase()) : null;
  const roleLabel = ep.recommenderRole === "author" ? "Author" : ep.recommenderRole === "guest" ? "Guest" : "Host";
  const roleColor = ep.recommenderRole === "author"
    ? "text-violet-700 dark:text-violet-400 bg-violet-500/[0.08]"
    : ep.recommenderRole === "guest"
    ? "text-blue-700 dark:text-blue-400 bg-blue-500/[0.08]"
    : "text-amber-700 dark:text-amber-400 bg-amber-500/[0.08]";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.3) }}
      className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-5 hover:shadow-md hover:border-amber-500/15 transition-all"
      data-testid={`recommendation-card-${index}`}
    >
      {ep.context && (
        <div className="mb-4">
          <Quote className="w-5 h-5 text-amber-500/30 mb-2" />
          <p className="text-[15px] sm:text-[16px] text-foreground leading-relaxed" data-testid={`recommendation-context-${index}`}>
            {ep.context}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-black/[0.04] dark:border-white/[0.04]">
        <div className="flex items-center gap-3 min-w-0">
          {ep.recommendedBy && (
            <>
              {person ? (
                <Link href={`/people/${person.slug}`} className="shrink-0">
                  <img
                    src={person.imageUrl}
                    alt={ep.recommendedBy}
                    className="w-9 h-9 rounded-full object-cover border border-black/[0.06] shadow-sm"
                  />
                </Link>
              ) : (
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                {person ? (
                  <Link href={`/people/${person.slug}`} className="text-[14px] font-semibold text-foreground hover:text-amber-700 dark:hover:text-amber-400 transition-colors block truncate">
                    {ep.recommendedBy}
                  </Link>
                ) : (
                  <span className="text-[14px] font-semibold text-foreground block truncate">{ep.recommendedBy}</span>
                )}
                <span className={`text-[12px] font-medium px-1.5 py-0.5 rounded-full ${roleColor} inline-block`}>
                  {roleLabel}
                </span>
              </div>
            </>
          )}
        </div>
        <Link
          href={`/podcasts/${ep.podcastSlug}/${ep.episodeSlug}`}
          className="text-[14px] text-muted-foreground hover:text-amber-700 dark:hover:text-amber-400 transition-colors shrink-0 flex items-center gap-1 group"
          aria-label={`Listen on ${ep.podcastName}`}
          data-testid={`recommendation-episode-${index}`}
        >
          <span className="truncate max-w-[120px] sm:max-w-[140px]">{ep.podcastName}</span>
          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </motion.div>
  );
}

interface PodcastGroup {
  podcastSlug: string;
  podcastName: string;
  episodes: BookEpisode[];
}

function ConversationsList({ episodes }: { episodes: BookEpisode[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, PodcastGroup>();
    for (const ep of episodes) {
      if (!map.has(ep.podcastSlug)) {
        map.set(ep.podcastSlug, { podcastSlug: ep.podcastSlug, podcastName: ep.podcastName, episodes: [] });
      }
      map.get(ep.podcastSlug)!.episodes.push(ep);
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => b.episodes.length - a.episodes.length);
    return arr;
  }, [episodes]);

  const [expandedPodcasts, setExpandedPodcasts] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const visibleGroups = showAll ? groups : groups.slice(0, 8);

  const togglePodcast = (slug: string) => {
    setExpandedPodcasts(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {visibleGroups.map((group, gi) => {
        const isMulti = group.episodes.length > 1;
        const isExpanded = expandedPodcasts.has(group.podcastSlug);
        const displayEps = isMulti && !isExpanded ? [group.episodes[0]] : group.episodes;

        return (
          <div key={group.podcastSlug} className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-xl overflow-hidden" data-testid={`podcast-group-${gi}`}>
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <Link href={`/podcasts/${group.podcastSlug}`} className="text-[14px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider hover:underline underline-offset-2" data-testid={`podcast-link-${gi}`}>
                {group.podcastName}
              </Link>
              {isMulti && (
                <button
                  onClick={() => togglePodcast(group.podcastSlug)}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? "Collapse" : "Expand"} ${group.episodes.length} episodes from ${group.podcastName}`}
                  className="flex items-center gap-1 text-[14px] text-muted-foreground hover:text-foreground transition-colors"
                  data-testid={`toggle-group-${gi}`}
                >
                  {group.episodes.length} episodes
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>

            {displayEps.map((ep, ei) => (
              <Link
                key={`${ep.episodeSlug}-${ei}`}
                href={`/podcasts/${ep.podcastSlug}/${ep.episodeSlug}`}
                className="block group"
                data-testid={`episode-card-${gi}-${ei}`}
              >
                <div className="px-4 py-3 hover:bg-amber-500/[0.03] transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[15px] font-bold text-foreground leading-snug group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors line-clamp-2">
                        {ep.episodeTitle}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        {ep.recommendedBy && (
                          <span className={`inline-flex items-center gap-1 text-[14px] font-medium px-2 py-0.5 rounded-full ${
                            ep.recommenderRole === "author"
                              ? "bg-violet-500/[0.08] text-violet-700 dark:text-violet-400"
                              : ep.recommenderRole === "guest"
                              ? "bg-blue-500/[0.08] text-blue-700 dark:text-blue-400"
                              : "bg-amber-500/[0.08] text-amber-700 dark:text-amber-400"
                          }`} data-testid={`recommender-${gi}-${ei}`}>
                            {ep.recommenderRole === "author" ? "Author appearance" :
                             ep.recommenderRole === "guest" ? `Guest: ${ep.recommendedBy}` :
                             `Host: ${ep.recommendedBy}`}
                          </span>
                        )}
                        {ep.publishedAt && (
                          <span className="text-[14px] text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(ep.publishedAt)}
                          </span>
                        )}
                      </div>
                      {ep.context && (
                        <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed mt-2 line-clamp-2">
                          {ep.context}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-amber-500 transition-colors shrink-0 mt-1" />
                  </div>
                </div>
              </Link>
            ))}

            {isMulti && !isExpanded && (
              <button
                onClick={() => togglePodcast(group.podcastSlug)}
                className="w-full px-4 py-2 text-[14px] text-amber-700 dark:text-amber-400 font-medium hover:bg-amber-500/[0.04] transition-colors border-t border-black/[0.04] dark:border-white/[0.04]"
                data-testid={`show-more-${gi}`}
              >
                Show {group.episodes.length - 1} more from {group.podcastName}
              </button>
            )}
          </div>
        );
      })}

      {groups.length > 8 && !showAll && (
        <div className="flex justify-center mt-4">
          <button
            onClick={() => setShowAll(true)}
            className="px-6 py-2.5 bg-amber-500/[0.08] hover:bg-amber-500/[0.14] text-amber-700 dark:text-amber-400 font-semibold text-[15px] rounded-xl transition-colors border border-amber-500/10"
            data-testid="button-show-all-groups"
          >
            Show all {groups.length} podcasts
          </button>
        </div>
      )}
    </div>
  );
}

export default function BookDetailPage() {
  const [, params] = useRoute("/bookstore/:bookSlug");
  const bookSlug = params?.bookSlug;
  const { data: book, isLoading, error } = useQuery<BookDetail>({
    queryKey: ["/api/bookstore", bookSlug],
    enabled: !!bookSlug,
  });

  const [showStickyBar, setShowStickyBar] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      setShowStickyBar(window.scrollY > 400);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const recommenders = useMemo(() => {
    if (!book) return [];
    const map = new Map<string, { name: string; role: "host" | "guest" | "author"; count: number }>();
    for (const ep of book.episodes) {
      if (ep.recommendedBy && ep.recommenderRole) {
        const key = ep.recommendedBy.toLowerCase();
        const existing = map.get(key);
        if (existing) {
          existing.count++;
        } else {
          map.set(key, { name: ep.recommendedBy, role: ep.recommenderRole, count: 1 });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [book]);

  const hasAuthorAppearance = recommenders.some(r => r.role === "author");
  const hostRecommenders = recommenders.filter(r => r.role === "host");
  const guestRecommenders = recommenders.filter(r => r.role === "guest");

  const podcastArtworkMap = useMemo(() => {
    const map = new Map<string, { slug: string; name: string; artworkUrl: string }>();
    for (const p of PODCAST_LANDINGS) {
      map.set(p.slug, { slug: p.slug, name: p.name, artworkUrl: p.artworkUrl });
    }
    return map;
  }, []);

  const featuredPodcasts = useMemo(() => {
    if (!book) return [];
    const seen = new Set<string>();
    const result: { slug: string; name: string; artworkUrl: string }[] = [];
    for (const ep of book.episodes) {
      if (seen.has(ep.podcastSlug)) continue;
      seen.add(ep.podcastSlug);
      const info = podcastArtworkMap.get(ep.podcastSlug);
      if (info) result.push(info);
    }
    return result.slice(0, 6);
  }, [book, podcastArtworkMap]);

  const peopleMap = useMemo(() => {
    const map = new Map<string, { slug: string; name: string; imageUrl: string }>();
    for (const p of PEOPLE_DIRECTORY) {
      map.set(p.name.toLowerCase(), { slug: p.slug, name: p.name, imageUrl: p.imageUrl });
    }
    return map;
  }, []);

  const allEpsWithContext = useMemo(() => {
    if (!book) return [];
    return book.episodes
      .filter(ep => ep.context && ep.context.length > 20 && ep.recommendedBy)
      .sort((a, b) => (b.context?.length || 0) - (a.context?.length || 0));
  }, [book]);

  const [showAllQuotes, setShowAllQuotes] = useState(false);
  const visibleQuotes = showAllQuotes ? allEpsWithContext : allEpsWithContext.slice(0, 3);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SiteHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SiteHeader />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <BookOpen className="w-12 h-12 text-muted-foreground/30" />
          <h1 className="text-xl font-bold text-foreground">Book not found</h1>
          <Link href="/bookstore" className="text-primary hover:text-primary/80 font-medium">Back to Bookstore</Link>
        </div>
        <Footer />
      </div>
    );
  }

  const metaItems: { label: string; value: string }[] = [];
  if (book.rating) metaItems.push({ label: "Rating", value: `${book.rating.toFixed(1)}${book.ratingCount ? ` (${book.ratingCount.toLocaleString()})` : ""}` });
  if (book.pageCount) metaItems.push({ label: "Pages", value: String(book.pageCount) });
  if (book.publishYear) metaItems.push({ label: "Published", value: String(book.publishYear) });
  if (book.firstMentioned) metaItems.push({ label: "First mentioned", value: formatDate(book.firstMentioned) });
  if (book.lastMentioned && book.lastMentioned !== book.firstMentioned) metaItems.push({ label: "Last mentioned", value: formatDate(book.lastMentioned) });

  return (
    <div className="min-h-screen flex flex-col bg-background overflow-x-clip">
      <SEOHead book={book} />
      <SiteHeader />

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-20">
        <div className="w-full max-w-5xl">
          <Link href="/bookstore" className="inline-flex items-center gap-1.5 text-[14px] text-muted-foreground hover:text-foreground transition-colors mb-8" data-testid="link-back-bookstore">
            <ArrowLeft className="w-4 h-4" />
            Bookstore
          </Link>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start"
            data-testid="section-hero"
          >
            <BookCover title={book.name} asin={book.asin} slug={book.slug} googleBooksId={book.googleBooksId} isbn={book.isbn} hasCover={book.hasCover} size="xl" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[12px] font-bold uppercase tracking-[0.15em] text-amber-700 dark:text-amber-400">Podcast Intelligence</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight leading-tight" data-testid="heading-book-title">
                {book.name}
              </h1>
              {book.author && (
                <p className="text-lg text-muted-foreground mt-1" data-testid="text-book-author">
                  by <AuthorWithLinks author={book.author} />
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 mt-4">
                <div className="inline-flex items-center gap-2 px-3.5 py-2 bg-amber-500/[0.06] border border-amber-500/[0.12] rounded-xl">
                  <Mic className="w-4 h-4 text-amber-600" />
                  <div className="flex flex-col">
                    <span className="text-[18px] font-bold text-amber-700 dark:text-amber-400 leading-tight" data-testid="stat-mentions">{book.mentionCount}</span>
                    <span className="text-[12px] text-muted-foreground font-medium uppercase tracking-wider">Mentions</span>
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 px-3.5 py-2 bg-amber-500/[0.06] border border-amber-500/[0.12] rounded-xl">
                  <MessageCircle className="w-4 h-4 text-amber-600" />
                  <div className="flex flex-col">
                    <span className="text-[18px] font-bold text-amber-700 dark:text-amber-400 leading-tight" data-testid="stat-podcasts">{book.podcastCount}</span>
                    <span className="text-[12px] text-muted-foreground font-medium uppercase tracking-wider">Podcasts</span>
                  </div>
                </div>
                {book.podcastScore && (
                  <div className="inline-flex items-center gap-2 px-3.5 py-2 bg-amber-500/[0.06] border border-amber-500/[0.12] rounded-xl" data-testid="badge-podcast-score" title="Based on mention frequency, podcast diversity, and repeat recommendations">
                    <TrendingUp className="w-4 h-4 text-amber-600" />
                    <div className="flex flex-col">
                      <span className="text-[18px] font-bold text-amber-700 dark:text-amber-400 leading-tight">{book.podcastScore.toFixed(1)}</span>
                      <span className="text-[12px] text-muted-foreground font-medium uppercase tracking-wider">Score</span>
                    </div>
                  </div>
                )}
                {book.rating && (
                  <div className="inline-flex items-center gap-1.5 text-[14px] text-muted-foreground">
                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    <span className="font-semibold text-foreground" data-testid="stat-rating">{book.rating.toFixed(1)}</span>
                    {book.ratingCount && <span className="text-[14px]">({book.ratingCount.toLocaleString()})</span>}
                  </div>
                )}
              </div>

              {book.topics.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {book.topics.map(t => (
                    <Link
                      key={t}
                      href="/bookstore"
                      className="text-[14px] font-medium text-muted-foreground bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] px-2.5 py-1 rounded-full transition-colors"
                      data-testid={`topic-${t.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {t}
                    </Link>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 mt-5">
                {book.amazonUrl && (
                  <a
                    href={book.amazonUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#FF9900] hover:bg-[#E88B00] text-black font-semibold text-[15px] rounded-xl transition-colors shadow-sm"
                    data-testid="button-amazon"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Buy on Amazon
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {book.blinkistUrl && (
                  <a
                    href={book.blinkistUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#09090B] hover:bg-[#09090B]/90 text-white font-semibold text-[15px] rounded-xl transition-colors shadow-sm"
                    data-testid="button-blinkist"
                  >
                    <FileText className="w-4 h-4" />
                    Summary on Blinkist
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <ShareButton book={book} />
              </div>
            </div>
          </motion.section>

          {featuredPodcasts.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.08 }}
              className="mt-8"
              data-testid="section-featured-podcasts"
            >
              <p className="text-[14px] font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                Heard on
              </p>
              <div className="flex flex-wrap gap-2.5">
                {featuredPodcasts.map((p) => (
                  <Link
                    key={p.slug}
                    href={`/podcasts/${p.slug}`}
                    className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-xl hover:bg-amber-500/[0.04] hover:border-amber-500/15 transition-all group"
                    data-testid={`featured-podcast-${p.slug}`}
                  >
                    <img
                      src={p.artworkUrl}
                      alt={p.name}
                      className="w-7 h-7 rounded-lg object-cover shrink-0 shadow-sm"
                    />
                    <span className="text-[14px] font-semibold text-foreground group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">
                      {p.name}
                    </span>
                  </Link>
                ))}
                {book.podcastCount > featuredPodcasts.length && (
                  <span className="flex items-center px-3 py-2 text-[14px] text-muted-foreground">
                    +{book.podcastCount - featuredPodcasts.length} more
                  </span>
                )}
              </div>
            </motion.section>
          )}

          {book.podcastBuzz && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="mt-10"
              data-testid="section-the-signal"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/[0.08] flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-amber-600" />
                </div>
                <h2 className="text-lg font-bold text-foreground" data-testid="heading-the-signal">Why This Book Keeps Coming Up</h2>
              </div>
              <div className="pl-5 border-l-[3px] border-amber-500/30">
                <p className="text-[15px] sm:text-[16px] text-foreground leading-relaxed" data-testid="text-podcast-buzz">
                  {book.podcastBuzz}
                </p>
              </div>
            </motion.section>
          )}

          {allEpsWithContext.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="mt-10"
              data-testid="section-what-they-say"
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-amber-500/[0.08] flex items-center justify-center">
                  <Quote className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground" data-testid="heading-what-they-say">What People Say About It</h2>
                  <p className="text-[14px] text-muted-foreground">Real recommendations from podcast conversations</p>
                </div>
              </div>
              <div className="space-y-3">
                {visibleQuotes.map((ep, i) => (
                  <RecommendationCard key={`${ep.episodeSlug}-${i}`} ep={ep} index={i} peopleMap={peopleMap} />
                ))}
              </div>
              {allEpsWithContext.length > 3 && !showAllQuotes && (
                <button
                  onClick={() => setShowAllQuotes(true)}
                  className="mt-4 w-full py-3 text-[15px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/[0.04] hover:bg-amber-500/[0.08] rounded-xl border border-amber-500/10 transition-colors"
                  data-testid="button-show-all-quotes"
                >
                  See all {allEpsWithContext.length} recommendations
                </button>
              )}
            </motion.section>
          )}

          {recommenders.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.18 }}
              className="mt-10"
              data-testid="section-who-recommends"
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-amber-500/[0.08] flex items-center justify-center">
                  <User className="w-4 h-4 text-amber-600" />
                </div>
                <h2 className="text-lg font-bold text-foreground" data-testid="heading-who-recommends">Who Recommends It</h2>
              </div>
              {hasAuthorAppearance && (
                <div className="flex items-center gap-2 mb-3 px-4 py-2.5 bg-violet-500/[0.04] border border-violet-500/[0.12] rounded-xl" data-testid="author-appearance-note">
                  <User className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
                  <span className="text-[14px] text-muted-foreground">
                    <span className="font-semibold text-violet-700 dark:text-violet-400">{book.author}</span> appeared as a guest to discuss this book
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-2.5">
                {[...hostRecommenders.slice(0, 8), ...guestRecommenders.slice(0, 6)].map(r => {
                  const person = peopleMap.get(r.name.toLowerCase());
                  const roleColor = r.role === "guest"
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-amber-600 dark:text-amber-400";
                  const content = (
                    <div className="flex items-center gap-2.5 px-3 py-2 bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-xl hover:bg-amber-500/[0.04] hover:border-amber-500/15 transition-all group">
                      {person ? (
                        <img
                          src={person.imageUrl}
                          alt={r.name}
                          className="w-8 h-8 rounded-full object-cover shrink-0 shadow-sm border border-black/[0.06]"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex flex-col">
                        <span className="text-[14px] font-semibold text-foreground group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors leading-tight">{r.name}</span>
                        <span className={`text-[12px] font-medium ${roleColor} leading-tight`}>
                          {r.role === "guest" ? "Guest" : "Host"}
                          {r.count >= 2 && ` · mentioned ${r.count}x`}
                        </span>
                      </div>
                    </div>
                  );

                  return person ? (
                    <Link key={r.name} href={`/people/${person.slug}`} className="block" data-testid={`recommender-${r.name.toLowerCase().replace(/\s+/g, '-')}`}>
                      {content}
                    </Link>
                  ) : (
                    <div key={r.name} data-testid={`recommender-${r.name.toLowerCase().replace(/\s+/g, '-')}`}>
                      {content}
                    </div>
                  );
                })}
              </div>
            </motion.section>
          )}

          {(book.description || metaItems.length > 0) && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="mt-10"
              data-testid="section-about"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                </div>
                <h2 className="text-lg font-bold text-foreground" data-testid="heading-about">About the Book</h2>
              </div>
              {book.description && (
                <p className="text-[15px] text-muted-foreground leading-relaxed pl-[42px]" data-testid="text-description">
                  {book.description}
                </p>
              )}
              {metaItems.length > 0 && (
                <div className={`flex flex-wrap gap-x-5 gap-y-1.5 ${book.description ? "mt-3" : "mt-0"} pl-[42px] text-[14px] text-muted-foreground`}>
                  {metaItems.map(item => (
                    <span key={item.label}>
                      <span className="font-medium text-[#52525B] dark:text-[#A1A1AA]">{item.label}:</span> {item.value}
                    </span>
                  ))}
                </div>
              )}
            </motion.section>
          )}

          {book.episodes.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.22 }}
              className="mt-10"
              data-testid="section-episodes"
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-amber-500/[0.08] flex items-center justify-center">
                  <Mic className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground" data-testid="heading-episodes">The Conversations</h2>
                  <p className="text-[14px] text-muted-foreground">Every podcast episode where this book was discussed</p>
                </div>
              </div>
              <ConversationsList episodes={book.episodes} />
            </motion.section>
          )}

          {book.relatedBooks.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25 }}
              className="mt-12"
              data-testid="section-related"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/[0.08] flex items-center justify-center">
                    <Hash className="w-4 h-4 text-amber-600" />
                  </div>
                  <h2 className="text-lg font-bold text-foreground" data-testid="heading-related">Frequently Recommended Together</h2>
                </div>
                {book.topics.length > 0 && (
                  <Link
                    href="/bookstore"
                    className="text-[14px] font-semibold text-amber-700 dark:text-amber-400 hover:underline underline-offset-2 hidden sm:block"
                    data-testid="link-browse-topic"
                  >
                    Browse all {book.topics[0]} books
                  </Link>
                )}
              </div>
              <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                {book.relatedBooks.map((rb) => (
                  <Link
                    key={rb.slug}
                    href={`/bookstore/${rb.slug}`}
                    className="block group shrink-0 w-[130px]"
                    data-testid={`related-book-${rb.slug}`}
                  >
                    <div className="flex justify-center mb-2">
                      <SmallBookCover title={rb.name} asin={rb.asin} slug={rb.slug} googleBooksId={rb.googleBooksId} isbn={rb.isbn} hasCover={rb.hasCover} />
                    </div>
                    <p className="text-[14px] font-semibold text-foreground leading-snug group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors line-clamp-2 text-center">
                      {rb.name}
                    </p>
                    {rb.author && (
                      <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1 text-center">
                        {rb.author}
                      </p>
                    )}
                    <p className="text-[12px] text-amber-600 dark:text-amber-400 font-medium mt-1 text-center">
                      {rb.mentionCount > 1 ? `Mentioned ${rb.mentionCount}x together` : "Mentioned together"}
                    </p>
                  </Link>
                ))}
              </div>
            </motion.section>
          )}

          {(book.amazonUrl || book.blinkistUrl) && (
            <div className="mt-12 pt-6 border-t border-black/[0.06] dark:border-white/[0.06] flex flex-wrap items-center justify-center gap-3">
              {book.amazonUrl && (
                <a
                  href={book.amazonUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-8 py-3.5 bg-[#FF9900] hover:bg-[#E88B00] text-black font-semibold text-[15px] rounded-xl transition-colors shadow-sm"
                  data-testid="button-amazon-bottom"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Buy on Amazon
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              {book.blinkistUrl && (
                <a
                  href={book.blinkistUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-8 py-3.5 bg-[#09090B] hover:bg-[#09090B]/90 text-white font-semibold text-[15px] rounded-xl transition-colors shadow-sm"
                  data-testid="button-blinkist-bottom"
                >
                  <FileText className="w-4 h-4" />
                  Summary on Blinkist
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}
        </div>
      </main>

      {book?.amazonUrl && showStickyBar && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50 }} className="bg-background/95 backdrop-blur-sm border-t border-black/[0.08] dark:border-white/[0.08] px-4 py-3" data-testid="sticky-buy-bar">
          <div className="max-w-2xl mx-auto flex gap-2">
            <a
              href={book.amazonUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center justify-center gap-2 ${book.blinkistUrl ? 'flex-1' : 'w-full'} py-3.5 bg-[#FF9900] hover:bg-[#E88B00] text-black font-semibold text-[15px] rounded-xl transition-colors shadow-sm`}
              data-testid="button-amazon-sticky"
            >
              <ShoppingCart className="w-4 h-4" />
              Buy on Amazon
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            {book.blinkistUrl && (
              <a
                href={book.blinkistUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 flex-1 py-3.5 bg-[#09090B] hover:bg-[#09090B]/90 text-white font-semibold text-[15px] rounded-xl transition-colors shadow-sm"
                data-testid="button-blinkist-sticky"
              >
                <FileText className="w-4 h-4" />
                Blinkist
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
