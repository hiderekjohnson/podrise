import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  min: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

async function main() {
  console.log("Normalizing Unicode characters in episode_transcripts.episode_title...\n");

  const { rows: beforeCount } = await pool.query(`
    SELECT COUNT(*) as total,
           COUNT(*) FILTER (WHERE episode_title ~ E'[\\u2014\\u2013\\u2018\\u2019\\u201C\\u201D\\u2026\\u02BC]') as unicode_titles
    FROM episode_transcripts
  `);
  console.log(`Total transcripts: ${beforeCount[0].total}`);
  console.log(`Titles with Unicode punctuation: ${beforeCount[0].unicode_titles}\n`);

  if (parseInt(beforeCount[0].unicode_titles) === 0) {
    console.log("No titles need normalization. Done!");
    await pool.end();
    return;
  }

  const result = await pool.query(`
    UPDATE episode_transcripts
    SET episode_title = TRIM(REGEXP_REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(
                    REPLACE(episode_title, E'\\u2014', ' - '),
                  E'\\u2013', '-'),
                E'\\u2018', ''''),
              E'\\u2019', ''''),
            E'\\u02BC', ''''),
          E'\\u201C', '"'),
        E'\\u201D', '"'),
      E'\\u2026', '...'),
    '\\s+', ' ', 'g'))
    WHERE episode_title ~ E'[\\u2014\\u2013\\u2018\\u2019\\u201C\\u201D\\u2026\\u02BC]'
    RETURNING id, episode_title
  `);

  console.log(`Updated ${result.rowCount} transcript titles.\n`);

  if (result.rows.length <= 20) {
    for (const row of result.rows) {
      console.log(`  ID ${row.id}: "${row.episode_title.slice(0, 80)}"`);
    }
  } else {
    for (const row of result.rows.slice(0, 10)) {
      console.log(`  ID ${row.id}: "${row.episode_title.slice(0, 80)}"`);
    }
    console.log(`  ... and ${result.rows.length - 10} more`);
  }

  const { rows: afterCount } = await pool.query(`
    SELECT COUNT(*) FILTER (WHERE episode_title ~ E'[\\u2014\\u2013\\u2018\\u2019\\u201C\\u201D\\u2026\\u02BC]') as remaining
    FROM episode_transcripts
  `);
  console.log(`\nRemaining titles with Unicode punctuation: ${afterCount[0].remaining}`);

  const NORM = (col: string) =>
    `LOWER(TRIM(REGEXP_REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${col}, E'\\u2014', ' - '), E'\\u2013', '-'), E'\\u2018', ''''), E'\\u2019', ''''), E'\\u02BC', ''''), E'\\u201C', '"'), E'\\u201D', '"'), E'\\u2026', '...'), '\\s+', ' ', 'g')))`;

  const { rows: matchCheck } = await pool.query(`
    SELECT COUNT(*) as matched
    FROM landing_page_recaps r
    JOIN podcast_directory pd ON pd.slug = r.slug
    WHERE r.itunes_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM episode_transcripts t
        WHERE t.podcast_id = pd.itunes_id::text
          AND ${NORM('t.episode_title')} = ${NORM('r.episode_title')}
      )
  `);
  const { rows: totalRecaps } = await pool.query(`
    SELECT COUNT(*) as total FROM landing_page_recaps WHERE itunes_id IS NOT NULL
  `);
  console.log(`\nRecaps with matching transcripts: ${matchCheck[0].matched} / ${totalRecaps[0].total}`);

  console.log("\nDone!");
  await pool.end();
}

main().catch(err => { console.error("Fatal:", err.message, err.stack); process.exit(1); });
