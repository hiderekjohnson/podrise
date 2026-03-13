import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search, Mic, ArrowRight, Sparkles, Cpu, TrendingUp, Briefcase, Heart, Globe, BookOpen, DollarSign, Lightbulb, Megaphone, ChevronRight, Clock, Users, X, Flame, Zap, Star, Play, ArrowUpRight, Headphones, Filter } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Footer } from "@/components/Footer";
import { PODCAST_LANDINGS, type PodcastLandingConfig } from "@/data/podcastLandingData";
import { SiteHeader } from "@/components/SiteHeader";

interface PodcastStat {
  slug: string;
  podcastName: string;
  episodeCount: number;
  latestEpisode: string;
  firstEpisode: string;
}

interface DiscoveryData {
  recentEpisodes: { slug: string; episodeSlug: string; podcastName: string; episodeTitle: string; publishDate: string; artworkUrl: string; tldl: string; hosts: string }[];
  podcastStats: PodcastStat[];
}

interface LeaderboardPodcast {
  id: string;
  name: string;
  artworkUrl: string;
  userCount: number;
  artist: string;
  genres: string[];
}

const DISCOVER_CATEGORIES = [
  { key: "all", label: "All", icon: Sparkles, color: "from-violet-500 to-indigo-500" },
  { key: "tech", label: "Tech & AI", icon: Cpu, color: "from-blue-500 to-cyan-500" },
  { key: "business", label: "Business", icon: Briefcase, color: "from-amber-500 to-orange-500" },
  { key: "finance", label: "Finance", icon: DollarSign, color: "from-emerald-500 to-green-500" },
  { key: "news", label: "News & Politics", icon: Globe, color: "from-red-500 to-rose-500" },
  { key: "health", label: "Health & Science", icon: Heart, color: "from-pink-500 to-rose-400" },
  { key: "self-improvement", label: "Self-Improvement", icon: Lightbulb, color: "from-yellow-400 to-amber-500" },
  { key: "marketing", label: "Marketing", icon: Megaphone, color: "from-purple-500 to-violet-500" },
  { key: "culture", label: "Culture", icon: BookOpen, color: "from-teal-500 to-emerald-500" },
] as const;

type CategoryKey = typeof DISCOVER_CATEGORIES[number]["key"];

function categoryBucket(category: string): CategoryKey {
  const c = category.toLowerCase();
  if (c.includes("ai") || c.includes("software") || c.includes("tech") || c.includes("product management") || c.includes("apple") || c.includes("automotive") || c.includes("internet culture") || c.includes("consumer tech")) return "tech";
  if (c.includes("finance") || c.includes("investing") || c.includes("crypto") || c.includes("markets") || c.includes("wealth") || c.includes("personal finance") || c.includes("economic") || c.includes("money")) return "finance";
  if (c.includes("news") || c.includes("politic") || c.includes("law") || c.includes("daily")) return "news";
  if (c.includes("health") || c.includes("science") || c.includes("medicine") || c.includes("longevity") || c.includes("fitness") || c.includes("psychology") || c.includes("wellbeing") || c.includes("mental")) return "health";
  if (c.includes("self-improvement") || c.includes("personal development") || c.includes("mindfulness") || c.includes("meditation") || c.includes("coaching") || c.includes("motivation") || c.includes("mindset") || c.includes("performance") || c.includes("stoic") || c.includes("philosophy") || c.includes("productivity")) return "self-improvement";
  if (c.includes("marketing") || c.includes("growth") || c.includes("side hustle") || c.includes("online marketing") || c.includes("seo")) return "marketing";
  if (c.includes("culture") || c.includes("education") || c.includes("history") || c.includes("comedy") || c.includes("entertainment") || c.includes("film") || c.includes("arts") || c.includes("design") || c.includes("narrative") || c.includes("language") || c.includes("stories") || c.includes("sport")) return "culture";
  if (c.includes("business") || c.includes("entrepreneur") || c.includes("startup") || c.includes("venture") || c.includes("leadership") || c.includes("strategy") || c.includes("saas") || c.includes("management") || c.includes("acquisitions") || c.includes("company")) return "business";
  return "business";
}

