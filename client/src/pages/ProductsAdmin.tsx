import { useState } from "react";
import { Loader2, ExternalLink, ShoppingBag, Play, Package, Radio, FileText, Star, MessageSquare, ThumbsUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Product {
  name: string;
  company: string;
  description: string;
  purchaseUrl: string;
  context: string;
  mentionType: "recommendation" | "discussion" | "personal_use";
  episodeTitle: string;
  episodeSlug: string | null;
  episodeId: number;
}

const MENTION_LABELS: Record<string, { label: string; color: string; icon: typeof Star }> = {
  recommendation: { label: "Recommended", color: "bg-green-100 text-green-700", icon: ThumbsUp },
  personal_use: { label: "Personal Use", color: "bg-blue-100 text-blue-700", icon: Star },
  discussion: { label: "Discussed", color: "bg-zinc-100 text-zinc-600", icon: MessageSquare },
};

export default function ProductsAdmin() {
  const [products, setProducts] = useState<Product[]>([]);
  const [episodeCount, setEpisodeCount] = useState(0);
  const [transcriptCoverage, setTranscriptCoverage] = useState("");
  const [totalCharsProcessed, setTotalCharsProcessed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const runExtraction = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/admin/extract-products");
      const data = await res.json();
      setProducts(data.products || []);
      setEpisodeCount(data.episodeCount || 0);
      setTranscriptCoverage(data.transcriptCoverage || "");
      setTotalCharsProcessed(data.totalCharsProcessed || 0);
      setHasRun(true);
    } catch (err: any) {
      setError(err?.message || "Failed to extract products");
    } finally {
      setLoading(false);
    }
  };

  const grouped = products.reduce((acc, p) => {
    const key = p.episodeTitle;
    if (!acc[key]) acc[key] = { episodeSlug: p.episodeSlug, products: [] };
    acc[key].products.push(p);
    return acc;
  }, {} as Record<string, { episodeSlug: string | null; products: Product[] }>);

  const episodesWithProducts = Object.keys(grouped).length;
  const episodesWithNone = episodeCount - episodesWithProducts;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2" data-testid="text-products-title">
            <ShoppingBag className="w-5 h-5 text-primary" />
            Product Discovery Engine
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Scans full MFM transcripts for discovery-worthy products listeners would actually want to buy.
          </p>
        </div>
        <button
          data-testid="button-run-extraction"
          onClick={runExtraction}
          disabled={loading}
          className="px-5 py-2.5 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Extracting...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Run Extraction
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm" data-testid="text-products-error">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Reading full transcripts across 10 episodes... this may take 1-2 minutes</p>
        </div>
      )}

      {hasRun && !loading && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="glass-panel rounded-xl px-4 py-2 flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-primary" />
              <span className="font-bold">{episodeCount}</span>
              <span className="text-muted-foreground">episodes</span>
            </div>
            <div className="glass-panel rounded-xl px-4 py-2 flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-green-500" />
              <span className="font-bold text-green-600">{products.length}</span>
              <span className="text-muted-foreground">products found</span>
            </div>
            <div className="glass-panel rounded-xl px-4 py-2 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-indigo-500" />
              <span className="font-bold text-indigo-600">{transcriptCoverage}</span>
              <span className="text-muted-foreground">transcript coverage</span>
            </div>
            {totalCharsProcessed > 0 && (
              <div className="glass-panel rounded-xl px-4 py-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{Math.round(totalCharsProcessed / 1000)}K chars processed</span>
              </div>
            )}
          </div>

          {episodesWithNone > 0 && (
            <p className="text-xs text-muted-foreground italic">
              {episodesWithNone} episode{episodesWithNone !== 1 ? "s" : ""} had zero qualifying products (this is expected with the higher quality bar).
            </p>
          )}

          {products.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No discovery-worthy products found in the last 10 episodes. This means nothing met the quality bar — the engine is working correctly.
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
                    {eps.map((p, i) => {
                      const mention = MENTION_LABELS[p.mentionType] || MENTION_LABELS.discussion;
                      const MentionIcon = mention.icon;
                      return (
                        <div key={i} className="bg-white dark:bg-zinc-900 rounded-xl border p-3 flex gap-4" data-testid={`card-product-${i}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-sm" data-testid={`text-product-name-${i}`}>{p.name}</span>
                              {p.company && (
                                <span className="text-xs text-muted-foreground">by {p.company}</span>
                              )}
                              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${mention.color}`}>
                                <MentionIcon className="w-2.5 h-2.5" />
                                {mention.label}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">{p.description}</p>
                            <p className="text-xs italic text-zinc-500 border-l-2 border-zinc-200 pl-2">"{p.context}"</p>
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                            {p.purchaseUrl && (
                              <a
                                href={p.purchaseUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors flex items-center gap-1 whitespace-nowrap"
                                data-testid={`link-purchase-${i}`}
                              >
                                {p.purchaseUrl.includes("amazon") ? "Amazon" : "Website"} <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                            {episodeSlug && (
                              <a
                                href={`/myfirstmillion/${episodeSlug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1 whitespace-nowrap"
                                data-testid={`link-episode-product-${i}`}
                              >
                                Episode <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
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
      )}

      {!hasRun && !loading && (
        <div className="text-center py-16">
          <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Click "Run Extraction" to scan MFM episodes for products</p>
        </div>
      )}
    </div>
  );
}
