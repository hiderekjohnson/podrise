import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Bookmark, BookmarkX, Share, Copy, ExternalLink, BookOpen, Users, Quote, Building2, ChevronDown, ChevronUp, ShoppingBag } from "lucide-react";
import { FeedEpisodeCard } from "@/components/FeedEpisodeCard";
import { PEOPLE_DIRECTORY, COMPANIES_DIRECTORY } from "../data/entityDirectoryData";

interface EpisodeQuoteData {
  id: number;
  speakerName: string;
  speakerRole: string | null;
  quoteText: string;
  context: string;
  quoteType: string;
  sortOrder: number;
}

interface GuestData {
  name: string;
  title?: string;
  bio?: string;
  photoUrl?: string;
}

interface ResourceData {
  type: string;
  name: string;
  author?: string;
  url?: string;
  description?: string;
  company?: string;
}

interface SponsorData {
  name: string;
  url?: string;
}

interface EnrichedBookmark {
  id: number;
  podcastSlug: string;
  episodeSlug: string;
  createdAt: string;
  podcastName: string;
  episodeTitle: string;
  publishDate: string | null;
  artworkUrl: string | null;
  tldl: string | null;
  keyInsights: string[] | null;
  whatHappened: string | null;
  quote: string | null;
  quoteAttribution: string | null;
  hosts: string | null;
  keyTopics: string[] | null;
  guests: GuestData[];
  resources: ResourceData[];
  sponsors: SponsorData[];
  matchedPeopleSlugs: string[];
  matchedCompanySlugs: string[];
  entityContexts: Record<string, string>;
  episodeQuotes: EpisodeQuoteData[];
}

function SharePopover({ episodeTitle, podcastSlug, episodeSlug, itemId, toast }: {
  episodeTitle: string;
  podcastSlug: string;
  episodeSlug: string;
  itemId: number;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [open, setOpen] = useState(false);
  const getShareUrl = () => `${window.location.origin}/podcasts/${encodeURIComponent(podcastSlug)}/${encodeURIComponent(episodeSlug)}`;
  const supportsNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Share episode"
        className="w-8 h-8 rounded-[7px] flex items-center justify-center text-[#A1A1AA] hover:bg-white hover:text-[#6366F1] transition-all"
        data-testid={`bookmark-share-${itemId}`}
      >
        <Share className="w-[15px] h-[15px]" />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-[180px] bg-white dark:bg-[#1C1C22] rounded-xl shadow-lg border border-[#E4E4E7] dark:border-[#3F3F46] overflow-hidden z-50">
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(getShareUrl());
                toast({ title: "Link copied", description: "Episode link copied to clipboard" });
              } catch { toast({ title: "Copy failed", description: "Could not copy link", variant: "destructive" }); }
              setOpen(false);
            }}
            className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-[13px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] transition-colors"
            data-testid={`bookmark-share-copy-${itemId}`}
          >
            <Copy className="w-4 h-4" /> Copy link
          </button>
          {supportsNativeShare && (
            <button
              onClick={() => { navigator.share({ title: episodeTitle, url: getShareUrl() }).catch(() => {}); setOpen(false); }}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-[13px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] border-t border-[#F0F0F2] dark:border-[#3F3F46]"
              data-testid={`bookmark-share-native-${itemId}`}
            >
              <ExternalLink className="w-4 h-4" /> Share via...
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function GuestPhoto({ name, photoUrl, testId }: { name: string; photoUrl?: string; testId: string }) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className="w-10 h-10 rounded-full object-cover bg-[#F4F4F5] dark:bg-[#1C1C22]"
        loading="lazy"
        data-testid={testId}
      />
    );
  }
  return (
    <div className="w-10 h-10 rounded-full bg-[#6366F1]/10 flex items-center justify-center" data-testid={testId}>
      <span className="text-[14px] font-bold text-[#6366F1]">{name.charAt(0)}</span>
    </div>
  );
}

