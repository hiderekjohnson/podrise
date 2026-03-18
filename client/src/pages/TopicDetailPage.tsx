import { useMemo, useEffect } from "react";
import { Link, useParams } from "wouter";
import { ArrowRight, Brain, Rocket, Lightbulb, TrendingUp, TrendingDown, Minus, BarChart3, Wallet, Crown, Megaphone, Handshake, Zap, Cpu, LineChart, Heart, Flame, ArrowUpCircle, Scale, GraduationCap, Palette, Video, Globe, Sparkles, GitFork, Mic, MessageSquare, Users, Building2, Quote, Activity, ArrowUpRight, Tag, UserPlus, Cloud, GitBranch, Layout, Target, Cog, Bot, Coins, Leaf, Shield, Hammer, Briefcase, Radio, Podcast, ChevronRight, Clock, BookOpen, Package, Mail } from "lucide-react";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { BookCoverFill } from "@/components/BookCover";
import { PodcastMicBadge } from "@/components/PodcastMicBadge";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Footer } from "@/components/Footer";
import { TOPICS, matchesKeywords, getCategoryPath } from "@/data/topicData";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { PEOPLE_DIRECTORY, COMPANIES_DIRECTORY } from "@/data/entityDirectoryData";
import { SiteHeader } from "@/components/SiteHeader";
import { LinkedHosts } from "@/components/LinkedHosts";
import { TOPIC_TO_TOPICS_PAGE_MAP, PODCAST_CATEGORIES, getPodcastsForTopic } from "@/data/podcastCategoryData";
import { InlineEmailCTA } from "@/components/InlineEmailCTA";
import { StickyEmailBar } from "@/components/StickyEmailBar";
import { useSetConversion } from "@/contexts/PageConversionContext";

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

interface WeeklyIntelligence {
  weekRange: string;
  trendingPeople: { slug: string; name: string; title: string; trend: string; changePercent: number; recentMentions: number; contextSnippets: { snippet: string; podcastName: string; episodeSlug: string; podcastSlug: string }[] }[];
  trendingCompanies: { slug: string; name: string; description: string; trend: string; changePercent: number; recentMentions: number; contextSnippets: { snippet: string; podcastName: string; episodeSlug: string; podcastSlug: string }[] }[];
  quotes: { speakerName: string; quoteText: string; context: string; podcastName: string; episodeTitle: string; podcastSlug: string; episodeSlug: string }[];
  products: { name: string; company: string; description: string; category: string; episodeTitle: string; podcastSlug: string; episodeSlug: string; imageUrl: string; contextSummary: string }[];
}

function SEOHead({ name, description }: { name: string; description: string }) {
  useEffect(() => {
    const title = `${name} Tactics, Strategies & Lessons from Top Podcasts | PodCap`;
    const desc = `Discover ${name.toLowerCase()} tactics, key takeaways, recommended books, and expert voices — curated daily from the world's best podcasts.`;
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
    setOrCreate('meta[name="twitter:card"]', "name", "summary_large_image");
    setOrCreate('meta[name="twitter:title"]', "name", title);
    setOrCreate('meta[name="twitter:description"]', "name", desc);
  }, [name, description]);
  return null;
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
        if (typeof insight === "string" && insight.length > 20 && insights.length < 8) {
          insights.push(insight);
        }
      }
    }
  }
  return insights;
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
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function TrendBadge({ trend, changePercent }: { trend: string; changePercent: number }) {
  if (trend === "rising") {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] py-0.5 px-2 font-mono font-semibold text-[#6366F1] bg-[#EEF2FF] dark:bg-[#6366F1]/10 rounded-md">
        <TrendingUp className="w-3 h-3" />
        +{Math.abs(changePercent)}%
      </span>
    );
  }
  if (trend === "falling") {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] py-0.5 px-2 font-mono font-semibold text-muted-foreground bg-muted rounded-md">
        <TrendingDown className="w-3 h-3" />
        {changePercent}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[13px] py-0.5 px-2 font-mono font-medium text-muted-foreground bg-muted rounded-md">
      <Minus className="w-3 h-3" />
      Stable
    </span>
  );
}

