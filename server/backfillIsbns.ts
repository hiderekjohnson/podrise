import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const GOOGLE_BOOKS_API = "https://www.googleapis.com/books/v1/volumes";
const DELAY_MS = 150;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractIsbns(volumeInfo: any): { isbn10: string | null; isbn13: string | null } {
  const identifiers = volumeInfo?.industryIdentifiers || [];
  let isbn10: string | null = null;
  let isbn13: string | null = null;
  for (const id of identifiers) {
    if (id.type === "ISBN_10") isbn10 = id.identifier;
    if (id.type === "ISBN_13") isbn13 = id.identifier;
  }
  return { isbn10, isbn13 };
}

async function fetchGoogleBooksById(googleBooksId: string): Promise<{ isbn10: string | null; isbn13: string | null }> {
  try {
    const res = await fetch(`${GOOGLE_BOOKS_API}/${googleBooksId}`);
    if (!res.ok) return { isbn10: null, isbn13: null };
    const data = await res.json();
    return extractIsbns(data.volumeInfo);
  } catch {
    return { isbn10: null, isbn13: null };
  }
}

async function searchGoogleBooks(title: string, author: string): Promise<{ isbn10: string | null; isbn13: string | null; googleBooksId: string | null }> {
  try {
    const query = `intitle:${title}+inauthor:${author}`;
    const res = await fetch(`${GOOGLE_BOOKS_API}?q=${encodeURIComponent(query)}&maxResults=3`);
    if (!res.ok) return { isbn10: null, isbn13: null, googleBooksId: null };
    const data = await res.json();
    if (!data.items || data.items.length === 0) return { isbn10: null, isbn13: null, googleBooksId: null };

    for (const item of data.items) {
      const { isbn10, isbn13 } = extractIsbns(item.volumeInfo);
      if (isbn10 || isbn13) {
        return { isbn10, isbn13, googleBooksId: item.id };
      }
    }
    return { isbn10: null, isbn13: null, googleBooksId: data.items[0]?.id || null };
  } catch {
    return { isbn10: null, isbn13: null, googleBooksId: null };
  }
}

async function main() {
  console.log("=== ISBN Backfill Script ===\n");

  const { rows: booksWithGoogleId } = await pool.query(
    `SELECT id, book_title, author, google_books_id 
     FROM book_enrichments 
     WHERE google_books_id IS NOT NULL 
       AND isbn IS NULL AND isbn_10 IS NULL AND isbn_13 IS NULL
     ORDER BY id`
  );

  const { rows: booksNoGoogleId } = await pool.query(
    `SELECT id, book_title, author 
     FROM book_enrichments 
     WHERE google_books_id IS NULL 
       AND isbn IS NULL AND isbn_10 IS NULL AND isbn_13 IS NULL
     ORDER BY id`
  );

  console.log(`Pass 1: ${booksWithGoogleId.length} books with Google Books ID but no ISBN`);
  console.log(`Pass 2: ${booksNoGoogleId.length} books with no Google Books ID and no ISBN\n`);

  let pass1Found = 0;
  let pass1Failed = 0;

  console.log("--- Pass 1: Looking up ISBNs via Google Books ID ---");
  for (let i = 0; i < booksWithGoogleId.length; i++) {
    const book = booksWithGoogleId[i];
    const { isbn10, isbn13 } = await fetchGoogleBooksById(book.google_books_id);

    if (isbn10 || isbn13) {
      const isbnLegacy = isbn13 || isbn10;
      await pool.query(
        `UPDATE book_enrichments SET isbn_10 = $1, isbn_13 = $2, isbn = COALESCE($3, $4) WHERE id = $5`,
        [isbn10, isbn13, isbn13, isbn10, book.id]
      );
      pass1Found++;
      if ((i + 1) % 50 === 0 || i === booksWithGoogleId.length - 1) {
        console.log(`  [${i + 1}/${booksWithGoogleId.length}] Found ${pass1Found} ISBNs so far...`);
      }
    } else {
      pass1Failed++;
    }
    await sleep(DELAY_MS);
  }
  console.log(`Pass 1 complete: ${pass1Found} ISBNs found, ${pass1Failed} not available\n`);

  let pass2Found = 0;
  let pass2Failed = 0;
  let pass2GotGoogleId = 0;

  console.log("--- Pass 2: Searching by title+author for remaining books ---");
  for (let i = 0; i < booksNoGoogleId.length; i++) {
    const book = booksNoGoogleId[i];
    const { isbn10, isbn13, googleBooksId } = await searchGoogleBooks(book.book_title, book.author || "");

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (isbn10) {
      updates.push(`isbn_10 = $${paramIndex++}`);
      values.push(isbn10);
    }
    if (isbn13) {
      updates.push(`isbn_13 = $${paramIndex++}`);
      values.push(isbn13);
    }
    if (isbn10 || isbn13) {
      updates.push(`isbn = $${paramIndex++}`);
      values.push(isbn13 || isbn10);
      pass2Found++;
    }
    if (googleBooksId) {
      updates.push(`google_books_id = $${paramIndex++}`);
      values.push(googleBooksId);
      pass2GotGoogleId++;
    }

    if (updates.length > 0) {
      values.push(book.id);
      await pool.query(
        `UPDATE book_enrichments SET ${updates.join(", ")} WHERE id = $${paramIndex}`,
        values
      );
    } else {
      pass2Failed++;
    }

    if ((i + 1) % 20 === 0 || i === booksNoGoogleId.length - 1) {
      console.log(`  [${i + 1}/${booksNoGoogleId.length}] Found ${pass2Found} ISBNs, ${pass2GotGoogleId} Google IDs so far...`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`Pass 2 complete: ${pass2Found} ISBNs found, ${pass2GotGoogleId} Google IDs found, ${pass2Failed} not found\n`);

  const { rows: finalStats } = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN isbn IS NOT NULL OR isbn_10 IS NOT NULL OR isbn_13 IS NOT NULL THEN 1 END) as has_isbn,
      COUNT(CASE WHEN isbn IS NULL AND isbn_10 IS NULL AND isbn_13 IS NULL THEN 1 END) as still_missing
    FROM book_enrichments
  `);
  const s = finalStats[0];
  console.log("=== Final Results ===");
  console.log(`Total books: ${s.total}`);
  console.log(`Books with ISBN: ${s.has_isbn} (${Math.round((s.has_isbn / s.total) * 100)}%)`);
  console.log(`Still missing: ${s.still_missing}`);

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
