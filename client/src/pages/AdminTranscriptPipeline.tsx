import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, CheckCircle2, Clock, AlertTriangle, XCircle, ExternalLink, Zap, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";

interface PipelineRow {
  source: "transcript" | "queue_only";
  transcript_id: number | null;
  podcast_id: string;
  episode_guid: string | null;
  podcast_name: string;
  podcast_slug: string;
  episode_title: string;
  transcript_at: string | null;
  date_published: string | null;
  transcript_chars: number | null;
  queue_status: string | null;
  queue_attempts: number | null;
  queue_error: string | null;
  queued_at: string | null;
  queue_last_attempt: string | null;
  recap_id: number | null;
  episode_slug: string | null;
  recap_published: boolean | null;
  recap_at: string | null;
}

type OverallStatus = "complete" | "pending_recap" | "missed" | "queued" | "failed";

function getOverallStatus(row: PipelineRow): OverallStatus {
  if (row.recap_id) return "complete";
  if (row.transcript_at) {
    const threeDAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const fetchedMs = new Date(row.transcript_at).getTime();
    return fetchedMs > threeDAgo ? "pending_recap" : "missed";
  }
  if (row.queue_status === "failed") return "failed";
  return "queued";
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function formatKB(chars: number | null): string {
  if (!chars) return "";
  return `${Math.round(chars / 1000)}k chars`;
}

const STATUS_CONFIG: Record<OverallStatus, { label: string; color: string; icon: React.FC<{ className?: string }> }> = {
  complete:     { label: "Complete",     color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  pending_recap:{ label: "Pending Recap",color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",           icon: Clock },
  missed:       { label: "Missed",       color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",        icon: AlertTriangle },
  queued:       { label: "Queued",       color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",   icon: Radio },
  failed:       { label: "Failed",       color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",               icon: XCircle },
};

type FilterType = "all" | OverallStatus;

export default function AdminTranscriptPipeline() {
  const [days, setDays] = useState(7);
  const [filter, setFilter] = useState<FilterType>("all");

  const { data: rows = [], isLoading, isFetching } = useQuery<PipelineRow[]>({
    queryKey: ["/api/admin/pipeline-monitor", days],
    queryFn: () => fetch(`/api/admin/pipeline-monitor?days=${days}`).then(r => r.json()),
    refetchInterval: 60_000,
  });

  const withStatus = rows.map(r => ({ ...r, status: getOverallStatus(r) }));

  const counts: Record<OverallStatus | "all", number> = {
    all: withStatus.length,
    complete: withStatus.filter(r => r.status === "complete").length,
    pending_recap: withStatus.filter(r => r.status === "pending_recap").length,
    missed: withStatus.filter(r => r.status === "missed").length,
    queued: withStatus.filter(r => r.status === "queued").length,
    failed: withStatus.filter(r => r.status === "failed").length,
  };

  const visible = filter === "all" ? withStatus : withStatus.filter(r => r.status === filter);

  return (
    <div className="space-y-5" data-testid="pipeline-monitor">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Episode Pipeline</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Trace every episode from Taddy webhook → transcript → OpenAI → published recap</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="text-xs border rounded-lg px-2 py-1.5 bg-background"
            data-testid="pipeline-days-filter"
          >
            <option value={1}>Last 24h</option>
            <option value={3}>Last 3 days</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
          </select>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs h-8"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline-monitor"] })}
            data-testid="pipeline-refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-2">
        {(["all", "complete", "pending_recap", "missed", "queued", "failed"] as (FilterType)[]).map(s => {
          const cfg = s === "all" ? null : STATUS_CONFIG[s as OverallStatus];
          const isActive = filter === s;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              data-testid={`pipeline-filter-${s}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {cfg && <cfg.icon className="w-3 h-3" />}
              {s === "all" ? "All" : s === "pending_recap" ? "Pending" : cfg!.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isActive ? "bg-background/20" : "bg-muted"}`}>
                {counts[s]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No episodes found for this filter.</div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm" data-testid="pipeline-table">
            <thead>
              <tr className="bg-muted/40 border-b text-xs font-semibold text-muted-foreground">
                <th className="text-left px-4 py-3 w-24">Status</th>
                <th className="text-left px-4 py-3">Episode</th>
                <th className="text-left px-3 py-3 w-36">
                  <span className="flex items-center gap-1"><Zap className="w-3 h-3" />Webhook</span>
                </th>
                <th className="text-left px-3 py-3 w-40">
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Transcript</span>
                </th>
                <th className="text-left px-3 py-3 w-36">
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Recap</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((row, i) => {
                const cfg = STATUS_CONFIG[row.status];
                const Icon = cfg.icon;
                const hasWebhookThenQueue = !!row.queued_at;
                const directFromWebhook = !!row.transcript_at && !row.queued_at;

                return (
                  <tr key={`${row.transcript_id ?? row.episode_guid}-${i}`} className="hover:bg-muted/20 transition-colors" data-testid={`pipeline-row-${i}`}>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold ${cfg.color}`}>
                        <Icon className="w-3 h-3" />
                        {row.status === "pending_recap" ? "Pending" : cfg.label}
                      </span>
                    </td>

                    {/* Episode info */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm leading-snug line-clamp-2 max-w-xs" title={row.episode_title}>
                        {row.episode_title}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{row.podcast_name}</div>
                      {row.date_published && (
                        <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                          Ep. aired {formatTime(row.date_published)}
                        </div>
                      )}
                    </td>

                    {/* Stage 1: Webhook/Queue */}
                    <td className="px-3 py-3">
                      {hasWebhookThenQueue ? (
                        <div>
                          <div className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">Queued</div>
                          <div className="text-[11px] text-muted-foreground">{timeAgo(row.queued_at)}</div>
                          {row.queue_attempts != null && row.queue_attempts > 0 && (
                            <div className="text-[11px] text-muted-foreground">{row.queue_attempts} attempt{row.queue_attempts !== 1 ? "s" : ""}</div>
                          )}
                          {row.queue_error && (
                            <div className="text-[11px] text-red-500 mt-0.5 max-w-[130px] truncate" title={row.queue_error}>
                              {row.queue_error}
                            </div>
                          )}
                        </div>
                      ) : directFromWebhook ? (
                        <div>
                          <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Direct</div>
                          <div className="text-[11px] text-muted-foreground">Transcript ready immediately</div>
                        </div>
                      ) : row.source === "queue_only" ? (
                        <div>
                          <div className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">Queued</div>
                          <div className="text-[11px] text-muted-foreground">{timeAgo(row.queued_at)}</div>
                          {(row.queue_attempts ?? 0) > 0 && (
                            <div className="text-[11px] text-muted-foreground">{row.queue_attempts} attempt{row.queue_attempts !== 1 ? "s" : ""}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Stage 2: Transcript */}
                    <td className="px-3 py-3">
                      {row.transcript_at ? (
                        <div>
                          <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">✓ Received</div>
                          <div className="text-[11px] text-muted-foreground">{timeAgo(row.transcript_at)}</div>
                          {row.transcript_chars && (
                            <div className="text-[11px] text-muted-foreground/60">{formatKB(row.transcript_chars)}</div>
                          )}
                        </div>
                      ) : row.queue_status === "failed" ? (
                        <div>
                          <div className="text-[11px] font-semibold text-red-500">✗ Failed</div>
                          {row.queue_error && (
                            <div className="text-[11px] text-red-400 max-w-[140px] truncate" title={row.queue_error}>
                              {row.queue_error}
                            </div>
                          )}
                        </div>
                      ) : row.queue_status === "pending" ? (
                        <div>
                          <div className="text-[11px] font-semibold text-blue-500">⏳ Waiting</div>
                          {row.queue_last_attempt && (
                            <div className="text-[11px] text-muted-foreground">Last try {timeAgo(row.queue_last_attempt)}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Stage 3: Recap */}
                    <td className="px-3 py-3">
                      {row.recap_id ? (
                        <div>
                          <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">✓ Generated</div>
                          <div className="text-[11px] text-muted-foreground">{timeAgo(row.recap_at)}</div>
                          {row.episode_slug && row.podcast_slug ? (
                            <a
                              href={`/podcasts/${row.podcast_slug}/${row.episode_slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 mt-1 text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400 hover:underline"
                              data-testid={`pipeline-recap-link-${row.recap_id}`}
                            >
                              #{row.recap_id}
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <span className="text-[11px] font-mono font-bold text-muted-foreground">#{row.recap_id}</span>
                          )}
                        </div>
                      ) : row.transcript_at ? (
                        (() => {
                          const threeDAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
                          const withinWindow = new Date(row.transcript_at).getTime() > threeDAgo;
                          return withinWindow ? (
                            <div>
                              <div className="text-[11px] font-semibold text-blue-500">⏳ Pending</div>
                              <div className="text-[11px] text-muted-foreground">Scheduler will pick up</div>
                            </div>
                          ) : (
                            <div>
                              <div className="text-[11px] font-semibold text-amber-500">⚠ Missed</div>
                              <div className="text-[11px] text-muted-foreground">Outside 3-day window</div>
                            </div>
                          );
                        })()
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground text-center">
        Showing {visible.length} of {counts.all} episodes · auto-refreshes every 60s
      </p>
    </div>
  );
}
