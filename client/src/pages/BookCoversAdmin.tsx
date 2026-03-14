import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, X, BookOpen, CheckCircle2, XCircle, Clock, Filter } from "lucide-react";

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
}

interface CoverStats {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
}

type FilterMode = "all" | "pending" | "approved" | "rejected";

export default function BookCoversAdmin() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterMode>("pending");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data, isLoading, refetch } = useQuery<{ books: BookCoverItem[]; stats: CoverStats }>({
    queryKey: ["/api/admin/book-covers", filter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/book-covers?filter=${filter}`, { credentials: "include" });
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
      refetch();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest("POST", "/api/admin/book-covers/reject", { ids });
    },
    onSuccess: () => {
      toast({ title: "Rejected", description: `Cover(s) rejected and files removed` });
      setSelected(new Set());
      refetch();
    },
  });

  const books = data?.books || [];
  const stats = data?.stats || { total: 0, approved: 0, rejected: 0, pending: 0 };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const filterButtons: { mode: FilterMode; label: string; icon: typeof Clock; color: string }[] = [
    { mode: "pending", label: "Pending", icon: Clock, color: "bg-yellow-100 text-yellow-700" },
    { mode: "approved", label: "Approved", icon: CheckCircle2, color: "bg-green-100 text-green-700" },
    { mode: "rejected", label: "Rejected", icon: XCircle, color: "bg-red-100 text-red-700" },
    { mode: "all", label: "All", icon: Filter, color: "bg-gray-100 text-gray-700" },
  ];

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
      </div>

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 glass-panel rounded-xl p-3 flex items-center gap-3 border border-indigo-200 bg-indigo-50/80 dark:bg-indigo-950/50">
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
            onClick={() => {
              if (confirm(`Reject ${selected.size} cover(s)? This will delete the image files.`)) {
                rejectMutation.mutate(Array.from(selected));
              }
            }}
            disabled={rejectMutation.isPending}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500 text-white hover:bg-red-600 transition-colors flex items-center gap-1"
            data-testid="button-bulk-reject"
          >
            <X className="w-3.5 h-3.5" />
            Reject Selected
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
            data-testid="button-clear-selection"
          >
            Clear
          </button>
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
          {books.map(book => {
            const isSelected = selected.has(book.id);
            return (
              <div
                key={book.id}
                className={`relative rounded-2xl border-2 p-5 transition-all ${
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
                  <div className="w-[280px] shrink-0">
                    <div className="w-[280px] h-[420px] rounded-xl overflow-hidden bg-muted/30 flex items-center justify-center shadow-lg">
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
                      <div className="mt-3">
                        {book.coverApproved === true && (
                          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600"><CheckCircle2 className="w-4 h-4" /> Approved</span>
                        )}
                        {book.coverApproved === false && (
                          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600"><XCircle className="w-4 h-4" /> Rejected</span>
                        )}
                        {book.coverApproved === null && (
                          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-yellow-600"><Clock className="w-4 h-4" /> Pending</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-4">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSelect(book.id); }}
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
                        onClick={() => {
                          if (confirm("Reject this cover?")) rejectMutation.mutate([book.id]);
                        }}
                        disabled={rejectMutation.isPending || (book.coverApproved === false && !book.hasFile)}
                        className="px-4 py-2.5 rounded-lg text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-30 flex items-center gap-1.5"
                        data-testid={`button-reject-${book.id}`}
                      >
                        <X className="w-4 h-4" />
                        Reject
                      </button>
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
