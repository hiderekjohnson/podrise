import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, X, BookOpen, CheckCircle2, XCircle, Clock, Filter, ExternalLink, Eye, RefreshCw } from "lucide-react";

interface BookCoverItem {
  id: number;
  title: string;
  author: string | null;
  slug: string;
  googleBooksId: string | null;
  isbn: string | null;
  hasCover: boolean | null;
  coverApproved: boolean | null;
  hasFile: boolean;
  amazonUrl: string | null;
  rejectionReason: string | null;
  qualityScore: number | null;
  needsReplacement: boolean;
  replacementNote: string | null;
}

interface CoverStats {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  needsReplacement: number;
}

type FilterMode = "all" | "pending" | "approved" | "rejected" | "replace";
type SortMode = "title" | "quality";
type RejectReason = "blurry" | "wrong_book" | "wrong_edition" | "low_quality" | "other";

const REJECT_REASONS: { value: RejectReason; label: string }[] = [
  { value: "blurry", label: "Too blurry" },
  { value: "wrong_book", label: "Wrong book" },
  { value: "wrong_edition", label: "Wrong edition" },
  { value: "low_quality", label: "Low quality" },
  { value: "other", label: "Other" },
];

export default function BookCoversAdmin() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sort, setSort] = useState<SortMode>("quality");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [bulkRejecting, setBulkRejecting] = useState(false);
  const [replacingId, setReplacingId] = useState<number | null>(null);
  const [bulkReplacing, setBulkReplacing] = useState(false);
  const [replaceNote, setReplaceNote] = useState("");
  const lastClickedIndex = useRef<number | null>(null);

  const { data, isLoading, refetch } = useQuery<{ books: BookCoverItem[]; stats: CoverStats }>({
    queryKey: ["/api/admin/book-covers", filter, sort],
    queryFn: async () => {
      const res = await fetch(`/api/admin/book-covers?filter=${filter}&sort=${sort}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest("POST", "/api/admin/book-covers/approve", { ids });
    },
    onSuccess: (_, ids) => {
      toast({ title: "Approved", description: `${ids.length} cover(s) approved` });
      setSelected(new Set());
      lastClickedIndex.current = null;
      refetch();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ ids, reason }: { ids: number[]; reason: string }) => {
      await apiRequest("POST", "/api/admin/book-covers/reject", { ids, reason });
    },
    onSuccess: () => {
      toast({ title: "Rejected", description: "Cover(s) rejected with reason saved" });
      setSelected(new Set());
      lastClickedIndex.current = null;
      setRejectingId(null);
      setBulkRejecting(false);
      refetch();
    },
  });

  const replaceMutation = useMutation({
    mutationFn: async ({ ids, note }: { ids: number[]; note: string }) => {
      await apiRequest("POST", "/api/admin/book-covers/flag-replace", { ids, note });
    },
    onSuccess: (_, { ids }) => {
      toast({ title: "Flagged", description: `${ids.length} cover(s) flagged for replacement` });
      setSelected(new Set());
      lastClickedIndex.current = null;
      setReplacingId(null);
      setBulkReplacing(false);
      setReplaceNote("");
      refetch();
    },
  });

  const books = data?.books || [];
  const stats = data?.stats || { total: 0, approved: 0, rejected: 0, pending: 0, needsReplacement: 0 };

  const handleCardClick = useCallback((index: number, e: React.MouseEvent) => {
    const id = books[index]?.id;
    if (!id) return;

    if (e.shiftKey && lastClickedIndex.current !== null) {
      const start = Math.min(lastClickedIndex.current, index);
      const end = Math.max(lastClickedIndex.current, index);
      setSelected(prev => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          next.add(books[i].id);
        }
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
    lastClickedIndex.current = index;
  }, [books]);

  const selectAll = () => {
    if (selected.size === books.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(books.map(b => b.id)));
    }
  };

  const selectAllWithCovers = () => {
    setSelected(new Set(books.filter(b => b.hasFile).map(b => b.id)));
  };

  const handleReject = (ids: number[], reason: RejectReason) => {
    rejectMutation.mutate({ ids, reason });
  };

  const amazonSearchUrl = (title: string, author: string | null) => {
    const q = encodeURIComponent(title + (author ? " " + author : ""));
    return `https://www.amazon.com/s?k=${q}&i=stripbooks`;
  };

  const filterButtons: { mode: FilterMode; label: string; icon: typeof Clock; color: string }[] = [
    { mode: "pending", label: "Pending", icon: Clock, color: "bg-yellow-100 text-yellow-700" },
    { mode: "approved", label: "Approved", icon: CheckCircle2, color: "bg-green-100 text-green-700" },
    { mode: "rejected", label: "Rejected", icon: XCircle, color: "bg-red-100 text-red-700" },
    { mode: "replace", label: "Needs Replace", icon: RefreshCw, color: "bg-orange-100 text-orange-700" },
    { mode: "all", label: "All", icon: Filter, color: "bg-gray-100 text-gray-700" },
  ];

  const RejectReasonPicker = ({ onPick, onCancel }: { onPick: (reason: RejectReason) => void; onCancel: () => void }) => (
    <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-red-50 border border-red-200">
      <span className="text-xs font-bold text-red-700 mr-1">Reason:</span>
      {REJECT_REASONS.map(r => (
        <button
          key={r.value}
          onClick={() => onPick(r.value)}
          className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white border border-red-200 text-red-700 hover:bg-red-100 transition-colors"
          data-testid={`reject-reason-${r.value}`}
        >
          {r.label}
        </button>
      ))}
      <button
        onClick={onCancel}
        className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors ml-1"
        data-testid="reject-cancel"
      >
        Cancel
      </button>
    </div>
  );

  return (
    <div className="space-y-4" data-testid="book-covers-admin">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="glass-panel rounded-xl px-4 py-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Total:</span>
          <span className="text-sm font-bold">{stats.total}</span>
        </div>
        <div className="glass-panel rounded-xl px-4 py-2 flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
          <span className="text-sm font-bold text-green-600">{stats.approved}</span>
          <span className="text-xs text-muted-foreground">approved</span>
        </div>
        <div className="glass-panel rounded-xl px-4 py-2 flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-yellow-500" />
          <span className="text-sm font-bold text-yellow-600">{stats.pending}</span>
          <span className="text-xs text-muted-foreground">pending</span>
        </div>
        <div className="glass-panel rounded-xl px-4 py-2 flex items-center gap-2">
          <XCircle className="w-3.5 h-3.5 text-red-500" />
          <span className="text-sm font-bold text-red-600">{stats.rejected}</span>
          <span className="text-xs text-muted-foreground">rejected</span>
        </div>
        <div className="glass-panel rounded-xl px-4 py-2 flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 text-orange-500" />
          <span className="text-sm font-bold text-orange-600">{stats.needsReplacement}</span>
          <span className="text-xs text-muted-foreground">needs replace</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {filterButtons.map(({ mode, label, icon: Icon, color }) => (
          <button
            key={mode}
            onClick={() => { setFilter(mode); setSelected(new Set()); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              filter === mode ? color + " ring-2 ring-offset-1 ring-current" : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
            data-testid={`filter-${mode}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
        <span className="text-xs text-muted-foreground mx-1">|</span>
        <button
          onClick={() => { setSort("quality"); setSelected(new Set()); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
            sort === "quality" ? "bg-indigo-100 text-indigo-700 ring-2 ring-offset-1 ring-indigo-400" : "bg-muted/50 text-muted-foreground hover:bg-muted"
          }`}
          data-testid="sort-quality"
        >
          Best First
        </button>
        <button
          onClick={() => { setSort("title"); setSelected(new Set()); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
            sort === "title" ? "bg-indigo-100 text-indigo-700 ring-2 ring-offset-1 ring-indigo-400" : "bg-muted/50 text-muted-foreground hover:bg-muted"
          }`}
          data-testid="sort-title"
        >
          A–Z
        </button>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 glass-panel rounded-xl p-3 flex flex-col gap-2 border border-indigo-200 bg-indigo-50/80 dark:bg-indigo-950/50">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
              {selected.size} selected
            </span>
            <button
              onClick={() => approveMutation.mutate(Array.from(selected))}
              disabled={approveMutation.isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-500 text-white hover:bg-green-600 transition-colors flex items-center gap-1"
              data-testid="button-bulk-approve"
            >
              <Check className="w-3.5 h-3.5" />
              Approve Selected
            </button>
            <button
              onClick={() => setBulkRejecting(true)}
              disabled={rejectMutation.isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500 text-white hover:bg-red-600 transition-colors flex items-center gap-1"
              data-testid="button-bulk-reject"
            >
              <X className="w-3.5 h-3.5" />
              Reject Selected
            </button>
            <button
              onClick={() => setBulkReplacing(true)}
              disabled={replaceMutation.isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-500 text-white hover:bg-orange-600 transition-colors flex items-center gap-1"
              data-testid="button-bulk-replace"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Replace Cover
            </button>
            <button
              onClick={() => { setSelected(new Set()); setBulkRejecting(false); setBulkReplacing(false); }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
              data-testid="button-clear-selection"
            >
              Clear
            </button>
          </div>
          {bulkRejecting && (
            <RejectReasonPicker
              onPick={(reason) => handleReject(Array.from(selected), reason)}
              onCancel={() => setBulkRejecting(false)}
            />
          )}
          {bulkReplacing && (
            <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-orange-50 border border-orange-200">
              <span className="text-xs font-bold text-orange-700">Note (optional):</span>
              <input
                type="text"
                value={replaceNote}
                onChange={(e) => setReplaceNote(e.target.value)}
                placeholder="e.g. Use newer edition cover, audiobook cover shown"
                className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg text-xs border border-orange-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                data-testid="input-replace-note"
              />
              <button
                onClick={() => replaceMutation.mutate({ ids: Array.from(selected), note: replaceNote })}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                data-testid="button-confirm-replace"
              >
                Flag for Replacement
              </button>
              <button
                onClick={() => { setBulkReplacing(false); setReplaceNote(""); }}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={selectAll}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          data-testid="button-select-all"
        >
          {selected.size === books.length ? "Deselect All" : "Select All"}
        </button>
        <span className="text-xs text-muted-foreground">·</span>
        <button
          onClick={selectAllWithCovers}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          data-testid="button-select-with-covers"
        >
          Select All With Covers
        </button>
        <span className="text-xs text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground italic">
          Shift+click to select a range
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          {books.length} books shown
        </span>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Loading covers...</div>
      ) : books.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">No books in this filter</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {books.map((book, index) => {
            const isSelected = selected.has(book.id);
            const showRejectPicker = rejectingId === book.id;
            return (
              <div
                key={book.id}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button, a")) return;
                  handleCardClick(index, e);
                }}
                className={`relative rounded-2xl border-2 p-5 transition-all cursor-pointer select-none ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 shadow-md"
                    : book.coverApproved === true
                      ? "border-green-200 bg-green-50/30"
                      : book.coverApproved === false
                        ? "border-red-200 bg-red-50/30"
                        : "border-border hover:border-muted-foreground/30"
                }`}
                data-testid={`book-cover-card-${book.id}`}
              >
                <div className="flex gap-5">
                  <div className="w-[287px] shrink-0">
                    <div className="w-[287px] h-[425px] rounded-xl overflow-hidden bg-muted/30 flex items-center justify-center shadow-lg">
                      {book.hasFile ? (
                        <img
                          src={`/books/${book.slug}.jpg?t=1`}
                          alt={book.title}
                          className="w-full h-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <BookOpen className="w-10 h-10 text-amber-400/50" />
                          <span className="text-sm text-muted-foreground">No cover</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <h3 className="text-base font-bold text-foreground leading-tight line-clamp-3" data-testid={`text-book-title-${book.id}`}>
                        {book.title}
                      </h3>
                      {book.author && (
                        <p className="text-sm text-muted-foreground mt-1.5 line-clamp-1">{book.author}</p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {book.coverApproved === true && (
                          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600"><CheckCircle2 className="w-4 h-4" /> Approved</span>
                        )}
                        {book.coverApproved === false && (
                          <div>
                            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600"><XCircle className="w-4 h-4" /> Rejected</span>
                            {book.rejectionReason && (
                              <span className="ml-2 text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">{book.rejectionReason.replace(/_/g, " ")}</span>
                            )}
                          </div>
                        )}
                        {book.coverApproved === null && (
                          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-yellow-600"><Clock className="w-4 h-4" /> Pending</span>
                        )}
                        {book.qualityScore !== null && book.hasFile && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            book.qualityScore >= 70 ? "bg-green-100 text-green-700" :
                            book.qualityScore >= 40 ? "bg-yellow-100 text-yellow-700" :
                            "bg-red-100 text-red-700"
                          }`} data-testid={`quality-score-${book.id}`}>
                            {book.qualityScore >= 70 ? "Good" : book.qualityScore >= 40 ? "Okay" : "Poor"} ({book.qualityScore})
                          </span>
                        )}
                        {book.needsReplacement && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                            <RefreshCw className="w-3 h-3" /> Needs Replace
                          </span>
                        )}
                      </div>
                      {book.replacementNote && (
                        <p className="mt-1.5 text-xs text-orange-600 bg-orange-50 px-2.5 py-1 rounded-lg italic">{book.replacementNote}</p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <a
                          href={book.amazonUrl || amazonSearchUrl(book.title, book.author)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                          data-testid={`link-amazon-${book.id}`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Amazon
                        </a>
                        <a
                          href={`/books/${book.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                          data-testid={`link-podcap-${book.id}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          PodCap Page
                        </a>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 mt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCardClick(index, e); }}
                          className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-1.5 ${
                            isSelected
                              ? "bg-indigo-500 text-white"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                          data-testid={`checkbox-${book.id}`}
                        >
                          <Check className="w-4 h-4" />
                          {isSelected ? "Selected" : "Select"}
                        </button>
                        <button
                          onClick={() => approveMutation.mutate([book.id])}
                          disabled={approveMutation.isPending || book.coverApproved === true || !book.hasFile}
                          className="px-4 py-2.5 rounded-lg text-sm font-bold bg-green-500 text-white hover:bg-green-600 transition-colors disabled:opacity-30 flex items-center gap-1.5"
                          data-testid={`button-approve-${book.id}`}
                        >
                          <Check className="w-4 h-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => setRejectingId(showRejectPicker ? null : book.id)}
                          disabled={rejectMutation.isPending}
                          className="px-4 py-2.5 rounded-lg text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-30 flex items-center gap-1.5"
                          data-testid={`button-reject-${book.id}`}
                        >
                          <X className="w-4 h-4" />
                          Reject
                        </button>
                        <button
                          onClick={() => setReplacingId(replacingId === book.id ? null : book.id)}
                          disabled={replaceMutation.isPending}
                          className="px-4 py-2.5 rounded-lg text-sm font-bold bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-30 flex items-center gap-1.5"
                          data-testid={`button-replace-${book.id}`}
                        >
                          <RefreshCw className="w-4 h-4" />
                          Replace
                        </button>
                      </div>
                      {showRejectPicker && (
                        <RejectReasonPicker
                          onPick={(reason) => handleReject([book.id], reason)}
                          onCancel={() => setRejectingId(null)}
                        />
                      )}
                      {replacingId === book.id && (
                        <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-orange-50 border border-orange-200">
                          <input
                            type="text"
                            value={replaceNote}
                            onChange={(e) => setReplaceNote(e.target.value)}
                            placeholder="Note: e.g. audiobook cover, use newer edition"
                            className="flex-1 min-w-[150px] px-3 py-1.5 rounded-lg text-xs border border-orange-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                            data-testid={`input-replace-note-${book.id}`}
                          />
                          <button
                            onClick={() => replaceMutation.mutate({ ids: [book.id], note: replaceNote })}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                            data-testid={`button-confirm-replace-${book.id}`}
                          >
                            Flag
                          </button>
                          <button
                            onClick={() => { setReplacingId(null); setReplaceNote(""); }}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
