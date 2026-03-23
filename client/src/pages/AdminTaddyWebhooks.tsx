import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, CheckCircle2, XCircle, AlertTriangle, Search,
  Radio, ExternalLink, Zap, Pencil, Check, X, Wand2,
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

export default function AdminTaddyWebhooks() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, refetch, isFetching } = useQuery<WebhookStatusData>({
    queryKey: ["/api/admin/taddy/webhook-status"],
    staleTime: 30_000,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/taddy/sync-filters");
      return res.json() as Promise<{ success: boolean; uuidCount: number }>;
    },
    onSuccess: (data) => {
      toast({ title: "Sync complete", description: `Taddy is now watching ${data.uuidCount} podcasts.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/taddy/webhook-status"] });
    },
    onError: () => toast({ title: "Sync failed", description: "Could not update Taddy. Try again.", variant: "destructive" }),
  });

  const backfillMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/taddy/backfill-uuids");
      return res.json() as Promise<{ found: number; saved: number; failed: number }>;
    },
    onSuccess: (res) => {
      if (res.found === 0) {
        toast({ title: "All good", description: "Every published podcast already has a Taddy ID." });
      } else {
        const desc = `Found ${res.saved} of ${res.found}. ${res.failed > 0 ? `${res.failed} not in Taddy yet.` : ""}`.trim();
        toast({ title: `Backfill complete`, description: desc });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/taddy/webhook-status"] });
    },
    onError: () => toast({ title: "Backfill failed", description: "Could not look up IDs. Try again.", variant: "destructive" }),
  });

  const { webhook, stats, podcasts = [] } = data ?? {};

  const publishedPodcasts = podcasts.filter(p => p.status === "published");
  const q = search.trim().toLowerCase();
  const filtered = q
    ? publishedPodcasts.filter(p => p.name.toLowerCase().includes(q) || p.slug?.toLowerCase().includes(q) || p.taddyUuid?.toLowerCase().includes(q))
    : publishedPodcasts;

  const watching = filtered.filter(p => p.taddyUuid);
  const missingUuid = filtered.filter(p => !p.taddyUuid);

  const needsSync = !syncMutation.isSuccess && ((stats?.missingFromFilter ?? 0) > 0 || (stats?.stalledInFilter ?? 0) > 0);

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
        <p className="font-semibold">Failed to load webhook status</p>
        <button onClick={() => refetch()} className="mt-3 text-sm text-primary hover:underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Radio className="w-5 h-5 text-primary" />
            Taddy Webhook Monitor
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Taddy notifies us whenever a new podcast episode is published. Below are your published podcasts and whether Taddy is watching each one.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
              needsSync
                ? "bg-amber-500 hover:bg-amber-600 text-white"
                : "bg-primary hover:bg-primary/90 text-white"
            }`}
            data-testid="button-sync-taddy-filters"
          >
            {syncMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {needsSync ? "Sync Now (out of sync)" : "Sync Filters"}
          </button>
        </div>
      </div>

      {/* Webhook connection strip */}
      {webhook && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
            <Radio className="w-3.5 h-3.5" />
            Taddy endpoint:
            <a href={webhook.endpointUrl} target="_blank" rel="noopener noreferrer"
               className="font-mono text-primary hover:underline flex items-center gap-0.5">
              {webhook.endpointUrl}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            {webhook.isActive ? (
              <span className="flex items-center gap-1 text-green-600 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" />Active</span>
            ) : (
              <span className="flex items-center gap-1 text-red-500 font-semibold"><XCircle className="w-3.5 h-3.5" />Inactive</span>
            )}
            {webhook.isVerified ? (
              <span className="flex items-center gap-1 text-green-600 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" />Verified</span>
            ) : (
              <span className="flex items-center gap-1 text-muted-foreground text-xs">Not verified by Taddy yet</span>
            )}
          </div>
        </div>
      )}

      {/* Sync alert */}
      {needsSync && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/40 p-4">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-400">
            <span className="font-semibold">Taddy's watch list is out of sync.</span>{" "}
            Click <strong>Sync Now</strong> to update it with your current published podcasts.
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search published podcasts…"
          className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          data-testid="input-webhook-search"
        />
      </div>

      {/* Section 1: Being watched */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          <h3 className="font-bold text-base">
            Taddy is watching{" "}
            <span className="text-green-600">{watching.length}</span>{" "}
            of your published podcasts
          </h3>
        </div>
        <p className="text-sm text-muted-foreground -mt-1">
          When a new episode publishes for any of these podcasts, Taddy will notify us and the pipeline will process it automatically.
        </p>

        {watching.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/20 py-10 text-center text-sm text-muted-foreground">
            No published podcasts with a Taddy UUID yet.
          </div>
        ) : (
          <div className="rounded-xl border border-green-200 dark:border-green-900/40 overflow-hidden divide-y divide-green-100 dark:divide-green-900/30">
            {watching.map(p => (
              <WatchingRow key={p.id} podcast={p} />
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Missing UUID */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <h3 className="font-bold text-base flex-1">
            Taddy is <span className="text-amber-600">not</span> watching{" "}
            <span className="text-amber-600">{missingUuid.length}</span>{" "}
            published podcast{missingUuid.length !== 1 ? "s" : ""}
          </h3>
          {missingUuid.length > 0 && (
            <button
              onClick={() => backfillMutation.mutate()}
              disabled={backfillMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 text-amber-700 dark:text-amber-400 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-all shrink-0 disabled:opacity-60"
              data-testid="button-backfill-taddy-uuids"
            >
              {backfillMutation.isPending
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <Wand2 className="w-3.5 h-3.5" />}
              {backfillMutation.isPending ? "Looking up…" : "Look Up Missing IDs"}
            </button>
          )}
        </div>
        <p className="text-sm text-muted-foreground -mt-1">
          These podcasts are missing a Taddy ID, so Taddy can't notify us about new episodes. Click <strong>Look Up Missing IDs</strong> to auto-fetch them from Taddy using the iTunes ID, or paste one in manually.
        </p>

        {missingUuid.length === 0 ? (
          <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900/40 py-6 text-center">
            <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto mb-1" />
            <p className="text-sm font-semibold text-green-700 dark:text-green-400">All published podcasts have a Taddy UUID.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 overflow-hidden divide-y divide-amber-100 dark:divide-amber-900/30">
            {missingUuid.map(p => (
              <MissingUuidRow key={p.id} podcast={p} />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

function WatchingRow({ podcast }: { podcast: PodcastRow }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-green-50/50 dark:bg-green-950/10 hover:bg-green-50 dark:hover:bg-green-950/20 transition-colors" data-testid={`row-watching-${podcast.id}`}>
      {podcast.artworkUrl ? (
        <img src={podcast.artworkUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded-lg bg-muted shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm leading-snug truncate">{podcast.name}</div>
        <div className="text-xs text-muted-foreground truncate">{podcast.slug}</div>
      </div>
      <div className="text-xs font-mono text-muted-foreground hidden sm:block shrink-0">
        {podcast.taddyUuid?.slice(0, 8)}…
      </div>
      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
    </div>
  );
}

function MissingUuidRow({ podcast }: { podcast: PodcastRow }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/admin/podcast-directory/${podcast.id}/taddy-uuid`, { taddyUuid: value }),
    onSuccess: () => {
      toast({ title: "UUID saved", description: `${podcast.name} now has a Taddy UUID. Run Sync Now to activate it.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/taddy/webhook-status"] });
      setEditing(false);
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  return (
    <div className="px-4 py-3 bg-amber-50/40 dark:bg-amber-950/10 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors" data-testid={`row-missing-uuid-${podcast.id}`}>
      <div className="flex items-center gap-3">
        {podcast.artworkUrl ? (
          <img src={podcast.artworkUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-lg bg-muted shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm leading-snug truncate">{podcast.name}</div>
          <div className="text-xs text-muted-foreground truncate">{podcast.slug}</div>
        </div>
        {!editing && (
          <button
            onClick={() => { setValue(""); setEditing(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 dark:text-amber-400 text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors shrink-0"
            data-testid={`button-add-uuid-${podcast.id}`}
          >
            <Pencil className="w-3 h-3" />
            Add UUID
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-3 flex items-center gap-2">
          <input
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="Paste Taddy UUID here (e.g. a1b2c3d4-…)"
            className="flex-1 px-3 py-1.5 rounded-lg border border-amber-300 bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400/40"
            data-testid={`input-uuid-${podcast.id}`}
            onKeyDown={e => { if (e.key === "Enter" && value.trim()) saveMutation.mutate(); if (e.key === "Escape") setEditing(false); }}
          />
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!value.trim() || saveMutation.isPending}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 disabled:opacity-50 transition-colors shrink-0"
            data-testid={`button-save-uuid-${podcast.id}`}
          >
            {saveMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground transition-colors shrink-0"
            data-testid={`button-cancel-uuid-${podcast.id}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
