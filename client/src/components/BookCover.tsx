import { useState, useEffect, useRef } from "react";
import { BookOpen } from "lucide-react";

const coverCache = new Map<string, string | null>();
const pendingLookups = new Map<string, Promise<string | null>>();

type BookCoverSize = "sm" | "md" | "lg" | "xl";

interface BookCoverProps {
  title: string;
  slug?: string | null;
  googleBooksId?: string | null;
  isbn?: string | null;
  hasCover?: boolean | null;
  size?: BookCoverSize;
  className?: string;
  testId?: string;
}

const SIZE_CLASSES: Record<BookCoverSize, string> = {
  sm: "w-12 h-[72px]",
  md: "w-[88px] h-[132px]",
  lg: "w-28 h-[168px]",
  xl: "w-36 h-[216px] sm:w-44 sm:h-[264px]",
};

const PLACEHOLDER_ICON_SIZE: Record<BookCoverSize, string> = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
  xl: "w-8 h-8",
};

function isGoogleBooksPlaceholder(img: HTMLImageElement): boolean {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w === 575 && h === 750) return true;
  if (w === 1 && h === 1) return true;
  if (w < 10 || h < 10) return true;
  return false;
}

function googleBooksCoverUrl(id: string): string {
  return `https://books.google.com/books/content?id=${id}&printsec=frontcover&img=1&zoom=1&source=gbs_api`;
}

function openLibraryCoverUrl(isbn: string): string {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
}

const isbnCache = new Map<string, string | null>();

