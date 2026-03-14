import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Search, BookOpen, ArrowLeft, ExternalLink, Image, Hash, FileText,
  Calendar, Star, Layers, Tag, Globe, CheckCircle2, XCircle, AlertTriangle,
  Clock, ChevronLeft, ChevronRight, RefreshCw, Loader2, BookMarked,
  Languages, Library, Eye, Bookmark, BookOpenCheck, BarChart3,
  DollarSign, ShoppingCart, Monitor, Headphones, FileImage, Ruler,
} from "lucide-react";

interface BookEnrichment {
  id: number;
  book_key: string;
  book_title: string;
  author: string | null;
  description: string | null;
  podcast_buzz: string | null;
  asin: string | null;
  amazon_url: string | null;
  created_at: string;
  updated_at: string;
  slug: string;
  topics: string[];
  page_count: number | null;
  publish_year: number | null;
  rating: number | null;
  rating_count: number | null;
  google_books_id: string | null;
  isbn: string | null;
  has_cover: boolean;
  cover_approved: boolean | null;
  cover_quality_score: number | null;
  needs_replacement: boolean;
  replacement_note: string | null;
  cover_source: string | null;
  cover_tried_sources: string[];
  rejection_reason: string | null;
  subtitle: string | null;
  publisher: string | null;
  published_date: string | null;
  isbn_10: string | null;
  isbn_13: string | null;
  language: string | null;
  categories: string[] | null;
  maturity_rating: string | null;
  print_type: string | null;
  google_preview_link: string | null;
  google_info_link: string | null;
  google_description: string | null;
  ol_work_key: string | null;
  ol_subjects: string[] | null;
  ol_languages: string[] | null;
  ol_edition_count: number | null;
  ol_ebook_count: number | null;
  ol_cover_id: number | null;
  ol_ratings_average: number | null;
  ol_ratings_count: number | null;
  ol_want_to_read: number | null;
  ol_currently_reading: number | null;
  ol_already_read: number | null;
  ol_first_publish_year: number | null;
  ol_publishers: string[] | null;
  ol_number_of_pages: number | null;
  ol_first_sentence: string | null;
  ol_subtitle: string | null;
  ol_author_names: string[] | null;
  ol_id_amazon: string[] | null;
  ol_id_goodreads: string[] | null;
  ol_has_fulltext: boolean | null;
  ol_all_isbns: string[] | null;
  ol_publish_dates: string[] | null;
  last_api_fetch: string | null;
  printed_page_count: number | null;
  dimensions: string | null;
  canonical_volume_link: string | null;
  content_version: string | null;
  gb_image_links: Record<string, string> | null;
  gb_reading_modes: Record<string, boolean> | null;
  gb_saleability: string | null;
  gb_is_ebook: boolean | null;
  gb_list_price: number | null;
  gb_retail_price: number | null;
  gb_price_currency: string | null;
  gb_buy_link: string | null;
  gb_viewability: string | null;
  gb_embeddable: boolean | null;
  gb_public_domain: boolean | null;
  gb_text_to_speech: string | null;
  gb_epub_available: boolean | null;
  gb_pdf_available: boolean | null;
  gb_web_reader_link: string | null;
}

const ITEMS_PER_PAGE = 50;

const LANG_NAMES: Record<string, string> = {
  en: "English", eng: "English", fre: "French", fra: "French", spa: "Spanish",
  ger: "German", deu: "German", ita: "Italian", por: "Portuguese", jpn: "Japanese",
  zho: "Chinese", chi: "Chinese", kor: "Korean", rus: "Russian", ara: "Arabic",
  hin: "Hindi", und: "Undetermined",
};

function stripHtml(html: string): string {
  let text = html;
  text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>\s*<p>/gi, '\n\n');
  text = text.replace(/<[^>]*>/g, '');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function CoverStatusBadge({ book }: { book: BookEnrichment }) {
  if (book.cover_approved === true)
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700"><CheckCircle2 className="w-2.5 h-2.5" />Approved</span>;
  if (book.cover_approved === false && book.needs_replacement)
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700"><AlertTriangle className="w-2.5 h-2.5" />Needs Replace</span>;
  if (book.cover_approved === false)
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700"><XCircle className="w-2.5 h-2.5" />Rejected</span>;
  if (!book.has_cover)
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500"><Image className="w-2.5 h-2.5" />No Cover</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-600"><Clock className="w-2.5 h-2.5" />Pending</span>;
}

