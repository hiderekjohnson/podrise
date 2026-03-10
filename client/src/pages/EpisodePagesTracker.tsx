import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, CheckCircle2, RefreshCw, ArrowUp, ArrowDown, AlertCircle, Square, Zap, CircleDot, RotateCcw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface RecapQuality {
  tldl: number;
  whatHappened: number;
  insights: number;
  quote: number;
  topics: number;
  questions: number;
  guests: number;
  sponsors: number;
  resources: number;
}

interface EpisodePagePodcast {
  name: string;
  itunesId: string;
  transcriptCount: number;
  completeTranscriptCount: number;
  recapCount: number;
  remaining: number;
  pct: number;
  status: "complete" | "incomplete" | "processing";
  quality: RecapQuality;
}

interface EpisodePagesData {
  podcasts: EpisodePagePodcast[];
  totalTranscripts: number;
  totalRecaps: number;
  totalRemaining: number;
  totalPodcasts: number;
  podcastsComplete: number;
  podcastsIncomplete: number;
  podcastsProcessing: number;
}

interface GenStatus {
  running: boolean;
  autoQueue: boolean;
  currentItunesId: string | null;
  currentPodcastName: string | null;
  currentEpisode: number;
  totalEpisodes: number;
  generated: number;
  failed: number;
  skipped: number;
  completedPodcasts: string[];
}

