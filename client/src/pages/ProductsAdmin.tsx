import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, ExternalLink, ShoppingBag, Play, Package, Globe, Star, MessageSquare, ThumbsUp, ThumbsDown, CheckCircle2, XCircle, Filter, Clock, Trash2, AlertTriangle, FileText, Bot, ChevronDown, ChevronUp, ArrowUpDown, Image, Upload, Sparkles } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Product {
  id: number;
  name: string;
  company: string | null;
  description: string | null;
  purchase_url: string | null;
  context: string | null;
  mention_type: string | null;
  category: string;
  episode_title: string;
  episode_slug: string | null;
  podcast_slug: string;
  status: string;
  rejection_reason: string | null;
  extracted_at: string;
  reviewed_at: string | null;
  image_url: string | null;
  image_status: string;
}

const MENTION_LABELS: Record<string, { label: string; color: string; icon: typeof Star }> = {
  recommendation: { label: "Recommended", color: "bg-green-100 text-green-700", icon: ThumbsUp },
  personal_use: { label: "Personal Use", color: "bg-blue-100 text-blue-700", icon: Star },
  discussion: { label: "Discussed", color: "bg-zinc-100 text-zinc-600", icon: MessageSquare },
};

const CATEGORY_LABELS: Record<string, { label: string; color: string; icon: typeof Package }> = {
  physical_product: { label: "Product", color: "bg-orange-50 text-orange-700", icon: Package },
  service_or_tool: { label: "Service", color: "bg-indigo-50 text-indigo-600", icon: Globe },
  experience: { label: "Experience", color: "bg-purple-50 text-purple-600", icon: Star },
};

const REJECT_REASONS = [
  { value: "sponsor_ad", label: "Sponsor / ad" },
  { value: "not_specific_brand", label: "No specific brand" },
  { value: "passing_mention", label: "Just a passing mention" },
  { value: "too_well_known", label: "Too well known" },
  { value: "not_interesting", label: "Not interesting enough" },
  { value: "book_or_media", label: "Book / media / digital" },
  { value: "investment_context", label: "Investment context only" },
  { value: "cant_buy_online", label: "Can't buy / use" },
  { value: "other", label: "Other" },
];

type FilterMode = "all" | "pending" | "approved" | "rejected";
type SortMode = "newest" | "genuine_first" | "ads_first";

function highlightTerms(text: string, terms: string[]): (string | JSX.Element)[] {
  const validTerms = terms.filter(t => t && t.length > 1).sort((a, b) => b.length - a.length);
  if (validTerms.length === 0) return [text];
  const escaped = validTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(regex);
  const lowerTerms = validTerms.map(t => t.toLowerCase());
  return parts.map((part, i) => {
    if (lowerTerms.some(t => part.toLowerCase() === t)) {
      return <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/50 text-inherit rounded-sm px-0.5 font-semibold">{part}</mark>;
    }
    return part;
  });
}

const AD_KEYWORDS = [
  "sponsored by", "brought to you by", "use code", "promo code", "coupon code",
  "special offer", "free trial", "sign up at", "go to ", "discount", "% off",
  "our sponsor", "quick break", "word from", "affiliate"
];

function computeAdScore(product: Product): number {
  let score = 50;
  const contextLower = (product.context || "").toLowerCase();
  for (const kw of AD_KEYWORDS) {
    if (contextLower.includes(kw)) score += 15;
  }
  if (!product.purchase_url) score += 10;
  if (product.mention_type === "personal_use") score -= 20;
  if (product.mention_type === "recommendation") score -= 10;
  return Math.max(0, Math.min(100, score));
}

interface TranscriptExcerpt {
  excerpt: string | null;
  matchedTerm?: string;
  productName?: string;
  company?: string;
  message?: string;
}

interface AiCheckResult {
  verdict: "genuine" | "ad" | "brief_mention" | "unknown";
  confidence: number;
  reason: string;
}

