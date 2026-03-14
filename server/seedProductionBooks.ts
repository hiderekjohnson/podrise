import pg from "pg";
import fs from "fs";
import path from "path";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function seedProductionBooks() {
  const dataDir = path.resolve("data");

  try {
    const { rows: [{ count: enrichmentCount }] } = await pool.query(
      "SELECT COUNT(*) as count FROM book_enrichments WHERE slug IS NOT NULL"
    );
    const enrichmentTotal = parseInt(enrichmentCount);

    if (enrichmentTotal > 100) {
      console.log(`[BookSeed] ${enrichmentTotal} book enrichments already exist, skipping enrichment seed`);
    } else {
      console.log(`[BookSeed] Only ${enrichmentTotal} book enrichments found, seeding...`);
      const enrichmentsPath = path.join(dataDir, "book_enrichments.json");
      if (fs.existsSync(enrichmentsPath)) {
        const books = JSON.parse(fs.readFileSync(enrichmentsPath, "utf-8"));
        console.log(`[BookSeed] Importing ${books.length} book enrichments...`);

        let imported = 0;
        for (const b of books) {
          try {
            const result = await pool.query(
              `INSERT INTO book_enrichments (book_key, book_title, author, description, podcast_buzz, asin, amazon_url, slug, topics, page_count, publish_year, rating, rating_count, google_books_id, isbn, has_cover, cover_approved, cover_source, subtitle, publisher, published_date, isbn_10, isbn_13, google_description, ol_ratings_average, ol_ratings_count, categories)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
               ON CONFLICT (book_key) DO UPDATE SET
                 book_title = COALESCE(EXCLUDED.book_title, book_enrichments.book_title),
                 author = COALESCE(EXCLUDED.author, book_enrichments.author),
                 description = COALESCE(EXCLUDED.description, book_enrichments.description),
                 podcast_buzz = COALESCE(EXCLUDED.podcast_buzz, book_enrichments.podcast_buzz),
                 asin = COALESCE(EXCLUDED.asin, book_enrichments.asin),
                 amazon_url = COALESCE(EXCLUDED.amazon_url, book_enrichments.amazon_url),
                 slug = COALESCE(EXCLUDED.slug, book_enrichments.slug),
                 topics = COALESCE(EXCLUDED.topics, book_enrichments.topics),
                 page_count = COALESCE(EXCLUDED.page_count, book_enrichments.page_count),
                 publish_year = COALESCE(EXCLUDED.publish_year, book_enrichments.publish_year),
                 rating = COALESCE(EXCLUDED.rating, book_enrichments.rating),
                 rating_count = COALESCE(EXCLUDED.rating_count, book_enrichments.rating_count),
                 google_books_id = COALESCE(EXCLUDED.google_books_id, book_enrichments.google_books_id),
                 isbn = COALESCE(EXCLUDED.isbn, book_enrichments.isbn),
                 has_cover = COALESCE(EXCLUDED.has_cover, book_enrichments.has_cover),
                 cover_approved = COALESCE(EXCLUDED.cover_approved, book_enrichments.cover_approved),
                 cover_source = COALESCE(EXCLUDED.cover_source, book_enrichments.cover_source),
                 subtitle = COALESCE(EXCLUDED.subtitle, book_enrichments.subtitle),
                 publisher = COALESCE(EXCLUDED.publisher, book_enrichments.publisher),
                 published_date = COALESCE(EXCLUDED.published_date, book_enrichments.published_date),
                 isbn_10 = COALESCE(EXCLUDED.isbn_10, book_enrichments.isbn_10),
                 isbn_13 = COALESCE(EXCLUDED.isbn_13, book_enrichments.isbn_13),
                 google_description = COALESCE(EXCLUDED.google_description, book_enrichments.google_description),
                 ol_ratings_average = COALESCE(EXCLUDED.ol_ratings_average, book_enrichments.ol_ratings_average),
                 ol_ratings_count = COALESCE(EXCLUDED.ol_ratings_count, book_enrichments.ol_ratings_count),
                 categories = COALESCE(EXCLUDED.categories, book_enrichments.categories),
                 updated_at = NOW()`,
              [b.book_key, b.book_title, b.author, b.description, b.podcast_buzz, b.asin, b.amazon_url, b.slug, b.topics, b.page_count, b.publish_year, b.rating, b.rating_count, b.google_books_id, b.isbn, b.has_cover, b.cover_approved, b.cover_source, b.subtitle, b.publisher, b.published_date, b.isbn_10, b.isbn_13, b.google_description, b.ol_ratings_average, b.ol_ratings_count, b.categories]
            );
            if (result.rowCount && result.rowCount > 0) imported++;
          } catch (e: any) {
            console.warn(`[BookSeed] Failed to import "${b.book_title}": ${e.message}`);
          }
        }
        console.log(`[BookSeed] Imported ${imported} book enrichments`);
      }
    }

    try {
      const { rows: [{ count: aliasCount }] } = await pool.query("SELECT COUNT(*) as count FROM book_aliases");
      if (parseInt(aliasCount) < 50) {
        const aliasesPath = path.join(dataDir, "book_aliases.json");
        if (fs.existsSync(aliasesPath)) {
          const aliases = JSON.parse(fs.readFileSync(aliasesPath, "utf-8"));
          const { rows: existing } = await pool.query("SELECT alias_key FROM book_aliases");
          const existingKeys = new Set(existing.map((r: any) => r.alias_key));
          let count = 0;
          for (const a of aliases) {
            if (existingKeys.has(a.alias_key)) continue;
            try {
              await pool.query(
                `INSERT INTO book_aliases (alias_key, canonical_key) VALUES ($1, $2)`,
                [a.alias_key, a.canonical_key]
              );
              count++;
            } catch (e: any) {
              console.warn(`[BookSeed] Failed alias "${a.alias_key}": ${e.message}`);
            }
          }
          console.log(`[BookSeed] Imported ${count} book aliases`);
        }
      } else {
        console.log(`[BookSeed] ${aliasCount} book aliases already exist, skipping`);
      }
    } catch (e: any) {
      console.error(`[BookSeed] Aliases error:`, e.message);
    }

    try {
      const { rows: [{ count: insightCount }] } = await pool.query("SELECT COUNT(*) as count FROM book_insights");
      if (parseInt(insightCount) < 5) {
        const insightsPath = path.join(dataDir, "book_insights.json");
        if (fs.existsSync(insightsPath)) {
          const insights = JSON.parse(fs.readFileSync(insightsPath, "utf-8"));
          let count = 0;
          for (const ins of insights) {
            try {
              const result = await pool.query(
                `INSERT INTO book_insights (book_key, episode_slug, podcast_slug, insight, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
                [ins.book_key, ins.episode_slug, ins.podcast_slug, ins.insight, ins.created_at]
              );
              if (result.rowCount && result.rowCount > 0) count++;
            } catch (e: any) {
              console.warn(`[BookSeed] Failed insight: ${e.message}`);
            }
          }
          console.log(`[BookSeed] Imported ${count} book insights`);
        }
      } else {
        console.log(`[BookSeed] ${insightCount} book insights already exist, skipping`);
      }
    } catch (e: any) {
      console.error(`[BookSeed] Insights error:`, e.message);
    }

    try {
      const { rows: [{ count: resourceCount }] } = await pool.query(
        "SELECT COUNT(*) as count FROM landing_page_recaps WHERE resources IS NOT NULL AND resources::text != '[]'"
      );
      if (parseInt(resourceCount) < 500) {
        const resourcesPath = path.join(dataDir, "recap_resources.json");
        if (fs.existsSync(resourcesPath)) {
          const recaps = JSON.parse(fs.readFileSync(resourcesPath, "utf-8"));
          let count = 0;
          for (const r of recaps) {
            try {
              const resourcesJson = typeof r.resources === "string" ? r.resources : JSON.stringify(r.resources);
              const result = await pool.query(
                `UPDATE landing_page_recaps SET resources = $1::jsonb WHERE slug = $2 AND episode_slug = $3 AND (resources IS NULL OR resources::text = '[]')`,
                [resourcesJson, r.slug, r.episode_slug]
              );
              if (result.rowCount && result.rowCount > 0) count++;
            } catch (e: any) {
              console.warn(`[BookSeed] Failed resource update for ${r.slug}/${r.episode_slug}: ${e.message}`);
            }
          }
          console.log(`[BookSeed] Updated resources for ${count} recaps`);
        }
      } else {
        console.log(`[BookSeed] ${resourceCount} recaps already have resources, skipping`);
      }
    } catch (e: any) {
      console.error(`[BookSeed] Resources error:`, e.message);
    }

    console.log(`[BookSeed] Seed check complete!`);
  } catch (e: any) {
    console.error(`[BookSeed] Error:`, e.message);
  }
}
