import { pool } from "./db";

let state = {
  running: false,
  phase: "",
  processed: 0,
  total: 0,
  fixed: 0,
  errors: 0,
  log: [] as string[],
};

export function getPodcastBackfillProgress() {
  return { ...state, log: state.log.slice(-30) };
}

export function stopPodcastBackfill() {
  state.running = false;
}

function logMsg(msg: string) {
  console.log(`[PodcastBackfill] ${msg}`);
  state.log.push(`${new Date().toISOString().slice(11, 19)} ${msg}`);
  if (state.log.length > 100) state.log = state.log.slice(-50);
}

export async function startPodcastMetadataBackfill() {
  if (state.running) return;
  state = { running: true, phase: "ai_metadata", processed: 0, total: 0, fixed: 0, errors: 0, log: [] };
  logMsg("Starting podcast metadata backfill via AI");

  try {
    const { rows } = await pool.query(`
      SELECT id, itunes_id, slug, name, hosts, description, category, artwork_url,
        about_podcast, known_for, host_bios, frequency, total_episodes, year_started,
        website_url, twitter_handle
      FROM podcast_directory
      WHERE status = 'published'
        AND (
          about_podcast IS NULL OR about_podcast = ''
          OR known_for IS NULL OR array_length(known_for, 1) IS NULL
          OR frequency IS NULL OR frequency = ''
          OR year_started IS NULL
        )
      ORDER BY id
    `);

    state.total = rows.length;
    logMsg(`Found ${rows.length} podcasts needing metadata enrichment`);

    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    for (const podcast of rows) {
      if (!state.running) break;

      try {
        const sampleEps = await pool.query(`
          SELECT episode_title, show_notes
          FROM landing_page_recaps
          WHERE itunes_id = $1 AND show_notes IS NOT NULL AND show_notes != ''
          ORDER BY publish_date DESC LIMIT 5
        `, [podcast.itunes_id]);

        const episodeContext = sampleEps.rows.map((e: any) =>
          `- ${e.episode_title}: ${(e.show_notes || '').slice(0, 200)}`
        ).join('\n');

        const prompt = `You are enriching metadata for a podcast. Based on the info below, fill in any missing fields.

Podcast: ${podcast.name}
Hosts: ${podcast.hosts || 'Unknown'}
Category: ${podcast.category || 'Unknown'}
Description: ${podcast.description || 'None'}
${episodeContext ? `\nRecent episodes:\n${episodeContext}` : ''}

Return a JSON object with ONLY these fields (omit any you can't determine):
- aboutPodcast: 2-3 sentence description of the podcast's focus and style
- knownFor: array of 3-5 things this podcast is known for
- frequency: episode frequency like "weekly", "twice weekly", "daily", etc.
- yearStarted: estimated year the podcast started (integer), only if you're confident
- category: best category if current one seems wrong or missing (e.g. "Business", "Tech", "Comedy", "Health", etc.)

Return ONLY valid JSON, no markdown.`;

        const resp = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 500,
        });

        const text = (resp.choices[0]?.message?.content || "").trim();
        let parsed: any;
        try {
          parsed = JSON.parse(text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
        } catch {
          state.errors++;
          logMsg(`Parse error for "${podcast.name}"`);
          state.processed++;
          continue;
        }

        const updates: string[] = [];
        const params: any[] = [podcast.id];
        let idx = 2;

        if (!podcast.about_podcast && parsed.aboutPodcast) {
          updates.push(`about_podcast = $${idx++}`);
          params.push(parsed.aboutPodcast);
        }
        if ((!podcast.known_for || podcast.known_for.length === 0) && parsed.knownFor?.length > 0) {
          updates.push(`known_for = $${idx++}`);
          params.push(parsed.knownFor);
        }
        if (!podcast.frequency && parsed.frequency) {
          updates.push(`frequency = $${idx++}`);
          params.push(parsed.frequency);
        }
        if (!podcast.year_started && parsed.yearStarted && typeof parsed.yearStarted === 'number') {
          updates.push(`year_started = $${idx++}`);
          params.push(parsed.yearStarted);
        }
        if (!podcast.category && parsed.category) {
          updates.push(`category = $${idx++}`);
          params.push(parsed.category);
        }

        if (updates.length > 0) {
          updates.push(`updated_at = NOW()`);
          await pool.query(
            `UPDATE podcast_directory SET ${updates.join(", ")} WHERE id = $1`,
            params
          );
          state.fixed++;
          logMsg(`Enriched "${podcast.name}" (${updates.length - 1} fields)`);
        }
      } catch (err: any) {
        state.errors++;
        logMsg(`Error for "${podcast.name}": ${err.message?.slice(0, 100)}`);
      }

      state.processed++;
      await new Promise(r => setTimeout(r, 500));
    }

    logMsg(`Podcast metadata backfill complete: ${state.fixed} fixed, ${state.errors} errors`);

    if (state.running) {
      state.phase = "related_slugs";
      await computeRelatedSlugs();
    }
  } catch (err: any) {
    logMsg(`Fatal error: ${err.message}`);
  }

  state.running = false;
  state.phase = "complete";
}

