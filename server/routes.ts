import type { Express } from "express";
import type { Server } from "http";
import crypto from "crypto";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { getUncachableResendClient } from "./resendClient";
import { markdownToEmailHtml, recapHasContent, DEFAULT_TEMPLATE, MERGE_TAGS, type EmailTemplateConfig } from "./emailTemplate";
import { generateRecap } from "./recapGenerator";
import { ITUNES_ID_TO_SLUG } from "./podcastLandingMap";
import { pool } from "./db";
import { activeEpGenItunesIds } from "./epGenState";
import { readFileSync } from "fs";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    isAdmin?: boolean;
    impersonatingUserId?: number;
    originalUserId?: number;
    podcasterEmail?: string;
  }
}

class DataCache<T> {
  private data: T | null = null;
  private cachedAt = 0;
  private refreshing = false;
  constructor(public readonly name: string, private ttlMs: number = 24 * 60 * 60 * 1000) {}
  get(): T | null {
    if (this.data && (Date.now() - this.cachedAt) < this.ttlMs) return this.data;
    return null;
  }
  set(data: T): void {
    this.data = data;
    this.cachedAt = Date.now();
  }
  invalidate(): void {
    this.data = null;
    this.cachedAt = 0;
  }
  isRefreshing(): boolean { return this.refreshing; }
  setRefreshing(v: boolean): void { this.refreshing = v; }
  age(): number { return this.data ? Date.now() - this.cachedAt : -1; }
}

const directoryCache = {
  people: new DataCache<any[]>("people"),
  companies: new DataCache<any[]>("companies"),
  topics: new DataCache<any[]>("topics"),
  bookstore: new DataCache<any>("bookstore"),
  podcastsDiscovery: new DataCache<any>("podcastsDiscovery"),
  podcastsDirectory: new DataCache<any[]>("podcastsDirectory"),
};

function parsePodcastName(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.name) return parsed.name;
  } catch {}
  return raw;
}

async function getLocationFromIp(ip: string): Promise<string> {
  try {
    const cleanIp = ip.replace("::ffff:", "");
    if (cleanIp === "127.0.0.1" || cleanIp === "::1" || cleanIp.startsWith("10.") || cleanIp.startsWith("192.168.")) {
      return "Local / Development";
    }
    const res = await fetch(`http://ip-api.com/json/${cleanIp}?fields=city,regionName,country`);
    if (res.ok) {
      const data = await res.json() as { city?: string; regionName?: string; country?: string };
      const parts = [data.city, data.regionName, data.country].filter(Boolean);
      return parts.length > 0 ? parts.join(", ") : "Unknown";
    }
  } catch {}
  return "Unknown";
}

async function sendNewUserNotification(user: any, req: any, signupSource?: string) {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "Unknown";
  const location = await getLocationFromIp(ip);
  const podcastNames = (user.podcasts || []).map((p: string) => parsePodcastName(p));
  const rawSource = signupSource || req.headers["referer"] || "";
  const sourceLabels: Record<string, string> = {
    "/": "Homepage",
    "/login": "Login Page",
    "/leaderboard": "Leaderboard",
  };
  let sourceLabel = sourceLabels[rawSource] || rawSource || "Unknown";
  if (rawSource.startsWith("/podcasts/")) {
    const slug = rawSource.replace("/podcasts/", "");
    sourceLabel = `Landing Page (${slug})`;
  }
  const sourceUrl = rawSource ? `${sourceLabel} <span style="color:#aaa;font-size:12px;">(${rawSource})</span>` : sourceLabel;
  const signupTime = new Date().toLocaleString("en-US", {
    timeZone: "Europe/Lisbon",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const { client, fromEmail } = await getUncachableResendClient();
  await client.emails.send({
    from: `PodCap Alerts <${fromEmail}>`,
    to: "hiderekjohnson@gmail.com",
    subject: `🚀 New PodCap User: ${user.email}`,
    html: `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#f8f9fa;">
<div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<div style="background:linear-gradient(135deg,#2196F3,#1976D2);padding:28px 32px;">
<h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">🎉 New User Signup</h1>
</div>
<div style="padding:28px 32px;">
<table style="width:100%;border-collapse:collapse;">
<tr><td style="padding:10px 0;color:#888;font-size:13px;vertical-align:top;width:110px;">Email</td><td style="padding:10px 0;font-size:14px;font-weight:600;color:#1a1a1a;">${user.email}</td></tr>
<tr><td style="padding:10px 0;color:#888;font-size:13px;vertical-align:top;">Location</td><td style="padding:10px 0;font-size:14px;color:#1a1a1a;">${location} <span style="color:#aaa;font-size:12px;">(${ip})</span></td></tr>
<tr><td style="padding:10px 0;color:#888;font-size:13px;vertical-align:top;">Podcasts</td><td style="padding:10px 0;font-size:14px;color:#1a1a1a;">${podcastNames.length > 0 ? podcastNames.map((n: string) => `<span style="display:inline-block;background:#e3f2fd;color:#1565c0;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;margin:2px 4px 2px 0;">${n}</span>`).join("") : "<em style='color:#aaa;'>None selected</em>"}</td></tr>
<tr><td style="padding:10px 0;color:#888;font-size:13px;vertical-align:top;">Signed up</td><td style="padding:10px 0;font-size:14px;color:#1a1a1a;">${signupTime} <span style="color:#aaa;font-size:12px;">(Lisbon)</span></td></tr>
<tr><td style="padding:10px 0;color:#888;font-size:13px;vertical-align:top;">Source</td><td style="padding:10px 0;font-size:14px;color:#1a1a1a;">${sourceUrl}</td></tr>
<tr><td style="padding:10px 0;color:#888;font-size:13px;vertical-align:top;">User ID</td><td style="padding:10px 0;font-size:14px;color:#1a1a1a;">#${user.id}</td></tr>
</table>
</div>
<div style="padding:16px 32px;background:#f8f9fa;text-align:center;">
<span style="font-size:12px;color:#aaa;">PodCap User Alert</span>
</div>
</div>
</body></html>`,
  });

  console.log(`[NewUserNotify] Notification sent for ${user.email}`);
}

const DOMAIN = "https://podcap.io";

const STATIC_PAGES = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/podcasts", priority: "0.9", changefreq: "daily" },
  { path: "/trends", priority: "0.9", changefreq: "daily" },
  { path: "/insights", priority: "0.9", changefreq: "daily" },
  { path: "/login", priority: "0.5", changefreq: "monthly" },
  { path: "/privacy", priority: "0.3", changefreq: "yearly" },
  { path: "/terms", priority: "0.3", changefreq: "yearly" },
  { path: "/support", priority: "0.5", changefreq: "monthly" },
  { path: "/people", priority: "0.8", changefreq: "weekly" },
  { path: "/companies", priority: "0.8", changefreq: "weekly" },
];

const PODCAST_SLUGS = Object.values(ITUNES_ID_TO_SLUG);

async function buildSitemap(): Promise<string> {
  const today = new Date().toISOString().split("T")[0];
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  for (const page of STATIC_PAGES) {
    xml += `  <url>\n`;
    xml += `    <loc>${DOMAIN}${page.path}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
    xml += `    <priority>${page.priority}</priority>\n`;
    xml += `  </url>\n`;
  }

  for (const slug of PODCAST_SLUGS) {
    xml += `  <url>\n`;
    xml += `    <loc>${DOMAIN}/podcasts/${slug}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>weekly</changefreq>\n`;
    xml += `    <priority>0.8</priority>\n`;
    xml += `  </url>\n`;
    xml += `  <url>\n`;
    xml += `    <loc>${DOMAIN}/podcasts/${slug}/episodes</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>weekly</changefreq>\n`;
    xml += `    <priority>0.6</priority>\n`;
    xml += `  </url>\n`;
  }

  try {
    for (const slug of PODCAST_SLUGS) {
      const recaps = await storage.getLandingPageRecaps(slug, 100);
      for (const recap of recaps) {
        xml += `  <url>\n`;
        xml += `    <loc>${DOMAIN}/podcasts/${slug}/${recap.episodeSlug}</loc>\n`;
        xml += `    <lastmod>${today}</lastmod>\n`;
        xml += `    <changefreq>monthly</changefreq>\n`;
        xml += `    <priority>0.7</priority>\n`;
        xml += `  </url>\n`;
      }
    }
  } catch (err) {
    console.error("[Sitemap] Error fetching recaps:", err);
  }

  const PEOPLE_SLUGS = ["elon-musk", "sam-altman", "joe-rogan", "lex-fridman", "naval-ravikant", "peter-thiel", "chamath-palihapitiya", "jason-calacanis", "marc-andreessen", "jensen-huang", "alex-hormozi", "gary-vaynerchuk", "codie-sanchez", "sahil-bloom", "andrew-huberman", "seth-godin", "chris-do", "scott-galloway", "simon-sinek", "adam-grant", "ramit-sethi", "ryan-holiday", "tim-ferriss", "mark-cuban", "patrick-bet-david", "james-clear", "jenna-kutcher", "amy-porterfield", "john-lee-dumas", "sam-parr", "shaan-puri", "justin-welsh", "hala-taha", "noah-kagan", "aaron-levie", "matthew-prince", "luis-von-ahn", "alex-karp", "brian-chesky", "daniel-ek", "brian-armstrong", "george-kurtz", "ariane-gorin", "jeremy-allaire", "dharmesh-shah", "jason-robins", "mark-zuckerberg", "satya-nadella", "tim-cook", "jeff-bezos", "reed-hastings", "marc-benioff", "ken-griffin", "martina-cheung", "patrick-smith", "sridhar-ramaswamy", "brian-niccol", "travis-kalanick", "dara-khosrowshahi", "rich-barton", "danny-meyer", "bill-campbell", "angela-duckworth", "david-epstein", "jonathan-haidt", "robert-greene", "jim-cramer", "henry-blodget"];
  for (const pSlug of PEOPLE_SLUGS) {
    xml += `  <url>\n`;
    xml += `    <loc>${DOMAIN}/people/${pSlug}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>weekly</changefreq>\n`;
    xml += `    <priority>0.7</priority>\n`;
    xml += `  </url>\n`;
  }

  const COMPANY_SLUGS = ["openai", "tesla", "nvidia", "google", "microsoft", "apple", "amazon", "anthropic", "meta", "spacex", "box", "cloudflare", "duolingo", "palantir", "airbnb", "spotify", "coinbase", "crowdstrike", "expedia", "circle", "hubspot", "draftkings", "netflix", "salesforce", "citadel-securities", "sp-global", "axon-enterprise", "snowflake", "starbucks", "adobe", "shopify", "bitcoin", "ethereum", "disney", "cursor", "substack", "slack", "waymo", "zoom", "walmart", "softbank", "elevenlabs", "amd", "broadcom", "product-hunt", "zapier", "cisco", "discord", "nike", "costco", "boeing", "toast-inc", "wework", "qualcomm", "groq", "webflow", "runway-ml"];
  for (const cSlug of COMPANY_SLUGS) {
    xml += `  <url>\n`;
    xml += `    <loc>${DOMAIN}/companies/${cSlug}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>weekly</changefreq>\n`;
    xml += `    <priority>0.7</priority>\n`;
    xml += `  </url>\n`;
  }

  try {
    const { TOPICS } = await import("../client/src/data/topicData");
    for (const topic of TOPICS) {
      xml += `  <url>\n`;
      xml += `    <loc>${DOMAIN}/insights/${topic.slug}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
    }
  } catch (err) {
    console.error("[Sitemap] Error generating insights URLs:", err);
  }

  xml += `</urlset>`;
  return xml;
}

const ROBOTS_TXT = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /dashboard
Disallow: /upgrade
Disallow: /api/

Sitemap: ${DOMAIN}/sitemap.xml
`;

async function autoPopulateDirectory(podcasts: string[]) {
  for (const raw of podcasts) {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") continue;
      const itunesId = String(parsed.itunesId || parsed.id || "");
      const name = parsed.name || "";
      if (!itunesId || !name) continue;
      const existing = await storage.getPodcastDirectoryEntry(itunesId);
      if (!existing) {
        await storage.upsertPodcastDirectoryEntry({
          itunesId,
          name,
          artworkUrl: parsed.artworkUrl || parsed.imageUrl || null,
        });
      }
    } catch {}
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.get("/podcap-logo.png", (_req, res) => {
    res.sendFile("Podcap_logo_1772731738179.png", { root: "attached_assets", maxAge: "30d" });
  });

  app.get("/podcap-logo.svg", (_req, res) => {
    res.sendFile("podcap-logo.svg", { root: "client/public", maxAge: "30d" });
  });

  app.get("/sitemap.xml", async (_req, res) => {
    res.set("Content-Type", "application/xml");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(await buildSitemap());
  });

  app.get("/topics", (_req, res) => {
    res.redirect(301, "/insights");
  });

  app.get("/topics/:slug", (req, res) => {
    res.redirect(301, `/insights/${req.params.slug}`);
  });

  function escapeXml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  function buildRssXml(recaps: any[], feedTitle: string, feedDescription: string, feedLink: string): string {
    const DOMAIN = "https://podcap.io";
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">\n`;
    xml += `<channel>\n`;
    xml += `  <title>${escapeXml(feedTitle)}</title>\n`;
    xml += `  <link>${DOMAIN}</link>\n`;
    xml += `  <description>${escapeXml(feedDescription)}</description>\n`;
    xml += `  <atom:link href="${escapeXml(feedLink)}" rel="self" type="application/rss+xml"/>\n`;
    xml += `  <language>en-us</language>\n`;
    xml += `  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n`;
    xml += `  <image>\n`;
    xml += `    <url>${DOMAIN}/podcap-logo.png</url>\n`;
    xml += `    <title>${escapeXml(feedTitle)}</title>\n`;
    xml += `    <link>${DOMAIN}</link>\n`;
    xml += `  </image>\n`;

    for (const recap of recaps) {
      const episodeUrl = `${DOMAIN}/podcasts/${recap.slug}/${recap.episodeSlug}`;
      const pubDate = recap.publishDate ? new Date(recap.publishDate).toUTCString() : new Date(recap.createdAt).toUTCString();

      let insightsHtml = "";
      if (recap.keyInsights && recap.keyInsights.length > 0) {
        insightsHtml = `<h3>Key Insights</h3><ul>${recap.keyInsights.map((i: string) => `<li>${escapeXml(i)}</li>`).join("")}</ul>`;
      }

      let quoteHtml = "";
      if (recap.quote) {
        quoteHtml = `<blockquote>"${escapeXml(recap.quote)}"${recap.quoteAttribution ? ` - ${escapeXml(recap.quoteAttribution)}` : ""}</blockquote>`;
      }

      const contentHtml = `<h2>${escapeXml(recap.episodeTitle)}</h2>` +
        `<p><strong>Podcast:</strong> ${escapeXml(recap.podcastName)}</p>` +
        (recap.hosts ? `<p><strong>Hosts:</strong> ${escapeXml(recap.hosts)}</p>` : "") +
        (recap.duration ? `<p><strong>Duration:</strong> ${escapeXml(recap.duration)}</p>` : "") +
        `<h3>TL;DL (Too Long; Didn't Listen)</h3><p>${escapeXml(recap.tldl)}</p>` +
        `<h3>What Happened</h3><p>${escapeXml(recap.whatHappened)}</p>` +
        insightsHtml +
        quoteHtml +
        `<p><a href="${episodeUrl}">Read full recap on PodCap</a></p>` +
        (recap.appleEpisodeUrl ? `<p><a href="${escapeXml(recap.appleEpisodeUrl)}">Listen on Apple Podcasts</a></p>` : "");

      xml += `  <item>\n`;
      xml += `    <title>${escapeXml(recap.podcastName + " - " + recap.episodeTitle)}</title>\n`;
      xml += `    <link>${episodeUrl}</link>\n`;
      xml += `    <guid isPermaLink="true">${episodeUrl}</guid>\n`;
      xml += `    <pubDate>${pubDate}</pubDate>\n`;
      xml += `    <dc:creator>${escapeXml(recap.podcastName)}</dc:creator>\n`;
      xml += `    <category>${escapeXml(recap.podcastName)}</category>\n`;
      xml += `    <description>${escapeXml(recap.tldl)}</description>\n`;
      xml += `    <content:encoded><![CDATA[${contentHtml}]]></content:encoded>\n`;
      if (recap.artworkUrl) {
        xml += `    <enclosure url="${escapeXml(recap.artworkUrl)}" type="image/jpeg" length="0"/>\n`;
      }
      xml += `  </item>\n`;
    }

    xml += `</channel>\n</rss>`;
    return xml;
  }

  app.get("/rss/all", async (_req, res) => {
    try {
      const recaps = await storage.getRecentRecapsForRss(null, 200);
      const DOMAIN = "https://podcap.io";
      const xml = buildRssXml(
        recaps,
        "PodCap - All Podcast Recaps",
        "AI-generated recaps of the latest episodes from top podcasts, delivered daily.",
        `${DOMAIN}/rss/all`
      );
      res.set("Content-Type", "application/rss+xml; charset=utf-8");
      res.set("Cache-Control", "public, max-age=900");
      res.send(xml);
    } catch (err) {
      console.error("RSS all feed error:", err);
      res.status(500).send("RSS feed error");
    }
  });

  app.get("/rss/feed/:slugKey", async (req, res) => {
    try {
      const feed = await storage.getRssFeedBySlugKey(req.params.slugKey);
      if (!feed) {
        return res.status(404).send("Feed not found");
      }
      const recaps = await storage.getRecentRecapsForRss(feed.podcastSlugs, 200);
      const DOMAIN = "https://podcap.io";
      const xml = buildRssXml(
        recaps,
        `PodCap - ${feed.name}`,
        `Custom podcast recap feed: ${feed.name}`,
        `${DOMAIN}/rss/feed/${feed.slugKey}`
      );
      res.set("Content-Type", "application/rss+xml; charset=utf-8");
      res.set("Cache-Control", "public, max-age=900");
      res.send(xml);
    } catch (err) {
      console.error("RSS custom feed error:", err);
      res.status(500).send("RSS feed error");
    }
  });

  app.get("/api/daily-drop/editions", async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT d.date, d.headline, d.subheadline,
                (SELECT COUNT(*) FROM landing_page_recaps r WHERE r.publish_date = d.date) as episode_count
         FROM daily_drop_editions d
         ORDER BY d.date DESC
         LIMIT 30`
      );

      const editions = rows.map((r: any) => ({
        date: r.date,
        headline: r.headline,
        subheadline: r.subheadline,
        episodeCount: parseInt(r.episode_count) || 0,
      }));

      res.json({ editions });
    } catch (err) {
      console.error("Daily drop editions error:", err);
      res.status(500).json({ message: "Failed to load editions" });
    }
  });

  app.get("/api/daily-drop/:date", async (req, res) => {
    try {
      let dateParam = req.params.date;

      if (dateParam === "latest") {
        const { rows: latestRows } = await pool.query(
          `SELECT date FROM daily_drop_editions ORDER BY date DESC LIMIT 1`
        );
        if (latestRows.length === 0) {
          return res.status(404).json({ message: "No editions available" });
        }
        dateParam = latestRows[0].date;
      }

      const { rows } = await pool.query(
        `SELECT date, headline, subheadline, body, episode_slugs FROM daily_drop_editions WHERE date = $1`,
        [dateParam]
      );

      if (rows.length === 0) {
        return res.status(404).json({ message: "No edition found for this date" });
      }

      const edition = rows[0];

      const { rows: episodeRows } = await pool.query(
        `SELECT slug, episode_slug, podcast_name, episode_title, tldl, artwork_url, duration, hosts
         FROM landing_page_recaps WHERE publish_date = $1 ORDER BY id`,
        [dateParam]
      );

      const { rows: navRows } = await pool.query(
        `SELECT date FROM daily_drop_editions WHERE date < $1 ORDER BY date DESC LIMIT 1`,
        [dateParam]
      );
      const { rows: navNextRows } = await pool.query(
        `SELECT date FROM daily_drop_editions WHERE date > $1 ORDER BY date ASC LIMIT 1`,
        [dateParam]
      );

      res.json({
        date: edition.date,
        headline: edition.headline,
        subheadline: edition.subheadline,
        body: edition.body,
        episodeSlugs: edition.episode_slugs || [],
        episodeCount: episodeRows.length,
        episodes: episodeRows.map((r: any) => ({
          slug: r.slug,
          episodeSlug: r.episode_slug,
          podcastName: r.podcast_name,
          episodeTitle: r.episode_title,
          tldl: r.tldl,
          artworkUrl: r.artwork_url,
          duration: r.duration,
          hosts: r.hosts,
        })),
        prevDate: navRows[0]?.date || null,
        nextDate: navNextRows[0]?.date || null,
      });
    } catch (err) {
      console.error("Daily drop error:", err);
      res.status(500).json({ message: "Failed to load daily drop" });
    }
  });

  app.get("/robots.txt", (_req, res) => {
    res.set("Content-Type", "text/plain");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(ROBOTS_TXT);
  });

  app.post("/api/support", async (req, res) => {
    const { email, message } = req.body;
    if (!email || !message) {
      return res.status(400).json({ message: "Email and message are required" });
    }
    try {
      const { client, fromEmail } = await getUncachableResendClient();
      await client.emails.send({
        from: `PodCap Support <${fromEmail}>`,
        to: "hiderekjohnson@gmail.com",
        replyTo: email,
        subject: `Support Request from ${email}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 520px; padding: 24px;">
            <h2 style="margin: 0 0 16px; font-size: 18px; color: #1a1a1a;">New Support Request</h2>
            <div style="background: #f8f8f8; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
              <p style="margin: 0 0 8px; font-size: 14px;"><strong>From:</strong> ${email}</p>
              <p style="margin: 0; font-size: 14px; white-space: pre-wrap;"><strong>Message:</strong><br/>${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
            </div>
            <p style="margin: 0; font-size: 12px; color: #999;">Reply directly to this email to respond to the user.</p>
          </div>
        `,
      });
      res.json({ message: "Support request sent" });
    } catch (err) {
      console.error("[Support] Failed to send support email:", err);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  const PgStore = connectPgSimple(session);

  app.set("trust proxy", 1);

  app.use(
    session({
      store: new PgStore({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    })
  );

  app.get(api.auth.me.path, async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUserById(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "User not found" });
    }
    res.json(user);
  });

  app.post(api.auth.register.path, async (req, res) => {
    try {
      const input = api.auth.register.input.parse(req.body);

      const existing = await storage.getUserByEmail(input.email);
      if (existing) {
        return res.status(400).json({
          message: "An account with this email already exists. Please log in instead.",
          field: "email",
        });
      }

      const user = await storage.createUser(input);
      req.session.userId = user.id;
      res.status(201).json(user);

      if (input.podcasts && input.podcasts.length > 0) {
        autoPopulateDirectory(input.podcasts).catch(() => {});
      }

      sendNewUserNotification(user, req, req.body.signupSource).catch((err) =>
        console.error("[NewUserNotify] Failed:", err)
      );
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  app.post(api.auth.login.path, async (req, res) => {
    try {
      const input = api.auth.login.input.parse(req.body);
      const user = await storage.getUserByEmail(input.email);
      if (!user) {
        return res.status(404).json({
          message: "No account found with this email address.",
        });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await storage.createMagicLink(user.email, token, expiresAt);

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const magicUrl = `${baseUrl}/api/auth/magic?token=${token}`;

      const loginCode = crypto.randomBytes(2).toString("hex").toUpperCase();

      const { client, fromEmail } = await getUncachableResendClient();
      const sendResult = await client.emails.send({
        from: `PodCap <${fromEmail}>`,
        to: user.email,
        subject: `Log in to PodCap (#${loginCode})`,
        headers: {
          "X-Entity-Ref-ID": crypto.randomUUID(),
        },
        html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#1d4ed8,#2563eb);padding:32px 24px;text-align:center;">
      <h1 style="color:#ffffff;font-size:24px;font-weight:800;margin:0;">PodCap</h1>
    </div>
    <div style="padding:32px 28px;text-align:center;">
      <h2 style="color:#1a1a1a;font-size:20px;font-weight:700;margin:0 0 12px 0;">Log in to PodCap</h2>
      <p style="color:#6b7280;font-size:15px;line-height:1.6;margin:0 0 24px 0;">Click the button below to securely log in. This link expires in 15 minutes.</p>
      <a href="${magicUrl}" style="display:inline-block;padding:14px 32px;background:#2563eb;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:10px;box-shadow:0 4px 12px rgba(37,99,235,0.3);">Log in to PodCap</a>
      <p style="color:#9ca3af;font-size:12px;margin:24px 0 0 0;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>`,
      });

      if (sendResult.error) {
        console.error("Magic link email error:", JSON.stringify(sendResult.error));
        return res.status(500).json({ message: "Failed to send login email. Please try again." });
      }

      res.json({ message: "Magic link sent! Check your email." });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  app.get("/api/auth/magic", async (req, res) => {
    const token = req.query.token as string;
    if (!token) {
      return res.redirect("/login?error=invalid");
    }

    const magicLink = await storage.getMagicLinkByToken(token);
    if (!magicLink) {
      return res.redirect("/login?error=expired");
    }

    const user = await storage.getUserByEmail(magicLink.email);
    if (!user) {
      return res.redirect("/login?error=invalid");
    }

    await storage.markMagicLinkUsed(magicLink.id);
    req.session.userId = user.id;

    req.session.save(() => {
      res.redirect("/dashboard");
    });
  });

  if (process.env.NODE_ENV === "development") {
    app.get("/api/auth/dev-login", async (req, res) => {
      const email = req.query.email as string;
      if (!email) return res.status(400).json({ message: "Email required" });
      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(404).json({ message: "User not found" });
      req.session.userId = user.id;
      req.session.save(() => {
        res.redirect("/dashboard");
      });
    });
  }

  app.post(api.auth.logout.path, (req, res) => {
    req.session.destroy(() => {
      res.json({ message: "Logged out" });
    });
  });

  app.delete("/api/account", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const { confirmation } = req.body || {};
    if (confirmation !== "DELETE") {
      return res.status(400).json({ message: "Please type DELETE to confirm account deletion" });
    }
    const user = await storage.getUserById(req.session.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.plan === "pro") {
      return res.status(400).json({ message: "Please cancel your Pro subscription before deleting your account" });
    }
    try {
      await storage.deleteUser(user.id);
      req.session.destroy(() => {
        res.json({ message: "Account deleted successfully" });
      });
    } catch (err: any) {
      console.error("Failed to delete account:", err);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  const TRACKING_PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  app.get("/api/track/open/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!isNaN(id)) {
        await storage.markEmailOpened(id);
      }
    } catch (e) {
    }
    res.set({
      "Content-Type": "image/gif",
      "Content-Length": String(TRACKING_PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    });
    res.end(TRACKING_PIXEL);
  });

  app.get("/api/podcasts/directory", async (_req, res) => {
    try {
      const cached = directoryCache.podcastsDirectory.get();
      if (cached) return res.json(cached);
      const result = await pool.query(
        `SELECT slug, name, artwork_url FROM podcast_directory WHERE slug IS NOT NULL ORDER BY name ASC`
      );
      directoryCache.podcastsDirectory.set(result.rows);
      res.json(result.rows);
    } catch (err) {
      console.error("[Directory] Error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/podcasts/search", async (req, res) => {
    const term = req.query.term as string;
    if (!term || term.trim().length < 2) {
      return res.json({ results: [] });
    }
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=podcast&entity=podcast&limit=8`;
      const response = await fetch(url);
      const data = await response.json();
      const results = (data.results || []).map((item: any) => ({
        id: String(item.collectionId),
        name: item.collectionName,
        artistName: item.artistName,
        artworkUrl: (item.artworkUrl600 || item.artworkUrl100 || "").replace(/\d+x\d+bb/, "1200x1200bb"),
      }));
      res.json({ results });
    } catch {
      res.json({ results: [] });
    }
  });

  const ENTITY_PEOPLE = [
    { slug: "elon-musk", name: "Elon Musk", title: "CEO of Tesla & SpaceX", gender: "male", category: "Tech & AI", searchTerms: ["Elon Musk"], hostedSlugs: [] as string[] },
    { slug: "sam-altman", name: "Sam Altman", title: "CEO of OpenAI", gender: "male", category: "Tech & AI", searchTerms: ["Sam Altman"], hostedSlugs: [] },
    { slug: "joe-rogan", name: "Joe Rogan", title: "Host of The Joe Rogan Experience", gender: "male", category: "Entertainment", searchTerms: ["Joe Rogan"], hostedSlugs: ["joerogan"] },
    { slug: "lex-fridman", name: "Lex Fridman", title: "Host of Lex Fridman Podcast", gender: "male", category: "Tech & AI", searchTerms: ["Lex Fridman"], hostedSlugs: ["lexfridman"] },
    { slug: "naval-ravikant", name: "Naval Ravikant", title: "Co-founder of AngelList", gender: "male", category: "Venture Capital", searchTerms: ["Naval Ravikant", "Naval"], hostedSlugs: [] },
    { slug: "peter-thiel", name: "Peter Thiel", title: "Co-founder of PayPal & Palantir", gender: "male", category: "Venture Capital", searchTerms: ["Peter Thiel", "Thiel"], hostedSlugs: [] },
    { slug: "chamath-palihapitiya", name: "Chamath Palihapitiya", title: "CEO of Social Capital", gender: "male", category: "Venture Capital", searchTerms: ["Chamath Palihapitiya", "Chamath"], hostedSlugs: ["allin"] },
    { slug: "jason-calacanis", name: "Jason Calacanis", title: "Angel Investor & Host of This Week in Startups", gender: "male", category: "Venture Capital", searchTerms: ["Jason Calacanis", "Calacanis"], hostedSlugs: ["allin", "thisweekinstartups"] },
    { slug: "marc-andreessen", name: "Marc Andreessen", title: "Co-founder of Andreessen Horowitz", gender: "male", category: "Venture Capital", searchTerms: ["Marc Andreessen", "Andreessen"], hostedSlugs: ["a16z"] },
    { slug: "jensen-huang", name: "Jensen Huang", title: "CEO of NVIDIA", gender: "male", category: "Tech & AI", searchTerms: ["Jensen Huang"], hostedSlugs: [] },
    { slug: "alex-hormozi", name: "Alex Hormozi", title: "Founder of Acquisition.com", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Alex Hormozi", "Hormozi"], hostedSlugs: ["alexhormozi"] },
    { slug: "gary-vaynerchuk", name: "Gary Vaynerchuk", title: "CEO of VaynerMedia", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Gary Vaynerchuk", "GaryVee", "Gary Vee"], hostedSlugs: ["garyvee"] },
    { slug: "codie-sanchez", name: "Codie Sanchez", title: "Founder of Contrarian Thinking", gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Codie Sanchez"], hostedSlugs: [] },
    { slug: "sahil-bloom", name: "Sahil Bloom", title: "Writer & Investor", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Sahil Bloom"], hostedSlugs: [] },
    { slug: "andrew-huberman", name: "Dr. Andrew Huberman", title: "Neuroscientist & Host of Huberman Lab", gender: "male", category: "Science & Health", searchTerms: ["Andrew Huberman", "Huberman"], hostedSlugs: ["hubermanlab"] },
    { slug: "seth-godin", name: "Seth Godin", title: "Author & Marketing Legend", gender: "male", category: "Author & Thought Leader", searchTerms: ["Seth Godin"], hostedSlugs: [] },
    { slug: "chris-do", name: "Chris Do", title: "Founder of The Futur", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Chris Do"], hostedSlugs: [] },
    { slug: "scott-galloway", name: "Scott Galloway", title: "Professor at NYU Stern & Host of Prof G", gender: "male", category: "Media & Journalism", searchTerms: ["Scott Galloway", "Galloway"], hostedSlugs: ["profgmarkets", "profgpod", "pivot"] },
    { slug: "simon-sinek", name: "Simon Sinek", title: "Author & Motivational Speaker", gender: "male", category: "Author & Thought Leader", searchTerms: ["Simon Sinek"], hostedSlugs: [] },
    { slug: "adam-grant", name: "Adam Grant", title: "Organizational Psychologist at Wharton", gender: "male", category: "Author & Thought Leader", searchTerms: ["Adam Grant"], hostedSlugs: ["worklife"] },
    { slug: "ramit-sethi", name: "Ramit Sethi", title: "Author of 'I Will Teach You to Be Rich'", gender: "male", category: "Finance & Investing", searchTerms: ["Ramit Sethi"], hostedSlugs: [] },
    { slug: "ryan-holiday", name: "Ryan Holiday", title: "Author & Host of Daily Stoic", gender: "male", category: "Author & Thought Leader", searchTerms: ["Ryan Holiday"], hostedSlugs: ["dailystoic"] },
    { slug: "tim-ferriss", name: "Tim Ferriss", title: "Author & Host of The Tim Ferriss Show", gender: "male", category: "Author & Thought Leader", searchTerms: ["Tim Ferriss", "Ferriss"], hostedSlugs: ["timferriss"] },
    { slug: "mark-cuban", name: "Mark Cuban", title: "Entrepreneur & Investor", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Mark Cuban"], hostedSlugs: [] },
    { slug: "patrick-bet-david", name: "Patrick Bet-David", title: "Founder of Valuetainment", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Patrick Bet-David", "PBD"], hostedSlugs: ["valuetainment"] },
    { slug: "james-clear", name: "James Clear", title: "Author of 'Atomic Habits'", gender: "male", category: "Author & Thought Leader", searchTerms: ["James Clear"], hostedSlugs: [] },
    { slug: "jenna-kutcher", name: "Jenna Kutcher", title: "Entrepreneur & Host of The Goal Digger Podcast", gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Jenna Kutcher"], hostedSlugs: ["goal-digger"] },
    { slug: "amy-porterfield", name: "Amy Porterfield", title: "Online Marketing Expert & Podcast Host", gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Amy Porterfield"], hostedSlugs: ["amyporterfield"] },
    { slug: "john-lee-dumas", name: "John Lee Dumas", title: "Host of Entrepreneurs on Fire", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["John Lee Dumas", "JLD"], hostedSlugs: ["entrepreneursonfire"] },
    { slug: "sam-parr", name: "Sam Parr", title: "Co-host of My First Million", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Sam Parr"], hostedSlugs: ["myfirstmillion"] },
    { slug: "shaan-puri", name: "Shaan Puri", title: "Co-host of My First Million", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Shaan Puri"], hostedSlugs: ["myfirstmillion"] },
    { slug: "justin-welsh", name: "Justin Welsh", title: "Solopreneur & LinkedIn Creator", gender: "male", category: "Creator & Influencer", searchTerms: ["Justin Welsh"], hostedSlugs: [] },
    { slug: "hala-taha", name: "Hala Taha", title: "Host of Young and Profiting Podcast", gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Hala Taha"], hostedSlugs: ["youngandprofiting"] },
    { slug: "noah-kagan", name: "Noah Kagan", title: "CEO of AppSumo", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Noah Kagan"], hostedSlugs: ["noahkagan"] },
    { slug: "aaron-levie", name: "Aaron Levie", title: "CEO of Box", gender: "male", category: "Tech & AI", searchTerms: ["Aaron Levie", "Levie"], hostedSlugs: [] },
    { slug: "matthew-prince", name: "Matthew Prince", title: "CEO of Cloudflare", gender: "male", category: "Tech & AI", searchTerms: ["Matthew Prince"], hostedSlugs: [] },
    { slug: "luis-von-ahn", name: "Luis von Ahn", title: "CEO of Duolingo", gender: "male", category: "Tech & AI", searchTerms: ["Luis von Ahn"], hostedSlugs: [] },
    { slug: "alex-karp", name: "Alex Karp", title: "CEO of Palantir", gender: "male", category: "Tech & AI", searchTerms: ["Alex Karp"], hostedSlugs: [] },
    { slug: "brian-chesky", name: "Brian Chesky", title: "CEO of Airbnb", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Brian Chesky"], hostedSlugs: [] },
    { slug: "daniel-ek", name: "Daniel Ek", title: "CEO of Spotify", gender: "male", category: "Tech & AI", searchTerms: ["Daniel Ek"], hostedSlugs: [] },
    { slug: "brian-armstrong", name: "Brian Armstrong", title: "CEO of Coinbase", gender: "male", category: "Finance & Investing", searchTerms: ["Brian Armstrong"], hostedSlugs: [] },
    { slug: "george-kurtz", name: "George Kurtz", title: "CEO of CrowdStrike", gender: "male", category: "Tech & AI", searchTerms: ["George Kurtz"], hostedSlugs: [] },
    { slug: "ariane-gorin", name: "Ariane Gorin", title: "CEO of Expedia Group", gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Ariane Gorin"], hostedSlugs: [] },
    { slug: "jeremy-allaire", name: "Jeremy Allaire", title: "CEO of Circle", gender: "male", category: "Finance & Investing", searchTerms: ["Jeremy Allaire"], hostedSlugs: [] },
    { slug: "dharmesh-shah", name: "Dharmesh Shah", title: "Co-founder & CTO of HubSpot", gender: "male", category: "Tech & AI", searchTerms: ["Dharmesh Shah"], hostedSlugs: [] },
    { slug: "jason-robins", name: "Jason Robins", title: "CEO of DraftKings", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Jason Robins"], hostedSlugs: [] },
    { slug: "mark-zuckerberg", name: "Mark Zuckerberg", title: "CEO of Meta", gender: "male", category: "Tech & AI", searchTerms: ["Mark Zuckerberg", "Zuckerberg"], hostedSlugs: [] },
    { slug: "satya-nadella", name: "Satya Nadella", title: "CEO of Microsoft", gender: "male", category: "Tech & AI", searchTerms: ["Satya Nadella", "Nadella"], hostedSlugs: [] },
    { slug: "tim-cook", name: "Tim Cook", title: "CEO of Apple", gender: "male", category: "Tech & AI", searchTerms: ["Tim Cook"], hostedSlugs: [] },
    { slug: "jeff-bezos", name: "Jeff Bezos", title: "Founder of Amazon & Blue Origin", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Jeff Bezos", "Bezos"], hostedSlugs: [] },
    { slug: "reed-hastings", name: "Reed Hastings", title: "Co-founder of Netflix", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Reed Hastings"], hostedSlugs: [] },
    { slug: "marc-benioff", name: "Marc Benioff", title: "CEO of Salesforce", gender: "male", category: "Tech & AI", searchTerms: ["Marc Benioff", "Benioff"], hostedSlugs: [] },
    { slug: "ken-griffin", name: "Ken Griffin", title: "Founder of Citadel", gender: "male", category: "Finance & Investing", searchTerms: ["Ken Griffin"], hostedSlugs: [] },
    { slug: "martina-cheung", name: "Martina Cheung", title: "CEO of S&P Global", gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Martina Cheung"], hostedSlugs: [] },
    { slug: "patrick-smith", name: "Patrick Smith", title: "CEO of Axon Enterprise", gender: "male", category: "Tech & AI", searchTerms: ["Patrick Smith", "Rick Smith"], hostedSlugs: [] },
    { slug: "sridhar-ramaswamy", name: "Sridhar Ramaswamy", title: "CEO of Snowflake", gender: "male", category: "Tech & AI", searchTerms: ["Sridhar Ramaswamy"], hostedSlugs: [] },
    { slug: "brian-niccol", name: "Brian Niccol", title: "CEO of Starbucks", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Brian Niccol"], hostedSlugs: [] },
    { slug: "kevin-scott", name: "Kevin Scott", title: "CTO of Microsoft", gender: "male", category: "Tech & AI", searchTerms: ["Kevin Scott"], hostedSlugs: [] },
    { slug: "andrew-bosworth", name: "Andrew Bosworth", title: "CTO of Meta", gender: "male", category: "Tech & AI", searchTerms: ["Andrew Bosworth", "Bosworth"], hostedSlugs: [] },
    { slug: "kevin-weil", name: "Kevin Weil", title: "Chief Product Officer at OpenAI", gender: "male", category: "Tech & AI", searchTerms: ["Kevin Weil"], hostedSlugs: [] },
    { slug: "scott-belsky", name: "Scott Belsky", title: "Chief Strategy Officer at Adobe", gender: "male", category: "Tech & AI", searchTerms: ["Scott Belsky"], hostedSlugs: [] },
    { slug: "harley-finkelstein", name: "Harley Finkelstein", title: "President of Shopify", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Harley Finkelstein"], hostedSlugs: [] },
    { slug: "mustafa-suleyman", name: "Mustafa Suleyman", title: "CEO of Microsoft AI", gender: "male", category: "Tech & AI", searchTerms: ["Mustafa Suleyman"], hostedSlugs: [] },
    { slug: "alexandr-wang", name: "Alexandr Wang", title: "CEO of Scale AI", gender: "male", category: "Tech & AI", searchTerms: ["Alexandr Wang"], hostedSlugs: [] },
    { slug: "aravind-srinivas", name: "Aravind Srinivas", title: "CEO of Perplexity", gender: "male", category: "Tech & AI", searchTerms: ["Aravind Srinivas"], hostedSlugs: [] },
    { slug: "tobi-lutke", name: "Tobi Lütke", title: "CEO of Shopify", gender: "male", category: "Tech & AI", searchTerms: ["Tobi Lütke", "Tobi Lutke", "Tobias Lütke"], hostedSlugs: [] },
    { slug: "andrew-wilkinson", name: "Andrew Wilkinson", title: "Founder of Tiny", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Andrew Wilkinson"], hostedSlugs: [] },
    { slug: "steph-smith", name: "Steph Smith", title: "Head of Paid at a16z & Writer",  gender: "female", category: "Tech & AI", searchTerms: ["Steph Smith"], hostedSlugs: [] },
    { slug: "nick-gray", name: "Nick Gray", title: "Author of \'The 2-Hour Cocktail Party\'",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Nick Gray"], hostedSlugs: [] },
    { slug: "nick-huber", name: "Nick Huber", title: "Founder of Storage Squad & The Sweaty Startup",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Nick Huber"], hostedSlugs: [] },
    { slug: "neville-medhora", name: "Neville Medhora", title: "Copywriter & Founder of Kopywriting Kourse",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Neville Medhora"], hostedSlugs: [] },
    { slug: "ramon-van-meer", name: "Ramon Van Meer", title: "Entrepreneur & Investor",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Ramon Van Meer"], hostedSlugs: [] },
    { slug: "greg-isenberg", name: "Greg Isenberg", title: "CEO of Late Checkout",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Greg Isenberg"], hostedSlugs: [] },
    { slug: "nik-sharma", name: "Nik Sharma", title: "CEO of Sharma Brands",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Nik Sharma"], hostedSlugs: [] },
    { slug: "moiz-ali", name: "Moiz Ali", title: "Founder of Native Deodorant",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Moiz Ali"], hostedSlugs: [] },
    { slug: "chenell-basilio", name: "Chenell Basilio", title: "Writer & Growth Analyst",  gender: "female", category: "Creator & Influencer", searchTerms: ["Chenell Basilio"], hostedSlugs: [] },
    { slug: "nathan-barry", name: "Nathan Barry", title: "Founder & CEO of Kit (ConvertKit)",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Nathan Barry"], hostedSlugs: [] },
    { slug: "jesse-itzler", name: "Jesse Itzler", title: "Entrepreneur & Author",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Jesse Itzler"], hostedSlugs: [] },
    { slug: "elena-verna", name: "Elena Verna", title: "Growth Advisor & Board Member",  gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Elena Verna"], hostedSlugs: [] },
    { slug: "jenny-wen", name: "Jenny Wen", title: "Tech Executive & Investor",  gender: "female", category: "Tech & AI", searchTerms: ["Jenny Wen"], hostedSlugs: [] },
    { slug: "boris-cherny", name: "Boris Cherny", title: "Software Engineer & Author",  gender: "male", category: "Tech & AI", searchTerms: ["Boris Cherny"], hostedSlugs: [] },
    { slug: "qasar-younis", name: "Qasar Younis", title: "CEO of Applied Intuition",  gender: "male", category: "Tech & AI", searchTerms: ["Qasar Younis"], hostedSlugs: [] },
    { slug: "jeetu-patel", name: "Jeetu Patel", title: "EVP & GM at Cisco",  gender: "male", category: "Tech & AI", searchTerms: ["Jeetu Patel"], hostedSlugs: [] },
    { slug: "brian-halligan", name: "Brian Halligan", title: "Co-founder of HubSpot",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Brian Halligan"], hostedSlugs: [] },
    { slug: "sherwin-wu", name: "Sherwin Wu", title: "Investor & Technologist",  gender: "male", category: "Venture Capital", searchTerms: ["Sherwin Wu"], hostedSlugs: [] },
    { slug: "lazar-jovanovic", name: "Lazar Jovanovic", title: "Entrepreneur & Growth Expert",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Lazar Jovanovic"], hostedSlugs: [] },
    { slug: "katelyn-bourgoin", name: "Katelyn Bourgoin", title: "Founder of Customer Camp",  gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Katelyn Bourgoin"], hostedSlugs: [] },
    { slug: "amanda-goetz", name: "Amanda Goetz", title: "Founder of House of Wise",  gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Amanda Goetz"], hostedSlugs: [] },
    { slug: "chris-hutchins", name: "Chris Hutchins", title: "Host of All the Hacks",  gender: "male", category: "Finance & Investing", searchTerms: ["Chris Hutchins"], hostedSlugs: ["allthehacks"] },
    { slug: "sieva-kozinsky", name: "Sieva Kozinsky", title: "Co-founder of EndLayer",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Sieva Kozinsky"], hostedSlugs: [] },
    { slug: "xavier-helgesen", name: "Xavier Helgesen", title: "Co-founder of Better World Books",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Xavier Helgesen"], hostedSlugs: [] },
    { slug: "bill-girdley", name: "Bill Girdley", title: "Tech Executive & Entrepreneur",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Bill Girdley"], hostedSlugs: [] },
    { slug: "bill-gurley", name: "Bill Gurley", title: "General Partner at Benchmark",  gender: "male", category: "Venture Capital", searchTerms: ["Bill Gurley"], hostedSlugs: ["bg2pod"] },
    { slug: "brad-gerstner", name: "Brad Gerstner", title: "Founder & CEO of Altimeter Capital",  gender: "male", category: "Venture Capital", searchTerms: ["Brad Gerstner"], hostedSlugs: ["bg2pod"] },
    { slug: "roelof-botha", name: "Roelof Botha", title: "Managing Partner at Sequoia Capital",  gender: "male", category: "Venture Capital", searchTerms: ["Roelof Botha"], hostedSlugs: [] },
    { slug: "doug-leone", name: "Doug Leone", title: "Former Managing Partner at Sequoia Capital",  gender: "male", category: "Venture Capital", searchTerms: ["Doug Leone"], hostedSlugs: [] },
    { slug: "elad-gil", name: "Elad Gil", title: "Entrepreneur, Investor & Author",  gender: "male", category: "Venture Capital", searchTerms: ["Elad Gil"], hostedSlugs: [] },
    { slug: "vinod-khosla", name: "Vinod Khosla", title: "Founder of Khosla Ventures",  gender: "male", category: "Venture Capital", searchTerms: ["Vinod Khosla"], hostedSlugs: [] },
    { slug: "ben-horowitz", name: "Ben Horowitz", title: "Co-founder of Andreessen Horowitz",  gender: "male", category: "Venture Capital", searchTerms: ["Ben Horowitz"], hostedSlugs: [] },
    { slug: "reid-hoffman", name: "Reid Hoffman", title: "Co-founder of LinkedIn & Partner at Greylock",  gender: "male", category: "Venture Capital", searchTerms: ["Reid Hoffman"], hostedSlugs: [] },
    { slug: "keith-rabois", name: "Keith Rabois", title: "General Partner at Khosla Ventures",  gender: "male", category: "Venture Capital", searchTerms: ["Keith Rabois"], hostedSlugs: [] },
    { slug: "garry-tan", name: "Garry Tan", title: "President & CEO of Y Combinator",  gender: "male", category: "Venture Capital", searchTerms: ["Garry Tan"], hostedSlugs: [] },
    { slug: "david-sacks", name: "David Sacks", title: "General Partner at Craft Ventures",  gender: "male", category: "Venture Capital", searchTerms: ["David Sacks"], hostedSlugs: ["allin"] },
    { slug: "rick-zullo", name: "Rick Zullo", title: "Co-founder of Equal Ventures",  gender: "male", category: "Venture Capital", searchTerms: ["Rick Zullo"], hostedSlugs: [] },
    { slug: "semil-shah", name: "Semil Shah", title: "Founder of Haystack",  gender: "male", category: "Venture Capital", searchTerms: ["Semil Shah"], hostedSlugs: [] },
    { slug: "jeff-jordan", name: "Jeff Jordan", title: "General Partner at a16z",  gender: "male", category: "Venture Capital", searchTerms: ["Jeff Jordan"], hostedSlugs: [] },
    { slug: "hunter-walk", name: "Hunter Walk", title: "Co-founder of Homebrew",  gender: "male", category: "Venture Capital", searchTerms: ["Hunter Walk"], hostedSlugs: [] },
    { slug: "li-jin", name: "Li Jin", title: "Co-founder of Variant",  gender: "female", category: "Venture Capital", searchTerms: ["Li Jin"], hostedSlugs: [] },
    { slug: "harry-stebbings", name: "Harry Stebbings", title: "Founder of 20VC",  gender: "male", category: "Venture Capital", searchTerms: ["Harry Stebbings"], hostedSlugs: ["twentyminutevc"] },
    { slug: "turner-novak", name: "Turner Novak", title: "Founder of Banana Capital",  gender: "male", category: "Venture Capital", searchTerms: ["Turner Novak"], hostedSlugs: [] },
    { slug: "rowan-cheung", name: "Rowan Cheung", title: "Founder of The Rundown AI",  gender: "male", category: "Tech & AI", searchTerms: ["Rowan Cheung"], hostedSlugs: [] },
    { slug: "matt-wolfe", name: "Matt Wolfe", title: "AI Tools Reviewer & Creator",  gender: "male", category: "Tech & AI", searchTerms: ["Matt Wolfe"], hostedSlugs: [] },
    { slug: "linus-ekenstam", name: "Linus Ekenstam", title: "AI Creator & Designer",  gender: "male", category: "Tech & AI", searchTerms: ["Linus Ekenstam"], hostedSlugs: [] },
    { slug: "varun-mayya", name: "Varun Mayya", title: "Founder of Avalon Labs",  gender: "male", category: "Tech & AI", searchTerms: ["Varun Mayya"], hostedSlugs: [] },
    { slug: "matt-shumer", name: "Matt Shumer", title: "CEO of HyperWrite AI",  gender: "male", category: "Tech & AI", searchTerms: ["Matt Shumer"], hostedSlugs: [] },
    { slug: "gergely-orosz", name: "Gergely Orosz", title: "Author of The Pragmatic Engineer",  gender: "male", category: "Tech & AI", searchTerms: ["Gergely Orosz"], hostedSlugs: [] },
    { slug: "justin-moore", name: "Justin Moore", title: "Founder of Creator Wizard",  gender: "male", category: "Creator & Influencer", searchTerms: ["Justin Moore"], hostedSlugs: [] },
    { slug: "andreas-klinger", name: "Andreas Klinger", title: "CTO of On Deck & Angel Investor",  gender: "male", category: "Tech & AI", searchTerms: ["Andreas Klinger"], hostedSlugs: [] },
    { slug: "packy-mccormick", name: "Packy McCormick", title: "Founder of Not Boring",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Packy McCormick"], hostedSlugs: [] },
    { slug: "zain-kahn", name: "Zain Kahn", title: "Founder of Superhuman AI Newsletter",  gender: "male", category: "Tech & AI", searchTerms: ["Zain Kahn"], hostedSlugs: [] },
    { slug: "ben-tossell", name: "Ben Tossell", title: "Founder of Ben\'s Bites",  gender: "male", category: "Tech & AI", searchTerms: ["Ben Tossell"], hostedSlugs: [] },
    { slug: "ben-thompson", name: "Ben Thompson", title: "Founder of Stratechery",  gender: "male", category: "Media & Journalism", searchTerms: ["Ben Thompson"], hostedSlugs: ["exponent"] },
    { slug: "alex-kantrowitz", name: "Alex Kantrowitz", title: "Founder of Big Technology",  gender: "male", category: "Media & Journalism", searchTerms: ["Alex Kantrowitz"], hostedSlugs: ["bigtechnology"] },
    { slug: "kara-swisher", name: "Kara Swisher", title: "Tech Journalist & Host of Pivot",  gender: "female", category: "Media & Journalism", searchTerms: ["Kara Swisher"], hostedSlugs: ["pivot"] },
    { slug: "casey-newton", name: "Casey Newton", title: "Founder of Platformer",  gender: "male", category: "Media & Journalism", searchTerms: ["Casey Newton"], hostedSlugs: ["hardfork"] },
    { slug: "jason-hiner", name: "Jason Hiner", title: "Editor-in-Chief at ZDNET",  gender: "male", category: "Media & Journalism", searchTerms: ["Jason Hiner"], hostedSlugs: [] },
    { slug: "becca-farsace", name: "Becca Farsace", title: "Video Producer at The Verge",  gender: "female", category: "Media & Journalism", searchTerms: ["Becca Farsace"], hostedSlugs: [] },
    { slug: "emma-roth", name: "Emma Roth", title: "News Writer at The Verge",  gender: "female", category: "Media & Journalism", searchTerms: ["Emma Roth"], hostedSlugs: [] },
    { slug: "allison-johnson", name: "Allison Johnson", title: "Senior Editor at The Verge",  gender: "female", category: "Media & Journalism", searchTerms: ["Allison Johnson"], hostedSlugs: [] },
    { slug: "tiago-forte", name: "Tiago Forte", title: "Author of \'Building a Second Brain\'",  gender: "male", category: "Author & Thought Leader", searchTerms: ["Tiago Forte"], hostedSlugs: [] },
    { slug: "dickie-bush", name: "Dickie Bush", title: "Co-founder of Ship 30 for 30",  gender: "male", category: "Creator & Influencer", searchTerms: ["Dickie Bush"], hostedSlugs: [] },
    { slug: "nicolas-cole", name: "Nicolas Cole", title: "Co-founder of Ship 30 for 30 & Author",  gender: "male", category: "Creator & Influencer", searchTerms: ["Nicolas Cole"], hostedSlugs: [] },
    { slug: "ashton-kutcher", name: "Ashton Kutcher", title: "Actor & Tech Investor",  gender: "male", category: "Entertainment", searchTerms: ["Ashton Kutcher"], hostedSlugs: [] },
    { slug: "ryan-reynolds", name: "Ryan Reynolds", title: "Actor & Entrepreneur",  gender: "male", category: "Entertainment", searchTerms: ["Ryan Reynolds"], hostedSlugs: [] },
    { slug: "rick-beato", name: "Rick Beato", title: "Music Producer & YouTube Creator",  gender: "male", category: "Entertainment", searchTerms: ["Rick Beato"], hostedSlugs: [] },
    { slug: "theo-von", name: "Theo Von", title: "Comedian & Podcast Host",  gender: "male", category: "Entertainment", searchTerms: ["Theo Von"], hostedSlugs: ["theovon"] },
    { slug: "mrbeast", name: "MrBeast", title: "YouTube Creator & Entrepreneur",  gender: "male", category: "Creator & Influencer", searchTerms: ["MrBeast"], hostedSlugs: [] },
    { slug: "logan-paul", name: "Logan Paul", title: "Creator, Wrestler & Entrepreneur",  gender: "male", category: "Creator & Influencer", searchTerms: ["Logan Paul"], hostedSlugs: [] },
    { slug: "bobbi-althoff", name: "Bobbi Althoff", title: "Podcast Host & Creator",  gender: "female", category: "Creator & Influencer", searchTerms: ["Bobbi Althoff"], hostedSlugs: ["reallygoodpodcast"] },
    { slug: "alex-cooper", name: "Alex Cooper", title: "Host of Call Her Daddy",  gender: "female", category: "Creator & Influencer", searchTerms: ["Alex Cooper"], hostedSlugs: ["callherdaddy"] },
    { slug: "alix-earle", name: "Alix Earle", title: "Social Media Influencer & Creator",  gender: "female", category: "Creator & Influencer", searchTerms: ["Alix Earle"], hostedSlugs: [] },
    { slug: "matthew-mcconaughey", name: "Matthew McConaughey", title: "Actor & Author",  gender: "male", category: "Entertainment", searchTerms: ["Matthew McConaughey"], hostedSlugs: [] },
    { slug: "arnold-schwarzenegger", name: "Arnold Schwarzenegger", title: "Actor, Former Governor & Entrepreneur",  gender: "male", category: "Entertainment", searchTerms: ["Arnold Schwarzenegger"], hostedSlugs: [] },
    { slug: "jordan-peterson", name: "Jordan Peterson", title: "Psychologist & Author",  gender: "male", category: "Author & Thought Leader", searchTerms: ["Jordan Peterson"], hostedSlugs: [] },
    { slug: "whitney-cummings", name: "Whitney Cummings", title: "Comedian & Podcast Host",  gender: "female", category: "Entertainment", searchTerms: ["Whitney Cummings"], hostedSlugs: [] },
    { slug: "neil-degrasse-tyson", name: "Neil deGrasse Tyson", title: "Astrophysicist & Science Communicator",  gender: "male", category: "Science & Health", searchTerms: ["Neil deGrasse Tyson"], hostedSlugs: ["startalkradio"] },
    { slug: "coco-mocoe", name: "Coco Mocoe", title: "Creator & Entrepreneur",  gender: "female", category: "Creator & Influencer", searchTerms: ["Coco Mocoe"], hostedSlugs: [] },
    { slug: "david-dobrik", name: "David Dobrik", title: "YouTube Creator & Entrepreneur",  gender: "male", category: "Creator & Influencer", searchTerms: ["David Dobrik"], hostedSlugs: [] },
    { slug: "stevewilldoit", name: "SteveWillDoIt", title: "YouTube Creator & Entertainer",  gender: "male", category: "Creator & Influencer", searchTerms: ["SteveWillDoIt"], hostedSlugs: [] },
    { slug: "dave-portnoy", name: "Dave Portnoy", title: "Founder of Barstool Sports",  gender: "male", category: "Media & Journalism", searchTerms: ["Dave Portnoy"], hostedSlugs: ["bfrpodcast"] },
    { slug: "kai-cenat", name: "Kai Cenat", title: "Twitch Streamer & Creator",  gender: "male", category: "Creator & Influencer", searchTerms: ["Kai Cenat"], hostedSlugs: [] },
    { slug: "ishowspeed", name: "IShowSpeed", title: "YouTube Streamer & Creator",  gender: "male", category: "Creator & Influencer", searchTerms: ["IShowSpeed"], hostedSlugs: [] },
    { slug: "druski", name: "Druski", title: "Comedian & Creator",  gender: "male", category: "Entertainment", searchTerms: ["Druski"], hostedSlugs: [] },
    { slug: "josh-richards", name: "Josh Richards", title: "Creator & Entrepreneur",  gender: "male", category: "Creator & Influencer", searchTerms: ["Josh Richards"], hostedSlugs: [] },
    { slug: "brianna-chickenfry", name: "Brianna Chickenfry", title: "Podcast Host at Barstool Sports",  gender: "female", category: "Creator & Influencer", searchTerms: ["Brianna Chickenfry"], hostedSlugs: [] },
    { slug: "samir-chaudry", name: "Samir Chaudry", title: "Co-founder of Colin and Samir",  gender: "male", category: "Creator & Influencer", searchTerms: ["Samir Chaudry"], hostedSlugs: [] },
    { slug: "colin-rosenblum", name: "Colin Rosenblum", title: "Co-founder of Colin and Samir",  gender: "male", category: "Creator & Influencer", searchTerms: ["Colin Rosenblum"], hostedSlugs: [] },
    { slug: "jake-paul", name: "Jake Paul", title: "Boxer, Creator & Entrepreneur",  gender: "male", category: "Creator & Influencer", searchTerms: ["Jake Paul"], hostedSlugs: [] },
    { slug: "marques-brownlee", name: "Marques Brownlee", title: "Tech YouTuber (MKBHD)",  gender: "male", category: "Tech & AI", searchTerms: ["Marques Brownlee"], hostedSlugs: ["waveform"] },
    { slug: "xqc", name: "xQc", title: "Twitch Streamer & Creator",  gender: "male", category: "Creator & Influencer", searchTerms: ["xQc"], hostedSlugs: [] },
    { slug: "pokimane", name: "Pokimane", title: "Twitch Streamer & Entrepreneur",  gender: "female", category: "Creator & Influencer", searchTerms: ["Pokimane"], hostedSlugs: [] },
    { slug: "jay-shetty", name: "Jay Shetty", title: "Author & Podcast Host",  gender: "male", category: "Author & Thought Leader", searchTerms: ["Jay Shetty"], hostedSlugs: ["jayshetty"] },
    { slug: "steven-bartlett", name: "Steven Bartlett", title: "Host of Diary of a CEO",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Steven Bartlett"], hostedSlugs: ["diaryofaceo"] },
    { slug: "pat-flynn", name: "Pat Flynn", title: "Host of Smart Passive Income",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Pat Flynn"], hostedSlugs: ["smartpassiveincome"] },
    { slug: "lauryn-bosstick", name: "Lauryn Bosstick", title: "Co-host of The Skinny Confidential",  gender: "female", category: "Creator & Influencer", searchTerms: ["Lauryn Bosstick"], hostedSlugs: ["skinny-confidential-him-and-her-podcast"] },
    { slug: "michael-bosstick", name: "Michael Bosstick", title: "Co-host of The Skinny Confidential",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Michael Bosstick"], hostedSlugs: ["skinny-confidential-him-and-her-podcast"] },
    { slug: "john-morgan", name: "John Morgan", title: "Entrepreneur & Business Leader",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["John Morgan"], hostedSlugs: [] },
    { slug: "mary-kennedy-thompson", name: "Mary Kennedy Thompson", title: "CEO of Neighborly",  gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Mary Kennedy Thompson"], hostedSlugs: [] },
    { slug: "chris-williams", name: "Chris Williams", title: "Former VP of HR at Microsoft",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Chris Williams"], hostedSlugs: [] },
    { slug: "michelle-songy", name: "Michelle Songy", title: "Founder & CEO of Press Hook",  gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Michelle Songy"], hostedSlugs: [] },
    { slug: "adam-goldstein", name: "Adam Goldstein", title: "Co-founder of Hipmunk",  gender: "male", category: "Tech & AI", searchTerms: ["Adam Goldstein"], hostedSlugs: [] },
    { slug: "keenan-fisher", name: "Keenan Fisher", title: "Entrepreneur & Business Leader",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Keenan Fisher"], hostedSlugs: [] },
    { slug: "mike-mandell", name: "Mike Mandell", title: "Creator of Law By Mike",  gender: "male", category: "Creator & Influencer", searchTerms: ["Mike Mandell"], hostedSlugs: [] },
    { slug: "emma-grede", name: "Emma Grede", title: "CEO of Good American & Co-founder of SKIMS",  gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Emma Grede"], hostedSlugs: [] },
    { slug: "whitney-wolfe-herd", name: "Whitney Wolfe Herd", title: "Founder of Bumble",  gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Whitney Wolfe Herd"], hostedSlugs: [] },
    { slug: "melanie-perkins", name: "Melanie Perkins", title: "CEO of Canva",  gender: "female", category: "Tech & AI", searchTerms: ["Melanie Perkins"], hostedSlugs: [] },
    { slug: "anne-wojcicki", name: "Anne Wojcicki", title: "Co-founder of 23andMe",  gender: "female", category: "Science & Health", searchTerms: ["Anne Wojcicki"], hostedSlugs: [] },
    { slug: "julie-sweet", name: "Julie Sweet", title: "CEO of Accenture",  gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Julie Sweet"], hostedSlugs: [] },
    { slug: "lisa-falzone", name: "Lisa Falzone", title: "Co-founder of Revel Systems",  gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Lisa Falzone"], hostedSlugs: [] },
    { slug: "alexa-hirschfeld", name: "Alexa Hirschfeld", title: "Co-founder of Paperless Post",  gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Alexa Hirschfeld"], hostedSlugs: [] },
    { slug: "grace-beverley", name: "Grace Beverley", title: "Entrepreneur & Fitness Influencer",  gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Grace Beverley"], hostedSlugs: [] },
    { slug: "anu-duggal", name: "Anu Duggal", title: "Founding Partner of Female Founders Fund",  gender: "female", category: "Venture Capital", searchTerms: ["Anu Duggal"], hostedSlugs: [] },
    { slug: "theresia-gouw", name: "Theresia Gouw", title: "Co-founder of Acrew Capital",  gender: "female", category: "Venture Capital", searchTerms: ["Theresia Gouw"], hostedSlugs: [] },
    { slug: "lucy-guo", name: "Lucy Guo", title: "Co-founder of Scale AI",  gender: "female", category: "Tech & AI", searchTerms: ["Lucy Guo"], hostedSlugs: [] },
    { slug: "lexi-burbey", name: "Lexi Burbey", title: "Creator & Entrepreneur",  gender: "female", category: "Creator & Influencer", searchTerms: ["Lexi Burbey"], hostedSlugs: [] },
    { slug: "anu-adebajo", name: "Anu Adebajo", title: "Entrepreneur & Advocate",  gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Anu Adebajo"], hostedSlugs: [] },
    { slug: "natalie-ellis", name: "Natalie Ellis", title: "Co-founder of BossBabe",  gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Natalie Ellis"], hostedSlugs: [] },
    { slug: "tori-dunlap", name: "Tori Dunlap", title: "Founder of Her First $100K",  gender: "female", category: "Finance & Investing", searchTerms: ["Tori Dunlap"], hostedSlugs: [] },
    { slug: "vivian-tu", name: "Vivian Tu", title: "Creator of Your Rich BFF",  gender: "female", category: "Finance & Investing", searchTerms: ["Vivian Tu"], hostedSlugs: [] },
    { slug: "mimi-bouchard", name: "Mimi Bouchard", title: "Entrepreneur & Wellness Creator",  gender: "female", category: "Creator & Influencer", searchTerms: ["Mimi Bouchard"], hostedSlugs: [] },
    { slug: "doone-roisin", name: "Doone Roisin", title: "Founder of Female Startup Club",  gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Doone Roisin"], hostedSlugs: [] },
    { slug: "brene-brown", name: "Brené Brown", title: "Research Professor & Author",  gender: "female", category: "Author & Thought Leader", searchTerms: ["Brené Brown"], hostedSlugs: ["daretolead"] },
    { slug: "marie-forleo", name: "Marie Forleo", title: "Author & Host of MarieTV",  gender: "female", category: "Author & Thought Leader", searchTerms: ["Marie Forleo"], hostedSlugs: [] },
    { slug: "claire-wasserman", name: "Claire Wasserman", title: "Founder of Ladies Get Paid",  gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Claire Wasserman"], hostedSlugs: [] },
    { slug: "donald-trump", name: "Donald Trump", title: "47th President of the United States",  gender: "male", category: "Politics & Public Figures", searchTerms: ["Donald Trump"], hostedSlugs: [] },
    { slug: "tucker-carlson", name: "Tucker Carlson", title: "Political Commentator & Media Host",  gender: "male", category: "Politics & Public Figures", searchTerms: ["Tucker Carlson"], hostedSlugs: [] },
    { slug: "vivek-ramaswamy", name: "Vivek Ramaswamy", title: "Entrepreneur & Political Figure",  gender: "male", category: "Politics & Public Figures", searchTerms: ["Vivek Ramaswamy"], hostedSlugs: [] },
    { slug: "ted-cruz", name: "Ted Cruz", title: "U.S. Senator from Texas",  gender: "male", category: "Politics & Public Figures", searchTerms: ["Ted Cruz"], hostedSlugs: [] },
    { slug: "gavin-newsom", name: "Gavin Newsom", title: "Governor of California",  gender: "male", category: "Politics & Public Figures", searchTerms: ["Gavin Newsom"], hostedSlugs: [] },
    { slug: "robert-f-kennedy-jr", name: "Robert F. Kennedy Jr.", title: "Health & Human Services Secretary",  gender: "male", category: "Politics & Public Figures", searchTerms: ["Robert F. Kennedy Jr."], hostedSlugs: [] },
    { slug: "sam-harris", name: "Sam Harris", title: "Neuroscientist, Author & Host of Making Sense",  gender: "male", category: "Author & Thought Leader", searchTerms: ["Sam Harris"], hostedSlugs: ["makingsense"] },
    { slug: "yuval-noah-harari", name: "Yuval Noah Harari", title: "Historian & Author",  gender: "male", category: "Author & Thought Leader", searchTerms: ["Yuval Noah Harari"], hostedSlugs: [] },
    { slug: "malcolm-gladwell", name: "Malcolm Gladwell", title: "Author & Host of Revisionist History",  gender: "male", category: "Author & Thought Leader", searchTerms: ["Malcolm Gladwell"], hostedSlugs: ["revisionisthistory"] },
    { slug: "peter-attia", name: "Peter Attia", title: "Physician & Host of The Drive",  gender: "male", category: "Science & Health", searchTerms: ["Peter Attia"], hostedSlugs: ["peterattia"] },
    { slug: "ray-dalio", name: "Ray Dalio", title: "Founder of Bridgewater Associates",  gender: "male", category: "Finance & Investing", searchTerms: ["Ray Dalio"], hostedSlugs: [] },
    { slug: "candace-owens", name: "Candace Owens", title: "Political Commentator & Author",  gender: "female", category: "Politics & Public Figures", searchTerms: ["Candace Owens"], hostedSlugs: [] },
    { slug: "tulsi-gabbard", name: "Tulsi Gabbard", title: "Director of National Intelligence",  gender: "female", category: "Politics & Public Figures", searchTerms: ["Tulsi Gabbard"], hostedSlugs: [] },
    { slug: "jd-vance", name: "J.D. Vance", title: "Vice President of the United States",  gender: "male", category: "Politics & Public Figures", searchTerms: ["J.D. Vance"], hostedSlugs: [] },
    { slug: "andrew-cuomo", name: "Andrew Cuomo", title: "Former Governor of New York",  gender: "male", category: "Politics & Public Figures", searchTerms: ["Andrew Cuomo"], hostedSlugs: [] },
    { slug: "zohran-mamdani", name: "Zohran Mamdani", title: "New York State Assembly Member",  gender: "male", category: "Politics & Public Figures", searchTerms: ["Zohran Mamdani"], hostedSlugs: [] },
    { slug: "mikie-sherrill", name: "Mikie Sherrill", title: "U.S. Representative from New Jersey",  gender: "female", category: "Politics & Public Figures", searchTerms: ["Mikie Sherrill"], hostedSlugs: [] },
    { slug: "casey-neistat", name: "Casey Neistat", title: "YouTube Creator & Filmmaker",  gender: "male", category: "Creator & Influencer", searchTerms: ["Casey Neistat"], hostedSlugs: [] },
    { slug: "jordan-harbinger", name: "Jordan Harbinger", title: "Host of The Jordan Harbinger Show",  gender: "male", category: "Author & Thought Leader", searchTerms: ["Jordan Harbinger"], hostedSlugs: ["jordanharbinger"] },
    { slug: "mel-robbins", name: "Mel Robbins", title: "Motivational Speaker & Author",  gender: "female", category: "Author & Thought Leader", searchTerms: ["Mel Robbins"], hostedSlugs: ["melrobbins"] },
    { slug: "guy-raz", name: "Guy Raz", title: "Host of How I Built This",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Guy Raz"], hostedSlugs: ["howibuiltthis"] },
    { slug: "kipp-bodnar", name: "Kipp Bodnar", title: "CMO of HubSpot",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Kipp Bodnar"], hostedSlugs: ["marketing-against-the-grain"] },
    { slug: "kieran-flanagan", name: "Kieran Flanagan", title: "Former SVP of Marketing at HubSpot",  gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Kieran Flanagan"], hostedSlugs: ["marketing-against-the-grain"] },
    { slug: "lenny-rachitsky", name: "Lenny Rachitsky", title: "Host of Lenny\'s Podcast",  gender: "male", category: "Tech & AI", searchTerms: ["Lenny Rachitsky"], hostedSlugs: ["lennys"] },
    { slug: "shawn-ryan", name: "Shawn Ryan", title: "Host of Shawn Ryan Show",  gender: "male", category: "Author & Thought Leader", searchTerms: ["Shawn Ryan"], hostedSlugs: ["shawnryanshow"] },
    { slug: "dan-carlin", name: "Dan Carlin", title: "Host of Hardcore History",  gender: "male", category: "Author & Thought Leader", searchTerms: ["Dan Carlin"], hostedSlugs: ["hardcorehistory"] },
    { slug: "dwarkesh-patel", name: "Dwarkesh Patel", title: "Host of Dwarkesh Podcast",  gender: "male", category: "Tech & AI", searchTerms: ["Dwarkesh Patel"], hostedSlugs: ["dwarkesh"] },
    { slug: "preston-pysh", name: "Preston Pysh", title: "Co-founder of The Investor\'s Podcast Network",  gender: "male", category: "Finance & Investing", searchTerms: ["Preston Pysh"], hostedSlugs: ["westudybillionaires"] },
    { slug: "stig-brodersen", name: "Stig Brodersen", title: "Co-founder of The Investor\'s Podcast Network",  gender: "male", category: "Finance & Investing", searchTerms: ["Stig Brodersen"], hostedSlugs: ["westudybillionaires"] },
    { slug: "david-friedberg", name: "David Friedberg", title: "CEO of The Production Board & Co-Host of All-In Podcast", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["David Friedberg"], hostedSlugs: ["allin"] },
    { slug: "ben-gilbert", name: "Ben Gilbert", title: "Co-Founder of Pioneer Square Labs & Co-Host of Acquired", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Ben Gilbert"], hostedSlugs: ["acquired"] },
    { slug: "david-rosenthal", name: "David Rosenthal", title: "Venture Capitalist & Co-Host of Acquired", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["David Rosenthal"], hostedSlugs: ["acquired"] },
    { slug: "kevin-roose", name: "Kevin Roose", title: "Technology Columnist at The New York Times & Co-Host of Hard Fork", gender: "male", category: "Media & Journalism", searchTerms: ["Kevin Roose"], hostedSlugs: ["hardfork"] },
    { slug: "nilay-patel", name: "Nilay Patel", title: "Editor-in-Chief of The Verge & Host of Decoder", gender: "male", category: "Media & Journalism", searchTerms: ["Nilay Patel"], hostedSlugs: ["thevergecast", "decoder"] },
    { slug: "dave-ramsey", name: "Dave Ramsey", title: "Personal Finance Expert & Host of The Ramsey Show", gender: "male", category: "Finance & Investing", searchTerms: ["Dave Ramsey"], hostedSlugs: ["ramseyshow"] },
    { slug: "david-senra", name: "David Senra", title: "Host of Founders Podcast", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["David Senra"], hostedSlugs: ["founders"] },
    { slug: "dax-shepard", name: "Dax Shepard", title: "Actor & Host of Armchair Expert", gender: "male", category: "Entertainment & Culture", searchTerms: ["Dax Shepard"], hostedSlugs: ["armchairexpert"] },
    { slug: "monica-padman", name: "Monica Padman", title: "Co-Host of Armchair Expert", gender: "female", category: "Entertainment & Culture", searchTerms: ["Monica Padman"], hostedSlugs: ["armchairexpert"] },
    { slug: "conan-obrien", name: "Conan O\'Brien", title: "Comedian & Host of Conan O\'Brien Needs a Friend", gender: "male", category: "Entertainment & Culture", searchTerms: ["Conan O\'Brien", "Conan OBrien"], hostedSlugs: ["conanobrien"] },
    { slug: "ezra-klein", name: "Ezra Klein", title: "Columnist at The New York Times & Host of The Ezra Klein Show", gender: "male", category: "Media & Journalism", searchTerms: ["Ezra Klein"], hostedSlugs: ["ezraklein"] },
    { slug: "shane-parrish", name: "Shane Parrish", title: "Founder of Farnam Street & Host of The Knowledge Project", gender: "male", category: "Author & Thought Leader", searchTerms: ["Shane Parrish"], hostedSlugs: ["knowledgeproject"] },
    { slug: "tyler-cowen", name: "Tyler Cowen", title: "Economist & Host of Conversations with Tyler", gender: "male", category: "Author & Thought Leader", searchTerms: ["Tyler Cowen"], hostedSlugs: ["conversationswithtyler"] },
    { slug: "bill-simmons", name: "Bill Simmons", title: "Founder of The Ringer & Podcast Host", gender: "male", category: "Entertainment & Culture", searchTerms: ["Bill Simmons"], hostedSlugs: ["thebigpicture", "therewatchables"] },
    { slug: "cal-newport", name: "Cal Newport", title: "Author & Host of Deep Questions", gender: "male", category: "Author & Thought Leader", searchTerms: ["Cal Newport"], hostedSlugs: ["deepquestions"] },
    { slug: "jocko-willink", name: "Jocko Willink", title: "Retired Navy SEAL & Host of Jocko Podcast", gender: "male", category: "Author & Thought Leader", searchTerms: ["Jocko Willink"], hostedSlugs: ["jockopodcast"] },
    { slug: "rich-roll", name: "Rich Roll", title: "Ultra-Endurance Athlete & Host of The Rich Roll Podcast", gender: "male", category: "Science & Health", searchTerms: ["Rich Roll"], hostedSlugs: ["richroll"] },
    { slug: "lewis-howes", name: "Lewis Howes", title: "Author & Host of The School of Greatness", gender: "male", category: "Author & Thought Leader", searchTerms: ["Lewis Howes"], hostedSlugs: ["school-of-greatness"] },
    { slug: "tom-bilyeu", name: "Tom Bilyeu", title: "Co-Founder of Quest Nutrition & Host of Impact Theory", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Tom Bilyeu"], hostedSlugs: ["impact-theory"] },
    { slug: "tony-robbins", name: "Tony Robbins", title: "Life Coach & Host of The Tony Robbins Podcast", gender: "male", category: "Author & Thought Leader", searchTerms: ["Tony Robbins"], hostedSlugs: ["tony-robbins-podcast"] },
    { slug: "ed-mylett", name: "Ed Mylett", title: "Entrepreneur & Host of The Ed Mylett Show", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Ed Mylett"], hostedSlugs: ["ed-mylett-show"] },
    { slug: "dan-harris", name: "Dan Harris", title: "Journalist & Host of Ten Percent Happier", gender: "male", category: "Science & Health", searchTerms: ["Dan Harris"], hostedSlugs: ["tenpercenthappier"] },
    { slug: "stephen-dubner", name: "Stephen Dubner", title: "Author & Host of Freakonomics Radio", gender: "male", category: "Author & Thought Leader", searchTerms: ["Stephen Dubner"], hostedSlugs: ["freakonomics"] },
    { slug: "joe-lonsdale", name: "Joe Lonsdale", title: "Co-Founder of Palantir & Venture Capitalist", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Joe Lonsdale"], hostedSlugs: ["joelonsdale"] },
    { slug: "peter-diamandis", name: "Peter Diamandis", title: "Founder of XPRIZE & Host of Moonshots", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Peter Diamandis"], hostedSlugs: ["moonshots"] },
    { slug: "chris-williamson", name: "Chris Williamson", title: "Host of Modern Wisdom", gender: "male", category: "Author & Thought Leader", searchTerms: ["Chris Williamson"], hostedSlugs: ["modernwisdom"] },
    { slug: "patrick-oshaughnessy", name: "Patrick O\'Shaughnessy", title: "CEO of Positive Sum & Host of Invest Like the Best", gender: "male", category: "Finance & Investing", searchTerms: ["Patrick O\'Shaughnessy", "Patrick OShaughnessy"], hostedSlugs: ["investlikethebest", "businessbreakdowns"] },
    { slug: "barry-ritholtz", name: "Barry Ritholtz", title: "Co-Founder of Ritholtz Wealth & Host of Masters in Business", gender: "male", category: "Finance & Investing", searchTerms: ["Barry Ritholtz"], hostedSlugs: ["mastersinbusiness"] },
    { slug: "neil-patel", name: "Neil Patel", title: "Digital Marketing Expert & Co-Host of Marketing School", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Neil Patel"], hostedSlugs: ["marketingschool"] },
    { slug: "eric-siu", name: "Eric Siu", title: "CEO of Single Grain & Co-Host of Marketing School", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Eric Siu"], hostedSlugs: ["marketingschool"] },
    { slug: "rob-walling", name: "Rob Walling", title: "Founder of TinySeed & Host of Startups for the Rest of Us", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Rob Walling"], hostedSlugs: ["startupsfortherestofus"] },
    { slug: "megyn-kelly", name: "Megyn Kelly", title: "Journalist & Host of The Megyn Kelly Show", gender: "female", category: "Media & Journalism", searchTerms: ["Megyn Kelly"], hostedSlugs: ["megyn-kelly-show"] },
    { slug: "ben-shapiro", name: "Ben Shapiro", title: "Political Commentator & Host of The Ben Shapiro Show", gender: "male", category: "Media & Journalism", searchTerms: ["Ben Shapiro"], hostedSlugs: ["ben-shapiro-show"] },
    { slug: "preet-bharara", name: "Preet Bharara", title: "Former U.S. Attorney & Host of Stay Tuned with Preet", gender: "male", category: "Media & Journalism", searchTerms: ["Preet Bharara"], hostedSlugs: ["stay-tuned-with-preet"] },
    { slug: "anthony-pompliano", name: "Anthony Pompliano", title: "Investor & Host of The Pomp Podcast", gender: "male", category: "Finance & Investing", searchTerms: ["Anthony Pompliano", "Pomp"], hostedSlugs: ["pomp-podcast"] },
    { slug: "laura-shin", name: "Laura Shin", title: "Journalist & Host of Unchained", gender: "female", category: "Finance & Investing", searchTerms: ["Laura Shin"], hostedSlugs: ["unchained"] },
    { slug: "sarah-guo", name: "Sarah Guo", title: "Founder of Conviction & Co-Host of No Priors", gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Sarah Guo"], hostedSlugs: ["no-priors"] },
    { slug: "roman-mars", name: "Roman Mars", title: "Host of 99% Invisible", gender: "male", category: "Entertainment & Culture", searchTerms: ["Roman Mars"], hostedSlugs: ["99-invisible"] },
    { slug: "pj-vogt", name: "PJ Vogt", title: "Host of Search Engine", gender: "male", category: "Media & Journalism", searchTerms: ["PJ Vogt"], hostedSlugs: ["searchengine"] },
    { slug: "ira-glass", name: "Ira Glass", title: "Host of This American Life", gender: "male", category: "Media & Journalism", searchTerms: ["Ira Glass"], hostedSlugs: ["thisamericanlife"] },
    { slug: "jason-kelce", name: "Jason Kelce", title: "Former NFL Center & Co-Host of New Heights", gender: "male", category: "Entertainment & Culture", searchTerms: ["Jason Kelce"], hostedSlugs: ["newheights"] },
    { slug: "travis-kelce", name: "Travis Kelce", title: "NFL Tight End & Co-Host of New Heights", gender: "male", category: "Entertainment & Culture", searchTerms: ["Travis Kelce"], hostedSlugs: ["newheights"] },
    { slug: "mark-hyman", name: "Mark Hyman", title: "Physician & Host of The Doctor\'s Farmacy", gender: "male", category: "Science & Health", searchTerms: ["Mark Hyman"], hostedSlugs: ["doctorsfarmacy"] },
    { slug: "rhonda-patrick", name: "Rhonda Patrick", title: "Biomedical Scientist & Host of Found My Fitness", gender: "female", category: "Science & Health", searchTerms: ["Rhonda Patrick"], hostedSlugs: ["foundmyfitness"] },
    { slug: "shawn-stevenson", name: "Shawn Stevenson", title: "Author & Host of The Model Health Show", gender: "male", category: "Science & Health", searchTerms: ["Shawn Stevenson"], hostedSlugs: ["modelhealthshow"] },
    { slug: "jason-bateman", name: "Jason Bateman", title: "Actor & Co-Host of SmartLess", gender: "male", category: "Entertainment & Culture", searchTerms: ["Jason Bateman"], hostedSlugs: ["smartless"] },
    { slug: "sean-hayes", name: "Sean Hayes", title: "Actor & Co-Host of SmartLess", gender: "male", category: "Entertainment & Culture", searchTerms: ["Sean Hayes"], hostedSlugs: ["smartless"] },
    { slug: "will-arnett", name: "Will Arnett", title: "Actor & Co-Host of SmartLess", gender: "male", category: "Entertainment & Culture", searchTerms: ["Will Arnett"], hostedSlugs: ["smartless"] },
    { slug: "jon-favreau", name: "Jon Favreau", title: "Political Commentator & Co-Host of Pod Save America", gender: "male", category: "Media & Journalism", searchTerms: ["Jon Favreau"], hostedSlugs: ["podsaveamerica"] },
    { slug: "caleb-hammer", name: "Caleb Hammer", title: "Host of Financial Audit", gender: "male", category: "Finance & Investing", searchTerms: ["Caleb Hammer"], hostedSlugs: ["financialaudit"] },
    { slug: "scott-d-clary", name: "Scott D. Clary", title: "Host of Success Story", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Scott D. Clary", "Scott Clary"], hostedSlugs: ["success-story"] },
    { slug: "arvid-kahl", name: "Arvid Kahl", title: "Author & Host of The Bootstrapped Founder", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Arvid Kahl"], hostedSlugs: ["bootstrapped-founder"] },
    { slug: "courtland-allen", name: "Courtland Allen", title: "Founder of Indie Hackers & Host of Indie Hackers Podcast", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Courtland Allen"], hostedSlugs: ["indie-hackers-podcast"] },
    { slug: "john-coogan", name: "John Coogan", title: "Entrepreneur & Co-Host of Iced Coffee Hour", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["John Coogan"], hostedSlugs: ["icedcoffeehour"] },
    { slug: "graham-stephan", name: "Graham Stephan", title: "Real Estate Investor & Co-Host of Iced Coffee Hour", gender: "male", category: "Finance & Investing", searchTerms: ["Graham Stephan"], hostedSlugs: ["icedcoffeehour"] },
    { slug: "james-altucher", name: "James Altucher", title: "Author & Host of The James Altucher Show", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["James Altucher"], hostedSlugs: ["james-altucher-show"] },
    { slug: "rory-stewart", name: "Rory Stewart", title: "Former UK Politician & Co-Host of The Rest Is Politics", gender: "male", category: "Media & Journalism", searchTerms: ["Rory Stewart"], hostedSlugs: ["therestispolitics"] },
    { slug: "alastair-campbell", name: "Alastair Campbell", title: "Political Strategist & Co-Host of The Rest Is Politics", gender: "male", category: "Media & Journalism", searchTerms: ["Alastair Campbell"], hostedSlugs: ["therestispolitics"] },
    { slug: "brian-mccullough", name: "Brian McCullough", title: "Tech Historian & Host of Techmeme Ride Home", gender: "male", category: "Technology", searchTerms: ["Brian McCullough"], hostedSlugs: ["techmemeridehome"] },
    { slug: "nathan-labenz", name: "Nathan Labenz", title: "Host of The Cognitive Revolution", gender: "male", category: "Technology", searchTerms: ["Nathan Labenz"], hostedSlugs: ["cognitiverevolution"] },
    { slug: "jake-humphrey", name: "Jake Humphrey", title: "Broadcaster & Co-Host of High Performance", gender: "male", category: "Author & Thought Leader", searchTerms: ["Jake Humphrey"], hostedSlugs: ["high-performance-podcast"] },
    { slug: "jack-rhysider", name: "Jack Rhysider", title: "Host of Darknet Diaries", gender: "male", category: "Technology", searchTerms: ["Jack Rhysider"], hostedSlugs: ["darknetdiaries"] },
    { slug: "warren-buffett", name: "Warren Buffett", title: "Chairman & CEO of Berkshire Hathaway", gender: "male", category: "Finance & Investing", searchTerms: ["Warren Buffett", "Buffett"], hostedSlugs: [] },
    { slug: "jack-dorsey", name: "Jack Dorsey", title: "Co-founder of Twitter & Block", gender: "male", category: "Tech & AI", searchTerms: ["Jack Dorsey", "Dorsey"], hostedSlugs: [] },
    { slug: "bob-iger", name: "Bob Iger", title: "CEO of The Walt Disney Company", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Bob Iger", "Iger"], hostedSlugs: [] },
    { slug: "vlad-tenev", name: "Vlad Tenev", title: "CEO of Robinhood", gender: "male", category: "Finance & Investing", searchTerms: ["Vlad Tenev", "Tenev"], hostedSlugs: [] },
    { slug: "charlie-munger", name: "Charlie Munger", title: "Vice Chairman of Berkshire Hathaway (1924-2023)", gender: "male", category: "Finance & Investing", searchTerms: ["Charlie Munger", "Munger"], hostedSlugs: [] },
    { slug: "steve-jobs", name: "Steve Jobs", title: "Co-founder of Apple (1955-2011)", gender: "male", category: "Tech & AI", searchTerms: ["Steve Jobs"], hostedSlugs: [] },
    { slug: "kamala-harris", name: "Kamala Harris", title: "Vice President of the United States", gender: "female", category: "Politics & Public Figures", searchTerms: ["Kamala Harris"], hostedSlugs: [] },
    { slug: "vladimir-putin", name: "Vladimir Putin", title: "President of Russia", gender: "male", category: "Politics & Public Figures", searchTerms: ["Vladimir Putin", "Putin"], hostedSlugs: [] },
    { slug: "morgan-housel", name: "Morgan Housel", title: "Author of \'The Psychology of Money\'", gender: "male", category: "Finance & Investing", searchTerms: ["Morgan Housel", "Housel"], hostedSlugs: [] },
    { slug: "dario-amodei", name: "Dario Amodei", title: "CEO of Anthropic", gender: "male", category: "Tech & AI", searchTerms: ["Dario Amodei", "Amodei"], hostedSlugs: [] },
    { slug: "xi-jinping", name: "Xi Jinping", title: "President of China", gender: "male", category: "Politics & Public Figures", searchTerms: ["Xi Jinping"], hostedSlugs: [] },
    { slug: "sundar-pichai", name: "Sundar Pichai", title: "CEO of Google & Alphabet", gender: "male", category: "Tech & AI", searchTerms: ["Sundar Pichai", "Pichai"], hostedSlugs: [] },
    { slug: "larry-page", name: "Larry Page", title: "Co-founder of Google", gender: "male", category: "Tech & AI", searchTerms: ["Larry Page"], hostedSlugs: [] },
    { slug: "jamie-dimon", name: "Jamie Dimon", title: "CEO of JPMorgan Chase", gender: "male", category: "Finance & Investing", searchTerms: ["Jamie Dimon", "Dimon"], hostedSlugs: [] },
    { slug: "oprah-winfrey", name: "Oprah Winfrey", title: "Media Mogul & Philanthropist", gender: "female", category: "Entertainment", searchTerms: ["Oprah Winfrey", "Oprah"], hostedSlugs: [] },
    { slug: "kevin-hart", name: "Kevin Hart", title: "Comedian, Actor & Entrepreneur", gender: "male", category: "Entertainment", searchTerms: ["Kevin Hart"], hostedSlugs: [] },
    { slug: "michael-jordan", name: "Michael Jordan", title: "Basketball Legend & Business Mogul", gender: "male", category: "Entertainment", searchTerms: ["Michael Jordan"], hostedSlugs: [] },
    { slug: "serena-williams", name: "Serena Williams", title: "Tennis Champion & Venture Capitalist", gender: "female", category: "Business & Entrepreneurship", searchTerms: ["Serena Williams"], hostedSlugs: [] },
    { slug: "mark-manson", name: "Mark Manson", title: "Author of \'The Subtle Art of Not Giving a F*ck\'", gender: "male", category: "Author & Thought Leader", searchTerms: ["Mark Manson"], hostedSlugs: [] },
    { slug: "andrej-karpathy", name: "Andrej Karpathy", title: "AI Researcher & Former Director at Tesla/OpenAI", gender: "male", category: "Tech & AI", searchTerms: ["Andrej Karpathy", "Karpathy"], hostedSlugs: [] },
    { slug: "drake-rapper", name: "Drake", title: "Rapper & Entrepreneur", gender: "male", category: "Entertainment", searchTerms: ["Drake the rapper", "rapper Drake"], hostedSlugs: [] },
    { slug: "taylor-swift", name: "Taylor Swift", title: "Singer-Songwriter & Cultural Icon", gender: "female", category: "Entertainment", searchTerms: ["Taylor Swift"], hostedSlugs: [] },
    { slug: "bill-gates", name: "Bill Gates", title: "Co-founder of Microsoft & Philanthropist", gender: "male", category: "Tech & AI", searchTerms: ["Bill Gates"], hostedSlugs: [] },
    { slug: "barack-obama", name: "Barack Obama", title: "44th President of the United States", gender: "male", category: "Politics & Public Figures", searchTerms: ["Barack Obama", "Obama"], hostedSlugs: [] },
    { slug: "joe-biden", name: "Joe Biden", title: "46th President of the United States", gender: "male", category: "Politics & Public Figures", searchTerms: ["Joe Biden", "Biden"], hostedSlugs: [] },
    { slug: "chris-dixon", name: "Chris Dixon", title: "General Partner at a16z", gender: "male", category: "Venture Capital", searchTerms: ["Chris Dixon", "cdixon"], hostedSlugs: [] },
    { slug: "kevin-kelly", name: "Kevin Kelly", title: "Author & Co-founder of Wired", gender: "male", category: "Author & Thought Leader", searchTerms: ["Kevin Kelly"], hostedSlugs: [] },
    { slug: "phil-knight", name: "Phil Knight", title: "Co-founder of Nike", gender: "male", category: "Business & Entrepreneurship", searchTerms: ["Phil Knight"], hostedSlugs: [] },
    { slug: "dana-white", name: "Dana White", title: "CEO of UFC", gender: "male", category: "Entertainment", searchTerms: ["Dana White"], hostedSlugs: [] },
    { slug: "ilya-sutskever", name: "Ilya Sutskever", title: "Co-founder of Safe Superintelligence", gender: "male", category: "Tech & AI", searchTerms: ["Ilya Sutskever", "Sutskever"], hostedSlugs: [] },
    { slug: "geoffrey-hinton", name: "Geoffrey Hinton", title: "Godfather of AI & Nobel Laureate", gender: "male", category: "Tech & AI", searchTerms: ["Geoffrey Hinton", "Hinton"], hostedSlugs: [] },
    { slug: "david-goggins", name: "David Goggins", title: "Ultra-Endurance Athlete & Author", gender: "male", category: "Author & Thought Leader", searchTerms: ["David Goggins", "Goggins"], hostedSlugs: [] },
    { slug: "larry-fink", name: "Larry Fink", title: "CEO of BlackRock", gender: "male", category: "Finance & Investing", searchTerms: ["Larry Fink", "Fink"], hostedSlugs: [] },
    { slug: "sam-bankman-fried", name: "Sam Bankman-Fried", title: "Former CEO of FTX", gender: "male", category: "Finance & Investing", searchTerms: ["Sam Bankman-Fried", "SBF"], hostedSlugs: [] },
    { slug: "patrick-collison", name: "Patrick Collison", title: "CEO of Stripe", gender: "male", category: "Tech & AI", searchTerms: ["Patrick Collison"], hostedSlugs: [] },
    { slug: "daniel-kahneman", name: "Daniel Kahneman", title: "Nobel Prize Economist & Author (1934-2024)", gender: "male", category: "Author & Thought Leader", searchTerms: ["Daniel Kahneman", "Kahneman"], hostedSlugs: [] },
    { slug: "matthew-walker", name: "Matthew Walker", title: "Neuroscientist & Author of \'Why We Sleep\'", gender: "male", category: "Science & Health", searchTerms: ["Matthew Walker"], hostedSlugs: [] },
    { slug: "david-sinclair", name: "David Sinclair", title: "Professor of Genetics at Harvard", gender: "male", category: "Science & Health", searchTerms: ["David Sinclair", "Sinclair"], hostedSlugs: [] },
    { slug: "conor-mcgregor", name: "Conor McGregor", title: "MMA Fighter & Entrepreneur", gender: "male", category: "Entertainment", searchTerms: ["Conor McGregor", "McGregor"], hostedSlugs: [] },
    { slug: "lebron-james", name: "LeBron James", title: "NBA Champion & Entrepreneur", gender: "male", category: "Entertainment", searchTerms: ["LeBron James", "LeBron"], hostedSlugs: [] },
    { slug: "cristiano-ronaldo", name: "Cristiano Ronaldo", title: "Football Legend & Entrepreneur", gender: "male", category: "Entertainment", searchTerms: ["Cristiano Ronaldo", "Ronaldo"], hostedSlugs: [] },
    { slug: "howard-stern", name: "Howard Stern", title: "Radio Host & Media Personality", gender: "male", category: "Entertainment", searchTerms: ["Howard Stern"], hostedSlugs: [] },
    { slug: "sergey-brin", name: "Sergey Brin", title: "Co-founder of Google", gender: "male", category: "Tech & AI", searchTerms: ["Sergey Brin", "Brin"], hostedSlugs: [] },
    { slug: "pat-gelsinger", name: "Pat Gelsinger", title: "Former CEO of Intel", gender: "male", category: "Tech & AI", searchTerms: ["Pat Gelsinger", "Gelsinger"], hostedSlugs: [] },
    { slug: "palmer-luckey", name: "Palmer Luckey", title: "Founder of Oculus & Anduril", gender: "male", category: "Tech & AI", searchTerms: ["Palmer Luckey", "Luckey"], hostedSlugs: [] },
    { slug: "nikki-haley", name: "Nikki Haley", title: "Former U.S. Ambassador to the United Nations", gender: "female", category: "Politics & Public Figures", searchTerms: ["Nikki Haley", "Haley"], hostedSlugs: [] },
    { slug: "nir-eyal", name: "Nir Eyal", title: "Author of \'Hooked\' & Behavioral Design Expert", gender: "male", category: "Author & Thought Leader", searchTerms: ["Nir Eyal"], hostedSlugs: [] },
    { slug: "kristi-noem", name: "Kristi Noem", title: "Secretary of Homeland Security", gender: "female", category: "Politics & Public Figures", searchTerms: ["Kristi Noem", "Noem"], hostedSlugs: [] },
    { slug: "ken-burns", name: "Ken Burns", title: "Documentary Filmmaker", gender: "male", category: "Entertainment", searchTerms: ["Ken Burns"], hostedSlugs: [] },
    { slug: "travis-kalanick", name: "Travis Kalanick", title: "Co-founder of Uber", gender: "male", category: "Tech & AI", searchTerms: ["Travis Kalanick", "Kalanick"], hostedSlugs: [] },
    { slug: "dara-khosrowshahi", name: "Dara Khosrowshahi", title: "CEO of Uber", gender: "male", category: "Tech & AI", searchTerms: ["Dara Khosrowshahi", "Khosrowshahi"], hostedSlugs: [] },
    { slug: "rich-barton", name: "Rich Barton", title: "Co-founder of Expedia & Zillow", gender: "male", category: "Tech & AI", searchTerms: ["Rich Barton"], hostedSlugs: [] },
    { slug: "danny-meyer", name: "Danny Meyer", title: "Restaurateur & Founder of Shake Shack", gender: "male", category: "Business & Finance", searchTerms: ["Danny Meyer"], hostedSlugs: [] },
    { slug: "bill-campbell", name: "Bill Campbell", title: "Executive Coach to Silicon Valley Leaders", gender: "male", category: "Tech & AI", searchTerms: ["Bill Campbell"], hostedSlugs: [] },
    { slug: "angela-duckworth", name: "Angela Duckworth", title: "Author of 'Grit' & Psychologist", gender: "female", category: "Author & Thought Leader", searchTerms: ["Angela Duckworth", "Duckworth"], hostedSlugs: [] },
    { slug: "david-epstein", name: "David Epstein", title: "Author of 'Range'", gender: "male", category: "Author & Thought Leader", searchTerms: ["David Epstein"], hostedSlugs: [] },
    { slug: "jonathan-haidt", name: "Jonathan Haidt", title: "Social Psychologist & Author", gender: "male", category: "Author & Thought Leader", searchTerms: ["Jonathan Haidt", "Haidt"], hostedSlugs: [] },
    { slug: "robert-greene", name: "Robert Greene", title: "Author of 'The 48 Laws of Power'", gender: "male", category: "Author & Thought Leader", searchTerms: ["Robert Greene"], hostedSlugs: [] },
    { slug: "jim-cramer", name: "Jim Cramer", title: "CNBC Host & Financial Analyst", gender: "male", category: "Business & Finance", searchTerms: ["Jim Cramer", "Cramer"], hostedSlugs: [] },
    { slug: "henry-blodget", name: "Henry Blodget", title: "Co-founder of Business Insider", gender: "male", category: "Business & Finance", searchTerms: ["Henry Blodget", "Blodget", "Henry Blodgett", "Blodgett"], hostedSlugs: [] }
  ];

  const ENTITY_COMPANIES = [
    { slug: "openai", name: "OpenAI", description: "AI research and deployment company behind ChatGPT and GPT-4", searchTerms: ["OpenAI", "GPT-4"], associatedTerms: ["ChatGPT", "GPT-4o", "DALL-E", "Sora"] },
    { slug: "tesla", name: "Tesla", description: "Electric vehicle and clean energy company", searchTerms: ["Tesla"] },
    { slug: "nvidia", name: "NVIDIA", description: "Semiconductor company powering AI and gaming", searchTerms: ["NVIDIA", "Nvidia"] },
    { slug: "google", name: "Google", description: "Technology company and search engine giant", searchTerms: ["Google", "Alphabet", "DeepMind", "Google DeepMind", "Google Cloud", "GCP"], associatedTerms: ["Gemini", "DeepMind", "Google Cloud", "Android", "Chrome"] },
    { slug: "microsoft", name: "Microsoft", description: "Technology company behind Windows, Azure, and Copilot", searchTerms: ["Microsoft", "Microsoft AI", "Copilot", "Microsoft Azure", "Azure"], associatedTerms: ["Copilot", "Azure", "Windows", "Office 365", "LinkedIn"] },
    { slug: "apple", name: "Apple", description: "Consumer electronics and software company", searchTerms: ["Apple Inc", "Apple's"], associatedTerms: ["iPhone", "iPad", "Apple Vision Pro", "Apple TV+"] },
    { slug: "amazon", name: "Amazon", description: "E-commerce and cloud computing giant", searchTerms: ["Amazon", "Amazon Web Services", "AWS"], associatedTerms: ["AWS", "Alexa", "Prime Video", "Kindle"] },
    { slug: "anthropic", name: "Anthropic", description: "AI safety company behind Claude", searchTerms: ["Anthropic"], associatedTerms: ["Claude"] },
    { slug: "meta", name: "Meta", description: "Social media and metaverse company", searchTerms: ["Meta Platforms", "Facebook"], associatedTerms: ["Instagram", "WhatsApp", "Threads", "LLaMA"] },
    { slug: "spacex", name: "SpaceX", description: "Aerospace manufacturer and space transportation company", searchTerms: ["SpaceX", "Starship", "Starlink"] },
    { slug: "box", name: "Box", description: "Cloud content management and file sharing platform", searchTerms: ["Box Inc", "Box.com"] },
    { slug: "cloudflare", name: "Cloudflare", description: "Web infrastructure and security company", searchTerms: ["Cloudflare"] },
    { slug: "duolingo", name: "Duolingo", description: "Language learning platform and education technology company", searchTerms: ["Duolingo"] },
    { slug: "palantir", name: "Palantir", description: "Data analytics and AI platform for government and enterprise", searchTerms: ["Palantir"] },
    { slug: "airbnb", name: "Airbnb", description: "Online marketplace for lodging and travel experiences", searchTerms: ["Airbnb"] },
    { slug: "spotify", name: "Spotify", description: "Audio streaming and media services provider", searchTerms: ["Spotify"] },
    { slug: "coinbase", name: "Coinbase", description: "Cryptocurrency exchange and blockchain platform", searchTerms: ["Coinbase"] },
    { slug: "crowdstrike", name: "CrowdStrike", description: "Cybersecurity technology company", searchTerms: ["CrowdStrike"] },
    { slug: "expedia", name: "Expedia", description: "Online travel technology company", searchTerms: ["Expedia"] },
    { slug: "circle", name: "Circle", description: "Digital currency and payments technology company", searchTerms: ["Circle Internet", "USDC"] },
    { slug: "hubspot", name: "HubSpot", description: "CRM and inbound marketing platform", searchTerms: ["HubSpot"] },
    { slug: "draftkings", name: "DraftKings", description: "Digital sports entertainment and gaming company", searchTerms: ["DraftKings"] },
    { slug: "netflix", name: "Netflix", description: "Streaming entertainment service", searchTerms: ["Netflix"] },
    { slug: "salesforce", name: "Salesforce", description: "Cloud-based CRM and enterprise software company", searchTerms: ["Salesforce"] },
    { slug: "citadel-securities", name: "Citadel Securities", description: "Global market maker and financial services firm", searchTerms: ["Citadel Securities", "Citadel"] },
    { slug: "sp-global", name: "S&P Global", description: "Financial data, analytics, and credit ratings company", searchTerms: ["S&P Global", "S&P 500"] },
    { slug: "axon-enterprise", name: "Axon Enterprise", description: "Public safety technology company (TASER, body cameras)", searchTerms: ["Axon Enterprise", "TASER"] },
    { slug: "snowflake", name: "Snowflake", description: "Cloud data platform and analytics company", searchTerms: ["Snowflake"] },
    { slug: "starbucks", name: "Starbucks", description: "Global coffeehouse chain and coffee company", searchTerms: ["Starbucks"] },
    { slug: "adobe", name: "Adobe", description: "Creative software and digital experience company", searchTerms: ["Adobe"] },
    { slug: "shopify", name: "Shopify", description: "E-commerce platform for online stores and retail", searchTerms: ["Shopify"] },
    { slug: "scale-ai", name: "Scale AI", description: "AI data infrastructure and training data platform", searchTerms: ["Scale AI"] },
    { slug: "perplexity", name: "Perplexity", description: "AI-powered answer engine challenging traditional search", searchTerms: ["Perplexity"] },
    { slug: "tiny", name: "Tiny", description: "Holding company acquiring and operating internet businesses", searchTerms: ["Tiny Capital", "Tiny Corp"] },
    { slug: "contrarian-thinking", name: "Contrarian Thinking", description: "Business acquisition education and investment platform", searchTerms: ["Contrarian Thinking"] },
    { slug: "acquisition-com", name: "Acquisition.com", description: "Business investment and growth portfolio company", searchTerms: ["Acquisition.com"] },
    { slug: "vaynerx", name: "VaynerX", description: "Modern-day communications holding company", searchTerms: ["VaynerX", "VaynerMedia"] },
    { slug: "xai", name: "xAI", description: "Elon Musk's AI company behind Grok", searchTerms: ["xAI", "Grok AI"] },
    { slug: "stripe", name: "Stripe", description: "Global financial infrastructure platform", searchTerms: ["Stripe"] },
    { slug: "uber", name: "Uber", description: "Ride-hailing and delivery platform", searchTerms: ["Uber", "Uber Eats"] },
    { slug: "lyft", name: "Lyft", description: "Ride-sharing company", searchTerms: ["Lyft"] },
    { slug: "doordash", name: "DoorDash", description: "Food delivery platform", searchTerms: ["DoorDash"] },
    { slug: "instacart", name: "Instacart", description: "Online grocery delivery marketplace", searchTerms: ["Instacart"] },
    { slug: "databricks", name: "Databricks", description: "Unified data analytics and AI platform", searchTerms: ["Databricks"] },
    { slug: "figma", name: "Figma", description: "Collaborative interface design tool", searchTerms: ["Figma"] },
    { slug: "notion", name: "Notion", description: "All-in-one workspace for notes and collaboration", searchTerms: ["Notion"] },
    { slug: "canva", name: "Canva", description: "Online graphic design platform", searchTerms: ["Canva"] },
    { slug: "atlassian", name: "Atlassian", description: "Enterprise software for Jira, Confluence, and Trello", searchTerms: ["Atlassian", "Jira", "Confluence", "Trello"] },
    { slug: "github", name: "GitHub", description: "World's largest software development platform", searchTerms: ["GitHub", "GitHub Copilot"] },
    { slug: "vercel", name: "Vercel", description: "Frontend cloud platform and Next.js creators", searchTerms: ["Vercel", "Next.js"] },
    { slug: "supabase", name: "Supabase", description: "Open-source Firebase alternative", searchTerms: ["Supabase"] },
    { slug: "mongodb", name: "MongoDB", description: "Leading NoSQL document database", searchTerms: ["MongoDB"] },
    { slug: "redis", name: "Redis", description: "In-memory data store and cache", searchTerms: ["Redis"] },
    { slug: "docker", name: "Docker", description: "Container platform for applications", searchTerms: ["Docker"] },
    { slug: "youtube", name: "YouTube", description: "World's largest video sharing platform", searchTerms: ["YouTube"] },
    { slug: "tiktok", name: "TikTok", description: "Short-form video platform", searchTerms: ["TikTok", "ByteDance"] },
    { slug: "x-twitter", name: "X (Twitter)", description: "Social media platform for real-time conversation", searchTerms: ["Twitter"] },
    { slug: "instagram", name: "Instagram", description: "Photo and video sharing platform", searchTerms: ["Instagram"] },
    { slug: "facebook", name: "Facebook", description: "World's largest social networking platform", searchTerms: ["Facebook"] },
    { slug: "linkedin", name: "LinkedIn", description: "Professional networking platform", searchTerms: ["LinkedIn"] },
    { slug: "reddit", name: "Reddit", description: "Community-driven social news platform", searchTerms: ["Reddit"] },
    { slug: "snapchat", name: "Snap Inc.", description: "Camera and social media company behind Snapchat", searchTerms: ["Snapchat", "Snap Inc"] },
    { slug: "samsung", name: "Samsung", description: "Electronics and semiconductor company", searchTerms: ["Samsung"] },
    { slug: "sony", name: "Sony", description: "Electronics, gaming, and entertainment conglomerate", searchTerms: ["Sony", "PlayStation"] },
    { slug: "nintendo", name: "Nintendo", description: "Gaming company behind Mario and Switch", searchTerms: ["Nintendo"] },
    { slug: "block", name: "Block, Inc.", description: "Fintech company behind Square and Cash App", searchTerms: ["Block Inc", "Square", "Cash App"] },
    { slug: "paypal", name: "PayPal", description: "Digital payments platform", searchTerms: ["PayPal", "Venmo"] },
    { slug: "binance", name: "Binance", description: "World's largest cryptocurrency exchange", searchTerms: ["Binance"] },
    { slug: "robinhood", name: "Robinhood", description: "Commission-free trading platform", searchTerms: ["Robinhood"] },
    { slug: "visa", name: "Visa", description: "Global payments technology company", searchTerms: ["Visa"] },
    { slug: "mastercard", name: "Mastercard", description: "Global payment technology corporation", searchTerms: ["Mastercard"] },
    { slug: "kraken", name: "Kraken", description: "Cryptocurrency exchange", searchTerms: ["Kraken"] },
    { slug: "y-combinator", name: "Y Combinator", description: "World's most prestigious startup accelerator", searchTerms: ["Y Combinator", "YC"] },
    { slug: "andreessen-horowitz", name: "Andreessen Horowitz", description: "Leading venture capital firm", searchTerms: ["Andreessen Horowitz", "a16z"] },
    { slug: "sequoia-capital", name: "Sequoia Capital", description: "Legendary venture capital firm", searchTerms: ["Sequoia Capital", "Sequoia"] },
    { slug: "benchmark", name: "Benchmark", description: "Elite venture capital firm", searchTerms: ["Benchmark Capital", "Benchmark"] },
    { slug: "founders-fund", name: "Founders Fund", description: "VC firm founded by Peter Thiel", searchTerms: ["Founders Fund"] },
    { slug: "greylock", name: "Greylock Partners", description: "Leading venture capital firm", searchTerms: ["Greylock"] },
    { slug: "accel", name: "Accel", description: "Global venture capital firm", searchTerms: ["Accel Partners", "Accel"] },
    { slug: "lightspeed-venture-partners", name: "Lightspeed Venture Partners", description: "Global venture capital firm", searchTerms: ["Lightspeed Venture Partners", "Lightspeed"] },
    { slug: "kleiner-perkins", name: "Kleiner Perkins", description: "Storied Silicon Valley VC firm", searchTerms: ["Kleiner Perkins", "KPCB"] },
    { slug: "union-square-ventures", name: "Union Square Ventures", description: "New York-based venture capital firm", searchTerms: ["Union Square Ventures", "USV"] },
    { slug: "blackrock", name: "BlackRock", description: "World's largest asset management firm", searchTerms: ["BlackRock"] },
    { slug: "blackstone", name: "Blackstone", description: "World's largest alternative asset manager", searchTerms: ["Blackstone"] },
    { slug: "goldman-sachs", name: "Goldman Sachs", description: "Leading global investment bank", searchTerms: ["Goldman Sachs"] },
    { slug: "jpmorgan", name: "JPMorgan Chase", description: "Largest bank in the United States", searchTerms: ["JPMorgan", "JP Morgan", "JPMorgan Chase", "Chase Bank"] },
    { slug: "morgan-stanley", name: "Morgan Stanley", description: "Global investment bank and wealth management firm", searchTerms: ["Morgan Stanley"] },
    { slug: "berkshire-hathaway", name: "Berkshire Hathaway", description: "Warren Buffett's conglomerate holding company", searchTerms: ["Berkshire Hathaway"] },
    { slug: "ark-invest", name: "ARK Invest", description: "Innovation-focused investment management firm", searchTerms: ["ARK Invest", "ARKK", "Cathie Wood"] },
    { slug: "bloomberg", name: "Bloomberg", description: "Financial data, media, and technology company", searchTerms: ["Bloomberg"] },
    { slug: "wall-street-journal", name: "The Wall Street Journal", description: "Flagship business news publication", searchTerms: ["Wall Street Journal", "WSJ"] },
    { slug: "the-economist", name: "The Economist", description: "International current affairs publication", searchTerms: ["The Economist"] },
    { slug: "financial-times", name: "Financial Times", description: "International business newspaper", searchTerms: ["Financial Times", "FT"] },
    { slug: "techcrunch", name: "TechCrunch", description: "Technology news outlet covering startups", searchTerms: ["TechCrunch"] },
    { slug: "the-information", name: "The Information", description: "Premium tech news publication", searchTerms: ["The Information"] },
    { slug: "techstars", name: "Techstars", description: "Global startup accelerator network", searchTerms: ["Techstars"] },
    { slug: "servicenow", name: "ServiceNow", description: "Enterprise workflow automation platform", searchTerms: ["ServiceNow"] },
    { slug: "workday", name: "Workday", description: "Enterprise cloud HR and finance platform", searchTerms: ["Workday"] },
    { slug: "oracle", name: "Oracle", description: "Enterprise software and database company", searchTerms: ["Oracle"] },
    { slug: "unity", name: "Unity Technologies", description: "Real-time 3D development platform", searchTerms: ["Unity Technologies", "Unity Engine"] },
    { slug: "autodesk", name: "Autodesk", description: "3D design and engineering software company", searchTerms: ["Autodesk", "AutoCAD"] },
    { slug: "pinterest", name: "Pinterest", description: "Visual discovery and bookmarking platform", searchTerms: ["Pinterest"] },
    { slug: "american-express", name: "American Express", description: "Financial services and payment card company", searchTerms: ["American Express", "Amex"] },
    { slug: "mckinsey", name: "McKinsey & Company", description: "World's most prestigious management consulting firm", searchTerms: ["McKinsey"] },
    { slug: "bcg", name: "Boston Consulting Group", description: "Global management consulting firm", searchTerms: ["Boston Consulting Group", "BCG"] },
    { slug: "bain", name: "Bain & Company", description: "Global management consulting firm", searchTerms: ["Bain & Company", "Bain"] },
    { slug: "opensea", name: "OpenSea", description: "Largest NFT marketplace", searchTerms: ["OpenSea"] },
    { slug: "chainalysis", name: "Chainalysis", description: "Blockchain analytics and compliance platform", searchTerms: ["Chainalysis"] },
    { slug: "bitcoin", name: "Bitcoin", description: "First and largest decentralized cryptocurrency", searchTerms: ["Bitcoin", "BTC"] },
    { slug: "ethereum", name: "Ethereum", description: "Decentralized blockchain platform for smart contracts", searchTerms: ["Ethereum", "ETH"] },
    { slug: "disney", name: "Disney", description: "Global entertainment and media conglomerate", searchTerms: ["Disney"] },
    { slug: "cursor", name: "Cursor", description: "AI-powered code editor built on VS Code", searchTerms: ["Cursor"] },
    { slug: "substack", name: "Substack", description: "Newsletter and publishing platform for independent writers", searchTerms: ["Substack"] },
    { slug: "slack", name: "Slack", description: "Business communication and collaboration platform", searchTerms: ["Slack"] },
    { slug: "waymo", name: "Waymo", description: "Alphabet's autonomous driving technology company", searchTerms: ["Waymo"] },
    { slug: "zoom", name: "Zoom", description: "Video communications platform", searchTerms: ["Zoom"] },
    { slug: "walmart", name: "Walmart", description: "World's largest retailer by revenue", searchTerms: ["Walmart"] },
    { slug: "softbank", name: "SoftBank", description: "Japanese conglomerate and technology investment firm", searchTerms: ["SoftBank", "SoftBank Vision Fund"] },
    { slug: "elevenlabs", name: "ElevenLabs", description: "AI voice synthesis and cloning platform", searchTerms: ["ElevenLabs", "Eleven Labs"] },
    { slug: "amd", name: "AMD", description: "Semiconductor company designing CPUs and GPUs", searchTerms: ["AMD"] },
    { slug: "broadcom", name: "Broadcom", description: "Global semiconductor and infrastructure software company", searchTerms: ["Broadcom"] },
    { slug: "product-hunt", name: "Product Hunt", description: "Platform for discovering and launching new tech products", searchTerms: ["Product Hunt"] },
    { slug: "zapier", name: "Zapier", description: "No-code automation platform connecting apps and workflows", searchTerms: ["Zapier"] },
    { slug: "cisco", name: "Cisco", description: "Networking hardware and enterprise technology company", searchTerms: ["Cisco"] },
    { slug: "discord", name: "Discord", description: "Voice, video, and text communication platform for communities", searchTerms: ["Discord"] },
    { slug: "nike", name: "Nike", description: "World's largest athletic footwear and apparel company", searchTerms: ["Nike"] },
    { slug: "costco", name: "Costco", description: "Membership-based warehouse retail chain", searchTerms: ["Costco"] },
    { slug: "boeing", name: "Boeing", description: "Aerospace and defense manufacturer", searchTerms: ["Boeing"] },
    { slug: "toast-inc", name: "Toast", description: "Restaurant technology and point-of-sale platform", searchTerms: ["Toast"] },
    { slug: "wework", name: "WeWork", description: "Flexible workspace and coworking company", searchTerms: ["WeWork"] },
    { slug: "qualcomm", name: "Qualcomm", description: "Semiconductor company specializing in mobile chipsets", searchTerms: ["Qualcomm"] },
    { slug: "groq", name: "Groq", description: "AI inference chip company for ultra-fast LLM processing", searchTerms: ["Groq"] },
    { slug: "webflow", name: "Webflow", description: "No-code website builder and CMS platform", searchTerms: ["Webflow"] },
    { slug: "runway-ml", name: "Runway", description: "AI-powered creative tools for video generation and editing", searchTerms: ["Runway"] },
  ];

  const { registerEntityPeople, registerEntityCompanies } = await import("./podcastMeta");
  registerEntityPeople(ENTITY_PEOPLE.map(p => ({ slug: p.slug, name: p.name, title: p.title })));
  registerEntityCompanies(ENTITY_COMPANIES.map(c => ({ slug: c.slug, name: c.name, description: c.description })));

  const AMBIGUOUS_TERMS = new Set([
    "Notion", "Oracle", "Square", "Chase", "Visa", "Benchmark", "Snowflake",
    "Perplexity", "Bain", "Citadel", "Accel", "Sequoia",
    "The Information", "The Economist",
    "Claude", "Gemini", "Slack", "Discord", "Zoom", "Toast", "Runway",
    "Cursor", "Box", "Circle"
  ]);

  function termMatchesInText(text: string, term: string): boolean {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (AMBIGUOUS_TERMS.has(term)) {
      const regex = new RegExp(`\\b${escaped}\\b`);
      return regex.test(text);
    }
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    return regex.test(text);
  }

  function buildSearchCondition(fields: string[], paramIndex: number, term: string): { sql: string; param: string } {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (AMBIGUOUS_TERMS.has(term)) {
      return {
        sql: fields.map(f => `${f} ~ $${paramIndex}`).join(" OR "),
        param: `\\m${escaped}\\M`,
      };
    }
    return {
      sql: fields.map(f => `${f} ~* $${paramIndex}`).join(" OR "),
      param: `\\m${escaped}\\M`,
    };
  }

  function extractMentionContext(fields: string[], searchTerms: string[]): string {
    for (const text of fields) {
      if (!text) continue;
      let cleaned = text
        .replace(/^\["|"\]$/g, "")
        .replace(/^"|"$/g, "")
        .replace(/\\"/g, '"')
        .replace(/","/g, ". ")
        .replace(/\["/g, "")
        .replace(/"]/g, "");
      const sentences = cleaned.split(/(?<=[.!?])\s+/);
      for (const term of searchTerms) {
        for (const sentence of sentences) {
          if (termMatchesInText(sentence, term)) {
            let trimmed = sentence.trim().replace(/^["'\s]+/, "").replace(/["'\s]+$/, "");
            if (trimmed.length < 20) continue;
            if (trimmed.length > 250) trimmed = trimmed.substring(0, 247) + "...";
            return trimmed;
          }
        }
      }
    }
    return "";
  }

  function computeTrendDirection(recentCount: number, olderCount: number): { direction: "rising" | "stable" | "falling"; changePercent: number } {
    if (olderCount === 0 && recentCount > 0) return { direction: "rising", changePercent: 100 };
    if (olderCount === 0 && recentCount === 0) return { direction: "stable", changePercent: 0 };
    const change = ((recentCount - olderCount) / olderCount) * 100;
    if (change > 15) return { direction: "rising", changePercent: Math.round(change) };
    if (change < -15) return { direction: "falling", changePercent: Math.round(change) };
    return { direction: "stable", changePercent: Math.round(change) };
  }

  function isRecent(publishDate: string | null): boolean {
    if (!publishDate) return false;
    const d = new Date(publishDate + "T00:00:00");
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return d >= cutoff;
  }

  async function computePeopleData() {
    const { pool: dbPool } = await import("./db");
    const client = await dbPool.connect();
    try {
      const { rows: allRecaps } = await client.query(
        `SELECT slug, episode_slug, guests, episode_title, what_happened, tldl, key_insights::text as key_insights_text, publish_date FROM landing_page_recaps`
      );

      const results = [];
      for (const person of ENTITY_PEOPLE) {
        const hostedSet = new Set(person.hostedSlugs);
        const filtered = allRecaps.filter((r: any) => !hostedSet.has(r.slug));

        const guestRows = filtered.filter((r: any) => {
          if (!r.guests) return false;
          return person.searchTerms.some(term => {
            const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escaped}\\b`, 'i');
            return regex.test(r.guests);
          });
        });
        const guestKeys = new Set(guestRows.map((r: any) => `${r.slug}/${r.episode_slug}`));

        const mentionRows = filtered.filter((r: any) => {
          if (guestKeys.has(`${r.slug}/${r.episode_slug}`)) return false;
          const texts = [r.what_happened, r.tldl, r.key_insights_text, r.episode_title].filter(Boolean);
          return person.searchTerms.some(term =>
            texts.some(t => termMatchesInText(t, term))
          );
        });

        const allRows = [...guestRows, ...mentionRows];
        const recentCount = allRows.filter(r => isRecent(r.publish_date)).length;
        const olderCount = allRows.length - recentCount;
        const trend = computeTrendDirection(recentCount, olderCount);

        results.push({
          slug: person.slug,
          name: person.name,
          title: person.title,
          gender: person.gender,
          category: person.category,
          mentionCount: mentionRows.length,
          guestCount: guestRows.length,
          recentMentions: recentCount,
          trend: trend.direction,
          changePercent: trend.changePercent,
        });
      }

      results.sort((a, b) => (b.mentionCount + b.guestCount) - (a.mentionCount + a.guestCount));
      return results;
    } finally {
      client.release();
    }
  }

  app.get("/api/entities/people", async (_req, res) => {
    try {
      const cached = directoryCache.people.get();
      if (cached) return res.json(cached);
      const results = await computePeopleData();
      directoryCache.people.set(results);
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch people" });
    }
  });

  app.get("/api/entities/people/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const person = ENTITY_PEOPLE.find(p => p.slug === slug);
      if (!person) return res.status(404).json({ error: "Person not found" });

      const { pool: dbPool } = await import("./db");
      const client = await dbPool.connect();

      try {
        const excludeCondition = person.hostedSlugs.length > 0
          ? ` AND slug NOT IN (${person.hostedSlugs.map((_, i) => `$${person.searchTerms.length + i + 1}`).join(",")})`
          : "";
        const extraParams = person.hostedSlugs;

        const guestConditions = person.searchTerms.map((_, i) => {
          const p = `$${i + 1}`;
          return `guests ~* ${p}`;
        }).join(" OR ");
        const guestParams = [...person.searchTerms.map(t => {
          const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return `\\m${escaped}\\M`;
        }), ...extraParams];
        const { rows: guestEpisodes } = await client.query(
          `SELECT slug, episode_slug, podcast_name, episode_title, publish_date, artwork_url, what_happened, tldl, key_insights::text as key_insights_text, key_topics, resources FROM landing_page_recaps WHERE guests IS NOT NULL AND (${guestConditions})${excludeCondition} ORDER BY publish_date DESC`,
          guestParams
        );

        const mentionParts = person.searchTerms.map((t, i) => buildSearchCondition(["what_happened", "tldl", "key_insights::text", "episode_title"], i + 1, t));
        const mentionConditions = mentionParts.map(p => `(${p.sql})`).join(" OR ");
        const mentionParams = [...mentionParts.map(p => p.param), ...extraParams];
        const { rows: mentionEpisodes } = await client.query(
          `SELECT slug, episode_slug, podcast_name, episode_title, publish_date, artwork_url, what_happened, tldl, key_insights::text as key_insights_text, key_topics, resources FROM landing_page_recaps WHERE (${mentionConditions})${excludeCondition} ORDER BY publish_date DESC`,
          mentionParams
        );

        const guestKeys = new Set(guestEpisodes.map((e: any) => `${e.slug}/${e.episode_slug}`));
        const allRelevantEpisodes = [...guestEpisodes, ...mentionEpisodes.filter((e: any) => !guestKeys.has(`${e.slug}/${e.episode_slug}`))];

        const allEpSlugs = allRelevantEpisodes.map((e: any) => e.episode_slug);
        const transcriptSet = new Set<string>();
        if (allEpSlugs.length > 0) {
          const placeholders = allEpSlugs.map((_: any, i: number) => `$${i + 1}`).join(",");
          const { rows: transcriptRows } = await client.query(
            `SELECT DISTINCT episode_slug FROM transcript_segments WHERE episode_slug IN (${placeholders})`,
            allEpSlugs
          );
          for (const r of transcriptRows) transcriptSet.add(r.episode_slug);
        }

        const computeRelevanceScore = (e: any, type: "guest" | "mention") => {
          if (type === "guest") return 100;
          const titleLower = (e.episode_title || "").toLowerCase();
          const titleMatch = person.searchTerms.some(term => titleLower.includes(term.toLowerCase()));
          if (titleMatch) return 50;
          const bodyText = [e.what_happened || "", e.tldl || ""].join(" ").toLowerCase();
          const mentionCount = person.searchTerms.reduce((acc: number, term: string) => {
            const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            return acc + (bodyText.match(regex) || []).length;
          }, 0);
          if (mentionCount >= 3) return 25;
          return 10;
        };

        const mapEpisode = (e: any, type: "guest" | "mention") => ({
          slug: e.slug,
          episode_slug: e.episode_slug,
          podcast_name: e.podcast_name,
          episode_title: e.episode_title,
          publish_date: e.publish_date,
          artwork_url: e.artwork_url,
          context: extractMentionContext([e.what_happened, e.tldl, e.key_insights_text].filter(Boolean), person.searchTerms),
          tldl: e.tldl || "",
          type,
          hasTranscript: transcriptSet.has(e.episode_slug),
          relevanceScore: computeRelevanceScore(e, type),
        });

        const guestAppearancesWithContext = guestEpisodes.map((e: any) => mapEpisode(e, "guest"));
        const mentionsOnly = mentionEpisodes
          .filter((e: any) => !guestKeys.has(`${e.slug}/${e.episode_slug}`))
          .map((e: any) => mapEpisode(e, "mention"));

        const canonicalTopics: Record<string, { name: string; keywords: string[] }> = {
          "ai": { name: "Artificial Intelligence", keywords: ["artificial intelligence", "machine learning", "deep learning", "neural network", "large language model", "GPT", "LLM", "ChatGPT", "OpenAI", "Anthropic", "Claude", "AI agent", "AI model", "generative AI"] },
          "entrepreneurship": { name: "Entrepreneurship", keywords: ["entrepreneurship", "entrepreneur", "founded", "co-founded", "founder", "startup", "bootstrap", "side hustle", "building a business"] },
          "startups": { name: "Startups", keywords: ["startup", "startups", "product-market fit", "seed round", "series A", "early-stage", "pivot", "incubator", "accelerator", "Y Combinator"] },
          "venture-capital": { name: "Venture Capital", keywords: ["venture capital", "venture capitalist", "VC firm", "fundraising round", "series A", "series B", "seed funding", "term sheet", "cap table", "valuation"] },
          "investing": { name: "Investing", keywords: ["investing", "investment strategy", "stock market", "portfolio management", "stocks", "bonds", "ETF", "hedge fund", "asset allocation", "returns"] },
          "personal-finance": { name: "Personal Finance", keywords: ["personal finance", "financial independence", "wealth building", "financial planning", "budgeting", "saving", "retirement", "debt", "net worth", "FIRE"] },
          "leadership": { name: "Leadership", keywords: ["leadership", "leading teams", "executive leadership", "CEO", "executive", "organizational culture", "management"] },
          "marketing": { name: "Marketing", keywords: ["marketing strategy", "digital marketing", "brand strategy", "marketing", "growth hacking", "advertising", "SEO", "content marketing"] },
          "sales": { name: "Sales", keywords: ["sales strategy", "sales process", "selling", "sales", "revenue", "pipeline", "B2B sales", "closing deals"] },
          "productivity": { name: "Productivity", keywords: ["productivity", "time management", "deep work", "habits", "routines", "efficiency", "focus", "workflow"] },
          "technology": { name: "Technology", keywords: ["technology", "software engineering", "tech industry", "software", "engineering", "computing", "cloud", "infrastructure", "developer"] },
          "economics": { name: "Economics", keywords: ["economics", "economic policy", "macroeconomics", "economy", "monetary policy", "inflation", "recession", "GDP", "Federal Reserve"] },
          "future-of-work": { name: "Future of Work", keywords: ["future of work", "remote work", "workplace transformation", "gig economy", "hybrid work", "automation replacing"] },
          "health-longevity": { name: "Health & Longevity", keywords: ["longevity", "healthspan", "lifespan", "nutrition", "fitness", "sleep", "wellness", "anti-aging", "biohacking"] },
          "psychology": { name: "Psychology", keywords: ["psychology", "psychological", "neuroscience", "behavior", "mental health", "cognitive", "therapy", "emotional intelligence"] },
          "self-improvement": { name: "Self-Improvement", keywords: ["self-improvement", "personal development", "personal growth", "mindset", "motivation", "discipline"] },
          "media-content": { name: "Media & Content", keywords: ["media industry", "content creation", "journalism", "media", "streaming", "podcast", "newsletter", "content strategy"] },
          "geopolitics": { name: "Geopolitics", keywords: ["geopolitics", "geopolitical", "foreign policy", "international relations", "diplomacy", "sanctions", "trade war", "national security"] },
          "creator-economy": { name: "Creator Economy", keywords: ["creator economy", "content creator", "creator", "influencer", "newsletter", "monetize", "audience building", "personal brand"] },
          "saas": { name: "SaaS", keywords: ["saas", "software as a service", "recurring revenue", "churn", "ARR", "MRR", "subscription", "B2B software"] },
          "crypto-web3": { name: "Crypto & Web3", keywords: ["cryptocurrency", "bitcoin", "blockchain", "web3", "crypto", "ethereum", "DeFi", "NFT", "token", "decentralized"] },
          "climate-energy": { name: "Climate & Energy", keywords: ["climate change", "clean energy", "renewable energy", "climate", "solar", "nuclear", "carbon", "sustainability", "electric vehicle"] },
          "defense-tech": { name: "Defense Tech", keywords: ["defense tech", "defense technology", "military technology", "defense", "military", "cybersecurity", "national security", "pentagon"] },
          "product-management": { name: "Product Management", keywords: ["product management", "product manager", "product strategy", "roadmap", "user research", "product-led"] },
          "open-source": { name: "Open Source", keywords: ["open source", "open-source", "free software", "GitHub", "Linux", "open model", "open weights"] },
          "automation": { name: "Automation", keywords: ["automation", "workflow automation", "process automation", "automate", "automated", "RPA", "no-code", "low-code"] },
          "robotics": { name: "Robotics", keywords: ["robotics", "robot", "autonomous vehicle", "humanoid", "drone", "self-driving", "autonomous"] },
          "bootstrapping": { name: "Bootstrapping", keywords: ["bootstrapping", "bootstrapped", "self-funded", "profitable", "no funding", "indie hacker", "revenue-funded"] },
          "side-hustles": { name: "Side Hustles", keywords: ["side hustle", "side project", "passive income", "freelance", "extra income", "side business"] },
        };

        const canonicalTopicCounts: Record<string, number> = {};
        for (const ep of allRelevantEpisodes) {
          const combinedText = [ep.what_happened, ep.tldl, ep.key_insights_text, ep.episode_title].filter(Boolean).join(" ").toLowerCase();
          for (const [slug, config] of Object.entries(canonicalTopics)) {
            const matchCount = config.keywords.filter(kw => combinedText.includes(kw.toLowerCase())).length;
            if (matchCount >= 2) {
              canonicalTopicCounts[slug] = (canonicalTopicCounts[slug] || 0) + 1;
            }
          }
        }
        const topTopics = Object.entries(canonicalTopicCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([slug, count]) => ({ topic: canonicalTopics[slug].name, count, slug }));

        const podcastCounts: Record<string, { name: string; count: number; artwork_url: string; latestDate: string; latestTitle: string; latestEpisodeSlug: string; podcastSlug: string }> = {};
        for (const ep of allRelevantEpisodes) {
          const key = ep.slug;
          if (!podcastCounts[key]) {
            podcastCounts[key] = {
              name: ep.podcast_name,
              count: 0,
              artwork_url: ep.artwork_url,
              latestDate: ep.publish_date || "",
              latestTitle: ep.episode_title,
              latestEpisodeSlug: ep.episode_slug,
              podcastSlug: ep.slug,
            };
          }
          podcastCounts[key].count++;
          if (ep.publish_date && ep.publish_date > podcastCounts[key].latestDate) {
            podcastCounts[key].latestDate = ep.publish_date;
            podcastCounts[key].latestTitle = ep.episode_title;
            podcastCounts[key].latestEpisodeSlug = ep.episode_slug;
          }
        }
        const podcastsFeaturingPerson = Object.values(podcastCounts)
          .sort((a, b) => b.count - a.count);

        const quotes: { text: string; podcastName: string; episodeTitle: string; date: string; slug: string; episodeSlug: string; isFromGuestEpisode: boolean }[] = [];
        const seenQuotes = new Set<string>();
        const addQuote = (text: string, ep: any, isGuest: boolean) => {
          if (quotes.length >= 6) return;
          const clean = text.trim();
          if (clean.length < 40 || clean.length > 400 || seenQuotes.has(clean)) return;
          seenQuotes.add(clean);
          quotes.push({
            text: clean,
            podcastName: ep.podcast_name,
            episodeTitle: ep.episode_title,
            date: ep.publish_date || "",
            slug: ep.slug,
            episodeSlug: ep.episode_slug,
            isFromGuestEpisode: isGuest,
          });
        };
        for (const ep of guestEpisodes) {
          if (quotes.length >= 6) break;
          const insights = ep.key_insights_text;
          if (insights) {
            try {
              const parsed = JSON.parse(insights);
              if (Array.isArray(parsed)) {
                for (const insight of parsed) {
                  const text = typeof insight === "string" ? insight : "";
                  if (person.searchTerms.some(term => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text))) {
                    addQuote(text, ep, true);
                  }
                }
              }
            } catch {}
          }
        }
        for (const ep of allRelevantEpisodes) {
          if (quotes.length >= 6) break;
          const isGuest = guestKeys.has(`${ep.slug}/${ep.episode_slug}`);
          const insights = ep.key_insights_text;
          if (insights) {
            try {
              const parsed = JSON.parse(insights);
              if (Array.isArray(parsed)) {
                for (const insight of parsed) {
                  const text = typeof insight === "string" ? insight : "";
                  if (person.searchTerms.some(term => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text))) {
                    addQuote(text, ep, isGuest);
                  }
                }
              }
            } catch {}
          }
        }
        if (quotes.length < 6) {
          for (const ep of allRelevantEpisodes) {
            if (quotes.length >= 6) break;
            const isGuest = guestKeys.has(`${ep.slug}/${ep.episode_slug}`);
            const context = extractMentionContext([ep.what_happened, ep.tldl].filter(Boolean), person.searchTerms);
            if (context && context.length > 40) {
              addQuote(context, ep, isGuest);
            }
          }
        }

        let hostedEpisodesWithResources: any[] = [];
        if (person.hostedSlugs.length > 0) {
          const hostedPlaceholders = person.hostedSlugs.map((_, i) => `$${i + 1}`).join(",");
          const { rows: hostedRows } = await client.query(
            `SELECT slug, resources FROM landing_page_recaps WHERE slug IN (${hostedPlaceholders}) AND resources IS NOT NULL AND resources::text != '[]'`,
            person.hostedSlugs
          );
          hostedEpisodesWithResources = hostedRows;
        }

        const bookMentionMap = new Map<string, { name: string; author: string | null; url: string; context: string; mentionCount: number; podcastSlugs: Set<string> }>();
        const allEpisodesForBooks = [...allRelevantEpisodes, ...hostedEpisodesWithResources];
        for (const ep of allEpisodesForBooks) {
          if (!ep.resources) continue;
          let resources: any[];
          try {
            const parsed = typeof ep.resources === 'string' ? JSON.parse(ep.resources) : ep.resources;
            if (!Array.isArray(parsed)) continue;
            resources = parsed;
          } catch { continue; }
          for (const r of resources) {
            if (!r || r.type !== 'book' || !r.name || r.name === '_books_checked') continue;
            const key = r.name.toLowerCase().trim();
            const existing = bookMentionMap.get(key);
            if (existing) {
              existing.mentionCount++;
              existing.podcastSlugs.add(ep.slug);
              if (!existing.author && r.author) existing.author = r.author;
              if (!existing.context && r.context) existing.context = r.context;
              if (r.url && r.url.includes('/dp/') && !existing.url?.includes('/dp/')) existing.url = r.url;
            } else {
              const podcastSlugs = new Set<string>();
              podcastSlugs.add(ep.slug);
              bookMentionMap.set(key, {
                name: r.name,
                author: r.author || null,
                url: r.url || "",
                context: r.context || "",
                mentionCount: 1,
                podcastSlugs,
              });
            }
          }
        }

        let recommendedBooks: { name: string; author: string | null; slug: string | null; amazonUrl: string; asin: string | null; googleBooksId: string | null; context: string; mentionCount: number; podcastCount: number }[] = [];
        if (bookMentionMap.size > 0) {
          const bookKeys = Array.from(bookMentionMap.keys());
          const placeholders = bookKeys.map((_, i) => `$${i + 1}`).join(",");
          const { rows: enrichRows } = await client.query(
            `SELECT book_key, slug, author, asin, amazon_url, google_books_id FROM book_enrichments WHERE book_key IN (${placeholders})`,
            bookKeys
          );
          const enrichByKey = new Map(enrichRows.map((e: any) => [e.book_key, e]));

          recommendedBooks = Array.from(bookMentionMap.entries())
            .map(([key, b]) => {
              const enrich = enrichByKey.get(key) as any;
              const asin = enrich?.asin || extractAsinFromUrl(b.url);
              const amazonUrl = asin
                ? `https://www.amazon.com/dp/${asin}?tag=podcap-20`
                : enrich?.amazon_url || b.url || "";
              return {
                name: b.name,
                author: enrich?.author || b.author,
                slug: enrich?.slug || null,
                amazonUrl,
                asin,
                googleBooksId: enrich?.google_books_id || null,
                context: b.context,
                mentionCount: b.mentionCount,
                podcastCount: b.podcastSlugs.size,
              };
            })
            .filter(b => b.slug)
            .sort((a, b) => b.mentionCount - a.mentionCount || b.podcastCount - a.podcastCount)
            .slice(0, 12);
        }

        res.json({
          name: person.name,
          title: person.title,
          slug,
          guestAppearances: guestAppearancesWithContext,
          mentions: mentionsOnly,
          guestCount: guestAppearancesWithContext.length,
          mentionCount: mentionsOnly.length,
          topTopics,
          podcastsFeaturingPerson,
          quotes,
          recommendedBooks,
        });
      } finally {
        client.release();
      }
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch person" });
    }
  });

  async function computeCompaniesData() {
    const { pool: dbPool } = await import("./db");
    const client = await dbPool.connect();
    try {
      const { rows: allRecaps } = await client.query(
        `SELECT what_happened, tldl, key_insights::text as key_insights_text, publish_date FROM landing_page_recaps`
      );

      const results = [];
      for (const company of ENTITY_COMPANIES) {
        let mentionCount = 0;
        let recentCount = 0;
        let olderCount = 0;
        for (const row of allRecaps) {
          const texts = [row.what_happened, row.tldl, row.key_insights_text].filter(Boolean);
          const allTerms = [...company.searchTerms, ...((company as any).associatedTerms || [])];
          const matched = allTerms.some(term =>
            texts.some(t => termMatchesInText(t, term))
          );
          if (matched) {
            mentionCount++;
            if (isRecent(row.publish_date)) recentCount++;
            else olderCount++;
          }
        }
        const trend = computeTrendDirection(recentCount, olderCount);
        results.push({
          slug: company.slug,
          name: company.name,
          description: company.description,
          mentionCount,
          recentMentions: recentCount,
          trend: trend.direction,
          changePercent: trend.changePercent,
        });
      }
      results.sort((a, b) => b.mentionCount - a.mentionCount);
      return results;
    } finally {
      client.release();
    }
  }

  app.get("/api/entities/companies", async (_req, res) => {
    try {
      const cached = directoryCache.companies.get();
      if (cached) return res.json(cached);
      const results = await computeCompaniesData();
      directoryCache.companies.set(results);
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch companies" });
    }
  });

  const TRENDING_TOPIC_KEYWORDS: Record<string, { name: string; primary: string[]; secondary: string[]; minScore: number }> = {
    "ai": { name: "Artificial Intelligence", primary: ["artificial intelligence", "machine learning", "deep learning", "neural network", "large language model"], secondary: ["GPT", "LLM", "ChatGPT", "OpenAI", "Anthropic", "Claude", "AI agent", "AI model", "generative AI"], minScore: 4 },
    "startups": { name: "Startups", primary: ["startup", "startups", "product-market fit", "seed round", "series A"], secondary: ["early-stage", "pivot", "launch", "incubator", "accelerator", "Y Combinator"], minScore: 3 },
    "venture-capital": { name: "Venture Capital", primary: ["venture capital", "venture capitalist", "VC firm", "fundraising round"], secondary: ["VC", "series A", "series B", "seed funding", "term sheet", "cap table", "valuation"], minScore: 3 },
    "investing": { name: "Investing", primary: ["investing", "investment strategy", "stock market", "portfolio management"], secondary: ["stocks", "bonds", "ETF", "hedge fund", "asset allocation", "returns"], minScore: 3 },
    "entrepreneurship": { name: "Entrepreneurship", primary: ["entrepreneurship", "entrepreneur", "founded", "co-founded"], secondary: ["founder", "startup", "bootstrap", "bootstrapped", "side hustle", "building a business"], minScore: 3 },
    "leadership": { name: "Leadership", primary: ["leadership", "leading teams", "executive leadership"], secondary: ["CEO", "executive", "leader", "vision", "organizational culture", "management"], minScore: 3 },
    "marketing": { name: "Marketing", primary: ["marketing strategy", "digital marketing", "brand strategy"], secondary: ["marketing", "brand", "growth hacking", "advertising", "SEO", "content marketing"], minScore: 3 },
    "crypto-web3": { name: "Crypto & Web3", primary: ["cryptocurrency", "bitcoin", "blockchain", "web3"], secondary: ["crypto", "ethereum", "DeFi", "NFT", "token", "decentralized"], minScore: 3 },
    "health-longevity": { name: "Health & Longevity", primary: ["longevity", "healthspan", "lifespan"], secondary: ["nutrition", "fitness", "sleep", "wellness", "anti-aging", "biohacking", "metabolic health"], minScore: 3 },
    "technology": { name: "Technology", primary: ["technology", "software engineering", "tech industry"], secondary: ["software", "engineering", "computing", "cloud", "infrastructure", "developer"], minScore: 3 },
    "economics": { name: "Economics", primary: ["economics", "economic policy", "macroeconomics"], secondary: ["economy", "monetary policy", "inflation", "recession", "GDP", "Federal Reserve"], minScore: 3 },
    "climate-energy": { name: "Climate & Energy", primary: ["climate change", "clean energy", "renewable energy"], secondary: ["climate", "solar", "nuclear", "carbon", "sustainability", "electric vehicle"], minScore: 3 },
    "defense-tech": { name: "Defense Tech", primary: ["defense tech", "defense technology", "military technology"], secondary: ["defense", "military", "cybersecurity", "national security", "pentagon"], minScore: 3 },
    "robotics": { name: "Robotics", primary: ["robotics", "robot", "autonomous vehicle"], secondary: ["humanoid", "drone", "manufacturing automation", "self-driving", "autonomous"], minScore: 3 },
    "psychology": { name: "Psychology", primary: ["psychology", "psychological", "neuroscience"], secondary: ["behavior", "mental health", "cognitive", "therapy", "emotional intelligence"], minScore: 3 },
    "geopolitics": { name: "Geopolitics", primary: ["geopolitics", "geopolitical", "foreign policy", "international relations"], secondary: ["diplomacy", "international", "sanctions", "trade war", "national security"], minScore: 3 },
    "saas": { name: "SaaS", primary: ["saas", "software as a service", "recurring revenue"], secondary: ["churn", "ARR", "MRR", "subscription", "B2B software"], minScore: 3 },
    "creator-economy": { name: "Creator Economy", primary: ["creator economy", "content creator", "creator"], secondary: ["influencer", "newsletter", "monetize", "audience building", "personal brand"], minScore: 3 },
    "automation": { name: "Automation", primary: ["automation", "workflow automation", "process automation"], secondary: ["automate", "automated", "RPA", "no-code", "low-code", "Zapier"], minScore: 3 },
    "personal-finance": { name: "Personal Finance", primary: ["personal finance", "financial independence", "wealth building"], secondary: ["budgeting", "saving", "retirement", "debt", "credit score", "FIRE"], minScore: 3 },
  };

  async function computeTopicsData() {
    const { pool: dbPool } = await import("./db");
    const client = await dbPool.connect();
    try {
      const { rows: allRecaps } = await client.query(
        `SELECT what_happened, tldl, key_insights::text as key_insights_text, episode_title, publish_date FROM landing_page_recaps`
      );

      const results = [];
      for (const [slug, config] of Object.entries(TRENDING_TOPIC_KEYWORDS)) {
        const allKeywords = [...config.primary, ...config.secondary];
        let mentionCount = 0;
        let recentCount = 0;
        let olderCount = 0;

        for (const row of allRecaps) {
          const texts = [row.what_happened, row.tldl, row.key_insights_text, row.episode_title].filter(Boolean);
          let score = 0;
          for (const kw of config.primary) {
            if (texts.some(t => t.toLowerCase().includes(kw.toLowerCase()))) score += 3;
          }
          for (const kw of config.secondary) {
            if (texts.some(t => t.toLowerCase().includes(kw.toLowerCase()))) score += 1;
          }
          if (score >= config.minScore) {
            mentionCount++;
            if (isRecent(row.publish_date)) recentCount++;
            else olderCount++;
          }
        }

        const trend = computeTrendDirection(recentCount, olderCount);
        results.push({
          slug,
          name: config.name,
          mentionCount,
          recentMentions: recentCount,
          trend: trend.direction,
          changePercent: trend.changePercent,
        });
      }
      results.sort((a, b) => b.mentionCount - a.mentionCount);
      return results;
    } finally {
      client.release();
    }
  }

  app.get("/api/entities/topics", async (_req, res) => {
    try {
      const cached = directoryCache.topics.get();
      if (cached) return res.json(cached);
      const results = await computeTopicsData();
      directoryCache.topics.set(results);
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch topics" });
    }
  });

  app.get("/api/entities/companies/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const company = ENTITY_COMPANIES.find(c => c.slug === slug);
      if (!company) return res.status(404).json({ error: "Company not found" });

      const { pool: dbPool } = await import("./db");
      const client = await dbPool.connect();
      try {
        const allTerms = [...company.searchTerms, ...((company as any).associatedTerms || [])];
        const parts = allTerms.map((t, i) => buildSearchCondition(["what_happened", "tldl", "key_insights::text"], i + 1, t));
        const conditions = parts.map(p => `(${p.sql})`).join(" OR ");
        const params = parts.map(p => p.param);
        const { rows: mentionEpisodes } = await client.query(
          `SELECT slug, episode_slug, podcast_name, episode_title, publish_date, artwork_url, what_happened, tldl, key_insights::text as key_insights_text FROM landing_page_recaps WHERE ${conditions} ORDER BY publish_date DESC`,
          params
        );

        const mentions = mentionEpisodes.map((e: any) => ({
          slug: e.slug,
          episode_slug: e.episode_slug,
          podcast_name: e.podcast_name,
          episode_title: e.episode_title,
          publish_date: e.publish_date,
          artwork_url: e.artwork_url,
          context: extractMentionContext([e.what_happened, e.tldl, e.key_insights_text].filter(Boolean), allTerms),
        }));

        res.json({
          name: company.name,
          description: company.description,
          slug,
          mentions,
          mentionCount: mentions.length,
        });
      } finally {
        client.release();
      }
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch company" });
    }
  });

  app.get("/api/podcasts/:slug/:episodeSlug/transcript-segments", (_req, res) => {
    res.status(410).json({ error: "Transcript access has been removed" });
  });

  app.get("/api/podcasts/:slug/recaps", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
      const recaps = await storage.getLandingPageRecaps(req.params.slug, limit, offset);
      if (req.query.offset !== undefined || req.query.count === "true") {
        const total = await storage.getLandingPageRecapCount(req.params.slug);
        res.json({ recaps, total, limit, offset });
      } else {
        res.json(recaps);
      }
    } catch {
      res.status(500).json({ error: "Failed to fetch recaps" });
    }
  });

  app.get("/api/podcasts/:slug/episodes-list", async (req, res) => {
    try {
      const { slug } = req.params;
      const allRecaps = await storage.getLandingPageRecaps(slug, 1000, 0);
      const lightweight = allRecaps.map(r => ({
        episodeSlug: r.episodeSlug,
        episodeTitle: r.episodeTitle,
        publishDate: r.publishDate,
        duration: r.duration,
        tldl: r.tldl,
        guests: r.guests,
        keyTopics: r.keyTopics,
      }));
      res.json(lightweight);
    } catch {
      res.status(500).json({ error: "Failed to fetch episodes list" });
    }
  });

  app.get("/api/podcasts/:slug/books", async (req, res) => {
    try {
      const { slug } = req.params;
      const { rows } = await pool.query(
        `SELECT episode_slug, episode_title, resources
         FROM landing_page_recaps
         WHERE slug = $1 AND resources IS NOT NULL AND resources::text != '[]'`,
        [slug]
      );

      const bookMap = new Map<string, {
        name: string;
        author: string | null;
        description: string;
        url: string;
        context: string[];
        episodes: { slug: string; title: string }[];
        mentionCount: number;
      }>();

      for (const row of rows) {
        let resources: any[];
        try {
          resources = typeof row.resources === 'string' ? JSON.parse(row.resources) : row.resources;
        } catch { continue; }

        for (const r of resources) {
          if (r.type !== 'book' || !r.name) continue;

          const key = r.name.toLowerCase().trim();
          const existing = bookMap.get(key);
          if (existing) {
            existing.mentionCount++;
            if (r.context && !existing.context.includes(r.context)) {
              existing.context.push(r.context);
            }
            if (!existing.episodes.find((e: any) => e.slug === row.episode_slug)) {
              existing.episodes.push({ slug: row.episode_slug, title: row.episode_title });
            }
            if (!existing.author && r.author) existing.author = r.author;
            if (!existing.url && r.url) existing.url = r.url;
            if (r.url && !existing.url?.includes('/dp/')) existing.url = r.url;
          } else {
            bookMap.set(key, {
              name: r.name,
              author: r.author || null,
              description: r.description || "",
              url: r.url || "",
              context: r.context ? [r.context] : [],
              episodes: [{ slug: row.episode_slug, title: row.episode_title }],
              mentionCount: 1,
            });
          }
        }
      }

      const { rows: enrichments } = await pool.query("SELECT * FROM book_enrichments");
      const enrichMap = new Map(enrichments.map((e: any) => [e.book_key, e]));

      const books = Array.from(bookMap.values())
        .map(b => {
          const key = b.name.toLowerCase().trim();
          const enrichment = enrichMap.get(key) as any;
          const originalAsin = extractAsinFromUrl(b.url);
          const finalAsin = enrichment?.asin || originalAsin;
          return {
            ...b,
            description: enrichment?.description || b.description,
            author: enrichment?.author || b.author,
            asin: finalAsin,
            slug: enrichment?.slug || null,
            pageCount: enrichment?.page_count || null,
            publishYear: enrichment?.publish_year || null,
            rating: enrichment?.rating ? parseFloat(enrichment.rating) : null,
            googleBooksId: enrichment?.google_books_id || null,
          };
        })
        .sort((a, b) => b.mentionCount - a.mentionCount);

      res.json({ books, total: books.length });
    } catch (err) {
      console.error("Podcast books error:", err);
      res.status(500).json({ message: "Failed to load books" });
    }
  });

  function extractAsinFromUrl(url: string): string | null {
    if (!url) return null;
    const patterns = [
      /\/dp\/([A-Za-z0-9]{10})/,
      /\/gp\/product\/([A-Za-z0-9]{10})/,
      /\/product\/([A-Za-z0-9]{10})/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1].toUpperCase();
    }
    return null;
  }

  app.get("/api/book-slugs", async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT book_key, slug, rating, page_count, publish_year, asin, description, author, google_books_id FROM book_enrichments`
      );
      const map: Record<string, any> = {};
      for (const r of rows) {
        map[r.book_key] = {
          slug: r.slug || null,
          rating: r.rating ? parseFloat(r.rating) : null,
          pageCount: r.page_count || null,
          publishYear: r.publish_year || null,
          asin: r.asin || null,
          description: r.description || null,
          author: r.author || null,
          googleBooksId: r.google_books_id || null,
        };
      }
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.json(map);
    } catch (err) {
      console.error("Book slugs error:", err);
      res.status(500).json({});
    }
  });

  app.get("/api/bookstore", async (_req, res) => {
    try {
      const cached = directoryCache.bookstore.get();
      if (cached) return res.json(cached);

      const { rows } = await pool.query(
        `SELECT lpr.slug, lpr.episode_slug, lpr.episode_title, lpr.resources, pd.name as podcast_name
         FROM landing_page_recaps lpr
         JOIN podcast_directory pd ON pd.slug = lpr.slug
         WHERE lpr.resources IS NOT NULL AND lpr.resources::text != '[]'`
      );

      const bookMap = new Map<string, {
        name: string;
        author: string | null;
        description: string;
        url: string;
        context: string[];
        podcasts: Map<string, string>;
        episodes: { podcastSlug: string; episodeSlug: string; episodeTitle: string }[];
        mentionCount: number;
      }>();

      for (const row of rows) {
        let resources: any[];
        try {
          const parsed = typeof row.resources === 'string' ? JSON.parse(row.resources) : row.resources;
          if (!Array.isArray(parsed)) continue;
          resources = parsed;
        } catch { continue; }

        for (const r of resources) {
          if (!r || r.type !== 'book' || !r.name || r.name === '_books_checked') continue;

          const key = r.name.toLowerCase().trim();
          const existing = bookMap.get(key);
          if (existing) {
            existing.mentionCount++;
            if (r.context && !existing.context.includes(r.context)) {
              existing.context.push(r.context);
            }
            if (!existing.episodes.find(e => e.episodeSlug === row.episode_slug && e.podcastSlug === row.slug)) {
              existing.episodes.push({ podcastSlug: row.slug, episodeSlug: row.episode_slug, episodeTitle: row.episode_title });
            }
            existing.podcasts.set(row.slug, row.podcast_name);
            if (!existing.author && r.author) existing.author = r.author;
            if (!existing.url && r.url) existing.url = r.url;
            if (r.url && r.url.includes('/dp/') && !existing.url?.includes('/dp/')) existing.url = r.url;
          } else {
            const podcasts = new Map<string, string>();
            podcasts.set(row.slug, row.podcast_name);
            bookMap.set(key, {
              name: r.name,
              author: r.author || null,
              description: r.description || "",
              url: r.url || "",
              context: r.context ? [r.context] : [],
              podcasts,
              episodes: [{ podcastSlug: row.slug, episodeSlug: row.episode_slug, episodeTitle: row.episode_title }],
              mentionCount: 1,
            });
          }
        }
      }

      const { rows: enrichments } = await pool.query("SELECT * FROM book_enrichments");
      const enrichMap = new Map(enrichments.map((e: any) => [e.book_key, e]));

      const books = Array.from(bookMap.values())
        .map(b => {
          const key = b.name.toLowerCase().trim();
          const enrichment = enrichMap.get(key) as any;
          const enrichedAsin = enrichment?.asin || null;
          const originalAsin = extractAsinFromUrl(b.url);
          const finalAsin = enrichedAsin || originalAsin;
          const amazonUrl = finalAsin
            ? `https://www.amazon.com/dp/${finalAsin}?tag=podcap-20`
            : enrichment?.amazon_url || b.url || `https://www.amazon.com/s?k=${encodeURIComponent(`${b.name}${b.author ? ` ${b.author}` : ""}`)}&tag=podcap-20`;

          return {
            name: b.name,
            author: enrichment?.author || b.author,
            description: enrichment?.description || b.description,
            podcastBuzz: enrichment?.podcast_buzz || null,
            amazonUrl,
            asin: finalAsin,
            slug: enrichment?.slug || null,
            googleBooksId: enrichment?.google_books_id || null,
            topics: enrichment?.topics || [],
            pageCount: enrichment?.page_count || null,
            publishYear: enrichment?.publish_year || null,
            rating: enrichment?.rating ? parseFloat(enrichment.rating) : null,
            ratingCount: enrichment?.rating_count || null,
            podcastCount: b.podcasts.size,
            podcastNames: Array.from(b.podcasts.values()),
            mentionCount: b.mentionCount,
          };
        })
        .sort((a, b) => b.mentionCount - a.mentionCount || b.podcastCount - a.podcastCount);

      const result = { books, total: books.length };
      directoryCache.bookstore.set(result);
      res.json(result);
    } catch (err) {
      console.error("Bookstore error:", err);
      res.status(500).json({ message: "Failed to load bookstore" });
    }
  });

  app.get("/api/bookstore/:bookSlug", async (req, res) => {
    try {
      const { bookSlug } = req.params;

      const { rows: enrichRows } = await pool.query(
        "SELECT * FROM book_enrichments WHERE slug = $1",
        [bookSlug]
      );
      if (enrichRows.length === 0) {
        return res.status(404).json({ message: "Book not found" });
      }
      const enrichment = enrichRows[0];
      const bookKey = enrichment.book_key;

      const { rows } = await pool.query(
        `SELECT lpr.slug, lpr.episode_slug, lpr.episode_title, lpr.resources,
                lpr.publish_date, lpr.hosts, lpr.guests,
                pd.name as podcast_name
         FROM landing_page_recaps lpr
         JOIN podcast_directory pd ON pd.slug = lpr.slug
         WHERE lpr.resources IS NOT NULL AND lpr.resources::text != '[]'
           AND lpr.resources::text ILIKE $1`,
        [`%${bookKey.replace(/[%_]/g, '\\$&')}%`]
      );

      const episodes: {
        podcastSlug: string;
        podcastName: string;
        episodeSlug: string;
        episodeTitle: string;
        context: string;
        publishedAt: string | null;
        hosts: string | null;
        guests: string | null;
        recommendedBy: string | null;
        recommenderRole: "host" | "guest" | "author" | null;
      }[] = [];
      const podcastSet = new Map<string, string>();
      const relatedBookCounts = new Map<string, number>();
      const hostMentionCounts = new Map<string, number>();
      const bookAuthor = enrichment.author?.toLowerCase().trim() || "";

      function normalizeForMatch(name: string): string {
        return name.toLowerCase().replace(/[^a-z\s]/g, '').trim();
      }

      function namesMatch(a: string, b: string): boolean {
        const na = normalizeForMatch(a);
        const nb = normalizeForMatch(b);
        if (!na || !nb) return false;
        if (na === nb) return true;
        const partsA = na.split(/\s+/);
        const partsB = nb.split(/\s+/);
        if (partsA.length >= 2 && partsB.length >= 2) {
          return partsA[partsA.length - 1] === partsB[partsB.length - 1] &&
            partsA[0] === partsB[0];
        }
        return false;
      }

      for (const row of rows) {
        let resources: any[];
        try {
          const parsed = typeof row.resources === 'string' ? JSON.parse(row.resources) : row.resources;
          if (!Array.isArray(parsed)) continue;
          resources = parsed;
        } catch { continue; }

        let foundInEpisode = false;
        let bookContext = "";
        const otherBooks: string[] = [];

        for (const r of resources) {
          if (!r || r.type !== 'book' || !r.name) continue;
          const rKey = r.name.toLowerCase().trim();
          if (rKey === bookKey) {
            foundInEpisode = true;
            bookContext = r.context || "";
          } else if (r.name !== '_books_checked') {
            otherBooks.push(rKey);
          }
        }

        if (foundInEpisode) {
          const rawHosts = row.hosts && row.hosts !== '[]' && row.hosts !== 'null' ? row.hosts : '';
          const rawGuests = row.guests && row.guests !== '[]' && row.guests !== 'null' ? row.guests : '';
          const hostNames = rawHosts ? rawHosts.split(/[,&]/).map((h: string) => h.trim()).filter((h: string) => h && h.length > 1 && !/^\[|^\]/.test(h)) : [];
          const guestNames = rawGuests ? rawGuests.split(/[,&]/).map((g: string) => g.trim()).filter((g: string) => g && g.length > 1 && !/^\[|^\]/.test(g)) : [];

          let recommendedBy: string | null = null;
          let recommenderRole: "host" | "guest" | "author" | null = null;

          if (bookAuthor && guestNames.some((g: string) => namesMatch(g, bookAuthor))) {
            recommendedBy = guestNames.find((g: string) => namesMatch(g, bookAuthor)) || bookAuthor;
            recommenderRole = "author";
          } else if (bookAuthor && bookContext) {
            const ctxLower = bookContext.toLowerCase();
            const authorFirst = normalizeForMatch(bookAuthor).split(/\s+/)[0];
            if (authorFirst && ctxLower.includes(authorFirst) && (
              ctxLower.includes("discusses") || ctxLower.includes("his book") || ctxLower.includes("her book") ||
              ctxLower.includes("their book") || ctxLower.includes("the author")
            )) {
              recommendedBy = enrichment.author || bookAuthor;
              recommenderRole = "author";
            }
          }

          if (!recommendedBy && bookContext) {
            const ctxLower = bookContext.toLowerCase();
            for (const g of guestNames) {
              const firstName = normalizeForMatch(g).split(/\s+/)[0];
              if (firstName && firstName.length > 1 && ctxLower.includes(firstName)) {
                recommendedBy = g;
                recommenderRole = "guest";
                break;
              }
            }
            if (!recommendedBy) {
              for (const h of hostNames) {
                const firstName = normalizeForMatch(h).split(/\s+/)[0];
                if (firstName && firstName.length > 1 && ctxLower.includes(firstName)) {
                  recommendedBy = h;
                  recommenderRole = "host";
                  break;
                }
              }
            }
          }

          if (!recommendedBy && hostNames.length > 0) {
            recommendedBy = hostNames[0];
            recommenderRole = "host";
          }

          episodes.push({
            podcastSlug: row.slug,
            podcastName: row.podcast_name,
            episodeSlug: row.episode_slug,
            episodeTitle: row.episode_title,
            context: bookContext,
            publishedAt: row.publish_date,
            hosts: row.hosts,
            guests: row.guests || null,
            recommendedBy,
            recommenderRole,
          });
          podcastSet.set(row.slug, row.podcast_name);
          otherBooks.forEach(k => relatedBookCounts.set(k, (relatedBookCounts.get(k) || 0) + 1));

          for (const h of hostNames) {
            hostMentionCounts.set(h, (hostMentionCounts.get(h) || 0) + 1);
          }
        }
      }

      episodes.sort((a, b) => {
        if (a.publishedAt && b.publishedAt) return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        return 0;
      });

      const firstMentioned = episodes.length > 0 ? episodes[episodes.length - 1].publishedAt : null;
      const lastMentioned = episodes.length > 0 ? episodes[0].publishedAt : null;

      const topHosts = Array.from(hostMentionCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      const podcastDiversity = podcastSet.size;
      const mentionTotal = episodes.length;
      const repeatHosts = topHosts.filter(h => h.count >= 2).length;
      const rawScore = Math.min(10, (
        Math.min(mentionTotal, 20) / 20 * 4 +
        Math.min(podcastDiversity, 10) / 10 * 3.5 +
        Math.min(repeatHosts, 3) / 3 * 2.5
      ));
      const podcastScore = mentionTotal >= 2 ? Math.round(rawScore * 10) / 10 : null;

      let relatedBooks: { name: string; author: string | null; slug: string; mentionCount: number; asin: string | null; googleBooksId: string | null; topics: string[] }[] = [];
      if (relatedBookCounts.size > 0) {
        const sortedRelKeys = Array.from(relatedBookCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 30)
          .map(([k]) => k);
        const placeholders = sortedRelKeys.map((_, i) => `$${i + 1}`).join(",");
        const { rows: relRows } = await pool.query(
          `SELECT book_key, book_title, author, slug, asin, topics, google_books_id FROM book_enrichments WHERE book_key IN (${placeholders})`,
          sortedRelKeys
        );
        const relMap = new Map(relRows.map((r: any) => [r.book_key, r]));

        for (const rk of sortedRelKeys) {
          const rel = relMap.get(rk);
          if (rel && rel.slug) {
            const existing = relatedBooks.find(b => b.slug === rel.slug);
            if (!existing) {
              relatedBooks.push({
                name: rel.book_title,
                author: rel.author,
                slug: rel.slug,
                mentionCount: relatedBookCounts.get(rk) || 1,
                asin: rel.asin,
                googleBooksId: rel.google_books_id || null,
                topics: rel.topics || [],
              });
            }
          }
        }
        relatedBooks = relatedBooks.slice(0, 8);
      }

      const finalAsin = enrichment.asin || null;
      const amazonUrl = finalAsin
        ? `https://www.amazon.com/dp/${finalAsin}?tag=podcap-20`
        : `https://www.amazon.com/s?k=${encodeURIComponent(`${enrichment.book_title}${enrichment.author ? ` ${enrichment.author}` : ""}`)}&tag=podcap-20`;

      const audibleUrl = `https://www.audible.com/search?keywords=${encodeURIComponent(`${enrichment.book_title}${enrichment.author ? ` ${enrichment.author}` : ""}`)}&tag=podcap0b-20`;

      let blinkistUrl: string | null = null;
      try {
        const blinkistSlug = enrichment.book_title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");
        const blinkistCheckUrl = `https://www.blinkist.com/en/books/${blinkistSlug}-en`;
        const blinkistRes = await fetch(blinkistCheckUrl, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(3000) });
        if (blinkistRes.ok) {
          blinkistUrl = blinkistCheckUrl;
        }
      } catch {}

      res.json({
        name: enrichment.book_title,
        author: enrichment.author,
        description: enrichment.description,
        podcastBuzz: enrichment.podcast_buzz,
        slug: enrichment.slug,
        asin: finalAsin,
        googleBooksId: enrichment.google_books_id || null,
        amazonUrl,
        audibleUrl,
        blinkistUrl,
        topics: enrichment.topics || [],
        rating: enrichment.rating ? parseFloat(enrichment.rating) : null,
        ratingCount: enrichment.rating_count || null,
        pageCount: enrichment.page_count || null,
        publishYear: enrichment.publish_year || null,
        podcastScore,
        mentionCount: episodes.length,
        episodeCount: episodes.length,
        podcastCount: podcastSet.size,
        podcastNames: Array.from(podcastSet.values()),
        firstMentioned,
        lastMentioned,
        topHosts,
        episodes,
        relatedBooks,
      });
    } catch (err) {
      console.error("Book detail error:", err);
      res.status(500).json({ message: "Failed to load book" });
    }
  });

  app.get("/api/podcasts/:slug/entity-links", async (req, res) => {
    try {
      const { slug } = req.params;
      const { TOPICS: CURATED_TOPICS_LIST } = await import("../client/src/data/topicData");
      const allRecaps = await storage.getLandingPageRecaps(slug, 200, 0);
      if (!allRecaps.length) return res.json({ companies: [], people: [], topics: [], guests: [] });

      const hostNames = new Set<string>();
      const hostsResult = await pool.query(`SELECT name FROM podcast_hosts WHERE podcast_slug = $1`, [slug]);
      for (const h of hostsResult.rows) {
        if (h.name) h.name.split(/[,&]/).forEach((n: string) => hostNames.add(n.trim().toLowerCase()));
      }
      if (allRecaps[0]?.hosts) {
        allRecaps[0].hosts.split(/[,&]/).forEach((h: string) => hostNames.add(h.trim().toLowerCase()));
      }

      const companyCounts: Record<string, number> = {};
      const peopleCounts: Record<string, number> = {};
      const topicCounts: Record<string, number> = {};

      function countMentions(text: string, terms: string[], ambiguous?: Set<string>): number {
        let total = 0;
        for (const term of terms) {
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const flags = (ambiguous && ambiguous.has(term)) ? 'g' : 'gi';
          const regex = new RegExp(`\\b${escaped}\\b`, flags);
          const matches = text.match(regex);
          if (matches) total += matches.length;
        }
        return total;
      }

      const RECAP_AMBIGUOUS_TERMS_SET = new Set([
        "Notion", "Oracle", "Square", "Chase", "Visa", "Benchmark", "Snowflake",
        "Perplexity", "Bain", "Citadel", "Accel", "Sequoia",
        "The Information", "The Economist",
        "Claude", "Gemini", "Slack", "Discord", "Zoom", "Toast", "Runway",
        "Cursor", "Box", "Circle"
      ]);

      for (const recap of allRecaps) {
        const content = `${recap.tldl || ""} ${recap.whatHappened || ""} ${(recap.keyInsights || []).join(" ")}`;

        for (const company of ENTITY_COMPANIES) {
          const allTerms = [...company.searchTerms, ...(company.associatedTerms || [])];
          if (countMentions(content, allTerms, RECAP_AMBIGUOUS_TERMS_SET) >= 2) {
            companyCounts[company.slug] = (companyCounts[company.slug] || 0) + 1;
          }
        }

        for (const person of ENTITY_PEOPLE) {
          if (person.hostedSlugs.includes(slug)) continue;
          if (person.searchTerms.some(t => hostNames.has(t.toLowerCase()))) continue;
          if (countMentions(content, person.searchTerms) >= 2) {
            peopleCounts[person.slug] = (peopleCounts[person.slug] || 0) + 1;
          }
        }

        if (recap.keyTopics) {
          const topicText = recap.keyTopics.join(" ").toLowerCase();
          for (const curatedTopic of CURATED_TOPICS_LIST) {
            for (const kw of curatedTopic.podcastKeywords) {
              const kwLower = kw.toLowerCase();
              const regex = new RegExp(`\\b${kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
              if (regex.test(topicText)) {
                topicCounts[curatedTopic.slug] = (topicCounts[curatedTopic.slug] || 0) + 1;
                break;
              }
            }
          }
        }
      }

      const topCompanies = Object.entries(companyCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([cSlug, count]) => {
          const c = ENTITY_COMPANIES.find(x => x.slug === cSlug);
          return c ? { slug: c.slug, name: c.name, description: c.description, count } : null;
        })
        .filter(Boolean);

      const topPeople = Object.entries(peopleCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([pSlug, count]) => {
          const p = ENTITY_PEOPLE.find(x => x.slug === pSlug);
          return p ? { slug: p.slug, name: p.name, title: p.title, count } : null;
        })
        .filter(Boolean);

      const topTopics = Object.entries(topicCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([topicSlug, count]) => {
          const t = CURATED_TOPICS_LIST.find((ct: any) => ct.slug === topicSlug);
          return t ? { topic: t.name, slug: t.slug, count } : null;
        })
        .filter(Boolean);

      const recentGuests: Array<{ name: string; title?: string; episodeTitle: string; episodeSlug: string; publishDate: string }> = [];
      const seenGuestNames = new Set<string>();
      for (const recap of allRecaps) {
        if (recentGuests.length >= 10) break;
        if (!recap.guests) continue;
        try {
          const parsed = JSON.parse(recap.guests);
          const guestList = Array.isArray(parsed) ? parsed : [];
          for (const g of guestList) {
            const gName = (g.name || "").trim();
            if (!gName || seenGuestNames.has(gName.toLowerCase())) continue;
            if (hostNames.has(gName.toLowerCase())) continue;
            seenGuestNames.add(gName.toLowerCase());
            recentGuests.push({
              name: gName,
              title: g.title || undefined,
              episodeTitle: recap.episodeTitle,
              episodeSlug: recap.episodeSlug,
              publishDate: recap.publishDate,
            });
            if (recentGuests.length >= 10) break;
          }
        } catch {}
      }

      res.json({ companies: topCompanies, people: topPeople, topics: topTopics, guests: recentGuests });
    } catch (err) {
      console.error("Entity links error:", err);
      res.status(500).json({ error: "Failed to fetch entity links" });
    }
  });

  app.get("/api/podcasts/:slug/recaps/:episodeSlug", async (req, res) => {
    try {
      const recap = await storage.getLandingPageRecapBySlug(req.params.slug, req.params.episodeSlug);
      if (!recap) return res.status(404).json({ error: "Recap not found" });

      const client = await pool.connect();
      let transcriptText = "";
      try {
        const { rows } = await client.query(
          `SELECT et.transcript FROM episode_transcripts et
           JOIN podcast_directory pd ON pd.itunes_id::text = et.podcast_id
           WHERE pd.slug = $1 AND et.episode_title = $2
           LIMIT 1`,
          [req.params.slug, recap.episodeTitle]
        );
        if (rows.length > 0) transcriptText = rows[0].transcript || "";
      } finally { client.release(); }

      let sponsorNames: string[] = [];
      try {
        const sponsors = JSON.parse(recap.sponsors || "[]");
        sponsorNames = sponsors.map((s: any) => (s.name || "").toLowerCase()).filter(Boolean);
      } catch {}

      const mainContent = transcriptText;

      const podcastHosts = await storage.getHostsByPodcastSlug(req.params.slug);
      const hostNameSet = new Set(podcastHosts.map(h => h.name.toLowerCase().trim()));

      function countMentions(text: string, terms: string[], ambiguous?: Set<string>): number {
        let total = 0;
        for (const term of terms) {
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const flags = (ambiguous && ambiguous.has(term)) ? 'g' : 'gi';
          const regex = new RegExp(`\\b${escaped}\\b`, flags);
          const matches = text.match(regex);
          if (matches) total += matches.length;
        }
        return total;
      }

      function extractRawSnippets(text: string, terms: string[], count: number = 3): string[] {
        const snippets: string[] = [];
        for (const term of terms) {
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
          let match;
          while ((match = regex.exec(text)) !== null && snippets.length < count) {
            const start = Math.max(0, match.index - 120);
            const end = Math.min(text.length, match.index + term.length + 120);
            snippets.push(text.slice(start, end).replace(/\n/g, ' ').trim());
          }
          if (snippets.length >= count) break;
        }
        return snippets;
      }

      const matchedPeopleSlugs = ENTITY_PEOPLE.filter(p => {
        const nameLower = p.name.toLowerCase();
        if (hostNameSet.has(nameLower)) return false;
        if (p.searchTerms.some(term => hostNameSet.has(term.toLowerCase()))) return false;
        if (p.hostedSlugs.includes(req.params.slug)) return false;
        return countMentions(mainContent, p.searchTerms) >= 2;
      }).map(p => p.slug);

      const RECAP_AMBIGUOUS_TERMS = new Set([
        "Notion", "Oracle", "Square", "Chase", "Visa", "Benchmark", "Snowflake",
        "Perplexity", "Bain", "Citadel", "Accel", "Sequoia",
        "The Information", "The Economist",
        "Claude", "Gemini", "Slack", "Discord", "Zoom", "Toast", "Runway",
        "Cursor", "Box", "Circle"
      ]);

      const matchedCompanySlugs = ENTITY_COMPANIES.filter(c => {
        if (sponsorNames.includes(c.name.toLowerCase())) return false;
        const allTerms = [...c.searchTerms, ...(c.associatedTerms || [])];
        return countMentions(mainContent, allTerms, RECAP_AMBIGUOUS_TERMS) >= 2;
      }).map(c => c.slug);

      const allMatchedSlugs = [...matchedPeopleSlugs, ...matchedCompanySlugs];
      let entityContexts: Record<string, string> = {};

      if (allMatchedSlugs.length > 0) {
        let cached: Record<string, string> | null = null;
        try {
          if (recap.entity_contexts_cache) {
            const parsed = JSON.parse(recap.entity_contexts_cache);
            const cachedSlugs = Object.keys(parsed).sort().join(',');
            const currentSlugs = allMatchedSlugs.sort().join(',');
            if (cachedSlugs === currentSlugs) {
              cached = parsed;
            }
          }
        } catch {}

        if (cached) {
          entityContexts = cached;
        } else {
          const entityList: { slug: string; name: string; type: string; snippets: string[] }[] = [];
          for (const slug of matchedPeopleSlugs) {
            const person = ENTITY_PEOPLE.find(p => p.slug === slug);
            if (person) {
              entityList.push({ slug, name: person.name, type: "person", snippets: extractRawSnippets(mainContent, person.searchTerms) });
            }
          }
          for (const slug of matchedCompanySlugs) {
            const company = ENTITY_COMPANIES.find(c => c.slug === slug);
            if (company) {
              const allTerms = [...company.searchTerms, ...(company.associatedTerms || [])];
              entityList.push({ slug, name: company.name, type: "company", snippets: extractRawSnippets(mainContent, allTerms) });
            }
          }

          if (entityList.length > 0) {
            try {
              const { openai } = await import("./replit_integrations/image/client");
              const entityDescriptions = entityList.map(e =>
                `- ${e.name} (${e.type}): "${e.snippets.join('" | "')}"`
              ).join('\n');

              const aiResp = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{
                  role: "user",
                  content: `For each person/company below, write ONE sentence describing the specific claim, argument, or story from this episode about them. Do NOT describe who they are or what their company does generically. Write what was said about them in this episode specifically. If you cannot find something specific from the excerpts, write the most specific contextual claim possible.

Since transcripts are not speaker-tagged, do NOT attribute claims to specific hosts or guests by name. Instead use passive or general terms: "was cited," "was highlighted," "was referenced," "was discussed," "was held up as."

Good examples:
- "Mark Zuckerberg was cited as an example of how radically different paths -- dropping out, building in a dorm -- can lead to the same outcome as more conventional routes taken by Gates or Bezos."
- "OpenAI was highlighted as one of the best companies to join as an early employee in 2026, with significant stock option upside for the right roles."
- "Angela Duckworth's research on grit was referenced to argue that perseverance combined with genuine passion outperforms raw talent in predicting long-term success."

Bad examples (too generic, describes who they ARE not what was SAID):
- "Discussed as an example of varied paths to success."
- "Referenced for his unique approach to angel investing."
- "Mentioned for its significance in chip technology."

Podcast: ${recap.podcastName}
Episode: "${recap.episodeTitle}"

Entities with transcript excerpts:
${entityDescriptions}

Respond with JSON: { "slug": "summary sentence", ... }
Use these exact slugs: ${entityList.map(e => e.slug).join(', ')}`
                }],
                max_tokens: 2000,
                temperature: 0.3,
                response_format: { type: "json_object" },
              });

              const content = aiResp.choices[0]?.message?.content;
              if (content) {
                entityContexts = JSON.parse(content);
              }
            } catch (err) {
              console.warn('[EntityContexts] AI generation failed, using fallback:', err);
            }
          }

          if (Object.keys(entityContexts).length > 0) {
            const cacheClient = await pool.connect();
            try {
              await cacheClient.query(
                `UPDATE landing_page_recaps SET entity_contexts_cache = $1 WHERE id = $2`,
                [JSON.stringify(entityContexts), recap.id]
              );
            } finally { cacheClient.release(); }
          }
        }
      }

      const { entity_contexts_cache: _ecc, ...recapWithoutCache } = recap;
      res.json({ ...recapWithoutCache, matchedPeopleSlugs, matchedCompanySlugs, entityContexts });
    } catch {
      res.status(500).json({ error: "Failed to fetch recap" });
    }
  });

  app.get("/api/topics/:slug/episodes", async (req, res) => {
    try {
      const { slug } = req.params;

      const topicKeywordsMap: Record<string, { primary: string[]; secondary: string[]; minScore: number }> = {
        "ai": {
          primary: ["artificial intelligence", "machine learning", "deep learning", "neural network", "large language model"],
          secondary: ["GPT", "LLM", "ChatGPT", "OpenAI", "Anthropic", "Claude", "AI agent", "AI model", "generative AI", "computer vision", "natural language processing"],
          minScore: 4,
        },
        "entrepreneurship": {
          primary: ["entrepreneurship", "entrepreneur", "founded", "co-founded"],
          secondary: ["founder", "startup", "bootstrap", "bootstrapped", "side hustle", "building a business"],
          minScore: 3,
        },
        "startups": {
          primary: ["startup", "startups", "product-market fit", "seed round", "series A"],
          secondary: ["early-stage", "pivot", "launch", "incubator", "accelerator", "Y Combinator"],
          minScore: 3,
        },
        "venture-capital": {
          primary: ["venture capital", "venture capitalist", "VC firm", "fundraising round"],
          secondary: ["VC", "series A", "series B", "seed funding", "term sheet", "cap table", "valuation"],
          minScore: 3,
        },
        "investing": {
          primary: ["investing", "investment strategy", "stock market", "portfolio management"],
          secondary: ["stocks", "bonds", "ETF", "hedge fund", "asset allocation", "returns", "bull market", "bear market"],
          minScore: 3,
        },
        "personal-finance": {
          primary: ["personal finance", "financial independence", "wealth building", "financial planning"],
          secondary: ["budgeting", "saving", "retirement", "debt", "credit score", "net worth", "FIRE"],
          minScore: 3,
        },
        "leadership": {
          primary: ["leadership", "leading teams", "executive leadership"],
          secondary: ["CEO", "executive", "leader", "vision", "organizational culture", "servant leadership", "management"],
          minScore: 3,
        },
        "marketing": {
          primary: ["marketing strategy", "digital marketing", "brand strategy"],
          secondary: ["marketing", "brand", "growth hacking", "advertising", "SEO", "content marketing", "social media marketing"],
          minScore: 3,
        },
        "sales": {
          primary: ["sales strategy", "sales process", "selling"],
          secondary: ["sales", "revenue", "pipeline", "cold calling", "B2B sales", "closing deals"],
          minScore: 3,
        },
        "productivity": {
          primary: ["productivity", "time management", "deep work"],
          secondary: ["habits", "routines", "efficiency", "focus", "workflow", "GTD"],
          minScore: 3,
        },
        "decision-making": {
          primary: ["decision making", "decision-making", "mental model"],
          secondary: ["cognitive bias", "heuristic", "judgment", "rational thinking", "first principles"],
          minScore: 3,
        },
        "technology": {
          primary: ["technology", "software engineering", "tech industry"],
          secondary: ["software", "engineering", "computing", "cloud", "infrastructure", "developer"],
          minScore: 3,
        },
        "economics": {
          primary: ["economics", "economic policy", "macroeconomics"],
          secondary: ["economy", "monetary policy", "inflation", "recession", "GDP", "Federal Reserve", "fiscal policy"],
          minScore: 3,
        },
        "future-of-work": {
          primary: ["future of work", "remote work", "workplace transformation"],
          secondary: ["gig economy", "hybrid work", "automation replacing", "freelance", "work from home"],
          minScore: 3,
        },
        "health-longevity": {
          primary: ["longevity", "healthspan", "lifespan"],
          secondary: ["nutrition", "fitness", "sleep", "wellness", "anti-aging", "biohacking", "metabolic health"],
          minScore: 3,
        },
        "psychology": {
          primary: ["psychology", "psychological", "neuroscience"],
          secondary: ["behavior", "mental health", "cognitive", "therapy", "emotional intelligence", "trauma"],
          minScore: 3,
        },
        "peak-performance": {
          primary: ["peak performance", "high performance"],
          secondary: ["biohacking", "optimize", "performance", "elite athlete", "mental toughness"],
          minScore: 3,
        },
        "self-improvement": {
          primary: ["self-improvement", "personal development", "personal growth"],
          secondary: ["mindset", "motivation", "discipline", "self-help", "life coaching", "transformation"],
          minScore: 3,
        },
        "negotiation": {
          primary: ["negotiation", "negotiating", "negotiator"],
          secondary: ["persuasion", "influence", "conflict resolution", "bargaining", "deal-making"],
          minScore: 3,
        },
        "career-growth": {
          primary: ["career growth", "career development", "professional development"],
          secondary: ["career", "promotion", "job search", "networking", "mentorship", "career change"],
          minScore: 3,
        },
        "creativity": {
          primary: ["creativity", "creative process", "creative thinking"],
          secondary: ["creative", "design", "storytelling", "artistic", "imagination", "inspiration"],
          minScore: 3,
        },
        "media-content": {
          primary: ["media industry", "content creation", "journalism"],
          secondary: ["media", "streaming", "podcast", "newsletter", "content strategy"],
          minScore: 3,
        },
        "geopolitics": {
          primary: ["geopolitics", "geopolitical", "foreign policy", "international relations"],
          secondary: ["diplomacy", "international", "sanctions", "trade war", "national security"],
          minScore: 3,
        },
        "creator-economy": {
          primary: ["creator economy", "content creator", "creator"],
          secondary: ["influencer", "newsletter", "monetize", "audience building", "personal brand", "YouTube", "TikTok"],
          minScore: 3,
        },
        "saas": {
          primary: ["saas", "software as a service", "recurring revenue"],
          secondary: ["churn", "ARR", "MRR", "subscription", "B2B software", "cloud software"],
          minScore: 3,
        },
        "open-source": {
          primary: ["open source", "open-source", "free software"],
          secondary: ["GitHub", "Linux", "open model", "open weights", "community-driven"],
          minScore: 3,
        },
        "product-management": {
          primary: ["product management", "product manager", "product strategy"],
          secondary: ["roadmap", "user research", "product-led", "feature prioritization", "product team"],
          minScore: 3,
        },
        "product-market-fit": {
          primary: ["product-market fit", "product market fit", "PMF"],
          secondary: ["market validation", "customer discovery", "pivoting", "finding fit", "demand validation"],
          minScore: 3,
        },
        "automation": {
          primary: ["automation", "workflow automation", "process automation"],
          secondary: ["automate", "automated", "RPA", "no-code", "low-code", "Zapier"],
          minScore: 3,
        },
        "robotics": {
          primary: ["robotics", "robot", "autonomous vehicle"],
          secondary: ["humanoid", "drone", "manufacturing automation", "self-driving", "autonomous"],
          minScore: 3,
        },
        "crypto-web3": {
          primary: ["cryptocurrency", "bitcoin", "blockchain", "web3"],
          secondary: ["crypto", "ethereum", "DeFi", "NFT", "token", "decentralized", "smart contract"],
          minScore: 3,
        },
        "climate-energy": {
          primary: ["climate change", "clean energy", "renewable energy"],
          secondary: ["climate", "solar", "nuclear", "carbon", "sustainability", "electric vehicle", "EV", "energy transition"],
          minScore: 3,
        },
        "defense-tech": {
          primary: ["defense tech", "defense technology", "military technology"],
          secondary: ["defense", "military", "cybersecurity", "national security", "pentagon", "aerospace", "Anduril", "Palantir"],
          minScore: 3,
        },
        "women-in-business": {
          primary: ["women in business", "female founder", "women entrepreneurs"],
          secondary: ["women in tech", "female CEO", "women investors", "gender gap", "women leadership"],
          minScore: 3,
        },
        "young-entrepreneurs": {
          primary: ["young entrepreneur", "teenage founder", "young founder"],
          secondary: ["Gen Z", "college dropout", "young CEO", "millennial founder", "student entrepreneur"],
          minScore: 3,
        },
        "bootstrapping": {
          primary: ["bootstrapping", "bootstrapped", "self-funded"],
          secondary: ["bootstrap", "profitable", "no funding", "indie hacker", "revenue-funded"],
          minScore: 3,
        },
        "side-hustles": {
          primary: ["side hustle", "side project", "passive income"],
          secondary: ["freelance", "extra income", "hustle", "side business", "moonlighting"],
          minScore: 3,
        },
      };

      const topicConfig = topicKeywordsMap[slug];

      const { pool: dbPool } = await import("./db");
      const client = await dbPool.connect();
      try {
        if (topicConfig) {
          const { primary, secondary, minScore } = topicConfig;
          const allKeywords = [...primary, ...secondary];

          const conditions = allKeywords.map((_, i) => {
            const p = `$${i + 1}`;
            return `(episode_title ILIKE ${p} OR what_happened ILIKE ${p} OR tldl ILIKE ${p} OR key_insights::text ILIKE ${p})`;
          }).join(" OR ");
          const params = allKeywords.map(k => `%${k}%`);
          const { rows } = await client.query(
            `SELECT slug, episode_slug, podcast_name, episode_title, publish_date, artwork_url, tldl, what_happened, key_insights, key_topics, guests
             FROM landing_page_recaps
             WHERE ${conditions}
             ORDER BY publish_date DESC
             LIMIT 100`,
            params
          );

          function scoreEpisode(ep: any): number {
            let score = 0;
            const title = (ep.episode_title || "").toLowerCase();
            const body = `${ep.what_happened || ""} ${ep.tldl || ""} ${ep.key_insights || ""}`.toLowerCase();

            for (const kw of primary) {
              const kwLower = kw.toLowerCase();
              if (title.includes(kwLower)) score += 5;
              const bodyMatches = body.split(kwLower).length - 1;
              score += Math.min(bodyMatches, 5) * 2;
            }

            for (const kw of secondary) {
              const kwLower = kw.toLowerCase();
              if (kw.length <= 3) {
                const regex = new RegExp(`\\b${kw}\\b`, "gi");
                if (regex.test(title)) score += 3;
                const bodyHits = (body.match(new RegExp(`\\b${kw.toLowerCase()}\\b`, "gi")) || []).length;
                score += Math.min(bodyHits, 4);
              } else {
                if (title.includes(kwLower)) score += 3;
                const bodyMatches = body.split(kwLower).length - 1;
                score += Math.min(bodyMatches, 4);
              }
            }

            return score;
          }

          const scored = rows
            .map(ep => ({ ...ep, _score: scoreEpisode(ep) }))
            .filter(ep => ep._score >= minScore)
            .sort((a, b) => b._score - a._score || new Date(b.publish_date).getTime() - new Date(a.publish_date).getTime())
            .slice(0, 8)
            .map(({ _score, ...ep }) => ep);

          res.json(scored);
        } else {
          const { rows } = await client.query(
            `SELECT slug, episode_slug, podcast_name, episode_title, publish_date, artwork_url, tldl, what_happened, key_insights, key_topics, guests
             FROM landing_page_recaps
             WHERE EXISTS (
               SELECT 1 FROM unnest(key_topics) AS t(topic)
               WHERE TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(REGEXP_REPLACE(t.topic, '[^a-zA-Z0-9]+', '-', 'g')), '-+', '-', 'g')) = $1
             )
             ORDER BY publish_date DESC
             LIMIT 20`,
            [slug]
          );
          res.json(rows);
        }
      } finally {
        client.release();
      }
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch topic episodes" });
    }
  });

  app.get("/api/topics/:slug/books", async (req, res) => {
    try {
      const { slug } = req.params;
      const topicMapping: Record<string, string[]> = {
        "ai": ["AI & Technology"],
        "business": ["Business & Strategy"],
        "entrepreneurship": ["entrepreneurship", "Business & Strategy"],
        "startups": ["Business & Strategy", "entrepreneurship"],
        "venture-capital": ["Investing & Finance"],
        "investing": ["Investing & Finance"],
        "personal-finance": ["Investing & Finance"],
        "leadership": ["Leadership & Management"],
        "marketing": ["Business & Strategy"],
        "sales": ["Business & Strategy"],
        "productivity": ["Self-Improvement"],
        "self-improvement": ["Self-Improvement"],
        "psychology": ["Psychology & Mindset"],
        "health-longevity": ["Health & Wellness"],
        "creativity": ["Creativity & Writing"],
        "technology": ["AI & Technology"],
        "economics": ["Business & Strategy"],
        "geopolitics": ["History & Society"],
        "climate-energy": ["Science"],
        "education": ["Education"],
      };
      const searchTopics = topicMapping[slug] || [slug];
      const result = await pool.query(
        `SELECT book_title, author, slug, google_books_id FROM book_enrichments WHERE topics && $1::text[] ORDER BY rating DESC NULLS LAST, rating_count DESC NULLS LAST LIMIT 8`,
        [searchTopics]
      );
      const books = result.rows.map((row: any) => {
        let coverUrl = "/placeholder-book.jpg";
        if (row.google_books_id) {
          coverUrl = `https://books.google.com/books/content?id=${row.google_books_id}&printsec=frontcover&img=1&zoom=1`;
        }
        return {
          title: row.book_title,
          author: row.author,
          slug: row.slug,
          coverUrl,
        };
      });
      res.json(books);
    } catch (err: any) {
      console.error("[Topics Books] Error:", err);
      res.json([]);
    }
  });

  app.get("/api/podcasts/:slug/:episodeSlug/quotes", async (req, res) => {
    try {
      const { slug, episodeSlug } = req.params;
      const quotes = await storage.getEpisodeQuotes(slug, episodeSlug);
      res.json({ quotes });
    } catch (err) {
      console.error("[Quotes] Error:", err);
      res.status(500).json({ error: "Failed to fetch quotes" });
    }
  });

  app.post("/api/podcasts/:slug/:episodeSlug/quotes/generate", async (req, res) => {
    try {
      const { slug, episodeSlug } = req.params;
      const { password } = req.body;
      if (password !== "tatango123") {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const recap = await storage.getLandingPageRecapBySlug(slug, episodeSlug);
      if (!recap) return res.status(404).json({ error: "Recap not found" });

      const client = await pool.connect();
      let transcriptText = "";
      try {
        const { rows } = await client.query(
          `SELECT et.transcript FROM episode_transcripts et
           JOIN podcast_directory pd ON pd.itunes_id::text = et.podcast_id
           WHERE pd.slug = $1 AND et.episode_title = $2
           LIMIT 1`,
          [slug, recap.episodeTitle]
        );
        if (rows.length > 0) transcriptText = rows[0].transcript || "";
      } finally { client.release(); }

      if (!transcriptText) {
        return res.status(404).json({ error: "Transcript not available for this episode" });
      }

      const { extractQuotesFromTranscript } = await import("./recapGenerator");
      const extractedQuotes = await extractQuotesFromTranscript(
        transcriptText,
        recap.podcastName,
        recap.episodeTitle,
        recap.hosts,
        recap.guests,
      );

      if (extractedQuotes.length === 0) {
        return res.json({ quotes: [], message: "No notable quotes found" });
      }

      await storage.deleteEpisodeQuotes(slug, episodeSlug);

      const quotesToSave = extractedQuotes.map((q, i) => ({
        podcastSlug: slug,
        episodeSlug: episodeSlug,
        speakerName: q.speakerName,
        speakerRole: q.speakerRole || null,
        quoteText: q.quoteText,
        context: q.context,
        quoteType: q.quoteType,
      }));

      const saved = await storage.saveEpisodeQuotes(quotesToSave);
      res.json({ quotes: saved, message: `Extracted ${saved.length} quotes` });
    } catch (err) {
      console.error("[QuoteGenerate] Error:", err);
      res.status(500).json({ error: "Failed to generate quotes" });
    }
  });

  app.get("/api/podcasts/:slug/:episodeSlug/guests", async (req, res) => {
    try {
      const { slug, episodeSlug } = req.params;
      const recap = await storage.getLandingPageRecapBySlug(slug, episodeSlug);
      if (!recap) return res.status(404).json({ error: "Recap not found" });

      if (recap.guests) {
        try {
          return res.json({ guests: JSON.parse(recap.guests) });
        } catch {
          return res.json({ guests: [] });
        }
      }

      return res.json({ guests: [] });
    } catch (err) {
      console.error("[Guests] Error:", err);
      res.status(500).json({ error: "Failed to extract guests" });
    }
  });

  app.get("/api/podcasts/:slug/example-recap", async (req, res) => {
    try {
      const recap = await storage.getExampleRecap(req.params.slug);
      if (!recap) return res.status(404).json({ error: "No example recap found" });
      res.json(recap);
    } catch {
      res.status(500).json({ error: "Failed to fetch example recap" });
    }
  });

  app.get("/api/leaderboard", async (_req, res) => {
    try {
      const topPodcasts = await storage.getTopPodcasts(50);

      const ids = topPodcasts.map((p) => p.id).join(",");
      let itunesData: Record<string, any> = {};
      try {
        const itunesRes = await fetch(`https://itunes.apple.com/lookup?id=${ids}`);
        const itunesJson = await itunesRes.json() as any;
        for (const r of itunesJson.results || []) {
          itunesData[String(r.trackId || r.collectionId)] = {
            artist: r.artistName || "",
            genres: (r.genres || []).filter((g: string) => g !== "Podcasts"),
            episodeCount: r.trackCount || 0,
            artworkUrl600: (r.artworkUrl600 || "").replace(/\d+x\d+bb/, "1200x1200bb"),
          };
        }
      } catch (e) {
        console.warn("iTunes lookup failed (non-fatal):", e);
      }

      const enriched = topPodcasts.map((p) => {
        const itunes = itunesData[p.id];
        return {
          ...p,
          artworkUrl: itunes?.artworkUrl600 || p.artworkUrl,
          artist: itunes?.artist || "",
          genres: itunes?.genres || [],
          episodeCount: itunes?.episodeCount || 0,
        };
      });

      res.json(enriched);
    } catch (err) {
      console.error("Leaderboard error:", err);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  app.get("/api/podcasts-discovery", async (req, res) => {
    try {
      const cached = directoryCache.podcastsDiscovery.get();
      if (cached) return res.json(cached);

      const client = await pool.connect();
      try {
        const recentResult = await client.query(`
          SELECT slug, episode_slug, episode_title, podcast_name, publish_date, artwork_url, tldl, hosts, created_at
          FROM landing_page_recaps
          WHERE publish_date IS NOT NULL
          ORDER BY publish_date DESC, created_at DESC
          LIMIT 20
        `);

        const statsResult = await client.query(`
          SELECT lpr.slug, lpr.podcast_name,
            COUNT(*) as episode_count,
            MAX(lpr.publish_date) as latest_episode,
            MIN(lpr.publish_date) as first_episode,
            COALESCE(pd.total_episodes, 0)::int as total_episodes
          FROM landing_page_recaps lpr
          LEFT JOIN podcast_directory pd ON pd.slug = lpr.slug
          WHERE lpr.publish_date IS NOT NULL
          GROUP BY lpr.slug, lpr.podcast_name, pd.total_episodes
          ORDER BY MAX(lpr.publish_date) DESC
        `);

        const result = {
          recentEpisodes: recentResult.rows.map(r => ({
            slug: r.slug,
            episodeSlug: r.episode_slug,
            episodeTitle: r.episode_title,
            podcastName: r.podcast_name,
            publishDate: r.publish_date,
            artworkUrl: r.artwork_url,
            tldl: r.tldl,
            hosts: r.hosts,
          })),
          podcastStats: statsResult.rows.map(r => ({
            slug: r.slug,
            podcastName: r.podcast_name,
            episodeCount: r.total_episodes > 0 ? r.total_episodes : parseInt(r.episode_count),
            latestEpisode: r.latest_episode,
            firstEpisode: r.first_episode,
          })),
        };
        directoryCache.podcastsDiscovery.set(result);
        res.json(result);
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Podcasts discovery error:", err);
      res.status(500).json({ message: "Failed to fetch discovery data" });
    }
  });

  app.get("/api/recaps", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const recaps = await storage.getRecapsByUserId(req.session.userId);
    res.json(recaps);
  });

  app.post("/api/recaps/generate", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUserById(req.session.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!user.podcasts || user.podcasts.length === 0) {
      return res.status(400).json({ message: "No podcasts selected. Add podcasts in Settings first." });
    }

    try {
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      const todayLabel = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

      const result = await generateRecap(user, today, today, todayLabel, todayStr, "latest");
      if (!result) {
        return res.status(400).json({ message: "Could not find any recent episodes for your podcasts. Try again later!" });
      }

      const { summary, dateStr: recapDateStr, recappedPodcasts } = result;

      const recap = await storage.createRecap({
        userId: user.id,
        recapDate: recapDateStr,
        podcasts: recappedPodcasts,
        summary,
      });

      res.json(recap);
    } catch (err) {
      console.error("Recap generation error:", err);
      res.status(500).json({ message: "Failed to generate recap. Please try again." });
    }
  });

  app.post("/api/recaps/send-email", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUserById(req.session.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const parsed = z.object({ recapId: z.coerce.number().int().positive() }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Missing or invalid recapId" });
    }
    const { recapId } = parsed.data;

    try {
      const recaps = await storage.getRecapsByUserId(user.id);
      const recap = recaps.find((r) => r.id === recapId);
      if (!recap) {
        return res.status(404).json({ message: "Recap not found" });
      }

      const templateSettings = await storage.getEmailTemplateSettings();

      if (!recapHasContent(recap.summary)) {
        return res.status(400).json({ message: "This recap has no parseable episode content. It cannot be sent." });
      }

      const emailHtml = markdownToEmailHtml(recap.summary, user.email, templateSettings);
      const { client, fromEmail } = await getUncachableResendClient();

      const result = await client.emails.send({
        from: `PodCap Daily <${fromEmail}>`,
        to: user.email,
        subject: `☕ Your PodCap Daily Recap - ${new Date(recap.recapDate).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`,
        html: emailHtml,
      });

      if (result.error) {
        console.error("Resend API error:", JSON.stringify(result.error));
        return res.status(500).json({ message: `Email failed: ${result.error.message || "Unknown error"}` });
      }

      console.log("Resend email sent, id:", result.data?.id);

      await storage.logEmail({
        userId: user.id,
        recipientEmail: user.email,
        podcasts: recap.podcasts,
        source: "manual",
        emailHtml,
      });

      res.json({ message: "Email sent successfully" });
    } catch (err: any) {
      console.error("Send email error:", err?.message || err);
      res.status(500).json({ message: "Failed to send email. Please try again." });
    }
  });

  const adminLoginAttempts = new Map<string, { count: number; resetAt: number }>();

  app.post("/api/admin/login", async (req, res) => {
    const ip = req.ip || "unknown";
    const now = Date.now();
    const attempt = adminLoginAttempts.get(ip);
    if (attempt && attempt.count >= 5 && now < attempt.resetAt) {
      return res.status(429).json({ message: "Too many attempts. Try again later." });
    }
    if (!attempt || now >= (attempt?.resetAt ?? 0)) {
      adminLoginAttempts.set(ip, { count: 0, resetAt: now + 15 * 60 * 1000 });
    }

    const parsed = z.object({ password: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Password is required" });
    }

    const { db } = await import("./db");
    const { eq } = await import("drizzle-orm");
    const { adminSettings } = await import("@shared/schema");
    const bcrypt = await import("bcryptjs");

    let isValid = false;
    try {
      const dbPw = await db.select().from(adminSettings).where(eq(adminSettings.key, "admin_password_hash")).limit(1);
      if (dbPw.length > 0) {
        isValid = await bcrypt.compare(parsed.data.password, dbPw[0].value);
      } else {
        isValid = parsed.data.password === process.env.ADMIN_PASSWORD;
      }
    } catch {
      isValid = parsed.data.password === process.env.ADMIN_PASSWORD;
    }

    if (!isValid) {
      const entry = adminLoginAttempts.get(ip)!;
      entry.count++;
      return res.status(401).json({ message: "Invalid admin password" });
    }

    adminLoginAttempts.delete(ip);
    req.session.isAdmin = true;
    res.json({ message: "Admin authenticated" });
  });

  app.post("/api/admin/change-password", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const parsed = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6, "New password must be at least 6 characters"),
    }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
    }

    const { db } = await import("./db");
    const { eq } = await import("drizzle-orm");
    const { adminSettings } = await import("@shared/schema");
    const bcrypt = await import("bcryptjs");

    let isCurrentValid = false;
    try {
      const dbPw = await db.select().from(adminSettings).where(eq(adminSettings.key, "admin_password_hash")).limit(1);
      if (dbPw.length > 0) {
        isCurrentValid = await bcrypt.compare(parsed.data.currentPassword, dbPw[0].value);
      } else {
        isCurrentValid = parsed.data.currentPassword === process.env.ADMIN_PASSWORD;
      }
    } catch {
      isCurrentValid = parsed.data.currentPassword === process.env.ADMIN_PASSWORD;
    }

    if (!isCurrentValid) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const hashedPassword = await bcrypt.hash(parsed.data.newPassword, 12);
    await db.insert(adminSettings).values({
      key: "admin_password_hash",
      value: hashedPassword,
    }).onConflictDoUpdate({
      target: adminSettings.key,
      set: { value: hashedPassword, updatedAt: new Date() },
    });

    res.json({ message: "Password updated successfully" });
  });

  app.get("/api/admin/me", (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    res.json({ isAdmin: true });
  });

  app.post("/api/admin/logout", (req, res) => {
    req.session.isAdmin = false;
    res.json({ message: "Admin logged out" });
  });

  app.post("/api/admin/refresh-caches", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const targets = req.body.targets as string[] | undefined;
    const toRefresh = targets && targets.length > 0
      ? targets
      : Object.keys(directoryCache) as (keyof typeof directoryCache)[];

    for (const key of toRefresh) {
      if (key in directoryCache) {
        directoryCache[key as keyof typeof directoryCache].invalidate();
      }
    }

    const refreshed: string[] = [];
    try {
      if (toRefresh.includes("people")) {
        const data = await computePeopleData();
        directoryCache.people.set(data);
        refreshed.push("people");
      }
      if (toRefresh.includes("companies")) {
        const data = await computeCompaniesData();
        directoryCache.companies.set(data);
        refreshed.push("companies");
      }
      if (toRefresh.includes("topics")) {
        const data = await computeTopicsData();
        directoryCache.topics.set(data);
        refreshed.push("topics");
      }
    } catch (err: any) {
      console.error("[Cache Refresh] Error:", err);
    }

    res.json({
      message: `Invalidated ${toRefresh.length} cache(s). Pre-warmed: ${refreshed.join(", ") || "none"}.`,
      invalidated: toRefresh,
      preWarmed: refreshed,
    });
  });

  app.get("/api/admin/cache-status", (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const status: Record<string, { cached: boolean; ageMinutes: number }> = {};
    for (const [key, cache] of Object.entries(directoryCache)) {
      const age = cache.age();
      status[key] = {
        cached: age >= 0,
        ageMinutes: age >= 0 ? Math.round(age / 60000) : -1,
      };
    }
    res.json(status);
  });

  app.get("/api/admin/users", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const allUsers = await storage.getAllUsers();
    res.json(allUsers);
  });

  app.get("/api/admin/email-logs", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const logs = await storage.getEmailLogs();
    res.json(logs);
  });

  app.get("/api/admin/email-logs/:id/html", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const logId = parseInt(req.params.id);
    const logs = await storage.getEmailLogs();
    const log = logs.find((l) => l.id === logId);
    if (!log) {
      return res.status(404).json({ message: "Email log not found" });
    }
    if (!log.emailHtml) {
      return res.status(404).json({ message: "Email content not available for this log entry" });
    }
    res.json({ html: log.emailHtml });
  });

  app.get("/api/admin/transcript-logs", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const logs = await storage.getTranscriptLogs(300);
    res.json(logs);
  });

  app.get("/api/admin/transcripts/:id", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const id = parseInt(req.params.id);
    const transcript = await storage.getTranscriptById(id);
    if (!transcript) {
      return res.status(404).json({ message: "Transcript not found" });
    }
    res.json({ transcript: transcript.transcript, episodeTitle: transcript.episodeTitle, podcastId: transcript.podcastId });
  });

  app.get("/api/admin/transcripts/by-guid/:episodeGuid", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const { episodeGuid } = req.params;
    const transcript = await storage.getTranscriptByEpisodeGuid(episodeGuid);
    if (!transcript) {
      return res.status(404).json({ message: "Transcript not found for this episode" });
    }
    res.json({ transcript: transcript.transcript, episodeTitle: transcript.episodeTitle, podcastId: transcript.podcastId });
  });

  app.post("/api/admin/resolve-people-images", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { runImagePipeline } = await import("./fetchPeopleImages");
      const { PEOPLE_DIRECTORY: PEOPLE_DIR_ENTRIES } = await import("../client/src/data/entityDirectoryData");
      const peopleWithLinks = ENTITY_PEOPLE.map(p => ({
        slug: p.slug,
        name: p.name,
        socialLinks: PEOPLE_DIR_ENTRIES.find((x: any) => x.slug === p.slug)?.socialLinks,
      }));
      const onlyMissing = req.body?.onlyMissing !== false;
      const result = await runImagePipeline(peopleWithLinks, onlyMissing);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to run image pipeline" });
    }
  });

  app.get("/api/admin/pending-emails", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const status = req.query.status as string | undefined;
    const emails = await storage.getPendingEmails(status || undefined);
    res.json(emails);
  });

  app.get("/api/admin/pending-emails/:id/html", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const id = parseInt(req.params.id);
    const pending = await storage.getPendingEmailById(id);
    if (!pending) {
      return res.status(404).json({ message: "Pending email not found" });
    }
    const templateSettings = await storage.getEmailTemplateSettings();
    const freshHtml = markdownToEmailHtml(pending.summary, pending.recipientEmail, templateSettings);
    res.json({ html: freshHtml });
  });

  app.post("/api/admin/pending-emails/:id/cancel", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const id = parseInt(req.params.id);
    const pending = await storage.getPendingEmailById(id);
    if (!pending) {
      return res.status(404).json({ message: "Pending email not found" });
    }
    if (pending.status !== "held" && pending.status !== "pending") {
      return res.status(400).json({ message: `Cannot cancel email with status "${pending.status}"` });
    }
    await storage.updatePendingEmailStatus(id, "cancelled");
    res.json({ message: "Email cancelled" });
  });

  app.post("/api/admin/pending-emails/:id/send-now", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const id = parseInt(req.params.id);
    const pending = await storage.getPendingEmailById(id);
    if (!pending) {
      return res.status(404).json({ message: "Pending email not found" });
    }
    if (pending.status !== "held" && pending.status !== "pending") {
      return res.status(400).json({ message: `Cannot send email with status "${pending.status}"` });
    }

    if (!recapHasContent(pending.summary)) {
      await storage.updatePendingEmailStatus(id, "error", "No episode content in recap");
      return res.status(400).json({ message: "This email has no episode content and cannot be sent." });
    }

    try {
      const templateSettings = await storage.getEmailTemplateSettings();
      const freshHtml = markdownToEmailHtml(pending.summary, pending.recipientEmail, templateSettings);
      const baseUrl = "https://podcap.io";
      const trackingPixel = `<img src="${baseUrl}/api/track/open/${pending.id}" width="1" height="1" style="display:block;width:1px;height:1px;border:0;" alt="" />`;
      const htmlWithTracking = freshHtml.replace("</body>", `${trackingPixel}</body>`);

      const { client, fromEmail } = await getUncachableResendClient();
      const sendResult = await client.emails.send({
        from: `PodCap Daily <${fromEmail}>`,
        to: pending.recipientEmail,
        subject: pending.subject,
        html: htmlWithTracking,
      });

      if (sendResult.error) {
        await storage.updatePendingEmailStatus(id, "error", sendResult.error.message || "Send failed");
        return res.status(500).json({ message: `Send failed: ${sendResult.error.message}` });
      }

      await storage.updatePendingEmailHtml(id, freshHtml);
      await storage.updatePendingEmailStatus(id, "sent");
      await storage.logEmail({
        userId: pending.userId,
        recipientEmail: pending.recipientEmail,
        podcasts: pending.podcasts,
        source: "manual",
        emailHtml: freshHtml,
      });

      res.json({ message: "Email sent successfully" });
    } catch (err: any) {
      await storage.updatePendingEmailStatus(id, "error", err?.message || String(err)).catch(() => {});
      res.status(500).json({ message: "Failed to send email" });
    }
  });

  app.post("/api/admin/trigger-pregeneration", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { triggerPregeneration } = await import("./emailScheduler");
      triggerPregeneration();
      res.json({ message: "Pre-generation started. Check back in a few minutes." });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to trigger pre-generation" });
    }
  });

  app.post("/api/admin/refresh-landing-recaps", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { refreshLandingPageRecaps } = await import("./emailScheduler");
      refreshLandingPageRecaps(true);
      res.json({ message: "Landing page recap refresh started." });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to trigger refresh" });
    }
  });

  app.post("/api/admin/backfill-topics-questions", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { backfillTopicsAndQuestions } = await import("./emailScheduler");
      backfillTopicsAndQuestions();
      res.json({ message: "Backfill of key topics and top questions started." });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to trigger backfill" });
    }
  });

  app.post("/api/admin/backfill-transcript-segments", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { backfillTranscriptSegments } = await import("./emailScheduler");
      backfillTranscriptSegments();
      res.json({ message: "Transcript segment backfill started." });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to trigger backfill" });
    }
  });

  app.get("/api/admin/updates/progress", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { getLandingRecapProgress, getBatchExpansionProgress } = await import("./emailScheduler");
      res.json({
        landingRecaps: getLandingRecapProgress(),
        batchExpansion: getBatchExpansionProgress(),
      });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to get progress" });
    }
  });

  app.post("/api/admin/updates/trigger-landing-recaps", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { refreshLandingPageRecaps, getLandingRecapProgress } = await import("./emailScheduler");
      const current = getLandingRecapProgress();
      if (current.status === "running") {
        return res.status(409).json({ message: "Landing recap refresh already running", progress: current });
      }
      refreshLandingPageRecaps(true);
      res.json({ message: "Landing recap refresh started" });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to start" });
    }
  });

  app.post("/api/admin/updates/trigger-batch-expand", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { batchExpandEpisodes, getBatchExpansionProgress } = await import("./emailScheduler");
      const current = getBatchExpansionProgress();
      if (current.status === "running") {
        return res.status(409).json({ message: "Batch expansion already running", progress: current });
      }
      const target = Math.min(Math.max(parseInt(req.body.target) || 50, 1), 100);
      batchExpandEpisodes(target);
      res.json({ message: `Batch expansion started (target: ${target} episodes per podcast)` });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to start" });
    }
  });

  app.post("/api/admin/batch-expand", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { batchExpandEpisodes, getBatchExpansionProgress } = await import("./emailScheduler");
      const current = getBatchExpansionProgress();
      if (current.status === "running") {
        return res.status(409).json({ message: "Batch expansion already running", progress: current });
      }
      const target = Math.min(Math.max(parseInt(req.body.target) || 50, 1), 100);
      batchExpandEpisodes(target);
      res.json({ message: `Batch expansion started (target: ${target} episodes per podcast)` });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to start batch expansion" });
    }
  });

  app.get("/api/admin/batch-expand/progress", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { getBatchExpansionProgress } = await import("./emailScheduler");
      res.json(getBatchExpansionProgress());
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to get progress" });
    }
  });

  app.post("/api/admin/regenerate-podcast-top-questions", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { db } = await import("./db");
      const { podcastTopQuestions } = await import("@shared/schema");
      await db.delete(podcastTopQuestions);
      res.json({ message: "All podcast top questions cleared. They will regenerate with the new SEO prompt on next visit." });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to clear top questions" });
    }
  });

  app.get("/api/podcasts/:slug/hosts", async (req, res) => {
    try {
      const hosts = await storage.getHostsByPodcastSlug(req.params.slug);
      res.json(hosts);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch hosts" });
    }
  });

  app.post("/api/admin/podcasts/:slug/hosts", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const host = await storage.upsertHost({ ...req.body, podcastSlug: req.params.slug });
      res.json(host);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to save host" });
    }
  });

  app.delete("/api/admin/podcasts/hosts/:id", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      await storage.deleteHost(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to delete host" });
    }
  });

  app.post("/api/admin/enrich-podcast-metadata", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { enrichPodcastMetadata } = await import("./emailScheduler");
      enrichPodcastMetadata();
      res.json({ message: "Podcast metadata enrichment started for all podcasts missing about info." });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to start enrichment" });
    }
  });

  app.post("/api/admin/reingest-transcript-segments", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { reIngestTranscriptSegments } = await import("./emailScheduler");
      reIngestTranscriptSegments();
      res.json({ message: "Transcript re-ingestion started (fetching timestamps from Taddy)." });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to trigger re-ingestion" });
    }
  });

  app.post("/api/admin/backfill-apple-episode-urls", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { backfillAppleEpisodeUrls } = await import("./emailScheduler");
      backfillAppleEpisodeUrls();
      res.json({ message: "Apple episode URL backfill started." });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to trigger backfill" });
    }
  });

  app.post("/api/admin/backfill-spotify-episode-urls", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { backfillSpotifyEpisodeUrls } = await import("./emailScheduler");
      backfillSpotifyEpisodeUrls();
      res.json({ message: "Spotify episode URL backfill started." });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to trigger backfill" });
    }
  });

  app.post("/api/admin/backfill-show-notes", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { backfillShowNotes } = await import("./emailScheduler");
      backfillShowNotes();
      res.json({ message: "Show notes backfill started." });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to trigger backfill" });
    }
  });

  app.post("/api/admin/generate-daily-drop", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const { date } = req.body || {};
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: "Provide a valid date in YYYY-MM-DD format" });
    }
    try {
      const { generateDailyDropEdition, saveDailyDropEdition } = await import("./dailyDropGenerator");
      const edition = await generateDailyDropEdition(date);
      if (!edition) {
        return res.status(404).json({ message: "No episodes found for this date or generation failed" });
      }
      await saveDailyDropEdition(date, edition);
      res.json({ message: "Signal edition generated", date, headline: edition.headline });
    } catch (err: any) {
      console.error("[DailyDrop] Generation error:", err);
      res.status(500).json({ message: err?.message || "Failed to generate edition" });
    }
  });

  app.post("/api/admin/backfill-books", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const { podcastSlug, episodeSlug } = req.body || {};
    const batchLimit = Math.max(1, Math.min(50, parseInt(req.body?.limit) || 10));
    try {
      const { extractBooksFromTranscript } = await import("./recapGenerator");

      let query: string;
      let params: any[];

      if (podcastSlug && episodeSlug) {
        query = `
          SELECT r.id, r.slug as podcast_slug, r.episode_slug, r.episode_title, r.podcast_name, r.resources,
                 t.transcript
          FROM landing_page_recaps r
          JOIN podcast_directory pd ON pd.slug = r.slug
          JOIN episode_transcripts t ON t.podcast_id = pd.itunes_id::text AND LOWER(t.episode_title) = LOWER(r.episode_title)
          WHERE r.slug = $1 AND r.episode_slug = $2
          LIMIT 1
        `;
        params = [podcastSlug, episodeSlug];
      } else {
        const maxBatch = Math.min(batchLimit || 10, 50);
        query = `
          SELECT r.id, r.slug as podcast_slug, r.episode_slug, r.episode_title, r.podcast_name, r.resources,
                 t.transcript
          FROM landing_page_recaps r
          JOIN podcast_directory pd ON pd.slug = r.slug
          JOIN episode_transcripts t ON t.podcast_id = pd.itunes_id::text AND LOWER(t.episode_title) = LOWER(r.episode_title)
          WHERE (r.resources IS NULL OR r.resources::text = '[]'
            OR (
              NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements(r.resources::jsonb) elem
                WHERE elem->>'type' = 'book'
              )
              AND NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements(r.resources::jsonb) elem
                WHERE elem->>'type' = '_meta'
              )
            ))
          ORDER BY r.id DESC
          LIMIT $1
        `;
        params = [maxBatch];
      }

      const { rows } = await pool.query(query, params);
      if (rows.length === 0) {
        return res.json({ message: "No episodes found to process", processed: 0 });
      }

      let processed = 0;
      let booksFound = 0;
      const results: { episode: string; bookCount: number }[] = [];

      for (const row of rows) {
        try {
          const books = await extractBooksFromTranscript(
            row.transcript,
            row.podcast_name || row.podcast_slug,
            row.episode_title,
          );

          const existingResources = row.resources ? (typeof row.resources === 'string' ? JSON.parse(row.resources) : row.resources) : [];
          const nonBookResources = existingResources.filter((r: any) => r.type !== 'book');

          const validBooks = books
            .filter((b: any) => b && typeof b.name === 'string' && b.name.trim().length > 0)
            .map((b: any) => ({
              name: b.name.trim(),
              type: "book",
              description: b.description || "",
              url: typeof b.url === 'string' ? b.url : "",
              author: b.author || null,
              context: b.context || "",
            }));

          const merged = validBooks.length > 0
            ? [...nonBookResources, ...validBooks]
            : (nonBookResources.length > 0 ? nonBookResources : [{ name: "_books_checked", type: "_meta", description: "No books found" }]);

          await pool.query(
            `UPDATE landing_page_recaps SET resources = $1::jsonb WHERE id = $2`,
            [JSON.stringify(merged), row.id]
          );
          booksFound += validBooks.length;

          results.push({ episode: `${row.podcast_slug}/${row.episode_slug}`, bookCount: books.length });
          processed++;
          console.log(`[BookBackfill] ${row.podcast_slug}/${row.episode_slug}: ${books.length} books found`);
        } catch (err: any) {
          console.error(`[BookBackfill] Error processing ${row.episode_slug}:`, err?.message);
          results.push({ episode: `${row.podcast_slug}/${row.episode_slug}`, bookCount: -1 });
        }
      }

      res.json({ message: "Book backfill complete", processed, booksFound, results });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to run book backfill" });
    }
  });

  app.post("/api/admin/enrich-books", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { enrichAllBooks } = await import("./enrichBooks");
      const limit = req.body?.limit || undefined;
      res.json({ message: "Book enrichment started" });
      enrichAllBooks(limit).then(result => {
        console.log(`[BookEnrich] Complete: ${result.processed} processed, ${result.errors} errors`);
      });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to enrich books" });
    }
  });

  app.post("/api/admin/enrich-book-metadata", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { enrichAllBookMetadata } = await import("./enrichBookMetadata");
      res.json({ message: "Book metadata enrichment started" });
      enrichAllBookMetadata().then(result => {
        console.log(`[BookMeta] Complete: ${result.topics} topics, ${result.openLibrary} Open Library`);
      });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to enrich book metadata" });
    }
  });

  app.post("/api/admin/regenerate-pending-html", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const held = await storage.getPendingEmails("held");
      const pending = await storage.getPendingEmails("pending");
      const allPending = [...held, ...pending];
      const templateSettings = await storage.getEmailTemplateSettings();
      let updated = 0;
      for (const email of allPending) {
        let summary = email.summary;

        const cleanLines = summary.split("\n").filter(l => {
          if (/^\*\*.*?\*\*\s*Total duration/i.test(l)) return false;
          if (/^\d+\s*(hr|min|hour|minute).*·.*\d{4}/i.test(l.trim())) return false;
          if (/^🎧\s*\[/.test(l.trim())) return false;
          return true;
        });
        summary = cleanLines.join("\n");

        let totalDurationMin = 0;
        const podcastIds: string[] = [];
        const podcastNames: string[] = [];
        for (const p of email.podcasts) {
          try {
            const parsed = JSON.parse(p);
            if (parsed.id) podcastIds.push(parsed.id);
            if (parsed.name) podcastNames.push(parsed.name);
          } catch {}
        }

        interface EpInfo { title: string; durationMin: number; durationStr: string; releaseDate: string; appleUrl: string; spotifyUrl: string; }
        const matchedEpisodes: EpInfo[] = [];

        for (let pi = 0; pi < podcastIds.length; pi++) {
          const pid = podcastIds[pi];
          const pName = podcastNames[pi] || "";
          try {
            const lookupUrl = `https://itunes.apple.com/lookup?id=${pid}&media=podcast&entity=podcastEpisode&limit=25&sort=recent`;
            const lookupRes = await fetch(lookupUrl);
            const lookupJson = await lookupRes.json() as any;
            const results = lookupJson.results || [];
            for (const ep of results) {
              if (ep.wrapperType !== "podcastEpisode" || !ep.trackTimeMillis) continue;
              const epTitle = (ep.trackName || "").trim();
              if (!epTitle) continue;
              if (summary.includes(`**${epTitle}**`)) {
                const durationMin = Math.round(ep.trackTimeMillis / 60000);
                totalDurationMin += durationMin;
                const durationStr = durationMin >= 60
                  ? `${Math.floor(durationMin / 60)} hr ${durationMin % 60} min`
                  : `${durationMin} minutes`;
                const releaseDate = ep.releaseDate
                  ? new Date(ep.releaseDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
                  : "";
                const appleUrl = ep.trackViewUrl || ep.collectionViewUrl || "";
                const spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(pName + " " + epTitle)}`;
                matchedEpisodes.push({ title: epTitle, durationMin, durationStr, releaseDate, appleUrl, spotifyUrl });
              }
            }
          } catch {}
        }

        for (const ep of [...matchedEpisodes].reverse()) {
          const marker = `**${ep.title}**`;
          const idx = summary.indexOf(marker);
          if (idx === -1) continue;
          const insertAfter = idx + marker.length;
          const rest = summary.substring(insertAfter);
          const nlPos = rest.indexOf("\n");
          const insertPos = insertAfter + (nlPos >= 0 ? nlPos + 1 : 0);

          const metaLine = [ep.durationStr, ep.releaseDate].filter(Boolean).join(" · ");
          const linkParts: string[] = [];
          if (ep.appleUrl) linkParts.push(`[Apple Podcasts](${ep.appleUrl})`);
          if (ep.spotifyUrl) linkParts.push(`[Spotify](${ep.spotifyUrl})`);
          const linksLine = linkParts.length > 0 ? `🎧 ${linkParts.join(" · ")}` : "";
          const block = "\n" + [metaLine, linksLine].filter(Boolean).join("\n") + "\n";

          summary = summary.substring(0, insertPos) + block + summary.substring(insertPos);
        }

        if (totalDurationMin > 0) {
          const hours = Math.floor(totalDurationMin / 60);
          const mins = totalDurationMin % 60;
          const durationStr = hours > 0
            ? (mins > 0 ? `${hours} hour${hours !== 1 ? "s" : ""} and ${mins} minute${mins !== 1 ? "s" : ""}` : `${hours} hour${hours !== 1 ? "s" : ""}`)
            : `${mins} minute${mins !== 1 ? "s" : ""}`;
          const lines = summary.split("\n");
          const dashIdx = lines.findIndex(l => l.trim() === "---");
          if (dashIdx >= 0) {
            lines.splice(dashIdx, 0, `**${durationStr}** Total duration`);
          } else {
            lines.splice(1, 0, `**${durationStr}** Total duration`);
          }
          summary = lines.join("\n");
        }
        await storage.updatePendingEmailSummary(email.id, summary);

        const newHtml = markdownToEmailHtml(summary, email.recipientEmail, templateSettings);
        await storage.updatePendingEmailHtml(email.id, newHtml);
        updated++;
      }
      res.json({ message: `Regenerated HTML for ${updated} pending emails` });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to regenerate" });
    }
  });

  app.post("/api/admin/generate-landing-recaps", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { ITUNES_ID_TO_SLUG } = await import("./podcastLandingMap");
      const { searchPodcastByItunesId, getRecentEpisodesWithTranscripts, getEpisodeTranscript } = await import("./taddyClient");

      const entries = Object.entries(ITUNES_ID_TO_SLUG);
      const results: { slug: string; status: string; episodeTitle?: string }[] = [];

      res.writeHead(200, { "Content-Type": "application/json", "Transfer-Encoding": "chunked" });

      for (const [itunesId, slug] of entries) {
        try {
          const lookupUrl = `https://itunes.apple.com/lookup?id=${itunesId}&media=podcast&entity=podcastEpisode&limit=5&sort=recent`;
          const lookupRes = await fetch(lookupUrl);
          const lookupJson = await lookupRes.json();
          const allResults = lookupJson.results || [];
          const podcastInfo = allResults.find((r: any) => r.wrapperType === "collection");
          const episodes = allResults.filter((r: any) => r.wrapperType === "podcastEpisode");

          if (episodes.length === 0) {
            results.push({ slug, status: "no_episodes" });
            res.write(JSON.stringify({ slug, status: "no_episodes" }) + "\n");
            continue;
          }

          const ep = episodes[0];
          const podcastName = podcastInfo?.collectionName || ep.collectionName || "Unknown Podcast";
          const epTitle = ep.trackName || "Untitled Episode";
          const durationMs = ep.trackTimeMillis || 0;
          const durationMin = Math.round(durationMs / 60000);
          const durationStr = durationMin >= 60
            ? `${Math.floor(durationMin / 60)} hr ${durationMin % 60} min`
            : `${durationMin} minutes`;
          const releaseDate = ep.releaseDate
            ? new Date(ep.releaseDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
            : "";

          let transcriptText: string | null = null;
          try {
            const dirEntry = await storage.getPodcastDirectoryEntry(itunesId);
            const taddyPodcast = await searchPodcastByItunesId(itunesId, podcastName, dirEntry?.taddyUuid || undefined);
            if (taddyPodcast?.uuid) {
              if (dirEntry && !dirEntry.taddyUuid) {
                storage.updatePodcastTaddyUuid(itunesId, taddyPodcast.uuid).catch(() => {});
              }
              const taddyEpisodes = await getRecentEpisodesWithTranscripts(taddyPodcast.uuid, 5);
              const normalizeTitle = (t: string) => t.toLowerCase().trim().replace(/\s+/g, " ");
              const matchedEp = taddyEpisodes.find((te: any) =>
                normalizeTitle(te.name || "") === normalizeTitle(epTitle)
              ) || taddyEpisodes[0];
              if (matchedEp?.uuid) {
                transcriptText = await getEpisodeTranscript(matchedEp.uuid);
              }
            }
          } catch (taddyErr) {
            console.warn(`[LandingRecaps] Taddy error for ${slug}:`, taddyErr);
          }

          if (!transcriptText) {
            results.push({ slug, status: "no_transcript" });
            res.write(JSON.stringify({ slug, status: "no_transcript" }) + "\n");
            continue;
          }

          const { generateRecapFromTranscript } = await import("./recapGenerator");
          const recap = await generateRecapFromTranscript(
            transcriptText,
            podcastName,
            epTitle,
            ep.description || ep.shortDescription || undefined
          );

          if (!recap) {
            results.push({ slug, status: "ai_failed" });
            res.write(JSON.stringify({ slug, status: "ai_failed" }) + "\n");
            continue;
          }

          await storage.upsertExampleRecap({
            slug,
            podcastName: recap.podcastName || podcastName,
            itunesId,
            episodeTitle: recap.episodeTitle || epTitle,
            episodeDate: releaseDate,
            episodeDuration: durationStr,
            tldl: recap.tldl || "",
            whatHappened: recap.whatHappened,
            keyInsights: recap.keyInsights,
            quote: recap.quote || null,
            quoteAttribution: recap.quoteAttribution || null,
          });

          results.push({ slug, status: "success", episodeTitle: epTitle });
          res.write(JSON.stringify({ slug, status: "success", episodeTitle: epTitle }) + "\n");
          console.log(`[LandingRecaps] Generated recap for ${slug}: ${epTitle}`);

          await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (err: any) {
          console.error(`[LandingRecaps] Error for ${slug}:`, err);
          results.push({ slug, status: "error", episodeTitle: err?.message });
          res.write(JSON.stringify({ slug, status: "error", error: err?.message }) + "\n");
        }
      }

      res.write(JSON.stringify({ done: true, total: entries.length, success: results.filter(r => r.status === "success").length }) + "\n");
      res.end();
    } catch (err: any) {
      console.error("[LandingRecaps] Fatal error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: err?.message || "Failed to generate landing recaps" });
      }
    }
  });

  app.post("/api/admin/backfill-recaps-25", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { ITUNES_ID_TO_SLUG, SLUG_TO_ITUNES_ID } = await import("./podcastLandingMap");
      const { searchPodcastByItunesId, getRecentEpisodesWithTranscripts, getEpisodeTranscript } = await import("./taddyClient");
      const podcastLandingDataModule = await import("../client/src/data/podcastLandingData");
      const PODCAST_LANDINGS = podcastLandingDataModule.PODCAST_LANDINGS;

      const TARGET = 25;
      const { slugFilter, dryRun, batchSize: batchSizeParam } = req.body || {};
      const batchSize = Math.min(batchSizeParam || 5, 20);

      const { pool: dbPool } = await import("./db");
      const client = await dbPool.connect();
      let existingCounts: Record<string, number> = {};
      try {
        const { rows } = await client.query(
          `SELECT slug, COUNT(*)::int as cnt FROM landing_page_recaps GROUP BY slug`
        );
        for (const r of rows) existingCounts[r.slug] = r.cnt;
      } finally {
        client.release();
      }

      let allSlugs = Object.values(ITUNES_ID_TO_SLUG);
      if (slugFilter && Array.isArray(slugFilter)) {
        allSlugs = allSlugs.filter(s => slugFilter.includes(s));
      }
      const podcastsToBackfill = allSlugs
        .map(slug => ({ slug, itunesId: SLUG_TO_ITUNES_ID[slug], existing: existingCounts[slug] || 0 }))
        .filter(p => p.existing < TARGET)
        .sort((a, b) => a.existing - b.existing);

      const totalNeeded = podcastsToBackfill.reduce((sum, p) => sum + (TARGET - p.existing), 0);

      res.writeHead(200, { "Content-Type": "application/json", "Transfer-Encoding": "chunked" });
      res.write(JSON.stringify({
        type: "plan",
        totalPodcasts: podcastsToBackfill.length,
        totalEpisodesNeeded: totalNeeded,
        batchSize,
        dryRun: !!dryRun,
      }) + "\n");

      if (dryRun) {
        for (const p of podcastsToBackfill) {
          res.write(JSON.stringify({ slug: p.slug, existing: p.existing, needed: TARGET - p.existing }) + "\n");
        }
        res.write(JSON.stringify({ type: "done", dryRun: true }) + "\n");
        res.end();
        return;
      }

      let totalGenerated = 0;
      let totalErrors = 0;
      let totalSkipped = 0;

      for (const podcast of podcastsToBackfill) {
        const needed = TARGET - podcast.existing;
        if (needed <= 0) continue;

        try {
          const landingConfig = PODCAST_LANDINGS.find((p: any) => p.slug === podcast.slug);
          const artworkUrl = landingConfig?.artworkUrl || "";
          const hosts = landingConfig?.hosts || "";
          const podcastName = landingConfig?.name || podcast.slug;

          const fetchLimit = Math.min(needed + podcast.existing + 10, 200);
          const lookupUrl = `https://itunes.apple.com/lookup?id=${podcast.itunesId}&media=podcast&entity=podcastEpisode&limit=${fetchLimit}&sort=recent`;
          const lookupRes = await fetch(lookupUrl);
          const lookupJson = await lookupRes.json();
          const allResults = lookupJson.results || [];
          const episodes = allResults.filter((r: any) => r.wrapperType === "podcastEpisode");

          if (episodes.length === 0) {
            res.write(JSON.stringify({ slug: podcast.slug, status: "no_episodes_found" }) + "\n");
            totalSkipped++;
            continue;
          }

          const existingClient = await dbPool.connect();
          let existingEpisodeTitles: Set<string> = new Set();
          try {
            const { rows } = await existingClient.query(
              `SELECT episode_slug, episode_title FROM landing_page_recaps WHERE slug = $1`, [podcast.slug]
            );
            for (const r of rows) {
              existingEpisodeTitles.add((r.episode_title || "").toLowerCase().trim());
              existingEpisodeTitles.add(r.episode_slug);
            }
          } finally {
            existingClient.release();
          }

          const newEpisodes = episodes.filter((ep: any) => {
            const epTitle = (ep.trackName || "").toLowerCase().trim();
            const epSlug = epTitle.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
            return !existingEpisodeTitles.has(epTitle) && !existingEpisodeTitles.has(epSlug);
          }).slice(0, needed);

          if (newEpisodes.length === 0) {
            res.write(JSON.stringify({ slug: podcast.slug, status: "all_episodes_exist", existing: podcast.existing }) + "\n");
            totalSkipped++;
            continue;
          }

          let taddyPodcast: any = null;
          let taddyEpisodes: any[] = [];
          try {
            taddyPodcast = await searchPodcastByItunesId(podcast.itunesId, podcast.name || podcast.slug, podcast.taddyUuid || undefined);
            if (taddyPodcast?.uuid) {
              if (!podcast.taddyUuid) {
                storage.updatePodcastTaddyUuid(podcast.itunesId, taddyPodcast.uuid).catch(() => {});
              }
              taddyEpisodes = await getRecentEpisodesWithTranscripts(taddyPodcast.uuid, 50);
            }
          } catch (taddyErr) {
            console.warn(`[Backfill] Taddy lookup failed for ${podcast.slug}:`, taddyErr);
          }

          let generatedForPodcast = 0;

          for (let i = 0; i < newEpisodes.length; i += batchSize) {
            const batch = newEpisodes.slice(i, i + batchSize);

            for (const ep of batch) {
              try {
                const epTitle = ep.trackName || "Untitled Episode";
                const epSlug = epTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
                const durationMs = ep.trackTimeMillis || 0;
                const durationMin = Math.round(durationMs / 60000);
                const durationStr = durationMin >= 60
                  ? `${Math.floor(durationMin / 60)} hr ${durationMin % 60} min`
                  : `${durationMin} minutes`;
                const releaseDate = ep.releaseDate
                  ? new Date(ep.releaseDate).toISOString().split("T")[0]
                  : new Date().toISOString().split("T")[0];
                const appleUrl = ep.trackViewUrl || ep.collectionViewUrl || "";

                let transcriptText: string | null = null;
                const normalizeTitle = (t: string) => t.toLowerCase().trim().replace(/\s+/g, " ").replace(/^\d+[\.\)\-:\s]+\s*/i, "");
                const itunesNorm = normalizeTitle(epTitle);

                const taddyMatch = taddyEpisodes.find((te: any) => {
                  if (!te.name) return false;
                  const taddyNorm = normalizeTitle(te.name);
                  return taddyNorm === itunesNorm || taddyNorm.includes(itunesNorm) || itunesNorm.includes(taddyNorm);
                });

                if (taddyMatch?.uuid) {
                  try {
                    transcriptText = await getEpisodeTranscript(taddyMatch.uuid);
                  } catch {}
                }

                if (!transcriptText) {
                  totalSkipped++;
                  res.write(JSON.stringify({ slug: podcast.slug, episode: epTitle.slice(0, 60), status: "no_transcript" }) + "\n");
                  continue;
                }

                const { generateRecapFromTranscript } = await import("./recapGenerator");
                const recap = await generateRecapFromTranscript(
                  transcriptText,
                  podcastName,
                  epTitle,
                  ep.description || ep.shortDescription || undefined
                );

                if (!recap) {
                  totalErrors++;
                  res.write(JSON.stringify({ slug: podcast.slug, episode: epTitle.slice(0, 60), status: "ai_failed" }) + "\n");
                  continue;
                }

                await storage.upsertLandingPageRecap({
                  slug: podcast.slug,
                  itunesId: podcast.itunesId,
                  podcastName: recap.podcastName || podcastName,
                  episodeTitle: recap.episodeTitle || epTitle,
                  episodeSlug: epSlug,
                  publishDate: releaseDate,
                  duration: durationStr,
                  artworkUrl,
                  hosts,
                  tldl: recap.tldl || "",
                  whatHappened: recap.whatHappened,
                  keyInsights: recap.keyInsights,
                  quote: recap.quote || null,
                  quoteAttribution: recap.quoteAttribution || null,
                  appleEpisodeUrl: appleUrl || null,
                  audioUrl: ep.episodeUrl || null,
                  keyTopics: recap.keyTopics || null,
                  topicContexts: recap.topicContexts ? JSON.stringify(recap.topicContexts) : null,
                  topQuestions: recap.topQuestions ? JSON.stringify(recap.topQuestions) : null,
                  guests: recap.guests ? JSON.stringify(recap.guests) : null,
                  sponsors: recap.sponsors ? JSON.stringify(recap.sponsors) : null,
                  resources: recap.resources ? JSON.stringify(recap.resources) : null,
                });

                generatedForPodcast++;
                totalGenerated++;
                res.write(JSON.stringify({
                  slug: podcast.slug,
                  episode: epTitle.slice(0, 60),
                  status: "success",
                  hasTranscript: !!transcriptText,
                  progress: `${totalGenerated} generated, ${totalErrors} errors`,
                }) + "\n");

              } catch (epErr: any) {
                totalErrors++;
                res.write(JSON.stringify({
                  slug: podcast.slug,
                  episode: ep.trackName?.slice(0, 60),
                  status: "error",
                  error: epErr?.message?.slice(0, 200),
                }) + "\n");
              }

              await new Promise(resolve => setTimeout(resolve, 1200));
            }
          }

          res.write(JSON.stringify({
            slug: podcast.slug,
            status: "podcast_done",
            generated: generatedForPodcast,
            total: podcast.existing + generatedForPodcast,
          }) + "\n");

        } catch (podcastErr: any) {
          totalErrors++;
          res.write(JSON.stringify({
            slug: podcast.slug,
            status: "podcast_error",
            error: podcastErr?.message?.slice(0, 200),
          }) + "\n");
        }
      }

      if (totalGenerated > 0) {
        for (const c of Object.values(directoryCache)) c.invalidate();
        console.log(`[Cache] Invalidated all directory caches after ${totalGenerated} new recaps`);
      }

      res.write(JSON.stringify({
        type: "done",
        totalGenerated,
        totalErrors,
        totalSkipped,
        totalPodcasts: podcastsToBackfill.length,
      }) + "\n");
      res.end();
    } catch (err: any) {
      console.error("[Backfill25] Fatal error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: err?.message || "Failed to run backfill" });
      } else {
        res.write(JSON.stringify({ type: "fatal_error", error: err?.message }) + "\n");
        res.end();
      }
    }
  });

  app.post("/api/admin/bulk-download-transcripts", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { ITUNES_ID_TO_SLUG, SLUG_TO_ITUNES_ID } = await import("./podcastLandingMap");
      const { getEpisodeTranscript } = await import("./taddyClient");

      const { slugFilter, target: customTarget } = req.body || {};
      const TARGET = (customTarget && Number(customTarget) > 0) ? Number(customTarget) : 25;

      const taddyUserId = process.env.TADDY_USER_ID;
      const taddyApiKey = process.env.TADDY_API_KEY;
      if (!taddyUserId || !taddyApiKey) {
        return res.status(500).json({ message: "Taddy API credentials not configured" });
      }

      const { pool: dbPool } = await import("./db");
      const client = await dbPool.connect();
      let existingRecapCounts: Record<string, number> = {};
      let existingTranscriptGuids: Set<string> = new Set();
      try {
        const { rows } = await client.query(`SELECT slug, COUNT(*)::int as cnt FROM landing_page_recaps GROUP BY slug`);
        for (const r of rows) existingRecapCounts[r.slug] = r.cnt;
        const { rows: tRows } = await client.query(`SELECT episode_guid FROM episode_transcripts`);
        for (const r of tRows) existingTranscriptGuids.add(r.episode_guid);
      } finally {
        client.release();
      }

      let allSlugs = Object.values(ITUNES_ID_TO_SLUG);
      if (slugFilter && Array.isArray(slugFilter)) {
        allSlugs = allSlugs.filter(s => slugFilter.includes(s));
      }
      const podcastsToProcess = allSlugs
        .map(slug => ({ slug, itunesId: SLUG_TO_ITUNES_ID[slug], existing: existingRecapCounts[slug] || 0 }))
        .filter(p => p.existing < TARGET)
        .sort((a, b) => a.existing - b.existing);

      res.writeHead(200, { "Content-Type": "application/json", "Transfer-Encoding": "chunked" });
      res.write(JSON.stringify({ type: "plan", totalPodcasts: podcastsToProcess.length, phase: "transcript_download" }) + "\n");

      const creditsRes = await fetch("https://api.taddy.org", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-USER-ID": taddyUserId, "X-API-KEY": taddyApiKey },
        body: JSON.stringify({ query: "{ getTranscriptCreditsRemaining }" }),
      });
      const creditsData = await creditsRes.json();
      const creditsRemaining = creditsData?.data?.getTranscriptCreditsRemaining ?? "unknown";
      res.write(JSON.stringify({ type: "credits", remaining: creditsRemaining }) + "\n");

      let totalDownloaded = 0;
      let totalAlreadyCached = 0;
      let totalNoTranscript = 0;
      let totalErrors = 0;

      for (const podcast of podcastsToProcess) {
        try {
          const needed = TARGET - podcast.existing;
          const numericItunesId = parseInt(podcast.itunesId, 10);
          if (isNaN(numericItunesId)) {
            res.write(JSON.stringify({ slug: podcast.slug, status: "invalid_itunes_id" }) + "\n");
            continue;
          }

          const epLimit = Math.min(needed + 5, 25);
          const taddyQuery = `{
            getPodcastSeries(itunesId: ${numericItunesId}) {
              uuid
              name
              taddyTranscribeStatus
              episodes(sortOrder: LATEST, limitPerPage: ${epLimit}) {
                uuid
                name
                datePublished
                taddyTranscribeStatus
              }
            }
          }`;

          const taddyRes = await fetch("https://api.taddy.org", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-USER-ID": taddyUserId, "X-API-KEY": taddyApiKey },
            body: JSON.stringify({ query: taddyQuery }),
          });
          const taddyData = await taddyRes.json();
          let taddySeries = taddyData?.data?.getPodcastSeries;

          if (taddySeries?.uuid && (!taddySeries.episodes || taddySeries.episodes.length === 0)) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const retryQuery = `{
              getPodcastSeries(uuid: "${taddySeries.uuid}") {
                uuid
                name
                taddyTranscribeStatus
                episodes(sortOrder: LATEST, limitPerPage: ${epLimit}) {
                  uuid
                  name
                  datePublished
                  taddyTranscribeStatus
                }
              }
            }`;
            const retryRes = await fetch("https://api.taddy.org", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-USER-ID": taddyUserId, "X-API-KEY": taddyApiKey },
              body: JSON.stringify({ query: retryQuery }),
            });
            const retryData = await retryRes.json();
            const retrySeries = retryData?.data?.getPodcastSeries;
            if (retrySeries?.episodes && retrySeries.episodes.length > 0) {
              taddySeries = retrySeries;
            }
          }

          if (!taddySeries || !taddySeries.episodes || taddySeries.episodes.length === 0) {
            res.write(JSON.stringify({
              slug: podcast.slug,
              status: "no_taddy_episodes",
              seriesFound: !!taddySeries,
              seriesName: taddySeries?.name || null,
              transcribeStatus: taddySeries?.taddyTranscribeStatus || null,
            }) + "\n");
            continue;
          }

          let downloadedForPodcast = 0;
          let skippedCached = 0;
          let noTranscript = 0;

          for (const ep of taddySeries.episodes) {
            if (downloadedForPodcast >= needed) break;

            const epTitle = ep.name || "Untitled";
            const episodeGuid = ep.uuid;

            if (existingTranscriptGuids.has(episodeGuid)) {
              skippedCached++;
              totalAlreadyCached++;
              continue;
            }

            if (ep.taddyTranscribeStatus === "COMPLETED") {
              try {
                const transcriptText = await getEpisodeTranscript(ep.uuid);
                if (transcriptText && transcriptText.length > 100) {
                  await storage.saveTranscript({
                    podcastId: podcast.itunesId,
                    episodeGuid,
                    episodeTitle: epTitle,
                    transcript: transcriptText,
                  });
                  existingTranscriptGuids.add(episodeGuid);
                  downloadedForPodcast++;
                  totalDownloaded++;
                } else {
                  noTranscript++;
                  totalNoTranscript++;
                }
              } catch (err: any) {
                totalErrors++;
              }
            } else {
              noTranscript++;
              totalNoTranscript++;
            }
            await new Promise(resolve => setTimeout(resolve, 300));
          }

          res.write(JSON.stringify({
            slug: podcast.slug,
            status: "done",
            downloaded: downloadedForPodcast,
            cached: skippedCached,
            noTranscript,
            taddyEpisodes: taddySeries.episodes.length,
            seriesTranscribeStatus: taddySeries.taddyTranscribeStatus,
          }) + "\n");

        } catch (err: any) {
          totalErrors++;
          res.write(JSON.stringify({ slug: podcast.slug, status: "error", error: err?.message?.slice(0, 150) }) + "\n");
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const creditsRes2 = await fetch("https://api.taddy.org", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-USER-ID": taddyUserId, "X-API-KEY": taddyApiKey },
        body: JSON.stringify({ query: "{ getTranscriptCreditsRemaining }" }),
      });
      const creditsData2 = await creditsRes2.json();
      const creditsAfter = creditsData2?.data?.getTranscriptCreditsRemaining ?? "unknown";

      res.write(JSON.stringify({
        type: "done",
        totalDownloaded,
        totalAlreadyCached,
        totalNoTranscript,
        totalErrors,
        creditsUsed: typeof creditsRemaining === "number" && typeof creditsAfter === "number" ? creditsRemaining - creditsAfter : "unknown",
        creditsRemaining: creditsAfter,
      }) + "\n");
      res.end();
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ message: err?.message || "Failed" });
      } else {
        res.write(JSON.stringify({ type: "fatal_error", error: err?.message }) + "\n");
        res.end();
      }
    }
  });

  app.post("/api/admin/backfill-apple-ratings", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const allPodcasts = await storage.getPodcastDirectory();
      const withItunesId = allPodcasts.filter(p => p.itunesId);
      let updated = 0;
      let failed = 0;
      const results: { name: string; rating: string | null; count: number | null }[] = [];

      for (let i = 0; i < withItunesId.length; i++) {
        const podcast = withItunesId[i];
        try {
          const url = `https://podcasts.apple.com/us/podcast/id${podcast.itunesId}`;
          const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
          });
          if (!response.ok) {
            failed++;
            continue;
          }
          const html = await response.text();
          const ratingMatch = html.match(/"ratingValue"[:\s]*"?([0-9.]+)/);
          const reviewMatch = html.match(/"reviewCount"[:\s]*"?([0-9,]+)/);

          const rating = ratingMatch ? ratingMatch[1] : null;
          const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, '')) : null;

          if (rating || reviewCount) {
            const client = await pool.connect();
            try {
              await client.query(
                `UPDATE podcast_directory SET apple_rating = $1, apple_rating_count = $2, updated_at = NOW() WHERE itunes_id = $3`,
                [rating, reviewCount, podcast.itunesId]
              );
            } finally { client.release(); }
            updated++;
            results.push({ name: podcast.name, rating, count: reviewCount });
          }

          if (i % 5 === 4) await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
          failed++;
          console.error(`[AppleRatings] Failed for ${podcast.name}:`, err);
        }
      }

      res.json({ updated, failed, total: withItunesId.length, results });
    } catch (err) {
      console.error("[AppleRatings] Error:", err);
      res.status(500).json({ error: "Failed to backfill ratings" });
    }
  });

  app.post("/api/admin/bulk-generate-recaps", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { ITUNES_ID_TO_SLUG, SLUG_TO_ITUNES_ID } = await import("./podcastLandingMap");
      const podcastLandingDataModule = await import("../client/src/data/podcastLandingData");
      const PODCAST_LANDINGS = podcastLandingDataModule.PODCAST_LANDINGS;

      const TARGET = 25;
      const { slugFilter, batchSize: batchSizeParam } = req.body || {};
      const batchSize = Math.min(batchSizeParam || 5, 20);

      const { pool: dbPool } = await import("./db");
      const client = await dbPool.connect();
      let existingRecapCounts: Record<string, number> = {};
      let existingRecapKeys: Set<string> = new Set();
      try {
        const { rows } = await client.query(`SELECT slug, COUNT(*)::int as cnt FROM landing_page_recaps GROUP BY slug`);
        for (const r of rows) existingRecapCounts[r.slug] = r.cnt;
        const { rows: keyRows } = await client.query(`SELECT slug, episode_title FROM landing_page_recaps`);
        for (const r of keyRows) existingRecapKeys.add(`${r.slug}::${(r.episode_title || "").toLowerCase().trim()}`);
      } finally {
        client.release();
      }

      let allSlugs = Object.values(ITUNES_ID_TO_SLUG);
      if (slugFilter && Array.isArray(slugFilter)) {
        allSlugs = allSlugs.filter(s => slugFilter.includes(s));
      }
      const podcastsToProcess = allSlugs
        .filter(slug => (existingRecapCounts[slug] || 0) < TARGET)
        .sort((a, b) => (existingRecapCounts[a] || 0) - (existingRecapCounts[b] || 0));

      res.writeHead(200, { "Content-Type": "application/json", "Transfer-Encoding": "chunked" });
      res.write(JSON.stringify({ type: "plan", totalPodcasts: podcastsToProcess.length, phase: "recap_generation" }) + "\n");

      let totalGenerated = 0;
      let totalSkipped = 0;
      let totalErrors = 0;

      for (const slug of podcastsToProcess) {
        const itunesId = SLUG_TO_ITUNES_ID[slug];
        const existing = existingRecapCounts[slug] || 0;
        const needed = TARGET - existing;
        if (needed <= 0) continue;

        try {
          const landingConfig = PODCAST_LANDINGS.find((p: any) => p.slug === slug);
          const artworkUrl = landingConfig?.artworkUrl || "";
          const hosts = landingConfig?.hosts || "";
          const podcastName = landingConfig?.name || slug;

          const fetchLimit = Math.min(needed + existing + 10, 200);
          const lookupUrl = `https://itunes.apple.com/lookup?id=${itunesId}&media=podcast&entity=podcastEpisode&limit=${fetchLimit}&sort=recent`;
          const lookupRes = await fetch(lookupUrl);
          const lookupJson = await lookupRes.json();
          const episodes = (lookupJson.results || []).filter((r: any) => r.wrapperType === "podcastEpisode");

          if (episodes.length === 0) {
            res.write(JSON.stringify({ slug, status: "no_episodes" }) + "\n");
            totalSkipped++;
            continue;
          }

          const newEpisodes = episodes.filter((ep: any) => {
            const key = `${slug}::${(ep.trackName || "").toLowerCase().trim()}`;
            return !existingRecapKeys.has(key);
          }).slice(0, needed);

          if (newEpisodes.length === 0) {
            res.write(JSON.stringify({ slug, status: "all_exist" }) + "\n");
            totalSkipped++;
            continue;
          }

          let generatedForPodcast = 0;

          for (const ep of newEpisodes) {
            try {
              const epTitle = ep.trackName || "Untitled Episode";
              const epSlug = epTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
              const durationMs = ep.trackTimeMillis || 0;
              const durationMin = Math.round(durationMs / 60000);
              const durationStr = durationMin >= 60
                ? `${Math.floor(durationMin / 60)} hr ${durationMin % 60} min`
                : `${durationMin} minutes`;
              const releaseDate = ep.releaseDate
                ? new Date(ep.releaseDate).toISOString().split("T")[0]
                : new Date().toISOString().split("T")[0];
              const appleUrl = ep.trackViewUrl || ep.collectionViewUrl || "";

              let transcriptText: string | null = null;
              const episodeGuid = ep.episodeGuid || `${itunesId}_${ep.trackId || epTitle}`;
              const cached = await storage.getTranscriptByEpisodeGuid(episodeGuid);
              if (cached) {
                transcriptText = cached.transcript;
              } else {
                const tClient = await dbPool.connect();
                try {
                  const titleMatch = await tClient.query(
                    `SELECT transcript FROM episode_transcripts WHERE podcast_id = $1 AND episode_title ILIKE $2 LIMIT 1`,
                    [itunesId, epTitle]
                  );
                  if (titleMatch.rows.length > 0) {
                    transcriptText = titleMatch.rows[0].transcript;
                  }
                } finally {
                  tClient.release();
                }
              }

              if (!transcriptText) {
                totalSkipped++;
                res.write(JSON.stringify({ slug, episode: epTitle.slice(0, 60), status: "no_transcript" }) + "\n");
                continue;
              }

              const { generateRecapFromTranscript } = await import("./recapGenerator");
              const recap = await generateRecapFromTranscript(
                transcriptText,
                podcastName,
                epTitle,
                ep.description || ep.shortDescription || undefined
              );

              if (!recap) {
                totalErrors++;
                res.write(JSON.stringify({ slug, episode: epTitle.slice(0, 60), status: "ai_failed" }) + "\n");
                continue;
              }

              await storage.upsertLandingPageRecap({
                slug,
                itunesId,
                podcastName: recap.podcastName || podcastName,
                episodeTitle: recap.episodeTitle || epTitle,
                episodeSlug: epSlug,
                publishDate: releaseDate,
                duration: durationStr,
                artworkUrl,
                hosts,
                tldl: recap.tldl || "",
                whatHappened: recap.whatHappened,
                keyInsights: recap.keyInsights,
                quote: recap.quote || null,
                quoteAttribution: recap.quoteAttribution || null,
                appleEpisodeUrl: appleUrl || null,
                audioUrl: ep.episodeUrl || null,
                keyTopics: recap.keyTopics || null,
                topicContexts: recap.topicContexts ? JSON.stringify(recap.topicContexts) : null,
                topQuestions: recap.topQuestions ? JSON.stringify(recap.topQuestions) : null,
                guests: recap.guests ? JSON.stringify(recap.guests) : null,
                sponsors: recap.sponsors ? JSON.stringify(recap.sponsors) : null,
                resources: recap.resources ? JSON.stringify(recap.resources) : null,
              });

              generatedForPodcast++;
              totalGenerated++;
              existingRecapKeys.add(`${slug}::${epTitle.toLowerCase().trim()}`);
              res.write(JSON.stringify({
                slug,
                episode: epTitle.slice(0, 60),
                status: "success",
                hasTranscript: !!transcriptText,
                progress: `${totalGenerated} generated`,
              }) + "\n");

            } catch (epErr: any) {
              totalErrors++;
              res.write(JSON.stringify({
                slug,
                episode: ep.trackName?.slice(0, 60),
                status: "error",
                error: epErr?.message?.slice(0, 200),
              }) + "\n");
            }
            await new Promise(resolve => setTimeout(resolve, 800));
          }

          res.write(JSON.stringify({ slug, status: "podcast_done", generated: generatedForPodcast }) + "\n");
        } catch (err: any) {
          totalErrors++;
          res.write(JSON.stringify({ slug, status: "podcast_error", error: err?.message?.slice(0, 150) }) + "\n");
        }
      }

      if (totalGenerated > 0) {
        for (const c of Object.values(directoryCache)) c.invalidate();
        console.log(`[Cache] Invalidated all directory caches after ${totalGenerated} new recaps`);
      }

      res.write(JSON.stringify({ type: "done", totalGenerated, totalSkipped, totalErrors }) + "\n");
      res.end();
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ message: err?.message || "Failed" });
      } else {
        res.write(JSON.stringify({ type: "fatal_error", error: err?.message }) + "\n");
        res.end();
      }
    }
  });

  app.get("/api/admin/analytics", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const allUsers = await storage.getAllUsers();
      const allRecaps = await storage.getAllRecaps();
      const allEmailLogs = await storage.getEmailLogs();

      const totalUsers = allUsers.length;
      const totalRecaps = allRecaps.length;
      const totalEmailsSent = allEmailLogs.length;
      const proUsers = allUsers.filter(u => u.plan === "pro").length;

      const podcastCounts: Record<string, { name: string; artworkUrl: string; count: number }> = {};
      for (const user of allUsers) {
        for (const p of user.podcasts) {
          try {
            const parsed = JSON.parse(p);
            const key = parsed.id || parsed.name;
            if (!podcastCounts[key]) {
              podcastCounts[key] = { name: parsed.name, artworkUrl: parsed.artworkUrl || "", count: 0 };
            }
            podcastCounts[key].count++;
          } catch {}
        }
      }
      const topPodcasts = Object.values(podcastCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      let totalRuntimeMinutes = 0;
      for (const recap of allRecaps) {
        const match = recap.summary?.match(/\*\*(\d+)h?\s*(\d+)?m?\*\*\s*Total runtime/i)
          || recap.summary?.match(/(\d+)h\s+(\d+)m.*Total runtime/i);
        if (match) {
          const hours = parseInt(match[1] || "0", 10);
          const mins = parseInt(match[2] || "0", 10);
          totalRuntimeMinutes += hours * 60 + mins;
        } else {
          const minMatch = recap.summary?.match(/\*\*(\d+)m\*\*\s*Total runtime/i);
          if (minMatch) {
            totalRuntimeMinutes += parseInt(minMatch[1], 10);
          }
        }
      }

      const userGrowth: Record<string, number> = {};
      for (const user of allUsers) {
        if (user.createdAt) {
          const date = new Date(user.createdAt).toISOString().split("T")[0];
          userGrowth[date] = (userGrowth[date] || 0) + 1;
        }
      }
      const userGrowthSorted = Object.entries(userGrowth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));

      let cumulative = 0;
      const userGrowthCumulative = userGrowthSorted.map(({ date, count }) => {
        cumulative += count;
        return { date, newUsers: count, totalUsers: cumulative };
      });

      const emailsByDay: Record<string, number> = {};
      for (const log of allEmailLogs) {
        if (log.sentAt) {
          const date = new Date(log.sentAt).toISOString().split("T")[0];
          emailsByDay[date] = (emailsByDay[date] || 0) + 1;
        }
      }
      const emailActivity = Object.entries(emailsByDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));

      const allPendingEmails = await storage.getPendingEmails();
      const sentEmails = allPendingEmails.filter(e => e.status === "sent");
      const openedEmails = sentEmails.filter(e => e.emailOpenedAt);
      const totalSent = sentEmails.length;
      const totalOpened = openedEmails.length;
      const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;

      const openRateByDay: Record<string, { sent: number; opened: number }> = {};
      for (const email of sentEmails) {
        const date = email.sentAt
          ? new Date(email.sentAt).toISOString().split("T")[0]
          : email.recapDate;
        if (!openRateByDay[date]) openRateByDay[date] = { sent: 0, opened: 0 };
        openRateByDay[date].sent++;
        if (email.emailOpenedAt) openRateByDay[date].opened++;
      }
      const openRateTrend = Object.entries(openRateByDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, { sent, opened }]) => ({
          date,
          sent,
          opened,
          rate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
        }));

      res.json({
        totalUsers,
        totalRecaps,
        totalEmailsSent,
        proUsers,
        totalRuntimeMinutes,
        topPodcasts,
        userGrowth: userGrowthCumulative,
        emailActivity,
        emailOpenStats: { totalSent, totalOpened, openRate },
        openRateTrend,
      });
    } catch (err) {
      console.error("Analytics error:", err);
      res.status(500).json({ message: "Failed to load analytics" });
    }
  });

  app.delete("/api/admin/users/:id", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    try {
      await storage.deleteUser(userId);
      res.json({ message: "User deleted" });
    } catch (err) {
      console.error("Failed to delete user:", err);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  app.patch("/api/admin/users/:id/plan", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    const { plan } = req.body;
    if (plan !== "free" && plan !== "pro") {
      return res.status(400).json({ message: "Invalid plan. Must be 'free' or 'pro'." });
    }
    try {
      await storage.updateUser(userId, { plan });
      res.json({ message: `User ${userId} updated to ${plan} plan` });
    } catch (err) {
      console.error("Failed to update user plan:", err);
      res.status(500).json({ message: "Failed to update user plan" });
    }
  });

  app.post("/api/admin/impersonate", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    if (req.session.impersonatingUserId) {
      return res.status(400).json({ message: "Already impersonating a user. Stop impersonating first." });
    }
    const parsed = z.object({ userId: z.number() }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "userId is required" });
    }
    const user = await storage.getUserById(parsed.data.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    req.session.originalUserId = req.session.userId;
    req.session.impersonatingUserId = parsed.data.userId;
    req.session.userId = parsed.data.userId;
    req.session.save(() => {
      res.json({ message: "Now impersonating user", user });
    });
  });

  app.post("/api/admin/stop-impersonating", (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    if (!req.session.impersonatingUserId) {
      return res.status(400).json({ message: "Not currently impersonating anyone" });
    }
    req.session.userId = req.session.originalUserId;
    delete req.session.impersonatingUserId;
    delete req.session.originalUserId;
    req.session.save(() => {
      res.json({ message: "Stopped impersonating" });
    });
  });

  app.get("/api/admin/email-template", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const saved = await storage.getEmailTemplateSettings();
    const template: EmailTemplateConfig = { ...DEFAULT_TEMPLATE };
    for (const key of Object.keys(DEFAULT_TEMPLATE) as (keyof EmailTemplateConfig)[]) {
      if (saved[key] !== undefined) {
        template[key] = saved[key];
      }
    }
    res.json({ template, mergeTags: MERGE_TAGS, defaults: DEFAULT_TEMPLATE });
  });

  app.put("/api/admin/email-template", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const { template } = req.body;
    if (!template || typeof template !== "object") {
      return res.status(400).json({ message: "Invalid template data" });
    }
    const validKeys = Object.keys(DEFAULT_TEMPLATE);
    const hexColorRegex = /^#[0-9a-fA-F]{6}$/;
    const colorKeys = ["headerColor", "accentColor"];
    const toSave: Record<string, string> = {};
    for (const [key, value] of Object.entries(template)) {
      if (!validKeys.includes(key) || typeof value !== "string") continue;
      if (value.length > 500) continue;
      if (colorKeys.includes(key) && !hexColorRegex.test(value)) continue;
      if (key === "showPs" && value !== "true" && value !== "false") continue;
      toSave[key] = value;
    }
    await storage.setEmailTemplateSettings(toSave);
    res.json({ message: "Template saved" });
  });

  app.post("/api/admin/email-template/preview", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const { template } = req.body;
    const sampleMarkdown = `My First Million · The All-In Podcast\n\n**2** Podcasts · **5 hours and 32 minutes** Total duration\n\n---\n\n## MY FIRST MILLION\n\n**How This 25-Year-Old Built a $100M Business**\nJake Chen · CEO of CloudStack · 1 hr 12 min\n\n🎧 [Apple Podcasts](https://podcasts.apple.com/example) · [Spotify](https://open.spotify.com/search/example)\n\n**TLDL:** Jake Chen dropped out of college to build CloudStack, a no-code platform that now processes $2B in transactions annually.\n\n**What Happened**\nSam opens by calling Jake "the most impressive founder under 30." Jake walks through the origin story, building internal tools for his university when he realized every small business had the same problem.\n\nHe launched on Product Hunt, got 2,000 users in the first week, and was profitable by month three.\n\n**Key Insights:**\n- CloudStack processes $2B in annual transactions with only 47 employees\n- White-labeling through accounting firms drives 40% of revenue\n- The no-code market is projected to hit $187B by 2030\n\n**Quote**\nJake Chen on turning down $50M:\n> "Everyone told me I was crazy. But I looked at every founder who sold early and asked one question: are you happier? Not one said yes."\n\n---`;
    const config: Partial<EmailTemplateConfig> = template || {};
    const html = markdownToEmailHtml(sampleMarkdown, "preview@example.com", config);
    res.json({ html });
  });

  app.get("/api/podcast-directory/by-itunes/:itunesId", async (req, res) => {
    const entry = await storage.getPodcastDirectoryEntry(req.params.itunesId);
    if (!entry) return res.json(null);
    res.json({ twitterHandle: entry.twitterHandle, hostHandle: entry.hostHandle });
  });

  app.get("/api/podcasts/by-slug/:slug", async (req, res) => {
    const entry = await storage.getPodcastDirectoryBySlug(req.params.slug);
    if (!entry) return res.json(null);
    res.json(entry);
  });

  app.get("/api/admin/podcast-directory", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const entries = await storage.getPodcastDirectory();
    res.json(entries);
  });

  app.post("/api/admin/podcast-directory", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const b = req.body;
      const trimmedId = typeof b.itunesId === "string" ? b.itunesId.trim() : "";
      const trimmedName = typeof b.name === "string" ? b.name.trim() : "";
      if (!trimmedId || !trimmedName) {
        return res.status(400).json({ message: "itunesId and name are required" });
      }
      if (!/^\d+$/.test(trimmedId)) {
        return res.status(400).json({ message: "itunesId must be a numeric string" });
      }
      const trimStr = (v: any) => typeof v === "string" && v.trim() ? v.trim() : null;
      const parseOptInt = (v: any) => {
        if (v === undefined || v === null || v === "") return undefined;
        const n = Number(v);
        return Number.isInteger(n) && n >= 0 ? n : undefined;
      };
      const data: any = { itunesId: trimmedId, name: trimmedName };
      if ("slug" in b) data.slug = trimStr(b.slug);
      if ("hosts" in b) data.hosts = trimStr(b.hosts);
      if ("category" in b) data.category = trimStr(b.category);
      if ("description" in b) data.description = trimStr(b.description);
      if ("keywords" in b) data.keywords = trimStr(b.keywords);
      if ("faqTopics" in b) data.faqTopics = trimStr(b.faqTopics);
      if ("artworkUrl" in b) data.artworkUrl = trimStr(b.artworkUrl);
      if ("appleUrl" in b) data.appleUrl = trimStr(b.appleUrl);
      if ("spotifyUrl" in b) data.spotifyUrl = trimStr(b.spotifyUrl);
      if ("youtubeUrl" in b) data.youtubeUrl = trimStr(b.youtubeUrl);
      if ("twitterHandle" in b) data.twitterHandle = trimStr(b.twitterHandle);
      if ("instagramUrl" in b) data.instagramUrl = trimStr(b.instagramUrl);
      if ("tiktokUrl" in b) data.tiktokUrl = trimStr(b.tiktokUrl);
      if ("facebookUrl" in b) data.facebookUrl = trimStr(b.facebookUrl);
      if ("discordUrl" in b) data.discordUrl = trimStr(b.discordUrl);
      if ("websiteUrl" in b) data.websiteUrl = trimStr(b.websiteUrl);
      if ("storeUrl" in b) data.storeUrl = trimStr(b.storeUrl);
      if ("hostHandle" in b) data.hostHandle = trimStr(b.hostHandle);
      if ("followers" in b) data.followers = parseOptInt(b.followers) ?? null;
      if ("avgEpisodeLength" in b) data.avgEpisodeLength = parseOptInt(b.avgEpisodeLength) ?? null;
      if ("frequency" in b) data.frequency = trimStr(b.frequency);
      if ("totalEpisodes" in b) data.totalEpisodes = parseOptInt(b.totalEpisodes) ?? null;
      if ("yearStarted" in b) data.yearStarted = parseOptInt(b.yearStarted) ?? null;
      if ("knownFor" in b) data.knownFor = Array.isArray(b.knownFor) ? b.knownFor : undefined;
      if ("hostBios" in b) data.hostBios = b.hostBios || undefined;
      if ("relatedSlugs" in b) data.relatedSlugs = Array.isArray(b.relatedSlugs) ? b.relatedSlugs : undefined;
      if ("aboutPodcast" in b) data.aboutPodcast = trimStr(b.aboutPodcast);
      if ("hasLandingPage" in b) data.hasLandingPage = typeof b.hasLandingPage === "boolean" ? b.hasLandingPage : false;

      const entry = await storage.upsertPodcastDirectoryEntry(data);
      res.json(entry);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to save podcast directory entry" });
    }
  });

  app.delete("/api/admin/podcast-directory/:id", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid id" });
      }
      await storage.deletePodcastDirectoryEntry(id);
      res.json({ message: "Deleted" });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to delete entry" });
    }
  });

  app.get("/api/admin/rss-feeds", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const feeds = await storage.getRssFeeds();
      res.json(feeds);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch RSS feeds" });
    }
  });

  app.post("/api/admin/rss-feeds", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { name, slugKey, podcastSlugs } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "Feed name is required" });
      }
      if (!slugKey || typeof slugKey !== "string" || !slugKey.trim()) {
        return res.status(400).json({ message: "URL slug is required" });
      }
      if (!podcastSlugs || !Array.isArray(podcastSlugs)) {
        return res.status(400).json({ message: "podcastSlugs must be an array" });
      }
      const validSlugs = podcastSlugs.filter((s: any) => typeof s === "string" && s.trim());
      if (validSlugs.length === 0) {
        return res.status(400).json({ message: "At least one podcast slug is required" });
      }
      const cleanSlugKey = slugKey.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      if (!cleanSlugKey) {
        return res.status(400).json({ message: "Invalid slug key" });
      }
      const feed = await storage.createRssFeed({ name: name.trim(), slugKey: cleanSlugKey, podcastSlugs: validSlugs });
      res.json(feed);
    } catch (err: any) {
      if (err.code === "23505") {
        return res.status(409).json({ message: "A feed with this slug key already exists" });
      }
      res.status(500).json({ message: "Failed to create RSS feed" });
    }
  });

  app.patch("/api/admin/rss-feeds/:id", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid id" });
      }
      const updates: any = {};
      if (req.body.name && typeof req.body.name === "string") updates.name = req.body.name.trim();
      if (req.body.podcastSlugs && Array.isArray(req.body.podcastSlugs)) {
        const slugs = req.body.podcastSlugs.filter((s: any) => typeof s === "string" && s.trim());
        if (slugs.length === 0) {
          return res.status(400).json({ message: "At least one podcast slug is required" });
        }
        updates.podcastSlugs = slugs;
      }
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No valid updates provided" });
      }
      const feed = await storage.updateRssFeed(id, updates);
      if (!feed) {
        return res.status(404).json({ message: "Feed not found" });
      }
      res.json(feed);
    } catch (err) {
      res.status(500).json({ message: "Failed to update RSS feed" });
    }
  });

  app.delete("/api/admin/rss-feeds/:id", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid id" });
      }
      await storage.deleteRssFeed(id);
      res.json({ message: "Deleted" });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete RSS feed" });
    }
  });

  app.get("/api/auth/impersonation-status", (req, res) => {
    if (req.session.isAdmin && req.session.impersonatingUserId) {
      res.json({ impersonating: true, userId: req.session.impersonatingUserId });
    } else {
      res.json({ impersonating: false });
    }
  });

  app.post(api.users.update.path, async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const input = api.users.update.input.parse(req.body);
      const updated = await storage.updateUser(req.session.userId, input);

      if (input.podcasts && input.podcasts.length > 0) {
        autoPopulateDirectory(input.podcasts).catch(() => {});
      }

      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  app.get("/api/stripe/publishable-key", async (_req, res) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (err) {
      console.error("Failed to get Stripe publishable key:", err);
      res.status(500).json({ message: "Stripe not configured" });
    }
  });

  app.post("/api/stripe/create-checkout", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await storage.getUserById(req.session.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    try {
      const stripe = await getUncachableStripeClient();

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: String(user.id) },
        });
        await storage.updateUserStripeInfo(user.id, { stripeCustomerId: customer.id });
        customerId = customer.id;
      }

      const products = await stripe.products.search({ query: "name:'PodCap Pro'" });
      const proProduct = products.data.find(p => p.active);

      if (!proProduct) {
        return res.status(500).json({ message: "No Pro plan found. Please contact support." });
      }

      const pricesResult = await stripe.prices.list({ product: proProduct.id, active: true, limit: 5 });
      const proPrice = pricesResult.data.find(p => p.recurring?.interval === "month");

      if (!proPrice) {
        return res.status(500).json({ message: "No Pro plan price found. Please contact support." });
      }

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{ price: proPrice.id, quantity: 1 }],
        mode: "subscription",
        success_url: `${baseUrl}/dashboard?upgraded=true`,
        cancel_url: `${baseUrl}/upgrade`,
      });

      res.json({ url: session.url });
    } catch (err: any) {
      console.error("Checkout error:", err);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  app.get("/api/stripe/subscription", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await storage.getUserById(req.session.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.stripeSubscriptionId) {
      return res.json({ subscription: null, plan: user.plan || "free" });
    }

    try {
      const subscription = await storage.getSubscription(user.stripeSubscriptionId);
      res.json({ subscription, plan: user.plan || "free" });
    } catch {
      res.json({ subscription: null, plan: user.plan || "free" });
    }
  });

  app.post("/api/stripe/portal", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await storage.getUserById(req.session.userId);
    if (!user || !user.stripeCustomerId) {
      return res.status(400).json({ message: "No billing account found" });
    }

    try {
      const stripe = await getUncachableStripeClient();
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${baseUrl}/dashboard`,
      });
      res.json({ url: portalSession.url });
    } catch (err: any) {
      console.error("Portal error:", err);
      res.status(500).json({ message: "Failed to create billing portal session" });
    }
  });

  app.post("/api/stripe/cancel-subscription", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await storage.getUserById(req.session.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const podcastCount = user.podcasts?.length || 0;
    if (podcastCount > 3) {
      return res.status(400).json({
        message: `Please remove ${podcastCount - 3} podcast${podcastCount - 3 > 1 ? "s" : ""} before canceling. The free plan supports up to 3 podcasts.`,
        podcastCount,
      });
    }

    if (!user.stripeSubscriptionId) {
      if (user.plan === "pro") {
        await storage.updateUserStripeInfo(user.id, { plan: "free", stripeSubscriptionId: undefined });
        return res.json({ success: true, message: "Subscription canceled" });
      }
      return res.status(400).json({ message: "No active subscription found" });
    }

    try {
      const stripe = await getUncachableStripeClient();
      await stripe.subscriptions.cancel(user.stripeSubscriptionId);
      await storage.updateUserStripeInfo(user.id, {
        stripeSubscriptionId: undefined,
        plan: "free",
      });
      const updatedUser = await storage.getUserById(user.id);
      res.json({ success: true, user: updatedUser });
    } catch (err: any) {
      console.error("Cancel subscription error:", err);
      res.status(500).json({ message: "Failed to cancel subscription" });
    }
  });

  app.get("/api/stripe/payment-method", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUserById(req.session.userId);
    if (!user || !user.stripeCustomerId) {
      return res.json({ paymentMethod: null });
    }
    try {
      const stripe = await getUncachableStripeClient();
      const paymentMethods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: "card",
        limit: 1,
      });
      const pm = paymentMethods.data[0];
      if (!pm || !pm.card) {
        return res.json({ paymentMethod: null });
      }
      res.json({
        paymentMethod: {
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year,
        },
      });
    } catch (err: any) {
      console.error("Payment method error:", err);
      res.json({ paymentMethod: null });
    }
  });

  app.get("/api/stripe/invoices", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUserById(req.session.userId);
    if (!user || !user.stripeCustomerId) {
      return res.json({ invoices: [] });
    }
    try {
      const stripe = await getUncachableStripeClient();
      const invoices = await stripe.invoices.list({
        customer: user.stripeCustomerId,
        limit: 12,
      });
      res.json({
        invoices: invoices.data.map((inv) => ({
          id: inv.id,
          date: inv.created,
          amount: inv.amount_paid,
          currency: inv.currency,
          status: inv.status,
          invoiceUrl: inv.hosted_invoice_url,
        })),
      });
    } catch (err: any) {
      console.error("Invoices error:", err);
      res.json({ invoices: [] });
    }
  });

  app.post("/api/stripe/sync-subscription", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await storage.getUserById(req.session.userId);
    if (!user || !user.stripeCustomerId) {
      return res.json({ plan: "free" });
    }

    try {
      const stripe = await getUncachableStripeClient();
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: "active",
        limit: 10,
      });

      const products = await stripe.products.search({ query: "name:'PodCap Pro'" });
      const proProductId = products.data.find(p => p.active)?.id;

      const activeSub = subscriptions.data.find(sub =>
        sub.items.data.some(item => {
          const price = item.price;
          return price.product === proProductId;
        })
      );

      if (activeSub) {
        await storage.updateUserStripeInfo(user.id, {
          stripeSubscriptionId: activeSub.id,
          plan: "pro",
        });
        const updatedUser = await storage.getUserById(user.id);
        return res.json({ plan: "pro", user: updatedUser });
      } else {
        if (user.plan === "pro") {
          await storage.updateUserStripeInfo(user.id, {
            stripeSubscriptionId: undefined,
            plan: "free",
          });
        }
        return res.json({ plan: "free" });
      }
    } catch (err) {
      console.error("Sync subscription error:", err);
      res.json({ plan: user.plan || "free" });
    }
  });

  app.get("/api/admin/backfill-status", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const client = await pool.connect();
      try {
        const { rows: podcasts } = await client.query(
          `SELECT pd.itunes_id, pd.name, pd.taddy_uuid,
                  COALESCE(pd.total_episodes, 0)::int as total_episodes,
                  COALESCE(tc.transcript_count, 0)::int as transcript_count,
                  COALESCE(tc.complete_count, 0)::int as complete_count
           FROM podcast_directory pd
           LEFT JOIN (
             SELECT podcast_id, COUNT(*)::int as transcript_count,
                    SUM(CASE WHEN complete_record = true THEN 1 ELSE 0 END)::int as complete_count
             FROM episode_transcripts
             GROUP BY podcast_id
           ) tc ON pd.itunes_id = tc.podcast_id
           ORDER BY pd.name ASC`
        );
        let backfillStatus: { currentIndex: number; currentName: string; totalPodcasts: number; processedNames: string[]; podcastResults?: Record<string, { name: string; error?: string }>; running: boolean } | null = null;
        try {
          const raw = readFileSync("/tmp/backfill_status.json", "utf-8");
          backfillStatus = JSON.parse(raw);
        } catch {}

        const processedSet = new Set(backfillStatus?.processedNames || []);
        const isBackfillRunning = backfillStatus?.running === true;
        const podcastResults = backfillStatus?.podcastResults || {};

        res.json({
          podcasts: podcasts.map((p, i) => {
            let status: string;
            let error: string | undefined;
            const result = podcastResults[p.name];

            const TARGET = 100;
            const closeEnough = p.total_episodes > 0 && p.transcript_count > 0 && p.transcript_count >= p.total_episodes * 0.9;
            if (closeEnough && p.complete_count > 0 && p.complete_count >= p.transcript_count * 0.9) {
              status = "complete_record";
            } else if (p.transcript_count >= TARGET) {
              status = "done";
            } else if (!p.taddy_uuid) {
              status = "no_taddy";
              error = "Podcast not found on Taddy";
            } else if (isBackfillRunning && backfillStatus?.currentName === p.name) {
              status = "in_process";
            } else if (isBackfillRunning && !processedSet.has(p.name) && backfillStatus?.currentName !== p.name) {
              status = "in_queue";
            } else if (result?.error) {
              status = "error";
              error = result.error;
            } else if (processedSet.has(p.name)) {
              status = p.transcript_count > 0 ? "partial" : "error";
              error = p.transcript_count > 0 ? undefined : `Only ${p.transcript_count} of ${TARGET} transcripts available on Taddy`;
            } else {
              status = "in_queue";
            }
            const totalEpisodes = p.total_episodes || 0;
            return {
              index: i + 1,
              name: p.name,
              itunesId: p.itunes_id,
              hasTaddyUuid: !!p.taddy_uuid,
              transcriptCount: p.transcript_count,
              completeCount: p.complete_count,
              totalEpisodes,
              target: TARGET,
              remaining: Math.max(0, TARGET - p.transcript_count),
              status,
              error,
            };
          }),
          totalTranscripts: podcasts.reduce((sum, p) => sum + (p.transcript_count || 0), 0),
          totalPodcasts: podcasts.length,
          podcastsComplete: podcasts.filter(p => (p.transcript_count || 0) >= 100).length,
          backfillRunning: isBackfillRunning,
          backfillCurrentName: backfillStatus?.currentName || null,
          backfillCurrentIndex: backfillStatus?.currentIndex || null,
        });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Backfill status error:", err);
      res.status(500).json({ message: "Failed to fetch backfill status" });
    }
  });

  app.get("/api/admin/episode-pages-status", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const client = await pool.connect();
      try {
        const { rows: podcasts } = await client.query(
          `SELECT 
             pd.itunes_id,
             pd.name,
             COALESCE(et.transcript_count, 0)::int as transcript_count,
             COALESCE(et.complete_count, 0)::int as complete_transcript_count,
             COALESCE(lpr.recap_count, 0)::int as recap_count,
             COALESCE(lpr.complete_recap_count, 0)::int as complete_recap_count,
             COALESCE(lpr.has_tldl, 0)::int as has_tldl,
             COALESCE(lpr.has_what_happened, 0)::int as has_what_happened,
             COALESCE(lpr.has_insights, 0)::int as has_insights,
             COALESCE(lpr.has_quote, 0)::int as has_quote,
             COALESCE(lpr.has_topics, 0)::int as has_topics,
             COALESCE(lpr.has_questions, 0)::int as has_questions,
             COALESCE(lpr.has_guests, 0)::int as has_guests
           FROM podcast_directory pd
           LEFT JOIN (
             SELECT podcast_id, 
                    COUNT(*)::int as transcript_count,
                    SUM(CASE WHEN complete_record = true THEN 1 ELSE 0 END)::int as complete_count
             FROM episode_transcripts
             GROUP BY podcast_id
           ) et ON pd.itunes_id = et.podcast_id
           LEFT JOIN (
             SELECT itunes_id,
                    COUNT(*)::int as recap_count,
                    SUM(CASE WHEN
                      (tldl IS NOT NULL AND tldl != '')
                      AND (what_happened IS NOT NULL AND what_happened != '')
                      AND (key_insights IS NOT NULL AND array_length(key_insights, 1) > 0)
                      AND (quote IS NOT NULL AND quote != '')
                      AND (key_topics IS NOT NULL AND array_length(key_topics, 1) > 0)
                      AND (top_questions IS NOT NULL AND top_questions != '')
                      AND (guests IS NOT NULL AND guests != '')
                    THEN 1 ELSE 0 END)::int as complete_recap_count,
                    SUM(CASE WHEN tldl IS NOT NULL AND tldl != '' THEN 1 ELSE 0 END)::int as has_tldl,
                    SUM(CASE WHEN what_happened IS NOT NULL AND what_happened != '' THEN 1 ELSE 0 END)::int as has_what_happened,
                    SUM(CASE WHEN key_insights IS NOT NULL AND array_length(key_insights, 1) > 0 THEN 1 ELSE 0 END)::int as has_insights,
                    SUM(CASE WHEN quote IS NOT NULL AND quote != '' THEN 1 ELSE 0 END)::int as has_quote,
                    SUM(CASE WHEN key_topics IS NOT NULL AND array_length(key_topics, 1) > 0 THEN 1 ELSE 0 END)::int as has_topics,
                    SUM(CASE WHEN top_questions IS NOT NULL AND top_questions != '' THEN 1 ELSE 0 END)::int as has_questions,
                    SUM(CASE WHEN guests IS NOT NULL AND guests != '' THEN 1 ELSE 0 END)::int as has_guests
             FROM landing_page_recaps
             GROUP BY itunes_id
           ) lpr ON pd.itunes_id = lpr.itunes_id
           WHERE COALESCE(et.transcript_count, 0) > 0
           ORDER BY pd.name ASC`
        );

        const totalTranscripts = podcasts.reduce((s, p) => s + p.transcript_count, 0);
        const totalCompleteRecaps = podcasts.reduce((s, p) => s + p.complete_recap_count, 0);
        const totalRecaps = podcasts.reduce((s, p) => s + p.recap_count, 0);
        const totalRemaining = Math.max(0, totalTranscripts - totalCompleteRecaps);

        const currentProcessingId = epGenState.running ? epGenState.currentItunesId : null;

        res.json({
          podcasts: podcasts.map((p) => {
            const remaining = Math.max(0, p.transcript_count - p.complete_recap_count);
            const pct = p.transcript_count > 0 ? Math.round((p.complete_recap_count / p.transcript_count) * 100) : 0;
            let status: string;
            if (currentProcessingId === p.itunes_id) {
              status = "processing";
            } else if (p.transcript_count > 0 && p.complete_recap_count >= p.transcript_count) {
              status = "complete";
            } else {
              status = "incomplete";
            }
            return {
              name: p.name,
              itunesId: p.itunes_id,
              transcriptCount: p.transcript_count,
              completeTranscriptCount: p.complete_transcript_count,
              recapCount: p.recap_count,
              completeRecapCount: p.complete_recap_count,
              remaining,
              pct,
              status,
              quality: {
                tldl: p.has_tldl,
                whatHappened: p.has_what_happened,
                insights: p.has_insights,
                quote: p.has_quote,
                topics: p.has_topics,
                questions: p.has_questions,
                guests: p.has_guests,
              },
            };
          }),
          totalTranscripts,
          totalRecaps,
          totalCompleteRecaps,
          totalRemaining,
          totalPodcasts: podcasts.length,
          podcastsComplete: podcasts.filter(p => p.complete_recap_count >= p.transcript_count && p.transcript_count > 0 && (currentProcessingId !== p.itunes_id)).length,
          podcastsIncomplete: podcasts.filter(p => (p.complete_recap_count < p.transcript_count || p.transcript_count === 0) && (currentProcessingId !== p.itunes_id)).length,
          podcastsProcessing: currentProcessingId ? 1 : 0,
        });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Episode pages status error:", err);
      res.status(500).json({ message: "Failed to fetch episode pages status" });
    }
  });

  // Episode pages generation - concurrent processing
  let epGenState = {
    running: false,
    autoQueue: false,
    currentItunesId: null as string | null,
    currentPodcastName: null as string | null,
    currentEpisode: 0,
    totalEpisodes: 0,
    generated: 0,
    failed: 0,
    skipped: 0,
    concurrency: 3,
    episodesPerSecond: 0,
    startedAt: null as number | null,
    completedPodcasts: [] as string[],
    autoQueueLimit: null as number | null,
  };

  app.get("/api/admin/episode-pages-generate/status", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated" });
    const elapsed = epGenState.startedAt ? (Date.now() - epGenState.startedAt) / 1000 : 0;
    const done = epGenState.generated + epGenState.failed + epGenState.skipped;
    const eps = elapsed > 0 ? done / elapsed : 0;
    const remaining = epGenState.totalEpisodes - done;
    const etaMinutes = eps > 0 ? Math.round(remaining / eps / 60) : null;
    res.json({ ...epGenState, episodesPerSecond: Math.round(eps * 100) / 100, etaMinutes });
  });

  app.get("/api/admin/episode-pages-qa", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated" });
    const { validateRecap } = await import("./recapGenerator");
    const podcastSlug = (req.query.slug as string) || null;
    const limit = parseInt(req.query.limit as string) || 20;

    const whereClause = podcastSlug ? `WHERE lpr.slug = $1` : ``;
    const params = podcastSlug ? [podcastSlug] : [];

    const { rows: recaps } = await pool.query(
      `SELECT lpr.slug, lpr.episode_title, lpr.episode_slug, lpr.tldl, lpr.what_happened,
              lpr.key_insights, lpr.quote, lpr.quote_attribution, lpr.key_topics,
              lpr.top_questions, lpr.guests, lpr.hosts,
              (SELECT count(*)::int FROM episode_quotes eq WHERE eq.podcast_slug = lpr.slug AND eq.episode_slug = lpr.episode_slug) as quote_count,
              (SELECT count(*)::int FROM podcast_hosts ph WHERE ph.podcast_slug = lpr.slug) as host_count
       FROM landing_page_recaps lpr
       ${whereClause}
       ORDER BY lpr.publish_date DESC
       LIMIT ${limit}`,
      params
    );

    const results = recaps.map(r => {
      let keyInsights: string[] = [];
      if (typeof r.key_insights === "string") {
        try { keyInsights = JSON.parse(r.key_insights); } catch { keyInsights = r.key_insights.split("\n").filter(Boolean); }
      } else if (Array.isArray(r.key_insights)) {
        keyInsights = r.key_insights;
      }

      let topQuestions: any[] = [];
      if (r.top_questions) {
        try { topQuestions = typeof r.top_questions === "string" ? JSON.parse(r.top_questions) : r.top_questions; } catch {}
      }

      let keyTopics: string[] = [];
      if (typeof r.key_topics === "string") {
        try { keyTopics = JSON.parse(r.key_topics); } catch { keyTopics = r.key_topics.split(",").map((s: string) => s.trim()); }
      } else if (Array.isArray(r.key_topics)) {
        keyTopics = r.key_topics;
      }

      let guests: any[] = [];
      if (r.guests) {
        try { guests = typeof r.guests === "string" ? JSON.parse(r.guests) : r.guests; } catch {}
      }

      const qa = validateRecap({
        tldl: r.tldl,
        whatHappened: r.what_happened,
        keyInsights,
        quote: r.quote,
        quoteAttribution: r.quote_attribution,
        keyTopics,
        topQuestions,
        guests,
      }, r.episode_title, r.quote_count);

      if (r.host_count === 0) {
        qa.issues.push({ field: "hosts", severity: "critical", message: "No hosts in podcast_hosts table" });
        qa.passed = false;
      }

      return {
        slug: r.slug,
        episodeTitle: r.episode_title,
        episodeSlug: r.episode_slug,
        passed: qa.passed,
        quoteCount: r.quote_count,
        hostCount: r.host_count,
        guestCount: guests.length,
        issues: qa.issues,
      };
    });

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const criticalIssues = results.flatMap(r => r.issues.filter(i => i.severity === "critical"));

    res.json({
      total: results.length,
      passed,
      failed,
      passRate: `${Math.round(passed / results.length * 100)}%`,
      topCriticalIssues: Object.entries(
        criticalIssues.reduce((acc: Record<string, number>, i) => {
          acc[i.message] = (acc[i.message] || 0) + 1;
          return acc;
        }, {})
      ).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 10),
      results,
    });
  });

  app.post("/api/admin/episode-pages-generate/stop", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated" });
    epGenState.autoQueue = false;
    epGenState.running = false;
    res.json({ stopped: true });
  });

  async function postProcessRecap(opts: {
    transcript: string;
    podcastSlug: string;
    episodeSlug: string;
    podcastName: string;
    episodeTitle: string;
    itunesId: string;
    hosts: string | null;
    guests: any[] | null;
    resources: any[] | null;
    recapId?: number;
  }) {
    const { transcript, podcastSlug, episodeSlug, podcastName, episodeTitle, itunesId, hosts, guests, resources } = opts;

    try {
      const episodeGuid = `${itunesId}_${episodeSlug}`;
      const hasSegs = await storage.hasTranscriptSegments(episodeGuid);
      if (!hasSegs) {
        const { parseTranscriptToSegments } = await import("./transcriptParser");
        const segments = parseTranscriptToSegments(transcript, podcastSlug, episodeSlug, episodeGuid);
        if (segments.length > 0) {
          await storage.saveTranscriptSegments(segments);
        }
      }
    } catch (err) {
      console.warn(`[PostProcess] Segment save failed for "${episodeTitle}":`, err);
    }

    try {
      const existingQuotes = await storage.getEpisodeQuotes(podcastSlug, episodeSlug);
      if (existingQuotes.length === 0) {
        const { extractQuotesFromTranscript } = await import("./recapGenerator");
        const extractedQuotes = await extractQuotesFromTranscript(
          transcript, podcastName, episodeTitle, hosts,
          guests ? JSON.stringify(guests) : null
        );
        if (extractedQuotes.length > 0) {
          const quotesToSave = extractedQuotes.map((q) => ({
            podcastSlug,
            episodeSlug,
            speakerName: q.speakerName,
            speakerRole: q.speakerRole || null,
            quoteText: q.quoteText,
            context: q.context,
            quoteType: q.quoteType,
          }));
          await storage.saveEpisodeQuotes(quotesToSave);
          console.log(`[PostProcess] Extracted ${extractedQuotes.length} quotes for "${episodeTitle}"`);
        }
      }
    } catch (err) {
      console.warn(`[PostProcess] Quote extraction failed for "${episodeTitle}":`, err);
    }

    if (resources && resources.length > 0) {
      try {
        const books = resources.filter((r: any) => r.type === "book" && r.name);
        for (const book of books) {
          const { rows: existing } = await pool.query(
            `SELECT id FROM book_enrichments WHERE lower(book_title) = lower($1) LIMIT 1`,
            [book.name]
          );
          if (existing.length === 0) {
            const slug = book.name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").trim();
            const bookKey = book.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
            await pool.query(
              `INSERT INTO book_enrichments (book_key, book_title, author, slug, amazon_url, description)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (slug) DO NOTHING`,
              [bookKey, book.name, book.author || null, slug, book.url || null, book.description || book.context || null]
            );
            console.log(`[PostProcess] Enriched book: "${book.name}"`);
          }
        }
      } catch (err) {
        console.warn(`[PostProcess] Book enrichment failed for "${episodeTitle}":`, err);
      }
    }
  }

  async function processOneEpisode(
    t: any,
    podcastSlug: string,
    itunesId: string,
    podcastName: string,
    hosts: string,
    podcastArtwork: string,
    forceRegenerate: boolean,
    generateRecapFn: typeof import("./recapGenerator").generateRecapFromTranscript,
  ) {
    const { validateRecap } = await import("./recapGenerator");
    const epTitle = t.episode_title || "Untitled";
    const epSlug = epTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

    const client = await pool.connect();
    try {
      if (!forceRegenerate) {
        const { rows: existing } = await client.query(
          `SELECT id FROM landing_page_recaps WHERE itunes_id = $1 AND episode_slug = $2 LIMIT 1`,
          [itunesId, epSlug]
        );
        if (existing.length > 0) {
          return "skipped";
        }
      }

      const maxAttempts = 2;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const recap = await generateRecapFn(t.transcript, podcastName, epTitle, t.description || null);
        if (!recap) {
          if (attempt < maxAttempts) {
            console.log(`[QA] Recap generation returned null for "${epTitle}", retrying (${attempt}/${maxAttempts})...`);
            continue;
          }
          console.log(`[QA] FAIL: Could not generate recap for "${epTitle}" after ${maxAttempts} attempts`);
          return "failed";
        }

        const publishDate = t.date_published
          ? new Date(t.date_published * 1000).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];

        const durationSec = t.duration || 0;
        const durationMin = Math.round(durationSec / 60);
        const durationStr = durationMin >= 60
          ? `${Math.floor(durationMin / 60)} hr ${durationMin % 60} min`
          : `${durationMin} minutes`;

        await client.query(
          `INSERT INTO landing_page_recaps
           (slug, itunes_id, podcast_name, episode_title, episode_slug, publish_date, duration, artwork_url, hosts, tldl, what_happened, key_insights, quote, quote_attribution, key_topics, topic_contexts, top_questions, audio_url, sponsors, guests, resources)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
           ON CONFLICT (slug, episode_slug) DO UPDATE SET
             tldl = EXCLUDED.tldl, what_happened = EXCLUDED.what_happened, key_insights = EXCLUDED.key_insights,
             quote = EXCLUDED.quote, quote_attribution = EXCLUDED.quote_attribution, key_topics = EXCLUDED.key_topics,
             topic_contexts = EXCLUDED.topic_contexts, top_questions = EXCLUDED.top_questions, audio_url = EXCLUDED.audio_url,
             sponsors = EXCLUDED.sponsors, guests = EXCLUDED.guests, resources = EXCLUDED.resources`,
          [
            podcastSlug, itunesId, podcastName, epTitle, epSlug, publishDate,
            durationStr, t.image_url || podcastArtwork, hosts,
            recap.tldl, recap.whatHappened,
            recap.keyInsights, recap.quote, recap.quoteAttribution,
            recap.keyTopics,
            recap.topicContexts ? JSON.stringify(recap.topicContexts) : null,
            recap.topQuestions ? JSON.stringify(recap.topQuestions) : null,
            t.audio_url || "",
            recap.sponsors ? JSON.stringify(recap.sponsors) : "[]",
            recap.guests ? JSON.stringify(recap.guests) : "[]",
            recap.resources ? JSON.stringify(recap.resources) : "[]",
          ]
        );

        await postProcessRecap({
          transcript: t.transcript,
          podcastSlug, episodeSlug: epSlug, podcastName, episodeTitle: epTitle,
          itunesId, hosts,
          guests: recap.guests || null,
          resources: recap.resources || null,
        });

        const quoteCount = (await storage.getEpisodeQuotes(podcastSlug, epSlug)).length;
        const qa = validateRecap(recap, epTitle, quoteCount);

        if (qa.passed) {
          const warnings = qa.issues.filter(i => i.severity === "warning");
          if (warnings.length > 0) {
            console.log(`[QA] PASS with ${warnings.length} warning(s) for "${epTitle.slice(0, 50)}": ${warnings.map(w => w.message).join("; ")}`);
          }
          return "generated";
        }

        const criticals = qa.issues.filter(i => i.severity === "critical");
        if (attempt < maxAttempts) {
          console.log(`[QA] RETRY (${attempt}/${maxAttempts}) for "${epTitle.slice(0, 50)}": ${criticals.map(c => c.message).join("; ")}`);
          await pool.query(`DELETE FROM episode_quotes WHERE podcast_slug = $1 AND episode_slug = $2`, [podcastSlug, epSlug]);
          await pool.query(`DELETE FROM landing_page_recaps WHERE slug = $1 AND episode_slug = $2`, [podcastSlug, epSlug]);
          continue;
        }

        console.warn(`[QA] ACCEPTED with ${criticals.length} critical issue(s) for "${epTitle.slice(0, 50)}": ${criticals.map(c => c.message).join("; ")}`);
        return "generated";
      }

      return "failed";
    } finally {
      client.release();
    }
  }

  async function generatePagesForPodcast(itunesId: string, forceRegenerate = false, limit?: number) {
    const { ITUNES_ID_TO_SLUG } = await import("./podcastLandingMap");
    const { generateRecapFromTranscript } = await import("./recapGenerator");

    activeEpGenItunesIds.add(itunesId);
    const slug = ITUNES_ID_TO_SLUG[itunesId];
    const client = await pool.connect();
    try {
      const { rows: [podcastInfo] } = await client.query(
        `SELECT name, slug, hosts, artwork_url FROM podcast_directory WHERE itunes_id = $1`, [itunesId]
      );
      if (!podcastInfo) {
        console.log(`[EpGen] Podcast not found for itunesId ${itunesId}`);
        return;
      }

      const podcastName = podcastInfo.name;
      const podcastSlug = slug || podcastInfo.slug || podcastName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
      const hosts = podcastInfo.hosts || "";
      const podcastArtwork = podcastInfo.artwork_url || "";

      epGenState.currentPodcastName = forceRegenerate ? `Regenerate: ${podcastName}` : podcastName;
      epGenState.currentItunesId = itunesId;

      // Auto-seed hosts if none exist in podcast_hosts table
      try {
        const { rows: existingHosts } = await client.query(
          `SELECT id FROM podcast_hosts WHERE podcast_slug = $1 LIMIT 1`, [podcastSlug]
        );
        if (existingHosts.length === 0 && hosts) {
          const hostNames = hosts.split(/&amp;|&|,|and(?:\s)/i).map((h: string) => h.trim()).filter(Boolean);
          for (let i = 0; i < hostNames.length; i++) {
            const hostName = hostNames[i].replace(/&amp;/g, '&').trim();
            if (!hostName) continue;
            await client.query(
              `INSERT INTO podcast_hosts (podcast_slug, name, bio, sort_order)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT DO NOTHING`,
              [podcastSlug, hostName, `Host of ${podcastName}`, i]
            );
          }
          if (hostNames.length > 0) {
            console.log(`[EpGen] Auto-seeded ${hostNames.length} hosts for ${podcastName}: ${hostNames.join(', ')}`);
          }
        }
      } catch (hostErr) {
        console.warn(`[EpGen] Host auto-seed failed for ${podcastName}:`, hostErr);
      }

      const query = forceRegenerate
        ? `SELECT et.* FROM episode_transcripts et
           WHERE et.podcast_id = $1 AND et.transcript IS NOT NULL AND et.transcript != ''
           ORDER BY et.date_published DESC NULLS LAST`
        : `SELECT et.* FROM episode_transcripts et
           WHERE et.podcast_id = $1 AND et.transcript IS NOT NULL AND et.transcript != ''
             AND NOT EXISTS (
               SELECT 1 FROM landing_page_recaps lpr
               WHERE lpr.itunes_id = $1
                 AND (lower(trim(lpr.episode_title)) = lower(trim(et.episode_title))
                   OR lpr.episode_slug = lower(regexp_replace(trim(et.episode_title), '[^a-zA-Z0-9]+', '-', 'g')))
             )
           ORDER BY et.date_published DESC NULLS LAST`;

      let { rows: transcripts } = await client.query(query, [itunesId]);
      client.release();

      if (limit && limit > 0) {
        transcripts = transcripts.slice(0, limit);
      }

      epGenState.totalEpisodes = transcripts.length;
      epGenState.currentEpisode = 0;
      epGenState.generated = 0;
      epGenState.failed = 0;
      epGenState.skipped = 0;
      epGenState.startedAt = Date.now();

      const concurrency = epGenState.concurrency;
      console.log(`[EpGen] Starting ${podcastName}: ${transcripts.length} episodes, concurrency=${concurrency}`);

      let idx = 0;
      async function runWorker(workerId: number) {
        while (epGenState.running) {
          const myIdx = idx++;
          if (myIdx >= transcripts.length) break;

          const t = transcripts[myIdx];
          const epTitle = t.episode_title || "Untitled";

          try {
            const result = await processOneEpisode(
              t, podcastSlug, itunesId, podcastName, hosts, podcastArtwork,
              forceRegenerate, generateRecapFromTranscript
            );

            epGenState.currentEpisode++;
            if (result === "skipped") {
              epGenState.skipped++;
            } else if (result === "generated") {
              epGenState.generated++;
              console.log(`[EpGen][W${workerId}] ✓ ${epTitle} (${epGenState.generated + epGenState.failed}/${transcripts.length})`);
            } else {
              epGenState.failed++;
            }
          } catch (err) {
            epGenState.currentEpisode++;
            epGenState.failed++;
            console.error(`[EpGen][W${workerId}] ✗ ${epTitle}:`, (err as Error).message);
          }
        }
      }

      const workers = [];
      for (let w = 0; w < concurrency; w++) {
        workers.push(runWorker(w + 1));
      }
      await Promise.all(workers);

      // Backfill quotes for existing recaps that don't have any
      if (epGenState.running) {
        try {
          const { rows: recapsWithoutQuotes } = await pool.query(
            `SELECT lpr.episode_title, lpr.episode_slug, lpr.hosts, lpr.guests
             FROM landing_page_recaps lpr
             WHERE lpr.slug = $1
               AND NOT EXISTS (SELECT 1 FROM episode_quotes eq WHERE eq.podcast_slug = $1 AND eq.episode_slug = lpr.episode_slug)
             ORDER BY lpr.publish_date DESC
             LIMIT 20`,
            [podcastSlug]
          );
          if (recapsWithoutQuotes.length > 0) {
            console.log(`[EpGen] Backfilling quotes for ${recapsWithoutQuotes.length} existing ${podcastName} recaps...`);
            const { extractQuotesFromTranscript } = await import("./recapGenerator");
            for (const recap of recapsWithoutQuotes) {
              if (!epGenState.running) break;
              try {
                const { rows: [transcriptRow] } = await pool.query(
                  `SELECT transcript FROM episode_transcripts
                   WHERE podcast_id = $1 AND transcript IS NOT NULL AND transcript != ''
                     AND (lower(trim(episode_title)) = lower(trim($2))
                       OR lower(regexp_replace(trim(episode_title), '[^a-zA-Z0-9]+', '-', 'g')) = $3)
                   LIMIT 1`,
                  [itunesId, recap.episode_title, recap.episode_slug]
                );
                if (transcriptRow?.transcript) {
                  const extractedQuotes = await extractQuotesFromTranscript(
                    transcriptRow.transcript, podcastName, recap.episode_title,
                    recap.hosts, recap.guests
                  );
                  if (extractedQuotes.length > 0) {
                    const quotesToSave = extractedQuotes.map((q: any) => ({
                      podcastSlug,
                      episodeSlug: recap.episode_slug,
                      speakerName: q.speakerName,
                      speakerRole: q.speakerRole || null,
                      quoteText: q.quoteText,
                      context: q.context,
                      quoteType: q.quoteType,
                    }));
                    await storage.saveEpisodeQuotes(quotesToSave);
                    console.log(`[EpGen] Backfilled ${extractedQuotes.length} quotes for "${recap.episode_title.slice(0, 50)}..."`);
                  }
                }
              } catch (qErr) {
                console.warn(`[EpGen] Quote backfill failed for "${recap.episode_title}":`, (qErr as Error).message);
              }
            }
          }
        } catch (bfErr) {
          console.warn(`[EpGen] Quote backfill error for ${podcastName}:`, bfErr);
        }
      }

      epGenState.completedPodcasts.push(itunesId);
      const elapsed = Math.round((Date.now() - (epGenState.startedAt || Date.now())) / 1000);
      console.log(`[EpGen] Finished ${podcastName}: ${epGenState.generated} generated, ${epGenState.failed} failed, ${epGenState.skipped} skipped in ${elapsed}s`);
    } catch (err) {
      console.error(`[EpGen] Fatal error for ${itunesId}:`, err);
    } finally {
      activeEpGenItunesIds.delete(itunesId);
    }
  }

  async function runAutoQueue() {
    const skippedIds = new Set<string>();
    while (epGenState.autoQueue && epGenState.running) {
      const client = await pool.connect();
      let nextItunesId: string | null = null;
      try {
        const excludeIds = [...epGenState.completedPodcasts, ...skippedIds];
        const excludePlaceholders = excludeIds.length > 0
          ? `AND pd.itunes_id NOT IN (${excludeIds.map((_, i) => `$${i + 1}`).join(",")})`
          : "";
        const { rows } = await client.query(
          `SELECT pd.itunes_id, pd.name,
                  COALESCE(et.cnt, 0)::int as transcript_count,
                  COALESCE(lpr.cnt, 0)::int as recap_count
           FROM podcast_directory pd
           LEFT JOIN (SELECT podcast_id, COUNT(*)::int as cnt FROM episode_transcripts WHERE transcript IS NOT NULL AND transcript != '' GROUP BY podcast_id) et ON pd.itunes_id = et.podcast_id
           LEFT JOIN (SELECT itunes_id, COUNT(*)::int as cnt FROM landing_page_recaps GROUP BY itunes_id) lpr ON pd.itunes_id = lpr.itunes_id
           WHERE COALESCE(et.cnt, 0) > COALESCE(lpr.cnt, 0)
           ${excludePlaceholders}
           ORDER BY COALESCE(lpr.cnt, 0) DESC, pd.name ASC
           LIMIT 1`,
          excludeIds
        );
        if (rows.length > 0) {
          nextItunesId = rows[0].itunes_id;
        }
      } finally {
        client.release();
      }

      if (!nextItunesId) {
        console.log(`[EpGen] Auto-queue complete - all podcasts processed`);
        epGenState.autoQueue = false;
        epGenState.running = false;
        break;
      }

      const genBefore = epGenState.generated;
      await generatePagesForPodcast(nextItunesId, false, epGenState.autoQueueLimit || undefined);
      if (epGenState.generated === genBefore && epGenState.totalEpisodes === 0) {
        skippedIds.add(nextItunesId);
        console.log(`[EpGen] Skipping ${nextItunesId} - no unmatched episodes found (count mismatch)`);
      }
    }

    epGenState.running = false;
  }

  app.post("/api/admin/bulk-sync-recaps", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated" });
    const { recaps, quotes } = req.body;
    if (!recaps || !Array.isArray(recaps)) return res.status(400).json({ message: "recaps array required" });

    const client = await pool.connect();
    let inserted = 0, skipped = 0, quotesInserted = 0;
    try {
      for (const r of recaps) {
        try {
          await client.query(
            `INSERT INTO landing_page_recaps
             (slug, itunes_id, podcast_name, episode_title, episode_slug, publish_date, duration, artwork_url, hosts, tldl, what_happened, key_insights, quote, quote_attribution, key_topics, topic_contexts, top_questions, audio_url, sponsors, guests, resources)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
             ON CONFLICT (slug, episode_slug) DO UPDATE SET
               tldl = EXCLUDED.tldl, what_happened = EXCLUDED.what_happened, key_insights = EXCLUDED.key_insights,
               quote = EXCLUDED.quote, quote_attribution = EXCLUDED.quote_attribution, key_topics = EXCLUDED.key_topics,
               topic_contexts = EXCLUDED.topic_contexts, top_questions = EXCLUDED.top_questions, audio_url = EXCLUDED.audio_url,
               sponsors = EXCLUDED.sponsors, guests = EXCLUDED.guests, resources = EXCLUDED.resources`,
            [r.slug, r.itunes_id, r.podcast_name, r.episode_title, r.episode_slug, r.publish_date,
             r.duration, r.artwork_url, r.hosts, r.tldl, r.what_happened, r.key_insights,
             r.quote, r.quote_attribution, r.key_topics, r.topic_contexts, r.top_questions,
             r.audio_url, r.sponsors, r.guests, r.resources]
          );
          inserted++;
        } catch (err) {
          skipped++;
        }
      }

      if (quotes && Array.isArray(quotes)) {
        for (const q of quotes) {
          try {
            await client.query(
              `INSERT INTO episode_quotes (podcast_slug, episode_slug, speaker_name, speaker_role, quote_text, context, quote_type, sort_order)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
               ON CONFLICT DO NOTHING`,
              [q.podcast_slug, q.episode_slug, q.speaker_name, q.speaker_role, q.quote_text, q.context, q.quote_type, q.sort_order]
            );
            quotesInserted++;
          } catch { skipped++; }
        }
      }
    } finally {
      client.release();
    }
    res.json({ inserted, skipped, quotesInserted });
  });

  app.post("/api/admin/episode-pages-generate/:itunesId", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated" });
    if (epGenState.running) return res.status(409).json({ message: "Generation already in progress" });

    const { itunesId } = req.params;
    const forceRegenerate = req.body?.forceRegenerate === true;
    const limit = req.body?.limit ? parseInt(req.body.limit, 10) : undefined;
    const concurrency = req.body?.concurrency ? Math.min(parseInt(req.body.concurrency, 10), 10) : 3;
    epGenState.running = true;
    epGenState.autoQueue = false;
    epGenState.concurrency = concurrency;
    epGenState.completedPodcasts = [];
    res.json({ started: true, itunesId, forceRegenerate, limit: limit || "all", concurrency });

    generatePagesForPodcast(itunesId, forceRegenerate, limit).then(() => {
      epGenState.running = false;
    }).catch(err => {
      console.error(`[EpGen] Fatal error:`, err);
      epGenState.running = false;
    });
  });

  app.post("/api/admin/episode-pages-generate-auto", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated" });
    if (epGenState.running) return res.status(409).json({ message: "Generation already in progress" });

    const limitPerPodcast = req.body?.limitPerPodcast ? parseInt(req.body.limitPerPodcast, 10) : null;
    const concurrency = req.body?.concurrency ? Math.min(parseInt(req.body.concurrency, 10), 10) : 3;
    const forceRegenerate = req.body?.forceRegenerate === true;
    const regenCutoffDate = req.body?.regenBefore || null;
    epGenState.running = true;
    epGenState.autoQueue = true;
    epGenState.completedPodcasts = [];
    epGenState.autoQueueLimit = limitPerPodcast;
    epGenState.concurrency = concurrency;
    res.json({ started: true, autoQueue: true, limitPerPodcast: limitPerPodcast || "all", concurrency, forceRegenerate, regenCutoffDate });

    const queueFn = forceRegenerate ? () => runRegenQueue(regenCutoffDate) : runAutoQueue;
    queueFn().catch(err => {
      console.error(`[EpGen] Auto-queue fatal error:`, err);
      epGenState.running = false;
      epGenState.autoQueue = false;
    });
  });

  async function runRegenQueue(cutoffDate?: string | null) {
    const cutoff = cutoffDate || new Date().toISOString().split("T")[0];
    console.log(`[EpGen] Starting regeneration queue - regenerating recaps created before ${cutoff}`);
    console.log(`[EpGen] Prioritizing podcasts with the most old recaps first`);

    const { generateRecapFromTranscript } = await import("./recapGenerator");

    while (epGenState.autoQueue && epGenState.running) {
      const client = await pool.connect();
      try {
        const excludeIds = epGenState.completedPodcasts;
        const excludePlaceholders = excludeIds.length > 0
          ? `AND lpr.itunes_id NOT IN (${excludeIds.map((_, i) => `$${i + 2}`).join(",")})`
          : "";

        const { rows: podcastsToRegen } = await client.query(
          `SELECT lpr.itunes_id, lpr.podcast_name, lpr.slug,
                  COUNT(*)::int as old_recap_count
           FROM landing_page_recaps lpr
           WHERE lpr.created_at < $1::date
           ${excludePlaceholders}
           GROUP BY lpr.itunes_id, lpr.podcast_name, lpr.slug
           HAVING COUNT(*) > 0
           ORDER BY COUNT(*) DESC
           LIMIT 1`,
          [cutoff, ...excludeIds]
        );

        if (podcastsToRegen.length === 0) {
          console.log(`[EpGen] Regeneration queue complete - all old recaps regenerated`);
          break;
        }

        const podcast = podcastsToRegen[0];
        const limit = epGenState.autoQueueLimit || 999;

        const { rows: oldRecaps } = await client.query(
          `SELECT lpr.id, lpr.itunes_id, lpr.slug, lpr.podcast_name, lpr.episode_title, lpr.episode_slug, lpr.hosts
           FROM landing_page_recaps lpr
           WHERE lpr.itunes_id = $1 AND lpr.created_at < $2::date
           ORDER BY lpr.publish_date DESC NULLS LAST
           LIMIT $3`,
          [podcast.itunes_id, cutoff, limit]
        );

        if (oldRecaps.length === 0) {
          epGenState.completedPodcasts.push(podcast.itunes_id);
          continue;
        }

        epGenState.currentPodcastName = `Regen: ${podcast.podcast_name}`;
        epGenState.currentItunesId = podcast.itunes_id;
        epGenState.totalEpisodes = oldRecaps.length;
        epGenState.currentEpisode = 0;
        epGenState.generated = 0;
        epGenState.failed = 0;
        epGenState.skipped = 0;
        epGenState.startedAt = Date.now();

        console.log(`[EpGen] Regenerating ${oldRecaps.length} old recaps for ${podcast.podcast_name}`);

        const workers = Array.from({ length: epGenState.concurrency }, (_, i) => i);
        let episodeIndex = 0;

        await Promise.all(workers.map(async (workerId) => {
          while (episodeIndex < oldRecaps.length && epGenState.running) {
            const idx = episodeIndex++;
            if (idx >= oldRecaps.length) break;
            const row = oldRecaps[idx];
            epGenState.currentEpisode = idx + 1;

            const innerClient = await pool.connect();
            try {
              const { rows: transcriptRows } = await innerClient.query(
                `SELECT transcript FROM episode_transcripts
                 WHERE podcast_id = $1
                   AND transcript IS NOT NULL AND transcript != ''
                   AND (
                     lower(trim(episode_title)) = lower(trim($2))
                     OR lower(regexp_replace(trim(episode_title), '[^a-zA-Z0-9]+', '-', 'g')) = $3
                   )
                 LIMIT 1`,
                [row.itunes_id, row.episode_title, row.episode_slug]
              );

              if (transcriptRows.length === 0) {
                console.log(`[EpGen][W${workerId + 1}] Skip (no transcript): ${row.episode_title.slice(0, 60)}`);
                epGenState.skipped++;
                continue;
              }

              const transcript = transcriptRows[0].transcript;
              const hosts = row.hosts || "";

              const result = await generateRecapFromTranscript(
                transcript, row.episode_title, row.podcast_name, hosts
              );

              if (result) {
                await innerClient.query(
                  `UPDATE landing_page_recaps SET
                    tldl = $1, what_happened = $2, key_insights = $3, quote = $4, quote_attribution = $5,
                    key_topics = $6, topic_contexts = $7, top_questions = $8, sponsors = $9, guests = $10,
                    resources = $11, created_at = NOW()
                  WHERE id = $12`,
                  [
                    result.tldl, result.whatHappened, result.keyInsights, result.quote,
                    result.quoteAttribution, result.keyTopics, result.topicContexts,
                    typeof result.topQuestions === "string" ? result.topQuestions : JSON.stringify(result.topQuestions),
                    result.sponsors || null, result.guests || null, result.resources || null,
                    row.id
                  ]
                );

                await innerClient.query(
                  `DELETE FROM episode_quotes WHERE podcast_slug = $1 AND episode_slug = $2`,
                  [row.slug, row.episode_slug]
                );

                epGenState.generated++;
                console.log(`[EpGen][W${workerId + 1}] Regen OK: ${row.episode_title.slice(0, 60)} (${epGenState.generated}/${oldRecaps.length})`);
              } else {
                epGenState.failed++;
                console.log(`[EpGen][W${workerId + 1}] Regen FAIL: ${row.episode_title.slice(0, 60)}`);
              }
            } catch (err: any) {
              epGenState.failed++;
              console.error(`[EpGen][W${workerId + 1}] Regen error: ${row.episode_title.slice(0, 60)} - ${err.message}`);
            } finally {
              innerClient.release();
            }
          }
        }));

        epGenState.completedPodcasts.push(podcast.itunes_id);
        console.log(`[EpGen] Finished regen for ${podcast.podcast_name}: ${epGenState.generated} regenerated, ${epGenState.failed} failed, ${epGenState.skipped} skipped`);

        if (epGenState.generated > 0) {
          console.log(`[EpGen] Backfilling quotes for regenerated ${podcast.podcast_name} recaps...`);
          const { rows: needQuotes } = await client.query(
            `SELECT lpr.slug, lpr.episode_slug, lpr.episode_title, lpr.podcast_name, lpr.hosts
             FROM landing_page_recaps lpr
             WHERE lpr.itunes_id = $1
               AND NOT EXISTS (SELECT 1 FROM episode_quotes eq WHERE eq.podcast_slug = lpr.slug AND eq.episode_slug = lpr.episode_slug)
             ORDER BY lpr.publish_date DESC NULLS LAST
             LIMIT 50`,
            [podcast.itunes_id]
          );

          for (const nq of needQuotes) {
            if (!epGenState.running) break;
            try {
              const { rows: tRows } = await client.query(
                `SELECT transcript FROM episode_transcripts
                 WHERE podcast_id = $1
                   AND transcript IS NOT NULL AND transcript != ''
                   AND (
                     lower(trim(episode_title)) = lower(trim($2))
                     OR lower(regexp_replace(trim(episode_title), '[^a-zA-Z0-9]+', '-', 'g')) = $3
                   )
                 LIMIT 1`,
                [podcast.itunes_id, nq.episode_title, nq.episode_slug]
              );
              if (tRows.length > 0) {
                const { extractQuotesFromTranscript } = await import("./recapGenerator");
                const quotes = await extractQuotesFromTranscript(
                  tRows[0].transcript, nq.episode_title, nq.podcast_name, nq.hosts || ""
                );
                if (quotes && quotes.length > 0) {
                  for (let qi = 0; qi < quotes.length; qi++) {
                    const q = quotes[qi];
                    await client.query(
                      `INSERT INTO episode_quotes (podcast_slug, episode_slug, speaker_name, speaker_role, quote_text, context, quote_type, sort_order)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
                      [nq.slug, nq.episode_slug, q.speakerName, q.speakerRole, q.quoteText, q.context, q.quoteType || "insight", qi]
                    );
                  }
                  console.log(`[EpGen] Backfilled ${quotes.length} quotes for "${nq.episode_title.slice(0, 50)}..."`);
                }
              }
            } catch (err: any) {
              console.error(`[EpGen] Quote backfill error: ${nq.episode_title.slice(0, 50)} - ${err.message}`);
            }
          }
        }
      } finally {
        client.release();
      }
    }

    console.log(`[EpGen] Regeneration queue finished. Completed podcasts: ${epGenState.completedPodcasts.length}`);
    console.log(`[EpGen] Now continuing with normal auto-queue to generate new episodes for remaining podcasts...`);
    epGenState.completedPodcasts = [];
    epGenState.autoQueueLimit = epGenState.autoQueueLimit || 10;
    await runAutoQueue();
  }

  async function reprocessIncompletePages() {
    const { generateRecapFromTranscript } = await import("./recapGenerator");
    
    while (epGenState.autoQueue && epGenState.running) {
      const client = await pool.connect();
      try {
        const { rows: incomplete } = await client.query(
          `SELECT lpr.id, lpr.itunes_id, lpr.slug, lpr.podcast_name, lpr.episode_title, lpr.episode_slug, lpr.hosts
           FROM landing_page_recaps lpr
           WHERE (
             lpr.guests IS NULL OR lpr.guests = '' OR lpr.guests = '[]'
             OR lpr.top_questions IS NULL OR lpr.top_questions = ''
             OR lpr.tldl IS NULL OR lpr.tldl = ''
             OR lpr.what_happened IS NULL OR lpr.what_happened = ''
             OR lpr.key_insights IS NULL OR array_length(lpr.key_insights, 1) IS NULL
             OR lpr.quote IS NULL OR lpr.quote = ''
             OR lpr.key_topics IS NULL OR array_length(lpr.key_topics, 1) IS NULL
           )
           ORDER BY lpr.itunes_id, lpr.episode_title
           LIMIT 50`
        );

        if (incomplete.length === 0) {
          console.log(`[EpGen] Reprocess complete - all pages fully populated`);
          break;
        }

        const currentPodcast = incomplete[0].podcast_name;
        const currentItunesId = incomplete[0].itunes_id;
        const batch = incomplete.filter(r => r.itunes_id === currentItunesId);

        epGenState.currentPodcastName = `Reprocess: ${currentPodcast}`;
        epGenState.currentItunesId = currentItunesId;
        epGenState.totalEpisodes = batch.length;
        epGenState.currentEpisode = 0;
        epGenState.generated = 0;
        epGenState.failed = 0;
        epGenState.skipped = 0;

        console.log(`[EpGen] Reprocessing ${batch.length} incomplete pages for ${currentPodcast}`);

        for (const row of batch) {
          if (!epGenState.running) break;
          epGenState.currentEpisode++;

          try {
            const { rows: transcriptRows } = await client.query(
              `SELECT transcript FROM episode_transcripts
               WHERE podcast_id = $1
                 AND transcript IS NOT NULL AND transcript != ''
                 AND (
                   lower(trim(episode_title)) = lower(trim($2))
                   OR lower(regexp_replace(trim(episode_title), '[^a-zA-Z0-9]+', '-', 'g')) = $3
                 )
               LIMIT 1`,
              [row.itunes_id, row.episode_title, row.episode_slug]
            );

            if (transcriptRows.length === 0) {
              epGenState.skipped++;
              continue;
            }

            const recap = await generateRecapFromTranscript(transcriptRows[0].transcript, row.podcast_name, row.episode_title);
            if (!recap) {
              epGenState.failed++;
              continue;
            }

            await client.query(
              `UPDATE landing_page_recaps SET
                tldl = COALESCE(NULLIF($1, ''), tldl),
                what_happened = COALESCE(NULLIF($2, ''), what_happened),
                key_insights = CASE WHEN $3::text[] IS NOT NULL AND array_length($3::text[], 1) > 0 THEN $3::text[] ELSE key_insights END,
                quote = COALESCE(NULLIF($4, ''), quote),
                quote_attribution = COALESCE(NULLIF($5, ''), quote_attribution),
                key_topics = CASE WHEN $6::text[] IS NOT NULL AND array_length($6::text[], 1) > 0 THEN $6::text[] ELSE key_topics END,
                topic_contexts = COALESCE(NULLIF($7, ''), topic_contexts),
                top_questions = COALESCE(NULLIF($8, ''), top_questions),
                sponsors = COALESCE(NULLIF($9, ''), NULLIF($9, '[]'), sponsors),
                guests = COALESCE(NULLIF($10, ''), NULLIF($10, '[]'), guests),
                resources = COALESCE(NULLIF($11, ''), NULLIF($11, '[]'), resources)
              WHERE id = $12`,
              [
                recap.tldl || "",
                recap.whatHappened || "",
                recap.keyInsights && recap.keyInsights.length > 0 ? recap.keyInsights : null,
                recap.quote || "",
                recap.quoteAttribution || "",
                recap.keyTopics && recap.keyTopics.length > 0 ? recap.keyTopics : null,
                recap.topicContexts ? JSON.stringify(recap.topicContexts) : "",
                recap.topQuestions ? JSON.stringify(recap.topQuestions) : "",
                recap.sponsors ? JSON.stringify(recap.sponsors) : "[]",
                recap.guests ? JSON.stringify(recap.guests) : "[]",
                recap.resources ? JSON.stringify(recap.resources) : "[]",
                row.id,
              ]
            );

            await postProcessRecap({
              transcript: transcriptRows[0].transcript,
              podcastSlug: row.slug, episodeSlug: row.episode_slug,
              podcastName: row.podcast_name, episodeTitle: row.episode_title,
              itunesId: row.itunes_id, hosts: row.hosts || null,
              guests: recap.guests || null,
              resources: recap.resources || null,
            });

            epGenState.generated++;
            if (epGenState.currentEpisode % 5 === 0) {
              console.log(`[EpGen] Reprocess ${currentPodcast}: ${epGenState.currentEpisode}/${epGenState.totalEpisodes} (${epGenState.generated} updated)`);
            }
          } catch (err) {
            epGenState.failed++;
            console.error(`[EpGen] Reprocess error for "${row.episode_title}":`, err);
          }
        }

        epGenState.completedPodcasts.push(currentItunesId);
        console.log(`[EpGen] Reprocess finished ${currentPodcast}: ${epGenState.generated} updated, ${epGenState.failed} failed, ${epGenState.skipped} skipped`);
      } finally {
        client.release();
      }
    }

    epGenState.running = false;
    epGenState.autoQueue = false;
  }

  app.post("/api/admin/episode-pages-reprocess", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated" });
    if (epGenState.running) return res.status(409).json({ message: "Generation already in progress" });

    epGenState.running = true;
    epGenState.autoQueue = true;
    epGenState.completedPodcasts = [];
    res.json({ started: true, mode: "reprocess" });

    reprocessIncompletePages().catch(err => {
      console.error(`[EpGen] Reprocess fatal error:`, err);
      epGenState.running = false;
      epGenState.autoQueue = false;
    });
  });

  // ─── Podcaster Claim & Dashboard Routes ─────────────────────────
  app.post("/api/podcaster/claim", async (req, res) => {
    try {
      const schema = z.object({
        podcastSlug: z.string().min(1),
        email: z.string().email(),
        name: z.string().min(1),
      });
      const data = schema.parse(req.body);
      const podcastCheck = await pool.query(
        `SELECT slug FROM podcast_directory WHERE slug = $1`,
        [data.podcastSlug]
      );
      if (podcastCheck.rows.length === 0) {
        return res.status(404).json({ message: "Podcast not found" });
      }
      const existing = await pool.query(
        `SELECT id, verified FROM podcaster_claims WHERE podcast_slug = $1`,
        [data.podcastSlug]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ message: "This podcast has already been claimed" });
      }
      await pool.query(
        `INSERT INTO podcaster_claims (podcast_slug, email, name) VALUES ($1, $2, $3)`,
        [data.podcastSlug, data.email, data.name]
      );
      try {
        const { client, fromEmail } = await getUncachableResendClient();
        await client.emails.send({
          from: `PodCap <${fromEmail}>`,
          to: "hiderekjohnson@gmail.com",
          subject: `🎙️ New Podcaster Claim: ${data.podcastSlug}`,
          html: `<p><strong>${data.name}</strong> (${data.email}) wants to claim <strong>${data.podcastSlug}</strong>.</p><p>Verify in the admin panel.</p>`,
        });
      } catch {}
      res.json({ success: true, message: "Claim submitted. We'll verify your ownership and get back to you." });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error("[Podcaster] Claim error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/podcaster/claim/:slug", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT podcast_slug, name, verified, custom_byline_text, custom_byline_url, custom_byline_label FROM podcaster_claims WHERE podcast_slug = $1 AND verified = true`,
        [req.params.slug]
      );
      if (result.rows.length === 0) {
        return res.json({ claimed: false });
      }
      const row = result.rows[0];
      res.json({
        claimed: true,
        name: row.name,
        byline: row.custom_byline_text ? {
          text: row.custom_byline_text,
          url: row.custom_byline_url,
          label: row.custom_byline_label,
        } : null,
      });
    } catch (err) {
      console.error("[Podcaster] Claim check error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/podcaster/login", async (req, res) => {
    try {
      const schema = z.object({ email: z.string().email() });
      const { email } = schema.parse(req.body);
      const claims = await pool.query(
        `SELECT id, podcast_slug, name, verified FROM podcaster_claims WHERE email = $1`,
        [email]
      );
      if (claims.rows.length === 0) {
        return res.status(404).json({ message: "No claims found for this email" });
      }
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await pool.query(
        `INSERT INTO magic_links (email, token, expires_at) VALUES ($1, $2, $3)`,
        [email, token, expiresAt]
      );
      const loginUrl = `${req.protocol}://${req.get("host")}/podcaster/verify?token=${token}`;
      try {
        const { client, fromEmail } = await getUncachableResendClient();
        await client.emails.send({
          from: `PodCap <${fromEmail}>`,
          to: email,
          subject: "Your PodCap Podcaster Login Link",
          html: `<p>Click below to access your podcaster dashboard:</p><p><a href="${loginUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Open Dashboard</a></p><p style="color:#666;font-size:13px;">This link expires in 15 minutes.</p>`,
        });
      } catch (emailErr) {
        console.error("[Podcaster] Login email error:", emailErr);
        return res.status(500).json({ message: "Failed to send login email" });
      }
      res.json({ success: true, message: "Login link sent to your email" });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid email" });
      console.error("[Podcaster] Login error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/podcaster/verify", async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) return res.status(400).json({ message: "Missing token" });
      const result = await pool.query(
        `SELECT id, email, expires_at, used_at FROM magic_links WHERE token = $1`,
        [token]
      );
      if (result.rows.length === 0) return res.status(404).json({ message: "Invalid link" });
      const link = result.rows[0];
      if (link.used_at) return res.status(410).json({ message: "Link already used" });
      if (new Date(link.expires_at) < new Date()) return res.status(410).json({ message: "Link expired" });
      await pool.query(`UPDATE magic_links SET used_at = NOW() WHERE id = $1`, [link.id]);
      (req.session as any).podcasterEmail = link.email;
      const claims = await pool.query(
        `SELECT podcast_slug FROM podcaster_claims WHERE email = $1`,
        [link.email]
      );
      const slugs = claims.rows.map((r: any) => r.podcast_slug);
      res.json({ success: true, email: link.email, podcasts: slugs });
    } catch (err) {
      console.error("[Podcaster] Verify error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/podcaster/dashboard/:slug", async (req, res) => {
    const podcasterEmail = (req.session as any).podcasterEmail;
    const isAdmin = req.session.isAdmin;
    if (!podcasterEmail && !isAdmin) return res.status(401).json({ message: "Not authenticated" });
    try {
      const claimQuery = isAdmin
        ? `SELECT * FROM podcaster_claims WHERE podcast_slug = $1`
        : `SELECT * FROM podcaster_claims WHERE podcast_slug = $1 AND email = $2`;
      const claimParams = isAdmin ? [req.params.slug] : [req.params.slug, podcasterEmail];
      const claimResult = await pool.query(claimQuery, claimParams);
      if (claimResult.rows.length === 0) return res.status(403).json({ message: "Not authorized for this podcast" });
      const claim = claimResult.rows[0];
      const podcastResult = await pool.query(
        `SELECT name, artwork_url, description FROM podcast_directory WHERE slug = $1`,
        [req.params.slug]
      );
      const podcast = podcastResult.rows[0] || {};
      const sponsorResult = await pool.query(
        `SELECT sponsors, episode_title, episode_slug, publish_date FROM landing_page_recaps WHERE slug = $1 AND sponsors IS NOT NULL AND sponsors::text != '[]' AND sponsors::text != 'null' ORDER BY publish_date DESC LIMIT 20`,
        [req.params.slug]
      );
      const episodeSponsors = sponsorResult.rows.map((r: any) => ({
        episodeTitle: r.episode_title,
        episodeSlug: r.episode_slug,
        publishDate: r.publish_date,
        sponsors: (() => { try { return JSON.parse(r.sponsors); } catch { return []; } })(),
      }));
      res.json({
        claim: {
          id: claim.id,
          podcastSlug: claim.podcast_slug,
          email: claim.email,
          name: claim.name,
          verified: claim.verified,
          byline: {
            text: claim.custom_byline_text || "",
            url: claim.custom_byline_url || "",
            label: claim.custom_byline_label || "",
          },
          customSponsors: (() => { try { return JSON.parse(claim.custom_sponsors || "[]"); } catch { return []; } })(),
        },
        podcast: {
          name: podcast.name,
          artworkUrl: podcast.artwork_url,
          description: podcast.description,
        },
        episodeSponsors,
      });
    } catch (err) {
      console.error("[Podcaster] Dashboard error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/podcaster/dashboard/:slug", async (req, res) => {
    const podcasterEmail = (req.session as any).podcasterEmail;
    const isAdmin = req.session.isAdmin;
    if (!podcasterEmail && !isAdmin) return res.status(401).json({ message: "Not authenticated" });
    try {
      const updateSchema = z.object({
        bylineText: z.string().max(200).optional(),
        bylineUrl: z.string().url().refine(u => !u || u.startsWith("http://") || u.startsWith("https://"), { message: "URL must use http or https" }).or(z.literal("")).optional(),
        bylineLabel: z.string().max(60).optional(),
        customSponsors: z.array(z.object({
          name: z.string(),
          description: z.string().optional(),
          couponCode: z.string().optional(),
          url: z.string().optional(),
          howToRedeem: z.string().optional(),
        })).optional(),
      });
      const data = updateSchema.parse(req.body);
      const authQuery = isAdmin
        ? `SELECT id FROM podcaster_claims WHERE podcast_slug = $1 AND verified = true`
        : `SELECT id FROM podcaster_claims WHERE podcast_slug = $1 AND email = $2 AND verified = true`;
      const authParams = isAdmin ? [req.params.slug] : [req.params.slug, podcasterEmail];
      const claimResult = await pool.query(authQuery, authParams);
      if (claimResult.rows.length === 0) return res.status(403).json({ message: "Not authorized or claim not verified" });
      await pool.query(
        `UPDATE podcaster_claims SET custom_byline_text = $1, custom_byline_url = $2, custom_byline_label = $3, custom_sponsors = $4 WHERE podcast_slug = $5`,
        [
          data.bylineText || null,
          data.bylineUrl || null,
          data.bylineLabel || null,
          data.customSponsors ? JSON.stringify(data.customSponsors) : null,
          req.params.slug,
        ]
      );
      res.json({ success: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error("[Podcaster] Dashboard update error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/podcaster-claims", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated" });
    try {
      const result = await pool.query(
        `SELECT pc.*, pd.name as podcast_name, pd.artwork_url FROM podcaster_claims pc LEFT JOIN podcast_directory pd ON pd.slug = pc.podcast_slug ORDER BY pc.created_at DESC`
      );
      res.json(result.rows);
    } catch (err) {
      console.error("[Admin] Claims error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/admin/podcaster-claims/:id/verify", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated" });
    try {
      await pool.query(`UPDATE podcaster_claims SET verified = true WHERE id = $1`, [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error("[Admin] Verify claim error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const chatRateLimit = new Map<string, number[]>();
  app.post("/api/episode-chat", async (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const now = Date.now();
      const windowMs = 60_000;
      const maxReqs = 15;
      const timestamps = (chatRateLimit.get(ip) || []).filter(t => t > now - windowMs);
      if (timestamps.length >= maxReqs) {
        return res.status(429).json({ error: "Too many requests. Please wait a moment." });
      }
      timestamps.push(now);
      chatRateLimit.set(ip, timestamps);

      const { podcastSlug, episodeSlug, entityName, entityType, question, conversationHistory } = req.body;
      if (!podcastSlug || !episodeSlug || !question) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      if (typeof question !== "string" || question.length > 500) {
        return res.status(400).json({ error: "Question too long (max 500 characters)" });
      }

      const recap = await storage.getLandingPageRecapBySlug(podcastSlug, episodeSlug);
      if (!recap) {
        return res.status(404).json({ error: "Episode not found" });
      }

      let transcript = "";
      try {
        const tRes = await pool.query(
          `SELECT transcript FROM episode_transcripts WHERE podcast_id = $1 AND episode_title = $2 LIMIT 1`,
          [recap.itunesId, recap.episodeTitle]
        );
        if (tRes.rows[0]?.transcript) {
          transcript = tRes.rows[0].transcript;
        }
      } catch (e) {
        console.log("[EpisodeChat] Transcript lookup failed, using recap only");
      }

      let entityContextsStr = "";
      try {
        const ecRes = await pool.query(
          `SELECT entity_contexts_cache FROM landing_page_recaps WHERE slug = $1 AND episode_slug = $2 LIMIT 1`,
          [podcastSlug, episodeSlug]
        );
        if (ecRes.rows[0]?.entity_contexts_cache) {
          const raw = ecRes.rows[0].entity_contexts_cache;
          const ec = typeof raw === "string" ? JSON.parse(raw) : raw;
          entityContextsStr = Object.entries(ec)
            .map(([slug, desc]) => `- ${slug}: ${desc}`)
            .join("\n");
        }
      } catch (e) {}

      const recapContext = [
        `Podcast: ${recap.podcastName}`,
        `Episode: "${recap.episodeTitle}"`,
        recap.tldl ? `Summary: ${recap.tldl}` : "",
        recap.keyInsights ? `Key Insights: ${JSON.stringify(recap.keyInsights)}` : "",
        recap.keyTopics ? `Topics: ${JSON.stringify(recap.keyTopics)}` : "",
        entityContextsStr ? `People & Companies Mentioned:\n${entityContextsStr}` : "",
        recap.whatHappened ? `Full Recap:\n${recap.whatHappened}` : "",
      ].filter(Boolean).join("\n\n");

      let entityFocus = "";
      if (entityName && entityType) {
        entityFocus = `\n\nThe user is specifically asking about ${entityType === "person" ? "the person" : entityType === "company" ? "the company" : entityType === "book" ? "the book" : "the topic"} "${entityName}" in the context of this episode.`;
      }

      const hasTranscript = transcript.length > 0;
      const systemPrompt = `You are PodCap's AI assistant. You help users understand podcast episodes better. You have access to ${hasTranscript ? "the full transcript and a detailed recap" : "a detailed recap"} of this episode. Answer questions based on what was actually discussed in the episode. Be conversational, specific, and reference actual points from the episode. Keep answers concise (2-4 sentences for simple questions, up to a short paragraph for complex ones).${entityFocus}

Episode context:
${recapContext}${hasTranscript ? `\n\nFull Episode Transcript:\n${transcript}` : ""}`;

      const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: systemPrompt },
      ];

      if (conversationHistory && Array.isArray(conversationHistory)) {
        for (const msg of conversationHistory.slice(-6)) {
          const role = msg.role === "assistant" ? "assistant" : "user";
          const content = typeof msg.content === "string" ? msg.content.slice(0, 2000) : "";
          if (content) messages.push({ role, content });
        }
      }
      messages.push({ role: "user", content: question });

      const { openai } = await import("./replit_integrations/image/client");
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 500,
        temperature: 0.7,
      });

      const answer = completion.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
      res.json({ answer });
    } catch (err) {
      console.error("[EpisodeChat] Error:", err);
      res.status(500).json({ error: "Failed to generate response" });
    }
  });

  setTimeout(async () => {
    try {
      console.log("[Cache] Pre-warming directory caches on startup...");
      const [peopleData, companiesData, topicsData] = await Promise.all([
        computePeopleData(),
        computeCompaniesData(),
        computeTopicsData(),
      ]);
      directoryCache.people.set(peopleData);
      directoryCache.companies.set(companiesData);
      directoryCache.topics.set(topicsData);
      console.log(`[Cache] Pre-warmed people (${peopleData.length}), companies (${companiesData.length}), topics (${topicsData.length}) caches`);
    } catch (err) {
      console.error("[Cache] Pre-warm failed:", err);
    }
  }, 5000);

  return httpServer;
}
