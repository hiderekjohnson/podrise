import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle2, AlertCircle, Clock, RefreshCw, Play, ListOrdered, AlertTriangle, ArrowUp, ArrowDown } from "lucide-react";

interface BackfillPodcast {
  index: number;
  name: string;
  itunesId: string;
  hasTaddyUuid: boolean;
  transcriptCount: number;
  completeCount: number;
  target: number;
  remaining: number;
  totalEpisodes: number;
  status: "done" | "no_taddy" | "in_process" | "in_queue" | "error";
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
  const [sortCol, setSortCol] = useState<"name" | "totalEpisodes" | "transcriptCount" | "completeCount" | "remaining">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir(col === "name" ? "asc" : "desc");
    }
  };

  const filtered = data.podcasts
    .filter(p => {
      if (filter === "all") return true;
      if (filter === "error") return p.status === "error" || p.status === "no_taddy";
      return p.status === filter;
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortCol === "name") return dir * a.name.localeCompare(b.name);
      return dir * ((a[sortCol] || 0) - (b[sortCol] || 0));
    });

  const counts = {
    done: data.podcasts.filter(p => p.status === "done").length,
    in_process: data.podcasts.filter(p => p.status === "in_process").length,
    in_queue: data.podcasts.filter(p => p.status === "in_queue").length,
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


      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2 flex-wrap">
          {([
            { key: "all" as const, label: `All Podcasts (${data.podcasts.length})` },
            { key: "done" as const, label: `Done Podcasts (${counts.done})` },
            { key: "in_process" as const, label: `In Process Podcasts (${counts.in_process})` },
            { key: "in_queue" as const, label: `In Queue Podcasts (${counts.in_queue})` },
            { key: "error" as const, label: `Error Podcasts (${counts.error})` },
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
              {([
                { col: "name" as const, label: "Podcast", align: "text-left" },
                { col: "totalEpisodes" as const, label: "Total Episodes", align: "text-center" },
                { col: "transcriptCount" as const, label: "Transcripts", align: "text-center" },
                { col: "completeCount" as const, label: "Complete Records", align: "text-center" },
                { col: "remaining" as const, label: "Remaining", align: "text-center" },
              ]).map(h => (
                <th
                  key={h.col}
                  className={`${h.align} px-4 py-3 text-xs font-bold text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors`}
                  onClick={() => toggleSort(h.col)}
                  data-testid={`sort-${h.col}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {h.label}
                    {sortCol === h.col ? (
                      sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    ) : null}
                  </span>
                </th>
              ))}
              <th className="text-center px-4 py-3 text-xs font-bold text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
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
                    <td className="px-4 py-2.5 text-sm font-medium text-foreground">
                      {isActive && <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-2" />}
                      {p.name}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-medium text-muted-foreground">
                      {p.totalEpisodes > 0 ? p.totalEpisodes.toLocaleString() : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-foreground">
                      {p.transcriptCount}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-600">
                      {p.completeCount > 0 ? p.completeCount : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-medium text-muted-foreground">
                      {p.remaining > 0 ? p.remaining.toLocaleString() : "-"}
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
                      ) : null}
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
          <tfoot>
            <tr className="border-t-2 border-black/[0.08] bg-black/[0.03]">
              <td className="px-4 py-3 text-sm font-bold text-foreground" data-testid="total-podcasts">
                {filtered.length} Podcasts
              </td>
              <td className="px-4 py-3 text-center text-sm font-bold text-foreground" data-testid="total-episodes">
                {filtered.reduce((sum, p) => sum + p.totalEpisodes, 0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-center text-sm font-bold text-foreground" data-testid="total-transcripts">
                {filtered.reduce((sum, p) => sum + p.transcriptCount, 0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-center text-sm font-bold text-emerald-600" data-testid="total-complete-records">
                {filtered.reduce((sum, p) => sum + p.completeCount, 0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-center text-sm font-bold text-foreground" data-testid="total-remaining">
                {filtered.reduce((sum, p) => sum + p.remaining, 0).toLocaleString()}
              </td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-muted-foreground mt-3 text-center">
        Auto-refreshes every 10 seconds — click any error row to see details
      </p>
    </div>
  );
}
