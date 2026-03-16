import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Search, ShoppingBag, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  ImageIcon, Upload, ExternalLink, Pencil, X, Package, Tag, Mic, FileText,
  SkipForward, Eye, Save, RefreshCw, AlertCircle, Clock, Trash2, ArrowLeft,
  ArrowLeftCircle, Filter, SortAsc, ChevronDown, BookOpen
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
  episode_slug: string | null;
  podcast_slug: string | null;
  status: string;
  image_status: string;
  created_at: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  click_count?: number;
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

const CATEGORIES = [
  { value: "", label: "All Types" },
  { value: "physical_product", label: "Physical Product" },
  { value: "service_or_tool", label: "Service / Tool" },
  { value: "experience", label: "Experience" },
  { value: "book", label: "Book" },
];

const REJECTION_REASONS = [
  { value: "paid_advertisement", label: "Paid Advertisement" },
  { value: "not_relevant", label: "Not Relevant" },
  { value: "duplicate", label: "Duplicate" },
  { value: "low_quality", label: "Low Quality" },
  { value: "custom", label: "Other (custom reason)" },
];

const SORT_OPTIONS = [
  { value: "alphabetical", label: "Alphabetical" },
  { value: "recent", label: "Recently Added" },
  { value: "popular", label: "Most Popular" },
];

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

function highlightText(text: string, term: string): JSX.Element[] {
  if (!term) return [<span key="0">{text}</span>];
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  const lowerTerm = term.toLowerCase();
  return parts.map((part, i) =>
    part.toLowerCase() === lowerTerm ? <mark key={i} className="bg-yellow-200 px-0.5 rounded">{part}</mark> : <span key={i}>{part}</span>
  );
}

