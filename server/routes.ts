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
import { generateRecap, DEFAULT_RECAP_PROMPT } from "./recapGenerator";
import { ITUNES_ID_TO_SLUG } from "./podcastLandingMap";
import { pool } from "./db";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    isAdmin?: boolean;
    impersonatingUserId?: number;
    originalUserId?: number;
  }
}

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
        xml += `  <url>\n`;
        xml += `    <loc>${DOMAIN}/podcasts/${slug}/${recap.episodeSlug}/transcript</loc>\n`;
        xml += `    <lastmod>${today}</lastmod>\n`;
        xml += `    <changefreq>monthly</changefreq>\n`;
        xml += `    <priority>0.5</priority>\n`;
        xml += `  </url>\n`;
      }
    }
  } catch (err) {
    console.error("[Sitemap] Error fetching recaps:", err);
  }

  const PEOPLE_SLUGS = ["elon-musk", "sam-altman", "joe-rogan", "lex-fridman", "naval-ravikant", "peter-thiel", "chamath-palihapitiya", "jason-calacanis", "marc-andreessen", "jensen-huang", "alex-hormozi", "gary-vaynerchuk", "codie-sanchez", "sahil-bloom", "andrew-huberman", "seth-godin", "chris-do", "scott-galloway", "simon-sinek", "adam-grant", "ramit-sethi", "ryan-holiday", "tim-ferriss", "mark-cuban", "patrick-bet-david", "james-clear", "jenna-kutcher", "amy-porterfield", "john-lee-dumas", "sam-parr", "shaan-puri", "justin-welsh", "hala-taha", "noah-kagan", "aaron-levie", "matthew-prince", "luis-von-ahn", "alex-karp", "brian-chesky", "daniel-ek", "brian-armstrong", "george-kurtz", "ariane-gorin", "jeremy-allaire", "dharmesh-shah", "jason-robins", "mark-zuckerberg", "satya-nadella", "tim-cook", "jeff-bezos", "reed-hastings", "marc-benioff", "ken-griffin", "martina-cheung", "patrick-smith", "sridhar-ramaswamy", "brian-niccol"];
  for (const pSlug of PEOPLE_SLUGS) {
    xml += `  <url>\n`;
    xml += `    <loc>${DOMAIN}/people/${pSlug}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>weekly</changefreq>\n`;
    xml += `    <priority>0.7</priority>\n`;
    xml += `  </url>\n`;
  }

  const COMPANY_SLUGS = ["openai", "tesla", "nvidia", "google", "microsoft", "apple", "amazon", "anthropic", "meta", "spacex", "box", "cloudflare", "duolingo", "palantir", "airbnb", "spotify", "coinbase", "crowdstrike", "expedia", "circle", "hubspot", "draftkings", "netflix", "salesforce", "citadel-securities", "sp-global", "axon-enterprise", "snowflake", "starbucks", "adobe", "shopify"];
  for (const cSlug of COMPANY_SLUGS) {
    xml += `  <url>\n`;
    xml += `    <loc>${DOMAIN}/companies/${cSlug}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>weekly</changefreq>\n`;
    xml += `    <priority>0.7</priority>\n`;
    xml += `  </url>\n`;
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

  app.get("/sitemap.xml", async (_req, res) => {
    res.set("Content-Type", "application/xml");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(await buildSitemap());
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
        quoteHtml = `<blockquote>"${escapeXml(recap.quote)}"${recap.quoteAttribution ? ` — ${escapeXml(recap.quoteAttribution)}` : ""}</blockquote>`;
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
      xml += `    <title>${escapeXml(recap.podcastName + " — " + recap.episodeTitle)}</title>\n`;
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
        "PodCap — All Podcast Recaps",
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
        `PodCap — ${feed.name}`,
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

  app.get("/api/founder-podcasts", async (req, res) => {
    try {
      const FOUNDER_EMAIL = "hiderekjohnson@gmail.com";
      const founder = await storage.getUserByEmail(FOUNDER_EMAIL);
      if (!founder || !founder.podcasts || founder.podcasts.length === 0) {
        return res.json({ podcasts: [] });
      }
      const podcastDetails: { id: string; name: string; artistName: string; artworkUrl: string }[] = [];
      for (const raw of founder.podcasts) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.id && parsed.name) {
            podcastDetails.push({
              id: parsed.id,
              name: parsed.name,
              artistName: parsed.artistName || "",
              artworkUrl: parsed.artworkUrl || "",
            });
            continue;
          }
        } catch {}
        try {
          const lookupUrl = `https://itunes.apple.com/lookup?id=${encodeURIComponent(raw)}&media=podcast`;
          const lookupRes = await fetch(lookupUrl);
          const lookupData = await lookupRes.json();
          if (lookupData.results && lookupData.results.length > 0) {
            const item = lookupData.results[0];
            podcastDetails.push({
              id: String(item.collectionId),
              name: item.collectionName,
              artistName: item.artistName,
              artworkUrl: item.artworkUrl100,
            });
          }
        } catch {}
      }
      res.json({ podcasts: podcastDetails });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch founder podcasts" });
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
        artworkUrl: item.artworkUrl100,
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
    { slug: "stig-brodersen", name: "Stig Brodersen", title: "Co-founder of The Investor\'s Podcast Network",  gender: "male", category: "Finance & Investing", searchTerms: ["Stig Brodersen"], hostedSlugs: ["westudybillionaires"] }
  ];

  const ENTITY_COMPANIES = [
    { slug: "openai", name: "OpenAI", description: "AI research and deployment company behind ChatGPT and GPT-4", searchTerms: ["OpenAI", "ChatGPT", "GPT-4"] },
    { slug: "tesla", name: "Tesla", description: "Electric vehicle and clean energy company", searchTerms: ["Tesla"] },
    { slug: "nvidia", name: "NVIDIA", description: "Semiconductor company powering AI and gaming", searchTerms: ["NVIDIA", "Nvidia"] },
    { slug: "google", name: "Google", description: "Technology company and search engine giant", searchTerms: ["Google", "Alphabet", "DeepMind"] },
    { slug: "microsoft", name: "Microsoft", description: "Technology company behind Windows, Azure, and Copilot", searchTerms: ["Microsoft"] },
    { slug: "apple", name: "Apple", description: "Consumer electronics and software company", searchTerms: ["Apple Inc", "Apple's"] },
    { slug: "amazon", name: "Amazon", description: "E-commerce and cloud computing giant", searchTerms: ["Amazon", "AWS"] },
    { slug: "anthropic", name: "Anthropic", description: "AI safety company behind Claude", searchTerms: ["Anthropic"] },
    { slug: "meta", name: "Meta", description: "Social media and metaverse company", searchTerms: ["Meta Platforms", "Facebook", "Zuckerberg"] },
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
    { slug: "microsoft-ai", name: "Microsoft AI", description: "Microsoft's AI division leading Copilot and consumer AI products", searchTerms: ["Microsoft AI", "Copilot"] },
    { slug: "scale-ai", name: "Scale AI", description: "AI data infrastructure and training data platform", searchTerms: ["Scale AI"] },
    { slug: "perplexity", name: "Perplexity", description: "AI-powered answer engine challenging traditional search", searchTerms: ["Perplexity"] },
    { slug: "tiny", name: "Tiny", description: "Holding company acquiring and operating internet businesses", searchTerms: ["Tiny Capital", "Tiny Corp"] },
    { slug: "contrarian-thinking", name: "Contrarian Thinking", description: "Business acquisition education and investment platform", searchTerms: ["Contrarian Thinking"] },
    { slug: "acquisition-com", name: "Acquisition.com", description: "Business investment and growth portfolio company", searchTerms: ["Acquisition.com"] },
    { slug: "vaynerx", name: "VaynerX", description: "Modern-day communications holding company", searchTerms: ["VaynerX", "VaynerMedia"] },
  ];

  function termMatchesInText(text: string, term: string): boolean {
    const lower = term.toLowerCase();
    const textLower = text.toLowerCase();
    if (lower.length <= 4) {
      const regex = new RegExp(`\\b${lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return regex.test(text);
    }
    return textLower.includes(lower);
  }

  function buildSearchCondition(fields: string[], paramIndex: number, term: string): { sql: string; param: string } {
    if (term.length <= 4) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return {
        sql: fields.map(f => `${f} ~* $${paramIndex}`).join(" OR "),
        param: `\\m${escaped}\\M`,
      };
    }
    return {
      sql: fields.map(f => `${f} ILIKE $${paramIndex}`).join(" OR "),
      param: `%${term}%`,
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

  let peopleCacheData: any[] | null = null;
  let peopleCacheTime = 0;
  const PEOPLE_CACHE_TTL = 5 * 60 * 1000;

  async function computePeopleData() {
    const { pool: dbPool } = await import("./db");
    const client = await dbPool.connect();
    try {
      const { rows: allRecaps } = await client.query(
        `SELECT slug, episode_slug, guests, episode_title, what_happened, tldl, key_insights::text as key_insights_text FROM landing_page_recaps`
      );

      const results = [];
      for (const person of ENTITY_PEOPLE) {
        const hostedSet = new Set(person.hostedSlugs);
        const filtered = allRecaps.filter((r: any) => !hostedSet.has(r.slug));

        const guestRows = filtered.filter((r: any) => {
          return person.searchTerms.some(term => {
            const t = term.toLowerCase();
            return (r.guests && r.guests.toLowerCase().includes(t)) ||
                   (r.episode_title && r.episode_title.toLowerCase().includes(t));
          });
        });
        const guestKeys = new Set(guestRows.map((r: any) => `${r.slug}/${r.episode_slug}`));

        const mentionRows = filtered.filter((r: any) => {
          if (guestKeys.has(`${r.slug}/${r.episode_slug}`)) return false;
          return person.searchTerms.some(term => {
            if (term.length <= 4) {
              const regex = new RegExp(`\\b${term}\\b`, 'i');
              return (r.what_happened && regex.test(r.what_happened)) ||
                     (r.tldl && regex.test(r.tldl)) ||
                     (r.key_insights_text && regex.test(r.key_insights_text));
            }
            const t = term.toLowerCase();
            return (r.what_happened && r.what_happened.toLowerCase().includes(t)) ||
                   (r.tldl && r.tldl.toLowerCase().includes(t)) ||
                   (r.key_insights_text && r.key_insights_text.toLowerCase().includes(t));
          });
        });

        results.push({
          slug: person.slug,
          name: person.name,
          title: person.title,
          gender: person.gender,
          category: person.category,
          mentionCount: mentionRows.length,
          guestCount: guestRows.length,
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
      const now = Date.now();
      if (peopleCacheData && (now - peopleCacheTime) < PEOPLE_CACHE_TTL) {
        return res.json(peopleCacheData);
      }
      const results = await computePeopleData();
      peopleCacheData = results;
      peopleCacheTime = Date.now();
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
          return `(guests ILIKE ${p} OR episode_title ILIKE ${p})`;
        }).join(" OR ");
        const guestParams = [...person.searchTerms.map(t => `%${t}%`), ...extraParams];
        const { rows: guestEpisodes } = await client.query(
          `SELECT slug, episode_slug, podcast_name, episode_title, publish_date, artwork_url, what_happened, tldl, key_insights::text as key_insights_text FROM landing_page_recaps WHERE (${guestConditions})${excludeCondition} ORDER BY publish_date DESC`,
          guestParams
        );

        const mentionParts = person.searchTerms.map((t, i) => buildSearchCondition(["what_happened", "tldl", "key_insights::text"], i + 1, t));
        const mentionConditions = mentionParts.map(p => `(${p.sql})`).join(" OR ");
        const mentionParams = [...mentionParts.map(p => p.param), ...extraParams];
        const { rows: mentionEpisodes } = await client.query(
          `SELECT slug, episode_slug, podcast_name, episode_title, publish_date, artwork_url, what_happened, tldl, key_insights::text as key_insights_text FROM landing_page_recaps WHERE (${mentionConditions})${excludeCondition} ORDER BY publish_date DESC`,
          mentionParams
        );

        const guestKeys = new Set(guestEpisodes.map((e: any) => `${e.slug}/${e.episode_slug}`));
        const mentionsOnly = mentionEpisodes
          .filter((e: any) => !guestKeys.has(`${e.slug}/${e.episode_slug}`))
          .map((e: any) => ({
            slug: e.slug,
            episode_slug: e.episode_slug,
            podcast_name: e.podcast_name,
            episode_title: e.episode_title,
            publish_date: e.publish_date,
            artwork_url: e.artwork_url,
            context: extractMentionContext([e.what_happened, e.tldl, e.key_insights_text].filter(Boolean), person.searchTerms),
          }));

        const guestAppearancesWithContext = guestEpisodes.map((e: any) => ({
          slug: e.slug,
          episode_slug: e.episode_slug,
          podcast_name: e.podcast_name,
          episode_title: e.episode_title,
          publish_date: e.publish_date,
          artwork_url: e.artwork_url,
          context: extractMentionContext([e.what_happened, e.tldl, e.key_insights_text].filter(Boolean), person.searchTerms),
        }));

        res.json({
          name: person.name,
          title: person.title,
          slug,
          guestAppearances: guestAppearancesWithContext,
          mentions: mentionsOnly,
          guestCount: guestAppearancesWithContext.length,
          mentionCount: mentionsOnly.length,
        });
      } finally {
        client.release();
      }
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch person" });
    }
  });

  let companiesCacheData: any[] | null = null;
  let companiesCacheTime = 0;

  async function computeCompaniesData() {
    const { pool: dbPool } = await import("./db");
    const client = await dbPool.connect();
    try {
      const { rows: allRecaps } = await client.query(
        `SELECT what_happened, tldl, key_insights::text as key_insights_text FROM landing_page_recaps`
      );

      const results = [];
      for (const company of ENTITY_COMPANIES) {
        let mentionCount = 0;
        for (const row of allRecaps) {
          const matched = company.searchTerms.some(term => {
            if (term.length <= 4) {
              const regex = new RegExp(`\\b${term}\\b`, 'i');
              return (row.what_happened && regex.test(row.what_happened)) ||
                     (row.tldl && regex.test(row.tldl)) ||
                     (row.key_insights_text && regex.test(row.key_insights_text));
            }
            const t = term.toLowerCase();
            return (row.what_happened && row.what_happened.toLowerCase().includes(t)) ||
                   (row.tldl && row.tldl.toLowerCase().includes(t)) ||
                   (row.key_insights_text && row.key_insights_text.toLowerCase().includes(t));
          });
          if (matched) mentionCount++;
        }
        results.push({ slug: company.slug, name: company.name, description: company.description, mentionCount });
      }
      results.sort((a, b) => b.mentionCount - a.mentionCount);
      return results;
    } finally {
      client.release();
    }
  }

  app.get("/api/entities/companies", async (_req, res) => {
    try {
      const now = Date.now();
      if (companiesCacheData && (now - companiesCacheTime) < PEOPLE_CACHE_TTL) {
        return res.json(companiesCacheData);
      }
      const results = await computeCompaniesData();
      companiesCacheData = results;
      companiesCacheTime = Date.now();
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch companies" });
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
        const parts = company.searchTerms.map((t, i) => buildSearchCondition(["what_happened", "tldl", "key_insights::text"], i + 1, t));
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
          context: extractMentionContext([e.what_happened, e.tldl, e.key_insights_text].filter(Boolean), company.searchTerms),
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

  app.get("/api/podcasts/:slug/:episodeSlug/transcript-segments", async (req, res) => {
    try {
      const { slug, episodeSlug } = req.params;
      const segments = await storage.getTranscriptSegmentsBySlug(slug, episodeSlug);
      if (!segments || segments.length === 0) {
        return res.status(404).json({ error: "Transcript not found" });
      }

      const recap = await storage.getLandingPageRecapBySlug(slug, episodeSlug);
      const allRecaps = await storage.getLandingPageRecaps(slug, 50);
      const itunesId = recap?.itunesId || allRecaps.find(r => r.itunesId)?.itunesId || "";

      const totalWords = segments.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
      const readingMinutes = Math.ceil(totalWords / 200);
      const hasTimestamps = segments.some(s => s.timestampLabel);

      const appleEpisodeUrl = (recap as any)?.appleEpisodeUrl || "";
      const podcastName = recap?.podcastName || slug;
      const episodeTitle = recap?.episodeTitle || episodeSlug;

      res.json({
        segments: segments.map(s => ({
          id: s.id,
          text: s.text,
          anchorId: s.anchorId,
          timestampLabel: s.timestampLabel,
          speakerName: s.speakerName,
          sequenceIndex: s.sequenceIndex,
        })),
        meta: {
          podcastName,
          podcastSlug: slug,
          episodeTitle,
          episodeSlug,
          itunesId,
          publishDate: recap?.publishDate || "",
          duration: recap?.duration || "",
          artworkUrl: recap?.artworkUrl || "",
          hosts: recap?.hosts || "",
          appleEpisodeUrl,
          totalSegments: segments.length,
          totalWords,
          readingMinutes,
          hasTimestamps,
        },
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch transcript segments" });
    }
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

  app.get("/api/podcasts/:slug/recaps/:episodeSlug", async (req, res) => {
    try {
      const recap = await storage.getLandingPageRecapBySlug(req.params.slug, req.params.episodeSlug);
      if (!recap) return res.status(404).json({ error: "Recap not found" });
      res.json(recap);
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
          secondary: ["SaaS", "early-stage", "pivot", "launch", "incubator", "accelerator", "Y Combinator"],
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
          secondary: ["CEO", "executive", "leader", "vision", "organizational culture", "servant leadership"],
          minScore: 3,
        },
        "management": {
          primary: ["management", "managing teams", "organizational design"],
          secondary: ["operations", "organizational", "hiring", "team building", "performance review"],
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
        "innovation": {
          primary: ["innovation", "disruptive innovation", "breakthrough technology"],
          secondary: ["disruption", "breakthrough", "R&D", "invention", "paradigm shift"],
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
        "human-performance": {
          primary: ["peak performance", "human performance", "high performance"],
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
          secondary: ["media", "creator economy", "streaming", "podcast", "newsletter", "content strategy"],
          minScore: 3,
        },
        "geopolitics": {
          primary: ["geopolitics", "geopolitical", "foreign policy", "international relations"],
          secondary: ["diplomacy", "international", "sanctions", "trade war", "national security"],
          minScore: 3,
        },
      };

      const topicConfig = topicKeywordsMap[slug];
      if (!topicConfig) return res.json([]);
      const { primary, secondary, minScore } = topicConfig;
      const allKeywords = [...primary, ...secondary];

      const { pool: dbPool } = await import("./db");
      const client = await dbPool.connect();
      try {
        const conditions = allKeywords.map((_, i) => {
          const p = `$${i + 1}`;
          return `(episode_title ILIKE ${p} OR what_happened ILIKE ${p} OR tldl ILIKE ${p} OR key_insights::text ILIKE ${p})`;
        }).join(" OR ");
        const params = allKeywords.map(k => `%${k}%`);
        const { rows } = await client.query(
          `SELECT slug, episode_slug, podcast_name, episode_title, publish_date, artwork_url, tldl, what_happened, key_insights
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
      } finally {
        client.release();
      }
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch topic episodes" });
    }
  });

  const askRateLimit = new Map<string, number[]>();
  app.post("/api/podcasts/:slug/:episodeSlug/ask", async (req, res) => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      const now = Date.now();
      const windowMs = 60000;
      const maxRequests = 10;
      const reqs = (askRateLimit.get(clientIp) || []).filter(t => now - t < windowMs);
      if (reqs.length >= maxRequests) {
        return res.status(429).json({ error: "Too many requests. Please wait a moment." });
      }
      reqs.push(now);
      askRateLimit.set(clientIp, reqs);

      const { slug, episodeSlug } = req.params;
      const { question } = req.body;
      if (!question || typeof question !== "string" || question.trim().length < 3 || question.trim().length > 500) {
        return res.status(400).json({ error: "Please provide a valid question (3-500 characters)" });
      }

      const segments = await storage.getTranscriptSegmentsBySlug(slug, episodeSlug);
      if (!segments || segments.length === 0) {
        return res.status(404).json({ error: "Transcript not available for this episode" });
      }

      const transcriptText = segments.map(s => s.text).join(" ").slice(0, 12000);
      const recap = await storage.getLandingPageRecapBySlug(slug, episodeSlug);

      const { openai } = await import("./replit_integrations/image/client");
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are PodCap, an AI assistant that answers questions about podcast episodes based on their transcripts. Answer concisely in 2-3 paragraphs. Only use information from the transcript provided. If the transcript doesn't contain relevant information, say so honestly.`
          },
          {
            role: "user",
            content: `Podcast: ${recap?.podcastName || slug}\nEpisode: "${recap?.episodeTitle || episodeSlug}"\n\nTranscript excerpt:\n${transcriptText}\n\nQuestion: ${question.trim()}`
          }
        ],
        max_tokens: 1500,
        temperature: 0.5,
      });

      const answer = completion.choices[0]?.message?.content || "Unable to generate an answer.";
      res.json({ answer, question: question.trim() });
    } catch (err) {
      console.error("[AskEpisode] Error:", err);
      res.status(500).json({ error: "Failed to generate answer" });
    }
  });

  app.get("/api/podcasts/:slug/:episodeSlug/sponsors", async (req, res) => {
    try {
      const { slug, episodeSlug } = req.params;
      const recap = await storage.getLandingPageRecapBySlug(slug, episodeSlug);
      if (!recap) return res.status(404).json({ error: "Recap not found" });

      if (recap.sponsors) {
        try {
          return res.json({ sponsors: JSON.parse(recap.sponsors) });
        } catch {
          return res.json({ sponsors: [] });
        }
      }

      const segments = await storage.getTranscriptSegmentsBySlug(slug, episodeSlug);

      const showNotes = recap.showNotes || "";

      if ((!segments || segments.length === 0) && !showNotes) {
        return res.json({ sponsors: [] });
      }

      const transcriptText = segments
        ? segments.map(s => {
            const speaker = s.speakerName ? `${s.speakerName}: ` : "";
            return `${speaker}${s.text}`;
          }).join("\n").slice(0, 16000)
        : "";

      const showNotesSection = showNotes
        ? `\n\nSHOW NOTES (from the podcast's official listing — these often contain accurate sponsor names and URLs):\n${showNotes.slice(0, 5000)}`
        : "";

      const { openai } = await import("./replit_integrations/image/client");
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert at identifying sponsor mentions in podcasts. You will be given a transcript AND/OR the official show notes from the podcast listing. Extract ALL sponsor/advertiser mentions with RICH detail from the actual ad read. For each sponsor, extract:
- "name": The sponsor or brand name
- "description": A detailed summary of the sponsor's product/service as described in the ad read (2-4 sentences). Include what the product does, why the host recommends it, and any specific benefits mentioned.
- "deal": The SPECIFIC deal or offer for listeners. Extract the EXACT offer from the ad read — e.g. "New subscribers get a free welcome kit worth $87 including AG1 and AGZ travel packs plus vitamin D3+K2", "Get 20% off your first order", "First month free", etc. Be specific with dollar amounts, percentages, free items, and trial lengths. If no specific deal is mentioned, return null.
- "couponCode": Any promo/coupon code mentioned (or null)
- "url": The sponsor's URL. IMPORTANT: Extract the EXACT URL the host tells listeners to visit, including any custom slug (e.g. "drinkag1.com/tim", "athleticgreens.com/huberman"). If the show notes contain a link for the sponsor, prefer that. If the host verbally mangles the URL, try to reconstruct the correct one. If neither source has a URL, return null.
- "callToAction": The host's exact call to action — what they tell listeners to DO. e.g. "Visit drinkag1.com/tim to claim your free welcome kit", "Go to circle.so/tim to start your free trial", "Head to example.com and use code TIM at checkout". Quote or closely paraphrase the host's actual words. If no clear CTA, return null.

Return a JSON object with a "sponsors" array. If no sponsors are found, return {"sponsors": []}.
Only include actual paid sponsors/advertisers — not casual brand mentions or the podcast's own links. Look for patterns like "brought to you by", "sponsored by", "this episode is presented by", "our partners at", promo code mentions, special URLs, sections labeled "Sponsors" in show notes, etc.
Cross-reference the transcript and show notes: the show notes often have the correct URLs that hosts mention verbally (and may mangle). Prefer show notes URLs over transcript URLs.`
          },
          {
            role: "user",
            content: `Podcast: ${recap.podcastName}\nEpisode: "${recap.episodeTitle}"\n\n${transcriptText ? `TRANSCRIPT:\n${transcriptText}` : "(No transcript available)"}${showNotesSection}`
          }
        ],
        max_tokens: 2000,
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const content = completion.choices[0]?.message?.content || '{"sponsors":[]}';
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = { sponsors: [] };
      }

      const rawSponsors = Array.isArray(parsed.sponsors) ? parsed.sponsors : [];
      const sponsors = rawSponsors
        .filter((s: any) => s && typeof s.name === "string" && s.name.trim())
        .map((s: any) => ({
          name: String(s.name).trim(),
          description: typeof s.description === "string" ? s.description.trim() : "",
          deal: typeof s.deal === "string" && s.deal.trim() ? s.deal.trim() : null,
          couponCode: typeof s.couponCode === "string" && s.couponCode.trim() ? s.couponCode.trim() : null,
          url: typeof s.url === "string" && s.url.trim() ? s.url.trim() : null,
          callToAction: typeof s.callToAction === "string" && s.callToAction.trim() ? s.callToAction.trim() : null,
        }));

      const { db } = await import("./db");
      const { eq, and } = await import("drizzle-orm");
      const { landingPageRecaps } = await import("@shared/schema");
      await db.update(landingPageRecaps)
        .set({ sponsors: JSON.stringify(sponsors) })
        .where(
          and(
            eq(landingPageRecaps.slug, slug),
            eq(landingPageRecaps.episodeSlug, episodeSlug)
          )
        );

      res.json({ sponsors });
    } catch (err) {
      console.error("[Sponsors] Error:", err);
      res.status(500).json({ error: "Failed to extract sponsors" });
    }
  });

  const resourcesInFlight = new Map<string, Promise<any>>();
  app.get("/api/podcasts/:slug/:episodeSlug/resources", async (req, res) => {
    try {
      const { slug, episodeSlug } = req.params;
      const recap = await storage.getLandingPageRecapBySlug(slug, episodeSlug);
      if (!recap) return res.status(404).json({ error: "Recap not found" });

      if (recap.resources) {
        try {
          return res.json({ resources: JSON.parse(recap.resources) });
        } catch {
          return res.json({ resources: [] });
        }
      }

      const segments = await storage.getTranscriptSegmentsBySlug(slug, episodeSlug);
      const showNotes = recap.showNotes || "";

      if ((!segments || segments.length === 0) && !showNotes) {
        const emptyResult: any[] = [];
        const { db } = await import("./db");
        const { eq, and } = await import("drizzle-orm");
        const { landingPageRecaps } = await import("@shared/schema");
        await db.update(landingPageRecaps)
          .set({ resources: JSON.stringify(emptyResult) })
          .where(and(eq(landingPageRecaps.slug, slug), eq(landingPageRecaps.episodeSlug, episodeSlug)));
        return res.json({ resources: [] });
      }

      const flightKey = `${slug}/${episodeSlug}`;
      if (resourcesInFlight.has(flightKey)) {
        const cached = await resourcesInFlight.get(flightKey);
        return res.json({ resources: cached });
      }

      const extractionPromise = (async () => {
        const transcriptText = segments
          ? segments.map(s => {
              const speaker = s.speakerName ? `${s.speakerName}: ` : "";
              return `${speaker}${s.text}`;
            }).join("\n").slice(0, 20000)
          : "";

        const showNotesSection = showNotes
          ? `\n\nSHOW NOTES (official listing with links):\n${showNotes.slice(0, 5000)}`
          : "";

        let sponsorNames: string[] = [];
        if (recap.sponsors) {
          try {
            const parsed = JSON.parse(recap.sponsors);
            if (Array.isArray(parsed)) {
              sponsorNames = parsed.map((s: any) => s.name).filter(Boolean);
            }
          } catch {}
        }
        const sponsorExclusionNote = sponsorNames.length > 0
          ? `\n\nKNOWN SPONSORS FOR THIS EPISODE (EXCLUDE ALL OF THESE): ${sponsorNames.join(", ")}`
          : "";

        const { openai } = await import("./replit_integrations/image/client");
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are an expert at extracting shoppable items — things people can BUY or SUBSCRIBE to — mentioned in podcast episodes. Analyze the transcript and show notes to find products, books, supplements, gear, software, apps, courses, and other purchasable items that hosts or guests organically mention, recommend, or use.

ONLY include items that someone could actually purchase, download, or subscribe to. Do NOT include:
- TV shows, movies, organizations, concepts, methodologies, or general knowledge topics
- People, places, or abstract ideas
- Anything that isn't a buyable/subscribable product or service

For each item, provide:
- "name": The product name (book title, supplement name, app name, etc.)
- "type": One of: "book", "supplement", "tool", "app", "software", "course", "newsletter", "product", "gear", "service"
- "description": A brief 1-2 sentence description of what this product is and why it was mentioned
- "url": For books AND physical products (supplements, gear, etc.), use an Amazon search URL: "https://www.amazon.com/s?k=PRODUCT+NAME&tag=podcap-20". For software/apps/courses/newsletters, use their actual website URL if mentioned. If no URL is available, use null.
- "author": For books, the author name. For products/tools, the company name. null if unknown.
- "context": One sentence about WHY this was mentioned (e.g. "Host takes this supplement daily", "Guest recommended this book as life-changing")

IMPORTANT RULES:
1. For ALL books, always use an Amazon URL with affiliate tag: https://www.amazon.com/s?k=BOOK+TITLE+AUTHOR&tag=podcap-20
2. For physical products (supplements, gear, equipment, food products), also use Amazon affiliate URLs: https://www.amazon.com/s?k=PRODUCT+NAME&tag=podcap-20
3. STRICTLY exclude ALL sponsors, advertisers, and paid promotions. A list of KNOWN SPONSORS will be provided — exclude every single one by name. If something is introduced with language like "brought to you by", "sponsored by", "this episode is presented by", or has a promo code — exclude it.
4. Only include items genuinely discussed or recommended in organic conversation — NOT during ad segments
5. For software/apps/websites, prefer the actual product URL from show notes or transcript over Amazon
6. When in doubt whether something is a sponsor or organic, EXCLUDE it

Return a JSON object: {"resources": [...]}
If no resources are found, return {"resources": []}.`
            },
            {
              role: "user",
              content: `Podcast: "${recap.podcastName}"\nEpisode: "${recap.episodeTitle}"\nHosts: ${recap.hosts || "unknown"}${sponsorExclusionNote}\n\n${transcriptText ? `TRANSCRIPT:\n${transcriptText}` : "(No transcript available)"}${showNotesSection}`
            }
          ],
          max_tokens: 4000,
          temperature: 0.3,
          response_format: { type: "json_object" },
        });

        const content = completion.choices[0]?.message?.content || '{"resources":[]}';
        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch {
          parsed = { resources: [] };
        }

        const rawResources = Array.isArray(parsed.resources) ? parsed.resources : [];
        const resources = rawResources
          .filter((r: any) => r && typeof r.name === "string" && r.name.trim())
          .map((r: any) => ({
            name: String(r.name).trim(),
            type: typeof r.type === "string" ? r.type.trim() : "other",
            description: typeof r.description === "string" ? r.description.trim() : "",
            url: typeof r.url === "string" && r.url.trim() ? r.url.trim() : null,
            author: typeof r.author === "string" && r.author.trim() ? r.author.trim() : null,
            context: typeof r.context === "string" ? r.context.trim() : "",
          }));

        const { db } = await import("./db");
        const { eq, and } = await import("drizzle-orm");
        const { landingPageRecaps } = await import("@shared/schema");
        await db.update(landingPageRecaps)
          .set({ resources: JSON.stringify(resources) })
          .where(and(eq(landingPageRecaps.slug, slug), eq(landingPageRecaps.episodeSlug, episodeSlug)));

        return resources;
      })();

      resourcesInFlight.set(flightKey, extractionPromise);
      try {
        const resources = await extractionPromise;
        res.json({ resources });
      } finally {
        resourcesInFlight.delete(flightKey);
      }
    } catch (err) {
      console.error("[Resources] Error:", err);
      res.status(500).json({ error: "Failed to extract resources" });
    }
  });

  const guestsInFlight = new Map<string, Promise<any>>();
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

      const segments = await storage.getTranscriptSegmentsBySlug(slug, episodeSlug);
      if (!segments || segments.length === 0) {
        const emptyResult: any[] = [];
        const { db } = await import("./db");
        const { eq, and } = await import("drizzle-orm");
        const { landingPageRecaps } = await import("@shared/schema");
        await db.update(landingPageRecaps)
          .set({ guests: JSON.stringify(emptyResult) })
          .where(and(eq(landingPageRecaps.slug, slug), eq(landingPageRecaps.episodeSlug, episodeSlug)));
        return res.json({ guests: [] });
      }

      const flightKey = `${slug}/${episodeSlug}`;
      if (guestsInFlight.has(flightKey)) {
        const cached = await guestsInFlight.get(flightKey);
        return res.json({ guests: cached });
      }

      const extractionPromise = (async () => {
        const transcriptText = segments.map(s => {
          const speaker = s.speakerName ? `${s.speakerName}: ` : "";
          return `${speaker}${s.text}`;
        }).join("\n").slice(0, 20000);

        const { openai } = await import("./replit_integrations/image/client");
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are an expert at identifying podcast guests and providing detailed biographical information. Analyze the transcript to identify any GUESTS on this podcast episode. Guests are people who are interviewed, join as special visitors, or are brought on to discuss topics — NOT the regular hosts of the show.

For each guest you identify, provide:
- "name": Full name of the guest
- "title": Their current professional title/role (e.g. "CEO of Tesla", "Professor of Economics at MIT", "New York Times Bestselling Author")
- "bio": A detailed 4-6 sentence biography covering their career, notable achievements, background, and why they're relevant. Use your knowledge to write a comprehensive bio — not just what's mentioned in the transcript.
- "twitter": Their Twitter/X handle (e.g. "@elonmusk") — use your knowledge, or null if unknown
- "linkedin": Their LinkedIn profile URL (full URL) — use your knowledge, or null if unknown
- "instagram": Their Instagram handle (e.g. "@elonmusk") — use your knowledge, or null if unknown
- "website": Their personal or professional website URL — use your knowledge, or null if unknown
- "photoUrl": null (we'll handle photos separately)
- "topicsDiscussed": An array of 3-5 specific topics this guest discussed in the episode, based on the transcript content

Return a JSON object: {"guests": [...]}
If there are no guests (just regular hosts chatting), return {"guests": []}.
Be thorough in identifying guests — anyone who is introduced, interviewed, or joins the conversation as a visitor counts as a guest.`
            },
            {
              role: "user",
              content: `Podcast: "${recap.podcastName}"\nEpisode: "${recap.episodeTitle}"\nHosts listed: ${recap.hosts || "unknown"}\n\nTranscript:\n${transcriptText}`
            }
          ],
          max_tokens: 4000,
          temperature: 0.3,
          response_format: { type: "json_object" },
        });

        const content = completion.choices[0]?.message?.content || '{"guests":[]}';
        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch {
          parsed = { guests: [] };
        }

        const rawGuests = Array.isArray(parsed.guests) ? parsed.guests : [];
        const guests = rawGuests
          .filter((g: any) => g && typeof g.name === "string" && g.name.trim())
          .map((g: any) => ({
            name: String(g.name).trim(),
            title: typeof g.title === "string" ? g.title.trim() : "",
            bio: typeof g.bio === "string" ? g.bio.trim() : "",
            twitter: typeof g.twitter === "string" && g.twitter.trim() ? g.twitter.trim() : null,
            linkedin: typeof g.linkedin === "string" && g.linkedin.trim() ? g.linkedin.trim() : null,
            instagram: typeof g.instagram === "string" && g.instagram.trim() ? g.instagram.trim() : null,
            website: typeof g.website === "string" && g.website.trim() ? g.website.trim() : null,
            photoUrl: typeof g.photoUrl === "string" && g.photoUrl.trim() ? g.photoUrl.trim() : null,
            topicsDiscussed: Array.isArray(g.topicsDiscussed)
              ? g.topicsDiscussed.filter((t: any) => typeof t === "string").map((t: any) => String(t).trim())
              : [],
          }));

        const { db } = await import("./db");
        const { eq, and } = await import("drizzle-orm");
        const { landingPageRecaps } = await import("@shared/schema");
        await db.update(landingPageRecaps)
          .set({ guests: JSON.stringify(guests) })
          .where(and(eq(landingPageRecaps.slug, slug), eq(landingPageRecaps.episodeSlug, episodeSlug)));

        return guests;
      })();

      guestsInFlight.set(flightKey, extractionPromise);
      try {
        const guests = await extractionPromise;
        res.json({ guests });
      } finally {
        guestsInFlight.delete(flightKey);
      }
    } catch (err) {
      console.error("[Guests] Error:", err);
      res.status(500).json({ error: "Failed to extract guests" });
    }
  });

  const topQRateLimit = new Map<string, number[]>();
  const topQInFlight = new Map<string, Promise<any>>();
  app.get("/api/podcasts/:slug/top-questions", async (req, res) => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      const now = Date.now();
      const reqs = (topQRateLimit.get(clientIp) || []).filter(t => now - t < 60000);
      if (reqs.length >= 15) {
        return res.status(429).json({ error: "Too many requests. Please wait." });
      }
      reqs.push(now);
      topQRateLimit.set(clientIp, reqs);

      const { slug } = req.params;
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      const { podcastTopQuestions } = await import("@shared/schema");

      const existing = await db.select().from(podcastTopQuestions).where(eq(podcastTopQuestions.slug, slug)).limit(1);
      if (existing.length > 0) {
        let parsed: any[] = [];
        try { parsed = JSON.parse(existing[0].questions); } catch { parsed = []; }
        if (Array.isArray(parsed) && parsed.length > 0) {
          return res.json({ questions: parsed, slug, cached: true });
        }
      }

      if (topQInFlight.has(slug)) {
        try {
          const result = await topQInFlight.get(slug);
          return res.json(result);
        } catch {
          return res.status(500).json({ error: "Failed to generate top questions" });
        }
      }

      const generatePromise = (async () => {
        const recaps = await storage.getLandingPageRecaps(slug, 50, 0);
        if (!recaps || recaps.length === 0) {
          return { questions: [], slug };
        }

        const podcastName = recaps[0]?.podcastName || slug;
        const summaryContext = recaps.slice(0, 30).map(r =>
          `Episode: "${r.episodeTitle}"\nSummary: ${r.tldl || ""}\n${r.whatHappened ? r.whatHappened.slice(0, 200) : ""}`
        ).join("\n\n").slice(0, 12000);

        const { openai } = await import("./replit_integrations/image/client");
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are an SEO expert analyzing the podcast "${podcastName}". Generate exactly 5 questions that people would most likely type into Google when trying to learn about this podcast.

Rules:
- Questions should reflect common search queries about the podcast — what it covers, who hosts it, notable episodes, key topics, and why people listen
- Use natural, search-friendly phrasing. Examples of good questions: "What is the ${podcastName} about?", "Who hosts ${podcastName}?", "What topics are commonly discussed on ${podcastName}?", "What are some popular episodes of ${podcastName}?", "Why do people listen to ${podcastName}?"
- Include the podcast name in most questions for SEO value
- Each answer should be 1-2 paragraphs, clear and informative, summarizing across the podcast's episodes — not just one episode
- The goal is to help someone who has never heard of this podcast understand what it covers and why it's interesting

Return a JSON array of exactly 5 objects with "question" and "answer" fields. Return ONLY the JSON array, no other text.`
            },
            {
              role: "user",
              content: `Here are summaries from recent episodes of "${podcastName}":\n\n${summaryContext}\n\nGenerate 5 SEO-optimized questions and answers about this podcast.`
            }
          ],
          max_tokens: 3000,
          temperature: 0.7,
        });

        const raw = completion.choices[0]?.message?.content || "[]";
        let questions: { question: string; answer: string }[] = [];
        try {
          const jsonMatch = raw.match(/\[[\s\S]*\]/);
          questions = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
          if (!Array.isArray(questions)) questions = [];
          questions = questions.slice(0, 5).map(q => ({
            question: String(q.question || ""),
            answer: String(q.answer || ""),
          })).filter(q => q.question && q.answer);
        } catch {
          console.error("[TopQuestions] Failed to parse AI response for", slug);
          return { questions: [], slug };
        }

        if (questions.length > 0) {
          await db.insert(podcastTopQuestions).values({
            slug,
            questions: JSON.stringify(questions),
          }).onConflictDoUpdate({
            target: podcastTopQuestions.slug,
            set: { questions: JSON.stringify(questions), generatedAt: new Date() },
          });
        }

        return { questions, slug, cached: false };
      })();

      topQInFlight.set(slug, generatePromise);
      try {
        const result = await generatePromise;
        res.json(result);
      } catch (err) {
        console.error("[TopQuestions] Generation error:", err);
        res.status(500).json({ error: "Failed to generate top questions" });
      } finally {
        topQInFlight.delete(slug);
      }
    } catch (err) {
      console.error("[TopQuestions] Error:", err);
      res.status(500).json({ error: "Failed to generate top questions" });
    }
  });

  const podcastAskRateLimit = new Map<string, number[]>();
  app.post("/api/podcasts/:slug/ask", async (req, res) => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      const now = Date.now();
      const windowMs = 60000;
      const maxRequests = 10;
      const reqs = (podcastAskRateLimit.get(clientIp) || []).filter(t => now - t < windowMs);
      if (reqs.length >= maxRequests) {
        return res.status(429).json({ error: "Too many requests. Please wait a moment." });
      }
      reqs.push(now);
      podcastAskRateLimit.set(clientIp, reqs);

      const { slug } = req.params;
      const { question } = req.body;
      if (!question || typeof question !== "string" || question.trim().length < 3 || question.trim().length > 500) {
        return res.status(400).json({ error: "Please provide a valid question (3-500 characters)" });
      }

      const recaps = await storage.getLandingPageRecaps(slug, 100, 0);
      if (!recaps || recaps.length === 0) {
        return res.status(404).json({ error: "No episodes found for this podcast" });
      }

      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");

      const episodesWithTranscripts = await db.execute(sql`
        SELECT DISTINCT episode_slug FROM transcript_segments WHERE podcast_slug = ${slug}
      `);
      const transcriptEpisodeSlugs = new Set((episodesWithTranscripts.rows as any[]).map(r => r.episode_slug));

      const searchTerms = question.trim().toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2 && !["the","and","for","are","you","how","what","why","who","does","this","that","with","from","about","many","have","been","they","their","there","which","when","where","looking","episode","episodes","podcast"].includes(w));

      const tsQuery = searchTerms.slice(0, 6).join(" | ");

      let ftsSegments: { text: string; episodeSlug: string; episodeTitle: string; rank: number }[] = [];
      if (tsQuery) {
        const ftsResults = await db.execute(sql`
          SELECT ts.episode_slug, ts.text, lpr.episode_title,
                 ts_rank(to_tsvector('english', ts.text), to_tsquery('english', ${tsQuery})) as rank
          FROM transcript_segments ts
          LEFT JOIN landing_page_recaps lpr ON lpr.slug = ts.podcast_slug AND lpr.episode_slug = ts.episode_slug
          WHERE ts.podcast_slug = ${slug}
            AND to_tsvector('english', ts.text) @@ to_tsquery('english', ${tsQuery})
          ORDER BY rank DESC
          LIMIT 100
        `);
        if (ftsResults.rows) {
          ftsSegments = (ftsResults.rows as any[]).map(r => ({
            text: r.text,
            episodeSlug: r.episode_slug,
            episodeTitle: r.episode_title || r.episode_slug,
            rank: Number(r.rank),
          }));
        }
      }

      const segmentsByEpisode = new Map<string, { text: string; episodeTitle: string; rank: number }[]>();
      for (const seg of ftsSegments) {
        if (!segmentsByEpisode.has(seg.episodeSlug)) {
          segmentsByEpisode.set(seg.episodeSlug, []);
        }
        segmentsByEpisode.get(seg.episodeSlug)!.push({ text: seg.text, episodeTitle: seg.episodeTitle, rank: seg.rank });
      }

      let transcriptContext = "";
      const maxTranscriptChars = 60000;
      let usedChars = 0;

      if (ftsSegments.length > 0) {
        const episodeEntries = [...segmentsByEpisode.entries()]
          .sort((a, b) => {
            const maxRankA = Math.max(...a[1].map(s => s.rank));
            const maxRankB = Math.max(...b[1].map(s => s.rank));
            return maxRankB - maxRankA;
          });

        for (const [epSlug, segments] of episodeEntries) {
          if (usedChars >= maxTranscriptChars) break;
          const topSegs = segments.sort((a, b) => b.rank - a.rank).slice(0, 8);
          for (const seg of topSegs) {
            if (usedChars >= maxTranscriptChars) break;
            const line = `[${seg.episodeTitle}]: ${seg.text}`;
            transcriptContext += line + "\n\n";
            usedChars += line.length;
          }
        }
      }

      for (const recap of recaps) {
        if (usedChars >= maxTranscriptChars) break;
        if (recap.episodeSlug && transcriptEpisodeSlugs.has(recap.episodeSlug) && !segmentsByEpisode.has(recap.episodeSlug)) {
          const sampleSegs = await db.execute(sql`
            SELECT text FROM transcript_segments
            WHERE podcast_slug = ${slug} AND episode_slug = ${recap.episodeSlug}
            ORDER BY sequence_index ASC
            LIMIT 5
          `);
          if (sampleSegs.rows) {
            for (const r of sampleSegs.rows as any[]) {
              if (usedChars >= maxTranscriptChars) break;
              const line = `[${recap.episodeTitle}]: ${r.text}`;
              transcriptContext += line + "\n\n";
              usedChars += line.length;
            }
          }
        }
      }

      const allRecapSummaries = recaps.slice(0, 50).map(r =>
        `Episode: "${r.episodeTitle}"\nSummary: ${r.tldl || ""}\n${r.whatHappened ? r.whatHappened.slice(0, 300) : ""}`
      ).join("\n\n");

      const episodesCited = [
        ...new Set([
          ...ftsSegments.map(s => s.episodeTitle),
          ...recaps.slice(0, 20).map(r => r.episodeTitle),
        ])
      ].filter(Boolean).slice(0, 15);

      const { openai } = await import("./replit_integrations/image/client");
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are PodCap, an AI assistant that answers questions about the podcast "${recaps[0]?.podcastName || slug}". You have access to transcript data from ${transcriptEpisodeSlugs.size} episodes and summaries from ${recaps.length} total episodes. Answer in 2-3 paragraphs. Draw from multiple episodes when possible. Reference specific episodes by name when relevant. If you don't have enough information to answer fully, say so honestly.`
          },
          {
            role: "user",
            content: `Episode summaries (${recaps.length} episodes total):\n${allRecapSummaries.slice(0, 10000)}\n\nTranscript excerpts from ${transcriptEpisodeSlugs.size} episodes:\n${transcriptContext}\n\nQuestion: ${question.trim()}`
          }
        ],
        max_tokens: 1500,
        temperature: 0.5,
      });

      const answer = completion.choices[0]?.message?.content || "Unable to generate an answer.";
      res.json({ answer, question: question.trim(), episodesCited });
    } catch (err) {
      console.error("[AskPodcast] Error:", err);
      res.status(500).json({ error: "Failed to generate answer" });
    }
  });

  app.get("/api/podcasts/:slug/search", async (req, res) => {
    try {
      const { slug } = req.params;
      const q = (req.query.q as string || "").trim();
      if (!q || q.length < 2) return res.json({ results: [], query: q, total: 0 });

      const { pool } = await import("./db");
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT ts.episode_guid, ts.episode_slug, ts.text, ts.anchor_id, ts.timestamp_label, ts.speaker_name,
                  lpr.episode_title, lpr.publish_date
           FROM transcript_segments ts
           LEFT JOIN landing_page_recaps lpr ON lpr.slug = ts.podcast_slug AND lpr.episode_slug = ts.episode_slug
           WHERE ts.podcast_slug = $1 AND ts.text ILIKE '%' || $2 || '%'
           ORDER BY lpr.publish_date DESC NULLS LAST, ts.sequence_index ASC
           LIMIT 200`,
          [slug, q]
        );

        const episodeMap = new Map<string, {
          episodeTitle: string;
          episodeSlug: string;
          publishDate: string;
          hits: Array<{ text: string; anchorId: string; timestampLabel: string | null; speakerName: string | null }>;
        }>();

        for (const row of result.rows) {
          const epSlug = row.episode_slug;
          if (!episodeMap.has(epSlug)) {
            episodeMap.set(epSlug, {
              episodeTitle: row.episode_title || epSlug,
              episodeSlug: epSlug,
              publishDate: row.publish_date || "",
              hits: [],
            });
          }
          const entry = episodeMap.get(epSlug)!;
          if (entry.hits.length < 5) {
            const fullText = row.text as string;
            const lowerText = fullText.toLowerCase();
            const lowerQ = q.toLowerCase();
            const idx = lowerText.indexOf(lowerQ);
            if (idx === -1) continue;
            const start = Math.max(0, idx - 150);
            const end = Math.min(fullText.length, idx + q.length + 150);
            let snippet = fullText.substring(start, end).replace(/\s+/g, " ").trim();
            if (start > 0) snippet = "..." + snippet;
            if (end < fullText.length) snippet = snippet + "...";

            entry.hits.push({
              text: snippet,
              anchorId: row.anchor_id,
              timestampLabel: row.timestamp_label,
              speakerName: row.speaker_name,
            });
          }
        }

        const searchResults = Array.from(episodeMap.values()).map(ep => ({
          episodeTitle: ep.episodeTitle,
          episodeSlug: ep.episodeSlug,
          publishDate: ep.publishDate,
          mentions: result.rows.filter(r => r.episode_slug === ep.episodeSlug).length,
          hits: ep.hits,
        }));

        res.json({ results: searchResults.slice(0, 10), query: q, total: searchResults.length });
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error("Transcript search error:", err);
      res.status(500).json({ error: "Search failed" });
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
            artworkUrl600: r.artworkUrl600 || "",
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

      const settings = await storage.getEmailTemplateSettings();
      const result = await generateRecap(user, today, today, todayLabel, todayStr, "latest", settings.recapPrompt || undefined);
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
        subject: `☕ Your PodCap Daily Recap — ${new Date(recap.recapDate).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`,
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

  app.post("/api/admin/clear-sponsors-cache", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { db } = await import("./db");
      const { landingPageRecaps } = await import("@shared/schema");
      const { isNotNull } = await import("drizzle-orm");
      const result = await db.update(landingPageRecaps)
        .set({ sponsors: null as any })
        .where(isNotNull(landingPageRecaps.sponsors));
      res.json({ message: `Cleared sponsors cache. Sponsors will be re-extracted (using show notes) on next visit.` });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to clear sponsors cache" });
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

  app.post("/api/admin/backfill-sponsors", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { pool: dbPool } = await import("./db");
      const client = await dbPool.connect();
      try {
        const { rows: recaps } = await client.query(
          `SELECT slug, episode_slug FROM landing_page_recaps WHERE sponsors IS NULL ORDER BY slug, id`
        );
        console.log(`[BackfillSponsors] Starting backfill for ${recaps.length} episodes`);
        res.json({ message: `Sponsors backfill started for ${recaps.length} episodes.` });

        let done = 0, errors = 0;
        for (const recap of recaps) {
          try {
            const url = `http://localhost:${process.env.PORT || 5000}/api/podcasts/${recap.slug}/${recap.episode_slug}/sponsors`;
            await fetch(url);
            done++;
          } catch (err) {
            errors++;
          }
          if ((done + errors) % 25 === 0) {
            console.log(`[BackfillSponsors] Progress: ${done + errors}/${recaps.length} (${done} done, ${errors} errors)`);
          }
          await new Promise(r => setTimeout(r, 500));
        }
        console.log(`[BackfillSponsors] Complete: ${done} done, ${errors} errors`);
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error("[BackfillSponsors] Error:", err);
    }
  });

  app.post("/api/admin/backfill-resources", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { pool: dbPool } = await import("./db");
      const client = await dbPool.connect();
      try {
        const { rows: recaps } = await client.query(
          `SELECT slug, episode_slug FROM landing_page_recaps WHERE resources IS NULL ORDER BY slug, id`
        );
        console.log(`[BackfillResources] Starting backfill for ${recaps.length} episodes`);
        res.json({ message: `Resources backfill started for ${recaps.length} episodes.` });

        let done = 0, errors = 0;
        for (const recap of recaps) {
          try {
            const url = `http://localhost:${process.env.PORT || 5000}/api/podcasts/${recap.slug}/${recap.episode_slug}/resources`;
            await fetch(url);
            done++;
          } catch (err) {
            errors++;
          }
          if ((done + errors) % 25 === 0) {
            console.log(`[BackfillResources] Progress: ${done + errors}/${recaps.length} (${done} done, ${errors} errors)`);
          }
          await new Promise(r => setTimeout(r, 500));
        }
        console.log(`[BackfillResources] Complete: ${done} done, ${errors} errors`);
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error("[BackfillResources] Error:", err);
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
      const { openai } = await import("./replit_integrations/image/client");

      const entries = Object.entries(ITUNES_ID_TO_SLUG);
      const results: { slug: string; status: string; episodeTitle?: string }[] = [];

      const templateSettings = await storage.getEmailTemplateSettings();
      const customPrompt = templateSettings.recapPrompt || "";

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

          const transcriptNote = transcriptText
            ? `A real transcript is provided. Base your recap on the transcript content.`
            : `No transcript available. Write a recap based on the episode title and description only. Be upfront that details are limited.`;

          const episodeBlock = `PODCAST: ${podcastName}\nEPISODE: ${epTitle}\nDURATION: ${durationStr}\nDESCRIPTION: ${ep.description || ep.shortDescription || "No description available."}\n${transcriptText ? `TRANSCRIPT:\n${transcriptText.slice(0, 15000)}` : ""}`;

          const formatInstructions = customPrompt || `Respond with a JSON object containing episode recaps. Each episode must include tldl, whatHappened (2-4 narrative paragraphs), keyInsights (4 bullet points), quote, and quoteAttribution. Write like a sharp friend catching someone up. Be specific and concrete. Never fabricate quotes or facts — use only what's in the transcript.`;

          const prompt = `You are PodCap, an AI that writes podcast digest summaries. Generate a recap for a single episode.

${transcriptNote}

Source episode:
${episodeBlock}

Respond ONLY with a valid JSON object (no markdown, no code fences, no extra text). The JSON must have this exact structure:

{
  "episodes": [
    {
      "podcastName": "PODCAST NAME IN CAPS",
      "episodeTitle": "The Episode Title",
      "tldl": "2-3 sentence summary of the core thesis.",
      "whatHappened": "2-4 paragraphs telling the story of the episode. Separate paragraphs with \\n\\n.",
      "keyInsights": ["Insight 1", "Insight 2", "Insight 3", "Insight 4"],
      "quoteAttribution": "Speaker Name on topic",
      "quote": "A memorable quotable line from the episode"
    }
  ]
}

${formatInstructions}`;

          const aiRes = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 2000,
          });

          const content = aiRes.choices[0]?.message?.content || "";
          let jsonContent = content.trim();
          if (jsonContent.startsWith("```")) {
            jsonContent = jsonContent.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
          }

          const parsed = JSON.parse(jsonContent);
          const epData = parsed.episodes?.[0];

          if (!epData) {
            results.push({ slug, status: "ai_no_episode" });
            res.write(JSON.stringify({ slug, status: "ai_no_episode" }) + "\n");
            continue;
          }

          await storage.upsertExampleRecap({
            slug,
            podcastName: epData.podcastName || podcastName,
            itunesId,
            episodeTitle: epData.episodeTitle || epTitle,
            episodeDate: releaseDate,
            episodeDuration: durationStr,
            tldl: epData.tldl || "",
            whatHappened: (epData.whatHappened || "").replace(/\\n\\n/g, "\n\n").replace(/\\n/g, "\n"),
            keyInsights: Array.isArray(epData.keyInsights) ? epData.keyInsights : [],
            quote: epData.quote || null,
            quoteAttribution: epData.quoteAttribution || null,
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
      const { openai } = await import("./replit_integrations/image/client");
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

      const templateSettings = await storage.getEmailTemplateSettings();
      const customPrompt = templateSettings.recapPrompt || "";

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

                const transcriptNote = transcriptText
                  ? `A real transcript is provided. Base your recap on the transcript content.`
                  : `No transcript available. Write a recap based on the episode title and description only.`;

                const episodeBlock = `PODCAST: ${podcastName}\nEPISODE: ${epTitle}\nDURATION: ${durationStr}\nDESCRIPTION: ${ep.description || ep.shortDescription || "No description available."}\n${transcriptText ? `TRANSCRIPT:\n${transcriptText.slice(0, 15000)}` : ""}`;

                const prompt = `You are PodCap, an AI that writes podcast digest summaries. Generate a recap for a single episode.

${transcriptNote}

Source episode:
${episodeBlock}

Respond ONLY with a valid JSON object (no markdown, no code fences, no extra text):

{
  "podcastName": "${podcastName}",
  "episodeTitle": "${epTitle.replace(/"/g, '\\"')}",
  "tldl": "2-3 sentence summary of the core thesis.",
  "whatHappened": "2-4 paragraphs in narrative style. Separate paragraphs with \\n\\n.",
  "keyInsights": ["Insight 1", "Insight 2", "Insight 3", "Insight 4"],
  "quote": "A memorable line from the episode",
  "quoteAttribution": "Speaker Name on topic",
  "keyTopics": ["Topic 1", "Topic 2", "Topic 3", "Topic 4", "Topic 5"],
  "topQuestions": [
    {"question": "Question 1?", "answer": "2-3 paragraph answer."},
    {"question": "Question 2?", "answer": "2-3 paragraph answer."},
    {"question": "Question 3?", "answer": "2-3 paragraph answer."},
    {"question": "Question 4?", "answer": "2-3 paragraph answer."},
    {"question": "Question 5?", "answer": "2-3 paragraph answer."}
  ]
}

RULES:
- All fields required
- Write like a sharp friend catching you up
- Be specific and concrete
- Quotes MUST be from the transcript if available
- Use \\n\\n to separate paragraphs in whatHappened
- keyTopics: 4-6 specific phrases
- topQuestions: 5 concise questions with 2-3 paragraph answers
${customPrompt ? `\n${customPrompt}` : ""}`;

                const aiRes = await openai.chat.completions.create({
                  model: "gpt-4o-mini",
                  messages: [{ role: "user", content: prompt }],
                  temperature: 0.7,
                  max_tokens: 4000,
                  response_format: { type: "json_object" },
                });

                const content = aiRes.choices[0]?.message?.content || "";
                let jsonContent = content.trim();
                if (jsonContent.startsWith("```")) {
                  jsonContent = jsonContent.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
                }
                const parsed = JSON.parse(jsonContent);

                await storage.upsertLandingPageRecap({
                  slug: podcast.slug,
                  itunesId: podcast.itunesId,
                  podcastName: parsed.podcastName || podcastName,
                  episodeTitle: parsed.episodeTitle || epTitle,
                  episodeSlug: epSlug,
                  publishDate: releaseDate,
                  duration: durationStr,
                  artworkUrl,
                  hosts,
                  tldl: parsed.tldl || "",
                  whatHappened: (parsed.whatHappened || "").replace(/\\n\\n/g, "\n\n").replace(/\\n/g, "\n"),
                  keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [],
                  quote: parsed.quote || null,
                  quoteAttribution: parsed.quoteAttribution || null,
                  appleEpisodeUrl: appleUrl || null,
                  audioUrl: ep.episodeUrl || null,
                  keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : null,
                  topQuestions: parsed.topQuestions ? JSON.stringify(parsed.topQuestions) : null,
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

      const TARGET = 25;
      const { slugFilter } = req.body || {};

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

  app.post("/api/admin/bulk-generate-recaps", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { ITUNES_ID_TO_SLUG, SLUG_TO_ITUNES_ID } = await import("./podcastLandingMap");
      const { openai } = await import("./replit_integrations/image/client");
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

      const templateSettings = await storage.getEmailTemplateSettings();
      const customPrompt = templateSettings.recapPrompt || "";

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

              const transcriptNote = transcriptText
                ? `A real transcript is provided. Base your recap on the transcript content.`
                : `No transcript available. Write a recap based on the episode title and description only.`;

              const episodeBlock = `PODCAST: ${podcastName}\nEPISODE: ${epTitle}\nDURATION: ${durationStr}\nDESCRIPTION: ${ep.description || ep.shortDescription || "No description available."}\n${transcriptText ? `TRANSCRIPT:\n${transcriptText.slice(0, 15000)}` : ""}`;

              const prompt = `You are PodCap, an AI that writes podcast digest summaries. Generate a recap for a single episode.

${transcriptNote}

Source episode:
${episodeBlock}

Respond ONLY with a valid JSON object (no markdown, no code fences, no extra text):

{
  "podcastName": "${podcastName}",
  "episodeTitle": "${epTitle.replace(/"/g, '\\"')}",
  "tldl": "2-3 sentence summary of the core thesis.",
  "whatHappened": "2-4 paragraphs in narrative style. Separate paragraphs with \\n\\n.",
  "keyInsights": ["Insight 1", "Insight 2", "Insight 3", "Insight 4"],
  "quote": "A memorable line from the episode",
  "quoteAttribution": "Speaker Name on topic",
  "keyTopics": ["Topic 1", "Topic 2", "Topic 3", "Topic 4", "Topic 5"],
  "topQuestions": [
    {"question": "Question 1?", "answer": "2-3 paragraph answer."},
    {"question": "Question 2?", "answer": "2-3 paragraph answer."},
    {"question": "Question 3?", "answer": "2-3 paragraph answer."},
    {"question": "Question 4?", "answer": "2-3 paragraph answer."},
    {"question": "Question 5?", "answer": "2-3 paragraph answer."}
  ]
}

RULES:
- All fields required
- Write like a sharp friend catching you up
- Be specific and concrete
- Quotes MUST be from the transcript if available
- Use \\n\\n to separate paragraphs in whatHappened
- keyTopics: 4-6 specific phrases
- topQuestions: 5 concise questions with 2-3 paragraph answers
${customPrompt ? `\n${customPrompt}` : ""}`;

              const aiRes = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7,
                max_tokens: 4000,
                response_format: { type: "json_object" },
              });

              const content = aiRes.choices[0]?.message?.content || "";
              let jsonContent = content.trim();
              if (jsonContent.startsWith("```")) {
                jsonContent = jsonContent.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
              }
              const parsed = JSON.parse(jsonContent);

              await storage.upsertLandingPageRecap({
                slug,
                itunesId,
                podcastName: parsed.podcastName || podcastName,
                episodeTitle: parsed.episodeTitle || epTitle,
                episodeSlug: epSlug,
                publishDate: releaseDate,
                duration: durationStr,
                artworkUrl,
                hosts,
                tldl: parsed.tldl || "",
                whatHappened: (parsed.whatHappened || "").replace(/\\n\\n/g, "\n\n").replace(/\\n/g, "\n"),
                keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [],
                quote: parsed.quote || null,
                quoteAttribution: parsed.quoteAttribution || null,
                appleEpisodeUrl: appleUrl || null,
                audioUrl: ep.episodeUrl || null,
                keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : null,
                topQuestions: parsed.topQuestions ? JSON.stringify(parsed.topQuestions) : null,
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
    const sampleMarkdown = `My First Million · The All-In Podcast\n\n**2** Podcasts · **5 hours and 32 minutes** Total duration\n\n---\n\n## MY FIRST MILLION\n\n**How This 25-Year-Old Built a $100M Business**\nJake Chen · CEO of CloudStack · 1 hr 12 min\n\n🎧 [Apple Podcasts](https://podcasts.apple.com/example) · [Spotify](https://open.spotify.com/search/example)\n\n**TLDL:** Jake Chen dropped out of college to build CloudStack, a no-code platform that now processes $2B in transactions annually.\n\n**What Happened**\nSam opens by calling Jake "the most impressive founder under 30." Jake walks through the origin story — building internal tools for his university when he realized every small business had the same problem.\n\nHe launched on Product Hunt, got 2,000 users in the first week, and was profitable by month three.\n\n**Key Insights:**\n- CloudStack processes $2B in annual transactions with only 47 employees\n- White-labeling through accounting firms drives 40% of revenue\n- The no-code market is projected to hit $187B by 2030\n\n**Quote**\nJake Chen on turning down $50M:\n> "Everyone told me I was crazy. But I looked at every founder who sold early and asked one question: are you happier? Not one said yes."\n\n---`;
    const config: Partial<EmailTemplateConfig> = template || {};
    const html = markdownToEmailHtml(sampleMarkdown, "preview@example.com", config);
    res.json({ html });
  });

  app.get("/api/admin/recap-prompt", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const settings = await storage.getEmailTemplateSettings();
    res.json({
      prompt: settings.recapPrompt || "",
      defaultPrompt: DEFAULT_RECAP_PROMPT,
    });
  });

  app.put("/api/admin/recap-prompt", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const { prompt } = req.body;
    if (typeof prompt !== "string") {
      return res.status(400).json({ message: "Invalid prompt data" });
    }
    if (prompt.length > 10000) {
      return res.status(400).json({ message: "Prompt is too long (max 10,000 characters)" });
    }
    await storage.setEmailTemplateSettings({ recapPrompt: prompt });
    res.json({ message: "Recap prompt saved" });
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
                  COALESCE(tc.transcript_count, 0)::int as transcript_count
           FROM podcast_directory pd
           LEFT JOIN (
             SELECT podcast_id, COUNT(*)::int as transcript_count
             FROM episode_transcripts
             GROUP BY podcast_id
           ) tc ON pd.itunes_id = tc.podcast_id
           WHERE pd.has_landing_page = true
           ORDER BY pd.name ASC`
        );
        res.json({
          podcasts: podcasts.map((p, i) => ({
            index: i + 1,
            name: p.name,
            itunesId: p.itunes_id,
            hasTaddyUuid: !!p.taddy_uuid,
            transcriptCount: p.transcript_count,
            target: 25,
            remaining: Math.max(0, 25 - p.transcript_count),
            status: p.transcript_count >= 25 ? "done" : !p.taddy_uuid ? "no_taddy" : "pending",
          })),
          totalTranscripts: podcasts.reduce((sum, p) => sum + (p.transcript_count || 0), 0),
          totalPodcasts: podcasts.length,
          podcastsComplete: podcasts.filter(p => (p.transcript_count || 0) >= 25).length,
        });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Backfill status error:", err);
      res.status(500).json({ message: "Failed to fetch backfill status" });
    }
  });

  return httpServer;
}
