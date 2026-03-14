import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ShoppingBag, Search, ExternalLink, Mic, X, ChevronRight,
  ChevronDown, Filter, ArrowUpDown
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";

interface ShopProduct {
  name: string;
  company: string | null;
  type: string;
  description: string;
  url: string;
  isAmazon: boolean;
  imageUrl: string | null;
  mentionCount: number;
  podcastCount: number;
  podcastNames: string[];
  episodes: { slug: string; title: string; podcastSlug: string }[];
}

interface ShopData {
  products: ShopProduct[];
  total: number;
}

const SORT_OPTIONS = [
  { value: "popular", label: "Most Mentioned" },
  { value: "alpha", label: "A to Z" },
  { value: "alpha-desc", label: "Z to A" },
] as const;

type SortOption = typeof SORT_OPTIONS[number]["value"];

const CATEGORY_FILTERS = [
  { value: "service_or_tool", label: "Tools & Software" },
  { value: "physical_product", label: "Physical Products" },
  { value: "experience", label: "Experiences" },
];

const PAGE_SIZE = 36;

function SEOHead() {
  useEffect(() => {
    const title = "Podcast Shop | Products & Tools Recommended on Top Podcasts | PodCap";
    const description = "Discover the products, tools, and services that top podcast hosts and guests actually use and recommend. Real endorsements from real conversations.";
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
    setOrCreate("property", "og:url", "https://podcap.io/shop");
    setOrCreate("property", "og:type", "website");
    setOrCreate("name", "twitter:card", "summary");

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.href = "https://podcap.io/shop";
  }, []);
  return null;
}

const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

function getTypeLabel(type: string) {
  const map: Record<string, string> = { service_or_tool: "Tool", physical_product: "Product", software: "Software", tool: "Tool", service: "Service", app: "App", course: "Course", newsletter: "Newsletter", supplement: "Supplement", game: "Game", website: "Website", product: "Product", experience: "Experience" };
  return map[type] || "Product";
}

function getTypeColor(type: string) {
  if (["service_or_tool", "software", "tool", "app"].includes(type)) return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
  if (type === "experience") return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
  if (type === "course") return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
  if (type === "newsletter") return "bg-orange-500/10 text-orange-700 dark:text-orange-400";
  return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
}

