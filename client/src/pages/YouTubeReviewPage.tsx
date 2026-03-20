import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, SkipForward, XCircle, ExternalLink, Search, Loader2, Youtube, Play } from "lucide-react";
import { SiSpotify } from "react-icons/si";

interface Episode {
  id: number;
  podcastName: string;
  episodeTitle: string;
  episodeSlug: string;
  slug: string;
  publishDate: string;
  duration: string;
  artworkUrl: string;
  hosts: string;
  guests: string;
  channelYoutubeUrl: string | null;
  channelSpotifyUrl: string | null;
  existingYoutubeUrl: string | null;
  existingSpotifyUrl: string | null;
}

interface YouTubeResult {
  videoId: string;
  url: string;
  title: string;
  thumbnail: string;
}

interface ReviewData {
  episode: Episode | null;
  youtubeResult: YouTubeResult | null;
  progress: { done: number; total: number };
}

function parseYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  if (url.includes("/search") || url.includes("search_query")) return null;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function parseSpotifyEpisodeId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/open\.spotify\.com\/episode\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function parseGuests(guests: string | null): string[] {
  if (!guests) return [];
  try {
    const parsed = JSON.parse(guests);
    if (Array.isArray(parsed)) {
      return parsed.map((g: unknown) => {
        if (typeof g === "string") return g;
        if (g && typeof g === "object" && "name" in g) {
          const guest = g as { name: string; title?: string };
          return guest.title ? `${guest.name} (${guest.title})` : guest.name;
        }
        return "";
      }).filter(Boolean);
    }
  } catch {}
  return guests.split(",").map(s => s.trim()).filter(Boolean);
}

