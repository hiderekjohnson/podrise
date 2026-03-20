import pg from "pg";
import fs from "fs";
import path from "path";

const COVERS_DIR = path.resolve("public/books");
const DELAY_MS = 400;
const MIN_WIDTH = 200;

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function isPlaceholder(buf: Buffer): boolean {
  if (buf.length < 1000) return true;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  if (isPng && (buf.length === 15567 || buf.length === 1269)) return true;
  return false;
}

function jpegDimensions(buf: Buffer): { w: number; h: number } {
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xff) return { w: 0, h: 0 };
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return { w: 0, h: 0 };
}

function pngDimensions(buf: Buffer): { w: number; h: number } {
  if (buf.length < 24) return { w: 0, h: 0 };
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function getDimensions(buf: Buffer): { w: number; h: number } {
  if (buf[0] === 0xff && buf[1] === 0xd8) return jpegDimensions(buf);
  if (buf[0] === 0x89 && buf[1] === 0x50) return pngDimensions(buf);
  return { w: 0, h: 0 };
}

function getWidth(buf: Buffer): number {
  return getDimensions(buf).w;
}

function looksLikeDocument(buf: Buffer): boolean {
  const { w, h } = getDimensions(buf);
  if (w === 0 || h === 0) return false;
  const ratio = w / h;
  if (ratio > 0.75) return true;
  if (ratio < 0.45) return true;
  if (h > w * 2) return true;
  return false;
}

async function downloadFromGoogleBooks(googleBooksId: string): Promise<Buffer | null> {
  for (const zoom of [3, 2]) {
    const url = `https://books.google.com/books/content?id=${googleBooksId}&printsec=frontcover&img=1&zoom=${zoom}&source=gbs_api`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (isPlaceholder(buf)) continue;
      if (looksLikeDocument(buf)) continue;
      const w = getWidth(buf);
      if (w >= MIN_WIDTH) return buf;
    } catch {}
  }
  return null;
}

async function findGoogleBooksId(title: string, author?: string): Promise<string | null> {
  try {
    const q = encodeURIComponent(title + (author ? `+inauthor:${author}` : ""));
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.items?.[0]?.id || null;
  } catch {
    return null;
  }
}

async function tryGoogleBooks(row: any): Promise<Buffer | null> {
  let googleBooksId = row.google_books_id;

  if (googleBooksId) {
    const buf = await downloadFromGoogleBooks(googleBooksId);
    if (buf) return buf;
  }

  if (row.isbn) {
    const isbnId = await findGoogleBooksId(`isbn:${row.isbn}`);
    if (isbnId && isbnId !== googleBooksId) {
      const buf = await downloadFromGoogleBooks(isbnId);
      if (buf) return buf;
    }
  }

  if (!googleBooksId) {
    const searchId = await findGoogleBooksId(row.book_title, row.author);
    if (searchId) {
      const buf = await downloadFromGoogleBooks(searchId);
      if (buf) return buf;
    }
  }

  return null;
}

async function main() {
  const mode = process.argv[2] || "rejected";
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  let query: string;
  let description: string;

  if (mode === "rejected") {
    query = `SELECT slug, google_books_id, isbn, asin, book_title, author, cover_tried_sources
       FROM book_enrichments 
       WHERE slug IS NOT NULL AND cover_approved = false
       ORDER BY book_title`;
    description = "rejected covers (trying Google Books)";
  } else if (mode === "nocover") {
    query = `SELECT slug, google_books_id, isbn, asin, book_title, author, cover_tried_sources
       FROM book_enrichments 
       WHERE slug IS NOT NULL AND (has_cover IS NULL OR has_cover = false) AND cover_approved IS NULL
       ORDER BY book_title`;
    description = "books with no cover yet";
  } else {
    query = `SELECT slug, google_books_id, isbn, asin, book_title, author, cover_tried_sources
       FROM book_enrichments 
       WHERE slug IS NOT NULL AND cover_approved IS NULL
       ORDER BY book_title`;
    description = "all pending books";
  }

  const { rows } = await pool.query(query);
  console.log(`\n${description}: ${rows.length} books to process\n`);

  let downloaded = 0;
  let noSource = 0;

  for (const row of rows) {
    const triedSources: string[] = row.cover_tried_sources || [];
    const filePath = path.join(COVERS_DIR, `${row.slug}.jpg`);

    if (triedSources.includes("google_books")) {
      noSource++;
      console.log(`  ⊘ ${row.book_title} — google_books already tried`);
      continue;
    }

    const buf = await tryGoogleBooks(row);
    await sleep(DELAY_MS);

    if (buf) {
      const w = getWidth(buf);
      fs.writeFileSync(filePath, buf);
      downloaded++;

      const newTried = [...new Set([...triedSources, "google_books"])];
      await pool.query(
        `UPDATE book_enrichments 
         SET has_cover = true, cover_approved = NULL, cover_source = $1, 
             cover_tried_sources = $2, cover_quality_score = NULL
         WHERE slug = $3`,
        ["google_books", newTried, row.slug]
      );
      console.log(`✓ ${row.book_title} — google_books (${w}px, ${buf.length} bytes)`);
    } else {
      const newTried = [...new Set([...triedSources, "google_books"])];
      await pool.query(
        `UPDATE book_enrichments SET cover_tried_sources = $1, cover_approved = false, has_cover = false, rejection_reason = 'no_images', updated_at = NOW() WHERE slug = $2`,
        [newTried, row.slug]
      );
      noSource++;
      console.log(`  ✗ ${row.book_title} — no quality cover found on Google Books`);
    }
  }

  console.log(`\nDone! Downloaded: ${downloaded}, No cover found: ${noSource}`);
  console.log(`Total: ${rows.length} processed`);
  await pool.end();
}

main().catch(console.error);
