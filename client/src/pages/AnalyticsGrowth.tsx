import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Users, UserPlus, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import AnalyticsFilters from "@/components/AnalyticsFilters";

interface GrowthData {
  totalUsers: number;
  periodSignups: number;
  growthRate: number;
  overTime: { period: string; newUsers: number; totalUsers: number }[];
}

export default function AnalyticsGrowth() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [granularity, setGranularity] = useState("daily");

  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  params.set("granularity", granularity);

  const { data, isLoading, error } = useQuery<GrowthData>({
    queryKey: ["/api/admin/analytics/growth", startDate, endDate, granularity],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/growth?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground" data-testid="error-growth">Failed to load growth data. Try refreshing.</p>
      </div>
    );
  }

  const maxTotal = Math.max(...data.overTime.map(d => d.totalUsers), 1);
  const maxNew = Math.max(...data.overTime.map(d => d.newUsers), 1);
  const displayData = data.overTime.slice(-30);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-display font-bold text-foreground" data-testid="heading-growth">User Growth</h2>
        <AnalyticsFilters
          startDate={startDate} endDate={endDate} granularity={granularity}
          onStartDateChange={setStartDate} onEndDateChange={setEndDate} onGranularityChange={setGranularity}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-5" data-testid="stat-total-users">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-4.5 h-4.5 text-primary" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Users</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{data.totalUsers}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5" data-testid="stat-period-signups">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center">
              <UserPlus className="w-4.5 h-4.5 text-green-500" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New This Period</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{data.periodSignups}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5" data-testid="stat-growth-rate">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="w-4.5 h-4.5 text-emerald-500" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Growth Rate</span>
          </div>
          <div className="flex items-center gap-1.5">
            <p className="text-3xl font-bold text-foreground">{data.growthRate}%</p>
            {data.growthRate > 0 ? (
              <ArrowUpRight className="w-5 h-5 text-green-500" />
            ) : data.growthRate < 0 ? (
              <ArrowDownRight className="w-5 h-5 text-red-500" />
            ) : null}
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-5" data-testid="stat-net-new">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <UserPlus className="w-4.5 h-4.5 text-blue-500" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Latest Period</span>
          </div>
          <p className="text-3xl font-bold text-foreground">
            {displayData.length > 0 ? `+${displayData[displayData.length - 1].newUsers}` : "0"}
          </p>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6" data-testid="chart-cumulative-growth">
        <h3 className="text-sm font-bold text-foreground mb-4">Cumulative Growth</h3>
        {displayData.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No data yet</p>
        ) : (
          <div className="space-y-1">
            {displayData.map((point, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5" data-testid={`growth-row-${i}`}>
                <span className="text-xs font-medium text-muted-foreground w-20 shrink-0">
                  {new Date(point.period).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
                </span>
                <div className="flex-1 h-2.5 bg-black/[0.04] dark:bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500/60 rounded-full transition-all"
                    style={{ width: `${(point.totalUsers / maxTotal) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-foreground w-16 text-right tabular-nums">
                  {point.totalUsers} total
                </span>
                {point.newUsers > 0 && (
                  <span className="text-xs font-semibold text-green-600 w-12 text-right">
                    +{point.newUsers}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-panel rounded-2xl p-6" data-testid="chart-new-users">
        <h3 className="text-sm font-bold text-foreground mb-4">New Users Per Period</h3>
        {displayData.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No data yet</p>
        ) : (
          <div className="space-y-1">
            {displayData.map((point, i) => (
              <div key={i} className="flex items-center gap-3 py-1" data-testid={`new-users-row-${i}`}>
                <span className="text-xs font-medium text-muted-foreground w-20 shrink-0">
                  {new Date(point.period).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
                </span>
                <div className="flex-1 h-2 bg-black/[0.04] dark:bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500/60 rounded-full transition-all"
                    style={{ width: `${(point.newUsers / maxNew) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-foreground w-10 text-right tabular-nums">
                  {point.newUsers}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
