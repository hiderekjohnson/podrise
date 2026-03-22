import type { Express } from "express";
import express from "express";
import type { Server } from "http";
import crypto from "crypto";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { PODCAST_ENRICHMENT_FIELDS, EPISODE_ENRICHMENT_FIELDS, EPISODE_ENRICHMENT_SCORE_FIELDS, computeEnrichmentFromRecord } from "@shared/enrichment";
import { z } from "zod";
import { insertBookBookmarkSchema, type LandingPageRecap } from "@shared/schema";
import { getUncachableResendClient } from "./resendClient";
import { markdownToEmailHtml, recapHasContent, type EpisodeMetaForEmail } from "./emailTemplate";
import { generateRecap } from "./recapGenerator";
import { ITUNES_ID_TO_SLUG } from "./podcastLandingMap";
import { normalizeTitle, SQL_NORMALIZE_TITLE } from "./utils/normalizeTitle";
import { pool } from "./db";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, unlinkSync, existsSync } from "fs";
import multer from "multer";
import path from "path";
import { authenticateRequest, getAuthUserId } from "./jwt";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    isAdmin?: boolean;
    impersonatingUserId?: number;
    originalUserId?: number;
    podcasterEmail?: string;
    oauthState?: string;
    spotifyOAuthState?: string;
    spotifyOAuthRedirect?: string;
    spotifyCodeVerifier?: string;
    signupContext?: string;
    referralCode?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
    adminRedirect?: string;
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
  shop: new DataCache<any>("shop"),
  podcastsDiscovery: new DataCache<any>("podcastsDiscovery"),
  podcastsDirectory: new DataCache<any[]>("podcastsDirectory"),
  sidebarData: new DataCache<any>("sidebarData", 5 * 60 * 1000),
};

class SlugCache<T> {
  private store = new Map<string, { data: T; cachedAt: number }>();
  constructor(private ttlMs: number) {}
  get(slug: string): T | null {
    const entry = this.store.get(slug);
    if (entry && (Date.now() - entry.cachedAt) < this.ttlMs) return entry.data;
    return null;
  }
  set(slug: string, data: T): void {
    this.store.set(slug, { data, cachedAt: Date.now() });
  }
  invalidate(slug: string): void {
    this.store.delete(slug);
  }
  invalidateByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key === prefix || key.startsWith(prefix + "::")) {
        this.store.delete(key);
      }
    }
  }
}

const entityLinksCache = new SlugCache<any>(30 * 60 * 1000);
const podcastRecapsCache = new SlugCache<any>(10 * 60 * 1000);

export async function warmDirectoryCaches(): Promise<void> {
  try {
    const { pool: warmPool } = await import("./db");

    console.log("[Cache] Pre-warming podcast discovery cache after server ready...");
    const [recentResult, statsResult] = await Promise.all([
      warmPool.query(`
        SELECT slug, episode_slug, episode_title, podcast_name, publish_date, artwork_url, tldl, hosts
        FROM landing_page_recaps
        WHERE publish_date IS NOT NULL AND published = true
        ORDER BY publish_date DESC, created_at DESC
        LIMIT 20
      `),
      warmPool.query(`
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
      `),
    ]);

    directoryCache.podcastsDiscovery.set({
      recentEpisodes: recentResult.rows.map((r: any) => ({
        slug: r.slug,
        episodeSlug: r.episode_slug,
        episodeTitle: r.episode_title,
        podcastName: r.podcast_name,
        publishDate: r.publish_date,
        artworkUrl: r.artwork_url,
        tldl: r.tldl,
        hosts: r.hosts,
      })),
      podcastStats: statsResult.rows.map((r: any) => ({
        slug: r.slug,
        podcastName: r.podcast_name,
        episodeCount: r.total_episodes > 0 ? r.total_episodes : parseInt(r.episode_count),
        latestEpisode: r.latest_episode,
        firstEpisode: r.first_episode,
      })),
    });

    console.log(`[Cache] Pre-warmed podcast discovery cache (${recentResult.rows.length} recent episodes, ${statsResult.rows.length} podcasts)`);
  } catch (err) {
    console.error("[Cache] Pre-warm failed:", err);
  }
}

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


const SOCIAL_PLATFORMS = [
  "facebook", "twitter", "instagram", "linkedin", "pinterest", "tiktok",
  "snapchat", "reddit", "youtube", "whatsapp", "telegram", "x.com",
  "fb", "ig", "t.co", "lnkd.in", "threads", "mastodon", "bluesky",
];

const SEARCH_ENGINES = [
  "google", "bing", "yahoo", "duckduckgo", "baidu", "yandex", "ecosia", "ask",
];

