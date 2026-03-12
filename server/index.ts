import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { getStripeSync } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { startEmailScheduler } from "./emailScheduler";

const app = express();
const httpServer = createServer(app);

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

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
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

        try {
          await pool.query(`DELETE FROM admin_settings WHERE key = 'admin_password_hash'`);
          console.log("[Migration] Admin password reset to env var");
        } catch (err) {
          console.warn("Admin password reset skipped:", err);
        }
      })();

      initStripe().catch((err) => {
        console.error('Stripe init error (non-fatal):', err);
      });

      startEmailScheduler();
    },
  );
})().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
