import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ShoppingBag, ExternalLink, Mic, ArrowRight,
} from "lucide-react";
import { PodcastMicBadge } from "@/components/PodcastMicBadge";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { trackAffiliateUrl } from "@/lib/utils";

interface ProductEpisode {
  podcastSlug: string;
  podcastName: string;
  episodeSlug: string;
  episodeTitle: string;
  context: string | null;
}

interface RelatedProduct {
  name: string;
  company: string | null;
  type: string;
  slug: string;
  imageUrl: string | null;
  mentionCount: number;
  podcastCount: number;
}

interface ProductDetail {
  name: string;
  company: string | null;
  type: string;
  description: string;
  url: string;
  isAmazon: boolean;
  imageUrl: string | null;
  slug: string;
  contexts: string[];
  contextSummaries: string[];
  podcastBuzz: string | null;
  mentionCount: number;
  podcastCount: number;
  podcastNames: string[];
  episodes: ProductEpisode[];
  relatedProducts: RelatedProduct[];
}

function getTypeLabel(type: string) {
  const map: Record<string, string> = {
    service_or_tool: "Tool", physical_product: "Product", software: "Software",
    tool: "Tool", service: "Service", app: "App", course: "Course",
    newsletter: "Newsletter", supplement: "Supplement", game: "Game",
    website: "Website", product: "Product", experience: "Experience",
  };
  return map[type] || "Product";
}

function getTypeColor(type: string) {
  if (["service_or_tool", "software", "tool", "app"].includes(type))
    return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
  if (type === "experience" || type === "course")
    return "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20";
  if (type === "newsletter")
    return "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20";
  return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
}

function SEOHead({ product }: { product: ProductDetail }) {
  const title = `${product.name}${product.company && product.company !== product.name ? ` by ${product.company}` : ""} — Recommended on ${product.podcastCount} Podcast${product.podcastCount !== 1 ? "s" : ""} | PodCap`;
  const description = product.description
    ? `${product.description.slice(0, 130)}${product.description.length > 130 ? "..." : ""}`
    : `${product.name} has been recommended on ${product.podcastCount} podcast${product.podcastCount !== 1 ? "s" : ""} including ${product.podcastNames.slice(0, 2).join(" and ")}. See why podcasters love it.`;

  useEffect(() => {
    document.title = title;
    const setOrCreate = (attr: string, key: string, value: string) => {
      const selector = `meta[${attr}="${key}"]`;
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", value);
    };
    setOrCreate("name", "description", description);
    setOrCreate("property", "og:title", title);
    setOrCreate("property", "og:description", description);
    setOrCreate("property", "og:url", `https://podcap.io/shop/${product.slug}`);
    setOrCreate("property", "og:type", "product");
    setOrCreate("name", "twitter:card", "summary");
    setOrCreate("name", "twitter:title", title);
    setOrCreate("name", "twitter:description", description);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.href = `https://podcap.io/shop/${product.slug}`;

    let schemaScript = document.querySelector('script[data-product-schema]') as HTMLScriptElement;
    if (!schemaScript) {
      schemaScript = document.createElement("script");
      schemaScript.type = "application/ld+json";
      schemaScript.setAttribute("data-product-schema", "true");
      document.head.appendChild(schemaScript);
    }
    schemaScript.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      ...(product.description ? { description: product.description } : {}),
      ...(product.company ? { brand: { "@type": "Brand", name: product.company } } : {}),
      url: `https://podcap.io/shop/${product.slug}`,
    });
  }, [product, title, description]);

  return null;
}

function ArtworkTile({ slug, name, artworkUrl, onScroll }: {
  slug: string; name: string; artworkUrl: string; onScroll: () => void;
}) {
  return (
    <button
      onClick={onScroll}
      className="shrink-0 relative group block cursor-pointer"
      data-testid={`artwork-tile-${slug}`}
    >
      <div className="w-[88px] h-[88px] sm:w-[110px] sm:h-[110px] rounded-[14px] overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.18)] transition-transform group-hover:scale-105 group-hover:z-10">
        <img src={artworkUrl} alt={name} className="w-full h-full object-cover block" />
      </div>
      <div className="absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 translate-y-1 bg-[#09090B] text-white text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 group-hover:translate-y-0 transition-all pointer-events-none z-20">
        {name}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#09090B]" />
      </div>
    </button>
  );
}

