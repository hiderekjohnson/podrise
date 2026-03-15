import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, X, BookOpen, CheckCircle2, Clock, Search, Loader2, ChevronLeft, ChevronRight, ExternalLink, Eye, RotateCcw, Undo2, HelpCircle, ImageOff, Star } from "lucide-react";

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
  coverSource: string | null;
  triedSources: string[];
  ratingCount: number;
  olRatingsCount: number;
}

interface CoverStats {
  total: number;
  approved: number;
  needsReview: number;
  noImages: number;
}

interface CoverCandidate {
  source: string;
  width: number;
  height: number;
  size: number;
  filename: string;
  url: string;
}

type TabMode = "needs_review" | "approved" | "no_images";

const SOURCE_LABELS: Record<string, string> = {
  google_books: "Google Books",
  openlibrary: "OpenLibrary",
  amazon_isbn: "Amazon",
  openlibrary_search: "OL Search",
};

const SOURCE_RELIABILITY: Record<string, number> = {
  amazon_isbn: 4,
  google_books: 3,
  openlibrary: 2,
  openlibrary_search: 1,
};

function scoreCandidateImage(c: CoverCandidate): number {
  let score = 0;
  const area = c.width * c.height;
  score += Math.min(area / 1000, 200);
  if (c.size < 1024) score -= 100;
  else if (c.size < 5000) score -= 20;
  else score += Math.min(c.size / 5000, 50);
  const ratio = c.width / c.height;
  const idealRatio = 0.65;
  const ratioDiff = Math.abs(ratio - idealRatio);
  score += Math.max(0, 50 - ratioDiff * 100);
  score += (SOURCE_RELIABILITY[c.source] || 0) * 15;
  return score;
}

function rankCandidates(candidates: CoverCandidate[]): CoverCandidate[] {
  return [...candidates]
    .filter(c => {
      if (c.size < 1024) return false;
      if (c.width < 50 || c.height < 50) return false;
      return true;
    })
    .sort((a, b) => scoreCandidateImage(b) - scoreCandidateImage(a));
}

