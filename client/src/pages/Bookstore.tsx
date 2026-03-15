import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  BookOpen, Search, ExternalLink, Mic, X, Star, ChevronRight,
  ChevronDown, Sparkles, TrendingUp, Flame, Filter, ArrowUpDown
} from "lucide-react";
import { BookCover } from "@/components/BookCover";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { PEOPLE_DIRECTORY } from "@/data/entityDirectoryData";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { trackAffiliateUrl } from "@/lib/utils";

interface BookstoreBook {
  name: string;
  author: string | null;
  description: string;
  podcastBuzz: string | null;
  amazonUrl: string;
  asin: string | null;
  slug: string | null;
  googleBooksId: string | null;
  isbn: string | null;
  hasCover: boolean | null;
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
            <Link key={i} href={`/people/${slug}`} className="text-[#6366F1] hover:underline">
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
  { value: "popular", label: "Most Popular" },
  { value: "newest", label: "Newest to Oldest" },
  { value: "oldest", label: "Oldest to Newest" },
  { value: "alpha", label: "A to Z" },
  { value: "alpha-desc", label: "Z to A" },
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
  { value: "medium", label: "200–399 pages", min: 200, max: 399 },
  { value: "long", label: "400+ pages", min: 400 },
] as const;

type LengthFilter = typeof LENGTH_FILTERS[number]["value"] | null;

const PAGE_SIZE = 36;

function SEOHead() {
  useEffect(() => {
    const title = "Podcast Book Recommendations — Books Mentioned on Top Podcasts | PodCap";
    const description = "Browse books recommended by top podcast hosts and guests. See which titles come up most, who recommends them, and why — sourced from real conversations.";
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
    setOrCreate("property", "og:image", "https://podcap.io/og/og-bookstore.png");
    setOrCreate("name", "twitter:card", "summary_large_image");
    setOrCreate("name", "twitter:title", title);
    setOrCreate("name", "twitter:description", description);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.href = "https://podcap.io/bookstore";
  }, []);
  return null;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[14px] font-semibold text-[#52525B] dark:text-[#A1A1AA]">
      <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
      {rating.toFixed(1)}
    </span>
  );
}

const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

