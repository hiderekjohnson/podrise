import { useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search, TrendingUp, Zap, Clock, Headphones, ArrowUpRight, ChevronRight, Podcast, BarChart3, Flame, Radio, Sparkles, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { SiteHeader } from "@/components/SiteHeader";

interface RecentEpisode {
  slug: string;
  episodeSlug: string;
  episodeTitle: string;
  podcastName: string;
  publishDate: string;
  artworkUrl: string;
  tldl: string;
  hosts: string;
}

interface PodcastStat {
  slug: string;
  podcastName: string;
  episodeCount: number;
  latestEpisode: string;
  firstEpisode: string;
}

interface DiscoveryData {
  recentEpisodes: RecentEpisode[];
  podcastStats: PodcastStat[];
}

function SEOHead() {
  const title = "Podcasts - Discover What's Trending | PodCap";
  const description = "Search and explore podcasts tracked by PodCap. See what just dropped, find trending shows, and dive into detailed episode intelligence for your favorite podcasts.";

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

function MiniActivityChart({ episodeCount, maxCount }: { episodeCount: number; maxCount: number }) {
  const barCount = 8;
  const ratio = episodeCount / maxCount;
  const bars = useMemo(() => {
    const result: number[] = [];
    for (let i = 0; i < barCount; i++) {
      const base = ratio * 0.4;
      const wave = Math.sin((i / barCount) * Math.PI) * ratio * 0.6;
      const jitter = Math.sin(episodeCount * 3 + i * 7) * 0.08;
      result.push(Math.max(0.08, Math.min(1, base + wave + jitter)));
    }
    return result;
  }, [episodeCount, ratio]);

  return (
    <div className="flex items-end gap-[3px] h-[32px]">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-[4px] rounded-full bg-primary/40"
          style={{ height: `${h * 100}%` }}
        />
      ))}
    </div>
  );
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getPodcastArtwork(slug: string, fallbackUrl?: string): string {
  const landing = PODCAST_LANDINGS.find(p => p.slug === slug);
  if (landing?.artworkUrl) return landing.artworkUrl;
  if (fallbackUrl) return fallbackUrl;
  return "";
}

function getPodcastCategory(slug: string): string | null {
  const landing = PODCAST_LANDINGS.find(p => p.slug === slug);
  return landing?.category || null;
}