type ApiSource = "gb" | "ol" | "pc" | "amazon";
const SOURCE_BADGES: Record<ApiSource, { label: string; color: string }> = {
  gb: { label: "Google Books", color: "bg-blue-50 text-blue-600 border-blue-200" },
  ol: { label: "Open Library", color: "bg-indigo-50 text-indigo-600 border-indigo-200" },
  pc: { label: "PodCap", color: "bg-violet-50 text-violet-600 border-violet-200" },
  amazon: { label: "Amazon", color: "bg-orange-50 text-orange-600 border-orange-200" },
};

function SourceBadge({ source }: { source: ApiSource }) {
  const s = SOURCE_BADGES[source];
  return <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${s.color} shrink-0 leading-none`}>{s.label}</span>;
}

function DataRow({ label, value, icon: Icon, mono, link, source }: { label: string; value: string | number | boolean | null | undefined; icon?: typeof Hash; mono?: boolean; link?: string; source?: ApiSource }) {
  if (value === null || value === undefined || value === "" || (typeof value === 'number' && isNaN(value))) return null;
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-2 w-40 shrink-0">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className={`text-sm text-primary hover:underline flex items-center gap-1 ${mono ? "font-mono text-xs" : ""}`}>
            {display} <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <span className={`text-sm break-all ${mono ? "font-mono text-xs" : ""}`}>{display}</span>
        )}
        {source && <SourceBadge source={source} />}
      </div>
    </div>
  );
}

function TagList({ items, color }: { items: string[]; color?: string }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <span key={i} className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${color || "bg-muted/50 text-muted-foreground"}`}>{t}</span>
      ))}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Hash; children: React.ReactNode }) {
  return (
    <div className="glass-panel rounded-2xl p-5">
      <h4 className="text-sm font-black mb-3 flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        {title}
      </h4>
      {children}
    </div>
  );
}

