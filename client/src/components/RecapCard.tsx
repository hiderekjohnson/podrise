import { useState, useEffect, useRef } from "react";
import { Bookmark, BookmarkCheck, BookmarkX, Share, Copy, ExternalLink, MoreHorizontal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { FeedEpisodeCard } from "@/components/FeedEpisodeCard";
import { CardBottomAccordion } from "@/components/CardBottomAccordion";
import type { MentionEntry, ProductEntry } from "@/components/CardBottomAccordion";

function SharePopover({ episodeTitle, podcastSlug, episodeSlug, itemId, testIdPrefix, toast }: {
  episodeTitle: string;
  podcastSlug: string;
  episodeSlug: string;
  itemId: number | string;
  testIdPrefix: string;
  toast: (opts: Record<string, any>) => any;
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const getShareUrl = () => `${window.location.origin}/podcasts/${encodeURIComponent(podcastSlug)}/${encodeURIComponent(episodeSlug)}`;
  const supportsNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("mousedown", handleClick); document.removeEventListener("keydown", handleKeyDown); };
  }, [open]);

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Share episode"
        className="w-8 h-8 rounded-[7px] flex items-center justify-center text-[#A1A1AA] hover:bg-white hover:text-[#6366F1] transition-all"
        data-testid={`${testIdPrefix}-share-${itemId}`}
      >
        <Share className="w-[15px] h-[15px]" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full right-0 mb-2 w-[180px] bg-white dark:bg-[#1C1C22] rounded-xl shadow-lg border border-[#E4E4E7] dark:border-[#3F3F46] overflow-hidden z-50"
          >
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(getShareUrl());
                  toast({ title: "Link copied", description: "Episode link copied to clipboard" });
                } catch { toast({ title: "Copy failed", description: "Could not copy link", variant: "destructive" }); }
                setOpen(false);
              }}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-[13px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] transition-colors"
              data-testid={`${testIdPrefix}-share-copy-${itemId}`}
            >
              <Copy className="w-4 h-4" /> Copy link
            </button>
            {supportsNativeShare && (
              <button
                onClick={() => { navigator.share({ title: episodeTitle, url: getShareUrl() }).catch(() => {}); setOpen(false); }}
                className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-[13px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] border-t border-[#F0F0F2] dark:border-[#3F3F46]"
                data-testid={`${testIdPrefix}-share-native-${itemId}`}
              >
                <ExternalLink className="w-4 h-4" /> Share via...
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FollowMenuDropdown({ onUnfollow, itemId, testIdPrefix }: { onUnfollow: () => void; itemId: number | string; testIdPrefix: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("mousedown", handleClick); document.removeEventListener("keydown", handleKeyDown); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-11 h-11 rounded-full flex items-center justify-center border border-[#D4D4D8] text-[#71717A] hover:text-[#6366F1] hover:border-[#6366F1]/30 transition-all bg-white"
        aria-label="Podcast options"
        data-testid={`${testIdPrefix}-follow-menu-${itemId}`}
      >
        <MoreHorizontal className="w-[18px] h-[18px]" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-1 w-[160px] bg-white rounded-xl shadow-lg border border-[#E4E4E7] overflow-hidden z-50"
          >
            <button
              onClick={() => { onUnfollow(); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3.5 py-2.5 text-[13px] font-medium text-[#EF4444] hover:bg-[#FEF2F2] transition-colors"
              data-testid={`${testIdPrefix}-unfollow-btn-${itemId}`}
            >
              Unfollow
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export interface RecapCardProps {
  id: number | string;
  podcastSlug: string;
  episodeSlug: string;
  podcastName: string;
  episodeTitle: string;
  publishDate: string | null;
  artworkUrl: string | null;
  tldl?: string | null;
  tabloidSubHeadline?: string | null;
  keyInsights?: string[] | null;
  quote?: string | null;
  quoteAttribution?: string | null;
  duration?: string;
  hosts?: string | null;
  totalEpisodes?: number | null;
  yearStarted?: number | null;
  whatHappened?: string | null;
  spotifyEpisodeUrl?: string | null;
  spotifyUrl?: string | null;
  youtubeUrl?: string | null;
  mentions?: {
    people: MentionEntry[];
    companies: MentionEntry[];
    products: ProductEntry[];
  };
  isFollowing?: boolean;
  isBookmarked?: boolean;
  onFollowToggle?: (slug: string, follow: boolean) => void;
  onBookmarkToggle?: (episodeSlug: string, podcastSlug: string) => void;
  onBookmarkRemove?: (podcastSlug: string, episodeSlug: string) => void;
  toast: (opts: Record<string, any>) => any;
  testIdPrefix?: string;
  className?: string;
}

export function RecapCard({
  id,
  podcastSlug,
  episodeSlug,
  podcastName,
  episodeTitle,
  publishDate,
  artworkUrl,
  tldl,
  tabloidSubHeadline,
  keyInsights,
  quote,
  quoteAttribution,
  duration,
  hosts,
  totalEpisodes,
  yearStarted,
  whatHappened,
  spotifyEpisodeUrl,
  spotifyUrl,
  youtubeUrl,
  mentions,
  isFollowing = false,
  isBookmarked = false,
  onFollowToggle,
  onBookmarkToggle,
  onBookmarkRemove,
  toast,
  testIdPrefix = "recap",
  className = "mb-5",
}: RecapCardProps) {
  const headerAction = onFollowToggle ? (
    isFollowing ? (
      <FollowMenuDropdown onUnfollow={() => onFollowToggle(podcastSlug, false)} itemId={id} testIdPrefix={testIdPrefix} />
    ) : (
      <button
        onClick={() => onFollowToggle(podcastSlug, true)}
        className="inline-flex items-center px-5 py-[9px] rounded-full text-[14px] font-bold transition-all bg-[#6366F1] text-white hover:bg-[#4F46E5]"
        data-testid={`${testIdPrefix}-follow-btn-${id}`}
      >
        Follow
      </button>
    )
  ) : undefined;

  const bottomBar = (
    <div className="border-t border-[#E4E4E7] flex items-center justify-between px-3 md:px-4 py-2">
      <div />
      <div className="flex items-center gap-[2px]">
        {onBookmarkRemove ? (
          <button
            onClick={() => onBookmarkRemove(podcastSlug, episodeSlug)}
            className="w-8 h-8 rounded-[7px] flex items-center justify-center text-[#A1A1AA] hover:bg-white dark:hover:bg-[#1C1C22] hover:text-red-500 transition-all"
            aria-label="Remove saved episode"
            data-testid={`${testIdPrefix}-bookmark-remove-${id}`}
          >
            <BookmarkX className="w-[15px] h-[15px]" />
          </button>
        ) : onBookmarkToggle ? (
          <button
            onClick={() => onBookmarkToggle(episodeSlug, podcastSlug)}
            className={`w-8 h-8 rounded-[7px] flex items-center justify-center transition-all ${isBookmarked ? "text-[#6366F1]" : "text-[#A1A1AA] hover:bg-[#F4F4F5] hover:text-[#6366F1]"}`}
            data-testid={`${testIdPrefix}-bookmark-${id}`}
          >
            {isBookmarked ? <BookmarkCheck className="w-[15px] h-[15px]" /> : <Bookmark className="w-[15px] h-[15px]" />}
          </button>
        ) : null}
        <SharePopover
          episodeTitle={episodeTitle}
          podcastSlug={podcastSlug}
          episodeSlug={episodeSlug}
          itemId={id}
          testIdPrefix={testIdPrefix}
          toast={toast}
        />
        {onFollowToggle && (
          <button
            onClick={() => onFollowToggle(podcastSlug, !isFollowing)}
            className={`ml-2 px-4 py-[6px] rounded-full text-[13px] font-bold transition-all whitespace-nowrap ${
              isFollowing
                ? "bg-white text-[#52525B] border-[1.5px] border-[#E4E4E7] hover:border-[#6366F1] hover:text-[#6366F1]"
                : "bg-[#6366F1] text-white hover:bg-[#4F46E5]"
            }`}
            data-testid={`${testIdPrefix}-follow-toggle-${id}`}
          >
            {isFollowing ? "Following" : "Follow"}
          </button>
        )}
      </div>
    </div>
  );

  const accordionItem = {
    id,
    episodeSlug,
    podcastSlug,
    episodeTitle,
    whatHappened: whatHappened || null,
    spotifyEpisodeUrl: spotifyEpisodeUrl || null,
    spotifyUrl: spotifyUrl || null,
    youtubeUrl: youtubeUrl || null,
    mentions: mentions || { people: [], companies: [], products: [] },
  };

  return (
    <div className={className} data-testid={`${testIdPrefix}-card-${id}`}>
      <FeedEpisodeCard
        podcastSlug={podcastSlug}
        episodeSlug={episodeSlug}
        podcastName={podcastName}
        episodeTitle={episodeTitle}
        publishDate={publishDate}
        artworkUrl={artworkUrl}
        tldl={tabloidSubHeadline || tldl}
        keyInsights={keyInsights}
        quote={quote}
        quoteAttribution={quoteAttribution}
        duration={duration}
        hosts={hosts || undefined}
        totalEpisodes={totalEpisodes || undefined}
        yearStarted={yearStarted || undefined}
        testIdPrefix={testIdPrefix}
        headerAction={headerAction}
        bottomActions={
          <CardBottomAccordion
            item={accordionItem}
            bottomBar={bottomBar}
          />
        }
      />
    </div>
  );
}
