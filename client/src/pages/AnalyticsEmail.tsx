import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Mail, Eye, MousePointerClick, Clock, Send, TrendingUp, ExternalLink, ArrowUpDown } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import AnalyticsFilters from "@/components/AnalyticsFilters";

interface EmailData {
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  openRate: number;
  clickRate: number;
  avgTimeToOpenMinutes: number | null;
  trend: { period: string; sent: number; opened: number; clicked: number; openRate: number; clickRate: number }[];
  perEmail: { id: number; recipientEmail: string; subject: string; sentAt: string; openedAt: string | null; clickedAt: string | null; recapDate: string }[];
  topLinks: { url: string; clicks: number }[];
}

type EmailSortField = "sentAt" | "recipient" | "opened" | "clicked";
type SortDir = "asc" | "desc";

function formatLabel(period: string) {
  return new Date(period).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AnalyticsEmail() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [granularity, setGranularity] = useState("daily");
  const [sortField, setSortField] = useState<EmailSortField>("sentAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  params.set("granularity", granularity);

  const { data, isLoading, error } = useQuery<EmailData>({
    queryKey: ["/api/admin/analytics/email", startDate, endDate, granularity],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/email?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  function toggleSort(field: EmailSortField) {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "sentAt" ? "desc" : "asc");
    }
  }

  const sortedEmails = useMemo(() => {
    if (!data) return [];
    const items = [...data.perEmail];
    items.sort((a, b) => {
      let cmp = 0;
      if (sortField === "sentAt") cmp = new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime();
      else if (sortField === "recipient") cmp = a.recipientEmail.localeCompare(b.recipientEmail);
      else if (sortField === "opened") cmp = (a.openedAt ? 1 : 0) - (b.openedAt ? 1 : 0);
      else if (sortField === "clicked") cmp = (a.clickedAt ? 1 : 0) - (b.clickedAt ? 1 : 0);
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
        <p className="text-sm text-muted-foreground" data-testid="error-email">Failed to load email data. Try refreshing.</p>
      </div>
    );
  }

  const trendData = data.trend.map(d => ({
    ...d,
    label: formatLabel(d.period),
  }));

  function formatTimeToOpen(minutes: number | null): string {
    if (minutes === null) return "N/A";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  function truncateUrl(url: string, maxLen = 50): string {
    try {
      const u = new URL(url);
      const display = u.hostname + u.pathname;
      return display.length > maxLen ? display.substring(0, maxLen) + "\u2026" : display;
    } catch {
      return url.length > maxLen ? url.substring(0, maxLen) + "\u2026" : url;
    }
  }

  function EmailSortHeader({ field, label, align }: { field: EmailSortField; label: string; align?: string }) {
    const active = sortField === field;
    return (
      <th
        className={`${align === "center" ? "text-center" : "text-left"} py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase cursor-pointer select-none hover:text-foreground transition-colors`}
        onClick={() => toggleSort(field)}
        data-testid={`email-sort-${field}`}
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
        <h2 className="text-lg font-display font-bold text-foreground" data-testid="heading-email">Email Marketing</h2>
        <AnalyticsFilters
          startDate={startDate} endDate={endDate} granularity={granularity}
          onStartDateChange={setStartDate} onEndDateChange={setEndDate} onGranularityChange={setGranularity}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-panel rounded-2xl p-5" data-testid="stat-total-sent">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Send className="w-4.5 h-4.5 text-blue-500" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sent</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{data.totalSent}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5" data-testid="stat-open-rate">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center">
              <Eye className="w-4.5 h-4.5 text-green-500" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Open Rate</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{data.openRate}%</p>
          <p className="text-xs text-muted-foreground mt-1">{data.totalOpened} opened</p>
        </div>
        <div className="glass-panel rounded-2xl p-5" data-testid="stat-click-rate">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <MousePointerClick className="w-4.5 h-4.5 text-amber-500" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Click Rate</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{data.clickRate}%</p>
          <p className="text-xs text-muted-foreground mt-1">{data.totalClicked} clicked</p>
        </div>
        <div className="glass-panel rounded-2xl p-5" data-testid="stat-avg-open-time">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Clock className="w-4.5 h-4.5 text-purple-500" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg Open Time</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{formatTimeToOpen(data.avgTimeToOpenMinutes)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5" data-testid="stat-total-opened">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="w-4.5 h-4.5 text-emerald-500" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Opened</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{data.totalOpened}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-6" data-testid="chart-send-trend">
          <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-500" />
            Send Volume
          </h3>
          {trendData.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No emails sent yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickLine={false} interval={trendData.length > 30 ? Math.floor(trendData.length / 15) : 0} />
                <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="sent" name="Emails Sent" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-6" data-testid="chart-engagement-trend">
          <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
            <Eye className="w-4 h-4 text-green-500" />
            Engagement Trend
          </h3>
          {trendData.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No tracking data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickLine={false} interval={trendData.length > 30 ? Math.floor(trendData.length / 15) : 0} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="currentColor"
                  opacity={0.4}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                  formatter={(value: unknown) => [`${value}%`]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="openRate" name="Open Rate" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="clickRate" name="Click Rate" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-6" data-testid="table-per-email">
          <h3 className="text-sm font-bold text-foreground mb-4">Per-Email Performance</h3>
          {sortedEmails.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No sent emails</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black/[0.06] dark:border-white/[0.08]">
                    <EmailSortHeader field="sentAt" label="Date" />
                    <EmailSortHeader field="recipient" label="Recipient" />
                    <EmailSortHeader field="opened" label="Opened" align="center" />
                    <EmailSortHeader field="clicked" label="Clicked" align="center" />
                  </tr>
                </thead>
                <tbody>
                  {sortedEmails.slice(0, 30).map((email, i) => (
                    <tr key={i} className="border-b border-black/[0.03] dark:border-white/[0.04]" data-testid={`email-row-${i}`}>
                      <td className="py-1.5 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(email.sentAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      <td className="py-1.5 pr-3 text-xs font-medium text-foreground truncate max-w-[140px]">{email.recipientEmail}</td>
                      <td className="py-1.5 pr-3 text-center">
                        {email.openedAt ? (
                          <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Opened" />
                        ) : (
                          <span className="inline-block w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" title="Not opened" />
                        )}
                      </td>
                      <td className="py-1.5 text-center">
                        {email.clickedAt ? (
                          <span className="inline-block w-2 h-2 rounded-full bg-amber-500" title="Clicked" />
                        ) : (
                          <span className="inline-block w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" title="Not clicked" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-6" data-testid="table-top-links">
          <h3 className="text-sm font-bold text-foreground mb-4">Top Clicked Links</h3>
          {data.topLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No link clicks yet</p>
          ) : (
            <div className="space-y-2">
              {data.topLinks.map((link, i) => (
                <div key={i} className="flex items-center gap-2 py-1" data-testid={`top-link-${i}`}>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium text-foreground truncate flex-1" title={link.url}>
                    {truncateUrl(link.url)}
                  </span>
                  <span className="text-xs font-bold text-foreground tabular-nums shrink-0">{link.clicks}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
