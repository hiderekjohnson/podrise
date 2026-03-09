import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle2, AlertCircle, Clock, RefreshCw, Play, ListOrdered, AlertTriangle } from "lucide-react";

interface BackfillPodcast {
  index: number;
  name: string;
  itunesId: string;
  hasTaddyUuid: boolean;
  transcriptCount: number;
  target: number;
  remaining: number;
  status: "done" | "no_taddy" | "pending" | "in_process" | "in_queue" | "error";
  error?: string;
}

interface BackfillData {
  podcasts: BackfillPodcast[];
  totalTranscripts: number;
  totalPodcasts: number;
  podcastsComplete: number;
  backfillRunning: boolean;
  backfillCurrentName: string | null;
  backfillCurrentIndex: number | null;
}

export default function BackfillTracker() {
  const [filter, setFilter] = useState<"all" | "done" | "in_process" | "in_queue" | "error" | "no_taddy">("all");
  const [expandedError, setExpandedError] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<BackfillData>({
    queryKey: ["/api/admin/backfill-status"],
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="backfill-loading">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) return null;

  const filtered = data.podcasts.filter(p => {
    if (filter === "all") return true;
    if (filter === "error") return p.status === "error" || p.status === "no_taddy";
    return p.status === filter;
  });

  const counts = {
    done: data.podcasts.filter(p => p.status === "done").length,
    in_process: data.podcasts.filter(p => p.status === "in_process").length,
    in_queue: data.podcasts.filter(p => p.status === "in_queue").length,
    pending: data.podcasts.filter(p => p.status === "pending").length,
    error: data.podcasts.filter(p => p.status === "error" || p.status === "no_taddy").length,
  };

  return (
    <div data-testid="backfill-tracker">
      {data.backfillRunning && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-center gap-3" data-testid="backfill-running-banner">
          <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
          <div>
            <span className="text-sm font-bold text-blue-700">Backfill Running</span>
            {data.backfillCurrentName && (
              <span className="text-sm text-blue-600 ml-2">
                — Currently processing: <strong>{data.backfillCurrentName}</strong> ({data.backfillCurrentIndex}/{data.totalPodcasts})
              </span>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div className="bg-black/[0.03] rounded-xl p-4 text-center" data-testid="stat-total-transcripts">
          <div className="text-2xl font-bold text-foreground">{data.totalTranscripts.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground font-medium mt-1">Total Transcripts</div>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4 text-center" data-testid="stat-podcasts-complete">
          <div className="text-2xl font-bold text-emerald-600">{counts.done}</div>
          <div className="text-xs text-muted-foreground font-medium mt-1">Done</div>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 text-center" data-testid="stat-in-process">
          <div className="text-2xl font-bold text-blue-600">{counts.in_process}</div>
          <div className="text-xs text-muted-foreground font-medium mt-1">In Process</div>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 text-center" data-testid="stat-in-queue">
          <div className="text-2xl font-bold text-amber-600">{counts.in_queue}</div>
          <div className="text-xs text-muted-foreground font-medium mt-1">In Queue</div>
        </div>
        <div className="bg-red-50 rounded-xl p-4 text-center" data-testid="stat-errors">
          <div className="text-2xl font-bold text-red-500">{counts.error}</div>
          <div className="text-xs text-muted-foreground font-medium mt-1">Errors</div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2 flex-wrap">
          {([
            { key: "all" as const, label: `All (${data.podcasts.length})` },
            { key: "done" as const, label: `Done (${counts.done})` },
            { key: "in_process" as const, label: `In Process (${counts.in_process})` },
            { key: "in_queue" as const, label: `In Queue (${counts.in_queue})` },
            { key: "error" as const, label: `Errors (${counts.error})` },
          ]).map(f => (
            <button
              key={f.key}
              data-testid={`filter-${f.key}`}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filter === f.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          data-testid="button-refresh-backfill"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-black/[0.03] transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="border border-black/[0.06] rounded-xl overflow-hidden">
        <table className="w-full" data-testid="table-backfill">
          <thead>
            <tr className="bg-black/[0.03]">
              <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground">#</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground">Podcast</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-muted-foreground">Transcripts</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-muted-foreground">Remaining</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-muted-foreground">Progress</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const pct = Math.min(100, Math.round((p.transcriptCount / p.target) * 100));
              const isActive = p.status === "in_process";
              const hasError = p.status === "error" || p.status === "no_taddy";
              const isExpanded = expandedError === p.itunesId;
              return (
                <>
                  <tr
                    key={p.itunesId}
                    data-testid={`row-podcast-${p.itunesId}`}
                    className={`border-t border-black/[0.04] transition-colors ${
                      isActive ? "bg-blue-50/50" : hasError ? "bg-red-50/30" : "hover:bg-black/[0.02]"
                    } ${hasError && p.error ? "cursor-pointer" : ""}`}
                    onClick={() => {
                      if (hasError && p.error) {
                        setExpandedError(isExpanded ? null : p.itunesId);
                      }
                    }}
                  >
                    <td className="px-4 py-2.5 text-xs text-muted-foreground font-medium">{p.index}</td>
                    <td className="px-4 py-2.5 text-sm font-medium text-foreground">
                      {isActive && <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-2" />}
                      {p.name}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-sm font-bold text-foreground">{p.transcriptCount}</span>
                      <span className="text-xs text-muted-foreground">/{p.target}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-medium text-muted-foreground">
                      {p.remaining > 0 ? p.remaining : "-"}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="w-full max-w-[120px] mx-auto">
                        <div className="h-2 bg-black/[0.06] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              pct >= 100 ? "bg-emerald-500" : isActive ? "bg-blue-500" : hasError ? "bg-red-400" : pct > 0 ? "bg-amber-400" : "bg-black/[0.06]"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {p.status === "done" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600" data-testid={`status-done-${p.itunesId}`}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Done
                        </span>
                      ) : p.status === "in_process" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600" data-testid={`status-in-process-${p.itunesId}`}>
                          <Play className="w-3.5 h-3.5" />
                          In Process
                        </span>
                      ) : p.status === "in_queue" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600" data-testid={`status-in-queue-${p.itunesId}`}>
                          <ListOrdered className="w-3.5 h-3.5" />
                          In Queue
                        </span>
                      ) : p.status === "error" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-500" data-testid={`status-error-${p.itunesId}`}>
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Error
                        </span>
                      ) : p.status === "no_taddy" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-500" data-testid={`status-no-taddy-${p.itunesId}`}>
                          <AlertCircle className="w-3.5 h-3.5" />
                          No Taddy
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-400" data-testid={`status-pending-${p.itunesId}`}>
                          <Clock className="w-3.5 h-3.5" />
                          Pending
                        </span>
                      )}
                    </td>
                  </tr>
                  {isExpanded && p.error && (
                    <tr key={`${p.itunesId}-error`} className="bg-red-50/50">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex items-start gap-2 text-xs text-red-700 font-medium" data-testid={`error-detail-${p.itunesId}`}>
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <span>{p.error}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground mt-3 text-center">
        Auto-refreshes every 10 seconds — click any error row to see details
      </p>
    </div>
  );
}
