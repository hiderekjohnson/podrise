import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, Link, useLocation } from "wouter";
import { Search, ChevronLeft, ChevronRight, Loader2, ArrowUpDown, Users, Tag, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getPodcastBySlug } from "../data/podcastLandingData";
import { EpisodeCard } from "@/components/EpisodeCard";
import { PodCapHeader } from "@/components/PodCapHeader";
import { Footer } from "@/components/Footer";

export default function EpisodeArchivePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";
  const [, navigate] = useLocation();

  const searchParams = new URLSearchParams(window.location.search);
  const initialPage = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const initialSearch = searchParams.get("q") || "";
  const initialGuest = searchParams.get("guest") || "";
  const initialTopic = searchParams.get("topic") || "";
  const initialSort = searchParams.get("sort") || "newest";

  const [page, setPage] = useState(initialPage);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [selectedGuest, setSelectedGuest] = useState(initialGuest);
  const [selectedTopic, setSelectedTopic] = useState(initialTopic);
  const [sort, setSort] = useState(initialSort);
  const [guestDropdownOpen, setGuestDropdownOpen] = useState(false);
  const [topicDropdownOpen, setTopicDropdownOpen] = useState(false);
  const [guestSearch, setGuestSearch] = useState("");
  const [topicSearch, setTopicSearch] = useState("");
  const perPage = 25;

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
      hosts: dbEntry.hosts || "",
    };
    if (podcastConfig) return {
      slug: podcastConfig.slug,
      name: podcastConfig.name,
      itunesId: podcastConfig.itunesId,
      artworkUrl: podcastConfig.artworkUrl || "",
      hosts: podcastConfig.hosts || "",
    };
    return null;
  }, [dbEntry, podcastConfig]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedGuest, selectedTopic, sort]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (selectedGuest) params.set("guest", selectedGuest);
    if (selectedTopic) params.set("topic", selectedTopic);
    if (sort !== "newest") params.set("sort", sort);
    const qs = params.toString();
    const newUrl = `/podcasts/${slug}/episodes${qs ? `?${qs}` : ""}`;
    window.history.replaceState(null, "", newUrl);
  }, [page, debouncedSearch, selectedGuest, selectedTopic, sort, slug]);

  const offset = (page - 1) * perPage;

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(perPage));
    params.set("offset", String(offset));
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (selectedGuest) params.set("guest", selectedGuest);
    if (selectedTopic) params.set("topic", selectedTopic);
    if (sort !== "newest") params.set("sort", sort);
    return params.toString();
  }, [offset, debouncedSearch, selectedGuest, selectedTopic, sort]);

  const { data: archiveData, isLoading } = useQuery<{ recaps: any[]; total: number }>({
    queryKey: ["/api/podcasts", slug, "archive", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${slug}/archive?${queryString}`);
      if (!res.ok) return { recaps: [], total: 0 };
      return res.json();
    },
    enabled: !!slug,
  });

  const { data: filtersData } = useQuery<{
    guests: Array<{ name: string; count: number }>;
    topics: Array<{ topic: string; count: number }>;
  }>({
    queryKey: ["/api/podcasts", slug, "archive-filters"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${slug}/archive-filters`);
      if (!res.ok) return { guests: [], topics: [] };
      return res.json();
    },
    enabled: !!slug,
    staleTime: 1000 * 60 * 30,
  });

  const episodes = archiveData?.recaps || [];
  const total = archiveData?.total || 0;
  const totalPages = Math.ceil(total / perPage);

  const filteredGuests = useMemo(() => {
    if (!filtersData?.guests) return [];
    if (!guestSearch) return filtersData.guests;
    return filtersData.guests.filter(g => g.name.toLowerCase().includes(guestSearch.toLowerCase()));
  }, [filtersData?.guests, guestSearch]);

  const filteredTopics = useMemo(() => {
    if (!filtersData?.topics) return [];
    if (!topicSearch) return filtersData.topics;
    return filtersData.topics.filter(t => t.topic.toLowerCase().includes(topicSearch.toLowerCase()));
  }, [filtersData?.topics, topicSearch]);

  const hasActiveFilters = debouncedSearch || selectedGuest || selectedTopic || sort !== "newest";

  const clearAllFilters = useCallback(() => {
    setSearchTerm("");
    setDebouncedSearch("");
    setSelectedGuest("");
    setSelectedTopic("");
    setSort("newest");
    setPage(1);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug, page]);

  useEffect(() => {
    if (!config) {
      document.title = "Podcast Not Found | PodCap";
      return;
    }
    const name = config.name;
    const pageTitle = page > 1
      ? `${name} Episodes Archive — Page ${page} | PodCap`
      : `${name} Episodes Archive | PodCap`;
    const pageDescription = `Browse every ${name} episode recap on PodCap. Search by keyword, filter by guest or topic.`;
    const canonicalUrl = page > 1
      ? `https://podcap.io/podcasts/${slug}/episodes?page=${page}`
      : `https://podcap.io/podcasts/${slug}/episodes`;

    document.title = pageTitle;

    const setMeta = (selector: string, attr: string, value: string) => {
      let el = document.querySelector(selector);
      if (el) {
        el.setAttribute(attr, value);
      } else {
        const meta = document.createElement("meta");
        if (selector.includes("property=")) {
          meta.setAttribute("property", selector.match(/property="([^"]+)"/)?.[1] || "");
        } else if (selector.includes("name=")) {
          meta.setAttribute("name", selector.match(/name="([^"]+)"/)?.[1] || "");
        }
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
  }, [config, slug, page]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-dropdown='guest']")) setGuestDropdownOpen(false);
      if (!target.closest("[data-dropdown='topic']")) setTopicDropdownOpen(false);
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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PodCapHeader />

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-4xl pt-8 sm:pt-12 pb-16">
          <div className="flex items-center gap-5 mb-8">
            {config.artworkUrl && (
              <Link href={`/podcasts/${slug}`}>
                <img
                  src={config.artworkUrl}
                  alt={config.name}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl shadow-lg shadow-black/[0.08] object-cover ring-1 ring-black/[0.04] cursor-pointer hover:ring-primary/[0.2] transition-all"
                  data-testid="img-podcast-artwork"
                />
              </Link>
            )}
            <div className="min-w-0 flex-1">
              <Link href={`/podcasts/${slug}`} className="hover:text-primary transition-colors">
                <h1 className="text-xl sm:text-2xl font-display font-extrabold text-foreground leading-tight" data-testid="heading-archive-title">
                  {config.name} Episodes Archive
                </h1>
              </Link>
              <p className="text-base text-muted-foreground mt-1" data-testid="text-episode-count">
                {total} episode {total === 1 ? "recap" : "recaps"}{hasActiveFilters ? " matching filters" : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 mb-6" data-testid="section-filters">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/40 pointer-events-none" />
              <input
                data-testid="input-search"
                type="text"
                placeholder="Search episodes by keyword..."
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

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative" data-dropdown="guest">
                <button
                  onClick={() => { setGuestDropdownOpen(!guestDropdownOpen); setTopicDropdownOpen(false); }}
                  className={`inline-flex items-center gap-2 h-10 px-4 rounded-lg text-[15px] font-medium border transition-all ${
                    selectedGuest
                      ? "bg-primary/[0.08] border-primary/[0.2] text-primary"
                      : "bg-white dark:bg-zinc-900 border-black/[0.08] dark:border-white/[0.08] text-foreground/70 hover:border-primary/[0.15]"
                  }`}
                  data-testid="button-filter-guest"
                >
                  <Users className="w-4 h-4" />
                  {selectedGuest || "Filter by guest"}
                  {selectedGuest && (
                    <span
                      onClick={(e) => { e.stopPropagation(); setSelectedGuest(""); setGuestDropdownOpen(false); }}
                      className="ml-1 p-0.5 rounded hover:bg-primary/20"
                    >
                      <X className="w-3 h-3" />
                    </span>
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

              <div className="relative" data-dropdown="topic">
                <button
                  onClick={() => { setTopicDropdownOpen(!topicDropdownOpen); setGuestDropdownOpen(false); }}
                  className={`inline-flex items-center gap-2 h-10 px-4 rounded-lg text-[15px] font-medium border transition-all ${
                    selectedTopic
                      ? "bg-primary/[0.08] border-primary/[0.2] text-primary"
                      : "bg-white dark:bg-zinc-900 border-black/[0.08] dark:border-white/[0.08] text-foreground/70 hover:border-primary/[0.15]"
                  }`}
                  data-testid="button-filter-topic"
                >
                  <Tag className="w-4 h-4" />
                  {selectedTopic || "Filter by topic"}
                  {selectedTopic && (
                    <span
                      onClick={(e) => { e.stopPropagation(); setSelectedTopic(""); setTopicDropdownOpen(false); }}
                      className="ml-1 p-0.5 rounded hover:bg-primary/20"
                    >
                      <X className="w-3 h-3" />
                    </span>
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

              <div className="relative ml-auto">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="appearance-none h-10 pl-9 pr-8 bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.08] rounded-lg text-[15px] font-medium text-foreground/70 cursor-pointer hover:border-primary/[0.15] transition-all focus:outline-none focus:ring-2 focus:ring-primary/15"
                  data-testid="select-sort"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
                <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40 pointer-events-none" />
              </div>

              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg text-[15px] font-medium text-muted-foreground hover:text-foreground hover:bg-black/[0.04] transition-all"
                  data-testid="button-clear-all"
                >
                  <X className="w-4 h-4" />
                  Clear all
                </button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-5" data-testid="section-episodes">
                {episodes.map((ep: any) => (
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

              {episodes.length === 0 && !isLoading && (
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

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-10" data-testid="pagination">
                  {page > 1 ? (
                    <button
                      onClick={() => setPage(page - 1)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-base font-semibold text-primary bg-primary/[0.06] hover:bg-primary/[0.1] transition-colors"
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-base font-semibold text-muted-foreground/40 cursor-not-allowed">
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </span>
                  )}
                  <span className="text-base text-muted-foreground" data-testid="text-page-info">
                    Page {page} of {totalPages}
                  </span>
                  {page < totalPages ? (
                    <button
                      onClick={() => setPage(page + 1)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-base font-semibold text-primary bg-primary/[0.06] hover:bg-primary/[0.1] transition-colors"
                      data-testid="button-next-page"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-base font-semibold text-muted-foreground/40 cursor-not-allowed">
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  )}
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
