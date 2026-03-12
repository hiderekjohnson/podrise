import { pool } from "./db";
import https from "https";
import fs from "fs";
import path from "path";

function downloadImage(url: string): Promise<{data: Buffer, width: number, height: number} | null> {
  return new Promise(resolve => {
    https.get(url, {timeout: 10000}, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadImage(res.headers.location).then(resolve);
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 5000) {
          resolve(null);
          return;
        }
        resolve({data: buf, width: 0, height: 0});
      });
    }).on("error", () => resolve(null)).on("timeout", function(this: any) { this.destroy(); resolve(null); });
  });
}

function getGoogleBooksUrl(gbId: string, zoom: number): string {
  return `https://books.google.com/books/content?id=${gbId}&printsec=frontcover&img=1&zoom=${zoom}&source=gbs_api`;
}

async function run() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      "SELECT book_title, slug, google_books_id, author FROM book_enrichments ORDER BY book_title"
    );

    const publicBooksDir = path.join(process.cwd(), "public", "books");
    if (!fs.existsSync(publicBooksDir)) {
      fs.mkdirSync(publicBooksDir, { recursive: true });
    }

    let downloaded = 0, failed = 0, skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const localPath = r.slug ? path.join(publicBooksDir, `${r.slug}.jpg`) : null;
      const hasLocal = localPath && fs.existsSync(localPath) && fs.statSync(localPath).size > 5000;

      if (hasLocal) {
        skipped++;
        continue;
      }

      if (!r.google_books_id) {
        console.log(`SKIP (no gbID): ${r.book_title}`);
        failed++;
        continue;
      }

      let result: {data: Buffer} | null = null;

      for (const zoom of [2, 0, 3]) {
        const url = getGoogleBooksUrl(r.google_books_id, zoom);
        result = await downloadImage(url);
        if (result && result.data.length > 15000) {
          break;
        }
        result = null;
      }

      if (!result && r.google_books_id) {
        result = await downloadImage(getGoogleBooksUrl(r.google_books_id, 1));
        if (result && result.data.length > 8000) {
        } else {
          result = null;
        }
      }

      if (result && localPath) {
        fs.writeFileSync(localPath, result.data);
        downloaded++;
        console.log(`OK: ${r.book_title} (${result.data.length} bytes)`);
      } else {
        failed++;
        console.log(`FAILED: ${r.book_title} (gbID: ${r.google_books_id})`);
      }

      if ((i + 1) % 5 === 0) await new Promise(r => setTimeout(r, 500));
    }

    console.log("\n=== RESULTS ===");
    console.log("Already had local:", skipped);
    console.log("Downloaded:", downloaded);
    console.log("Failed:", failed);
    console.log("Total:", rows.length);
  } finally {
    client.release();
  }
}

run().catch(console.error).finally(() => process.exit(0));