export default function EpisodePagesTracker() {
  const [filter, setFilter] = useState<"all" | "complete" | "incomplete" | "processing">("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<"name" | "transcriptCount" | "recapCount" | "remaining" | "pct">("remaining");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const { toast } = useToast();

  const { data, isLoading, isError, refetch, isFetching } = useQuery<EpisodePagesData>({
    queryKey: ["/api/admin/episode-pages-status"],
    refetchInterval: 10000,
  });

  const { data: genStatus } = useQuery<GenStatus>({
    queryKey: ["/api/admin/episode-pages-generate/status"],
    refetchInterval: 2000,
  });

  const startAuto = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/episode-pages-generate-auto");
    },
    onSuccess: () => {
      toast({ title: "Auto-Queue Started", description: "Processing all podcasts one by one." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to start", variant: "destructive" });
    },
  });

  const reprocess = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/episode-pages-reprocess");
    },
    onSuccess: () => {
      toast({ title: "Reprocessing Started", description: "Filling in missing data for existing episode pages." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to start reprocessing", variant: "destructive" });
    },
  });

  const stopGen = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/episode-pages-generate/stop");
    },
    onSuccess: () => {
      toast({ title: "Stopped", description: "Generation stopped." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/episode-pages-status"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="episode-pages-loading">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3" data-testid="episode-pages-error">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-sm font-bold text-muted-foreground">Failed to load episode pages data</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all"
          data-testid="button-retry-pages"
        >
          Retry
        </button>
      </div>
    );
  }

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
      return p.status === filter;
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortCol === "name") return dir * a.name.localeCompare(b.name);
      return dir * ((a[sortCol] || 0) - (b[sortCol] || 0));
    });

  const overallPct = data.totalTranscripts > 0 ? Math.min(100, Math.round((data.totalRecaps / data.totalTranscripts) * 100)) : 0;
  const isRunning = genStatus?.running ?? false;

  return (
    <div data-testid="episode-pages-tracker">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-black/[0.03] rounded-xl p-4 text-center" data-testid="stat-total-transcripts">
          <div className="text-2xl font-black text-foreground">{data.totalTranscripts.toLocaleString()}</div>
          <div className="text-xs font-bold text-muted-foreground mt-1">Transcripts Available</div>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4 text-center" data-testid="stat-total-recaps">
          <div className="text-2xl font-black text-emerald-700">{data.totalRecaps.toLocaleString()}</div>
          <div className="text-xs font-bold text-emerald-600 mt-1">Episode Pages Done</div>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 text-center" data-testid="stat-total-remaining">
          <div className="text-2xl font-black text-amber-700">{data.totalRemaining.toLocaleString()}</div>
          <div className="text-xs font-bold text-amber-600 mt-1">Pages Remaining</div>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 text-center" data-testid="stat-overall-pct">
          <div className="text-2xl font-black text-blue-700">{overallPct}%</div>
          <div className="text-xs font-bold text-blue-600 mt-1">Overall Progress</div>
        </div>
      </div>

      <div className="bg-black/[0.03] rounded-xl p-3 mb-6" data-testid="progress-bar-container">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-muted-foreground">Episode Page Generation Progress</span>
          <span className="text-xs font-bold text-foreground">{data.totalRecaps.toLocaleString()} / {data.totalTranscripts.toLocaleString()}</span>
        </div>
        <div className="w-full h-3 bg-black/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${overallPct}%` }}
            data-testid="progress-bar"
          />
        </div>
      </div>

      {isRunning && genStatus && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6" data-testid="gen-status-panel">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span className="text-sm font-bold text-blue-800">
                {genStatus.autoQueue ? "Auto-Queue: " : ""}Generating pages for {genStatus.currentPodcastName || "..."}
              </span>
            </div>
            <button
              data-testid="button-stop-gen"
              onClick={() => stopGen.mutate()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200 transition-all"
            >
              <Square className="w-3 h-3" />
              Stop
            </button>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-lg font-black text-blue-700">{genStatus.currentEpisode}/{genStatus.totalEpisodes}</div>
              <div className="text-[10px] font-bold text-blue-500">Progress</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-black text-emerald-700">{genStatus.generated}</div>
              <div className="text-[10px] font-bold text-emerald-500">Generated</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-black text-red-600">{genStatus.failed}</div>
              <div className="text-[10px] font-bold text-red-400">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-black text-gray-600">{genStatus.skipped}</div>
              <div className="text-[10px] font-bold text-gray-400">Skipped</div>
            </div>
          </div>
          {genStatus.totalEpisodes > 0 && (
            <div className="mt-3">
              <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.round((genStatus.currentEpisode / genStatus.totalEpisodes) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2 flex-wrap">
          {([
            { key: "all" as const, label: `All (${data.totalPodcasts})` },
            { key: "complete" as const, label: `Complete (${data.podcastsComplete})` },
            { key: "incomplete" as const, label: `Incomplete (${data.podcastsIncomplete})` },
            { key: "processing" as const, label: `Processing (${data.podcastsProcessing})` },
          ]).map(f => (
            <button
              key={f.key}
              data-testid={`filter-pages-${f.key}`}
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
        <div className="flex items-center gap-2">
          {!isRunning ? (
            <>
              <button
                data-testid="button-reprocess"
                onClick={() => {
                  if (confirm("Reprocess all existing episode pages to fill in missing data (guests, sponsors, resources)?")) {
                    reprocess.mutate();
                  }
                }}
                disabled={reprocess.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-700 hover:bg-amber-200 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reprocess Incomplete
              </button>
              <button
                data-testid="button-auto-queue"
                onClick={() => {
                  if (confirm("Start auto-generating episode pages for all incomplete podcasts, one at a time?")) {
                    startAuto.mutate();
                  }
                }}
                disabled={startAuto.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
              >
                <Zap className="w-3.5 h-3.5" />
                Start Processing
              </button>
            </>
          ) : (
            <button
              data-testid="button-stop-auto"
              onClick={() => stopGen.mutate()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200 transition-all"
            >
              <Square className="w-3.5 h-3.5" />
              Stop
            </button>
          )}
          <button
            data-testid="button-refresh-pages"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-black/[0.03] transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="border border-black/[0.06] rounded-xl overflow-hidden">
        <table className="w-full" data-testid="table-episode-pages">
          <thead>
            <tr className="bg-black/[0.03]">
              {([
                { col: "name" as const, label: "Podcast", align: "text-left" },
                { col: "transcriptCount" as const, label: "Transcripts", align: "text-center" },
                { col: "recapCount" as const, label: "Pages Done", align: "text-center" },
                { col: "remaining" as const, label: "Remaining", align: "text-center" },
                { col: "pct" as const, label: "Progress", align: "text-center" },
              ]).map(h => (
                <th
                  key={h.col}
                  className={`${h.align} px-4 py-3 text-xs font-bold text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors`}
                  onClick={() => toggleSort(h.col)}
                  data-testid={`sort-pages-${h.col}`}
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
              const isExpanded = expandedRow === p.itunesId;
              const isProcessing = p.status === "processing";
              return (
                <Fragment key={p.itunesId}>
                  <tr
                    data-testid={`row-pages-${p.itunesId}`}
                    className={`border-t border-black/[0.04] transition-colors cursor-pointer ${
                      isProcessing ? "bg-blue-50/50" : p.status === "complete" ? "hover:bg-emerald-50/30" : "hover:bg-black/[0.02]"
                    } ${isExpanded ? "bg-blue-50/30" : ""}`}
                    onClick={() => setExpandedRow(isExpanded ? null : p.itunesId)}
                  >
                    <td className="px-4 py-2.5 text-sm font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />}
                        {p.name}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-medium text-muted-foreground">
                      {p.transcriptCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-600">
                      {p.recapCount > 0 ? p.recapCount.toLocaleString() : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-medium text-muted-foreground">
                      {p.remaining > 0 ? p.remaining.toLocaleString() : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-black/[0.06] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              p.pct >= 100 ? "bg-emerald-500" : p.pct > 0 ? "bg-blue-500" : "bg-gray-300"
                            }`}
                            style={{ width: `${Math.min(100, p.pct)}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-muted-foreground w-8">{p.pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {p.status === "complete" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600" data-testid={`status-pages-complete-${p.itunesId}`}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Complete
                        </span>
                      ) : isProcessing ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600" data-testid={`status-pages-processing-${p.itunesId}`}>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Processing
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600" data-testid={`status-pages-incomplete-${p.itunesId}`}>
                          <CircleDot className="w-3.5 h-3.5" />
                          Incomplete
                        </span>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-blue-50/20 border-t border-black/[0.04]">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="text-xs font-bold text-muted-foreground mb-2">Recap Quality Breakdown ({p.recapCount} pages)</div>
                        {p.recapCount > 0 ? (
                          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
                            {([
                              { label: "TLDL", value: p.quality.tldl, key: "tldl" },
                              { label: "Chapters", value: p.quality.whatHappened, key: "whatHappened" },
                              { label: "Key Insights", value: p.quality.insights, key: "insights" },
                              { label: "Quote", value: p.quality.quote, key: "quote" },
                              { label: "Key Topics", value: p.quality.topics, key: "topics" },
                              { label: "Q&A", value: p.quality.questions, key: "questions" },
                              { label: "Guests", value: p.quality.guests, key: "guests" },
                              { label: "Sponsors", value: p.quality.sponsors, key: "sponsors" },
                              { label: "Resources", value: p.quality.resources, key: "resources" },
                            ]).map(q => {
                              const qPct = p.recapCount > 0 ? Math.round((q.value / p.recapCount) * 100) : 0;
                              return (
                                <div
                                  key={q.key}
                                  className={`rounded-lg p-2 text-center ${
                                    qPct >= 90 ? "bg-emerald-50" : qPct > 0 ? "bg-amber-50" : "bg-red-50"
                                  }`}
                                  data-testid={`quality-${q.key}-${p.itunesId}`}
                                >
                                  <div className={`text-sm font-black ${
                                    qPct >= 90 ? "text-emerald-700" : qPct > 0 ? "text-amber-700" : "text-red-500"
                                  }`}>
                                    {q.value}/{p.recapCount}
                                  </div>
                                  <div className="text-[10px] font-bold text-muted-foreground mt-0.5">{q.label}</div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <AlertCircle className="w-3.5 h-3.5" />
                            No episode pages generated yet — {p.transcriptCount} transcripts ready for processing
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black/[0.08] bg-black/[0.03]">
              <td className="px-4 py-3 text-sm font-bold text-foreground" data-testid="total-page-podcasts">
                {filtered.length} Podcasts
              </td>
              <td className="px-4 py-3 text-center text-sm font-bold text-foreground" data-testid="total-page-transcripts">
                {filtered.reduce((s, p) => s + p.transcriptCount, 0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-center text-sm font-bold text-emerald-600" data-testid="total-page-recaps">
                {filtered.reduce((s, p) => s + p.recapCount, 0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-center text-sm font-bold text-foreground" data-testid="total-page-remaining">
                {filtered.reduce((s, p) => s + p.remaining, 0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-center text-sm font-bold text-foreground" data-testid="total-page-pct">
                {(() => {
                  const ft = filtered.reduce((s, p) => s + p.transcriptCount, 0);
                  const fr = filtered.reduce((s, p) => s + p.recapCount, 0);
                  return ft > 0 ? Math.min(100, Math.round((fr / ft) * 100)) : 0;
                })()}%
              </td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-muted-foreground mt-3 text-center">
        Click any row to see recap quality breakdown — status refreshes every 10 seconds
      </p>
    </div>
  );
}
