import type { Express } from "express";
import express from "express";
import type { Server } from "http";
import crypto from "crypto";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { getUncachableResendClient } from "./resendClient";
import { markdownToEmailHtml, recapHasContent, type EpisodeMetaForEmail } from "./emailTemplate";
import { generateRecap } from "./recapGenerator";
import { ITUNES_ID_TO_SLUG } from "./podcastLandingMap";
import { pool } from "./db";
import { activeEpGenItunesIds } from "./epGenState";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, unlinkSync, existsSync } from "fs";
import multer from "multer";
import path from "path";
import { authenticateRequest, getAuthUserId } from "./jwt";
import { registerMobileRoutes } from "./mobileRoutes";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    isAdmin?: boolean;
    impersonatingUserId?: number;
    originalUserId?: number;
    podcasterEmail?: string;
    oauthState?: string;
    signupContext?: string;
    referralCode?: string;
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
  sidebarData: new DataCache<any>("sidebarData"),
};

function podcastNameToSlugForEmail(name: string): string {
  return name.toLowerCase().replace(/['']/g, "").replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

async function buildEpisodeMetaFromSummary(summary: string): Promise<Record<string, EpisodeMetaForEmail>> {
  const { buildEpisodeMeta } = await import("./emailScheduler");
  const podcastNames = (summary.match(/^## (.+)$/gm) || []).map((h: string) => h.replace(/^## /, "").trim());
  if (podcastNames.length === 0) return {};
  return buildEpisodeMeta(podcastNames);
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

function extractSignupMetadata(req: any, signupSource?: string, signupSourceDetail?: string) {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || null;
  const ua = req.headers["user-agent"] || null;
  let deviceType: string | null = null;
  if (ua) {
    if (/tablet|ipad/i.test(ua)) deviceType = "tablet";
    else if (/mobile|android|iphone|ipod/i.test(ua)) deviceType = "mobile";
    else deviceType = "desktop";
  }
  let rawSource = signupSource || req.headers["referer"] || null;
  if (rawSource) {
    try {
      const parsed = new URL(rawSource);
      rawSource = parsed.pathname;
    } catch {
      const qIdx = rawSource.indexOf("?");
      const hIdx = rawSource.indexOf("#");
      const cutIdx = Math.min(qIdx >= 0 ? qIdx : Infinity, hIdx >= 0 ? hIdx : Infinity);
      if (cutIdx < Infinity) rawSource = rawSource.substring(0, cutIdx);
    }
  }
  let source = rawSource;
  if (rawSource) {
    if (rawSource === "/") source = "homepage";
    else if (rawSource === "/login") source = "login_page";
    else if (rawSource === "/leaderboard") source = "leaderboard";
    else if (rawSource === "/get-started") source = "get_started";
    else if (rawSource === "/register") source = "register_page";
    else if (rawSource.startsWith("/podcasts/") && rawSource.includes("/episodes/")) source = "episode_page";
    else if (rawSource.startsWith("/podcasts/")) source = "podcast_page";
    else if (rawSource.startsWith("/industry/")) source = "industry_page";
    else if (rawSource.startsWith("/role/")) source = "role_page";
    else if (rawSource.startsWith("/interest/")) source = "interest_page";
    else if (rawSource.startsWith("quick-subscribe-podcast")) source = "podcast_page";
    else if (rawSource.startsWith("quick-subscribe-industry")) source = "industry_page";
    else if (rawSource.startsWith("quick-subscribe-interest")) source = "interest_page";
    else if (rawSource.startsWith("quick-subscribe-role")) source = "role_page";
    else if (rawSource === "landing_page") source = "landing_page";
    else if (rawSource.startsWith("/lp/")) source = "landing_page";
  }
  let detail = signupSourceDetail || null;
  if (!detail && rawSource) {
    const podcastMatch = rawSource.match(/^\/podcasts\/([^/]+)/);
    if (podcastMatch) detail = podcastMatch[1];
    const categoryMatch = rawSource.match(/^\/(industry|role|interest)\/([^/]+)/);
    if (categoryMatch) detail = categoryMatch[2];
    if (rawSource.startsWith("quick-subscribe-")) {
      detail = req.body?.slug || null;
    }
  }
  return { ipAddress: ip, userAgent: ua, deviceType, signupSource: source, signupSourceDetail: detail };
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
    from: `PodRise Alerts <${fromEmail}>`,
    to: "hiderekjohnson@gmail.com",
    subject: `🚀 New PodRise User: ${user.email}`,
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
<span style="font-size:12px;color:#aaa;">PodRise User Alert</span>
</div>
</div>
</body></html>`,
  });

  console.log(`[NewUserNotify] Notification sent for ${user.email}`);
}

async function checkAndRecordTierHit(referrerId: number) {
  try {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM referrals WHERE referrer_id = $1 AND status = 'verified'`,
      [referrerId]
    );
    const count = countResult.rows[0]?.count || 0;
    if (count === 0) return;

    const tiersResult = await pool.query(
      `SELECT id, threshold, reward_name FROM referral_tiers WHERE active = true AND threshold <= $1 ORDER BY threshold ASC`,
      [count]
    );
    const achievedTiers = tiersResult.rows;
    if (achievedTiers.length === 0) return;

    const referrerResult = await pool.query(`SELECT email, display_name FROM users WHERE id = $1`, [referrerId]);
    const referrer = referrerResult.rows[0];
    if (!referrer) return;

    for (const tier of achievedTiers) {
      const insertResult = await pool.query(
        `INSERT INTO referral_fulfillments (user_id, tier_id, tier_threshold, status)
         VALUES ($1, $2, $3, 'unsent')
         ON CONFLICT (user_id, tier_id) DO NOTHING
         RETURNING id`,
        [referrerId, tier.id, tier.threshold]
      );
      if (insertResult.rows.length > 0) {
        try {
          const { client, fromEmail } = await getUncachableResendClient();
          await client.emails.send({
            from: `PodRise Alerts <${fromEmail}>`,
            to: "hiderekjohnson@gmail.com",
            subject: `🎁 Referral Tier Reached: ${referrer.email} hit ${tier.threshold} referrals!`,
            html: `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#f8f9fa;">
<div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<div style="background:linear-gradient(135deg,#6366F1,#4F46E5);padding:28px 32px;">
<h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">🎁 New Tier Reached!</h1>
</div>
<div style="padding:28px 32px;">
<table style="width:100%;border-collapse:collapse;">
<tr><td style="padding:10px 0;color:#888;font-size:13px;width:120px;">User</td><td style="padding:10px 0;font-size:14px;font-weight:600;color:#1a1a1a;">${referrer.display_name || referrer.email}</td></tr>
<tr><td style="padding:10px 0;color:#888;font-size:13px;">Email</td><td style="padding:10px 0;font-size:14px;color:#1a1a1a;">${referrer.email}</td></tr>
<tr><td style="padding:10px 0;color:#888;font-size:13px;">Referrals</td><td style="padding:10px 0;font-size:14px;font-weight:700;color:#6366F1;">${count}</td></tr>
<tr><td style="padding:10px 0;color:#888;font-size:13px;">Tier Reached</td><td style="padding:10px 0;font-size:14px;font-weight:700;color:#1a1a1a;">${tier.reward_name} (${tier.threshold} referrals)</td></tr>
</table>
<div style="margin-top:20px;padding:16px;background:#f0f0ff;border-radius:8px;text-align:center;">
<a href="https://podrise.com/admin" style="color:#6366F1;font-weight:600;font-size:14px;text-decoration:none;">View in Admin Panel →</a>
</div>
</div>
</div>
</body></html>`,
          });
          console.log(`[Referral] Tier alert sent: ${referrer.email} reached ${tier.reward_name} (${tier.threshold} referrals)`);
        } catch (emailErr) {
          console.error(`[Referral] Failed to send tier alert email:`, emailErr);
        }
      }
    }
  } catch (err) {
    console.error("[Referral] checkAndRecordTierHit error:", err);
  }
}

async function sendVerificationEmail(user: { id: number; email: string }) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [user.id, token, expiresAt]
  );

  const verifyUrl = `https://podrise.com/verify-email?token=${token}`;

  const { client, fromEmail } = await getUncachableResendClient();
  await client.emails.send({
    from: `PodRise <${fromEmail}>`,
    to: user.email,
    subject: "Confirm your email address",
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<div style="background:linear-gradient(135deg,#6366F1,#8B5CF6);padding:32px 24px;text-align:center;">
<h1 style="color:#ffffff;font-size:24px;font-weight:800;margin:0;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">PodRise</h1>
</div>
<div style="padding:32px 28px;text-align:center;">
<h2 style="margin:0 0 12px;color:#09090B;font-size:22px;font-weight:700;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Confirm your email</h2>
<p style="margin:0 0 24px;color:#52525B;font-size:15px;line-height:1.6;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Tap the button below to verify your email address and activate your PodRise account.</p>
<a href="${verifyUrl}" style="display:inline-block;background:#6366F1;color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:10px;font-size:16px;font-weight:700;letter-spacing:-0.01em;box-shadow:0 4px 12px rgba(99,102,241,0.3);font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Verify Email Address</a>
<p style="margin:24px 0 0;color:#a1a1aa;font-size:13px;line-height:1.5;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">This link expires in 24 hours.<br/>If you didn't create a PodRise account, you can ignore this email.</p>
</div>
<div style="padding:16px 28px;background:#f7f7fc;text-align:center;border-top:1px solid #F0F0F2;">
<span style="font-size:13px;color:#52525B;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">PodRise — The intelligence layer on top of podcasts</span>
</div>
</div>
</body>
</html>`,
  });

  console.log(`[VerifyEmail] Verification email sent to ${user.email}`);
}

const DOMAIN = "https://podrise.com";

const STATIC_PAGES = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/podcasts", priority: "0.9", changefreq: "daily" },
  { path: "/trends", priority: "0.9", changefreq: "daily" },
  { path: "/shop", priority: "0.8", changefreq: "weekly" },
  { path: "/people", priority: "0.8", changefreq: "weekly" },
  { path: "/companies", priority: "0.8", changefreq: "weekly" },
  { path: "/industries", priority: "0.8", changefreq: "weekly" },
  { path: "/interests", priority: "0.8", changefreq: "weekly" },
  { path: "/roles", priority: "0.8", changefreq: "weekly" },
  { path: "/insights", priority: "0.7", changefreq: "weekly" },
  { path: "/pod-squad", priority: "0.7", changefreq: "weekly" },
  { path: "/about", priority: "0.5", changefreq: "monthly" },
  { path: "/contact", priority: "0.4", changefreq: "monthly" },
  { path: "/enterprise", priority: "0.5", changefreq: "monthly" },
  { path: "/login", priority: "0.3", changefreq: "monthly" },
  { path: "/privacy", priority: "0.3", changefreq: "yearly" },
  { path: "/terms", priority: "0.3", changefreq: "yearly" },
  { path: "/support", priority: "0.4", changefreq: "monthly" },
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
    const { TOPICS, getCategoryPath } = await import("../client/src/data/topicData");
    for (const topic of TOPICS) {
      const categoryPath = getCategoryPath(topic.category);
      xml += `  <url>\n`;
      xml += `    <loc>${DOMAIN}${categoryPath}/${topic.slug}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
      xml += `  <url>\n`;
      xml += `    <loc>${DOMAIN}${categoryPath}/${topic.slug}/pulse</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>0.6</priority>\n`;
      xml += `  </url>\n`;
    }
  } catch (err) {
    console.error("[Sitemap] Error generating topic URLs:", err);
  }

  try {
    const bookRows = await pool.query(`SELECT slug FROM book_enrichments WHERE slug IS NOT NULL`);
    for (const row of bookRows.rows) {
      xml += `  <url>\n`;
      xml += `    <loc>${DOMAIN}/shop/${row.slug}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>monthly</changefreq>\n`;
      xml += `    <priority>0.6</priority>\n`;
      xml += `  </url>\n`;
    }
  } catch (err) {
    console.error("[Sitemap] Error generating book URLs:", err);
  }

  try {
    const { rows: prodRows } = await pool.query(
      `SELECT DISTINCT name, company FROM extracted_products WHERE status = 'approved' AND image_status = 'approved' ORDER BY name`
    );
    const seenSlugs = new Set<string>();
    for (const row of prodRows) {
      const parts = [row.name, row.company].filter(Boolean).join("-");
      const pSlug = parts.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
      if (!pSlug || seenSlugs.has(pSlug)) continue;
      seenSlugs.add(pSlug);
      xml += `  <url>\n`;
      xml += `    <loc>${DOMAIN}/shop/${pSlug}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>monthly</changefreq>\n`;
      xml += `    <priority>0.5</priority>\n`;
      xml += `  </url>\n`;
    }
  } catch (err) {
    console.error("[Sitemap] Error generating product URLs:", err);
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
  try {
    const { pool: migrationPool } = await import("./db");
    await migrationPool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT;
    `);
    await migrationPool.query(`
      CREATE TABLE IF NOT EXISTS extracted_products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        company TEXT,
        description TEXT,
        purchase_url TEXT,
        context TEXT,
        context_summary TEXT,
        mention_type TEXT DEFAULT 'personal_use',
        category TEXT DEFAULT 'service_or_tool',
        episode_title TEXT,
        episode_slug TEXT,
        podcast_slug TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        rejection_reason TEXT,
        image_url TEXT,
        image_status TEXT NOT NULL DEFAULT 'pending',
        approved_by TEXT,
        approved_at TIMESTAMP,
        reviewed_at TIMESTAMP,
        extracted_at TIMESTAMP DEFAULT NOW()
      );
      ALTER TABLE extracted_products ADD COLUMN IF NOT EXISTS approved_by TEXT;
      ALTER TABLE extracted_products ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
      ALTER TABLE extracted_products ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
      ALTER TABLE extracted_products ADD COLUMN IF NOT EXISTS context_summary TEXT;
      ALTER TABLE extracted_products ADD COLUMN IF NOT EXISTS image_status TEXT NOT NULL DEFAULT 'pending';
      ALTER TABLE extracted_products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'service_or_tool';
      ALTER TABLE extracted_products ADD COLUMN IF NOT EXISTS mention_type TEXT DEFAULT 'personal_use';
      CREATE TABLE IF NOT EXISTS episode_quotes (
        id SERIAL PRIMARY KEY,
        podcast_slug TEXT NOT NULL,
        episode_slug TEXT NOT NULL,
        episode_title TEXT,
        speaker_name TEXT,
        quote_text TEXT NOT NULL,
        context TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await migrationPool.query(`
      CREATE TABLE IF NOT EXISTS error_logs (
        id SERIAL PRIMARY KEY,
        endpoint TEXT NOT NULL,
        http_status INTEGER NOT NULL DEFAULT 500,
        error_message TEXT NOT NULL,
        friendly_summary TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'error',
        method TEXT,
        user_agent TEXT,
        user_id INTEGER,
        occurrence_count INTEGER NOT NULL DEFAULT 1,
        first_occurred_at TIMESTAMP DEFAULT NOW(),
        last_occurred_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await migrationPool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by TEXT;
      CREATE TABLE IF NOT EXISTS referrals (
        id SERIAL PRIMARY KEY,
        referrer_id INTEGER NOT NULL,
        referred_user_id INTEGER NOT NULL,
        referred_email TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        verified_at TIMESTAMP
      );
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'referrals' AND column_name = 'referred_id')
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'referrals' AND column_name = 'referred_user_id') THEN
          ALTER TABLE referrals RENAME COLUMN referred_id TO referred_user_id;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'referrals' AND column_name = 'referred_user_id') THEN
          ALTER TABLE referrals ADD COLUMN referred_user_id INTEGER;
        END IF;
      END $$;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'referrals' AND indexname = 'referrals_referred_user_id_unique') THEN
          CREATE UNIQUE INDEX referrals_referred_user_id_unique ON referrals (referred_user_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'referrals' AND indexname = 'idx_referrals_referrer_status') THEN
          CREATE INDEX idx_referrals_referrer_status ON referrals (referrer_id, status);
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS referral_tiers (
        id SERIAL PRIMARY KEY,
        threshold INTEGER NOT NULL UNIQUE,
        reward_name TEXT NOT NULL,
        reward_description TEXT NOT NULL,
        image_url TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'referral_tiers'::regclass AND contype = 'u'
          AND EXISTS (SELECT 1 FROM unnest(conkey) k JOIN pg_attribute a ON a.attrelid = conrelid AND a.attnum = k WHERE a.attname = 'threshold')
        ) THEN
          DELETE FROM referral_tiers a USING referral_tiers b WHERE a.id > b.id AND a.threshold = b.threshold;
          ALTER TABLE referral_tiers ADD CONSTRAINT referral_tiers_threshold_key UNIQUE (threshold);
        END IF;
      END $$;
      CREATE TABLE IF NOT EXISTS pulse_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        topic_slug TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, topic_slug)
      );
      CREATE TABLE IF NOT EXISTS support_articles (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        body TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS referral_fulfillments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        tier_id INTEGER NOT NULL,
        tier_threshold INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'unsent',
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, tier_id)
      );
    `);
    await migrationPool.query(`
      ALTER TABLE landing_page_recaps ADD COLUMN IF NOT EXISTS youtube_url TEXT;
      ALTER TABLE landing_page_recaps ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
      ALTER TABLE landing_page_recaps ADD COLUMN IF NOT EXISTS tabloid_headline TEXT;
      ALTER TABLE landing_page_recaps ADD COLUMN IF NOT EXISTS tabloid_sub_headline TEXT;
      ALTER TABLE podcast_directory ADD COLUMN IF NOT EXISTS youtube_url TEXT;
      ALTER TABLE podcast_directory ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
    `);
    // Backfill landing_page_recaps: unpublished episodes get status='hidden'
    await migrationPool.query(`
      UPDATE landing_page_recaps SET status = 'hidden' WHERE published = false AND status = 'published';
    `);
    // Note: podcast_directory has no legacy 'published' boolean column to backfill from.
    // It only has 'has_landing_page' (operational, controls page rendering) which is separate
    // from editorial 'status'. All podcast_directory rows default to status='published'.
    console.log("[startup] Schema migration check complete");

    const dupeSlugs = [
      'atomic-habits-an-easy-proven-way-to-build-good-habits-break-bad-ones',
      'the-snowball-warren-buffett-and-the-business-of-life',
      'founders-the-people-who-brought-you-a-nation',
      'the-constitution-of-liberty',
      'meditations-by-marcus-aurelius-marcus-aurelius'
    ];
    const { rows: dupeKeyRows } = await migrationPool.query(
      `SELECT book_key FROM book_enrichments WHERE slug = ANY($1)`, [dupeSlugs]
    );
    const dupeBookKeys = dupeKeyRows.map((r: any) => r.book_key);
    if (dupeBookKeys.length > 0) {
      await migrationPool.query(`DELETE FROM book_aliases WHERE canonical_key = ANY($1)`, [dupeBookKeys]);
    }
    const dupeResult = await migrationPool.query(
      `DELETE FROM book_enrichments WHERE slug = ANY($1)`, [dupeSlugs]
    );
    if (dupeResult.rowCount && dupeResult.rowCount > 0) {
      console.log(`[startup] Cleaned up ${dupeResult.rowCount} duplicate book entries`);
    }
    await migrationPool.query(`
      CREATE TABLE IF NOT EXISTS entity_people (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        bio TEXT,
        photo_url TEXT,
        title TEXT,
        company TEXT,
        twitter_handle TEXT,
        linkedin_url TEXT,
        website_url TEXT,
        category TEXT,
        search_terms TEXT[] NOT NULL DEFAULT '{}',
        hosted_slugs TEXT[] NOT NULL DEFAULT '{}',
        verified BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS entity_companies (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        logo_url TEXT,
        industry TEXT,
        website_url TEXT,
        twitter_handle TEXT,
        category TEXT,
        search_terms TEXT[] NOT NULL DEFAULT '{}',
        associated_terms TEXT[] NOT NULL DEFAULT '{}',
        verified BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS entity_episode_mentions (
        id SERIAL PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_slug TEXT NOT NULL,
        recap_id INTEGER NOT NULL,
        episode_slug TEXT NOT NULL,
        podcast_slug TEXT NOT NULL,
        context TEXT,
        mention_count INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT entity_episode_unique UNIQUE (entity_type, entity_slug, recap_id)
      );
      CREATE INDEX IF NOT EXISTS idx_entity_mentions_slug ON entity_episode_mentions (entity_type, entity_slug);
      CREATE INDEX IF NOT EXISTS idx_entity_mentions_recap ON entity_episode_mentions (recap_id);
      CREATE INDEX IF NOT EXISTS idx_entity_mentions_podcast ON entity_episode_mentions (podcast_slug);
    `);
    await migrationPool.query(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        episode_slug TEXT NOT NULL,
        podcast_slug TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS advertisers (
        id SERIAL PRIMARY KEY,
        message TEXT NOT NULL,
        link TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
  } catch (e: any) {
    console.error("[startup] Schema migration error:", e.message);
  }

  try {
    const { pool: backfillPool } = await import("./db");
    const backfillResult = await backfillPool.query(`
      INSERT INTO referrals (referrer_id, referred_user_id, status, verified_at)
      SELECT u.referred_by::integer, u.id, 
             CASE WHEN u.email_verified THEN 'verified' ELSE 'pending' END,
             CASE WHEN u.email_verified THEN NOW() ELSE NULL END
      FROM users u
      JOIN users ref ON ref.id = u.referred_by::integer
      WHERE u.referred_by IS NOT NULL
        AND u.referred_by::text ~ '^\\d+$'
        AND NOT EXISTS (SELECT 1 FROM referrals r WHERE r.referred_user_id = u.id)
      ON CONFLICT (referred_user_id) DO NOTHING
    `);
    if (backfillResult.rowCount && backfillResult.rowCount > 0) {
      console.log(`[startup] Backfilled ${backfillResult.rowCount} referral rows`);
    }
  } catch (e: any) {
    console.error("[startup] Referral backfill error:", e.message);
  }

  try {
    const { ENTITY_PEOPLE, ENTITY_COMPANIES } = await import("./entityContextGenerator");
    const { pool: seedPool } = await import("./db");
    const { rows: existingPeople } = await seedPool.query(`SELECT count(*)::int as cnt FROM entity_people`);
    if (existingPeople[0].cnt === 0) {
      const peopleImgDir = path.join(process.cwd(), "client", "public", "people");
      for (const p of ENTITY_PEOPLE) {
        const imgPath = path.join(peopleImgDir, `${p.slug}.png`);
        const photoUrl = existsSync(imgPath) ? `/people/${p.slug}.png` : null;
        await seedPool.query(
          `INSERT INTO entity_people (slug, name, search_terms, hosted_slugs, photo_url) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (slug) DO NOTHING`,
          [p.slug, p.name, p.searchTerms, p.hostedSlugs || [], photoUrl]
        );
      }
      console.log(`[startup] Seeded ${ENTITY_PEOPLE.length} entity people`);
    }
    const { rows: existingCompanies } = await seedPool.query(`SELECT count(*)::int as cnt FROM entity_companies`);
    if (existingCompanies[0].cnt === 0) {
      for (const c of ENTITY_COMPANIES) {
        await seedPool.query(
          `INSERT INTO entity_companies (slug, name, search_terms, associated_terms) VALUES ($1, $2, $3, $4) ON CONFLICT (slug) DO NOTHING`,
          [c.slug, c.name, c.searchTerms, c.associatedTerms || []]
        );
      }
      console.log(`[startup] Seeded ${ENTITY_COMPANIES.length} entity companies`);
    }
    const { rows: [mentionCount] } = await seedPool.query(`SELECT count(*)::int as cnt FROM entity_episode_mentions`);
    if (mentionCount.cnt === 0) {
      const { rows: cachedEpisodes } = await seedPool.query(
        `SELECT id, slug, episode_slug, entity_contexts_cache FROM landing_page_recaps WHERE entity_contexts_cache IS NOT NULL`
      );
      const companySlugs = new Set(ENTITY_COMPANIES.map(c => c.slug));
      const peopleSlugs = new Set(ENTITY_PEOPLE.map(p => p.slug));
      let inserted = 0;
      for (const ep of cachedEpisodes) {
        try {
          const entities = typeof ep.entity_contexts_cache === "string" ? JSON.parse(ep.entity_contexts_cache) : ep.entity_contexts_cache;
          for (const [entitySlug, context] of Object.entries(entities as Record<string, string>)) {
            const entityType = companySlugs.has(entitySlug) ? "company" : peopleSlugs.has(entitySlug) ? "person" : null;
            if (!entityType) continue;
            await seedPool.query(
              `INSERT INTO entity_episode_mentions (entity_type, entity_slug, recap_id, episode_slug, podcast_slug, context)
               VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (entity_type, entity_slug, recap_id) DO NOTHING`,
              [entityType, entitySlug, ep.id, ep.episode_slug, ep.slug, typeof context === "string" ? context : ""]
            );
            inserted++;
          }
        } catch {}
      }
      if (inserted > 0) console.log(`[startup] Backfilled ${inserted} entity episode mentions from cache`);
    }
  } catch (e: any) {
    console.error("[startup] Entity seed error:", e.message);
  }

  app.use((req, res, next) => {
    const host = req.hostname || req.headers.host?.split(":")[0];
    if (host === "www.podrise.com") {
      return res.redirect(301, `https://podrise.com${req.originalUrl}`);
    }
    if (host === "podcap.io" || host === "www.podcap.io") {
      return res.redirect(301, `https://podrise.com${req.originalUrl}`);
    }
    next();
  });

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowedOrigins = [
        /^https?:\/\/localhost(:\d+)?$/,
        /^https?:\/\/.*\.replit\.dev$/,
        /^https:\/\/podrise\.com$/,
        /^https:\/\/.*\.podrise\.com$/,
        /^https:\/\/(www\.)?podcap\.io$/,
        /^capacitor:\/\//,
        /^ionic:\/\//,
      ];
      const mobileOrigin = process.env.MOBILE_APP_ORIGIN;
      if (mobileOrigin && origin === mobileOrigin) return callback(null, true);
      if (allowedOrigins.some(re => re.test(origin))) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["X-Total-Count"],
    maxAge: 86400,
  }));

  const errorTrackingEndpointBlacklist = new Set(["/api/health", "/api/admin/error-logs"]);
  app.use("/api", (req, res, next) => {
    if (errorTrackingEndpointBlacklist.has(req.path) || errorTrackingEndpointBlacklist.has(req.originalUrl?.split("?")[0])) {
      return next();
    }
    const originalJson = res.json.bind(res);
    res.json = function(body: any) {
      const status = res.statusCode;
      if (status >= 400) {
        const endpoint = req.originalUrl?.split("?")[0] || req.path;
        const method = req.method;
        const errorMessage = typeof body?.message === "string" ? body.message : (typeof body === "string" ? body : JSON.stringify(body));
        const userId = (req as any).session?.userId || null;
        const userAgent = req.headers["user-agent"] || null;
        const severity = status >= 500 ? "error" : "warning";

        const actionMap: Record<string, string> = {
          GET: "load", POST: "create", PUT: "update", PATCH: "update", DELETE: "delete from"
        };
        const action = actionMap[method] || "access";
        const pathSegments = endpoint.replace(/^\/api\//, "").split("/").filter(Boolean);
        const resourceName = pathSegments.slice(0, 2).join("/");
        const friendlySummary = `An internal ${severity === "error" ? "server error" : "client error"} occurred while trying to ${action} the ${resourceName || "API"}.`;

        (async () => {
          try {
            const { pool } = await import("./db");
            const existing = await pool.query(
              `SELECT id, occurrence_count FROM error_logs WHERE endpoint = $1 AND method = $2 AND http_status = $3 AND error_message = $4 LIMIT 1`,
              [endpoint, method, status, errorMessage.substring(0, 2000)]
            );
            if (existing.rows.length > 0) {
              await pool.query(
                `UPDATE error_logs SET occurrence_count = occurrence_count + 1, last_occurred_at = NOW() WHERE id = $1`,
                [existing.rows[0].id]
              );
            } else {
              await pool.query(
                `INSERT INTO error_logs (endpoint, http_status, error_message, friendly_summary, severity, method, user_agent, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [endpoint, status, errorMessage.substring(0, 2000), friendlySummary, severity, method, userAgent, userId]
              );
            }
          } catch (logErr) {
            console.error("[ErrorTracker] Failed to log error:", logErr);
          }
        })();
      }
      return originalJson(body);
    } as any;
    next();
  });

  registerMobileRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.get("/podrise-logo.png", (_req, res) => {
    res.sendFile("PodRise_Favicon_1773834313134.png", { root: "attached_assets", maxAge: "30d" });
  });

  app.get("/podrise-logo.svg", (_req, res) => {
    res.sendFile("podrise-logo.svg", { root: "client/public", maxAge: "30d" });
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

  app.get("/bookstore", (_req, res) => {
    res.redirect(301, "/shop");
  });

  app.get("/bookstore/:bookSlug", (req, res) => {
    res.redirect(301, `/shop/${req.params.bookSlug}`);
  });

  function escapeXml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  function buildRssXml(recaps: any[], feedTitle: string, feedDescription: string, feedLink: string): string {
    const DOMAIN = "https://podrise.com";
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
    xml += `    <url>${DOMAIN}/podrise-logo.png</url>\n`;
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
        `<p><a href="${episodeUrl}">Read full recap on PodRise</a></p>` +
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
      const DOMAIN = "https://podrise.com";
      const xml = buildRssXml(
        recaps,
        "PodRise - All Podcast Recaps",
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
      const DOMAIN = "https://podrise.com";
      const xml = buildRssXml(
        recaps,
        `PodRise - ${feed.name}`,
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
        from: `PodRise Support <${fromEmail}>`,
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

  app.post("/api/help-chat", async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
      return res.status(400).json({ message: "Messages are required (max 20)" });
    }

    const validatedMessages: { role: "user" | "assistant"; content: string }[] = [];
    for (const m of messages) {
      if (!m || typeof m.content !== "string" || !["user", "assistant"].includes(m.role)) {
        return res.status(400).json({ message: "Invalid message format" });
      }
      if (m.content.length === 0 || m.content.length > 2000) {
        return res.status(400).json({ message: "Message content must be 1-2000 characters" });
      }
      validatedMessages.push({ role: m.role as "user" | "assistant", content: m.content });
    }

    if (validatedMessages.length === 0 || validatedMessages[validatedMessages.length - 1].role !== "user") {
      return res.status(400).json({ message: "Last message must be from user" });
    }

    try {
      const articles = await storage.getSupportArticles(true);

      let knowledgeBase = "";
      if (articles.length > 0) {
        const grouped = new Map<string, string[]>();
        for (const a of articles) {
          const existing = grouped.get(a.category) || [];
          existing.push(a.body);
          grouped.set(a.category, existing);
        }
        for (const [category, bodies] of grouped) {
          knowledgeBase += `\n## ${category}\n`;
          for (const body of bodies) {
            knowledgeBase += body + "\n";
          }
        }
      }

      const systemPrompt = `You are PodRise's AI support assistant. You're friendly, helpful, and have a dry wit. Think of yourself as that one friend who actually knows how everything works AND has a sense of humor about it. Keep answers concise and conversational — no walls of text.

Your personality guidelines:
- Be warm and genuinely helpful first, funny second.
- Use light humor and mild snark sparingly — a dash of personality, not a comedy routine.
- When you DO know the answer, be clear and direct. Sprinkle in personality but don't let it get in the way of being useful.
- When you DON'T know the answer, use a humorous deflection that makes the user smile, then point them to hello@podrise.com. Examples of good deflections: "That's a great question that's above my pay grade (do bots even get paid?)," or "I'd love to help with that, but my knowledge has limits — kind of like my ability to taste coffee."
- Never be mean, condescending, or dismissive. The snark should always punch up (at yourself, at the situation), never at the user.
- Do NOT make up features that don't exist. If something isn't in your knowledge base, say so honestly (with charm).

CONTACT SCENARIOS:
- If someone is a podcaster with questions about their podcast being on PodRise, direct them to contact hello@podrise.com.
- If someone wants to advertise on PodRise or is a brand interested in partnerships, direct them to hello@podrise.com.
- If someone asks about enterprise rollouts (PodRise for their company/employees), tell them yes PodRise does enterprise rollouts and direct them to hello@podrise.com to get started.
- If someone is interested in investing in PodRise, direct them to hello@podrise.com.
- If someone asks who is behind PodRise or who built it, say something like: "PodRise is built by a small team of people who are genuinely obsessed with podcasts and the incredible knowledge buried inside them — that's why we built this. For more info, reach out to hello@podrise.com."

Here is your knowledge base about PodRise:
${knowledgeBase}

FEATURE REQUEST HANDLING:
When a user suggests a feature, requests a new feature, or describes something they wish PodRise could do:
1. Acknowledge their suggestion warmly and thank them for the feedback. Feel free to be enthusiastic — you love hearing ideas.
2. At the very end of your response, on a new line, include exactly this marker (the user will NOT see this):
[FEATURE_REQUEST: <a brief summary of the feature request>]

Only include the marker if the user is genuinely requesting or suggesting a feature. Do not include it for normal support questions.`;

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const recentMessages = validatedMessages.slice(-10);

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...recentMessages,
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      let reply = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response. Please try again.";

      const featureMatch = reply.match(/\[FEATURE_REQUEST:\s*(.+?)\]/);
      if (featureMatch) {
        const featureDescription = featureMatch[1].trim();
        reply = reply.replace(/\n?\[FEATURE_REQUEST:\s*.+?\]/, "").trim();

        const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

        try {
          const user = await storage.getUserById(userId);
          const { getUncachableResendClient } = await import("./resendClient");
          const { client, fromEmail } = await getUncachableResendClient();
          const userEmail = escHtml(user?.email || "Unknown");
          const safeSummary = escHtml(featureDescription);
          const safeOriginal = escHtml(validatedMessages[validatedMessages.length - 1].content);
          await client.emails.send({
            from: `PodRise <${fromEmail}>`,
            to: "hiderekjohnson@gmail.com",
            subject: `PodRise Feature Request from ${user?.email || `User #${userId}`}`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #6366F1; margin-bottom: 16px;">New Feature Request</h2>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr><td style="padding: 10px 0; color: #888; font-size: 13px; vertical-align: top; width: 110px;">User Email</td><td style="padding: 10px 0; font-size: 14px; font-weight: 600; color: #1a1a1a;">${userEmail}</td></tr>
                  <tr><td style="padding: 10px 0; color: #888; font-size: 13px; vertical-align: top; width: 110px;">User ID</td><td style="padding: 10px 0; font-size: 14px; font-weight: 600; color: #1a1a1a;">${userId}</td></tr>
                  <tr><td style="padding: 10px 0; color: #888; font-size: 13px; vertical-align: top; width: 110px;">Feature Summary</td><td style="padding: 10px 0; font-size: 14px; font-weight: 600; color: #1a1a1a;">${safeSummary}</td></tr>
                  <tr><td style="padding: 10px 0; color: #888; font-size: 13px; vertical-align: top; width: 110px;">Original Message</td><td style="padding: 10px 0; font-size: 14px; color: #1a1a1a;">${safeOriginal}</td></tr>
                </table>
              </div>
            `,
          });
          console.log(`[HelpChat] Feature request email sent for user ${userId}: ${featureDescription}`);
        } catch (emailErr: any) {
          console.error("[HelpChat] Failed to send feature request email:", emailErr?.message || emailErr);
        }
      }

      res.json({ reply });
    } catch (err: any) {
      console.error("[HelpChat] Failed to generate response:", err?.message || err);
      if (err?.status) console.error("[HelpChat] OpenAI status:", err.status);
      if (err?.code) console.error("[HelpChat] Error code:", err.code);
      if (err?.stack) console.error("[HelpChat] Stack:", err.stack);
      res.status(500).json({ message: "Failed to generate response" });
    }
  });

  app.post("/api/podcast-request", async (req, res) => {
    const { podcastName, reason, email } = req.body;
    if (!podcastName || !reason) {
      return res.status(400).json({ message: "Podcast name and reason are required" });
    }
    try {
      const { client, fromEmail } = await getUncachableResendClient();
      await client.emails.send({
        from: `PodRise <${fromEmail}>`,
        to: "hiderekjohnson@gmail.com",
        replyTo: email || undefined,
        subject: `Podcast Request: ${podcastName}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 520px; padding: 24px;">
            <h2 style="margin: 0 0 16px; font-size: 18px; color: #1a1a1a;">New Podcast Request</h2>
            <div style="background: #f8f8f8; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
              <p style="margin: 0 0 8px; font-size: 14px;"><strong>Podcast:</strong> ${podcastName.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
              ${email ? `<p style="margin: 0 0 8px; font-size: 14px;"><strong>From:</strong> ${email}</p>` : ""}
              <p style="margin: 0; font-size: 14px; white-space: pre-wrap;"><strong>Why track it:</strong><br/>${reason.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
            </div>
          </div>
        `,
      });
      res.json({ message: "Request sent" });
    } catch (err) {
      console.error("[PodcastRequest] Failed to send request email:", err);
      res.status(500).json({ message: "Failed to send request" });
    }
  });

  const PgStore = connectPgSimple(session);

  app.set("trust proxy", 1);

  app.use(
    session({
      store: new PgStore({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: true,
        pruneSessionInterval: 60 * 15,
      }),
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    })
  );

  app.get(api.auth.me.path, async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUserById(userId);
    if (!user) {
      if (req.session?.userId) req.session.destroy(() => {});
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
      if (req.body.signupContext) {
        req.session.signupContext = req.body.signupContext;
      }

      const meta = extractSignupMetadata(req, req.body.signupSource, req.body.signupSourceDetail);
      pool.query(
        `UPDATE users SET signup_source = $1, signup_source_detail = $2, ip_address = $3, user_agent = $4, device_type = $5 WHERE id = $6`,
        [meta.signupSource, meta.signupSourceDetail, meta.ipAddress, meta.userAgent, meta.deviceType, user.id]
      ).catch(e => console.error("[SignupMeta] Failed:", e));

      if (meta.signupSource === "landing_page" && meta.signupSourceDetail) {
        pool.query(
          `UPDATE landing_page_visits SET user_id = $1
           WHERE page_slug = $2 AND user_id IS NULL
           AND visited_at >= NOW() - INTERVAL '24 hours'
           AND ip_address = $3`,
          [user.id, meta.signupSourceDetail, meta.ipAddress]
        ).catch(e => console.error("[LandingPage] Conversion linkage failed:", e));
      }

      // Handle referral tracking (session-based from web or direct from mobile app)
      const refCode = req.session.referralCode || req.body.referralCode;
      if (refCode && typeof refCode === "string") {
        try {
          const referrer = await storage.getUserByReferralCode(refCode);
          if (referrer && referrer.id !== user.id) {
            await pool.query(`UPDATE users SET referred_by = $1 WHERE id = $2`, [referrer.id, user.id]);
            await storage.createReferral(referrer.id, user.id);
            console.log(`[Referral] User ${user.id} referred by ${referrer.id} (code: ${refCode})`);
          }
        } catch (e) {
          console.error("[Referral] Failed to record referral:", e);
        }
        delete req.session.referralCode;
      }

      res.status(201).json(user);

      if (input.podcasts && input.podcasts.length > 0) {
        autoPopulateDirectory(input.podcasts).catch(() => {});
      }

      sendVerificationEmail(user).catch((err) =>
        console.error("[VerifyEmail] Failed to send:", err)
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

  app.get("/api/auth/verify-email", async (req, res) => {
    const token = req.query.token as string;
    if (!token) {
      return res.status(400).json({ message: "Missing verification token" });
    }

    try {
      const result = await pool.query(
        `SELECT * FROM email_verification_tokens WHERE token = $1`,
        [token]
      );
      const row = result.rows[0];
      if (!row) {
        return res.status(400).json({ message: "Invalid or expired verification link" });
      }
      if (row.used_at) {
        return res.status(400).json({ message: "This link has already been used" });
      }
      if (new Date(row.expires_at) < new Date()) {
        return res.status(400).json({ message: "This verification link has expired. Please request a new one." });
      }

      await pool.query(
        `UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1`,
        [row.id]
      );
      await pool.query(
        `UPDATE users SET email_verified = true WHERE id = $1`,
        [row.user_id]
      );

      // Verify referral on email confirmation
      storage.verifyReferral(row.user_id).then(ref => {
        if (ref) {
          console.log(`[Referral] Verified referral for user ${row.user_id}, referrer ${ref.referrerId}`);
          checkAndRecordTierHit(ref.referrerId);
        }
      }).catch(e => console.error("[Referral] Verify error:", e));

      req.session.userId = row.user_id;
      const user = await storage.getUserById(row.user_id);

      // Send new user notification now that email is confirmed (double opt-in)
      if (user) {
        sendNewUserNotification(user, req, user.signupSource || "email").catch((err) =>
          console.error("[NewUserNotify] Failed:", err)
        );
      }

      res.json({ message: "Email verified successfully", user });
    } catch (err) {
      console.error("[VerifyEmail] Error:", err);
      res.status(500).json({ message: "Verification failed. Please try again." });
    }
  });

  app.post("/api/auth/resend-verification", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUserById(req.session.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.emailVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    try {
      await sendVerificationEmail(user);
      res.json({ message: "Verification email sent" });
    } catch (err) {
      console.error("[ResendVerify] Error:", err);
      res.status(500).json({ message: "Failed to send verification email. Please try again." });
    }
  });

  // Referral redirect route
  app.get("/r/:code", async (req, res) => {
    const code = req.params.code;
    if (code && /^[a-zA-Z0-9_-]{4,20}$/.test(code)) {
      req.session.referralCode = code;
    }
    res.redirect("/register");
  });

  // Generate referral code for user if they don't have one
  function generateReferralCode(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  async function ensureReferralCode(userId: number): Promise<string> {
    const user = await storage.getUserById(userId);
    if (user?.referralCode) return user.referralCode;
    const code = generateReferralCode();
    await pool.query(`UPDATE users SET referral_code = $1 WHERE id = $2 AND referral_code IS NULL`, [code, userId]);
    const updated = await storage.getUserById(userId);
    return updated?.referralCode || code;
  }

  // GET /api/referrals/my-stats
  app.get("/api/referrals/my-stats", async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    try {
      const code = await ensureReferralCode(userId);
      const count = await storage.getReferralCount(userId);
      const pendingCount = await storage.getPendingReferralCount(userId);
      const tiers = await storage.getReferralTiers();
      const activeTiers = tiers.filter(t => t.active);
      const currentTier = activeTiers.filter(t => count >= t.threshold).pop() || null;
      const nextTier = activeTiers.find(t => count < t.threshold) || null;

      res.json({
        referralCode: code,
        referralLink: `https://podrise.com/r/${code}`,
        count,
        pendingCount,
        currentTier,
        nextTier,
        tiers: activeTiers,
      });
    } catch (err) {
      console.error("[Referrals] Stats error:", err);
      res.status(500).json({ message: "Failed to load referral stats" });
    }
  });

  // GET /api/referrals/leaderboard
  app.get("/api/referrals/leaderboard", async (_req, res) => {
    try {
      const leaderboard = await storage.getLeaderboard(20);
      const safeLeaderboard = leaderboard.map(({ email, ...rest }) => ({
        ...rest,
        displayName: rest.displayName || `User •••${String(rest.userId).slice(-4)}`,
      }));
      res.json(safeLeaderboard);
    } catch (err) {
      console.error("[Referrals] Leaderboard error:", err);
      res.status(500).json({ message: "Failed to load leaderboard" });
    }
  });

  // POST /api/referrals/send-invite
  app.post("/api/referrals/send-invite", async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const { email: inviteeEmail } = req.body;
    if (!inviteeEmail || !/^\S+@\S+\.\S+$/.test(inviteeEmail)) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    try {
      const user = await storage.getUserById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const code = await ensureReferralCode(userId);
      const referralLink = `https://podrise.com/r/${code}`;
      const rawName = user.displayName || user.email.split("@")[0];
      const senderName = rawName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

      const { client, fromEmail } = await getUncachableResendClient();
      await client.emails.send({
        from: `PodRise <${fromEmail}>`,
        to: inviteeEmail,
        subject: `${rawName} invited you to PodRise`,
        html: `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#f8f9fa;">
<div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<div style="padding:40px 32px 24px;text-align:center;background:linear-gradient(145deg,#6366F1,#8B5CF6);">
<h1 style="margin:0 0 8px;color:#fff;font-size:22px;font-weight:800;">You're Invited to The Pod Squad</h1>
<p style="margin:0;color:rgba(255,255,255,0.85);font-size:15px;line-height:1.5;">${senderName} thinks you'd love PodRise — AI-powered podcast intelligence.</p>
</div>
<div style="padding:24px 32px 32px;text-align:center;">
<p style="color:#52525B;font-size:15px;line-height:1.6;margin:0 0 20px;">Get smart summaries, key insights, and episode recaps from your favorite podcasts — delivered right to your inbox.</p>
<a href="${referralLink}" style="display:inline-block;background:#6366F1;color:#fff;text-decoration:none;padding:14px 40px;border-radius:10px;font-size:16px;font-weight:700;">Join PodRise Free</a>
</div>
<div style="padding:16px 32px;background:#f8f9fa;text-align:center;">
<span style="font-size:12px;color:#a1a1aa;">PodRise — The intelligence layer on top of podcasts</span>
</div>
</div>
</body></html>`,
      });

      res.json({ message: "Invitation sent!" });
    } catch (err) {
      console.error("[Referrals] Send invite error:", err);
      res.status(500).json({ message: "Failed to send invitation" });
    }
  });

  // Admin referral tier management
  app.get("/api/admin/referral-tiers", async (req, res) => {
    if (!req.session?.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const tiers = await storage.getReferralTiers();
      res.json(tiers);
    } catch (err) {
      res.status(500).json({ message: "Failed to load tiers" });
    }
  });

  app.post("/api/admin/referral-tiers", async (req, res) => {
    if (!req.session?.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { threshold, rewardName, rewardDescription, imageUrl, sortOrder, active } = req.body;
      const t = Number(threshold);
      if (!rewardName || typeof rewardName !== "string" || rewardName.trim().length === 0) {
        return res.status(400).json({ message: "Reward name is required" });
      }
      if (!Number.isInteger(t) || t < 1) {
        return res.status(400).json({ message: "Threshold must be a positive integer" });
      }
      if (!rewardDescription || typeof rewardDescription !== "string" || rewardDescription.trim().length === 0) {
        return res.status(400).json({ message: "Reward description is required" });
      }
      const tier = await storage.createReferralTier({
        threshold: t,
        rewardName: rewardName.trim(),
        rewardDescription: rewardDescription.trim(),
        imageUrl: imageUrl?.trim() || null,
        sortOrder: Number(sortOrder || 0),
        active: active !== false,
      });
      res.json(tier);
    } catch (err) {
      res.status(500).json({ message: "Failed to create tier" });
    }
  });

  app.patch("/api/admin/referral-tiers/:id", async (req, res) => {
    if (!req.session?.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const updates: Partial<{ threshold: number; rewardName: string; rewardDescription: string | null; imageUrl: string | null; sortOrder: number; active: boolean }> = {};
      if (req.body.threshold !== undefined) {
        const t = Number(req.body.threshold);
        if (!Number.isInteger(t) || t < 1) {
          return res.status(400).json({ message: "Threshold must be a positive integer" });
        }
        updates.threshold = t;
      }
      if (req.body.rewardName !== undefined) {
        if (typeof req.body.rewardName !== "string" || req.body.rewardName.trim().length === 0) {
          return res.status(400).json({ message: "Reward name is required" });
        }
        updates.rewardName = req.body.rewardName.trim();
      }
      if (req.body.rewardDescription !== undefined) {
        const desc = typeof req.body.rewardDescription === "string" ? req.body.rewardDescription.trim() : "";
        if (desc.length === 0) return res.status(400).json({ message: "Reward description is required" });
        updates.rewardDescription = desc;
      }
      if (req.body.imageUrl !== undefined) updates.imageUrl = req.body.imageUrl?.trim() || null;
      if (req.body.sortOrder !== undefined) updates.sortOrder = Number(req.body.sortOrder);
      if (req.body.active !== undefined) updates.active = !!req.body.active;
      const tier = await storage.updateReferralTier(Number(req.params.id), updates);
      res.json(tier);
    } catch (err) {
      res.status(500).json({ message: "Failed to update tier" });
    }
  });

  app.delete("/api/admin/referral-tiers/:id", async (req, res) => {
    if (!req.session?.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      await storage.deleteReferralTier(Number(req.params.id));
      res.json({ message: "Tier deleted" });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete tier" });
    }
  });

  // Referral tier image upload route is registered below, after multer is configured

  app.get("/api/admin/referral-stats", async (req, res) => {
    if (!req.session?.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { rows: totalReferrals } = await pool.query(`SELECT COUNT(*)::int AS count FROM referrals`);
      const { rows: verifiedReferrals } = await pool.query(`SELECT COUNT(*)::int AS count FROM referrals WHERE status = 'verified'`);
      const { rows: pendingReferrals } = await pool.query(`SELECT COUNT(*)::int AS count FROM referrals WHERE status = 'pending'`);
      const { rows: usersWithReferrals } = await pool.query(`SELECT COUNT(DISTINCT referrer_id)::int AS count FROM referrals WHERE status = 'verified'`);
      const { rows: totalUsers } = await pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE email_verified = true`);
      const { rows: referredUsers } = await pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE referred_by IS NOT NULL`);
      const { rows: recentReferrals } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM referrals WHERE created_at >= NOW() - INTERVAL '7 days'`
      );
      const { rows: signupSources } = await pool.query(
        `SELECT u.signup_source AS source, COUNT(*)::int AS count FROM referrals r JOIN users u ON r.referred_user_id = u.id WHERE r.status = 'verified' GROUP BY u.signup_source ORDER BY count DESC LIMIT 10`
      );

      const total = totalReferrals[0].count;
      const verified = verifiedReferrals[0].count;
      const conversionRate = total > 0 ? Math.round((verified / total) * 100) : 0;

      res.json({
        totalReferrals: total,
        verifiedReferrals: verified,
        pendingReferrals: pendingReferrals[0].count,
        conversionRate,
        activeReferrers: usersWithReferrals[0].count,
        totalUsers: totalUsers[0].count,
        referredUsers: referredUsers[0].count,
        last7Days: recentReferrals[0].count,
        topChannels: signupSources,
      });
    } catch (err) {
      console.error("[Admin] Referral stats error:", err);
      res.status(500).json({ message: "Failed to load referral stats" });
    }
  });

  app.get("/api/admin/referral-debug", async (req, res) => {
    if (!req.session?.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { rows: columns } = await pool.query(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'referrals' ORDER BY ordinal_position`
      );
      const { rows: allReferrals } = await pool.query(`SELECT * FROM referrals ORDER BY id LIMIT 50`);
      const { rows: usersWithRefs } = await pool.query(`SELECT id, email, referred_by, email_verified FROM users WHERE referred_by IS NOT NULL ORDER BY id`);
      const { rows: indexes } = await pool.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'referrals'`);
      res.json({ columns, allReferrals, usersWithRefs, indexes });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Admin referral leaderboard (includes current tier info)
  app.get("/api/admin/referral-leaderboard", async (req, res) => {
    if (!req.session?.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const leaderboard = await storage.getLeaderboard(50);
      const tiers = await storage.getReferralTiers();
      const activeTiers = tiers.filter(t => t.active);
      const enriched = leaderboard.map(entry => {
        const currentTier = activeTiers.filter(t => entry.count >= t.threshold).pop() || null;
        return {
          ...entry,
          currentTier: currentTier ? { name: currentTier.rewardName, threshold: currentTier.threshold } : null,
        };
      });
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ message: "Failed to load leaderboard" });
    }
  });

  app.get("/api/admin/referral-fulfillments", async (req, res) => {
    if (!req.session?.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const tiers = await storage.getReferralTiers();
      const activeTiers = tiers.filter(t => t.active).sort((a, b) => a.threshold - b.threshold);

      const { rows: fulfillments } = await pool.query(`
        SELECT rf.*, u.email, u.display_name,
          (SELECT COUNT(*)::int FROM referrals WHERE referrer_id = rf.user_id AND status = 'verified') AS referral_count
        FROM referral_fulfillments rf
        JOIN users u ON u.id = rf.user_id
        ORDER BY rf.tier_threshold ASC, rf.status ASC, rf.created_at DESC
      `);

      const tierData = activeTiers.map(tier => ({
        tier: { id: tier.id, threshold: tier.threshold, rewardName: tier.rewardName, imageUrl: tier.imageUrl },
        users: fulfillments
          .filter((f: any) => f.tier_id === tier.id)
          .sort((a: any, b: any) => {
            if (a.status === 'unsent' && b.status !== 'unsent') return -1;
            if (a.status !== 'unsent' && b.status === 'unsent') return 1;
            return 0;
          })
          .map((f: any) => ({
            fulfillmentId: f.id,
            userId: f.user_id,
            email: f.email,
            displayName: f.display_name,
            status: f.status,
            sentAt: f.sent_at,
            createdAt: f.created_at,
            referralCount: f.referral_count,
          })),
      }));

      res.json(tierData);
    } catch (err) {
      console.error("[Admin] Fulfillment list error:", err);
      res.status(500).json({ message: "Failed to load fulfillments" });
    }
  });

  app.patch("/api/admin/referral-fulfillments/:id", async (req, res) => {
    if (!req.session?.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    const { status } = req.body;
    if (!["sent", "unsent"].includes(status)) {
      return res.status(400).json({ message: "Status must be 'sent' or 'unsent'" });
    }
    try {
      const sentAt = status === "sent" ? new Date() : null;
      const { rows } = await pool.query(
        `UPDATE referral_fulfillments SET status = $1, sent_at = $2 WHERE id = $3 RETURNING *`,
        [status, sentAt, req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Fulfillment not found" });
      res.json(rows[0]);
    } catch (err) {
      console.error("[Admin] Fulfillment update error:", err);
      res.status(500).json({ message: "Failed to update fulfillment" });
    }
  });

  app.post(api.subscriptions.quickSubscribe.path, async (req, res) => {
    try {
      const input = api.subscriptions.quickSubscribe.input.parse(req.body);

      if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(input.slug)) {
        return res.status(400).json({ message: "Invalid topic slug", field: "slug" });
      }

      let user = await storage.getUserByEmail(input.email);
      let isNew = false;

      if (!user) {
        try {
          user = await storage.createUser({
            email: input.email,
            podcasts: input.type === "podcast" ? [input.slug] : [],
            industries: input.type === "industry" ? [input.slug] : [],
            interests: input.type === "interest" ? [input.slug] : [],
            roles: input.type === "role" ? [input.slug] : [],
            topicFrequencies: { [input.slug]: "daily" },
          });
          isNew = true;

          const qsMeta = extractSignupMetadata(req, `quick-subscribe-${input.type}`, input.slug);
          pool.query(
            `UPDATE users SET signup_source = $1, signup_source_detail = $2, ip_address = $3, user_agent = $4, device_type = $5 WHERE id = $6`,
            [qsMeta.signupSource, qsMeta.signupSourceDetail, qsMeta.ipAddress, qsMeta.userAgent, qsMeta.deviceType, user.id]
          ).catch(e => console.error("[SignupMeta] Failed:", e));

          sendVerificationEmail(user).catch((err) =>
            console.error("[VerifyEmail] Failed to send:", err)
          );

          req.session.userId = user.id;
          req.session.signupContext = `${input.type}:${input.slug}`;
        } catch (createErr: any) {
          if (createErr.code === "23505") {
            user = await storage.getUserByEmail(input.email);
            if (!user) throw createErr;
          } else {
            throw createErr;
          }
        }
      }

      if (!isNew) {
        req.session.userId = user.id;

        const field = input.type === "podcast" ? "podcasts"
          : input.type === "industry" ? "industries"
          : input.type === "interest" ? "interests"
          : "roles";

        const currentList: string[] = (user as any)[field] || [];
        if (!currentList.includes(input.slug)) {
          const updates: any = { [field]: [...currentList, input.slug] };
          const currentFreqs = (user.topicFrequencies as Record<string, string>) || {};
          updates.topicFrequencies = { ...currentFreqs, [input.slug]: "daily" };
          user = await storage.updateUser(user.id, updates);
        }
      }

      const safeUser = { id: user.id, email: user.email, subscribed: true };
      res.json({ message: `Subscribed to ${input.name || input.slug}`, user: safeUser, isNew });
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
        from: `PodRise <${fromEmail}>`,
        to: user.email,
        subject: `Log in to PodRise (#${loginCode})`,
        headers: {
          "X-Entity-Ref-ID": crypto.randomUUID(),
        },
        html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#6366F1,#8B5CF6);padding:32px 24px;text-align:center;">
      <h1 style="color:#ffffff;font-size:24px;font-weight:800;margin:0;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">PodRise</h1>
    </div>
    <div style="padding:32px 28px;text-align:center;">
      <h2 style="color:#09090B;font-size:20px;font-weight:700;margin:0 0 12px 0;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Log in to PodRise</h2>
      <p style="color:#52525B;font-size:15px;line-height:1.6;margin:0 0 24px 0;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Click the button below to securely log in. This link expires in 15 minutes.</p>
      <a href="${magicUrl}" style="display:inline-block;padding:14px 32px;background:#6366F1;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:10px;box-shadow:0 4px 12px rgba(99,102,241,0.3);font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Log in to PodRise</a>
      <p style="color:#a1a1aa;font-size:13px;margin:24px 0 0 0;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">If you didn't request this, you can safely ignore this email.</p>
    </div>
    <div style="padding:16px 28px;background:#f7f7fc;text-align:center;border-top:1px solid #F0F0F2;">
      <span style="font-size:13px;color:#52525B;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">PodRise — The intelligence layer on top of podcasts</span>
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

    if (!user.emailVerified) {
      await pool.query(`UPDATE users SET email_verified = true WHERE id = $1`, [user.id]);
      // Verify any pending referral now that email is confirmed via magic link
      storage.verifyReferral(user.id).then(ref => {
        if (ref) {
          console.log(`[Referral] Verified referral for user ${user.id} via magic link login, referrer ${ref.referrerId}`);
          checkAndRecordTierHit(ref.referrerId);
        }
      }).catch(e => console.error("[Referral] Magic link verify error:", e));
      // Send new user notification now that email is confirmed (double opt-in)
      sendNewUserNotification(user, req, user.signupSource || "magic_link").catch((err) =>
        console.error("[NewUserNotify] Failed:", err)
      );
    }

    req.session.save(() => {
      res.redirect(user.onboardingCompleted ? "/dashboard" : "/onboarding");
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

  app.get("/api/auth/google", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).json({ message: "Google OAuth not configured" });
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/auth/google/callback`;
    const scope = encodeURIComponent("openid email profile");
    const state = crypto.randomBytes(16).toString("hex");
    req.session.oauthState = state;
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}&access_type=offline&prompt=select_account`;
    res.redirect(url);
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      if (!code) return res.redirect("/login?error=invalid");
      if (!state || state !== req.session.oauthState) return res.redirect("/login?error=invalid");
      delete req.session.oauthState;

      const clientId = process.env.GOOGLE_CLIENT_ID!;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${baseUrl}/api/auth/google/callback`;

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const tokenData = await tokenRes.json() as any;
      if (!tokenData.access_token) {
        console.error("[GoogleAuth] Token exchange failed:", tokenData);
        return res.redirect("/login?error=invalid");
      }

      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const googleUser = await userInfoRes.json() as { id: string; email: string; name?: string; picture?: string };
      if (!googleUser.email) {
        return res.redirect("/login?error=invalid");
      }

      let user = await storage.getUserByEmail(googleUser.email);

      if (user) {
        if (user.googleId && user.googleId !== googleUser.id) {
          console.error("[GoogleAuth] Google ID mismatch for user:", user.id);
          return res.redirect("/login?error=invalid");
        }
        if (!user.googleId) {
          await pool.query(`UPDATE users SET google_id = $1 WHERE id = $2`, [googleUser.id, user.id]);
        }
        if (!user.emailVerified) {
          await pool.query(`UPDATE users SET email_verified = true WHERE id = $1`, [user.id]);
        }
      } else {
        let detectedTimezone = "America/New_York";
        user = await storage.createUser({
          email: googleUser.email,
          podcasts: [],
          deliveryTime: "07:00",
          deliveryTimezone: detectedTimezone,
        });
        const meta = extractSignupMetadata(req, "google_oauth");
        await pool.query(
          `UPDATE users SET google_id = $1, email_verified = true, signup_source = $2, signup_source_detail = $3, ip_address = $4, user_agent = $5, device_type = $6 WHERE id = $7`,
          [googleUser.id, meta.signupSource, meta.signupSourceDetail, meta.ipAddress, meta.userAgent, meta.deviceType, user.id]
        );

        sendNewUserNotification(user, req, "google_oauth").catch((err) =>
          console.error("[NewUserNotify] Failed:", err)
        );

        // Handle referral tracking for Google OAuth signups
        const refCode = req.session.referralCode;
        if (refCode && typeof refCode === "string") {
          try {
            const referrer = await storage.getUserByReferralCode(refCode);
            if (referrer && referrer.id !== user.id) {
              await pool.query(`UPDATE users SET referred_by = $1 WHERE id = $2`, [referrer.id, user.id]);
              const ref = await storage.createReferral(referrer.id, user.id);
              // Google OAuth users are email-verified by default, so verify the referral immediately
              await storage.verifyReferral(user.id);
              console.log(`[Referral] Google OAuth user ${user.id} referred by ${referrer.id} (code: ${refCode}) — auto-verified`);
              checkAndRecordTierHit(referrer.id);
            }
          } catch (e) {
            console.error("[Referral] Failed to record Google OAuth referral:", e);
          }
          delete req.session.referralCode;
        }

        req.session.userId = user.id;
        req.session.save(() => {
          res.redirect("/onboarding");
        });
        return;
      }

      // Handle referral for existing users logging in via Google (if they were referred but never tracked)
      const refCode = req.session.referralCode;
      if (refCode && typeof refCode === "string") {
        try {
          const referrer = await storage.getUserByReferralCode(refCode);
          if (referrer && referrer.id !== user.id) {
            const existingRef = await pool.query(`SELECT id FROM referrals WHERE referred_user_id = $1`, [user.id]);
            if (existingRef.rows.length === 0) {
              await pool.query(`UPDATE users SET referred_by = $1 WHERE id = $2 AND referred_by IS NULL`, [referrer.id, user.id]);
              await storage.createReferral(referrer.id, user.id);
              if (user.emailVerified) {
                await storage.verifyReferral(user.id);
                console.log(`[Referral] Existing Google user ${user.id} referred by ${referrer.id} (code: ${refCode}) — auto-verified`);
                checkAndRecordTierHit(referrer.id);
              } else {
                console.log(`[Referral] Existing user ${user.id} referred by ${referrer.id} (code: ${refCode}) — pending`);
              }
            }
          }
        } catch (e) {
          console.error("[Referral] Failed to record referral for existing user:", e);
        }
        delete req.session.referralCode;
      }

      req.session.userId = user.id;
      req.session.save(() => {
        res.redirect(user.onboardingCompleted ? "/dashboard" : "/onboarding");
      });
    } catch (err) {
      console.error("[GoogleAuth] Callback error:", err);
      res.redirect("/login?error=invalid");
    }
  });

  app.delete("/api/account", async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const { confirmation } = req.body || {};
    if (confirmation !== "DELETE") {
      return res.status(400).json({ message: "Please type DELETE to confirm account deletion" });
    }
    const user = await storage.getUserById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.plan === "pro") {
      return res.status(400).json({ message: "Please cancel your Pro subscription before deleting your account" });
    }
    try {
      await storage.deleteUser(user.id);
      if (req.session?.userId) {
        req.session.destroy(() => {
          res.json({ message: "Account deleted successfully" });
        });
      } else {
        res.json({ message: "Account deleted successfully" });
      }
    } catch (err: any) {
      console.error("Failed to delete account:", err);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  app.get("/api/bookmarks", async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const bookmarksList = await storage.getBookmarksByUserId(userId);
    res.json(bookmarksList);
  });

  app.post("/api/bookmarks", async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const { episodeSlug, podcastSlug } = req.body;
    if (!episodeSlug || !podcastSlug) {
      return res.status(400).json({ message: "episodeSlug and podcastSlug required" });
    }
    try {
      const exists = await storage.isBookmarked(userId, podcastSlug, episodeSlug);
      if (exists) {
        return res.json({ message: "Already bookmarked" });
      }
      const bookmark = await storage.addBookmark({ userId, episodeSlug, podcastSlug });
      res.status(201).json(bookmark);
    } catch (err) {
      console.error("[Bookmark] Failed to add bookmark:", err);
      res.status(500).json({ message: "Failed to bookmark episode" });
    }
  });

  app.delete("/api/bookmarks/:podcastSlug/:episodeSlug", async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    await storage.removeBookmark(userId, req.params.podcastSlug, req.params.episodeSlug);
    res.json({ message: "Bookmark removed" });
  });

  app.get("/api/bookmarks/enriched", async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const bookmarksList = await storage.getBookmarksByUserId(userId);
      if (bookmarksList.length === 0) {
        return res.json([]);
      }

      const podcastSlugs = bookmarksList.map(b => b.podcastSlug);
      const episodeSlugs = bookmarksList.map(b => b.episodeSlug);
      const { rows: recaps } = await pool.query(
        `SELECT lpr.slug, lpr.episode_slug, lpr.podcast_name, lpr.episode_title,
                lpr.publish_date, lpr.artwork_url, lpr.tldl, lpr.key_insights,
                lpr.what_happened, lpr.quote, lpr.quote_attribution
         FROM landing_page_recaps lpr
         INNER JOIN unnest($1::text[], $2::text[]) AS bm(p_slug, e_slug)
           ON lpr.slug = bm.p_slug AND lpr.episode_slug = bm.e_slug`,
        [podcastSlugs, episodeSlugs]
      );

      const recapMap = new Map<string, any>();
      for (const r of recaps) {
        recapMap.set(`${r.slug}::${r.episode_slug}`, r);
      }

      const enriched = bookmarksList.map(bm => {
        const recap = recapMap.get(`${bm.podcastSlug}::${bm.episodeSlug}`);
        return {
          id: bm.id,
          podcastSlug: bm.podcastSlug,
          episodeSlug: bm.episodeSlug,
          createdAt: bm.createdAt,
          podcastName: recap?.podcast_name || bm.podcastSlug.replace(/-/g, " "),
          episodeTitle: recap?.episode_title || bm.episodeSlug.replace(/-/g, " "),
          publishDate: recap?.publish_date || null,
          artworkUrl: recap?.artwork_url || null,
          tldl: recap?.tldl || null,
          keyInsights: recap?.key_insights || null,
          whatHappened: recap?.what_happened || null,
          quote: recap?.quote || null,
          quoteAttribution: recap?.quote_attribution || null,
        };
      });

      res.json(enriched);
    } catch (err) {
      console.error("[Bookmarks] Failed to fetch enriched bookmarks:", err);
      res.status(500).json({ message: "Failed to fetch enriched bookmarks" });
    }
  });

  function wrapLinksWithClickTracking(html: string, emailId: number): string {
    const baseUrl = "https://podrise.com";
    return html.replace(/href="(https?:\/\/[^"]+)"/g, (_match, url) => {
      if (url.includes("/api/track/")) return `href="${url}"`;
      if (url.includes("unsubscribe")) return `href="${url}"`;
      if (url.includes("mailto:")) return `href="${url}"`;
      const trackUrl = `${baseUrl}/api/track/click/${emailId}?url=${encodeURIComponent(url)}`;
      return `href="${trackUrl}"`;
    });
  }

  const TRACKING_PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  app.get("/api/track/open/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!isNaN(id)) {
        await storage.markEmailOpened(id);
      }
    } catch (e) {
      console.error("[TrackOpen] Failed to mark email opened:", e);
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

  app.get("/api/track/click/:emailId", async (req, res) => {
    const emailId = parseInt(req.params.emailId);
    const url = req.query.url as string;
    if (!url) return res.status(400).send("Missing url parameter");

    let validatedUrl: string;
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return res.status(400).send("Invalid URL scheme");
      }
      validatedUrl = parsed.href;
    } catch {
      return res.status(400).send("Invalid URL");
    }

    try {
      if (!isNaN(emailId)) {
        await pool.query(
          `INSERT INTO email_clicks (email_id, url) VALUES ($1, $2)`,
          [emailId, validatedUrl]
        );
        await pool.query(
          `UPDATE pending_emails SET first_clicked_at = COALESCE(first_clicked_at, NOW()) WHERE id = $1`,
          [emailId]
        );
      }
    } catch (e) {
      console.error("[TrackClick] Failed to record click for emailId=%d url=%s:", emailId, validatedUrl, e);
    }

    res.redirect(302, validatedUrl);
  });

  const ALLOWED_AFFILIATE_DOMAINS = [
    "amazon.com", "www.amazon.com", "amzn.to",
    "amazon.co.uk", "www.amazon.co.uk",
    "amazon.ca", "www.amazon.ca",
    "amazon.de", "www.amazon.de",
    "blinkist.com", "www.blinkist.com",
    "go.blinkist.com",
    "audible.com", "www.audible.com",
    "bookshop.org", "www.bookshop.org",
    "barnesandnoble.com", "www.barnesandnoble.com",
    "target.com", "www.target.com",
    "walmart.com", "www.walmart.com",
    "apple.com", "www.apple.com", "apps.apple.com",
    "open.spotify.com",
    "podcasts.apple.com",
  ];

  app.get("/api/track/affiliate-click", async (req, res) => {
    const url = req.query.url as string;
    const productName = (req.query.name as string) || "Unknown";
    const productType = (req.query.type as string) || "product";
    const productId = req.query.pid ? parseInt(req.query.pid as string) : null;
    const referrerPage = req.query.ref as string || req.headers["referer"] || null;

    if (!url) return res.status(400).send("Missing url parameter");

    let validatedUrl: string;
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return res.status(400).send("Invalid URL scheme");
      }
      const hostname = parsed.hostname.toLowerCase();
      if (!ALLOWED_AFFILIATE_DOMAINS.some(d => hostname === d || hostname.endsWith("." + d))) {
        return res.status(403).send("Redirect destination not allowed");
      }
      validatedUrl = parsed.href;
    } catch {
      return res.status(400).send("Invalid URL");
    }

    try {
      await pool.query(
        `INSERT INTO affiliate_clicks (product_type, product_name, product_id, destination_url, referrer_page) VALUES ($1, $2, $3, $4, $5)`,
        [productType, productName, productId, validatedUrl, referrerPage]
      );
    } catch (e) {
      console.error("[AffiliateClick] Failed to record click:", e);
    }

    res.redirect(302, validatedUrl);
  });

  app.get("/api/admin/analytics/acquisition", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const startDate = req.query.startDate as string || null;
      const endDate = req.query.endDate as string || null;
      const granularity = (req.query.granularity as string) || "daily";

      let dateFilter = "";
      const params: any[] = [];
      if (startDate) { params.push(startDate); dateFilter += ` AND created_at >= $${params.length}::timestamp`; }
      if (endDate) { params.push(endDate + " 23:59:59"); dateFilter += ` AND created_at <= $${params.length}::timestamp`; }

      const truncMap: Record<string, string> = { daily: "day", weekly: "week", monthly: "month", quarterly: "quarter", annual: "year" };
      const trunc = truncMap[granularity] || "day";

      const bySourceResult = await pool.query(
        `SELECT COALESCE(signup_source, 'unknown') as source, COUNT(*) as count FROM users WHERE email_verified = true${dateFilter} GROUP BY source ORDER BY count DESC`,
        params
      );

      const params2 = [...params];
      const byPodcastResult = await pool.query(
        `SELECT COALESCE(signup_source_detail, 'unknown') as detail, COALESCE(signup_source, 'unknown') as source, COUNT(*) as count FROM users WHERE email_verified = true AND signup_source IN ('podcast_page', 'episode_page')${dateFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n)}`)} GROUP BY detail, source ORDER BY count DESC LIMIT 20`,
        params2
      );

      const params3 = [...params];
      const overTimeResult = await pool.query(
        `SELECT date_trunc('${trunc}', created_at) as period, COALESCE(signup_source, 'unknown') as source, COUNT(*) as count FROM users WHERE email_verified = true AND created_at IS NOT NULL${dateFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n)}`)} GROUP BY period, source ORDER BY period ASC`,
        params3
      );

      const params4 = [...params];
      const recentSignupsResult = await pool.query(
        `SELECT u.id, u.email, u.signup_source, u.signup_source_detail, u.device_type, u.created_at, pd.name as podcast_name FROM users u LEFT JOIN podcast_directory pd ON u.signup_source IN ('podcast_page', 'episode_page') AND pd.slug = u.signup_source_detail WHERE u.email_verified = true${dateFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n)}`).replace(/created_at/g, 'u.created_at')} ORDER BY u.created_at DESC LIMIT 50`,
        params4
      );

      const params5 = [...params];
      const totalResult = await pool.query(
        `SELECT COUNT(*) as count FROM users WHERE email_verified = true${dateFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n)}`)}`,
        params5
      );

      res.json({
        totalSignups: parseInt(totalResult.rows[0]?.count || "0"),
        bySource: bySourceResult.rows.map(r => ({ source: r.source, count: parseInt(r.count) })),
        byPodcast: byPodcastResult.rows.map(r => ({ detail: r.detail, source: r.source, count: parseInt(r.count) })),
        overTime: overTimeResult.rows.map(r => ({ period: r.period, source: r.source, count: parseInt(r.count) })),
        recentSignups: recentSignupsResult.rows,
      });
    } catch (err) {
      console.error("Acquisition analytics error:", err);
      res.status(500).json({ message: "Failed to load acquisition analytics" });
    }
  });

  app.get("/api/admin/analytics/affiliates", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const startDate = req.query.startDate as string || null;
      const endDate = req.query.endDate as string || null;
      const granularity = (req.query.granularity as string) || "daily";
      const category = req.query.category as string || null;

      let dateFilter = "";
      const params: any[] = [];
      if (startDate) { params.push(startDate); dateFilter += ` AND clicked_at >= $${params.length}::timestamp`; }
      if (endDate) { params.push(endDate + " 23:59:59"); dateFilter += ` AND clicked_at <= $${params.length}::timestamp`; }

      let catFilter = "";
      if (category && category !== "all") {
        params.push(category);
        catFilter = ` AND product_type = $${params.length}`;
      }

      const truncMap: Record<string, string> = { daily: "day", weekly: "week", monthly: "month", quarterly: "quarter", annual: "year" };
      const trunc = truncMap[granularity] || "day";

      const totalResult = await pool.query(
        `SELECT COUNT(*) as count FROM affiliate_clicks WHERE 1=1${dateFilter}${catFilter}`,
        params
      );

      const p2 = [...params];
      const byProductResult = await pool.query(
        `SELECT product_name, product_type, product_id, COUNT(*) as clicks, MAX(clicked_at) as last_clicked FROM affiliate_clicks WHERE 1=1${dateFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n)}`)}${catFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n)}`)} GROUP BY product_name, product_type, product_id ORDER BY clicks DESC LIMIT 100`,
        p2
      );

      const p3 = [...params];
      const byCategoryResult = await pool.query(
        `SELECT product_type, COUNT(*) as count FROM affiliate_clicks WHERE 1=1${dateFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n)}`)}${catFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n)}`)} GROUP BY product_type ORDER BY count DESC`,
        p3
      );

      const p4 = [...params];
      const overTimeResult = await pool.query(
        `SELECT date_trunc('${trunc}', clicked_at) as period, COUNT(*) as count FROM affiliate_clicks WHERE clicked_at IS NOT NULL${dateFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n)}`)}${catFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n)}`)} GROUP BY period ORDER BY period ASC`,
        p4
      );

      res.json({
        totalClicks: parseInt(totalResult.rows[0]?.count || "0"),
        uniqueProducts: byProductResult.rows.length,
        topProduct: byProductResult.rows[0]?.product_name || null,
        byProduct: byProductResult.rows.map(r => ({ name: r.product_name, type: r.product_type, productId: r.product_id, clicks: parseInt(r.clicks), lastClicked: r.last_clicked })),
        byCategory: byCategoryResult.rows.map(r => ({ type: r.product_type, count: parseInt(r.count) })),
        overTime: overTimeResult.rows.map(r => ({ period: r.period, count: parseInt(r.count) })),
      });
    } catch (err) {
      console.error("Affiliate analytics error:", err);
      res.status(500).json({ message: "Failed to load affiliate analytics" });
    }
  });

  app.get("/api/admin/analytics/growth", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const startDate = req.query.startDate as string || null;
      const endDate = req.query.endDate as string || null;
      const granularity = (req.query.granularity as string) || "daily";

      const truncMap: Record<string, string> = { daily: "day", weekly: "week", monthly: "month", quarterly: "quarter", annual: "year" };
      const trunc = truncMap[granularity] || "day";

      const totalResult = await pool.query(`SELECT COUNT(*) as count FROM users WHERE email_verified = true`);
      const totalUsers = parseInt(totalResult.rows[0]?.count || "0");

      let dateFilter = "";
      const params: any[] = [];
      if (startDate) { params.push(startDate); dateFilter += ` AND created_at >= $${params.length}::timestamp`; }
      if (endDate) { params.push(endDate + " 23:59:59"); dateFilter += ` AND created_at <= $${params.length}::timestamp`; }

      const periodResult = await pool.query(
        `SELECT COUNT(*) as count FROM users WHERE email_verified = true${dateFilter}`,
        params
      );
      const periodSignups = parseInt(periodResult.rows[0]?.count || "0");

      const p2 = [...params];
      const overTimeResult = await pool.query(
        `SELECT date_trunc('${trunc}', created_at) as period, COUNT(*) as count FROM users WHERE email_verified = true AND created_at IS NOT NULL${dateFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n)}`)} GROUP BY period ORDER BY period ASC`,
        p2
      );

      const priorParams: any[] = [];
      let priorFilter = "";
      if (startDate) { priorParams.push(startDate); priorFilter = ` AND created_at < $${priorParams.length}::timestamp`; }
      const priorResult = startDate ? await pool.query(
        `SELECT COUNT(*) as count FROM users WHERE email_verified = true AND created_at IS NOT NULL${priorFilter}`,
        priorParams
      ) : null;
      let cumulative = priorResult ? parseInt(priorResult.rows[0]?.count || "0") : 0;

      const growthData = overTimeResult.rows.map(r => {
        cumulative += parseInt(r.count);
        return { period: r.period, newUsers: parseInt(r.count), totalUsers: cumulative };
      });

      let growthRate = 0;
      if (growthData.length >= 2) {
        const prev = growthData[growthData.length - 2].totalUsers;
        const curr = growthData[growthData.length - 1].totalUsers;
        growthRate = prev > 0 ? Math.round(((curr - prev) / prev) * 100 * 10) / 10 : 0;
      }

      res.json({
        totalUsers,
        periodSignups,
        growthRate,
        overTime: growthData,
      });
    } catch (err) {
      console.error("Growth analytics error:", err);
      res.status(500).json({ message: "Failed to load growth analytics" });
    }
  });

  app.get("/api/admin/analytics/email", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const startDate = req.query.startDate as string || null;
      const endDate = req.query.endDate as string || null;
      const granularity = (req.query.granularity as string) || "daily";

      const truncMap: Record<string, string> = { daily: "day", weekly: "week", monthly: "month", quarterly: "quarter", annual: "year" };
      const trunc = truncMap[granularity] || "day";

      let dateFilter = "";
      const params: any[] = [];
      if (startDate) { params.push(startDate); dateFilter += ` AND sent_at >= $${params.length}::timestamp`; }
      if (endDate) { params.push(endDate + " 23:59:59"); dateFilter += ` AND sent_at <= $${params.length}::timestamp`; }

      const sentResult = await pool.query(
        `SELECT COUNT(*) as total_sent,
                SUM(CASE WHEN email_opened_at IS NOT NULL THEN 1 ELSE 0 END) as total_opened,
                SUM(CASE WHEN first_clicked_at IS NOT NULL THEN 1 ELSE 0 END) as total_clicked,
                AVG(CASE WHEN email_opened_at IS NOT NULL THEN EXTRACT(EPOCH FROM (email_opened_at - sent_at)) END) as avg_time_to_open
         FROM pending_emails WHERE status = 'sent'${dateFilter}`,
        params
      );

      const stats = sentResult.rows[0];
      const totalSent = parseInt(stats?.total_sent || "0");
      const totalOpened = parseInt(stats?.total_opened || "0");
      const totalClicked = parseInt(stats?.total_clicked || "0");
      const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 1000) / 10 : 0;
      const clickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 1000) / 10 : 0;
      const avgTimeToOpen = stats?.avg_time_to_open ? Math.round(parseFloat(stats.avg_time_to_open) / 60) : null;

      const p2 = [...params];
      const trendResult = await pool.query(
        `SELECT date_trunc('${trunc}', sent_at) as period,
                COUNT(*) as sent,
                SUM(CASE WHEN email_opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
                SUM(CASE WHEN first_clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicked
         FROM pending_emails WHERE status = 'sent' AND sent_at IS NOT NULL${dateFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n)}`)}
         GROUP BY period ORDER BY period ASC`,
        p2
      );

      const p3 = [...params];
      const perEmailResult = await pool.query(
        `SELECT id, recipient_email, subject, sent_at, email_opened_at, first_clicked_at,
                recap_date
         FROM pending_emails WHERE status = 'sent'${dateFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n)}`)}
         ORDER BY sent_at DESC LIMIT 100`,
        p3
      );

      const p4 = [...params];
      const topLinksResult = await pool.query(
        `SELECT ec.url, COUNT(*) as clicks
         FROM email_clicks ec
         JOIN pending_emails pe ON ec.email_id = pe.id
         WHERE pe.status = 'sent'${dateFilter.replace(/sent_at/g, 'pe.sent_at').replace(/\$(\d+)/g, (_, n) => `$${parseInt(n)}`)}
         GROUP BY ec.url ORDER BY clicks DESC LIMIT 20`,
        p4
      );

      res.json({
        totalSent,
        totalOpened,
        totalClicked,
        openRate,
        clickRate,
        avgTimeToOpenMinutes: avgTimeToOpen,
        trend: trendResult.rows.map(r => ({
          period: r.period,
          sent: parseInt(r.sent),
          opened: parseInt(r.opened),
          clicked: parseInt(r.clicked),
          openRate: parseInt(r.sent) > 0 ? Math.round((parseInt(r.opened) / parseInt(r.sent)) * 1000) / 10 : 0,
          clickRate: parseInt(r.sent) > 0 ? Math.round((parseInt(r.clicked) / parseInt(r.sent)) * 1000) / 10 : 0,
        })),
        perEmail: perEmailResult.rows.map(r => ({
          id: r.id,
          recipientEmail: r.recipient_email,
          subject: r.subject,
          sentAt: r.sent_at,
          openedAt: r.email_opened_at,
          clickedAt: r.first_clicked_at,
          recapDate: r.recap_date,
        })),
        topLinks: topLinksResult.rows.map(r => ({ url: r.url, clicks: parseInt(r.clicks) })),
      });
    } catch (err) {
      console.error("Email analytics error:", err);
      res.status(500).json({ message: "Failed to load email analytics" });
    }
  });

  const landingPageVisitInput = z.object({
    pageSlug: z.string().min(1).max(100),
    sessionId: z.string().max(200).optional(),
    utmSource: z.string().max(200).optional(),
    utmMedium: z.string().max(200).optional(),
    utmCampaign: z.string().max(200).optional(),
    utmContent: z.string().max(200).optional(),
    utmTerm: z.string().max(200).optional(),
  });

  app.post("/api/landing-pages/visit", async (req, res) => {
    try {
      const parsed = landingPageVisitInput.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid visit data" });
      }
      const { pageSlug, sessionId, utmSource, utmMedium, utmCampaign, utmContent, utmTerm } = parsed.data;
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || null;
      const ua = req.headers["user-agent"] || null;
      let deviceType: string | null = null;
      if (ua) {
        if (/tablet|ipad/i.test(ua)) deviceType = "tablet";
        else if (/mobile|android|iphone|ipod/i.test(ua)) deviceType = "mobile";
        else deviceType = "desktop";
      }
      await pool.query(
        `INSERT INTO landing_page_visits (page_slug, session_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, ip_address, user_agent, device_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [pageSlug, sessionId || null, utmSource || null, utmMedium || null, utmCampaign || null, utmContent || null, utmTerm || null, ip, ua, deviceType]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error("[LandingPage] Visit tracking error:", err);
      res.status(500).json({ message: "Failed to track visit" });
    }
  });

  app.get("/api/admin/landing-pages/analytics", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const visitsResult = await pool.query(`
        SELECT page_slug,
               COUNT(*) as total_visits,
               COUNT(DISTINCT session_id) as unique_visits
        FROM landing_page_visits
        GROUP BY page_slug
      `);

      const signupsResult = await pool.query(`
        SELECT signup_source_detail as slug,
               COUNT(*) as total_signups,
               SUM(CASE WHEN email_verified = true THEN 1 ELSE 0 END) as verified_users
        FROM users
        WHERE signup_source = 'landing_page'
        GROUP BY signup_source_detail
      `);

      const utmResult = await pool.query(`
        SELECT page_slug,
               COALESCE(utm_source, 'direct') as utm_source,
               COALESCE(utm_medium, 'none') as utm_medium,
               COALESCE(utm_campaign, 'none') as utm_campaign,
               COUNT(*) as visits
        FROM landing_page_visits
        GROUP BY page_slug, utm_source, utm_medium, utm_campaign
        ORDER BY visits DESC
      `);

      const timeSeriesResult = await pool.query(`
        SELECT page_slug,
               date_trunc('day', visited_at) as date,
               COUNT(*) as visits
        FROM landing_page_visits
        WHERE visited_at >= NOW() - INTERVAL '30 days'
        GROUP BY page_slug, date
        ORDER BY date ASC
      `);

      const visitsBySlug: Record<string, any> = {};
      for (const row of visitsResult.rows) {
        visitsBySlug[row.page_slug] = {
          totalVisits: parseInt(row.total_visits),
          uniqueVisits: parseInt(row.unique_visits),
        };
      }

      const signupsBySlug: Record<string, any> = {};
      for (const row of signupsResult.rows) {
        signupsBySlug[row.slug] = {
          totalSignups: parseInt(row.total_signups),
          verifiedUsers: parseInt(row.verified_users),
        };
      }

      const utmBySlug: Record<string, any[]> = {};
      for (const row of utmResult.rows) {
        if (!utmBySlug[row.page_slug]) utmBySlug[row.page_slug] = [];
        utmBySlug[row.page_slug].push({
          utmSource: row.utm_source,
          utmMedium: row.utm_medium,
          utmCampaign: row.utm_campaign,
          visits: parseInt(row.visits),
        });
      }

      const timeSeriesBySlug: Record<string, any[]> = {};
      for (const row of timeSeriesResult.rows) {
        if (!timeSeriesBySlug[row.page_slug]) timeSeriesBySlug[row.page_slug] = [];
        timeSeriesBySlug[row.page_slug].push({
          date: row.date,
          visits: parseInt(row.visits),
        });
      }

      res.json({ visitsBySlug, signupsBySlug, utmBySlug, timeSeriesBySlug });
    } catch (err) {
      console.error("[LandingPage] Analytics error:", err);
      res.status(500).json({ message: "Failed to load landing page analytics" });
    }
  });

  app.get("/api/conversion-events", async (_req, res) => {
    try {
      const settings = await storage.getSiteSetting("pixels");
      const { pixelSettingsSchema } = await import("@shared/schema");
      const parsed = pixelSettingsSchema.safeParse(settings || {});
      const events = parsed.success ? parsed.data.conversionEvents : [];
      res.json(events);
    } catch (err) {
      console.error("[ConversionEvents] Error fetching:", err);
      res.json([]);
    }
  });

  app.get("/api/admin/site-settings/pixels", async (req, res) => {
    if (!req.session?.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const settings = await storage.getSiteSetting("pixels");
      res.json(settings || { verificationTags: "", pixels: {}, conversionEvents: [] });
    } catch (err) {
      console.error("[SiteSettings] Error fetching pixels:", err);
      res.status(500).json({ message: "Failed to load pixel settings" });
    }
  });

  app.put("/api/admin/site-settings/pixels", async (req, res) => {
    if (!req.session?.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { pixelSettingsSchema } = await import("@shared/schema");
      const parseResult = pixelSettingsSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid pixel settings", errors: parseResult.error.flatten() });
      }
      const parsed = parseResult.data;

      const sanitizeVerificationTags = (input: string): string => {
        if (!input.trim()) return "";
        const metaTags = input.match(/<meta\s[^>]*\/?>/gi) || [];
        return metaTags.join("\n");
      };

      const sanitizePixelSnippet = (input: string): string => {
        if (!input.trim()) return "";
        const allowedTags = /^<\/?(script|noscript|img|link)\b/i;
        const parts = input.split(/(<[^>]+>)/);
        for (const part of parts) {
          if (part.startsWith("<") && !allowedTags.test(part) && !/^<!--/.test(part) && !/^-->/.test(part.trim())) {
            return "";
          }
        }
        return input;
      };

      const sanitized = {
        verificationTags: sanitizeVerificationTags(parsed.verificationTags || ""),
        pixels: Object.fromEntries(
          Object.entries(parsed.pixels || {}).map(([key, value]) => [
            key,
            sanitizePixelSnippet(String(value || "")),
          ])
        ),
        conversionEvents: (parsed.conversionEvents || []).map((e) => ({
          pagePath: e.pagePath.trim(),
          eventName: e.eventName.trim(),
        })).filter((e) => e.pagePath && e.eventName),
      };

      await storage.setSiteSetting("pixels", sanitized);

      const { invalidatePixelCache } = await import("./pixelInjector");
      invalidatePixelCache();

      res.json({ ok: true, settings: sanitized });
    } catch (err) {
      console.error("[SiteSettings] Error saving pixels:", err);
      res.status(500).json({ message: "Failed to save pixel settings" });
    }
  });

  app.get("/api/podcasts/directory", async (_req, res) => {
    try {
      const cached = directoryCache.podcastsDirectory.get();
      if (cached) return res.json(cached);
      const result = await pool.query(
        `SELECT slug, name, artwork_url, category FROM podcast_directory WHERE slug IS NOT NULL ORDER BY COALESCE(followers_count, 0) DESC, name ASC`
      );
      directoryCache.podcastsDirectory.set(result.rows);
      res.json(result.rows);
    } catch (err) {
      console.error("[Directory] Error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/podcasts/directory/by-topic/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const cacheKey = `topic_podcasts_${slug}`;
      const cached = (directoryCache as any)[cacheKey]?.get?.();
      if (cached) return res.json(cached);

      const topicCategoryMap: Record<string, string[]> = {
        "ai": ["Technology", "Tech", "AI", "Artificial Intelligence", "Science"],
        "startups": ["Entrepreneurship", "Business", "Startups", "Technology"],
        "investing": ["Investing", "Finance", "Business", "Economics"],
        "crypto-web3": ["Crypto", "Web3", "Blockchain", "Technology", "Finance"],
        "health-longevity": ["Health", "Fitness", "Science", "Wellness", "Health & Fitness"],
        "psychology": ["Psychology", "Science", "Education", "Self-Improvement", "Mental Health"],
        "productivity": ["Productivity", "Self-Improvement", "Business", "Education"],
        "geopolitics": ["Politics", "News", "Society", "Government", "Geopolitics", "News & Politics"],
      };

      const categories = topicCategoryMap[slug];
      if (!categories || categories.length === 0) {
        return res.json([]);
      }

      const ilikeConds = categories.map((_, i) => `category ILIKE $${i + 1}`).join(" OR ");
      const result = await pool.query(
        `SELECT slug, name, artwork_url, category, description
         FROM podcast_directory
         WHERE slug IS NOT NULL AND (${ilikeConds})
         ORDER BY followers DESC NULLS LAST, name ASC
         LIMIT 40`,
        categories.map(c => `%${c}%`)
      );

      if (!(directoryCache as any)[cacheKey]) {
        (directoryCache as any)[cacheKey] = new DataCache<any[]>(cacheKey, 60 * 60 * 1000);
      }
      (directoryCache as any)[cacheKey].set(result.rows);
      res.json(result.rows);
    } catch (err) {
      console.error("[TopicPodcasts] Error:", err);
      res.status(500).json({ message: "Failed to fetch topic podcasts" });
    }
  });

  const itunesSearchCache = new Map<string, { results: any[]; expiry: number }>();
  const ITUNES_CACHE_TTL = 5 * 60 * 1000;

  app.get("/api/podcasts/search-itunes", async (req, res) => {
    const term = req.query.term as string;
    if (!term || term.trim().length < 2) {
      return res.json({ results: [] });
    }
    const trimmed = term.trim();
    const cacheKey = trimmed.toLowerCase();

    try {
      const { rows: localRows } = await pool.query(
        `SELECT itunes_id, name, artwork_url, slug, status, has_landing_page, description FROM podcast_directory
         WHERE (name ILIKE $1 OR slug ILIKE $1)
         ORDER BY has_landing_page DESC, name ASC LIMIT 10`,
        [`%${trimmed}%`]
      );

      const localMap = new Map<string, any>();
      for (const r of localRows) {
        localMap.set(String(r.itunes_id), r);
      }

      let itunesResults: any[] = [];
      const cached = itunesSearchCache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        itunesResults = cached.results;
      } else {
        try {
          const itunesRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(trimmed)}&media=podcast&limit=15`);
          if (itunesRes.ok) {
            const itunesData = await itunesRes.json();
            itunesResults = itunesData.results || [];
            itunesSearchCache.set(cacheKey, { results: itunesResults, expiry: Date.now() + ITUNES_CACHE_TTL });
          }
        } catch (e) {
          console.warn("[iTunes Search] Error:", e);
        }
      }

      const itunesIds = itunesResults.map((it: any) => String(it.collectionId || it.trackId)).filter(Boolean);
      const extraLocalMap = new Map<string, any>();
      if (itunesIds.length > 0) {
        const unmatchedIds = itunesIds.filter((id: string) => !localMap.has(id));
        if (unmatchedIds.length > 0) {
          try {
            const { rows: extraRows } = await pool.query(
              `SELECT itunes_id, name, artwork_url, slug, status, has_landing_page, description FROM podcast_directory WHERE itunes_id = ANY($1)`,
              [unmatchedIds]
            );
            for (const r of extraRows) {
              extraLocalMap.set(String(r.itunes_id), r);
            }
          } catch {}
        }
      }

      const platformResults: any[] = [];
      const externalResults: any[] = [];
      const seenIds = new Set<string>();

      for (const r of localRows) {
        const id = String(r.itunes_id);
        seenIds.add(id);
        platformResults.push({
          id,
          name: r.name,
          artistName: "",
          artworkUrl: r.artwork_url || "",
          slug: r.slug || "",
          onPlatform: true,
          hasLandingPage: !!r.has_landing_page,
          status: r.status || "published",
          description: r.description || "",
        });
      }

      for (const it of itunesResults) {
        const id = String(it.collectionId || it.trackId);
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const existingEntry = extraLocalMap.get(id);
        if (existingEntry) {
          platformResults.push({
            id,
            name: existingEntry.name,
            artistName: it.artistName || "",
            artworkUrl: existingEntry.artwork_url || (it.artworkUrl600 || it.artworkUrl100 || "").replace(/\d+x\d+bb/, "200x200bb"),
            slug: existingEntry.slug || "",
            onPlatform: true,
            hasLandingPage: !!existingEntry.has_landing_page,
            status: existingEntry.status || "published",
            description: existingEntry.description || "",
          });
        } else {
          externalResults.push({
            id,
            name: it.collectionName || it.trackName || "",
            artistName: it.artistName || "",
            artworkUrl: (it.artworkUrl600 || it.artworkUrl100 || "").replace(/\d+x\d+bb/, "200x200bb"),
            slug: "",
            onPlatform: false,
            hasLandingPage: false,
            status: null,
            itunesUrl: it.collectionViewUrl || "",
            genre: it.primaryGenreName || "",
            description: "",
          });
        }
      }

      res.json({ results: [...platformResults, ...externalResults].slice(0, 15) });
    } catch (err) {
      console.warn("[iTunes Search] Error:", err);
      res.json({ results: [] });
    }
  });

  app.get("/api/podcasts/search", async (req, res) => {
    const term = req.query.term as string;
    if (!term || term.trim().length < 2) {
      return res.json({ results: [] });
    }
    try {
      const { rows } = await pool.query(
        `SELECT itunes_id, name, artwork_url, slug FROM podcast_directory
         WHERE has_landing_page = true
           AND (name ILIKE $1 OR slug ILIKE $1)
         ORDER BY name ASC LIMIT 8`,
        [`%${term.trim()}%`]
      );
      const results = rows.map((r: any) => ({
        id: String(r.itunes_id),
        name: r.name,
        artistName: "",
        artworkUrl: r.artwork_url || "",
        slug: r.slug || "",
      }));
      res.json({ results });
    } catch {
      res.json({ results: [] });
    }
  });

  app.get("/api/global-search", async (req, res) => {
    const term = req.query.term as string;
    if (!term || term.trim().length < 2) {
      return res.json({ podcasts: [], episodes: [], people: [], companies: [] });
    }
    const searchTerm = `%${term.trim()}%`;
    try {
      const [podcastsResult, episodesResult, peopleResult, companiesResult] = await Promise.all([
        pool.query(
          `SELECT pd.itunes_id, pd.name, pd.artwork_url, pd.slug, pd.has_landing_page,
                  EXISTS(
                    SELECT 1 FROM landing_page_recaps lpr
                    WHERE lpr.slug = pd.slug AND lpr.published = true AND lpr.status = 'published'
                  ) AS has_published_recaps
           FROM podcast_directory pd
           WHERE (pd.name ILIKE $1 OR pd.slug ILIKE $1)
           ORDER BY pd.has_landing_page DESC, pd.name ASC LIMIT 10`,
          [searchTerm]
        ),
        pool.query(
          `SELECT id, slug, episode_slug, podcast_name, episode_title, artwork_url, publish_date
           FROM landing_page_recaps
           WHERE published = true AND status = 'published'
             AND (episode_title ILIKE $1)
           ORDER BY publish_date DESC LIMIT 5`,
          [searchTerm]
        ),
        pool.query(
          `SELECT slug, name, photo_url, title, company FROM entity_people
           WHERE name ILIKE $1 OR $2 = ANY(search_terms)
           ORDER BY name ASC LIMIT 5`,
          [searchTerm, term.trim()]
        ),
        pool.query(
          `SELECT slug, name, logo_url, industry FROM entity_companies
           WHERE name ILIKE $1 OR $2 = ANY(search_terms)
           ORDER BY name ASC LIMIT 5`,
          [searchTerm, term.trim()]
        ),
      ]);

      res.json({
        podcasts: podcastsResult.rows.map((r: any) => ({
          slug: r.slug, name: r.name, artworkUrl: r.artwork_url || "", type: "podcast" as const,
          itunesId: r.itunes_id ? String(r.itunes_id) : null,
          hasLandingPage: !!(r.has_landing_page && r.has_published_recaps),
        })),
        episodes: episodesResult.rows.map((r: any) => ({
          podcastSlug: r.slug, episodeSlug: r.episode_slug, podcastName: r.podcast_name,
          episodeTitle: r.episode_title, artworkUrl: r.artwork_url || "",
          publishDate: r.publish_date, type: "episode" as const,
        })),
        people: peopleResult.rows.map((r: any) => ({
          slug: r.slug, name: r.name, photoUrl: r.photo_url || "",
          title: r.title || "", company: r.company || "", type: "person" as const,
        })),
        companies: companiesResult.rows.map((r: any) => ({
          slug: r.slug, name: r.name, logoUrl: r.logo_url || "",
          industry: r.industry || "", type: "company" as const,
        })),
      });
    } catch (err) {
      console.warn("[GlobalSearch] Error:", err);
      res.json({ podcasts: [], episodes: [], people: [], companies: [] });
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
        `SELECT slug, episode_slug, guests, episode_title, what_happened, tldl, key_insights::text as key_insights_text, publish_date FROM landing_page_recaps WHERE published = true`
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
          `SELECT slug, episode_slug, podcast_name, episode_title, publish_date, artwork_url, what_happened, tldl, key_insights::text as key_insights_text, key_topics, resources FROM landing_page_recaps WHERE published = true AND guests IS NOT NULL AND (${guestConditions})${excludeCondition} ORDER BY publish_date DESC`,
          guestParams
        );

        const mentionParts = person.searchTerms.map((t, i) => buildSearchCondition(["what_happened", "tldl", "key_insights::text", "episode_title"], i + 1, t));
        const mentionConditions = mentionParts.map(p => `(${p.sql})`).join(" OR ");
        const mentionParams = [...mentionParts.map(p => p.param), ...extraParams];
        const { rows: mentionEpisodes } = await client.query(
          `SELECT slug, episode_slug, podcast_name, episode_title, publish_date, artwork_url, what_happened, tldl, key_insights::text as key_insights_text, key_topics, resources FROM landing_page_recaps WHERE published = true AND (${mentionConditions})${excludeCondition} ORDER BY publish_date DESC`,
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
            const key = r.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
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

        let recommendedBooks: { name: string; author: string | null; slug: string | null; amazonUrl: string; asin: string | null; googleBooksId: string | null; isbn: string | null; hasCover: boolean | null; context: string; mentionCount: number; podcastCount: number }[] = [];
        if (bookMentionMap.size > 0) {
          const bookKeys = Array.from(bookMentionMap.keys());
          const aliasPlaceholders = bookKeys.map((_, i) => `$${i + 1}`).join(",");
          const { rows: aliasRows } = await client.query(
            `SELECT alias_key, canonical_key FROM book_aliases WHERE alias_key IN (${aliasPlaceholders})`,
            bookKeys
          );
          const aliasMap = new Map(aliasRows.map((a: any) => [a.alias_key, a.canonical_key]));
          const resolvedKeys = bookKeys.map(k => aliasMap.get(k) || k);
          const uniqueKeys = [...new Set(resolvedKeys)];
          const placeholders = uniqueKeys.map((_, i) => `$${i + 1}`).join(",");
          const { rows: enrichRows } = await client.query(
            `SELECT book_key, slug, author, asin, amazon_url, google_books_id, isbn, has_cover FROM book_enrichments WHERE book_key IN (${placeholders})`,
            uniqueKeys
          );
          const enrichByKey = new Map(enrichRows.map((e: any) => [e.book_key, e]));

          recommendedBooks = Array.from(bookMentionMap.entries())
            .map(([key, b]) => {
              const resolvedKey = aliasMap.get(key) || key;
              const enrich = enrichByKey.get(resolvedKey) as any;
              const asin = enrich?.asin || extractAsinFromUrl(b.url);
              const amazonUrl = `https://www.amazon.com/s?k=${encodeURIComponent(`${b.name}${enrich?.author ? ` ${enrich.author}` : ""} book`)}&tag=podcap-20`;
              return {
                name: b.name,
                author: enrich?.author || b.author,
                slug: enrich?.slug || null,
                amazonUrl,
                asin,
                googleBooksId: enrich?.google_books_id || null,
                isbn: enrich?.isbn || null,
                hasCover: enrich?.has_cover ?? null,
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
        `SELECT what_happened, tldl, key_insights::text as key_insights_text, publish_date FROM landing_page_recaps WHERE published = true`
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
        `SELECT what_happened, tldl, key_insights::text as key_insights_text, episode_title, publish_date FROM landing_page_recaps WHERE published = true`
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

  async function lookupGoogleBooksInfo(title: string, author: string | null): Promise<{id: string; isbn: string | null; hasCover: boolean} | null> {
    try {
      let query = title;
      if (author && author !== "null" && author !== "") query += " " + author;
      const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1&fields=items(id,volumeInfo/imageLinks,volumeInfo/industryIdentifiers)`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const item = data?.items?.[0];
      if (!item?.id) return null;
      const isbn = item.volumeInfo?.industryIdentifiers?.find(
        (id: any) => id.type === "ISBN_13" || id.type === "ISBN_10"
      )?.identifier || null;
      const hasCover = !!item.volumeInfo?.imageLinks;
      return { id: item.id, isbn, hasCover };
    } catch {
      return null;
    }
  }

  async function enrichMissingGoogleBooksIds(books: Array<{name: string; author: string | null; googleBooksId: string | null; isbn?: string | null; hasCover?: boolean | null; description?: string; url?: string}>) {
    const missing = books.filter(b => !b.googleBooksId);
    if (missing.length === 0) return;

    const batch = missing.slice(0, 10);
    for (const book of batch) {
      const info = await lookupGoogleBooksInfo(book.name, book.author);
      if (info) {
        book.googleBooksId = info.id;
        book.isbn = info.isbn;
        book.hasCover = info.hasCover;
        const bookKey = book.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
        const { rows: blocked } = await pool.query("SELECT 1 FROM book_blocklist WHERE book_key = $1", [bookKey]);
        if (blocked.length > 0) continue;
        const descValue = book.description || null;
        const urlValue = book.url || null;
        pool.query(
          `UPDATE book_enrichments SET 
             google_books_id = $1, 
             isbn = COALESCE(isbn, $2), 
             has_cover = COALESCE(has_cover, $3),
             description = COALESCE(NULLIF(TRIM(description), ''), $4),
             amazon_url = COALESCE(NULLIF(TRIM(amazon_url), ''), $5)
           WHERE book_key = $6 AND google_books_id IS NULL`,
          [info.id, info.isbn, info.hasCover, descValue, urlValue, bookKey]
        ).catch(() => {});

        const slug = book.name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").trim();
        pool.query(
          `INSERT INTO book_enrichments (book_key, book_title, author, slug, google_books_id, isbn, has_cover, description, amazon_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (slug) DO UPDATE SET 
             google_books_id = COALESCE(book_enrichments.google_books_id, EXCLUDED.google_books_id),
             isbn = COALESCE(book_enrichments.isbn, EXCLUDED.isbn),
             has_cover = COALESCE(book_enrichments.has_cover, EXCLUDED.has_cover),
             author = COALESCE(book_enrichments.author, EXCLUDED.author),
             description = COALESCE(NULLIF(TRIM(book_enrichments.description), ''), EXCLUDED.description),
             amazon_url = COALESCE(NULLIF(TRIM(book_enrichments.amazon_url), ''), EXCLUDED.amazon_url)`,
          [bookKey, book.name, book.author, slug, info.id, info.isbn, info.hasCover, descValue, urlValue]
        ).catch(() => {});
      }
    }
  }

  app.get("/api/podcasts/:slug/books", async (req, res) => {
    try {
      const { slug } = req.params;
      const { rows } = await pool.query(
        `SELECT episode_slug, episode_title, resources
         FROM landing_page_recaps
         WHERE slug = $1 AND published = true AND resources IS NOT NULL AND resources::text != '[]'`,
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

          const key = r.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
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

      const { rows: enrichments } = await pool.query("SELECT * FROM book_enrichments WHERE cover_approved = true");
      const enrichMap = new Map(enrichments.map((e: any) => [e.book_key, e]));

      const normalizeBookKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

      const bookKeys = [...new Set(Array.from(bookMap.values()).map(b => normalizeBookKey(b.name)))];
      const aliasPlaceholders = bookKeys.map((_, i) => `$${i + 1}`).join(",");
      const { rows: aliasRows } = bookKeys.length > 0 
        ? await pool.query(`SELECT alias_key, canonical_key FROM book_aliases WHERE alias_key IN (${aliasPlaceholders})`, bookKeys)
        : { rows: [] };
      const aliasMap = new Map(aliasRows.map((a: any) => [a.alias_key, a.canonical_key]));

      const { rows: allRecaps } = await pool.query(
        `SELECT slug, resources FROM landing_page_recaps WHERE published = true AND resources IS NOT NULL AND resources::text != '[]'`
      );
      const globalPodcastCounts = new Map<string, Set<string>>();
      for (const row of allRecaps) {
        let resources: any[];
        try { resources = typeof row.resources === 'string' ? JSON.parse(row.resources) : row.resources; } catch { continue; }
        if (!Array.isArray(resources)) continue;
        for (const r of resources) {
          if (r.type !== 'book' || !r.name) continue;
          const rKey = r.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
          if (!globalPodcastCounts.has(rKey)) globalPodcastCounts.set(rKey, new Set());
          globalPodcastCounts.get(rKey)!.add(row.slug);
        }
      }

      const books = Array.from(bookMap.values())
        .map(b => {
          const key = normalizeBookKey(b.name);
          const resolvedKey = aliasMap.get(key) || key;
          const enrichment = enrichMap.get(resolvedKey) as any;
          const originalAsin = extractAsinFromUrl(b.url);
          const finalAsin = enrichment?.asin || originalAsin;
          const bKey = b.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
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
            isbn: enrichment?.isbn || null,
            hasCover: enrichment?.has_cover ?? null,
            podcastCount: globalPodcastCounts.get(bKey)?.size || 1,
          };
        })
        .filter(b => !!b.slug)
        .sort((a, b) => b.mentionCount - a.mentionCount);

      enrichMissingGoogleBooksIds(books).catch(() => {});

      res.json({ books, total: books.length });
    } catch (err) {
      console.error("Podcast books error:", err);
      res.status(500).json({ message: "Failed to load books" });
    }
  });

  function normalizeProductKey(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
  }

  function isAmazonUrl(url: string): boolean {
    return /amazon\.(com|co\.|ca|de|fr|it|es)/i.test(url || "");
  }

  function ensureAffiliateTag(url: string): string {
    if (!url) return "";
    if (!isAmazonUrl(url)) return url;
    try {
      const u = new URL(url);
      u.searchParams.set("tag", "podcap-20");
      return u.toString();
    } catch {
      if (url.includes("tag=")) return url.replace(/tag=[^&]*/, "tag=podcap-20");
      return url + (url.includes("?") ? "&" : "?") + "tag=podcap-20";
    }
  }

  function addUtmParams(url: string): string {
    if (!url || isAmazonUrl(url)) return url;
    try {
      const u = new URL(url);
      u.searchParams.set("utm_source", "podrise");
      u.searchParams.set("utm_medium", "podcast_recap");
      return u.toString();
    } catch {
      return url;
    }
  }

  app.get("/api/podcasts/:slug/products", async (req, res) => {
    try {
      const userId = getAuthUserId(req) || (req.session.userId ?? null);
      let showNonBookProducts = false;
      if (userId) {
        const resolved = await storage.getResolvedFlagsForUser(userId);
        showNonBookProducts = resolved["show_non_book_products"] ?? false;
      } else {
        const flag = await storage.getFeatureFlagByKey("show_non_book_products");
        showNonBookProducts = flag?.enabled ?? false;
      }
      if (!showNonBookProducts) {
        return res.json({ products: [], total: 0 });
      }
      const { slug } = req.params;
      const { rows } = await pool.query(
        `SELECT ep.id, ep.name, ep.company, ep.description, ep.purchase_url, ep.context,
                ep.mention_type, ep.category, ep.episode_title, ep.episode_slug, ep.podcast_slug
         FROM extracted_products ep
         WHERE ep.podcast_slug = $1 AND ep.status = 'approved' AND ep.image_status = 'approved'
         ORDER BY ep.name`,
        [slug]
      );

      const productMap = new Map<string, {
        name: string;
        company: string | null;
        type: string;
        description: string;
        url: string;
        context: string[];
        episodes: { slug: string; title: string }[];
        mentionCount: number;
      }>();

      for (const row of rows) {
        const key = normalizeProductKey(row.name);
        const existing = productMap.get(key);
        const epSlug = row.episode_slug || row.episode_title?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "";
        if (existing) {
          existing.mentionCount++;
          if (row.context && !existing.context.includes(row.context)) {
            existing.context.push(row.context);
          }
          if (!existing.episodes.find((e: any) => e.slug === epSlug)) {
            existing.episodes.push({ slug: epSlug, title: row.episode_title });
          }
          if (!existing.url && row.purchase_url) existing.url = row.purchase_url;
        } else {
          productMap.set(key, {
            name: row.name,
            company: row.company || null,
            type: row.category || "product",
            description: row.description || "",
            url: row.purchase_url || "",
            context: row.context ? [row.context] : [],
            episodes: [{ slug: epSlug, title: row.episode_title }],
            mentionCount: 1,
          });
        }
      }

      const { rows: allProductRows } = await pool.query(
        `SELECT name, podcast_slug FROM extracted_products WHERE status = 'approved' AND image_status = 'approved'`
      );
      const globalProductPodcasts = new Map<string, Set<string>>();
      for (const row of allProductRows) {
        const key = normalizeProductKey(row.name);
        if (!globalProductPodcasts.has(key)) globalProductPodcasts.set(key, new Set());
        globalProductPodcasts.get(key)!.add(row.podcast_slug);
      }

      const products = Array.from(productMap.values())
        .map(p => ({
          ...p,
          url: isAmazonUrl(p.url) ? ensureAffiliateTag(p.url) : addUtmParams(p.url),
          isAmazon: isAmazonUrl(p.url),
          podcastCount: globalProductPodcasts.get(normalizeProductKey(p.name))?.size || 1,
        }))
        .sort((a, b) => b.mentionCount - a.mentionCount);

      res.json({ products, total: products.length });
    } catch (err) {
      console.error("Podcast products error:", err);
      res.status(500).json({ message: "Failed to load products" });
    }
  });

  app.get("/api/podcasts/:slug/episode-products/:episodeSlug", async (req, res) => {
    try {
      const userId = getAuthUserId(req) || (req.session.userId ?? null);
      let showNonBookProducts = false;
      if (userId) {
        const resolved = await storage.getResolvedFlagsForUser(userId);
        showNonBookProducts = resolved["show_non_book_products"] ?? false;
      } else {
        const flag = await storage.getFeatureFlagByKey("show_non_book_products");
        showNonBookProducts = flag?.enabled ?? false;
      }
      if (!showNonBookProducts) {
        return res.json({ products: [], total: 0 });
      }
      const { slug, episodeSlug } = req.params;
      const { rows } = await pool.query(
        `SELECT ep.name, ep.company, ep.description, ep.purchase_url, ep.context,
                ep.mention_type, ep.category
         FROM extracted_products ep
         WHERE ep.podcast_slug = $1 AND ep.status = 'approved' AND ep.image_status = 'approved'
           AND (ep.episode_slug = $2 OR lower(regexp_replace(trim(ep.episode_title), '[^a-zA-Z0-9]+', '-', 'g')) = $2)
         ORDER BY ep.name`,
        [slug, episodeSlug]
      );

      const products = rows.map(r => ({
        name: r.name,
        company: r.company || null,
        type: r.category || "product",
        description: r.description || "",
        url: isAmazonUrl(r.purchase_url || "") ? ensureAffiliateTag(r.purchase_url) : addUtmParams(r.purchase_url || ""),
        isAmazon: isAmazonUrl(r.purchase_url || ""),
        context: r.context || "",
        mentionType: r.mention_type || null,
      }));

      res.json({ products });
    } catch (err) {
      console.error("Episode products error:", err);
      res.status(500).json({ message: "Failed to load episode products" });
    }
  });

  const shopCache = new DataCache<any>("shop", 24 * 60 * 60 * 1000);

  function generateItemSlug(name: string, brandOrAuthor: string | null): string {
    const parts = [name, brandOrAuthor].filter(Boolean).join("-");
    return parts.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  }

  app.get("/api/shop", async (_req, res) => {
    try {
      const userId = getAuthUserId(_req) || (_req.session.userId ?? null);
      let showNonBookProducts = false;
      if (userId) {
        const resolved = await storage.getResolvedFlagsForUser(userId);
        showNonBookProducts = resolved["show_non_book_products"] ?? false;
      } else {
        const flag = await storage.getFeatureFlagByKey("show_non_book_products");
        showNonBookProducts = flag?.enabled ?? false;
      }

      const cached = shopCache.get();
      if (cached) {
        if (showNonBookProducts) return res.json(cached);
        return res.json({ ...cached, products: [], items: (cached as any).items?.filter((i: any) => i.itemType === "book") || [] });
      }

      const slugToName: Record<string, string> = {};
      const { rows: pdRows } = await pool.query(`SELECT slug, name FROM podcast_directory WHERE has_landing_page = true`);
      for (const p of pdRows) slugToName[p.slug] = p.name;

      const { rows: productRows } = await pool.query(
        `SELECT ep.name, ep.company, ep.description, ep.purchase_url, ep.image_url, ep.context,
                ep.mention_type, ep.category, ep.episode_title, ep.episode_slug, ep.podcast_slug
         FROM extracted_products ep
         WHERE ep.status = 'approved' AND ep.image_status = 'approved'
         ORDER BY ep.name`
      );

      const productMap = new Map<string, {
        name: string;
        company: string | null;
        type: string;
        description: string;
        url: string;
        imageUrl: string | null;
        mentionCount: number;
        podcastSlugs: Set<string>;
        episodes: { slug: string; title: string; podcastSlug: string }[];
      }>();

      for (const row of productRows) {
        const key = normalizeProductKey(row.name || "");
        if (!key) continue;
        const epSlug = row.episode_slug || row.episode_title?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "";
        const existing = productMap.get(key);
        if (existing) {
          existing.mentionCount++;
          existing.podcastSlugs.add(row.podcast_slug);
          if (!existing.episodes.find(e => e.slug === epSlug && e.podcastSlug === row.podcast_slug)) {
            existing.episodes.push({ slug: epSlug, title: row.episode_title, podcastSlug: row.podcast_slug });
          }
          if (!existing.url && row.purchase_url) existing.url = row.purchase_url;
          if (!existing.description && row.description) existing.description = row.description;
          if (!existing.imageUrl && row.image_url) existing.imageUrl = row.image_url;
        } else {
          productMap.set(key, {
            name: row.name,
            company: row.company || null,
            type: row.category || "product",
            description: row.description || "",
            url: row.purchase_url || "",
            imageUrl: row.image_url || null,
            mentionCount: 1,
            podcastSlugs: new Set([row.podcast_slug]),
            episodes: [{ slug: epSlug, title: row.episode_title, podcastSlug: row.podcast_slug }],
          });
        }
      }

      const products = Array.from(productMap.values()).map(p => ({
        name: p.name,
        company: p.company,
        category: p.type === "service_or_tool" ? "tool" : p.type === "physical_product" ? "physical_product" : p.type === "experience" ? "experience" : "tool",
        type: p.type,
        description: p.description,
        url: isAmazonUrl(p.url) ? ensureAffiliateTag(p.url) : addUtmParams(p.url),
        isAmazon: isAmazonUrl(p.url),
        imageUrl: p.imageUrl,
        slug: generateItemSlug(p.name, p.company),
        mentionCount: p.mentionCount,
        podcastCount: p.podcastSlugs.size,
        podcastNames: [...p.podcastSlugs].map(s => slugToName[s] || s),
        episodes: p.episodes,
        itemType: "product" as const,
      })).sort((a, b) => b.mentionCount - a.mentionCount || b.podcastCount - a.podcastCount);

      const { rows: bookRecapRows } = await pool.query(
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

      for (const row of bookRecapRows) {
        let resources: any[];
        try {
          const parsed = typeof row.resources === 'string' ? JSON.parse(row.resources) : row.resources;
          if (!Array.isArray(parsed)) continue;
          resources = parsed;
        } catch { continue; }

        for (const r of resources) {
          if (!r || r.type !== 'book' || !r.name || r.name === '_books_checked') continue;
          const key = r.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
          const existing = bookMap.get(key);
          if (existing) {
            existing.mentionCount++;
            if (r.context && !existing.context.includes(r.context)) existing.context.push(r.context);
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

      const { rows: enrichments } = await pool.query("SELECT * FROM book_enrichments WHERE cover_approved = true");
      const enrichMap = new Map(enrichments.map((e: any) => [e.book_key, e]));
      const normalizeBookKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

      const bookKeys = [...new Set(Array.from(bookMap.values()).map(b => normalizeBookKey(b.name)))];
      const aliasPlaceholders = bookKeys.map((_, i) => `$${i + 1}`).join(",");
      const { rows: aliasRows } = bookKeys.length > 0
        ? await pool.query(`SELECT alias_key, canonical_key FROM book_aliases WHERE alias_key IN (${aliasPlaceholders})`, bookKeys)
        : { rows: [] };
      const aliasMap = new Map(aliasRows.map((a: any) => [a.alias_key, a.canonical_key]));

      const mergedBookMap = new Map<string, { name: string; author: string | null; description: string; url: string; context: string[]; podcasts: Map<string, string>; episodes: { podcastSlug: string; episodeSlug: string; episodeTitle: string }[]; mentionCount: number }>();
      for (const [key, val] of bookMap) {
        const resolvedKey = aliasMap.get(key) || key;
        const existing = mergedBookMap.get(resolvedKey);
        if (existing) {
          existing.mentionCount += val.mentionCount;
          for (const [ps, pn] of val.podcasts) existing.podcasts.set(ps, pn);
          for (const ep of val.episodes) {
            if (!existing.episodes.find(e => e.episodeSlug === ep.episodeSlug && e.podcastSlug === ep.podcastSlug))
              existing.episodes.push(ep);
          }
          for (const c of val.context) { if (!existing.context.includes(c)) existing.context.push(c); }
          if (!existing.author && val.author) existing.author = val.author;
          if (!existing.url && val.url) existing.url = val.url;
        } else {
          mergedBookMap.set(resolvedKey, { ...val, podcasts: new Map(val.podcasts) });
        }
      }

      const finalBookMap = new Map<string, typeof mergedBookMap extends Map<string, infer V> ? V : never>();
      for (const [key, val] of mergedBookMap) {
        let merged = false;
        for (const [ek, ev] of finalBookMap) {
          const sameAuthor = val.author && ev.author && val.author.toLowerCase() === ev.author.toLowerCase();
          if (sameAuthor && (ek.startsWith(key) || key.startsWith(ek))) {
            ev.mentionCount += val.mentionCount;
            for (const [ps, pn] of val.podcasts) ev.podcasts.set(ps, pn);
            for (const ep of val.episodes) {
              if (!ev.episodes.find(e => e.episodeSlug === ep.episodeSlug && e.podcastSlug === ep.podcastSlug))
                ev.episodes.push(ep);
            }
            if (!ev.author && val.author) ev.author = val.author;
            if (!ev.url && val.url) ev.url = val.url;
            merged = true;
            break;
          }
        }
        if (!merged) finalBookMap.set(key, val);
      }

      const books = Array.from(finalBookMap.entries())
        .map(([resolvedKey, b]) => {
          const enrichment = enrichMap.get(resolvedKey) as any;
          const enrichedAsin = enrichment?.asin || null;
          const originalAsin = extractAsinFromUrl(b.url);
          const finalAsin = enrichedAsin || originalAsin;
          const amazonUrl = `https://www.amazon.com/s?k=${encodeURIComponent(`${b.name}${enrichment?.author || b.author ? ` ${enrichment?.author || b.author}` : ""} book`)}&tag=podcap-20`;

          return {
            name: b.name,
            author: enrichment?.author || b.author,
            description: enrichment?.description || b.description,
            podcastBuzz: enrichment?.podcast_buzz || null,
            amazonUrl,
            asin: finalAsin,
            slug: enrichment?.slug || null,
            googleBooksId: enrichment?.google_books_id || null,
            isbn: enrichment?.isbn || null,
            hasCover: enrichment?.has_cover ?? null,
            topics: enrichment?.topics || [],
            pageCount: enrichment?.page_count || null,
            publishYear: enrichment?.publish_year || null,
            category: "book" as const,
            podcastCount: b.podcasts.size,
            podcastNames: Array.from(b.podcasts.values()),
            mentionCount: b.mentionCount,
            itemType: "book" as const,
          };
        })
        .filter(b => !!b.slug)
        .sort((a, b) => b.mentionCount - a.mentionCount || b.podcastCount - a.podcastCount);

      const result = { items: [...books, ...products], books, products, total: books.length + products.length };
      shopCache.set(result);
      if (showNonBookProducts) {
        res.json(result);
      } else {
        res.json({ ...result, products: [], items: books });
      }
    } catch (err) {
      console.error("Shop error:", err);
      res.status(500).json({ message: "Failed to load shop" });
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
        `SELECT book_key, slug, rating, page_count, publish_year, asin, description, author, google_books_id, isbn, has_cover FROM book_enrichments`
      );

      const { rows: allRecaps } = await pool.query(
        `SELECT slug AS podcast_slug, resources FROM landing_page_recaps WHERE published = true AND resources IS NOT NULL AND resources::text != '[]'`
      );
      const globalBookPodcasts = new Map<string, Set<string>>();
      for (const row of allRecaps) {
        let resources: any[];
        try { resources = typeof row.resources === 'string' ? JSON.parse(row.resources) : row.resources; } catch { continue; }
        if (!Array.isArray(resources)) continue;
        for (const r of resources) {
          if (r.type !== 'book' || !r.name) continue;
          const rKey = r.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
          if (!globalBookPodcasts.has(rKey)) globalBookPodcasts.set(rKey, new Set());
          globalBookPodcasts.get(rKey)!.add(row.podcast_slug);
        }
      }

      const map: Record<string, any> = {};
      for (const r of rows) {
        if (!r.slug) continue;
        map[r.book_key] = {
          slug: r.slug,
          rating: r.rating ? parseFloat(r.rating) : null,
          pageCount: r.page_count || null,
          publishYear: r.publish_year || null,
          asin: r.asin || null,
          description: r.description || null,
          author: r.author || null,
          googleBooksId: r.google_books_id || null,
          isbn: r.isbn || null,
          hasCover: r.has_cover ?? null,
          podcastCount: globalBookPodcasts.get(r.book_key)?.size || 0,
        };
      }
      const { rows: aliases } = await pool.query(`SELECT alias_key, canonical_key FROM book_aliases`);
      for (const a of aliases) {
        if (!map[a.alias_key] && map[a.canonical_key]) {
          map[a.alias_key] = map[a.canonical_key];
        }
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

          const key = r.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
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

      const { rows: enrichments } = await pool.query("SELECT * FROM book_enrichments WHERE cover_approved = true");
      const enrichMap = new Map(enrichments.map((e: any) => [e.book_key, e]));

      const normalizeBookKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

      const bookKeys = [...new Set(Array.from(bookMap.values()).map(b => normalizeBookKey(b.name)))];
      const aliasPlaceholders = bookKeys.map((_, i) => `$${i + 1}`).join(",");
      const { rows: aliasRows } = bookKeys.length > 0
        ? await pool.query(`SELECT alias_key, canonical_key FROM book_aliases WHERE alias_key IN (${aliasPlaceholders})`, bookKeys)
        : { rows: [] };
      const aliasMap = new Map(aliasRows.map((a: any) => [a.alias_key, a.canonical_key]));

      const books = Array.from(bookMap.values())
        .map(b => {
          const key = normalizeBookKey(b.name);
          const resolvedKey = aliasMap.get(key) || key;
          const enrichment = enrichMap.get(resolvedKey) as any;
          const enrichedAsin = enrichment?.asin || null;
          const originalAsin = extractAsinFromUrl(b.url);
          const finalAsin = enrichedAsin || originalAsin;
          const amazonUrl = `https://www.amazon.com/s?k=${encodeURIComponent(`${b.name}${enrichment?.author || b.author ? ` ${enrichment?.author || b.author}` : ""} book`)}&tag=podcap-20`;

          return {
            name: b.name,
            author: enrichment?.author || b.author,
            description: enrichment?.description || b.description,
            podcastBuzz: enrichment?.podcast_buzz || null,
            amazonUrl,
            asin: finalAsin,
            slug: enrichment?.slug || null,
            googleBooksId: enrichment?.google_books_id || null,
            isbn: enrichment?.isbn || null,
            hasCover: enrichment?.has_cover ?? null,
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
        .filter(b => !!b.slug)
        .sort((a, b) => b.mentionCount - a.mentionCount || b.podcastCount - a.podcastCount);

      const result = { books, total: books.length };
      directoryCache.bookstore.set(result);
      res.json(result);
    } catch (err) {
      console.error("Bookstore error:", err);
      res.status(500).json({ message: "Failed to load bookstore" });
    }
  });

  app.get("/api/shop/product/:slug", async (req, res) => {
    try {
      const { slug } = req.params;

      const slugToName: Record<string, string> = {};
      const { rows: pdRows } = await pool.query(`SELECT slug, name FROM podcast_directory WHERE has_landing_page = true`);
      for (const p of pdRows) slugToName[p.slug] = p.name;

      const { rows: productRows } = await pool.query(
        `SELECT ep.name, ep.company, ep.description, ep.purchase_url, ep.image_url, ep.context, ep.context_summary,
                ep.mention_type, ep.category, ep.episode_title, ep.episode_slug, ep.podcast_slug,
                lpr.publish_date
         FROM extracted_products ep
         LEFT JOIN landing_page_recaps lpr ON lpr.slug = ep.podcast_slug AND lpr.episode_slug = ep.episode_slug
         WHERE ep.status = 'approved'
         ORDER BY ep.name`
      );

      const productMap = new Map<string, {
        name: string;
        company: string | null;
        type: string;
        description: string;
        url: string;
        imageUrl: string | null;
        contexts: string[];
        contextSummaries: string[];
        mentionCount: number;
        podcastSlugs: Set<string>;
        episodes: { slug: string; title: string; podcastSlug: string; context: string | null; contextSummary: string | null; publishedAt: string | null }[];
      }>();

      for (const row of productRows) {
        const key = normalizeProductKey(row.name || "");
        if (!key) continue;
        const epSlug = row.episode_slug || row.episode_title?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "";
        const existing = productMap.get(key);
        if (existing) {
          existing.mentionCount++;
          existing.podcastSlugs.add(row.podcast_slug);
          if (!existing.episodes.find(e => e.slug === epSlug && e.podcastSlug === row.podcast_slug)) {
            existing.episodes.push({ slug: epSlug, title: row.episode_title, podcastSlug: row.podcast_slug, context: row.context || null, contextSummary: row.context_summary || null, publishedAt: row.publish_date || null });
          }
          if (row.context && !existing.contexts.includes(row.context)) existing.contexts.push(row.context);
          if (row.context_summary && !existing.contextSummaries.includes(row.context_summary)) existing.contextSummaries.push(row.context_summary);
          if (!existing.url && row.purchase_url) existing.url = row.purchase_url;
          if (!existing.description && row.description) existing.description = row.description;
          if (!existing.imageUrl && row.image_url) existing.imageUrl = row.image_url;
        } else {
          productMap.set(key, {
            name: row.name,
            company: row.company || null,
            type: row.category || "product",
            description: row.description || "",
            url: row.purchase_url || "",
            imageUrl: row.image_url || null,
            contexts: row.context ? [row.context] : [],
            contextSummaries: row.context_summary ? [row.context_summary] : [],
            mentionCount: 1,
            podcastSlugs: new Set([row.podcast_slug]),
            episodes: [{ slug: epSlug, title: row.episode_title, podcastSlug: row.podcast_slug, context: row.context || null, contextSummary: row.context_summary || null, publishedAt: row.publish_date || null }],
          });
        }
      }

      type ProductEntry = typeof productMap extends Map<string, infer V> ? V : never;
      let matchedProduct: ProductEntry | null = null;
      for (const [, p] of productMap) {
        const pSlug = generateItemSlug(p.name, p.company);
        if (pSlug === slug) {
          matchedProduct = p;
          break;
        }
      }

      if (!matchedProduct) {
        return res.status(404).json({ message: "Product not found" });
      }

      const p = matchedProduct;

      const relatedProducts = Array.from(productMap.values())
        .filter(rp => rp.name !== p.name && rp.imageUrl)
        .filter(rp => {
          for (const ps of p.podcastSlugs) {
            if (rp.podcastSlugs.has(ps)) return true;
          }
          return false;
        })
        .map(rp => ({
          name: rp.name,
          company: rp.company,
          type: rp.type,
          slug: generateItemSlug(rp.name, rp.company),
          imageUrl: rp.imageUrl,
          mentionCount: rp.mentionCount,
          podcastCount: rp.podcastSlugs.size,
        }))
        .sort((a, b) => b.mentionCount - a.mentionCount)
        .slice(0, 6);

      const productKey = normalizeProductKey(p.name || "");
      let podcastBuzz: string | null = null;
      try {
        const { rows: buzzRows } = await pool.query(
          `SELECT podcast_buzz FROM product_podcast_buzz WHERE product_key = $1`,
          [productKey]
        );
        podcastBuzz = buzzRows[0]?.podcast_buzz || null;
      } catch {
      }

      const result = {
        name: p.name,
        company: p.company,
        type: p.type,
        description: p.description,
        url: isAmazonUrl(p.url) ? ensureAffiliateTag(p.url) : addUtmParams(p.url),
        isAmazon: isAmazonUrl(p.url),
        imageUrl: p.imageUrl,
        slug,
        contexts: p.contexts,
        contextSummaries: p.contextSummaries,
        podcastBuzz,
        mentionCount: p.mentionCount,
        podcastCount: p.podcastSlugs.size,
        podcastNames: [...p.podcastSlugs].map(s => slugToName[s] || s),
        episodes: p.episodes.map(e => ({
          podcastSlug: e.podcastSlug,
          podcastName: slugToName[e.podcastSlug] || e.podcastSlug,
          episodeSlug: e.slug,
          episodeTitle: e.title,
          context: e.contextSummary || e.context || null,
          publishedAt: e.publishedAt || null,
        })),
        relatedProducts,
      };

      res.json(result);
    } catch (err) {
      console.error("Product detail error:", err);
      res.status(500).json({ message: "Failed to load product" });
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

      const { rows: bookAliasRows } = await pool.query(
        `SELECT alias_key FROM book_aliases WHERE canonical_key = $1`,
        [bookKey]
      );
      const bookKeyVariants = new Set([bookKey, ...bookAliasRows.map((a: any) => a.alias_key)]);

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

      const AD_CONTEXT_PATTERNS = [
        /\bavailable on blinkist\b/i,
        /\bmentioned as a book available on\b/i,
        /\bavailable on audible\b/i,
        /\bsponsored by\b/i,
        /\bbrought to you by\b/i,
        /\bpromo code\b/i,
        /\buse code\b/i,
        /\bdiscount code\b/i,
        /\bfor quick learning\b/i,
        /\bget (?:a )?free (?:trial|audiobook)\b/i,
      ];

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
          const rKey = r.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
          if (bookKeyVariants.has(rKey)) {
            const ctx = r.context || "";
            const isAdMention = AD_CONTEXT_PATTERNS.some(p => p.test(ctx));
            if (!isAdMention) {
              foundInEpisode = true;
              bookContext = ctx;
            }
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

      const insightsResult = await pool.query(
        `SELECT episode_slug, insight FROM book_insights WHERE book_key = $1`,
        [bookKey]
      );
      const insightsMap = new Map<string, string>();
      for (const r of insightsResult.rows) {
        insightsMap.set(r.episode_slug, r.insight);
      }
      for (const ep of episodes) {
        const insight = insightsMap.get(ep.episodeSlug);
        if (insight) ep.context = insight;
      }

      const datedEpisodes = episodes.filter(e => e.publishedAt).map(e => new Date(e.publishedAt).getTime());
      const firstMentioned = datedEpisodes.length > 0 ? new Date(Math.min(...datedEpisodes)).toISOString() : null;
      const lastMentioned = datedEpisodes.length > 0 ? new Date(Math.max(...datedEpisodes)).toISOString() : null;

      episodes.sort((a, b) => {
        const aHasInsight = insightsMap.has(a.episodeSlug) ? 1 : 0;
        const bHasInsight = insightsMap.has(b.episodeSlug) ? 1 : 0;
        if (bHasInsight !== aHasInsight) return bHasInsight - aHasInsight;
        if (a.publishedAt && b.publishedAt) return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        return 0;
      });

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

      let relatedBooks: { name: string; author: string | null; slug: string; mentionCount: number; asin: string | null; googleBooksId: string | null; isbn: string | null; hasCover: boolean | null; topics: string[] }[] = [];
      if (relatedBookCounts.size > 0) {
        const sortedRelKeys = Array.from(relatedBookCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 30)
          .map(([k]) => k);
        const aliasPlaceholders2 = sortedRelKeys.map((_, i) => `$${i + 1}`).join(",");
        const { rows: aliasRows2 } = await pool.query(
          `SELECT alias_key, canonical_key FROM book_aliases WHERE alias_key IN (${aliasPlaceholders2})`,
          sortedRelKeys
        );
        const aliasMap2 = new Map(aliasRows2.map((a: any) => [a.alias_key, a.canonical_key]));
        const resolvedRelKeys = sortedRelKeys.map(k => aliasMap2.get(k) || k);
        const uniqueRelKeys = [...new Set(resolvedRelKeys)];
        const placeholders = uniqueRelKeys.map((_, i) => `$${i + 1}`).join(",");
        const { rows: relRows } = await pool.query(
          `SELECT book_key, book_title, author, slug, asin, topics, google_books_id, isbn, has_cover FROM book_enrichments WHERE book_key IN (${placeholders})`,
          uniqueRelKeys
        );
        const relMap = new Map(relRows.map((r: any) => [r.book_key, r]));

        for (const rk of sortedRelKeys) {
          const resolvedRk = aliasMap2.get(rk) || rk;
          const rel = relMap.get(resolvedRk);
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
                isbn: rel.isbn || null,
                hasCover: rel.has_cover ?? null,
                topics: rel.topics || [],
              });
            }
          }
        }
        relatedBooks = relatedBooks.slice(0, 8);
      }

      const finalAsin = enrichment.asin || null;
      const amazonSearchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(`${enrichment.book_title}${enrichment.author ? ` ${enrichment.author}` : ""} book`)}&tag=podcap-20`;
      const amazonUrl = amazonSearchUrl;

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
        description: enrichment.google_description || enrichment.description,
        podcastBuzz: enrichment.podcast_buzz,
        slug: enrichment.slug,
        asin: finalAsin,
        googleBooksId: enrichment.google_books_id || null,
        isbn: enrichment.isbn || null,
        hasCover: enrichment.has_cover ?? null,
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
              const { logCompletionUsage } = await import("./apiUsageTracker");
              logCompletionUsage(aiResp, "gpt-4o-mini", "entity_context");

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
      const isEmptyField = (v: any) => !v || typeof v !== 'string' || !v.trim() || v.trim() === '[]' || v.trim() === 'null';
      const hostsFromPodcast = podcastHosts.map(h => h.name).join(", ");
      const resolvedHosts = isEmptyField(recap.hosts) ? hostsFromPodcast : recap.hosts;
      
      let resolvedSpotify = isEmptyField(recap.spotifyEpisodeUrl) ? "" : recap.spotifyEpisodeUrl;
      if (!resolvedSpotify) {
        try {
          const { rows: pdSpotify } = await pool.query(`SELECT spotify_url FROM podcast_directory WHERE slug = $1`, [req.params.slug]);
          if (pdSpotify.length > 0) resolvedSpotify = pdSpotify[0].spotify_url || "";
        } catch {}
      }
      
      res.json({ ...recapWithoutCache, hosts: resolvedHosts, spotifyEpisodeUrl: resolvedSpotify, matchedPeopleSlugs, matchedCompanySlugs, entityContexts });
    } catch {
      res.status(500).json({ error: "Failed to fetch recap" });
    }
  });

  app.get("/api/pulses/recent", async (req, res) => {
    try {
      const exclude = (req.query.exclude as string) || "";
      const pulses = await storage.getRecentPulsesAcrossTopics(exclude, 3);
      res.json(pulses);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch recent pulses" });
    }
  });

  app.get("/api/topics/:slug/pulse", async (req, res) => {
    try {
      const { slug } = req.params;
      const pulses = await storage.getTopicPulses(slug, 100);
      res.json(pulses);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch pulses" });
    }
  });

  app.get("/api/topics/:slug/pulse/:date", async (req, res) => {
    try {
      const { slug, date } = req.params;
      const pulse = await storage.getTopicPulseByDate(slug, date);
      if (!pulse) return res.status(404).json({ error: "Pulse not found" });
      res.json(pulse);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch pulse" });
    }
  });

  app.post("/api/admin/topics/:slug/pulse/generate", async (req, res) => {
    try {
      if (!req.session.isAdmin) return res.status(401).json({ error: "Unauthorized" });

      const { slug } = req.params;
      const { date, topicName } = req.body;
      if (!date || !topicName) return res.status(400).json({ error: "date and topicName required" });

      const { generateAndSavePulse } = await import("./pulseGenerator");
      const pulse = await generateAndSavePulse(slug, date, topicName);
      if (!pulse) return res.status(404).json({ error: "No relevant episodes found for this topic on this date" });
      res.json(pulse);
    } catch (err: any) {
      console.error("[PulseGenerate] Error:", err);
      res.status(500).json({ error: err?.message || "Failed to generate pulse" });
    }
  });

  app.post("/api/admin/pulses/sync", async (req, res) => {
    try {
      if (!req.session.isAdmin) return res.status(401).json({ error: "Unauthorized" });
      const { pulses } = req.body;
      if (!pulses || !Array.isArray(pulses)) return res.status(400).json({ error: "pulses array required" });
      const pool = await import("./db").then(m => m.pool);
      let inserted = 0, skipped = 0;
      for (const p of pulses) {
        try {
          await pool.query(
            `INSERT INTO topic_pulses (topic_slug, publish_date, headline, summary, body, key_themes, episode_count, source_episodes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (topic_slug, publish_date) DO NOTHING`,
            [p.topic_slug, p.publish_date, p.headline, p.summary, p.body, p.key_themes, p.episode_count, JSON.stringify(p.source_episodes)]
          );
          inserted++;
        } catch (err: any) {
          skipped++;
        }
      }
      res.json({ inserted, skipped, total: pulses.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/pulses/generate-all", async (req, res) => {
    try {
      if (!req.session.isAdmin) return res.status(401).json({ error: "Unauthorized" });

      const { dates } = req.body;
      if (!dates || !Array.isArray(dates) || dates.length === 0) {
        return res.status(400).json({ error: "dates array required (e.g. ['2026-03-14', '2026-03-13'])" });
      }

      if (dates.length > 14) {
        return res.status(400).json({ error: "Maximum 14 dates per request" });
      }

      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      const invalidDates = dates.filter((d: string) => !datePattern.test(d));
      if (invalidDates.length > 0) {
        return res.status(400).json({ error: `Invalid date format (expected YYYY-MM-DD): ${invalidDates.join(", ")}` });
      }

      res.json({ message: `Pulse generation started for ${dates.length} date(s)`, dates });

      const { generatePulsesForDate } = await import("./dailyPulseScheduler");
      for (const dateStr of dates) {
        try {
          await generatePulsesForDate(dateStr);
        } catch (err: any) {
          console.error(`[PulseBulkGenerate] Failed for ${dateStr}:`, err.message);
        }
      }
    } catch (err: any) {
      console.error("[PulseBulkGenerate] Error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message || "Failed to generate pulses" });
      }
    }
  });

  app.get("/api/topics/:slug/weekly-intelligence", async (req, res) => {
    try {
      const { slug } = req.params;
      const { pool: dbPool } = await import("./db");
      const client = await dbPool.connect();

      try {
        const topicKeywordsMap: Record<string, { primary: string[]; secondary: string[]; minScore: number }> = {
          "ai": { primary: ["artificial intelligence", "machine learning", "deep learning", "neural network", "large language model"], secondary: ["GPT", "LLM", "ChatGPT", "OpenAI", "Anthropic", "Claude", "AI agent", "AI model", "generative AI", "computer vision", "natural language processing"], minScore: 4 },
          "entrepreneurship": { primary: ["entrepreneurship", "entrepreneur", "founded", "co-founded"], secondary: ["founder", "startup", "bootstrap", "bootstrapped", "side hustle", "building a business"], minScore: 3 },
          "startups": { primary: ["startup", "startups", "product-market fit", "seed round", "series A"], secondary: ["early-stage", "pivot", "launch", "incubator", "accelerator", "Y Combinator"], minScore: 3 },
          "venture-capital": { primary: ["venture capital", "venture capitalist", "VC firm", "fundraising round"], secondary: ["VC", "series A", "series B", "seed funding", "term sheet", "cap table", "valuation"], minScore: 3 },
          "investing": { primary: ["investing", "investment strategy", "stock market", "portfolio management"], secondary: ["stocks", "bonds", "ETF", "hedge fund", "asset allocation", "returns", "bull market", "bear market"], minScore: 3 },
          "personal-finance": { primary: ["personal finance", "financial independence", "wealth building", "financial planning"], secondary: ["budgeting", "saving", "retirement", "debt", "credit score", "net worth", "FIRE"], minScore: 3 },
          "leadership": { primary: ["leadership", "leading teams", "executive leadership"], secondary: ["CEO", "executive", "leader", "vision", "organizational culture", "servant leadership", "management"], minScore: 3 },
          "marketing": { primary: ["marketing strategy", "digital marketing", "brand strategy"], secondary: ["marketing", "brand", "growth hacking", "advertising", "SEO", "content marketing", "social media marketing"], minScore: 3 },
          "sales": { primary: ["sales strategy", "sales process", "selling"], secondary: ["sales", "revenue", "pipeline", "cold calling", "B2B sales", "closing deals"], minScore: 3 },
          "productivity": { primary: ["productivity", "time management", "deep work"], secondary: ["habits", "routines", "efficiency", "focus", "workflow", "GTD"], minScore: 3 },
          "decision-making": { primary: ["decision making", "decision-making", "mental model"], secondary: ["cognitive bias", "heuristic", "judgment", "rational thinking", "first principles"], minScore: 3 },
          "technology": { primary: ["technology", "software engineering", "tech industry"], secondary: ["software", "engineering", "computing", "cloud", "infrastructure", "developer"], minScore: 3 },
          "economics": { primary: ["economics", "economic policy", "macroeconomics"], secondary: ["economy", "monetary policy", "inflation", "recession", "GDP", "Federal Reserve", "fiscal policy"], minScore: 3 },
          "future-of-work": { primary: ["future of work", "remote work", "workplace transformation"], secondary: ["gig economy", "hybrid work", "automation replacing", "freelance", "work from home"], minScore: 3 },
          "health-longevity": { primary: ["longevity", "healthspan", "lifespan"], secondary: ["nutrition", "fitness", "sleep", "wellness", "anti-aging", "biohacking", "metabolic health"], minScore: 3 },
          "psychology": { primary: ["psychology", "psychological", "neuroscience"], secondary: ["behavior", "mental health", "cognitive", "therapy", "emotional intelligence", "trauma"], minScore: 3 },
          "peak-performance": { primary: ["peak performance", "high performance"], secondary: ["biohacking", "optimize", "performance", "elite athlete", "mental toughness"], minScore: 3 },
          "self-improvement": { primary: ["self-improvement", "personal development", "personal growth"], secondary: ["mindset", "motivation", "discipline", "self-help", "life coaching", "transformation"], minScore: 3 },
          "negotiation": { primary: ["negotiation", "negotiating", "negotiator"], secondary: ["persuasion", "influence", "conflict resolution", "bargaining", "deal-making"], minScore: 3 },
          "career-growth": { primary: ["career growth", "career development", "professional development"], secondary: ["career", "promotion", "job search", "networking", "mentorship", "career change"], minScore: 3 },
          "creativity": { primary: ["creativity", "creative process", "creative thinking"], secondary: ["creative", "design", "storytelling", "artistic", "imagination", "inspiration"], minScore: 3 },
          "media-content": { primary: ["media industry", "content creation", "journalism"], secondary: ["media", "streaming", "podcast", "newsletter", "content strategy"], minScore: 3 },
          "geopolitics": { primary: ["geopolitics", "geopolitical", "foreign policy", "international relations"], secondary: ["diplomacy", "international", "sanctions", "trade war", "national security"], minScore: 3 },
          "creator-economy": { primary: ["creator economy", "content creator", "creator"], secondary: ["influencer", "newsletter", "monetize", "audience building", "personal brand", "YouTube", "TikTok"], minScore: 3 },
          "saas": { primary: ["saas", "software as a service", "recurring revenue"], secondary: ["churn", "ARR", "MRR", "subscription", "B2B software", "cloud software"], minScore: 3 },
          "open-source": { primary: ["open source", "open-source", "free software"], secondary: ["GitHub", "Linux", "open model", "open weights", "community-driven"], minScore: 3 },
          "product-management": { primary: ["product management", "product manager", "product strategy"], secondary: ["roadmap", "user research", "product-led", "feature prioritization", "product team"], minScore: 3 },
          "product-market-fit": { primary: ["product-market fit", "product market fit", "PMF"], secondary: ["market validation", "customer discovery", "pivoting", "finding fit", "demand validation"], minScore: 3 },
          "automation": { primary: ["automation", "workflow automation", "process automation"], secondary: ["automate", "automated", "RPA", "no-code", "low-code", "Zapier"], minScore: 3 },
          "robotics": { primary: ["robotics", "robot", "autonomous vehicle"], secondary: ["humanoid", "drone", "manufacturing automation", "self-driving", "autonomous"], minScore: 3 },
          "crypto-web3": { primary: ["cryptocurrency", "bitcoin", "blockchain", "web3"], secondary: ["crypto", "ethereum", "DeFi", "NFT", "token", "decentralized", "smart contract"], minScore: 3 },
          "climate-energy": { primary: ["climate change", "clean energy", "renewable energy"], secondary: ["climate", "solar", "nuclear", "carbon", "sustainability", "electric vehicle", "EV", "energy transition"], minScore: 3 },
          "defense-tech": { primary: ["defense tech", "defense technology", "military technology"], secondary: ["defense", "military", "cybersecurity", "national security", "pentagon", "aerospace", "Anduril", "Palantir"], minScore: 3 },
          "women-in-business": { primary: ["women in business", "female founder", "women entrepreneurs"], secondary: ["women in tech", "female CEO", "women investors", "gender gap", "women leadership"], minScore: 3 },
          "young-entrepreneurs": { primary: ["young entrepreneur", "teenage founder", "young founder"], secondary: ["Gen Z", "college dropout", "young CEO", "millennial founder", "student entrepreneur"], minScore: 3 },
          "bootstrapping": { primary: ["bootstrapping", "bootstrapped", "self-funded"], secondary: ["bootstrap", "profitable", "no funding", "indie hacker", "revenue-funded"], minScore: 3 },
          "side-hustles": { primary: ["side hustle", "side project", "passive income"], secondary: ["freelance", "extra income", "hustle", "side business", "moonlighting"], minScore: 3 },
          "engineering": { primary: ["software engineering", "engineering", "developer"], secondary: ["programming", "coding", "system design", "architecture", "devops"], minScore: 3 },
          "finance": { primary: ["corporate finance", "financial modeling", "capital allocation"], secondary: ["finance", "cfo", "financial analysis", "treasury", "accounting"], minScore: 3 },
          "executive": { primary: ["c-suite", "executive leadership", "board governance"], secondary: ["ceo", "executive", "coo", "cto", "chief", "leadership"], minScore: 3 },
          "founder": { primary: ["founder journey", "founding a company"], secondary: ["founder", "entrepreneurship", "startup", "bootstrap", "co-founder"], minScore: 3 },
        };

        const topicConfig = topicKeywordsMap[slug];
        if (!topicConfig) {
          return res.json({ trendingPeople: [], trendingCompanies: [], quotes: [], products: [], weekRange: "" });
        }

        const now = new Date();
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const twoWeeksAgo = new Date(now);
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
        const weekStart = new Date(weekAgo);
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const weekRange = `${monthNames[weekStart.getMonth()]} ${weekStart.getDate()}–${monthNames[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

        const { primary, secondary, minScore } = topicConfig;
        const allKeywords = [...primary, ...secondary];

        const conditions = allKeywords.map((_, i) => {
          const p = `$${i + 1}`;
          return `(episode_title ILIKE ${p} OR what_happened ILIKE ${p} OR tldl ILIKE ${p} OR key_insights::text ILIKE ${p})`;
        }).join(" OR ");
        const params = allKeywords.map(k => `%${k}%`);

        const { rows: recentRecaps } = await client.query(
          `SELECT slug, episode_slug, podcast_name, episode_title, publish_date, artwork_url, tldl, what_happened, key_insights, key_topics, guests
           FROM landing_page_recaps
           WHERE publish_date >= $${params.length + 1} AND (${conditions})
           ORDER BY publish_date DESC`,
          [...params, weekAgo.toISOString().split("T")[0]]
        );

        const { rows: olderRecaps } = await client.query(
          `SELECT slug, episode_slug, podcast_name, episode_title, publish_date, artwork_url, tldl, what_happened, key_insights, key_topics, guests
           FROM landing_page_recaps
           WHERE publish_date >= $${params.length + 1} AND publish_date < $${params.length + 2} AND (${conditions})
           ORDER BY publish_date DESC`,
          [...params, twoWeeksAgo.toISOString().split("T")[0], weekAgo.toISOString().split("T")[0]]
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

        const scoredRecent = recentRecaps
          .map(ep => ({ ...ep, _score: scoreEpisode(ep) }))
          .filter(ep => ep._score >= minScore);

        const scoredOlder = olderRecaps
          .map(ep => ({ ...ep, _score: scoreEpisode(ep) }))
          .filter(ep => ep._score >= minScore);

        function extractMentionSnippet(recaps: any[], searchTerms: string[], maxSnippets: number = 2): { snippet: string; podcastName: string; episodeSlug: string; podcastSlug: string }[] {
          const snippets: { snippet: string; podcastName: string; episodeSlug: string; podcastSlug: string }[] = [];
          for (const r of recaps) {
            if (snippets.length >= maxSnippets) break;
            const sources = [r.what_happened, r.tldl].filter(Boolean);
            for (const text of sources) {
              const sentences = text.split(/(?<=[.!?])\s+/);
              for (const sentence of sentences) {
                const matched = searchTerms.some(term => {
                  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  return new RegExp(`\\b${escaped}\\b`, 'i').test(sentence);
                });
                if (matched && sentence.length >= 30 && sentence.length <= 300) {
                  const clean = sentence.replace(/^\s*[-•]\s*/, '').trim();
                  if (!snippets.some(s => s.snippet === clean)) {
                    snippets.push({ snippet: clean, podcastName: r.podcast_name, episodeSlug: r.episode_slug, podcastSlug: r.slug });
                    break;
                  }
                }
              }
            }
          }
          return snippets;
        }

        function matchesEntity(texts: string, searchTerms: string[]): boolean {
          return searchTerms.some(term => {
            const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`\\b${escaped}\\b`, 'i').test(texts);
          });
        }

        const trendingPeople: { slug: string; name: string; title: string; trend: string; changePercent: number; recentMentions: number; contextSnippets: { snippet: string; podcastName: string; episodeSlug: string; podcastSlug: string }[] }[] = [];
        for (const person of ENTITY_PEOPLE) {
          const hostedSet = new Set(person.hostedSlugs);
          const recentMentions = scoredRecent.filter(r => {
            if (hostedSet.has(r.slug)) return false;
            const texts = [r.guests, r.what_happened, r.tldl, r.episode_title].filter(Boolean).join(" ");
            return matchesEntity(texts, person.searchTerms);
          });
          const olderMentions = scoredOlder.filter(r => {
            if (hostedSet.has(r.slug)) return false;
            const texts = [r.guests, r.what_happened, r.tldl, r.episode_title].filter(Boolean).join(" ");
            return matchesEntity(texts, person.searchTerms);
          });
          if (recentMentions.length > 0) {
            const trend = computeTrendDirection(recentMentions.length, olderMentions.length);
            const contextSnippets = extractMentionSnippet(recentMentions, person.searchTerms, 2);
            trendingPeople.push({
              slug: person.slug,
              name: person.name,
              title: person.title,
              trend: trend.direction,
              changePercent: trend.changePercent,
              recentMentions: recentMentions.length,
              contextSnippets,
            });
          }
        }
        trendingPeople.sort((a, b) => {
          if (a.trend === "rising" && b.trend !== "rising") return -1;
          if (b.trend === "rising" && a.trend !== "rising") return 1;
          return b.recentMentions - a.recentMentions;
        });

        const trendingCompanies: { slug: string; name: string; description: string; trend: string; changePercent: number; recentMentions: number; contextSnippets: { snippet: string; podcastName: string; episodeSlug: string; podcastSlug: string }[] }[] = [];
        for (const company of ENTITY_COMPANIES) {
          const allTerms = [...company.searchTerms, ...(company.associatedTerms || [])];
          const recentMentions = scoredRecent.filter(r => {
            const texts = [r.what_happened, r.tldl, r.episode_title].filter(Boolean).join(" ");
            return matchesEntity(texts, allTerms);
          });
          const olderMentions = scoredOlder.filter(r => {
            const texts = [r.what_happened, r.tldl, r.episode_title].filter(Boolean).join(" ");
            return matchesEntity(texts, allTerms);
          });
          if (recentMentions.length > 0) {
            const trend = computeTrendDirection(recentMentions.length, olderMentions.length);
            const contextSnippets = extractMentionSnippet(recentMentions, allTerms, 2);
            trendingCompanies.push({
              slug: company.slug,
              name: company.name,
              description: company.description,
              trend: trend.direction,
              changePercent: trend.changePercent,
              recentMentions: recentMentions.length,
              contextSnippets,
            });
          }
        }
        trendingCompanies.sort((a, b) => {
          if (a.trend === "rising" && b.trend !== "rising") return -1;
          if (b.trend === "rising" && a.trend !== "rising") return 1;
          return b.recentMentions - a.recentMentions;
        });

        const recentEpPairs = scoredRecent.map(r => ({ podcastSlug: r.slug, episodeSlug: r.episode_slug }));
        let quotes: any[] = [];
        if (recentEpPairs.length > 0) {
          const pairConditions = recentEpPairs.map((_, i) => `(eq.podcast_slug = $${i * 2 + 1} AND eq.episode_slug = $${i * 2 + 2})`).join(" OR ");
          const pairParams = recentEpPairs.flatMap(p => [p.podcastSlug, p.episodeSlug]);
          const { rows } = await client.query(
            `SELECT eq.speaker_name, eq.quote_text, eq.context, eq.quote_type, eq.podcast_slug, eq.episode_slug,
                    lpr.podcast_name, lpr.episode_title
             FROM episode_quotes eq
             JOIN landing_page_recaps lpr ON eq.podcast_slug = lpr.slug AND (eq.episode_slug = lpr.episode_slug OR eq.episode_slug LIKE lpr.episode_slug || '%' OR lpr.episode_slug LIKE eq.episode_slug || '%')
             WHERE ${pairConditions}
             ORDER BY eq.sort_order ASC`,
            pairParams
          );
          quotes = rows.slice(0, 8).map((q: any) => ({
            speakerName: q.speaker_name,
            quoteText: q.quote_text,
            context: q.context,
            podcastName: q.podcast_name,
            episodeTitle: q.episode_title,
            podcastSlug: q.podcast_slug,
            episodeSlug: q.episode_slug,
          }));
        }

        let products: any[] = [];
        if (recentEpPairs.length > 0) {
          const pairConditions = recentEpPairs.map((_, i) => `(podcast_slug = $${i * 2 + 1} AND episode_slug = $${i * 2 + 2})`).join(" OR ");
          const pairParams = recentEpPairs.flatMap(p => [p.podcastSlug, p.episodeSlug]);
          const { rows } = await client.query(
            `SELECT name, company, description, category, episode_title, podcast_slug, episode_slug, image_url, context_summary
             FROM extracted_products
             WHERE (${pairConditions}) AND status = 'approved'
             ORDER BY extracted_at DESC`,
            pairParams
          );
          const seen = new Set<string>();
          products = rows.filter((p: any) => {
            const key = p.name.toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }).slice(0, 8).map((p: any) => ({
            name: p.name,
            company: p.company,
            description: p.description,
            category: p.category,
            episodeTitle: p.episode_title,
            podcastSlug: p.podcast_slug,
            episodeSlug: p.episode_slug,
            imageUrl: p.image_url,
            contextSummary: p.context_summary,
          }));
        }

        res.json({
          weekRange,
          trendingPeople: trendingPeople.slice(0, 8),
          trendingCompanies: trendingCompanies.slice(0, 8),
          quotes,
          products,
        });
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error("[WeeklyIntelligence] Error:", err);
      res.status(500).json({ error: err?.message || "Failed to fetch weekly intelligence" });
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
        `SELECT book_title, author, slug, google_books_id, isbn, has_cover, book_key FROM book_enrichments WHERE topics && $1::text[] ORDER BY rating DESC NULLS LAST, rating_count DESC NULLS LAST LIMIT 8`,
        [searchTopics]
      );

      const { rows: allRecaps } = await pool.query(
        `SELECT slug AS podcast_slug, resources FROM landing_page_recaps WHERE published = true AND resources IS NOT NULL AND resources::text != '[]'`
      );
      const globalBookPodcasts = new Map<string, Set<string>>();
      for (const row of allRecaps) {
        let resources: any[];
        try { resources = typeof row.resources === 'string' ? JSON.parse(row.resources) : row.resources; } catch { continue; }
        if (!Array.isArray(resources)) continue;
        for (const r of resources) {
          if (r.type !== 'book' || !r.name) continue;
          const rKey = r.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
          if (!globalBookPodcasts.has(rKey)) globalBookPodcasts.set(rKey, new Set());
          globalBookPodcasts.get(rKey)!.add(row.podcast_slug);
        }
      }

      const books = result.rows.map((row: any) => ({
        title: row.book_title,
        author: row.author,
        slug: row.slug,
        googleBooksId: row.google_books_id || null,
        isbn: row.isbn || null,
        hasCover: row.has_cover ?? null,
        podcastCount: globalBookPodcasts.get(row.book_key)?.size || 0,
      }));
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
          WHERE publish_date IS NOT NULL AND published = true
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
          WHERE lpr.publish_date IS NOT NULL AND lpr.published = true
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

  app.get("/api/sidebar-data", async (_req, res) => {
    try {
      const client = await pool.connect();
      try {
        const topicsData = directoryCache.topics.get() || await computeTopicsData();
        const trendingTopics = (topicsData || [])
          .filter((t: any) => t.recentMentions > 0)
          .sort((a: any, b: any) => b.recentMentions - a.recentMentions)
          .slice(0, 5)
          .map((t: any) => ({ slug: t.slug, name: t.name, episodeCount: t.recentMentions, trend: t.trend }));

        const peopleData = directoryCache.people.get() || await computePeopleData();
        const trendingPeople = (peopleData || [])
          .filter((p: any) => p.recentMentions > 0)
          .sort((a: any, b: any) => b.recentMentions - a.recentMentions)
          .slice(0, 4)
          .map((p: any) => ({ slug: p.slug, name: p.name, title: p.title, mentionCount: p.recentMentions, trend: p.trend }));

        const { rows: recentQuotes } = await client.query(
          `SELECT eq.speaker_name, eq.quote_text, eq.context, eq.podcast_slug, eq.episode_slug,
                  lpr.podcast_name, lpr.episode_title
           FROM episode_quotes eq
           JOIN landing_page_recaps lpr ON eq.podcast_slug = lpr.slug AND (eq.episode_slug = lpr.episode_slug OR eq.episode_slug LIKE lpr.episode_slug || '%' OR lpr.episode_slug LIKE eq.episode_slug || '%')
           WHERE lpr.published = true
           ORDER BY lpr.publish_date DESC, eq.sort_order ASC
           LIMIT 30`
        );
        const seenSpeakers = new Set<string>();
        const notableQuotes = recentQuotes.filter((q: any) => {
          const key = q.speaker_name?.toLowerCase();
          if (seenSpeakers.has(key)) return false;
          seenSpeakers.add(key);
          return q.quote_text && q.quote_text.length >= 20 && q.quote_text.length <= 200;
        }).slice(0, 3).map((q: any) => ({
          speakerName: q.speaker_name,
          quoteText: q.quote_text,
          podcastName: q.podcast_name,
          podcastSlug: q.podcast_slug,
          episodeSlug: q.episode_slug,
        }));

        const { rows: bookRows } = await client.query(
          `SELECT be.book_title, be.author, be.slug
           FROM book_enrichments be
           WHERE be.has_cover = true AND be.cover_approved = true AND be.slug IS NOT NULL
           ORDER BY RANDOM()
           LIMIT 6`
        );
        const recommended = bookRows.map((b: any) => ({
          name: b.book_title,
          subtitle: b.author || null,
          imageUrl: `/books/${b.slug}.jpg`,
          type: "book" as const,
          link: `/bookstore/${b.slug}`,
        }));

        const result = { trendingTopics, notableQuotes, trendingPeople, recommended };
        res.json(result);
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Sidebar data error:", err);
      res.status(500).json({ message: "Failed to fetch sidebar data" });
    }
  });

  app.get("/api/sidebar-suggestions", async (req, res) => {
    try {
      const sidebarSugUserId = getAuthUserId(req);
      let followedSlugs: string[] = [];
      if (sidebarSugUserId) {
        const user = await storage.getUserById(sidebarSugUserId);
        if (user) {
          const rawPodcasts = user.podcasts || [];
          const itunesIds = rawPodcasts.map((p: string) => {
            try { const parsed = JSON.parse(p); return parsed.id || p; } catch { return p; }
          });
          if (itunesIds.length > 0) {
            const slugResult = await pool.query(
              `SELECT slug FROM podcast_directory WHERE itunes_id::text = ANY($1)`,
              [itunesIds]
            );
            followedSlugs = slugResult.rows.map((r: any) => r.slug);
          }
        }
      }
      const { rows } = await pool.query(
        `SELECT slug, name, artwork_url, category, description, hosts
         FROM podcast_directory
         WHERE has_landing_page = true AND status = 'published'
         ORDER BY followers DESC NULLS LAST
         LIMIT 20`
      );
      const podcasts = rows.map((p: any) => ({
        slug: p.slug,
        name: p.name,
        artworkUrl: p.artwork_url,
        category: p.category,
        description: p.description ? (p.description.length > 80 ? p.description.slice(0, 80) + "…" : p.description) : null,
        hosts: p.hosts,
      }));
      res.json({ podcasts, followedSlugs });
    } catch (err) {
      console.error("Sidebar suggestions error:", err);
      res.json({ podcasts: [], followedSlugs: [] });
    }
  });

  app.get("/api/onboarding/suggestions", async (req, res) => {
    try {
      const onbUserId = getAuthUserId(req);
      if (!onbUserId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = await storage.getUserById(onbUserId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const contextRaw = (req.query.context as string) || req.session?.signupContext || "";
      const [contextType, contextSlug] = contextRaw.includes(":") ? contextRaw.split(":", 2) : ["", ""];

      let suggestedPodcasts: any[] = [];

      if (contextType === "podcast" && contextSlug) {
        const sourceResult = await pool.query(
          `SELECT category, related_slugs FROM podcast_directory WHERE slug = $1 LIMIT 1`,
          [contextSlug]
        );
        const source = sourceResult.rows[0];
        if (source) {
          const relatedSlugs: string[] = source.related_slugs || [];
          if (relatedSlugs.length > 0) {
            const relatedResult = await pool.query(
              `SELECT slug, name, artwork_url, category, description, followers
               FROM podcast_directory
               WHERE slug = ANY($1) AND slug != $2
               ORDER BY followers DESC NULLS LAST
               LIMIT 12`,
              [relatedSlugs, contextSlug]
            );
            suggestedPodcasts = relatedResult.rows;
          }
          if (suggestedPodcasts.length < 8 && source.category) {
            const catResult = await pool.query(
              `SELECT slug, name, artwork_url, category, description, followers
               FROM podcast_directory
               WHERE category = $1 AND slug != $2 AND slug != ALL($3)
               ORDER BY followers DESC NULLS LAST
               LIMIT $4`,
              [source.category, contextSlug, suggestedPodcasts.map((p: any) => p.slug), 12 - suggestedPodcasts.length]
            );
            suggestedPodcasts = [...suggestedPodcasts, ...catResult.rows];
          }
        }
      }

      if (suggestedPodcasts.length < 8) {
        const existingSlugs = suggestedPodcasts.map((p: any) => p.slug);
        const userPodcastSlugs: string[] = [];
        if (user.podcasts && user.podcasts.length > 0) {
          const itunesIds = user.podcasts.map((p: string) => {
            try { const parsed = JSON.parse(p); return parsed.id || p; } catch { return p; }
          });
          if (itunesIds.length > 0) {
            const slugResult = await pool.query(
              `SELECT slug FROM podcast_directory WHERE itunes_id::text = ANY($1)`,
              [itunesIds]
            );
            userPodcastSlugs.push(...slugResult.rows.map((r: any) => r.slug));
          }
        }
        const excludeSlugs = [...existingSlugs, ...userPodcastSlugs, contextSlug].filter(Boolean);
        const popularResult = await pool.query(
          `SELECT slug, name, artwork_url, category, description, followers
           FROM podcast_directory
           WHERE has_landing_page = true
             AND slug != ALL($1)
           ORDER BY followers DESC NULLS LAST
           LIMIT $2`,
          [excludeSlugs, 12 - suggestedPodcasts.length]
        );
        suggestedPodcasts = [...suggestedPodcasts, ...popularResult.rows];
      }

      const podcasts = suggestedPodcasts.map((p: any) => ({
        slug: p.slug,
        name: p.name,
        artworkUrl: p.artwork_url,
        category: p.category,
        description: p.description ? (p.description.length > 120 ? p.description.slice(0, 120) + "..." : p.description) : null,
        followers: p.followers,
      }));

      const userFollowedSlugs: string[] = [];
      if (user.podcasts && user.podcasts.length > 0) {
        const itunesIds = user.podcasts.map((p: string) => {
          try { const parsed = JSON.parse(p); return parsed.id || p; } catch { return p; }
        });
        if (itunesIds.length > 0) {
          const slugResult = await pool.query(
            `SELECT slug FROM podcast_directory WHERE itunes_id::text = ANY($1)`,
            [itunesIds]
          );
          userFollowedSlugs.push(...slugResult.rows.map((r: any) => r.slug));
        }
      }

      res.json({
        podcasts,
        followedSlugs: userFollowedSlugs,
        followedTopics: {
          industries: user.industries || [],
          interests: user.interests || [],
          roles: user.roles || [],
        },
        context: contextRaw,
        needsOnboarding: !user.onboardingCompleted,
      });
    } catch (err) {
      console.error("Onboarding suggestions error:", err);
      res.status(500).json({ message: "Failed to load suggestions" });
    }
  });

  app.post("/api/onboarding/related-podcasts", async (req, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const { slugs } = req.body;
      if (!slugs || !Array.isArray(slugs) || slugs.length === 0) {
        return res.json({ podcasts: [] });
      }

      const relatedResult = await pool.query(
        `SELECT DISTINCT pd2.slug, pd2.name, pd2.artwork_url, pd2.category, pd2.description, pd2.followers
         FROM podcast_directory pd1
         JOIN podcast_directory pd2 ON pd2.slug = ANY(pd1.related_slugs)
         WHERE pd1.slug = ANY($1)
           AND pd2.slug != ALL($1)
         ORDER BY pd2.followers DESC NULLS LAST
         LIMIT 8`,
        [slugs]
      );

      let results = relatedResult.rows;

      if (results.length < 4) {
        const existingSlugs = [...slugs, ...results.map((r: any) => r.slug)];
        const categoryResult = await pool.query(
          `SELECT category FROM podcast_directory WHERE slug = ANY($1) AND category IS NOT NULL LIMIT 3`,
          [slugs]
        );
        const categories = categoryResult.rows.map((r: any) => r.category).filter(Boolean);
        if (categories.length > 0) {
          const catResult = await pool.query(
            `SELECT slug, name, artwork_url, category, description, followers
             FROM podcast_directory
             WHERE category = ANY($1)
               AND slug != ALL($2)
               AND has_landing_page = true
             ORDER BY followers DESC NULLS LAST
             LIMIT $3`,
            [categories, existingSlugs, 8 - results.length]
          );
          results = [...results, ...catResult.rows];
        }
      }

      const podcasts = results.map((p: any) => ({
        slug: p.slug,
        name: p.name,
        artworkUrl: p.artwork_url,
        category: p.category,
        description: p.description ? (p.description.length > 120 ? p.description.slice(0, 120) + "..." : p.description) : null,
        followers: p.followers,
      }));

      res.json({ podcasts });
    } catch (err) {
      console.error("Related podcasts error:", err);
      res.status(500).json({ message: "Failed to load related podcasts" });
    }
  });

  app.post("/api/onboarding/complete", async (req, res) => {
    try {
      const onbCompleteUserId = getAuthUserId(req);
      if (!onbCompleteUserId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const { podcasts, industries, interests, roles } = req.body;
      const user = await storage.getUserById(onbCompleteUserId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const existingPodcasts = user.podcasts || [];
      const existingIndustries = user.industries || [];
      const existingInterests = user.interests || [];
      const existingRoles = user.roles || [];

      let newPodcasts = [...existingPodcasts];
      if (podcasts && podcasts.length > 0) {
        for (const slug of podcasts) {
          const pdResult = await pool.query(
            `SELECT itunes_id, name, artwork_url FROM podcast_directory WHERE slug = $1 LIMIT 1`,
            [slug]
          );
          const pd = pdResult.rows[0];
          if (pd) {
            const podJson = JSON.stringify({ id: pd.itunes_id?.toString() || slug, name: pd.name, artworkUrl: pd.artwork_url || "" });
            if (!newPodcasts.some((p: string) => {
              try { const parsed = JSON.parse(p); return parsed.id === pd.itunes_id?.toString(); } catch { return p === slug; }
            })) {
              newPodcasts.push(podJson);
            }
          }
        }
      }

      const mergedIndustries = [...new Set([...existingIndustries, ...(industries || [])])];
      const mergedInterests = [...new Set([...existingInterests, ...(interests || [])])];
      const mergedRoles = [...new Set([...existingRoles, ...(roles || [])])];

      await pool.query(
        `UPDATE users SET podcasts = $1, industries = $2, interests = $3, roles = $4, onboarding_completed = true WHERE id = $5`,
        [newPodcasts, mergedIndustries, mergedInterests, mergedRoles, user.id]
      );

      if (req.session?.signupContext) delete req.session.signupContext;
      const updatedUser = await storage.getUserById(user.id);
      res.json(updatedUser);
    } catch (err) {
      console.error("Onboarding complete error:", err);
      res.status(500).json({ message: "Failed to complete onboarding" });
    }
  });

  app.get("/api/feed", async (req, res) => {
    try {
      const tab = (req.query.tab as string) || "foryou";
      const cursor = req.query.cursor ? parseInt(req.query.cursor as string) : null;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const podcastFilter = (req.query.podcast as string) || "";

      let userPodcastSlugs: string[] = [];
      let userTopics: string[] = [];
      let isAuthenticated = false;

      const feedUserId = getAuthUserId(req);
      if (feedUserId) {
        isAuthenticated = true;
        const user = await storage.getUserById(feedUserId);
        if (user) {
          const rawPodcasts = user.podcasts || [];
          const itunesIds = rawPodcasts.map((p: string) => {
            try { const parsed = JSON.parse(p); return parsed.id || p; } catch { return p; }
          });
          if (itunesIds.length > 0) {
            const slugResult = await pool.query(
              `SELECT slug FROM podcast_directory WHERE itunes_id::text = ANY($1)`,
              [itunesIds]
            );
            userPodcastSlugs = slugResult.rows.map((r: any) => r.slug);
          }
          userTopics = [
            ...(user.industries || []),
            ...(user.interests || []),
            ...(user.roles || []),
          ];
        }
      }

      let query: string;
      let params: any[];

      if (tab === "following") {
        if (!isAuthenticated || userPodcastSlugs.length === 0) {
          return res.json({ items: [], nextCursor: null, tab });
        }
        const effectiveSlugs = podcastFilter ? [podcastFilter].filter(s => userPodcastSlugs.includes(s)) : userPodcastSlugs;
        if (effectiveSlugs.length === 0) {
          return res.json({ items: [], nextCursor: null, tab, podcastFilter });
        }
        const cursorParam = cursor ? `AND lr.id < $3` : "";
        query = `
          SELECT lr.id, lr.slug, lr.podcast_name, lr.episode_title, lr.episode_slug,
                 lr.publish_date, lr.artwork_url, lr.tldl, lr.key_insights,
                 lr.quote, lr.quote_attribution, lr.duration,
                 lr.what_happened, lr.guests, lr.key_topics,
                 lr.spotify_episode_url, lr.apple_episode_url, lr.youtube_url,
                 lr.tabloid_sub_headline,
                 pd.slug as pd_slug, pd.hosts as pd_hosts,
                 pd.total_episodes as pd_total_episodes,
                 pd.year_started as pd_year_started,
                 pd.apple_url as pd_apple_url,
                 pd.spotify_url as pd_spotify_url,
                 pd.youtube_url as pd_youtube_url
          FROM landing_page_recaps lr
          LEFT JOIN podcast_directory pd ON pd.slug = lr.slug
          WHERE lr.episode_slug IS NOT NULL
            AND lr.tldl IS NOT NULL
            AND lr.slug = ANY($1)
            ${cursorParam}
          ORDER BY lr.publish_date DESC NULLS LAST, lr.id DESC
          LIMIT $2
        `;
        params = [effectiveSlugs, limit];
        if (cursor) params.push(cursor);
      } else {
        const cursorParam = cursor ? `AND lr.id < $2` : "";
        query = `
          SELECT lr.id, lr.slug, lr.podcast_name, lr.episode_title, lr.episode_slug,
                 lr.publish_date, lr.artwork_url, lr.tldl, lr.key_insights,
                 lr.quote, lr.quote_attribution, lr.duration,
                 lr.what_happened, lr.guests, lr.key_topics,
                 lr.spotify_episode_url, lr.apple_episode_url, lr.youtube_url,
                 lr.tabloid_sub_headline,
                 pd.slug as pd_slug, pd.hosts as pd_hosts,
                 pd.total_episodes as pd_total_episodes,
                 pd.year_started as pd_year_started,
                 pd.apple_url as pd_apple_url,
                 pd.spotify_url as pd_spotify_url,
                 pd.youtube_url as pd_youtube_url
          FROM landing_page_recaps lr
          LEFT JOIN podcast_directory pd ON pd.slug = lr.slug
          WHERE lr.episode_slug IS NOT NULL
            AND lr.tldl IS NOT NULL
            ${cursorParam}
          ORDER BY lr.publish_date DESC NULLS LAST, lr.id DESC
          LIMIT $1
        `;
        params = [limit];
        if (cursor) params.push(cursor);
      }

      const result = await pool.query(query, params);
      const recapIds = result.rows.map((r: any) => r.id);

      let mentionsMap: Record<number, { people: any[]; companies: any[] }> = {};
      if (recapIds.length > 0) {
        const mentionsResult = await pool.query(
          `SELECT eem.recap_id, eem.entity_type, eem.entity_slug, eem.context,
                  CASE WHEN eem.entity_type = 'person' THEN ep.name ELSE ec.name END as entity_name,
                  CASE WHEN eem.entity_type = 'person' THEN ep.title ELSE ec.industry END as entity_role,
                  CASE WHEN eem.entity_type = 'person' THEN ep.company ELSE NULL END as entity_company
           FROM entity_episode_mentions eem
           LEFT JOIN entity_people ep ON eem.entity_type = 'person' AND eem.entity_slug = ep.slug
           LEFT JOIN entity_companies ec ON eem.entity_type = 'company' AND eem.entity_slug = ec.slug
           WHERE eem.recap_id = ANY($1)`,
          [recapIds]
        );
        for (const m of mentionsResult.rows) {
          if (!mentionsMap[m.recap_id]) mentionsMap[m.recap_id] = { people: [], companies: [] };
          const entry = { slug: m.entity_slug, name: m.entity_name, role: m.entity_role, company: m.entity_company, context: m.context };
          if (m.entity_type === 'person') mentionsMap[m.recap_id].people.push(entry);
          else mentionsMap[m.recap_id].companies.push(entry);
        }
      }

      let productsMap: Record<string, any[]> = {};
      if (recapIds.length > 0) {
        const episodePairs = result.rows
          .filter((r: any) => r.episode_slug && r.slug)
          .map((r: any) => ({ episodeSlug: r.episode_slug, podcastSlug: r.slug }));
        const episodeSlugs = [...new Set(episodePairs.map(p => p.episodeSlug))];
        const podcastSlugs = [...new Set(episodePairs.map(p => p.podcastSlug))];
        if (episodeSlugs.length > 0) {
          const productsResult = await pool.query(
            `SELECT podcast_slug, episode_slug, name, company, description, image_url, category, purchase_url
             FROM extracted_products
             WHERE status = 'approved' AND episode_slug = ANY($1) AND podcast_slug = ANY($2)`,
            [episodeSlugs, podcastSlugs]
          );
          for (const p of productsResult.rows) {
            const key = `${p.podcast_slug}:${p.episode_slug}`;
            if (!productsMap[key]) productsMap[key] = [];
            productsMap[key].push({
              name: p.name, company: p.company, description: p.description,
              imageUrl: p.image_url, category: p.category, purchaseUrl: p.purchase_url,
            });
          }
        }
      }

      const items = result.rows.map((r: any) => {
        let parsedGuests: string[] = [];
        if (r.guests) {
          try {
            const raw = typeof r.guests === 'string' ? JSON.parse(r.guests) : r.guests;
            if (Array.isArray(raw)) {
              parsedGuests = raw.map((g: any) => typeof g === 'string' ? g : (g?.name || ''));
            }
          } catch { parsedGuests = []; }
        }
        const mentions = mentionsMap[r.id] || { people: [], companies: [] };
        const products = productsMap[`${r.slug}:${r.episode_slug}`] || [];
        return {
          id: r.id,
          podcastSlug: r.slug,
          podcastName: r.podcast_name,
          episodeTitle: r.episode_title,
          episodeSlug: r.episode_slug,
          publishDate: r.publish_date,
          artworkUrl: r.artwork_url,
          tldl: r.tldl,
          whatHappened: r.what_happened || null,
          keyInsights: r.key_insights,
          quote: r.quote,
          quoteAttribution: r.quote_attribution,
          duration: r.duration,
          guests: parsedGuests,
          keyTopics: r.key_topics || [],
          isFollowing: userPodcastSlugs.includes(r.slug),
          hosts: r.pd_hosts || null,
          totalEpisodes: r.pd_total_episodes || null,
          yearStarted: r.pd_year_started || null,
          appleUrl: r.pd_apple_url || null,
          spotifyUrl: r.pd_spotify_url || null,
          youtubeUrl: r.pd_youtube_url || null,
          spotifyEpisodeUrl: r.spotify_episode_url || null,
          appleEpisodeUrl: r.apple_episode_url || null,
          youtubeEpisodeUrl: r.youtube_url || null,
          tabloidSubHeadline: r.tabloid_sub_headline || null,
          mentions: {
            people: mentions.people,
            companies: mentions.companies,
            products: products,
          },
        };
      });

      const nextCursor = items.length === limit ? items[items.length - 1].id : null;

      res.json({ items, nextCursor, tab });
    } catch (err) {
      console.error("Feed error:", err);
      res.status(500).json({ message: "Failed to load feed" });
    }
  });

  app.get("/api/feed/followed-slugs", async (req, res) => {
    const fsUserId = getAuthUserId(req);
    if (!fsUserId) return res.json({ followedSlugs: [] });
    try {
      const user = await storage.getUserById(fsUserId);
      if (!user) return res.json({ followedSlugs: [] });
      const rawPodcasts = user.podcasts || [];
      const itunesIds = rawPodcasts.map((p: string) => {
        try { const parsed = JSON.parse(p); return parsed.id || p; } catch { return p; }
      });
      if (itunesIds.length === 0) return res.json({ followedSlugs: [] });
      const slugResult = await pool.query(
        `SELECT slug FROM podcast_directory WHERE itunes_id::text = ANY($1)`,
        [itunesIds]
      );
      res.json({ followedSlugs: slugResult.rows.map((r: any) => r.slug) });
    } catch (err) {
      console.error("Followed slugs error:", err);
      res.json({ followedSlugs: [] });
    }
  });

  app.get("/api/feed/followed-podcasts-details", async (req, res) => {
    const fpUserId = getAuthUserId(req);
    if (!fpUserId) return res.json([]);
    try {
      const user = await storage.getUserById(fpUserId);
      if (!user) return res.json([]);
      const rawPodcasts = user.podcasts || [];
      const itunesIds: string[] = [];
      const slugFallbacks: string[] = [];
      for (const p of rawPodcasts) {
        try {
          const parsed = JSON.parse(p);
          if (parsed.id) itunesIds.push(String(parsed.id));
          else slugFallbacks.push(p);
        } catch {
          slugFallbacks.push(p);
        }
      }
      if (itunesIds.length === 0 && slugFallbacks.length === 0) return res.json([]);
      const conditions: string[] = [];
      const params: any[] = [];
      if (itunesIds.length > 0) {
        params.push(itunesIds);
        conditions.push(`itunes_id::text = ANY($${params.length})`);
      }
      if (slugFallbacks.length > 0) {
        params.push(slugFallbacks);
        conditions.push(`slug = ANY($${params.length})`);
      }
      const result = await pool.query(
        `SELECT slug, name, artwork_url AS "artworkUrl", category, hosts FROM podcast_directory WHERE ${conditions.join(' OR ')} ORDER BY name ASC`,
        params
      );
      res.json(result.rows.map((r: any) => ({
        slug: r.slug,
        name: r.name,
        artworkUrl: r.artworkUrl,
        category: r.category || null,
        hosts: r.hosts || null,
      })));
    } catch (err) {
      console.error("Followed podcasts details error:", err);
      res.json([]);
    }
  });

  app.post("/api/feed/follow", async (req, res) => {
    const followUserId = getAuthUserId(req);
    if (!followUserId) return res.status(401).json({ message: "Not authenticated" });
    const { podcastSlug, itunesId, podcastName, artworkUrl: reqArtworkUrl } = req.body;
    if (!podcastSlug && !itunesId) return res.status(400).json({ message: "Missing podcastSlug or itunesId" });

    try {
      const user = await storage.getUserById(followUserId);
      if (!user) return res.status(404).json({ message: "User not found" });

      let slug = podcastSlug;
      let pd: any = null;

      if (slug) {
        const pdResult = await pool.query(
          `SELECT itunes_id, name, slug, artwork_url FROM podcast_directory WHERE slug = $1`,
          [slug]
        );
        pd = pdResult.rows[0] || null;
      }

      if (!pd && itunesId) {
        const pdResult = await pool.query(
          `SELECT itunes_id, name, slug, artwork_url FROM podcast_directory WHERE itunes_id = $1`,
          [String(itunesId)]
        );
        pd = pdResult.rows[0] || null;
      }

      if (!pd && itunesId && podcastName) {
        slug = podcastName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const existingSlug = await pool.query(`SELECT slug FROM podcast_directory WHERE slug = $1`, [slug]);
        if (existingSlug.rows.length > 0) {
          slug = `${slug}-${itunesId}`;
        }

        const artUrl = (reqArtworkUrl || "").replace(/\d+x\d+bb/, "600x600bb");

        await pool.query(
          `INSERT INTO podcast_directory (itunes_id, name, slug, artwork_url, status, has_landing_page, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'requested', false, NOW(), NOW())
           ON CONFLICT (itunes_id) DO NOTHING`,
          [String(itunesId), podcastName, slug, artUrl]
        );

        const insertedResult = await pool.query(
          `SELECT itunes_id, name, slug, artwork_url FROM podcast_directory WHERE itunes_id = $1`,
          [String(itunesId)]
        );
        pd = insertedResult.rows[0] || null;
        if (pd) slug = pd.slug;

        if (pd) {
          (async () => {
            try {
              const lookupRes = await fetch(`https://itunes.apple.com/lookup?id=${itunesId}&media=podcast`);
              const lookupJson = await lookupRes.json();
              const itunesData = lookupJson.results?.[0];
              if (itunesData) {
                const description = itunesData.description || "";
                const category = itunesData.primaryGenreName || "";
                const appleUrl = itunesData.collectionViewUrl || "";
                const highResArt = (itunesData.artworkUrl600 || itunesData.artworkUrl100 || "").replace(/\d+x\d+bb/, "600x600bb");
                const trackCount = itunesData.trackCount || null;

                await pool.query(
                  `UPDATE podcast_directory SET
                    description = COALESCE(NULLIF(description, ''), $1),
                    category = COALESCE(NULLIF(category, ''), $2),
                    apple_url = COALESCE(NULLIF(apple_url, ''), $3),
                    artwork_url = COALESCE(NULLIF(artwork_url, ''), $4),
                    total_episodes = COALESCE(total_episodes, $5),
                    updated_at = NOW()
                  WHERE itunes_id = $6`,
                  [description, category, appleUrl, highResArt, trackCount, String(itunesId)]
                );
              }
            } catch (enrichErr) {
              console.warn("[Follow] iTunes enrichment error for", itunesId, enrichErr);
            }
          })();
        }
      }

      if (!pd) return res.status(404).json({ message: "Podcast not found and could not be created" });

      const artworkResult = await pool.query(
        `SELECT artwork_url FROM landing_page_recaps WHERE slug = $1 LIMIT 1`,
        [pd.slug]
      );
      const finalArtworkUrl = artworkResult.rows[0]?.artwork_url || pd.artwork_url || "";

      const currentPodcasts = user.podcasts || [];
      const existingIds = currentPodcasts.map((p: string) => {
        try { const parsed = JSON.parse(p); return parsed.id || p; } catch { return p; }
      });

      if (existingIds.includes(pd.itunes_id.toString())) {
        return res.json({ success: true, message: "Already following" });
      }

      const newEntry = JSON.stringify({
        id: pd.itunes_id.toString(),
        name: pd.name,
        artworkUrl: finalArtworkUrl,
      });

      await pool.query(
        `UPDATE users SET podcasts = array_append(podcasts, $1) WHERE id = $2`,
        [newEntry, followUserId]
      );

      res.json({ success: true, slug: pd.slug });
    } catch (err) {
      console.error("Follow error:", err);
      res.status(500).json({ message: "Failed to follow" });
    }
  });

  app.post("/api/feed/unfollow", async (req, res) => {
    const unfollowUserId = getAuthUserId(req);
    if (!unfollowUserId) return res.status(401).json({ message: "Not authenticated" });
    const { podcastSlug } = req.body;
    if (!podcastSlug) return res.status(400).json({ message: "Missing podcastSlug" });

    try {
      const user = await storage.getUserById(unfollowUserId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const pdResult = await pool.query(
        `SELECT itunes_id FROM podcast_directory WHERE slug = $1`,
        [podcastSlug]
      );
      if (pdResult.rows.length === 0) return res.status(404).json({ message: "Podcast not found" });

      const itunesId = pdResult.rows[0].itunes_id.toString();
      const currentPodcasts = user.podcasts || [];
      const filtered = currentPodcasts.filter((p: string) => {
        try { const parsed = JSON.parse(p); return (parsed.id || p) !== itunesId; } catch { return p !== itunesId; }
      });

      await pool.query(
        `UPDATE users SET podcasts = $1 WHERE id = $2`,
        [filtered, unfollowUserId]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("Unfollow error:", err);
      res.status(500).json({ message: "Failed to unfollow" });
    }
  });

  app.get("/api/recaps", async (req, res) => {
    const recapUserId = getAuthUserId(req);
    if (!recapUserId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const recaps = await storage.getRecapsByUserId(recapUserId);
    res.json(recaps);
  });

  app.post("/api/recaps/generate", async (req, res) => {
    const recapGenUserId = getAuthUserId(req);
    if (!recapGenUserId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUserById(recapGenUserId);
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
    const sendEmailUserId = getAuthUserId(req);
    if (!sendEmailUserId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUserById(sendEmailUserId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const parsed = z.object({ recapId: z.coerce.number().int().positive() }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Missing or invalid recapId" });
    }
    const { recapId } = parsed.data;

    let pendingRecordId: number | undefined;
    try {
      const recaps = await storage.getRecapsByUserId(user.id);
      const recap = recaps.find((r) => r.id === recapId);
      if (!recap) {
        return res.status(404).json({ message: "Recap not found" });
      }

      if (!recapHasContent(recap.summary)) {
        return res.status(400).json({ message: "This recap has no parseable episode content. It cannot be sent." });
      }

      const epMeta = await buildEpisodeMetaFromSummary(recap.summary);
      const { generateEmailSubjectAndPreview } = await import("./emailScheduler");
      const { parseDigestMarkdown } = await import("./emailTemplate");
      const parsedDigestForSend = parseDigestMarkdown(recap.summary);
      const epCountForSend = parsedDigestForSend.episodes.length || 1;
      const emailCopyForSend = await generateEmailSubjectAndPreview(recap.summary, epCountForSend);
      const { reorderMarkdownLeadFirst } = await import("./emailScheduler");
      const reorderedForSend = reorderMarkdownLeadFirst(recap.summary, emailCopyForSend.leadEpisodePodcast);
      const emailHtml = markdownToEmailHtml(reorderedForSend, user.email, epMeta, emailCopyForSend);

      const pendingRecord = await storage.createPendingEmail({
        userId: user.id,
        recipientEmail: user.email,
        podcasts: recap.podcasts,
        recapDate: new Date().toISOString().slice(0, 10),
        summary: recap.summary,
        emailHtml,
        subject: emailCopyForSend.subject,
        scheduledFor: "now",
        timezone: "America/New_York",
        source: "manual",
        status: "sending",
      });
      pendingRecordId = pendingRecord.id;

      const baseUrl = "https://podrise.com";
      const htmlWithClickTracking = wrapLinksWithClickTracking(emailHtml, pendingRecord.id);
      const trackingPixel = `<img src="${baseUrl}/api/track/open/${pendingRecord.id}" width="1" height="1" style="display:block;width:1px;height:1px;border:0;" alt="" />`;
      const htmlWithTracking = htmlWithClickTracking.replace(/<\/body>/i, `${trackingPixel}</body>`) !== htmlWithClickTracking
        ? htmlWithClickTracking.replace(/<\/body>/i, `${trackingPixel}</body>`)
        : htmlWithClickTracking + trackingPixel;

      const { client, fromEmail } = await getUncachableResendClient();

      const result = await client.emails.send({
        from: `PodRise <${fromEmail}>`,
        to: user.email,
        subject: emailCopyForSend.subject,
        html: htmlWithTracking,
      });

      if (result.error) {
        console.error("Resend API error:", JSON.stringify(result.error));
        await storage.updatePendingEmailStatus(pendingRecord.id, "error", result.error.message || "Send failed");
        return res.status(500).json({ message: `Email failed: ${result.error.message || "Unknown error"}` });
      }

      console.log("Resend email sent, id:", result.data?.id);

      await storage.updatePendingEmailStatus(pendingRecord.id, "sent");
      await storage.logEmail({
        userId: user.id,
        recipientEmail: user.email,
        podcasts: recap.podcasts,
        source: "manual",
        emailHtml,
      });

      res.json({ message: "Email sent successfully" });
    } catch (err: any) {
      if (pendingRecordId) {
        await storage.updatePendingEmailStatus(pendingRecordId, "error", err?.message || String(err)).catch(() => {});
      }
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
    let adminEmail: string | null = null;
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
      try {
        const { rows: adminUserRows } = await pool.query(
          `SELECT id, email, password_hash FROM admin_users WHERE password_hash IS NOT NULL AND status = 'active'`
        );
        for (const au of adminUserRows) {
          if (await bcrypt.compare(parsed.data.password, au.password_hash)) {
            isValid = true;
            adminEmail = au.email;
            break;
          }
        }
      } catch {}
    }

    if (!isValid) {
      const entry = adminLoginAttempts.get(ip)!;
      entry.count++;
      return res.status(401).json({ message: "Invalid admin password" });
    }

    adminLoginAttempts.delete(ip);
    req.session.isAdmin = true;
    res.json({ message: "Admin authenticated", email: adminEmail });
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

  app.get("/api/admin/admin-users", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const { pool } = await import("./db");
    const { rows } = await pool.query(
      `SELECT id, email, name, role, status, invite_sent_at, created_at FROM admin_users ORDER BY created_at DESC`
    );
    res.json(rows.map((r: any) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      status: r.status || "pending",
      inviteSentAt: r.invite_sent_at,
      createdAt: r.created_at,
    })));
  });

  app.post("/api/admin/admin-users", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const { insertAdminUserSchema, adminUsers } = await import("@shared/schema");
    const parsed = insertAdminUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
    const { db } = await import("./db");
    try {
      const [row] = await db.insert(adminUsers).values(parsed.data).returning();
      res.json(row);
    } catch (e: any) {
      if (e.code === "23505") return res.status(409).json({ message: "An admin with this email already exists" });
      throw e;
    }
  });

  app.patch("/api/admin/admin-users/:id", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const { db } = await import("./db");
    const { eq } = await import("drizzle-orm");
    const { adminUsers } = await import("@shared/schema");
    const updates: Record<string, any> = {};
    if (req.body.email) {
      const emailParsed = z.string().email().safeParse(req.body.email);
      if (!emailParsed.success) return res.status(400).json({ message: "Invalid email" });
      updates.email = emailParsed.data;
    }
    if (req.body.name !== undefined) updates.name = req.body.name || null;
    if (req.body.role) {
      if (!["owner", "admin"].includes(req.body.role)) return res.status(400).json({ message: "Invalid role" });
      updates.role = req.body.role;
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No fields to update" });
    try {
      const [row] = await db.update(adminUsers).set(updates).where(eq(adminUsers.id, id)).returning();
      if (!row) return res.status(404).json({ message: "Admin user not found" });
      res.json(row);
    } catch (e: any) {
      if (e.code === "23505") return res.status(409).json({ message: "An admin with this email already exists" });
      throw e;
    }
  });

  app.delete("/api/admin/admin-users/:id", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const { db } = await import("./db");
    const { eq } = await import("drizzle-orm");
    const { adminUsers } = await import("@shared/schema");
    const [deleted] = await db.delete(adminUsers).where(eq(adminUsers.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Admin user not found" });
    res.json({ message: "Admin user deleted" });
  });

  app.post("/api/admin/admin-users/:id/invite", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const { db, pool } = await import("./db");
    const { eq } = await import("drizzle-orm");
    const { adminUsers } = await import("@shared/schema");
    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
    if (!user) return res.status(404).json({ message: "Admin user not found" });

    const crypto = await import("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    await pool.query(
      `UPDATE admin_users SET invite_token = $1, invite_sent_at = NOW(), status = 'invited' WHERE id = $2`,
      [token, id]
    );

    const baseUrl = process.env.REPLIT_DEPLOYMENT === "1"
      ? "https://podrise.com"
      : process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : "https://podrise.com";
    const setupUrl = `${baseUrl}/admin/setup?token=${token}`;

    try {
      const { getUncachableResendClient } = await import("./resendClient");
      const { client, fromEmail } = await getUncachableResendClient();
      await client.emails.send({
        from: `PodRise <${fromEmail}>`,
        to: user.email,
        subject: "You've been invited to PodRise Admin",
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;">
            <div style="text-align:center;margin-bottom:32px;">
              <h1 style="font-size:24px;font-weight:700;color:#18181B;margin:0;">Welcome to PodRise Admin</h1>
            </div>
            <p style="color:#52525B;font-size:15px;line-height:1.6;margin:0 0 16px;">Hi${user.name ? ` ${user.name}` : ''},</p>
            <p style="color:#52525B;font-size:15px;line-height:1.6;margin:0 0 24px;">You've been invited as an <strong>${user.role}</strong> on PodRise. Click the button below to set up your password and activate your admin account.</p>
            <div style="text-align:center;margin:32px 0;">
              <a href="${setupUrl}" style="display:inline-block;padding:14px 32px;background:#6366F1;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">Set Up Your Account</a>
            </div>
            <p style="color:#A1A1AA;font-size:13px;line-height:1.5;margin:24px 0 0;">This link expires in 7 days. If you didn't expect this invitation, you can ignore this email.</p>
          </div>
        `,
      });
      res.json({ message: `Invite sent to ${user.email}` });
    } catch (err: any) {
      console.error("[AdminInvite] Failed to send invite email:", err.message);
      res.json({ message: `Invite link created but email failed to send. Share this link manually: ${setupUrl}` });
    }
  });

  app.get("/api/feature-flags", async (req, res) => {
    const userId = getAuthUserId(req) || (req.session.userId ?? null);
    if (!userId) {
      const flags = await storage.getFeatureFlags();
      const resolved: Record<string, boolean> = {};
      for (const f of flags) resolved[f.key] = f.enabled;
      return res.json({ flags: resolved });
    }
    const resolved = await storage.getResolvedFlagsForUser(userId);
    res.json({ flags: resolved });
  });

  app.get("/api/admin/feature-flags", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const flags = await storage.getFeatureFlags();
    res.json(flags);
  });

  app.post("/api/admin/feature-flags", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { key, description, enabled } = req.body;
      if (!key) return res.status(400).json({ message: "Key is required" });
      const existing = await storage.getFeatureFlagByKey(key);
      if (existing) return res.status(409).json({ message: "Flag with this key already exists" });
      const flag = await storage.createFeatureFlag({ key, description, enabled: enabled ?? false });
      res.json(flag);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to create feature flag" });
    }
  });

  app.patch("/api/admin/feature-flags/:id", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    try {
      const updates: any = {};
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.enabled !== undefined) updates.enabled = req.body.enabled;
      const flag = await storage.updateFeatureFlag(id, updates);
      res.json(flag);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update feature flag" });
    }
  });

  app.delete("/api/admin/feature-flags/:id", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    await storage.deleteFeatureFlag(id);
    res.json({ message: "Flag deleted" });
  });

  app.get("/api/admin/feature-flags/:flagKey/overrides", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const overrides = await storage.getUserFeatureOverrides(req.params.flagKey);
    const enriched = await Promise.all(overrides.map(async (o) => {
      const user = await storage.getUserById(o.userId);
      return { ...o, userEmail: user?.email || "Unknown" };
    }));
    res.json(enriched);
  });

  app.post("/api/admin/feature-flags/:flagKey/overrides", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const { email, enabled } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });
    if (typeof enabled !== "boolean") return res.status(400).json({ message: "Enabled must be a boolean" });
    const flag = await storage.getFeatureFlagByKey(req.params.flagKey);
    if (!flag) return res.status(404).json({ message: "Feature flag not found" });
    const user = await storage.getUserByEmail(email);
    if (!user) return res.status(404).json({ message: "User not found with that email" });
    const override = await storage.setUserFeatureOverride(user.id, req.params.flagKey, enabled);
    res.json({ ...override, userEmail: user.email });
  });

  app.delete("/api/admin/feature-flags/:flagKey/overrides/:userId", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) return res.status(400).json({ message: "Invalid user ID" });
    await storage.deleteUserFeatureOverride(userId, req.params.flagKey);
    res.json({ message: "Override removed" });
  });

  app.post("/api/admin/admin-users/:id/reset-password", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const { db, pool } = await import("./db");
    const { eq } = await import("drizzle-orm");
    const { adminUsers } = await import("@shared/schema");
    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
    if (!user) return res.status(404).json({ message: "Admin user not found" });

    const crypto = await import("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    await pool.query(
      `UPDATE admin_users SET invite_token = $1, invite_sent_at = NOW(), status = 'invited' WHERE id = $2`,
      [token, id]
    );

    const baseUrl = process.env.REPLIT_DEPLOYMENT === "1"
      ? "https://podrise.com"
      : process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : "https://podrise.com";
    const resetUrl = `${baseUrl}/admin/setup?token=${token}`;

    try {
      const { getUncachableResendClient } = await import("./resendClient");
      const { client, fromEmail } = await getUncachableResendClient();
      await client.emails.send({
        from: `PodRise <${fromEmail}>`,
        to: user.email,
        subject: "Reset Your PodRise Admin Password",
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;">
            <div style="text-align:center;margin-bottom:32px;">
              <h1 style="font-size:24px;font-weight:700;color:#18181B;margin:0;">Reset Your Admin Password</h1>
            </div>
            <p style="color:#52525B;font-size:15px;line-height:1.6;margin:0 0 16px;">Hi${user.name ? ` ${user.name}` : ''},</p>
            <p style="color:#52525B;font-size:15px;line-height:1.6;margin:0 0 24px;">A password reset was requested for your PodRise admin account. Click the button below to set a new password.</p>
            <div style="text-align:center;margin:32px 0;">
              <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:#6366F1;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">Reset Password</a>
            </div>
            <p style="color:#A1A1AA;font-size:13px;line-height:1.5;margin:24px 0 0;">This link expires in 7 days. If you didn't request this, you can ignore this email.</p>
          </div>
        `,
      });
      res.json({ message: `Password reset email sent to ${user.email}` });
    } catch (err: any) {
      console.error("[AdminReset] Failed to send reset email:", err.message);
      res.json({ message: `Reset link created but email failed to send. Share this link manually: ${resetUrl}` });
    }
  });

  app.get("/api/admin/setup/verify", async (req, res) => {
    const { token } = req.query;
    if (!token || typeof token !== "string") return res.status(400).json({ message: "Token required" });
    const { pool } = await import("./db");
    const { rows } = await pool.query(
      `SELECT id, email, name, role, invite_sent_at FROM admin_users WHERE invite_token = $1`,
      [token]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Invalid or expired invite link" });
    const user = rows[0];
    const sentAt = new Date(user.invite_sent_at);
    const now = new Date();
    if (now.getTime() - sentAt.getTime() > 7 * 24 * 60 * 60 * 1000) {
      return res.status(410).json({ message: "This invite link has expired. Please ask an admin to resend it." });
    }
    res.json({ email: user.email, name: user.name, role: user.role });
  });

  app.post("/api/admin/setup/complete", async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ message: "Token and password required" });
    if (password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });
    const { pool } = await import("./db");
    const { rows } = await pool.query(
      `SELECT id, email, invite_sent_at FROM admin_users WHERE invite_token = $1`,
      [token]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Invalid or expired invite link" });
    const user = rows[0];
    const sentAt = new Date(user.invite_sent_at);
    const now = new Date();
    if (now.getTime() - sentAt.getTime() > 7 * 24 * 60 * 60 * 1000) {
      return res.status(410).json({ message: "This invite link has expired" });
    }
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `UPDATE admin_users SET password_hash = $1, invite_token = NULL, status = 'active' WHERE id = $2`,
      [hash, user.id]
    );
    req.session.isAdmin = true;
    res.json({ message: "Account set up successfully" });
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

  app.get("/api/admin/error-logs", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const rawSeverity = req.query.severity as string | undefined;
    const severity = rawSeverity && ["error", "warning"].includes(rawSeverity) ? rawSeverity : undefined;
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    if (req.query.startDate) {
      const parsed = new Date(req.query.startDate as string);
      if (!isNaN(parsed.getTime())) startDate = parsed;
    }
    if (req.query.endDate) {
      const parsed = new Date(req.query.endDate as string);
      if (!isNaN(parsed.getTime())) endDate = parsed;
    }
    const [logs, total] = await Promise.all([
      storage.getErrorLogs(limit, offset, severity, startDate, endDate),
      storage.getErrorLogCount(severity, startDate, endDate),
    ]);
    res.json({ logs, total, limit, offset });
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

  app.get("/api/admin/email-clicks/:emailId", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    const emailId = parseInt(req.params.emailId);
    if (isNaN(emailId)) return res.status(400).json({ message: "Invalid email ID" });
    const { rows } = await pool.query(
      `SELECT url, clicked_at FROM email_clicks WHERE email_id = $1 ORDER BY clicked_at DESC`,
      [emailId]
    );
    res.json(rows);
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
    const epMeta = await buildEpisodeMetaFromSummary(pending.summary);
    const { generateEmailSubjectAndPreview } = await import("./emailScheduler");
    const { parseDigestMarkdown } = await import("./emailTemplate");
    const parsedForPreview = parseDigestMarkdown(pending.summary);
    const epCountPreview = parsedForPreview.episodes.length || 1;
    const emailCopyPreview = await generateEmailSubjectAndPreview(pending.summary, epCountPreview);
    const { reorderMarkdownLeadFirst } = await import("./emailScheduler");
    const reorderedPreview = reorderMarkdownLeadFirst(pending.summary, emailCopyPreview.leadEpisodePodcast);
    const freshHtml = markdownToEmailHtml(reorderedPreview, pending.recipientEmail, epMeta, emailCopyPreview);
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
      const epMeta2 = await buildEpisodeMetaFromSummary(pending.summary);
      const { generateEmailSubjectAndPreview } = await import("./emailScheduler");
      const { parseDigestMarkdown } = await import("./emailTemplate");
      const parsedForSendNow = parseDigestMarkdown(pending.summary);
      const episodeCount = parsedForSendNow.episodes.length || 1;
      const emailCopy = await generateEmailSubjectAndPreview(pending.summary, episodeCount);
      const { reorderMarkdownLeadFirst } = await import("./emailScheduler");
      const reorderedSendNow = reorderMarkdownLeadFirst(pending.summary, emailCopy.leadEpisodePodcast);
      const freshSubject = emailCopy.subject;
      const freshHtml = markdownToEmailHtml(reorderedSendNow, pending.recipientEmail, epMeta2, emailCopy);
      const baseUrl = "https://podrise.com";
      const htmlWithClickTracking = wrapLinksWithClickTracking(freshHtml, pending.id);
      const trackingPixel = `<img src="${baseUrl}/api/track/open/${pending.id}" width="1" height="1" style="display:block;width:1px;height:1px;border:0;" alt="" />`;
      const htmlWithTracking = htmlWithClickTracking.replace("</body>", `${trackingPixel}</body>`);

      const { client, fromEmail } = await getUncachableResendClient();
      const sendResult = await client.emails.send({
        from: `PodRise <${fromEmail}>`,
        to: pending.recipientEmail,
        subject: freshSubject,
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
      console.error("[SendNow] Error:", err);
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

  app.post("/api/admin/delete-duplicate-books", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const dupeSlugs = [
        'atomic-habits-an-easy-proven-way-to-build-good-habits-break-bad-ones',
        'the-snowball-warren-buffett-and-the-business-of-life',
        'founders-the-people-who-brought-you-a-nation',
        'the-constitution-of-liberty',
        'meditations-by-marcus-aurelius-marcus-aurelius'
      ];
      const { rows: dupeKeys } = await pool.query(
        `SELECT book_key FROM book_enrichments WHERE slug = ANY($1)`, [dupeSlugs]
      );
      const keys = dupeKeys.map((r: any) => r.book_key);
      if (keys.length > 0) {
        await pool.query(`DELETE FROM book_aliases WHERE canonical_key = ANY($1)`, [keys]);
      }
      const result = await pool.query(
        `DELETE FROM book_enrichments WHERE slug = ANY($1) RETURNING slug, book_title`, [dupeSlugs]
      );
      res.json({ deleted: result.rows, count: result.rowCount });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to delete" });
    }
  });

  app.post("/api/admin/updates/trigger-quote-backfill", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { backfillEpisodeQuotes, getQuoteBackfillProgress } = await import("./emailScheduler");
      const current = getQuoteBackfillProgress();
      if (current.status === "running") {
        return res.status(409).json({ message: "Quote backfill already running", progress: current });
      }
      backfillEpisodeQuotes();
      res.json({ message: "Quote backfill started" });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to start" });
    }
  });

  app.get("/api/admin/updates/quote-backfill-progress", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const { getQuoteBackfillProgress } = await import("./emailScheduler");
    res.json(getQuoteBackfillProgress());
  });

  app.post("/api/admin/backfill-tabloid-headlines", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { backfillTabloidHeadlines, getTabloidBackfillProgress } = await import("./emailScheduler");
      const current = getTabloidBackfillProgress();
      if (current.status === "running") {
        return res.status(409).json({ message: "Tabloid headline backfill already running", progress: current });
      }
      backfillTabloidHeadlines();
      res.json({ message: "Tabloid headline backfill started" });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to start tabloid headline backfill" });
    }
  });

  app.get("/api/admin/tabloid-backfill-progress", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const { getTabloidBackfillProgress } = await import("./emailScheduler");
    res.json(getTabloidBackfillProgress());
  });

  app.post("/api/admin/backfill-episodes", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { runEpisodeBackfill, getBackfillProgress } = await import("./episodeBackfill");
      const current = getBackfillProgress();
      if (current.running) return res.status(409).json({ message: "Episode backfill already running", progress: current });
      const phases = req.body.phases || ["apple", "ai", "quotes"];
      runEpisodeBackfill(phases);
      res.json({ message: "Episode backfill started", phases });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to start episode backfill" });
    }
  });

  app.get("/api/admin/backfill-episodes/progress", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const { getBackfillProgress } = await import("./episodeBackfill");
    res.json(getBackfillProgress());
  });

  app.post("/api/admin/backfill-episodes/stop", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const { stopEpisodeBackfill } = await import("./episodeBackfill");
    stopEpisodeBackfill();
    res.json({ message: "Stop requested" });
  });

  // Backfill missed episodes from Taddy (catches episodes missed due to webhook action=updated bug)
  let missedEpBackfillRunning = false;
  let missedEpBackfillProgress = { total: 0, processed: 0, newEpisodes: 0, failed: 0, currentPodcast: "", stopped: false };

  app.post("/api/admin/backfill-missed-episodes", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    if (missedEpBackfillRunning) return res.status(409).json({ message: "Already running", progress: missedEpBackfillProgress });

    missedEpBackfillRunning = true;
    missedEpBackfillProgress = { total: 0, processed: 0, newEpisodes: 0, failed: 0, currentPodcast: "", stopped: false };
    res.json({ message: "Missed episodes backfill started" });

    (async () => {
      try {
        const { rows: podcasts } = await pool.query(
          `SELECT slug, name, itunes_id, taddy_uuid, hosts, artwork_url FROM podcast_directory WHERE itunes_id IS NOT NULL ORDER BY name`
        );
        missedEpBackfillProgress.total = podcasts.length;
        console.log(`[MissedEpBackfill] Starting for ${podcasts.length} podcasts`);

        const { searchPodcastByItunesId, getRecentEpisodesWithTranscripts, getEpisodeTranscript } = await import("./taddyClient");
        const { generateRecapFromFullTranscript } = await import("./recapGenerator");

        for (const podcast of podcasts) {
          if (missedEpBackfillProgress.stopped) {
            console.log("[MissedEpBackfill] Stopped by admin");
            break;
          }
          missedEpBackfillProgress.currentPodcast = podcast.name;
          missedEpBackfillProgress.processed++;

          try {
            const taddyPodcast = await searchPodcastByItunesId(
              podcast.itunes_id, podcast.name, podcast.taddy_uuid
            );
            if (!taddyPodcast?.uuid) {
              console.log(`[MissedEpBackfill] No Taddy UUID for ${podcast.name}, skipping`);
              continue;
            }

            if (!podcast.taddy_uuid && taddyPodcast.uuid) {
              await pool.query(`UPDATE podcast_directory SET taddy_uuid = $1 WHERE itunes_id = $2`, [taddyPodcast.uuid, podcast.itunes_id]);
            }

            const episodes = await getRecentEpisodesWithTranscripts(taddyPodcast.uuid, 10);
            if (!episodes || episodes.length === 0) continue;

            for (const ep of episodes) {
              if (missedEpBackfillProgress.stopped) break;
              const epTitle = ep.name || "";
              const epSlug = epTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

              const { rows: existing } = await pool.query(
                `SELECT id FROM landing_page_recaps WHERE slug = $1 AND (lower(trim(episode_title)) = lower(trim($2)) OR episode_slug = $3) LIMIT 1`,
                [podcast.slug, epTitle, epSlug]
              );
              if (existing.length > 0) continue;

              const { rows: existingTranscript } = await pool.query(
                `SELECT id FROM episode_transcripts WHERE podcast_id = $1 AND lower(trim(episode_title)) = lower(trim($2)) LIMIT 1`,
                [podcast.itunes_id, epTitle]
              );

              let transcript: string | null = null;
              if (existingTranscript.length > 0) {
                const { rows: tRows } = await pool.query(
                  `SELECT transcript FROM episode_transcripts WHERE id = $1`, [existingTranscript[0].id]
                );
                transcript = tRows[0]?.transcript || null;
              } else {
                transcript = await getEpisodeTranscript(ep.uuid);
                if (transcript) {
                  await pool.query(
                    `INSERT INTO episode_transcripts (podcast_id, episode_guid, episode_title, transcript, date_published, audio_url)
                     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
                    [podcast.itunes_id, ep.uuid, epTitle, transcript,
                     ep.datePublished || null, ep.audioUrl || null]
                  );
                }
              }

              if (!transcript) continue;

              try {
                const recap = await generateRecapFromFullTranscript(
                  transcript, epTitle, podcast.name, podcast.hosts || "", ""
                );
                if (!recap) { missedEpBackfillProgress.failed++; continue; }

                const publishDate = ep.datePublished
                  ? new Date(ep.datePublished * 1000).toISOString().slice(0, 10)
                  : null;

                let tabloidHeadline: string | null = null;
                let tabloidSubHeadline: string | null = null;
                try {
                  const { generateTabloidHeadline } = await import("./emailScheduler");
                  const tabloidResult = await generateTabloidHeadline(
                    epTitle, podcast.name, recap.tldl, recap.whatHappened, recap.keyInsights || []
                  );
                  if (tabloidResult) {
                    tabloidHeadline = tabloidResult.tabloidHeadline;
                    tabloidSubHeadline = tabloidResult.tabloidSubHeadline;
                  }
                } catch {}

                const durationSec = 0;
                const durationStr = durationSec > 0 ? `${Math.floor(durationSec / 60)} min` : null;

                await storage.upsertLandingPageRecap({
                  slug: podcast.slug,
                  itunesId: podcast.itunes_id,
                  podcastName: podcast.name,
                  episodeTitle: epTitle,
                  episodeSlug: epSlug,
                  publishDate,
                  artworkUrl: podcast.artwork_url || "",
                  tldl: recap.tldl,
                  whatHappened: recap.whatHappened,
                  keyInsights: recap.keyInsights,
                  quote: recap.quote,
                  quoteAttribution: recap.quoteAttribution,
                  sponsors: recap.sponsors,
                  guests: recap.guests,
                  resources: recap.resources,
                  keyTopics: recap.keyTopics,
                  hosts: podcast.hosts || "",
                  duration: durationStr,
                  topQuestions: recap.topQuestions,
                  topicContexts: recap.topicContexts,
                  tabloidHeadline,
                  tabloidSubHeadline,
                });

                missedEpBackfillProgress.newEpisodes++;
                console.log(`[MissedEpBackfill] Created recap: ${podcast.name} - "${epTitle.slice(0, 50)}" (${publishDate})`);
              } catch (err: any) {
                missedEpBackfillProgress.failed++;
                console.error(`[MissedEpBackfill] Failed: ${podcast.name} - "${epTitle.slice(0, 50)}": ${err.message}`);
              }
            }
          } catch (err: any) {
            console.error(`[MissedEpBackfill] Error on ${podcast.name}: ${err.message}`);
          }

          await new Promise(r => setTimeout(r, 500));
        }

        console.log(`[MissedEpBackfill] Done: ${missedEpBackfillProgress.newEpisodes} new, ${missedEpBackfillProgress.failed} failed`);
      } catch (err: any) {
        console.error("[MissedEpBackfill] Fatal error:", err.message);
      } finally {
        missedEpBackfillRunning = false;
      }
    })();
  });

  app.get("/api/admin/backfill-missed-episodes/progress", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    res.json({ running: missedEpBackfillRunning, ...missedEpBackfillProgress });
  });

  app.post("/api/admin/backfill-missed-episodes/stop", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    missedEpBackfillProgress.stopped = true;
    res.json({ message: "Stop requested" });
  });

  app.get("/api/admin/episode-data-gaps", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { rows } = await pool.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN apple_episode_url IS NULL OR apple_episode_url = '' THEN 1 ELSE 0 END)::int as missing_apple_url,
          SUM(CASE WHEN audio_url IS NULL OR audio_url = '' THEN 1 ELSE 0 END)::int as missing_audio,
          SUM(CASE WHEN show_notes IS NULL OR show_notes = '' THEN 1 ELSE 0 END)::int as missing_notes,
          SUM(CASE WHEN quote IS NULL OR quote = '' THEN 1 ELSE 0 END)::int as missing_quote,
          SUM(CASE WHEN sponsors IS NULL OR sponsors = '' OR sponsors = '[]' THEN 1 ELSE 0 END)::int as missing_sponsors,
          SUM(CASE WHEN guests IS NULL OR guests = '' OR guests = '[]' THEN 1 ELSE 0 END)::int as missing_guests,
          SUM(CASE WHEN resources IS NULL OR resources = '' OR resources = '[]' THEN 1 ELSE 0 END)::int as missing_resources,
          SUM(CASE WHEN top_questions IS NULL OR top_questions = '' OR top_questions = '[]' THEN 1 ELSE 0 END)::int as missing_questions,
          SUM(CASE WHEN topic_contexts IS NULL OR topic_contexts = '' THEN 1 ELSE 0 END)::int as missing_topic_ctx
        FROM landing_page_recaps
      `);
      const { rows: quotesGap } = await pool.query(`
        SELECT COUNT(DISTINCT r.id)::int as episodes_without_quotes
        FROM landing_page_recaps r
        LEFT JOIN episode_quotes eq ON eq.podcast_slug = r.slug AND eq.episode_slug = r.episode_slug
        WHERE eq.id IS NULL
      `);
      res.json({
        ...rows[0],
        missing_episode_quotes: quotesGap[0]?.episodes_without_quotes || 0,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/all-data-gaps", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const [podcastGaps, personGaps, companyGaps, mentionCounts] = await Promise.all([
        pool.query(`
          SELECT COUNT(*)::int as total,
            SUM(CASE WHEN description IS NULL OR description = '' THEN 1 ELSE 0 END)::int as missing_description,
            SUM(CASE WHEN artwork_url IS NULL OR artwork_url = '' THEN 1 ELSE 0 END)::int as missing_artwork,
            SUM(CASE WHEN category IS NULL OR category = '' THEN 1 ELSE 0 END)::int as missing_category,
            SUM(CASE WHEN hosts IS NULL OR hosts = '' THEN 1 ELSE 0 END)::int as missing_hosts,
            SUM(CASE WHEN about_podcast IS NULL OR about_podcast = '' THEN 1 ELSE 0 END)::int as missing_about,
            SUM(CASE WHEN known_for IS NULL OR array_length(known_for, 1) IS NULL THEN 1 ELSE 0 END)::int as missing_known_for,
            SUM(CASE WHEN host_bios IS NULL THEN 1 ELSE 0 END)::int as missing_host_bios,
            SUM(CASE WHEN related_slugs IS NULL OR array_length(related_slugs, 1) IS NULL THEN 1 ELSE 0 END)::int as missing_related,
            SUM(CASE WHEN twitter_handle IS NULL OR twitter_handle = '' THEN 1 ELSE 0 END)::int as missing_twitter,
            SUM(CASE WHEN website_url IS NULL OR website_url = '' THEN 1 ELSE 0 END)::int as missing_website,
            SUM(CASE WHEN frequency IS NULL OR frequency = '' THEN 1 ELSE 0 END)::int as missing_frequency,
            SUM(CASE WHEN total_episodes IS NULL THEN 1 ELSE 0 END)::int as missing_total_eps,
            SUM(CASE WHEN year_started IS NULL THEN 1 ELSE 0 END)::int as missing_year
          FROM podcast_directory WHERE status = 'published'
        `),
        pool.query(`
          SELECT COUNT(*)::int as total,
            SUM(CASE WHEN bio IS NULL OR bio = '' THEN 1 ELSE 0 END)::int as missing_bio,
            SUM(CASE WHEN photo_url IS NULL OR photo_url = '' THEN 1 ELSE 0 END)::int as missing_photo,
            SUM(CASE WHEN title IS NULL OR title = '' THEN 1 ELSE 0 END)::int as missing_title,
            SUM(CASE WHEN company IS NULL OR company = '' THEN 1 ELSE 0 END)::int as missing_company,
            SUM(CASE WHEN twitter_handle IS NULL OR twitter_handle = '' THEN 1 ELSE 0 END)::int as missing_twitter,
            SUM(CASE WHEN category IS NULL OR category = '' THEN 1 ELSE 0 END)::int as missing_category
          FROM entity_people
        `),
        pool.query(`
          SELECT COUNT(*)::int as total,
            SUM(CASE WHEN description IS NULL OR description = '' THEN 1 ELSE 0 END)::int as missing_description,
            SUM(CASE WHEN logo_url IS NULL OR logo_url = '' THEN 1 ELSE 0 END)::int as missing_logo,
            SUM(CASE WHEN industry IS NULL OR industry = '' THEN 1 ELSE 0 END)::int as missing_industry,
            SUM(CASE WHEN website_url IS NULL OR website_url = '' THEN 1 ELSE 0 END)::int as missing_website,
            SUM(CASE WHEN category IS NULL OR category = '' THEN 1 ELSE 0 END)::int as missing_category
          FROM entity_companies
        `),
        pool.query(`SELECT COUNT(*)::int as total FROM entity_episode_mentions`),
      ]);
      res.json({
        podcasts: podcastGaps.rows[0],
        people: personGaps.rows[0],
        companies: companyGaps.rows[0],
        mentions: { total: mentionCounts.rows[0]?.total || 0 },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/backfill-podcast-metadata", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { startPodcastMetadataBackfill, getPodcastBackfillProgress } = await import("./podcastBackfill");
      const progress = getPodcastBackfillProgress();
      if (progress.running) return res.status(409).json({ message: "Already running", progress });
      startPodcastMetadataBackfill();
      res.json({ message: "Podcast metadata backfill started" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/backfill-podcast-metadata/progress", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const { getPodcastBackfillProgress } = await import("./podcastBackfill");
    res.json(getPodcastBackfillProgress());
  });

  app.post("/api/admin/backfill-podcast-metadata/stop", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const { stopPodcastBackfill } = await import("./podcastBackfill");
    stopPodcastBackfill();
    res.json({ message: "Stop requested" });
  });

  app.post("/api/admin/backfill-entities", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { startEntityBackfill, getEntityBackfillProgress } = await import("./entityBackfill");
      const progress = getEntityBackfillProgress();
      if (progress.running) return res.status(409).json({ message: "Already running", progress });
      startEntityBackfill();
      res.json({ message: "Entity backfill started" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/backfill-entities/progress", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const { getEntityBackfillProgress } = await import("./entityBackfill");
    res.json(getEntityBackfillProgress());
  });

  app.post("/api/admin/backfill-entities/stop", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const { stopEntityBackfill } = await import("./entityBackfill");
    stopEntityBackfill();
    res.json({ message: "Stop requested" });
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

  app.post("/api/admin/backfill-podcast-platform-links", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { backfillPodcastPlatformLinks } = await import("./emailScheduler");
      backfillPodcastPlatformLinks();
      res.json({ message: "Podcast platform links backfill started." });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to trigger backfill" });
    }
  });

  app.post("/api/admin/backfill-podcast-hosts", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { backfillPodcastHosts } = await import("./emailScheduler");
      backfillPodcastHosts();
      res.json({ message: "Podcast hosts backfill started." });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to trigger backfill" });
    }
  });

  app.post("/api/admin/backfill-episode-show-notes-itunes", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { backfillEpisodeShowNotesFromItunes } = await import("./emailScheduler");
      backfillEpisodeShowNotesFromItunes();
      res.json({ message: "Episode show notes backfill from iTunes started." });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to trigger backfill" });
    }
  });

  app.post("/api/admin/backfill-episode-hosts", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { backfillEpisodeHosts } = await import("./emailScheduler");
      backfillEpisodeHosts();
      res.json({ message: "Episode hosts backfill started." });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to trigger backfill" });
    }
  });

  app.post("/api/admin/enrich-people", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { enrichPeopleWithAI } = await import("./emailScheduler");
      enrichPeopleWithAI();
      res.json({ message: "People enrichment started." });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to trigger enrichment" });
    }
  });

  app.post("/api/admin/enrich-companies", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { enrichCompaniesWithAI } = await import("./emailScheduler");
      enrichCompaniesWithAI();
      res.json({ message: "Companies enrichment started." });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to trigger enrichment" });
    }
  });

  app.post("/api/admin/enrich-person/:slug", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { enrichSinglePerson } = await import("./emailScheduler");
      const success = await enrichSinglePerson(req.params.slug);
      if (success) {
        res.json({ message: "Person enriched successfully." });
      } else {
        res.status(404).json({ message: "Person not found or enrichment failed." });
      }
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to enrich person" });
    }
  });

  app.post("/api/admin/enrich-company/:slug", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { enrichSingleCompany } = await import("./emailScheduler");
      const success = await enrichSingleCompany(req.params.slug);
      if (success) {
        res.json({ message: "Company enriched successfully." });
      } else {
        res.status(404).json({ message: "Company not found or enrichment failed." });
      }
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to enrich company" });
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

  app.post("/api/admin/backfill-book-descriptions", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { rows: missingRows } = await pool.query(
        `SELECT id, book_key, book_title FROM book_enrichments WHERE description IS NULL OR TRIM(description) = ''`
      );
      if (missingRows.length === 0) {
        return res.json({ message: "All books have descriptions", updated: 0, remaining: 0 });
      }

      const { rows: recapRows } = await pool.query(
        `SELECT resources FROM landing_page_recaps 
         WHERE resources IS NOT NULL AND resources::text LIKE '%book%'`
      );

      const recapBookMap = new Map<string, { description: string | null; url: string | null; context: string | null }>();
      for (const row of recapRows) {
        let resources: any[];
        try {
          resources = typeof row.resources === "string" ? JSON.parse(row.resources) : row.resources;
          if (!Array.isArray(resources)) continue;
        } catch { continue; }
        for (const r of resources) {
          if (!r || r.type !== "book" || !r.name) continue;
          const key = r.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
          const existing = recapBookMap.get(key);
          if (!existing || (!existing.description && r.description)) {
            recapBookMap.set(key, {
              description: r.description || existing?.description || null,
              url: r.url || existing?.url || null,
              context: r.context || existing?.context || null,
            });
          }
        }
      }

      let updated = 0;
      for (const row of missingRows) {
        const recapData = recapBookMap.get(row.book_key);
        if (recapData && (recapData.description || recapData.context)) {
          await pool.query(
            `UPDATE book_enrichments SET 
               description = COALESCE(NULLIF(TRIM(description), ''), $1),
               amazon_url = COALESCE(NULLIF(TRIM(amazon_url), ''), $2)
             WHERE id = $3 AND (description IS NULL OR TRIM(description) = '')`,
            [recapData.description || recapData.context, recapData.url, row.id]
          );
          updated++;
        }
      }

      const remaining = missingRows.length - updated;
      console.log(`[BackfillDesc] Updated ${updated} books from recaps, ${remaining} still missing descriptions`);

      if (remaining > 0) {
        const { enrichAllBooks } = await import("./enrichBooks");
        enrichAllBooks().then(result => {
          console.log(`[BackfillDesc] AI enrichment: ${result.processed} processed, ${result.errors} errors`);
        });
      }

      res.json({ message: "Book description backfill started", updatedFromRecaps: updated, remainingForAI: remaining });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to backfill descriptions" });
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

  app.get("/api/admin/bookstore", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM book_enrichments WHERE slug IS NOT NULL ORDER BY book_title ASC`
      );
      res.json({ books: rows });
    } catch (err: any) {
      console.error("[Bookstore] Error:", err);
      res.status(500).json({ message: err?.message || "Failed to load books" });
    }
  });

  app.post("/api/admin/bookstore/enrich", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const rawId = req.body?.id;
      const id = typeof rawId === 'string' ? parseInt(rawId, 10) : rawId;
      if (!id || typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
        return res.status(400).json({ message: "Valid integer id required" });
      }

      const { rows } = await pool.query(`SELECT * FROM book_enrichments WHERE id = $1`, [id]);
      if (!rows.length) return res.status(404).json({ message: "Book not found" });
      const book = rows[0];

      const updates: Record<string, any> = {};
      let gbSuccess = false;
      let olSuccess = false;

      let googleBooksId = book.google_books_id;
      if (!googleBooksId) {
        try {
          const q = encodeURIComponent(book.book_title + (book.author ? `+inauthor:${book.author}` : ""));
          const gbRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`);
          if (gbRes.ok) {
            const gbData = await gbRes.json();
            if (gbData.items?.[0]?.id) {
              googleBooksId = gbData.items[0].id;
              updates.google_books_id = googleBooksId;
            }
          }
        } catch {}
      }

      if (googleBooksId) {
        try {
          const gbRes = await fetch(`https://www.googleapis.com/books/v1/volumes/${googleBooksId}`);
          if (gbRes.ok) {
            const gb = await gbRes.json();
            const vi = gb.volumeInfo || {};
            const si = gb.saleInfo || {};
            const ai = gb.accessInfo || {};
            if (vi.subtitle) updates.subtitle = vi.subtitle;
            if (vi.publisher) updates.publisher = vi.publisher;
            if (vi.publishedDate) updates.published_date = vi.publishedDate;
            if (vi.pageCount && !book.page_count) updates.page_count = vi.pageCount;
            if (vi.description) updates.google_description = vi.description;
            if (vi.language) updates.language = vi.language;
            if (vi.categories) updates.categories = vi.categories;
            if (vi.maturityRating) updates.maturity_rating = vi.maturityRating;
            if (vi.printType) updates.print_type = vi.printType;
            if (vi.previewLink) updates.google_preview_link = vi.previewLink;
            if (vi.infoLink) updates.google_info_link = vi.infoLink;
            if (vi.industryIdentifiers) {
              for (const ii of vi.industryIdentifiers) {
                if (ii.type === "ISBN_10") updates.isbn_10 = ii.identifier;
                if (ii.type === "ISBN_13") {
                  updates.isbn_13 = ii.identifier;
                  if (!book.isbn) updates.isbn = ii.identifier;
                }
              }
            }
            if (vi.publishedDate && !book.publish_year) {
              const year = parseInt(vi.publishedDate);
              if (year > 1000) updates.publish_year = year;
            }
            if (vi.authors?.length && !book.author) {
              updates.author = vi.authors.join(", ");
            }
            if (vi.printedPageCount) updates.printed_page_count = vi.printedPageCount;
            if (vi.dimensions) updates.dimensions = typeof vi.dimensions === 'object' ? Object.entries(vi.dimensions).map(([k,v]) => `${k}: ${v}`).join(', ') : String(vi.dimensions);
            if (vi.canonicalVolumeLink) updates.canonical_volume_link = vi.canonicalVolumeLink;
            if (vi.contentVersion) updates.content_version = vi.contentVersion;
            if (vi.imageLinks) updates.gb_image_links = vi.imageLinks;
            if (vi.readingModes) updates.gb_reading_modes = vi.readingModes;
            if (si.saleability) updates.gb_saleability = si.saleability;
            if (si.isEbook !== undefined) updates.gb_is_ebook = si.isEbook;
            if (si.listPrice?.amount !== undefined && si.listPrice?.amount !== null) { updates.gb_list_price = si.listPrice.amount; updates.gb_price_currency = si.listPrice.currencyCode; }
            if (si.retailPrice?.amount !== undefined && si.retailPrice?.amount !== null) updates.gb_retail_price = si.retailPrice.amount;
            if (si.buyLink) updates.gb_buy_link = si.buyLink;
            if (ai.viewability) updates.gb_viewability = ai.viewability;
            if (ai.embeddable !== undefined) updates.gb_embeddable = ai.embeddable;
            if (ai.publicDomain !== undefined) updates.gb_public_domain = ai.publicDomain;
            if (ai.textToSpeechPermission) updates.gb_text_to_speech = ai.textToSpeechPermission;
            if (ai.epub?.isAvailable !== undefined) updates.gb_epub_available = ai.epub.isAvailable;
            if (ai.pdf?.isAvailable !== undefined) updates.gb_pdf_available = ai.pdf.isAvailable;
            if (ai.webReaderLink) updates.gb_web_reader_link = ai.webReaderLink;
            gbSuccess = true;
          }
        } catch (e) {
          console.warn("[Bookstore] Google Books fetch failed:", e);
        }
      }

      try {
        const q = encodeURIComponent(book.book_title + (book.author ? ` ${book.author}` : ""));
        const olRes = await fetch(`https://openlibrary.org/search.json?q=${q}&limit=5&fields=key,title,author_name,isbn,publisher,publish_date,number_of_pages_median,first_publish_year,subject,language,edition_count,ebook_count_i,cover_i,ratings_average,ratings_count,want_to_read_count,currently_reading_count,already_read_count,first_sentence,subtitle,id_amazon,id_goodreads,has_fulltext,lcc,ddc,contributor,person,place,time`);
        if (olRes.ok) {
          const olData = await olRes.json();
          const titleLower = book.book_title.toLowerCase().replace(/[^a-z0-9]/g, '');
          const doc = (olData.docs || []).find((d: any) => {
            const docTitle = (d.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            return docTitle === titleLower;
          }) || (olData.docs || []).find((d: any) => {
            const docTitle = (d.title || '').toLowerCase();
            return docTitle.includes(book.book_title.toLowerCase()) || book.book_title.toLowerCase().includes(docTitle);
          }) || olData.docs?.[0];

          if (doc) {
            if (doc.key) updates.ol_work_key = doc.key;
            if (doc.subject?.length) updates.ol_subjects = doc.subject;
            if (doc.language?.length) updates.ol_languages = doc.language;
            if (doc.edition_count) updates.ol_edition_count = doc.edition_count;
            if (doc.ebook_count_i !== undefined) updates.ol_ebook_count = doc.ebook_count_i;
            if (doc.cover_i) updates.ol_cover_id = doc.cover_i;
            if (doc.ratings_average) updates.ol_ratings_average = doc.ratings_average;
            if (doc.ratings_count) updates.ol_ratings_count = doc.ratings_count;
            if (doc.want_to_read_count !== undefined) updates.ol_want_to_read = doc.want_to_read_count;
            if (doc.currently_reading_count !== undefined) updates.ol_currently_reading = doc.currently_reading_count;
            if (doc.already_read_count !== undefined) updates.ol_already_read = doc.already_read_count;
            if (doc.first_publish_year && !book.publish_year && !updates.publish_year) updates.publish_year = doc.first_publish_year;
            if (doc.first_publish_year) updates.ol_first_publish_year = doc.first_publish_year;
            if (doc.publisher?.length) updates.ol_publishers = doc.publisher;
            if (doc.number_of_pages_median) {
              updates.ol_number_of_pages = doc.number_of_pages_median;
              if (!book.page_count && !updates.page_count) updates.page_count = doc.number_of_pages_median;
            }
            if (doc.first_sentence?.length) updates.ol_first_sentence = typeof doc.first_sentence === 'string' ? doc.first_sentence : doc.first_sentence[0];
            if (doc.subtitle) updates.ol_subtitle = doc.subtitle;
            if (doc.subtitle && !updates.subtitle) updates.subtitle = doc.subtitle;
            if (doc.author_name?.length) updates.ol_author_names = doc.author_name;
            if (doc.id_amazon?.length) updates.ol_id_amazon = doc.id_amazon;
            if (doc.id_goodreads?.length) updates.ol_id_goodreads = doc.id_goodreads;
            if (doc.has_fulltext !== undefined) updates.ol_has_fulltext = doc.has_fulltext;
            if (doc.isbn?.length) updates.ol_all_isbns = doc.isbn;
            if (doc.publish_date?.length) updates.ol_publish_dates = doc.publish_date;

            if (!book.isbn && !updates.isbn && doc.isbn?.length) {
              const isbn13 = doc.isbn.find((i: string) => i.length === 13);
              const isbn10 = doc.isbn.find((i: string) => i.length === 10);
              if (isbn13) { updates.isbn = isbn13; updates.isbn_13 = isbn13; }
              if (isbn10 && !updates.isbn_10) updates.isbn_10 = isbn10;
              if (!updates.isbn && isbn10) updates.isbn = isbn10;
            }

            if (doc.ratings_average && (!book.rating || book.rating === null)) {
              updates.rating = doc.ratings_average;
            }
            if (doc.ratings_count && (!book.rating_count || book.rating_count === null)) {
              updates.rating_count = doc.ratings_count;
            }
            olSuccess = true;
          }
        }
      } catch (e) {
        console.warn("[Bookstore] Open Library fetch failed:", e);
      }

      updates.last_api_fetch = new Date();

      const setClauses: string[] = [];
      const vals: any[] = [];
      let paramIdx = 1;
      for (const [key, val] of Object.entries(updates)) {
        setClauses.push(`${key} = $${paramIdx}`);
        vals.push(val);
        paramIdx++;
      }
      vals.push(id);

      if (setClauses.length > 0) {
        await pool.query(
          `UPDATE book_enrichments SET ${setClauses.join(", ")}, updated_at = NOW() WHERE id = $${paramIdx}`,
          vals
        );
      }

      const { rows: updated } = await pool.query(`SELECT * FROM book_enrichments WHERE id = $1`, [id]);
      const fieldsUpdated = Object.keys(updates).filter(k => k !== 'last_api_fetch').length;
      res.json({ book: updated[0], fieldsUpdated, apiStatus: { googleBooks: gbSuccess, openLibrary: olSuccess } });
    } catch (err: any) {
      console.error("[Bookstore] Enrich error:", err);
      res.status(500).json({ message: err?.message || "Failed to enrich book" });
    }
  });

  app.get("/api/admin/book-covers", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const filter = req.query.filter as string || "all";
      const fs = await import("fs");
      const path = await import("path");
      const coversDir = path.default.resolve("public/books");

      const sort = req.query.sort as string || "title";
      const page = parseInt(req.query.page as string || "1", 10);
      const pageSize = parseInt(req.query.pageSize as string || "25", 10);
      let query = "SELECT id, book_key, book_title, author, slug, google_books_id, isbn, has_cover, cover_approved, asin, amazon_url, rejection_reason, cover_quality_score, needs_replacement, replacement_note, cover_source, cover_tried_sources, rating_count, ol_ratings_count FROM book_enrichments WHERE slug IS NOT NULL";
      if (filter === "needs_review") query += " AND cover_approved IS NOT TRUE AND NOT (cover_approved = false AND has_cover = false AND rejection_reason = 'no_images')";
      else if (filter === "no_images") query += " AND cover_approved = false AND has_cover = false AND rejection_reason = 'no_images'";
      else if (filter === "pending") query += " AND (cover_approved IS NULL)";
      else if (filter === "approved") query += " AND cover_approved = true";
      else if (filter === "rejected") query += " AND cover_approved = false";
      else if (filter === "replace") query += " AND needs_replacement = true";
      else if (filter === "nocover") query += " AND (has_cover IS NULL OR has_cover = false)";
      if (sort === "popularity") query += " ORDER BY (COALESCE(rating_count, 0) + COALESCE(ol_ratings_count, 0)) DESC, book_title ASC";
      else if (sort === "quality") query += " ORDER BY cover_quality_score DESC NULLS LAST, book_title ASC";
      else query += " ORDER BY book_title ASC";

      const { rows } = await pool.query(query);

      const books = rows.map((r: any) => {
        const filePath = path.default.join(coversDir, `${r.slug}.jpg`);
        const hasFile = fs.default.existsSync(filePath);
        const amazonUrl = r.amazon_url || (r.asin ? `https://www.amazon.com/dp/${r.asin}` : null);
        return {
          id: r.id,
          title: r.book_title,
          author: r.author,
          slug: r.slug,
          googleBooksId: r.google_books_id,
          isbn: r.isbn,
          hasCover: r.has_cover,
          coverApproved: r.cover_approved,
          hasFile,
          amazonUrl,
          rejectionReason: r.rejection_reason,
          qualityScore: r.cover_quality_score,
          needsReplacement: r.needs_replacement || false,
          replacementNote: r.replacement_note,
          coverSource: r.cover_source || null,
          triedSources: r.cover_tried_sources || [],
          ratingCount: r.rating_count || 0,
          olRatingsCount: r.ol_ratings_count || 0,
        };
      });

      const allRows = await pool.query("SELECT cover_approved, needs_replacement, has_cover, rejection_reason FROM book_enrichments WHERE slug IS NOT NULL");
      const stats = {
        total: allRows.rows.length,
        approved: allRows.rows.filter((r: any) => r.cover_approved === true).length,
        needsReview: allRows.rows.filter((r: any) => r.cover_approved !== true && !(r.cover_approved === false && r.has_cover === false && r.rejection_reason === 'no_images')).length,
        noImages: allRows.rows.filter((r: any) => r.cover_approved === false && r.has_cover === false && r.rejection_reason === 'no_images').length,
        rejected: allRows.rows.filter((r: any) => r.cover_approved === false).length,
        pending: allRows.rows.filter((r: any) => r.cover_approved === null).length,
        needsReplacement: allRows.rows.filter((r: any) => r.needs_replacement === true).length,
        noCover: allRows.rows.filter((r: any) => !r.has_cover && r.has_cover !== true).length,
      };

      const offset = (page - 1) * pageSize;
      const paginatedBooks = books.slice(offset, offset + pageSize);
      const totalPages = Math.ceil(books.length / pageSize);

      res.json({ books: paginatedBooks, stats, totalFiltered: books.length, page, pageSize, totalPages });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to load book covers" });
    }
  });

  app.post("/api/admin/book-covers/approve", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids array required" });
      }
      await pool.query(
        "UPDATE book_enrichments SET cover_approved = true, needs_replacement = false, updated_at = NOW() WHERE id = ANY($1::int[])",
        [ids]
      );
      res.json({ message: `Approved ${ids.length} covers` });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to approve covers" });
    }
  });

  app.post("/api/admin/book-covers/reject", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { ids, reason } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids array required" });
      }
      const fs = await import("fs");
      const path = await import("path");
      const coversDir = path.default.resolve("public/books");

      const { rows } = await pool.query(
        "SELECT id, slug FROM book_enrichments WHERE id = ANY($1::int[])",
        [ids]
      );
      for (const row of rows) {
        const filePath = path.default.join(coversDir, `${row.slug}.jpg`);
        if (fs.default.existsSync(filePath)) {
          fs.default.unlinkSync(filePath);
        }
      }

      await pool.query(
        "UPDATE book_enrichments SET cover_approved = false, has_cover = false, rejection_reason = $2, updated_at = NOW() WHERE id = ANY($1::int[])",
        [ids, reason || null]
      );
      res.json({ message: `Rejected ${ids.length} covers, files removed` });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to reject covers" });
    }
  });

  app.post("/api/admin/book-covers/flag-replace", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { ids, note } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids array required" });
      }
      await pool.query(
        "UPDATE book_enrichments SET needs_replacement = true, replacement_note = $2, updated_at = NOW() WHERE id = ANY($1::int[])",
        [ids, note || null]
      );
      res.json({ message: `Flagged ${ids.length} covers for replacement` });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to flag covers" });
    }
  });

  app.post("/api/admin/book-covers/retry-rejected", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { spawn } = await import("child_process");
      const mode = (req.body?.mode as string) || "rejected";
      const validModes = ["rejected", "nocover", "pending"];
      if (!validModes.includes(mode)) {
        return res.status(400).json({ message: "Invalid mode" });
      }

      const child = spawn("npx", ["tsx", "server/downloadBookCoversRetry.ts", mode], {
        cwd: process.cwd(),
        env: process.env as any,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      child.stdout.on("data", (d: Buffer) => { output += d.toString(); });
      child.stderr.on("data", (d: Buffer) => { output += d.toString(); });

      child.on("close", (code: number) => {
        console.log(`[BookCovers] Retry script (${mode}) finished with code ${code}`);
        console.log(output);
      });

      res.json({ message: `Cover retry started in background (mode: ${mode})`, pid: child.pid });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to start retry" });
    }
  });

  app.post("/api/admin/book-covers/fetch-candidates", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { id } = req.body;
      if (!id) return res.status(400).json({ message: "id required" });

      const { rows } = await pool.query(
        `SELECT id, slug, google_books_id, isbn, asin, book_title, author FROM book_enrichments WHERE id = $1`,
        [id]
      );
      if (!rows.length) return res.status(404).json({ message: "Book not found" });
      const book = rows[0];

      const fsMod = await import("fs");
      const pathMod = await import("path");
      const candidatesDir = pathMod.default.resolve("public/books/candidates");
      if (!fsMod.default.existsSync(candidatesDir)) {
        fsMod.default.mkdirSync(candidatesDir, { recursive: true });
      }

      const MIN_WIDTH = 200;

      function isPlaceholder(buf: Buffer): boolean {
        if (buf.length < 1000) return true;
        const isPng = buf[0] === 0x89 && buf[1] === 0x50;
        if (isPng && (buf.length === 15567 || buf.length === 1269)) return true;
        return false;
      }
      function isPureColorImage(buf: Buffer): boolean {
        const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
        const isPngFmt = buf[0] === 0x89 && buf[1] === 0x50;
        if (!isJpeg && !isPngFmt) return false;
        const sampleStart = Math.min(isJpeg ? 200 : 50, buf.length - 100);
        const sampleEnd = Math.min(sampleStart + 500, buf.length);
        if (sampleEnd - sampleStart < 50) return false;
        let allSame = true;
        const firstByte = buf[sampleStart];
        for (let i = sampleStart + 1; i < sampleEnd; i++) {
          if (buf[i] !== firstByte) { allSame = false; break; }
        }
        if (allSame && (firstByte === 0xff || firstByte === 0x00)) return true;
        let whiteCount = 0;
        let blackCount = 0;
        for (let i = sampleStart; i < sampleEnd; i++) {
          if (buf[i] >= 0xfe) whiteCount++;
          if (buf[i] <= 0x01) blackCount++;
        }
        const total = sampleEnd - sampleStart;
        if (whiteCount / total > 0.95 || blackCount / total > 0.95) return true;
        return false;
      }
      function jpegDimensions(buf: Buffer): { w: number; h: number } {
        let i = 2;
        while (i < buf.length - 8) {
          if (buf[i] !== 0xff) return { w: 0, h: 0 };
          const marker = buf[i + 1];
          if (marker === 0xc0 || marker === 0xc2) {
            return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
          }
          const len = buf.readUInt16BE(i + 2);
          i += 2 + len;
        }
        return { w: 0, h: 0 };
      }
      function pngDimensions(buf: Buffer): { w: number; h: number } {
        if (buf.length < 24) return { w: 0, h: 0 };
        return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
      }
      function getDimensions(buf: Buffer): { w: number; h: number } {
        if (buf[0] === 0xff && buf[1] === 0xd8) return jpegDimensions(buf);
        if (buf[0] === 0x89 && buf[1] === 0x50) return pngDimensions(buf);
        return { w: 0, h: 0 };
      }
      function looksLikeDocument(buf: Buffer): boolean {
        const { w, h } = getDimensions(buf);
        if (w === 0 || h === 0) return false;
        const ratio = w / h;
        if (ratio > 0.75) return true;
        if (ratio < 0.45) return true;
        if (h > w * 2) return true;
        return false;
      }

      type CandidateResult = { source: string; width: number; height: number; size: number; filename: string; url: string } | null;

      async function tryGoogleBooks(googleBooksId: string, slug: string): Promise<CandidateResult> {
        for (const zoom of [3, 2, 1]) {
          const url = `https://books.google.com/books/content?id=${googleBooksId}&printsec=frontcover&img=1&zoom=${zoom}&source=gbs_api`;
          try {
            const r = await fetch(url);
            if (!r.ok) continue;
            const buf = Buffer.from(await r.arrayBuffer());
            if (isPlaceholder(buf)) continue;
            if (isPureColorImage(buf)) continue;
            if (looksLikeDocument(buf)) continue;
            const { w, h } = getDimensions(buf);
            if (w >= MIN_WIDTH || (zoom === 1 && w > 0)) {
              const filename = `${slug}_google_books.jpg`;
              fsMod.default.writeFileSync(pathMod.default.join(candidatesDir, filename), buf);
              return { source: "google_books", width: w, height: h, size: buf.length, filename, url: `/books/candidates/${filename}` };
            }
          } catch {}
        }
        return null;
      }

      async function tryOpenLibrary(isbn: string, slug: string): Promise<CandidateResult> {
        const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
        try {
          const r = await fetch(url);
          if (!r.ok) return null;
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length < 1000) return null;
          if (isPureColorImage(buf)) return null;
          if (looksLikeDocument(buf)) return null;
          const { w, h } = getDimensions(buf);
          const filename = `${slug}_openlibrary.jpg`;
          fsMod.default.writeFileSync(pathMod.default.join(candidatesDir, filename), buf);
          return { source: "openlibrary", width: w, height: h, size: buf.length, filename, url: `/books/candidates/${filename}` };
        } catch { return null; }
      }

      async function tryAmazon(isbn: string, slug: string): Promise<CandidateResult> {
        const urls = [
          `https://images-na.ssl-images-amazon.com/images/P/${isbn}.01._SCLZZZZZZZ_.jpg`,
          `https://images.amazon.com/images/P/${isbn}.01.LZZZZZZZ.jpg`,
        ];
        for (const u of urls) {
          try {
            const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" } });
            if (!r.ok) continue;
            const buf = Buffer.from(await r.arrayBuffer());
            if (isPlaceholder(buf)) continue;
            if (buf.length < 2000) continue;
            if (isPureColorImage(buf)) continue;
            if (looksLikeDocument(buf)) continue;
            const { w, h } = getDimensions(buf);
            if (w > 0) {
              const filename = `${slug}_amazon.jpg`;
              fsMod.default.writeFileSync(pathMod.default.join(candidatesDir, filename), buf);
              return { source: "amazon_isbn", width: w, height: h, size: buf.length, filename, url: `/books/candidates/${filename}` };
            }
          } catch {}
        }
        return null;
      }

      async function tryOpenLibrarySearch(title: string, author: string | null, slug: string): Promise<CandidateResult> {
        const q = encodeURIComponent(title + (author ? ` ${author}` : ""));
        try {
          const searchRes = await fetch(`https://openlibrary.org/search.json?q=${q}&limit=3`);
          if (!searchRes.ok) return null;
          const data = await searchRes.json();
          const docs = data.docs || [];
          for (const doc of docs) {
            if (doc.cover_i) {
              const coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg?default=false`;
              const r = await fetch(coverUrl);
              if (!r.ok) continue;
              const buf = Buffer.from(await r.arrayBuffer());
              if (buf.length < 1000) continue;
              if (isPureColorImage(buf)) continue;
              if (looksLikeDocument(buf)) continue;
              const { w, h } = getDimensions(buf);
              if (w >= MIN_WIDTH || w > 0) {
                const filename = `${slug}_ol_search.jpg`;
                fsMod.default.writeFileSync(pathMod.default.join(candidatesDir, filename), buf);
                return { source: "openlibrary_search", width: w, height: h, size: buf.length, filename, url: `/books/candidates/${filename}` };
              }
            }
          }
        } catch {}
        return null;
      }

      let isbn = book.isbn;
      if (!isbn) {
        try {
          const q = encodeURIComponent(book.book_title + (book.author ? ` ${book.author}` : ""));
          const olRes = await fetch(`https://openlibrary.org/search.json?q=${q}&limit=3&fields=key,title,isbn`);
          if (olRes.ok) {
            const olData = await olRes.json();
            for (const doc of (olData.docs || [])) {
              const isbns = [...(doc.isbn || [])];
              const isbn13 = isbns.find((i: string) => i.length === 13);
              const isbn10 = isbns.find((i: string) => i.length === 10);
              if (isbn13 || isbn10) {
                isbn = isbn13 || isbn10;
                await pool.query(`UPDATE book_enrichments SET isbn = $1 WHERE id = $2 AND isbn IS NULL`, [isbn, book.id]);
                console.log(`[BookCovers] Auto-enriched ISBN for "${book.book_title}": ${isbn}`);
                break;
              }
            }
          }
        } catch (e) {
          console.warn(`[BookCovers] ISBN enrichment failed for "${book.book_title}":`, e);
        }
      }

      let googleBooksId = book.google_books_id;
      if (!googleBooksId) {
        try {
          const q = encodeURIComponent(book.book_title + (book.author ? `+inauthor:${book.author}` : ""));
          const gbRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`);
          if (gbRes.ok) {
            const gbData = await gbRes.json();
            if (gbData.items?.[0]?.id) {
              googleBooksId = gbData.items[0].id;
              await pool.query(`UPDATE book_enrichments SET google_books_id = $1 WHERE id = $2 AND google_books_id IS NULL`, [googleBooksId, book.id]);
              console.log(`[BookCovers] Auto-enriched Google Books ID for "${book.book_title}": ${googleBooksId}`);
            }
          }
        } catch (e) {
          console.warn(`[BookCovers] Google Books ID enrichment failed for "${book.book_title}":`, e);
        }
      }

      const promises: Promise<CandidateResult>[] = [];
      if (googleBooksId) promises.push(tryGoogleBooks(googleBooksId, book.slug));
      else promises.push(Promise.resolve(null));
      if (isbn) promises.push(tryOpenLibrary(isbn, book.slug));
      else promises.push(Promise.resolve(null));
      if (isbn) promises.push(tryAmazon(isbn, book.slug));
      else promises.push(Promise.resolve(null));
      promises.push(tryOpenLibrarySearch(book.book_title, book.author, book.slug));

      const results = await Promise.all(promises);
      const candidates = results.filter((r): r is NonNullable<CandidateResult> => r !== null);

      if (candidates.length === 0) {
        const fsMod2 = await import("fs");
        const pathMod2 = await import("path");
        const existingCover = pathMod2.default.join(pathMod2.default.resolve("public/books"), `${book.slug}.jpg`);
        const hasExistingFile = fsMod2.default.existsSync(existingCover);
        if (!hasExistingFile) {
          await pool.query(
            "UPDATE book_enrichments SET cover_approved = false, has_cover = false, rejection_reason = 'no_images', updated_at = NOW() WHERE id = $1",
            [book.id]
          );
        }
      }

      res.json({ candidates, bookId: book.id, slug: book.slug, title: book.book_title, isbnEnriched: isbn && !book.isbn ? isbn : null });
    } catch (err: any) {
      console.error("[BookCovers] Fetch candidates error:", err);
      res.status(500).json({ message: err?.message || "Failed to fetch candidates" });
    }
  });

  app.post("/api/admin/book-covers/select-candidate", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { id, source, filename } = req.body;
      if (!id || !source || !filename) return res.status(400).json({ message: "id, source, filename required" });

      const validSources = ["google_books", "openlibrary", "amazon_isbn", "openlibrary_search"];
      if (!validSources.includes(source)) return res.status(400).json({ message: "Invalid source" });

      const { rows } = await pool.query(
        `SELECT id, slug, cover_tried_sources FROM book_enrichments WHERE id = $1`,
        [id]
      );
      if (!rows.length) return res.status(404).json({ message: "Book not found" });
      const book = rows[0];

      const suffixMap: Record<string, string> = {
        google_books: "google_books", openlibrary: "openlibrary",
        amazon_isbn: "amazon", openlibrary_search: "ol_search",
      };
      const expectedFilename = `${book.slug}_${suffixMap[source]}.jpg`;
      if (filename !== expectedFilename) {
        return res.status(400).json({ message: "Filename does not match expected pattern" });
      }

      const fsMod = await import("fs");
      const pathMod = await import("path");
      const candidatesDir = pathMod.default.resolve("public/books/candidates");
      const coversDir = pathMod.default.resolve("public/books");

      const srcPath = pathMod.default.join(candidatesDir, expectedFilename);
      const destPath = pathMod.default.join(coversDir, `${book.slug}.jpg`);

      if (!fsMod.default.existsSync(srcPath)) {
        return res.status(404).json({ message: "Candidate file not found" });
      }

      fsMod.default.copyFileSync(srcPath, destPath);

      const triedSources = book.cover_tried_sources || [];
      const newTried = [...new Set([...triedSources, source])];

      await pool.query(
        `UPDATE book_enrichments 
         SET has_cover = true, cover_approved = true, cover_source = $1, 
             cover_tried_sources = $2, cover_quality_score = NULL,
             needs_replacement = false, replacement_note = NULL
         WHERE id = $3`,
        [source, newTried, id]
      );

      const candidateFiles = fsMod.default.readdirSync(candidatesDir).filter(f => f.startsWith(`${book.slug}_`));
      for (const f of candidateFiles) {
        try { fsMod.default.unlinkSync(pathMod.default.join(candidatesDir, f)); } catch {}
      }

      res.json({ message: "Cover selected and approved", source });
    } catch (err: any) {
      console.error("[BookCovers] Select candidate error:", err);
      res.status(500).json({ message: err?.message || "Failed to select candidate" });
    }
  });

  app.post("/api/admin/book-covers/soft-reject", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { id } = req.body;
      if (!id) return res.status(400).json({ message: "id required" });

      await pool.query(
        "UPDATE book_enrichments SET cover_approved = false, has_cover = false, rejection_reason = 'no_images', updated_at = NOW() WHERE id = $1",
        [id]
      );
      res.json({ message: "Moved to No Images" });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to soft-reject" });
    }
  });

  app.post("/api/admin/book-covers/unapprove", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids array required" });
      }
      const fsMod = await import("fs");
      const pathMod = await import("path");
      const coversDir = pathMod.default.resolve("public/books");

      const { rows: bookRows } = await pool.query(
        "SELECT id, slug FROM book_enrichments WHERE id = ANY($1::int[])",
        [ids]
      );

      for (const row of bookRows) {
        const filePath = pathMod.default.join(coversDir, `${row.slug}.jpg`);
        const fileExists = fsMod.default.existsSync(filePath);
        await pool.query(
          "UPDATE book_enrichments SET cover_approved = NULL, rejection_reason = NULL, has_cover = $1, updated_at = NOW() WHERE id = $2",
          [fileExists, row.id]
        );
      }

      res.json({ message: `Sent ${ids.length} cover(s) back to review` });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to unapprove covers" });
    }
  });

  app.post("/api/admin/book-covers/remove-not-book", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids array required" });
      }
      const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(",");
      const { rows: books } = await pool.query(
        `SELECT id, book_key, book_title, slug FROM book_enrichments WHERE id IN (${placeholders})`,
        ids
      );

      let blocklisted = 0;
      let deleted = 0;
      for (const book of books) {
        await pool.query(
          `INSERT INTO book_blocklist (book_key, book_title, reason) VALUES ($1, $2, 'not_a_book') ON CONFLICT (book_key) DO NOTHING`,
          [book.book_key, book.book_title]
        );
        blocklisted++;

        if (book.slug) {
          const filePath = (await import("path")).default.join((await import("path")).default.resolve("public/books"), `${book.slug}.jpg`);
          const fsMod = await import("fs");
          if (fsMod.default.existsSync(filePath)) {
            fsMod.default.unlinkSync(filePath);
          }
        }

        await pool.query(`DELETE FROM book_aliases WHERE canonical_key = $1 OR alias_key = $1`, [book.book_key]);
        await pool.query(`DELETE FROM book_enrichments WHERE id = $1`, [book.id]);
        deleted++;
      }

      res.json({ message: `Removed ${deleted} non-book entries, ${blocklisted} added to blocklist` });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to remove entries" });
    }
  });

  app.post("/api/admin/regenerate-single-recap", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const { podcastSlug, episodeSlug } = req.body;
    if (!podcastSlug || !episodeSlug) {
      return res.status(400).json({ message: "podcastSlug and episodeSlug required" });
    }
    try {
      const { rows: recapRows } = await pool.query(
        `SELECT lpr.id, lpr.episode_title, pd.itunes_id FROM landing_page_recaps lpr JOIN podcast_directory pd ON pd.slug = lpr.slug WHERE lpr.slug = $1 AND lpr.episode_slug = $2`,
        [podcastSlug, episodeSlug]
      );
      if (recapRows.length === 0) return res.status(404).json({ message: "Recap not found" });
      const { episode_title, itunes_id } = recapRows[0];

      const { rows: transcriptRows } = await pool.query(
        `SELECT transcript FROM episode_transcripts WHERE podcast_id = $1 AND episode_title = $2 LIMIT 1`,
        [String(itunes_id), episode_title]
      );
      if (transcriptRows.length === 0) return res.status(404).json({ message: "Transcript not found" });

      const { processFullTranscript } = await import("./transcriptChunker");
      const processedTranscript = processFullTranscript(transcriptRows[0].transcript);

      const { rows: pdRows } = await pool.query(`SELECT name FROM podcast_directory WHERE slug = $1`, [podcastSlug]);
      const podcastName = pdRows[0]?.name || podcastSlug;

      const { generateRecapFromTranscript } = await import("./recapGenerator");
      const recap = await generateRecapFromTranscript(processedTranscript, podcastName, episode_title);
      if (!recap) return res.status(500).json({ message: "AI generation failed" });

      await pool.query(
        `UPDATE landing_page_recaps SET tldl = $1, what_happened = $2, key_insights = $3, quote = $4, quote_attribution = $5, key_topics = $6, top_questions = $7, sponsors = $8, guests = $9, resources = $10, topic_contexts = $11 WHERE slug = $12 AND episode_slug = $13`,
        [
          recap.tldl, recap.whatHappened, JSON.stringify(recap.keyInsights),
          recap.quote, recap.quoteAttribution,
          recap.keyTopics ? `{${recap.keyTopics.map((t: string) => `"${t.replace(/"/g, '\\"')}"`).join(",")}}` : null,
          recap.topQuestions ? JSON.stringify(recap.topQuestions) : null,
          recap.sponsors ? JSON.stringify(recap.sponsors) : null,
          recap.guests ? JSON.stringify(recap.guests) : null,
          recap.resources ? JSON.stringify(recap.resources) : null,
          recap.topicContexts ? JSON.stringify(recap.topicContexts) : null,
          podcastSlug, episodeSlug,
        ]
      );

      res.json({ success: true, whatHappenedLength: recap.whatHappened?.length, paragraphs: recap.whatHappened?.split("\n\n").length });
    } catch (err: any) {
      console.error("[Admin] Regenerate single recap error:", err);
      res.status(500).json({ message: err?.message || "Failed to regenerate" });
    }
  });

  app.get("/api/admin/cms/podcasts", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { search, sort, order, status } = req.query;

      const { rows: allUsers } = await pool.query(`SELECT podcasts FROM users WHERE podcasts IS NOT NULL AND array_length(podcasts, 1) > 0`);
      const followerMap = new Map<string, number>();
      for (const u of allUsers) {
        const podcasts = u.podcasts || [];
        for (const p of podcasts) {
          try {
            const parsed = JSON.parse(p);
            const pid = parsed.id || parsed.itunesId || "";
            if (pid) {
              followerMap.set(String(pid), (followerMap.get(String(pid)) || 0) + 1);
            }
          } catch {}
        }
      }

      let query = `SELECT pd.*, (SELECT COUNT(*) FROM landing_page_recaps lpr WHERE lpr.slug = pd.slug) as episode_count FROM podcast_directory pd WHERE 1=1`;
      const params: any[] = [];
      if (search) {
        params.push(`%${search}%`);
        query += ` AND (pd.name ILIKE $${params.length} OR pd.slug ILIKE $${params.length} OR pd.hosts ILIKE $${params.length})`;
      }
      if (status && status !== "all") {
        params.push(status);
        query += ` AND pd.status = $${params.length}`;
      }
      const sortCol = sort === "name" ? "pd.name" : sort === "episodes" ? "episode_count" : sort === "followers" ? "pd.name" : "pd.name";
      const sortOrder = order === "desc" ? "DESC" : "ASC";
      query += ` ORDER BY ${sortCol} ${sortOrder}`;
      const { rows } = await pool.query(query, params);

      const enrichedRows = rows.map((r: any) => ({
        ...r,
        follower_count: followerMap.get(String(r.itunes_id)) || 0,
      }));

      if (sort === "followers") {
        enrichedRows.sort((a: any, b: any) => {
          return order === "desc" ? b.follower_count - a.follower_count : a.follower_count - b.follower_count;
        });
      }

      res.json(enrichedRows);
    } catch (err: any) {
      console.error("[CMS] Get podcasts error:", err);
      res.status(500).json({ message: err?.message || "Failed to fetch podcasts" });
    }
  });

  app.get("/api/admin/cms/podcasts/:slug", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { slug } = req.params;
      const { rows: podcastRows } = await pool.query(`SELECT * FROM podcast_directory WHERE slug = $1`, [slug]);
      if (podcastRows.length === 0) return res.status(404).json({ message: "Podcast not found" });
      const podcast = podcastRows[0];

      const { rows: episodeRows } = await pool.query(
        `SELECT episode_title, publish_date, guests, key_topics, status, entity_contexts_cache FROM landing_page_recaps WHERE slug = $1 ORDER BY publish_date DESC`, [slug]
      );
      const episodeCount = episodeRows.length;

      const recentGuests: string[] = [];
      const topicCounts: Record<string, number> = {};
      const peopleSet = new Set<string>();
      const companySet = new Set<string>();
      const knownCompanyKeywords = ["inc", "corp", "llc", "co", "ltd", "capital", "ventures", "labs", "ai"];

      for (const ep of episodeRows) {
        if (ep.guests) {
          try {
            const guests = JSON.parse(ep.guests);
            if (Array.isArray(guests)) {
              for (const g of guests.slice(0, 3)) {
                const name = typeof g === "string" ? g : g.name;
                if (name && !recentGuests.includes(name)) recentGuests.push(name);
              }
            }
          } catch {}
        }
        if (ep.key_topics && Array.isArray(ep.key_topics)) {
          for (const t of ep.key_topics) {
            topicCounts[t] = (topicCounts[t] || 0) + 1;
          }
        }
        if (ep.entity_contexts_cache) {
          try {
            const entities: Record<string, string> = typeof ep.entity_contexts_cache === "string"
              ? JSON.parse(ep.entity_contexts_cache)
              : ep.entity_contexts_cache;
            for (const [entitySlug, context] of Object.entries(entities)) {
              const name = entitySlug.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
              const lowerName = name.toLowerCase();
              const isCompany = knownCompanyKeywords.some(kw => lowerName.includes(kw)) ||
                /^[A-Z][a-z]+$/.test(name) === false && !name.includes(" ") ||
                (typeof context === "string" && /\b(company|platform|product|service|app)\b/i.test(context));
              if (isCompany) {
                companySet.add(name);
              } else {
                peopleSet.add(name);
              }
            }
          } catch {}
        }
      }

      const topTopics = Object.entries(topicCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([topic, count]) => ({ topic, count }));

      let hosts: any[] = [];
      try {
        const { rows: hostRows } = await pool.query(
          `SELECT id, name, bio, photo_url, twitter_handle, linkedin_url, instagram_handle, website_url, sort_order FROM podcast_hosts WHERE podcast_slug = $1 ORDER BY sort_order`,
          [slug]
        );
        hosts = hostRows;
      } catch {}

      let topQuestions: any[] = [];
      try {
        const { rows: tqRows } = await pool.query(
          `SELECT questions FROM podcast_top_questions WHERE slug = $1 ORDER BY generated_at DESC LIMIT 1`,
          [slug]
        );
        if (tqRows.length > 0 && tqRows[0].questions) {
          const parsed = typeof tqRows[0].questions === "string" ? JSON.parse(tqRows[0].questions) : tqRows[0].questions;
          if (Array.isArray(parsed)) topQuestions = parsed;
        }
      } catch {}

      res.json({
        ...podcast,
        hosts_data: hosts,
        top_questions_data: topQuestions,
        stats: {
          episodeCount,
          recentGuests: recentGuests.slice(0, 10),
          topTopics,
          peopleMentioned: Array.from(peopleSet).slice(0, 10),
          companiesMentioned: Array.from(companySet).slice(0, 10),
        },
      });
    } catch (err: any) {
      console.error("[CMS] Get podcast detail error:", err);
      res.status(500).json({ message: err?.message || "Failed to fetch podcast" });
    }
  });

  app.patch("/api/admin/cms/podcasts/:slug", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { slug } = req.params;
      const validStatuses = ["published", "needs_review", "hidden"];
      if (req.body.status && !validStatuses.includes(req.body.status)) {
        return res.status(400).json({ message: "Invalid status. Must be: published, needs_review, or hidden" });
      }
      const allowedFields: Record<string, string> = {
        slug: "slug", name: "name", description: "description", artworkUrl: "artwork_url",
        hosts: "hosts", appleUrl: "apple_url", spotifyUrl: "spotify_url",
        youtubeUrl: "youtube_url", status: "status", hasLandingPage: "has_landing_page",
        twitterHandle: "twitter_handle", instagramUrl: "instagram_url",
        tiktokUrl: "tiktok_url", facebookUrl: "facebook_url", discordUrl: "discord_url",
        websiteUrl: "website_url", storeUrl: "store_url", category: "category",
        frequency: "frequency", avgEpisodeLength: "avg_episode_length",
        yearStarted: "year_started", aboutPodcast: "about_podcast",
      };
      const sets: string[] = [];
      const params: any[] = [];
      for (const [key, col] of Object.entries(allowedFields)) {
        if (req.body[key] !== undefined) {
          params.push(req.body[key]);
          sets.push(`${col} = $${params.length}`);
        }
      }
      if (sets.length === 0) return res.status(400).json({ message: "No fields to update" });
      params.push(slug);
      sets.push(`updated_at = NOW()`);
      const isNumericId = /^\d+$/.test(slug);
      const whereClause = isNumericId ? `id = $${params.length}::int` : `slug = $${params.length}`;
      const result = await pool.query(`UPDATE podcast_directory SET ${sets.join(", ")} WHERE ${whereClause}`, params);
      if (result.rowCount === 0) return res.status(404).json({ message: "Podcast not found" });
      res.json({ success: true });
    } catch (err: any) {
      console.error("[CMS] Update podcast error:", err);
      res.status(500).json({ message: err?.message || "Failed to update podcast" });
    }
  });

  const podcastEnrichState = { running: false, progress: { total: 0, done: 0, updated: 0, skipped: 0, errors: 0, log: [] as string[] } };

  app.post("/api/admin/cms/podcast-enrich", async (req, res) => {
    console.log("[Enrich] POST /api/admin/cms/podcast-enrich", { isAdmin: req.session.isAdmin, running: podcastEnrichState.running });
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    if (podcastEnrichState.running) return res.status(409).json({ message: "Enrichment already running", progress: podcastEnrichState.progress });

    const singleSlug = typeof req.body?.slug === "string" ? req.body.slug.trim() : undefined;
    podcastEnrichState.running = true;
    podcastEnrichState.progress = { total: 0, done: 0, updated: 0, skipped: 0, errors: 0, log: [] };

    res.json({ message: "Enrichment started", singleSlug: singleSlug || null });

    (async () => {
      try {
        const whereClause = singleSlug ? `WHERE slug = $1` : `WHERE has_landing_page = true`;
        const queryParams = singleSlug ? [singleSlug] : [];
        const { rows: podcasts } = await pool.query(
          `SELECT id, slug, name, hosts, description, apple_url, spotify_url, youtube_url, website_url, twitter_handle, instagram_url, tiktok_url, facebook_url, discord_url, store_url, category, frequency, avg_episode_length, year_started FROM podcast_directory ${whereClause} ORDER BY name`,
          queryParams
        );

        podcastEnrichState.progress.total = podcasts.length;
        console.log(`[Enrich] Found ${podcasts.length} podcasts to process`);
        const { openai } = await import("./replit_integrations/image/client");

        for (let i = 0; i < podcasts.length; i++) {
          const p = podcasts[i];
          podcastEnrichState.progress.done = i;

          const missing: string[] = [];
          if (!p.youtube_url) missing.push("youtube_url");
          if (!p.website_url) missing.push("website_url");
          if (!p.twitter_handle) missing.push("twitter_handle");
          if (!p.instagram_url) missing.push("instagram_url");
          if (!p.tiktok_url) missing.push("tiktok_url");
          if (!p.facebook_url) missing.push("facebook_url");
          if (!p.spotify_url) missing.push("spotify_url");
          if (!p.year_started || p.year_started === 0) missing.push("year_started");
          if (!p.avg_episode_length || p.avg_episode_length === 0) missing.push("avg_episode_length");

          if (missing.length === 0 && !singleSlug) {
            podcastEnrichState.progress.skipped++;
            continue;
          }

          try {
            const prompt = `You are a podcast metadata researcher. For the podcast below, find the REAL, verified information. Only return data you are confident is correct. Return null for anything you're unsure about.

Podcast: "${p.name}"
Hosts: ${p.hosts || "Unknown"}
Description: ${p.description || "N/A"}
Apple URL: ${p.apple_url || "N/A"}
Current Spotify: ${p.spotify_url || "N/A"}

Find these missing fields: ${missing.join(", ")}

Return a JSON object with ONLY the fields you can fill in. Use these exact keys:
- youtube_url: Full YouTube channel URL (e.g. "https://www.youtube.com/@channelname")
- website_url: Official podcast website URL (NOT Apple/Spotify)
- twitter_handle: Twitter/X handle WITHOUT @ (e.g. "podcastname")
- instagram_url: Full Instagram URL (e.g. "https://www.instagram.com/podcastname")
- tiktok_url: Full TikTok URL (e.g. "https://www.tiktok.com/@podcastname")
- facebook_url: Full Facebook URL
- spotify_url: Full Spotify show URL (e.g. "https://open.spotify.com/show/...")
- year_started: Year the podcast first launched (integer)
- avg_episode_length: Average episode length in minutes (integer)

Rules:
- Only return fields you are genuinely confident about
- For social links, only return them if the podcast actually has an active presence there
- Do NOT guess or make up URLs
- Return valid JSON only, no markdown`;

            const completion = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [{ role: "user", content: prompt }],
              max_tokens: 500,
              temperature: 0.1,
              response_format: { type: "json_object" },
            });

            const raw = completion.choices[0]?.message?.content?.trim() || "{}";
            let enriched: Record<string, any>;
            try { enriched = JSON.parse(raw); } catch { enriched = {}; }

            const isValidUrl = (u: any) => typeof u === "string" && /^https?:\/\/.+\..+/.test(u) && u.length < 500;
            const isValidHandle = (h: any) => typeof h === "string" && /^[a-zA-Z0-9_.-]{1,100}$/.test(h.replace(/^@/, ""));
            const isValidYear = (y: any) => { const n = Number(y); return Number.isInteger(n) && n >= 2000 && n <= new Date().getFullYear(); };
            const isValidMinutes = (m: any) => { const n = Number(m); return Number.isInteger(n) && n >= 1 && n <= 600; };

            const urlFields = ["youtube_url", "website_url", "instagram_url", "tiktok_url", "facebook_url", "spotify_url"];
            const sets: string[] = [];
            const params: any[] = [];

            for (const f of urlFields) {
              const val = enriched[f];
              if (val && isValidUrl(val)) {
                if (!p[f] || p[f] === "") { params.push(val); sets.push(`${f} = $${params.length}`); }
              }
            }
            if (enriched.twitter_handle) {
              const handle = String(enriched.twitter_handle).replace(/^@/, "");
              if (isValidHandle(handle) && (!p.twitter_handle || p.twitter_handle === "")) {
                params.push(handle); sets.push(`twitter_handle = $${params.length}`);
              }
            }
            if (enriched.year_started && isValidYear(enriched.year_started) && (!p.year_started || p.year_started === 0)) {
              params.push(Number(enriched.year_started)); sets.push(`year_started = $${params.length}`);
            }
            if (enriched.avg_episode_length && isValidMinutes(enriched.avg_episode_length) && (!p.avg_episode_length || p.avg_episode_length === 0)) {
              params.push(Number(enriched.avg_episode_length)); sets.push(`avg_episode_length = $${params.length}`);
            }

            if (sets.length > 0) {
              params.push(p.slug);
              sets.push(`updated_at = NOW()`);
              await pool.query(`UPDATE podcast_directory SET ${sets.join(", ")} WHERE slug = $${params.length}`, params);
              podcastEnrichState.progress.updated++;
              podcastEnrichState.progress.log.push(`✓ ${p.name}: updated ${sets.length - 1} fields`);
            } else {
              podcastEnrichState.progress.skipped++;
              podcastEnrichState.progress.log.push(`— ${p.name}: no new data found`);
            }
          } catch (err: any) {
            podcastEnrichState.progress.errors++;
            podcastEnrichState.progress.log.push(`✗ ${p.name}: ${err.message?.slice(0, 80)}`);
          }

          if (i % 5 === 0 && i > 0) {
            await new Promise(r => setTimeout(r, 500));
          }
        }

        podcastEnrichState.progress.done = podcasts.length;
        console.log(`[Enrich] Complete: ${podcastEnrichState.progress.updated} updated, ${podcastEnrichState.progress.skipped} skipped, ${podcastEnrichState.progress.errors} errors`);
      } catch (err: any) {
        console.error("[Enrich] Fatal error:", err);
        podcastEnrichState.progress.log.push(`FATAL: ${err.message}`);
      } finally {
        podcastEnrichState.running = false;
      }
    })();
  });

  app.get("/api/admin/cms/podcast-enrich/status", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    res.json({ running: podcastEnrichState.running, ...podcastEnrichState.progress });
  });

  const itunesFixState = { running: false, progress: { total: 0, done: 0, updated: 0, skipped: 0, errors: 0, log: [] as string[] } };

  app.post("/api/admin/cms/podcast-fix-itunes", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    if (itunesFixState.running) return res.status(409).json({ message: "iTunes fix already running", progress: itunesFixState.progress });

    itunesFixState.running = true;
    itunesFixState.progress = { total: 0, done: 0, updated: 0, skipped: 0, errors: 0, log: [] };

    res.json({ message: "iTunes fix started" });

    (async () => {
      try {
        const isSlugLike = (name: string, slug: string) => {
          if (!name) return true;
          if (name === slug) return true;
          if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(name)) return true;
          return false;
        };

        const { rows: podcasts } = await pool.query(
          `SELECT id, slug, name, itunes_id, artwork_url FROM podcast_directory WHERE itunes_id IS NOT NULL ORDER BY name`
        );

        const needsFix = podcasts.filter((p: any) =>
          isSlugLike(p.name, p.slug) || !p.artwork_url || p.artwork_url === ""
        );

        itunesFixState.progress.total = needsFix.length;
        console.log(`[iTunesFix] Found ${needsFix.length} podcasts needing name/artwork fix out of ${podcasts.length} total`);

        for (let i = 0; i < needsFix.length; i++) {
          const p = needsFix[i];

          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            const lookupRes = await fetch(`https://itunes.apple.com/lookup?id=${p.itunes_id}&media=podcast`, { signal: controller.signal });
            clearTimeout(timeout);

            if (!lookupRes.ok) {
              itunesFixState.progress.errors++;
              itunesFixState.progress.log.push(`✗ ${p.slug}: iTunes API returned HTTP ${lookupRes.status}`);
              itunesFixState.progress.done = i + 1;
              continue;
            }

            const lookupData = await lookupRes.json();
            const info = lookupData.results?.[0];

            if (!info) {
              itunesFixState.progress.skipped++;
              itunesFixState.progress.log.push(`— ${p.slug}: no iTunes result for id ${p.itunes_id}`);
              itunesFixState.progress.done = i + 1;
              continue;
            }

            const sets: string[] = [];
            const params: any[] = [];

            if (isSlugLike(p.name, p.slug) && info.collectionName) {
              params.push(info.collectionName);
              sets.push(`name = $${params.length}`);
            }

            if ((!p.artwork_url || p.artwork_url === "") && (info.artworkUrl600 || info.artworkUrl100)) {
              const artUrl = (info.artworkUrl600 || info.artworkUrl100 || "").replace(/\d+x\d+bb/, "1200x1200bb");
              if (artUrl) {
                params.push(artUrl);
                sets.push(`artwork_url = $${params.length}`);
              }
            }

            if (sets.length > 0) {
              params.push(p.id);
              sets.push(`updated_at = NOW()`);
              await pool.query(`UPDATE podcast_directory SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
              itunesFixState.progress.updated++;
              const updatedFields = sets.filter(s => !s.startsWith("updated_at")).map(s => s.split(" = ")[0]).join(", ");
              itunesFixState.progress.log.push(`✓ ${p.slug}: updated ${updatedFields}`);
            } else {
              itunesFixState.progress.skipped++;
              itunesFixState.progress.log.push(`— ${p.slug}: no changes needed from iTunes`);
            }
          } catch (err: any) {
            itunesFixState.progress.errors++;
            itunesFixState.progress.log.push(`✗ ${p.slug}: ${err.message?.slice(0, 80)}`);
          }

          itunesFixState.progress.done = i + 1;

          if (i % 5 === 0 && i > 0) {
            await new Promise(r => setTimeout(r, 500));
          }
        }

        itunesFixState.progress.done = needsFix.length;
        console.log(`[iTunesFix] Complete: ${itunesFixState.progress.updated} updated, ${itunesFixState.progress.skipped} skipped, ${itunesFixState.progress.errors} errors`);
      } catch (err: any) {
        console.error("[iTunesFix] Fatal error:", err);
        itunesFixState.progress.log.push(`FATAL: ${err.message}`);
      } finally {
        itunesFixState.running = false;
      }
    })();
  });

  app.get("/api/admin/cms/podcast-fix-itunes/status", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    res.json({ running: itunesFixState.running, ...itunesFixState.progress });
  });

  app.get("/api/admin/cms/podcasts/:slug/episodes", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { slug } = req.params;
      const { search, sort, order, status } = req.query;
      let query = `SELECT id, slug, episode_slug, episode_title, publish_date, duration, artwork_url, status, tldl, tabloid_headline, tabloid_sub_headline FROM landing_page_recaps WHERE slug = $1`;
      const params: any[] = [slug];
      if (search) {
        params.push(`%${search}%`);
        query += ` AND (episode_title ILIKE $${params.length})`;
      }
      if (status && status !== "all") {
        params.push(status);
        query += ` AND status = $${params.length}`;
      }
      const sortCol = sort === "title" ? "episode_title" : sort === "date" ? "publish_date" : "publish_date";
      const sortOrder = order === "asc" ? "ASC" : "DESC";
      query += ` ORDER BY ${sortCol} ${sortOrder}`;
      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err: any) {
      console.error("[CMS] Get episodes error:", err);
      res.status(500).json({ message: err?.message || "Failed to fetch episodes" });
    }
  });

  app.get("/api/admin/cms/episodes/:podcastSlug/:episodeSlug", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { podcastSlug, episodeSlug } = req.params;
      const { rows: recapRows } = await pool.query(
        `SELECT * FROM landing_page_recaps WHERE slug = $1 AND episode_slug = $2`, [podcastSlug, episodeSlug]
      );
      if (recapRows.length === 0) return res.status(404).json({ message: "Episode not found" });
      const episode = recapRows[0];

      const { rows: quoteRows } = await pool.query(
        `SELECT * FROM episode_quotes WHERE podcast_slug = $1 AND (episode_slug = $2 OR episode_slug LIKE $2 || '%' OR $2 LIKE episode_slug || '%') ORDER BY sort_order`, [podcastSlug, episodeSlug]
      );

      let transcript = null;
      try {
        const { rows: pdRows } = await pool.query(`SELECT itunes_id FROM podcast_directory WHERE slug = $1`, [podcastSlug]);
        if (pdRows.length > 0) {
          const { rows: transcriptRows } = await pool.query(
            `SELECT transcript FROM episode_transcripts WHERE podcast_id = $1 AND episode_title = $2 LIMIT 1`,
            [String(pdRows[0].itunes_id), episode.episode_title]
          );
          if (transcriptRows.length > 0) transcript = transcriptRows[0].transcript;
        }
      } catch {}

      let extractedProducts: any[] = [];
      try {
        const { rows: prodRows } = await pool.query(
          `SELECT id, name, company, description, category, context, mention_type, status, purchase_url, image_url FROM extracted_products WHERE podcast_slug = $1 AND (episode_slug = $2 OR episode_slug LIKE $2 || '%' OR $2 LIKE episode_slug || '%') ORDER BY name`,
          [podcastSlug, episodeSlug]
        );
        extractedProducts = prodRows;
      } catch {}

      let podcastHosts: any[] = [];
      let podcastSpotifyUrl = "";
      try {
        const { rows: hostRows } = await pool.query(
          `SELECT name, bio, photo_url, twitter_handle, linkedin_url, website_url FROM podcast_hosts WHERE podcast_slug = $1 ORDER BY sort_order`,
          [podcastSlug]
        );
        podcastHosts = hostRows;
        const { rows: pdRows2 } = await pool.query(
          `SELECT spotify_url FROM podcast_directory WHERE slug = $1`,
          [podcastSlug]
        );
        if (pdRows2.length > 0) podcastSpotifyUrl = pdRows2[0].spotify_url || "";
      } catch {}

      const isEmptyVal = (v: any) => !v || typeof v !== 'string' || !v.trim() || v.trim() === '[]' || v.trim() === 'null';
      const hostsValue = isEmptyVal(episode.hosts) ? podcastHosts.map((h: any) => h.name).join(", ") : episode.hosts;
      const spotifyValue = !isEmptyVal(episode.spotify_episode_url) ? episode.spotify_episode_url : (!isEmptyVal(podcastSpotifyUrl) ? podcastSpotifyUrl : "");

      res.json({ ...episode, hosts: hostsValue, spotify_episode_url: spotifyValue, quotes: quoteRows, transcript, extractedProducts, podcastHosts });
    } catch (err: any) {
      console.error("[CMS] Get episode detail error:", err);
      res.status(500).json({ message: err?.message || "Failed to fetch episode" });
    }
  });

  app.patch("/api/admin/cms/episodes/:podcastSlug/:episodeSlug", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { podcastSlug, episodeSlug } = req.params;
      const validStatuses = ["published", "needs_review", "hidden"];
      if (req.body.status && !validStatuses.includes(req.body.status)) {
        return res.status(400).json({ message: "Invalid status. Must be: published, needs_review, or hidden" });
      }
      const allowedFields: Record<string, string> = {
        episodeTitle: "episode_title", publishDate: "publish_date", duration: "duration",
        artworkUrl: "artwork_url", tldl: "tldl", whatHappened: "what_happened",
        keyInsights: "key_insights", quote: "quote", quoteAttribution: "quote_attribution",
        hosts: "hosts", guests: "guests", keyTopics: "key_topics",
        topicContexts: "topic_contexts", sponsors: "sponsors", resources: "resources",
        showNotes: "show_notes", status: "status", topQuestions: "top_questions",
        entityContextsCache: "entity_contexts_cache",
        spotifyEpisodeUrl: "spotify_episode_url", appleEpisodeUrl: "apple_episode_url",
        audioUrl: "audio_url", youtubeUrl: "youtube_url",
        tabloidHeadline: "tabloid_headline", tabloidSubHeadline: "tabloid_sub_headline",
      };
      const sets: string[] = [];
      const params: any[] = [];
      for (const [key, col] of Object.entries(allowedFields)) {
        if (req.body[key] !== undefined) {
          let val = req.body[key];
          if (key === "keyInsights" && Array.isArray(val)) {
            val = `{${val.map((v: string) => `"${v.replace(/"/g, '\\"')}"`).join(",")}}`;
          } else if (key === "keyTopics" && Array.isArray(val)) {
            val = `{${val.map((v: string) => `"${v.replace(/"/g, '\\"')}"`).join(",")}}`;
          } else if (["guests", "sponsors", "resources", "topicContexts", "topQuestions", "entityContextsCache"].includes(key) && typeof val === "object") {
            val = JSON.stringify(val);
          }
          params.push(val);
          sets.push(`${col} = $${params.length}`);
        }
      }
      if (sets.length === 0) return res.status(400).json({ message: "No fields to update" });
      params.push(podcastSlug);
      params.push(episodeSlug);
      const result = await pool.query(
        `UPDATE landing_page_recaps SET ${sets.join(", ")} WHERE slug = $${params.length - 1} AND episode_slug = $${params.length}`,
        params
      );
      if (result.rowCount === 0) return res.status(404).json({ message: "Episode not found" });
      if (req.body.status) {
        const publishedVal = req.body.status === "published";
        await pool.query(
          `UPDATE landing_page_recaps SET published = $1 WHERE slug = $2 AND episode_slug = $3`,
          [publishedVal, podcastSlug, episodeSlug]
        );
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error("[CMS] Update episode error:", err);
      res.status(500).json({ message: err?.message || "Failed to update episode" });
    }
  });

  app.post("/api/admin/cms/episodes/:podcastSlug/:episodeSlug/quotes", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { podcastSlug, episodeSlug } = req.params;
      const { speakerName, speakerRole, quoteText, context, quoteType } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO episode_quotes (podcast_slug, episode_slug, speaker_name, speaker_role, quote_text, context, quote_type) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [podcastSlug, episodeSlug, speakerName || "", speakerRole || "", quoteText || "", context || "", quoteType || "Hero Quote"]
      );
      res.json(rows[0]);
    } catch (err: any) {
      console.error("[CMS] Create quote error:", err);
      res.status(500).json({ message: err?.message || "Failed to create quote" });
    }
  });

  app.patch("/api/admin/cms/quotes/:id", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { id } = req.params;
      const { speakerName, speakerRole, quoteText, context, quoteType } = req.body;
      await pool.query(
        `UPDATE episode_quotes SET speaker_name = COALESCE($1, speaker_name), speaker_role = COALESCE($2, speaker_role), quote_text = COALESCE($3, quote_text), context = COALESCE($4, context), quote_type = COALESCE($5, quote_type) WHERE id = $6`,
        [speakerName, speakerRole, quoteText, context, quoteType, id]
      );
      res.json({ success: true });
    } catch (err: any) {
      console.error("[CMS] Update quote error:", err);
      res.status(500).json({ message: err?.message || "Failed to update quote" });
    }
  });

  app.delete("/api/admin/cms/quotes/:id", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      await pool.query(`DELETE FROM episode_quotes WHERE id = $1`, [req.params.id]);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[CMS] Delete quote error:", err);
      res.status(500).json({ message: err?.message || "Failed to delete quote" });
    }
  });

  app.post("/api/admin/cms/episodes/:podcastSlug/:episodeSlug/regenerate", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    const { podcastSlug, episodeSlug } = req.params;
    try {
      const response = await fetch(`http://localhost:${process.env.PORT || 5000}/api/admin/regenerate-single-recap`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": req.headers.cookie || "",
        },
        body: JSON.stringify({ podcastSlug, episodeSlug }),
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (err: any) {
      console.error("[CMS] Regenerate proxy error:", err);
      res.status(500).json({ message: err?.message || "Failed to regenerate" });
    }
  });

  app.get("/api/admin/cms/entity-backfill-status", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { rows: [counts] } = await pool.query(`
        SELECT 
          count(*)::int as total_episodes,
          count(entity_contexts_cache)::int as with_entities,
          (count(*) - count(entity_contexts_cache))::int as without_entities
        FROM landing_page_recaps
      `);
      const { rows: [transcriptCounts] } = await pool.query(`
        SELECT count(*)::int as episodes_with_transcripts
        FROM landing_page_recaps
        WHERE entity_contexts_cache IS NULL
          AND itunes_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM episode_transcripts 
            WHERE episode_transcripts.podcast_id = landing_page_recaps.itunes_id 
              AND LOWER(TRIM(episode_transcripts.episode_title)) = LOWER(TRIM(landing_page_recaps.episode_title))
              AND episode_transcripts.transcript IS NOT NULL
              AND episode_transcripts.transcript != ''
          )
      `);
      res.json({
        ...counts,
        backfillable: transcriptCounts.episodes_with_transcripts,
      });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to get status" });
    }
  });

  const entityBackfillState = { running: false, progress: { total: 0, done: 0, processed: 0, errors: 0, totalEntities: 0, log: [] as string[] } };

  app.get("/api/admin/cms/entity-backfill-progress", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    res.json({ running: entityBackfillState.running, ...entityBackfillState.progress });
  });

  app.post("/api/admin/cms/entity-backfill", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    if (entityBackfillState.running) return res.status(409).json({ message: "Entity backfill already running", progress: entityBackfillState.progress });

    entityBackfillState.running = true;
    entityBackfillState.progress = { total: 0, done: 0, processed: 0, errors: 0, totalEntities: 0, log: [] };

    res.json({ message: "Entity backfill started" });

    (async () => {
      try {
        const { rows: episodes } = await pool.query(`
          SELECT landing_page_recaps.id, landing_page_recaps.slug, landing_page_recaps.itunes_id, landing_page_recaps.podcast_name, landing_page_recaps.episode_title, landing_page_recaps.episode_slug, landing_page_recaps.sponsors, landing_page_recaps.hosts
          FROM landing_page_recaps
          WHERE landing_page_recaps.entity_contexts_cache IS NULL
            AND landing_page_recaps.itunes_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM episode_transcripts 
              WHERE episode_transcripts.podcast_id = landing_page_recaps.itunes_id 
                AND LOWER(TRIM(episode_transcripts.episode_title)) = LOWER(TRIM(landing_page_recaps.episode_title))
                AND episode_transcripts.transcript IS NOT NULL
                AND episode_transcripts.transcript != ''
            )
          ORDER BY landing_page_recaps.publish_date DESC NULLS LAST
        `);

        entityBackfillState.progress.total = episodes.length;

        if (episodes.length === 0) {
          entityBackfillState.progress.log.push("All episodes already have entity contexts");
          entityBackfillState.running = false;
          return;
        }

        const { detectEntitiesFromTranscript, ENTITY_PEOPLE: EP, ENTITY_COMPANIES: EC } = await import("./entityContextGenerator");
        const companySlugsSet = new Set(EC.map(c => c.slug));
        const peopleSlugsSet = new Set(EP.map(p => p.slug));

        for (let i = 0; i < episodes.length; i++) {
          const ep = episodes[i];
          entityBackfillState.progress.done = i;

          try {
            const { rows: transcriptRows } = await pool.query(
              `SELECT transcript FROM episode_transcripts WHERE podcast_id = $1 AND LOWER(TRIM(episode_title)) = LOWER(TRIM($2)) LIMIT 1`,
              [ep.itunes_id, ep.episode_title]
            );
            if (!transcriptRows[0]?.transcript) {
              entityBackfillState.progress.errors++;
              entityBackfillState.progress.log.push(`✗ ${ep.podcast_name}: ${ep.episode_title?.slice(0, 50)} — no transcript`);
              continue;
            }

            let sponsorNames: string[] = [];
            try {
              if (ep.sponsors) {
                const sponsors = typeof ep.sponsors === "string" ? JSON.parse(ep.sponsors) : ep.sponsors;
                sponsorNames = (Array.isArray(sponsors) ? sponsors : []).map((s: any) => (s.name || "").toLowerCase()).filter(Boolean);
              }
            } catch {}

            let hostNames: string[] = [];
            try {
              const hostData = await storage.getHostsByPodcastSlug(ep.slug);
              hostNames = hostData.map(h => h.name);
            } catch {}

            const entityContexts = detectEntitiesFromTranscript(
              transcriptRows[0].transcript, ep.slug, hostNames, sponsorNames
            );

            await pool.query(
              `UPDATE landing_page_recaps SET entity_contexts_cache = $1 WHERE id = $2`,
              [JSON.stringify(entityContexts), ep.id]
            );

            for (const [entitySlug, context] of Object.entries(entityContexts)) {
              const entityType = companySlugsSet.has(entitySlug) ? "company" : peopleSlugsSet.has(entitySlug) ? "person" : null;
              if (!entityType) continue;
              await pool.query(
                `INSERT INTO entity_episode_mentions (entity_type, entity_slug, recap_id, episode_slug, podcast_slug, context)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (entity_type, entity_slug, recap_id) DO UPDATE SET context = EXCLUDED.context`,
                [entityType, entitySlug, ep.id, ep.episode_slug, ep.slug, typeof context === "string" ? context : ""]
              );
            }

            const entCount = Object.keys(entityContexts).length;
            entityBackfillState.progress.totalEntities += entCount;
            entityBackfillState.progress.processed++;
            if (entCount > 0) {
              entityBackfillState.progress.log.push(`✓ ${ep.episode_title?.slice(0, 60)} — ${entCount} entities`);
            }
          } catch (err: any) {
            entityBackfillState.progress.errors++;
            entityBackfillState.progress.log.push(`✗ ${ep.episode_title?.slice(0, 50)} — ${err.message?.slice(0, 60)}`);
          }
        }

        entityBackfillState.progress.done = episodes.length;
        console.log(`[EntityBackfill] Complete: ${entityBackfillState.progress.processed} processed, ${entityBackfillState.progress.totalEntities} entities, ${entityBackfillState.progress.errors} errors`);
      } catch (err: any) {
        console.error("[EntityBackfill] Fatal error:", err);
        entityBackfillState.progress.log.push(`FATAL: ${err.message}`);
      } finally {
        entityBackfillState.running = false;
      }
    })();
  });

  app.get("/api/admin/cms/people", async (req, res) => {
    console.log("[CMS] GET /api/admin/cms/people", { search: req.query.search, isAdmin: req.session.isAdmin });
    if (!req.session.isAdmin) { console.log("[CMS] GET /api/admin/cms/people -> 401 Unauthorized"); return res.status(401).json({ message: "Unauthorized" }); }
    try {
      const { search } = req.query;
      let where = "";
      const params: any[] = [];
      if (search) {
        params.push(`%${search}%`);
        where = `WHERE ep.name ILIKE $${params.length}`;
      }
      const { rows } = await pool.query(`
        SELECT ep.*, 
          COALESCE(m.mention_count, 0)::int as episode_count,
          m.latest_context
        FROM entity_people ep
        LEFT JOIN (
          SELECT entity_slug, COUNT(*)::int as mention_count,
            (array_agg(context ORDER BY created_at DESC))[1] as latest_context
          FROM entity_episode_mentions WHERE entity_type = 'person'
          GROUP BY entity_slug
        ) m ON m.entity_slug = ep.slug
        ${where}
        ORDER BY COALESCE(m.mention_count, 0) DESC, ep.name ASC
        LIMIT 200
      `, params);
      console.log("[CMS] GET /api/admin/cms/people -> 200, count:", rows.length);
      res.json(rows.map(r => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        bio: r.bio,
        photoUrl: r.photo_url,
        title: r.title,
        company: r.company,
        twitterHandle: r.twitter_handle,
        linkedinUrl: r.linkedin_url,
        websiteUrl: r.website_url,
        category: r.category,
        searchTerms: r.search_terms,
        hostedSlugs: r.hosted_slugs,
        verified: r.verified,
        episodeCount: r.episode_count,
        context: r.latest_context || "",
      })));
    } catch (err: any) {
      console.error("[CMS] GET /api/admin/cms/people -> 500:", err?.message || err);
      res.status(500).json({ message: err?.message || "Failed to fetch people" });
    }
  });

  app.get("/api/admin/cms/people/:slug", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { rows: [person] } = await pool.query(`SELECT * FROM entity_people WHERE slug = $1`, [req.params.slug]);
      if (!person) return res.status(404).json({ message: "Person not found" });
      const { rows: mentions } = await pool.query(`
        SELECT eem.*, lpr.podcast_name, lpr.episode_title, lpr.publish_date, lpr.slug as podcast_slug_full
        FROM entity_episode_mentions eem
        JOIN landing_page_recaps lpr ON lpr.id = eem.recap_id
        WHERE eem.entity_type = 'person' AND eem.entity_slug = $1
        ORDER BY lpr.publish_date DESC
        LIMIT 100
      `, [req.params.slug]);
      res.json({
        id: person.id, slug: person.slug, name: person.name, bio: person.bio,
        photoUrl: person.photo_url, title: person.title, company: person.company,
        twitterHandle: person.twitter_handle, linkedinUrl: person.linkedin_url,
        websiteUrl: person.website_url, category: person.category,
        searchTerms: person.search_terms, hostedSlugs: person.hosted_slugs,
        verified: person.verified,
        createdAt: person.created_at, updatedAt: person.updated_at,
        mentions: mentions.map(m => ({
          episodeSlug: m.episode_slug,
          podcastSlug: m.podcast_slug,
          podcastName: m.podcast_name,
          episodeTitle: m.episode_title,
          publishDate: m.publish_date,
          context: m.context,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch person" });
    }
  });

  app.patch("/api/admin/cms/people/:slug", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { name, bio, photoUrl, title, company, twitterHandle, linkedinUrl, websiteUrl, category, verified, searchTerms, hostedSlugs } = req.body;
      const { rows: [updated] } = await pool.query(`
        UPDATE entity_people SET 
          name = COALESCE($1, name), bio = COALESCE($2, bio), photo_url = COALESCE($3, photo_url),
          title = COALESCE($4, title), company = COALESCE($5, company), twitter_handle = COALESCE($6, twitter_handle),
          linkedin_url = COALESCE($7, linkedin_url), website_url = COALESCE($8, website_url),
          category = COALESCE($9, category), verified = COALESCE($10, verified),
          search_terms = COALESCE($11, search_terms), hosted_slugs = COALESCE($12, hosted_slugs),
          updated_at = NOW()
        WHERE slug = $13 RETURNING *
      `, [name, bio, photoUrl, title, company, twitterHandle, linkedinUrl, websiteUrl, category, verified, searchTerms || null, hostedSlugs || null, req.params.slug]);
      if (!updated) return res.status(404).json({ message: "Person not found" });
      res.json({
        id: updated.id, slug: updated.slug, name: updated.name, bio: updated.bio,
        photoUrl: updated.photo_url, title: updated.title, company: updated.company,
        twitterHandle: updated.twitter_handle, linkedinUrl: updated.linkedin_url,
        websiteUrl: updated.website_url, category: updated.category,
        searchTerms: updated.search_terms, hostedSlugs: updated.hosted_slugs,
        verified: updated.verified, createdAt: updated.created_at, updatedAt: updated.updated_at,
      });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to update person" });
    }
  });

  app.post("/api/admin/cms/people", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { slug, name, bio, photoUrl, title, company, twitterHandle, linkedinUrl, websiteUrl, category, searchTerms } = req.body;
      if (!slug || !name) return res.status(400).json({ message: "slug and name are required" });
      let resolvedPhotoUrl = photoUrl || null;
      if (!resolvedPhotoUrl && slug) {
        const imgPath = path.join(process.cwd(), "client", "public", "people", `${slug}.png`);
        if (existsSync(imgPath)) {
          resolvedPhotoUrl = `/people/${slug}.png`;
        }
      }
      const { rows: [created] } = await pool.query(`
        INSERT INTO entity_people (slug, name, bio, photo_url, title, company, twitter_handle, linkedin_url, website_url, category, search_terms)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (slug) DO NOTHING RETURNING *
      `, [slug, name, bio || null, resolvedPhotoUrl, title || null, company || null, twitterHandle || null, linkedinUrl || null, websiteUrl || null, category || null, searchTerms || [name]]);
      if (!created) return res.status(409).json({ message: "Person with this slug already exists" });
      res.json(created);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to create person" });
    }
  });

  app.post("/api/admin/cms/people/backfill-photos", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const peopleDir = path.join(process.cwd(), "client", "public", "people");
      const { rows } = await pool.query(`SELECT id, slug, photo_url FROM entity_people WHERE photo_url IS NULL OR photo_url = ''`);
      let updated = 0;
      for (const row of rows) {
        const imgPath = path.join(peopleDir, `${row.slug}.png`);
        if (existsSync(imgPath)) {
          await pool.query(`UPDATE entity_people SET photo_url = $1, updated_at = NOW() WHERE id = $2`, [`/people/${row.slug}.png`, row.id]);
          updated++;
        }
      }
      console.log(`[CMS] Backfilled photo_url for ${updated}/${rows.length} people`);
      res.json({ message: `Backfilled photos for ${updated} people`, total: rows.length, updated });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to backfill photos" });
    }
  });

  app.get("/api/admin/cms/companies", async (req, res) => {
    console.log("[CMS] GET /api/admin/cms/companies", { search: req.query.search, isAdmin: req.session.isAdmin });
    if (!req.session.isAdmin) { console.log("[CMS] GET /api/admin/cms/companies -> 401 Unauthorized"); return res.status(401).json({ message: "Unauthorized" }); }
    try {
      const { search } = req.query;
      let where = "";
      const params: any[] = [];
      if (search) {
        params.push(`%${search}%`);
        where = `WHERE ec.name ILIKE $${params.length}`;
      }
      const { rows } = await pool.query(`
        SELECT ec.*, 
          COALESCE(m.mention_count, 0)::int as episode_count,
          m.latest_context
        FROM entity_companies ec
        LEFT JOIN (
          SELECT entity_slug, COUNT(*)::int as mention_count,
            (array_agg(context ORDER BY created_at DESC))[1] as latest_context
          FROM entity_episode_mentions WHERE entity_type = 'company'
          GROUP BY entity_slug
        ) m ON m.entity_slug = ec.slug
        ${where}
        ORDER BY COALESCE(m.mention_count, 0) DESC, ec.name ASC
        LIMIT 200
      `, params);
      console.log("[CMS] GET /api/admin/cms/companies -> 200, count:", rows.length);
      res.json(rows.map(r => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        description: r.description,
        logoUrl: r.logo_url,
        industry: r.industry,
        websiteUrl: r.website_url,
        twitterHandle: r.twitter_handle,
        category: r.category,
        searchTerms: r.search_terms,
        associatedTerms: r.associated_terms,
        verified: r.verified,
        episodeCount: r.episode_count,
        context: r.latest_context || "",
      })));
    } catch (err: any) {
      console.error("[CMS] GET /api/admin/cms/companies -> 500:", err?.message || err);
      res.status(500).json({ message: err?.message || "Failed to fetch companies" });
    }
  });

  app.get("/api/admin/cms/companies/:slug", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { rows: [company] } = await pool.query(`SELECT * FROM entity_companies WHERE slug = $1`, [req.params.slug]);
      if (!company) return res.status(404).json({ message: "Company not found" });
      const { rows: mentions } = await pool.query(`
        SELECT eem.*, lpr.podcast_name, lpr.episode_title, lpr.publish_date, lpr.slug as podcast_slug_full
        FROM entity_episode_mentions eem
        JOIN landing_page_recaps lpr ON lpr.id = eem.recap_id
        WHERE eem.entity_type = 'company' AND eem.entity_slug = $1
        ORDER BY lpr.publish_date DESC
        LIMIT 100
      `, [req.params.slug]);
      res.json({
        id: company.id, slug: company.slug, name: company.name, description: company.description,
        logoUrl: company.logo_url, industry: company.industry, websiteUrl: company.website_url,
        twitterHandle: company.twitter_handle, category: company.category,
        searchTerms: company.search_terms, associatedTerms: company.associated_terms,
        verified: company.verified,
        createdAt: company.created_at, updatedAt: company.updated_at,
        mentions: mentions.map(m => ({
          episodeSlug: m.episode_slug,
          podcastSlug: m.podcast_slug,
          podcastName: m.podcast_name,
          episodeTitle: m.episode_title,
          publishDate: m.publish_date,
          context: m.context,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch company" });
    }
  });

  app.patch("/api/admin/cms/companies/:slug", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { name, description, logoUrl, industry, websiteUrl, twitterHandle, category, verified, searchTerms, associatedTerms } = req.body;
      const { rows: [updated] } = await pool.query(`
        UPDATE entity_companies SET 
          name = COALESCE($1, name), description = COALESCE($2, description), logo_url = COALESCE($3, logo_url),
          industry = COALESCE($4, industry), website_url = COALESCE($5, website_url),
          twitter_handle = COALESCE($6, twitter_handle), category = COALESCE($7, category),
          verified = COALESCE($8, verified), search_terms = COALESCE($9, search_terms),
          associated_terms = COALESCE($10, associated_terms), updated_at = NOW()
        WHERE slug = $11 RETURNING *
      `, [name, description, logoUrl, industry, websiteUrl, twitterHandle, category, verified, searchTerms || null, associatedTerms || null, req.params.slug]);
      if (!updated) return res.status(404).json({ message: "Company not found" });
      res.json({
        id: updated.id, slug: updated.slug, name: updated.name, description: updated.description,
        logoUrl: updated.logo_url, industry: updated.industry, websiteUrl: updated.website_url,
        twitterHandle: updated.twitter_handle, category: updated.category,
        searchTerms: updated.search_terms, associatedTerms: updated.associated_terms,
        verified: updated.verified, createdAt: updated.created_at, updatedAt: updated.updated_at,
      });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to update company" });
    }
  });

  app.post("/api/admin/cms/companies", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { slug, name, description, logoUrl, industry, websiteUrl, twitterHandle, category, searchTerms, associatedTerms } = req.body;
      if (!slug || !name) return res.status(400).json({ message: "slug and name are required" });
      const { rows: [created] } = await pool.query(`
        INSERT INTO entity_companies (slug, name, description, logo_url, industry, website_url, twitter_handle, category, search_terms, associated_terms)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (slug) DO NOTHING RETURNING *
      `, [slug, name, description || null, logoUrl || null, industry || null, websiteUrl || null, twitterHandle || null, category || null, searchTerms || [name], associatedTerms || []]);
      if (!created) return res.status(409).json({ message: "Company with this slug already exists" });
      res.json(created);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to create company" });
    }
  });

  app.get("/api/admin/cms/entity-mentions/:type/:slug", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { type, slug } = req.params;
      if (!["person", "company"].includes(type)) return res.status(400).json({ message: "Invalid entity type" });
      const { rows } = await pool.query(`
        SELECT eem.*, lpr.podcast_name, lpr.episode_title, lpr.publish_date, lpr.artwork_url
        FROM entity_episode_mentions eem
        JOIN landing_page_recaps lpr ON lpr.id = eem.recap_id
        WHERE eem.entity_type = $1 AND eem.entity_slug = $2
        ORDER BY lpr.publish_date DESC
        LIMIT 200
      `, [type, slug]);
      res.json(rows.map(r => ({
        id: r.id,
        episodeSlug: r.episode_slug,
        podcastSlug: r.podcast_slug,
        podcastName: r.podcast_name,
        episodeTitle: r.episode_title,
        publishDate: r.publish_date,
        artworkUrl: r.artwork_url,
        context: r.context,
      })));
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch mentions" });
    }
  });

  app.get("/api/admin/cms/all-episodes", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { search, status, sort, order, page } = req.query;
      const limit = 50;
      const offset = ((parseInt(page as string) || 1) - 1) * limit;
      let where = "WHERE 1=1";
      const params: any[] = [];
      if (status && status !== "all") {
        params.push(status);
        where += ` AND lpr.status = $${params.length}`;
      }
      if (search) {
        params.push(`%${search}%`);
        where += ` AND (lpr.episode_title ILIKE $${params.length} OR lpr.podcast_name ILIKE $${params.length})`;
      }
      let orderBy = "lpr.publish_date DESC NULLS LAST";
      if (sort === "title") orderBy = `lpr.episode_title ${order === "desc" ? "DESC" : "ASC"}`;
      else if (sort === "date") orderBy = `lpr.publish_date ${order === "asc" ? "ASC" : "DESC"} NULLS LAST`;
      else if (sort === "popular") orderBy = `lpr.publish_date DESC NULLS LAST`;
      const { rows: countRows } = await pool.query(`SELECT count(*)::int as total FROM landing_page_recaps lpr ${where}`, params);
      const total = countRows[0]?.total || 0;
      params.push(limit);
      params.push(offset);
      const { rows } = await pool.query(
        `SELECT lpr.id, lpr.slug, lpr.podcast_name, lpr.episode_title, lpr.episode_slug, lpr.publish_date, lpr.duration, lpr.status, lpr.artwork_url
         FROM landing_page_recaps lpr ${where} ORDER BY ${orderBy}, lpr.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      res.json({ episodes: rows, total });
    } catch (err: any) {
      console.error("[CMS] All episodes error:", err);
      res.status(500).json({ message: err?.message || "Failed to fetch episodes" });
    }
  });

  app.get("/api/admin/cms/products", async (req, res) => {
    console.log("[CMS] GET /api/admin/cms/products", { search: req.query.search, status: req.query.status, category: req.query.category, page: req.query.page, isAdmin: req.session.isAdmin });
    if (!req.session.isAdmin) { console.log("[CMS] GET /api/admin/cms/products -> 401 Unauthorized"); return res.status(401).json({ message: "Unauthorized" }); }
    try {
      const { search, status, category, page } = req.query;
      const limit = 50;
      const offset = ((parseInt(page as string) || 1) - 1) * limit;
      const onlyBooks = category === "book";
      const onlyProducts = category && category !== "book" && category !== "all";

      if (onlyBooks) {
        let where = "WHERE 1=1";
        const params: any[] = [];
        if (status && status !== "all") {
          if (status === "approved") { where += " AND cover_approved = true"; }
          else if (status === "pending") { where += " AND cover_approved IS NULL"; }
          else if (status === "rejected") { where += " AND cover_approved = false"; }
        }
        if (search) {
          params.push(`%${search}%`);
          where += ` AND (book_title ILIKE $${params.length} OR author ILIKE $${params.length})`;
        }
        const { rows: countRows } = await pool.query(`SELECT count(*)::int as total FROM book_enrichments ${where}`, params);
        const total = countRows[0]?.total || 0;
        params.push(limit); params.push(offset);
        const { rows } = await pool.query(
          `SELECT id, book_title as name, author as company, description, 'book' as category, '' as context, '' as mention_type,
            CASE WHEN cover_approved = true THEN 'approved' WHEN cover_approved = false THEN 'rejected' ELSE 'pending' END as status,
            amazon_url as purchase_url,
            CASE WHEN has_cover = true THEN '/api/books/' || slug || '/cover' ELSE '' END as image_url,
            '' as podcast_slug, '' as episode_slug, '' as episode_title, created_at as extracted_at, 'book' as source, slug as book_slug
          FROM book_enrichments ${where} ORDER BY created_at DESC NULLS LAST, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
          params
        );
        const { rows: sc } = await pool.query(`SELECT
          count(CASE WHEN cover_approved = true THEN 1 END)::int as approved,
          count(CASE WHEN cover_approved IS NULL THEN 1 END)::int as pending,
          count(CASE WHEN cover_approved = false THEN 1 END)::int as rejected
          FROM book_enrichments`);
        const statusCounts = { approved: sc[0]?.approved || 0, pending: sc[0]?.pending || 0, rejected: sc[0]?.rejected || 0 };
        console.log("[CMS] GET /api/admin/cms/products -> 200, books:", rows.length, "total:", total);
        res.json({ products: rows, total, statusCounts, categoryCounts: { book: total } });
      } else if (onlyProducts) {
        let where = "WHERE 1=1";
        const params: any[] = [];
        params.push(category);
        where += ` AND category = $${params.length}`;
        if (status && status !== "all") {
          params.push(status);
          where += ` AND status = $${params.length}`;
        }
        if (search) {
          params.push(`%${search}%`);
          where += ` AND (name ILIKE $${params.length} OR company ILIKE $${params.length})`;
        }
        const { rows: countRows } = await pool.query(`SELECT count(*)::int as total FROM extracted_products ${where}`, params);
        const total = countRows[0]?.total || 0;
        params.push(limit); params.push(offset);
        const { rows } = await pool.query(
          `SELECT id, name, company, description, category, context, mention_type, status, purchase_url, image_url, podcast_slug, episode_slug, episode_title, extracted_at, 'product' as source FROM extracted_products ${where} ORDER BY extracted_at DESC NULLS LAST, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
          params
        );
        const { rows: sc } = await pool.query(`SELECT status, count(*)::int as count FROM extracted_products WHERE category = $1 GROUP BY status`, [category]);
        console.log("[CMS] GET /api/admin/cms/products -> 200, products:", rows.length, "total:", total);
        res.json({ products: rows, total, statusCounts: Object.fromEntries(sc.map((r: any) => [r.status, r.count])), categoryCounts: {} });
      } else {
        const productWhere: string[] = ["1=1"];
        const bookWhere: string[] = ["1=1"];
        const pParams: any[] = [];
        const bParams: any[] = [];

        if (status && status !== "all") {
          pParams.push(status);
          productWhere.push(`status = $${pParams.length}`);
          if (status === "approved") bookWhere.push("cover_approved = true");
          else if (status === "pending") bookWhere.push("cover_approved IS NULL");
          else if (status === "rejected") bookWhere.push("cover_approved = false");
        }
        if (search) {
          pParams.push(`%${search}%`);
          productWhere.push(`(name ILIKE $${pParams.length} OR company ILIKE $${pParams.length})`);
          bParams.push(`%${search}%`);
          bookWhere.push(`(book_title ILIKE $${bParams.length} OR author ILIKE $${bParams.length})`);
        }

        const [pCount, bCount] = await Promise.all([
          pool.query(`SELECT count(*)::int as total FROM extracted_products WHERE ${productWhere.join(" AND ")}`, pParams),
          pool.query(`SELECT count(*)::int as total FROM book_enrichments WHERE ${bookWhere.join(" AND ")}`, bParams),
        ]);
        const productTotal = pCount.rows[0]?.total || 0;
        const bookTotal = bCount.rows[0]?.total || 0;
        const total = productTotal + bookTotal;

        const allParams = [...pParams];
        allParams.push(limit); allParams.push(offset);
        const bAllParams = [...bParams];
        bAllParams.push(limit); bAllParams.push(offset);

        const [pRows, bRows] = await Promise.all([
          pool.query(
            `SELECT id, name, company, description, category, context, mention_type, status, purchase_url, image_url, podcast_slug, episode_slug, episode_title, extracted_at, 'product' as source FROM extracted_products WHERE ${productWhere.join(" AND ")} ORDER BY extracted_at DESC NULLS LAST, id DESC LIMIT $${allParams.length - 1} OFFSET $${allParams.length}`,
            allParams
          ),
          pool.query(
            `SELECT id, book_title as name, author as company, description, 'book' as category, '' as context, '' as mention_type,
              CASE WHEN cover_approved = true THEN 'approved' WHEN cover_approved = false THEN 'rejected' ELSE 'pending' END as status,
              amazon_url as purchase_url,
              CASE WHEN has_cover = true THEN '/api/books/' || slug || '/cover' ELSE '' END as image_url,
              '' as podcast_slug, '' as episode_slug, '' as episode_title, created_at as extracted_at, 'book' as source, slug as book_slug
            FROM book_enrichments WHERE ${bookWhere.join(" AND ")} ORDER BY created_at DESC NULLS LAST, id DESC LIMIT $${bAllParams.length - 1} OFFSET $${bAllParams.length}`,
            bAllParams
          ),
        ]);

        const merged = [...pRows.rows, ...bRows.rows].sort((a: any, b: any) => {
          const da = a.extracted_at ? new Date(a.extracted_at).getTime() : 0;
          const db = b.extracted_at ? new Date(b.extracted_at).getTime() : 0;
          return db - da;
        }).slice(0, limit);

        const [pStatusCounts, bStatusCounts, catCounts] = await Promise.all([
          pool.query(`SELECT status, count(*)::int as count FROM extracted_products GROUP BY status`),
          pool.query(`SELECT count(CASE WHEN cover_approved = true THEN 1 END)::int as approved, count(CASE WHEN cover_approved IS NULL THEN 1 END)::int as pending, count(CASE WHEN cover_approved = false THEN 1 END)::int as rejected FROM book_enrichments`),
          pool.query(`SELECT category, count(*)::int as count FROM extracted_products GROUP BY category`),
        ]);
        const sc: Record<string, number> = {};
        for (const r of pStatusCounts.rows) sc[r.status] = (sc[r.status] || 0) + r.count;
        sc.approved = (sc.approved || 0) + (bStatusCounts.rows[0]?.approved || 0);
        sc.pending = (sc.pending || 0) + (bStatusCounts.rows[0]?.pending || 0);
        sc.rejected = (sc.rejected || 0) + (bStatusCounts.rows[0]?.rejected || 0);

        const categoryCounts: Record<string, number> = { book: bookTotal };
        for (const r of catCounts.rows) categoryCounts[r.category] = r.count;

        console.log("[CMS] GET /api/admin/cms/products -> 200, merged:", merged.length, "total:", total);
        res.json({ products: merged, total, statusCounts: sc, categoryCounts });
      }
    } catch (err: any) {
      console.error("[CMS] GET /api/admin/cms/products -> 500:", err?.message || err);
      res.status(500).json({ message: err?.message || "Failed to fetch products" });
    }
  });

  app.patch("/api/admin/cms/products/:id", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { id } = req.params;
      const { status, purchaseUrl, imageUrl, name, company, description, category } = req.body;
      const sets: string[] = [];
      const params: any[] = [];
      if (status) { params.push(status); sets.push(`status = $${params.length}`); }
      if (purchaseUrl !== undefined) { params.push(purchaseUrl); sets.push(`purchase_url = $${params.length}`); }
      if (imageUrl !== undefined) { params.push(imageUrl); sets.push(`image_url = $${params.length}`); }
      if (name !== undefined) { params.push(name); sets.push(`name = $${params.length}`); }
      if (company !== undefined) { params.push(company); sets.push(`company = $${params.length}`); }
      if (description !== undefined) { params.push(description); sets.push(`description = $${params.length}`); }
      if (category !== undefined) { params.push(category); sets.push(`category = $${params.length}`); }
      if (sets.length === 0) return res.status(400).json({ message: "No fields to update" });
      if (status === "approved") {
        sets.push(`approved_at = NOW()`);
        sets.push(`approved_by = 'admin'`);
      }
      if (status === "rejected") {
        sets.push(`reviewed_at = NOW()`);
      }
      params.push(id);
      await pool.query(`UPDATE extracted_products SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[CMS] Update product error:", err);
      res.status(500).json({ message: err?.message || "Failed to update product" });
    }
  });

  app.patch("/api/admin/cms/books/:id", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (!status) return res.status(400).json({ message: "No fields to update" });
      const coverApproved = status === "approved" ? true : status === "rejected" ? false : null;
      await pool.query(`UPDATE book_enrichments SET cover_approved = $1, updated_at = NOW() WHERE id = $2`, [coverApproved, id]);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[CMS] Update book error:", err);
      res.status(500).json({ message: err?.message || "Failed to update book" });
    }
  });

  app.post("/api/admin/migrate-exec", express.json({ limit: "50mb" }), async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { query: sqlQuery, params = [], batch } = req.body;
      if (batch && Array.isArray(batch)) {
        let inserted = 0;
        let errors = 0;
        for (const item of batch) {
          if (!item.query || !item.query.trim().toUpperCase().startsWith("INSERT")) { errors++; continue; }
          try {
            await pool.query(item.query, item.params || []);
            inserted++;
          } catch (e: any) {
            console.error(`[migrate-exec] Error: ${e.message?.substring(0, 300)}`);
            errors++;
          }
        }
        return res.json({ inserted, errors });
      }
      if (!sqlQuery || typeof sqlQuery !== "string") {
        return res.status(400).json({ message: "query required" });
      }
      if (!sqlQuery.trim().toUpperCase().startsWith("INSERT")) {
        return res.status(400).json({ message: "Only INSERT queries allowed" });
      }
      const result = await pool.query(sqlQuery, params);
      res.json({ rowCount: result.rowCount });
    } catch (err: any) {
      res.status(500).json({ message: err?.message?.substring(0, 200) || "Query failed" });
    }
  });

  app.post("/api/admin/migrate-check-missing", express.json({ limit: "10mb" }), async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { table, keys } = req.body;
      if (table === "episode_transcripts" && Array.isArray(keys)) {
        const placeholders = keys.map((_: any, i: number) => `$${i + 1}`).join(",");
        const existing = await pool.query(
          `SELECT episode_guid FROM episode_transcripts WHERE episode_guid IN (${placeholders})`,
          keys
        );
        const existingSet = new Set(existing.rows.map((r: any) => r.episode_guid));
        const missing = keys.filter((k: string) => !existingSet.has(k));
        return res.json({ missing });
      }
      if (table === "episode_quotes" && Array.isArray(keys)) {
        const placeholders = keys.map((_: any, i: number) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(",");
        const params = keys.flatMap((k: any) => [k[0], k[1], k[2]]);
        const existing = await pool.query(
          `SELECT podcast_slug || '|||' || episode_slug || '|||' || quote_text as key FROM episode_quotes WHERE (podcast_slug, episode_slug, quote_text) IN (${placeholders})`,
          params
        );
        const existingSet = new Set(existing.rows.map((r: any) => r.key));
        const missing = keys.filter((k: any) => !existingSet.has(k[0] + "|||" + k[1] + "|||" + k[2]));
        return res.json({ missing });
      }
      res.status(400).json({ message: "Invalid table or params" });
    } catch (err: any) {
      res.status(500).json({ message: err?.message?.substring(0, 200) || "Check failed" });
    }
  });

  app.post("/api/admin/migrate-from-dev", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const devDbUrl = process.env.DEV_DATABASE_URL;
    if (!devDbUrl) {
      return res.status(400).json({ message: "DEV_DATABASE_URL not set — run migration from dev server instead" });
    }
    const { table, batchSize = 100, offset = 0 } = req.body;
    if (!table) {
      return res.status(400).json({ message: "table parameter required" });
    }

    const pgModule = await import("pg");
    const devPool = new pgModule.default.Pool({ connectionString: devDbUrl });

    try {
      const log: string[] = [];
      let inserted = 0;

      if (table === "podcast_directory") {
        const { rows: devRows } = await devPool.query(`SELECT * FROM podcast_directory ORDER BY id LIMIT $1 OFFSET $2`, [batchSize, offset]);
        for (const row of devRows) {
          try {
            const cols = Object.keys(row);
            const vals = Object.values(row);
            const placeholders = vals.map((_, i) => `$${i + 1}`).join(",");
            await pool.query(`INSERT INTO podcast_directory (${cols.join(",")}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`, vals);
            inserted++;
          } catch (e: any) { log.push(`Skip podcast ${row.slug}: ${e.message}`); }
        }
        res.json({ table, inserted, total: devRows.length, offset, log: log.slice(0, 20) });

      } else if (table === "episode_transcripts") {
        const { rows: devRows } = await devPool.query(
          `SELECT podcast_id, episode_title, transcript, audio_url, language, created_at FROM episode_transcripts ORDER BY id LIMIT $1 OFFSET $2`,
          [batchSize, offset]
        );
        for (const row of devRows) {
          try {
            await pool.query(
              `INSERT INTO episode_transcripts (podcast_id, episode_title, transcript, audio_url, language, created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (podcast_id, episode_title) DO NOTHING`,
              [row.podcast_id, row.episode_title, row.transcript, row.audio_url, row.language, row.created_at]
            );
            inserted++;
          } catch (e: any) { log.push(`Skip transcript: ${e.message?.substring(0, 100)}`); }
        }
        res.json({ table, inserted, total: devRows.length, offset, log: log.slice(0, 20) });

      } else if (table === "landing_page_recaps") {
        const { rows: devRows } = await devPool.query(
          `SELECT slug, itunes_id, podcast_name, episode_title, episode_slug, publish_date, duration, artwork_url, hosts, tldl, what_happened, key_insights, quote, quote_attribution, created_at, apple_episode_url, audio_url, key_topics, top_questions, sponsors, guests, show_notes, resources, spotify_episode_url, entity_contexts_cache, topic_contexts, published FROM landing_page_recaps ORDER BY id LIMIT $1 OFFSET $2`,
          [batchSize, offset]
        );
        for (const row of devRows) {
          try {
            await storage.upsertLandingPageRecap({
              slug: row.slug,
              itunesId: row.itunes_id,
              podcastName: row.podcast_name,
              episodeTitle: row.episode_title,
              episodeSlug: row.episode_slug,
              publishDate: row.publish_date,
              duration: row.duration,
              artworkUrl: row.artwork_url,
              hosts: row.hosts,
              tldl: row.tldl,
              whatHappened: row.what_happened,
              keyInsights: row.key_insights,
              quote: row.quote,
              quoteAttribution: row.quote_attribution,
              appleEpisodeUrl: row.apple_episode_url,
              audioUrl: row.audio_url,
              keyTopics: row.key_topics,
              topQuestions: row.top_questions,
              sponsors: row.sponsors,
              guests: row.guests,
              showNotes: row.show_notes,
              resources: row.resources,
              spotifyEpisodeUrl: row.spotify_episode_url,
              topicContexts: row.topic_contexts,
              published: row.published,
            });
            inserted++;
          } catch (e: any) { log.push(`Skip recap ${row.episode_slug}: ${e.message?.substring(0, 100)}`); }
        }
        res.json({ table, inserted, total: devRows.length, offset, log: log.slice(0, 20) });

      } else if (table === "book_enrichments") {
        const { rows: devRows } = await devPool.query(`SELECT * FROM book_enrichments ORDER BY id LIMIT $1 OFFSET $2`, [batchSize, offset]);
        for (const row of devRows) {
          try {
            await pool.query(
              `INSERT INTO book_enrichments (book_key, book_title, slug, author, description, asin, isbn, google_books_id, has_cover, cover_approved, podcast_buzz, topics, page_count, publish_year, rating) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (book_key) DO NOTHING`,
              [row.book_key, row.book_title, row.slug, row.author, row.description, row.asin, row.isbn, row.google_books_id, row.has_cover, row.cover_approved, row.podcast_buzz, row.topics, row.page_count, row.publish_year, row.rating]
            );
            inserted++;
          } catch (e: any) { log.push(`Skip book ${row.slug}: ${e.message?.substring(0, 100)}`); }
        }
        res.json({ table, inserted, total: devRows.length, offset, log: log.slice(0, 20) });

      } else if (table === "book_aliases") {
        const { rows: devRows } = await devPool.query(`SELECT alias_key, canonical_key FROM book_aliases ORDER BY alias_key LIMIT $1 OFFSET $2`, [batchSize, offset]);
        for (const row of devRows) {
          try {
            await pool.query(`INSERT INTO book_aliases (alias_key, canonical_key) VALUES ($1,$2) ON CONFLICT (alias_key) DO NOTHING`, [row.alias_key, row.canonical_key]);
            inserted++;
          } catch (e: any) { log.push(`Skip alias: ${e.message?.substring(0, 100)}`); }
        }
        res.json({ table, inserted, total: devRows.length, offset, log: log.slice(0, 20) });

      } else if (table === "episode_quotes") {
        const { rows: devRows } = await devPool.query(`SELECT podcast_slug, episode_slug, speaker_name, speaker_role, quote_text, context, quote_type, created_at FROM episode_quotes ORDER BY id LIMIT $1 OFFSET $2`, [batchSize, offset]);
        for (const row of devRows) {
          try {
            await pool.query(
              `INSERT INTO episode_quotes (podcast_slug, episode_slug, speaker_name, speaker_role, quote_text, context, quote_type, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (podcast_slug, episode_slug, quote_text) DO NOTHING`,
              [row.podcast_slug, row.episode_slug, row.speaker_name, row.speaker_role, row.quote_text, row.context, row.quote_type, row.created_at]
            );
            inserted++;
          } catch (e: any) { log.push(`Skip quote: ${e.message?.substring(0, 100)}`); }
        }
        res.json({ table, inserted, total: devRows.length, offset, log: log.slice(0, 20) });

      } else if (table === "extracted_products") {
        const { rows: devRows } = await devPool.query(`SELECT name, company, description, purchase_url, image_url, context, mention_type, category, episode_title, episode_slug, podcast_slug, status, image_status FROM extracted_products ORDER BY id LIMIT $1 OFFSET $2`, [batchSize, offset]);
        for (const row of devRows) {
          try {
            await pool.query(
              `INSERT INTO extracted_products (name, company, description, purchase_url, image_url, context, mention_type, category, episode_title, episode_slug, podcast_slug, status, image_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
              [row.name, row.company, row.description, row.purchase_url, row.image_url, row.context, row.mention_type, row.category, row.episode_title, row.episode_slug, row.podcast_slug, row.status, row.image_status]
            );
            inserted++;
          } catch (e: any) { log.push(`Skip product ${row.name}: ${e.message?.substring(0, 100)}`); }
        }
        res.json({ table, inserted, total: devRows.length, offset, log: log.slice(0, 20) });

      } else {
        return res.status(400).json({ message: `Unknown table: ${table}` });
      }
    } catch (err: any) {
      console.error("[Migration] Error:", err);
      res.status(500).json({ message: err?.message || "Migration failed" });
    } finally {
      await devPool.end();
    }
  });

  app.post("/api/admin/backfill-show-notes", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const devDbUrl = process.env.DEV_DATABASE_URL;
    if (!devDbUrl) {
      return res.status(400).json({ message: "DEV_DATABASE_URL not set" });
    }
    const pgModule = await import("pg");
    const devPool = new pgModule.default.Pool({ connectionString: devDbUrl });

    try {
      const { rows: devRows } = await devPool.query(
        `SELECT slug, episode_slug, show_notes FROM landing_page_recaps WHERE show_notes IS NOT NULL AND show_notes != '' ORDER BY id`
      );

      let updated = 0;
      let skipped = 0;
      const errors: string[] = [];
      for (const row of devRows) {
        try {
          const result = await pool.query(
            `UPDATE landing_page_recaps SET show_notes = $1 WHERE slug = $2 AND episode_slug = $3 AND (show_notes IS NULL OR show_notes = '')`,
            [row.show_notes, row.slug, row.episode_slug]
          );
          if (result.rowCount && result.rowCount > 0) {
            updated++;
          } else {
            skipped++;
          }
        } catch (e: any) {
          skipped++;
          errors.push(`${row.slug}/${row.episode_slug}: ${e.message?.substring(0, 100)}`);
        }
      }

      res.json({ success: true, updated, skipped, totalDevRows: devRows.length, errors: errors.slice(0, 20) });
    } catch (err: any) {
      console.error("[Backfill show notes] Error:", err);
      res.status(500).json({ message: err?.message || "Backfill failed" });
    } finally {
      await devPool.end();
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
                const { searchSpotifyEpisode } = await import("./spotifyClient");
                const spotifyUrl = await searchSpotifyEpisode(pName, epTitle) || "";
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

        const epMetaBatch = await buildEpisodeMetaFromSummary(summary);
        const { generateEmailSubjectAndPreview } = await import("./emailScheduler");
        const { parseDigestMarkdown } = await import("./emailTemplate");
        const parsedBatch = parseDigestMarkdown(summary);
        const epCountBatch = parsedBatch.episodes.length || 1;
        const emailCopyBatch = await generateEmailSubjectAndPreview(summary, epCountBatch);
        const { reorderMarkdownLeadFirst } = await import("./emailScheduler");
        const reorderedBatch = reorderMarkdownLeadFirst(summary, emailCopyBatch.leadEpisodePodcast);
        const newHtml = markdownToEmailHtml(reorderedBatch, email.recipientEmail, epMetaBatch, emailCopyBatch);
        await storage.updatePendingEmailHtml(email.id, newHtml);
        await pool.query("UPDATE pending_emails SET subject = $1 WHERE id = $2", [emailCopyBatch.subject, email.id]);
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
      const allUsersRaw = await storage.getAllUsers();
      const allUsers = allUsersRaw.filter(u => u.emailVerified);
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
      const clickedEmails = sentEmails.filter(e => e.firstClickedAt);
      const totalSent = sentEmails.length;
      const totalOpened = openedEmails.length;
      const totalClicked = clickedEmails.length;
      const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
      const clickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0;

      const openRateByDay: Record<string, { sent: number; opened: number; clicked: number }> = {};
      for (const email of sentEmails) {
        const date = email.sentAt
          ? new Date(email.sentAt).toISOString().split("T")[0]
          : email.recapDate;
        if (!openRateByDay[date]) openRateByDay[date] = { sent: 0, opened: 0, clicked: 0 };
        openRateByDay[date].sent++;
        if (email.emailOpenedAt) openRateByDay[date].opened++;
        if (email.firstClickedAt) openRateByDay[date].clicked++;
      }
      const openRateTrend = Object.entries(openRateByDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, { sent, opened, clicked }]) => ({
          date,
          sent,
          opened,
          clicked,
          rate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
          clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
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
        emailOpenStats: { totalSent, totalOpened, totalClicked, openRate, clickRate },
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
    const updateUserId = getAuthUserId(req);
    if (!updateUserId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const input = api.users.update.input.parse(req.body);
      const updated = await storage.updateUser(updateUserId, input);

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
    const checkoutUserId = getAuthUserId(req);
    if (!checkoutUserId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await storage.getUserById(checkoutUserId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const resolvedFlags = await storage.getResolvedFlagsForUser(checkoutUserId);
    if (resolvedFlags.upgrade !== true) {
      return res.status(403).json({ message: "Upgrade is not available at this time" });
    }

    const billingCycle = req.body?.billingCycle;
    if (billingCycle && billingCycle !== "monthly" && billingCycle !== "annual") {
      return res.status(400).json({ message: "billingCycle must be 'monthly' or 'annual'" });
    }
    const cycle = billingCycle || "annual";

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

      let products = await stripe.products.search({ query: "name:'PodRise Pulse Pro'" });
      let proProduct = products.data.find(p => p.active);

      if (!proProduct) {
        proProduct = await stripe.products.create({
          name: "PodRise Pulse Pro",
          description: "Daily topic briefings personalized by industry, interest, and role.",
        });
      }

      const pricesResult = await stripe.prices.list({ product: proProduct.id, active: true, limit: 10 });

      let targetPrice;
      if (cycle === "monthly") {
        targetPrice = pricesResult.data.find(p => p.recurring?.interval === "month" && p.unit_amount === 1500);
        if (!targetPrice) {
          targetPrice = await stripe.prices.create({
            product: proProduct.id,
            unit_amount: 1500,
            currency: "usd",
            recurring: { interval: "month" },
          });
        }
      } else {
        targetPrice = pricesResult.data.find(p => p.recurring?.interval === "year" && p.unit_amount === 15000);
        if (!targetPrice) {
          targetPrice = await stripe.prices.create({
            product: proProduct.id,
            unit_amount: 15000,
            currency: "usd",
            recurring: { interval: "year" },
          });
        }
      }

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{ price: targetPrice.id, quantity: 1 }],
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
    const subUserId = getAuthUserId(req);
    if (!subUserId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await storage.getUserById(subUserId);
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
    const portalUserId = getAuthUserId(req);
    if (!portalUserId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await storage.getUserById(portalUserId);
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
    const cancelUserId = getAuthUserId(req);
    if (!cancelUserId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await storage.getUserById(cancelUserId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
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
    const pmUserId = getAuthUserId(req);
    if (!pmUserId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUserById(pmUserId);
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
    const invUserId = getAuthUserId(req);
    if (!invUserId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUserById(invUserId);
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

      const products = await stripe.products.search({ query: "name:'PodRise Pulse Pro'" });
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

  app.get("/api/pulse/subscriptions", async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const subs = await storage.getPulseSubscriptions(userId);
      res.json({ subscriptions: subs });
    } catch (err: any) {
      console.error("Get pulse subscriptions error:", err);
      res.status(500).json({ message: "Failed to get subscriptions" });
    }
  });

  const { VALID_PULSE_SLUGS } = await import("@shared/pulseSlugs");

  app.post("/api/pulse/subscriptions", async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUserById(userId);
    if (!user || user.plan !== "pro") {
      return res.status(403).json({ message: "Pulse subscriptions require a Pro plan" });
    }
    const { topicSlug } = req.body;
    if (!topicSlug || typeof topicSlug !== "string" || !VALID_PULSE_SLUGS.has(topicSlug)) {
      return res.status(400).json({ message: "Invalid topicSlug" });
    }
    try {
      const sub = await storage.addPulseSubscription(userId, topicSlug);
      res.json({ subscription: sub });
    } catch (err) {
      console.error("Add pulse subscription error:", err);
      res.status(500).json({ message: "Failed to add subscription" });
    }
  });

  app.delete("/api/pulse/subscriptions/:topicSlug", async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUserById(userId);
    if (!user || user.plan !== "pro") {
      return res.status(403).json({ message: "Pulse subscriptions require a Pro plan" });
    }
    if (!VALID_PULSE_SLUGS.has(req.params.topicSlug)) {
      return res.status(400).json({ message: "Invalid topicSlug" });
    }
    try {
      await storage.removePulseSubscription(userId, req.params.topicSlug);
      res.json({ success: true });
    } catch (err) {
      console.error("Remove pulse subscription error:", err);
      res.status(500).json({ message: "Failed to remove subscription" });
    }
  });

  app.put("/api/pulse/subscriptions", async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUserById(userId);
    if (!user || user.plan !== "pro") {
      return res.status(403).json({ message: "Pulse subscriptions require a Pro plan" });
    }
    const { topicSlugs } = req.body;
    if (!Array.isArray(topicSlugs) || topicSlugs.length > 50) {
      return res.status(400).json({ message: "topicSlugs must be an array with at most 50 items" });
    }
    const validSlugs = [...new Set(topicSlugs.filter((s: string) => typeof s === "string" && VALID_PULSE_SLUGS.has(s)))];
    try {
      const subs = await storage.bulkUpdatePulseSubscriptions(userId, validSlugs);
      res.json({ subscriptions: subs });
    } catch (err) {
      console.error("Bulk update pulse subscriptions error:", err);
      res.status(500).json({ message: "Failed to update subscriptions" });
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
          `SELECT pd.itunes_id, pd.name,
                  COALESCE(pd.total_episodes, 0)::int as total_episodes,
                  COALESCE(tc.transcript_count, 0)::int as transcript_count
           FROM podcast_directory pd
           LEFT JOIN (
             SELECT podcast_id, COUNT(*)::int as transcript_count
             FROM episode_transcripts
             GROUP BY podcast_id
           ) tc ON pd.itunes_id = tc.podcast_id
           ORDER BY pd.name ASC`
        );

        res.json({
          podcasts: podcasts.map((p) => ({
            name: p.name,
            itunesId: p.itunes_id,
            transcriptCount: p.transcript_count,
            totalEpisodes: p.total_episodes || 0,
          })),
          totalTranscripts: podcasts.reduce((sum, p) => sum + (p.transcript_count || 0), 0),
          totalPodcasts: podcasts.length,
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
              (SELECT count(*)::int FROM episode_quotes eq WHERE eq.podcast_slug = lpr.slug AND (eq.episode_slug = lpr.episode_slug OR eq.episode_slug LIKE lpr.episode_slug || '%' OR lpr.episode_slug LIKE eq.episode_slug || '%')) as quote_count,
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
    extractedQuotes?: any[] | null;
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
        const inlineQuotes = opts.extractedQuotes || [];
        if (inlineQuotes.length > 0) {
          const quotesToSave = inlineQuotes.map((q: any) => ({
            podcastSlug,
            episodeSlug,
            speakerName: q.speakerName,
            speakerRole: q.speakerRole || null,
            quoteText: q.quoteText,
            context: q.context,
            quoteType: q.quoteType,
          }));
          await storage.saveEpisodeQuotes(quotesToSave);
          console.log(`[PostProcess] Saved ${inlineQuotes.length} inline quotes for "${episodeTitle}"`);
        } else {
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
      }
    } catch (err) {
      console.warn(`[PostProcess] Quote extraction failed for "${episodeTitle}":`, err);
    }

    if (resources && resources.length > 0) {
      try {
        const books = resources.filter((r: any) => r.type === "book" && r.name);
        for (const book of books) {
          const bookKey = book.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
          const { rows: blocked } = await pool.query("SELECT 1 FROM book_blocklist WHERE book_key = $1", [bookKey]);
          if (blocked.length > 0) continue;
          const { rows: existing } = await pool.query(
            `SELECT id, description, amazon_url FROM book_enrichments WHERE lower(book_title) = lower($1) LIMIT 1`,
            [book.name]
          );
          const descValue = book.description || book.context || null;
          const urlValue = book.url || null;
          if (existing.length === 0) {
            const slug = book.name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").trim();
            await pool.query(
              `INSERT INTO book_enrichments (book_key, book_title, author, slug, amazon_url, description)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (slug) DO UPDATE SET
                 description = COALESCE(NULLIF(TRIM(book_enrichments.description), ''), EXCLUDED.description),
                 amazon_url = COALESCE(NULLIF(TRIM(book_enrichments.amazon_url), ''), EXCLUDED.amazon_url),
                 author = COALESCE(book_enrichments.author, EXCLUDED.author)`,
              [bookKey, book.name, book.author || null, slug, urlValue, descValue]
            );
            console.log(`[PostProcess] Enriched book: "${book.name}"`);
          } else if (!existing[0].description || existing[0].description.trim() === '' || !existing[0].amazon_url || existing[0].amazon_url.trim() === '') {
            await pool.query(
              `UPDATE book_enrichments SET
                 description = COALESCE(NULLIF(TRIM(description), ''), $1),
                 amazon_url = COALESCE(NULLIF(TRIM(amazon_url), ''), $2),
                 author = COALESCE(author, $3)
               WHERE id = $4`,
              [descValue, urlValue, book.author || null, existing[0].id]
            );
            console.log(`[PostProcess] Updated missing data for book: "${book.name}"`);
          }
        }
      } catch (err) {
        console.warn(`[PostProcess] Book enrichment failed for "${episodeTitle}":`, err);
      }
    }

    if (opts.recapId && transcript) {
      try {
        const { rows: cacheCheck } = await pool.query(
          `SELECT entity_contexts_cache FROM landing_page_recaps WHERE id = $1`,
          [opts.recapId]
        );
        if (cacheCheck.length > 0 && !cacheCheck[0].entity_contexts_cache) {
          let sponsorNames: string[] = [];
          try {
            const { rows: recapRow } = await pool.query(
              `SELECT sponsors FROM landing_page_recaps WHERE id = $1`, [opts.recapId]
            );
            if (recapRow[0]?.sponsors) {
              const sponsors = typeof recapRow[0].sponsors === "string" ? JSON.parse(recapRow[0].sponsors) : recapRow[0].sponsors;
              sponsorNames = sponsors.map((s: any) => (s.name || "").toLowerCase()).filter(Boolean);
            }
          } catch {}

          const podcastHosts = await storage.getHostsByPodcastSlug(podcastSlug);
          const hostNameSet = new Set(podcastHosts.map(h => h.name.toLowerCase().trim()));

          const RECAP_AMBIGUOUS_TERMS = new Set([
            "Notion", "Oracle", "Square", "Chase", "Visa", "Benchmark", "Snowflake",
            "Perplexity", "Bain", "Citadel", "Accel", "Sequoia",
            "The Information", "The Economist",
            "Claude", "Gemini", "Slack", "Discord", "Zoom", "Toast", "Runway",
            "Cursor", "Box", "Circle"
          ]);

          function ppCountMentions(text: string, terms: string[], ambiguous?: Set<string>): number {
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

          function ppExtractSnippets(text: string, terms: string[], count: number = 3): string[] {
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
            if (p.hostedSlugs.includes(podcastSlug)) return false;
            return ppCountMentions(transcript, p.searchTerms) >= 2;
          }).map(p => p.slug);

          const matchedCompanySlugs = ENTITY_COMPANIES.filter(c => {
            if (sponsorNames.includes(c.name.toLowerCase())) return false;
            const allTerms = [...c.searchTerms, ...(c.associatedTerms || [])];
            return ppCountMentions(transcript, allTerms, RECAP_AMBIGUOUS_TERMS) >= 2;
          }).map(c => c.slug);

          const allMatchedSlugs = [...matchedPeopleSlugs, ...matchedCompanySlugs];
          if (allMatchedSlugs.length > 0) {
            const entityList: { slug: string; name: string; type: string; snippets: string[] }[] = [];
            for (const slug of matchedPeopleSlugs) {
              const person = ENTITY_PEOPLE.find(p => p.slug === slug);
              if (person) {
                entityList.push({ slug, name: person.name, type: "person", snippets: ppExtractSnippets(transcript, person.searchTerms) });
              }
            }
            for (const slug of matchedCompanySlugs) {
              const company = ENTITY_COMPANIES.find(c => c.slug === slug);
              if (company) {
                const allTerms = [...company.searchTerms, ...(company.associatedTerms || [])];
                entityList.push({ slug, name: company.name, type: "company", snippets: ppExtractSnippets(transcript, allTerms) });
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

Bad examples (too generic):
- "Discussed as an example of varied paths to success."
- "Referenced for his unique approach to angel investing."

Podcast: ${podcastName}
Episode: "${episodeTitle}"

Entities with transcript excerpts:
${entityDescriptions}

Respond with JSON: { "slug": "summary sentence", ... }
Use these exact slugs: ${entityList.map(e => e.slug).join(', ')}`
                  }],
                  max_tokens: 2000,
                  temperature: 0.3,
                  response_format: { type: "json_object" },
                });
                const { logCompletionUsage: logCtx } = await import("./apiUsageTracker");
                logCtx(aiResp, "gpt-4o-mini", "entity_context");

                const content = aiResp.choices[0]?.message?.content;
                if (content) {
                  const entityContexts = JSON.parse(content);
                  if (Object.keys(entityContexts).length > 0) {
                    await pool.query(
                      `UPDATE landing_page_recaps SET entity_contexts_cache = $1 WHERE id = $2`,
                      [JSON.stringify(entityContexts), opts.recapId]
                    );
                    console.log(`[PostProcess] Cached entity contexts for "${episodeTitle}" (${Object.keys(entityContexts).length} entities)`);
                  }
                }
              } catch (err) {
                console.warn(`[PostProcess] Entity context generation failed for "${episodeTitle}":`, err);
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[PostProcess] Entity cache check failed for "${episodeTitle}":`, err);
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

        const { searchSpotifyEpisode } = await import("./spotifyClient");
        const spotifyEpisodeUrl = await searchSpotifyEpisode(podcastName, epTitle) || "";
        const upsertedRecap = await storage.upsertLandingPageRecap({
          slug: podcastSlug,
          itunesId,
          podcastName,
          episodeTitle: epTitle,
          episodeSlug: epSlug,
          publishDate,
          duration: durationStr,
          artworkUrl: t.image_url || podcastArtwork,
          hosts,
          tldl: recap.tldl,
          whatHappened: recap.whatHappened,
          keyInsights: recap.keyInsights,
          quote: recap.quote,
          quoteAttribution: recap.quoteAttribution,
          keyTopics: recap.keyTopics,
          topicContexts: recap.topicContexts ? JSON.stringify(recap.topicContexts) : null,
          topQuestions: recap.topQuestions ? JSON.stringify(recap.topQuestions) : null,
          audioUrl: t.audio_url || "",
          sponsors: recap.sponsors ? JSON.stringify(recap.sponsors) : "[]",
          guests: recap.guests ? JSON.stringify(recap.guests) : "[]",
          resources: recap.resources ? JSON.stringify(recap.resources) : "[]",
          spotifyEpisodeUrl,
          published: true,
        });
        const newRecapId = upsertedRecap.id;

        await postProcessRecap({
          transcript: t.transcript,
          podcastSlug, episodeSlug: upsertedRecap.episodeSlug, podcastName, episodeTitle: epTitle,
          itunesId, hosts,
          guests: recap.guests || null,
          resources: recap.resources || null,
          recapId: newRecapId,
          extractedQuotes: recap.extractedQuotes || null,
        });

        const canonicalEpSlug = upsertedRecap.episodeSlug;
        const quoteCount = (await storage.getEpisodeQuotes(podcastSlug, canonicalEpSlug)).length;
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
          await pool.query(`DELETE FROM episode_quotes WHERE podcast_slug = $1 AND episode_slug = $2`, [podcastSlug, canonicalEpSlug]);
          await pool.query(`DELETE FROM landing_page_recaps WHERE slug = $1 AND episode_slug = $2`, [podcastSlug, canonicalEpSlug]);
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
          let bulkSpotifyUrl = r.spotify_episode_url || "";
          if (!bulkSpotifyUrl || bulkSpotifyUrl.includes('/search/')) {
            const { searchSpotifyEpisode } = await import("./spotifyClient");
            bulkSpotifyUrl = await searchSpotifyEpisode(r.podcast_name || "", r.episode_title || "") || "";
          }
          await storage.upsertLandingPageRecap({
            slug: r.slug,
            itunesId: r.itunes_id,
            podcastName: r.podcast_name,
            episodeTitle: r.episode_title,
            episodeSlug: r.episode_slug,
            publishDate: r.publish_date,
            duration: r.duration,
            artworkUrl: r.artwork_url,
            hosts: r.hosts,
            tldl: r.tldl,
            whatHappened: r.what_happened,
            keyInsights: r.key_insights,
            quote: r.quote,
            quoteAttribution: r.quote_attribution,
            keyTopics: r.key_topics,
            topicContexts: r.topic_contexts,
            topQuestions: r.top_questions,
            audioUrl: r.audio_url,
            sponsors: r.sponsors,
            guests: r.guests,
            resources: r.resources,
            spotifyEpisodeUrl: bulkSpotifyUrl,
            published: true,
          });
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
              recapId: row.id,
              extractedQuotes: recap.extractedQuotes || null,
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
          from: `PodRise <${fromEmail}>`,
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
          from: `PodRise <${fromEmail}>`,
          to: email,
          subject: "Your PodRise Podcaster Login Link",
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
      const systemPrompt = `You are PodRise's AI assistant. You help users understand podcast episodes better. You have access to ${hasTranscript ? "the full transcript and a detailed recap" : "a detailed recap"} of this episode. Answer questions based on what was actually discussed in the episode. Be conversational, specific, and reference actual points from the episode. Keep answers concise (2-4 sentences for simple questions, up to a short paragraph for complex ones).${entityFocus}

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
      const { logCompletionUsage } = await import("./apiUsageTracker");
      logCompletionUsage(completion, "gpt-4o-mini", "episode_chat");

      const answer = completion.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
      res.json({ answer });
    } catch (err) {
      console.error("[EpisodeChat] Error:", err);
      res.status(500).json({ error: "Failed to generate response" });
    }
  });

  async function validateUrl(url: string): Promise<boolean> {
    if (!url || !url.startsWith("http")) return false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PodRise/1.0)" },
      });
      clearTimeout(timeout);
      if (res.ok) return true;
      if (res.status === 405) {
        const getRes = await fetch(url, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
          redirect: "follow",
          headers: { "User-Agent": "Mozilla/5.0 (compatible; PodRise/1.0)" },
        });
        return getRes.ok;
      }
      return false;
    } catch {
      return false;
    }
  }

  const { resolveProductImage } = await import("./productImageResolver");

  app.post("/api/admin/extract-products", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const episodeLimit = parseInt(req.body.episodeLimit as string) || 25;
      const podcastSlug = (req.body.podcastSlug as string) || "myfirstmillion";

      const SLUG_TO_ITUNES: Record<string, string> = {
        myfirstmillion: "1469759170",
        allin: "1502871393",
        biggerpockets: "594419649",
        callherdaddy: "1418960261",
        hubermanlab: "1545953110",
        pivot: "1073226719",
        garyvee: "928159684",
        peterattia: "1400828889",
        timferriss: "863897795",
        ultimatehuman: "1709740887",
      };
      const itunesId = SLUG_TO_ITUNES[podcastSlug];
      if (!itunesId) return res.status(400).json({ message: `Unknown podcast slug: ${podcastSlug}` });

      const { rows: episodes } = await pool.query(
        `SELECT DISTINCT ON (episode_title) id, episode_title, transcript, date_published
         FROM episode_transcripts
         WHERE podcast_id = $1
         ORDER BY episode_title, date_published DESC NULLS LAST
         LIMIT $2`,
        [itunesId, episodeLimit]
      );

      if (!episodes.length) return res.json({ products: [], episodes: [], transcriptCoverage: "0%" });

      const OpenAI = (await import("openai")).default;
      const directOpenai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const { processFullTranscript } = await import("./transcriptChunker");
      const allProducts: any[] = [];

      const { rows: approvedExamples } = await pool.query(
        `SELECT name, company, description, mention_type, category FROM extracted_products WHERE status = 'approved' ORDER BY reviewed_at DESC LIMIT 20`
      );
      const { rows: rejectedExamples } = await pool.query(
        `SELECT name, company, rejection_reason, category FROM extracted_products WHERE status = 'rejected' ORDER BY reviewed_at DESC LIMIT 30`
      );

      let trainingSection = "";
      if (approvedExamples.length > 0 || rejectedExamples.length > 0) {
        trainingSection = "\n\nLEARN FROM PAST DECISIONS:\n";
        if (approvedExamples.length > 0) {
          trainingSection += "These items were APPROVED by our editor — extract similar ones:\n";
          trainingSection += approvedExamples.map(p => `  ✓ ${p.name}${p.company ? ` (${p.company})` : ""} [${p.category}] — ${p.description || ""}`).join("\n");
          trainingSection += "\n";
        }
        if (rejectedExamples.length > 0) {
          trainingSection += "These items were REJECTED — do NOT extract items like these:\n";
          trainingSection += rejectedExamples.map(p => `  ✗ ${p.name}${p.company ? ` (${p.company})` : ""} [${p.category}]${p.rejection_reason ? ` [reason: ${p.rejection_reason}]` : ""}`).join("\n");
          trainingSection += "\n";
        }
      }

      const extractionPrompt = `You find PRODUCTS, SERVICES, TOOLS, APPS, and EXPERIENCES mentioned by podcast hosts and guests. Extract ALL mention types in a single pass — including genuine endorsements, ad reads, and sponsorships. Classify each mention accurately.

CATEGORIES — assign each item one of these:
- "physical_product" — tangible, shippable items (electronics, fitness gear, kitchen tools, clothing, supplements with specific brand names like AG1)
- "service_or_tool" — digital services, apps, platforms, SaaS tools (Mercury, Notion, GoodRx, Calm, etc.)
- "experience" — places to visit, events to attend, restaurants, retreats, memberships (Soho House, Burning Man, specific restaurants, etc.)

THE CRITICAL AD-DETECTION TEST:
Before extracting, determine whether the mention is a GENUINE personal endorsement, a PAID ADVERTISEMENT/SPONSORSHIP, or a general discussion. Classify each mention accurately using the mentionType field.

AD/SPONSOR INDICATOR PHRASES — if ANY of these appear near the mention, classify as "ad_read" or "sponsorship":

1. Direct Sponsor Introductions (use mentionType: "sponsorship"):
- "this episode is sponsored by"
- "today's sponsor"
- "today's episode is brought to you by"
- "this podcast is brought to you by"
- "this episode is powered by"
- "we want to thank our sponsor"
- "our sponsor today is"
- "support for this show comes from"
- "this episode is made possible by"

2. Host Transition Phrases into ad breaks (use mentionType: "ad_read"):
- "quick word from our sponsor"
- "let's take a quick break"
- "before we continue" (followed by brand pitch)
- "real quick before we get back"
- "we'll be right back"
- "quick break to thank our sponsor"
- "now a message from our sponsor"
- "we'll take a short break"

3. Discount / Offer Language (use mentionType: "ad_read"):
- "use code", "promo code", "discount code"
- "special offer", "get X percent off"
- "free trial", "start your free trial"
- "visit [brand].com", "go to [brand].com/[podcast]"
- "link in the description"
- "exclusive offer for listeners"

4. Ad Closing Signals:
- "now back to the show"
- "back to the episode"
- "let's get back to the conversation"
- "thanks again to our sponsor"
- "thanks to our sponsor"

Signs of an AD READ (mentionType: "ad_read"):
- Sounds like a scripted sales pitch with specific offers, discount codes, or promotional language
- The speaker reads a prepared description that sounds like marketing copy
- The endorsement feels forced, overly detailed, or reads like a commercial break
- Example AD: "I use it myself for not one, not two, but I have eight different Mercury accounts... I highly, highly recommend it. Like I said, I use it myself." — This READS LIKE AN AD with exaggerated enthusiasm and repetitive "I use it myself" framing

Signs of a SPONSORSHIP (mentionType: "sponsorship"):
- "This episode is brought to you by...", "Thanks to our sponsor...", "This episode is sponsored by..."
- Product is mentioned in a dedicated ad segment at the start or end of the episode
- Includes promo codes, special URLs, or discount offers

Signs of a GENUINE/ORGANIC endorsement (mentionType: "organic" or "personal_use"):
- Comes up naturally in conversation, not as a segment break
- The speaker shares a specific personal story or experience with the product
- Mentioned casually alongside other topics, not as a dedicated pitch
- The endorsement has nuance — they mention both positives and limitations
- Example GENUINE: "Yeah I just switched to that standing desk from FlexiSpot and my back has been way better. Cost me like $300 on Amazon."
- Use "personal_use" when the host/guest explicitly says they personally use or own it
- Use "organic" for natural recommendations or endorsements without personal ownership claims

Signs of a DISCUSSION (mentionType: "discussion"):
- The product is discussed as a topic of conversation but without a clear endorsement or recommendation
- Mentioned in passing, as context, or as part of a broader discussion

MENTION TYPE CLASSIFICATION:
Always classify the mentionType — even for ads and sponsorships. Extract ALL product mentions and classify them accurately. This helps admins review and filter products.

DO NOT EXTRACT:
- Generic categories without specific brand names ("liver supplements", "standing desks" without a brand)
- Books, ebooks, audiobooks (tracked separately)
- Companies discussed only as business cases or investments, not as products to use
- Stocks, ETFs, crypto, investment vehicles
- Social media platforms mentioned casually
- Well-known megabrands without specific product discussion (just "Apple" or "Nike")
- Companies mentioned only because of their founder or business story
- Medications, weapons, alcohol, or heavily regulated items

CONTEXT REQUIREMENT — THIS IS THE MOST IMPORTANT FIELD:
For the "context" field, write 3-5 sentences explaining WHY the hosts/guests use or recommend this product. Do NOT restate what the product or company is — that info is already displayed separately in the UI. Focus on: what drew them to it, what problem it solves for them, what they specifically said about it, and any concrete results or opinions they shared. Do NOT copy raw transcript text. Write as a clean editorial summary.

BAD context (raw transcript copy): "Yeah, yeah. My friend's got a very, very interesting startup called Wild Type, which is like sustainable sushi grade salmon. So basically that's like cultivated seafood."

BAD context (restates what it is): "Wild Type produces lab-grown sushi-grade salmon that eliminates the need for traditional fishing or farming. The hosts noted..."

GOOD context: "The hosts said they are fans of this company and its approach to producing sustainable, lab-grown sushi-grade salmon using cultivated seafood technology. By eliminating the need for traditional fishing or ocean farming, they viewed it as a promising solution to overfishing and damage to marine ecosystems. They noted that innovations like this could allow people to enjoy sushi without the environmental cost, and highlighted that the company's first product is already being served."

QUALITY BAR: We want 0-8 items per episode across ALL categories and mention types. Many episodes will have ZERO qualifying items — that's perfectly fine. Extract both genuine endorsements AND sponsored/ad products — classify each accurately using mentionType so admins can review them.

For each qualifying item, return:
- name: the specific product/service/experience name (e.g. "Vitamix A3500" not just "blender")
- company: the company/brand behind it
- description: 1 sentence explaining what it is and why it's interesting
- purchaseUrl: the best URL to buy/visit (prefer Amazon for physical products)
- context: 3-5 sentences explaining WHY they use/recommend it — do NOT restate what the product is. Focus on their reasons, opinions, and specific experiences.
- mentionType: "organic" | "personal_use" | "ad_read" | "sponsorship" | "discussion"
- category: "physical_product" | "service_or_tool" | "experience"

Return JSON: {"products": [...]}. Empty array is completely fine.${trainingSection}`;

      let totalCharsProcessed = 0;
      let totalCharsAvailable = 0;
      let totalUrlsSkipped = 0;

      for (const ep of episodes) {
        const fullTranscript = (ep.transcript || "").trim();
        if (!fullTranscript) continue;
        totalCharsAvailable += fullTranscript.length;

        const { rows: recapRows } = await pool.query(
          `SELECT episode_slug FROM landing_page_recaps WHERE slug = $1 AND episode_title = $2 LIMIT 1`,
          [podcastSlug, ep.episode_title]
        );
        const episodeSlug = recapRows[0]?.episode_slug || null;

        const { results: chunkProducts, coverage } = await processFullTranscript<any>(
          fullTranscript,
          async (chunk, chunkIndex, totalChunks) => {
            const completion = await directOpenai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: extractionPrompt },
                {
                  role: "user",
                  content: `Extract all products, services, tools, and experiences mentioned by hosts/guests — including genuine endorsements, ad reads, and sponsorships. Classify each with the correct mentionType. For the context field, write a 3-5 sentence editorial summary of WHY they mention/use/recommend it, what problem it solves, and what makes it stand out. Do NOT copy raw transcript text - rewrite it as a clean, professional summary.\n\nEpisode: "${ep.episode_title}"\nSegment ${chunkIndex + 1} of ${totalChunks} (${chunk.length} chars):\n\n${chunk}`
                }
              ],
              max_tokens: 4500,
              temperature: 0.2,
              response_format: { type: "json_object" },
            });

            const raw = completion.choices[0]?.message?.content || "{}";
            try {
              const parsed = JSON.parse(raw);
              return Array.isArray(parsed) ? parsed : (parsed.products || []);
            } catch (e) {
              console.error("[ProductExtract] JSON parse error for episode chunk:", ep.episode_title, chunkIndex, e);
              return [];
            }
          }
        );
        totalCharsProcessed += coverage.totalChars;

        const deduped = new Map<string, any>();
        for (const p of chunkProducts) {
          const key = (p.name || "").toLowerCase().trim();
          if (key && !deduped.has(key)) {
            deduped.set(key, p);
          }
        }

        for (const p of deduped.values()) {
          const rawUrl = (p.purchaseUrl || "").trim();
          if (rawUrl) {
            const urlValid = await validateUrl(rawUrl);
            if (!urlValid) {
              console.log(`[ProductExtract] Skipping "${p.name}" — URL dead: ${rawUrl}`);
              totalUrlsSkipped++;
              continue;
            }
          }

          const validCategories = ["physical_product", "service_or_tool", "experience"];
          const category = validCategories.includes(p.category) ? p.category : "physical_product";

          const product = {
            name: p.name || "",
            company: p.company || null,
            description: p.description || null,
            purchaseUrl: rawUrl || null,
            context: p.context || null,
            mentionType: ["organic", "personal_use", "ad_read", "sponsorship", "discussion"].includes(p.mentionType) ? p.mentionType : (p.mentionType === "recommendation" ? "organic" : "personal_use"),
            category,
            episodeTitle: ep.episode_title,
            episodeSlug,
            podcastSlug,
          };

          const { isLikelySponsorProduct } = await import("./productFilter");
          const filterResult = isLikelySponsorProduct(product);
          const initialStatus = filterResult.isFiltered ? "rejected" : "pending";

          let imageUrl: string | null = null;
          if (!filterResult.isFiltered && product.purchaseUrl) {
            imageUrl = await resolveProductImage(product.purchaseUrl);
          }

          const existing = await pool.query(
            `SELECT id FROM extracted_products WHERE LOWER(name) = LOWER($1) AND episode_title = $2`,
            [product.name, product.episodeTitle]
          );
          if (existing.rows.length === 0) {
            const ins = await pool.query(
              `INSERT INTO extracted_products (name, company, description, purchase_url, image_url, context, mention_type, category, episode_title, episode_slug, podcast_slug, status, rejection_reason)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
              [product.name, product.company, product.description, product.purchaseUrl, imageUrl, product.context, product.mentionType, product.category, product.episodeTitle, product.episodeSlug, product.podcastSlug, initialStatus, filterResult.reason]
            );
            allProducts.push({ ...product, id: ins.rows[0].id, imageUrl, status: initialStatus });
          }
        }
      }

      if (totalUrlsSkipped > 0) console.log(`[ProductExtract] Total skipped ${totalUrlsSkipped} items with dead URLs`);

      const coveragePct = totalCharsAvailable > 0
        ? Math.round((totalCharsProcessed / totalCharsAvailable) * 100)
        : 0;

      const { rows: allSaved } = await pool.query(
        `SELECT * FROM extracted_products ORDER BY extracted_at DESC`
      );

      res.json({
        products: allSaved,
        newCount: allProducts.length,
        episodeCount: episodes.length,
        transcriptCoverage: `${coveragePct}%`,
        totalCharsProcessed,
        totalCharsAvailable,
        urlsSkipped: totalUrlsSkipped,
      });
    } catch (err: any) {
      console.error("[ProductExtract] Error:", err);
      res.status(500).json({ message: err?.message || "Failed to extract products" });
    }
  });

  app.post("/api/admin/products/backfill-images", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { rows } = await pool.query(
        `SELECT id, name, purchase_url FROM extracted_products WHERE image_url IS NULL AND purchase_url IS NOT NULL AND purchase_url != ''`
      );
      let updated = 0;
      for (const row of rows) {
        const imageUrl = await resolveProductImage(row.purchase_url);
        if (imageUrl) {
          await pool.query(`UPDATE extracted_products SET image_url = $1 WHERE id = $2`, [imageUrl, row.id]);
          updated++;
        }
      }
      shopCache.invalidate();
      res.json({ message: `Backfilled images for ${updated}/${rows.length} products`, updated, total: rows.length });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to backfill images" });
    }
  });

  app.delete("/api/admin/products/all", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { rowCount } = await pool.query(`DELETE FROM extracted_products`);
      res.json({ message: `Deleted ${rowCount} products`, count: rowCount });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to delete products" });
    }
  });

  app.get("/api/admin/products", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const filter = req.query.filter || "all";
      let conditions: string[] = [];
      if (filter === "pending") conditions.push("status = 'pending'");
      else if (filter === "approved") conditions.push("status = 'approved'");
      else if (filter === "rejected") conditions.push("status = 'rejected'");

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const { rows } = await pool.query(
        `SELECT *, image_status FROM extracted_products ${where} ORDER BY extracted_at DESC`
      );
      const { rows: statsRows } = await pool.query(
        `SELECT status, COUNT(*)::int as count FROM extracted_products GROUP BY status`
      );
      const stats: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
      for (const r of statsRows) stats[r.status] = r.count;
      const { rows: imgStatsRows } = await pool.query(
        `SELECT image_status, COUNT(*)::int as count FROM extracted_products WHERE status = 'approved' GROUP BY image_status`
      );
      const imageStats: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
      for (const r of imgStatsRows) imageStats[r.image_status] = r.count;
      res.json({ products: rows, stats, imageStats });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to load products" });
    }
  });

  app.post("/api/admin/products/approve", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "No ids provided" });
      await pool.query(
        `UPDATE extracted_products SET status = 'approved', reviewed_at = NOW() WHERE id = ANY($1)`,
        [ids]
      );
      shopCache.invalidate();
      res.json({ message: `${ids.length} product(s) approved` });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to approve" });
    }
  });

  app.post("/api/admin/products/reject", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { ids, reason } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "No ids provided" });
      await pool.query(
        `UPDATE extracted_products SET status = 'rejected', rejection_reason = $2, reviewed_at = NOW() WHERE id = ANY($1)`,
        [ids, reason || "not_relevant"]
      );
      shopCache.invalidate();
      res.json({ message: `${ids.length} product(s) rejected` });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to reject" });
    }
  });

  app.get("/api/admin/products/:id/transcript-excerpt", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const productId = parseInt(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) return res.status(400).json({ message: "Invalid product ID" });
      const { rows } = await pool.query(
        `SELECT ep.name, ep.company, ep.episode_title, ep.episode_slug, ep.podcast_slug
         FROM extracted_products ep WHERE ep.id = $1`, [productId]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Product not found" });
      const product = rows[0];

      let transcriptRows: any[] = [];
      const { rows: r1 } = await pool.query(
        `SELECT et.transcript FROM episode_transcripts et
         JOIN podcast_directory pd ON pd.itunes_id::text = et.podcast_id
         WHERE pd.slug = $1 AND et.episode_title = $2 LIMIT 1`,
        [product.podcast_slug, product.episode_title]
      );
      transcriptRows = r1;

      if (transcriptRows.length === 0 && product.episode_slug) {
        const { rows: r2 } = await pool.query(
          `SELECT et.transcript FROM episode_transcripts et
           JOIN podcast_directory pd ON pd.itunes_id::text = et.podcast_id
           WHERE pd.slug = $1 AND LOWER(et.episode_title) LIKE $2 LIMIT 1`,
          [product.podcast_slug, `%${product.episode_slug.replace(/-/g, '%')}%`]
        );
        transcriptRows = r2;
      }

      if (transcriptRows.length === 0) {
        const { rows: r3 } = await pool.query(
          `SELECT et.transcript FROM episode_transcripts et
           JOIN podcast_directory pd ON pd.itunes_id::text = et.podcast_id
           WHERE pd.slug = $1 AND LOWER(et.episode_title) LIKE LOWER($2) LIMIT 1`,
          [product.podcast_slug, `%${product.episode_title.substring(0, 40)}%`]
        );
        transcriptRows = r3;
      }

      if (transcriptRows.length === 0) return res.json({ excerpt: null, message: "Transcript not found" });

      const transcript = transcriptRows[0].transcript || "";
      const searchTerms = [product.name, product.company].filter(Boolean);
      let bestStart = -1;
      let matchedTerm = "";
      for (const term of searchTerms) {
        const idx = transcript.toLowerCase().indexOf(term.toLowerCase());
        if (idx !== -1 && (bestStart === -1 || idx < bestStart)) {
          bestStart = idx;
          matchedTerm = term;
        }
      }
      if (bestStart === -1) return res.json({ excerpt: null, message: "Product mention not found in transcript" });

      const contextChars = 3500;
      const start = Math.max(0, bestStart - contextChars);
      const end = Math.min(transcript.length, bestStart + matchedTerm.length + contextChars);
      const excerpt = transcript.slice(start, end);

      const introOutroChars = 3000;
      const searchTermsLower = searchTerms.map(t => t.toLowerCase());
      const introText = transcript.slice(0, introOutroChars);
      const outroText = transcript.slice(Math.max(0, transcript.length - introOutroChars));
      const introHasMatch = searchTermsLower.some(t => introText.toLowerCase().includes(t));
      const outroHasMatch = searchTermsLower.some(t => outroText.toLowerCase().includes(t));
      const intro = introHasMatch ? introText : null;
      const outro = outroHasMatch ? outroText : null;

      res.json({ excerpt, matchedTerm, startOffset: start, productName: product.name, company: product.company, intro, outro });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch excerpt" });
    }
  });

  app.post("/api/admin/products/:id/ai-check", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const productId = parseInt(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) return res.status(400).json({ message: "Invalid product ID" });
      const { rows } = await pool.query(
        `SELECT ep.name, ep.company, ep.context, ep.episode_title, ep.episode_slug, ep.podcast_slug
         FROM extracted_products ep WHERE ep.id = $1`, [productId]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Product not found" });
      const product = rows[0];

      let transcriptRows: any[] = [];
      const { rows: r1 } = await pool.query(
        `SELECT et.transcript FROM episode_transcripts et
         JOIN podcast_directory pd ON pd.itunes_id::text = et.podcast_id
         WHERE pd.slug = $1 AND et.episode_title = $2 LIMIT 1`,
        [product.podcast_slug, product.episode_title]
      );
      transcriptRows = r1;

      if (transcriptRows.length === 0 && product.episode_slug) {
        const { rows: r2 } = await pool.query(
          `SELECT et.transcript FROM episode_transcripts et
           JOIN podcast_directory pd ON pd.itunes_id::text = et.podcast_id
           WHERE pd.slug = $1 AND LOWER(et.episode_title) LIKE $2 LIMIT 1`,
          [product.podcast_slug, `%${product.episode_slug.replace(/-/g, '%')}%`]
        );
        transcriptRows = r2;
      }

      if (transcriptRows.length === 0) {
        const { rows: r3 } = await pool.query(
          `SELECT et.transcript FROM episode_transcripts et
           JOIN podcast_directory pd ON pd.itunes_id::text = et.podcast_id
           WHERE pd.slug = $1 AND LOWER(et.episode_title) LIKE LOWER($2) LIMIT 1`,
          [product.podcast_slug, `%${product.episode_title.substring(0, 40)}%`]
        );
        transcriptRows = r3;
      }

      let excerptForAI = product.context || "";
      if (transcriptRows.length > 0) {
        const transcript = transcriptRows[0].transcript || "";
        const searchTerms = [product.name, product.company].filter(Boolean);
        for (const term of searchTerms) {
          const idx = transcript.toLowerCase().indexOf(term.toLowerCase());
          if (idx !== -1) {
            const start = Math.max(0, idx - 800);
            const end = Math.min(transcript.length, idx + term.length + 800);
            excerptForAI = transcript.slice(start, end);
            break;
          }
        }
      }

      if (!excerptForAI) {
        return res.json({ verdict: "unknown", confidence: 0, reason: "No transcript or context available to analyze" });
      }

      const OpenAI = (await import("openai")).default;
      const directOpenai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const aiResp = await directOpenai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: `Analyze this transcript excerpt and determine if the mention of "${product.name}"${product.company ? ` by ${product.company}` : ''} is:
1. A GENUINE recommendation/endorsement (the speaker personally uses or loves it)
2. A PAID AD/SPONSOR read (includes phrases like "sponsored by", "use code", "promo code", "brought to you by", "special offer", discount codes, affiliate links)
3. A BRIEF MENTION (just mentioned in passing, not a real endorsement)

Transcript excerpt:
"${excerptForAI}"

Respond with JSON: {"verdict": "genuine"|"ad"|"brief_mention", "confidence": 0.0-1.0, "reason": "1-2 sentence explanation"}`
        }],
        max_tokens: 200,
        temperature: 0.1,
        response_format: { type: "json_object" },
      });

      const content = aiResp.choices[0]?.message?.content;
      if (content) {
        try {
          const parsed = JSON.parse(content.trim());
          const validVerdicts = ["genuine", "ad", "brief_mention"];
          const verdict = validVerdicts.includes(parsed.verdict) ? parsed.verdict : "unknown";
          const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;
          const reason = typeof parsed.reason === "string" ? parsed.reason.substring(0, 300) : "No explanation provided";
          res.json({ verdict, confidence, reason });
        } catch {
          res.json({ verdict: "unknown", confidence: 0, reason: "AI returned an unparseable response" });
        }
      } else {
        res.json({ verdict: "unknown", confidence: 0, reason: "AI did not return a response" });
      }
    } catch (err: any) {
      res.json({ verdict: "unknown", confidence: 0, reason: "AI check failed — try again" });
    }
  });

  app.get("/api/admin/products/images", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const imageFilter = req.query.filter || "all";
      let conditions: string[] = ["status = 'approved'"];
      if (imageFilter === "pending") conditions.push("image_status = 'pending'");
      else if (imageFilter === "approved") conditions.push("image_status = 'approved'");
      else if (imageFilter === "rejected") conditions.push("image_status = 'rejected'");

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const { rows } = await pool.query(
        `SELECT id, name, company, image_url, image_status, purchase_url, category FROM extracted_products ${where} ORDER BY name`
      );
      const { rows: statsRows } = await pool.query(
        `SELECT image_status, COUNT(*)::int as count FROM extracted_products WHERE status = 'approved' GROUP BY image_status`
      );
      const stats: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
      for (const r of statsRows) stats[r.image_status] = r.count;
      res.json({ products: rows, stats });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to load product images" });
    }
  });

  app.post("/api/admin/products/image-approve", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "No ids provided" });
      const { rowCount } = await pool.query(
        `UPDATE extracted_products SET image_status = 'approved' WHERE id = ANY($1) AND image_url IS NOT NULL AND image_url != ''`,
        [ids]
      );
      shopCache.invalidate();
      res.json({ message: `${rowCount} product image(s) approved (skipped ${ids.length - (rowCount || 0)} without images)` });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to approve images" });
    }
  });

  app.post("/api/admin/products/image-reject", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "No ids provided" });
      await pool.query(
        `UPDATE extracted_products SET image_status = 'rejected' WHERE id = ANY($1)`,
        [ids]
      );
      shopCache.invalidate();
      res.json({ message: `${ids.length} product image(s) rejected` });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to reject images" });
    }
  });

  app.post("/api/admin/products/image-update", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { id, imageUrl } = req.body;
      if (!id || !imageUrl) return res.status(400).json({ message: "id and imageUrl required" });
      await pool.query(
        `UPDATE extracted_products SET image_url = $1, image_status = 'approved' WHERE id = $2`,
        [imageUrl, id]
      );
      shopCache.invalidate();
      res.json({ message: "Product image updated and approved" });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to update image" });
    }
  });

  app.post("/api/admin/products/summarize-contexts", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { rows } = await pool.query(
        `SELECT id, name, company, context, episode_title, podcast_slug FROM extracted_products
         WHERE status = 'approved' AND context IS NOT NULL AND context != '' AND (context_summary IS NULL OR btrim(context_summary) = '')
         ORDER BY id LIMIT 20`
      );

      if (rows.length === 0) {
        return res.json({ message: "No products need summarization", summarized: 0 });
      }

      const OpenAI = (await import("openai")).default;
      const directOpenai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      let summarized = 0;

      for (const product of rows) {
        try {
          const aiResp = await directOpenai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
              role: "system",
              content: `You are a podcast editorial writer. Summarize why a podcast host talked about a product/service. Write in third person, editorial style. Be concise (2-4 sentences). Focus on WHY they recommended it and what makes it valuable. Do NOT use quotes from the transcript. Write as if for a product page describing what podcasters say about it. Highlight key benefits mentioned.`
            }, {
              role: "user",
              content: `Product: ${product.name}${product.company ? ` by ${product.company}` : ''}
Podcast: ${product.podcast_slug}
Episode: ${product.episode_title}

Raw transcript context:
"${(product.context || "").slice(0, 2000)}"

Write a polished 2-4 sentence editorial summary of why the podcast host recommended/discussed this product.`
            }],
            max_tokens: 300,
            temperature: 0.4,
          });

          const summary = aiResp.choices[0]?.message?.content?.trim();
          if (summary) {
            await pool.query(
              `UPDATE extracted_products SET context_summary = $1 WHERE id = $2`,
              [summary, product.id]
            );
            summarized++;
          }
        } catch (err: any) {
          console.warn(`[ContextSummary] Failed for product ${product.id} (${product.name}):`, err.message);
        }
      }

      shopCache.invalidate();
      res.json({ message: `Summarized ${summarized}/${rows.length} product contexts`, summarized, total: rows.length });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to summarize contexts" });
    }
  });

  const uploadsDir = path.resolve("public/uploads");
  mkdirSync(uploadsDir, { recursive: true });

  const ALLOWED_IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];
  const ALLOWED_MIMETYPES = ["image/jpeg", "image/png", "image/webp"];

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadsDir),
      filename: (_req, file, cb) => {
        let ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_IMAGE_EXTS.includes(ext)) ext = ".jpg";
        const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
        cb(null, uniqueName);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIMETYPES.includes(file.mimetype)) cb(null, true);
      else cb(new Error("Only JPG, PNG, and WebP images are allowed"));
    },
  });

  const adminUploadAuth = (req: any, res: any, next: any) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    next();
  };

  app.get("/api/admin/shop-items", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { rows: productRows } = await pool.query(
        `SELECT id, name, company, description, purchase_url, image_url, category, status, image_status
         FROM extracted_products ORDER BY name ASC`
      );
      const { rows: bookRows } = await pool.query(
        `SELECT id, book_title, author, description, amazon_url, slug, has_cover, cover_approved,
                publisher, publish_year, rating, isbn, topics, categories
         FROM book_enrichments WHERE slug IS NOT NULL ORDER BY book_title ASC`
      );

      const items: any[] = [];

      for (const p of productRows) {
        items.push({
          id: p.id,
          type: "product",
          name: p.name,
          company: p.company,
          description: p.description,
          url: p.purchase_url,
          image_url: p.image_url,
          category: p.category,
          status: p.status,
          image_status: p.image_status,
          extra: {},
        });
      }

      for (const b of bookRows) {
        const bookStatus = b.cover_approved === true ? "approved" : b.cover_approved === false ? "rejected" : "pending";
        items.push({
          id: b.id,
          type: "book",
          name: b.book_title,
          company: b.author,
          description: b.description,
          url: b.amazon_url,
          image_url: b.has_cover ? `/books/${b.slug}.jpg` : null,
          category: (b.categories && b.categories.length > 0) ? b.categories[0] : (b.topics && b.topics.length > 0 ? b.topics[0] : null),
          status: bookStatus,
          image_status: null,
          extra: { slug: b.slug, publisher: b.publisher, publish_year: b.publish_year, rating: b.rating, isbn: b.isbn },
        });
      }

      const stats = {
        total: items.length,
        books: bookRows.length,
        products: productRows.length,
        approved: items.filter(i => i.status === "approved").length,
        pending: items.filter(i => i.status === "pending").length,
        rejected: items.filter(i => i.status === "rejected").length,
      };

      res.json({ items, stats });
    } catch (err: any) {
      console.error("[ShopItems] Error:", err);
      res.status(500).json({ message: err?.message || "Failed to load shop items" });
    }
  });

  app.post("/api/admin/shop-items/:type/:id/update", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { type, id } = req.params;
      const { name, description, url, imageUrl } = req.body;
      const numId = parseInt(id, 10);
      if (!numId || (type !== "product" && type !== "book")) {
        return res.status(400).json({ message: "Invalid type or id" });
      }

      if (type === "product") {
        const sets: string[] = [];
        const vals: any[] = [];
        let idx = 1;
        if (name !== undefined) { sets.push(`name = $${idx++}`); vals.push(name); }
        if (description !== undefined) { sets.push(`description = $${idx++}`); vals.push(description); }
        if (url !== undefined) { sets.push(`purchase_url = $${idx++}`); vals.push(url); }
        if (imageUrl !== undefined) {
          sets.push(`image_url = $${idx++}`); vals.push(imageUrl);
          sets.push(`image_status = $${idx++}`); vals.push("approved");
        }
        if (sets.length > 0) {
          vals.push(numId);
          await pool.query(`UPDATE extracted_products SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
          shopCache.invalidate();
        }
      } else {
        const sets: string[] = [];
        const vals: any[] = [];
        let idx = 1;
        if (name !== undefined) { sets.push(`book_title = $${idx++}`); vals.push(name); }
        if (description !== undefined) { sets.push(`description = $${idx++}`); vals.push(description); }
        if (url !== undefined) { sets.push(`amazon_url = $${idx++}`); vals.push(url); }
        if (sets.length > 0) {
          sets.push(`updated_at = NOW()`);
          vals.push(numId);
          await pool.query(`UPDATE book_enrichments SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
        }
      }

      res.json({ message: `${type} updated successfully` });
    } catch (err: any) {
      console.error("[ShopItems] Update error:", err);
      res.status(500).json({ message: err?.message || "Failed to update item" });
    }
  });

  app.post("/api/admin/shop-items/:type/:id/status", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { type, id } = req.params;
      const { status } = req.body;
      const numId = parseInt(id, 10);
      if (!numId || (type !== "product" && type !== "book")) {
        return res.status(400).json({ message: "Invalid type or id" });
      }
      if (!["approved", "pending", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      if (type === "product") {
        await pool.query(
          `UPDATE extracted_products SET status = $1, image_status = $1 WHERE id = $2`,
          [status, numId]
        );
        shopCache.invalidate();
      } else {
        const coverApproved = status === "approved" ? true : status === "rejected" ? false : null;
        await pool.query(
          `UPDATE book_enrichments SET cover_approved = $1, updated_at = NOW() WHERE id = $2`,
          [coverApproved, numId]
        );
      }

      res.json({ message: `${type} status updated to ${status}` });
    } catch (err: any) {
      console.error("[ShopItems] Status update error:", err);
      res.status(500).json({ message: err?.message || "Failed to update status" });
    }
  });

  app.post("/api/admin/shop-items/upload-image", adminUploadAuth, upload.single("image"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ message: "No image file provided" });

      const type = req.body.type;
      const id = parseInt(req.body.id, 10);
      if (!id || (type !== "product" && type !== "book")) {
        return res.status(400).json({ message: "Invalid type or id" });
      }

      let responseUrl = `/uploads/${file.filename}`;

      if (type === "product") {
        await pool.query(
          `UPDATE extracted_products SET image_url = $1, image_status = 'approved' WHERE id = $2`,
          [responseUrl, id]
        );
        shopCache.invalidate();
      } else {
        const { rows } = await pool.query(`SELECT slug FROM book_enrichments WHERE id = $1`, [id]);
        if (rows.length > 0) {
          const slug = rows[0].slug;
          const destPath = path.resolve("public/books", `${slug}.jpg`);
          copyFileSync(file.path, destPath);
          await pool.query(
            `UPDATE book_enrichments SET has_cover = true, cover_approved = true, updated_at = NOW() WHERE id = $1`,
            [id]
          );
          responseUrl = `/books/${slug}.jpg`;
          try { unlinkSync(file.path); } catch {}
        }
      }

      res.json({ imageUrl: responseUrl, message: "Image uploaded successfully" });
    } catch (err: any) {
      console.error("[ShopItems] Upload error:", err);
      res.status(500).json({ message: err?.message || "Failed to upload image" });
    }
  });

  app.post("/api/admin/referral-tiers/upload-image", adminUploadAuth, upload.single("image"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ message: "No image file provided" });
      const tierId = parseInt(req.body.tierId, 10);
      if (!tierId) return res.status(400).json({ message: "Invalid tier ID" });
      const imageUrl = `/uploads/${file.filename}`;
      await pool.query(`UPDATE referral_tiers SET image_url = $1 WHERE id = $2`, [imageUrl, tierId]);
      res.json({ imageUrl, message: "Tier image uploaded" });
    } catch (err: unknown) {
      console.error("[Admin] Tier image upload error:", err);
      res.status(500).json({ message: "Failed to upload tier image" });
    }
  });

  app.get("/api/admin/shop/queue", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
      const offset = (page - 1) * limit;
      const categoryFilter = (req.query.category as string || "").trim();
      const sortBy = (req.query.sort as string || "recent").trim();

      let productWhere = "status = 'pending'";
      const productVals: any[] = [limit, offset];
      if (categoryFilter) {
        if (categoryFilter === "book") {
          productWhere += " AND 1=0";
        } else {
          productVals.push(categoryFilter);
          productWhere += ` AND category = $${productVals.length}`;
        }
      }

      const productOrderBy = sortBy === "alphabetical" ? "name ASC" : "extracted_at DESC NULLS LAST";
      const bookOrderBy = sortBy === "alphabetical" ? "book_title ASC" : "created_at DESC NULLS LAST";

      const { rows: productRows } = await pool.query(
        `SELECT id, 'product' as source_type, name, company, description, purchase_url as url,
                image_url, context, context_summary, mention_type, category, episode_title, episode_slug, podcast_slug,
                status, image_status, extracted_at as created_at
         FROM extracted_products WHERE ${productWhere}
         ORDER BY ${productOrderBy}
         LIMIT $1 OFFSET $2`,
        productVals
      );

      let bookRows: any[] = [];
      if (!categoryFilter || categoryFilter === "book") {
        const { rows } = await pool.query(
          `SELECT id, 'book' as source_type, book_title as name, author as company, description,
                  amazon_url as url, CASE WHEN has_cover THEN '/books/' || slug || '.jpg' ELSE NULL END as image_url,
                  NULL as context, NULL as context_summary, 'book_mention' as mention_type,
                  'book' as category, NULL as episode_title, NULL as episode_slug, NULL as podcast_slug,
                  CASE WHEN cover_approved IS NULL THEN 'pending' WHEN cover_approved = true THEN 'approved' ELSE 'rejected' END as status,
                  'pending' as image_status, created_at
           FROM book_enrichments WHERE cover_approved IS NULL
           ORDER BY ${bookOrderBy}
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        );
        bookRows = rows;
      }

      const items = [...productRows, ...bookRows].sort((a, b) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      ).slice(0, limit);

      const { rows: statsRows } = await pool.query(
        `SELECT
          (SELECT COUNT(*)::int FROM extracted_products WHERE status = 'pending') as products_pending,
          (SELECT COUNT(*)::int FROM extracted_products WHERE status = 'approved') as products_approved,
          (SELECT COUNT(*)::int FROM extracted_products WHERE status = 'rejected') as products_rejected,
          (SELECT COUNT(*)::int FROM book_enrichments WHERE cover_approved IS NULL) as books_pending,
          (SELECT COUNT(*)::int FROM book_enrichments WHERE cover_approved = true) as books_approved`
      );
      const s = statsRows[0];
      const stats = {
        pending: s.products_pending + s.books_pending,
        approved: s.products_approved + s.books_approved,
        rejected: s.products_rejected,
      };

      res.json({ items, stats, page, limit });
    } catch (err: any) {
      console.error("[ShopQueue] Error:", err);
      res.status(500).json({ message: err?.message || "Failed to load queue" });
    }
  });

  app.get("/api/admin/shop/transcript-excerpt", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const episodeSlug = (req.query.episode_slug as string || "").trim();
      const podcastSlug = (req.query.podcast_slug as string || "").trim();
      const productName = (req.query.product_name as string || "").trim();

      if (!episodeSlug || !podcastSlug) {
        return res.status(400).json({ message: "episode_slug and podcast_slug are required" });
      }

      const { rows: segments }: { rows: { text: string }[] } = await pool.query(
        `SELECT text
         FROM transcript_segments
         WHERE episode_slug = $1 AND podcast_slug = $2
         ORDER BY sequence_index ASC`,
        [episodeSlug, podcastSlug]
      );

      if (!segments.length) {
        return res.json({ transcript: null, found: false });
      }

      const fullText = segments.map((s) => s.text).join(" ");
      const TARGET_WORDS = 600;

      let excerpt: string;
      let mentionFound = false;

      if (productName) {
        const lowerFull = fullText.toLowerCase();
        const lowerProduct = productName.toLowerCase();
        const mentionIndex = lowerFull.indexOf(lowerProduct);

        if (mentionIndex !== -1) {
          mentionFound = true;
          const words = fullText.split(/\s+/);
          let charCount = 0;
          let mentionWordIndex = 0;
          for (let i = 0; i < words.length; i++) {
            if (charCount >= mentionIndex) {
              mentionWordIndex = i;
              break;
            }
            charCount += words[i].length + 1;
          }

          const halfWindow = Math.floor(TARGET_WORDS / 2);
          let start = Math.max(0, mentionWordIndex - halfWindow);
          let end = Math.min(words.length, start + TARGET_WORDS);
          if (end === words.length) {
            start = Math.max(0, end - TARGET_WORDS);
          }

          excerpt = words.slice(start, end).join(" ");
          if (start > 0) excerpt = "..." + excerpt;
          if (end < words.length) excerpt = excerpt + "...";
        } else {
          const words = fullText.split(/\s+/);
          const mid = Math.floor(words.length / 2);
          const halfWindow = Math.floor(TARGET_WORDS / 2);
          const start = Math.max(0, mid - halfWindow);
          const end = Math.min(words.length, start + TARGET_WORDS);
          excerpt = words.slice(start, end).join(" ");
          if (start > 0) excerpt = "..." + excerpt;
          if (end < words.length) excerpt = excerpt + "...";
        }
      } else {
        const words = fullText.split(/\s+/);
        excerpt = words.slice(0, TARGET_WORDS).join(" ");
        if (words.length > TARGET_WORDS) excerpt += "...";
      }

      res.json({ transcript: excerpt, found: mentionFound });
    } catch (err: any) {
      console.error("[TranscriptExcerpt] Error:", err);
      res.status(500).json({ message: err?.message || "Failed to fetch transcript" });
    }
  });

  app.get("/api/admin/shop/approved", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const search = (req.query.search as string || "").trim().toLowerCase();
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
      const offset = (page - 1) * limit;
      const categoryFilter = (req.query.category as string || "").trim();
      const sortBy = (req.query.sort as string || "alphabetical").trim();

      let productWhere = "status = 'approved'";
      let bookWhere = "cover_approved = true";
      const productVals: any[] = [];
      const bookVals: any[] = [];
      let paramIdx = 1;

      if (search) {
        productVals.push(`%${search}%`);
        productWhere += ` AND (LOWER(name) LIKE $${paramIdx} OR LOWER(company) LIKE $${paramIdx} OR LOWER(description) LIKE $${paramIdx})`;
        bookVals.push(`%${search}%`);
        bookWhere += ` AND (LOWER(book_title) LIKE $${paramIdx} OR LOWER(author) LIKE $${paramIdx} OR LOWER(description) LIKE $${paramIdx})`;
        paramIdx++;
      }

      if (categoryFilter) {
        if (categoryFilter === "book") {
          productWhere += " AND 1=0";
        } else {
          productVals.push(categoryFilter);
          productWhere += ` AND category = $${productVals.length}`;
          bookWhere += " AND 1=0";
        }
      }

      let productOrderBy = "name ASC";
      let bookOrderBy = "book_title ASC";
      if (sortBy === "recent") {
        productOrderBy = "extracted_at DESC NULLS LAST";
        bookOrderBy = "created_at DESC NULLS LAST";
      }

      productVals.push(limit, offset);
      bookVals.push(limit, offset);
      const pLimitIdx = productVals.length - 1;
      const pOffsetIdx = productVals.length;
      const bLimitIdx = bookVals.length - 1;
      const bOffsetIdx = bookVals.length;

      const { rows: productRows } = await pool.query(
        `SELECT id, 'product' as source_type, name, company, description, purchase_url as url,
                image_url, context, context_summary, mention_type, category, episode_title, podcast_slug,
                status, image_status, approved_by, approved_at, extracted_at as created_at
         FROM extracted_products WHERE ${productWhere}
         ORDER BY ${productOrderBy}
         LIMIT $${pLimitIdx} OFFSET $${pOffsetIdx}`,
        productVals
      );

      let bookRows: any[] = [];
      if (!categoryFilter || categoryFilter === "book") {
        const { rows } = await pool.query(
          `SELECT id, 'book' as source_type, book_title as name, author as company, description,
                  amazon_url as url, CASE WHEN has_cover THEN '/books/' || slug || '.jpg' ELSE NULL END as image_url,
                  NULL as context, NULL as context_summary, 'book_mention' as mention_type,
                  'book' as category, NULL as episode_title, NULL as podcast_slug,
                  'approved' as status, 'approved' as image_status, NULL as approved_by, NULL as approved_at, created_at
           FROM book_enrichments WHERE ${bookWhere}
           ORDER BY ${bookOrderBy}
           LIMIT $${bLimitIdx} OFFSET $${bOffsetIdx}`,
          bookVals
        );
        bookRows = rows;
      }

      let items = [...productRows, ...bookRows];

      if (sortBy === "popular") {
        const productIds = items.filter(i => i.source_type === "product").map(i => i.id);
        let clickCounts: Record<number, number> = {};
        if (productIds.length > 0) {
          const { rows: clickRows } = await pool.query(
            `SELECT product_id, COUNT(*)::int as cnt FROM affiliate_clicks WHERE product_id = ANY($1) AND product_type = 'product' GROUP BY product_id`,
            [productIds]
          );
          for (const r of clickRows) clickCounts[r.product_id] = r.cnt;
        }
        items.sort((a, b) => (clickCounts[b.id] || 0) - (clickCounts[a.id] || 0));
      } else if (sortBy === "recent") {
        items.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      } else {
        items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      }

      const countProductVals = search ? [`%${search}%`] : [];
      const countBookVals = search ? [`%${search}%`] : [];
      let countProductWhere = "status = 'approved'";
      let countBookWhere = "cover_approved = true";
      if (search) {
        countProductWhere += ` AND (LOWER(name) LIKE $1 OR LOWER(company) LIKE $1 OR LOWER(description) LIKE $1)`;
        countBookWhere += ` AND (LOWER(book_title) LIKE $1 OR LOWER(author) LIKE $1 OR LOWER(description) LIKE $1)`;
      }
      if (categoryFilter) {
        if (categoryFilter === "book") {
          countProductWhere += " AND 1=0";
        } else {
          countProductVals.push(categoryFilter);
          countProductWhere += ` AND category = $${countProductVals.length}`;
          countBookWhere += " AND 1=0";
        }
      }

      const { rows: pcRows } = await pool.query(
        `SELECT COUNT(*)::int as cnt FROM extracted_products WHERE ${countProductWhere}`,
        countProductVals
      );
      let totalCount = pcRows[0]?.cnt || 0;
      if (!categoryFilter || categoryFilter === "book") {
        const { rows: bcRows } = await pool.query(
          `SELECT COUNT(*)::int as cnt FROM book_enrichments WHERE ${countBookWhere}`,
          countBookVals
        );
        totalCount += bcRows[0]?.cnt || 0;
      }

      res.json({ items, total: totalCount, page, limit });
    } catch (err: any) {
      console.error("[ShopApproved] Error:", err);
      res.status(500).json({ message: err?.message || "Failed to load approved items" });
    }
  });

  app.post("/api/admin/shop/:sourceType/:id/approve", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { sourceType, id } = req.params;
      const numId = parseInt(id, 10);
      if (!numId) return res.status(400).json({ message: "Invalid id" });

      if (sourceType === "product") {
        await pool.query(
          `UPDATE extracted_products SET status = 'approved', image_status = CASE WHEN image_url IS NOT NULL AND image_url != '' THEN 'approved' ELSE image_status END, reviewed_at = NOW(), approved_by = 'admin', approved_at = NOW() WHERE id = $1`,
          [numId]
        );
      } else if (sourceType === "book") {
        await pool.query(
          `UPDATE book_enrichments SET cover_approved = true, updated_at = NOW() WHERE id = $1`,
          [numId]
        );
      } else {
        return res.status(400).json({ message: "Invalid source type" });
      }
      shopCache.invalidate();
      res.json({ message: "Product approved" });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to approve" });
    }
  });

  app.post("/api/admin/shop/:sourceType/:id/reject", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { sourceType, id } = req.params;
      const numId = parseInt(id, 10);
      const { reason } = req.body || {};
      if (!numId) return res.status(400).json({ message: "Invalid id" });
      if (!reason) return res.status(400).json({ message: "Rejection reason is required" });

      if (sourceType === "product") {
        await pool.query(
          `UPDATE extracted_products SET status = 'rejected', rejection_reason = $2, reviewed_at = NOW() WHERE id = $1`,
          [numId, reason]
        );
      } else if (sourceType === "book") {
        await pool.query(
          `UPDATE book_enrichments SET cover_approved = false, updated_at = NOW() WHERE id = $1`,
          [numId]
        );
      } else {
        return res.status(400).json({ message: "Invalid source type" });
      }
      shopCache.invalidate();
      res.json({ message: "Product rejected" });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to reject" });
    }
  });

  app.get("/api/admin/shop/:sourceType/:id/detail", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { sourceType, id } = req.params;
      const numId = parseInt(id, 10);
      if (!numId) return res.status(400).json({ message: "Invalid id" });

      if (sourceType === "product") {
        const { rows } = await pool.query(
          `SELECT id, 'product' as source_type, name, company, description, purchase_url as url,
                  image_url, context, context_summary, mention_type, category, episode_title, episode_slug, podcast_slug,
                  status, image_status, rejection_reason, approved_by, approved_at, extracted_at as created_at, reviewed_at
           FROM extracted_products WHERE id = $1`,
          [numId]
        );
        if (rows.length === 0) return res.status(404).json({ message: "Product not found" });
        const item = rows[0];

        const { rows: clickRows } = await pool.query(
          `SELECT COUNT(*)::int as click_count FROM affiliate_clicks WHERE product_id = $1 AND product_type = 'product'`,
          [numId]
        );
        item.click_count = clickRows[0]?.click_count || 0;

        res.json({ item });
      } else if (sourceType === "book") {
        const { rows } = await pool.query(
          `SELECT id, 'book' as source_type, book_title as name, author as company, description,
                  amazon_url as url, CASE WHEN has_cover THEN '/books/' || slug || '.jpg' ELSE NULL END as image_url,
                  NULL as context, NULL as context_summary, 'book_mention' as mention_type,
                  'book' as category, NULL as episode_title, NULL as episode_slug, NULL as podcast_slug,
                  CASE WHEN cover_approved IS NULL THEN 'pending' WHEN cover_approved = true THEN 'approved' ELSE 'rejected' END as status,
                  'approved' as image_status, NULL as rejection_reason, NULL as approved_by, NULL as approved_at, created_at, updated_at as reviewed_at
           FROM book_enrichments WHERE id = $1`,
          [numId]
        );
        if (rows.length === 0) return res.status(404).json({ message: "Book not found" });
        res.json({ item: rows[0] });
      } else {
        return res.status(400).json({ message: "Invalid source type" });
      }
    } catch (err: any) {
      console.error("[ShopDetail] Error:", err);
      res.status(500).json({ message: err?.message || "Failed to load detail" });
    }
  });

  app.delete("/api/admin/shop/:sourceType/:id", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { sourceType, id } = req.params;
      const numId = parseInt(id, 10);
      if (!numId) return res.status(400).json({ message: "Invalid id" });

      if (sourceType === "product") {
        await pool.query(`DELETE FROM extracted_products WHERE id = $1`, [numId]);
      } else if (sourceType === "book") {
        await pool.query(`DELETE FROM book_enrichments WHERE id = $1`, [numId]);
      } else {
        return res.status(400).json({ message: "Invalid source type" });
      }
      shopCache.invalidate();
      res.json({ message: "Product deleted" });
    } catch (err: any) {
      console.error("[ShopDelete] Error:", err);
      res.status(500).json({ message: err?.message || "Failed to delete" });
    }
  });

  app.post("/api/admin/shop/:sourceType/:id/move-to-queue", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { sourceType, id } = req.params;
      const numId = parseInt(id, 10);
      if (!numId) return res.status(400).json({ message: "Invalid id" });

      if (sourceType === "product") {
        await pool.query(
          `UPDATE extracted_products SET status = 'pending', approved_by = NULL, approved_at = NULL, reviewed_at = NULL, rejection_reason = NULL WHERE id = $1`,
          [numId]
        );
      } else if (sourceType === "book") {
        await pool.query(
          `UPDATE book_enrichments SET cover_approved = NULL, updated_at = NOW() WHERE id = $1`,
          [numId]
        );
      } else {
        return res.status(400).json({ message: "Invalid source type" });
      }
      shopCache.invalidate();
      res.json({ message: "Product moved back to queue" });
    } catch (err: any) {
      console.error("[ShopMoveToQueue] Error:", err);
      res.status(500).json({ message: err?.message || "Failed to move to queue" });
    }
  });

  app.post("/api/admin/shop/:sourceType/:id/update", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { sourceType, id } = req.params;
      const numId = parseInt(id, 10);
      const { name, description, url, imageUrl, category } = req.body;
      if (!numId) return res.status(400).json({ message: "Invalid id" });
      const validCategories = ["physical_product", "service_or_tool", "experience", "book"];

      if (sourceType === "product") {
        const sets: string[] = [];
        const vals: any[] = [];
        let idx = 1;
        if (name !== undefined) { sets.push(`name = $${idx++}`); vals.push(name); }
        if (description !== undefined) { sets.push(`description = $${idx++}`); vals.push(description); }
        if (url !== undefined) { sets.push(`purchase_url = $${idx++}`); vals.push(url); }
        if (category !== undefined && validCategories.includes(category)) { sets.push(`category = $${idx++}`); vals.push(category); }
        if (imageUrl !== undefined) {
          sets.push(`image_url = $${idx++}`); vals.push(imageUrl);
          sets.push(`image_status = 'approved'`);
        }
        if (sets.length > 0) {
          vals.push(numId);
          await pool.query(`UPDATE extracted_products SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
        }
      } else if (sourceType === "book") {
        const sets: string[] = [];
        const vals: any[] = [];
        let idx = 1;
        if (name !== undefined) { sets.push(`book_title = $${idx++}`); vals.push(name); }
        if (description !== undefined) { sets.push(`description = $${idx++}`); vals.push(description); }
        if (url !== undefined) { sets.push(`amazon_url = $${idx++}`); vals.push(url); }
        if (imageUrl !== undefined) {
          const { rows: bookRows } = await pool.query(`SELECT slug FROM book_enrichments WHERE id = $1`, [numId]);
          if (bookRows.length > 0) {
            const slug = bookRows[0].slug;
            try {
              const imgResp = await fetch(imageUrl, { signal: AbortSignal.timeout(8000), redirect: "follow" });
              if (imgResp.ok) {
                const buffer = Buffer.from(await imgResp.arrayBuffer());
                const destPath = path.resolve("public/books", `${slug}.jpg`);
                writeFileSync(destPath, buffer);
                sets.push(`has_cover = true`);
              }
            } catch (e) {
              console.log("[ShopUpdate] Could not download book image:", e);
            }
          }
        }
        if (sets.length > 0) {
          sets.push(`updated_at = NOW()`);
          vals.push(numId);
          await pool.query(`UPDATE book_enrichments SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
        }
      }
      shopCache.invalidate();
      res.json({ message: "Product updated" });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to update" });
    }
  });

  app.get("/api/admin/shop/:sourceType/:id/find-images", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { sourceType, id } = req.params;
      const numId = parseInt(id, 10);
      if (!numId) return res.status(400).json({ message: "Invalid id" });

      let purchaseUrl = "";
      let productName = "";
      let company = "";

      if (sourceType === "product") {
        const { rows } = await pool.query(`SELECT name, company, purchase_url FROM extracted_products WHERE id = $1`, [numId]);
        if (rows.length === 0) return res.status(404).json({ message: "Product not found" });
        purchaseUrl = rows[0].purchase_url || "";
        productName = rows[0].name || "";
        company = rows[0].company || "";
      } else if (sourceType === "book") {
        const { rows } = await pool.query(`SELECT book_title, author, amazon_url FROM book_enrichments WHERE id = $1`, [numId]);
        if (rows.length === 0) return res.status(404).json({ message: "Book not found" });
        purchaseUrl = rows[0].amazon_url || "";
        productName = rows[0].book_title || "";
        company = rows[0].author || "";
      }

      const images: string[] = [];

      if (purchaseUrl) {
        try {
          const normalizedUrl = purchaseUrl.match(/^https?:\/\//) ? purchaseUrl : `https://${purchaseUrl}`;
          const parsedUrl = new URL(normalizedUrl);
          if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") throw new Error("Invalid protocol");
          const hostname = parsedUrl.hostname;
          if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname.startsWith("192.168.") || hostname.startsWith("10.") || hostname.startsWith("172.") || hostname === "[::1]" || hostname.endsWith(".internal") || hostname.endsWith(".local")) {
            throw new Error("Private/internal URL not allowed");
          }
          const domain = hostname.replace(/^www\./, "");

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          const resp = await fetch(normalizedUrl, {
            signal: controller.signal,
            redirect: "follow",
            headers: { "User-Agent": "Mozilla/5.0 (compatible; PodRise/1.0)" },
          });
          clearTimeout(timeout);

          if (resp.ok) {
            const html = await resp.text();
            const ogMatches = [
              ...html.matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi),
              ...html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/gi),
            ];
            for (const m of ogMatches) {
              let url = m[1].trim();
              if (url.startsWith("//")) url = "https:" + url;
              else if (url.startsWith("/")) url = `https://${domain}${url}`;
              if (url.startsWith("http") && !images.includes(url)) images.push(url);
            }
            const twitterMatches = [
              ...html.matchAll(/<meta[^>]+(?:name|property)=["']twitter:image["'][^>]+content=["']([^"']+)["']/gi),
              ...html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:image["']/gi),
            ];
            for (const m of twitterMatches) {
              let url = m[1].trim();
              if (url.startsWith("//")) url = "https:" + url;
              else if (url.startsWith("/")) url = `https://${domain}${url}`;
              if (url.startsWith("http") && !images.includes(url)) images.push(url);
            }
            const imgTagMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)];
            for (const m of imgTagMatches) {
              let url = m[1].trim();
              if (url.startsWith("data:")) continue;
              if (url.startsWith("//")) url = "https:" + url;
              else if (url.startsWith("/")) url = `https://${domain}${url}`;
              if (url.startsWith("http") && !images.includes(url) && url.length < 500) {
                images.push(url);
              }
              if (images.length >= 20) break;
            }
          }

          const logoDevPubKey = process.env.LOGO_DEV_PUBLIC_KEY;
          if (logoDevPubKey) {
            const logoUrl = `https://img.logo.dev/${domain}?token=${logoDevPubKey}&format=png&size=128`;
            if (!images.includes(logoUrl)) images.push(logoUrl);
          }
        } catch (e) {
          console.log("[FindImages] Error scraping URL:", e);
        }
      }

      res.json({ images, productName, company });
    } catch (err: any) {
      console.error("[FindImages] Error:", err);
      res.status(500).json({ message: err?.message || "Failed to find images" });
    }
  });

  app.post("/api/admin/products/generate-podcast-buzz", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { rows: productRows } = await pool.query(
        `SELECT ep.name, ep.company, ep.context, ep.context_summary, ep.episode_title, ep.podcast_slug
         FROM extracted_products ep
         WHERE ep.status = 'approved' AND ep.context IS NOT NULL AND ep.context != ''
         ORDER BY ep.name`
      );

      const slugToName: Record<string, string> = {};
      const { rows: pdRows } = await pool.query(`SELECT slug, name FROM podcast_directory WHERE has_landing_page = true`);
      for (const p of pdRows) slugToName[p.slug] = p.name;

      const productMap = new Map<string, {
        name: string;
        company: string | null;
        contexts: string[];
        contextSummaries: string[];
        podcastSlugs: Set<string>;
        mentionCount: number;
        episodes: { podcastSlug: string; episodeTitle: string; context: string | null; contextSummary: string | null }[];
      }>();

      for (const row of productRows) {
        const key = normalizeProductKey(row.name || "");
        if (!key) continue;
        const existing = productMap.get(key);
        if (existing) {
          existing.mentionCount++;
          existing.podcastSlugs.add(row.podcast_slug);
          if (row.context && !existing.contexts.includes(row.context)) existing.contexts.push(row.context);
          if (row.context_summary && !existing.contextSummaries.includes(row.context_summary)) existing.contextSummaries.push(row.context_summary);
          existing.episodes.push({ podcastSlug: row.podcast_slug, episodeTitle: row.episode_title, context: row.context || null, contextSummary: row.context_summary || null });
        } else {
          productMap.set(key, {
            name: row.name,
            company: row.company || null,
            contexts: row.context ? [row.context] : [],
            contextSummaries: row.context_summary ? [row.context_summary] : [],
            podcastSlugs: new Set([row.podcast_slug]),
            mentionCount: 1,
            episodes: [{ podcastSlug: row.podcast_slug, episodeTitle: row.episode_title, context: row.context || null, contextSummary: row.context_summary || null }],
          });
        }
      }

      const { rows: existingBuzz } = await pool.query(`SELECT product_key FROM product_podcast_buzz`);
      const existingKeys = new Set(existingBuzz.map((r: any) => r.product_key));

      const productsToProcess = Array.from(productMap.entries())
        .filter(([key]) => !existingKeys.has(key))
        .slice(0, 20);

      if (productsToProcess.length === 0) {
        return res.json({ message: "All products already have podcast buzz summaries", generated: 0 });
      }

      const OpenAI = (await import("openai")).default;
      const directOpenai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      let generated = 0;

      const hostsByPodcast: Record<string, string[]> = {};
      const { rows: hostRows } = await pool.query(`SELECT podcast_slug, name FROM podcast_hosts ORDER BY sort_order`);
      for (const h of hostRows) {
        if (!hostsByPodcast[h.podcast_slug]) hostsByPodcast[h.podcast_slug] = [];
        hostsByPodcast[h.podcast_slug].push(h.name);
      }

      for (const [key, product] of productsToProcess) {
        try {
          const episodeDetails = product.episodes.slice(0, 8).map(ep => {
            const podName = slugToName[ep.podcastSlug] || ep.podcastSlug;
            const hosts = hostsByPodcast[ep.podcastSlug]?.join(" & ") || "";
            const context = ep.contextSummary || ep.context || "";
            return `- ${podName}${hosts ? ` (${hosts})` : ""} — "${ep.episodeTitle}"\n  Context: ${context.slice(0, 400)}`;
          }).join("\n");

          const podcastNames = [...product.podcastSlugs].map(s => slugToName[s] || s).join(", ");

          const aiResp = await directOpenai.chat.completions.create({
            model: "gpt-4o",
            messages: [{
              role: "user",
              content: `Write a single editorial "podcast buzz" summary for this product. This will appear on a product page under "What top podcasters are saying."

PRODUCT: "${product.name}"${product.company ? ` by ${product.company}` : ''}
MENTIONED ON: ${podcastNames} (${product.mentionCount} total mention${product.mentionCount > 1 ? 's' : ''})

EPISODE-BY-EPISODE CONTEXT:
${episodeDetails}

Write 1-2 sentences that synthesize WHY podcast hosts discussed or recommended this product. Reference specific podcast names and host names. Capture the specific angle or reason each host brought it up — don't just say they "praised" it. Make it read like editorial social proof, not marketing copy.

Good examples:
- "A staple on business podcasts. Tim Ferriss calls it essential reading, and it regularly comes up on The Knowledge Project as a framework for building habits."
- "Frequently cited on tech podcasts when discussing AI safety. Hosts on Lex Fridman and All-In have called it the most important book of the decade."
- "Chamath Palihapitiya on All-In praised it as a fan favorite alongside Notion, while Avlok Kohli on My First Million highlighted how it complements Notion's page-building with powerful backlinking for context and knowledge discovery."

Bad examples (avoid these patterns):
- "A favorite among productivity enthusiasts..." (too vague, no specific angle)
- "...making it a must-have tool for anyone looking to..." (generic marketing speak)
- "...has garnered praise on popular podcasts..." (passive, no specifics)

Respond with ONLY the buzz paragraph text, no quotes or labels.`
            }],
            max_tokens: 250,
            temperature: 0.3,
          });

          const { logCompletionUsage } = await import("./apiUsageTracker");
          logCompletionUsage(aiResp, "gpt-4o", "product_buzz_generation");

          const buzz = aiResp.choices[0]?.message?.content?.trim();
          if (buzz) {
            await pool.query(
              `INSERT INTO product_podcast_buzz (product_key, product_name, company, podcast_buzz)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (product_key) DO UPDATE SET podcast_buzz = $4, generated_at = NOW()`,
              [key, product.name, product.company, buzz]
            );
            generated++;
          }
        } catch (err: any) {
          console.warn(`[ProductBuzz] Failed for ${product.name}:`, err.message);
        }
      }

      shopCache.invalidate();
      res.json({ message: `Generated podcast buzz for ${generated}/${productsToProcess.length} products`, generated, total: productsToProcess.length });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to generate podcast buzz" });
    }
  });

  app.post("/api/webhooks/taddy", async (req, res) => {
    try {
      const webhookSecret = process.env.TADDY_WEBHOOK_SECRET;
      if (webhookSecret) {
        const headerSecret = req.headers["x-taddy-webhook-secret"];
        if (headerSecret !== webhookSecret) {
          console.warn("[TaddyWebhook] Invalid webhook secret, rejecting");
          return res.status(401).json({ error: "Invalid webhook secret" });
        }
      }

      const payload = req.body;
      const { taddyType, action, data } = payload || {};
      console.log(`[TaddyWebhook] Received: taddyType=${taddyType} action=${action} uuid=${data?.uuid?.slice(0, 12)}...`);

      if (!taddyType || !action || !data) {
        return res.status(200).json({ success: true });
      }

      if (taddyType === "podcastepisode" && (action === "created" || action === "updated")) {
        const epData = data;
        const seriesItunesId = String(epData.podcastSeries?.itunesId || "");
        const seriesUuid = epData.podcastSeries?.uuid || "";

        if (!seriesItunesId && !seriesUuid) {
          console.log("[TaddyWebhook] No podcast identifier in episode event, ignoring");
          return res.status(200).json({ success: true });
        }

        const { rows: [podcast] } = await pool.query(
          `SELECT name, slug, itunes_id, taddy_uuid, hosts, artwork_url FROM podcast_directory WHERE itunes_id = $1 OR taddy_uuid = $2 LIMIT 1`,
          [seriesItunesId, seriesUuid]
        );

        if (!podcast) {
          console.log(`[TaddyWebhook] Episode for untracked podcast (iTunes ${seriesItunesId}), ignoring`);
          return res.status(200).json({ success: true });
        }

        if (!podcast.taddy_uuid && seriesUuid) {
          await pool.query(`UPDATE podcast_directory SET taddy_uuid = $1 WHERE itunes_id = $2`, [seriesUuid, podcast.itunes_id]);
        }

        const epTitle = epData.name || "";
        const epUuid = epData.uuid || "";
        console.log(`[TaddyWebhook] New episode: ${podcast.name} - "${epTitle.slice(0, 60)}"`);

        res.status(200).json({ success: true, podcast: podcast.name, episode: epTitle.slice(0, 60) });

        (async () => {
          try {
            const { rows: existing } = await pool.query(
              `SELECT id FROM episode_transcripts WHERE podcast_id = $1 AND (episode_guid = $2 OR lower(trim(episode_title)) = lower(trim($3))) LIMIT 1`,
              [podcast.itunes_id, epUuid, epTitle]
            );
            if (existing.length > 0) {
              console.log(`[TaddyWebhook] Episode already exists, skipping: "${epTitle.slice(0, 60)}"`);
              return;
            }

            const { getEpisodeTranscript } = await import("./taddyClient");
            const transcript = await getEpisodeTranscript(epUuid);
            if (!transcript) {
              console.log(`[TaddyWebhook] No transcript available yet for "${epTitle.slice(0, 60)}"`);
              return;
            }

            const isComplete = !!(epData.description && epData.datePublished && epData.duration && epData.audioUrl);
            await storage.saveTranscript({
              podcastId: podcast.itunes_id,
              episodeGuid: epUuid,
              episodeTitle: epTitle,
              transcript,
              description: epData.description || undefined,
              subtitle: epData.subtitle || undefined,
              datePublished: epData.datePublished || undefined,
              duration: epData.duration || undefined,
              audioUrl: epData.audioUrl || undefined,
              imageUrl: epData.imageUrl || undefined,
              seasonNumber: epData.seasonNumber || undefined,
              episodeNumber: epData.episodeNumber || undefined,
              episodeType: epData.episodeType || undefined,
            });
            console.log(`[TaddyWebhook] Saved transcript: ${podcast.name} - "${epTitle.slice(0, 60)}"`);

            try {
              const { slugifyEpisodeTitle, parseTranscriptToSegments } = await import("./emailScheduler");
              const epSlug = slugifyEpisodeTitle(epTitle);
              const segs = parseTranscriptToSegments(transcript, podcast.slug, epSlug, epUuid);
              if (segs.length > 0) await storage.saveTranscriptSegments(segs);
            } catch {}

            const { generateRecapFromTranscript } = await import("./recapGenerator");
            const { slugifyEpisodeTitle } = await import("./emailScheduler");
            const epSlug = slugifyEpisodeTitle(epTitle);

            const existingRecap = await storage.getLandingPageRecapBySlug(podcast.slug, epSlug);
            if (existingRecap) {
              console.log(`[TaddyWebhook] Recap already exists for "${epTitle.slice(0, 60)}"`);
              return;
            }

            const recap = await generateRecapFromTranscript(transcript, podcast.name, epTitle);
            if (!recap) {
              console.log(`[TaddyWebhook] Failed to generate recap for "${epTitle.slice(0, 60)}"`);
              return;
            }

            const durationSec = epData.duration || 0;
            const durationMin = Math.round(durationSec / 60);
            const durationStr = durationMin >= 60
              ? `${Math.floor(durationMin / 60)} hr ${durationMin % 60} min`
              : `${durationMin} min`;
            const publishDate = epData.datePublished
              ? new Date(epData.datePublished * 1000).toISOString().split("T")[0]
              : new Date().toISOString().split("T")[0];

            const { searchSpotifyEpisode } = await import("./spotifyClient");
            const webhookSpotifyUrl = await searchSpotifyEpisode(podcast.name, epTitle) || "";
            const webhookUpserted = await storage.upsertLandingPageRecap({
              slug: podcast.slug,
              itunesId: podcast.itunes_id,
              podcastName: podcast.name,
              episodeTitle: epTitle,
              episodeSlug: epSlug,
              publishDate,
              duration: durationStr,
              artworkUrl: epData.imageUrl || podcast.artwork_url || "",
              hosts: podcast.hosts || "",
              tldl: recap.tldl,
              whatHappened: recap.whatHappened,
              keyInsights: recap.keyInsights,
              quote: recap.quote,
              quoteAttribution: recap.quoteAttribution,
              keyTopics: recap.keyTopics,
              topQuestions: recap.topQuestions ? JSON.stringify(recap.topQuestions) : null,
              audioUrl: epData.audioUrl || "",
              sponsors: recap.sponsors ? JSON.stringify(recap.sponsors) : "[]",
              guests: recap.guests ? JSON.stringify(recap.guests) : "[]",
              resources: recap.resources ? JSON.stringify(recap.resources) : "[]",
              spotifyEpisodeUrl: webhookSpotifyUrl,
              topicContexts: recap.topicContexts ? JSON.stringify(recap.topicContexts) : null,
              published: true,
            });
            const webhookCanonicalSlug = webhookUpserted.episodeSlug;
            console.log(`[TaddyWebhook] Generated recap: ${podcast.name} - "${epTitle.slice(0, 60)}"`);

            if (recap.products && recap.products.length > 0) {
              let productsSaved = 0;
              let productsFiltered = 0;
              const { isLikelySponsorProduct } = await import("./productFilter");
              for (const p of recap.products) {
                if (!p.name || !p.context) continue;
                const filterResult = isLikelySponsorProduct(p);
                const initialStatus = filterResult.isFiltered ? "rejected" : "pending";
                try {
                  const { rows: existingProd } = await pool.query(
                    `SELECT id FROM extracted_products WHERE LOWER(name) = LOWER($1) AND podcast_slug = $2 AND episode_title = $3 LIMIT 1`,
                    [p.name, podcast.slug, epTitle]
                  );
                  if (existingProd.length > 0) continue;
                  let imageUrl: string | null = null;
                  if (!filterResult.isFiltered && p.purchaseUrl) {
                    try { imageUrl = await resolveProductImage(p.purchaseUrl); } catch {}
                  }
                  await pool.query(
                    `INSERT INTO extracted_products (name, company, description, purchase_url, context, mention_type, category, episode_title, episode_slug, podcast_slug, status, rejection_reason, image_url)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
                    [p.name, p.company || null, p.description || null, p.purchaseUrl || null, p.context, p.mentionType || "personal_use", p.category || "service_or_tool", epTitle, webhookCanonicalSlug, podcast.slug, initialStatus, filterResult.reason, imageUrl]
                  );
                  if (filterResult.isFiltered) productsFiltered++;
                  else productsSaved++;
                } catch {}
              }
              if (productsSaved > 0 || productsFiltered > 0) console.log(`[TaddyWebhook] Products for "${epTitle.slice(0, 60)}": ${productsSaved} saved, ${productsFiltered} auto-filtered`);
            }

            try {
              const { rows: recapIdRows } = await pool.query(
                `SELECT id FROM landing_page_recaps WHERE slug = $1 AND episode_slug = $2 LIMIT 1`,
                [podcast.slug, webhookCanonicalSlug]
              );
              await postProcessRecap({
                transcript: fullTranscript,
                podcastSlug: podcast.slug,
                episodeSlug: webhookCanonicalSlug,
                podcastName: podcast.name,
                episodeTitle: epTitle,
                itunesId: podcast.itunes_id,
                hosts: podcast.hosts || "",
                guests: recap.guests || null,
                resources: recap.resources || null,
                recapId: recapIdRows[0]?.id,
                extractedQuotes: recap.extractedQuotes || null,
              });
              console.log(`[TaddyWebhook] Post-processed: ${podcast.name} - "${epTitle.slice(0, 60)}"`);
            } catch (ppErr) {
              console.error(`[TaddyWebhook] Post-process error:`, ppErr);
            }
          } catch (err) {
            console.error(`[TaddyWebhook] Background error for "${epTitle.slice(0, 60)}":`, err);
          }
        })();

        return;
      }

      if (taddyType === "podcastepisode" && action === "updated") {
        const epData = data;
        const seriesItunesId = String(epData.podcastSeries?.itunesId || "");
        if (seriesItunesId && epData.uuid) {
          await pool.query(
            `UPDATE episode_transcripts SET description = COALESCE($1, description), duration = COALESCE($2, duration), audio_url = COALESCE($3, audio_url), image_url = COALESCE($4, image_url), subtitle = COALESCE($5, subtitle) WHERE podcast_id = $6 AND episode_guid = $7`,
            [epData.description, epData.duration, epData.audioUrl, epData.imageUrl, epData.subtitle, seriesItunesId, epData.uuid]
          );
        }
        return res.status(200).json({ success: true });
      }

      if (taddyType === "podcastseries" && action === "updated") {
        const seriesData = data;
        if (seriesData.itunesId) {
          await pool.query(
            `UPDATE podcast_directory SET artwork_url = COALESCE($1, artwork_url), description = COALESCE($2, description) WHERE itunes_id = $3`,
            [seriesData.imageUrl, seriesData.description, String(seriesData.itunesId)]
          );
        }
        return res.status(200).json({ success: true });
      }

      res.status(200).json({ success: true });
    } catch (err) {
      console.error("[TaddyWebhook] Error:", err);
      res.status(200).json({ success: true });
    }
  });

  app.get("/api/admin/api-usage/summary", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const result = await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '1 day' THEN estimated_cost ELSE 0 END), 0) AS today,
          COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN estimated_cost ELSE 0 END), 0) AS week,
          COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN estimated_cost ELSE 0 END), 0) AS month,
          COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '1 day' THEN total_tokens ELSE 0 END), 0) AS tokens_today,
          COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN total_tokens ELSE 0 END), 0) AS tokens_month,
          COUNT(CASE WHEN created_at >= NOW() - INTERVAL '1 day' THEN 1 END)::int AS calls_today,
          COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END)::int AS calls_month
        FROM api_usage_logs
      `);
      res.json(result.rows[0]);
    } catch (err) {
      console.error("[ApiUsage] Summary error:", err);
      res.status(500).json({ error: "Failed to fetch usage summary" });
    }
  });

  app.get("/api/admin/api-usage/daily", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const result = await pool.query(`
        SELECT
          DATE(created_at) AS date,
          COALESCE(SUM(estimated_cost), 0) AS cost,
          COALESCE(SUM(total_tokens), 0) AS tokens,
          COUNT(*)::int AS calls
        FROM api_usage_logs
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date
      `);
      res.json(result.rows);
    } catch (err) {
      console.error("[ApiUsage] Daily error:", err);
      res.status(500).json({ error: "Failed to fetch daily usage" });
    }
  });

  app.get("/api/admin/api-usage/by-feature", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const result = await pool.query(`
        SELECT
          feature,
          COUNT(*)::int AS calls,
          COALESCE(SUM(total_tokens), 0) AS tokens,
          COALESCE(SUM(estimated_cost), 0) AS cost
        FROM api_usage_logs
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY feature
        ORDER BY cost DESC
      `);
      res.json(result.rows);
    } catch (err) {
      console.error("[ApiUsage] By-feature error:", err);
      res.status(500).json({ error: "Failed to fetch usage by feature" });
    }
  });

  app.get("/api/admin/api-usage/by-model", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const result = await pool.query(`
        SELECT
          model,
          COUNT(*)::int AS calls,
          COALESCE(SUM(total_tokens), 0) AS tokens,
          COALESCE(SUM(estimated_cost), 0) AS cost
        FROM api_usage_logs
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY model
        ORDER BY cost DESC
      `);
      res.json(result.rows);
    } catch (err) {
      console.error("[ApiUsage] By-model error:", err);
      res.status(500).json({ error: "Failed to fetch usage by model" });
    }
  });

  app.get("/api/admin/api-usage/recaps", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const result = await pool.query(`
        SELECT
          COUNT(*)::int AS total_api_calls,
          COALESCE(SUM(total_tokens), 0) AS total_tokens,
          COALESCE(SUM(estimated_cost), 0) AS total_cost,
          COALESCE(AVG(total_tokens), 0) AS avg_tokens_per_call,
          COALESCE(AVG(estimated_cost), 0) AS avg_cost_per_call,
          COUNT(CASE WHEN feature IN ('recap_generation', 'recap_synthesis') THEN 1 END)::int AS recaps_generated,
          COUNT(CASE WHEN feature IN ('recap_generation', 'recap_synthesis') AND created_at >= NOW() - INTERVAL '1 day' THEN 1 END)::int AS recaps_today,
          COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '1 day' THEN estimated_cost ELSE 0 END), 0) AS cost_today,
          COUNT(CASE WHEN feature IN ('recap_generation', 'recap_synthesis') AND created_at >= NOW() - INTERVAL '7 days' THEN 1 END)::int AS recaps_week,
          COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN estimated_cost ELSE 0 END), 0) AS cost_week,
          COUNT(CASE WHEN feature IN ('recap_generation', 'recap_synthesis') AND created_at >= NOW() - INTERVAL '30 days' THEN 1 END)::int AS recaps_month,
          COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN estimated_cost ELSE 0 END), 0) AS cost_month
        FROM api_usage_logs
        WHERE feature LIKE 'recap%'
          AND created_at >= NOW() - INTERVAL '30 days'
      `);
      res.json(result.rows[0]);
    } catch (err) {
      console.error("[ApiUsage] Recaps error:", err);
      res.status(500).json({ error: "Failed to fetch recap usage" });
    }
  });

  app.get("/api/admin/advertisers", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const list = await storage.getAdvertisers();
      res.json(list);
    } catch (err) {
      console.error("[Advertisers] List error:", err);
      res.status(500).json({ error: "Failed to fetch advertisers" });
    }
  });

  app.post("/api/admin/advertisers", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { insertAdvertiserSchema } = await import("@shared/schema");
      const sanitizeHtml = (await import("sanitize-html")).default;
      const parsed = insertAdvertiserSchema.parse(req.body);
      parsed.message = sanitizeHtml(parsed.message, {
        allowedTags: ["b", "strong", "i", "em", "a", "p", "br"],
        allowedAttributes: { a: ["href", "target", "rel"] },
        allowedSchemes: ["http", "https"],
      });
      const created = await storage.createAdvertiser(parsed);
      res.json(created);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ error: "Validation failed", details: err.issues });
      console.error("[Advertisers] Create error:", err);
      res.status(500).json({ error: "Failed to create advertiser" });
    }
  });

  app.patch("/api/admin/advertisers/:id", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { insertAdvertiserSchema } = await import("@shared/schema");
      const sanitizeHtml = (await import("sanitize-html")).default;
      const parsed = insertAdvertiserSchema.parse(req.body);
      parsed.message = sanitizeHtml(parsed.message, {
        allowedTags: ["b", "strong", "i", "em", "a", "p", "br"],
        allowedAttributes: { a: ["href", "target", "rel"] },
        allowedSchemes: ["http", "https"],
      });
      const updated = await storage.updateAdvertiser(Number(req.params.id), parsed);
      if (!updated) return res.status(404).json({ error: "Advertiser not found" });
      res.json(updated);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ error: "Validation failed", details: err.issues });
      console.error("[Advertisers] Update error:", err);
      res.status(500).json({ error: "Failed to update advertiser" });
    }
  });

  app.delete("/api/admin/advertisers/:id", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      await storage.deleteAdvertiser(Number(req.params.id));
      res.json({ success: true });
    } catch (err) {
      console.error("[Advertisers] Delete error:", err);
      res.status(500).json({ error: "Failed to delete advertiser" });
    }
  });

  app.get("/api/admin/feed-ads", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const list = await storage.getFeedAds();
      res.json(list);
    } catch (err) {
      console.error("[FeedAds] List error:", err);
      res.status(500).json({ error: "Failed to fetch feed ads" });
    }
  });

  app.post("/api/admin/feed-ads", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { insertFeedAdSchema } = await import("@shared/schema");
      const sanitizeHtml = (await import("sanitize-html")).default;
      const parsed = insertFeedAdSchema.parse(req.body);
      parsed.description = sanitizeHtml(parsed.description, {
        allowedTags: ["b", "strong", "i", "em", "a", "br"],
        allowedAttributes: { a: ["href", "target", "rel"] },
        allowedSchemes: ["http", "https"],
      });
      const created = await storage.createFeedAd(parsed);
      res.json(created);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ error: "Validation failed", details: err.issues });
      console.error("[FeedAds] Create error:", err);
      res.status(500).json({ error: "Failed to create feed ad" });
    }
  });

  app.patch("/api/admin/feed-ads/:id", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { insertFeedAdSchema } = await import("@shared/schema");
      const sanitizeHtml = (await import("sanitize-html")).default;
      const parsed = insertFeedAdSchema.partial().parse(req.body);
      if (parsed.description) {
        parsed.description = sanitizeHtml(parsed.description, {
          allowedTags: ["b", "strong", "i", "em", "a", "br"],
          allowedAttributes: { a: ["href", "target", "rel"] },
          allowedSchemes: ["http", "https"],
        });
      }
      const updated = await storage.updateFeedAd(Number(req.params.id), parsed);
      if (!updated) return res.status(404).json({ error: "Feed ad not found" });
      res.json(updated);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ error: "Validation failed", details: err.issues });
      console.error("[FeedAds] Update error:", err);
      res.status(500).json({ error: "Failed to update feed ad" });
    }
  });

  app.delete("/api/admin/feed-ads/:id", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      await storage.deleteFeedAd(Number(req.params.id));
      res.json({ success: true });
    } catch (err) {
      console.error("[FeedAds] Delete error:", err);
      res.status(500).json({ error: "Failed to delete feed ad" });
    }
  });

  app.get("/api/admin/feed-ad-settings", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const frequency = await storage.getFeedAdSetting("feed_ad_frequency");
      res.json({ frequency: frequency ? parseInt(frequency) : 5 });
    } catch (err) {
      console.error("[FeedAdSettings] Get error:", err);
      res.status(500).json({ error: "Failed to fetch feed ad settings" });
    }
  });

  app.put("/api/admin/feed-ad-settings", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { frequency } = req.body;
      if (typeof frequency !== "number" || frequency < 1 || frequency > 50 || !Number.isInteger(frequency)) {
        return res.status(400).json({ error: "Frequency must be an integer between 1 and 50" });
      }
      await storage.setFeedAdSetting("feed_ad_frequency", String(frequency));
      res.json({ success: true });
    } catch (err) {
      console.error("[FeedAdSettings] Update error:", err);
      res.status(500).json({ error: "Failed to update feed ad settings" });
    }
  });

  app.get("/api/feed-ads/next", async (req, res) => {
    try {
      const activeAds = await storage.getActiveFeedAds();
      if (activeAds.length === 0) return res.json(null);
      const totalWeight = activeAds.reduce((sum, ad) => sum + ad.weight, 0);
      let random = Math.random() * totalWeight;
      let selected = activeAds[0];
      for (const ad of activeAds) {
        random -= ad.weight;
        if (random <= 0) { selected = ad; break; }
      }
      res.json(selected);
    } catch (err) {
      console.error("[FeedAds] Next error:", err);
      res.status(500).json({ error: "Failed to fetch next feed ad" });
    }
  });

  app.get("/api/feed-ads/batch", async (req, res) => {
    try {
      const count = Math.min(parseInt(req.query.count as string) || 5, 20);
      const activeAds = await storage.getActiveFeedAds();
      const frequency = await storage.getFeedAdSetting("feed_ad_frequency");
      const freq = frequency ? parseInt(frequency) : 5;
      if (activeAds.length === 0) return res.json({ ads: [], frequency: freq });
      const totalWeight = activeAds.reduce((sum, ad) => sum + ad.weight, 0);
      const results: typeof activeAds = [];
      for (let i = 0; i < count; i++) {
        let random = Math.random() * totalWeight;
        for (const ad of activeAds) {
          random -= ad.weight;
          if (random <= 0) { results.push(ad); break; }
        }
      }
      let enriched = results;
      try {
        const podcastSlugs = [...new Set(results.filter(a => a.type === "podcast" && a.podcastSlug).map(a => a.podcastSlug!))];
        if (podcastSlugs.length > 0) {
          const placeholders = podcastSlugs.map((_, i) => `$${i + 1}`).join(",");
          const { rows } = await pool.query(
            `SELECT slug, artwork_url FROM podcasts WHERE slug IN (${placeholders})`,
            podcastSlugs
          );
          const podcastArtwork: Record<string, string> = {};
          for (const r of rows) {
            if (r.artwork_url) podcastArtwork[r.slug] = r.artwork_url;
          }
          enriched = results.map(ad => {
            if (ad.type === "podcast" && ad.podcastSlug && (!ad.imageUrl || ad.imageUrl === "")) {
              const artwork = podcastArtwork[ad.podcastSlug];
              if (artwork) return { ...ad, imageUrl: artwork };
            }
            return ad;
          });
        }
      } catch (artworkErr) {
        console.log("[FeedAds] Artwork enrichment skipped (podcasts table may not exist)");
      }
      res.json({ ads: enriched, frequency: freq });
    } catch (err) {
      console.error("[FeedAds] Batch error:", err);
      res.status(500).json({ error: "Failed to fetch feed ads" });
    }
  });

  app.get("/api/admin/episode-search", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const q = (req.query.q as string || "").trim();
      if (!q || q.length < 2) return res.json([]);
      const { rows } = await pool.query(
        `SELECT id, slug, podcast_name, episode_title, episode_slug, artwork_url, tldl, key_insights, quote, quote_attribution
         FROM landing_page_recaps
         WHERE (episode_title ILIKE $1 OR podcast_name ILIKE $1)
         AND published = true
         ORDER BY created_at DESC
         LIMIT 20`,
        [`%${q}%`]
      );
      res.json(rows);
    } catch (err) {
      console.error("[EpisodeSearch] Error:", err);
      res.status(500).json({ error: "Failed to search episodes" });
    }
  });

  app.post("/api/ad-events", async (req, res) => {
    try {
      const { adId, eventType } = req.body;
      if (!adId || !eventType || !["view", "click", "follow"].includes(eventType)) {
        return res.status(400).json({ error: "Invalid ad event data" });
      }
      const ad = await storage.getFeedAdById(Number(adId));
      if (!ad) return res.status(404).json({ error: "Ad not found" });
      await storage.createAdEvent({ adId: Number(adId), eventType });
      res.json({ success: true });
    } catch (err) {
      console.error("[AdEvents] Create error:", err);
      res.status(500).json({ error: "Failed to record ad event" });
    }
  });

  app.post("/api/ad-events/batch", async (req, res) => {
    try {
      const { events } = req.body;
      if (!Array.isArray(events) || events.length > 50) return res.status(400).json({ error: "Invalid events array (max 50)" });
      for (const evt of events) {
        if (evt.adId && ["view", "click", "follow"].includes(evt.eventType)) {
          const ad = await storage.getFeedAdById(Number(evt.adId));
          if (ad) {
            await storage.createAdEvent({ adId: Number(evt.adId), eventType: evt.eventType });
          }
        }
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[AdEvents] Batch error:", err);
      res.status(500).json({ error: "Failed to record ad events" });
    }
  });

  app.get("/api/admin/ad-analytics", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : null;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : null;

      let dateFilter = "";
      const params: any[] = [];
      if (startDate) {
        params.push(startDate);
        dateFilter += ` AND ae.created_at >= $${params.length}`;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        params.push(end);
        dateFilter += ` AND ae.created_at <= $${params.length}`;
      }

      const { rows } = await pool.query(
        `SELECT
          fa.id,
          fa.type,
          fa.title,
          fa.image_url,
          fa.is_active,
          fa.podcast_slug,
          fa.podcast_name,
          COALESCE(SUM(CASE WHEN ae.event_type = 'view' THEN 1 ELSE 0 END), 0)::int AS views,
          COALESCE(SUM(CASE WHEN ae.event_type = 'click' THEN 1 ELSE 0 END), 0)::int AS clicks,
          COALESCE(SUM(CASE WHEN ae.event_type = 'follow' THEN 1 ELSE 0 END), 0)::int AS follows
        FROM feed_ads fa
        LEFT JOIN ad_events ae ON fa.id = ae.ad_id ${dateFilter || ''}
        GROUP BY fa.id, fa.type, fa.title, fa.image_url, fa.is_active, fa.podcast_slug, fa.podcast_name
        ORDER BY views DESC, fa.id DESC`,
        params
      );

      const analytics = rows.map(r => ({
        id: r.id,
        type: r.type,
        title: r.title,
        imageUrl: r.image_url,
        isActive: r.is_active,
        podcastSlug: r.podcast_slug,
        podcastName: r.podcast_name,
        views: r.views,
        clicks: r.clicks,
        follows: r.follows,
        ctr: r.views > 0 ? ((r.clicks / r.views) * 100).toFixed(2) : "0.00",
      }));

      res.json(analytics);
    } catch (err) {
      console.error("[AdAnalytics] Error:", err);
      res.status(500).json({ error: "Failed to fetch ad analytics" });
    }
  });

  app.post("/api/admin/seed-episode-recap-ads", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { rows } = await pool.query(
        `SELECT slug, podcast_name, episode_title, episode_slug, artwork_url, tldl, key_insights, quote, quote_attribution
         FROM landing_page_recaps
         WHERE published = true AND tldl IS NOT NULL AND tldl != ''
         ORDER BY RANDOM()
         LIMIT 3`
      );
      if (rows.length === 0) return res.status(404).json({ error: "No episodes found to seed" });

      const created = [];
      for (const ep of rows) {
        const ad = await storage.createFeedAd({
          type: "episode_recap",
          title: ep.episode_title || "Episode Recap",
          description: ep.tldl || "",
          imageUrl: ep.artwork_url || "",
          podcastSlug: ep.slug,
          episodeSlug: ep.episode_slug,
          episodeTitle: ep.episode_title,
          episodeTldl: ep.tldl,
          episodeKeyInsights: ep.key_insights || [],
          episodeQuote: ep.quote || null,
          episodeQuoteAttribution: ep.quote_attribution || null,
          podcastName: ep.podcast_name,
          weight: 1,
          isActive: true,
        });
        created.push(ad);
      }
      res.json({ success: true, count: created.length, ads: created });
    } catch (err) {
      console.error("[SeedEpisodeRecapAds] Error:", err);
      res.status(500).json({ error: "Failed to seed episode recap ads" });
    }
  });

  app.get("/api/admin/support-articles", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const articles = await storage.getSupportArticles();
      res.json(articles);
    } catch (err) {
      console.error("[SupportArticles] List error:", err);
      res.status(500).json({ error: "Failed to fetch support articles" });
    }
  });

  app.post("/api/admin/support-articles", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { insertSupportArticleSchema } = await import("@shared/schema");
      const parsed = insertSupportArticleSchema.parse(req.body);
      const created = await storage.createSupportArticle(parsed);
      res.json(created);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ error: "Validation failed", details: err.issues });
      console.error("[SupportArticles] Create error:", err);
      res.status(500).json({ error: "Failed to create support article" });
    }
  });

  app.patch("/api/admin/support-articles/:id", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const existing = await storage.getSupportArticleById(id);
      if (!existing) return res.status(404).json({ error: "Article not found" });
      const { insertSupportArticleSchema } = await import("@shared/schema");
      const partial = insertSupportArticleSchema.partial().parse(req.body);
      const updated = await storage.updateSupportArticle(id, partial);
      res.json(updated);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ error: "Validation failed", details: err.issues });
      console.error("[SupportArticles] Update error:", err);
      res.status(500).json({ error: "Failed to update support article" });
    }
  });

  app.delete("/api/admin/support-articles/:id", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      await storage.deleteSupportArticle(Number(req.params.id));
      res.json({ success: true });
    } catch (err) {
      console.error("[SupportArticles] Delete error:", err);
      res.status(500).json({ error: "Failed to delete support article" });
    }
  });

  app.get("/api/admin/lists", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const result = await pool.query("SELECT * FROM podcast_lists ORDER BY category, sort_order, name");
      res.json(result.rows);
    } catch (err) {
      console.error("[Lists] Fetch error:", err);
      res.status(500).json({ error: "Failed to fetch lists" });
    }
  });

  app.post("/api/admin/lists", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { name, slug, description, podcastSlugs, category, sortOrder } = req.body;
      if (!name || typeof name !== "string") return res.status(400).json({ error: "Name is required" });
      if (!slug || typeof slug !== "string") return res.status(400).json({ error: "Slug is required" });
      if (podcastSlugs && !Array.isArray(podcastSlugs)) return res.status(400).json({ error: "podcastSlugs must be an array" });
      const result = await pool.query(
        `INSERT INTO podcast_lists (name, slug, description, podcast_slugs, category, sort_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [name.trim(), slug.trim(), description || null, podcastSlugs || [], category || null, Number(sortOrder) || 0]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      if (err.code === "23505") return res.status(409).json({ error: "A list with this slug already exists" });
      console.error("[Lists] Create error:", err);
      res.status(500).json({ error: "Failed to create list" });
    }
  });

  app.patch("/api/admin/lists/:id", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid list ID" });
      const { name, slug, description, podcastSlugs, category, sortOrder } = req.body;
      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;
      if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
      if (slug !== undefined) { fields.push(`slug = $${idx++}`); values.push(slug); }
      if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
      if (podcastSlugs !== undefined) { fields.push(`podcast_slugs = $${idx++}`); values.push(podcastSlugs); }
      if (category !== undefined) { fields.push(`category = $${idx++}`); values.push(category); }
      if (sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(sortOrder); }
      fields.push(`updated_at = NOW()`);
      values.push(id);
      const result = await pool.query(
        `UPDATE podcast_lists SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
        values
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "List not found" });
      res.json(result.rows[0]);
    } catch (err: any) {
      if (err.code === "23505") return res.status(409).json({ error: "A list with this slug already exists" });
      console.error("[Lists] Update error:", err);
      res.status(500).json({ error: "Failed to update list" });
    }
  });

  app.delete("/api/admin/lists/:id", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid list ID" });
      const result = await pool.query("DELETE FROM podcast_lists WHERE id = $1", [id]);
      if (result.rowCount === 0) return res.status(404).json({ error: "List not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("[Lists] Delete error:", err);
      res.status(500).json({ error: "Failed to delete list" });
    }
  });

  app.get("/api/lists", async (_req, res) => {
    try {
      const result = await pool.query("SELECT id, name, slug, description, podcast_slugs, category FROM podcast_lists ORDER BY category, sort_order, name");
      res.json(result.rows);
    } catch (err) {
      console.error("[Lists] Public fetch error:", err);
      res.status(500).json({ error: "Failed to fetch lists" });
    }
  });

  app.get("/api/lists/:slug", async (req, res) => {
    try {
      const result = await pool.query("SELECT * FROM podcast_lists WHERE slug = $1", [req.params.slug]);
      if (result.rows.length === 0) return res.status(404).json({ error: "List not found" });
      const list = result.rows[0];
      const podcastSlugs = list.podcast_slugs || [];
      let podcasts: any[] = [];
      if (podcastSlugs.length > 0) {
        const podcastResult = await pool.query(
          "SELECT slug, name, artwork_url, description, category FROM podcast_directory WHERE slug = ANY($1) ORDER BY array_position($1::text[], slug)",
          [podcastSlugs]
        );
        podcasts = podcastResult.rows;
      }
      res.json({ ...list, podcasts });
    } catch (err) {
      console.error("[Lists] Fetch single error:", err);
      res.status(500).json({ error: "Failed to fetch list" });
    }
  });

  setTimeout(async () => {
    try {
      const { seedProductionBooks } = await import("./seedProductionBooks");
      await seedProductionBooks();
    } catch (err) {
      console.error("[BookSeed] Seed failed:", err);
    }

    try {
      const { seedProductionProducts } = await import("./seedProductionProducts");
      await seedProductionProducts();
    } catch (err) {
      console.error("[ProductSeed] Seed failed:", err);
    }

    try {
      console.log("[ReferralSeed] Syncing referral tiers to 5-tier structure...");
      const defaultTiers = [
        { threshold: 3, rewardName: "Stickers", rewardDescription: "A fresh set of PodRise stickers for your laptop, water bottle, you name it.", sortOrder: 1 },
        { threshold: 5, rewardName: "T-Shirt", rewardDescription: "Rep the pod life with a soft-cotton PodRise crew tee.", sortOrder: 2 },
        { threshold: 10, rewardName: "Socks", rewardDescription: "Cozy PodRise-branded socks to keep your feet as happy as your ears.", sortOrder: 3 },
        { threshold: 15, rewardName: "Mystery Item", rewardDescription: "A surprise reward hand-picked by the PodRise team. What could it be?", sortOrder: 4 },
        { threshold: 25, rewardName: "AirPods", rewardDescription: "Top-tier audio for a top-tier referrer.", sortOrder: 5 },
      ];
      const validThresholds = defaultTiers.map(t => t.threshold);
      await pool.query(`DELETE FROM referral_tiers WHERE threshold != ALL($1::int[])`, [validThresholds]);
      for (const t of defaultTiers) {
        await pool.query(
          `INSERT INTO referral_tiers (threshold, reward_name, reward_description, sort_order, active)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (threshold) DO UPDATE SET reward_name = $2, reward_description = $3, sort_order = $4, active = true`,
          [t.threshold, t.rewardName, t.rewardDescription, t.sortOrder]
        );
      }
      console.log(`[ReferralSeed] Synced ${defaultTiers.length} referral tiers`);
    } catch (err) {
      console.error("[ReferralSeed] Failed to seed referral tiers:", err);
    }

    try {
      console.log("[SupportKB] Syncing support articles...");
      await pool.query("BEGIN");
      const defaultArticles = [
        { title: "What is PodRise?", category: "About", body: "PodRise is an AI-powered podcast intelligence platform. You follow the podcasts you care about, and PodRise delivers concise, AI-generated recaps of new episodes straight to your inbox and your feed. Think of it as your personal podcast briefing — all the knowledge, none of the 3-hour listening sessions (unless you want those too). PodRise also surfaces people mentioned, companies discussed, books recommended, and key topics covered in each episode.", sortOrder: 0 },
        { title: "For You vs Following Feed", category: "Feed & Content", body: "Your feed has two tabs:\n\n**For You** — A personalized feed that surfaces recaps from podcasts PodRise thinks you'll enjoy, based on your interests and listening patterns. Great for discovering new shows.\n\n**Following** — Shows recaps exclusively from podcasts you've explicitly followed. This is your curated, no-surprises feed.\n\nYou can switch between tabs at the top of your feed page anytime.", sortOrder: 1 },
        { title: "Following Podcasts", category: "Getting Started", body: "You can follow as many podcasts as you want — there are no limits, no caps, no hidden restrictions. Seriously, go wild.\n\nTo follow a podcast:\n1. Go to the Discover page.\n2. Search for a podcast by name, or browse curated collections.\n3. Click the \"Follow\" button.\n\nOnce you follow a podcast, new episode recaps will appear in your Following feed and be included in your daily email digest.", sortOrder: 2 },
        { title: "Email Recaps", category: "Email Recaps", body: "PodRise sends you a daily email recap for the podcasts you follow. Here's how it works:\n\n- PodRise checks for new episodes that were released the previous day (in your timezone).\n- If any of your followed podcasts published a new episode, you'll get a recap email at your chosen delivery time.\n- If none of your followed podcasts released anything that day, you won't get an email. No empty inboxes cluttered with \"nothing new today\" messages.\n- Each recap includes a TL;DL (Too Long; Didn't Listen) summary, key insights, notable quotes, and more.", sortOrder: 3 },
        { title: "Email Delivery Time", category: "Email Recaps", body: "You can choose exactly when your daily recap email arrives. Go to Settings > Email Delivery > Delivery Time and pick the time that works best for you. Morning coffee reading? Late-night catch-up? It's your call.", sortOrder: 4 },
        { title: "Timezone Settings", category: "Email Recaps", body: "PodRise uses your timezone to determine which episodes count as \"yesterday's\" releases and when to send your email. To adjust your timezone:\n\n1. Go to Settings.\n2. Under Email Delivery, find \"Timezone.\"\n3. Select your correct timezone from the dropdown.\n\nPodRise tries to auto-detect your timezone when you sign up, but you can change it anytime.", sortOrder: 5 },
        { title: "Pausing Emails", category: "Email Recaps", body: "Going on vacation? Need a break from your inbox? You can pause your recap emails:\n\n1. Go to Settings.\n2. Under Email Delivery, find \"Pause emails until.\"\n3. Pick a date — you won't receive any recap emails until after that date.\n\nYour feed will still update while emails are paused, so you won't miss anything. You just won't get the emails until you're back.", sortOrder: 6 },
        { title: "Saved Episodes / Bookmarks", category: "Feed & Content", body: "See a recap you want to come back to later? Save it!\n\n- Click the bookmark icon on any recap card in your feed to save it.\n- Access all your saved episodes from the \"Saved\" page in the sidebar navigation.\n- Each saved episode keeps the full recap, key insights, quotes, and all the good stuff.\n- You can remove saved episodes anytime by clicking the remove icon.\n\nBookmarks are your personal reading list for podcast knowledge.", sortOrder: 7 },
        { title: "Finding Your Followed Podcasts", category: "Getting Started", body: "To see all the podcasts you currently follow:\n\n- On mobile: Tap the sidebar menu and look for your followed podcasts list.\n- On desktop: Check the sidebar on the left — your followed podcasts are listed there.\n\nYou can also visit the Discover page to manage your follows or find new podcasts to add.", sortOrder: 8 },
        { title: "Pod Squad — Referral Program", category: "Pod Squad", body: "Pod Squad is PodRise's referral program. Invite your friends to join PodRise, and as they sign up using your referral link, you earn rewards!\n\nHow it works:\n1. Go to the Pod Squad page (accessible from the sidebar or your feed).\n2. Copy your unique referral link and share it with friends.\n3. When friends sign up using your link, your referral count goes up.\n4. Hit referral milestones to unlock increasingly awesome rewards.\n\nReward tiers include things like exclusive PodRise stickers, t-shirts, AirPods, and more. The more friends you invite, the better the rewards get. There's no limit to how many people you can refer.", sortOrder: 9 },
        { title: "Shop & Affiliates", category: "Shop & Affiliates", body: "PodRise surfaces products, books, and tools that are mentioned or recommended across podcast episodes. When you see a product link on PodRise, some of those links may be affiliate links.\n\nWhat does that mean?\n- If you click a product link and make a purchase, PodRise may earn a small commission at no extra cost to you.\n- This helps support PodRise and keep the platform running.\n- Affiliate relationships never influence which products are shown — PodRise surfaces what's actually discussed in episodes.\n\nFor full details, visit the disclosure page on PodRise. Transparency is important to us.", sortOrder: 10 },
        { title: "Dark Mode", category: "Display & Preferences", body: "PodRise supports both light and dark mode. To switch:\n\n1. Go to Settings.\n2. Under the \"Display\" section, you'll see Light and Dark toggle buttons.\n3. Click your preference.\n\nYour choice is saved and will persist across sessions. Night owls, rejoice.", sortOrder: 11 },
        { title: "Language Settings", category: "Display & Preferences", body: "You can set your preferred language in PodRise:\n\n1. Go to Settings.\n2. Under Account Settings, find \"Language.\"\n3. Select your preferred language from the dropdown.\n\nPodRise currently supports English, Spanish, French, German, Portuguese, Japanese, Korean, Chinese, Hindi, and Arabic.", sortOrder: 12 },
        { title: "Account Deletion", category: "Account", body: "If you want to delete your PodRise account:\n\n1. Go to Settings.\n2. Look for the account deletion option.\n3. Confirm the deletion.\n\nPlease note: Account deletion is permanent. All your data — including your followed podcasts, saved episodes, email preferences, and profile information — will be permanently removed. This action cannot be undone.\n\nIf you're having issues and considering deleting your account, we'd love to help first. Reach out to hello@podrise.com before you go.", sortOrder: 13 },
        { title: "Account Management", category: "Account", body: "From the Settings page, you can manage your account:\n\n- **Email**: Update your email address in the Account section.\n- **Display Name**: Set how your name appears.\n- **Birthday, Gender, Location**: Optional profile details you can add or update.\n- **Log out**: Scroll to the bottom of Settings and click \"Log out.\"\n\nAll changes are saved immediately when you click Save.", sortOrder: 14 },
        { title: "Subscriptions & Pricing", category: "Subscriptions & Pricing", body: "PodRise is free to use. You can follow as many podcasts as you want at no cost — no limits, no trial periods.\n\nPodRise Pro is available for users who want extra features, including personalized daily topic briefings (Pulse). Pro plans can be managed from the Subscription section in Settings, where you can also manage billing through Stripe.", sortOrder: 15 },
        { title: "Troubleshooting — Not Receiving Emails", category: "Troubleshooting", body: "If you're not receiving your daily recap emails:\n\n1. Check your spam/junk folder first. Sometimes email providers are overzealous.\n2. If you find PodRise emails in spam, mark them as \"not spam\" to train your email provider.\n3. Verify your email address is correct in Settings.\n4. Make sure you haven't set a \"Pause emails until\" date in Settings.\n5. Remember: if none of your followed podcasts released new episodes yesterday, no email is sent — that's by design.\n\nStill having issues? Contact hello@podrise.com and we'll sort it out.", sortOrder: 16 },
        { title: "Data & Privacy", category: "Data & Privacy", body: "PodRise takes your privacy seriously:\n\n- We only collect your email address and podcast preferences.\n- Your data is never sold to third parties.\n- Payment processing is handled entirely by Stripe — PodRise never sees or stores your credit card details.\n- You can delete your account and all associated data at any time from Settings.", sortOrder: 17 },
        { title: "Contact & Business Inquiries", category: "Contact", body: "For any questions, feedback, or business inquiries, reach out to hello@podrise.com. This includes:\n\n- General support questions\n- Podcasters with questions about their show on PodRise\n- Brands or advertisers interested in partnerships\n- Enterprise inquiries (PodRise for your company or employees)\n- Investment inquiries\n- Press and media requests\n\nWe read every email and try to respond promptly.", sortOrder: 18 },
        { title: "Enterprise", category: "Enterprise", body: "Yes! PodRise offers enterprise rollouts for companies that want to provide podcast intelligence to their employees. If you're interested in bringing PodRise to your team or organization, contact us at hello@podrise.com and we'll get you set up.", sortOrder: 19 },
      ];
      await pool.query("DELETE FROM support_articles");
      for (const a of defaultArticles) {
        await pool.query(
          `INSERT INTO support_articles (title, category, body, sort_order, active) VALUES ($1, $2, $3, $4, true)`,
          [a.title, a.category, a.body, a.sortOrder]
        );
      }
      await pool.query("COMMIT");
      console.log(`[SupportKB] Synced ${defaultArticles.length} support articles`);
    } catch (err) {
      await pool.query("ROLLBACK").catch(() => {});
      console.error("[SupportKB] Failed to seed support articles:", err);
    }

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS feed_ads (
          id SERIAL PRIMARY KEY,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          image_url TEXT NOT NULL,
          destination_url TEXT DEFAULT '',
          podcast_slug TEXT,
          weight INTEGER NOT NULL DEFAULT 1,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS feed_ad_settings (
          id SERIAL PRIMARY KEY,
          key TEXT NOT NULL UNIQUE,
          value TEXT NOT NULL
        );
        ALTER TABLE feed_ads ADD COLUMN IF NOT EXISTS episode_slug TEXT;
        ALTER TABLE feed_ads ADD COLUMN IF NOT EXISTS episode_title TEXT;
        ALTER TABLE feed_ads ADD COLUMN IF NOT EXISTS episode_tldl TEXT;
        ALTER TABLE feed_ads ADD COLUMN IF NOT EXISTS episode_key_insights TEXT[];
        ALTER TABLE feed_ads ADD COLUMN IF NOT EXISTS episode_quote TEXT;
        ALTER TABLE feed_ads ADD COLUMN IF NOT EXISTS episode_quote_attribution TEXT;
        ALTER TABLE feed_ads ADD COLUMN IF NOT EXISTS podcast_name TEXT;
        CREATE TABLE IF NOT EXISTS ad_events (
          id SERIAL PRIMARY KEY,
          ad_id INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_ad_events_ad_id ON ad_events(ad_id);
        CREATE INDEX IF NOT EXISTS idx_ad_events_created_at ON ad_events(created_at);
        CREATE TABLE IF NOT EXISTS site_settings (
          id SERIAL PRIMARY KEY,
          key TEXT NOT NULL UNIQUE,
          value JSONB NOT NULL DEFAULT '{}',
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      const { rows: feedAdCount } = await pool.query("SELECT COUNT(*)::int AS count FROM feed_ads");
      if (feedAdCount[0].count === 0) {
        console.log("[FeedAdSeed] No feed ads found — seeding defaults...");
        const demoAds = [
          { type: "podcast", title: "Fresh Air", description: "This is amazing podcast about the health of our earth, a 5 star podcast with over 1,000,000 downloads. Def a worthy follow.", imageUrl: "", destinationUrl: "", podcastSlug: "freshair", weight: 3 },
          { type: "podcast", title: "Hidden Brain", description: "One of the best psychology podcasts out there. Shankar Vedantam makes complex science feel personal and deeply human.", imageUrl: "", destinationUrl: "", podcastSlug: "hiddenbrain", weight: 3 },
          { type: "podcast", title: "How I Built This", description: "Guy Raz interviews the world's best known entrepreneurs to learn how they built their iconic companies. Over 500 episodes of pure gold.", imageUrl: "", destinationUrl: "", podcastSlug: "howibuiltthis", weight: 3 },
          { type: "podcast", title: "Acquired", description: "The #1 business podcast. Ben and David break down the greatest technology acquisitions and IPOs of all time. Obsessively researched.", imageUrl: "", destinationUrl: "", podcastSlug: "acquired", weight: 3 },
          { type: "podcast", title: "The Daily", description: "The biggest stories of our time, told by the best journalists in the world. 20 minutes a day is all you need to stay informed.", imageUrl: "", destinationUrl: "", podcastSlug: "thedaily", weight: 3 },
          { type: "regular", title: "AG1", description: "This is an amazing product, the best product in the world. Click here to save 50% off today on your first order www.ag1.com/podrise", imageUrl: "https://images.unsplash.com/photo-1622484212850-eb596d769edc?w=200&h=200&fit=crop", destinationUrl: "https://www.ag1.com/podrise", podcastSlug: null, weight: 3 },
          { type: "regular", title: "Notion", description: "The all-in-one workspace for your notes, tasks, wikis, and databases. Try it free — over 30 million people already have.", imageUrl: "https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png", destinationUrl: "https://www.notion.so", podcastSlug: null, weight: 3 },
          { type: "regular", title: "Riverside.fm", description: "Record podcasts and videos in studio quality from anywhere. Used by top podcasters worldwide. Get 20% off with code PODRISE.", imageUrl: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=200&h=200&fit=crop", destinationUrl: "https://riverside.fm", podcastSlug: null, weight: 3 },
          { type: "regular", title: "Linear", description: "The issue tracker built for modern software teams. Fast, beautiful, and designed to keep your team in flow.", imageUrl: "https://asset.brandfetch.io/iduDa181eM/id9wLqBTfn.png", destinationUrl: "https://linear.app", podcastSlug: null, weight: 3 },
          { type: "regular", title: "Superhuman", description: "The fastest email experience ever made. Get through your inbox twice as fast. Try it free for 30 days.", imageUrl: "https://asset.brandfetch.io/idZAb_dELm/idPJJfnOlY.png", destinationUrl: "https://superhuman.com", podcastSlug: null, weight: 3 },
        ];
        for (const ad of demoAds) {
          await pool.query(
            `INSERT INTO feed_ads (type, title, description, image_url, destination_url, podcast_slug, weight, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
            [ad.type, ad.title, ad.description, ad.imageUrl, ad.destinationUrl, ad.podcastSlug, ad.weight]
          );
        }
        await pool.query(`INSERT INTO feed_ad_settings (key, value) VALUES ('feed_ad_frequency', '5') ON CONFLICT (key) DO NOTHING`);
        console.log(`[FeedAdSeed] Seeded ${demoAds.length} demo feed ads`);
      } else {
        console.log(`[FeedAdSeed] ${feedAdCount[0].count} feed ads already exist, skipping`);
      }

      const { rows: recapAdCount } = await pool.query("SELECT COUNT(*)::int AS count FROM feed_ads WHERE type = 'episode_recap'");
      if (recapAdCount[0].count === 0) {
        console.log("[FeedAdSeed] No episode recap ads found — seeding 3 from landing page recaps...");
        const { rows: episodes } = await pool.query(
          `SELECT slug, podcast_name, episode_title, episode_slug, artwork_url, tldl, key_insights, quote, quote_attribution
           FROM landing_page_recaps
           WHERE published = true AND tldl IS NOT NULL AND tldl != ''
           ORDER BY RANDOM()
           LIMIT 3`
        );
        for (const ep of episodes) {
          await pool.query(
            `INSERT INTO feed_ads (type, title, description, image_url, podcast_slug, episode_slug, episode_title, episode_tldl, episode_key_insights, episode_quote, episode_quote_attribution, podcast_name, weight, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)`,
            ['episode_recap', ep.episode_title || 'Episode Recap', ep.tldl || '', ep.artwork_url || '', ep.slug, ep.episode_slug, ep.episode_title, ep.tldl, ep.key_insights || [], ep.quote || null, ep.quote_attribution || null, ep.podcast_name, 2]
          );
        }
        console.log(`[FeedAdSeed] Seeded ${episodes.length} episode recap ads`);
      } else {
        console.log(`[FeedAdSeed] ${recapAdCount[0].count} episode recap ads already exist, skipping`);
      }
    } catch (err) {
      console.error("[FeedAdSeed] Failed to seed feed ads:", err);
    }

    try {
      const { rows: listCount } = await pool.query("SELECT COUNT(*)::int AS count FROM podcast_lists");
      if (listCount[0].count === 0) {
        console.log("[Seed] No podcast lists found — seeding curated lists...");
        const { SEED_LISTS } = await import("./seedLists");
        for (const l of SEED_LISTS) {
          await pool.query(
            `INSERT INTO podcast_lists (name, slug, description, podcast_slugs, category, sort_order) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (slug) DO NOTHING`,
            [l.name, l.slug, l.description, l.podcastSlugs, l.category, l.sortOrder]
          );
        }
        console.log(`[Seed] Seeded ${SEED_LISTS.length} curated podcast lists`);
      }
    } catch (err) {
      console.error("[Seed] Failed to seed podcast lists:", err);
    }

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

    try {
      const { startDailyPulseScheduler } = await import("./dailyPulseScheduler");
      startDailyPulseScheduler();
    } catch (err) {
      console.error("[DailyPulse] Scheduler start failed:", err);
    }

    try {
      await storage.seedDefaultFeatureFlags();
      console.log("[FeatureFlags] Default flags seeded");
    } catch (err) {
      console.error("[FeatureFlags] Seed failed:", err);
    }
  }, 5000);

  return httpServer;
}
