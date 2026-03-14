import pg from "pg";

const TADDY_API_URL = "https://api.taddy.org";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const DELAY_MS = 600;
const EPISODES_PER_PAGE = 25;
const MAX_PAGES = 25;
const BATCH_SIZE = 5;
const BATCH_PAUSE_MS = 10000;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  min: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

async function taddyRequest(query: string, retries = MAX_RETRIES): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(TADDY_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-USER-ID": process.env.TADDY_USER_ID!,
          "X-API-KEY": process.env.TADDY_API_KEY!,
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(60000),
      });
      if (res.status === 429) {
        const wait = Math.min(30000, RETRY_DELAY_MS * attempt * 2);
        console.log(`  Rate limited (429). Waiting ${wait / 1000}s before retry ${attempt}/${retries}...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
          continue;
        }
        throw new Error(`Taddy API error: ${res.status}`);
      }
      return res.json();
    } catch (err: any) {
      if (attempt < retries && (err.name === "TimeoutError" || err.name === "AbortError" || err.message?.includes("fetch"))) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

async function main() {
  const { rows: podcastRows } = await pool.query(`
    SELECT pd.itunes_id::text as itunes_id, pd.name, pd.taddy_uuid, pd.slug,
           COUNT(et.id) FILTER (WHERE et.complete_record IS NULL OR et.complete_record = false) as incomplete_count
    FROM podcast_directory pd
    JOIN episode_transcripts et ON et.podcast_id = pd.itunes_id::text
    WHERE pd.taddy_uuid IS NOT NULL
    GROUP BY pd.itunes_id, pd.name, pd.taddy_uuid, pd.slug
    HAVING COUNT(et.id) FILTER (WHERE et.complete_record IS NULL OR et.complete_record = false) > 0
    ORDER BY COUNT(et.id) FILTER (WHERE et.complete_record IS NULL OR et.complete_record = false) DESC
  `);

  const totalIncomplete = podcastRows.reduce((sum: number, r: any) => sum + parseInt(r.incomplete_count), 0);
  console.log(`Found ${podcastRows.length} podcasts with ${totalIncomplete} total incomplete transcripts\n`);

  for (const p of podcastRows) {
    console.log(`  ${String(p.incomplete_count).padStart(4)} incomplete | ${p.slug}`);
  }

  let globalFixed = 0;

  for (let i = 0; i < podcastRows.length; i++) {
    const p = podcastRows[i];
    console.log(`\n[${i + 1}/${podcastRows.length}] ${p.name} (${p.incomplete_count} incomplete)`);

    try {
      const { rows: incompleteEps } = await pool.query(
        `SELECT id, episode_guid, episode_title FROM episode_transcripts 
         WHERE podcast_id = $1 AND (complete_record IS NULL OR complete_record = false)`,
        [p.itunes_id]
      );

      const guidSet = new Set(incompleteEps.map((e: any) => e.episode_guid));
      const titleMap = new Map<string, number>();
      for (const e of incompleteEps) {
        if (e.episode_title) titleMap.set(e.episode_title.toLowerCase(), e.id);
      }

      let fixed = 0;
      let pagesSearched = 0;

      for (let page = 1; page <= MAX_PAGES; page++) {
        if (fixed >= incompleteEps.length) break;

        console.log(`  Fetching page ${page}...`);
        const query = `{ getPodcastSeries(uuid: "${p.taddy_uuid}") { uuid episodes(sortOrder: LATEST, limitPerPage: ${EPISODES_PER_PAGE}, page: ${page}) { uuid name description subtitle datePublished duration imageUrl audioUrl seasonNumber episodeNumber episodeType } } }`;

        let data: any;
        try {
          data = await taddyRequest(query);
        } catch (err: any) {
          console.error(`  Taddy API error on page ${page}: ${err.message}`);
          break;
        }
        const episodes = data?.data?.getPodcastSeries?.episodes;
        if (!episodes || !Array.isArray(episodes) || episodes.length === 0) {
          console.log(`  No episodes returned on page ${page}, stopping.`);
          break;
        }
        pagesSearched++;

        for (const ep of episodes) {
          const matchByGuid = guidSet.has(ep.uuid);
          const matchByTitle = ep.name && titleMap.has(ep.name.toLowerCase());

          if (matchByGuid || matchByTitle) {
            const isComplete = !!(ep.description && ep.datePublished && ep.duration && ep.audioUrl);
            try {
              await pool.query(
                `UPDATE episode_transcripts 
                 SET description = COALESCE($1, description),
                     date_published = COALESCE($2, date_published),
                     duration = COALESCE($3, duration),
                     audio_url = COALESCE($4, audio_url),
                     image_url = COALESCE($5, image_url),
                     season_number = COALESCE($6, season_number),
                     episode_number = COALESCE($7, episode_number),
                     episode_type = COALESCE($8, episode_type),
                     subtitle = COALESCE($9, subtitle),
                     fetched_at = NOW(),
                     complete_record = (transcript IS NOT NULL AND transcript != '' AND $13::boolean)
                 WHERE podcast_id = $10 AND (episode_guid = $11 OR lower(episode_title) = lower($12))`,
                [ep.description, ep.datePublished, ep.duration, ep.audioUrl, ep.imageUrl,
                 ep.seasonNumber, ep.episodeNumber, ep.episodeType, ep.subtitle,
                 p.itunes_id, ep.uuid, ep.name, isComplete]
              );
              fixed++;
              guidSet.delete(ep.uuid);
              if (ep.name) titleMap.delete(ep.name.toLowerCase());
            } catch (err: any) {
              console.error(`    DB update error for "${ep.name}": ${err.message}`);
            }
          }
        }

        if (episodes.length < EPISODES_PER_PAGE) break;
        await new Promise(r => setTimeout(r, DELAY_MS));
      }

      console.log(`  Fixed ${fixed}/${incompleteEps.length} (searched ${pagesSearched} pages)`);
      globalFixed += fixed;
    } catch (err: any) {
      console.error(`  ERROR: ${err.message}`);
      await new Promise(r => setTimeout(r, 5000));
    }

    if ((i + 1) % BATCH_SIZE === 0 && i + 1 < podcastRows.length) {
      console.log(`\n--- Batch complete. ${globalFixed} fixed so far. Pausing ${BATCH_PAUSE_MS / 1000}s... ---\n`);
      await new Promise(r => setTimeout(r, BATCH_PAUSE_MS));
    }
  }

  const { rows: finalCount } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE complete_record = true) as complete,
            COUNT(*) FILTER (WHERE complete_record IS NULL OR complete_record = false) as still_incomplete
     FROM episode_transcripts`
  );

  console.log(`\n${"=".repeat(60)}`);
  console.log(`DONE! Fixed ${globalFixed} transcripts`);
  console.log(`Complete: ${finalCount[0].complete}, Still incomplete: ${finalCount[0].still_incomplete}`);
  console.log(`${"=".repeat(60)}`);

  await pool.end();
}

main().catch(err => { console.error("Fatal:", err.message, err.stack); process.exit(1); });
