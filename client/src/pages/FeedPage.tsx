import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageCircle, ChevronDown, Gift, ChevronRight } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { FeatureTour } from "@/components/FeatureTour";
import { RecapCard } from "@/components/RecapCard";
import type { MentionEntry, ProductEntry } from "@/components/CardBottomAccordion";

interface FeedItem {
  id: number;
  podcastSlug: string;
  podcastName: string;
  episodeTitle: string;
  episodeSlug: string;
  publishDate: string;
  artworkUrl: string;
  tldl: string;
  whatHappened: string | null;
  keyInsights: string[] | null;
  quote: string | null;
  quoteAttribution: string | null;
  duration: string | null;
  guests: string[];
  keyTopics: string[];
  isFollowing: boolean;
  tabloidSubHeadline: string | null;
  hosts: string | null;
  totalEpisodes: number | null;
  yearStarted: number | null;
  appleUrl: string | null;
  spotifyUrl: string | null;
  youtubeUrl: string | null;
  spotifyEpisodeUrl: string | null;
  appleEpisodeUrl: string | null;
  mentions: {
    people: MentionEntry[];
    companies: MentionEntry[];
    products: ProductEntry[];
  };
}

function relativeTime(dateStr: string): string {
  if (!dateStr) return "";
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function hiResArtwork(url: string): string {
  if (!url) return "";
  if (url.startsWith("/artwork/")) return url;
  return url.replace(/\/\d+x\d+bb\./, "/100x100bb.");
}

function getHeaderTint(artworkUrl: string): string {
  const hash = artworkUrl ? artworkUrl.split("").reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
  const tints = ["#F0F0FF", "#F0FBF5", "#FEF8ED", "#FEF0F5", "#F0F8FF"];
  return tints[hash % tints.length];
}

function PodSquadBanner() {
  const [, navigate] = useLocation();

  return (
    <div className="md:hidden px-4 py-3" data-testid="pod-squad-banner">
      <button
        onClick={() => navigate("/pod-squad")}
        className="w-full relative overflow-hidden rounded-2xl p-4 text-left active:scale-[0.98] transition-transform"
        style={{ background: "linear-gradient(135deg, #6366F1 0%, #7C3AED 50%, #A855F7 100%)" }}
        data-testid="pod-squad-banner-cta"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Gift className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold text-[15px] leading-tight">Invite Friends, Earn Rewards</div>
            <div className="text-white/80 text-[13px] mt-0.5">Get stickers, t-shirts, AirPods & more</div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/70 flex-shrink-0" />
        </div>
      </button>
    </div>
  );
}

function FeedRecapCard({ item, onFollowToggle, bookmarkedKeys, onBookmarkToggle, toast, user }: {
  item: FeedItem;
  onFollowToggle: (slug: string, follow: boolean) => void;
  bookmarkedKeys: Set<string>;
  onBookmarkToggle: (episodeSlug: string, podcastSlug: string) => void;
  toast: ReturnType<typeof useToast>["toast"];
  user: any;
}) {
  const isBookmarked = bookmarkedKeys.has(`${item.podcastSlug}::${item.episodeSlug}`);

  return (
    <RecapCard
      id={item.id}
      podcastSlug={item.podcastSlug}
      episodeSlug={item.episodeSlug}
      podcastName={item.podcastName}
      episodeTitle={item.episodeTitle}
      publishDate={item.publishDate}
      artworkUrl={item.artworkUrl}
      tldl={item.tldl}
      tabloidSubHeadline={item.tabloidSubHeadline}
      keyInsights={item.keyInsights}
      quote={item.quote}
      quoteAttribution={item.quoteAttribution}
      hosts={item.hosts}
      whatHappened={item.whatHappened}
      spotifyEpisodeUrl={item.spotifyEpisodeUrl}
      spotifyUrl={item.spotifyUrl}
      youtubeUrl={item.youtubeUrl}
      mentions={item.mentions}
      isFollowing={item.isFollowing}
      isBookmarked={isBookmarked}
      onFollowToggle={onFollowToggle}
      onBookmarkToggle={onBookmarkToggle}
      toast={toast}
      testIdPrefix="feed-card"
      isLoggedIn={!!user}
    />
  );
}

interface FeedAdData {
  id: number;
  type: "podcast" | "regular" | "episode_recap";
  title: string;
  description: string;
  imageUrl: string;
  destinationUrl: string;
  podcastSlug: string | null;
  episodeSlug: string | null;
  episodeTitle: string | null;
  episodeTldl: string | null;
  episodeKeyInsights: string[] | null;
  episodeQuote: string | null;
  episodeQuoteAttribution: string | null;
  podcastName: string | null;
  weight: number;
  isActive: boolean;
  spotifyEpisodeUrl?: string | null;
  spotifyUrl?: string | null;
  youtubeUrl?: string | null;
  whatHappened?: string | null;
  hosts?: string | null;
  totalEpisodes?: number | null;
  yearStarted?: number | null;
  tabloidSubHeadline?: string | null;
  mentions?: {
    people: MentionEntry[];
    companies: MentionEntry[];
    products: ProductEntry[];
  };
}

function trackAdEvent(adId: number, eventType: "view" | "click" | "follow") {
  fetch("/api/ad-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adId, eventType }),
  }).catch(() => {});
}

