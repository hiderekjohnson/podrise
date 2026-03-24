import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Activity, Code, Search, Filter, Clock, AlertCircle, CheckCircle2, XCircle, MinusCircle, Info } from "lucide-react";

type WebhookEvent = {
  id: number;
  received_at: string;
  taddy_type: string | null;
  action: string | null;
  episode_uuid: string | null;
  episode_title: string | null;
  podcast_name: string | null;
  podcast_id: string | null;
  outcome: string | null;
  outcome_detail: string | null;
  raw_payload: any;
};

type OutcomeCount = { outcome: string; count: number };

type ApiResponse = {
  events: WebhookEvent[];
  total: number;
  outcomeCounts: OutcomeCount[];
};

const OUTCOME_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; description: string }> = {
  queued:                { label: "Queued",          color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",   icon: <CheckCircle2 className="w-3.5 h-3.5" />, description: "Episode accepted and sent to pipeline" },
  skipped_duplicate:     { label: "Duplicate",       color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",     icon: <MinusCircle className="w-3.5 h-3.5" />, description: "Already in transcript or recap table" },
  skipped_daily_cap:     { label: "Daily Cap",       color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300", icon: <MinusCircle className="w-3.5 h-3.5" />, description: "Podcast hit its daily episode limit" },
  skipped_rate_limited:  { label: "Rate Limited",    color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300", icon: <AlertCircle className="w-3.5 h-3.5" />, description: "Too many webhooks from this podcast in 60s" },
  skipped_no_uuid:       { label: "No UUID",         color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300", icon: <AlertCircle className="w-3.5 h-3.5" />, description: "Episode UUID missing from payload" },
  skipped_queue_error:   { label: "Queue Error",     color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",       icon: <XCircle className="w-3.5 h-3.5" />, description: "Error while inserting into queue" },
  ignored_untracked:     { label: "Untracked",       color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",      icon: <MinusCircle className="w-3.5 h-3.5" />, description: "Podcast not in our directory" },
  ignored_not_published: { label: "Not Published",   color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",      icon: <MinusCircle className="w-3.5 h-3.5" />, description: "Podcast exists but status is not published" },
  ignored_no_identifier: { label: "No Identifier",  color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",      icon: <MinusCircle className="w-3.5 h-3.5" />, description: "No iTunes ID or Taddy UUID in payload" },
  updated_metadata:      { label: "Metadata Update", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300", icon: <Info className="w-3.5 h-3.5" />, description: "Episode metadata fields updated" },
  updated_series_metadata: { label: "Series Update", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300", icon: <Info className="w-3.5 h-3.5" />, description: "Podcast series metadata updated" },
  malformed:             { label: "Malformed",       color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",       icon: <XCircle className="w-3.5 h-3.5" />, description: "Payload missing required fields" },
  unhandled:             { label: "Unhandled",       color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",      icon: <MinusCircle className="w-3.5 h-3.5" />, description: "Unknown event type/action combination" },
};

function outcomeBadge(outcome: string | null) {
  const cfg = outcome ? OUTCOME_CONFIG[outcome] : null;
  if (!cfg) return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{outcome ?? "unknown"}</span>;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function formatRelativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
}

function HumanReadableFeed({ events }: { events: WebhookEvent[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (events.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No webhook events recorded yet.</p>
        <p className="text-xs mt-1 opacity-60">Events will appear here as Taddy sends webhooks.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {events.map((ev) => {
        const isExpanded = expandedId === ev.id;
        const detail = ev.outcome ? OUTCOME_CONFIG[ev.outcome] : null;
        return (
          <div
            key={ev.id}
            data-testid={`webhook-event-row-${ev.id}`}
            className="px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
            onClick={() => setExpandedId(isExpanded ? null : ev.id)}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {outcomeBadge(ev.outcome)}
                  {ev.action && (
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {ev.taddy_type === "podcastepisode" ? "episode" : ev.taddy_type ?? "?"}.{ev.action}
                    </span>
                  )}
                  {ev.podcast_name && (
                    <span className="text-xs font-medium text-foreground truncate max-w-[200px]" title={ev.podcast_name}>
                      {ev.podcast_name}
                    </span>
                  )}
                </div>
                {ev.episode_title && (
                  <p className="text-sm text-foreground mt-1 truncate" title={ev.episode_title}>
                    {ev.episode_title}
                  </p>
                )}
                {ev.outcome_detail && !isExpanded && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{ev.outcome_detail}</p>
                )}
                {isExpanded && (
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {detail && <p className="text-foreground/70 italic">{detail.description}</p>}
                    {ev.outcome_detail && <p><span className="font-medium text-foreground">Detail:</span> {ev.outcome_detail}</p>}
                    {ev.episode_uuid && <p><span className="font-medium text-foreground">Episode UUID:</span> <code className="bg-muted px-1 rounded">{ev.episode_uuid}</code></p>}
                    {ev.podcast_id && <p><span className="font-medium text-foreground">Podcast iTunes ID:</span> <code className="bg-muted px-1 rounded">{ev.podcast_id}</code></p>}
                    <p><span className="font-medium text-foreground">Received:</span> {formatDateTime(ev.received_at)}</p>
                    <p className="text-foreground/40 text-[10px]">Event ID #{ev.id} — click again to collapse</p>
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5" title={formatDateTime(ev.received_at)}>
                {formatRelativeTime(ev.received_at)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RawFeed({ events }: { events: WebhookEvent[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (events.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Code className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No webhook payloads recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border font-mono text-xs">
      {events.map((ev) => {
        const isExpanded = expandedId === ev.id;
        return (
          <div key={ev.id} data-testid={`webhook-raw-row-${ev.id}`} className="px-4 py-2">
            <div
              className="flex items-center gap-3 cursor-pointer hover:text-foreground transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : ev.id)}
            >
              <span className="text-muted-foreground w-28 shrink-0">{formatDateTime(ev.received_at)}</span>
              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                ev.outcome === "queued" ? "bg-green-100 text-green-700" :
                ev.outcome?.startsWith("ignored") ? "bg-gray-100 text-gray-500" :
                ev.outcome?.startsWith("skipped") ? "bg-yellow-100 text-yellow-700" :
                ev.outcome?.startsWith("updated") ? "bg-purple-100 text-purple-700" :
                "bg-red-100 text-red-700"
              }`}>{ev.outcome ?? "?"}</span>
              <span className="text-foreground truncate">{ev.taddy_type}.{ev.action} {ev.episode_title ? `| "${ev.episode_title.slice(0, 50)}"` : ""}</span>
              <span className="ml-auto text-muted-foreground shrink-0">#{ev.id}</span>
            </div>
            {isExpanded && (
              <div className="mt-2 ml-28 bg-muted rounded p-3 overflow-x-auto max-h-96">
                <pre className="text-[11px] leading-relaxed text-foreground">
                  {JSON.stringify(ev.raw_payload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AdminWebhookFeed() {
  const [view, setView] = useState<"human" | "raw">("human");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [podcastSearch, setPodcastSearch] = useState("");
  const [debouncedPodcast, setDebouncedPodcast] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const handlePodcastInput = useCallback((val: string) => {
    setPodcastSearch(val);
    const t = setTimeout(() => setDebouncedPodcast(val), 400);
    return () => clearTimeout(t);
  }, []);

  const queryParams = new URLSearchParams();
  queryParams.set("limit", "200");
  if (outcomeFilter && outcomeFilter !== "all") queryParams.set("outcome", outcomeFilter);
  if (debouncedPodcast) queryParams.set("podcast", debouncedPodcast);
  const queryKey = `/api/admin/webhook-events?${queryParams.toString()}`;

  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery<ApiResponse>({
    queryKey: [queryKey],
    refetchInterval: autoRefresh ? 10000 : false,
    staleTime: 5000,
  });

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const outcomeCounts = data?.outcomeCounts ?? [];

  const queuedCount = outcomeCounts.find(o => o.outcome === "queued")?.count ?? 0;
  const skippedCount = outcomeCounts.filter(o => o.outcome?.startsWith("skipped")).reduce((a, o) => a + o.count, 0);
  const ignoredCount = outcomeCounts.filter(o => o.outcome?.startsWith("ignored")).reduce((a, o) => a + o.count, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">Webhook Activity Feed</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Every incoming Taddy webhook and how it was handled
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="auto-refresh-toggle"
            onClick={() => setAutoRefresh(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${autoRefresh ? "border-green-500 text-green-600 bg-green-50 dark:bg-green-900/20" : "border-border text-muted-foreground"}`}
          >
            <RefreshCw className={`w-3 h-3 inline mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            {autoRefresh ? "Live" : "Paused"}
          </button>
          <Button
            variant="outline"
            size="sm"
            data-testid="manual-refresh-btn"
            onClick={() => queryClient.invalidateQueries({ queryKey: [queryKey] })}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Events", value: total, color: "text-foreground" },
          { label: "Queued", value: queuedCount, color: "text-green-600 dark:text-green-400" },
          { label: "Skipped", value: skippedCount, color: "text-yellow-600 dark:text-yellow-400" },
          { label: "Ignored", value: ignoredCount, color: "text-muted-foreground" },
        ].map(stat => (
          <div key={stat.label} className="bg-muted/50 rounded-lg p-3 text-center">
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filters + view toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <button
            data-testid="view-human"
            onClick={() => setView("human")}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${view === "human" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Activity className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
            Human Readable
          </button>
          <button
            data-testid="view-raw"
            onClick={() => setView("raw")}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${view === "raw" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Code className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
            Raw Payload
          </button>
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            data-testid="podcast-search-input"
            placeholder="Filter by podcast..."
            value={podcastSearch}
            onChange={e => handlePodcastInput(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
          <SelectTrigger data-testid="outcome-filter-select" className="h-8 text-sm w-52">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="All outcomes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All outcomes</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="skipped_duplicate">Duplicate</SelectItem>
            <SelectItem value="skipped_daily_cap">Daily cap</SelectItem>
            <SelectItem value="skipped_rate_limited">Rate limited</SelectItem>
            <SelectItem value="skipped_no_uuid">No UUID</SelectItem>
            <SelectItem value="skipped_queue_error">Queue error</SelectItem>
            <SelectItem value="ignored_untracked">Untracked podcast</SelectItem>
            <SelectItem value="ignored_not_published">Not published</SelectItem>
            <SelectItem value="ignored_no_identifier">No identifier</SelectItem>
            <SelectItem value="updated_metadata">Metadata update</SelectItem>
            <SelectItem value="updated_series_metadata">Series update</SelectItem>
            <SelectItem value="malformed">Malformed</SelectItem>
            <SelectItem value="unhandled">Unhandled</SelectItem>
          </SelectContent>
        </Select>

        {dataUpdatedAt > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            <Clock className="w-3 h-3 inline mr-1 -mt-0.5" />
            Updated {formatRelativeTime(new Date(dataUpdatedAt).toISOString())}
          </span>
        )}
      </div>

      {/* Breakdown pills */}
      {outcomeCounts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {outcomeCounts.map(oc => {
            const cfg = OUTCOME_CONFIG[oc.outcome];
            return (
              <button
                key={oc.outcome}
                data-testid={`outcome-pill-${oc.outcome}`}
                onClick={() => setOutcomeFilter(outcomeFilter === oc.outcome ? "all" : oc.outcome)}
                className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all
                  ${outcomeFilter === oc.outcome ? "ring-2 ring-offset-1 ring-primary/50" : ""}
                  ${cfg?.color ?? "bg-muted text-muted-foreground"}`}
              >
                {cfg?.icon}
                <span>{cfg?.label ?? oc.outcome}</span>
                <span className="font-bold">{oc.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Feed */}
      <div className="border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground text-sm">Loading webhook events...</div>
        ) : view === "human" ? (
          <HumanReadableFeed events={events} />
        ) : (
          <RawFeed events={events} />
        )}
      </div>

      {total > events.length && (
        <p className="text-center text-xs text-muted-foreground">
          Showing {events.length} of {total} events. Use filters to narrow results.
        </p>
      )}
    </div>
  );
}
