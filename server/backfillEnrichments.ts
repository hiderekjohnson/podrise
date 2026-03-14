import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const GOOGLE_BOOKS_API = "https://www.googleapis.com/books/v1/volumes";
const OL_SEARCH_API = "https://openlibrary.org/search.json";
const DELAY_MS = 200;
const BATCH_SIZE = 25;
const BATCH_PAUSE_MS = 2000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function enrichBook(book: any): Promise<{ fieldsUpdated: number; gbSuccess: boolean; olSuccess: boolean }> {
  const updates: Record<string, any> = {};
  let gbSuccess = false;
  let olSuccess = false;

  let googleBooksId = book.google_books_id;
  if (!googleBooksId) {
    try {
      const q = encodeURIComponent(book.book_title + (book.author ? `+inauthor:${book.author}` : ""));
      const gbRes = await fetch(`${GOOGLE_BOOKS_API}?q=${q}&maxResults=1`);
      if (gbRes.ok) {
        const gbData = await gbRes.json();
        if (gbData.items?.[0]?.id) {
          googleBooksId = gbData.items[0].id;
          updates.google_books_id = googleBooksId;
        }
      }
    } catch {}
  }

  if (googleBooksId) {
    try {
      const gbRes = await fetch(`${GOOGLE_BOOKS_API}/${googleBooksId}`);
      if (gbRes.ok) {
        const gb = await gbRes.json();
        const vi = gb.volumeInfo || {};
        const si = gb.saleInfo || {};
        const ai = gb.accessInfo || {};
        if (vi.subtitle) updates.subtitle = vi.subtitle;
        if (vi.publisher) updates.publisher = vi.publisher;
        if (vi.publishedDate) updates.published_date = vi.publishedDate;
        if (vi.pageCount && !book.page_count) updates.page_count = vi.pageCount;
        if (vi.description) updates.google_description = vi.description;
        if (vi.language) updates.language = vi.language;
        if (vi.categories) updates.categories = vi.categories;
        if (vi.maturityRating) updates.maturity_rating = vi.maturityRating;
        if (vi.printType) updates.print_type = vi.printType;
        if (vi.previewLink) updates.google_preview_link = vi.previewLink;
        if (vi.infoLink) updates.google_info_link = vi.infoLink;
        if (vi.industryIdentifiers) {
          for (const ii of vi.industryIdentifiers) {
            if (ii.type === "ISBN_10") updates.isbn_10 = ii.identifier;
            if (ii.type === "ISBN_13") {
              updates.isbn_13 = ii.identifier;
              if (!book.isbn) updates.isbn = ii.identifier;
            }
          }
        }
        if (vi.publishedDate && !book.publish_year) {
          const year = parseInt(vi.publishedDate);
          if (year > 1000) updates.publish_year = year;
        }
        if (vi.authors?.length && !book.author) {
          updates.author = vi.authors.join(", ");
        }
        if (vi.printedPageCount) updates.printed_page_count = vi.printedPageCount;
        if (vi.dimensions) updates.dimensions = typeof vi.dimensions === 'object' ? Object.entries(vi.dimensions).map(([k,v]) => `${k}: ${v}`).join(', ') : String(vi.dimensions);
        if (vi.canonicalVolumeLink) updates.canonical_volume_link = vi.canonicalVolumeLink;
        if (vi.contentVersion) updates.content_version = vi.contentVersion;
        if (vi.imageLinks) updates.gb_image_links = vi.imageLinks;
        if (vi.readingModes) updates.gb_reading_modes = vi.readingModes;
        if (si.saleability) updates.gb_saleability = si.saleability;
        if (si.isEbook !== undefined) updates.gb_is_ebook = si.isEbook;
        if (si.listPrice?.amount !== undefined && si.listPrice?.amount !== null) { updates.gb_list_price = si.listPrice.amount; updates.gb_price_currency = si.listPrice.currencyCode; }
        if (si.retailPrice?.amount !== undefined && si.retailPrice?.amount !== null) updates.gb_retail_price = si.retailPrice.amount;
        if (si.buyLink) updates.gb_buy_link = si.buyLink;
        if (ai.viewability) updates.gb_viewability = ai.viewability;
        if (ai.embeddable !== undefined) updates.gb_embeddable = ai.embeddable;
        if (ai.publicDomain !== undefined) updates.gb_public_domain = ai.publicDomain;
        if (ai.textToSpeechPermission) updates.gb_text_to_speech = ai.textToSpeechPermission;
        if (ai.epub?.isAvailable !== undefined) updates.gb_epub_available = ai.epub.isAvailable;
        if (ai.pdf?.isAvailable !== undefined) updates.gb_pdf_available = ai.pdf.isAvailable;
        if (ai.webReaderLink) updates.gb_web_reader_link = ai.webReaderLink;
        gbSuccess = true;
      }
    } catch (e) {
      console.warn(`  [GB] Failed for "${book.book_title}":`, (e as any)?.message || e);
    }
  }

  await sleep(DELAY_MS);

  try {
    const q = encodeURIComponent(book.book_title + (book.author ? ` ${book.author}` : ""));
    const olRes = await fetch(`${OL_SEARCH_API}?q=${q}&limit=5&fields=key,title,author_name,isbn,publisher,publish_date,number_of_pages_median,first_publish_year,subject,language,edition_count,ebook_count_i,cover_i,ratings_average,ratings_count,want_to_read_count,currently_reading_count,already_read_count,first_sentence,subtitle,id_amazon,id_goodreads,has_fulltext`);
    if (olRes.ok) {
      const olData = await olRes.json();
      const titleLower = book.book_title.toLowerCase().replace(/[^a-z0-9]/g, '');
      const doc = (olData.docs || []).find((d: any) => {
        const docTitle = (d.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return docTitle === titleLower;
      }) || (olData.docs || []).find((d: any) => {
        const docTitle = (d.title || '').toLowerCase();
        return docTitle.includes(book.book_title.toLowerCase()) || book.book_title.toLowerCase().includes(docTitle);
      }) || olData.docs?.[0];

      if (doc) {
        if (doc.key) updates.ol_work_key = doc.key;
        if (doc.subject?.length) updates.ol_subjects = doc.subject;
        if (doc.language?.length) updates.ol_languages = doc.language;
        if (doc.edition_count) updates.ol_edition_count = doc.edition_count;
        if (doc.ebook_count_i !== undefined) updates.ol_ebook_count = doc.ebook_count_i;
        if (doc.cover_i) updates.ol_cover_id = doc.cover_i;
        if (doc.ratings_average) updates.ol_ratings_average = doc.ratings_average;
        if (doc.ratings_count) updates.ol_ratings_count = doc.ratings_count;
        if (doc.want_to_read_count !== undefined) updates.ol_want_to_read = doc.want_to_read_count;
        if (doc.currently_reading_count !== undefined) updates.ol_currently_reading = doc.currently_reading_count;
        if (doc.already_read_count !== undefined) updates.ol_already_read = doc.already_read_count;
        if (doc.first_publish_year && !book.publish_year && !updates.publish_year) updates.publish_year = doc.first_publish_year;
        if (doc.first_publish_year) updates.ol_first_publish_year = doc.first_publish_year;
        if (doc.publisher?.length) updates.ol_publishers = doc.publisher;
        if (doc.number_of_pages_median) {
          updates.ol_number_of_pages = doc.number_of_pages_median;
          if (!book.page_count && !updates.page_count) updates.page_count = doc.number_of_pages_median;
        }
        if (doc.first_sentence?.length) updates.ol_first_sentence = typeof doc.first_sentence === 'string' ? doc.first_sentence : doc.first_sentence[0];
        if (doc.subtitle) updates.ol_subtitle = doc.subtitle;
        if (doc.subtitle && !updates.subtitle) updates.subtitle = doc.subtitle;
        if (doc.author_name?.length) updates.ol_author_names = doc.author_name;
        if (doc.id_amazon?.length) updates.ol_id_amazon = doc.id_amazon;
        if (doc.id_goodreads?.length) updates.ol_id_goodreads = doc.id_goodreads;
        if (doc.has_fulltext !== undefined) updates.ol_has_fulltext = doc.has_fulltext;
        if (doc.isbn?.length) updates.ol_all_isbns = doc.isbn;
        if (doc.publish_date?.length) updates.ol_publish_dates = doc.publish_date;

        if (!book.isbn && !updates.isbn && doc.isbn?.length) {
          const isbn13 = doc.isbn.find((i: string) => i.length === 13);
          const isbn10 = doc.isbn.find((i: string) => i.length === 10);
          if (isbn13) { updates.isbn = isbn13; updates.isbn_13 = isbn13; }
          if (isbn10 && !updates.isbn_10) updates.isbn_10 = isbn10;
          if (!updates.isbn && isbn10) updates.isbn = isbn10;
        }

        if (doc.ratings_average && (!book.rating || book.rating === null)) {
          updates.rating = doc.ratings_average;
        }
        if (doc.ratings_count && (!book.rating_count || book.rating_count === null)) {
          updates.rating_count = doc.ratings_count;
        }
        olSuccess = true;
      }
    }
  } catch (e) {
    console.warn(`  [OL] Failed for "${book.book_title}":`, (e as any)?.message || e);
  }

  updates.last_api_fetch = new Date();

  const setClauses: string[] = [];
  const vals: any[] = [];
  let paramIdx = 1;
  for (const [key, val] of Object.entries(updates)) {
    setClauses.push(`${key} = $${paramIdx}`);
    vals.push(val);
    paramIdx++;
  }
  vals.push(book.id);

  if (setClauses.length > 0) {
    await pool.query(
      `UPDATE book_enrichments SET ${setClauses.join(", ")}, updated_at = NOW() WHERE id = $${paramIdx}`,
      vals
    );
  }

  const fieldsUpdated = Object.keys(updates).filter(k => k !== 'last_api_fetch').length;
  return { fieldsUpdated, gbSuccess, olSuccess };
}

async function main() {
  console.log("=== Bulk Book Enrichment Script ===\n");

  const { rows: books } = await pool.query(
    `SELECT * FROM book_enrichments WHERE last_api_fetch IS NULL ORDER BY id`
  );

  console.log(`Found ${books.length} books to enrich\n`);

  let totalGb = 0;
  let totalOl = 0;
  let totalFields = 0;
  let errors = 0;

  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    try {
      const result = await enrichBook(book);
      totalFields += result.fieldsUpdated;
      if (result.gbSuccess) totalGb++;
      if (result.olSuccess) totalOl++;

      if ((i + 1) % 10 === 0 || i === books.length - 1) {
        console.log(`[${i + 1}/${books.length}] "${book.book_title}" — ${result.fieldsUpdated} fields (GB:${result.gbSuccess ? '✓' : '✗'} OL:${result.olSuccess ? '✓' : '✗'}) | Running: ${totalGb} GB, ${totalOl} OL, ${totalFields} fields`);
      }
    } catch (e) {
      errors++;
      console.error(`[${i + 1}/${books.length}] ERROR "${book.book_title}":`, (e as any)?.message || e);
    }

    await sleep(DELAY_MS);

    if ((i + 1) % BATCH_SIZE === 0 && i < books.length - 1) {
      console.log(`  --- Batch pause (${BATCH_PAUSE_MS / 1000}s) ---`);
      await sleep(BATCH_PAUSE_MS);
    }
  }

  const { rows: finalStats } = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(last_api_fetch) as enriched,
      COUNT(CASE WHEN isbn IS NOT NULL OR isbn_10 IS NOT NULL OR isbn_13 IS NOT NULL THEN 1 END) as has_isbn,
      COUNT(CASE WHEN google_books_id IS NOT NULL THEN 1 END) as has_gbooks,
      COUNT(CASE WHEN ol_work_key IS NOT NULL THEN 1 END) as has_ol,
      COUNT(CASE WHEN rating IS NOT NULL THEN 1 END) as has_rating,
      COUNT(CASE WHEN page_count IS NOT NULL THEN 1 END) as has_pages,
      COUNT(CASE WHEN publisher IS NOT NULL THEN 1 END) as has_publisher
    FROM book_enrichments
  `);

  const s = finalStats[0];
  console.log("\n=== Final Results ===");
  console.log(`Total books: ${s.total}`);
  console.log(`API-enriched: ${s.enriched} (${Math.round((s.enriched / s.total) * 100)}%)`);
  console.log(`Google Books data: ${totalGb} succeeded this run`);
  console.log(`Open Library data: ${totalOl} succeeded this run`);
  console.log(`Total fields updated: ${totalFields}`);
  console.log(`Errors: ${errors}`);
  console.log(`\nCoverage:`);
  console.log(`  ISBN: ${s.has_isbn} (${Math.round((s.has_isbn / s.total) * 100)}%)`);
  console.log(`  Google Books ID: ${s.has_gbooks} (${Math.round((s.has_gbooks / s.total) * 100)}%)`);
  console.log(`  Open Library: ${s.has_ol} (${Math.round((s.has_ol / s.total) * 100)}%)`);
  console.log(`  Ratings: ${s.has_rating} (${Math.round((s.has_rating / s.total) * 100)}%)`);
  console.log(`  Page count: ${s.has_pages} (${Math.round((s.has_pages / s.total) * 100)}%)`);
  console.log(`  Publisher: ${s.has_publisher} (${Math.round((s.has_publisher / s.total) * 100)}%)`);

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
