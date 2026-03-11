import { useMemo } from "react";
import { useLocation, Link, useParams } from "wouter";
import { ArrowLeft, ArrowRight, Brain, Rocket, Lightbulb, TrendingUp, BarChart3, Wallet, Crown, Megaphone, Handshake, Zap, Cpu, LineChart, Heart, Flame, ArrowUpCircle, Scale, GraduationCap, Palette, Video, Globe, Sparkles, GitFork, Mic, MessageSquare, Users, Building2, Calendar, Quote, Activity, ArrowUpRight, Tag, UserPlus, Cloud, GitBranch, Layout, Target, Cog, Bot, Coins, Leaf, Shield, Hammer, Briefcase, Radio, Podcast, ChevronRight, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Footer } from "@/components/Footer";
import { TOPICS, matchesKeywords } from "@/data/topicData";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { PEOPLE_DIRECTORY, COMPANIES_DIRECTORY } from "@/data/entityDirectoryData";
import { SiteHeader } from "@/components/SiteHeader";
import { LinkedHosts } from "@/components/LinkedHosts";
import { TOPIC_TO_TOPICS_PAGE_MAP, PODCAST_CATEGORIES, getPodcastsForTopic } from "@/data/podcastCategoryData";

const ICON_MAP: Record<string, any> = {
  Brain, Rocket, Lightbulb, TrendingUp, BarChart3, Wallet, Crown, Users: Users,
  Megaphone, Handshake, Zap, GitFork, Sparkles, Cpu, LineChart, Building2,
  Heart, Flame, ArrowUpCircle, Scale, GraduationCap, Palette, Video, Globe,
  UserPlus, Cloud, GitBranch, Layout, Target, Cog, Bot, Coins, Leaf, Shield, Hammer, Briefcase,
};

interface PersonSummary {
  slug: string;
  name: string;
  title: string;
  mentionCount: number;
  guestCount: number;
  gender: string;
  category: string;
}

interface TopicEpisode {
  slug: string;
  episode_slug: string;
  podcast_name: string;
  episode_title: string;
  publish_date: string;
  artwork_url: string;
  tldl: string;
  what_happened: string;
  key_insights: string[] | string;
  key_topics?: string[];
  guests?: any;
}

function SEOHead({ name, description }: { name: string; description: string }) {
  const title = `${name} Intelligence Brief - Podcast Signal Monitoring | PodCap`;
  const desc = `${name} intelligence brief: synthesized insights, key signals, and trend analysis from monitored podcast sources. Built for analysts, strategists, and enterprise decision-makers.`;

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
    setOrCreate('meta[name="description"]', "name", desc);
    setOrCreate('meta[property="og:title"]', "property", title);
    setOrCreate('meta[property="og:description"]', "property", desc);
  }
  return null;
}

function extractQuotes(episodes: TopicEpisode[]): { quote: string; source: string; podcast: string; date: string }[] {
  const quotes: { quote: string; source: string; podcast: string; date: string }[] = [];
  for (const ep of episodes) {
    const text = ep.what_happened || "";
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.length > 40 && s.length < 200);
    if (sentences.length > 0) {
      const best = sentences.reduce((a, b) => b.length > a.length ? b : a, sentences[0]);
      quotes.push({ quote: best, source: ep.episode_title, podcast: ep.podcast_name, date: ep.publish_date });
    }
    if (quotes.length >= 3) break;
  }
  return quotes;
}

function extractInsights(episodes: TopicEpisode[]): string[] {
  const insights: string[] = [];
  for (const ep of episodes) {
    let ki = ep.key_insights;
    if (typeof ki === "string") {
      try { ki = JSON.parse(ki); } catch { ki = []; }
    }
    if (Array.isArray(ki)) {
      for (const insight of ki) {
        if (typeof insight === "string" && insight.length > 20 && insights.length < 6) {
          insights.push(insight);
        }
      }
    }
  }
  return insights;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatRelativeDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return formatDate(dateStr);
}

