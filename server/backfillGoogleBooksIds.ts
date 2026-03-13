import { pool } from "./db";

async function lookupGoogleBooksId(title: string, author: string | null, retries = 3): Promise<string | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      let query = title;
      if (author && author !== "null") {
        query += " " + author;
      }
      const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1&fields=items(id)`;
      const res = await fetch(url);
      if (res.status === 429) {
        const wait = (attempt + 1) * 5000;
        console.log(`  Rate limited, waiting ${wait / 1000}s...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) return null;
      const data = await res.json();
      const id = data?.items?.[0]?.id;
      return id || null;
    } catch (err: any) {
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      return null;
    }
  }
  return null;
}

async function main() {
  const { rows } = await pool.query(
    "SELECT id, book_title, author FROM book_enrichments WHERE google_books_id IS NULL ORDER BY id"
  );
  console.log(`Found ${rows.length} books without Google Books IDs`);

  let updated = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const gbId = await lookupGoogleBooksId(row.book_title, row.author);
    if (gbId) {
      await pool.query("UPDATE book_enrichments SET google_books_id = $1 WHERE id = $2", [gbId, row.id]);
      updated++;
      console.log(`[${i + 1}/${rows.length}] ✓ ${row.book_title} → ${gbId}`);
    } else {
      failed++;
      console.log(`[${i + 1}/${rows.length}] ✗ ${row.book_title} (no result)`);
    }

    if ((i + 1) % 10 === 0) {
      console.log(`  Progress: ${updated} updated, ${failed} failed out of ${i + 1} processed. Pausing 5s...`);
      await new Promise(r => setTimeout(r, 5000));
    } else {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\nDone! ${updated} updated, ${failed} failed out of ${rows.length} total`);

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
