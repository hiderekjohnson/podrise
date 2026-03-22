import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, CheckCircle2, Clock, AlertTriangle, XCircle, ExternalLink, Zap, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient } from "@/lib/queryClient";

interface PipelineStats {
  transcripts24h: number;
  transcripts1h: number;
  recaps24h: number;
  currentlyPending: number;
  errors24h: number;
  processingRate: string;
}

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
  complete:      { label: "Complete",  color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  pending_recap: { label: "Pending",   color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",             icon: Clock },
  missed:        { label: "Missed",    color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",          icon: AlertTriangle },
  queued:        { label: "Queued",    color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",     icon: Radio },
  failed:        { label: "Failed",    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",                 icon: XCircle },
};

type FilterType = "all" | OverallStatus;

function WebhookStage({ row }: { row: PipelineRow }) {
  const hasWebhookThenQueue = !!row.queued_at;
  const directFromWebhook = !!row.transcript_at && !row.queued_at;

  if (hasWebhookThenQueue || row.source === "queue_only") {
    return (
      <div>
        <span className="font-semibold text-purple-600 dark:text-purple-400">Queued</span>
        <span className="text-muted-foreground ml-1.5">{timeAgo(row.queued_at)}</span>
        {(row.queue_attempts ?? 0) > 0 && (
          <span className="text-muted-foreground ml-1.5">· {row.queue_attempts} attempt{row.queue_attempts !== 1 ? "s" : ""}</span>
        )}
        {row.queue_error && (
          <div className="text-red-500 text-[11px] mt-0.5 truncate" title={row.queue_error}>{row.queue_error}</div>
        )}
      </div>
    );
  }
  if (directFromWebhook) {
    return (
      <div>
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">Direct</span>
        <span className="text-muted-foreground ml-1.5">transcript ready immediately</span>
      </div>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

function TranscriptStage({ row }: { row: PipelineRow }) {
  if (row.transcript_at) {
    return (
      <div>
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">✓ Received</span>
        <span className="text-muted-foreground ml-1.5">{timeAgo(row.transcript_at)}</span>
        {row.transcript_chars && (
          <span className="text-muted-foreground/60 ml-1.5">· {formatKB(row.transcript_chars)}</span>
        )}
      </div>
    );
  }
  if (row.queue_status === "failed") {
    return (
      <div>
        <span className="font-semibold text-red-500">✗ Failed</span>
        {row.queue_error && (
          <div className="text-red-400 text-[11px] mt-0.5 truncate" title={row.queue_error}>{row.queue_error}</div>
        )}
      </div>
    );
  }
  if (row.queue_status === "pending") {
    return (
      <div>
        <span className="font-semibold text-blue-500">⏳ Waiting</span>
        {row.queue_last_attempt && (
          <span className="text-muted-foreground ml-1.5">last try {timeAgo(row.queue_last_attempt)}</span>
        )}
      </div>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

function RecapStage({ row }: { row: PipelineRow }) {
  if (row.recap_id) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">✓ Generated</span>
        <span className="text-muted-foreground">{timeAgo(row.recap_at)}</span>
        {row.episode_slug && row.podcast_slug ? (
          <a
            href={`/podcasts/${row.podcast_slug}/${row.episode_slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-mono font-bold text-blue-600 dark:text-blue-400 hover:underline"
            data-testid={`pipeline-recap-link-${row.recap_id}`}
          >
            #{row.recap_id}
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <span className="font-mono font-bold text-muted-foreground">#{row.recap_id}</span>
        )}
      </div>
    );
  }
  if (row.transcript_at) {
    const threeDAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const withinWindow = new Date(row.transcript_at).getTime() > threeDAgo;
    return withinWindow ? (
      <div>
        <span className="font-semibold text-blue-500">⏳ Pending</span>
        <span className="text-muted-foreground ml-1.5">scheduler will pick up</span>
      </div>
    ) : (
      <div>
        <span className="font-semibold text-amber-500">⚠ Missed</span>
        <span className="text-muted-foreground ml-1.5">outside 3-day window</span>
      </div>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

export default function AdminTranscriptPipeline() {
  const [days, setDays] = useState(7);
  const [filter, setFilter] = useState<FilterType>("all");

  const { data: stats, isLoading: statsLoading } = useQuery<PipelineStats>({
    queryKey: ["/api/admin/pipeline-stats"],
    queryFn: () => fetch("/api/admin/pipeline-stats").then(r => r.json()),
    refetchInterval: 60_000,
  });

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
    <div className="space-y-4" data-testid="pipeline-monitor">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">Episode Pipeline</h2>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
            Trace every episode from Taddy webhook → transcript → OpenAI → published recap
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="text-xs border rounded-lg px-2 py-1.5 bg-background"
            data-testid="pipeline-days-filter"
          >
            <option value={1}>24h</option>
            <option value={3}>3 days</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
          </select>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs h-8 px-2.5"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline-monitor"] });
              queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline-stats"] });
            }}
            data-testid="pipeline-refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      {statsLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2" data-testid="pipeline-stats-skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2" data-testid="pipeline-stats-bar">
          <div className="flex flex-col items-center justify-center border rounded-xl p-2.5 bg-card text-center gap-0.5" data-testid="stat-transcripts-24h">
            <span className="text-[10px] text-muted-foreground font-medium leading-tight">Transcripts 24h</span>
            <span className="text-xl font-bold tabular-nums">{stats.transcripts24h}</span>
          </div>
          <div className="flex flex-col items-center justify-center border rounded-xl p-2.5 bg-card text-center gap-0.5" data-testid="stat-transcripts-1h">
            <span className="text-[10px] text-muted-foreground font-medium leading-tight">Transcripts 1h</span>
            <span className="text-xl font-bold tabular-nums">{stats.transcripts1h}</span>
          </div>
          <div className="flex flex-col items-center justify-center border rounded-xl p-2.5 bg-card text-center gap-0.5" data-testid="stat-recaps-24h">
            <span className="text-[10px] text-muted-foreground font-medium leading-tight">Recaps (24h)</span>
            <span className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{stats.recaps24h}</span>
          </div>
          <div className="flex flex-col items-center justify-center border rounded-xl p-2.5 bg-card text-center gap-0.5" data-testid="stat-currently-pending">
            <span className="text-[10px] text-muted-foreground font-medium leading-tight">Pending now</span>
            <span className={`text-xl font-bold tabular-nums ${stats.currentlyPending > 10 ? "text-amber-500" : ""}`}>{stats.currentlyPending}</span>
          </div>
          <div className="flex flex-col items-center justify-center border rounded-xl p-2.5 bg-card text-center gap-0.5" data-testid="stat-errors-24h">
            <span className="text-[10px] text-muted-foreground font-medium leading-tight">Errors (24h)</span>
            <span className={`text-xl font-bold tabular-nums ${stats.errors24h > 0 ? "text-red-500" : ""}`}>{stats.errors24h}</span>
          </div>
          <div className="flex flex-col items-center justify-center border rounded-xl p-2.5 bg-card text-center gap-0.5" data-testid="stat-processing-rate">
            <span className="text-[10px] text-muted-foreground font-medium leading-tight">Rate (1h)</span>
            <span className="text-sm font-bold tabular-nums leading-tight">{stats.processingRate}</span>
          </div>
        </div>
      ) : null}

      {/* Filter pills — scrollable on mobile */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        {(["all", "complete", "pending_recap", "missed", "queued", "failed"] as FilterType[]).map(s => {
          const cfg = s === "all" ? null : STATUS_CONFIG[s as OverallStatus];
          const isActive = filter === s;
          const label = s === "all" ? "All" : s === "pending_recap" ? "Pending" : cfg!.label;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              data-testid={`pipeline-filter-${s}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap shrink-0 ${
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {cfg && <cfg.icon className="w-3 h-3" />}
              {label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isActive ? "bg-background/20" : "bg-muted"}`}>
                {counts[s]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No episodes found for this filter.</div>
      ) : (
        <div className="space-y-2" data-testid="pipeline-table">
          {visible.map((row, i) => {
            const cfg = STATUS_CONFIG[row.status];
            const Icon = cfg.icon;

            return (
              <div
                key={`${row.transcript_id ?? row.episode_guid}-${i}`}
                className="border rounded-xl p-3.5 bg-card hover:bg-muted/30 transition-colors"
                data-testid={`pipeline-row-${i}`}
              >
                {/* Top row: status badge + episode title */}
                <div className="flex items-start gap-2.5">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold shrink-0 mt-0.5 ${cfg.color}`}>
                    <Icon className="w-3 h-3" />
                    {cfg.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm leading-snug line-clamp-2">
                      {row.episode_title}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{row.podcast_name}</div>
                    {row.date_published && (
                      <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                        Aired {formatTime(row.date_published)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Pipeline stages */}
                <div className="mt-3 space-y-1.5 text-[12px]">
                  <div className="flex items-start gap-2">
                    <span className="flex items-center gap-1 text-muted-foreground w-24 shrink-0 pt-px">
                      <Zap className="w-3 h-3" />
                      Webhook
                    </span>
                    <div className="flex-1 min-w-0">
                      <WebhookStage row={row} />
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="flex items-center gap-1 text-muted-foreground w-24 shrink-0 pt-px">
                      <CheckCircle2 className="w-3 h-3" />
                      Transcript
                    </span>
                    <div className="flex-1 min-w-0">
                      <TranscriptStage row={row} />
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="flex items-center gap-1 text-muted-foreground w-24 shrink-0 pt-px">
                      <CheckCircle2 className="w-3 h-3" />
                      Recap
                    </span>
                    <div className="flex-1 min-w-0">
                      <RecapStage row={row} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground text-center">
        Showing {visible.length} of {counts.all} episodes · auto-refreshes every 60s
      </p>
    </div>
  );
}
