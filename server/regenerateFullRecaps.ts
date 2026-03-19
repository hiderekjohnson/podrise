import { pool } from "./db";
import {
  generateRecapFromTranscript,
  extractQuotesFromTranscript,
} from "./recapGenerator";
import { SQL_NORMALIZE_TITLE } from "./utils/normalizeTitle";
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";

function makeSlug(title: string, author: string | null): string {
  const base = (title + (author && author !== "null" ? " " + author : ""))
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base.slice(0, 120);
}

function extractAsin(url: string): string | null {
  const patterns = [
    /\/dp\/([A-Za-z0-9]{10})/,
    /\/gp\/product\/([A-Za-z0-9]{10})/,
    /\/product\/([A-Za-z0-9]{10})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

function downloadFile(url: string, dest: string): Promise<boolean> {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve);
      }
      if (res.statusCode !== 200) { resolve(false); return; }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 1000) { resolve(false); return; }
        if (buf[0] === 0xFF && buf[1] === 0xD8) {
          fs.writeFileSync(dest, buf);
          resolve(true);
        } else if (buf[0] === 0x89 && buf[1] === 0x50) {
          fs.writeFileSync(dest, buf);
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

async function lookupGoogleBooksId(title: string, author: string | null): Promise<string | null> {
  return new Promise((resolve) => {
    const query = `intitle:${title}${author ? ` inauthor:${author}` : ""}`;
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1`;
    https.get(url, { timeout: 8000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          const id = data.items?.[0]?.id;
          resolve(id || null);
        } catch { resolve(null); }
      });
    }).on("error", () => resolve(null)).on("timeout", function(this: any) { this.destroy(); resolve(null); });
  });
}

async function enrichBook(client: any, bookName: string, author: string | null, url: string | null, description: string | null) {
  const bookKey = bookName.toLowerCase().trim();
  const existing = await client.query("SELECT slug, google_books_id FROM book_enrichments WHERE book_key = $1", [bookKey]);
  if (existing.rows.length > 0) {
    if (!existing.rows[0].google_books_id) {
      const gbId = await lookupGoogleBooksId(bookName, author);
      if (gbId) {
        await client.query("UPDATE book_enrichments SET google_books_id = $1 WHERE book_key = $2", [gbId, bookKey]);
        console.log(`    ✓ Found Google Books ID for "${bookName}": ${gbId}`);
      }
    }
    return existing.rows[0].slug;
  }

  const slug = makeSlug(bookName, author);
  const asin = url ? extractAsin(url) : null;
  const amazonUrl = asin ? `https://www.amazon.com/dp/${asin}` : (url || null);
  const gbId = await lookupGoogleBooksId(bookName, author);

  const { rows: blocked } = await client.query("SELECT 1 FROM book_blocklist WHERE book_key = $1", [bookKey]);
  if (blocked.length > 0) {
    console.log(`    ⊘ BLOCKED "${bookName}" (on blocklist)`);
    return slug;
  }

  await client.query(`
    INSERT INTO book_enrichments (book_key, book_title, author, description, slug, asin, amazon_url, google_books_id, topics)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '{"business"}')
    ON CONFLICT (book_key) DO NOTHING
  `, [bookKey, bookName, author || null, description || null, slug, asin, amazonUrl, gbId]);

  if (gbId) {
    console.log(`    ✓ Enriched "${bookName}" with Google Books ID: ${gbId}`);
  } else {
    console.log(`    ⚠ No Google Books match for "${bookName}"`);
  }

  return slug;
}

async function run() {
  const targetIds = process.argv.slice(2).map(Number).filter(n => n > 0);
  if (targetIds.length === 0) {
    console.log("Usage: npx tsx server/regenerateFullRecaps.ts <id1> <id2> ...");
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    for (const id of targetIds) {
      const { rows } = await client.query(`
        SELECT r.id, r.slug, r.episode_slug, r.episode_title, r.podcast_name, r.itunes_id, r.show_notes, r.resources, r.hosts
        FROM landing_page_recaps r WHERE r.id = $1
      `, [id]);
      
      if (rows.length === 0) { console.log(`[${id}] Not found`); continue; }
      const row = rows[0];
      console.log(`\n[${id}] ${row.podcast_name} - ${row.episode_title}`);

      let resources: any[] = [];
      try {
        resources = typeof row.resources === "string" ? JSON.parse(row.resources) : (row.resources || []);
      } catch { resources = []; }

      const books = (resources || []).filter((r: any) => r.type === "book" && r.name);
      if (books.length > 0) {
        console.log(`  Enriching ${books.length} book(s)...`);
        for (const book of books) {
          await enrichBook(client, book.name, book.author || null, book.url || null, book.description || book.context || null);
        }
      }

      const tRes = await client.query(
        `SELECT transcript FROM episode_transcripts WHERE podcast_id = $1 AND ${SQL_NORMALIZE_TITLE('episode_title')} = ${SQL_NORMALIZE_TITLE('$2')} LIMIT 1`,
        [row.itunes_id?.toString(), row.episode_title]
      );
      if (!tRes.rows[0]?.transcript) { console.log("  ⚠ No transcript, skipping regeneration"); continue; }

      const transcript = tRes.rows[0].transcript;
      console.log(`  Transcript: ${transcript.length} chars, generating...`);

      const parsed = await generateRecapFromTranscript(transcript, row.podcast_name, row.episode_title, row.show_notes);
      if (!parsed) { console.log("  ✗ Failed"); continue; }

      const whatHappened = parsed.whatHappened || "";
      const keyInsights = parsed.keyInsights || [];
      const finalResources = Array.isArray(parsed.resources) ? parsed.resources : [];

      console.log(`  ✓ ${keyInsights.length} insights, ${(parsed.guests || []).length} guests, ${finalResources.length} resources`);
      keyInsights.forEach((i: string, idx: number) => console.log(`    ${idx + 1}. ${i.slice(0, 140)}`));

      if (finalResources.length > 0) {
        const newBooks = finalResources.filter((r: any) => r.type === "book" && r.name);
        if (newBooks.length > 0) {
          console.log(`  Enriching ${newBooks.length} newly generated book(s)...`);
          for (const book of newBooks) {
            await enrichBook(client, book.name, book.author || null, book.url || null, book.description || book.context || null);
          }
        }
      }

      await client.query(`
        UPDATE landing_page_recaps SET
          tldl = $1, what_happened = $2, key_insights = $3, quote = $4, quote_attribution = $5,
          key_topics = $6, topic_contexts = $7, sponsors = $8, guests = $9, resources = $10
        WHERE id = $11
      `, [
        parsed.tldl, whatHappened, keyInsights, parsed.quote, parsed.quoteAttribution,
        parsed.keyTopics, JSON.stringify(parsed.topicContexts || {}),
        JSON.stringify(parsed.sponsors || []), JSON.stringify(parsed.guests || []), JSON.stringify(finalResources), id
      ]);
      console.log("  ✓ Saved");

      try {
        const extractedQuotes = await extractQuotesFromTranscript(
          transcript, row.podcast_name, row.episode_title,
          row.hosts || null,
          parsed.guests ? JSON.stringify(parsed.guests) : null
        );
        if (extractedQuotes.length > 0) {
          await client.query(`DELETE FROM episode_quotes WHERE podcast_slug = $1 AND episode_slug = $2`, [row.slug, row.episode_slug]);
          for (let i = 0; i < extractedQuotes.length; i++) {
            const q = extractedQuotes[i];
            await client.query(
              `INSERT INTO episode_quotes (podcast_slug, episode_slug, speaker_name, speaker_role, quote_text, context, quote_type, sort_order)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [row.slug, row.episode_slug, q.speakerName, q.speakerRole || null, q.quoteText, q.context, q.quoteType, i + 1]
            );
          }
          console.log(`  ✓ ${extractedQuotes.length} quotes extracted`);
        }
      } catch (quoteErr) {
        console.warn(`  Quote extraction failed:`, quoteErr);
      }
    }
  } finally { client.release(); }
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
