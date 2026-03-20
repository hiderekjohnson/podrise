import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, X, Brain, Rocket, BarChart3, Coins, Heart, BookOpen, Zap, Globe, Mic, ArrowLeft, Check, CheckSquare, ArrowUpDown, ChevronDown } from "lucide-react";
import { SiSpotify } from "react-icons/si";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Link } from "wouter";
import { RequestPodcastDialog } from "@/components/RequestPodcastDialog";

interface DirectoryPodcast {
  slug: string;
  name: string;
  artworkUrl: string;
  description?: string;
  category?: string;
}

const DISCOVER_TOPICS = [
  { slug: "startups", name: "Startups", icon: Rocket, color: "#F59E0B" },
  { slug: "investing", name: "Investing", icon: BarChart3, color: "#3B82F6" },
  { slug: "productivity", name: "Productivity", icon: Zap, color: "#EAB308" },
  { slug: "ai", name: "AI", icon: Brain, color: "#8B5CF6" },
  { slug: "crypto-web3", name: "Crypto", icon: Coins, color: "#F97316" },
  { slug: "geopolitics", name: "Geopolitics", icon: Globe, color: "#64748B" },
  { slug: "psychology", name: "Psychology", icon: BookOpen, color: "#A855F7" },
  { slug: "health-longevity", name: "Health", icon: Heart, color: "#EF4444" },
] as const;

type SortOption = "popular" | "episodes" | "newest" | "rated" | "alpha";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "popular", label: "Most Popular" },
  { value: "episodes", label: "Most Episodes" },
  { value: "newest", label: "Newest" },
  { value: "rated", label: "Highest Rated" },
  { value: "alpha", label: "A → Z" },
];

