import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, X, Check, ChevronDown, ChevronUp, Loader2, List, Search, GripVertical } from "lucide-react";

interface PodcastList {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  podcast_slugs: string[];
  category: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface DirectoryPodcast {
  slug: string;
  name: string;
  artwork_url: string;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function ListEditor({
  list,
  allPodcasts,
  onSave,
  onCancel,
  isSaving,
}: {
  list?: PodcastList;
  allPodcasts: DirectoryPodcast[];
  onSave: (data: any) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(list?.name || "");
  const [slug, setSlug] = useState(list?.slug || "");
  const [description, setDescription] = useState(list?.description || "");
  const [category, setCategory] = useState(list?.category || "");
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set(list?.podcast_slugs || []));
  const [podcastSearch, setPodcastSearch] = useState("");
  const [autoSlug, setAutoSlug] = useState(!list);

  const filteredPodcasts = podcastSearch.length >= 1
    ? allPodcasts.filter((p) => p.name.toLowerCase().includes(podcastSearch.toLowerCase()) || p.slug.includes(podcastSearch.toLowerCase()))
    : allPodcasts;

  const selectedPodcasts = allPodcasts.filter((p) => selectedSlugs.has(p.slug));

  const togglePodcast = (podcastSlug: string) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(podcastSlug)) next.delete(podcastSlug);
      else next.add(podcastSlug);
      return next;
    });
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (autoSlug) setSlug(slugify(val));
  };

  return (
    <div className="border border-border rounded-xl bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">{list ? "Edit List" : "Create New List"}</h3>
        <button onClick={onCancel} className="p-1.5 hover:bg-muted rounded-lg">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Name</label>
          <input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Artificial Intelligence"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            data-testid="list-editor-name"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Slug</label>
          <input
            value={slug}
            onChange={(e) => { setSlug(e.target.value); setAutoSlug(false); }}
            placeholder="e.g. ai"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            data-testid="list-editor-slug"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            data-testid="list-editor-category"
          >
            <option value="">None</option>
            <option value="industry">Industry</option>
            <option value="interest">Interest</option>
            <option value="role">Role</option>
            <option value="curated">Curated</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description..."
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            data-testid="list-editor-description"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
          Podcasts ({selectedSlugs.size} selected)
        </label>

        {selectedPodcasts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {selectedPodcasts.map((p) => (
              <span
                key={p.slug}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
              >
                {p.name}
                <button onClick={() => togglePodcast(p.slug)} className="hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={podcastSearch}
            onChange={(e) => setPodcastSearch(e.target.value)}
            placeholder="Search podcasts to add..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            data-testid="list-editor-podcast-search"
          />
        </div>

        <div className="max-h-[240px] overflow-y-auto border border-border rounded-lg divide-y divide-border">
          {filteredPodcasts.slice(0, 50).map((p) => {
            const isSelected = selectedSlugs.has(p.slug);
            return (
              <button
                key={p.slug}
                onClick={() => togglePodcast(p.slug)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/50 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                data-testid={`list-editor-podcast-${p.slug}`}
              >
                <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-primary text-white" : "border border-border"}`}>
                  {isSelected && <Check className="w-3 h-3" strokeWidth={3} />}
                </div>
                <div className="w-7 h-7 rounded overflow-hidden flex-shrink-0 bg-muted">
                  {p.artwork_url && <img src={p.artwork_url} alt="" className="w-full h-full object-cover" loading="lazy" />}
                </div>
                <span className="text-sm truncate">{p.name}</span>
                <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">{p.slug}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave({ name, slug, description: description || null, podcastSlugs: Array.from(selectedSlugs), category: category || null })}
          disabled={!name || !slug || isSaving}
          className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
          data-testid="list-editor-save"
        >
          {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {list ? "Save Changes" : "Create List"}
        </button>
      </div>
    </div>
  );
}

export default function AdminListsManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingList, setEditingList] = useState<PodcastList | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: lists = [], isLoading } = useQuery<PodcastList[]>({
    queryKey: ["/api/admin/lists"],
  });

  const { data: allPodcasts = [] } = useQuery<DirectoryPodcast[]>({
    queryKey: ["/api/podcasts/directory"],
    select: (data: any[]) => data.map((p: any) => ({ slug: p.slug, name: p.name, artwork_url: p.artworkUrl || p.artwork_url })),
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/lists", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lists"] });
      setIsCreating(false);
      toast({ title: "List created" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to create list", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/admin/lists/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lists"] });
      setEditingList(null);
      toast({ title: "List updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update list", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/lists/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lists"] });
      toast({ title: "List deleted" });
    },
  });

  const filteredLists = filterCategory === "all" ? lists : lists.filter((l) => (l.category || "uncategorized") === filterCategory);
  const categories = [...new Set(lists.map((l) => l.category || "uncategorized"))].sort();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="admin-lists-manager">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">Podcast Lists</h2>
          <span className="text-sm text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full font-medium">{lists.length} lists</span>
        </div>
        <button
          onClick={() => { setIsCreating(true); setEditingList(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-lg hover:bg-primary/90 transition-colors"
          data-testid="list-create-btn"
        >
          <Plus className="w-4 h-4" />
          New List
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilterCategory("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${filterCategory === "all" ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          data-testid="list-filter-all"
        >
          All ({lists.length})
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize transition-colors ${filterCategory === cat ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            data-testid={`list-filter-${cat}`}
          >
            {cat} ({lists.filter((l) => (l.category || "uncategorized") === cat).length})
          </button>
        ))}
      </div>

      {isCreating && (
        <ListEditor
          allPodcasts={allPodcasts}
          onSave={(data) => createMutation.mutate(data)}
          onCancel={() => setIsCreating(false)}
          isSaving={createMutation.isPending}
        />
      )}

      {editingList && (
        <ListEditor
          list={editingList}
          allPodcasts={allPodcasts}
          onSave={(data) => updateMutation.mutate({ id: editingList.id, ...data })}
          onCancel={() => setEditingList(null)}
          isSaving={updateMutation.isPending}
        />
      )}

      <div className="space-y-2">
        {filteredLists.map((list) => (
          <div
            key={list.id}
            className="border border-border rounded-xl bg-card overflow-hidden"
            data-testid={`list-item-${list.slug}`}
          >
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setExpandedId(expandedId === list.id ? null : list.id)}
            >
              <List className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{list.name}</span>
                  {list.category && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{list.category}</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{list.podcast_slugs.length} podcasts · /{list.slug}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingList(list); setIsCreating(false); }}
                  className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                  data-testid={`list-edit-${list.slug}`}
                >
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete "${list.name}"?`)) deleteMutation.mutate(list.id);
                  }}
                  className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors"
                  data-testid={`list-delete-${list.slug}`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
                {expandedId === list.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
            {expandedId === list.id && (
              <div className="px-4 pb-3 border-t border-border pt-2">
                {list.description && <p className="text-xs text-muted-foreground mb-2">{list.description}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {list.podcast_slugs.map((slug) => {
                    const podcast = allPodcasts.find((p) => p.slug === slug);
                    return (
                      <span key={slug} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-xs font-medium">
                        {podcast?.artwork_url && (
                          <img src={podcast.artwork_url} alt="" className="w-4 h-4 rounded object-cover" />
                        )}
                        {podcast?.name || slug}
                      </span>
                    );
                  })}
                  {list.podcast_slugs.length === 0 && <span className="text-xs text-muted-foreground italic">No podcasts in this list</span>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredLists.length === 0 && !isCreating && (
        <div className="text-center py-12 text-muted-foreground">
          <List className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No lists yet</p>
          <p className="text-sm">Create your first podcast list to get started.</p>
        </div>
      )}
    </div>
  );
}
