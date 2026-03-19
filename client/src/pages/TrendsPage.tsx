// See BRAND.md for all typography, color, spacing, and accessibility rules.
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { getTopicBySlug, getCategoryPath } from "@/data/topicData";
import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Building2,
  Lightbulb,
  Flame,
  ArrowDownUp,
  BarChart3,
  Zap,
  ChevronRight,
  BookOpen,
  Globe,
  Sparkles,
  Radio,
  Brain,
  Shield,
  Cloud,
  Leaf,
  Coins,
  Bot,
  Cpu,
  Video,
  LineChart,
  GitBranch,
  Cog,
  Heart,
  GitFork,
  Palette,
  Wallet,
  ArrowUpCircle,
  Scale,
  Megaphone,
  Handshake,
  Layout,
  Code,
  DollarSign,
  Crown,
  Rocket,
  UserPlus,
  GraduationCap,
  Target,
  Hammer,
  Briefcase,
  type LucideIcon,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { PEOPLE_DIRECTORY, COMPANIES_DIRECTORY } from "@/data/entityDirectoryData";
import { SiteHeader } from "@/components/SiteHeader";

const ICON_MAP: Record<string, LucideIcon> = {
  Brain,
  TrendingUp,
  Cloud,
  Shield,
  Leaf,
  Coins,
  Bot,
  Cpu,
  Video,
  LineChart,
  GitBranch,
  Cog,
  Heart,
  Zap,
  GitFork,
  Palette,
  Wallet,
  Globe,
  Flame,
  ArrowUpCircle,
  Scale,
  BarChart3,
  Building2,
  Megaphone,
  Handshake,
  Layout,
  Code,
  DollarSign,
  Crown,
  Rocket,
  Users,
  UserPlus,
  GraduationCap,
  Lightbulb,
  Target,
  Sparkles,
  Hammer,
  Briefcase,
};

interface PersonSummary {
  slug: string;
  name: string;
  title: string;
  mentionCount: number;
  guestCount: number;
  recentMentions: number;
  trend: "rising" | "stable" | "falling";
  changePercent: number;
}

interface CompanySummary {
  slug: string;
  name: string;
  description: string;
  mentionCount: number;
  recentMentions: number;
  trend: "rising" | "stable" | "falling";
  changePercent: number;
}

interface TopicSummary {
  slug: string;
  name: string;
  mentionCount: number;
  recentMentions: number;
  trend: "rising" | "stable" | "falling";
  changePercent: number;
}

type EntityType = "all" | "people" | "companies" | "topics";
type SortMode = "volume" | "momentum";

interface UnifiedEntity {
  slug: string;
  name: string;
  subtitle: string;
  type: "person" | "company" | "topic";
  recentMentions: number;
  totalMentions: number;
  trend: "rising" | "stable" | "falling";
  changePercent: number;
  imageUrl?: string;
  href: string;
  iconName?: string;
  topicCategory?: "industry" | "interest" | "role";
}

function SEOHead() {
  const title = "Podcast Trends — Trending People, Companies & Topics | PodRise";
  const description = "See which people, companies, and topics are gaining momentum across top podcasts right now. Real-time trend data from hundreds of shows, updated daily.";

  if (typeof document !== "undefined") {
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
    setOrCreate("property", "og:image", "https://podrise.com/og/og-trends.png");
    setOrCreate("name", "twitter:card", "summary_large_image");
    setOrCreate("name", "twitter:title", title);
    setOrCreate("name", "twitter:description", description);
  }
  return null;
}

