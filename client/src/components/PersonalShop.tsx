import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Search, X, Sparkles, BookOpen, ChevronDown, Filter, Mic, ArrowUpDown
} from "lucide-react";
import { BookCover } from "@/components/BookCover";
import { PodcastMicBadge } from "@/components/PodcastMicBadge";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { trackAffiliateUrl } from "@/lib/utils";

interface ShopBook {
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
  category: "book";
  podcastCount: number;
  podcastNames: string[];
  mentionCount: number;
  itemType: "book";
}

interface ShopProduct {
  name: string;
  company: string | null;
  category: string;
  type: string;
  description: string;
  url: string;
  isAmazon: boolean;
  imageUrl: string | null;
  slug: string;
  mentionCount: number;
  podcastCount: number;
  podcastNames: string[];
  episodes: { slug: string; title: string; podcastSlug: string }[];
  itemType: "product";
}

type ShopItem = ShopBook | ShopProduct;

interface ShopData {
  items: ShopItem[];
  books: ShopBook[];
  products: ShopProduct[];
  total: number;
}

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

const SORT_OPTIONS = [
  { value: "popular", label: "Most Popular" },
  { value: "alpha", label: "A to Z" },
  { value: "alpha-desc", label: "Z to A" },
  { value: "newest", label: "Newest to Oldest" },
  { value: "oldest", label: "Oldest to Newest" },
] as const;

type SortOption = typeof SORT_OPTIONS[number]["value"];

const PAGE_SIZE = 36;

const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

