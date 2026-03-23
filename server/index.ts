import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes, warmDirectoryCaches } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
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

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
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
          await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP`);
          console.log("last_login_at column ready");
        } catch (err) {
          console.warn("last_login_at migration skipped:", err);
        }

        try {
          const { ensureApiUsageTable } = await import("./apiUsageTracker");
          await ensureApiUsageTable();
          console.log("api_usage_logs table ready (with recap_audio & playback_events)");
        } catch (err) {
          console.warn("api_usage_logs migration skipped:", err);
        }

        try {
          const { ensureRecapAudioConstraint } = await import("./audioRecapGenerator");
          await ensureRecapAudioConstraint();
        } catch (err) {
          console.warn("recap_audio constraint migration skipped:", err);
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
          await pool.query(`ALTER TABLE pending_transcript_queue ADD COLUMN IF NOT EXISTS date_published INTEGER`);
          console.log("pending_transcript_queue date_published column ready");
        } catch (err) {
          console.warn("pending_transcript_queue date_published migration skipped:", err);
        }

        try {
          const { ensureAlertSubscriptionsTable } = await import("./alertSubscriptionService");
          await ensureAlertSubscriptionsTable();
        } catch (err) {
          console.warn("alert_subscriptions migration skipped:", err);
        }

      })();

      startEmailScheduler();
      startProductionRecapScheduler();
      warmDirectoryCaches().catch(err => console.error("[Cache] Warm failed:", err));
    },
  );
})().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
