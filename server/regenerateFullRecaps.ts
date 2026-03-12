import { pool } from "./db";
import { openai } from "./replit_integrations/image/client";
import { extractBooksFromTranscript, mergeExtractedBooks } from "./recapGenerator";
import { TOPICS } from "../client/src/data/topicData";
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";

const CURATED_TOPIC_SLUGS = TOPICS.map(t => t.slug);

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
        } else if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") {
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

async function generateRecap(transcript: string, podcastName: string, episodeTitle: string, showNotes?: string | null) {
  const showNotesSection = showNotes ? `\nShow Notes:\n${showNotes}\n` : "";
  const prompt = `You are PodCap, an AI that writes comprehensive podcast episode recaps. Generate a complete recap for this episode.

All facts, quotes, and insights MUST come directly from the provided transcript. NEVER fabricate content.

Podcast: ${podcastName}
Episode: "${episodeTitle}"${showNotesSection}
Transcript:
${transcript}

Respond ONLY with a valid JSON object (no markdown, no code fences):

{
  "tldl": "2-3 sentence summary of the core thesis.",
  "whatHappened": "A flowing 2-minute read narrative summary (6-10 short paragraphs, 2-4 sentences each). Separate paragraphs with \\n\\n.",
  "keyInsights": ["Speaker Name argues specific claim, pointing to named example", "Insight 2", "Insight 3", "Insight 4"],
  "quote": "A memorable verbatim line from the transcript",
  "quoteAttribution": "Speaker Name on topic",
  "keyTopics": ["Topic 1", "Topic 2", "Topic 3", "Topic 4", "Topic 5"],
  "topicContexts": {"slug": "Episode-specific description..."},
  "topQuestions": [
    {"question": "SEO question with named entity?", "answer": "2-4 sentence answer."},
    {"question": "Q2?", "answer": "A2."},
    {"question": "Q3?", "answer": "A3."},
    {"question": "Q4?", "answer": "A4."},
    {"question": "Q5?", "answer": "A5."}
  ],
  "sponsors": [{"name": "Name", "description": "Desc", "couponCode": null, "url": null, "howToRedeem": null}],
  "guests": [{"name": "Full Name", "title": "Title", "bio": "Bio.", "twitter": null, "linkedin": null, "instagram": null, "website": null, "topicsDiscussed": ["T1"]}],
  "resources": [{"name": "Name", "type": "book", "description": "Desc", "url": "URL", "author": "Author", "context": "Context"}]
}

RULES:
- keyInsights (exactly 4): Every takeaway MUST name the speaker, include a specific claim, and reference a named person/company/book/story. NEVER generic lessons. NEVER use square brackets around names. Test: could you identify which episode this is from without the title?
- whatHappened: 6-10 short paragraphs, flowing narrative, not bullet points
- keyTopics: 4-6 specific search-query-style phrases with named entities
- topicContexts: Use ONLY these slugs: ${CURATED_TOPIC_SLUGS.map(s => `"${s}"`).join(", ")}. Write episode-specific descriptions for relevant ones (3-6)
- topQuestions: 5 SEO questions. Each question MUST contain at least one of: the podcast name, a guest name, or a specific named entity (person, company, framework, book). NEVER generic questions. BAD: "What is the best way to find your passion?" GOOD: "What does Bill Gurley say about finding your passion on My First Million?" Answers must be 2-3 sentences maximum (Google truncates longer answers in People Also Ask)
- guests: Extract guests only (NOT hosts). CRITICAL: Use FULL NAME (first AND last). Search the entire transcript for the last name - it is almost always mentioned at least once (introduction, mid-conversation, etc.). If the transcript says "Sheil" throughout but mentions "Sheil Monga" once, use "Sheil Monga". Empty array if none
- BOOKS ARE CRITICAL: Before writing resources, scan the FULL transcript for ANY book title, author name, or phrase like "this book", "read this", "his book", "her book", "the book called", "a book by". Even if a book is mentioned once in passing, include it. Missing a book is a serious error
- resources: Books and purchasable items only. The "context" field must answer why this book was recommended or mentioned in this episode and what specific argument it supported. Do NOT describe the book generically. Do NOT attribute to a named speaker. Empty array ONLY if truly no books mentioned
- sponsors: All sponsors/advertisers. Empty array if none
- Quotes MUST be verbatim from transcript`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 16384,
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) return null;

  const parsed = JSON.parse(content.trim());
  let resources: any[] = Array.isArray(parsed.resources) ? parsed.resources : [];

  try {
    resources = mergeExtractedBooks(
      resources,
      await extractBooksFromTranscript(transcript, podcastName, episodeTitle),
      "[RegenerateRecaps]"
    );
  } catch (err) {
    console.warn(`[RegenerateRecaps] Book post-processing failed for "${episodeTitle}":`, err);
  }

  return {
    tldl: parsed.tldl || "",
    whatHappened: (parsed.whatHappened || "").replace(/\\n\\n/g, "\n\n").replace(/\\n/g, "\n"),
    keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [],
    quote: parsed.quote,
    quoteAttribution: parsed.quoteAttribution,
    keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : [],
    topicContexts: parsed.topicContexts && typeof parsed.topicContexts === "object" ? parsed.topicContexts : {},
    topQuestions: Array.isArray(parsed.topQuestions) ? parsed.topQuestions : [],
    sponsors: Array.isArray(parsed.sponsors) ? parsed.sponsors : [],
    guests: Array.isArray(parsed.guests) ? parsed.guests : [],
    resources,
  };
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
        SELECT r.id, r.slug, r.episode_title, r.podcast_name, r.itunes_id, r.show_notes, r.resources
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
        `SELECT transcript FROM episode_transcripts WHERE podcast_id = $1 AND episode_title = $2 LIMIT 1`,
        [row.itunes_id?.toString(), row.episode_title]
      );
      if (!tRes.rows[0]?.transcript) { console.log("  ⚠ No transcript, skipping regeneration"); continue; }

      console.log(`  Transcript: ${tRes.rows[0].transcript.length} chars, generating...`);
      const recap = await generateRecap(tRes.rows[0].transcript, row.podcast_name, row.episode_title, row.show_notes);
      if (!recap) { console.log("  ✗ Failed"); continue; }

      console.log(`  ✓ ${recap.keyInsights.length} insights, ${recap.topQuestions.length} Q&As, ${recap.guests.length} guests, ${recap.resources.length} resources`);
      recap.keyInsights.forEach((i, idx) => console.log(`    ${idx + 1}. ${i.slice(0, 140)}`));

      if (recap.resources.length > 0) {
        const newBooks = recap.resources.filter((r: any) => r.type === "book" && r.name);
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
          key_topics = $6, topic_contexts = $7, top_questions = $8, sponsors = $9, guests = $10, resources = $11
        WHERE id = $12
      `, [
        recap.tldl, recap.whatHappened, recap.keyInsights, recap.quote, recap.quoteAttribution,
        recap.keyTopics, JSON.stringify(recap.topicContexts), JSON.stringify(recap.topQuestions),
        JSON.stringify(recap.sponsors), JSON.stringify(recap.guests), JSON.stringify(recap.resources), id
      ]);
      console.log("  ✓ Saved");
    }
  } finally { client.release(); }
}

run().catch(console.error).finally(() => process.exit(0));