export default function PodcastsExplorer() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: discoveryData, isLoading } = useQuery<DiscoveryData>({
    queryKey: ["/api/podcasts-discovery"],
  });

  const filteredPodcasts = useMemo(() => {
    if (!searchQuery.trim()) return PODCAST_LANDINGS;
    const q = searchQuery.toLowerCase().trim();
    return PODCAST_LANDINGS.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.hosts.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.slug.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const hotShows = useMemo(() => {
    if (!discoveryData?.podcastStats) return [];
    return discoveryData.podcastStats
      .filter(s => {
        const days = Math.floor((Date.now() - new Date(s.latestEpisode + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24));
        return days <= 7;
      })
      .slice(0, 6);
  }, [discoveryData]);

  const justDropped = useMemo(() => {
    if (!discoveryData?.recentEpisodes) return [];
    return discoveryData.recentEpisodes.slice(0, 8);
  }, [discoveryData]);

  const maxEpisodeCount = useMemo(() => {
    if (!discoveryData?.podcastStats) return 1;
    return Math.max(...discoveryData.podcastStats.map(s => s.episodeCount), 1);
  }, [discoveryData]);

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
              Podcast Intelligence
            </h1>
            <p className="text-lg text-[#3F3F46] dark:text-[#A1A1AA] max-w-2xl mx-auto leading-relaxed" data-testid="text-page-description">
              Search any podcast, see what just dropped, and explore trending shows across our network.
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
                placeholder="Search podcasts by name, host, or topic..."
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
            {justDropped.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="mb-12"
              >
                <div className="flex items-center gap-2 mb-5">
                  <Clock className="w-4 h-4 text-blue-500" />
                  <h2 className="text-[15px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-just-dropped">Just Dropped</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {justDropped.map((ep, i) => {
                    const artwork = getPodcastArtwork(ep.slug, ep.artworkUrl);
                    return (
                      <motion.div
                        key={`${ep.slug}-${ep.episodeSlug}`}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.04 }}
                      >
                        <Link href={`/podcasts/${ep.slug}/${ep.episodeSlug}`} data-testid={`card-recent-${ep.slug}-${i}`}>
                          <div className="group relative bg-card border border-black/[0.08] dark:border-white/[0.08] rounded-xl p-4 hover:border-blue-500/30 hover:shadow-md transition-all cursor-pointer h-full">
                            <div className="flex items-start gap-3 mb-3">
                              {artwork && (
                                <img
                                  src={artwork}
                                  alt={ep.podcastName}
                                  className="w-10 h-10 rounded-lg flex-shrink-0 object-cover"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <span className="text-[12px] font-mono text-blue-600 dark:text-blue-400 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatRelativeDate(ep.publishDate)}
                                </span>
                                <p className="text-[13px] text-muted-foreground/70 truncate mt-0.5">{ep.podcastName}</p>
                              </div>
                            </div>
                            <h3 className="text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug mb-2">
                              {ep.episodeTitle}
                            </h3>
                            {ep.tldl && (
                              <p className="text-[13px] text-[#3F3F46] dark:text-[#A1A1AA] line-clamp-2 leading-relaxed">{ep.tldl}</p>
                            )}
                            <span className="mt-3 text-[12px] font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                              Read recap <ArrowUpRight className="w-3 h-3" />
                            </span>
                          </div>
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.section>
            )}

            {hotShows.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="mb-12"
              >
                <div className="flex items-center gap-2 mb-5">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <h2 className="text-[15px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-hot-shows">Hot Right Now</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {hotShows.map((show, i) => {
                    const landing = PODCAST_LANDINGS.find(p => p.slug === show.slug);
                    const artwork = landing?.artworkUrl || "";
                    const hosts = landing?.hosts || "";
                    const category = landing?.category || "";

                    return (
                      <motion.div
                        key={show.slug}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.04 }}
                      >
                        <Link href={`/podcasts/${show.slug}`} data-testid={`card-hot-${show.slug}`}>
                          <div className="group relative bg-card border border-black/[0.08] dark:border-white/[0.08] rounded-xl p-5 hover:border-orange-500/30 hover:shadow-md transition-all cursor-pointer">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                {artwork && (
                                  <img
                                    src={artwork}
                                    alt={show.podcastName}
                                    className="w-12 h-12 rounded-lg flex-shrink-0 object-cover"
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-[17px] font-display font-bold text-foreground group-hover:text-primary transition-colors truncate">
                                    {show.podcastName}
                                  </h3>
                                  {hosts && (
                                    <p className="text-[13px] text-muted-foreground/70 truncate mt-0.5">{hosts}</p>
                                  )}
                                  <span className="text-[12px] font-mono text-orange-600 dark:text-orange-400 flex items-center gap-1 mt-1">
                                    <TrendingUp className="w-3 h-3" />
                                    Active
                                  </span>
                                </div>
                              </div>
                              <MiniActivityChart episodeCount={show.episodeCount} maxCount={maxEpisodeCount} />
                            </div>
                            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-black/[0.04] dark:border-white/[0.04]">
                              <span className="text-[12px] font-mono text-muted-foreground/70 flex items-center gap-1">
                                <Headphones className="w-3 h-3" />
                                {show.episodeCount} episodes
                              </span>
                              {category && (
                                <span className="text-[12px] font-mono text-muted-foreground/50">{category}</span>
                              )}
                              <span className="ml-auto text-[12px] font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                Explore <ArrowUpRight className="w-3 h-3" />
                              </span>
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.section>
            )}
          </>
        )}

        <div className="flex items-center gap-2 mb-5">
          <Radio className="w-4 h-4 text-primary" />
          <h2 className="text-[15px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-all-podcasts">
            {isSearching ? "Search Results" : "All Podcasts"}
          </h2>
          <span className="text-[13px] font-mono text-muted-foreground/60 ml-2">
            {filteredPodcasts.length}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {filteredPodcasts.map((podcast, i) => {
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
                    <div className="flex items-center gap-3 text-[12px] font-mono text-muted-foreground/70">
                      {stat && (
                        <span className="flex items-center gap-1">
                          <Headphones className="w-3 h-3" />
                          {stat.episodeCount}
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
