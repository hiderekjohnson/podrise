// See BRAND.md for all typography, color, spacing, and accessibility rules.
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { BookOpen, ExternalLink, ChevronDown, ShoppingCart, Copy, Check, FileText } from "lucide-react";
import { SiX } from "react-icons/si";
import { BookCover as SharedBookCover } from "@/components/BookCover";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { PEOPLE_DIRECTORY } from "@/data/entityDirectoryData";

const PEOPLE_SLUG_MAP: Record<string, string> = {};
PEOPLE_DIRECTORY.forEach(p => { PEOPLE_SLUG_MAP[p.name.toLowerCase()] = p.slug; });

interface BookEpisode {
  podcastSlug: string;
  podcastName: string;
  episodeSlug: string;
  episodeTitle: string;
  context: string;
  publishedAt: string | null;
  hosts: string | null;
  guests: string | null;
  recommendedBy: string | null;
  recommenderRole: "host" | "guest" | "author" | null;
}

interface RelatedBook {
  name: string;
  author: string | null;
  slug: string;
  mentionCount: number;
  asin: string | null;
  googleBooksId: string | null;
  isbn: string | null;
  hasCover: boolean | null;
  topics: string[];
}

interface TopHost {
  name: string;
  count: number;
}

interface BookDetail {
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
  episodes: BookEpisode[];
  relatedBooks: RelatedBook[];
}

function SEOHead({ book }: { book: BookDetail }) {
  const title = `Why ${book.podcastCount} Podcasts Recommend ${book.name}${book.author ? ` by ${book.author}` : ""} | PodCap`;
  const description = `${book.name} has been recommended ${book.mentionCount} times across ${book.podcastCount} podcasts including ${book.podcastNames.slice(0, 2).join(" and ")}${book.podcastNames.length > 2 ? " and more" : ""}. See who recommends it and what they say.`;

  if (typeof document !== "undefined") {
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
    setOrCreate("property", "og:url", `https://podcap.io/bookstore/${book.slug}`);
    setOrCreate("property", "og:type", "book");
    setOrCreate("name", "twitter:card", "summary");

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.href = `https://podcap.io/bookstore/${book.slug}`;

    let schemaScript = document.querySelector('script[data-book-schema]') as HTMLScriptElement;
    if (!schemaScript) {
      schemaScript = document.createElement("script");
      schemaScript.type = "application/ld+json";
      schemaScript.setAttribute("data-book-schema", "true");
      document.head.appendChild(schemaScript);
    }
    schemaScript.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Book",
      name: book.name,
      ...(book.author ? { author: { "@type": "Person", name: book.author } } : {}),
      ...(book.description ? { description: book.description } : {}),
      ...(book.rating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: book.rating, bestRating: 5, ...(book.ratingCount ? { ratingCount: book.ratingCount } : {}) } } : {}),
      ...(book.publishYear ? { datePublished: String(book.publishYear) } : {}),
      ...(book.pageCount ? { numberOfPages: book.pageCount } : {}),
      url: `https://podcap.io/bookstore/${book.slug}`,
    });
  }
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

function ShareButton({ book }: { book: BookDetail }) {
  const [copied, setCopied] = useState(false);
  const url = `https://podcap.io/bookstore/${book.slug}`;
  const tweetText = `${book.name}${book.author ? ` by ${book.author}` : ""} — recommended on ${book.podcastCount} podcasts\n${url}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center gap-2" data-testid="share-buttons">
      <a
        href={`https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="p-2 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors focus:outline-none focus:ring-2 focus:ring-[#6366F1] focus:ring-offset-2"
        data-testid="button-share-x"
        title="Share on X"
      >
        <SiX className="w-3.5 h-3.5 text-[#09090B] dark:text-white" />
      </a>
      <button
        onClick={handleCopy}
        className="p-2 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors focus:outline-none focus:ring-2 focus:ring-[#6366F1] focus:ring-offset-2"
        data-testid="button-copy-link"
        title="Copy link"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-[#6366F1]" /> : <Copy className="w-3.5 h-3.5 text-[#A1A1AA]" />}
      </button>
    </div>
  );
}

