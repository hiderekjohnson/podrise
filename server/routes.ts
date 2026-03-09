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

  const PEOPLE_SLUGS = ["elon-musk", "sam-altman", "joe-rogan", "lex-fridman", "naval-ravikant", "peter-thiel", "chamath-palihapitiya", "jason-calacanis", "marc-andreessen", "jensen-huang", "alex-hormozi", "gary-vaynerchuk", "codie-sanchez", "sahil-bloom", "andrew-huberman", "seth-godin", "chris-do", "scott-galloway", "simon-sinek", "adam-grant", "ramit-sethi", "ryan-holiday", "tim-ferriss", "mark-cuban", "patrick-bet-david", "james-clear", "jenna-kutcher", "amy-porterfield", "john-lee-dumas", "sam-parr", "shaan-puri", "justin-welsh", "hala-taha", "noah-kagan"];
  for (const pSlug of PEOPLE_SLUGS) {
    xml += `  <url>\n`;
    xml += `    <loc>${DOMAIN}/people/${pSlug}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>weekly</changefreq>\n`;
    xml += `    <priority>0.7</priority>\n`;
    xml += `  </url>\n`;
  }

  const COMPANY_SLUGS = ["openai", "tesla", "nvidia", "google", "microsoft", "apple", "amazon", "anthropic", "meta", "spacex"];
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
    { slug: "elon-musk", name: "Elon Musk", title: "CEO of Tesla & SpaceX", searchTerms: ["Elon Musk"], hostedSlugs: [] as string[] },
    { slug: "sam-altman", name: "Sam Altman", title: "CEO of OpenAI", searchTerms: ["Sam Altman"], hostedSlugs: [] },
    { slug: "joe-rogan", name: "Joe Rogan", title: "Host of The Joe Rogan Experience", searchTerms: ["Joe Rogan"], hostedSlugs: ["joerogan"] },
    { slug: "lex-fridman", name: "Lex Fridman", title: "Host of Lex Fridman Podcast", searchTerms: ["Lex Fridman"], hostedSlugs: ["lexfridman"] },
    { slug: "naval-ravikant", name: "Naval Ravikant", title: "Co-founder of AngelList", searchTerms: ["Naval Ravikant", "Naval"], hostedSlugs: [] },
    { slug: "peter-thiel", name: "Peter Thiel", title: "Co-founder of PayPal & Palantir", searchTerms: ["Peter Thiel", "Thiel"], hostedSlugs: [] },
    { slug: "chamath-palihapitiya", name: "Chamath Palihapitiya", title: "CEO of Social Capital", searchTerms: ["Chamath Palihapitiya", "Chamath"], hostedSlugs: ["allin"] },
    { slug: "jason-calacanis", name: "Jason Calacanis", title: "Angel Investor & Host of This Week in Startups", searchTerms: ["Jason Calacanis", "Calacanis"], hostedSlugs: ["allin", "thisweekinstartups"] },
    { slug: "marc-andreessen", name: "Marc Andreessen", title: "Co-founder of Andreessen Horowitz", searchTerms: ["Marc Andreessen", "Andreessen"], hostedSlugs: ["a16z"] },
    { slug: "jensen-huang", name: "Jensen Huang", title: "CEO of NVIDIA", searchTerms: ["Jensen Huang"], hostedSlugs: [] },
    { slug: "alex-hormozi", name: "Alex Hormozi", title: "Founder of Acquisition.com", searchTerms: ["Alex Hormozi", "Hormozi"], hostedSlugs: ["alexhormozi"] },
    { slug: "gary-vaynerchuk", name: "Gary Vaynerchuk", title: "CEO of VaynerMedia", searchTerms: ["Gary Vaynerchuk", "GaryVee", "Gary Vee"], hostedSlugs: ["garyvee"] },
    { slug: "codie-sanchez", name: "Codie Sanchez", title: "Founder of Contrarian Thinking", searchTerms: ["Codie Sanchez"], hostedSlugs: [] },
    { slug: "sahil-bloom", name: "Sahil Bloom", title: "Writer & Investor", searchTerms: ["Sahil Bloom"], hostedSlugs: [] },
    { slug: "andrew-huberman", name: "Dr. Andrew Huberman", title: "Neuroscientist & Host of Huberman Lab", searchTerms: ["Andrew Huberman", "Huberman"], hostedSlugs: ["hubermanlab"] },
    { slug: "seth-godin", name: "Seth Godin", title: "Author & Marketing Legend", searchTerms: ["Seth Godin"], hostedSlugs: [] },
    { slug: "chris-do", name: "Chris Do", title: "Founder of The Futur", searchTerms: ["Chris Do"], hostedSlugs: [] },
    { slug: "scott-galloway", name: "Scott Galloway", title: "Professor at NYU Stern & Host of Prof G", searchTerms: ["Scott Galloway", "Galloway"], hostedSlugs: ["profgmarkets", "profgpod", "pivot"] },
    { slug: "simon-sinek", name: "Simon Sinek", title: "Author & Motivational Speaker", searchTerms: ["Simon Sinek"], hostedSlugs: [] },
    { slug: "adam-grant", name: "Adam Grant", title: "Organizational Psychologist at Wharton", searchTerms: ["Adam Grant"], hostedSlugs: ["worklife"] },
    { slug: "ramit-sethi", name: "Ramit Sethi", title: "Author of 'I Will Teach You to Be Rich'", searchTerms: ["Ramit Sethi"], hostedSlugs: [] },
    { slug: "ryan-holiday", name: "Ryan Holiday", title: "Author & Host of Daily Stoic", searchTerms: ["Ryan Holiday"], hostedSlugs: ["dailystoic"] },
    { slug: "tim-ferriss", name: "Tim Ferriss", title: "Author & Host of The Tim Ferriss Show", searchTerms: ["Tim Ferriss", "Ferriss"], hostedSlugs: ["timferriss"] },
    { slug: "mark-cuban", name: "Mark Cuban", title: "Entrepreneur & Investor", searchTerms: ["Mark Cuban"], hostedSlugs: [] },
    { slug: "patrick-bet-david", name: "Patrick Bet-David", title: "Founder of Valuetainment", searchTerms: ["Patrick Bet-David", "PBD"], hostedSlugs: ["valuetainment"] },
    { slug: "james-clear", name: "James Clear", title: "Author of 'Atomic Habits'", searchTerms: ["James Clear"], hostedSlugs: [] },
    { slug: "jenna-kutcher", name: "Jenna Kutcher", title: "Entrepreneur & Host of The Goal Digger Podcast", searchTerms: ["Jenna Kutcher"], hostedSlugs: [] },
    { slug: "amy-porterfield", name: "Amy Porterfield", title: "Online Marketing Expert & Podcast Host", searchTerms: ["Amy Porterfield"], hostedSlugs: ["amyporterfield"] },
    { slug: "john-lee-dumas", name: "John Lee Dumas", title: "Host of Entrepreneurs on Fire", searchTerms: ["John Lee Dumas", "JLD"], hostedSlugs: ["entrepreneursonfire"] },
    { slug: "sam-parr", name: "Sam Parr", title: "Co-host of My First Million", searchTerms: ["Sam Parr"], hostedSlugs: ["myfirstmillion"] },
    { slug: "shaan-puri", name: "Shaan Puri", title: "Co-host of My First Million", searchTerms: ["Shaan Puri"], hostedSlugs: ["myfirstmillion"] },
    { slug: "justin-welsh", name: "Justin Welsh", title: "Solopreneur & LinkedIn Creator", searchTerms: ["Justin Welsh"], hostedSlugs: [] },
    { slug: "hala-taha", name: "Hala Taha", title: "Host of Young and Profiting Podcast", searchTerms: ["Hala Taha"], hostedSlugs: ["youngandprofiting"] },
    { slug: "noah-kagan", name: "Noah Kagan", title: "CEO of AppSumo", searchTerms: ["Noah Kagan"], hostedSlugs: [] },
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
  ];

  function extractMentionContext(fields: string[], searchTerms: string[]): string {
    for (const text of fields) {
      if (!text) continue;
      const sentences = text.split(/(?<=[.!?])\s+/);
      for (const term of searchTerms) {
        const lower = term.toLowerCase();
        for (const sentence of sentences) {
          if (sentence.toLowerCase().includes(lower)) {
            const trimmed = sentence.trim();
            if (trimmed.length > 200) return trimmed.substring(0, 197) + "...";
            return trimmed;
          }
        }
      }
    }
    return "";
  }

  app.get("/api/entities/people", async (_req, res) => {
    try {
      const { pool: dbPool } = await import("./db");
      const client = await dbPool.connect();
      try {
        const results = [];
        for (const person of ENTITY_PEOPLE) {
          const excludeCondition = person.hostedSlugs.length > 0
            ? ` AND slug NOT IN (${person.hostedSlugs.map((_, i) => `$${person.searchTerms.length + i + 1}`).join(",")})`
            : "";
          const extraParams = person.hostedSlugs;

          const guestConditions = person.searchTerms.map((_, i) => `guests ILIKE $${i + 1}`).join(" OR ");
          const guestParams = [...person.searchTerms.map(t => `%${t}%`), ...extraParams];
          const { rows: guestRows } = await client.query(
            `SELECT slug, episode_slug FROM landing_page_recaps WHERE guests IS NOT NULL AND (${guestConditions})${excludeCondition}`,
            guestParams
          );
          const guestKeys = new Set(guestRows.map((r: any) => `${r.slug}/${r.episode_slug}`));

          const mentionConditions = person.searchTerms.map((_, i) => `(what_happened ILIKE $${i + 1} OR tldl ILIKE $${i + 1} OR key_insights::text ILIKE $${i + 1})`).join(" OR ");
          const mentionParams = [...person.searchTerms.map(t => `%${t}%`), ...extraParams];
          const { rows: mentionRows } = await client.query(
            `SELECT slug, episode_slug FROM landing_page_recaps WHERE (${mentionConditions})${excludeCondition}`,
            mentionParams
          );
          const mentionCount = mentionRows.filter((r: any) => !guestKeys.has(`${r.slug}/${r.episode_slug}`)).length;

          results.push({
            slug: person.slug,
            name: person.name,
            title: person.title,
            mentionCount,
            guestCount: guestRows.length,
          });
        }

        results.sort((a, b) => (b.mentionCount + b.guestCount) - (a.mentionCount + a.guestCount));
        res.json(results);
      } finally {
        client.release();
      }
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

        const guestConditions = person.searchTerms.map((_, i) => `guests ILIKE $${i + 1}`).join(" OR ");
        const guestParams = [...person.searchTerms.map(t => `%${t}%`), ...extraParams];
        const { rows: guestEpisodes } = await client.query(
          `SELECT slug, episode_slug, podcast_name, episode_title, publish_date, artwork_url FROM landing_page_recaps WHERE guests IS NOT NULL AND (${guestConditions})${excludeCondition} ORDER BY publish_date DESC`,
          guestParams
        );

        const mentionConditions = person.searchTerms.map((_, i) => `(what_happened ILIKE $${i + 1} OR tldl ILIKE $${i + 1} OR key_insights::text ILIKE $${i + 1})`).join(" OR ");
        const mentionParams = [...person.searchTerms.map(t => `%${t}%`), ...extraParams];
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

        res.json({
          name: person.name,
          title: person.title,
          slug,
          guestAppearances: guestEpisodes,
          mentions: mentionsOnly,
          guestCount: guestEpisodes.length,
          mentionCount: mentionsOnly.length,
        });
      } finally {
        client.release();
      }
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch person" });
    }
  });

  app.get("/api/entities/companies", async (_req, res) => {
    try {
      const { pool: dbPool } = await import("./db");
      const client = await dbPool.connect();
      try {
        const results = [];
        for (const company of ENTITY_COMPANIES) {
          const conditions = company.searchTerms.map((_, i) => `(what_happened ILIKE $${i + 1} OR tldl ILIKE $${i + 1} OR key_insights::text ILIKE $${i + 1})`).join(" OR ");
          const params = company.searchTerms.map(t => `%${t}%`);
          const { rows: [{ count: mentionCount }] } = await client.query(
            `SELECT COUNT(*)::int as count FROM landing_page_recaps WHERE ${conditions}`,
            params
          );
          results.push({ slug: company.slug, name: company.name, description: company.description, mentionCount });
        }
        results.sort((a, b) => b.mentionCount - a.mentionCount);
        res.json(results);
      } finally {
        client.release();
      }
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
        const conditions = company.searchTerms.map((_, i) => `(what_happened ILIKE $${i + 1} OR tldl ILIKE $${i + 1} OR key_insights::text ILIKE $${i + 1})`).join(" OR ");
        const params = company.searchTerms.map(t => `%${t}%`);
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
            const taddyPodcast = await searchPodcastByItunesId(itunesId);
            if (taddyPodcast?.uuid) {
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

  return httpServer;
}
