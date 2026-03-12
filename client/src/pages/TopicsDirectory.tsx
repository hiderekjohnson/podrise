import { useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { Search, ArrowRight, Zap, Brain, Rocket, Lightbulb, TrendingUp, BarChart3, Wallet, Crown, Users, Megaphone, Handshake, Cpu, LineChart, Building2, Heart, Flame, ArrowUpCircle, Scale, GraduationCap, Palette, Video, Globe, Sparkles, GitFork, UserPlus, Cloud, GitBranch, Layout, Target, Cog, Bot, Coins, Leaf, Shield, Hammer, Briefcase, Activity, Radio, ChevronRight, Podcast, ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { TOPICS } from "@/data/topicData";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { SiteHeader } from "@/components/SiteHeader";
import { matchesKeywords } from "@/data/topicData";

const ICON_MAP: Record<string, any> = {
  Brain, Rocket, Lightbulb, TrendingUp, BarChart3, Wallet, Crown, Users,
  Megaphone, Handshake, Zap, GitFork, Sparkles, Cpu, LineChart, Building2,
  Heart, Flame, ArrowUpCircle, Scale, GraduationCap, Palette, Video, Globe,
  UserPlus, Cloud, GitBranch, Layout, Target, Cog, Bot, Coins, Leaf, Shield, Hammer, Briefcase,
};

function getTopicSourceCount(topic: typeof TOPICS[0]): number {
  return PODCAST_LANDINGS.filter(p => {
    const text = `${p.category} ${p.keywords} ${p.description}`;
    return matchesKeywords(text, topic.podcastKeywords);
  }).length;
}

const TRENDING_SLUGS = ["ai", "venture-capital", "crypto-web3", "defense-tech", "robotics", "climate-energy"];
const FEATURED_SLUGS = ["entrepreneurship", "investing", "leadership", "saas", "personal-finance", "marketing"];

function SEOHead() {
  const title = "Insights - Podcast Intelligence by Topic | PodCap";
  const description = "Explore structured insights from top podcasts across AI, business, finance, technology, and more. Track what the world's smartest people are saying about the topics that matter.";

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

function MiniTrendLine({ seed, rising }: { seed: number; rising: boolean }) {
  const points = useMemo(() => {
    const pts: number[] = [];
    let val = 30 + (seed % 20);
    for (let i = 0; i < 12; i++) {
      val += rising ? (Math.sin(seed + i) * 5 + 3) : (Math.sin(seed + i) * 8 - 1);
      val = Math.max(5, Math.min(55, val));
      pts.push(val);
    }
    return pts;
  }, [seed, rising]);

  const pathD = points.map((y, i) => `${i === 0 ? "M" : "L"} ${i * 8} ${60 - y}`).join(" ");

  return (
    <svg width="88" height="60" viewBox="0 0 88 60" className="flex-shrink-0">
      <defs>
        <linearGradient id={`tg-${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={rising ? "rgb(16, 185, 129)" : "rgb(156, 163, 175)"} stopOpacity="0.3" />
          <stop offset="100%" stopColor={rising ? "rgb(16, 185, 129)" : "rgb(156, 163, 175)"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${pathD} L 88 60 L 0 60 Z`}
        fill={`url(#tg-${seed})`}
      />
      <path
        d={pathD}
        fill="none"
        stroke={rising ? "rgb(16, 185, 129)" : "rgb(156, 163, 175)"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function TopicsDirectory() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const topicMetrics = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of TOPICS) {
      map.set(t.slug, getTopicSourceCount(t));
    }
    return map;
  }, []);

  const filteredTopics = useMemo(() => {
    if (!searchQuery.trim()) return TOPICS;
    const q = searchQuery.toLowerCase().trim();
    return TOPICS.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.podcastKeywords.some(kw => kw.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const trendingTopics = useMemo(() => {
    return TRENDING_SLUGS
      .map(slug => TOPICS.find(t => t.slug === slug))
      .filter(Boolean) as typeof TOPICS;
  }, []);

  const featuredTopics = useMemo(() => {
    return FEATURED_SLUGS
      .map(slug => TOPICS.find(t => t.slug === slug))
      .filter(Boolean) as typeof TOPICS;
  }, []);

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
              Explore Insights
            </h1>
            <p className="text-lg text-[#3F3F46] dark:text-[#A1A1AA] max-w-2xl mx-auto leading-relaxed" data-testid="text-page-description">
              See what the world's top podcasts are saying about the topics that matter to you.
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
                placeholder="Search a topic or keyword..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 text-[17px] bg-card border border-black/[0.1] dark:border-white/[0.1] rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all shadow-sm"
                data-testid="input-search-topics"
              />
              {searchQuery && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-mono text-muted-foreground/60">
                  {filteredTopics.length} result{filteredTopics.length !== 1 ? "s" : ""}
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
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <h2 className="text-[15px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-trending">Trending Now</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {trendingTopics.map((topic, i) => {
                  const Icon = ICON_MAP[topic.icon] || Sparkles;
                  const sourceCount = topicMetrics.get(topic.slug) || 0;
                  return (
                    <motion.div
                      key={topic.slug}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.04 }}
                    >
                      <Link href={`/insights/${topic.slug}`} data-testid={`card-trending-${topic.slug}`}>
                        <div className="group relative bg-card border border-black/[0.08] dark:border-white/[0.08] rounded-xl p-5 hover:border-emerald-500/30 hover:shadow-md transition-all cursor-pointer overflow-hidden">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2.5 mb-2">
                                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${topic.color} flex items-center justify-center flex-shrink-0`}>
                                  <Icon className="w-4.5 h-4.5 text-white" />
                                </div>
                                <div>
                                  <h3 className="text-[17px] font-display font-bold text-foreground group-hover:text-primary transition-colors">
                                    {topic.name}
                                  </h3>
                                  <span className="text-[13px] font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                    <TrendingUp className="w-3 h-3" />
                                    Rising
                                  </span>
                                </div>
                              </div>
                              <p className="text-[14px] text-[#3F3F46] dark:text-[#A1A1AA] line-clamp-2 leading-relaxed">{topic.description}</p>
                            </div>
                            <MiniTrendLine seed={i * 7 + 3} rising={true} />
                          </div>
                          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-black/[0.04] dark:border-white/[0.04]">
                            <span className="ml-auto text-[13px] font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
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

            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="mb-12"
            >
              <div className="flex items-center gap-2 mb-5">
                <Zap className="w-4 h-4 text-amber-500" />
                <h2 className="text-[15px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-featured">Popular Topics</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {featuredTopics.map((topic, i) => {
                  const Icon = ICON_MAP[topic.icon] || Sparkles;
                  const sourceCount = topicMetrics.get(topic.slug) || 0;
                  return (
                    <motion.div
                      key={topic.slug}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.04 }}
                    >
                      <Link href={`/insights/${topic.slug}`} data-testid={`card-featured-${topic.slug}`}>
                        <div className="group relative bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-5 hover:border-primary/20 hover:shadow-md transition-all cursor-pointer">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${topic.color} flex items-center justify-center`}>
                                <Icon className="w-4.5 h-4.5 text-white" />
                              </div>
                              <h3 className="text-[17px] font-display font-bold text-foreground group-hover:text-primary transition-colors">
                                {topic.name}
                              </h3>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                          </div>
                          <p className="text-[14px] text-[#3F3F46] dark:text-[#A1A1AA] line-clamp-2 mb-3 leading-relaxed">{topic.description}</p>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </motion.section>
          </>
        )}

        <div className="flex items-center gap-2 mb-5">
          <Activity className="w-4 h-4 text-primary" />
          <h2 className="text-[15px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-all-topics">
            {isSearching ? "Search Results" : "All Topics"}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {filteredTopics.map((topic, i) => {
            const Icon = ICON_MAP[topic.icon] || Sparkles;
            const sourceCount = topicMetrics.get(topic.slug) || 0;

            return (
              <motion.div
                key={topic.slug}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.4) }}
              >
                <Link href={`/insights/${topic.slug}`} data-testid={`card-topic-${topic.slug}`}>
                  <div className="group relative bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-4 hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer h-full">
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${topic.color} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors truncate" data-testid={`text-topic-name-${topic.slug}`}>
                          {topic.name}
                        </h3>
                      </div>
                    </div>
                    <p className="text-[14px] text-[#3F3F46] dark:text-[#A1A1AA] line-clamp-2 mb-2.5 leading-relaxed">
                      {topic.description}
                    </p>
                    <div className="flex items-center gap-3 text-[13px] font-mono text-muted-foreground/70">
                      <span className="flex items-center gap-1">
                        <Podcast className="w-3 h-3" />
                        {sourceCount}
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {filteredTopics.length === 0 && (
          <div className="text-center py-20">
            <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground" data-testid="text-no-results">No topics match your search</p>
          </div>
        )}

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-16"
        >
          <div className="rounded-xl bg-foreground text-background overflow-hidden">
            <div className="px-8 py-10 sm:py-12">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 sm:gap-10">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 className="w-4 h-4 text-primary" />
                    <span className="text-[13px] font-semibold uppercase tracking-[0.15em] text-primary">Enterprise Intelligence</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-display font-bold text-white mb-2">
                    Custom intelligence for your organization
                  </h3>
                  <p className="text-[15px] text-white/60 leading-relaxed max-w-xl">
                    We build custom monitoring dashboards for enterprise teams - structured data, automated synthesis, and real-time alerts on the topics your organization tracks.
                  </p>
                </div>
                <Link href="/enterprise" data-testid="link-enterprise-cta">
                  <span className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-base font-semibold hover:bg-primary/90 transition-colors cursor-pointer whitespace-nowrap">
                    Request Access
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </motion.section>
      </main>

      <Footer />
    </div>
  );
}
