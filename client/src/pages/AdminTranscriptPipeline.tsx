import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader2, CheckCircle2, Clock, AlertTriangle, XCircle,
  ExternalLink, Zap, Radio, ArrowDown, Activity,
  Copy, Check, ChevronDown, ChevronUp, Wrench, HelpCircle,
  RefreshCw, Search, Filter,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface PipelineStats {
  transcripts24h: number;
  transcripts1h: number;
  recaps24h: number;
  recaps1h: number;
  awaitingRecap: number;
  queuePending: number;
  transcriptFetchErrors24h: number;
  transcriptFetchErrors1h: number;
  transcriptRate: string;
  etaMinutes: string;
}

interface LiveCompleted {
  transcript_id: number;
  episode_title: string;
  transcript_at: string;
  podcast_name: string;
  podcast_slug: string;
  recap_id: number;
  episode_slug: string;
  recap_at: string;
}

interface LivePending {
  transcript_id: number;
  episode_title: string;
  podcast_id: string;
  episode_guid: string;
  transcript_at: string;
  transcript_chars: number | null;
  podcast_name: string;
  podcast_slug: string;
}

interface LiveData {
  recentlyCompleted: LiveCompleted[];
  pendingQueue: LivePending[];
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

function timeAgo(dateStr: string | null, now?: number): string {
  if (!dateStr) return "—";
  const diff = (now ?? Date.now()) - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function elapsed(dateStr: string | null, now?: number): string {
  if (!dateStr) return "—";
  const diff = (now ?? Date.now()) - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
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
  complete:      { label: "Complete", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  pending_recap: { label: "Pending",  color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",            icon: Clock },
  missed:        { label: "Missed",   color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",         icon: AlertTriangle },
  queued:        { label: "Queued",   color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",    icon: Radio },
  failed:        { label: "Failed",   color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",                icon: XCircle },
};

type FilterType = "all" | OverallStatus;

function WebhookStage({ row }: { row: PipelineRow }) {
  const hasQueue = !!row.queued_at || row.source === "queue_only";
  const direct = !!row.transcript_at && !row.queued_at;
  if (hasQueue) {
    return (
      <div>
        <span className="font-semibold text-purple-600 dark:text-purple-400">Queued</span>
        <span className="text-muted-foreground ml-1.5">{timeAgo(row.queued_at)}</span>
        {(row.queue_attempts ?? 0) > 0 && (
          <span className="text-muted-foreground ml-1.5">· {row.queue_attempts} attempt{row.queue_attempts !== 1 ? "s" : ""}</span>
        )}
        {row.queue_error && <div className="text-red-500 text-[11px] mt-0.5 truncate">{row.queue_error}</div>}
      </div>
    );
  }
  if (direct) {
    return <div><span className="font-semibold text-emerald-600 dark:text-emerald-400">Direct</span><span className="text-muted-foreground ml-1.5">transcript ready immediately</span></div>;
  }
  return <span className="text-muted-foreground">—</span>;
}

function TranscriptStage({ row }: { row: PipelineRow }) {
  if (row.transcript_at) {
    return (
      <div>
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">✓ Received</span>
        <span className="text-muted-foreground ml-1.5">{timeAgo(row.transcript_at)}</span>
        {row.transcript_chars && <span className="text-muted-foreground/60 ml-1.5">· {formatKB(row.transcript_chars)}</span>}
      </div>
    );
  }
  if (row.queue_status === "failed") {
    return <div><span className="font-semibold text-red-500">✗ Failed</span>{row.queue_error && <div className="text-red-400 text-[11px] mt-0.5 truncate">{row.queue_error}</div>}</div>;
  }
  if (row.queue_status === "pending") {
    return <div><span className="font-semibold text-blue-500">⏳ Waiting</span>{row.queue_last_attempt && <span className="text-muted-foreground ml-1.5">last try {timeAgo(row.queue_last_attempt)}</span>}</div>;
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
          <a href={`/podcasts/${row.podcast_slug}/${row.episode_slug}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-mono font-bold text-blue-600 dark:text-blue-400 hover:underline"
            data-testid={`pipeline-recap-link-${row.recap_id}`}>
            #{row.recap_id}<ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <span className="font-mono font-bold text-muted-foreground">#{row.recap_id}</span>
        )}
      </div>
    );
  }
  if (row.transcript_at) {
    const withinWindow = new Date(row.transcript_at).getTime() > Date.now() - 3 * 24 * 60 * 60 * 1000;
    return withinWindow
      ? <div><span className="font-semibold text-blue-500">⏳ Pending</span><span className="text-muted-foreground ml-1.5">scheduler will pick up</span></div>
      : <div><span className="font-semibold text-amber-500">⚠ Missed</span><span className="text-muted-foreground ml-1.5">outside 3-day window</span></div>;
  }
  return <span className="text-muted-foreground">—</span>;
}

function EpisodeCard({ row, index }: { row: PipelineRow & { status: OverallStatus }; index: number }) {
  const cfg = STATUS_CONFIG[row.status];
  const Icon = cfg.icon;
  return (
    <div className="border rounded-xl p-3.5 bg-card hover:bg-muted/30 transition-colors" data-testid={`pipeline-row-${index}`}>
      <div className="flex items-start gap-2.5">
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold shrink-0 mt-0.5 ${cfg.color}`}>
          <Icon className="w-3 h-3" />{cfg.label}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm leading-snug line-clamp-2">{row.episode_title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{row.podcast_name}</div>
          {row.date_published && <div className="text-[11px] text-muted-foreground/60 mt-0.5">Aired {formatTime(row.date_published)}</div>}
        </div>
      </div>
      <div className="mt-3 space-y-1.5 text-[12px]">
        {[
          { label: "Webhook", Icon: Zap, content: <WebhookStage row={row} /> },
          { label: "Transcript", Icon: CheckCircle2, content: <TranscriptStage row={row} /> },
          { label: "Recap", Icon: CheckCircle2, content: <RecapStage row={row} /> },
        ].map(({ label, Icon: I, content }) => (
          <div key={label} className="flex items-start gap-2">
            <span className="flex items-center gap-1 text-muted-foreground w-24 shrink-0 pt-px"><I className="w-3 h-3" />{label}</span>
            <div className="flex-1 min-w-0">{content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveView({ liveData, isLiveFetching, now }: { liveData: LiveData; isLiveFetching: boolean; now: number }) {
  const { recentlyCompleted, pendingQueue } = liveData;
  const prevCompletedIds = useRef<Set<number>>(new Set());
  const [newlyCompleted, setNewlyCompleted] = useState<Set<number>>(new Set());

  useEffect(() => {
    const currentIds = new Set(recentlyCompleted.map(r => r.recap_id));
    const fresh = new Set<number>();
    currentIds.forEach(id => { if (!prevCompletedIds.current.has(id)) fresh.add(id); });
    if (fresh.size > 0) {
      setNewlyCompleted(fresh);
      setTimeout(() => setNewlyCompleted(new Set()), 4000);
    }
    prevCompletedIds.current = currentIds;
  }, [recentlyCompleted]);

  return (
    <div className="space-y-4">
      {/* Recently Completed */}
      {recentlyCompleted.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Just Completed</span>
            <span className="text-[10px] text-muted-foreground">(last 2h)</span>
          </div>
          <div className="space-y-2">
            {recentlyCompleted.map(item => (
              <div
                key={item.recap_id}
                className={`border rounded-xl p-3 transition-all duration-1000 ${newlyCompleted.has(item.recap_id) ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30" : "bg-card border-emerald-200 dark:border-emerald-900/40"}`}
                data-testid={`live-completed-${item.recap_id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm leading-snug line-clamp-1">{item.episode_title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{item.podcast_name}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">✓ Recap done</div>
                    <div className="text-[11px] text-muted-foreground">{timeAgo(item.recap_at, now)}</div>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>Transcript received {timeAgo(item.transcript_at, now)}</span>
                  {item.episode_slug && item.podcast_slug && (
                    <a href={`/podcasts/${item.podcast_slug}/${item.episode_slug}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 hover:underline font-mono font-bold">
                      #{item.recap_id}<ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending queue */}
      {pendingQueue.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No episodes awaiting recap — all clear!</div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ArrowDown className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Awaiting Recap</span>
            <span className="text-[10px] text-muted-foreground">({pendingQueue.length} in scheduler queue · oldest first)</span>
          </div>
          <div className="space-y-2">
            {pendingQueue.map((item, i) => (
              <div
                key={item.transcript_id}
                className={`border rounded-xl p-3.5 transition-colors ${i === 0 ? "border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20" : "bg-card"}`}
                data-testid={`live-pending-${item.transcript_id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {i === 0 && (
                      <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">
                        ↑ Next to process
                      </div>
                    )}
                    <div className="font-semibold text-sm leading-snug line-clamp-2">{item.episode_title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{item.podcast_name}</div>
                  </div>
                  <div className="text-right shrink-0 min-w-[80px]">
                    <div className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                      {elapsed(item.transcript_at, now)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">waiting</div>
                    {i > 0 && <div className="text-[10px] text-muted-foreground mt-0.5">#{i + 1} in queue</div>}
                  </div>
                </div>
                <div className="mt-1.5 text-[11px] text-muted-foreground flex items-center gap-3">
                  <span>Transcript received {timeAgo(item.transcript_at, now)}</span>
                  {item.transcript_chars && <span>· {formatKB(item.transcript_chars)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground text-center">
        {isLiveFetching ? "Refreshing…" : "Auto-refreshes every 15s"}
      </p>
    </div>
  );
}

function StatGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-0.5">{title}</div>
      <div className="flex gap-2 flex-wrap">
        {children}
      </div>
    </div>
  );
}

function StatCard({
  label, value, subLabel, color, testId,
}: {
  label: string; value: string | number; subLabel?: string; color?: string; testId: string;
}) {
  return (
    <div className="flex flex-col justify-center border rounded-xl px-3 py-2.5 bg-card min-w-[90px]" data-testid={testId}>
      <span className="text-[10px] text-muted-foreground font-medium leading-tight">{label}</span>
      <span className={`text-xl font-bold tabular-nums leading-tight mt-0.5 ${color ?? ""}`}>{value}</span>
      {subLabel && <span className="text-[10px] text-muted-foreground/70 leading-tight">{subLabel}</span>}
    </div>
  );
}

export default function AdminTranscriptPipeline() {
  const [days, setDays] = useState(7);
  const [filter, setFilter] = useState<FilterType>("all");
  const [now, setNow] = useState(Date.now());
  const isLiveMode = filter === "pending_recap";

  // Tick every second for live elapsed timers
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { data: stats, isLoading: statsLoading } = useQuery<PipelineStats>({
    queryKey: ["/api/admin/pipeline-stats"],
    queryFn: () => fetch("/api/admin/pipeline-stats").then(r => r.json()),
    refetchInterval: 60_000,
  });

  const { data: schedulerHealth } = useQuery<{
    isRunning: boolean;
    lastRecapTime: string | null;
    minutesSinceLastRun: number | null;
    taddyRateUsed: number;
    taddyRateLimit: number;
  }>({
    queryKey: ["/api/admin/scheduler-health"],
    queryFn: () => fetch("/api/admin/scheduler-health").then(r => r.json()),
    refetchInterval: 15_000,
  });

  const { data: healthSnapshot } = useQuery<{
    webhooksLastFiveMin: number;
    transcriptsCompleted: number;
    transcriptsFailed: number;
    generationCompleted: number;
    generationTimedOut: number;
    validationFailed: number;
    lastBatchTime: string | null;
    lastBatchSuccess: number;
    lastBatchTimeout: number;
    lastBatchValidation: number;
  }>({
    queryKey: ["/api/admin/pipeline-health-snapshot"],
    queryFn: () => fetch("/api/admin/pipeline-health-snapshot").then(r => r.json()),
    refetchInterval: 30_000,
  });

  const { data: rows = [], isLoading } = useQuery<PipelineRow[]>({
    queryKey: ["/api/admin/pipeline-monitor", days],
    queryFn: () => fetch(`/api/admin/pipeline-monitor?days=${days}`).then(r => r.json()),
    refetchInterval: 60_000,
  });

  const { data: liveData, isFetching: isLiveFetching } = useQuery<LiveData>({
    queryKey: ["/api/admin/pipeline-live"],
    queryFn: () => fetch("/api/admin/pipeline-live").then(r => r.json()),
    refetchInterval: isLiveMode ? 15_000 : false,
    enabled: isLiveMode,
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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold">Episode Pipeline</h2>
            {schedulerHealth && (
              <>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                  schedulerHealth.isRunning
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                }`}
                data-testid="scheduler-status">
                  <span className={`w-2 h-2 rounded-full ${schedulerHealth.isRunning ? "bg-emerald-500" : "bg-red-500"}`} />
                  {schedulerHealth.isRunning ? "✓ Running" : "✗ Stopped"}
                  {schedulerHealth.minutesSinceLastRun !== null && (
                    <span className="text-[10px] text-muted-foreground ml-1">({schedulerHealth.minutesSinceLastRun}m ago)</span>
                  )}
                </div>
                {schedulerHealth.taddyRateLimit > 0 && (() => {
                  const pct = Math.round((schedulerHealth.taddyRateUsed / schedulerHealth.taddyRateLimit) * 100);
                  const isHigh = pct >= 80;
                  const isMed = pct >= 50;
                  return (
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                      isHigh ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        : isMed ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    }`} title="Taddy API calls in the last 60 seconds (limit: 180/min)" data-testid="taddy-rate-badge">
                      <span className={`w-1.5 h-1.5 rounded-full ${isHigh ? "bg-red-500" : isMed ? "bg-amber-500" : "bg-slate-400"}`} />
                      Taddy {schedulerHealth.taddyRateUsed}/{schedulerHealth.taddyRateLimit} req/min
                    </div>
                  );
                })()}
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
            Taddy webhook → transcript received → OpenAI recap → published
          </p>
        </div>
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="text-xs border rounded-lg px-2 py-1.5 bg-background shrink-0"
          data-testid="pipeline-days-filter"
        >
          <option value={1}>24h</option>
          <option value={3}>3 days</option>
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
        </select>
      </div>

      {/* Health Snapshot */}
      {healthSnapshot && <HealthSnapshot data={healthSnapshot} />}

      {/* Stage Distribution - NEW */}
      <StageDistribution counts={counts} />

      {/* Error Queue - NEW */}
      {counts.failed > 0 && <ErrorQueue rows={rows} />}

      {/* Queue Health - NEW */}
      <QueueHealth rows={rows} />

      {/* Comprehensive Pipeline Table - NEW */}
      <PipelineTable rows={rows} counts={counts} />

      {/* Support Prompt - Top & Prominent */}
      <SupportPrompt />

      {/* Stats — grouped by time window */}
      {statsLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : stats ? (
        <div className="space-y-3 border rounded-xl p-3.5 bg-card/50" data-testid="pipeline-stats-bar">
          <StatGroup title="Last 24 Hours">
            <StatCard label="Transcripts Received" value={stats.transcripts24h} testId="stat-transcripts-24h" />
            <StatCard label="Recaps Generated" value={stats.recaps24h} color="text-emerald-600 dark:text-emerald-400" testId="stat-recaps-24h" />
            <StatCard
              label="Transcript Fetch Errors"
              value={stats.transcriptFetchErrors24h}
              subLabel="Taddy fetch failures"
              color={stats.transcriptFetchErrors24h > 0 ? "text-red-500" : ""}
              testId="stat-errors-24h"
            />
          </StatGroup>

          <StatGroup title="Last Hour">
            <StatCard label="Transcripts Received" value={stats.transcripts1h} testId="stat-transcripts-1h" />
            <StatCard label="Recaps Completed" value={stats.recaps1h} color="text-emerald-600 dark:text-emerald-400" testId="stat-recaps-1h" />
            <StatCard label="Transcript Inbound Rate" value={stats.transcriptRate} subLabel="avg gap between arrivals" testId="stat-rate-1h" />
            <StatCard label="Transcript Fetch Errors" value={stats.transcriptFetchErrors1h} color={stats.transcriptFetchErrors1h > 0 ? "text-red-500" : ""} testId="stat-errors-1h" />
          </StatGroup>

          <StatGroup title="Right Now">
            <StatCard
              label="In Processing"
              value={stats.awaitingRecap}
              subLabel="transcript → recap"
              color={stats.awaitingRecap > 10 ? "text-amber-500" : ""}
              testId="stat-in-processing"
            />
            <StatCard
              label="ETA to Clear"
              value={stats.etaMinutes}
              subLabel="until all done"
              testId="stat-eta-clear"
            />
            <StatCard
              label="Queued for Transcript"
              value={stats.queuePending}
              subLabel="waiting on Taddy"
              testId="stat-queue-pending"
            />
          </StatGroup>
        </div>
      ) : null}

      {/* Divider + filter pills */}
      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Episode Feed</span>
          {isLiveMode && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE · refreshes every 15s
            </span>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
          {(["all", "complete", "pending_recap", "missed", "queued", "failed"] as FilterType[]).map(s => {
            const cfg = s === "all" ? null : STATUS_CONFIG[s as OverallStatus];
            const isActive = filter === s;
            const label = s === "all" ? "All" : s === "pending_recap" ? "Pending" : cfg!.label;
            return (
              <button
                key={s}
                onClick={() => {
                  setFilter(s);
                  if (s === "pending_recap") {
                    queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline-live"] });
                  }
                }}
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
      </div>

      {/* Feed content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : isLiveMode ? (
        liveData ? (
          <LiveView liveData={liveData} isLiveFetching={isLiveFetching} now={now} />
        ) : (
          <div className="flex items-center justify-center py-16">
            <Activity className="w-5 h-5 animate-pulse text-muted-foreground mr-2" />
            <span className="text-sm text-muted-foreground">Loading live feed…</span>
          </div>
        )
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No episodes found for this filter.</div>
      ) : (
        <>
          <div className="space-y-2" data-testid="pipeline-table">
            {visible.map((row, i) => <EpisodeCard key={`${row.transcript_id ?? row.episode_guid}-${i}`} row={row} index={i} />)}
          </div>
          <p className="text-[11px] text-muted-foreground text-center">
            Showing {visible.length} of {counts.all} episodes · auto-refreshes every 60s
          </p>
        </>
      )}
    </div>
  );
}

// NEW: Comprehensive Pipeline Table Component
interface PipelineTableProps {
  rows: PipelineRow[];
  counts: Record<string, number>;
}

function PipelineTable({ rows, counts }: PipelineTableProps) {
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [showFilter, setShowFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const [clearConfirm, setClearConfirm] = useState(false);

  const clearQueueMutation = useMutation({
    mutationFn: (podcast_id: string | null) =>
      apiRequest("POST", "/api/admin/pipeline/clear-queue", podcast_id ? { podcast_id } : {}),
    onSuccess: () => {
      setClearConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline-monitor"] });
    },
  });

  const retryAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/pipeline/retry-all", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline-monitor"] }),
  });

  const retryOneMutation = useMutation({
    mutationFn: (row: PipelineRow) =>
      apiRequest("POST", "/api/admin/pipeline/retry", {
        episode_guid: row.episode_guid,
        podcast_id: row.podcast_id,
        episode_title: row.episode_title,
      }),
    onSuccess: () => {
      setRetryingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline-monitor"] });
    },
  });

  // Compute stage counts from actual data
  const webhookCount = rows.filter(r => r.source === "queue_only" && r.queue_status === "pending").length;
  const fetchingCount = rows.filter(r => r.source === "queue_only" && r.queue_status === "fetching").length;
  const inQueueCount = rows.filter(r => getOverallStatus(r) === "pending_recap").length;
  const aiRecapCount = rows.filter(r => r.queue_status === "running").length;
  const publishedCount = rows.filter(r => getOverallStatus(r) === "complete").length;

  const stages = [
    { name: "Webhook",     count: webhookCount,   num: "1", circleClass: "border-2 border-indigo-300 text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-900" },
    { name: "Taddy fetch", count: fetchingCount,  num: "2", circleClass: "border-2 border-blue-300 text-blue-700 dark:text-blue-300 bg-white dark:bg-slate-900" },
    { name: "In queue",    count: inQueueCount,   num: "3", circleClass: "border-2 border-amber-300 text-amber-700 dark:text-amber-300 bg-white dark:bg-slate-900" },
    { name: "AI recap",    count: aiRecapCount,   num: "4", circleClass: "border-2 border-orange-300 text-orange-700 dark:text-orange-300 bg-white dark:bg-slate-900" },
    { name: "Published",   count: publishedCount, num: "5", circleClass: "border-2 border-emerald-400 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20" },
  ];

  const errorCount  = rows.filter(r => getOverallStatus(r) === "failed").length;
  const metricCards = [
    { label: "Queue depth",     value: inQueueCount,             sub: "episodes waiting",  valClass: "text-slate-900 dark:text-white" },
    { label: "Processing",      value: aiRecapCount,             sub: "AI recap active",   valClass: "text-indigo-600 dark:text-indigo-400" },
    { label: "Errors",          value: errorCount,               sub: "need attention",    valClass: "text-red-600 dark:text-red-400" },
    { label: "Published today", value: publishedCount,           sub: "episodes live",     valClass: "text-emerald-600 dark:text-emerald-400" },
    { label: "Fetching",        value: fetchingCount,            sub: "from Taddy",        valClass: "text-slate-600 dark:text-slate-400" },
    { label: "Pending",         value: webhookCount,             sub: "webhook only",      valClass: "text-slate-600 dark:text-slate-400" },
  ];

  // Helpers
  const ageMinutes = (dateStr: string | null) => {
    if (!dateStr) return null;
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  };

  const formatAge = (mins: number | null) => {
    if (mins === null) return "—";
    if (mins < 60) return `${mins}m ago`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return `${h}h${m > 0 ? ` ${m}m` : ""} ago`;
  };

  const formatDur = (chars: number | null) => {
    if (!chars) return "—";
    return `${Math.round(chars / 900)}m`;
  };

  const stageBadge = (status: OverallStatus) => {
    const cfg: Record<OverallStatus, { dot: string; label: string; cls: string }> = {
      complete:      { dot: "bg-emerald-500", label: "Published",     cls: "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20" },
      pending_recap: { dot: "bg-amber-500",   label: "AI processing", cls: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20" },
      queued:        { dot: "bg-blue-500",    label: "In queue",      cls: "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20" },
      missed:        { dot: "bg-cyan-500",    label: "Fetching",      cls: "text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20" },
      failed:        { dot: "bg-red-500",     label: "Error",         cls: "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20" },
    };
    const c = cfg[status];
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${c.cls}`}>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot}`} />
        {c.label}
      </span>
    );
  };

  // All unique show names for dropdown
  const allShows = Array.from(new Set(rows.map(r => r.podcast_name))).sort();

  // Filtered rows
  const filtered = rows.filter(r => {
    const status = getOverallStatus(r);
    const stageMap: Record<string, OverallStatus> = {
      published: "complete", processing: "pending_recap",
      "in-queue": "queued", fetching: "missed", error: "failed",
    };
    if (stageFilter !== "all" && status !== stageMap[stageFilter]) return false;
    if (showFilter !== "all" && r.podcast_name !== showFilter) return false;
    if (search && !r.episode_title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4" data-testid="pipeline-table-view">
      {/* Stage Flow + Metrics */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-5">
        {/* Stage flow with connectors */}
        <div className="flex items-start">
          {stages.map((stage, i) => (
            <div key={stage.name} className="flex items-start flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${stage.circleClass}`}>
                  {stage.num}
                </div>
                <div className="mt-1.5 text-center">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{stage.name}</div>
                  <div className="text-base font-bold text-slate-900 dark:text-white">{stage.count}</div>
                </div>
              </div>
              {i < stages.length - 1 && (
                <div className="flex-shrink-0 w-8 h-px bg-slate-300 dark:bg-slate-600 mt-4" />
              )}
            </div>
          ))}
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-6 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          {metricCards.map((c, i) => (
            <div key={i} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">{c.label}</div>
              <div className={`text-2xl font-bold mb-0.5 ${c.valClass}`}>{c.value}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{c.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Episode Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {/* Table header with filters */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex-wrap">
          <span className="text-sm font-semibold text-slate-900 dark:text-white">All episodes</span>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Stage filter */}
            <select
              value={stageFilter}
              onChange={e => setStageFilter(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="select-stage-filter"
            >
              <option value="all">All stages</option>
              <option value="published">Published</option>
              <option value="processing">AI processing</option>
              <option value="in-queue">In queue</option>
              <option value="fetching">Fetching</option>
              <option value="error">Error</option>
            </select>
            {/* Show filter */}
            <select
              value={showFilter}
              onChange={e => setShowFilter(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[160px]"
              data-testid="select-show-filter"
            >
              <option value="all">All shows</option>
              {allShows.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="text-xs pl-6 pr-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 w-28"
                data-testid="input-search-episodes"
              />
            </div>
            {/* Clear queue */}
            {(() => {
              const queuedInFilter = filtered.filter(r => getOverallStatus(r) === "queued");
              if (queuedInFilter.length === 0) return null;
              const targetPodcastId = showFilter !== "all"
                ? (rows.find(r => r.podcast_name === showFilter)?.podcast_id ?? null)
                : null;
              const label = showFilter !== "all"
                ? `Clear ${showFilter} queue (${queuedInFilter.length})`
                : `Clear all queued (${queuedInFilter.length})`;
              return clearConfirm ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-600 dark:text-slate-400">Sure?</span>
                  <button
                    onClick={() => clearQueueMutation.mutate(targetPodcastId)}
                    disabled={clearQueueMutation.isPending}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-red-400 text-white bg-red-500 hover:bg-red-600 font-medium disabled:opacity-50 transition-colors flex items-center gap-1"
                    data-testid="button-confirm-clear-queue"
                  >
                    {clearQueueMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes, clear"}
                  </button>
                  <button
                    onClick={() => setClearConfirm(false)}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setClearConfirm(true)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/40 font-medium transition-colors flex items-center gap-1.5"
                  data-testid="button-clear-queue"
                >
                  <XCircle className="w-3 h-3" />
                  {label}
                </button>
              );
            })()}
            {/* Retry all errors */}
            <button
              onClick={() => retryAllMutation.mutate()}
              disabled={retryAllMutation.isPending || errorCount === 0}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              data-testid="button-retry-all-errors"
            >
              {retryAllMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Retry all errors
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Episode</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Show</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Stage</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Age</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Queued</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Dur.</th>
                <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Tries</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 50).map((row, i) => {
                const status = getOverallStatus(row);
                const isError = status === "failed";
                const ageMins = ageMinutes(row.transcript_at || row.queued_at);
                const queuedMins = ageMinutes(row.queued_at);
                const isOld = ageMins !== null && ageMins > 60;
                return (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 max-w-[220px]">
                      <span
                        className={`text-xs font-medium truncate block ${isError ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100"}`}
                        title={row.episode_title}
                      >
                        {row.episode_title.length > 42 ? row.episode_title.slice(0, 42) + "…" : row.episode_title}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 max-w-[140px] truncate" title={row.podcast_name}>
                      {row.podcast_name}
                    </td>
                    <td className="px-4 py-3">
                      {stageBadge(status)}
                    </td>
                    <td className={`px-4 py-3 text-xs whitespace-nowrap font-medium ${isOld ? "text-orange-600 dark:text-orange-400" : "text-slate-500 dark:text-slate-400"}`}>
                      {formatAge(ageMins)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatAge(queuedMins)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatDur(row.transcript_chars)}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 dark:text-slate-400">
                      {row.queue_attempts ?? 1}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isError && (
                        <button
                          onClick={() => {
                            setRetryingId(row.episode_guid || row.episode_title);
                            retryOneMutation.mutate(row);
                          }}
                          disabled={retryOneMutation.isPending && retryingId === (row.episode_guid || row.episode_title)}
                          className="text-xs px-2.5 py-1 rounded border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 font-medium disabled:opacity-50 transition-colors"
                          data-testid={`button-retry-episode-${i}`}
                        >
                          {retryOneMutation.isPending && retryingId === (row.episode_guid || row.episode_title)
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : "Retry"
                          }
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400 text-sm">
            No episodes match your filters
          </div>
        )}
        {filtered.length > 50 && (
          <div className="text-center py-3 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800">
            Showing 50 of {filtered.length} episodes
          </div>
        )}
      </div>
    </div>
  );
}

// NEW: Error Queue Component
interface ErrorQueueProps {
  rows: PipelineRow[];
}

function ErrorQueue({ rows }: ErrorQueueProps) {
  const failures = rows.filter(r => getOverallStatus(r) === 'failed').sort((a, b) => {
    const aTime = a.recap_created_at ? new Date(a.recap_created_at).getTime() : 0;
    const bTime = b.recap_created_at ? new Date(b.recap_created_at).getTime() : 0;
    return bTime - aTime;
  });

  const getErrorMessage = (row: PipelineRow) => {
    if (row.recap_status === 'generation_failed') return 'Generation timeout (4+ minutes)';
    if (row.recap_status === 'hidden') return 'Validation failed - missing fields';
    return 'Unknown error';
  };

  const getAgeMinutes = (dateStr: string | null) => {
    if (!dateStr) return null;
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 rounded-xl overflow-hidden" data-testid="error-queue">
      <div className="bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
          <h3 className="text-sm font-semibold text-red-900 dark:text-red-100">Failed Episodes</h3>
          <span className="text-xs bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full font-medium">
            {failures.length}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <th className="text-left px-5 py-2.5 font-semibold text-slate-700 dark:text-slate-300 text-xs">Episode</th>
              <th className="text-left px-5 py-2.5 font-semibold text-slate-700 dark:text-slate-300 text-xs">Podcast</th>
              <th className="text-left px-5 py-2.5 font-semibold text-slate-700 dark:text-slate-300 text-xs">Error</th>
              <th className="text-center px-5 py-2.5 font-semibold text-slate-700 dark:text-slate-300 text-xs">Age</th>
            </tr>
          </thead>
          <tbody>
            {failures.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-slate-500 dark:text-slate-400 text-xs">No failed episodes</td>
              </tr>
            ) : (
              failures.slice(0, 10).map((row, i) => {
                const ageMin = getAgeMinutes(row.recap_created_at);
                return (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100 truncate max-w-xs">
                      {row.episode_title}
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-400 text-xs truncate">
                      {row.podcast_name}
                    </td>
                    <td className="px-5 py-3 text-red-700 dark:text-red-300 text-xs">
                      {getErrorMessage(row)}
                    </td>
                    <td className="px-5 py-3 text-center text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                      {ageMin ? `${ageMin}m ago` : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// NEW: Queue Health Component
interface QueueHealthProps {
  rows: PipelineRow[];
}

function QueueHealth({ rows }: QueueHealthProps) {
  const pending = rows.filter(r => {
    const status = getOverallStatus(r);
    return status === 'queued' || status === 'pending_recap';
  });

  const totalQueued = pending.length;
  const avgWaitMin = pending.length > 0
    ? Math.round(
        pending.reduce((sum, r) => {
          const waitMs = r.transcript_created_at
            ? Date.now() - new Date(r.transcript_created_at).getTime()
            : 0;
          return sum + waitMs;
        }, 0) / pending.length / 60000
      )
    : 0;

  const oldestMin = pending.length > 0
    ? Math.round(
        Math.max(
          ...pending.map(r =>
            r.transcript_created_at ? Date.now() - new Date(r.transcript_created_at).getTime() : 0
          )
        ) / 60000
      )
    : 0;

  const stageCounts = {
    queued: pending.filter(r => getOverallStatus(r) === 'queued').length,
    pending_recap: pending.filter(r => getOverallStatus(r) === 'pending_recap').length,
  };

  const processingRate = 3; // episodes per 5 min = 0.6/min
  const estimatedMinutes = totalQueued > 0 ? Math.ceil(totalQueued / 0.6) : 0;

  return (
    <div className="grid grid-cols-2 gap-4" data-testid="queue-health">
      {/* Left: Queue Metrics */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Queue Status</h3>
        <div className="space-y-4">
          <div className="border-b border-slate-200 dark:border-slate-700 pb-3">
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Total Queued</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {totalQueued}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-2">episodes</span>
            </div>
          </div>
          <div className="border-b border-slate-200 dark:border-slate-700 pb-3">
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Average Wait Time</div>
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
              {avgWaitMin}
              <span className="text-xs font-normal ml-1">minutes</span>
            </div>
          </div>
          <div className="border-b border-slate-200 dark:border-slate-700 pb-3">
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Oldest in Queue</div>
            <div className="text-xl font-bold text-orange-600 dark:text-orange-400">
              {oldestMin}
              <span className="text-xs font-normal ml-1">minutes</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Est. Clear Time</div>
            <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
              {estimatedMinutes}
              <span className="text-xs font-normal ml-1">min</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Stage Distribution */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Queue Stages</h3>
        <div className="space-y-3">
          {[
            { label: 'Awaiting Recap', count: stageCounts.pending_recap, color: 'bg-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
            { label: 'In Queue', count: stageCounts.queued, color: 'bg-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
          ].map(stage => {
            const pct = totalQueued > 0 ? Math.round((stage.count / totalQueued) * 100) : 0;
            return (
              <div key={stage.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-medium px-2 py-1 rounded ${stage.bg} ${stage.text}`}>
                    {stage.label}
                  </span>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {stage.count} ({pct}%)
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                  <div
                    className={`h-full ${stage.color} rounded-full transition-all duration-300`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// NEW: Stage Distribution Component
interface StageDistributionProps {
  counts: Record<string, number>;
}

function StageDistribution({ counts }: StageDistributionProps) {
  const stages = [
    { key: 'complete', label: 'Published', color: 'bg-emerald-100 dark:bg-emerald-900/30', textColor: 'text-emerald-700 dark:text-emerald-300' },
    { key: 'queued', label: 'In Queue', color: 'bg-blue-100 dark:bg-blue-900/30', textColor: 'text-blue-700 dark:text-blue-300' },
    { key: 'pending_recap', label: 'Awaiting Recap', color: 'bg-amber-100 dark:bg-amber-900/30', textColor: 'text-amber-700 dark:text-amber-300' },
    { key: 'missed', label: 'Missed', color: 'bg-orange-100 dark:bg-orange-900/30', textColor: 'text-orange-700 dark:text-orange-300' },
    { key: 'failed', label: 'Failed', color: 'bg-red-100 dark:bg-red-900/30', textColor: 'text-red-700 dark:text-red-300' },
  ];

  const total = stages.reduce((sum, s) => sum + (counts[s.key] || 0), 0);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4" data-testid="stage-distribution">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Pipeline Stage Breakdown</h3>
      <div className="space-y-3">
        {stages.map(stage => {
          const count = counts[stage.key] || 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={stage.key} className="flex items-center gap-3">
              <div className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${stage.color} ${stage.textColor}`}>
                {stage.label}
              </div>
              <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    stage.key === 'complete' ? 'bg-emerald-500' :
                    stage.key === 'queued' ? 'bg-blue-500' :
                    stage.key === 'pending_recap' ? 'bg-amber-500' :
                    stage.key === 'missed' ? 'bg-orange-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-right min-w-fit">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{count}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">({pct}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const SUPPORT_PROMPT = `The episode recap pipeline seems broken. Please diagnose it.

The pipeline flow is: Taddy webhook → transcript received → OpenAI recap → published

⚠️ IMPORTANT: You are diagnosing PRODUCTION ONLY
—do NOT start with dev database ($DATABASE_URL). Use fetch_deployment_logs for production 
logs and /api/admin/sql endpoint for production database queries.

CONTEXT FOR YOU:
- Scheduler runs every 5 min, processes 3 episodes/batch (production only)
- Individual episode timeout: 4 minutes (marked as generation_failed)
- Batch timeout: 20 minutes (watchdog resets if hung > 30 min)
- Key table: landing_page_recaps (published, hidden, generation_failed, running)
- Webhook source: Taddy (podcap.io)

WHAT TO CHECK (in order):
1. Scheduler status: Is it running? Last recap published when? (check scheduler-health endpoint via browser network tab or ask user for screenshot)
2. Database queries to run FIRST:
   - SELECT COUNT(*) FILTER (WHERE status = 'published') as published_24h, COUNT(*) FILTER (WHERE status = 'generation_failed') as timeouts_24h, MAX(created_at) as latest_recap FROM landing_page_recaps WHERE created_at > NOW() - INTERVAL '24 hours'
   - SELECT MAX(created_at) as most_recent FROM landing_page_recaps (compare to current time—if gap > 15min, scheduler likely stuck)
3. Deployment logs: Search for [ProdRecap], [WATCHDOG], [TaddyWebhook] errors (timeouts, crashes, API 503s)
4. Determine root cause: (a) Scheduler crashed, (b) Taddy webhooks stopped, (c) Episodes timing out, (d) OpenAI/validation issues

TELL ME:
- How long has it been broken?
- Current scheduler status (Running/Stopped)?
- What you observe in the UI (no new episodes, errors, etc.)
- Recent deployments or changes?`;


interface HealthSnapshotProps {
  data: {
    webhooksLastFiveMin: number;
    transcriptsCompleted: number;
    transcriptsFailed: number;
    generationCompleted: number;
    generationTimedOut: number;
    validationFailed: number;
    lastBatchTime: string | null;
    lastBatchSuccess: number;
    lastBatchTimeout: number;
    lastBatchValidation: number;
  };
}

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={() => setVisible(!visible)}
        className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        data-testid="tooltip-trigger"
      >
        <HelpCircle className="w-4 h-4" />
      </button>
      {visible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs rounded-lg whitespace-nowrap z-10 pointer-events-none shadow-lg">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-100" />
        </div>
      )}
    </div>
  );
}

function HealthSnapshot({ data }: HealthSnapshotProps) {
  const lastBatchTime = data.lastBatchTime ? new Date(data.lastBatchTime) : null;
  const timeSinceLastBatch = lastBatchTime
    ? Math.floor((Date.now() - lastBatchTime.getTime()) / 1000 / 60)
    : null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4" data-testid="health-snapshot">
      <h3 className="font-semibold text-sm text-slate-900 dark:text-white">Pipeline Health</h3>

      {/* Three-column grid */}
      <div className="grid grid-cols-3 gap-3">
        {/* Webhooks */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Webhooks (5m)</span>
            <Tooltip text="New episodes arriving from the podcast platform right now" />
          </div>
          <div className={`text-2xl font-bold ${data.webhooksLastFiveMin > 0 ? "text-green-600 dark:text-green-400" : "text-slate-400"}`}>
            {data.webhooksLastFiveMin}
          </div>
        </div>

        {/* Transcripts */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Transcripts (24h)</span>
            <Tooltip text="Episodes where we successfully downloaded the audio transcript" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-green-600 dark:text-green-400">{data.transcriptsCompleted}</span>
            {data.transcriptsFailed > 0 && (
              <span className="text-xs text-red-600 dark:text-red-400 font-semibold">{data.transcriptsFailed} failed</span>
            )}
          </div>
        </div>

        {/* Generation */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Generated (24h)</span>
            <Tooltip text="AI-generated recaps that were successfully created" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-green-600 dark:text-green-400">{data.generationCompleted}</span>
            {data.generationTimedOut > 0 && (
              <span className="text-xs text-red-600 dark:text-red-400 font-semibold">{data.generationTimedOut} timeouts</span>
            )}
          </div>
        </div>
      </div>

      {/* Issues Row */}
      {(data.validationFailed > 0) && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-red-900 dark:text-red-100">Issues (24h)</span>
                <Tooltip text="Recaps that failed validation (missing podcast URL, Spotify link, etc.)" />
              </div>
              <div className="text-sm text-red-700 dark:text-red-300 mt-0.5">
                {data.validationFailed} validation {data.validationFailed === 1 ? "failure" : "failures"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Last Batch Summary */}
      {lastBatchTime && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-3 mt-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Last Batch</span>
            <Tooltip text="Results from the most recent 5-minute processing cycle" />
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <div>{timeSinceLastBatch !== null && `${timeSinceLastBatch}m ago`}</div>
            <div className="flex gap-3">
              <span className="text-green-600 dark:text-green-400 font-medium">✓ {data.lastBatchSuccess} published</span>
              {data.lastBatchTimeout > 0 && (
                <span className="text-red-600 dark:text-red-400 font-medium">✗ {data.lastBatchTimeout} timed out</span>
              )}
              {data.lastBatchValidation > 0 && (
                <span className="text-amber-600 dark:text-amber-400 font-medium">⚠ {data.lastBatchValidation} validation</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SupportPrompt() {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(SUPPORT_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4" data-testid="support-prompt-section">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-amber-900 dark:text-amber-100 hover:text-amber-800 dark:hover:text-amber-50 transition-colors w-full font-semibold"
        data-testid="button-toggle-support-prompt"
      >
        <Wrench className="w-4 h-4" />
        <span>See an issue? Here's what to tell Replit Agent</span>
        {open ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Copy this prompt and paste it into Replit Agent chat. It will automatically run the right diagnostic checks.
          </p>
          <div className="relative">
            <pre className="bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-xs text-foreground whitespace-pre-wrap leading-relaxed font-mono overflow-x-auto">
              {SUPPORT_PROMPT}
            </pre>
            <button
              onClick={handleCopy}
              className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-800 border rounded-lg text-xs font-semibold hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors shadow-sm"
              data-testid="button-copy-support-prompt"
            >
              {copied ? (
                <><Check className="w-3.5 h-3.5 text-emerald-500" /> Copied!</>
              ) : (
                <><Copy className="w-3.5 h-3.5" /> Copy Prompt</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
