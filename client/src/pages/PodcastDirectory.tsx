import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2, Twitter, ExternalLink, Search, Globe, ChevronDown, ChevronUp, Image } from "lucide-react";
import type { PodcastDirectoryEntry } from "@shared/schema";

const emptyForm = {
  itunesId: "", name: "", slug: "", hosts: "", category: "", description: "",
  keywords: "", faqTopics: "", artworkUrl: "", appleUrl: "", spotifyUrl: "",
  youtubeUrl: "", twitterHandle: "", instagramUrl: "", tiktokUrl: "",
  facebookUrl: "", discordUrl: "", websiteUrl: "", storeUrl: "",
  hostHandle: "", followers: "",
  avgEpisodeLength: "", frequency: "", totalEpisodes: "", yearStarted: "",
  aboutPodcast: "", hasLandingPage: false,
};

type FormState = typeof emptyForm;

export default function PodcastDirectory() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<PodcastDirectoryEntry | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: entries, isLoading } = useQuery<PodcastDirectoryEntry[]>({
    queryKey: ["/api/admin/podcast-directory"],
  });

  const upsertMutation = useMutation({
    mutationFn: (data: FormState) => apiRequest("POST", "/api/admin/podcast-directory", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/podcast-directory"] });
      toast({ title: editEntry ? "Entry updated" : "Entry added" });
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/podcast-directory/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/podcast-directory"] });
      toast({ title: "Entry deleted" });
    },
  });

  function resetForm() {
    setForm({ ...emptyForm });
    setShowForm(false);
    setEditEntry(null);
  }

  function startEdit(entry: PodcastDirectoryEntry) {
    setEditEntry(entry);
    setForm({
      itunesId: entry.itunesId,
      name: entry.name,
      slug: entry.slug || "",
      hosts: entry.hosts || "",
      category: entry.category || "",
      description: entry.description || "",
      keywords: entry.keywords || "",
      faqTopics: entry.faqTopics || "",
      artworkUrl: entry.artworkUrl || "",
      appleUrl: entry.appleUrl || "",
      spotifyUrl: entry.spotifyUrl || "",
      youtubeUrl: entry.youtubeUrl || "",
      twitterHandle: entry.twitterHandle || "",
      instagramUrl: (entry as any).instagramUrl || "",
      tiktokUrl: (entry as any).tiktokUrl || "",
      facebookUrl: (entry as any).facebookUrl || "",
      discordUrl: (entry as any).discordUrl || "",
      websiteUrl: (entry as any).websiteUrl || "",
      storeUrl: (entry as any).storeUrl || "",
      hostHandle: entry.hostHandle || "",
      followers: entry.followers?.toString() || "",
      avgEpisodeLength: entry.avgEpisodeLength?.toString() || "",
      frequency: entry.frequency || "",
      totalEpisodes: entry.totalEpisodes?.toString() || "",
      yearStarted: entry.yearStarted?.toString() || "",
      aboutPodcast: entry.aboutPodcast || "",
      hasLandingPage: entry.hasLandingPage || false,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const set = (key: keyof FormState) => (e: any) => setForm({ ...form, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const filtered = (entries || []).filter((e) =>
    !search || e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.itunesId.includes(search) ||
    (e.slug && e.slug.toLowerCase().includes(search.toLowerCase())) ||
    (e.hosts && e.hosts.toLowerCase().includes(search.toLowerCase()))
  );

  const landingCount = (entries || []).filter(e => e.hasLandingPage).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const inputCls = "w-full px-3 py-2 border border-border rounded-lg text-[16px]";

  return (
    <div className="space-y-6" data-testid="podcast-directory-tab">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-foreground">Podcast Directory</h3>
          <p className="text-base text-[#52525B] dark:text-[#A1A1AA] mt-0.5">
            {entries?.length || 0} podcasts tracked · {landingCount} with landing pages
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              data-testid="input-search-directory"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full pl-9 pr-3 py-2 border border-border rounded-xl text-[16px]"
            />
          </div>
          <button
            data-testid="button-add-podcast"
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-base font-semibold hover:bg-primary/90 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white border border-border rounded-2xl p-6 space-y-5">
          <h4 className="font-semibold text-foreground">
            {editEntry ? `Edit: ${editEntry.name}` : "Add Podcast"}
          </h4>

          <div className="space-y-1">
            <p className="text-[16px] font-semibold text-muted-foreground uppercase tracking-wider">Required</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-base font-medium text-foreground mb-1">iTunes ID *</label>
                <input data-testid="input-itunes-id" type="text" value={form.itunesId} onChange={set("itunesId")} placeholder="1469759170" disabled={!!editEntry} className={`${inputCls} disabled:opacity-50`} />
              </div>
              <div>
                <label className="block text-base font-medium text-foreground mb-1">Name *</label>
                <input data-testid="input-podcast-name" type="text" value={form.name} onChange={set("name")} placeholder="My First Million" className={inputCls} />
              </div>
              <div>
                <label className="block text-base font-medium text-foreground mb-1">Slug</label>
                <input data-testid="input-slug" type="text" value={form.slug} onChange={set("slug")} placeholder="myfirstmillion" className={inputCls} />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[16px] font-semibold text-muted-foreground uppercase tracking-wider">Details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-base font-medium text-foreground mb-1">Hosts</label>
                <input type="text" value={form.hosts} onChange={set("hosts")} placeholder="Sam Parr, Shaan Puri" className={inputCls} />
              </div>
              <div>
                <label className="block text-base font-medium text-foreground mb-1">Category</label>
                <input type="text" value={form.category} onChange={set("category")} placeholder="Business / Startups" className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-base font-medium text-foreground mb-1">Description</label>
                <input type="text" value={form.description} onChange={set("description")} placeholder="Short description of the podcast" className={inputCls} />
              </div>
              <div>
                <label className="block text-base font-medium text-foreground mb-1">Artwork URL</label>
                <input type="text" value={form.artworkUrl} onChange={set("artworkUrl")} placeholder="https://..." className={inputCls} />
              </div>
              <div>
                <label className="block text-base font-medium text-foreground mb-1">Frequency</label>
                <input type="text" value={form.frequency} onChange={set("frequency")} placeholder="Weekly" className={inputCls} />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[16px] font-semibold text-muted-foreground uppercase tracking-wider">Links & Social</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-base font-medium text-foreground mb-1">Apple Podcasts URL</label>
                <input type="text" value={form.appleUrl} onChange={set("appleUrl")} placeholder="https://podcasts.apple.com/..." className={inputCls} />
              </div>
              <div>
                <label className="block text-base font-medium text-foreground mb-1">Spotify URL</label>
                <input type="text" value={form.spotifyUrl} onChange={set("spotifyUrl")} placeholder="https://open.spotify.com/..." className={inputCls} />
              </div>
              <div>
                <label className="block text-base font-medium text-foreground mb-1">YouTube URL</label>
                <input type="text" value={form.youtubeUrl} onChange={set("youtubeUrl")} placeholder="https://youtube.com/..." className={inputCls} />
              </div>
              <div>
                <label className="block text-base font-medium text-foreground mb-1">X Handle</label>
                <input data-testid="input-twitter-handle" type="text" value={form.twitterHandle} onChange={set("twitterHandle")} placeholder="@myfirstmilpod" className={inputCls} />
              </div>
              <div>
                <label className="block text-base font-medium text-foreground mb-1">Instagram URL</label>
                <input data-testid="input-instagram-url" type="text" value={form.instagramUrl} onChange={set("instagramUrl")} placeholder="https://instagram.com/myfirstmilpod" className={inputCls} />
              </div>
              <div>
                <label className="block text-base font-medium text-foreground mb-1">TikTok URL</label>
                <input data-testid="input-tiktok-url" type="text" value={form.tiktokUrl} onChange={set("tiktokUrl")} placeholder="https://tiktok.com/@myfirstmilpod" className={inputCls} />
              </div>
              <div>
                <label className="block text-base font-medium text-foreground mb-1">Facebook URL</label>
                <input data-testid="input-facebook-url" type="text" value={form.facebookUrl} onChange={set("facebookUrl")} placeholder="https://facebook.com/groups/..." className={inputCls} />
              </div>
              <div>
                <label className="block text-base font-medium text-foreground mb-1">Discord URL</label>
                <input data-testid="input-discord-url" type="text" value={form.discordUrl} onChange={set("discordUrl")} placeholder="https://discord.gg/..." className={inputCls} />
              </div>
              <div>
                <label className="block text-base font-medium text-foreground mb-1">Website URL</label>
                <input data-testid="input-website-url" type="text" value={form.websiteUrl} onChange={set("websiteUrl")} placeholder="https://www.mfmpod.com" className={inputCls} />
              </div>
              <div>
                <label className="block text-base font-medium text-foreground mb-1">Store URL</label>
                <input data-testid="input-store-url" type="text" value={form.storeUrl} onChange={set("storeUrl")} placeholder="https://store.mfmpod.com" className={inputCls} />
              </div>
              <div>
                <label className="block text-base font-medium text-foreground mb-1">Host X Handle</label>
                <input data-testid="input-host-handle" type="text" value={form.hostHandle} onChange={set("hostHandle")} placeholder="@ShaanVP" className={inputCls} />
              </div>
              <div>
                <label className="block text-base font-medium text-foreground mb-1">Followers</label>
                <input data-testid="input-followers" type="number" value={form.followers} onChange={set("followers")} placeholder="50000" className={inputCls} />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[16px] font-semibold text-muted-foreground uppercase tracking-wider">Stats</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-base font-medium text-foreground mb-1">Avg. Episode (min)</label>
                <input type="number" value={form.avgEpisodeLength} onChange={set("avgEpisodeLength")} placeholder="45" className={inputCls} />
              </div>
              <div>
                <label className="block text-base font-medium text-foreground mb-1">Total Episodes</label>
                <input type="number" value={form.totalEpisodes} onChange={set("totalEpisodes")} placeholder="500" className={inputCls} />
              </div>
              <div>
                <label className="block text-base font-medium text-foreground mb-1">Year Started</label>
                <input type="number" value={form.yearStarted} onChange={set("yearStarted")} placeholder="2020" className={inputCls} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <label className="flex items-center gap-2 text-base font-medium text-foreground cursor-pointer">
              <input type="checkbox" checked={form.hasLandingPage} onChange={set("hasLandingPage")} className="rounded border-border" />
              Has landing page
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              data-testid="button-save-podcast"
              onClick={() => upsertMutation.mutate(form)}
              disabled={!form.itunesId || !form.name || upsertMutation.isPending}
              className="px-4 py-2 bg-primary text-white rounded-lg text-base font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {upsertMutation.isPending ? "Saving..." : editEntry ? "Update" : "Add"}
            </button>
            <button data-testid="button-cancel-podcast" onClick={resetForm} className="px-4 py-2 border border-border rounded-lg text-base font-medium text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-white border border-border rounded-2xl py-12 text-center text-muted-foreground">
            {search ? "No matching podcasts found." : "No podcasts in directory yet."}
          </div>
        ) : (
          filtered.map((entry) => (
            <div key={entry.id} className="bg-white border border-border rounded-xl overflow-hidden" data-testid={`row-podcast-${entry.id}`}>
              <div className="flex items-center gap-3 px-4 py-3">
                {entry.artworkUrl ? (
                  <img src={entry.artworkUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-muted/40 flex items-center justify-center flex-shrink-0">
                    <Image className="w-4 h-4 text-[#52525B]" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground text-base truncate">{entry.name}</span>
                    {entry.hasLandingPage && (
                      <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-[16px] font-bold rounded-md uppercase flex-shrink-0">Landing</span>
                    )}
                    {entry.slug && (
                      <span className="text-[16px] text-[#52525B] hidden sm:inline">/{entry.slug}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[16px] text-muted-foreground mt-0.5">
                    {entry.hosts && <span>{entry.hosts}</span>}
                    {entry.category && <span className="hidden sm:inline">· {entry.category}</span>}
                    {entry.twitterHandle && (
                      <a href={`https://x.com/${entry.twitterHandle.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline hidden sm:inline">
                        {entry.twitterHandle}
                        <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/30 transition-colors"
                    title="Details"
                  >
                    {expandedId === entry.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  <button
                    data-testid={`button-edit-podcast-${entry.id}`}
                    onClick={() => startEdit(entry)}
                    className="p-1.5 text-muted-foreground hover:text-primary rounded-lg hover:bg-primary/5 transition-colors"
                    title="Edit"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                  <button
                    data-testid={`button-delete-podcast-${entry.id}`}
                    onClick={() => {
                      if (confirm(`Delete "${entry.name}" from directory?`)) {
                        deleteMutation.mutate(entry.id);
                      }
                    }}
                    className="p-1.5 text-muted-foreground hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {expandedId === entry.id && (
                <div className="px-4 pb-4 pt-1 border-t border-border/50 bg-muted/10">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-[16px]">
                    <div><span className="text-muted-foreground">iTunes ID:</span> <span className="font-medium">{entry.itunesId}</span></div>
                    {entry.yearStarted && <div><span className="text-muted-foreground">Since:</span> <span className="font-medium">{entry.yearStarted}</span></div>}
                    {entry.totalEpisodes && <div><span className="text-muted-foreground">Episodes:</span> <span className="font-medium">{entry.totalEpisodes.toLocaleString()}</span></div>}
                    {entry.avgEpisodeLength && <div><span className="text-muted-foreground">Avg length:</span> <span className="font-medium">{entry.avgEpisodeLength} min</span></div>}
                    {entry.frequency && <div><span className="text-muted-foreground">Frequency:</span> <span className="font-medium">{entry.frequency}</span></div>}
                    {entry.followers && <div><span className="text-muted-foreground">Followers:</span> <span className="font-medium">{entry.followers.toLocaleString()}</span></div>}
                  </div>
                  {entry.description && <p className="text-[16px] text-muted-foreground mt-2">{entry.description}</p>}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <a href={`https://podcasts.apple.com/podcast/id${entry.itunesId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[16px] text-primary hover:underline">
                      Apple <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                    </a>
                    {entry.spotifyUrl && (
                      <a href={entry.spotifyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[16px] text-primary hover:underline">
                        Spotify <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                      </a>
                    )}
                    {entry.youtubeUrl && (
                      <a href={entry.youtubeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[16px] text-primary hover:underline">
                        YouTube <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                      </a>
                    )}
                    {entry.twitterHandle && (
                      <a href={`https://x.com/${entry.twitterHandle.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[16px] text-primary hover:underline">
                        <Twitter className="w-3 h-3" /> {entry.twitterHandle} <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                      </a>
                    )}
                    {(entry as any).instagramUrl && (
                      <a href={(entry as any).instagramUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[16px] text-primary hover:underline">
                        Instagram <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                      </a>
                    )}
                    {(entry as any).tiktokUrl && (
                      <a href={(entry as any).tiktokUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[16px] text-primary hover:underline">
                        TikTok <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                      </a>
                    )}
                    {(entry as any).facebookUrl && (
                      <a href={(entry as any).facebookUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[16px] text-primary hover:underline">
                        Facebook <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                      </a>
                    )}
                    {(entry as any).discordUrl && (
                      <a href={(entry as any).discordUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[16px] text-primary hover:underline">
                        Discord <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                      </a>
                    )}
                    {(entry as any).websiteUrl && (
                      <a href={(entry as any).websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[16px] text-primary hover:underline">
                        <Globe className="w-3 h-3" /> Website <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                      </a>
                    )}
                    {(entry as any).storeUrl && (
                      <a href={(entry as any).storeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[16px] text-primary hover:underline">
                        Store <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                      </a>
                    )}
                    {entry.slug && entry.hasLandingPage && (
                      <a href={`/podcasts/${entry.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[16px] text-primary hover:underline">
                        <Globe className="w-3 h-3" /> Landing page <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
