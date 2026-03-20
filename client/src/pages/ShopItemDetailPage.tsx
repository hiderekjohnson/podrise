import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "wouter";
import { BookOpen, ShoppingBag, ExternalLink, ChevronDown, FileText, ArrowLeft } from "lucide-react";
import { BookCover as SharedBookCover } from "@/components/BookCover";
import { PodcastMicBadge } from "@/components/PodcastMicBadge";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { PEOPLE_DIRECTORY } from "@/data/entityDirectoryData";
import { trackAffiliateUrl } from "@/lib/utils";

const PEOPLE_SLUG_MAP: Record<string, string> = {};
PEOPLE_DIRECTORY.forEach(p => { PEOPLE_SLUG_MAP[p.name.toLowerCase()] = p.slug; });

interface ShopEpisode {
  podcastSlug: string;
  podcastName: string;
  episodeSlug: string;
  episodeTitle: string;
  context: string;
  publishedAt: string | null;
  hosts?: string | null;
  guests?: string | null;
  recommendedBy?: string | null;
  recommenderRole?: "host" | "guest" | "author" | null;
}

interface RelatedItem {
  name: string;
  slug: string;
  mentionCount: number;
  author?: string | null;
  company?: string | null;
  type?: string;
  asin?: string | null;
  googleBooksId?: string | null;
  isbn?: string | null;
  hasCover?: boolean | null;
  topics?: string[];
  imageUrl?: string | null;
  podcastCount?: number;
}

interface TopHost {
  name: string;
  count: number;
}

interface BookData {
  name: string;
  author: string | null;
  description: string | null;
  podcastBuzz: string | null;
  slug: string;
  asin: string | null;
  googleBooksId: string | null;
  isbn: string | null;
  hasCover: boolean | null;
  amazonUrl: string;
  audibleUrl: string;
  blinkistUrl: string | null;
  topics: string[];
  rating: number | null;
  ratingCount: number | null;
  pageCount: number | null;
  publishYear: number | null;
  podcastScore: number | null;
  mentionCount: number;
  podcastCount: number;
  podcastNames: string[];
  firstMentioned: string | null;
  lastMentioned: string | null;
  topHosts: TopHost[];
  episodes: ShopEpisode[];
  relatedBooks: RelatedItem[];
}

interface ProductData {
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
  episodes: ShopEpisode[];
  relatedProducts: RelatedItem[];
}

type ItemKind = "book" | "product";

interface NormalizedItem {
  kind: ItemKind;
  name: string;
  subtitle: string | null;
  description: string | null;
  podcastBuzz: string | null;
  podcastBuzzFallback: string[] | null;
  slug: string;
  podcastCount: number;
  mentionCount: number;
  podcastNames: string[];
  episodes: ShopEpisode[];
  relatedItems: RelatedItem[];
  primaryUrl: string | null;
  primaryUrlLabel: string;
  primaryUrlIsAmazon: boolean;
  blinkistUrl: string | null;
  imageUrl: string | null;
  productType: string | null;
  pageCount: number | null;
  publishYear: number | null;
  amazonUrl: string | null;
  hasCover: boolean | null;
  raw: BookData | ProductData;
}

function normalizeBook(book: BookData): NormalizedItem {
  return {
    kind: "book",
    name: book.name,
    subtitle: book.author ? `by ${book.author}` : null,
    description: book.description,
    podcastBuzz: book.podcastBuzz,
    podcastBuzzFallback: null,
    slug: book.slug,
    podcastCount: book.podcastCount,
    mentionCount: book.mentionCount,
    podcastNames: book.podcastNames,
    episodes: book.episodes,
    relatedItems: book.relatedBooks,
    primaryUrl: book.amazonUrl || null,
    primaryUrlLabel: "Buy on Amazon",
    primaryUrlIsAmazon: true,
    blinkistUrl: book.blinkistUrl,
    imageUrl: null,
    productType: null,
    pageCount: book.pageCount,
    publishYear: book.publishYear,
    amazonUrl: book.amazonUrl || null,
    hasCover: book.hasCover,
    raw: book,
  };
}

