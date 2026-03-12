import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { motion } from "framer-motion";
import { BookOpen, ExternalLink, Mic, ArrowLeft, Calendar, ChevronRight, ChevronDown, Star, Share2, Copy, Check, User, FileText } from "lucide-react";
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

function BookCover({ title, slug, size = "lg" }: { title: string; asin?: string | null; slug?: string | null; size?: "sm" | "md" | "lg" | "xl" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [slug]);
  const localUrl = slug ? `/books/${slug}.jpg` : null;

  const sizeClasses: Record<string, string> = {
    sm: "w-12 h-[72px]",
    md: "w-[88px] h-[132px]",
    lg: "w-28 h-[168px]",
    xl: "w-36 h-[216px] sm:w-44 sm:h-[264px]",
  };

  const imgCls = `${sizeClasses[size]} rounded-xl object-cover shrink-0 shadow-lg border border-black/[0.06] dark:border-white/[0.08]`;

  if (localUrl && !failed) {
    return <img src={localUrl} alt={title} className={imgCls} onError={() => setFailed(true)} />;
  }
  return (
    <div className={`${sizeClasses[size]} rounded-xl bg-amber-500/[0.06] flex items-center justify-center shrink-0 border border-amber-500/10`}>
      <BookOpen className="w-8 h-8 text-amber-500/40" />
    </div>
  );
}

function SmallBookCover({ title, slug }: { title: string; asin?: string | null; slug?: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [slug]);
  const localUrl = slug ? `/books/${slug}.jpg` : null;
  const cls = "w-16 h-24 rounded-lg object-cover shrink-0 shadow-md border border-black/[0.06] dark:border-white/[0.08]";

  if (localUrl && !failed) {
    return <img src={localUrl} alt={title} className={cls} onError={() => setFailed(true)} loading="lazy" />;
  }
  return (
    <div className="w-16 h-24 rounded-lg bg-amber-500/[0.06] flex items-center justify-center shrink-0 border border-amber-500/10">
      <BookOpen className="w-4 h-4 text-amber-500/40" />
    </div>
  );
}

