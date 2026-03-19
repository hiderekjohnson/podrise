import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Search, X, Sparkles,
  ShoppingBag, BookOpen, Wrench, Package, Grid3X3, Monitor
} from "lucide-react";
import { BookCover } from "@/components/BookCover";
import { PodcastMicBadge } from "@/components/PodcastMicBadge";
import { trackAffiliateUrl } from "@/lib/utils";

interface ShopBook {
  name: string;
  author: string | null;
  description: string;
  podcastBuzz: string | null;
  amazonUrl: string;
  asin: string | null;
  slug: string | null;
  googleBooksId: string | null;
  isbn: string | null;
  hasCover: boolean | null;
  topics: string[];
  pageCount: number | null;
  publishYear: number | null;
  category: "book";
  podcastCount: number;
  podcastNames: string[];
  mentionCount: number;
  itemType: "book";
}

interface ShopProduct {
  name: string;
  company: string | null;
  category: string;
  type: string;
  description: string;
  url: string;
  isAmazon: boolean;
  imageUrl: string | null;
  slug: string;
  mentionCount: number;
  podcastCount: number;
  podcastNames: string[];
  episodes: { slug: string; title: string; podcastSlug: string }[];
  itemType: "product";
}

type ShopItem = ShopBook | ShopProduct;

interface ShopData {
  items: ShopItem[];
  books: ShopBook[];
  products: ShopProduct[];
  total: number;
}

const CATEGORY_PILLS = [
  { value: "all", label: "All", icon: Grid3X3 },
  { value: "book", label: "Books", icon: BookOpen },
  { value: "tool", label: "Tools", icon: Wrench },
  { value: "software", label: "Software", icon: Monitor },
  { value: "physical_product", label: "Products", icon: Package },
];

const PAGE_SIZE = 36;

const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

function getTypeLabel(type: string) {
  const map: Record<string, string> = { service_or_tool: "Tool", physical_product: "Product", software: "Software", tool: "Tool", service: "Service", app: "App", course: "Course", newsletter: "Newsletter", supplement: "Supplement", game: "Game", website: "Website", product: "Product", experience: "Experience" };
  return map[type] || "Product";
}

function getTypeColor(type: string) {
  if (["service_or_tool", "software", "tool", "app"].includes(type)) return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
  if (type === "experience") return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
  if (type === "course") return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
  if (type === "newsletter") return "bg-orange-500/10 text-orange-700 dark:text-orange-400";
  return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
}

