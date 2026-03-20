import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Bookmark, BookOpen, ExternalLink, X } from "lucide-react";
import { RecapCard } from "@/components/RecapCard";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { BookCover } from "@/components/BookCover";
import { Link } from "wouter";
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

interface EnrichedBookBookmark {
  id: number;
  bookSlug: string;
  createdAt: string;
  name: string;
  author: string | null;
  description: string | null;
  hasCover: boolean;
  googleBooksId: string | null;
  amazonUrl: string;
}

type TabType = "episodes" | "books";

export default function BookmarksPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>("episodes");

  const { data: bookmarksList = [], isLoading } = useQuery<EnrichedBookmark[]>({
    queryKey: ["/api/bookmarks/enriched"],
  });

  const { data: bookBookmarksList = [], isLoading: booksLoading } = useQuery<EnrichedBookBookmark[]>({
    queryKey: ["/api/book-bookmarks/enriched"],
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

  const removeBookBookmark = useMutation({
    mutationFn: async (bookSlug: string) => {
      await apiRequest("DELETE", `/api/book-bookmarks/${encodeURIComponent(bookSlug)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/book-bookmarks/enriched"] });
      queryClient.invalidateQueries({ queryKey: ["/api/book-bookmarks"] });
      toast({ title: "Book removed from library" });
    },
  });

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: "episodes", label: "Saved Episodes", count: bookmarksList.length },
    { key: "books", label: "Saved Books", count: bookBookmarksList.length },
  ];

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F9F9FB] dark:bg-[#09090B]" data-testid="bookmarks-page">
        <div className="px-4 md:px-8 py-8 pb-24 md:pb-8">
          <div className="mb-6">
            <h1 className="text-[24px] md:text-[28px] font-bold text-[#09090B] dark:text-white mb-1" data-testid="bookmarks-title">Library</h1>
            <p className="text-[15px] text-[#71717A] dark:text-[#A1A1AA]">Your saved episodes and books</p>
          </div>

          <div className="flex gap-1 mb-6 border-b border-[#E4E4E7] dark:border-white/[0.08]" data-testid="bookmarks-tabs">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-[14px] font-semibold transition-colors relative ${
                  activeTab === tab.key
                    ? "text-[#09090B] dark:text-white"
                    : "text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white"
                }`}
                data-testid={`tab-${tab.key}`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`ml-1.5 text-[12px] font-medium px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.key
                      ? "bg-[#6366F1]/10 text-[#6366F1]"
                      : "bg-[#F4F4F5] dark:bg-white/[0.06] text-[#A1A1AA]"
                  }`}>
                    {tab.count}
                  </span>
                )}
                {activeTab === tab.key && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#6366F1] rounded-t-full" />
                )}
              </button>
            ))}
          </div>

          {activeTab === "episodes" && (
            <>
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
                        isLoggedIn={true}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}

          {activeTab === "books" && (
            <>
              {booksLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-7 h-7 animate-spin text-[#6366F1]" />
                </div>
              ) : bookBookmarksList.length === 0 ? (
                <div className="text-center py-20">
                  <div className="w-16 h-16 rounded-full bg-[#F4F4F5] dark:bg-[#1C1C22] flex items-center justify-center mx-auto mb-4">
                    <BookOpen className="w-7 h-7 text-[#A1A1AA]" />
                  </div>
                  <p className="text-[17px] font-bold text-[#09090B] dark:text-white mb-1" data-testid="books-empty">No saved books yet</p>
                  <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed max-w-sm mx-auto">
                    Browse the <Link href="/shop" className="text-[#6366F1] hover:text-[#6366F1]/80 underline">Pod Shop</Link> and save books from any book page. They'll appear here in your library.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="book-bookmarks-grid">
                  {bookBookmarksList.map((bm) => (
                    <div
                      key={bm.id}
                      className="bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.08] rounded-xl p-4 flex gap-4 group relative"
                      data-testid={`card-book-bookmark-${bm.bookSlug}`}
                    >
                      <Link href={`/shop/${bm.bookSlug}`} className="shrink-0" data-testid={`link-book-cover-${bm.bookSlug}`}>
                        <BookCover
                          title={bm.name}
                          slug={bm.bookSlug}
                          hasCover={bm.hasCover}
                          googleBooksId={bm.googleBooksId}
                          size="md"
                        />
                      </Link>
                      <div className="flex-1 min-w-0 flex flex-col">
                        <Link
                          href={`/shop/${bm.bookSlug}`}
                          className="text-[15px] font-bold text-[#09090B] dark:text-white leading-snug hover:text-[#6366F1] dark:hover:text-[#6366F1] transition-colors line-clamp-2 mb-1"
                          data-testid={`link-book-title-${bm.bookSlug}`}
                        >
                          {bm.name}
                        </Link>
                        {bm.author && (
                          <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] mb-2 line-clamp-1" data-testid={`text-book-author-${bm.bookSlug}`}>
                            by {bm.author}
                          </p>
                        )}
                        {bm.description && (
                          <p className="text-[12px] text-[#A1A1AA] dark:text-[#71717A] leading-relaxed line-clamp-2 mb-3">
                            {bm.description}
                          </p>
                        )}
                        <div className="mt-auto flex items-center gap-2">
                          <a
                            href={bm.amazonUrl}
                            target="_blank"
                            rel="sponsored noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#52525B] dark:text-[#A1A1AA] hover:text-[#FF9900] dark:hover:text-[#FF9900] transition-colors"
                            data-testid={`link-amazon-${bm.bookSlug}`}
                          >
                            Amazon
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <span className="text-[#E4E4E7] dark:text-white/[0.12]">·</span>
                          <button
                            onClick={() => removeBookBookmark.mutate(bm.bookSlug)}
                            disabled={removeBookBookmark.isPending}
                            className="inline-flex items-center gap-1 text-[13px] font-medium text-[#A1A1AA] hover:text-red-500 dark:hover:text-red-400 transition-colors"
                            data-testid={`button-remove-book-${bm.bookSlug}`}
                          >
                            <X className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
