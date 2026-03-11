import { Pool } from "pg";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";

const BOOKS_DIR = path.join(process.cwd(), "public", "books");
const DELAY_MS = 150;
const MIN_IMAGE_SIZE = 8000;

if (!fs.existsSync(BOOKS_DIR)) {
  fs.mkdirSync(BOOKS_DIR, { recursive: true });
}

function downloadImage(url: string, dest: string): Promise<boolean> {
  return new Promise((resolve) => {
    const protocol = url.startsWith("https") ? https : http;
    const req = protocol.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirect = res.headers.location;
        if (redirect) {
          downloadImage(redirect, dest).then(resolve);
          return;
        }
        resolve(false);
        return;
      }

      if (res.statusCode !== 200) {
        resolve(false);
        return;
      }

      const contentType = res.headers["content-type"] || "";
      if (!contentType.includes("image")) {
        resolve(false);
        return;
      }

      const chunks: Buffer[] = [];
      let totalSize = 0;
      res.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        totalSize += chunk.length;
      });
      res.on("end", () => {
        if (totalSize < MIN_IMAGE_SIZE) {
          resolve(false);
          return;
        }
        const buffer = Buffer.concat(chunks);
        fs.writeFileSync(dest, buffer);
        resolve(true);
      });
      res.on("error", () => resolve(false));
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function fetchGoogleBooksCover(title: string): Promise<string | null> {
  return new Promise((resolve) => {
    const q = encodeURIComponent(title);
    const url = `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1&fields=items(volumeInfo/imageLinks)`;
    https.get(url, { timeout: 10000 }, (res) => {
      let data = "";
      res.on("data", (chunk: string) => { data += chunk; });
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const imageLinks = json?.items?.[0]?.volumeInfo?.imageLinks;
          const coverUrl = imageLinks?.thumbnail || imageLinks?.smallThumbnail;
          if (coverUrl) {
            resolve(coverUrl.replace("http://", "https://").replace("&edge=curl", "").replace("zoom=1", "zoom=2"));
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
      res.on("error", () => resolve(null));
    }).on("error", () => resolve(null));
  });
}

async function fetchOpenLibraryCoverId(title: string): Promise<number | null> {
  return new Promise((resolve) => {
    const q = encodeURIComponent(title);
    const url = `https://openlibrary.org/search.json?q=${q}&limit=1&fields=cover_i`;
    https.get(url, { timeout: 10000 }, (res) => {
      let data = "";
      res.on("data", (chunk: string) => { data += chunk; });
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const coverId = json?.docs?.[0]?.cover_i;
          resolve(coverId ? Number(coverId) : null);
        } catch {
          resolve(null);
        }
      });
      res.on("error", () => resolve(null));
    }).on("error", () => resolve(null));
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    const { rows } = await client.query(
      `SELECT slug, book_title, asin FROM book_enrichments WHERE slug IS NOT NULL ORDER BY book_title`
    );

    console.log(`Found ${rows.length} books with slugs`);

    let downloaded = 0;
    let skipped = 0;
    let failed = 0;
    let amazonSuccess = 0;
    let googleSuccess = 0;
    let olSuccess = 0;

    for (const row of rows) {
      const destPath = path.join(BOOKS_DIR, `${row.slug}.jpg`);

      if (fs.existsSync(destPath)) {
        const stat = fs.statSync(destPath);
        if (stat.size >= MIN_IMAGE_SIZE) {
          skipped++;
          continue;
        }
        fs.unlinkSync(destPath);
      }

      let success = false;

      if (row.asin) {
        const amazonUrl = `https://images-na.ssl-images-amazon.com/images/P/${row.asin}.01._SX400_.jpg`;
        success = await downloadImage(amazonUrl, destPath);
        if (success) {
          amazonSuccess++;
          downloaded++;
          console.log(`  [Amazon] ${row.book_title} -> ${row.slug}.jpg`);
          await sleep(DELAY_MS);
          continue;
        }
      }

      const googleCoverUrl = await fetchGoogleBooksCover(row.book_title);
      if (googleCoverUrl) {
        success = await downloadImage(googleCoverUrl, destPath);
        if (success) {
          googleSuccess++;
          downloaded++;
          console.log(`  [Google] ${row.book_title} -> ${row.slug}.jpg`);
          await sleep(DELAY_MS);
          continue;
        }
      }

      const coverId = await fetchOpenLibraryCoverId(row.book_title);
      if (coverId) {
        const olUrl = `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
        success = await downloadImage(olUrl, destPath);
        if (success) {
          olSuccess++;
          downloaded++;
          console.log(`  [OpenLib] ${row.book_title} -> ${row.slug}.jpg`);
          await sleep(DELAY_MS);
          continue;
        }
      }

      failed++;
      console.log(`  [MISS] ${row.book_title} (no cover found)`);
      await sleep(DELAY_MS);
    }

    console.log(`\n========== RESULTS ==========`);
    console.log(`Total books: ${rows.length}`);
    console.log(`Already had: ${skipped}`);
    console.log(`Downloaded: ${downloaded} (Amazon: ${amazonSuccess}, Google: ${googleSuccess}, OpenLibrary: ${olSuccess})`);
    console.log(`No cover found: ${failed}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