function DiscoveryCard({ book, index }: { book: BookstoreBook; index: number }) {
  const hasPage = !!book.slug;
  const contextText = book.podcastBuzz || book.description;
  const skipAnim = prefersReducedMotion || index > 11;

  return (
    <motion.div
      initial={skipAnim ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={skipAnim ? { duration: 0 } : { duration: 0.3, delay: Math.min(index * 0.02, 0.3) }}
      className="group bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.08] rounded-2xl overflow-hidden hover:shadow-lg hover:border-[#6366F1]/20 transition-all duration-200"
      data-testid={`book-card-${index}`}
    >
      <div className="p-5">
        <div className="flex gap-4">
          {hasPage ? (
            <Link href={`/bookstore/${book.slug}`} className="shrink-0" data-testid={`book-cover-link-${index}`}>
              <BookCover title={book.name} slug={book.slug} googleBooksId={book.googleBooksId} isbn={book.isbn} hasCover={book.hasCover} size="lg" />
            </Link>
          ) : (
            <a href={trackAffiliateUrl(book.amazonUrl, book.name, "book")} target="_blank" rel="sponsored noopener noreferrer" className="shrink-0" data-testid={`book-cover-link-${index}`}>
              <BookCover title={book.name} slug={book.slug} googleBooksId={book.googleBooksId} isbn={book.isbn} hasCover={book.hasCover} size="lg" />
            </a>
          )}
          <div className="flex-1 min-w-0">
            {hasPage ? (
              <Link href={`/bookstore/${book.slug}`} className="block group/title" data-testid={`book-title-link-${index}`}>
                <h3 className="text-[17px] font-bold text-[#09090B] dark:text-white leading-snug group-hover/title:text-[#6366F1] transition-colors" data-testid={`book-title-${index}`}>
                  {book.name}
                </h3>
              </Link>
            ) : (
              <a href={trackAffiliateUrl(book.amazonUrl, book.name, "book")} target="_blank" rel="sponsored noopener noreferrer" className="block group/title" data-testid={`book-title-link-${index}`}>
                <h3 className="text-[17px] font-bold text-[#09090B] dark:text-white leading-snug group-hover/title:text-[#6366F1] transition-colors" data-testid={`book-title-${index}`}>
                  {book.name}
                </h3>
              </a>
            )}
            {book.author && book.author !== "null" && (
              <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] mt-0.5" data-testid={`book-author-${index}`}>
                by <AuthorWithLinks author={book.author} />
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#6366F1] bg-[#6366F1]/[0.08] px-2 py-0.5 rounded-full shrink-0" data-testid={`book-mentions-${index}`}>
                <Mic className="w-3 h-3" />
                {book.mentionCount} mention{book.mentionCount !== 1 ? "s" : ""}
              </span>
              {book.podcastCount > 1 && (
                <span className="text-[14px] text-[#A1A1AA]" data-testid={`book-podcasts-${index}`}>
                  {book.podcastCount} podcasts
                </span>
              )}
              {book.rating && <StarRating rating={book.rating} />}
            </div>
          </div>
        </div>

        {contextText && (
          <div className="mt-3 pl-3.5 border-l-2 border-[#6366F1]/20">
            <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed line-clamp-2 italic" data-testid={`book-buzz-${index}`}>
              "{contextText}"
            </p>
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-[#F0F0F2] dark:border-white/[0.04] flex items-center justify-between gap-2">
          <p className="text-[12px] text-[#A1A1AA] truncate flex-1 min-w-0">
            <span className="font-medium text-[#52525B] dark:text-[#A1A1AA]">Heard on </span>
            {book.podcastNames.slice(0, 2).join(", ")}
            {book.podcastNames.length > 2 && ` + ${book.podcastNames.length - 2} more`}
          </p>
          <div className="shrink-0">
            {hasPage ? (
              <Link
                href={`/bookstore/${book.slug}`}
                className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#6366F1] hover:text-[#4F46E5] transition-colors"
                data-testid={`book-view-${index}`}
              >
                See why
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <a
                href={trackAffiliateUrl(book.amazonUrl, book.name, "book")}
                target="_blank"
                rel="sponsored noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#6366F1] hover:text-[#4F46E5] transition-colors"
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

function SearchToggle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded && inputRef.current) inputRef.current.focus();
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !value) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded, value]);

  if (!expanded && !value) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="p-2 rounded-lg text-[#52525B] dark:text-[#A1A1AA] border border-[#E4E4E7] dark:border-white/[0.12] bg-white dark:bg-white/[0.04] hover:border-[#6366F1]/30 transition-colors"
        aria-label="Search books"
        data-testid="button-toggle-search"
      >
        <Search className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A1A1AA]" />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search by title or author..."
        aria-label="Search books"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full sm:w-[240px] pl-9 pr-8 py-2 text-[14px] bg-white dark:bg-white/[0.04] border border-[#E4E4E7] dark:border-white/[0.12] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366F1]/30 focus:border-[#6366F1]/40 transition-all"
        data-testid="input-search"
      />
      {value && (
        <button
          onClick={() => { onChange(""); setExpanded(false); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-[#A1A1AA] hover:text-[#52525B] transition-colors"
          data-testid="button-clear-search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function DropdownSelect({ label, value, options, onChange, testId, icon }: {
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (val: string | null) => void;
  testId: string;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedLabel = options.find(o => o.value === value)?.label || label;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[14px] font-medium border transition-colors whitespace-nowrap ${
          value
            ? "bg-[#6366F1]/[0.08] text-[#6366F1] border-[#6366F1]/20"
            : "bg-white dark:bg-white/[0.04] text-[#52525B] dark:text-[#A1A1AA] border-[#E4E4E7] dark:border-white/[0.12] hover:border-[#6366F1]/30"
        }`}
        data-testid={testId}
      >
        {icon && icon}
        {selectedLabel}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-white/[0.12] rounded-xl shadow-lg z-50 min-w-[180px] py-1 max-h-[300px] overflow-y-auto">
          {value && (
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className="w-full px-3 py-2 text-left text-[14px] text-[#A1A1AA] hover:bg-[#F7F7FC] dark:hover:bg-white/[0.04] transition-colors"
              data-testid={`${testId}-clear`}
            >
              Clear
            </button>
          )}
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full px-3 py-2 text-left text-[14px] transition-colors ${
                value === opt.value
                  ? "text-[#6366F1] font-semibold bg-[#6366F1]/[0.04]"
                  : "text-[#09090B] dark:text-white hover:bg-[#F7F7FC] dark:hover:bg-white/[0.04]"
              }`}
              data-testid={`${testId}-option-${opt.value}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PodcastFilterDropdown({ value, podcasts, podcastArtwork, onChange, testId }: {
  value: string | null;
  podcasts: { value: string; label: string }[];
  podcastArtwork: Map<string, string>;
  onChange: (val: string | null) => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const filtered = query.trim()
    ? podcasts.filter(p => p.value.toLowerCase().includes(query.toLowerCase()))
    : podcasts;

  const selectedArt = value ? podcastArtwork.get(value) : null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[14px] font-medium border transition-colors whitespace-nowrap ${
          value
            ? "bg-[#6366F1]/[0.08] text-[#6366F1] border-[#6366F1]/20"
            : "bg-white dark:bg-white/[0.04] text-[#52525B] dark:text-[#A1A1AA] border-[#E4E4E7] dark:border-white/[0.12] hover:border-[#6366F1]/30"
        }`}
        data-testid={testId}
      >
        {selectedArt && (
          <img src={selectedArt} alt="" className="w-5 h-5 rounded-[4px] object-cover" />
        )}
        <Filter className="w-3.5 h-3.5" />
        {value || "Filter by Podcast"}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-white/[0.12] rounded-xl shadow-lg z-50 w-[calc(100vw-2rem)] sm:w-[320px] py-1 max-h-[400px] flex flex-col">
          <div className="px-2 pt-1 pb-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A1A1AA]" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search podcasts..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-[14px] bg-[#F7F7FC] dark:bg-white/[0.04] border border-[#E4E4E7] dark:border-white/[0.08] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#6366F1]/30"
                data-testid={`${testId}-search`}
              />
            </div>
          </div>
          {value && (
            <button
              onClick={() => { onChange(null); setOpen(false); setQuery(""); }}
              className="w-full px-3 py-2 text-left text-[14px] text-[#A1A1AA] hover:bg-[#F7F7FC] dark:hover:bg-white/[0.04] transition-colors border-b border-[#F0F0F2] dark:border-white/[0.06]"
              data-testid={`${testId}-clear`}
            >
              Show all podcasts
            </button>
          )}
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-[14px] text-[#A1A1AA] text-center">No podcasts found</div>
            ) : (
              filtered.map(p => {
                const art = podcastArtwork.get(p.value);
                return (
                  <button
                    key={p.value}
                    onClick={() => { onChange(p.value); setOpen(false); setQuery(""); }}
                    className={`w-full px-3 py-2 text-left text-[14px] transition-colors flex items-center gap-2.5 ${
                      value === p.value
                        ? "text-[#6366F1] font-semibold bg-[#6366F1]/[0.04]"
                        : "text-[#09090B] dark:text-white hover:bg-[#F7F7FC] dark:hover:bg-white/[0.04]"
                    }`}
                    data-testid={`${testId}-option-${p.value.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    {art ? (
                      <img src={art} alt={p.value} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-[#F0F0F2] dark:bg-white/[0.06] flex items-center justify-center shrink-0">
                        <Mic className="w-3.5 h-3.5 text-[#A1A1AA]" />
                      </div>
                    )}
                    <span className="truncate">{p.value}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ShelfRow({ books, keyPrefix }: { books: BookstoreBook[]; keyPrefix: string }) {
  return (
    <div className="flex gap-5 overflow-x-auto pb-3 -mx-4 px-4 scrollbar-hide">
      {books.slice(0, 10).map((book, i) => {
        const inner = (
          <div className="w-[160px] shrink-0 group/shelf">
            <div className="mb-2.5">
              <BookCover title={book.name} slug={book.slug} googleBooksId={book.googleBooksId} isbn={book.isbn} hasCover={book.hasCover} size="xl" />
            </div>
            <p className="text-[15px] font-semibold text-[#09090B] dark:text-white leading-snug line-clamp-2 group-hover/shelf:text-[#6366F1] transition-colors">
              {book.name}
            </p>
            {book.author && book.author !== "null" && (
              <p className="text-[14px] text-[#A1A1AA] mt-0.5 line-clamp-1">{book.author}</p>
            )}
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-[12px] text-[#6366F1] font-medium flex items-center gap-0.5">
                <Mic className="w-3 h-3 inline" />
                {book.podcastCount} {book.podcastCount === 1 ? "podcast" : "podcasts"}
              </span>
            </div>
          </div>
        );
        const testId = `shelf-${keyPrefix}-${(book.slug || book.name.toLowerCase().replace(/\s+/g, '-').slice(0, 30))}-${i}`;
        return book.slug ? (
          <Link href={`/bookstore/${book.slug}`} className="block shrink-0" key={`${keyPrefix}-${book.name}-${i}`} data-testid={testId}>
            {inner}
          </Link>
        ) : (
          <a href={trackAffiliateUrl(book.amazonUrl, book.name, "book")} target="_blank" rel="sponsored noopener noreferrer" className="block shrink-0" key={`${keyPrefix}-${book.name}-${i}`} data-testid={testId}>
            {inner}
          </a>
        );
      })}
    </div>
  );
}

export default function Bookstore() {
  const [sortBy, setSortBy] = useState<SortOption>("popular");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedLength, setSelectedLength] = useState<LengthFilter>(null);
  const [selectedPodcast, setSelectedPodcast] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading } = useQuery<BookstoreData>({
    queryKey: ["/api/bookstore"],
  });

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sortBy, selectedTopic, selectedLength, selectedPodcast, searchQuery]);

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

  const availablePodcasts = useMemo(() => {
    if (!data?.books) return [];
    const counts = new Map<string, number>();
    for (const b of data.books) {
      for (const p of (b.podcastNames || [])) {
        counts.set(p, (counts.get(p) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ value: name, label: `${name} (${count})` }));
  }, [data]);

  const podcastArtwork = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of PODCAST_LANDINGS) {
      map.set(p.name, p.artworkUrl);
    }
    return map;
  }, []);

  const shelves = useMemo(() => {
    if (!data?.books) return { mostRecommended: [], newTrending: [], recentlyPopular: [] };
    const allBooks = data.books;
    const currentYear = new Date().getFullYear();

    const mostRecommended = [...allBooks]
      .filter(b => b.mentionCount >= 3 && b.podcastCount >= 2)
      .sort((a, b) => b.podcastCount - a.podcastCount)
      .slice(0, 10);

    const newTrending = [...allBooks]
      .filter(b => b.publishYear && b.publishYear >= currentYear - 3)
      .sort((a, b) => (b.publishYear || 0) - (a.publishYear || 0) || b.mentionCount - a.mentionCount)
      .slice(0, 10);

    const recentlyPopular = [...allBooks]
      .filter(b => b.podcastBuzz && b.podcastCount >= 2)
      .sort((a, b) => b.mentionCount - a.mentionCount)
      .slice(0, 10);

    return { mostRecommended, newTrending, recentlyPopular };
  }, [data]);

  const hasActiveFilters = !!selectedTopic || !!selectedLength || !!selectedPodcast || !!searchQuery;

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

    if (selectedPodcast) {
      result = result.filter(b => (b.podcastNames || []).includes(selectedPodcast));
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

    if (sortBy === "popular") {
      result.sort((a, b) => b.podcastCount - a.podcastCount || b.mentionCount - a.mentionCount);
    } else if (sortBy === "alpha") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "alpha-desc") {
      result.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortBy === "newest") {
      result.sort((a, b) => (b.publishYear || 0) - (a.publishYear || 0));
    } else if (sortBy === "oldest") {
      result.sort((a, b) => (a.publishYear || 0) - (b.publishYear || 0));
    }

    return result;
  }, [data, searchQuery, sortBy, selectedTopic, selectedLength, selectedPodcast]);

  const visibleBooks = filteredBooks.slice(0, visibleCount);
  const hasMore = visibleCount < filteredBooks.length;

  const clearAll = () => {
    setSelectedTopic(null);
    setSelectedLength(null);
    setSelectedPodcast(null);
    setSearchQuery("");
    setSortBy("popular");
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F7FC] dark:bg-[#08080F]">
      <SEOHead />
      <SiteHeader />

      <div className="bg-gradient-to-b from-[#6366F1]/[0.03] via-[#F7F7FC] to-[#F7F7FC] dark:from-[#6366F1]/[0.02] dark:via-[#08080F] dark:to-[#08080F]">
        <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-6">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="flex flex-col items-center text-center gap-3">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#09090B] dark:text-white tracking-tight leading-[1.15]" data-testid="heading-bookstore">
              The reading list behind the world's best podcasts
            </h1>
            <p className="text-lg sm:text-xl text-[#52525B] dark:text-[#A1A1AA] max-w-2xl leading-relaxed" data-testid="text-bookstore-subtitle">
              Discover what hosts and guests actually recommend reading — and why. Browse all books or filter by your favorite podcast.
            </p>
          </motion.div>
        </section>
      </div>

      {!isLoading && (
        <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2">
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="w-4.5 h-4.5 text-[#6366F1]" />
            <h2 className="text-xl font-bold text-[#09090B] dark:text-white">Most Recommended on Podcasts</h2>
          </div>
          <ShelfRow books={shelves.mostRecommended} keyPrefix="recommended" />

          <div className="flex items-center gap-3 mb-4 mt-10">
            <TrendingUp className="w-4.5 h-4.5 text-[#6366F1]" />
            <h2 className="text-xl font-bold text-[#09090B] dark:text-white">New & Trending on Podcasts</h2>
          </div>
          <ShelfRow books={shelves.newTrending} keyPrefix="trending" />

          <div className="flex items-center gap-3 mb-4 mt-10">
            <Flame className="w-4.5 h-4.5 text-[#6366F1]" />
            <h2 className="text-xl font-bold text-[#09090B] dark:text-white">Recently Popular on Podcasts</h2>
          </div>
          <ShelfRow books={shelves.recentlyPopular} keyPrefix="popular" />
        </section>
      )}

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-20 pt-10">
        <section className="w-full max-w-7xl" data-testid="section-browse" id="books-grid">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#6366F1]" />
              <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-[#09090B] dark:text-white" data-testid="heading-browse">
                {selectedPodcast ? `Books from ${selectedPodcast}` : searchQuery ? "Search Results" : selectedTopic ? selectedTopic : "Browse All Books"}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-5">
            <PodcastFilterDropdown
              value={selectedPodcast}
              podcasts={availablePodcasts}
              podcastArtwork={podcastArtwork}
              onChange={setSelectedPodcast}
              testId="dropdown-podcast"
            />

            <div className="h-5 w-px bg-[#E4E4E7] dark:bg-white/[0.08] hidden sm:block" />

            <DropdownSelect
              label="Most Popular"
              value={sortBy}
              options={SORT_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              onChange={(v) => setSortBy((v as SortOption) || "popular")}
              testId="dropdown-sort"
              icon={<ArrowUpDown className="w-3.5 h-3.5" />}
            />

            <DropdownSelect
              label="Category"
              value={selectedTopic}
              options={availableTopics.map(t => ({ value: t, label: t }))}
              onChange={setSelectedTopic}
              testId="dropdown-category"
            />

            <DropdownSelect
              label="Length"
              value={selectedLength}
              options={LENGTH_FILTERS.map(l => ({ value: l.value, label: l.label }))}
              onChange={(v) => setSelectedLength(v as LengthFilter)}
              testId="dropdown-length"
            />

            {hasActiveFilters && (
              <button
                onClick={clearAll}
                className="text-[14px] text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white underline underline-offset-2 transition-colors"
                data-testid="button-clear-filters"
              >
                Clear all
              </button>
            )}

            <div className="hidden sm:block flex-1" />

            <div className="w-full sm:w-auto">
              <SearchToggle
                value={searchQuery}
                onChange={(v) => { setSearchQuery(v); if (v) { setSelectedTopic(null); setSelectedLength(null); } }}
              />
            </div>
          </div>

          {selectedPodcast && podcastArtwork.get(selectedPodcast) && (
            <div className="flex items-center gap-3 mb-5 p-3 bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.08] rounded-xl">
              <img src={podcastArtwork.get(selectedPodcast)!} alt={selectedPodcast} className="w-10 h-10 rounded-lg object-cover" />
              <div>
                <p className="text-[15px] font-semibold text-[#09090B] dark:text-white">{selectedPodcast}</p>
                <p className="text-[13px] text-[#A1A1AA]">Showing books recommended on this podcast</p>
              </div>
              <button onClick={() => setSelectedPodcast(null)} className="ml-auto p-1 text-[#A1A1AA] hover:text-[#52525B]" data-testid="clear-podcast-filter">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.08] rounded-2xl p-5 animate-pulse">
                  <div className="flex gap-4">
                    <div className="w-28 h-[168px] rounded-lg bg-[#F0F0F2] dark:bg-white/[0.06] shrink-0" />
                    <div className="flex-1 space-y-3">
                      <div className="h-5 bg-[#F0F0F2] dark:bg-white/[0.06] rounded w-3/4" />
                      <div className="h-3 bg-[#F0F0F2] dark:bg-white/[0.04] rounded w-1/2" />
                      <div className="h-3 bg-[#F0F0F2] dark:bg-white/[0.04] rounded w-1/3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="text-center py-16">
              <BookOpen className="w-10 h-10 text-[#A1A1AA]/30 mx-auto mb-4" />
              <p className="text-lg font-medium text-[#52525B] dark:text-[#A1A1AA]" data-testid="text-no-results">No books found</p>
              <p className="text-[14px] text-[#A1A1AA] mt-1">Try adjusting your filters or search</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="grid-books">
                {visibleBooks.map((book, i) => (
                  <DiscoveryCard key={`${book.name}-${i}`} book={book} index={i} />
                ))}
              </div>

              {hasMore && (
                <div className="flex justify-center mt-8">
                  <button
                    onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                    className="px-8 py-3 bg-[#6366F1]/[0.08] hover:bg-[#6366F1]/[0.14] text-[#6366F1] font-semibold text-[15px] rounded-xl transition-colors border border-[#6366F1]/10"
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
          <p className="text-[14px] text-[#A1A1AA] text-center" data-testid="text-affiliate-disclosure">
            Links to Amazon are affiliate links. PodCap may earn a small commission on purchases at no extra cost to you.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
