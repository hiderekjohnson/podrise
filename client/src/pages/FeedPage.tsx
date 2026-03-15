import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus, UserMinus, Clock, ChevronDown } from "lucide-react";
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
  const tldlPreview = item.tldl && item.tldl.length > 280 ? item.tldl.slice(0, 280) + "..." : item.tldl;

  return (
    <article
      className="border-b border-[#F0F0F2] px-4 py-4 hover:bg-[#FAFAFE] transition-colors"
      data-testid={`feed-card-${item.id}`}
    >
      <div className="flex gap-3">
        <Link href={`/podcasts/${item.podcastSlug}`}>
          <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 bg-gray-100">
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
            <div className="flex items-center gap-1.5 min-w-0">
              <Link href={`/podcasts/${item.podcastSlug}`}>
                <span className="font-semibold text-[15px] text-[#09090B] hover:underline truncate" data-testid={`feed-podcast-name-${item.id}`}>
                  {item.podcastName}
                </span>
              </Link>
              <span className="text-[#A1A1AA] text-sm flex-shrink-0">·</span>
              <span className="text-[#A1A1AA] text-sm flex-shrink-0" data-testid={`feed-time-${item.id}`}>
                {relativeTime(item.publishDate)}
              </span>
            </div>

            <button
              onClick={() => onFollowToggle(item.podcastSlug, !item.isFollowing)}
              className={`flex-shrink-0 text-sm font-semibold rounded-full px-4 py-1.5 transition-all ${
                item.isFollowing
                  ? "bg-transparent border border-[#E4E4E7] text-[#09090B] hover:border-red-200 hover:text-red-600 hover:bg-red-50"
                  : "bg-[#09090B] text-white hover:bg-[#1a1a2e]"
              }`}
              data-testid={`feed-follow-btn-${item.id}`}
            >
              {item.isFollowing ? "Following" : "Follow"}
            </button>
          </div>

          <Link href={`/podcasts/${item.podcastSlug}/${item.episodeSlug}`}>
            <h3 className="text-[15px] font-medium text-[#09090B] mt-1 leading-snug hover:underline" data-testid={`feed-episode-title-${item.id}`}>
              {item.episodeTitle}
            </h3>
          </Link>

          <div className="mt-2 text-[15px] text-[#52525B] leading-relaxed">
            {expanded ? (
              <div>
                <p>{item.tldl}</p>
                {item.keyInsights && item.keyInsights.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {item.keyInsights.map((insight, i) => (
                      <li key={i} className="text-sm text-[#52525B] flex gap-2">
                        <span className="text-[#6366F1] mt-0.5 flex-shrink-0">•</span>
                        <span>{insight}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {item.quote && (
                  <blockquote className="mt-3 pl-3 border-l-2 border-[#6366F1] italic text-sm text-[#52525B]">
                    "{item.quote}"
                    {item.quoteAttribution && (
                      <span className="block mt-1 text-xs text-[#A1A1AA] not-italic">— {item.quoteAttribution}</span>
                    )}
                  </blockquote>
                )}
              </div>
            ) : (
              <p>{tldlPreview}</p>
            )}
          </div>

          <div className="flex items-center gap-4 mt-3">
            {item.tldl && item.tldl.length > 280 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-[#6366F1] text-sm font-medium hover:underline"
                data-testid={`feed-expand-${item.id}`}
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
            <Link href={`/podcasts/${item.podcastSlug}/${item.episodeSlug}`}>
              <span className="text-[#6366F1] text-sm font-medium hover:underline" data-testid={`feed-viewfull-${item.id}`}>
                Full recap →
              </span>
            </Link>
            {item.duration && (
              <span className="text-xs text-[#A1A1AA] flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {item.duration}
              </span>
            )}
          </div>
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
      <div className="sticky top-12 z-30 bg-white/95 backdrop-blur-sm border-b border-[#F0F0F2]">
        <div className="max-w-[600px] mx-auto">
          <div className="flex">
            <button
              onClick={() => setActiveTab("foryou")}
              className={`flex-1 py-3.5 text-[15px] font-semibold text-center relative transition-colors ${
                activeTab === "foryou" ? "text-[#09090B]" : "text-[#A1A1AA] hover:text-[#52525B]"
              }`}
              data-testid="feed-tab-foryou"
            >
              For You
              {activeTab === "foryou" && (
                <motion.div
                  layoutId="feedTabIndicator"
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-[3px] bg-[#6366F1] rounded-full"
                />
              )}
            </button>
            <button
              onClick={() => setActiveTab("following")}
              className={`flex-1 py-3.5 text-[15px] font-semibold text-center relative transition-colors ${
                activeTab === "following" ? "text-[#09090B]" : "text-[#A1A1AA] hover:text-[#52525B]"
              }`}
              data-testid="feed-tab-following"
            >
              Following
              {activeTab === "following" && (
                <motion.div
                  layoutId="feedTabIndicator"
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-[3px] bg-[#6366F1] rounded-full"
                />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[600px] mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-[#6366F1]" />
          </div>
        ) : allItems.length === 0 ? (
          <div className="text-center py-20 px-6">
            <p className="text-[#52525B] text-base">
              {activeTab === "following"
                ? "You're not following any podcasts yet. Switch to \"For You\" to discover podcasts, or search in Discover."
                : "No recaps available yet. Check back soon!"}
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
            <div ref={observerRef} className="py-6 flex justify-center">
              {isFetchingNextPage ? (
                <Loader2 className="w-5 h-5 animate-spin text-[#6366F1]" />
              ) : hasNextPage ? (
                <span className="text-sm text-[#A1A1AA]">Scroll for more</span>
              ) : allItems.length > 5 ? (
                <span className="text-sm text-[#A1A1AA]">You're all caught up</span>
              ) : null}
            </div>
          </>
        )}
        <div className="h-16" />
      </div>
      <BottomNav currentPath={location} />
    </div>
  );
}
