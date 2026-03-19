import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { getStripeSync } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { startEmailScheduler } from "./emailScheduler";
import { startProductionRecapScheduler } from "./productionRecapScheduler";

const app = express();
const httpServer = createServer(app);

function generateFriendlySummary(method: string, endpoint: string, status: number, message: string): string {
  const endpointParts = endpoint.split("/").filter(Boolean);
  let resource = "a page";
  if (endpoint.includes("/api/")) {
    const apiPart = endpointParts.slice(endpointParts.indexOf("api") + 1).join("/");
    resource = apiPart ? `the ${apiPart.split("?")[0]} API` : "an API endpoint";
  } else {
    resource = `the page at ${endpoint.split("?")[0]}`;
  }

  const action = method === "GET" ? "load" : method === "POST" ? "submit data to" : method === "PUT" || method === "PATCH" ? "update" : method === "DELETE" ? "delete from" : "access";

  if (status === 404) return `Someone tried to ${action} ${resource}, but it wasn't found.`;
  if (status === 401) return `An unauthorized request was made to ${resource}.`;
  if (status === 403) return `Access was denied to ${resource}.`;
  if (status === 400) return `A bad request was sent to ${resource}: ${message.substring(0, 100)}`;
  if (status === 429) return `Too many requests were made to ${resource} (rate limited).`;
  if (status >= 500) {
    if (message.toLowerCase().includes("database") || message.toLowerCase().includes("query")) {
      return `A database error occurred while trying to ${action} ${resource}.`;
    }
    if (message.toLowerCase().includes("timeout")) {
      return `A request to ${resource} timed out.`;
    }
    return `An internal server error occurred while trying to ${action} ${resource}.`;
  }
  return `An error (${status}) occurred at ${resource}: ${message.substring(0, 100)}`;
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not found, skipping Stripe initialization');
    return;
  }

  try {
    const { runMigrations } = await import("stripe-replit-sync");
    console.log('Initializing Stripe schema...');
    await runMigrations({ databaseUrl });
    console.log('Stripe schema ready');

    const stripeSync = await getStripeSync();

    console.log('Setting up managed webhook...');
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    try {
      const webhookResult = await stripeSync.findOrCreateManagedWebhook(
        `${webhookBaseUrl}/api/stripe/webhook`
      );
      console.log('Webhook configured:', webhookResult?.webhook?.url || 'ready');
    } catch (webhookErr) {
      console.warn('Webhook setup warning (non-fatal):', webhookErr);
    }

    console.log('Syncing Stripe data...');
    stripeSync.syncBackfill()
      .then(() => console.log('Stripe data synced'))
      .catch((err: any) => console.error('Error syncing Stripe data:', err));
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
  }
}

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;

      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer.');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

