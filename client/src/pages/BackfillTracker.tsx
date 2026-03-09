import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle2, AlertCircle, Clock, RefreshCw } from "lucide-react";

interface BackfillPodcast {
  index: number;
  name: string;
  itunesId: string;
  hasTaddyUuid: boolean;
  transcriptCount: number;
  target: number;
  remaining: number;
  status: "done" | "no_taddy" | "pending";
}

interface BackfillData {
  podcasts: BackfillPodcast[];
  totalTranscripts: number;
  totalPodcasts: number;
  podcastsComplete: number;
}

export default function BackfillTracker() {
  const [filter, setFilter] = useState<"all" | "done" | "pending" | "no_taddy">("all");

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

  const filtered = data.podcasts.filter(p => filter === "all" || p.status === filter);
  const doneCount = data.podcasts.filter(p => p.status === "done").length;
  const pendingCount = data.podcasts.filter(p => p.status === "pending").length;
  const noTaddyCount = data.podcasts.filter(p => p.status === "no_taddy").length;

  return (
    <div data-testid="backfill-tracker">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-black/[0.03] rounded-xl p-4 text-center" data-testid="stat-total-transcripts">
          <div className="text-2xl font-bold text-foreground">{data.totalTranscripts.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground font-medium mt-1">Total Transcripts</div>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4 text-center" data-testid="stat-podcasts-complete">
          <div className="text-2xl font-bold text-emerald-600">{doneCount}</div>
          <div className="text-xs text-muted-foreground font-medium mt-1">Podcasts Complete</div>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 text-center" data-testid="stat-podcasts-pending">
          <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
          <div className="text-xs text-muted-foreground font-medium mt-1">Pending</div>
        </div>
        <div className="bg-red-50 rounded-xl p-4 text-center" data-testid="stat-podcasts-no-taddy">
          <div className="text-2xl font-bold text-red-500">{noTaddyCount}</div>
          <div className="text-xs text-muted-foreground font-medium mt-1">No Taddy</div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {(["all", "done", "pending", "no_taddy"] as const).map(f => (
            <button
              key={f}
              data-testid={`filter-${f}`}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filter === f
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
              }`}
            >
              {f === "all" ? `All (${data.podcasts.length})` :
               f === "done" ? `Done (${doneCount})` :
               f === "pending" ? `Pending (${pendingCount})` :
               `No Taddy (${noTaddyCount})`}
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
              return (
                <tr
                  key={p.itunesId}
                  data-testid={`row-podcast-${p.itunesId}`}
                  className="border-t border-black/[0.04] hover:bg-black/[0.02] transition-colors"
                >
                  <td className="px-4 py-2.5 text-xs text-muted-foreground font-medium">{p.index}</td>
                  <td className="px-4 py-2.5 text-sm font-medium text-foreground">{p.name}</td>
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
                            pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-400" : "bg-black/[0.06]"
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
                    ) : p.status === "no_taddy" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-red-500" data-testid={`status-no-taddy-${p.itunesId}`}>
                        <AlertCircle className="w-3.5 h-3.5" />
                        No Taddy
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600" data-testid={`status-pending-${p.itunesId}`}>
                        <Clock className="w-3.5 h-3.5" />
                        Pending
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground mt-3 text-center">
        Auto-refreshes every 10 seconds
      </p>
    </div>
  );
}
