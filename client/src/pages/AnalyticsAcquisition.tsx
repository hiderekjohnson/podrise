import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Users, TrendingUp, MapPin } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import AnalyticsFilters from "@/components/AnalyticsFilters";

interface AcquisitionData {
  totalSignups: number;
  bySource: { source: string; count: number }[];
  byPodcast: { detail: string; source: string; count: number }[];
  overTime: { period: string; source: string; count: number }[];
  recentSignups: { id: number; email: string; signup_source: string | null; signup_source_detail: string | null; device_type: string | null; created_at: string | null }[];
}

const SOURCE_LABELS: Record<string, string> = {
  homepage: "Homepage",
  podcast_page: "Podcast Page",
  episode_page: "Episode Page",
  industry_page: "Industry Page",
  role_page: "Role Page",
  interest_page: "Interest Page",
  get_started: "Get Started",
  register_page: "Register Page",
  login_page: "Login Page",
  leaderboard: "Leaderboard",
  unknown: "Unknown",
};

const SOURCE_CHART_COLORS: Record<string, string> = {
  homepage: "#3b82f6",
  podcast_page: "#a855f7",
  episode_page: "#8b5cf6",
  industry_page: "#10b981",
  role_page: "#f59e0b",
  interest_page: "#ec4899",
  get_started: "#22c55e",
  register_page: "#6366f1",
  login_page: "#06b6d4",
  leaderboard: "#f97316",
  unknown: "#9ca3af",
};

const SOURCE_COLORS: Record<string, string> = {
  homepage: "bg-blue-500",
  podcast_page: "bg-purple-500",
  episode_page: "bg-violet-500",
  industry_page: "bg-emerald-500",
  role_page: "bg-amber-500",
  interest_page: "bg-pink-500",
  get_started: "bg-green-500",
  register_page: "bg-indigo-500",
  login_page: "bg-cyan-500",
  leaderboard: "bg-orange-500",
  unknown: "bg-gray-400",
};

const ALL_SOURCES = Object.keys(SOURCE_LABELS);

