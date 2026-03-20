import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, DollarSign, Zap, Activity, Cpu, BarChart3, AlertTriangle, TrendingUp, Filter } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

const BUDGET_MONTHLY = 100;

interface UsageSummary {
  today: number;
  week: number;
  month: number;
  tokens_today: string;
  tokens_month: string;
  calls_today: number;
  calls_month: number;
}

interface DailyUsage {
  date: string;
  cost: string;
  tokens: string;
  calls: number;
}

interface FeatureUsage {
  feature: string;
  calls: number;
  tokens: string;
  cost: string;
}

interface ModelUsage {
  model: string;
  calls: number;
  tokens: string;
  cost: string;
}

interface RecapMetrics {
  total_api_calls: number;
  total_tokens: string;
  total_cost: number;
  avg_tokens_per_call: string;
  avg_cost_per_call: number;
  recaps_generated: number;
  recaps_today: number;
  cost_today: number;
  recaps_week: number;
  cost_week: number;
  recaps_month: number;
  cost_month: number;
}

interface OpenAIActualData {
  daily: { date: string; cost: number }[];
  summary: { today: number; week: number; month: number };
}

interface ServiceUsage {
  service: string;
  calls: number;
  tokens: string;
  cost: string;
}

interface EpisodeCost {
  podcast_slug: string;
  episode_slug: string;
  service: string;
  calls: number;
  cost: string;
}

interface PodcastCost {
  podcast_slug: string;
  calls: number;
  cost: string;
}

interface Projections {
  monthCost: number;
  dailyRate: number;
  projectedMonthly: number;
  burnRateTrend: string;
  costPerUser: number;
  avgCostPerEpisode: number;
}

function formatCost(val: number | string): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "$0.00";
  return `$${n.toFixed(4)}`;
}