export default function TopicDetailPage() {
  const params = useParams<{ slug: string }>();
  const { isEnabled: isFlagEnabled } = useFeatureFlags();
  const pulseEnabled = isFlagEnabled("pulse");

  const topic = TOPICS.find(t => t.slug === params.slug);
  const isDynamic = !topic;
  const dynamicTopicName = isDynamic
    ? (params.slug || "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "";
  const categoryBasePath = topic ? getCategoryPath(topic.category) : "/interests";

  const { data: peopleData } = useQuery<PersonSummary[]>({
    queryKey: ["/api/entities/people"],
    enabled: !isDynamic,
  });

  const { data: latestPulses } = useQuery<{ publishDate: string; headline: string; summary: string }[]>({
    queryKey: ["/api/topics", params.slug, "pulse"],
    queryFn: async () => {
      const res = await fetch(`/api/topics/${params.slug}/pulse`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!params.slug,
  });

  const latestPulseDate = latestPulses?.[0]?.publishDate;

  const { data: rawTopicEpisodes, isLoading: episodesLoading } = useQuery<TopicEpisode[]>({
    queryKey: ["/api/topics", params.slug, "episodes"],
    queryFn: async () => {
      const res = await fetch(`/api/topics/${params.slug}/episodes`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!params.slug,
  });

  const { data: rawWeeklyIntel } = useQuery<WeeklyIntelligence>({
    queryKey: ["/api/topics", params.slug, "weekly-intelligence"],
    queryFn: async () => {
      const res = await fetch(`/api/topics/${params.slug}/weekly-intelligence`);
      if (!res.ok) return { weekRange: "", trendingPeople: [], trendingCompanies: [], quotes: [], products: [] };
      return res.json();
    },
    enabled: !!params.slug && !isDynamic,
  });

  const weeklyIntel = useMemo<WeeklyIntelligence | undefined>(() => {
    if (!rawWeeklyIntel) return undefined;
    return {
      weekRange: rawWeeklyIntel.weekRange || "",
      trendingPeople: (rawWeeklyIntel.trendingPeople || []).map(p => ({ ...p, contextSnippets: p.contextSnippets || [] })),
      trendingCompanies: (rawWeeklyIntel.trendingCompanies || []).map(c => ({ ...c, contextSnippets: c.contextSnippets || [] })),
      quotes: rawWeeklyIntel.quotes || [],
      products: rawWeeklyIntel.products || [],
    };
  }, [rawWeeklyIntel]);

  const topicEpisodes = useMemo(() => {
    if (!rawTopicEpisodes) return rawTopicEpisodes;
    return [...rawTopicEpisodes].sort((a, b) =>
      new Date(b.publish_date).getTime() - new Date(a.publish_date).getTime()
    );
  }, [rawTopicEpisodes]);

  const thisWeekEpisodes = useMemo(() => {
    if (!topicEpisodes) return [];
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return topicEpisodes.filter(ep => ep.publish_date && new Date(ep.publish_date) >= weekAgo);
  }, [topicEpisodes]);

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

  const { data: topicBooks } = useQuery({
    queryKey: ["/api/topics", params.slug, "books"],
    queryFn: async () => {
      const res = await fetch(`/api/topics/${params.slug}/books`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!params.slug,
  });

  const weeklyInsights = useMemo(() => thisWeekEpisodes.length > 0 ? extractInsights(thisWeekEpisodes) : [], [thisWeekEpisodes]);
  const allInsights = useMemo(() => topicEpisodes ? extractInsights(topicEpisodes) : [], [topicEpisodes]);
  const keyInsights = weeklyInsights.length > 0 ? weeklyInsights : allInsights;

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
      browseUrl: `${categoryBasePath}/${params.slug}`,
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

  const uniquePodcastSources = useMemo(() => {
    if (!topicEpisodes) return 0;
    return new Set(topicEpisodes.map(ep => ep.slug)).size;
  }, [topicEpisodes]);

  const getPersonImage = (slug: string) => {
    const person = PEOPLE_DIRECTORY.find(p => p.slug === slug);
    return person?.imageUrl || "";
  };

  const getCompanyLogo = (slug: string) => {
    const company = COMPANIES_DIRECTORY.find(c => c.slug === slug);
    return company?.logoUrl || "";
  };

  const allPodcasts = useMemo(() => {
    const combined = [...relatedPodcasts];
    if (taxonomyPodcasts) {
      for (const p of taxonomyPodcasts.podcasts) {
        if (!combined.find(c => c.slug === p.slug)) combined.push(p);
      }
    }
    return combined.slice(0, 12);
  }, [relatedPodcasts, taxonomyPodcasts]);

  const categoryLabel = topic?.category === "industry" ? "Industries" : topic?.category === "role" ? "Roles" : "Interests";

  const hasWeeklyContent = weeklyIntel && (
    weeklyIntel.trendingPeople.length > 0 ||
    weeklyIntel.trendingCompanies.length > 0 ||
    weeklyIntel.quotes.length > 0 ||
    weeklyIntel.products.length > 0 ||
    thisWeekEpisodes.length > 0 ||
    weeklyInsights.length > 0
  );

  useSetConversion(topic ? {
    pageType: "topic",
    name: topicDisplayName,
    slug: topic.slug,
    categoryType: topic.category,
    description: topicDescription,
    podcastCount: uniquePodcastSources || allPodcasts.length,
  } : null);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead name={topicDisplayName} description={topicDescription} />
      <SiteHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-20">
        <div className="flex items-center gap-2 text-[14px] text-muted-foreground mb-6">
          <Link href={categoryBasePath} className="hover:text-foreground transition-colors" data-testid="link-back-insights">
            {categoryLabel}
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />
          <span className="text-foreground font-medium">{topicDisplayName}</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <div className="flex items-start gap-4 mb-3">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${topic ? topic.color : "from-indigo-500 to-violet-600"} flex items-center justify-center flex-shrink-0`}>
              <Icon className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl sm:text-[2.5rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.02em]" data-testid="text-topic-title">
                  {hasWeeklyContent ? `What's Happening in ${topicDisplayName}` : topicDisplayName}
                </h1>
              </div>
              {weeklyIntel?.weekRange && hasWeeklyContent ? (
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[14px] font-medium text-primary" data-testid="text-week-range">Updated recently</span>
                </div>
              ) : (
                <p className="text-[16px] text-[#52525B] dark:text-[#A1A1AA] mt-2 max-w-2xl leading-relaxed" data-testid="text-topic-description">
                  {topicDescription}
                </p>
              )}
            </div>
          </div>
        </motion.div>

        {topic && pulseEnabled && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.06 }}
            className="mb-8"
          >
            <Link
              href={latestPulseDate ? `${categoryBasePath}/${params.slug}/pulse/${latestPulseDate}` : `${categoryBasePath}/${params.slug}/pulse`}
              className="block group"
              data-testid="link-topic-pulse"
            >
              <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] p-4 sm:p-5">
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.05] rounded-full -translate-y-1/2 translate-x-1/3" />
                <div className="relative flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-white/80 flex-shrink-0" />
                    <div>
                      <span className="text-[15px] font-bold text-white">The Pulse</span>
                      <span className="text-[14px] text-white/60 ml-2">Get the daily Pulse on {topicDisplayName.toLowerCase()}</span>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-white text-[#6366F1] rounded-lg text-[14px] font-semibold group-hover:shadow-lg transition-all whitespace-nowrap">
                    Read <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </div>
            </Link>
          </motion.div>
        )}

        {!isDynamic && hasWeeklyContent && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08 }}
            className="mb-10 space-y-5"
            data-testid="snapshot-dashboard"
          >
            {(weeklyIntel.quotes.length > 0 || (latestPulses && latestPulses.length > 0)) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {weeklyIntel.quotes.length > 0 && (
                  <div className="rounded-xl bg-gradient-to-br from-[#F8F7FF] to-[#F0EFFF] dark:from-[#6366F1]/[0.06] dark:to-[#8B5CF6]/[0.04] border border-[#6366F1]/[0.08] p-5 sm:p-6 flex flex-col" data-testid="snapshot-quote">
                    <div className="flex items-center gap-2 mb-3">
                      <Quote className="w-4 h-4 text-[#6366F1]" />
                      <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#6366F1]">Quote of the Day</span>
                    </div>
                    <blockquote className="text-[16px] sm:text-[18px] font-display text-foreground leading-relaxed italic mb-3 flex-1">
                      "{weeklyIntel.quotes[0].quoteText}"
                    </blockquote>
                    <Link href={`/podcasts/${weeklyIntel.quotes[0].podcastSlug}/${weeklyIntel.quotes[0].episodeSlug}`} className="flex items-center gap-2 group" data-testid="link-snapshot-quote">
                      <span className="text-[14px] font-semibold text-foreground">{weeklyIntel.quotes[0].speakerName}</span>
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                      <span className="text-[13px] text-muted-foreground group-hover:text-primary transition-colors">{weeklyIntel.quotes[0].podcastName}</span>
                      <ArrowUpRight className="w-3 h-3 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                    </Link>
                  </div>
                )}

                {pulseEnabled && latestPulses && latestPulses.length > 0 && (
                  <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-card p-5 sm:p-6 flex flex-col" data-testid="snapshot-pulse">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-[#6366F1]" />
                        <span className="text-[14px] font-bold text-foreground">The Pulse</span>
                      </div>
                      <Link
                        href={latestPulseDate ? `${categoryBasePath}/${params.slug}/pulse/${latestPulseDate}` : `${categoryBasePath}/${params.slug}/pulse`}
                        className="text-[12px] font-medium text-primary hover:text-primary/80 transition-colors"
                        data-testid="snapshot-read-pulse"
                      >
                        Read all →
                      </Link>
                    </div>
                    <div className="space-y-3 flex-1">
                      {latestPulses.slice(0, 3).map((pulse, i) => {
                        const d = new Date(pulse.publishDate + "T00:00:00");
                        const formattedDate = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                        return (
                          <Link
                            key={i}
                            href={`${categoryBasePath}/${params.slug}/pulse/${pulse.publishDate}`}
                            className="block group"
                            data-testid={`snapshot-pulse-${i}`}
                          >
                            <div className="flex items-baseline gap-2 mb-0.5">
                              <span className="text-[12px] font-semibold text-primary/60 uppercase tracking-wide flex-shrink-0">{formattedDate}</span>
                            </div>
                            <p className="text-[14px] text-foreground/80 leading-relaxed group-hover:text-primary transition-colors line-clamp-2">{pulse.summary || pulse.headline}</p>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {(weeklyIntel.trendingPeople.length > 0 || weeklyIntel.trendingCompanies.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {weeklyIntel.trendingPeople.length > 0 && (
                  <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-card p-5" data-testid="snapshot-trending-people">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-sky-500" />
                        <span className="text-[14px] font-bold text-foreground">Trending People</span>
                      </div>
                      <button
                        onClick={() => document.getElementById('section-people')?.scrollIntoView({ behavior: 'smooth' })}
                        className="text-[12px] font-medium text-primary hover:text-primary/80 transition-colors"
                        data-testid="snapshot-see-all-people"
                      >
                        See all →
                      </button>
                    </div>
                    <div className="space-y-3.5">
                      {weeklyIntel.trendingPeople.slice(0, 3).map((person) => (
                        <Link key={person.slug} href={`/people/${person.slug}`} className="flex items-start gap-3 group" data-testid={`snapshot-person-${person.slug}`}>
                          <img
                            src={getPersonImage(person.slug)}
                            alt={person.name}
                            className="w-10 h-10 rounded-full object-cover flex-shrink-0 bg-muted"
                            onError={(e) => { (e.target as HTMLImageElement).src = '/people/default-avatar.png'; }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[14px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">{person.name}</span>
                              <TrendBadge trend={person.trend} changePercent={person.changePercent} />
                            </div>
                            <p className="text-[13px] text-muted-foreground leading-relaxed line-clamp-2">
                              {person.contextSnippets.length > 0 ? person.contextSnippets[0].snippet : person.title}
                            </p>
                            {person.contextSnippets.length > 0 && (
                              <span className="text-[12px] text-primary/50 mt-0.5 inline-block">{person.contextSnippets[0].podcastName}</span>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {weeklyIntel.trendingCompanies.length > 0 && (
                  <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-card p-5" data-testid="snapshot-trending-companies">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-orange-500" />
                        <span className="text-[14px] font-bold text-foreground">Trending Companies</span>
                      </div>
                      <button
                        onClick={() => document.getElementById('section-companies')?.scrollIntoView({ behavior: 'smooth' })}
                        className="text-[12px] font-medium text-primary hover:text-primary/80 transition-colors"
                        data-testid="snapshot-see-all-companies"
                      >
                        See all →
                      </button>
                    </div>
                    <div className="space-y-3.5">
                      {weeklyIntel.trendingCompanies.slice(0, 3).map((company) => (
                        <Link key={company.slug} href={`/companies/${company.slug}`} className="flex items-start gap-3 group" data-testid={`snapshot-company-${company.slug}`}>
                          <img
                            src={getCompanyLogo(company.slug)}
                            alt={company.name}
                            className="w-10 h-10 rounded-lg object-contain flex-shrink-0 bg-muted p-0.5"
                            onError={(e) => { (e.target as HTMLImageElement).src = '/people/default-avatar.png'; }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[14px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">{company.name}</span>
                              <TrendBadge trend={company.trend} changePercent={company.changePercent} />
                            </div>
                            <p className="text-[13px] text-muted-foreground leading-relaxed line-clamp-2">
                              {company.contextSnippets.length > 0 ? company.contextSnippets[0].snippet : company.description}
                            </p>
                            {company.contextSnippets.length > 0 && (
                              <span className="text-[12px] text-primary/50 mt-0.5 inline-block">{company.contextSnippets[0].podcastName}</span>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {thisWeekEpisodes.length > 0 && (
              <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-card p-5" data-testid="snapshot-moments">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span className="text-[14px] font-bold text-foreground">Key Moments</span>
                  </div>
                  <button
                    onClick={() => document.getElementById('section-takeaways')?.scrollIntoView({ behavior: 'smooth' })}
                    className="text-[12px] font-medium text-primary hover:text-primary/80 transition-colors"
                    data-testid="snapshot-more-moments"
                  >
                    See all →
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(() => {
                    const moments = thisWeekEpisodes
                      .filter(ep => ep.tldl || (Array.isArray(ep.key_insights) ? ep.key_insights.length > 0 : !!ep.key_insights))
                      .slice(0, 4)
                      .map(ep => ({
                        title: ep.episode_title,
                        podcast: ep.podcast_name,
                        artwork: ep.artwork_url,
                        hook: ep.tldl || (Array.isArray(ep.key_insights) ? ep.key_insights[0] : ep.key_insights),
                        podcastSlug: ep.slug,
                        episodeSlug: ep.episode_slug,
                      }));
                    return moments.map((m, i) => (
                      <Link key={i} href={`/podcasts/${m.podcastSlug}/${m.episodeSlug}`} className="group" data-testid={`snapshot-moment-${i}`}>
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50/40 dark:bg-amber-950/10 border border-amber-200/20 dark:border-amber-800/15 hover:border-amber-300/40 transition-all">
                          <img src={m.artwork} alt={m.podcast} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" loading="lazy" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] text-foreground/80 leading-relaxed line-clamp-2 group-hover:text-foreground transition-colors">{m.hook}</p>
                            <span className="text-[12px] text-muted-foreground mt-1 inline-block">{m.podcast}</span>
                          </div>
                        </div>
                      </Link>
                    ));
                  })()}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {!isDynamic && hasWeeklyContent && (
          <>
            {weeklyIntel.trendingPeople.length > 0 && (
              <motion.section
                id="section-people"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="mb-10 scroll-mt-24"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Users className="w-5 h-5 text-sky-500" />
                  <h2 className="text-xl font-display font-bold text-foreground" data-testid="heading-trending-people">
                    Trending People
                  </h2>
                  <span className="text-[13px] text-muted-foreground ml-1">Recently</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {weeklyIntel.trendingPeople.slice(0, 6).map((person, i) => (
                    <div key={person.slug} data-testid={`card-trending-person-${person.slug}`}>
                      <div className="group rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-card hover:border-primary/20 hover:shadow-sm transition-all p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <Link href={`/people/${person.slug}`}>
                            <img
                              src={getPersonImage(person.slug)}
                              alt={person.name}
                              className="w-10 h-10 rounded-full object-cover flex-shrink-0 bg-muted cursor-pointer"
                              loading="lazy"
                              onError={(e) => { (e.target as HTMLImageElement).src = '/people/default-avatar.png'; }}
                            />
                          </Link>
                          <div className="flex-1 min-w-0">
                            <Link href={`/people/${person.slug}`}>
                              <h4 className="text-[15px] font-semibold text-foreground hover:text-primary transition-colors truncate cursor-pointer">
                                {person.name}
                              </h4>
                            </Link>
                            <p className="text-[13px] text-muted-foreground truncate">{person.title}</p>
                          </div>
                          <TrendBadge trend={person.trend} changePercent={person.changePercent} />
                        </div>
                        {person.contextSnippets.length > 0 && (
                          <div className="space-y-1.5">
                            {person.contextSnippets.slice(0, 1).map((ctx, j) => (
                              <Link key={j} href={`/podcasts/${ctx.podcastSlug}/${ctx.episodeSlug}`}>
                                <p className="text-[13px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed cursor-pointer hover:text-foreground transition-colors">
                                  {ctx.snippet}
                                </p>
                                <p className="text-[12px] text-primary/60 mt-0.5">{ctx.podcastName}</p>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}

            {weeklyIntel.trendingCompanies.length > 0 && (
              <motion.section
                id="section-companies"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.14 }}
                className="mb-10 scroll-mt-24"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-5 h-5 text-orange-500" />
                  <h2 className="text-xl font-display font-bold text-foreground" data-testid="heading-trending-companies">
                    Companies in the Conversation
                  </h2>
                  <span className="text-[13px] text-muted-foreground ml-1">Recently</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {weeklyIntel.trendingCompanies.slice(0, 6).map((company, i) => (
                    <div key={company.slug} data-testid={`card-trending-company-${company.slug}`}>
                      <div className="group rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-card hover:border-primary/20 hover:shadow-sm transition-all p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <Link href={`/companies/${company.slug}`}>
                            <img
                              src={getCompanyLogo(company.slug)}
                              alt={company.name}
                              className="w-10 h-10 rounded-lg object-contain flex-shrink-0 bg-muted p-0.5 cursor-pointer"
                              loading="lazy"
                              onError={(e) => { (e.target as HTMLImageElement).src = '/people/default-avatar.png'; }}
                            />
                          </Link>
                          <div className="flex-1 min-w-0">
                            <Link href={`/companies/${company.slug}`}>
                              <h4 className="text-[15px] font-semibold text-foreground hover:text-primary transition-colors truncate cursor-pointer">
                                {company.name}
                              </h4>
                            </Link>
                            <p className="text-[13px] text-muted-foreground truncate">{company.description}</p>
                          </div>
                          <TrendBadge trend={company.trend} changePercent={company.changePercent} />
                        </div>
                        {company.contextSnippets.length > 0 && (
                          <div className="space-y-1.5">
                            {company.contextSnippets.slice(0, 1).map((ctx, j) => (
                              <Link key={j} href={`/podcasts/${ctx.podcastSlug}/${ctx.episodeSlug}`}>
                                <p className="text-[13px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed cursor-pointer hover:text-foreground transition-colors">
                                  {ctx.snippet}
                                </p>
                                <p className="text-[12px] text-primary/60 mt-0.5">{ctx.podcastName}</p>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}
          </>
        )}

        {thisWeekEpisodes.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.18 }}
            className="mb-10"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-display font-bold text-foreground" data-testid="heading-weekly-episodes">
                  Recent Episodes
                </h2>
                <span className="text-[13px] text-muted-foreground ml-1">{thisWeekEpisodes.length} new</span>
              </div>
            </div>
            <div className="space-y-3">
              {thisWeekEpisodes.slice(0, 8).map((ep, i) => (
                <Link key={`${ep.slug}-${ep.episode_slug}`} href={`/podcasts/${ep.slug}/${ep.episode_slug}`} className="block" data-testid={`link-weekly-episode-${i}`}>
                  <div className="group rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-card p-4 sm:p-5 hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer">
                    <div className="flex items-start gap-4">
                      <img
                        src={ep.artwork_url}
                        alt={ep.podcast_name}
                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover flex-shrink-0"
                        loading="lazy"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[14px] font-medium text-primary">{ep.podcast_name}</span>
                          <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                          <span className="text-[14px] text-muted-foreground">{ep.publish_date ? formatRelativeDate(ep.publish_date) : ""}</span>
                        </div>
                        <h3 className="text-[15px] sm:text-base font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1 mb-1.5">
                          {ep.episode_title}
                        </h3>
                        {ep.tldl && (
                          <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] line-clamp-2 leading-relaxed">{ep.tldl}</p>
                        )}
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-muted-foreground/20 group-hover:text-primary flex-shrink-0 mt-1 transition-colors" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </motion.section>
        )}

        {keyInsights.length > 0 && (
          <motion.section
            id="section-takeaways"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.22 }}
            className="mb-10 scroll-mt-24"
          >
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-amber-500" />
              <h2 className="text-xl font-display font-bold text-foreground" data-testid="heading-key-insights">
                Key Takeaways
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {keyInsights.map((insight, i) => (
                <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/10 border border-amber-200/30 dark:border-amber-800/20">
                  <div className="w-6 h-6 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <p className="text-[15px] text-foreground/80 leading-relaxed">{insight}</p>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {!isDynamic && weeklyIntel && weeklyIntel.quotes.length > 0 && (
          <motion.section
            id="section-quotes"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.26 }}
            className="mb-10 scroll-mt-24"
          >
            <div className="flex items-center gap-2 mb-4">
              <Quote className="w-5 h-5 text-violet-500" />
              <h2 className="text-xl font-display font-bold text-foreground" data-testid="heading-top-quotes">
                Top Quotes
              </h2>
            </div>
            <div className="space-y-3">
              {weeklyIntel.quotes.slice(0, 5).map((quote, i) => (
                <Link key={i} href={`/podcasts/${quote.podcastSlug}/${quote.episodeSlug}`} data-testid={`card-quote-${i}`}>
                  <div className="group rounded-xl border border-violet-200/30 dark:border-violet-800/20 bg-violet-50/30 dark:bg-violet-950/10 p-5 hover:border-violet-300/50 hover:shadow-sm transition-all cursor-pointer">
                    <blockquote className="text-[15px] text-foreground/90 leading-relaxed italic mb-3">
                      "{quote.quoteText}"
                    </blockquote>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-foreground">{quote.speakerName}</span>
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                        <span className="text-[13px] text-muted-foreground truncate">{quote.podcastName}</span>
                      </div>
                      <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </motion.section>
        )}

        {!isDynamic && weeklyIntel && weeklyIntel.products.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="mb-10"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-emerald-500" />
                <h2 className="text-xl font-display font-bold text-foreground" data-testid="heading-products">
                  Products & Tools Mentioned
                </h2>
                <span className="text-[13px] text-muted-foreground ml-1">Recently</span>
              </div>
              <Link href="/shop" className="text-[14px] font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1" data-testid="link-shop-all">
                Browse shop <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {weeklyIntel.products.slice(0, 6).map((product, i) => (
                <Link key={i} href={`/podcasts/${product.podcastSlug}/${product.episodeSlug}`} data-testid={`card-product-${i}`}>
                  <div className="group flex items-center gap-3 p-4 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-card hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-10 h-10 rounded-lg object-contain flex-shrink-0 bg-muted p-0.5"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center flex-shrink-0">
                        <Package className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                        {product.name}
                      </h4>
                      <p className="text-[13px] text-muted-foreground truncate">
                        {product.contextSummary || product.description || `Mentioned on ${product.episodeTitle}`}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </motion.section>
        )}

        {!thisWeekEpisodes.length && topicEpisodes && topicEpisodes.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.16 }}
            className="mb-10"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-display font-bold text-foreground" data-testid="heading-recent-episodes">
                  Latest Episodes
                </h2>
              </div>
            </div>
            <div className="space-y-3">
              {topicEpisodes.slice(0, 10).map((ep, i) => (
                <Link key={`${ep.slug}-${ep.episode_slug}`} href={`/podcasts/${ep.slug}/${ep.episode_slug}`} className="block" data-testid={`link-episode-${i}`}>
                  <div className="group rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-card p-4 sm:p-5 hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer">
                    <div className="flex items-start gap-4">
                      <img
                        src={ep.artwork_url}
                        alt={ep.podcast_name}
                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover flex-shrink-0"
                        loading="lazy"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[14px] font-medium text-primary">{ep.podcast_name}</span>
                          <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                          <span className="text-[14px] text-muted-foreground">{ep.publish_date ? formatRelativeDate(ep.publish_date) : ""}</span>
                        </div>
                        <h3 className="text-[15px] sm:text-base font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1 mb-1.5">
                          {ep.episode_title}
                        </h3>
                        {ep.tldl && (
                          <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] line-clamp-2 leading-relaxed">{ep.tldl}</p>
                        )}
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-muted-foreground/20 group-hover:text-primary flex-shrink-0 mt-1 transition-colors" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </motion.section>
        )}

        {episodesLoading && (
          <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-card p-12 flex items-center justify-center mb-10">
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-[15px]">Loading episodes...</span>
            </div>
          </div>
        )}

        {!episodesLoading && (!topicEpisodes || topicEpisodes.length === 0) && (
          <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-card p-12 text-center mb-10">
            <Radio className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-base font-semibold text-foreground mb-1">Coming soon</p>
            <p className="text-[14px] text-muted-foreground/60">We're expanding {topicDisplayName.toLowerCase()} coverage. Check back soon for episodes.</p>
          </div>
        )}

        {topic && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.34 }}
            className="mb-12"
          >
            <InlineEmailCTA
              type={topic.category}
              slug={topic.slug}
              name={topicDisplayName}
              variant="minimal"
            />
          </motion.div>
        )}

        {isDynamic && dynamicGuests.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="mb-12"
          >
            <div className="flex items-center gap-2 mb-5">
              <Users className="w-5 h-5 text-sky-500" />
              <h2 className="text-xl font-display font-bold text-foreground" data-testid="heading-related-people">
                People to Follow
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {dynamicGuests.map((g, i) => (
                <div key={i} className="flex items-center gap-3 p-4 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-card">
                  <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-950/40 flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-sky-500" />
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold text-foreground">{g.name}</p>
                    {g.title && <p className="text-[14px] text-muted-foreground">{g.title}</p>}
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.38 }}
          className="mb-8"
        >
          <div className="w-full h-px bg-black/[0.06] dark:bg-white/[0.06] mb-10" />
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-display font-extrabold text-foreground tracking-tight" data-testid="heading-discover">
              Discover more about {topicDisplayName.toLowerCase()}
            </h2>
          </div>
          <p className="text-[15px] text-muted-foreground mb-8">
            Books to read, people to follow, podcasts to subscribe to, and companies to watch.
          </p>
        </motion.div>

        {topicBooks && topicBooks.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.42 }}
            className="mb-12"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-600" />
                <h3 className="text-lg font-display font-bold text-foreground" data-testid="heading-topic-books">
                  Recommended Reading
                </h3>
              </div>
              <Link href="/shop" className="text-[14px] font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
                All books <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {topicBooks.slice(0, 8).map((book: any, i: number) => (
                <motion.div
                  key={book.slug}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
                >
                  <Link href={`/shop/${book.slug}`} data-testid={`card-topic-book-${book.slug}`}>
                    <div className="group bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-3 hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer h-full flex flex-col">
                      <div className="w-full aspect-[2/3] bg-muted rounded-lg mb-3 overflow-hidden flex items-center justify-center">
                        <BookCoverFill title={book.title} slug={book.slug} googleBooksId={book.googleBooksId} isbn={book.isbn} hasCover={book.hasCover} />
                      </div>
                      <h4 className="text-[14px] font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 flex-1">
                        {book.title}
                      </h4>
                      <p className="text-[14px] text-muted-foreground mt-1">{book.author || "Unknown"}</p>
                      {book.podcastCount > 0 && (
                        <div className="mt-1.5">
                          <PodcastMicBadge count={book.podcastCount} size="sm" />
                        </div>
                      )}
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}

        {relatedPeople.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.46 }}
            className="mb-12"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-sky-500" />
                <h3 className="text-lg font-display font-bold text-foreground" data-testid="heading-people">
                  People to Follow
                </h3>
              </div>
              <Link href="/people" className="text-[14px] font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
                All people <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {relatedPeople.slice(0, 9).map((person, i) => (
                <motion.div
                  key={person.slug}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
                >
                  <Link href={`/people/${person.slug}`} data-testid={`card-person-${person.slug}`}>
                    <div className="group flex items-center gap-3 p-4 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-card hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer">
                      <img
                        src={getPersonImage(person.slug)}
                        alt={person.name}
                        className="w-11 h-11 rounded-full object-cover flex-shrink-0 bg-muted"
                        loading="lazy"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                          {person.name}
                        </h4>
                        <p className="text-[14px] text-muted-foreground truncate">{person.title}</p>
                      </div>
                      {(person.guestCount > 0 || person.mentionCount > 0) && (
                        <div className="flex items-center gap-2 text-[14px] text-muted-foreground/50 flex-shrink-0">
                          {person.guestCount > 0 && (
                            <span className="flex items-center gap-1">
                              <Mic className="w-3 h-3" />
                              {person.guestCount}
                            </span>
                          )}
                          {person.mentionCount > 0 && (
                            <span className="flex items-center gap-1">
                              <MessageSquare className="w-3 h-3" />
                              {person.mentionCount}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}

        {allPodcasts.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
            className="mb-12"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Podcast className="w-5 h-5 text-violet-500" />
                <h3 className="text-lg font-display font-bold text-foreground" data-testid="heading-podcasts">
                  Podcasts to Listen To
                </h3>
              </div>
              <Link href="/podcasts" className="text-[14px] font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
                All podcasts <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {allPodcasts.map((podcast, i) => (
                <motion.div
                  key={podcast.slug}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
                >
                  <Link href={`/podcasts/${podcast.slug}`} data-testid={`card-podcast-${podcast.slug}`}>
                    <div className="group flex items-center gap-3 p-4 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-card hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer">
                      <img
                        src={podcast.artworkUrl}
                        alt={podcast.name}
                        className="w-12 h-12 rounded-xl object-cover flex-shrink-0"
                        loading="lazy"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                          {podcast.name}
                        </h4>
                        <p className="text-[14px] text-muted-foreground truncate"><LinkedHosts hosts={podcast.hosts || ""} /></p>
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
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.54 }}
            className="mb-12"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-orange-500" />
                <h3 className="text-lg font-display font-bold text-foreground" data-testid="heading-companies">
                  Companies to Watch
                </h3>
              </div>
              <Link href="/companies" className="text-[14px] font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
                All companies <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {relatedCompanies.map((company, i) => (
                <motion.div
                  key={company.slug}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
                >
                  <Link href={`/companies/${company.slug}`} data-testid={`card-company-${company.slug}`}>
                    <div className="group flex items-center gap-3 p-4 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-card hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer">
                      <img
                        src={company.logoUrl}
                        alt={company.name}
                        className="w-9 h-9 rounded-lg object-contain flex-shrink-0 bg-muted p-0.5"
                        loading="lazy"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                          {company.name}
                        </h4>
                        <p className="text-[14px] text-muted-foreground truncate">{company.details.industry}</p>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}

        {topic && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.56 }}
            className="mb-8"
          >
            <div className="rounded-2xl bg-foreground text-background overflow-hidden">
              <div className="px-8 py-10 sm:py-12">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 sm:gap-10">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <Building2 className="w-4 h-4 text-primary" />
                      <span className="text-[14px] font-semibold uppercase tracking-[0.15em] text-primary">Enterprise</span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-display font-bold text-white mb-2" data-testid="heading-enterprise-cta">
                      Need {topicDisplayName.toLowerCase()} intelligence at scale?
                    </h3>
                    <p className="text-[15px] text-white/60 leading-relaxed max-w-xl">
                      Custom monitoring, automated alerts, and analyst-ready briefs on {topicDisplayName.toLowerCase()} — tailored to your team.
                    </p>
                  </div>
                  <Link href="/enterprise" data-testid="link-enterprise-cta">
                    <span className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-[15px] font-semibold hover:bg-primary/90 transition-colors cursor-pointer whitespace-nowrap">
                      Request Access <ArrowRight className="w-4 h-4" />
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {relatedTopics.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-5">
              <Tag className="w-5 h-5 text-muted-foreground" />
              <h3 className="text-lg font-display font-bold text-foreground" data-testid="heading-related-topics">
                Related Topics
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {relatedTopics.map(t => {
                const TIcon = ICON_MAP[t.icon] || Sparkles;
                return (
                  <Link key={t.slug} href={`${getCategoryPath(t.category)}/${t.slug}`} data-testid={`link-related-topic-${t.slug}`}>
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

      {topic && (
        <StickyEmailBar
          type={topic.category}
          slug={topic.slug}
          name={topicDisplayName}
        />
      )}
    </div>
  );
}