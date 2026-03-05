import type { Express } from "express";
import type { Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { getUncachableResendClient } from "./resendClient";
import { markdownToEmailHtml } from "./emailTemplate";
import { generateRecap } from "./recapGenerator";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    isAdmin?: boolean;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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
      req.session.userId = user.id;
      res.json(user);
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

  app.post(api.auth.logout.path, (req, res) => {
    req.session.destroy(() => {
      res.json({ message: "Logged out" });
    });
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
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
      const yesterdayEnd = new Date(yesterdayStart);
      yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);
      const yesterdayLabel = yesterdayStart.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

      const result = await generateRecap(user, yesterdayStart, yesterdayEnd, yesterdayLabel, yesterdayStart.toISOString().split("T")[0]);
      if (!result) {
        return res.status(400).json({ message: `None of your podcasts released new episodes yesterday (${yesterdayLabel}). Check back tomorrow!` });
      }

      const { summary, dateStr: recapDateStr } = result;

      const recap = await storage.createRecap({
        userId: user.id,
        recapDate: recapDateStr,
        podcasts: user.podcasts,
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

      const emailHtml = markdownToEmailHtml(recap.summary, user.email);
      const { client, fromEmail } = await getUncachableResendClient();

      const result = await client.emails.send({
        from: `PodCap Daily <${fromEmail}>`,
        to: user.email,
        subject: `☕ Your PodCap Daily — ${new Date(recap.recapDate).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`,
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

    if (parsed.data.password !== process.env.ADMIN_PASSWORD) {
      const entry = adminLoginAttempts.get(ip)!;
      entry.count++;
      return res.status(401).json({ message: "Invalid admin password" });
    }

    adminLoginAttempts.delete(ip);
    req.session.isAdmin = true;
    res.json({ message: "Admin authenticated" });
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

  app.post(api.users.update.path, async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const input = api.users.update.input.parse(req.body);
      const updated = await storage.updateUser(req.session.userId, input);
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
