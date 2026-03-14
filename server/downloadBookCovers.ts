import pg from "pg";
import fs from "fs";
import path from "path";

const COVERS_DIR = path.resolve("public/books");
const DELAY_MS = 300;
const MIN_WIDTH = 300;

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function isPlaceholder(buf: Buffer): boolean {
  if (buf.length < 1000) return true;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  if (isPng && (buf.length === 15567 || buf.length === 1269)) return true;
  return false;
}

function jpegWidth(buf: Buffer): number {
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xff) return 0;
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      return buf.readUInt16BE(i + 7);
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return 0;
}

function pngWidth(buf: Buffer): number {
  if (buf.length < 24) return 0;
  return buf.readUInt32BE(16);
}

function getWidth(buf: Buffer): number {
  if (buf[0] === 0xff && buf[1] === 0xd8) return jpegWidth(buf);
  if (buf[0] === 0x89 && buf[1] === 0x50) return pngWidth(buf);
  return 0;
}

async function downloadFromGoogleBooks(googleBooksId: string): Promise<Buffer | null> {
  for (const zoom of [3, 2, 1]) {
    const url = `https://books.google.com/books/content?id=${googleBooksId}&printsec=frontcover&img=1&zoom=${zoom}&source=gbs_api`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (isPlaceholder(buf)) continue;
      const w = getWidth(buf);
      if (w >= MIN_WIDTH) return buf;
      if (zoom === 1 && w > 0) return buf;
    } catch {}
  }
  return null;
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
  const mode = process.argv[2] || "missing";
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  let query: string;
  if (mode === "upgrade") {
    query = `SELECT slug, google_books_id, isbn, has_cover, cover_approved, book_title 
     FROM book_enrichments 
     WHERE slug IS NOT NULL AND (cover_approved IS NULL OR cover_approved = false)
     ORDER BY book_title`;
  } else {
    query = `SELECT slug, google_books_id, isbn, has_cover, cover_approved, book_title 
     FROM book_enrichments 
     WHERE slug IS NOT NULL AND (cover_approved IS NULL OR cover_approved = false)
     ORDER BY book_title`;
  }

  const { rows } = await pool.query(query);
  console.log(`Total books to process: ${rows.length} (mode: ${mode})`);

  let downloaded = 0;
  let upgraded = 0;
  let skipped = 0;
  let failed = 0;
  let alreadyGood = 0;

  for (const row of rows) {
    const filePath = path.join(COVERS_DIR, `${row.slug}.jpg`);
    const existingFile = fs.existsSync(filePath);

    if (mode === "upgrade" && existingFile) {
      const buf = fs.readFileSync(filePath);
      const w = getWidth(buf);
      if (w >= MIN_WIDTH) {
        alreadyGood++;
        continue;
      }
      console.log(`  Upgrading ${row.slug} (current width: ${w}px)`);
    } else if (mode === "missing" && existingFile) {
      const stat = fs.statSync(filePath);
      if (stat.size > 1000) {
        alreadyGood++;
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
      const w = getWidth(buf);
      if (existingFile && mode === "upgrade") {
        const oldBuf = fs.readFileSync(filePath);
        const oldW = getWidth(oldBuf);
        if (w > oldW) {
          fs.writeFileSync(filePath, buf);
          upgraded++;
          console.log(`✓ Upgraded ${row.book_title}: ${oldW}px → ${w}px (${buf.length} bytes)`);
        } else {
          skipped++;
        }
      } else {
        fs.writeFileSync(filePath, buf);
        downloaded++;
        console.log(`✓ ${row.book_title} => ${w}px wide (${buf.length} bytes)`);
      }

      if (row.has_cover !== true) {
        await pool.query("UPDATE book_enrichments SET has_cover = true WHERE slug = $1", [row.slug]);
      }
    } else {
      failed++;
      if (mode === "missing" && row.has_cover !== false) {
        await pool.query("UPDATE book_enrichments SET has_cover = false WHERE slug = $1", [row.slug]);
      }
    }
  }

  console.log(`\nDone! Downloaded: ${downloaded}, Upgraded: ${upgraded}, Already good: ${alreadyGood}, Skipped: ${skipped}, No cover: ${failed}`);
  await pool.end();
}

main().catch(console.error);
