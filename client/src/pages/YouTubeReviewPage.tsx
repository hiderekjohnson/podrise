import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, SkipForward, XCircle, ExternalLink, Search, Loader2, Youtube, Play, ChevronDown, ChevronUp } from "lucide-react";
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
  tldl: string;
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

export default function YouTubeReviewPage() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";
  const { toast } = useToast();
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const [showSpotifyEmbed, setShowSpotifyEmbed] = useState(false);
  const [tldlExpanded, setTldlExpanded] = useState(false);
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
    setTldlExpanded(false);
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
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
      </div>
    );
  }

  if (workerError || !worker) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-900 p-6" data-testid="error-invalid-link">
        <div className="text-center max-w-md">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Invalid or Expired Link</h1>
          <p className="text-gray-500">This review link is not valid. Please contact your administrator for a new link.</p>
        </div>
      </div>
    );
  }

  if (episodeLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-900" data-testid="loading-episode">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-red-500 mx-auto mb-3" />
          <p className="text-gray-500">Loading next episode...</p>
        </div>
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-900 p-6" data-testid="all-done">
        <div className="text-center max-w-md">
          <Check className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">All Done!</h1>
          <p className="text-gray-500">There are no more episodes to review. Great work, {worker.name}!</p>
          {progress.total > 0 && (
            <p className="text-gray-400 mt-2 text-sm">{progress.done} of {progress.total} episodes reviewed</p>
          )}
        </div>
      </div>
    );
  }

  const guests = parseGuests(episode.guests);
  const searchQuery = `${episode.podcastName} ${episode.episodeTitle}`;
  const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
  const spotifyShowUrl = episode.channelSpotifyUrl || `https://open.spotify.com/search/${encodeURIComponent(episode.podcastName)}`;

  return (
    <div className="h-screen flex flex-col bg-white text-gray-900" data-testid="youtube-review-page">
      <div className="shrink-0 bg-gray-50 border-b border-gray-200 px-4 py-2">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Youtube className="w-4 h-4 text-red-500" />
            <span className="text-xs font-semibold text-gray-600">Hi, {worker.name}</span>
          </div>
          <div className="text-xs text-gray-400" data-testid="text-progress">
            {progress.done}/{progress.total} — {remaining} left
          </div>
        </div>
        <div className="max-w-3xl mx-auto mt-1">
          <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden" data-testid="progress-bar">
            <div
              className="h-full bg-red-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-4 py-3 flex flex-col gap-3">
          <div className="flex gap-3 items-start" data-testid="episode-metadata">
            {episode.artworkUrl && (
              <img
                src={episode.artworkUrl}
                alt={episode.podcastName}
                className="w-12 h-12 rounded-lg shrink-0 object-cover"
                data-testid="img-artwork"
              />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wide" data-testid="text-podcast-name">{episode.podcastName}</p>
              <h2 className="text-sm font-bold leading-tight mt-0.5" data-testid="text-episode-title">{episode.episodeTitle}</h2>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-400">
                {episode.publishDate && <span data-testid="text-publish-date">{episode.publishDate}</span>}
                {episode.duration && <span data-testid="text-duration">{episode.duration}</span>}
                {episode.hosts && <span data-testid="text-hosts">Hosts: {episode.hosts}</span>}
              </div>
              {guests.length > 0 && (
                <p className="text-xs text-gray-500 mt-0.5" data-testid="text-guests">
                  Guests: {guests.join(", ")}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {episode.channelYoutubeUrl && (
              <a
                href={episode.channelYoutubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 hover:underline"
                data-testid="link-youtube-channel"
              >
                <Youtube className="w-3 h-3" />
                YouTube Channel
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <a
              href={youtubeSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
              data-testid="link-search-youtube"
            >
              <Search className="w-3 h-3" />
              Search: {episode.podcastName} {episode.episodeTitle.length > 40 ? episode.episodeTitle.substring(0, 40) + "…" : episode.episodeTitle}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {episode.tldl && (
            <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-200" data-testid="tldl-summary">
              <button
                onClick={() => setTldlExpanded(!tldlExpanded)}
                className="w-full flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wide"
                data-testid="button-toggle-tldl"
              >
                TLDL
                {tldlExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {tldlExpanded && (
                <p className="text-xs text-gray-600 leading-relaxed mt-1.5">{episode.tldl}</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">YouTube URL</label>
            {youtubeDisabled && (
              <p className="text-xs text-green-600" data-testid="text-youtube-prefilled">Already has YouTube URL — find the Spotify link below</p>
            )}
            <div className="flex gap-2">
              <input
                type="url"
                value={youtubeUrl}
                onChange={(e) => {
                  setYoutubeUrl(e.target.value);
                  setShowEmbed(false);
                }}
                disabled={youtubeDisabled}
                placeholder="https://www.youtube.com/watch?v=..."
                className="flex-1 h-9 px-3 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500/60 disabled:bg-gray-100 disabled:text-gray-500"
                data-testid="input-youtube-url"
              />
              <button
                onClick={handleTestClick}
                disabled={!videoId || youtubeDisabled}
                className="h-9 px-3 bg-gray-100 border border-gray-300 rounded-lg flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                data-testid="button-test-video"
              >
                <Play className="w-3.5 h-3.5" />
                Test
              </button>
            </div>
            {youtubeUrl && !videoId && !youtubeDisabled && (
              <p className="text-xs text-amber-600" data-testid="text-invalid-url">Could not extract video ID from this URL. Please check the format.</p>
            )}
          </div>

          {showEmbed && videoId && (
            <div className="w-full aspect-video max-h-[280px] rounded-lg overflow-hidden bg-black" data-testid="youtube-embed">
              <iframe
                src={`https://www.youtube.com/embed/${videoId}?rel=0`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="YouTube video"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <SiSpotify className="w-3.5 h-3.5 text-green-500" />
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Spotify Episode URL</label>
              <span className="text-xs text-gray-400">(optional)</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-1.5">
              <a
                href={spotifyShowUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-green-600 hover:text-green-700 hover:underline"
                data-testid="link-spotify-show"
              >
                <SiSpotify className="w-3 h-3" />
                {episode.channelSpotifyUrl ? "Spotify Show Page" : `Search Spotify: ${episode.podcastName}`}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={spotifyUrl}
                onChange={(e) => {
                  setSpotifyUrl(e.target.value);
                  setShowSpotifyEmbed(false);
                }}
                placeholder="https://open.spotify.com/episode/..."
                className="flex-1 h-9 px-3 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/60"
                data-testid="input-spotify-url"
              />
              <button
                onClick={handleSpotifyTestClick}
                disabled={!spotifyEpisodeId}
                className="h-9 px-3 bg-gray-100 border border-gray-300 rounded-lg flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                data-testid="button-test-spotify"
              >
                <Play className="w-3.5 h-3.5" />
                Test
              </button>
            </div>
            {spotifyUrl && !spotifyEpisodeId && (
              <p className="text-xs text-amber-600" data-testid="text-invalid-spotify-url">Could not extract episode ID. Must be an open.spotify.com/episode/ URL.</p>
            )}
          </div>

          {showSpotifyEmbed && spotifyEpisodeId && (
            <div className="w-full rounded-lg overflow-hidden" data-testid="spotify-embed">
              <iframe
                src={`https://open.spotify.com/embed/episode/${spotifyEpisodeId}`}
                className="w-full"
                style={{ height: "152px" }}
                allow="encrypted-media"
                title="Spotify episode"
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 pt-1">
            <button
              onClick={() => submitAction("confirmed")}
              disabled={isSubmitting || !canConfirm}
              className="h-11 rounded-lg bg-green-600 hover:bg-green-500 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-sm flex items-center justify-center gap-1.5 transition-colors"
              data-testid="button-confirm"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Correct
            </button>
            <button
              onClick={() => submitAction("skipped")}
              disabled={isSubmitting}
              className="h-11 rounded-lg bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 text-gray-700 font-bold text-sm flex items-center justify-center gap-1.5 transition-colors"
              data-testid="button-skip"
            >
              <SkipForward className="w-4 h-4" />
              Skip
            </button>
            <button
              onClick={() => submitAction("no_video")}
              disabled={isSubmitting}
              className="h-11 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-sm flex items-center justify-center gap-1.5 transition-colors"
              data-testid="button-no-video"
            >
              <XCircle className="w-4 h-4" />
              No Video
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
