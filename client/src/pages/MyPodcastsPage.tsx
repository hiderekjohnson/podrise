import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Loader2, Radio, UserMinus, ArrowLeft, Compass, Music, Check, X, Unlink } from "lucide-react";
import { SiSpotify } from "react-icons/si";
import { Link } from "wouter";
import { hiResArtwork } from "@/lib/utils";

interface FollowedPodcast {
  slug: string;
  name: string;
  artworkUrl: string | null;
  category: string | null;
  hosts: string | null;
  hasLandingPage: boolean;
}

interface SpotifyShow {
  spotifyId: string;
  name: string;
  publisher: string;
  description: string;
  artworkUrl: string;
  totalEpisodes: number;
  spotifyUrl: string;
  alreadyFollowed: boolean;
  itunesId: string | null;
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

function SpotifyImportSection() {
  const { toast } = useToast();
  const [importMode, setImportMode] = useState(false);
  const [selectedShows, setSelectedShows] = useState<Set<string>>(new Set());

  const { data: statusData, isLoading: statusLoading } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/spotify/status"],
  });

  const { data: showsData, isLoading: showsLoading, error: showsError } = useQuery<{ shows: SpotifyShow[] }>({
    queryKey: ["/api/spotify/shows"],
    enabled: importMode && !!statusData?.connected,
    retry: false,
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/spotify/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/shows"] });
      setImportMode(false);
      toast({ title: "Disconnected", description: "Spotify account disconnected" });
    },
  });

  const bulkFollowMutation = useMutation({
    mutationFn: async (shows: Array<{ spotifyId: string; name: string; artworkUrl: string }>) => {
      const res = await apiRequest("POST", "/api/spotify/bulk-follow", { shows });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-slugs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-podcasts-details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/shows"] });
      setSelectedShows(new Set());
      toast({
        title: "Podcasts imported",
        description: `${data.followed} podcast${data.followed !== 1 ? "s" : ""} added to your feed`,
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to import podcasts", variant: "destructive" });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("spotify_connected") === "true") {
      setImportMode(true);
      toast({ title: "Spotify connected", description: "Select podcasts to import" });
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("spotify_error")) {
      const err = params.get("spotify_error");
      const messages: Record<string, string> = {
        denied: "Spotify access was denied",
        invalid: "Invalid authentication request",
        token_failed: "Failed to connect to Spotify",
        unknown: "Something went wrong connecting to Spotify",
      };
      toast({ title: "Spotify error", description: messages[err || ""] || messages.unknown, variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleConnectSpotify = useCallback(() => {
    window.location.href = "/api/auth/spotify?return_to=/my-podcasts";
  }, []);

  const handleStartImport = useCallback(() => {
    if (statusData?.connected) {
      setImportMode(true);
    } else {
      handleConnectSpotify();
    }
  }, [statusData, handleConnectSpotify]);

  const handleFollowSelected = useCallback(() => {
    if (!showsData?.shows) return;
    const toFollow = showsData.shows
      .filter(s => selectedShows.has(s.spotifyId) && !s.alreadyFollowed)
      .map(s => ({ spotifyId: s.spotifyId, name: s.name, artworkUrl: s.artworkUrl }));
    if (toFollow.length > 0) {
      bulkFollowMutation.mutate(toFollow);
    }
  }, [showsData, selectedShows, bulkFollowMutation]);

  const shows = showsData?.shows || [];
  const newShows = shows.filter(s => !s.alreadyFollowed);
  const alreadyFollowedShows = shows.filter(s => s.alreadyFollowed);

  const toggleShow = (spotifyId: string) => {
    setSelectedShows(prev => {
      const next = new Set(prev);
      if (next.has(spotifyId)) next.delete(spotifyId);
      else next.add(spotifyId);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedShows(new Set(newShows.map(s => s.spotifyId)));
  };

  const deselectAll = () => {
    setSelectedShows(new Set());
  };

  const selectedCount = [...selectedShows].filter(id => newShows.some(s => s.spotifyId === id)).length;

  if (statusLoading) return null;

  if (!importMode) {
    return (
      <div
        className="bg-gradient-to-r from-[#1DB954]/10 to-[#1DB954]/5 dark:from-[#1DB954]/15 dark:to-[#1DB954]/5 border border-[#1DB954]/20 dark:border-[#1DB954]/30 rounded-2xl p-5 flex items-center justify-between gap-4"
        data-testid="spotify-import-section"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#1DB954]/15 flex items-center justify-center">
            <SiSpotify className="w-5 h-5 text-[#1DB954]" />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-[#09090B] dark:text-white">Import from Spotify</p>
            <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] truncate">
              {statusData?.connected ? "Import podcasts you follow on Spotify" : "Connect your Spotify to import podcasts"}
            </p>
          </div>
        </div>
        <button
          onClick={handleStartImport}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-[14px] bg-[#1DB954] text-white hover:bg-[#1aa34a] transition-colors whitespace-nowrap"
          data-testid="button-spotify-import"
        >
          <SiSpotify className="w-4 h-4" />
          {statusData?.connected ? "Import" : "Connect"}
        </button>
      </div>
    );
  }

  const errorMessage = showsError ? (showsError as any)?.message || "" : "";
  const isDisconnected = errorMessage.startsWith("401") || errorMessage.startsWith("403");
  const isRateLimited = errorMessage.startsWith("429");
  const isOtherError = showsError && !isDisconnected && !isRateLimited;

  return (
    <div className="bg-white dark:bg-[#111114] border border-[#E4E4E7] dark:border-[#1C1C22] rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.05)]" data-testid="spotify-import-panel">
      <div className="px-5 py-4 border-b border-[#E4E4E7] dark:border-[#1C1C22] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SiSpotify className="w-5 h-5 text-[#1DB954]" />
          <h3 className="text-[16px] font-bold text-[#09090B] dark:text-white" data-testid="text-spotify-import-title">Import from Spotify</h3>
        </div>
        <div className="flex items-center gap-2">
          {statusData?.connected && (
            <button
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-[#71717A] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
              data-testid="button-spotify-disconnect"
            >
              <Unlink className="w-3 h-3" />
              Disconnect
            </button>
          )}
          <button
            onClick={() => { setImportMode(false); setSelectedShows(new Set()); }}
            className="p-1.5 rounded-lg text-[#71717A] hover:text-[#09090B] dark:hover:text-white hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] transition-all"
            data-testid="button-spotify-import-close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showsLoading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#1DB954]" data-testid="spotify-shows-loading" />
          <p className="text-[13px] text-[#71717A]">Fetching your Spotify podcasts...</p>
        </div>
      ) : isDisconnected ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA]" data-testid="text-spotify-reconnect">Your Spotify connection expired</p>
          <button
            onClick={handleConnectSpotify}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-[14px] bg-[#1DB954] text-white hover:bg-[#1aa34a] transition-colors"
            data-testid="button-spotify-reconnect"
          >
            <SiSpotify className="w-4 h-4" />
            Reconnect Spotify
          </button>
        </div>
      ) : isRateLimited ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA]" data-testid="text-spotify-rate-limited">Spotify rate limit reached. Please wait a moment and try again.</p>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/spotify/shows"] })}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-[14px] bg-[#1DB954] text-white hover:bg-[#1aa34a] transition-colors"
            data-testid="button-spotify-retry"
          >
            Retry
          </button>
        </div>
      ) : isOtherError ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA]" data-testid="text-spotify-error">Something went wrong fetching your Spotify shows. Please try again.</p>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/spotify/shows"] })}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-[14px] bg-[#1DB954] text-white hover:bg-[#1aa34a] transition-colors"
            data-testid="button-spotify-retry-error"
          >
            Retry
          </button>
        </div>
      ) : shows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Music className="w-8 h-8 text-[#A1A1AA]" />
          <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA]" data-testid="text-spotify-no-shows">No saved shows found on Spotify</p>
        </div>
      ) : (
        <>
          {newShows.length > 0 && (
            <div className="px-5 py-3 border-b border-[#E4E4E7] dark:border-[#1C1C22] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-[#71717A]" data-testid="text-spotify-new-count">
                  {newShows.length} new podcast{newShows.length !== 1 ? "s" : ""} to import
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={selectedCount === newShows.length ? deselectAll : selectAll}
                  className="text-[13px] font-medium text-[#6366F1] hover:text-[#4F46E5] transition-colors"
                  data-testid="button-spotify-select-all"
                >
                  {selectedCount === newShows.length ? "Deselect all" : "Select all"}
                </button>
                {selectedCount > 0 && (
                  <button
                    onClick={handleFollowSelected}
                    disabled={bulkFollowMutation.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold bg-[#1DB954] text-white hover:bg-[#1aa34a] transition-colors disabled:opacity-50"
                    data-testid="button-spotify-follow-selected"
                  >
                    {bulkFollowMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    Follow {selectedCount}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="max-h-[400px] overflow-y-auto" data-testid="spotify-shows-list">
            {newShows.map(show => (
              <label
                key={show.spotifyId}
                className="flex items-center gap-3 px-5 py-3 hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C22] transition-colors cursor-pointer border-b border-[#F4F4F5] dark:border-[#1C1C22] last:border-b-0"
                data-testid={`spotify-show-${show.spotifyId}`}
              >
                <input
                  type="checkbox"
                  checked={selectedShows.has(show.spotifyId)}
                  onChange={() => toggleShow(show.spotifyId)}
                  className="w-4 h-4 rounded border-[#D4D4D8] dark:border-[#3F3F46] text-[#1DB954] focus:ring-[#1DB954] accent-[#1DB954]"
                  data-testid={`checkbox-spotify-show-${show.spotifyId}`}
                />
                <div className="w-[44px] h-[44px] rounded-lg overflow-hidden flex-shrink-0 border border-black/[0.08]">
                  {show.artworkUrl ? (
                    <img src={show.artworkUrl} alt={show.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full bg-[#F4F4F5] dark:bg-[#1C1C22] flex items-center justify-center">
                      <Radio className="w-4 h-4 text-[#A1A1AA]" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-[#09090B] dark:text-white truncate">{show.name}</p>
                  {show.publisher && (
                    <p className="text-[12px] text-[#71717A] dark:text-[#A1A1AA] truncate">{show.publisher}</p>
                  )}
                </div>
              </label>
            ))}

            {alreadyFollowedShows.length > 0 && (
              <>
                <div className="px-5 py-2 bg-[#F9F9FB] dark:bg-[#0D0D0F]">
                  <span className="text-[12px] font-medium text-[#A1A1AA] uppercase tracking-wide" data-testid="text-spotify-already-followed-label">Already following</span>
                </div>
                {alreadyFollowedShows.map(show => (
                  <div
                    key={show.spotifyId}
                    className="flex items-center gap-3 px-5 py-3 opacity-60 border-b border-[#F4F4F5] dark:border-[#1C1C22] last:border-b-0"
                    data-testid={`spotify-show-followed-${show.spotifyId}`}
                  >
                    <div className="w-4 h-4 flex items-center justify-center">
                      <Check className="w-4 h-4 text-[#1DB954]" />
                    </div>
                    <div className="w-[44px] h-[44px] rounded-lg overflow-hidden flex-shrink-0 border border-black/[0.08]">
                      {show.artworkUrl ? (
                        <img src={show.artworkUrl} alt={show.name} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full bg-[#F4F4F5] dark:bg-[#1C1C22] flex items-center justify-center">
                          <Radio className="w-4 h-4 text-[#A1A1AA]" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-[#09090B] dark:text-white truncate">{show.name}</p>
                      {show.publisher && (
                        <p className="text-[12px] text-[#71717A] dark:text-[#A1A1AA] truncate">{show.publisher}</p>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
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
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => window.history.back()}
              className="text-[#71717A] hover:text-[#09090B] dark:hover:text-white transition-colors"
              data-testid="back-button"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-[24px] md:text-[28px] font-bold text-[#09090B] dark:text-white" data-testid="my-podcasts-title">My Podcasts</h1>
          </div>
          <div className="mb-6">
            <p className="text-[15px] text-[#71717A] dark:text-[#A1A1AA]">Podcasts you follow</p>
          </div>

          <div className="mb-6">
            <SpotifyImportSection />
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

              <div className="mt-6 bg-gradient-to-r from-[#EEF2FF] to-[#F0EBFF] dark:from-[#1a1a2e] dark:to-[#1e1b2e] border border-[#E0E7FF] dark:border-[#2d2b45] rounded-2xl p-5 flex items-center justify-between gap-4" data-testid="discover-cta-section">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#6366F1]/10 flex items-center justify-center">
                    <Compass className="w-5 h-5 text-[#6366F1]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-[#09090B] dark:text-white">Looking for more?</p>
                    <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] truncate">Browse trending and top-rated podcasts</p>
                  </div>
                </div>
                <Link href="/discover">
                  <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-[14px] bg-[#6366F1] text-white hover:bg-[#4F46E5] transition-colors whitespace-nowrap" data-testid="link-discover-more">
                    Discover Podcasts
                  </span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
