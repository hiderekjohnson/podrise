import { openai } from "./replit_integrations/image/client";
import { db } from "./db";
import { sql } from "drizzle-orm";

interface BookRow {
  id: number;
  book_title: string;
  author: string | null;
  isbn: string | null;
}

async function lookupIsbns(books: { title: string; author: string | null }[]): Promise<Record<string, string>> {
  const bookList = books.map((b, i) => `${i + 1}. "${b.title}" by ${b.author || "Unknown"}`).join("\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `You are an ISBN lookup assistant. For each book, provide the ISBN-13 number (digits only, no dashes) for the most popular English edition — the one most likely to be the top seller on Amazon. Not a random or obscure edition. If you cannot find an ISBN with high confidence, respond with "UNKNOWN" for that book. Respond ONLY as a JSON object mapping the line number to the ISBN-13. Example: {"1":"9780141036144","2":"UNKNOWN","3":"9780062316097"}`
      },
      {
        role: "user",
        content: `Find the best ISBN-13 for each of these books:\n\n${bookList}`
      }
    ],
  });
  const { logCompletionUsage } = await import("./apiUsageTracker");
  logCompletionUsage(response, "gpt-4o-mini", "isbn_backfill");

  const text = response.choices[0]?.message?.content?.trim() || "{}";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse AI response:", cleaned.substring(0, 200));
    return {};
  }
}

async function main() {
  console.log("[ISBN Backfill] Starting ISBN lookup for rejected books...");

  const result = await db.execute(sql`
    SELECT id, book_title, author, isbn
    FROM book_enrichments
    WHERE cover_approved = false
    ORDER BY book_title
  `);
  const rows: BookRow[] = result.rows as any;

  console.log(`[ISBN Backfill] Found ${rows.length} rejected books`);

  const BATCH_SIZE = 25;
  let updated = 0;
  let skipped = 0;
  let unknown = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

    console.log(`[ISBN Backfill] Batch ${batchNum}/${totalBatches} (${batch.length} books)...`);

    const booksForLookup = batch.map(b => ({ title: b.book_title, author: b.author }));

    try {
      const results = await lookupIsbns(booksForLookup);

      for (let j = 0; j < batch.length; j++) {
        const lineNum = String(j + 1);
        const newIsbn = results[lineNum];
        const book = batch[j];

        if (!newIsbn || newIsbn === "UNKNOWN") {
          unknown++;
          continue;
        }

        const cleanIsbn = newIsbn.replace(/[^0-9]/g, "");
        if (cleanIsbn.length !== 13 && cleanIsbn.length !== 10) {
          console.log(`  Skip "${book.book_title}" — invalid ISBN: ${newIsbn}`);
          skipped++;
          continue;
        }

        if (book.isbn === cleanIsbn) {
          skipped++;
          continue;
        }

        await db.execute(sql`
          UPDATE book_enrichments
          SET isbn = ${cleanIsbn}, updated_at = NOW()
          WHERE id = ${book.id}
        `);

        console.log(`  Updated "${book.book_title}": ${book.isbn || "(empty)"} → ${cleanIsbn}`);
        updated++;
      }
    } catch (e: any) {
      console.error(`  Batch ${batchNum} failed: ${e.message}`);
    }

    if (i + BATCH_SIZE < rows.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\n[ISBN Backfill] DONE`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (same or invalid): ${skipped}`);
  console.log(`  Unknown (AI unsure): ${unknown}`);
  console.log(`  Total: ${rows.length}`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
