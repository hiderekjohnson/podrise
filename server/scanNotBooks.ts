import pg from "pg";
import fs from "fs";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const COVERS_DIR = path.resolve("public/books");
const BATCH_SIZE = 80;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const { rows } = await pool.query(
    `SELECT id, book_key, book_title, author, slug FROM book_enrichments WHERE slug IS NOT NULL ORDER BY book_title`
  );
  console.log(`Total books to scan: ${rows.length}`);
  if (dryRun) console.log("DRY RUN — no deletions will be made\n");

  const notBooks: typeof rows = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const bookList = batch.map((b, idx) => `${idx + 1}. "${b.book_title}"${b.author ? ` by ${b.author}` : ""}`).join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a librarian. Given a list of supposed book titles, identify which ones are NOT real, published books. 

Things that are NOT books:
- Podcast names or podcast episodes
- Blog posts, essays, articles, memos, letters, speeches
- Movies, TV shows, documentaries
- Software tools, apps, websites, newsletters
- Generic phrases or concepts that aren't published book titles
- Reports, papers, studies (academic papers are not "books")
- Courses, workshops, journals
- Vague references like "Steve's Book" or "Mark Hyman's new book"
- Song titles or albums

Things that ARE books (keep these):
- Published books you can find on Amazon/Goodreads, even if niche or self-published
- Books with slightly imprecise titles (e.g. "Buffett's Snowball" for "The Snowball")
- Audiobooks of real books
- If unsure, assume it IS a book (err on the side of keeping)

Return a JSON object with a single key "not_books" containing an array of the line numbers (1-indexed) of entries that are NOT real books. If all are real books, return {"not_books": []}.`
        },
        {
          role: "user",
          content: `Which of these are NOT real published books?\n\n${bookList}`
        }
      ],
      max_tokens: 1000,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
    const { logCompletionUsage } = await import("./apiUsageTracker");
    logCompletionUsage(completion, "gpt-4o-mini", "scan_not_books");

    const raw = completion.choices[0]?.message?.content || "{}";
    try {
      const parsed = JSON.parse(raw);
      const indices: number[] = parsed.not_books || [];
      for (const idx of indices) {
        const book = batch[idx - 1];
        if (book) notBooks.push(book);
      }
    } catch (e) {
      console.error(`Error parsing AI response for batch ${i / BATCH_SIZE + 1}:`, e);
    }

    console.log(`Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(rows.length / BATCH_SIZE)} (${batch.length} items)`);
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Found ${notBooks.length} non-book entries out of ${rows.length} total`);
  console.log(`${"=".repeat(60)}\n`);

  for (const book of notBooks) {
    console.log(`  ✗ "${book.book_title}"${book.author ? ` by ${book.author}` : ""}`);
  }

  if (dryRun) {
    console.log(`\nDRY RUN complete. Run without --dry-run to actually remove these.`);
    await pool.end();
    return;
  }

  console.log(`\nRemoving ${notBooks.length} entries and adding to blocklist...`);

  let removed = 0;
  for (const book of notBooks) {
    await pool.query(
      `INSERT INTO book_blocklist (book_key, book_title, reason) VALUES ($1, $2, 'not_a_book') ON CONFLICT (book_key) DO NOTHING`,
      [book.book_key, book.book_title]
    );

    const filePath = path.join(COVERS_DIR, `${book.slug}.jpg`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await pool.query(`DELETE FROM book_aliases WHERE canonical_key = $1 OR alias_key = $1`, [book.book_key]);
    await pool.query(`DELETE FROM book_enrichments WHERE id = $1`, [book.id]);
    removed++;
  }

  console.log(`\nDone! Removed ${removed} non-book entries and added them to blocklist.`);
  const { rows: remaining } = await pool.query(`SELECT COUNT(*) FROM book_enrichments WHERE slug IS NOT NULL`);
  console.log(`Remaining books: ${remaining[0].count}`);

  await pool.end();
}

main().catch(console.error);
