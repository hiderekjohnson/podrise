import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, GripVertical } from "lucide-react";

interface SupportArticle {
  id: number;
  title: string;
  category: string;
  body: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_OPTIONS = [
  "About",
  "Getting Started",
  "Account",
  "Feed & Content",
  "How Recaps Work",
  "Subscriptions & Pricing",
  "Troubleshooting",
  "Data & Privacy",
];

export default function AdminSupportKB() {
  const { toast } = useToast();
  const [editingArticle, setEditingArticle] = useState<SupportArticle | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ title: "", category: "", body: "", sortOrder: 0, active: true });
  const [customCategory, setCustomCategory] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: articles, isLoading } = useQuery<SupportArticle[]>({
    queryKey: ["/api/admin/support-articles"],
    enabled: true,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => apiRequest("POST", "/api/admin/support-articles", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support-articles"] });
      toast({ title: "Article created" });
      resetForm();
    },
    onError: () => toast({ title: "Failed to create article", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof formData> }) =>
      apiRequest("PATCH", `/api/admin/support-articles/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support-articles"] });
      toast({ title: "Article updated" });
      resetForm();
    },
    onError: () => toast({ title: "Failed to update article", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/support-articles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support-articles"] });
      setConfirmDeleteId(null);
      toast({ title: "Article deleted" });
    },
    onError: () => toast({ title: "Failed to delete article", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      apiRequest("PATCH", `/api/admin/support-articles/${id}`, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support-articles"] });
    },
    onError: () => toast({ title: "Failed to toggle article", variant: "destructive" }),
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingArticle(null);
    setFormData({ title: "", category: "", body: "", sortOrder: 0, active: true });
    setCustomCategory("");
  };

  const openEdit = (article: SupportArticle) => {
    setEditingArticle(article);
    setFormData({
      title: article.title,
      category: article.category,
      body: article.body,
      sortOrder: article.sortOrder,
      active: article.active,
    });
    setCustomCategory(CATEGORY_OPTIONS.includes(article.category) ? "" : article.category);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const category = customCategory || formData.category;
    if (!category) {
      toast({ title: "Category is required", variant: "destructive" });
      return;
    }
    const data = { ...formData, category };
    if (editingArticle) {
      updateMutation.mutate({ id: editingArticle.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const grouped = new Map<string, SupportArticle[]>();
  for (const a of articles || []) {
    const list = grouped.get(a.category) || [];
    list.push(a);
    grouped.set(a.category, list);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="support-kb-manager">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground" data-testid="text-kb-title">Support Knowledge Base</h2>
          <p className="text-sm text-muted-foreground">Manage articles that power the Help chatbot's knowledge.</p>
        </div>
        <button
          data-testid="button-add-article"
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:brightness-105 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Article
        </button>
      </div>

      {showForm && (
        <div className="glass-panel rounded-2xl p-5" data-testid="form-support-article">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-foreground">
              {editingArticle ? "Edit Article" : "New Article"}
            </h3>
            <button onClick={resetForm} className="text-muted-foreground hover:text-foreground" data-testid="button-cancel-article">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Title</label>
              <input
                data-testid="input-article-title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Article title"
                className="w-full h-10 px-3 mt-1 bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</label>
              <div className="flex gap-2 mt-1">
                <select
                  data-testid="select-article-category"
                  value={CATEGORY_OPTIONS.includes(formData.category) ? formData.category : "__custom__"}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      setFormData({ ...formData, category: "" });
                    } else {
                      setFormData({ ...formData, category: e.target.value });
                      setCustomCategory("");
                    }
                  }}
                  className="flex-1 h-10 px-3 bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Select category...</option>
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="__custom__">Custom...</option>
                </select>
                {(formData.category === "" && !CATEGORY_OPTIONS.includes(formData.category)) || customCategory ? (
                  <input
                    data-testid="input-custom-category"
                    type="text"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="Custom category"
                    className="flex-1 h-10 px-3 bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                ) : null}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Body Content</label>
              <textarea
                data-testid="input-article-body"
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                placeholder="Article content (supports markdown-like formatting with - bullet points)"
                rows={8}
                className="w-full px-3 py-2 mt-1 bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sort Order</label>
                <input
                  data-testid="input-article-sort"
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                  className="w-full h-10 px-3 mt-1 bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex items-end gap-2 pb-0.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Active</label>
                <button
                  type="button"
                  data-testid="toggle-article-active"
                  onClick={() => setFormData({ ...formData, active: !formData.active })}
                  className={`${formData.active ? "text-primary" : "text-muted-foreground"}`}
                >
                  {formData.active ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                </button>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                data-testid="button-save-article"
                disabled={createMutation.isPending || updateMutation.isPending || !formData.title || !formData.body}
                className="h-9 px-5 rounded-lg font-bold text-sm bg-primary text-white hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {(createMutation.isPending || updateMutation.isPending) ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : editingArticle ? "Save Changes" : "Create Article"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="h-9 px-4 rounded-lg font-bold text-sm text-muted-foreground hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-all"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {Array.from(grouped.entries()).map(([category, categoryArticles]) => (
        <div key={category} className="glass-panel rounded-2xl overflow-hidden" data-testid={`category-group-${category.replace(/\s+/g, "-").toLowerCase()}`}>
          <div className="px-5 py-3 bg-black/[0.02] dark:bg-white/[0.02] border-b border-black/[0.06] dark:border-white/[0.06]">
            <h3 className="text-sm font-bold text-foreground">{category}</h3>
            <p className="text-xs text-muted-foreground">{categoryArticles.length} article{categoryArticles.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
            {categoryArticles.map((article) => (
              <div
                key={article.id}
                className={`px-5 py-4 ${!article.active ? "opacity-50" : ""}`}
                data-testid={`article-row-${article.id}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
                      <h4 className="text-sm font-bold text-foreground truncate" data-testid={`text-article-title-${article.id}`}>
                        {article.title}
                      </h4>
                      {!article.active && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
                          Inactive
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">#{article.sortOrder}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 ml-5.5 whitespace-pre-wrap" data-testid={`text-article-body-${article.id}`}>
                      {article.body.slice(0, 200)}{article.body.length > 200 ? "..." : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      data-testid={`button-toggle-article-${article.id}`}
                      onClick={() => toggleMutation.mutate({ id: article.id, active: !article.active })}
                      className={`p-1.5 rounded-lg transition-colors ${article.active ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"}`}
                      title={article.active ? "Disable" : "Enable"}
                    >
                      {article.active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <button
                      data-testid={`button-edit-article-${article.id}`}
                      onClick={() => openEdit(article)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    {confirmDeleteId === article.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          data-testid={`button-confirm-delete-article-${article.id}`}
                          onClick={() => deleteMutation.mutate(article.id)}
                          disabled={deleteMutation.isPending}
                          className="px-2 py-1 rounded-lg text-xs font-bold text-white bg-red-500 hover:bg-red-600 transition-colors"
                        >
                          {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes"}
                        </button>
                        <button
                          data-testid={`button-cancel-delete-article-${article.id}`}
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 rounded-lg text-xs font-bold text-muted-foreground hover:text-foreground"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        data-testid={`button-delete-article-${article.id}`}
                        onClick={() => setConfirmDeleteId(article.id)}
                        className="p-1.5 rounded-lg text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {(!articles || articles.length === 0) && !isLoading && (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <p className="text-sm text-muted-foreground">No support articles yet. Click "Add Article" to create the first one.</p>
        </div>
      )}
    </div>
  );
}