import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Play, Clock, CheckCircle2, AlertCircle, Loader2, RefreshCw, Database } from "lucide-react";

interface TabloidHeadlineStats {
  totalInTable: number;
  withContent: number;
  missingHeadlineWithContent: number;
  missingContent: number;
}

interface BackfillJobStatus {
  key: string;
  name: string;
  description: string;
  rateNote: string;
  createdAt: string;
  status: "idle" | "running" | "completed" | "failed";
  totalRecords: number | null;
  processedCount: number;
  updatedCount: number;
  errorMessage: string | null;
  lastRunAt: string | null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never run";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ElapsedTimer({ startedAt }: { startedAt: Date }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return <span>{mins > 0 ? `${mins}m ` : ""}{secs}s</span>;
}

function BackfillCard({ job, onRunSuccess }: { job: BackfillJobStatus; onRunSuccess: () => void }) {
  const { toast } = useToast();
  const runStartedAtRef = useRef<Date | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [liveJob, setLiveJob] = useState<BackfillJobStatus>(job);

  const { data: tabloidStats, isLoading: statsLoading } = useQuery<TabloidHeadlineStats>({
    queryKey: ["/api/admin/backfills/tabloid-headlines/stats"],
    enabled: job.key === "tabloid-headlines",
    refetchInterval: false,
  });

  useEffect(() => {
    setLiveJob(job);
  }, [job]);

  useEffect(() => {
    if (liveJob.status === "running") {
      if (!runStartedAtRef.current) {
        runStartedAtRef.current = liveJob.lastRunAt ? new Date(liveJob.lastRunAt) : new Date();
      }
      if (!pollingRef.current) {
        pollingRef.current = setInterval(async () => {
          try {
            const resp = await fetch(`/api/admin/backfills/${liveJob.key}`, { credentials: "include" });
            if (resp.ok) {
              const data = await resp.json();
              setLiveJob(data);
              if (data.status !== "running") {
                clearInterval(pollingRef.current!);
                pollingRef.current = null;
                runStartedAtRef.current = null;
                if (liveJob.key === "tabloid-headlines") {
                  queryClient.invalidateQueries({ queryKey: ["/api/admin/backfills/tabloid-headlines/stats"] });
                }
                onRunSuccess();
              }
            }
          } catch {}
        }, 3000);
      }
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      runStartedAtRef.current = null;
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [liveJob.status, liveJob.key]);

  const runMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/backfills/${liveJob.key}/run`),
    onSuccess: async (resp: Response) => {
      const data = await resp.json();
      runStartedAtRef.current = new Date();
      setLiveJob(prev => ({
        ...prev,
        status: "running",
        processedCount: 0,
        updatedCount: 0,
        totalRecords: data.totalRecords ?? null,
        lastRunAt: new Date().toISOString(),
        errorMessage: null,
      }));
      toast({ title: "Backfill started", description: `Processing ${data.totalRecords ?? "?"} records` });
    },
    onError: (err: any) => {
      let msg = "Failed to start backfill";
      if (err instanceof Error) {
        const match = err.message.match(/^\d+:\s*(.+?)(?:\n|$)/);
        msg = match ? match[1] : err.message.split("\n")[0];
      }
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const isRunning = liveJob.status === "running";
  const isCompleted = liveJob.status === "completed";
  const isFailed = liveJob.status === "failed";

  const pct = liveJob.totalRecords && liveJob.totalRecords > 0
    ? Math.round((liveJob.processedCount / liveJob.totalRecords) * 100)
    : 0;

  return (
    <div className="bg-white border border-border rounded-xl p-5 space-y-4" data-testid={`backfill-card-${liveJob.key}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-sm text-foreground" data-testid={`backfill-name-${liveJob.key}`}>{liveJob.name}</h3>
            {isRunning && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700" data-testid={`backfill-status-${liveJob.key}`}>
                <Loader2 className="w-3 h-3 animate-spin" /> Running
              </span>
            )}
            {isCompleted && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700" data-testid={`backfill-status-${liveJob.key}`}>
                <CheckCircle2 className="w-3 h-3" /> Completed
              </span>
            )}
            {isFailed && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700" data-testid={`backfill-status-${liveJob.key}`}>
                <AlertCircle className="w-3 h-3" /> Failed
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed" data-testid={`backfill-description-${liveJob.key}`}>{liveJob.description}</p>
        </div>
        <button
          data-testid={`backfill-run-${liveJob.key}`}
          onClick={() => runMutation.mutate()}
          disabled={isRunning || runMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {isRunning || runMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          Run
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span data-testid={`backfill-rate-${liveJob.key}`}>{liveJob.rateNote}</span>
        </span>
        <span data-testid={`backfill-created-${liveJob.key}`}>Created {liveJob.createdAt}</span>
        <span data-testid={`backfill-last-run-${liveJob.key}`}>Last run: {formatDate(liveJob.lastRunAt)}</span>
      </div>

      {liveJob.key === "tabloid-headlines" && (
        <div className="bg-muted/30 border border-border/50 rounded-lg p-3 text-xs space-y-1.5" data-testid="backfill-stats-tabloid-headlines">
          <div className="flex items-center gap-1.5 font-medium text-foreground mb-1">
            <Database className="w-3.5 h-3.5" />
            Database Diagnostics
          </div>
          {statsLoading ? (
            <div className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Loading stats...</div>
          ) : tabloidStats ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-muted-foreground">
              <span>Total episodes in table: <strong className="text-foreground" data-testid="stat-total">{tabloidStats.totalInTable.toLocaleString()}</strong></span>
              <span>Have recap content: <strong className="text-foreground" data-testid="stat-with-content">{tabloidStats.withContent.toLocaleString()}</strong></span>
              <span className="text-amber-700">Missing headline (processable): <strong data-testid="stat-processable">{tabloidStats.missingHeadlineWithContent.toLocaleString()}</strong></span>
              <span className="text-muted-foreground">No content (skipped): <strong data-testid="stat-no-content">{tabloidStats.missingContent.toLocaleString()}</strong></span>
            </div>
          ) : (
            <div className="text-muted-foreground">Could not load stats</div>
          )}
        </div>
      )}

      {(isCompleted || isFailed) && liveJob.lastRunAt && (
        <div className="bg-muted/40 rounded-lg p-3 text-xs space-y-1" data-testid={`backfill-results-${liveJob.key}`}>
          <div className="font-medium text-foreground mb-1">Last run results</div>
          <div className="flex gap-4 text-muted-foreground">
            <span>Processed: <strong className="text-foreground">{liveJob.processedCount}</strong></span>
            <span>Updated: <strong className="text-foreground">{liveJob.updatedCount}</strong></span>
            {liveJob.totalRecords !== null && (
              <span>Total: <strong className="text-foreground">{liveJob.totalRecords}</strong></span>
            )}
          </div>
          {isCompleted && <div className="text-green-600 font-medium">Completed successfully</div>}
          {isFailed && (
            <div className="text-red-600">{liveJob.errorMessage || "Job failed or was interrupted"}</div>
          )}
        </div>
      )}

      {isRunning && (
        <div className="space-y-2" data-testid={`backfill-progress-${liveJob.key}`}>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {liveJob.processedCount} / {liveJob.totalRecords ?? "?"} processed
              {liveJob.updatedCount > 0 && ` • ${liveJob.updatedCount} updated`}
            </span>
            <span className="flex items-center gap-2">
              <span>{pct}%</span>
              {runStartedAtRef.current && (
                <span className="text-muted-foreground">
                  Elapsed: <ElapsedTimer startedAt={runStartedAtRef.current} />
                </span>
              )}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
              data-testid={`backfill-progress-bar-${liveJob.key}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function BackfillManager() {
  const { data: jobs = [], isLoading, refetch } = useQuery<BackfillJobStatus[]>({
    queryKey: ["/api/admin/backfills"],
    refetchInterval: false,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Data Backfills</h2>
          <p className="text-xs text-muted-foreground mt-0.5">One-off jobs that retroactively fill in missing data for existing records.</p>
        </div>
        <button
          data-testid="backfill-refresh"
          onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted/50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">No backfill jobs defined</div>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => (
            <BackfillCard
              key={job.key}
              job={job}
              onRunSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/backfills"] })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
