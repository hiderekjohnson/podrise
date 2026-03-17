import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, X, ArrowLeft, ChevronRight, ListIcon, Brain, Rocket, BarChart3, Coins, Heart, BookOpen, Zap, Globe } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Link } from "wouter";

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

const DISCOVER_TOPICS = [
  { slug: "ai", name: "AI", icon: Brain, color: "#8B5CF6" },
  { slug: "startups", name: "Startups", icon: Rocket, color: "#F59E0B" },
  { slug: "investing", name: "Investing", icon: BarChart3, color: "#3B82F6" },
  { slug: "crypto-web3", name: "Crypto", icon: Coins, color: "#F97316" },
  { slug: "health-longevity", name: "Health", icon: Heart, color: "#EF4444" },
  { slug: "psychology", name: "Psychology", icon: BookOpen, color: "#A855F7" },
  { slug: "productivity", name: "Productivity", icon: Zap, color: "#EAB308" },
  { slug: "geopolitics", name: "Geopolitics", icon: Globe, color: "#64748B" },
] as const;

function AllPodcastsGrid({
  podcasts,
  followedSlugs,
  onFollow,
  onUnfollow,
}: {
  podcasts: DirectoryPodcast[];
  followedSlugs: Set<string>;
  onFollow: (slug: string) => void;
  onUnfollow: (slug: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? podcasts : podcasts.slice(0, 20);

  return (
    <div className="px-4 md:px-8 pt-2 pb-4" data-testid="all-podcasts-grid">
      <h2 className="text-[16px] md:text-[18px] font-bold text-[#09090B] dark:text-white mb-3">All Podcasts</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {visible.map((p) => (
          <div key={p.slug} className="bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.06] rounded-2xl overflow-hidden hover:shadow-lg hover:border-[#6366F1]/20 transition-all duration-200" data-testid={`discover-podcast-${p.slug}`}>
            <Link href={`/podcasts/${p.slug}`} className="block">
              <div className="aspect-square overflow-hidden bg-[#F4F4F5] dark:bg-[#1C1C22]">
                <img src={p.artworkUrl} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
              </div>
            </Link>
            <div className="p-3">
              <Link href={`/podcasts/${p.slug}`}>
                <h3 className="text-[14px] font-bold text-[#09090B] dark:text-white leading-snug line-clamp-2 hover:text-[#6366F1] transition-colors" data-testid={`discover-podcast-name-${p.slug}`}>
                  {p.name}
                </h3>
              </Link>
              {p.category && <p className="text-[12px] text-[#A1A1AA] mt-0.5 line-clamp-1">{p.category}</p>}
              <div className="mt-2">
                <FollowButton
                  slug={p.slug}
                  isFollowing={followedSlugs.has(p.slug)}
                  onFollow={onFollow}
                  onUnfollow={onUnfollow}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      {!showAll && podcasts.length > 20 && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => setShowAll(true)}
            className="px-8 py-3 bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] font-semibold text-[15px] rounded-full hover:opacity-90 transition-opacity shadow-sm"
            data-testid="discover-see-more"
          >
            See more
          </button>
        </div>
      )}
    </div>
  );
}

function TopicPodcastsGrid({
  topicSlug,
  followedSlugs,
  onFollow,
  onUnfollow,
}: {
  topicSlug: string;
  followedSlugs: Set<string>;
  onFollow: (slug: string) => void;
  onUnfollow: (slug: string) => void;
}) {
  const { data: podcasts, isLoading, isError } = useQuery<DirectoryPodcast[]>({
    queryKey: ["/api/podcasts/directory/by-topic", topicSlug],
    select: (data: any[]) => data.map((p: any) => ({
      slug: p.slug,
      name: p.name,
      artworkUrl: p.artwork_url || p.artworkUrl,
      description: p.description,
      category: p.category,
    })),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-[#6366F1]" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-10" data-testid="topic-podcasts-error">
        <p className="text-[14px] text-[#EF4444]">Failed to load podcasts. Please try again later.</p>
      </div>
    );
  }

  if (!podcasts || podcasts.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-[14px] text-[#A1A1AA]">No podcasts found for this topic</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3" data-testid="topic-podcasts-grid">
      {podcasts.map((p) => (
        <div key={p.slug} className="bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.06] rounded-2xl overflow-hidden hover:shadow-lg hover:border-[#6366F1]/20 transition-all duration-200" data-testid={`topic-podcast-${p.slug}`}>
          <Link href={`/podcasts/${p.slug}`} className="block">
            <div className="aspect-square overflow-hidden bg-[#F4F4F5] dark:bg-[#1C1C22]">
              <img src={p.artworkUrl} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
            </div>
          </Link>
          <div className="p-3">
            <Link href={`/podcasts/${p.slug}`}>
              <h3 className="text-[14px] font-bold text-[#09090B] dark:text-white leading-snug line-clamp-2 hover:text-[#6366F1] transition-colors" data-testid={`topic-podcast-name-${p.slug}`}>
                {p.name}
              </h3>
            </Link>
            {p.category && <p className="text-[12px] text-[#A1A1AA] mt-0.5 line-clamp-1">{p.category}</p>}
            <div className="mt-2">
              <FollowButton
                slug={p.slug}
                isFollowing={followedSlugs.has(p.slug)}
                onFollow={onFollow}
                onUnfollow={onUnfollow}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}


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
          ? "bg-[#F4F4F5] dark:bg-[#1C1C22] text-[#71717A] border border-[#E4E4E7] dark:border-[#3F3F46]"
          : "bg-[#09090B] dark:bg-white text-white dark:text-[#09090B]"
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
  onFollowAll,
  onBack,
}: {
  list: PodcastList;
  followedSlugs: Set<string>;
  onFollow: (slug: string) => void;
  onUnfollow: (slug: string) => void;
  onFollowAll: (slugs: string[]) => void;
  onBack: () => void;
}) {
  const { data: listDetail, isLoading } = useQuery<{ podcasts: ListDetailPodcast[] }>({
    queryKey: ["/api/lists", list.slug],
  });

  const podcasts = listDetail?.podcasts || [];
  const followingCount = podcasts.filter((p) => followedSlugs.has(p.slug)).length;
  const unfollowedSlugs = podcasts.filter((p) => !followedSlugs.has(p.slug)).map((p) => p.slug);

  return (
    <div data-testid={`list-detail-${list.slug}`}>
      <div className="sticky top-0 z-30 bg-white dark:bg-[#09090B] border-b border-[#F0F0F2] dark:border-[#1C1C22]">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 flex items-center justify-center flex-shrink-0 -ml-1"
            aria-label="Back to lists"
            data-testid="list-detail-back"
          >
            <ArrowLeft className="w-5 h-5 text-[#09090B] dark:text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] md:text-[20px] font-bold text-[#09090B] dark:text-white truncate">{list.name}</h2>
            <p className="text-[12px] md:text-[13px] text-[#A1A1AA]">
              {list.podcast_slugs.length} podcasts · {followingCount} following
            </p>
          </div>
          {unfollowedSlugs.length > 0 && (
            <button
              onClick={() => onFollowAll(unfollowedSlugs)}
              className="px-4 py-2 bg-[#6366F1] text-white text-[13px] font-bold rounded-full hover:bg-[#4F46E5] transition-colors active:scale-95"
              data-testid="list-follow-all-btn"
            >
              Follow All
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-2">
        {list.description && (
          <p className="text-[14px] md:text-[15px] text-[#71717A] dark:text-[#A1A1AA] mb-3 leading-relaxed">{list.description}</p>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-[#6366F1]" />
          </div>
        ) : (
          <div className="divide-y divide-[#F4F4F5] dark:divide-[#1C1C22]">
            {podcasts.map((p) => (
              <div
                key={p.slug}
                className="flex items-center gap-3 py-3"
                data-testid={`list-podcast-${p.slug}`}
              >
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#F4F4F5] dark:bg-[#1C1C22] flex-shrink-0 ring-[0.5px] ring-black/5">
                  <img src={p.artwork_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] md:text-[16px] font-semibold text-[#09090B] dark:text-white truncate">{p.name}</p>
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
  const initialQuery = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("q") || "" : "";
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedList, setSelectedList] = useState<PodcastList | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q") || "";
    if (q && q !== searchQuery) {
      setSearchQuery(q);
    }
  }, []);

  const { data: lists = [] } = useQuery<PodcastList[]>({
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

  const handleFollowAll = (slugs: string[]) => {
    slugs.forEach((slug) => followMutation.mutate(slug));
    toast({ title: "Following all", description: `Following ${slugs.length} new podcasts` });
  };

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
      <DashboardLayout>
        <div className="min-h-screen bg-white dark:bg-[#09090B]" data-testid="discover-page">
          <ListDetail
            list={selectedList}
            followedSlugs={resolvedFollowedSlugs}
            onFollow={handleFollow}
            onUnfollow={handleUnfollow}
            onFollowAll={handleFollowAll}
            onBack={() => setSelectedList(null)}
          />
          <div className="h-[80px] md:h-4" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-white dark:bg-[#09090B]" data-testid="discover-page">
        <div className="max-w-5xl mx-auto px-4 md:px-8 pt-6 pb-3">
          <h1 className="text-[22px] md:text-[26px] font-bold text-[#09090B] dark:text-white mb-4">Discover</h1>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#A1A1AA]" />
            <input
              type="text"
              placeholder="Search podcasts and lists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#F4F4F5] dark:bg-[#1C1C22] rounded-2xl py-3.5 pl-12 pr-12 text-[16px] md:text-[17px] text-[#09090B] dark:text-white placeholder:text-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/30 transition-all"
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

        <div className="max-w-5xl mx-auto">
          {searchQuery.length >= 2 ? (
            <div className="px-4 md:px-8 py-3">
              {searchedLists.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-[13px] font-bold text-[#A1A1AA] uppercase tracking-wide mb-2">Lists</h3>
                  <div className="space-y-1">
                    {searchedLists.slice(0, 5).map((list) => (
                      <button
                        key={list.slug}
                        onClick={() => { setSelectedList(list); setSearchQuery(""); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F9F9FB] dark:hover:bg-[#111114] active:bg-[#F4F4F5] transition-colors text-left"
                        data-testid={`search-list-${list.slug}`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-[#F4F4F5] dark:bg-[#1C1C22] flex items-center justify-center flex-shrink-0">
                          <ListIcon className="w-5 h-5 text-[#A1A1AA]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] md:text-[16px] font-semibold text-[#09090B] dark:text-white truncate">{list.name}</p>
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
                  <div className="divide-y divide-[#F4F4F5] dark:divide-[#1C1C22]">
                    {filteredPodcasts.slice(0, 20).map((p) => (
                      <div key={p.slug} className="flex items-center gap-3 py-3" data-testid={`search-podcast-${p.slug}`}>
                        <Link href={`/podcasts/${p.slug}`} className="w-12 h-12 rounded-xl overflow-hidden bg-[#F4F4F5] dark:bg-[#1C1C22] flex-shrink-0 ring-[0.5px] ring-black/5 block">
                          <img src={p.artworkUrl} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                        </Link>
                        <div className="flex-1 min-w-0">
                          <Link href={`/podcasts/${p.slug}`}>
                            <p className="text-[15px] md:text-[16px] font-semibold text-[#09090B] dark:text-white truncate hover:text-[#6366F1] transition-colors" data-testid={`search-podcast-name-${p.slug}`}>{p.name}</p>
                          </Link>
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
                  <p className="text-[15px] text-[#71717A] dark:text-[#A1A1AA]">No results for "{searchQuery}"</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="px-4 md:px-8 pt-2 pb-4" data-testid="topics-section">
                <h2 className="text-[16px] md:text-[18px] font-bold text-[#09090B] dark:text-white mb-3">Topics</h2>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                  <button
                    onClick={() => setSelectedTopic(null)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-bold whitespace-nowrap transition-all active:scale-95 ${
                      selectedTopic === null
                        ? "bg-[#09090B] dark:bg-white text-white dark:text-[#09090B]"
                        : "bg-[#F4F4F5] dark:bg-[#1C1C22] text-[#52525B] dark:text-[#A1A1AA] hover:bg-[#E4E4E7] dark:hover:bg-[#27272A]"
                    }`}
                    data-testid="topic-pill-all"
                  >
                    All
                  </button>
                  {DISCOVER_TOPICS.map((topic) => {
                    const Icon = topic.icon;
                    const isActive = selectedTopic === topic.slug;
                    return (
                      <button
                        key={topic.slug}
                        onClick={() => setSelectedTopic(isActive ? null : topic.slug)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-bold whitespace-nowrap transition-all active:scale-95 ${
                          isActive
                            ? "text-white"
                            : "bg-[#F4F4F5] dark:bg-[#1C1C22] text-[#52525B] dark:text-[#A1A1AA] hover:bg-[#E4E4E7] dark:hover:bg-[#27272A]"
                        }`}
                        style={isActive ? { backgroundColor: topic.color } : undefined}
                        data-testid={`topic-pill-${topic.slug}`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {topic.name}
                      </button>
                    );
                  })}
                </div>
                {selectedTopic && (
                  <div className="mt-3">
                    <TopicPodcastsGrid
                      topicSlug={selectedTopic}
                      followedSlugs={resolvedFollowedSlugs}
                      onFollow={handleFollow}
                      onUnfollow={handleUnfollow}
                    />
                  </div>
                )}
              </div>

              {!selectedTopic && directoryData && directoryData.length > 0 && (
                <AllPodcastsGrid
                  podcasts={directoryData}
                  followedSlugs={resolvedFollowedSlugs}
                  onFollow={handleFollow}
                  onUnfollow={handleUnfollow}
                />
              )}
            </>
          )}
          <div className="h-[80px] md:h-4" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
        </div>
      </div>
    </DashboardLayout>
  );
}
