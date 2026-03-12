import { pool } from "./db";
import https from "https";
import fs from "fs";
import path from "path";

function checkGoogleBooksImage(gbId: string): Promise<{ok: boolean, size: number}> {
  return new Promise(resolve => {
    const url = `https://books.google.com/books/content?id=${gbId}&printsec=frontcover&img=1&zoom=1&source=gbs_api`;
    https.get(url, {timeout: 8000}, res => {
      let size = 0;
      res.on("data", (c: Buffer) => { size += c.length; });
      res.on("end", () => {
        resolve({ok: size > 15000, size});
      });
    }).on("error", () => resolve({ok: false, size: 0})).on("timeout", function(this: any) { this.destroy(); resolve({ok: false, size: 0}); });
  });
}

async function run() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      "SELECT book_title, slug, google_books_id FROM book_enrichments ORDER BY book_title"
    );

    let localOnly = 0, gbGood = 0, gbBad = 0, noCover = 0;
    const badBooks: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const localPath = r.slug ? path.join(process.cwd(), "public", "books", `${r.slug}.jpg`) : null;
      const hasLocal = localPath && fs.existsSync(localPath) && fs.statSync(localPath).size > 1000;

      if (hasLocal) {
        localOnly++;
        continue;
      }

      if (r.google_books_id) {
        const check = await checkGoogleBooksImage(r.google_books_id);
        if (check.ok) {
          gbGood++;
        } else {
          gbBad++;
          badBooks.push(`${r.book_title} (${check.size} bytes, gbID: ${r.google_books_id})`);
          console.log(`PLACEHOLDER: ${r.book_title} | ${check.size} bytes | ${r.google_books_id}`);
        }
      } else {
        noCover++;
        badBooks.push(`${r.book_title} (no gbID, no local)`);
        console.log(`NO COVER: ${r.book_title}`);
      }

      if ((i + 1) % 10 === 0) await new Promise(r => setTimeout(r, 300));
    }

    console.log("\n=== RESULTS ===");
    console.log("Total books:", rows.length);
    console.log("Has local cover:", localOnly);
    console.log("Google Books - real cover:", gbGood);
    console.log("Google Books - PLACEHOLDER:", gbBad);
    console.log("No cover at all:", noCover);
    console.log("Total showing placeholder:", gbBad + noCover);
  } finally {
    client.release();
  }
}

run().catch(console.error).finally(() => process.exit(0));
