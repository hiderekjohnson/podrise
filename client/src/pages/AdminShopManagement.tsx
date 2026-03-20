import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Search, BookOpen, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  ImageIcon, Upload, ExternalLink, Pencil,
  SkipForward, Eye, Save, RefreshCw, AlertCircle, Clock, Trash2, ArrowLeft,
  ArrowLeftCircle, SortAsc, ChevronDown, Star, Hash, Building, Calendar,
  Tag, Mic, FileText, Headphones
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

interface BookFullDetail {
  book: {
    id: number;
    title: string;
    author: string | null;
    description: string | null;
    amazonUrl: string | null;
    slug: string | null;
    coverUrl: string | null;
    status: string;
    publisher: string | null;
    publishYear: number | null;
    rating: number | null;
    isbn: string | null;
    topics: string[];
    categories: string[];
    createdAt: string | null;
    updatedAt: string | null;
  };
  episodes: {
    podcastSlug: string;
    podcastName: string;
    episodeSlug: string;
    episodeTitle: string;
    context: string;
    publishedAt: string | null;
  }[];
  podcasts: {
    slug: string;
    name: string;
    episodeCount: number;
  }[];
  totalMentions: number;
  totalPodcasts: number;
}

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
];

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
        <h3 className="text-lg font-bold text-foreground">Reject Book</h3>
        <p className="text-sm text-muted-foreground">Select a reason for rejecting this book.</p>
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

