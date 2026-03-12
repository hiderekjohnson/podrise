import https from "https";
import fs from "fs";
import path from "path";

function downloadImage(url: string): Promise<Buffer | null> {
  return new Promise(resolve => {
    const proto = url.startsWith("https") ? https : require("http");
    proto.get(url, {timeout: 10000}, (res: any) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadImage(res.headers.location).then(resolve);
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve(buf.length > 3000 ? buf : null);
      });
    }).on("error", () => resolve(null));
  });
}

async function searchOpenLibrary(title: string, author?: string): Promise<number | null> {
  return new Promise(resolve => {
    let q = `title=${encodeURIComponent(title)}`;
    if (author) q += `&author=${encodeURIComponent(author)}`;
    const url = `https://openlibrary.org/search.json?${q}&limit=3&fields=cover_i,title`;
    https.get(url, {timeout: 10000}, res => {
      let data = "";
      res.on("data", (c: string) => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          for (const doc of json.docs || []) {
            if (doc.cover_i) return resolve(doc.cover_i);
          }
          resolve(null);
        } catch { resolve(null); }
      });
    }).on("error", () => resolve(null));
  });
}

const failedBooks = [
  { title: "A Century of Plenty", slug: "a-century-of-plenty", author: "" },
  { title: "A Liberating Vision", slug: "a-liberating-vision", author: "" },
  { title: "Bert and the Broken Teapot", slug: "bert-and-the-broken-teapot", author: "" },
  { title: "Finite and Infinite Games", slug: "finite-and-infinite-games-james-carse", author: "James Carse" },
  { title: "Hit Men", slug: "hit-men-power-brokers-and-fast-money-inside-the-music-business", author: "Fredric Dannen" },
  { title: "Ogilvy on Advertising", slug: "ogilvy-on-advertising-david-ogilvy", author: "David Ogilvy" },
  { title: "The Mars and Hershey Wars", slug: "the-mars-and-hershey-wars-the-inside-story-of-the-30-billion-candy-giants", author: "" },
  { title: "The Rest of the Iceberg", slug: "the-rest-of-the-iceberg-an-insiders-view-on-the-world-of-sports-and-celebrity", author: "" },
  { title: "The Sheikh CEO", slug: "the-sheikh-ceo-dr-yasar-jarrar", author: "Yasar Jarrar" },
  { title: "The Wisdom of the Hive", slug: "the-wisdom-of-the-hive-the-social-physiology-of-honeybee-colonies", author: "Thomas Seeley" },
];

async function run() {
  const publicBooksDir = path.join(process.cwd(), "public", "books");

  for (const book of failedBooks) {
    const localPath = path.join(publicBooksDir, `${book.slug}.jpg`);
    if (fs.existsSync(localPath) && fs.statSync(localPath).size > 5000) {
      console.log(`SKIP (already exists): ${book.title}`);
      continue;
    }

    console.log(`Searching Open Library for: ${book.title}...`);
    const coverId = await searchOpenLibrary(book.title, book.author || undefined);

    if (coverId) {
      const coverUrl = `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
      const img = await downloadImage(coverUrl);
      if (img) {
        fs.writeFileSync(localPath, img);
        console.log(`  OK from OpenLibrary: ${book.title} (${img.length} bytes)`);
        continue;
      }
    }

    console.log(`  FAILED: ${book.title} - no cover found anywhere`);
    await new Promise(r => setTimeout(r, 1000));
  }
}

run().catch(console.error);
