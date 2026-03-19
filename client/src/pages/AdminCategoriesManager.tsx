import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, X, Loader2, ChevronDown, ChevronUp, Tag, GripVertical } from "lucide-react";

interface PodcastCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  keywords: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function CategoryEditor({
  category,
  onSave,
  onCancel,
  isSaving,
}: {
  category?: PodcastCategory;
  onSave: (data: any) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(category?.name || "");
  const [slug, setSlug] = useState(category?.slug || "");
  const [description, setDescription] = useState(category?.description || "");
  const [icon, setIcon] = useState(category?.icon || "");
  const [keywordsText, setKeywordsText] = useState((category?.keywords || []).join(", "));
  const [sortOrder, setSortOrder] = useState(category?.sort_order ?? 0);
  const [autoSlug, setAutoSlug] = useState(!category);

  const handleNameChange = (val: string) => {
    setName(val);
    if (autoSlug) setSlug(slugify(val));
  };

  return (
    <div className="border border-border rounded-xl bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">{category ? "Edit Category" : "Create New Category"}</h3>
        <button onClick={onCancel} className="p-1.5 hover:bg-muted rounded-lg" data-testid="category-editor-close">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Name</label>
          <input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Business"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            data-testid="category-editor-name"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Slug</label>
          <input
            value={slug}
            onChange={(e) => { setSlug(e.target.value); setAutoSlug(false); }}
            placeholder="e.g. business"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            data-testid="category-editor-slug"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Icon (lucide name)</label>
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="e.g. briefcase"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            data-testid="category-editor-icon"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Sort Order</label>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            data-testid="category-editor-sort-order"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Description</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description..."
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
          data-testid="category-editor-description"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
          Keywords (comma-separated, used for auto-classification)
        </label>
        <textarea
          value={keywordsText}
          onChange={(e) => setKeywordsText(e.target.value)}
          placeholder="business, entrepreneurship, startup, saas..."
          rows={3}
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
          data-testid="category-editor-keywords"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
          data-testid="category-editor-cancel"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave({
            name,
            slug,
            description: description || null,
            icon: icon || null,
            keywords: keywordsText.split(",").map(k => k.trim()).filter(Boolean),
            sortOrder,
          })}
          disabled={!name || !slug || isSaving}
          className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
          data-testid="category-editor-save"
        >
          {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {category ? "Save Changes" : "Create Category"}
        </button>
      </div>
    </div>
  );
}

export default function AdminCategoriesManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingCategory, setEditingCategory] = useState<PodcastCategory | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: categories = [], isLoading } = useQuery<PodcastCategory[]>({
    queryKey: ["/api/admin/categories"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/categories", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setIsCreating(false);
      toast({ title: "Category created" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to create category", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/admin/categories/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setEditingCategory(null);
      toast({ title: "Category updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update category", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/categories/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "Category deleted" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="admin-categories-manager">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">Podcast Categories</h2>
          <span className="text-sm text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full font-medium">{categories.length} categories</span>
        </div>
        <button
          onClick={() => { setIsCreating(true); setEditingCategory(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-lg hover:bg-primary/90 transition-colors"
          data-testid="category-create-btn"
        >
          <Plus className="w-4 h-4" />
          New Category
        </button>
      </div>

      {isCreating && (
        <CategoryEditor
          onSave={(data) => createMutation.mutate(data)}
          onCancel={() => setIsCreating(false)}
          isSaving={createMutation.isPending}
        />
      )}

      {editingCategory && (
        <CategoryEditor
          category={editingCategory}
          onSave={(data) => updateMutation.mutate({ id: editingCategory.id, ...data })}
          onCancel={() => setEditingCategory(null)}
          isSaving={updateMutation.isPending}
        />
      )}

      <div className="space-y-2">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="border border-border rounded-xl bg-card overflow-hidden"
            data-testid={`category-item-${cat.slug}`}
          >
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setExpandedId(expandedId === cat.id ? null : cat.id)}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
              <Tag className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{cat.name}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    #{cat.sort_order}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">/{cat.slug} · {cat.keywords.length} keywords</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingCategory(cat); setIsCreating(false); }}
                  className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                  data-testid={`category-edit-${cat.slug}`}
                >
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete "${cat.name}"?`)) deleteMutation.mutate(cat.id);
                  }}
                  className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors"
                  data-testid={`category-delete-${cat.slug}`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
                {expandedId === cat.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
            {expandedId === cat.id && (
              <div className="px-4 pb-3 border-t border-border pt-2 space-y-2">
                {cat.description && <p className="text-xs text-muted-foreground">{cat.description}</p>}
                {cat.icon && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Icon:</span> {cat.icon}
                  </p>
                )}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Keywords:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {cat.keywords.map((kw) => (
                      <span key={kw} className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted text-xs font-medium">
                        {kw}
                      </span>
                    ))}
                    {cat.keywords.length === 0 && <span className="text-xs text-muted-foreground italic">No keywords</span>}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {categories.length === 0 && !isCreating && (
        <div className="text-center py-12 text-muted-foreground">
          <Tag className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No categories yet</p>
          <p className="text-sm">Create your first podcast category to get started.</p>
        </div>
      )}
    </div>
  );
}
