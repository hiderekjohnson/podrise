import { pool } from "./db";
import { openai } from "./replit_integrations/image/client";
import { extractBooksFromTranscript, mergeExtractedBooks, extractQuotesFromTranscript } from "./recapGenerator";
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

async function generateKeyInsightsFromRecap(recap: string, podcastName: string, episodeTitle: string): Promise<string[]> {
  console.log(`  Pass 2: Generating key takeaways from recap...`);
  const prompt = `You write the "Key Takeaways" section for a podcast recap site. Each takeaway delivers a concrete fact or insight the reader didn't know before.

Your reader will never listen to this episode. These 4 takeaways are the only thing they'll read. Make each one deliver real knowledge.

Episode: "${episodeTitle}" from ${podcastName}

RECAP:
${recap}

WHAT MAKES A GREAT TAKEAWAY:
- It delivers a SPECIFIC FACT the reader can walk away with. A number, a mechanism, a strategy, a company name, a concrete result.
- It is 2-3 sentences of straight-to-the-point information. No hooks, no setup, no "here's the twist" framing.
- It stands completely alone - no "in this episode" or "the guest explained" framing needed.
- It reads like a briefing note, not a conversation. Professional, direct, informative.

NEVER start a takeaway with a person's name. Lead with the insight, not the attribution.

TONE RULES - CRITICAL:
- Write in a NEUTRAL, INFORMATIVE tone. Like a news brief or research summary.
- NEVER use conversational hooks: "Dude, did you know...", "Here's the thing:", "Here's a twist:", "Imagine...", "Turns out...", "The kicker?", "The takeaway?", "The strategy?", "The result?", "The secret?", "What's wild is..."
- NEVER address the reader with "you" or use rhetorical questions
- NEVER use exclamation marks
- NEVER editorialize with "proving that...", "showing that...", "a reminder that..."

EXAMPLES OF GREAT TAKEAWAYS:
- "Cal AI hit $30M in annual revenue before its founder turned 20, primarily through performance-based influencer marketing rather than traditional ads. The company paid fitness creators per conversion, not per post, which kept customer acquisition costs low while scaling rapidly."
- "Seagrass captures carbon 35 times faster than rainforests, but it's disappearing at a rate of about 7% per year globally due to coastal development and pollution. Ocean-based carbon sequestration may be more impactful than land-based reforestation for climate goals."
- "SailDrone deploys autonomous sailboats that stay at sea for months collecting ocean data for NOAA and the U.S. Navy. The company has mapped more of the ocean floor than any organization in history, covering areas that manned vessels cannot economically reach."

EXAMPLES OF BAD TAKEAWAYS (never write these):
- "Dude, did you know seagrass captures carbon 35 times more effectively than rainforests?" (conversational hook)
- "Here's a twist: while space gets the glamour, ocean defense is the real deal." (hook + editorial)
- "Imagine being 19 and selling your AI app to MyFitnessPal after being rejected by Ivy League schools!" (hook + exclamation)
- "Zach's decision-making secret? He used expected value." (rhetorical question hook)
- "Sound symbolism plays a vital role in brand naming." (vague, no specifics)
- "Zach's journey shows the importance of perseverance." (generic motivational filler)

BANNED WORDS: discusses, explores, highlights, shares, emphasizes, explains, reveals, showcases, illustrates, demonstrates, underscores, stresses, crucial, critical, essential, pivotal, important, innovative, groundbreaking, game-changing, leveraging, revolutionizing
BANNED PHRASES: "Here's a twist", "Here's the thing", "Turns out", "Imagine", "Dude", "The kicker", "The takeaway", "The strategy?", "The secret?", "proving that", "showing that", "a reminder that"

Write exactly 4 takeaways. Respond ONLY with JSON: {"keyInsights": ["takeaway1", "takeaway2", "takeaway3", "takeaway4"]}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2000,
      temperature: 0.7,
      response_format: { type: "json_object" },
    });
    const content = completion.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content.trim());
      if (Array.isArray(parsed.keyInsights) && parsed.keyInsights.length === 4) {
        console.log(`  Pass 2 complete: 4 key takeaways generated from recap`);
        return parsed.keyInsights;
      }
    }
  } catch (err) {
    console.warn(`  Pass 2 failed, falling back to Pass 1 insights:`, err);
  }
  return [];
}

async function generateRecap(transcript: string, podcastName: string, episodeTitle: string, showNotes?: string | null) {
  const showNotesSection = showNotes ? `\nShow Notes:\n${showNotes}\n` : "";
  console.log(`  Pass 1: Generating recap + structured data...`);
  const prompt = `You are PodCap, an AI that writes comprehensive podcast episode recaps. Generate a complete recap for this episode.

All facts, quotes, and insights MUST come directly from the provided transcript. NEVER fabricate content.

Podcast: ${podcastName}
Episode: "${episodeTitle}"${showNotesSection}
Transcript:
${transcript}

Respond ONLY with a valid JSON object (no markdown, no code fences):

{
  "tldl": "2-3 sentence summary of the core thesis.",
  "whatHappened": "The episode recap. 6-8 paragraphs, each 2-4 sentences. Separate paragraphs with \\n\\n.",
  "quote": "The single most surprising, counterintuitive, or shareable line from the transcript.",
  "quoteAttribution": "Speaker Name",
  "keyTopics": ["Topic 1", "Topic 2", "Topic 3", "Topic 4", "Topic 5"],
  "topicContexts": {"slug": "Episode-specific description..."},
  "sponsors": [{"name": "Name", "description": "Desc", "couponCode": null, "url": null, "howToRedeem": null}],
  "guests": [{"name": "Full Name", "title": "Title", "bio": "Bio.", "twitter": null, "linkedin": null, "instagram": null, "website": null, "topicsDiscussed": ["T1"]}],
  "resources": [{"name": "Name", "type": "book", "description": "Desc", "url": "URL", "author": "Author", "context": "Context"}]
}

RULES FOR whatHappened (THE RECAP):
- The recap has one job: give the reader the actual knowledge from the episode without them needing to listen
- Write like a well-informed friend walking you through the best parts of the conversation
- Every paragraph must contain at least one specific idea, fact, number, or insight
- If a paragraph only describes what was talked about without saying what was actually said, delete it and rewrite with the real content
- Start with the most interesting idea, NOT with "In this episode of [show name]..."
- 6-8 paragraphs, each 2-4 sentences, flowing naturally from one idea to the next
- BANNED PHRASES: "In this episode...", "The conversation explores/shifts/turns to...", "The hosts discuss/touch on/delve into...", "They also highlight/emphasize/underscore...", "The episode wraps up with...", "Ultimately, the episode...", "[Person] shares/reveals/explains that...", "broader themes like...", "actionable insights on..."
- BANNED WORDS: discusses, explores, highlights, shares, emphasizes, explains, underscores, delves, touches on, reflects on, recounts, acknowledges, showcases, illustrates, demonstrates, stresses, leveraging, revolutionizing, pioneering, groundbreaking, innovative, game-changing
- BAD PARAGRAPH: "The conversation shifts to AI, where the guest maps out the landscape. He identifies key players like OpenAI, Anthropic, and Google, analyzing their strategies."
- GOOD PARAGRAPH: "The AI landscape right now looks like a three-way war. OpenAI owns consumers - ChatGPT has become the default for most people - while Anthropic is quietly winning enterprise deals. Google, which looked dead six months ago, has surged back with Gemini and has one massive advantage nobody else can match: distribution through Search, Android, and Gmail reaching billions of users daily."

OTHER RULES:
- All core fields required: tldl, whatHappened (6-8 paragraphs), quote, quoteAttribution, keyTopics (4-6), resources
- keyTopics: 4-6 specific search-query-style phrases with named entities
- topicContexts: Use ONLY these slugs: ${CURATED_TOPIC_SLUGS.map(s => `"${s}"`).join(", ")}. Write episode-specific descriptions for relevant ones (3-6)
- quote: Find the single most SHAREABLE line from the transcript - surprising, counterintuitive, provocative, funny, or profound. Must be verbatim. Avoid generic motivational statements. quoteAttribution should be just the speaker's name (e.g. "Bill Gurley"), not "Speaker Name on topic"
- guests: Extract guests only (NOT hosts). Use FULL NAME. Empty array if none
- BOOKS: Include books that are genuinely discussed, recommended, or referenced for their content. Do NOT extract a book if the speaker merely uses the book title as a concept, metaphor, or adjective (e.g., "you need grit" is NOT a reference to Angela Duckworth's "Grit"; "have more range" is NOT about David Epstein's "Range"). Only extract when the actual book, its author, or its thesis/content is specifically discussed
- resources: Books and purchasable items only. "context" must be 3-5 sentences answering WHO mentioned it, WHY they brought it up, and what SPECIFIC argument it supported. Do NOT describe generically. Empty array ONLY if truly none
- sponsors: All sponsors/advertisers. Empty array if none`;

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

  const whatHappened = (parsed.whatHappened || "").replace(/\\n\\n/g, "\n\n").replace(/\\n/g, "\n");

  let keyInsights: string[] = [];
  const pass2Insights = await generateKeyInsightsFromRecap(whatHappened, podcastName, episodeTitle);
  if (pass2Insights.length === 4) {
    keyInsights = pass2Insights;
  } else if (Array.isArray(parsed.keyInsights)) {
    keyInsights = parsed.keyInsights;
    console.warn(`  Using Pass 1 fallback insights`);
  }

  return {
    tldl: parsed.tldl || "",
    whatHappened,
    keyInsights,
    quote: parsed.quote,
    quoteAttribution: parsed.quoteAttribution,
    keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : [],
    topicContexts: parsed.topicContexts && typeof parsed.topicContexts === "object" ? parsed.topicContexts : {},
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
        `SELECT transcript FROM episode_transcripts WHERE podcast_id = $1 AND episode_title = $2 LIMIT 1`,
        [row.itunes_id?.toString(), row.episode_title]
      );
      if (!tRes.rows[0]?.transcript) { console.log("  ⚠ No transcript, skipping regeneration"); continue; }

      console.log(`  Transcript: ${tRes.rows[0].transcript.length} chars, generating...`);
      const recap = await generateRecap(tRes.rows[0].transcript, row.podcast_name, row.episode_title, row.show_notes);
      if (!recap) { console.log("  ✗ Failed"); continue; }

      console.log(`  ✓ ${recap.keyInsights.length} insights, ${recap.guests.length} guests, ${recap.resources.length} resources`);
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
          key_topics = $6, topic_contexts = $7, sponsors = $8, guests = $9, resources = $10
        WHERE id = $11
      `, [
        recap.tldl, recap.whatHappened, recap.keyInsights, recap.quote, recap.quoteAttribution,
        recap.keyTopics, JSON.stringify(recap.topicContexts),
        JSON.stringify(recap.sponsors), JSON.stringify(recap.guests), JSON.stringify(recap.resources), id
      ]);
      console.log("  ✓ Saved");

      try {
        await client.query(`DELETE FROM episode_quotes WHERE podcast_slug = $1 AND episode_slug = $2`, [row.slug, row.episode_slug]);
        const extractedQuotes = await extractQuotesFromTranscript(
          tRes.rows[0].transcript, row.podcast_name, row.episode_title,
          row.hosts || null,
          recap.guests ? JSON.stringify(recap.guests) : null
        );
        if (extractedQuotes.length > 0) {
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

run().catch(console.error).finally(() => process.exit(0));
