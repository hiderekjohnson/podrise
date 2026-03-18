import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Search, ChevronLeft, ChevronDown, ChevronUp,
  Podcast, FileText, Users, Building2, ShoppingBag,
  Save, RefreshCw, Plus, Trash2, GripVertical, ExternalLink,
  Image, Clock, Calendar, Hash, Eye, EyeOff, AlertCircle, Pencil,
  Globe, Star, Zap, CheckCircle, XCircle, Play, Copy, Check, Sparkles,
  CircleDot, Link, Music, Headphones, MessageSquareQuote, BookOpen, Tag, HelpCircle, Brain, Newspaper
} from "lucide-react";

function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function CopyableId({ label, value, context }: { label: string; value: string | number; context?: string }) {
  const [copied, setCopied] = useState(false);
  const copyText = context
    ? `production#${value} (${label} — ${context})`
    : `production#${value} (${label})`;
  const handleCopy = () => {
    navigator.clipboard.writeText(copyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-muted/50 hover:bg-muted border border-border rounded-lg text-xs font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      title={`Copy: ${copyText}`}
      data-testid={`copy-id-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <Hash className="w-3 h-3" />
      <span className="font-semibold text-foreground">production#{value}</span>
      {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function EnrichmentStatus({ fields }: { fields: { label: string; filled: boolean }[] }) {
  const filledCount = fields.filter(f => f.filled).length;
  const total = fields.length;
  const pct = total > 0 ? Math.round((filledCount / total) * 100) : 0;
  return (
    <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-4 space-y-2" data-testid="enrichment-status">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Enrichment Status</h4>
        <span className={`text-xs font-bold ${pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-500"}`} data-testid="enrichment-summary">
          {filledCount}/{total} ({pct}%)
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {fields.map((f) => (
          <span
            key={f.label}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
              f.filled
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400"
            }`}
            data-testid={`enrichment-field-${f.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {f.filled ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            {f.label}
          </span>
        ))}
      </div>
    </div>
  );
}

type CMSView =
  | { tab: "podcasts"; podcastSlug?: undefined; episodeSlug?: undefined }
  | { tab: "podcast-detail"; podcastSlug: string; episodeSlug?: undefined }
  | { tab: "episodes"; podcastSlug?: string; episodeSlug?: undefined }
  | { tab: "episode-detail"; podcastSlug: string; episodeSlug: string }
  | { tab: "people" }
  | { tab: "companies" }
  | { tab: "products" };

interface CMSPodcast {
  id: number;
  slug: string;
  name: string;
  hosts: string;
  artwork_url: string;
  status: string;
  episode_count: number;
}

interface TopicStat {
  topic: string;
  count: number;
}

interface PodcastStats {
  episodeCount: number;
  recentGuests: string[];
  topTopics: TopicStat[];
  peopleMentioned: string[];
  companiesMentioned: string[];
}

interface PodcastHost {
  id: number;
  name: string;
  bio: string;
  photo_url: string;
  twitter_handle: string;
  linkedin_url: string;
  instagram_handle: string;
  website_url: string;
  sort_order: number;
}

interface PodcastFAQ {
  question: string;
  answer: string;
}

interface CMSPodcastDetail extends CMSPodcast {
  description: string;
  apple_url: string;
  spotify_url: string;
  youtube_url: string;
  has_landing_page: boolean;
  twitter_handle: string;
  instagram_url: string;
  tiktok_url: string;
  facebook_url: string;
  discord_url: string;
  website_url: string;
  store_url: string;
  category: string;
  frequency: string;
  avg_episode_length: number;
  year_started: number;
  total_episodes: number;
  apple_rating: number;
  apple_rating_count: number;
  about_podcast: string;
  known_for: string[];
  host_bios: Array<{ name: string; bio: string }>;
  hosts_data: PodcastHost[];
  top_questions_data: PodcastFAQ[];
  stats: PodcastStats;
}

interface CMSEpisodeListItem {
  id: number;
  episode_title: string;
  episode_slug: string;
  publish_date: string;
  duration: string;
  status: string;
  tldl: string;
  tabloid_headline: string;
  tabloid_sub_headline: string;
}

interface CMSGuest {
  name: string;
  title: string;
}

interface CMSResource {
  name: string;
  type: string;
  author?: string;
  description?: string;
  url?: string;
  category?: string;
  context?: string;
}

interface CMSSponsor {
  name: string;
  description?: string;
}

interface CMSQuote {
  id: number;
  speaker_name: string;
  quote_text: string;
  quote_type: string;
  context: string;
}

interface CMSEpisodeDetail {
  id: number;
  slug: string;
  podcast_name: string;
  itunes_id: string;
  episode_title: string;
  episode_slug: string;
  publish_date: string;
  duration: string;
  artwork_url: string;
  tldl: string;
  what_happened: string;
  key_insights: string[];
  quote: string;
  quote_attribution: string;
  hosts: string;
  guests: string;
  resources: string;
  sponsors: string;
  key_topics: string[];
  status: string;
  transcript: string;
  entity_contexts_cache: string | Record<string, string>;
  quotes: CMSQuote[];
  extractedProducts: ExtractedProduct[];
  spotify_episode_url: string;
  apple_episode_url: string;
  audio_url: string;
  show_notes: string;
  topic_contexts: string;
  top_questions: string;
  tabloid_headline: string;
  tabloid_sub_headline: string;
}

interface PodcastForm {
  name: string;
  description: string;
  artworkUrl: string;
  hosts: string;
  appleUrl: string;
  spotifyUrl: string;
  youtubeUrl: string;
  status: string;
  hasLandingPage: boolean;
  twitterHandle: string;
  instagramUrl: string;
  tiktokUrl: string;
  facebookUrl: string;
  discordUrl: string;
  websiteUrl: string;
  storeUrl: string;
  category: string;
  frequency: string;
  avgEpisodeLength: number;
  yearStarted: number;
  aboutPodcast: string;
}

interface ExtractedProduct {
  id: number;
  name: string;
  company: string;
  description: string;
  category: string;
  context: string;
  mention_type: string;
  status: string;
  purchase_url: string;
  image_url: string;
}

interface EntityEntry {
  name: string;
  context: string;
  type: "person" | "company";
}

interface EpisodeForm {
  episodeTitle: string;
  publishDate: string;
  duration: string;
  artworkUrl: string;
  tldl: string;
  whatHappened: string;
  keyInsights: string[];
  quote: string;
  quoteAttribution: string;
  hosts: string;
  guests: CMSGuest[];
  resources: CMSResource[];
  sponsors: CMSSponsor[];
  keyTopics: string[];
  status: string;
  entityContexts: EntityEntry[];
  spotifyEpisodeUrl: string;
  appleEpisodeUrl: string;
  audioUrl: string;
  showNotes: string;
  tabloidHeadline: string;
  tabloidSubHeadline: string;
}

interface EditingQuote {
  speakerName: string;
  quoteText: string;
  context: string;
  quoteType: string;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    requested: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    needs_review: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    hidden: "bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${colors[status] || colors.hidden}`} data-testid={`status-badge-${status}`}>
      {status === "needs_review" ? "Needs Review" : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function StatusSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 px-3 border border-border rounded-lg text-sm bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary/20"
      data-testid="select-status"
    >
      <option value="published">Published</option>
      <option value="requested">Requested</option>
      <option value="needs_review">Needs Review</option>
      <option value="hidden">Hidden</option>
    </select>
  );
}

function PodcastEnrichButton() {
  const { toast } = useToast();
  const [enrichStatus, setEnrichStatus] = useState<any>(null);
  const [polling, setPolling] = useState(false);

  const startEnrich = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/cms/podcast-enrich", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (res.status === 409) { setPolling(true); return; }
      if (!res.ok) throw new Error("Failed to start");
    },
    onSuccess: () => {
      toast({ title: "Enrichment started" });
      setPolling(true);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  useQuery({
    queryKey: ["/api/admin/cms/podcast-enrich/status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/cms/podcast-enrich/status", { credentials: "include" });
      if (!res.ok) return null;
      const data = await res.json();
      setEnrichStatus(data);
      if (!data.running && polling) {
        setPolling(false);
        queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/podcasts"] });
      }
      return data;
    },
    refetchInterval: polling ? 3000 : false,
    enabled: polling,
  });

  const pct = enrichStatus && enrichStatus.total > 0 ? Math.round((enrichStatus.done / enrichStatus.total) * 100) : 0;
  const isComplete = enrichStatus && !enrichStatus.running && enrichStatus.done > 0 && enrichStatus.done === enrichStatus.total;

  return (
    <div className="mt-2 space-y-2" data-testid="enrich-panel">
      <div className="flex items-center gap-2">
        <button
          onClick={() => startEnrich.mutate()}
          disabled={startEnrich.isPending || polling}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          data-testid="button-enrich-podcasts"
        >
          {polling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {polling ? "Enriching..." : "Enrich All Metadata"}
        </button>
        {enrichStatus && enrichStatus.total > 0 && (
          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold ${
            isComplete ? "bg-green-100 text-green-700" : polling ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"
          }`}>
            {isComplete ? "✓ Complete" : polling ? `Running ${pct}%` : `Last run: ${pct}%`}
          </span>
        )}
      </div>
      {enrichStatus && enrichStatus.total > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${isComplete ? "bg-green-500" : "bg-primary"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap w-20 text-right">
              {enrichStatus.done}/{enrichStatus.total}
            </span>
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>{enrichStatus.updated} updated</span>
            <span>{enrichStatus.skipped} skipped</span>
            {enrichStatus.errors > 0 && <span className="text-red-500">{enrichStatus.errors} errors</span>}
          </div>
          {enrichStatus.log && enrichStatus.log.length > 0 && (
            <details className="mt-1">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                View log ({enrichStatus.log.length} entries)
              </summary>
              <div className="mt-1 max-h-40 overflow-y-auto bg-muted/50 rounded-lg p-2 text-xs font-mono space-y-0.5">
                {enrichStatus.log.slice(-20).map((line: string, i: number) => (
                  <div key={i} className={line.startsWith("✓") ? "text-green-600" : line.startsWith("✗") ? "text-red-500" : "text-muted-foreground"}>
                    {line}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function PodcastsList({ onNavigate }: { onNavigate: (view: CMSView) => void }) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const { data: podcasts, isLoading } = useQuery<CMSPodcast[]>({
    queryKey: ["/api/admin/cms/podcasts", debouncedSearch, statusFilter, sortField, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("sort", sortField);
      params.set("order", sortOrder);
      const res = await fetch(`/api/admin/cms/podcasts?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="cms-podcasts-list">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-foreground">Podcasts</h3>
          <p className="text-sm text-muted-foreground">{podcasts?.length || 0} podcasts</p>
          <PodcastEnrichButton />
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              data-testid="input-cms-podcast-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search podcasts..."
              className="w-full pl-9 pr-3 py-2 border border-border rounded-xl text-sm"
            />
          </div>
          <select
            data-testid="select-cms-podcast-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 border border-border rounded-lg text-sm bg-white dark:bg-zinc-900"
          >
            <option value="all">All Status</option>
            <option value="published">Published</option>
            <option value="requested">Requested</option>
            <option value="needs_review">Needs Review</option>
            <option value="hidden">Hidden</option>
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-border rounded-2xl overflow-hidden">
        <table className="w-full" data-testid="table-cms-podcasts">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 w-12"></th>
              <th
                className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("name")}
                data-testid="sort-podcast-name"
              >
                <span className="flex items-center gap-1">
                  Name {sortField === "name" && (sortOrder === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                </span>
              </th>
              <th
                className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("episodes")}
                data-testid="sort-podcast-episodes"
              >
                <span className="flex items-center gap-1">
                  Episodes {sortField === "episodes" && (sortOrder === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                </span>
              </th>
              <th
                className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("followers")}
                data-testid="sort-podcast-followers"
              >
                <span className="flex items-center gap-1">
                  Followers {sortField === "followers" && (sortOrder === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                </span>
              </th>
              <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(!podcasts || podcasts.length === 0) ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {search ? "No matching podcasts found." : "No podcasts in directory yet."}
                </td>
              </tr>
            ) : (
              podcasts.map((p) => (
                <tr
                  key={p.id}
                  className="hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => onNavigate({ tab: "podcast-detail", podcastSlug: p.slug })}
                  data-testid={`row-cms-podcast-${p.id}`}
                >
                  <td className="px-4 py-3">
                    {p.artwork_url ? (
                      <img src={p.artwork_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-muted/40 flex items-center justify-center">
                        <Image className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground text-sm">{p.name}</p>
                    {p.hosts && <p className="text-xs text-muted-foreground mt-0.5">{p.hosts}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-foreground" data-testid={`text-episode-count-${p.id}`}>{p.episode_count || 0}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-foreground" data-testid={`text-follower-count-${p.id}`}>{(p as any).follower_count || 0}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status || "published"} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PodcastDetail({ slug, onNavigate }: { slug: string; onNavigate: (view: CMSView) => void }) {
  const { toast } = useToast();
  const { data: podcast, isLoading } = useQuery<CMSPodcastDetail>({
    queryKey: ["/api/admin/cms/podcasts", slug],
    queryFn: async () => {
      const res = await fetch(`/api/admin/cms/podcasts/${slug}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const [form, setForm] = useState<PodcastForm | null>(null);

  useEffect(() => {
    if (podcast && !form) {
      setForm({
        name: podcast.name || "",
        description: podcast.description || "",
        artworkUrl: podcast.artwork_url || "",
        hosts: podcast.hosts || "",
        appleUrl: podcast.apple_url || "",
        spotifyUrl: podcast.spotify_url || "",
        youtubeUrl: podcast.youtube_url || "",
        status: podcast.status || "published",
        hasLandingPage: podcast.has_landing_page ?? true,
        twitterHandle: podcast.twitter_handle || "",
        instagramUrl: podcast.instagram_url || "",
        tiktokUrl: podcast.tiktok_url || "",
        facebookUrl: podcast.facebook_url || "",
        discordUrl: podcast.discord_url || "",
        websiteUrl: podcast.website_url || "",
        storeUrl: podcast.store_url || "",
        category: podcast.category || "",
        frequency: podcast.frequency || "",
        avgEpisodeLength: podcast.avg_episode_length || 0,
        yearStarted: podcast.year_started || 0,
        aboutPodcast: podcast.about_podcast || "",
      });
    }
  }, [podcast]);

  const updateMutation = useMutation({
    mutationFn: (data: PodcastForm) => apiRequest("PATCH", `/api/admin/cms/podcasts/${slug}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/podcasts"] });
      toast({ title: "Podcast updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const stats = podcast?.stats;

  return (
    <div className="space-y-6" data-testid="cms-podcast-detail">
      <div className="flex items-center gap-3">
        <button
          onClick={() => onNavigate({ tab: "podcasts" })}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-back-to-podcasts"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Podcasts
        </button>
      </div>

      <CopyableId label="Podcast" value={podcast.id} context={podcast.name} />

      <EnrichmentStatus fields={[
        { label: "Description", filled: !!podcast?.description?.trim() },
        { label: "Artwork", filled: !!podcast?.artwork_url?.trim() },
        { label: "Apple URL", filled: !!podcast?.apple_url?.trim() },
        { label: "Spotify URL", filled: !!podcast?.spotify_url?.trim() },
        { label: "YouTube URL", filled: !!podcast?.youtube_url?.trim() },
        { label: "Twitter", filled: !!podcast?.twitter_handle?.trim() },
        { label: "Website", filled: !!podcast?.website_url?.trim() },
        { label: "Category", filled: !!podcast?.category?.trim() },
        { label: "Frequency", filled: !!podcast?.frequency?.trim() },
        { label: "About Podcast", filled: !!podcast?.about_podcast?.trim() },
        { label: "Hosts", filled: !!(podcast?.hosts?.trim() || podcast?.hosts_data?.length) },
        { label: "Known For", filled: !!(podcast?.known_for?.length) },
      ]} />

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          {podcast.artwork_url && (
            <img src={podcast.artwork_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
          )}
          <div>
            <h3 className="text-xl font-bold text-foreground" data-testid="text-podcast-name">{podcast.name}</h3>
            {podcast.hosts_data && podcast.hosts_data.length > 0 ? (
              <div className="flex items-center gap-2 mt-1">
                {podcast.hosts_data.map((host: PodcastHost) => (
                  <div key={host.id} className="flex items-center gap-1.5">
                    {host.photo_url && <img src={host.photo_url} alt="" className="w-5 h-5 rounded-full object-cover" />}
                    <span className="text-sm text-muted-foreground">{host.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{podcast.hosts}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate({ tab: "episodes", podcastSlug: slug })}
            className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-xl text-sm font-semibold hover:bg-primary/20 transition-colors"
            data-testid="button-view-episodes"
          >
            <FileText className="w-4 h-4" />
            View Episodes ({stats?.episodeCount || 0})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-4">
            <h4 className="text-sm font-bold text-foreground">Edit Podcast</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
                <input data-testid="input-cms-podcast-name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
                <textarea data-testid="input-cms-podcast-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">About</label>
                <textarea data-testid="input-cms-podcast-about" value={form.aboutPodcast} onChange={(e) => setForm({ ...form, aboutPodcast: e.target.value })} rows={3} className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Hosts</label>
                  <input data-testid="input-cms-podcast-hosts" type="text" value={form.hosts} onChange={(e) => setForm({ ...form, hosts: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Artwork URL</label>
                  <input data-testid="input-cms-podcast-artwork" type="text" value={form.artworkUrl} onChange={(e) => setForm({ ...form, artworkUrl: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
                  <input data-testid="input-cms-podcast-category" type="text" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Frequency</label>
                  <input data-testid="input-cms-podcast-frequency" type="text" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Avg Length (min)</label>
                  <input data-testid="input-cms-podcast-avg-length" type="number" value={form.avgEpisodeLength || ""} onChange={(e) => setForm({ ...form, avgEpisodeLength: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Year Started</label>
                  <input data-testid="input-cms-podcast-year" type="number" value={form.yearStarted || ""} onChange={(e) => setForm({ ...form, yearStarted: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-4">
            <h4 className="text-sm font-bold text-foreground">Platform Links</h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Apple URL</label>
                <input type="text" value={form.appleUrl} onChange={(e) => setForm({ ...form, appleUrl: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="input-cms-podcast-apple" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Spotify URL</label>
                <input type="text" value={form.spotifyUrl} onChange={(e) => setForm({ ...form, spotifyUrl: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="input-cms-podcast-spotify" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">YouTube URL</label>
                <input type="text" value={form.youtubeUrl} onChange={(e) => setForm({ ...form, youtubeUrl: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="input-cms-podcast-youtube" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-4">
            <h4 className="text-sm font-bold text-foreground">Social & Web Links</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Website</label>
                <input type="text" value={form.websiteUrl} onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="input-cms-podcast-website" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Twitter Handle</label>
                <input type="text" value={form.twitterHandle} onChange={(e) => setForm({ ...form, twitterHandle: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="input-cms-podcast-twitter" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Instagram</label>
                <input type="text" value={form.instagramUrl} onChange={(e) => setForm({ ...form, instagramUrl: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="input-cms-podcast-instagram" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">TikTok</label>
                <input type="text" value={form.tiktokUrl} onChange={(e) => setForm({ ...form, tiktokUrl: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="input-cms-podcast-tiktok" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Facebook</label>
                <input type="text" value={form.facebookUrl} onChange={(e) => setForm({ ...form, facebookUrl: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="input-cms-podcast-facebook" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Discord</label>
                <input type="text" value={form.discordUrl} onChange={(e) => setForm({ ...form, discordUrl: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="input-cms-podcast-discord" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Store URL</label>
                <input type="text" value={form.storeUrl} onChange={(e) => setForm({ ...form, storeUrl: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="input-cms-podcast-store" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <StatusSelect value={form.status} onChange={(v) => setForm({ ...form, status: v })} />
            </div>
            <div>
              <button onClick={() => setForm({ ...form, hasLandingPage: !form.hasLandingPage })} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors w-full justify-center ${form.hasLandingPage ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400" : "bg-gray-50 border-gray-200 text-gray-500 dark:bg-gray-800/30 dark:border-gray-700 dark:text-gray-400"}`} data-testid="button-toggle-active">
                {form.hasLandingPage ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {form.hasLandingPage ? "Active" : "Inactive"}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={() => updateMutation.mutate(form)} disabled={updateMutation.isPending} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors" data-testid="button-save-podcast">
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </button>
          </div>

          {podcast?.hosts_data && podcast.hosts_data.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-4">
              <h4 className="text-sm font-bold text-foreground">Host Profiles</h4>
              {podcast.hosts_data.map((host: PodcastHost) => (
                <div key={host.id} className="flex items-start gap-3 p-3 bg-muted/20 rounded-lg" data-testid={`host-card-${host.id}`}>
                  {host.photo_url && <img src={host.photo_url} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{host.name}</p>
                    {host.bio && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{host.bio}</p>}
                    <div className="flex flex-wrap gap-2 mt-1">
                      {host.twitter_handle && <span className="text-xs text-primary">@{host.twitter_handle}</span>}
                      {host.linkedin_url && <a href={host.linkedin_url} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline">LinkedIn</a>}
                      {host.website_url && <a href={host.website_url} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline">Website</a>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}


        </div>

        <div className="space-y-4">
          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-4">
            <h4 className="text-sm font-bold text-foreground">Stats</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Episodes</span>
                <span className="text-sm font-bold text-foreground" data-testid="text-stat-episodes">{stats?.episodeCount || 0}</span>
              </div>
              {podcast?.total_episodes > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Total (Directory)</span>
                  <span className="text-sm font-bold text-foreground">{podcast.total_episodes}</span>
                </div>
              )}
              {podcast?.apple_rating > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Apple Rating</span>
                  <span className="text-sm font-bold text-foreground flex items-center gap-1"><Star className="w-3 h-3 text-amber-500" /> {podcast.apple_rating} ({podcast.apple_rating_count})</span>
                </div>
              )}
              {podcast?.known_for && Array.isArray(podcast.known_for) && podcast.known_for.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">Known For</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {podcast.known_for.map((k: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-md text-xs">{k}</span>
                    ))}
                  </div>
                </div>
              )}
              {stats?.recentGuests?.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">Recent Guests</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {stats.recentGuests.map((g: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 bg-muted/40 rounded-md text-xs text-foreground" data-testid={`text-guest-${i}`}>{g}</span>
                    ))}
                  </div>
                </div>
              )}
              {stats?.topTopics?.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">Top Topics</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {stats.topTopics.map((t: TopicStat, i: number) => (
                      <span key={i} className="px-2 py-0.5 bg-primary/10 text-primary rounded-md text-xs font-medium" data-testid={`text-topic-${i}`}>
                        {t.topic} ({t.count})
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {stats?.peopleMentioned?.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">People Mentioned</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {stats.peopleMentioned.map((p: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-md text-xs font-medium" data-testid={`text-person-${i}`}>{p}</span>
                    ))}
                  </div>
                </div>
              )}
              {stats?.companiesMentioned?.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">Companies Mentioned</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {stats.companiesMentioned.map((c: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded-md text-xs font-medium" data-testid={`text-company-${i}`}>{c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EpisodesList({ podcastSlug, onNavigate }: { podcastSlug: string; onNavigate: (view: CMSView) => void }) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const { data: episodes, isLoading } = useQuery<CMSEpisodeListItem[]>({
    queryKey: ["/api/admin/cms/podcasts", podcastSlug, "episodes", debouncedSearch, statusFilter, sortField, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("sort", sortField);
      params.set("order", sortOrder);
      const res = await fetch(`/api/admin/cms/podcasts/${podcastSlug}/episodes?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder(field === "date" ? "desc" : "asc");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="cms-episodes-list">
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => onNavigate({ tab: "podcast-detail", podcastSlug })}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-back-to-podcast"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Podcast
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-foreground">Episodes</h3>
          <p className="text-sm text-muted-foreground">{episodes?.length || 0} episodes for {podcastSlug}</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              data-testid="input-cms-episode-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search episodes..."
              className="w-full pl-9 pr-3 py-2 border border-border rounded-xl text-sm"
            />
          </div>
          <select
            data-testid="select-cms-episode-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 border border-border rounded-lg text-sm bg-white dark:bg-zinc-900"
          >
            <option value="all">All Status</option>
            <option value="published">Published</option>
            <option value="needs_review">Needs Review</option>
            <option value="hidden">Hidden</option>
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-border rounded-2xl overflow-hidden">
        <table className="w-full" data-testid="table-cms-episodes">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th
                className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("title")}
                data-testid="sort-episode-title"
              >
                <span className="flex items-center gap-1">
                  Title {sortField === "title" && (sortOrder === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                </span>
              </th>
              <th
                className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("date")}
                data-testid="sort-episode-date"
              >
                <span className="flex items-center gap-1">
                  Date {sortField === "date" && (sortOrder === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                </span>
              </th>
              <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Duration</th>
              <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(!episodes || episodes.length === 0) ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {search ? "No matching episodes found." : "No episodes for this podcast yet."}
                </td>
              </tr>
            ) : (
              episodes.map((ep) => (
                <tr
                  key={ep.id}
                  className="hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => onNavigate({ tab: "episode-detail", podcastSlug, episodeSlug: ep.episode_slug })}
                  data-testid={`row-cms-episode-${ep.id}`}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground text-sm truncate max-w-md">{ep.episode_title}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-muted-foreground">{ep.publish_date || "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-muted-foreground">{ep.duration || "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={ep.status || "published"} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AllEpisodesTab({ onNavigate }: { onNavigate: (view: CMSView) => void }) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ episodes: Array<{ id: number; slug: string; podcast_name: string; episode_title: string; episode_slug: string; publish_date: string; duration: string; status: string; artwork_url: string; view_count: number }>; total: number }>({
    queryKey: ["/api/admin/cms/all-episodes", debouncedSearch, statusFilter, sortField, sortOrder, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("sort", sortField);
      params.set("order", sortOrder);
      params.set("page", String(page));
      const res = await fetch(`/api/admin/cms/all-episodes?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const episodes = data?.episodes || [];
  const total = data?.total || 0;

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder(field === "date" ? "desc" : "asc");
    }
    setPage(1);
  };

  return (
    <div className="space-y-4" data-testid="cms-all-episodes">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-foreground">All Episodes</h3>
          <p className="text-sm text-muted-foreground">{total.toLocaleString()} episodes across all podcasts</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              data-testid="input-cms-all-episode-search"
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search episodes or podcasts..."
              className="w-full pl-9 pr-3 py-2 border border-border rounded-xl text-sm"
            />
          </div>
          <select
            data-testid="select-cms-all-episode-status"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="h-9 px-3 border border-border rounded-lg text-sm bg-white dark:bg-zinc-900"
          >
            <option value="all">All Status</option>
            <option value="published">Published</option>
            <option value="needs_review">Needs Review</option>
            <option value="hidden">Hidden</option>
          </select>
          <select
            data-testid="select-cms-all-episode-sort"
            value={sortField}
            onChange={(e) => { setSortField(e.target.value); setPage(1); }}
            className="h-9 px-3 border border-border rounded-lg text-sm bg-white dark:bg-zinc-900"
          >
            <option value="date">Most Recent</option>
            <option value="popular">Most Popular</option>
            <option value="title">Title A–Z</option>
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-border rounded-2xl overflow-hidden">
        <table className="w-full" data-testid="table-cms-all-episodes">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort("title")} data-testid="sort-all-episode-title">
                <span className="flex items-center gap-1">
                  Episode {sortField === "title" && (sortOrder === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                </span>
              </th>
              <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Podcast</th>
              <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort("date")} data-testid="sort-all-episode-date">
                <span className="flex items-center gap-1">
                  Date {sortField === "date" && (sortOrder === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                </span>
              </th>
              <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={4} className="px-4 py-12 text-center"><Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" /></td></tr>
            ) : episodes.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-12 text-center text-sm text-muted-foreground">{debouncedSearch ? "No matching episodes found." : "No episodes."}</td></tr>
            ) : (
              episodes.map((ep) => (
                <tr
                  key={ep.id}
                  className="hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => onNavigate({ tab: "episode-detail", podcastSlug: ep.slug, episodeSlug: ep.episode_slug })}
                  data-testid={`row-cms-all-episode-${ep.id}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {ep.artwork_url && <img src={ep.artwork_url} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />}
                      <p className="font-medium text-foreground text-sm truncate max-w-md">{ep.episode_title}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-muted-foreground truncate max-w-[200px] block">{ep.podcast_name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-muted-foreground">{ep.publish_date || "—"}</span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={ep.status || "published"} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 50 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted/40 disabled:opacity-30" data-testid="button-prev-episodes">Previous</button>
          <span className="text-xs text-muted-foreground">Page {page} of {Math.ceil(total / 50)}</span>
          <button disabled={page >= Math.ceil(total / 50)} onClick={() => setPage(page + 1)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted/40 disabled:opacity-30" data-testid="button-next-episodes">Next</button>
        </div>
      )}
    </div>
  );
}

function parseJSON<T>(val: string | undefined | null, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

function EpisodeDetail({ podcastSlug, episodeSlug, onNavigate }: { podcastSlug: string; episodeSlug: string; onNavigate: (view: CMSView) => void }) {
  const { toast } = useToast();
  const [showTranscript, setShowTranscript] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<number | null>(null);
  const [editingQuoteData, setEditingQuoteData] = useState<EditingQuote | null>(null);
  const [newQuote, setNewQuote] = useState<EditingQuote>({ speakerName: "", quoteText: "", context: "", quoteType: "Hero Quote" });
  const [showAddQuote, setShowAddQuote] = useState(false);

  const { data: episode, isLoading } = useQuery<CMSEpisodeDetail>({
    queryKey: ["/api/admin/cms/episodes", podcastSlug, episodeSlug],
    queryFn: async () => {
      const res = await fetch(`/api/admin/cms/episodes/${podcastSlug}/${episodeSlug}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const [form, setForm] = useState<EpisodeForm | null>(null);

  useEffect(() => {
    if (episode && !form) {
      const rawEntities: Record<string, string> = episode.entity_contexts_cache
        ? (typeof episode.entity_contexts_cache === "string"
          ? parseJSON<Record<string, string>>(episode.entity_contexts_cache, {})
          : episode.entity_contexts_cache)
        : {};
      const knownCompanyWords = ["capital", "ventures", "labs", "inc", "corp", "llc"];
      const entityEntries: EntityEntry[] = Object.entries(rawEntities).map(([slug, ctx]) => {
        const name = slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        const isCompany = knownCompanyWords.some(kw => name.toLowerCase().includes(kw)) ||
          (typeof ctx === "string" && /\b(company|platform|product|service|app)\b/i.test(ctx));
        return { name, context: ctx, type: isCompany ? "company" as const : "person" as const };
      });
      setForm({
        episodeTitle: episode.episode_title || "",
        publishDate: episode.publish_date || "",
        duration: episode.duration || "",
        artworkUrl: episode.artwork_url || "",
        tldl: episode.tldl || "",
        whatHappened: episode.what_happened || "",
        keyInsights: episode.key_insights || [],
        quote: episode.quote || "",
        quoteAttribution: episode.quote_attribution || "",
        hosts: episode.hosts || "",
        guests: parseJSON<CMSGuest[]>(episode.guests, []),
        resources: parseJSON<CMSResource[]>(episode.resources, []),
        sponsors: parseJSON<CMSSponsor[]>(episode.sponsors, []),
        keyTopics: episode.key_topics || [],
        status: episode.status || "published",
        entityContexts: entityEntries,
        spotifyEpisodeUrl: episode.spotify_episode_url || "",
        appleEpisodeUrl: episode.apple_episode_url || "",
        audioUrl: episode.audio_url || "",
        showNotes: episode.show_notes || "",
        tabloidHeadline: episode.tabloid_headline || "",
        tabloidSubHeadline: episode.tabloid_sub_headline || "",
      });
    }
  }, [episode]);

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, string | string[]>) => apiRequest("PATCH", `/api/admin/cms/episodes/${podcastSlug}/${episodeSlug}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/episodes", podcastSlug, episodeSlug] });
      toast({ title: "Episode updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/cms/episodes/${podcastSlug}/${episodeSlug}/regenerate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/episodes", podcastSlug, episodeSlug] });
      setForm(null);
      toast({ title: "Recap regenerated", description: "The AI has regenerated the recap from the transcript." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const addQuoteMutation = useMutation({
    mutationFn: (data: EditingQuote) => apiRequest("POST", `/api/admin/cms/episodes/${podcastSlug}/${episodeSlug}/quotes`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/episodes", podcastSlug, episodeSlug] });
      setShowAddQuote(false);
      setNewQuote({ speakerName: "", quoteText: "", context: "", quoteType: "Hero Quote" });
      toast({ title: "Quote added" });
    },
  });

  const updateQuoteMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: EditingQuote }) => apiRequest("PATCH", `/api/admin/cms/quotes/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/episodes", podcastSlug, episodeSlug] });
      setEditingQuoteId(null);
      setEditingQuoteData(null);
      toast({ title: "Quote updated" });
    },
  });

  const deleteQuoteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/cms/quotes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/episodes", podcastSlug, episodeSlug] });
      toast({ title: "Quote deleted" });
    },
  });

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const handleSave = () => {
    const entityCacheObj: Record<string, string> = {};
    for (const ent of form.entityContexts) {
      const slug = ent.name.toLowerCase().replace(/\s+/g, "-");
      entityCacheObj[slug] = ent.context;
    }
    const payload: Record<string, string | string[]> = {
      ...form,
      guests: JSON.stringify(form.guests),
      resources: JSON.stringify(form.resources),
      sponsors: JSON.stringify(form.sponsors),
      entityContextsCache: JSON.stringify(entityCacheObj),
    };
    updateMutation.mutate(payload);
  };

  const updateInsight = (index: number, value: string) => {
    const updated = [...form.keyInsights];
    updated[index] = value;
    setForm({ ...form, keyInsights: updated });
  };

  const removeInsight = (index: number) => {
    setForm({ ...form, keyInsights: form.keyInsights.filter((_, i) => i !== index) });
  };

  const addInsight = () => {
    setForm({ ...form, keyInsights: [...form.keyInsights, ""] });
  };

  const moveInsight = (index: number, direction: "up" | "down") => {
    const updated = [...form.keyInsights];
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= updated.length) return;
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setForm({ ...form, keyInsights: updated });
  };

  const updateResource = (index: number, field: keyof CMSResource, value: string) => {
    const updated = [...form.resources];
    updated[index] = { ...updated[index], [field]: value };
    setForm({ ...form, resources: updated });
  };

  const removeResource = (index: number) => {
    setForm({ ...form, resources: form.resources.filter((_, i) => i !== index) });
  };

  const addResource = (type: string) => {
    setForm({ ...form, resources: [...form.resources, { name: "", type, description: "" }] });
  };

  const startEditingQuote = (q: CMSQuote) => {
    setEditingQuoteId(q.id);
    setEditingQuoteData({
      speakerName: q.speaker_name,
      quoteText: q.quote_text,
      quoteType: q.quote_type,
      context: q.context || "",
    });
  };

  const MENTION_TYPES = ["book", "tool", "product", "service", "app", "website"] as const;
  const MENTION_TYPE_LABELS: Record<string, string> = {
    book: "Book", tool: "Tool", product: "Product", service: "Service", app: "App", website: "Website",
  };
  const MENTION_TYPE_COLORS: Record<string, string> = {
    book: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
    tool: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
    product: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
    service: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
    app: "bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400",
    website: "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400",
  };

  return (
    <div className="space-y-6" data-testid="cms-episode-detail">
      <div className="flex items-center gap-3">
        <button
          onClick={() => onNavigate({ tab: "episodes" })}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-back-to-episodes"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Episodes
        </button>
      </div>

      <CopyableId label="Episode" value={episode.id} context={episode.episode_title} />

      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-bold text-foreground" data-testid="text-episode-title">{episode.episode_title}</h3>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            {episode.publish_date && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{episode.publish_date}</span>}
            {episode.duration && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{episode.duration}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-sm font-semibold hover:bg-muted/30 transition-colors disabled:opacity-50"
            data-testid="button-regenerate"
          >
            {regenerateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Regenerate
          </button>
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            data-testid="button-save-episode"
          >
            {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>

      {(() => {
        const hasVal = (v: any) => v && typeof v === 'string' && v.trim() !== '' && v.trim() !== '[]' && v.trim() !== 'null';
        const hasArr = (v: any) => {
          if (!v) return false;
          if (Array.isArray(v)) return v.length > 0;
          if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) && p.length > 0; } catch { return false; } }
          return false;
        };
        const checks = [
          { label: "Transcript", icon: FileText, ok: !!episode.transcript },
          { label: "TL;DL", icon: Zap, ok: hasVal(episode.tldl) },
          { label: "Quote", icon: MessageSquareQuote, ok: hasVal(episode.quote) },
          { label: "Key Insights", icon: Star, ok: Array.isArray(episode.key_insights) ? episode.key_insights.length > 0 : hasArr(episode.key_insights as any) },
          { label: "Guests", icon: Users, ok: hasArr(episode.guests) },
          { label: "Sponsors", icon: Building2, ok: hasArr(episode.sponsors) },
          { label: "Resources", icon: BookOpen, ok: hasArr(episode.resources) },
          { label: "Questions", icon: HelpCircle, ok: hasArr(episode.top_questions) },
          { label: "Topic Context", icon: Brain, ok: hasVal(episode.topic_contexts) },
          { label: "Quotes DB", icon: MessageSquareQuote, ok: episode.quotes && episode.quotes.length > 0 },
          { label: "Show Notes", icon: FileText, ok: hasVal(episode.show_notes) },
          { label: "Apple URL", icon: Link, ok: hasVal(episode.apple_episode_url) },
          { label: "Spotify URL", icon: Music, ok: hasVal(episode.spotify_episode_url) },
          { label: "Audio", icon: Headphones, ok: hasVal(episode.audio_url) },
          { label: "Tabloid", icon: Newspaper, ok: hasVal(episode.tabloid_headline) },
          { label: "Products", icon: ShoppingBag, ok: episode.extractedProducts && episode.extractedProducts.length > 0 },
        ];
        const done = checks.filter(c => c.ok).length;
        const pct = Math.round((done / checks.length) * 100);
        return (
          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-4" data-testid="episode-enrichment-status">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-foreground">Enrichment Status</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pct === 100 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : pct >= 70 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                {done}/{checks.length} ({pct}%)
              </span>
            </div>
            <div className="w-full bg-muted/40 rounded-full h-1.5 mb-3">
              <div className={`h-1.5 rounded-full transition-all ${pct === 100 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="grid grid-cols-4 gap-x-4 gap-y-1.5">
              {checks.map(c => (
                <div key={c.label} className="flex items-center gap-1.5 text-xs">
                  {c.ok
                    ? <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                  <c.icon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <span className={c.ok ? "text-muted-foreground" : "text-foreground font-medium"}>{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {episode.transcript && (
        <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors"
            data-testid="button-toggle-transcript"
          >
            <span className="text-sm font-bold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Transcript
              <span className="text-xs text-muted-foreground font-normal">({Math.round(episode.transcript.length / 1000)}k chars)</span>
            </span>
            {showTranscript ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {showTranscript && (
            <div className="px-5 pb-5 max-h-96 overflow-y-auto">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed" data-testid="text-transcript">
                {episode.transcript}
              </pre>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-4">
            <h4 className="text-sm font-bold text-foreground">Email Headlines</h4>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Tabloid Headline</label>
              <input
                data-testid="input-cms-tabloid-headline"
                value={form.tabloidHeadline}
                onChange={(e) => setForm({ ...form, tabloidHeadline: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                placeholder="e.g. The food critic who saved his own life"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Tabloid Sub-Headline</label>
              <textarea
                data-testid="input-cms-tabloid-sub-headline"
                value={form.tabloidSubHeadline}
                onChange={(e) => setForm({ ...form, tabloidSubHeadline: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none"
                placeholder="e.g. He eliminated sugar and white flour to reclaim his health — and he now spends 25 minutes savoring just one raisin"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-4">
            <h4 className="text-sm font-bold text-foreground">Recap</h4>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">TLDL</label>
              <textarea
                data-testid="input-cms-tldl"
                value={form.tldl}
                onChange={(e) => setForm({ ...form, tldl: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">What Happened</label>
              <textarea
                data-testid="input-cms-what-happened"
                value={form.whatHappened}
                onChange={(e) => setForm({ ...form, whatHappened: e.target.value })}
                rows={10}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground">Key Takeaways</h4>
              <button
                onClick={addInsight}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                data-testid="button-add-takeaway"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>

            {form.keyInsights.map((insight: string, i: number) => (
              <div key={i} className="flex items-start gap-2" data-testid={`takeaway-item-${i}`}>
                <div className="flex flex-col gap-1 pt-2">
                  <button onClick={() => moveInsight(i, "up")} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20" data-testid={`button-move-up-${i}`}>
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button onClick={() => moveInsight(i, "down")} disabled={i === form.keyInsights.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-20" data-testid={`button-move-down-${i}`}>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
                <textarea
                  value={insight}
                  onChange={(e) => updateInsight(i, e.target.value)}
                  rows={3}
                  className="flex-1 px-3 py-2 border border-border rounded-lg text-sm resize-none"
                  data-testid={`input-takeaway-${i}`}
                />
                <button
                  onClick={() => removeInsight(i)}
                  className="text-muted-foreground hover:text-red-500 pt-2"
                  data-testid={`button-delete-takeaway-${i}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground">Quotes (from episode_quotes)</h4>
              <button
                onClick={() => setShowAddQuote(!showAddQuote)}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                data-testid="button-add-quote"
              >
                <Plus className="w-3 h-3" /> Add Quote
              </button>
            </div>

            {showAddQuote && (
              <div className="border border-primary/20 rounded-lg p-3 space-y-2 bg-primary/5" data-testid="form-add-quote">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="Speaker name"
                    value={newQuote.speakerName}
                    onChange={(e) => setNewQuote({ ...newQuote, speakerName: e.target.value })}
                    className="px-3 py-2 border border-border rounded-lg text-sm"
                    data-testid="input-new-quote-speaker"
                  />
                  <select
                    value={newQuote.quoteType}
                    onChange={(e) => setNewQuote({ ...newQuote, quoteType: e.target.value })}
                    className="px-3 py-2 border border-border rounded-lg text-sm bg-white dark:bg-zinc-900"
                    data-testid="select-new-quote-type"
                  >
                    <option value="Hero Quote">Hero Quote</option>
                    <option value="Hot Take">Hot Take</option>
                    <option value="Prediction">Prediction</option>
                    <option value="Spicy">Spicy</option>
                    <option value="Tweetable">Tweetable</option>
                  </select>
                </div>
                <textarea
                  placeholder="Quote text"
                  value={newQuote.quoteText}
                  onChange={(e) => setNewQuote({ ...newQuote, quoteText: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none"
                  data-testid="input-new-quote-text"
                />
                <input
                  placeholder="Context"
                  value={newQuote.context}
                  onChange={(e) => setNewQuote({ ...newQuote, context: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  data-testid="input-new-quote-context"
                />
                <button
                  onClick={() => addQuoteMutation.mutate(newQuote)}
                  disabled={!newQuote.quoteText || addQuoteMutation.isPending}
                  className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                  data-testid="button-submit-quote"
                >
                  {addQuoteMutation.isPending ? "Adding..." : "Add Quote"}
                </button>
              </div>
            )}

            {(episode.quotes || []).map((q: CMSQuote) => (
              <div key={q.id} className="border border-border rounded-lg p-3 space-y-2" data-testid={`quote-item-${q.id}`}>
                {editingQuoteId === q.id && editingQuoteData ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={editingQuoteData.speakerName}
                        onChange={(e) => setEditingQuoteData({ ...editingQuoteData, speakerName: e.target.value })}
                        className="px-3 py-2 border border-border rounded-lg text-sm"
                        data-testid={`input-edit-quote-speaker-${q.id}`}
                      />
                      <select
                        value={editingQuoteData.quoteType}
                        onChange={(e) => setEditingQuoteData({ ...editingQuoteData, quoteType: e.target.value })}
                        className="px-3 py-2 border border-border rounded-lg text-sm bg-white dark:bg-zinc-900"
                        data-testid={`select-edit-quote-type-${q.id}`}
                      >
                        <option value="Hero Quote">Hero Quote</option>
                        <option value="Hot Take">Hot Take</option>
                        <option value="Prediction">Prediction</option>
                        <option value="Spicy">Spicy</option>
                        <option value="Tweetable">Tweetable</option>
                      </select>
                    </div>
                    <textarea
                      value={editingQuoteData.quoteText}
                      onChange={(e) => setEditingQuoteData({ ...editingQuoteData, quoteText: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none"
                      data-testid={`input-edit-quote-text-${q.id}`}
                    />
                    <input
                      value={editingQuoteData.context}
                      onChange={(e) => setEditingQuoteData({ ...editingQuoteData, context: e.target.value })}
                      placeholder="Context"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                      data-testid={`input-edit-quote-context-${q.id}`}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuoteMutation.mutate({ id: q.id, data: editingQuoteData })}
                        disabled={updateQuoteMutation.isPending}
                        className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                        data-testid={`button-save-quote-${q.id}`}
                      >
                        {updateQuoteMutation.isPending ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={() => { setEditingQuoteId(null); setEditingQuoteData(null); }}
                        className="px-3 py-1.5 border border-border rounded-lg text-xs font-semibold"
                        data-testid={`button-cancel-edit-quote-${q.id}`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">{q.speaker_name}</span>
                        <span className="px-1.5 py-0.5 bg-muted/40 rounded text-xs text-muted-foreground">{q.quote_type}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => startEditingQuote(q)}
                          className="text-muted-foreground hover:text-primary"
                          data-testid={`button-edit-quote-${q.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteQuoteMutation.mutate(q.id)}
                          className="text-muted-foreground hover:text-red-500"
                          data-testid={`button-delete-quote-${q.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-foreground italic">"{q.quote_text}"</p>
                    {q.context && <p className="text-xs text-muted-foreground">{q.context}</p>}
                  </>
                )}
              </div>
            ))}
            {(!episode.quotes || episode.quotes.length === 0) && !showAddQuote && (
              <p className="text-xs text-muted-foreground text-center py-4">No quotes yet.</p>
            )}
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-4">
            <h4 className="text-sm font-bold text-foreground">Featured Quote</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Quote</label>
                <textarea
                  data-testid="input-cms-quote"
                  value={form.quote}
                  onChange={(e) => setForm({ ...form, quote: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Attribution</label>
                <input
                  data-testid="input-cms-quote-attribution"
                  type="text"
                  value={form.quoteAttribution}
                  onChange={(e) => setForm({ ...form, quoteAttribution: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-4">
            <h4 className="text-sm font-bold text-foreground">Show Notes</h4>
            <textarea
              data-testid="input-cms-show-notes"
              value={form.showNotes}
              onChange={(e) => setForm({ ...form, showNotes: e.target.value })}
              rows={6}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none"
              placeholder="Original show notes..."
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-3">
            <h4 className="text-sm font-bold text-foreground">Status & Meta</h4>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
              <StatusSelect value={form.status} onChange={(v) => setForm({ ...form, status: v })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Title</label>
              <input
                data-testid="input-cms-episode-title"
                type="text"
                value={form.episodeTitle}
                onChange={(e) => setForm({ ...form, episodeTitle: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Publish Date</label>
              <input
                data-testid="input-cms-episode-date"
                type="text"
                value={form.publishDate}
                onChange={(e) => setForm({ ...form, publishDate: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Duration</label>
              <input
                data-testid="input-cms-episode-duration"
                type="text"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Artwork URL</label>
              <input
                data-testid="input-cms-episode-artwork"
                type="text"
                value={form.artworkUrl}
                onChange={(e) => setForm({ ...form, artworkUrl: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
              {form.artworkUrl && (
                <img src={form.artworkUrl} alt="" className="w-12 h-12 rounded-lg object-cover mt-1" />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Hosts</label>
              {episode?.podcastHosts && episode.podcastHosts.length > 0 ? (
                <div className="flex flex-wrap gap-3 mt-1">
                  {episode.podcastHosts.map((host: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-1.5">
                      {host.photo_url && <img src={host.photo_url} alt="" className="w-6 h-6 rounded-full object-cover" />}
                      <span className="text-xs font-medium">{host.name}</span>
                      {host.twitter_handle && <span className="text-[10px] text-muted-foreground">@{host.twitter_handle}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <input
                  data-testid="input-cms-episode-hosts"
                  type="text"
                  value={form.hosts}
                  onChange={(e) => setForm({ ...form, hosts: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                />
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-3">
            <h4 className="text-sm font-bold text-foreground">Episode Links</h4>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Apple Podcasts URL</label>
              <input
                data-testid="input-cms-apple-url"
                type="text"
                value={form.appleEpisodeUrl}
                onChange={(e) => setForm({ ...form, appleEpisodeUrl: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                placeholder="https://podcasts.apple.com/..."
              />
              {form.appleEpisodeUrl && (
                <a href={form.appleEpisodeUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block" data-testid="link-apple-episode">Open in Apple Podcasts</a>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Spotify URL</label>
              <input
                data-testid="input-cms-spotify-url"
                type="text"
                value={form.spotifyEpisodeUrl}
                onChange={(e) => setForm({ ...form, spotifyEpisodeUrl: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                placeholder="https://open.spotify.com/episode/..."
              />
              {form.spotifyEpisodeUrl && (
                <a href={form.spotifyEpisodeUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block" data-testid="link-spotify-episode">Open in Spotify</a>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Audio URL</label>
              <input
                data-testid="input-cms-audio-url"
                type="text"
                value={form.audioUrl}
                onChange={(e) => setForm({ ...form, audioUrl: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                placeholder="https://..."
              />
              {form.audioUrl && (
                <a href={form.audioUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block" data-testid="link-audio">Listen to audio</a>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-3">
            <h4 className="text-sm font-bold text-foreground">Guests</h4>
            {form.guests.length === 0 ? (
              <p className="text-xs text-muted-foreground">No guests parsed.</p>
            ) : (
              form.guests.map((g, i) => (
                <div key={i} className="border border-border rounded-lg p-2 space-y-1" data-testid={`guest-item-${i}`}>
                  <input
                    placeholder="Name"
                    value={g.name || ""}
                    onChange={(e) => {
                      const updated = [...form.guests];
                      updated[i] = { ...updated[i], name: e.target.value };
                      setForm({ ...form, guests: updated });
                    }}
                    className="w-full px-2 py-1 border border-border rounded text-xs"
                    data-testid={`input-guest-name-${i}`}
                  />
                  <input
                    placeholder="Title"
                    value={g.title || ""}
                    onChange={(e) => {
                      const updated = [...form.guests];
                      updated[i] = { ...updated[i], title: e.target.value };
                      setForm({ ...form, guests: updated });
                    }}
                    className="w-full px-2 py-1 border border-border rounded text-xs"
                    data-testid={`input-guest-title-${i}`}
                  />
                </div>
              ))
            )}
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-3">
            <h4 className="text-sm font-bold text-foreground">Topics</h4>
            <div className="flex flex-wrap gap-1">
              {(form.keyTopics || []).map((t: string, i: number) => (
                <span key={i} className="px-2 py-0.5 bg-primary/10 text-primary rounded-md text-xs font-medium" data-testid={`text-key-topic-${i}`}>{t}</span>
              ))}
              {(!form.keyTopics || form.keyTopics.length === 0) && (
                <p className="text-xs text-muted-foreground">No topics.</p>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground">Mentions</h4>
              <div className="flex items-center gap-1">
                {MENTION_TYPES.map((mt) => (
                  <button key={mt} onClick={() => addResource(mt)} className="px-2 py-1 text-[10px] font-semibold rounded-md bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" data-testid={`button-add-mention-${mt}`}>
                    + {MENTION_TYPE_LABELS[mt]}
                  </button>
                ))}
              </div>
            </div>
            {form.resources.length === 0 && <p className="text-xs text-muted-foreground">No mentions.</p>}
            {form.resources.map((r, ri) => (
              <div key={ri} className="border border-border rounded-lg p-2 space-y-1" data-testid={`mention-item-${ri}`}>
                <div className="flex items-center gap-2">
                  <select
                    value={r.type}
                    onChange={(e) => updateResource(ri, "type", e.target.value)}
                    className="px-2 py-1 border border-border rounded text-xs bg-white dark:bg-zinc-900 flex-shrink-0"
                    data-testid={`select-mention-type-${ri}`}
                  >
                    {MENTION_TYPES.map((mt) => (
                      <option key={mt} value={mt}>{MENTION_TYPE_LABELS[mt]}</option>
                    ))}
                  </select>
                  <input
                    placeholder={r.type === "book" ? "Book title" : "Name"}
                    value={r.name}
                    onChange={(e) => updateResource(ri, "name", e.target.value)}
                    className="flex-1 px-2 py-1 border border-border rounded text-xs"
                    data-testid={`input-mention-name-${ri}`}
                  />
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${MENTION_TYPE_COLORS[r.type] || "bg-gray-100 text-gray-600"}`}>
                    {MENTION_TYPE_LABELS[r.type] || r.type}
                  </span>
                  <button onClick={() => removeResource(ri)} className="text-muted-foreground hover:text-red-500 flex-shrink-0" data-testid={`button-delete-mention-${ri}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {r.type === "book" && (
                  <input
                    placeholder="Author"
                    value={r.author || ""}
                    onChange={(e) => updateResource(ri, "author", e.target.value)}
                    className="w-full px-2 py-1 border border-border rounded text-xs"
                    data-testid={`input-mention-author-${ri}`}
                  />
                )}
                {r.type !== "book" && (
                  <input
                    placeholder="Category (e.g. SaaS, Hardware, Finance)"
                    value={r.category || ""}
                    onChange={(e) => updateResource(ri, "category", e.target.value)}
                    className="w-full px-2 py-1 border border-border rounded text-xs"
                    data-testid={`input-mention-category-${ri}`}
                  />
                )}
                <input
                  placeholder="Description"
                  value={r.description || ""}
                  onChange={(e) => updateResource(ri, "description", e.target.value)}
                  className="w-full px-2 py-1 border border-border rounded text-xs"
                  data-testid={`input-mention-desc-${ri}`}
                />
                {r.type !== "book" && (
                  <input
                    placeholder="Context (how it was mentioned)"
                    value={r.context || ""}
                    onChange={(e) => updateResource(ri, "context", e.target.value)}
                    className="w-full px-2 py-1 border border-border rounded text-xs"
                    data-testid={`input-mention-context-${ri}`}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-3">
            <h4 className="text-sm font-bold text-foreground">Sponsors</h4>
            {form.sponsors.length === 0 && <p className="text-xs text-muted-foreground">No sponsors.</p>}
            {form.sponsors.map((s, i) => (
              <div key={i} className="border border-border rounded-lg p-2 space-y-1" data-testid={`sponsor-item-${i}`}>
                <input
                  placeholder="Name"
                  value={s.name}
                  onChange={(e) => {
                    const updated = [...form.sponsors];
                    updated[i] = { ...updated[i], name: e.target.value };
                    setForm({ ...form, sponsors: updated });
                  }}
                  className="w-full px-2 py-1 border border-border rounded text-xs"
                  data-testid={`input-sponsor-name-${i}`}
                />
                <input
                  placeholder="Description"
                  value={s.description || ""}
                  onChange={(e) => {
                    const updated = [...form.sponsors];
                    updated[i] = { ...updated[i], description: e.target.value };
                    setForm({ ...form, sponsors: updated });
                  }}
                  className="w-full px-2 py-1 border border-border rounded text-xs"
                  data-testid={`input-sponsor-desc-${i}`}
                />
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground">People Mentioned</h4>
              <button
                onClick={() => setForm({ ...form, entityContexts: [...form.entityContexts, { name: "", context: "", type: "person" }] })}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                data-testid="button-add-person"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            {form.entityContexts.filter((e) => e.type === "person").length === 0 && (
              <p className="text-xs text-muted-foreground">No people mentioned.</p>
            )}
            {form.entityContexts.map((ent, i) => ent.type === "person" ? (
              <div key={i} className="border border-border rounded-lg p-2 space-y-1" data-testid={`person-item-${i}`}>
                <div className="flex items-center gap-2">
                  <input
                    placeholder="Name"
                    value={ent.name}
                    onChange={(e) => {
                      const updated = [...form.entityContexts];
                      updated[i] = { ...updated[i], name: e.target.value };
                      setForm({ ...form, entityContexts: updated });
                    }}
                    className="flex-1 px-2 py-1 border border-border rounded text-xs"
                    data-testid={`input-person-name-${i}`}
                  />
                  <button
                    onClick={() => setForm({ ...form, entityContexts: form.entityContexts.filter((_, idx) => idx !== i) })}
                    className="text-muted-foreground hover:text-red-500"
                    data-testid={`button-delete-person-${i}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  placeholder="Context (how they were mentioned)"
                  value={ent.context}
                  onChange={(e) => {
                    const updated = [...form.entityContexts];
                    updated[i] = { ...updated[i], context: e.target.value };
                    setForm({ ...form, entityContexts: updated });
                  }}
                  className="w-full px-2 py-1 border border-border rounded text-xs"
                  data-testid={`input-person-context-${i}`}
                />
              </div>
            ) : null)}
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground">Companies Mentioned</h4>
              <button
                onClick={() => setForm({ ...form, entityContexts: [...form.entityContexts, { name: "", context: "", type: "company" }] })}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                data-testid="button-add-company"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            {form.entityContexts.filter((e) => e.type === "company").length === 0 && (
              <p className="text-xs text-muted-foreground">No companies mentioned.</p>
            )}
            {form.entityContexts.map((ent, i) => ent.type === "company" ? (
              <div key={i} className="border border-border rounded-lg p-2 space-y-1" data-testid={`company-item-${i}`}>
                <div className="flex items-center gap-2">
                  <input
                    placeholder="Company name"
                    value={ent.name}
                    onChange={(e) => {
                      const updated = [...form.entityContexts];
                      updated[i] = { ...updated[i], name: e.target.value };
                      setForm({ ...form, entityContexts: updated });
                    }}
                    className="flex-1 px-2 py-1 border border-border rounded text-xs"
                    data-testid={`input-company-name-${i}`}
                  />
                  <button
                    onClick={() => setForm({ ...form, entityContexts: form.entityContexts.filter((_, idx) => idx !== i) })}
                    className="text-muted-foreground hover:text-red-500"
                    data-testid={`button-delete-company-${i}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  placeholder="Context (how they were mentioned)"
                  value={ent.context}
                  onChange={(e) => {
                    const updated = [...form.entityContexts];
                    updated[i] = { ...updated[i], context: e.target.value };
                    setForm({ ...form, entityContexts: updated });
                  }}
                  className="w-full px-2 py-1 border border-border rounded text-xs"
                  data-testid={`input-company-context-${i}`}
                />
              </div>
            ) : null)}
          </div>

          {episode?.extractedProducts && episode.extractedProducts.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-3">
              <h4 className="text-sm font-bold text-foreground">Extracted Products</h4>
              {episode.extractedProducts.map((p: ExtractedProduct) => (
                <div key={p.id} className="border border-border rounded-lg p-2 space-y-1" data-testid={`extracted-product-${p.id}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">{p.name}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  {p.company && <p className="text-xs text-muted-foreground">by {p.company}</p>}
                  {p.category && <p className="text-xs text-muted-foreground">Category: {p.category}</p>}
                  {p.context && <p className="text-xs text-muted-foreground">{p.context}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EntityBackfillBanner() {
  const { toast } = useToast();
  const [polling, setPolling] = useState(false);
  const [progress, setProgress] = useState<any>(null);

  const { data: status } = useQuery<{ total_episodes: number; with_entities: number; without_entities: number; backfillable: number }>({
    queryKey: ["/api/admin/cms/entity-backfill-status"],
  });

  useQuery({
    queryKey: ["/api/admin/cms/entity-backfill-progress"],
    queryFn: async () => {
      const res = await fetch("/api/admin/cms/entity-backfill-progress", { credentials: "include" });
      if (!res.ok) return null;
      const data = await res.json();
      setProgress(data);
      if (!data.running && polling) {
        setPolling(false);
        queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/entity-backfill-status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/people"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/companies"] });
      }
      return data;
    },
    refetchInterval: polling ? 3000 : false,
    enabled: polling,
  });

  const backfillMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/cms/entity-backfill", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (res.status === 409) { setPolling(true); return; }
      if (!res.ok) throw new Error("Failed to start");
    },
    onSuccess: () => {
      toast({ title: "Entity backfill started" });
      setPolling(true);
    },
    onError: (err: Error) => toast({ title: "Backfill failed", description: err.message, variant: "destructive" }),
  });

  if (!status || (status.without_entities === 0 && !polling && !progress)) return null;

  const overallPct = Math.round((status.with_entities / status.total_episodes) * 100);
  const runPct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const isComplete = progress && !progress.running && progress.done > 0 && progress.done === progress.total;

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 space-y-3" data-testid="entity-backfill-banner">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <span className="text-sm text-amber-800 dark:text-amber-300">
            Entity mentions: {status.with_entities}/{status.total_episodes} episodes ({overallPct}%) — {status.backfillable} can be backfilled
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => backfillMutation.mutate()}
            disabled={backfillMutation.isPending || polling}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 disabled:opacity-50 flex-shrink-0"
            data-testid="button-run-backfill"
          >
            {polling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            {polling ? "Running..." : "Run Backfill"}
          </button>
          {progress && progress.total > 0 && (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${
              isComplete ? "bg-green-100 text-green-700" : polling ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
            }`}>
              {isComplete ? "✓ Complete" : polling ? `${runPct}%` : `Last: ${runPct}%`}
            </span>
          )}
        </div>
      </div>
      {progress && progress.total > 0 && (polling || isComplete) && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-amber-200 dark:bg-amber-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${isComplete ? "bg-green-500" : "bg-amber-600"}`}
                style={{ width: `${runPct}%` }}
              />
            </div>
            <span className="text-xs text-amber-700 dark:text-amber-400 whitespace-nowrap w-24 text-right">
              {progress.done}/{progress.total}
            </span>
          </div>
          <div className="flex gap-3 text-xs text-amber-700 dark:text-amber-400">
            <span>{progress.processed} processed</span>
            <span>{progress.totalEntities} entities found</span>
            {progress.errors > 0 && <span className="text-red-500">{progress.errors} errors</span>}
          </div>
          {progress.log && progress.log.length > 0 && (
            <details className="mt-1">
              <summary className="text-xs text-amber-600 dark:text-amber-400 cursor-pointer hover:text-amber-800">
                View log ({progress.log.length} entries)
              </summary>
              <div className="mt-1 max-h-40 overflow-y-auto bg-amber-100/50 dark:bg-amber-900/30 rounded-lg p-2 text-xs font-mono space-y-0.5">
                {progress.log.slice(-20).map((line: string, i: number) => (
                  <div key={i} className={line.startsWith("✓") ? "text-green-600" : line.startsWith("✗") ? "text-red-500" : "text-amber-700"}>
                    {line}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

interface EntityPerson {
  id: number; slug: string; name: string; bio: string | null; photoUrl: string | null;
  title: string | null; company: string | null; twitterHandle: string | null;
  linkedinUrl: string | null; websiteUrl: string | null; category: string | null;
  searchTerms: string[]; hostedSlugs: string[]; verified: boolean; episodeCount: number; context: string;
  createdAt: string | null; updatedAt: string | null;
}

interface EntityCompany {
  id: number; slug: string; name: string; description: string | null; logoUrl: string | null;
  industry: string | null; websiteUrl: string | null; twitterHandle: string | null;
  category: string | null; searchTerms: string[]; associatedTerms: string[];
  verified: boolean; episodeCount: number; context: string;
  createdAt: string | null; updatedAt: string | null;
}

interface EntityMention {
  id: number; episodeSlug: string; podcastSlug: string; podcastName: string;
  episodeTitle: string; publishDate: string; context: string;
}

function PersonDetailPanel({ slug, onClose }: { slug: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<EntityPerson & { mentions: EntityMention[] }>({
    queryKey: ["/api/admin/cms/people", slug],
    queryFn: async () => {
      const res = await fetch(`/api/admin/cms/people/${slug}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<EntityPerson>>({});
  const [searchTermsInput, setSearchTermsInput] = useState("");
  const [hostedSlugsInput, setHostedSlugsInput] = useState("");
  const updateMut = useMutation({
    mutationFn: (body: Partial<EntityPerson>) => apiRequest("PATCH", `/api/admin/cms/people/${slug}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/people"] });
      toast({ title: "Person updated" });
      setEditing(false);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });
  const enrichMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/enrich-person/${slug}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/people", slug] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/people"] });
      toast({ title: "Person enriched with AI" });
    },
    onError: (err: Error) => toast({ title: "Enrichment failed", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (!data) return null;

  const startEditing = () => {
    setForm(data);
    setSearchTermsInput((data.searchTerms || []).join(", "));
    setHostedSlugsInput((data.hostedSlugs || []).join(", "));
    setEditing(true);
  };

  const handleSave = () => {
    const { id: _id, slug: _slug, episodeCount: _ec, context: _ctx, createdAt: _ca, updatedAt: _ua, ...editableFields } = form as EntityPerson;
    const payload = {
      ...editableFields,
      searchTerms: searchTermsInput.split(",").map(s => s.trim()).filter(Boolean),
      hostedSlugs: hostedSlugsInput.split(",").map(s => s.trim()).filter(Boolean),
    };
    updateMut.mutate(payload);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onClose} className="text-sm text-primary hover:underline flex items-center gap-1" data-testid="button-back-people">
          <ChevronLeft className="w-4 h-4" /> Back to People
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => enrichMut.mutate()}
            disabled={enrichMut.isPending}
            className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-md text-xs hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors disabled:opacity-50"
            data-testid="button-enrich-person"
          >
            {enrichMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {enrichMut.isPending ? "Enriching..." : "Enrich with AI"}
          </button>
          {data.verified && <span className="px-2 py-0.5 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-md text-xs">Verified</span>}
          <button onClick={() => { if (editing) { setEditing(false); } else { startEditing(); } }} className="text-xs text-primary hover:underline" data-testid="button-edit-person">
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>
      </div>
      <CopyableId label="Person" value={data.id} context={data.name} />
      <EnrichmentStatus fields={[
        { label: "Photo", filled: !!data.photoUrl?.trim() },
        { label: "Bio", filled: !!data.bio?.trim() },
        { label: "Title", filled: !!data.title?.trim() },
        { label: "Company", filled: !!data.company?.trim() },
        { label: "Category", filled: !!data.category?.trim() },
        { label: "Twitter", filled: !!data.twitterHandle?.trim() },
        { label: "LinkedIn", filled: !!data.linkedinUrl?.trim() },
        { label: "Website", filled: !!data.websiteUrl?.trim() },
        { label: "Search Terms", filled: !!(data.searchTerms?.length) },
        { label: "Hosted Slugs", filled: !!(data.hostedSlugs?.length) },
        { label: "Verified", filled: !!data.verified },
      ]} />
      <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center gap-1">
            {data.photoUrl ? (
              <>
                <img src={data.photoUrl} alt={data.name} className="w-16 h-16 rounded-full object-cover" data-testid="img-person-photo" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; const fallback = (e.target as HTMLImageElement).parentElement?.querySelector('[data-fallback]'); if (fallback) (fallback as HTMLElement).classList.remove('hidden'); }} />
                <div data-fallback className="hidden w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-400 text-xl font-bold">{data.name.charAt(0)}</div>
              </>
            ) : (
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-400 text-xl font-bold">{data.name.charAt(0)}</div>
            )}
            {data.photoUrl ? (
              <span className="text-[10px] text-muted-foreground max-w-[100px] text-center truncate" title={data.photoUrl} data-testid="text-photo-source">
                {data.photoUrl.startsWith("/people/") ? `Local file: ${data.photoUrl}` : data.photoUrl}
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground italic" data-testid="text-no-photo">No photo</span>
            )}
          </div>
          <div className="flex-1">
            {editing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground">Name</label><input className="w-full border rounded px-2 py-1 text-sm" value={form.name || ""} onChange={e => setForm({...form, name: e.target.value})} data-testid="input-person-name" /></div>
                  <div><label className="text-xs text-muted-foreground">Slug</label><input className="w-full border rounded px-2 py-1 text-sm bg-gray-50 dark:bg-zinc-800" value={form.slug || ""} readOnly data-testid="input-person-slug" /></div>
                  <div><label className="text-xs text-muted-foreground">Title</label><input className="w-full border rounded px-2 py-1 text-sm" value={form.title || ""} onChange={e => setForm({...form, title: e.target.value})} data-testid="input-person-title" /></div>
                  <div><label className="text-xs text-muted-foreground">Company</label><input className="w-full border rounded px-2 py-1 text-sm" value={form.company || ""} onChange={e => setForm({...form, company: e.target.value})} data-testid="input-person-company" /></div>
                  <div><label className="text-xs text-muted-foreground">Category</label><input className="w-full border rounded px-2 py-1 text-sm" value={form.category || ""} onChange={e => setForm({...form, category: e.target.value})} placeholder="entrepreneur, investor, host..." data-testid="input-person-category" /></div>
                  <div>
                    <label className="text-xs text-muted-foreground">Photo URL</label>
                    <div className="flex items-center gap-2">
                      <input className="w-full border rounded px-2 py-1 text-sm" value={form.photoUrl || ""} onChange={e => setForm({...form, photoUrl: e.target.value})} data-testid="input-person-photo" />
                      {form.photoUrl && <img key={form.photoUrl} src={form.photoUrl} alt="preview" className="w-8 h-8 rounded-full object-cover shrink-0" data-testid="img-photo-preview" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                    </div>
                  </div>
                  <div><label className="text-xs text-muted-foreground">Twitter</label><input className="w-full border rounded px-2 py-1 text-sm" value={form.twitterHandle || ""} onChange={e => setForm({...form, twitterHandle: e.target.value})} data-testid="input-person-twitter" /></div>
                  <div><label className="text-xs text-muted-foreground">LinkedIn URL</label><input className="w-full border rounded px-2 py-1 text-sm" value={form.linkedinUrl || ""} onChange={e => setForm({...form, linkedinUrl: e.target.value})} data-testid="input-person-linkedin" /></div>
                  <div><label className="text-xs text-muted-foreground">Website URL</label><input className="w-full border rounded px-2 py-1 text-sm" value={form.websiteUrl || ""} onChange={e => setForm({...form, websiteUrl: e.target.value})} data-testid="input-person-website" /></div>
                </div>
                <div><label className="text-xs text-muted-foreground">Bio</label><textarea className="w-full border rounded px-2 py-1 text-sm min-h-[60px]" value={form.bio || ""} onChange={e => setForm({...form, bio: e.target.value})} data-testid="input-person-bio" /></div>
                <div><label className="text-xs text-muted-foreground">Search Terms <span className="text-[10px]">(comma-separated)</span></label><input className="w-full border rounded px-2 py-1 text-sm" value={searchTermsInput} onChange={e => setSearchTermsInput(e.target.value)} placeholder="e.g. Elon Musk, @elonmusk, Tesla CEO" data-testid="input-person-search-terms" /></div>
                <div><label className="text-xs text-muted-foreground">Hosted Podcast Slugs <span className="text-[10px]">(comma-separated)</span></label><input className="w-full border rounded px-2 py-1 text-sm" value={hostedSlugsInput} onChange={e => setHostedSlugsInput(e.target.value)} placeholder="e.g. all-in, my-first-million" data-testid="input-person-hosted-slugs" /></div>
                <div className="flex gap-2">
                  <button onClick={handleSave} disabled={updateMut.isPending} className="px-3 py-1 bg-primary text-white rounded text-sm" data-testid="button-save-person">
                    {updateMut.isPending ? "Saving..." : "Save"}
                  </button>
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={form.verified || false} onChange={e => setForm({...form, verified: e.target.checked})} data-testid="input-person-verified" /> Verified</label>
                </div>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-semibold">{data.name}</h3>
                <p className="text-xs text-muted-foreground font-mono">slug: {data.slug}</p>
                {data.title && <p className="text-sm text-muted-foreground">{data.title}{data.company ? ` at ${data.company}` : ""}</p>}
                {data.bio && <p className="text-sm text-muted-foreground mt-2">{data.bio}</p>}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {data.category && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">{data.category}</span>}
                  {data.verified && <span className="px-2 py-0.5 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded text-xs">Verified</span>}
                </div>
                <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                  {data.twitterHandle && <span>@{data.twitterHandle}</span>}
                  {data.linkedinUrl && <a href={data.linkedinUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">LinkedIn</a>}
                  {data.websiteUrl && <a href={data.websiteUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">Website</a>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-4 space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Search Terms</h4>
        {data.searchTerms?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {data.searchTerms.map((t, i) => (
              <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded text-xs">{t}</span>
            ))}
          </div>
        ) : <p className="text-xs text-muted-foreground">None</p>}

        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">Hosted Podcast Slugs</h4>
        {data.hostedSlugs?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {data.hostedSlugs.map((s, i) => (
              <span key={i} className="px-2 py-0.5 bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded text-xs font-mono">{s}</span>
            ))}
          </div>
        ) : <p className="text-xs text-muted-foreground">None</p>}

        {(data.createdAt || data.updatedAt) && (
          <div className="pt-2 border-t border-border flex gap-4 text-[10px] text-muted-foreground">
            {data.createdAt && <span>Created: {new Date(data.createdAt).toLocaleDateString()}</span>}
            {data.updatedAt && <span>Updated: {new Date(data.updatedAt).toLocaleDateString()}</span>}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          Episode Mentions
          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-md text-xs">{data.mentions?.length || 0}</span>
        </h4>
        {data.mentions?.length ? (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {data.mentions.map((m, i) => (
              <div key={i} className="bg-white dark:bg-zinc-900 border border-border rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{m.episodeTitle}</span>
                  <span className="text-xs text-muted-foreground">{m.publishDate}</span>
                </div>
                <span className="text-xs text-muted-foreground">{m.podcastName}</span>
                {m.context && <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{m.context.replace(/^\.\.\./, '').replace(/\.\.\.$/, '')}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No episode mentions found. Run backfill to populate.</p>
        )}
      </div>
    </div>
  );
}

function PeopleTab() {
  const [search, setSearch] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const { toast } = useToast();
  const { data: people, isLoading, isError, error, refetch } = useQuery<EntityPerson[]>({
    queryKey: ["/api/admin/cms/people", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/cms/people?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load people (${res.status})`);
      return res.json();
    },
  });
  const enrichAllMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/enrich-people"),
    onSuccess: () => toast({ title: "People enrichment started in background" }),
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });
  const backfillPhotosMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/cms/people/backfill-photos"),
    onSuccess: async (res: Response) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/people"] });
      toast({ title: "Photos backfilled", description: `Updated ${data.updated} of ${data.total} people` });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  if (selectedSlug) {
    return <PersonDetailPanel slug={selectedSlug} onClose={() => setSelectedSlug(null)} />;
  }

  return (
    <div className="space-y-4" data-testid="cms-people-tab">
      <EntityBackfillBanner />
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Search people..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-border rounded-xl text-sm" data-testid="input-search-people" />
        </div>
        <button
          onClick={() => backfillPhotosMut.mutate()}
          disabled={backfillPhotosMut.isPending}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-xl text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50 whitespace-nowrap"
          data-testid="button-backfill-photos"
        >
          {backfillPhotosMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Image className="w-3.5 h-3.5" />}
          Backfill Photos
        </button>
        <button
          onClick={() => enrichAllMut.mutate()}
          disabled={enrichAllMut.isPending}
          className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-xl text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors disabled:opacity-50 whitespace-nowrap"
          data-testid="button-enrich-all-people"
        >
          {enrichAllMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Enrich All
        </button>
        <span className="text-xs text-muted-foreground">{people?.length || 0} people</span>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : isError ? (
        <div className="text-center py-12 space-y-3" data-testid="error-people">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
          <p className="text-sm text-red-600 dark:text-red-400">Failed to load people{error?.message ? `: ${error.message}` : ""}</p>
          <button onClick={() => refetch()} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 inline-flex items-center gap-2" data-testid="button-retry-people"><RefreshCw className="w-4 h-4" /> Retry</button>
        </div>
      ) : !people?.length ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No people found. Run entity backfill to populate.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {people.map((person) => (
            <div key={person.slug} onClick={() => setSelectedSlug(person.slug)} className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-4 space-y-2 cursor-pointer hover:border-primary/50 transition-colors" data-testid={`person-card-${person.slug}`}>
              <div className="flex items-center gap-3">
                {person.photoUrl ? (
                  <img src={person.photoUrl} alt={person.name} className="w-10 h-10 rounded-full object-cover" data-testid={`img-person-${person.slug}`} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; if ((e.target as HTMLImageElement).nextElementSibling) (e.target as HTMLImageElement).nextElementSibling!.classList.remove('hidden'); }} />
                ) : null}
                {!person.photoUrl && (
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-400 text-sm font-bold">{person.name.charAt(0)}</div>
                )}
                {person.photoUrl && (
                  <div className="hidden w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-400 text-sm font-bold">{person.name.charAt(0)}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground truncate">{person.name}</span>
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-md text-xs font-medium shrink-0 ml-2">{person.episodeCount}</span>
                  </div>
                  {person.title && <p className="text-xs text-muted-foreground truncate">{person.title}{person.company ? ` · ${person.company}` : ""}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {person.verified && <span className="px-1.5 py-0.5 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded text-[10px]">Verified</span>}
                {person.category && <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] text-muted-foreground">{person.category}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompanyDetailPanel({ slug, onClose }: { slug: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<EntityCompany & { mentions: EntityMention[] }>({
    queryKey: ["/api/admin/cms/companies", slug],
    queryFn: async () => {
      const res = await fetch(`/api/admin/cms/companies/${slug}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<EntityCompany>>({});
  const [searchTermsInput, setSearchTermsInput] = useState("");
  const [associatedTermsInput, setAssociatedTermsInput] = useState("");
  const updateMut = useMutation({
    mutationFn: (body: Partial<EntityCompany>) => apiRequest("PATCH", `/api/admin/cms/companies/${slug}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/companies"] });
      toast({ title: "Company updated" });
      setEditing(false);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });
  const enrichMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/enrich-company/${slug}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/companies", slug] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/companies"] });
      toast({ title: "Company enriched with AI" });
    },
    onError: (err: Error) => toast({ title: "Enrichment failed", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (!data) return null;

  const startEditing = () => {
    setForm(data);
    setSearchTermsInput((data.searchTerms || []).join(", "));
    setAssociatedTermsInput((data.associatedTerms || []).join(", "));
    setEditing(true);
  };

  const handleSave = () => {
    const { id: _id, slug: _slug, episodeCount: _ec, context: _ctx, createdAt: _ca, updatedAt: _ua, ...editableFields } = form as EntityCompany;
    const payload = {
      ...editableFields,
      searchTerms: searchTermsInput.split(",").map(s => s.trim()).filter(Boolean),
      associatedTerms: associatedTermsInput.split(",").map(s => s.trim()).filter(Boolean),
    };
    updateMut.mutate(payload);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onClose} className="text-sm text-primary hover:underline flex items-center gap-1" data-testid="button-back-companies">
          <ChevronLeft className="w-4 h-4" /> Back to Companies
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => enrichMut.mutate()}
            disabled={enrichMut.isPending}
            className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-md text-xs hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors disabled:opacity-50"
            data-testid="button-enrich-company"
          >
            {enrichMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {enrichMut.isPending ? "Enriching..." : "Enrich with AI"}
          </button>
          {data.verified && <span className="px-2 py-0.5 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-md text-xs">Verified</span>}
          <button onClick={() => { if (editing) { setEditing(false); } else { startEditing(); } }} className="text-xs text-primary hover:underline" data-testid="button-edit-company">
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>
      </div>
      <CopyableId label="Company" value={data.id} context={data.name} />
      <EnrichmentStatus fields={[
        { label: "Logo", filled: !!data.logoUrl?.trim() },
        { label: "Description", filled: !!data.description?.trim() },
        { label: "Industry", filled: !!data.industry?.trim() },
        { label: "Category", filled: !!data.category?.trim() },
        { label: "Website", filled: !!data.websiteUrl?.trim() },
        { label: "Twitter", filled: !!data.twitterHandle?.trim() },
        { label: "Search Terms", filled: !!(data.searchTerms?.length) },
        { label: "Associated Terms", filled: !!(data.associatedTerms?.length) },
        { label: "Verified", filled: !!data.verified },
      ]} />
      <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-start gap-4">
          {data.logoUrl ? (
            <img src={data.logoUrl} alt={data.name} className="w-16 h-16 rounded-lg object-contain bg-white border" />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-700 dark:text-purple-400 text-xl font-bold">{data.name.charAt(0)}</div>
          )}
          <div className="flex-1">
            {editing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground">Name</label><input className="w-full border rounded px-2 py-1 text-sm" value={form.name || ""} onChange={e => setForm({...form, name: e.target.value})} data-testid="input-company-name" /></div>
                  <div><label className="text-xs text-muted-foreground">Slug</label><input className="w-full border rounded px-2 py-1 text-sm bg-gray-50 dark:bg-zinc-800" value={form.slug || ""} readOnly data-testid="input-company-slug" /></div>
                  <div><label className="text-xs text-muted-foreground">Industry</label><input className="w-full border rounded px-2 py-1 text-sm" value={form.industry || ""} onChange={e => setForm({...form, industry: e.target.value})} placeholder="AI, Finance, Social..." data-testid="input-company-industry" /></div>
                  <div><label className="text-xs text-muted-foreground">Category</label><input className="w-full border rounded px-2 py-1 text-sm" value={form.category || ""} onChange={e => setForm({...form, category: e.target.value})} placeholder="tech, finance, vc..." data-testid="input-company-category" /></div>
                  <div><label className="text-xs text-muted-foreground">Logo URL</label><input className="w-full border rounded px-2 py-1 text-sm" value={form.logoUrl || ""} onChange={e => setForm({...form, logoUrl: e.target.value})} data-testid="input-company-logo" /></div>
                  <div><label className="text-xs text-muted-foreground">Website URL</label><input className="w-full border rounded px-2 py-1 text-sm" value={form.websiteUrl || ""} onChange={e => setForm({...form, websiteUrl: e.target.value})} data-testid="input-company-website" /></div>
                  <div><label className="text-xs text-muted-foreground">Twitter</label><input className="w-full border rounded px-2 py-1 text-sm" value={form.twitterHandle || ""} onChange={e => setForm({...form, twitterHandle: e.target.value})} data-testid="input-company-twitter" /></div>
                </div>
                <div><label className="text-xs text-muted-foreground">Description</label><textarea className="w-full border rounded px-2 py-1 text-sm min-h-[60px]" value={form.description || ""} onChange={e => setForm({...form, description: e.target.value})} data-testid="input-company-description" /></div>
                <div><label className="text-xs text-muted-foreground">Search Terms <span className="text-[10px]">(comma-separated)</span></label><input className="w-full border rounded px-2 py-1 text-sm" value={searchTermsInput} onChange={e => setSearchTermsInput(e.target.value)} placeholder="e.g. Google, Alphabet, GOOG" data-testid="input-company-search-terms" /></div>
                <div><label className="text-xs text-muted-foreground">Associated Terms <span className="text-[10px]">(comma-separated)</span></label><input className="w-full border rounded px-2 py-1 text-sm" value={associatedTermsInput} onChange={e => setAssociatedTermsInput(e.target.value)} placeholder="e.g. Android, Chrome, YouTube" data-testid="input-company-associated-terms" /></div>
                <div className="flex gap-2">
                  <button onClick={handleSave} disabled={updateMut.isPending} className="px-3 py-1 bg-primary text-white rounded text-sm" data-testid="button-save-company">
                    {updateMut.isPending ? "Saving..." : "Save"}
                  </button>
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={form.verified || false} onChange={e => setForm({...form, verified: e.target.checked})} data-testid="input-company-verified" /> Verified</label>
                </div>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-semibold">{data.name}</h3>
                <p className="text-xs text-muted-foreground font-mono">slug: {data.slug}</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {data.industry && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">{data.industry}</span>}
                  {data.category && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">{data.category}</span>}
                  {data.verified && <span className="px-2 py-0.5 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded text-xs">Verified</span>}
                </div>
                {data.description && <p className="text-sm text-muted-foreground mt-2">{data.description}</p>}
                <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                  {data.twitterHandle && <span>@{data.twitterHandle}</span>}
                  {data.websiteUrl && <a href={data.websiteUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">Website</a>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-4 space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Search Terms</h4>
        {data.searchTerms?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {data.searchTerms.map((t, i) => (
              <span key={i} className="px-2 py-0.5 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded text-xs">{t}</span>
            ))}
          </div>
        ) : <p className="text-xs text-muted-foreground">None</p>}

        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">Associated Terms</h4>
        {data.associatedTerms?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {data.associatedTerms.map((t, i) => (
              <span key={i} className="px-2 py-0.5 bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded text-xs">{t}</span>
            ))}
          </div>
        ) : <p className="text-xs text-muted-foreground">None</p>}

        {(data.createdAt || data.updatedAt) && (
          <div className="pt-2 border-t border-border flex gap-4 text-[10px] text-muted-foreground">
            {data.createdAt && <span>Created: {new Date(data.createdAt).toLocaleDateString()}</span>}
            {data.updatedAt && <span>Updated: {new Date(data.updatedAt).toLocaleDateString()}</span>}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          Episode Mentions
          <span className="px-2 py-0.5 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded-md text-xs">{data.mentions?.length || 0}</span>
        </h4>
        {data.mentions?.length ? (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {data.mentions.map((m, i) => (
              <div key={i} className="bg-white dark:bg-zinc-900 border border-border rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{m.episodeTitle}</span>
                  <span className="text-xs text-muted-foreground">{m.publishDate}</span>
                </div>
                <span className="text-xs text-muted-foreground">{m.podcastName}</span>
                {m.context && <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{m.context.replace(/^\.\.\./, '').replace(/\.\.\.$/, '')}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No episode mentions found. Run backfill to populate.</p>
        )}
      </div>
    </div>
  );
}

function CompaniesTab() {
  const [search, setSearch] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const { data: companies, isLoading, isError, error, refetch } = useQuery<EntityCompany[]>({
    queryKey: ["/api/admin/cms/companies", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/cms/companies?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load companies (${res.status})`);
      return res.json();
    },
  });

  const { toast } = useToast();
  const enrichAllMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/enrich-companies"),
    onSuccess: () => toast({ title: "Companies enrichment started in background" }),
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  if (selectedSlug) {
    return <CompanyDetailPanel slug={selectedSlug} onClose={() => setSelectedSlug(null)} />;
  }

  return (
    <div className="space-y-4" data-testid="cms-companies-tab">
      <EntityBackfillBanner />
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Search companies..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-border rounded-xl text-sm" data-testid="input-search-companies" />
        </div>
        <button
          onClick={() => enrichAllMut.mutate()}
          disabled={enrichAllMut.isPending}
          className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-xl text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors disabled:opacity-50 whitespace-nowrap"
          data-testid="button-enrich-all-companies"
        >
          {enrichAllMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Enrich All
        </button>
        <span className="text-xs text-muted-foreground">{companies?.length || 0} companies</span>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : isError ? (
        <div className="text-center py-12 space-y-3" data-testid="error-companies">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
          <p className="text-sm text-red-600 dark:text-red-400">Failed to load companies{error?.message ? `: ${error.message}` : ""}</p>
          <button onClick={() => refetch()} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 inline-flex items-center gap-2" data-testid="button-retry-companies"><RefreshCw className="w-4 h-4" /> Retry</button>
        </div>
      ) : !companies?.length ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No companies found. Run entity backfill to populate.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {companies.map((company) => (
            <div key={company.slug} onClick={() => setSelectedSlug(company.slug)} className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-4 space-y-2 cursor-pointer hover:border-primary/50 transition-colors" data-testid={`company-card-${company.slug}`}>
              <div className="flex items-center gap-3">
                {company.logoUrl ? (
                  <img src={company.logoUrl} alt={company.name} className="w-10 h-10 rounded-lg object-contain bg-white border" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-700 dark:text-purple-400 text-sm font-bold">{company.name.charAt(0)}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground truncate">{company.name}</span>
                    <span className="px-2 py-0.5 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded-md text-xs font-medium shrink-0 ml-2">{company.episodeCount}</span>
                  </div>
                  {company.industry && <p className="text-xs text-muted-foreground truncate">{company.industry}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {company.verified && <span className="px-1.5 py-0.5 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded text-[10px]">Verified</span>}
                {company.category && <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] text-muted-foreground">{company.category}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  all: "All",
  book: "Books",
  physical_product: "Products",
  service_or_tool: "Tools & Services",
  experience: "Experiences",
  app: "Apps",
  website: "Websites",
};

function ProductsTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useQuery<{ products: Array<{ id: number; name: string; company: string; description: string; category: string; context: string; mention_type: string; status: string; purchase_url: string; image_url: string; podcast_slug: string; episode_slug: string; episode_title: string; extracted_at: string; source?: string; book_slug?: string }>; total: number; statusCounts: Record<string, number>; categoryCounts?: Record<string, number> }>({
    queryKey: ["/api/admin/cms/products", debouncedSearch, statusFilter, categoryFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      params.set("page", String(page));
      const res = await fetch(`/api/admin/cms/products?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load products (${res.status})`);
      return res.json();
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, source, ...body }: { id: number; source?: string; status?: string }) => {
      if (source === "book") {
        return apiRequest("PATCH", `/api/admin/cms/books/${id}`, body);
      }
      return apiRequest("PATCH", `/api/admin/cms/products/${id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/products"] });
      toast({ title: "Item updated" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });
  const products = data?.products || [];
  const total = data?.total || 0;
  const counts = data?.statusCounts || {};
  const catCounts = data?.categoryCounts || {};
  return (
    <div className="space-y-4" data-testid="cms-products-tab">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Search mentions..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full pl-9 pr-3 py-2 border border-border rounded-xl text-sm" data-testid="input-search-products" />
        </div>
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button key={key} onClick={() => { setCategoryFilter(key); setPage(1); }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${categoryFilter === key ? "bg-primary text-white" : "bg-muted/40 text-muted-foreground hover:text-foreground"}`} data-testid={`filter-category-${key}`}>
            {label}{catCounts[key] !== undefined ? ` (${catCounts[key]})` : key === "all" ? ` (${total})` : ""}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        {["all", "pending", "approved", "rejected"].map((s) => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${statusFilter === s ? "bg-indigo-100 dark:bg-indigo-900/30 text-primary border border-primary/30" : "bg-muted/40 text-muted-foreground hover:text-foreground"}`} data-testid={`filter-product-${s}`}>
            {s === "all" ? `All (${total})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${counts[s] || 0})`}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : isError ? (
        <div className="text-center py-12 space-y-3" data-testid="error-products">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
          <p className="text-sm text-red-600 dark:text-red-400">Failed to load products{error?.message ? `: ${error.message}` : ""}</p>
          <button onClick={() => refetch()} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 inline-flex items-center gap-2" data-testid="button-retry-products"><RefreshCw className="w-4 h-4" /> Retry</button>
        </div>
      ) : !products.length ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No mentions found.</div>
      ) : (
        <div className="space-y-2">
          {products.map((p) => (
            <div key={`${p.source || "product"}-${p.id}`} className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-4 flex items-start gap-4" data-testid={`product-row-${p.source || "product"}-${p.id}`}>
              {p.image_url && (
                <img src={p.image_url} alt="" className={`flex-shrink-0 object-cover rounded-lg ${p.source === "book" ? "w-10 h-14" : "w-10 h-10"}`} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <CopyableId label={p.source === "book" ? "Book" : "Mention"} value={p.id} context={p.name} />
                  <span className="text-sm font-semibold text-foreground">{p.name}</span>
                  {p.company && <span className="text-xs text-muted-foreground">{p.source === "book" ? "by" : "—"} {p.company}</span>}
                  <StatusBadge status={p.status === "approved" ? "published" : p.status === "rejected" ? "hidden" : "needs_review"} />
                </div>
                {p.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{p.description}</p>}
                <div className="flex items-center gap-3 mt-1.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${p.category === "book" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" : p.category === "physical_product" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" : p.category === "service_or_tool" ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400" : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"}`}>
                    {CATEGORY_LABELS[p.category] || p.category}
                  </span>
                  {p.episode_title && <span className="text-xs text-muted-foreground truncate max-w-[300px]">{p.episode_title}</span>}
                  {p.purchase_url && <a href={p.purchase_url} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"><ExternalLink className="w-3 h-3" /> Link</a>}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {p.status !== "approved" && (
                  <button onClick={() => updateMutation.mutate({ id: p.id, source: p.source, status: "approved" })} className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg" title="Approve" data-testid={`button-approve-product-${p.source || "product"}-${p.id}`}>
                    <CheckCircle className="w-4 h-4" />
                  </button>
                )}
                {p.status !== "rejected" && (
                  <button onClick={() => updateMutation.mutate({ id: p.id, source: p.source, status: "rejected" })} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Reject" data-testid={`button-reject-product-${p.source || "product"}-${p.id}`}>
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {total > 50 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted/40 disabled:opacity-30" data-testid="button-prev-page">Previous</button>
              <span className="text-xs text-muted-foreground">Page {page} of {Math.ceil(total / 50)}</span>
              <button disabled={page >= Math.ceil(total / 50)} onClick={() => setPage(page + 1)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted/40 disabled:opacity-30" data-testid="button-next-page">Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type CMSSection = "podcasts" | "episodes" | "people" | "companies" | "products";

export default function AdminCMS() {
  const [view, setView] = useState<CMSView>({ tab: "podcasts" });
  const [activeSection, setActiveSection] = useState<CMSSection>("podcasts");

  const handleNavigate = (newView: CMSView) => {
    setView(newView);
    if (newView.tab === "podcasts" || newView.tab === "podcast-detail") setActiveSection("podcasts");
    else if (newView.tab === "episodes" || newView.tab === "episode-detail") setActiveSection("episodes");
    else {
      setActiveSection(newView.tab as CMSSection);
    }
  };

  const sections: Array<{ key: CMSSection; label: string; icon: typeof Podcast }> = [
    { key: "podcasts", label: "Podcasts", icon: Podcast },
    { key: "episodes", label: "Episodes", icon: FileText },
    { key: "people", label: "People", icon: Users },
    { key: "companies", label: "Companies", icon: Building2 },
    { key: "products", label: "Mentions", icon: ShoppingBag },
  ];

  const handleSectionClick = (key: CMSSection) => {
    setActiveSection(key);
    if (key === "podcasts") {
      setView({ tab: "podcasts" });
    } else if (key === "episodes") {
      setView({ tab: "episodes" });
    } else {
      setView({ tab: key });
    }
  };

  return (
    <div className="space-y-6" data-testid="cms-container">
      <div className="flex items-center gap-1 bg-black/[0.03] dark:bg-white/[0.06] rounded-xl p-1" data-testid="cms-sub-tabs">
        {sections.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            data-testid={`cms-tab-${key}`}
            onClick={() => handleSectionClick(key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
              activeSection === key
                ? "bg-white dark:bg-zinc-800 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {view.tab === "podcasts" && <PodcastsList onNavigate={handleNavigate} />}
      {view.tab === "podcast-detail" && view.podcastSlug && (
        <PodcastDetail slug={view.podcastSlug} onNavigate={handleNavigate} />
      )}
      {view.tab === "episodes" && !view.podcastSlug && (
        <AllEpisodesTab onNavigate={handleNavigate} />
      )}
      {view.tab === "episodes" && view.podcastSlug && (
        <EpisodesList podcastSlug={view.podcastSlug} onNavigate={handleNavigate} />
      )}
      {view.tab === "episode-detail" && view.podcastSlug && view.episodeSlug && (
        <EpisodeDetail podcastSlug={view.podcastSlug} episodeSlug={view.episodeSlug} onNavigate={handleNavigate} />
      )}
      {view.tab === "people" && <PeopleTab />}
      {view.tab === "companies" && <CompaniesTab />}
      {view.tab === "products" && <ProductsTab />}
    </div>
  );
}