function TranscriptExcerptPanel({ productId, productName, company }: { productId: number; productName: string; company: string | null }) {
  const { data, isLoading } = useQuery<TranscriptExcerpt>({
    queryKey: ["/api/admin/products", productId, "transcript-excerpt"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/products/${productId}/transcript-excerpt`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) return (
    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading transcript...
    </div>
  );

  if (!data?.excerpt) return (
    <div className="py-3 text-sm text-muted-foreground italic">
      {data?.message || "Transcript excerpt not available"}
    </div>
  );

  const highlightWords = [productName, company].filter(Boolean) as string[];

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-800 p-4 max-h-[400px] overflow-y-auto">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-4 h-4 text-amber-600" />
        <span className="text-xs font-bold text-amber-700 dark:text-amber-400">Transcript Excerpt</span>
      </div>
      <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-mono">
        ...{highlightTerms(data.excerpt, highlightWords)}...
      </p>
    </div>
  );
}

function AiCheckButton({ productId }: { productId: number }) {
  const [result, setResult] = useState<AiCheckResult | null>(null);
  const [loading, setLoading] = useState(false);

  const runCheck = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/products/${productId}/ai-check`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      setResult(data.verdict ? data : { verdict: "unknown" as const, confidence: 0, reason: data.message || "Check failed" });
    } catch {
      setResult({ verdict: "unknown" as const, confidence: 0, reason: "Network error — try again" });
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    const colors = {
      genuine: "bg-green-100 text-green-700 border-green-300",
      ad: "bg-red-100 text-red-700 border-red-300",
      brief_mention: "bg-yellow-100 text-yellow-700 border-yellow-300",
      unknown: "bg-gray-100 text-gray-600 border-gray-300",
    };
    const labels = { genuine: "Genuine", ad: "Ad/Sponsor", brief_mention: "Brief Mention", unknown: "Unknown" };
    return (
      <div className={`inline-flex flex-col gap-1 px-3 py-2 rounded-lg text-xs border ${colors[result.verdict]}`}>
        <div className="flex items-center gap-1.5">
          <Bot className="w-3.5 h-3.5" />
          <span className="font-bold">{labels[result.verdict]}</span>
          <span className="opacity-70">({Math.round(result.confidence * 100)}%)</span>
        </div>
        <span className="text-[11px] opacity-80">{result.reason}</span>
      </div>
    );
  }

  return (
    <button
      onClick={runCheck}
      disabled={loading}
      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors flex items-center gap-1.5 disabled:opacity-50 border border-violet-200"
      data-testid={`button-ai-check-${productId}`}
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
      AI Check
    </button>
  );
}

export default function ProductsAdmin() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterMode>("pending");
  const [sortMode, setSortMode] = useState<SortMode>("genuine_first");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [lastExtraction, setLastExtraction] = useState<{ newCount: number; coverage: string; urlsSkipped?: number; episodeCount?: number } | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expandedTranscripts, setExpandedTranscripts] = useState<Set<number>>(new Set());

  const { data, isLoading } = useQuery<{ products: Product[]; stats: Record<string, number> }>({
    queryKey: ["/api/admin/products", filter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/products?filter=${filter}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest("POST", "/api/admin/products/approve", { ids });
    },
    onSuccess: (_, ids) => {
      toast({ title: "Approved", description: `${ids.length} item(s) approved` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ ids, reason }: { ids: number[]; reason: string }) => {
      await apiRequest("POST", "/api/admin/products/reject", { ids, reason });
    },
    onSuccess: (_, { ids }) => {
      toast({ title: "Rejected", description: `${ids.length} item(s) rejected` });
      setRejectingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
    },
  });

  const runExtraction = async () => {
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await apiRequest("POST", "/api/admin/extract-products", { episodeLimit: 25 });
      const result = await res.json();
      setLastExtraction({
        newCount: result.newCount || 0,
        coverage: result.transcriptCoverage || "100%",
        urlsSkipped: result.urlsSkipped || 0,
        episodeCount: result.episodeCount || 0,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      setFilter("pending");
    } catch (err: any) {
      setExtractError(err?.message || "Extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  const deleteAll = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/products/all", { method: "DELETE", credentials: "include" });
      const result = await res.json();
      toast({ title: "Deleted", description: result.message });
      setShowDeleteConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to delete", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const toggleTranscript = (id: number) => {
    setExpandedTranscripts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const rawProducts = data?.products || [];
  const stats = data?.stats || { pending: 0, approved: 0, rejected: 0 };
  const totalReviewed = stats.approved + stats.rejected;

  const products = [...rawProducts]
    .filter(p => {
      if (filter === "pending" && !p.purchase_url) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortMode === "newest") {
        return new Date(b.extracted_at).getTime() - new Date(a.extracted_at).getTime();
      }
      const scoreA = computeAdScore(a);
      const scoreB = computeAdScore(b);
      if (sortMode === "genuine_first") return scoreA - scoreB;
      return scoreB - scoreA;
    });

  const noUrlCount = filter === "pending" ? rawProducts.filter(p => !p.purchase_url).length : 0;

  const filterButtons: { mode: FilterMode; label: string; icon: typeof Clock; color: string }[] = [
    { mode: "pending", label: `Pending (${stats.pending})`, icon: Clock, color: "bg-yellow-100 text-yellow-700" },
    { mode: "approved", label: `Approved (${stats.approved})`, icon: CheckCircle2, color: "bg-green-100 text-green-700" },
    { mode: "rejected", label: `Rejected (${stats.rejected})`, icon: XCircle, color: "bg-red-100 text-red-700" },
    { mode: "all", label: "All", icon: Filter, color: "bg-gray-100 text-gray-700" },
  ];

  const sortButtons: { mode: SortMode; label: string }[] = [
    { mode: "genuine_first", label: "Genuine first" },
    { mode: "ads_first", label: "Likely ads first" },
    { mode: "newest", label: "Most recent" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2" data-testid="text-products-title">
            <ShoppingBag className="w-5 h-5 text-primary" />
            Product & Service Discovery
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Review extracted products. Items without a website/URL are auto-hidden.
          </p>
          {totalReviewed > 0 && (
            <p className="text-xs text-indigo-600 mt-1 font-medium">
              AI trained on {totalReviewed} decisions ({stats.approved} approved, {stats.rejected} rejected)
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="button-delete-all"
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2.5 rounded-xl text-sm font-bold bg-red-50 text-red-600 hover:bg-red-100 transition-colors flex items-center gap-2 border border-red-200"
          >
            <Trash2 className="w-4 h-4" />
            Delete All
          </button>
          <button
            data-testid="button-run-extraction"
            onClick={runExtraction}
            disabled={extracting}
            className="px-5 py-2.5 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {extracting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Extracting...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Extract (25 Episodes)
              </>
            )}
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between" data-testid="delete-confirm">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm font-bold">Delete ALL {stats.pending + stats.approved + stats.rejected} extracted products? This cannot be undone.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-gray-600 hover:bg-gray-100 transition-colors border"
            >
              Cancel
            </button>
            <button
              onClick={deleteAll}
              disabled={deleting}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-1"
              data-testid="button-confirm-delete"
            >
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Yes, Delete All
            </button>
          </div>
        </div>
      )}

      {extractError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm" data-testid="text-products-error">
          {extractError}
        </div>
      )}

      {extracting && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Scanning full transcripts across 25 episodes for products, services & experiences... this may take 3-5 minutes
          </p>
        </div>
      )}

      {lastExtraction && !extracting && (
        <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm flex items-center gap-3" data-testid="text-extraction-result">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>
            Found {lastExtraction.newCount} new items across {lastExtraction.episodeCount} episodes ({lastExtraction.coverage} transcript coverage)
            {lastExtraction.urlsSkipped ? ` · ${lastExtraction.urlsSkipped} skipped (dead URLs)` : ""}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {filterButtons.map(({ mode, label, icon: Icon, color }) => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                filter === mode ? color + " ring-2 ring-offset-1 ring-current" : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
              data-testid={`filter-products-${mode}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
          {sortButtons.map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                sortMode === mode ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300" : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
              data-testid={`sort-products-${mode}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {noUrlCount > 0 && filter === "pending" && (
        <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
          {noUrlCount} item{noUrlCount > 1 ? "s" : ""} hidden (no website/URL — too generic to review)
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Loading items...</div>
      ) : products.length === 0 ? (
        <div className="text-center py-10">
          <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {filter === "pending" ? "No items waiting for review. Run extraction to find new ones." :
             filter === "approved" ? "No approved items yet. Review pending items to build the training set." :
             filter === "rejected" ? "No rejected items yet." :
             "No items extracted yet. Click 'Extract' to scan episodes."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((p) => {
            const mention = MENTION_LABELS[p.mention_type || "discussion"] || MENTION_LABELS.discussion;
            const MentionIcon = mention.icon;
            const catInfo = CATEGORY_LABELS[p.category] || CATEGORY_LABELS.physical_product;
            const CatIcon = catInfo.icon;
            const showRejectPicker = rejectingId === p.id;
            const adScore = computeAdScore(p);
            const isTranscriptExpanded = expandedTranscripts.has(p.id);

            return (
              <div key={p.id} className={`rounded-xl border p-4 transition-all ${
                p.status === "approved" ? "bg-green-50/50 border-green-200" :
                p.status === "rejected" ? "bg-red-50/30 border-red-200 opacity-60" :
                adScore >= 65 ? "bg-red-50/20 border-red-100" :
                adScore <= 35 ? "bg-green-50/20 border-green-100" :
                "bg-white dark:bg-zinc-900 border-border"
              }`} data-testid={`card-product-${p.id}`}>
                <div className="flex gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-bold text-sm" data-testid={`text-product-name-${p.id}`}>{p.name}</span>
                      {p.company && (
                        <span className="text-xs text-muted-foreground">by {p.company}</span>
                      )}
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${catInfo.color}`}>
                        <CatIcon className="w-2.5 h-2.5" />
                        {catInfo.label}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${mention.color}`}>
                        <MentionIcon className="w-2.5 h-2.5" />
                        {mention.label}
                      </span>
                      {adScore >= 65 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                          ⚠ Likely ad
                        </span>
                      )}
                      {adScore <= 35 && p.status === "pending" && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-600">
                          ✓ Likely genuine
                        </span>
                      )}
                      {p.status === "approved" && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Approved
                        </span>
                      )}
                      {p.status === "rejected" && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                          <XCircle className="w-2.5 h-2.5" /> Rejected{p.rejection_reason ? `: ${p.rejection_reason.replace(/_/g, " ")}` : ""}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-muted-foreground mb-2">
                      {p.podcast_slug} · {p.episode_title?.substring(0, 80)}{(p.episode_title?.length || 0) > 80 ? "..." : ""}
                      {p.episode_slug && (
                        <a
                          href={`/podcasts/${p.podcast_slug}/${p.episode_slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 text-primary hover:underline inline-flex items-center gap-0.5"
                          data-testid={`link-episode-${p.id}`}
                        >
                          View <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>

                    {p.description && (
                      <p className="text-sm text-muted-foreground mb-2">{p.description}</p>
                    )}

                    {p.context && (
                      <div className="border-l-3 border-indigo-300 pl-4 mb-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-r-lg py-3 pr-3">
                        <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide">Why they recommend it</span>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap mt-1">{highlightTerms(p.context, [p.name, p.company || ""])}</p>
                      </div>
                    )}

                    <button
                      onClick={() => toggleTranscript(p.id)}
                      className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1 mb-2"
                      data-testid={`button-show-transcript-${p.id}`}
                    >
                      <FileText className="w-3 h-3" />
                      {isTranscriptExpanded ? "Hide" : "Show"} Transcript
                      {isTranscriptExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {isTranscriptExpanded && (
                      <TranscriptExcerptPanel productId={p.id} productName={p.name} company={p.company} />
                    )}

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {p.status === "pending" && (
                        <>
                          <button
                            onClick={() => approveMutation.mutate([p.id])}
                            disabled={approveMutation.isPending}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-500 text-white hover:bg-green-600 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                            data-testid={`button-approve-product-${p.id}`}
                          >
                            <ThumbsUp className="w-3 h-3" />
                            Feature This
                          </button>
                          <button
                            onClick={() => setRejectingId(showRejectPicker ? null : p.id)}
                            disabled={rejectMutation.isPending}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500 text-white hover:bg-red-600 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                            data-testid={`button-reject-product-${p.id}`}
                          >
                            <ThumbsDown className="w-3 h-3" />
                            Not a Fit
                          </button>
                          <AiCheckButton productId={p.id} />
                        </>
                      )}
                      {p.purchase_url && (
                        <a
                          href={p.purchase_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors flex items-center gap-1 whitespace-nowrap"
                          data-testid={`link-purchase-${p.id}`}
                        >
                          {p.purchase_url.includes("amazon") ? "Amazon" : "Website"} <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {showRejectPicker && (
                      <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-red-50 border border-red-200 mt-2">
                        <span className="text-xs font-bold text-red-700 mr-1">Why?</span>
                        {REJECT_REASONS.map(r => (
                          <button
                            key={r.value}
                            onClick={() => rejectMutation.mutate({ ids: [p.id], reason: r.value })}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white border border-red-200 text-red-700 hover:bg-red-100 transition-colors"
                            data-testid={`reject-reason-${r.value}-${p.id}`}
                          >
                            {r.label}
                          </button>
                        ))}
                        <button
                          onClick={() => setRejectingId(null)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors ml-1"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <hr className="border-t border-border my-6" />
      <ImageApprovalPanel />
    </div>
  );
}

type ImageFilterMode = "all" | "pending" | "approved" | "rejected";

interface ImageProduct {
  id: number;
  name: string;
  company: string | null;
  image_url: string | null;
  image_status: string;
  purchase_url: string | null;
  category: string;
}

function ImageApprovalPanel() {
  const { toast } = useToast();
  const [imageFilter, setImageFilter] = useState<ImageFilterMode>("pending");
  const [editingImageId, setEditingImageId] = useState<number | null>(null);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [summarizing, setSummarizing] = useState(false);

  const { data, isLoading } = useQuery<{ products: ImageProduct[]; stats: Record<string, number> }>({
    queryKey: ["/api/admin/products/images", imageFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/products/images?filter=${imageFilter}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest("POST", "/api/admin/products/image-approve", { ids });
    },
    onSuccess: (_, ids) => {
      toast({ title: "Image Approved", description: `${ids.length} image(s) approved` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products/images"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest("POST", "/api/admin/products/image-reject", { ids });
    },
    onSuccess: (_, ids) => {
      toast({ title: "Image Rejected", description: `${ids.length} image(s) rejected — product hidden from shop` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products/images"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, imageUrl }: { id: number; imageUrl: string }) => {
      await apiRequest("POST", "/api/admin/products/image-update", { id, imageUrl });
    },
    onSuccess: () => {
      toast({ title: "Image Updated", description: "New image saved and approved" });
      setEditingImageId(null);
      setNewImageUrl("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products/images"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
    },
  });

  const runSummarize = async () => {
    setSummarizing(true);
    try {
      const res = await apiRequest("POST", "/api/admin/products/summarize-contexts", {});
      const result = await res.json();
      toast({ title: "Summarization Complete", description: result.message });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to summarize", variant: "destructive" });
    } finally {
      setSummarizing(false);
    }
  };

  const products = data?.products || [];
  const stats = data?.stats || { pending: 0, approved: 0, rejected: 0 };

  const filterButtons: { mode: ImageFilterMode; label: string; color: string }[] = [
    { mode: "pending", label: `Needs Review (${stats.pending})`, color: "bg-yellow-100 text-yellow-700" },
    { mode: "approved", label: `Approved (${stats.approved})`, color: "bg-green-100 text-green-700" },
    { mode: "rejected", label: `Rejected (${stats.rejected})`, color: "bg-red-100 text-red-700" },
    { mode: "all", label: "All", color: "bg-gray-100 text-gray-700" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2" data-testid="text-image-approval-title">
            <Image className="w-5 h-5 text-primary" />
            Product Image Approval
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Approve, replace, or reject product images. Products with rejected/pending images are hidden from the shop.
          </p>
        </div>
        <button
          onClick={runSummarize}
          disabled={summarizing}
          className="px-4 py-2.5 rounded-xl text-sm font-bold bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors flex items-center gap-2 border border-violet-200 disabled:opacity-50"
          data-testid="button-summarize-contexts"
        >
          {summarizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {summarizing ? "Summarizing..." : "AI Summarize Contexts"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filterButtons.map(({ mode, label, color }) => (
          <button
            key={mode}
            onClick={() => setImageFilter(mode)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              imageFilter === mode ? color + " ring-2 ring-offset-1 ring-current" : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
            data-testid={`filter-images-${mode}`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Loading images...</div>
      ) : products.length === 0 ? (
        <div className="text-center py-10">
          <Image className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No products in this category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {products.map((p) => {
            const isEditing = editingImageId === p.id;
            const statusColor = p.image_status === "approved" ? "border-green-300 bg-green-50/50" :
                               p.image_status === "rejected" ? "border-red-300 bg-red-50/50" :
                               "border-yellow-300 bg-yellow-50/50";

            return (
              <div key={p.id} className={`rounded-xl border p-3 ${statusColor}`} data-testid={`image-card-${p.id}`}>
                <div className="w-full aspect-square rounded-lg mb-2 overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                      <Image className="w-8 h-8 opacity-30" />
                      <span className="text-[10px]">No image</span>
                    </div>
                  )}
                </div>

                <div className="text-sm font-bold truncate" data-testid={`image-product-name-${p.id}`}>{p.name}</div>
                {p.company && <div className="text-[11px] text-muted-foreground truncate">{p.company}</div>}

                <div className="flex items-center gap-1 mt-1 mb-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    p.image_status === "approved" ? "bg-green-100 text-green-700" :
                    p.image_status === "rejected" ? "bg-red-100 text-red-700" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>
                    {p.image_status === "approved" ? "✓ Approved" : p.image_status === "rejected" ? "✗ Rejected" : "⏳ Pending"}
                  </span>
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={newImageUrl}
                      onChange={(e) => setNewImageUrl(e.target.value)}
                      placeholder="Paste new image URL..."
                      className="w-full px-2.5 py-1.5 rounded-lg text-xs border bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-primary focus:outline-none"
                      data-testid={`input-image-url-${p.id}`}
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          if (newImageUrl.trim()) updateMutation.mutate({ id: p.id, imageUrl: newImageUrl.trim() });
                        }}
                        disabled={!newImageUrl.trim() || updateMutation.isPending}
                        className="flex-1 px-2 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1"
                        data-testid={`button-save-image-${p.id}`}
                      >
                        {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                        Save
                      </button>
                      <button
                        onClick={() => { setEditingImageId(null); setNewImageUrl(""); }}
                        className="px-2 py-1.5 rounded-lg text-xs font-bold bg-muted text-muted-foreground hover:bg-muted/80"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    {p.image_status !== "approved" && p.image_url && (
                      <button
                        onClick={() => approveMutation.mutate([p.id])}
                        disabled={approveMutation.isPending}
                        className="flex-1 px-2 py-1.5 rounded-lg text-xs font-bold bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-1"
                        data-testid={`button-approve-image-${p.id}`}
                      >
                        <CheckCircle2 className="w-3 h-3" /> Approve
                      </button>
                    )}
                    <button
                      onClick={() => { setEditingImageId(p.id); setNewImageUrl(p.image_url || ""); }}
                      className="flex-1 px-2 py-1.5 rounded-lg text-xs font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 flex items-center justify-center gap-1"
                      data-testid={`button-edit-image-${p.id}`}
                    >
                      <Upload className="w-3 h-3" /> Replace
                    </button>
                    {p.image_status !== "rejected" && (
                      <button
                        onClick={() => rejectMutation.mutate([p.id])}
                        disabled={rejectMutation.isPending}
                        className="flex-1 px-2 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 flex items-center justify-center gap-1"
                        data-testid={`button-reject-image-${p.id}`}
                      >
                        <XCircle className="w-3 h-3" /> Reject
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}