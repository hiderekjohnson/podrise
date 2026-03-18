import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, SkipForward, XCircle, ExternalLink, Search, Loader2, Youtube } from "lucide-react";

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
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (reviewData?.youtubeResult?.url) {
      setYoutubeUrl(reviewData.youtubeResult.url);
    } else {
      setYoutubeUrl("");
    }
  }, [reviewData?.episode?.id]);

  const submitAction = useCallback(async (action: "confirmed" | "skipped" | "no_video") => {
    if (!reviewData?.episode) return;
    if (action === "confirmed" && !youtubeUrl) {
      toast({ title: "Enter a YouTube URL first", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      await apiRequest("POST", `/api/mturk/submit/${token}`, {
        episodeId: reviewData.episode.id,
        action,
        youtubeUrl: action === "confirmed" ? youtubeUrl : undefined,
      });
      setYoutubeUrl("");
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Submission failed";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }, [reviewData?.episode, youtubeUrl, token, refetch, toast]);

  const videoId = youtubeUrl ? parseYouTubeVideoId(youtubeUrl) : null;
  const episode = reviewData?.episode;
  const progress = reviewData?.progress || { done: 0, total: 0 };
  const remaining = Math.max(0, progress.total - progress.done);
  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  if (workerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white" data-testid="loading-worker">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
      </div>
    );
  }

  if (workerError || !worker) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white p-6" data-testid="error-invalid-link">
        <div className="text-center max-w-md">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Invalid or Expired Link</h1>
          <p className="text-zinc-400">This review link is not valid. Please contact your administrator for a new link.</p>
        </div>
      </div>
    );
  }

  if (episodeLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white" data-testid="loading-episode">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-red-500 mx-auto mb-3" />
          <p className="text-zinc-400">Loading next episode...</p>
        </div>
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white p-6" data-testid="all-done">
        <div className="text-center max-w-md">
          <Check className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">All Done!</h1>
          <p className="text-zinc-400">There are no more episodes to review. Great work, {worker.name}!</p>
          {progress.total > 0 && (
            <p className="text-zinc-500 mt-2 text-sm">{progress.done} of {progress.total} episodes reviewed</p>
          )}
        </div>
      </div>
    );
  }

  const guests = parseGuests(episode.guests);
  const searchQuery = `${episode.podcastName} ${episode.episodeTitle}`;
  const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;

  return (
    <div className="min-h-screen bg-zinc-950 text-white" data-testid="youtube-review-page">
      <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Youtube className="w-5 h-5 text-red-500" />
            <span className="text-sm font-semibold text-zinc-300">Hi, {worker.name}</span>
          </div>
          <div className="text-xs text-zinc-500" data-testid="text-progress">
            {progress.done} of {progress.total} done — {remaining} remaining
          </div>
        </div>
        <div className="max-w-2xl mx-auto mt-2">
          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden" data-testid="progress-bar">
            <div
              className="h-full bg-red-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {videoId ? (
          <div className="w-full aspect-video rounded-xl overflow-hidden bg-black" data-testid="youtube-embed">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?rel=0`}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="YouTube video"
            />
          </div>
        ) : (
          <div className="w-full aspect-video rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center gap-3" data-testid="no-video-placeholder">
            <Youtube className="w-12 h-12 text-zinc-700" />
            <p className="text-sm text-zinc-500">No video URL — paste one below or search YouTube</p>
          </div>
        )}

        <div className="flex gap-3 items-start" data-testid="episode-metadata">
          {episode.artworkUrl && (
            <img
              src={episode.artworkUrl}
              alt={episode.podcastName}
              className="w-16 h-16 rounded-lg shrink-0 object-cover"
              data-testid="img-artwork"
            />
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold text-red-400 uppercase tracking-wide" data-testid="text-podcast-name">{episode.podcastName}</p>
            <h2 className="text-lg font-bold leading-tight mt-0.5" data-testid="text-episode-title">{episode.episodeTitle}</h2>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-zinc-500">
              {episode.publishDate && <span data-testid="text-publish-date">{episode.publishDate}</span>}
              {episode.duration && <span data-testid="text-duration">{episode.duration}</span>}
              {episode.hosts && <span data-testid="text-hosts">Hosts: {episode.hosts}</span>}
            </div>
            {guests.length > 0 && (
              <p className="text-xs text-zinc-400 mt-1" data-testid="text-guests">
                Guests: {guests.join(", ")}
              </p>
            )}
          </div>
        </div>

        {episode.tldl && (
          <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800" data-testid="tldl-summary">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">TLDL</p>
            <p className="text-sm text-zinc-300 leading-relaxed">{episode.tldl}</p>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">YouTube URL</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 h-12 px-4 bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500/60"
              data-testid="input-youtube-url"
            />
            <a
              href={youtubeSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-12 px-4 bg-zinc-800 border border-zinc-700 rounded-xl flex items-center gap-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors shrink-0"
              data-testid="link-search-youtube"
            >
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">Search YouTube</span>
            </a>
          </div>
          {youtubeUrl && !videoId && (
            <p className="text-xs text-amber-400" data-testid="text-invalid-url">Could not extract video ID from this URL. Please check the format.</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2">
          <button
            onClick={() => submitAction("confirmed")}
            disabled={isSubmitting || !videoId}
            className="h-14 rounded-xl bg-green-600 hover:bg-green-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
            data-testid="button-confirm"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-5 h-5" />}
            Correct
          </button>
          <button
            onClick={() => submitAction("skipped")}
            disabled={isSubmitting}
            className="h-14 rounded-xl bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
            data-testid="button-skip"
          >
            <SkipForward className="w-5 h-5" />
            Skip
          </button>
          <button
            onClick={() => submitAction("no_video")}
            disabled={isSubmitting}
            className="h-14 rounded-xl bg-red-700 hover:bg-red-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
            data-testid="button-no-video"
          >
            <XCircle className="w-5 h-5" />
            No Video
          </button>
        </div>
      </div>
    </div>
  );
}
