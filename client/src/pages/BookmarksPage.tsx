import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Bookmark } from "lucide-react";
import { RecapCard } from "@/components/RecapCard";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import type { MentionEntry, ProductEntry } from "@/components/CardBottomAccordion";

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
  spotifyEpisodeUrl: string | null;
  spotifyUrl: string | null;
  youtubeUrl: string | null;
  mentions: {
    people: MentionEntry[];
    companies: MentionEntry[];
    products: ProductEntry[];
  };
}

export default function BookmarksPage() {
  const { toast } = useToast();

  const { data: bookmarksList = [], isLoading } = useQuery<EnrichedBookmark[]>({
    queryKey: ["/api/bookmarks/enriched"],
  });

  const { data: followData } = useQuery<{ followedSlugs: string[] }>({
    queryKey: ["/api/feed/followed-slugs"],
  });
  const followedSlugs = new Set(followData?.followedSlugs || []);

  const followMutation = useMutation({
    mutationFn: async ({ slug, follow }: { slug: string; follow: boolean }) => {
      const endpoint = follow ? "/api/feed/follow" : "/api/feed/unfollow";
      await apiRequest("POST", endpoint, { podcastSlug: slug });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-slugs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
    },
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
              {bookmarksList.map((bm) => {
                const podcastMeta = PODCAST_LANDINGS.find(p => p.slug === bm.podcastSlug);
                return (
                  <RecapCard
                    key={bm.id}
                    id={bm.id}
                    podcastSlug={bm.podcastSlug}
                    episodeSlug={bm.episodeSlug}
                    podcastName={bm.podcastName}
                    episodeTitle={bm.episodeTitle}
                    publishDate={bm.publishDate}
                    artworkUrl={bm.artworkUrl}
                    tldl={bm.tldl}
                    tabloidSubHeadline={bm.tabloidSubHeadline}
                    keyInsights={bm.keyInsights}
                    quote={bm.quote}
                    quoteAttribution={bm.quoteAttribution}
                    duration={bm.duration}
                    hosts={podcastMeta?.hosts}
                    totalEpisodes={podcastMeta?.totalEpisodes}
                    yearStarted={podcastMeta?.yearStarted}
                    whatHappened={bm.whatHappened}
                    spotifyEpisodeUrl={bm.spotifyEpisodeUrl}
                    spotifyUrl={bm.spotifyUrl}
                    youtubeUrl={bm.youtubeUrl}
                    mentions={bm.mentions}
                    isFollowing={followedSlugs.has(bm.podcastSlug)}
                    onFollowToggle={(slug, follow) => followMutation.mutate({ slug, follow })}
                    onBookmarkRemove={(podcastSlug, episodeSlug) => removeBookmark.mutate({ podcastSlug, episodeSlug })}
                    toast={toast}
                    testIdPrefix="bookmark"
                    className=""
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