function BookDetail({ book: initialBook, onBack, onUpdate }: { book: BookEnrichment; onBack: () => void; onUpdate: (b: BookEnrichment) => void }) {
  const { toast } = useToast();
  const [book, setBook] = useState(initialBook);

  const enrichMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/bookstore/enrich", { id: book.id });
      return res.json();
    },
    onSuccess: (data) => {
      const apis = data.apiStatus;
      const apiList = [apis?.googleBooks && "Google Books", apis?.openLibrary && "Open Library"].filter(Boolean);
      const desc = data.fieldsUpdated > 0
        ? `Updated ${data.fieldsUpdated} fields from ${apiList.join(" & ") || "APIs"}`
        : `No new data found${apiList.length ? ` (checked ${apiList.join(" & ")})` : ""}`;
      toast({ title: data.fieldsUpdated > 0 ? "Enriched" : "No changes", description: desc });
      setBook(data.book);
      onUpdate(data.book);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bookstore"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to enrich", variant: "destructive" });
    },
  });

  const coverUrl = book.has_cover ? `/books/${book.slug}.jpg` : null;
  const ts = Date.now();
  const gbDesc = book.google_description ? stripHtml(book.google_description) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-primary hover:underline" data-testid="button-book-back">
          <ArrowLeft className="w-4 h-4" /> Back to all books
        </button>
        <button onClick={() => enrichMutation.mutate()} disabled={enrichMutation.isPending}
          className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          data-testid="button-enrich-book">
          {enrichMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Fetching from APIs...</> : <><RefreshCw className="w-4 h-4" />Fetch All API Data</>}
        </button>
      </div>

      {book.last_api_fetch && (
        <p className="text-[10px] text-muted-foreground text-right">Last API fetch: {new Date(book.last_api_fetch).toLocaleString()}</p>
      )}

      <div className="glass-panel rounded-2xl p-6">
        <div className="flex gap-6">
          <div className="shrink-0">
            {coverUrl ? (
              <img src={`${coverUrl}?v=${ts}`} alt={book.book_title} className="w-[180px] h-[270px] object-cover rounded-xl shadow-md" data-testid="img-book-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <div className="w-[180px] h-[270px] bg-muted/30 rounded-xl flex items-center justify-center border border-dashed border-border">
                <BookOpen className="w-12 h-12 text-muted-foreground/30" />
              </div>
            )}
            <div className="mt-2 flex justify-center"><CoverStatusBadge book={book} /></div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-black mb-0.5" data-testid="text-book-title">{book.book_title}</h3>
            {book.subtitle && (
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-muted-foreground italic" data-testid="text-book-subtitle">{book.subtitle}</p>
                <SourceBadge source="gb" />
              </div>
            )}
            {book.ol_subtitle && book.ol_subtitle !== book.subtitle && (
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs text-muted-foreground/70 italic">{book.ol_subtitle}</p>
                <SourceBadge source="ol" />
              </div>
            )}
            {book.author && <p className="text-sm text-muted-foreground mb-1" data-testid="text-book-author">by {book.author}</p>}
            {book.ol_author_names && book.ol_author_names.length > 0 && book.ol_author_names.join(", ") !== book.author && (
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs text-muted-foreground/70">Authors: {book.ol_author_names.join(", ")}</p>
                <SourceBadge source="ol" />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 mb-3 text-xs text-muted-foreground">
              {book.publisher && <span className="flex items-center gap-1"><BookMarked className="w-3 h-3" />{book.publisher}</span>}
              {book.published_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{book.published_date}</span>}
              {book.page_count && <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{book.page_count} pages</span>}
              {book.language && <span className="flex items-center gap-1"><Languages className="w-3 h-3" />{LANG_NAMES[book.language] || book.language}</span>}
              {book.print_type && <span className="flex items-center gap-1"><Library className="w-3 h-3" />{book.print_type}</span>}
              {book.dimensions && <span className="flex items-center gap-1"><Ruler className="w-3 h-3" />{book.dimensions}</span>}
            </div>

            {(book.gb_list_price != null || book.gb_retail_price != null) && (
              <div className="flex items-center gap-3 mb-3">
                {book.gb_list_price != null && <span className="text-sm font-bold text-green-700 flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" />{book.gb_list_price} {book.gb_price_currency || "USD"}</span>}
                {book.gb_retail_price != null && book.gb_retail_price !== book.gb_list_price && <span className="text-xs text-muted-foreground">Retail: ${book.gb_retail_price}</span>}
                {book.gb_saleability && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-600">{book.gb_saleability.replace(/_/g, " ")}</span>}
                <SourceBadge source="gb" />
              </div>
            )}

            {(book.rating || book.ol_ratings_average) && (
              <div className="flex items-center gap-4 mb-3">
                {book.rating && (
                  <div className="flex items-center gap-1.5">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                    <span className="text-sm font-bold">{Number(book.rating).toFixed(1)}</span>
                    {book.rating_count && <span className="text-xs text-muted-foreground">({book.rating_count.toLocaleString()} ratings)</span>}
                    <SourceBadge source="ol" />
                  </div>
                )}
                {book.ol_ratings_average && Number(book.ol_ratings_average) !== Number(book.rating) && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{Number(book.ol_ratings_average).toFixed(1)}</span>
                    {book.ol_ratings_count && <span>({book.ol_ratings_count} ratings)</span>}
                    <SourceBadge source="ol" />
                  </div>
                )}
              </div>
            )}

            {book.description && (
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs font-bold text-muted-foreground uppercase">Description</p>
                  <SourceBadge source="pc" />
                </div>
                <p className="text-sm leading-relaxed" data-testid="text-book-description">{book.description}</p>
              </div>
            )}
            {gbDesc && gbDesc !== book.description && (
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs font-bold text-muted-foreground uppercase">Description</p>
                  <SourceBadge source="gb" />
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{gbDesc}</p>
              </div>
            )}
            {book.ol_first_sentence && (
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs font-bold text-muted-foreground uppercase">First Sentence</p>
                  <SourceBadge source="ol" />
                </div>
                <p className="text-sm italic text-muted-foreground">"{book.ol_first_sentence}"</p>
              </div>
            )}
            {book.podcast_buzz && (
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs font-bold text-primary">Podcast Buzz</p>
                  <SourceBadge source="pc" />
                </div>
                <p className="text-sm">{book.podcast_buzz}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {((book.categories?.length || 0) > 0 || (book.topics?.length || 0) > 0 || (book.ol_subjects?.length || 0) > 0) && (
        <Section title="Categories & Topics" icon={Tag}>
          <div className="space-y-3">
            {book.categories && book.categories.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Categories</p>
                  <SourceBadge source="gb" />
                </div>
                <TagList items={book.categories} color="bg-blue-50 text-blue-700" />
              </div>
            )}
            {book.ol_subjects && book.ol_subjects.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Subjects</p>
                  <SourceBadge source="ol" />
                </div>
                <TagList items={book.ol_subjects} color="bg-indigo-50 text-indigo-700" />
              </div>
            )}
            {book.topics && book.topics.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Topics</p>
                  <SourceBadge source="pc" />
                </div>
                <TagList items={book.topics} />
              </div>
            )}
          </div>
        </Section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Identifiers" icon={Hash}>
          <DataRow label="ISBN-13" value={book.isbn_13 || book.isbn} icon={Hash} mono source="gb" />
          <DataRow label="ISBN-10" value={book.isbn_10} icon={Hash} mono source="gb" />
          {book.isbn && book.isbn !== book.isbn_13 && book.isbn !== book.isbn_10 && <DataRow label="ISBN (stored)" value={book.isbn} icon={Hash} mono source="pc" />}
          <DataRow label="ASIN" value={book.asin} icon={Hash} mono source="amazon" />
          <DataRow label="Google ID" value={book.google_books_id} icon={Globe} mono link={book.google_books_id ? `https://books.google.com/books?id=${book.google_books_id}` : undefined} source="gb" />
          <DataRow label="OL Work Key" value={book.ol_work_key} icon={Globe} mono link={book.ol_work_key ? `https://openlibrary.org${book.ol_work_key}` : undefined} source="ol" />
          <DataRow label="OL Cover ID" value={book.ol_cover_id} icon={Image} mono link={book.ol_cover_id ? `https://covers.openlibrary.org/b/id/${book.ol_cover_id}-L.jpg` : undefined} source="ol" />
          {book.ol_id_amazon && book.ol_id_amazon.length > 0 && <DataRow label="Amazon ID" value={book.ol_id_amazon.join(", ")} icon={ShoppingCart} mono source="ol" />}
          {book.ol_id_goodreads && book.ol_id_goodreads.length > 0 && (
            <DataRow label="Goodreads ID" value={book.ol_id_goodreads[0]} icon={BookOpen} mono link={`https://www.goodreads.com/book/show/${book.ol_id_goodreads[0]}`} source="ol" />
          )}
          <DataRow label="Slug" value={book.slug} icon={Tag} mono source="pc" />
          <DataRow label="Book Key" value={book.book_key} icon={Tag} mono source="pc" />
          <DataRow label="Content Ver." value={book.content_version} icon={Hash} mono source="gb" />
        </Section>

        <Section title="Publication Details" icon={BookOpen}>
          <DataRow label="Publisher" value={book.publisher} icon={BookMarked} source="gb" />
          {book.ol_publishers && book.ol_publishers.length > 0 && book.ol_publishers.join(", ") !== book.publisher && (
            <DataRow label="Publisher" value={book.ol_publishers.join(", ")} icon={BookMarked} source="ol" />
          )}
          <DataRow label="Published" value={book.published_date} icon={Calendar} source="gb" />
          <DataRow label="Publish Year" value={book.publish_year} icon={Calendar} source={book.published_date ? "gb" : "ol"} />
          {book.ol_first_publish_year && book.ol_first_publish_year !== book.publish_year && (
            <DataRow label="First Published" value={book.ol_first_publish_year} icon={Calendar} source="ol" />
          )}
          {book.ol_publish_dates && book.ol_publish_dates.length > 0 && (
            <DataRow label="Pub Dates" value={book.ol_publish_dates.join(", ")} icon={Calendar} source="ol" />
          )}
          <DataRow label="Pages" value={book.page_count} icon={FileText} source="gb" />
          {book.printed_page_count && book.printed_page_count !== book.page_count && (
            <DataRow label="Printed Pages" value={book.printed_page_count} icon={FileText} source="gb" />
          )}
          {book.ol_number_of_pages && book.ol_number_of_pages !== book.page_count && (
            <DataRow label="Pages" value={book.ol_number_of_pages} icon={FileText} source="ol" />
          )}
          <DataRow label="Language" value={book.language ? (LANG_NAMES[book.language] || book.language) : null} icon={Languages} source="gb" />
          {book.ol_languages && book.ol_languages.length > 0 && (
            <DataRow label="Languages" value={book.ol_languages.map(l => LANG_NAMES[l] || l).join(", ")} icon={Languages} source="ol" />
          )}
          <DataRow label="Dimensions" value={book.dimensions} icon={Ruler} source="gb" />
          <DataRow label="Print Type" value={book.print_type} icon={Library} source="gb" />
          <DataRow label="Maturity" value={book.maturity_rating} icon={Eye} source="gb" />
          <DataRow label="Editions" value={book.ol_edition_count} icon={Layers} source="ol" />
          <DataRow label="Ebook Editions" value={book.ol_ebook_count} icon={BookOpenCheck} source="ol" />
          <DataRow label="Full Text Avail." value={book.ol_has_fulltext} icon={FileText} source="ol" />
        </Section>

        <Section title="Sale & Access Info" icon={ShoppingCart}>
          <DataRow label="Saleability" value={book.gb_saleability?.replace(/_/g, " ")} icon={ShoppingCart} source="gb" />
          <DataRow label="Is Ebook" value={book.gb_is_ebook} icon={Monitor} source="gb" />
          <DataRow label="List Price" value={book.gb_list_price != null ? `$${book.gb_list_price} ${book.gb_price_currency || "USD"}` : null} icon={DollarSign} source="gb" />
          <DataRow label="Retail Price" value={book.gb_retail_price != null ? `$${book.gb_retail_price} ${book.gb_price_currency || "USD"}` : null} icon={DollarSign} source="gb" />
          <DataRow label="Buy Link" value={book.gb_buy_link ? "Google Play Store" : null} icon={ShoppingCart} link={book.gb_buy_link || undefined} source="gb" />
          <DataRow label="Viewability" value={book.gb_viewability} icon={Eye} source="gb" />
          <DataRow label="Embeddable" value={book.gb_embeddable} icon={Monitor} source="gb" />
          <DataRow label="Public Domain" value={book.gb_public_domain} icon={Globe} source="gb" />
          <DataRow label="Text-to-Speech" value={book.gb_text_to_speech} icon={Headphones} source="gb" />
          <DataRow label="EPUB Available" value={book.gb_epub_available} icon={FileText} source="gb" />
          <DataRow label="PDF Available" value={book.gb_pdf_available} icon={FileText} source="gb" />
          <DataRow label="Web Reader" value={book.gb_web_reader_link ? "Open Reader" : null} icon={Monitor} link={book.gb_web_reader_link || undefined} source="gb" />
          {book.gb_reading_modes && (
            <DataRow label="Reading Modes" value={Object.entries(book.gb_reading_modes).filter(([,v]) => v).map(([k]) => k).join(", ") || "None"} icon={BookOpen} source="gb" />
          )}
          {!book.gb_saleability && !book.gb_viewability && (
            <p className="text-xs text-muted-foreground">No sale/access data yet. Click "Fetch All API Data" to pull from Google Books.</p>
          )}
        </Section>

        <Section title="Community Stats" icon={BarChart3}>
          {(book.ol_want_to_read !== null || book.ol_currently_reading !== null || book.ol_already_read !== null || book.ol_ratings_average !== null) ? (
            <>
              <DataRow label="Rating" value={book.ol_ratings_average ? `${Number(book.ol_ratings_average).toFixed(2)} / 5` : null} icon={Star} source="ol" />
              <DataRow label="# Ratings" value={book.ol_ratings_count} icon={Star} source="ol" />
              <DataRow label="Want to Read" value={book.ol_want_to_read} icon={Bookmark} source="ol" />
              <DataRow label="Reading Now" value={book.ol_currently_reading} icon={BookOpen} source="ol" />
              <DataRow label="Already Read" value={book.ol_already_read} icon={CheckCircle2} source="ol" />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No community data yet. Click "Fetch All API Data" to pull from Open Library.</p>
          )}
        </Section>

        {book.gb_image_links && Object.keys(book.gb_image_links).length > 0 && (
          <Section title="Cover Variants" icon={FileImage}>
            <div className="space-y-1.5">
              {Object.entries(book.gb_image_links).map(([size, url]) => (
                <DataRow key={size} label={size} value="View Image" icon={Image} link={url.replace('http://', 'https://')} source="gb" />
              ))}
            </div>
          </Section>
        )}

        {book.ol_all_isbns && book.ol_all_isbns.length > 0 && (
          <Section title="All Known ISBNs" icon={Hash}>
            <div className="flex items-center gap-2 mb-2">
              <SourceBadge source="ol" />
              <span className="text-[10px] text-muted-foreground">{book.ol_all_isbns.length} ISBNs found</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {book.ol_all_isbns.map((isbn, i) => (
                <span key={i} className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-muted/50 text-muted-foreground">{isbn}</span>
              ))}
            </div>
          </Section>
        )}

        <Section title="Cover Status & Sources" icon={Image}>
          <DataRow label="Has Cover" value={book.has_cover ? "Yes" : "No"} icon={Image} source="pc" />
          <DataRow label="Cover Status" value={
            book.cover_approved === true ? "Approved (locked)" :
            book.cover_approved === false ? (book.needs_replacement ? "Needs Replacement" : "Rejected") :
            "Pending Review"
          } icon={CheckCircle2} source="pc" />
          <DataRow label="Cover Source" value={book.cover_source} icon={Globe} source="pc" />
          <DataRow label="Quality Score" value={book.cover_quality_score} icon={Star} source="pc" />
          <DataRow label="Tried Sources" value={book.cover_tried_sources?.join(", ") || "None"} icon={Layers} source="pc" />
          {book.rejection_reason && <DataRow label="Reject Reason" value={book.rejection_reason} icon={XCircle} source="pc" />}
          {book.replacement_note && <DataRow label="Replace Note" value={book.replacement_note} icon={AlertTriangle} source="pc" />}
        </Section>

        <Section title="Links" icon={ExternalLink}>
          <div className="space-y-2">
            {book.amazon_url && (
              <div className="flex items-center gap-2">
                <a href={book.amazon_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-bold text-primary hover:underline" data-testid="link-book-amazon">Amazon <ExternalLink className="w-3 h-3" /></a>
                <SourceBadge source="amazon" />
              </div>
            )}
            {book.gb_buy_link && (
              <div className="flex items-center gap-2">
                <a href={book.gb_buy_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-bold text-primary hover:underline" data-testid="link-book-buy">Buy on Google Play <ExternalLink className="w-3 h-3" /></a>
                <SourceBadge source="gb" />
              </div>
            )}
            {book.google_books_id && (
              <div className="flex items-center gap-2">
                <a href={`https://books.google.com/books?id=${book.google_books_id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-bold text-primary hover:underline" data-testid="link-book-google">Google Books <ExternalLink className="w-3 h-3" /></a>
                <SourceBadge source="gb" />
              </div>
            )}
            {book.google_preview_link && (
              <div className="flex items-center gap-2">
                <a href={book.google_preview_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-bold text-primary hover:underline" data-testid="link-book-preview">Google Preview <ExternalLink className="w-3 h-3" /></a>
                <SourceBadge source="gb" />
              </div>
            )}
            {book.google_info_link && (
              <div className="flex items-center gap-2">
                <a href={book.google_info_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-bold text-primary hover:underline" data-testid="link-book-play">Google Play Info <ExternalLink className="w-3 h-3" /></a>
                <SourceBadge source="gb" />
              </div>
            )}
            {book.canonical_volume_link && book.canonical_volume_link !== book.google_info_link && (
              <div className="flex items-center gap-2">
                <a href={book.canonical_volume_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-bold text-primary hover:underline">Canonical Link <ExternalLink className="w-3 h-3" /></a>
                <SourceBadge source="gb" />
              </div>
            )}
            {book.gb_web_reader_link && (
              <div className="flex items-center gap-2">
                <a href={book.gb_web_reader_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-bold text-primary hover:underline">Web Reader <ExternalLink className="w-3 h-3" /></a>
                <SourceBadge source="gb" />
              </div>
            )}
            {book.isbn && (
              <div className="flex items-center gap-2">
                <a href={`https://openlibrary.org/isbn/${book.isbn}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-bold text-primary hover:underline" data-testid="link-book-openlibrary">Open Library (ISBN) <ExternalLink className="w-3 h-3" /></a>
                <SourceBadge source="ol" />
              </div>
            )}
            {book.ol_work_key && (
              <div className="flex items-center gap-2">
                <a href={`https://openlibrary.org${book.ol_work_key}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-bold text-primary hover:underline" data-testid="link-book-ol-work">Open Library (Work) <ExternalLink className="w-3 h-3" /></a>
                <SourceBadge source="ol" />
              </div>
            )}
            {book.ol_cover_id && (
              <div className="flex items-center gap-2">
                <a href={`https://covers.openlibrary.org/b/id/${book.ol_cover_id}-L.jpg`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-bold text-primary hover:underline" data-testid="link-book-ol-cover">OL Cover Image <ExternalLink className="w-3 h-3" /></a>
                <SourceBadge source="ol" />
              </div>
            )}
            {book.ol_id_goodreads && book.ol_id_goodreads.length > 0 && (
              <div className="flex items-center gap-2">
                <a href={`https://www.goodreads.com/book/show/${book.ol_id_goodreads[0]}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-bold text-primary hover:underline">Goodreads <ExternalLink className="w-3 h-3" /></a>
                <SourceBadge source="ol" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <a href={`/myfirstmillion/books/${book.slug}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-bold text-primary hover:underline" data-testid="link-book-podcap">PodCap Page <ExternalLink className="w-3 h-3" /></a>
              <SourceBadge source="pc" />
            </div>
          </div>
        </Section>

        <Section title="Timestamps" icon={Clock}>
          <DataRow label="Created" value={book.created_at ? new Date(book.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : null} icon={Calendar} source="pc" />
          <DataRow label="Updated" value={book.updated_at ? new Date(book.updated_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null} icon={Clock} source="pc" />
          <DataRow label="Last API Fetch" value={book.last_api_fetch ? new Date(book.last_api_fetch).toLocaleString() : "Never"} icon={RefreshCw} source="pc" />
        </Section>
      </div>
    </div>
  );
}

export default function BookstoreAdmin() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"title" | "updated" | "rating">("title");
  const [coverFilter, setCoverFilter] = useState<"all" | "has_cover" | "no_cover" | "no_isbn">("all");

  const { data, isLoading } = useQuery<{ books: BookEnrichment[] }>({
    queryKey: ["/api/admin/bookstore"],
    queryFn: async () => {
      const res = await fetch("/api/admin/bookstore", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const allBooks = data?.books || [];

  const handleBookUpdate = (updated: BookEnrichment) => {
    queryClient.setQueryData(["/api/admin/bookstore"], (old: any) => {
      if (!old) return old;
      return { ...old, books: old.books.map((b: BookEnrichment) => b.id === updated.id ? updated : b) };
    });
  };

  const filtered = useMemo(() => {
    let result = allBooks;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(b =>
        b.book_title.toLowerCase().includes(q) || (b.author && b.author.toLowerCase().includes(q)) ||
        b.slug.includes(q) || (b.isbn && b.isbn.includes(q)) || (b.publisher && b.publisher.toLowerCase().includes(q))
      );
    }
    if (coverFilter === "has_cover") result = result.filter(b => b.has_cover);
    else if (coverFilter === "no_cover") result = result.filter(b => !b.has_cover);
    else if (coverFilter === "no_isbn") result = result.filter(b => !b.isbn);
    if (sortBy === "title") result = [...result].sort((a, b) => a.book_title.localeCompare(b.book_title));
    else if (sortBy === "updated") result = [...result].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    else if (sortBy === "rating") result = [...result].sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    return result;
  }, [allBooks, searchTerm, coverFilter, sortBy]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const selectedBook = selectedBookId ? allBooks.find(b => b.id === selectedBookId) : null;

  if (selectedBook) {
    return <BookDetail book={selectedBook} onBack={() => setSelectedBookId(null)} onUpdate={handleBookUpdate} />;
  }

  const stats = {
    total: allBooks.length,
    withCover: allBooks.filter(b => b.has_cover).length,
    withIsbn: allBooks.filter(b => b.isbn).length,
    approved: allBooks.filter(b => b.cover_approved === true).length,
    enriched: allBooks.filter(b => b.last_api_fetch).length,
  };

  const filterButtons: { mode: typeof coverFilter; label: string }[] = [
    { mode: "all", label: `All (${stats.total})` },
    { mode: "has_cover", label: `Has Cover (${stats.withCover})` },
    { mode: "no_cover", label: `No Cover (${stats.total - stats.withCover})` },
    { mode: "no_isbn", label: `No ISBN (${stats.total - stats.withIsbn})` },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold flex items-center gap-2" data-testid="text-bookstore-title">
          <BookOpen className="w-5 h-5 text-primary" /> Bookstore ({stats.total} books)
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {stats.withCover} with covers · {stats.withIsbn} with ISBNs · {stats.approved} approved · {stats.enriched} API-enriched
        </p>
      </div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Search by title, author, slug, ISBN, or publisher..."
            value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            data-testid="input-bookstore-search" />
        </div>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-bold" data-testid="select-bookstore-sort">
          <option value="title">Sort: A-Z</option>
          <option value="updated">Sort: Recently Updated</option>
          <option value="rating">Sort: Highest Rated</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {filterButtons.map(({ mode, label }) => (
          <button key={mode} onClick={() => { setCoverFilter(mode); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${coverFilter === mode ? "bg-primary/10 text-primary ring-2 ring-offset-1 ring-primary/30" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}
            data-testid={`filter-bookstore-${mode}`}>{label}</button>
        ))}
      </div>
      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Loading books...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10">
          <BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No books found matching your search.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2">
            {paginated.map((book) => {
              const coverUrl = book.has_cover ? `/books/${book.slug}.jpg` : null;
              return (
                <button key={book.id} onClick={() => setSelectedBookId(book.id)}
                  className="flex items-center gap-4 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/[0.02] transition-all text-left group"
                  data-testid={`card-book-${book.id}`}>
                  {coverUrl ? (
                    <img src={coverUrl} alt={book.book_title} className="w-[40px] h-[60px] object-cover rounded-md shadow-sm shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).src = ""; (e.target as HTMLImageElement).className = "w-[40px] h-[60px] bg-muted/30 rounded-md shrink-0"; }} />
                  ) : (
                    <div className="w-[40px] h-[60px] bg-muted/20 rounded-md flex items-center justify-center shrink-0">
                      <BookOpen className="w-4 h-4 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold truncate group-hover:text-primary transition-colors">{book.book_title}</span>
                      <CoverStatusBadge book={book} />
                      {book.last_api_fetch && <span className="text-[9px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">API</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {book.author && <span className="text-xs text-muted-foreground truncate">{book.author}</span>}
                      {book.publisher && <span className="text-[10px] text-muted-foreground/60 truncate">{book.publisher}</span>}
                      {book.isbn && <span className="text-[10px] font-mono text-muted-foreground/70">ISBN: {book.isbn}</span>}
                      {book.publish_year && <span className="text-[10px] text-muted-foreground/70">{book.publish_year}</span>}
                      {book.rating && <span className="text-[10px] text-amber-600 flex items-center gap-0.5"><Star className="w-2.5 h-2.5 fill-amber-500" />{Number(book.rating).toFixed(1)}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-muted-foreground/40 group-hover:text-primary transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </button>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-muted/50 hover:bg-muted disabled:opacity-30 transition-colors flex items-center gap-1" data-testid="button-bookstore-prev">
                <ChevronLeft className="w-3 h-3" /> Previous
              </button>
              <span className="text-xs text-muted-foreground font-bold">Page {page} of {totalPages} · {filtered.length} books</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-muted/50 hover:bg-muted disabled:opacity-30 transition-colors flex items-center gap-1" data-testid="button-bookstore-next">
                Next <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
