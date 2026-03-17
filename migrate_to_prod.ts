import pg from "pg";

const devPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const PROD_URL = "https://podcap.io";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!;
let COOKIE = "";

async function adminLogin(): Promise<void> {
  const resp = await fetch(`${PROD_URL}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error("Login failed: " + text);
  const cookies = resp.headers.getSetCookie();
  const sid = cookies.find(c => c.startsWith("connect.sid="));
  if (!sid) throw new Error("No session cookie returned");
  COOKIE = sid.split(";")[0];
  console.log("Authenticated with production");
}

async function execBatchOnProd(items: { query: string; params: any[] }[]): Promise<{ inserted: number; errors: number }> {
  try {
    const resp = await fetch(`${PROD_URL}/api/admin/migrate-exec`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: COOKIE },
      body: JSON.stringify({ batch: items }),
    });
    if (!resp.ok) return { inserted: 0, errors: items.length };
    return await resp.json();
  } catch {
    return { inserted: 0, errors: items.length };
  }
}

async function migrateSmallTable(
  tableName: string,
  selectQuery: string,
  insertQuery: string,
  mapRow: (row: any) => any[],
  httpBatchSize: number = 50
) {
  const { rows } = await devPool.query(selectQuery);
  console.log(`\n=== ${tableName}: ${rows.length} rows ===`);
  let totalInserted = 0, totalErrors = 0;
  for (let i = 0; i < rows.length; i += httpBatchSize) {
    const chunk = rows.slice(i, i + httpBatchSize);
    const items = chunk.map(row => ({ query: insertQuery, params: mapRow(row) }));
    const { inserted, errors } = await execBatchOnProd(items);
    totalInserted += inserted;
    totalErrors += errors;
    process.stdout.write(`  ${Math.min(i + httpBatchSize, rows.length)}/${rows.length} (${totalInserted} new)\r`);
  }
  console.log(`  Done: ${totalInserted} inserted, ${totalErrors} skipped/exist           `);
}

async function migrateLargeTable(
  tableName: string,
  countQuery: string,
  selectQuery: string,
  insertQuery: string,
  mapRow: (row: any) => any[],
  dbBatchSize: number = 500,
  httpBatchSize: number = 50
) {
  const total = parseInt((await devPool.query(countQuery)).rows[0].cnt);
  console.log(`\n=== ${tableName}: ${total} rows ===`);
  let offset = 0, totalInserted = 0, totalErrors = 0;
  const startTime = Date.now();
  while (offset < total) {
    const { rows } = await devPool.query(`${selectQuery} LIMIT $1 OFFSET $2`, [dbBatchSize, offset]);
    if (rows.length === 0) break;
    for (let i = 0; i < rows.length; i += httpBatchSize) {
      const chunk = rows.slice(i, i + httpBatchSize);
      const items = chunk.map(row => ({ query: insertQuery, params: mapRow(row) }));
      const { inserted, errors } = await execBatchOnProd(items);
      totalInserted += inserted;
      totalErrors += errors;
    }
    offset += rows.length;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = offset / elapsed;
    const eta = Math.round((total - offset) / rate);
    process.stdout.write(`  ${offset}/${total} (${totalInserted} new, ${totalErrors} skip) ~${eta}s left\r`);
  }
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`  Done: ${totalInserted} inserted, ${totalErrors} skipped in ${elapsed}s          `);
}

async function main() {
  const tableArg = process.argv[2];
  await adminLogin();
  console.log("\n========== MIGRATION ==========");
  console.log(`Started at: ${new Date().toISOString()}`);
  if (tableArg) console.log(`Running single table: ${tableArg}`);

  if (!tableArg || tableArg === "podcast_directory") {
    const pdCols = ["id","itunes_id","name","twitter_handle","host_handle","followers","created_at","updated_at","slug","hosts","category","description","keywords","faq_topics","artwork_url","apple_url","spotify_url","youtube_url","avg_episode_length","frequency","total_episodes","year_started","known_for","host_bios","related_slugs","about_podcast","has_landing_page","taddy_uuid","instagram_url","tiktok_url","facebook_url","discord_url","website_url","store_url","apple_rating","apple_rating_count"];
    await migrateSmallTable(
      "podcast_directory",
      `SELECT ${pdCols.join(",")} FROM podcast_directory ORDER BY id`,
      `INSERT INTO podcast_directory (${pdCols.join(",")}) VALUES (${pdCols.map((_, i) => `$${i + 1}`).join(",")}) ON CONFLICT (id) DO NOTHING`,
      (r) => pdCols.map(c => r[c]),
    );
  }

  if (!tableArg || tableArg === "book_enrichments") {
    await migrateSmallTable(
      "book_enrichments",
      `SELECT book_key, book_title, slug, author, description, asin, isbn, google_books_id, has_cover, cover_approved, podcast_buzz, topics, page_count, publish_year, rating FROM book_enrichments ORDER BY id`,
      `INSERT INTO book_enrichments (book_key, book_title, slug, author, description, asin, isbn, google_books_id, has_cover, cover_approved, podcast_buzz, topics, page_count, publish_year, rating) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (book_key) DO NOTHING`,
      (r) => [r.book_key, r.book_title, r.slug, r.author, r.description, r.asin, r.isbn, r.google_books_id, r.has_cover, r.cover_approved, r.podcast_buzz, r.topics, r.page_count, r.publish_year, r.rating],
    );
  }

  if (!tableArg || tableArg === "book_aliases") {
    await migrateSmallTable(
      "book_aliases",
      `SELECT alias_key, canonical_key FROM book_aliases ORDER BY alias_key`,
      `INSERT INTO book_aliases (alias_key, canonical_key) VALUES ($1, $2) ON CONFLICT (alias_key) DO NOTHING`,
      (r) => [r.alias_key, r.canonical_key],
    );
  }

  if (!tableArg || tableArg === "extracted_products") {
    await migrateSmallTable(
      "extracted_products",
      `SELECT name, company, description, purchase_url, image_url, context, mention_type, category, episode_title, episode_slug, podcast_slug, status, image_status FROM extracted_products ORDER BY id`,
      `INSERT INTO extracted_products (name, company, description, purchase_url, image_url, context, mention_type, category, episode_title, episode_slug, podcast_slug, status, image_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
      (r) => [r.name, r.company, r.description, r.purchase_url, r.image_url, r.context, r.mention_type, r.category, r.episode_title, r.episode_slug, r.podcast_slug, r.status, r.image_status],
    );
  }

  if (!tableArg || tableArg === "landing_page_recaps") {
    await migrateLargeTable(
      "landing_page_recaps",
      `SELECT COUNT(*) as cnt FROM landing_page_recaps`,
      `SELECT slug, itunes_id, podcast_name, episode_title, episode_slug, publish_date, duration, artwork_url, hosts, tldl, what_happened, key_insights, quote, quote_attribution, created_at, apple_episode_url, audio_url, key_topics, top_questions, sponsors, guests, show_notes, resources, spotify_episode_url, entity_contexts_cache, topic_contexts, published FROM landing_page_recaps ORDER BY id`,
      `INSERT INTO landing_page_recaps (slug, itunes_id, podcast_name, episode_title, episode_slug, publish_date, duration, artwork_url, hosts, tldl, what_happened, key_insights, quote, quote_attribution, created_at, apple_episode_url, audio_url, key_topics, top_questions, sponsors, guests, show_notes, resources, spotify_episode_url, entity_contexts_cache, topic_contexts, published) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) ON CONFLICT (slug, episode_slug) DO NOTHING`,
      (r) => [r.slug, r.itunes_id, r.podcast_name, r.episode_title, r.episode_slug, r.publish_date, r.duration, r.artwork_url, r.hosts, r.tldl, r.what_happened, r.key_insights, r.quote, r.quote_attribution, r.created_at, r.apple_episode_url, r.audio_url, r.key_topics, r.top_questions, r.sponsors, r.guests, r.show_notes, r.resources, r.spotify_episode_url, r.entity_contexts_cache, r.topic_contexts, r.published],
      500, 50
    );
  }

  if (!tableArg || tableArg === "episode_quotes") {
    await migrateLargeTable(
      "episode_quotes",
      `SELECT COUNT(*) as cnt FROM episode_quotes`,
      `SELECT podcast_slug, episode_slug, speaker_name, speaker_role, quote_text, context, quote_type, created_at FROM episode_quotes ORDER BY id`,
      `INSERT INTO episode_quotes (podcast_slug, episode_slug, speaker_name, speaker_role, quote_text, context, quote_type, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (podcast_slug, episode_slug, quote_text) DO NOTHING`,
      (r) => [r.podcast_slug, r.episode_slug, r.speaker_name, r.speaker_role, r.quote_text, r.context, r.quote_type, r.created_at],
      500, 50
    );
  }

  if (!tableArg || tableArg === "episode_transcripts") {
    await migrateLargeTable(
      "episode_transcripts",
      `SELECT COUNT(*) as cnt FROM episode_transcripts`,
      `SELECT podcast_id, episode_title, transcript, audio_url, language, created_at FROM episode_transcripts ORDER BY id`,
      `INSERT INTO episode_transcripts (podcast_id, episode_title, transcript, audio_url, language, created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (podcast_id, episode_title) DO NOTHING`,
      (r) => [r.podcast_id, r.episode_title, r.transcript, r.audio_url, r.language, r.created_at],
      100, 10
    );
  }

  console.log(`\n========== MIGRATION COMPLETE ==========`);
  console.log(`Finished at: ${new Date().toISOString()}`);
  await devPool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
