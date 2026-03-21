import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, MessageSquare, Headphones, ShoppingBag, Music, ExternalLink,
  Users, TrendingUp, ArrowUpDown, ChevronDown, ChevronUp, Clock,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { type LucideIcon } from "lucide-react";
import AnalyticsFilters from "@/components/AnalyticsFilters";

function formatDay(day: string) {
  return new Date(day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface KpiCardProps {
  icon: LucideIcon;
  color: string;
  label: string;
  value: string | number;
  sublabel?: string;
}

function KpiCard({ icon: Icon, color, label, value, sublabel }: KpiCardProps) {
  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sublabel && <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>}
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: () => void;
}

function SectionHeader({ title, icon: Icon, open, onToggle }: SectionHeaderProps) {
  return (
    <button
      className="w-full flex items-center justify-between gap-3 glass-panel rounded-2xl px-5 py-4 hover:bg-black/[0.02] transition-colors text-left"
      onClick={onToggle}
      data-testid={`section-toggle-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5 text-primary" />
        <span className="font-display font-bold text-foreground">{title}</span>
      </div>
      {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
    </button>
  );
}

interface TrendDatum {
  day: string;
  [key: string]: string | number;
}

interface TrendChartProps {
  data: TrendDatum[];
  dataKey: string;
  name: string;
  color: string;
  gradId: string;
}

function TrendChart({ data, dataKey, name, color, gradId }: TrendChartProps) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground italic py-6">No data yet</p>;
  const chartData = data.map((d) => ({ ...d, label: formatDay(d.day) }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          stroke="currentColor"
          opacity={0.4}
          tickLine={false}
          interval={chartData.length > 20 ? Math.floor(chartData.length / 10) : 0}
        />
        <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }} />
        <Area type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} fill={`url(#${gradId})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function buildParams(startDate: string, endDate: string): URLSearchParams {
  const p = new URLSearchParams();
  if (startDate) p.set("startDate", startDate);
  if (endDate) p.set("endDate", endDate);
  if (!startDate && !endDate) p.set("days", "30");
  return p;
}

interface AiChatData {
  totalQuestions: number;
  uniqueUsers: number;
  totalQuestionsAllTime: number;
  uniqueUsersAllTime: number;
  dailyTrend: TrendDatum[];
  topEpisodes: { episode_slug: string; podcast_slug: string; count: number }[];
  perUser: { user_id: number; email: string; question_count: number; last_active: string }[];
}

function AiChatSection({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [open, setOpen] = useState(true);
  const [sortField, setSortField] = useState<"question_count" | "last_active">("question_count");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading } = useQuery<AiChatData>({
    queryKey: ["/api/admin/analytics/features/ai-chat", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/features/ai-chat?${buildParams(startDate, endDate)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const sorted = [...(data?.perUser || [])].sort((a, b) => {
    if (sortField === "question_count") {
      return sortDir === "desc" ? b.question_count - a.question_count : a.question_count - b.question_count;
    }
    return sortDir === "desc"
      ? new Date(b.last_active).getTime() - new Date(a.last_active).getTime()
      : new Date(a.last_active).getTime() - new Date(b.last_active).getTime();
  });

  return (
    <div className="space-y-4" data-testid="section-ai-chat">
      <SectionHeader title="AI Chat" icon={MessageSquare} open={open} onToggle={() => setOpen(!open)} />
      {open && (
        <>
          {isLoading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard icon={MessageSquare} color="bg-violet-500/10 text-violet-500" label="Questions (Period)" value={data?.totalQuestions ?? 0} />
                <KpiCard icon={Users} color="bg-blue-500/10 text-blue-500" label="Users (Period)" value={data?.uniqueUsers ?? 0} />
                <KpiCard icon={Clock} color="bg-indigo-500/10 text-indigo-500" label="All-Time Questions" value={data?.totalQuestionsAllTime ?? 0} />
                <KpiCard icon={TrendingUp} color="bg-green-500/10 text-green-500" label="All-Time Users" value={data?.uniqueUsersAllTime ?? 0} />
              </div>
              <div className="glass-panel rounded-2xl p-5" data-testid="chart-ai-chat-trend">
                <h3 className="text-sm font-bold text-foreground mb-4">Daily Questions</h3>
                <TrendChart data={data?.dailyTrend ?? []} dataKey="count" name="Questions" color="#8b5cf6" gradId="gradAiChat" />
              </div>
              {(data?.topEpisodes || []).length > 0 && (
                <div className="glass-panel rounded-2xl p-5" data-testid="table-ai-chat-top-episodes">
                  <h3 className="text-sm font-bold text-foreground mb-3">Top Episodes by Chat Activity</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-black/[0.06]">
                          <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase">#</th>
                          <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase">Episode</th>
                          <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase">Podcast</th>
                          <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase">Questions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data!.topEpisodes.map((ep, i) => (
                          <tr key={i} className="border-b border-black/[0.03]" data-testid={`ai-chat-episode-row-${i}`}>
                            <td className="py-2 pr-3 text-xs font-bold text-muted-foreground">{i + 1}</td>
                            <td className="py-2 pr-3 text-xs font-medium text-foreground">{ep.episode_slug}</td>
                            <td className="py-2 pr-3 text-xs text-muted-foreground">{ep.podcast_slug}</td>
                            <td className="py-2 text-xs font-bold text-foreground">{ep.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {sorted.length > 0 && (
                <div className="glass-panel rounded-2xl p-5" data-testid="table-ai-chat-per-user">
                  <h3 className="text-sm font-bold text-foreground mb-3">Per User Breakdown</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-black/[0.06]">
                          <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase">User</th>
                          <th
                            className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase cursor-pointer select-none"
                            onClick={() => {
                              if (sortField === "question_count") setSortDir(d => d === "asc" ? "desc" : "asc");
                              else setSortField("question_count");
                            }}
                            data-testid="sort-question-count"
                          >
                            <span className="inline-flex items-center gap-1">Questions <ArrowUpDown className="w-3 h-3" /></span>
                          </th>
                          <th
                            className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase cursor-pointer select-none"
                            onClick={() => {
                              if (sortField === "last_active") setSortDir(d => d === "asc" ? "desc" : "asc");
                              else setSortField("last_active");
                            }}
                            data-testid="sort-last-active"
                          >
                            <span className="inline-flex items-center gap-1">Last Active <ArrowUpDown className="w-3 h-3" /></span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((u, i) => (
                          <tr key={i} className="border-b border-black/[0.03]" data-testid={`ai-chat-user-row-${i}`}>
                            <td className="py-2 pr-3 text-xs text-foreground truncate max-w-[200px]">{u.email || `User #${u.user_id}`}</td>
                            <td className="py-2 pr-3 text-xs font-bold text-foreground">{u.question_count}</td>
                            <td className="py-2 text-xs text-muted-foreground">
                              {u.last_active ? new Date(u.last_active).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

interface AudioData {
  totalPlays: number;
  uniqueListeners: number;
  completionRate: number;
  dailyTrend: TrendDatum[];
  topEpisodes: { episode_slug: string; podcast_slug: string; plays: number }[];
  perUser: { user_id: number; email: string; play_count: number }[];
}

function AudioSection({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [open, setOpen] = useState(true);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading } = useQuery<AudioData>({
    queryKey: ["/api/admin/analytics/features/audio", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/features/audio?${buildParams(startDate, endDate)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const sortedUsers = [...(data?.perUser || [])].sort((a, b) =>
    sortDir === "desc" ? b.play_count - a.play_count : a.play_count - b.play_count
  );

  return (
    <div className="space-y-4" data-testid="section-audio">
      <SectionHeader title="Audio Recaps" icon={Headphones} open={open} onToggle={() => setOpen(!open)} />
      {open && (
        <>
          {isLoading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <KpiCard icon={Headphones} color="bg-violet-500/10 text-violet-500" label="Total Plays" value={data?.totalPlays ?? 0} />
                <KpiCard icon={Users} color="bg-blue-500/10 text-blue-500" label="Unique Listeners" value={data?.uniqueListeners ?? 0} />
                <KpiCard icon={TrendingUp} color="bg-green-500/10 text-green-500" label="Completion Rate (≥80%)" value={`${data?.completionRate ?? 0}%`} />
              </div>
              <div className="glass-panel rounded-2xl p-5" data-testid="chart-audio-trend">
                <h3 className="text-sm font-bold text-foreground mb-4">Daily Play Events</h3>
                <TrendChart data={data?.dailyTrend ?? []} dataKey="plays" name="Plays" color="#8b5cf6" gradId="gradAudio" />
              </div>
              {(data?.topEpisodes || []).length > 0 && (
                <div className="glass-panel rounded-2xl p-5" data-testid="table-audio-top-episodes">
                  <h3 className="text-sm font-bold text-foreground mb-3">Top Episodes by Plays</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-black/[0.06]">
                          <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase">#</th>
                          <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase">Episode</th>
                          <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase">Podcast</th>
                          <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase">Plays</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data!.topEpisodes.map((ep, i) => (
                          <tr key={i} className="border-b border-black/[0.03]" data-testid={`audio-episode-row-${i}`}>
                            <td className="py-2 pr-3 text-xs font-bold text-muted-foreground">{i + 1}</td>
                            <td className="py-2 pr-3 text-xs font-medium text-foreground">{ep.episode_slug}</td>
                            <td className="py-2 pr-3 text-xs text-muted-foreground">{ep.podcast_slug}</td>
                            <td className="py-2 text-xs font-bold text-foreground">{ep.plays}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {sortedUsers.length > 0 && (
                <div className="glass-panel rounded-2xl p-5" data-testid="table-audio-per-user">
                  <h3 className="text-sm font-bold text-foreground mb-3">Per User Play Count</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-black/[0.06]">
                          <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase">User</th>
                          <th
                            className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase cursor-pointer select-none"
                            onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                            data-testid="sort-audio-play-count"
                          >
                            <span className="inline-flex items-center gap-1">Plays <ArrowUpDown className="w-3 h-3" /></span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedUsers.map((u, i) => (
                          <tr key={i} className="border-b border-black/[0.03]" data-testid={`audio-user-row-${i}`}>
                            <td className="py-2 pr-3 text-xs text-foreground truncate max-w-[200px]">{u.email || `User #${u.user_id}`}</td>
                            <td className="py-2 text-xs font-bold text-foreground">{u.play_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

interface ShopData {
  totalClicks: number;
  uniqueUsers: number;
  uniqueProducts: number;
  dailyTrend: TrendDatum[];
  topProducts: { product_name: string; product_type: string; clicks: number }[];
  bookmarksByProduct: { book_slug: string; saves: number }[];
}

function ShopSection({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [open, setOpen] = useState(true);

  const { data, isLoading } = useQuery<ShopData>({
    queryKey: ["/api/admin/analytics/features/shop", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/features/shop?${buildParams(startDate, endDate)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  return (
    <div className="space-y-4" data-testid="section-shop">
      <SectionHeader title="Pod Shop" icon={ShoppingBag} open={open} onToggle={() => setOpen(!open)} />
      {open && (
        <>
          {isLoading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <KpiCard icon={ShoppingBag} color="bg-amber-500/10 text-amber-500" label="Total Clicks" value={data?.totalClicks ?? 0} />
                <KpiCard icon={Users} color="bg-blue-500/10 text-blue-500" label="Unique Users" value={data?.uniqueUsers ?? 0} />
                <KpiCard icon={TrendingUp} color="bg-green-500/10 text-green-500" label="Unique Products" value={data?.uniqueProducts ?? 0} />
              </div>
              <div className="glass-panel rounded-2xl p-5" data-testid="chart-shop-trend">
                <h3 className="text-sm font-bold text-foreground mb-4">Daily Affiliate Clicks</h3>
                <TrendChart data={data?.dailyTrend ?? []} dataKey="clicks" name="Clicks" color="#f59e0b" gradId="gradShop" />
              </div>
              {(data?.topProducts || []).length > 0 && (
                <div className="glass-panel rounded-2xl p-5" data-testid="table-shop-top-products">
                  <h3 className="text-sm font-bold text-foreground mb-3">Top Products by Clicks</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-black/[0.06]">
                          <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase">#</th>
                          <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase">Product</th>
                          <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase">Type</th>
                          <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase">Clicks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data!.topProducts.map((p, i) => (
                          <tr key={i} className="border-b border-black/[0.03]" data-testid={`shop-product-row-${i}`}>
                            <td className="py-2 pr-3 text-xs font-bold text-muted-foreground">{i + 1}</td>
                            <td className="py-2 pr-3 text-xs font-medium text-foreground truncate max-w-[200px]">{p.product_name}</td>
                            <td className="py-2 pr-3">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${p.product_type === "book" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                                {p.product_type}
                              </span>
                            </td>
                            <td className="py-2 text-xs font-bold text-foreground">{p.clicks}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {(data?.bookmarksByProduct || []).length > 0 && (
                <div className="glass-panel rounded-2xl p-5" data-testid="table-shop-bookmarks">
                  <h3 className="text-sm font-bold text-foreground mb-3">Top Saved Books (All-Time)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-black/[0.06]">
                          <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase">#</th>
                          <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase">Book</th>
                          <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase">Saves</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data!.bookmarksByProduct.map((b, i) => (
                          <tr key={i} className="border-b border-black/[0.03]" data-testid={`shop-bookmark-row-${i}`}>
                            <td className="py-2 pr-3 text-xs font-bold text-muted-foreground">{i + 1}</td>
                            <td className="py-2 pr-3 text-xs font-medium text-foreground truncate max-w-[200px]">{b.book_slug}</td>
                            <td className="py-2 text-xs font-bold text-foreground">{b.saves}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

interface SpotifyData {
  connectedUsers: number;
  totalUsers: number;
  connectedPct: number;
  everConnected: number;
  totalImports: number;
  uniqueImporters: number;
  avgShowsImported: number;
  dailyTrend: TrendDatum[];
}

function SpotifySection({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [open, setOpen] = useState(true);

  const { data, isLoading } = useQuery<SpotifyData>({
    queryKey: ["/api/admin/analytics/features/spotify", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/features/spotify?${buildParams(startDate, endDate)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  return (
    <div className="space-y-4" data-testid="section-spotify">
      <SectionHeader title="Spotify Import" icon={Music} open={open} onToggle={() => setOpen(!open)} />
      {open && (
        <>
          {isLoading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <KpiCard
                  icon={Music}
                  color="bg-green-500/10 text-green-500"
                  label="Currently Connected"
                  value={data?.connectedUsers ?? 0}
                  sublabel={`${data?.connectedPct ?? 0}% of all users`}
                />
                <KpiCard
                  icon={Users}
                  color="bg-blue-500/10 text-blue-500"
                  label="Ever Connected (All-Time)"
                  value={data?.everConnected ?? 0}
                />
                <KpiCard icon={TrendingUp} color="bg-violet-500/10 text-violet-500" label="Total Imports (Period)" value={data?.totalImports ?? 0} />
                <KpiCard icon={Users} color="bg-indigo-500/10 text-indigo-500" label="Unique Importers (Period)" value={data?.uniqueImporters ?? 0} />
                <KpiCard icon={ShoppingBag} color="bg-amber-500/10 text-amber-500" label="Avg Shows / Import" value={data?.avgShowsImported ?? 0} />
              </div>
              <div className="glass-panel rounded-2xl p-5" data-testid="chart-spotify-trend">
                <h3 className="text-sm font-bold text-foreground mb-4">Daily Import Sessions</h3>
                <TrendChart data={data?.dailyTrend ?? []} dataKey="unique_importers" name="Unique Importers" color="#1DB954" gradId="gradSpotify" />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

const PLATFORM_COLORS: Record<string, string> = {
  spotify: "#1DB954",
  apple: "#9933CC",
  youtube: "#FF0000",
};

interface EpisodeLinksData {
  totalClicks: number;
  uniqueUsers: number;
  byPlatform: { platform: string; clicks: number }[];
  dailyTrend: TrendDatum[];
  topEpisodes: { episode_slug: string; podcast_slug: string; clicks: number }[];
  perUser: { user_id: number; email: string; click_count: number }[];
}

function EpisodeLinksSection({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [open, setOpen] = useState(true);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading } = useQuery<EpisodeLinksData>({
    queryKey: ["/api/admin/analytics/features/episode-links", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/features/episode-links?${buildParams(startDate, endDate)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const byPlatform = (data?.byPlatform || []).map((p) => ({
    ...p,
    name: p.platform ? p.platform.charAt(0).toUpperCase() + p.platform.slice(1) : "Unknown",
  }));

  const sortedUsers = [...(data?.perUser || [])].sort((a, b) =>
    sortDir === "desc" ? b.click_count - a.click_count : a.click_count - b.click_count
  );

  return (
    <div className="space-y-4" data-testid="section-episode-links">
      <SectionHeader title="Listen to Episode" icon={ExternalLink} open={open} onToggle={() => setOpen(!open)} />
      {open && (
        <>
          {isLoading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <KpiCard icon={ExternalLink} color="bg-blue-500/10 text-blue-500" label="Total Clicks" value={data?.totalClicks ?? 0} />
                <KpiCard icon={Users} color="bg-violet-500/10 text-violet-500" label="Unique Users" value={data?.uniqueUsers ?? 0} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-panel rounded-2xl p-5" data-testid="chart-episode-links-trend">
                  <h3 className="text-sm font-bold text-foreground mb-4">Daily Clicks</h3>
                  <TrendChart data={data?.dailyTrend ?? []} dataKey="clicks" name="Clicks" color="#3b82f6" gradId="gradEpLinks" />
                </div>
                {byPlatform.length > 0 && (
                  <div className="glass-panel rounded-2xl p-5" data-testid="chart-episode-links-platform">
                    <h3 className="text-sm font-bold text-foreground mb-4">Clicks by Platform</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={byPlatform} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickLine={false} />
                        <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }} />
                        <Bar dataKey="clicks" name="Clicks" radius={[4, 4, 0, 0]}>
                          {byPlatform.map((entry, i) => (
                            <Cell key={i} fill={PLATFORM_COLORS[entry.platform] || "#6366f1"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              {(data?.topEpisodes || []).length > 0 && (
                <div className="glass-panel rounded-2xl p-5" data-testid="table-episode-links-top">
                  <h3 className="text-sm font-bold text-foreground mb-3">Top Episodes</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-black/[0.06]">
                          <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase">#</th>
                          <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase">Episode</th>
                          <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase">Podcast</th>
                          <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase">Clicks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data!.topEpisodes.map((ep, i) => (
                          <tr key={i} className="border-b border-black/[0.03]" data-testid={`ep-link-episode-row-${i}`}>
                            <td className="py-2 pr-3 text-xs font-bold text-muted-foreground">{i + 1}</td>
                            <td className="py-2 pr-3 text-xs font-medium text-foreground">{ep.episode_slug}</td>
                            <td className="py-2 pr-3 text-xs text-muted-foreground">{ep.podcast_slug}</td>
                            <td className="py-2 text-xs font-bold text-foreground">{ep.clicks}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {sortedUsers.length > 0 && (
                <div className="glass-panel rounded-2xl p-5" data-testid="table-episode-links-per-user">
                  <h3 className="text-sm font-bold text-foreground mb-3">Per User Click Count</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-black/[0.06]">
                          <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase">User</th>
                          <th
                            className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase cursor-pointer select-none"
                            onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                            data-testid="sort-ep-link-click-count"
                          >
                            <span className="inline-flex items-center gap-1">Clicks <ArrowUpDown className="w-3 h-3" /></span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedUsers.map((u, i) => (
                          <tr key={i} className="border-b border-black/[0.03]" data-testid={`ep-link-user-row-${i}`}>
                            <td className="py-2 pr-3 text-xs text-foreground truncate max-w-[200px]">{u.email || `User #${u.user_id}`}</td>
                            <td className="py-2 text-xs font-bold text-foreground">{u.click_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function AnalyticsFeatures() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Feature Usage Analytics</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Track how users engage with AI Chat, Audio Recaps, Pod Shop, Spotify Import, and Episode Links.
          </p>
        </div>
        <AnalyticsFilters
          startDate={startDate}
          endDate={endDate}
          granularity="daily"
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onGranularityChange={() => {}}
        />
      </div>

      <AiChatSection startDate={startDate} endDate={endDate} />
      <AudioSection startDate={startDate} endDate={endDate} />
      <ShopSection startDate={startDate} endDate={endDate} />
      <SpotifySection startDate={startDate} endDate={endDate} />
      <EpisodeLinksSection startDate={startDate} endDate={endDate} />
    </div>
  );
}
