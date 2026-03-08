import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Save, X, Search, Users, ExternalLink } from "lucide-react";
import { SiX, SiLinkedin, SiInstagram } from "react-icons/si";

interface PodcastHost {
  id: number;
  podcastSlug: string;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  twitterHandle: string | null;
  linkedinUrl: string | null;
  instagramHandle: string | null;
  websiteUrl: string | null;
  sortOrder: number | null;
}

interface PodcastEntry {
  slug: string;
  name: string;
  itunesId: string;
  artworkUrl?: string;
}

function HostForm({ host, podcastSlug, onClose }: { host?: PodcastHost; podcastSlug: string; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: host?.name || "",
    bio: host?.bio || "",
    photoUrl: host?.photoUrl || "",
    twitterHandle: host?.twitterHandle || "",
    linkedinUrl: host?.linkedinUrl || "",
    instagramHandle: host?.instagramHandle || "",
    websiteUrl: host?.websiteUrl || "",
    sortOrder: host?.sortOrder ?? 0,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { ...form, id: host?.id };
      return apiRequest("POST", `/api/admin/podcasts/${podcastSlug}/hosts`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts", podcastSlug, "hosts"] });
      toast({ title: host ? "Host updated" : "Host added" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!host?.id) return;
      return apiRequest("DELETE", `/api/admin/podcasts/hosts/${host.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts", podcastSlug, "hosts"] });
      toast({ title: "Host deleted" });
      onClose();
    },
  });

  return (
    <div className="bg-white border border-black/[0.06] rounded-xl p-5 space-y-4" data-testid="host-form">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">{host ? "Edit Host" : "Add Host"}</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground" data-testid="button-close-host-form">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Name *</label>
          <input
            data-testid="input-host-name"
            className="w-full px-3 py-2 text-sm border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Host name"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Photo URL</label>
          <input
            data-testid="input-host-photo"
            className="w-full px-3 py-2 text-sm border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
            value={form.photoUrl}
            onChange={(e) => setForm({ ...form, photoUrl: e.target.value })}
            placeholder="https://..."
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Bio</label>
        <textarea
          data-testid="input-host-bio"
          className="w-full px-3 py-2 text-sm border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px]"
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
          placeholder="Brief bio..."
          rows={3}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">X / Twitter Handle</label>
          <input
            data-testid="input-host-twitter"
            className="w-full px-3 py-2 text-sm border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
            value={form.twitterHandle}
            onChange={(e) => setForm({ ...form, twitterHandle: e.target.value })}
            placeholder="@handle"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">LinkedIn URL</label>
          <input
            data-testid="input-host-linkedin"
            className="w-full px-3 py-2 text-sm border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
            value={form.linkedinUrl}
            onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
            placeholder="https://linkedin.com/in/..."
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Instagram Handle</label>
          <input
            data-testid="input-host-instagram"
            className="w-full px-3 py-2 text-sm border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
            value={form.instagramHandle}
            onChange={(e) => setForm({ ...form, instagramHandle: e.target.value })}
            placeholder="@handle"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Website URL</label>
          <input
            data-testid="input-host-website"
            className="w-full px-3 py-2 text-sm border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
            value={form.websiteUrl}
            onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
            placeholder="https://..."
          />
        </div>
      </div>

      <div className="w-24">
        <label className="block text-xs font-medium text-muted-foreground mb-1">Sort Order</label>
        <input
          data-testid="input-host-sort"
          type="number"
          className="w-full px-3 py-2 text-sm border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
          value={form.sortOrder}
          onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })}
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          data-testid="button-save-host"
          onClick={() => saveMutation.mutate()}
          disabled={!form.name.trim() || saveMutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {host ? "Update" : "Add"} Host
        </button>
        {host && (
          <button
            data-testid="button-delete-host"
            onClick={() => { if (confirm("Delete this host?")) deleteMutation.mutate(); }}
            disabled={deleteMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 text-sm font-bold rounded-xl hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

export default function HostsManager() {
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingHost, setEditingHost] = useState<PodcastHost | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: podcasts, isLoading: podcastsLoading } = useQuery<PodcastEntry[]>({
    queryKey: ["/api/admin/podcast-directory"],
  });

  const { data: hosts, isLoading: hostsLoading } = useQuery<PodcastHost[]>({
    queryKey: ["/api/podcasts", selectedSlug, "hosts"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${selectedSlug}/hosts`);
      if (!res.ok) throw new Error("Failed to fetch hosts");
      return res.json();
    },
    enabled: !!selectedSlug,
  });

  const filteredPodcasts = podcasts?.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.slug.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const selectedPodcast = podcasts?.find((p) => p.slug === selectedSlug);

  return (
    <div className="space-y-6" data-testid="hosts-manager">
      <div className="flex items-center gap-3">
        <Users className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Podcast Host Manager</h2>
      </div>

      <div className="bg-white border border-black/[0.06] rounded-xl p-5">
        <label className="block text-xs font-medium text-muted-foreground mb-2">Select Podcast</label>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            data-testid="input-search-podcast-hosts"
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search podcasts..."
          />
        </div>
        {podcastsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="max-h-48 overflow-y-auto space-y-1">
            {filteredPodcasts.slice(0, 20).map((p) => (
              <button
                key={p.slug}
                data-testid={`select-podcast-${p.slug}`}
                onClick={() => { setSelectedSlug(p.slug); setEditingHost(null); setShowAddForm(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedSlug === p.slug
                    ? "bg-primary/10 text-primary font-bold"
                    : "text-foreground hover:bg-black/[0.03]"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedSlug && selectedPodcast && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">
              Hosts for {selectedPodcast.name}
            </h3>
            <button
              data-testid="button-add-host"
              onClick={() => { setShowAddForm(true); setEditingHost(null); }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Host
            </button>
          </div>

          {hostsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : hosts && hosts.length > 0 ? (
            <div className="space-y-3">
              {hosts.map((host) => (
                <div
                  key={host.id}
                  data-testid={`host-card-${host.id}`}
                  className="bg-white border border-black/[0.06] rounded-xl p-4 cursor-pointer hover:border-primary/20 transition-colors"
                  onClick={() => { setEditingHost(host); setShowAddForm(false); }}
                >
                  <div className="flex items-center gap-3">
                    {host.photoUrl ? (
                      <img src={host.photoUrl} alt={host.name} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/[0.08] flex items-center justify-center">
                        <Users className="w-4 h-4 text-primary/60" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-foreground">{host.name}</div>
                      {host.bio && <div className="text-xs text-muted-foreground truncate">{host.bio}</div>}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {host.twitterHandle && <SiX className="w-3.5 h-3.5" />}
                      {host.linkedinUrl && <SiLinkedin className="w-3.5 h-3.5" />}
                      {host.instagramHandle && <SiInstagram className="w-3.5 h-3.5" />}
                      {host.websiteUrl && <ExternalLink className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-black/[0.06] rounded-xl p-8 text-center">
              <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No hosts added yet for this podcast.</p>
            </div>
          )}

          {editingHost && (
            <HostForm
              host={editingHost}
              podcastSlug={selectedSlug}
              onClose={() => setEditingHost(null)}
            />
          )}

          {showAddForm && !editingHost && (
            <HostForm
              podcastSlug={selectedSlug}
              onClose={() => setShowAddForm(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