function PersonalBookCard({ book, index }: { book: ShopBook; index: number }) {
  const hasPage = !!book.slug;
  const skipAnim = prefersReducedMotion || index > 11;

  const cardContent = (
    <motion.div
      initial={skipAnim ? false : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={skipAnim ? { duration: 0 } : { duration: 0.25, delay: Math.min(index * 0.015, 0.2) }}
      className="group bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.06] rounded-2xl overflow-hidden hover:shadow-xl hover:border-[#6366F1]/20 hover:-translate-y-0.5 transition-all duration-200"
      data-testid={`personal-shop-card-${index}`}
    >
      <div className="h-[232px] sm:h-[280px] relative overflow-hidden bg-[#FAFAFA] dark:bg-white/[0.02] flex items-center justify-center [&>img]:max-w-[calc(100%-1rem)] [&>img]:max-h-[calc(100%-1rem)] [&>div:first-child]:max-w-[calc(100%-1rem)] [&>div:first-child]:max-h-[calc(100%-1rem)]">
        <BookCover title={book.name} slug={book.slug} googleBooksId={book.googleBooksId} isbn={book.isbn} hasCover={book.hasCover} size="xl" />
      </div>
      <div className="p-3.5">
        <h3 className="text-[15px] font-bold text-[#09090B] dark:text-white leading-snug line-clamp-2 min-h-[2.5em] group-hover:text-[#6366F1] transition-colors" data-testid={`personal-item-title-${index}`}>
          {book.name}
        </h3>
        <div className="min-h-[1.25em] mt-0.5">
          {book.author && book.author !== "null" && (
            <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] line-clamp-1" data-testid={`personal-item-author-${index}`}>
              {book.author}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <PodcastMicBadge count={book.podcastCount} size="sm" />
        </div>
      </div>
    </motion.div>
  );

  if (hasPage) {
    return (
      <Link href={`/shop/${book.slug}`} className="block" data-testid={`personal-item-link-${index}`}>
        {cardContent}
      </Link>
    );
  }

  return (
    <a href={trackAffiliateUrl(book.amazonUrl, book.name, "book")} target="_blank" rel="sponsored noopener noreferrer" className="block" data-testid={`personal-item-link-${index}`}>
      {cardContent}
    </a>
  );
}

function PersonalProductCard({ product, index }: { product: ShopProduct; index: number }) {
  const skipAnim = prefersReducedMotion || index > 11;
  const [imgError, setImgError] = useState(false);
  const hasImage = product.imageUrl && !imgError;

  return (
    <Link href={`/shop/${product.slug}`} className="block" data-testid={`personal-item-link-${index}`}>
      <motion.div
        initial={skipAnim ? false : { opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={skipAnim ? { duration: 0 } : { duration: 0.25, delay: Math.min(index * 0.015, 0.2) }}
        className="group bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.06] rounded-2xl overflow-hidden hover:shadow-xl hover:border-[#6366F1]/20 hover:-translate-y-0.5 transition-all duration-200"
        data-testid={`personal-shop-card-${index}`}
      >
        <div className="h-[232px] sm:h-[280px] relative overflow-hidden bg-[#FAFAFA] dark:bg-white/[0.02] flex items-center justify-center p-4">
          {hasImage ? (
            <img src={product.imageUrl!} alt={product.name} className="max-w-full max-h-full object-contain" loading="lazy" onError={() => setImgError(true)} />
          ) : (
            <ShoppingBag className="w-12 h-12 text-[#A1A1AA]/20" />
          )}
          <div className="absolute top-2.5 right-2.5">
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${getTypeColor(product.type)}`}>
              {getTypeLabel(product.type)}
            </span>
          </div>
        </div>
        <div className="p-3.5">
          <h3 className="text-[15px] font-bold text-[#09090B] dark:text-white leading-snug line-clamp-2 min-h-[2.5em] group-hover:text-[#6366F1] transition-colors" data-testid={`personal-item-title-${index}`}>
            {product.name}
          </h3>
          <div className="min-h-[1.25em] mt-0.5">
            {product.company && product.company !== product.name && (
              <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] line-clamp-1">
                {product.company}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <PodcastMicBadge count={product.podcastCount} size="sm" />
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

function PersonalShopCard({ item, index }: { item: ShopItem; index: number }) {
  if (item.itemType === "book") {
    return <PersonalBookCard book={item as ShopBook} index={index} />;
  }
  return <PersonalProductCard product={item as ShopProduct} index={index} />;
}

export function PersonalShop() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<ShopData>({
    queryKey: ["/api/shop"],
  });

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeCategory, searchQuery]);

  useEffect(() => {
    if (searchOpen && searchRef.current) searchRef.current.focus();
  }, [searchOpen]);

  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    let result = [...data.items];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(item => {
        if (item.itemType === "book") {
          const b = item as ShopBook;
          return b.name.toLowerCase().includes(q) ||
            (b.author && b.author.toLowerCase().includes(q)) ||
            (b.topics || []).some(t => t.toLowerCase().includes(q));
        } else {
          const p = item as ShopProduct;
          return p.name.toLowerCase().includes(q) ||
            (p.company && p.company.toLowerCase().includes(q)) ||
            (p.description && p.description.toLowerCase().includes(q));
        }
      });
    }

    if (activeCategory !== "all") {
      if (activeCategory === "book") {
        result = result.filter(item => item.itemType === "book");
      } else if (activeCategory === "tool") {
        result = result.filter(item =>
          item.itemType === "product" && ["tool", "service_or_tool", "service"].includes((item as ShopProduct).type)
        );
      } else if (activeCategory === "software") {
        result = result.filter(item =>
          item.itemType === "product" && ["software", "app"].includes((item as ShopProduct).type)
        );
      } else if (activeCategory === "physical_product") {
        result = result.filter(item =>
          item.itemType === "product" && ["physical_product", "product", "supplement", "experience"].includes((item as ShopProduct).type)
        );
      }
    }

    result.sort((a, b) => b.podcastCount - a.podcastCount || b.mentionCount - a.mentionCount);
    return result;
  }, [data, searchQuery, activeCategory]);

  const featuredItems = useMemo(() => {
    if (!data?.items) return [];
    return [...data.items]
      .filter(i => i.podcastCount >= 2 && i.mentionCount >= 3)
      .sort((a, b) => b.podcastCount - a.podcastCount)
      .slice(0, 6);
  }, [data]);

  const showFeatured = !searchQuery && activeCategory === "all" && !isLoading && featuredItems.length > 0;

  const dedupedItems = useMemo(() => {
    if (!showFeatured || featuredItems.length === 0) return filteredItems;
    const featuredKeys = new Set(featuredItems.map(i => `${i.itemType}::${i.slug || i.name}`));
    return filteredItems.filter(i => !featuredKeys.has(`${i.itemType}::${i.slug || i.name}`));
  }, [filteredItems, featuredItems, showFeatured]);

  const visibleItems = dedupedItems.slice(0, visibleCount);
  const hasMore = visibleCount < dedupedItems.length;

  return (
    <div className="min-h-screen pb-24 md:pb-12" data-testid="personal-shop">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#09090B] dark:text-white tracking-tight" data-testid="heading-personal-shop">
              Shop
            </h1>
            <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA] mt-0.5">
              Curated from your favorite podcasts
            </p>
          </div>
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className={`p-2.5 rounded-xl border transition-all ${
              searchOpen || searchQuery
                ? "bg-[#6366F1]/[0.08] border-[#6366F1]/20 text-[#6366F1]"
                : "bg-white dark:bg-white/[0.04] border-[#E4E4E7] dark:border-white/[0.1] text-[#71717A] dark:text-[#A1A1AA] hover:border-[#6366F1]/30"
            }`}
            aria-label="Search"
            data-testid="button-personal-search"
          >
            <Search className="w-5 h-5" />
          </button>
        </div>

        {(searchOpen || searchQuery) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-5"
          >
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[#A1A1AA]" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search books, tools, products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-3 text-[15px] bg-white dark:bg-white/[0.04] border border-[#E4E4E7] dark:border-white/[0.1] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6366F1]/30 focus:border-[#6366F1]/30 transition-all"
                data-testid="input-personal-search"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); setSearchOpen(false); }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-0.5 text-[#A1A1AA] hover:text-[#52525B] transition-colors"
                  data-testid="button-clear-personal-search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </motion.div>
        )}

        <div className="flex items-center gap-2 overflow-x-auto pb-1 mb-6 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0" data-testid="category-pills">
          {CATEGORY_PILLS.map(pill => {
            const isActive = activeCategory === pill.value;
            const Icon = pill.icon;
            return (
              <button
                key={pill.value}
                onClick={() => setActiveCategory(pill.value)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[14px] font-medium whitespace-nowrap transition-all shrink-0 ${
                  isActive
                    ? "bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] shadow-sm"
                    : "bg-[#F4F4F5] dark:bg-white/[0.06] text-[#52525B] dark:text-[#A1A1AA] hover:bg-[#E4E4E7] dark:hover:bg-white/[0.1]"
                }`}
                data-testid={`pill-category-${pill.value}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {pill.label}
              </button>
            );
          })}
        </div>

        {showFeatured && (
          <section className="mb-8" data-testid="section-featured">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-[#6366F1]" />
              <h2 className="text-[15px] font-bold text-[#09090B] dark:text-white" data-testid="heading-featured">Most Talked About</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3" data-testid="grid-featured">
              {featuredItems.map((item, i) => (
                <PersonalShopCard key={`featured-${item.name}-${i}`} item={item} index={i} />
              ))}
            </div>
          </section>
        )}

        <section data-testid="section-all-items">
          {searchQuery && (
            <p className="text-[13px] text-[#A1A1AA] mb-3" data-testid="text-search-count">
              {filteredItems.length} result{filteredItems.length !== 1 ? "s" : ""} for "{searchQuery}"
            </p>
          )}

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.06] rounded-2xl overflow-hidden animate-pulse">
                  <div className="h-[232px] sm:h-[280px] bg-[#F0F0F2] dark:bg-white/[0.04]" />
                  <div className="p-3.5 space-y-2">
                    <div className="h-4 bg-[#F0F0F2] dark:bg-white/[0.04] rounded w-3/4" />
                    <div className="h-3 bg-[#F0F0F2] dark:bg-white/[0.04] rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-20">
              <ShoppingBag className="w-12 h-12 text-[#A1A1AA]/20 mx-auto mb-4" />
              <p className="text-lg font-medium text-[#52525B] dark:text-[#A1A1AA]" data-testid="text-no-results">No items found</p>
              <p className="text-[14px] text-[#A1A1AA] mt-1">Try a different search or category</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3" data-testid="grid-personal-shop">
                {visibleItems.map((item, i) => (
                  <PersonalShopCard key={`${item.name}-${item.itemType}-${i}`} item={item} index={showFeatured ? i + featuredItems.length : i} />
                ))}
              </div>

              {hasMore && (
                <div className="flex justify-center mt-8">
                  <button
                    onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                    className="px-8 py-3 bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] font-semibold text-[15px] rounded-full hover:opacity-90 transition-opacity shadow-sm"
                    data-testid="button-personal-load-more"
                  >
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <div className="mt-12" data-testid="personal-affiliate-disclosure">
          <div className="bg-[#F4F4F5] dark:bg-white/[0.03] rounded-xl px-5 py-4 text-center">
            <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
              Some links are affiliate links — they help keep PodRise free.{" "}
              <Link href="/disclosure" className="text-[#6366F1] hover:underline font-medium">Learn more</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
