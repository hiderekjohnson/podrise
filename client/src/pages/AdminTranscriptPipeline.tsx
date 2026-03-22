import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, CheckCircle2, Clock, AlertTriangle, XCircle,
  ExternalLink, Zap, Radio, ArrowDown, Activity,
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
          <h2 className="text-lg font-bold">Episode Pipeline</h2>
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
