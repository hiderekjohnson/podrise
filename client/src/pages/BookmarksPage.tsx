import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Bookmark, BookmarkX, Share, Copy, ExternalLink, ChevronRight } from "lucide-react";

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

function relativeTime(dateStr: string | null): string {
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

function hiResArtwork(url: string | null): string {
  if (!url) return "";
  if (url.startsWith("/artwork/")) return url;
  return url.replace(/\/\d+x\d+bb\./, "/100x100bb.");
}

function getHeaderTint(artworkUrl: string): string {
  const hash = artworkUrl ? artworkUrl.split("").reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
  const tints = ["#F0F1FE", "#FFFBEB", "#FEF2F2", "#ECFDF5", "#F0F9FF", "#FDF4FF", "#FFF7ED", "#F5F3FF"];
  return tints[hash % tints.length];
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
  const headerTint = getHeaderTint(item.artworkUrl || item.podcastSlug);
  const insights = item.keyInsights || [];

  return (
    <article
      className="bg-white dark:bg-[#111114] border border-[#E4E4E7] dark:border-[#1C1C22] rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.05)]"
      data-testid={`bookmark-card-${item.id}`}
    >
      <div className="flex items-start gap-4 px-5 pt-5 pb-4" style={{ background: headerTint }}>
        <Link href={`/podcasts/${item.podcastSlug}`} className="block flex-shrink-0">
          <div className="w-[80px] h-[80px] md:w-[100px] md:h-[100px] rounded-[12px] overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.16),0_1px_3px_rgba(0,0,0,0.08)] border border-black/[0.08]">
            {item.artworkUrl ? (
              <img src={hiResArtwork(item.artworkUrl)} alt={item.podcastName} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full bg-[#F4F4F5] dark:bg-[#1C1C22] flex items-center justify-center">
                <Bookmark className="w-6 h-6 text-[#A1A1AA]" />
              </div>
            )}
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/podcasts/${item.podcastSlug}`}>
            <span className="text-[16px] md:text-[18px] font-extrabold text-[#09090B] dark:text-white tracking-[-0.02em] leading-[1.1] mb-1 inline-block hover:text-[#6366F1] transition-colors" data-testid={`bookmark-podcast-name-${item.id}`}>
              {item.podcastName}
            </span>
          </Link>
          <div className="flex items-center gap-2 text-[12px] text-[#A1A1AA] mt-0.5">
            {item.publishDate && <span>{relativeTime(item.publishDate)}</span>}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-[#F0F0F2] dark:border-[#1C1C22]">
        <Link href={`/podcasts/${item.podcastSlug}/${item.episodeSlug}`} className="block group">
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <span className="text-[12px] text-[#A1A1AA] overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0" style={{ fontFamily: "var(--font-mono)" }} data-testid={`bookmark-episode-title-${item.id}`}>
              {item.episodeTitle}
            </span>
            <ChevronRight className="w-4 h-4 text-[#D4D4D8] flex-shrink-0 group-hover:text-[#6366F1] transition-colors" />
          </div>
          {item.tldl && (
            <h3 className="text-[20px] md:text-[24px] font-normal text-[#09090B] dark:text-white leading-[1.2] tracking-[-0.01em] group-hover:text-[#6366F1] transition-colors" style={{ fontFamily: "var(--font-serif)" }} data-testid={`bookmark-tldl-${item.id}`}>
              {item.tldl}
            </h3>
          )}
        </Link>
      </div>

      {insights.length > 0 && (
        <div className="px-5 pb-4">
          <div className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#A1A1AA] mb-2" style={{ fontFamily: "var(--font-mono)" }}>Key Takeaways</div>
          <ul className="list-none p-0">
            {insights.slice(0, 3).map((insight, i) => (
              <li key={i} className="flex items-start gap-3 py-2 border-b border-[#F0F0F2] dark:border-[#1C1C22] text-[14px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.5] first:pt-0 last:border-b-0 last:pb-0">
                <div className="w-[6px] h-[6px] rounded-full bg-[#6366F1] flex-shrink-0 mt-[7px]" />
                <div>{insight}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {item.quote && (
        <div className="px-5 pb-4">
          <div className="border-l-[3px] border-[#8B5CF6] rounded-r-[10px] px-4 py-3 bg-[#F7F7FC] dark:bg-[#1C1C22]">
            <div className="text-[16px] italic text-[#52525B] dark:text-[#A1A1AA] leading-[1.6]" style={{ fontFamily: "var(--font-serif)" }}>
              "{item.quote}"
            </div>
            {item.quoteAttribution && (
              <div className="text-[11px] text-[#A1A1AA] mt-1" style={{ fontFamily: "var(--font-mono)" }}>- {item.quoteAttribution}</div>
            )}
          </div>
        </div>
      )}

      <div className="border-t border-[#F0F0F2] dark:border-[#1C1C22] bg-[#F7F7FC] dark:bg-[#0D0D10] flex items-center justify-end px-3 py-1.5">
        <div className="flex items-center gap-[2px]">
          <button
            onClick={() => onRemove(item.podcastSlug, item.episodeSlug)}
            className="w-8 h-8 rounded-[7px] flex items-center justify-center text-[#A1A1AA] hover:bg-white dark:hover:bg-[#1C1C22] hover:text-red-500 transition-all"
            aria-label="Remove bookmark"
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
    </article>
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
      toast({ title: "Bookmark removed" });
    },
  });

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F9F9FB] dark:bg-[#09090B]" data-testid="bookmarks-page">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 pb-24 md:pb-8">
          <div className="mb-6">
            <h1 className="text-[24px] md:text-[28px] font-bold text-[#09090B] dark:text-white mb-1" data-testid="bookmarks-title">Bookmarks</h1>
            <p className="text-[15px] text-[#71717A] dark:text-[#A1A1AA]">Your saved episodes</p>
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
              <p className="text-[17px] font-bold text-[#09090B] dark:text-white mb-1" data-testid="bookmarks-empty">No bookmarks yet</p>
              <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed max-w-sm mx-auto">
                Save episodes from your feed by clicking the bookmark icon. They'll appear here for easy access.
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