function lookupCover(title: string): Promise<string | null> {
  const cacheKey = `search:${title}`;
  const cached = coverCache.get(cacheKey);
  if (cached !== undefined) return Promise.resolve(cached);

  const existing = pendingLookups.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const q = encodeURIComponent(title);
      const res = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1&fields=items(id,volumeInfo/imageLinks,volumeInfo/industryIdentifiers)`
      );
      if (!res.ok) { coverCache.set(cacheKey, null); return null; }
      const data = await res.json();
      const item = data?.items?.[0];

      const isbn = item?.volumeInfo?.industryIdentifiers?.find(
        (id: { type: string; identifier: string }) => id.type === "ISBN_13" || id.type === "ISBN_10"
      )?.identifier || null;
      if (isbn) isbnCache.set(title, isbn);

      if (item?.volumeInfo?.imageLinks) {
        const url = googleBooksCoverUrl(item.id);
        coverCache.set(cacheKey, url);
        return url;
      }

      if (isbn) {
        const olUrl = openLibraryCoverUrl(isbn);
        coverCache.set(cacheKey, olUrl);
        return olUrl;
      }
    } catch {}
    coverCache.set(cacheKey, null);
    return null;
  })();

  pendingLookups.set(cacheKey, promise);
  promise.finally(() => pendingLookups.delete(cacheKey));
  return promise;
}

function getOpenLibraryFallback(title: string, isbn: string | null | undefined): string | null {
  const foundIsbn = isbn || isbnCache.get(title);
  if (foundIsbn) return openLibraryCoverUrl(foundIsbn);
  return null;
}

function buildSources(
  slug: string | null | undefined,
  googleBooksId: string | null | undefined,
  isbn: string | null | undefined,
  hasCover: boolean | null | undefined,
): string[] {
  const sources: string[] = [];
  if (slug) sources.push(`/books/${slug}.jpg`);

  if (hasCover !== false && googleBooksId) {
    sources.push(googleBooksCoverUrl(googleBooksId));
  }

  if (isbn) {
    sources.push(openLibraryCoverUrl(isbn));
  }

  return sources;
}

function useCoverUrl(
  title: string,
  slug: string | null | undefined,
  googleBooksId: string | null | undefined,
  isbn: string | null | undefined,
  hasCover: boolean | null | undefined,
) {
  const sources = buildSources(slug, googleBooksId, isbn, hasCover);

  const [srcIndex, setSrcIndex] = useState(0);
  const cacheKey = `search:${title}`;
  const [searchUrl, setSearchUrl] = useState<string | null>(coverCache.get(cacheKey) ?? null);
  const [searchDone, setSearchDone] = useState(coverCache.has(cacheKey));
  const [allFailed, setAllFailed] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setSrcIndex(0);
    setSearchUrl(coverCache.get(cacheKey) ?? null);
    setSearchDone(coverCache.has(cacheKey));
    setAllFailed(false);
    return () => { mountedRef.current = false; };
  }, [slug, googleBooksId, isbn, title, cacheKey]);

  const advance = () => setSrcIndex(i => i + 1);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const src = sources[srcIndex] || "";
    if (src.includes("books.google.com") && isGoogleBooksPlaceholder(img)) {
      advance();
      return;
    }
    if (src.includes("openlibrary.org") && (img.naturalWidth < 10 || img.naturalHeight < 10)) {
      advance();
    }
  };

  const handleSearchLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (isGoogleBooksPlaceholder(img) || (img.naturalWidth < 10 || img.naturalHeight < 10)) {
      const olFallback = getOpenLibraryFallback(title, isbn);
      if (olFallback && searchUrl !== olFallback) {
        coverCache.set(cacheKey, olFallback);
        setSearchUrl(olFallback);
      } else {
        coverCache.set(cacheKey, null);
        setSearchUrl(null);
        setAllFailed(true);
      }
    }
  };

  useEffect(() => {
    if (srcIndex >= sources.length && !searchDone && title && !allFailed) {
      setSearchDone(true);
      lookupCover(title).then(url => {
        if (mountedRef.current) {
          if (url) setSearchUrl(url);
          else setAllFailed(true);
        }
      });
    }
  }, [srcIndex, sources.length, searchDone, title, allFailed, cacheKey]);

  const clearSearch = () => {
    coverCache.set(cacheKey, null);
    setSearchUrl(null);
    setAllFailed(true);
  };

  return { srcIndex, sources, searchUrl, advance, handleLoad, handleSearchLoad, clearSearch, allFailed };
}

export function BookCover({ title, slug, googleBooksId, isbn, hasCover, size = "md", className, testId }: BookCoverProps) {
  const { srcIndex, sources, searchUrl, advance, handleLoad, handleSearchLoad, clearSearch, allFailed } =
    useCoverUrl(title, slug, googleBooksId, isbn, hasCover);

  const sizeClass = SIZE_CLASSES[size];
  const defaultImgCls = `${sizeClass} rounded-lg object-cover shrink-0 shadow-md border border-black/[0.06] dark:border-white/[0.08]`;
  const imgCls = className || defaultImgCls;
  const placeholderCls = className
    ? className.replace(/object-cover|object-contain|shadow-\S+/g, "").trim() +
      " bg-amber-500/[0.06] flex items-center justify-center border border-amber-500/10"
    : `${sizeClass} rounded-lg bg-amber-500/[0.06] flex items-center justify-center shrink-0 border border-amber-500/10`;

  if (srcIndex < sources.length) {
    return <img src={sources[srcIndex]} alt={title} className={imgCls} onError={advance} onLoad={handleLoad} loading="lazy" data-testid={testId} />;
  }
  if (searchUrl && !allFailed) {
    return <img src={searchUrl} alt={title} className={imgCls} onError={clearSearch} onLoad={handleSearchLoad} loading="lazy" data-testid={testId} />;
  }
  return (
    <div className={placeholderCls} data-testid={testId}>
      <BookOpen className={`${PLACEHOLDER_ICON_SIZE[size]} text-amber-500/40`} />
    </div>
  );
}

export function BookCoverFill({ title, slug, googleBooksId, isbn, hasCover }: {
  title: string; slug?: string | null; googleBooksId?: string | null; isbn?: string | null; hasCover?: boolean | null;
}) {
  const { srcIndex, sources, searchUrl, advance, handleLoad, handleSearchLoad, clearSearch, allFailed } =
    useCoverUrl(title, slug, googleBooksId, isbn, hasCover);

  if (srcIndex < sources.length) {
    return <img src={sources[srcIndex]} alt={title} className="w-full h-full object-cover" onError={advance} onLoad={handleLoad} loading="lazy" />;
  }
  if (searchUrl && !allFailed) {
    return <img src={searchUrl} alt={title} className="w-full h-full object-cover" onError={clearSearch} onLoad={handleSearchLoad} loading="lazy" />;
  }
  return <BookOpen className="w-5 h-5 text-amber-400/50" />;
}