function SEOHead() {
  const title = "Podcast Discovery - Find Your Next Favorite Show | PodCap";
  const description = "Discover podcasts across tech, business, finance, health, and more. Browse by category, explore curated picks, or search for exactly what you're looking for.";

  if (typeof document !== "undefined") {
    document.title = title;
    const setOrCreate = (selector: string, attr: string, value: string) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement("meta");
        const [k, v] = attr === "name" ? ["name", selector.match(/name="([^"]+)"/)?.[1] || ""] : ["property", selector.match(/property="([^"]+)"/)?.[1] || ""];
        el.setAttribute(k, v);
        document.head.appendChild(el);
      }
      el.setAttribute("content", value);
    };
    setOrCreate('meta[name="description"]', "name", description);
    setOrCreate('meta[property="og:title"]', "property", title);
    setOrCreate('meta[property="og:description"]', "property", description);
  }
  return null;
}

const STAFF_PICKS_SLUGS = [
  "allin", "lexfridman", "hubermanlab", "investlikethebest",
  "acquiringminds", "no-priors", "pivot", "twentyminutevc",
  "ai-breakdown", "ezraklein", "howibuiltthis", "oddlots",
];

const DISCOVERY_PROMPTS = [
  { label: "Long-form deep dives", icon: Clock, filter: (p: PodcastLandingConfig) => (p.avgEpisodeLength || 0) >= 90 },
  { label: "Short daily briefings", icon: Zap, filter: (p: PodcastLandingConfig) => (p.avgEpisodeLength || 60) <= 30 && (p.frequency || "").toLowerCase().includes("daily") },
  { label: "Interview shows", icon: Users, filter: (p: PodcastLandingConfig) => {
    const d = (p.description + " " + (p.knownFor || []).join(" ")).toLowerCase();
    return d.includes("interview") || d.includes("conversation") || d.includes("guest");
  }},
  { label: "Started in the last 2 years", icon: Star, filter: (p: PodcastLandingConfig) => (p.yearStarted || 0) >= 2024 },
  { label: "Tech founder favorites", icon: Cpu, filter: (p: PodcastLandingConfig) => {
    const slugs = new Set(["allin", "no-priors", "twentyminutevc", "acquiringminds", "lenny", "pragmaticengineer", "bgtovc", "ai-breakdown", "stratechery", "pivot", "techmemeridehome", "bigtechnology", "aidailybrief", "latent-space", "bg2pod", "my-first-million", "saastr", "this-week-in-startups"]);
    return slugs.has(p.slug);
  }},
  { label: "Wall Street essentials", icon: DollarSign, filter: (p: PodcastLandingConfig) => {
    const slugs = new Set(["oddlots", "investlikethebest", "onthemarket", "rational-reminder", "moneywise", "bloomberg-surveillance", "marketsnacks", "slate-money", "navigatingwealth", "forward-thinking-investors", "art-of-investing", "bankless"]);
    return slugs.has(p.slug);
  }},
] as const;

