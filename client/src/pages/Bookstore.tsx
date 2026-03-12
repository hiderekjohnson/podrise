import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { BookOpen, Search, ExternalLink, Mic, X, Star, Clock, TrendingUp, Sparkles, ChevronRight, Feather, Users } from "lucide-react";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { PEOPLE_DIRECTORY } from "@/data/entityDirectoryData";

interface BookstoreBook {
  name: string;
  author: string | null;
  description: string;
  podcastBuzz: string | null;
  amazonUrl: string;
  asin: string | null;
  slug: string | null;
  googleBooksId: string | null;
  topics: string[];
  pageCount: number | null;
  publishYear: number | null;
  rating: number | null;
  ratingCount: number | null;
  podcastCount: number;
  podcastNames: string[];
  mentionCount: number;
}

interface BookstoreData {
  books: BookstoreBook[];
  total: number;
}

function BookCover({ title, slug, googleBooksId, size = "md" }: { title: string; asin?: string | null; slug?: string | null; googleBooksId?: string | null; size?: "sm" | "md" | "lg" }) {
  const [srcIndex, setSrcIndex] = useState(0);
  useEffect(() => { setSrcIndex(0); }, [slug, googleBooksId]);
  const sources: string[] = [];
  if (slug) sources.push(`/books/${slug}.jpg`);
  if (googleBooksId) sources.push(`https://books.google.com/books/content?id=${googleBooksId}&printsec=frontcover&img=1&zoom=1&source=gbs_api`);

  const sizeClasses = {
    sm: "w-12 h-[72px]",
    md: "w-[88px] h-[132px]",
    lg: "w-28 h-[168px]",
  };

  const advance = () => setSrcIndex(s => s + 1);
  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth < 150 && img.naturalHeight < 220) advance();
  };

  const imgCls = `${sizeClasses[size]} rounded-lg object-cover shrink-0 shadow-md border border-black/[0.06] dark:border-white/[0.08]`;

  if (srcIndex < sources.length) {
    return <img src={sources[srcIndex]} alt={title} className={imgCls} onError={advance} onLoad={handleLoad} loading="lazy" />;
  }
  return (
    <div className={`${sizeClasses[size]} rounded-lg bg-amber-500/[0.06] flex items-center justify-center shrink-0 border border-amber-500/10`}>
      <BookOpen className="w-5 h-5 text-amber-500/40" />
    </div>
  );
}

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

const SORT_OPTIONS = [
  { value: "mentions", label: "Most Mentioned" },
  { value: "podcasts", label: "Most Podcasts" },
  { value: "rating", label: "Highest Rated" },
  { value: "newest", label: "Newest" },
  { value: "shortest", label: "Quick Reads" },
  { value: "alpha", label: "A to Z" },
] as const;

type SortOption = typeof SORT_OPTIONS[number]["value"];

const TOPIC_FILTERS = [
  "AI & Technology",
  "Business & Strategy",
  "Investing & Finance",
  "Leadership & Management",
  "Psychology & Mindset",
  "Self-Improvement",
  "Health & Wellness",
  "History & Society",
  "Science",
  "Creativity & Writing",
  "Career & Work",
  "Education",
  "Relationships & Family",
];

const LENGTH_FILTERS = [
  { value: "short", label: "Under 200 pages", max: 199 },
  { value: "medium", label: "200-399 pages", min: 200, max: 399 },
  { value: "long", label: "400+ pages", min: 400 },
] as const;

type LengthFilter = typeof LENGTH_FILTERS[number]["value"] | null;

const PAGE_SIZE = 36;

function SEOHead() {
  const title = "Podcast Bookstore | Books Recommended on Top Podcasts | PodCap";
  const description = "Discover books recommended and discussed across the top podcasts. Filter by topic, rating, and length. Find your next great read based on what the smartest people are reading.";

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
    setOrCreate("property", "og:url", "https://podcap.io/bookstore");
    setOrCreate("property", "og:type", "website");
    setOrCreate("name", "twitter:card", "summary");

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.href = "https://podcap.io/bookstore";
  }
  return null;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
      <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
      {rating.toFixed(1)}
    </span>
  );
}