function BookmarkRecapSection({ whatHappened, episodeSlug }: {
  whatHappened: string;
  episodeSlug: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const paragraphs = whatHappened.split("\n\n").filter(Boolean);
  const previewParagraphs = paragraphs.slice(0, 2);
  const hasMore = paragraphs.length > 2;

  return (
    <div className="border-t border-[#F0F0F2] dark:border-[#1C1C22] px-5 md:px-6 py-5" data-testid={`bookmark-recap-${episodeSlug}`}>
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="w-4 h-4 text-[#6366F1] flex-shrink-0" />
        <span className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#A1A1AA]" style={{ fontFamily: "var(--font-mono)" }}>Episode Recap</span>
      </div>
      <div className="space-y-3">
        {(expanded ? paragraphs : previewParagraphs).map((p, i) => (
          <p key={i} className="text-[15px] leading-[1.7] text-[#52525B] dark:text-[#A1A1AA]">{p}</p>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 mt-3 text-[13px] font-semibold text-[#6366F1] hover:text-[#4F46E5] transition-colors"
          data-testid={`bookmark-recap-toggle-${episodeSlug}`}
        >
          {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</> : <><ChevronDown className="w-3.5 h-3.5" /> Read more</>}
        </button>
      )}
    </div>
  );
}

function BookmarkGuestsSection({ guests, episodeSlug }: { guests: GuestData[]; episodeSlug: string }) {
  if (guests.length === 0) return null;
  return (
    <div className="border-t border-[#F0F0F2] dark:border-[#1C1C22] px-5 md:px-6 py-5" data-testid={`bookmark-guests-${episodeSlug}`}>
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-sky-500 flex-shrink-0" />
        <span className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#A1A1AA]" style={{ fontFamily: "var(--font-mono)" }}>{guests.length > 1 ? "Guests" : "Guest"}</span>
      </div>
      <div className="flex flex-wrap gap-4">
        {guests.map((guest, i) => (
          <div key={i} className="flex items-center gap-3" data-testid={`bookmark-guest-${episodeSlug}-${i}`}>
            <GuestPhoto name={guest.name} photoUrl={guest.photoUrl} testId={`bookmark-guest-photo-${episodeSlug}-${i}`} />
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-[#09090B] dark:text-white truncate">{guest.name}</p>
              {guest.title && <p className="text-[12px] text-[#71717A] dark:text-[#A1A1AA] truncate">{guest.title}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BookmarkMentionsSection({ matchedPeopleSlugs, matchedCompanySlugs, entityContexts, episodeSlug }: {
  matchedPeopleSlugs: string[];
  matchedCompanySlugs: string[];
  entityContexts: Record<string, string>;
  episodeSlug: string;
}) {
  const notablePeople = useMemo(() => {
    if (!matchedPeopleSlugs.length) return [];
    const slugSet = new Set(matchedPeopleSlugs);
    return PEOPLE_DIRECTORY.filter(p => slugSet.has(p.slug)).slice(0, 6);
  }, [matchedPeopleSlugs]);

  const notableCompanies = useMemo(() => {
    if (!matchedCompanySlugs.length) return [];
    const slugSet = new Set(matchedCompanySlugs);
    return COMPANIES_DIRECTORY.filter(c => slugSet.has(c.slug)).slice(0, 6);
  }, [matchedCompanySlugs]);

  if (notablePeople.length === 0 && notableCompanies.length === 0) return null;

  return (
    <div className="border-t border-[#F0F0F2] dark:border-[#1C1C22] px-5 md:px-6 py-5" data-testid={`bookmark-mentions-${episodeSlug}`}>
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-orange-500 flex-shrink-0" />
        <span className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#A1A1AA]" style={{ fontFamily: "var(--font-mono)" }}>Mentioned</span>
      </div>
      {notablePeople.length > 0 && (
        <div className="mb-3">
          <div className="flex flex-wrap gap-2">
            {notablePeople.map((person) => (
              <Link key={person.slug} href={`/people/${person.slug}`}>
                <span
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/[0.06] hover:bg-orange-500/[0.12] border border-orange-500/[0.1] text-[13px] font-medium text-orange-700 dark:text-orange-400 transition-colors"
                  data-testid={`bookmark-mention-person-${person.slug}`}
                  title={entityContexts[person.slug] || person.title}
                >
                  <img src={person.imageUrl} alt={person.name} className="w-5 h-5 rounded-full object-cover" loading="lazy" />
                  {person.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
      {notableCompanies.length > 0 && (
        <div>
          <div className="flex flex-wrap gap-2">
            {notableCompanies.map((company) => (
              <Link key={company.slug} href={`/companies/${company.slug}`}>
                <span
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/[0.06] hover:bg-blue-500/[0.12] border border-blue-500/[0.1] text-[13px] font-medium text-blue-700 dark:text-blue-400 transition-colors"
                  data-testid={`bookmark-mention-company-${company.slug}`}
                  title={entityContexts[company.slug] || company.description}
                >
                  <img src={company.logoUrl} alt={company.name} className="w-5 h-5 rounded-lg object-contain" loading="lazy" />
                  {company.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BookmarkBooksSection({ resources, episodeSlug }: { resources: ResourceData[]; episodeSlug: string }) {
  const books = resources.filter(r => r.type === "book" && r.name && r.name !== "_books_checked");
  if (books.length === 0) return null;

  return (
    <div className="border-t border-[#F0F0F2] dark:border-[#1C1C22] px-5 md:px-6 py-5" data-testid={`bookmark-books-${episodeSlug}`}>
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <span className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#A1A1AA]" style={{ fontFamily: "var(--font-mono)" }}>Books Mentioned</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {books.slice(0, 6).map((book, i) => (
          <div
            key={i}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/[0.06] border border-amber-500/[0.1] text-[13px] font-medium text-amber-700 dark:text-amber-400"
            data-testid={`bookmark-book-${episodeSlug}-${i}`}
          >
            <span>📚</span>
            {book.name}
            {book.author && <span className="text-[11px] text-amber-600/70 dark:text-amber-400/70">by {book.author}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function BookmarkProductsSection({ resources, episodeSlug }: { resources: ResourceData[]; episodeSlug: string }) {
  const products = resources.filter(r =>
    r.type && r.type !== "book" && r.name && r.name !== "_books_checked"
  );
  if (products.length === 0) return null;

  return (
    <div className="border-t border-[#F0F0F2] dark:border-[#1C1C22] px-5 md:px-6 py-5" data-testid={`bookmark-products-${episodeSlug}`}>
      <div className="flex items-center gap-2 mb-3">
        <ShoppingBag className="w-4 h-4 text-emerald-500 flex-shrink-0" />
        <span className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#A1A1AA]" style={{ fontFamily: "var(--font-mono)" }}>Products & Tools Mentioned</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {products.slice(0, 6).map((product, i) => (
          <div
            key={i}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/[0.06] border border-emerald-500/[0.1] text-[13px] font-medium text-emerald-700 dark:text-emerald-400"
            data-testid={`bookmark-product-${episodeSlug}-${i}`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            {product.name}
            {product.company && product.company !== product.name && (
              <span className="text-[11px] text-emerald-600/70 dark:text-emerald-400/70">by {product.company}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BookmarkQuotesSection({ quotes, episodeSlug }: { quotes: EpisodeQuoteData[]; episodeSlug: string }) {
  if (quotes.length === 0) return null;

  return (
    <div className="border-t border-[#F0F0F2] dark:border-[#1C1C22] px-5 md:px-6 py-5" data-testid={`bookmark-quotes-${episodeSlug}`}>
      <div className="flex items-center gap-2 mb-3">
        <Quote className="w-4 h-4 text-[#8B5CF6] flex-shrink-0" />
        <span className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#A1A1AA]" style={{ fontFamily: "var(--font-mono)" }}>Notable Quotes</span>
      </div>
      <div className="space-y-3">
        {quotes.slice(0, 4).map((q, i) => (
          <div key={q.id} className="border-l-[3px] border-[#8B5CF6] rounded-r-[10px] px-[18px] py-[14px] bg-[#F7F7FC] dark:bg-[#1C1C22]" data-testid={`bookmark-quote-${episodeSlug}-${i}`}>
            <div className="text-[15px] italic text-[#52525B] dark:text-[#A1A1AA] leading-[1.65] mb-2" style={{ fontFamily: "var(--font-serif)" }}>
              "{q.quoteText}"
            </div>
            <div className="text-[12px] text-[#A1A1AA]" style={{ fontFamily: "var(--font-mono)" }}>
              — {q.speakerName}{q.speakerRole ? `, ${q.speakerRole}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BookmarkCard({ item, onRemove, toast }: {
  item: EnrichedBookmark;
  onRemove: (podcastSlug: string, episodeSlug: string) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  return (
    <FeedEpisodeCard
      podcastSlug={item.podcastSlug}
      episodeSlug={item.episodeSlug}
      podcastName={item.podcastName}
      episodeTitle={item.episodeTitle}
      publishDate={item.publishDate}
      artworkUrl={item.artworkUrl}
      tldl={item.tldl}
      keyInsights={item.keyInsights}
      quote={item.quote}
      quoteAttribution={item.quoteAttribution}
      testIdPrefix="bookmark"
      additionalContent={
        <>
          {item.whatHappened && (
            <BookmarkRecapSection
              whatHappened={item.whatHappened}
              episodeSlug={item.episodeSlug}
            />
          )}
          <BookmarkGuestsSection guests={item.guests} episodeSlug={item.episodeSlug} />
          <BookmarkMentionsSection
            matchedPeopleSlugs={item.matchedPeopleSlugs}
            matchedCompanySlugs={item.matchedCompanySlugs}
            entityContexts={item.entityContexts}
            episodeSlug={item.episodeSlug}
          />
          <BookmarkBooksSection resources={item.resources} episodeSlug={item.episodeSlug} />
          <BookmarkProductsSection resources={item.resources} episodeSlug={item.episodeSlug} />
          <BookmarkQuotesSection quotes={item.episodeQuotes} episodeSlug={item.episodeSlug} />
        </>
      }
      bottomActions={
        <div className="border-t border-[#F0F0F2] dark:border-[#1C1C22] bg-[#F7F7FC] dark:bg-[#0D0D10] flex items-center justify-between px-3 py-1.5">
          <Link href={`/podcasts/${item.podcastSlug}/${item.episodeSlug}`}>
            <span className="text-[12px] font-medium text-[#6366F1] hover:text-[#4F46E5] transition-colors" data-testid={`bookmark-full-recap-${item.id}`}>
              Read full recap →
            </span>
          </Link>
          <div className="flex items-center gap-[2px]">
            <button
              onClick={() => onRemove(item.podcastSlug, item.episodeSlug)}
              className="w-8 h-8 rounded-[7px] flex items-center justify-center text-[#A1A1AA] hover:bg-white dark:hover:bg-[#1C1C22] hover:text-red-500 transition-all"
              aria-label="Remove saved episode"
              data-testid={`bookmark-remove-${item.id}`}
            >
              <BookmarkX className="w-[15px] h-[15px]" />
            </button>
            <SharePopover
              episodeTitle={item.episodeTitle}
              podcastSlug={item.podcastSlug}
              episodeSlug={item.episodeSlug}
              itemId={item.id}
              toast={toast}
            />
          </div>
        </div>
      }
    />
  );
}

export default function BookmarksPage() {
  const { toast } = useToast();

  const { data: bookmarksList = [], isLoading } = useQuery<EnrichedBookmark[]>({
    queryKey: ["/api/bookmarks/enriched"],
  });

  const removeBookmark = useMutation({
    mutationFn: async ({ podcastSlug, episodeSlug }: { podcastSlug: string; episodeSlug: string }) => {
      await apiRequest("DELETE", `/api/bookmarks/${encodeURIComponent(podcastSlug)}/${encodeURIComponent(episodeSlug)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks/enriched"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      toast({ title: "Episode removed" });
    },
  });

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F9F9FB] dark:bg-[#09090B]" data-testid="bookmarks-page">
        <div className="px-4 md:px-8 py-8 pb-24 md:pb-8">
          <div className="mb-6">
            <h1 className="text-[24px] md:text-[28px] font-bold text-[#09090B] dark:text-white mb-1" data-testid="bookmarks-title">Saved Episodes</h1>
            <p className="text-[15px] text-[#71717A] dark:text-[#A1A1AA]">Episodes you've saved for later</p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-7 h-7 animate-spin text-[#6366F1]" />
            </div>
          ) : bookmarksList.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-full bg-[#F4F4F5] dark:bg-[#1C1C22] flex items-center justify-center mx-auto mb-4">
                <Bookmark className="w-7 h-7 text-[#A1A1AA]" />
              </div>
              <p className="text-[17px] font-bold text-[#09090B] dark:text-white mb-1" data-testid="bookmarks-empty">No saved episodes yet</p>
              <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed max-w-sm mx-auto">
                Save episodes from your feed by clicking the save icon. They'll appear here for easy access.
              </p>
            </div>
          ) : (
            <div className="space-y-5" data-testid="bookmarks-feed">
              {bookmarksList.map((bm) => (
                <BookmarkCard
                  key={bm.id}
                  item={bm}
                  onRemove={(podcastSlug, episodeSlug) => removeBookmark.mutate({ podcastSlug, episodeSlug })}
                  toast={toast}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
