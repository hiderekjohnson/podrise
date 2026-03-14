import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, ExternalLink, ShoppingBag, Play, Package, Radio, FileText, Star, MessageSquare, ThumbsUp, ThumbsDown, Check, X, Filter, Clock, CheckCircle2, XCircle, Wrench, Globe } from "lucide-react";
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
}

type CategoryMode = "physical_product" | "service_or_tool";

const MENTION_LABELS: Record<string, { label: string; color: string; icon: typeof Star }> = {
  recommendation: { label: "Recommended", color: "bg-green-100 text-green-700", icon: ThumbsUp },
  personal_use: { label: "Personal Use", color: "bg-blue-100 text-blue-700", icon: Star },
  discussion: { label: "Discussed", color: "bg-zinc-100 text-zinc-600", icon: MessageSquare },
};

const PRODUCT_REJECT_REASONS = [
  { value: "not_specific_brand", label: "No specific brand" },
  { value: "software_or_app", label: "Software / app / service" },
  { value: "not_physical", label: "Not a physical product" },
  { value: "too_well_known", label: "Too well known" },
  { value: "sponsor_ad", label: "Sponsor / ad" },
  { value: "passing_mention", label: "Just a passing mention" },
  { value: "cant_buy_online", label: "Can't buy online" },
  { value: "not_interesting", label: "Not interesting enough" },
  { value: "book_or_media", label: "Book / media / digital" },
  { value: "enterprise_tool", label: "Enterprise / B2B (wrong category)" },
  { value: "other", label: "Other" },
];

const SERVICE_REJECT_REASONS = [
  { value: "not_specific_brand", label: "No specific brand" },
  { value: "physical_product", label: "Physical product (wrong category)" },
  { value: "too_well_known", label: "Too well known / obvious" },
  { value: "sponsor_ad", label: "Sponsor / ad" },
  { value: "passing_mention", label: "Just a passing mention" },
  { value: "not_interesting", label: "Not interesting enough" },
  { value: "investment_context", label: "Investment context only" },
  { value: "social_media", label: "Social media platform" },
  { value: "book_or_media", label: "Book / media content" },
  { value: "not_available", label: "Not publicly available" },
  { value: "other", label: "Other" },
];

type FilterMode = "all" | "pending" | "approved" | "rejected";

