import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Search, ChevronDown, TrendingUp, TrendingDown, Minus, Flame, BarChart3, Users, ArrowUpRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Footer } from "@/components/Footer";
import { PEOPLE_DIRECTORY } from "@/data/entityDirectoryData";
import { SiteHeader } from "@/components/SiteHeader";

interface PersonSummary {
  slug: string;
  name: string;
  title: string;
  mentionCount: number;
  guestCount: number;
  gender: string;
  category: string;
  recentMentions: number;
  trend: "rising" | "stable" | "falling";
  changePercent: number;
}

const CATEGORIES = [
  "All Categories",
  "Tech & AI",
  "Venture Capital",
  "Business & Entrepreneurship",
  "Creator & Influencer",
  "Media & Journalism",
  "Author & Thought Leader",
  "Finance & Investing",
  "Entertainment",
  "Politics & Public Figures",
  "Science & Health",
];

type TabId = "overview" | "trending" | "rising" | "directory";

const TABS: { id: TabId; label: string; icon: typeof BarChart3 }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "trending", label: "Trending", icon: Flame },
  { id: "rising", label: "Rising", icon: TrendingUp },
  { id: "directory", label: "Directory", icon: Users },
];

const PIE_COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(262, 83%, 58%)",
  "hsl(174, 60%, 41%)",
  "hsl(37, 90%, 51%)",
  "hsl(350, 72%, 50%)",
  "hsl(190, 75%, 44%)",
  "hsl(142, 71%, 45%)",
  "hsl(280, 67%, 56%)",
  "hsl(25, 95%, 53%)",
  "hsl(47, 96%, 53%)",
];

function SEOHead() {
  const title = "People Intelligence - Who's Trending in Podcasts | PodCap";
  const description = "Track who's trending across the world's top podcasts. See which founders, investors, and leaders are being discussed most, discover rising voices, and explore mention trends over time.";

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

function TrendBadge({ trend, changePercent }: { trend: string; changePercent: number }) {
  if (trend === "rising") {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] font-mono text-emerald-600 dark:text-emerald-400">
        <TrendingUp className="w-3 h-3" />
        +{Math.abs(changePercent)}%
      </span>
    );
  }
  if (trend === "falling") {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] font-mono text-red-500 dark:text-red-400">
        <TrendingDown className="w-3 h-3" />
        {changePercent}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-mono text-muted-foreground/60">
      <Minus className="w-3 h-3" />
      Stable
    </span>
  );
}

function MentionBar({ count, maxCount }: { count: number; maxCount: number }) {
  const pct = maxCount > 0 ? Math.max(4, (count / maxCount) * 100) : 4;
  return (
    <div className="w-full max-w-[120px] bg-muted/40 rounded-full h-[6px] overflow-hidden">
      <div
        className="h-full bg-primary/60 rounded-full transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold text-foreground truncate max-w-[200px]">{label}</p>
      <p className="text-muted-foreground">{payload[0].value} total mentions</p>
    </div>
  );
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold text-foreground">{payload[0].name}</p>
      <p className="text-muted-foreground">{payload[0].value} people</p>
    </div>
  );
}

const PAGE_SIZE = 20;

