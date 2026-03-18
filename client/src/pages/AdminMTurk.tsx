import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Copy, Check, Loader2, UserPlus, Users, ToggleLeft, ToggleRight, Trash2, ExternalLink, Youtube, BarChart3 } from "lucide-react";

interface Worker {
  id: number;
  name: string;
  token: string;
  active: boolean;
  created_at: string;
  total_reviewed: number;
  confirmed: number;
  skipped: number;
  no_video: number;
  last_active: string | null;
}

interface OverallStats {
  total_episodes: number;
  finalized: number;
  confirmed: number;
  skipped: number;
  no_video: number;
}

export default function AdminMTurk() {
  const { toast } = useToast();
  const [newWorkerName, setNewWorkerName] = useState("");
  const [copiedToken, setCopiedToken] = useState<number | null>(null);

  const { data: workersData, isLoading } = useQuery<{ workers: Worker[] }>({
    queryKey: ["/api/admin/mturk/workers"],
  });

  const { data: stats } = useQuery<OverallStats>({
    queryKey: ["/api/admin/mturk/stats"],
  });

  const createWorker = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/admin/mturk/workers", { name });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Worker created" });
      setNewWorkerName("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mturk/workers"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleWorker = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/mturk/workers/${id}`, { active });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mturk/workers"] });
    },
  });

  const deleteWorker = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/mturk/workers/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Worker removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mturk/workers"] });
    },
  });

  const workers = workersData?.workers || [];
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const copyLink = (worker: Worker) => {
    const link = `${baseUrl}/youtube-review/${worker.token}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(worker.id);
    setTimeout(() => setCopiedToken(null), 2000);
    toast({ title: "Link copied!" });
  };

  const formatDate = (d: string | null) => {
    if (!d) return "Never";
    return new Date(d).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    });
  };

  const totalReviewed = stats ? stats.confirmed + stats.skipped + stats.no_video : 0;
  const progressPct = stats && stats.total_episodes > 0 ? Math.round((stats.finalized / stats.total_episodes) * 100) : 0;

  return (
    <div className="space-y-6" data-testid="admin-mturk">
      {stats && (
        <div className="glass-panel rounded-2xl p-5 space-y-4" data-testid="mturk-overall-stats">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-bold text-foreground">YouTube Matching Progress</h3>
          </div>
          <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-red-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-xl font-bold text-foreground" data-testid="stat-total">{stats.total_episodes}</p>
              <p className="text-xs text-muted-foreground">Total Episodes</p>
            </div>
            <div className="bg-green-50 dark:bg-green-950/30 rounded-xl p-3">
              <p className="text-xl font-bold text-green-600" data-testid="stat-finalized">{stats.finalized}</p>
              <p className="text-xs text-muted-foreground">Finalized</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-3">
              <p className="text-xl font-bold text-blue-600" data-testid="stat-confirmed">{stats.confirmed}</p>
              <p className="text-xs text-muted-foreground">Confirmed</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900/30 rounded-xl p-3">
              <p className="text-xl font-bold text-muted-foreground" data-testid="stat-skipped">{stats.skipped}</p>
              <p className="text-xs text-muted-foreground">Skipped</p>
            </div>
            <div className="bg-red-50 dark:bg-red-950/30 rounded-xl p-3">
              <p className="text-xl font-bold text-red-500" data-testid="stat-no-video">{stats.no_video}</p>
              <p className="text-xs text-muted-foreground">No Video</p>
            </div>
          </div>
        </div>
      )}

      <div className="glass-panel rounded-2xl p-5" data-testid="mturk-add-worker">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
          <UserPlus className="w-4 h-4 text-primary" />
          Add Worker
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={newWorkerName}
            onChange={(e) => setNewWorkerName(e.target.value)}
            placeholder="Worker name (e.g., Amanda)"
            className="flex-1 h-10 px-4 bg-white dark:bg-zinc-900 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            data-testid="input-worker-name"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newWorkerName.trim()) createWorker.mutate(newWorkerName.trim());
            }}
          />
          <button
            onClick={() => newWorkerName.trim() && createWorker.mutate(newWorkerName.trim())}
            disabled={!newWorkerName.trim() || createWorker.isPending}
            className="h-10 px-5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
            data-testid="button-add-worker"
          >
            {createWorker.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden" data-testid="mturk-workers-table">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Workers ({workers.length})</h3>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : workers.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            No workers yet. Add one above to get started.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {workers.map((w) => (
              <div key={w.id} className={`px-5 py-4 ${!w.active ? "opacity-60" : ""}`} data-testid={`worker-row-${w.id}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${w.active ? "bg-green-500" : "bg-zinc-400"}`} />
                    <div>
                      <span className="font-bold text-sm text-foreground" data-testid={`text-worker-name-${w.id}`}>{w.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">Added {formatDate(w.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => copyLink(w)}
                      className="h-8 px-3 bg-muted hover:bg-muted/80 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      data-testid={`button-copy-link-${w.id}`}
                    >
                      {copiedToken === w.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedToken === w.id ? "Copied!" : "Copy Link"}
                    </button>
                    <a
                      href={`/youtube-review/${w.token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-8 w-8 bg-muted hover:bg-muted/80 rounded-lg flex items-center justify-center transition-colors"
                      data-testid={`link-open-worker-${w.id}`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => toggleWorker.mutate({ id: w.id, active: !w.active })}
                      className="h-8 w-8 bg-muted hover:bg-muted/80 rounded-lg flex items-center justify-center transition-colors"
                      title={w.active ? "Deactivate" : "Activate"}
                      data-testid={`button-toggle-worker-${w.id}`}
                    >
                      {w.active ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4 text-zinc-400" />}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${w.name}? Their review history will remain.`)) {
                          deleteWorker.mutate(w.id);
                        }
                      }}
                      className="h-8 w-8 bg-muted hover:bg-red-100 dark:hover:bg-red-950/30 rounded-lg flex items-center justify-center transition-colors"
                      data-testid={`button-delete-worker-${w.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  <div className="bg-muted/50 rounded-lg px-2.5 py-1.5">
                    <span className="text-muted-foreground">Reviewed: </span>
                    <span className="font-bold text-foreground" data-testid={`stat-reviewed-${w.id}`}>{w.total_reviewed}</span>
                  </div>
                  <div className="bg-green-50 dark:bg-green-950/20 rounded-lg px-2.5 py-1.5">
                    <span className="text-muted-foreground">Confirmed: </span>
                    <span className="font-bold text-green-600" data-testid={`stat-confirmed-${w.id}`}>{w.confirmed}</span>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-900/20 rounded-lg px-2.5 py-1.5">
                    <span className="text-muted-foreground">Skipped: </span>
                    <span className="font-bold" data-testid={`stat-skipped-${w.id}`}>{w.skipped}</span>
                  </div>
                  <div className="bg-red-50 dark:bg-red-950/20 rounded-lg px-2.5 py-1.5">
                    <span className="text-muted-foreground">No video: </span>
                    <span className="font-bold text-red-500" data-testid={`stat-no-video-${w.id}`}>{w.no_video}</span>
                  </div>
                  <div className="bg-muted/50 rounded-lg px-2.5 py-1.5">
                    <span className="text-muted-foreground">Last active: </span>
                    <span className="font-bold" data-testid={`stat-last-active-${w.id}`}>
                      {w.last_active ? new Date(w.last_active).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Never"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
