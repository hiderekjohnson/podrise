import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Loader2, Radio, UserMinus, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface FollowedPodcast {
  slug: string;
  name: string;
  artworkUrl: string | null;
  category: string | null;
  hosts: string | null;
  hasLandingPage: boolean;
}

function hiResArtwork(url: string | null): string {
  if (!url) return "";
  if (url.startsWith("/artwork/")) return url;
  return url.replace(/\/\d+x\d+bb\./, "/100x100bb.");
}

function ExternalPodcastName({ name, slug }: { name: string; slug: string }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative inline-block max-w-full">
      <span
        className="text-[16px] font-bold text-[#09090B] dark:text-white block truncate cursor-default"
        data-testid={`my-podcast-name-${slug}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {name}
      </span>
      {showTooltip && (
        <div className="absolute left-0 bottom-full mb-2 z-50 px-3 py-2 text-[12px] leading-snug text-white bg-[#18181B] dark:bg-[#27272A] rounded-lg shadow-lg whitespace-normal max-w-[260px] pointer-events-none" data-testid={`tooltip-external-${slug}`}>
          This podcast isn't in our library yet — we've noted your interest and are working on adding it
          <div className="absolute left-4 top-full w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-[#18181B] dark:border-t-[#27272A]" />
        </div>
      )}
    </div>
  );
}

export default function MyPodcastsPage() {
  const { toast } = useToast();

  const { data: podcasts = [], isLoading } = useQuery<FollowedPodcast[]>({
    queryKey: ["/api/feed/followed-podcasts-details"],
  });

  const unfollowMutation = useMutation({
    mutationFn: async (podcastSlug: string) => {
      await apiRequest("POST", "/api/feed/unfollow", { podcastSlug });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-slugs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-podcasts-details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
      toast({ title: "Unfollowed", description: "Podcast removed from your feed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to unfollow podcast", variant: "destructive" });
    },
  });

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F9F9FB] dark:bg-[#09090B]" data-testid="my-podcasts-page">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 pb-24 md:pb-8">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-[14px] text-[#71717A] hover:text-[#09090B] dark:hover:text-white transition-colors mb-3"
            data-testid="back-button"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="mb-6">
            <h1 className="text-[24px] md:text-[28px] font-bold text-[#09090B] dark:text-white mb-1" data-testid="my-podcasts-title">My Podcasts</h1>
            <p className="text-[15px] text-[#71717A] dark:text-[#A1A1AA]">Podcasts you follow</p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-7 h-7 animate-spin text-[#6366F1]" data-testid="my-podcasts-loading" />
            </div>
          ) : podcasts.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-full bg-[#F4F4F5] dark:bg-[#1C1C22] flex items-center justify-center mx-auto mb-4">
                <Radio className="w-7 h-7 text-[#A1A1AA]" />
              </div>
              <p className="text-[17px] font-bold text-[#09090B] dark:text-white mb-1" data-testid="my-podcasts-empty">No podcasts yet</p>
              <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed max-w-sm mx-auto">
                Follow podcasts from Discover or your feed. They'll appear here.
              </p>
              <Link href="/discover">
                <span className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-xl font-bold text-[15px] bg-[#6366F1] text-white hover:bg-[#4F46E5] transition-colors" data-testid="link-discover-podcasts">
                  Discover Podcasts
                </span>
              </Link>
            </div>
          ) : (
            <div className="space-y-3" data-testid="my-podcasts-list">
              {podcasts.map((podcast) => {
                const ArtworkContent = (
                  <div className="w-[60px] h-[60px] rounded-[10px] overflow-hidden shadow-sm border border-black/[0.08]">
                    {podcast.artworkUrl ? (
                      <img src={hiResArtwork(podcast.artworkUrl)} alt={podcast.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full bg-[#F4F4F5] dark:bg-[#1C1C22] flex items-center justify-center">
                        <Radio className="w-5 h-5 text-[#A1A1AA]" />
                      </div>
                    )}
                  </div>
                );

                return (
                  <div
                    key={podcast.slug}
                    className="bg-white dark:bg-[#111114] border border-[#E4E4E7] dark:border-[#1C1C22] rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.05)] flex items-center gap-4 px-4 py-3"
                    data-testid={`my-podcast-card-${podcast.slug}`}
                  >
                    {podcast.hasLandingPage ? (
                      <Link href={`/podcasts/${podcast.slug}`} className="flex-shrink-0">
                        {ArtworkContent}
                      </Link>
                    ) : (
                      <div className="flex-shrink-0">
                        {ArtworkContent}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {podcast.hasLandingPage ? (
                        <Link href={`/podcasts/${podcast.slug}`}>
                          <span className="text-[16px] font-bold text-[#09090B] dark:text-white hover:text-[#6366F1] transition-colors block truncate" data-testid={`my-podcast-name-${podcast.slug}`}>
                            {podcast.name}
                          </span>
                        </Link>
                      ) : (
                        <ExternalPodcastName name={podcast.name} slug={podcast.slug} />
                      )}
                      {podcast.hosts && (
                        <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] truncate mt-0.5">{podcast.hosts}</p>
                      )}
                      {podcast.category && (
                        <p className="text-[12px] text-[#A1A1AA] mt-0.5">{podcast.category}</p>
                      )}
                    </div>
                    <button
                      onClick={() => unfollowMutation.mutate(podcast.slug)}
                      disabled={unfollowMutation.isPending}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold border border-[#E4E4E7] dark:border-[#3F3F46] text-[#71717A] hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
                      data-testid={`my-podcast-unfollow-${podcast.slug}`}
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                      Unfollow
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