function formatMonthYear(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function HeroCover({ title, slug }: { title: string; slug: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="w-[108px] min-h-[162px] h-full rounded-[3px_6px_6px_3px] bg-gradient-to-br from-[#1a1a2e] via-[#0f2145] to-[#0a1628] flex flex-col items-center justify-center p-3 text-center relative shrink-0 shadow-[_-2px_0_0_rgba(0,0,0,0.2),3px_6px_20px_rgba(0,0,0,0.18)]">
        <div className="absolute left-0 top-0 bottom-0 w-[9px] bg-white/[0.04] border-r border-white/[0.06] rounded-l-[3px]" />
        <div className="font-serif text-xl font-bold text-[#e2c27d] leading-none mb-2">{title.length > 30 ? title.substring(0, 28) + "…" : title}</div>
        <div className="w-3.5 h-px bg-[#e2c27d]/30 mx-auto mb-2" />
      </div>
    );
  }

  return (
    <img
      src={`/books/${slug}.jpg`}
      alt={title}
      className="w-[108px] min-h-[162px] h-auto rounded-[3px_6px_6px_3px] object-cover shrink-0 shadow-[_-2px_0_0_rgba(0,0,0,0.2),3px_6px_20px_rgba(0,0,0,0.18)]"
      onError={() => setFailed(true)}
    />
  );
}

function ArtworkTile({ slug, name, artworkUrl }: { slug: string; name: string; artworkUrl: string }) {
  return (
    <Link
      href={`/podcasts/${slug}`}
      className="shrink-0 relative group block"
      data-testid={`artwork-tile-${slug}`}
    >
      <div className="w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] rounded-[14px] overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.18)] transition-transform group-hover:scale-105 group-hover:z-10">
        <img src={artworkUrl} alt={name} className="w-full h-full object-cover block" />
      </div>
      <div className="absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 translate-y-1 bg-[#09090B] text-white text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 group-hover:translate-y-0 transition-all pointer-events-none z-20">
        {name}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#09090B]" />
      </div>
    </Link>
  );
}

