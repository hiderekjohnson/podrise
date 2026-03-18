import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Bookmark, BookmarkX, Share, Copy, ExternalLink } from "lucide-react";
import { FeedEpisodeCard } from "@/components/FeedEpisodeCard";

interface EnrichedBookmark {
  id: number;
  podcastSlug: string;
  episodeSlug: string;
  createdAt: string;
  podcastName: string;
  episodeTitle: string;
  publishDate: string | null;
  artworkUrl: string | null;
  tldl: string | null;
  keyInsights: string[] | null;
  whatHappened: string | null;
  quote: string | null;
  quoteAttribution: string | null;
}

function SharePopover({ episodeTitle, podcastSlug, episodeSlug, itemId, toast }: {
  episodeTitle: string;
  podcastSlug: string;
  episodeSlug: string;
  itemId: number;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [open, setOpen] = useState(false);
  const getShareUrl = () => `${window.location.origin}/podcasts/${encodeURIComponent(podcastSlug)}/${encodeURIComponent(episodeSlug)}`;
  const supportsNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Share episode"
        className="w-8 h-8 rounded-[7px] flex items-center justify-center text-[#A1A1AA] hover:bg-white hover:text-[#6366F1] transition-all"
        data-testid={`bookmark-share-${itemId}`}
      >
        <Share className="w-[15px] h-[15px]" />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-[180px] bg-white dark:bg-[#1C1C22] rounded-xl shadow-lg border border-[#E4E4E7] dark:border-[#3F3F46] overflow-hidden z-50">
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(getShareUrl());
                toast({ title: "Link copied", description: "Episode link copied to clipboard" });
              } catch { toast({ title: "Copy failed", description: "Could not copy link", variant: "destructive" }); }
              setOpen(false);
            }}
            className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-[13px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] transition-colors"
            data-testid={`bookmark-share-copy-${itemId}`}
          >
            <Copy className="w-4 h-4" /> Copy link
          </button>
          {supportsNativeShare && (
            <button
              onClick={() => { navigator.share({ title: episodeTitle, url: getShareUrl() }).catch(() => {}); setOpen(false); }}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-[13px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] border-t border-[#F0F0F2] dark:border-[#3F3F46]"
              data-testid={`bookmark-share-native-${itemId}`}
            >
              <ExternalLink className="w-4 h-4" /> Share via...
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BookmarkCard({ item, onRemove, toast }: {
  item: EnrichedBookmark;
  onRemove: (podcastSlug: string, episodeSlug: string) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  return (
    <FeedEpisodeCard
      podcastSlug={item.podcastSlug}
      episodeSlug={item.episodeSlug}
      podcastName={item.podcastName}
      episodeTitle={item.episodeTitle}
      publishDate={item.publishDate}
      artworkUrl={item.artworkUrl}
      tldl={item.tldl}
      keyInsights={item.keyInsights}
      quote={item.quote}
      quoteAttribution={item.quoteAttribution}
      testIdPrefix="bookmark"
      bottomActions={
        <div className="border-t border-[#F0F0F2] dark:border-[#1C1C22] bg-[#F7F7FC] dark:bg-[#0D0D10] flex items-center justify-end px-3 py-1.5">
          <div className="flex items-center gap-[2px]">
            <button
              onClick={() => onRemove(item.podcastSlug, item.episodeSlug)}
              className="w-8 h-8 rounded-[7px] flex items-center justify-center text-[#A1A1AA] hover:bg-white dark:hover:bg-[#1C1C22] hover:text-red-500 transition-all"
              aria-label="Remove saved episode"
              data-testid={`bookmark-remove-${item.id}`}
            >
              <BookmarkX className="w-[15px] h-[15px]" />
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
      }
    />
  );
}

export default function BookmarksPage() {
  const { toast } = useToast();

  const { data: bookmarksList = [], isLoading } = useQuery<EnrichedBookmark[]>({
    queryKey: ["/api/bookmarks/enriched"],
  });

  const removeBookmark = useMutation({
    mutationFn: async ({ podcastSlug, episodeSlug }: { podcastSlug: string; episodeSlug: string }) => {
      await apiRequest("DELETE", `/api/bookmarks/${encodeURIComponent(podcastSlug)}/${encodeURIComponent(episodeSlug)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks/enriched"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      toast({ title: "Episode removed" });
    },
  });

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F9F9FB] dark:bg-[#09090B]" data-testid="bookmarks-page">
        <div className="px-4 md:px-8 py-8 pb-24 md:pb-8">
          <div className="mb-6">
            <h1 className="text-[24px] md:text-[28px] font-bold text-[#09090B] dark:text-white mb-1" data-testid="bookmarks-title">Saved Episodes</h1>
            <p className="text-[15px] text-[#71717A] dark:text-[#A1A1AA]">Episodes you've saved for later</p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-7 h-7 animate-spin text-[#6366F1]" />
            </div>
          ) : bookmarksList.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-full bg-[#F4F4F5] dark:bg-[#1C1C22] flex items-center justify-center mx-auto mb-4">
                <Bookmark className="w-7 h-7 text-[#A1A1AA]" />
              </div>
              <p className="text-[17px] font-bold text-[#09090B] dark:text-white mb-1" data-testid="bookmarks-empty">No saved episodes yet</p>
              <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed max-w-sm mx-auto">
                Save episodes from your feed by clicking the save icon. They'll appear here for easy access.
              </p>
            </div>
          ) : (
            <div className="space-y-5" data-testid="bookmarks-feed">
              {bookmarksList.map((bm) => (
                <BookmarkCard
                  key={bm.id}
                  item={bm}
                  onRemove={(podcastSlug, episodeSlug) => removeBookmark.mutate({ podcastSlug, episodeSlug })}
                  toast={toast}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
