import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, ExternalLink, Bold, Italic, Link as LinkIcon, Radio, Megaphone, Settings, Search, BarChart3, BookOpen, Eye, MousePointer, UserPlus, Calendar } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";

interface Advertiser {
  id: number;
  message: string;
  link: string;
  createdAt: string | null;
}

interface FeedAd {
  id: number;
  type: "podcast" | "regular" | "episode_recap";
  title: string;
  description: string;
  imageUrl: string;
  destinationUrl: string;
  podcastSlug: string | null;
  episodeSlug: string | null;
  episodeTitle: string | null;
  episodeTldl: string | null;
  episodeKeyInsights: string[] | null;
  episodeQuote: string | null;
  episodeQuoteAttribution: string | null;
  podcastName: string | null;
  weight: number;
  isActive: boolean;
  createdAt: string | null;
}

interface FeedAdPayload {
  type: "podcast" | "regular" | "episode_recap";
  title: string;
  description: string;
  imageUrl: string;
  destinationUrl: string;
  podcastSlug: string | null;
  episodeSlug?: string | null;
  episodeTitle?: string | null;
  episodeTldl?: string | null;
  episodeKeyInsights?: string[] | null;
  episodeQuote?: string | null;
  episodeQuoteAttribution?: string | null;
  podcastName?: string | null;
  weight: number;
  isActive: boolean;
}

interface EpisodeSearchResult {
  id: number;
  slug: string;
  podcast_name: string;
  episode_title: string;
  episode_slug: string;
  artwork_url: string | null;
  tldl: string | null;
  key_insights: string[] | null;
  quote: string | null;
  quote_attribution: string | null;
}

interface PodcastSearchResult {
  id: string;
  name: string;
  artistName: string;
  artworkUrl: string;
  slug: string;
  onPlatform: boolean;
  description: string;
}

interface AdAnalyticsRow {
  id: number;
  type: string;
  title: string;
  imageUrl: string;
  isActive: boolean;
  podcastSlug: string | null;
  podcastName: string | null;
  views: number;
  clicks: number;
  follows: number;
  ctr: string;
}

function stripHtml(html: string): string {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

function RichTextEditor({
  content,
  onChange,
  charCount,
  maxChars,
}: {
  content: string;
  onChange: (html: string) => void;
  charCount: number;
  maxChars: number;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        horizontalRule: false,
        code: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[80px] px-3 py-2 text-sm",
      },
    },
  });

  if (!editor) return null;

  const addLink = () => {
    const url = prompt("Enter URL:");
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) return;
    } catch {
      return;
    }
    if (editor.state.selection.empty) {
      const label = prompt("Enter link text:") || url;
      editor.chain().focus().insertContent({
        type: "text",
        text: label,
        marks: [{ type: "link", attrs: { href: url } }],
      }).run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const isOverLimit = charCount > maxChars;

  return (
    <div className="border border-black/[0.08] rounded-xl overflow-hidden bg-white dark:bg-black/20">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-black/[0.06] bg-black/[0.02]">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded-md transition-colors ${editor.isActive("bold") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-black/[0.04]"}`}
          data-testid="button-bold"
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded-md transition-colors ${editor.isActive("italic") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-black/[0.04]"}`}
          data-testid="button-italic"
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={addLink}
          className={`p-1.5 rounded-md transition-colors ${editor.isActive("link") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-black/[0.04]"}`}
          data-testid="button-link"
          title="Insert link"
        >
          <LinkIcon className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        <span className={`text-xs font-medium px-2 ${isOverLimit ? "text-red-500" : "text-muted-foreground"}`} data-testid="text-char-count">
          {charCount}/{maxChars}
        </span>
      </div>
      <EditorContent editor={editor} data-testid="input-rich-text" />
    </div>
  );
}

