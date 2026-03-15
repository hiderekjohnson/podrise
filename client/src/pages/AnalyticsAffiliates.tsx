import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MousePointerClick, ShoppingBag, TrendingUp, ArrowUpDown } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";
import AnalyticsFilters from "@/components/AnalyticsFilters";

interface AffiliateData {
  totalClicks: number;
  uniqueProducts: number;
  topProduct: string | null;
  byProduct: { name: string; type: string; productId: number | null; clicks: number; lastClicked: string }[];
  byCategory: { type: string; count: number }[];
  overTime: { period: string; count: number }[];
}

type SortField = "clicks" | "name" | "type" | "lastClicked";
type SortDir = "asc" | "desc";

const CATEGORY_COLORS: Record<string, string> = {
  book: "#3b82f6",
  product: "#f59e0b",
};

function formatLabel(period: string) {
  return new Date(period).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AnalyticsAffiliates() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [granularity, setGranularity] = useState("daily");
  const [category, setCategory] = useState("all");
  const [sortField, setSortField] = useState<SortField>("clicks");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  params.set("granularity", granularity);
  if (category !== "all") params.set("category", category);

  const { data, isLoading, error } = useQuery<AffiliateData>({
    queryKey: ["/api/admin/analytics/affiliates", startDate, endDate, granularity, category],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/affiliates?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "clicks" ? "desc" : "asc");
    }
  }

  const sortedProducts = useMemo(() => {
    if (!data) return [];
    const items = [...data.byProduct];
    items.sort((a, b) => {
      let cmp = 0;
      if (sortField === "clicks") cmp = a.clicks - b.clicks;
      else if (sortField === "name") cmp = a.name.localeCompare(b.name);
      else if (sortField === "type") cmp = a.type.localeCompare(b.type);
      else if (sortField === "lastClicked") cmp = (new Date(a.lastClicked || 0).getTime()) - (new Date(b.lastClicked || 0).getTime());
      return sortDir === "asc" ? cmp : -cmp;
    });
    return items;
  }, [data, sortField, sortDir]);

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
        <p className="text-sm text-muted-foreground" data-testid="error-affiliates">Failed to load affiliate data. Try refreshing.</p>
      </div>
    );
  }

  const clickTrendData = data.overTime.map(d => ({
    ...d,
    label: formatLabel(d.period),
  }));

  let cumulativeCount = 0;
  const cumulativeTrendData = clickTrendData.map(d => {
    cumulativeCount += d.count;
    return { ...d, cumulative: cumulativeCount };
  });

  const categoryBarData = data.byCategory.map(c => ({
    name: c.type === "book" ? "Books" : "Products",
    count: c.count,
    type: c.type,
  }));

  function SortHeader({ field, label }: { field: SortField; label: string }) {
    const active = sortField === field;
    return (
      <th
        className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase cursor-pointer select-none hover:text-foreground transition-colors"
        onClick={() => toggleSort(field)}
        data-testid={`sort-${field}`}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <ArrowUpDown className={`w-3 h-3 ${active ? "text-primary" : "opacity-30"}`} />
          {active && <span className="text-[10px]">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>}
        </span>
      </th>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-display font-bold text-foreground" data-testid="heading-affiliates">Affiliate Performance</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-black/[0.03] dark:bg-white/[0.06] rounded-lg p-0.5">
            {["all", "book", "product"].map(c => (
              <button
                key={c}
                data-testid={`filter-category-${c}`}
                onClick={() => setCategory(c)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all capitalize ${
                  category === c
                    ? "bg-white dark:bg-zinc-800 text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c === "all" ? "All" : c === "book" ? "Books" : "Products"}
              </button>
            ))}
          </div>
          <AnalyticsFilters
            startDate={startDate} endDate={endDate} granularity={granularity}
            onStartDateChange={setStartDate} onEndDateChange={setEndDate} onGranularityChange={setGranularity}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-5" data-testid="stat-total-clicks">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <MousePointerClick className="w-4.5 h-4.5 text-primary" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Clicks</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{data.totalClicks}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5" data-testid="stat-unique-products">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <ShoppingBag className="w-4.5 h-4.5 text-emerald-500" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unique Items</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{data.uniqueProducts}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5" data-testid="stat-top-product">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <TrendingUp className="w-4.5 h-4.5 text-amber-500" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Item</span>
          </div>
          <p className="text-lg font-bold text-foreground truncate">{data.topProduct || "N/A"}</p>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6" data-testid="chart-click-trend">
        <h3 className="text-sm font-bold text-foreground mb-4">Affiliate Click Growth</h3>
        {cumulativeTrendData.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No click data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={cumulativeTrendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="gradClicks" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickLine={false} interval={cumulativeTrendData.length > 30 ? Math.floor(cumulativeTrendData.length / 15) : 0} />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="cumulative" name="Total Clicks" stroke="#6366f1" strokeWidth={2} fill="url(#gradClicks)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-6" data-testid="chart-clicks-per-period">
          <h3 className="text-sm font-bold text-foreground mb-4">Clicks Per Period</h3>
          {clickTrendData.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No click data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={clickTrendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickLine={false} interval={clickTrendData.length > 30 ? Math.floor(clickTrendData.length / 15) : 0} />
                <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="count" name="Clicks" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {categoryBarData.length > 0 && (
          <div className="glass-panel rounded-2xl p-6" data-testid="chart-category-breakdown">
            <h3 className="text-sm font-bold text-foreground mb-4">Clicks by Category</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryBarData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="count" name="Clicks" radius={[4, 4, 0, 0]}>
                  {categoryBarData.map((entry, i) => (
                    <Cell key={i} fill={CATEGORY_COLORS[entry.type] || "#9ca3af"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="glass-panel rounded-2xl p-6" data-testid="table-products">
        <h3 className="text-sm font-bold text-foreground mb-4">All Tracked Items</h3>
        {sortedProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No clicks tracked yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/[0.06] dark:border-white/[0.08]">
                  <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase w-8">#</th>
                  <SortHeader field="name" label="Name" />
                  <SortHeader field="type" label="Type" />
                  <SortHeader field="clicks" label="Clicks" />
                  <SortHeader field="lastClicked" label="Last Clicked" />
                </tr>
              </thead>
              <tbody>
                {sortedProducts.map((item, i) => (
                  <tr key={i} className="border-b border-black/[0.03] dark:border-white/[0.04]" data-testid={`product-row-${i}`}>
                    <td className="py-2 pr-3 text-xs font-bold text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-3 font-medium text-foreground truncate max-w-[200px]">{item.name}</td>
                    <td className="py-2 pr-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        item.type === "book" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      }`}>{item.type}</span>
                    </td>
                    <td className="py-2 pr-3 font-bold text-foreground tabular-nums">{item.clicks}</td>
                    <td className="py-2 text-muted-foreground text-xs">
                      {item.lastClicked
                        ? new Date(item.lastClicked).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
                        : "\u2014"}
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
