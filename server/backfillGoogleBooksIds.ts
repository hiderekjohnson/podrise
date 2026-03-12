import { pool } from "./db";
import https from "https";

function lookupGoogleBooksId(title: string, author: string | null): Promise<string | null> {
  return new Promise((resolve) => {
    const query = `intitle:${title}${author ? ` inauthor:${author}` : ""}`;
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1`;
    https.get(url, { timeout: 8000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          const id = data.items?.[0]?.id;
          resolve(id || null);
        } catch { resolve(null); }
      });
    }).on("error", () => resolve(null)).on("timeout", function(this: any) { this.destroy(); resolve(null); });
  });
}

async function run() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      "SELECT id, book_key, book_title, author FROM book_enrichments WHERE google_books_id IS NULL ORDER BY id"
    );
    console.log(`Found ${rows.length} books without Google Books ID\n`);

    let found = 0;
    let notFound = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const gbId = await lookupGoogleBooksId(row.book_title, row.author);

      if (gbId) {
        await client.query("UPDATE book_enrichments SET google_books_id = $1 WHERE id = $2", [gbId, row.id]);
        console.log(`[${i + 1}/${rows.length}] ✓ ${row.book_title} -> ${gbId}`);
        found++;
      } else {
        console.log(`[${i + 1}/${rows.length}] ✗ ${row.book_title}`);
        notFound++;
      }

      if ((i + 1) % 10 === 0) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    console.log(`\n✅ Done: ${found} found, ${notFound} not found`);
  } finally {
    client.release();
  }
}

run().catch(console.error).finally(() => process.exit(0));
