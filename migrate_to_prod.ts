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

async function execOnProd(query: string, params: any[]): Promise<boolean> {
  try {
    const resp = await fetch(`${PROD_URL}/api/admin/migrate-exec`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: COOKIE },
      body: JSON.stringify({ query, params }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

async function migrateBookAliases() {
  const { rows } = await devPool.query(`SELECT alias_key, canonical_key FROM book_aliases ORDER BY alias_key`);
  console.log(`\n=== book_aliases: ${rows.length} rows ===`);
  let inserted = 0;
  for (const row of rows) {
    const ok = await execOnProd(
      `INSERT INTO book_aliases (alias_key, canonical_key) VALUES ($1, $2) ON CONFLICT (alias_key) DO NOTHING`,
      [row.alias_key, row.canonical_key]
    );
    if (ok) inserted++;
  }
  console.log(`  Done: ${inserted} processed`);
}

async function migrateBookEnrichments() {
  const { rows } = await devPool.query(`SELECT book_key, book_title, slug, author, description, asin, isbn, google_books_id, has_cover, cover_approved, podcast_buzz, topics, page_count, publish_year, rating FROM book_enrichments ORDER BY id`);
  console.log(`\n=== book_enrichments: ${rows.length} rows ===`);
  let inserted = 0;
  for (const row of rows) {
    const ok = await execOnProd(
      `INSERT INTO book_enrichments (book_key, book_title, slug, author, description, asin, isbn, google_books_id, has_cover, cover_approved, podcast_buzz, topics, page_count, publish_year, rating) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (book_key) DO NOTHING`,
      [row.book_key, row.book_title, row.slug, row.author, row.description, row.asin, row.isbn, row.google_books_id, row.has_cover, row.cover_approved, row.podcast_buzz, row.topics, row.page_count, row.publish_year, row.rating]
    );
    if (ok) inserted++;
  }
  console.log(`  Done: ${inserted} processed`);
}

async function migrateEpisodeQuotes() {
  const total = parseInt((await devPool.query(`SELECT COUNT(*) as cnt FROM episode_quotes`)).rows[0].cnt);
  console.log(`\n=== episode_quotes: ${total} rows ===`);
  let offset = 0;
  let inserted = 0;
  const batchSize = 200;
  while (offset < total) {
    const { rows } = await devPool.query(
      `SELECT podcast_slug, episode_slug, speaker_name, speaker_role, quote_text, context, quote_type, created_at FROM episode_quotes ORDER BY id LIMIT $1 OFFSET $2`,
      [batchSize, offset]
    );
    if (rows.length === 0) break;
    for (const row of rows) {
      const ok = await execOnProd(
        `INSERT INTO episode_quotes (podcast_slug, episode_slug, speaker_name, speaker_role, quote_text, context, quote_type, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (podcast_slug, episode_slug, quote_text) DO NOTHING`,
        [row.podcast_slug, row.episode_slug, row.speaker_name, row.speaker_role, row.quote_text, row.context, row.quote_type, row.created_at]
      );
      if (ok) inserted++;
    }
    offset += rows.length;
    process.stdout.write(`  ${offset}/${total} (${inserted} inserted)\r`);
  }
  console.log(`\n  Done: ${inserted} processed`);
}

async function migrateExtractedProducts() {
  const { rows } = await devPool.query(`SELECT name, company, description, purchase_url, image_url, context, mention_type, category, episode_title, episode_slug, podcast_slug, status, image_status FROM extracted_products ORDER BY id`);
  console.log(`\n=== extracted_products: ${rows.length} rows ===`);
  let inserted = 0;
  for (const row of rows) {
    const ok = await execOnProd(
      `INSERT INTO extracted_products (name, company, description, purchase_url, image_url, context, mention_type, category, episode_title, episode_slug, podcast_slug, status, image_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
      [row.name, row.company, row.description, row.purchase_url, row.image_url, row.context, row.mention_type, row.category, row.episode_title, row.episode_slug, row.podcast_slug, row.status, row.image_status]
    );
    if (ok) inserted++;
  }
  console.log(`  Done: ${inserted} processed`);
}

async function migrateLandingPageRecaps() {
  const total = parseInt((await devPool.query(`SELECT COUNT(*) as cnt FROM landing_page_recaps`)).rows[0].cnt);
  console.log(`\n=== landing_page_recaps: ${total} rows ===`);
  let offset = 0;
  let inserted = 0;
  const batchSize = 100;
  while (offset < total) {
    const { rows } = await devPool.query(
      `SELECT slug, itunes_id, podcast_name, episode_title, episode_slug, publish_date, duration, artwork_url, hosts, tldl, what_happened, key_insights, quote, quote_attribution, created_at, apple_episode_url, audio_url, key_topics, top_questions, sponsors, guests, show_notes, resources, spotify_episode_url, entity_contexts_cache, topic_contexts, published FROM landing_page_recaps ORDER BY id LIMIT $1 OFFSET $2`,
      [batchSize, offset]
    );
    if (rows.length === 0) break;
    for (const row of rows) {
      const ok = await execOnProd(
        `INSERT INTO landing_page_recaps (slug, itunes_id, podcast_name, episode_title, episode_slug, publish_date, duration, artwork_url, hosts, tldl, what_happened, key_insights, quote, quote_attribution, created_at, apple_episode_url, audio_url, key_topics, top_questions, sponsors, guests, show_notes, resources, spotify_episode_url, entity_contexts_cache, topic_contexts, published) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) ON CONFLICT (slug, episode_slug) DO NOTHING`,
        [row.slug, row.itunes_id, row.podcast_name, row.episode_title, row.episode_slug, row.publish_date, row.duration, row.artwork_url, row.hosts, row.tldl, row.what_happened, row.key_insights, row.quote, row.quote_attribution, row.created_at, row.apple_episode_url, row.audio_url, row.key_topics, row.top_questions, row.sponsors, row.guests, row.show_notes, row.resources, row.spotify_episode_url, row.entity_contexts_cache, row.topic_contexts, row.published]
      );
      if (ok) inserted++;
    }
    offset += rows.length;
    process.stdout.write(`  ${offset}/${total} (${inserted} inserted)\r`);
  }
  console.log(`\n  Done: ${inserted} processed`);
}

async function migrateTranscripts() {
  const total = parseInt((await devPool.query(`SELECT COUNT(*) as cnt FROM episode_transcripts`)).rows[0].cnt);
  console.log(`\n=== episode_transcripts: ${total} rows (largest table — this takes a while) ===`);
  let offset = 0;
  let inserted = 0;
  let skipped = 0;
  const batchSize = 20;
  const startTime = Date.now();
  while (offset < total) {
    const { rows } = await devPool.query(
      `SELECT podcast_id, episode_title, transcript, audio_url, language, created_at FROM episode_transcripts ORDER BY id LIMIT $1 OFFSET $2`,
      [batchSize, offset]
    );
    if (rows.length === 0) break;
    for (const row of rows) {
      const ok = await execOnProd(
        `INSERT INTO episode_transcripts (podcast_id, episode_title, transcript, audio_url, language, created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (podcast_id, episode_title) DO NOTHING`,
        [row.podcast_id, row.episode_title, row.transcript, row.audio_url, row.language, row.created_at]
      );
      if (ok) inserted++; else skipped++;
    }
    offset += rows.length;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = offset / elapsed;
    const eta = Math.round((total - offset) / rate);
    process.stdout.write(`  ${offset}/${total} (${inserted} new, ${skipped} exist) ~${eta}s remaining\r`);
  }
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n  Done: ${inserted} inserted, ${skipped} skipped in ${elapsed}s`);
}

async function migratePodcastDirectory() {
  const { rows } = await devPool.query(`SELECT * FROM podcast_directory ORDER BY id`);
  console.log(`\n=== podcast_directory: ${rows.length} rows ===`);
  let inserted = 0;
  for (const row of rows) {
    const cols = Object.keys(row);
    const vals = Object.values(row);
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(",");
    const ok = await execOnProd(
      `INSERT INTO podcast_directory (${cols.join(",")}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
      vals as any[]
    );
    if (ok) inserted++;
  }
  console.log(`  Done: ${inserted} processed`);
}

async function main() {
  await adminLogin();

  console.log("\n========== MIGRATION START ==========");
  console.log(`Started at: ${new Date().toISOString()}\n`);

  await migratePodcastDirectory();
  await migrateBookEnrichments();
  await migrateBookAliases();
  await migrateExtractedProducts();
  await migrateLandingPageRecaps();
  await migrateEpisodeQuotes();
  await migrateTranscripts();

  console.log(`\n========== MIGRATION COMPLETE ==========`);
  console.log(`Finished at: ${new Date().toISOString()}`);
  await devPool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