function ApprovalQueue({ onViewBook }: { onViewBook: (id: number) => void }) {
  const { toast } = useToast();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageSearch, setImageSearch] = useState<{ loading: boolean; images: string[]; selectedIdx: number | null }>({ loading: false, images: [], selectedIdx: null });
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [editFields, setEditFields] = useState<{ name: string; description: string; url: string } | null>(null);
  const [queueSort, setQueueSort] = useState("recent");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, refetch } = useQuery<QueueResponse>({
    queryKey: ["/api/admin/shop/queue", 1, queueSort],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (queueSort) params.set("sort", queueSort);
      const res = await fetch(`/api/admin/shop/queue?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const items = data?.items || [];
  const stats = data?.stats;
  const current = items[currentIndex];

  useEffect(() => {
    if (current) {
      resetImageState();
    }
  }, [current?.id]);

  useEffect(() => {
    if (current) {
      setEditFields({
        name: current.name || "",
        description: current.description || "",
        url: current.url || "",
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
      toast({ title: "Approved", description: "Book moved to approved." });
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
      toast({ title: "Rejected", description: "Book has been rejected." });
      setShowRejectModal(false);
      resetImageState();
      setCurrentIndex((i) => {
        const newLen = (data?.items?.length || 1) - 1;
        return Math.min(i, Math.max(0, newLen - 1));
      });
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
    setEditFields(null);
  };

  const findImages = useCallback(async (item: ShopItem) => {
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
            Review and approve books before they go live on the shop.
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

      <div className="flex items-center justify-end" data-testid="queue-sort-controls">
        <div className="relative">
          <select
            value={queueSort}
            onChange={(e) => { setQueueSort(e.target.value); setCurrentIndex(0); resetImageState(); }}
            className="h-8 pl-7 pr-3 bg-white border border-black/[0.08] rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
            data-testid="select-queue-sort"
          >
            <option value="recent">Recently Added</option>
            <option value="alphabetical">Alphabetical</option>
          </select>
          <SortAsc className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {items.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <p className="text-base font-bold text-foreground">All caught up!</p>
          <p className="text-sm text-muted-foreground mt-1">No pending books to review.</p>
        </div>
      ) : current ? (
        <div className="glass-panel rounded-2xl overflow-hidden flex flex-col" style={{ height: "calc(100vh - 320px)", minHeight: "500px" }} data-testid={`queue-item-${current.id}`}>
          <div className="flex items-center justify-between px-5 py-3 bg-black/[0.02] border-b border-black/[0.06] shrink-0">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-bold text-foreground">{currentIndex + 1} of {items.length}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700">
                Book
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={goPrev} disabled={currentIndex === 0} className="p-1.5 rounded-lg hover:bg-black/[0.05] disabled:opacity-30 transition-all" data-testid="button-queue-prev">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => onViewBook(current.id)} className="p-1.5 rounded-lg hover:bg-black/[0.05] transition-all text-primary" data-testid="button-queue-view-detail" title="View full detail">
                <Eye className="w-4 h-4" />
              </button>
              <button onClick={goNext} disabled={currentIndex >= items.length - 1} className="p-1.5 rounded-lg hover:bg-black/[0.05] disabled:opacity-30 transition-all" data-testid="button-queue-next">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
              <div className="space-y-3">
                <p className="text-[10px] text-muted-foreground text-center font-semibold uppercase tracking-wide">Cover Preview</p>
                <div className="w-[200px] aspect-[3/4] bg-gray-50 rounded-xl border border-black/[0.06] overflow-hidden flex items-center justify-center mx-auto p-3">
                  {(imageSearch.selectedIdx !== null && imageSearch.images[imageSearch.selectedIdx]) ? (
                    <img
                      src={imageSearch.images[imageSearch.selectedIdx]}
                      alt={current.name}
                      className="w-full h-full object-contain"
                    />
                  ) : current.image_url ? (
                    <img
                      src={current.image_url}
                      alt={current.name}
                      className="w-full h-full object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="text-center p-4">
                      <ImageIcon className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">No cover</p>
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
                    Google Books Lookup
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

                {imageSearch.loading && (
                  <div className="border border-black/[0.08] rounded-xl p-3 flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!imageSearch.loading && imageSearch.images.length > 0 && (
                  <div className="border border-black/[0.08] rounded-xl p-3 space-y-2">
                    <span className="text-xs font-bold text-foreground">Google Books Result</span>
                    <div className="flex justify-center">
                      <button
                        onClick={() => setImageSearch((s) => ({ ...s, selectedIdx: 0 }))}
                        className={`w-[120px] aspect-[3/4] rounded-lg border-2 overflow-hidden transition-all ${
                          imageSearch.selectedIdx === 0 ? "border-primary ring-2 ring-primary/20" : "border-black/[0.08] hover:border-black/[0.15]"
                        }`}
                        data-testid="image-candidate-0"
                      >
                        <img src={imageSearch.images[0]} alt="" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.2"; }} />
                      </button>
                    </div>
                  </div>
                )}
                {!imageSearch.loading && imageSearch.images.length === 0 && imageSearch.selectedIdx === null && currentIndex >= 0 && (
                  <p className="text-xs text-muted-foreground text-center">Click "Google Books Lookup" to find a cover.</p>
                )}
              </div>

              <div className="space-y-4">
                {editFields && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">Title</label>
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
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">Amazon URL</label>
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
                  </div>
                )}
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

function BookDetailPage({ bookId, onBack }: { bookId: number; onBack: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "", url: "", imageUrl: "" });

  const { data, isLoading, isError } = useQuery<BookFullDetail>({
    queryKey: ["/api/admin/shop/book/full-detail", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/shop/book/${bookId}/full-detail`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const book = data?.book;
  const episodes = data?.episodes || [];
  const podcasts = data?.podcasts || [];

  const updateMutation = useMutation({
    mutationFn: ({ updates }: { updates: any }) =>
      apiRequest("POST", `/api/admin/shop/book/${bookId}/update`, updates),
    onSuccess: () => {
      toast({ title: "Updated" });
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/book/full-detail", bookId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/approved"] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/shop/book/${bookId}/approve`),
    onSuccess: () => {
      toast({ title: "Approved", description: "Book has been approved." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/book/full-detail", bookId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/queue"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ reason }: { reason: string }) =>
      apiRequest("POST", `/api/admin/shop/book/${bookId}/reject`, { reason }),
    onSuccess: () => {
      toast({ title: "Rejected", description: "Book has been rejected." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/book/full-detail", bookId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/queue"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/admin/shop/book/${bookId}`),
    onSuccess: () => {
      toast({ title: "Deleted", description: "Book has been permanently deleted." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/queue"] });
      onBack();
    },
  });

  const moveToQueueMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/shop/book/${bookId}/move-to-queue`),
    onSuccess: () => {
      toast({ title: "Moved to queue", description: "Book moved back to approval queue." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/book/full-detail", bookId] });
    },
  });

  const startEdit = () => {
    if (!book) return;
    setEditing(true);
    setEditForm({
      name: book.title || "",
      description: book.description || "",
      url: book.amazonUrl || "",
      imageUrl: book.coverUrl || "",
    });
  };

  const saveEdit = () => {
    if (!book) return;
    const updates: any = {};
    if (editForm.name !== book.title) updates.name = editForm.name;
    if (editForm.description !== (book.description || "")) updates.description = editForm.description;
    if (editForm.url !== (book.amazonUrl || "")) updates.url = editForm.url;
    if (editForm.imageUrl !== (book.coverUrl || "")) updates.imageUrl = editForm.imageUrl;
    if (Object.keys(updates).length === 0) {
      setEditing(false);
      return;
    }
    updateMutation.mutate({ updates });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !book) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors" data-testid="button-back-to-list">
          <ArrowLeft className="w-4 h-4" /> Back to Books
        </button>
        <div className="glass-panel rounded-2xl p-8 text-center">
          <p className="text-sm text-muted-foreground">Book not found.</p>
        </div>
      </div>
    );
  }

  const statusColor = book.status === "approved" ? "bg-green-100 text-green-700" : book.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";

  return (
    <div className="space-y-5" data-testid="section-book-detail">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
        data-testid="button-back-to-list"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Books
      </button>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
          <div className="space-y-4">
            <div className="w-[260px] h-[360px] bg-gray-50 rounded-xl border border-black/[0.06] overflow-hidden flex items-center justify-center mx-auto">
              {editing ? (
                <>
                  {editForm.imageUrl ? (
                    <img src={editForm.imageUrl} alt={book.title} className="w-full h-full object-contain p-2" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
                  )}
                </>
              ) : book.coverUrl ? (
                <img src={book.coverUrl} alt={book.title} className="w-full h-full object-contain p-2" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="text-center p-4">
                  <BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No cover image</p>
                </div>
              )}
            </div>

            {editing && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Cover Image URL</label>
                <input
                  type="text"
                  value={editForm.imageUrl}
                  onChange={(e) => setEditForm((f) => ({ ...f, imageUrl: e.target.value }))}
                  className="w-full h-9 px-3 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  data-testid="input-detail-edit-image"
                />
              </div>
            )}

            <div className="space-y-2 text-xs">
              {book.publisher && (
                <div className="flex items-center gap-2 text-foreground/70">
                  <Building className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span data-testid="text-book-publisher">{book.publisher}</span>
                </div>
              )}
              {book.publishYear && (
                <div className="flex items-center gap-2 text-foreground/70">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span data-testid="text-book-year">{book.publishYear}</span>
                </div>
              )}
              {book.rating && (
                <div className="flex items-center gap-2 text-foreground/70">
                  <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span data-testid="text-book-rating">{book.rating}</span>
                </div>
              )}
              {book.isbn && (
                <div className="flex items-center gap-2 text-foreground/70">
                  <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span data-testid="text-book-isbn">ISBN: {book.isbn}</span>
                </div>
              )}
              {book.slug && (
                <div className="flex items-center gap-2 text-foreground/70">
                  <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span data-testid="text-book-slug" className="truncate">slug: {book.slug}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Title</label>
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
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Amazon URL</label>
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
                    <h2 className="text-xl font-bold text-foreground" data-testid="text-detail-book-title">{book.title}</h2>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${statusColor}`}>
                      {book.status}
                    </span>
                  </div>
                  {book.author && (
                    <p className="text-sm text-muted-foreground mt-1" data-testid="text-detail-book-author">by {book.author}</p>
                  )}
                </div>

                {book.description && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                      <FileText className="w-3 h-3" /> Description
                    </label>
                    <p className="text-sm text-foreground leading-relaxed" data-testid="text-detail-book-description">{book.description}</p>
                  </div>
                )}

                {book.amazonUrl && (
                  <a
                    href={book.amazonUrl.match(/^https?:\/\//) ? book.amazonUrl : `https://${book.amazonUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-semibold transition-colors"
                    data-testid="link-detail-book-amazon"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View on Amazon
                  </a>
                )}

                {book.topics && book.topics.length > 0 && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-2">
                      <Tag className="w-3 h-3" /> Topics
                    </label>
                    <div className="flex flex-wrap gap-1.5" data-testid="list-book-topics">
                      {book.topics.map((topic, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-md text-xs font-medium bg-primary/5 text-primary/80">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="pt-3 border-t border-black/[0.06]">
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Headphones className="w-4 h-4 text-primary" />
                  Podcast Mentions
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary" data-testid="text-mention-count">
                  {data?.totalMentions || 0} episodes across {data?.totalPodcasts || 0} podcasts
                </span>
              </div>

              {podcasts.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3" data-testid="list-podcast-mentions">
                  {podcasts.map((p) => (
                    <a
                      key={p.slug}
                      href={`/${p.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/[0.04] text-xs font-semibold text-foreground/80 hover:bg-black/[0.07] transition-all"
                      data-testid={`link-podcast-${p.slug}`}
                    >
                      <Mic className="w-3 h-3 text-primary" />
                      {p.name}
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold">{p.episodeCount}</span>
                    </a>
                  ))}
                </div>
              )}

              {episodes.length > 0 ? (
                <div className="space-y-2 max-h-[400px] overflow-y-auto" data-testid="list-episode-mentions">
                  {episodes.map((ep, idx) => (
                    <div key={`${ep.podcastSlug}-${ep.episodeSlug}`} className="border border-black/[0.06] rounded-lg p-3 hover:bg-black/[0.01] transition-all" data-testid={`episode-mention-${idx}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <a
                            href={`/${ep.podcastSlug}/${ep.episodeSlug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold text-foreground hover:text-primary transition-colors line-clamp-1"
                            data-testid={`link-episode-${idx}`}
                          >
                            {ep.episodeTitle}
                          </a>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                            <span className="font-medium text-primary/70">{ep.podcastName}</span>
                            {ep.publishedAt && (
                              <span>{new Date(ep.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                            )}
                          </div>
                        </div>
                        <a
                          href={`/${ep.podcastSlug}/${ep.episodeSlug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg hover:bg-black/[0.05] shrink-0 transition-all"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                        </a>
                      </div>
                      {ep.context && (
                        <p className="text-xs text-foreground/60 mt-1.5 line-clamp-2">{ep.context}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic py-2" data-testid="text-no-mentions">No podcast mentions found for this book.</p>
              )}
            </div>

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
                {book.status === "pending" && (
                  <button
                    onClick={() => approveMutation.mutate()}
                    disabled={approveMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-all"
                    data-testid="button-approve-book"
                  >
                    {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Approve
                  </button>
                )}
                {book.status === "pending" && (
                  <button
                    onClick={() => rejectMutation.mutate({ reason: "not_relevant" })}
                    disabled={rejectMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-all"
                    data-testid="button-reject-book"
                  >
                    {rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    Reject
                  </button>
                )}
                {book.status === "approved" && (
                  <button
                    onClick={() => moveToQueueMutation.mutate()}
                    disabled={moveToQueueMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-all"
                    data-testid="button-move-to-queue"
                  >
                    {moveToQueueMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftCircle className="w-4 h-4" />}
                    Move to Queue
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm("Are you sure you want to permanently delete this book?")) {
                      deleteMutation.mutate();
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-all"
                  data-testid="button-delete-book"
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

function ApprovedBooks({ onViewBook }: { onViewBook: (id: number) => void }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("alphabetical");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  };

  const { data, isLoading } = useQuery<ApprovedResponse>({
    queryKey: ["/api/admin/shop/approved", debouncedSearch, sortBy],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (sortBy) params.set("sort", sortBy);
      const res = await fetch(`/api/admin/shop/approved?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const items = data?.items || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="section-approved-books">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground">Approved Books</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data?.total || 0} books live on the shop.
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
            placeholder="Search books..."
            className="w-full h-10 pl-10 pr-4 bg-white border border-black/[0.08] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30"
            data-testid="input-search-approved"
          />
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

      {items.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center">
          <BookOpen className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {search ? "No books match your search." : "No approved books yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={`book-${item.id}`}
              className="glass-panel rounded-xl p-4 hover:shadow-sm transition-all cursor-pointer"
              onClick={() => onViewBook(item.id)}
              data-testid={`approved-item-book-${item.id}`}
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-lg bg-gray-50 border border-black/[0.06] overflow-hidden shrink-0 flex items-center justify-center">
                  {item.image_url ? (
                    <img src={item.image_url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <BookOpen className="w-5 h-5 text-muted-foreground/30" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate" data-testid={`text-approved-name-${item.id}`}>
                      {item.name}
                    </p>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shrink-0 bg-emerald-100 text-emerald-700">
                      Book
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    {item.company && <span>{item.company}</span>}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onViewBook(item.id); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-primary bg-primary/5 hover:bg-primary/10 transition-all shrink-0"
                  data-testid={`button-view-book-${item.id}`}
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

export default function AdminShopManagement({ bookId: initialBookId }: { bookId?: number }) {
  const [subTab, setSubTab] = useState<"queue" | "approved">("queue");
  const [selectedBookId, setSelectedBookId] = useState<number | null>(initialBookId || null);

  useEffect(() => {
    if (initialBookId) {
      setSelectedBookId(initialBookId);
    } else {
      setSelectedBookId(null);
    }
  }, [initialBookId]);

  useEffect(() => {
    const handlePopState = () => {
      const match = window.location.pathname.match(/\/admin\/shop\/book\/(\d+)/);
      setSelectedBookId(match ? parseInt(match[1], 10) : null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleViewBook = (id: number) => {
    setSelectedBookId(id);
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', `/admin/shop/book/${id}`);
    }
  };

  const handleBackToList = () => {
    setSelectedBookId(null);
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/admin/shop');
    }
  };

  if (selectedBookId) {
    return (
      <div className="space-y-5" data-testid="section-shop-management">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Book Management</h2>
        </div>
        <BookDetailPage bookId={selectedBookId} onBack={handleBackToList} />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="section-shop-management">
      <div className="flex items-center gap-2 mb-1">
        <BookOpen className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Book Management</h2>
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

      {subTab === "queue" && <ApprovalQueue onViewBook={handleViewBook} />}
      {subTab === "approved" && <ApprovedBooks onViewBook={handleViewBook} />}
    </div>
  );
}
