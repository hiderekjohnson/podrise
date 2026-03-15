import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Search, ShoppingBag, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  ImageIcon, Upload, ExternalLink, Pencil, X, Package, Tag, Mic, FileText,
  SkipForward, Eye, Save, RefreshCw, AlertCircle, Clock
} from "lucide-react";

interface ShopItem {
  id: number;
  source_type: "product" | "book";
  name: string;
  company: string | null;
  description: string | null;
  url: string | null;
  image_url: string | null;
  context: string | null;
  context_summary: string | null;
  mention_type: string | null;
  category: string | null;
  episode_title: string | null;
  podcast_slug: string | null;
  status: string;
  image_status: string;
  created_at: string | null;
}

interface QueueResponse {
  items: ShopItem[];
  stats: { pending: number; approved: number; rejected: number };
  page: number;
  limit: number;
}

interface ApprovedResponse {
  items: ShopItem[];
  total: number;
  page: number;
  limit: number;
}

function getCategoryLabel(cat: string | null): string {
  if (!cat) return "Product";
  switch (cat) {
    case "physical_product": return "Physical Product";
    case "service_or_tool": return "Service / Tool";
    case "experience": return "Experience";
    case "book": return "Book";
    default: return cat;
  }
}

function getCategoryColor(cat: string | null): string {
  switch (cat) {
    case "physical_product": return "bg-blue-100 text-blue-700";
    case "service_or_tool": return "bg-purple-100 text-purple-700";
    case "experience": return "bg-amber-100 text-amber-700";
    case "book": return "bg-emerald-100 text-emerald-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

function ApprovalQueue() {
  const { toast } = useToast();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageSearch, setImageSearch] = useState<{ loading: boolean; images: string[]; selectedIdx: number | null }>({ loading: false, images: [], selectedIdx: null });
  const [showImageBrowser, setShowImageBrowser] = useState(false);
  const [customImageUrl, setCustomImageUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, refetch } = useQuery<QueueResponse>({
    queryKey: ["/api/admin/shop/queue", 1],
    queryFn: async () => {
      const res = await fetch("/api/admin/shop/queue?limit=50", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ item, imageUrl }: { item: ShopItem; imageUrl?: string }) => {
      if (imageUrl) {
        await apiRequest("POST", `/api/admin/shop/${item.source_type}/${item.id}/update`, { imageUrl });
      }
      return apiRequest("POST", `/api/admin/shop/${item.source_type}/${item.id}/approve`);
    },
    onSuccess: () => {
      toast({ title: "Approved", description: "Product moved to approved." });
      resetImageState();
      setCurrentIndex((i) => {
        const newLen = (data?.items?.length || 1) - 1;
        return Math.min(i, Math.max(0, newLen - 1));
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/approved"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (item: ShopItem) =>
      apiRequest("POST", `/api/admin/shop/${item.source_type}/${item.id}/reject`, { reason: "not_relevant" }),
    onSuccess: () => {
      toast({ title: "Rejected", description: "Product has been rejected." });
      resetImageState();
      setCurrentIndex((i) => {
        const newLen = (data?.items?.length || 1) - 1;
        return Math.min(i, Math.max(0, newLen - 1));
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/queue"] });
    },
  });

  const updateImageMutation = useMutation({
    mutationFn: ({ item, imageUrl }: { item: ShopItem; imageUrl: string }) =>
      apiRequest("POST", `/api/admin/shop/${item.source_type}/${item.id}/update`, { imageUrl }),
    onSuccess: () => {
      toast({ title: "Image updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/queue"] });
    },
  });

  const uploadImageMutation = useMutation({
    mutationFn: async ({ item, file }: { item: ShopItem; file: File }) => {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("type", item.source_type);
      formData.append("id", String(item.id));
      const res = await fetch("/api/admin/shop-items/upload-image", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Image uploaded" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/queue"] });
    },
  });

  const resetImageState = () => {
    setImageSearch({ loading: false, images: [], selectedIdx: null });
    setShowImageBrowser(false);
    setCustomImageUrl("");
  };

  const findImages = useCallback(async (item: ShopItem) => {
    setShowImageBrowser(true);
    setImageSearch({ loading: true, images: [], selectedIdx: null });
    try {
      const res = await fetch(`/api/admin/shop/${item.source_type}/${item.id}/find-images`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setImageSearch({ loading: false, images: data.images || [], selectedIdx: null });
    } catch {
      setImageSearch({ loading: false, images: [], selectedIdx: null });
      toast({ title: "Could not find images", variant: "destructive" });
    }
  }, [toast]);

  const items = data?.items || [];
  const stats = data?.stats;
  const current = items[currentIndex];

  const goNext = () => {
    resetImageState();
    setCurrentIndex((i) => Math.min(i + 1, items.length - 1));
  };
  const goPrev = () => {
    resetImageState();
    setCurrentIndex((i) => Math.max(i - 1, 0));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="section-approval-queue">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground">Approval Queue</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review and approve products before they go live on the shop.
          </p>
        </div>
        {stats && (
          <div className="flex items-center gap-3 text-xs font-semibold">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700">
              <Clock className="w-3.5 h-3.5" /> {stats.pending} pending
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-50 text-green-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> {stats.approved} approved
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 text-red-600">
              <XCircle className="w-3.5 h-3.5" /> {stats.rejected} rejected
            </span>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <p className="text-base font-bold text-foreground">All caught up!</p>
          <p className="text-sm text-muted-foreground mt-1">No pending products to review.</p>
        </div>
      ) : current ? (
        <div className="glass-panel rounded-2xl overflow-hidden" data-testid={`queue-item-${current.id}`}>
          <div className="flex items-center justify-between px-5 py-3 bg-black/[0.02] border-b border-black/[0.06]">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-bold text-foreground">{currentIndex + 1} of {items.length}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${getCategoryColor(current.category)}`}>
                {getCategoryLabel(current.category)}
              </span>
              {current.source_type === "book" && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-600 border border-emerald-200">Book</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={goPrev} disabled={currentIndex === 0} className="p-1.5 rounded-lg hover:bg-black/[0.05] disabled:opacity-30 transition-all" data-testid="button-queue-prev">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={goNext} disabled={currentIndex >= items.length - 1} className="p-1.5 rounded-lg hover:bg-black/[0.05] disabled:opacity-30 transition-all" data-testid="button-queue-next">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-5 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
            <div className="space-y-3">
              <div className="aspect-square bg-gray-50 rounded-xl border border-black/[0.06] overflow-hidden flex items-center justify-center relative group">
                {current.image_url ? (
                  <img
                    src={current.image_url}
                    alt={current.name}
                    className="w-full h-full object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="text-center p-4">
                    <ImageIcon className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No image</p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => findImages(current)}
                  disabled={imageSearch.loading}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-black/[0.04] hover:bg-black/[0.07] transition-all"
                  data-testid="button-find-images"
                >
                  {imageSearch.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  Find Images
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-black/[0.04] hover:bg-black/[0.07] transition-all"
                  data-testid="button-upload-image"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && current) {
                      uploadImageMutation.mutate({ item: current, file });
                    }
                    e.target.value = "";
                  }}
                />
              </div>

              {showImageBrowser && (
                <div className="border border-black/[0.08] rounded-xl p-3 space-y-2 max-h-[300px] overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">Image Browser</span>
                    <button onClick={() => setShowImageBrowser(false)} className="p-1 hover:bg-black/[0.05] rounded">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {imageSearch.loading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : imageSearch.images.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No images found from the product URL.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-1.5">
                        {imageSearch.images.slice(0, 15).map((imgUrl, idx) => (
                          <button
                            key={idx}
                            onClick={() => setImageSearch((s) => ({ ...s, selectedIdx: idx }))}
                            className={`aspect-square rounded-lg border-2 overflow-hidden transition-all ${
                              imageSearch.selectedIdx === idx ? "border-primary ring-2 ring-primary/20" : "border-black/[0.08] hover:border-black/[0.15]"
                            }`}
                            data-testid={`image-candidate-${idx}`}
                          >
                            <img src={imgUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }} />
                          </button>
                        ))}
                      </div>
                      {imageSearch.selectedIdx !== null && (
                        <button
                          onClick={() => {
                            const imgUrl = imageSearch.images[imageSearch.selectedIdx!];
                            updateImageMutation.mutate({ item: current, imageUrl: imgUrl });
                            setImageSearch((s) => ({ ...s, selectedIdx: null }));
                          }}
                          className="w-full py-2 rounded-lg text-xs font-bold bg-primary text-white hover:brightness-105 transition-all"
                          data-testid="button-use-selected-image"
                        >
                          Use Selected Image
                        </button>
                      )}
                    </>
                  )}
                  <div className="pt-1 border-t border-black/[0.06]">
                    <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Or paste image URL</label>
                    <div className="flex gap-1.5">
                      <input
                        type="url"
                        value={customImageUrl}
                        onChange={(e) => setCustomImageUrl(e.target.value)}
                        placeholder="https://..."
                        className="flex-1 h-8 px-2 text-xs bg-white border border-black/[0.08] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                        data-testid="input-custom-image-url"
                      />
                      <button
                        onClick={() => {
                          if (customImageUrl.trim()) {
                            updateImageMutation.mutate({ item: current, imageUrl: customImageUrl.trim() });
                            setCustomImageUrl("");
                          }
                        }}
                        disabled={!customImageUrl.trim()}
                        className="h-8 px-3 rounded-lg text-xs font-bold bg-primary text-white hover:brightness-105 disabled:opacity-40 transition-all"
                        data-testid="button-set-custom-image"
                      >
                        Set
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-bold text-foreground" data-testid="text-queue-product-name">{current.name}</h3>
                {current.company && (
                  <p className="text-sm text-muted-foreground mt-0.5">by {current.company}</p>
                )}
              </div>

              {current.description && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                    <FileText className="w-3 h-3" /> Description
                  </label>
                  <p className="text-sm text-foreground leading-relaxed">{current.description}</p>
                </div>
              )}

              {current.context && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                    <Mic className="w-3 h-3" /> Podcast Context
                  </label>
                  <div className="bg-black/[0.02] rounded-lg p-3 text-sm text-foreground/80 leading-relaxed max-h-[200px] overflow-y-auto">
                    {current.context}
                  </div>
                </div>
              )}

              {(current.episode_title || current.podcast_slug) && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {current.podcast_slug && (
                    <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/5 text-primary font-semibold">
                      <Mic className="w-3 h-3" /> {current.podcast_slug}
                    </span>
                  )}
                  {current.episode_title && (
                    <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/[0.04] text-foreground/70 max-w-[300px] truncate" title={current.episode_title}>
                      {current.episode_title}
                    </span>
                  )}
                  {current.mention_type && (
                    <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/[0.04] text-foreground/70">
                      <Tag className="w-3 h-3" /> {current.mention_type.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              )}

              {current.url && (
                <a
                  href={current.url.match(/^https?:\/\//) ? current.url : `https://${current.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-semibold transition-colors"
                  data-testid="link-product-url"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {current.url.length > 60 ? current.url.substring(0, 60) + "..." : current.url}
                </a>
              )}

              <div className="flex items-center gap-3 pt-3 border-t border-black/[0.06]">
                <button
                  onClick={() => {
                    const selectedImg = imageSearch.selectedIdx !== null ? imageSearch.images[imageSearch.selectedIdx] : undefined;
                    approveMutation.mutate({ item: current, imageUrl: selectedImg });
                  }}
                  disabled={approveMutation.isPending}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-all"
                  data-testid="button-approve-product"
                >
                  {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Approve
                </button>
                <button
                  onClick={() => rejectMutation.mutate(current)}
                  disabled={rejectMutation.isPending}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-all"
                  data-testid="button-reject-product"
                >
                  {rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Reject
                </button>
                <button
                  onClick={goNext}
                  disabled={currentIndex >= items.length - 1}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-black/[0.04] disabled:opacity-30 transition-all"
                  data-testid="button-skip-product"
                >
                  <SkipForward className="w-4 h-4" />
                  Skip
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ApprovedProducts() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [editingItem, setEditingItem] = useState<ShopItem | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", url: "", imageUrl: "" });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  };

  const { data, isLoading } = useQuery<ApprovedResponse>({
    queryKey: ["/api/admin/shop/approved", debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/admin/shop/approved?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ item, updates }: { item: ShopItem; updates: any }) =>
      apiRequest("POST", `/api/admin/shop/${item.source_type}/${item.id}/update`, updates),
    onSuccess: () => {
      toast({ title: "Updated" });
      setEditingItem(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/approved"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  const startEdit = (item: ShopItem) => {
    setEditingItem(item);
    setEditForm({
      name: item.name || "",
      description: item.description || "",
      url: item.url || "",
      imageUrl: item.image_url || "",
    });
  };

  const items = data?.items || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="section-approved-products">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground">Approved Products</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data?.total || 0} products live on the shop. Search and edit as needed.
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search products by name, company, or description..."
          className="w-full h-11 pl-10 pr-4 bg-white border border-black/[0.08] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30"
          data-testid="input-search-approved"
        />
      </div>

      {items.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center">
          <Package className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {search ? "No products match your search." : "No approved products yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={`${item.source_type}-${item.id}`}
              className="glass-panel rounded-xl p-4"
              data-testid={`approved-item-${item.source_type}-${item.id}`}
            >
              {editingItem?.id === item.id && editingItem?.source_type === item.source_type ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const updates: any = {};
                    if (editForm.name !== item.name) updates.name = editForm.name;
                    if (editForm.description !== (item.description || "")) updates.description = editForm.description;
                    if (editForm.url !== (item.url || "")) updates.url = editForm.url;
                    if (editForm.imageUrl !== (item.image_url || "")) updates.imageUrl = editForm.imageUrl;
                    if (Object.keys(updates).length === 0) {
                      setEditingItem(null);
                      return;
                    }
                    updateMutation.mutate({ item, updates });
                  }}
                  className="space-y-3"
                  data-testid={`form-edit-product-${item.id}`}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">Name</label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        className="w-full h-9 px-3 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        data-testid="input-edit-name"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">URL</label>
                      <input
                        type="text"
                        value={editForm.url}
                        onChange={(e) => setEditForm((f) => ({ ...f, url: e.target.value }))}
                        className="w-full h-9 px-3 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        data-testid="input-edit-url"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Description</label>
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                      data-testid="input-edit-description"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Image URL</label>
                    <input
                      type="text"
                      value={editForm.imageUrl}
                      onChange={(e) => setEditForm((f) => ({ ...f, imageUrl: e.target.value }))}
                      className="w-full h-9 px-3 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      data-testid="input-edit-image"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={updateMutation.isPending}
                      className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-bold bg-primary text-white hover:brightness-105 disabled:opacity-40 transition-all"
                      data-testid="button-save-edit"
                    >
                      {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingItem(null)}
                      className="h-8 px-4 rounded-lg text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-black/[0.04] transition-all"
                      data-testid="button-cancel-edit"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-lg bg-gray-50 border border-black/[0.06] overflow-hidden shrink-0 flex items-center justify-center">
                    {item.image_url ? (
                      <img src={item.image_url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-muted-foreground/30" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate" data-testid={`text-approved-name-${item.id}`}>
                        {item.name}
                      </p>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shrink-0 ${getCategoryColor(item.category)}`}>
                        {getCategoryLabel(item.category)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      {item.company && <span>{item.company}</span>}
                      {item.url && (
                        <a href={item.url.match(/^https?:\/\//) ? item.url : `https://${item.url}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px]">
                          {item.url.replace(/^https?:\/\/(www\.)?/, "").substring(0, 40)}
                        </a>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => startEdit(item)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/[0.04] transition-all shrink-0"
                    data-testid={`button-edit-approved-${item.source_type}-${item.id}`}
                    title="Edit product"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminShopManagement() {
  const [subTab, setSubTab] = useState<"queue" | "approved">("queue");

  return (
    <div className="space-y-5" data-testid="section-shop-management">
      <div className="flex items-center gap-2 mb-1">
        <ShoppingBag className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Shop Management</h2>
      </div>

      <div className="flex items-center gap-1 bg-black/[0.03] rounded-xl p-1" data-testid="shop-sub-tabs">
        <button
          data-testid="shop-subtab-queue"
          onClick={() => setSubTab("queue")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
            subTab === "queue"
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          Approval Queue
        </button>
        <button
          data-testid="shop-subtab-approved"
          onClick={() => setSubTab("approved")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
            subTab === "approved"
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Approved
        </button>
      </div>

      {subTab === "queue" && <ApprovalQueue />}
      {subTab === "approved" && <ApprovedProducts />}
    </div>
  );
}