function useAdViewTracking(adId: number) {
  const ref = useRef<HTMLDivElement>(null);
  const tracked = useRef(false);
  useEffect(() => {
    if (!ref.current || tracked.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !tracked.current) {
          tracked.current = true;
          trackAdEvent(adId, "view");
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [adId]);
  return ref;
}

function PodcastAdCard({ ad, onFollow }: { ad: FeedAdData; onFollow: (slug: string, adId?: number) => void }) {
  const viewRef = useAdViewTracking(ad.id);
  return (
    <div
      ref={viewRef}
      className="rounded-2xl overflow-hidden mb-4 border border-[#F5E6B8]"
      style={{ background: "#FFFBEB" }}
      data-testid={`feed-podcast-ad-${ad.id}`}
    >
      <div className="p-5 flex items-start gap-4">
        <Link
          href={ad.podcastSlug ? `/podcasts/${ad.podcastSlug}` : (ad.destinationUrl || "#")}
          onClick={() => trackAdEvent(ad.id, "click")}
          className="flex items-start gap-4 flex-1 min-w-0 no-underline"
          data-testid={`feed-podcast-ad-link-${ad.id}`}
        >
          <img
            src={ad.imageUrl}
            alt={ad.title}
            className="w-[72px] h-[72px] rounded-xl object-cover shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.background = "#ddd"; }}
          />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[17px] text-[#09090B] mb-1" data-testid={`text-podcast-ad-title-${ad.id}`}>
              {ad.title}
            </div>
            <div className="text-[14px] text-[#52525B] leading-[1.6]" data-testid={`text-podcast-ad-desc-${ad.id}`}>
              {ad.description}
            </div>
          </div>
        </Link>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="text-[12px] text-[#A1A1AA] font-medium" data-testid={`label-ad-${ad.id}`}>Ad</span>
          {ad.podcastSlug && (
            <button
              onClick={() => onFollow(ad.podcastSlug!, ad.id)}
              className="inline-flex items-center px-5 py-[7px] rounded-full text-[14px] font-bold transition-all bg-[#6366F1] text-white hover:bg-[#4F46E5]"
              data-testid={`feed-ad-follow-btn-${ad.id}`}
            >
              Follow
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RegularAdCard({ ad }: { ad: FeedAdData }) {
  const viewRef = useAdViewTracking(ad.id);
  return (
    <div
      ref={viewRef}
      className="rounded-2xl overflow-hidden mb-4 border border-[#F5E6B8]"
      style={{ background: "#FFFBEB" }}
      data-testid={`feed-regular-ad-${ad.id}`}
    >
      <div className="p-5 flex items-start gap-4">
        <img
          src={ad.imageUrl}
          alt={ad.title}
          className="w-[72px] h-[72px] rounded-xl object-cover shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).style.background = "#ddd"; }}
        />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[17px] text-[#09090B] mb-1" data-testid={`text-regular-ad-title-${ad.id}`}>
            {ad.title}
          </div>
          <div className="text-[14px] text-[#52525B] leading-[1.6] [&_a]:text-[#6366F1] [&_a]:underline [&_a]:hover:text-[#4F46E5]" data-testid={`text-regular-ad-desc-${ad.id}`}>
            <span dangerouslySetInnerHTML={{ __html: ad.description }} />
            {ad.destinationUrl && (() => {
              try {
                const hostname = new URL(ad.destinationUrl).hostname.replace("www.", "");
                return (
                  <>
                    {" "}
                    <a
                      href={ad.destinationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#6366F1] underline hover:text-[#4F46E5]"
                      data-testid={`link-regular-ad-${ad.id}`}
                      onClick={() => trackAdEvent(ad.id, "click")}
                    >
                      {hostname}
                    </a>
                  </>
                );
              } catch { return null; }
            })()}
          </div>
        </div>
        <div className="shrink-0">
          <span className="text-[12px] text-[#A1A1AA] font-medium" data-testid={`label-ad-${ad.id}`}>Ad</span>
        </div>
      </div>
    </div>
  );
}

function EpisodeRecapAdCard({ ad, onFollow, bookmarkedKeys, onBookmarkToggle, followedPodcastSlugs, toast }: {
  ad: FeedAdData;
  onFollow: (slug: string, follow: boolean, adId?: number) => void;
  bookmarkedKeys: Set<string>;
  onBookmarkToggle: (episodeSlug: string, podcastSlug: string) => void;
  followedPodcastSlugs: Set<string>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const viewRef = useAdViewTracking(ad.id);
  const isBookmarked = ad.podcastSlug && ad.episodeSlug
    ? bookmarkedKeys.has(`${ad.podcastSlug}::${ad.episodeSlug}`)
    : false;
  const isFollowing = ad.podcastSlug ? followedPodcastSlugs.has(ad.podcastSlug) : false;

  return (
    <div ref={viewRef} data-testid={`feed-episode-recap-ad-${ad.id}`}>
      <RecapCard
        id={`ad-${ad.id}`}
        podcastSlug={ad.podcastSlug || ""}
        episodeSlug={ad.episodeSlug || ""}
        podcastName={ad.podcastName || ad.title}
        episodeTitle={ad.episodeTitle || ad.title}
        publishDate={null}
        artworkUrl={ad.imageUrl}
        tldl={ad.episodeTldl}
        tabloidSubHeadline={ad.tabloidSubHeadline}
        keyInsights={ad.episodeKeyInsights}
        quote={ad.episodeQuote}
        quoteAttribution={ad.episodeQuoteAttribution}
        hosts={ad.hosts}
        whatHappened={ad.whatHappened}
        spotifyEpisodeUrl={ad.spotifyEpisodeUrl}
        spotifyUrl={ad.spotifyUrl}
        youtubeUrl={ad.youtubeUrl}
        mentions={ad.mentions}
        isFollowing={isFollowing}
        isBookmarked={isBookmarked}
        onFollowToggle={(slug, follow) => onFollow(slug, follow, ad.id)}
        onBookmarkToggle={onBookmarkToggle}
        toast={toast}
        testIdPrefix="feed-recap-ad"
        adBadge
      />
    </div>
  );
}

export default function FeedPage() {
  const { data: user } = useAuth();
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), [location]);
  const isWelcome = urlParams.get("welcome") === "true";
  const podcastFilter = urlParams.get("podcast") || "";
  const tabParam = urlParams.get("tab");
  const initialTab = tabParam === "following" || isWelcome ? "following" : "foryou";
  const [activeTab, setActiveTab] = useState<"foryou" | "following">(initialTab);
  const observerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tabParam === "following") setActiveTab("following");
    else if (tabParam === "foryou") setActiveTab("foryou");
  }, [tabParam]);

  type BookmarkRecord = { id: number; episodeSlug: string; podcastSlug: string };

  const { data: bookmarksData } = useQuery<BookmarkRecord[]>({
    queryKey: ["/api/bookmarks"],
    enabled: !!user,
  });

  const bookmarkedKeys = new Set((bookmarksData || []).map((b) => `${b.podcastSlug}::${b.episodeSlug}`));

  const followedPodcastSlugs = useMemo(() => {
    if (!user?.podcasts) return new Set<string>();
    return new Set(user.podcasts.map((p: string) => {
      try { const parsed = JSON.parse(p); return parsed?.id || p; } catch { return p; }
    }));
  }, [user?.podcasts]);

  const addBookmark = useMutation({
    mutationFn: async ({ episodeSlug, podcastSlug }: { episodeSlug: string; podcastSlug: string }) => {
      await apiRequest("POST", "/api/bookmarks", { episodeSlug, podcastSlug });
    },
    onMutate: async ({ episodeSlug, podcastSlug }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/bookmarks"] });
      const previous = queryClient.getQueryData<BookmarkRecord[]>(["/api/bookmarks"]);
      queryClient.setQueryData<BookmarkRecord[]>(["/api/bookmarks"], (old) => {
        const existing = old || [];
        if (existing.some((b) => b.podcastSlug === podcastSlug && b.episodeSlug === episodeSlug)) return existing;
        return [...existing, { id: Date.now(), episodeSlug, podcastSlug }];
      });
      return { previous };
    },
    onSuccess: () => { toast({ title: "Saved", description: "Episode saved" }); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] }); },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData<BookmarkRecord[]>(["/api/bookmarks"], context.previous);
      toast({ title: "Error", description: "Failed to save episode", variant: "destructive" });
    },
  });

  const removeBookmark = useMutation({
    mutationFn: async ({ podcastSlug, episodeSlug }: { podcastSlug: string; episodeSlug: string }) => {
      await apiRequest("DELETE", `/api/bookmarks/${encodeURIComponent(podcastSlug)}/${encodeURIComponent(episodeSlug)}`);
    },
    onMutate: async ({ podcastSlug, episodeSlug }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/bookmarks"] });
      const previous = queryClient.getQueryData<BookmarkRecord[]>(["/api/bookmarks"]);
      queryClient.setQueryData<BookmarkRecord[]>(["/api/bookmarks"], (old) =>
        (old || []).filter((b) => !(b.podcastSlug === podcastSlug && b.episodeSlug === episodeSlug))
      );
      return { previous };
    },
    onSuccess: () => { toast({ title: "Removed", description: "Episode removed from saved" }); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] }); },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData<BookmarkRecord[]>(["/api/bookmarks"], context.previous);
      toast({ title: "Error", description: "Failed to remove episode", variant: "destructive" });
    },
  });

  const handleBookmarkToggle = useCallback((episodeSlug: string, podcastSlug: string) => {
    if (!user) { toast({ title: "Sign in required", description: "Log in to save episodes", variant: "destructive" }); return; }
    const key = `${podcastSlug}::${episodeSlug}`;
    if (bookmarkedKeys.has(key)) removeBookmark.mutate({ podcastSlug, episodeSlug });
    else addBookmark.mutate({ episodeSlug, podcastSlug });
  }, [bookmarkedKeys, addBookmark, removeBookmark, user, toast]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["/api/feed", activeTab, podcastFilter],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ tab: activeTab, limit: "20" });
      if (pageParam) params.set("cursor", pageParam.toString());
      if (podcastFilter) params.set("podcast", podcastFilter);
      const res = await fetch(`/api/feed?${params}`);
      if (!res.ok) throw new Error("Failed to load feed");
      return res.json();
    },
    getNextPageParam: (lastPage: any) => lastPage.nextCursor,
    initialPageParam: null as number | null,
  });

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { threshold: 0.1 }
    );
    if (observerRef.current) observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const followMutation = useMutation({
    mutationFn: async ({ podcastSlug, follow }: { podcastSlug: string; follow: boolean; adId?: number }) => {
      const endpoint = follow ? "/api/feed/follow" : "/api/feed/unfollow";
      const res = await apiRequest("POST", endpoint, { podcastSlug });
      return res.json();
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["/api/feed", activeTab, podcastFilter] });
      const previousFeed = queryClient.getQueryData(["/api/feed", activeTab, podcastFilter]);
      queryClient.setQueryData(["/api/feed", activeTab, podcastFilter], (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            items: page.items.map((item: any) =>
              item.podcastSlug === variables.podcastSlug
                ? { ...item, isFollowing: variables.follow }
                : item
            ),
          })),
        };
      });
      return { previousFeed };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sidebar-suggestions"] });
      if (variables.adId && variables.follow) {
        trackAdEvent(variables.adId, "follow");
      }
      toast({
        title: variables.follow ? "Following" : "Unfollowed",
        description: variables.follow ? "Added to your feed and daily email recap" : "Removed from your feed and daily email",
      });
    },
    onError: (_err, _vars, context) => {
      if (context?.previousFeed) {
        queryClient.setQueryData(["/api/feed", activeTab, podcastFilter], context.previousFeed);
      }
      toast({ title: "Error", description: "Failed to update subscription", variant: "destructive" });
    },
  });

  const handleFollowToggle = useCallback((slug: string, follow: boolean, adId?: number) => {
    if (!user) { toast({ title: "Sign in required", description: "Log in to follow podcasts", variant: "destructive" }); return; }
    followMutation.mutate({ podcastSlug: slug, follow, adId });
  }, [user, followMutation, toast]);

  const allItems: FeedItem[] = data?.pages?.flatMap((p: any) => p.items) || [];

  const { data: feedAdsData } = useQuery<{ ads: FeedAdData[]; frequency: number }>({
    queryKey: ["/api/feed-ads/batch"],
  });

  const feedAdsPool = feedAdsData?.ads || [];
  const adFrequency = feedAdsData?.frequency || 5;

  return (
    <DashboardLayout>
      <div className="min-h-screen flex flex-col" data-testid="feed-page">
        <div className="sticky top-0 z-30 flex-shrink-0 border-b border-[#F0F0F2] dark:border-[#1C1C22] flex items-stretch h-[54px] pr-4" style={{ background: "var(--feed-header-bg, rgba(255,255,255,0.94))", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}>
          <style>{`.dark [data-testid="feed-page"] > div:first-child { --feed-header-bg: rgba(17,17,20,0.92); }`}</style>
          <div className="flex flex-1">
            {(["foryou", "following"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`feed-tab-btn flex-1 flex items-center justify-center text-[16px] font-medium border-b-2 select-none transition-colors relative ${
                  activeTab === tab
                    ? "text-[#09090B] dark:text-white border-[#6366F1] font-semibold"
                    : "text-[#A1A1AA] border-transparent hover:text-[#52525B] dark:hover:text-[#D4D4D8] hover:bg-[#FAFAFA] dark:hover:bg-white/[0.04]"
                }`}
                data-testid={`feed-tab-${tab}`}
                data-tour={tab === "following" ? "following-tab" : tab === "foryou" ? "foryou-tab" : undefined}
              >
                {tab === "foryou" ? "For You" : "Following"}
                <div className="feed-tab-tooltip">
                  {tab === "foryou"
                    ? "Personalised episodes based on your interests, industries, and roles — including podcasts you don't follow yet"
                    : "Every new episode from the podcasts you follow, in chronological order"}
                </div>
              </button>
            ))}
          </div>
        </div>

        {podcastFilter && (
          <div className="bg-[#EEF2FF] px-4 py-2.5 flex items-center justify-between gap-2" data-testid="feed-podcast-filter-bar">
            <p className="text-[14px] font-medium text-[#6366F1]">
              Filtered by podcast: <span className="font-bold">{podcastFilter.replace(/-/g, ' ')}</span>
            </p>
            <button
              onClick={() => navigate("/dashboard")}
              className="text-[13px] font-semibold text-[#6366F1] hover:text-[#4F46E5] px-2 py-1 rounded-md hover:bg-[#6366F1]/10 transition-colors"
              data-testid="feed-clear-filter"
            >
              Clear filter
            </button>
          </div>
        )}

        <PodSquadBanner />

        <div className="flex-1 bg-[#FAFAFA] dark:bg-[#0A0A0C] px-4 md:px-5 py-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-[#6366F1]" />
              <span className="text-[14px] text-[#A1A1AA]">Loading your feed...</span>
            </div>
          ) : allItems.length === 0 ? (
            <div className="text-center py-20 px-8">
              <div className="w-16 h-16 rounded-full bg-[#F4F4F5] dark:bg-[#1C1C22] flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-7 h-7 text-[#A1A1AA]" />
              </div>
              <p className="text-[17px] font-bold text-[#09090B] dark:text-white mb-1">
                {activeTab === "following" ? "No followed podcasts yet" : "Nothing here yet"}
              </p>
              <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
                {activeTab === "following"
                  ? "Follow podcasts from the For You tab or Discover to see their recaps here."
                  : "Check back soon for fresh podcast recaps."}
              </p>
            </div>
          ) : (
            <>
              {allItems.map((item, index) => {
                const elements = [];
                if (feedAdsPool.length > 0 && index > 0 && index % adFrequency === 0) {
                  const adIndex = Math.floor(index / adFrequency) - 1;
                  const ad = feedAdsPool[adIndex % feedAdsPool.length];
                  if (ad) {
                    if (ad.type === "podcast") {
                      elements.push(
                        <PodcastAdCard
                          key={`ad-${ad.id}-${index}`}
                          ad={ad}
                          onFollow={(slug, adId) => handleFollowToggle(slug, true, adId)}
                        />
                      );
                    } else if (ad.type === "episode_recap") {
                      elements.push(
                        <EpisodeRecapAdCard
                          key={`ad-${ad.id}-${index}`}
                          ad={ad}
                          onFollow={handleFollowToggle}
                          bookmarkedKeys={bookmarkedKeys}
                          onBookmarkToggle={handleBookmarkToggle}
                          followedPodcastSlugs={followedPodcastSlugs}
                          toast={toast}
                        />
                      );
                    } else {
                      elements.push(
                        <RegularAdCard key={`ad-${ad.id}-${index}`} ad={ad} />
                      );
                    }
                  }
                }
                elements.push(
                  <FeedRecapCard
                    key={item.id}
                    item={item}
                    onFollowToggle={handleFollowToggle}
                    bookmarkedKeys={bookmarkedKeys}
                    onBookmarkToggle={handleBookmarkToggle}
                    toast={toast}
                    user={user}
                  />
                );
                return elements;
              })}
              <div ref={observerRef} className="py-8 flex flex-col items-center gap-2">
                {isFetchingNextPage ? (
                  <Loader2 className="w-5 h-5 animate-spin text-[#6366F1]" />
                ) : hasNextPage ? (
                  <span className="text-[13px] text-[#A1A1AA]">Scroll for more</span>
                ) : allItems.length > 5 ? (
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-8 h-[2px] bg-[#E4E4E7] rounded-full" />
                    <span className="text-[13px] text-[#A1A1AA] font-medium">You're all caught up</span>
                  </div>
                ) : null}
              </div>
            </>
          )}
          <div className="h-[80px] md:h-4" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
        </div>
      </div>
      <FeatureTour enabled={isWelcome} />
    </DashboardLayout>
  );
}
