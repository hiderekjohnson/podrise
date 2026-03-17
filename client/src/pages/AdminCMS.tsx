import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Search, ChevronLeft, ChevronDown, ChevronUp,
  Podcast, FileText, Users, Building2, ShoppingBag,
  Save, RefreshCw, Plus, Trash2, GripVertical, ExternalLink,
  Image, Clock, Calendar, Hash, Eye, EyeOff, AlertCircle, Pencil
} from "lucide-react";

type CMSView =
  | { tab: "podcasts"; podcastSlug?: undefined; episodeSlug?: undefined }
  | { tab: "podcast-detail"; podcastSlug: string; episodeSlug?: undefined }
  | { tab: "episodes"; podcastSlug: string; episodeSlug?: undefined }
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
  top_questions: string;
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
  topQuestions: string[];
  keyTopics: string[];
  status: string;
  entityContexts: EntityEntry[];
  spotifyEpisodeUrl: string;
  appleEpisodeUrl: string;
  audioUrl: string;
  showNotes: string;
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
      <option value="needs_review">Needs Review</option>
      <option value="hidden">Hidden</option>
    </select>
  );
}

function PodcastsList({ onNavigate }: { onNavigate: (view: CMSView) => void }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const { data: podcasts, isLoading } = useQuery<CMSPodcast[]>({
    queryKey: ["/api/admin/cms/podcasts", search, statusFilter, sortField, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
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
              <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(!podcasts || podcasts.length === 0) ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-sm text-muted-foreground">
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

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          {podcast.artwork_url && (
            <img src={podcast.artwork_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
          )}
          <div>
            <h3 className="text-xl font-bold text-foreground" data-testid="text-podcast-name">{podcast.name}</h3>
            <p className="text-sm text-muted-foreground">{podcast.hosts}</p>
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
                <input
                  data-testid="input-cms-podcast-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
                <textarea
                  data-testid="input-cms-podcast-description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Hosts</label>
                  <input
                    data-testid="input-cms-podcast-hosts"
                    type="text"
                    value={form.hosts}
                    onChange={(e) => setForm({ ...form, hosts: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Artwork URL</label>
                  <input
                    data-testid="input-cms-podcast-artwork"
                    type="text"
                    value={form.artworkUrl}
                    onChange={(e) => setForm({ ...form, artworkUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Apple URL</label>
                  <input
                    type="text"
                    value={form.appleUrl}
                    onChange={(e) => setForm({ ...form, appleUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    data-testid="input-cms-podcast-apple"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Spotify URL</label>
                  <input
                    type="text"
                    value={form.spotifyUrl}
                    onChange={(e) => setForm({ ...form, spotifyUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    data-testid="input-cms-podcast-spotify"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">YouTube URL</label>
                  <input
                    type="text"
                    value={form.youtubeUrl}
                    onChange={(e) => setForm({ ...form, youtubeUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    data-testid="input-cms-podcast-youtube"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
                  <StatusSelect value={form.status} onChange={(v) => setForm({ ...form, status: v })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Active</label>
                  <button
                    onClick={() => setForm({ ...form, hasLandingPage: !form.hasLandingPage })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      form.hasLandingPage
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400"
                        : "bg-gray-50 border-gray-200 text-gray-500 dark:bg-gray-800/30 dark:border-gray-700 dark:text-gray-400"
                    }`}
                    data-testid="button-toggle-active"
                  >
                    {form.hasLandingPage ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    {form.hasLandingPage ? "Active" : "Inactive"}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => updateMutation.mutate(form)}
                disabled={updateMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                data-testid="button-save-podcast"
              >
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-4">
            <h4 className="text-sm font-bold text-foreground">Stats</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Episodes</span>
                <span className="text-sm font-bold text-foreground" data-testid="text-stat-episodes">{stats?.episodeCount || 0}</span>
              </div>
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const { data: episodes, isLoading } = useQuery<CMSEpisodeListItem[]>({
    queryKey: ["/api/admin/cms/podcasts", podcastSlug, "episodes", search, statusFilter, sortField, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
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
        topQuestions: parseJSON<string[]>(episode.top_questions, []),
        keyTopics: episode.key_topics || [],
        status: episode.status || "published",
        entityContexts: entityEntries,
        spotifyEpisodeUrl: episode.spotify_episode_url || "",
        appleEpisodeUrl: episode.apple_episode_url || "",
        audioUrl: episode.audio_url || "",
        showNotes: episode.show_notes || "",
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
      topQuestions: JSON.stringify(form.topQuestions),
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

  const books = form.resources.filter((r) => r.type === "book");
  const tools = form.resources.filter((r) => r.type !== "book");

  return (
    <div className="space-y-6" data-testid="cms-episode-detail">
      <div className="flex items-center gap-3">
        <button
          onClick={() => onNavigate({ tab: "episodes", podcastSlug })}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-back-to-episodes"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Episodes
        </button>
      </div>

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
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground">Top Questions</h4>
              <button
                onClick={() => setForm({ ...form, topQuestions: [...form.topQuestions, ""] })}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                data-testid="button-add-question"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            {form.topQuestions.length === 0 && <p className="text-xs text-muted-foreground">No top questions.</p>}
            {form.topQuestions.map((q: string, i: number) => (
              <div key={i} className="flex items-start gap-2" data-testid={`question-item-${i}`}>
                <input
                  value={q}
                  onChange={(e) => {
                    const updated = [...form.topQuestions];
                    updated[i] = e.target.value;
                    setForm({ ...form, topQuestions: updated });
                  }}
                  className="flex-1 px-3 py-2 border border-border rounded-lg text-sm"
                  placeholder="Question this episode answers..."
                  data-testid={`input-question-${i}`}
                />
                <button
                  onClick={() => setForm({ ...form, topQuestions: form.topQuestions.filter((_: string, idx: number) => idx !== i) })}
                  className="text-muted-foreground hover:text-red-500 pt-2"
                  data-testid={`button-delete-question-${i}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
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
              <input
                data-testid="input-cms-episode-hosts"
                type="text"
                value={form.hosts}
                onChange={(e) => setForm({ ...form, hosts: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
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
              <h4 className="text-sm font-bold text-foreground">Books Mentioned</h4>
              <button onClick={() => addResource("book")} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80" data-testid="button-add-book">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            {books.length === 0 && <p className="text-xs text-muted-foreground">No books mentioned.</p>}
            {books.map((b, bi) => {
              const ri = form.resources.indexOf(b);
              return (
                <div key={bi} className="border border-border rounded-lg p-2 space-y-1" data-testid={`book-item-${bi}`}>
                  <div className="flex items-center gap-2">
                    <input
                      placeholder="Book title"
                      value={b.name}
                      onChange={(e) => updateResource(ri, "name", e.target.value)}
                      className="flex-1 px-2 py-1 border border-border rounded text-xs"
                      data-testid={`input-book-name-${bi}`}
                    />
                    <button onClick={() => removeResource(ri)} className="text-muted-foreground hover:text-red-500" data-testid={`button-delete-book-${bi}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    placeholder="Author"
                    value={b.author || ""}
                    onChange={(e) => updateResource(ri, "author", e.target.value)}
                    className="w-full px-2 py-1 border border-border rounded text-xs"
                    data-testid={`input-book-author-${bi}`}
                  />
                  <input
                    placeholder="Description"
                    value={b.description || ""}
                    onChange={(e) => updateResource(ri, "description", e.target.value)}
                    className="w-full px-2 py-1 border border-border rounded text-xs"
                    data-testid={`input-book-desc-${bi}`}
                  />
                </div>
              );
            })}
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground">Products & Tools</h4>
              <button onClick={() => addResource("tool")} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80" data-testid="button-add-tool">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            {tools.length === 0 && <p className="text-xs text-muted-foreground">No tools/products mentioned.</p>}
            {tools.map((t, ti) => {
              const ri = form.resources.indexOf(t);
              return (
                <div key={ti} className="border border-border rounded-lg p-2 space-y-1" data-testid={`tool-item-${ti}`}>
                  <div className="flex items-center gap-2">
                    <input
                      placeholder="Name"
                      value={t.name}
                      onChange={(e) => updateResource(ri, "name", e.target.value)}
                      className="flex-1 px-2 py-1 border border-border rounded text-xs"
                      data-testid={`input-tool-name-${ti}`}
                    />
                    <select
                      value={t.type}
                      onChange={(e) => updateResource(ri, "type", e.target.value)}
                      className="px-2 py-1 border border-border rounded text-xs bg-white dark:bg-zinc-900"
                      data-testid={`select-tool-type-${ti}`}
                    >
                      <option value="tool">Tool</option>
                      <option value="product">Product</option>
                      <option value="service">Service</option>
                      <option value="app">App</option>
                      <option value="website">Website</option>
                    </select>
                    <button onClick={() => removeResource(ri)} className="text-muted-foreground hover:text-red-500" data-testid={`button-delete-tool-${ti}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    placeholder="Category (e.g. SaaS, Hardware, Finance)"
                    value={t.category || ""}
                    onChange={(e) => updateResource(ri, "category", e.target.value)}
                    className="w-full px-2 py-1 border border-border rounded text-xs"
                    data-testid={`input-tool-category-${ti}`}
                  />
                  <input
                    placeholder="Description"
                    value={t.description || ""}
                    onChange={(e) => updateResource(ri, "description", e.target.value)}
                    className="w-full px-2 py-1 border border-border rounded text-xs"
                    data-testid={`input-tool-desc-${ti}`}
                  />
                  <input
                    placeholder="Context (how it was mentioned)"
                    value={t.context || ""}
                    onChange={(e) => updateResource(ri, "context", e.target.value)}
                    className="w-full px-2 py-1 border border-border rounded text-xs"
                    data-testid={`input-tool-context-${ti}`}
                  />
                </div>
              );
            })}
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

function ComingSoonPlaceholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center" data-testid={`placeholder-${title.toLowerCase()}`}>
      <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-bold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground">Coming soon in Phase 2</p>
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
      const sectionMap: Record<string, CMSSection> = { people: "people", companies: "companies", products: "products" };
      setActiveSection(sectionMap[newView.tab] || "podcasts");
    }
  };

  const sections: Array<{ key: CMSSection; label: string; icon: typeof Podcast }> = [
    { key: "podcasts", label: "Podcasts", icon: Podcast },
    { key: "episodes", label: "Episodes", icon: FileText },
    { key: "people", label: "People", icon: Users },
    { key: "companies", label: "Companies", icon: Building2 },
    { key: "products", label: "Products", icon: ShoppingBag },
  ];

  const handleSectionClick = (key: CMSSection) => {
    setActiveSection(key);
    if (key === "podcasts") {
      setView({ tab: "podcasts" });
    } else if (key === "episodes") {
      if (view.tab !== "episodes" && view.tab !== "episode-detail") {
        setView({ tab: "podcasts" });
        setActiveSection("episodes");
      }
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

      {view.tab === "podcasts" && activeSection === "episodes" && (
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 flex items-center gap-2" data-testid="episodes-select-prompt">
            <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-blue-700 dark:text-blue-300">Select a podcast below to browse its episodes</span>
          </div>
          <PodcastsList onNavigate={(v) => {
            if (v.tab === "podcast-detail" && v.podcastSlug) {
              handleNavigate({ tab: "episodes", podcastSlug: v.podcastSlug });
            } else {
              handleNavigate(v);
            }
          }} />
        </div>
      )}
      {view.tab === "podcasts" && activeSection !== "episodes" && <PodcastsList onNavigate={handleNavigate} />}
      {view.tab === "podcast-detail" && view.podcastSlug && (
        <PodcastDetail slug={view.podcastSlug} onNavigate={handleNavigate} />
      )}
      {view.tab === "episodes" && view.podcastSlug && (
        <EpisodesList podcastSlug={view.podcastSlug} onNavigate={handleNavigate} />
      )}
      {view.tab === "episode-detail" && view.podcastSlug && view.episodeSlug && (
        <EpisodeDetail podcastSlug={view.podcastSlug} episodeSlug={view.episodeSlug} onNavigate={handleNavigate} />
      )}
      {view.tab === "people" && <ComingSoonPlaceholder title="People" />}
      {view.tab === "companies" && <ComingSoonPlaceholder title="Companies" />}
      {view.tab === "products" && <ComingSoonPlaceholder title="Products" />}
    </div>
  );
}