(async () => {
  console.log("Starting server...");
  console.log("NODE_ENV:", process.env.NODE_ENV);
  console.log("DATABASE_URL:", process.env.DATABASE_URL ? "set" : "NOT SET");
  console.log("SESSION_SECRET:", process.env.SESSION_SECRET ? "set" : "NOT SET");
  console.log("PORT:", process.env.PORT || "5000 (default)");

  try {
    await registerRoutes(httpServer, app);
    console.log("Routes registered successfully");
  } catch (err) {
    console.error("Failed to register routes:", err);
  }

  app.use(async (err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    try {
      const { storage } = await import("./storage");
      const endpoint = _req.originalUrl || _req.url || "unknown";
      const method = _req.method || "unknown";
      const ua = _req.headers["user-agent"] || undefined;
      const userId = (_req as any).session?.userId || undefined;

      let severity = "error";
      if (status >= 400 && status < 500) severity = "warning";
      if (status >= 500) severity = "error";

      const friendlySummary = generateFriendlySummary(method, endpoint, status, message);

      await storage.logError({
        endpoint,
        httpStatus: status,
        errorMessage: message,
        friendlySummary,
        severity,
        method,
        userAgent: ua,
        userId,
      });
    } catch (logErr) {
      console.error("Failed to log error to database:", logErr);
    }

    const clientMessage = status >= 500 ? "Something went wrong. Please try again later." : message;
    return res.status(status).json({ message: clientMessage });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);

      (async () => {
        const { pool, withRetry } = await import("./db");
        try {
          await withRetry(
            () =>
              pool.query(`
              CREATE TABLE IF NOT EXISTS podcast_hosts (
                id SERIAL PRIMARY KEY,
                podcast_slug TEXT NOT NULL,
                name TEXT NOT NULL,
                bio TEXT,
                photo_url TEXT,
                twitter_handle TEXT,
                linkedin_url TEXT,
                instagram_handle TEXT,
                website_url TEXT,
                sort_order INTEGER DEFAULT 0
              )
            `),
            "podcast_hosts migration",
          );
          console.log("podcast_hosts table ready");
        } catch (err) {
          console.warn("podcast_hosts table migration skipped:", err);
        }

        try {
          await withRetry(
            () =>
              pool.query(`
              CREATE INDEX IF NOT EXISTS idx_transcript_segments_fts
              ON transcript_segments
              USING GIN (to_tsvector('english', text))
            `),
            "FTS index migration",
          );
          console.log("FTS index ready");
        } catch (err) {
          console.warn("FTS index migration skipped:", err);
        }

        try {
          await pool.query(`CREATE TABLE IF NOT EXISTS affiliate_clicks (
            id SERIAL PRIMARY KEY,
            product_type TEXT NOT NULL DEFAULT 'product',
            product_name TEXT NOT NULL DEFAULT 'Unknown',
            product_id INTEGER,
            destination_url TEXT NOT NULL,
            referrer_page TEXT,
            clicked_at TIMESTAMP DEFAULT NOW()
          )`);
          const cols = [
            { name: "signup_source", type: "TEXT" },
            { name: "signup_source_detail", type: "TEXT" },
            { name: "ip_address", type: "TEXT" },
            { name: "user_agent", type: "TEXT" },
            { name: "device_type", type: "TEXT" },
          ];
          for (const col of cols) {
            await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`).catch(() => {});
          }
          console.log("Analytics schema ready");
        } catch (err) {
          console.warn("Analytics schema migration skipped:", err);
        }

        try {
          const artworkFix1 = await pool.query(`UPDATE landing_page_recaps SET artwork_url = REPLACE(artwork_url, '100x100bb', '1200x1200bb') WHERE artwork_url LIKE '%100x100bb%'`);
          const artworkFix2 = await pool.query(`UPDATE landing_page_recaps SET artwork_url = REPLACE(artwork_url, '600x600bb', '1200x1200bb') WHERE artwork_url LIKE '%600x600bb%'`);
          const artworkFix3 = await pool.query(`UPDATE podcast_directory SET artwork_url = REPLACE(artwork_url, '100x100bb', '1200x1200bb') WHERE artwork_url LIKE '%100x100bb%'`);
          const artworkFix4 = await pool.query(`UPDATE podcast_directory SET artwork_url = REPLACE(artwork_url, '600x600bb', '1200x1200bb') WHERE artwork_url LIKE '%600x600bb%'`);
          const totalFixed = (artworkFix1.rowCount || 0) + (artworkFix2.rowCount || 0) + (artworkFix3.rowCount || 0) + (artworkFix4.rowCount || 0);
          if (totalFixed > 0) console.log(`[Migration] Upgraded ${totalFixed} artwork URLs to 1200x1200`);
        } catch (err) {
          console.warn("Artwork URL migration skipped:", err);
        }

        try {
          const { ensureApiUsageTable } = await import("./apiUsageTracker");
          await ensureApiUsageTable();
          console.log("api_usage_logs table ready");
        } catch (err) {
          console.warn("api_usage_logs migration skipped:", err);
        }

        try {
          await pool.query(`ALTER TABLE extracted_products ADD COLUMN IF NOT EXISTS context_summary TEXT`).catch(() => {});
          await pool.query(`ALTER TABLE extracted_products ADD COLUMN IF NOT EXISTS image_status TEXT NOT NULL DEFAULT 'pending'`).catch(() => {});
          await pool.query(`UPDATE extracted_products SET image_status = 'approved' WHERE image_url IS NOT NULL AND image_url != '' AND image_status = 'pending'`).catch(() => {});
          console.log("Product columns migration ready");
        } catch (err) {
          console.warn("Product columns migration skipped:", err);
        }

        try {
          await pool.query(`CREATE TABLE IF NOT EXISTS landing_page_visits (
            id SERIAL PRIMARY KEY,
            page_slug TEXT NOT NULL,
            session_id TEXT,
            utm_source TEXT,
            utm_medium TEXT,
            utm_campaign TEXT,
            utm_content TEXT,
            utm_term TEXT,
            ip_address TEXT,
            user_agent TEXT,
            device_type TEXT,
            user_id INTEGER,
            visited_at TIMESTAMP DEFAULT NOW()
          )`);
          await pool.query(`CREATE INDEX IF NOT EXISTS idx_lpv_page_slug ON landing_page_visits(page_slug)`).catch(() => {});
          await pool.query(`CREATE INDEX IF NOT EXISTS idx_lpv_visited_at ON landing_page_visits(visited_at)`).catch(() => {});
          console.log("landing_page_visits table ready");
        } catch (err) {
          console.warn("landing_page_visits migration skipped:", err);
        }

        try {
          await pool.query(`CREATE TABLE IF NOT EXISTS feature_flags (
            id SERIAL PRIMARY KEY,
            key TEXT NOT NULL UNIQUE,
            description TEXT,
            enabled BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW()
          )`);
          await pool.query(`CREATE TABLE IF NOT EXISTS user_feature_overrides (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            flag_key TEXT NOT NULL,
            enabled BOOLEAN NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, flag_key)
          )`);
          await pool.query(`
            INSERT INTO feature_flags (key, description, enabled)
            VALUES ('pulse', 'Pulse Pro briefings feature', false),
                   ('upgrade', 'Upgrade/pricing features', false)
            ON CONFLICT (key) DO NOTHING
          `);
          console.log("feature_flags tables ready");
        } catch (err) {
          console.warn("feature_flags migration skipped:", err);
        }

        try {
          await pool.query(`CREATE TABLE IF NOT EXISTS ad_events (
            id SERIAL PRIMARY KEY,
            ad_id INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            session_id TEXT,
            user_id INTEGER,
            ip_address TEXT,
            user_agent TEXT,
            referrer TEXT,
            created_at TIMESTAMP DEFAULT NOW()
          )`);
          await pool.query(`CREATE INDEX IF NOT EXISTS idx_ad_events_ad_id ON ad_events(ad_id)`).catch(() => {});
          await pool.query(`CREATE INDEX IF NOT EXISTS idx_ad_events_created_at ON ad_events(created_at)`).catch(() => {});
          console.log("ad_events table ready");
        } catch (err) {
          console.warn("ad_events migration skipped:", err);
        }

        try {
          await pool.query(`CREATE TABLE IF NOT EXISTS site_settings (
            id SERIAL PRIMARY KEY,
            key TEXT NOT NULL UNIQUE,
            value JSONB NOT NULL DEFAULT '{}',
            updated_at TIMESTAMP DEFAULT NOW()
          )`);
          console.log("site_settings table ready");
        } catch (err) {
          console.warn("site_settings migration skipped:", err);
        }

        try {
          const newPodcasts = [
            { itunesId: "1148183612", slug: "almost30", name: "Almost 30", hosts: "Krista Williams & Lindsey Simcik", description: "conversations about personal growth, spirituality, wellness, and navigating your late twenties and beyond", appleUrl: "https://podcasts.apple.com/us/podcast/almost-30/id1148183612", spotifyUrl: "https://open.spotify.com/show/0kBU7FWmLaLf3si3KZ9XQx" },
            { itunesId: "1199977889", slug: "marieforleo", name: "The Marie Forleo Podcast", hosts: "Marie Forleo", description: "actionable strategies for business, personal development, and creating a life you love", appleUrl: "https://podcasts.apple.com/us/podcast/the-marie-forleo-podcast/id1199977889", spotifyUrl: "https://open.spotify.com/show/2BTDPFDY7V3jrtT6JzQ0fX" },
            { itunesId: "1087926635", slug: "earnyourhappy", name: "Earn Your Happy", hosts: "Lori Harder", description: "inspiration and strategies for building confidence, growing a business, and designing your dream life", appleUrl: "https://podcasts.apple.com/us/podcast/earn-your-happy/id1087926635", spotifyUrl: "https://open.spotify.com/show/00emcUxuXsXWIuNKuhvIRR" },
            { itunesId: "1564530722", slug: "we-can-do-hard-things", name: "We Can Do Hard Things", hosts: "Glennon Doyle", description: "honest conversations about the hard things in life including relationships, parenting, identity, and resilience", appleUrl: "https://podcasts.apple.com/us/podcast/we-can-do-hard-things/id1564530722", spotifyUrl: "https://open.spotify.com/show/0eFL5HJejQHZrdgAFdPnOm" },
            { itunesId: "1435217865", slug: "womenofimpact", name: "Women of Impact", hosts: "Lisa Bilyeu", description: "empowering conversations with trailblazing women about mindset, entrepreneurship, and overcoming adversity", appleUrl: "https://podcasts.apple.com/us/podcast/women-of-impact/id1435217865", spotifyUrl: "https://open.spotify.com/show/2Pv6X6iCwFmwGwxfrwHdfW" },
            { itunesId: "1494350511", slug: "unlockingus", name: "Unlocking Us with Brené Brown", hosts: "Brené Brown", description: "conversations about vulnerability, courage, shame, and what it means to be human", appleUrl: "https://podcasts.apple.com/us/podcast/unlocking-us-with-brene-brown/id1494350511", spotifyUrl: "https://open.spotify.com/show/4P86ZzHf7EOlRG7do9LkKZ" },
            { itunesId: "1708895338", slug: "areallygoodcry", name: "A Really Good Cry", hosts: "Radhi Devlukia-Shetty", description: "emotional wellness conversations exploring feelings, healing, and living with intention", appleUrl: "https://podcasts.apple.com/us/podcast/a-really-good-cry/id1708895338", spotifyUrl: "https://open.spotify.com/show/6FR9Pjd4y2kXO54Wzs5uye" },
            { itunesId: "1795483480", slug: "goodhang", name: "Good Hang with Amy Poehler", hosts: "Amy Poehler", description: "candid and hilarious conversations with interesting people about life, creativity, and friendship", appleUrl: "https://podcasts.apple.com/us/podcast/good-hang-with-amy-poehler/id1795483480", spotifyUrl: "https://open.spotify.com/show/1z20EiwuKoDiftKxMVLde1" },
            { itunesId: "1678559416", slug: "wiserthanme", name: "Wiser Than Me with Julia Louis-Dreyfus", hosts: "Julia Louis-Dreyfus", description: "conversations with older women who share hard-earned wisdom about life, aging, and everything in between", appleUrl: "https://podcasts.apple.com/us/podcast/wiser-than-me-with-julia-louis-dreyfus/id1678559416", spotifyUrl: "https://open.spotify.com/show/3zaHNdVeLiqOSXwxdoWcij" },
            { itunesId: "1561694805", slug: "deargabby", name: "Dear Gabby", hosts: "Gabby Bernstein", description: "coaching and spiritual guidance on manifesting, relationships, anxiety, and personal transformation", appleUrl: "https://podcasts.apple.com/us/podcast/dear-gabby/id1561694805", spotifyUrl: "https://open.spotify.com/show/24ayLlNtpav44vsHPdeNi1" },
            { itunesId: "1352546554", slug: "gooppodcast", name: "The goop Podcast", hosts: "Gwyneth Paltrow", description: "wellness, health, beauty, and lifestyle conversations with leading experts and cultural voices", appleUrl: "https://podcasts.apple.com/us/podcast/the-goop-podcast/id1352546554", spotifyUrl: "https://open.spotify.com/show/1PyphXayU14C9VmJfdIt9M" },
          ];
          let seeded = 0, failed = 0;
          for (const p of newPodcasts) {
            try {
              await pool.query(
                `INSERT INTO podcast_directory (itunes_id, slug, name, hosts, description, apple_url, spotify_url, status, has_landing_page, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'published', false, NOW(), NOW())
                 ON CONFLICT (itunes_id) DO UPDATE SET
                   slug = COALESCE(NULLIF(podcast_directory.slug, ''), EXCLUDED.slug),
                   hosts = COALESCE(NULLIF(podcast_directory.hosts, ''), EXCLUDED.hosts),
                   description = COALESCE(NULLIF(podcast_directory.description, ''), EXCLUDED.description),
                   apple_url = COALESCE(NULLIF(podcast_directory.apple_url, ''), EXCLUDED.apple_url),
                   spotify_url = COALESCE(NULLIF(podcast_directory.spotify_url, ''), EXCLUDED.spotify_url),
                   updated_at = NOW()`,
                [p.itunesId, p.slug, p.name, p.hosts, p.description, p.appleUrl, p.spotifyUrl]
              );
              seeded++;
            } catch (err: any) {
              failed++;
              console.warn(`[Migration] Failed to seed podcast "${p.slug}" (iTunes ${p.itunesId}):`, err.message);
            }
          }
          console.log(`[Migration] Podcast directory seed: ${seeded} succeeded, ${failed} failed out of ${newPodcasts.length}`);
        } catch (err) {
          console.warn("New podcasts seed skipped:", err);
        }

        setTimeout(async () => {
          try {
            const missingArtwork = await pool.query(
              `SELECT slug, itunes_id FROM podcast_directory WHERE (artwork_url IS NULL OR artwork_url = '') AND slug IS NOT NULL`
            );
            if (missingArtwork.rows.length === 0) return;
            console.log(`[ArtworkBackfill] Found ${missingArtwork.rows.length} podcasts missing artwork`);

            const withIds = missingArtwork.rows.filter((r: any) => r.itunes_id);
            const withoutIds = missingArtwork.rows.filter((r: any) => !r.itunes_id);

            let fixed = 0;
            if (withIds.length > 0) {
              const ids = withIds.map((r: any) => r.itunes_id);
              const batchSize = 50;
              for (let i = 0; i < ids.length; i += batchSize) {
                const batch = ids.slice(i, i + batchSize);
                try {
                  const resp = await fetch(`https://itunes.apple.com/lookup?id=${batch.join(",")}`);
                  const data = await resp.json();
                  const found = new Map<string, string>();
                  for (const r of (data.results || [])) {
                    const art = (r.artworkUrl600 || r.artworkUrl100 || "").replace(/\d+x\d+bb/, "1200x1200bb");
                    if (art) found.set(String(r.collectionId), art);
                  }
                  for (const row of withIds.filter((r: any) => found.has(r.itunes_id))) {
                    await pool.query(`UPDATE podcast_directory SET artwork_url = $1 WHERE slug = $2`, [found.get(row.itunes_id), row.slug]);
                    fixed++;
                  }
                } catch (e: any) {
                  console.warn(`[ArtworkBackfill] Batch lookup failed:`, e.message);
                }
                if (i + batchSize < ids.length) await new Promise(r => setTimeout(r, 1000));
              }
            }

            for (const row of withoutIds) {
              try {
                const term = row.slug.replace(/-/g, " ");
                const resp = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=podcast&limit=1`);
                const data = await resp.json();
                if (data.results?.[0]) {
                  const r = data.results[0];
                  const art = (r.artworkUrl600 || r.artworkUrl100 || "").replace(/\d+x\d+bb/, "1200x1200bb");
                  if (art) {
                    await pool.query(
                      `UPDATE podcast_directory SET artwork_url = $1, itunes_id = COALESCE(NULLIF(itunes_id, ''), $2) WHERE slug = $3`,
                      [art, String(r.collectionId), row.slug]
                    );
                    fixed++;
                  }
                }
                await new Promise(r => setTimeout(r, 600));
              } catch (e: any) {
                console.warn(`[ArtworkBackfill] Search failed for ${row.slug}:`, e.message);
              }
            }
            if (fixed > 0) console.log(`[ArtworkBackfill] Fixed artwork for ${fixed}/${missingArtwork.rows.length} podcasts`);
          } catch (err) {
            console.warn("[ArtworkBackfill] skipped:", err);
          }
        }, 15000);

        try {
          const existingHosts = await pool.query(`SELECT COUNT(*) FROM podcast_hosts WHERE podcast_slug = 'myfirstmillion'`);
          if (parseInt(existingHosts.rows[0].count) === 0) {
            await pool.query(`
              INSERT INTO podcast_hosts (podcast_slug, name, bio, photo_url, twitter_handle, linkedin_url, sort_order)
              VALUES 
              ('myfirstmillion', 'Sam Parr', 'Entrepreneur, investor, and media operator best known as the co-founder of The Hustle, a business newsletter acquired by HubSpot. Sam Parr focuses on identifying emerging business opportunities, analyzing startup trends, and sharing practical lessons from founders and operators.', '/hosts/myfirstmillion_1.png', 'theSamParr', 'https://www.linkedin.com/in/theSamParr/', 0),
              ('myfirstmillion', 'Shaan Puri', 'Startup founder, investor, and entrepreneur known for building and investing in technology startups. Shaan Puri previously founded the e-commerce platform Blab and later became a venture partner at Founders Fund.', '/hosts/myfirstmillion_2.png', 'ShaanVP', 'https://www.linkedin.com/in/shaanpuri/', 1)
            `);
            console.log("[Migration] Seeded MFM podcast hosts");
          }
        } catch (err) {
          console.warn("Podcast hosts seed skipped:", err);
        }

      })();

      initStripe().catch((err) => {
        console.error('Stripe init error (non-fatal):', err);
      });

      startEmailScheduler();
      startProductionRecapScheduler();
    },
  );
})().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