function SortDropdown({
  value,
  onChange,
}: {
  value: SortOption;
  onChange: (value: SortOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = SORT_OPTIONS.find((o) => o.value === value) || SORT_OPTIONS[0];

  return (
    <div className="relative" data-testid="sort-dropdown">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold transition-all active:scale-95 bg-[#F4F4F5] dark:bg-[#1C1C22] text-[#52525B] dark:text-[#A1A1AA] hover:bg-[#E4E4E7] dark:hover:bg-[#27272A]"
        data-testid="sort-dropdown-trigger"
      >
        <ArrowUpDown className="w-3.5 h-3.5" />
        {selected.label}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-[#1C1C22] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl shadow-lg py-1 min-w-[160px]" data-testid="sort-dropdown-menu">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-[13px] font-medium transition-colors ${
                  option.value === value
                    ? "text-[#6366F1] bg-[#6366F1]/[0.06]"
                    : "text-[#52525B] dark:text-[#A1A1AA] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A]"
                }`}
                data-testid={`sort-option-${option.value}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SelectCheckbox({
  selected,
  onToggle,
  slug,
}: {
  selected: boolean;
  onToggle: (slug: string) => void;
  slug: string;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggle(slug);
      }}
      className={`absolute top-2 left-2 z-10 w-7 h-7 rounded-lg flex items-center justify-center transition-all shadow-sm ${
        selected
          ? "bg-[#6366F1] text-white scale-100"
          : "bg-white/80 dark:bg-black/50 text-transparent hover:text-[#A1A1AA] hover:bg-white dark:hover:bg-black/70 backdrop-blur-sm"
      }`}
      aria-label={selected ? `Deselect` : `Select`}
      data-testid={`select-checkbox-${slug}`}
    >
      <Check className="w-4 h-4" strokeWidth={3} />
    </button>
  );
}


function AllPodcastsGrid({
  podcasts,
  followedSlugs,
  onFollow,
  onUnfollow,
  isLoggedIn,
  selectedSlugs,
  onToggleSelect,
  sortBy,
  onSortChange,
}: {
  podcasts: DirectoryPodcast[];
  followedSlugs: Set<string>;
  onFollow: (slug: string) => void;
  onUnfollow: (slug: string) => void;
  isLoggedIn: boolean;
  selectedSlugs: Set<string>;
  onToggleSelect: (slug: string) => void;
  sortBy?: SortOption;
  onSortChange?: (value: SortOption) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(20);
  const visible = podcasts.slice(0, visibleCount);

  return (
    <div className="px-4 md:px-8 pt-2 pb-4" data-testid="all-podcasts-grid">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[16px] md:text-[18px] font-bold text-[#09090B] dark:text-white">All Podcasts</h2>
        {isLoggedIn && sortBy && onSortChange && (
          <div className="flex items-center gap-2">
            <SortDropdown value={sortBy} onChange={onSortChange} />
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {visible.map((p) => {
          const isSelected = selectedSlugs.has(p.slug);
          const isFollowed = followedSlugs.has(p.slug);
          return (
            <div
              key={p.slug}
              className={`relative bg-white dark:bg-white/[0.03] border rounded-2xl overflow-hidden hover:shadow-lg transition-all duration-200 flex flex-col ${
                isSelected
                  ? "border-[#6366F1] ring-2 ring-[#6366F1]/30"
                  : isFollowed
                    ? "border-[#E4E4E7] dark:border-white/[0.06] opacity-75"
                    : "border-[#F0F0F2] dark:border-white/[0.06] hover:border-[#6366F1]/20"
              }`}
              data-testid={`discover-podcast-${p.slug}`}
            >
              {isLoggedIn && (
                <SelectCheckbox
                  selected={isSelected}
                  onToggle={onToggleSelect}
                  slug={p.slug}
                />
              )}
              <Link href={`/podcasts/${p.slug}`} className="block">
                <div className="aspect-square overflow-hidden bg-[#F4F4F5] dark:bg-[#1C1C22]">
                  <img src={p.artworkUrl} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                </div>
              </Link>
              <div className="p-3 flex flex-col flex-1">
                <div className="flex-1">
                  <Link href={`/podcasts/${p.slug}`}>
                    <h3 className="text-[14px] font-bold text-[#09090B] dark:text-white leading-snug line-clamp-2 hover:text-[#6366F1] transition-colors" data-testid={`discover-podcast-name-${p.slug}`}>
                      {p.name}
                    </h3>
                  </Link>
                  {p.category && <p className="text-[12px] text-[#A1A1AA] mt-0.5 line-clamp-1">{p.category}</p>}
                </div>
                <div className="mt-2">
                  <FollowButton
                    slug={p.slug}
                    isFollowing={isFollowed}
                    onFollow={onFollow}
                    onUnfollow={onUnfollow}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {visibleCount < podcasts.length && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => setVisibleCount((c) => c + 20)}
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
  isLoggedIn,
  selectedSlugs,
  onToggleSelect,
  onSelectAllVisible,
  sortBy,
  onSortChange,
}: {
  topicSlug: string;
  followedSlugs: Set<string>;
  onFollow: (slug: string) => void;
  onUnfollow: (slug: string) => void;
  isLoggedIn: boolean;
  selectedSlugs: Set<string>;
  onToggleSelect: (slug: string) => void;
  onSelectAllVisible: (slugs: string[], deselect?: boolean) => void;
  sortBy?: SortOption;
  onSortChange?: (value: SortOption) => void;
}) {
  const sortParam = sortBy || "popular";
  const { data: podcasts, isLoading, isError } = useQuery<DirectoryPodcast[]>({
    queryKey: ["/api/podcasts/directory/by-topic", topicSlug, { sort: sortParam }],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/directory/by-topic/${topicSlug}?sort=${sortParam}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
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
    <div>
      {isLoggedIn && podcasts && podcasts.length > 0 && (() => {
        const allSlugs = podcasts.map((p) => p.slug);
        const allSelected = allSlugs.length > 0 && allSlugs.every((s) => selectedSlugs.has(s));
        return (
          <div className="flex justify-end gap-2 mb-2">
            {sortBy && onSortChange && (
              <SortDropdown value={sortBy} onChange={onSortChange} />
            )}
            <button
              onClick={() => onSelectAllVisible(allSlugs, allSelected)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold transition-all active:scale-95 bg-[#F4F4F5] dark:bg-[#1C1C22] text-[#52525B] dark:text-[#A1A1AA] hover:bg-[#E4E4E7] dark:hover:bg-[#27272A]"
              data-testid={`select-all-topic-${topicSlug}`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              {allSelected ? "Deselect All" : "Select All"}
            </button>
          </div>
        );
      })()}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3" data-testid="topic-podcasts-grid">
        {podcasts.map((p) => {
          const isSelected = selectedSlugs.has(p.slug);
          const isFollowed = followedSlugs.has(p.slug);
          return (
            <div
              key={p.slug}
              className={`relative bg-white dark:bg-white/[0.03] border rounded-2xl overflow-hidden hover:shadow-lg transition-all duration-200 flex flex-col ${
                isSelected
                  ? "border-[#6366F1] ring-2 ring-[#6366F1]/30"
                  : isFollowed
                    ? "border-[#E4E4E7] dark:border-white/[0.06] opacity-75"
                    : "border-[#F0F0F2] dark:border-white/[0.06] hover:border-[#6366F1]/20"
              }`}
              data-testid={`topic-podcast-${p.slug}`}
            >
              {isLoggedIn && (
                <SelectCheckbox
                  selected={isSelected}
                  onToggle={onToggleSelect}
                  slug={p.slug}
                />
              )}
              <Link href={`/podcasts/${p.slug}`} className="block">
                <div className="aspect-square overflow-hidden bg-[#F4F4F5] dark:bg-[#1C1C22]">
                  <img src={p.artworkUrl} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                </div>
              </Link>
              <div className="p-3 flex flex-col flex-1">
                <div className="flex-1">
                  <Link href={`/podcasts/${p.slug}`}>
                    <h3 className="text-[14px] font-bold text-[#09090B] dark:text-white leading-snug line-clamp-2 hover:text-[#6366F1] transition-colors" data-testid={`topic-podcast-name-${p.slug}`}>
                      {p.name}
                    </h3>
                  </Link>
                  {p.category && <p className="text-[12px] text-[#A1A1AA] mt-0.5 line-clamp-1">{p.category}</p>}
                </div>
                <div className="mt-2">
                  <FollowButton
                    slug={p.slug}
                    isFollowing={isFollowed}
                    onFollow={onFollow}
                    onUnfollow={onUnfollow}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
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

function FloatingActionBar({
  selectedCount,
  onFollowSelected,
  onClearSelection,
  isPending,
}: {
  selectedCount: number;
  onFollowSelected: () => void;
  onClearSelection: () => void;
  isPending?: boolean;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200" data-testid="floating-action-bar">
      <div className="flex items-center gap-3 bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] rounded-2xl px-5 py-3 shadow-2xl shadow-black/20">
        <span className="text-[14px] font-semibold whitespace-nowrap" data-testid="selected-count">
          {selectedCount} selected
        </span>
        <button
          onClick={onFollowSelected}
          disabled={isPending}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#6366F1] text-white rounded-xl text-[13px] font-bold hover:bg-[#5558E6] transition-colors active:scale-95 disabled:opacity-50"
          data-testid="button-follow-selected"
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Follow Selected
        </button>
        <button
          onClick={onClearSelection}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 dark:hover:bg-black/10 transition-colors"
          aria-label="Clear selection"
          data-testid="button-clear-selection"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function DiscoverPage() {
  const { data: user } = useAuth();
  const { toast } = useToast();
  const initialQuery = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("q") || "" : "";
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestPodcastName, setRequestPodcastName] = useState("");
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [bulkFollowPending, setBulkFollowPending] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("popular");

  const toggleSelect = useCallback((slug: string) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedSlugs(new Set());
  }, []);

  const handleSelectAllVisible = useCallback((slugs: string[], deselect?: boolean) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (deselect) {
        slugs.forEach((s) => next.delete(s));
      } else {
        slugs.forEach((s) => next.add(s));
      }
      return next;
    });
  }, []);

  useEffect(() => {
    clearSelection();
  }, [selectedTopic, searchQuery, clearSelection]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q") || "";
    if (q && q !== searchQuery) {
      setSearchQuery(q);
    }
  }, []);

  const { data: directoryData } = useQuery<DirectoryPodcast[]>({
    queryKey: ["/api/podcasts/directory", { sort: sortBy }],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/directory?sort=${sortBy}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
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

  const bulkFollow = useCallback((slugs: string[], onComplete?: (succeededSlugs: string[]) => void) => {
    if (!user) {
      toast({ title: "Sign in required", description: "Log in to follow podcasts", variant: "destructive" });
      return;
    }
    if (bulkFollowPending) return;
    const unfollowed = slugs.filter((s) => !resolvedFollowedSlugs.has(s));
    if (unfollowed.length === 0) {
      toast({ title: "Already following", description: "You're already following all these podcasts" });
      return;
    }
    setBulkFollowPending(true);
    const results = unfollowed.map((slug) =>
      apiRequest("POST", "/api/feed/follow", { podcastSlug: slug })
        .then((r) => r.json())
        .then(() => ({ slug, ok: true }))
        .catch(() => ({ slug, ok: false }))
    );
    Promise.all(results).then((outcomes) => {
      const succeededSlugs = outcomes.filter((o) => o.ok).map((o) => o.slug);
      const failed = outcomes.length - succeededSlugs.length;
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-slugs"] });
      setBulkFollowPending(false);
      if (failed === 0) {
        toast({ title: "Following!", description: `Now following ${succeededSlugs.length} new podcasts` });
      } else if (succeededSlugs.length > 0) {
        toast({ title: "Partially followed", description: `Followed ${succeededSlugs.length} podcasts, ${failed} failed. Selection kept for retry.`, variant: "destructive" });
      } else {
        toast({ title: "Error", description: "Failed to follow podcasts. Selection kept for retry.", variant: "destructive" });
      }
      onComplete?.(succeededSlugs);
    });
  }, [user, bulkFollowPending, resolvedFollowedSlugs, toast]);

  const handleFollowSelected = useCallback(() => {
    bulkFollow(Array.from(selectedSlugs), (succeededSlugs) => {
      setSelectedSlugs((prev) => {
        const next = new Set(prev);
        succeededSlugs.forEach((s) => next.delete(s));
        return next;
      });
    });
  }, [selectedSlugs, bulkFollow]);

  const [itunesSearchResults, setItunesSearchResults] = useState<any[]>([]);
  const [isItunesSearching, setIsItunesSearching] = useState(false);
  const [followedExternalSlugs, setFollowedExternalSlugs] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setItunesSearchResults([]);
      setIsItunesSearching(false);
      return;
    }
    setIsItunesSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/podcasts/search-itunes?term=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setItunesSearchResults(data.results || []);
        }
      } catch {
        setItunesSearchResults([]);
      }
      setIsItunesSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleFollowExternal = async (result: any) => {
    if (!user) {
      toast({ title: "Sign in required", description: "Log in to follow podcasts", variant: "destructive" });
      return;
    }
    if (result.onPlatform && result.slug) {
      followMutation.mutate(result.slug);
    } else {
      try {
        const res = await apiRequest("POST", "/api/feed/follow", {
          itunesId: result.id,
          podcastName: result.name,
          artworkUrl: result.artworkUrl,
        });
        const data = await res.json();
        if (data.slug) {
          setFollowedExternalSlugs(prev => new Map(prev).set(result.id, data.slug));
        }
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-slugs"] });
        queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-podcasts-details"] });
        toast({ title: "Following!", description: `Now following ${result.name}` });
      } catch {
        toast({ title: "Error", description: "Failed to follow podcast", variant: "destructive" });
      }
    }
  };

  const handleUnfollowExternal = async (result: any) => {
    const slug = result.slug || followedExternalSlugs.get(result.id);
    if (!slug) return;
    try {
      await apiRequest("POST", "/api/feed/unfollow", { podcastSlug: slug });
      setFollowedExternalSlugs(prev => {
        const next = new Map(prev);
        next.delete(result.id);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-slugs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-podcasts-details"] });
      toast({ title: "Unfollowed", description: `Unfollowed ${result.name}` });
    } catch {
      toast({ title: "Error", description: "Failed to unfollow podcast", variant: "destructive" });
    }
  };

  const isItunesResultFollowed = (result: any): boolean => {
    if (followedExternalSlugs.has(result.id)) return true;
    if (result.slug && resolvedFollowedSlugs.has(result.slug)) return true;
    return false;
  };

  const filteredPodcasts = searchQuery.length >= 2
    ? (directoryData || []).filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <>
    <DashboardLayout>
      <div className="min-h-screen bg-white dark:bg-[#09090B]" data-testid="discover-page">
        <div className="max-w-5xl mx-auto px-4 md:px-8 pt-6 pb-3">
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => window.history.back()}
              className="text-[#71717A] hover:text-[#09090B] dark:hover:text-white transition-colors"
              data-testid="back-button"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-[22px] md:text-[26px] font-bold text-[#09090B] dark:text-white">Discover</h1>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-stretch">
            <div className={`relative flex-1${user ? " sm:basis-[65%] sm:flex-none" : ""}`}>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#A1A1AA]" />
              <input
                type="text"
                placeholder="Search podcasts…"
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
            {user && (
              <Link
                href={user.onboardingCompleted ? "/settings?tab=spotify" : "/onboarding"}
                className="sm:flex-1 inline-flex items-center justify-center gap-2 bg-[#1DB954] hover:bg-[#1aa34a] text-white font-semibold rounded-2xl px-5 py-3.5 text-[15px] md:text-[16px] transition-colors whitespace-nowrap"
                data-testid="button-import-spotify"
              >
                <SiSpotify className="w-5 h-5 flex-shrink-0" />
                <span className="hidden sm:inline">Import from Spotify</span>
                <span className="sm:hidden">Import</span>
              </Link>
            )}
          </div>
        </div>

        <div className="max-w-5xl mx-auto">
          {searchQuery.length >= 2 ? (
            <div className="px-4 md:px-8 py-3">
              {(() => {
                const localResults = filteredPodcasts.slice(0, 20).map((p) => ({
                  key: `local-${p.slug}`,
                  slug: p.slug,
                  name: p.name,
                  artworkUrl: p.artworkUrl,
                  subtitle: p.category || "",
                  onPlatform: true,
                  source: "local" as const,
                  raw: p,
                }));
                const dedupedItunes = itunesSearchResults
                  .filter((r: any) => !filteredPodcasts.some(fp => fp.slug === r.slug))
                  .slice(0, 10)
                  .map((r: any) => ({
                    key: `itunes-${r.id}`,
                    slug: r.onPlatform && r.slug ? r.slug : null,
                    name: r.name,
                    artworkUrl: r.artworkUrl,
                    subtitle: r.artistName || r.genre || "",
                    onPlatform: !!(r.onPlatform && r.slug),
                    source: "itunes" as const,
                    raw: r,
                  }));
                const allResults = [...localResults, ...dedupedItunes];
                if (allResults.length === 0) return null;
                return (
                  <div>
                    <h3 className="text-[13px] font-bold text-[#A1A1AA] uppercase tracking-wide mb-2">Podcasts</h3>
                    <div className="divide-y divide-[#F4F4F5] dark:divide-[#1C1C22]">
                      {allResults.map((item) => (
                        <div key={item.key} className="flex items-center gap-3 py-3" data-testid={item.onPlatform ? `search-podcast-${item.slug}` : `itunes-result-${item.raw.id}`}>
                          {item.onPlatform && item.slug ? (
                            <Link href={`/podcasts/${item.slug}`} className="w-12 h-12 rounded-xl overflow-hidden bg-[#F4F4F5] dark:bg-[#1C1C22] flex-shrink-0 ring-[0.5px] ring-black/5 block">
                              {item.artworkUrl ? (
                                <img src={item.artworkUrl} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-[#E4E4E7]">
                                  <Search className="w-4 h-4 text-[#A1A1AA]" />
                                </div>
                              )}
                            </Link>
                          ) : (
                            <button
                              type="button"
                              className="w-12 h-12 rounded-xl overflow-hidden bg-[#F4F4F5] dark:bg-[#1C1C22] flex-shrink-0 ring-[0.5px] ring-black/5 cursor-pointer"
                              onClick={() => { setRequestPodcastName(item.name); setRequestDialogOpen(true); }}
                              aria-label={`Request ${item.name}`}
                              data-testid={`itunes-artwork-${item.raw.id}`}
                            >
                              {item.artworkUrl ? (
                                <img src={item.artworkUrl} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-[#E4E4E7]">
                                  <Search className="w-4 h-4 text-[#A1A1AA]" />
                                </div>
                              )}
                            </button>
                          )}
                          <div className="flex-1 min-w-0">
                            {item.onPlatform && item.slug ? (
                              <Link href={`/podcasts/${item.slug}`}>
                                <p className="text-[15px] md:text-[16px] font-semibold text-[#09090B] dark:text-white truncate hover:text-[#6366F1] transition-colors" data-testid={`search-podcast-name-${item.slug}`}>{item.name}</p>
                              </Link>
                            ) : (
                              <div className="group relative">
                                <button
                                  type="button"
                                  className="text-[15px] md:text-[16px] font-semibold text-[#09090B] dark:text-white truncate cursor-pointer hover:text-[#6366F1] transition-colors text-left w-full"
                                  onClick={() => { setRequestPodcastName(item.name); setRequestDialogOpen(true); }}
                                  data-testid={`itunes-name-${item.raw.id}`}
                                >{item.name}</button>
                                <div className="absolute bottom-full left-0 mb-1.5 px-3 py-1.5 bg-[#18181B] dark:bg-[#27272A] text-white text-[12px] rounded-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg" data-testid={`tooltip-itunes-${item.raw.id}`}>
                                  <Mic className="w-3 h-3 inline mr-1 -mt-0.5" />
                                  We don't have this podcast yet — click to request it
                                </div>
                              </div>
                            )}
                            {item.subtitle && <p className="text-[12px] text-[#A1A1AA] mt-0.5 truncate">{item.subtitle}</p>}
                          </div>
                          {item.onPlatform && item.slug ? (
                            <FollowButton
                              slug={item.slug}
                              isFollowing={resolvedFollowedSlugs.has(item.slug)}
                              onFollow={handleFollow}
                              onUnfollow={handleUnfollow}
                            />
                          ) : (
                            <FollowButton
                              slug={`itunes-${item.raw.id}`}
                              isFollowing={isItunesResultFollowed(item.raw)}
                              onFollow={() => handleFollowExternal(item.raw)}
                              onUnfollow={() => handleUnfollowExternal(item.raw)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {isItunesSearching && itunesSearchResults.length === 0 && filteredPodcasts.length === 0 && (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-[#6366F1]" />
                </div>
              )}

              {!isItunesSearching && filteredPodcasts.length === 0 && itunesSearchResults.length === 0 && (
                <div className="text-center py-12">
                  <Mic className="w-8 h-8 text-[#A1A1AA]/40 mx-auto mb-2" />
                  <p className="text-[15px] text-[#71717A] dark:text-[#A1A1AA] mb-3">No results for "{searchQuery}"</p>
                  <button
                    onClick={() => { setRequestPodcastName(searchQuery); setRequestDialogOpen(true); }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-[#6366F1] hover:bg-[#6366F1]/[0.06] rounded-xl transition-colors"
                    data-testid="button-request-podcast-no-results"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    Request this podcast
                  </button>
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
                      isLoggedIn={!!user}
                      selectedSlugs={selectedSlugs}
                      onToggleSelect={toggleSelect}
                      onSelectAllVisible={handleSelectAllVisible}
                      sortBy={user ? sortBy : undefined}
                      onSortChange={user ? setSortBy : undefined}
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
                  isLoggedIn={!!user}
                  selectedSlugs={selectedSlugs}
                  onToggleSelect={toggleSelect}
                  sortBy={user ? sortBy : undefined}
                  onSortChange={user ? setSortBy : undefined}
                />
              )}
            </>
          )}
          <div className="h-[80px] md:h-4" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
        </div>
      </div>

      {user && selectedSlugs.size > 0 && (
        <FloatingActionBar
          selectedCount={selectedSlugs.size}
          onFollowSelected={handleFollowSelected}
          onClearSelection={clearSelection}
          isPending={bulkFollowPending}
        />
      )}
    </DashboardLayout>
    <RequestPodcastDialog
      key={requestPodcastName}
      open={requestDialogOpen}
      onClose={() => setRequestDialogOpen(false)}
      searchQuery={requestPodcastName}
    />
    </>
  );
}