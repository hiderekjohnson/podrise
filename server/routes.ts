import type { Express } from "express";
import type { Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { openai } from "./replit_integrations/image/client";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { searchPodcastByItunesId, getRecentEpisodesWithTranscripts } from "./taddyClient";

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
      const podcastInfos: { name: string; id: string }[] = user.podcasts.map((raw) => {
        try {
          const parsed = JSON.parse(raw);
          return { name: parsed.name || raw, id: parsed.id || raw };
        } catch {
          return { name: raw, id: raw };
        }
      });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
      const yesterdayEnd = new Date(yesterdayStart);
      yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);
      const yesterdayLabel = yesterdayStart.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

      const episodeData: string[] = [];
      let hasAnyEpisodes = false;
      let hasTranscripts = false;
      for (const podcast of podcastInfos) {
        try {
          const lookupUrl = `https://itunes.apple.com/lookup?id=${podcast.id}&media=podcast&entity=podcastEpisode&limit=20&sort=recent`;
          const lookupRes = await fetch(lookupUrl);
          const lookupJson = await lookupRes.json();
          const episodes = (lookupJson.results || [])
            .filter((r: any) => {
              if (r.wrapperType !== "podcastEpisode") return false;
              const releaseDate = new Date(r.releaseDate);
              return releaseDate >= yesterdayStart && releaseDate < yesterdayEnd;
            });

          if (episodes.length > 0) {
            hasAnyEpisodes = true;

            let taddyPodcast: any = null;
            let taddyEpisodes: any[] = [];
            try {
              taddyPodcast = await searchPodcastByItunesId(podcast.id);
              if (taddyPodcast?.uuid) {
                taddyEpisodes = await getRecentEpisodesWithTranscripts(taddyPodcast.uuid, 10);
              }
            } catch (taddyErr) {
              console.warn(`Taddy lookup failed for ${podcast.name}:`, taddyErr);
            }

            const epDetails: string[] = [];
            for (const ep of episodes) {
              const durationMs = ep.trackTimeMillis || 0;
              const durationMin = Math.round(durationMs / 60000);
              const durationStr = durationMin >= 60
                ? `${Math.floor(durationMin / 60)} hr ${durationMin % 60} min`
                : `${durationMin} minutes`;

              const episodeGuid = ep.episodeGuid || `${podcast.id}_${ep.trackId || ep.trackName}`;
              let transcriptText: string | null = null;

              const cached = await storage.getTranscriptByEpisodeGuid(episodeGuid);
              if (cached) {
                transcriptText = cached.transcript;
              } else {
                const taddyMatch = taddyEpisodes.find((te: any) =>
                  te.name?.toLowerCase().trim() === ep.trackName?.toLowerCase().trim()
                );
                if (taddyMatch?.transcript) {
                  transcriptText = taddyMatch.transcript;
                  await storage.saveTranscript({
                    podcastId: podcast.id,
                    episodeGuid,
                    episodeTitle: ep.trackName,
                    transcript: transcriptText,
                  });
                }
              }

              if (transcriptText) {
                hasTranscripts = true;
                const truncated = transcriptText.slice(0, 8000);
                epDetails.push(`- Episode: "${ep.trackName}"\n  Duration: ${durationStr}\n  Transcript (excerpt):\n${truncated}`);
              } else {
                epDetails.push(`- Episode: "${ep.trackName}"\n  Duration: ${durationStr}\n  Description: ${(ep.description || "No description available.").slice(0, 500)}`);
              }
            }
            episodeData.push(`Podcast: ${podcast.name}\n${epDetails.join("\n")}`);
          } else {
            episodeData.push(`Podcast: ${podcast.name}\n- No new episodes released yesterday.`);
          }
        } catch {
          episodeData.push(`**${podcast.name}**\n- Could not fetch episodes.`);
        }
      }

      if (!hasAnyEpisodes) {
        return res.status(400).json({ message: `None of your podcasts released new episodes yesterday (${yesterdayLabel}). Check back tomorrow!` });
      }

      const readingMinutes = user.readingLength || 10;
      const podcastNames = podcastInfos.map((p) => p.name).join(" · ");
      const podcastCount = podcastInfos.length;

      const transcriptNote = hasTranscripts
        ? "Some episodes below include real transcript excerpts — use these for accurate quotes, specific facts, and concrete insights. For episodes with only descriptions, do your best based on the available info."
        : "Note: No full transcripts were available for these episodes, so you are working from episode descriptions only. Do your best to infer specific content.";

      const prompt = `You are PodCap, an AI that writes daily podcast digest emails. Generate a digest for episodes released on ${yesterdayLabel}. The summary should take approximately ${readingMinutes} minutes to read. Only cover podcasts that had new episodes — skip any that didn't.

${transcriptNote}

Source episodes from ${yesterdayLabel}:
${episodeData.join("\n\n")}

You MUST follow this EXACT structure and tone. Write in markdown.

---

## Big Ideas Today

For each episode that had new content, write one punchy one-liner takeaway. Format each as:

🚀 **[One bold sentence summarizing the biggest idea]**
*Source: [Podcast Name]*

(Use relevant emojis: 🚀 🤖 💰 🧠 🔬 💡 📈 🎯 🌍 etc. One per idea.)

---

Then for EACH episode (only ones with new content), write a section like this:

## [PODCAST NAME IN CAPS]

**[Episode Title]**
[Guest Name if available] · [Guest Title if available] · [Duration]

**TL;DR:** [2-3 sentence summary of the core thesis of the episode. Be direct and specific, not vague.]

**[Discussion Label — choose one: "What They Talk About" / "What They Debate" / "What [Host] Focuses On" / "What They Explain"]**
[2-3 sentences describing the dynamic of the conversation. Who pushes back on what? What's the tension? What angle do they explore? Make it feel like you listened.]

**Key Insights:**
- [Specific, concrete insight #1]
- [Specific, concrete insight #2]
- [Specific, concrete insight #3]
- [Specific, concrete insight #4]

> "[A memorable, quotable line from the episode — make it feel real and punchy, the kind of thing someone would repeat at dinner]"

---

## Conversation Ammo

*If you repeat one idea today, make it this:*

**[Topic Tag]** — [A conversational one-liner someone could casually bring up. Written as "Someone argued..." or "Apparently..." or a surprising fact.]

**[Topic Tag]** — [Another one-liner from a different episode]

**[Topic Tag]** — [A third one-liner from a different episode]

---

**That's your PodCap Daily.**

---

IMPORTANT TONE GUIDELINES:
- Write like a sharp, well-read friend catching you up — not like a news anchor or a corporate summary
- Be specific and concrete, never vague. Say "NASA aims to land astronauts on the moon by 2028" not "The episode discussed space exploration"
- The hook quotes should feel real — punchy, conversational, the kind of thing someone actually said
- Key insights should be specific facts or claims, not generic observations
- Conversation Ammo should be things someone could casually say at dinner or in a meeting
- Keep energy high but don't use exclamation marks excessively
- Never say "In this episode" or "The hosts discuss" — just state the ideas directly`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: hasTranscripts ? 4000 : 3000,
        temperature: 0.7,
      });

      const summary = completion.choices[0]?.message?.content || "Unable to generate summary.";
      const recapDateStr = yesterdayStart.toISOString().split("T")[0];

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
