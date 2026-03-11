import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search, Mic, ArrowUpRight, Sparkles, Cpu, TrendingUp, Briefcase, Heart, Globe, BookOpen, DollarSign, Lightbulb, Megaphone } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { SiteHeader } from "@/components/SiteHeader";

interface PodcastStat {
  slug: string;
  podcastName: string;
  episodeCount: number;
  latestEpisode: string;
  firstEpisode: string;
}

interface DiscoveryData {
  recentEpisodes: unknown[];
  podcastStats: PodcastStat[];
}

const DISCOVER_CATEGORIES = [
  { key: "all", label: "All", icon: Sparkles },
  { key: "tech", label: "Tech & AI", icon: Cpu },
  { key: "business", label: "Business", icon: Briefcase },
  { key: "finance", label: "Finance", icon: DollarSign },
  { key: "news", label: "News & Politics", icon: Globe },
  { key: "health", label: "Health & Science", icon: Heart },
  { key: "self-improvement", label: "Self-Improvement", icon: Lightbulb },
  { key: "marketing", label: "Marketing", icon: Megaphone },
  { key: "culture", label: "Culture & Education", icon: BookOpen },
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

function getPodcastArtwork(slug: string): string {
  const landing = PODCAST_LANDINGS.find(p => p.slug === slug);
  return landing?.artworkUrl || "";
}

const STAFF_PICKS_SLUGS = [
  "allin",
  "lexfridman",
  "hubermanlab",
  "investlikethebest",
  "acquiringminds",
  "no-priors",
  "pivot",
  "twentyminutevc",
  "ai-breakdown",
  "ezraklein",
  "howibuiltthis",
  "oddlots",
];

const INITIAL_PODCAST_COUNT = 20;

export default function PodcastsExplorer() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("all");
  const [showAllPodcasts, setShowAllPodcasts] = useState(false);

  const { data: discoveryData, isLoading } = useQuery<DiscoveryData>({
    queryKey: ["/api/podcasts-discovery"],
  });

  const staffPicks = useMemo(() => {
    return STAFF_PICKS_SLUGS
      .map(slug => PODCAST_LANDINGS.find(p => p.slug === slug))
      .filter(Boolean) as typeof PODCAST_LANDINGS;
  }, []);

  const filteredPodcasts = useMemo(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return PODCAST_LANDINGS.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.hosts.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q)
      );
    }

    if (activeCategory === "all") return PODCAST_LANDINGS;

    return PODCAST_LANDINGS.filter(p => categoryBucket(p.category) === activeCategory);
  }, [searchQuery, activeCategory]);

  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="min-h-screen bg-background">
      <SEOHead />
      <SiteHeader />

      <div className="bg-gradient-to-b from-primary/[0.04] via-background to-background">
        <div className="max-w-5xl mx-auto px-6 pt-12 pb-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            <h1 className="text-3xl sm:text-[2.75rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.03em] mb-3" data-testid="text-page-title">
              Podcast Discovery
            </h1>
            <p className="text-lg text-[#3F3F46] dark:text-[#A1A1AA] max-w-2xl mx-auto leading-relaxed" data-testid="text-page-description">
              Find your next favorite podcast. Browse by topic, explore our picks, or search for exactly what you're looking for.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="max-w-2xl mx-auto"
          >
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/40" />
              <input
                type="text"
                placeholder="Search by podcast name, host, or topic..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 text-[17px] bg-card border border-black/[0.1] dark:border-white/[0.1] rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all shadow-sm"
                data-testid="input-search-podcasts"
              />
              {searchQuery && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-mono text-muted-foreground/60">
                  {filteredPodcasts.length} result{filteredPodcasts.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 pb-20">
        {!isSearching && (
          <>
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="mb-12"
            >
              <div className="flex items-center gap-2 mb-5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h2 className="text-[15px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-staff-picks">Editor's Picks</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                {staffPicks.map((podcast, i) => (
                  <motion.div
                    key={podcast.slug}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.03 }}
                  >
                    <Link href={`/podcasts/${podcast.slug}`} data-testid={`card-pick-${podcast.slug}`}>
                      <div className="group relative bg-card border border-black/[0.08] dark:border-white/[0.08] rounded-xl p-4 hover:border-amber-500/30 hover:shadow-md transition-all cursor-pointer text-center h-full flex flex-col items-center">
                        {podcast.artworkUrl && (
                          <img
                            src={podcast.artworkUrl}
                            alt={podcast.name}
                            className="w-16 h-16 rounded-xl object-cover mb-3 shadow-sm group-hover:shadow-md transition-shadow"
                          />
                        )}
                        <h3 className="text-[14px] font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug mb-1">
                          {podcast.name}
                        </h3>
                        <p className="text-[13px] text-muted-foreground/60 truncate w-full">{podcast.hosts}</p>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          </>
        )}

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mb-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Mic className="w-4 h-4 text-primary" />
            <h2 className="text-[15px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-browse">
              {isSearching ? "Search Results" : "Browse by Topic"}
            </h2>
          </div>

          {!isSearching && (
            <div className="flex flex-wrap gap-2 mb-5" data-testid="category-filters">
              {DISCOVER_CATEGORIES.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => { setActiveCategory(key); setShowAllPodcasts(false); }}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-medium transition-all border ${
                    activeCategory === key
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
                  }`}
                  data-testid={`filter-${key}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {(isSearching || showAllPodcasts ? filteredPodcasts : filteredPodcasts.slice(0, INITIAL_PODCAST_COUNT)).map((podcast, i) => {
            const stat = discoveryData?.podcastStats.find(s => s.slug === podcast.slug);

            return (
              <motion.div
                key={podcast.slug}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.015, 0.4) }}
              >
                <Link href={`/podcasts/${podcast.slug}`} data-testid={`card-podcast-${podcast.slug}`}>
                  <div className="group relative bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-4 hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer h-full">
                    <div className="flex items-center gap-3 mb-2.5">
                      {podcast.artworkUrl && (
                        <img
                          src={podcast.artworkUrl}
                          alt={podcast.name}
                          className="w-10 h-10 rounded-lg flex-shrink-0 object-cover"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors truncate" data-testid={`text-podcast-name-${podcast.slug}`}>
                          {podcast.name}
                        </h3>
                        <p className="text-[13px] text-muted-foreground/70 truncate">{podcast.hosts}</p>
                      </div>
                    </div>
                    <p className="text-[13px] text-[#3F3F46] dark:text-[#A1A1AA] line-clamp-2 mb-2.5 leading-relaxed capitalize">
                      {podcast.description}
                    </p>
                    <div className="flex items-center gap-3 text-[13px] font-mono text-muted-foreground/70">
                      {stat && (
                        <span className="flex items-center gap-1">
                          <Mic className="w-3 h-3" />
                          {stat.episodeCount} ep{stat.episodeCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      <span className="text-muted-foreground/50 truncate">{podcast.category}</span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {!isSearching && !showAllPodcasts && filteredPodcasts.length > INITIAL_PODCAST_COUNT && (
          <div className="text-center py-8">
            <button
              onClick={() => setShowAllPodcasts(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary/[0.06] hover:bg-primary/[0.12] text-primary text-[15px] font-bold transition-colors"
              data-testid="button-show-more-podcasts"
            >
              Show all podcasts
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {filteredPodcasts.length === 0 && (
          <div className="text-center py-20">
            <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground" data-testid="text-no-results">No podcasts match your search</p>
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