const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function PodcastCard({ podcast, stat, variant = "default", rank }: { podcast: PodcastLandingConfig; stat?: PodcastStat; variant?: "default" | "featured" | "compact" | "trending"; rank?: number }) {
  if (variant === "featured") {
    return (
      <Link href={`/podcasts/${podcast.slug}`} data-testid={`card-podcast-${podcast.slug}`}>
        <div className="group relative bg-card border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden hover:border-primary/20 hover:shadow-lg transition-all cursor-pointer h-full">
          <div className="flex gap-4 p-5">
            <img
              src={podcast.artworkUrl}
              alt={podcast.name}
              className="w-24 h-24 rounded-xl object-cover shadow-md flex-shrink-0"
              loading="lazy"
            />
            <div className="flex-1 min-w-0">
              <h3 className="text-[17px] font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1 mb-1" data-testid={`text-podcast-name-${podcast.slug}`}>
                {podcast.name}
              </h3>
              <p className="text-[14px] text-muted-foreground mb-2">{podcast.hosts}</p>
              <p className="text-[13px] text-[#3F3F46] dark:text-[#A1A1AA] line-clamp-2 leading-relaxed capitalize">
                {podcast.description}
              </p>
              <div className="flex items-center gap-3 mt-3 text-[12px] text-muted-foreground/60">
                {podcast.frequency && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {podcast.frequency}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/20 group-hover:text-primary transition-colors flex-shrink-0 mt-1" />
          </div>
          {podcast.knownFor && podcast.knownFor.length > 0 && (
            <div className="px-5 pb-4 pt-0">
              <div className="flex flex-wrap gap-1.5">
                {podcast.knownFor.slice(0, 2).map((item, i) => (
                  <span key={i} className="text-[11px] px-2 py-1 rounded-md bg-primary/[0.06] text-primary/80 font-medium line-clamp-1">
                    {item.length > 50 ? item.substring(0, 47) + "..." : item}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Link>
    );
  }

  if (variant === "trending") {
    return (
      <Link href={`/podcasts/${podcast.slug}`} data-testid={`card-trending-${podcast.slug}`}>
        <div className="group flex items-center gap-3 p-3 rounded-xl hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors cursor-pointer">
          {rank !== undefined && (
            <span className="text-[18px] font-display font-black text-muted-foreground/20 w-6 text-center shrink-0">{rank}</span>
          )}
          <img
            src={podcast.artworkUrl}
            alt={podcast.name}
            className="w-11 h-11 rounded-lg object-cover shadow-sm flex-shrink-0"
            loading="lazy"
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">
              {podcast.name}
            </h3>
            <p className="text-[12px] text-muted-foreground/70 truncate">{podcast.hosts}</p>
          </div>
        </div>
      </Link>
    );
  }

  if (variant === "compact") {
    return (
      <Link href={`/podcasts/${podcast.slug}`} data-testid={`card-podcast-${podcast.slug}`}>
        <div className="group flex items-center gap-3 p-3 rounded-xl border border-black/[0.04] dark:border-white/[0.04] hover:border-primary/15 hover:bg-primary/[0.015] transition-all cursor-pointer">
          <img
            src={podcast.artworkUrl}
            alt={podcast.name}
            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
            loading="lazy"
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">
              {podcast.name}
            </h3>
            <p className="text-[12px] text-muted-foreground/70 truncate">{podcast.hosts} · {podcast.category}</p>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/20 group-hover:text-primary transition-colors flex-shrink-0" />
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/podcasts/${podcast.slug}`} data-testid={`card-podcast-${podcast.slug}`}>
      <div className="group relative bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-4 hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer h-full">
        <div className="flex items-center gap-3 mb-2.5">
          {podcast.artworkUrl && (
            <img
              src={podcast.artworkUrl}
              alt={podcast.name}
              className="w-12 h-12 rounded-lg flex-shrink-0 object-cover shadow-sm"
              loading="lazy"
            />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors truncate" data-testid={`text-podcast-name-${podcast.slug}`}>
              {podcast.name}
            </h3>
            <p className="text-[13px] text-muted-foreground/70 truncate">{podcast.hosts}</p>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/20 group-hover:text-primary transition-colors flex-shrink-0" />
        </div>
        <p className="text-[13px] text-[#3F3F46] dark:text-[#A1A1AA] line-clamp-2 mb-2.5 leading-relaxed capitalize">
          {podcast.description}
        </p>
        <div className="flex items-center gap-3 text-[12px] text-muted-foreground/60">
          {podcast.frequency && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {podcast.frequency.replace(/ per week/i, "/wk").replace(/ episodes/i, " ep").replace(/Twice/i, "2x")}
            </span>
          )}
          {!podcast.frequency && (
            <span className="truncate">{podcast.category}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function LatestEpisodePill({ episode }: { episode: DiscoveryData["recentEpisodes"][number] }) {
  return (
    <Link href={`/podcasts/${episode.slug}/${episode.episodeSlug}`} data-testid={`pill-episode-${episode.episodeSlug}`}>
      <div className="group flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-black/[0.05] dark:border-white/[0.05] hover:border-primary/15 hover:shadow-sm transition-all cursor-pointer shrink-0 w-[340px]">
        <img
          src={episode.artworkUrl}
          alt={episode.podcastName}
          className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
          loading="lazy"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-primary/70 truncate">{episode.podcastName}</p>
          <p className="text-[13px] font-medium text-foreground truncate group-hover:text-primary transition-colors">{episode.episodeTitle}</p>
        </div>
      </div>
    </Link>
  );
}

export default function PodcastsExplorer() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("all");
  const [activePromptIdx, setActivePromptIdx] = useState<number | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [isSticky, setIsSticky] = useState(false);
  const episodeScrollRef = useRef<HTMLDivElement>(null);

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

  const { data: discoveryData, isLoading } = useQuery<DiscoveryData>({
    queryKey: ["/api/podcasts-discovery"],
  });

  const { data: leaderboardData } = useQuery<LeaderboardPodcast[]>({
    queryKey: ["/api/leaderboard"],
  });

  const staffPicks = useMemo(() => {
    return STAFF_PICKS_SLUGS
      .map(slug => PODCAST_LANDINGS.find(p => p.slug === slug))
      .filter(Boolean) as typeof PODCAST_LANDINGS;
  }, []);

  const trendingPodcasts = useMemo(() => {
    if (!leaderboardData) return [];
    return [...leaderboardData]
      .sort((a, b) => b.userCount - a.userCount)
      .slice(0, 10)
      .map(lb => {
        const landing = PODCAST_LANDINGS.find(p => p.slug === lb.id || p.name === lb.name);
        return landing ? { ...landing, userCount: lb.userCount } : null;
      })
      .filter(Boolean) as (PodcastLandingConfig & { userCount: number })[];
  }, [leaderboardData]);

  const filteredPodcasts = useMemo(() => {
    let results = PODCAST_LANDINGS.slice();

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      results = results.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.hosts.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.knownFor || []).some(k => k.toLowerCase().includes(q))
      );
    }

    if (activeCategory !== "all") {
      results = results.filter(p => categoryBucket(p.category) === activeCategory);
    }

    if (activePromptIdx !== null) {
      const prompt = DISCOVERY_PROMPTS[activePromptIdx];
      if (prompt) results = results.filter(prompt.filter);
    }

    return results;
  }, [searchQuery, activeCategory, activePromptIdx]);

  const isSearching = searchQuery.trim().length > 0;
  const isFiltering = activeCategory !== "all" || activePromptIdx !== null;
  const showCurated = !isSearching && !isFiltering;

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    PODCAST_LANDINGS.forEach(p => {
      const cat = categoryBucket(p.category);
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, []);

  const handleCategoryClick = useCallback((key: CategoryKey) => {
    setActiveCategory(prev => prev === key && key !== "all" ? "all" : key);
    setActivePromptIdx(null);
    setSearchQuery("");
    const el = document.getElementById("podcasts-grid");
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 68 - 52 - 16;
      window.scrollTo({ top, behavior: "smooth" });
    }
  }, []);

  const handlePromptClick = useCallback((idx: number) => {
    setActivePromptIdx(prev => prev === idx ? null : idx);
    setActiveCategory("all");
    setSearchQuery("");
    const el = document.getElementById("podcasts-grid");
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 68 - 52 - 16;
      window.scrollTo({ top, behavior: "smooth" });
    }
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setActiveCategory("all");
    setActivePromptIdx(null);
  }, []);

  const recentEpisodes = discoveryData?.recentEpisodes || [];

  return (
    <div className="min-h-screen bg-background">
      <SEOHead />
      <SiteHeader />

      <div className="bg-gradient-to-b from-primary/[0.04] via-background to-background">
        <div className="max-w-5xl mx-auto px-6 pt-10 pb-6">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-center mb-8"
          >
            <div className="flex items-center justify-center gap-2 mb-3">
              <Headphones className="w-5 h-5 text-primary" />
              <span className="text-[13px] font-semibold uppercase tracking-[0.15em] text-primary">Podcast Discovery</span>
            </div>
            <h1 className="text-3xl sm:text-[2.75rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.03em] mb-3" data-testid="text-page-title">
              What should you listen to?
            </h1>
            <p className="text-lg text-[#3F3F46] dark:text-[#A1A1AA] max-w-xl mx-auto leading-relaxed" data-testid="text-page-description">
              Podcasts with AI-generated recaps. Find yours.
            </p>
          </motion.div>

          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="max-w-2xl mx-auto"
          >
            <div className={`relative transition-shadow ${searchFocused ? "shadow-lg shadow-primary/10" : "shadow-sm"}`}>
              <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${searchFocused ? "text-primary" : "text-muted-foreground/40"}`} />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search podcasts, hosts, or topics..."
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  if (e.target.value) { setActiveCategory("all"); setActivePromptIdx(null); }
                }}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="w-full pl-12 pr-16 py-4 text-[17px] bg-card border border-black/[0.1] dark:border-white/[0.1] rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
                data-testid="input-search-podcasts"
              />
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-black/[0.05] transition-colors"
                  data-testid="button-clear-search"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              ) : (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-mono text-muted-foreground/40 bg-black/[0.03] dark:bg-white/[0.05] px-2 py-0.5 rounded">
                  ⌘K
                </span>
              )}
            </div>
          </motion.div>

          {showCurated && (
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              className="mt-6 max-w-3xl mx-auto"
            >
              <div className="flex flex-wrap justify-center gap-2">
                {DISCOVERY_PROMPTS.map((prompt, i) => {
                  const PIco = prompt.icon;
                  return (
                    <button
                      key={i}
                      onClick={() => handlePromptClick(i)}
                      className={`group flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium transition-all border ${
                        activePromptIdx === i
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-card border-black/[0.06] dark:border-white/[0.08] text-muted-foreground hover:text-foreground hover:border-primary/20 hover:bg-primary/[0.03]"
                      }`}
                      data-testid={`prompt-${i}`}
                    >
                      <PIco className="w-3.5 h-3.5" />
                      {prompt.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <div ref={navRef} className="h-0" />
      <div className={`sticky top-[68px] z-30 bg-background/95 backdrop-blur-sm border-b transition-shadow ${isSticky ? "border-black/[0.06] dark:border-white/[0.06] shadow-sm" : "border-transparent"}`}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center gap-1.5 py-2.5 overflow-x-auto scrollbar-hide" data-testid="category-nav">
            {DISCOVER_CATEGORIES.map(({ key, label, icon: CatIcon }) => (
              <button
                key={key}
                onClick={() => handleCategoryClick(key)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-all ${
                  activeCategory === key
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                }`}
                data-testid={`category-${key}`}
              >
                <CatIcon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
            {(isFiltering || isSearching) && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-[13px] font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors whitespace-nowrap ml-1"
                data-testid="button-clear-filters"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 pb-20 pt-6">
        {isSearching && (
          <div className="mb-4">
            <p className="text-[14px] text-muted-foreground">
              <span className="font-semibold text-foreground">{filteredPodcasts.length}</span> podcast{filteredPodcasts.length !== 1 ? "s" : ""} matching "<span className="font-medium text-foreground">{searchQuery}</span>"
            </p>
          </div>
        )}

        {isSearching && filteredPodcasts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-12" data-testid="search-results">
            {filteredPodcasts.map((podcast, i) => {
              const stat = discoveryData?.podcastStats.find(s => s.slug === podcast.slug);
              return (
                <motion.div
                  key={podcast.slug}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
                >
                  <PodcastCard podcast={podcast} stat={stat} variant="featured" />
                </motion.div>
              );
            })}
          </div>
        )}

        {!isSearching && isFiltering && (
          <div className="mb-2">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-4 h-4 text-primary" />
              <h2 className="text-[15px] font-semibold text-foreground">
                {activePromptIdx !== null ? DISCOVERY_PROMPTS[activePromptIdx].label : DISCOVER_CATEGORIES.find(c => c.key === activeCategory)?.label}
              </h2>
              <span className="text-[13px] text-muted-foreground/60">{filteredPodcasts.length} podcast{filteredPodcasts.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        )}

        {isFiltering && !isSearching && filteredPodcasts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-12" id="podcasts-grid">
            {filteredPodcasts.map((podcast, i) => {
              const stat = discoveryData?.podcastStats.find(s => s.slug === podcast.slug);
              return (
                <motion.div
                  key={podcast.slug}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.015, 0.3) }}
                >
                  <PodcastCard podcast={podcast} stat={stat} />
                </motion.div>
              );
            })}
          </div>
        )}

        {showCurated && (
          <>
            {recentEpisodes.length > 0 && (
              <motion.section
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className="mb-10"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-just-dropped">Just Dropped</h2>
                  <span className="text-[12px] text-muted-foreground/50 font-mono">Latest recaps</span>
                </div>
                <div className="relative">
                  <div
                    ref={episodeScrollRef}
                    className="flex gap-3 overflow-x-auto scrollbar-hide pb-2"
                  >
                    {recentEpisodes.slice(0, 12).map((ep) => (
                      <LatestEpisodePill key={ep.episodeSlug} episode={ep} />
                    ))}
                  </div>
                  <div className="absolute right-0 top-0 bottom-2 w-16 bg-gradient-to-l from-background to-transparent pointer-events-none" />
                </div>
              </motion.section>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 mb-12" id="podcasts-grid">
              <div>
                <motion.section
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.15 }}
                  className="mb-10"
                >
                  <div className="flex items-center gap-2 mb-5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-staff-picks">Editor's Picks</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {staffPicks.slice(0, 8).map((podcast, i) => {
                      const stat = discoveryData?.podcastStats.find(s => s.slug === podcast.slug);
                      return (
                        <motion.div
                          key={podcast.slug}
                          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
                        >
                          <PodcastCard podcast={podcast} stat={stat} variant="featured" />
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.section>

                {DISCOVER_CATEGORIES.filter(c => c.key !== "all").map((cat, catIdx) => {
                  const catPodcasts = PODCAST_LANDINGS.filter(p => categoryBucket(p.category) === cat.key);
                  if (catPodcasts.length === 0) return null;
                  const CatIcon = cat.icon;
                  return (
                    <motion.section
                      key={cat.key}
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.2 + catIdx * 0.05 }}
                      className="mb-10"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${cat.color} flex items-center justify-center`}>
                            <CatIcon className="w-3.5 h-3.5 text-white" />
                          </div>
                          <h2 className="text-[15px] font-bold text-foreground" data-testid={`heading-category-${cat.key}`}>
                            {cat.label}
                          </h2>
                          <span className="text-[12px] text-muted-foreground/50">{catPodcasts.length}</span>
                        </div>
                        <button
                          onClick={() => handleCategoryClick(cat.key)}
                          className="text-[13px] font-medium text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                          data-testid={`link-see-all-${cat.key}`}
                        >
                          See all <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {catPodcasts.slice(0, 4).map((podcast) => {
                          const stat = discoveryData?.podcastStats.find(s => s.slug === podcast.slug);
                          return (
                            <PodcastCard key={podcast.slug} podcast={podcast} stat={stat} variant="compact" />
                          );
                        })}
                      </div>
                    </motion.section>
                  );
                })}
              </div>

              <aside className="hidden lg:block">
                <div className="sticky top-[140px] space-y-6">
                  {trendingPodcasts.length > 0 && (
                    <div className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-3 px-1">
                        <TrendingUp className="w-4 h-4 text-primary" />
                        <h3 className="text-[14px] font-bold text-foreground" data-testid="heading-trending">Most Subscribed</h3>
                      </div>
                      <div className="space-y-0.5">
                        {trendingPodcasts.slice(0, 8).map((podcast, i) => (
                          <PodcastCard key={podcast.slug} podcast={podcast} variant="trending" rank={i + 1} />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] border border-primary/[0.1] p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <h3 className="text-[14px] font-bold text-foreground">Can't decide?</h3>
                    </div>
                    <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
                      Subscribe and get AI-generated recaps of every episode, so you never miss the key takeaways.
                    </p>
                    <Link href="/get-started" data-testid="link-get-started-sidebar">
                      <span className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary text-primary-foreground text-[13px] font-semibold rounded-xl hover:bg-primary/90 transition-colors cursor-pointer">
                        Get started free
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </Link>
                  </div>
                </div>
              </aside>
            </div>
          </>
        )}

        {(isSearching || isFiltering) && filteredPodcasts.length === 0 && (
          <div className="text-center py-20">
            <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-lg font-semibold text-foreground mb-1" data-testid="text-no-results">No podcasts found</p>
            <p className="text-[14px] text-muted-foreground mb-4">
              {isSearching ? `Nothing matched "${searchQuery}". Try a different search.` : "Try a different filter."}
            </p>
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-2 px-4 py-2 text-[14px] font-semibold text-primary hover:bg-primary/[0.06] rounded-lg transition-colors"
              data-testid="button-clear-and-browse"
            >
              Clear and browse all
            </button>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}