function AppearanceCard({ ep, podcastArtwork }: { ep: ProductEpisode; podcastArtwork?: string }) {
  return (
    <div
      className="bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.08] rounded-xl overflow-hidden transition-all hover:border-[#6366F1]/30 hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)]"
      data-testid={`appearance-card-${ep.episodeSlug}`}
      data-podcast-slug={ep.podcastSlug}
    >
      <div className={`flex items-center gap-3.5 px-4 pt-3.5 pb-3 ${ep.context && ep.context.length > 20 ? "border-b border-[#F0F0F2] dark:border-white/[0.06]" : ""}`}>
        <div className="w-11 h-11 rounded-[10px] shrink-0 overflow-hidden bg-[#F7F7FC]">
          {podcastArtwork ? (
            <img src={podcastArtwork} alt={ep.podcastName} className="w-full h-full object-cover block" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-[#A1A1AA]">
              {ep.podcastName.substring(0, 3).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-[#09090B] dark:text-white leading-tight">
            <Link href={`/podcasts/${ep.podcastSlug}`} className="hover:text-[#6366F1] transition-colors" data-testid={`podcast-link-${ep.podcastSlug}`}>
              {ep.podcastName}
            </Link>
          </div>
          <Link
            href={`/podcasts/${ep.podcastSlug}/${ep.episodeSlug}`}
            className="text-[13px] text-[#6366F1] font-medium mt-0.5 block hover:underline truncate"
            data-testid={`episode-link-${ep.episodeSlug}`}
          >
            {ep.episodeTitle}
          </Link>
        </div>
      </div>
      {ep.context && ep.context.length > 20 && (
        <div className="px-4 py-4">
          <div className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#6366F1] mb-2.5 flex items-center gap-1.5">
            Why they talked about it
            <span className="flex-1 h-px bg-[#F0F0F2] dark:bg-white/[0.06]" />
          </div>
          <p className="text-[15px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.85]">
            {ep.context}
          </p>
        </div>
      )}
    </div>
  );
}

function RelatedProductCard({ product }: { product: RelatedProduct }) {
  const [imgError, setImgError] = useState(false);
  const hasImage = product.imageUrl && !imgError;

  return (
    <Link
      href={`/shop/${product.slug}`}
      className="bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.08] rounded-xl p-3 transition-all hover:border-[#6366F1]/30 hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)] block"
      data-testid={`related-product-${product.slug}`}
    >
      <div className="w-full aspect-square rounded-lg mb-2 overflow-hidden flex items-center justify-center bg-[#FAFAFA] dark:bg-white/[0.02]">
        {hasImage ? (
          <img src={product.imageUrl!} alt={product.name} className="w-full h-full object-cover" loading="lazy" onError={() => setImgError(true)} />
        ) : (
          <ShoppingBag className="w-8 h-8 text-[#A1A1AA]/30" />
        )}
      </div>
      <div className="text-[13px] font-semibold text-[#09090B] dark:text-white leading-snug line-clamp-2 mb-0.5">
        {product.name}
      </div>
      {product.company && product.company !== product.name && (
        <div className="text-[12px] text-[#A1A1AA] line-clamp-1">{product.company}</div>
      )}
    </Link>
  );
}

export default function ProductDetailPage({ slug }: { slug: string }) {
  const { data: product, isLoading, error } = useQuery<ProductDetail>({
    queryKey: ["/api/shop/product", slug],
    enabled: !!slug,
  });

  const [visibleCards, setVisibleCards] = useState(6);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (!product) return;
    let observer: IntersectionObserver | null = null;
    const timer = setTimeout(() => {
      if (!heroRef.current) return;
      observer = new IntersectionObserver(
        ([entry]) => setShowStickyBar(!entry.isIntersecting),
        { threshold: 0.1 }
      );
      observer.observe(heroRef.current);
    }, 300);
    return () => { clearTimeout(timer); observer?.disconnect(); };
  }, [product]);

  const podcastArtworkMap = useMemo(() => {
    const map = new Map<string, { slug: string; name: string; artworkUrl: string }>();
    for (const p of PODCAST_LANDINGS) {
      map.set(p.slug, { slug: p.slug, name: p.name, artworkUrl: p.artworkUrl });
    }
    return map;
  }, []);

  const featuredPodcasts = useMemo(() => {
    if (!product) return [];
    const seen = new Set<string>();
    const result: { slug: string; name: string; artworkUrl: string }[] = [];
    for (const ep of product.episodes) {
      if (seen.has(ep.podcastSlug)) continue;
      seen.add(ep.podcastSlug);
      const info = podcastArtworkMap.get(ep.podcastSlug);
      if (info) result.push(info);
    }
    return result;
  }, [product, podcastArtworkMap]);

  const visibleEpisodes = product ? product.episodes.slice(0, visibleCards) : [];
  const hasMore = product ? product.episodes.length > visibleCards : false;
  const hasImage = product?.imageUrl && !imgError;

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F7FC] dark:bg-[#08080F]">
        <SiteHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#6366F1] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F7FC] dark:bg-[#08080F]">
        <SiteHeader />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <ShoppingBag className="w-12 h-12 text-[#A1A1AA]/30" />
          <h1 className="text-xl font-bold text-[#09090B] dark:text-white">Product not found</h1>
          <Link href="/shop" className="text-[#6366F1] hover:text-[#6366F1]/80 font-medium" data-testid="link-back-shop">Back to Shop</Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F7FC] dark:bg-[#08080F]">
      <SEOHead product={product} />
      <SiteHeader />

      <div
        className={`fixed left-0 right-0 z-[55] bg-white/95 dark:bg-[#08080F]/95 backdrop-blur-md border-b border-[#F0F0F2] dark:border-white/[0.08] transition-all duration-300 ${showStickyBar ? "top-[69px] opacity-100" : "top-[12px] opacity-0 pointer-events-none"}`}
        data-testid="sticky-bar"
      >
        <div className="max-w-[960px] mx-auto px-5 sm:px-8 flex items-center gap-3 h-[56px]">
          {hasImage && (
            <img src={product.imageUrl!} alt="" className="w-7 h-7 rounded-md object-cover shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-[#09090B] dark:text-white truncate">{product.name}</div>
          </div>
          {product.url && (
            <a
              href={product.isAmazon ? trackAffiliateUrl(product.url, product.name, "product") : product.url}
              target="_blank"
              rel={product.isAmazon ? "sponsored noopener noreferrer" : "noopener noreferrer"}
              className={`rounded-lg px-4 py-2 text-[14px] font-bold transition-colors flex items-center gap-1.5 shadow-sm ${
                product.isAmazon
                  ? "bg-[#FF9900] hover:bg-[#E88B00] text-[#0F1111]"
                  : "bg-[#6366F1] hover:bg-[#4F46E5] text-white"
              }`}
              data-testid="sticky-visit"
            >
              {product.isAmazon ? "Buy on Amazon" : "Visit Website"}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      <main className="flex-1">
        <div className="max-w-[960px] mx-auto px-5 sm:px-8 pt-8 pb-24">

          <div className="text-[13px] text-[#A1A1AA] mb-6 flex items-center gap-2" data-testid="breadcrumb">
            <Link href="/" className="text-[#52525B] hover:text-[#6366F1] transition-colors">Home</Link>
            <span>›</span>
            <Link href="/shop" className="text-[#52525B] hover:text-[#6366F1] transition-colors">Shop</Link>
            <span>›</span>
            <span>{product.name}</span>
          </div>

          <div ref={heroRef} className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start mb-8" data-testid="section-hero">
            <div className={`w-[200px] h-[200px] sm:w-[240px] sm:h-[240px] rounded-2xl shrink-0 overflow-hidden flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.12)] ${hasImage ? "" : "bg-gradient-to-br from-[#F7F7FC] to-[#E4E4E7] dark:from-white/[0.04] dark:to-white/[0.02]"}`}>
              {hasImage ? (
                <img src={product.imageUrl!} alt={product.name} className="w-full h-full object-cover" onError={() => setImgError(true)} />
              ) : (
                <ShoppingBag className="w-16 h-16 text-[#A1A1AA]/25" />
              )}
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <span className={`text-[12px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border ${getTypeColor(product.type)}`}>
                  {getTypeLabel(product.type)}
                </span>
              </div>
              <h1 className="text-[28px] sm:text-[34px] font-bold leading-[1.1] tracking-tight text-[#09090B] dark:text-white mb-1.5" data-testid="heading-product-title">
                {product.name}
              </h1>
              {product.company && product.company !== product.name && (
                <p className="text-[16px] text-[#52525B] dark:text-[#A1A1AA] mb-3" data-testid="text-product-company">
                  by {product.company}
                </p>
              )}

              <div className="mb-4">
                <PodcastMicBadge count={product.podcastCount} size="lg" />
              </div>

              <div className="flex items-center gap-3 mb-5">
                {product.url && (
                  <a
                    href={product.isAmazon ? trackAffiliateUrl(product.url, product.name, "product") : product.url}
                    target="_blank"
                    rel={product.isAmazon ? "sponsored noopener noreferrer" : "noopener noreferrer"}
                    className={`rounded-lg px-5 py-2.5 text-[14px] font-bold transition-colors flex items-center gap-2 shadow-sm ${
                      product.isAmazon
                        ? "bg-[#FF9900] hover:bg-[#E88B00] text-[#0F1111]"
                        : "bg-[#6366F1] hover:bg-[#4F46E5] text-white"
                    }`}
                    data-testid="button-visit-hero"
                  >
                    {product.isAmazon ? "Buy on Amazon" : "Visit Website"}
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>

              {featuredPodcasts.length > 0 && (
                <>
                  <p className="text-[11px] font-bold tracking-[1px] uppercase text-[#A1A1AA] mb-2.5">Recommended on</p>
                  <div className="flex gap-2.5 flex-wrap" data-testid="artwork-strip">
                    {featuredPodcasts.slice(0, 7).map(p => (
                      <ArtworkTile
                        key={p.slug}
                        slug={p.slug}
                        name={p.name}
                        artworkUrl={p.artworkUrl}
                        onScroll={() => document.getElementById("appearances")?.scrollIntoView({ behavior: "smooth" })}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {product.description && (
            <div className="bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.08] rounded-xl px-5 py-4 mb-7 shadow-[0_1px_3px_rgba(0,0,0,0.07)]" data-testid="section-description">
              <p className="text-[12px] font-bold tracking-[1.5px] uppercase text-[#A1A1AA] mb-2">About this product</p>
              <p className="text-[16px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.75]">
                {product.description}
              </p>
            </div>
          )}

          {(product.podcastBuzz || product.contextSummaries?.length > 0 || product.contexts.length > 0) && (
            <div className="bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.08] border-l-[3px] border-l-[#6366F1] rounded-[0_12px_12px_0] px-5 py-4 mb-7 shadow-[0_1px_3px_rgba(0,0,0,0.07)]" data-testid="section-context">
              <div className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#6366F1] mb-2">What top podcasters are saying</div>
              {product.podcastBuzz ? (
                <p className="text-[16px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.75]" data-testid="text-podcast-buzz">
                  {product.podcastBuzz}
                </p>
              ) : (
                <div className="space-y-3">
                  {(product.contextSummaries?.length > 0 ? product.contextSummaries : product.contexts).slice(0, 3).map((ctx, i) => (
                    <p key={i} className="text-[15px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.85]">
                      {ctx}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {product.episodes.length > 0 && (
            <>
              <h2 className="text-[20px] font-bold tracking-tight text-[#09090B] dark:text-white mb-4 scroll-mt-[140px]" id="appearances" data-testid="heading-appearances">
                Episodes mentioning {product.name}
              </h2>

              <div className="space-y-3">
                {visibleEpisodes.map(ep => (
                  <AppearanceCard
                    key={`${ep.podcastSlug}-${ep.episodeSlug}`}
                    ep={ep}
                    podcastArtwork={podcastArtworkMap.get(ep.podcastSlug)?.artworkUrl}
                  />
                ))}
              </div>

              {hasMore && (
                <div className="text-center pt-2.5 pb-1">
                  <button
                    onClick={() => setVisibleCards(prev => prev + 6)}
                    className="text-sm text-[#6366F1] font-semibold hover:underline"
                    data-testid="button-see-more-mentions"
                  >
                    See more mentions ↓
                  </button>
                </div>
              )}

              <hr className="border-t border-[#F0F0F2] dark:border-white/[0.06] my-7" />
            </>
          )}

          {product.relatedProducts.length > 0 && (
            <>
              <div className="text-[18px] font-bold text-[#09090B] dark:text-white mb-4" data-testid="heading-related">
                Similar products from podcasts
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5" data-testid="related-products-grid">
                {product.relatedProducts.slice(0, 6).map(rp => (
                  <RelatedProductCard key={rp.slug} product={rp} />
                ))}
              </div>
            </>
          )}

          {(product.isAmazon || product.url) && (
            <div className="bg-[#6366F1]/[0.03] dark:bg-[#6366F1]/[0.06] border border-[#6366F1]/[0.08] rounded-xl px-5 py-3 mt-7" data-testid="affiliate-disclosure">
              <p className="text-[13px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed">
                Some links are affiliate links — they help keep PodCap free, and we only feature products highly recommended by your favorite podcasters, never random picks.{" "}
                <Link href="/disclosure" className="text-[#6366F1] hover:underline font-medium">Learn more</Link>
              </p>
            </div>
          )}

        </div>
      </main>

      <Footer />
    </div>
  );
}
