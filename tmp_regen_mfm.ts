import { pool } from "./server/db";
import { generateRecapFromTranscript } from "./server/recapGenerator";

const IDS = [3410, 3210, 3134];

async function main() {
  for (const id of IDS) {
    const { rows: [recap] } = await pool.query(
      `SELECT id, slug, episode_title, podcast_name FROM landing_page_recaps WHERE id = $1`, [id]
    );
    if (!recap) { console.log(`ID ${id} not found`); continue; }

    const { rows: tRows } = await pool.query(
      `SELECT transcript FROM episode_transcripts WHERE episode_title = $1 LIMIT 1`,
      [recap.episode_title]
    );
    if (!tRows.length || !tRows[0].transcript) {
      console.log(`No transcript for "${recap.episode_title}", skipping`);
      continue;
    }

    console.log(`\n--- Regenerating ID ${id}: ${recap.episode_title} ---`);
    const result = await generateRecapFromTranscript(
      tRows[0].transcript, recap.podcast_name, recap.episode_title
    );
    if (!result) {
      console.log(`  FAILED to generate recap`);
      continue;
    }

    const books = (result.resources || []).filter((r: any) => r.type === 'book');
    console.log(`  Books: ${books.length}`);
    for (const r of books) console.log(`    - "${r.name}" by ${r.author}`);
    console.log(`  Guests: ${(result.guests || []).map((g: any) => g.name || g).join(', ') || 'none'}`);
    console.log(`  Key topics: ${(result.keyTopics || []).join(', ')}`);

    await pool.query(
      `UPDATE landing_page_recaps SET
        tldl = $1, what_happened = $2, key_insights = $3,
        quote = $4, quote_attribution = $5, key_topics = $6,
        top_questions = $7, sponsors = $8, guests = $9, resources = $10
       WHERE id = $11`,
      [
        result.tldl, result.whatHappened, result.keyInsights,
        result.quote, result.quoteAttribution, result.keyTopics,
        JSON.stringify(result.topQuestions), JSON.stringify(result.sponsors),
        JSON.stringify(result.guests), JSON.stringify(result.resources),
        id
      ]
    );
    console.log(`  Saved.`);
  }
  await pool.end();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