function EmailAdsSection() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [messageHtml, setMessageHtml] = useState("");
  const MAX_CHARS = 300;

  const charCount = stripHtml(messageHtml).length;

  const { data: advertisers, isLoading } = useQuery<Advertiser[]>({
    queryKey: ["/api/admin/advertisers"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { message: string }) =>
      apiRequest("POST", "/api/admin/advertisers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisers"] });
      toast({ title: "Created", description: "Advertiser added." });
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to create", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { message: string } }) =>
      apiRequest("PATCH", `/api/admin/advertisers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisers"] });
      toast({ title: "Updated", description: "Advertiser updated." });
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to update", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/advertisers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisers"] });
      toast({ title: "Deleted", description: "Advertiser removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setMessageHtml("");
  };

  const startEdit = (ad: Advertiser) => {
    setEditingId(ad.id);
    setMessageHtml(ad.message);
    setShowForm(true);
  };

  const handleSubmit = () => {
    const plainText = stripHtml(messageHtml);
    if (!plainText.trim()) {
      toast({ title: "Validation", description: "Message is required.", variant: "destructive" });
      return;
    }
    if (plainText.length > MAX_CHARS) {
      toast({ title: "Validation", description: `Message exceeds ${MAX_CHARS} characters.`, variant: "destructive" });
      return;
    }
    const payload = { message: messageHtml };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground" data-testid="text-email-ads-title">Email Ads</h3>
          <p className="text-xs text-muted-foreground">Ad messages shown in recap emails.</p>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-colors"
            data-testid="button-add-advertiser"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Email Ad
          </button>
        )}
      </div>

      {showForm && (
        <div className="glass-panel rounded-2xl p-5 space-y-4" data-testid="section-advertiser-form">
          <h3 className="text-sm font-bold text-foreground">
            {editingId ? "Edit Email Ad" : "New Email Ad"}
          </h3>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              Ad Message (bold, italic, links supported)
            </label>
            <RichTextEditor
              content={messageHtml}
              onChange={setMessageHtml}
              charCount={charCount}
              maxChars={MAX_CHARS}
            />
            {charCount > MAX_CHARS && (
              <p className="text-xs text-red-500 mt-1" data-testid="text-char-error">
                Message is {charCount - MAX_CHARS} characters over the limit.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSubmit}
              disabled={isSaving || charCount > MAX_CHARS || charCount === 0}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
              data-testid="button-save-advertiser"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : editingId ? (
                "Update"
              ) : (
                "Create"
              )}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-black/[0.04] transition-colors"
              data-testid="button-cancel-advertiser"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : !advertisers || advertisers.length === 0 ? (
        <div className="glass-panel rounded-2xl p-6 text-center">
          <p className="text-sm text-muted-foreground" data-testid="text-no-advertisers">No email ads yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {advertisers.map((ad) => (
            <div
              key={ad.id}
              className="glass-panel rounded-2xl p-4 flex items-start justify-between gap-4"
              data-testid={`card-advertiser-${ad.id}`}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="text-sm text-foreground prose prose-sm max-w-none [&_a]:text-primary [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: ad.message }}
                  data-testid={`text-advertiser-message-${ad.id}`}
                />
                {ad.link && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
                    <a
                      href={ad.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline truncate"
                      data-testid={`link-advertiser-url-${ad.id}`}
                    >
                      {ad.link}
                    </a>
                  </div>
                )}
                {ad.createdAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Created {new Date(ad.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => startEdit(ad)}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/[0.04] transition-colors"
                  data-testid={`button-edit-advertiser-${ad.id}`}
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this advertiser?")) {
                      deleteMutation.mutate(ad.id);
                    }
                  }}
                  className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  data-testid={`button-delete-advertiser-${ad.id}`}
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FeedAdsSection() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adType, setAdType] = useState<"podcast" | "regular" | "episode_recap">("podcast");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [podcastSlug, setPodcastSlug] = useState("");
  const [episodeSlug, setEpisodeSlug] = useState("");
  const [episodeTitle, setEpisodeTitle] = useState("");
  const [episodeTldl, setEpisodeTldl] = useState("");
  const [episodeKeyInsights, setEpisodeKeyInsights] = useState<string[]>([]);
  const [episodeQuote, setEpisodeQuote] = useState("");
  const [episodeQuoteAttribution, setEpisodeQuoteAttribution] = useState("");
  const [podcastName, setPodcastName] = useState("");
  const [weight, setWeight] = useState(1);
  const [isActive, setIsActive] = useState(true);
  const [episodeSearch, setEpisodeSearch] = useState("");
  const [episodeResults, setEpisodeResults] = useState<EpisodeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [podcastSearch, setPodcastSearch] = useState("");
  const [podcastResults, setPodcastResults] = useState<PodcastSearchResult[]>([]);
  const [isPodcastSearching, setIsPodcastSearching] = useState(false);
  const [selectedPodcastName, setSelectedPodcastName] = useState("");

  const { data: feedAds, isLoading } = useQuery<FeedAd[]>({
    queryKey: ["/api/admin/feed-ads"],
  });

  const { data: settings } = useQuery<{ frequency: number }>({
    queryKey: ["/api/admin/feed-ad-settings"],
  });

  const createMutation = useMutation({
    mutationFn: (data: FeedAdPayload) => apiRequest("POST", "/api/admin/feed-ads", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feed-ads"] });
      toast({ title: "Created", description: "Feed ad added." });
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to create", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FeedAdPayload }) =>
      apiRequest("PATCH", `/api/admin/feed-ads/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feed-ads"] });
      toast({ title: "Updated", description: "Feed ad updated." });
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to update", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/feed-ads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feed-ads"] });
      toast({ title: "Deleted", description: "Feed ad removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    },
  });

  const settingsMutation = useMutation({
    mutationFn: (data: { frequency: number }) =>
      apiRequest("PUT", "/api/admin/feed-ad-settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feed-ad-settings"] });
      toast({ title: "Saved", description: "Feed ad frequency updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update settings.", variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PATCH", `/api/admin/feed-ads/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feed-ads"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to toggle ad.", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (adType !== "episode_recap" || episodeSearch.length < 2) {
      setEpisodeResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/admin/episode-search?q=${encodeURIComponent(episodeSearch)}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setEpisodeResults(data);
        }
      } catch {} finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [episodeSearch, adType]);

  useEffect(() => {
    if (adType !== "podcast" || podcastSearch.length < 2) {
      setPodcastResults([]);
      setIsPodcastSearching(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsPodcastSearching(true);
      try {
        const res = await fetch(`/api/podcasts/search-itunes?term=${encodeURIComponent(podcastSearch)}`, { credentials: "include" });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setPodcastResults(data.results || []);
        }
      } catch {} finally {
        if (!cancelled) setIsPodcastSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [podcastSearch, adType]);

  const selectPodcast = (podcast: PodcastSearchResult) => {
    setTitle(podcast.name);
    setImageUrl(podcast.artworkUrl || "");
    setPodcastSlug(podcast.slug || "");
    setDescription(podcast.description || "");
    setPodcastName(podcast.name);
    setSelectedPodcastName(podcast.name);
    setPodcastSearch("");
    setPodcastResults([]);
  };

  const selectEpisode = (ep: EpisodeSearchResult) => {
    setTitle(ep.episode_title);
    setDescription(ep.tldl || "");
    setImageUrl(ep.artwork_url || "");
    setPodcastSlug(ep.slug);
    setEpisodeSlug(ep.episode_slug);
    setEpisodeTitle(ep.episode_title);
    setEpisodeTldl(ep.tldl || "");
    setEpisodeKeyInsights(ep.key_insights || []);
    setEpisodeQuote(ep.quote || "");
    setEpisodeQuoteAttribution(ep.quote_attribution || "");
    setPodcastName(ep.podcast_name);
    setEpisodeSearch("");
    setEpisodeResults([]);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setAdType("podcast");
    setTitle("");
    setDescription("");
    setImageUrl("");
    setDestinationUrl("");
    setPodcastSlug("");
    setEpisodeSlug("");
    setEpisodeTitle("");
    setEpisodeTldl("");
    setEpisodeKeyInsights([]);
    setEpisodeQuote("");
    setEpisodeQuoteAttribution("");
    setPodcastName("");
    setWeight(1);
    setIsActive(true);
    setEpisodeSearch("");
    setEpisodeResults([]);
    setPodcastSearch("");
    setPodcastResults([]);
    setSelectedPodcastName("");
  };

  const startEdit = (ad: FeedAd) => {
    setEditingId(ad.id);
    setAdType(ad.type);
    setTitle(ad.title);
    setDescription(ad.description);
    setImageUrl(ad.imageUrl);
    setDestinationUrl(ad.destinationUrl || "");
    setPodcastSlug(ad.podcastSlug || "");
    setEpisodeSlug(ad.episodeSlug || "");
    setEpisodeTitle(ad.episodeTitle || "");
    setEpisodeTldl(ad.episodeTldl || "");
    setEpisodeKeyInsights(ad.episodeKeyInsights || []);
    setEpisodeQuote(ad.episodeQuote || "");
    setEpisodeQuoteAttribution(ad.episodeQuoteAttribution || "");
    setPodcastName(ad.podcastName || "");
    setSelectedPodcastName(ad.type === "podcast" ? (ad.podcastName || ad.title) : "");
    setWeight(ad.weight);
    setIsActive(ad.isActive);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!title.trim() || !description.trim() || !imageUrl.trim()) {
      toast({ title: "Validation", description: "Title, description, and image URL are required.", variant: "destructive" });
      return;
    }
    if (adType === "podcast" && !podcastSlug.trim()) {
      toast({ title: "Validation", description: "Podcast slug is required for podcast ads.", variant: "destructive" });
      return;
    }
    if (adType === "regular" && !destinationUrl.trim()) {
      toast({ title: "Validation", description: "Destination URL is required for regular ads.", variant: "destructive" });
      return;
    }
    if (adType === "episode_recap" && (!podcastSlug.trim() || !episodeSlug.trim())) {
      toast({ title: "Validation", description: "Please select an episode for episode recap ads.", variant: "destructive" });
      return;
    }
    const payload: FeedAdPayload = {
      type: adType,
      title,
      description,
      imageUrl,
      destinationUrl: adType === "regular" ? destinationUrl : "",
      podcastSlug: (adType === "podcast" || adType === "episode_recap") ? (podcastSlug || null) : null,
      ...(adType === "podcast" ? {
        podcastName: podcastName || null,
      } : {}),
      ...(adType === "episode_recap" ? {
        episodeSlug: episodeSlug || null,
        episodeTitle: episodeTitle || null,
        episodeTldl: episodeTldl || null,
        episodeKeyInsights: episodeKeyInsights.length > 0 ? episodeKeyInsights : null,
        episodeQuote: episodeQuote || null,
        episodeQuoteAttribution: episodeQuoteAttribution || null,
        podcastName: podcastName || null,
      } : {}),
      weight,
      isActive,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const [localFrequency, setLocalFrequency] = useState<number | null>(null);
  const currentFrequency = localFrequency ?? settings?.frequency ?? 5;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground" data-testid="text-feed-ads-title">Feed Ads</h3>
          <p className="text-xs text-muted-foreground">Ads shown inline in the user feed.</p>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-colors"
            data-testid="button-add-feed-ad"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Feed Ad
          </button>
        )}
      </div>

      <div className="glass-panel rounded-2xl p-4 flex items-center gap-4" data-testid="section-feed-ad-settings">
        <Settings className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold text-foreground">Ad Frequency</span>
          <p className="text-xs text-muted-foreground">Show an ad every N feed items</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="range"
            min={2}
            max={20}
            value={currentFrequency}
            onChange={(e) => setLocalFrequency(parseInt(e.target.value))}
            onMouseUp={() => { if (localFrequency !== null) { settingsMutation.mutate({ frequency: localFrequency }); setLocalFrequency(null); } }}
            onTouchEnd={() => { if (localFrequency !== null) { settingsMutation.mutate({ frequency: localFrequency }); setLocalFrequency(null); } }}
            className="w-24 accent-primary"
            data-testid="input-ad-frequency"
          />
          <span className="text-sm font-bold text-foreground w-6 text-center" data-testid="text-ad-frequency">{currentFrequency}</span>
        </div>
      </div>

      {showForm && (
        <div className="glass-panel rounded-2xl p-5 space-y-4" data-testid="section-feed-ad-form">
          <h3 className="text-sm font-bold text-foreground">
            {editingId ? "Edit Feed Ad" : "New Feed Ad"}
          </h3>

          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setAdType("podcast")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                adType === "podcast" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-black/[0.04]"
              }`}
              data-testid="button-type-podcast"
            >
              <Radio className="w-3.5 h-3.5" />
              Podcast Ad
            </button>
            <button
              type="button"
              onClick={() => setAdType("regular")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                adType === "regular" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-black/[0.04]"
              }`}
              data-testid="button-type-regular"
            >
              <Megaphone className="w-3.5 h-3.5" />
              Regular Ad
            </button>
            <button
              type="button"
              onClick={() => setAdType("episode_recap")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                adType === "episode_recap" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-black/[0.04]"
              }`}
              data-testid="button-type-episode-recap"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Episode Recap
            </button>
          </div>

          {adType === "podcast" && (
            <div className="relative">
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Search Podcasts</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={podcastSearch}
                  onChange={(e) => setPodcastSearch(e.target.value)}
                  placeholder="Search by podcast name..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-black/[0.08] text-sm bg-white dark:bg-black/20 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  data-testid="input-podcast-search"
                />
                {isPodcastSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
              {podcastResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-900 border border-black/[0.08] rounded-xl shadow-lg max-h-60 overflow-y-auto" data-testid="podcast-search-results">
                  {podcastResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectPodcast(p)}
                      className="w-full px-3 py-2.5 flex items-start gap-3 hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-left border-b border-black/[0.04] last:border-0"
                      data-testid={`podcast-result-${p.id}`}
                    >
                      {p.artworkUrl && (
                        <img src={p.artworkUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-foreground truncate">{p.name}</div>
                        {p.artistName && <div className="text-xs text-muted-foreground truncate">{p.artistName}</div>}
                        {p.onPlatform && <span className="text-[10px] font-bold text-primary">On Platform</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {selectedPodcastName && (
                <div className="mt-2 p-3 bg-primary/5 rounded-xl" data-testid="selected-podcast-preview">
                  <div className="text-xs font-bold text-primary mb-0.5">Selected Podcast</div>
                  <div className="flex items-center gap-3">
                    {imageUrl && <img src={imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />}
                    <div>
                      <div className="text-sm font-bold text-foreground">{selectedPodcastName}</div>
                      {podcastSlug && <div className="text-xs text-muted-foreground">{podcastSlug}</div>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {adType === "episode_recap" && (
            <div className="relative">
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Search Episodes</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={episodeSearch}
                  onChange={(e) => setEpisodeSearch(e.target.value)}
                  placeholder="Search by episode or podcast name..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-black/[0.08] text-sm bg-white dark:bg-black/20 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  data-testid="input-episode-search"
                />
                {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
              {episodeResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-900 border border-black/[0.08] rounded-xl shadow-lg max-h-60 overflow-y-auto" data-testid="episode-search-results">
                  {episodeResults.map((ep) => (
                    <button
                      key={ep.id}
                      type="button"
                      onClick={() => selectEpisode(ep)}
                      className="w-full px-3 py-2.5 flex items-start gap-3 hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-left border-b border-black/[0.04] last:border-0"
                      data-testid={`episode-result-${ep.id}`}
                    >
                      {ep.artwork_url && (
                        <img src={ep.artwork_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-foreground truncate">{ep.episode_title}</div>
                        <div className="text-xs text-muted-foreground truncate">{ep.podcast_name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {episodeTitle && (
                <div className="mt-2 p-3 bg-primary/5 rounded-xl" data-testid="selected-episode-preview">
                  <div className="text-xs font-bold text-primary mb-0.5">Selected Episode</div>
                  <div className="text-sm font-bold text-foreground">{episodeTitle}</div>
                  <div className="text-xs text-muted-foreground">{podcastName}</div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                {adType === "podcast" ? "Podcast Name" : adType === "episode_recap" ? "Episode Title" : "Brand Name"}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={adType === "podcast" ? "e.g. Fresh Air" : "e.g. AG1"}
                className="w-full px-3 py-2 rounded-xl border border-black/[0.08] text-sm bg-white dark:bg-black/20 focus:outline-none focus:ring-2 focus:ring-primary/20"
                data-testid="input-feed-ad-title"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                {adType === "podcast" ? "Artwork URL" : "Product Image URL"}
              </label>
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-xl border border-black/[0.08] text-sm bg-white dark:bg-black/20 focus:outline-none focus:ring-2 focus:ring-primary/20"
                data-testid="input-feed-ad-image"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ad copy / description..."
              rows={3}
              className="w-full px-3 py-2 rounded-xl border border-black/[0.08] text-sm bg-white dark:bg-black/20 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              data-testid="input-feed-ad-description"
            />
          </div>

          {adType === "podcast" && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Podcast Slug (for follow action)</label>
              <input
                type="text"
                value={podcastSlug}
                onChange={(e) => setPodcastSlug(e.target.value)}
                placeholder="e.g. fresh-air"
                className="w-full px-3 py-2 rounded-xl border border-black/[0.08] text-sm bg-white dark:bg-black/20 focus:outline-none focus:ring-2 focus:ring-primary/20"
                data-testid="input-feed-ad-slug"
              />
            </div>
          )}

          {adType === "regular" && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Destination URL</label>
              <input
                type="text"
                value={destinationUrl}
                onChange={(e) => setDestinationUrl(e.target.value)}
                placeholder="https://www.example.com"
                className="w-full px-3 py-2 rounded-xl border border-black/[0.08] text-sm bg-white dark:bg-black/20 focus:outline-none focus:ring-2 focus:ring-primary/20"
                data-testid="input-feed-ad-destination"
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Weight / Priority (1-10)</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={weight}
                  onChange={(e) => setWeight(parseInt(e.target.value))}
                  className="flex-1 accent-primary"
                  data-testid="input-feed-ad-weight"
                />
                <span className="text-sm font-bold text-foreground w-6 text-center" data-testid="text-feed-ad-weight">{weight}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-4">
              <label className="text-xs font-semibold text-muted-foreground">Active</label>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={`relative w-10 h-5 rounded-full transition-colors ${isActive ? "bg-primary" : "bg-black/[0.12]"}`}
                data-testid="toggle-feed-ad-active"
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isActive ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSubmit}
              disabled={isSaving || !title.trim() || !description.trim() || !imageUrl.trim()}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
              data-testid="button-save-feed-ad"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? "Update" : "Create"}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-black/[0.04] transition-colors"
              data-testid="button-cancel-feed-ad"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : !feedAds || feedAds.length === 0 ? (
        <div className="glass-panel rounded-2xl p-6 text-center">
          <p className="text-sm text-muted-foreground" data-testid="text-no-feed-ads">No feed ads yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {feedAds.map((ad) => (
            <div
              key={ad.id}
              className={`glass-panel rounded-2xl p-4 flex items-start gap-4 ${!ad.isActive ? "opacity-50" : ""}`}
              data-testid={`card-feed-ad-${ad.id}`}
            >
              <img
                src={ad.imageUrl}
                alt={ad.title}
                className="w-12 h-12 rounded-lg object-cover shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect fill='%23ddd' width='48' height='48'/%3E%3C/svg%3E"; }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-bold text-foreground" data-testid={`text-feed-ad-title-${ad.id}`}>{ad.title}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                    ad.type === "podcast" ? "bg-purple-100 text-purple-700" : ad.type === "episode_recap" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                  }`}>
                    {ad.type === "podcast" ? "Podcast" : ad.type === "episode_recap" ? "Recap" : "Regular"}
                  </span>
                  <span className="text-[10px] font-medium text-muted-foreground">W:{ad.weight}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{ad.description}</p>
                {ad.destinationUrl && (
                  <div className="flex items-center gap-1 mt-1">
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-primary truncate">{ad.destinationUrl}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleActiveMutation.mutate({ id: ad.id, isActive: !ad.isActive })}
                  className={`relative w-9 h-5 rounded-full transition-colors ${ad.isActive ? "bg-primary" : "bg-black/[0.12]"}`}
                  data-testid={`toggle-feed-ad-active-${ad.id}`}
                  title={ad.isActive ? "Deactivate" : "Activate"}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${ad.isActive ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
                <button
                  onClick={() => startEdit(ad)}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/[0.04] transition-colors"
                  data-testid={`button-edit-feed-ad-${ad.id}`}
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this feed ad?")) {
                      deleteMutation.mutate(ad.id);
                    }
                  }}
                  className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  data-testid={`button-delete-feed-ad-${ad.id}`}
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdAnalyticsSection() {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<string>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const getDateParams = () => {
    const now = new Date();
    let startDate: string | undefined;
    let endDate: string | undefined;
    if (dateRange === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      endDate = now.toISOString();
    } else if (dateRange === "7days") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      startDate = d.toISOString();
      endDate = now.toISOString();
    } else if (dateRange === "30days") {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      startDate = d.toISOString();
      endDate = now.toISOString();
    } else if (dateRange === "month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      endDate = now.toISOString();
    } else if (dateRange === "custom" && customStart) {
      startDate = new Date(customStart).toISOString();
      endDate = customEnd ? new Date(customEnd).toISOString() : now.toISOString();
    }
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    return params.toString() ? `?${params.toString()}` : "";
  };

  const { data: analytics, isLoading } = useQuery<AdAnalyticsRow[]>({
    queryKey: ["/api/admin/ad-analytics", dateRange, customStart, customEnd],
    queryFn: async () => {
      const res = await fetch(`/api/admin/ad-analytics${getDateParams()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/seed-episode-recap-ads"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feed-ads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ad-analytics"] });
      toast({ title: "Seeded", description: "Episode recap ads have been created." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to seed ads.", variant: "destructive" });
    },
  });

  const totalViews = analytics?.reduce((s, a) => s + a.views, 0) || 0;
  const totalClicks = analytics?.reduce((s, a) => s + a.clicks, 0) || 0;
  const totalFollows = analytics?.reduce((s, a) => s + a.follows, 0) || 0;
  const overallCtr = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(2) : "0.00";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground" data-testid="text-analytics-title">
            <BarChart3 className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
            Ad Analytics
          </h3>
          <p className="text-xs text-muted-foreground">Per-ad performance metrics across all ad types.</p>
        </div>
        <button
          onClick={() => { if (confirm("Seed 3 random episode recap ads from existing episodes?")) seedMutation.mutate(); }}
          disabled={seedMutation.isPending}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
          data-testid="button-seed-recap-ads"
        >
          {seedMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}
          Seed Recap Ads
        </button>
      </div>

      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center gap-2" data-testid="section-analytics-filters">
        <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
        {["all", "today", "7days", "30days", "month", "custom"].map((range) => (
          <button
            key={range}
            onClick={() => setDateRange(range)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
              dateRange === range ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-black/[0.04]"
            }`}
            data-testid={`button-range-${range}`}
          >
            {range === "all" ? "All Time" : range === "today" ? "Today" : range === "7days" ? "7 Days" : range === "30days" ? "30 Days" : range === "month" ? "This Month" : "Custom"}
          </button>
        ))}
        {dateRange === "custom" && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2 py-1 rounded-lg border border-black/[0.08] text-xs bg-white dark:bg-black/20"
              data-testid="input-custom-start"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2 py-1 rounded-lg border border-black/[0.08] text-xs bg-white dark:bg-black/20"
              data-testid="input-custom-end"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3" data-testid="section-analytics-summary">
        <div className="glass-panel rounded-xl p-3 text-center">
          <Eye className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
          <div className="text-lg font-bold text-foreground" data-testid="text-total-views">{totalViews.toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground">Views</div>
        </div>
        <div className="glass-panel rounded-xl p-3 text-center">
          <MousePointer className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
          <div className="text-lg font-bold text-foreground" data-testid="text-total-clicks">{totalClicks.toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground">Clicks</div>
        </div>
        <div className="glass-panel rounded-xl p-3 text-center">
          <UserPlus className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
          <div className="text-lg font-bold text-foreground" data-testid="text-total-follows">{totalFollows.toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground">Follows</div>
        </div>
        <div className="glass-panel rounded-xl p-3 text-center">
          <BarChart3 className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
          <div className="text-lg font-bold text-foreground" data-testid="text-overall-ctr">{overallCtr}%</div>
          <div className="text-[10px] text-muted-foreground">CTR</div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : !analytics || analytics.length === 0 ? (
        <div className="glass-panel rounded-2xl p-6 text-center">
          <p className="text-sm text-muted-foreground" data-testid="text-no-analytics">No ad data yet.</p>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-ad-analytics">
              <thead>
                <tr className="border-b border-black/[0.06]">
                  <th className="text-left p-3 text-xs font-bold text-muted-foreground">Ad</th>
                  <th className="text-left p-3 text-xs font-bold text-muted-foreground">Type</th>
                  <th className="text-right p-3 text-xs font-bold text-muted-foreground">Views</th>
                  <th className="text-right p-3 text-xs font-bold text-muted-foreground">Clicks</th>
                  <th className="text-right p-3 text-xs font-bold text-muted-foreground">Follows</th>
                  <th className="text-right p-3 text-xs font-bold text-muted-foreground">CTR</th>
                </tr>
              </thead>
              <tbody>
                {analytics.map((row) => (
                  <tr key={row.id} className="border-b border-black/[0.04] last:border-0 hover:bg-black/[0.02]" data-testid={`row-analytics-${row.id}`}>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {row.imageUrl && (
                          <img src={row.imageUrl} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-foreground truncate max-w-[200px]">{row.title}</div>
                          {!row.isActive && <span className="text-[10px] text-red-500">Inactive</span>}
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                        row.type === "podcast" ? "bg-purple-100 text-purple-700" : row.type === "episode_recap" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {row.type === "podcast" ? "Podcast" : row.type === "episode_recap" ? "Recap" : "Regular"}
                      </span>
                    </td>
                    <td className="p-3 text-right font-medium" data-testid={`text-views-${row.id}`}>{row.views.toLocaleString()}</td>
                    <td className="p-3 text-right font-medium" data-testid={`text-clicks-${row.id}`}>{row.clicks.toLocaleString()}</td>
                    <td className="p-3 text-right font-medium" data-testid={`text-follows-${row.id}`}>{row.follows.toLocaleString()}</td>
                    <td className="p-3 text-right font-medium" data-testid={`text-ctr-${row.id}`}>{row.ctr}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdvertisersAdmin() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-foreground" data-testid="text-advertisers-title">Advertisers</h2>
        <p className="text-sm text-muted-foreground">Manage ad placements across emails and the feed.</p>
      </div>

      <EmailAdsSection />

      <div className="border-t border-black/[0.06] pt-6">
        <FeedAdsSection />
      </div>

      <div className="border-t border-black/[0.06] pt-6">
        <AdAnalyticsSection />
      </div>
    </div>
  );
}
