import { pool } from "./db";
import { openai } from "./replit_integrations/image/client";
import { processFullTranscript } from "./transcriptChunker";

const BOOK_SLUG = process.argv[2];
if (!BOOK_SLUG) {
  console.error("Usage: npx tsx server/generateBookInsights.ts <book-slug>");
  process.exit(1);
}

function extractLocalContext(transcript: string, bookTitle: string, windowSize: number = 2000): string[] {
  const lower = transcript.toLowerCase();
  const searchTerms = [bookTitle.toLowerCase()];
  const titleWords = bookTitle.toLowerCase().split(/\s+/);
  if (titleWords.length >= 2) {
    searchTerms.push(titleWords.slice(0, 2).join(" "));
  }
  
  const positions: number[] = [];
  for (const term of searchTerms) {
    let pos = 0;
    while ((pos = lower.indexOf(term, pos)) !== -1) {
      positions.push(pos);
      pos += term.length;
    }
  }
  
  if (positions.length === 0) return [];
  
  positions.sort((a, b) => a - b);
  const ranges: Array<{ start: number; end: number }> = [];
  
  for (const pos of positions) {
    const start = Math.max(0, pos - windowSize);
    const end = Math.min(transcript.length, pos + windowSize);
    if (ranges.length > 0 && start <= ranges[ranges.length - 1].end) {
      ranges[ranges.length - 1].end = end;
    } else {
      ranges.push({ start, end });
    }
  }
  
  return ranges.slice(0, 5).map(r => transcript.slice(r.start, r.end));
}

async function findBookRelevantSegments(transcript: string, bookTitle: string, bookAuthor: string | null): Promise<string[]> {
  const localSegments = extractLocalContext(transcript, bookTitle);
  if (localSegments.length === 0) return [];
  
  const combinedLocal = localSegments.join("\n\n---SEGMENT BREAK---\n\n");
  
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `You are an expert at finding book discussions in podcast transcripts. From the provided transcript segments around mentions of "${bookTitle}"${bookAuthor ? ` by ${bookAuthor}` : ""}, extract the meaningful discussion portions.

SKIP any segments that are:
- Ad reads or sponsor mentions (Blinkist, Audible promotions, etc.)
- Passing one-word mentions without real discussion

Return a JSON object with a "segments" array of strings. Each segment should be 100-500 words of relevant discussion. If no meaningful discussion exists, return {"segments": []}.`
      },
      {
        role: "user",
        content: combinedLocal.slice(0, 30000)
      }
    ],
    response_format: { type: "json_object" },
  });
  const { logCompletionUsage } = await import("./apiUsageTracker");
  logCompletionUsage(completion, "gpt-4o-mini", "book_segment_extraction");

  try {
    const parsed = JSON.parse(completion.choices[0].message.content || "{}");
    const segments = parsed.segments || [];
    if (Array.isArray(segments)) return segments.filter((s: unknown) => typeof s === 'string' && s.length > 50);
  } catch {}
  return [];
}

async function generateInsight(bookTitle: string, bookAuthor: string | null, podcastName: string, episodeTitle: string, segments: string[]): Promise<string> {
  const combinedSegments = segments.join("\n\n---\n\n");
  
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: `You write editorial-quality "Why they talked about it" summaries for a podcast intelligence platform called PodRise. Your job is to distill WHY a book came up in a podcast conversation and what angle the hosts/guests took.

STYLE RULES:
- Write in third person, present tense ("Rogan and Musk used...", "The hosts framed...")
- Use the hosts'/guests' actual names from the transcript
- Lead with the specific angle or argument they took — not a generic summary
- Include 1-2 specific ideas, concepts, or frameworks from the book they connected to
- Bold the single most interesting claim or connection using <strong> tags
- Keep it 80-150 words — dense and editorial, not fluffy
- Never mention that this is a podcast or that it was discussed on a podcast (the reader already knows)
- Don't use phrases like "In this episode" or "The podcast explores"

EXAMPLE:
"Rogan and Musk used 1984 as the lens for a long conversation about modern censorship and platform power. The central argument: Orwell didn't write fiction — he wrote a <strong>warning about information control</strong> that Big Tech has quietly made real. They connected the book's concept of Newspeak — reducing language to limit thought — directly to how social media platforms narrow what ideas are amplifiable."

Write one paragraph. No bullet points. No headers.`
      },
      {
        role: "user",
        content: `Book: "${bookTitle}"${bookAuthor ? ` by ${bookAuthor}` : ""}
Podcast: ${podcastName}
Episode: ${episodeTitle}

Relevant transcript segments:
${combinedSegments}`
      }
    ],
  });
  const { logCompletionUsage: logInsight } = await import("./apiUsageTracker");
  logInsight(completion, "gpt-4o-mini", "book_insight_generation");

  return (completion.choices[0].message.content || "").trim();
}

