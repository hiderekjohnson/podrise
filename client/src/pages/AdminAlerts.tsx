import { useState, lazy, Suspense } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, AlertCircle, Bell, CheckCircle, Clock, Filter, ChevronDown, ChevronUp, Activity, RefreshCw, Loader2 } from "lucide-react";
const AdminEmailAlerts = lazy(() => import("./AdminEmailAlerts"));

interface AdminAlert {
  id: number;
  apiName: string;
  errorType: string;
  errorMessage: string;
  severity: string;
  recipientEmail: string;
  acknowledged: boolean;
  createdAt: string;
}

interface AlertStats {
  activeCritical: number;
  activeWarnings: number;
  last24h: number;
  last7d: number;
}

interface HealthStatus {
  recapStall: boolean;
  recentRecapCount: number;
  lastRecapAt: string | null;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function SeverityBadge({ severity }: { severity: string }) {
  const isCritical = severity === "critical";
  const classes = isCritical
    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  const Icon = isCritical ? AlertCircle : AlertTriangle;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold uppercase ${classes}`} data-testid={`badge-alert-severity-${severity}`}>
      <Icon className="w-3 h-3" />
      {severity}
    </span>
  );
}

function ApiBadge({ apiName }: { apiName: string }) {
  const colorMap: Record<string, string> = {
    "Taddy": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    "OpenAI": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    "Resend": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    "Spotify": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    "Recap Pipeline": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  };
  const classes = colorMap[apiName] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${classes}`} data-testid={`badge-alert-api-${apiName}`}>
      {apiName}
    </span>
  );
}

