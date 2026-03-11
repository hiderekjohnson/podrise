import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { BookOpen, Search, ExternalLink, Mic, ChevronDown, X } from "lucide-react";
import { Footer } from "@/components/Footer";
import { PodCapWordmark } from "@/components/PodCapHeader";
import { useAuth } from "@/hooks/use-auth";
import { Zap } from "lucide-react";

const AMAZON_AFFILIATE_TAG = "podcap-20";

interface BookstoreBook {
  name: string;
  author: string | null;
  description: string;
  url: string;
  context: string[];
  podcastCount: number;
  podcastSlugs: string[];
  episodes: { podcastSlug: string; episodeSlug: string; episodeTitle: string }[];
  mentionCount: number;
}

interface BookstoreData {
  books: BookstoreBook[];
  total: number;
}

function extractAsin(url: string): string | null {
  const patterns = [
    /\/dp\/([A-Za-z0-9]{10})/,
    /\/gp\/product\/([A-Za-z0-9]{10})/,
    /\/product\/([A-Za-z0-9]{10})/,
    /amazon\.com\/([A-Z0-9]{10})(?:[/?]|$)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

function getAmazonUrl(book: BookstoreBook): string {
  const asin = extractAsin(book.url || "");
  if (asin) return `https://www.amazon.com/dp/${asin}?tag=${AMAZON_AFFILIATE_TAG}`;
  const searchQuery = encodeURIComponent(`${book.name}${book.author ? ` ${book.author}` : ""}`);
  return `https://www.amazon.com/s?k=${searchQuery}&tag=${AMAZON_AFFILIATE_TAG}`;
}

function BookCover({ title, asin, author, size = "md" }: { title: string; asin: string | null; author?: string | null; size?: "sm" | "md" | "lg" }) {
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

  const sizeClasses = {
    sm: "w-12 h-[72px]",
    md: "w-[88px] h-[132px]",
    lg: "w-28 h-[168px]",
  };

  const placeholder = (
    <div className={`${sizeClasses[size]} rounded-lg bg-amber-500/[0.06] flex items-center justify-center shrink-0 border border-amber-500/10`}>
      <BookOpen className="w-5 h-5 text-amber-500/40" />
    </div>
  );

  if (asin && !failed) {
    return (
      <img
        src={`https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SX200_.jpg`}
        alt={title}
        className={`${sizeClasses[size]} rounded-lg object-cover shrink-0 shadow-md border border-black/[0.06] dark:border-white/[0.08]`}
        onError={() => setFailed(true)}
        loading="lazy"
      />
    );
  }

  if (olSrc && !olFailed) {
    return (
      <img
        src={olSrc}
        alt={title}
        className={`${sizeClasses[size]} rounded-lg object-cover shrink-0 shadow-md border border-black/[0.06] dark:border-white/[0.08]`}
        onError={() => setOlFailed(true)}
        loading="lazy"
      />
    );
  }

  return placeholder;
}

const SORT_OPTIONS = [
  { value: "mentions", label: "Most Mentioned" },
  { value: "podcasts", label: "Most Podcasts" },
  { value: "alpha", label: "A to Z" },
] as const;

type SortOption = typeof SORT_OPTIONS[number]["value"];

const PAGE_SIZE = 36;

function SEOHead() {
  const title = "Podcast Bookstore | Books Recommended on Top Podcasts | PodCap";
  const description = "Discover books recommended and discussed across the top podcasts. Ranked by how often they're mentioned, with direct links to episodes where they're discussed.";

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
    setOrCreate("property", "og:url", "https://podcap.io/podcasts/bookstore");
    setOrCreate("property", "og:type", "website");
    setOrCreate("name", "twitter:card", "summary");

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.href = "https://podcap.io/podcasts/bookstore";
  }
  return null;
}

function BookCard({ book, index }: { book: BookstoreBook; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const asin = extractAsin(book.url || "");
  const amazonUrl = getAmazonUrl(book);
  const bestContext = book.context[0] || book.description || "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.02, 0.3) }}
      className="group bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200"
      data-testid={`book-card-${index}`}
    >
      <div className="p-5">
        <div className="flex gap-4">
          <a href={amazonUrl} target="_blank" rel="sponsored noopener noreferrer" className="shrink-0" data-testid={`book-cover-link-${index}`}>
            <BookCover title={book.name} asin={asin} author={book.author} size="md" />
          </a>
          <div className="flex-1 min-w-0">
            <a
              href={amazonUrl}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className="block group/title"
              data-testid={`book-title-link-${index}`}
            >
              <h3 className="text-[15px] font-bold text-foreground leading-snug group-hover/title:text-amber-700 dark:group-hover/title:text-amber-400 transition-colors" data-testid={`book-title-${index}`}>
                {book.name}
              </h3>
            </a>
            {book.author && book.author !== "null" && (
              <p className="text-sm text-muted-foreground mt-0.5" data-testid={`book-author-${index}`}>
                by {book.author}
              </p>
            )}
            <div className="flex items-center gap-3 mt-2">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/[0.08] px-2 py-0.5 rounded-full" data-testid={`book-mentions-${index}`}>
                <Mic className="w-3 h-3" />
                {book.mentionCount} {book.mentionCount === 1 ? "mention" : "mentions"}
              </span>
              {book.podcastCount > 1 && (
                <span className="text-xs text-muted-foreground" data-testid={`book-podcasts-${index}`}>
                  {book.podcastCount} podcasts
                </span>
              )}
            </div>
            {bestContext && (
              <p className="text-sm text-muted-foreground leading-relaxed mt-2.5 line-clamp-2" data-testid={`book-context-${index}`}>
                {bestContext}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-black/[0.04] dark:border-white/[0.04]">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              {book.episodes.length > 0 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  data-testid={`book-toggle-episodes-${index}`}
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                  {book.episodes.length} {book.episodes.length === 1 ? "episode" : "episodes"}
                </button>
              )}
            </div>
            <a
              href={amazonUrl}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
              data-testid={`book-buy-${index}`}
            >
              Buy on Amazon
              <ExternalLink className="w-3 h-3 opacity-40" />
            </a>
          </div>

          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={{ duration: 0.2 }}
              className="mt-3 space-y-1.5"
            >
              {book.episodes.slice(0, 10).map((ep, i) => (
                <Link
                  key={`${ep.podcastSlug}-${ep.episodeSlug}-${i}`}
                  href={`/podcasts/${ep.podcastSlug}/${ep.episodeSlug}`}
                  className="block text-sm text-primary hover:text-primary/80 truncate transition-colors"
                  data-testid={`book-episode-link-${index}-${i}`}
                >
                  {ep.episodeTitle}
                </Link>
              ))}
              {book.episodes.length > 10 && (
                <p className="text-xs text-muted-foreground">and {book.episodes.length - 10} more...</p>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function Bookstore() {
  const { data: user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("mentions");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data, isLoading } = useQuery<BookstoreData>({
    queryKey: ["/api/bookstore"],
  });

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, sortBy]);

  const filteredBooks = useMemo(() => {
    if (!data?.books) return [];

    let result = [...data.books];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(b =>
        b.name.toLowerCase().includes(q) ||
        (b.author && b.author.toLowerCase().includes(q))
      );
    }

    if (sortBy === "podcasts") {
      result.sort((a, b) => b.podcastCount - a.podcastCount || b.mentionCount - a.mentionCount);
    } else if (sortBy === "alpha") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [data, searchQuery, sortBy]);

  const visibleBooks = filteredBooks.slice(0, visibleCount);
  const hasMore = visibleCount < filteredBooks.length;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead />
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
        <section className="w-full max-w-5xl pt-10 sm:pt-16 pb-8">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="flex flex-col items-center text-center gap-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/[0.08] flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-amber-600" />
              </div>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight leading-tight flex items-center gap-3 flex-wrap justify-center" data-testid="heading-bookstore">
              The Podcast Bookstore
              <span className="text-xs font-bold uppercase tracking-widest bg-amber-500/[0.12] text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full border border-amber-500/20">Beta</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed" data-testid="text-bookstore-subtitle">
              Every book recommended, discussed, and debated across the top podcasts. Ranked by how often they come up in conversation, not by sales data.
            </p>
            <p className="text-sm text-muted-foreground/70 max-w-xl" data-testid="text-beta-notice">
              This is a beta tool. We're actively improving it. <Link href="/contact" className="text-primary hover:text-primary/80 underline underline-offset-2 font-medium">Contact us</Link> with any feedback.
            </p>
          </motion.div>
        </section>

        <section className="w-full max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-8"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
              <input
                type="text"
                placeholder="Search by title or author..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-3 bg-white dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] rounded-xl text-[15px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                data-testid="input-search"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  data-testid="button-clear-search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSortBy(opt.value)}
                  className={`px-4 py-2.5 text-sm font-semibold rounded-xl whitespace-nowrap transition-colors ${
                    sortBy === opt.value
                      ? "bg-amber-500/[0.12] text-amber-700 dark:text-amber-400 border border-amber-500/20"
                      : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1] border border-transparent"
                  }`}
                  data-testid={`button-sort-${opt.value}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </motion.div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-5 animate-pulse">
                  <div className="flex gap-4">
                    <div className="w-[88px] h-[132px] rounded-lg bg-muted/30 shrink-0" />
                    <div className="flex-1 space-y-3">
                      <div className="h-4 bg-muted/30 rounded w-3/4" />
                      <div className="h-3 bg-muted/20 rounded w-1/2" />
                      <div className="h-3 bg-muted/20 rounded w-1/3" />
                      <div className="h-3 bg-muted/15 rounded w-full mt-2" />
                      <div className="h-3 bg-muted/15 rounded w-2/3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="text-center py-16">
              <BookOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-lg font-medium text-muted-foreground" data-testid="text-no-results">No books found</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Try adjusting your search</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground" data-testid="text-result-count">
                  {filteredBooks.length} {filteredBooks.length === 1 ? "book" : "books"}
                  {searchQuery && ` matching "${searchQuery}"`}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="grid-books">
                {visibleBooks.map((book, i) => (
                  <BookCard key={`${book.name}-${i}`} book={book} index={i} />
                ))}
              </div>

              {hasMore && (
                <div className="flex justify-center mt-8">
                  <button
                    onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                    className="px-8 py-3 bg-amber-500/[0.08] hover:bg-amber-500/[0.14] text-amber-700 dark:text-amber-400 font-semibold text-sm rounded-xl transition-colors border border-amber-500/10"
                    data-testid="button-load-more"
                  >
                    Show more books
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <div className="w-full max-w-5xl mt-12">
          <p className="text-xs text-muted-foreground/50 text-center" data-testid="text-affiliate-disclosure">
            Links to Amazon are affiliate links. PodCap may earn a small commission on purchases at no extra cost to you.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}