function BookCard({ book, index }: { book: BookstoreBook; index: number }) {
  const hasPage = !!book.slug;

  const coverEl = <BookCover title={book.name} asin={book.asin} slug={book.slug} googleBooksId={book.googleBooksId} size="md" />;
  const titleEl = (
    <h3 className="text-[15px] font-bold text-foreground leading-snug group-hover/title:text-amber-700 dark:group-hover/title:text-amber-400 transition-colors" data-testid={`book-title-${index}`}>
      {book.name}
    </h3>
  );

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
          {hasPage ? (
            <Link href={`/bookstore/${book.slug}`} className="shrink-0" data-testid={`book-cover-link-${index}`}>
              {coverEl}
            </Link>
          ) : (
            <a href={book.amazonUrl} target="_blank" rel="sponsored noopener noreferrer" className="shrink-0" data-testid={`book-cover-link-${index}`}>
              {coverEl}
            </a>
          )}
          <div className="flex-1 min-w-0">
            {hasPage ? (
              <Link href={`/bookstore/${book.slug}`} className="block group/title" data-testid={`book-title-link-${index}`}>
                {titleEl}
              </Link>
            ) : (
              <a href={book.amazonUrl} target="_blank" rel="sponsored noopener noreferrer" className="block group/title" data-testid={`book-title-link-${index}`}>
                {titleEl}
              </a>
            )}
            {book.author && book.author !== "null" && (
              <p className="text-[15px] text-muted-foreground mt-0.5" data-testid={`book-author-${index}`}>
                by <AuthorWithLinks author={book.author} />
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/[0.08] px-2 py-0.5 rounded-full" data-testid={`book-mentions-${index}`}>
                <Mic className="w-3 h-3" />
                {book.mentionCount} {book.mentionCount === 1 ? "mention" : "mentions"}
              </span>
              {book.rating && <StarRating rating={book.rating} />}
              {book.pageCount && (
                <span className="text-xs text-muted-foreground">
                  {book.pageCount} pages
                </span>
              )}
              {book.publishYear && (
                <span className="text-xs text-muted-foreground">
                  Published {book.publishYear}
                </span>
              )}
            </div>
          </div>
        </div>

        {book.description && (
          <p className="text-[15px] text-muted-foreground leading-relaxed mt-3" data-testid={`book-description-${index}`}>
            {book.description}
          </p>
        )}

        {book.topics && book.topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {book.topics.slice(0, 2).map(t => (
              <span key={t} className="text-[11px] font-medium text-muted-foreground bg-black/[0.04] dark:bg-white/[0.06] px-2 py-0.5 rounded-full">
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-black/[0.04] dark:border-white/[0.04] flex items-center justify-between">
          {book.podcastCount > 1 && (
            <span className="text-xs text-muted-foreground" data-testid={`book-podcasts-${index}`}>
              {book.podcastCount} podcasts
            </span>
          )}
          <div className="ml-auto">
            {hasPage ? (
              <Link
                href={`/bookstore/${book.slug}`}
                className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
                data-testid={`book-view-${index}`}
              >
                View
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <a
                href={book.amazonUrl}
                target="_blank"
                rel="sponsored noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
                data-testid={`book-buy-${index}`}
              >
                Amazon
                <ExternalLink className="w-3 h-3 opacity-40" />
              </a>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function CuratedShelf({ title, icon, books }: { title: string; icon: any; books: BookstoreBook[] }) {
  if (books.length === 0) return null;
  const Icon = icon;

  return (
    <div className="mb-10" data-testid={`shelf-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-xl bg-amber-500/[0.08] flex items-center justify-center">
          <Icon className="w-4 h-4 text-amber-600" />
        </div>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
        {books.slice(0, 8).map((book, i) => {
          const inner = (
            <div className="w-[140px] shrink-0 group/shelf" key={`${book.name}-${i}`}>
              <div className="mb-2">
                <BookCover title={book.name} asin={book.asin} slug={book.slug} googleBooksId={book.googleBooksId} size="lg" />
              </div>
              <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2 group-hover/shelf:text-amber-700 dark:group-hover/shelf:text-amber-400 transition-colors">
                {book.name}
              </p>
              {book.author && book.author !== "null" && (
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{book.author}</p>
              )}
              <div className="flex items-center gap-1.5 mt-1">
                {book.rating && <StarRating rating={book.rating} />}
                <span className="text-[11px] text-muted-foreground">
                  {book.mentionCount} mentions
                </span>
              </div>
            </div>
          );
          return book.slug ? (
            <Link href={`/bookstore/${book.slug}`} className="block shrink-0" key={`${book.name}-${i}`} data-testid={`shelf-book-${i}`}>
              {inner}
            </Link>
          ) : (
            <a href={book.amazonUrl} target="_blank" rel="sponsored noopener noreferrer" className="block shrink-0" key={`${book.name}-${i}`} data-testid={`shelf-book-${i}`}>
              {inner}
            </a>
          );
        })}
      </div>
    </div>
  );
}

export default function Bookstore() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("mentions");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedLength, setSelectedLength] = useState<LengthFilter>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const navRef = useRef<HTMLDivElement>(null);
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsSticky(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-68px 0px 0px 0px" }
    );
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);

  const { data, isLoading } = useQuery<BookstoreData>({
    queryKey: ["/api/bookstore"],
  });

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, sortBy, selectedTopic, selectedLength]);

  const hasActiveFilters = !!selectedTopic || !!selectedLength || !!searchQuery;

  const availableTopics = useMemo(() => {
    if (!data?.books) return [];
    const counts = new Map<string, number>();
    for (const b of data.books) {
      for (const t of (b.topics || [])) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return TOPIC_FILTERS.filter(t => (counts.get(t) || 0) >= 2);
  }, [data]);

  const WOMEN_AUTHORS = new Set([
    "alison gopnik", "alison roman", "allegra goodman", "amanda han", "amy purdy",
    "amy shaw", "angela duckworth", "anne-laure le cunff", "annie duke", "annie jacobsen",
    "barbara kingsolver", "bethany joy lenz", "bronnie ware", "byron katie",
    "carole hooven", "hilary allen", "ina park", "iva layla",
    "j.d. robb", "jane ann krentz", "jenna fischer", "jessie inchauspé",
    "julia boyd", "julia shaw", "julie fenster", "juliet macur",
    "kathryn paige harden", "laura vanderkam", "leslie john", "linda hill",
    "maya shankar", "mel robbins", "nicole mcnichols", "rachel e. gross",
    "rachel wilson", "rebecca solnit", "sarah adams", "sarah gray",
    "sarah j. maas", "sarah paine", "sasha hamdani", "tanya janca",
    "tayari jones", "thais gibson", "tish rabe", "vivian tu",
  ]);

  const BLACK_AUTHORS = new Set([
    "amiri baraka", "charlamagne tha god", "ralph ellison",
    "tayari jones", "jalen hurts",
    "w. johnson roundtree", "yohuru williams",
  ]);

  const curatedShelves = useMemo(() => {
    if (!data?.books) return { trending: [], highRated: [], quickReads: [], newReleases: [], byWomen: [], byBlackAuthors: [] };

    const withSlug = data.books.filter(b => b.slug);
    const currentYear = new Date().getFullYear();

    const trending = [...withSlug]
      .filter(b => b.mentionCount >= 3 && b.podcastCount >= 2)
      .sort((a, b) => b.podcastCount - a.podcastCount)
      .slice(0, 8);

    const highRated = [...withSlug]
      .filter(b => b.rating && b.rating >= 3.8)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 8);

    const quickReads = [...withSlug]
      .filter(b => b.pageCount && b.pageCount > 0 && b.pageCount <= 250)
      .sort((a, b) => (a.pageCount || 999) - (b.pageCount || 999))
      .slice(0, 8);

    const newReleases = [...withSlug]
      .filter(b => b.publishYear && b.publishYear >= currentYear - 3)
      .sort((a, b) => (b.publishYear || 0) - (a.publishYear || 0))
      .slice(0, 8);

    const matchesAuthorSet = (author: string | null, authorSet: Set<string>) => {
      if (!author || author === "null") return false;
      const lower = author.toLowerCase().trim();
      if (authorSet.has(lower)) return true;
      const parts = lower.split(/,\s*| and /);
      return parts.some(p => authorSet.has(p.trim()));
    };

    const byWomen = [...withSlug]
      .filter(b => matchesAuthorSet(b.author, WOMEN_AUTHORS))
      .sort((a, b) => b.podcastCount - a.podcastCount)
      .slice(0, 8);

    const byBlackAuthors = [...withSlug]
      .filter(b => matchesAuthorSet(b.author, BLACK_AUTHORS))
      .sort((a, b) => b.podcastCount - a.podcastCount)
      .slice(0, 8);

    return { trending, highRated, quickReads, newReleases, byWomen, byBlackAuthors };
  }, [data]);

  const filteredBooks = useMemo(() => {
    if (!data?.books) return [];

    let result = [...data.books];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(b =>
        b.name.toLowerCase().includes(q) ||
        (b.author && b.author.toLowerCase().includes(q)) ||
        (b.topics || []).some(t => t.toLowerCase().includes(q))
      );
    }

    if (selectedTopic) {
      result = result.filter(b => (b.topics || []).includes(selectedTopic));
    }

    if (selectedLength) {
      const lenDef = LENGTH_FILTERS.find(l => l.value === selectedLength);
      if (lenDef) {
        result = result.filter(b => {
          if (!b.pageCount) return false;
          if ('min' in lenDef && b.pageCount < (lenDef as any).min) return false;
          if ('max' in lenDef && b.pageCount > (lenDef as any).max) return false;
          return true;
        });
      }
    }

    if (sortBy === "podcasts") {
      result.sort((a, b) => b.podcastCount - a.podcastCount || b.mentionCount - a.mentionCount);
    } else if (sortBy === "alpha") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "rating") {
      result.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortBy === "newest") {
      result.sort((a, b) => (b.publishYear || 0) - (a.publishYear || 0));
    } else if (sortBy === "shortest") {
      result.sort((a, b) => {
        if (!a.pageCount && !b.pageCount) return 0;
        if (!a.pageCount) return 1;
        if (!b.pageCount) return -1;
        return a.pageCount - b.pageCount;
      });
    }

    return result;
  }, [data, searchQuery, sortBy, selectedTopic, selectedLength]);

  const visibleBooks = filteredBooks.slice(0, visibleCount);
  const hasMore = visibleCount < filteredBooks.length;
  const showShelves = !hasActiveFilters && sortBy === "mentions";

  const handleTopicClick = (topic: string) => {
    setSelectedTopic(selectedTopic === topic ? null : topic);
    setSearchQuery("");
    setSelectedLength(null);
    setVisibleCount(PAGE_SIZE);
    const el = document.getElementById("books-grid");
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 68 - 52 - 16;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead />
      <SiteHeader />

      <div className="bg-gradient-to-b from-amber-500/[0.03] via-background to-background">
        <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-6">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="flex flex-col items-center text-center gap-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/[0.08] flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-amber-600" />
              </div>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight leading-tight flex items-center gap-3 flex-wrap justify-center" data-testid="heading-bookstore">
              The Podcast Bookstore
              <span className="text-xs font-bold uppercase tracking-widest bg-amber-500/[0.12] text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full border border-amber-500/20">Beta</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed" data-testid="text-bookstore-subtitle">
              Find your next great read based on what the smartest podcast hosts are recommending. Not bestseller lists. Real conversations.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="max-w-2xl mx-auto mt-6"
          >
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/40" />
              <input
                type="text"
                placeholder="Search by title, author, or topic..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); if (e.target.value) { setSelectedTopic(null); setSelectedLength(null); } }}
                className="w-full pl-12 pr-10 py-3.5 text-[17px] bg-card border border-black/[0.1] dark:border-white/[0.1] rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all shadow-sm"
                data-testid="input-search"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  data-testid="button-clear-search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </motion.div>
        </section>
      </div>

      <div ref={navRef} className="h-0" />
      <div className={`sticky top-[68px] z-30 bg-background/95 backdrop-blur-sm border-b transition-shadow ${isSticky ? "border-black/[0.06] dark:border-white/[0.06] shadow-sm" : "border-transparent"}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-1.5 py-2.5 overflow-x-auto scrollbar-hide" data-testid="category-nav">
            <button
              onClick={() => { setSelectedTopic(null); setSelectedLength(null); setSearchQuery(""); setSortBy("mentions"); }}
              className={`px-3.5 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-all ${
                !selectedTopic && !selectedLength && !searchQuery
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
              }`}
              data-testid="category-all"
            >
              All Books
            </button>
            {availableTopics.map(topic => (
              <button
                key={topic}
                onClick={() => handleTopicClick(topic)}
                className={`px-3.5 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-all ${
                  selectedTopic === topic
                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                }`}
                data-testid={`category-${topic.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {topic}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-20 pt-6">
        {!isLoading && showShelves && (
          <section className="w-full max-w-7xl" data-testid="section-curated">
            <CuratedShelf title="Trending on Podcasts" icon={TrendingUp} books={curatedShelves.trending} />
            <CuratedShelf title="Highest Rated" icon={Star} books={curatedShelves.highRated} />
            {curatedShelves.byWomen.length > 0 && (
              <CuratedShelf title="Written by Women" icon={Feather} books={curatedShelves.byWomen} />
            )}
            {curatedShelves.byBlackAuthors.length > 0 && (
              <CuratedShelf title="Black Authors" icon={Users} books={curatedShelves.byBlackAuthors} />
            )}
            <CuratedShelf title="Quick Reads" icon={Clock} books={curatedShelves.quickReads} />
            <CuratedShelf title="Recently Published" icon={Sparkles} books={curatedShelves.newReleases} />
          </section>
        )}

        <section className="w-full max-w-7xl" data-testid="section-browse" id="books-grid">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-600" />
              <h2 className="text-[15px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-browse">
                {searchQuery ? "Search Results" : selectedTopic ? selectedTopic : "Browse All Books"}
              </h2>
              {(searchQuery || selectedTopic || selectedLength) && (
                <span className="text-[13px] font-mono text-muted-foreground/60 ml-1">
                  {filteredBooks.length} book{filteredBooks.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-5">
            <div className="flex flex-wrap items-center gap-2">
              {LENGTH_FILTERS.map(len => (
                <button
                  key={len.value}
                  onClick={() => setSelectedLength(selectedLength === len.value ? null : len.value)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-colors ${
                    selectedLength === len.value
                      ? "bg-amber-500/[0.15] text-amber-700 dark:text-amber-400 border border-amber-500/25"
                      : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1] border border-transparent"
                  }`}
                  title={len.label}
                  data-testid={`filter-length-${len.value}`}
                >
                  {len.label}
                </button>
              ))}
            </div>

            <div className="h-5 w-px bg-black/[0.08] dark:bg-white/[0.08] hidden sm:block" />

            <div className="flex flex-wrap items-center gap-2">
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSortBy(opt.value)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-colors ${
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

            {hasActiveFilters && (
              <button
                onClick={() => { setSelectedTopic(null); setSelectedLength(null); setSearchQuery(""); setSortBy("mentions"); }}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                data-testid="button-clear-filters"
              >
                Clear all
              </button>
            )}
          </div>

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
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="text-center py-16">
              <BookOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-lg font-medium text-muted-foreground" data-testid="text-no-results">No books found</p>
              <p className="text-[15px] text-muted-foreground/60 mt-1">Try adjusting your filters or search</p>
            </div>
          ) : (
            <>
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

        <div className="w-full max-w-7xl mt-12">
          <p className="text-xs text-muted-foreground/50 text-center" data-testid="text-affiliate-disclosure">
            Links to Amazon are affiliate links. PodCap may earn a small commission on purchases at no extra cost to you.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