function formatCostShort(val: number | string): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function formatTokens(val: number | string): string {
  const n = typeof val === "string" ? parseInt(String(val)) : val;
  if (isNaN(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function featureLabel(feature: string): string {
  return feature
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function ApiUsageDashboard() {
  const [serviceFilter, setServiceFilter] = useState("all");
  const [podcastFilter, setPodcastFilter] = useState("");

  const { data: summary, isLoading: summaryLoading } = useQuery<UsageSummary>({
    queryKey: ["/api/admin/api-usage/summary"],
  });

  const { data: daily, isLoading: dailyLoading } = useQuery<DailyUsage[]>({
    queryKey: ["/api/admin/api-usage/daily"],
  });

  const { data: byFeature, isLoading: featureLoading } = useQuery<FeatureUsage[]>({
    queryKey: ["/api/admin/api-usage/by-feature"],
  });

  const { data: byModel, isLoading: modelLoading } = useQuery<ModelUsage[]>({
    queryKey: ["/api/admin/api-usage/by-model"],
  });

  const { data: recaps, isLoading: recapsLoading } = useQuery<RecapMetrics>({
    queryKey: ["/api/admin/api-usage/recaps"],
  });

  const { data: openaiActual, isLoading: openaiLoading, error: openaiError } = useQuery<OpenAIActualData>({
    queryKey: ["/api/admin/api-usage/openai-actual"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: byService } = useQuery<ServiceUsage[]>({
    queryKey: ["/api/admin/api-usage/by-service", serviceFilter, podcastFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (serviceFilter !== "all") params.set("service", serviceFilter);
      if (podcastFilter) params.set("podcast", podcastFilter);
      const res = await fetch(`/api/admin/api-usage/by-service?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: byEpisode } = useQuery<EpisodeCost[]>({
    queryKey: ["/api/admin/api-usage/by-episode", serviceFilter, podcastFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (serviceFilter !== "all") params.set("service", serviceFilter);
      if (podcastFilter) params.set("podcast", podcastFilter);
      const res = await fetch(`/api/admin/api-usage/by-episode?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: byPodcast } = useQuery<PodcastCost[]>({
    queryKey: ["/api/admin/api-usage/by-podcast", serviceFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (serviceFilter !== "all") params.set("service", serviceFilter);
      const res = await fetch(`/api/admin/api-usage/by-podcast?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: projections } = useQuery<Projections>({
    queryKey: ["/api/admin/api-usage/projections"],
  });

  const { data: podcastsList } = useQuery<string[]>({
    queryKey: ["/api/admin/api-usage/podcasts-list"],
  });

  if (summaryLoading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="api-usage-loading">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const internalMonthCost = parseFloat(String(summary?.month || "0"));
  const openaiMonthCost = openaiActual?.summary?.month || 0;
  const actualMonthCost = openaiMonthCost > 0 ? openaiMonthCost : internalMonthCost;
  const budgetPercent = Math.min((actualMonthCost / BUDGET_MONTHLY) * 100, 100);

  const replitOther = {
    today: Math.max(0, (openaiActual?.summary?.today || 0) - parseFloat(String(summary?.today || "0"))),
    week: Math.max(0, (openaiActual?.summary?.week || 0) - parseFloat(String(summary?.week || "0"))),
    month: Math.max(0, openaiMonthCost - internalMonthCost),
  };

  const internalDailyMap = new Map<string, number>();
  (daily || []).forEach((d) => {
    const dateStr = typeof d.date === "string" && d.date.match(/^\d{4}-\d{2}-\d{2}/)
      ? d.date.substring(0, 10)
      : new Date(d.date).toISOString().split("T")[0];
    internalDailyMap.set(dateStr, parseFloat(d.cost) || 0);
  });

  const openaiDailyMap = new Map<string, number>();
  (openaiActual?.daily || []).forEach((d) => {
    openaiDailyMap.set(d.date, d.cost);
  });

  const allDatesSet = new Set<string>();
  internalDailyMap.forEach((_, k) => allDatesSet.add(k));
  openaiDailyMap.forEach((_, k) => allDatesSet.add(k));
  const chartData = Array.from(allDatesSet)
    .sort()
    .map((date) => {
      const openaiCost = openaiDailyMap.get(date) || 0;
      const internalCost = internalDailyMap.get(date) || 0;
      const gap = Math.max(0, openaiCost - internalCost);
      return {
        date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        openai: openaiCost,
        internal: internalCost,
        gap,
      };
    });

  const trendLabel: Record<string, string> = {
    increasing: "Increasing",
    decreasing: "Decreasing",
    stable: "Stable",
    insufficient_data: "Not enough data",
  };

  const trendColor: Record<string, string> = {
    increasing: "text-red-600",
    decreasing: "text-green-600",
    stable: "text-amber-600",
    insufficient_data: "text-muted-foreground",
  };

  return (
    <div className="space-y-6" data-testid="api-usage-dashboard">
      <div className="flex items-center gap-3 flex-wrap" data-testid="cost-filters">
        <div className="flex items-center gap-1 bg-black/[0.03] dark:bg-white/[0.06] rounded-xl p-1">
          {["all", "openai", "elevenlabs"].map((svc) => (
            <button
              key={svc}
              onClick={() => setServiceFilter(svc)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                serviceFilter === svc ? "bg-white dark:bg-zinc-800 text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`service-filter-${svc}`}
            >
              {svc === "all" ? "All Services" : svc.charAt(0).toUpperCase() + svc.slice(1)}
            </button>
          ))}
        </div>
        {podcastsList && podcastsList.length > 0 && (
          <select
            value={podcastFilter}
            onChange={(e) => setPodcastFilter(e.target.value)}
            className="text-xs px-3 py-1.5 border border-border rounded-lg bg-background"
            data-testid="podcast-filter"
          >
            <option value="">All Podcasts</option>
            {podcastsList.map((slug) => (
              <option key={slug} value={slug}>{slug}</option>
            ))}
          </select>
        )}
      </div>

      <div className="glass-panel rounded-2xl p-5" data-testid="api-usage-budget">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-foreground">
            Monthly Budget {openaiMonthCost > 0 ? "(OpenAI Actual)" : "(Internal Estimate)"}
          </h3>
          <span className="text-xs font-semibold text-muted-foreground">
            {formatCostShort(actualMonthCost)} / {formatCostShort(BUDGET_MONTHLY)}
          </span>
        </div>
        <div className="w-full h-3 bg-black/[0.06] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              budgetPercent > 80 ? "bg-red-500" : budgetPercent > 50 ? "bg-amber-500" : "bg-green-500"
            }`}
            style={{ width: `${budgetPercent}%` }}
            data-testid="budget-progress-bar"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          {budgetPercent.toFixed(1)}% used
        </p>
      </div>

      {projections && (
        <div className="glass-panel rounded-2xl p-5" data-testid="cost-projections">
          <h3 className="text-sm font-bold text-foreground mb-3">Projections & Burn Rate</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Daily Rate</p>
              <p className="text-sm font-bold text-foreground">{formatCostShort(projections.dailyRate)}/day</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Projected Monthly</p>
              <p className="text-sm font-bold text-foreground">{formatCostShort(projections.projectedMonthly)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Burn Rate Trend</p>
              <p className={`text-sm font-bold ${trendColor[projections.burnRateTrend] || "text-foreground"}`}>
                {trendLabel[projections.burnRateTrend] || projections.burnRateTrend}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cost per User</p>
              <p className="text-sm font-bold text-foreground">{formatCost(projections.costPerUser)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Cost / Episode</p>
              <p className="text-sm font-bold text-foreground" data-testid="text-avg-cost-per-episode">{formatCost(projections.avgCostPerEpisode)}</p>
            </div>
          </div>
        </div>
      )}

      {byService && byService.length > 0 && (
        <div className="glass-panel rounded-2xl p-5" data-testid="cost-by-service">
          <h3 className="text-sm font-bold text-foreground mb-3">Cost by Service (30 Days)</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {byService.map((row) => (
              <div key={row.service} className="bg-muted/20 rounded-xl p-3" data-testid={`service-cost-${row.service}`}>
                <p className="text-xs font-semibold text-muted-foreground uppercase">{row.service}</p>
                <p className="text-lg font-bold text-foreground">{formatCostShort(row.cost)}</p>
                <p className="text-xs text-muted-foreground">{row.calls} calls</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-blue-500" />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">OpenAI Actual</h2>
          {openaiLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        </div>

        {openaiError ? (
          <div className="glass-panel rounded-2xl p-4 flex items-center gap-3 text-amber-600" data-testid="openai-actual-error">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <p className="text-xs">Could not fetch OpenAI actual costs. Showing internal tracking only.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="openai-actual-summary">
            <div className="glass-panel rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-green-500" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Today</span>
              </div>
              <p className="text-xl font-bold text-foreground" data-testid="text-openai-cost-today">
                {formatCostShort(openaiActual?.summary?.today || 0)}
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Week</span>
              </div>
              <p className="text-xl font-bold text-foreground" data-testid="text-openai-cost-week">
                {formatCostShort(openaiActual?.summary?.week || 0)}
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-purple-500" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Month</span>
              </div>
              <p className="text-xl font-bold text-foreground" data-testid="text-openai-cost-month">
                {formatCostShort(openaiActual?.summary?.month || 0)}
              </p>
            </div>
          </div>
        )}
      </div>

      {openaiActual && !openaiError && (
        <div className="glass-panel rounded-2xl p-4 border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20" data-testid="replit-other-callout">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-foreground">Replit / Other Spend</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Difference between OpenAI actual bill and PodCap's internal tracking (other services using the same API key)
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Today</p>
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400" data-testid="text-other-cost-today">
                {formatCostShort(replitOther.today)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Week</p>
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400" data-testid="text-other-cost-week">
                {formatCostShort(replitOther.week)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Month</p>
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400" data-testid="text-other-cost-month">
                {formatCostShort(replitOther.month)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="glass-panel rounded-2xl p-5" data-testid="api-usage-daily-chart">
        <h3 className="text-sm font-bold text-foreground mb-4">Daily Spend Comparison (Last 30 Days)</h3>
        {dailyLoading && openaiLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No usage data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
              <Tooltip
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = {
                    openai: "OpenAI Actual",
                    internal: "PodCap Tracked",
                    gap: "Replit / Other",
                  };
                  return [`$${value.toFixed(4)}`, labels[name] || name];
                }}
                labelStyle={{ fontWeight: 600, fontSize: 12 }}
                contentStyle={{ borderRadius: 12, fontSize: 12, border: "1px solid rgba(0,0,0,0.08)" }}
              />
              <Legend
                formatter={(value: string) => {
                  const labels: Record<string, string> = {
                    openai: "OpenAI Actual",
                    internal: "PodCap Tracked",
                    gap: "Replit / Other",
                  };
                  return labels[value] || value;
                }}
                wrapperStyle={{ fontSize: 12 }}
              />
              {openaiActual ? (
                <>
                  <Bar dataKey="internal" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} stackId="stack" />
                  <Bar dataKey="gap" fill="#f59e0b" radius={[4, 4, 0, 0]} stackId="stack" />
                </>
              ) : (
                <Bar dataKey="internal" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Cpu className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">PodCap Internal Tracking</h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="api-usage-summary-cards">
          <div className="glass-panel rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-green-500" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Today</span>
            </div>
            <p className="text-xl font-bold text-foreground" data-testid="text-cost-today">
              {formatCostShort(summary?.today || 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {summary?.calls_today || 0} calls
            </p>
          </div>

          <div className="glass-panel rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Week</span>
            </div>
            <p className="text-xl font-bold text-foreground" data-testid="text-cost-week">
              {formatCostShort(summary?.week || 0)}
            </p>
          </div>

          <div className="glass-panel rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-purple-500" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Month</span>
            </div>
            <p className="text-xl font-bold text-foreground" data-testid="text-cost-month">
              {formatCostShort(summary?.month || 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {summary?.calls_month || 0} calls
            </p>
          </div>

          <div className="glass-panel rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tokens (30d)</span>
            </div>
            <p className="text-xl font-bold text-foreground" data-testid="text-tokens-month">
              {formatTokens(summary?.tokens_month || 0)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-panel rounded-2xl p-5" data-testid="api-usage-by-feature">
          <h3 className="text-sm font-bold text-foreground mb-3">By Feature (30 Days)</h3>
          {featureLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !byFeature || byFeature.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No data</p>
          ) : (
            <div className="space-y-2">
              {byFeature.map((row) => {
                const cost = parseFloat(row.cost) || 0;
                const maxCost = Math.max(...byFeature.map((r) => parseFloat(r.cost) || 0));
                const pct = maxCost > 0 ? (cost / maxCost) * 100 : 0;
                return (
                  <div key={row.feature} data-testid={`feature-row-${row.feature}`}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-semibold text-foreground">{featureLabel(row.feature)}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatCost(row.cost)} · {row.calls} calls
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-black/[0.04] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/60 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-5" data-testid="api-usage-by-model">
          <h3 className="text-sm font-bold text-foreground mb-3">By Model (30 Days)</h3>
          {modelLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !byModel || byModel.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No data</p>
          ) : (
            <div className="space-y-2">
              {byModel.map((row) => (
                <div key={row.model} className="flex items-center justify-between py-1.5 border-b border-black/[0.04] last:border-0" data-testid={`model-row-${row.model}`}>
                  <div className="flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-foreground">{row.model}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold text-foreground">{formatCost(row.cost)}</span>
                    <span className="text-xs text-muted-foreground ml-2">{formatTokens(row.tokens)} tokens</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {byEpisode && byEpisode.length > 0 && (
        <div className="glass-panel rounded-2xl p-5" data-testid="cost-by-episode">
          <h3 className="text-sm font-bold text-foreground mb-3">Per-Episode Costs (30 Days)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-black/[0.06]">
                  <th className="text-left py-2 font-semibold text-muted-foreground">Podcast</th>
                  <th className="text-left py-2 font-semibold text-muted-foreground">Episode</th>
                  <th className="text-left py-2 font-semibold text-muted-foreground">Service</th>
                  <th className="text-right py-2 font-semibold text-muted-foreground">Calls</th>
                  <th className="text-right py-2 font-semibold text-muted-foreground">Cost</th>
                </tr>
              </thead>
              <tbody>
                {byEpisode.slice(0, 20).map((row, i) => (
                  <tr key={i} className="border-b border-black/[0.03]" data-testid={`episode-cost-row-${i}`}>
                    <td className="py-1.5 text-foreground">{row.podcast_slug}</td>
                    <td className="py-1.5 text-foreground truncate max-w-[200px]">{row.episode_slug}</td>
                    <td className="py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${row.service === "elevenlabs" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>
                        {row.service}
                      </span>
                    </td>
                    <td className="py-1.5 text-right text-foreground">{row.calls}</td>
                    <td className="py-1.5 text-right font-semibold text-foreground">{formatCost(row.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {byPodcast && byPodcast.length > 0 && (
        <div className="glass-panel rounded-2xl p-5" data-testid="cost-by-podcast">
          <h3 className="text-sm font-bold text-foreground mb-3">Per-Podcast Costs (30 Days)</h3>
          <div className="space-y-2">
            {byPodcast.map((row) => {
              const cost = parseFloat(row.cost) || 0;
              const maxCost = Math.max(...byPodcast.map((r) => parseFloat(r.cost) || 0));
              const pct = maxCost > 0 ? (cost / maxCost) * 100 : 0;
              return (
                <div key={row.podcast_slug} data-testid={`podcast-cost-${row.podcast_slug}`}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-semibold text-foreground">{row.podcast_slug}</span>
                    <span className="text-xs text-muted-foreground">{formatCost(row.cost)} / {row.calls} calls</span>
                  </div>
                  <div className="w-full h-1.5 bg-black/[0.04] rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500/60 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="glass-panel rounded-2xl p-5" data-testid="api-usage-recaps">
        <h3 className="text-sm font-bold text-foreground mb-3">Recap Generation</h3>
        {recapsLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Recaps Today</p>
                <p className="text-sm font-bold text-foreground" data-testid="text-recap-today">
                  {recaps?.recaps_today || 0} recaps · {formatCostShort(recaps?.cost_today || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Recaps This Week</p>
                <p className="text-sm font-bold text-foreground" data-testid="text-recap-week">
                  {recaps?.recaps_week || 0} recaps · {formatCostShort(recaps?.cost_week || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Recaps This Month</p>
                <p className="text-sm font-bold text-foreground" data-testid="text-recap-month">
                  {recaps?.recaps_month || 0} recaps · {formatCostShort(recaps?.cost_month || 0)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-black/[0.04]">
              <div>
                <p className="text-xs text-muted-foreground">Total Cost (30d)</p>
                <p className="text-sm font-bold text-foreground" data-testid="text-recap-cost">
                  {formatCost(recaps?.total_cost || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Recaps Generated</p>
                <p className="text-sm font-bold text-foreground" data-testid="text-recap-count">
                  {recaps?.recaps_generated || 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg Cost / Call</p>
                <p className="text-sm font-bold text-foreground" data-testid="text-recap-avg-cost">
                  {formatCost(recaps?.avg_cost_per_call || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">API Calls (30d)</p>
                <p className="text-sm font-bold text-foreground" data-testid="text-recap-calls">
                  {recaps?.total_api_calls || 0}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
