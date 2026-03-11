import { useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { Search, ArrowRight, Zap, Brain, Rocket, Lightbulb, TrendingUp, BarChart3, Wallet, Crown, Users, Megaphone, Handshake, Cpu, LineChart, Building2, Heart, Flame, ArrowUpCircle, Scale, GraduationCap, Palette, Video, Globe, Sparkles, GitFork, UserPlus, Cloud, GitBranch, Layout, Target, Cog, Bot, Coins, Leaf, Shield, Hammer, Briefcase, Activity, Radio, ChevronRight, Podcast } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Footer } from "@/components/Footer";
import { TOPICS } from "@/data/topicData";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { PodCapWordmark } from "@/components/PodCapHeader";
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

const FEATURED_SLUGS = ["ai", "venture-capital", "entrepreneurship", "investing", "leadership", "saas"];

function SEOHead() {
  const title = "Podcast Intelligence - Real-Time Topic Monitoring | PodCap";
  const description = "Enterprise-grade podcast intelligence. We monitor, analyze, and synthesize insights from top podcasts across critical topics - so your team never misses what's being said. Built for analysts, strategists, and decision-makers.";

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

export default function TopicsDirectory() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();
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

  const featuredTopics = useMemo(() => {
    return FEATURED_SLUGS
      .map(slug => TOPICS.find(t => t.slug === slug))
      .filter(Boolean) as typeof TOPICS;
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead />

      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-black/[0.06] dark:border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2" data-testid="link-home">
            <PodCapWordmark />
          </Link>
          <div className="flex items-center gap-3">
            {!user && (
              <button
                onClick={() => navigate("/get-started")}
                className="px-4 py-2 rounded-full text-base font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                data-testid="button-build-recap"
              >
                Build Your Recap
              </button>
            )}
            <button
              onClick={() => navigate(user ? "/dashboard" : "/login")}
              className="px-4 py-2 rounded-full text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity"
              data-testid="button-login"
            >
              {user ? "Dashboard" : "Log In"}
            </button>
          </div>
        </div>
      </header>

      <div className="border-b border-black/[0.06] dark:border-white/[0.06] bg-muted/30">
        <div className="max-w-7xl mx-auto px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-6 text-[13px] font-mono tracking-wide text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="uppercase font-semibold text-emerald-600 dark:text-emerald-400">Live</span>
            </span>
            <span className="hidden sm:inline" data-testid="metric-sources">
              Continuous monitoring
            </span>
          </div>
          <span className="text-[12px] font-mono text-muted-foreground/60 hidden sm:inline">
            {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 pt-10 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-[13px] font-semibold uppercase tracking-[0.15em] text-primary" data-testid="text-section-label">Podcast Intelligence</span>
          </div>
          <h1 className="text-3xl sm:text-[2.5rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.02em] mb-4" data-testid="text-page-title">
            Topic Intelligence Dashboard
          </h1>
          <p className="text-lg text-[#3F3F46] dark:text-[#A1A1AA] max-w-3xl leading-relaxed" data-testid="text-page-description">
            We monitor podcast sources and synthesize what's being said across critical topics - delivering structured intelligence for analysts, strategists, and decision-makers who can't afford to miss what matters.
          </p>
        </motion.div>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mb-12"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.15em] text-foreground">High-Signal Topics</h2>
            </div>
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
                  <Link href={`/topics/${topic.slug}`} data-testid={`card-featured-${topic.slug}`}>
                    <div className="group relative bg-card border border-black/[0.08] dark:border-white/[0.08] rounded-xl p-5 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer">
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
                      <p className="text-[15px] text-[#3F3F46] dark:text-[#A1A1AA] line-clamp-2 mb-3">{topic.description}</p>
                      <div className="flex items-center gap-4 pt-3 border-t border-black/[0.04] dark:border-white/[0.04]">
                        <span className="text-[12px] font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <Radio className="w-3 h-3" />
                          Monitoring
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </motion.section>

        <div className="mb-6 flex items-center gap-4">
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <input
              type="text"
              placeholder="Search topics, keywords, industries..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-base bg-muted/40 border border-black/[0.08] dark:border-white/[0.08] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-sans"
              data-testid="input-search-topics"
            />
          </div>
          <span className="text-[13px] font-mono text-muted-foreground hidden sm:inline">
            {searchQuery ? `${filteredTopics.length} results` : "All topics"}
          </span>
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
                <Link href={`/topics/${topic.slug}`} data-testid={`card-topic-${topic.slug}`}>
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
                    <div className="flex items-center gap-3 text-[12px] font-mono text-muted-foreground/70">
                      <span className="flex items-center gap-1">
                        <Podcast className="w-3 h-3" />
                        {sourceCount}
                      </span>
                      <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/30" />
                      <span className="flex items-center gap-1 text-emerald-600/70 dark:text-emerald-400/70">
                        <span className="w-1 h-1 rounded-full bg-emerald-500" />
                        Monitoring
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
                    We build custom monitoring dashboards for enterprise teams - structured data, automated synthesis, and real-time alerts on the topics your organization tracks. Used by research teams, strategy groups, and competitive intelligence units.
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
