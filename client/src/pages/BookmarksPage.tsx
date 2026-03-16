import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Bookmark, BookmarkX } from "lucide-react";

interface BookmarkItem {
  id: number;
  userId: number;
  episodeSlug: string;
  podcastSlug: string;
  createdAt: string;
}

export default function BookmarksPage() {
  const { toast } = useToast();

  const { data: bookmarksList = [], isLoading } = useQuery<BookmarkItem[]>({
    queryKey: ["/api/bookmarks"],
  });

  const removeBookmark = useMutation({
    mutationFn: async ({ podcastSlug, episodeSlug }: { podcastSlug: string; episodeSlug: string }) => {
      await apiRequest("DELETE", `/api/bookmarks/${encodeURIComponent(podcastSlug)}/${encodeURIComponent(episodeSlug)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      toast({ title: "Bookmark removed" });
    },
  });

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F9F9FB] dark:bg-[#09090B]" data-testid="bookmarks-page">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 pb-24 md:pb-8">
          <div className="mb-6">
            <h1 className="text-[24px] md:text-[28px] font-bold text-[#09090B] dark:text-white mb-1">Bookmarks</h1>
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
              <p className="text-[17px] font-bold text-[#09090B] dark:text-white mb-1">No bookmarks yet</p>
              <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed max-w-sm mx-auto">
                Save episodes from your feed by clicking the bookmark icon. They'll appear here for easy access.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {bookmarksList.map((bm) => (
                <div
                  key={bm.id}
                  className="rounded-2xl bg-white dark:bg-[#111114] border border-[#F0F0F2] dark:border-[#1C1C22] p-4 flex items-center gap-3"
                  data-testid={`bookmark-${bm.id}`}
                >
                  <Link
                    href={`/podcasts/${bm.podcastSlug}/${bm.episodeSlug}`}
                    className="flex-1 min-w-0"
                  >
                    <p className="text-[15px] md:text-[16px] font-semibold text-[#09090B] dark:text-white truncate hover:text-[#6366F1] transition-colors" data-testid={`bookmark-episode-${bm.id}`}>
                      {bm.episodeSlug.replace(/-/g, " ")}
                    </p>
                    <p className="text-[13px] text-[#A1A1AA] mt-0.5" data-testid={`bookmark-podcast-${bm.id}`}>
                      {bm.podcastSlug.replace(/-/g, " ")}
                    </p>
                  </Link>
                  <button
                    onClick={() => removeBookmark.mutate({ podcastSlug: bm.podcastSlug, episodeSlug: bm.episodeSlug })}
                    className="flex-shrink-0 p-2 text-[#A1A1AA] hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10"
                    aria-label="Remove bookmark"
                    data-testid={`bookmark-remove-${bm.id}`}
                  >
                    <BookmarkX className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