function openInNewWindow(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function getYoutubeVideosUrl(channelUrl: string): string {
  if (!channelUrl) return channelUrl;
  const trimmed = channelUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/videos")) return trimmed;
  return trimmed + "/videos";
}

export default function YouTubeReviewPage() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";
  const { toast } = useToast();
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const [showSpotifyEmbed, setShowSpotifyEmbed] = useState(false);
  const [youtubeDisabled, setYoutubeDisabled] = useState(false);

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  const { data: worker, isLoading: workerLoading, error: workerError } = useQuery<{ id: number; name: string }>({
    queryKey: ["/api/mturk/worker", token],
    queryFn: async () => {
      const res = await fetch(`/api/mturk/worker/${token}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Invalid link");
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const { data: reviewData, isLoading: episodeLoading, refetch } = useQuery<ReviewData>({
    queryKey: ["/api/mturk/next", token],
    queryFn: async () => {
      const res = await fetch(`/api/mturk/next/${token}`);
      if (!res.ok) throw new Error("Failed to load episode");
      return res.json();
    },
    enabled: !!worker,
  });

  useEffect(() => {
    if (reviewData?.episode) {
      const ep = reviewData.episode;
      if (ep.existingYoutubeUrl) {
        setYoutubeUrl(ep.existingYoutubeUrl);
        setYoutubeDisabled(true);
      } else if (reviewData?.youtubeResult?.url) {
        setYoutubeUrl(reviewData.youtubeResult.url);
        setYoutubeDisabled(false);
      } else {
        setYoutubeUrl("");
        setYoutubeDisabled(false);
      }
      setSpotifyUrl("");
    } else {
      setYoutubeUrl("");
      setSpotifyUrl("");
      setYoutubeDisabled(false);
    }
    setShowEmbed(false);
    setShowSpotifyEmbed(false);
  }, [reviewData?.episode?.id]);

  const submitAction = useCallback(async (action: "confirmed" | "skipped" | "no_video") => {
    if (!reviewData?.episode) return;
    if (action === "confirmed") {
      const hasYoutube = !youtubeDisabled && youtubeUrl && parseYouTubeVideoId(youtubeUrl);
      const hasSpotify = spotifyUrl && parseSpotifyEpisodeId(spotifyUrl);
      if (youtubeDisabled && !hasSpotify) {
        toast({ title: "Enter a Spotify URL to confirm", variant: "destructive" });
        return;
      }
      if (!youtubeDisabled && !hasYoutube && !hasSpotify) {
        toast({ title: "Enter at least one URL (YouTube or Spotify)", variant: "destructive" });
        return;
      }
    }
    setIsSubmitting(true);
    try {
      const validYoutubeUrl = action === "confirmed" && !youtubeDisabled && youtubeUrl && parseYouTubeVideoId(youtubeUrl) ? youtubeUrl : undefined;
      const validSpotifyUrl = action === "confirmed" && spotifyUrl && parseSpotifyEpisodeId(spotifyUrl) ? spotifyUrl : undefined;
      await apiRequest("POST", `/api/mturk/submit/${token}`, {
        episodeId: reviewData.episode.id,
        action,
        youtubeUrl: validYoutubeUrl,
        spotifyUrl: validSpotifyUrl,
      });
      setYoutubeUrl("");
      setSpotifyUrl("");
      setShowEmbed(false);
      setShowSpotifyEmbed(false);
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Submission failed";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }, [reviewData?.episode, youtubeUrl, spotifyUrl, youtubeDisabled, token, refetch, toast]);

  const videoId = youtubeUrl ? parseYouTubeVideoId(youtubeUrl) : null;
  const spotifyEpisodeId = spotifyUrl ? parseSpotifyEpisodeId(spotifyUrl) : null;
  const episode = reviewData?.episode;
  const progress = reviewData?.progress || { done: 0, total: 0 };
  const remaining = Math.max(0, progress.total - progress.done);
  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const hasValidYoutube = !!videoId;
  const hasValidSpotify = !!spotifyEpisodeId;
  const canConfirm = youtubeDisabled ? hasValidSpotify : (hasValidYoutube || hasValidSpotify);

  const handleTestClick = () => {
    if (videoId) {
      setShowEmbed(true);
    }
  };

  const handleSpotifyTestClick = () => {
    if (spotifyEpisodeId) {
      setShowSpotifyEmbed(true);
    }
  };

  if (workerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-900" data-testid="loading-worker">
        <Loader2 className="w-10 h-10 animate-spin text-red-500" />
      </div>
    );
  }

  if (workerError || !worker) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-900 p-8" data-testid="error-invalid-link">
        <div className="text-center max-w-lg">
          <XCircle className="w-20 h-20 text-red-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold mb-3">Invalid or Expired Link</h1>
          <p className="text-lg text-gray-500">This review link is not valid. Please contact your administrator for a new link.</p>
        </div>
      </div>
    );
  }

  if (episodeLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-900" data-testid="loading-episode">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-red-500 mx-auto mb-4" />
          <p className="text-lg text-gray-500">Loading next episode...</p>
        </div>
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-900 p-8" data-testid="all-done">
        <div className="text-center max-w-lg">
          <Check className="w-20 h-20 text-green-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold mb-3">All Done!</h1>
          <p className="text-lg text-gray-500">There are no more episodes to review. Great work, {worker.name}!</p>
          {progress.total > 0 && (
            <p className="text-gray-400 mt-3">{progress.done} of {progress.total} episodes reviewed</p>
          )}
        </div>
      </div>
    );
  }

  const guests = parseGuests(episode.guests);
  const searchQuery = `${episode.podcastName} ${episode.episodeTitle}`;
  const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
  const youtubeChannelVideosUrl = episode.channelYoutubeUrl ? getYoutubeVideosUrl(episode.channelYoutubeUrl) : null;
  const spotifyShowUrl = episode.channelSpotifyUrl || `https://open.spotify.com/search/${encodeURIComponent(episode.podcastName)}`;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900" data-testid="youtube-review-page">
      <div className="shrink-0 bg-white border-b border-gray-200 px-8 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Youtube className="w-6 h-6 text-red-500" />
            <span className="text-base font-semibold text-gray-700">Hi, {worker.name}</span>
          </div>
          <div className="text-base text-gray-500" data-testid="text-progress">
            {progress.done}/{progress.total} reviewed — {remaining} remaining
          </div>
        </div>
        <div className="mt-2">
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden" data-testid="progress-bar">
            <div
              className="h-full bg-red-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6" data-testid="episode-metadata">
          <div className="flex gap-5 items-start">
            {episode.artworkUrl && (
              <img
                src={episode.artworkUrl}
                alt={episode.podcastName}
                className="w-20 h-20 rounded-xl shrink-0 object-cover"
                data-testid="img-artwork"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-red-500 uppercase tracking-wide" data-testid="text-podcast-name">{episode.podcastName}</p>
              <h2 className="text-xl font-bold leading-tight mt-1" data-testid="text-episode-title">{episode.episodeTitle}</h2>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-base text-gray-500">
                {episode.publishDate && <span data-testid="text-publish-date">{episode.publishDate}</span>}
                {episode.duration && <span data-testid="text-duration">{episode.duration}</span>}
                {episode.hosts && <span data-testid="text-hosts">Hosts: {episode.hosts}</span>}
              </div>
              {guests.length > 0 && (
                <p className="text-base text-gray-600 mt-1" data-testid="text-guests">
                  Guests: {guests.join(", ")}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6" data-testid="section-youtube">
            <div className="flex items-center gap-2 mb-4">
              <Youtube className="w-6 h-6 text-red-500" />
              <h3 className="text-lg font-bold text-gray-900">YouTube Video</h3>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 mb-5 text-sm">
              {youtubeChannelVideosUrl && (
                <button
                  onClick={() => openInNewWindow(youtubeChannelVideosUrl)}
                  className="inline-flex items-center gap-1.5 text-red-600 hover:text-red-700 hover:underline font-medium cursor-pointer bg-transparent border-none p-0"
                  data-testid="link-youtube-channel"
                >
                  <Youtube className="w-4 h-4" />
                  YouTube Channel
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => openInNewWindow(youtubeSearchUrl)}
                className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 hover:underline font-medium cursor-pointer bg-transparent border-none p-0"
                data-testid="link-search-youtube"
              >
                <Search className="w-4 h-4" />
                Search YouTube
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            {youtubeDisabled && (
              <p className="text-sm text-green-600 font-medium mb-3" data-testid="text-youtube-prefilled">
                ✓ Already has a YouTube URL — find the Spotify link instead
              </p>
            )}

            <div className="flex gap-3 mb-3">
              <input
                type="url"
                value={youtubeUrl}
                onChange={(e) => {
                  setYoutubeUrl(e.target.value);
                  setShowEmbed(false);
                }}
                disabled={youtubeDisabled}
                placeholder="https://www.youtube.com/watch?v=..."
                className="flex-1 h-12 px-4 bg-white border border-gray-300 rounded-lg text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500/60 disabled:bg-gray-100 disabled:text-gray-500"
                data-testid="input-youtube-url"
              />
              <button
                onClick={handleTestClick}
                disabled={!videoId || youtubeDisabled}
                className="h-12 px-5 bg-gray-100 border border-gray-300 rounded-lg flex items-center gap-2 text-base font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                data-testid="button-test-video"
              >
                <Play className="w-5 h-5" />
                Test
              </button>
            </div>

            {youtubeUrl && !videoId && !youtubeDisabled && (
              <p className="text-sm text-amber-600 mb-3" data-testid="text-invalid-url">Could not extract video ID from this URL. Please check the format.</p>
            )}

            {showEmbed && videoId && (
              <div className="w-full aspect-video rounded-lg overflow-hidden bg-black" data-testid="youtube-embed">
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}?rel=0`}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="YouTube video"
                />
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6" data-testid="section-spotify">
            <div className="flex items-center gap-2 mb-4">
              <SiSpotify className="w-5 h-5 text-green-500" />
              <h3 className="text-lg font-bold text-gray-900">Spotify Episode</h3>
              <span className="text-sm text-gray-400 ml-1">(optional)</span>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 mb-5 text-sm">
              <button
                onClick={() => openInNewWindow(spotifyShowUrl)}
                className="inline-flex items-center gap-1.5 text-green-600 hover:text-green-700 hover:underline font-medium cursor-pointer bg-transparent border-none p-0"
                data-testid="link-spotify-show"
              >
                <SiSpotify className="w-4 h-4" />
                {episode.channelSpotifyUrl ? "Spotify Show Page" : "Search Spotify"}
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex gap-3 mb-3">
              <input
                type="url"
                value={spotifyUrl}
                onChange={(e) => {
                  setSpotifyUrl(e.target.value);
                  setShowSpotifyEmbed(false);
                }}
                placeholder="https://open.spotify.com/episode/..."
                className="flex-1 h-12 px-4 bg-white border border-gray-300 rounded-lg text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/60"
                data-testid="input-spotify-url"
              />
              <button
                onClick={handleSpotifyTestClick}
                disabled={!spotifyEpisodeId}
                className="h-12 px-5 bg-gray-100 border border-gray-300 rounded-lg flex items-center gap-2 text-base font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                data-testid="button-test-spotify"
              >
                <Play className="w-5 h-5" />
                Test
              </button>
            </div>

            {spotifyUrl && !spotifyEpisodeId && (
              <p className="text-sm text-amber-600 mb-3" data-testid="text-invalid-spotify-url">Could not extract episode ID. Must be an open.spotify.com/episode/ URL.</p>
            )}

            {showSpotifyEmbed && spotifyEpisodeId && (
              <div className="w-full rounded-lg overflow-hidden" data-testid="spotify-embed">
                <iframe
                  src={`https://open.spotify.com/embed/episode/${spotifyEpisodeId}`}
                  className="w-full"
                  style={{ height: "180px" }}
                  allow="encrypted-media"
                  title="Spotify episode"
                />
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => submitAction("confirmed")}
              disabled={isSubmitting || !canConfirm}
              className="h-14 rounded-xl bg-green-600 hover:bg-green-500 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-lg flex items-center justify-center gap-2 transition-colors"
              data-testid="button-confirm"
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              Save & Next Episode
            </button>
            <button
              onClick={() => submitAction("skipped")}
              disabled={isSubmitting}
              className="h-14 rounded-xl bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 text-gray-700 font-bold text-lg flex items-center justify-center gap-2 transition-colors"
              data-testid="button-skip"
            >
              <SkipForward className="w-5 h-5" />
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
