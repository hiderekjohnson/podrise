import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, Users, Building2, Flame, ArrowUpRight } from "lucide-react";
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

type Tab = "people" | "companies";

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

function TrendBadge({ trend, changePercent }: { trend: string; changePercent: number }) {
  if (trend === "rising") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-mono text-emerald-600 dark:text-emerald-400">
        <TrendingUp className="w-3 h-3" />
        +{Math.abs(changePercent)}%
      </span>
    );
  }
  if (trend === "falling") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-mono text-red-500 dark:text-red-400">
        <TrendingDown className="w-3 h-3" />
        {changePercent}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-mono text-muted-foreground/60">
      <Minus className="w-3 h-3" />
      Stable
    </span>
  );
}

function MentionBar({ count, maxCount }: { count: number; maxCount: number }) {
  const pct = maxCount > 0 ? Math.max(4, (count / maxCount) * 100) : 4;
  return (
    <div className="w-full max-w-[140px] bg-muted/40 rounded-full h-[6px] overflow-hidden">
      <div
        className="h-full bg-primary/60 rounded-full transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function TrendsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("people");

  const { data: people, isLoading: loadingPeople } = useQuery<PersonSummary[]>({
    queryKey: ["/api/entities/people"],
  });

  const { data: companies, isLoading: loadingCompanies } = useQuery<CompanySummary[]>({
    queryKey: ["/api/entities/companies"],
  });

  const topPeople = useMemo(() => {
    if (!people) return [];
    return [...people]
      .filter(p => p.recentMentions > 0)
      .sort((a, b) => b.recentMentions - a.recentMentions)
      .slice(0, 10);
  }, [people]);

  const risingPeople = useMemo(() => {
    if (!people) return [];
    return [...people]
      .filter(p => p.trend === "rising" && p.recentMentions > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 10);
  }, [people]);

  const topCompanies = useMemo(() => {
    if (!companies) return [];
    return [...companies]
      .filter(c => c.recentMentions > 0)
      .sort((a, b) => b.recentMentions - a.recentMentions)
      .slice(0, 10);
  }, [companies]);

  const risingCompanies = useMemo(() => {
    if (!companies) return [];
    return [...companies]
      .filter(c => c.trend === "rising" && c.recentMentions > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 10);
  }, [companies]);

  const maxPeopleMentions = useMemo(() => {
    return Math.max(...topPeople.map(p => p.recentMentions), 1);
  }, [topPeople]);

  const maxCompanyMentions = useMemo(() => {
    return Math.max(...topCompanies.map(c => c.recentMentions), 1);
  }, [topCompanies]);

  const isLoading = loadingPeople || loadingCompanies;

  return (
    <div className="min-h-screen bg-background">
      <SEOHead />
      <SiteHeader />

      <div className="bg-gradient-to-b from-primary/[0.04] via-background to-background">
        <div className="max-w-5xl mx-auto px-6 pt-12 pb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            <h1 className="text-3xl sm:text-[2.75rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.03em] mb-3" data-testid="text-page-title">
              Trending Now
            </h1>
            <p className="text-lg text-[#3F3F46] dark:text-[#A1A1AA] max-w-2xl mx-auto leading-relaxed" data-testid="text-page-description">
              Real-time intelligence on who and what is being discussed across the world's top podcasts.
            </p>
          </motion.div>

          <div className="flex justify-center">
            <div className="inline-flex items-center bg-card border border-border rounded-xl overflow-hidden" data-testid="trends-tabs">
              {([
                ["people", "People", Users],
                ["companies", "Companies", Building2],
              ] as const).map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-2 px-5 py-2.5 text-[15px] font-semibold transition-all ${
                    activeTab === key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`tab-${key}`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 pb-20">
        {isLoading ? (
          <div className="space-y-4 max-w-4xl mx-auto">
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
            {activeTab === "people" && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Flame className="w-4 h-4 text-orange-500" />
                      <h2 className="text-[15px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-top-people">Top People</h2>
                      <span className="text-[13px] font-mono text-muted-foreground/50 ml-1">Last 30 days</span>
                    </div>
                    <div className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl overflow-hidden">
                      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-4 py-2.5 border-b border-black/[0.04] dark:border-white/[0.04] text-[13px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                        <span>#</span>
                        <span>Person</span>
                        <span>Podcast Interest</span>
                        <span>Change</span>
                      </div>
                      {topPeople.map((person, i) => {
                        const personData = PEOPLE_DIRECTORY.find(p => p.slug === person.slug);
                        return (
                          <Link key={person.slug} href={`/people/${person.slug}`} data-testid={`trend-person-${person.slug}`}>
                            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 items-center px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer border-b border-black/[0.02] dark:border-white/[0.02] last:border-0">
                              <span className="text-[14px] font-mono text-muted-foreground/40 w-5">{i + 1}</span>
                              <div className="flex items-center gap-2.5 min-w-0">
                                <img
                                  src={personData?.imageUrl || '/people/default-avatar.png'}
                                  alt={person.name}
                                  className="w-8 h-8 rounded-full object-cover border border-border flex-shrink-0"
                                  onError={(e) => { (e.target as HTMLImageElement).src = '/people/default-avatar.png'; }}
                                />
                                <span className="text-[14px] font-semibold text-foreground truncate">{person.name}</span>
                              </div>
                              <MentionBar count={person.recentMentions} maxCount={maxPeopleMentions} />
                              <TrendBadge trend={person.trend} changePercent={person.changePercent} />
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                    <Link href="/people" className="flex items-center gap-1 text-[14px] font-medium text-primary mt-3 hover:text-primary/80 transition-colors" data-testid="link-all-people">
                      View all people <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                      <h2 className="text-[15px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-rising-people">Rising People</h2>
                      <span className="text-[13px] font-mono text-muted-foreground/50 ml-1">Last 30 days</span>
                    </div>
                    <div className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl overflow-hidden">
                      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-4 py-2.5 border-b border-black/[0.04] dark:border-white/[0.04] text-[13px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                        <span>#</span>
                        <span>Person</span>
                        <span>Podcast Interest</span>
                        <span>Change</span>
                      </div>
                      {risingPeople.length > 0 ? risingPeople.map((person, i) => {
                        const personData = PEOPLE_DIRECTORY.find(p => p.slug === person.slug);
                        return (
                          <Link key={person.slug} href={`/people/${person.slug}`} data-testid={`rising-person-${person.slug}`}>
                            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 items-center px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer border-b border-black/[0.02] dark:border-white/[0.02] last:border-0">
                              <span className="text-[14px] font-mono text-muted-foreground/40 w-5">{i + 1}</span>
                              <div className="flex items-center gap-2.5 min-w-0">
                                <img
                                  src={personData?.imageUrl || '/people/default-avatar.png'}
                                  alt={person.name}
                                  className="w-8 h-8 rounded-full object-cover border border-border flex-shrink-0"
                                  onError={(e) => { (e.target as HTMLImageElement).src = '/people/default-avatar.png'; }}
                                />
                                <span className="text-[14px] font-semibold text-foreground truncate">{person.name}</span>
                              </div>
                              <MentionBar count={person.recentMentions} maxCount={maxPeopleMentions} />
                              <TrendBadge trend={person.trend} changePercent={person.changePercent} />
                            </div>
                          </Link>
                        );
                      }) : (
                        <div className="px-4 py-8 text-center text-muted-foreground/60 text-[14px]">No rising trends detected yet</div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "companies" && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Flame className="w-4 h-4 text-orange-500" />
                      <h2 className="text-[15px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-top-companies">Top Companies</h2>
                      <span className="text-[13px] font-mono text-muted-foreground/50 ml-1">Last 30 days</span>
                    </div>
                    <div className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl overflow-hidden">
                      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-4 py-2.5 border-b border-black/[0.04] dark:border-white/[0.04] text-[13px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                        <span>#</span>
                        <span>Company</span>
                        <span>Podcast Interest</span>
                        <span>Change</span>
                      </div>
                      {topCompanies.map((company, i) => {
                        const companyData = COMPANIES_DIRECTORY.find(c => c.slug === company.slug);
                        return (
                          <Link key={company.slug} href={`/companies/${company.slug}`} data-testid={`trend-company-${company.slug}`}>
                            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 items-center px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer border-b border-black/[0.02] dark:border-white/[0.02] last:border-0">
                              <span className="text-[14px] font-mono text-muted-foreground/40 w-5">{i + 1}</span>
                              <div className="flex items-center gap-2.5 min-w-0">
                                <img
                                  src={companyData?.logoUrl || '/people/default-avatar.png'}
                                  alt={company.name}
                                  className="w-8 h-8 rounded-lg object-contain bg-white border border-border p-0.5 flex-shrink-0"
                                  onError={(e) => { (e.target as HTMLImageElement).src = '/people/default-avatar.png'; }}
                                />
                                <span className="text-[14px] font-semibold text-foreground truncate">{company.name}</span>
                              </div>
                              <MentionBar count={company.recentMentions} maxCount={maxCompanyMentions} />
                              <TrendBadge trend={company.trend} changePercent={company.changePercent} />
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                    <Link href="/companies" className="flex items-center gap-1 text-[14px] font-medium text-primary mt-3 hover:text-primary/80 transition-colors" data-testid="link-all-companies">
                      View all companies <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                      <h2 className="text-[15px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-rising-companies">Rising Companies</h2>
                      <span className="text-[13px] font-mono text-muted-foreground/50 ml-1">Last 30 days</span>
                    </div>
                    <div className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl overflow-hidden">
                      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-4 py-2.5 border-b border-black/[0.04] dark:border-white/[0.04] text-[13px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                        <span>#</span>
                        <span>Company</span>
                        <span>Podcast Interest</span>
                        <span>Change</span>
                      </div>
                      {risingCompanies.length > 0 ? risingCompanies.map((company, i) => {
                        const companyData = COMPANIES_DIRECTORY.find(c => c.slug === company.slug);
                        return (
                          <Link key={company.slug} href={`/companies/${company.slug}`} data-testid={`rising-company-${company.slug}`}>
                            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 items-center px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer border-b border-black/[0.02] dark:border-white/[0.02] last:border-0">
                              <span className="text-[14px] font-mono text-muted-foreground/40 w-5">{i + 1}</span>
                              <div className="flex items-center gap-2.5 min-w-0">
                                <img
                                  src={companyData?.logoUrl || '/people/default-avatar.png'}
                                  alt={company.name}
                                  className="w-8 h-8 rounded-lg object-contain bg-white border border-border p-0.5 flex-shrink-0"
                                  onError={(e) => { (e.target as HTMLImageElement).src = '/people/default-avatar.png'; }}
                                />
                                <span className="text-[14px] font-semibold text-foreground truncate">{company.name}</span>
                              </div>
                              <MentionBar count={company.recentMentions} maxCount={maxCompanyMentions} />
                              <TrendBadge trend={company.trend} changePercent={company.changePercent} />
                            </div>
                          </Link>
                        );
                      }) : (
                        <div className="px-4 py-8 text-center text-muted-foreground/60 text-[14px]">No rising trends detected yet</div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