function classifyChannel(utmSource: string | null, utmMedium: string | null, utmCampaign: string | null, signupSource?: string | null, referrerDomain?: string | null): string {
  const src = (utmSource || "").toLowerCase().trim();
  const med = (utmMedium || "").toLowerCase().trim();
  const camp = (utmCampaign || "").toLowerCase().trim();
  const refDomain = (referrerDomain || "").toLowerCase().trim();
  const page = (signupSource || "").toLowerCase().trim();

  if (med === "email" || med === "e-mail" || med === "e_mail" || src === "email" || src === "e-mail") {
    return "Email";
  }

  if (med === "affiliate" || src === "affiliate") {
    return "Affiliate";
  }

  if (med === "display" || med === "cpm" || med === "banner" || med === "interstitial") {
    return "Display";
  }

  const isPaid = /cpc|ppc|paidsearch|paid_search|paid-search|cpv|cpa|cpp|paid/.test(med) || /^(.*shop|shopping)$/i.test(camp);
  const isSocialSource = SOCIAL_PLATFORMS.some(p => src.includes(p));
  const isSocialMedium = /social|social-network|social-media|social_network|social_media/.test(med);
  const isSocialReferrer = SOCIAL_PLATFORMS.some(p => refDomain.includes(p));

  if (isPaid && (isSocialSource || isSocialMedium || isSocialReferrer)) {
    return "Paid Social";
  }

  if (isSocialSource || isSocialMedium || isSocialReferrer) {
    return "Organic Social";
  }

  if (isPaid || med === "cpc" || med === "ppc") {
    return "Paid Search";
  }

  const isSearchSource = SEARCH_ENGINES.some(p => src.includes(p));
  const isSearchReferrer = SEARCH_ENGINES.some(p => refDomain.includes(p));
  if (isSearchSource || isSearchReferrer || med === "organic") {
    return "Organic Search";
  }

  if (med === "referral") {
    return "Referral";
  }

  if (src && src !== "direct" && src !== "(direct)" && med !== "none" && med !== "" && med !== "(not set)") {
    return "Referral";
  }

  if (refDomain && refDomain !== "" && !refDomain.includes("podrise") && !refDomain.includes("localhost") && !refDomain.includes("replit")) {
    return "Referral";
  }

  if (page === "landing_page" && src && src !== "direct") {
    return "Referral";
  }

  if (!src || src === "direct" || src === "(direct)") {
    if (!med || med === "none" || med === "(none)" || med === "(not set)") {
      return "Direct";
    }
  }

  return "Unassigned";
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
  let referrerDomain: string | null = null;
  if (rawSource) {
    try {
      const parsed = new URL(rawSource);
      referrerDomain = parsed.hostname;
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

  const utmSource = req.body?.utmSource || req.session?.utmSource || "direct";
  const utmMedium = req.body?.utmMedium || req.session?.utmMedium || "none";
  const utmCampaign = req.body?.utmCampaign || req.session?.utmCampaign || "none";
  const utmContent = req.body?.utmContent || req.session?.utmContent || null;
  const utmTerm = req.body?.utmTerm || req.session?.utmTerm || null;

  const channel = classifyChannel(utmSource, utmMedium, utmCampaign, source, referrerDomain);

  return { ipAddress: ip, userAgent: ua, deviceType, signupSource: source, signupSourceDetail: detail, utmSource, utmMedium, utmCampaign, utmContent, utmTerm, channel };
}

async function sendNewUserNotification(user: any, req: any, signupSource?: string) {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "Unknown";
  const location = "Unknown";
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

  const latestUser = await storage.getUserById(user.id) || user;
  const utmSource = latestUser.utmSource || "—";
  const utmMedium = latestUser.utmMedium || "—";
  const utmCampaign = latestUser.utmCampaign || "—";
  const utmContent = latestUser.utmContent || "—";
  const utmTerm = latestUser.utmTerm || "—";
  const userSignupSource = latestUser.signupSource || "—";
  const userSignupSourceDetail = latestUser.signupSourceDetail || "—";
  const userDeviceType = latestUser.deviceType || "—";

  const { client, fromEmail } = await getUncachableResendClient();
  await client.emails.send({
    from: `PodRise Alerts <${fromEmail}>`,
    to: ["derek@podrise.com", "jessica@podrise.com"],
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
<tr><td colspan="2" style="padding:16px 0 6px;font-size:11px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:1px;border-top:1px solid #eee;">Attribution</td></tr>
<tr><td style="padding:10px 0;color:#888;font-size:13px;vertical-align:top;">UTM Source</td><td style="padding:10px 0;font-size:14px;color:#1a1a1a;">${utmSource}</td></tr>
<tr><td style="padding:10px 0;color:#888;font-size:13px;vertical-align:top;">UTM Medium</td><td style="padding:10px 0;font-size:14px;color:#1a1a1a;">${utmMedium}</td></tr>
<tr><td style="padding:10px 0;color:#888;font-size:13px;vertical-align:top;">UTM Campaign</td><td style="padding:10px 0;font-size:14px;color:#1a1a1a;">${utmCampaign}</td></tr>
<tr><td style="padding:10px 0;color:#888;font-size:13px;vertical-align:top;">UTM Content</td><td style="padding:10px 0;font-size:14px;color:#1a1a1a;">${utmContent}</td></tr>
<tr><td style="padding:10px 0;color:#888;font-size:13px;vertical-align:top;">UTM Term</td><td style="padding:10px 0;font-size:14px;color:#1a1a1a;">${utmTerm}</td></tr>
<tr><td style="padding:10px 0;color:#888;font-size:13px;vertical-align:top;">Signup Source</td><td style="padding:10px 0;font-size:14px;color:#1a1a1a;">${userSignupSource}</td></tr>
<tr><td style="padding:10px 0;color:#888;font-size:13px;vertical-align:top;">Signup Source Detail</td><td style="padding:10px 0;font-size:14px;color:#1a1a1a;">${userSignupSourceDetail}</td></tr>
<tr><td style="padding:10px 0;color:#888;font-size:13px;vertical-align:top;">Device Type</td><td style="padding:10px 0;font-size:14px;color:#1a1a1a;">${userDeviceType}</td></tr>
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
            to: "derek@podrise.com",
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
  { path: "/shop", priority: "0.8", changefreq: "weekly" },
  { path: "/pod-squad", priority: "0.7", changefreq: "weekly" },
  { path: "/advertise", priority: "0.6", changefreq: "monthly" },
  { path: "/enterprise", priority: "0.6", changefreq: "monthly" },
  { path: "/we-heart-podcasters", priority: "0.5", changefreq: "monthly" },
  { path: "/about", priority: "0.5", changefreq: "monthly" },
  { path: "/updates", priority: "0.5", changefreq: "weekly" },
  { path: "/contact", priority: "0.4", changefreq: "monthly" },
  { path: "/login", priority: "0.3", changefreq: "monthly" },
  { path: "/privacy", priority: "0.3", changefreq: "yearly" },
  { path: "/terms", priority: "0.3", changefreq: "yearly" },
  { path: "/cookies", priority: "0.2", changefreq: "yearly" },
  { path: "/disclosure", priority: "0.2", changefreq: "yearly" },
];

const PODCAST_SLUGS = Object.values(ITUNES_ID_TO_SLUG);

let sitemapCache: { xml: string; builtAt: number } | null = null;
const SITEMAP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let sitemapBuildInProgress = false;
let sitemapBuildPromise: Promise<string> | null = null;

async function buildSitemapXml(): Promise<string> {
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
    const slugSet = new Set(PODCAST_SLUGS);
    const { rows: recapRows } = await pool.query<{ slug: string; episode_slug: string }>(
      `SELECT slug, episode_slug FROM landing_page_recaps WHERE slug = ANY($1) ORDER BY slug, publish_date DESC`,
      [PODCAST_SLUGS]
    );
    for (const row of recapRows) {
      if (!slugSet.has(row.slug)) continue;
      xml += `  <url>\n`;
      xml += `    <loc>${DOMAIN}/podcasts/${row.slug}/${row.episode_slug}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>monthly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
    }
  } catch (err) {
    console.error("[Sitemap] Error fetching recaps:", err);
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

async function buildSitemap(): Promise<string> {
  const now = Date.now();
  if (sitemapCache && now - sitemapCache.builtAt < SITEMAP_CACHE_TTL_MS) {
    return sitemapCache.xml;
  }
  if (sitemapCache) {
    if (!sitemapBuildInProgress) {
      sitemapBuildInProgress = true;
      buildSitemapXml()
        .then(xml => {
          sitemapCache = { xml, builtAt: Date.now() };
          console.log("[Sitemap] Cache refreshed successfully");
        })
        .catch(err => console.error("[Sitemap] Background build failed:", err))
        .finally(() => { sitemapBuildInProgress = false; });
    }
    return sitemapCache.xml;
  }
  if (sitemapBuildPromise) {
    return sitemapBuildPromise;
  }
  sitemapBuildPromise = buildSitemapXml()
    .then(xml => {
      sitemapCache = { xml, builtAt: Date.now() };
      sitemapBuildPromise = null;
      return xml;
    })
    .catch(err => {
      sitemapBuildPromise = null;
      throw err;
    });
  return sitemapBuildPromise;
}

function startSitemapPeriodicRefresh() {
  setInterval(() => {
    if (sitemapBuildInProgress) return;
    sitemapBuildInProgress = true;
    buildSitemapXml()
      .then(xml => {
        sitemapCache = { xml, builtAt: Date.now() };
        console.log("[Sitemap] Periodic cache refresh complete");
      })
      .catch(err => console.error("[Sitemap] Periodic refresh failed:", err))
      .finally(() => { sitemapBuildInProgress = false; });
  }, SITEMAP_CACHE_TTL_MS);
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

async function recalculateBookMentions(dbPool: any): Promise<{ created: number; books_matched: number }> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`DELETE FROM entity_episode_mentions WHERE entity_type = 'book'`);

    const { rows: recaps } = await client.query(
      `SELECT lpr.id, lpr.slug as podcast_slug, lpr.episode_slug, lpr.resources
       FROM landing_page_recaps lpr
       WHERE lpr.resources IS NOT NULL AND lpr.resources::text != '[]'`
    );

    const { rows: bookEnrichments } = await client.query(
      `SELECT slug, book_key FROM book_enrichments`
    );

    const bookKeyToSlug = new Map<string, string>();
    for (const b of bookEnrichments) {
      if (b.book_key && b.slug) bookKeyToSlug.set(b.book_key, b.slug);
    }

    let created = 0;
    let errors = 0;
    const matchedBooks = new Set<string>();

    for (const recap of recaps) {
      let resources: any[];
      try {
        const parsed = typeof recap.resources === 'string' ? JSON.parse(recap.resources) : recap.resources;
        if (!Array.isArray(parsed)) continue;
        resources = parsed;
      } catch { continue; }

      for (const r of resources) {
        if (!r || r.type !== 'book' || !r.name || r.name === '_books_checked') continue;

        const nameKey = r.name.toLowerCase().trim();
        const bookSlug = bookKeyToSlug.get(nameKey);
        if (!bookSlug) continue;

        matchedBooks.add(bookSlug);
        const context = r.context || '';

        try {
          const { rowCount } = await client.query(
            `INSERT INTO entity_episode_mentions (entity_type, entity_slug, recap_id, episode_slug, podcast_slug, context)
             VALUES ('book', $1, $2, $3, $4, $5) ON CONFLICT (entity_type, entity_slug, recap_id) DO NOTHING`,
            [bookSlug, recap.id, recap.episode_slug, recap.podcast_slug, context]
          );
          if (rowCount && rowCount > 0) created++;
        } catch (e: any) {
          errors++;
          if (errors <= 5) console.warn(`[RecalculateBookCounts] Insert error for ${bookSlug}:`, e.message);
        }
      }
    }

    await client.query('COMMIT');
    console.log(`[RecalculateBookCounts] Created ${created} mention records for ${matchedBooks.size} books${errors > 0 ? `, ${errors} errors` : ''}`);
    return { created, books_matched: matchedBooks.size };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
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
      ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_source TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_medium TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_content TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_term TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS channel TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS spotify_access_token TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS spotify_refresh_token TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS spotify_token_expires_at BIGINT;
    `);

    const { rows: allUsers } = await migrationPool.query(`SELECT id, utm_source, utm_medium, utm_campaign, signup_source, channel FROM users`);
    const needsUpdate = allUsers.filter(u => {
      const expected = classifyChannel(u.utm_source, u.utm_medium, u.utm_campaign, u.signup_source);
      return u.channel !== expected;
    });
    if (needsUpdate.length > 0) {
      console.log(`[Migration] Backfilling/updating channel for ${needsUpdate.length} users...`);
      for (const u of needsUpdate) {
        const ch = classifyChannel(u.utm_source, u.utm_medium, u.utm_campaign, u.signup_source);
        await migrationPool.query(`UPDATE users SET channel = $1 WHERE id = $2`, [ch, u.id]);
      }
      console.log(`[Migration] Channel backfill complete.`);
    }
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
      CREATE TABLE IF NOT EXISTS admin_alerts (
        id SERIAL PRIMARY KEY,
        api_name TEXT NOT NULL,
        error_type TEXT NOT NULL,
        error_message TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'critical',
        recipient_email TEXT NOT NULL,
        acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
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
      CREATE TABLE IF NOT EXISTS podcast_categories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT,
        icon TEXT,
        keywords TEXT[] DEFAULT '{}' NOT NULL,
        sort_order INTEGER DEFAULT 0 NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await migrationPool.query(`
      ALTER TABLE landing_page_recaps ADD COLUMN IF NOT EXISTS youtube_url TEXT;
      ALTER TABLE landing_page_recaps ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
      ALTER TABLE landing_page_recaps ADD COLUMN IF NOT EXISTS tabloid_headline TEXT;
      ALTER TABLE landing_page_recaps ADD COLUMN IF NOT EXISTS tabloid_sub_headline TEXT;
      ALTER TABLE podcast_directory ADD COLUMN IF NOT EXISTS youtube_url TEXT;
      ALTER TABLE podcast_directory ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
      ALTER TABLE podcast_directory ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0;
      ALTER TABLE podcast_directory ADD COLUMN IF NOT EXISTS feed_url TEXT;
      ALTER TABLE podcast_directory ADD COLUMN IF NOT EXISTS is_protected BOOLEAN DEFAULT false;
    `);
    
    // Note: podcast_directory has no legacy 'published' boolean column to backfill from.
    // It only has 'has_landing_page' (operational, controls page rendering) which is separate
    // from editorial 'status'. All podcast_directory rows default to status='published'.
    await migrationPool.query(`
      INSERT INTO admin_users (email, name, role)
      VALUES ('derek@podrise.com', 'Derek', 'owner')
      ON CONFLICT (email) DO UPDATE SET role = 'owner';
      INSERT INTO admin_users (email, name, role)
      VALUES ('jessica@podrise.com', 'Jessica', 'admin')
      ON CONFLICT (email) DO NOTHING;
    `);

    await migrationPool.query(`
      CREATE TABLE IF NOT EXISTS book_bookmarks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        book_slug TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, book_slug)
      );
    `);

    await migrationPool.query(`
      CREATE TABLE IF NOT EXISTS pending_transcript_queue (
        id SERIAL PRIMARY KEY,
        podcast_id TEXT NOT NULL,
        podcast_name TEXT NOT NULL,
        episode_guid TEXT NOT NULL,
        episode_title TEXT NOT NULL,
        taddy_uuid TEXT,
        priority INTEGER NOT NULL DEFAULT 50,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TIMESTAMP,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await migrationPool.query(`
      CREATE TABLE IF NOT EXISTS taddy_api_usage (
        id SERIAL PRIMARY KEY,
        month_key TEXT NOT NULL UNIQUE,
        call_count INTEGER NOT NULL DEFAULT 0,
        last_reset_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await migrationPool.query(`
      CREATE INDEX IF NOT EXISTS idx_pending_transcript_queue_status
      ON pending_transcript_queue (status, priority, created_at);
    `);

    await migrationPool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_transcript_queue_dedup
      ON pending_transcript_queue (podcast_id, episode_guid)
      WHERE status = 'pending';
    `);

    console.log("[startup] Schema migration check complete");

    
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
      CREATE INDEX IF NOT EXISTS idx_lpr_episode_slug ON landing_page_recaps (episode_slug);
      CREATE INDEX IF NOT EXISTS idx_lpr_slug_published ON landing_page_recaps (slug, published);
      CREATE INDEX IF NOT EXISTS idx_podcast_directory_slug ON podcast_directory (slug);
      CREATE INDEX IF NOT EXISTS idx_book_enrichments_slug ON book_enrichments (slug);
      CREATE INDEX IF NOT EXISTS idx_extracted_products_slug ON extracted_products (episode_slug, podcast_slug);
    `);
    await migrationPool.query(`
      CREATE TABLE IF NOT EXISTS backfill_jobs (
        id SERIAL PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'idle',
        total_records INTEGER,
        processed_count INTEGER NOT NULL DEFAULT 0,
        updated_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        last_run_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
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

    try {
      const result = await recalculateBookMentions(seedPool);
      if (result.created > 0) console.log(`[startup] Backfilled ${result.created} book episode mentions for ${result.books_matched} books`);
    } catch (e: any) {
      console.error("[startup] Book mentions seed error:", e.message);
    }
  } catch (e: any) {
    console.error("[startup] Entity seed error:", e.message);
  }

  app.use((req, res, next) => {
    if (req.path.startsWith("/api/webhooks/")) return next();
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
      ];
      if (allowedOrigins.some(re => re.test(origin))) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["X-Total-Count"],
    maxAge: 86400,
  }));

  async function logAuthError(endpoint: string, errorMessage: string, req: any) {
    try {
      const { pool } = await import("./db");
      const method = req.method || "GET";
      const userAgent = req.headers?.["user-agent"] || null;
      const severity = "error";
      const friendlySummary = `Authentication failed: ${errorMessage.substring(0, 200)}`;
      const existing = await pool.query(
        `SELECT id, occurrence_count FROM error_logs WHERE endpoint = $1 AND method = $2 AND http_status = $3 AND error_message = $4 LIMIT 1`,
        [endpoint, method, 500, errorMessage.substring(0, 2000)]
      );
      if (existing.rows.length > 0) {
        await pool.query(`UPDATE error_logs SET occurrence_count = occurrence_count + 1, last_occurred_at = NOW() WHERE id = $1`, [existing.rows[0].id]);
      } else {
        await pool.query(
          `INSERT INTO error_logs (endpoint, http_status, error_message, friendly_summary, severity, method, user_agent) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [endpoint, 500, errorMessage.substring(0, 2000), friendlySummary, severity, method, userAgent]
        );
      }
    } catch (logErr) {
      console.error("[ErrorTracker] Failed to log auth error:", logErr);
    }
  }

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

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.get("/podrise-logo.png", (_req, res) => {
    res.sendFile("logo-square-transparent.png", { root: "client/public", maxAge: "30d" });
  });

  app.get("/podrise-logo.svg", (_req, res) => {
    res.sendFile("logo-transparent.svg", { root: "client/public", maxAge: "30d" });
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

  interface RssGuest { name?: string; title?: string }
  interface RssSponsor { name?: string; deal?: string; url?: string }
  interface RssResource { name?: string; type?: string; url?: string }

  function buildRssXml(recaps: LandingPageRecap[], feedTitle: string, feedDescription: string, feedLink: string): string {
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

      const itemTitle = recap.tabloidHeadline
        ? recap.tabloidHeadline
        : `${recap.podcastName} - ${recap.episodeTitle}`;

      const itemDescription = recap.tabloidSubHeadline || recap.tldl || "";

      let guestNames: string[] = [];
      try {
        const parsed: RssGuest[] = recap.guests ? JSON.parse(recap.guests) : [];
        guestNames = (Array.isArray(parsed) ? parsed : [])
          .map((g) => (g.name || "").trim())
          .filter(Boolean);
      } catch (e) { console.warn(`[RSS] Failed to parse guests for ${recap.slug}/${recap.episodeSlug}:`, e); }

      let sponsorsList: RssSponsor[] = [];
      try {
        const rawSponsors = recap.sponsors ? JSON.parse(recap.sponsors) : [];
        sponsorsList = (Array.isArray(rawSponsors) ? rawSponsors : []).filter((s: RssSponsor) => s.name);
      } catch (e) { console.warn(`[RSS] Failed to parse sponsors for ${recap.slug}/${recap.episodeSlug}:`, e); sponsorsList = []; }

      let resourcesList: RssResource[] = [];
      try {
        const rawResources = typeof recap.resources === "string" ? JSON.parse(recap.resources) : (recap.resources || []);
        resourcesList = (Array.isArray(rawResources) ? rawResources : []).filter((r: RssResource) => r.name);
      } catch (e) { console.warn(`[RSS] Failed to parse resources for ${recap.slug}/${recap.episodeSlug}:`, e); resourcesList = []; }

      let insightsHtml = "";
      if (recap.keyInsights && recap.keyInsights.length > 0) {
        insightsHtml = `<h3>Key Insights</h3><ul>${recap.keyInsights.map((i: string) => `<li>${escapeXml(i)}</li>`).join("")}</ul>`;
      }

      let quoteHtml = "";
      if (recap.quote) {
        quoteHtml = `<blockquote>"${escapeXml(recap.quote)}"${recap.quoteAttribution ? ` - ${escapeXml(recap.quoteAttribution)}` : ""}</blockquote>`;
      }

      let guestsHtml = "";
      if (guestNames.length > 0) {
        guestsHtml = `<p><strong>Guests:</strong> ${escapeXml(guestNames.join(", "))}</p>`;
      }

      let linksHtml = `<p><a href="${escapeXml(episodeUrl)}">Read full recap on PodRise</a></p>`;
      if (recap.appleEpisodeUrl) {
        linksHtml += `<p><a href="${escapeXml(recap.appleEpisodeUrl)}">Listen on Apple Podcasts</a></p>`;
      }
      if (recap.spotifyEpisodeUrl) {
        linksHtml += `<p><a href="${escapeXml(recap.spotifyEpisodeUrl)}">Listen on Spotify</a></p>`;
      }
      if (recap.youtubeUrl) {
        linksHtml += `<p><a href="${escapeXml(recap.youtubeUrl)}">Watch on YouTube</a></p>`;
      }

      let sponsorsHtml = "";
      if (sponsorsList.length > 0) {
        sponsorsHtml = `<h3>Sponsors</h3><ul>${sponsorsList.map((s) => {
          let li = escapeXml(s.name || "");
          if (s.deal) li += ` — ${escapeXml(s.deal)}`;
          if (s.url) li = `<a href="${escapeXml(s.url)}">${li}</a>`;
          return `<li>${li}</li>`;
        }).join("")}</ul>`;
      }

      let resourcesHtml = "";
      if (resourcesList.length > 0) {
        resourcesHtml = `<h3>Resources Mentioned</h3><ul>${resourcesList.map((r) => {
          let li = escapeXml(r.name || "");
          if (r.type) li += ` (${escapeXml(r.type)})`;
          if (r.url) li = `<a href="${escapeXml(r.url)}">${li}</a>`;
          return `<li>${li}</li>`;
        }).join("")}</ul>`;
      }

      const contentHtml = `<h2>${escapeXml(recap.episodeTitle)}</h2>` +
        `<p><strong>Podcast:</strong> ${escapeXml(recap.podcastName)}</p>` +
        (recap.hosts ? `<p><strong>Hosts:</strong> ${escapeXml(recap.hosts)}</p>` : "") +
        guestsHtml +
        (recap.duration ? `<p><strong>Duration:</strong> ${escapeXml(recap.duration)}</p>` : "") +
        `<h3>TL;DL (Too Long; Didn't Listen)</h3><p>${escapeXml(recap.tldl)}</p>` +
        `<h3>What Happened</h3><p>${escapeXml(recap.whatHappened)}</p>` +
        insightsHtml +
        quoteHtml +
        sponsorsHtml +
        resourcesHtml +
        linksHtml;

      xml += `  <item>\n`;
      xml += `    <title>${escapeXml(itemTitle)}</title>\n`;
      xml += `    <link>${escapeXml(episodeUrl)}</link>\n`;
      xml += `    <guid isPermaLink="true">${escapeXml(episodeUrl)}</guid>\n`;
      xml += `    <pubDate>${pubDate}</pubDate>\n`;
      xml += `    <dc:creator>${escapeXml(recap.podcastName)}</dc:creator>\n`;
      xml += `    <category>${escapeXml(recap.podcastName)}</category>\n`;
      if (recap.keyTopics && Array.isArray(recap.keyTopics)) {
        for (const topic of recap.keyTopics) {
          if (topic) xml += `    <category>${escapeXml(topic)}</category>\n`;
        }
      }
      xml += `    <description>${escapeXml(itemDescription)}</description>\n`;
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
        to: "derek@podrise.com",
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
            to: "derek@podrise.com",
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
        to: "derek@podrise.com",
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
      pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]).catch(e => console.error("[LastLogin] Failed:", e));
      if (req.body.signupContext) {
        req.session.signupContext = req.body.signupContext;
      }

      const meta = extractSignupMetadata(req, req.body.signupSource, req.body.signupSourceDetail);
      pool.query(
        `UPDATE users SET signup_source = $1, signup_source_detail = $2, ip_address = $3, user_agent = $4, device_type = $5, utm_source = $6, utm_medium = $7, utm_campaign = $8, utm_content = $9, utm_term = $10, channel = $11 WHERE id = $12`,
        [meta.signupSource, meta.signupSourceDetail, meta.ipAddress, meta.userAgent, meta.deviceType, meta.utmSource, meta.utmMedium, meta.utmCampaign, meta.utmContent, meta.utmTerm, meta.channel, user.id]
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

      sendVerificationEmail(user).catch((err) => {
        console.error("[VerifyEmail] Failed to send:", err);
        import("./adminAlertService").then(({ sendCriticalApiAlert, isCriticalResendError, classifyResendError }) => {
          if (isCriticalResendError(err)) {
            sendCriticalApiAlert({ apiName: "Resend", errorType: classifyResendError(err), errorMessage: `Failed to send verification email to ${user.email}: ${err instanceof Error ? err.message : String(err)}`, severity: "warning", adminPath: "/admin/internal-tools/alerts" }).catch(() => {});
          }
        }).catch(() => {});
      });
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
      pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [row.user_id]).catch(e => console.error("[LastLogin] Failed:", e));
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
        `SELECT COALESCE(u.channel, 'Direct') AS source, COUNT(*)::int AS count FROM referrals r JOIN users u ON r.referred_user_id = u.id WHERE r.status = 'verified' GROUP BY COALESCE(u.channel, 'Direct') ORDER BY count DESC LIMIT 10`
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
            `UPDATE users SET signup_source = $1, signup_source_detail = $2, ip_address = $3, user_agent = $4, device_type = $5, utm_source = $6, utm_medium = $7, utm_campaign = $8, utm_content = $9, utm_term = $10, channel = $11 WHERE id = $12`,
            [qsMeta.signupSource, qsMeta.signupSourceDetail, qsMeta.ipAddress, qsMeta.userAgent, qsMeta.deviceType, qsMeta.utmSource, qsMeta.utmMedium, qsMeta.utmCampaign, qsMeta.utmContent, qsMeta.utmTerm, qsMeta.channel, user.id]
          ).catch(e => console.error("[SignupMeta] Failed:", e));

          sendVerificationEmail(user).catch((err) =>
            console.error("[VerifyEmail] Failed to send:", err)
          );

          req.session.userId = user.id;
          pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]).catch(e => console.error("[LastLogin] Failed:", e));
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
        pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]).catch(e => console.error("[LastLogin] Failed:", e));

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

      if (req.body.utmSource) req.session.utmSource = req.body.utmSource;
      if (req.body.utmMedium) req.session.utmMedium = req.body.utmMedium;
      if (req.body.utmCampaign) req.session.utmCampaign = req.body.utmCampaign;
      if (req.body.utmContent) req.session.utmContent = req.body.utmContent;
      if (req.body.utmTerm) req.session.utmTerm = req.body.utmTerm;

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await storage.createMagicLink(user.email, token, expiresAt);

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const redirectPath = req.body.redirect && typeof req.body.redirect === "string" && req.body.redirect.startsWith("/") && !req.body.redirect.startsWith("//") ? req.body.redirect : null;
      const magicUrl = redirectPath
        ? `${baseUrl}/api/auth/magic?token=${token}&redirect=${encodeURIComponent(redirectPath)}`
        : `${baseUrl}/api/auth/magic?token=${token}`;

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
        import("./adminAlertService").then(({ sendCriticalApiAlert, isCriticalResendError, classifyResendError }) => {
          if (isCriticalResendError(sendResult.error)) {
            sendCriticalApiAlert({ apiName: "Resend", errorType: classifyResendError(sendResult.error), errorMessage: `Failed to send login email to ${input.email}: ${sendResult.error?.message || "Unknown error"}`, severity: "critical", adminPath: "/admin/internal-tools/alerts" }).catch(() => {});
          }
        }).catch(() => {});
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
    try {
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
      logAuthError("/api/auth/magic", `User not found for magic link email: ${magicLink.email}`, req);
      return res.redirect("/login?error=invalid");
    }

    await storage.markMagicLinkUsed(magicLink.id);
    req.session.userId = user.id;
    pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]).catch(e => console.error("[LastLogin] Failed:", e));

    delete req.session.utmSource;
    delete req.session.utmMedium;
    delete req.session.utmCampaign;
    delete req.session.utmContent;
    delete req.session.utmTerm;

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
      const redirectParam = req.query.redirect as string | undefined;
      const safeRedirect = redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//") ? redirectParam : null;
      if (safeRedirect && user.onboardingCompleted) {
        res.redirect(safeRedirect);
      } else {
        res.redirect(user.onboardingCompleted ? "/dashboard" : "/onboarding");
      }
    });
    } catch (err: any) {
      console.error("[MagicLink] Auth error:", err);
      logAuthError("/api/auth/magic", err?.message || "Unknown magic link error", req);
      res.redirect("/login?error=invalid");
    }
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

    delete req.session.utmSource;
    delete req.session.utmMedium;
    delete req.session.utmCampaign;
    delete req.session.utmContent;
    delete req.session.utmTerm;
    delete req.session.adminRedirect;
    if (req.query.utm_source) req.session.utmSource = req.query.utm_source as string;
    if (req.query.utm_medium) req.session.utmMedium = req.query.utm_medium as string;
    if (req.query.utm_campaign) req.session.utmCampaign = req.query.utm_campaign as string;
    if (req.query.utm_content) req.session.utmContent = req.query.utm_content as string;
    if (req.query.utm_term) req.session.utmTerm = req.query.utm_term as string;
    if (req.query.redirect && typeof req.query.redirect === "string" && req.query.redirect.startsWith("/") && !req.query.redirect.startsWith("//")) {
      req.session.adminRedirect = req.query.redirect;
    }
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}&access_type=offline&prompt=select_account`;
    req.session.save((err) => {
      if (err) console.error("[GoogleAuth] Session save error before redirect:", err);
      res.redirect(url);
    });
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      if (!code) {
        const msg = "Google OAuth callback missing code param";
        console.error("[GoogleAuth]", msg);
        logAuthError("/api/auth/google/callback", msg, req);
        return res.redirect("/login?error=invalid");
      }
      if (!state || state !== req.session.oauthState) {
        const msg = `State mismatch — query state: ${state?.substring(0, 8) || "NONE"}, session state: ${req.session.oauthState?.substring(0, 8) || "MISSING"}, sessionID: ${req.sessionID?.substring(0, 8)}`;
        console.error("[GoogleAuth]", msg);
        logAuthError("/api/auth/google/callback", msg, req);
        return res.redirect("/login?error=invalid");
      }
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
        const msg = `Token exchange failed: ${tokenData.error || "no access_token"}`;
        console.error("[GoogleAuth]", msg);
        logAuthError("/api/auth/google/callback", msg, req);
        return res.redirect("/login?error=invalid");
      }

      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const googleUser = await userInfoRes.json() as { id: string; email: string; name?: string; picture?: string };
      if (!googleUser.email) {
        logAuthError("/api/auth/google/callback", "Google user info returned no email", req);
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
          `UPDATE users SET google_id = $1, email_verified = true, signup_source = $2, signup_source_detail = $3, ip_address = $4, user_agent = $5, device_type = $6, utm_source = $7, utm_medium = $8, utm_campaign = $9, utm_content = $10, utm_term = $11, channel = $12 WHERE id = $13`,
          [googleUser.id, meta.signupSource, meta.signupSourceDetail, meta.ipAddress, meta.userAgent, meta.deviceType, meta.utmSource, meta.utmMedium, meta.utmCampaign, meta.utmContent, meta.utmTerm, meta.channel, user.id]
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
        pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]).catch(e => console.error("[LastLogin] Failed:", e));

        try {
          const { db: adminDb } = await import("./db");
          const { eq: adminEq } = await import("drizzle-orm");
          const { adminUsers: adminUsersTable } = await import("@shared/schema");
          const [adminRow] = await adminDb.select().from(adminUsersTable).where(adminEq(adminUsersTable.email, user.email)).limit(1);
          req.session.isAdmin = !!adminRow;
        } catch (e) {
          console.error("[GoogleAuth] Failed to check admin status:", e);
          req.session.isAdmin = false;
        }

        const adminRedirect = req.session.adminRedirect;
        delete req.session.utmSource;
        delete req.session.utmMedium;
        delete req.session.utmCampaign;
        delete req.session.utmContent;
        delete req.session.utmTerm;
        delete req.session.adminRedirect;
        req.session.save(() => {
          if (adminRedirect) {
            res.redirect(adminRedirect);
          } else {
            res.redirect("/onboarding");
          }
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
      pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]).catch(e => console.error("[LastLogin] Failed:", e));

      try {
        const { db: adminDb } = await import("./db");
        const { eq: adminEq } = await import("drizzle-orm");
        const { adminUsers: adminUsersTable } = await import("@shared/schema");
        const [adminRow] = await adminDb.select().from(adminUsersTable).where(adminEq(adminUsersTable.email, user.email)).limit(1);
        req.session.isAdmin = !!adminRow;
      } catch (e) {
        console.error("[GoogleAuth] Failed to check admin status:", e);
        req.session.isAdmin = false;
      }

      const adminRedirect = req.session.adminRedirect;
      delete req.session.utmSource;
      delete req.session.utmMedium;
      delete req.session.utmCampaign;
      delete req.session.utmContent;
      delete req.session.utmTerm;
      delete req.session.adminRedirect;
      req.session.save(() => {
        if (adminRedirect) {
          res.redirect(adminRedirect);
        } else {
          res.redirect(user.onboardingCompleted ? "/dashboard" : "/onboarding");
        }
      });
    } catch (err: any) {
      console.error("[GoogleAuth] Callback error:", err);
      logAuthError("/api/auth/google/callback", err?.message || "Unknown Google OAuth error", req);
      res.redirect("/login?error=invalid");
    }
  });

  app.get("/api/auth/spotify", (req, res) => {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    if (!clientId) return res.status(500).json({ message: "Spotify OAuth not configured" });

    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/auth/spotify/callback`;
    const scope = "user-library-read user-follow-read";
    const state = crypto.randomBytes(16).toString("hex");
    req.session.spotifyOAuthState = state;

    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
    req.session.spotifyCodeVerifier = codeVerifier;

    let returnTo = "/settings?tab=spotify";
    const rawReturn = req.query.return_to as string;
    if (rawReturn && typeof rawReturn === "string" && rawReturn.startsWith("/") && !rawReturn.startsWith("//") && !rawReturn.includes("://")) {
      returnTo = rawReturn;
    }
    req.session.spotifyOAuthRedirect = returnTo;

    const url = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}&code_challenge_method=S256&code_challenge=${codeChallenge}&show_dialog=true`;
    req.session.save((err) => {
      if (err) console.error("[SpotifyAuth] Session save error:", err);
      res.redirect(url);
    });
  });

  app.get("/api/auth/spotify/callback", async (req, res) => {
    try {
      const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

      const returnTo = req.session.spotifyOAuthRedirect || "/settings?tab=spotify";
      delete req.session.spotifyOAuthRedirect;
      const sep = returnTo.includes("?") ? "&" : "?";

      if (error) {
        console.warn("[SpotifyAuth] User denied or error:", error);
        delete req.session.spotifyOAuthState;
        return res.redirect(`${returnTo}${sep}spotify_error=denied`);
      }

      if (!code) {
        console.error("[SpotifyAuth] Missing code param");
        delete req.session.spotifyOAuthState;
        return res.redirect(`${returnTo}${sep}spotify_error=invalid`);
      }

      if (!state || state !== req.session.spotifyOAuthState) {
        console.error("[SpotifyAuth] State mismatch");
        delete req.session.spotifyOAuthState;
        return res.redirect(`${returnTo}${sep}spotify_error=invalid`);
      }
      delete req.session.spotifyOAuthState;

      const userId = getAuthUserId(req);
      if (!userId) return res.redirect("/login");

      const clientId = process.env.SPOTIFY_CLIENT_ID!;
      const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${baseUrl}/api/auth/spotify/callback`;
      const codeVerifier = req.session.spotifyCodeVerifier;
      delete req.session.spotifyCodeVerifier;

      const tokenBody: Record<string, string> = {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
      };
      if (codeVerifier) {
        tokenBody.code_verifier = codeVerifier;
      }

      const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
        },
        body: new URLSearchParams(tokenBody),
      });

      const tokenData: { access_token?: string; refresh_token?: string; expires_in?: number; error?: string } = await tokenRes.json();
      if (!tokenData.access_token) {
        console.error("[SpotifyAuth] Token exchange failed:", tokenData.error);
        import("./adminAlertService").then(({ sendCriticalApiAlert }) =>
          sendCriticalApiAlert({ apiName: "Spotify", errorType: "Token Exchange Failed", errorMessage: `Spotify OAuth token exchange failed for user. Error: ${tokenData.error || "unknown"}`, severity: "warning", adminPath: "/admin/internal-tools/alerts" })
        ).catch(() => {});
        return res.redirect(`${returnTo}${sep}spotify_error=token_failed`);
      }

      const expiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;

      await pool.query(
        `UPDATE users SET spotify_access_token = $1, spotify_refresh_token = $2, spotify_token_expires_at = $3 WHERE id = $4`,
        [tokenData.access_token, tokenData.refresh_token || null, expiresAt, userId]
      );

      req.session.save(() => {
        res.redirect(`${returnTo}${sep}spotify_connected=true`);
      });
    } catch (err: unknown) {
      console.error("[SpotifyAuth] Callback error:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      import("./adminAlertService").then(({ sendCriticalApiAlert }) =>
        sendCriticalApiAlert({ apiName: "Spotify", errorType: "OAuth Callback Error", errorMessage: `Spotify OAuth callback failed: ${errMsg}`, severity: "warning", adminPath: "/admin/internal-tools/alerts" })
      ).catch(() => {});
      res.redirect("/settings?tab=spotify&spotify_error=unknown");
    }
  });

  async function refreshSpotifyToken(userId: number): Promise<string | null> {
    const result = await pool.query(
      `SELECT spotify_access_token, spotify_refresh_token, spotify_token_expires_at FROM users WHERE id = $1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row?.spotify_refresh_token) return null;

    if (row.spotify_access_token && row.spotify_token_expires_at && Date.now() < Number(row.spotify_token_expires_at) - 60000) {
      return row.spotify_access_token;
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID!;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;

    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: row.spotify_refresh_token,
      }),
    });

    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) {
      console.error("[SpotifyAuth] Token refresh failed:", tokenData.error);
      await pool.query(
        `UPDATE users SET spotify_access_token = NULL, spotify_refresh_token = NULL, spotify_token_expires_at = NULL WHERE id = $1`,
        [userId]
      );
      return null;
    }

    const expiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;
    await pool.query(
      `UPDATE users SET spotify_access_token = $1, spotify_refresh_token = COALESCE($2, spotify_refresh_token), spotify_token_expires_at = $3 WHERE id = $4`,
      [tokenData.access_token, tokenData.refresh_token || null, expiresAt, userId]
    );

    return tokenData.access_token;
  }

  app.get("/api/spotify/status", async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const result = await pool.query(
      `SELECT spotify_refresh_token FROM users WHERE id = $1`,
      [userId]
    );
    res.json({ connected: !!result.rows[0]?.spotify_refresh_token, configured: !!process.env.SPOTIFY_CLIENT_ID });
  });

  app.post("/api/spotify/disconnect", async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    await pool.query(
      `UPDATE users SET spotify_access_token = NULL, spotify_refresh_token = NULL, spotify_token_expires_at = NULL WHERE id = $1`,
      [userId]
    );
    res.json({ success: true });
  });

  app.get("/api/spotify/shows", async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    try {
      let accessToken = await refreshSpotifyToken(userId);
      if (!accessToken) {
        return res.status(401).json({ message: "Spotify not connected", spotifyDisconnected: true });
      }

      const shows: any[] = [];
      let url: string | null = "https://api.spotify.com/v1/me/shows?limit=50";
      let retried401 = false;

      while (url) {
        const spotRes = await fetch(url, {
          headers: { "Authorization": `Bearer ${accessToken}` },
        });

        if (spotRes.status === 401 && !retried401) {
          retried401 = true;
          await pool.query(`UPDATE users SET spotify_access_token = NULL, spotify_token_expires_at = NULL WHERE id = $1`, [userId]);
          const refreshed = await refreshSpotifyToken(userId);
          if (refreshed) {
            accessToken = refreshed;
            continue;
          }
          await pool.query(
            `UPDATE users SET spotify_access_token = NULL, spotify_refresh_token = NULL, spotify_token_expires_at = NULL WHERE id = $1`,
            [userId]
          );
          return res.status(401).json({ message: "Spotify token expired", spotifyDisconnected: true });
        }

        if (spotRes.status === 401) {
          await pool.query(
            `UPDATE users SET spotify_access_token = NULL, spotify_refresh_token = NULL, spotify_token_expires_at = NULL WHERE id = $1`,
            [userId]
          );
          return res.status(401).json({ message: "Spotify token expired", spotifyDisconnected: true });
        }

        if (spotRes.status === 403) {
          return res.status(403).json({ message: "Spotify access was revoked. Please reconnect.", spotifyDisconnected: true });
        }

        if (spotRes.status === 429) {
          const retryAfter = spotRes.headers.get("retry-after") || "30";
          console.warn("[SpotifyShows] Rate limited, retry-after:", retryAfter);
          return res.status(429).json({ message: `Spotify rate limit reached. Please try again in ${retryAfter} seconds.`, retryAfter: parseInt(retryAfter, 10) });
        }

        if (!spotRes.ok) {
          console.error("[SpotifyShows] API error:", spotRes.status);
          return res.status(502).json({ message: "Spotify is temporarily unavailable. Please try again later." });
        }

        const data = await spotRes.json() as any;
        for (const item of (data.items || [])) {
          const show = item.show;
          if (show) {
            shows.push({
              spotifyId: show.id,
              name: show.name,
              publisher: show.publisher || "",
              description: (show.description || "").substring(0, 200),
              artworkUrl: show.images?.[0]?.url || "",
              totalEpisodes: show.total_episodes || 0,
              spotifyUrl: show.external_urls?.spotify || "",
            });
          }
        }
        url = data.next || null;
      }

      const user = await storage.getUserById(userId);
      const currentPodcasts = user?.podcasts || [];
      const followedItunesIds = new Set(
        currentPodcasts.map((p: string) => {
          try { return JSON.parse(p).id; } catch { return p; }
        }).filter(Boolean)
      );

      const pdResult = await pool.query(`SELECT itunes_id, spotify_url FROM podcast_directory WHERE spotify_url IS NOT NULL AND spotify_url != ''`);
      const spotifyUrlToItunesId = new Map<string, string>();
      for (const row of pdResult.rows) {
        if (row.spotify_url) {
          const match = row.spotify_url.match(/show\/([a-zA-Z0-9]+)/);
          if (match) spotifyUrlToItunesId.set(match[1], row.itunes_id);
        }
      }

      const enrichedShows = shows.map(show => {
        const matchedItunesId = spotifyUrlToItunesId.get(show.spotifyId);
        return {
          ...show,
          alreadyFollowed: matchedItunesId ? followedItunesIds.has(matchedItunesId) : false,
          itunesId: matchedItunesId || null,
        };
      });

      res.json({ shows: enrichedShows });
    } catch (err: any) {
      console.error("[SpotifyShows] Error:", err);
      res.status(500).json({ message: "Failed to fetch Spotify shows" });
    }
  });

  app.post("/api/spotify/bulk-follow", async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const { shows } = req.body as { shows: Array<{ spotifyId: string; name: string; artworkUrl: string }> };
    if (!shows || !Array.isArray(shows) || shows.length === 0) {
      return res.status(400).json({ message: "No shows provided" });
    }

    if (shows.length > 100) {
      return res.status(400).json({ message: "Too many shows (max 100)" });
    }

    try {
      const user = await storage.getUserById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      let currentPodcasts = [...(user.podcasts || [])];
      const existingIds = new Set(
        currentPodcasts.map((p: string) => {
          try { return JSON.parse(p).id; } catch { return p; }
        }).filter(Boolean)
      );

      const results: Array<{ spotifyId: string; name: string; status: string; slug?: string }> = [];

      for (const show of shows) {
        try {
          let pd: any = null;

          const pdBySpotify = await pool.query(
            `SELECT itunes_id, name, slug, artwork_url FROM podcast_directory WHERE spotify_url LIKE $1 LIMIT 1`,
            [`%${show.spotifyId}%`]
          );
          pd = pdBySpotify.rows[0] || null;

          if (!pd) {
            const searchRes = await fetch(
              `https://itunes.apple.com/search?term=${encodeURIComponent(show.name)}&media=podcast&limit=5`
            );
            const searchData = await searchRes.json() as any;
            const itunesResults = searchData.results || [];

            const nameNorm = show.name.toLowerCase().trim();
            const itunesMatch = itunesResults.find((r: any) => {
              const n = (r.collectionName || r.trackName || "").toLowerCase().trim();
              return n === nameNorm || n.includes(nameNorm) || nameNorm.includes(n);
            }) || itunesResults[0];

            if (itunesMatch) {
              const itunesId = String(itunesMatch.collectionId || itunesMatch.trackId);
              const pdExisting = await pool.query(
                `SELECT itunes_id, name, slug, artwork_url FROM podcast_directory WHERE itunes_id = $1`,
                [itunesId]
              );
              pd = pdExisting.rows[0] || null;

              if (!pd) {
                let slug = show.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                const existingSlug = await pool.query(`SELECT slug FROM podcast_directory WHERE slug = $1`, [slug]);
                if (existingSlug.rows.length > 0) slug = `${slug}-${itunesId}`;

                const artUrl = (itunesMatch.artworkUrl600 || itunesMatch.artworkUrl100 || show.artworkUrl || "").replace(/\d+x\d+bb/, "600x600bb");
                const spotifyUrl = `https://open.spotify.com/show/${show.spotifyId}`;

                await pool.query(
                  `INSERT INTO podcast_directory (itunes_id, name, slug, artwork_url, spotify_url, status, has_landing_page, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5, 'requested', false, NOW(), NOW())
                   ON CONFLICT (itunes_id) DO UPDATE SET spotify_url = COALESCE(NULLIF(podcast_directory.spotify_url, ''), $5)`,
                  [itunesId, show.name, slug, artUrl, spotifyUrl]
                );

                const insertedResult = await pool.query(
                  `SELECT itunes_id, name, slug, artwork_url FROM podcast_directory WHERE itunes_id = $1`,
                  [itunesId]
                );
                pd = insertedResult.rows[0] || null;

                if (pd) {
                  (async () => {
                    try {
                      const lookupRes = await fetch(`https://itunes.apple.com/lookup?id=${itunesId}&media=podcast`);
                      const lookupJson = await lookupRes.json() as any;
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
                          [description, category, appleUrl, highResArt, trackCount, itunesId]
                        );
                      }
                    } catch (enrichErr) {
                      console.warn("[SpotifyBulkFollow] iTunes enrichment error:", enrichErr);
                    }
                  })();
                }
              }
            }
          }

          if (!pd) {
            let slug = show.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            const fakeItunesId = `spotify-${show.spotifyId}`;
            const existingSlug = await pool.query(`SELECT slug FROM podcast_directory WHERE slug = $1`, [slug]);
            if (existingSlug.rows.length > 0) slug = `${slug}-${show.spotifyId}`;

            const artUrl = (show.artworkUrl || "").replace(/\d+x\d+bb/, "600x600bb");
            const spotifyUrl = `https://open.spotify.com/show/${show.spotifyId}`;

            await pool.query(
              `INSERT INTO podcast_directory (itunes_id, name, slug, artwork_url, spotify_url, status, has_landing_page, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, 'requested', false, NOW(), NOW())
               ON CONFLICT (itunes_id) DO NOTHING`,
              [fakeItunesId, show.name, slug, artUrl, spotifyUrl]
            );
            const insertedResult = await pool.query(
              `SELECT itunes_id, name, slug, artwork_url FROM podcast_directory WHERE itunes_id = $1`,
              [fakeItunesId]
            );
            pd = insertedResult.rows[0] || null;
          }

          if (!pd) {
            results.push({ spotifyId: show.spotifyId, name: show.name, status: "not_found" });
            continue;
          }

          if (existingIds.has(pd.itunes_id.toString())) {
            results.push({ spotifyId: show.spotifyId, name: show.name, status: "already_followed", slug: pd.slug });
            continue;
          }

          const artworkResult = await pool.query(
            `SELECT artwork_url FROM landing_page_recaps WHERE slug = $1 LIMIT 1`,
            [pd.slug]
          );
          const finalArtworkUrl = artworkResult.rows[0]?.artwork_url || pd.artwork_url || "";

          const newEntry = JSON.stringify({
            id: pd.itunes_id.toString(),
            name: pd.name,
            artworkUrl: finalArtworkUrl,
          });

          currentPodcasts.push(newEntry);
          existingIds.add(pd.itunes_id.toString());
          results.push({ spotifyId: show.spotifyId, name: show.name, status: "followed", slug: pd.slug });
        } catch (err) {
          console.error(`[SpotifyBulkFollow] Error following ${show.name}:`, err);
          results.push({ spotifyId: show.spotifyId, name: show.name, status: "error" });
        }
      }

      await pool.query(
        `UPDATE users SET podcasts = $1 WHERE id = $2`,
        [currentPodcasts, userId]
      );

      const followed = results.filter(r => r.status === "followed").length;
      res.json({ success: true, followed, results });
    } catch (err) {
      console.error("[SpotifyBulkFollow] Error:", err);
      res.status(500).json({ message: "Failed to bulk follow" });
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
      const [{ rows: recaps }, { rows: quotes }, { rows: mentions }, { rows: podcastDirs }, { rows: products }] = await Promise.all([
        pool.query(
          `SELECT lpr.slug, lpr.episode_slug, lpr.podcast_name, lpr.episode_title,
                  lpr.publish_date, lpr.artwork_url, lpr.tldl, lpr.key_insights,
                  lpr.what_happened, lpr.quote, lpr.quote_attribution,
                  lpr.guests, lpr.resources, lpr.hosts, lpr.sponsors, lpr.key_topics,
                  lpr.spotify_episode_url, lpr.youtube_url, lpr.id as recap_id,
                  lpr.tabloid_sub_headline, lpr.duration
           FROM landing_page_recaps lpr
           INNER JOIN unnest($1::text[], $2::text[]) AS bm(p_slug, e_slug)
             ON lpr.slug = bm.p_slug AND lpr.episode_slug = bm.e_slug
           WHERE lpr.published = true`,
          [podcastSlugs, episodeSlugs]
        ),
        pool.query(
          `SELECT eq.podcast_slug, eq.episode_slug, eq.id, eq.speaker_name, eq.speaker_role,
                  eq.quote_text, eq.context, eq.quote_type, eq.sort_order
           FROM episode_quotes eq
           INNER JOIN unnest($1::text[], $2::text[]) AS bm(p_slug, e_slug)
             ON eq.podcast_slug = bm.p_slug AND eq.episode_slug = bm.e_slug
           ORDER BY eq.podcast_slug, eq.episode_slug, eq.sort_order`,
          [podcastSlugs, episodeSlugs]
        ),
        pool.query(
          `SELECT eem.podcast_slug, eem.episode_slug, eem.entity_type, eem.entity_slug, eem.context, eem.recap_id,
                  CASE WHEN eem.entity_type = 'person' THEN ep.name ELSE ec.name END as entity_name,
                  CASE WHEN eem.entity_type = 'person' THEN ep.title ELSE ec.industry END as entity_role,
                  CASE WHEN eem.entity_type = 'person' THEN ep.company ELSE NULL END as entity_company
           FROM entity_episode_mentions eem
           LEFT JOIN entity_people ep ON eem.entity_type = 'person' AND eem.entity_slug = ep.slug
           LEFT JOIN entity_companies ec ON eem.entity_type = 'company' AND eem.entity_slug = ec.slug
           INNER JOIN unnest($1::text[], $2::text[]) AS bm(p_slug, e_slug)
             ON eem.podcast_slug = bm.p_slug AND eem.episode_slug = bm.e_slug`,
          [podcastSlugs, episodeSlugs]
        ),
        pool.query(
          `SELECT slug, spotify_url, youtube_url FROM podcast_directory WHERE slug = ANY($1)`,
          [[...new Set(podcastSlugs)]]
        ),
        pool.query(
          `SELECT podcast_slug, episode_slug, name, company, description, image_url, category, purchase_url
           FROM extracted_products
           WHERE status = 'approved'
             AND episode_slug = ANY($1) AND podcast_slug = ANY($2)`,
          [[...new Set(episodeSlugs)], [...new Set(podcastSlugs)]]
        ),
      ]);

      const recapMap = new Map<string, any>();
      for (const r of recaps) {
        recapMap.set(`${r.slug}::${r.episode_slug}`, r);
      }

      const quotesMap = new Map<string, any[]>();
      for (const q of quotes) {
        const key = `${q.podcast_slug}::${q.episode_slug}`;
        if (!quotesMap.has(key)) quotesMap.set(key, []);
        quotesMap.get(key)!.push({
          id: q.id,
          speakerName: q.speaker_name,
          speakerRole: q.speaker_role,
          quoteText: q.quote_text,
          context: q.context,
          quoteType: q.quote_type,
          sortOrder: q.sort_order,
        });
      }

      const podcastDirMap = new Map<string, any>();
      for (const pd of podcastDirs) {
        podcastDirMap.set(pd.slug, pd);
      }

      const productsMap = new Map<string, any[]>();
      for (const p of products) {
        const key = `${p.podcast_slug}::${p.episode_slug}`;
        if (!productsMap.has(key)) productsMap.set(key, []);
        productsMap.get(key)!.push({
          name: p.name, company: p.company, description: p.description,
          imageUrl: p.image_url, category: p.category, purchaseUrl: p.purchase_url,
        });
      }

      const mentionsMap = new Map<string, { people: any[]; companies: any[]; peopleSlugs: string[]; companySlugs: string[]; entityContexts: Record<string, string> }>();
      for (const m of mentions) {
        const key = `${m.podcast_slug}::${m.episode_slug}`;
        if (!mentionsMap.has(key)) mentionsMap.set(key, { people: [], companies: [], peopleSlugs: [], companySlugs: [], entityContexts: {} });
        const entry = mentionsMap.get(key)!;
        if (m.entity_type === "person") {
          entry.peopleSlugs.push(m.entity_slug);
          if (m.entity_name) {
            entry.people.push({ slug: m.entity_slug, name: m.entity_name, role: m.entity_role, company: m.entity_company, context: m.context });
          }
        } else if (m.entity_type === "company") {
          entry.companySlugs.push(m.entity_slug);
          if (m.entity_name) {
            entry.companies.push({ slug: m.entity_slug, name: m.entity_name, role: m.entity_role, company: m.entity_company, context: m.context });
          }
        }
        if (m.context) {
          entry.entityContexts[m.entity_slug] = m.context;
        }
      }

      function safeParseJsonArray(raw: any): any[] {
        if (!raw) return [];
        try {
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          console.warn("[Bookmarks] Failed to parse JSON field:", e);
          return [];
        }
      }

      const enriched = bookmarksList
        .filter(bm => recapMap.has(`${bm.podcastSlug}::${bm.episodeSlug}`))
        .map(bm => {
          const recap = recapMap.get(`${bm.podcastSlug}::${bm.episodeSlug}`)!;
          const key = `${bm.podcastSlug}::${bm.episodeSlug}`;
          const pd = podcastDirMap.get(bm.podcastSlug);

          const guests = safeParseJsonArray(recap.guests);
          const resources = safeParseJsonArray(recap.resources);
          const sponsors = safeParseJsonArray(recap.sponsors).filter((s: any) => s.name);

          const mentionData = mentionsMap.get(key);

          return {
            id: bm.id,
            podcastSlug: bm.podcastSlug,
            episodeSlug: bm.episodeSlug,
            createdAt: bm.createdAt,
            podcastName: recap.podcast_name,
            episodeTitle: recap.episode_title,
            publishDate: recap.publish_date || null,
            artworkUrl: recap.artwork_url || null,
            tldl: recap.tldl || null,
            keyInsights: recap.key_insights || null,
            whatHappened: recap.what_happened || null,
            quote: recap.quote || null,
            quoteAttribution: recap.quote_attribution || null,
            duration: recap.duration || null,
            tabloidSubHeadline: recap.tabloid_sub_headline || null,
            hosts: recap.hosts || null,
            keyTopics: recap.key_topics || null,
            guests,
            resources,
            sponsors,
            matchedPeopleSlugs: mentionData?.peopleSlugs || [],
            matchedCompanySlugs: mentionData?.companySlugs || [],
            entityContexts: mentionData?.entityContexts || {},
            episodeQuotes: quotesMap.get(key) || [],
            spotifyEpisodeUrl: recap.spotify_episode_url || null,
            spotifyUrl: pd?.spotify_url || null,
            youtubeUrl: recap.youtube_url || pd?.youtube_url || null,
            mentions: {
              people: mentionData?.people || [],
              companies: mentionData?.companies || [],
              products: productsMap.get(key) || [],
            },
          };
        });

      res.json(enriched);
    } catch (err) {
      console.error("[Bookmarks] Failed to fetch enriched bookmarks:", err);
      res.status(500).json({ message: "Failed to fetch enriched bookmarks" });
    }
  });

  app.get("/api/book-bookmarks", async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const list = await storage.getBookBookmarksByUserId(userId);
    res.json(list);
  });

  app.post("/api/book-bookmarks", async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const parsed = insertBookBookmarkSchema.safeParse({ ...req.body, userId });
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten().fieldErrors });
    }
    try {
      const exists = await storage.isBookBookmarked(userId, parsed.data.bookSlug);
      if (exists) {
        return res.json({ message: "Already bookmarked" });
      }
      const bookmark = await storage.addBookBookmark({ userId, bookSlug: parsed.data.bookSlug });
      res.status(201).json(bookmark);
    } catch (err) {
      console.error("[BookBookmark] Failed to add bookmark:", err);
      res.status(500).json({ message: "Failed to bookmark book" });
    }
  });

  app.delete("/api/book-bookmarks/:bookSlug", async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    await storage.removeBookBookmark(userId, req.params.bookSlug);
    res.json({ message: "Book bookmark removed" });
  });

  app.get("/api/book-bookmarks/check/:bookSlug", async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const isBookmarked = await storage.isBookBookmarked(userId, req.params.bookSlug);
    res.json({ isBookmarked });
  });

  app.get("/api/book-bookmarks/enriched", async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const list = await storage.getBookBookmarksByUserId(userId);
      if (list.length === 0) {
        return res.json([]);
      }

      const slugs = list.map(b => b.bookSlug);
      const { rows: enrichments } = await pool.query(
        `SELECT slug, book_title, author, description, has_cover, amazon_url, google_books_id
         FROM book_enrichments WHERE slug = ANY($1)`,
        [slugs]
      );

      const enrichMap = new Map<string, any>();
      for (const e of enrichments) {
        enrichMap.set(e.slug, e);
      }

      function ensureAffiliateTag(url: string): string {
        if (url.includes("tag=")) return url.replace(/tag=[^&]*/, "tag=podrise0c-20");
        return url + (url.includes("?") ? "&" : "?") + "tag=podrise0c-20";
      }

      const enriched = list.map(bm => {
        const e = enrichMap.get(bm.bookSlug);
        const amazonUrl = e?.amazon_url
          ? ensureAffiliateTag(e.amazon_url)
          : `https://www.amazon.com/s?k=${encodeURIComponent(`${e?.book_title || bm.bookSlug.replace(/-/g, " ")} book`)}&tag=podrise0c-20`;
        return {
          id: bm.id,
          bookSlug: bm.bookSlug,
          createdAt: bm.createdAt,
          name: e?.book_title || bm.bookSlug.replace(/-/g, " "),
          author: e?.author || null,
          description: e?.description || null,
          hasCover: e?.has_cover || false,
          googleBooksId: e?.google_books_id || null,
          amazonUrl,
        };
      });

      res.json(enriched);
    } catch (err) {
      console.error("[BookBookmarks] Failed to fetch enriched book bookmarks:", err);
      res.status(500).json({ message: "Failed to fetch enriched book bookmarks" });
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
      const affiliateUserId = req.session?.userId || null;
      await pool.query(
        `INSERT INTO affiliate_clicks (product_type, product_name, product_id, destination_url, referrer_page, user_id) VALUES ($1, $2, $3, $4, $5, $6)`,
        [productType, productName, productId, validatedUrl, referrerPage, affiliateUserId]
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
        `SELECT COALESCE(channel, 'Direct') as source, COUNT(*) as count FROM users WHERE email_verified = true${dateFilter} GROUP BY source ORDER BY count DESC`,
        params
      );

      const params2 = [...params];
      const byPodcastResult = await pool.query(
        `SELECT COALESCE(signup_source_detail, 'unknown') as detail, COALESCE(channel, 'Direct') as source, COUNT(*) as count FROM users WHERE email_verified = true AND signup_source IN ('podcast_page', 'episode_page')${dateFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n)}`)} GROUP BY detail, source ORDER BY count DESC LIMIT 20`,
        params2
      );

      const params3 = [...params];
      const overTimeResult = await pool.query(
        `SELECT date_trunc('${trunc}', created_at) as period, COALESCE(channel, 'Direct') as source, COUNT(*) as count FROM users WHERE email_verified = true AND created_at IS NOT NULL${dateFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n)}`)} GROUP BY period, source ORDER BY period ASC`,
        params3
      );

      const params4 = [...params];
      const recentSignupsResult = await pool.query(
        `SELECT u.id, u.email, u.signup_source, u.signup_source_detail, u.device_type, u.created_at, u.utm_source, u.utm_medium, u.utm_campaign, u.channel, pd.name as podcast_name FROM users u LEFT JOIN podcast_directory pd ON u.signup_source IN ('podcast_page', 'episode_page') AND pd.slug = u.signup_source_detail WHERE u.email_verified = true${dateFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n)}`).replace(/created_at/g, 'u.created_at')} ORDER BY u.created_at DESC LIMIT 50`,
        params4
      );

      const params5 = [...params];
      const totalResult = await pool.query(
        `SELECT COUNT(*) as count FROM users WHERE email_verified = true${dateFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n)}`)}`,
        params5
      );

      const params6 = [...params];
      const utmBreakdownResult = await pool.query(
        `SELECT COALESCE(utm_source, 'direct') as utm_source, COALESCE(utm_medium, 'none') as utm_medium, COALESCE(utm_campaign, 'none') as utm_campaign, COUNT(*) as count FROM users WHERE email_verified = true${dateFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n)}`)} GROUP BY COALESCE(utm_source, 'direct'), COALESCE(utm_medium, 'none'), COALESCE(utm_campaign, 'none') ORDER BY count DESC`,
        params6
      );

      res.json({
        totalSignups: parseInt(totalResult.rows[0]?.count || "0"),
        bySource: bySourceResult.rows.map(r => ({ source: r.source, count: parseInt(r.count) })),
        byPodcast: byPodcastResult.rows.map(r => ({ detail: r.detail, source: r.source, count: parseInt(r.count) })),
        overTime: overTimeResult.rows.map(r => ({ period: r.period, source: r.source, count: parseInt(r.count) })),
        recentSignups: recentSignupsResult.rows,
        utmBreakdown: utmBreakdownResult.rows.map(r => ({ utmSource: r.utm_source, utmMedium: r.utm_medium, utmCampaign: r.utm_campaign, count: parseInt(r.count) })),
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
               SUM(CASE WHEN email_verified = true THEN 1 ELSE 0 END) as verified_users,
               SUM(CASE WHEN onboarding_completed = true THEN 1 ELSE 0 END) as onboarded_users
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
          onboardedUsers: parseInt(row.onboarded_users),
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

  app.get("/api/podcasts/directory", async (req, res) => {
    try {
      const sort = (req.query.sort as string) || "popular";
      const validSorts = ["popular", "episodes", "newest", "rated", "alpha"];
      const sortValue = validSorts.includes(sort) ? sort : "popular";

      const orderByMap: Record<string, string> = {
        popular: "COALESCE(followers, 0) DESC, name ASC",
        episodes: "COALESCE(total_episodes, 0) DESC, name ASC",
        newest: "COALESCE(year_started, 0) DESC, name ASC",
        rated: "COALESCE(apple_rating::numeric, 0) DESC, COALESCE(apple_rating_count, 0) DESC, name ASC",
        alpha: "name ASC",
      };
      const orderBy = orderByMap[sortValue];

      if (sortValue === "popular") {
        const cached = directoryCache.podcastsDirectory.get();
        if (cached) return res.json(cached);
      }

      const result = await pool.query(
        `SELECT slug, name, artwork_url, category FROM podcast_directory WHERE slug IS NOT NULL ORDER BY ${orderBy}`
      );
      const rows = result.rows;

      if (sortValue === "popular") {
        const categoryBuckets: Record<string, any[]> = {};
        for (const row of rows) {
          const cat = ((row.category || "Other").split(",")[0].trim() || "Other").toLowerCase();
          if (!categoryBuckets[cat]) categoryBuckets[cat] = [];
          categoryBuckets[cat].push(row);
        }
        const bucketKeys = Object.keys(categoryBuckets);
        const interleaved: any[] = [];
        const indices: Record<string, number> = {};
        for (const k of bucketKeys) indices[k] = 0;
        let added = true;
        while (added) {
          added = false;
          for (const k of bucketKeys) {
            if (indices[k] < categoryBuckets[k].length) {
              interleaved.push(categoryBuckets[k][indices[k]]);
              indices[k]++;
              added = true;
            }
          }
        }
        directoryCache.podcastsDirectory.set(interleaved);
        return res.json(interleaved);
      }

      res.json(rows);
    } catch (err) {
      console.error("[Directory] Error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/podcasts/directory/by-topic/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const sort = (req.query.sort as string) || "popular";
      const validSorts = ["popular", "episodes", "newest", "rated", "alpha"];
      const sortValue = validSorts.includes(sort) ? sort : "popular";

      const cacheKey = `topic_podcasts_${slug}`;
      if (sortValue === "popular") {
        const cached = (directoryCache as any)[cacheKey]?.get?.();
        if (cached) return res.json(cached);
      }

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

      const orderByMap: Record<string, string> = {
        popular: "followers DESC NULLS LAST, name ASC",
        episodes: "COALESCE(total_episodes, 0) DESC, name ASC",
        newest: "COALESCE(year_started, 0) DESC, name ASC",
        rated: "COALESCE(apple_rating::numeric, 0) DESC, COALESCE(apple_rating_count, 0) DESC, name ASC",
        alpha: "name ASC",
      };
      const orderBy = orderByMap[sortValue];

      const ilikeConds = categories.map((_, i) => `category ILIKE $${i + 1}`).join(" OR ");
      const result = await pool.query(
        `SELECT slug, name, artwork_url, category, description
         FROM podcast_directory
         WHERE slug IS NOT NULL AND (${ilikeConds})
         ORDER BY ${orderBy}
         LIMIT 40`,
        categories.map(c => `%${c}%`)
      );

      if (sortValue === "popular") {
        if (!(directoryCache as any)[cacheKey]) {
          (directoryCache as any)[cacheKey] = new DataCache<any[]>(cacheKey, 60 * 60 * 1000);
        }
        (directoryCache as any)[cacheKey].set(result.rows);
      }
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
      const podcastsResult = await pool.query(
        `SELECT pd.itunes_id, pd.name, pd.artwork_url, pd.slug, pd.has_landing_page,
                EXISTS(
                  SELECT 1 FROM landing_page_recaps lpr
                  WHERE lpr.slug = pd.slug AND lpr.published = true AND lpr.status = 'published'
                ) AS has_published_recaps
         FROM podcast_directory pd
         WHERE (pd.name ILIKE $1 OR pd.slug ILIKE $1)
         ORDER BY pd.has_landing_page DESC, pd.name ASC LIMIT 10`,
        [searchTerm]
      );

      res.json({
        podcasts: podcastsResult.rows.map((r: any) => ({
          slug: r.slug, name: r.name, artworkUrl: r.artwork_url || "", type: "podcast" as const,
          itunesId: r.itunes_id ? String(r.itunes_id) : null,
          hasLandingPage: !!(r.has_landing_page && r.has_published_recaps),
        })),
        episodes: [],
        people: [],
        companies: [],
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

  async function computePeopleData(): Promise<any[]> { return []; }

  app.get("/api/entities/people", (_req, res) => {
    res.status(410).json({ error: "This endpoint has been removed" });
  });

  app.get("/api/entities/people/:slug", (_req, res) => {
    res.status(410).json({ error: "This endpoint has been removed" });
  });


  async function computeCompaniesData(): Promise<any[]> { return []; }
  async function computeTopicsData(): Promise<any[]> { return []; }

  app.get("/api/entities/companies", (_req, res) => {
    res.status(410).json({ error: "This endpoint has been removed" });
  });


  app.get("/api/entities/topics", (_req, res) => {
    res.status(410).json({ error: "This endpoint has been removed" });
  });

  app.get("/api/podcasts/:slug/:episodeSlug/transcript-segments", (_req, res) => {
    res.status(410).json({ error: "Transcript access has been removed" });
  });

  async function enrichRecapsForCards(recaps: Array<{id: number; slug: string; episodeSlug: string; [key: string]: any}>, maxItems = 200) {
    if (recaps.length === 0) return [];
    if (recaps.length > maxItems) recaps = recaps.slice(0, maxItems);
    const recapIds = recaps.map(r => r.id);
    const podcastSlugs = [...new Set(recaps.map(r => r.slug))];
    const episodeSlugs = recaps.map(r => r.episodeSlug).filter(Boolean);

    const [mentionsResult, pdResult, productsResult] = await Promise.all([
      pool.query(
        `SELECT eem.recap_id, eem.entity_type, eem.entity_slug, eem.context,
                CASE WHEN eem.entity_type = 'person' THEN ep.name ELSE ec.name END as entity_name,
                CASE WHEN eem.entity_type = 'person' THEN ep.title ELSE ec.industry END as entity_role,
                CASE WHEN eem.entity_type = 'person' THEN ep.company ELSE NULL END as entity_company
         FROM entity_episode_mentions eem
         LEFT JOIN entity_people ep ON eem.entity_type = 'person' AND eem.entity_slug = ep.slug
         LEFT JOIN entity_companies ec ON eem.entity_type = 'company' AND eem.entity_slug = ec.slug
         WHERE eem.recap_id = ANY($1)`,
        [recapIds]
      ),
      pool.query(
        `SELECT slug, spotify_url, youtube_url, hosts, total_episodes, year_started FROM podcast_directory WHERE slug = ANY($1)`,
        [podcastSlugs]
      ),
      episodeSlugs.length > 0 ? pool.query(
        `SELECT podcast_slug, episode_slug, name, company, description, image_url, category, purchase_url
         FROM extracted_products
         WHERE status = 'approved'
           AND episode_slug = ANY($1) AND podcast_slug = ANY($2)`,
        [[...new Set(episodeSlugs)], podcastSlugs]
      ) : { rows: [] },
    ]);

    const mentionsMap: Record<number, { people: any[]; companies: any[] }> = {};
    for (const m of mentionsResult.rows) {
      if (!m.entity_name) continue;
      if (!mentionsMap[m.recap_id]) mentionsMap[m.recap_id] = { people: [], companies: [] };
      const entry = { slug: m.entity_slug, name: m.entity_name, role: m.entity_role, company: m.entity_company, context: m.context };
      if (m.entity_type === 'person') mentionsMap[m.recap_id].people.push(entry);
      else mentionsMap[m.recap_id].companies.push(entry);
    }

    const pdMap: Record<string, any> = {};
    for (const pd of pdResult.rows) {
      pdMap[pd.slug] = pd;
    }

    const productsMap: Record<string, any[]> = {};
    for (const p of productsResult.rows) {
      const key = `${p.podcast_slug}:${p.episode_slug}`;
      if (!productsMap[key]) productsMap[key] = [];
      productsMap[key].push({
        name: p.name, company: p.company, description: p.description,
        imageUrl: p.image_url, category: p.category, purchaseUrl: p.purchase_url,
      });
    }

    return recaps.map(r => {
      const pd = pdMap[r.slug] || {};
      return {
        ...r,
        pdSpotifyUrl: pd.spotify_url || null,
        pdYoutubeUrl: pd.youtube_url || null,
        pdHosts: pd.hosts || null,
        pdTotalEpisodes: pd.total_episodes || null,
        pdYearStarted: pd.year_started || null,
        mentions: {
          people: (mentionsMap[r.id]?.people || []).slice(0, 5),
          companies: (mentionsMap[r.id]?.companies || []).slice(0, 5),
          products: (r.episodeSlug ? productsMap[`${r.slug}:${r.episodeSlug}`] : undefined) || [],
        },
      };
    });
  }

  app.get("/api/podcasts/:slug/recaps", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
      const enrichMentions = req.query.mentions === "true";
      const isSimpleRequest = offset === 0 && req.query.count !== "true" && req.query.offset === undefined;
      const cacheKey = `${req.params.slug}::${limit}::${enrichMentions ? "enriched" : "basic"}`;
      if (isSimpleRequest) {
        const cached = podcastRecapsCache.get(cacheKey);
        if (cached) return res.json(cached);
      }
      const recaps = await storage.getLandingPageRecaps(req.params.slug, limit, offset);

      if (enrichMentions && recaps.length > 0) {
        const recapIds = recaps.map(r => r.id);
        const recapEpisodeSlugs = recaps.map(r => r.episodeSlug).filter(Boolean);
        const [mentionsResult, pdResult, productsResult] = await Promise.all([
          pool.query(
            `SELECT eem.recap_id, eem.entity_type, eem.entity_slug, eem.context,
                    CASE WHEN eem.entity_type = 'person' THEN ep.name ELSE ec.name END as entity_name,
                    CASE WHEN eem.entity_type = 'person' THEN ep.title ELSE ec.industry END as entity_role,
                    CASE WHEN eem.entity_type = 'person' THEN ep.company ELSE NULL END as entity_company
             FROM entity_episode_mentions eem
             LEFT JOIN entity_people ep ON eem.entity_type = 'person' AND eem.entity_slug = ep.slug
             LEFT JOIN entity_companies ec ON eem.entity_type = 'company' AND eem.entity_slug = ec.slug
             WHERE eem.recap_id = ANY($1)`,
            [recapIds]
          ),
          pool.query(
            `SELECT spotify_url, youtube_url FROM podcast_directory WHERE slug = $1 LIMIT 1`,
            [req.params.slug]
          ),
          pool.query(
            `SELECT episode_slug, name, company, description, image_url, category, purchase_url
             FROM extracted_products
             WHERE status = 'approved'
               AND podcast_slug = $1
               AND episode_slug = ANY($2)`,
            [req.params.slug, recapEpisodeSlugs]
          ),
        ]);
        const recapProductsMap: Record<string, any[]> = {};
        for (const p of productsResult.rows) {
          if (!recapProductsMap[p.episode_slug]) recapProductsMap[p.episode_slug] = [];
          recapProductsMap[p.episode_slug].push({
            name: p.name, company: p.company, description: p.description,
            imageUrl: p.image_url, category: p.category, purchaseUrl: p.purchase_url,
          });
        }
        const mentionsMap: Record<number, { people: any[]; companies: any[] }> = {};
        for (const m of mentionsResult.rows) {
          if (!m.entity_name) continue;
          if (!mentionsMap[m.recap_id]) mentionsMap[m.recap_id] = { people: [], companies: [] };
          const entry = { slug: m.entity_slug, name: m.entity_name, role: m.entity_role, company: m.entity_company, context: m.context };
          if (m.entity_type === 'person') mentionsMap[m.recap_id].people.push(entry);
          else mentionsMap[m.recap_id].companies.push(entry);
        }
        const pd = pdResult.rows[0] || {};
        const enriched = recaps.map(r => ({
          ...r,
          pdSpotifyUrl: pd.spotify_url || null,
          pdYoutubeUrl: pd.youtube_url || null,
          mentions: {
            people: mentionsMap[r.id]?.people || [],
            companies: mentionsMap[r.id]?.companies || [],
            products: (r.episodeSlug ? recapProductsMap[r.episodeSlug] : undefined) || [],
          },
        }));
        if (req.query.offset !== undefined || req.query.count === "true") {
          const total = await storage.getLandingPageRecapCount(req.params.slug);
          res.json({ recaps: enriched, total, limit, offset });
        } else {
          if (isSimpleRequest) podcastRecapsCache.set(cacheKey, enriched);
          res.json(enriched);
        }
      } else {
        if (req.query.offset !== undefined || req.query.count === "true") {
          const total = await storage.getLandingPageRecapCount(req.params.slug);
          res.json({ recaps, total, limit, offset });
        } else {
          if (isSimpleRequest) podcastRecapsCache.set(cacheKey, recaps);
          res.json(recaps);
        }
      }
    } catch {
      res.status(500).json({ error: "Failed to fetch recaps" });
    }
  });

  app.get("/api/podcasts/:slug/episodes-list", async (req, res) => {
    try {
      const { slug } = req.params;
      const allRecaps = await storage.getLandingPageRecaps(slug, 1000, 0);
      const enriched = await enrichRecapsForCards(allRecaps.map(r => ({
        id: r.id,
        slug: r.slug,
        episodeSlug: r.episodeSlug,
        episodeTitle: r.episodeTitle,
        podcastName: r.podcastName,
        publishDate: r.publishDate,
        artworkUrl: r.artworkUrl,
        duration: r.duration,
        tldl: r.tldl,
        tabloidSubHeadline: r.tabloidSubHeadline,
        keyInsights: r.keyInsights,
        quote: r.quote,
        quoteAttribution: r.quoteAttribution,
        whatHappened: r.whatHappened,
        spotifyEpisodeUrl: r.spotifyEpisodeUrl,
        youtubeUrl: r.youtubeUrl,
        guests: r.guests,
        keyTopics: r.keyTopics,
      })));
      res.json(enriched);
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
      u.searchParams.set("tag", "podrise0c-20");
      return u.toString();
    } catch {
      if (url.includes("tag=")) return url.replace(/tag=[^&]*/, "tag=podrise0c-20");
      return url + (url.includes("?") ? "&" : "?") + "tag=podrise0c-20";
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
      const nameToArtwork: Record<string, string> = {};
      const { rows: pdRows } = await pool.query(`SELECT slug, name, artwork_url FROM podcast_directory WHERE has_landing_page = true`);
      for (const p of pdRows) {
        slugToName[p.slug] = p.name;
        if (p.artwork_url) nameToArtwork[p.name] = p.artwork_url;
      }

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
          const amazonUrl = `https://www.amazon.com/s?k=${encodeURIComponent(`${b.name}${enrichment?.author || b.author ? ` ${enrichment?.author || b.author}` : ""} book`)}&tag=podrise0c-20`;

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

      const result = { items: [...books, ...products], books, products, total: books.length + products.length, podcastArtwork: nameToArtwork };
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

  app.get("/api/shop/books", async (_req, res) => {
    try {
      const cached = directoryCache.shop.get();
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
          const amazonUrl = `https://www.amazon.com/s?k=${encodeURIComponent(`${b.name}${enrichment?.author || b.author ? ` ${enrichment?.author || b.author}` : ""} book`)}&tag=podrise0c-20`;

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
      directoryCache.shop.set(result);
      res.json(result);
    } catch (err) {
      console.error("Shop books error:", err);
      res.status(500).json({ message: "Failed to load shop books" });
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

  app.get("/api/shop/book/:bookSlug", async (req, res) => {
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
      const amazonSearchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(`${enrichment.book_title}${enrichment.author ? ` ${enrichment.author}` : ""} book`)}&tag=podrise0c-20`;
      const amazonUrl = amazonSearchUrl;

      const audibleUrl = `https://www.audible.com/search?keywords=${encodeURIComponent(`${enrichment.book_title}${enrichment.author ? ` ${enrichment.author}` : ""}`)}&tag=podrise0c-20`;

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
      const cached = entityLinksCache.get(slug);
      if (cached) return res.json(cached);
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

      const result = { companies: topCompanies, people: topPeople, topics: topTopics, guests: recentGuests };
      entityLinksCache.set(slug, result);
      res.json(result);
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
      const cachedSidebar = directoryCache.sidebarData.get();
      if (cachedSidebar) return res.json(cachedSidebar);

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
           JOIN landing_page_recaps lpr ON eq.podcast_slug = lpr.slug AND eq.episode_slug = lpr.episode_slug
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
          link: `/shop/${b.slug}`,
        }));

        const result = { trendingTopics, notableQuotes, trendingPeople, recommended };
        directoryCache.sidebarData.set(result);
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
      let user: any = null;
      if (onbUserId) {
        user = await storage.getUserById(onbUserId);
      }

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
        if (user?.podcasts && user.podcasts.length > 0) {
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
          [excludeSlugs, 50 - suggestedPodcasts.length]
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
      if (user?.podcasts && user.podcasts.length > 0) {
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
          industries: user?.industries || [],
          interests: user?.interests || [],
          roles: user?.roles || [],
        },
        context: contextRaw,
        needsOnboarding: user ? !user.onboardingCompleted : true,
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

      const wasAlreadyOnboarded = user.onboardingCompleted === true;

      await pool.query(
        `UPDATE users SET podcasts = $1, industries = $2, interests = $3, roles = $4, onboarding_completed = true WHERE id = $5`,
        [newPodcasts, mergedIndustries, mergedInterests, mergedRoles, user.id]
      );

      if (req.session?.signupContext) delete req.session.signupContext;
      const updatedUser = await storage.getUserById(user.id);

      if (!wasAlreadyOnboarded) {
      try {
        const onbPodcastNames = (newPodcasts || []).map((p: string) => parsePodcastName(p));
        const { client, fromEmail } = await getUncachableResendClient();
        await client.emails.send({
          from: `PodRise Alerts <${fromEmail}>`,
          to: "derek@podrise.com",
          subject: `🚀 New PodRise User: ${user.email}`,
          html: `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#f8f9fa;">
<div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<div style="background:linear-gradient(135deg,#4CAF50,#388E3C);padding:28px 32px;">
<h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">✅ Onboarding Completed</h1>
</div>
<div style="padding:28px 32px;">
<table style="width:100%;border-collapse:collapse;">
<tr><td style="padding:10px 0;color:#888;font-size:13px;vertical-align:top;width:110px;">Email</td><td style="padding:10px 0;font-size:14px;font-weight:600;color:#1a1a1a;">${user.email}</td></tr>
<tr><td style="padding:10px 0;color:#888;font-size:13px;vertical-align:top;">User ID</td><td style="padding:10px 0;font-size:14px;color:#1a1a1a;">#${user.id}</td></tr>
<tr><td style="padding:10px 0;color:#888;font-size:13px;vertical-align:top;">Selected Podcasts</td><td style="padding:10px 0;font-size:14px;color:#1a1a1a;">${onbPodcastNames.length > 0 ? onbPodcastNames.map((n: string) => `<span style="display:inline-block;background:#e3f2fd;color:#1565c0;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;margin:2px 4px 2px 0;">${n}</span>`).join("") : "<em style='color:#aaa;'>None selected</em>"}</td></tr>
</table>
</div>
<div style="padding:16px 32px;background:#f8f9fa;text-align:center;">
<span style="font-size:12px;color:#aaa;">PodRise Onboarding Alert</span>
</div>
</div>
</body></html>`,
        });
        console.log(`[OnboardingNotify] Onboarding completion email sent for ${user.email}`);
      } catch (emailErr: any) {
        console.error("[OnboardingNotify] Failed to send onboarding email:", emailErr?.message || emailErr);
      }
      }

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
        const excludeSlugs = isAuthenticated && userPodcastSlugs.length > 0 ? userPodcastSlugs : [];
        const excludeParam = excludeSlugs.length > 0 ? `AND lr.slug != ALL($2)` : "";
        const cursorParam = cursor
          ? `AND lr.id < $${excludeSlugs.length > 0 ? 3 : 2}`
          : "";
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
            ${excludeParam}
            ${cursorParam}
          ORDER BY lr.publish_date DESC NULLS LAST, lr.id DESC
          LIMIT $1
        `;
        params = [limit];
        if (excludeSlugs.length > 0) params.push(excludeSlugs);
        if (cursor) params.push(cursor);
      }

      const result = await pool.query(query, params);
      const recapIds = result.rows.map((r: any) => r.id);

      let mentionsMap: Record<number, { people: any[]; companies: any[] }> = {};
      let productsMap: Record<string, any[]> = {};

      if (recapIds.length > 0) {
        const episodePairs = result.rows
          .filter((r: any) => r.episode_slug && r.slug)
          .map((r: any) => ({ episodeSlug: r.episode_slug, podcastSlug: r.slug }));
        const episodeSlugs = [...new Set(episodePairs.map(p => p.episodeSlug))];
        const podcastSlugs = [...new Set(episodePairs.map(p => p.podcastSlug))];

        const [mentionsResult, productsResult] = await Promise.all([
          pool.query(
            `SELECT eem.recap_id, eem.entity_type, eem.entity_slug, eem.context,
                    CASE WHEN eem.entity_type = 'person' THEN ep.name ELSE ec.name END as entity_name,
                    CASE WHEN eem.entity_type = 'person' THEN ep.title ELSE ec.industry END as entity_role,
                    CASE WHEN eem.entity_type = 'person' THEN ep.company ELSE NULL END as entity_company
             FROM entity_episode_mentions eem
             LEFT JOIN entity_people ep ON eem.entity_type = 'person' AND eem.entity_slug = ep.slug
             LEFT JOIN entity_companies ec ON eem.entity_type = 'company' AND eem.entity_slug = ec.slug
             WHERE eem.recap_id = ANY($1)`,
            [recapIds]
          ),
          episodeSlugs.length > 0 ? pool.query(
            `SELECT podcast_slug, episode_slug, name, company, description, image_url, category, purchase_url
             FROM extracted_products
             WHERE status = 'approved' AND episode_slug = ANY($1) AND podcast_slug = ANY($2)`,
            [episodeSlugs, podcastSlugs]
          ) : { rows: [] },
        ]);

        for (const m of mentionsResult.rows) {
          if (!mentionsMap[m.recap_id]) mentionsMap[m.recap_id] = { people: [], companies: [] };
          const entry = { slug: m.entity_slug, name: m.entity_name, role: m.entity_role, company: m.entity_company, context: m.context };
          if (m.entity_type === 'person') mentionsMap[m.recap_id].people.push(entry);
          else mentionsMap[m.recap_id].companies.push(entry);
        }

        for (const p of productsResult.rows) {
          const key = `${p.podcast_slug}:${p.episode_slug}`;
          if (!productsMap[key]) productsMap[key] = [];
          productsMap[key].push({
            name: p.name, company: p.company, description: p.description,
            imageUrl: p.image_url, category: p.category, purchaseUrl: p.purchase_url,
          });
        }
      }

      const items = result.rows.map((r: any) => {
        const rawGuests = r.guests ? (typeof r.guests === 'string' ? r.guests : JSON.stringify(r.guests)) : null;
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
          guests: rawGuests,
          keyTopics: r.key_topics || [],
          isFollowing: userPodcastSlugs.includes(r.slug),
          hosts: r.pd_hosts || null,
          totalEpisodes: r.pd_total_episodes || null,
          yearStarted: r.pd_year_started || null,
          appleUrl: r.pd_apple_url || null,
          spotifyUrl: r.pd_spotify_url || null,
          youtubeUrl: r.youtube_url || r.pd_youtube_url || null,
          spotifyEpisodeUrl: r.spotify_episode_url || null,
          appleEpisodeUrl: r.apple_episode_url || null,
          youtubeEpisodeUrl: r.youtube_url || null,
          tabloidSubHeadline: r.tabloid_sub_headline || null,
          mentions: {
            people: mentions.people.slice(0, 5),
            companies: mentions.companies.slice(0, 5),
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
      const itunesIds: string[] = [];
      const slugFallbacks: string[] = [];
      for (const p of rawPodcasts) {
        try {
          const parsed = JSON.parse(p);
          if (parsed.id) itunesIds.push(String(parsed.id));
          else if (parsed.slug) slugFallbacks.push(parsed.slug);
          else slugFallbacks.push(p);
        } catch {
          slugFallbacks.push(p);
        }
      }
      if (itunesIds.length === 0 && slugFallbacks.length === 0) return res.json({ followedSlugs: [] });
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
      const slugResult = await pool.query(
        `SELECT slug FROM podcast_directory WHERE ${conditions.join(' OR ')}`,
        params
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
        `SELECT slug, name, artwork_url AS "artworkUrl", category, hosts, has_landing_page AS "hasLandingPage" FROM podcast_directory WHERE ${conditions.join(' OR ')} ORDER BY name ASC`,
        params
      );
      res.json(result.rows.map((r: any) => ({
        slug: r.slug,
        name: r.name,
        artworkUrl: r.artworkUrl,
        category: r.category || null,
        hosts: r.hosts || null,
        hasLandingPage: r.hasLandingPage ?? false,
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
        return res.json({ success: true, message: "Already following", slug: pd.slug });
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



  app.post("/api/admin/send-demo-email", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { toEmail } = req.body;
      if (!toEmail || !toEmail.includes("@")) {
        return res.status(400).json({ message: "Valid toEmail required" });
      }

      const { rows: recentRecaps } = await pool.query(`
        SELECT lpr.podcast_name, lpr.episode_title, lpr.tldl, lpr.what_happened,
               lpr.key_insights, lpr.slug as podcast_slug, lpr.episode_slug,
               lpr.hosts, lpr.duration, lpr.publish_date, lpr.artwork_url,
               lpr.tabloid_headline, lpr.tabloid_sub_headline, lpr.quote, lpr.quote_attribution
        FROM landing_page_recaps lpr
        WHERE lpr.status = 'published'
          AND lpr.what_happened IS NOT NULL AND lpr.what_happened != ''
          AND lpr.tldl IS NOT NULL AND lpr.tldl != ''
        ORDER BY lpr.created_at DESC
        LIMIT 4
      `);

      if (recentRecaps.length === 0) {
        return res.status(400).json({ message: "No published recaps found to demo" });
      }

      let markdownParts: string[] = [];
      for (const r of recentRecaps) {
        const insights = (r.key_insights || []).map((i: string) => `- ${i}`).join("\n");
        const quote = r.quote ? `\n> "${r.quote}"${r.quote_attribution ? ` — ${r.quote_attribution}` : ""}` : "";
        markdownParts.push(
          `## ${r.podcast_name}\n\n**${r.episode_title}**\n\n**TL;DL:** ${r.tldl}\n\n### What Happened\n${r.what_happened}\n\n### Key Insights\n${insights}${quote}`
        );
      }
      const summary = markdownParts.join("\n\n---\n\n");

      const epMeta: Record<string, any> = {};
      for (const r of recentRecaps) {
        const slug = r.podcast_slug;
        let artworkUrl = r.artwork_url || "";
        if (artworkUrl && !artworkUrl.startsWith("http")) {
          artworkUrl = `https://podrise.com${artworkUrl.startsWith("/") ? artworkUrl : "/" + artworkUrl}`;
        }
        epMeta[slug] = {
          podcastSlug: slug,
          episodeSlug: r.episode_slug,
          artworkUrl: artworkUrl,
          hosts: r.hosts,
          duration: r.duration,
          publishDate: r.publish_date,
          tabloidHeadline: r.tabloid_headline,
          tabloidSubHeadline: r.tabloid_sub_headline,
        };
      }

      const { generateEmailSubjectAndPreview, reorderMarkdownLeadFirst, fetchShopBooks, fetchMissedEpisodes } = await import("./emailScheduler");
      const epCount = recentRecaps.length;
      const emailCopy = await generateEmailSubjectAndPreview(summary, epCount);
      const reordered = reorderMarkdownLeadFirst(summary, emailCopy.leadEpisodePodcast);

      const referralData = {
        referralCode: "demo-code",
        referralCount: 3,
        nextTierName: "Pod Squad Sticker Pack",
        nextTierThreshold: 5,
      };

      const demoUser = { podcasts: [], industries: [], interests: [], roles: [] };
      const [shopBooks, missedEpisodes] = await Promise.all([
        fetchShopBooks(),
        fetchMissedEpisodes(demoUser),
      ]);

      console.log(`[DemoEmail] To: ${toEmail}, recaps: ${recentRecaps.length}, shopBooks: ${shopBooks.length}, missedEpisodes: ${missedEpisodes.length}`);

      const emailHtml = markdownToEmailHtml(reordered, toEmail, epMeta, emailCopy, referralData, shopBooks, missedEpisodes);

      const { client, fromEmail } = await getUncachableResendClient();
      const result = await client.emails.send({
        from: `PodRise <${fromEmail}>`,
        to: toEmail,
        subject: `[DEMO] ${emailCopy.subject}`,
        html: emailHtml,
      });

      if (result.error) {
        return res.status(500).json({ message: `Send failed: ${result.error.message}` });
      }
      res.json({
        message: `Demo email sent to ${toEmail}`,
        recapCount: recentRecaps.length,
        podcasts: recentRecaps.map((r: any) => r.podcast_name),
        shopBooks: shopBooks.length,
        missedEpisodes: missedEpisodes.length,
      });
    } catch (err: any) {
      console.error("[DemoEmail] Error:", err);
      res.status(500).json({ message: err.message || "Failed to send demo email" });
    }
  });

  app.get("/api/admin/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const user = await storage.getUserById(req.session.userId);
      if (user) {
        const { db: adminDb } = await import("./db");
        const { eq: adminEq } = await import("drizzle-orm");
        const { adminUsers: adminUsersTable } = await import("@shared/schema");
        const [adminRow] = await adminDb.select().from(adminUsersTable).where(adminEq(adminUsersTable.email, user.email)).limit(1);
        if (adminRow) {
          req.session.isAdmin = true;
          return res.json({ isAdmin: true });
        }
      }
    } catch (e) {
      console.error("[AdminMe] Failed to check admin status:", e);
    }
    req.session.isAdmin = false;
    return res.status(403).json({ message: "Access denied. Your account does not have admin privileges." });
  });

  app.post("/api/admin/logout", (req, res) => {
    req.session.isAdmin = false;
    res.json({ message: "Admin logged out" });
  });

  app.get("/api/admin/alerts", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;
      const severity = req.query.severity as string;
      const apiName = req.query.apiName as string;
      const acknowledged = req.query.acknowledged as string;

      let whereClause = "";
      const params: (string | boolean | number)[] = [];
      const conditions: string[] = [];

      if (severity) {
        params.push(severity);
        conditions.push(`severity = $${params.length}`);
      }
      if (apiName) {
        params.push(apiName);
        conditions.push(`api_name = $${params.length}`);
      }
      if (acknowledged === "true" || acknowledged === "false") {
        params.push(acknowledged === "true");
        conditions.push(`acknowledged = $${params.length}`);
      }

      if (conditions.length > 0) {
        whereClause = `WHERE ${conditions.join(" AND ")}`;
      }

      const countResult = await pool.query(`SELECT COUNT(*) FROM admin_alerts ${whereClause}`, params);
      const totalCount = parseInt(countResult.rows[0].count);

      params.push(limit);
      const limitIdx = params.length;
      params.push(offset);
      const offsetIdx = params.length;

      const result = await pool.query(
        `SELECT * FROM admin_alerts ${whereClause} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
      );

      const statsResult = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE severity = 'critical' AND acknowledged = false) AS active_critical,
          COUNT(*) FILTER (WHERE severity = 'warning' AND acknowledged = false) AS active_warnings,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS last_24h,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS last_7d
        FROM admin_alerts
      `);

      res.json({
        alerts: result.rows.map(r => ({
          id: r.id,
          apiName: r.api_name,
          errorType: r.error_type,
          errorMessage: r.error_message,
          severity: r.severity,
          recipientEmail: r.recipient_email,
          acknowledged: r.acknowledged,
          createdAt: r.created_at,
        })),
        totalCount,
        stats: {
          activeCritical: parseInt(statsResult.rows[0].active_critical),
          activeWarnings: parseInt(statsResult.rows[0].active_warnings),
          last24h: parseInt(statsResult.rows[0].last_24h),
          last7d: parseInt(statsResult.rows[0].last_7d),
        },
      });
    } catch (err) {
      console.error("[AdminAlerts] Failed to fetch alerts:", err);
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  app.patch("/api/admin/alerts/:id", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid alert ID" });
      const { acknowledged } = req.body;
      if (typeof acknowledged !== "boolean") return res.status(400).json({ message: "acknowledged must be boolean" });
      const result = await pool.query(`UPDATE admin_alerts SET acknowledged = $1 WHERE id = $2`, [acknowledged, id]);
      if (result.rowCount === 0) return res.status(404).json({ message: "Alert not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("[AdminAlerts] Failed to update alert:", err);
      res.status(500).json({ message: "Failed to update alert" });
    }
  });

  app.post("/api/admin/alerts/acknowledge-all", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const result = await pool.query(`UPDATE admin_alerts SET acknowledged = true WHERE acknowledged = false`);
      res.json({ success: true, count: result.rowCount });
    } catch (err) {
      console.error("[AdminAlerts] Failed to acknowledge all:", err);
      res.status(500).json({ message: "Failed to acknowledge alerts" });
    }
  });

  app.get("/api/admin/alerts/health", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const recapResult = await pool.query(
        `SELECT COUNT(*) as count FROM landing_page_recaps WHERE created_at >= NOW() - INTERVAL '6 hours'`
      );
      const recentRecapCount = parseInt(recapResult.rows[0].count);

      const lastRecapResult = await pool.query(
        `SELECT created_at FROM landing_page_recaps ORDER BY created_at DESC LIMIT 1`
      );
      const lastRecapAt = lastRecapResult.rows[0]?.created_at || null;

      res.json({
        recapStall: recentRecapCount === 0,
        recentRecapCount,
        lastRecapAt,
      });
    } catch (err) {
      console.error("[AdminAlerts] Health check failed:", err);
      res.status(500).json({ message: "Health check failed" });
    }
  });

  app.get("/api/admin/admin-users", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const { db } = await import("./db");
    const { adminUsers } = await import("@shared/schema");
    const rows = await db.select().from(adminUsers).orderBy(adminUsers.createdAt);
    res.json(rows);
  });

  app.post("/api/admin/admin-users", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const { insertAdminUserSchema, adminUsers } = await import("@shared/schema");
    const parsed = insertAdminUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
    const normalizedEmail = parsed.data.email.toLowerCase();
    if (!normalizedEmail.endsWith("@podrise.com")) {
      return res.status(400).json({ message: "Only @podrise.com email addresses can be added as admins" });
    }
    const { db } = await import("./db");
    try {
      const [row] = await db.insert(adminUsers).values({ ...parsed.data, email: normalizedEmail }).returning();
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
      const normalizedEmail = emailParsed.data.toLowerCase();
      if (!normalizedEmail.endsWith("@podrise.com")) {
        return res.status(400).json({ message: "Only @podrise.com email addresses are allowed" });
      }
      updates.email = normalizedEmail;
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

  // Backfill jobs
  const BACKFILL_DEFINITIONS: Record<string, { name: string; description: string; rateNote: string; createdAt: string }> = {
    "tabloid-headlines": {
      name: "Backfill Tabloid Headlines",
      description: "Finds all landing page recaps that have recap content (what_happened or tldl) but are missing tabloid headlines, and generates them using OpenAI. Episodes without any recap content are skipped.",
      rateNote: "Processes 1 episode every 10 seconds to avoid API overload",
      createdAt: "2025-03-21",
    },
  };

  let activeBackfillAbortControllers: Map<string, { abort: () => void }> = new Map();

  app.get("/api/admin/backfills", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const jobs = await storage.getBackfillJobs();
      const jobMap = new Map(jobs.map(j => [j.key, j]));
      const result = Object.entries(BACKFILL_DEFINITIONS).map(([key, def]) => {
        const job = jobMap.get(key);
        return {
          key,
          ...def,
          status: job?.status ?? "idle",
          totalRecords: job?.totalRecords ?? null,
          processedCount: job?.processedCount ?? 0,
          updatedCount: job?.updatedCount ?? 0,
          errorMessage: job?.errorMessage ?? null,
          lastRunAt: job?.lastRunAt ?? null,
        };
      });
      res.json(result);
    } catch (err) {
      console.error("[Backfill] Failed to list jobs:", err);
      res.status(500).json({ message: "Failed to list backfill jobs" });
    }
  });

  app.get("/api/admin/backfills/:key", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const { key } = req.params;
    if (!BACKFILL_DEFINITIONS[key]) return res.status(404).json({ message: "Unknown backfill key" });
    try {
      const job = await storage.getBackfillJobByKey(key);
      const def = BACKFILL_DEFINITIONS[key];
      res.json({
        key,
        ...def,
        status: job?.status ?? "idle",
        totalRecords: job?.totalRecords ?? null,
        processedCount: job?.processedCount ?? 0,
        updatedCount: job?.updatedCount ?? 0,
        errorMessage: job?.errorMessage ?? null,
        lastRunAt: job?.lastRunAt ?? null,
      });
    } catch (err) {
      console.error("[Backfill] Failed to get job:", err);
      res.status(500).json({ message: "Failed to get backfill job" });
    }
  });

  app.get("/api/admin/backfills/tabloid-headlines/stats", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const result = await pool.query(`
        SELECT
          COUNT(*)::int AS "totalInTable",
          COUNT(*) FILTER (WHERE (what_happened IS NOT NULL AND what_happened != '') OR (tldl IS NOT NULL AND tldl != ''))::int AS "withContent",
          COUNT(*) FILTER (WHERE ((what_happened IS NOT NULL AND what_happened != '') OR (tldl IS NOT NULL AND tldl != '')) AND ((tabloid_headline IS NULL OR tabloid_headline = '') OR (tabloid_sub_headline IS NULL OR tabloid_sub_headline = '')))::int AS "missingHeadlineWithContent",
          COUNT(*) FILTER (WHERE (what_happened IS NULL OR what_happened = '') AND (tldl IS NULL OR tldl = ''))::int AS "missingContent"
        FROM landing_page_recaps
      `);
      res.json(result.rows[0]);
    } catch (err) {
      console.error("[Backfill] Failed to get tabloid-headlines stats:", err);
      res.status(500).json({ message: "Failed to get stats" });
    }
  });

  app.post("/api/admin/backfills/:key/run", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const { key } = req.params;
    if (!BACKFILL_DEFINITIONS[key]) return res.status(404).json({ message: "Unknown backfill key" });

    if (key === "tabloid-headlines") {
      try {
        const countResult = await pool.query(
          `SELECT COUNT(*)::int as count FROM landing_page_recaps WHERE ((tabloid_headline IS NULL OR tabloid_headline = '') OR (tabloid_sub_headline IS NULL OR tabloid_sub_headline = '')) AND ((what_happened IS NOT NULL AND what_happened != '') OR (tldl IS NOT NULL AND tldl != ''))`
        );
        const total = countResult.rows[0]?.count ?? 0;

        const claimResult = await pool.query(
          `INSERT INTO backfill_jobs (key, status, total_records, processed_count, updated_count, error_message, last_run_at)
           VALUES ($1, 'running', $2, 0, 0, NULL, NOW())
           ON CONFLICT (key) DO UPDATE
             SET status = 'running', total_records = $2, processed_count = 0, updated_count = 0, error_message = NULL, last_run_at = NOW()
             WHERE backfill_jobs.status != 'running'
           RETURNING id`,
          [key, total]
        );
        if (claimResult.rows.length === 0) {
          return res.status(409).json({ message: "Job is already running" });
        }

        res.json({ message: "Backfill started", totalRecords: total });

        let aborted = false;
        const controller = { abort: () => { aborted = true; } };
        activeBackfillAbortControllers.set(key, controller);

        (async () => {
          try {
            const rows = await pool.query(
              `SELECT id, slug, episode_slug, episode_title, podcast_name, tldl, what_happened, key_insights FROM landing_page_recaps WHERE ((tabloid_headline IS NULL OR tabloid_headline = '') OR (tabloid_sub_headline IS NULL OR tabloid_sub_headline = '')) AND ((what_happened IS NOT NULL AND what_happened != '') OR (tldl IS NOT NULL AND tldl != '')) ORDER BY id`
            );
            const records = rows.rows;
            let processed = 0;
            let updated = 0;

            for (const record of records) {
              if (aborted) {
                await storage.upsertBackfillJob(key, { status: "failed", processedCount: processed, updatedCount: updated, errorMessage: "Job was interrupted" });
                break;
              }

              try {
                const { generateTabloidHeadline } = await import("./emailScheduler");
                let keyInsights: string[] = [];
                try {
                  const raw = record.key_insights;
                  if (raw) keyInsights = typeof raw === "string" ? JSON.parse(raw) : raw;
                } catch {}
                const result = await generateTabloidHeadline(
                  record.episode_title,
                  record.podcast_name,
                  record.tldl || "",
                  record.what_happened || "",
                  keyInsights
                );
                if (result) {
                  await pool.query(
                    `UPDATE landing_page_recaps SET tabloid_headline = $1, tabloid_sub_headline = $2 WHERE id = $3`,
                    [result.tabloidHeadline, result.tabloidSubHeadline, record.id]
                  );
                  updated++;
                }
              } catch (err) {
                console.warn(`[Backfill] Failed for record ${record.id}:`, err);
              }

              processed++;
              await storage.upsertBackfillJob(key, { status: "running", processedCount: processed, updatedCount: updated });

              if (processed < records.length) {
                await new Promise(r => setTimeout(r, 10000));
              }
            }

            if (!aborted) {
              await storage.upsertBackfillJob(key, { status: "completed", processedCount: processed, updatedCount: updated, errorMessage: null });
            }
          } catch (err: any) {
            console.error("[Backfill] tabloid-headlines runner error:", err);
            await storage.upsertBackfillJob(key, { status: "failed", errorMessage: err?.message || "Unknown error" });
          } finally {
            activeBackfillAbortControllers.delete(key);
          }
        })();
      } catch (err) {
        console.error("[Backfill] Failed to start:", err);
        res.status(500).json({ message: "Failed to start backfill job" });
      }
    } else {
      res.status(400).json({ message: "No runner implemented for this backfill" });
    }
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

  app.get("/api/admin/users/sources", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const result = await pool.query(`SELECT DISTINCT signup_source FROM users WHERE signup_source IS NOT NULL AND signup_source != '' ORDER BY signup_source`);
    const sources = result.rows.map((r: any) => r.signup_source);
    const utmResult = await pool.query(`SELECT DISTINCT utm_source FROM users WHERE utm_source IS NOT NULL AND utm_source != '' AND utm_source NOT IN (SELECT DISTINCT signup_source FROM users WHERE signup_source IS NOT NULL)`);
    const utmSources = utmResult.rows.map((r: any) => `utm:${r.utm_source}`);
    res.json([...sources, ...utmSources].sort());
  });

  app.get("/api/admin/users/channels", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const result = await pool.query(`SELECT DISTINCT COALESCE(channel, 'Direct') as channel FROM users ORDER BY channel`);
    const channels = result.rows.map((r: any) => r.channel);
    res.json(channels);
  });

  app.get("/api/admin/users", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const sortBy = req.query.sortBy as string | undefined;
    const source = req.query.source as string | undefined;
    const channelFilter = req.query.channel as string | undefined;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (channelFilter) {
      conditions.push(`COALESCE(channel, 'Direct') = $${paramIndex++}`);
      params.push(channelFilter);
    } else if (source) {
      if (source.startsWith("utm:")) {
        conditions.push(`utm_source = $${paramIndex++}`);
        params.push(source.slice(4));
      } else {
        conditions.push(`signup_source = $${paramIndex++}`);
        params.push(source);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderClause = sortBy === "lastLogin" ? "ORDER BY last_login_at DESC NULLS LAST" : "ORDER BY created_at DESC";

    const result = await pool.query(`SELECT * FROM users ${whereClause} ${orderClause}`, params);
    const totalResult = await pool.query(`SELECT COUNT(*) FROM users`);
    const totalCount = parseInt(totalResult.rows[0].count, 10);

    const mapped = result.rows.map((r: any) => ({
      id: r.id,
      email: r.email,
      podcasts: r.podcasts || [],
      deliveryTime: r.delivery_time,
      deliveryTimezone: r.delivery_timezone,
      createdAt: r.created_at,
      lastLoginAt: r.last_login_at,
      plan: r.plan,
      emailVerified: r.email_verified,
      onboardingCompleted: r.onboarding_completed,
      signupSource: r.signup_source,
      channel: r.channel || "Direct",
    }));

    res.json({ users: mapped, totalCount });
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

  app.get("/api/admin/pipeline-monitor", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const days = Math.min(parseInt(String(req.query.days || "7")), 30);
      const interval = `${days} days`;

      // Transcripts (with recap status + queue context if it was queued first)
      const { rows: transcriptRows } = await pool.query(`
        SELECT
          'transcript' AS source,
          et.id AS transcript_id,
          et.podcast_id,
          et.episode_guid,
          pd.name AS podcast_name,
          pd.slug AS podcast_slug,
          et.episode_title,
          et.fetched_at AS transcript_at,
          to_timestamp(et.date_published) AS date_published,
          char_length(et.transcript) AS transcript_chars,
          ptq.status AS queue_status,
          ptq.attempts AS queue_attempts,
          ptq.error_message AS queue_error,
          ptq.created_at AS queued_at,
          ptq.last_attempt_at AS queue_last_attempt,
          lpr.id AS recap_id,
          lpr.episode_slug,
          lpr.published AS recap_published,
          lpr.created_at AS recap_at
        FROM episode_transcripts et
        INNER JOIN podcast_directory pd
          ON pd.itunes_id = et.podcast_id AND pd.status = 'published'
        LEFT JOIN pending_transcript_queue ptq
          ON ptq.podcast_id = et.podcast_id
          AND (ptq.episode_guid = et.episode_guid
            OR lower(trim(ptq.episode_title)) = lower(trim(et.episode_title)))
        LEFT JOIN landing_page_recaps lpr
          ON lpr.itunes_id = et.podcast_id
          AND lower(trim(lpr.episode_title)) = lower(trim(et.episode_title))
        WHERE et.fetched_at > NOW() - INTERVAL '${interval}'
        ORDER BY et.fetched_at DESC
        LIMIT 250
      `);

      // Queue-only items: webhook arrived, transcript not yet fetched
      const { rows: queueOnlyRows } = await pool.query(`
        SELECT
          'queue_only' AS source,
          NULL AS transcript_id,
          ptq.podcast_id,
          ptq.episode_guid,
          ptq.podcast_name,
          '' AS podcast_slug,
          ptq.episode_title,
          NULL AS transcript_at,
          NULL AS date_published,
          NULL AS transcript_chars,
          ptq.status AS queue_status,
          ptq.attempts AS queue_attempts,
          ptq.error_message AS queue_error,
          ptq.created_at AS queued_at,
          ptq.last_attempt_at AS queue_last_attempt,
          NULL AS recap_id,
          NULL AS episode_slug,
          NULL AS recap_published,
          NULL AS recap_at
        FROM pending_transcript_queue ptq
        WHERE ptq.created_at > NOW() - INTERVAL '${interval}'
          AND NOT EXISTS (
            SELECT 1 FROM episode_transcripts et
            WHERE et.podcast_id = ptq.podcast_id
              AND (et.episode_guid = ptq.episode_guid
                OR lower(trim(et.episode_title)) = lower(trim(ptq.episode_title)))
          )
        ORDER BY ptq.created_at DESC
        LIMIT 100
      `);

      const allRows = [...transcriptRows, ...queueOnlyRows].sort(
        (a, b) => new Date(b.transcript_at || b.queued_at).getTime() - new Date(a.transcript_at || a.queued_at).getTime()
      );

      res.json(allRows);
    } catch (err: any) {
      console.error("[PipelineMonitor] Error:", err.message);
      res.status(500).json({ message: "Failed to fetch pipeline data" });
    }
  });

  app.post("/api/admin/pipeline/retry", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { episode_guid, podcast_id, episode_title } = req.body;
      const { rows } = await pool.query(`
        UPDATE pending_transcript_queue
        SET status = 'pending', attempts = 0, error_message = NULL, last_attempt_at = NULL
        WHERE (episode_guid = $1 OR (podcast_id = $2 AND lower(trim(episode_title)) = lower(trim($3))))
          AND status = 'failed'
        RETURNING id
      `, [episode_guid || null, podcast_id || null, episode_title || null]);
      res.json({ retried: rows.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/pipeline/retry-all", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { rows } = await pool.query(`
        UPDATE pending_transcript_queue
        SET status = 'pending', attempts = 0, error_message = NULL, last_attempt_at = NULL
        WHERE status = 'failed'
        RETURNING id
      `);
      res.json({ retried: rows.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/pipeline-stats", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { rows: transcriptRows } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE et.fetched_at > NOW() - INTERVAL '24 hours') AS transcripts_24h,
          COUNT(*) FILTER (WHERE et.fetched_at > NOW() - INTERVAL '1 hour') AS transcripts_1h,
          ARRAY_AGG(et.fetched_at ORDER BY et.fetched_at ASC) FILTER (WHERE et.fetched_at > NOW() - INTERVAL '1 hour') AS transcript_times_1h
        FROM episode_transcripts et
        INNER JOIN podcast_directory pd
          ON pd.itunes_id = et.podcast_id AND pd.status = 'published'
      `);

      const { rows: recapRows } = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS recaps_24h,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') AS recaps_1h
        FROM landing_page_recaps
        WHERE published = true
      `);

      // awaitingRecap: transcripts received within the 3-day scheduler window with no recap yet.
      // This is exactly what the recap scheduler considers "pending" — matches the feed's Pending filter.
      const { rows: awaitingRows } = await pool.query(`
        SELECT COUNT(*) AS awaiting_recap
        FROM episode_transcripts et
        INNER JOIN podcast_directory pd
          ON pd.itunes_id = et.podcast_id AND pd.status = 'published'
        WHERE et.fetched_at > NOW() - INTERVAL '3 days'
          AND NOT EXISTS (
            SELECT 1 FROM landing_page_recaps lpr
            WHERE lpr.itunes_id = et.podcast_id
              AND lower(trim(lpr.episode_title)) = lower(trim(et.episode_title))
          )
      `);

      // queuePending: webhooks received but transcript not yet fetched from Taddy
      const { rows: queueRows } = await pool.query(`
        SELECT COUNT(*) AS queue_pending
        FROM pending_transcript_queue ptq
        WHERE ptq.status IN ('queued', 'pending')
          AND NOT EXISTS (
            SELECT 1 FROM episode_transcripts et
            WHERE et.podcast_id = ptq.podcast_id
              AND (et.episode_guid = ptq.episode_guid
                OR lower(trim(et.episode_title)) = lower(trim(ptq.episode_title)))
          )
      `);

      // transcriptFetchErrors: failures in the queue fetching transcripts from Taddy (NOT recap errors)
      const { rows: errorRows } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE COALESCE(last_attempt_at, created_at) > NOW() - INTERVAL '24 hours') AS transcript_fetch_errors_24h,
          COUNT(*) FILTER (WHERE COALESCE(last_attempt_at, created_at) > NOW() - INTERVAL '1 hour') AS transcript_fetch_errors_1h
        FROM pending_transcript_queue
        WHERE status = 'failed'
      `);

      const transcripts24h = parseInt(transcriptRows[0].transcripts_24h) || 0;
      const transcripts1h = parseInt(transcriptRows[0].transcripts_1h) || 0;
      const recaps24h = parseInt(recapRows[0].recaps_24h) || 0;
      const recaps1h = parseInt(recapRows[0].recaps_1h) || 0;
      const awaitingRecap = parseInt(awaitingRows[0].awaiting_recap) || 0;
      const queuePending = parseInt(queueRows[0].queue_pending) || 0;
      const transcriptFetchErrors24h = parseInt(errorRows[0].transcript_fetch_errors_24h) || 0;
      const transcriptFetchErrors1h = parseInt(errorRows[0].transcript_fetch_errors_1h) || 0;

      // Transcript inbound rate: avg gap between transcripts arriving in the last hour
      const times: string[] = transcriptRows[0].transcript_times_1h || [];
      let transcriptRate: string = "—";
      if (times.length >= 2) {
        const sorted = times.map((t: string) => new Date(t).getTime()).sort((a: number, b: number) => a - b);
        const gaps: number[] = [];
        for (let i = 1; i < sorted.length; i++) {
          gaps.push(sorted[i] - sorted[i - 1]);
        }
        const avgGapMs = gaps.reduce((s: number, g: number) => s + g, 0) / gaps.length;
        const avgGapMin = Math.max(1, Math.round(avgGapMs / 60000));
        transcriptRate = `1 every ${avgGapMin}m`;
      }

      // ETA to clear pending queue: based on recaps_1h completion rate
      let etaMinutes = "—";
      if (recaps1h > 0 && awaitingRecap > 0) {
        const minutesPerRecap = 60 / recaps1h;
        const totalMinutes = Math.round(awaitingRecap * minutesPerRecap);
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        if (hours > 0) {
          etaMinutes = `${hours}h ${mins}m`;
        } else {
          etaMinutes = `${mins}m`;
        }
      }

      res.json({
        transcripts24h,
        transcripts1h,
        recaps24h,
        recaps1h,
        awaitingRecap,
        queuePending,
        transcriptFetchErrors24h,
        transcriptFetchErrors1h,
        transcriptRate,
        etaMinutes,
      });
    } catch (err: any) {
      console.error("[PipelineStats] Error:", err.message);
      res.status(500).json({ message: "Failed to fetch pipeline stats" });
    }
  });

  // Scheduler health endpoint — checks if ProdRecap scheduler is running
  app.get("/api/admin/scheduler-health", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { rows } = await pool.query(`
        SELECT MAX(created_at) as last_recap_time
        FROM landing_page_recaps
        WHERE status IN ('published', 'hidden')
          AND created_at > NOW() - INTERVAL '1 hour'
      `);
      
      const lastRecapTime = rows[0]?.last_recap_time ? new Date(rows[0].last_recap_time) : null;
      const now = new Date();
      const isRunning = lastRecapTime && (now.getTime() - lastRecapTime.getTime()) < 15 * 60 * 1000; // 15 min threshold
      const minutesSinceLastRun = lastRecapTime ? Math.floor((now.getTime() - lastRecapTime.getTime()) / 60000) : null;
      
      res.json({
        isRunning: isRunning ?? false,
        lastRecapTime: lastRecapTime?.toISOString() || null,
        minutesSinceLastRun: minutesSinceLastRun,
      });
    } catch (err: any) {
      console.error("[SchedulerHealth] Error:", err.message);
      res.status(500).json({ message: "Failed to check scheduler health" });
    }
  });

  // Pipeline health snapshot — comprehensive status for support team diagnostics
  app.get("/api/admin/pipeline-health-snapshot", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      // Webhooks in last 5 min (from transcript queue creation time)
      const { rows: webhookRows } = await pool.query(`
        SELECT COUNT(*)::int as count FROM pending_transcript_queue 
        WHERE created_at > NOW() - INTERVAL '5 minutes'
      `);
      const webhooksLastFiveMin = webhookRows[0]?.count || 0;

      // Transcript fetch stats (last 24h)
      const { rows: transcriptRows } = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'completed')::int as completed,
          COUNT(*) FILTER (WHERE status = 'failed')::int as failed
        FROM pending_transcript_queue
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);
      const transcriptsCompleted = transcriptRows[0]?.completed || 0;
      const transcriptsFailed = transcriptRows[0]?.failed || 0;

      // Generation stats (last 24h from landing_page_recaps)
      const { rows: generationRows } = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'published')::int as published,
          COUNT(*) FILTER (WHERE status = 'generation_failed')::int as timed_out
        FROM landing_page_recaps
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);
      const generationCompleted = generationRows[0]?.published || 0;
      const generationTimedOut = generationRows[0]?.timed_out || 0;

      // Validation failures (hidden status, last 24h)
      const { rows: validationRows } = await pool.query(`
        SELECT COUNT(*)::int as count FROM landing_page_recaps
        WHERE status = 'hidden' AND created_at > NOW() - INTERVAL '24 hours'
      `);
      const validationFailed = validationRows[0]?.count || 0;

      // Last batch info (most recent successful or failed batch)
      const { rows: batchRows } = await pool.query(`
        SELECT 
          MAX(created_at) as last_batch_time,
          COUNT(*) FILTER (WHERE status = 'published')::int as last_batch_success_count,
          COUNT(*) FILTER (WHERE status = 'generation_failed')::int as last_batch_timeout_count,
          COUNT(*) FILTER (WHERE status = 'hidden')::int as last_batch_validation_count
        FROM landing_page_recaps
        WHERE created_at > NOW() - INTERVAL '1 hour'
        GROUP BY DATE(created_at)
        ORDER BY MAX(created_at) DESC
        LIMIT 1
      `);
      const lastBatchTime = batchRows[0]?.last_batch_time ? new Date(batchRows[0].last_batch_time) : null;
      const lastBatchSuccess = batchRows[0]?.last_batch_success_count || 0;
      const lastBatchTimeout = batchRows[0]?.last_batch_timeout_count || 0;
      const lastBatchValidation = batchRows[0]?.last_batch_validation_count || 0;

      res.json({
        webhooksLastFiveMin,
        transcriptsCompleted,
        transcriptsFailed,
        generationCompleted,
        generationTimedOut,
        validationFailed,
        lastBatchTime: lastBatchTime?.toISOString() || null,
        lastBatchSuccess,
        lastBatchTimeout,
        lastBatchValidation,
      });
    } catch (err: any) {
      console.error("[PipelineHealthSnapshot] Error:", err.message);
      res.status(500).json({ message: "Failed to fetch health snapshot" });
    }
  });

  // Live monitoring endpoint — recently completed + pending queue sorted oldest-first (scheduler order)
  app.get("/api/admin/pipeline-live", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { rows: completedRows } = await pool.query(`
        SELECT
          et.id AS transcript_id,
          et.episode_title,
          et.fetched_at AS transcript_at,
          pd.name AS podcast_name,
          pd.slug AS podcast_slug,
          lpr.id AS recap_id,
          lpr.episode_slug,
          lpr.created_at AS recap_at
        FROM landing_page_recaps lpr
        INNER JOIN podcast_directory pd ON pd.slug = lpr.slug
        INNER JOIN episode_transcripts et
          ON et.podcast_id = pd.itunes_id
          AND lower(trim(et.episode_title)) = lower(trim(lpr.episode_title))
        WHERE lpr.created_at > NOW() - INTERVAL '2 hours'
          AND lpr.published = true
        ORDER BY lpr.created_at DESC
        LIMIT 5
      `);

      // Pending: transcripts received in the scheduler window (3 days) with no recap yet
      // Sorted ASC (oldest transcript first) — this is the order the scheduler will process them
      const { rows: pendingRows } = await pool.query(`
        SELECT
          et.id AS transcript_id,
          et.episode_title,
          et.podcast_id,
          et.episode_guid,
          et.fetched_at AS transcript_at,
          char_length(et.transcript) AS transcript_chars,
          pd.name AS podcast_name,
          pd.slug AS podcast_slug
        FROM episode_transcripts et
        INNER JOIN podcast_directory pd
          ON pd.itunes_id = et.podcast_id AND pd.status = 'published'
        WHERE et.fetched_at > NOW() - INTERVAL '3 days'
          AND NOT EXISTS (
            SELECT 1 FROM landing_page_recaps lpr
            WHERE lpr.itunes_id = et.podcast_id
              AND lower(trim(lpr.episode_title)) = lower(trim(et.episode_title))
          )
        ORDER BY et.fetched_at ASC
        LIMIT 20
      `);

      res.json({ recentlyCompleted: completedRows, pendingQueue: pendingRows });
    } catch (err: any) {
      console.error("[PipelineLive] Error:", err.message);
      res.status(500).json({ message: "Failed to fetch live pipeline data" });
    }
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
    const { generateEmailSubjectAndPreview, fetchShopBooks, fetchMissedEpisodes } = await import("./emailScheduler");
    const { parseDigestMarkdown } = await import("./emailTemplate");
    const parsedForPreview = parseDigestMarkdown(pending.summary);
    const epCountPreview = parsedForPreview.episodes.length || 1;
    const emailCopyPreview = await generateEmailSubjectAndPreview(pending.summary, epCountPreview);
    const { reorderMarkdownLeadFirst } = await import("./emailScheduler");
    const reorderedPreview = reorderMarkdownLeadFirst(pending.summary, emailCopyPreview.leadEpisodePodcast);
    let previewUser: any = null;
    try { previewUser = await storage.getUserById(pending.userId); } catch {}
    const [previewShopBooks, previewMissedEpisodes] = await Promise.all([
      fetchShopBooks(),
      fetchMissedEpisodes(previewUser || {}),
    ]);
    const freshHtml = markdownToEmailHtml(reorderedPreview, pending.recipientEmail, epMeta, emailCopyPreview, undefined, previewShopBooks, previewMissedEpisodes);
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
      const dateRange = req.body.dateRange || undefined;
      refreshLandingPageRecaps(true, dateRange);
      res.json({ message: "Landing recap refresh started", dateRange: dateRange || "all" });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to start" });
    }
  });



  app.get("/api/admin/episode-ingestion", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { getTaddyBudgetStatus } = await import("./taddyClient");

      const { rows: zeroPodcasts } = await pool.query(`
        SELECT pd.itunes_id, pd.name, pd.slug
        FROM podcast_directory pd
        WHERE pd.has_landing_page = true
          AND NOT EXISTS (SELECT 1 FROM episode_transcripts et WHERE et.podcast_id = pd.itunes_id)
        ORDER BY pd.name
      `);

      const { rows: episodeStats } = await pool.query(`
        SELECT COUNT(*) as total_transcripts,
               COUNT(DISTINCT podcast_id) as podcasts_with_transcripts,
               COUNT(CASE WHEN fetched_at > NOW() - INTERVAL '24 hours' THEN 1 END) as fetched_last_24h,
               COUNT(CASE WHEN fetched_at > NOW() - INTERVAL '7 days' THEN 1 END) as fetched_last_7d
        FROM episode_transcripts
      `);

      const { rows: queueStats } = await pool.query(`
        SELECT status, COUNT(*) as cnt FROM pending_transcript_queue GROUP BY status
      `);

      const { rows: recentErrors } = await pool.query(`
        SELECT podcast_name, episode_title, error_message, attempts, last_attempt_at, created_at
        FROM pending_transcript_queue
        WHERE status = 'failed' OR (status = 'pending' AND attempts > 0)
        ORDER BY last_attempt_at DESC NULLS LAST
        LIMIT 20
      `);

      const budgetStatus = getTaddyBudgetStatus();

      const queueDepth: Record<string, number> = {};
      for (const r of queueStats) {
        queueDepth[r.status] = parseInt(r.cnt);
      }

      res.json({
        taddyBudget: budgetStatus,
        podcastsWithZeroEpisodes: {
          count: zeroPodcasts.length,
          podcasts: zeroPodcasts,
        },
        transcriptStats: episodeStats[0] || {},
        queueDepth,
        recentErrors,
      });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch ingestion stats" });
    }
  });

  app.post("/api/admin/process-transcript-queue", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const force = req.body?.force === true;
      const { refreshNewTranscripts } = await import("./emailScheduler");
      refreshNewTranscripts({ force });
      res.json({ message: force ? "Episode backfill started (force mode, skipping recency check)" : "Transcript refresh triggered (includes queue processing)" });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to trigger queue processing" });
    }
  });

  app.get("/api/admin/process-transcript-queue/status", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { getTranscriptRefreshProgress } = await import("./emailScheduler");
      res.json(getTranscriptRefreshProgress());
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to get status" });
    }
  });

  app.get("/api/admin/processing-health", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { getProcessingHealth } = await import("./recapValidator");
      const health = getProcessingHealth();

      const { rows: unresolvedFailures } = await pool.query(
        `SELECT id, recap_id, podcast_slug, episode_title, podcast_name, failure_type, details, created_at
         FROM recap_processing_failures WHERE resolved = false ORDER BY created_at DESC LIMIT 50`
      );

      const { rows: failureStats } = await pool.query(
        `SELECT failure_type, COUNT(*) as cnt FROM recap_processing_failures
         WHERE resolved = false GROUP BY failure_type`
      );

      res.json({
        ...health,
        persistedFailures: {
          unresolved: unresolvedFailures.length,
          byType: failureStats,
          recent: unresolvedFailures.slice(0, 20),
        }
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/processing-failures/resolve", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const { ids, resolveAll } = req.body;
    try {
      if (resolveAll) {
        const result = await pool.query(`UPDATE recap_processing_failures SET resolved = true WHERE resolved = false`);
        return res.json({ resolved: result.rowCount });
      }
      if (ids && Array.isArray(ids)) {
        const result = await pool.query(`UPDATE recap_processing_failures SET resolved = true WHERE id = ANY($1)`, [ids]);
        return res.json({ resolved: result.rowCount });
      }
      res.status(400).json({ message: "Provide 'ids' array or 'resolveAll: true'" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });


  app.post("/api/admin/sql", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { query } = req.body;
      if (!query || typeof query !== "string") return res.status(400).json({ message: "query is required" });
      const trimmed = query.trim().toLowerCase();
      if (!trimmed.startsWith("select") && !trimmed.startsWith("with")) {
        return res.status(400).json({ message: "Only SELECT/WITH queries are allowed" });
      }
      const forbidden = ["insert ", "update ", "delete ", "drop ", "alter ", "truncate ", "create ", "grant ", "revoke "];
      for (const f of forbidden) {
        if (trimmed.includes(f)) return res.status(400).json({ message: `Forbidden keyword: ${f.trim()}` });
      }
      const { rows } = await pool.query(query);
      res.json({ rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/validate-recaps", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    const { dateRange, limit: batchLimit, dryRun } = req.body;
    const maxBatch = Math.min(batchLimit || 50, 200);
    try {
      const params: any[] = [maxBatch];
      let dateFilter = '';
      if (dateRange?.from && dateRange?.to) {
        dateFilter = ` AND r.publish_date >= $2 AND r.publish_date <= $3`;
        params.push(dateRange.from, dateRange.to);
      }
      const { rows } = await pool.query(`
        SELECT r.id, r.slug, r.episode_slug, r.episode_title, r.podcast_name, r.itunes_id, r.hosts,
               r.tldl, r.tabloid_headline, r.spotify_episode_url, r.apple_episode_url
        FROM landing_page_recaps r
        WHERE r.published = true${dateFilter}
        ORDER BY r.id DESC LIMIT $1
      `, params);

      if (dryRun) {
        const { validateAndEnrichRecap } = await import("./recapValidator");
        const issues: any[] = [];
        for (const row of rows) {
          const isEmpty = (v: any) => v === null || v === undefined || v === "" || v === "[]";
          const missing: string[] = [];
          if (isEmpty(row.tldl)) missing.push("tldl");
          if (isEmpty(row.tabloid_headline)) missing.push("tabloid");
          if (isEmpty(row.spotify_episode_url)) missing.push("spotify_url");
          if (isEmpty(row.apple_episode_url)) missing.push("apple_url");
          if (missing.length > 0) {
            issues.push({ id: row.id, title: row.episode_title?.slice(0, 60), podcast: row.podcast_name, missing });
          }
        }
        return res.json({ mode: "dry_run", checked: rows.length, withIssues: issues.length, issues: issues.slice(0, 100) });
      }

      const { validateAndEnrichRecap } = await import("./recapValidator");
      const results: any[] = [];
      for (const row of rows) {
        let transcript: string | null = null;
        try {
          const { rows: tRows } = await pool.query(
            `SELECT et.transcript FROM episode_transcripts et
             JOIN podcast_directory pd ON pd.itunes_id = CAST(et.podcast_id AS TEXT)
             WHERE pd.slug = $1 AND et.episode_title = $2 LIMIT 1`,
            [row.slug, row.episode_title]
          );
          transcript = tRows[0]?.transcript || null;
        } catch {}
        const result = await validateAndEnrichRecap(
          row.id, row.slug, row.episode_slug, row.podcast_name,
          row.episode_title, row.itunes_id, transcript, row.hosts || null
        );
        if (result.missing.length > 0 || result.fixed.length > 0) {
          results.push(result);
        }
      }
      res.json({ checked: rows.length, enriched: results.length, results: results.slice(0, 100) });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
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

  app.get("/api/admin/shop-books", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM book_enrichments WHERE slug IS NOT NULL ORDER BY book_title ASC`
      );
      res.json({ books: rows });
    } catch (err: any) {
      console.error("[Shop] Books error:", err);
      res.status(500).json({ message: err?.message || "Failed to load books" });
    }
  });

  app.post("/api/admin/shop-books/enrich", async (req, res) => {
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
          console.warn("[Shop] Google Books fetch failed:", e);
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
        console.warn("[Shop] Open Library fetch failed:", e);
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
      console.error("[Shop] Enrich error:", err);
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

      async function tryGoogleBooks(gbId: string, slug: string): Promise<CandidateResult> {
        for (const zoom of [3, 2]) {
          const url = `https://books.google.com/books/content?id=${gbId}&printsec=frontcover&img=1&zoom=${zoom}&source=gbs_api`;
          try {
            const r = await fetch(url);
            if (!r.ok) continue;
            const buf = Buffer.from(await r.arrayBuffer());
            if (isPlaceholder(buf)) continue;
            if (isPureColorImage(buf)) continue;
            if (looksLikeDocument(buf)) continue;
            const { w, h } = getDimensions(buf);
            if (w >= MIN_WIDTH) {
              const filename = `${slug}_google_books.jpg`;
              fsMod.default.writeFileSync(pathMod.default.join(candidatesDir, filename), buf);
              return { source: "google_books", width: w, height: h, size: buf.length, filename, url: `/books/candidates/${filename}` };
            }
          } catch {}
        }
        return null;
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

      let candidate: NonNullable<CandidateResult> | null = null;
      if (googleBooksId) {
        candidate = await tryGoogleBooks(googleBooksId, book.slug) as NonNullable<CandidateResult> | null;
      }

      if (!candidate && book.isbn) {
        try {
          const isbnRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${book.isbn}&maxResults=1`);
          if (isbnRes.ok) {
            const isbnData = await isbnRes.json();
            const isbnGbId = isbnData.items?.[0]?.id;
            if (isbnGbId && isbnGbId !== googleBooksId) {
              googleBooksId = isbnGbId;
              await pool.query(`UPDATE book_enrichments SET google_books_id = $1 WHERE id = $2 AND google_books_id IS NULL`, [googleBooksId, book.id]);
              candidate = await tryGoogleBooks(isbnGbId, book.slug) as NonNullable<CandidateResult> | null;
            }
          }
        } catch {}
      }

      const candidates = candidate ? [candidate] : [];

      if (candidates.length === 0) {
        const existingCover = pathMod.default.join(pathMod.default.resolve("public/books"), `${book.slug}.jpg`);
        const hasExistingFile = fsMod.default.existsSync(existingCover);
        if (!hasExistingFile) {
          await pool.query(
            "UPDATE book_enrichments SET cover_approved = false, has_cover = false, rejection_reason = 'no_images', updated_at = NOW() WHERE id = $1",
            [book.id]
          );
        }
      }

      res.json({ candidates, bookId: book.id, slug: book.slug, title: book.book_title });
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

      const validSources = ["google_books"];
      if (!validSources.includes(source)) return res.status(400).json({ message: "Invalid source" });

      const { rows } = await pool.query(
        `SELECT id, slug, cover_tried_sources FROM book_enrichments WHERE id = $1`,
        [id]
      );
      if (!rows.length) return res.status(404).json({ message: "Book not found" });
      const book = rows[0];

      const expectedFilename = `${book.slug}_google_books.jpg`;
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
        `SELECT transcript, description FROM episode_transcripts WHERE podcast_id = $1 AND ${SQL_NORMALIZE_TITLE('episode_title')} = ${SQL_NORMALIZE_TITLE('$2')} LIMIT 1`,
        [String(itunes_id), episode_title]
      );
      if (transcriptRows.length === 0) return res.status(404).json({ message: "Transcript not found" });

      const { processFullTranscript } = await import("./transcriptChunker");
      const processedTranscript = processFullTranscript(transcriptRows[0].transcript);

      const { rows: pdRows } = await pool.query(`SELECT name FROM podcast_directory WHERE slug = $1`, [podcastSlug]);
      const podcastName = pdRows[0]?.name || podcastSlug;

      const showNotes = transcriptRows[0].description || null;

      const { generateRecapFromTranscript } = await import("./recapGenerator");
      const recap = await generateRecapFromTranscript(processedTranscript, podcastName, episode_title, showNotes);
      if (!recap) return res.status(500).json({ message: "AI generation failed" });

      const { rows: existingRows } = await pool.query(
        `SELECT tldl, tabloid_headline, tabloid_sub_headline, spotify_episode_url, guests FROM landing_page_recaps WHERE slug = $1 AND episode_slug = $2`,
        [podcastSlug, episodeSlug]
      );
      const existingRecap = existingRows[0] || {};

      let tabloidHeadline: string | null = existingRecap.tabloid_headline || null;
      let tabloidSubHeadline: string | null = existingRecap.tabloid_sub_headline || null;
      let spotifyEpisodeUrl: string | null = existingRecap.spotify_episode_url || null;

      try {
        const { generateTabloidHeadline } = await import("./emailScheduler");
        const tabloidResult = await generateTabloidHeadline(
          episode_title,
          podcastName,
          existingRecap.tldl || "",
          recap.whatHappened,
          recap.keyInsights || []
        );
        if (tabloidResult) {
          tabloidHeadline = tabloidResult.tabloidHeadline;
          tabloidSubHeadline = tabloidResult.tabloidSubHeadline;
        }
      } catch (err) {
        console.warn("[Admin] Tabloid headline generation failed during regenerate, continuing:", err);
      }

      const aiGuests = recap.guests && recap.guests.length > 0 ? recap.guests : null;
      let guestsToStore: string;
      if (aiGuests) {
        guestsToStore = JSON.stringify(aiGuests);
      } else {
        const existingGuestsRaw = existingRecap.guests;
        let hasExistingGuests = false;
        if (existingGuestsRaw) {
          try {
            const parsed = typeof existingGuestsRaw === 'string' ? JSON.parse(existingGuestsRaw) : existingGuestsRaw;
            hasExistingGuests = Array.isArray(parsed) && parsed.length > 0;
          } catch {}
        }
        guestsToStore = hasExistingGuests ? (typeof existingGuestsRaw === 'string' ? existingGuestsRaw : JSON.stringify(existingGuestsRaw)) : "[]";
        if (hasExistingGuests) {
          console.log(`[Admin] Regenerate: AI returned empty guests, preserving existing guest data for ${podcastSlug}/${episodeSlug}`);
        }
      }

      await pool.query(
        `UPDATE landing_page_recaps SET what_happened = $1, key_insights = $2, guests = $3, resources = $4, tabloid_headline = $5, tabloid_sub_headline = $6, spotify_episode_url = $7 WHERE slug = $8 AND episode_slug = $9`,
        [
          recap.whatHappened,
          recap.keyInsights && recap.keyInsights.length > 0 ? recap.keyInsights : null,
          guestsToStore,
          recap.resources ? JSON.stringify(recap.resources) : "[]",
          tabloidHeadline,
          tabloidSubHeadline,
          spotifyEpisodeUrl,
          podcastSlug,
          episodeSlug,
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

      let query = `SELECT pd.*, (SELECT COUNT(*) FROM landing_page_recaps lpr WHERE lpr.slug = pd.slug) as episode_count,
        COALESCE((SELECT COUNT(*) FILTER (WHERE lpr2.key_insights IS NOT NULL AND array_length(lpr2.key_insights, 1) > 0) FROM landing_page_recaps lpr2 WHERE lpr2.slug = pd.slug), 0) as episodes_with_takeaways,
        COALESCE((SELECT COUNT(*) FILTER (WHERE lpr2.what_happened IS NOT NULL AND lpr2.what_happened != '') FROM landing_page_recaps lpr2 WHERE lpr2.slug = pd.slug), 0) as episodes_with_recaps,
        COALESCE((SELECT COUNT(*) FILTER (WHERE lpr2.tabloid_headline IS NOT NULL AND lpr2.tabloid_headline != '') FROM landing_page_recaps lpr2 WHERE lpr2.slug = pd.slug), 0) as episodes_with_headlines,
        (SELECT MAX(lpr3.created_at) FROM landing_page_recaps lpr3 WHERE lpr3.slug = pd.slug) as last_episode_date,
        COALESCE((
          SELECT CASE
            WHEN COUNT(*) <= 1 THEN 0
            WHEN (MAX(et.date_published) - MIN(et.date_published)) < 86400 THEN 0
            ELSE ROUND((COUNT(*)::numeric / ((MAX(et.date_published) - MIN(et.date_published))::numeric / 86400)) * 7, 1)
          END
          FROM episode_transcripts et
          WHERE et.podcast_id = pd.itunes_id::text AND et.date_published IS NOT NULL
        ), 0) as avg_episodes_per_week
        FROM podcast_directory pd WHERE 1=1`;
      const params: any[] = [];
      if (search) {
        params.push(`%${search}%`);
        query += ` AND (pd.name ILIKE $${params.length} OR pd.slug ILIKE $${params.length} OR pd.hosts ILIKE $${params.length})`;
      }
      if (status && status !== "all") {
        params.push(status);
        query += ` AND pd.status = $${params.length}`;
      }
      const sortCol = sort === "name" ? "pd.name" : sort === "episodes" ? "episode_count" : sort === "avg_per_week" ? "avg_episodes_per_week" : sort === "date_added" ? "pd.created_at" : sort === "last_episode" ? "last_episode_date" : sort === "followers" ? "pd.name" : "pd.name";
      const sortOrder = order === "desc" ? "DESC" : "ASC";
      const nullsLast = sort === "last_episode" || sort === "date_added" ? " NULLS LAST" : "";
      query += ` ORDER BY ${sortCol} ${sortOrder}${nullsLast}`;
      const { rows } = await pool.query(query, params);

      const enrichedRows = rows.map((r: any) => {
        const totalEps = Number(r.episode_count) || 0;
        const takeawaysPct = totalEps > 0 ? Math.round((Number(r.episodes_with_takeaways) / totalEps) * 100) : 0;
        const recapsPct = totalEps > 0 ? Math.round((Number(r.episodes_with_recaps) / totalEps) * 100) : 0;
        const headlinesPct = totalEps > 0 ? Math.round((Number(r.episodes_with_headlines) / totalEps) * 100) : 0;
        const enrichment_score = Math.round((takeawaysPct + recapsPct + headlinesPct) / 3);
        return {
          ...r,
          follower_count: followerMap.get(String(r.itunes_id)) || 0,
          enrichment_score,
          takeaways_pct: takeawaysPct,
          recaps_pct: recapsPct,
          headlines_pct: headlinesPct,
        };
      });

      if (sort === "followers") {
        enrichedRows.sort((a: any, b: any) => {
          return order === "desc" ? b.follower_count - a.follower_count : a.follower_count - b.follower_count;
        });
      }

      if (sort === "enrichment") {
        enrichedRows.sort((a: any, b: any) => {
          return order === "desc" ? b.enrichment_score - a.enrichment_score : a.enrichment_score - b.enrichment_score;
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

      const publishDates = episodeRows
        .map((ep: any) => ep.publish_date)
        .filter((d: any) => d)
        .sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime());
      let avgFrequencyHours: number | null = null;
      let earliestEpisode: string | null = null;
      let latestEpisode: string | null = null;
      if (publishDates.length >= 2) {
        latestEpisode = publishDates[0];
        earliestEpisode = publishDates[publishDates.length - 1];
        const gaps: number[] = [];
        for (let i = 0; i < publishDates.length - 1; i++) {
          const gap = (new Date(publishDates[i]).getTime() - new Date(publishDates[i + 1]).getTime()) / (1000 * 60 * 60);
          gaps.push(gap);
        }
        avgFrequencyHours = Math.round(gaps.reduce((a: number, b: number) => a + b, 0) / gaps.length);
      } else if (publishDates.length === 1) {
        latestEpisode = publishDates[0];
        earliestEpisode = publishDates[0];
      }

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
          avgFrequencyHours,
          earliestEpisode,
          latestEpisode,
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
      const validStatuses = ["published", "needs_review", "hidden", "requested"];
      if (req.body.status && !validStatuses.includes(req.body.status)) {
        return res.status(400).json({ message: "Invalid status. Must be: published, needs_review, hidden, or requested" });
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

  app.post("/api/admin/cms/podcasts/:slug/approve", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { slug } = req.params;
      const isNumericId = /^\d+$/.test(slug);
      const whereClause = isNumericId ? `id = $1::int` : `slug = $1`;
      const { rows } = await pool.query(
        `SELECT id, slug, name, itunes_id, status, artwork_url, description, category, feed_url, total_episodes, apple_url FROM podcast_directory WHERE ${whereClause}`,
        [slug]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Podcast not found" });
      const podcast = rows[0];
      if (podcast.status !== "requested") {
        return res.status(400).json({ message: `Podcast status is "${podcast.status}", not "requested"` });
      }

      const updates: Record<string, any> = {
        status: "published",
        has_landing_page: true,
      };

      if (podcast.itunes_id) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          const itunesResp = await fetch(`https://itunes.apple.com/lookup?id=${podcast.itunes_id}&entity=podcast`, { signal: controller.signal });
          clearTimeout(timeout);
          if (itunesResp.ok) {
            const itunesData = await itunesResp.json();
            const result = (itunesData.results || []).find((r: any) => r.wrapperType === "collection" || r.kind === "podcast");
            if (result) {
              const art = (result.artworkUrl600 || result.artworkUrl100 || "").replace(/\d+x\d+bb/, "1200x1200bb");
              if (art && !podcast.artwork_url) updates.artwork_url = art;
              if (result.primaryGenreName && !podcast.category) updates.category = result.primaryGenreName;
              if (result.feedUrl && !podcast.feed_url) updates.feed_url = result.feedUrl;
              if (result.trackCount) updates.total_episodes = result.trackCount;
              if (result.collectionViewUrl && !podcast.apple_url) updates.apple_url = result.collectionViewUrl;
              const itunesDesc = result.description || result.collectionName || "";
              if (itunesDesc && !podcast.description) updates.description = itunesDesc;
            }
          }
        } catch (itunesErr) {
          console.error("[CMS] iTunes lookup during approve failed:", itunesErr);
        }
      }

      const sets: string[] = [];
      const params: any[] = [];
      for (const [col, val] of Object.entries(updates)) {
        params.push(val);
        sets.push(`${col} = $${params.length}`);
      }
      sets.push(`updated_at = NOW()`);
      params.push(podcast.id);
      await pool.query(`UPDATE podcast_directory SET ${sets.join(", ")} WHERE id = $${params.length}`, params);

      console.log(`[CMS] Approved requested podcast: ${podcast.name} (slug: ${podcast.slug})`);

      res.json({ success: true, name: podcast.name, slug: podcast.slug, fieldsUpdated: Object.keys(updates) });

      (async () => {
        try {
          await refreshPodcastMetadataBySlug(podcast.slug);
          console.log(`[CMS] Async metadata enrichment completed for approved podcast: ${podcast.name}`);
        } catch (err) {
          console.error(`[CMS] Async metadata enrichment failed for ${podcast.name}:`, err);
        }
      })();
    } catch (err: any) {
      console.error("[CMS] Approve podcast error:", err);
      res.status(500).json({ message: err?.message || "Failed to approve podcast" });
    }
  });

  async function refreshPodcastMetadataBySlug(slug: string): Promise<{ fieldsUpdated: string[]; errors: string[]; totalUpdated: number }> {
    const { rows } = await pool.query(
      `SELECT id, slug, name, itunes_id, artwork_url, apple_url, spotify_url, description, category,
              youtube_url, website_url, twitter_handle, instagram_url, tiktok_url, facebook_url,
              hosts, frequency, avg_episode_length, year_started, about_podcast, total_episodes, feed_url
       FROM podcast_directory WHERE slug = $1`, [slug]
    );
    if (rows.length === 0) throw new Error(`Podcast not found for slug: ${slug}`);
    const podcast = rows[0];
    const updates: Record<string, any> = {};
    const log: string[] = [];
    const errors: string[] = [];

    if (podcast.itunes_id) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const itunesResp = await fetch(`https://itunes.apple.com/lookup?id=${podcast.itunes_id}`, { signal: controller.signal });
        clearTimeout(timeout);
        if (itunesResp.ok) {
          const itunesData = await itunesResp.json();
          const r = (itunesData.results || [])[0];
          if (r) {
            const art = (r.artworkUrl600 || r.artworkUrl100 || "").replace(/\d+x\d+bb/, "1200x1200bb");
            if (art) { updates.artwork_url = art; log.push("artwork"); }
            if (r.collectionName) { updates.name = r.collectionName; log.push("name"); }
            if (r.collectionViewUrl) { updates.apple_url = r.collectionViewUrl; log.push("apple_url"); }
            if (r.primaryGenreName) { updates.category = r.primaryGenreName; log.push("category"); }
            if (r.trackCount) { updates.total_episodes = r.trackCount; log.push("total_episodes"); }
            if (r.feedUrl) { updates.feed_url = r.feedUrl; }
          }
        }
      } catch (e: any) { errors.push(`iTunes: ${e.message}`); }
    }

    const podcastName = updates.name || podcast.name;
    try {
      const { searchSpotifyShow } = await import("./spotifyClient");
      const spotifyUrl = await searchSpotifyShow(podcastName);
      if (spotifyUrl) { updates.spotify_url = spotifyUrl; log.push("spotify_url"); }
    } catch (e: any) {
      console.error(`[CMS] Spotify lookup failed for "${podcastName}":`, e.message);
      errors.push(`Spotify: ${e.message}`);
    }

    const feedUrl = updates.feed_url || podcast.feed_url;
    if (!updates.feed_url && feedUrl) {
      updates.feed_url = feedUrl;
    }
    if (feedUrl && typeof feedUrl === "string" && feedUrl.startsWith("http")) {
      try {
        const feedResp = await fetch(feedUrl, {
          headers: { "User-Agent": "PodRise/1.0" },
          signal: AbortSignal.timeout(8000),
        });
        if (feedResp.ok) {
          const feedXml = await feedResp.text();
          const extract = (tag: string) => {
            const m = feedXml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([^<]*)</${tag}>`));
            return m ? (m[1] || m[2] || "").trim() : null;
          };

          const desc = extract("description") || extract("itunes:summary");
          if (desc && desc.length > 10) {
            updates.description = desc.slice(0, 2000); log.push("description");
            updates.about_podcast = desc.slice(0, 5000); log.push("about_podcast");
          }

          const link = extract("link");
          if (link && link.startsWith("http") && !link.includes("apple.com") && !link.includes("spotify.com")) {
            updates.website_url = link; log.push("website_url");
          }

          const author = extract("itunes:author");
          if (author) { updates.hosts = author; log.push("hosts"); }

          const socialLinks = feedXml.match(/https?:\/\/(www\.)?(twitter\.com|x\.com|instagram\.com|facebook\.com|youtube\.com|tiktok\.com|discord\.gg)[^\s<"']*/gi) || [];
          for (const link of socialLinks) {
            if (!updates.twitter_handle && (link.includes("twitter.com/") || link.includes("x.com/"))) {
              const handle = link.split("/").filter(Boolean).pop()?.replace(/[?#].*/, "");
              if (handle && handle.length > 1 && handle.length < 50) { updates.twitter_handle = handle; log.push("twitter"); }
            }
            if (!updates.instagram_url && link.includes("instagram.com/")) { updates.instagram_url = link.replace(/[?#].*/, ""); log.push("instagram"); }
            if (!updates.facebook_url && link.includes("facebook.com/")) { updates.facebook_url = link.replace(/[?#].*/, ""); log.push("facebook"); }
            if (!updates.youtube_url && link.includes("youtube.com/")) { updates.youtube_url = link.replace(/[?#].*/, ""); log.push("youtube"); }
            if (!updates.tiktok_url && link.includes("tiktok.com/")) { updates.tiktok_url = link.replace(/[?#].*/, ""); log.push("tiktok"); }
          }

          const itemMatches = feedXml.match(/<item[\s>]/gi);
          const itemCount = itemMatches ? itemMatches.length : 0;
          if (itemCount > 0 && !updates.total_episodes) {
            updates.total_episodes = itemCount;
            log.push("total_episodes");
          }

          const pubDateMatches = [...feedXml.matchAll(/<item[\s\S]*?<pubDate>([^<]+)<\/pubDate>/gi)];
          const episodeDates: Date[] = [];
          for (const pm of pubDateMatches) {
            const d = new Date(pm[1].trim());
            if (!isNaN(d.getTime())) episodeDates.push(d);
          }
          episodeDates.sort((a, b) => b.getTime() - a.getTime());

          if (episodeDates.length >= 2) {
            const recentDates = episodeDates.slice(0, Math.min(20, episodeDates.length));
            const gaps: number[] = [];
            for (let i = 0; i < recentDates.length - 1; i++) {
              gaps.push((recentDates[i].getTime() - recentDates[i + 1].getTime()) / (1000 * 60 * 60 * 24));
            }
            const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
            let frequency = "Weekly";
            if (avgGap <= 1.5) frequency = "Daily";
            else if (avgGap <= 4) frequency = "Multiple times a week";
            else if (avgGap <= 10) frequency = "Weekly";
            else if (avgGap <= 18) frequency = "Bi-weekly";
            else if (avgGap <= 45) frequency = "Monthly";
            else frequency = "Occasionally";
            updates.frequency = frequency;
            log.push("frequency");
          }

          if (episodeDates.length > 0) {
            const earliest = episodeDates[episodeDates.length - 1];
            updates.year_started = earliest.getFullYear();
            log.push("year_started");
          }

          const durationMatches = [...feedXml.matchAll(/<itunes:duration>([^<]+)<\/itunes:duration>/gi)];
          if (durationMatches.length > 0) {
            let totalMinutes = 0;
            let validCount = 0;
            for (const dm of durationMatches) {
              const raw = dm[1].trim();
              let minutes = 0;
              if (raw.includes(":")) {
                const parts = raw.split(":").map(Number);
                if (parts.length === 3) minutes = parts[0] * 60 + parts[1] + parts[2] / 60;
                else if (parts.length === 2) minutes = parts[0] + parts[1] / 60;
              } else {
                const sec = parseInt(raw, 10);
                if (!isNaN(sec)) minutes = sec / 60;
              }
              if (minutes > 0) { totalMinutes += minutes; validCount++; }
            }
            if (validCount > 0) {
              updates.avg_episode_length = Math.round(totalMinutes / validCount);
              log.push("avg_episode_length");
            }
          }
        }
      } catch (e: any) { errors.push(`RSS feed: ${e.message}`); }
    }

    if (Object.keys(updates).length > 0) {
      const sets: string[] = [];
      const params: any[] = [];
      for (const [col, val] of Object.entries(updates)) {
        params.push(val);
        sets.push(`${col} = $${params.length}`);
      }
      params.push(slug);
      sets.push(`updated_at = NOW()`);
      await pool.query(`UPDATE podcast_directory SET ${sets.join(", ")} WHERE slug = $${params.length}`, params);
    }

    return { fieldsUpdated: log, errors, totalUpdated: Object.keys(updates).length };
  }

  app.post("/api/admin/cms/podcasts/:slug/refresh-metadata", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { slug } = req.params;
      const { rows: checkRows } = await pool.query(`SELECT id FROM podcast_directory WHERE slug = $1`, [slug]);
      if (checkRows.length === 0) return res.status(404).json({ message: "Podcast not found" });
      const result = await refreshPodcastMetadataBySlug(slug);
      const { rows: updated } = await pool.query(`SELECT * FROM podcast_directory WHERE slug = $1`, [slug]);
      res.json({ updated: updated[0], fieldsUpdated: result.fieldsUpdated, errors: result.errors, totalUpdated: result.totalUpdated });
    } catch (err: any) {
      console.error("[CMS] Refresh metadata error:", err);
      res.status(500).json({ message: err?.message || "Failed to refresh metadata" });
    }
  });

  const clearDuplicateSpotifyState: Record<string, { running: boolean; total: number; processed: number; cleared: number; complete: boolean }> = {};

  app.post("/api/admin/cms/podcasts/:slug/clear-duplicate-spotify", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { slug } = req.params;
      if (clearDuplicateSpotifyState[slug]?.running) {
        return res.status(409).json({ message: "Already running for this podcast" });
      }
      const { rows: podcastRows } = await pool.query(`SELECT spotify_url FROM podcast_directory WHERE slug = $1`, [slug]);
      if (podcastRows.length === 0) return res.status(404).json({ message: "Podcast not found" });
      const podcastSpotifyUrl = podcastRows[0].spotify_url;
      if (!podcastSpotifyUrl) return res.status(400).json({ message: "Podcast has no spotify_url set" });

      const { rows: episodes } = await pool.query(
        `SELECT id, spotify_episode_url FROM landing_page_recaps WHERE slug = $1 AND spotify_episode_url IS NOT NULL AND spotify_episode_url != ''`,
        [slug]
      );

      const state = { running: true, total: episodes.length, processed: 0, cleared: 0, complete: false };
      clearDuplicateSpotifyState[slug] = state;

      res.json({ started: true, total: episodes.length });

      (async () => {
        try {
          for (const ep of episodes) {
            const epUrl = (ep.spotify_episode_url || "").trim().replace(/\/+$/, "");
            const podUrl = podcastSpotifyUrl.trim().replace(/\/+$/, "");
            if (epUrl === podUrl) {
              await pool.query(`UPDATE landing_page_recaps SET spotify_episode_url = '' WHERE id = $1`, [ep.id]);
              state.cleared++;
            }
            state.processed++;
            await new Promise(r => setTimeout(r, 50));
          }
        } catch (err) {
          console.error("[CMS] Clear duplicate spotify error:", err);
        } finally {
          state.running = false;
          state.complete = true;
        }
      })();
    } catch (err: any) {
      console.error("[CMS] Clear duplicate spotify error:", err);
      res.status(500).json({ message: err?.message || "Failed to start clearing" });
    }
  });

  app.get("/api/admin/cms/podcasts/:slug/clear-duplicate-spotify/status", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    const { slug } = req.params;
    const state = clearDuplicateSpotifyState[slug];
    if (!state) return res.json({ running: false, total: 0, processed: 0, cleared: 0, complete: false });
    res.json(state);
  });


  app.get("/api/admin/cms/podcasts/:slug/episodes", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { slug } = req.params;
      const { search, sort, order, status } = req.query;
      let query = `SELECT id, slug, episode_slug, episode_title, publish_date, duration, artwork_url, status, published, created_at, tldl, tabloid_headline, tabloid_sub_headline, what_happened, key_insights FROM landing_page_recaps WHERE slug = $1`;
      const params: any[] = [slug];
      if (search) {
        params.push(`%${search}%`);
        query += ` AND (episode_title ILIKE $${params.length})`;
      }
      if (status && status !== "all") {
        if (status === "processing") {
          query += ` AND published = false AND (created_at IS NULL OR created_at > NOW() - INTERVAL '3 days')`;
        } else if (status === "published") {
          query += ` AND (published = true OR (published = false AND (created_at IS NOT NULL AND created_at <= NOW() - INTERVAL '3 days')))`;
        } else {
          params.push(status);
          query += ` AND status = $${params.length}`;
        }
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
            `SELECT transcript FROM episode_transcripts WHERE podcast_id = $1 AND ${SQL_NORMALIZE_TITLE('episode_title')} = ${SQL_NORMALIZE_TITLE('$2')} LIMIT 1`,
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
      try {
        const { rows: hostRows } = await pool.query(
          `SELECT name, bio, photo_url, twitter_handle, linkedin_url, website_url FROM podcast_hosts WHERE podcast_slug = $1 ORDER BY sort_order`,
          [podcastSlug]
        );
        podcastHosts = hostRows;
      } catch {}

      const isEmptyVal = (v: any) => !v || typeof v !== 'string' || !v.trim() || v.trim() === '[]' || v.trim() === 'null';
      const hostsValue = isEmptyVal(episode.hosts) ? podcastHosts.map((h: any) => h.name).join(", ") : episode.hosts;
      const spotifyValue = !isEmptyVal(episode.spotify_episode_url) ? episode.spotify_episode_url : "";

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
      const validStatuses = ["published", "processing", "needs_review", "hidden", "requested"];
      if (req.body.status && !validStatuses.includes(req.body.status)) {
        return res.status(400).json({ message: "Invalid status. Must be: published or processing" });
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

  app.post("/api/admin/cms/episodes/bulk-clear-spotify", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const invalidUrl = "https://open.spotify.com/show/3gG1m4g1g1g1g1g1g1g1g1";
      const { mode } = req.body;
      if (mode === "count") {
        const { rows } = await pool.query(
          `SELECT 
            COUNT(*) FILTER (WHERE spotify_episode_url = $1) as invalid_count,
            COUNT(*) as total_count
           FROM landing_page_recaps`,
          [invalidUrl]
        );
        return res.json({ count: parseInt(rows[0].invalid_count, 10), total: parseInt(rows[0].total_count, 10) });
      }
      if (mode === "clear") {
        const result = await pool.query(
          `UPDATE landing_page_recaps SET spotify_episode_url = NULL WHERE spotify_episode_url = $1`,
          [invalidUrl]
        );
        return res.json({ cleared: result.rowCount });
      }
      return res.status(400).json({ message: "Invalid mode. Use 'count' or 'clear'." });
    } catch (err: any) {
      console.error("[CMS] Bulk clear Spotify links error:", err);
      res.status(500).json({ message: err?.message || "Failed to bulk clear Spotify links" });
    }
  });

  const clearAllDuplicateSpotifyState = { running: false, total: 0, processed: 0, cleared: 0, complete: false, podcastsChecked: 0, totalPodcasts: 0 };

  app.post("/api/admin/cms/episodes/clear-all-duplicate-spotify", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { mode } = req.body;
      if (mode === "count") {
        const { rows } = await pool.query(`
          SELECT COUNT(*) as cnt FROM landing_page_recaps lpr
          JOIN podcast_directory pd ON pd.slug = lpr.slug
          WHERE pd.spotify_url IS NOT NULL AND pd.spotify_url != ''
            AND lpr.spotify_episode_url IS NOT NULL AND lpr.spotify_episode_url != ''
            AND RTRIM(lpr.spotify_episode_url, '/') = RTRIM(pd.spotify_url, '/')
        `);
        const { rows: totalRows } = await pool.query(`SELECT COUNT(*) as cnt FROM landing_page_recaps WHERE spotify_episode_url IS NOT NULL AND spotify_episode_url != ''`);
        return res.json({ count: parseInt(rows[0].cnt, 10), total: parseInt(totalRows[0].cnt, 10) });
      }
      if (mode === "clear") {
        if (clearAllDuplicateSpotifyState.running) {
          return res.status(409).json({ message: "Already running" });
        }
        const { rows: podcasts } = await pool.query(`SELECT slug, spotify_url FROM podcast_directory WHERE spotify_url IS NOT NULL AND spotify_url != ''`);
        const state = clearAllDuplicateSpotifyState;
        Object.assign(state, { running: true, total: 0, processed: 0, cleared: 0, complete: false, podcastsChecked: 0, totalPodcasts: podcasts.length });
        res.json({ started: true, totalPodcasts: podcasts.length });

        (async () => {
          try {
            for (const podcast of podcasts) {
              const podUrl = podcast.spotify_url.trim().replace(/\/+$/, "");
              const { rows: episodes } = await pool.query(
                `SELECT id, spotify_episode_url FROM landing_page_recaps WHERE slug = $1 AND spotify_episode_url IS NOT NULL AND spotify_episode_url != ''`,
                [podcast.slug]
              );
              state.total += episodes.length;
              for (const ep of episodes) {
                const epUrl = (ep.spotify_episode_url || "").trim().replace(/\/+$/, "");
                if (epUrl === podUrl) {
                  await pool.query(`UPDATE landing_page_recaps SET spotify_episode_url = '' WHERE id = $1`, [ep.id]);
                  state.cleared++;
                }
                state.processed++;
              }
              state.podcastsChecked++;
            }
          } catch (err) {
            console.error("[CMS] Clear all duplicate spotify error:", err);
          } finally {
            state.running = false;
            state.complete = true;
          }
        })();
        return;
      }
      return res.status(400).json({ message: "Invalid mode. Use 'count' or 'clear'." });
    } catch (err: any) {
      console.error("[CMS] Clear all duplicate spotify error:", err);
      res.status(500).json({ message: err?.message || "Failed" });
    }
  });

  app.get("/api/admin/cms/episodes/clear-all-duplicate-spotify/status", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    res.json(clearAllDuplicateSpotifyState);
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

  app.post("/api/admin/cms/episodes/:podcastSlug/:episodeSlug/generate-headlines", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    const { podcastSlug, episodeSlug } = req.params;
    try {
      const { rows } = await pool.query(
        `SELECT id, episode_title, podcast_name, what_happened, key_insights, tldl FROM landing_page_recaps WHERE slug = $1 AND episode_slug = $2 LIMIT 1`,
        [podcastSlug, episodeSlug]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Recap not found" });
      const recap = rows[0];
      if (!recap.what_happened) return res.status(400).json({ message: "Recap has no content to generate headlines from" });

      const { generateTabloidHeadline } = await import("./emailScheduler");
      const keyInsights = Array.isArray(recap.key_insights) ? recap.key_insights : [];
      const result = await generateTabloidHeadline(
        recap.episode_title, recap.podcast_name, recap.tldl || "", recap.what_happened, keyInsights
      );
      if (!result) return res.status(500).json({ message: "AI headline generation returned no result" });

      await pool.query(
        `UPDATE landing_page_recaps SET tabloid_headline = $1, tabloid_sub_headline = $2 WHERE id = $3`,
        [result.tabloidHeadline, result.tabloidSubHeadline, recap.id]
      );

      res.json({ success: true, tabloidHeadline: result.tabloidHeadline, tabloidSubHeadline: result.tabloidSubHeadline });
    } catch (err: any) {
      console.error("[CMS] Generate headlines error:", err);
      res.status(500).json({ message: err?.message || "Failed to generate headlines" });
    }
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
        if (status === "processing") {
          where += ` AND lpr.published = false AND (lpr.created_at IS NULL OR lpr.created_at > NOW() - INTERVAL '3 days')`;
        } else if (status === "published") {
          where += ` AND (lpr.published = true OR (lpr.published = false AND (lpr.created_at IS NOT NULL AND lpr.created_at <= NOW() - INTERVAL '3 days')))`;
        } else {
          params.push(status);
          where += ` AND lpr.status = $${params.length}`;
        }
      }
      if (search) {
        params.push(`%${search}%`);
        where += ` AND (lpr.episode_title ILIKE $${params.length} OR lpr.podcast_name ILIKE $${params.length})`;
      }
      const safeEnrichmentFields = EPISODE_ENRICHMENT_FIELDS.filter(f => f.key !== "transcript");
      const enrichmentCols = safeEnrichmentFields.map(f => `lpr.${f.key}`).join(', ');
      const transcriptSubquery = `(EXISTS(SELECT 1 FROM episode_transcripts et JOIN podcast_directory pd ON pd.itunes_id::text = et.podcast_id WHERE pd.slug = lpr.slug AND ${SQL_NORMALIZE_TITLE('et.episode_title')} = ${SQL_NORMALIZE_TITLE('lpr.episode_title')} AND et.transcript IS NOT NULL AND et.transcript != ''))::boolean AS has_transcript`;

      let orderBy = "lpr.publish_date DESC NULLS LAST";
      if (sort === "title") orderBy = `lpr.episode_title ${order === "desc" ? "DESC" : "ASC"}`;
      else if (sort === "date") orderBy = `lpr.publish_date ${order === "asc" ? "ASC" : "DESC"} NULLS LAST`;
      else if (sort === "popular") orderBy = `lpr.publish_date DESC NULLS LAST`;
      const sortByEnrichment = sort === "enrichment";
      const { rows: countRows } = await pool.query(`SELECT count(*)::int as total FROM landing_page_recaps lpr ${where}`, params);
      const total = countRows[0]?.total || 0;

      const enrichRow = (r: any) => {
        const enrichRecord = { ...r, transcript: r.has_transcript ? "yes" : null };
        return {
          id: r.id, slug: r.slug, podcast_name: r.podcast_name, episode_title: r.episode_title,
          episode_slug: r.episode_slug, publish_date: r.publish_date, duration: r.duration,
          status: r.status, published: r.published, created_at: r.created_at, artwork_url: r.artwork_url,
          enrichment_score: computeEnrichmentFromRecord(enrichRecord, EPISODE_ENRICHMENT_SCORE_FIELDS).score,
        };
      };

      if (sortByEnrichment) {
        const { rows: allRows } = await pool.query(
          `SELECT lpr.id, lpr.slug, lpr.podcast_name, lpr.episode_title, lpr.episode_slug, lpr.publish_date, lpr.duration, lpr.status, lpr.published, lpr.created_at, lpr.artwork_url,
           ${enrichmentCols}, ${transcriptSubquery}
           FROM landing_page_recaps lpr ${where} ORDER BY lpr.id DESC`,
          params
        );
        const enriched = allRows.map(enrichRow);
        enriched.sort((a: any, b: any) => order === "asc" ? a.enrichment_score - b.enrichment_score : b.enrichment_score - a.enrichment_score);
        res.json({ episodes: enriched.slice(offset, offset + limit), total });
      } else {
        params.push(limit);
        params.push(offset);
        const { rows } = await pool.query(
          `SELECT lpr.id, lpr.slug, lpr.podcast_name, lpr.episode_title, lpr.episode_slug, lpr.publish_date, lpr.duration, lpr.status, lpr.published, lpr.created_at, lpr.artwork_url,
           ${enrichmentCols}, ${transcriptSubquery}
           FROM landing_page_recaps lpr ${where} ORDER BY ${orderBy}, lpr.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
          params
        );
        res.json({ episodes: rows.map(enrichRow), total });
      }
    } catch (err: any) {
      console.error("[CMS] All episodes error:", err);
      res.status(500).json({ message: err?.message || "Failed to fetch episodes" });
    }
  });

  app.get("/api/admin/cms/all-episodes/completeness-stats", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { rows } = await pool.query(`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (
            WHERE tabloid_headline IS NOT NULL AND tabloid_headline != ''
              AND tabloid_sub_headline IS NOT NULL AND tabloid_sub_headline != ''
              AND key_insights IS NOT NULL AND cardinality(key_insights) > 0
              AND what_happened IS NOT NULL AND what_happened != ''
          )::int AS fully_enriched,
          count(*) FILTER (WHERE tabloid_headline IS NOT NULL AND tabloid_headline != '')::int AS with_headlines,
          count(*) FILTER (WHERE tabloid_sub_headline IS NOT NULL AND tabloid_sub_headline != '')::int AS with_sub_headlines,
          count(*) FILTER (WHERE key_insights IS NOT NULL AND cardinality(key_insights) > 0)::int AS with_takeaways,
          count(*) FILTER (WHERE what_happened IS NOT NULL AND what_happened != '')::int AS with_recaps
        FROM landing_page_recaps
      `);
      const total = rows[0]?.total || 0;
      const fullyEnriched = rows[0]?.fully_enriched || 0;
      const percentage = total > 0 ? Math.round((fullyEnriched / total) * 100) : 0;
      const withHeadlines = rows[0]?.with_headlines || 0;
      const withSubHeadlines = rows[0]?.with_sub_headlines || 0;
      const withTakeaways = rows[0]?.with_takeaways || 0;
      const withRecaps = rows[0]?.with_recaps || 0;
      res.json({ total, fullyEnriched, percentage, withHeadlines, withSubHeadlines, withTakeaways, withRecaps });
    } catch (err: any) {
      console.error("[CMS] Completeness stats error:", err);
      res.status(500).json({ message: err?.message || "Failed to fetch completeness stats" });
    }
  });

  app.get("/api/admin/cms/episodes/last-processed", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { rows } = await pool.query(`SELECT created_at FROM landing_page_recaps ORDER BY created_at DESC NULLS LAST LIMIT 1`);
      const lastCreatedAt = rows[0]?.created_at || null;
      res.json({ lastCreatedAt });
    } catch (err: any) {
      console.error("[CMS] Last processed error:", err);
      res.status(500).json({ message: err?.message || "Failed" });
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
                const spotifyUrl = "";
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


  app.post("/api/admin/bulk-download-transcripts", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { ITUNES_ID_TO_SLUG, SLUG_TO_ITUNES_ID } = await import("./podcastLandingMap");
      const { getEpisodeTranscript, getPodcastSeriesWithEpisodes, getTranscriptCreditsRemaining } = await import("./taddyClient");

      const { slugFilter, target: customTarget } = req.body || {};
      const TARGET = (customTarget && Number(customTarget) > 0) ? Number(customTarget) : 25;

      if (!process.env.TADDY_USER_ID || !process.env.TADDY_API_KEY) {
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

      const creditsRemaining = await getTranscriptCreditsRemaining() ?? "unknown";
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

          let taddySeries = await getPodcastSeriesWithEpisodes({ itunesId: numericItunesId }, epLimit);

          if (taddySeries?.uuid && (!taddySeries.episodes || taddySeries.episodes.length === 0)) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const retrySeries = await getPodcastSeriesWithEpisodes({ uuid: taddySeries.uuid }, epLimit);
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

      const creditsAfter = await getTranscriptCreditsRemaining() ?? "unknown";

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
                    `SELECT transcript FROM episode_transcripts WHERE podcast_id = $1 AND ${SQL_NORMALIZE_TITLE('episode_title')} = ${SQL_NORMALIZE_TITLE('$2')} LIMIT 1`,
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
                tldl: "",
                whatHappened: recap.whatHappened,
                keyInsights: recap.keyInsights,
                quote: "",
                quoteAttribution: "",
                appleEpisodeUrl: appleUrl || null,
                audioUrl: ep.episodeUrl || null,
                keyTopics: [],
                topicContexts: null,
                topQuestions: null,
                guests: recap.guests ? JSON.stringify(recap.guests) : "[]",
                sponsors: "[]",
                resources: recap.resources ? JSON.stringify(recap.resources) : "[]",
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

  app.post("/api/admin/users/bulk-delete", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: "userIds must be a non-empty array" });
    }
    const ids = userIds
      .map((id: unknown) => typeof id === "number" ? id : parseInt(String(id), 10))
      .filter((id: number) => !isNaN(id));
    if (ids.length === 0) {
      return res.status(400).json({ message: "No valid user IDs provided" });
    }
    try {
      let deleted = 0;
      const failures: number[] = [];
      for (const id of ids) {
        try {
          await storage.deleteUser(id);
          deleted++;
        } catch (err) {
          console.error(`Failed to delete user ${id}:`, err);
          failures.push(id);
        }
      }
      res.json({ message: `${deleted} user(s) deleted`, deleted, total: ids.length, failures });
    } catch (err) {
      console.error("Bulk delete failed:", err);
      res.status(500).json({ message: "Bulk delete failed" });
    }
  });

  app.post("/api/admin/users/bulk-status", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const { userIds, emailVerified } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: "userIds must be a non-empty array" });
    }
    if (typeof emailVerified !== "boolean") {
      return res.status(400).json({ message: "emailVerified must be a boolean" });
    }
    const ids = userIds
      .map((id: unknown) => typeof id === "number" ? id : parseInt(String(id), 10))
      .filter((id: number) => !isNaN(id));
    if (ids.length === 0) {
      return res.status(400).json({ message: "No valid user IDs provided" });
    }
    try {
      const placeholders = ids.map((_: number, i: number) => `$${i + 2}`).join(", ");
      const result = await pool.query(
        `UPDATE users SET email_verified = $1 WHERE id IN (${placeholders})`,
        [emailVerified, ...ids]
      );
      const updated = result.rowCount ?? ids.length;
      res.json({ message: `${updated} user(s) updated`, updated });
    } catch (err) {
      console.error("Bulk status update failed:", err);
      res.status(500).json({ message: "Bulk status update failed" });
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

  app.get("/api/admin/users/:id/profile", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    try {
      const userResult = await pool.query(`SELECT * FROM users WHERE id = $1`, [userId]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      const row = userResult.rows[0];
      const user = {
        id: row.id,
        email: row.email,
        podcasts: row.podcasts || [],
        industries: row.industries || [],
        interests: row.interests || [],
        roles: row.roles || [],
        topicFrequencies: row.topic_frequencies || {},
        deliveryTime: row.delivery_time,
        deliveryTimezone: row.delivery_timezone,
        stripeCustomerId: row.stripe_customer_id,
        stripeSubscriptionId: row.stripe_subscription_id,
        plan: row.plan,
        vacationUntil: row.vacation_until,
        emailVerified: row.email_verified,
        signupSource: row.signup_source,
        signupSourceDetail: row.signup_source_detail,
        utmSource: row.utm_source,
        utmMedium: row.utm_medium,
        utmCampaign: row.utm_campaign,
        utmContent: row.utm_content,
        utmTerm: row.utm_term,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        deviceType: row.device_type,
        googleId: row.google_id,
        onboardingCompleted: row.onboarding_completed,
        displayName: row.display_name,
        birthday: row.birthday,
        gender: row.gender,
        location: row.location,
        language: row.language,
        referralCode: row.referral_code,
        referredBy: row.referred_by,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at,
      };

      const emailStatsResult = await pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE status = 'sent') as total_sent,
          COUNT(*) FILTER (WHERE status = 'sent' AND email_opened_at IS NOT NULL) as total_opened,
          COUNT(*) FILTER (WHERE status = 'sent' AND first_clicked_at IS NOT NULL) as total_clicked,
          MAX(sent_at) as last_email_date
        FROM pending_emails WHERE user_id = $1`,
        [userId]
      );
      const emailStats = emailStatsResult.rows[0] || {};

      const recentEmailsResult = await pool.query(
        `SELECT id, recipient_email, podcasts, recap_date, subject, status, sent_at, email_opened_at, first_clicked_at, created_at
        FROM pending_emails WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [userId]
      );
      const recentEmails = recentEmailsResult.rows.map((r: any) => ({
        id: r.id,
        recipientEmail: r.recipient_email,
        podcasts: r.podcasts || [],
        recapDate: r.recap_date,
        subject: r.subject,
        status: r.status,
        sentAt: r.sent_at,
        emailOpenedAt: r.email_opened_at,
        firstClickedAt: r.first_clicked_at,
        createdAt: r.created_at,
      }));

      const emailClicksResult = await pool.query(
        `SELECT ec.id, ec.email_id, ec.url, ec.clicked_at
        FROM email_clicks ec
        JOIN pending_emails pe ON pe.id = ec.email_id
        WHERE pe.user_id = $1
        ORDER BY ec.clicked_at DESC LIMIT 100`,
        [userId]
      );
      const clicks = emailClicksResult.rows.map((r: any) => ({
        id: r.id,
        emailId: r.email_id,
        url: r.url,
        clickedAt: r.clicked_at,
      }));

      const bookmarksResult = await pool.query(
        `SELECT id, episode_slug, podcast_slug, created_at FROM bookmarks WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
      );
      const userBookmarks = bookmarksResult.rows.map((r: any) => ({
        id: r.id,
        episodeSlug: r.episode_slug,
        podcastSlug: r.podcast_slug,
        createdAt: r.created_at,
      }));

      const referralsMadeResult = await pool.query(
        `SELECT r.id, r.referred_user_id, r.status, r.created_at, r.verified_at, u.email as referred_email
        FROM referrals r LEFT JOIN users u ON u.id = r.referred_user_id
        WHERE r.referrer_id = $1 ORDER BY r.created_at DESC`,
        [userId]
      );
      const referralsMade = referralsMadeResult.rows.map((r: any) => ({
        id: r.id,
        referredUserId: r.referred_user_id,
        referredEmail: r.referred_email,
        status: r.status,
        createdAt: r.created_at,
        verifiedAt: r.verified_at,
      }));

      let referredByUser = null;
      if (user.referredBy) {
        const refByResult = await pool.query(`SELECT id, email, display_name FROM users WHERE id = $1`, [user.referredBy]);
        if (refByResult.rows.length > 0) {
          const rb = refByResult.rows[0];
          referredByUser = { id: rb.id, email: rb.email, displayName: rb.display_name };
        }
      }

      const adminCheckResult = await pool.query(
        `SELECT id, role FROM admin_users WHERE email = $1 LIMIT 1`,
        [user.email]
      );
      const adminInfo = adminCheckResult.rows.length > 0
        ? { isAdmin: true, role: adminCheckResult.rows[0].role }
        : { isAdmin: false, role: null };

      res.json({
        user,
        adminInfo,
        emailStats: {
          totalSent: parseInt(emailStats.total_sent || "0"),
          totalOpened: parseInt(emailStats.total_opened || "0"),
          totalClicked: parseInt(emailStats.total_clicked || "0"),
          lastEmailDate: emailStats.last_email_date,
        },
        recentEmails,
        emailClicks: clicks,
        bookmarks: userBookmarks,
        referralsMade,
        referredByUser,
      });
    } catch (err) {
      console.error("Failed to fetch user profile:", err);
      res.status(500).json({ message: "Failed to fetch user profile" });
    }
  });

  app.post("/api/admin/users/:id/admin-toggle", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    try {
      const userResult = await pool.query(`SELECT email, display_name FROM users WHERE id = $1`, [userId]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      const email = userResult.rows[0].email?.toLowerCase();
      const displayName = userResult.rows[0].display_name || email?.split("@")[0] || "";
      if (!email || !email.endsWith("@podrise.com")) {
        return res.status(400).json({ message: "Only @podrise.com emails can be granted admin access" });
      }
      const { grant } = req.body;
      if (grant) {
        await pool.query(
          `INSERT INTO admin_users (email, name, role) VALUES ($1, $2, 'admin') ON CONFLICT (email) DO NOTHING`,
          [email, displayName]
        );
        res.json({ isAdmin: true, role: "admin" });
      } else {
        if (email === "derek@podrise.com") {
          return res.status(400).json({ message: "Cannot revoke owner admin access" });
        }
        await pool.query(`DELETE FROM admin_users WHERE email = $1`, [email]);
        res.json({ isAdmin: false, role: null });
      }
    } catch (err: any) {
      console.error("Failed to toggle admin status:", err);
      res.status(500).json({ message: "Failed to toggle admin status" });
    }
  });

  app.patch("/api/admin/users/:id/profile", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    const profileUpdateSchema = z.object({
      displayName: z.string().nullable().optional(),
      birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").nullable().optional(),
      gender: z.string().nullable().optional(),
      location: z.string().nullable().optional(),
      language: z.string().nullable().optional(),
      plan: z.enum(["free", "pro"]).optional(),
      deliveryTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM").optional(),
      deliveryTimezone: z.string().min(1).optional(),
      vacationUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").nullable().optional(),
      emailVerified: z.boolean().optional(),
      onboardingCompleted: z.boolean().optional(),
    }).strict();
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid fields", errors: parsed.error.flatten() });
    }
    const updates: Record<string, any> = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) {
        updates[key] = value;
      }
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }
    try {
      const existingUser = await storage.getUserById(userId);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }
      const updated = await storage.updateUser(userId, updates);
      res.json(updated);
    } catch (err) {
      console.error("Failed to update user profile:", err);
      res.status(500).json({ message: "Failed to update user profile" });
    }
  });

  app.post("/api/admin/impersonate", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    const parsed = z.object({ userId: z.number() }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "userId is required" });
    }
    const user = await storage.getUserById(parsed.data.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (req.session.impersonatingUserId) {
      req.session.userId = req.session.originalUserId;
      delete req.session.impersonatingUserId;
      delete req.session.originalUserId;
    }
    req.session.originalUserId = req.session.userId;
    req.session.impersonatingUserId = parsed.data.userId;
    req.session.userId = parsed.data.userId;
    req.session.save((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to save session while impersonating user" });
      }
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
    req.session.save((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to save session while stopping impersonation" });
      }
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

      const { rows: existingRows } = await pool.query(
        `SELECT id, status, has_landing_page FROM podcast_directory WHERE itunes_id = $1 LIMIT 1`, [trimmedId]
      );
      const isNewPodcast = existingRows.length === 0;
      const existingStatus = existingRows[0]?.status;
      const existingHasLandingPage = existingRows[0]?.has_landing_page;

      if (isNewPodcast) {
        if (!("hasLandingPage" in data)) data.hasLandingPage = true;
        if (!("status" in data)) data.status = "published";
      } else if (existingStatus === "requested") {
        if (!("hasLandingPage" in data) && !existingHasLandingPage) data.hasLandingPage = true;
        if (!("status" in data)) data.status = "published";
      }

      const entry = await storage.upsertPodcastDirectoryEntry(data);

      if ((isNewPodcast || existingStatus === "requested") && entry.slug) {
        const podcastSlug = entry.slug;
        const podcastName = entry.name || trimmedName;
        console.log(`[CMS] ${isNewPodcast ? "New podcast added" : "Previously-requested podcast approved"}: "${podcastName}" (slug: ${podcastSlug}). Starting background metadata refresh...`);
        refreshPodcastMetadataBySlug(podcastSlug)
          .then((result) => {
            console.log(`[CMS] Background metadata refresh completed for "${podcastName}" (slug: ${podcastSlug}): ${result.totalUpdated} fields updated [${result.fieldsUpdated.join(", ")}]${result.errors.length > 0 ? ` | Errors: ${result.errors.join("; ")}` : ""}`);
          })
          .catch((err) => {
            console.error(`[CMS] Background metadata refresh failed for "${podcastName}" (slug: ${podcastSlug}):`, err?.message || err);
          });
      }

      res.json(entry);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to save podcast directory entry" });
    }
  });

  app.post("/api/admin/podcast-directory/lookup-itunes", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const { urls } = req.body;
      if (!Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ message: "urls array is required" });
      }
      if (urls.length > 50) {
        return res.status(400).json({ message: "Maximum 50 URLs at a time" });
      }
      const itunesIdSet = new Set<string>();
      const errors: string[] = [];
      for (const url of urls) {
        const trimmed = String(url).trim();
        const idMatch = trimmed.match(/(?:id)(\d+)/);
        if (idMatch) {
          itunesIdSet.add(idMatch[1]);
        } else if (/^\d+$/.test(trimmed)) {
          itunesIdSet.add(trimmed);
        } else {
          errors.push(`Could not extract iTunes ID from: ${trimmed}`);
        }
      }
      const itunesIds = Array.from(itunesIdSet);
      if (itunesIds.length === 0) {
        return res.status(400).json({ message: "No valid iTunes IDs found", errors });
      }
      const results: any[] = [];
      for (let i = 0; i < itunesIds.length; i += 50) {
        const batch = itunesIds.slice(i, i + 50);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const resp = await fetch(`https://itunes.apple.com/lookup?id=${batch.join(",")}&entity=podcast`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!resp.ok) {
          errors.push(`iTunes API returned ${resp.status} for batch lookup`);
          continue;
        }
        const data = await resp.json();
        for (const r of (data.results || [])) {
          if (r.wrapperType !== "collection" && r.kind !== "podcast") continue;
          const art = (r.artworkUrl600 || r.artworkUrl100 || "").replace(/\d+x\d+bb/, "1200x1200bb");
          const slug = (r.collectionName || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          const existing = await pool.query(
            `SELECT id, slug, name, itunes_id FROM podcast_directory WHERE itunes_id = $1 OR slug = $2 LIMIT 1`,
            [String(r.collectionId), slug]
          );
          results.push({
            itunesId: String(r.collectionId),
            name: r.collectionName || "",
            slug,
            artworkUrl: art,
            category: r.primaryGenreName || "",
            feedUrl: r.feedUrl || "",
            appleUrl: r.collectionViewUrl || "",
            totalEpisodes: r.trackCount || null,
            alreadyExists: existing.rows.length > 0,
            existingEntry: existing.rows[0] || null,
          });
        }
      }
      const foundIds = results.map(r => r.itunesId);
      for (const id of itunesIds) {
        if (!foundIds.includes(id)) {
          errors.push(`iTunes ID ${id} not found`);
        }
      }
      res.json({ results, errors });
    } catch (err: any) {
      res.status(500).json({ message: "iTunes lookup failed", error: err.message });
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

  app.post("/api/admin/cms/podcasts/bulk-delete", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { slugs } = req.body;
      if (!Array.isArray(slugs) || slugs.length === 0) {
        return res.status(400).json({ message: "No slugs provided" });
      }
      if (slugs.length > 100) {
        return res.status(400).json({ message: "Maximum 100 podcasts at a time" });
      }
      const { rows: existing } = await pool.query(
        `SELECT slug, name, is_protected FROM podcast_directory WHERE slug = ANY($1)`, [slugs]
      );
      if (existing.length === 0) {
        return res.status(404).json({ message: "No matching podcasts found" });
      }
      const protectedOnes = existing.filter((r: any) => r.is_protected);
      const deletable = existing.filter((r: any) => !r.is_protected);
      if (deletable.length === 0) {
        const protectedNames = protectedOnes.map((r: any) => r.name).join(", ");
        return res.status(403).json({ message: `All selected podcasts are protected and cannot be deleted: ${protectedNames}` });
      }
      const foundSlugs = deletable.map((r: any) => r.slug);
      const safeDelete = async (sql: string, params: any[]) => {
        try { await pool.query(sql, params); } catch (e: any) { }
      };
      await safeDelete(`DELETE FROM bookmarks WHERE podcast_slug = ANY($1)`, [foundSlugs]);
      await safeDelete(`DELETE FROM podcast_hosts WHERE podcast_slug = ANY($1)`, [foundSlugs]);
      await safeDelete(`DELETE FROM podcaster_claims WHERE podcast_slug = ANY($1)`, [foundSlugs]);
      await safeDelete(`DELETE FROM episode_quotes WHERE podcast_slug = ANY($1)`, [foundSlugs]);
      await safeDelete(`DELETE FROM transcript_segments WHERE podcast_slug = ANY($1)`, [foundSlugs]);
      await safeDelete(`DELETE FROM landing_page_recaps WHERE slug = ANY($1)`, [foundSlugs]);
      await safeDelete(`DELETE FROM episode_transcripts WHERE podcast_id = ANY($1)`, [foundSlugs]);
      await safeDelete(`DELETE FROM transcript_logs WHERE podcast_id = ANY($1)`, [foundSlugs]);
      await safeDelete(`DELETE FROM recap_entity_mentions WHERE podcast_slug = ANY($1)`, [foundSlugs]);
      await safeDelete(`DELETE FROM recaps WHERE podcast_slug = ANY($1)`, [foundSlugs]);
      await safeDelete(`DELETE FROM episodes WHERE podcast_slug = ANY($1)`, [foundSlugs]);
      await safeDelete(`DELETE FROM feed_ads WHERE podcast_slug = ANY($1)`, [foundSlugs]);
      await safeDelete(`UPDATE rss_feeds SET podcast_slugs = ARRAY(SELECT unnest(podcast_slugs) EXCEPT SELECT unnest($1::text[])) WHERE podcast_slugs && $1`, [foundSlugs]);
      await pool.query(`DELETE FROM podcast_directory WHERE slug = ANY($1) AND (is_protected IS NOT TRUE)`, [foundSlugs]);
      const names = deletable.map((r: any) => r.name).join(", ");
      console.log(`[CMS] Admin bulk-deleted ${foundSlugs.length} podcasts: ${names}`);
      const result: any = { deleted: foundSlugs.length, names: deletable.map((r: any) => r.name) };
      if (protectedOnes.length > 0) {
        result.skippedProtected = protectedOnes.map((r: any) => r.name);
        console.log(`[CMS] Skipped ${protectedOnes.length} protected podcasts: ${protectedOnes.map((r: any) => r.name).join(", ")}`);
      }
      res.json(result);
    } catch (err: any) {
      console.error("[CMS] Bulk delete error:", err);
      res.status(500).json({ message: err?.message || "Failed to delete podcasts" });
    }
  });

  app.post("/api/admin/cms/podcasts/bulk-update", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { slugs, status } = req.body;
      if (!Array.isArray(slugs) || slugs.length === 0) {
        return res.status(400).json({ message: "No slugs provided" });
      }
      if (slugs.length > 100) {
        return res.status(400).json({ message: "Maximum 100 podcasts at a time" });
      }
      const validStatuses = ["published", "hidden", "needs_review", "requested"];
      if (status !== undefined && !validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }
      if (status === undefined) {
        return res.status(400).json({ message: "No fields to update" });
      }

      const setClauses: string[] = [];
      const params: any[] = [slugs];
      if (status !== undefined) {
        params.push(status);
        setClauses.push(`status = $${params.length}`);
      }
      setClauses.push(`updated_at = NOW()`);

      const { rowCount } = await pool.query(
        `UPDATE podcast_directory SET ${setClauses.join(", ")} WHERE slug = ANY($1)`,
        params
      );
      console.log(`[CMS] Admin bulk-updated ${rowCount} podcasts`);
      res.json({ updated: rowCount });
    } catch (err: any) {
      console.error("[CMS] Bulk update error:", err);
      res.status(500).json({ message: err?.message || "Failed to update podcasts" });
    }
  });

  app.post("/api/admin/cms/podcasts/toggle-protection", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { slugs, isProtected } = req.body;
      if (!Array.isArray(slugs) || slugs.length === 0) {
        return res.status(400).json({ message: "No slugs provided" });
      }
      if (typeof isProtected !== "boolean") {
        return res.status(400).json({ message: "isProtected must be a boolean" });
      }
      const { rowCount } = await pool.query(
        `UPDATE podcast_directory SET is_protected = $2, updated_at = NOW() WHERE slug = ANY($1)`,
        [slugs, isProtected]
      );
      const action = isProtected ? "protected" : "unprotected";
      console.log(`[CMS] Admin ${action} ${rowCount} podcasts: ${slugs.join(", ")}`);
      res.json({ updated: rowCount, isProtected });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to toggle protection" });
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

  app.get("/api/admin/rss-preview", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authenticated as admin" });
    }
    try {
      const recaps = await storage.getRecentRecapsForRss(null, 1);
      if (recaps.length === 0) {
        return res.status(404).json({ message: "No recaps available for preview" });
      }
      const recap = recaps[0];
      const DOMAIN = "https://podrise.com";

      const fullXml = buildRssXml(
        [recap],
        "PodRise - All Podcast Recaps",
        "AI-generated recaps of the latest episodes from top podcasts, delivered daily.",
        `${DOMAIN}/rss/all`
      );

      const itemMatch = fullXml.match(/<item>[\s\S]*?<\/item>/);
      const itemXml = itemMatch ? itemMatch[0] : "";

      const decodeXmlEntities = (str: string): string => {
        return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
      };

      const extractTag = (xml: string, tag: string, decode = false): string => {
        const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
        const val = m ? m[1] : "";
        return decode ? decodeXmlEntities(val) : val;
      };

      const title = extractTag(itemXml, "title", true);
      const link = extractTag(itemXml, "link");
      const pubDate = extractTag(itemXml, "pubDate");
      const creator = extractTag(itemXml, "dc:creator", true);
      const category = extractTag(itemXml, "category", true);
      const description = extractTag(itemXml, "description", true);

      const contentMatch = itemXml.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
      const contentHtml = contentMatch ? contentMatch[1] : "";

      const enclosureMatch = itemXml.match(/<enclosure\s+url="([^"]*?)"/);
      const artworkUrl = enclosureMatch ? enclosureMatch[1] : null;

      res.json({
        title,
        description,
        contentHtml,
        link,
        pubDate,
        creator,
        category,
        artworkUrl,
        itemXml,
      });
    } catch (err) {
      console.error("RSS preview error:", err);
      res.status(500).json({ message: "Failed to generate RSS preview" });
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

        const spotifyEpisodeUrl = "";
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
          tldl: "",
          whatHappened: recap.whatHappened,
          keyInsights: recap.keyInsights,
          quote: "",
          quoteAttribution: "",
          keyTopics: [],
          topicContexts: null,
          topQuestions: null,
          audioUrl: t.audio_url || "",
          sponsors: "[]",
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
        });

        try {
          const { validateAndEnrichRecap } = await import("./recapValidator");
          await validateAndEnrichRecap(
            newRecapId, podcastSlug, upsertedRecap.episodeSlug, podcastName,
            epTitle, itunesId, t.transcript || null, hosts || null
          );
        } catch (valErr: any) {
          console.warn(`[Admin] Recap validation failed for "${epTitle?.slice(0, 50)}":`, valErr);
        }

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


  app.post("/api/admin/bulk-sync-recaps", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated" });
    const { recaps, quotes } = req.body;
    if (!recaps || !Array.isArray(recaps)) return res.status(400).json({ message: "recaps array required" });

    const client = await pool.connect();
    let inserted = 0, skipped = 0, quotesInserted = 0;
    try {
      for (const r of recaps) {
        try {
          const bulkSpotifyUrl = r.spotify_episode_url || "";
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
          to: "derek@podrise.com",
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
          `SELECT transcript FROM episode_transcripts WHERE podcast_id = $1 AND ${SQL_NORMALIZE_TITLE('episode_title')} = ${SQL_NORMALIZE_TITLE('$2')} LIMIT 1`,
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

      try {
        const chatUserId = req.session?.userId || null;
        await pool.query(
          `INSERT INTO feature_events (user_id, feature, metadata) VALUES ($1, 'ai_chat', $2)`,
          [chatUserId, JSON.stringify({ episodeSlug, podcastSlug })]
        );
      } catch (feErr) {
        console.error("[EpisodeChat] Failed to log feature event:", feErr);
      }
    } catch (err) {
      console.error("[EpisodeChat] Error:", err);
      res.status(500).json({ error: "Failed to generate response" });
    }
  });

  app.post("/api/feature-events", async (req, res) => {
    try {
      const feUserId = req.session?.userId || null;
      if (!feUserId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { feature, metadata } = req.body;
      if (!feature || typeof feature !== "string") {
        return res.status(400).json({ error: "Missing feature" });
      }
      const allowed = ["ai_chat", "episode_link", "spotify_import"];
      if (!allowed.includes(feature)) {
        return res.status(400).json({ error: "Invalid feature" });
      }
      await pool.query(
        `INSERT INTO feature_events (user_id, feature, metadata) VALUES ($1, $2, $3)`,
        [feUserId, feature, JSON.stringify(metadata || {})]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error("[FeatureEvents] Error:", err);
      res.status(500).json({ error: "Failed to record event" });
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
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = (page - 1) * limit;
      const sortBy = (req.query.sort as string || "recent").trim();

      const bookOrderBy = sortBy === "alphabetical" ? "book_title ASC" : "created_at DESC NULLS LAST";
      const queueFilter = (req.query.filter as string || "").trim();

      let QUEUE_FILTER = `cover_approved IS NULL
           AND book_key NOT IN (SELECT book_key FROM book_enrichments WHERE cover_approved = true)
           AND slug NOT IN (SELECT slug FROM book_enrichments WHERE cover_approved = true)
           AND (NULLIF(UPPER(REGEXP_REPLACE(isbn, '[^0-9X]', '', 'gi')), '') IS NULL
                OR UPPER(REGEXP_REPLACE(isbn, '[^0-9X]', '', 'gi')) NOT IN (
                  SELECT UPPER(REGEXP_REPLACE(isbn, '[^0-9X]', '', 'gi')) FROM book_enrichments
                  WHERE cover_approved = true AND NULLIF(UPPER(REGEXP_REPLACE(isbn, '[^0-9X]', '', 'gi')), '') IS NOT NULL))`;
      if (queueFilter === "no_isbn") QUEUE_FILTER += ` AND (isbn IS NULL OR TRIM(isbn) = '')`;
      if (queueFilter === "no_google_id") QUEUE_FILTER += ` AND (google_books_id IS NULL OR TRIM(google_books_id) = '')`;
      if (queueFilter === "no_isbn_or_google_id") QUEUE_FILTER += ` AND (isbn IS NULL OR TRIM(isbn) = '') AND (google_books_id IS NULL OR TRIM(google_books_id) = '')`;

      const { rows: bookRows } = await pool.query(
        `SELECT id, 'book' as source_type, book_title as name, author as company, description,
                amazon_url as url, CASE WHEN has_cover THEN '/books/' || slug || '.jpg' ELSE NULL END as image_url,
                NULL as context, NULL as context_summary, 'book_mention' as mention_type,
                'book' as category, NULL as episode_title, NULL as episode_slug, NULL as podcast_slug,
                CASE WHEN cover_approved IS NULL THEN 'pending' WHEN cover_approved = true THEN 'approved' ELSE 'rejected' END as status,
                'pending' as image_status, created_at, isbn, google_books_id
         FROM book_enrichments WHERE ${QUEUE_FILTER}
         ORDER BY ${bookOrderBy}
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const { rows: statsRows } = await pool.query(
        `SELECT
          (SELECT COUNT(*)::int FROM book_enrichments WHERE ${QUEUE_FILTER}) as books_pending,
          (SELECT COUNT(*)::int FROM book_enrichments WHERE cover_approved = true) as books_approved,
          (SELECT COUNT(*)::int FROM book_enrichments WHERE cover_approved = false) as books_rejected`
      );
      const s = statsRows[0];
      const stats = {
        pending: s.books_pending,
        approved: s.books_approved,
        rejected: s.books_rejected,
      };

      res.json({ items: bookRows, stats, page, limit });
    } catch (err: any) {
      console.error("[ShopQueue] Error:", err);
      res.status(500).json({ message: err?.message || "Failed to load queue" });
    }
  });

  app.post("/api/admin/shop/clean-queue-duplicates", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { rows: byKey } = await pool.query<{ id: number }>(
        `SELECT p.id FROM book_enrichments p
         INNER JOIN book_enrichments a ON p.book_key = a.book_key AND a.cover_approved = true
         WHERE p.cover_approved IS NULL`
      );
      const { rows: bySlug } = await pool.query<{ id: number }>(
        `SELECT p.id FROM book_enrichments p
         INNER JOIN book_enrichments a ON p.slug = a.slug AND a.cover_approved = true
         WHERE p.cover_approved IS NULL AND p.id NOT IN (SELECT unnest($1::int[]))`,
        [byKey.map(r => r.id)]
      );
      const { rows: byIsbn } = await pool.query<{ id: number }>(
        `SELECT p.id FROM book_enrichments p
         INNER JOIN book_enrichments a
           ON UPPER(REGEXP_REPLACE(p.isbn, '[^0-9X]', '', 'gi')) = UPPER(REGEXP_REPLACE(a.isbn, '[^0-9X]', '', 'gi'))
           AND a.cover_approved = true
           AND NULLIF(UPPER(REGEXP_REPLACE(a.isbn, '[^0-9X]', '', 'gi')), '') IS NOT NULL
         WHERE p.cover_approved IS NULL
           AND NULLIF(UPPER(REGEXP_REPLACE(p.isbn, '[^0-9X]', '', 'gi')), '') IS NOT NULL`
      );
      const { rows: withinQueue } = await pool.query<{ id: number }>(
        `SELECT id FROM book_enrichments
         WHERE cover_approved IS NULL
           AND id NOT IN (
             SELECT MIN(id) FROM book_enrichments WHERE cover_approved IS NULL GROUP BY book_key
           )`
      );

      const allIds = [...new Set([
        ...byKey.map(r => r.id),
        ...bySlug.map(r => r.id),
        ...byIsbn.map(r => r.id),
        ...withinQueue.map(r => r.id),
      ])];

      if (allIds.length > 0) {
        await pool.query(
          `UPDATE book_enrichments SET cover_approved = false, rejection_reason = 'duplicate', updated_at = NOW() WHERE id = ANY($1::int[])`,
          [allIds]
        );
        shopCache.invalidate();
      }

      res.json({ removed: allIds.length });
    } catch (err: any) {
      console.error("[CleanQueueDuplicates] Error:", err);
      res.status(500).json({ message: err?.message || "Failed to clean duplicates" });
    }
  });

  app.get("/api/admin/books/missing-buzz-count", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { getMissingBuzzCount } = await import("./enrichBooks");
      const count = await getMissingBuzzCount();
      res.json({ count });
    } catch (err: any) {
      console.error("[MissingBuzzCount] Error:", err);
      res.status(500).json({ message: err?.message || "Failed to get count" });
    }
  });

  app.post("/api/admin/books/generate-podcast-buzz", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const sendEvent = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      const { generateMissingBuzz, getMissingBuzzCount } = await import("./enrichBooks");
      const totalCount = await getMissingBuzzCount();
      sendEvent({ type: "start", total: totalCount });

      const result = await generateMissingBuzz((progress) => {
        sendEvent({ type: "progress", ...progress });
      });

      sendEvent({ type: "complete", processed: result.processed, errors: result.errors, total: result.total });
      res.end();
    } catch (err: any) {
      console.error("[GenerateBuzz] Error:", err);
      try { res.write(`data: ${JSON.stringify({ type: "error", message: err?.message || "Failed" })}\n\n`); res.end(); } catch {}
    }
  });

  app.post("/api/admin/shop/refresh-queue-images", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const sendEvent = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      const { rows } = await pool.query(
        `SELECT id, slug, google_books_id, isbn, book_title, author, cover_tried_sources
         FROM book_enrichments
         WHERE cover_approved IS NULL AND slug IS NOT NULL
         ORDER BY book_title`
      );

      sendEvent({ type: "start", total: rows.length });

      const COVERS_DIR = (await import("path")).resolve("public/books");
      const fs = await import("fs");
      const DELAY_MS = 400;
      const MIN_WIDTH = 200;

      function isPlaceholder(buf: Buffer): boolean {
        if (buf.length < 1000) return true;
        const isPng = buf[0] === 0x89 && buf[1] === 0x50;
        if (isPng && (buf.length === 15567 || buf.length === 1269)) return true;
        return false;
      }

      function getWidth(buf: Buffer): number {
        if (buf[0] === 0xff && buf[1] === 0xd8) {
          let i = 2;
          while (i < buf.length - 8) {
            if (buf[i] !== 0xff) return 0;
            const marker = buf[i + 1];
            if (marker === 0xc0 || marker === 0xc2) return buf.readUInt16BE(i + 7);
            i += 2 + buf.readUInt16BE(i + 2);
          }
          return 0;
        }
        if (buf[0] === 0x89 && buf[1] === 0x50 && buf.length >= 24) return buf.readUInt32BE(16);
        return 0;
      }

      function looksLikeDocument(buf: Buffer): boolean {
        let w: number, h: number;
        if (buf[0] === 0xff && buf[1] === 0xd8) {
          let i = 2;
          w = 0; h = 0;
          while (i < buf.length - 8) {
            if (buf[i] !== 0xff) break;
            const marker = buf[i + 1];
            if (marker === 0xc0 || marker === 0xc2) { h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break; }
            i += 2 + buf.readUInt16BE(i + 2);
          }
        } else if (buf[0] === 0x89 && buf[1] === 0x50 && buf.length >= 24) {
          w = buf.readUInt32BE(16); h = buf.readUInt32BE(20);
        } else { return false; }
        if (w === 0 || h === 0) return false;
        const ratio = w / h;
        return ratio > 0.75 || ratio < 0.45 || h > w * 2;
      }

      async function downloadFromGB(gbId: string): Promise<Buffer | null> {
        for (const zoom of [3, 2]) {
          try {
            const r = await fetch(`https://books.google.com/books/content?id=${gbId}&printsec=frontcover&img=1&zoom=${zoom}&source=gbs_api`);
            if (!r.ok) continue;
            const buf = Buffer.from(await r.arrayBuffer());
            if (isPlaceholder(buf) || looksLikeDocument(buf)) continue;
            if (getWidth(buf) >= MIN_WIDTH) return buf;
          } catch {}
        }
        return null;
      }

      async function findGBId(title: string, author?: string): Promise<string | null> {
        try {
          const q = encodeURIComponent(title + (author ? `+inauthor:${author}` : ""));
          const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`);
          if (!r.ok) return null;
          const data = await r.json();
          return data.items?.[0]?.id || null;
        } catch { return null; }
      }

      async function tryGoogleBooks(row: any): Promise<Buffer | null> {
        let gbId = row.google_books_id;
        if (gbId) { const buf = await downloadFromGB(gbId); if (buf) return buf; }
        if (row.isbn) {
          const isbnId = await findGBId(`isbn:${row.isbn}`);
          if (isbnId && isbnId !== gbId) { const buf = await downloadFromGB(isbnId); if (buf) return buf; }
        }
        if (!gbId) {
          const searchId = await findGBId(row.book_title, row.author);
          if (searchId) { const buf = await downloadFromGB(searchId); if (buf) return buf; }
        }
        return null;
      }

      if (!fs.existsSync(COVERS_DIR)) fs.mkdirSync(COVERS_DIR, { recursive: true });

      let updated = 0;
      let noImage = 0;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const buf = await tryGoogleBooks(row);
        if (i > 0) await new Promise(r => setTimeout(r, DELAY_MS));

        if (buf) {
          const filePath = (await import("path")).join(COVERS_DIR, `${row.slug}.jpg`);
          fs.writeFileSync(filePath, buf);
          const newTried = [...new Set([...(row.cover_tried_sources || []), "google_books"])];
          await pool.query(
            `UPDATE book_enrichments SET has_cover = true, cover_source = 'google_books', cover_tried_sources = $1, cover_quality_score = NULL WHERE id = $2`,
            [newTried, row.id]
          );
          updated++;
          sendEvent({ type: "progress", processed: i + 1, total: rows.length, updated, noImage, current: row.book_title, status: "updated" });
        } else {
          noImage++;
          sendEvent({ type: "progress", processed: i + 1, total: rows.length, updated, noImage, current: row.book_title, status: "no_image" });
        }
      }

      shopCache.invalidate();
      sendEvent({ type: "complete", total: rows.length, updated, noImage });
      res.end();
    } catch (err: any) {
      console.error("[RefreshQueueImages] Error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: err?.message || "Failed to refresh images" });
      } else {
        res.write(`data: ${JSON.stringify({ type: "error", message: err?.message || "Fatal error" })}\n\n`);
        res.end();
      }
    }
  });

  app.post("/api/admin/shop/recalculate-book-counts", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const result = await recalculateBookMentions(pool);
      res.json(result);
    } catch (err: any) {
      console.error("[RecalculateBookCounts] Error:", err);
      res.status(500).json({ message: err?.message || "Failed to recalculate book counts" });
    }
  });

  app.post("/api/admin/shop/requeue-no-cover", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { rowCount } = await pool.query(
        `UPDATE book_enrichments
         SET cover_approved = NULL, rejection_reason = NULL, updated_at = NOW()
         WHERE cover_approved = true AND (has_cover IS NULL OR has_cover = false)`
      );
      if (rowCount && rowCount > 0) shopCache.invalidate();
      res.json({ requeued: rowCount || 0 });
    } catch (err: any) {
      console.error("[RequeueNoCover] Error:", err);
      res.status(500).json({ message: err?.message || "Failed to requeue books" });
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
      const sortBy = (req.query.sort as string || "alphabetical").trim();

      const approvedFilter = (req.query.filter as string || "").trim();
      let bookWhere = "be.cover_approved = true";
      const bookVals: any[] = [];
      let paramIdx = 1;

      if (search) {
        bookVals.push(`%${search}%`);
        bookWhere += ` AND (LOWER(be.book_title) LIKE $${paramIdx} OR LOWER(be.author) LIKE $${paramIdx} OR LOWER(be.description) LIKE $${paramIdx})`;
        paramIdx++;
      }
      if (approvedFilter === "no_isbn") bookWhere += ` AND (be.isbn IS NULL OR TRIM(be.isbn) = '')`;
      if (approvedFilter === "no_google_id") bookWhere += ` AND (be.google_books_id IS NULL OR TRIM(be.google_books_id) = '')`;
      if (approvedFilter === "no_isbn_or_google_id") bookWhere += ` AND (be.isbn IS NULL OR TRIM(be.isbn) = '') AND (be.google_books_id IS NULL OR TRIM(be.google_books_id) = '')`;
      if (approvedFilter === "has_podcasts") bookWhere += ` AND COALESCE(eem_stats.podcast_count, 0) > 0`;
      if (approvedFilter === "no_podcasts") bookWhere += ` AND COALESCE(eem_stats.podcast_count, 0) = 0`;
      if (approvedFilter === "has_clicks") bookWhere += ` AND COALESCE(ac_stats.click_count, 0) > 0`;
      if (approvedFilter === "no_clicks") bookWhere += ` AND COALESCE(ac_stats.click_count, 0) = 0`;
      if (approvedFilter === "has_saves") bookWhere += ` AND COALESCE(bb_stats.save_count, 0) > 0`;
      if (approvedFilter === "no_saves") bookWhere += ` AND COALESCE(bb_stats.save_count, 0) = 0`;

      let bookOrderBy = "be.book_title ASC";
      if (sortBy === "recent") bookOrderBy = "be.created_at DESC NULLS LAST";
      if (sortBy === "podcasts_desc") bookOrderBy = "podcast_count DESC NULLS LAST, be.book_title ASC";
      if (sortBy === "podcasts_asc") bookOrderBy = "podcast_count ASC NULLS FIRST, be.book_title ASC";
      if (sortBy === "clicks_desc") bookOrderBy = "click_count DESC NULLS LAST, be.book_title ASC";
      if (sortBy === "clicks_asc") bookOrderBy = "click_count ASC NULLS FIRST, be.book_title ASC";
      if (sortBy === "saves_desc") bookOrderBy = "save_count DESC NULLS LAST, be.book_title ASC";
      if (sortBy === "saves_asc") bookOrderBy = "save_count ASC NULLS FIRST, be.book_title ASC";

      bookVals.push(limit, offset);
      const bLimitIdx = bookVals.length - 1;
      const bOffsetIdx = bookVals.length;

      const { rows: bookRows } = await pool.query(
        `SELECT be.id, 'book' as source_type, be.book_title as name, be.author as company, be.description,
                be.amazon_url as url, CASE WHEN be.has_cover THEN '/books/' || be.slug || '.jpg' ELSE NULL END as image_url,
                NULL as context, NULL as context_summary, 'book_mention' as mention_type,
                'book' as category, NULL as episode_title, NULL as podcast_slug,
                'approved' as status, 'approved' as image_status, NULL as approved_by, NULL as approved_at, be.created_at,
                be.isbn, be.google_books_id,
                COALESCE(eem_stats.podcast_count, 0)::int as podcast_count,
                COALESCE(ac_stats.click_count, 0)::int as click_count,
                COALESCE(bb_stats.save_count, 0)::int as save_count
         FROM book_enrichments be
         LEFT JOIN LATERAL (
           SELECT COUNT(DISTINCT eem.podcast_slug)::int as podcast_count
           FROM entity_episode_mentions eem
           WHERE eem.entity_type = 'book' AND eem.entity_slug = be.slug
         ) eem_stats ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int as click_count
           FROM affiliate_clicks ac
           WHERE ac.product_type = 'book' AND ac.product_id = be.id
         ) ac_stats ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int as save_count
           FROM book_bookmarks bb
           WHERE bb.book_slug = be.slug
         ) bb_stats ON true
         WHERE ${bookWhere}
         ORDER BY ${bookOrderBy}
         LIMIT $${bLimitIdx} OFFSET $${bOffsetIdx}`,
        bookVals
      );

      let countBookWhere = "be.cover_approved = true";
      const countBookVals = search ? [`%${search}%`] : [];
      if (search) {
        countBookWhere += ` AND (LOWER(be.book_title) LIKE $1 OR LOWER(be.author) LIKE $1 OR LOWER(be.description) LIKE $1)`;
      }
      if (approvedFilter === "no_isbn") countBookWhere += ` AND (be.isbn IS NULL OR TRIM(be.isbn) = '')`;
      if (approvedFilter === "no_google_id") countBookWhere += ` AND (be.google_books_id IS NULL OR TRIM(be.google_books_id) = '')`;
      if (approvedFilter === "no_isbn_or_google_id") countBookWhere += ` AND (be.isbn IS NULL OR TRIM(be.isbn) = '') AND (be.google_books_id IS NULL OR TRIM(be.google_books_id) = '')`;

      let countFrom = "book_enrichments be";
      if (["has_podcasts", "no_podcasts"].includes(approvedFilter)) {
        countFrom += ` LEFT JOIN LATERAL (SELECT COUNT(DISTINCT eem.podcast_slug)::int as podcast_count FROM entity_episode_mentions eem WHERE eem.entity_type = 'book' AND eem.entity_slug = be.slug) eem_stats ON true`;
        if (approvedFilter === "has_podcasts") countBookWhere += ` AND COALESCE(eem_stats.podcast_count, 0) > 0`;
        if (approvedFilter === "no_podcasts") countBookWhere += ` AND COALESCE(eem_stats.podcast_count, 0) = 0`;
      }
      if (["has_clicks", "no_clicks"].includes(approvedFilter)) {
        countFrom += ` LEFT JOIN LATERAL (SELECT COUNT(*)::int as click_count FROM affiliate_clicks ac WHERE ac.product_type = 'book' AND ac.product_id = be.id) ac_stats ON true`;
        if (approvedFilter === "has_clicks") countBookWhere += ` AND COALESCE(ac_stats.click_count, 0) > 0`;
        if (approvedFilter === "no_clicks") countBookWhere += ` AND COALESCE(ac_stats.click_count, 0) = 0`;
      }
      if (["has_saves", "no_saves"].includes(approvedFilter)) {
        countFrom += ` LEFT JOIN LATERAL (SELECT COUNT(*)::int as save_count FROM book_bookmarks bb WHERE bb.book_slug = be.slug) bb_stats ON true`;
        if (approvedFilter === "has_saves") countBookWhere += ` AND COALESCE(bb_stats.save_count, 0) > 0`;
        if (approvedFilter === "no_saves") countBookWhere += ` AND COALESCE(bb_stats.save_count, 0) = 0`;
      }

      const { rows: bcRows } = await pool.query(
        `SELECT COUNT(*)::int as cnt FROM ${countFrom} WHERE ${countBookWhere}`,
        countBookVals
      );
      const totalCount = bcRows[0]?.cnt || 0;

      res.json({ items: bookRows, total: totalCount, page, limit });
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

  app.post("/api/admin/shop/bulk-approve", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "No ids provided" });
      const numIds = ids.map((id: any) => parseInt(id, 10)).filter((id: number) => id > 0);
      if (numIds.length === 0) return res.status(400).json({ message: "No valid ids" });
      const result = await pool.query(
        `UPDATE book_enrichments SET cover_approved = true, updated_at = NOW() WHERE id = ANY($1::int[]) AND cover_approved IS NULL RETURNING id`,
        [numIds]
      );
      const approvedCount = result.rowCount || 0;
      shopCache.invalidate();
      res.json({ message: `Approved ${approvedCount} books`, approved: approvedCount });
    } catch (err: any) {
      console.error("[BulkApprove] Error:", err);
      res.status(500).json({ message: "Failed to bulk approve" });
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

  app.get("/api/admin/shop/book/:id/full-detail", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const numId = parseInt(req.params.id, 10);
      if (!numId) return res.status(400).json({ message: "Invalid id" });

      const { rows } = await pool.query(
        `SELECT id, book_key, book_title, author, description, amazon_url, slug, has_cover, cover_approved,
                publisher, publish_year, rating, isbn, topics, categories, created_at, updated_at,
                subtitle, isbn_10, isbn_13, google_books_id, asin, page_count, language,
                ol_work_key, ol_subjects, ol_languages, ol_edition_count, ol_ebook_count,
                ol_cover_id, ol_ratings_average, ol_ratings_count, ol_want_to_read,
                ol_currently_reading, ol_already_read, ol_first_publish_year, ol_publishers,
                ol_number_of_pages, ol_first_sentence, ol_subtitle, ol_author_names,
                ol_id_amazon, ol_id_goodreads, ol_has_fulltext, ol_all_isbns, ol_publish_dates,
                google_description, google_preview_link, google_info_link,
                maturity_rating, print_type, published_date,
                gb_saleability, gb_is_ebook, gb_list_price, gb_price_currency,
                gb_retail_price, gb_buy_link, gb_viewability, gb_embeddable,
                gb_public_domain, gb_text_to_speech, gb_epub_available, gb_pdf_available,
                gb_web_reader_link, gb_image_links, gb_reading_modes,
                rating_count, canonical_volume_link, content_version, dimensions, printed_page_count
         FROM book_enrichments WHERE id = $1`,
        [numId]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Book not found" });
      const enrichment = rows[0];
      const bookKey = enrichment.book_key;

      const status = enrichment.cover_approved === true ? "approved" : enrichment.cover_approved === false ? "rejected" : "pending";

      const { rows: bookAliasRows } = await pool.query(
        `SELECT alias_key FROM book_aliases WHERE canonical_key = $1`,
        [bookKey]
      );
      const bookKeyVariants = new Set([bookKey, ...bookAliasRows.map((a: any) => a.alias_key)]);

      const allKeyVariants = Array.from(bookKeyVariants);
      const ilikeClauses = allKeyVariants.map((_, i) => `lpr.resources::text ILIKE $${i + 1}`).join(" OR ");
      const ilikeParams = allKeyVariants.map(k => `%${k.replace(/[%_]/g, '\\$&')}%`);

      const { rows: recapRows } = await pool.query(
        `SELECT lpr.slug, lpr.episode_slug, lpr.episode_title, lpr.resources,
                lpr.publish_date, lpr.hosts, lpr.guests,
                pd.name as podcast_name
         FROM landing_page_recaps lpr
         JOIN podcast_directory pd ON pd.slug = lpr.slug
         WHERE lpr.resources IS NOT NULL AND lpr.resources::text != '[]'
           AND (${ilikeClauses})`,
        ilikeParams
      );

      const episodes: {
        podcastSlug: string;
        podcastName: string;
        episodeSlug: string;
        episodeTitle: string;
        context: string;
        publishedAt: string | null;
      }[] = [];
      const podcastSet = new Map<string, string>();

      for (const row of recapRows) {
        let resources: any[];
        try {
          const parsed = typeof row.resources === 'string' ? JSON.parse(row.resources) : row.resources;
          if (!Array.isArray(parsed)) continue;
          resources = parsed;
        } catch { continue; }

        let foundInEpisode = false;
        let bookContext = "";

        for (const r of resources) {
          if (!r || r.type !== 'book' || !r.name) continue;
          const rKey = r.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
          if (bookKeyVariants.has(rKey)) {
            foundInEpisode = true;
            bookContext = r.context || "";
            break;
          }
        }

        if (foundInEpisode) {
          episodes.push({
            podcastSlug: row.slug,
            podcastName: row.podcast_name,
            episodeSlug: row.episode_slug,
            episodeTitle: row.episode_title,
            context: bookContext,
            publishedAt: row.publish_date,
          });
          podcastSet.set(row.slug, row.podcast_name);
        }
      }

      episodes.sort((a, b) => {
        if (a.publishedAt && b.publishedAt) return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        return 0;
      });

      const podcasts = Array.from(podcastSet.entries()).map(([slug, name]) => ({
        slug,
        name,
        episodeCount: episodes.filter(e => e.podcastSlug === slug).length,
      }));

      res.json({
        book: {
          id: enrichment.id,
          title: enrichment.book_title,
          author: enrichment.author,
          description: enrichment.description,
          amazonUrl: enrichment.amazon_url,
          slug: enrichment.slug,
          coverUrl: enrichment.has_cover ? `/books/${enrichment.slug}.jpg` : null,
          status,
          publisher: enrichment.publisher,
          publishYear: enrichment.publish_year,
          rating: enrichment.rating,
          isbn: enrichment.isbn,
          topics: enrichment.topics || [],
          categories: enrichment.categories || [],
          createdAt: enrichment.created_at,
          updatedAt: enrichment.updated_at,
          subtitle: enrichment.subtitle || null,
          isbn10: enrichment.isbn_10 || null,
          isbn13: enrichment.isbn_13 || null,
          googleBooksId: enrichment.google_books_id || null,
          asin: enrichment.asin || null,
          pageCount: enrichment.page_count ?? null,
          language: enrichment.language ?? null,
          ratingCount: enrichment.rating_count ?? null,
          publishedDate: enrichment.published_date ?? null,
          googleDescription: enrichment.google_description ?? null,
          googlePreviewLink: enrichment.google_preview_link ?? null,
          googleInfoLink: enrichment.google_info_link ?? null,
          maturityRating: enrichment.maturity_rating ?? null,
          printType: enrichment.print_type ?? null,
          dimensions: enrichment.dimensions ?? null,
          printedPageCount: enrichment.printed_page_count ?? null,
          canonicalVolumeLink: enrichment.canonical_volume_link ?? null,
          contentVersion: enrichment.content_version ?? null,
          olWorkKey: enrichment.ol_work_key ?? null,
          olSubjects: enrichment.ol_subjects ?? null,
          olLanguages: enrichment.ol_languages ?? null,
          olEditionCount: enrichment.ol_edition_count ?? null,
          olEbookCount: enrichment.ol_ebook_count ?? null,
          olCoverId: enrichment.ol_cover_id ?? null,
          olRatingsAverage: enrichment.ol_ratings_average ?? null,
          olRatingsCount: enrichment.ol_ratings_count ?? null,
          olWantToRead: enrichment.ol_want_to_read ?? null,
          olCurrentlyReading: enrichment.ol_currently_reading ?? null,
          olAlreadyRead: enrichment.ol_already_read ?? null,
          olFirstPublishYear: enrichment.ol_first_publish_year ?? null,
          olPublishers: enrichment.ol_publishers ?? null,
          olNumberOfPages: enrichment.ol_number_of_pages ?? null,
          olFirstSentence: enrichment.ol_first_sentence ?? null,
          olSubtitle: enrichment.ol_subtitle ?? null,
          olAuthorNames: enrichment.ol_author_names ?? null,
          olIdAmazon: enrichment.ol_id_amazon ?? null,
          olIdGoodreads: enrichment.ol_id_goodreads ?? null,
          olHasFulltext: enrichment.ol_has_fulltext ?? null,
          olAllIsbns: enrichment.ol_all_isbns ?? null,
          olPublishDates: enrichment.ol_publish_dates ?? null,
          gbSaleability: enrichment.gb_saleability ?? null,
          gbIsEbook: enrichment.gb_is_ebook ?? null,
          gbListPrice: enrichment.gb_list_price ?? null,
          gbPriceCurrency: enrichment.gb_price_currency ?? null,
          gbRetailPrice: enrichment.gb_retail_price ?? null,
          gbBuyLink: enrichment.gb_buy_link ?? null,
          gbViewability: enrichment.gb_viewability ?? null,
          gbEmbeddable: enrichment.gb_embeddable ?? null,
          gbPublicDomain: enrichment.gb_public_domain ?? null,
          gbTextToSpeech: enrichment.gb_text_to_speech ?? null,
          gbEpubAvailable: enrichment.gb_epub_available ?? null,
          gbPdfAvailable: enrichment.gb_pdf_available ?? null,
          gbWebReaderLink: enrichment.gb_web_reader_link ?? null,
          gbImageLinks: enrichment.gb_image_links ?? null,
          gbReadingModes: enrichment.gb_reading_modes ?? null,
        },
        episodes,
        podcasts,
        totalMentions: episodes.length,
        totalPodcasts: podcastSet.size,
      });
    } catch (err: any) {
      console.error("[BookFullDetail] Error:", err);
      res.status(500).json({ message: err?.message || "Failed to load book detail" });
    }
  });

  app.post("/api/admin/shop/book/:id/update", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const numId = parseInt(req.params.id, 10);
      if (!numId) return res.status(400).json({ message: "Invalid id" });

      const { rows: existing } = await pool.query(`SELECT id FROM book_enrichments WHERE id = $1`, [numId]);
      if (existing.length === 0) return res.status(404).json({ message: "Book not found" });

      const allowedFields: Record<string, string> = {
        title: "book_title",
        subtitle: "subtitle",
        author: "author",
        description: "description",
        isbn: "isbn",
        isbn10: "isbn_10",
        isbn13: "isbn_13",
        googleBooksId: "google_books_id",
        asin: "asin",
        amazonUrl: "amazon_url",
        publisher: "publisher",
        publishYear: "publish_year",
        pageCount: "page_count",
        rating: "rating",
        language: "language",
        slug: "slug",
        topics: "topics",
        categories: "categories",
      };

      const setClauses: string[] = [];
      const vals: any[] = [];
      let paramIdx = 1;

      const stringFields = new Set(["title", "subtitle", "author", "description", "isbn", "isbn10", "isbn13", "googleBooksId", "asin", "amazonUrl", "publisher", "language", "slug"]);

      for (const [key, dbCol] of Object.entries(allowedFields)) {
        if (req.body[key] === undefined) continue;
        let val = req.body[key];

        if (stringFields.has(key) && val !== null && val !== "" && typeof val !== "string") {
          return res.status(400).json({ message: `${key} must be a string` });
        }

        if (key === "isbn10" && val && typeof val === "string" && val.trim()) {
          const cleaned = val.trim().replace(/[-\s]/g, "");
          if (!/^[0-9]{9}[0-9Xx]$/.test(cleaned)) {
            return res.status(400).json({ message: "ISBN-10 must be 10 characters (9 digits + check digit)" });
          }
        }
        if (key === "isbn13" && val && typeof val === "string" && val.trim()) {
          const cleaned = val.trim().replace(/[-\s]/g, "");
          if (!/^[0-9]{13}$/.test(cleaned)) {
            return res.status(400).json({ message: "ISBN-13 must be 13 digits" });
          }
        }

        if (key === "publishYear" || key === "pageCount") {
          if (val !== null && val !== "") {
            const strVal = String(val).trim();
            if (!/^-?\d+$/.test(strVal)) return res.status(400).json({ message: `${key} must be a valid integer` });
            val = parseInt(strVal, 10);
          } else {
            val = null;
          }
        }
        if (key === "rating") {
          if (val !== null && val !== "") {
            const strVal = String(val).trim();
            if (!/^-?\d+(\.\d+)?$/.test(strVal)) return res.status(400).json({ message: "rating must be a valid number" });
            val = parseFloat(strVal);
          } else {
            val = null;
          }
        }
        if (key === "topics" || key === "categories") {
          if (!Array.isArray(val)) {
            return res.status(400).json({ message: `${key} must be an array` });
          }
        }
        if (typeof val === "string") {
          val = val.trim() || null;
        }

        setClauses.push(`${dbCol} = $${paramIdx}`);
        vals.push(val);
        paramIdx++;
      }

      if (setClauses.length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      vals.push(numId);
      await pool.query(
        `UPDATE book_enrichments SET ${setClauses.join(", ")}, updated_at = NOW() WHERE id = $${paramIdx}`,
        vals
      );

      shopCache.invalidate();
      res.json({ success: true });
    } catch (err: any) {
      console.error("[BookUpdate] Error:", err);
      res.status(500).json({ message: err?.message || "Failed to update book" });
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
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const { rows: bookRows } = await client.query(`SELECT book_key, slug FROM book_enrichments WHERE id = $1`, [numId]);
          if (bookRows.length > 0) {
            const { book_key, slug } = bookRows[0];
            if (book_key) {
              await client.query(`DELETE FROM book_aliases WHERE canonical_key = $1 OR alias_key = $1`, [book_key]);
            }
            if (slug) {
              await client.query(`DELETE FROM book_bookmarks WHERE book_slug = $1`, [slug]);
            }
          }
          await client.query(`DELETE FROM book_enrichments WHERE id = $1`, [numId]);
          await client.query("COMMIT");
        } catch (txErr) {
          await client.query("ROLLBACK");
          throw txErr;
        } finally {
          client.release();
        }
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

  app.get("/api/admin/shop/books-no-mentions-count", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int as count
         FROM book_enrichments be
         LEFT JOIN LATERAL (
           SELECT COUNT(DISTINCT eem.podcast_slug)::int as podcast_count
           FROM entity_episode_mentions eem
           WHERE eem.entity_type = 'book' AND eem.entity_slug = be.slug
         ) eem_stats ON true
         WHERE be.cover_approved = true AND COALESCE(eem_stats.podcast_count, 0) = 0`
      );
      res.json({ count: rows[0]?.count || 0 });
    } catch (err: any) {
      console.error("[BooksNoMentionsCount] Error:", err);
      res.status(500).json({ message: err?.message || "Failed to count" });
    }
  });

  app.delete("/api/admin/shop/bulk-delete-no-mentions", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authorized" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: booksToDelete } = await client.query(
        `SELECT be.id, be.book_key, be.slug FROM book_enrichments be
         WHERE be.cover_approved = true
           AND NOT EXISTS (
             SELECT 1 FROM entity_episode_mentions eem
             WHERE eem.entity_type = 'book' AND eem.entity_slug = be.slug
             AND eem.podcast_slug IS NOT NULL
           )`
      );
      if (booksToDelete.length > 0) {
        type BookToDelete = { id: number; book_key: string | null; slug: string | null };
        const bookKeys = booksToDelete.map((b: BookToDelete) => b.book_key).filter(Boolean) as string[];
        const slugs = booksToDelete.map((b: BookToDelete) => b.slug).filter(Boolean) as string[];
        const ids = booksToDelete.map((b: BookToDelete) => b.id);
        if (bookKeys.length > 0) {
          const keyPlaceholders = bookKeys.map((_, i) => `$${i + 1}`).join(",");
          await client.query(
            `DELETE FROM book_aliases WHERE canonical_key IN (${keyPlaceholders}) OR alias_key IN (${keyPlaceholders})`,
            bookKeys
          );
        }
        if (slugs.length > 0) {
          const slugPlaceholders = slugs.map((_, i) => `$${i + 1}`).join(",");
          await client.query(
            `DELETE FROM book_bookmarks WHERE book_slug IN (${slugPlaceholders})`,
            slugs
          );
        }
        const idPlaceholders = ids.map((_, i) => `$${i + 1}`).join(",");
        await client.query(
          `DELETE FROM book_enrichments WHERE id IN (${idPlaceholders})`,
          ids
        );
      }
      await client.query("COMMIT");
      shopCache.invalidate();
      res.json({ deleted: booksToDelete.length });
    } catch (err: any) {
      await client.query("ROLLBACK");
      console.error("[BulkDeleteNoMentions] Error:", err);
      res.status(500).json({ message: err?.message || "Failed to bulk delete" });
    } finally {
      client.release();
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
      const { name, description, url, imageUrl, category, isbn, googleBooksId } = req.body;
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
        if (isbn !== undefined) { sets.push(`isbn = $${idx++}`); vals.push(isbn); }
        if (googleBooksId !== undefined) { sets.push(`google_books_id = $${idx++}`); vals.push(googleBooksId); }
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
        const { rows } = await pool.query(`SELECT book_title, author, google_books_id, isbn FROM book_enrichments WHERE id = $1`, [numId]);
        if (rows.length === 0) return res.status(404).json({ message: "Book not found" });
        productName = rows[0].book_title || "";
        company = rows[0].author || "";

        let gbId = rows[0].google_books_id;
        if (!gbId) {
          try {
            const q = encodeURIComponent(productName + (company ? `+inauthor:${company}` : ""));
            const gbRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`);
            if (gbRes.ok) {
              const gbData = await gbRes.json();
              gbId = gbData.items?.[0]?.id || null;
            }
          } catch {}
        }
        if (!gbId && rows[0].isbn) {
          try {
            const isbnRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${rows[0].isbn}&maxResults=1`);
            if (isbnRes.ok) {
              const isbnData = await isbnRes.json();
              gbId = isbnData.items?.[0]?.id || null;
            }
          } catch {}
        }

        const bookImages: string[] = [];
        if (gbId) {
          for (const zoom of [3, 2]) {
            const coverUrl = `https://books.google.com/books/content?id=${gbId}&printsec=frontcover&img=1&zoom=${zoom}&source=gbs_api`;
            try {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 8000);
              const coverRes = await fetch(coverUrl, { signal: controller.signal });
              clearTimeout(timeout);
              if (coverRes.ok) {
                const buf = Buffer.from(await coverRes.arrayBuffer());
                if (buf.length >= 1000) {
                  bookImages.push(coverUrl);
                  break;
                }
              }
            } catch {}
          }
        }

        return res.json({ images: bookImages, productName, company });
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

  app.get("/api/webhooks/taddy", (_req, res) => {
    res.status(200).json({ status: "ok", message: "Taddy webhook endpoint active. Use POST to deliver events." });
  });
  app.get("/api/webhooks/taddy/", (_req, res) => {
    res.status(200).json({ status: "ok", message: "Taddy webhook endpoint active. Use POST to deliver events." });
  });
  app.post("/api/webhooks/taddy/", (req, res, next) => next());
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
      console.log(`[TaddyWebhook] Received: taddyType=${taddyType} action=${action} uuid=${data?.uuid?.slice(0, 12)}... host=${req.hostname}`);

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
          `SELECT name, slug, itunes_id, taddy_uuid, hosts, artwork_url, status FROM podcast_directory WHERE (itunes_id = $1 OR taddy_uuid = $2) LIMIT 1`,
          [seriesItunesId, seriesUuid]
        );

        if (!podcast) {
          console.log(`[TaddyWebhook] Episode for untracked podcast (iTunes ${seriesItunesId}), ignoring`);
          return res.status(200).json({ success: true });
        }

        if (podcast.status !== "published") {
          console.log(`[TaddyWebhook] Episode for non-published podcast "${podcast.name}" (status=${podcast.status}), ignoring`);
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
              `SELECT id FROM episode_transcripts WHERE podcast_id = $1 AND (episode_guid = $2 OR ${SQL_NORMALIZE_TITLE('episode_title')} = ${SQL_NORMALIZE_TITLE('$3')}) LIMIT 1`,
              [podcast.itunes_id, epUuid, epTitle]
            );
            if (existing.length > 0) {
              console.log(`[TaddyWebhook] Episode already exists, skipping: "${epTitle.slice(0, 60)}"`);
              return;
            }

            const { getEpisodeTranscript, isTaddyBudgetExhausted: isBudgetExhausted } = await import("./taddyClient");

            // Only queue if this podcast has previously produced at least one transcript.
            // Podcasts with zero transcript history (e.g. Science Friday, The Memo) will never
            // succeed in Taddy — skipping saves 5 pointless retries per episode.
            const { rows: [txHistoryRow] } = await pool.query(
              `SELECT 1 FROM episode_transcripts WHERE podcast_id = $1 LIMIT 1`,
              [podcast.itunes_id]
            );
            const podcastHasTranscriptHistory = !!txHistoryRow;

            if (isBudgetExhausted()) {
              if (!podcastHasTranscriptHistory) {
                console.log(`[TaddyWebhook] Budget exhausted + no transcript history for "${podcast.name}", skipping queue`);
                return;
              }
              console.log(`[TaddyWebhook] Budget exhausted, queuing "${epTitle.slice(0, 60)}"`);
              await storage.queueTranscriptFetch({
                podcastId: podcast.itunes_id,
                podcastName: podcast.name,
                episodeGuid: epUuid,
                episodeTitle: epTitle,
                taddyUuid: podcast.taddy_uuid || seriesUuid || undefined,
                priority: 10,
              });
              return;
            }

            const transcript = await getEpisodeTranscript(epUuid);
            if (!transcript) {
              if (!podcastHasTranscriptHistory) {
                console.log(`[TaddyWebhook] No transcript + no history for "${podcast.name}", skipping queue`);
                return;
              }
              console.log(`[TaddyWebhook] No transcript available yet, queuing "${epTitle.slice(0, 60)}"`);
              await storage.queueTranscriptFetch({
                podcastId: podcast.itunes_id,
                podcastName: podcast.name,
                episodeGuid: epUuid,
                episodeTitle: epTitle,
                taddyUuid: podcast.taddy_uuid || seriesUuid || undefined,
                priority: 10,
              });
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

            const { generateRecapFromTranscript } = await import("./recapGenerator");
            const { slugifyEpisodeTitle } = await import("./emailScheduler");
            const epSlug = slugifyEpisodeTitle(epTitle);

            const existingRecap = await storage.getLandingPageRecapBySlug(podcast.slug, epSlug);
            if (existingRecap) {
              console.log(`[TaddyWebhook] Recap already exists for "${epTitle.slice(0, 60)}"`);
              return;
            }

            const recap = await generateRecapFromTranscript(transcript, podcast.name, epTitle, epData.description || null);
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

            let webhookGuests: string;
            const aiWebhookGuests = recap.guests && recap.guests.length > 0 ? recap.guests : null;
            if (aiWebhookGuests) {
              webhookGuests = JSON.stringify(aiWebhookGuests);
            } else if (existingRecap) {
              const existingGuestsRaw = existingRecap.guests;
              let hasExisting = false;
              if (existingGuestsRaw) {
                try {
                  const parsed = typeof existingGuestsRaw === 'string' ? JSON.parse(existingGuestsRaw) : existingGuestsRaw;
                  hasExisting = Array.isArray(parsed) && parsed.length > 0;
                } catch {}
              }
              if (hasExisting) {
                webhookGuests = typeof existingGuestsRaw === 'string' ? existingGuestsRaw : JSON.stringify(existingGuestsRaw);
                console.log(`[TaddyWebhook] AI returned empty guests, preserving existing guest data for "${epTitle.slice(0, 60)}"`);
              } else {
                webhookGuests = "[]";
              }
            } else {
              webhookGuests = "[]";
            }

            const webhookSpotifyUrl = "";
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
              tldl: "",
              whatHappened: recap.whatHappened,
              keyInsights: recap.keyInsights,
              quote: "",
              quoteAttribution: "",
              keyTopics: [],
              topQuestions: null,
              audioUrl: epData.audioUrl || "",
              sponsors: "[]",
              guests: webhookGuests,
              resources: recap.resources ? JSON.stringify(recap.resources) : "[]",
              spotifyEpisodeUrl: webhookSpotifyUrl,
              topicContexts: null,
              published: true,
            });
            const webhookCanonicalSlug = webhookUpserted.episodeSlug;
            podcastRecapsCache.invalidateByPrefix(podcast.slug);
            entityLinksCache.invalidateByPrefix(podcast.slug);
            console.log(`[TaddyWebhook] Generated recap: ${podcast.name} - "${epTitle.slice(0, 60)}"`);


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

  interface OpenAICostBucket {
    start_time: number;
    results?: Array<{ amount?: { value?: number; currency?: string } }>;
  }

  interface OpenAICostsResponse {
    data?: OpenAICostBucket[];
    has_more?: boolean;
    next_page?: string;
  }

  interface OpenAICostsCacheData {
    daily: { date: string; cost: number }[];
    summary: { today: number; week: number; month: number };
  }

  const openaiCostsCache: { data: OpenAICostsCacheData | null; timestamp: number } = { data: null, timestamp: 0 };
  const OPENAI_COSTS_CACHE_TTL = 5 * 60 * 1000;

  app.get("/api/admin/api-usage/openai-actual", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const now = Date.now();
      if (openaiCostsCache.data && (now - openaiCostsCache.timestamp) < OPENAI_COSTS_CACHE_TTL) {
        return res.json(openaiCostsCache.data);
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "OpenAI API key not configured" });
      }

      const endTime = Math.floor(now / 1000);
      const startTime = endTime - (30 * 24 * 60 * 60);

      let allBuckets: OpenAICostBucket[] = [];
      let pageToken: string | undefined;
      let attempts = 0;

      do {
        const url = new URL("https://api.openai.com/v1/organization/costs");
        url.searchParams.set("start_time", String(startTime));
        url.searchParams.set("end_time", String(endTime));
        url.searchParams.set("bucket_width", "1d");
        url.searchParams.set("limit", "30");
        if (pageToken) url.searchParams.set("page", pageToken);

        const resp = await fetch(url.toString(), {
          headers: { "Authorization": `Bearer ${apiKey}` },
        });

        if (!resp.ok) {
          const errorText = await resp.text();
          console.error("[OpenAI Costs] API error:", resp.status, errorText);
          return res.status(502).json({ error: "Failed to fetch OpenAI costs", status: resp.status });
        }

        const json = (await resp.json()) as OpenAICostsResponse;
        if (json.data) allBuckets = allBuckets.concat(json.data);
        pageToken = json.has_more ? json.next_page : undefined;
        attempts++;
      } while (pageToken && attempts < 5);

      const dailyCosts: { date: string; cost: number }[] = [];
      let todayCost = 0;
      let weekCost = 0;
      let monthCost = 0;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      weekAgo.setHours(0, 0, 0, 0);

      for (const bucket of allBuckets) {
        const bucketDate = new Date(bucket.start_time * 1000);
        const dateStr = bucketDate.toISOString().split("T")[0];

        let totalCents = 0;
        if (bucket.results) {
          for (const result of bucket.results) {
            if (result.amount && result.amount.value != null) {
              totalCents += result.amount.value;
            }
          }
        }
        const costDollars = totalCents / 100;

        dailyCosts.push({ date: dateStr, cost: costDollars });

        if (bucketDate >= todayStart) todayCost += costDollars;
        if (bucketDate >= weekAgo) weekCost += costDollars;
        monthCost += costDollars;
      }

      dailyCosts.sort((a, b) => a.date.localeCompare(b.date));

      const result = {
        daily: dailyCosts,
        summary: { today: todayCost, week: weekCost, month: monthCost },
      };

      openaiCostsCache.data = result;
      openaiCostsCache.timestamp = now;

      res.json(result);
    } catch (err) {
      console.error("[OpenAI Costs] Error:", err);
      res.status(500).json({ error: "Failed to fetch OpenAI actual costs" });
    }
  });

  app.post("/api/admin/audio-recap/:podcastSlug/:episodeSlug/generate", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { podcastSlug, episodeSlug } = req.params;
      const { generateAudioForEpisode } = await import("./audioRecapGenerator");
      const result = await generateAudioForEpisode(podcastSlug, episodeSlug);
      res.json(result);
    } catch (err) {
      console.error("[AudioRecap] Generate error:", err);
      res.status(500).json({ error: "Failed to generate audio recap" });
    }
  });

  app.get("/api/admin/audio-recap/:podcastSlug/:episodeSlug/status", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { podcastSlug, episodeSlug } = req.params;
      const { getRecapAudioStatus, getPlaybackStats } = await import("./audioRecapGenerator");
      const audio = await getRecapAudioStatus(podcastSlug, episodeSlug);
      const playbackStats = await getPlaybackStats(podcastSlug, episodeSlug);
      res.json({ audio, playbackStats });
    } catch (err) {
      console.error("[AudioRecap] Status error:", err);
      res.status(500).json({ error: "Failed to fetch audio status" });
    }
  });

  app.get("/api/audio-recap/:podcastSlug/:episodeSlug", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { podcastSlug, episodeSlug } = req.params;
      const { getRecapAudioStatus } = await import("./audioRecapGenerator");
      const audio = await getRecapAudioStatus(podcastSlug, episodeSlug);
      if (!audio || audio.status !== "ready" || !audio.audio_url) {
        return res.status(404).json({ error: "Audio not available" });
      }
      res.json({ audioUrl: audio.audio_url, duration: audio.audio_duration, status: audio.status });
    } catch (err) {
      console.error("[AudioRecap] Public status error:", err);
      res.status(500).json({ error: "Failed to fetch audio status" });
    }
  });

  app.get("/api/audio-recap-file/:podcastSlug/:episodeSlug", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { podcastSlug, episodeSlug } = req.params;
      const sanitizedPodcast = podcastSlug.replace(/[^a-z0-9_-]/gi, "");
      const sanitizedEpisode = episodeSlug.replace(/[^a-z0-9_-]/gi, "");
      const { streamAudioFromStorage } = await import("./audioRecapGenerator");
      const stream = await streamAudioFromStorage(sanitizedPodcast, sanitizedEpisode);
      if (!stream) {
        return res.status(404).json({ error: "Audio file not found" });
      }
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "private, max-age=3600");
      stream.on("error", (streamErr: any) => {
        console.error("[AudioRecap] Stream error:", streamErr);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming audio file" });
        }
      });
      stream.pipe(res);
    } catch (err) {
      console.error("[AudioRecap] File serve error:", err);
      res.status(500).json({ error: "Failed to serve audio file" });
    }
  });

  app.post("/api/audio-playback-event", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { podcastSlug, episodeSlug, eventType, percentageReached, sessionId } = req.body;
      if (!podcastSlug || !episodeSlug || !eventType) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const allowedEvents = ["play", "pause", "progress", "complete"];
      if (!allowedEvents.includes(eventType)) {
        return res.status(400).json({ error: "Invalid event type" });
      }
      const pct = Math.max(0, Math.min(100, Number(percentageReached) || 0));
      const userId = req.session.userId;
      await pool.query(
        `INSERT INTO audio_playback_events (podcast_slug, episode_slug, event_type, percentage_reached, session_id, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [podcastSlug, episodeSlug, eventType, pct, sessionId || null, userId]
      );
      res.json({ success: true });
    } catch (err) {
      console.error("[AudioPlayback] Event error:", err);
      res.status(500).json({ error: "Failed to log playback event" });
    }
  });

  app.get("/api/admin/audio-analytics/overview", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { rows: [overview] } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE event_type = 'play')::int AS total_plays,
          COALESCE(AVG(percentage_reached) FILTER (WHERE event_type = 'progress'), 0) AS avg_completion_rate,
          COUNT(*) FILTER (WHERE event_type = 'complete')::int AS total_completions,
          COUNT(DISTINCT COALESCE(session_id, user_id::text)) FILTER (WHERE event_type = 'play') AS unique_listeners
        FROM audio_playback_events
      `);
      const { rows: [audioStats] } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'ready')::int AS total_episodes_with_audio,
          COALESCE(SUM(audio_duration) FILTER (WHERE status = 'ready'), 0) AS total_audio_seconds
        FROM recap_audio
      `);
      res.json({
        totalPlays: parseInt(overview.total_plays) || 0,
        avgCompletionRate: parseFloat(overview.avg_completion_rate) || 0,
        totalCompletions: parseInt(overview.total_completions) || 0,
        uniqueListeners: parseInt(overview.unique_listeners) || 0,
        totalEpisodesWithAudio: parseInt(audioStats.total_episodes_with_audio) || 0,
        totalAudioHours: (parseFloat(audioStats.total_audio_seconds) || 0) / 3600,
      });
    } catch (err) {
      console.error("[AudioAnalytics] Overview error:", err);
      res.status(500).json({ error: "Failed to fetch audio analytics" });
    }
  });

  app.get("/api/admin/audio-analytics/by-podcast", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { rows } = await pool.query(`
        SELECT
          podcast_slug,
          COUNT(*) FILTER (WHERE event_type = 'play')::int AS play_count,
          COUNT(*) FILTER (WHERE event_type = 'complete')::int AS completion_count,
          COUNT(DISTINCT COALESCE(session_id, user_id::text)) FILTER (WHERE event_type = 'play') AS unique_listeners,
          COALESCE(AVG(percentage_reached) FILTER (WHERE event_type = 'progress'), 0) AS avg_percentage
        FROM audio_playback_events
        GROUP BY podcast_slug
        ORDER BY play_count DESC
      `);
      res.json(rows);
    } catch (err) {
      console.error("[AudioAnalytics] By-podcast error:", err);
      res.status(500).json({ error: "Failed to fetch podcast audio analytics" });
    }
  });

  app.get("/api/admin/audio-analytics/by-episode", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { rows } = await pool.query(`
        SELECT
          ape.podcast_slug, ape.episode_slug,
          lpr.episode_title, lpr.podcast_name,
          COUNT(*) FILTER (WHERE ape.event_type = 'play')::int AS play_count,
          COUNT(*) FILTER (WHERE ape.event_type = 'complete')::int AS completion_count,
          COUNT(DISTINCT COALESCE(ape.session_id, ape.user_id::text)) FILTER (WHERE ape.event_type = 'play') AS unique_listeners,
          COALESCE(AVG(ape.percentage_reached) FILTER (WHERE ape.event_type = 'progress'), 0) AS avg_percentage
        FROM audio_playback_events ape
        LEFT JOIN landing_page_recaps lpr ON lpr.slug = ape.podcast_slug AND lpr.episode_slug = ape.episode_slug
        GROUP BY ape.podcast_slug, ape.episode_slug, lpr.episode_title, lpr.podcast_name
        ORDER BY play_count DESC
        LIMIT 50
      `);
      res.json(rows);
    } catch (err) {
      console.error("[AudioAnalytics] By-episode error:", err);
      res.status(500).json({ error: "Failed to fetch episode audio analytics" });
    }
  });

  app.get("/api/admin/audio-analytics/plays-over-time", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const granularity = (req.query.granularity as string) || "daily";
      const days = parseInt(req.query.days as string) || 30;
      const dateExpr = granularity === "monthly" ? "DATE_TRUNC('month', created_at)" :
                       granularity === "weekly" ? "DATE_TRUNC('week', created_at)" :
                       "DATE(created_at)";
      const { rows } = await pool.query(`
        SELECT
          ${dateExpr} AS date,
          COUNT(*) FILTER (WHERE event_type = 'play')::int AS plays,
          COUNT(*) FILTER (WHERE event_type = 'complete')::int AS completions,
          COUNT(DISTINCT COALESCE(session_id, user_id::text)) FILTER (WHERE event_type = 'play') AS unique_listeners
        FROM audio_playback_events
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY ${dateExpr}
        ORDER BY date
      `);
      res.json(rows);
    } catch (err) {
      console.error("[AudioAnalytics] Plays over time error:", err);
      res.status(500).json({ error: "Failed to fetch plays over time" });
    }
  });

  app.get("/api/admin/audio-analytics/completion-funnel", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { rows: [counts] } = await pool.query(`
        SELECT
          COUNT(DISTINCT COALESCE(session_id, user_id::text)) FILTER (WHERE event_type = 'play') AS started,
          COUNT(DISTINCT COALESCE(session_id, user_id::text)) FILTER (WHERE percentage_reached >= 25) AS reached_25,
          COUNT(DISTINCT COALESCE(session_id, user_id::text)) FILTER (WHERE percentage_reached >= 50) AS reached_50,
          COUNT(DISTINCT COALESCE(session_id, user_id::text)) FILTER (WHERE percentage_reached >= 75) AS reached_75,
          COUNT(DISTINCT COALESCE(session_id, user_id::text)) FILTER (WHERE event_type = 'complete' OR percentage_reached >= 100) AS reached_100
        FROM audio_playback_events
      `);
      const started = parseInt(counts.started) || 0;
      res.json({
        started,
        reached_25: parseInt(counts.reached_25) || 0,
        reached_50: parseInt(counts.reached_50) || 0,
        reached_75: parseInt(counts.reached_75) || 0,
        reached_100: parseInt(counts.reached_100) || 0,
        pct_25: started > 0 ? ((parseInt(counts.reached_25) || 0) / started * 100) : 0,
        pct_50: started > 0 ? ((parseInt(counts.reached_50) || 0) / started * 100) : 0,
        pct_75: started > 0 ? ((parseInt(counts.reached_75) || 0) / started * 100) : 0,
        pct_100: started > 0 ? ((parseInt(counts.reached_100) || 0) / started * 100) : 0,
      });
    } catch (err) {
      console.error("[AudioAnalytics] Completion funnel error:", err);
      res.status(500).json({ error: "Failed to fetch completion funnel" });
    }
  });

  app.get("/api/admin/analytics/features/ai-chat", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const startDate = (req.query.startDate as string) || null;
      const endDate = (req.query.endDate as string) || null;
      const days = parseInt(req.query.days as string) || 30;

      const params: any[] = [];
      let feWhere = " AND fe.feature = 'ai_chat'";
      if (startDate) { params.push(startDate); feWhere += ` AND fe.created_at >= $${params.length}::timestamp`; }
      if (endDate) { params.push(endDate + " 23:59:59"); feWhere += ` AND fe.created_at <= $${params.length}::timestamp`; }
      if (!startDate && !endDate) {
        params.push(days);
        feWhere += ` AND fe.created_at >= NOW() - ($${params.length} || ' days')::interval`;
      }

      const [totals, allTimeTotals, daily, topEpisodes, perUser] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS total_questions, COUNT(DISTINCT fe.user_id)::int AS unique_users FROM feature_events fe WHERE fe.user_id IS NOT NULL${feWhere}`,
          params
        ),
        pool.query(
          `SELECT COUNT(*)::int AS total_questions_all_time, COUNT(DISTINCT user_id)::int AS unique_users_all_time FROM feature_events WHERE feature = 'ai_chat'`
        ),
        pool.query(
          `SELECT date_trunc('day', fe.created_at)::date AS day, COUNT(*)::int AS count FROM feature_events fe WHERE 1=1${feWhere} GROUP BY day ORDER BY day ASC`,
          params
        ),
        pool.query(
          `SELECT fe.metadata->>'episodeSlug' AS episode_slug, fe.metadata->>'podcastSlug' AS podcast_slug, COUNT(*)::int AS count FROM feature_events fe WHERE 1=1${feWhere} AND fe.metadata->>'episodeSlug' IS NOT NULL GROUP BY episode_slug, podcast_slug ORDER BY count DESC LIMIT 10`,
          params
        ),
        pool.query(
          `SELECT fe.user_id, u.email, COUNT(*)::int AS question_count, MAX(fe.created_at) AS last_active FROM feature_events fe LEFT JOIN users u ON u.id = fe.user_id WHERE fe.user_id IS NOT NULL${feWhere} GROUP BY fe.user_id, u.email ORDER BY question_count DESC LIMIT 20`,
          params
        ),
      ]);

      res.json({
        totalQuestions: totals.rows[0]?.total_questions || 0,
        uniqueUsers: totals.rows[0]?.unique_users || 0,
        totalQuestionsAllTime: allTimeTotals.rows[0]?.total_questions_all_time || 0,
        uniqueUsersAllTime: allTimeTotals.rows[0]?.unique_users_all_time || 0,
        dailyTrend: daily.rows,
        topEpisodes: topEpisodes.rows,
        perUser: perUser.rows,
      });
    } catch (err) {
      console.error("[FeaturesAnalytics] ai-chat error:", err);
      res.status(500).json({ error: "Failed to fetch ai-chat analytics" });
    }
  });

  app.get("/api/admin/analytics/features/audio", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const startDate = (req.query.startDate as string) || null;
      const endDate = (req.query.endDate as string) || null;
      const days = parseInt(req.query.days as string) || 30;

      const params: any[] = [];
      let apeWhere = "";
      if (startDate) { params.push(startDate); apeWhere += ` AND ape.created_at >= $${params.length}::timestamp`; }
      if (endDate) { params.push(endDate + " 23:59:59"); apeWhere += ` AND ape.created_at <= $${params.length}::timestamp`; }
      if (!startDate && !endDate) {
        params.push(days);
        apeWhere += ` AND ape.created_at >= NOW() - ($${params.length} || ' days')::interval`;
      }

      const [totals, daily, topEpisodes, perUser] = await Promise.all([
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE ape.event_type = 'play')::int AS total_plays,
             COUNT(DISTINCT ape.user_id) FILTER (WHERE ape.event_type = 'play')::int AS unique_listeners,
             COUNT(DISTINCT COALESCE(ape.session_id, ape.user_id::text)) FILTER (WHERE ape.event_type = 'play')::int AS total_sessions,
             COUNT(DISTINCT COALESCE(ape.session_id, ape.user_id::text)) FILTER (WHERE ape.event_type = 'complete' OR ape.percentage_reached >= 80)::int AS completed_sessions
           FROM audio_playback_events ape WHERE 1=1${apeWhere}`,
          params
        ),
        pool.query(
          `SELECT date_trunc('day', ape.created_at)::date AS day,
             COUNT(*) FILTER (WHERE ape.event_type = 'play')::int AS plays,
             COUNT(DISTINCT COALESCE(ape.session_id, ape.user_id::text)) FILTER (WHERE ape.event_type = 'complete' OR ape.percentage_reached >= 80)::int AS completions
           FROM audio_playback_events ape WHERE 1=1${apeWhere} GROUP BY day ORDER BY day ASC`,
          params
        ),
        pool.query(
          `SELECT ape.episode_slug, ape.podcast_slug, COUNT(*) FILTER (WHERE ape.event_type = 'play')::int AS plays
           FROM audio_playback_events ape WHERE 1=1${apeWhere}
           GROUP BY ape.episode_slug, ape.podcast_slug ORDER BY plays DESC LIMIT 10`,
          params
        ),
        pool.query(
          `SELECT ape.user_id, u.email, COUNT(*) FILTER (WHERE ape.event_type = 'play')::int AS play_count
           FROM audio_playback_events ape LEFT JOIN users u ON u.id = ape.user_id
           WHERE ape.user_id IS NOT NULL${apeWhere}
           GROUP BY ape.user_id, u.email ORDER BY play_count DESC LIMIT 20`,
          params
        ),
      ]);

      const total = totals.rows[0]?.total_plays || 0;
      const sessions = totals.rows[0]?.total_sessions || 0;
      const completedSessions = totals.rows[0]?.completed_sessions || 0;
      res.json({
        totalPlays: total,
        uniqueListeners: totals.rows[0]?.unique_listeners || 0,
        completionRate: sessions > 0 ? Math.round((completedSessions / sessions) * 100) : 0,
        dailyTrend: daily.rows,
        topEpisodes: topEpisodes.rows,
        perUser: perUser.rows,
      });
    } catch (err) {
      console.error("[FeaturesAnalytics] audio error:", err);
      res.status(500).json({ error: "Failed to fetch audio analytics" });
    }
  });

  app.get("/api/admin/analytics/features/shop", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const startDate = (req.query.startDate as string) || null;
      const endDate = (req.query.endDate as string) || null;
      const days = parseInt(req.query.days as string) || 30;

      let dateWhere = "";
      const params: any[] = [];
      if (startDate) { params.push(startDate); dateWhere += ` AND clicked_at >= $${params.length}::timestamp`; }
      if (endDate) { params.push(endDate + " 23:59:59"); dateWhere += ` AND clicked_at <= $${params.length}::timestamp`; }
      if (!startDate && !endDate) {
        params.push(days);
        dateWhere += ` AND clicked_at >= NOW() - ($${params.length} || ' days')::interval`;
      }

      const [totals, daily, topProducts, bookmarkStats] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS total_clicks, COUNT(DISTINCT user_id)::int AS unique_users, COUNT(DISTINCT product_name)::int AS unique_products FROM affiliate_clicks WHERE 1=1${dateWhere}`,
          params
        ),
        pool.query(
          `SELECT date_trunc('day', clicked_at)::date AS day, COUNT(*)::int AS clicks FROM affiliate_clicks WHERE 1=1${dateWhere} GROUP BY day ORDER BY day ASC`,
          params
        ),
        pool.query(
          `SELECT product_name, product_type, COUNT(*)::int AS clicks FROM affiliate_clicks WHERE 1=1${dateWhere} GROUP BY product_name, product_type ORDER BY clicks DESC LIMIT 10`,
          params
        ),
        pool.query(
          `SELECT sb.book_slug, COUNT(*)::int AS saves
           FROM book_bookmarks sb
           GROUP BY sb.book_slug ORDER BY saves DESC LIMIT 10`
        ),
      ]);

      res.json({
        totalClicks: totals.rows[0]?.total_clicks || 0,
        uniqueUsers: totals.rows[0]?.unique_users || 0,
        uniqueProducts: totals.rows[0]?.unique_products || 0,
        dailyTrend: daily.rows,
        topProducts: topProducts.rows,
        bookmarksByProduct: bookmarkStats.rows,
      });
    } catch (err) {
      console.error("[FeaturesAnalytics] shop error:", err);
      res.status(500).json({ error: "Failed to fetch shop analytics" });
    }
  });

  app.get("/api/admin/analytics/features/spotify", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const startDate = (req.query.startDate as string) || null;
      const endDate = (req.query.endDate as string) || null;
      const days = parseInt(req.query.days as string) || 30;

      const feParams: any[] = [];
      let feWhere = " AND fe.feature = 'spotify_import'";
      if (startDate) { feParams.push(startDate); feWhere += ` AND fe.created_at >= $${feParams.length}::timestamp`; }
      if (endDate) { feParams.push(endDate + " 23:59:59"); feWhere += ` AND fe.created_at <= $${feParams.length}::timestamp`; }
      if (!startDate && !endDate) {
        feParams.push(days);
        feWhere += ` AND fe.created_at >= NOW() - ($${feParams.length} || ' days')::interval`;
      }

      const [connected, totalUsers, everConnected, daily, importEvents] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS connected_users FROM users WHERE spotify_access_token IS NOT NULL`
        ),
        pool.query(`SELECT COUNT(*)::int AS total FROM users`),
        pool.query(
          `SELECT COUNT(DISTINCT user_id)::int AS ever_connected FROM feature_events WHERE feature = 'spotify_import'`
        ),
        pool.query(
          `SELECT date_trunc('day', fe.created_at)::date AS day, COUNT(DISTINCT fe.user_id)::int AS unique_importers
           FROM feature_events fe WHERE 1=1${feWhere} GROUP BY day ORDER BY day ASC`,
          feParams
        ),
        pool.query(
          `SELECT COUNT(*)::int AS total_imports, COUNT(DISTINCT fe.user_id)::int AS unique_importers,
           AVG((fe.metadata->>'showCount')::numeric) AS avg_shows_imported
           FROM feature_events fe WHERE 1=1${feWhere}`,
          feParams
        ),
      ]);

      const connectedCount = connected.rows[0]?.connected_users || 0;
      const total = totalUsers.rows[0]?.total || 1;

      res.json({
        connectedUsers: connectedCount,
        totalUsers: total,
        connectedPct: total > 0 ? Math.round((connectedCount / total) * 100) : 0,
        everConnected: everConnected.rows[0]?.ever_connected || 0,
        totalImports: importEvents.rows[0]?.total_imports || 0,
        uniqueImporters: importEvents.rows[0]?.unique_importers || 0,
        avgShowsImported: Math.round((parseFloat(importEvents.rows[0]?.avg_shows_imported) || 0) * 10) / 10,
        dailyTrend: daily.rows,
      });
    } catch (err) {
      console.error("[FeaturesAnalytics] spotify error:", err);
      res.status(500).json({ error: "Failed to fetch spotify analytics" });
    }
  });

  app.get("/api/admin/analytics/features/episode-links", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const startDate = (req.query.startDate as string) || null;
      const endDate = (req.query.endDate as string) || null;
      const days = parseInt(req.query.days as string) || 30;

      const params: any[] = [];
      let feWhere = " AND fe.feature = 'episode_link'";
      if (startDate) { params.push(startDate); feWhere += ` AND fe.created_at >= $${params.length}::timestamp`; }
      if (endDate) { params.push(endDate + " 23:59:59"); feWhere += ` AND fe.created_at <= $${params.length}::timestamp`; }
      if (!startDate && !endDate) {
        params.push(days);
        feWhere += ` AND fe.created_at >= NOW() - ($${params.length} || ' days')::interval`;
      }

      const [totals, byPlatform, daily, topEpisodes, perUser] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS total_clicks, COUNT(DISTINCT fe.user_id)::int AS unique_users FROM feature_events fe WHERE 1=1${feWhere}`,
          params
        ),
        pool.query(
          `SELECT fe.metadata->>'platform' AS platform, COUNT(*)::int AS clicks FROM feature_events fe WHERE 1=1${feWhere} GROUP BY platform ORDER BY clicks DESC`,
          params
        ),
        pool.query(
          `SELECT date_trunc('day', fe.created_at)::date AS day, COUNT(*)::int AS clicks FROM feature_events fe WHERE 1=1${feWhere} GROUP BY day ORDER BY day ASC`,
          params
        ),
        pool.query(
          `SELECT fe.metadata->>'episodeSlug' AS episode_slug, fe.metadata->>'podcastSlug' AS podcast_slug, COUNT(*)::int AS clicks FROM feature_events fe WHERE 1=1${feWhere} AND fe.metadata->>'episodeSlug' IS NOT NULL GROUP BY episode_slug, podcast_slug ORDER BY clicks DESC LIMIT 10`,
          params
        ),
        pool.query(
          `SELECT fe.user_id, u.email, COUNT(*)::int AS click_count FROM feature_events fe LEFT JOIN users u ON u.id = fe.user_id WHERE fe.user_id IS NOT NULL${feWhere} GROUP BY fe.user_id, u.email ORDER BY click_count DESC LIMIT 20`,
          params
        ),
      ]);

      res.json({
        totalClicks: totals.rows[0]?.total_clicks || 0,
        uniqueUsers: totals.rows[0]?.unique_users || 0,
        byPlatform: byPlatform.rows,
        dailyTrend: daily.rows,
        topEpisodes: topEpisodes.rows,
        perUser: perUser.rows,
      });
    } catch (err) {
      console.error("[FeaturesAnalytics] episode-links error:", err);
      res.status(500).json({ error: "Failed to fetch episode-links analytics" });
    }
  });

  app.get("/api/admin/api-usage/by-service", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const serviceFilter = req.query.service as string;
      const podcastFilter = req.query.podcast as string;
      let whereConditions = ["created_at >= NOW() - INTERVAL '30 days'"];
      const params: any[] = [];
      if (serviceFilter && serviceFilter !== "all") {
        params.push(serviceFilter);
        whereConditions.push(`COALESCE(service, 'openai') = $${params.length}`);
      }
      if (podcastFilter) {
        params.push(podcastFilter);
        whereConditions.push(`podcast_slug = $${params.length}`);
      }
      const where = whereConditions.join(" AND ");
      const { rows } = await pool.query(`
        SELECT
          COALESCE(service, 'openai') AS service,
          COUNT(*)::int AS calls,
          COALESCE(SUM(total_tokens), 0) AS tokens,
          COALESCE(SUM(estimated_cost), 0) AS cost
        FROM api_usage_logs
        WHERE ${where}
        GROUP BY COALESCE(service, 'openai')
        ORDER BY cost DESC
      `, params);
      res.json(rows);
    } catch (err) {
      console.error("[ApiUsage] By-service error:", err);
      res.status(500).json({ error: "Failed to fetch usage by service" });
    }
  });

  app.get("/api/admin/api-usage/by-episode", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const serviceFilter = req.query.service as string;
      const podcastFilter = req.query.podcast as string;
      let whereConditions = ["created_at >= NOW() - INTERVAL '30 days'", "episode_slug IS NOT NULL"];
      const params: any[] = [];
      if (serviceFilter && serviceFilter !== "all") {
        params.push(serviceFilter);
        whereConditions.push(`COALESCE(service, 'openai') = $${params.length}`);
      }
      if (podcastFilter) {
        params.push(podcastFilter);
        whereConditions.push(`podcast_slug = $${params.length}`);
      }
      const where = whereConditions.join(" AND ");
      const { rows } = await pool.query(`
        SELECT
          podcast_slug, episode_slug,
          COALESCE(service, 'openai') AS service,
          COUNT(*)::int AS calls,
          COALESCE(SUM(estimated_cost), 0) AS cost
        FROM api_usage_logs
        WHERE ${where}
        GROUP BY podcast_slug, episode_slug, COALESCE(service, 'openai')
        ORDER BY cost DESC
        LIMIT 100
      `, params);
      res.json(rows);
    } catch (err) {
      console.error("[ApiUsage] By-episode error:", err);
      res.status(500).json({ error: "Failed to fetch usage by episode" });
    }
  });

  app.get("/api/admin/api-usage/by-podcast", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const serviceFilter = req.query.service as string;
      let whereConditions = ["created_at >= NOW() - INTERVAL '30 days'", "podcast_slug IS NOT NULL"];
      const params: any[] = [];
      if (serviceFilter && serviceFilter !== "all") {
        params.push(serviceFilter);
        whereConditions.push(`COALESCE(service, 'openai') = $${params.length}`);
      }
      const where = whereConditions.join(" AND ");
      const { rows } = await pool.query(`
        SELECT
          podcast_slug,
          COUNT(*)::int AS calls,
          COALESCE(SUM(estimated_cost), 0) AS cost
        FROM api_usage_logs
        WHERE ${where}
        GROUP BY podcast_slug
        ORDER BY cost DESC
      `, params);
      res.json(rows);
    } catch (err) {
      console.error("[ApiUsage] By-podcast error:", err);
      res.status(500).json({ error: "Failed to fetch usage by podcast" });
    }
  });

  app.get("/api/admin/api-usage/projections", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { rows: [summary] } = await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN estimated_cost ELSE 0 END), 0) AS month_cost,
          COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN estimated_cost ELSE 0 END), 0) AS week_cost,
          COUNT(DISTINCT DATE(created_at)) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS active_days,
          COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::int AS active_users,
          COUNT(DISTINCT episode_slug) FILTER (WHERE episode_slug IS NOT NULL AND created_at >= NOW() - INTERVAL '30 days')::int AS distinct_episodes
        FROM api_usage_logs
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `);
      const activeDays = parseInt(summary.active_days) || 1;
      const monthCost = parseFloat(summary.month_cost) || 0;
      const dailyRate = monthCost / activeDays;
      const projectedMonthly = dailyRate * 30;
      const weekCost = parseFloat(summary.week_cost) || 0;
      const weeklyRate = weekCost / 7;
      const burnRateTrend = activeDays >= 14 ? (weeklyRate > (dailyRate * 0.9) ? "increasing" : weeklyRate < (dailyRate * 0.7) ? "decreasing" : "stable") : "insufficient_data";
      const activeUsers = parseInt(summary.active_users) || 1;
      const costPerUser = monthCost / activeUsers;
      const distinctEpisodes = parseInt(summary.distinct_episodes) || 1;

      res.json({
        monthCost,
        dailyRate,
        projectedMonthly,
        burnRateTrend,
        costPerUser,
        avgCostPerEpisode: monthCost / Math.max(distinctEpisodes, 1),
      });
    } catch (err) {
      console.error("[ApiUsage] Projections error:", err);
      res.status(500).json({ error: "Failed to calculate projections" });
    }
  });

  app.get("/api/admin/api-usage/podcasts-list", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { rows } = await pool.query(`
        SELECT DISTINCT podcast_slug FROM api_usage_logs WHERE podcast_slug IS NOT NULL ORDER BY podcast_slug
      `);
      res.json(rows.map(r => r.podcast_slug));
    } catch (err) {
      console.error("[ApiUsage] Podcasts list error:", err);
      res.status(500).json({ error: "Failed to fetch podcast list" });
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
      const { baseFeedAdSchema } = await import("@shared/schema");
      const sanitizeHtml = (await import("sanitize-html")).default;
      const parsed = baseFeedAdSchema.partial().parse(req.body);
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
      let enriched: any[] = results;
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

      try {
        const episodeRecapAds = enriched.filter((a: any) => a.type === "episode_recap" && a.podcastSlug && a.episodeSlug);
        if (episodeRecapAds.length > 0) {
          const epSlugs = [...new Set(episodeRecapAds.map((a: any) => a.episodeSlug!))];
          const podSlugs = [...new Set(episodeRecapAds.map((a: any) => a.podcastSlug!))];
          const recapResult = await pool.query(
            `SELECT lpr.id, lpr.slug as podcast_slug, lpr.episode_slug, lpr.what_happened, lpr.spotify_episode_url,
                    lpr.youtube_url, lpr.hosts as recap_hosts, lpr.tabloid_sub_headline,
                    pd.spotify_url as pd_spotify_url, pd.total_episodes as pd_total_episodes,
                    pd.year_started as pd_year_started, pd.hosts as pd_hosts
             FROM landing_page_recaps lpr
             LEFT JOIN podcast_directory pd ON pd.slug = lpr.slug
             WHERE lpr.episode_slug = ANY($1) AND lpr.slug = ANY($2)`,
            [epSlugs, podSlugs]
          );
          const recapMap: Record<string, any> = {};
          const recapIds: number[] = [];
          for (const r of recapResult.rows) {
            const key = `${r.podcast_slug}:${r.episode_slug}`;
            recapMap[key] = r;
            recapIds.push(r.id);
          }

          let mentionsMap: Record<number, { people: any[]; companies: any[] }> = {};
          let productsMap: Record<string, any[]> = {};
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

            const productsResult = await pool.query(
              `SELECT podcast_slug, episode_slug, name, company, description, image_url, category, purchase_url
               FROM extracted_products
               WHERE status = 'approved' AND episode_slug = ANY($1) AND podcast_slug = ANY($2)`,
              [epSlugs, podSlugs]
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

          enriched = enriched.map((ad: any) => {
            if (ad.type === "episode_recap" && ad.podcastSlug && ad.episodeSlug) {
              const key = `${ad.podcastSlug}:${ad.episodeSlug}`;
              const recap = recapMap[key];
              if (recap) {
                const mentions = mentionsMap[recap.id] || { people: [], companies: [] };
                const products = productsMap[key] || [];
                return {
                  ...ad,
                  whatHappened: recap.what_happened || null,
                  spotifyEpisodeUrl: recap.spotify_episode_url || null,
                  spotifyUrl: recap.pd_spotify_url || null,
                  youtubeUrl: recap.youtube_url || null,
                  hosts: recap.pd_hosts || recap.recap_hosts || null,
                  totalEpisodes: recap.pd_total_episodes || null,
                  yearStarted: recap.pd_year_started || null,
                  tabloidSubHeadline: recap.tabloid_sub_headline || null,
                  mentions: { people: mentions.people, companies: mentions.companies, products },
                };
              }
            }
            return ad;
          });
        }
      } catch (recapErr) {
        console.log("[FeedAds] Episode recap enrichment skipped:", recapErr);
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

  app.get("/api/categories", async (_req, res) => {
    try {
      const result = await pool.query("SELECT id, name, slug, description, icon, keywords, sort_order FROM podcast_categories ORDER BY sort_order, name");
      res.json(result.rows);
    } catch (err) {
      console.error("[Categories] Public fetch error:", err);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  app.get("/api/admin/categories", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const result = await pool.query("SELECT * FROM podcast_categories ORDER BY sort_order, name");
      res.json(result.rows);
    } catch (err) {
      console.error("[Categories] Fetch error:", err);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  app.post("/api/admin/categories", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const { name, slug, description, icon, keywords, sortOrder } = req.body;
      if (!name || typeof name !== "string") return res.status(400).json({ error: "Name is required" });
      if (!slug || typeof slug !== "string") return res.status(400).json({ error: "Slug is required" });
      if (keywords && !Array.isArray(keywords)) return res.status(400).json({ error: "keywords must be an array" });
      const result = await pool.query(
        `INSERT INTO podcast_categories (name, slug, description, icon, keywords, sort_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [name.trim(), slug.trim(), description || null, icon || null, keywords || [], Number(sortOrder) || 0]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      if (err.code === "23505") return res.status(409).json({ error: "A category with this slug already exists" });
      console.error("[Categories] Create error:", err);
      res.status(500).json({ error: "Failed to create category" });
    }
  });

  app.patch("/api/admin/categories/:id", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid category ID" });
      const { name, slug, description, icon, keywords, sortOrder } = req.body;
      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;
      if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
      if (slug !== undefined) { fields.push(`slug = $${idx++}`); values.push(slug); }
      if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
      if (icon !== undefined) { fields.push(`icon = $${idx++}`); values.push(icon); }
      if (keywords !== undefined) { fields.push(`keywords = $${idx++}`); values.push(keywords); }
      if (sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(sortOrder); }
      fields.push(`updated_at = NOW()`);
      values.push(id);
      const result = await pool.query(
        `UPDATE podcast_categories SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
        values
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Category not found" });
      res.json(result.rows[0]);
    } catch (err: any) {
      if (err.code === "23505") return res.status(409).json({ error: "A category with this slug already exists" });
      console.error("[Categories] Update error:", err);
      res.status(500).json({ error: "Failed to update category" });
    }
  });

  app.delete("/api/admin/categories/:id", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "Not authenticated as admin" });
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid category ID" });
      const result = await pool.query("DELETE FROM podcast_categories WHERE id = $1", [id]);
      if (result.rowCount === 0) return res.status(404).json({ error: "Category not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("[Categories] Delete error:", err);
      res.status(500).json({ error: "Failed to delete category" });
    }
  });

  // ─── Mechanical Turk: YouTube Review ─────────────────────────────
  const MTURK_EPISODE_CUTOFF_DATE = '2026-03-15';

  interface YouTubeSearchItem {
    id: { videoId: string };
    snippet: {
      title: string;
      channelTitle: string;
      thumbnails?: {
        high?: { url: string };
        default?: { url: string };
      };
    };
  }

  interface YouTubeSearchResponse {
    items?: YouTubeSearchItem[];
  }

  interface YouTubeVideoDetail {
    id: string;
    contentDetails?: { duration?: string };
  }

  interface YouTubeVideosResponse {
    items?: YouTubeVideoDetail[];
  }

  const MTURK_ELIGIBLE_EPISODE_WHERE = `
    (youtube_url IS NULL OR spotify_episode_url IS NULL)
    AND publish_date >= '2026-03-15'
    AND published = true
    AND id NOT IN (
      SELECT DISTINCT episode_id FROM youtube_review_log WHERE action IN ('confirmed', 'no_video')
    )
  `;

  app.get("/api/mturk/worker/:token", async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, name, active FROM mturk_workers WHERE token = $1`,
        [req.params.token]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Invalid link" });
      if (!rows[0].active) return res.status(403).json({ error: "This link has been deactivated" });
      res.json({ id: rows[0].id, name: rows[0].name });
    } catch (err) {
      console.error("[MTurk] Worker lookup error:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/api/mturk/next/:token", async (req, res) => {
    try {
      const { rows: workerRows } = await pool.query(
        `SELECT id, active FROM mturk_workers WHERE token = $1`, [req.params.token]
      );
      if (workerRows.length === 0 || !workerRows[0].active) return res.status(403).json({ error: "Invalid or inactive worker" });
      const workerId = workerRows[0].id;

      const qualifiedWhere = MTURK_ELIGIBLE_EPISODE_WHERE
        .replace(/\bspotify_episode_url\b/g, 'lpr.spotify_episode_url')
        .replace(/\byoutube_url\b/g, 'lpr.youtube_url')
        .replace(/\bpublish_date\b/g, 'lpr.publish_date')
        .replace(/\bpublished\b/g, 'lpr.published')
        .replace(/\bid\b(?!\w)/g, 'lpr.id');
      const { rows: episodes } = await pool.query(`
        SELECT lpr.id, lpr.slug, lpr.podcast_name, lpr.episode_title, lpr.episode_slug, lpr.publish_date, lpr.duration,
               lpr.artwork_url, lpr.hosts, lpr.guests,
               lpr.youtube_url AS existing_youtube_url, lpr.spotify_episode_url AS existing_spotify_url,
               pd.youtube_url AS channel_youtube_url, pd.spotify_url AS channel_spotify_url
        FROM landing_page_recaps lpr
        LEFT JOIN podcast_directory pd ON pd.slug = lpr.slug
        WHERE ${qualifiedWhere}
          AND lpr.id NOT IN (
            SELECT episode_id FROM youtube_review_log WHERE worker_id = $1 AND action = 'skipped'
          )
        ORDER BY lpr.publish_date ASC
        LIMIT 1
      `, [workerId]);

      const { rows: progressRows } = await pool.query(`
        SELECT
          (SELECT COUNT(DISTINCT episode_id)::int FROM youtube_review_log WHERE action IN ('confirmed', 'no_video')) AS done,
          (SELECT COUNT(DISTINCT episode_id)::int FROM youtube_review_log WHERE action IN ('confirmed', 'no_video')) +
          (SELECT COUNT(*)::int FROM landing_page_recaps WHERE (youtube_url IS NULL OR spotify_episode_url IS NULL) AND publish_date >= '${MTURK_EPISODE_CUTOFF_DATE}' AND published = true
            AND id NOT IN (SELECT DISTINCT episode_id FROM youtube_review_log WHERE action IN ('confirmed', 'no_video'))
          ) AS total
      `);

      if (episodes.length === 0) return res.json({ episode: null, progress: { done: progressRows[0]?.done || 0, total: progressRows[0]?.total || 0 } });

      const episode = episodes[0];

      let youtubeResult = null;
      try {
        const searchQuery = `${episode.podcast_name} ${episode.episode_title}`;
        const ytApiKey = process.env.YOUTUBE_API_KEY;
        if (ytApiKey) {
          const ytRes = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&maxResults=1&key=${ytApiKey}`
          );
          if (ytRes.ok) {
            const ytData = await ytRes.json() as YouTubeSearchResponse;
            if (ytData.items && ytData.items.length > 0) {
              const item = ytData.items[0];
              const videoId = item.id.videoId;
              youtubeResult = {
                videoId,
                url: `https://www.youtube.com/watch?v=${videoId}`,
                title: item.snippet.title,
                thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
                duration: null as string | null,
              };
              try {
                const detailRes = await fetch(
                  `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoId}&key=${ytApiKey}`
                );
                if (detailRes.ok) {
                  const detailData = await detailRes.json() as YouTubeVideosResponse;
                  if (detailData.items && detailData.items.length > 0) {
                    youtubeResult.duration = detailData.items[0].contentDetails?.duration || null;
                  }
                }
              } catch {}
            }
          }
        }
      } catch (ytErr) {
        console.error("[MTurk] YouTube search error:", ytErr);
      }

      res.json({
        episode: {
          id: episode.id,
          podcastName: episode.podcast_name,
          episodeTitle: episode.episode_title,
          episodeSlug: episode.episode_slug,
          slug: episode.slug,
          publishDate: episode.publish_date,
          duration: episode.duration,
          artworkUrl: episode.artwork_url,
          hosts: episode.hosts,
          guests: episode.guests,
          channelYoutubeUrl: episode.channel_youtube_url || null,
          channelSpotifyUrl: episode.channel_spotify_url || null,
          existingYoutubeUrl: episode.existing_youtube_url || null,
          existingSpotifyUrl: episode.existing_spotify_url || null,
        },
        youtubeResult,
        progress: {
          done: progressRows[0]?.done || 0,
          total: progressRows[0]?.total || 0,
        },
      });
    } catch (err) {
      console.error("[MTurk] Next episode error:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/mturk/submit/:token", async (req, res) => {
    try {
      const { rows: workerRows } = await pool.query(
        `SELECT id, active FROM mturk_workers WHERE token = $1`, [req.params.token]
      );
      if (workerRows.length === 0 || !workerRows[0].active) return res.status(403).json({ error: "Invalid or inactive worker" });
      const workerId = workerRows[0].id;

      const { episodeId, action, youtubeUrl, spotifyUrl } = req.body;
      if (!episodeId || !action) return res.status(400).json({ error: "Missing episodeId or action" });
      if (!["confirmed", "skipped", "no_video"].includes(action)) return res.status(400).json({ error: "Invalid action" });

      const { rows: episodeRows } = await pool.query(
        `SELECT id, youtube_url, spotify_episode_url FROM landing_page_recaps WHERE id = $1 AND published = true AND publish_date >= $2 AND (youtube_url IS NULL OR spotify_episode_url IS NULL)`,
        [episodeId, MTURK_EPISODE_CUTOFF_DATE]
      );
      if (episodeRows.length === 0) return res.status(400).json({ error: "Episode not found or not eligible" });

      const { rows: alreadyFinalized } = await pool.query(
        `SELECT 1 FROM youtube_review_log WHERE episode_id = $1 AND action IN ('confirmed', 'no_video') LIMIT 1`,
        [episodeId]
      );
      if (alreadyFinalized.length > 0) return res.status(400).json({ error: "Episode already finalized" });

      let normalizedYoutubeUrl: string | null = null;
      let normalizedSpotifyUrl: string | null = null;

      if (action === "confirmed") {
        if (youtubeUrl && typeof youtubeUrl === "string") {
          const ytUrlMatch = youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
          if (!ytUrlMatch) return res.status(400).json({ error: "Invalid YouTube URL format" });
          normalizedYoutubeUrl = `https://www.youtube.com/watch?v=${ytUrlMatch[1]}`;
        }

        if (spotifyUrl && typeof spotifyUrl === "string") {
          const spotifyMatch = spotifyUrl.match(/open\.spotify\.com\/episode\/([a-zA-Z0-9]+)/);
          if (!spotifyMatch) return res.status(400).json({ error: "Invalid Spotify URL format. Must be an open.spotify.com/episode/ URL" });
          normalizedSpotifyUrl = `https://open.spotify.com/episode/${spotifyMatch[1]}`;
        }

        if (!normalizedYoutubeUrl && !normalizedSpotifyUrl) {
          return res.status(400).json({ error: "At least one URL (YouTube or Spotify) is required for confirmation" });
        }

        if (normalizedYoutubeUrl) {
          await pool.query(
            `UPDATE landing_page_recaps SET youtube_url = $1 WHERE id = $2 AND youtube_url IS NULL`,
            [normalizedYoutubeUrl, episodeId]
          );
        }

        if (normalizedSpotifyUrl) {
          await pool.query(
            `UPDATE landing_page_recaps SET spotify_episode_url = $1 WHERE id = $2 AND spotify_episode_url IS NULL`,
            [normalizedSpotifyUrl, episodeId]
          );
        }
      }

      await pool.query(
        `INSERT INTO youtube_review_log (episode_id, worker_id, action, youtube_url, spotify_url) VALUES ($1, $2, $3, $4, $5)`,
        [episodeId, workerId, action, normalizedYoutubeUrl, normalizedSpotifyUrl]
      );

      res.json({ ok: true });
    } catch (err) {
      console.error("[MTurk] Submit error:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/api/mturk/youtube-search", async (req, res) => {
    try {
      const token = req.query.token as string;
      if (token) {
        const { rows } = await pool.query(`SELECT id, active FROM mturk_workers WHERE token = $1`, [token]);
        if (rows.length === 0 || !rows[0].active) return res.status(403).json({ error: "Invalid or inactive worker" });
      } else {
        if (!req.session?.isAdmin) return res.status(401).json({ error: "Authentication required" });
      }
      const query = req.query.q as string;
      if (!query) return res.status(400).json({ error: "Missing query" });
      const ytApiKey = process.env.YOUTUBE_API_KEY;
      if (!ytApiKey) return res.status(500).json({ error: "YouTube API key not configured" });

      const ytRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=5&key=${ytApiKey}`
      );
      if (!ytRes.ok) return res.status(500).json({ error: "YouTube API error" });
      const ytData = await ytRes.json() as YouTubeSearchResponse;
      const items = ytData.items || [];
      let durations: Record<string, string | null> = {};
      if (items.length > 0) {
        try {
          const videoIds = items.map((i) => i.id.videoId).join(",");
          const detailRes = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds}&key=${ytApiKey}`
          );
          if (detailRes.ok) {
            const detailData = await detailRes.json() as YouTubeVideosResponse;
            for (const v of (detailData.items || [])) {
              durations[v.id] = v.contentDetails?.duration || null;
            }
          }
        } catch {}
      }
      const results = items.map((item) => ({
        videoId: item.id.videoId,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
        channelTitle: item.snippet.channelTitle,
        duration: durations[item.id.videoId] || null,
      }));
      res.json({ results });
    } catch (err) {
      console.error("[MTurk] YouTube search error:", err);
      res.status(500).json({ error: "Search failed" });
    }
  });

  // ─── Admin: Mechanical Turk Workers ──────────────────────────────
  app.get("/api/admin/mturk/workers", async (req, res) => {
    if (!req.session?.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { rows } = await pool.query(`
        SELECT w.*,
          COALESCE(s.total_reviewed, 0) AS total_reviewed,
          COALESCE(s.confirmed, 0) AS confirmed,
          COALESCE(s.skipped, 0) AS skipped,
          COALESCE(s.no_video, 0) AS no_video,
          s.last_active
        FROM mturk_workers w
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS total_reviewed,
            COUNT(*) FILTER (WHERE action = 'confirmed')::int AS confirmed,
            COUNT(*) FILTER (WHERE action = 'skipped')::int AS skipped,
            COUNT(*) FILTER (WHERE action = 'no_video')::int AS no_video,
            MAX(created_at) AS last_active
          FROM youtube_review_log WHERE worker_id = w.id
        ) s ON true
        ORDER BY w.created_at DESC
      `);
      res.json({ workers: rows });
    } catch (err) {
      console.error("[MTurk Admin] List workers error:", err);
      res.status(500).json({ error: "Failed to load workers" });
    }
  });

  app.post("/api/admin/mturk/workers", async (req, res) => {
    if (!req.session?.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { name } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) return res.status(400).json({ error: "Name is required" });
      const token = crypto.randomBytes(16).toString("hex");
      const { rows } = await pool.query(
        `INSERT INTO mturk_workers (name, token) VALUES ($1, $2) RETURNING *`,
        [name.trim(), token]
      );
      res.json({ worker: rows[0] });
    } catch (err) {
      console.error("[MTurk Admin] Create worker error:", err);
      res.status(500).json({ error: "Failed to create worker" });
    }
  });

  app.patch("/api/admin/mturk/workers/:id", async (req, res) => {
    if (!req.session?.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { active } = req.body;
      const { rows } = await pool.query(
        `UPDATE mturk_workers SET active = $1 WHERE id = $2 RETURNING *`,
        [active, req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Worker not found" });
      res.json({ worker: rows[0] });
    } catch (err) {
      console.error("[MTurk Admin] Update worker error:", err);
      res.status(500).json({ error: "Failed to update worker" });
    }
  });

  app.delete("/api/admin/mturk/workers/:id", async (req, res) => {
    if (!req.session?.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      await pool.query(`DELETE FROM mturk_workers WHERE id = $1`, [req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      console.error("[MTurk Admin] Delete worker error:", err);
      res.status(500).json({ error: "Failed to delete worker" });
    }
  });

  app.get("/api/admin/mturk/stats", async (req, res) => {
    if (!req.session?.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { rows } = await pool.query(`
        SELECT
          (SELECT COUNT(DISTINCT episode_id)::int FROM youtube_review_log WHERE action IN ('confirmed', 'no_video')) +
          (SELECT COUNT(*)::int FROM landing_page_recaps WHERE (youtube_url IS NULL OR spotify_episode_url IS NULL) AND publish_date >= '${MTURK_EPISODE_CUTOFF_DATE}' AND published = true
            AND id NOT IN (SELECT DISTINCT episode_id FROM youtube_review_log WHERE action IN ('confirmed', 'no_video'))
          ) AS total_episodes,
          (SELECT COUNT(DISTINCT episode_id)::int FROM youtube_review_log WHERE action = 'confirmed') AS confirmed,
          (SELECT COUNT(DISTINCT episode_id)::int FROM youtube_review_log WHERE action = 'skipped') AS skipped,
          (SELECT COUNT(DISTINCT episode_id)::int FROM youtube_review_log WHERE action = 'no_video') AS no_video,
          (SELECT COUNT(DISTINCT episode_id)::int FROM youtube_review_log WHERE action IN ('confirmed', 'no_video')) AS finalized
      `);
      res.json(rows[0]);
    } catch (err) {
      console.error("[MTurk Admin] Stats error:", err);
      res.status(500).json({ error: "Failed to load stats" });
    }
  });

  try {
    const needsFixWithId = await pool.query(
      `SELECT slug, itunes_id, name, artwork_url FROM podcast_directory
       WHERE slug IS NOT NULL AND itunes_id IS NOT NULL
       AND ((artwork_url IS NULL OR artwork_url = '') OR name = slug)`
    );
    const needsFixNoId = await pool.query(
      `SELECT slug, name, artwork_url FROM podcast_directory
       WHERE slug IS NOT NULL AND (itunes_id IS NULL OR itunes_id = '')
       AND ((artwork_url IS NULL OR artwork_url = '') OR name = slug)`
    );
    const totalNeedsFix = needsFixWithId.rows.length + needsFixNoId.rows.length;
    if (totalNeedsFix > 0) {
      console.log(`[DirectoryBackfill] Found ${totalNeedsFix} podcasts needing fix (${needsFixWithId.rows.length} with iTunes ID, ${needsFixNoId.rows.length} without)`);
      let fixed = 0;

      if (needsFixWithId.rows.length > 0) {
        const ids = needsFixWithId.rows.map((r: any) => r.itunes_id);
        for (let i = 0; i < ids.length; i += 50) {
          try {
            const resp = await fetch(`https://itunes.apple.com/lookup?id=${ids.slice(i, i + 50).join(",")}`);
            const data = await resp.json();
            for (const r of (data.results || [])) {
              const itunesIdStr = String(r.collectionId);
              const row = needsFixWithId.rows.find((x: any) => x.itunes_id === itunesIdStr);
              if (!row) continue;
              const sets: string[] = [];
              const params: any[] = [];
              const missingArt = !row.artwork_url || row.artwork_url === '';
              const slugName = row.name === row.slug;
              if (missingArt) {
                const art = (r.artworkUrl600 || r.artworkUrl100 || "").replace(/\d+x\d+bb/, "1200x1200bb");
                if (art) { params.push(art); sets.push(`artwork_url = $${params.length}`); }
              }
              if (slugName && r.collectionName) {
                params.push(r.collectionName);
                sets.push(`name = $${params.length}`);
              }
              if (sets.length > 0) {
                params.push(itunesIdStr);
                await pool.query(`UPDATE podcast_directory SET ${sets.join(', ')} WHERE itunes_id = $${params.length}`, params);
                fixed++;
              }
            }
          } catch (e: any) { console.warn(`[DirectoryBackfill] Batch lookup failed:`, e.message); }
          if (i + 50 < ids.length) await new Promise(r => setTimeout(r, 1000));
        }
      }

      const ITUNES_OVERRIDES: Record<string, string> = {
        'information-411': '1035041995',
        'abc-world-news-this-week': '91959525',
      };

      for (const row of needsFixNoId.rows) {
        try {
          let match: any = null;
          const overrideId = ITUNES_OVERRIDES[row.slug];
          if (overrideId) {
            const resp = await fetch(`https://itunes.apple.com/lookup?id=${overrideId}`);
            const data = await resp.json();
            match = (data.results || [])[0] || null;
          } else {
            const searchTerm = row.slug.replace(/-/g, ' ');
            const resp = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&media=podcast&limit=5`);
            const data = await resp.json();
            const results = data.results || [];
            match = results.find((r: any) => {
              const feedSlug = (r.collectionName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
              const feedNorm = feedSlug.replace(/-/g, '');
              const slugNorm = row.slug.replace(/-/g, '');
              return feedSlug === row.slug || feedNorm === slugNorm || feedSlug.includes(row.slug) || row.slug.includes(feedSlug);
            }) || null;
          }
          if (match) {
            const sets: string[] = [];
            const params: any[] = [];
            const itunesId = String(match.collectionId);
            params.push(itunesId);
            sets.push(`itunes_id = $${params.length}`);
            const missingArt = !row.artwork_url || row.artwork_url === '';
            if (missingArt) {
              const art = (match.artworkUrl600 || match.artworkUrl100 || "").replace(/\d+x\d+bb/, "1200x1200bb");
              if (art) { params.push(art); sets.push(`artwork_url = $${params.length}`); }
            }
            if (row.name === row.slug && match.collectionName) {
              params.push(match.collectionName);
              sets.push(`name = $${params.length}`);
            }
            params.push(row.slug);
            await pool.query(`UPDATE podcast_directory SET ${sets.join(', ')} WHERE slug = $${params.length}`, params);
            fixed++;
          }
          await new Promise(r => setTimeout(r, 300));
        } catch (e: any) { console.warn(`[DirectoryBackfill] Search failed for ${row.slug}:`, e.message); }
      }

      console.log(`[DirectoryBackfill] Fixed ${fixed}/${totalNeedsFix} podcasts`);
    }
  } catch (err) {
    console.warn("[DirectoryBackfill] skipped:", err);
  }

  try {
    const YOUTUBE_URL_FIXES: Record<string, string> = {
      "marieforleo": "youtube.com/@marieforleo",
      "wecandohardthings": "youtube.com/@WeCanDoHardThingsShow",
      "areallygoodcry": "youtube.com/@AReallyGoodCry",
      "deargabby": "youtube.com/@GabbyBernstein",
      "almost30": "youtube.com/@Almost30Podcast",
      "gooppodcast": "youtube.com/@goop",
      "goodhang": "youtube.com/@Good-Hang-with-Amy-Poehler",
      "great-chat": "youtube.com/@joshsmithsgreatchatshow",
      "earnyourhappy": "youtube.com/@LoriHarder",
      "reuters-world-news": "youtube.com/@Reuters",
      "associated-press": "youtube.com/@AssociatedPress",
      "news-agents": "youtube.com/@thenewsagents",
      "real-eisman-playbook": "youtube.com/@RealEismanPlaybook",
      "accidental-tech-podcast": "youtube.com/@atpfm",
      "ai-for-humans": "youtube.com/@AIForHumansShow",
      "no-bullshit-leadership": "youtube.com/@YourCEOMentor",
      "memo-by-howard-marks": "youtube.com/@OaktreeCapital",
    };
    const slugs = Object.keys(YOUTUBE_URL_FIXES);
    const missingYT = await pool.query(
      `SELECT slug FROM podcast_directory WHERE slug = ANY($1) AND (youtube_url IS NULL OR youtube_url = '')`,
      [slugs]
    );
    if (missingYT.rows.length > 0) {
      for (const row of missingYT.rows) {
        const url = YOUTUBE_URL_FIXES[row.slug];
        if (url) {
          await pool.query(`UPDATE podcast_directory SET youtube_url = $1 WHERE slug = $2`, [url, row.slug]);
        }
      }
      console.log(`[YouTubeBackfill] Fixed YouTube URLs for ${missingYT.rows.length} podcasts`);
    }
  } catch (err) {
    console.warn("[YouTubeBackfill] skipped:", err);
  }

  const podcastSlugCache = new DataCache<Set<string>>("podcastSlugs", 5 * 60 * 1000);

  async function getKnownPodcastSlugs(): Promise<Set<string>> {
    const cached = podcastSlugCache.get();
    if (cached) return cached;
    try {
      const { rows } = await pool.query(`SELECT slug FROM podcast_directory WHERE slug IS NOT NULL`);
      const slugSet = new Set<string>(rows.map((r: any) => (r.slug as string).toLowerCase()));
      podcastSlugCache.set(slugSet);
      return slugSet;
    } catch (err) {
      console.error("[PodcastSlugRedirect] Failed to fetch slugs:", err);
      return new Set<string>();
    }
  }

  const RESERVED_TOP_LEVEL = new Set([
    "api", "admin", "login", "register", "dashboard", "settings", "podcasts",
    "shop", "people", "companies", "insights", "trends", "pod-squad", "about",
    "contact", "enterprise", "privacy", "terms", "leaderboard", "get-started",
    "verify-email", "topics", "industry", "role", "interest", "lp", "sitemap.xml",
    "robots.txt", "favicon.ico", "assets", "public", "static",
  ]);

  app.use(async (req, res, next) => {
    if (req.method !== "GET") return next();
    const pathSegments = req.path.split("/").filter(Boolean);
    if (pathSegments.length === 0 || pathSegments.length > 2) return next();
    const firstSegment = pathSegments[0].toLowerCase();
    if (RESERVED_TOP_LEVEL.has(firstSegment)) return next();
    if (firstSegment.includes(".")) return next();

    const slugs = await getKnownPodcastSlugs();
    if (slugs.has(firstSegment)) {
      const newPath = `/podcasts/${pathSegments.join("/")}`;
      const qs = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
      return res.redirect(301, newPath + qs);
    }
    next();
  });

  app.post("/api/admin/fix-pending-email-links", async (req, res) => {
    if (!req.session?.isAdmin) return res.status(401).json({ message: "Unauthorized" });
    try {
      const slugs = await getKnownPodcastSlugs();
      if (slugs.size === 0) return res.json({ fixed: 0, scanned: 0, message: "No podcast slugs found" });

      const { rows: pendingRows } = await pool.query(
        `SELECT id, email_html FROM pending_emails WHERE status = 'pending' AND email_html IS NOT NULL`
      );

      const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      let fixedCount = 0;
      for (const row of pendingRows) {
        let html = row.email_html;
        let changed = false;
        for (const slug of slugs) {
          const pattern = new RegExp(`(https?://(?:www\\.)?podrise\\.com)/${escapeRegExp(slug)}/`, "g");
          const replaced = html.replace(pattern, `$1/podcasts/${slug}/`);
          if (replaced !== html) {
            html = replaced;
            changed = true;
          }
        }
        if (changed) {
          await pool.query(`UPDATE pending_emails SET email_html = $1 WHERE id = $2`, [html, row.id]);
          fixedCount++;
        }
      }

      res.json({ fixed: fixedCount, scanned: pendingRows.length });
    } catch (err: any) {
      console.error("[FixPendingEmailLinks] Error:", err);
      res.status(500).json({ message: "Failed to fix pending email links" });
    }
  });

  setTimeout(async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mturk_workers (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          token TEXT NOT NULL UNIQUE,
          active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS youtube_review_log (
          id SERIAL PRIMARY KEY,
          episode_id INTEGER NOT NULL,
          worker_id INTEGER NOT NULL,
          action TEXT NOT NULL,
          youtube_url TEXT,
          spotify_url TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );
        ALTER TABLE youtube_review_log ADD COLUMN IF NOT EXISTS spotify_url TEXT;
      `);
      console.log("[MTurk] Tables ensured");
    } catch (err) {
      console.error("[MTurk] Table creation failed:", err);
    }

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
        { title: "Pod Shop & Affiliates", category: "Pod Shop & Affiliates", body: "PodRise surfaces products, books, and tools that are mentioned or recommended across podcast episodes. When you see a product link on PodRise, some of those links may be affiliate links.\n\nWhat does that mean?\n- If you click a product link and make a purchase, PodRise may earn a small commission at no extra cost to you.\n- This helps support PodRise and keep the platform running.\n- Affiliate relationships never influence which products are shown — PodRise surfaces what's actually discussed in episodes.\n\nFor full details, visit the disclosure page on PodRise. Transparency is important to us.", sortOrder: 10 },
        { title: "Dark Mode", category: "Display & Preferences", body: "PodRise supports both light and dark mode. To switch:\n\n1. Go to Settings.\n2. Under the \"Display\" section, you'll see Light and Dark toggle buttons.\n3. Click your preference.\n\nYour choice is saved and will persist across sessions. Night owls, rejoice.", sortOrder: 11 },
        { title: "Language Settings", category: "Display & Preferences", body: "You can set your preferred language in PodRise:\n\n1. Go to Settings.\n2. Under Account Settings, find \"Language.\"\n3. Select your preferred language from the dropdown.\n\nPodRise currently supports English, Spanish, French, German, Portuguese, Japanese, Korean, Chinese, Hindi, and Arabic.", sortOrder: 12 },
        { title: "Account Deletion", category: "Account", body: "If you want to delete your PodRise account:\n\n1. Go to Settings.\n2. Look for the account deletion option.\n3. Confirm the deletion.\n\nPlease note: Account deletion is permanent. All your data — including your followed podcasts, saved episodes, email preferences, and profile information — will be permanently removed. This action cannot be undone.\n\nIf you're having issues and considering deleting your account, we'd love to help first. Reach out to hello@podrise.com before you go.", sortOrder: 13 },
        { title: "Account Management", category: "Account", body: "From the Settings page, you can manage your account:\n\n- **Email**: Update your email address in the Account section.\n- **Display Name**: Set how your name appears.\n- **Birthday, Gender, Location**: Optional profile details you can add or update.\n- **Log out**: Scroll to the bottom of Settings and click \"Log out.\"\n\nAll changes are saved immediately when you click Save.", sortOrder: 14 },
        { title: "Subscriptions & Pricing", category: "Subscriptions & Pricing", body: "PodRise is free to use. You can follow as many podcasts as you want at no cost — no limits, no trial periods. All features are available to all users.", sortOrder: 15 },
        { title: "Troubleshooting — Not Receiving Emails", category: "Troubleshooting", body: "If you're not receiving your daily recap emails:\n\n1. Check your spam/junk folder first. Sometimes email providers are overzealous.\n2. If you find PodRise emails in spam, mark them as \"not spam\" to train your email provider.\n3. Verify your email address is correct in Settings.\n4. Make sure you haven't set a \"Pause emails until\" date in Settings.\n5. Remember: if none of your followed podcasts released new episodes yesterday, no email is sent — that's by design.\n\nStill having issues? Contact hello@podrise.com and we'll sort it out.", sortOrder: 16 },
        { title: "Data & Privacy", category: "Data & Privacy", body: "PodRise takes your privacy seriously:\n\n- We only collect your email address and podcast preferences.\n- Your data is never sold to third parties.\n- You can delete your account and all associated data at any time from Settings.", sortOrder: 17 },
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
      const { rows: catCount } = await pool.query("SELECT COUNT(*)::int AS count FROM podcast_categories");
      if (catCount[0].count === 0) {
        console.log("[Seed] No podcast categories found — seeding categories...");
        const { SEED_CATEGORIES } = await import("./seedCategories");
        for (const c of SEED_CATEGORIES) {
          await pool.query(
            `INSERT INTO podcast_categories (name, slug, description, icon, keywords, sort_order) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (slug) DO NOTHING`,
            [c.name, c.slug, c.description, c.icon, c.keywords, c.sortOrder]
          );
        }
        console.log(`[Seed] Seeded ${SEED_CATEGORIES.length} podcast categories`);
      }
    } catch (err) {
      console.error("[Seed] Failed to seed podcast categories:", err);
    }

    // Cache warming now deferred to after server is ready — see warmDirectoryCaches()


    try {
      await storage.seedDefaultFeatureFlags();
      console.log("[FeatureFlags] Default flags seeded");
    } catch (err) {
      console.error("[FeatureFlags] Seed failed:", err);
    }

    try {
      await pool.query(
        `UPDATE backfill_jobs SET status = 'failed', error_message = 'Server restarted while job was running' WHERE status = 'running'`
      );
      console.log("[Backfill] Marked stale running jobs as failed on startup");
    } catch (err) {
      console.error("[Backfill] Failed to mark stale jobs:", err);
    }
  }, 5000);

  startSitemapPeriodicRefresh();

  void buildSitemap().then(() => console.log("[Sitemap] Initial cache warm-up complete")).catch(err => console.error("[Sitemap] Initial warm-up failed:", err));

  return httpServer;
}
