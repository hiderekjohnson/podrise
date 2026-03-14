import { useState, useMemo, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Search, ArrowRight, Zap, Brain, Rocket, Lightbulb, TrendingUp, BarChart3, Wallet, Crown, Users, Megaphone, Handshake, Cpu, LineChart, Building2, Heart, Flame, ArrowUpCircle, Scale, GraduationCap, Palette, Video, Globe, Sparkles, GitFork, UserPlus, Cloud, GitBranch, Layout, Target, Cog, Bot, Coins, Leaf, Shield, Hammer, Briefcase, Activity, ChevronRight, ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { TOPICS, getCategoryPath } from "@/data/topicData";
import { SiteHeader } from "@/components/SiteHeader";

const ICON_MAP: Record<string, any> = {
  Brain, Rocket, Lightbulb, TrendingUp, BarChart3, Wallet, Crown, Users,
  Megaphone, Handshake, Zap, GitFork, Sparkles, Cpu, LineChart, Building2,
  Heart, Flame, ArrowUpCircle, Scale, GraduationCap, Palette, Video, Globe,
  UserPlus, Cloud, GitBranch, Layout, Target, Cog, Bot, Coins, Leaf, Shield, Hammer, Briefcase,
};

const CATEGORIES: { key: string; label: string; slugs: string[] }[] = [
  { key: "tech", label: "Tech & AI", slugs: ["ai", "technology", "robotics", "automation", "open-source", "defense-tech"] },
  { key: "business", label: "Business", slugs: ["entrepreneurship", "startups", "saas", "product-management", "product-market-fit", "bootstrapping", "side-hustles", "creator-economy"] },
  { key: "finance", label: "Finance & Investing", slugs: ["venture-capital", "investing", "personal-finance", "crypto-web3", "economics"] },
  { key: "leadership", label: "Leadership & Growth", slugs: ["leadership", "career-growth", "peak-performance", "productivity", "decision-making", "negotiation", "self-improvement"] },
  { key: "marketing", label: "Marketing & Sales", slugs: ["marketing", "sales"] },
  { key: "science", label: "Science & Health", slugs: ["health-longevity", "psychology", "climate-energy"] },
  { key: "culture", label: "Culture & Society", slugs: ["media-content", "geopolitics", "creativity", "future-of-work", "women-in-business", "young-entrepreneurs"] },
];

function SEOHead() {
  const title = "Topics - Podcast Intelligence by Topic | PodCap";
  const description = "Explore topics from top podcasts across AI, business, finance, technology, and more. Track what the world's smartest people are saying about the topics that matter.";

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
    setOrCreate('meta[property="og:image"]', "property", "https://podcap.io/og/og-topics.png");
    setOrCreate('meta[name="twitter:card"]', "name", "summary_large_image");
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

const TRENDING_SLUGS = ["ai", "venture-capital", "crypto-web3", "defense-tech", "robotics", "climate-energy"];

export default function TopicsDirectory() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
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

  const filteredTopics = useMemo(() => {
    let topics = TOPICS;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      topics = topics.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.podcastKeywords.some(kw => kw.toLowerCase().includes(q))
      );
    }
    if (activeCategory) {
      const cat = CATEGORIES.find(c => c.key === activeCategory);
      if (cat) {
        topics = topics.filter(t => cat.slugs.includes(t.slug));
      }
    }
    return topics;
  }, [searchQuery, activeCategory]);

  const trendingTopics = useMemo(() => {
    return TRENDING_SLUGS
      .map(slug => TOPICS.find(t => t.slug === slug))
      .filter(Boolean) as typeof TOPICS;
  }, []);

  const isSearching = searchQuery.trim().length > 0;
  const isFiltering = activeCategory !== null;
  const showCurated = !isSearching && !isFiltering;

  const handleCategoryClick = (key: string) => {
    setActiveCategory(prev => prev === key ? null : key);
    setSearchQuery("");
    const el = document.getElementById("topics-grid");
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 68 - 52 - 16;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead />
      <SiteHeader />

      <div className="bg-[#F7F7FC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            <h1 className="text-3xl sm:text-[2.75rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.03em] mb-3" data-testid="text-page-title">
              Explore Topics
            </h1>
            <p className="text-lg text-[#52525B] dark:text-[#A1A1AA] max-w-2xl mx-auto leading-relaxed" data-testid="text-page-description">
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
                onChange={e => { setSearchQuery(e.target.value); if (e.target.value) setActiveCategory(null); }}
                className="w-full pl-12 pr-4 py-3.5 text-[17px] bg-card border border-black/[0.1] dark:border-white/[0.1] rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all shadow-sm"
                data-testid="input-search-topics"
              />
              {searchQuery && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-mono text-muted-foreground/60">
                  {filteredTopics.length} result{filteredTopics.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <div ref={navRef} className="h-0" />
      <div className={`sticky top-[68px] z-30 bg-background/95 backdrop-blur-sm border-b transition-shadow ${isSticky ? "border-black/[0.06] dark:border-white/[0.06] shadow-sm" : "border-transparent"}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-1.5 py-2.5 overflow-x-auto scrollbar-hide" data-testid="category-nav">
            <button
              onClick={() => { setActiveCategory(null); setSearchQuery(""); }}
              className={`px-3.5 py-2 rounded-lg text-[14px] font-semibold whitespace-nowrap transition-all ${
                !activeCategory
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
              }`}
              data-testid="category-all"
            >
              All Topics
            </button>
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => handleCategoryClick(cat.key)}
                className={`px-3.5 py-2 rounded-lg text-[14px] font-semibold whitespace-nowrap transition-all ${
                  activeCategory === cat.key
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                }`}
                data-testid={`category-${cat.key}`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pb-20 pt-6">
        {showCurated && (
          <>
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="mb-12"
            >
              <div className="flex items-center gap-2 mb-5">
                <TrendingUp className="w-4 h-4 text-[#6366F1]" />
                <h2 className="text-[15px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-trending">Trending Now</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {trendingTopics.map((topic, i) => {
                  const Icon = ICON_MAP[topic.icon] || Sparkles;
                  return (
                    <motion.div
                      key={topic.slug}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.04 }}
                    >
                      <Link href={`${getCategoryPath(topic.category)}/${topic.slug}`} data-testid={`card-trending-${topic.slug}`}>
                        <div className="group relative bg-card border border-black/[0.08] dark:border-white/[0.08] rounded-xl p-5 hover:border-[#6366F1]/30 hover:shadow-md transition-all cursor-pointer overflow-hidden">
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
                                  <span className="text-[14px] font-mono text-[#6366F1] text-[#6366F1] flex items-center gap-1">
                                    <TrendingUp className="w-3 h-3" />
                                    Rising
                                  </span>
                                </div>
                              </div>
                              <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] line-clamp-2 leading-relaxed">{topic.description}</p>
                            </div>
                            <MiniTrendLine seed={i * 7 + 3} rising={true} />
                          </div>
                          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-black/[0.04] dark:border-white/[0.04]">
                            <span className="ml-auto text-[14px] font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
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
          </>
        )}

        <div id="topics-grid">
          <div className="flex items-center gap-2 mb-5">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="text-[15px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-all-topics">
              {isSearching ? "Search Results" : isFiltering ? CATEGORIES.find(c => c.key === activeCategory)?.label || "Topics" : "All Topics"}
            </h2>
            {(isSearching || isFiltering) && (
              <span className="text-[14px] font-mono text-muted-foreground/60 ml-1">
                {filteredTopics.length} topic{filteredTopics.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {filteredTopics.map((topic, i) => {
              const Icon = ICON_MAP[topic.icon] || Sparkles;

              return (
                <motion.div
                  key={topic.slug}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.4) }}
                >
                  <Link href={`${getCategoryPath(topic.category)}/${topic.slug}`} data-testid={`card-topic-${topic.slug}`}>
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
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/20 group-hover:text-primary transition-colors flex-shrink-0" />
                      </div>
                      <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] line-clamp-2 leading-relaxed">
                        {topic.description}
                      </p>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
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
                    <span className="text-[14px] font-semibold uppercase tracking-[0.15em] text-primary">Enterprise Intelligence</span>
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