function RejectionModal({ onReject, onCancel, isPending }: {
  onReject: (reason: string) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");

  const finalReason = selectedReason === "custom" ? customReason.trim() : selectedReason;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" data-testid="modal-rejection">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 mx-4">
        <h3 className="text-lg font-bold text-foreground">Reject Product</h3>
        <p className="text-sm text-muted-foreground">Select a reason for rejecting this product.</p>
        <div className="space-y-2">
          {REJECTION_REASONS.map((r) => (
            <label
              key={r.value}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                selectedReason === r.value ? "border-red-400 bg-red-50" : "border-black/[0.06] hover:border-black/[0.12]"
              }`}
              data-testid={`rejection-reason-${r.value}`}
            >
              <input
                type="radio"
                name="rejection-reason"
                value={r.value}
                checked={selectedReason === r.value}
                onChange={() => setSelectedReason(r.value)}
                className="accent-red-500"
              />
              <span className="text-sm font-medium text-foreground">{r.label}</span>
            </label>
          ))}
        </div>
        {selectedReason === "custom" && (
          <textarea
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder="Enter your reason..."
            rows={2}
            className="w-full px-3 py-2 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
            data-testid="input-custom-rejection-reason"
          />
        )}
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => onReject(finalReason)}
            disabled={!finalReason || isPending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 transition-all"
            data-testid="button-confirm-reject"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Reject
          </button>
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-black/[0.04] transition-all"
            data-testid="button-cancel-reject"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function TranscriptContextPanel({ item }: { item: ShopItem }) {
  const [expanded, setExpanded] = useState(true);

  if (!item.context && !item.context_summary) return null;

  const contextText = item.context || item.context_summary || "";
  const words = contextText.split(/\s+/);
  const displayText = words.slice(0, 600).join(" ") + (words.length > 600 ? "..." : "");

  const episodeUrl = item.episode_slug && item.podcast_slug
    ? `/${item.podcast_slug}/${item.episode_slug}`
    : null;

  return (
    <div className="border border-black/[0.08] rounded-xl overflow-hidden" data-testid="panel-transcript-context">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-black/[0.02] hover:bg-black/[0.04] transition-all"
        data-testid="button-toggle-transcript"
      >
        <span className="flex items-center gap-2 text-xs font-bold text-foreground">
          <Mic className="w-3.5 h-3.5 text-primary" />
          Transcript Context
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="p-4 space-y-3">
          {(item.episode_title || episodeUrl) && (
            <div className="flex items-center gap-2 text-xs">
              {episodeUrl ? (
                <a
                  href={episodeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-primary hover:text-primary/80 font-semibold transition-colors"
                  data-testid="link-episode"
                >
                  <ExternalLink className="w-3 h-3" />
                  {item.episode_title || "View Episode"}
                </a>
              ) : (
                <span className="text-muted-foreground">{item.episode_title}</span>
              )}
              {item.podcast_slug && (
                <span className="px-2 py-0.5 rounded bg-primary/5 text-primary font-semibold">
                  {item.podcast_slug}
                </span>
              )}
            </div>
          )}
          <div className="text-sm text-foreground/80 leading-relaxed max-h-[300px] overflow-y-auto bg-black/[0.02] rounded-lg p-3">
            {highlightText(displayText, item.name)}
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalQueue() {
  const { toast } = useToast();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [imageSearch, setImageSearch] = useState<{ loading: boolean; images: string[]; selectedIdx: number | null }>({ loading: false, images: [], selectedIdx: null });
  const [showImageBrowser, setShowImageBrowser] = useState(false);
  const [customImageUrl, setCustomImageUrl] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [editFields, setEditFields] = useState<{ name: string; description: string; url: string; category: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, refetch } = useQuery<QueueResponse>({
    queryKey: ["/api/admin/shop/queue", 1, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (categoryFilter) params.set("category", categoryFilter);
      const res = await fetch(`/api/admin/shop/queue?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const items = data?.items || [];
  const stats = data?.stats;
  const current = items[currentIndex];

  useEffect(() => {
    if (current && !imageSearch.loading && imageSearch.images.length === 0 && !showImageBrowser && !current.image_url) {
      findImages(current);
    }
  }, [current?.id]);

  useEffect(() => {
    if (current) {
      setEditFields({
        name: current.name || "",
        description: current.description || "",
        url: current.url || "",
        category: current.category || "physical_product",
      });
    }
  }, [current?.id]);

  const approveMutation = useMutation({
    mutationFn: async ({ item, imageUrl, updates }: { item: ShopItem; imageUrl?: string; updates?: any }) => {
      if (updates && Object.keys(updates).length > 0) {
        await apiRequest("POST", `/api/admin/shop/${item.source_type}/${item.id}/update`, updates);
      }
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
    mutationFn: ({ item, reason }: { item: ShopItem; reason: string }) =>
      apiRequest("POST", `/api/admin/shop/${item.source_type}/${item.id}/reject`, { reason }),
    onSuccess: () => {
      toast({ title: "Rejected", description: "Product has been rejected." });
      setShowRejectModal(false);
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
    setEditFields(null);
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
    }
  }, []);

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

      <div className="flex items-center gap-2" data-testid="queue-category-filter">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        <div className="flex items-center gap-1 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => { setCategoryFilter(cat.value); setCurrentIndex(0); resetImageState(); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                categoryFilter === cat.value
                  ? "bg-primary text-white"
                  : "bg-black/[0.04] text-muted-foreground hover:text-foreground hover:bg-black/[0.07]"
              }`}
              data-testid={`filter-category-${cat.value || "all"}`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <p className="text-base font-bold text-foreground">All caught up!</p>
          <p className="text-sm text-muted-foreground mt-1">No pending products to review{categoryFilter ? " in this category" : ""}.</p>
        </div>
      ) : current ? (
        <div className="glass-panel rounded-2xl overflow-hidden flex flex-col" style={{ height: "calc(100vh - 320px)", minHeight: "500px" }} data-testid={`queue-item-${current.id}`}>
          <div className="flex items-center justify-between px-5 py-3 bg-black/[0.02] border-b border-black/[0.06] shrink-0">
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

          <div className="flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
              <div className="space-y-3">
                <div className="w-[280px] h-[280px] bg-gray-50 rounded-xl border border-black/[0.06] overflow-hidden flex items-center justify-center mx-auto">
                  {(imageSearch.selectedIdx !== null && imageSearch.images[imageSearch.selectedIdx]) ? (
                    <img
                      src={imageSearch.images[imageSearch.selectedIdx]}
                      alt={current.name}
                      className="w-full h-full object-contain p-2"
                    />
                  ) : current.image_url ? (
                    <img
                      src={current.image_url}
                      alt={current.name}
                      className="w-full h-full object-contain p-2"
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
                    {imageSearch.images.length > 0 ? "Find More" : "Find Images"}
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
                <p className="text-[10px] text-muted-foreground text-center">Recommended: 400×400px, max 2MB</p>

                {showImageBrowser && (
                  <div className="border border-black/[0.08] rounded-xl p-3 space-y-2 max-h-[300px] overflow-y-auto">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">Candidate Images</span>
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
                {editFields && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">Name</label>
                      <input
                        type="text"
                        value={editFields.name}
                        onChange={(e) => setEditFields((f) => f ? { ...f, name: e.target.value } : f)}
                        className="w-full h-10 px-3 bg-white border border-black/[0.08] rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20"
                        data-testid="input-queue-edit-name"
                      />
                    </div>
                    {current.company && (
                      <p className="text-sm text-muted-foreground">by {current.company}</p>
                    )}
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                        <FileText className="w-3 h-3" /> Description
                      </label>
                      <textarea
                        value={editFields.description}
                        onChange={(e) => setEditFields((f) => f ? { ...f, description: e.target.value } : f)}
                        rows={3}
                        className="w-full px-3 py-2 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                        data-testid="input-queue-edit-description"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">URL</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editFields.url}
                          onChange={(e) => setEditFields((f) => f ? { ...f, url: e.target.value } : f)}
                          className="flex-1 h-9 px-3 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                          data-testid="input-queue-edit-url"
                        />
                        {editFields.url && (
                          <a
                            href={editFields.url.match(/^https?:\/\//) ? editFields.url : `https://${editFields.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center h-9 w-9 rounded-lg bg-black/[0.04] hover:bg-black/[0.07] transition-all shrink-0"
                            data-testid="button-open-url-tab"
                          >
                            <ExternalLink className="w-4 h-4 text-primary" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">Category</label>
                      <select
                        value={editFields.category}
                        onChange={(e) => setEditFields((f) => f ? { ...f, category: e.target.value } : f)}
                        className="h-9 px-3 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        data-testid="select-queue-edit-category"
                      >
                        {CATEGORIES.filter(c => c.value).map((cat) => (
                          <option key={cat.value} value={cat.value}>{cat.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {current.mention_type && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/[0.04] text-foreground/70">
                      <Tag className="w-3 h-3" /> {current.mention_type.replace(/_/g, " ")}
                    </span>
                  </div>
                )}

                <TranscriptContextPanel item={current} />
              </div>
            </div>
          </div>

          <div className="shrink-0 px-5 py-4 border-t border-black/[0.06] bg-white flex items-center gap-3" data-testid="queue-action-buttons">
            <button
              onClick={() => {
                const selectedImg = imageSearch.selectedIdx !== null ? imageSearch.images[imageSearch.selectedIdx] : undefined;
                const updates: any = {};
                if (editFields) {
                  if (editFields.name !== current.name) updates.name = editFields.name;
                  if (editFields.description !== (current.description || "")) updates.description = editFields.description;
                  if (editFields.url !== (current.url || "")) updates.url = editFields.url;
                  if (editFields.category !== (current.category || "")) updates.category = editFields.category;
                }
                approveMutation.mutate({ item: current, imageUrl: selectedImg, updates });
              }}
              disabled={approveMutation.isPending}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-all"
              data-testid="button-approve-product"
            >
              {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Approve
            </button>
            <button
              onClick={() => setShowRejectModal(true)}
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
      ) : null}

      {showRejectModal && current && (
        <RejectionModal
          onReject={(reason) => rejectMutation.mutate({ item: current, reason })}
          onCancel={() => setShowRejectModal(false)}
          isPending={rejectMutation.isPending}
        />
      )}
    </div>
  );
}

function ProductDetailPage({ item: initialItem, onBack }: { item: ShopItem; onBack: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "", url: "", imageUrl: "" });

  const { data: detailData } = useQuery<{ item: ShopItem }>({
    queryKey: ["/api/admin/shop/detail", initialItem.source_type, initialItem.id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/shop/${initialItem.source_type}/${initialItem.id}/detail`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const item = detailData?.item || initialItem;

  const updateMutation = useMutation({
    mutationFn: ({ updates }: { updates: any }) =>
      apiRequest("POST", `/api/admin/shop/${item.source_type}/${item.id}/update`, updates),
    onSuccess: () => {
      toast({ title: "Updated" });
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/detail", item.source_type, item.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/approved"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/admin/shop/${item.source_type}/${item.id}`),
    onSuccess: () => {
      toast({ title: "Deleted", description: "Product has been permanently deleted." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/approved"] });
      onBack();
    },
  });

  const moveToQueueMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/shop/${item.source_type}/${item.id}/move-to-queue`),
    onSuccess: () => {
      toast({ title: "Moved to queue", description: "Product moved back to approval queue." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/queue"] });
      onBack();
    },
  });

  const startEdit = () => {
    setEditing(true);
    setEditForm({
      name: item.name || "",
      description: item.description || "",
      url: item.url || "",
      imageUrl: item.image_url || "",
    });
  };

  const saveEdit = () => {
    const updates: any = {};
    if (editForm.name !== item.name) updates.name = editForm.name;
    if (editForm.description !== (item.description || "")) updates.description = editForm.description;
    if (editForm.url !== (item.url || "")) updates.url = editForm.url;
    if (editForm.imageUrl !== (item.image_url || "")) updates.imageUrl = editForm.imageUrl;
    if (Object.keys(updates).length === 0) {
      setEditing(false);
      return;
    }
    updateMutation.mutate({ updates });
  };

  const episodeUrl = item.episode_slug && item.podcast_slug
    ? `/${item.podcast_slug}/${item.episode_slug}`
    : null;

  return (
    <div className="space-y-5" data-testid="section-product-detail">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
        data-testid="button-back-to-approved"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Approved Products
      </button>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-6 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8">
          <div className="space-y-4">
            <div className="w-[300px] h-[300px] bg-gray-50 rounded-xl border border-black/[0.06] overflow-hidden flex items-center justify-center mx-auto">
              {editing ? (
                <>
                  {editForm.imageUrl ? (
                    <img src={editForm.imageUrl} alt={item.name} className="w-full h-full object-contain p-2" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
                  )}
                </>
              ) : item.image_url ? (
                <img src={item.image_url} alt={item.name} className="w-full h-full object-contain p-2" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
              )}
            </div>

            {editing && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Image URL</label>
                <input
                  type="text"
                  value={editForm.imageUrl}
                  onChange={(e) => setEditForm((f) => ({ ...f, imageUrl: e.target.value }))}
                  className="w-full h-9 px-3 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  data-testid="input-detail-edit-image"
                />
              </div>
            )}
          </div>

          <div className="space-y-4">
            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full h-10 px-3 bg-white border border-black/[0.08] rounded-lg text-base font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20"
                    data-testid="input-detail-edit-name"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Description</label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    rows={4}
                    className="w-full px-3 py-2 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                    data-testid="input-detail-edit-description"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">URL</label>
                  <input
                    type="text"
                    value={editForm.url}
                    onChange={(e) => setEditForm((f) => ({ ...f, url: e.target.value }))}
                    className="w-full h-9 px-3 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    data-testid="input-detail-edit-url"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveEdit}
                    disabled={updateMutation.isPending}
                    className="flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-bold bg-primary text-white hover:brightness-105 disabled:opacity-40 transition-all"
                    data-testid="button-save-detail-edit"
                  >
                    {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="h-9 px-4 rounded-lg text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-black/[0.04] transition-all"
                    data-testid="button-cancel-detail-edit"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-foreground" data-testid="text-detail-product-name">{item.name}</h2>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${getCategoryColor(item.category)}`}>
                      {getCategoryLabel(item.category)}
                    </span>
                  </div>
                  {item.company && (
                    <p className="text-sm text-muted-foreground mt-1">by {item.company}</p>
                  )}
                </div>

                {item.description && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                      <FileText className="w-3 h-3" /> Description
                    </label>
                    <p className="text-sm text-foreground leading-relaxed">{item.description}</p>
                  </div>
                )}

                {item.url && (
                  <a
                    href={item.url.match(/^https?:\/\//) ? item.url : `https://${item.url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-semibold transition-colors"
                    data-testid="link-detail-product-url"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {item.url.length > 60 ? item.url.substring(0, 60) + "..." : item.url}
                  </a>
                )}
              </>
            )}

            {(item.episode_title || episodeUrl) && (
              <div className="pt-2 border-t border-black/[0.06]">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-2">
                  <Mic className="w-3 h-3" /> Source Episode
                </label>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {episodeUrl ? (
                    <a
                      href={episodeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/5 text-primary font-semibold hover:bg-primary/10 transition-colors"
                      data-testid="link-detail-episode"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {item.episode_title || "View Episode"}
                    </a>
                  ) : (
                    <span className="px-3 py-1.5 rounded-lg bg-black/[0.04] text-foreground/70">{item.episode_title}</span>
                  )}
                  {item.podcast_slug && (
                    <span className="px-2 py-1 rounded bg-primary/5 text-primary font-semibold">{item.podcast_slug}</span>
                  )}
                </div>
              </div>
            )}

            {(item.approved_by || item.approved_at) && (
              <div className="pt-2 border-t border-black/[0.06]">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                  <CheckCircle2 className="w-3 h-3" /> Approval Info
                </label>
                <p className="text-sm text-foreground" data-testid="text-approval-info">
                  {item.approved_by && <span>Approved by <strong>{item.approved_by}</strong></span>}
                  {item.approved_at && <span> on {new Date(item.approved_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
                </p>
              </div>
            )}

            {item.context && (
              <TranscriptContextPanel item={item} />
            )}

            {!editing && (
              <div className="flex items-center gap-3 pt-4 border-t border-black/[0.06]">
                <button
                  onClick={startEdit}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-black/[0.04] hover:bg-black/[0.07] transition-all"
                  data-testid="button-edit-detail"
                >
                  <Pencil className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => moveToQueueMutation.mutate()}
                  disabled={moveToQueueMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-all"
                  data-testid="button-move-to-queue"
                >
                  {moveToQueueMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftCircle className="w-4 h-4" />}
                  Move to Queue
                </button>
                <button
                  onClick={() => {
                    if (confirm("Are you sure you want to permanently delete this product?")) {
                      deleteMutation.mutate();
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-all"
                  data-testid="button-delete-product"
                >
                  {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ApprovedProducts() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortBy, setSortBy] = useState("alphabetical");
  const [selectedItem, setSelectedItem] = useState<ShopItem | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  };

  const { data, isLoading } = useQuery<ApprovedResponse>({
    queryKey: ["/api/admin/shop/approved", debouncedSearch, categoryFilter, sortBy],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (categoryFilter) params.set("category", categoryFilter);
      if (sortBy) params.set("sort", sortBy);
      const res = await fetch(`/api/admin/shop/approved?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const items = data?.items || [];

  if (selectedItem) {
    return (
      <ProductDetailPage
        item={selectedItem}
        onBack={() => setSelectedItem(null)}
      />
    );
  }

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
            {data?.total || 0} products live on the shop.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full h-10 pl-10 pr-4 bg-white border border-black/[0.08] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30"
            data-testid="input-search-approved"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-10 pl-8 pr-4 bg-white border border-black/[0.08] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
              data-testid="select-approved-category"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-10 pl-8 pr-4 bg-white border border-black/[0.08] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
              data-testid="select-approved-sort"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <SortAsc className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center">
          <Package className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {search || categoryFilter ? "No products match your filters." : "No approved products yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={`${item.source_type}-${item.id}`}
              className="glass-panel rounded-xl p-4 hover:shadow-sm transition-all cursor-pointer"
              onClick={() => setSelectedItem(item)}
              data-testid={`approved-item-${item.source_type}-${item.id}`}
            >
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
                      <span className="text-primary truncate max-w-[200px]">
                        {item.url.replace(/^https?:\/\/(www\.)?/, "").substring(0, 40)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-primary bg-primary/5 hover:bg-primary/10 transition-all shrink-0"
                  data-testid={`button-view-product-${item.source_type}-${item.id}`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  View
                </button>
              </div>
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