function ProductCard({ product, index }: { product: ShopProduct; index: number }) {
  const skipAnim = prefersReducedMotion || index > 11;
  const [imgError, setImgError] = useState(false);

  return (
    <motion.div
      initial={skipAnim ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={skipAnim ? { duration: 0 } : { duration: 0.3, delay: Math.min(index * 0.02, 0.3) }}
      className="group bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.08] rounded-2xl overflow-hidden hover:shadow-lg hover:border-[#6366F1]/20 transition-all duration-200"
      data-testid={`product-card-${index}`}
    >
      <div className="p-5">
        <div className="flex gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/[0.08] flex items-center justify-center shrink-0 overflow-hidden">
            {product.imageUrl && !imgError ? (
              <img src={product.imageUrl} alt={product.name} className="w-full h-full object-contain p-1.5" loading="lazy" onError={() => setImgError(true)} />
            ) : (
              <ShoppingBag className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[17px] font-bold text-[#09090B] dark:text-white leading-snug" data-testid={`product-name-${index}`}>
                {product.name}
              </h3>
              <span className={`text-[11px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${getTypeColor(product.type)}`}>
                {getTypeLabel(product.type)}
              </span>
            </div>
            {product.company && product.company !== product.name && (
              <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] mt-0.5">
                by {product.company}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {product.mentionCount > 1 && (
                <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#6366F1] bg-[#6366F1]/[0.08] px-2 py-0.5 rounded-full shrink-0" data-testid={`product-mentions-${index}`}>
                  <Mic className="w-3 h-3" />
                  {product.mentionCount} mentions
                </span>
              )}
              {product.podcastCount > 1 && (
                <span className="text-[14px] text-[#A1A1AA]" data-testid={`product-podcasts-${index}`}>
                  {product.podcastCount} podcasts
                </span>
              )}
            </div>
          </div>
        </div>

        {product.description && (
          <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed mt-3 line-clamp-2" data-testid={`product-description-${index}`}>
            {product.description}
          </p>
        )}

        <div className="mt-3 pt-3 border-t border-[#F0F0F2] dark:border-white/[0.04] flex items-center justify-between gap-2">
          <p className="text-[12px] text-[#A1A1AA] truncate flex-1 min-w-0">
            <span className="font-medium text-[#52525B] dark:text-[#A1A1AA]">Heard on </span>
            {product.podcastNames.slice(0, 2).join(", ")}
            {product.podcastNames.length > 2 && ` + ${product.podcastNames.length - 2} more`}
          </p>
          {product.url && (
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 text-[14px] font-semibold transition-colors shrink-0 ${
                product.isAmazon
                  ? "text-[#FF9900] hover:text-[#E88B00]"
                  : "text-[#6366F1] hover:text-[#4F46E5]"
              }`}
              data-testid={`product-link-${index}`}
            >
              {product.isAmazon ? "Amazon" : "Visit"}
              <ExternalLink className="w-3 h-3 opacity-40" />
            </a>
          )}
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
        aria-label="Search products"
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
        placeholder="Search products or companies..."
        aria-label="Search products"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-[240px] pl-9 pr-8 py-2 text-[14px] bg-white dark:bg-white/[0.04] border border-[#E4E4E7] dark:border-white/[0.12] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366F1]/30 focus:border-[#6366F1]/40 transition-all"
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
        <div className="absolute top-full left-0 mt-1 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-white/[0.12] rounded-xl shadow-lg z-50 w-[320px] py-1 max-h-[400px] flex flex-col">
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

export default function Shop() {
  const [sortBy, setSortBy] = useState<SortOption>("popular");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedPodcast, setSelectedPodcast] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, isError } = useQuery<ShopData>({
    queryKey: ["/api/shop"],
  });

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sortBy, selectedCategory, selectedPodcast, searchQuery]);

  const availablePodcasts = useMemo(() => {
    if (!data?.products) return [];
    const counts = new Map<string, number>();
    for (const p of data.products) {
      for (const name of (p.podcastNames || [])) {
        counts.set(name, (counts.get(name) || 0) + 1);
      }
    }
    return [...counts.entries()]
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

  const availableCategories = useMemo(() => {
    if (!data?.products) return [];
    const counts = new Map<string, number>();
    for (const p of data.products) {
      counts.set(p.type, (counts.get(p.type) || 0) + 1);
    }
    return CATEGORY_FILTERS.filter(c => (counts.get(c.value) || 0) > 0);
  }, [data]);

  const hasActiveFilters = !!selectedCategory || !!selectedPodcast || !!searchQuery;

  const filteredProducts = useMemo(() => {
    if (!data?.products) return [];
    let result = [...data.products];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.company && p.company.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    }

    if (selectedCategory) {
      result = result.filter(p => p.type === selectedCategory);
    }

    if (selectedPodcast) {
      result = result.filter(p => (p.podcastNames || []).includes(selectedPodcast));
    }

    if (sortBy === "popular") {
      result.sort((a, b) => b.mentionCount - a.mentionCount || b.podcastCount - a.podcastCount);
    } else if (sortBy === "alpha") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "alpha-desc") {
      result.sort((a, b) => b.name.localeCompare(a.name));
    }

    return result;
  }, [data, searchQuery, sortBy, selectedCategory, selectedPodcast]);

  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const hasMore = visibleCount < filteredProducts.length;

  const clearAll = () => {
    setSelectedCategory(null);
    setSelectedPodcast(null);
    setSearchQuery("");
    setSortBy("popular");
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F7FC] dark:bg-[#08080F]">
      <SEOHead />
      <SiteHeader />

      <div className="bg-gradient-to-b from-emerald-500/[0.03] via-[#F7F7FC] to-[#F7F7FC] dark:from-emerald-500/[0.02] dark:via-[#08080F] dark:to-[#08080F]">
        <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-6">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="flex flex-col items-center text-center gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#09090B] dark:text-white tracking-tight leading-[1.15]" data-testid="heading-shop">
                The tools behind the world's best podcasts
              </h1>
            </div>
            <p className="text-lg sm:text-xl text-[#52525B] dark:text-[#A1A1AA] max-w-2xl leading-relaxed" data-testid="text-shop-subtitle">
              Discover the products, tools, and services that hosts and guests actually use — genuine endorsements, not ads.
            </p>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider bg-emerald-500/[0.12] text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full">
              Beta
            </span>
          </motion.div>
        </section>
      </div>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-20 pt-6">
        <section className="w-full max-w-7xl" data-testid="section-browse" id="products-grid">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-emerald-600" />
              <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-[#09090B] dark:text-white" data-testid="heading-browse">
                {selectedPodcast ? `Products from ${selectedPodcast}` : searchQuery ? "Search Results" : selectedCategory ? CATEGORY_FILTERS.find(c => c.value === selectedCategory)?.label || "Products" : "Browse All Products"}
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
              label="Most Mentioned"
              value={sortBy}
              options={SORT_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              onChange={(v) => setSortBy((v as SortOption) || "popular")}
              testId="dropdown-sort"
              icon={<ArrowUpDown className="w-3.5 h-3.5" />}
            />

            {availableCategories.length > 1 && (
              <DropdownSelect
                label="Category"
                value={selectedCategory}
                options={availableCategories}
                onChange={setSelectedCategory}
                testId="dropdown-category"
              />
            )}

            {hasActiveFilters && (
              <button
                onClick={clearAll}
                className="text-[14px] text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white underline underline-offset-2 transition-colors"
                data-testid="button-clear-filters"
              >
                Clear all
              </button>
            )}

            <div className="flex-1" />

            <SearchToggle
              value={searchQuery}
              onChange={(v) => { setSearchQuery(v); if (v) { setSelectedCategory(null); } }}
            />
          </div>

          {selectedPodcast && podcastArtwork.get(selectedPodcast) && (
            <div className="flex items-center gap-3 mb-5 p-3 bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.08] rounded-xl">
              <img src={podcastArtwork.get(selectedPodcast)!} alt={selectedPodcast} className="w-10 h-10 rounded-lg object-cover" />
              <div>
                <p className="text-[15px] font-semibold text-[#09090B] dark:text-white">{selectedPodcast}</p>
                <p className="text-[13px] text-[#A1A1AA]">Showing products mentioned on this podcast</p>
              </div>
              <button onClick={() => setSelectedPodcast(null)} className="ml-auto p-1 text-[#A1A1AA] hover:text-[#52525B]" data-testid="clear-podcast-filter">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {isError ? (
            <div className="text-center py-16" data-testid="shop-error">
              <p className="text-[15px] text-muted-foreground">Something went wrong loading products. Please try again later.</p>
            </div>
          ) : isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.08] rounded-2xl p-5 animate-pulse">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#F0F0F2] dark:bg-white/[0.06] shrink-0" />
                    <div className="flex-1 space-y-3">
                      <div className="h-5 bg-[#F0F0F2] dark:bg-white/[0.06] rounded w-3/4" />
                      <div className="h-3 bg-[#F0F0F2] dark:bg-white/[0.04] rounded w-1/2" />
                      <div className="h-3 bg-[#F0F0F2] dark:bg-white/[0.04] rounded w-1/3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-16">
              <ShoppingBag className="w-10 h-10 text-[#A1A1AA]/30 mx-auto mb-4" />
              <p className="text-lg font-medium text-[#52525B] dark:text-[#A1A1AA]" data-testid="text-no-results">No products found</p>
              <p className="text-[14px] text-[#A1A1AA] mt-1">Try adjusting your filters or search</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="grid-products">
                {visibleProducts.map((product, i) => (
                  <ProductCard key={`${product.name}-${i}`} product={product} index={i} />
                ))}
              </div>

              {hasMore && (
                <div className="flex justify-center mt-8">
                  <button
                    onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                    className="px-8 py-3 bg-emerald-500/[0.08] hover:bg-emerald-500/[0.14] text-emerald-700 dark:text-emerald-400 font-semibold text-[15px] rounded-xl transition-colors border border-emerald-500/10"
                    data-testid="button-load-more"
                  >
                    Show more products
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
