import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Building2,
  Lightbulb,
  Flame,
  ArrowUpRight,
  ArrowDownUp,
  BarChart3,
  Zap,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { PEOPLE_DIRECTORY, COMPANIES_DIRECTORY } from "@/data/entityDirectoryData";
import { SiteHeader } from "@/components/SiteHeader";

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
}

function SEOHead() {
  const title = "Trends - What's Trending in Podcasts | PodCap";
  const description = "See what's trending across the world's top podcasts. Track rising people, companies, and topics in real-time based on actual podcast mentions and discussions.";

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

function TrendBadge({ trend, changePercent, size = "default" }: { trend: string; changePercent: number; size?: "default" | "large" }) {
  const textSize = size === "large" ? "text-[16px]" : "text-[15px]";
  const iconSize = size === "large" ? "w-4 h-4" : "w-3.5 h-3.5";
  if (trend === "rising") {
    return (
      <span className={`inline-flex items-center gap-1 ${textSize} font-mono font-semibold text-emerald-600 dark:text-emerald-400`}>
        <TrendingUp className={iconSize} />
        +{Math.abs(changePercent)}%
      </span>
    );
  }
  if (trend === "falling") {
    return (
      <span className={`inline-flex items-center gap-1 ${textSize} font-mono font-semibold text-red-500 dark:text-red-400`}>
        <TrendingDown className={iconSize} />
        {changePercent}%
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 ${textSize} font-mono font-medium text-muted-foreground/60`}>
      <Minus className={iconSize} />
      Stable
    </span>
  );
}

function MentionBar({ count, maxCount }: { count: number; maxCount: number }) {
  const pct = maxCount > 0 ? Math.max(6, (count / maxCount) * 100) : 6;
  return (
    <div className="w-full max-w-[160px] bg-muted/40 rounded-full h-[7px] overflow-hidden">
      <div
        className="h-full bg-primary/60 rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function TypePill({ type }: { type: "person" | "company" | "topic" }) {
  const config = {
    person: { label: "Person", icon: Users, className: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800" },
    company: { label: "Company", icon: Building2, className: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800" },
    topic: { label: "Topic", icon: Lightbulb, className: "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800" },
  };
  const c = config[type];
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[13px] font-medium border ${c.className}`}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  );
}

function EntityAvatar({ entity }: { entity: UnifiedEntity }) {
  if (entity.type === "topic") {
    return (
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-violet-500/20 dark:from-purple-500/30 dark:to-violet-500/30 border border-purple-200 dark:border-purple-800 flex items-center justify-center flex-shrink-0">
        <Lightbulb className="w-5 h-5 text-purple-600 dark:text-purple-400" />
      </div>
    );
  }

  if (entity.type === "company") {
    return (
      <img
        src={entity.imageUrl || '/people/default-avatar.png'}
        alt={entity.name}
        className="w-10 h-10 rounded-xl object-contain bg-white dark:bg-zinc-900 border border-border p-0.5 flex-shrink-0"
        onError={(e) => { (e.target as HTMLImageElement).src = '/people/default-avatar.png'; }}
      />
    );
  }

  return (
    <img
      src={entity.imageUrl || '/people/default-avatar.png'}
      alt={entity.name}
      className="w-10 h-10 rounded-full object-cover border border-border flex-shrink-0"
      onError={(e) => { (e.target as HTMLImageElement).src = '/people/default-avatar.png'; }}
    />
  );
}

function BiggestMoverCard({ entity, rank }: { entity: UnifiedEntity; rank: number }) {
  return (
    <Link href={entity.href} data-testid={`mover-${entity.slug}`}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: rank * 0.08 }}
        className="group bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-5 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer h-full"
      >
        <div className="flex items-start gap-4">
          <div className="relative">
            <EntityAvatar entity={entity} />
            <div className="absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[13px] font-bold">
              {rank}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-[16px] font-bold text-foreground truncate group-hover:text-primary transition-colors">{entity.name}</h3>
              <TypePill type={entity.type} />
            </div>
            <p className="text-[15px] text-muted-foreground/70 truncate mb-2">{entity.subtitle}</p>
            <div className="flex items-center gap-3">
              <span className="text-[15px] font-mono text-muted-foreground">
                {entity.recentMentions} recent mentions
              </span>
              <TrendBadge trend={entity.trend} changePercent={entity.changePercent} />
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

export default function TrendsPage() {
  const [entityFilter, setEntityFilter] = useState<EntityType>("all");
  const [sortMode, setSortMode] = useState<SortMode>("volume");

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
        entities.push({
          slug: t.slug,
          name: t.name,
          subtitle: `${t.recentMentions} episodes this month`,
          type: "topic",
          recentMentions: t.recentMentions,
          totalMentions: t.mentionCount,
          trend: t.trend,
          changePercent: t.changePercent,
          href: `/topics/${t.slug}`,
        });
      }
    }

    return entities;
  }, [people, companies, topics]);

  const biggestMovers = useMemo(() => {
    return [...unifiedEntities]
      .filter(e => e.trend === "rising" && e.changePercent > 0)
      .sort((a, b) => {
        const scoreA = a.changePercent * Math.log2(a.recentMentions + 1);
        const scoreB = b.changePercent * Math.log2(b.recentMentions + 1);
        return scoreB - scoreA;
      })
      .slice(0, 5);
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

  const maxMentions = useMemo(() => {
    return Math.max(...filteredEntities.map(e => e.recentMentions), 1);
  }, [filteredEntities]);

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
    <div className="min-h-screen bg-background">
      <SEOHead />
      <SiteHeader />

      <div className="bg-gradient-to-b from-primary/[0.04] via-background to-background">
        <div className="max-w-7xl mx-auto px-6 pt-12 pb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <h1 className="text-3xl sm:text-[2.75rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.03em] mb-3" data-testid="text-page-title">
              The Pulse
            </h1>
            <p className="text-[18px] text-[#3F3F46] dark:text-[#A1A1AA] max-w-2xl mx-auto leading-relaxed" data-testid="text-page-description">
              Real-time intelligence on who and what is being discussed across the world's top podcasts
            </p>
          </motion.div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 pb-20">
        {isLoading ? (
          <div className="space-y-4 max-w-7xl mx-auto">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-muted" />
                  <div className="flex-1">
                    <div className="h-5 bg-muted rounded w-40 mb-2" />
                    <div className="h-4 bg-muted rounded w-56" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {biggestMovers.length > 0 && (
              <section className="mb-12" data-testid="section-biggest-movers">
                <div className="flex items-center gap-2.5 mb-5">
                  <Flame className="w-5 h-5 text-orange-500" />
                  <h2 className="text-[18px] font-bold uppercase tracking-[0.08em] text-foreground">Biggest Movers</h2>
                  <span className="text-[13px] font-mono text-muted-foreground/50 ml-1">Last 30 days</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {biggestMovers.map((entity, i) => (
                    <BiggestMoverCard key={entity.slug} entity={entity} rank={i + 1} />
                  ))}
                </div>
              </section>
            )}

            <section data-testid="section-trending-table">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
                <div className="flex items-center gap-2.5">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <h2 className="text-[18px] font-bold uppercase tracking-[0.08em] text-foreground">Trending Now</h2>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <div className="inline-flex items-center bg-card border border-border rounded-xl overflow-hidden" data-testid="entity-filter">
                    {filterOptions.map(({ key, label, icon: Icon }) => (
                      <button
                        key={key}
                        onClick={() => setEntityFilter(key)}
                        className={`flex items-center gap-1.5 px-4 py-2 text-[15px] font-semibold transition-all ${
                          entityFilter === key
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        data-testid={`filter-${key}`}
                      >
                        <Icon className="w-4 h-4" />
                        {label}
                        <span className={`text-[13px] font-mono ml-0.5 ${entityFilter === key ? "text-primary-foreground/70" : "text-muted-foreground/40"}`}>
                          {entityCounts[key]}
                        </span>
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => setSortMode(s => s === "volume" ? "momentum" : "volume")}
                    className="flex items-center gap-1.5 px-3 py-2 text-[15px] font-medium text-muted-foreground hover:text-foreground bg-card border border-border rounded-xl transition-colors"
                    data-testid="sort-toggle"
                  >
                    <ArrowDownUp className="w-4 h-4" />
                    {sortMode === "volume" ? "By Volume" : "By Momentum"}
                  </button>
                </div>
              </div>

              <div className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-2xl overflow-hidden">
                <div className="hidden sm:grid grid-cols-[2.5rem_1fr_auto_10rem_7rem] gap-x-4 items-center px-5 py-3 border-b border-black/[0.06] dark:border-white/[0.06]">
                  <span className="text-[13px] font-mono text-muted-foreground/50 uppercase tracking-wider">#</span>
                  <span className="text-[13px] font-mono text-muted-foreground/50 uppercase tracking-wider">Name</span>
                  <span className="text-[13px] font-mono text-muted-foreground/50 uppercase tracking-wider">Type</span>
                  <span className="text-[13px] font-mono text-muted-foreground/50 uppercase tracking-wider">Podcast Interest</span>
                  <span className="text-[13px] font-mono text-muted-foreground/50 uppercase tracking-wider text-right">Change</span>
                </div>

                {filteredEntities.map((entity, i) => (
                  <Link key={`${entity.type}-${entity.slug}`} href={entity.href} data-testid={`trend-row-${entity.slug}`}>
                    <motion.div
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.02 }}
                      className="grid grid-cols-[2.5rem_1fr_auto] sm:grid-cols-[2.5rem_1fr_auto_10rem_7rem] gap-x-4 items-center px-5 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer border-b border-black/[0.03] dark:border-white/[0.03] last:border-0"
                    >
                      <span className="text-[15px] font-mono text-muted-foreground/40 font-medium">{i + 1}</span>

                      <div className="flex items-center gap-3 min-w-0">
                        <EntityAvatar entity={entity} />
                        <div className="min-w-0">
                          <span className="text-[16px] font-semibold text-foreground block truncate">{entity.name}</span>
                          <span className="text-[15px] text-muted-foreground/60 block truncate sm:hidden">{entity.subtitle}</span>
                        </div>
                      </div>

                      <div className="hidden sm:block">
                        <TypePill type={entity.type} />
                      </div>

                      <div className="hidden sm:block">
                        <MentionBar count={entity.recentMentions} maxCount={maxMentions} />
                        <span className="text-[13px] font-mono text-muted-foreground/40 mt-0.5 block">
                          {entity.recentMentions} mentions
                        </span>
                      </div>

                      <div className="flex justify-end items-center gap-2">
                        <TrendBadge trend={entity.trend} changePercent={entity.changePercent} />
                        <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/30" />
                      </div>
                    </motion.div>
                  </Link>
                ))}

                {filteredEntities.length === 0 && (
                  <div className="px-5 py-12 text-center text-[16px] text-muted-foreground/60">
                    No trending data available for this filter
                  </div>
                )}
              </div>
            </section>

            <section className="mt-16" data-testid="section-explore-links">
              <div className="flex items-center gap-2.5 mb-5">
                <ArrowUpRight className="w-5 h-5 text-primary" />
                <h2 className="text-[18px] font-bold uppercase tracking-[0.08em] text-foreground">Explore More</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Link href="/people" data-testid="link-explore-people">
                  <div className="group bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-6 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer">
                    <Users className="w-6 h-6 text-blue-500 mb-3" />
                    <h3 className="text-[17px] font-bold text-foreground group-hover:text-primary transition-colors mb-1">People Directory</h3>
                    <p className="text-[15px] text-muted-foreground/70 leading-relaxed">Browse all tracked people, their podcast appearances, and mention history</p>
                  </div>
                </Link>
                <Link href="/companies" data-testid="link-explore-companies">
                  <div className="group bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-6 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer">
                    <Building2 className="w-6 h-6 text-amber-500 mb-3" />
                    <h3 className="text-[17px] font-bold text-foreground group-hover:text-primary transition-colors mb-1">Companies Directory</h3>
                    <p className="text-[15px] text-muted-foreground/70 leading-relaxed">Track company mentions across podcast conversations and industry analysis</p>
                  </div>
                </Link>
                <Link href="/topics" data-testid="link-explore-insights">
                  <div className="group bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-6 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer">
                    <Lightbulb className="w-6 h-6 text-purple-500 mb-3" />
                    <h3 className="text-[17px] font-bold text-foreground group-hover:text-primary transition-colors mb-1">Topic Intelligence</h3>
                    <p className="text-[15px] text-muted-foreground/70 leading-relaxed">Deep dive into trending topics with curated insights from top podcasts</p>
                  </div>
                </Link>
              </div>
            </section>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
