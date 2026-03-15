import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, X, ArrowLeft, Building2, Lightbulb, Briefcase, Sparkles, ChevronRight, ListIcon } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { FeedHeader } from "@/components/FeedHeader";
import { useLocation } from "wouter";

interface PodcastList {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  podcast_slugs: string[];
  category: string | null;
}

interface DirectoryPodcast {
  slug: string;
  name: string;
  artworkUrl: string;
  description?: string;
  category?: string;
}

interface ListDetailPodcast {
  slug: string;
  name: string;
  artwork_url: string;
  description?: string;
  category?: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Building2; color: string }> = {
  industry: { label: "Industries", icon: Building2, color: "#6366F1" },
  interest: { label: "Interests", icon: Lightbulb, color: "#F59E0B" },
  role: { label: "Roles", icon: Briefcase, color: "#10B981" },
  curated: { label: "Curated", icon: Sparkles, color: "#EC4899" },
};

function FollowButton({
  slug,
  isFollowing,
  isPending,
  onFollow,
  onUnfollow,
}: {
  slug: string;
  isFollowing: boolean;
  isPending?: boolean;
  onFollow: (slug: string) => void;
  onUnfollow: (slug: string) => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (isPending) return;
        isFollowing ? onUnfollow(slug) : onFollow(slug);
      }}
      disabled={isPending}
      aria-pressed={isFollowing}
      className={`flex-shrink-0 px-4 py-1.5 rounded-full text-[13px] font-bold transition-all active:scale-95 disabled:opacity-50 ${
        isFollowing
          ? "bg-[#F4F4F5] text-[#71717A] border border-[#E4E4E7]"
          : "bg-[#09090B] text-white"
      }`}
      data-testid={`follow-btn-${slug}`}
    >
      {isFollowing ? "Following" : "Follow"}
    </button>
  );
}

