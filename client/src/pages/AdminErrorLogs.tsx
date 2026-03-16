import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, AlertCircle, ChevronDown, ChevronUp, Clock, Hash, Monitor, User } from "lucide-react";

interface ErrorLogEntry {
  id: number;
  endpoint: string;
  httpStatus: number;
  errorMessage: string;
  friendlySummary: string;
  severity: string;
  method: string | null;
  userAgent: string | null;
  userId: number | null;
  occurrenceCount: number;
  firstOccurredAt: string;
  lastOccurredAt: string;
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
  return date.toLocaleDateString();
}

function SeverityBadge({ severity }: { severity: string }) {
  const classes = severity === "error"
    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  const Icon = severity === "error" ? AlertCircle : AlertTriangle;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${classes}`} data-testid={`badge-severity-${severity}`}>
      <Icon className="w-3 h-3" />
      {severity}
    </span>
  );
}

function StatusBadge({ status }: { status: number }) {
  let classes = "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  if (status >= 500) classes = "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  else if (status >= 400) classes = "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-bold ${classes}`} data-testid={`badge-status-${status}`}>
      {status}
    </span>
  );
}

function ErrorRow({ entry }: { entry: ErrorLogEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-black/[0.06] dark:border-white/[0.06] rounded-xl overflow-hidden" data-testid={`error-row-${entry.id}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-black/[0.01] dark:hover:bg-white/[0.02] transition-colors"
        data-testid={`button-expand-error-${entry.id}`}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-snug mb-1" data-testid={`text-summary-${entry.id}`}>
            {entry.friendlySummary}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <SeverityBadge severity={entry.severity} />
            <StatusBadge status={entry.httpStatus} />
            <span className="inline-flex items-center gap-1 font-mono text-[11px]">
              {entry.method} {entry.endpoint.length > 50 ? entry.endpoint.substring(0, 50) + "..." : entry.endpoint}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {entry.occurrenceCount > 1 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs font-bold" data-testid={`badge-count-${entry.id}`}>
              <Hash className="w-3 h-3" />
              {entry.occurrenceCount}x
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
            <Clock className="w-3 h-3" />
            {timeAgo(entry.lastOccurredAt)}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-black/[0.04] dark:border-white/[0.04] space-y-2" data-testid={`detail-error-${entry.id}`}>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Full endpoint</span>
              <p className="font-mono text-foreground break-all">{entry.method} {entry.endpoint}</p>
            </div>
            <div>
              <span className="text-muted-foreground">HTTP Status</span>
              <p className="font-mono text-foreground">{entry.httpStatus}</p>
            </div>
            <div>
              <span className="text-muted-foreground">First seen</span>
              <p className="text-foreground">{new Date(entry.firstOccurredAt).toLocaleString()}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Last seen</span>
              <p className="text-foreground">{new Date(entry.lastOccurredAt).toLocaleString()}</p>
            </div>
            {entry.userId && (
              <div className="flex items-center gap-1">
                <User className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground">User ID:</span>
                <span className="text-foreground font-mono">{entry.userId}</span>
              </div>
            )}
            {entry.userAgent && (
              <div className="col-span-2 flex items-start gap-1">
                <Monitor className="w-3 h-3 text-muted-foreground mt-0.5" />
                <div>
                  <span className="text-muted-foreground">User Agent</span>
                  <p className="text-foreground break-all text-[11px]">{entry.userAgent}</p>
                </div>
              </div>
            )}
          </div>
          <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/10 rounded-lg">
            <span className="text-xs text-muted-foreground block mb-1">Technical error message</span>
            <p className="text-xs font-mono text-red-700 dark:text-red-400 break-all" data-testid={`text-error-message-${entry.id}`}>
              {entry.errorMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminErrorLogs() {
  const [page, setPage] = useState(0);
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const pageSize = 50;

  const queryParams = new URLSearchParams();
  queryParams.set("limit", String(pageSize));
  queryParams.set("offset", String(page * pageSize));
  if (severityFilter) queryParams.set("severity", severityFilter);
  if (startDate) queryParams.set("startDate", new Date(startDate).toISOString());
  if (endDate) queryParams.set("endDate", new Date(endDate + "T23:59:59").toISOString());

  const { data, isLoading } = useQuery<{ logs: ErrorLogEntry[]; total: number }>({
    queryKey: ["/api/admin/error-logs", `?${queryParams.toString()}`],
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="error-logs-loading">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="admin-error-logs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-foreground">Error Log</h3>
          <span className="text-xs text-muted-foreground">({total} total)</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={severityFilter}
            onChange={(e) => { setSeverityFilter(e.target.value); setPage(0); }}
            className="text-xs border border-black/[0.08] dark:border-white/[0.08] rounded-lg px-3 py-1.5 bg-background text-foreground"
            data-testid="select-severity-filter"
          >
            <option value="">All severities</option>
            <option value="error">Errors only</option>
            <option value="warning">Warnings only</option>
          </select>
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(0); }}
            className="text-xs border border-black/[0.08] dark:border-white/[0.08] rounded-lg px-3 py-1.5 bg-background text-foreground"
            data-testid="input-start-date"
            placeholder="From"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(0); }}
            className="text-xs border border-black/[0.08] dark:border-white/[0.08] rounded-lg px-3 py-1.5 bg-background text-foreground"
            data-testid="input-end-date"
            placeholder="To"
          />
          {(startDate || endDate) && (
            <button
              onClick={() => { setStartDate(""); setEndDate(""); setPage(0); }}
              className="text-xs text-primary hover:underline font-medium"
              data-testid="button-clear-dates"
            >
              Clear dates
            </button>
          )}
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="error-logs-empty">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No errors logged yet</p>
          <p className="text-xs mt-1">Server errors will appear here when they occur.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((entry) => (
            <ErrorRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2" data-testid="error-logs-pagination">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-xs font-medium border border-black/[0.08] dark:border-white/[0.08] rounded-lg disabled:opacity-30"
            data-testid="button-prev-page"
          >
            Previous
          </button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-xs font-medium border border-black/[0.08] dark:border-white/[0.08] rounded-lg disabled:opacity-30"
            data-testid="button-next-page"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}