function formatLabel(period: string) {
  return new Date(period).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AnalyticsAcquisition() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [granularity, setGranularity] = useState("daily");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [podcastFilter, setPodcastFilter] = useState("all");

  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  params.set("granularity", granularity);

  const { data, isLoading, error } = useQuery<AcquisitionData>({
    queryKey: ["/api/admin/analytics/acquisition", startDate, endDate, granularity],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/acquisition?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const filteredData = useMemo(() => {
    if (!data) return data;
    let result = data;
    if (sourceFilter !== "all") {
      result = {
        ...result,
        bySource: result.bySource.filter(s => s.source === sourceFilter),
        byPodcast: sourceFilter === "podcast_page" || sourceFilter === "episode_page"
          ? result.byPodcast.filter(p => p.source === sourceFilter)
          : [],
        overTime: result.overTime.filter(t => t.source === sourceFilter),
        recentSignups: result.recentSignups.filter(s => (s.signup_source || "unknown") === sourceFilter),
        totalSignups: result.bySource.filter(s => s.source === sourceFilter).reduce((sum, s) => sum + s.count, 0),
      };
    }
    if (podcastFilter !== "all") {
      result = {
        ...result,
        byPodcast: result.byPodcast.filter(p => p.detail === podcastFilter),
        recentSignups: result.recentSignups.filter(s => s.signup_source_detail === podcastFilter),
        totalSignups: result.byPodcast.filter(p => p.detail === podcastFilter).reduce((sum, p) => sum + p.count, 0),
      };
    }
    return result;
  }, [data, sourceFilter, podcastFilter]);

  const availablePodcasts = useMemo(() => {
    if (!data) return [];
    return data.byPodcast.map(p => p.detail).filter((v, i, a) => a.indexOf(v) === i);
  }, [data]);

  const stackedChartData = useMemo(() => {
    if (!filteredData) return [];
    const groups: Record<string, Record<string, number>> = {};
    for (const item of filteredData.overTime) {
      const key = item.period;
      if (!groups[key]) groups[key] = {};
      groups[key][item.source] = (groups[key][item.source] || 0) + item.count;
    }
    const sourceSet = Array.from(new Set(filteredData.overTime.map(i => i.source)));
    return Object.entries(groups).map(([period, sources]) => ({
      label: formatLabel(period),
      ...sourceSet.reduce((acc, src) => ({ ...acc, [src]: sources[src] || 0 }), {} as Record<string, number>),
    }));
  }, [filteredData]);

  const activeSources = useMemo(() => {
    if (!filteredData) return [] as string[];
    return Array.from(new Set(filteredData.overTime.map(i => i.source)));
  }, [filteredData]);

  const sourceBarData = useMemo(() => {
    if (!filteredData) return [];
    return filteredData.bySource.map(s => ({
      name: SOURCE_LABELS[s.source] || s.source,
      count: s.count,
      source: s.source,
    }));
  }, [filteredData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data || !filteredData) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground" data-testid="error-acquisition">Failed to load acquisition data. Try refreshing.</p>
      </div>
    );
  }

  const topSource = filteredData.bySource[0];
  const availableSources = data.bySource.map(s => s.source);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground" data-testid="heading-acquisition">Where Users Come From</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Which pages and sources drive signups</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={sourceFilter}
            onChange={e => { setSourceFilter(e.target.value); setPodcastFilter("all"); }}
            className="h-8 px-2 text-xs font-semibold rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-zinc-900 text-foreground"
            data-testid="filter-source-type"
          >
            <option value="all">All Sources</option>
            {ALL_SOURCES.filter(s => availableSources.includes(s)).map(s => (
              <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
            ))}
          </select>
          {availablePodcasts.length > 0 && (
            <select
              value={podcastFilter}
              onChange={e => setPodcastFilter(e.target.value)}
              className="h-8 px-2 text-xs font-semibold rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-zinc-900 text-foreground max-w-[180px]"
              data-testid="filter-podcast"
            >
              <option value="all">All Podcasts</option>
              {availablePodcasts.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}
          <AnalyticsFilters
            startDate={startDate} endDate={endDate} granularity={granularity}
            onStartDateChange={setStartDate} onEndDateChange={setEndDate} onGranularityChange={setGranularity}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-5" data-testid="stat-total-signups">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-4.5 h-4.5 text-primary" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Signups</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{filteredData.totalSignups}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5" data-testid="stat-signups-period">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center">
              <TrendingUp className="w-4.5 h-4.5 text-green-500" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Sources</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{filteredData.bySource.length}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5" data-testid="stat-top-source">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <MapPin className="w-4.5 h-4.5 text-purple-500" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Source</span>
          </div>
          <p className="text-lg font-bold text-foreground truncate">{SOURCE_LABELS[topSource?.source || ""] || topSource?.source || "N/A"}</p>
          <p className="text-xs text-muted-foreground">{topSource?.count || 0} signups</p>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6" data-testid="chart-acquisition-trend">
        <h3 className="text-sm font-bold text-foreground mb-4">Signups by Source Over Time</h3>
        {stackedChartData.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={stackedChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                {activeSources.map(src => (
                  <linearGradient key={src} id={`grad-${src}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SOURCE_CHART_COLORS[src] || "#9ca3af"} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={SOURCE_CHART_COLORS[src] || "#9ca3af"} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickLine={false} interval={stackedChartData.length > 30 ? Math.floor(stackedChartData.length / 15) : 0} />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {activeSources.map(src => (
                <Area
                  key={src}
                  type="monotone"
                  dataKey={src}
                  name={SOURCE_LABELS[src] || src}
                  stackId="1"
                  stroke={SOURCE_CHART_COLORS[src] || "#9ca3af"}
                  strokeWidth={1.5}
                  fill={`url(#grad-${src})`}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-6" data-testid="chart-source-breakdown">
          <h3 className="text-sm font-bold text-foreground mb-4">Source Ranking</h3>
          {sourceBarData.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(sourceBarData.length * 36, 120)}>
              <BarChart data={sourceBarData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickLine={false} axisLine={false} width={100} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="count" name="Signups" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-6" data-testid="chart-podcast-drilldown">
          <h3 className="text-sm font-bold text-foreground mb-4">Top Podcast Sources</h3>
          {filteredData.byPodcast.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No podcast-driven signups yet</p>
          ) : (
            <div className="space-y-2">
              {filteredData.byPodcast.slice(0, 15).map((item, i) => (
                <div key={i} className="flex items-center justify-between py-1" data-testid={`podcast-source-${i}`}>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">{i + 1}</span>
                    <span className="text-sm font-medium text-foreground truncate">{item.detail}</span>
                  </div>
                  <span className="text-sm font-bold text-foreground tabular-nums ml-2">{item.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6" data-testid="table-recent-signups">
        <h3 className="text-sm font-bold text-foreground mb-4">Recent Signups</h3>
        {filteredData.recentSignups.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No signups yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/[0.06] dark:border-white/[0.08]">
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground uppercase">Email</th>
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground uppercase">Source</th>
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground uppercase">Detail</th>
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground uppercase">Device</th>
                  <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase">Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.recentSignups.slice(0, 20).map((user, i) => (
                  <tr key={i} className="border-b border-black/[0.03] dark:border-white/[0.04]" data-testid={`signup-row-${i}`}>
                    <td className="py-2 pr-4 font-medium text-foreground truncate max-w-[180px]">{user.email}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold text-white ${SOURCE_COLORS[user.signup_source || "unknown"] || "bg-gray-400"}`}>
                        {SOURCE_LABELS[user.signup_source || "unknown"] || user.signup_source || "Unknown"}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground text-xs">{user.signup_source_detail || "\u2014"}</td>
                    <td className="py-2 pr-4 text-muted-foreground text-xs capitalize">{user.device_type || "\u2014"}</td>
                    <td className="py-2 text-muted-foreground text-xs">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
