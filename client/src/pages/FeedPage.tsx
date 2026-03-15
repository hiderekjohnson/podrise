import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Clock, MessageCircle, Bookmark, Share, MoreHorizontal, ChevronDown, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BottomNav } from "@/components/BottomNav";
import { FeedHeader } from "@/components/FeedHeader";

interface FeedItem {
  id: number;
  podcastSlug: string;
  podcastName: string;
  episodeTitle: string;
  episodeSlug: string;
  publishDate: string;
  artworkUrl: string;
  tldl: string;
  keyInsights: string[] | null;
  quote: string | null;
  quoteAttribution: string | null;
  duration: string | null;
  isFollowing: boolean;
}

function relativeTime(dateStr: string): string {
  if (!dateStr) return "";
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function hiResArtwork(url: string): string {
  if (!url) return "";
  if (url.startsWith("/artwork/")) return url;
  return url.replace(/\/\d+x\d+bb\./, "/100x100bb.");
}

function RecapCard({ item, onFollowToggle }: { item: FeedItem; onFollowToggle: (slug: string, follow: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);
  const tldlPreview = item.tldl && item.tldl.length > 200 ? item.tldl.slice(0, 200) + "..." : item.tldl;
  const hasMore = item.tldl && item.tldl.length > 200;

  return (
    <article
      className="border-b border-[#F0F0F2]"
      data-testid={`feed-card-${item.id}`}
    >
      <div className="px-4 pt-3.5 pb-1">
        <div className="flex items-start gap-3">
          <Link href={`/podcasts/${item.podcastSlug}`}>
            <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ring-[0.5px] ring-black/5">
              <img
                src={hiResArtwork(item.artworkUrl)}
                alt={item.podcastName}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          </Link>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                <Link href={`/podcasts/${item.podcastSlug}`}>
                  <span className="font-bold text-[15px] text-[#09090B] hover:underline" data-testid={`feed-podcast-name-${item.id}`}>
                    {item.podcastName}
                  </span>
                </Link>
                <span className="text-[#A1A1AA] text-[13px] flex-shrink-0">·</span>
                <span className="text-[#71717A] text-[13px] flex-shrink-0" data-testid={`feed-time-${item.id}`}>
                  {relativeTime(item.publishDate)}
                </span>
              </div>

              <button
                onClick={() => onFollowToggle(item.podcastSlug, !item.isFollowing)}
                className={`flex-shrink-0 text-[13px] font-bold rounded-full transition-all active:scale-95 ${
                  item.isFollowing
                    ? "px-3.5 py-[5px] border border-[#D4D4D8] text-[#09090B] hover:border-red-300 hover:text-red-600"
                    : "px-3.5 py-[5px] bg-[#09090B] text-white hover:bg-[#27272A]"
                }`}
                data-testid={`feed-follow-btn-${item.id}`}
              >
                {item.isFollowing ? "Following" : "Follow"}
              </button>
            </div>

            <Link href={`/podcasts/${item.podcastSlug}/${item.episodeSlug}`}>
              <h3 className="text-[15px] font-semibold text-[#09090B] mt-0.5 leading-[1.35] hover:underline line-clamp-2" data-testid={`feed-episode-title-${item.id}`}>
                {item.episodeTitle}
              </h3>
            </Link>
          </div>
        </div>

        <div className="mt-2.5 ml-[52px]">
          <div className="text-[15px] text-[#0F0F0F] leading-[1.5]">
            {expanded ? (
              <>
                <p>{item.tldl}</p>
                {item.keyInsights && item.keyInsights.length > 0 && (
                  <div className="mt-3 rounded-xl bg-[#F8F8FC] border border-[#EDEDF3] p-3.5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Zap className="w-3.5 h-3.5 text-[#6366F1]" />
                      <span className="text-[12px] font-bold text-[#6366F1] uppercase tracking-wide">Key Insights</span>
                    </div>
                    <ul className="space-y-2">
                      {item.keyInsights.map((insight, i) => (
                        <li key={i} className="text-[14px] text-[#3F3F46] flex gap-2 leading-[1.45]">
                          <span className="text-[#6366F1] mt-[3px] flex-shrink-0 text-[10px]">●</span>
                          <span>{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {item.quote && (
                  <div className="mt-3 pl-3.5 border-l-[3px] border-[#6366F1]/40 py-1">
                    <p className="text-[14px] text-[#52525B] italic leading-[1.5]">"{item.quote}"</p>
                    {item.quoteAttribution && (
                      <p className="text-[12px] text-[#A1A1AA] mt-1 not-italic font-medium">— {item.quoteAttribution}</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-[#3F3F46]">{tldlPreview}</p>
            )}
          </div>

          {hasMore && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[#6366F1] text-[14px] font-semibold mt-1 hover:underline"
              data-testid={`feed-expand-${item.id}`}
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>

        <div className="flex items-center justify-between mt-2.5 ml-[52px] pb-2.5">
          <Link href={`/podcasts/${item.podcastSlug}/${item.episodeSlug}`}>
            <span className="flex items-center gap-1.5 text-[#71717A] hover:text-[#6366F1] transition-colors group" data-testid={`feed-viewfull-${item.id}`}>
              <MessageCircle className="w-[18px] h-[18px] group-hover:text-[#6366F1]" />
              <span className="text-[13px] font-medium">Full recap</span>
            </span>
          </Link>

          {item.duration && (
            <span className="flex items-center gap-1 text-[#A1A1AA]">
              <Clock className="w-[14px] h-[14px]" />
              <span className="text-[12px]">{item.duration}</span>
            </span>
          )}

          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: item.episodeTitle, url: `/podcasts/${item.podcastSlug}/${item.episodeSlug}` }).catch(() => {});
              } else {
                navigator.clipboard.writeText(`${window.location.origin}/podcasts/${item.podcastSlug}/${item.episodeSlug}`);
              }
            }}
            aria-label="Share episode"
            className="flex items-center gap-1 text-[#A1A1AA] hover:text-[#6366F1] transition-colors"
            data-testid={`feed-share-${item.id}`}
          >
            <Share className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>
    </article>
  );
}

export default function FeedPage() {
  const { data: user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"foryou" | "following">("foryou");
  const observerRef = useRef<HTMLDivElement>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["/api/feed", activeTab],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ tab: activeTab, limit: "20" });
      if (pageParam) params.set("cursor", pageParam.toString());
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
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );
    if (observerRef.current) observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const followMutation = useMutation({
    mutationFn: async ({ podcastSlug, follow }: { podcastSlug: string; follow: boolean }) => {
      const endpoint = follow ? "/api/feed/follow" : "/api/feed/unfollow";
      const res = await apiRequest("POST", endpoint, { podcastSlug });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: variables.follow ? "Following" : "Unfollowed",
        description: variables.follow
          ? "Added to your feed and daily email recap"
          : "Removed from your feed and daily email",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update subscription", variant: "destructive" });
    },
  });

  const handleFollowToggle = useCallback((slug: string, follow: boolean) => {
    if (!user) {
      toast({ title: "Sign in required", description: "Log in to follow podcasts", variant: "destructive" });
      return;
    }
    followMutation.mutate({ podcastSlug: slug, follow });
  }, [user, followMutation, toast]);

  const allItems: FeedItem[] = data?.pages?.flatMap((p: any) => p.items) || [];

  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-white" data-testid="feed-page">
      <FeedHeader />

      <div className="sticky top-[52px] z-30 bg-white border-b border-[#F0F0F2]">
        <div className="max-w-[600px] mx-auto">
          <div className="flex">
            {(["foryou", "following"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-[14px] font-bold text-center relative transition-colors ${
                  activeTab === tab ? "text-[#09090B]" : "text-[#A1A1AA] hover:text-[#71717A] hover:bg-[#FAFAFA]"
                }`}
                data-testid={`feed-tab-${tab}`}
              >
                {tab === "foryou" ? "For You" : "Following"}
                {activeTab === tab && (
                  <motion.div
                    layoutId="feedTabIndicator"
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[56px] h-[3px] bg-[#6366F1] rounded-full"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[600px] mx-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-[#6366F1]" />
            <span className="text-[14px] text-[#A1A1AA]">Loading your feed...</span>
          </div>
        ) : allItems.length === 0 ? (
          <div className="text-center py-20 px-8">
            <div className="w-16 h-16 rounded-full bg-[#F4F4F5] flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="w-7 h-7 text-[#A1A1AA]" />
            </div>
            <p className="text-[17px] font-bold text-[#09090B] mb-1">
              {activeTab === "following" ? "No followed podcasts yet" : "Nothing here yet"}
            </p>
            <p className="text-[14px] text-[#71717A] leading-relaxed">
              {activeTab === "following"
                ? "Follow podcasts from the For You tab or Discover to see their recaps here."
                : "Check back soon for fresh podcast recaps."}
            </p>
          </div>
        ) : (
          <>
            {allItems.map((item) => (
              <RecapCard
                key={item.id}
                item={item}
                onFollowToggle={handleFollowToggle}
              />
            ))}
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
        <div className="h-[60px]" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
      </div>
      <BottomNav currentPath={location} />
    </div>
  );
}