function PersonalBookCard({ book, index }: { book: ShopBook; index: number }) {
  const hasPage = !!book.slug;
  const skipAnim = prefersReducedMotion || index > 11;

  const cardContent = (
    <motion.div
      initial={skipAnim ? false : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={skipAnim ? { duration: 0 } : { duration: 0.25, delay: Math.min(index * 0.015, 0.2) }}
      className="group bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.06] rounded-2xl overflow-hidden hover:shadow-xl hover:border-[#6366F1]/20 hover:-translate-y-0.5 transition-all duration-200"
      data-testid={`personal-shop-card-${index}`}
    >
      <div className="h-[232px] sm:h-[280px] relative overflow-hidden bg-[#FAFAFA] dark:bg-white/[0.02] flex items-center justify-center [&>img]:max-w-[calc(100%-1rem)] [&>img]:max-h-[calc(100%-1rem)] [&>div:first-child]:max-w-[calc(100%-1rem)] [&>div:first-child]:max-h-[calc(100%-1rem)]">
        <BookCover title={book.name} slug={book.slug} googleBooksId={book.googleBooksId} isbn={book.isbn} hasCover={book.hasCover} size="xl" />
      </div>
      <div className="p-3.5">
        <h3 className="text-[15px] font-bold text-[#09090B] dark:text-white leading-snug line-clamp-2 min-h-[2.5em] group-hover:text-[#6366F1] transition-colors" data-testid={`personal-item-title-${index}`}>
          {book.name}
        </h3>
        <div className="min-h-[1.25em] mt-0.5">
          {book.author && book.author !== "null" && (
            <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] line-clamp-1" data-testid={`personal-item-author-${index}`}>
              {book.author}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <PodcastMicBadge count={book.podcastCount} size="sm" />
        </div>
      </div>
    </motion.div>
  );

  if (hasPage) {
    return (
      <Link href={`/shop/${book.slug}`} className="block" data-testid={`personal-item-link-${index}`}>
        {cardContent}
      </Link>
    );
  }

  return (
    <a href={trackAffiliateUrl(book.amazonUrl, book.name, "book")} target="_blank" rel="sponsored noopener noreferrer" className="block" data-testid={`personal-item-link-${index}`}>
      {cardContent}
    </a>
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

export function PersonalShop() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedPodcast, setSelectedPodcast] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("popular");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<ShopData>({
    queryKey: ["/api/shop"],
  });

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, selectedTopic, selectedPodcast, sortBy]);

  useEffect(() => {
    if (searchOpen && searchRef.current) searchRef.current.focus();
  }, [searchOpen]);

  const hasActiveFilters = !!searchQuery || !!selectedTopic || !!selectedPodcast || sortBy !== "popular";

  const clearAll = () => {
    setSearchQuery("");
    setSearchOpen(false);
    setSelectedTopic(null);
    setSelectedPodcast(null);
    setSortBy("popular");
  };

  const availableTopics = useMemo(() => {
    if (!data?.books) return [];
    const counts = new Map<string, number>();
    for (const b of data.books) {
      for (const t of (b.topics || [])) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return TOPIC_FILTERS.filter(t => (counts.get(t) || 0) >= 2)
      .map(t => ({ value: t, label: t }));
  }, [data]);

  const availablePodcasts = useMemo(() => {
    if (!data?.books) return [];
    const counts = new Map<string, number>();
    for (const b of data.books) {
      for (const p of (b.podcastNames || [])) {
        counts.set(p, (counts.get(p) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
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

  const featuredBooks = useMemo(() => {
    if (!data?.books) return [];
    return [...data.books]
      .filter(b => b.mentionCount >= 3 && b.podcastCount >= 2)
      .sort((a, b) => b.podcastCount - a.podcastCount)
      .slice(0, 10);
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

    if (selectedPodcast) {
      result = result.filter(b => (b.podcastNames || []).includes(selectedPodcast));
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
  }, [data, searchQuery, selectedTopic, selectedPodcast, sortBy]);

  const showFeatured = !searchQuery && !selectedTopic && !selectedPodcast && sortBy === "popular" && !isLoading && featuredBooks.length > 0;

  const dedupedBooks = useMemo(() => {
    if (!showFeatured || featuredBooks.length === 0) return filteredBooks;
    const featuredKeys = new Set(featuredBooks.map(b => b.slug || b.name));
    return filteredBooks.filter(b => !featuredKeys.has(b.slug || b.name));
  }, [filteredBooks, featuredBooks, showFeatured]);

  const visibleBooks = dedupedBooks.slice(0, visibleCount);
  const hasMore = visibleCount < dedupedBooks.length;

  const selectedPodcastArt = selectedPodcast ? podcastArtwork.get(selectedPodcast) : null;

  return (
    <div className="min-h-screen pb-24 md:pb-12" data-testid="personal-shop">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#09090B] dark:text-white tracking-tight" data-testid="heading-personal-shop">
              Pod Shop
            </h1>
            <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA] mt-0.5">
              Curated from your favorite podcasts
            </p>
          </div>
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className={`p-2.5 rounded-xl border transition-all ${
              searchOpen || searchQuery
                ? "bg-[#6366F1]/[0.08] border-[#6366F1]/20 text-[#6366F1]"
                : "bg-white dark:bg-white/[0.04] border-[#E4E4E7] dark:border-white/[0.1] text-[#71717A] dark:text-[#A1A1AA] hover:border-[#6366F1]/30"
            }`}
            aria-label="Search"
            data-testid="button-personal-search"
          >
            <Search className="w-5 h-5" />
          </button>
        </div>

        {(searchOpen || searchQuery) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-5"
          >
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[#A1A1AA]" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search by title, author, or topic..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-3 text-[15px] bg-white dark:bg-white/[0.04] border border-[#E4E4E7] dark:border-white/[0.1] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6366F1]/30 focus:border-[#6366F1]/30 transition-all"
                data-testid="input-personal-search"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); setSearchOpen(false); }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-0.5 text-[#A1A1AA] hover:text-[#52525B] transition-colors"
                  data-testid="button-clear-personal-search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </motion.div>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-6" data-testid="filter-controls">
          <DropdownSelect
            label="Topic"
            value={selectedTopic}
            options={availableTopics}
            onChange={setSelectedTopic}
            testId="dropdown-topic"
            icon={<BookOpen className="w-3.5 h-3.5" />}
          />

          <PodcastFilterDropdown
            value={selectedPodcast}
            podcasts={availablePodcasts}
            podcastArtwork={podcastArtwork}
            onChange={setSelectedPodcast}
            testId="dropdown-podcast"
          />

          <DropdownSelect
            label="Sort: Most Popular"
            value={sortBy === "popular" ? null : sortBy}
            options={SORT_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
            onChange={(val) => setSortBy((val as SortOption) || "popular")}
            testId="dropdown-sort"
            icon={<ArrowUpDown className="w-3.5 h-3.5" />}
          />

          {hasActiveFilters && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-[14px] font-medium text-[#6366F1] hover:bg-[#6366F1]/[0.06] transition-colors"
              data-testid="button-clear-all-filters"
            >
              <X className="w-3.5 h-3.5" />
              Clear all
            </button>
          )}
        </div>

        {selectedPodcast && (
          <div className="flex items-center gap-3 mb-6 px-4 py-3 bg-[#6366F1]/[0.04] border border-[#6366F1]/10 rounded-xl" data-testid="banner-podcast-filter">
            {selectedPodcastArt ? (
              <img src={selectedPodcastArt} alt={selectedPodcast} className="w-10 h-10 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-[#F0F0F2] dark:bg-white/[0.06] flex items-center justify-center shrink-0">
                <Mic className="w-4 h-4 text-[#A1A1AA]" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-[#09090B] dark:text-white truncate" data-testid="text-podcast-banner-name">{selectedPodcast}</p>
              <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA]">Showing books mentioned on this podcast</p>
            </div>
            <button
              onClick={() => setSelectedPodcast(null)}
              className="ml-auto p-1.5 text-[#A1A1AA] hover:text-[#52525B] transition-colors shrink-0"
              data-testid="button-clear-podcast-banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {showFeatured && (
          <section className="mb-8" data-testid="section-featured">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-[#6366F1]" />
              <h2 className="text-[15px] font-bold text-[#09090B] dark:text-white" data-testid="heading-featured">Most Talked About</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0" data-testid="shelf-featured">
              {featuredBooks.map((book, i) => (
                <div key={`featured-${book.name}-${i}`} className="w-[160px] sm:w-[180px] shrink-0">
                  <PersonalBookCard book={book} index={i} />
                </div>
              ))}
            </div>
          </section>
        )}

        <section data-testid="section-all-items">
          {searchQuery && (
            <p className="text-[13px] text-[#A1A1AA] mb-3" data-testid="text-search-count">
              {filteredBooks.length} result{filteredBooks.length !== 1 ? "s" : ""} for &ldquo;{searchQuery}&rdquo;
            </p>
          )}

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.06] rounded-2xl overflow-hidden animate-pulse">
                  <div className="h-[232px] sm:h-[280px] bg-[#F0F0F2] dark:bg-white/[0.04]" />
                  <div className="p-3.5 space-y-2">
                    <div className="h-4 bg-[#F0F0F2] dark:bg-white/[0.04] rounded w-3/4" />
                    <div className="h-3 bg-[#F0F0F2] dark:bg-white/[0.04] rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="text-center py-20">
              <BookOpen className="w-12 h-12 text-[#A1A1AA]/20 mx-auto mb-4" />
              <p className="text-lg font-medium text-[#52525B] dark:text-[#A1A1AA]" data-testid="text-no-results">No books found</p>
              <p className="text-[14px] text-[#A1A1AA] mt-1">Try a different search or filter</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3" data-testid="grid-personal-shop">
                {visibleBooks.map((book, i) => (
                  <PersonalBookCard key={`${book.name}-${book.slug}-${i}`} book={book} index={showFeatured ? i + featuredBooks.length : i} />
                ))}
              </div>

              {hasMore && (
                <div className="flex justify-center mt-8">
                  <button
                    onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                    className="px-8 py-3 bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] font-semibold text-[15px] rounded-full hover:opacity-90 transition-opacity shadow-sm"
                    data-testid="button-personal-load-more"
                  >
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
        </section>

      </div>
    </div>
  );
}
