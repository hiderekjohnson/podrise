import { pool } from "./db";

async function lookupGoogleBooksId(title: string, author: string | null): Promise<string | null> {
  try {
    let query = title;
    if (author && author !== "null") query += " " + author;
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1&fields=items(id)`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.items?.[0]?.id || null;
  } catch {
    return null;
  }
}

async function main() {
  const { rows } = await pool.query(`
    SELECT resources, slug FROM landing_page_recaps 
    WHERE resources IS NOT NULL AND resources::text LIKE '[%' AND resources::text != '[]'
  `);

  const bookMap = new Map<string, { name: string; author: string | null; url: string | null; description: string | null }>();
  
  for (const row of rows) {
    let resources: any[];
    try {
      resources = typeof row.resources === "string" ? JSON.parse(row.resources) : row.resources;
    } catch { continue; }
    
    for (const r of resources) {
      if (r.type !== "book" || !r.name) continue;
      const key = r.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      if (!bookMap.has(key)) {
        bookMap.set(key, {
          name: r.name,
          author: r.author || null,
          url: r.url || null,
          description: r.description || null,
        });
      }
    }
  }

  console.log(`Found ${bookMap.size} unique books in recaps`);

  const { rows: existing } = await pool.query("SELECT book_key FROM book_enrichments");
  const existingKeys = new Set(existing.map((e: any) => e.book_key));

  const missing = Array.from(bookMap.entries()).filter(([key]) => !existingKeys.has(key));
  console.log(`${missing.length} books not yet in book_enrichments`);

  let created = 0;
  let withGbid = 0;
  for (let i = 0; i < missing.length; i++) {
    const [key, book] = missing[i];
    const slug = book.name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").trim();
    
    const { rows: blocked } = await pool.query("SELECT 1 FROM book_blocklist WHERE book_key = $1", [key]);
    if (blocked.length > 0) {
      console.log(`[${i + 1}/${missing.length}] BLOCKED ${book.name}`);
      continue;
    }

    const gbId = await lookupGoogleBooksId(book.name, book.author);
    if (gbId) withGbid++;

    try {
      await pool.query(
        `INSERT INTO book_enrichments (book_key, book_title, author, slug, amazon_url, description, google_books_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (slug) DO UPDATE SET google_books_id = COALESCE(book_enrichments.google_books_id, $7)`,
        [key, book.name, book.author, slug, book.url, book.description, gbId]
      );
      created++;
      console.log(`[${i + 1}/${missing.length}] ${gbId ? "✓" : "✗"} ${book.name}${gbId ? ` → ${gbId}` : ""}`);
    } catch (err: any) {
      console.log(`[${i + 1}/${missing.length}] ERR ${book.name}: ${err.message}`);
    }

    if ((i + 1) % 20 === 0) {
      await new Promise(r => setTimeout(r, 2000));
    } else {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`\nDone! Created ${created} rows, ${withGbid} with Google Books IDs`);

  const { rows: check } = await pool.query(
    "SELECT COUNT(*) as total, COUNT(google_books_id) as has_gbid FROM book_enrichments"
  );
  console.log(`Final: ${check[0].has_gbid}/${check[0].total} books have Google Books IDs`);

  await pool.end();
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
