import { pool } from "./db";
import { openai } from "./replit_integrations/image/client";
import { TOPICS } from "../client/src/data/topicData";

const CURATED_TOPIC_SLUGS = TOPICS.map(t => t.slug);

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
  "keyInsights": ["[Speaker] argues [specific claim], pointing to [named example]", "Insight 2", "Insight 3", "Insight 4"],
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
- keyInsights (exactly 4): Every takeaway MUST name the speaker, include a specific claim, and reference a named person/company/book/story. NEVER generic lessons. Test: could you identify which episode this is from without the title?
- whatHappened: 6-10 short paragraphs, flowing narrative, not bullet points
- keyTopics: 4-6 specific search-query-style phrases with named entities
- topicContexts: Use ONLY these slugs: ${CURATED_TOPIC_SLUGS.map(s => `"${s}"`).join(", ")}. Write episode-specific descriptions for relevant ones (3-6)
- topQuestions: 5 SEO questions with specific entity names. 2-4 sentence answers
- guests: Extract guests only (NOT hosts). Empty array if none
- resources: Books and purchasable items only. Empty array if none
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
    resources: Array.isArray(parsed.resources) ? parsed.resources : [],
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
        SELECT r.id, r.slug, r.episode_title, r.podcast_name, r.itunes_id, r.show_notes
        FROM landing_page_recaps r WHERE r.id = $1
      `, [id]);
      
      if (rows.length === 0) { console.log(`[${id}] Not found`); continue; }
      const row = rows[0];
      console.log(`\n[${id}] ${row.podcast_name} - ${row.episode_title}`);

      const tRes = await client.query(
        `SELECT transcript FROM episode_transcripts WHERE podcast_id = $1 AND episode_title = $2 LIMIT 1`,
        [row.itunes_id?.toString(), row.episode_title]
      );
      if (!tRes.rows[0]?.transcript) { console.log("  ⚠ No transcript"); continue; }

      console.log(`  Transcript: ${tRes.rows[0].transcript.length} chars, generating...`);
      const recap = await generateRecap(tRes.rows[0].transcript, row.podcast_name, row.episode_title, row.show_notes);
      if (!recap) { console.log("  ✗ Failed"); continue; }

      console.log(`  ✓ ${recap.keyInsights.length} insights, ${recap.topQuestions.length} Q&As, ${recap.guests.length} guests, ${recap.resources.length} resources`);
      recap.keyInsights.forEach((i, idx) => console.log(`    ${idx + 1}. ${i.slice(0, 140)}`));

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
