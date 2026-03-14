import pg from "pg";
import fs from "fs";
import path from "path";

const COVERS_DIR = path.resolve("public/books");
const DELAY_MS = 300;

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function isPlaceholder(buf: Buffer, contentType: string): boolean {
  if (contentType.includes("png") && buf.length < 2000) return true;
  if (buf.length < 1000) return true;
  return false;
}

async function downloadFromGoogleBooks(googleBooksId: string): Promise<Buffer | null> {
  const url = `https://books.google.com/books/content?id=${googleBooksId}&printsec=frontcover&img=1&zoom=1&source=gbs_api`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (isPlaceholder(buf, contentType)) return null;
    return buf;
  } catch { return null; }
}

async function downloadFromOpenLibrary(isbn: string): Promise<Buffer | null> {
  const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return null;
    return buf;
  } catch { return null; }
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const { rows } = await pool.query(
    `SELECT slug, google_books_id, isbn, has_cover, book_title 
     FROM book_enrichments 
     WHERE slug IS NOT NULL
     ORDER BY book_title`
  );

  console.log(`Total enriched books: ${rows.length}`);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  let alreadyHad = 0;

  for (const row of rows) {
    const filePath = path.join(COVERS_DIR, `${row.slug}.jpg`);

    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (stat.size > 1000) {
        alreadyHad++;
        continue;
      }
      fs.unlinkSync(filePath);
    }

    let buf: Buffer | null = null;

    if (row.google_books_id) {
      buf = await downloadFromGoogleBooks(row.google_books_id);
      await sleep(DELAY_MS);
    }

    if (!buf && row.isbn) {
      buf = await downloadFromOpenLibrary(row.isbn);
      await sleep(DELAY_MS);
    }

    if (buf) {
      fs.writeFileSync(filePath, buf);
      downloaded++;
      console.log(`✓ ${row.book_title} => ${row.slug}.jpg (${buf.length} bytes)`);

      if (row.has_cover !== true) {
        await pool.query("UPDATE book_enrichments SET has_cover = true WHERE slug = $1", [row.slug]);
      }
    } else {
      failed++;
      if (row.has_cover !== false) {
        await pool.query("UPDATE book_enrichments SET has_cover = false WHERE slug = $1", [row.slug]);
      }
    }
  }

  console.log(`\nDone! Downloaded: ${downloaded}, Already had: ${alreadyHad}, No cover available: ${failed}`);
  await pool.end();
}

main().catch(console.error);
