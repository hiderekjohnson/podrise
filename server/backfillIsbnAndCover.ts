import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const { rows } = await pool.query(
    "SELECT id, book_title, author, google_books_id FROM book_enrichments WHERE google_books_id IS NOT NULL AND (isbn IS NULL OR has_cover IS NULL) LIMIT 200"
  );
  console.log(`Found ${rows.length} books with google_books_id but missing isbn/has_cover`);

  let updated = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const url = `https://www.googleapis.com/books/v1/volumes/${row.google_books_id}?fields=volumeInfo/imageLinks,volumeInfo/industryIdentifiers`;
      const res = await fetch(url);
      if (!res.ok) {
        failed++;
        console.log(`[${i + 1}/${rows.length}] ✗ HTTP ${res.status} for ${row.book_title}`);
        continue;
      }
      const data = await res.json();
      const isbn = data.volumeInfo?.industryIdentifiers?.find(
        (id: any) => id.type === "ISBN_13" || id.type === "ISBN_10"
      )?.identifier || null;
      const hasCover = !!data.volumeInfo?.imageLinks;

      await pool.query(
        "UPDATE book_enrichments SET isbn = COALESCE(isbn, $1), has_cover = $2 WHERE id = $3",
        [isbn, hasCover, row.id]
      );
      updated++;
      const status = hasCover ? "✓ cover" : "✗ no cover";
      console.log(`[${i + 1}/${rows.length}] ${status} ${isbn || "no-isbn"} ${row.book_title}`);
    } catch (err: any) {
      failed++;
      console.log(`[${i + 1}/${rows.length}] ✗ Error: ${err.message} for ${row.book_title}`);
    }

    if ((i + 1) % 10 === 0) {
      console.log(`  Progress: ${updated} updated, ${failed} failed. Pausing 3s...`);
      await new Promise(r => setTimeout(r, 3000));
    } else {
      await new Promise(r => setTimeout(r, 800));
    }
  }

  console.log(`\nDone! ${updated} updated, ${failed} failed out of ${rows.length} total`);
  
  const stats = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(google_books_id) as has_gbid,
      COUNT(isbn) as has_isbn,
      COUNT(CASE WHEN has_cover = true THEN 1 END) as with_cover,
      COUNT(CASE WHEN has_cover = false THEN 1 END) as without_cover
    FROM book_enrichments
  `);
  console.log("Final stats:", stats.rows[0]);
  
  await pool.end();
}

main().catch(console.error);
