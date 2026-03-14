import pg from "pg";
import fs from "fs";
import path from "path";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function seedProductionProducts() {
  const dataDir = path.resolve("data");

  try {
    const { rows: [{ count: productCount }] } = await pool.query(
      "SELECT COUNT(*) as count FROM extracted_products WHERE status IN ('approved', 'rejected')"
    );
    const total = parseInt(productCount);

    if (total >= 20) {
      console.log(`[ProductSeed] ${total} reviewed products already exist, skipping`);
    } else {
      console.log(`[ProductSeed] Only ${total} reviewed products found, seeding...`);
      const productsPath = path.join(dataDir, "reviewed_products.json");
      if (fs.existsSync(productsPath)) {
        const products = JSON.parse(fs.readFileSync(productsPath, "utf-8"));
        console.log(`[ProductSeed] Importing ${products.length} reviewed products...`);

        let imported = 0;
        for (const p of products) {
          try {
            const existing = await pool.query(
              `SELECT id FROM extracted_products WHERE name = $1 AND podcast_slug = $2 AND episode_title = $3 LIMIT 1`,
              [p.name, p.podcast_slug, p.episode_title]
            );
            if (existing.rows.length > 0) {
              await pool.query(
                `UPDATE extracted_products SET status = $1, rejection_reason = $2, image_url = COALESCE($3, image_url), reviewed_at = NOW() WHERE id = $4`,
                [p.status, p.rejection_reason, p.image_url, existing.rows[0].id]
              );
            } else {
              await pool.query(
                `INSERT INTO extracted_products (name, company, description, purchase_url, context, mention_type, episode_title, episode_slug, podcast_slug, status, rejection_reason, category, image_url, extracted_at, reviewed_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
                 ON CONFLICT DO NOTHING`,
                [p.name, p.company, p.description, p.purchase_url, p.context, p.mention_type, p.episode_title, p.episode_slug, p.podcast_slug, p.status, p.rejection_reason, p.category, p.image_url]
              );
            }
            imported++;
          } catch (err: any) {
            if (!err.message?.includes('duplicate')) {
              console.warn(`[ProductSeed] Failed to import "${p.name}":`, err.message);
            }
          }
        }
        console.log(`[ProductSeed] Imported/updated ${imported} reviewed products`);
      } else {
        console.log(`[ProductSeed] No reviewed_products.json found, skipping`);
      }
    }

    const { rows: [{ count: hostCount }] } = await pool.query(
      "SELECT COUNT(*) as count FROM podcast_hosts"
    );
    const hostTotal = parseInt(hostCount);

    if (hostTotal >= 50) {
      console.log(`[ProductSeed] ${hostTotal} podcast hosts already exist, skipping`);
    } else {
      console.log(`[ProductSeed] Only ${hostTotal} podcast hosts found, seeding...`);
      const hostsPath = path.join(dataDir, "podcast_hosts.json");
      if (fs.existsSync(hostsPath)) {
        const hosts = JSON.parse(fs.readFileSync(hostsPath, "utf-8"));
        console.log(`[ProductSeed] Importing ${hosts.length} podcast hosts...`);

        let imported = 0;
        for (const h of hosts) {
          try {
            await pool.query(
              `INSERT INTO podcast_hosts (podcast_slug, name, bio, photo_url, twitter_handle, linkedin_url, instagram_handle, website_url, sort_order)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
               ON CONFLICT DO NOTHING`,
              [h.podcast_slug, h.name, h.bio, h.photo_url, h.twitter_handle, h.linkedin_url, h.instagram_handle, h.website_url, h.sort_order]
            );
            imported++;
          } catch (err: any) {
            if (!err.message?.includes('duplicate')) {
              console.warn(`[ProductSeed] Failed to import host "${h.name}":`, err.message);
            }
          }
        }
        console.log(`[ProductSeed] Imported ${imported} podcast hosts`);
      } else {
        console.log(`[ProductSeed] No podcast_hosts.json found, skipping`);
      }
    }
  } catch (err) {
    console.error("[ProductSeed] Seed failed:", err);
  }
}
