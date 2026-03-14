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
  for (const zoom of [3, 2, 1]) {
    const url = `https://books.google.com/books/content?id=${googleBooksId}&printsec=frontcover&img=1&zoom=${zoom}&source=gbs_api`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (isPlaceholder(buf)) continue;
      if (looksLikeDocument(buf)) continue;
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
    if (looksLikeDocument(buf)) return null;
    return buf;
  } catch { return null; }
}

async function downloadFromAmazon(isbn: string): Promise<Buffer | null> {
  const urls = [
    `https://images-na.ssl-images-amazon.com/images/P/${isbn}.01._SCLZZZZZZZ_.jpg`,
    `https://images.amazon.com/images/P/${isbn}.01.LZZZZZZZ.jpg`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (isPlaceholder(buf)) continue;
      if (buf.length < 2000) continue;
      if (looksLikeDocument(buf)) continue;
      const w = getWidth(buf);
      if (w > 0) return buf;
    } catch {}
  }
  return null;
}

async function downloadFromOpenLibraryByTitle(title: string, author?: string): Promise<Buffer | null> {
  const q = encodeURIComponent(title + (author ? ` ${author}` : ""));
  try {
    const searchRes = await fetch(`https://openlibrary.org/search.json?q=${q}&limit=3`);
    if (!searchRes.ok) return null;
    const data = await searchRes.json();
    const docs = data.docs || [];
    for (const doc of docs) {
      if (doc.cover_i) {
        const coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg?default=false`;
        const res = await fetch(coverUrl);
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 1000) continue;
        if (looksLikeDocument(buf)) continue;
        const w = getWidth(buf);
        if (w >= MIN_WIDTH || w > 0) return buf;
      }
    }
  } catch {}
  return null;
}

type Source = "google_books" | "openlibrary" | "amazon_isbn" | "openlibrary_search";

interface SourceResult {
  source: Source;
  buf: Buffer;
}

async function tryAllSources(
  row: any,
  triedSources: string[]
): Promise<SourceResult | null> {
  const sources: { name: Source; fn: () => Promise<Buffer | null> }[] = [];

  if (row.isbn && !triedSources.includes("amazon_isbn")) {
    sources.push({ name: "amazon_isbn", fn: () => downloadFromAmazon(row.isbn) });
  }
  if (!triedSources.includes("openlibrary_search")) {
    sources.push({ name: "openlibrary_search", fn: () => downloadFromOpenLibraryByTitle(row.book_title, row.author) });
  }
  if (row.google_books_id && !triedSources.includes("google_books")) {
    sources.push({ name: "google_books", fn: () => downloadFromGoogleBooks(row.google_books_id) });
  }
  if (row.isbn && !triedSources.includes("openlibrary")) {
    sources.push({ name: "openlibrary", fn: () => downloadFromOpenLibrary(row.isbn) });
  }

  for (const { name, fn } of sources) {
    const buf = await fn();
    await sleep(DELAY_MS);
    if (buf) return { source: name, buf };
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
    description = "rejected covers (trying new sources)";
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
  let skipped = 0;
  let noSource = 0;

  for (const row of rows) {
    const triedSources: string[] = row.cover_tried_sources || [];
    const filePath = path.join(COVERS_DIR, `${row.slug}.jpg`);

    const result = await tryAllSources(row, triedSources);

    if (result) {
      const w = getWidth(result.buf);
      fs.writeFileSync(filePath, result.buf);
      downloaded++;

      const newTried = [...new Set([...triedSources, result.source])];
      await pool.query(
        `UPDATE book_enrichments 
         SET has_cover = true, cover_approved = NULL, cover_source = $1, 
             cover_tried_sources = $2, cover_quality_score = NULL
         WHERE slug = $3`,
        [result.source, newTried, row.slug]
      );
      console.log(`✓ ${row.book_title} — ${result.source} (${w}px, ${result.buf.length} bytes)`);
    } else {
      const allSources = [...new Set([...triedSources, "google_books", "openlibrary", "amazon_isbn", "openlibrary_search"])];
      await pool.query(
        `UPDATE book_enrichments SET cover_tried_sources = $1 WHERE slug = $2`,
        [allSources, row.slug]
      );

      const untried = ["google_books", "openlibrary", "amazon_isbn", "openlibrary_search"].filter(s => !triedSources.includes(s));
      if (untried.length === 0) {
        skipped++;
        console.log(`  ⊘ ${row.book_title} — all sources exhausted`);
      } else {
        noSource++;
        console.log(`  ✗ ${row.book_title} — no cover from new sources (tried: ${untried.join(", ")})`);
      }
    }
  }

  console.log(`\nDone! Downloaded: ${downloaded}, No new source: ${noSource}, All exhausted: ${skipped}`);
  console.log(`Total: ${rows.length} processed`);
  await pool.end();
}

main().catch(console.error);