function TrendBadge({ trend, changePercent, size = "default" }: { trend: string; changePercent: number; size?: "default" | "large" }) {
  const textSize = size === "large" ? "text-[15px]" : "text-[14px]";
  const py = size === "large" ? "py-1 px-2.5" : "py-0.5 px-2";
  if (trend === "rising") {
    return (
      <span className={`inline-flex items-center gap-1 ${textSize} ${py} font-mono font-semibold text-[#6366F1] bg-[#EEF2FF] rounded-md`}>
        <TrendingUp className="w-3.5 h-3.5" />
        +{Math.abs(changePercent)}%
      </span>
    );
  }
  if (trend === "falling") {
    return (
      <span className={`inline-flex items-center gap-1 ${textSize} ${py} font-mono font-semibold text-[#09090B] bg-[#F0F0F2] rounded-md`}>
        <TrendingDown className="w-3.5 h-3.5" />
        {changePercent}%
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 ${textSize} ${py} font-mono font-medium text-[#52525B] bg-[#F0F0F2] rounded-md`}>
      <Minus className="w-3.5 h-3.5" />
      Stable
    </span>
  );
}

function TypePill({ type, iconName }: { type: "person" | "company" | "topic"; iconName?: string }) {
  const config = {
    person: { label: "Person", icon: Users, className: "bg-[#EEF2FF] text-[#6366F1] border-[#E0E7FF]" },
    company: { label: "Company", icon: Building2, className: "bg-[#FFF7ED] text-[#9A3412] border-[#FFEDD5]" },
    topic: { label: "Topic", icon: Lightbulb, className: "bg-[#F5F3FF] text-[#7C3AED] border-[#EDE9FE]" },
  };
  const c = config[type];
  let Icon = c.icon;
  if (type === "topic" && iconName && ICON_MAP[iconName]) {
    Icon = ICON_MAP[iconName];
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[13px] font-medium border ${c.className}`}>
      <Icon className="w-3.5 h-3.5" />
      {c.label}
    </span>
  );
}

function EntityAvatar({ entity }: { entity: UnifiedEntity }) {
  if (entity.type === "topic") {
    const Icon = entity.iconName && ICON_MAP[entity.iconName] ? ICON_MAP[entity.iconName] : Lightbulb;
    return (
      <div className="w-12 h-12 rounded-xl bg-[#F5F3FF] border border-[#EDE9FE] flex items-center justify-center flex-shrink-0">
        <Icon className="w-6 h-6 text-[#7C3AED]" />
      </div>
    );
  }

  if (entity.type === "company") {
    return (
      <img
        src={entity.imageUrl || '/people/default-avatar.png'}
        alt={entity.name}
        className="w-12 h-12 rounded-xl object-contain bg-white dark:bg-zinc-900 border border-[#F0F0F2] p-0.5 flex-shrink-0"
        onError={(e) => { (e.target as HTMLImageElement).src = '/people/default-avatar.png'; }}
      />
    );
  }

  return (
    <img
      src={entity.imageUrl || '/people/default-avatar.png'}
      alt={entity.name}
      className="w-12 h-12 rounded-full object-cover border border-[#F0F0F2] flex-shrink-0"
      onError={(e) => { (e.target as HTMLImageElement).src = '/people/default-avatar.png'; }}
    />
  );
}

function SpotlightCard({ entity, rank }: { entity: UnifiedEntity; rank: number }) {
  return (
    <Link href={entity.href} data-testid={`spotlight-${entity.slug}`}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: rank * 0.08 }}
        className="group bg-white border border-[#F0F0F2] rounded-xl p-5 hover:shadow-lg hover:border-[#E4E4E7] transition-all cursor-pointer h-full flex flex-col"
      >
        <div className="flex items-start gap-3.5 flex-1">
          <div className="relative">
            <EntityAvatar entity={entity} />
            <div className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[12px] font-bold">
              {rank}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[18px] font-bold text-[#09090B] line-clamp-1 group-hover:text-primary transition-colors">{entity.name}</h3>
            <p className="text-[15px] text-[#52525B] line-clamp-2 mb-3">{entity.subtitle}</p>
            <div className="flex items-center justify-end gap-2">
              <TrendBadge trend={entity.trend} changePercent={entity.changePercent} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[15px] font-semibold text-primary">View profile</span>
          <ChevronRight className="w-3.5 h-3.5 text-primary" />
        </div>
      </motion.div>
    </Link>
  );
}

function CategorySection({
  title,
  icon: Icon,
  entities,
  accentColor,
  seeAllHref,
  seeAllLabel,
  delay = 0,
}: {
  title: string;
  icon: any;
  entities: UnifiedEntity[];
  accentColor: string;
  seeAllHref: string;
  seeAllLabel: string;
  delay?: number;
}) {
  if (entities.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="mb-10"
      data-testid={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-2.5">
          <div className={`w-9 h-9 rounded-lg ${accentColor} flex items-center justify-center self-center`}>
            <Icon className="w-5 h-5" />
          </div>
          <h2 className="text-[20px] font-semibold text-[#09090B]">{title}</h2>
          <span className="text-[15px] text-[#A1A1AA] ml-1">Last 30 days</span>
        </div>
        <Link
          href={seeAllHref}
          className="text-[15px] font-semibold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
          data-testid={`link-see-all-${title.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {seeAllLabel}
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="bg-white border border-[#F0F0F2] rounded-xl overflow-hidden">
        {entities.slice(0, 10).map((entity, i) => (
          <Link key={`${entity.type}-${entity.slug}`} href={entity.href} data-testid={`trend-row-${entity.slug}`}>
            <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 hover:bg-[#F7F7FC] transition-colors cursor-pointer border-b border-[#F0F0F2] last:border-0 group">
              <span className="text-[15px] font-mono text-[#A1A1AA] font-medium w-6 text-right shrink-0">{i + 1}</span>

              <EntityAvatar entity={entity} />

              <div className="flex-1 min-w-0">
                <span className="text-[17px] font-semibold text-[#09090B] block truncate group-hover:text-primary transition-colors">{entity.name}</span>
                <span className="text-[15px] text-[#52525B] block truncate">{entity.subtitle}</span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <TrendBadge trend={entity.trend} changePercent={entity.changePercent} />
                <ChevronRight className="w-4 h-4 text-[#A1A1AA] group-hover:text-primary transition-colors" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </motion.section>
  );
}

function GatewayCard({ href, icon: Icon, title, description, testId }: { href: string; icon: any; title: string; description: string; testId: string }) {
  return (
    <Link href={href} data-testid={testId}>
      <div className="group bg-white border border-[#F0F0F2] rounded-xl p-5 hover:shadow-md hover:border-[#E4E4E7] transition-all cursor-pointer h-full">
        <Icon className="w-5 h-5 text-primary mb-3" />
        <h3 className="text-[16px] font-bold text-[#09090B] group-hover:text-primary transition-colors mb-1">{title}</h3>
        <p className="text-[15px] text-[#52525B] leading-relaxed">{description}</p>
        <div className="flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[15px] font-semibold text-primary">Explore</span>
          <ChevronRight className="w-3.5 h-3.5 text-primary" />
        </div>
      </div>
    </Link>
  );
}

export default function TrendsPage() {
  const [entityFilter, setEntityFilter] = useState<EntityType>("all");
  const [sortMode, setSortMode] = useState<SortMode>("momentum");

  const { data: people, isLoading: loadingPeople } = useQuery<PersonSummary[]>({
    queryKey: ["/api/entities/people"],
  });

  const { data: companies, isLoading: loadingCompanies } = useQuery<CompanySummary[]>({
    queryKey: ["/api/entities/companies"],
  });

  const { data: topics, isLoading: loadingTopics } = useQuery<TopicSummary[]>({
    queryKey: ["/api/entities/topics"],
  });

  const unifiedEntities = useMemo(() => {
    const entities: UnifiedEntity[] = [];

    if (people) {
      for (const p of people) {
        if (p.recentMentions <= 0) continue;
        const personData = PEOPLE_DIRECTORY.find(pd => pd.slug === p.slug);
        entities.push({
          slug: p.slug,
          name: p.name,
          subtitle: p.title || "",
          type: "person",
          recentMentions: p.recentMentions,
          totalMentions: p.mentionCount + p.guestCount,
          trend: p.trend,
          changePercent: p.changePercent,
          imageUrl: personData?.imageUrl,
          href: `/people/${p.slug}`,
        });
      }
    }

    if (companies) {
      for (const c of companies) {
        if (c.recentMentions <= 0) continue;
        const companyData = COMPANIES_DIRECTORY.find(cd => cd.slug === c.slug);
        entities.push({
          slug: c.slug,
          name: c.name,
          subtitle: c.description || "",
          type: "company",
          recentMentions: c.recentMentions,
          totalMentions: c.mentionCount,
          trend: c.trend,
          changePercent: c.changePercent,
          imageUrl: companyData?.logoUrl,
          href: `/companies/${c.slug}`,
        });
      }
    }

    if (topics) {
      for (const t of topics) {
        if (t.recentMentions <= 0) continue;
        const topicConfig = getTopicBySlug(t.slug);
        const descSnippet = topicConfig?.description
          ? topicConfig.description.split('.')[0]
          : "";
        entities.push({
          slug: t.slug,
          name: t.name,
          subtitle: descSnippet,
          type: "topic",
          recentMentions: t.recentMentions,
          totalMentions: t.mentionCount,
          trend: t.trend,
          changePercent: t.changePercent,
          href: `${getCategoryPath(topicConfig?.category || "interest")}/${t.slug}`,
          iconName: topicConfig?.icon,
          topicCategory: topicConfig?.category,
        });
      }
    }

    return entities;
  }, [people, companies, topics]);

  const spotlightMovers = useMemo(() => {
    return [...unifiedEntities]
      .filter(e => e.trend === "rising" && e.changePercent > 0)
      .sort((a, b) => {
        const scoreA = a.changePercent * Math.log2(a.recentMentions + 1);
        const scoreB = b.changePercent * Math.log2(b.recentMentions + 1);
        return scoreB - scoreA;
      })
      .slice(0, 5);
  }, [unifiedEntities]);

  const risingPeople = useMemo(() => {
    return [...unifiedEntities]
      .filter(e => e.type === "person")
      .sort((a, b) => {
        if (a.trend === "rising" && b.trend !== "rising") return -1;
        if (b.trend === "rising" && a.trend !== "rising") return 1;
        return b.recentMentions - a.recentMentions;
      });
  }, [unifiedEntities]);

  const risingCompanies = useMemo(() => {
    return [...unifiedEntities]
      .filter(e => e.type === "company")
      .sort((a, b) => {
        if (a.trend === "rising" && b.trend !== "rising") return -1;
        if (b.trend === "rising" && a.trend !== "rising") return 1;
        return b.recentMentions - a.recentMentions;
      });
  }, [unifiedEntities]);

  const topicsByCategory = useMemo(() => {
    const topicEntities = [...unifiedEntities].filter(e => e.type === "topic");
    const sortFn = (a: UnifiedEntity, b: UnifiedEntity) => {
      if (a.trend === "rising" && b.trend !== "rising") return -1;
      if (b.trend === "rising" && a.trend !== "rising") return 1;
      return b.recentMentions - a.recentMentions;
    };
    return {
      industries: topicEntities.filter(e => e.topicCategory === "industry").sort(sortFn),
      roles: topicEntities.filter(e => e.topicCategory === "role").sort(sortFn),
      interests: topicEntities.filter(e => e.topicCategory === "interest").sort(sortFn),
    };
  }, [unifiedEntities]);

  const filteredEntities = useMemo(() => {
    let filtered = [...unifiedEntities];
    if (entityFilter !== "all") {
      const typeMap: Record<string, string> = { people: "person", companies: "company", topics: "topic" };
      filtered = filtered.filter(e => e.type === typeMap[entityFilter]);
    }

    if (sortMode === "volume") {
      filtered.sort((a, b) => b.recentMentions - a.recentMentions);
    } else {
      filtered.sort((a, b) => {
        if (a.trend === "rising" && b.trend !== "rising") return -1;
        if (b.trend === "rising" && a.trend !== "rising") return 1;
        return b.changePercent - a.changePercent;
      });
    }

    return filtered.slice(0, 30);
  }, [unifiedEntities, entityFilter, sortMode]);

  const isLoading = loadingPeople || loadingCompanies || loadingTopics;

  const filterOptions: { key: EntityType; label: string; icon: typeof Users }[] = [
    { key: "all", label: "All", icon: Zap },
    { key: "people", label: "People", icon: Users },
    { key: "companies", label: "Companies", icon: Building2 },
    { key: "topics", label: "Topics", icon: Lightbulb },
  ];

  const entityCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, people: 0, companies: 0, topics: 0 };
    for (const e of unifiedEntities) {
      counts.all++;
      if (e.type === "person") counts.people++;
      else if (e.type === "company") counts.companies++;
      else if (e.type === "topic") counts.topics++;
    }
    return counts;
  }, [unifiedEntities]);

  return (
    <div className="min-h-screen bg-background overflow-x-clip">
      <SEOHead />
      <SiteHeader />

      <div className="bg-[#F7F7FC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <div className="flex items-center justify-center gap-2 mb-3">
              <Radio className="w-4 h-4 text-primary" />
              <span className="text-[12px] font-bold uppercase tracking-[0.15em] text-primary">Discovery Radar</span>
            </div>
            <h1 className="text-[1.75rem] sm:text-4xl md:text-5xl font-extrabold text-[#09090B] tracking-tight leading-[1.15] mb-3" data-testid="text-page-title">
              What conversations are gaining momentum?
            </h1>
            <p className="text-[16px] sm:text-xl text-[#52525B] max-w-2xl mx-auto leading-relaxed" data-testid="text-page-description">
              Spot the people, companies, and ideas generating buzz across the world's top podcasts — then go deeper.
            </p>
          </motion.div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-8">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white border border-[#F0F0F2] rounded-xl p-5 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#F0F0F2]" />
                  <div className="flex-1">
                    <div className="h-5 bg-[#F0F0F2] rounded w-40 mb-2" />
                    <div className="h-4 bg-[#F0F0F2] rounded w-56" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {spotlightMovers.length > 0 && (
              <section className="mb-12" data-testid="section-spotlight">
                <div className="flex items-baseline gap-2.5 mb-5">
                  <Flame className="w-5 h-5 text-[#6366F1] self-center" />
                  <h2 className="text-[20px] font-semibold text-[#09090B]">Fastest Rising Right Now</h2>
                  <span className="text-[15px] text-[#A1A1AA] ml-1">Last 30 days</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-stretch">
                  {spotlightMovers.map((entity, i) => (
                    <SpotlightCard key={entity.slug} entity={entity} rank={i + 1} />
                  ))}
                </div>
              </section>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8">
              <div className="lg:col-span-2">
                <CategorySection
                  title="People in the Conversation"
                  icon={Users}
                  entities={risingPeople}
                  accentColor="bg-[#EEF2FF] text-[#6366F1]"
                  seeAllHref="/people"
                  seeAllLabel="All People"
                  delay={0.05}
                />

                <CategorySection
                  title="Companies Being Discussed"
                  icon={Building2}
                  entities={risingCompanies}
                  accentColor="bg-[#FFF7ED] text-[#9A3412]"
                  seeAllHref="/companies"
                  seeAllLabel="All Companies"
                  delay={0.1}
                />

              </div>

              <div className="lg:col-span-1 mt-8 lg:mt-0 pt-8 lg:pt-0 border-t lg:border-t-0 lg:border-l border-[#F0F0F2] lg:pl-8">
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                >
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-[#EEF2FF] flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-primary" />
                    </div>
                    <h2 className="text-[20px] font-semibold text-[#09090B]">Go Deeper</h2>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:sticky lg:top-[84px]">
                    <GatewayCard
                      href="/people"
                      icon={Users}
                      title="People Directory"
                      description="Browse influential voices — their podcast appearances, mentions, and what they're talking about"
                      testId="link-explore-people"
                    />
                    <GatewayCard
                      href="/companies"
                      icon={Building2}
                      title="Company Tracker"
                      description="See which companies are generating conversation and why they're in the spotlight"
                      testId="link-explore-companies"
                    />
                    <GatewayCard
                      href="/shop"
                      icon={BookOpen}
                      title="Podcast Shop"
                      description="Discover books and products that the world's smartest podcasters keep recommending"
                      testId="link-explore-shop"
                    />
                  </div>
                </motion.div>
              </div>
            </div>

            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25 }}
              className="mt-12"
              data-testid="section-full-table"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
                <div className="flex items-center gap-2.5">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <h2 className="text-[20px] font-semibold text-[#09090B]">Full Leaderboard</h2>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0 max-w-full">
                  <div className="flex items-center bg-white border border-[#F0F0F2] rounded-xl overflow-x-auto hide-scrollbar max-w-full min-w-0" data-testid="entity-filter">
                    {filterOptions.map(({ key, label, icon: Icon }) => (
                      <button
                        key={key}
                        onClick={() => setEntityFilter(key)}
                        className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-2 text-[15px] font-semibold transition-all whitespace-nowrap ${
                          entityFilter === key
                            ? "bg-primary text-white"
                            : "text-[#52525B] hover:text-[#09090B]"
                        }`}
                        data-testid={`filter-${key}`}
                      >
                        <Icon className="w-3.5 h-3.5 hidden sm:block" />
                        {label}
                        <span className={`text-[12px] font-mono ml-0.5 ${entityFilter === key ? "text-white/70" : "text-[#A1A1AA]"}`}>
                          {entityCounts[key]}
                        </span>
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => setSortMode(s => s === "volume" ? "momentum" : "volume")}
                    className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-[15px] font-medium text-[#52525B] hover:text-[#09090B] bg-white border border-[#F0F0F2] rounded-xl transition-colors whitespace-nowrap"
                    data-testid="sort-toggle"
                  >
                    <ArrowDownUp className="w-3.5 h-3.5" />
                    {sortMode === "volume" ? "By Volume" : "By Momentum"}
                  </button>
                </div>
              </div>

              <div className="bg-white border border-[#F0F0F2] rounded-xl overflow-hidden">
                <div className="hidden sm:grid grid-cols-[2.5rem_1fr_auto_7rem] gap-x-4 items-center px-5 py-3 border-b border-[#F0F0F2]">
                  <span className="text-[12px] font-mono text-[#A1A1AA] uppercase tracking-wider">#</span>
                  <span className="text-[12px] font-mono text-[#A1A1AA] uppercase tracking-wider">Name</span>
                  <span className="text-[12px] font-mono text-[#A1A1AA] uppercase tracking-wider">Type</span>
                  <span className="text-[12px] font-mono text-[#A1A1AA] uppercase tracking-wider text-right">Change</span>
                </div>

                {filteredEntities.map((entity, i) => (
                  <Link key={`${entity.type}-${entity.slug}`} href={entity.href} data-testid={`leaderboard-row-${entity.slug}`}>
                    <motion.div
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.02 }}
                      className="grid grid-cols-[2.5rem_1fr_auto] sm:grid-cols-[2.5rem_1fr_auto_7rem] gap-x-4 items-center px-5 py-3.5 hover:bg-[#F7F7FC] transition-colors cursor-pointer border-b border-[#F0F0F2] last:border-0 group"
                    >
                      <span className="text-[15px] font-mono text-[#A1A1AA] font-medium">{i + 1}</span>

                      <div className="flex items-center gap-3 min-w-0">
                        <EntityAvatar entity={entity} />
                        <div className="min-w-0">
                          <span className="text-[17px] font-semibold text-[#09090B] block truncate group-hover:text-primary transition-colors">{entity.name}</span>
                          <span className="text-[15px] text-[#52525B] block truncate sm:hidden">{entity.subtitle}</span>
                        </div>
                      </div>

                      <div className="hidden sm:block">
                        <TypePill type={entity.type} iconName={entity.iconName} />
                      </div>

                      <div className="flex justify-end items-center gap-2">
                        <TrendBadge trend={entity.trend} changePercent={entity.changePercent} />
                        <ChevronRight className="w-4 h-4 text-[#A1A1AA] group-hover:text-primary transition-colors" />
                      </div>
                    </motion.div>
                  </Link>
                ))}

                {filteredEntities.length === 0 && (
                  <div className="px-5 py-12 text-center text-[16px] text-[#52525B]">
                    No trending data available for this filter
                  </div>
                )}
              </div>
            </motion.section>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