function ListDetail({
  list,
  followedSlugs,
  onFollow,
  onUnfollow,
  onBack,
}: {
  list: PodcastList;
  followedSlugs: Set<string>;
  onFollow: (slug: string) => void;
  onUnfollow: (slug: string) => void;
  onBack: () => void;
}) {
  const { data: listDetail, isLoading } = useQuery<{ podcasts: ListDetailPodcast[] }>({
    queryKey: ["/api/lists", list.slug],
  });

  const podcasts = listDetail?.podcasts || [];
  const followingCount = podcasts.filter((p) => followedSlugs.has(p.slug)).length;

  return (
    <div data-testid={`list-detail-${list.slug}`}>
      <div className="sticky top-[52px] z-30 bg-white border-b border-[#F0F0F2]">
        <div className="max-w-[600px] mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 flex items-center justify-center flex-shrink-0 -ml-1"
            aria-label="Back to lists"
            data-testid="list-detail-back"
          >
            <ArrowLeft className="w-5 h-5 text-[#09090B]" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-bold text-[#09090B] truncate">{list.name}</h2>
            <p className="text-[12px] text-[#A1A1AA]">
              {list.podcast_slugs.length} podcasts · {followingCount} following
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-[600px] mx-auto px-4 py-2">
        {list.description && (
          <p className="text-[14px] text-[#71717A] mb-3 leading-relaxed">{list.description}</p>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-[#6366F1]" />
          </div>
        ) : (
          <div className="divide-y divide-[#F4F4F5]">
            {podcasts.map((p) => (
              <div
                key={p.slug}
                className="flex items-center gap-3 py-3"
                data-testid={`list-podcast-${p.slug}`}
              >
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#F4F4F5] flex-shrink-0 ring-[0.5px] ring-black/5">
                  <img src={p.artwork_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-[#09090B] truncate">{p.name}</p>
                  {p.category && <p className="text-[12px] text-[#A1A1AA] mt-0.5">{p.category}</p>}
                </div>
                <FollowButton
                  slug={p.slug}
                  isFollowing={followedSlugs.has(p.slug)}
                  onFollow={onFollow}
                  onUnfollow={onUnfollow}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DiscoverPage() {
  const { data: user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedList, setSelectedList] = useState<PodcastList | null>(null);

  const { data: lists = [], isLoading: loadingLists } = useQuery<PodcastList[]>({
    queryKey: ["/api/lists"],
  });

  const { data: directoryData } = useQuery<DirectoryPodcast[]>({
    queryKey: ["/api/podcasts/directory"],
    select: (data: any[]) => data.map((p: any) => ({
      slug: p.slug,
      name: p.name,
      artworkUrl: p.artwork_url || p.artworkUrl,
      description: p.description,
      category: p.category,
    })),
  });

  const { data: followedSlugsFetch } = useQuery<{ followedSlugs: string[] }>({
    queryKey: ["/api/feed/followed-slugs"],
    enabled: !!user,
  });

  const resolvedFollowedSlugs = useMemo(() => {
    return new Set(followedSlugsFetch?.followedSlugs || []);
  }, [followedSlugsFetch]);

  const followMutation = useMutation({
    mutationFn: async (podcastSlug: string) => {
      const res = await apiRequest("POST", "/api/feed/follow", { podcastSlug });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-slugs"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to follow podcast", variant: "destructive" });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async (podcastSlug: string) => {
      const res = await apiRequest("POST", "/api/feed/unfollow", { podcastSlug });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-slugs"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to unfollow podcast", variant: "destructive" });
    },
  });

  const handleFollow = (slug: string) => {
    if (!user) {
      toast({ title: "Sign in required", description: "Log in to follow podcasts", variant: "destructive" });
      return;
    }
    followMutation.mutate(slug);
  };

  const handleUnfollow = (slug: string) => {
    unfollowMutation.mutate(slug);
  };

  const recommendedLists = useMemo(() => {
    if (!resolvedFollowedSlugs.size || !lists.length) return [];
    return lists
      .map((list) => {
        const overlap = list.podcast_slugs.filter((s) => resolvedFollowedSlugs.has(s)).length;
        const newPodcasts = list.podcast_slugs.filter((s) => !resolvedFollowedSlugs.has(s)).length;
        return { list, overlap, newPodcasts, score: overlap * 2 + newPodcasts };
      })
      .filter((item) => item.overlap > 0 && item.newPodcasts > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((item) => item.list);
  }, [lists, resolvedFollowedSlugs]);

  const categories = useMemo(() => {
    const cats = [...new Set(lists.map((l) => l.category || "curated"))].sort();
    return cats;
  }, [lists]);

  const effectiveCategory = activeCategory ?? (recommendedLists.length > 0 ? "recommended" : "industry");

  const filteredLists = useMemo(() => {
    if (effectiveCategory === "recommended") return recommendedLists;
    return lists.filter((l) => (l.category || "curated") === effectiveCategory);
  }, [lists, effectiveCategory, recommendedLists]);

  const filteredPodcasts = searchQuery.length >= 2
    ? (directoryData || []).filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const searchedLists = searchQuery.length >= 2
    ? lists.filter((l) => l.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  if (selectedList) {
    return (
      <div className="min-h-screen bg-white" data-testid="discover-page">
        <FeedHeader />
        <ListDetail
          list={selectedList}
          followedSlugs={resolvedFollowedSlugs}
          onFollow={handleFollow}
          onUnfollow={handleUnfollow}
          onBack={() => setSelectedList(null)}
        />
        <div className="h-[80px]" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
        <BottomNav currentPath={location} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white" data-testid="discover-page">
      <FeedHeader />

      <div className="sticky top-[52px] z-30 bg-white border-b border-[#F0F0F2]">
        <div className="max-w-[600px] mx-auto px-4 py-2.5">
          <div className="relative flex items-center gap-2">
            {searchFocused && (
              <button
                onClick={() => { setSearchFocused(false); setSearchQuery(""); }}
                className="w-9 h-9 flex items-center justify-center flex-shrink-0"
                aria-label="Close search"
                data-testid="discover-search-back"
              >
                <ArrowLeft className="w-5 h-5 text-[#09090B]" />
              </button>
            )}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A1A1AA]" />
              <input
                type="text"
                placeholder="Search podcasts and lists"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                className="w-full bg-[#F4F4F5] rounded-full py-2.5 pl-10 pr-10 text-[15px] text-[#09090B] placeholder:text-[#A1A1AA] focus:outline-none focus:bg-[#ECECEE] transition-colors"
                data-testid="discover-search-input"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-[#A1A1AA] flex items-center justify-center"
                  aria-label="Clear search"
                  data-testid="discover-search-clear"
                >
                  <X className="w-3 h-3 text-white" strokeWidth={3} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[600px] mx-auto">
        {searchQuery.length >= 2 ? (
          <div className="px-4 py-3">
            {searchedLists.length > 0 && (
              <div className="mb-4">
                <h3 className="text-[13px] font-bold text-[#A1A1AA] uppercase tracking-wide mb-2">Lists</h3>
                <div className="space-y-1">
                  {searchedLists.slice(0, 5).map((list) => (
                    <button
                      key={list.slug}
                      onClick={() => { setSelectedList(list); setSearchQuery(""); setSearchFocused(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F9F9FB] active:bg-[#F4F4F5] transition-colors text-left"
                      data-testid={`search-list-${list.slug}`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-[#F4F4F5] flex items-center justify-center flex-shrink-0">
                        <ListIcon className="w-5 h-5 text-[#A1A1AA]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold text-[#09090B] truncate">{list.name}</p>
                        <p className="text-[12px] text-[#A1A1AA]">{list.podcast_slugs.length} podcasts · {list.category}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#D4D4D8] flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filteredPodcasts.length > 0 && (
              <div>
                <h3 className="text-[13px] font-bold text-[#A1A1AA] uppercase tracking-wide mb-2">Podcasts</h3>
                <div className="divide-y divide-[#F4F4F5]">
                  {filteredPodcasts.slice(0, 20).map((p) => (
                    <div key={p.slug} className="flex items-center gap-3 py-3" data-testid={`search-podcast-${p.slug}`}>
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#F4F4F5] flex-shrink-0 ring-[0.5px] ring-black/5">
                        <img src={p.artworkUrl} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold text-[#09090B] truncate">{p.name}</p>
                        {p.category && <p className="text-[12px] text-[#A1A1AA] mt-0.5">{p.category}</p>}
                      </div>
                      <FollowButton
                        slug={p.slug}
                        isFollowing={resolvedFollowedSlugs.has(p.slug)}
                        onFollow={handleFollow}
                        onUnfollow={handleUnfollow}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {searchedLists.length === 0 && filteredPodcasts.length === 0 && (
              <div className="text-center py-12">
                <p className="text-[15px] text-[#71717A]">No results for "{searchQuery}"</p>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
              {recommendedLists.length > 0 && (
                <button
                  onClick={() => setActiveCategory("recommended")}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-bold whitespace-nowrap transition-all active:scale-95 ${
                    effectiveCategory === "recommended"
                      ? "bg-[#09090B] text-white"
                      : "bg-[#F4F4F5] text-[#52525B] hover:bg-[#E4E4E7]"
                  }`}
                  data-testid="discover-category-recommended"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  For You
                </button>
              )}
              {categories.map((cat) => {
                const config = CATEGORY_CONFIG[cat] || { label: cat, icon: ListIcon, color: "#6366F1" };
                const Icon = config.icon;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-bold whitespace-nowrap transition-all active:scale-95 ${
                      effectiveCategory === cat
                        ? "bg-[#09090B] text-white"
                        : "bg-[#F4F4F5] text-[#52525B] hover:bg-[#E4E4E7]"
                    }`}
                    data-testid={`discover-category-${cat}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {config.label}
                  </button>
                );
              })}
            </div>

            {loadingLists ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-[#6366F1]" />
              </div>
            ) : (
              <div className="px-4 pb-4">
                {effectiveCategory === "recommended" && recommendedLists.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[13px] text-[#A1A1AA] mb-3">Lists based on podcasts you follow</p>
                  </div>
                )}
                <div className="space-y-2">
                  {filteredLists.map((list) => {
                    const followingCount = list.podcast_slugs.filter((s) => resolvedFollowedSlugs.has(s)).length;
                    const previewSlugs = list.podcast_slugs.slice(0, 5);
                    const previewPodcasts = previewSlugs
                      .map((slug) => directoryData?.find((p) => p.slug === slug))
                      .filter(Boolean) as DirectoryPodcast[];

                    return (
                      <button
                        key={list.slug}
                        onClick={() => setSelectedList(list)}
                        className="w-full text-left border border-[#F0F0F2] rounded-2xl p-4 hover:bg-[#FAFAFA] active:bg-[#F4F4F5] transition-colors"
                        data-testid={`discover-list-${list.slug}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-[16px] font-bold text-[#09090B]">{list.name}</h3>
                            <p className="text-[13px] text-[#A1A1AA] mt-0.5">
                              {list.podcast_slugs.length} podcasts
                              {followingCount > 0 && <span className="text-[#6366F1] font-medium"> · {followingCount} following</span>}
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-[#D4D4D8] mt-1 flex-shrink-0" />
                        </div>
                        {list.description && (
                          <p className="text-[13px] text-[#71717A] mb-3 line-clamp-2 leading-relaxed">{list.description}</p>
                        )}
                        {previewPodcasts.length > 0 && (
                          <div className="flex items-center gap-0">
                            {previewPodcasts.map((p, i) => (
                              <div
                                key={p.slug}
                                className="w-9 h-9 rounded-lg overflow-hidden ring-2 ring-white flex-shrink-0"
                                style={{ marginLeft: i > 0 ? "-6px" : "0", zIndex: 5 - i }}
                              >
                                <img src={p.artworkUrl} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                              </div>
                            ))}
                            {list.podcast_slugs.length > 5 && (
                              <div
                                className="w-9 h-9 rounded-lg bg-[#F4F4F5] flex items-center justify-center ring-2 ring-white flex-shrink-0 text-[11px] font-bold text-[#71717A]"
                                style={{ marginLeft: "-6px", zIndex: 0 }}
                              >
                                +{list.podcast_slugs.length - 5}
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {filteredLists.length === 0 && effectiveCategory === "recommended" && (
                  <div className="text-center py-12">
                    <Sparkles className="w-10 h-10 mx-auto mb-3 text-[#D4D4D8]" />
                    <p className="text-[15px] font-medium text-[#71717A]">Follow some podcasts first</p>
                    <p className="text-[13px] text-[#A1A1AA] mt-1">We'll recommend lists based on what you follow</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        <div className="h-[80px]" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
      </div>
      <BottomNav currentPath={location} />
    </div>
  );
}
