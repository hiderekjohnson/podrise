import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Database, Eye, X, Clock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface TranscriptLogEntry {
  id: number;
  userId: number | null;
  podcastName: string;
  podcastId: string;
  episodeTitle: string;
  episodeGuid: string | null;
  taddyUuid: string | null;
  status: string;
  transcriptLength: number | null;
  errorMessage: string | null;
  createdAt: string | null;
}

function statusBadge(status: string) {
  switch (status) {
    case "fetched":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700" data-testid="badge-fetched">
          <CheckCircle2 className="w-3 h-3" />
          Fetched
        </span>
      );
    case "cached":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700" data-testid="badge-cached">
          <Database className="w-3 h-3" />
          Cached
        </span>
      );
    case "empty":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700" data-testid="badge-empty">
          <AlertTriangle className="w-3 h-3" />
          Empty
        </span>
      );
    case "no_match":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700" data-testid="badge-no-match">
          <AlertTriangle className="w-3 h-3" />
          No Match
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700" data-testid="badge-error">
          <XCircle className="w-3 h-3" />
          Error
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
          {status}
        </span>
      );
  }
}

function formatTime(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function TranscriptLogs() {
  const [viewingTranscript, setViewingTranscript] = useState<{ title: string; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: logs, isLoading } = useQuery<TranscriptLogEntry[]>({
    queryKey: ["/api/admin/transcript-logs"],
  });

  const handleViewTranscript = async (log: TranscriptLogEntry) => {
    try {
      const endpoint = log.episodeGuid
        ? `/api/admin/transcripts/by-guid/${encodeURIComponent(log.episodeGuid)}`
        : `/api/admin/transcripts/by-guid/${encodeURIComponent(log.episodeTitle)}`;
      const res = await apiRequest("GET", endpoint);
      const data = await res.json();
      setViewingTranscript({ title: data.episodeTitle, text: data.transcript });
    } catch {
      setViewingTranscript({ title: log.episodeTitle, text: "Transcript not found in database. It may not have been saved successfully." });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const filteredLogs = statusFilter === "all"
    ? (logs || [])
    : (logs || []).filter(l => l.status === statusFilter);

  const statusCounts = (logs || []).reduce((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setStatusFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === "all" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-black/[0.03]"}`}
          data-testid="filter-all"
        >
          All ({logs?.length || 0})
        </button>
        {Object.entries(statusCounts).map(([status, count]) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === status ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-black/[0.03]"}`}
            data-testid={`filter-${status}`}
          >
            {status.replace("_", " ")} ({count})
          </button>
        ))}
      </div>

      {filteredLogs.length === 0 ? (
        <div className="text-center py-16">
          <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No transcript logs yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Logs will appear here when recaps are generated.</p>
        </div>
      ) : (
        <div className="border border-black/[0.06] rounded-xl overflow-hidden">
          <table className="w-full text-sm" data-testid="table-transcript-logs">
            <thead>
              <tr className="bg-black/[0.02] border-b border-black/[0.06]">
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Time</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Podcast</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Episode</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Length</th>
                <th className="text-center px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">View</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-black/[0.04] last:border-0 hover:bg-black/[0.015] transition-colors"
                  data-testid={`row-log-${log.id}`}
                >
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {formatTime(log.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground text-[13px]">{log.podcastName}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">ID: {log.podcastId}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[13px] text-foreground max-w-[250px] truncate">{log.episodeTitle}</p>
                    {log.errorMessage && (
                      <p className="text-xs text-red-500 mt-0.5 max-w-[250px] truncate" title={log.errorMessage}>
                        {log.errorMessage}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {statusBadge(log.status)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                    {log.transcriptLength ? `${(log.transcriptLength / 1000).toFixed(1)}K` : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {(log.status === "fetched" || log.status === "cached") && (
                      <button
                        onClick={() => handleViewTranscript(log)}
                        className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
                        title="View transcript"
                        data-testid={`button-view-transcript-${log.id}`}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewingTranscript && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" data-testid="modal-transcript">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="flex-1 min-w-0 mr-4">
                <h3 className="text-sm font-bold text-foreground truncate">{viewingTranscript.title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{(viewingTranscript.text.length / 1000).toFixed(1)}K characters</p>
              </div>
              <button
                onClick={() => setViewingTranscript(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors shrink-0"
                data-testid="button-close-transcript"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto px-6 py-4">
              <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono leading-relaxed">
                {viewingTranscript.text}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
