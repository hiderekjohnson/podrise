import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Clock, MessageCircle, Bookmark, BookmarkCheck, Share, ChevronDown, Zap, Copy, ExternalLink, ArrowRight, Quote } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "@/components/DashboardLayout";
import { HoverPreviewCard } from "@/components/HoverPreviewCard";

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

function SharePopover({ episodeTitle, podcastSlug, episodeSlug, itemId, toast }: {
  episodeTitle: string;
  podcastSlug: string;
  episodeSlug: string;
  itemId: number;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const getShareUrl = () => `${window.location.origin}/podcasts/${encodeURIComponent(podcastSlug)}/${encodeURIComponent(episodeSlug)}`;
  const supportsNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Share episode"
        className={`flex items-center gap-1 transition-colors ${open ? "text-[#6366F1]" : "text-[#A1A1AA] hover:text-[#6366F1]"}`}
        data-testid={`feed-share-${itemId}`}
      >
        <Share className="w-[18px] h-[18px]" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full right-0 mb-2 w-[180px] bg-white dark:bg-[#18181B] rounded-xl shadow-lg border border-[#E4E4E7] dark:border-[#27272A] overflow-hidden z-50"
          >
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(getShareUrl());
                  toast({ title: "Link copied", description: "Episode link copied to clipboard" });
                } catch {
                  toast({ title: "Copy failed", description: "Could not copy link to clipboard", variant: "destructive" });
                }
                setOpen(false);
              }}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-[13px] font-medium text-[#3F3F46] dark:text-[#D4D4D8] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] transition-colors"
              data-testid={`feed-share-copy-${itemId}`}
            >
              <Copy className="w-4 h-4" />
              Copy link
            </button>
            {supportsNativeShare && (
              <button
                onClick={() => {
                  navigator.share({ title: episodeTitle, url: getShareUrl() }).catch(() => {});
                  setOpen(false);
                }}
                className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-[13px] font-medium text-[#3F3F46] dark:text-[#D4D4D8] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] transition-colors border-t border-[#F0F0F2] dark:border-[#27272A]"
                data-testid={`feed-share-native-${itemId}`}
              >
                <ExternalLink className="w-4 h-4" />
                Share via...
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RecapCard({ item, onFollowToggle, bookmarkedKeys, onBookmarkToggle, toast }: {
  item: FeedItem;
  onFollowToggle: (slug: string, follow: boolean) => void;
  bookmarkedKeys: Set<string>;
  onBookmarkToggle: (episodeSlug: string, podcastSlug: string) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [expanded, setExpanded] = useState(false);
  const isBookmarked = bookmarkedKeys.has(`${item.podcastSlug}::${item.episodeSlug}`);

  const previewInsights = item.keyInsights?.slice(0, 2) || [];
  const allInsights = item.keyInsights || [];
  const hasMoreContent = !!(item.whatHappened || (allInsights.length > previewInsights.length) || (item.guests && item.guests.length > 0) || (item.keyTopics && item.keyTopics.length > 0));

  const whatHappenedParagraphs = item.whatHappened
    ? item.whatHappened.split(/\n\n+/).filter((p) => p.trim())
    : [];

  const episodeUrl = `/podcasts/${item.podcastSlug}/${item.episodeSlug}`;

  return (
    <article
      className="border-b border-[#F0F0F2] dark:border-[#1C1C22]"
      data-testid={`feed-card-${item.id}`}
    >
      <div className="px-4 pt-4 pb-1.5">
        <div className="flex items-start gap-3">
          <HoverPreviewCard
            type="podcast"
            slug={item.podcastSlug}
            name={item.podcastName}
            artworkUrl={item.artworkUrl}
            isFollowing={item.isFollowing}
            onFollowToggle={onFollowToggle}
          >
            <Link href={`/podcasts/${item.podcastSlug}`}>
              <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 ring-[0.5px] ring-black/5 shadow-sm">
                <img
                  src={hiResArtwork(item.artworkUrl)}
                  alt={item.podcastName}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            </Link>
          </HoverPreviewCard>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                <HoverPreviewCard
                  type="podcast"
                  slug={item.podcastSlug}
                  name={item.podcastName}
                  artworkUrl={item.artworkUrl}
                  description={item.tldl}
                  isFollowing={item.isFollowing}
                  onFollowToggle={onFollowToggle}
                >
                  <Link href={`/podcasts/${item.podcastSlug}`}>
                    <span className="font-bold text-[15px] md:text-[16px] text-[#09090B] dark:text-white hover:underline" data-testid={`feed-podcast-name-${item.id}`}>
                      {item.podcastName}
                    </span>
                  </Link>
                </HoverPreviewCard>
                <span className="text-[#A1A1AA] text-[13px] flex-shrink-0">·</span>
                <span className="text-[#71717A] text-[13px] flex-shrink-0" data-testid={`feed-time-${item.id}`}>
                  {relativeTime(item.publishDate)}
                </span>
              </div>

              <button
                onClick={() => onFollowToggle(item.podcastSlug, !item.isFollowing)}
                className={`flex-shrink-0 text-[13px] font-bold rounded-full transition-all active:scale-95 ${
                  item.isFollowing
                    ? "px-3.5 py-[5px] border border-[#D4D4D8] dark:border-[#3F3F46] text-[#09090B] dark:text-white hover:border-red-300 hover:text-red-600"
                    : "px-3.5 py-[5px] bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] hover:bg-[#27272A] dark:hover:bg-[#E4E4E7]"
                }`}
                data-testid={`feed-follow-btn-${item.id}`}
              >
                {item.isFollowing ? "Following" : "Follow"}
              </button>
            </div>

            <Link href={episodeUrl}>
              <h3 className="text-[15px] md:text-[16px] font-semibold text-[#09090B] dark:text-white mt-0.5 leading-[1.35] hover:underline line-clamp-2" data-testid={`feed-episode-title-${item.id}`}>
                {item.episodeTitle}
              </h3>
            </Link>
          </div>
        </div>

        <div className="mt-3 ml-[56px]">
          <div className="rounded-xl bg-gradient-to-br from-[#F8F8FC] to-[#F4F4F8] dark:from-[#111118] dark:to-[#0F0F14] border border-[#EDEDF3] dark:border-[#1C1C22] p-3.5 mb-3">
            <p className="text-[15px] md:text-[16px] text-[#27272A] dark:text-[#D4D4D8] leading-[1.6] font-medium" data-testid={`feed-tldl-${item.id}`}>
              {item.tldl}
            </p>
          </div>

          {!expanded && previewInsights.length > 0 && (
            <div className="space-y-2 mb-2.5">
              {previewInsights.map((insight, i) => (
                <div key={i} className="flex gap-2.5 text-[14px] md:text-[15px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.5]">
                  <span className="w-5 h-5 rounded-full bg-[#6366F1]/10 flex items-center justify-center flex-shrink-0 mt-[1px]">
                    <span className="text-[#6366F1] text-[8px]">●</span>
                  </span>
                  <span>{insight}</span>
                </div>
              ))}
            </div>
          )}

          {!expanded && item.quote && (
            <div className="mt-2.5 mb-2.5 rounded-lg bg-[#6366F1]/[0.04] dark:bg-[#6366F1]/[0.06] border-l-[3px] border-[#6366F1]/40 px-3.5 py-2.5">
              <div className="flex gap-2">
                <Quote className="w-4 h-4 text-[#6366F1]/40 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[14px] md:text-[15px] text-[#52525B] dark:text-[#A1A1AA] italic leading-[1.55] line-clamp-2">"{item.quote}"</p>
                  {item.quoteAttribution && (
                    <p className="text-[12px] text-[#A1A1AA] mt-1 not-italic font-semibold">— {item.quoteAttribution}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                {item.guests && item.guests.length > 0 && (
                  <div className="mt-1 mb-3 flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold text-[#A1A1AA] uppercase tracking-wider">Guests</span>
                    {item.guests.map((guest, i) => (
                      <span key={i} className="text-[13px] font-medium text-[#09090B] dark:text-white bg-[#F4F4F5] dark:bg-[#1C1C22] px-2.5 py-1 rounded-full">{typeof guest === 'string' ? guest : (guest as any).name || ''}</span>
                    ))}
                  </div>
                )}

                {whatHappenedParagraphs.length > 0 && (
                  <div className="mb-3 space-y-2.5">
                    {whatHappenedParagraphs.map((para, i) => (
                      <p key={i} className="text-[14px] md:text-[15px] text-[#3F3F46] dark:text-[#A1A1AA] leading-[1.65]">{para}</p>
                    ))}
                  </div>
                )}

                {allInsights.length > 0 && (
                  <div className="mb-3 rounded-xl bg-gradient-to-br from-[#F8F8FC] to-[#F4F4F8] dark:from-[#111118] dark:to-[#0F0F14] border border-[#EDEDF3] dark:border-[#1C1C22] p-3.5">
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <Zap className="w-3.5 h-3.5 text-[#6366F1]" />
                      <span className="text-[11px] font-bold text-[#6366F1] uppercase tracking-wider">Key Insights</span>
                    </div>
                    <ul className="space-y-2.5">
                      {allInsights.map((insight, i) => (
                        <li key={i} className="text-[14px] md:text-[15px] text-[#3F3F46] dark:text-[#A1A1AA] flex gap-2.5 leading-[1.5]">
                          <span className="w-5 h-5 rounded-full bg-[#6366F1]/10 flex items-center justify-center flex-shrink-0 mt-[1px]">
                            <span className="text-[#6366F1] text-[8px]">●</span>
                          </span>
                          <span>{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {item.quote && (
                  <div className="mb-3 rounded-lg bg-[#6366F1]/[0.04] dark:bg-[#6366F1]/[0.06] border-l-[3px] border-[#6366F1]/40 px-3.5 py-2.5">
                    <div className="flex gap-2">
                      <Quote className="w-4 h-4 text-[#6366F1]/40 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[14px] md:text-[15px] text-[#52525B] dark:text-[#A1A1AA] italic leading-[1.55]">"{item.quote}"</p>
                        {item.quoteAttribution && (
                          <p className="text-[12px] text-[#A1A1AA] mt-1 not-italic font-semibold">— {item.quoteAttribution}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {item.keyTopics && item.keyTopics.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {item.keyTopics.map((topic, i) => (
                      <span key={i} className="text-[12px] font-medium text-[#6366F1] bg-[#6366F1]/[0.08] px-2.5 py-1 rounded-full">{topic}</span>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-3 mt-1 mb-1">
            {hasMoreContent && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-[#6366F1] text-[13px] font-semibold hover:underline"
                data-testid={`feed-expand-${item.id}`}
              >
                {expanded ? (
                  <>Show less<ChevronDown className="w-3.5 h-3.5 rotate-180 transition-transform" /></>
                ) : (
                  <>Show more<ChevronDown className="w-3.5 h-3.5 transition-transform" /></>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-1.5 ml-[56px] pb-3">
          <Link href={episodeUrl}>
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#6366F1] hover:text-[#4F46E5] transition-colors group" data-testid={`feed-viewfull-${item.id}`}>
              Read full recap
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </Link>

          <div className="flex items-center gap-4">
            {item.duration && (
              <span className="flex items-center gap-1 text-[#A1A1AA]">
                <Clock className="w-[14px] h-[14px]" />
                <span className="text-[12px]">{item.duration}</span>
              </span>
            )}

            <button
              onClick={() => onBookmarkToggle(item.episodeSlug, item.podcastSlug)}
              aria-label={isBookmarked ? "Remove bookmark" : "Bookmark episode"}
              className={`flex items-center gap-1 transition-all active:scale-90 ${isBookmarked ? "text-[#6366F1]" : "text-[#A1A1AA] hover:text-[#6366F1]"}`}
              data-testid={`feed-bookmark-${item.id}`}
            >
              {isBookmarked ? <BookmarkCheck className="w-[18px] h-[18px]" /> : <Bookmark className="w-[18px] h-[18px]" />}
            </button>

            <SharePopover
              episodeTitle={item.episodeTitle}
              podcastSlug={item.podcastSlug}
              episodeSlug={item.episodeSlug}
              itemId={item.id}
              toast={toast}
            />
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

  type BookmarkRecord = { id: number; episodeSlug: string; podcastSlug: string };

  const { data: bookmarksData } = useQuery<BookmarkRecord[]>({
    queryKey: ["/api/bookmarks"],
    enabled: !!user,
  });

  const bookmarkedKeys = new Set((bookmarksData || []).map((b) => `${b.podcastSlug}::${b.episodeSlug}`));

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
    onSuccess: () => {
      toast({ title: "Bookmarked", description: "Episode saved to your bookmarks" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData<BookmarkRecord[]>(["/api/bookmarks"], context.previous);
      }
      toast({ title: "Error", description: "Failed to bookmark episode", variant: "destructive" });
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
    onSuccess: () => {
      toast({ title: "Removed", description: "Episode removed from bookmarks" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData<BookmarkRecord[]>(["/api/bookmarks"], context.previous);
      }
      toast({ title: "Error", description: "Failed to remove bookmark", variant: "destructive" });
    },
  });

  const handleBookmarkToggle = useCallback((episodeSlug: string, podcastSlug: string) => {
    if (!user) {
      toast({ title: "Sign in required", description: "Log in to bookmark episodes", variant: "destructive" });
      return;
    }
    const key = `${podcastSlug}::${episodeSlug}`;
    if (bookmarkedKeys.has(key)) {
      removeBookmark.mutate({ podcastSlug, episodeSlug });
    } else {
      addBookmark.mutate({ episodeSlug, podcastSlug });
    }
  }, [bookmarkedKeys, addBookmark, removeBookmark, user, toast]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
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

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-white dark:bg-[#09090B]" data-testid="feed-page">
        <div className="sticky top-0 z-30 bg-white dark:bg-[#09090B] border-b border-[#F0F0F2] dark:border-[#1C1C22]">
          <div className="max-w-5xl mx-auto">
            <div className="flex">
              {(["foryou", "following"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3 text-[14px] md:text-[15px] font-bold text-center relative transition-colors ${
                    activeTab === tab ? "text-[#09090B] dark:text-white" : "text-[#A1A1AA] hover:text-[#71717A] hover:bg-[#FAFAFA] dark:hover:bg-[#111114]"
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

        <div className="max-w-5xl mx-auto">
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
              {allItems.map((item) => (
                <RecapCard
                  key={item.id}
                  item={item}
                  onFollowToggle={handleFollowToggle}
                  bookmarkedKeys={bookmarkedKeys}
                  onBookmarkToggle={handleBookmarkToggle}
                  toast={toast}
                />
              ))}
              <div ref={observerRef} className="py-8 flex flex-col items-center gap-2">
                {isFetchingNextPage ? (
                  <Loader2 className="w-5 h-5 animate-spin text-[#6366F1]" />
                ) : hasNextPage ? (
                  <span className="text-[13px] text-[#A1A1AA]">Scroll for more</span>
                ) : allItems.length > 5 ? (
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-8 h-[2px] bg-[#E4E4E7] dark:bg-[#27272A] rounded-full" />
                    <span className="text-[13px] text-[#A1A1AA] font-medium">You're all caught up</span>
                  </div>
                ) : null}
              </div>
            </>
          )}
          <div className="h-[60px] md:h-4" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
        </div>
      </div>
    </DashboardLayout>
  );
}
