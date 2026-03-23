import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
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
  recap_status: string | null;
  recap_at: string | null;
}

type OverallStatus = "complete" | "generating" | "pending_recap" | "missed" | "queued" | "failed";

function getOverallStatus(row: PipelineRow, currentlyGeneratingGuid?: string | null): OverallStatus {
  if (row.recap_id) {
    if (row.recap_status === "generation_failed") return "failed";
    return "complete";
  }
  if (currentlyGeneratingGuid && row.episode_guid && row.episode_guid === currentlyGeneratingGuid) return "generating";
  if (row.transcript_at) {
    // If the episode aired more than 5 days ago the recap scheduler won't pick it up
    if (row.date_published) {
      const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;
      if (new Date(row.date_published).getTime() < fiveDaysAgo) return "missed";
    }
    const fiveDaysAgoFetch = Date.now() - 5 * 24 * 60 * 60 * 1000;
    const fetchedMs = new Date(row.transcript_at).getTime();
    return fetchedMs > fiveDaysAgoFetch ? "pending_recap" : "missed";
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
  complete:      { label: "Published",                   color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  generating:    { label: "Generating recap",            color: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",    icon: Zap },
  pending_recap: { label: "In queue for recap",          color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",            icon: Clock },
  missed:        { label: "Missed",                      color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",        icon: AlertTriangle },
  queued:        { label: "In queue to request transcript", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",   icon: Radio },
  failed:        { label: "Error",                       color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",               icon: XCircle },
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

interface PipelineStatusData {
  pipeline: {
    isSchedulerStarted: boolean;
    transcriptFetcher: {
      busy: boolean;
      lastRunAt: number;
      nextRunAt: number;
      currentEpisode: { guid: string; title: string; podcastName: string } | null;
      nextEpisode: { podcast_name: string; episode_title: string; date_published: number | null } | null;
      intervalMs: number;
    };
    recapGenerator: {
      busy: boolean;
      lastRunAt: number;
      nextRunAt: number;
      currentEpisode: { guid: string; title: string; podcastName: string } | null;
      nextEpisode: { podcast_name: string; episode_title: string; date_published: number | null } | null;
      intervalMs: number;
    };
  };
  stageCounts: Record<string, number>;
  queue: Array<{
    id: number;
    podcast_id: string;
    podcast_name: string;
    episode_guid: string;
    episode_title: string;
    status: string;
    attempts: number;
    last_attempt_at: string | null;
    error_message: string | null;
    created_at: string;
    priority: number;
    date_published: number | null;
  }>;
  recentCompleted: Array<{
    id: number;
    podcast_name: string;
    episode_title: string;
    status: string;
    last_attempt_at: string | null;
    created_at: string;
  }>;
}

const STAGE_LABELS: Record<string, { label: string; color: string; icon: React.FC<{ className?: string }> }> = {
  queued:           { label: "In queue to request transcript",  color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",      icon: Clock },
  pending:          { label: "In queue to request transcript",  color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",      icon: Clock },
  fetching:         { label: "Requesting transcript",           color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",      icon: Loader2 },
  transcript_ready: { label: "In queue for recap",              color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", icon: CheckCircle2 },
  generating_recap: { label: "Generating recap",                color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400", icon: Zap },
  completed:        { label: "Published",                       color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  failed:           { label: "Error",                           color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",          icon: XCircle },
};

function CountdownTimer({ targetMs, label, busy, currentEpisode, nextEpisode }: {
  targetMs: number;
  label: string;
  busy: boolean;
  currentEpisode: { title: string; podcastName: string } | null;
  nextEpisode: { podcast_name: string; episode_title: string; date_published: number | null } | null;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, Math.floor((targetMs - now) / 1000));
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  const airDate = nextEpisode?.date_published
    ? new Date(nextEpisode.date_published * 1000).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
    : null;

  return (
    <div className="space-y-2" data-testid={`timer-${label}`}>
      {busy && currentEpisode ? (
        <div className="flex items-start gap-2 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <span className="font-semibold text-violet-600 dark:text-violet-400">Processing now</span>
            <div className="text-foreground font-medium truncate" title={currentEpisode.title}>{currentEpisode.title}</div>
            <div className="text-muted-foreground">{currentEpisode.podcastName}</div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{label}:</span>
          <span className="font-mono font-semibold tabular-nums text-foreground">
            {remaining > 0 ? `${mins}:${String(secs).padStart(2, "0")}` : "now"}
          </span>
        </div>
      )}
      {nextEpisode ? (
        <div className="flex items-start gap-2 text-xs border-t pt-2 mt-1">
          <div className="w-3.5 h-3.5 shrink-0 mt-0.5 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          </div>
          <div className="min-w-0">
            <span className="text-muted-foreground font-medium">Up next</span>
            <div className="text-foreground font-medium truncate" title={nextEpisode.episode_title}>{nextEpisode.episode_title}</div>
            <div className="text-muted-foreground">{nextEpisode.podcast_name}{airDate ? ` · aired ${airDate}` : ""}</div>
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-muted-foreground border-t pt-2 mt-1 italic">Queue is empty</div>
      )}
    </div>
  );
}

function PipelineCatchupActions() {
  const { toast } = useToast();
  const [catchupDays, setCatchupDays] = useState(7);

  const catchupMutation = useMutation({
    mutationFn: async (days: number) => {
      const res = await apiRequest("POST", "/api/admin/pipeline/catchup", { days });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Catch-up complete", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline/status"] });
    },
    onError: (err: any) => {
      toast({ title: "Catch-up failed", description: err.message, variant: "destructive" });
    },
  });

  const scanMutation = useMutation({
    mutationFn: async (days: number) => {
      const res = await apiRequest("POST", "/api/admin/pipeline/queue-new-episodes", { days });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Scan started", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline/status"] });
    },
    onError: (err: any) => {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="border rounded-xl p-4 bg-card space-y-3">
      <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Catch-Up Actions</div>
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={catchupDays}
          onChange={e => setCatchupDays(Number(e.target.value))}
          className="text-xs border rounded-lg px-2 py-1.5 bg-background"
          data-testid="catchup-days-select"
        >
          <option value={3}>Last 3 days</option>
          <option value={5}>Last 5 days</option>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
        </select>
        <button
          onClick={() => catchupMutation.mutate(catchupDays)}
          disabled={catchupMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          data-testid="btn-catchup-recaps"
        >
          {catchupMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Generate Missing Recaps
        </button>
        <button
          onClick={() => scanMutation.mutate(catchupDays)}
          disabled={scanMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
          data-testid="btn-scan-episodes"
        >
          {scanMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          Scan Taddy for Missing Episodes
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug">
        <strong>Generate Missing Recaps:</strong> Finds episodes that already have transcripts but no recap, and queues them for recap generation (one every 5 min).
        <br />
        <strong>Scan Taddy:</strong> Checks all published podcasts against Taddy's API for episodes we may have missed, then queues them for transcript fetching (one every 90s).
      </p>
    </div>
  );
}

function PipelineDashboard() {
  const { data, isLoading } = useQuery<PipelineStatusData>({
    queryKey: ["/api/admin/pipeline/status"],
    queryFn: () => fetch("/api/admin/pipeline/status").then(r => r.json()),
    refetchInterval: 5_000,
  });

  if (isLoading || !data) {
    return (
      <div className="border rounded-xl p-6 bg-card" data-testid="pipeline-dashboard">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading pipeline status...</span>
        </div>
      </div>
    );
  }

  const { pipeline, stageCounts, queue, recentCompleted } = data;
  const totalActive = Object.values(stageCounts).reduce((sum, c) => sum + c, 0);

  const stages = ["queued", "fetching", "transcript_ready", "generating_recap", "failed"];

  return (
    <div className="space-y-4" data-testid="pipeline-dashboard">
      <div className="border rounded-xl p-4 bg-card space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-500" />
            <span className="font-bold text-sm">Pipeline Status</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              pipeline.isSchedulerStarted
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            }`}>
              {pipeline.isSchedulerStarted ? "ACTIVE" : "STOPPED"}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">{totalActive} episode{totalActive !== 1 ? "s" : ""} in pipeline</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="border rounded-lg p-3 bg-background space-y-2">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Transcript Fetcher</div>
            <CountdownTimer
              targetMs={pipeline.transcriptFetcher.nextRunAt}
              label="Next fetch"
              busy={pipeline.transcriptFetcher.busy}
              currentEpisode={pipeline.transcriptFetcher.currentEpisode}
              nextEpisode={pipeline.transcriptFetcher.nextEpisode}
            />
            <div className="text-[10px] text-muted-foreground">
              Interval: {Math.round(pipeline.transcriptFetcher.intervalMs / 1000)}s
            </div>
          </div>
          <div className="border rounded-lg p-3 bg-background space-y-2">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Recap Generator</div>
            <CountdownTimer
              targetMs={pipeline.recapGenerator.nextRunAt}
              label="Next recap"
              busy={pipeline.recapGenerator.busy}
              currentEpisode={pipeline.recapGenerator.currentEpisode}
              nextEpisode={pipeline.recapGenerator.nextEpisode}
            />
            <div className="text-[10px] text-muted-foreground">
              Interval: {Math.round(pipeline.recapGenerator.intervalMs / 60000)}min
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {stages.map(stage => {
            const count = stageCounts[stage] || 0;
            const cfg = STAGE_LABELS[stage] || { label: stage, color: "bg-slate-100 text-slate-600", icon: HelpCircle };
            const Icon = cfg.icon;
            return (
              <div key={stage} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${cfg.color}`} data-testid={`stage-count-${stage}`}>
                <Icon className={`w-3.5 h-3.5 ${stage === "fetching" || stage === "generating_recap" ? "animate-spin" : ""}`} />
                {cfg.label}: {count}
              </div>
            );
          })}
        </div>
      </div>

      <PipelineCatchupActions />

      {queue.length > 0 && (
        <div className="border rounded-xl p-4 bg-card space-y-3">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Episodes in Pipeline</div>
          <div className="space-y-1">
            {queue.map(item => {
              const cfg = STAGE_LABELS[item.status] || { label: item.status, color: "bg-slate-100 text-slate-600", icon: HelpCircle };
              const Icon = cfg.icon;
              return (
                <div key={item.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/50 text-xs" data-testid={`pipeline-item-${item.id}`}>
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${cfg.color}`}>
                    <Icon className={`w-3 h-3 ${item.status === "fetching" || item.status === "generating_recap" ? "animate-spin" : ""}`} />
                    {cfg.label}
                  </div>
                  <span className="truncate font-medium max-w-[300px]" title={item.episode_title}>{item.episode_title}</span>
                  <span className="text-muted-foreground shrink-0">({item.podcast_name})</span>
                  {item.date_published ? (
                    <span className="text-muted-foreground/60 shrink-0">
                      · Aired {new Date(item.date_published * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}
                    </span>
                  ) : null}
                  {item.attempts > 0 && <span className="text-muted-foreground/60 shrink-0">· {item.attempts} tries</span>}
                  {item.error_message && <span className="text-red-400 truncate max-w-[200px]" title={item.error_message}>{item.error_message}</span>}
                  <span className="ml-auto text-muted-foreground/60 shrink-0">{timeAgo(item.created_at)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {recentCompleted.length > 0 && (
        <div className="border rounded-xl p-4 bg-card space-y-3">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Recently Published</div>
          <div className="space-y-1">
            {recentCompleted.map(item => (
              <div key={item.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg text-xs" data-testid={`completed-item-${item.id}`}>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="truncate font-medium max-w-[300px]" title={item.episode_title}>{item.episode_title}</span>
                <span className="text-muted-foreground shrink-0">({item.podcast_name})</span>
                <span className="ml-auto text-muted-foreground/60 shrink-0">{timeAgo(item.last_attempt_at || item.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminTranscriptPipeline() {
  const [days, setDays] = useState(7);
  const [filter, setFilter] = useState<FilterType>("all");
  const [now, setNow] = useState(Date.now());
  const isLiveMode = filter === "pending_recap";

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
    devMode: boolean;
    batchRunning: boolean;
    batchStuck: boolean;
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

  const { data: monitorData, isLoading } = useQuery<{ rows: PipelineRow[]; currentlyGeneratingGuid: string | null }>({
    queryKey: ["/api/admin/pipeline-monitor", days],
    queryFn: () => fetch(`/api/admin/pipeline-monitor?days=${days}`).then(r => r.json()),
    refetchInterval: 15_000,
  });
  const rows = monitorData?.rows ?? [];
  const currentlyGeneratingGuid = monitorData?.currentlyGeneratingGuid ?? null;

  const { data: liveData, isFetching: isLiveFetching } = useQuery<LiveData>({
    queryKey: ["/api/admin/pipeline-live"],
    queryFn: () => fetch("/api/admin/pipeline-live").then(r => r.json()),
    refetchInterval: isLiveMode ? 15_000 : false,
    enabled: isLiveMode,
  });

  const { data: pipelineFlags, refetch: refetchFlags } = useQuery<{ id: number; key: string; enabled: boolean }[]>({
    queryKey: ["/api/admin/feature-flags"],
    queryFn: () => fetch("/api/admin/feature-flags").then(r => r.json()),
    refetchInterval: 10_000,
  });
  const transcriptFlag = pipelineFlags?.find(f => f.key === "pipeline_transcript_fetch_enabled");
  const recapFlag = pipelineFlags?.find(f => f.key === "pipeline_recap_generation_enabled");

  const toggleFlagMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiRequest("PATCH", `/api/admin/feature-flags/${id}`, { enabled }),
    onSuccess: () => { refetchFlags(); },
  });

  const withStatus = rows.map(r => ({ ...r, status: getOverallStatus(r, currentlyGeneratingGuid) }));
  const counts: Record<OverallStatus | "all", number> = {
    all: withStatus.length,
    complete: withStatus.filter(r => r.status === "complete").length,
    generating: withStatus.filter(r => r.status === "generating").length,
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
                  schedulerHealth.devMode
                    ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    : schedulerHealth.batchStuck
                      ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                      : schedulerHealth.isRunning
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                }`}
                data-testid="scheduler-status">
                  <span className={`w-2 h-2 rounded-full ${
                    schedulerHealth.devMode ? "bg-slate-400"
                    : schedulerHealth.batchStuck ? "bg-orange-500"
                    : schedulerHealth.isRunning ? "bg-emerald-500"
                    : "bg-red-500"
                  }`} />
                  {schedulerHealth.devMode
                    ? "Scheduler (prod only)"
                    : schedulerHealth.batchStuck
                      ? "⚠ Batch stuck"
                      : schedulerHealth.isRunning
                        ? schedulerHealth.batchRunning ? "⚙ Processing" : "✓ Running"
                        : "✗ Stopped"}
                  {!schedulerHealth.devMode && schedulerHealth.minutesSinceLastRun !== null && (
                    <span className="text-[10px] opacity-70 ml-1">({schedulerHealth.minutesSinceLastRun}m ago)</span>
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

      {/* Pipeline Kill Switches */}
      {(transcriptFlag || recapFlag) && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide shrink-0">Kill Switches</div>
          <div className="flex items-center gap-4 flex-wrap">
            {[
              { flag: transcriptFlag, label: "Transcript Fetch (Taddy)", offColor: "bg-red-500" },
              { flag: recapFlag, label: "Recap Generation (OpenAI)", offColor: "bg-red-500" },
            ].map(({ flag, label }) => flag ? (
              <button
                key={flag.key}
                data-testid={`kill-switch-${flag.key}`}
                onClick={() => toggleFlagMutation.mutate({ id: flag.id, enabled: !flag.enabled })}
                disabled={toggleFlagMutation.isPending}
                className="flex items-center gap-2.5 cursor-pointer select-none group"
              >
                <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${flag.enabled ? "bg-emerald-500" : "bg-red-500"}`}>
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${flag.enabled ? "translate-x-4" : "translate-x-0"}`} />
                </div>
                <span className={`text-xs font-medium ${flag.enabled ? "text-slate-700 dark:text-slate-300" : "text-red-600 dark:text-red-400 font-semibold"}`}>
                  {label}
                  {!flag.enabled && <span className="ml-1.5 px-1.5 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded text-[10px] font-bold">STOPPED</span>}
                </span>
              </button>
            ) : null)}
          </div>
        </div>
      )}

      {/* Pipeline Dashboard */}
      <PipelineDashboard />

      {/* Generating Banner */}
      {currentlyGeneratingGuid && (() => {
        const genRow = rows.find(r => r.episode_guid === currentlyGeneratingGuid);
        return (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700/40" data-testid="generating-banner">
            <Zap className="w-4 h-4 text-violet-600 dark:text-violet-400 flex-shrink-0 animate-pulse" />
            <div className="min-w-0">
              <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">AI is generating a recap right now</span>
              {genRow && (
                <span className="block text-xs text-violet-600/80 dark:text-violet-400/80 truncate">{genRow.episode_title}</span>
              )}
            </div>
          </div>
        );
      })()}

      {/* Health Snapshot */}
      {healthSnapshot && <HealthSnapshot data={healthSnapshot} />}

      {/* Stage Distribution - NEW */}
      <StageDistribution counts={counts} />

      {/* Error Queue - NEW */}
      {counts.failed > 0 && <ErrorQueue rows={rows} />}

      {/* Queue Health - NEW */}
      <QueueHealth rows={rows} />

      {/* Comprehensive Pipeline Table - NEW */}
      <PipelineTable rows={rows} counts={counts} currentlyGeneratingGuid={currentlyGeneratingGuid} />

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
          {(["all", "complete", "generating", "pending_recap", "missed", "queued", "failed"] as FilterType[]).map(s => {
            const cfg = s === "all" ? null : STATUS_CONFIG[s as OverallStatus];
            const isActive = filter === s;
            const label = s === "all" ? "All" : cfg!.label;
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
  currentlyGeneratingGuid: string | null;
}

function PipelineTable({ rows, counts, currentlyGeneratingGuid }: PipelineTableProps) {
  const { toast } = useToast();
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [showFilter, setShowFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const [clearConfirm, setClearConfirm] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState(false);
  const [purgePre0320Confirm, setPurgePre0320Confirm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [airedSort, setAiredSort] = useState<"asc" | "desc" | null>(null);
  const lastCheckedIdxRef = useRef<number | null>(null);
  const shiftPressedRef = useRef<boolean>(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Shift") shiftPressedRef.current = true; };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === "Shift") shiftPressedRef.current = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Fetch actual queue depth (all pending items, not just visible rows)
  const { data: queueDepth = {} } = useQuery({
    queryKey: ["/api/admin/pipeline/queue-depth", showFilter],
    queryFn: async () => {
      const podcastName = showFilter !== "all" ? showFilter : "all";
      const res = await fetch("/api/admin/pipeline/queue-depth?podcast_name=" + encodeURIComponent(podcastName));
      return res.json();
    },
    refetchInterval: 10000, // refresh every 10s
  });

  const clearQueueMutation = useMutation({
    mutationFn: (podcastName: string | null) =>
      apiRequest("POST", "/api/admin/pipeline/clear-queue", podcastName ? { podcast_name: podcastName } : {}),
    onSuccess: () => {
      setClearConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline-monitor"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline/queue-depth"] });
    },
  });

  const purgeShowMutation = useMutation({
    mutationFn: (podcastName: string) =>
      apiRequest("POST", "/api/admin/pipeline/purge-show", { podcast_name: podcastName }),
    onSuccess: (data: any) => {
      setPurgeConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline-monitor"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline/queue-depth"] });
    },
  });

  const removePublishedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/pipeline/remove-published", {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline-monitor"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline/queue-depth"] });
    },
  });

  const cleanOldTranscriptsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/pipeline/clean-old-transcripts", { maxAgeDays: 5 }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline-monitor"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline/queue-depth"] });
    },
  });

  // March 20 2026 00:00:00 UTC in unix seconds
  const MAR_20_2026_UTC = 1773964800;
  const purgePre0320Mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/pipeline/clean-old-transcripts", { beforeTimestamp: MAR_20_2026_UTC }),
    onSuccess: () => {
      setPurgePre0320Confirm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline-monitor"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline/queue-depth"] });
    },
  });

  const deleteSelectedMutation = useMutation({
    mutationFn: (episodes: { episode_guid: string | null; podcast_id: string; episode_title: string }[]) =>
      apiRequest("POST", "/api/admin/pipeline/delete-episodes", { episodes }),
    onSuccess: (data: any) => {
      setSelectedIds(new Set());
      lastCheckedIdxRef.current = null;
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline-monitor"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline/queue-depth"] });
      const deleted = (data?.transcripts_cleared ?? 0) + (data?.queue_cleared ?? 0);
      toast({
        title: deleted > 0 ? `Deleted ${data.transcripts_cleared} transcript(s), ${data.queue_cleared} queue item(s)` : "Nothing deleted",
        description: deleted === 0 ? "No matching rows were found — they may have already been removed." : undefined,
        variant: deleted > 0 ? "default" : "destructive",
      });
    },
  });

  const retryAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/pipeline/retry-all", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline-monitor"] }),
  });

  const [recapBatchTriggered, setRecapBatchTriggered] = useState(false);
  const runRecapBatchMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/pipeline/run-recap-batch", {}),
    onSuccess: () => {
      setRecapBatchTriggered(true);
      setTimeout(() => setRecapBatchTriggered(false), 4000);
    },
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
  const webhookCount    = rows.filter(r => r.source === "queue_only" && r.queue_status === "pending").length;
  const fetchingCount   = rows.filter(r => r.source === "queue_only" && r.queue_status === "fetching").length;
  const inQueueCount    = rows.filter(r => getOverallStatus(r, currentlyGeneratingGuid) === "pending_recap").length;
  const generatingCount = rows.filter(r => getOverallStatus(r, currentlyGeneratingGuid) === "generating").length;
  const publishedCount  = rows.filter(r => getOverallStatus(r, currentlyGeneratingGuid) === "complete").length;

  const stages = [
    { name: "In queue to request transcript", count: webhookCount,    num: "1", circleClass: "border-2 border-indigo-300 text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-900" },
    { name: "Requesting transcript",          count: fetchingCount,   num: "2", circleClass: "border-2 border-blue-300 text-blue-700 dark:text-blue-300 bg-white dark:bg-slate-900" },
    { name: "In queue for recap",             count: inQueueCount,    num: "3", circleClass: "border-2 border-amber-300 text-amber-700 dark:text-amber-300 bg-white dark:bg-slate-900" },
    { name: "Generating recap",               count: generatingCount, num: "4", circleClass: generatingCount > 0 ? "border-2 border-violet-400 text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20 animate-pulse" : "border-2 border-violet-300 text-violet-700 dark:text-violet-300 bg-white dark:bg-slate-900" },
    { name: "Published",                      count: publishedCount,  num: "5", circleClass: "border-2 border-emerald-400 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20" },
  ];

  const errorCount  = rows.filter(r => getOverallStatus(r, currentlyGeneratingGuid) === "failed").length;
  const metricCards = [
    { label: "In queue for recap",           value: inQueueCount,    sub: "have transcript, need recap", valClass: "text-slate-900 dark:text-white" },
    { label: "Generating recap",             value: generatingCount, sub: "AI writing now",              valClass: "text-violet-600 dark:text-violet-400" },
    { label: "Errors",                       value: errorCount,      sub: "need attention",              valClass: "text-red-600 dark:text-red-400" },
    { label: "Published today",              value: publishedCount,  sub: "episodes live",               valClass: "text-emerald-600 dark:text-emerald-400" },
    { label: "Requesting transcript",        value: fetchingCount,   sub: "downloading now",             valClass: "text-slate-600 dark:text-slate-400" },
    { label: "In queue to request transcript", value: webhookCount,    sub: "in line to download",         valClass: "text-slate-600 dark:text-slate-400" },
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
    const cfg: Record<OverallStatus, { dot: string; label: string; cls: string; pulse?: boolean }> = {
      complete:      { dot: "bg-emerald-500", label: "Published",                    cls: "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20" },
      generating:    { dot: "bg-violet-500",  label: "Generating recap",             cls: "text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20", pulse: true },
      pending_recap: { dot: "bg-amber-500",   label: "In queue for recap",           cls: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20" },
      queued:        { dot: "bg-blue-500",    label: "In queue to request transcript", cls: "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20" },
      missed:        { dot: "bg-cyan-500",    label: "Missed",                       cls: "text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20" },
      failed:        { dot: "bg-red-500",     label: "Error",                        cls: "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20" },
    };
    const c = cfg[status];
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${c.cls}`}>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot}${c.pulse ? " animate-pulse" : ""}`} />
        {c.label}
      </span>
    );
  };

  // All unique show names for dropdown
  const allShows = Array.from(new Set(rows.map(r => r.podcast_name))).sort();

  // Filtered rows
  const filtered = rows.filter(r => {
    const status = getOverallStatus(r, currentlyGeneratingGuid);
    const stageMap: Record<string, OverallStatus> = {
      published: "complete", generating: "generating", processing: "pending_recap",
      "in-queue": "queued", fetching: "missed", error: "failed",
    };
    if (stageFilter !== "all" && status !== stageMap[stageFilter]) return false;
    if (showFilter !== "all" && r.podcast_name !== showFilter) return false;
    if (search && !r.episode_title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const sortedFiltered = airedSort
    ? [...filtered].sort((a, b) => {
        const ta = a.date_published ? new Date(a.date_published).getTime() : 0;
        const tb = b.date_published ? new Date(b.date_published).getTime() : 0;
        return airedSort === "asc" ? ta - tb : tb - ta;
      })
    : filtered;

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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          {metricCards.map((c, i) => (
            <div key={i} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">{c.label}</div>
              <div className={`text-2xl font-bold mb-0.5 ${c.valClass}`}>{c.value}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{c.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* How the pipeline works */}
      <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl px-5 py-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed space-y-2">
        <div className="font-semibold text-slate-800 dark:text-slate-200 text-[13px]">How episodes move through the pipeline</div>
        <ol className="list-decimal list-inside space-y-1.5">
          <li><strong className="text-slate-700 dark:text-slate-300">Taddy sends a webhook</strong> when a new episode is published. We save it to the queue with its aired date.</li>
          <li><strong className="text-slate-700 dark:text-slate-300">In queue to request transcript</strong> — the episode is in line. The system requests one transcript at a time, every 90 seconds.</li>
          <li><strong className="text-slate-700 dark:text-slate-300">Requesting transcript</strong> — the system is actively requesting and downloading the transcript from Taddy right now (takes a few seconds).</li>
          <li><strong className="text-slate-700 dark:text-slate-300">In queue for recap</strong> — the transcript is downloaded. The episode is in line for the AI to generate a recap.</li>
          <li><strong className="text-slate-700 dark:text-slate-300">Generating recap</strong> — the AI is actively generating the recap right now. One episode at a time, every 5 minutes.</li>
          <li><strong className="text-slate-700 dark:text-slate-300">Published</strong> — the recap is live on the website.</li>
        </ol>
        <p className="text-[11px] text-slate-500 dark:text-slate-500">Deploying changes briefly pauses the pipeline (10-30 seconds) but nothing is lost — episodes in progress are automatically retried on restart.</p>
      </div>

      {/* Episode Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {/* Table header with filters */}
        <div className="flex flex-col gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {stageFilter === "all" ? "All episodes" : (
                <>
                  {sortedFiltered.length} episode{sortedFiltered.length !== 1 ? "s" : ""}
                  {" "}
                  <span className="font-normal text-slate-500 dark:text-slate-400">
                    {stageFilter === "published" ? "published" :
                     stageFilter === "generating" ? "writing recap" :
                     stageFilter === "processing" ? "waiting for recap" :
                     stageFilter === "in-queue" ? "waiting for transcript" :
                     stageFilter === "fetching" ? "getting transcript" :
                     stageFilter === "error" ? "with errors" : ""}
                  </span>
                </>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Stage filter */}
            <select
              value={stageFilter}
              onChange={e => setStageFilter(e.target.value)}
              className="flex-1 min-w-[130px] text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="select-stage-filter"
            >
              <option value="all">All stages</option>
              <option value="published">Published</option>
              <option value="generating">Generating recap</option>
              <option value="processing">In queue for recap</option>
              <option value="in-queue">In queue to request transcript</option>
              <option value="fetching">Requesting transcript</option>
              <option value="error">Error</option>
            </select>
            {/* Show filter */}
            <select
              value={showFilter}
              onChange={e => setShowFilter(e.target.value)}
              className="flex-1 min-w-[130px] text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="select-show-filter"
            >
              <option value="all">All shows</option>
              {allShows.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {/* Search */}
            <div className="relative flex-1 min-w-[130px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full text-xs pl-6 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                data-testid="input-search-episodes"
              />
            </div>
          </div>
          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {/* Clear queue */}
            {(() => {
              const queueCount = queueDepth?.count ?? 0;
              if (queueCount === 0) return null;
              const targetPodcastName = showFilter !== "all" ? showFilter : null;
              const label = showFilter !== "all"
                ? `Clear ${showFilter} queue (${queueCount})`
                : `Clear all queued (${queueCount})`;
              return clearConfirm ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-600 dark:text-slate-400">Sure?</span>
                  <button
                    onClick={() => clearQueueMutation.mutate(targetPodcastName)}
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
            {/* Delete selected */}
            {selectedIds.size > 0 && (
              <button
                onClick={() => {
                  const toDelete = filtered
                    .filter(r => selectedIds.has(r.episode_guid || (r.podcast_id + '|' + r.episode_title)))
                    .map(r => ({ episode_guid: r.episode_guid, podcast_id: r.podcast_id, episode_title: r.episode_title }));
                  deleteSelectedMutation.mutate(toDelete);
                }}
                disabled={deleteSelectedMutation.isPending}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-400 text-white bg-red-500 hover:bg-red-600 font-medium disabled:opacity-50 transition-colors flex items-center gap-1.5"
                data-testid="button-delete-selected"
              >
                {deleteSelectedMutation.isPending
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <XCircle className="w-3 h-3" />}
                Delete selected ({selectedIds.size})
              </button>
            )}
            {/* Purge show from pipeline (all stages) */}
            {showFilter !== "all" && (
              purgeConfirm ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-600 dark:text-slate-400">Delete all unrecapped episodes for <strong>{showFilter}</strong>?</span>
                  <button
                    onClick={() => purgeShowMutation.mutate(showFilter)}
                    disabled={purgeShowMutation.isPending}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-red-400 text-white bg-red-500 hover:bg-red-600 font-medium disabled:opacity-50 transition-colors flex items-center gap-1"
                    data-testid="button-confirm-purge-show"
                  >
                    {purgeShowMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes, purge"}
                  </button>
                  <button
                    onClick={() => setPurgeConfirm(false)}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setPurgeConfirm(true)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 font-medium transition-colors flex items-center gap-1.5"
                  data-testid="button-purge-show"
                >
                  <XCircle className="w-3 h-3" />
                  Purge {showFilter} from pipeline
                </button>
              )
            )}
            {/* Manually trigger a recap batch immediately */}
            <button
              onClick={() => runRecapBatchMutation.mutate()}
              disabled={runRecapBatchMutation.isPending || recapBatchTriggered}
              className="text-xs px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              data-testid="button-run-recap-batch"
              title="Trigger an immediate recap generation batch — does not wait for the next 5-min tick"
            >
              {runRecapBatchMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : recapBatchTriggered ? (
                <Check className="w-3 h-3" />
              ) : (
                <Zap className="w-3 h-3" />
              )}
              {recapBatchTriggered ? "Batch started" : "Run recaps now"}
            </button>
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
            {/* Remove already-published episodes */}
            <button
              onClick={() => removePublishedMutation.mutate()}
              disabled={removePublishedMutation.isPending}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium disabled:opacity-40 transition-colors flex items-center gap-1.5"
              data-testid="button-remove-published"
              title="Remove transcripts from pipeline that already have published recaps"
            >
              {removePublishedMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Remove published
            </button>
            {/* Delete transcripts for episodes older than 5 days — cleans up back-catalog floods */}
            <button
              onClick={() => cleanOldTranscriptsMutation.mutate()}
              disabled={cleanOldTranscriptsMutation.isPending}
              className="text-xs px-3 py-1.5 rounded-lg border border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/40 font-medium disabled:opacity-40 transition-colors flex items-center gap-1.5"
              data-testid="button-clean-old-transcripts"
              title="Delete all episode transcripts where the air date is older than 5 days and no recap exists — prevents back-catalog floods from clogging the pipeline"
            >
              {cleanOldTranscriptsMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
              Delete old (&gt;5d)
            </button>
            {/* One-off: purge all unrecapped episodes aired before March 20 2026 */}
            {purgePre0320Confirm ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-600 dark:text-slate-400">Delete all unrecapped episodes before <strong>Mar 20, 2026</strong>?</span>
                <button
                  onClick={() => purgePre0320Mutation.mutate()}
                  disabled={purgePre0320Mutation.isPending}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-red-400 text-white bg-red-500 hover:bg-red-600 font-medium disabled:opacity-50 transition-colors flex items-center gap-1"
                  data-testid="button-confirm-purge-pre0320"
                >
                  {purgePre0320Mutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes, purge"}
                </button>
                <button
                  onClick={() => setPurgePre0320Confirm(false)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setPurgePre0320Confirm(true)}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 font-medium transition-colors flex items-center gap-1.5"
                data-testid="button-purge-pre0320"
                title="Permanently delete all unrecapped episode transcripts aired before March 20, 2026"
              >
                <XCircle className="w-3 h-3" />
                Purge pre-Mar 20
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div>
          {(() => {
            // Only cap rows when viewing ALL shows in all/published stage — prevents slowdowns
            // from thousands of published episodes. A specific show filter always shows all rows.
            const capRows = (stageFilter === "all" || stageFilter === "published") && showFilter === "all";
            const displayRows = capRows ? sortedFiltered.slice(0, 50) : sortedFiltered;
            const rowKey = (r: PipelineRow) => r.episode_guid || (r.podcast_id + '|' + r.episode_title);
            const allDisplayKeys = displayRows.map(rowKey);
            const allSelected = allDisplayKeys.length > 0 && allDisplayKeys.every(k => selectedIds.has(k));
            const someSelected = !allSelected && allDisplayKeys.some(k => selectedIds.has(k));

            const toggleAll = () => {
              setSelectedIds(prev => {
                const next = new Set(prev);
                if (allSelected) {
                  allDisplayKeys.forEach(k => next.delete(k));
                } else {
                  allDisplayKeys.forEach(k => next.add(k));
                }
                return next;
              });
            };

            const toggleRow = (idx: number, shiftKey: boolean) => {
              const key = rowKey(displayRows[idx]);
              setSelectedIds(prev => {
                const next = new Set(prev);
                if (shiftKey && lastCheckedIdxRef.current !== null) {
                  const from = Math.min(lastCheckedIdxRef.current, idx);
                  const to = Math.max(lastCheckedIdxRef.current, idx);
                  const shouldSelect = !prev.has(rowKey(displayRows[lastCheckedIdxRef.current]));
                  for (let j = from; j <= to; j++) {
                    if (shouldSelect) next.add(rowKey(displayRows[j]));
                    else next.delete(rowKey(displayRows[j]));
                  }
                } else {
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                }
                lastCheckedIdxRef.current = idx;
                return next;
              });
            };

            const renderRow = (row: PipelineRow, i: number) => {
              const status = getOverallStatus(row, currentlyGeneratingGuid);
              const isError = status === "failed";
              const ageMins = ageMinutes(row.transcript_at || row.queued_at);
              const queuedMins = ageMinutes(row.queued_at);
              const isOld = ageMins !== null && ageMins > 60;
              const key = rowKey(row);
              const isChecked = selectedIds.has(key);
              return { status, isError, ageMins, queuedMins, isOld, isChecked };
            };

            return (
              <>
                {/* ── Mobile card list (hidden on md+) ── */}
                <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {displayRows.length === 0 && (
                    <div className="text-center py-10 text-slate-500 dark:text-slate-400 text-sm">
                      No episodes match your filters
                    </div>
                  )}
                  {displayRows.map((row, i) => {
                    const { status, isError, ageMins, isOld, isChecked } = renderRow(row, i);
                    const key = rowKey(row);
                    return (
                      <div
                        key={i}
                        className={`px-4 py-3.5 ${isChecked ? "bg-blue-50/60 dark:bg-blue-900/10" : ""}`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleRow(i, false)}
                            className="w-4 h-4 rounded cursor-pointer accent-slate-600 mt-0.5 flex-shrink-0"
                            data-testid={`checkbox-episode-mobile-${i}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <span className={`text-xs font-semibold leading-snug flex-1 ${isError ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100"}`}>
                                {row.episode_title}
                              </span>
                              <div className="flex-shrink-0">{stageBadge(status)}</div>
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{row.podcast_name}</div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5">
                              {row.date_published && (
                                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                  Aired {new Date(row.date_published).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}
                                </span>
                              )}
                              {ageMins !== null && (
                                <span className={`text-[11px] font-medium ${isOld ? "text-orange-500 dark:text-orange-400" : "text-slate-400 dark:text-slate-500"}`}>
                                  {formatAge(ageMins)} in pipeline
                                </span>
                              )}
                              {row.recap_at && (
                                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                  Published {new Date(row.recap_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                                  {new Date(row.recap_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                </span>
                              )}
                              {row.transcript_chars && (
                                <span className="text-[11px] text-slate-400 dark:text-slate-500">{formatDur(row.transcript_chars)}</span>
                              )}
                            </div>
                            {isError && (
                              <button
                                onClick={() => { setRetryingId(row.episode_guid || row.episode_title); retryOneMutation.mutate(row); }}
                                disabled={retryOneMutation.isPending && retryingId === (row.episode_guid || row.episode_title)}
                                className="mt-2 text-xs px-3 py-1.5 rounded border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 font-medium disabled:opacity-50 transition-colors inline-flex items-center gap-1"
                                data-testid={`button-retry-episode-mobile-${i}`}
                              >
                                {retryOneMutation.isPending && retryingId === (row.episode_guid || row.episode_title)
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : "Retry"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {capRows && filtered.length > 50 && (
                    <div className="text-center py-3 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800">
                      Showing 50 of {filtered.length} · filter by show to see all
                    </div>
                  )}
                </div>

                {/* ── Desktop table (hidden on mobile) ── */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                        <th className="px-3 py-2.5 w-8">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={el => { if (el) el.indeterminate = someSelected; }}
                            onChange={toggleAll}
                            className="w-3.5 h-3.5 rounded cursor-pointer accent-slate-600"
                            data-testid="checkbox-select-all"
                          />
                        </th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Episode</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Show</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Stage</th>
                        <th className="px-4 py-2.5">
                          <button
                            onClick={() => setAiredSort(s => s === "desc" ? "asc" : s === "asc" ? null : "desc")}
                            className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                            data-testid="sort-aired"
                            title="Sort by air date"
                          >
                            Aired
                            <span className="flex flex-col -space-y-1">
                              <ChevronUp className={`w-2.5 h-2.5 ${airedSort === "asc" ? "text-blue-500" : "text-slate-300 dark:text-slate-600"}`} />
                              <ChevronDown className={`w-2.5 h-2.5 ${airedSort === "desc" ? "text-blue-500" : "text-slate-300 dark:text-slate-600"}`} />
                            </span>
                          </button>
                        </th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Age</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Queued</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Published</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Dur.</th>
                        <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Tries</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row, i) => {
                        const { status, isError, ageMins, queuedMins, isOld, isChecked } = renderRow(row, i);
                        const key = rowKey(row);
                        return (
                          <tr
                            key={i}
                            className={`border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${isChecked ? "bg-blue-50/60 dark:bg-blue-900/10" : ""}`}
                          >
                            <td className="px-3 py-3 w-8">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleRow(i, shiftPressedRef.current)}
                                className="w-3.5 h-3.5 rounded cursor-pointer accent-slate-600"
                                data-testid={`checkbox-episode-${i}`}
                              />
                            </td>
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
                            <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {row.date_published ? (() => {
                                const d = new Date(row.date_published);
                                const isCurrentYear = d.getFullYear() === new Date().getFullYear();
                                const datePart = d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(!isCurrentYear && { year: "numeric" }) });
                                const timePart = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                                return `${datePart}, ${timePart}`;
                              })() : "—"}
                            </td>
                            <td className={`px-4 py-3 text-xs whitespace-nowrap font-medium ${isOld ? "text-orange-600 dark:text-orange-400" : "text-slate-500 dark:text-slate-400"}`}>
                              {formatAge(ageMins)}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {formatAge(queuedMins)}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {row.recap_at ? (() => {
                                const d = new Date(row.recap_at);
                                const isCurrentYear = d.getFullYear() === new Date().getFullYear();
                                const datePart = d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(!isCurrentYear && { year: "numeric" }) });
                                const timePart = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                                return <><div>{datePart}</div><div className="text-[10px] text-slate-400 dark:text-slate-500">{timePart}</div></>;
                              })() : "—"}
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
                                  onClick={() => { setRetryingId(row.episode_guid || row.episode_title); retryOneMutation.mutate(row); }}
                                  disabled={retryOneMutation.isPending && retryingId === (row.episode_guid || row.episode_title)}
                                  className="text-xs px-2.5 py-1 rounded border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 font-medium disabled:opacity-50 transition-colors"
                                  data-testid={`button-retry-episode-${i}`}
                                >
                                  {retryOneMutation.isPending && retryingId === (row.episode_guid || row.episode_title)
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : "Retry"}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filtered.length === 0 && (
                    <div className="text-center py-12 text-slate-500 dark:text-slate-400 text-sm">
                      No episodes match your filters
                    </div>
                  )}
                  {capRows && filtered.length > 50 && (
                    <div className="text-center py-3 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800">
                      Showing 50 of {filtered.length} episodes · select a specific show to see all
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
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
    const aTime = a.recap_at ? new Date(a.recap_at).getTime() : 0;
    const bTime = b.recap_at ? new Date(b.recap_at).getTime() : 0;
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
                const ageMin = getAgeMinutes(row.recap_at);
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
          const waitMs = r.transcript_at
            ? Date.now() - new Date(r.transcript_at).getTime()
            : 0;
          return sum + waitMs;
        }, 0) / pending.length / 60000
      )
    : 0;

  const oldestMin = pending.length > 0
    ? Math.round(
        Math.max(
          ...pending.map(r =>
            r.transcript_at ? Date.now() - new Date(r.transcript_at).getTime() : 0
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
    { key: 'generating', label: 'Generating', color: 'bg-violet-100 dark:bg-violet-900/30', textColor: 'text-violet-700 dark:text-violet-300' },
    { key: 'queued', label: 'In Queue', color: 'bg-blue-100 dark:bg-blue-900/30', textColor: 'text-blue-700 dark:text-blue-300' },
    { key: 'pending_recap', label: 'In Recap Queue', color: 'bg-amber-100 dark:bg-amber-900/30', textColor: 'text-amber-700 dark:text-amber-300' },
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

const SUPPORT_PROMPT = `The episode recap pipeline needs diagnosis. Please investigate and fix it.

Pipeline flow: Taddy webhook → transcript fetched → OpenAI recap → published

⚠️ PRODUCTION ONLY — do NOT use dev database ($DATABASE_URL).
You have two tools to query production yourself — use both, do not ask the user to paste data:
  1. executeSql({ sqlQuery: "...", environment: "production" }) — read-only production DB
  2. fetch_deployment_logs — production server logs

SYSTEM CONTEXT:
- Scheduler: runs every 5 min, 3 episodes/batch, production only
- Timeouts: per-episode 4 min → status='generation_failed'; batch 20 min; watchdog resets if hung >30 min
- Taddy API: self-limited to 60 req/min (their limit is 250). Rate limit hits → episodes stop ingesting
- Tables: landing_page_recaps (status: published/hidden/generation_failed/running), pending_transcript_queue (status: pending/fetching/failed)

RUN THESE QUERIES IMMEDIATELY (do not ask the user first):

1. Overall health:
SELECT 
  COUNT(*) FILTER (WHERE status='published' AND created_at > NOW()-INTERVAL '24h') AS published_24h,
  COUNT(*) FILTER (WHERE status='generation_failed' AND created_at > NOW()-INTERVAL '24h') AS timeouts_24h,
  MAX(created_at) AS latest_recap
FROM landing_page_recaps;

2. Queue status:
SELECT ptq.podcast_id, pd.name, ptq.status, COUNT(*) as cnt,
       MIN(ptq.created_at) as oldest, MAX(ptq.created_at) as newest
FROM pending_transcript_queue ptq
LEFT JOIN podcast_directory pd ON pd.itunes_id = ptq.podcast_id
GROUP BY ptq.podcast_id, pd.name, ptq.status
ORDER BY cnt DESC LIMIT 20;

3. Recent failures:
SELECT episode_title, podcast_name, status, created_at
FROM landing_page_recaps
WHERE status = 'generation_failed' AND created_at > NOW()-INTERVAL '24h'
ORDER BY created_at DESC LIMIT 10;

4. Check deployment logs for: [ProdRecap], [WATCHDOG], [TaddyWebhook], [TaddyRateLimit]

AFTER QUERYING, determine root cause:
(a) Scheduler stopped — no recent [ProdRecap] logs
(b) Taddy rate limit — [TaddyRateLimit] logs, queue items stuck in 'pending' with 0 attempts
(c) Queue clogged with stale episodes — check query 2 for old episodes flooding the queue
(d) Episodes timing out — high generation_failed count in query 1
(e) Taddy webhooks stopped — no new pending_transcript_queue entries in last hour

USER NOTES:
- There is a "Clear queue" button per-podcast on the pipeline page (use it for stale floods)
- The pipeline page shows Taddy req/min badge (green=ok, amber=busy, red=near limit)`;


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

function Tooltip({ text, children }: { text: string; children?: React.ReactNode }) {
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
