import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Headphones, Users, BarChart3, TrendingUp, Award } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface Overview {
  totalPlays: number;
  avgCompletionRate: number;
  totalCompletions: number;
  uniqueListeners: number;
  totalEpisodesWithAudio: number;
  totalAudioHours: number;
}

interface PodcastBreakdown {
  podcast_slug: string;
  play_count: number;
  completion_count: number;
  unique_listeners: number;
  avg_percentage: number;
}

interface EpisodeBreakdown {
  podcast_slug: string;
  episode_slug: string;
  episode_title: string;
  podcast_name: string;
  play_count: number;
  completion_count: number;
  unique_listeners: number;
  avg_percentage: number;
}

interface CompletionFunnel {
  started: number;
  reached_25: number;
  reached_50: number;
  reached_75: number;
  reached_100: number;
  pct_25: number;
  pct_50: number;
  pct_75: number;
  pct_100: number;
}

interface PlaysOverTime {
  date: string;
  plays: number;
  completions: number;
  unique_listeners: number;
}

export default function AnalyticsElevenLabs() {
  const [granularity, setGranularity] = useState("daily");
  const [days, setDays] = useState(30);

  const { data: overview, isLoading: overviewLoading } = useQuery<Overview>({
    queryKey: ["/api/admin/audio-analytics/overview"],
  });

  const { data: byPodcast } = useQuery<PodcastBreakdown[]>({
    queryKey: ["/api/admin/audio-analytics/by-podcast"],
  });

  const { data: byEpisode } = useQuery<EpisodeBreakdown[]>({
    queryKey: ["/api/admin/audio-analytics/by-episode"],
  });

  const { data: playsData } = useQuery<PlaysOverTime[]>({
    queryKey: ["/api/admin/audio-analytics/plays-over-time", granularity, days],
    queryFn: async () => {
      const res = await fetch(`/api/admin/audio-analytics/plays-over-time?granularity=${granularity}&days=${days}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: funnel } = useQuery<CompletionFunnel>({
    queryKey: ["/api/admin/audio-analytics/completion-funnel"],
  });

  if (overviewLoading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="elevenlabs-analytics-loading">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const chartData = (playsData || []).map(d => ({
    date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    plays: d.plays,
    completions: d.completions,
  }));

  return (
    <div className="space-y-6" data-testid="elevenlabs-analytics">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="elevenlabs-overview-cards">
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Headphones className="w-4 h-4 text-violet-500" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total Plays</span>
          </div>
          <p className="text-xl font-bold text-foreground" data-testid="text-total-plays">{overview?.totalPlays || 0}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Avg Completion</span>
          </div>
          <p className="text-xl font-bold text-foreground" data-testid="text-avg-completion">{(overview?.avgCompletionRate || 0).toFixed(0)}%</p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unique Listeners</span>
          </div>
          <p className="text-xl font-bold text-foreground" data-testid="text-unique-listeners">{overview?.uniqueListeners || 0}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Audio Hours</span>
          </div>
          <p className="text-xl font-bold text-foreground" data-testid="text-audio-hours">{(overview?.totalAudioHours || 0).toFixed(1)}h</p>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-5" data-testid="plays-over-time-chart">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-foreground">Plays Over Time</h3>
          <div className="flex items-center gap-2">
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value)}
              className="text-xs px-2 py-1 border border-border rounded-lg bg-background"
              data-testid="select-granularity"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="text-xs px-2 py-1 border border-border rounded-lg bg-background"
              data-testid="select-date-range"
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
        </div>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No playback data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: "1px solid rgba(0,0,0,0.08)" }} />
              <Bar dataKey="plays" fill="hsl(263, 70%, 50%)" radius={[4, 4, 0, 0]} name="Plays" />
              <Bar dataKey="completions" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} name="Completions" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {funnel && funnel.started > 0 && (
        <div className="glass-panel rounded-2xl p-5" data-testid="completion-funnel">
          <h3 className="text-sm font-bold text-foreground mb-4">Completion Funnel</h3>
          <div className="space-y-3">
            {[
              { label: "Started", count: funnel.started, pct: 100 },
              { label: "Reached 25%", count: funnel.reached_25, pct: funnel.pct_25 },
              { label: "Reached 50%", count: funnel.reached_50, pct: funnel.pct_50 },
              { label: "Reached 75%", count: funnel.reached_75, pct: funnel.pct_75 },
              { label: "Completed", count: funnel.reached_100, pct: funnel.pct_100 },
            ].map((step) => (
              <div key={step.label} data-testid={`funnel-step-${step.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-foreground">{step.label}</span>
                  <span className="text-xs text-muted-foreground">{step.count} ({step.pct.toFixed(0)}%)</span>
                </div>
                <div className="w-full h-2 bg-black/[0.04] rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500/60 rounded-full" style={{ width: `${step.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-panel rounded-2xl p-5" data-testid="by-podcast-breakdown">
          <h3 className="text-sm font-bold text-foreground mb-3">By Podcast</h3>
          {!byPodcast || byPodcast.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No data</p>
          ) : (
            <div className="space-y-2">
              {byPodcast.map((row) => (
                <div key={row.podcast_slug} className="flex items-center justify-between py-1.5 border-b border-black/[0.04] last:border-0" data-testid={`podcast-row-${row.podcast_slug}`}>
                  <span className="text-xs font-semibold text-foreground">{row.podcast_slug}</span>
                  <span className="text-xs text-muted-foreground">{row.play_count} plays / {row.completion_count} completions</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-5" data-testid="by-episode-leaderboard">
          <h3 className="text-sm font-bold text-foreground mb-3">Top Episodes</h3>
          {!byEpisode || byEpisode.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No data</p>
          ) : (
            <div className="space-y-2">
              {byEpisode.slice(0, 10).map((row, i) => (
                <div key={`${row.podcast_slug}-${row.episode_slug}`} className="flex items-center gap-2 py-1.5 border-b border-black/[0.04] last:border-0" data-testid={`episode-row-${i}`}>
                  <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{row.episode_title || row.episode_slug}</p>
                    <p className="text-[10px] text-muted-foreground">{row.podcast_name || row.podcast_slug}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-foreground">{row.play_count} plays</p>
                    <p className="text-[10px] text-muted-foreground">{(row.avg_percentage || 0).toFixed(0)}% avg</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
