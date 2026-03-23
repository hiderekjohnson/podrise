import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, CheckCircle2, XCircle, AlertTriangle, Search,
  Radio, ShieldCheck, ShieldOff, ExternalLink, ArrowUpDown, Zap,
} from "lucide-react";

interface PodcastRow {
  id: number;
  name: string;
  slug: string;
  status: string;
  taddyUuid: string | null;
  artworkUrl: string | null;
  inTaddyFilter: boolean;
}

interface WebhookStatusData {
  webhook: {
    id: string;
    endpointUrl: string;
    isVerified: boolean;
    isActive: boolean;
    events: string[];
    filters: { uuid: string; eventType: string; hasIncludedUuids: boolean; includedUuids: string[] }[];
  } | null;
  filterUuids: string[];
  stats: {
    totalInDirectory: number;
    published: number;
    publishedWithUuid: number;
    inFilter: number;
    missingFromFilter: number;
    stalledInFilter: number;
  };
  podcasts: PodcastRow[];
}

type FilterMode = "all" | "published" | "unlisted" | "no-uuid" | "not-in-filter";
type SortKey = "name" | "status" | "filter";

export default function AdminTaddyWebhooks() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [pendingToggles, setPendingToggles] = useState<Set<number>>(new Set());

  const { data, isLoading, isError, refetch, isFetching } = useQuery<WebhookStatusData>({
    queryKey: ["/api/admin/taddy/webhook-status"],
    staleTime: 30_000,
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/taddy/sync-filters"),
    onSuccess: (res: any) => {
      toast({ title: "Filters synced", description: `${res.uuidCount} published podcast UUIDs pushed to Taddy.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/taddy/webhook-status"] });
    },
    onError: () => toast({ title: "Sync failed", description: "Could not update Taddy webhook filters.", variant: "destructive" }),
  });

  const toggleStatus = async (podcast: PodcastRow) => {
    const newStatus = podcast.status === "published" ? "unlisted" : "published";
    setPendingToggles(prev => new Set(prev).add(podcast.id));
    try {
      await apiRequest("PATCH", `/api/admin/podcast-directory/${podcast.id}/status`, { status: newStatus });
      toast({ title: `${podcast.name} → ${newStatus}`, description: newStatus === "unlisted" ? "Webhooks for this podcast will now be ignored." : "This podcast is now active in the pipeline." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/taddy/webhook-status"] });
    } catch {
      toast({ title: "Failed to update status", variant: "destructive" });
    } finally {
      setPendingToggles(prev => { const s = new Set(prev); s.delete(podcast.id); return s; });
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const filteredPodcasts = useMemo(() => {
    if (!data?.podcasts) return [];
    let rows = data.podcasts;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(p => p.name.toLowerCase().includes(q) || p.slug?.toLowerCase().includes(q) || p.taddyUuid?.toLowerCase().includes(q));
    }
    if (filterMode === "published") rows = rows.filter(p => p.status === "published");
    else if (filterMode === "unlisted") rows = rows.filter(p => p.status !== "published");
    else if (filterMode === "no-uuid") rows = rows.filter(p => !p.taddyUuid);
    else if (filterMode === "not-in-filter") rows = rows.filter(p => p.status === "published" && p.taddyUuid && !p.inTaddyFilter);
    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      else if (sortKey === "filter") cmp = (b.inTaddyFilter ? 1 : 0) - (a.inTaddyFilter ? 1 : 0);
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [data?.podcasts, search, filterMode, sortKey, sortAsc]);

  const { stats, webhook, filterUuids } = data ?? { stats: null, webhook: null, filterUuids: [] };

  const needsSync = (stats?.missingFromFilter ?? 0) > 0 || (stats?.stalledInFilter ?? 0) > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-amber-500" />
        <p className="font-semibold">Failed to load Taddy webhook status</p>
        <button onClick={() => refetch()} className="mt-3 text-sm text-primary hover:underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Radio className="w-5 h-5 text-primary" />
            Taddy Webhooks
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage which podcasts Taddy sends webhook events for. Published podcasts with a Taddy UUID should be in the filter.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-all"
            data-testid="button-refresh-webhook-status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
              needsSync
                ? "bg-amber-500 hover:bg-amber-600 text-white"
                : "bg-primary hover:bg-primary/90 text-white"
            }`}
            data-testid="button-sync-taddy-filters"
          >
            {syncMutation.isPending ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            {needsSync ? "Sync Now (out of sync)" : "Sync Filters"}
          </button>
        </div>
      </div>

      {/* Webhook Status Card */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          <Radio className="w-3.5 h-3.5" />
          Registered Webhook
        </div>
        {webhook ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Endpoint</div>
              <a href={webhook.endpointUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-mono text-primary hover:underline flex items-center gap-1 break-all">
                {webhook.endpointUrl}
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Verified</div>
              {webhook.isVerified ? (
                <span className="flex items-center gap-1 text-sm font-semibold text-green-600"><CheckCircle2 className="w-4 h-4" />Verified</span>
              ) : (
                <span className="flex items-center gap-1 text-sm font-semibold text-red-500"><XCircle className="w-4 h-4" />Not verified</span>
              )}
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Active</div>
              {webhook.isActive ? (
                <span className="flex items-center gap-1 text-sm font-semibold text-green-600"><CheckCircle2 className="w-4 h-4" />Active</span>
              ) : (
                <span className="flex items-center gap-1 text-sm font-semibold text-amber-500"><AlertTriangle className="w-4 h-4" />Inactive</span>
              )}
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Filter UUIDs (in Taddy)</div>
              <span className="text-sm font-bold">{filterUuids.length.toLocaleString()}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-600 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            No webhook registered with Taddy yet. Use the Taddy dashboard or API to register one.
          </div>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: "In Directory", value: stats.totalInDirectory, color: "text-foreground" },
            { label: "Published", value: stats.published, color: "text-green-600" },
            { label: "Have Taddy UUID", value: stats.publishedWithUuid, color: "text-blue-600" },
            { label: "In Taddy Filter", value: stats.inFilter, color: "text-primary" },
            {
              label: "Missing from Filter",
              value: stats.missingFromFilter,
              color: stats.missingFromFilter > 0 ? "text-amber-600" : "text-muted-foreground",
            },
            {
              label: "Stale in Filter",
              value: stats.stalledInFilter,
              color: stats.stalledInFilter > 0 ? "text-red-500" : "text-muted-foreground",
              tooltip: "Published UUIDs in Taddy but not published in our directory",
            },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-3 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Sync alert */}
      {needsSync && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/40 p-4">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-semibold text-amber-700 dark:text-amber-500">Taddy filter is out of sync.</span>{" "}
            <span className="text-amber-700/80 dark:text-amber-500/80">
              {stats?.missingFromFilter ? `${stats.missingFromFilter} published podcast${stats.missingFromFilter !== 1 ? "s" : ""} missing from Taddy filter.` : ""}
              {stats?.stalledInFilter ? ` ${stats.stalledInFilter} unpublished UUID${stats.stalledInFilter !== 1 ? "s" : ""} still in Taddy filter.` : ""}
              {" "}Click <strong>Sync Now</strong> to fix.
            </span>
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, slug, or Taddy UUID…"
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            data-testid="input-webhook-search"
          />
        </div>
        <div className="flex gap-1 bg-black/[0.03] rounded-xl p-1 flex-wrap">
          {(["all", "published", "unlisted", "no-uuid", "not-in-filter"] as FilterMode[]).map(m => (
            <button
              key={m}
              onClick={() => setFilterMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                filterMode === m ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`filter-${m}`}
            >
              {m === "all" ? "All" : m === "published" ? "Published" : m === "unlisted" ? "Unlisted" : m === "no-uuid" ? "No UUID" : "Not in Filter"}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <div className="text-xs text-muted-foreground">
        Showing {filteredPodcasts.length} of {data?.podcasts.length ?? 0} podcasts
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("name")}>
                    Podcast <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("status")}>
                    Status <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Taddy UUID</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("filter")}>
                    In Filter <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredPodcasts.map(podcast => (
                <tr key={podcast.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-podcast-${podcast.id}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {podcast.artworkUrl ? (
                        <img src={podcast.artworkUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-muted shrink-0" />
                      )}
                      <div>
                        <div className="font-semibold leading-snug">{podcast.name}</div>
                        <div className="text-xs text-muted-foreground">{podcast.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={podcast.status} />
                  </td>
                  <td className="px-4 py-3">
                    {podcast.taddyUuid ? (
                      <span className="font-mono text-xs text-muted-foreground">{podcast.taddyUuid.slice(0, 8)}…</span>
                    ) : (
                      <span className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Missing</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!podcast.taddyUuid ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : podcast.inTaddyFilter ? (
                      <span className="flex items-center gap-1 text-green-600 text-xs font-semibold"><CheckCircle2 className="w-3.5 h-3.5" />In filter</span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-600 text-xs font-semibold"><XCircle className="w-3.5 h-3.5" />Not in filter</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ToggleButton
                      podcast={podcast}
                      pending={pendingToggles.has(podcast.id)}
                      onToggle={toggleStatus}
                    />
                  </td>
                </tr>
              ))}
              {filteredPodcasts.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-sm">No podcasts match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-border">
          {filteredPodcasts.map(podcast => (
            <div key={podcast.id} className="p-4 space-y-3" data-testid={`card-podcast-${podcast.id}`}>
              <div className="flex items-start gap-3">
                {podcast.artworkUrl ? (
                  <img src={podcast.artworkUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-muted shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm leading-snug">{podcast.name}</div>
                  <div className="text-xs text-muted-foreground">{podcast.slug}</div>
                </div>
                <StatusBadge status={podcast.status} />
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <div>
                  {podcast.taddyUuid ? (
                    <span className="font-mono text-muted-foreground">UUID: {podcast.taddyUuid.slice(0, 8)}…</span>
                  ) : (
                    <span className="text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />No Taddy UUID</span>
                  )}
                </div>
                <div>
                  {podcast.taddyUuid && (
                    podcast.inTaddyFilter ? (
                      <span className="flex items-center gap-1 text-green-600 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" />In filter</span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-600 font-semibold"><XCircle className="w-3.5 h-3.5" />Not in filter</span>
                    )
                  )}
                </div>
              </div>
              <ToggleButton podcast={podcast} pending={pendingToggles.has(podcast.id)} onToggle={toggleStatus} />
            </div>
          ))}
          {filteredPodcasts.length === 0 && (
            <div className="p-10 text-center text-muted-foreground text-sm">No podcasts match this filter.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "published") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-semibold">
        <CheckCircle2 className="w-3 h-3" />Published
      </span>
    );
  }
  if (status === "requested") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-semibold">
        Requested
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-semibold">
      {status}
    </span>
  );
}

function ToggleButton({
  podcast,
  pending,
  onToggle,
}: {
  podcast: PodcastRow;
  pending: boolean;
  onToggle: (p: PodcastRow) => void;
}) {
  const isPublished = podcast.status === "published";
  return (
    <button
      onClick={() => onToggle(podcast)}
      disabled={pending}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${
        isPublished
          ? "border border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
          : "border border-green-200 text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20"
      }`}
      data-testid={`button-toggle-status-${podcast.id}`}
    >
      {pending ? (
        <RefreshCw className="w-3 h-3 animate-spin" />
      ) : isPublished ? (
        <ShieldOff className="w-3 h-3" />
      ) : (
        <ShieldCheck className="w-3 h-3" />
      )}
      {isPublished ? "Unpublish" : "Publish"}
    </button>
  );
}
