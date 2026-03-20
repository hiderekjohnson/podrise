import { openai } from "./replit_integrations/image/client";
import { pool } from "./db";
import { sendCriticalApiAlert, isCriticalOpenAIError, classifyOpenAIError } from "./adminAlertService";

interface BookAggregation {
  bookKey: string;
  name: string;
  author: string | null;
  contexts: string[];
  podcastNames: string[];
  mentionCount: number;
}

async function getAllBooks(): Promise<BookAggregation[]> {
  const { rows } = await pool.query(
    `SELECT lpr.slug, lpr.episode_slug, lpr.episode_title, lpr.resources, pd.name as podcast_name
     FROM landing_page_recaps lpr
     JOIN podcast_directory pd ON pd.slug = lpr.slug
     WHERE lpr.resources IS NOT NULL AND lpr.resources::text != '[]'`
  );

  const bookMap = new Map<string, BookAggregation>();

  for (const row of rows) {
    let resources: any[];
    try {
      const parsed = typeof row.resources === 'string' ? JSON.parse(row.resources) : row.resources;
      if (!Array.isArray(parsed)) continue;
      resources = parsed;
    } catch { continue; }

    for (const r of resources) {
      if (!r || r.type !== 'book' || !r.name || r.name === '_books_checked') continue;

      const key = r.name.toLowerCase().trim();
      const existing = bookMap.get(key);
      if (existing) {
        existing.mentionCount++;
        if (r.context && !existing.contexts.includes(r.context)) {
          existing.contexts.push(r.context);
        }
        if (row.podcast_name && !existing.podcastNames.includes(row.podcast_name)) {
          existing.podcastNames.push(row.podcast_name);
        }
        if (!existing.author && r.author) existing.author = r.author;
      } else {
        bookMap.set(key, {
          bookKey: key,
          name: r.name,
          author: r.author || null,
          contexts: r.context ? [r.context] : [],
          podcastNames: row.podcast_name ? [row.podcast_name] : [],
          mentionCount: 1,
        });
      }
    }
  }

  return Array.from(bookMap.values()).sort((a, b) => b.mentionCount - a.mentionCount);
}

async function enrichBook(book: BookAggregation): Promise<{ description: string; podcastBuzz: string; asin: string | null }> {
  const contextSummary = book.contexts.slice(0, 8).join("\n- ");
  const podcastList = book.podcastNames.join(", ");

  const prompt = `I need you to enrich this book with two pieces of content.

BOOK: "${book.name}" by ${book.author || "Unknown Author"}
MENTIONED ON: ${podcastList} (${book.mentionCount} total mentions)
CONTEXT FROM EPISODES:
- ${contextSummary}

Generate:

1. DESCRIPTION: A 1-2 sentence description of what the book is actually about. This should describe the book's content and thesis, NOT how it was discussed on podcasts. Write it like a bookstore blurb. If you know this book, use your knowledge. If you don't recognize it, write a description based on the title, author, and context clues.

2. PODCAST_BUZZ: A 1-2 sentence summary of why podcast hosts love this book. What keeps bringing it up in conversation? Who recommends it and why? Reference specific podcasts by name when possible. Make it feel like social proof from real listeners. Examples of good buzz:
   - "A staple on business podcasts. Tim Ferriss calls it essential reading, and it regularly comes up on The Knowledge Project as a framework for building habits."
   - "Frequently cited on tech podcasts when discussing AI safety. Hosts on Lex Fridman and All-In have called it the most important book of the decade."

3. ASIN: If you know the Amazon ASIN (10-character alphanumeric code) for this book, provide it. Otherwise null.

Respond with ONLY valid JSON:
{
  "description": "What the book is about...",
  "podcastBuzz": "Why podcast hosts love it...",
  "asin": "B0XXXXXXXX" or null
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 500,
    temperature: 0.4,
    response_format: { type: "json_object" },
  });
  const { logCompletionUsage } = await import("./apiUsageTracker");
  logCompletionUsage(completion, "gpt-4o", "book_enrichment");

  const content = completion.choices[0]?.message?.content;
  if (!content) return { description: "", podcastBuzz: "", asin: null };

  const parsed = JSON.parse(content.trim());
  return {
    description: parsed.description || "",
    podcastBuzz: parsed.podcastBuzz || "",
    asin: parsed.asin || null,
  };
}

function generateSlug(title: string, author: string | null): string {
  const raw = author ? `${title}-${author}` : title;
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 120);
}

export async function enrichAllBooks(limit?: number): Promise<{ processed: number; errors: number }> {
  const books = await getAllBooks();
  const toProcess = limit ? books.slice(0, limit) : books;

  let processed = 0;
  let errors = 0;

  for (const book of toProcess) {
    const existing = await pool.query(
      "SELECT id, description FROM book_enrichments WHERE book_key = $1",
      [book.bookKey]
    );
    if (existing.rows.length > 0 && existing.rows[0].description && existing.rows[0].description.trim() !== '') {
      console.log(`[BookEnrich] Skipping "${book.name}" - already enriched`);
      continue;
    }

    try {
      console.log(`[BookEnrich] Enriching "${book.name}" by ${book.author}...`);
      const enrichment = await enrichBook(book);

      const amazonUrl = enrichment.asin
        ? `https://www.amazon.com/dp/${enrichment.asin}?tag=podcap-20`
        : null;

      let slug = generateSlug(book.name, book.author);
      const { rows: dupeRows } = await pool.query(
        "SELECT id FROM book_enrichments WHERE slug = $1 AND book_key != $2",
        [slug, book.bookKey]
      );
      if (dupeRows.length > 0) {
        slug = `${slug}-${Date.now().toString(36)}`;
      }

      const { rows: blocked } = await pool.query("SELECT 1 FROM book_blocklist WHERE book_key = $1", [book.bookKey]);
      if (blocked.length > 0) {
        console.log(`[BookEnrich] BLOCKED: "${book.name}" (on blocklist)`);
        continue;
      }

      await pool.query(
        `INSERT INTO book_enrichments (book_key, book_title, author, description, podcast_buzz, asin, amazon_url, slug)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (book_key) DO UPDATE SET
           description = EXCLUDED.description,
           podcast_buzz = EXCLUDED.podcast_buzz,
           asin = COALESCE(EXCLUDED.asin, book_enrichments.asin),
           amazon_url = COALESCE(EXCLUDED.amazon_url, book_enrichments.amazon_url),
           slug = COALESCE(book_enrichments.slug, EXCLUDED.slug),
           updated_at = NOW()`,
        [book.bookKey, book.name, book.author, enrichment.description, enrichment.podcastBuzz, enrichment.asin, amazonUrl, slug]
      );

      processed++;
      console.log(`[BookEnrich] Done: "${book.name}" (ASIN: ${enrichment.asin || 'none'})`);

      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`[BookEnrich] Failed: "${book.name}":`, err);
      if (isCriticalOpenAIError(err)) {
        const msg = err instanceof Error ? err.message : String(err);
        sendCriticalApiAlert({ apiName: "OpenAI", errorType: classifyOpenAIError(err), errorMessage: `Book enrichment failed for "${book.name}": ${msg}`, adminPath: "/admin/internal-tools/alerts" }).catch(() => {});
      }
      errors++;
    }
  }

  return { processed, errors };
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  enrichAllBooks().then(result => {
    console.log(`[BookEnrich] Complete: ${result.processed} processed, ${result.errors} errors`);
    process.exit(0);
  }).catch(err => {
    console.error("[BookEnrich] Fatal error:", err);
    process.exit(1);
  });
}