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

  const port = parseInt(process.env.PORT || "5000", 10);

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
    log(`Vite dev server ready`);
  }

  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);

      // Pre-warm Vite compilation in background
      if (process.env.NODE_ENV !== "production") {
        import("http").then(({ default: http }) => {
          const req = http.get(`http://localhost:${port}/`, (res) => {
            res.resume();
            log(`Vite pre-warm complete`);
          });
          req.on("error", () => {});
          req.end();
        });
      }

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