function SEOHead({ book }: { book: BookDetail }) {
  const title = `${book.name}${book.author ? ` by ${book.author}` : ""} - Mentioned on ${book.podcastCount} ${book.podcastCount === 1 ? "Podcast" : "Podcasts"}, ${book.mentionCount} ${book.mentionCount === 1 ? "Time" : "Times"} | PodCap`;
  const description = `${book.name}${book.author ? ` by ${book.author}` : ""} has been mentioned ${book.mentionCount} times across ${book.podcastCount} podcasts including ${book.podcastNames.slice(0, 2).join(" and ")}${book.podcastNames.length > 2 ? " and more" : ""}. See every mention and what hosts said about it.`;

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

function PodcastScoreBadge({ score }: { score: number }) {
  const color = score >= 8 ? "text-green-600 dark:text-green-400 bg-green-500/[0.08] border-green-500/20" :
    score >= 5 ? "text-amber-600 dark:text-amber-400 bg-amber-500/[0.08] border-amber-500/20" :
    "text-muted-foreground bg-black/[0.04] border-black/[0.06]";

  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-bold ${color}`} data-testid="badge-podcast-score" title="Based on mention frequency, podcast diversity, and repeat recommendations">
      <Mic className="w-3.5 h-3.5" />
      {score.toFixed(1)} Podcast Score
    </div>
  );
}

function ShareButton({ book }: { book: BookDetail }) {
  const [copied, setCopied] = useState(false);
  const url = `https://podcap.io/bookstore/${book.slug}`;
  const tweetText = `${book.name}${book.author ? ` by ${book.author}` : ""} - mentioned on ${book.podcastCount} podcasts\n${url}`;

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
        {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
    </div>
  );
}

interface PodcastGroup {
  podcastSlug: string;
  podcastName: string;
  episodes: BookEpisode[];
}

function GroupedEpisodes({ episodes, bookName }: { episodes: BookEpisode[]; bookName: string }) {
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
              <Link href={`/podcasts/${group.podcastSlug}`} className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider hover:underline underline-offset-2" data-testid={`podcast-link-${gi}`}>
                {group.podcastName}
              </Link>
              {isMulti && (
                <button
                  onClick={() => togglePodcast(group.podcastSlug)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  data-testid={`toggle-group-${gi}`}
                >
                  {group.episodes.length} mentions
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
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
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
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(ep.publishedAt)}
                          </span>
                        )}
                      </div>
                      {ep.context && (
                        <p className="text-[15px] text-muted-foreground/80 leading-relaxed mt-2">
                          {ep.context.length > 150 ? ep.context.slice(0, 150).replace(/\s+\S*$/, "") + "." : ep.context}
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
                className="w-full px-4 py-2 text-xs text-amber-700 dark:text-amber-400 font-medium hover:bg-amber-500/[0.04] transition-colors border-t border-black/[0.04] dark:border-white/[0.04]"
                data-testid={`show-more-${gi}`}
              >
                Show {group.episodes.length - 1} more {group.episodes.length - 1 === 1 ? "episode" : "episodes"} from {group.podcastName}
              </button>
            )}
          </div>
        );
      })}

      {groups.length > 8 && !showAll && (
        <div className="flex justify-center mt-4">
          <button
            onClick={() => setShowAll(true)}
            className="px-6 py-2.5 bg-amber-500/[0.08] hover:bg-amber-500/[0.14] text-amber-700 dark:text-amber-400 font-semibold text-sm rounded-xl transition-colors border border-amber-500/10"
            data-testid="button-show-all-groups"
          >
            Show all podcasts
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

  const featuredQuote = book.episodes.find(e => e.context && e.context.length > 30);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead book={book} />
      <SiteHeader />

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-20">
        <div className="w-full max-w-6xl">
          <Link href="/bookstore" className="inline-flex items-center gap-1.5 text-[15px] text-muted-foreground hover:text-foreground transition-colors mb-8" data-testid="link-back-bookstore">
            <ArrowLeft className="w-4 h-4" />
            Back to Bookstore
          </Link>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col sm:flex-row gap-8 items-start"
            data-testid="section-hero"
          >
            <BookCover title={book.name} asin={book.asin} slug={book.slug} size="xl" />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight leading-tight" data-testid="heading-book-title">
                {book.name}
              </h1>
              {book.author && (
                <p className="text-lg text-muted-foreground mt-1" data-testid="text-book-author">
                  by <AuthorWithLinks author={book.author} />
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2.5 mt-4">
                {book.podcastScore && <PodcastScoreBadge score={book.podcastScore} />}
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/[0.08] px-3 py-1.5 rounded-full" data-testid="stat-mentions">
                  <Mic className="w-3.5 h-3.5" />
                  {book.mentionCount} {book.mentionCount === 1 ? "mention" : "mentions"}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground bg-black/[0.04] dark:bg-white/[0.06] px-3 py-1.5 rounded-full" data-testid="stat-podcasts">
                  {book.podcastCount} {book.podcastCount === 1 ? "podcast" : "podcasts"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 mt-3 text-[15px] text-muted-foreground">
                {book.rating && (
                  <span className="inline-flex items-center gap-1" data-testid="stat-rating">
                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    {book.rating.toFixed(1)}
                    {book.ratingCount && <span className="text-xs">({book.ratingCount.toLocaleString()} ratings)</span>}
                  </span>
                )}
                {book.pageCount && (
                  <span data-testid="stat-pages">{book.pageCount} pages</span>
                )}
                {book.publishYear && (
                  <span data-testid="stat-year">Published {book.publishYear}</span>
                )}
              </div>

              {book.topics.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {book.topics.map(t => (
                    <Link
                      key={t}
                      href={`/bookstore`}
                      className="text-xs font-medium text-muted-foreground bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] px-2.5 py-1 rounded-full transition-colors"
                      data-testid={`topic-${t.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {t}
                    </Link>
                  ))}
                </div>
              )}

              {(book.firstMentioned || book.lastMentioned) && (
                <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-muted-foreground/70">
                  {book.firstMentioned && (
                    <span data-testid="stat-first-mentioned">First mentioned {formatDate(book.firstMentioned)}</span>
                  )}
                  {book.lastMentioned && book.firstMentioned !== book.lastMentioned && (
                    <span data-testid="stat-last-mentioned">Last mentioned {formatDate(book.lastMentioned)}</span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 mt-5">
                {book.blinkistUrl && (
                  <a
                    href={book.blinkistUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm"
                    data-testid="button-blinkist"
                  >
                    <FileText className="w-4 h-4" />
                    Read Summary on Blinkist
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
              <p className="text-sm font-semibold text-muted-foreground mb-3">
                Featured on top podcasts like
              </p>
              <div className="flex flex-wrap gap-3">
                {featuredPodcasts.map((p) => (
                  <Link
                    key={p.slug}
                    href={`/podcasts/${p.slug}`}
                    className="flex items-center gap-2.5 px-3 py-2 bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-xl hover:bg-amber-500/[0.04] transition-colors group"
                    data-testid={`featured-podcast-${p.slug}`}
                  >
                    <img
                      src={p.artworkUrl}
                      alt={p.name}
                      className="w-8 h-8 rounded-lg object-cover shrink-0 shadow-sm"
                    />
                    <span className="text-sm font-semibold text-foreground group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">
                      {p.name}
                    </span>
                  </Link>
                ))}
                {book.podcastCount > featuredPodcasts.length && (
                  <span className="flex items-center px-3 py-2 text-[15px] text-muted-foreground">
                    +{book.podcastCount - featuredPodcasts.length} more
                  </span>
                )}
              </div>
            </motion.section>
          )}

          {featuredQuote && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="mt-8"
              data-testid="section-featured-quote"
            >
              <div className="px-6 py-5 bg-amber-500/[0.04] border-l-4 border-amber-500 rounded-r-xl">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2">How It Was Mentioned</p>
                <p className="text-[15px] text-foreground leading-relaxed" data-testid="text-featured-quote">
                  {featuredQuote.context}
                </p>
                <p className="mt-3 text-[15px] text-muted-foreground">
                  {featuredQuote.hosts && <span className="font-semibold text-foreground">{featuredQuote.hosts}</span>}
                  {featuredQuote.hosts && " on "}
                  <Link href={`/podcasts/${featuredQuote.podcastSlug}`} className="font-semibold text-amber-700 dark:text-amber-400 hover:underline underline-offset-2">
                    {featuredQuote.podcastName}
                  </Link>
                </p>
              </div>
            </motion.section>
          )}

          {book.description && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="mt-10"
              data-testid="section-about"
            >
              <h2 className="text-lg font-bold text-foreground mb-3" data-testid="heading-about">
                What Is {book.name} About
              </h2>
              <p className="text-[15px] text-muted-foreground leading-relaxed" data-testid="text-description">
                {book.description}
              </p>
            </motion.section>
          )}

          {recommenders.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.18 }}
              className="mt-8"
              data-testid="section-who-recommends"
            >
              <h2 className="text-lg font-bold text-foreground mb-3" data-testid="heading-who-recommends">Recommended By</h2>
              {hasAuthorAppearance && (
                <div className="flex items-center gap-2 mb-3 px-4 py-2.5 bg-violet-500/[0.04] border border-violet-500/[0.12] rounded-xl" data-testid="author-appearance-note">
                  <User className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
                  <span className="text-[15px] text-muted-foreground">
                    <span className="font-semibold text-violet-700 dark:text-violet-400">{book.author}</span> appeared as a guest to discuss this book
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                {[...hostRecommenders.slice(0, 8), ...guestRecommenders.slice(0, 6)].map(r => {
                  const person = peopleMap.get(r.name.toLowerCase());
                  const roleColor = r.role === "guest"
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-amber-600 dark:text-amber-400";
                  const content = (
                    <div className="flex items-center gap-2.5 px-3 py-2 bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-xl hover:bg-amber-500/[0.04] transition-colors group">
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
                        <span className="text-sm font-semibold text-foreground group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors leading-tight">{r.name}</span>
                        <span className={`text-[11px] font-medium ${roleColor} leading-tight`}>
                          {r.role === "guest" ? "Guest" : "Host"}
                          {r.count >= 2 && ` · ${r.count}x`}
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

          {book.episodes.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="mt-10"
              data-testid="section-episodes"
            >
              <h2 className="text-lg font-bold text-foreground mb-4" data-testid="heading-episodes">
                Podcast Mentions
              </h2>
              <GroupedEpisodes episodes={book.episodes} bookName={book.name} />
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
                <h2 className="text-lg font-bold text-foreground" data-testid="heading-related">Podcast Listeners Also Read</h2>
                {book.topics.length > 0 && (
                  <Link
                    href="/bookstore"
                    className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline underline-offset-2"
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
                      <SmallBookCover title={rb.name} asin={rb.asin} slug={rb.slug} />
                    </div>
                    <p className="text-xs font-semibold text-foreground leading-snug group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors line-clamp-2 text-center">
                      {rb.name}
                    </p>
                    {rb.author && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1 text-center">
                        {rb.author}
                      </p>
                    )}
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-1 text-center">
                      {rb.mentionCount > 1 ? `Mentioned ${rb.mentionCount}x together` : "Mentioned together"}
                    </p>
                  </Link>
                ))}
              </div>
            </motion.section>
          )}

          {book.blinkistUrl && (
            <div className="mt-12 pt-6 border-t border-black/[0.06] dark:border-white/[0.06] flex flex-col items-center gap-4">
              <a
                href={book.blinkistUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm"
                data-testid="button-blinkist-bottom"
              >
                <FileText className="w-4 h-4" />
                Read Summary on Blinkist
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      </main>

      {book?.blinkistUrl && (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-black/[0.08] dark:border-white/[0.08] px-4 py-3 z-50" data-testid="mobile-sticky-cta">
          <a
            href={book.blinkistUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm"
            data-testid="button-blinkist-sticky"
          >
            <FileText className="w-4 h-4" />
            Read Summary on Blinkist
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      <Footer />
    </div>
  );
}
