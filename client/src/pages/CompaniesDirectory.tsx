import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Search, TrendingUp, TrendingDown, Minus, Flame, BarChart3 } from "lucide-react";
import { Footer } from "@/components/Footer";
import { COMPANIES_DIRECTORY } from "@/data/entityDirectoryData";
import { SiteHeader } from "@/components/SiteHeader";

interface CompanySummary {
  slug: string;
  name: string;
  description: string;
  mentionCount: number;
  recentMentions: number;
  trend: "rising" | "stable" | "falling";
  changePercent: number;
}

function SEOHead() {
  const title = "Company Intelligence - What's Trending in Podcasts | PodCap";
  const description = "Track which companies are trending across the world's top podcasts. See mention trends, rising brands, and explore every episode where companies are discussed.";

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
    <div className="w-full max-w-[120px] bg-muted/40 rounded-full h-[6px] overflow-hidden">
      <div
        className="h-full bg-primary/60 rounded-full transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const PAGE_SIZE = 20;

export default function CompaniesDirectory() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"total" | "trending">("total");

  const { data: companies, isLoading } = useQuery<CompanySummary[]>({
    queryKey: ["/api/entities/companies"],
  });

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const getCompanyData = (slug: string) => COMPANIES_DIRECTORY.find(c => c.slug === slug);

  const trendingCompanies = useMemo(() => {
    if (!companies) return [];
    return [...companies]
      .filter(c => c.recentMentions > 0)
      .sort((a, b) => b.recentMentions - a.recentMentions)
      .slice(0, 6);
  }, [companies]);

  const risingCompanies = useMemo(() => {
    if (!companies) return [];
    return [...companies]
      .filter(c => c.trend === "rising" && c.recentMentions > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 6);
  }, [companies]);

  const maxMentions = useMemo(() => {
    if (!companies) return 1;
    return Math.max(...companies.map(c => c.mentionCount), 1);
  }, [companies]);

  const filteredCompanies = useMemo(() => {
    if (!companies) return [];

    let result = [...companies];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
      );
    }

    if (sortBy === "trending") {
      result.sort((a, b) => b.recentMentions - a.recentMentions);
    } else {
      result.sort((a, b) => b.mentionCount - a.mentionCount);
    }

    return result;
  }, [companies, searchQuery, sortBy]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, sortBy]);

  const visibleCompanies = filteredCompanies.slice(0, visibleCount);
  const hasMore = visibleCount < filteredCompanies.length;
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
            <h1 className="text-3xl sm:text-[2.75rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.03em] mb-3" data-testid="heading-companies">
              Company Intelligence
            </h1>
            <p className="text-lg text-[#3F3F46] dark:text-[#A1A1AA] max-w-2xl mx-auto leading-relaxed" data-testid="text-page-description">
              Track which companies are driving conversation across the world's top podcasts. See trending mentions and explore every episode.
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
                placeholder="Search companies..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 text-[17px] bg-card border border-black/[0.1] dark:border-white/[0.1] rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all shadow-sm"
                data-testid="input-search-companies"
              />
              {searchQuery && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-mono text-muted-foreground/60">
                  {filteredCompanies.length} result{filteredCompanies.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 pb-20">
        {!isSearching && !isLoading && (
          <>
            {trendingCompanies.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="mb-12"
              >
                <div className="flex items-center gap-2 mb-5">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <h2 className="text-[15px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-trending-companies">Most Mentioned (Last 30 Days)</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {trendingCompanies.map((company, i) => {
                    const companyData = getCompanyData(company.slug);
                    return (
                      <motion.div
                        key={company.slug}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.04 }}
                      >
                        <Link href={`/companies/${company.slug}`} data-testid={`card-trending-${company.slug}`}>
                          <div className="group relative bg-card border border-black/[0.08] dark:border-white/[0.08] rounded-xl p-5 hover:border-orange-500/30 hover:shadow-md transition-all cursor-pointer">
                            <div className="flex items-start gap-3">
                              <span className="text-[20px] font-mono font-bold text-muted-foreground/30 leading-none mt-0.5">{i + 1}</span>
                              <img
                                src={companyData?.logoUrl || '/people/default-avatar.png'}
                                alt={company.name}
                                className="w-10 h-10 rounded-lg object-contain bg-white border border-border p-1 flex-shrink-0"
                                onError={(e) => { (e.target as HTMLImageElement).src = '/people/default-avatar.png'; }}
                              />
                              <div className="flex-1 min-w-0">
                                <h3 className="text-[17px] font-display font-bold text-foreground group-hover:text-primary transition-colors truncate">
                                  {company.name}
                                </h3>
                                <p className="text-[13px] text-muted-foreground/70 truncate">{company.description}</p>
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="text-[13px] font-mono text-foreground font-semibold">{company.recentMentions} mentions</span>
                                  <TrendBadge trend={company.trend} changePercent={company.changePercent} />
                                </div>
                              </div>
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.section>
            )}

            {risingCompanies.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="mb-12"
              >
                <div className="flex items-center gap-2 mb-5">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  <h2 className="text-[15px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-rising-companies">Rising</h2>
                </div>
                <div className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 px-5 py-3 border-b border-black/[0.04] dark:border-white/[0.04] text-[12px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                    <span>#</span>
                    <span>Company</span>
                    <span>Mentions</span>
                    <span>Change</span>
                  </div>
                  {risingCompanies.map((company, i) => {
                    const companyData = getCompanyData(company.slug);
                    return (
                      <Link key={company.slug} href={`/companies/${company.slug}`} data-testid={`row-rising-${company.slug}`}>
                        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 items-center px-5 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer border-b border-black/[0.03] dark:border-white/[0.03] last:border-0">
                          <span className="text-[15px] font-mono text-muted-foreground/40 w-6">{i + 1}</span>
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={companyData?.logoUrl || '/people/default-avatar.png'}
                              alt={company.name}
                              className="w-8 h-8 rounded-lg object-contain bg-white border border-border p-0.5 flex-shrink-0"
                              onError={(e) => { (e.target as HTMLImageElement).src = '/people/default-avatar.png'; }}
                            />
                            <div className="min-w-0">
                              <span className="text-[15px] font-semibold text-foreground block truncate">{company.name}</span>
                              <span className="text-[12px] text-muted-foreground/60 truncate block">{company.description}</span>
                            </div>
                          </div>
                          <MentionBar count={company.mentionCount} maxCount={maxMentions} />
                          <TrendBadge trend={company.trend} changePercent={company.changePercent} />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </motion.section>
            )}
          </>
        )}

        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h2 className="text-[15px] font-semibold uppercase tracking-[0.12em] text-foreground" data-testid="heading-all-companies">
              {isSearching ? "Search Results" : "All Companies"}
            </h2>
            <span className="text-[13px] font-mono text-muted-foreground/60 ml-1">
              {filteredCompanies.length}
            </span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center bg-card border border-border rounded-lg overflow-hidden" data-testid="sort-control">
            {([["total", "Top"], ["trending", "Trending"]] as const).map(([val, label]) => (
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

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-muted" />
                  <div className="flex-1">
                    <div className="h-5 bg-muted rounded w-40 mb-2" />
                    <div className="h-4 bg-muted rounded w-56" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl overflow-hidden">
            <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 px-5 py-3 border-b border-black/[0.04] dark:border-white/[0.04] text-[12px] font-mono text-muted-foreground/60 uppercase tracking-wider">
              <span className="w-6">#</span>
              <span>Company</span>
              <span>Mentions</span>
              <span>Podcast Interest</span>
              <span>Trend</span>
            </div>
            {visibleCompanies.map((company, index) => {
              const companyData = getCompanyData(company.slug);
              return (
                <motion.div
                  key={company.slug}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: Math.min(index * 0.01, 0.3) }}
                >
                  <Link href={`/companies/${company.slug}`} data-testid={`card-company-${company.slug}`}>
                    <div className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 items-center px-5 py-4 hover:bg-muted/30 transition-colors cursor-pointer border-b border-black/[0.03] dark:border-white/[0.03] last:border-0 group">
                      <span className="text-[14px] font-mono text-muted-foreground/40 w-6">{index + 1}</span>
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={companyData?.logoUrl || '/people/default-avatar.png'}
                          alt={company.name}
                          className="w-9 h-9 rounded-lg object-contain bg-white border border-border p-1 flex-shrink-0"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).src = '/people/default-avatar.png'; }}
                        />
                        <div className="min-w-0">
                          <span className="text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors block truncate" data-testid={`text-company-name-${company.slug}`}>
                            {company.name}
                          </span>
                          <span className="text-[13px] text-muted-foreground/60 truncate block">{company.description}</span>
                        </div>
                      </div>
                      <span className="text-[14px] font-mono text-foreground font-medium">{company.mentionCount}</span>
                      <div className="hidden sm:block">
                        <MentionBar count={company.mentionCount} maxCount={maxMentions} />
                      </div>
                      <div className="hidden sm:block">
                        <TrendBadge trend={company.trend} changePercent={company.changePercent} />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}

        {filteredCompanies.length === 0 && !isLoading && (
          <div className="text-center py-20">
            <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground" data-testid="text-no-results">No companies match your search</p>
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
      </main>

      <Footer />
    </div>
  );
}
