import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, CheckCircle2, Clock, AlertTriangle, XCircle,
  ExternalLink, Zap, Radio, ArrowDown, Activity,
  Copy, Check, ChevronDown, ChevronUp, Wrench, HelpCircle,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";

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

  const { data: schedulerHealth } = useQuery<{ isRunning: boolean; lastRecapTime: string | null; minutesSinceLastRun: number | null }>({
    queryKey: ["/api/admin/scheduler-health"],
    queryFn: () => fetch("/api/admin/scheduler-health").then(r => r.json()),
    refetchInterval: 30_000,
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
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                schedulerHealth.isRunning
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
              }`}
              data-testid="scheduler-status">
                <span className={`w-2 h-2 rounded-full ${schedulerHealth.isRunning ? "bg-emerald-500" : "bg-red-500"} ${schedulerHealth.isRunning ? "" : ""}`} />
                {schedulerHealth.isRunning ? "✓ Running" : "✗ Stopped"}
                {schedulerHealth.minutesSinceLastRun !== null && (
                  <span className="text-[10px] text-muted-foreground ml-1">({schedulerHealth.minutesSinceLastRun}m ago)</span>
                )}
              </div>
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
  const stages = [
    { name: 'Webhook', count: 1, icon: '1', color: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' },
    { name: 'Taddy fetch', count: counts.queued || 0, icon: '2', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
    { name: 'In queue', count: counts.queued || 0, icon: '3', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
    { name: 'AI recap', count: counts.queued || 0, icon: '4', color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' },
    { name: 'Published', count: counts.complete || 0, icon: '5', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
  ];

  const metricCards = [
    { label: 'Queue depth', value: counts.queued || 0, subtext: 'episodes waiting', color: 'text-slate-900 dark:text-white' },
    { label: 'Processing', value: counts.pending_recap || 0, subtext: 'AI recap active', color: 'text-indigo-600 dark:text-indigo-400' },
    { label: 'Errors', value: counts.failed || 0, subtext: 'need attention', color: 'text-red-600 dark:text-red-400' },
    { label: 'Published today', value: counts.complete || 0, subtext: 'episodes live', color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Fetching', value: 0, subtext: 'from Taddy', color: 'text-slate-600 dark:text-slate-400' },
    { label: 'Pending', value: 0, subtext: 'webhook only', color: 'text-slate-600 dark:text-slate-400' },
  ];

  const getAgeMinutes = (dateStr: string | null) => {
    if (!dateStr) return null;
    const minutes = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h${mins > 0 ? ` ${mins}m` : ''}`;
  };

  const getDurationSeconds = (transcriptChars: number | null) => {
    if (!transcriptChars) return null;
    const estimatedSeconds = Math.ceil(transcriptChars / 15);
    return `${estimatedSeconds}s`;
  };

  const getStageColor = (status: OverallStatus) => {
    const colors = {
      complete: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
      queued: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      pending_recap: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
      missed: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
      failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    };
    return colors[status] || 'bg-slate-100 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300';
  };

  const getStageLabel = (status: OverallStatus) => {
    const labels = {
      complete: '✓ Published',
      queued: '⏳ In queue',
      pending_recap: '🔄 AI processing',
      missed: '⚠ Fetching',
      failed: '✗ Error',
    };
    return labels[status] || status;
  };

  const displayRows = rows.slice(0, 20); // Show top 20 for performance

  return (
    <div className="space-y-5" data-testid="pipeline-table-view">
      {/* Pipeline Stage Visualization */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="p-5 space-y-5">
          {/* Stage Flow */}
          <div className="flex items-start justify-between gap-2">
            {stages.map((stage, i) => (
              <div key={stage.name} className="flex-1 flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${stage.color} mb-2`}>
                  {stage.icon}
                </div>
                <div className="text-center">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">{stage.name}</div>
                  <div className="text-lg font-bold text-slate-900 dark:text-white">{stage.count}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Metrics Cards */}
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            {metricCards.map((card, i) => (
              <div key={i} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                <div className="text-xs text-slate-600 dark:text-slate-400 font-medium uppercase mb-1">{card.label}</div>
                <div className={`text-2xl font-bold ${card.color} mb-0.5`}>{card.value}</div>
                <div className="text-xs text-slate-600 dark:text-slate-400">{card.subtext}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detailed Episodes Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-700 px-5 py-3 bg-slate-50 dark:bg-slate-800/50">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">All episodes</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <th className="text-left px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300 text-xs">Episode</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300 text-xs">Show</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300 text-xs">Stage</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300 text-xs">Age</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300 text-xs">Queued</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300 text-xs">Dur.</th>
                <th className="text-center px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300 text-xs">Tries</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => {
                const status = getOverallStatus(row);
                const ageMin = getAgeMinutes(row.transcript_created_at);
                const queuedMin = getAgeMinutes(row.transcript_created_at);
                return (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 truncate max-w-xs text-xs">
                      {row.episode_title}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs truncate max-w-xs">
                      {row.podcast_name}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded text-xs font-semibold whitespace-nowrap inline-block ${getStageColor(status)}`}>
                        {getStageLabel(status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs whitespace-nowrap">
                      {ageMin || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs whitespace-nowrap">
                      {queuedMin || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs whitespace-nowrap">
                      {getDurationSeconds(row.transcript_chars) || '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-400 text-xs">
                      1
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {displayRows.length === 0 && (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400 text-xs">
            No episodes to display
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