function normalizeProduct(product: ProductData): NormalizedItem {
  return {
    kind: "product",
    name: product.name,
    subtitle: product.company && product.company !== product.name ? `by ${product.company}` : null,
    description: product.description || null,
    podcastBuzz: product.podcastBuzz,
    podcastBuzzFallback: product.podcastBuzz ? null : (product.contextSummaries?.length > 0 ? product.contextSummaries : product.contexts.length > 0 ? product.contexts : null),
    slug: product.slug,
    podcastCount: product.podcastCount,
    mentionCount: product.mentionCount,
    podcastNames: product.podcastNames,
    episodes: product.episodes,
    relatedItems: product.relatedProducts,
    primaryUrl: product.url || null,
    primaryUrlLabel: product.isAmazon ? "Buy on Amazon" : "Visit Website",
    primaryUrlIsAmazon: product.isAmazon,
    blinkistUrl: null,
    imageUrl: product.imageUrl,
    productType: product.type,
    pageCount: null,
    publishYear: null,
    amazonUrl: product.isAmazon ? product.url : null,
    hasCover: null,
    raw: product,
  };
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

function formatMonthYear(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function setOrCreateMeta(attr: string, key: string, value: string) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}

function SEOHead({ item }: { item: NormalizedItem }) {
  const isBook = item.kind === "book";
  const title = isBook
    ? `Why ${item.podcastCount} Podcasts Recommend ${item.name}${item.subtitle ? ` ${item.subtitle}` : ""} | PodRise`
    : `${item.name}${item.subtitle ? ` ${item.subtitle}` : ""} — Recommended on ${item.podcastCount} Podcast${item.podcastCount !== 1 ? "s" : ""} | PodRise`;

  const description = isBook
    ? `${item.name} has been featured on ${item.podcastCount} podcasts including ${item.podcastNames.slice(0, 2).join(" and ")}${item.podcastNames.length > 2 ? " and more" : ""}. See who recommends it and what they say.`
    : item.description
      ? `${item.description.slice(0, 130)}${item.description.length > 130 ? "..." : ""}`
      : `${item.name} has been recommended on ${item.podcastCount} podcast${item.podcastCount !== 1 ? "s" : ""} including ${item.podcastNames.slice(0, 2).join(" and ")}. See why podcasters love it.`;

  useEffect(() => {
    document.title = title;
    setOrCreateMeta("name", "description", description);
    setOrCreateMeta("property", "og:title", title);
    setOrCreateMeta("property", "og:description", description);
    setOrCreateMeta("property", "og:url", `https://podrise.com/shop/${item.slug}`);
    setOrCreateMeta("property", "og:type", isBook ? "book" : "product");
    setOrCreateMeta("name", "twitter:card", "summary");
    setOrCreateMeta("name", "twitter:title", title);
    setOrCreateMeta("name", "twitter:description", description);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.href = `https://podrise.com/shop/${item.slug}`;

    const schemaAttr = isBook ? "data-book-schema" : "data-product-schema";
    let schemaScript = document.querySelector(`script[${schemaAttr}]`) as HTMLScriptElement;
    if (!schemaScript) {
      schemaScript = document.createElement("script");
      schemaScript.type = "application/ld+json";
      schemaScript.setAttribute(schemaAttr, "true");
      document.head.appendChild(schemaScript);
    }

    if (isBook) {
      const book = item.raw as BookData;
      schemaScript.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Book",
        name: item.name,
        ...(book.author ? { author: { "@type": "Person", name: book.author } } : {}),
        ...(item.description ? { description: item.description } : {}),
        ...(book.publishYear ? { datePublished: String(book.publishYear) } : {}),
        ...(book.pageCount ? { numberOfPages: book.pageCount } : {}),
        url: `https://podrise.com/shop/${item.slug}`,
      });
    } else {
      const product = item.raw as ProductData;
      schemaScript.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        name: item.name,
        ...(item.description ? { description: item.description } : {}),
        ...(product.company ? { brand: { "@type": "Brand", name: product.company } } : {}),
        url: `https://podrise.com/shop/${item.slug}`,
      });
    }
  }, [item, title, description, isBook]);

  return null;
}