export default function ProductsAdmin() {
  const { toast } = useToast();
  const [category, setCategory] = useState<CategoryMode>("physical_product");
  const [filter, setFilter] = useState<FilterMode>("pending");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [lastExtraction, setLastExtraction] = useState<{ newCount: number; coverage: string; urlsSkipped?: number } | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ products: Product[]; stats: Record<string, number> }>({
    queryKey: ["/api/admin/products", filter, category],
    queryFn: async () => {
      const res = await fetch(`/api/admin/products?filter=${filter}&category=${category}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest("POST", "/api/admin/products/approve", { ids });
    },
    onSuccess: (_, ids) => {
      toast({ title: "Approved", description: `${ids.length} ${category === "service_or_tool" ? "service(s)" : "product(s)"} approved — AI will learn from this` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ ids, reason }: { ids: number[]; reason: string }) => {
      await apiRequest("POST", "/api/admin/products/reject", { ids, reason });
    },
    onSuccess: (_, { ids }) => {
      toast({ title: "Rejected", description: `${ids.length} ${category === "service_or_tool" ? "service(s)" : "product(s)"} rejected — AI will avoid similar ones` });
      setRejectingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
    },
  });

  const runExtraction = async () => {
    setExtracting(true);
    setExtractError(null);
    try {
      const endpoint = category === "service_or_tool" ? "/api/admin/extract-services" : "/api/admin/extract-products";
      const res = await apiRequest("POST", endpoint);
      const result = await res.json();
      setLastExtraction({
        newCount: result.newCount || 0,
        coverage: result.transcriptCoverage || "100%",
        urlsSkipped: result.urlsSkipped || 0,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      setFilter("pending");
    } catch (err: any) {
      setExtractError(err?.message || "Extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  const products = data?.products || [];
  const stats = data?.stats || { pending: 0, approved: 0, rejected: 0 };
  const totalReviewed = stats.approved + stats.rejected;

  const grouped = products.reduce((acc, p) => {
    const key = p.episode_title;
    if (!acc[key]) acc[key] = { episodeSlug: p.episode_slug, products: [] };
    acc[key].products.push(p);
    return acc;
  }, {} as Record<string, { episodeSlug: string | null; products: Product[] }>);

  const filterButtons: { mode: FilterMode; label: string; icon: typeof Clock; color: string }[] = [
    { mode: "pending", label: `Pending (${stats.pending})`, icon: Clock, color: "bg-yellow-100 text-yellow-700" },
    { mode: "approved", label: `Approved (${stats.approved})`, icon: CheckCircle2, color: "bg-green-100 text-green-700" },
    { mode: "rejected", label: `Rejected (${stats.rejected})`, icon: XCircle, color: "bg-red-100 text-red-700" },
    { mode: "all", label: "All", icon: Filter, color: "bg-gray-100 text-gray-700" },
  ];

  const isServices = category === "service_or_tool";
  const rejectReasons = isServices ? SERVICE_REJECT_REASONS : PRODUCT_REJECT_REASONS;
  const categoryLabel = isServices ? "Services & Tools" : "Physical Products";
  const extractLabel = isServices ? "Extract New Services" : "Extract New Products";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-1 rounded-xl bg-muted/50 w-fit" data-testid="category-tabs">
        <button
          onClick={() => { setCategory("physical_product"); setFilter("pending"); setLastExtraction(null); setExtractError(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
            category === "physical_product" ? "bg-white dark:bg-zinc-800 shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-physical-products"
        >
          <Package className="w-4 h-4" />
          Products
        </button>
        <button
          onClick={() => { setCategory("service_or_tool"); setFilter("pending"); setLastExtraction(null); setExtractError(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
            category === "service_or_tool" ? "bg-white dark:bg-zinc-800 shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-services"
        >
          <Globe className="w-4 h-4" />
          Services & Tools
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2" data-testid="text-products-title">
            {isServices ? <Globe className="w-5 h-5 text-primary" /> : <ShoppingBag className="w-5 h-5 text-primary" />}
            {isServices ? "Service & Tool Discovery" : "Product Discovery Engine"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {isServices
              ? "Approve or reject services & tools to train the AI. It learns from your decisions."
              : "Approve or reject products to train the AI. It learns from your decisions."}
          </p>
          {totalReviewed > 0 && (
            <p className="text-xs text-indigo-600 mt-1 font-medium">
              AI trained on {totalReviewed} {categoryLabel.toLowerCase()} decisions ({stats.approved} approved, {stats.rejected} rejected)
            </p>
          )}
        </div>
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
              {extractLabel}
            </>
          )}
        </button>
      </div>

      {extractError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm" data-testid="text-products-error">
          {extractError}
        </div>
      )}

      {extracting && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {isServices
              ? "Scanning transcripts for services & tools... this may take 1-2 minutes"
              : "Reading full transcripts across 10 episodes... this may take 1-2 minutes"}
          </p>
        </div>
      )}

      {lastExtraction && !extracting && (
        <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm flex items-center gap-3" data-testid="text-extraction-result">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>
            Found {lastExtraction.newCount} new {isServices ? "services/tools" : "products"} ({lastExtraction.coverage} transcript coverage)
            {lastExtraction.urlsSkipped ? ` · ${lastExtraction.urlsSkipped} skipped (dead URLs)` : ""}
          </span>
        </div>
      )}

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

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Loading {categoryLabel.toLowerCase()}...</div>
      ) : products.length === 0 ? (
        <div className="text-center py-10">
          {isServices ? <Globe className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" /> : <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />}
          <p className="text-sm text-muted-foreground">
            {filter === "pending" ? `No ${categoryLabel.toLowerCase()} waiting for review. Run extraction to find new ones.` :
             filter === "approved" ? `No approved ${categoryLabel.toLowerCase()} yet. Review pending items to build the training set.` :
             filter === "rejected" ? `No rejected ${categoryLabel.toLowerCase()} yet.` :
             `No ${categoryLabel.toLowerCase()} extracted yet. Click '${extractLabel}' to scan episodes.`}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([title, { episodeSlug, products: eps }]) => (
            <div key={title} className="glass-panel rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-sm">{title}</h4>
                {episodeSlug && (
                  <a
                    href={`/myfirstmillion/${episodeSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                    data-testid={`link-episode-${episodeSlug}`}
                  >
                    PodCap Page <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div className="space-y-3">
                {eps.map((p) => {
                  const mention = MENTION_LABELS[p.mention_type || "discussion"] || MENTION_LABELS.discussion;
                  const MentionIcon = mention.icon;
                  const showRejectPicker = rejectingId === p.id;

                  return (
                    <div key={p.id} className={`rounded-xl border p-4 transition-all ${
                      p.status === "approved" ? "bg-green-50/50 border-green-200" :
                      p.status === "rejected" ? "bg-red-50/30 border-red-200 opacity-60" :
                      "bg-white dark:bg-zinc-900 border-border"
                    }`} data-testid={`card-product-${p.id}`}>
                      <div className="flex gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-bold text-sm" data-testid={`text-product-name-${p.id}`}>{p.name}</span>
                            {p.company && (
                              <span className="text-xs text-muted-foreground">by {p.company}</span>
                            )}
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${mention.color}`}>
                              <MentionIcon className="w-2.5 h-2.5" />
                              {mention.label}
                            </span>
                            {isServices && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                                <Globe className="w-2.5 h-2.5" /> Service
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
                          {p.description && (
                            <p className="text-xs text-muted-foreground mb-2">{p.description}</p>
                          )}
                          {p.context && (
                            <p className="text-xs italic text-zinc-500 border-l-2 border-zinc-200 pl-2 mb-3">"{p.context}"</p>
                          )}

                          <div className="flex flex-wrap items-center gap-2">
                            {p.status === "pending" && (
                              <>
                                <button
                                  onClick={() => approveMutation.mutate([p.id])}
                                  disabled={approveMutation.isPending}
                                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-500 text-white hover:bg-green-600 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                  data-testid={`button-approve-product-${p.id}`}
                                >
                                  <ThumbsUp className="w-3 h-3" />
                                  {isServices ? "Feature This" : "Feature This"}
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
                              {rejectReasons.map(r => (
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
