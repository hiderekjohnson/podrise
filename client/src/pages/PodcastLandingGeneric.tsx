import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import { Loader2, ArrowRight, ArrowLeft, Clock, Mic, Headphones, UserCircle, BookOpen, Mail, ShoppingBag, ExternalLink, Lock, X, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PodcastMicBadge } from "@/components/PodcastMicBadge";
import { BookCoverFill } from "@/components/BookCover";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { GetRecapsModal } from "@/components/GetRecapsModal";

import { getPodcastBySlug, PODCAST_LANDINGS } from "@/data/podcastLandingData";
import type { PodcastLandingConfig } from "@/data/podcastLandingData";
import { EpisodeCard } from "@/components/EpisodeCard";
import { RecapCard } from "@/components/RecapCard";
import { useSetConversion } from "@/contexts/PageConversionContext";
import { useSetRelatedPodcasts } from "@/contexts/RelatedPodcastsContext";


function extractAsin(url: string): string | null {
  const patterns = [
    /\/dp\/([A-Za-z0-9]{10})/,
    /\/gp\/product\/([A-Za-z0-9]{10})/,
    /\/product\/([A-Za-z0-9]{10})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return null;
}


interface PodcastBook {
  name: string;
  author: string | null;
  description: string;
  url: string;
  context: string[];
  episodes: { slug: string; title: string }[];
  mentionCount: number;
  asin: string | null;
  slug: string | null;
  pageCount: number | null;
  publishYear: number | null;
  rating: number | null;
  googleBooksId: string | null;
  isbn: string | null;
  hasCover: boolean | null;
}

function PodcastBooksTab({ slug, podcastName, isLoggedIn }: { slug: string; podcastName: string; isLoggedIn: boolean }) {
  const [sortBy, setSortBy] = useState<"mentions" | "alpha">("mentions");
  const [visibleCount, setVisibleCount] = useState(20);

  const { data, isLoading, isError } = useQuery<{ books: PodcastBook[]; total: number }>({
    queryKey: ["/api/podcasts", slug, "books"],
  });

  const books = data?.books || [];

  const sorted = [...books].sort((a, b) => {
    if (sortBy === "alpha") return a.name.localeCompare(b.name);
    return b.mentionCount - a.mentionCount;
  });

  const visible = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;

  return (
    <section className="pb-16" data-testid="section-books-tab">
      <div className="flex items-center gap-2.5 mb-2">
        <BookOpen className="w-5 h-5 text-amber-600" />
        <h2 className="text-[17px] font-display font-bold text-foreground">Recommended Reading</h2>
      </div>
      <p className="text-[16px] text-muted-foreground mb-6">
        Books mentioned across {podcastName} episodes - sorted by how often they come up in conversation.
      </p>

      {isLoggedIn && (
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setSortBy("mentions")}
            className={`px-3 py-2 rounded-lg text-[16px] font-semibold transition-colors ${sortBy === "mentions" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="button-sort-mentions"
          >
            Most mentioned
          </button>
          <button
            onClick={() => setSortBy("alpha")}
            className={`px-3 py-2 rounded-lg text-[16px] font-semibold transition-colors ${sortBy === "alpha" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="button-sort-alpha"
          >
            A-Z
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-5 animate-pulse">
              <div className="flex gap-4">
                <div className="w-14 h-20 bg-muted rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-muted rounded w-2/3" />
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-4 bg-muted rounded w-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-12">
          <BookOpen className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-[16px] font-semibold text-foreground mb-1">Couldn't load books</p>
          <p className="text-[16px] text-muted-foreground">Something went wrong. Try refreshing the page.</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-[16px] font-semibold text-foreground mb-1">No books found yet</p>
          <p className="text-[16px] text-muted-foreground">Book data is still being extracted for this podcast.</p>
        </div>
      ) : !isLoggedIn ? (
        <div className="relative overflow-hidden rounded-xl" data-testid="books-signup-teaser">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pointer-events-none select-none">
            {sorted.slice(0, 3).map((book, i) => {
              const bookSlug = book.slug;
              return (
                <div
                  key={book.name}
                  className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-5 flex flex-col"
                  data-testid={`book-teaser-${i}`}
                >
                  <div className="flex gap-4">
                    <div className="w-16 h-[88px] rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/30 dark:border-amber-700/20 flex items-center justify-center shrink-0 overflow-hidden">
                      <BookCoverFill title={book.name} slug={bookSlug} googleBooksId={book.googleBooksId} isbn={book.isbn} hasCover={book.hasCover} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[16px] font-bold text-foreground leading-snug">{book.name}</h3>
                      {book.author && book.author !== "null" && (
                        <p className="text-[16px] text-muted-foreground mt-0.5">by {book.author}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="absolute inset-0 backdrop-blur-[4px] bg-white/60 dark:bg-zinc-950/60 flex items-center justify-center">
            <div className="text-center px-4 py-6 max-w-md">
              <p className="text-[15px] text-muted-foreground mb-4" data-testid="text-teaser-headline">
                Access the complete list of {sorted.length} book{sorted.length !== 1 ? "s" : ""} recommended by {podcastName}, with cross-podcast recommendations and deep dives.
              </p>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-primary text-primary hover:bg-primary/5 font-semibold text-[14px] transition-colors"
                data-testid="button-signup-books"
              >
                <Lock className="w-4 h-4" />
                Register For Free
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <>
          {isLoggedIn && (
            <p className="text-[16px] text-[#52525B] mb-4" data-testid="text-books-count">
              {sorted.length} book{sorted.length !== 1 ? "s" : ""}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {visible.map((book, i) => {
              const asin = book.asin || extractAsin(book.url || "");
              const bookSlug = book.slug;

              return (
                <div
                  key={book.name}
                  className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-5 hover:border-amber-500/[0.15] hover:shadow-md hover:shadow-black/[0.03] transition-all flex flex-col"
                  data-testid={`book-row-${i}`}
                >
                  <div className="flex gap-4">
                    {bookSlug ? (
                      <Link href={`/shop/${bookSlug}`} className="w-16 h-[88px] rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/30 dark:border-amber-700/20 flex items-center justify-center shrink-0 overflow-hidden">
                        <BookCoverFill title={book.name} slug={bookSlug} googleBooksId={book.googleBooksId} isbn={book.isbn} hasCover={book.hasCover} />
                      </Link>
                    ) : (
                      <div className="w-16 h-[88px] rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/30 dark:border-amber-700/20 flex items-center justify-center shrink-0 overflow-hidden">
                        <BookCoverFill title={book.name} slug={bookSlug} googleBooksId={book.googleBooksId} isbn={book.isbn} hasCover={book.hasCover} />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      {bookSlug ? (
                        <Link href={`/shop/${bookSlug}`} className="text-[16px] font-bold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors leading-snug" data-testid={`book-title-${i}`}>
                          {book.name}
                        </Link>
                      ) : (
                        <h3 className="text-[16px] font-bold text-foreground leading-snug" data-testid={`book-title-${i}`}>
                          {book.name}
                        </h3>
                      )}
                      {book.author && book.author !== "null" && (
                        <p className="text-[16px] text-muted-foreground mt-0.5" data-testid={`book-author-${i}`}>
                          by {book.author}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <PodcastMicBadge count={book.podcastCount} size="sm" />
                        {book.pageCount && (
                          <span className="text-[16px] text-muted-foreground">{book.pageCount} pages</span>
                        )}
                        {book.publishYear && (
                          <span className="text-[16px] text-muted-foreground">Published {book.publishYear}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {book.description && (
                    <p className="text-[16px] text-muted-foreground leading-relaxed mt-3" data-testid={`book-description-${i}`}>
                      {book.description.length > 180 ? book.description.slice(0, 180).replace(/\s+\S*$/, "") + "." : book.description}
                    </p>
                  )}

                </div>
              );
            })}
          </div>

          {hasMore && (
            <button
              onClick={() => setVisibleCount(prev => prev + 20)}
              className="w-full mt-6 py-3 rounded-xl border border-black/[0.06] dark:border-white/[0.08] text-[16px] font-semibold text-primary hover:bg-primary/[0.04] transition-colors"
              data-testid="button-load-more-books"
            >
              Show more books ({sorted.length - visibleCount} remaining)
            </button>
          )}
        </>
      )}
    </section>
  );
}

interface PodcastProduct {
  name: string;
  type: string;
  description: string;
  url: string;
  author: string | null;
  context: string[];
  episodes: { slug: string; title: string }[];
  mentionCount: number;
  isAmazon: boolean;
}

function PodcastShopTab({ slug, podcastName }: { slug: string; podcastName: string }) {
  const [filterType, setFilterType] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(20);

  const { data, isLoading, isError } = useQuery<{ products: PodcastProduct[]; total: number }>({
    queryKey: ["/api/podcasts", slug, "products"],
  });

  const products = data?.products || [];

  const types = [...new Set(products.map(p => p.type))].sort();

  const filtered = filterType === "all" ? products : products.filter(p => p.type === filterType);

  const sorted = [...filtered].sort((a, b) => b.mentionCount - a.mentionCount);

  const visible = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;

  const getTypeLabel = (type: string) => {
    const map: Record<string, string> = { service_or_tool: "Tool", physical_product: "Product", software: "Software", tool: "Tool", service: "Service", app: "App", course: "Course", newsletter: "Newsletter", supplement: "Supplement", game: "Game", website: "Website", product: "Product" };
    return map[type] || "Product";
  };

  const getTypeColor = (type: string) => {
    if (["service_or_tool", "software", "tool", "app"].includes(type)) return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
    if (type === "course") return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
    if (type === "newsletter") return "bg-orange-500/10 text-orange-700 dark:text-orange-400";
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  };

  return (
    <section className="pb-16" data-testid="section-shop-tab">
      <div className="flex items-center gap-2.5 mb-2">
        <ShoppingBag className="w-5 h-5 text-emerald-600" />
        <h2 className="text-[17px] font-display font-bold text-foreground">Products & Tools</h2>
      </div>
      <p className="text-[16px] text-muted-foreground mb-6">
        Products, tools, and services mentioned across {podcastName} episodes.
      </p>

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <button
          onClick={() => { setFilterType("all"); setVisibleCount(20); }}
          className={`px-3 py-2 rounded-lg text-[16px] font-semibold transition-colors ${filterType === "all" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "text-muted-foreground hover:text-foreground"}`}
          data-testid="button-filter-all"
        >
          All
        </button>
        {types.map(t => (
          <button
            key={t}
            onClick={() => { setFilterType(t); setVisibleCount(20); }}
            className={`px-3 py-2 rounded-lg text-[16px] font-semibold transition-colors ${filterType === t ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "text-muted-foreground hover:text-foreground"}`}
            data-testid={`button-filter-${t}`}
          >
            {getTypeLabel(t)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-5 animate-pulse">
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-muted rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-muted rounded w-2/3" />
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-4 bg-muted rounded w-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-12">
          <ShoppingBag className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-[16px] font-semibold text-foreground mb-1">Couldn't load products</p>
          <p className="text-[16px] text-muted-foreground">Something went wrong. Try refreshing the page.</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12">
          <ShoppingBag className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-[16px] font-semibold text-foreground mb-1">No products found yet</p>
          <p className="text-[16px] text-muted-foreground">Product data is still being extracted for this podcast.</p>
        </div>
      ) : (
        <>
          <p className="text-[16px] text-[#52525B] mb-4" data-testid="text-products-count">
            {sorted.length} product{sorted.length !== 1 ? "s" : ""}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {visible.map((product, i) => (
              <div
                key={product.name}
                className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-5 hover:border-emerald-500/[0.15] hover:shadow-md hover:shadow-black/[0.03] transition-all flex flex-col"
                data-testid={`product-row-${i}`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/[0.08] flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[16px] font-bold text-foreground leading-snug" data-testid={`product-name-${i}`}>
                        {product.name}
                      </h3>
                      <span className={`text-[11px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${getTypeColor(product.type)}`}>
                        {getTypeLabel(product.type)}
                      </span>
                    </div>
                    {product.podcastCount > 0 && (
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <PodcastMicBadge count={product.podcastCount} size="sm" />
                      </div>
                    )}
                  </div>
                </div>

                {product.description && (
                  <p className="text-[16px] text-muted-foreground leading-relaxed mt-3" data-testid={`product-description-${i}`}>
                    {product.description.length > 180 ? product.description.slice(0, 180).replace(/\s+\S*$/, "") + "." : product.description}
                  </p>
                )}

                {product.url && (
                  <div className="mt-auto pt-3">
                    <a
                      href={product.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-colors ${
                        product.isAmazon
                          ? "bg-[#FF9900] hover:bg-[#E88B00] text-[#0F1111]"
                          : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                      }`}
                      data-testid={`product-link-${i}`}
                    >
                      {product.isAmazon ? "View on Amazon" : "Visit Website"}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>

          {hasMore && (
            <button
              onClick={() => setVisibleCount(prev => prev + 20)}
              className="w-full mt-6 py-3 rounded-xl border border-black/[0.06] dark:border-white/[0.08] text-[16px] font-semibold text-primary hover:bg-primary/[0.04] transition-colors"
              data-testid="button-load-more-products"
            >
              Show more products ({sorted.length - visibleCount} remaining)
            </button>
          )}
        </>
      )}
    </section>
  );
}

export default function PodcastLandingGeneric() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const staticConfig = getPodcastBySlug(slug || "");
  const { data: user } = useAuth();
  const { toast } = useToast();
  const isLoggedIn = !!user;
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [stickyDismissed, setStickyDismissed] = useState(false);
  const [showRecapsModal, setShowRecapsModal] = useState(false);
  const [activeSection, setActiveSection] = useState("section-episodes");
  const [visibleEpisodes, setVisibleEpisodes] = useState(5);
  const ctaSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  useEffect(() => {
    const urlTab = new URLSearchParams(window.location.search).get("tab");
    if (urlTab) {
      const sectionMap: Record<string, string> = {
        episodes: "section-episodes",
        discover: "section-discover",
        books: "section-shop",
        shop: "section-shop",
      };
      const sectionId = sectionMap[urlTab];
      if (sectionId) {
        setTimeout(() => {
          const el = document.getElementById(sectionId);
          if (el) {
            const top = el.getBoundingClientRect().top + window.scrollY - 136;
            window.scrollTo({ top, behavior: "smooth" });
          }
        }, 500);
      }
    }
  }, [slug]);

  useEffect(() => {
    if (isLoggedIn || stickyDismissed) return;
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const threshold = 600;
      const ctaEl = ctaSectionRef.current;
      const ctaInView = ctaEl
        ? ctaEl.getBoundingClientRect().top < window.innerHeight - 60 && ctaEl.getBoundingClientRect().bottom > 60
        : false;
      setShowStickyBar(scrollY > threshold && !ctaInView);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isLoggedIn, stickyDismissed]);

  useEffect(() => {
    const sectionIds = ["section-episodes", "section-discover", "section-shop"];
    const handleScroll = () => {
      const offset = (isLoggedIn ? 0 : 68) + 52 + 40;
      let current = sectionIds[0];
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= offset) {
          current = id;
        }
      }
      setActiveSection(current);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isLoggedIn]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const headerHeight = isLoggedIn ? 0 : 68;
    const navHeight = 52;
    const offset = headerHeight + navHeight + 16;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  };

  const { data: dbEntry, isLoading: dbEntryLoading } = useQuery<any>({
    queryKey: ["/api/podcasts/by-slug", slug],
    enabled: !!slug,
  });

  const { data: podcastHosts } = useQuery<any[]>({
    queryKey: ["/api/podcasts", slug, "hosts"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${slug}/hosts`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!slug,
  });

  const { data: podcastBooks } = useQuery<{ books: PodcastBook[]; total: number }>({
    queryKey: ["/api/podcasts", slug, "books"],
    enabled: !!slug && !user,
  });

  const config = dbEntry ? {
    slug: dbEntry.slug,
    name: dbEntry.name,
    itunesId: dbEntry.itunesId,
    category: dbEntry.category || "",
    hosts: dbEntry.hosts || "",
    description: dbEntry.description || "",
    keywords: dbEntry.keywords || "",
    faqTopics: dbEntry.faqTopics || "",
    artworkUrl: dbEntry.artworkUrl || "",
    appleUrl: dbEntry.appleUrl,
    spotifyUrl: dbEntry.spotifyUrl,
    youtubeUrl: dbEntry.youtubeUrl,
    avgEpisodeLength: dbEntry.avgEpisodeLength,
    frequency: dbEntry.frequency,
    totalEpisodes: dbEntry.totalEpisodes,
    yearStarted: dbEntry.yearStarted,
    knownFor: dbEntry.knownFor,
    hostBios: (() => { try { return typeof dbEntry.hostBios === "string" ? JSON.parse(dbEntry.hostBios) : Array.isArray(dbEntry.hostBios) ? dbEntry.hostBios : undefined; } catch { return undefined; } })(),
    relatedSlugs: dbEntry.relatedSlugs,
    aboutPodcast: dbEntry.aboutPodcast,
    appleRating: (dbEntry as any).appleRating,
    appleRatingCount: (dbEntry as any).appleRatingCount,
    twitterHandle: dbEntry.twitterHandle,
    instagramUrl: (dbEntry as any).instagramUrl,
    tiktokUrl: (dbEntry as any).tiktokUrl,
    facebookUrl: (dbEntry as any).facebookUrl,
    discordUrl: (dbEntry as any).discordUrl,
    websiteUrl: (dbEntry as any).websiteUrl,
    storeUrl: (dbEntry as any).storeUrl,
  } as PodcastLandingConfig & { twitterHandle?: string | null; instagramUrl?: string | null; tiktokUrl?: string | null; facebookUrl?: string | null; discordUrl?: string | null; websiteUrl?: string | null; storeUrl?: string | null } : staticConfig ? { ...staticConfig, twitterHandle: null as string | null, instagramUrl: null as string | null, tiktokUrl: null as string | null, facebookUrl: null as string | null, discordUrl: null as string | null, websiteUrl: null as string | null, storeUrl: null as string | null } : null;

  useSetConversion({
    pageType: "podcast",
    name: config?.name || "",
    slug: config?.slug || "",
    artworkUrl: config?.artworkUrl || "",
    hosts: config?.hosts ? config.hosts.split(/,\s*|&\s*|\sand\s/i).map((h: string) => h.trim()).filter(Boolean) : [],
    description: config?.description || "",
  });

  useEffect(() => {
    if (!config) return;

    const { name, slug: s, keywords, hosts, description, artworkUrl } = config;
    const url = `https://podrise.com/podcasts/${s}`;

    document.title = `${name} Podcast Summary, Recaps & Key Takeaways | PodRise`;

    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };

    setMeta("name", "description", `Get free daily ${name} podcast summaries and episode recaps with key takeaways. Every new episode by ${hosts} — ${description} — delivered to your inbox.`);
    setMeta("name", "keywords", `${name} podcast summary, ${name} episode summary, ${name} podcast recap, ${name} recap, ${keywords}, podcast summary, daily podcast recap`);
    setMeta("property", "og:title", `${name} Podcast Summary, Recaps & Key Takeaways | PodRise`);
    setMeta("property", "og:description", `Daily ${name} podcast summaries and episode recaps. ${description.charAt(0).toUpperCase() + description.slice(1)} - delivered free to your inbox.`);
    setMeta("property", "og:url", url);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", "PodRise");
    if (artworkUrl) {
      setMeta("property", "og:image", artworkUrl);
      setMeta("name", "twitter:card", "summary_large_image");
      setMeta("name", "twitter:image", artworkUrl);
    } else {
      setMeta("name", "twitter:card", "summary");
    }
    setMeta("name", "twitter:title", `${name} Podcast Summary, Recaps & Key Takeaways | PodRise`);
    setMeta("name", "twitter:description", `Free daily ${name} podcast summaries and episode recaps delivered to your inbox.`);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) { canonical = document.createElement("link"); canonical.setAttribute("rel", "canonical"); document.head.appendChild(canonical); }
    canonical.setAttribute("href", url);

    let jsonLd = document.querySelector('script[data-seo="podcast-landing"]');
    if (!jsonLd) { jsonLd = document.createElement("script"); jsonLd.setAttribute("type", "application/ld+json"); jsonLd.setAttribute("data-seo", "podcast-landing"); document.head.appendChild(jsonLd); }
    jsonLd.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": `${name} Podcast Summary, Latest Episode Recap`,
      "description": `Free daily ${name} podcast summary and episode recap. ${description.charAt(0).toUpperCase() + description.slice(1)} delivered to your inbox.`,
      "url": url,
      "publisher": { "@type": "Organization", "name": "PodRise", "url": "https://podrise.com" },
      "about": { "@type": "PodcastSeries", "name": name },
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD", "description": `Free daily ${name} podcast recap delivered by email` },
    });

    return () => {
      const ld = document.querySelector('script[data-seo="podcast-landing"]');
      if (ld) ld.remove();
    };
  }, [config?.name]);

  const { data: episodeRecaps = [] } = useQuery<any[]>({
    queryKey: ["/api/podcasts", slug, "recaps", user ? "enriched" : "basic"],
    queryFn: async () => {
      const mentionsParam = user ? "&mentions=true" : "";
      const limit = user ? "10" : "50";
      const res = await fetch(`/api/podcasts/${slug}/recaps?limit=${limit}${mentionsParam}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!slug && !!config,
  });

  const { data: entityLinks } = useQuery<{
    companies: Array<{ slug: string; name: string; description: string; count: number }>;
    people: Array<{ slug: string; name: string; title: string; count: number }>;
    topics: Array<{ topic: string; count: number }>;
    guests: Array<{ name: string; title?: string; episodeTitle: string; episodeSlug: string; publishDate: string }>;
  }>({
    queryKey: ["/api/podcasts", slug, "entity-links"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${slug}/entity-links`);
      if (!res.ok) return { companies: [], people: [], topics: [], guests: [] };
      return res.json();
    },
    enabled: !!slug && !!config,
    staleTime: 1000 * 60 * 30,
  });

  type BookmarkRecord = { id: number; episodeSlug: string; podcastSlug: string };
  const { data: bookmarksData } = useQuery<BookmarkRecord[]>({
    queryKey: ["/api/bookmarks"],
    enabled: !!user,
  });
  const bookmarkedKeys = new Set((bookmarksData || []).map((b: BookmarkRecord) => `${b.podcastSlug}::${b.episodeSlug}`));

  const addBookmark = useMutation({
    mutationFn: async ({ episodeSlug, podcastSlug }: { episodeSlug: string; podcastSlug: string }) => {
      await apiRequest("POST", "/api/bookmarks", { episodeSlug, podcastSlug });
    },
    onSuccess: () => { toast({ title: "Saved", description: "Episode saved" }); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] }); },
  });

  const removeBookmark = useMutation({
    mutationFn: async ({ podcastSlug, episodeSlug }: { podcastSlug: string; episodeSlug: string }) => {
      await apiRequest("DELETE", `/api/bookmarks/${encodeURIComponent(podcastSlug)}/${encodeURIComponent(episodeSlug)}`);
    },
    onSuccess: () => { toast({ title: "Removed", description: "Episode removed from saved" }); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] }); },
  });

  const handleBookmarkToggle = (episodeSlug: string, podcastSlug: string) => {
    if (!user) return;
    const key = `${podcastSlug}::${episodeSlug}`;
    if (bookmarkedKeys.has(key)) removeBookmark.mutate({ podcastSlug, episodeSlug });
    else addBookmark.mutate({ episodeSlug, podcastSlug });
  };

  const { data: followData } = useQuery<{ followedSlugs: string[] }>({
    queryKey: ["/api/feed/followed-slugs"],
    enabled: !!user,
  });
  const isFollowing = config ? (followData?.followedSlugs?.includes(config.slug) ?? false) : false;

  const configSlug = config?.slug || slug || "";
  const followMutation = useMutation({
    mutationFn: async ({ follow }: { follow: boolean }) => {
      const endpoint = follow ? "/api/feed/follow" : "/api/feed/unfollow";
      await apiRequest("POST", endpoint, { podcastSlug: configSlug });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-slugs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update subscription", variant: "destructive" });
    },
  });

  const handleFollowToggle = (podcastSlug: string, follow: boolean) => {
    if (!user) return;
    followMutation.mutate({ follow });
  };

  if (!config && dbEntryLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!config && !dbEntry && !staticConfig) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {!user && <SiteHeader />}
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Podcast not found</h1>
            <p className="text-muted-foreground mb-4">We couldn't find a landing page for this podcast.</p>
            <a href="/" className="text-primary hover:underline">Back to home</a>
          </div>
        </main>
        {!user && <Footer />}
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const { name, hosts, category, itunesId, artworkUrl, spotifyUrl, youtubeUrl, relatedSlugs, description, appleRating, appleRatingCount, totalEpisodes, yearStarted } = config;

  const hostNames = hosts ? hosts.split(/,\s*|&\s*|\sand\s/i).map((h: string) => h.trim()).filter(Boolean) : [];

  const appleUrl = config.appleUrl || `https://podcasts.apple.com/podcast/id${itunesId}`;
  const effectiveSpotifyUrl = spotifyUrl || `https://open.spotify.com/search/${encodeURIComponent(name)}`;

  const relatedPodcasts = (relatedSlugs || [])
    .map(s => getPodcastBySlug(s))
    .filter((p): p is PodcastLandingConfig => !!p)
    .slice(0, 3);

  useSetRelatedPodcasts(
    user && relatedPodcasts.length > 0
      ? relatedPodcasts.map(rp => ({ slug: rp.slug, name: rp.name, category: rp.category, artworkUrl: rp.artworkUrl }))
      : []
  );

  const relatedPodcastsMobile = user && relatedPodcasts.length > 0 ? (
    <div data-testid="section-related-podcasts-mobile" className="xl:hidden mt-8">
      <div className="flex items-center gap-2.5 mb-4">
        <Headphones className="w-5 h-5 text-primary" />
        <h3 className="text-[17px] font-display font-bold text-foreground">Related Podcasts</h3>
      </div>
      <div className="flex flex-col gap-3">
        {relatedPodcasts.map((rp) => (
          <Link
            key={rp.slug}
            href={`/podcasts/${rp.slug}`}
            className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-4 flex items-center gap-4 hover:border-primary/[0.15] hover:shadow-md hover:shadow-black/[0.04] transition-all group"
            data-testid={`related-podcast-mobile-${rp.slug}`}
          >
            {rp.artworkUrl ? (
              <img src={rp.artworkUrl} alt={rp.name} className="w-14 h-14 rounded-xl object-cover shadow-sm shadow-black/[0.06] shrink-0 ring-1 ring-black/[0.04]" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-primary/[0.06] flex items-center justify-center shrink-0">
                <Headphones className="w-5 h-5 text-primary/30" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-bold text-foreground truncate group-hover:text-primary transition-colors">{rp.name}</p>
              <p className="text-[16px] text-[#52525B] mt-0.5 uppercase tracking-wider font-semibold">{rp.category}</p>
            </div>
            <ArrowRight className="shrink-0 w-4 h-4 text-muted-foreground/20 group-hover:text-primary transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  ) : null;

  const contentSections = (
    <>
      <section id="section-episodes" className="pb-16" data-testid="section-episode-list">
          {episodeRecaps.length > 0 ? (
            <>
              <p className="text-base text-[#52525B] dark:text-[#A1A1AA] mb-5">
                Quick summaries of the latest episodes - key takeaways in minutes, not hours.
              </p>
              <div className="flex flex-col gap-5">
                {episodeRecaps.slice(0, 10).map((ep: any) => (
                  user ? (
                    <RecapCard
                      key={ep.episodeSlug}
                      id={ep.id}
                      episodeSlug={ep.episodeSlug}
                      podcastSlug={slug}
                      podcastName={name}
                      episodeTitle={ep.episodeTitle}
                      publishDate={ep.publishDate}
                      artworkUrl={artworkUrl}
                      tldl={ep.tldl}
                      tabloidSubHeadline={ep.tabloidSubHeadline}
                      keyInsights={ep.keyInsights}
                      quote={ep.quote}
                      quoteAttribution={ep.quoteAttribution}
                      duration={ep.duration}
                      whatHappened={ep.whatHappened}
                      spotifyEpisodeUrl={ep.spotifyEpisodeUrl}
                      spotifyUrl={ep.pdSpotifyUrl || spotifyUrl}
                      youtubeUrl={ep.youtubeUrl || ep.pdYoutubeUrl}
                      mentions={ep.mentions}
                      guests={ep.guests}
                      hosts={hosts}
                      totalEpisodes={config.totalEpisodes}
                      yearStarted={config.yearStarted}
                      isFollowing={isFollowing}
                      isBookmarked={bookmarkedKeys.has(`${slug}::${ep.episodeSlug}`)}
                      onFollowToggle={handleFollowToggle}
                      onBookmarkToggle={handleBookmarkToggle}
                      toast={toast}
                      testIdPrefix="podcast-episode"
                      className=""
                      isLoggedIn={!!user}
                    />
                  ) : (
                    <EpisodeCard
                      key={ep.episodeSlug}
                      episodeSlug={ep.episodeSlug}
                      podcastSlug={slug}
                      publishDate={ep.publishDate}
                      episodeTitle={ep.episodeTitle}
                      tldl={ep.tldl}
                      duration={ep.duration}
                      artworkUrl={artworkUrl}
                    />
                  )
                ))}
              </div>
              <div className="flex justify-center mt-8">
                <Link href={`/podcasts/${slug}/episodes`}>
                  <span className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-display font-bold text-base bg-primary/[0.06] text-primary hover:bg-primary/[0.1] transition-colors" data-testid="link-view-all-episodes">
                    View All Episode Recaps
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </Link>
              </div>
            </>
          ) : (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-primary/[0.06] flex items-center justify-center mx-auto mb-4">
                <Mic className="w-6 h-6 text-primary/30" />
              </div>
              <p className="text-muted-foreground font-medium">Episode recaps are being generated.</p>
              <p className="text-base text-[#52525B] dark:text-[#A1A1AA]/60 mt-1">Check back soon for the latest summaries.</p>
            </div>
          )}
        </section>

        <section id="section-discover" className="pb-16 space-y-10" data-testid="section-discover">
          {!user && entityLinks?.guests && entityLinks.guests.length > 0 && (
            <div data-testid="section-recent-guests">
              <div className="flex items-center gap-2.5 mb-4">
                <UserCircle className="w-5 h-5 text-primary" />
                <h3 className="text-[17px] font-display font-bold text-foreground">Recent Guests</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {entityLinks.guests.map((guest, i) => {
                  const date = new Date(guest.publishDate + "T00:00:00");
                  const formatted = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  return (
                    <div key={i} className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-4 flex flex-col gap-1.5" data-testid={`card-guest-${i}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[16px] font-bold text-foreground" data-testid={`link-guest-person-${i}`}>{guest.name}</span>
                      </div>
                      {guest.title && <p className="text-[16px] text-[#52525B] leading-snug">{guest.title}</p>}
                      <Link href={`/podcasts/${slug}/${guest.episodeSlug}`} className="text-[16px] text-primary/70 hover:text-primary transition-colors line-clamp-1 mt-0.5" data-testid={`link-guest-episode-${i}`}>
                        {guest.episodeTitle}
                      </Link>
                      <span className="text-[16px] text-muted-foreground/40">{formatted}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!user && relatedPodcasts.length > 0 && (
            <div data-testid="section-related-podcasts-inline">
              <div className="flex items-center gap-2.5 mb-4">
                <Headphones className="w-5 h-5 text-primary" />
                <h3 className="text-[17px] font-display font-bold text-foreground">Related Podcasts</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {relatedPodcasts.map((rp) => (
                  <a
                    key={rp.slug}
                    href={`/podcasts/${rp.slug}`}
                    className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-4 flex items-center gap-4 hover:border-primary/[0.15] hover:shadow-md hover:shadow-black/[0.04] transition-all group"
                    data-testid={`related-podcast-${rp.slug}`}
                  >
                    {rp.artworkUrl ? (
                      <img src={rp.artworkUrl} alt={rp.name} className="w-14 h-14 rounded-xl object-cover shadow-sm shadow-black/[0.06] shrink-0 ring-1 ring-black/[0.04]" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-primary/[0.06] flex items-center justify-center shrink-0">
                        <Headphones className="w-5 h-5 text-primary/30" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[16px] font-bold text-foreground truncate group-hover:text-primary transition-colors">{rp.name}</p>
                      <p className="text-[16px] text-[#52525B] mt-0.5 uppercase tracking-wider font-semibold">{rp.category}</p>
                    </div>
                    <ArrowRight className="shrink-0 w-4 h-4 text-muted-foreground/20 group-hover:text-primary transition-colors" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {!entityLinks && (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-primary/[0.06] flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-6 h-6 text-primary/30 animate-spin" />
              </div>
              <p className="text-muted-foreground font-medium">Loading discover content...</p>
            </div>
          )}
        </section>

        <div id="section-shop" data-testid="section-shop">
          <PodcastBooksTab slug={slug} podcastName={config.name} isLoggedIn={!!user} />
          {!user && <PodcastShopTab slug={slug} podcastName={config.name} />}
        </div>
    </>
  );

  if (user) {
    return (
      <div className="min-h-screen bg-[#F9F9FB] pb-[calc(60px+env(safe-area-inset-bottom,0px))] md:pb-0">
        <div className="px-4 md:px-6 py-6 pb-24 md:pb-8">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => window.history.back()}
              className="text-[#71717A] hover:text-[#09090B] dark:hover:text-white transition-colors shrink-0"
              data-testid="back-button"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold text-[#09090B] dark:text-white truncate" data-testid="text-podcast-name-header">
              {config.name}
            </h1>
          </div>
          <div>
            {contentSections}
            {relatedPodcastsMobile}
          </div>
        </div>
      </div>
    );
  }

  const visibleRecaps = episodeRecaps.slice(0, visibleEpisodes);
  const hasMoreEpisodes = visibleEpisodes < episodeRecaps.length;
  const sidebarBooks = (podcastBooks?.books || []).slice(0, 3);

  return (
    <div className="min-h-screen flex flex-col overflow-x-clip">
      <SiteHeader />

      <div className="bg-white dark:bg-zinc-950 border-b border-[#E4E4E7] dark:border-white/[0.06]" data-testid="podcast-hero">
        <div className="max-w-7xl mx-auto px-4 sm:px-7 py-7">
          <div className="flex items-center gap-5">
            {artworkUrl && (
              <img
                src={artworkUrl}
                alt={name}
                className="w-[72px] h-[72px] rounded-[14px] object-cover shrink-0"
                data-testid="img-podcast-artwork"
              />
            )}
            <div className="min-w-0">
              <p className="text-[12px] text-[#A1A1AA] mb-[5px]" data-testid="breadcrumb-nav">
                <Link href="/podcasts" className="text-[#6366F1] hover:underline">Podcasts</Link>
                {" › "}
                <span>{name}</span>
              </p>
              <h1 className="text-[22px] font-bold tracking-[-0.03em] text-[#09090B] dark:text-white leading-snug" data-testid="text-podcast-name">
                {name}
              </h1>
              {hosts && (
                <p className="text-[14px] text-[#71717A] mt-[3px]" data-testid="text-podcast-hosts">{hosts}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-7 py-6 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px] gap-8 items-start">
          <div>
            <p className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#6366F1] mb-[14px]" data-testid="section-label-episodes">Latest episodes</p>

            {visibleRecaps.length > 0 ? (
              <>
                <div className="flex flex-col gap-[10px]">
                  {visibleRecaps.map((ep: any) => (
                    <EpisodeCard
                      key={ep.episodeSlug}
                      episodeSlug={ep.episodeSlug}
                      podcastSlug={slug || ""}
                      publishDate={ep.publishDate}
                      episodeTitle={ep.episodeTitle}
                      tldl={ep.tldl}
                      duration={ep.duration}
                    />
                  ))}
                </div>
                {hasMoreEpisodes && (
                  <button
                    onClick={() => setVisibleEpisodes(prev => prev + 5)}
                    className="block w-full bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-white/[0.1] rounded-xl py-[13px] text-[13px] font-medium text-[#52525B] text-center hover:bg-[#F7F7FC] dark:hover:bg-zinc-800 transition-colors mt-1 cursor-pointer"
                    data-testid="button-load-more-episodes"
                  >
                    Load more episodes
                  </button>
                )}
              </>
            ) : (
              <div className="text-center py-16">
                <div className="w-14 h-14 rounded-2xl bg-primary/[0.06] flex items-center justify-center mx-auto mb-4">
                  <Mic className="w-6 h-6 text-primary/30" />
                </div>
                <p className="text-muted-foreground font-medium">Episode recaps are being generated.</p>
                <p className="text-base text-[#52525B] dark:text-[#A1A1AA]/60 mt-1">Check back soon for the latest summaries.</p>
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-4" data-testid="podcast-sidebar">
            {sidebarBooks.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-white/[0.1] rounded-xl overflow-hidden" data-testid="sidebar-recommended-books">
                <div className="px-4 py-[14px] border-b border-[#F0F0F2] dark:border-white/[0.06]">
                  <p className="text-[13px] font-medium text-[#09090B] dark:text-white flex items-center gap-1.5 mb-[2px]">
                    <BookOpen className="w-[14px] h-[14px] text-[#6366F1]" />
                    Recommended reading
                  </p>
                  <p className="text-[12px] text-[#A1A1AA]">Books mentioned on this show</p>
                </div>
                {sidebarBooks.map((book, i) => {
                  const bookSlug = book.slug;
                  const isLocked = i === 2 && sidebarBooks.length === 3;
                  return (
                    <div key={book.name} className={`flex items-center gap-[10px] px-4 py-[10px] border-b border-[#F0F0F2] dark:border-white/[0.06] last:border-b-0 ${isLocked ? "opacity-[0.35]" : ""}`} data-testid={`sidebar-book-${i}`}>
                      <div className="w-8 h-11 rounded-[3px] overflow-hidden shrink-0 bg-[#EEF2FF]">
                        <BookCoverFill title={book.name} slug={bookSlug} googleBooksId={book.googleBooksId} isbn={book.isbn} hasCover={book.hasCover} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[#09090B] dark:text-white truncate">{book.name}</p>
                        {book.author && book.author !== "null" && (
                          <p className="text-[12px] text-[#A1A1AA]">{book.author}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                {sidebarBooks.length === 3 && (
                  <div className="px-4 py-[14px] border-t border-[#F0F0F2] dark:border-white/[0.06] bg-[#FAFAFA] dark:bg-zinc-800/50 text-center">
                    <p className="text-[12px] text-[#71717A] mb-[10px] leading-[1.5]">Sign up free to see every book recommended on this show</p>
                    <Link
                      href="/register"
                      className="block w-full bg-[#6366F1] text-white text-[13px] font-medium py-[9px] rounded-lg text-center hover:bg-[#4F46E5] transition-colors"
                      data-testid="sidebar-books-signup"
                    >
                      See all books →
                    </Link>
                  </div>
                )}
              </div>
            )}

            {relatedPodcasts.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-white/[0.1] rounded-xl overflow-hidden" data-testid="sidebar-related-podcasts">
                <div className="px-4 py-[14px] border-b border-[#F0F0F2] dark:border-white/[0.06]">
                  <p className="text-[13px] font-medium text-[#09090B] dark:text-white flex items-center gap-1.5 mb-[2px]">
                    <Headphones className="w-[14px] h-[14px] text-[#6366F1]" />
                    Related podcasts
                  </p>
                  <p className="text-[12px] text-[#A1A1AA]">Shows with a similar audience</p>
                </div>
                {relatedPodcasts.map((rp) => (
                  <a
                    key={rp.slug}
                    href={`/podcasts/${rp.slug}`}
                    className="flex items-center gap-[10px] px-4 py-[10px] border-b border-[#F0F0F2] dark:border-white/[0.06] last:border-b-0 hover:bg-[#FAFAFA] dark:hover:bg-zinc-800/50 transition-colors group"
                    data-testid={`related-podcast-${rp.slug}`}
                  >
                    {rp.artworkUrl ? (
                      <img src={rp.artworkUrl} alt={rp.name} className="w-[38px] h-[38px] rounded-lg object-cover shrink-0 bg-[#E4E4E7]" />
                    ) : (
                      <div className="w-[38px] h-[38px] rounded-lg bg-[#E4E4E7] shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#09090B] dark:text-white">{rp.name}</p>
                      <p className="text-[11px] text-[#A1A1AA] uppercase tracking-[0.04em]">{rp.category}</p>
                    </div>
                    <span className="text-[#D4D4D8] text-[16px] ml-auto shrink-0">›</span>
                  </a>
                ))}
              </div>
            )}

            <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-white/[0.1] rounded-xl p-[18px]" data-testid="sidebar-follow-cta">
              <p className="text-[13px] font-medium text-[#09090B] dark:text-white mb-1">Get {name} in your daily briefing</p>
              <p className="text-[12px] text-[#71717A] mb-[14px] leading-[1.5]">New episodes land in your inbox the morning after they drop.</p>
              <Link
                href="/register"
                className="block w-full bg-[#6366F1] text-white text-[13px] font-medium py-[9px] rounded-lg text-center hover:bg-[#4F46E5] transition-colors"
                data-testid="sidebar-follow-signup"
              >
                Follow this show →
              </Link>
            </div>
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
}
