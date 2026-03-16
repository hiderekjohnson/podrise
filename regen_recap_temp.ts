import pg from "pg";
const { Pool } = pg;
import { processFullTranscript } from "./server/transcriptChunker";
import { generateRecapFromTranscript } from "./server/recapGenerator";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const podcastSlug = "hubermanlab";
  const episodeSlug = "science-based-meditation-tools-to-improve-your-brain";

  const { rows: recapRows } = await pool.query(
    `SELECT lpr.id, lpr.episode_title, pd.itunes_id, pd.name as podcast_name FROM landing_page_recaps lpr JOIN podcast_directory pd ON pd.slug = lpr.slug WHERE lpr.slug = $1 AND lpr.episode_slug = $2`,
    [podcastSlug, episodeSlug]
  );
  if (recapRows.length === 0) { console.log("Recap not found"); process.exit(1); }
  const { episode_title, itunes_id, podcast_name } = recapRows[0];
  console.log(`Found: "${episode_title}" from ${podcast_name}`);

  const { rows: transcriptRows } = await pool.query(
    `SELECT transcript FROM episode_transcripts WHERE podcast_id = $1 AND episode_title = $2 LIMIT 1`,
    [String(itunes_id), episode_title]
  );
  if (transcriptRows.length === 0) { console.log("Transcript not found"); process.exit(1); }
  console.log(`Transcript: ${transcriptRows[0].transcript.length} chars`);

  const processedTranscript = processFullTranscript(transcriptRows[0].transcript);
  console.log(`Processed transcript: ${processedTranscript.length} chars`);
  console.log("Generating recap with AI...");

  const recap = await generateRecapFromTranscript(processedTranscript, podcast_name, episode_title);
  if (!recap) { console.log("AI generation failed"); process.exit(1); }

  console.log(`whatHappened: ${recap.whatHappened?.length} chars, ${recap.whatHappened?.split("\n\n").length} paragraphs`);

  await pool.query(
    `UPDATE landing_page_recaps SET tldl = $1, what_happened = $2, key_insights = $3, quote = $4, quote_attribution = $5, key_topics = $6, top_questions = $7, sponsors = $8, guests = $9, resources = $10, topic_contexts = $11 WHERE slug = $12 AND episode_slug = $13`,
    [
      recap.tldl, recap.whatHappened, JSON.stringify(recap.keyInsights),
      recap.quote, recap.quoteAttribution,
      recap.keyTopics ? `{${recap.keyTopics.map((t: string) => `"${t.replace(/"/g, '\\"')}"`).join(",")}}` : null,
      recap.topQuestions ? JSON.stringify(recap.topQuestions) : null,
      recap.sponsors ? JSON.stringify(recap.sponsors) : null,
      recap.guests ? JSON.stringify(recap.guests) : null,
      recap.resources ? JSON.stringify(recap.resources) : null,
      recap.topicContexts ? JSON.stringify(recap.topicContexts) : null,
      podcastSlug, episodeSlug,
    ]
  );

  console.log("Updated successfully!");
  console.log("\nNew recap preview:");
  console.log(recap.whatHappened?.substring(0, 1500));
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
