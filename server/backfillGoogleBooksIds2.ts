import { pool } from "./db";
import https from "https";

function searchGoogleBooks(query: string): Promise<{ id: string; title: string } | null> {
  return new Promise((resolve) => {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=3`;
    https.get(url, { timeout: 10000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          if (data.items && data.items.length > 0) {
            const item = data.items[0];
            resolve({ id: item.id, title: item.volumeInfo?.title || "" });
          } else {
            resolve(null);
          }
        } catch { resolve(null); }
      });
    }).on("error", () => resolve(null)).on("timeout", function(this: any) { this.destroy(); resolve(null); });
  });
}

function cleanTitle(title: string): string {
  return title
    .replace(/:\s+.+$/, "")
    .replace(/\s*[-–—]\s*.+$/, "")
    .replace(/\s*\(.+\)$/, "")
    .replace(/['']/g, "'")
    .trim();
}

async function tryMultipleSearches(title: string, author: string | null): Promise<string | null> {
  const searches = [
    `"${title}"${author ? ` ${author}` : ""}`,
    `intitle:"${title}"${author ? ` inauthor:${author}` : ""}`,
    `"${cleanTitle(title)}"${author ? ` ${author}` : ""}`,
    `intitle:${cleanTitle(title)}${author ? ` inauthor:${author.split(" ").pop()}` : ""}`,
    title,
  ];

  for (const query of searches) {
    const result = await searchGoogleBooks(query);
    if (result) {
      return result.id;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
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
      const gbId = await tryMultipleSearches(row.book_title, row.author);

      if (gbId) {
        await client.query("UPDATE book_enrichments SET google_books_id = $1 WHERE id = $2", [gbId, row.id]);
        console.log(`[${i + 1}/${rows.length}] ✓ ${row.book_title} -> ${gbId}`);
        found++;
      } else {
        console.log(`[${i + 1}/${rows.length}] ✗ ${row.book_title}`);
        notFound++;
      }

      if ((i + 1) % 5 === 0) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    console.log(`\n✅ Done: ${found} found, ${notFound} not found`);
  } finally {
    client.release();
  }
}

run().catch(console.error).finally(() => process.exit(0));