export default function PeopleDirectory() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [sortBy, setSortBy] = useState<"total" | "trending" | "guests">("total");
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const { data: people, isLoading } = useQuery<PersonSummary[]>({
    queryKey: ["/api/entities/people"],
  });

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const getPersonData = (slug: string) => PEOPLE_DIRECTORY.find(p => p.slug === slug);

  const trendingPeople = useMemo(() => {
    if (!people) return [];
    return [...people]
      .filter(p => p.recentMentions > 0)
      .sort((a, b) => b.recentMentions - a.recentMentions)
      .slice(0, 12);
  }, [people]);

  const risingPeople = useMemo(() => {
    if (!people) return [];
    return [...people]
      .filter(p => p.trend === "rising" && p.recentMentions > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 12);
  }, [people]);

  const maxMentions = useMemo(() => {
    if (!people) return 1;
    return Math.max(...people.map(p => p.mentionCount + p.guestCount), 1);
  }, [people]);

  const filteredPeople = useMemo(() => {
    if (!people) return [];

    let result = [...people];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) || p.title.toLowerCase().includes(q)
      );
    }

    if (categoryFilter !== "All Categories") {
      result = result.filter(p => p.category === categoryFilter);
    }

    if (sortBy === "trending") {
      result.sort((a, b) => b.recentMentions - a.recentMentions);
    } else if (sortBy === "guests") {
      result.sort((a, b) => b.guestCount - a.guestCount);
    } else {
      result.sort((a, b) => (b.mentionCount + b.guestCount) - (a.mentionCount + a.guestCount));
    }

    return result;
  }, [people, searchQuery, categoryFilter, sortBy]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, categoryFilter, sortBy]);

  useEffect(() => {
    if (searchQuery.trim()) {
      setActiveTab("directory");
    }
  }, [searchQuery]);

  const visiblePeople = filteredPeople.slice(0, visibleCount);
  const hasMore = visibleCount < filteredPeople.length;
  const isSearching = searchQuery.trim().length > 0;

  const topBarChartData = useMemo(() => {
    if (!people) return [];
    return [...people]
      .sort((a, b) => (b.mentionCount + b.guestCount) - (a.mentionCount + a.guestCount))
      .slice(0, 10)
      .map(p => ({
        name: p.name.length > 18 ? p.name.slice(0, 16) + "..." : p.name,
        fullName: p.name,
        mentions: p.mentionCount + p.guestCount,
      }));
  }, [people]);

  const categoryDistribution = useMemo(() => {
    if (!people) return [];
    const counts: Record<string, number> = {};
    people.forEach(p => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [people]);

  const trendDistribution = useMemo(() => {
    if (!people) return [];
    const rising = people.filter(p => p.trend === "rising").length;
    const stable = people.filter(p => p.trend === "stable").length;
    const falling = people.filter(p => p.trend === "falling").length;
    return [
      { name: "Rising", value: rising, color: "hsl(142, 71%, 45%)" },
      { name: "Stable", value: stable, color: "hsl(220, 9%, 46%)" },
      { name: "Declining", value: falling, color: "hsl(0, 72%, 51%)" },
    ].filter(d => d.value > 0);
  }, [people]);

  const stats = useMemo(() => {
    if (!people) return { total: 0, rising: 0, totalMentions: 0, categories: 0 };
    const categories = new Set(people.map(p => p.category));
    return {
      total: people.length,
      rising: people.filter(p => p.trend === "rising").length,
      totalMentions: people.reduce((sum, p) => sum + p.mentionCount + p.guestCount, 0),
      categories: categories.size,
    };
  }, [people]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead />
      <SiteHeader />

      <div className="bg-gradient-to-b from-primary/[0.04] via-background to-background">
        <div className="max-w-5xl mx-auto px-6 pt-12 pb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-6"
          >
            <h1 className="text-3xl sm:text-[2.75rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.03em] mb-3" data-testid="heading-people">
              People Intelligence
            </h1>
            <p className="text-lg text-[#3F3F46] dark:text-[#A1A1AA] max-w-2xl mx-auto leading-relaxed" data-testid="text-page-description">
              Track who's being discussed across the world's top podcasts. See trending mentions, rising voices, and explore every episode.
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
                placeholder="Search people by name or title..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 text-[17px] bg-card border border-black/[0.1] dark:border-white/[0.1] rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all shadow-sm"
                data-testid="input-search-people"
              />
              {searchQuery && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-mono text-muted-foreground/60">
                  {filteredPeople.length} result{filteredPeople.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="sticky top-[68px] z-40 bg-background/95 backdrop-blur-md border-b border-black/[0.06] dark:border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-1 overflow-x-auto scrollbar-hide py-1" data-testid="nav-tabs">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-[14px] font-medium rounded-lg whitespace-nowrap transition-all ${
                    isActive
                      ? "bg-primary/[0.12] text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                  data-testid={`tab-${tab.id}`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8 pb-20">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-full bg-muted" />
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
            {activeTab === "overview" && !isSearching && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                key="overview"
              >

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <div className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-6">
                    <h3 className="text-[15px] font-semibold text-foreground mb-4" data-testid="chart-heading-top-mentioned">Top Mentioned People</h3>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topBarChartData} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
                          <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.3} tickLine={false} axisLine={false} />
                          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.3} tickLine={false} axisLine={false} />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.3 }} />
                          <Bar dataKey="mentions" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6">
                    <div className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-6">
                      <h3 className="text-[15px] font-semibold text-foreground mb-4" data-testid="chart-heading-categories">By Category</h3>
                      <div className="flex items-center gap-4">
                        <div className="w-[140px] h-[140px] flex-shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={categoryDistribution}
                                cx="50%"
                                cy="50%"
                                innerRadius={35}
                                outerRadius={65}
                                paddingAngle={2}
                                dataKey="value"
                              >
                                {categoryDistribution.map((_, i) => (
                                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip content={<PieTooltip />} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex-1 space-y-1.5 max-h-[140px] overflow-y-auto">
                          {categoryDistribution.map((cat, i) => (
                            <div key={cat.name} className="flex items-center gap-2 text-[13px]">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                              <span className="text-muted-foreground truncate flex-1">{cat.name}</span>
                              <span className="font-mono text-foreground font-medium">{cat.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-6">
                      <h3 className="text-[15px] font-semibold text-foreground mb-4" data-testid="chart-heading-trends">Trend Distribution</h3>
                      <div className="flex items-center gap-6">
                        <div className="w-[100px] h-[100px] flex-shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={trendDistribution}
                                cx="50%"
                                cy="50%"
                                innerRadius={28}
                                outerRadius={48}
                                paddingAngle={3}
                                dataKey="value"
                              >
                                {trendDistribution.map((entry, i) => (
                                  <Cell key={i} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip content={<PieTooltip />} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex-1 space-y-2">
                          {trendDistribution.map(d => (
                            <div key={d.name} className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                              <span className="text-[13px] text-muted-foreground flex-1">{d.name}</span>
                              <span className="text-[15px] font-mono font-semibold text-foreground">{d.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[15px] font-semibold text-foreground">Quick Movers</h3>
                    <button onClick={() => setActiveTab("rising")} className="text-[13px] font-medium text-primary hover:text-primary/80 flex items-center gap-1 transition-colors" data-testid="link-see-all-rising">
                      See all <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {risingPeople.slice(0, 6).map((person, i) => {
                      const personData = getPersonData(person.slug);
                      return (
                        <Link key={person.slug} href={`/people/${person.slug}`} data-testid={`card-quick-mover-${person.slug}`}>
                          <div className="group flex items-center gap-3 p-3 rounded-lg hover:bg-muted/40 transition-all cursor-pointer">
                            <img
                              src={personData?.imageUrl || '/people/default-avatar.png'}
                              alt={person.name}
                              className="w-10 h-10 rounded-full object-cover border border-border flex-shrink-0"
                              onError={(e) => { (e.target as HTMLImageElement).src = '/people/default-avatar.png'; }}
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-[14px] font-semibold text-foreground group-hover:text-primary transition-colors block truncate">{person.name}</span>
                              <span className="text-[12px] text-muted-foreground/60 truncate block">{person.title}</span>
                            </div>
                            <TrendBadge trend={person.trend} changePercent={person.changePercent} />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "trending" && !isSearching && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                key="trending"
              >
                <div className="flex items-center gap-2 mb-6">
                  <Flame className="w-5 h-5 text-orange-500" />
                  <h2 className="text-lg font-display font-bold text-foreground" data-testid="heading-trending-people">Most Mentioned (Last 30 Days)</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {trendingPeople.map((person, i) => {
                    const personData = getPersonData(person.slug);
                    return (
                      <motion.div
                        key={person.slug}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.03 }}
                      >
                        <Link href={`/people/${person.slug}`} data-testid={`card-trending-${person.slug}`}>
                          <div className="group relative bg-card border border-black/[0.08] dark:border-white/[0.08] rounded-xl p-5 hover:border-orange-500/30 hover:shadow-md transition-all cursor-pointer">
                            <div className="flex items-start gap-3">
                              <span className="text-[20px] font-mono font-bold text-muted-foreground/30 leading-none mt-0.5">{i + 1}</span>
                              <img
                                src={personData?.imageUrl || '/people/default-avatar.png'}
                                alt={person.name}
                                className="w-11 h-11 rounded-full object-cover border-2 border-border flex-shrink-0"
                                onError={(e) => { (e.target as HTMLImageElement).src = '/people/default-avatar.png'; }}
                              />
                              <div className="flex-1 min-w-0">
                                <h3 className="text-[17px] font-display font-bold text-foreground group-hover:text-primary transition-colors truncate">
                                  {person.name}
                                </h3>
                                <p className="text-[13px] text-muted-foreground/70 truncate">{person.title}</p>
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="text-[13px] font-mono text-foreground font-semibold">{person.recentMentions} mentions</span>
                                  <TrendBadge trend={person.trend} changePercent={person.changePercent} />
                                </div>
                              </div>
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {activeTab === "rising" && !isSearching && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                key="rising"
              >
                <div className="flex items-center gap-2 mb-6">
                  <TrendingUp className="w-5 h-5 text-emerald-500" />
                  <h2 className="text-lg font-display font-bold text-foreground" data-testid="heading-rising-people">Rising</h2>
                  <span className="text-[13px] text-muted-foreground/60 ml-1">Biggest increase in mentions</span>
                </div>
                <div className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl overflow-hidden">
                  <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 px-5 py-3 border-b border-black/[0.04] dark:border-white/[0.04] text-[13px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                    <span className="w-6">#</span>
                    <span>Person</span>
                    <span>Recent</span>
                    <span>Total</span>
                    <span>Change</span>
                  </div>
                  {risingPeople.map((person, i) => {
                    const personData = getPersonData(person.slug);
                    return (
                      <Link key={person.slug} href={`/people/${person.slug}`} data-testid={`row-rising-${person.slug}`}>
                        <div className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 items-center px-5 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer border-b border-black/[0.03] dark:border-white/[0.03] last:border-0">
                          <span className="text-[15px] font-mono text-muted-foreground/40 w-6">{i + 1}</span>
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={personData?.imageUrl || '/people/default-avatar.png'}
                              alt={person.name}
                              className="w-9 h-9 rounded-full object-cover border border-border flex-shrink-0"
                              onError={(e) => { (e.target as HTMLImageElement).src = '/people/default-avatar.png'; }}
                            />
                            <div className="min-w-0">
                              <span className="text-[15px] font-semibold text-foreground block truncate">{person.name}</span>
                              <span className="text-[12px] text-muted-foreground/60 truncate block">{person.title}</span>
                            </div>
                          </div>
                          <span className="text-[14px] font-mono text-foreground font-medium">{person.recentMentions}</span>
                          <span className="hidden sm:block text-[14px] font-mono text-muted-foreground">{person.mentionCount + person.guestCount}</span>
                          <TrendBadge trend={person.trend} changePercent={person.changePercent} />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {(activeTab === "directory" || isSearching) && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                key="directory"
              >
                <div className="flex flex-wrap items-center gap-3 mb-5">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    <h2 className="text-[15px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-all-people">
                      {isSearching ? "Search Results" : "All People"}
                    </h2>
                    <span className="text-[13px] font-mono text-muted-foreground/60 ml-1">
                      {filteredPeople.length}
                    </span>
                  </div>
                  <div className="flex-1" />
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="appearance-none pl-3 pr-7 py-1.5 bg-card border border-border rounded-lg text-[14px] text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        data-testid="select-category-filter"
                      >
                        {CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                    </div>
                    <div className="flex items-center bg-card border border-border rounded-lg overflow-hidden" data-testid="sort-control">
                      {([["total", "Top"], ["trending", "Trending"], ["guests", "Guests"]] as const).map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => setSortBy(val)}
                          className={`px-3 py-1.5 text-[13px] font-medium transition-all ${sortBy === val ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                          data-testid={`sort-${val}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl overflow-hidden">
                  <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 px-5 py-3 border-b border-black/[0.04] dark:border-white/[0.04] text-[13px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                    <span className="w-6">#</span>
                    <span>Person</span>
                    <span>Mentions</span>
                    <span>Podcast Interest</span>
                    <span>Trend</span>
                  </div>
                  {visiblePeople.map((person, index) => {
                    const personData = getPersonData(person.slug);
                    const totalActivity = person.mentionCount + person.guestCount;
                    return (
                      <motion.div
                        key={person.slug}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2, delay: Math.min(index * 0.01, 0.3) }}
                      >
                        <Link href={`/people/${person.slug}`} data-testid={`card-person-${person.slug}`}>
                          <div className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 items-center px-5 py-4 hover:bg-muted/30 transition-colors cursor-pointer border-b border-black/[0.03] dark:border-white/[0.03] last:border-0 group">
                            <span className="text-[14px] font-mono text-muted-foreground/40 w-6">{index + 1}</span>
                            <div className="flex items-center gap-3 min-w-0">
                              <img
                                src={personData?.imageUrl || '/people/default-avatar.png'}
                                alt={person.name}
                                className="w-10 h-10 rounded-full object-cover border border-border flex-shrink-0 group-hover:border-primary/30 transition-colors"
                                loading="lazy"
                                onError={(e) => { (e.target as HTMLImageElement).src = '/people/default-avatar.png'; }}
                              />
                              <div className="min-w-0">
                                <span className="text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors block truncate" data-testid={`text-person-name-${person.slug}`}>
                                  {person.name}
                                </span>
                                <span className="text-[13px] text-muted-foreground/60 truncate block">{person.title}</span>
                              </div>
                            </div>
                            <span className="text-[14px] font-mono text-foreground font-medium">{totalActivity}</span>
                            <div className="hidden sm:block">
                              <MentionBar count={totalActivity} maxCount={maxMentions} />
                            </div>
                            <div className="hidden sm:block">
                              <TrendBadge trend={person.trend} changePercent={person.changePercent} />
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>

                {filteredPeople.length === 0 && (
                  <div className="text-center py-20">
                    <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground" data-testid="text-no-results">No people match your search</p>
                  </div>
                )}

                {hasMore && (
                  <div className="flex justify-center pt-6">
                    <button
                      onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                      className="px-6 py-2.5 bg-primary/10 border border-primary/20 rounded-xl text-[15px] font-semibold text-primary hover:bg-primary/15 transition-colors"
                      data-testid="button-show-more"
                    >
                      Show More
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
