import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Search, X, Loader2, Mic, User, Building2 } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";


interface ReferralStats {
  referralCount: number;
  currentTier: { name: string; threshold: number };
  nextTier: { name: string; threshold: number } | null;
}

interface RecommendedItem {
  name: string;
  subtitle: string | null;
  imageUrl: string | null;
  type: "book" | "product";
  link: string;
}

interface DirectoryPodcast {
  slug: string;
  name: string;
  artwork_url?: string;
  artworkUrl?: string;
  category?: string | null;
  description?: string | null;
}

interface GlobalSearchData {
  podcasts: { slug: string; name: string; artworkUrl: string; itunesId: string | null; hasLandingPage: boolean }[];
  episodes: { podcastSlug: string; episodeSlug: string; podcastName: string; episodeTitle: string; artworkUrl: string; publishDate: string }[];
  people: { slug: string; name: string; photoUrl: string; title: string; company: string }[];
  companies: { slug: string; name: string; logoUrl: string; industry: string }[];
}

function SidebarSearch() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [recentlyFollowed, setRecentlyFollowed] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { data: user } = useAuth();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: searchData, isLoading: searchLoading } = useQuery<GlobalSearchData>({
    queryKey: ["/api/global-search", debouncedQuery],
    queryFn: async () => {
      const res = await fetch(`/api/global-search?term=${encodeURIComponent(debouncedQuery)}`);
      return res.json();
    },
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: itunesData } = useQuery<{ results: any[] }>({
    queryKey: ["/api/podcasts/search-itunes", debouncedQuery],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/search-itunes?term=${encodeURIComponent(debouncedQuery)}`);
      return res.json();
    },
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const platformSlugs = new Set(searchData?.podcasts?.map(p => p.slug) || []);
  const platformItunesIds = new Set(searchData?.podcasts?.map(p => p.itunesId).filter(Boolean) || []);
  const itunesExternalResults = (itunesData?.results || []).filter(
    (r: any) => !platformSlugs.has(r.slug) && !platformItunesIds.has(String(r.id))
  ).slice(0, 5);

  const handleFollowExternal = async (result: any) => {
    if (!user) {
      toast({ title: "Sign in required", description: "Log in to follow podcasts", variant: "destructive" });
      return;
    }
    try {
      await apiRequest("POST", "/api/feed/follow", {
        itunesId: result.id,
        podcastName: result.name,
        artworkUrl: result.artworkUrl,
      });
      setRecentlyFollowed(prev => new Set(prev).add(String(result.id)));
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-slugs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/global-search", debouncedQuery] });
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts/search-itunes", debouncedQuery] });
      toast({ title: "Following!", description: `Now following ${result.name}` });
    } catch {
      toast({ title: "Error", description: "Failed to follow", variant: "destructive" });
    }
  };

  const showResults = query.trim().length >= 2;
  const totalResults = searchData
    ? searchData.podcasts.length + searchData.episodes.length + searchData.people.length + searchData.companies.length
    : 0;
  const noResults = showResults && !searchLoading && totalResults === 0 && itunesExternalResults.length === 0;

  return (
    <div className="sticky top-0 z-10 px-4 py-3 bg-[#F7F7FC] border-b border-[#F0F0F2]">
      <div data-testid="sidebar-search">
        <div className="flex items-center gap-[10px] bg-white border border-[#E4E4E7] rounded-[10px] px-[14px] py-[9px] transition-colors focus-within:border-[#6366F1]">
          <Search className="w-4 h-4 text-[#A1A1AA] flex-shrink-0" />
          <input
            type="text"
            placeholder="Search Podcasts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 border-none bg-transparent outline-none text-[14px] text-[#09090B] placeholder-[#A1A1AA] min-h-0 p-0"
            style={{ minHeight: 0, border: 'none', padding: 0 }}
            data-testid="sidebar-search-input"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-[#A1A1AA] hover:text-[#52525B] transition-colors"
              data-testid="sidebar-search-clear"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {showResults && (
        <div className="mt-2 bg-white border border-[#E4E4E7] rounded-[10px] overflow-hidden max-h-[480px] overflow-y-auto shadow-sm" data-testid="sidebar-search-results">
          {searchLoading ? (
            <div className="flex items-center justify-center py-6" data-testid="sidebar-search-loading">
              <Loader2 className="w-5 h-5 text-[#A1A1AA] animate-spin" />
            </div>
          ) : totalResults > 0 ? (
            <>
              {searchData!.podcasts.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-bold text-[#A1A1AA] uppercase tracking-wider bg-[#FAFAFA]">Podcasts</div>
                  {searchData!.podcasts.map((result) => 
                    result.hasLandingPage ? (
                      <Link
                        key={result.slug}
                        href={`/podcasts/${result.slug}`}
                        className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#F7F7FC] transition-colors border-b border-[#F0F0F2] last:border-b-0 no-underline"
                        onClick={() => setQuery("")}
                        data-testid={`sidebar-result-podcast-${result.slug}`}
                      >
                        <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-[#F0F0F2]">
                          {result.artworkUrl ? (
                            <img src={result.artworkUrl.replace(/\/\d+x\d+bb\./, "/100x100bb.")} alt={result.name} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full bg-[#E4E4E7] flex items-center justify-center"><Mic className="w-3 h-3 text-[#A1A1AA]" /></div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-[#09090B] truncate">{result.name}</div>
                        </div>
                      </Link>
                    ) : (
                      <div
                        key={result.slug}
                        className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#F7F7FC] transition-colors border-b border-[#F0F0F2] last:border-b-0"
                        data-testid={`sidebar-result-podcast-${result.slug}`}
                      >
                        <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-[#F0F0F2]">
                          {result.artworkUrl ? (
                            <img src={result.artworkUrl.replace(/\/\d+x\d+bb\./, "/100x100bb.")} alt={result.name} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full bg-[#E4E4E7] flex items-center justify-center"><Mic className="w-3 h-3 text-[#A1A1AA]" /></div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-[#09090B] truncate">{result.name}</div>
                        </div>
                        {result.itunesId && (
                          recentlyFollowed.has(String(result.itunesId)) ? (
                            <span
                              className="text-[11px] font-bold text-[#A1A1AA] bg-[#F0F0F2] rounded-full px-2.5 py-1 flex-shrink-0"
                              data-testid={`sidebar-following-podcast-${result.slug}`}
                            >
                              Following
                            </span>
                          ) : (
                            <button
                              onClick={() => handleFollowExternal({ id: result.itunesId, name: result.name, artworkUrl: result.artworkUrl })}
                              className="text-[11px] font-bold text-[#6366F1] bg-[#EEF2FF] hover:bg-[#E0E7FF] rounded-full px-2.5 py-1 transition-colors flex-shrink-0"
                              data-testid={`sidebar-follow-podcast-${result.slug}`}
                            >
                              Follow
                            </button>
                          )
                        )}
                      </div>
                    )
                  )}
                </div>
              )}
              {searchData!.episodes.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-bold text-[#A1A1AA] uppercase tracking-wider bg-[#FAFAFA]">Episodes</div>
                  {searchData!.episodes.map((ep) => (
                    <Link
                      key={`${ep.podcastSlug}-${ep.episodeSlug}`}
                      href={`/podcasts/${ep.podcastSlug}/${ep.episodeSlug}`}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#F7F7FC] transition-colors border-b border-[#F0F0F2] last:border-b-0 no-underline"
                      onClick={() => setQuery("")}
                      data-testid={`sidebar-result-episode-${ep.episodeSlug}`}
                    >
                      <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-[#F0F0F2]">
                        {ep.artworkUrl ? (
                          <img src={ep.artworkUrl.replace(/\/\d+x\d+bb\./, "/100x100bb.")} alt={ep.episodeTitle} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full bg-[#E4E4E7] flex items-center justify-center"><Mic className="w-3 h-3 text-[#A1A1AA]" /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold text-[#09090B] truncate">{ep.episodeTitle}</div>
                        <div className="text-[10px] text-[#A1A1AA] mt-[1px] truncate">{ep.podcastName}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {searchData!.people.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-bold text-[#A1A1AA] uppercase tracking-wider bg-[#FAFAFA]">People</div>
                  {searchData!.people.map((person) => (
                    <Link
                      key={person.slug}
                      href={`/people/${person.slug}`}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#F7F7FC] transition-colors border-b border-[#F0F0F2] last:border-b-0 no-underline"
                      onClick={() => setQuery("")}
                      data-testid={`sidebar-result-person-${person.slug}`}
                    >
                      <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-[#F0F0F2]">
                        {person.photoUrl ? (
                          <img src={person.photoUrl} alt={person.name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full bg-[#E4E4E7] flex items-center justify-center"><User className="w-3 h-3 text-[#A1A1AA]" /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold text-[#09090B] truncate">{person.name}</div>
                        {(person.title || person.company) && (
                          <div className="text-[10px] text-[#A1A1AA] mt-[1px] truncate">{[person.title, person.company].filter(Boolean).join(" at ")}</div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {searchData!.companies.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-bold text-[#A1A1AA] uppercase tracking-wider bg-[#FAFAFA]">Companies</div>
                  {searchData!.companies.map((company) => (
                    <Link
                      key={company.slug}
                      href={`/companies/${company.slug}`}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#F7F7FC] transition-colors border-b border-[#F0F0F2] last:border-b-0 no-underline"
                      onClick={() => setQuery("")}
                      data-testid={`sidebar-result-company-${company.slug}`}
                    >
                      <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-[#F0F0F2]">
                        {company.logoUrl ? (
                          <img src={company.logoUrl} alt={company.name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full bg-[#E4E4E7] flex items-center justify-center"><Building2 className="w-3 h-3 text-[#A1A1AA]" /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold text-[#09090B] truncate">{company.name}</div>
                        {company.industry && (
                          <div className="text-[10px] text-[#A1A1AA] mt-[1px] truncate">{company.industry}</div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          ) : null}
          {itunesExternalResults.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-bold text-[#A1A1AA] uppercase tracking-wider bg-[#FAFAFA]">Discover on iTunes</div>
              {itunesExternalResults.map((result: any) => (
                <div
                  key={result.id}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#F7F7FC] transition-colors border-b border-[#F0F0F2] last:border-b-0"
                  data-testid={`sidebar-itunes-${result.id}`}
                >
                  <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-[#F0F0F2]">
                    {result.artworkUrl ? (
                      <img src={result.artworkUrl.replace(/\/\d+x\d+bb\./, "/100x100bb.")} alt={result.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full bg-[#E4E4E7] flex items-center justify-center"><Mic className="w-3 h-3 text-[#A1A1AA]" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-[#09090B] truncate">{result.name}</div>
                    <div className="text-[10px] text-[#A1A1AA] truncate">{result.artistName || result.genre || ""}</div>
                  </div>
                  {recentlyFollowed.has(String(result.id)) ? (
                    <span
                      className="text-[11px] font-bold text-[#A1A1AA] bg-[#F0F0F2] rounded-full px-2.5 py-1 flex-shrink-0"
                      data-testid={`sidebar-following-itunes-${result.id}`}
                    >
                      Following
                    </span>
                  ) : (
                    <button
                      onClick={() => handleFollowExternal(result)}
                      className="text-[11px] font-bold text-[#6366F1] bg-[#EEF2FF] hover:bg-[#E0E7FF] rounded-full px-2.5 py-1 transition-colors flex-shrink-0"
                      data-testid={`sidebar-follow-itunes-${result.id}`}
                    >
                      Follow
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {noResults ? (
            <div className="px-4 py-4" data-testid="sidebar-search-no-results">
              <div className="text-[14px] font-medium text-[#52525B] mb-1">
                No results found
              </div>
              <p className="text-[12px] text-[#A1A1AA] leading-relaxed">
                We couldn't find any podcasts, episodes, people, or companies matching your search.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PodSquadCard() {
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState(false);

  const { data: stats } = useQuery<ReferralStats>({
    queryKey: ["/api/referral/stats"],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (dismissed) return null;

  const referralCount = stats?.referralCount || 0;
  const nextThreshold = stats?.nextTier?.threshold || 3;
  const progressPercent = Math.min((referralCount / nextThreshold) * 100, 100);

  return (
    <div
      className="rounded-2xl p-[18px] pl-5 mb-[14px] relative"
      style={{ background: "linear-gradient(145deg, #6366F1, #8B5CF6)" }}
      data-testid="rail-pod-squad"
    >
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 w-[26px] h-[26px] rounded-full flex items-center justify-center transition-all"
        style={{ background: "rgba(255,255,255,0.15)" }}
        data-testid="rail-squad-close"
      >
        <X className="w-3 h-3 text-white/70 hover:text-white" />
      </button>
      <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-white/65 mb-[6px]">
        🏆 The Pod Squad
      </div>
      <div className="text-[20px] text-white leading-[1.3] mb-[6px]" style={{ fontFamily: "var(--font-serif)" }}>
        Refer friends. Get gear.
      </div>
      <div className="text-[13px] text-white/75 mb-[14px] leading-[1.5]">
        You're {Math.max(nextThreshold - referralCount, 1)} referral{nextThreshold - referralCount !== 1 ? 's' : ''} away from your next reward.
      </div>
      <div className="flex items-center gap-[10px] mb-[14px]">
        <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.2)" }}>
          <div className="h-full bg-white rounded-full" style={{ width: `${progressPercent}%` }} />
        </div>
        <span className="text-[11px] text-white/80 whitespace-nowrap" style={{ fontFamily: "var(--font-mono)" }}>
          {referralCount} / {nextThreshold}
        </span>
      </div>
      <button
        onClick={() => navigate("/pod-squad")}
        className="inline-flex items-center gap-[5px] text-white text-[13px] font-semibold px-4 py-2 rounded-lg transition-all cursor-pointer"
        style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)" }}
        data-testid="rail-squad-join"
      >
        Join the Pod Squad →
      </button>
    </div>
  );
}

function ShopSection() {
  const { data: sidebarData } = useQuery<{ recommended: RecommendedItem[] }>({
    queryKey: ["/api/sidebar-data"],
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const items = sidebarData?.recommended || [];
  if (items.length === 0) return null;

  return (
    <div className="bg-white border border-[#F0F0F2] rounded-[14px] overflow-hidden mb-[14px]" data-testid="rail-shop">
      <div className="px-4 pt-[15px] pb-[13px] border-b border-[#F0F0F2]">
        <div className="text-[15px] font-bold text-[#09090B]">Podcast Recommended</div>
      </div>
      {items.slice(0, 6).map((item, i) => (
        <Link key={i} href={item.link || "/shop"}>
          <div className="flex items-start gap-3 px-4 py-3 border-b border-[#F0F0F2] last:border-b-0 cursor-pointer hover:bg-[#F7F7FC] transition-colors" data-testid={`rail-shop-item-${i}`}>
            <div className="w-[46px] h-[46px] rounded-[10px] bg-[#F7F7FC] border border-[#F0F0F2] flex-shrink-0 flex items-center justify-center text-[22px] overflow-hidden">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : item.type === "book" ? "📚" : "🛍️"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-[#09090B] truncate">{item.name}</div>
              {item.subtitle && <div className="text-[12px] text-[#71717A] mt-[1px]">{item.subtitle}</div>}
            </div>
          </div>
        </Link>
      ))}
      <div className="px-4 py-[11px]">
        <Link href="/shop" className="text-[13px] font-medium text-[#6366F1] hover:underline" data-testid="rail-shop-show-more">
          Browse the full shop →
        </Link>
      </div>
    </div>
  );
}

export function RightSidebar() {
  return (
    <aside
      className="w-[312px] flex-shrink-0 bg-[#F7F7FC] flex flex-col h-screen sticky top-0"
      data-testid="right-sidebar"
    >
      <SidebarSearch />
      <div className="flex-1 overflow-y-auto px-4 py-[14px] hide-scrollbar">
        <PodSquadCard />
        <ShopSection />
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-[#A1A1AA] px-1 pt-4">
          <Link href="/terms" className="hover:underline" data-testid="link-terms">Terms</Link>
          <span>·</span>
          <Link href="/privacy" className="hover:underline" data-testid="link-privacy">Privacy</Link>
          <span>·</span>
          <Link href="/about" className="hover:underline" data-testid="link-about">About</Link>
          <span>·</span>
          <Link href="/help" className="hover:underline" data-testid="link-more">More</Link>
        </div>
        <p className="text-[11px] text-[#A1A1AA] px-1 mt-1">&copy; 2026 PodCap, Inc.</p>
      </div>
    </aside>
  );
}
