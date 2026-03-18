import { pool } from "./db";

let backfillState = {
  running: false,
  phase: "" as string,
  processed: 0,
  total: 0,
  fixed: 0,
  errors: 0,
  log: [] as string[],
};

export function getBackfillProgress() {
  return { ...backfillState, log: backfillState.log.slice(-30) };
}

function logMsg(msg: string) {
  console.log(`[EpisodeBackfill] ${msg}`);
  backfillState.log.push(`${new Date().toISOString().slice(11, 19)} ${msg}`);
  if (backfillState.log.length > 100) backfillState.log = backfillState.log.slice(-50);
}

async function lookupAppleEpisodeUrl(itunesId: string, episodeTitle: string): Promise<string | null> {
  try {
    const url = `https://itunes.apple.com/lookup?id=${itunesId}&media=podcast&entity=podcastEpisode&limit=200`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const results = data.results || [];
    const titleLower = episodeTitle.toLowerCase().trim();
    for (const ep of results) {
      if (ep.wrapperType === "podcastEpisode") {
        const epTitle = (ep.trackName || "").toLowerCase().trim();
        if (epTitle === titleLower || epTitle.includes(titleLower) || titleLower.includes(epTitle)) {
          return ep.trackViewUrl || ep.collectionViewUrl || null;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

let activeDateRange: { from: string; to: string } | undefined;

async function backfillAppleEpisodeUrls() {
  logMsg("=== Phase 1: Apple Episode URLs, Audio URLs & Show Notes ===");
  const dateFilter = activeDateRange ? ` AND publish_date >= '${activeDateRange.from}' AND publish_date <= '${activeDateRange.to}'` : '';
  const { rows } = await pool.query(`
    SELECT id, slug, itunes_id, episode_title, apple_episode_url, audio_url, show_notes
    FROM landing_page_recaps 
    WHERE itunes_id IS NOT NULL AND itunes_id != ''
      AND (
        (apple_episode_url IS NULL OR apple_episode_url = '')
        OR (audio_url IS NULL OR audio_url = '')
        OR (show_notes IS NULL OR show_notes = '')
      )${dateFilter}
    ORDER BY slug, id
  `);
  backfillState.total = rows.length;
  backfillState.processed = 0;
  logMsg(`Found ${rows.length} episodes missing Apple URL, audio URL, or show notes`);

  const byPodcast: Record<string, typeof rows> = {};
  for (const r of rows) {
    if (!byPodcast[r.itunes_id]) byPodcast[r.itunes_id] = [];
    byPodcast[r.itunes_id].push(r);
  }

  for (const [itunesId, episodes] of Object.entries(byPodcast)) {
    if (!backfillState.running) break;
    try {
      const url = `https://itunes.apple.com/lookup?id=${itunesId}&media=podcast&entity=podcastEpisode&limit=200`;
      const resp = await fetch(url);
      if (!resp.ok) {
        logMsg(`Apple API error for itunes_id ${itunesId}: ${resp.status}`);
        backfillState.processed += episodes.length;
        continue;
      }
      const data = await resp.json();
      const appleEps = (data.results || []).filter((r: any) => r.wrapperType === "podcastEpisode");

      for (const ep of episodes) {
        const titleLower = ep.episode_title.toLowerCase().trim();
        let matched: any = null;

        for (const appleEp of appleEps) {
          const appleTitle = (appleEp.trackName || "").toLowerCase().trim();
          if (appleTitle === titleLower || appleTitle.includes(titleLower) || titleLower.includes(appleTitle)) {
            matched = appleEp;
            break;
          }
        }

        if (matched) {
          const updates: string[] = [];
          const params: any[] = [ep.id];
          let paramIdx = 2;

          if (!ep.apple_episode_url) {
            const appleUrl = matched.trackViewUrl || matched.collectionViewUrl;
            if (appleUrl) {
              updates.push(`apple_episode_url = $${paramIdx}`);
              params.push(appleUrl);
              paramIdx++;
            }
          }

          if (!ep.audio_url && matched.episodeUrl) {
            updates.push(`audio_url = $${paramIdx}`);
            params.push(matched.episodeUrl);
            paramIdx++;
          }

          if (!ep.show_notes && matched.description) {
            updates.push(`show_notes = $${paramIdx}`);
            params.push(matched.description);
            paramIdx++;
          }

          if (updates.length > 0) {
            await pool.query(
              `UPDATE landing_page_recaps SET ${updates.join(", ")} WHERE id = $1`,
              params
            );
            backfillState.fixed++;
          }
        }
        backfillState.processed++;
      }

      await new Promise(r => setTimeout(r, 300));
    } catch (err: any) {
      logMsg(`Error for itunes_id ${itunesId}: ${err.message}`);
      backfillState.errors++;
      backfillState.processed += episodes.length;
    }
  }
  logMsg(`Apple phase done: ${backfillState.fixed} episodes fixed out of ${rows.length}`);
}

async function backfillSpotifyUrls() {
  logMsg("=== Phase 2: Spotify Episode URLs ===");
  const dateFilter = activeDateRange ? ` AND publish_date >= '${activeDateRange.from}' AND publish_date <= '${activeDateRange.to}'` : '';
  const { rows } = await pool.query(`
    SELECT id, slug, episode_title, podcast_name
    FROM landing_page_recaps
    WHERE (spotify_episode_url IS NULL OR spotify_episode_url = '')${dateFilter}
    ORDER BY id DESC LIMIT 500
  `);
  logMsg(`Found ${rows.length} episodes missing Spotify URLs`);
  backfillState.total += rows.length;

  const { searchSpotifyEpisode } = await import("./spotifyClient");
  for (const row of rows) {
    if (!backfillState.running) break;
    try {
      const url = await searchSpotifyEpisode(row.podcast_name, row.episode_title);
      if (url) {
        await pool.query(`UPDATE landing_page_recaps SET spotify_episode_url = $1 WHERE id = $2`, [url, row.id]);
        backfillState.fixed++;
        logMsg(`Spotify URL found for "${row.episode_title.slice(0, 50)}"`);
      }
    } catch (err: any) {
      backfillState.errors++;
    }
    backfillState.processed++;
    await new Promise(r => setTimeout(r, 300));
  }
  logMsg(`Spotify phase done: ${backfillState.fixed} total fixed`);
}

async function backfillAIFields() {
  logMsg("=== Phase 3: AI-Generated Fields (sponsors, guests, resources, questions) ===");
  
  const dateFilter = activeDateRange ? ` AND r.publish_date >= '${activeDateRange.from}' AND r.publish_date <= '${activeDateRange.to}'` : '';
  const { rows } = await pool.query(`
    SELECT r.id, r.slug, r.episode_title, r.podcast_name, r.show_notes, r.itunes_id,
      CASE WHEN (r.sponsors IS NULL OR r.sponsors = '' OR r.sponsors = '[]') THEN 1 ELSE 0 END as missing_sponsors,
      CASE WHEN (r.guests IS NULL OR r.guests = '' OR r.guests = '[]') THEN 1 ELSE 0 END as missing_guests,
      CASE WHEN (r.resources IS NULL OR r.resources = '' OR r.resources = '[]') THEN 1 ELSE 0 END as missing_resources,
      CASE WHEN (r.top_questions IS NULL OR r.top_questions = '' OR r.top_questions = '[]') THEN 1 ELSE 0 END as missing_questions,
      CASE WHEN (r.topic_contexts IS NULL OR r.topic_contexts = '') THEN 1 ELSE 0 END as missing_topic_ctx
    FROM landing_page_recaps r
    WHERE ((r.sponsors IS NULL OR r.sponsors = '' OR r.sponsors = '[]')
       OR (r.guests IS NULL OR r.guests = '' OR r.guests = '[]')
       OR (r.resources IS NULL OR r.resources = '' OR r.resources = '[]')
       OR (r.top_questions IS NULL OR r.top_questions = '' OR r.top_questions = '[]')
       OR (r.topic_contexts IS NULL OR r.topic_contexts = ''))${dateFilter}
    ORDER BY r.id DESC
    LIMIT 2000
  `);

  logMsg(`Found ${rows.length} episodes missing AI fields (processing batch of up to 2000)`);
  backfillState.total += rows.length;

  for (const row of rows) {
    if (!backfillState.running) break;
    
    try {
      const { rows: transcriptRows } = await pool.query(`
        SELECT transcript FROM episode_transcripts
        WHERE podcast_id = $1 AND LOWER(TRIM(episode_title)) = LOWER(TRIM($2))
        LIMIT 1
      `, [row.itunes_id, row.episode_title]);

      if (!transcriptRows[0]?.transcript) {
        backfillState.processed++;
        await new Promise(r => setTimeout(r, 50));
        continue;
      }

      const transcript = transcriptRows[0].transcript;

      const { generateRecapFromFullTranscript } = await import("./recapGenerator");
      const recap = await generateRecapFromFullTranscript(
        transcript,
        row.podcast_name,
        row.episode_title,
        row.show_notes || null
      );

      if (recap) {
        const updates: string[] = [];
        const params: any[] = [row.id];
        let paramIdx = 2;

        if (row.missing_sponsors === 1 && recap.sponsors && recap.sponsors.length > 0) {
          updates.push(`sponsors = $${paramIdx}`);
          params.push(JSON.stringify(recap.sponsors));
          paramIdx++;
        }
        if (row.missing_guests === 1 && recap.guests && recap.guests.length > 0) {
          updates.push(`guests = $${paramIdx}`);
          params.push(JSON.stringify(recap.guests));
          paramIdx++;
        }
        if (row.missing_resources === 1 && recap.resources && recap.resources.length > 0) {
          updates.push(`resources = $${paramIdx}`);
          params.push(JSON.stringify(recap.resources));
          paramIdx++;
        }
        if (row.missing_questions === 1 && recap.topQuestions && recap.topQuestions.length > 0) {
          updates.push(`top_questions = $${paramIdx}`);
          params.push(JSON.stringify(recap.topQuestions));
          paramIdx++;
        }
        if (row.missing_topic_ctx === 1 && recap.topicContexts) {
          updates.push(`topic_contexts = $${paramIdx}`);
          params.push(JSON.stringify(recap.topicContexts));
          paramIdx++;
        }

        if (updates.length > 0) {
          await pool.query(
            `UPDATE landing_page_recaps SET ${updates.join(", ")} WHERE id = $1`,
            params
          );
          backfillState.fixed++;
          logMsg(`Fixed AI fields for "${row.episode_title}" (${updates.length} fields)`);
        }
      }
    } catch (err: any) {
      logMsg(`AI error for ep ${row.id}: ${err.message?.slice(0, 100)}`);
      backfillState.errors++;
    }

    backfillState.processed++;
    await new Promise(r => setTimeout(r, 500));
  }

  logMsg(`AI fields done: ${backfillState.fixed} total fixed`);
}

async function backfillQuotes() {
  logMsg("=== Phase 4: Episode Quotes ===");

  const dateFilter = activeDateRange ? ` AND r.publish_date >= '${activeDateRange.from}' AND r.publish_date <= '${activeDateRange.to}'` : '';
  const { rows } = await pool.query(`
    SELECT r.id, r.slug, r.episode_slug, r.episode_title, r.itunes_id, r.podcast_name, r.show_notes
    FROM landing_page_recaps r
    LEFT JOIN episode_quotes eq ON eq.podcast_slug = r.slug AND eq.episode_slug = r.episode_slug
    WHERE eq.id IS NULL${dateFilter}
    ORDER BY r.id DESC
    LIMIT 2000
  `);

  logMsg(`Found ${rows.length} episodes missing quotes (processing batch of up to 2000)`);
  backfillState.total += rows.length;

  for (const row of rows) {
    if (!backfillState.running) break;

    try {
      const { rows: transcriptRows } = await pool.query(`
        SELECT transcript FROM episode_transcripts
        WHERE podcast_id = $1 AND LOWER(TRIM(episode_title)) = LOWER(TRIM($2))
        LIMIT 1
      `, [row.itunes_id, row.episode_title]);

      if (!transcriptRows[0]?.transcript) {
        backfillState.processed++;
        await new Promise(r => setTimeout(r, 50));
        continue;
      }

      const transcript = transcriptRows[0].transcript;

      const { generateRecapFromFullTranscript } = await import("./recapGenerator");
      const recap = await generateRecapFromFullTranscript(
        transcript,
        row.podcast_name,
        row.episode_title,
        row.show_notes || null
      );

      if (recap?.extractedQuotes && recap.extractedQuotes.length > 0) {
        for (const q of recap.extractedQuotes) {
          await pool.query(
            `INSERT INTO episode_quotes (podcast_slug, episode_slug, quote_text, speaker, context, category)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT DO NOTHING`,
            [row.slug, row.episode_slug, q.text, q.speaker || null, q.context || null, q.category || "general"]
          );
        }
        backfillState.fixed++;
        logMsg(`Added ${recap.extractedQuotes.length} quotes for "${row.episode_title}"`);
      }
    } catch (err: any) {
      logMsg(`Quotes error for ep ${row.id}: ${err.message?.slice(0, 100)}`);
      backfillState.errors++;
    }

    backfillState.processed++;
    await new Promise(r => setTimeout(r, 500));
  }

  logMsg(`Quotes done: ${backfillState.fixed} total fixed`);
}

export async function runEpisodeBackfill(phases: string[] = ["apple", "ai", "quotes"], dateRange?: { from: string; to: string }) {
  if (backfillState.running) {
    throw new Error("Backfill already running");
  }

  activeDateRange = dateRange;
  backfillState = { running: true, phase: "starting", processed: 0, total: 0, fixed: 0, errors: 0, log: [] };
  logMsg(`Starting episode backfill — phases: ${phases.join(", ")}${dateRange ? `, date range: ${dateRange.from} to ${dateRange.to}` : ''}`);

  try {
    if (phases.includes("apple")) {
      backfillState.phase = "apple_urls";
      await backfillAppleEpisodeUrls();
    }

    if (phases.includes("spotify") && backfillState.running) {
      backfillState.phase = "spotify_urls";
      await backfillSpotifyUrls();
    }

    if (phases.includes("ai") && backfillState.running) {
      backfillState.phase = "ai_fields";
      await backfillAIFields();
    }

    if (phases.includes("quotes") && backfillState.running) {
      backfillState.phase = "quotes";
      await backfillQuotes();
    }

    backfillState.phase = "complete";
    logMsg(`=== Backfill complete: ${backfillState.fixed} fixes, ${backfillState.errors} errors ===`);
  } catch (err: any) {
    logMsg(`Fatal error: ${err.message}`);
    backfillState.phase = "error";
  } finally {
    backfillState.running = false;
  }
}

export function stopEpisodeBackfill() {
  backfillState.running = false;
  logMsg("Backfill stop requested");
}
