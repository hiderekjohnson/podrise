import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { motion } from "framer-motion";
import { BookOpen, ExternalLink, Mic, ArrowLeft, Calendar, ChevronRight } from "lucide-react";
import { Footer } from "@/components/Footer";
import { PodCapWordmark } from "@/components/PodCapHeader";
import { useAuth } from "@/hooks/use-auth";
import { Zap } from "lucide-react";

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
}

interface BookDetail {
  name: string;
  author: string | null;
  description: string | null;
  podcastBuzz: string | null;
  slug: string;
  asin: string | null;
  amazonUrl: string;
  mentionCount: number;
  podcastCount: number;
  podcastNames: string[];
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
  const title = `${book.name}${book.author ? ` by ${book.author}` : ""} - Mentioned on ${book.podcastCount} Podcasts | PodCap`;
  const description = `${book.name}${book.author ? ` by ${book.author}` : ""} has been mentioned ${book.mentionCount} times across ${book.podcastCount} podcasts. See what ${book.podcastNames.slice(0, 2).join(", ")}${book.podcastNames.length > 2 ? " and others" : ""} said about it.`;

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

export default function BookDetailPage() {
  const [, params] = useRoute("/bookstore/:bookSlug");
  const bookSlug = params?.bookSlug;
  const { data: user } = useAuth();
  const [showAllEpisodes, setShowAllEpisodes] = useState(false);

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

  const visibleEpisodes = showAllEpisodes ? book.episodes : book.episodes.slice(0, 10);

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

              <div className="flex flex-wrap items-center gap-3 mt-4">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/[0.08] px-3 py-1.5 rounded-full" data-testid="stat-mentions">
                  <Mic className="w-3.5 h-3.5" />
                  {book.mentionCount} {book.mentionCount === 1 ? "mention" : "mentions"}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground bg-black/[0.04] dark:bg-white/[0.06] px-3 py-1.5 rounded-full" data-testid="stat-podcasts">
                  {book.podcastCount} {book.podcastCount === 1 ? "podcast" : "podcasts"}
                </span>
              </div>

              <a
                href={book.amazonUrl}
                target="_blank"
                rel="sponsored noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm"
                data-testid="button-buy-amazon"
              >
                Buy on Amazon
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </motion.section>

          {book.description && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="mt-10"
              data-testid="section-about"
            >
              <h2 className="text-lg font-bold text-foreground mb-3" data-testid="heading-about">About This Book</h2>
              <p className="text-[15px] text-muted-foreground leading-relaxed" data-testid="text-description">
                {book.description}
              </p>
            </motion.section>
          )}

          {book.podcastBuzz && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="mt-8"
              data-testid="section-buzz"
            >
              <h2 className="text-lg font-bold text-foreground mb-3" data-testid="heading-buzz">What Podcasters Are Saying</h2>
              <div className="px-5 py-4 bg-amber-500/[0.04] border border-amber-500/[0.08] rounded-xl">
                <p className="text-[15px] text-amber-800 dark:text-amber-300/90 leading-relaxed">
                  <Mic className="w-4 h-4 inline-block mr-2 -mt-0.5 text-amber-600/60" />
                  {book.podcastBuzz}
                </p>
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
                Episodes Featuring {book.name}
              </h2>

              <div className="space-y-3">
                {visibleEpisodes.map((ep, i) => (
                  <Link
                    key={`${ep.podcastSlug}-${ep.episodeSlug}-${i}`}
                    href={`/podcasts/${ep.podcastSlug}/${ep.episodeSlug}`}
                    className="block group"
                    data-testid={`episode-card-${i}`}
                  >
                    <div className="p-4 bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-xl hover:shadow-sm hover:border-amber-500/20 transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1">
                            {ep.podcastName}
                          </p>
                          <h3 className="text-[15px] font-bold text-foreground leading-snug group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors line-clamp-2">
                            {ep.episodeTitle}
                          </h3>
                          {ep.publishedAt && (
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(ep.publishedAt)}
                            </p>
                          )}
                          {ep.context && (
                            <p className="text-sm text-muted-foreground/80 leading-relaxed mt-2 line-clamp-2">
                              "{ep.context}"
                            </p>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-amber-500 transition-colors shrink-0 mt-1" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {book.episodes.length > 10 && !showAllEpisodes && (
                <div className="flex justify-center mt-6">
                  <button
                    onClick={() => setShowAllEpisodes(true)}
                    className="px-6 py-2.5 bg-amber-500/[0.08] hover:bg-amber-500/[0.14] text-amber-700 dark:text-amber-400 font-semibold text-sm rounded-xl transition-colors border border-amber-500/10"
                    data-testid="button-show-all-episodes"
                  >
                    Show all {book.episodes.length} episodes
                  </button>
                </div>
              )}
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
              <h2 className="text-lg font-bold text-foreground mb-4" data-testid="heading-related">Listeners Also Read</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                {book.relatedBooks.map((rb) => (
                  <Link
                    key={rb.slug}
                    href={`/bookstore/${rb.slug}`}
                    className="block group text-center"
                    data-testid={`related-book-${rb.slug}`}
                  >
                    <div className="flex justify-center mb-2">
                      <SmallBookCover title={rb.name} asin={rb.asin} />
                    </div>
                    <p className="text-xs font-semibold text-foreground leading-snug group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors line-clamp-2">
                      {rb.name}
                    </p>
                    {rb.author && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                        {rb.author}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </motion.section>
          )}

          <div className="mt-12 pt-6 border-t border-black/[0.06] dark:border-white/[0.06] flex flex-col items-center gap-4">
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
            <p className="text-xs text-muted-foreground/50 text-center" data-testid="text-affiliate-disclosure">
              Links to Amazon are affiliate links. PodCap may earn a small commission on purchases at no extra cost to you.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}