async function computeRelatedSlugs() {
  logMsg("=== Phase 2: Computing Related Podcasts ===");

  const { rows: podcasts } = await pool.query(`
    SELECT id, slug, name, category, description, hosts, keywords
    FROM podcast_directory
    WHERE status = 'published' AND slug IS NOT NULL
    ORDER BY id
  `);

  logMsg(`Computing related slugs for ${podcasts.length} podcasts`);
  state.total += podcasts.length;

  const categoryMap = new Map<string, string[]>();
  for (const p of podcasts) {
    if (p.category) {
      const cats = p.category.split(/[,&\/]/).map((c: string) => c.trim().toLowerCase());
      for (const cat of cats) {
        if (!categoryMap.has(cat)) categoryMap.set(cat, []);
        categoryMap.get(cat)!.push(p.slug);
      }
    }
  }

  const guestOverlap = new Map<string, Map<string, number>>();
  const { rows: guestData } = await pool.query(`
    SELECT slug, guests FROM landing_page_recaps
    WHERE guests IS NOT NULL AND guests != '' AND guests != '[]'
  `);

  const podcastGuests = new Map<string, Set<string>>();
  for (const row of guestData) {
    let guests: any[] = [];
    try {
      const parsed = typeof row.guests === 'string' ? JSON.parse(row.guests) : (row.guests || []);
      guests = Array.isArray(parsed) ? parsed : [];
    } catch {}
    const guestNames = guests.map((g: any) => {
      const name = typeof g === 'string' ? g : g?.name;
      return name?.toLowerCase()?.trim();
    }).filter(Boolean);

    if (!podcastGuests.has(row.slug)) podcastGuests.set(row.slug, new Set());
    for (const g of guestNames) podcastGuests.get(row.slug)!.add(g);
  }

  for (const podcast of podcasts) {
    if (!state.running) break;

    try {
      const scores = new Map<string, number>();

      const cats = (podcast.category || '').split(/[,&\/]/).map((c: string) => c.trim().toLowerCase()).filter(Boolean);
      for (const cat of cats) {
        const siblings = categoryMap.get(cat) || [];
        for (const sib of siblings) {
          if (sib !== podcast.slug) {
            scores.set(sib, (scores.get(sib) || 0) + 3);
          }
        }
      }

      const myGuests = podcastGuests.get(podcast.slug) || new Set();
      if (myGuests.size > 0) {
        for (const [otherSlug, otherGuests] of podcastGuests) {
          if (otherSlug === podcast.slug) continue;
          let overlap = 0;
          for (const g of myGuests) {
            if (otherGuests.has(g)) overlap++;
          }
          if (overlap > 0) {
            scores.set(otherSlug, (scores.get(otherSlug) || 0) + overlap * 2);
          }
        }
      }

      const related = Array.from(scores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([slug]) => slug);

      if (related.length > 0) {
        await pool.query(
          `UPDATE podcast_directory SET related_slugs = $1::text[], updated_at = NOW() WHERE id = $2`,
          [related, podcast.id]
        );
        state.fixed++;
      }
    } catch (err: any) {
      state.errors++;
    }

    state.processed++;
    if (state.processed % 50 === 0) {
      logMsg(`Related slugs: ${state.processed} processed, ${state.fixed} updated`);
    }
  }

  logMsg(`Related slugs phase done`);
}
