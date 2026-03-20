import { useState, useRef } from "react";
import { Play, Pause, Headphones } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface RecapAudioPlayerProps {
  podcastSlug: string;
  episodeSlug: string;
  compact?: boolean;
}

export function RecapAudioPlayer({ podcastSlug, episodeSlug, compact = false }: RecapAudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionIdRef = useRef<string>(`session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const sentCheckpoints = useRef<Set<number>>(new Set());

  const { data: audioData } = useQuery<{ audioUrl: string; duration: number; status: string }>({
    queryKey: ["/api/audio-recap", podcastSlug, episodeSlug],
    queryFn: async () => {
      const res = await fetch(`/api/audio-recap/${podcastSlug}/${episodeSlug}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!podcastSlug && !!episodeSlug,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const sendEvent = (eventType: string, percentageReached: number = 0) => {
    fetch("/api/audio-playback-event", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        podcastSlug,
        episodeSlug,
        eventType,
        percentageReached,
        sessionId: sessionIdRef.current,
      }),
    }).catch(() => {});
  };

  const handlePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      sendEvent("pause", progress);
    } else {
      audioRef.current.play();
      setShowPlayer(true);
      if (currentTime === 0) {
        sendEvent("play", 0);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const ct = audioRef.current.currentTime;
    const dur = audioRef.current.duration || 1;
    const pct = (ct / dur) * 100;
    setCurrentTime(ct);
    setDuration(dur);
    setProgress(pct);

    for (const checkpoint of [25, 50, 75, 100]) {
      if (pct >= checkpoint && !sentCheckpoints.current.has(checkpoint)) {
        sentCheckpoints.current.add(checkpoint);
        sendEvent("progress", checkpoint);
      }
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    sendEvent("complete", 100);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    audioRef.current.currentTime = pct * (audioRef.current.duration || 0);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  if (!audioData || audioData.status !== "ready") return null;

  if (compact) {
    return (
      <div className="flex items-center gap-2" data-testid={`recap-audio-player-compact-${episodeSlug}`}>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handlePlay(); }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-600 text-white text-[12px] font-semibold hover:bg-violet-700 transition-colors shrink-0"
          data-testid={`button-listen-compact-${episodeSlug}`}
        >
          {isPlaying ? <Pause className="w-3 h-3" /> : <Headphones className="w-3 h-3" />}
          {isPlaying ? "Pause" : "Listen"}
        </button>
        <audio
          ref={audioRef}
          src={audioData.audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onError={() => setIsPlaying(false)}
          preload="none"
        />
        {showPlayer && (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="text-[10px] text-[#A1A1AA] shrink-0 font-mono">{formatTime(currentTime)}</span>
            <div
              className="flex-1 h-1 bg-black/[0.06] dark:bg-white/[0.1] rounded-full cursor-pointer overflow-hidden"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSeek(e); }}
            >
              <div
                className="h-full bg-violet-600 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] text-[#A1A1AA] shrink-0 font-mono">{formatTime(duration)}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3" data-testid="recap-audio-player">
      <button
        onClick={handlePlay}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors shrink-0"
        data-testid="button-listen"
      >
        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
        {showPlayer ? (isPlaying ? "Pause" : "Play") : "Listen"}
      </button>
      <audio
        ref={audioRef}
        src={audioData.audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={() => setIsPlaying(false)}
        preload="none"
      />
      {showPlayer && (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs text-muted-foreground shrink-0 font-mono" data-testid="text-current-time">{formatTime(currentTime)}</span>
          <div
            className="flex-1 h-1.5 bg-black/[0.06] dark:bg-white/[0.1] rounded-full cursor-pointer overflow-hidden"
            onClick={handleSeek}
            data-testid="audio-progress-bar"
          >
            <div
              className="h-full bg-violet-600 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground shrink-0 font-mono" data-testid="text-duration">{formatTime(duration)}</span>
        </div>
      )}
    </div>
  );
}
