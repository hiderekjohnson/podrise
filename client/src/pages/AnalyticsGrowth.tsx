import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Users, UserPlus, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import AnalyticsFilters from "@/components/AnalyticsFilters";

interface GrowthData {
  totalUsers: number;
  periodSignups: number;
  growthRate: number;
  overTime: { period: string; newUsers: number; totalUsers: number }[];
}

function formatLabel(period: string) {
  return new Date(period).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

  const chartData = data.overTime.map(d => ({
    ...d,
    label: formatLabel(d.period),
  }));

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
            {chartData.length > 0 ? `+${chartData[chartData.length - 1].newUsers}` : "0"}
          </p>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6" data-testid="chart-cumulative-growth">
        <h3 className="text-sm font-bold text-foreground mb-4">Cumulative Growth</h3>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickLine={false} interval={chartData.length > 30 ? Math.floor(chartData.length / 15) : 0} />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="totalUsers"
                name="Total Users"
                stroke="#22c55e"
                strokeWidth={2}
                fill="url(#gradTotal)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="glass-panel rounded-2xl p-6" data-testid="chart-new-users">
        <h3 className="text-sm font-bold text-foreground mb-4">New Users Per Period</h3>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickLine={false} interval={chartData.length > 30 ? Math.floor(chartData.length / 15) : 0} />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="newUsers" name="New Users" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
