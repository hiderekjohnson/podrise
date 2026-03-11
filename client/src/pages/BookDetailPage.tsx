import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { motion } from "framer-motion";
import { BookOpen, ExternalLink, Mic, ArrowLeft, Calendar, ChevronRight, ChevronDown, Star, Share2, Copy, Check, Headphones } from "lucide-react";
import { SiX } from "react-icons/si";
import { Footer } from "@/components/Footer";
import { PodCapWordmark } from "@/components/PodCapHeader";
import { useAuth } from "@/hooks/use-auth";
import { Zap } from "lucide-react";

const AMAZON_AFFILIATE_TAG = "podcap-20";

interface BookEpisode {
  podcastSlug: string;
  podcastName: string;
  episodeSlug: string;
  episodeTitle: string;
  context: string;
  publishedAt: string | null;
  hosts: string | null;
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

function BookCover({ title, asin, size = "lg" }: { title: string; asin: string | null; size?: "sm" | "md" | "lg" | "xl" }) {
  const [failed, setFailed] = useState(false);
  const [olSrc, setOlSrc] = useState<string | null>(null);
  const [olFailed, setOlFailed] = useState(false);

  useEffect(() => {
    if (asin && !failed) return;
    if (olSrc || olFailed) return;
    const q = encodeURIComponent(title);
    fetch(`https://openlibrary.org/search.json?q=${q}&limit=1&fields=cover_i`)
      .then(r => r.json())
      .then(data => {
        const coverId = data?.docs?.[0]?.cover_i;
        if (coverId) setOlSrc(`https://covers.openlibrary.org/b/id/${coverId}-L.jpg`);
        else setOlFailed(true);
      })
      .catch(() => setOlFailed(true));
  }, [title, asin, failed, olSrc, olFailed]);

  const sizeClasses: Record<string, string> = {
    sm: "w-12 h-[72px]",
    md: "w-[88px] h-[132px]",
    lg: "w-28 h-[168px]",
    xl: "w-36 h-[216px] sm:w-44 sm:h-[264px]",
  };

  const placeholder = (
    <div className={`${sizeClasses[size]} rounded-xl bg-amber-500/[0.06] flex items-center justify-center shrink-0 border border-amber-500/10`}>
      <BookOpen className="w-8 h-8 text-amber-500/40" />
    </div>
  );

  if (asin && !failed) {
    return (
      <img
        src={`https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SX300_.jpg`}
        alt={title}
        className={`${sizeClasses[size]} rounded-xl object-cover shrink-0 shadow-lg border border-black/[0.06] dark:border-white/[0.08]`}
        onError={() => setFailed(true)}
      />
    );
  }

  if (olSrc && !olFailed) {
    return (
      <img
        src={olSrc}
        alt={title}
        className={`${sizeClasses[size]} rounded-xl object-cover shrink-0 shadow-lg border border-black/[0.06] dark:border-white/[0.08]`}
        onError={() => setOlFailed(true)}
      />
    );
  }

  return placeholder;
}

function SmallBookCover({ title, asin }: { title: string; asin: string | null }) {
  const [failed, setFailed] = useState(false);
  const [olSrc, setOlSrc] = useState<string | null>(null);
  const [olFailed, setOlFailed] = useState(false);

  useEffect(() => {
    if (asin && !failed) return;
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
  }, [title, asin, failed, olSrc, olFailed]);

  const cls = "w-16 h-24 rounded-lg object-cover shrink-0 shadow-md border border-black/[0.06] dark:border-white/[0.08]";

  if (asin && !failed) {
    return <img src={`https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SX200_.jpg`} alt={title} className={cls} onError={() => setFailed(true)} loading="lazy" />;
  }
  if (olSrc && !olFailed) {
    return <img src={olSrc} alt={title} className={cls} onError={() => setOlFailed(true)} loading="lazy" />;
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
  const bestQuote = book.episodes.find(e => e.context)?.context || "";
  const tweetText = bestQuote
    ? `"${bestQuote.slice(0, 200)}" - mentioned on ${book.podcastCount} podcasts\n\n${book.name}${book.author ? ` by ${book.author}` : ""}\n${url}`
    : `${book.name}${book.author ? ` by ${book.author}` : ""} - mentioned on ${book.podcastCount} podcasts\n${url}`;

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
                      <div className="flex items-center gap-3 mt-1">
                        {ep.publishedAt && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(ep.publishedAt)}
                          </span>
                        )}
                        {ep.hosts && (
                          <span className="text-xs text-muted-foreground">
                            {ep.hosts}
                          </span>
                        )}
                      </div>
                      {ep.context && (
                        <p className="text-sm text-muted-foreground/80 leading-relaxed mt-2 line-clamp-2 italic">
                          "{ep.context}"
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
  const { data: user } = useAuth();

  const { data: book, isLoading, error } = useQuery<BookDetail>({
    queryKey: ["/api/bookstore", bookSlug],
    enabled: !!bookSlug,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
          <a href="/" className="flex items-center" data-testid="link-home"><PodCapWordmark /></a>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
          <a href="/" className="flex items-center" data-testid="link-home"><PodCapWordmark /></a>
        </header>
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
  const topHostsWithMultiple = (book.topHosts || []).filter(h => h.count >= 2);
  const notableHosts = (book.topHosts || []).slice(0, 3);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead book={book} />
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center" data-testid="link-home">
          <PodCapWordmark />
        </a>
        <div className="flex items-center gap-4">
          {user ? (
            <a href="/dashboard" className="text-base font-medium text-primary hover:text-primary/80 transition-colors" data-testid="link-dashboard">Dashboard</a>
          ) : (
            <>
              <a href="/get-started" className="flex items-center gap-1.5 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-[15px] font-semibold text-primary tracking-wide uppercase hover:bg-primary/15 transition-colors" data-testid="link-nav-get-started">
                <Zap className="w-3.5 h-3.5" />
                Build Your Recap
              </a>
              <a href="/login" className="text-base font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-login">Log in</a>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-20">
        <div className="w-full max-w-4xl">
          <Link href="/bookstore" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8" data-testid="link-back-bookstore">
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
            <BookCover title={book.name} asin={book.asin} size="xl" />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight leading-tight" data-testid="heading-book-title">
                {book.name}
              </h1>
              {book.author && (
                <p className="text-lg text-muted-foreground mt-1" data-testid="text-book-author">
                  by {book.author}
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

              <div className="flex flex-wrap items-center gap-3 mt-3 text-sm text-muted-foreground">
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
                <a
                  href={book.amazonUrl}
                  target="_blank"
                  rel="sponsored noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm"
                  data-testid="button-buy-amazon"
                >
                  Buy on Amazon
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <a
                  href={book.audibleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3 bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] text-foreground font-semibold text-sm rounded-xl transition-colors border border-black/[0.06] dark:border-white/[0.08]"
                  data-testid="button-audible"
                >
                  <Headphones className="w-4 h-4" />
                  Listen on Audible
                </a>
                <ShareButton book={book} />
              </div>
            </div>
          </motion.section>

          {notableHosts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.08 }}
              className="mt-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
              data-testid="notable-hosts"
            >
              <span>Featured on</span>
              {notableHosts.map((h, i) => (
                <span key={h.name}>
                  <span className="font-semibold text-foreground">{h.name}</span>
                  {h.count >= 2 && <span className="text-xs text-amber-600 dark:text-amber-400 ml-1">({h.count}x)</span>}
                  {i < notableHosts.length - 1 && <span className="text-muted-foreground">, </span>}
                </span>
              ))}
              {book.podcastCount > 3 && (
                <span>and {book.podcastCount - 3} more {book.podcastCount - 3 === 1 ? "podcast" : "podcasts"}</span>
              )}
            </motion.div>
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
                <p className="text-lg font-medium text-foreground leading-relaxed italic" data-testid="text-featured-quote">
                  "{featuredQuote.context}"
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
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

          {topHostsWithMultiple.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.18 }}
              className="mt-8"
              data-testid="section-repeat-hosts"
            >
              <h2 className="text-lg font-bold text-foreground mb-3" data-testid="heading-repeat-hosts">Who Keeps Recommending It</h2>
              <div className="flex flex-wrap gap-3">
                {topHostsWithMultiple.map(h => (
                  <div key={h.name} className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-xl">
                    <span className="text-sm font-semibold text-foreground">{h.name}</span>
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/[0.1] px-2 py-0.5 rounded-full">
                      {h.count} mentions
                    </span>
                  </div>
                ))}
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
                <h2 className="text-lg font-bold text-foreground" data-testid="heading-related">Frequently Mentioned Alongside</h2>
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
                      <SmallBookCover title={rb.name} asin={rb.asin} />
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

          <div className="mt-12 pt-6 border-t border-black/[0.06] dark:border-white/[0.06] flex flex-col items-center gap-4">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href={book.amazonUrl}
                target="_blank"
                rel="sponsored noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm"
                data-testid="button-buy-amazon-bottom"
              >
                Buy {book.name} on Amazon
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a
                href={book.audibleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] text-foreground font-semibold text-sm rounded-xl transition-colors border border-black/[0.06] dark:border-white/[0.08]"
                data-testid="button-audible-bottom"
              >
                <Headphones className="w-4 h-4" />
                Listen on Audible
              </a>
            </div>
            <p className="text-xs text-muted-foreground/50 text-center" data-testid="text-affiliate-disclosure">
              Links to Amazon are affiliate links. PodCap may earn a small commission on purchases at no extra cost to you.
            </p>
          </div>
        </div>
      </main>

      <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-black/[0.08] dark:border-white/[0.08] px-4 py-3 z-50" data-testid="mobile-sticky-cta">
        <a
          href={book?.amazonUrl}
          target="_blank"
          rel="sponsored noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm"
          data-testid="button-buy-amazon-sticky"
        >
          Buy on Amazon
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <Footer />
    </div>
  );
}