function AppearanceCard({ ep, podcastArtwork }: { ep: BookEpisode; podcastArtwork?: string }) {
  return (
    <div
      className="bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.08] rounded-xl overflow-hidden transition-all hover:border-[#6366F1]/30 hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)]"
      data-testid={`appearance-card-${ep.episodeSlug}`}
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
            className="text-[13px] text-[#6366F1] font-medium mt-0.5 block hover:underline"
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

function RelatedBookCard({ book }: { book: RelatedBook }) {
  return (
    <Link
      href={`/bookstore/${book.slug}`}
      className="bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.08] rounded-xl p-3 transition-all hover:border-[#6366F1]/30 hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)] block"
      data-testid={`related-book-${book.slug}`}
    >
      <div className="w-full aspect-[2/3] rounded-md mb-2 overflow-hidden flex items-center justify-center bg-[#F7F7FC]">
        <SharedBookCover
          title={book.name}
          slug={book.slug}
          size="sm"
          className="w-full h-full rounded-md object-cover"
        />
      </div>
      <div className="text-[13px] font-semibold text-[#09090B] dark:text-white leading-snug line-clamp-2 mb-0.5">
        {book.name}
      </div>
      {book.author && (
        <div className="text-[12px] text-[#A1A1AA] line-clamp-1">{book.author}</div>
      )}
    </Link>
  );
}

export default function BookDetailPage() {
  const [, params] = useRoute("/bookstore/:bookSlug");
  const bookSlug = params?.bookSlug;
  const { data: book, isLoading, error } = useQuery<BookDetail>({
    queryKey: ["/api/bookstore", bookSlug],
    enabled: !!bookSlug,
  });

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [visibleCards, setVisibleCards] = useState(4);

  const podcastArtworkMap = useMemo(() => {
    const map = new Map<string, { slug: string; name: string; artworkUrl: string }>();
    for (const p of PODCAST_LANDINGS) {
      map.set(p.slug, { slug: p.slug, name: p.name, artworkUrl: p.artworkUrl });
    }
    return map;
  }, []);

  const featuredPodcasts = useMemo(() => {
    if (!book) return [];
    const seen = new Set<string>();
    const result: { slug: string; name: string; artworkUrl: string }[] = [];
    for (const ep of book.episodes) {
      if (seen.has(ep.podcastSlug)) continue;
      seen.add(ep.podcastSlug);
      const info = podcastArtworkMap.get(ep.podcastSlug);
      if (info) result.push(info);
    }
    return result;
  }, [book, podcastArtworkMap]);

  const maxArtwork = 7;
  const visibleArtwork = featuredPodcasts.slice(0, maxArtwork);
  const remainingPodcasts = book ? book.podcastCount - visibleArtwork.length : 0;

  const episodesWithContext = useMemo(() => {
    if (!book) return [];
    const withCtx = book.episodes.filter(ep => ep.context && ep.context.length > 20);
    const withoutCtx = book.episodes.filter(ep => !ep.context || ep.context.length <= 20);
    return [...withCtx, ...withoutCtx];
  }, [book]);

  const visibleEpisodes = episodesWithContext.slice(0, visibleCards);
  const hasMore = episodesWithContext.length > visibleCards;

  const metaItems: { label: string; value: string }[] = [];
  if (book) {
    if (book.publishYear) metaItems.push({ label: "Published", value: String(book.publishYear) });
    if (book.pageCount) metaItems.push({ label: "Pages", value: String(book.pageCount) });
    if (book.rating) metaItems.push({ label: "Rating", value: `${book.rating.toFixed(1)}${book.ratingCount ? ` (${book.ratingCount.toLocaleString()} reviews)` : ""}` });
  }

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

  if (error || !book) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F7FC] dark:bg-[#08080F]">
        <SiteHeader />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <BookOpen className="w-12 h-12 text-[#A1A1AA]/30" />
          <h1 className="text-xl font-bold text-[#09090B] dark:text-white">Book not found</h1>
          <Link href="/bookstore" className="text-[#6366F1] hover:text-[#6366F1]/80 font-medium" data-testid="link-back-bookstore">Back to Bookstore</Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F7FC] dark:bg-[#08080F]">
      <SEOHead book={book} />
      <SiteHeader />

      <main className="flex-1">
        <div className="max-w-[960px] mx-auto px-5 sm:px-8 pt-8 pb-24">

          <div className="text-[13px] text-[#A1A1AA] mb-6 flex items-center gap-2" data-testid="breadcrumb">
            <Link href="/" className="text-[#52525B] hover:text-[#6366F1] transition-colors">Home</Link>
            <span>›</span>
            <Link href="/bookstore" className="text-[#52525B] hover:text-[#6366F1] transition-colors">Bookstore</Link>
            <span>›</span>
            <span>{book.name}</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-stretch mb-5" data-testid="section-hero">
            <HeroCover title={book.name} slug={book.slug} />
            <div className="pt-0.5 flex-1 min-w-0">
              <h1 className="text-[24px] sm:text-[30px] font-bold leading-[1.05] tracking-tight text-[#09090B] dark:text-white mb-1" data-testid="heading-book-title">
                {book.name}
              </h1>
              {book.author && (
                <p className="text-[15px] text-[#52525B] dark:text-[#A1A1AA] mb-3.5" data-testid="text-book-author">
                  by <AuthorWithLinks author={book.author} />
                </p>
              )}

              {featuredPodcasts.length > 0 && (
                <>
                  <p className="text-[11px] font-bold tracking-[1px] uppercase text-[#A1A1AA] mb-2.5">Featured on</p>
                  <div className="flex gap-2.5 flex-wrap" data-testid="artwork-strip">
                    {visibleArtwork.map(p => (
                      <ArtworkTile key={p.slug} slug={p.slug} name={p.name} artworkUrl={p.artworkUrl} />
                    ))}
                    {remainingPodcasts > 0 && (
                      <div className="w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] rounded-[14px] bg-[#F7F7FC] dark:bg-white/[0.04] border border-dashed border-[#E4E4E7] dark:border-white/[0.12] flex items-center justify-center text-sm text-[#52525B] font-semibold" data-testid="artwork-more">
                        +{remainingPodcasts}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-5">
            <span className="text-[14px] font-semibold text-[#09090B] dark:text-white">{book.mentionCount} mentions across {book.podcastCount} podcasts</span>
            <div className="flex-1" />
            <ShareButton book={book} />
          </div>

          {book.podcastBuzz && (
            <div className="bg-white dark:bg-white/[0.03] border border-[#F0F0F2] dark:border-white/[0.08] border-l-[3px] border-l-[#6366F1] rounded-[0_12px_12px_0] px-5 py-4 mb-7 shadow-[0_1px_3px_rgba(0,0,0,0.07)]" data-testid="section-podcast-buzz">
              <div className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#6366F1] mb-2">What top podcasters are saying</div>
              <p className="text-[16px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.75]">
                {book.podcastBuzz}
              </p>
            </div>
          )}

          {episodesWithContext.length > 0 && (
            <>
              <h2 className="text-[20px] font-bold tracking-tight text-[#09090B] dark:text-white mb-4" id="appearances" data-testid="heading-appearances">
                What podcasters said about this book
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
                    See more podcast mentions ↓
                  </button>
                </div>
              )}

              <hr className="border-t border-[#F0F0F2] dark:border-white/[0.06] my-7" />
            </>
          )}

          {book.relatedBooks.length > 0 && (
            <>
              <div className="text-[18px] font-bold text-[#09090B] dark:text-white mb-4" data-testid="heading-related">
                People who bought this also read
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5" data-testid="related-books-grid">
                {book.relatedBooks.slice(0, 4).map(rb => (
                  <RelatedBookCard key={rb.slug} book={rb} />
                ))}
              </div>
              <hr className="border-t border-[#F0F0F2] dark:border-white/[0.06] my-7" />
            </>
          )}

          {book.description && (
            <>
              <p className="text-[12px] font-bold tracking-[1.5px] uppercase text-[#A1A1AA] mb-2.5">About this book</p>
              <div
                className="text-[15px] leading-[1.85] text-[#52525B] dark:text-[#A1A1AA] [&_b]:font-semibold [&_b]:text-[#18181B] dark:[&_b]:text-white [&_strong]:font-semibold [&_strong]:text-[#18181B] dark:[&_strong]:text-white [&_i]:italic"
                data-testid="text-description"
                dangerouslySetInnerHTML={{ __html: book.description.replace(/<(?!\/?(?:p|b|i|br|strong|em)\b)[^>]*>/gi, '') }}
              />
            </>
          )}

          {metaItems.length > 0 && (
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
                  {metaItems.map(item => (
                    <div key={item.label} className="flex justify-between text-sm py-2 border-b border-[#F0F0F2] dark:border-white/[0.06] last:border-b-0">
                      <span className="text-[#A1A1AA]">{item.label}</span>
                      <span className="font-medium text-[#09090B] dark:text-white">{item.value}</span>
                    </div>
                  ))}
                  {book.amazonUrl && (
                    <div className="flex justify-between text-sm py-2">
                      <span className="text-[#A1A1AA]">Buy</span>
                      <a href={book.amazonUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-[#6366F1] hover:underline" data-testid="link-amazon-details">
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

      {(book.amazonUrl || book.blinkistUrl) && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2">
          {book.blinkistUrl && (
            <a
              href={book.blinkistUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#09090B] hover:bg-[#09090B]/90 text-white border-none rounded-lg px-5 py-3 text-[15px] font-semibold shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#6366F1] focus:ring-offset-2"
              data-testid="button-blinkist-floating"
            >
              <FileText className="w-4 h-4" />
              Blinkist
            </a>
          )}
          {book.amazonUrl && (
            <a
              href={book.amazonUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#6366F1] hover:bg-[#4F46E5] text-white border-none rounded-lg px-6 py-3 text-[15px] font-semibold shadow-[0_4px_16px_rgba(99,102,241,0.4)] transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#6366F1] focus:ring-offset-2"
              data-testid="button-buy-floating"
            >
              <ShoppingCart className="w-4 h-4" />
              Buy on Amazon
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}

      <Footer />
    </div>
  );
}