export default function BookCoversAdmin() {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabMode>("needs_review");
  const [page, setPage] = useState(1);
  const [reviewQueue, setReviewQueue] = useState<number[]>([]);
  const [reviewQueueBooks, setReviewQueueBooks] = useState<Record<number, BookCoverItem>>({});
  const [candidatesMap, setCandidatesMap] = useState<Record<number, CoverCandidate[]>>({});
  const [loadingCandidates, setLoadingCandidates] = useState<Set<number>>(new Set());
  const [candidateIndex, setCandidateIndex] = useState<Record<number, number>>({});
  const [candidateFetchTime, setCandidateFetchTime] = useState<Record<number, number>>({});
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const [undoAction, setUndoAction] = useState<{ bookId: number; action: "approve" | "reject"; timeout: NodeJS.Timeout; execute: () => void } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [coverVersion, setCoverVersion] = useState<Record<number, number>>({});
  const [selectingCandidate, setSelectingCandidate] = useState<Set<number>>(new Set());
  const [preloadedImages, setPreloadedImages] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  const PAGE_SIZE = 50;
  const REVIEW_PAGE_SIZE = 500;

  const { data, isLoading, refetch } = useQuery<{
    books: BookCoverItem[];
    stats: CoverStats;
    totalFiltered: number;
    page: number;
    totalPages: number;
  }>({
    queryKey: ["/api/admin/book-covers", tab, page],
    queryFn: async () => {
      const sort = tab === "needs_review" ? "popularity" : "title";
      const size = tab === "needs_review" ? REVIEW_PAGE_SIZE : PAGE_SIZE;
      const res = await fetch(`/api/admin/book-covers?filter=${tab}&sort=${sort}&page=${page}&pageSize=${size}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const books = data?.books || [];
  const stats = data?.stats || { total: 0, approved: 0, needsReview: 0, noImages: 0 };
  const totalFiltered = data?.totalFiltered || 0;

  useEffect(() => {
    if (tab !== "needs_review" || !books.length) return;
    if (reviewQueue.length === 0) {
      const ids = books.map(b => b.id);
      const bookMap: Record<number, BookCoverItem> = {};
      books.forEach(b => { bookMap[b.id] = b; });
      setReviewQueue(ids);
      setReviewQueueBooks(prev => ({ ...prev, ...bookMap }));
    } else {
      const bookMap: Record<number, BookCoverItem> = {};
      books.forEach(b => { bookMap[b.id] = b; });
      setReviewQueueBooks(prev => ({ ...prev, ...bookMap }));
    }
  }, [books, tab]);

  const currentBookId = reviewQueue.length > 0 ? reviewQueue[0] : null;
  const currentBook = currentBookId ? reviewQueueBooks[currentBookId] || null : null;

  useEffect(() => {
    if (tab !== "needs_review" || reviewQueue.length === 0) return;
    const toPreload = reviewQueue.slice(0, 5);
    toPreload.forEach(id => {
      if (!candidatesMap[id] && !loadingCandidates.has(id)) {
        fetchCandidates(id);
      }
    });
  }, [tab, reviewQueue]);

  useEffect(() => {
    if (tab !== "needs_review" || reviewQueue.length === 0) return;
    const toPreload = reviewQueue.slice(0, 5);
    toPreload.forEach(id => {
      const candidates = candidatesMap[id];
      if (candidates && candidates.length > 0) {
        candidates.forEach(c => {
          const url = `${c.url}?t=${candidateFetchTime[id] || 1}`;
          if (!preloadedImages.has(url)) {
            const img = new Image();
            img.src = url;
            setPreloadedImages(prev => new Set(prev).add(url));
          }
        });
      }
    });
  }, [candidatesMap, reviewQueue, tab]);

  const unapproveMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest("POST", "/api/admin/book-covers/unapprove", { ids });
    },
    onSuccess: () => {
      toast({ title: "Sent back to review" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/book-covers"] });
    },
  });

  const notBookMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest("POST", "/api/admin/book-covers/remove-not-book", { ids });
    },
    onSuccess: (_, ids) => {
      toast({ title: "Removed", description: `${ids.length} non-book entries permanently removed & blocklisted` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/book-covers"] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (mode: string) => {
      const res = await apiRequest("POST", "/api/admin/book-covers/retry-rejected", { mode });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Retry Started", description: data.message || "Running in background..." });
    },
  });

  const fetchCandidates = async (bookId: number) => {
    if (loadingCandidates.has(bookId) || candidatesMap[bookId] !== undefined) return;
    setLoadingCandidates(prev => new Set(prev).add(bookId));
    try {
      const res = await apiRequest("POST", "/api/admin/book-covers/fetch-candidates", { id: bookId });
      const data = await res.json();
      const ranked = rankCandidates(data.candidates || []);
      setCandidatesMap(prev => ({ ...prev, [bookId]: ranked }));
      setCandidateIndex(prev => ({ ...prev, [bookId]: 0 }));
      setCandidateFetchTime(prev => ({ ...prev, [bookId]: Date.now() }));

      if (ranked.length === 0) {
        const bookData = reviewQueueBooks[bookId];
        if (!bookData || !bookData.hasFile) {
          setReviewQueue(prev => prev.filter(id => id !== bookId));
        }
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to fetch candidates", variant: "destructive" });
      setCandidatesMap(prev => ({ ...prev, [bookId]: [] }));
    } finally {
      setLoadingCandidates(prev => {
        const next = new Set(prev);
        next.delete(bookId);
        return next;
      });
    }
  };

  const selectCandidate = async (bookId: number, candidate: CoverCandidate) => {
    setSelectingCandidate(prev => new Set(prev).add(bookId));
    try {
      await apiRequest("POST", "/api/admin/book-covers/select-candidate", {
        id: bookId,
        source: candidate.source,
        filename: candidate.filename,
      });
      setCandidatesMap(prev => {
        const next = { ...prev };
        delete next[bookId];
        return next;
      });
      setCoverVersion(prev => ({ ...prev, [bookId]: Date.now() }));
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to select candidate", variant: "destructive" });
    } finally {
      setSelectingCandidate(prev => {
        const next = new Set(prev);
        next.delete(bookId);
        return next;
      });
    }
  };

  const doFlash = (color: "green" | "red") => {
    setFlashColor(color);
    setTimeout(() => setFlashColor(null), 400);
  };

  const advanceReview = () => {
    setReviewQueue(prev => {
      const next = prev.slice(1);
      if (next.length === 0) {
        refetch();
      }
      return next;
    });
    setReviewedCount(prev => prev + 1);
  };

  const commitPendingAction = useCallback(() => {
    if (!undoAction) return;
    clearTimeout(undoAction.timeout);
    undoAction.execute();
    setUndoAction(null);
  }, [undoAction]);

  const handleApprove = useCallback(() => {
    if (!currentBook) return;
    const candidates = candidatesMap[currentBook.id];
    const isLoadingCands = loadingCandidates.has(currentBook.id);
    const currentIdx = candidateIndex[currentBook.id] || 0;
    const candidate = candidates?.[currentIdx];

    if (isLoadingCands) return;

    if (!candidate && !currentBook.hasFile) {
      toast({ title: "Nothing to approve", description: "No cover image available for this book", variant: "destructive" });
      return;
    }

    if (undoAction) {
      commitPendingAction();
    }

    doFlash("green");

    const bookId = currentBook.id;
    const bookHasFile = currentBook.hasFile;
    const capturedCandidate = candidate ? { ...candidate } : null;

    const executeMutation = () => {
      (async () => {
        try {
          if (capturedCandidate) {
            await selectCandidate(bookId, capturedCandidate);
          } else if (bookHasFile) {
            await apiRequest("POST", "/api/admin/book-covers/approve", { ids: [bookId] });
          }
          queryClient.invalidateQueries({ queryKey: ["/api/admin/book-covers"] });
        } catch (err: any) {
          toast({ title: "Error approving", description: err?.message || "Failed", variant: "destructive" });
        }
      })();
    };

    const timeout = setTimeout(() => {
      executeMutation();
      setUndoAction(null);
    }, 5000);
    setUndoAction({ bookId, action: "approve", timeout, execute: executeMutation });

    advanceReview();
  }, [currentBook, candidatesMap, candidateIndex, undoAction, loadingCandidates, commitPendingAction]);

  const handleReject = useCallback(() => {
    if (!currentBook) return;

    if (undoAction) {
      commitPendingAction();
    }

    doFlash("red");

    const bookId = currentBook.id;

    const executeMutation = () => {
      (async () => {
        try {
          await apiRequest("POST", "/api/admin/book-covers/soft-reject", { id: bookId });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/book-covers"] });
        } catch (err: any) {
          toast({ title: "Error rejecting", description: err?.message || "Failed to reject cover", variant: "destructive" });
        }
      })();
    };

    const timeout = setTimeout(() => {
      executeMutation();
      setUndoAction(null);
    }, 5000);
    setUndoAction({ bookId, action: "reject", timeout, execute: executeMutation });

    advanceReview();
  }, [currentBook, undoAction, commitPendingAction]);

  const handleUndo = useCallback(() => {
    if (!undoAction) return;
    clearTimeout(undoAction.timeout);
    const { bookId, action } = undoAction;
    setUndoAction(null);

    setReviewQueue(prev => [bookId, ...prev]);
    setReviewedCount(prev => Math.max(0, prev - 1));
    toast({ title: "Undone", description: `Reversed ${action}` });
  }, [undoAction]);

  useEffect(() => {
    if (tab !== "needs_review") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
        return;
      }

      if (e.key === "a" || e.key === "A" || e.key === "ArrowRight") {
        e.preventDefault();
        handleApprove();
        return;
      }

      if (e.key === "r" || e.key === "R" || e.key === "ArrowLeft") {
        e.preventDefault();
        handleReject();
        return;
      }

      if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        handleUndo();
        return;
      }

      const numKey = parseInt(e.key);
      if (numKey >= 1 && numKey <= 9 && currentBook) {
        const candidates = candidatesMap[currentBook.id];
        if (candidates && numKey <= candidates.length) {
          e.preventDefault();
          setCandidateIndex(prev => ({ ...prev, [currentBook.id]: numKey - 1 }));
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tab, handleApprove, handleReject, handleUndo, currentBook, candidatesMap]);

  const amazonSearchUrl = (title: string, author: string | null) => {
    const q = encodeURIComponent(title + (author ? " " + author : ""));
    return `https://www.amazon.com/s?k=${q}&i=stripbooks`;
  };

  const switchTab = (newTab: TabMode) => {
    setTab(newTab);
    setPage(1);
    setReviewQueue([]);
    setReviewQueueBooks({});
    setReviewedCount(0);
    setCandidatesMap({});
  };

  const SingleFocusReview = () => {
    if (!currentBook) {
      return (
        <div className="flex flex-col items-center justify-center py-20" data-testid="review-complete">
          <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-2">All caught up!</h2>
          <p className="text-muted-foreground">No more books to review in this batch.</p>
        </div>
      );
    }

    const candidates = candidatesMap[currentBook.id];
    const isLoadingCands = loadingCandidates.has(currentBook.id);
    const currentIdx = candidateIndex[currentBook.id] || 0;
    const fetchTs = candidateFetchTime[currentBook.id] || 1;
    const hasCandidates = candidates && candidates.length > 0;
    const currentCandidate = hasCandidates ? candidates[currentIdx] : null;
    const isSelecting = selectingCandidate.has(currentBook.id);
    const popularity = currentBook.ratingCount + currentBook.olRatingsCount;

    const goNextCandidate = () => {
      if (!candidates) return;
      setCandidateIndex(prev => ({ ...prev, [currentBook.id]: (currentIdx + 1) % candidates.length }));
    };
    const goPrevCandidate = () => {
      if (!candidates) return;
      setCandidateIndex(prev => ({ ...prev, [currentBook.id]: (currentIdx - 1 + candidates.length) % candidates.length }));
    };

    return (
      <div className="flex flex-col items-center gap-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-right-4 duration-200" key={currentBook.id} data-testid="single-focus-review">
        <div className="relative w-full">
          {isLoadingCands ? (
            <div className="w-full max-w-[350px] mx-auto h-[500px] rounded-2xl bg-muted/30 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
              <span className="text-sm text-muted-foreground">Finding covers...</span>
            </div>
          ) : hasCandidates && currentCandidate ? (
            <div className="relative mx-auto" style={{ maxWidth: "350px" }}>
              <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden bg-white flex items-center justify-center shadow-2xl border-2 border-muted">
                <img
                  src={`${currentCandidate.url}?t=${fetchTs}`}
                  alt={`${currentCandidate.source} candidate`}
                  className="w-full h-full object-contain"
                  data-testid="review-cover-image"
                />
              </div>
              {candidates.length > 1 && (
                <>
                  <button
                    onClick={goPrevCandidate}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                    data-testid="candidate-prev"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={goNextCandidate}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                    data-testid="candidate-next"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-4 py-2 rounded-b-2xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">{SOURCE_LABELS[currentCandidate.source] || currentCandidate.source}</span>
                  {currentIdx === 0 && (
                    <span className="text-[10px] bg-yellow-500 text-black font-bold px-1.5 py-0.5 rounded" data-testid="badge-recommended">
                      Recommended
                    </span>
                  )}
                </div>
                <span className="text-xs text-white/60">{currentIdx + 1}/{candidates.length}</span>
              </div>
              <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-lg">
                {currentCandidate.width}×{currentCandidate.height} · {(currentCandidate.size / 1024).toFixed(0)}KB
              </div>
            </div>
          ) : currentBook.hasFile ? (
            <div className="relative mx-auto" style={{ maxWidth: "350px" }}>
              <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden bg-white flex items-center justify-center shadow-2xl border-2 border-muted">
                <img
                  src={`/books/${currentBook.slug}.jpg?v=${coverVersion[currentBook.id] || 0}`}
                  alt="Existing cover"
                  className="w-full h-full object-contain"
                  data-testid="review-cover-image"
                />
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-4 py-2 rounded-b-2xl">
                <span className="text-xs font-bold text-white">Existing Local Cover</span>
              </div>
            </div>
          ) : candidates !== undefined ? (
            <div className="w-full max-w-[350px] mx-auto h-[500px] rounded-2xl bg-muted/30 flex flex-col items-center justify-center gap-3">
              <ImageOff className="w-12 h-12 text-zinc-300" />
              <span className="text-lg text-muted-foreground">No covers found</span>
              <button
                onClick={() => {
                  setCandidatesMap(prev => {
                    const next = { ...prev };
                    delete next[currentBook.id];
                    return next;
                  });
                  fetchCandidates(currentBook.id);
                }}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-indigo-500 text-white hover:bg-indigo-600 transition-colors flex items-center gap-1.5"
                data-testid="button-retry-find"
              >
                <Search className="w-4 h-4" /> Try Again
              </button>
            </div>
          ) : (
            <div className="w-full max-w-[350px] mx-auto h-[500px] rounded-2xl bg-muted/30 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
              <span className="text-sm text-muted-foreground">Loading...</span>
            </div>
          )}
        </div>

        <div className="text-center space-y-1 w-full">
          <h2 className="text-xl font-bold text-foreground leading-tight" data-testid="review-book-title">
            {currentBook.title}
          </h2>
          {currentBook.author && (
            <p className="text-base text-muted-foreground">{currentBook.author}</p>
          )}
          <div className="flex items-center justify-center gap-3 pt-1">
            {popularity > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Star className="w-3 h-3" /> {popularity.toLocaleString()} ratings
              </span>
            )}
            <a
              href={currentBook.amazonUrl || amazonSearchUrl(currentBook.title, currentBook.author)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800"
              data-testid="link-amazon-review"
            >
              <ExternalLink className="w-3 h-3" /> Amazon
            </a>
            <a
              href={`/books/${currentBook.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
              data-testid="link-page-review"
            >
              <Eye className="w-3 h-3" /> Page
            </a>
          </div>
        </div>

        <div className="flex items-center gap-6 pt-2">
          <button
            onClick={handleReject}
            disabled={isSelecting}
            className="flex items-center gap-2 px-8 py-4 rounded-2xl text-lg font-bold bg-red-500 text-white hover:bg-red-600 active:scale-95 transition-all shadow-lg disabled:opacity-50"
            data-testid="button-reject-review"
          >
            <X className="w-6 h-6" />
            Reject
          </button>
          <button
            onClick={handleApprove}
            disabled={isSelecting || isLoadingCands}
            className="flex items-center gap-2 px-8 py-4 rounded-2xl text-lg font-bold bg-green-500 text-white hover:bg-green-600 active:scale-95 transition-all shadow-lg disabled:opacity-50"
            data-testid="button-approve-review"
          >
            <Check className="w-6 h-6" />
            Approve
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (confirm(`Permanently remove "${currentBook.title}" from the database?`)) {
                notBookMutation.mutate([currentBook.id]);
                advanceReview();
              }
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors flex items-center gap-1"
            data-testid="button-not-book-review"
          >
            <X className="w-3 h-3" /> Not a Book
          </button>
        </div>
      </div>
    );
  };

  const ApprovedCard = ({ book }: { book: BookCoverItem }) => {
    return (
      <div
        className="relative rounded-2xl border-2 border-green-200 bg-green-50/30 dark:bg-green-950/10 p-4 transition-all"
        data-testid={`book-cover-card-${book.id}`}
      >
        <div className="flex gap-4">
          <div className="w-[120px] shrink-0">
            <div className="w-[120px] h-[180px] rounded-xl overflow-hidden bg-muted/30 flex items-center justify-center shadow">
              {book.hasFile ? (
                <img
                  src={`/books/${book.slug}.jpg?v=${coverVersion[book.id] || 1}`}
                  alt={book.title}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              ) : (
                <BookOpen className="w-8 h-8 text-zinc-300" />
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground leading-tight line-clamp-2" data-testid={`text-book-title-${book.id}`}>
                {book.title}
              </h3>
              {book.author && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{book.author}</p>
              )}
              <div className="flex items-center gap-1.5 mt-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                <span className="text-xs font-medium text-green-600">Approved</span>
                {book.coverSource && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 ml-1">
                    {book.coverSource.replace(/_/g, " ")}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => unapproveMutation.mutate([book.id])}
              disabled={unapproveMutation.isPending}
              className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors flex items-center gap-1.5 w-fit"
              data-testid={`button-send-back-${book.id}`}
            >
              <RotateCcw className="w-3 h-3" />
              Send Back to Review
            </button>
          </div>
        </div>
      </div>
    );
  };

  const NoImagesCard = ({ book }: { book: BookCoverItem }) => {
    return (
      <div
        className="relative rounded-2xl border-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30 p-4 transition-all"
        data-testid={`book-no-images-card-${book.id}`}
      >
        <div className="flex gap-4 items-center">
          <div className="w-[60px] h-[90px] rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
            <ImageOff className="w-6 h-6 text-zinc-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-foreground leading-tight line-clamp-1" data-testid={`text-no-images-title-${book.id}`}>
              {book.title}
            </h3>
            {book.author && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{book.author}</p>
            )}
          </div>
          <a
            href={book.amazonUrl || amazonSearchUrl(book.title, book.author)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
            data-testid={`link-amazon-no-images-${book.id}`}
          >
            Amazon
          </a>
        </div>
      </div>
    );
  };

  const progressPercent = totalFiltered > 0 ? Math.min((reviewedCount / totalFiltered) * 100, 100) : 0;

  return (
    <div className="space-y-4" ref={containerRef} data-testid="book-covers-admin">
      {flashColor && (
        <div
          className={`fixed inset-0 z-50 pointer-events-none transition-opacity duration-300 ${
            flashColor === "green" ? "bg-green-500/20" : "bg-red-500/20"
          }`}
          data-testid="flash-overlay"
        />
      )}

      {showShortcuts && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center" onClick={() => setShowShortcuts(false)}>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()} data-testid="shortcuts-modal">
            <h3 className="text-lg font-bold mb-4">Keyboard Shortcuts</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span>Approve</span><span className="font-mono bg-muted px-2 py-0.5 rounded">A / →</span></div>
              <div className="flex justify-between"><span>Reject</span><span className="font-mono bg-muted px-2 py-0.5 rounded">R / ←</span></div>
              <div className="flex justify-between"><span>Undo last</span><span className="font-mono bg-muted px-2 py-0.5 rounded">Z</span></div>
              <div className="flex justify-between"><span>Switch candidate</span><span className="font-mono bg-muted px-2 py-0.5 rounded">1-9</span></div>
              <div className="flex justify-between"><span>Toggle help</span><span className="font-mono bg-muted px-2 py-0.5 rounded">?</span></div>
            </div>
            <button
              onClick={() => setShowShortcuts(false)}
              className="mt-4 w-full py-2 rounded-lg bg-muted text-sm font-bold hover:bg-muted/80"
              data-testid="button-close-shortcuts"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1">
          <button
            onClick={() => switchTab("needs_review")}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
              tab === "needs_review"
                ? "bg-white dark:bg-zinc-800 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-needs-review"
          >
            <Clock className="w-4 h-4" />
            Needs Review
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
              {stats.needsReview}
            </span>
          </button>
          <button
            onClick={() => switchTab("no_images")}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
              tab === "no_images"
                ? "bg-white dark:bg-zinc-800 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-no-images"
          >
            <ImageOff className="w-4 h-4" />
            No Images
            <span className="text-xs bg-zinc-200 text-zinc-600 px-2 py-0.5 rounded-full font-bold">
              {stats.noImages}
            </span>
          </button>
          <button
            onClick={() => switchTab("approved")}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
              tab === "approved"
                ? "bg-white dark:bg-zinc-800 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-approved"
          >
            <CheckCircle2 className="w-4 h-4" />
            Approved
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
              {stats.approved}
            </span>
          </button>
        </div>

        <span className="text-xs text-muted-foreground">
          {stats.total} total books
        </span>

        {tab === "needs_review" && (
          <button
            onClick={() => setShowShortcuts(true)}
            className="ml-auto w-7 h-7 rounded-full bg-muted/50 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-show-shortcuts"
            title="Keyboard shortcuts"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        )}

        {tab !== "needs_review" && (
          <div className="ml-auto flex items-center gap-2">
            <button
              data-testid="button-retry-all"
              onClick={() => retryMutation.mutate("nocover")}
              disabled={retryMutation.isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-500 text-white hover:bg-indigo-600 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {retryMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              Re-scan Missing Covers
            </button>
          </div>
        )}
      </div>

      {tab === "needs_review" && totalFiltered > 0 && (
        <div className="space-y-1" data-testid="progress-bar">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{reviewedCount} of {totalFiltered} reviewed</span>
            <span>{Math.round(progressPercent)}%</span>
          </div>
          <div className="w-full h-1.5 bg-muted/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {undoAction && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-in-from-bottom-4">
          <button
            onClick={handleUndo}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold shadow-2xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all"
            data-testid="button-undo"
          >
            <Undo2 className="w-4 h-4" />
            Undo {undoAction.action === "approve" ? "Approve" : "Reject"}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Loading covers...</div>
      ) : tab === "needs_review" ? (
        <SingleFocusReview />
      ) : tab === "no_images" ? (
        books.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No books without images
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {books.map((book) => (
              <NoImagesCard key={book.id} book={book} />
            ))}
          </div>
        )
      ) : (
        books.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No approved covers yet
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {books.map((book) => (
              <ApprovedCard key={book.id} book={book} />
            ))}
          </div>
        )
      )}

      {tab !== "needs_review" && (data?.totalPages || 1) > 1 && (
        <div className="flex items-center justify-center gap-3 pt-6 pb-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-white dark:bg-zinc-800 border border-border hover:bg-muted transition-colors disabled:opacity-30 flex items-center gap-1.5"
            data-testid="button-prev-page"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {data?.totalPages || 1} ({totalFiltered} books)
          </span>
          <button
            onClick={() => setPage(p => Math.min(data?.totalPages || 1, p + 1))}
            disabled={page >= (data?.totalPages || 1)}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-white dark:bg-zinc-800 border border-border hover:bg-muted transition-colors disabled:opacity-30 flex items-center gap-1.5"
            data-testid="button-next-page"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
