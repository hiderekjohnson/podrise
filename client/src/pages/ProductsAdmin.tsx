import { useState } from "react";
import { Loader2, ExternalLink, ShoppingBag, Play, Package, Radio } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Product {
  name: string;
  company: string;
  description: string;
  purchaseUrl: string;
  context: string;
  episodeTitle: string;
  episodeSlug: string | null;
  episodeId: number;
}

export default function ProductsAdmin() {
  const [products, setProducts] = useState<Product[]>([]);
  const [episodeCount, setEpisodeCount] = useState(0);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2" data-testid="text-products-title">
            <ShoppingBag className="w-5 h-5 text-primary" />
            Product Extraction Test
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Scans the last 10 My First Million episodes for purchasable products (excluding books, ads, and stocks).
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
          <p className="text-sm text-muted-foreground">Analyzing 10 episodes with AI... this takes about 30-60 seconds</p>
        </div>
      )}

      {hasRun && !loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 text-sm">
            <div className="glass-panel rounded-xl px-4 py-2 flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-primary" />
              <span className="font-bold">{episodeCount}</span>
              <span className="text-muted-foreground">episodes scanned</span>
            </div>
            <div className="glass-panel rounded-xl px-4 py-2 flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-green-500" />
              <span className="font-bold text-green-600">{products.length}</span>
              <span className="text-muted-foreground">products found</span>
            </div>
          </div>

          {products.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No products found in the last 10 episodes.
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
                    {eps.map((p, i) => (
                      <div key={i} className="bg-white dark:bg-zinc-900 rounded-xl border p-3 flex gap-4" data-testid={`card-product-${i}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-sm" data-testid={`text-product-name-${i}`}>{p.name}</span>
                            {p.company && (
                              <span className="text-xs text-muted-foreground">by {p.company}</span>
                            )}
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
                    ))}
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
