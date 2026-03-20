import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Search, BookOpen, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  ImageIcon, Upload, ExternalLink, Pencil,
  SkipForward, Eye, Save, RefreshCw, AlertCircle, Clock, Trash2, ArrowLeft,
  ArrowLeftCircle, SortAsc, ChevronDown, Star, Hash, Building, Calendar,
  Tag, Mic, FileText, Headphones, MousePointerClick, Bookmark, CheckSquare, Square
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
  podcast_count?: number;
  save_count?: number;
  isbn?: string | null;
  google_books_id?: string | null;
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
  { value: "podcasts_desc", label: "Most Podcasts" },
  { value: "podcasts_asc", label: "Fewest Podcasts" },
  { value: "clicks_desc", label: "Most Clicks" },
  { value: "clicks_asc", label: "Fewest Clicks" },
  { value: "saves_desc", label: "Most Saves" },
  { value: "saves_asc", label: "Fewest Saves" },
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
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showRejectModal, setShowRejectModal] = useState<number | null>(null);
  const [queueSort, setQueueSort] = useState("recent");
  const [queueFilter, setQueueFilter] = useState("");
  const [imageRefreshProgress, setImageRefreshProgress] = useState<{
    phase: "running" | "done";
    total: number;
    processed: number;
    updated: number;
    noImage: number;
    current: string;
  } | null>(null);

  const { data, isLoading } = useQuery<QueueResponse>({
    queryKey: ["/api/admin/shop/queue", 1, queueSort, queueFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (queueSort) params.set("sort", queueSort);
      if (queueFilter) params.set("filter", queueFilter);
      const res = await fetch(`/api/admin/shop/queue?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const items = data?.items || [];
  const stats = data?.stats;

  useEffect(() => {
    if (items.length > 0) {
      const validIds = new Set(items.map(i => i.id));
      setSelectedIds(prev => {
        const next = new Set([...prev].filter(id => validIds.has(id)));
        return next.size !== prev.size ? next : prev;
      });
    } else {
      setSelectedIds(new Set());
    }
  }, [items]);

  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: number[]) => apiRequest("POST", "/api/admin/shop/bulk-approve", { ids }),
    onSuccess: async (res: Response) => {
      const result: { approved: number } = await res.json();
      toast({ title: "Bulk Approved", description: `Approved ${result.approved} book${result.approved !== 1 ? 's' : ''}.` });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/approved"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to bulk approve.", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ item, reason }: { item: ShopItem; reason: string }) =>
      apiRequest("POST", `/api/admin/shop/${item.source_type}/${item.id}/reject`, { reason }),
    onSuccess: () => {
      toast({ title: "Rejected", description: "Book has been rejected." });
      setShowRejectModal(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/queue"] });
    },
  });

  const cleanDuplicatesMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/shop/clean-queue-duplicates"),
    onSuccess: async (res: Response) => {
      const result: { removed: number } = await res.json();
      const count = result.removed || 0;
      toast({ title: "Queue Cleaned", description: `Removed ${count} duplicate${count !== 1 ? 's' : ''} from the queue.` });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/queue"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to clean duplicates.", variant: "destructive" });
    },
  });

  const handleRefreshImages = async () => {
    setImageRefreshProgress({ phase: "running", total: 0, processed: 0, updated: 0, noImage: 0, current: "" });
    try {
      const res = await fetch("/api/admin/shop/refresh-queue-images", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No stream");
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "start") {
              setImageRefreshProgress(prev => prev ? { ...prev, total: event.total } : prev);
            } else if (event.type === "progress") {
              setImageRefreshProgress(prev => prev ? { ...prev, processed: event.processed, updated: event.updated, noImage: event.noImage, current: event.current } : prev);
            } else if (event.type === "complete") {
              setImageRefreshProgress(prev => prev ? { ...prev, phase: "done", processed: event.total, updated: event.updated, noImage: event.noImage } : prev);
            }
          } catch {}
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/queue"] });
    } catch {
      toast({ title: "Error", description: "Image refresh failed.", variant: "destructive" });
      setImageRefreshProgress(null);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(i => i.id)));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const rejectItem = showRejectModal !== null ? items.find(i => i.id === showRejectModal) : null;

  return (
    <div className={`space-y-5 ${selectedIds.size > 0 ? "pb-20" : ""}`} data-testid="section-approval-queue">
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

      <div className="flex items-center justify-between flex-wrap gap-2" data-testid="queue-sort-controls">
        <div className="flex items-center gap-2">
          <button
            onClick={() => cleanDuplicatesMutation.mutate()}
            disabled={cleanDuplicatesMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-orange-700 bg-orange-50 hover:bg-orange-100 transition-all disabled:opacity-50"
            data-testid="button-clean-queue-duplicates"
          >
            {cleanDuplicatesMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            {cleanDuplicatesMutation.isPending ? "Cleaning..." : "Clean Duplicates"}
          </button>
          <button
            onClick={handleRefreshImages}
            disabled={!!imageRefreshProgress && imageRefreshProgress.phase === "running"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-all disabled:opacity-50"
            data-testid="button-refresh-queue-images"
          >
            {imageRefreshProgress?.phase === "running" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {imageRefreshProgress?.phase === "running" ? "Refreshing..." : "Refresh Images"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={queueFilter}
              onChange={(e) => { setQueueFilter(e.target.value); setSelectedIds(new Set()); }}
              className="h-8 pl-7 pr-3 bg-white border border-black/[0.08] rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
              data-testid="select-queue-filter"
            >
              <option value="">All Books</option>
              <option value="no_isbn">Missing ISBN</option>
              <option value="no_google_id">Missing Google ID</option>
              <option value="no_isbn_or_google_id">Missing Both</option>
            </select>
            <AlertCircle className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={queueSort}
              onChange={(e) => { setQueueSort(e.target.value); setSelectedIds(new Set()); }}
              className="h-8 pl-7 pr-3 bg-white border border-black/[0.08] rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
              data-testid="select-queue-sort"
            >
              <option value="recent">Recently Added</option>
              <option value="alphabetical">Alphabetical</option>
            </select>
            <SortAsc className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      {imageRefreshProgress && (
        <div className="rounded-xl border border-black/[0.06] bg-white p-4" data-testid="image-refresh-progress">
          <div className="flex items-center gap-3 mb-2">
            {imageRefreshProgress.phase === "done" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            )}
            <span className="text-sm font-bold text-foreground">
              {imageRefreshProgress.phase === "done" ? "Image Refresh Complete" : "Refreshing Images from Google Books..."}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${imageRefreshProgress.total > 0 ? Math.round((imageRefreshProgress.processed / imageRefreshProgress.total) * 100) : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{imageRefreshProgress.processed} of {imageRefreshProgress.total} processed</span>
            <span className="flex items-center gap-3">
              <span className="text-emerald-600 font-semibold">{imageRefreshProgress.updated} updated</span>
              <span className="text-gray-500">{imageRefreshProgress.noImage} no image</span>
            </span>
          </div>
          {imageRefreshProgress.current && imageRefreshProgress.phase === "running" && (
            <p className="text-xs text-muted-foreground mt-1 truncate">Current: {imageRefreshProgress.current}</p>
          )}
          {imageRefreshProgress.phase === "done" && (
            <button
              onClick={() => setImageRefreshProgress(null)}
              className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-primary hover:bg-primary/90 transition-all"
              data-testid="button-refresh-done"
            >
              Done
            </button>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <p className="text-base font-bold text-foreground">All caught up!</p>
          <p className="text-sm text-muted-foreground mt-1">No pending books to review.</p>
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-black/[0.06] -mx-1 px-1 py-3" data-testid="bulk-action-bar">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="flex items-center gap-2 cursor-pointer select-none" data-testid="checkbox-select-all">
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center justify-center w-6 h-6 rounded-md border-2 border-black/[0.15] hover:border-primary/50 transition-all"
                >
                  {selectedIds.size === items.length && items.length > 0 ? (
                    <CheckSquare className="w-5 h-5 text-primary" />
                  ) : selectedIds.size > 0 ? (
                    <div className="w-3 h-3 rounded-sm bg-primary/60" />
                  ) : null}
                </button>
                <span className="text-sm font-semibold text-muted-foreground">
                  {selectedIds.size === items.length && items.length > 0 ? "Deselect All" : "Select All"} ({items.length})
                </span>
              </label>
              {selectedIds.size > 0 && (
                <button
                  onClick={() => bulkApproveMutation.mutate(Array.from(selectedIds))}
                  disabled={bulkApproveMutation.isPending}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-all shadow-md"
                  data-testid="button-bulk-approve"
                >
                  {bulkApproveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Approve Selected ({selectedIds.size})
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {items.map((item) => (
              <div
                key={`queue-${item.id}`}
                className={`glass-panel rounded-xl overflow-hidden transition-all hover:shadow-md ${selectedIds.has(item.id) ? "ring-2 ring-primary/40" : ""}`}
                data-testid={`queue-item-${item.id}`}
              >
                <div className="relative">
                  <div className="w-full aspect-[3/4] bg-gray-50 flex items-center justify-center overflow-hidden">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="text-center p-4">
                        <ImageIcon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-1" />
                        <p className="text-[10px] text-muted-foreground">No cover</p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }}
                    className="absolute top-2 left-2 flex items-center justify-center w-6 h-6 rounded-md bg-white/90 border border-black/[0.1] hover:border-primary/50 transition-all shadow-sm"
                    data-testid={`checkbox-queue-${item.id}`}
                  >
                    {selectedIds.has(item.id) ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4 text-muted-foreground/40" />
                    )}
                  </button>
                </div>
                <div className="p-3 space-y-2">
                  <p className="text-sm font-semibold text-foreground line-clamp-2 leading-tight" data-testid={`text-queue-name-${item.id}`}>
                    {item.name}
                  </p>
                  {item.company && (
                    <p className="text-xs text-muted-foreground truncate">{item.company}</p>
                  )}
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      onClick={() => onViewBook(item.id)}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold text-primary bg-primary/5 hover:bg-primary/10 transition-all"
                      data-testid={`button-queue-view-${item.id}`}
                    >
                      <Eye className="w-3 h-3" />
                      View
                    </button>
                    <button
                      onClick={() => setShowRejectModal(item.id)}
                      className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-all"
                      data-testid={`button-queue-reject-${item.id}`}
                    >
                      <XCircle className="w-3 h-3" />
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedIds.size > 0 && (
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-green-600 text-white py-3 px-4 sm:px-6 shadow-lg" data-testid="fixed-bottom-approve-bar">
              <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  {selectedIds.size} book{selectedIds.size !== 1 ? "s" : ""} selected
                </span>
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold bg-white/20 hover:bg-white/30 transition-all"
                    data-testid="button-bottom-clear-selection"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => bulkApproveMutation.mutate(Array.from(selectedIds))}
                    disabled={bulkApproveMutation.isPending}
                    className="flex items-center gap-2 px-4 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-bold bg-white text-green-700 hover:bg-green-50 disabled:opacity-50 transition-all shadow-sm"
                    data-testid="button-bottom-bulk-approve"
                  >
                    {bulkApproveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Approve ({selectedIds.size})
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {rejectItem && (
        <RejectionModal
          onReject={(reason) => rejectMutation.mutate({ item: rejectItem, reason })}
          onCancel={() => setShowRejectModal(null)}
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
                            href={`/podcasts/${ep.podcastSlug}/${ep.episodeSlug}`}
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
                          href={`/podcasts/${ep.podcastSlug}/${ep.episodeSlug}`}
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
  const [approvedFilter, setApprovedFilter] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const [buzzProgress, setBuzzProgress] = useState<{
    phase: "running" | "done";
    total: number;
    processed: number;
    errors: number;
    current: string;
  } | null>(null);

  const [bulkDeleteState, setBulkDeleteState] = useState<{
    phase: "idle" | "counting" | "confirm" | "deleting" | "done";
    count: number;
    deleted: number;
    error: string | null;
  }>({ phase: "idle", count: 0, deleted: 0, error: null });

  const handleBulkDeleteNoMentions = async () => {
    setBulkDeleteState({ phase: "counting", count: 0, deleted: 0, error: null });
    try {
      const res = await fetch("/api/admin/shop/books-no-mentions-count", { credentials: "include" });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || "Failed to fetch count");
      }
      const { count } = await res.json();
      if (count === 0) {
        toast({ title: "No Books Found", description: "There are no approved books with zero podcast mentions." });
        setBulkDeleteState({ phase: "idle", count: 0, deleted: 0, error: null });
        return;
      }
      setBulkDeleteState({ phase: "confirm", count, deleted: 0, error: null });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to count books.", variant: "destructive" });
      setBulkDeleteState({ phase: "idle", count: 0, deleted: 0, error: null });
    }
  };

  const confirmBulkDelete = async () => {
    setBulkDeleteState(prev => ({ ...prev, phase: "deleting" }));
    try {
      const res = await fetch("/api/admin/shop/bulk-delete-no-mentions", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || "Failed to delete");
      }
      const { deleted } = await res.json();
      setBulkDeleteState(prev => ({ ...prev, phase: "done", deleted }));
      toast({
        title: "Bulk Delete Complete",
        description: `Deleted ${deleted} book${deleted !== 1 ? 's' : ''} with no podcast mentions.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/approved"] });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Bulk delete failed.", variant: "destructive" });
      setBulkDeleteState(prev => ({ ...prev, phase: "idle", error: err?.message || "Failed" }));
    }
  };

  const { data: missingBuzzData } = useQuery<{ count: number }>({
    queryKey: ["/api/admin/books/missing-buzz-count"],
  });

  const handleGenerateBuzz = async () => {
    setBuzzProgress({ phase: "running", total: 0, processed: 0, errors: 0, current: "" });
    try {
      const res = await fetch("/api/admin/books/generate-podcast-buzz", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No stream");
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "start") {
              setBuzzProgress(prev => prev ? { ...prev, total: event.total } : prev);
            } else if (event.type === "progress") {
              setBuzzProgress(prev => prev ? { ...prev, processed: event.processed, total: event.total, current: event.current, errors: event.errors } : prev);
            } else if (event.type === "complete") {
              setBuzzProgress(prev => prev ? { ...prev, phase: "done", processed: event.processed, total: event.total, errors: event.errors } : prev);
              toast({
                title: "Buzz Generation Complete",
                description: `Generated buzz for ${event.processed - event.errors} book${event.processed - event.errors !== 1 ? 's' : ''}${event.errors > 0 ? `, ${event.errors} error${event.errors !== 1 ? 's' : ''}` : ''}.`,
              });
              queryClient.invalidateQueries({ queryKey: ["/api/admin/books/missing-buzz-count"] });
            } else if (event.type === "error") {
              toast({ title: "Error", description: event.message || "Buzz generation failed.", variant: "destructive" });
              setBuzzProgress(null);
              return;
            }
          } catch (parseErr) {
          }
        }
      }
      setBuzzProgress(prev => prev && prev.phase !== "done" ? { ...prev, phase: "done" } : prev);
    } catch {
      toast({ title: "Error", description: "Buzz generation failed.", variant: "destructive" });
      setBuzzProgress(null);
    }
  };

  const recalculateCountsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/shop/recalculate-book-counts"),
    onSuccess: async (res: Response) => {
      const result: { created: number; books_matched: number } = await res.json();
      toast({ title: "Counts Recalculated", description: `Created ${result.created} mention records for ${result.books_matched} books.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/approved"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to recalculate counts.", variant: "destructive" });
    },
  });

  const requeueNoCoverMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/shop/requeue-no-cover"),
    onSuccess: async (res: Response) => {
      const result: { requeued: number } = await res.json();
      const count = result.requeued || 0;
      toast({ title: "Books Requeued", description: `Sent ${count} book${count !== 1 ? 's' : ''} with missing covers back to the approval queue.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop/queue"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to requeue books.", variant: "destructive" });
    },
  });

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  };

  const { data, isLoading } = useQuery<ApprovedResponse>({
    queryKey: ["/api/admin/shop/approved", debouncedSearch, sortBy, approvedFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (sortBy) params.set("sort", sortBy);
      if (approvedFilter) params.set("filter", approvedFilter);
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
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateBuzz}
            disabled={!!buzzProgress && buzzProgress.phase === "running"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 transition-all disabled:opacity-50"
            data-testid="button-generate-missing-buzz"
          >
            {buzzProgress?.phase === "running" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Mic className="w-3.5 h-3.5" />
            )}
            {buzzProgress?.phase === "running" ? "Generating..." : "Generate Missing Buzz"}
            {missingBuzzData && missingBuzzData.count > 0 && !buzzProgress && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-purple-200 text-purple-800 text-[10px] font-bold" data-testid="badge-missing-buzz-count">
                {missingBuzzData.count}
              </span>
            )}
          </button>
          <button
            onClick={() => requeueNoCoverMutation.mutate()}
            disabled={requeueNoCoverMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 transition-all disabled:opacity-50"
            data-testid="button-requeue-no-cover"
          >
            {requeueNoCoverMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ImageIcon className="w-3.5 h-3.5" />
            )}
            {requeueNoCoverMutation.isPending ? "Requeuing..." : "Requeue Missing Covers"}
          </button>
          <button
            onClick={handleBulkDeleteNoMentions}
            disabled={bulkDeleteState.phase !== "idle" && bulkDeleteState.phase !== "done"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 transition-all disabled:opacity-50"
            data-testid="button-bulk-delete-no-mentions"
          >
            {bulkDeleteState.phase === "counting" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            {bulkDeleteState.phase === "counting" ? "Checking..." : "Delete Books With No Mentions"}
          </button>
          <button
            onClick={() => recalculateCountsMutation.mutate()}
            disabled={recalculateCountsMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-all disabled:opacity-50"
            data-testid="button-recalculate-book-counts"
          >
            {recalculateCountsMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {recalculateCountsMutation.isPending ? "Recalculating..." : "Recalculate Counts"}
          </button>
        </div>
      </div>

      {(bulkDeleteState.phase === "confirm" || bulkDeleteState.phase === "deleting" || bulkDeleteState.phase === "done") && (
        <div className="rounded-xl border border-black/[0.06] bg-white p-4" data-testid="bulk-delete-progress">
          {bulkDeleteState.phase === "confirm" && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="text-sm font-bold text-foreground">
                  {bulkDeleteState.count} book{bulkDeleteState.count !== 1 ? 's' : ''} have no podcast mentions
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                This will permanently delete these books from the shop. This action cannot be undone.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={confirmBulkDelete}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all"
                  data-testid="button-confirm-bulk-delete"
                >
                  Delete {bulkDeleteState.count} Book{bulkDeleteState.count !== 1 ? 's' : ''}
                </button>
                <button
                  onClick={() => setBulkDeleteState({ phase: "idle", count: 0, deleted: 0, error: null })}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all"
                  data-testid="button-cancel-bulk-delete"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {bulkDeleteState.phase === "deleting" && (
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-red-500" />
              <span className="text-sm font-bold text-foreground">Deleting books with no podcast mentions...</span>
            </div>
          )}
          {bulkDeleteState.phase === "done" && (
            <div>
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="text-sm font-bold text-foreground">
                  Deleted {bulkDeleteState.deleted} book{bulkDeleteState.deleted !== 1 ? 's' : ''} with no podcast mentions
                </span>
              </div>
              <button
                onClick={() => setBulkDeleteState({ phase: "idle", count: 0, deleted: 0, error: null })}
                className="mt-2 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-primary hover:bg-primary/90 transition-all"
                data-testid="button-bulk-delete-done"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}

      {buzzProgress && (
        <div className="rounded-xl border border-black/[0.06] bg-white p-4" data-testid="buzz-generation-progress">
          <div className="flex items-center gap-3 mb-2">
            {buzzProgress.phase === "done" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
            )}
            <span className="text-sm font-bold text-foreground">
              {buzzProgress.phase === "done" ? "Buzz Generation Complete" : "Generating Podcast Buzz..."}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
            <div
              className="bg-purple-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${buzzProgress.total > 0 ? Math.round((buzzProgress.processed / buzzProgress.total) * 100) : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{buzzProgress.processed} of {buzzProgress.total} processed</span>
            {buzzProgress.errors > 0 && (
              <span className="text-red-500 font-semibold">{buzzProgress.errors} error{buzzProgress.errors !== 1 ? 's' : ''}</span>
            )}
          </div>
          {buzzProgress.current && buzzProgress.phase === "running" && (
            <p className="text-xs text-muted-foreground mt-1 truncate" data-testid="text-buzz-current">Processing: {buzzProgress.current}</p>
          )}
          {buzzProgress.phase === "done" && (
            <button
              onClick={() => setBuzzProgress(null)}
              className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-primary hover:bg-primary/90 transition-all"
              data-testid="button-buzz-done"
            >
              Done
            </button>
          )}
        </div>
      )}

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
            value={approvedFilter}
            onChange={(e) => setApprovedFilter(e.target.value)}
            className="h-10 pl-8 pr-4 bg-white border border-black/[0.08] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
            data-testid="select-approved-filter"
          >
            <option value="">All Books</option>
            <option value="no_isbn">Missing ISBN</option>
            <option value="no_google_id">Missing Google ID</option>
            <option value="no_isbn_or_google_id">Missing Both</option>
            <option value="has_podcasts">Has Podcasts</option>
            <option value="no_podcasts">No Podcasts</option>
            <option value="has_clicks">Has Clicks</option>
            <option value="no_clicks">No Clicks</option>
            <option value="has_saves">Has Saves</option>
            <option value="no_saves">No Saves</option>
          </select>
          <AlertCircle className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
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
                <div className="flex items-center gap-4 shrink-0">
                  <div className="flex items-center gap-1 text-xs" data-testid={`stat-podcasts-${item.id}`} title="Podcast appearances">
                    <Mic className="w-3.5 h-3.5 text-purple-500" />
                    <span className="font-semibold text-foreground">{item.podcast_count ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs" data-testid={`stat-clicks-${item.id}`} title="Amazon clicks">
                    <MousePointerClick className="w-3.5 h-3.5 text-blue-500" />
                    <span className="font-semibold text-foreground">{item.click_count ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs" data-testid={`stat-saves-${item.id}`} title="User saves">
                    <Bookmark className="w-3.5 h-3.5 text-amber-500" />
                    <span className="font-semibold text-foreground">{item.save_count ?? 0}</span>
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