async function main() {
  console.log(`\n📖 Generating book insights for: ${BOOK_SLUG}\n`);

  const bookResult = await pool.query(
    `SELECT book_key, book_title, author FROM book_enrichments WHERE slug = $1`,
    [BOOK_SLUG]
  );
  if (bookResult.rows.length === 0) {
    console.error(`Book not found with slug: ${BOOK_SLUG}`);
    process.exit(1);
  }
  const book = bookResult.rows[0];
  console.log(`Found: "${book.book_title}" by ${book.author || "unknown"}`);

  const aliasResult = await pool.query(
    `SELECT alias_key FROM book_aliases WHERE canonical_key = $1`,
    [book.book_key]
  );
  const bookKeyVariants = new Set([book.book_key, ...(aliasResult.rows.map((r: any) => r.alias_key))]);

  const episodeResult = await pool.query(
    `SELECT lpr.slug as podcast_slug, lpr.episode_slug, lpr.episode_title, lpr.resources, lpr.itunes_id,
            pd.name as podcast_name
     FROM landing_page_recaps lpr
     JOIN podcast_directory pd ON pd.slug = lpr.slug
     WHERE lpr.resources IS NOT NULL AND lpr.resources::text != '[]'
       AND lpr.resources::text ILIKE $1`,
    [`%${book.book_key.replace(/[%_]/g, '\\$&')}%`]
  );

  const AD_PATTERNS = [
    /\bavailable on blinkist\b/i,
    /\bmentioned as a book available on\b/i,
    /\bavailable on audible\b/i,
    /\bfor quick learning\b/i,
    /\bsponsored by\b/i,
    /\bbrought to you by\b/i,
  ];

  const validEpisodes: any[] = [];
  for (const row of episodeResult.rows) {
    let resources: any[];
    try {
      const parsed = typeof row.resources === 'string' ? JSON.parse(row.resources) : row.resources;
      if (!Array.isArray(parsed)) continue;
      resources = parsed;
    } catch { continue; }

    let found = false;
    for (const r of resources) {
      if (!r || r.type !== 'book' || !r.name) continue;
      const rKey = r.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      if (bookKeyVariants.has(rKey)) {
        const ctx = r.context || "";
        if (!AD_PATTERNS.some(p => p.test(ctx))) {
          found = true;
          break;
        }
      }
    }
    if (found) validEpisodes.push(row);
  }

  console.log(`Found ${validEpisodes.length} genuine episodes (filtered ads)\n`);

  const existingInsights = await pool.query(
    `SELECT episode_slug FROM book_insights WHERE book_key = $1`,
    [book.book_key]
  );
  const existingSlugs = new Set(existingInsights.rows.map((r: any) => r.episode_slug));

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const ep of validEpisodes) {
    if (existingSlugs.has(ep.episode_slug)) {
      console.log(`  ⏭️  Skipping (already exists): ${ep.episode_title}`);
      skipped++;
      continue;
    }

    const transcriptResult = await pool.query(
      `SELECT et.transcript FROM episode_transcripts et
       WHERE et.podcast_id::text = $1 AND et.episode_title = $2
       LIMIT 1`,
      [ep.itunes_id?.toString(), ep.episode_title]
    );

    if (transcriptResult.rows.length === 0 || !transcriptResult.rows[0].transcript) {
      console.log(`  ⚠️  No transcript: ${ep.episode_title}`);
      failed++;
      continue;
    }

    const transcript = transcriptResult.rows[0].transcript;
    console.log(`  🔍 Processing: ${ep.episode_title} (${(transcript.length / 1000).toFixed(0)}k chars)`);

    try {
      const segments = await findBookRelevantSegments(transcript, book.book_title, book.author);
      
      if (segments.length === 0) {
        console.log(`     ❌ No meaningful book discussion found in transcript`);
        failed++;
        continue;
      }

      console.log(`     Found ${segments.length} relevant segment(s), generating insight...`);
      const insight = await generateInsight(book.book_title, book.author, ep.podcast_name, ep.episode_title, segments);

      if (insight.length < 50) {
        console.log(`     ❌ Insight too short, skipping`);
        failed++;
        continue;
      }

      await pool.query(
        `INSERT INTO book_insights (book_key, episode_slug, podcast_slug, insight) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (book_key, episode_slug) DO UPDATE SET insight = $4, created_at = NOW()`,
        [book.book_key, ep.episode_slug, ep.podcast_slug, insight]
      );

      console.log(`     ✅ Saved insight (${insight.length} chars)`);
      generated++;
    } catch (err: any) {
      console.error(`     ❌ Error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${generated} generated, ${skipped} skipped, ${failed} failed\n`);
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
