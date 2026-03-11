import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, Link } from "wouter";
import { Search, ChevronDown, ChevronRight, Loader2, ArrowUpDown, Users, Tag, X, Clock, Calendar as CalendarIcon, UserCheck, Filter } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getPodcastBySlug } from "../data/podcastLandingData";
import { getPodcastCategoryInfo } from "@/data/podcastCategoryData";
import { EpisodeCard } from "@/components/EpisodeCard";
import { PodCapHeader } from "@/components/PodCapHeader";
import { Footer } from "@/components/Footer";

const PAGE_SIZE = 20;

function parseDurationMinutes(dur?: string): number {
  if (!dur) return 0;
  let total = 0;
  const hrMatch = dur.match(/(\d+)\s*hr/);
  const minMatch = dur.match(/(\d+)\s*min/);
  if (hrMatch) total += parseInt(hrMatch[1]) * 60;
  if (minMatch) total += parseInt(minMatch[1]);
  if (!hrMatch && !minMatch) {
    const num = parseInt(dur);
    if (!isNaN(num)) total = num;
  }
  return total;
}

function getEpisodeYear(ep: any): string {
  if (!ep.publishDate) return "";
  return ep.publishDate.substring(0, 4);
}

function episodeHasGuests(ep: any): boolean {
  if (!ep.guests) return false;
  try {
    const guests = typeof ep.guests === "string" ? JSON.parse(ep.guests) : ep.guests;
    return Array.isArray(guests) && guests.length > 0 && guests.some((g: any) => g.name);
  } catch { return false; }
}