function AuthorWithLinks({ author }: { author: string }) {
  const parts = author.split(/(\s+and\s+)/i);
  return (
    <>
      {parts.map((part, i) => {
        const slug = PEOPLE_SLUG_MAP[part.trim().toLowerCase()];
        if (slug) {
          return (
            <Link key={i} href={`/people/${slug}`} className="text-[#6366F1] font-medium hover:underline">
              {part}
            </Link>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function HeroCover({ title, slug, size = "default" }: { title: string; slug: string; size?: "default" | "sticky" }) {
  const [failed, setFailed] = useState(false);
  const dims = size === "sticky"
    ? "w-[28px] h-[42px]"
    : "w-[230px] h-[345px] sm:w-[270px] sm:h-[405px]";
  const radius = size === "sticky" ? "rounded-[2px_3px_3px_2px]" : "rounded-[4px_8px_8px_4px]";
  const shadow = size === "sticky"
    ? "shadow-sm"
    : "shadow-[0_8px_30px_rgba(0,0,0,0.15),_-2px_0_0_rgba(0,0,0,0.15)]";

  if (failed) {
    return (
      <div className={`${dims} ${radius} bg-gradient-to-br from-[#1a1a2e] via-[#0f2145] to-[#0a1628] flex flex-col items-center justify-center p-3 text-center relative shrink-0 ${shadow}`}>
        {size === "default" && (
          <>
            <div className="absolute left-0 top-0 bottom-0 w-[10px] bg-white/[0.04] border-r border-white/[0.06] rounded-l-[4px]" />
            <div className="font-serif text-2xl font-bold text-[#e2c27d] leading-none mb-2">{title.length > 30 ? title.substring(0, 28) + "…" : title}</div>
            <div className="w-5 h-px bg-[#e2c27d]/30 mx-auto mb-2" />
          </>
        )}
      </div>
    );
  }

  return (
    <img
      src={`/books/${slug}.jpg`}
      alt={title}
      className={`${dims} ${radius} object-cover shrink-0 ${shadow}`}
      onError={() => setFailed(true)}
    />
  );
}

function ProductHeroImage({ imageUrl, name, onError }: { imageUrl: string | null; name: string; onError: () => void }) {
  const [imgError, setImgError] = useState(false);
  const hasImage = imageUrl && !imgError;
  return (
    <div className={`w-[200px] h-[200px] sm:w-[240px] sm:h-[240px] rounded-2xl shrink-0 overflow-hidden flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.12)] ${hasImage ? "bg-[#FAFAFA] dark:bg-white/[0.02] p-4" : "bg-gradient-to-br from-[#F7F7FC] to-[#E4E4E7] dark:from-white/[0.04] dark:to-white/[0.02]"}`}>
      {hasImage ? (
        <img src={imageUrl!} alt={name} className="max-w-full max-h-full object-contain" onError={() => { setImgError(true); onError(); }} />
      ) : (
        <ShoppingBag className="w-16 h-16 text-[#A1A1AA]/25" />
      )}
    </div>
  );
}

function ArtworkTile({ slug, name, artworkUrl, onScroll }: { slug: string; name: string; artworkUrl: string; onScroll: () => void }) {
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

function AppearanceCard({ ep, podcastArtwork }: { ep: ShopEpisode; podcastArtwork?: string }) {
  return (
    <div
      className="bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.08] rounded-xl overflow-hidden transition-all hover:border-[#6366F1]/30 hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)]"
      data-testid={`appearance-card-${ep.episodeSlug}`}
      data-podcast-slug={ep.podcastSlug}
    >
      <div className="flex items-center gap-3.5 px-4 pt-3.5 pb-3 border-b border-[#F0F0F2] dark:border-white/[0.06]">
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
        {ep.publishedAt && (
          <div className="text-[13px] text-[#A1A1AA] whitespace-nowrap self-start mt-0.5">
            {formatMonthYear(ep.publishedAt)}
          </div>
        )}
      </div>
      {ep.context && ep.context.length > 20 && (
        <div className="px-4 py-4">
          <div className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#6366F1] mb-2.5 flex items-center gap-1.5">
            Why they talked about it
            <span className="flex-1 h-px bg-[#F0F0F2] dark:bg-white/[0.06]" />
          </div>
          <div className="text-[15px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.85] [&_strong]:text-[#18181B] dark:[&_strong]:text-white [&_strong]:font-semibold" dangerouslySetInnerHTML={{ __html: ep.context.replace(/<(?!\/?strong\b)[^>]*>/gi, '') }} />
        </div>
      )}
    </div>
  );
}

function RelatedBookCard({ item }: { item: RelatedItem }) {
  return (
    <Link
      href={`/shop/${item.slug}`}
      className="bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.08] rounded-xl p-3 transition-all hover:border-[#6366F1]/30 hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)] block"
      data-testid={`related-book-${item.slug}`}
    >
      <div className="w-full aspect-[2/3] rounded-md mb-2 overflow-hidden flex items-center justify-center bg-[#F7F7FC]">
        <SharedBookCover
          title={item.name}
          slug={item.slug}
          size="sm"
          className="w-full h-full rounded-md object-cover"
        />
      </div>
      <div className="text-[13px] font-semibold text-[#09090B] dark:text-white leading-snug line-clamp-2 mb-0.5">
        {item.name}
      </div>
      {item.author && (
        <div className="text-[12px] text-[#A1A1AA] line-clamp-1">{item.author}</div>
      )}
    </Link>
  );
}

function RelatedProductCard({ item }: { item: RelatedItem }) {
  const [imgError, setImgError] = useState(false);
  const hasImage = item.imageUrl && !imgError;

  return (
    <Link
      href={`/shop/${item.slug}`}
      className="bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.08] rounded-xl p-3 transition-all hover:border-[#6366F1]/30 hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)] block"
      data-testid={`related-product-${item.slug}`}
    >
      <div className="w-full aspect-[3/4] rounded-lg mb-2 overflow-hidden flex items-center justify-center bg-[#FAFAFA] dark:bg-white/[0.02] p-2">
        {hasImage ? (
          <img src={item.imageUrl!} alt={item.name} className="max-w-full max-h-full object-contain" loading="lazy" onError={() => setImgError(true)} />
        ) : (
          <ShoppingBag className="w-8 h-8 text-[#A1A1AA]/30" />
        )}
      </div>
      <div className="text-[13px] font-semibold text-[#09090B] dark:text-white leading-snug line-clamp-2 mb-0.5">
        {item.name}
      </div>
      {item.company && item.company !== item.name && (
        <div className="text-[12px] text-[#A1A1AA] line-clamp-1">{item.company}</div>
      )}
    </Link>
  );
}

interface ShopItemDetailProps {
  itemKind: ItemKind;
  bookData?: BookData;
  productData?: ProductData;
  isLoggedIn?: boolean;
}

export { normalizeBook, normalizeProduct };
export type { BookData, ProductData, NormalizedItem };

export default function ShopItemDetailPage({ itemKind, bookData, productData, isLoggedIn = false }: ShopItemDetailProps) {
  const item = useMemo(() => {
    if (itemKind === "book" && bookData) return normalizeBook(bookData);
    if (itemKind === "product" && productData) return normalizeProduct(productData);
    return null;
  }, [itemKind, bookData, productData]);

  const isBook = itemKind === "book";

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [visibleCards, setVisibleCards] = useState(isBook ? 4 : 6);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const [productImgError, setProductImgError] = useState(false);

  useEffect(() => {
    setDetailsOpen(false);
    setVisibleCards(isBook ? 4 : 6);
    setShowStickyBar(false);
    setProductImgError(false);
  }, [item?.slug, isBook]);

  useEffect(() => {
    if (!item) return;
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
  }, [item]);

  const podcastArtworkMap = useMemo(() => {
    const map = new Map<string, { slug: string; name: string; artworkUrl: string }>();
    for (const p of PODCAST_LANDINGS) {
      map.set(p.slug, { slug: p.slug, name: p.name, artworkUrl: p.artworkUrl });
    }
    return map;
  }, []);

  const featuredPodcasts = useMemo(() => {
    if (!item) return [];
    const seen = new Set<string>();
    const result: { slug: string; name: string; artworkUrl: string }[] = [];
    for (const ep of item.episodes) {
      if (seen.has(ep.podcastSlug)) continue;
      seen.add(ep.podcastSlug);
      const info = podcastArtworkMap.get(ep.podcastSlug);
      if (info) result.push(info);
    }
    return result;
  }, [item, podcastArtworkMap]);

  const maxArtwork = 7;
  const visibleArtwork = featuredPodcasts.slice(0, maxArtwork);
  const remainingPodcasts = item ? item.podcastCount - visibleArtwork.length : 0;

  const episodesWithContext = useMemo(() => {
    if (!item) return [];
    const withCtx = item.episodes.filter(ep => ep.context && ep.context.length > 20);
    const withoutCtx = item.episodes.filter(ep => !ep.context || ep.context.length <= 20);
    return [...withCtx, ...withoutCtx];
  }, [item]);

  const visibleEpisodes = episodesWithContext.slice(0, visibleCards);
  const hasMore = episodesWithContext.length > visibleCards;

  const metaItems: { label: string; value: string }[] = [];
  if (isBook && item) {
    if (item.publishYear) metaItems.push({ label: "Published", value: String(item.publishYear) });
    if (item.pageCount) metaItems.push({ label: "Pages", value: String(item.pageCount) });
  }

  const hasProductImage = !isBook && item?.imageUrl && !productImgError;

  if (!item) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F7FC] dark:bg-[#08080F]">
        {!isLoggedIn && <SiteHeader />}
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          {isBook ? <BookOpen className="w-12 h-12 text-[#A1A1AA]/30" /> : <ShoppingBag className="w-12 h-12 text-[#A1A1AA]/30" />}
          <h1 className="text-xl font-bold text-[#09090B] dark:text-white">{isBook ? "Book" : "Product"} not found</h1>
          <Link href="/shop" className="text-[#6366F1] hover:text-[#6366F1]/80 font-medium" data-testid="link-back-shop">Back to Pod Shop</Link>
        </div>
        {!isLoggedIn && <Footer />}
      </div>
    );
  }

  const scrollToAppearances = () => document.getElementById("appearances")?.scrollIntoView({ behavior: "smooth" });

  const artworkTileOnScroll = isBook
    ? (podSlug: string) => {
        const cards = document.querySelectorAll(`[data-podcast-slug="${podSlug}"]`);
        if (cards.length > 0) {
          cards[0].scrollIntoView({ behavior: "smooth", block: "center" });
          cards[0].classList.add("ring-2", "ring-[#6366F1]", "ring-offset-2");
          setTimeout(() => cards[0].classList.remove("ring-2", "ring-[#6366F1]", "ring-offset-2"), 2000);
        } else {
          scrollToAppearances();
        }
      }
    : () => scrollToAppearances();

  const primaryUrlHref = item.primaryUrl
    ? (item.primaryUrlIsAmazon ? trackAffiliateUrl(item.primaryUrl, item.name, isBook ? "book" : "product") : item.primaryUrl)
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F7FC] dark:bg-[#08080F]">
      <SEOHead item={item} />
      {!isLoggedIn && <SiteHeader />}

      <div
        className={`fixed z-[55] bg-white/95 dark:bg-[#08080F]/95 backdrop-blur-md transition-all duration-300 hidden md:block border-b border-[#F0F0F2] dark:border-white/[0.08] ${isLoggedIn ? "left-[64px] right-0 xl:right-[312px]" : "left-0 right-0"} ${showStickyBar ? (isLoggedIn ? "top-0" : "top-[68px]") + " opacity-100" : (isLoggedIn ? "-top-[56px]" : "top-[12px]") + " opacity-0 pointer-events-none"}`}
        data-testid="sticky-buy-bar"
      >
        <div className="max-w-[960px] mx-auto px-5 sm:px-8 flex items-center gap-3 h-[56px]">
          {isBook ? (
            <HeroCover title={item.name} slug={item.slug} size="sticky" />
          ) : (
            hasProductImage && <img src={item.imageUrl!} alt="" className="w-7 h-7 rounded-md object-cover shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-[#09090B] dark:text-white truncate leading-tight">
              {item.name}
            </div>
            {item.subtitle && (
              <div className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] truncate leading-tight">
                {item.subtitle}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isBook && item.blinkistUrl && (
              <a
                href={trackAffiliateUrl(item.blinkistUrl, item.name, "book")}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-1.5 text-[14px] font-semibold text-[#52525B] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-white transition-colors"
                data-testid="sticky-blinkist"
              >
                <FileText className="w-3.5 h-3.5" />
                Blinkist
              </a>
            )}
            {primaryUrlHref && (
              <a
                href={primaryUrlHref}
                target="_blank"
                rel={item.primaryUrlIsAmazon ? "sponsored noopener noreferrer" : "noopener noreferrer"}
                className={`rounded-lg px-4 py-2 text-[14px] font-bold transition-colors flex items-center gap-1.5 shadow-sm ${
                  item.primaryUrlIsAmazon
                    ? "bg-[#FF9900] hover:bg-[#E88B00] text-[#0F1111]"
                    : "bg-[#6366F1] hover:bg-[#4F46E5] text-white"
                }`}
                data-testid="sticky-buy-amazon"
              >
                {item.primaryUrlLabel}
                {!isBook && <ExternalLink className="w-3.5 h-3.5" />}
              </a>
            )}
          </div>
        </div>
      </div>

      {showStickyBar && primaryUrlHref && (
        <div
          className="fixed left-0 right-0 bottom-[calc(50px+env(safe-area-inset-bottom,0px))] z-[55] bg-white/95 dark:bg-[#08080F]/95 backdrop-blur-md border-t border-[#F0F0F2] dark:border-white/[0.08] md:hidden"
          data-testid="sticky-buy-bar-mobile"
        >
          <div className="flex items-center gap-3 px-4 py-3">
            {isBook ? (
              <HeroCover title={item.name} slug={item.slug} size="sticky" />
            ) : (
              hasProductImage && <img src={item.imageUrl!} alt="" className="w-7 h-7 rounded-md object-cover shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-[#09090B] dark:text-white truncate leading-tight">
                {item.name}
              </div>
            </div>
            <a
              href={primaryUrlHref}
              target="_blank"
              rel={item.primaryUrlIsAmazon ? "sponsored noopener noreferrer" : "noopener noreferrer"}
              className={`rounded-lg px-4 py-2 text-[14px] font-bold transition-colors flex items-center gap-1.5 shadow-sm shrink-0 ${
                item.primaryUrlIsAmazon
                  ? "bg-[#FF9900] hover:bg-[#E88B00] text-[#0F1111]"
                  : "bg-[#6366F1] hover:bg-[#4F46E5] text-white"
              }`}
              data-testid="sticky-buy-amazon-mobile"
            >
              {item.primaryUrlLabel}
              {!isBook && <ExternalLink className="w-3.5 h-3.5" />}
            </a>
          </div>
        </div>
      )}

      <main className="flex-1">
        <div className="max-w-[960px] mx-auto px-5 sm:px-8 pt-8 pb-24">

          <button
            onClick={() => window.history.back()}
            className="text-[#71717A] hover:text-[#09090B] dark:hover:text-white transition-colors mb-4"
            data-testid="back-button"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-[13px] text-[#A1A1AA] mb-6 flex items-center gap-2" data-testid="breadcrumb">
            <Link href="/" className="text-[#52525B] hover:text-[#6366F1] transition-colors">Home</Link>
            <span>›</span>
            <Link href="/shop" className="text-[#52525B] hover:text-[#6366F1] transition-colors">Pod Shop</Link>
            <span>›</span>
            <span>{item.name}</span>
          </div>

          <div ref={heroRef} className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start mb-8" data-testid="section-hero">
            {isBook ? (
              <HeroCover title={item.name} slug={item.slug} />
            ) : (
              <ProductHeroImage imageUrl={item.imageUrl} name={item.name} onError={() => setProductImgError(true)} />
            )}
            <div className="flex-1 min-w-0 pt-1">
              {!isBook && item.productType && (
                <div className="flex items-center gap-3 flex-wrap mb-2">
                  <span className={`text-[12px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border ${getTypeColor(item.productType)}`}>
                    {getTypeLabel(item.productType)}
                  </span>
                </div>
              )}
              <h1 className="text-[28px] sm:text-[34px] font-bold leading-[1.1] tracking-tight text-[#09090B] dark:text-white mb-1.5" data-testid={isBook ? "heading-book-title" : "heading-product-title"}>
                {item.name}
              </h1>
              {isBook && (item.raw as BookData).author && (
                <p className="text-[16px] text-[#52525B] dark:text-[#A1A1AA] mb-3" data-testid="text-book-author">
                  by <AuthorWithLinks author={(item.raw as BookData).author!} />
                </p>
              )}
              {!isBook && item.subtitle && (
                <p className="text-[16px] text-[#52525B] dark:text-[#A1A1AA] mb-3" data-testid="text-product-company">
                  {item.subtitle}
                </p>
              )}

              <div className="mb-4">
                <PodcastMicBadge count={item.podcastCount} size="lg" />
              </div>

              <div className="flex items-center gap-3 mb-5">
                {primaryUrlHref && (
                  <a
                    href={primaryUrlHref}
                    target="_blank"
                    rel={item.primaryUrlIsAmazon ? "sponsored noopener noreferrer" : "noopener noreferrer"}
                    className={`rounded-lg px-5 py-2.5 text-[14px] font-bold transition-colors flex items-center gap-2 shadow-sm ${
                      item.primaryUrlIsAmazon
                        ? "bg-[#FF9900] hover:bg-[#E88B00] text-[#0F1111]"
                        : "bg-[#6366F1] hover:bg-[#4F46E5] text-white"
                    }`}
                    data-testid={isBook ? "button-buy-amazon-hero" : "button-visit-hero"}
                  >
                    {item.primaryUrlLabel}
                    {!isBook && <ExternalLink className="w-4 h-4" />}
                  </a>
                )}
                {isBook && item.blinkistUrl && (
                  <a
                    href={trackAffiliateUrl(item.blinkistUrl, item.name, "book")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border border-[#E4E4E7] dark:border-white/[0.12] text-[#52525B] dark:text-[#A1A1AA] hover:border-[#6366F1]/40 hover:text-[#6366F1] rounded-lg px-4 py-2.5 text-[14px] font-semibold transition-colors flex items-center gap-2"
                    data-testid="button-blinkist-hero"
                  >
                    <FileText className="w-4 h-4" />
                    Blinkist Summary
                  </a>
                )}
              </div>

              {featuredPodcasts.length > 0 && (
                <>
                  <p className="text-[11px] font-bold tracking-[1px] uppercase text-[#A1A1AA] mb-2.5">Featured on</p>
                  <div className="flex gap-2.5 flex-wrap" data-testid="artwork-strip">
                    {visibleArtwork.map(p => (
                      <ArtworkTile
                        key={p.slug}
                        slug={p.slug}
                        name={p.name}
                        artworkUrl={p.artworkUrl}
                        onScroll={() => artworkTileOnScroll(p.slug)}
                      />
                    ))}
                    {remainingPodcasts > 0 && (
                      <button
                        onClick={scrollToAppearances}
                        className="w-[88px] h-[88px] sm:w-[110px] sm:h-[110px] rounded-[14px] bg-[#F7F7FC] dark:bg-white/[0.04] border border-dashed border-[#E4E4E7] dark:border-white/[0.12] flex items-center justify-center text-sm text-[#52525B] font-semibold cursor-pointer hover:border-[#6366F1]/40 hover:text-[#6366F1] transition-colors"
                        data-testid="artwork-more"
                      >
                        +{remainingPodcasts}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>


          {(item.podcastBuzz || item.podcastBuzzFallback) && (
            <div className="bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.08] border-l-[3px] border-l-[#6366F1] rounded-[0_12px_12px_0] px-5 py-4 mb-7 shadow-[0_1px_3px_rgba(0,0,0,0.07)]" data-testid="section-podcast-buzz">
              <div className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#6366F1] mb-2">What top podcasters are saying</div>
              {item.podcastBuzz ? (
                <p className="text-[16px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.75]" data-testid="text-podcast-buzz">
                  {item.podcastBuzz}
                </p>
              ) : item.podcastBuzzFallback ? (
                <div className="space-y-3">
                  {item.podcastBuzzFallback.slice(0, 3).map((ctx, i) => (
                    <p key={i} className="text-[15px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.85]">
                      {ctx}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {episodesWithContext.length > 0 && (
            <>
              <h2 className="text-[20px] font-bold tracking-tight text-[#09090B] dark:text-white mb-4 scroll-mt-[140px]" id="appearances" data-testid="heading-appearances">
                What podcasters said about this {isBook ? "book" : "product"}
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
                    See more podcast appearances ↓
                  </button>
                </div>
              )}

              <hr className="border-t border-[#F0F0F2] dark:border-white/[0.06] my-7" />
            </>
          )}

          {item.relatedItems.length > 0 && (
            <>
              <div className="text-[18px] font-bold text-[#09090B] dark:text-white mb-4" data-testid="heading-related">
                {isBook ? "People who bought this also read" : "You might also like"}
              </div>
              <div className={`grid gap-2.5 ${isBook ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`} data-testid={isBook ? "related-books-grid" : "related-products-grid"}>
                {item.relatedItems.slice(0, isBook ? 4 : 6).map(ri => (
                  isBook
                    ? <RelatedBookCard key={ri.slug} item={ri} />
                    : <RelatedProductCard key={ri.slug} item={ri} />
                ))}
              </div>
              <hr className="border-t border-[#F0F0F2] dark:border-white/[0.06] my-7" />
            </>
          )}

          {item.description && (
            <>
              <p className="text-[12px] font-bold tracking-[1.5px] uppercase text-[#A1A1AA] mb-2.5">About this {isBook ? "book" : "product"}</p>
              {isBook ? (
                <div
                  className="text-[15px] leading-[1.85] text-[#52525B] dark:text-[#A1A1AA] [&_b]:font-semibold [&_b]:text-[#18181B] dark:[&_b]:text-white [&_strong]:font-semibold [&_strong]:text-[#18181B] dark:[&_strong]:text-white [&_i]:italic"
                  data-testid="text-description"
                  dangerouslySetInnerHTML={{ __html: item.description.replace(/<(?!\/?(?:p|b|i|br|strong|em)\b)[^>]*>/gi, '') }}
                />
              ) : (
                <p className="text-[16px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.75]" data-testid="text-description">
                  {item.description}
                </p>
              )}
            </>
          )}

          {isBook && metaItems.length > 0 && (
            <div>
              <button
                onClick={() => setDetailsOpen(!detailsOpen)}
                aria-expanded={detailsOpen}
                aria-controls="book-details-body"
                className="flex items-center justify-between w-full py-3.5 border-t border-b border-[#F0F0F2] dark:border-white/[0.06] mt-6 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#6366F1] focus:ring-offset-2 rounded"
                data-testid="button-toggle-details"
              >
                <span className="text-sm font-semibold text-[#52525B] dark:text-[#A1A1AA]">Book details & price</span>
                <ChevronDown className={`w-3.5 h-3.5 text-[#A1A1AA] transition-transform duration-200 ${detailsOpen ? "rotate-180" : ""}`} />
              </button>
              <div id="book-details-body" className={`overflow-hidden transition-all duration-300 ${detailsOpen ? "max-h-[400px]" : "max-h-0"}`}>
                <div className="pt-2">
                  {metaItems.map(mi => (
                    <div key={mi.label} className="flex justify-between text-sm py-2 border-b border-[#F0F0F2] dark:border-white/[0.06] last:border-b-0">
                      <span className="text-[#A1A1AA]">{mi.label}</span>
                      <span className="font-medium text-[#09090B] dark:text-white">{mi.value}</span>
                    </div>
                  ))}
                  {item.amazonUrl && (
                    <div className="flex justify-between text-sm py-2">
                      <span className="text-[#A1A1AA]">Buy</span>
                      <a href={trackAffiliateUrl(item.amazonUrl, item.name, "book")} target="_blank" rel="noopener noreferrer" className="font-medium text-[#6366F1] hover:underline" data-testid="link-amazon-details">
                        Amazon →
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {!isLoggedIn && <Footer />}
    </div>
  );
}