function AlertRow({ alert, onToggleAck }: { alert: AdminAlert; onToggleAck: (id: number, ack: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-colors ${
        alert.acknowledged
          ? "border-black/[0.04] dark:border-white/[0.04] opacity-60"
          : alert.severity === "critical"
          ? "border-red-200 dark:border-red-800/40"
          : "border-amber-200 dark:border-amber-800/40"
      }`}
      data-testid={`alert-row-${alert.id}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-black/[0.01] dark:hover:bg-white/[0.02] transition-colors"
        data-testid={`button-expand-alert-${alert.id}`}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-snug mb-1.5" data-testid={`text-alert-type-${alert.id}`}>
            {alert.errorType}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <SeverityBadge severity={alert.severity} />
            <ApiBadge apiName={alert.apiName} />
            {alert.acknowledged && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" data-testid={`badge-acknowledged-${alert.id}`}>
                <CheckCircle className="w-3 h-3" />
                Acknowledged
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-alert-time-${alert.id}`}>
              <Clock className="w-3 h-3" />
              {timeAgo(alert.createdAt)}
            </span>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-black/[0.04] dark:border-white/[0.04] bg-black/[0.01] dark:bg-white/[0.01]">
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wide mb-1">Error Message</p>
              <p className="text-sm text-foreground bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-lg p-3 font-mono text-xs leading-relaxed break-all" data-testid={`text-alert-message-${alert.id}`}>
                {alert.errorMessage}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Sent to: <strong className="text-foreground">{alert.recipientEmail}</strong></span>
              <span>{new Date(alert.createdAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })}</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleAck(alert.id, !alert.acknowledged);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                alert.acknowledged
                  ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
              }`}
              data-testid={`button-toggle-ack-${alert.id}`}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {alert.acknowledged ? "Mark Unacknowledged" : "Acknowledge"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminAlerts() {
  const { toast } = useToast();
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [apiFilter, setApiFilter] = useState<string>("");
  const [ackFilter, setAckFilter] = useState<string>("");

  const queryParams = new URLSearchParams();
  if (severityFilter) queryParams.set("severity", severityFilter);
  if (apiFilter) queryParams.set("apiName", apiFilter);
  if (ackFilter) queryParams.set("acknowledged", ackFilter);
  const qs = queryParams.toString();

  const { data, isLoading } = useQuery<{ alerts: AdminAlert[]; totalCount: number; stats: AlertStats }>({
    queryKey: ["/api/admin/alerts", qs],
    queryFn: async () => {
      const res = await fetch(`/api/admin/alerts${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch alerts");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: health } = useQuery<HealthStatus>({
    queryKey: ["/api/admin/alerts/health"],
    refetchInterval: 60000,
  });

  const toggleAckMutation = useMutation({
    mutationFn: ({ id, acknowledged }: { id: number; acknowledged: boolean }) =>
      apiRequest("PATCH", `/api/admin/alerts/${id}`, { acknowledged }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update alert.", variant: "destructive" });
    },
  });

  const ackAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/alerts/acknowledge-all"),
    onSuccess: (_, __, ___) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts"] });
      toast({ title: "Done", description: "All alerts acknowledged." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to acknowledge alerts.", variant: "destructive" });
    },
  });

  const alerts = data?.alerts || [];
  const stats = data?.stats;
  const apiNames = [...new Set(alerts.map(a => a.apiName))];

  return (
    <div className="space-y-8" data-testid="admin-alerts-page">

      {/* Email Alert Subscriptions */}
      <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}>
        <AdminEmailAlerts />
      </Suspense>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-border" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Alert Log</span>
        <div className="flex-1 border-t border-border" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-panel rounded-xl p-4 text-center" data-testid="stat-active-critical">
          <div className="flex items-center justify-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-2xl font-bold text-red-600">{stats?.activeCritical ?? 0}</span>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Active Critical</p>
        </div>
        <div className="glass-panel rounded-xl p-4 text-center" data-testid="stat-active-warnings">
          <div className="flex items-center justify-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-2xl font-bold text-amber-600">{stats?.activeWarnings ?? 0}</span>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Active Warnings</p>
        </div>
        <div className="glass-panel rounded-xl p-4 text-center" data-testid="stat-last-24h">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-blue-500" />
            <span className="text-2xl font-bold text-foreground">{stats?.last24h ?? 0}</span>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Last 24 Hours</p>
        </div>
        <div className="glass-panel rounded-xl p-4 text-center" data-testid="stat-last-7d">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-violet-500" />
            <span className="text-2xl font-bold text-foreground">{stats?.last7d ?? 0}</span>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Last 7 Days</p>
        </div>
      </div>

      {health?.recapStall && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl p-4 flex items-start gap-3" data-testid="recap-stall-banner">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Recap Pipeline Stalled</p>
            <p className="text-xs text-red-600 dark:text-red-400/80 mt-0.5">
              No new recaps in the last 6 hours.
              {health.lastRecapAt && (
                <> Last recap: {new Date(health.lastRecapAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })}</>
              )}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="w-3.5 h-3.5" />
          <span className="font-semibold">Filters:</span>
        </div>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="text-xs border border-black/[0.08] dark:border-white/[0.08] rounded-lg px-2.5 py-1.5 bg-white dark:bg-zinc-900 text-foreground"
          data-testid="select-severity-filter"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
        </select>
        <select
          value={apiFilter}
          onChange={(e) => setApiFilter(e.target.value)}
          className="text-xs border border-black/[0.08] dark:border-white/[0.08] rounded-lg px-2.5 py-1.5 bg-white dark:bg-zinc-900 text-foreground"
          data-testid="select-api-filter"
        >
          <option value="">All APIs</option>
          {["Taddy", "OpenAI", "Resend", "Spotify", "Recap Pipeline"].map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select
          value={ackFilter}
          onChange={(e) => setAckFilter(e.target.value)}
          className="text-xs border border-black/[0.08] dark:border-white/[0.08] rounded-lg px-2.5 py-1.5 bg-white dark:bg-zinc-900 text-foreground"
          data-testid="select-ack-filter"
        >
          <option value="">All Status</option>
          <option value="false">Unacknowledged</option>
          <option value="true">Acknowledged</option>
        </select>

        {(stats?.activeCritical ?? 0) + (stats?.activeWarnings ?? 0) > 0 && (
          <button
            onClick={() => ackAllMutation.mutate()}
            disabled={ackAllMutation.isPending}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 transition-colors"
            data-testid="button-acknowledge-all"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Acknowledge All
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center" data-testid="empty-alerts">
          <Bell className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-medium">No alerts found</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {severityFilter || apiFilter || ackFilter ? "Try adjusting your filters." : "All systems operating normally."}
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="alerts-list">
          {alerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onToggleAck={(id, ack) => toggleAckMutation.mutate({ id, acknowledged: ack })}
            />
          ))}
          {data && data.totalCount > alerts.length && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Showing {alerts.length} of {data.totalCount} alerts
            </p>
          )}
        </div>
      )}
    </div>
  );
}