export default function TopicDetailPage() {
  const params = useParams<{ slug: string }>();
  const [, navigate] = useLocation();

  const topic = TOPICS.find(t => t.slug === params.slug);
  const isDynamic = !topic;
  const dynamicTopicName = isDynamic
    ? (params.slug || "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "";

  const { data: peopleData } = useQuery<PersonSummary[]>({
    queryKey: ["/api/entities/people"],
    enabled: !isDynamic,
  });

  const { data: topicEpisodes, isLoading: episodesLoading } = useQuery<TopicEpisode[]>({
    queryKey: ["/api/topics", params.slug, "episodes"],
    queryFn: async () => {
      const res = await fetch(`/api/topics/${params.slug}/episodes`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!params.slug,
  });

  const relatedPodcasts = useMemo(() => {
    if (!topic) return [];
    return PODCAST_LANDINGS.filter(p => {
      const text = `${p.category} ${p.keywords} ${p.description}`;
      return matchesKeywords(text, topic.podcastKeywords);
    }).slice(0, 12);
  }, [topic]);

  const relatedPeopleStatic = useMemo(() => {
    if (!topic) return [];
    return PEOPLE_DIRECTORY
      .filter(p => topic.peopleCategories.includes(p.category))
      .slice(0, 12);
  }, [topic]);

  const relatedPeople = useMemo(() => {
    if (!topic) return [];
    if (!peopleData) {
      return relatedPeopleStatic.map(p => ({
        slug: p.slug, name: p.name, title: p.title,
        mentionCount: 0, guestCount: 0, gender: p.gender, category: p.category,
      }));
    }
    const matchingSlugs = relatedPeopleStatic.map(p => p.slug);
    return peopleData
      .filter(p => matchingSlugs.includes(p.slug))
      .sort((a, b) => (b.guestCount + b.mentionCount) - (a.guestCount + a.mentionCount))
      .slice(0, 12);
  }, [topic, peopleData, relatedPeopleStatic]);

  const relatedCompanies = useMemo(() => {
    if (!topic) return [];
    return COMPANIES_DIRECTORY.filter(c => {
      const text = `${c.details.industry} ${c.description}`;
      return matchesKeywords(text, topic.companyKeywords);
    }).slice(0, 8);
  }, [topic]);

  const relatedTopics = useMemo(() => {
    if (!topic) return [];
    return TOPICS.filter(t => t.slug !== topic.slug &&
      (t.peopleCategories.some(c => topic.peopleCategories.includes(c)) ||
       t.podcastKeywords.some(kw => topic.podcastKeywords.some(tk => tk === kw)))
    ).slice(0, 6);
  }, [topic]);

  const quotes = useMemo(() => topicEpisodes ? extractQuotes(topicEpisodes) : [], [topicEpisodes]);
  const keyInsights = useMemo(() => topicEpisodes ? extractInsights(topicEpisodes) : [], [topicEpisodes]);

  const taxonomyPodcasts = useMemo(() => {
    if (!params.slug) return null;
    const reverseMap: Record<string, string[]> = {};
    for (const [catTopicSlug, topicsPageSlug] of Object.entries(TOPIC_TO_TOPICS_PAGE_MAP)) {
      if (!reverseMap[topicsPageSlug]) reverseMap[topicsPageSlug] = [];
      reverseMap[topicsPageSlug].push(catTopicSlug);
    }
    const matchingCatTopicSlugs = reverseMap[params.slug] || [];
    if (matchingCatTopicSlugs.length === 0 && TOPIC_TO_TOPICS_PAGE_MAP[params.slug]) {
      matchingCatTopicSlugs.push(params.slug);
    }
    if (matchingCatTopicSlugs.length === 0) return null;
    const seen = new Set<string>();
    const podcasts: { podcast: typeof PODCAST_LANDINGS[0]; categorySlug: string; topicSlug: string }[] = [];
    for (const catTopicSlug of matchingCatTopicSlugs) {
      for (const cat of PODCAST_CATEGORIES) {
        if (cat.topics.some(t => t.slug === catTopicSlug)) {
          const matched = getPodcastsForTopic(cat.slug, catTopicSlug);
          for (const p of matched) {
            if (!seen.has(p.slug)) {
              seen.add(p.slug);
              podcasts.push({ podcast: p, categorySlug: cat.slug, topicSlug: catTopicSlug });
            }
          }
        }
      }
    }
    if (podcasts.length === 0) return null;
    const first = podcasts[0];
    return {
      podcasts: podcasts.slice(0, 4).map(p => p.podcast),
      browseUrl: `/insights/${params.slug}`,
      topicSlug: first.topicSlug,
    };
  }, [params.slug]);

  const dynamicGuests = useMemo(() => {
    if (!isDynamic || !topicEpisodes) return [];
    const guestMap = new Map<string, { name: string; title: string; podcasts: Set<string> }>();
    for (const ep of topicEpisodes) {
      const guests = ep.guests;
      if (!guests) continue;
      let guestList: any[] = [];
      if (typeof guests === "string") {
        try { guestList = JSON.parse(guests); } catch { continue; }
      } else if (Array.isArray(guests)) {
        guestList = guests;
      }
      for (const g of guestList) {
        if (!g.name) continue;
        const key = g.name.toLowerCase().trim();
        if (!guestMap.has(key)) {
          guestMap.set(key, { name: g.name, title: g.title || "", podcasts: new Set() });
        }
        guestMap.get(key)!.podcasts.add(ep.podcast_name);
      }
    }
    return Array.from(guestMap.values())
      .sort((a, b) => b.podcasts.size - a.podcasts.size)
      .slice(0, 8);
  }, [isDynamic, topicEpisodes]);

  const dynamicSummary = useMemo(() => {
    if (!isDynamic || !topicEpisodes || topicEpisodes.length === 0) return "";
    const tldls = topicEpisodes
      .filter(ep => ep.tldl)
      .slice(0, 3)
      .map(ep => ep.tldl);
    if (tldls.length === 0) return "";
    return tldls[0];
  }, [isDynamic, topicEpisodes]);

  const Icon = topic ? (ICON_MAP[topic.icon] || Sparkles) : Tag;
  const topicDisplayName = topic ? topic.name : dynamicTopicName;
  const topicDescription = topic ? topic.description : dynamicSummary;

  const latestEpisodeDate = topicEpisodes && topicEpisodes.length > 0
    ? topicEpisodes[0].publish_date
    : null;

  const uniquePodcastSources = useMemo(() => {
    if (!topicEpisodes) return 0;
    return new Set(topicEpisodes.map(ep => ep.slug)).size;
  }, [topicEpisodes]);

  const getPersonImage = (slug: string) => {
    const person = PEOPLE_DIRECTORY.find(p => p.slug === slug);
    return person?.imageUrl || "";
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead name={topicDisplayName} description={topicDescription} />

      <SiteHeader />

      <main className="max-w-7xl mx-auto px-6 pt-6 pb-20">
        <div className="flex items-center gap-2 text-[14px] text-muted-foreground mb-6">
          <Link href="/insights" className="hover:text-foreground transition-colors" data-testid="link-back-insights">
            Insights
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />
          <span className="text-foreground font-medium">{topicDisplayName}</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex items-start gap-4 mb-5">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${topic ? topic.color : "from-emerald-500 to-teal-600"} flex items-center justify-center flex-shrink-0`}>
              <Icon className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-[2.25rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.02em]" data-testid="text-topic-title">
                {topicDisplayName}
              </h1>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-2 max-w-2xl leading-relaxed" data-testid="text-topic-description">
                {topicDescription}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-4" data-testid="kpi-status">
              <p className="text-[12px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Status</p>
              <p className="text-base font-display font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Active
              </p>
            </div>
            <div className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-4" data-testid="kpi-sources">
              <p className="text-[12px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Sources</p>
              <p className="text-base font-display font-bold text-foreground">{uniquePodcastSources || relatedPodcasts.length} podcasts</p>
            </div>
            <div className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-4" data-testid="kpi-episodes">
              <p className="text-[12px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Episodes</p>
              <p className="text-base font-display font-bold text-foreground">{topicEpisodes?.length || 0}</p>
            </div>
            {latestEpisodeDate && (
              <div className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-4" data-testid="kpi-latest">
                <p className="text-[12px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Latest</p>
                <p className="text-base font-display font-bold text-foreground">{formatRelativeDate(latestEpisodeDate)}</p>
              </div>
            )}
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-14">
          <div className="lg:col-span-2 space-y-6">
            {topicEpisodes && topicEpisodes.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl overflow-hidden"
              >
                <div className="px-5 py-3.5 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-recent-episodes">
                      Signal Feed
                    </h2>
                  </div>
                  {latestEpisodeDate && (
                    <span className="text-[12px] font-mono text-muted-foreground/50">
                      Updated {formatRelativeDate(latestEpisodeDate)}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                  {topicEpisodes.slice(0, 8).map((ep, i) => (
                    <Link key={`${ep.slug}-${ep.episode_slug}`} href={`/podcasts/${ep.slug}/${ep.episode_slug}`} className="block" data-testid={`link-episode-${i}`}>
                      <div className="group px-5 py-4 hover:bg-muted/30 transition-colors cursor-pointer">
                        <div className="flex items-start gap-3.5">
                          <img
                            src={ep.artwork_url}
                            alt={ep.podcast_name}
                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0 mt-0.5"
                            loading="lazy"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[12px] font-mono text-muted-foreground/60 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {ep.publish_date ? formatRelativeDate(ep.publish_date) : ""}
                              </span>
                              <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/30" />
                              <span className="text-[12px] font-mono text-muted-foreground/50 truncate">{ep.podcast_name}</span>
                            </div>
                            <p className="text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                              {ep.episode_title}
                            </p>
                            {ep.tldl && (
                              <p className="text-[14px] text-[#3F3F46] dark:text-[#A1A1AA] mt-1 line-clamp-2 leading-relaxed">{ep.tldl}</p>
                            )}
                          </div>
                          <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/20 group-hover:text-primary flex-shrink-0 mt-1.5 transition-colors" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </motion.section>
            )}

            {episodesLoading && (
              <div className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-10 flex items-center justify-center">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-[14px] font-mono">Analyzing signals...</span>
                </div>
              </div>
            )}

            {!episodesLoading && (!topicEpisodes || topicEpisodes.length === 0) && (
              <div className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-10 text-center">
                <Radio className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-base font-medium text-foreground mb-1">Signal acquisition in progress</p>
                <p className="text-[14px] text-muted-foreground/60">We're expanding {topicDisplayName.toLowerCase()} coverage across our monitoring network.</p>
              </div>
            )}
          </div>

          <div className="space-y-5">
            {keyInsights.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl overflow-hidden"
              >
                <div className="px-5 py-3.5 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-key-insights">
                    Key Intelligence
                  </h2>
                </div>
                <div className="px-5 py-4 space-y-3">
                  {keyInsights.map((insight, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 mt-2" />
                      <p className="text-[14px] text-foreground/80 leading-relaxed">{insight}</p>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}

            {quotes.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl overflow-hidden"
              >
                <div className="px-5 py-3.5 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center gap-2">
                  <Quote className="w-4 h-4 text-purple-500" />
                  <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-notable-quotes">
                    Signal Excerpts
                  </h2>
                </div>
                <div className="px-5 py-4 space-y-4">
                  {quotes.map((q, i) => (
                    <div key={i} className="border-l-2 border-primary/20 pl-3.5">
                      <p className="text-[14px] text-foreground/80 italic leading-relaxed">"{q.quote}"</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[12px] font-mono text-muted-foreground/50">{q.podcast}</span>
                        {q.date && (
                          <>
                            <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/30" />
                            <span className="text-[12px] font-mono text-muted-foreground/40">{formatRelativeDate(q.date)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}

            {!isDynamic && (
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.25 }}
                className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl overflow-hidden"
              >
                <div className="px-5 py-3.5 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-500" />
                  <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-topic-pulse">
                    Coverage Metrics
                  </h2>
                </div>
                <div className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] text-[#3F3F46] dark:text-[#A1A1AA]">Coverage status</span>
                    <span className="text-[13px] font-mono font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active
                    </span>
                  </div>
                  {latestEpisodeDate && (
                    <>
                      <div className="h-px bg-black/[0.04] dark:bg-white/[0.04]" />
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] text-[#3F3F46] dark:text-[#A1A1AA]">Latest signal</span>
                        <span className="text-[12px] font-mono text-muted-foreground">{formatDate(latestEpisodeDate)}</span>
                      </div>
                    </>
                  )}
                </div>
              </motion.section>
            )}

            {isDynamic && dynamicGuests.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.25 }}
                className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl overflow-hidden"
              >
                <div className="px-5 py-3.5 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center gap-2">
                  <Users className="w-4 h-4 text-sky-500" />
                  <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-related-people">
                    Key Stakeholders
                  </h2>
                </div>
                <div className="px-5 py-4 space-y-3">
                  {dynamicGuests.map((g, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-500 flex-shrink-0 mt-1.5" />
                      <div>
                        <p className="text-[14px] font-semibold text-foreground">{g.name}</p>
                        {g.title && <p className="text-[13px] text-muted-foreground/60">{g.title}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}
          </div>
        </div>

        {relatedPodcasts.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="mb-14"
          >
            <div className="flex items-center gap-2 mb-1">
              <Radio className="w-4 h-4 text-primary" />
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-podcasts">
                Monitored Sources
              </h2>
            </div>
            <p className="text-[14px] text-[#3F3F46] dark:text-[#A1A1AA] mb-5">
              Primary podcast sources actively monitored for {topicDisplayName.toLowerCase()} intelligence.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {relatedPodcasts.map((podcast, i) => (
                <motion.div
                  key={podcast.slug}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
                >
                  <Link href={`/podcasts/${podcast.slug}`} data-testid={`card-podcast-${podcast.slug}`}>
                    <div className="group bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-3.5 hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer">
                      <div className="flex items-center gap-3">
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
                          <p className="text-[13px] text-muted-foreground/60 truncate"><LinkedHosts hosts={podcast.hosts || ""} /></p>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}

        {taxonomyPodcasts && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.32 }}
            className="mb-14"
            data-testid="section-top-podcasts"
          >
            <div className="flex items-center gap-2 mb-1">
              <Podcast className="w-4 h-4 text-primary" />
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-top-podcasts">
                Top {topicDisplayName} Sources
              </h2>
            </div>
            <p className="text-[14px] text-[#3F3F46] dark:text-[#A1A1AA] mb-5">
              Highest-signal sources for {topicDisplayName.toLowerCase()} coverage, ranked by relevance and depth.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {taxonomyPodcasts.podcasts.map((podcast, i) => (
                <motion.div
                  key={podcast.slug}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
                >
                  <Link href={`/podcasts/${podcast.slug}`} data-testid={`card-top-podcast-${podcast.slug}`}>
                    <div className="group bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-3.5 hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer">
                      <div className="flex items-center gap-3">
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
                          <p className="text-[13px] text-muted-foreground/60 truncate"><LinkedHosts hosts={podcast.hosts || ""} /></p>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
            <div className="mt-4">
              <Link
                href={taxonomyPodcasts.browseUrl}
                className="inline-flex items-center gap-1.5 text-[14px] font-medium text-primary hover:text-primary/80 transition-colors"
                data-testid="link-browse-all-podcasts"
              >
                Browse all {topicDisplayName.toLowerCase()} sources
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </motion.section>
        )}

        {relatedPeople.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="mb-14"
          >
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-sky-500" />
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-people">
                Key Stakeholders
              </h2>
            </div>
            <p className="text-[14px] text-[#3F3F46] dark:text-[#A1A1AA] mb-5">
              Influential voices shaping the {topicDisplayName.toLowerCase()} narrative across monitored sources.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {relatedPeople.map((person, i) => (
                <motion.div
                  key={person.slug}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
                >
                  <Link href={`/people/${person.slug}`} data-testid={`card-person-${person.slug}`}>
                    <div className="group bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-4 hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer">
                      <div className="flex items-center gap-3">
                        <img
                          src={getPersonImage(person.slug)}
                          alt={person.name}
                          className="w-10 h-10 rounded-full object-cover flex-shrink-0 bg-muted"
                          loading="lazy"
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[14px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                            {person.name}
                          </h3>
                          <p className="text-[13px] text-muted-foreground/60 truncate">{person.title}</p>
                        </div>
                        <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground/50 flex-shrink-0">
                          {person.guestCount > 0 && (
                            <span className="flex items-center gap-1 font-mono">
                              <Mic className="w-3 h-3" />
                              {person.guestCount}
                            </span>
                          )}
                          {person.mentionCount > 0 && (
                            <span className="flex items-center gap-1 font-mono">
                              <MessageSquare className="w-3 h-3" />
                              {person.mentionCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}

        {relatedCompanies.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="mb-14"
          >
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-orange-500" />
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-companies">
                Companies in Focus
              </h2>
            </div>
            <p className="text-[14px] text-[#3F3F46] dark:text-[#A1A1AA] mb-5">
              Organizations at the center of the {topicDisplayName.toLowerCase()} landscape, tracked across podcast discourse.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {relatedCompanies.map((company, i) => (
                <motion.div
                  key={company.slug}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
                >
                  <Link href={`/companies/${company.slug}`} data-testid={`card-company-${company.slug}`}>
                    <div className="group bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-4 hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer">
                      <div className="flex items-center gap-3">
                        <img
                          src={company.logoUrl}
                          alt={company.name}
                          className="w-8 h-8 rounded-lg object-contain flex-shrink-0 bg-muted p-0.5"
                          loading="lazy"
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[14px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                            {company.name}
                          </h3>
                          <p className="text-[13px] text-muted-foreground/60 truncate">{company.details.industry}</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.45 }}
          className="mb-14"
        >
          <div className="rounded-xl bg-foreground text-background overflow-hidden">
            <div className="px-8 py-10 sm:py-12">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 sm:gap-10">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 className="w-4 h-4 text-primary" />
                    <span className="text-[13px] font-semibold uppercase tracking-[0.15em] text-primary">Enterprise Intelligence</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-display font-bold text-white mb-2" data-testid="heading-enterprise-cta">
                    Need {topicDisplayName.toLowerCase()} intelligence at scale?
                  </h3>
                  <p className="text-[14px] text-white/60 leading-relaxed max-w-xl">
                    We build custom monitoring and synthesis pipelines for enterprise teams. Get structured data, automated alerts, and analyst-ready briefs on {topicDisplayName.toLowerCase()} - tailored to your organization's specific intelligence requirements.
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

        {relatedTopics.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-5">
              <Tag className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-related-topics">
                Related Intelligence
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {relatedTopics.map(t => {
                const TIcon = ICON_MAP[t.icon] || Sparkles;
                return (
                  <Link key={t.slug} href={`/insights/${t.slug}`} data-testid={`link-related-topic-${t.slug}`}>
                    <div className="group flex items-center gap-2 px-4 py-2.5 rounded-lg border border-black/[0.06] dark:border-white/[0.06] bg-card hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer">
                      <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${t.color} flex items-center justify-center`}>
                        <TIcon className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-[14px] font-medium text-foreground group-hover:text-primary transition-colors">{t.name}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
