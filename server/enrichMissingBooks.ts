import { pool } from "./db";
import https from "https";

function searchGoogleBooks(query: string): Promise<{ id: string; title: string; author: string; description: string; pageCount: number | null; publishYear: number | null } | null> {
  return new Promise((resolve) => {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=3`;
    https.get(url, { timeout: 10000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          if (data.items && data.items.length > 0) {
            const vol = data.items[0].volumeInfo || {};
            resolve({
              id: data.items[0].id,
              title: vol.title || "",
              author: (vol.authors || []).join(", "),
              description: (vol.description || "").slice(0, 500),
              pageCount: vol.pageCount || null,
              publishYear: vol.publishedDate ? parseInt(vol.publishedDate.slice(0, 4)) : null,
            });
          } else { resolve(null); }
        } catch { resolve(null); }
      });
    }).on("error", () => resolve(null)).on("timeout", function(this: any) { this.destroy(); resolve(null); });
  });
}

function cleanTitle(title: string): string {
  return title.replace(/:\s+.+$/, "").replace(/\s*[-–—]\s*.+$/, "").replace(/\s*\(.+\)$/, "").trim();
}

function makeSlug(name: string, author: string | null): string {
  const base = name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (author) {
    const authorSlug = author.split(",")[0].trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "-");
    return `${base}-${authorSlug}`.slice(0, 100);
  }
  return base.slice(0, 100);
}

async function trySearch(title: string, author: string | null) {
  const searches = [
    `"${title}"${author ? ` ${author}` : ""}`,
    `intitle:"${title}"${author ? ` inauthor:${author}` : ""}`,
    `"${cleanTitle(title)}"${author ? ` ${author}` : ""}`,
    title,
  ];
  for (const q of searches) {
    const result = await searchGoogleBooks(q);
    if (result) return result;
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

async function run() {
  const client = await pool.connect();
  try {
    const { rows: allRecaps } = await client.query(
      `SELECT slug, episode_slug, episode_title, resources FROM landing_page_recaps WHERE resources IS NOT NULL AND resources::text != '[]'`
    );

    const bookMap = new Map<string, { name: string; author: string | null; url: string | null; description: string | null }>();

    for (const row of allRecaps) {
      let resources: any[];
      try {
        resources = typeof row.resources === "string" ? JSON.parse(row.resources) : row.resources;
        if (!Array.isArray(resources)) continue;
      } catch { continue; }

      for (const r of resources) {
        if (!r || r.type !== "book" || !r.name || r.name === "_books_checked") continue;
        const key = r.name.toLowerCase().trim();
        if (!bookMap.has(key)) {
          bookMap.set(key, { name: r.name, author: r.author || null, url: r.url || null, description: r.description || null });
        }
      }
    }

    const { rows: existingEnrichments } = await client.query("SELECT book_key FROM book_enrichments");
    const existingKeys = new Set(existingEnrichments.map((e: any) => e.book_key));

    const missing = Array.from(bookMap.entries()).filter(([key]) => !existingKeys.has(key));
    console.log(`Found ${missing.length} books without enrichment entries\n`);

    let created = 0, failed = 0;

    for (let i = 0; i < missing.length; i++) {
      const [key, book] = missing[i];
      const gbResult = await trySearch(book.name, book.author);

      const author = gbResult?.author || book.author || null;
      const slug = makeSlug(book.name, author);
      const description = gbResult?.description || book.description || null;
      const gbId = gbResult?.id || null;
      const pageCount = gbResult?.pageCount || null;
      const publishYear = gbResult?.publishYear || null;

      try {
        await client.query(`
          INSERT INTO book_enrichments (book_key, book_title, author, description, slug, google_books_id, page_count, publish_year, topics)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '{"business"}')
          ON CONFLICT (book_key) DO NOTHING
        `, [key, book.name, author, description, slug, gbId, pageCount, publishYear]);

        if (gbId) {
          console.log(`[${i + 1}/${missing.length}] ✓ ${book.name} -> ${gbId}`);
        } else {
          console.log(`[${i + 1}/${missing.length}] ~ ${book.name} (enriched, no cover)`);
        }
        created++;
      } catch (err: any) {
        console.log(`[${i + 1}/${missing.length}] ✗ ${book.name}: ${err.message}`);
        failed++;
      }

      if ((i + 1) % 5 === 0) await new Promise(r => setTimeout(r, 1500));
    }

    console.log(`\n✅ Done: ${created} created, ${failed} failed`);
  } finally {
    client.release();
  }
}

run().catch(console.error).finally(() => process.exit(0));