export default function EpisodeArchivePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedGuest, setSelectedGuest] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [guestPresence, setGuestPresence] = useState<"all" | "with" | "without">("all");
  const [sort, setSort] = useState("newest");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [guestDropdownOpen, setGuestDropdownOpen] = useState(false);
  const [topicDropdownOpen, setTopicDropdownOpen] = useState(false);
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [guestSearch, setGuestSearch] = useState("");
  const [topicSearch, setTopicSearch] = useState("");

  const podcastConfig = getPodcastBySlug(slug);

  const { data: dbEntry } = useQuery<any>({
    queryKey: ["/api/podcasts/by-slug", slug],
    enabled: !!slug,
  });

  const config = useMemo(() => {
    if (dbEntry) return {
      slug: dbEntry.slug,
      name: dbEntry.name,
      itunesId: dbEntry.itunesId,
      artworkUrl: dbEntry.artworkUrl || "",
    };
    if (podcastConfig) return {
      slug: podcastConfig.slug,
      name: podcastConfig.name,
      itunesId: podcastConfig.itunesId,
      artworkUrl: podcastConfig.artworkUrl || "",
    };
    return null;
  }, [dbEntry, podcastConfig]);

  const { data: allEpisodes, isLoading } = useQuery<any[]>({
    queryKey: ["/api/podcasts", slug, "episodes-list"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${slug}/episodes-list`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!slug,
    staleTime: 1000 * 60 * 15,
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const guestList = useMemo(() => {
    if (!allEpisodes) return [];
    const counts = new Map<string, number>();
    for (const ep of allEpisodes) {
      if (!ep.guests) continue;
      try {
        const guests = typeof ep.guests === "string" ? JSON.parse(ep.guests) : ep.guests;
        if (Array.isArray(guests)) {
          for (const g of guests) {
            if (g.name) counts.set(g.name.trim(), (counts.get(g.name.trim()) || 0) + 1);
          }
        }
      } catch {}
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [allEpisodes]);

  const topicList = useMemo(() => {
    if (!allEpisodes) return [];
    const counts = new Map<string, number>();
    for (const ep of allEpisodes) {
      if (!ep.keyTopics || !Array.isArray(ep.keyTopics)) continue;
      for (const t of ep.keyTopics) {
        const normalized = t.trim();
        if (normalized) counts.set(normalized, (counts.get(normalized) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([topic, count]) => ({ topic, count }));
  }, [allEpisodes]);

  const yearList = useMemo(() => {
    if (!allEpisodes) return [];
    const counts = new Map<string, number>();
    for (const ep of allEpisodes) {
      const year = getEpisodeYear(ep);
      if (year) counts.set(year, (counts.get(year) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([year, count]) => ({ year, count }));
  }, [allEpisodes]);

  const durationStats = useMemo(() => {
    if (!allEpisodes || allEpisodes.length === 0) return { hasDuration: false };
    const durations = allEpisodes.map(e => parseDurationMinutes(e.duration)).filter(d => d > 0);
    return { hasDuration: durations.length > 0 };
  }, [allEpisodes]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedSearch, selectedGuest, selectedTopic, selectedYear, guestPresence, sort]);

  const filteredEpisodes = useMemo(() => {
    if (!allEpisodes) return [];

    let result = [...allEpisodes];

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(ep =>
        (ep.episodeTitle || "").toLowerCase().includes(q) ||
        (ep.tldl || "").toLowerCase().includes(q) ||
        (ep.keyTopics || []).some((t: string) => t.toLowerCase().includes(q))
      );
    }

    if (selectedGuest) {
      result = result.filter(ep => {
        if (!ep.guests) return false;
        try {
          const guests = typeof ep.guests === "string" ? JSON.parse(ep.guests) : ep.guests;
          return Array.isArray(guests) && guests.some((g: any) => g.name?.trim() === selectedGuest);
        } catch { return false; }
      });
    }

    if (selectedTopic) {
      const topicLower = selectedTopic.toLowerCase();
      result = result.filter(ep =>
        (ep.keyTopics || []).some((t: string) => t.toLowerCase().includes(topicLower))
      );
    }

    if (selectedYear) {
      result = result.filter(ep => getEpisodeYear(ep) === selectedYear);
    }

    if (guestPresence === "with") {
      result = result.filter(ep => episodeHasGuests(ep));
    } else if (guestPresence === "without") {
      result = result.filter(ep => !episodeHasGuests(ep));
    }

    if (sort === "oldest") {
      result.sort((a, b) => (a.publishDate || "").localeCompare(b.publishDate || ""));
    } else if (sort === "longest") {
      result.sort((a, b) => {
        const da = parseDurationMinutes(a.duration);
        const db = parseDurationMinutes(b.duration);
        if (da === 0 && db === 0) return 0;
        if (da === 0) return 1;
        if (db === 0) return -1;
        return db - da;
      });
    } else if (sort === "shortest") {
      result.sort((a, b) => {
        const da = parseDurationMinutes(a.duration);
        const db = parseDurationMinutes(b.duration);
        if (da === 0 && db === 0) return 0;
        if (da === 0) return 1;
        if (db === 0) return -1;
        return da - db;
      });
    } else {
      result.sort((a, b) => (b.publishDate || "").localeCompare(a.publishDate || ""));
    }

    return result;
  }, [allEpisodes, debouncedSearch, selectedGuest, selectedTopic, selectedYear, guestPresence, sort]);

  const visibleEpisodes = filteredEpisodes.slice(0, visibleCount);
  const hasMore = visibleCount < filteredEpisodes.length;
  const hasActiveFilters = debouncedSearch || selectedGuest || selectedTopic || selectedYear || guestPresence !== "all" || sort !== "newest";

  const activeFilterCount = [
    !!debouncedSearch,
    !!selectedGuest,
    !!selectedTopic,
    !!selectedYear,
    guestPresence !== "all",
  ].filter(Boolean).length;

  const clearAllFilters = useCallback(() => {
    setSearchTerm("");
    setDebouncedSearch("");
    setSelectedGuest("");
    setSelectedTopic("");
    setSelectedYear("");
    setGuestPresence("all");
    setSort("newest");
  }, []);

  const filteredGuests = useMemo(() => {
    if (!guestSearch) return guestList;
    return guestList.filter(g => g.name.toLowerCase().includes(guestSearch.toLowerCase()));
  }, [guestList, guestSearch]);

  const filteredTopics = useMemo(() => {
    if (!topicSearch) return topicList;
    return topicList.filter(t => t.topic.toLowerCase().includes(topicSearch.toLowerCase()));
  }, [topicList, topicSearch]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  useEffect(() => {
    if (!config) {
      document.title = "Podcast Not Found | PodCap";
      return;
    }
    const pageTitle = `${config.name} Episodes Archive | PodCap`;
    const pageDescription = `Browse every ${config.name} episode recap on PodCap. Search by keyword, filter by guest, topic, or year.`;
    const canonicalUrl = `https://podcap.io/podcasts/${slug}/episodes`;

    document.title = pageTitle;

    const setMeta = (selector: string, attr: string, value: string) => {
      let el = document.querySelector(selector);
      if (el) {
        el.setAttribute(attr, value);
      } else {
        const meta = document.createElement("meta");
        if (selector.includes("property=")) meta.setAttribute("property", selector.match(/property="([^"]+)"/)?.[1] || "");
        else if (selector.includes("name=")) meta.setAttribute("name", selector.match(/name="([^"]+)"/)?.[1] || "");
        meta.setAttribute(attr, value);
        document.head.appendChild(meta);
      }
    };

    setMeta('meta[name="description"]', "content", pageDescription);
    setMeta('meta[property="og:title"]', "content", pageTitle);
    setMeta('meta[property="og:description"]', "content", pageDescription);
    setMeta('meta[property="og:url"]', "content", canonicalUrl);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    return () => {
      document.title = "PodCap | Daily Podcast Recaps from Your Favorite Shows";
      if (canonical) canonical.remove();
    };
  }, [config, slug]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-dropdown='guest']")) setGuestDropdownOpen(false);
      if (!target.closest("[data-dropdown='topic']")) setTopicDropdownOpen(false);
      if (!target.closest("[data-dropdown='year']")) setYearDropdownOpen(false);
      if (!target.closest("[data-dropdown='sort']")) setSortDropdownOpen(false);
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-display font-bold text-foreground mb-3" data-testid="text-not-found">Podcast not found</h1>
          <p className="text-muted-foreground mb-6">We don't have recaps for this podcast yet.</p>
          <Link href="/podcasts">
            <span className="text-primary font-semibold hover:underline" data-testid="link-back">Browse all podcasts</span>
          </Link>
        </div>
      </div>
    );
  }

  const sortLabels: Record<string, string> = {
    newest: "Newest first",
    oldest: "Oldest first",
    longest: "Longest first",
    shortest: "Shortest first",
  };
  const sortOptions = durationStats.hasDuration
    ? ["newest", "oldest", "longest", "shortest"]
    : ["newest", "oldest"];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PodCapHeader />

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-5xl pt-8 sm:pt-12 pb-16">

          <div className="flex items-start gap-5 mb-8">
            {config.artworkUrl && (
              <Link href={`/podcasts/${slug}`}>
                <img
                  src={config.artworkUrl}
                  alt={config.name}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl shadow-lg shadow-black/[0.08] object-cover ring-1 ring-black/[0.04] cursor-pointer hover:ring-primary/[0.2] transition-all flex-shrink-0"
                  data-testid="img-podcast-artwork"
                />
              </Link>
            )}
            <div className="min-w-0 flex-1">
              <Link href={`/podcasts/${slug}`} className="inline-block hover:text-primary transition-colors">
                <h1 className="text-xl sm:text-2xl font-display font-extrabold text-foreground leading-tight" data-testid="heading-archive-title">
                  {config.name}
                </h1>
              </Link>
              <p className="text-base font-semibold text-muted-foreground mt-0.5" data-testid="text-archive-subtitle">
                Episodes Archive
              </p>
              {podcastConfig && (() => {
                const catInfo = getPodcastCategoryInfo(podcastConfig);
                if (!catInfo.category) return null;
                return (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2" data-testid="archive-category-labels">
                    <Link href={`/podcasts/${catInfo.category.slug}`}>
                      <span className="text-[13px] px-2 py-0.5 rounded-md bg-primary/[0.06] text-primary font-semibold hover:bg-primary/[0.12] transition-colors cursor-pointer" data-testid={`link-category-${catInfo.category.slug}`}>
                        {catInfo.category.name}
                      </span>
                    </Link>
                    {catInfo.topics.map((topic) => (
                      <span key={topic.slug} className="inline-flex items-center gap-1">
                        <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
                        <Link href={`/podcasts/${catInfo.category!.slug}/${topic.slug}`}>
                          <span className="text-[13px] px-2 py-0.5 rounded-md bg-muted/60 text-foreground/70 font-medium hover:bg-muted hover:text-foreground transition-colors cursor-pointer" data-testid={`link-topic-${topic.slug}`}>
                            {topic.name}
                          </span>
                        </Link>
                      </span>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="flex flex-col gap-3 mb-6" data-testid="section-filters">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/40 pointer-events-none" />
              <input
                data-testid="input-search"
                type="text"
                placeholder={`Search ${config.name} episodes...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-12 pl-12 pr-4 bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.08] rounded-xl text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/25 transition-all placeholder:text-muted-foreground/40"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-black/[0.04] transition-colors"
                  data-testid="button-clear-search"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {yearList.length > 0 && (
                <div className="relative" data-dropdown="year">
                  <button
                    onClick={() => { setYearDropdownOpen(!yearDropdownOpen); setGuestDropdownOpen(false); setTopicDropdownOpen(false); setSortDropdownOpen(false); }}
                    className={`inline-flex items-center gap-2 h-10 px-4 rounded-lg text-[15px] font-medium border transition-all ${
                      selectedYear
                        ? "bg-primary/[0.08] border-primary/[0.2] text-primary"
                        : "bg-white dark:bg-zinc-900 border-black/[0.08] dark:border-white/[0.08] text-foreground/70 hover:border-primary/[0.15]"
                    }`}
                    data-testid="button-filter-year"
                  >
                    <CalendarIcon className="w-4 h-4" />
                    {selectedYear || "Year"}
                    {selectedYear ? (
                      <span
                        onClick={(e) => { e.stopPropagation(); setSelectedYear(""); setYearDropdownOpen(false); }}
                        className="ml-1 p-0.5 rounded hover:bg-primary/20"
                      >
                        <X className="w-3 h-3" />
                      </span>
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
                    )}
                  </button>
                  {yearDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1.5 w-48 bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.1] rounded-xl shadow-lg shadow-black/[0.08] overflow-hidden z-50" data-testid="dropdown-year">
                      <div className="overflow-y-auto max-h-56">
                        {yearList.map((y) => (
                          <button
                            key={y.year}
                            onClick={() => { setSelectedYear(y.year); setYearDropdownOpen(false); }}
                            className={`w-full text-left px-4 py-2.5 text-[15px] hover:bg-primary/[0.06] transition-colors flex items-center justify-between ${
                              selectedYear === y.year ? "bg-primary/[0.08] text-primary font-semibold" : "text-foreground"
                            }`}
                            data-testid={`option-year-${y.year}`}
                          >
                            <span>{y.year}</span>
                            <span className="text-[13px] text-muted-foreground/50 ml-2 shrink-0">{y.count}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {topicList.length > 0 && (
                <div className="relative" data-dropdown="topic">
                  <button
                    onClick={() => { setTopicDropdownOpen(!topicDropdownOpen); setGuestDropdownOpen(false); setYearDropdownOpen(false); setSortDropdownOpen(false); }}
                    className={`inline-flex items-center gap-2 h-10 px-4 rounded-lg text-[15px] font-medium border transition-all ${
                      selectedTopic
                        ? "bg-primary/[0.08] border-primary/[0.2] text-primary"
                        : "bg-white dark:bg-zinc-900 border-black/[0.08] dark:border-white/[0.08] text-foreground/70 hover:border-primary/[0.15]"
                    }`}
                    data-testid="button-filter-topic"
                  >
                    <Tag className="w-4 h-4" />
                    <span className="max-w-[140px] truncate">{selectedTopic || "Topic"}</span>
                    {selectedTopic ? (
                      <span
                        onClick={(e) => { e.stopPropagation(); setSelectedTopic(""); setTopicDropdownOpen(false); }}
                        className="ml-1 p-0.5 rounded hover:bg-primary/20"
                      >
                        <X className="w-3 h-3" />
                      </span>
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
                    )}
                  </button>
                  {topicDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1.5 w-80 max-h-72 bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.1] rounded-xl shadow-lg shadow-black/[0.08] overflow-hidden z-50" data-testid="dropdown-topic">
                      <div className="p-2 border-b border-black/[0.06] dark:border-white/[0.06]">
                        <input
                          type="text"
                          placeholder="Search topics..."
                          value={topicSearch}
                          onChange={(e) => setTopicSearch(e.target.value)}
                          className="w-full h-9 px-3 bg-black/[0.03] dark:bg-white/[0.06] rounded-lg text-sm text-foreground focus:outline-none placeholder:text-muted-foreground/40"
                          data-testid="input-search-topic"
                          autoFocus
                        />
                      </div>
                      <div className="overflow-y-auto max-h-56">
                        {filteredTopics.map((t) => (
                          <button
                            key={t.topic}
                            onClick={() => { setSelectedTopic(t.topic); setTopicDropdownOpen(false); setTopicSearch(""); }}
                            className={`w-full text-left px-4 py-2.5 text-[15px] hover:bg-primary/[0.06] transition-colors flex items-center justify-between ${
                              selectedTopic === t.topic ? "bg-primary/[0.08] text-primary font-semibold" : "text-foreground"
                            }`}
                            data-testid={`option-topic-${t.topic}`}
                          >
                            <span className="truncate">{t.topic}</span>
                            <span className="text-[13px] text-muted-foreground/50 ml-2 shrink-0">{t.count} ep{t.count !== 1 ? "s" : ""}</span>
                          </button>
                        ))}
                        {filteredTopics.length === 0 && (
                          <p className="px-4 py-3 text-sm text-muted-foreground/50">No topics found</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {guestList.length > 0 && (
                <div className="relative" data-dropdown="guest">
                  <button
                    onClick={() => { setGuestDropdownOpen(!guestDropdownOpen); setTopicDropdownOpen(false); setYearDropdownOpen(false); setSortDropdownOpen(false); }}
                    className={`inline-flex items-center gap-2 h-10 px-4 rounded-lg text-[15px] font-medium border transition-all ${
                      selectedGuest
                        ? "bg-primary/[0.08] border-primary/[0.2] text-primary"
                        : "bg-white dark:bg-zinc-900 border-black/[0.08] dark:border-white/[0.08] text-foreground/70 hover:border-primary/[0.15]"
                    }`}
                    data-testid="button-filter-guest"
                  >
                    <Users className="w-4 h-4" />
                    <span className="max-w-[140px] truncate">{selectedGuest || "Guest"}</span>
                    {selectedGuest ? (
                      <span
                        onClick={(e) => { e.stopPropagation(); setSelectedGuest(""); setGuestDropdownOpen(false); }}
                        className="ml-1 p-0.5 rounded hover:bg-primary/20"
                      >
                        <X className="w-3 h-3" />
                      </span>
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
                    )}
                  </button>
                  {guestDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1.5 w-72 max-h-72 bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.1] rounded-xl shadow-lg shadow-black/[0.08] overflow-hidden z-50" data-testid="dropdown-guest">
                      <div className="p-2 border-b border-black/[0.06] dark:border-white/[0.06]">
                        <input
                          type="text"
                          placeholder="Search guests..."
                          value={guestSearch}
                          onChange={(e) => setGuestSearch(e.target.value)}
                          className="w-full h-9 px-3 bg-black/[0.03] dark:bg-white/[0.06] rounded-lg text-sm text-foreground focus:outline-none placeholder:text-muted-foreground/40"
                          data-testid="input-search-guest"
                          autoFocus
                        />
                      </div>
                      <div className="overflow-y-auto max-h-56">
                        {filteredGuests.map((g) => (
                          <button
                            key={g.name}
                            onClick={() => { setSelectedGuest(g.name); setGuestDropdownOpen(false); setGuestSearch(""); }}
                            className={`w-full text-left px-4 py-2.5 text-[15px] hover:bg-primary/[0.06] transition-colors flex items-center justify-between ${
                              selectedGuest === g.name ? "bg-primary/[0.08] text-primary font-semibold" : "text-foreground"
                            }`}
                            data-testid={`option-guest-${g.name}`}
                          >
                            <span className="truncate">{g.name}</span>
                            <span className="text-[13px] text-muted-foreground/50 ml-2 shrink-0">{g.count} ep{g.count !== 1 ? "s" : ""}</span>
                          </button>
                        ))}
                        {filteredGuests.length === 0 && (
                          <p className="px-4 py-3 text-sm text-muted-foreground/50">No guests found</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {guestList.length > 0 && (
                <button
                  onClick={() => setGuestPresence(guestPresence === "all" ? "with" : guestPresence === "with" ? "without" : "all")}
                  className={`inline-flex items-center gap-2 h-10 px-4 rounded-lg text-[15px] font-medium border transition-all ${
                    guestPresence !== "all"
                      ? "bg-primary/[0.08] border-primary/[0.2] text-primary"
                      : "bg-white dark:bg-zinc-900 border-black/[0.08] dark:border-white/[0.08] text-foreground/70 hover:border-primary/[0.15]"
                  }`}
                  data-testid="button-filter-guest-presence"
                >
                  <UserCheck className="w-4 h-4" />
                  {guestPresence === "all" ? "Guest episodes" : guestPresence === "with" ? "With guests" : "Hosts only"}
                  {guestPresence !== "all" && (
                    <span
                      onClick={(e) => { e.stopPropagation(); setGuestPresence("all"); }}
                      className="ml-1 p-0.5 rounded hover:bg-primary/20"
                    >
                      <X className="w-3 h-3" />
                    </span>
                  )}
                </button>
              )}

              <div className="relative ml-auto" data-dropdown="sort">
                <button
                  onClick={() => { setSortDropdownOpen(!sortDropdownOpen); setGuestDropdownOpen(false); setTopicDropdownOpen(false); setYearDropdownOpen(false); }}
                  className={`inline-flex items-center gap-2 h-10 px-4 rounded-lg text-[15px] font-medium border transition-all ${
                    sort !== "newest"
                      ? "bg-primary/[0.08] border-primary/[0.2] text-primary"
                      : "bg-white dark:bg-zinc-900 border-black/[0.08] dark:border-white/[0.08] text-foreground/70 hover:border-primary/[0.15]"
                  }`}
                  data-testid="button-sort"
                >
                  <ArrowUpDown className="w-4 h-4" />
                  {sortLabels[sort]}
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
                </button>
                {sortDropdownOpen && (
                  <div className="absolute top-full right-0 mt-1.5 w-48 bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.1] rounded-xl shadow-lg shadow-black/[0.08] overflow-hidden z-50" data-testid="dropdown-sort">
                    {sortOptions.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => { setSort(opt); setSortDropdownOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-[15px] hover:bg-primary/[0.06] transition-colors ${
                          sort === opt ? "bg-primary/[0.08] text-primary font-semibold" : "text-foreground"
                        }`}
                        data-testid={`option-sort-${opt}`}
                      >
                        {sortLabels[opt]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {(activeFilterCount > 0) && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {activeFilterCount > 0 && (
                  <span className="text-[13px] font-medium text-muted-foreground/60 flex items-center gap-1">
                    <Filter className="w-3 h-3" />
                    {filteredEpisodes.length} result{filteredEpisodes.length !== 1 ? "s" : ""}
                  </span>
                )}
                {debouncedSearch && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/[0.06] text-primary text-[13px] font-semibold rounded-full max-w-[200px]">
                    <Search className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">"{debouncedSearch}"</span>
                    <button onClick={() => { setSearchTerm(""); setDebouncedSearch(""); }} className="p-0.5 rounded hover:bg-primary/20 flex-shrink-0"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {selectedYear && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/[0.06] text-primary text-[13px] font-semibold rounded-full">
                    {selectedYear}
                    <button onClick={() => setSelectedYear("")} className="p-0.5 rounded hover:bg-primary/20"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {selectedTopic && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/[0.06] text-primary text-[13px] font-semibold rounded-full max-w-[200px]">
                    <span className="truncate">{selectedTopic}</span>
                    <button onClick={() => setSelectedTopic("")} className="p-0.5 rounded hover:bg-primary/20 flex-shrink-0"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {selectedGuest && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/[0.06] text-primary text-[13px] font-semibold rounded-full max-w-[200px]">
                    <span className="truncate">{selectedGuest}</span>
                    <button onClick={() => setSelectedGuest("")} className="p-0.5 rounded hover:bg-primary/20 flex-shrink-0"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {guestPresence !== "all" && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/[0.06] text-primary text-[13px] font-semibold rounded-full">
                    {guestPresence === "with" ? "With guests" : "Hosts only"}
                    <button onClick={() => setGuestPresence("all")} className="p-0.5 rounded hover:bg-primary/20"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {(activeFilterCount > 1 || (activeFilterCount >= 1 && sort !== "newest")) && (
                  <button
                    onClick={clearAllFilters}
                    className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors ml-1"
                    data-testid="button-clear-all"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-5" data-testid="section-episodes">
                {visibleEpisodes.map((ep: any) => (
                  <EpisodeCard
                    key={ep.episodeSlug}
                    episodeSlug={ep.episodeSlug}
                    podcastSlug={slug}
                    publishDate={ep.publishDate}
                    episodeTitle={ep.episodeTitle}
                    tldl={ep.tldl}
                    duration={ep.duration}
                  />
                ))}
              </div>

              {visibleEpisodes.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-muted-foreground font-medium" data-testid="text-no-results">No episodes found matching your filters.</p>
                  {hasActiveFilters && (
                    <button
                      onClick={clearAllFilters}
                      className="mt-3 text-primary font-semibold hover:underline"
                      data-testid="button-clear-filters"
                    >
                      Clear all filters
                    </button>
                  )}
                </div>
              )}

              {hasMore && (
                <div className="flex justify-center mt-8">
                  <button
                    onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-[15px] font-semibold text-primary bg-primary/[0.06] hover:bg-primary/[0.1] transition-colors"
                    data-testid="button-show-more"
                  >
                    <ChevronDown className="w-4 h-4" />
                    Show more
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
