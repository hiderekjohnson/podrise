import type { Express } from "express";
import crypto from "crypto";
import { z } from "zod";
import { storage } from "./storage";
import { pool } from "./db";
import { generateAccessToken, generateRefreshTokenString, hashRefreshToken, getRefreshTokenExpiry, authenticateRequest, getAuthUserId } from "./jwt";
import { getUncachableResendClient } from "./resendClient";

const MOBILE_API_VERSION = "1.0.0";
const MIN_SUPPORTED_APP_VERSION = "1.0.0";

export function registerMobileRoutes(app: Express) {
  app.get("/api/mobile/status", (_req, res) => {
    res.json({
      status: "ok",
      apiVersion: MOBILE_API_VERSION,
      minAppVersion: MIN_SUPPORTED_APP_VERSION,
      serverTime: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  app.post("/api/mobile/auth/register", async (req, res) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        podcasts: z.array(z.string()).optional().default([]),
        deliveryTime: z.string().regex(/^\d{2}:\d{2}$/).optional().default("07:00"),
        deliveryTimezone: z.string().optional().default("America/New_York"),
        referralCode: z.string().optional(),
      });
      const input = schema.parse(req.body);

      const existing = await storage.getUserByEmail(input.email);
      if (existing) {
        return res.status(400).json({
          message: "An account with this email already exists. Please log in instead.",
        });
      }

      const user = await storage.createUser(input);

      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || null;
      const ua = req.headers["user-agent"] || null;
      pool.query(
        `UPDATE users SET signup_source = $1, ip_address = $2, user_agent = $3, device_type = $4 WHERE id = $5`,
        ["mobile_app", ip, ua, "mobile", user.id]
      ).catch(e => console.error("[MobileAuth] Signup meta failed:", e));

      if (input.referralCode) {
        try {
          const referrer = await storage.getUserByReferralCode(input.referralCode);
          if (referrer && referrer.id !== user.id) {
            await pool.query(`UPDATE users SET referred_by = $1 WHERE id = $2`, [referrer.id, user.id]);
            await storage.createReferral(referrer.id, user.id);
            console.log(`[MobileReferral] User ${user.id} referred by ${referrer.id} (code: ${input.referralCode})`);
          }
        } catch (e) {
          console.error("[MobileReferral] Failed to record referral:", e);
        }
      }

      const accessToken = generateAccessToken(user.id);
      const refreshTokenStr = generateRefreshTokenString();
      await storage.createRefreshToken(user.id, hashRefreshToken(refreshTokenStr), getRefreshTokenExpiry());

      res.status(201).json({
        user,
        accessToken,
        refreshToken: refreshTokenStr,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[MobileAuth] Register error:", err);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/mobile/auth/login", async (req, res) => {
    try {
      const schema = z.object({ email: z.string().email() });
      const { email } = schema.parse(req.body);

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.json({ message: "If an account exists, a magic link has been sent." });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await storage.createMagicLink(user.email, token, expiresAt);

      const trustedOrigin = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
      const magicUrl = `${trustedOrigin}/api/mobile/auth/magic?token=${token}`;

      const { client, fromEmail } = await getUncachableResendClient();
      await client.emails.send({
        from: `PodRise <${fromEmail}>`,
        to: user.email,
        subject: "Log in to PodRise",
        headers: { "X-Entity-Ref-ID": crypto.randomUUID() },
        html: `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#f3f4f6;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
<div style="background:linear-gradient(135deg,#1d4ed8,#2563eb);padding:32px 24px;text-align:center;">
<h1 style="color:#fff;font-size:24px;font-weight:800;margin:0;">PodRise</h1>
</div>
<div style="padding:32px 28px;text-align:center;">
<h2 style="color:#1a1a1a;font-size:20px;font-weight:700;margin:0 0 12px;">Log in to PodRise</h2>
<p style="color:#6b7280;font-size:15px;line-height:1.6;margin:0 0 24px;">Tap the button below to log in from your iPhone. This link expires in 15 minutes.</p>
<a href="${magicUrl}" style="display:inline-block;padding:14px 32px;background:#2563eb;color:#fff;font-size:16px;font-weight:700;text-decoration:none;border-radius:10px;">Log in to PodRise</a>
<p style="color:#9ca3af;font-size:12px;margin:24px 0 0;">If you didn't request this, you can safely ignore this email.</p>
</div>
</div>
</body></html>`,
      });

      res.json({ message: "If an account exists, a magic link has been sent." });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[MobileAuth] Login error:", err);
      res.status(500).json({ message: "Failed to send login email" });
    }
  });

  app.get("/api/mobile/auth/magic", async (req, res) => {
    const token = req.query.token as string;
    if (!token) {
      return res.status(400).json({ message: "Missing token" });
    }

    const magicLink = await storage.getMagicLinkByToken(token);
    if (!magicLink) {
      return res.status(400).json({ message: "Invalid or expired magic link" });
    }

    const user = await storage.getUserByEmail(magicLink.email);
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    await storage.markMagicLinkUsed(magicLink.id);

    if (!user.emailVerified) {
      await pool.query(`UPDATE users SET email_verified = true WHERE id = $1`, [user.id]);
      storage.verifyReferral(user.id).then(ref => {
        if (ref) console.log(`[MobileReferral] Verified referral for user ${user.id}, referrer ${ref.referrerId}`);
      }).catch(e => console.error("[MobileReferral] Verify error:", e));
    }

    const accessToken = generateAccessToken(user.id);
    const refreshTokenStr = generateRefreshTokenString();
    await storage.createRefreshToken(user.id, hashRefreshToken(refreshTokenStr), getRefreshTokenExpiry());

    res.json({
      user,
      accessToken,
      refreshToken: refreshTokenStr,
    });
  });

  app.post("/api/mobile/auth/google", async (req, res) => {
    try {
      const schema = z.object({ idToken: z.string() });
      const { idToken } = schema.parse(req.body);

      const googlePayload = await verifyGoogleIdToken(idToken);
      if (!googlePayload || !googlePayload.email) {
        return res.status(401).json({ message: "Invalid Google ID token" });
      }

      let user = await storage.getUserByEmail(googlePayload.email);

      if (user) {
        if (!user.googleId) {
          await pool.query(`UPDATE users SET google_id = $1 WHERE id = $2`, [googlePayload.sub, user.id]);
        }
        if (!user.emailVerified) {
          await pool.query(`UPDATE users SET email_verified = true WHERE id = $1`, [user.id]);
          storage.verifyReferral(user.id).then(ref => {
            if (ref) console.log(`[MobileReferral] Verified referral for user ${user!.id}, referrer ${ref.referrerId}`);
          }).catch(e => console.error("[MobileReferral] Verify error:", e));
        }
      } else {
        user = await storage.createUser({
          email: googlePayload.email,
          podcasts: [],
          deliveryTime: "07:00",
          deliveryTimezone: "America/New_York",
        });
        await pool.query(
          `UPDATE users SET google_id = $1, email_verified = true, signup_source = $2, device_type = $3 WHERE id = $4`,
          [googlePayload.sub, "mobile_google_oauth", "mobile", user.id]
        );
        storage.verifyReferral(user.id).then(ref => {
          if (ref) console.log(`[MobileReferral] Verified referral for user ${user!.id}, referrer ${ref.referrerId}`);
        }).catch(e => console.error("[MobileReferral] Verify error:", e));
      }

      const accessToken = generateAccessToken(user.id);
      const refreshTokenStr = generateRefreshTokenString();
      await storage.createRefreshToken(user.id, hashRefreshToken(refreshTokenStr), getRefreshTokenExpiry());

      res.json({
        user,
        accessToken,
        refreshToken: refreshTokenStr,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[MobileAuth] Google auth error:", err);
      res.status(500).json({ message: "Google authentication failed" });
    }
  });

  app.post("/api/mobile/auth/refresh", async (req, res) => {
    try {
      const schema = z.object({ refreshToken: z.string() });
      const { refreshToken } = schema.parse(req.body);

      const tokenHash = hashRefreshToken(refreshToken);
      const storedToken = await storage.getRefreshToken(tokenHash);
      if (!storedToken) {
        return res.status(401).json({ message: "Invalid or expired refresh token" });
      }

      const user = await storage.getUserById(storedToken.userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      await storage.revokeRefreshToken(tokenHash);

      const accessToken = generateAccessToken(user.id);
      const newRefreshToken = generateRefreshTokenString();
      await storage.createRefreshToken(user.id, hashRefreshToken(newRefreshToken), getRefreshTokenExpiry());

      res.json({
        accessToken,
        refreshToken: newRefreshToken,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[MobileAuth] Refresh error:", err);
      res.status(500).json({ message: "Token refresh failed" });
    }
  });

  app.post("/api/mobile/device-tokens", authenticateRequest, async (req, res) => {
    try {
      const schema = z.object({
        deviceToken: z.string().min(1),
        platform: z.enum(["ios"]).optional().default("ios"),
      });
      const { deviceToken, platform } = schema.parse(req.body);
      const userId = getAuthUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const result = await storage.registerDeviceToken(userId, deviceToken, platform);
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[MobileDeviceToken] Register error:", err);
      res.status(500).json({ message: "Failed to register device token" });
    }
  });

  app.delete("/api/mobile/device-tokens", authenticateRequest, async (req, res) => {
    try {
      const schema = z.object({ deviceToken: z.string().min(1) });
      const { deviceToken } = schema.parse(req.body);
      const userId = getAuthUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      await storage.unregisterDeviceToken(deviceToken, userId);
      res.json({ message: "Device token removed" });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[MobileDeviceToken] Unregister error:", err);
      res.status(500).json({ message: "Failed to unregister device token" });
    }
  });
}

async function verifyGoogleIdToken(idToken: string): Promise<{ email: string; sub: string; name?: string } | null> {
  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    if (!response.ok) return null;
    const data = await response.json() as any;

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && data.aud !== clientId) {
      const iosClientId = process.env.GOOGLE_IOS_CLIENT_ID;
      if (!iosClientId || data.aud !== iosClientId) {
        console.error("[MobileAuth] Google ID token audience mismatch");
        return null;
      }
    }

    return { email: data.email, sub: data.sub, name: data.name };
  } catch (err) {
    console.error("[MobileAuth] Google ID token verification failed:", err);
    return null;
  }
}
