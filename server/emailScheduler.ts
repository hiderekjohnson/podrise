import { storage } from "./storage";
import { getUncachableResendClient } from "./resendClient";
import { markdownToEmailHtml, recapHasContent } from "./emailTemplate";
import { generateRecap, generateRecapFromTranscript, type ParsedEpisode } from "./recapGenerator";
import { searchPodcastByItunesId, getRecentEpisodesWithTranscripts, getEpisodeTranscript, getEpisodeTranscriptSegments } from "./taddyClient";
import { parseRawTaddySegments, parseTranscriptToSegments } from "./transcriptParser";
import { ITUNES_ID_TO_SLUG } from "./podcastLandingMap";

const SCHEDULER_INTERVAL_MS = 60 * 1000;
const ADMIN_NOTIFY_EMAIL = "hiderekjohnson@gmail.com";
const recentlyGenerated = new Set<string>();

async function sendAdminNotification(userEmail: string, subject: string) {
  const { client, fromEmail } = await getUncachableResendClient();
  await client.emails.send({
    from: `PodCap System <${fromEmail}>`,
    to: ADMIN_NOTIFY_EMAIL,
    subject: `⚡ New email pending approval — ${userEmail} (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })} ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })})`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="margin: 0 0 16px; font-size: 18px; color: #1a1a1a;">New Email Pending Approval</h2>
        <div style="background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <p style="margin: 0 0 8px; font-size: 14px; color: #92400E;"><strong>For:</strong> ${userEmail}</p>
          <p style="margin: 0; font-size: 14px; color: #92400E;"><strong>Subject:</strong> ${subject}</p>
        </div>
        <p style="margin: 0 0 16px; font-size: 14px; color: #666;">A new recap email has been generated and is waiting for your review. Please log in to the admin dashboard to preview and approve it.</p>
        <a href="https://podcap.io/admin" style="display: inline-block; background: #2563EB; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600;">Review in Admin Dashboard</a>
      </div>
    `,
  });
  console.log(`[EmailScheduler] Admin notification sent to ${ADMIN_NOTIFY_EMAIL}`);
}

async function updateLandingPageRecaps(userPodcasts: string[], parsedEpisodes: ParsedEpisode[]) {
  const podcastIdMap = new Map<string, string>();
  const podcastNameMap = new Map<string, string>();
  for (const raw of userPodcasts) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.id && parsed.name) {
        podcastIdMap.set(parsed.name.toLowerCase(), parsed.id);
        podcastNameMap.set(parsed.name.toLowerCase(), parsed.name);
      }
    } catch {}
  }

  for (const ep of parsedEpisodes) {
    const epNameLower = (ep.podcastName || "").toLowerCase();
    const itunesId = podcastIdMap.get(epNameLower);
    if (!itunesId) continue;
    const slug = ITUNES_ID_TO_SLUG[itunesId];
    if (!slug) continue;

    await storage.upsertExampleRecap({
      slug,
      podcastName: ep.podcastName,
      itunesId,
      episodeTitle: ep.episodeTitle,
      episodeDate: ep.episodeDate || "",
      episodeDuration: ep.episodeDuration,
      tldl: ep.tldl,
      whatHappened: ep.whatHappened,
      keyInsights: ep.keyInsights,
      quote: ep.quote || null,
      quoteAttribution: ep.quoteAttribution || null,
    });
    console.log(`[EmailScheduler] Updated landing page example recap for ${slug} (${ep.episodeTitle})`);
  }
}

function getUserLocalDate(timezone: string): string {
  try {
    return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
  } catch {
    return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  }
}

function getUserLocalTime(timezone: string): { hours: number; minutes: number } {
  try {
    const now = new Date();
    const formatted = now.toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    const [hours, minutes] = formatted.split(":").map(Number);
    return { hours, minutes };
  } catch {
    return { hours: -1, minutes: -1 };
  }
}

function isDeliveryTime(deliveryTime: string, timezone: string): boolean {
  const parts = deliveryTime.split(":").map(Number);
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return false;
  const [targetHour, targetMinute] = parts;
  const { hours, minutes } = getUserLocalTime(timezone);
  if (hours === -1) return false;
  const targetTotal = targetHour * 60 + targetMinute;
  const currentTotal = hours * 60 + minutes;
  const diff = currentTotal - targetTotal;
  return diff >= 0 && diff <= 5;
}

function getYesterdayInTimezone(timezone: string): { start: Date; end: Date; label: string; dateStr: string } {
  try {
    const nowInTz = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
    const todayLocal = new Date(nowInTz + "T00:00:00");
    const yesterdayLocal = new Date(todayLocal);
    yesterdayLocal.setDate(yesterdayLocal.getDate() - 1);
    const label = yesterdayLocal.toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
    const dateStr = yesterdayLocal.toISOString().split("T")[0];
    return { start: yesterdayLocal, end: todayLocal, label, dateStr };
  } catch {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {
      start, end,
      label: start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
      dateStr: start.toISOString().split("T")[0],
    };
  }
}

function isUserOnVacation(user: any): boolean {
  if (!user.vacationUntil) return false;
  const timezone = user.deliveryTimezone || "America/New_York";
  const userLocalDate = getUserLocalDate(timezone);
  return userLocalDate < user.vacationUntil;
}

async function generateForUser(user: any, force: boolean, recapPrompt?: string): Promise<"generated" | "skipped" | "failed"> {
  if (!user.podcasts || user.podcasts.length === 0 || !user.email) {
    return "skipped";
  }

  if (isUserOnVacation(user)) {
    console.log(`[EmailScheduler] Skipping user ${user.id}: on vacation until ${user.vacationUntil}`);
    return "skipped";
  }

  const timezone = user.deliveryTimezone || "America/New_York";

  try {
    const { start: yesterdayStart, end: yesterdayEnd, label: yesterdayLabel, dateStr } = getYesterdayInTimezone(timezone);

    if (!force) {
      const existing = await storage.getPendingEmailsForUser(user.id, dateStr);
      const activeEmails = existing.filter((e: any) => e.status === "held" || e.status === "pending");
      if (activeEmails.length > 0) {
        console.log(`[EmailScheduler] Skipping user ${user.id}: active pending email already exists for ${dateStr}`);
        return "skipped";
      }
    } else {
      const existing = await storage.getPendingEmailsForUser(user.id, dateStr);
      const heldOnes = existing.filter((e: any) => e.status === "held" || e.status === "pending");
      for (const p of heldOnes) {
        await storage.updatePendingEmailStatus(p.id, "cancelled", "Replaced by forced regeneration");
      }
    }

    console.log(`[EmailScheduler] Generating recap for user ${user.id} (${user.email})...`);

    const result = await generateRecap(user, yesterdayStart, yesterdayEnd, yesterdayLabel, dateStr, "yesterday", recapPrompt);
    if (!result) {
      console.log(`[EmailScheduler] No new episodes for user ${user.id}, skipping.`);
      return "skipped";
    }

    const h2Count = (result.summary.match(/^## /gm) || []).length;
    console.log(`[EmailScheduler] User ${user.id} recap: ${result.summary.length} chars, ${h2Count} h2 sections`);
    if (!recapHasContent(result.summary)) {
      console.warn(`[EmailScheduler] Recap for user ${user.id} has 0 parsed episodes. First 500 chars: ${result.summary.slice(0, 500)}`);
      return "skipped";
    }

    const templateSettings = await storage.getEmailTemplateSettings();
    const emailHtml = markdownToEmailHtml(result.summary, user.email, templateSettings);

    const deliveryTime = user.deliveryTime || "07:00";
    const subject = `☕ Your PodCap Daily Recap — ${new Date().toLocaleDateString("en-US", { timeZone: timezone, weekday: "long", month: "short", day: "numeric" })}`;

    await storage.createRecap({
      userId: user.id,
      recapDate: result.dateStr,
      podcasts: result.recappedPodcasts,
      summary: result.summary,
    });

    await storage.createPendingEmail({
      userId: user.id,
      recipientEmail: user.email,
      podcasts: result.recappedPodcasts,
      recapDate: result.dateStr,
      summary: result.summary,
      emailHtml,
      subject,
      scheduledFor: deliveryTime,
      timezone,
      episodeStats: JSON.stringify(result.episodeStats),
      source: force ? "manual" : "scheduled",
      status: "held",
    });

    console.log(`[EmailScheduler] Email generated and held for review — user ${user.id} (${deliveryTime} ${timezone})`);

    try {
      await updateLandingPageRecaps(user.podcasts, result.parsedEpisodes);
    } catch (lpErr) {
      console.warn(`[EmailScheduler] Failed to update landing page recaps:`, lpErr);
    }

    try {
      await sendAdminNotification(user.email, subject);
    } catch (notifyErr) {
      console.warn(`[EmailScheduler] Failed to send admin notification:`, notifyErr);
    }

    return "generated";
  } catch (err) {
    console.error(`[EmailScheduler] Generation failed for user ${user.id}:`, err);
    return "failed";
  }
}

async function processSchedulerTick() {
  let users: any[];
  try {
    users = await storage.getAllUsers();
  } catch (err) {
    console.error("[EmailScheduler] Failed to fetch users:", err);
    return;
  }

  let recapPrompt: string | undefined;
  try {
    const settings = await storage.getEmailTemplateSettings();
    recapPrompt = settings.recapPrompt || undefined;
  } catch {}

  for (const user of users) {
    if (!user.podcasts || user.podcasts.length === 0 || !user.email) continue;
    if (isUserOnVacation(user)) continue;

    const timezone = user.deliveryTimezone || "America/New_York";
    const deliveryTime = user.deliveryTime || "07:00";
    const { hours, minutes } = getUserLocalTime(timezone);

    if (!isDeliveryTime(deliveryTime, timezone)) continue;

    console.log(`[EmailScheduler] Delivery time match for user ${user.id} (${user.email}): target=${deliveryTime}, current=${hours}:${String(minutes).padStart(2, "0")} in ${timezone}`);

    const cacheKey = `${user.id}_${getUserLocalDate(timezone)}`;
    if (recentlyGenerated.has(cacheKey)) {
      console.log(`[EmailScheduler] Skipping user ${user.id}: already generated this session (cache key: ${cacheKey})`);
      continue;
    }
    recentlyGenerated.add(cacheKey);

    await generateForUser(user, false, recapPrompt);
  }

  if (recentlyGenerated.size > 10000) {
    recentlyGenerated.clear();
  }
}

export async function triggerPregeneration() {
  console.log(`[EmailScheduler] Manual trigger: generating for all users...`);

  let users: any[];
  try {
    users = await storage.getAllUsers();
  } catch (err) {
    console.error("[EmailScheduler] Failed to fetch users:", err);
    return;
  }

  let recapPrompt: string | undefined;
  try {
    const settings = await storage.getEmailTemplateSettings();
    recapPrompt = settings.recapPrompt || undefined;
  } catch {}

  let generated = 0, skipped = 0, failed = 0;
  for (const user of users) {
    const result = await generateForUser(user, true, recapPrompt);
    if (result === "generated") generated++;
    else if (result === "skipped") skipped++;
    else failed++;
  }

  console.log(`[EmailScheduler] Manual generation complete: ${generated} generated, ${skipped} skipped, ${failed} failed`);

  try {
    const cleaned = await storage.clearOldPendingEmails(7);
    if (cleaned > 0) console.log(`[EmailScheduler] Cleaned up ${cleaned} old pending emails`);
  } catch {}
}

export async function sendHeldEmail(pendingId: number): Promise<void> {
  const pendingList = await storage.getPendingEmails("held");
  const pending = pendingList.find((p: any) => p.id === pendingId);
  if (!pending) {
    throw new Error("Email not found or not in held status");
  }

  if (!recapHasContent(pending.summary)) {
    await storage.updatePendingEmailStatus(pending.id, "error", "No episode content in recap");
    throw new Error("Email has no episode content");
  }

  const templateSettings = await storage.getEmailTemplateSettings();
  const freshHtml = markdownToEmailHtml(pending.summary, pending.recipientEmail, templateSettings);

  const baseUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "https://podcap.io";
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
    await storage.updatePendingEmailStatus(pending.id, "error", sendResult.error.message || "Send failed");
    throw new Error(sendResult.error.message || "Send failed");
  }

  console.log(`[EmailScheduler] Held email ${pending.id} sent to ${pending.recipientEmail}, id: ${sendResult.data?.id}`);
  await storage.updatePendingEmailHtml(pending.id, freshHtml);
  await storage.updatePendingEmailStatus(pending.id, "sent");

  await storage.logEmail({
    userId: pending.userId,
    recipientEmail: pending.recipientEmail,
    podcasts: pending.podcasts,
    source: pending.source || "scheduled",
    emailHtml: freshHtml,
  });
}

function slugifyEpisodeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-")
    .slice(0, 8)
    .join("-");
}

function normalizeTitleForMatch(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/^\d+[\.\)\-:\s]+\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[''""]/g, "'")
    .trim();
}

let landingPageRefreshRanToday = "";

export async function refreshLandingPageRecaps(force: boolean = false) {
  const todayKey = new Date().toISOString().split("T")[0];
  if (!force && landingPageRefreshRanToday === todayKey) return;

  console.log(`[LandingRecaps] Starting daily landing page recap refresh...`);

  let landingPodcasts: any[];
  try {
    const allDir = await storage.getPodcastDirectory();
    landingPodcasts = allDir.filter((p: any) => p.hasLandingPage && p.itunesId && p.slug);
  } catch (err) {
    console.error("[LandingRecaps] Failed to fetch podcast directory:", err);
    return;
  }

  console.log(`[LandingRecaps] Processing ${landingPodcasts.length} landing page podcasts...`);
  let newRecaps = 0;
  let skipped = 0;
  let errors = 0;

  for (const podcast of landingPodcasts) {
    try {
      const lookupUrl = `https://itunes.apple.com/lookup?id=${podcast.itunesId}&media=podcast&entity=podcastEpisode&limit=10&sort=recent`;
      const lookupRes = await fetch(lookupUrl);
      const lookupJson = await lookupRes.json();
      const episodes = (lookupJson.results || []).filter((r: any) => r.wrapperType === "podcastEpisode");

      if (episodes.length === 0) {
        skipped++;
        continue;
      }

      let podcastNewRecaps = 0;
      for (const ep of episodes) {
        const epTitle = ep.trackName || "Untitled";
        const epSlug = slugifyEpisodeTitle(epTitle);

        const existingRecap = await storage.getLandingPageRecapBySlug(podcast.slug, epSlug);
        if (existingRecap) {
          skipped++;
          continue;
        }

        const episodeGuid = ep.episodeGuid || `${podcast.itunesId}_${ep.trackId || epTitle}`;
        let transcriptText: string | null = null;

        const cached = await storage.getTranscriptByEpisodeGuid(episodeGuid);
        if (cached) {
          transcriptText = cached.transcript;
        } else {
          const { pool: dbPool } = await import("./db");
          const client = await dbPool.connect();
          try {
            const titleMatch = await client.query(
              `SELECT transcript FROM episode_transcripts WHERE podcast_id = $1 AND episode_title ILIKE $2 LIMIT 1`,
              [podcast.itunesId, epTitle]
            );
            if (titleMatch.rows.length > 0) {
              transcriptText = titleMatch.rows[0].transcript;
            }
          } finally {
            client.release();
          }
        }

        if (!transcriptText) {
          try {
            const taddyPodcast = await searchPodcastByItunesId(podcast.itunesId);
            if (taddyPodcast?.uuid) {
              const taddyEpisodes = await getRecentEpisodesWithTranscripts(taddyPodcast.uuid, 10);
              const itunesNorm = normalizeTitleForMatch(epTitle);
              const taddyMatch = taddyEpisodes.find((te: any) => {
                if (!te.name) return false;
                const taddyNorm = normalizeTitleForMatch(te.name);
                return taddyNorm === itunesNorm || taddyNorm.includes(itunesNorm) || itunesNorm.includes(taddyNorm);
              });
              if (taddyMatch?.uuid) {
                const rawSegments = await getEpisodeTranscriptSegments(taddyMatch.uuid);
                if (rawSegments && rawSegments.length > 0) {
                  const lines: string[] = [];
                  for (const seg of rawSegments) {
                    const speaker = seg.speaker ? `[${seg.speaker}] ` : "";
                    lines.push(`${speaker}${seg.text}`);
                  }
                  transcriptText = lines.join("\n");
                  await storage.saveTranscript({
                    podcastId: podcast.itunesId,
                    episodeGuid,
                    episodeTitle: epTitle,
                    transcript: transcriptText,
                  });
                  try {
                    const parsedSegments = parseRawTaddySegments(rawSegments, podcast.slug, epSlug, episodeGuid);
                    if (parsedSegments.length > 0) {
                      await storage.saveTranscriptSegments(parsedSegments);
                    }
                  } catch (segErr) {
                    console.warn(`[LandingRecaps] Segment parsing failed for ${podcast.name}:`, segErr);
                  }
                }
              }
            }
          } catch (taddyErr) {
            console.warn(`[LandingRecaps] Taddy lookup failed for ${podcast.name}:`, taddyErr);
          }
        }

        if (!transcriptText) {
          skipped++;
          continue;
        }

        try {
          const hasSegs = await storage.hasTranscriptSegments(episodeGuid);
          if (!hasSegs) {
            const segments = parseTranscriptToSegments(transcriptText, podcast.slug, epSlug, episodeGuid);
            if (segments.length > 0) {
              await storage.saveTranscriptSegments(segments);
            }
          }
        } catch (segErr) {
          console.warn(`[LandingRecaps] Backfill segments failed for ${podcast.name}:`, segErr);
        }

        const recap = await generateRecapFromTranscript(transcriptText, podcast.name, epTitle);
        if (!recap) {
          errors++;
          continue;
        }

        const durationMs = ep.trackTimeMillis || 0;
        const durationMin = Math.round(durationMs / 60000);
        const durationStr = durationMin >= 60
          ? `${Math.floor(durationMin / 60)} hr ${durationMin % 60} min`
          : `${durationMin} min`;
        const releaseDate = ep.releaseDate
          ? new Date(ep.releaseDate).toISOString().split("T")[0]
          : todayKey;

        const appleEpisodeUrl = ep.trackViewUrl
          ? ep.trackViewUrl.replace(/&uo=\d+/, "")
          : null;

        await storage.upsertLandingPageRecap({
          slug: podcast.slug,
          itunesId: podcast.itunesId,
          podcastName: podcast.name,
          episodeTitle: recap.episodeTitle,
          episodeSlug: epSlug,
          publishDate: releaseDate,
          duration: durationStr,
          artworkUrl: podcast.artworkUrl || ep.artworkUrl600 || null,
          hosts: podcast.hosts || null,
          tldl: recap.tldl,
          whatHappened: recap.whatHappened,
          keyInsights: recap.keyInsights,
          quote: recap.quote || null,
          quoteAttribution: recap.quoteAttribution || null,
          appleEpisodeUrl: appleEpisodeUrl,
          audioUrl: ep.episodeUrl || null,
          keyTopics: recap.keyTopics || null,
          topQuestions: recap.topQuestions ? JSON.stringify(recap.topQuestions) : null,
        });

        if (podcastNewRecaps === 0) {
          await storage.upsertExampleRecap({
            slug: podcast.slug,
            podcastName: podcast.name,
            itunesId: podcast.itunesId,
            episodeTitle: recap.episodeTitle,
            episodeDate: releaseDate,
            episodeDuration: durationStr,
            tldl: recap.tldl,
            whatHappened: recap.whatHappened,
            keyInsights: recap.keyInsights,
            quote: recap.quote || null,
            quoteAttribution: recap.quoteAttribution || null,
          });
        }

        podcastNewRecaps++;
        newRecaps++;
        console.log(`[LandingRecaps] Generated recap for ${podcast.name} - "${epTitle}"`);
      }
    } catch (err) {
      console.error(`[LandingRecaps] Error processing ${podcast.name}:`, err);
      errors++;
    }
  }

  landingPageRefreshRanToday = todayKey;
  console.log(`[LandingRecaps] Complete: ${newRecaps} new recaps, ${skipped} skipped, ${errors} errors`);
}

export async function backfillTopicsAndQuestions() {
  const { pool: dbPool } = await import("./db");
  const { generateRecapFromTranscript } = await import("./recapGenerator");
  const client = await dbPool.connect();
  try {
    const { rows: recaps } = await client.query(
      `SELECT id, slug, episode_slug, podcast_name, episode_title FROM landing_page_recaps WHERE key_topics IS NULL OR top_questions IS NULL ORDER BY id`
    );
    console.log(`[BackfillTopics] Found ${recaps.length} recaps missing key topics/questions`);

    let updated = 0;
    let errors = 0;
    for (const recap of recaps) {
      try {
        const segments = await storage.getTranscriptSegmentsBySlug(recap.slug, recap.episode_slug);
        if (!segments || segments.length === 0) {
          continue;
        }

        const transcriptText = segments.map(s => s.text).join(" ");
        const result = await generateRecapFromTranscript(transcriptText, recap.podcast_name, recap.episode_title);
        if (!result || !result.keyTopics?.length) {
          continue;
        }

        await client.query(
          `UPDATE landing_page_recaps SET key_topics = $1, top_questions = $2 WHERE id = $3`,
          [result.keyTopics, result.topQuestions ? JSON.stringify(result.topQuestions) : null, recap.id]
        );
        updated++;
        console.log(`[BackfillTopics] Updated ${recap.podcast_name} - "${recap.episode_title}" (${updated}/${recaps.length})`);
      } catch (err) {
        errors++;
        console.warn(`[BackfillTopics] Error processing recap ${recap.id}:`, err);
      }
    }
    console.log(`[BackfillTopics] Complete: ${updated} updated, ${errors} errors, ${recaps.length - updated - errors} skipped`);
  } finally {
    client.release();
  }
}

let batchExpansionRunning = false;
let batchExpansionProgress: {
  status: "idle" | "running" | "completed" | "error";
  currentPodcast: string;
  podcastsProcessed: number;
  podcastsTotal: number;
  episodesCreated: number;
  episodesSkipped: number;
  episodesFailed: number;
  errors: string[];
  startedAt: string | null;
  completedAt: string | null;
} = {
  status: "idle",
  currentPodcast: "",
  podcastsProcessed: 0,
  podcastsTotal: 0,
  episodesCreated: 0,
  episodesSkipped: 0,
  episodesFailed: 0,
  errors: [],
  startedAt: null,
  completedAt: null,
};

export function getBatchExpansionProgress() {
  return { ...batchExpansionProgress };
}

export async function batchExpandEpisodes(targetPerPodcast: number = 50) {
  if (batchExpansionRunning) {
    console.log("[BatchExpand] Already running, skipping");
    return;
  }

  batchExpansionRunning = true;
  batchExpansionProgress = {
    status: "running",
    currentPodcast: "",
    podcastsProcessed: 0,
    podcastsTotal: 0,
    episodesCreated: 0,
    episodesSkipped: 0,
    episodesFailed: 0,
    errors: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  const { pool: dbPool } = await import("./db");

  try {
    let landingPodcasts: any[];
    try {
      const allDir = await storage.getPodcastDirectory();
      landingPodcasts = allDir.filter((p: any) => p.hasLandingPage && p.itunesId && p.slug);
    } catch (err) {
      console.error("[BatchExpand] Failed to fetch podcast directory:", err);
      batchExpansionProgress.status = "error";
      batchExpansionProgress.errors.push("Failed to fetch podcast directory");
      batchExpansionRunning = false;
      return;
    }

    batchExpansionProgress.podcastsTotal = landingPodcasts.length;
    console.log(`[BatchExpand] Starting batch expansion for ${landingPodcasts.length} podcasts (target: ${targetPerPodcast} episodes each)`);

    for (const podcast of landingPodcasts) {
      batchExpansionProgress.currentPodcast = podcast.name;

      try {
        const client = await dbPool.connect();
        let existingCount: number;
        try {
          const { rows } = await client.query(
            `SELECT COUNT(*)::int as count FROM landing_page_recaps WHERE slug = $1`,
            [podcast.slug]
          );
          existingCount = rows[0].count;
        } finally {
          client.release();
        }

        if (existingCount >= targetPerPodcast) {
          console.log(`[BatchExpand] ${podcast.name}: already has ${existingCount}/${targetPerPodcast} episodes, skipping`);
          batchExpansionProgress.podcastsProcessed++;
          continue;
        }

        const needed = targetPerPodcast - existingCount;
        console.log(`[BatchExpand] ${podcast.name}: has ${existingCount}, needs ${needed} more`);

        const lookupUrl = `https://itunes.apple.com/lookup?id=${podcast.itunesId}&media=podcast&entity=podcastEpisode&limit=${Math.min(targetPerPodcast + 10, 200)}&sort=recent`;
        const lookupRes = await fetch(lookupUrl);
        const lookupJson = await lookupRes.json();
        const itunesEpisodes = (lookupJson.results || []).filter((r: any) => r.wrapperType === "podcastEpisode");
        console.log(`[BatchExpand] ${podcast.name}: iTunes returned ${itunesEpisodes.length} episodes`);

        if (itunesEpisodes.length === 0) {
          batchExpansionProgress.podcastsProcessed++;
          continue;
        }

        let taddyPodcastUuid: string | null = null;
        try {
          const taddyPodcast = await searchPodcastByItunesId(podcast.itunesId);
          taddyPodcastUuid = taddyPodcast?.uuid || null;
        } catch {
          console.warn(`[BatchExpand] ${podcast.name}: Taddy podcast lookup failed`);
        }

        let taddyEpisodesList: any[] = [];
        if (taddyPodcastUuid) {
          try {
            taddyEpisodesList = await getRecentEpisodesWithTranscripts(taddyPodcastUuid, 50);
          } catch {
            console.warn(`[BatchExpand] ${podcast.name}: Taddy episodes fetch failed`);
          }
        }

        let podcastCreated = 0;
        for (const ep of itunesEpisodes) {
          if (podcastCreated >= needed) break;

          const epTitle = ep.trackName || "Untitled";
          const epSlug = slugifyEpisodeTitle(epTitle);

          const existingRecap = await storage.getLandingPageRecapBySlug(podcast.slug, epSlug);
          if (existingRecap) {
            batchExpansionProgress.episodesSkipped++;
            continue;
          }

          const episodeGuid = ep.episodeGuid || `${podcast.itunesId}_${ep.trackId || epTitle}`;

          let transcriptText: string | null = null;
          let rawSegments: any[] | null = null;

          const cached = await storage.getTranscriptByEpisodeGuid(episodeGuid);
          if (cached) {
            transcriptText = cached.transcript;
          }

          if (!transcriptText) {
            const dbClient = await dbPool.connect();
            try {
              const titleMatch = await dbClient.query(
                `SELECT transcript FROM episode_transcripts WHERE podcast_id = $1 AND episode_title ILIKE $2 LIMIT 1`,
                [podcast.itunesId, epTitle]
              );
              if (titleMatch.rows.length > 0) {
                transcriptText = titleMatch.rows[0].transcript;
              }
            } finally {
              dbClient.release();
            }
          }

          if (!transcriptText && taddyEpisodesList.length > 0) {
            try {
              const itunesNorm = normalizeTitleForMatch(epTitle);
              const taddyMatch = taddyEpisodesList.find((te: any) => {
                if (!te.name) return false;
                const taddyNorm = normalizeTitleForMatch(te.name);
                return taddyNorm === itunesNorm || taddyNorm.includes(itunesNorm) || itunesNorm.includes(taddyNorm);
              });
              if (taddyMatch?.uuid) {
                rawSegments = await getEpisodeTranscriptSegments(taddyMatch.uuid);
                if (rawSegments && rawSegments.length > 0) {
                  const lines: string[] = [];
                  for (const seg of rawSegments) {
                    const speaker = seg.speaker ? `[${seg.speaker}] ` : "";
                    lines.push(`${speaker}${seg.text}`);
                  }
                  transcriptText = lines.join("\n");
                  await storage.saveTranscript({
                    podcastId: podcast.itunesId,
                    episodeGuid,
                    episodeTitle: epTitle,
                    transcript: transcriptText,
                  });
                }
              }
            } catch (taddyErr) {
              console.warn(`[BatchExpand] Taddy transcript fetch failed for "${epTitle}":`, taddyErr);
            }
          }

          if (!transcriptText) {
            batchExpansionProgress.episodesSkipped++;
            continue;
          }

          if (rawSegments && rawSegments.length > 0) {
            try {
              const hasSegs = await storage.hasTranscriptSegments(episodeGuid);
              if (!hasSegs) {
                const parsedSegments = parseRawTaddySegments(rawSegments, podcast.slug, epSlug, episodeGuid);
                if (parsedSegments.length > 0) {
                  await storage.saveTranscriptSegments(parsedSegments);
                }
              }
            } catch (segErr) {
              console.warn(`[BatchExpand] Segment save failed for "${epTitle}":`, segErr);
            }
          } else {
            try {
              const hasSegs = await storage.hasTranscriptSegments(episodeGuid);
              if (!hasSegs) {
                const segments = parseTranscriptToSegments(transcriptText, podcast.slug, epSlug, episodeGuid);
                if (segments.length > 0) {
                  await storage.saveTranscriptSegments(segments);
                }
              }
            } catch (segErr) {
              console.warn(`[BatchExpand] Segment parse failed for "${epTitle}":`, segErr);
            }
          }

          try {
            const recap = await generateRecapFromTranscript(transcriptText, podcast.name, epTitle);
            if (!recap) {
              batchExpansionProgress.episodesFailed++;
              continue;
            }

            const durationMs = ep.trackTimeMillis || 0;
            const durationMin = Math.round(durationMs / 60000);
            const durationStr = durationMin >= 60
              ? `${Math.floor(durationMin / 60)} hr ${durationMin % 60} min`
              : `${durationMin} min`;
            const releaseDate = ep.releaseDate
              ? new Date(ep.releaseDate).toISOString().split("T")[0]
              : new Date().toISOString().split("T")[0];

            const appleEpisodeUrl = ep.trackViewUrl
              ? ep.trackViewUrl.replace(/&uo=\d+/, "")
              : null;

            await storage.upsertLandingPageRecap({
              slug: podcast.slug,
              itunesId: podcast.itunesId,
              podcastName: podcast.name,
              episodeTitle: recap.episodeTitle,
              episodeSlug: epSlug,
              publishDate: releaseDate,
              duration: durationStr,
              artworkUrl: podcast.artworkUrl || ep.artworkUrl600 || null,
              hosts: podcast.hosts || null,
              tldl: recap.tldl,
              whatHappened: recap.whatHappened,
              keyInsights: recap.keyInsights,
              quote: recap.quote || null,
              quoteAttribution: recap.quoteAttribution || null,
              appleEpisodeUrl: appleEpisodeUrl,
              audioUrl: ep.episodeUrl || null,
              keyTopics: recap.keyTopics || null,
              topQuestions: recap.topQuestions ? JSON.stringify(recap.topQuestions) : null,
            });

            podcastCreated++;
            batchExpansionProgress.episodesCreated++;
            console.log(`[BatchExpand] ✓ ${podcast.name} - "${epTitle}" (${existingCount + podcastCreated}/${targetPerPodcast})`);

            await new Promise(r => setTimeout(r, 500));
          } catch (recapErr) {
            batchExpansionProgress.episodesFailed++;
            const errMsg = `${podcast.name} - "${epTitle}": ${recapErr}`;
            batchExpansionProgress.errors.push(errMsg);
            console.error(`[BatchExpand] Recap generation failed: ${errMsg}`);
          }
        }
      } catch (podcastErr) {
        const errMsg = `${podcast.name}: ${podcastErr}`;
        batchExpansionProgress.errors.push(errMsg);
        console.error(`[BatchExpand] Error processing ${podcast.name}:`, podcastErr);
      }

      batchExpansionProgress.podcastsProcessed++;
    }

    batchExpansionProgress.status = "completed";
    batchExpansionProgress.completedAt = new Date().toISOString();
    batchExpansionProgress.currentPodcast = "";
    console.log(`[BatchExpand] Complete: ${batchExpansionProgress.episodesCreated} created, ${batchExpansionProgress.episodesSkipped} skipped, ${batchExpansionProgress.episodesFailed} failed`);
  } catch (err) {
    batchExpansionProgress.status = "error";
    batchExpansionProgress.errors.push(`Fatal error: ${err}`);
    console.error("[BatchExpand] Fatal error:", err);
  } finally {
    batchExpansionRunning = false;
  }
}

export function startEmailScheduler() {
  console.log(`[EmailScheduler] Starting email scheduler (per-user generation at delivery time, emails held for review)...`);
  setInterval(processSchedulerTick, SCHEDULER_INTERVAL_MS);
  setTimeout(processSchedulerTick, 5000);

  setInterval(() => {
    const now = new Date();
    const etHour = parseInt(now.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit" }));
    if (etHour === 5) {
      refreshLandingPageRecaps().catch(err => console.error("[LandingRecaps] Refresh error:", err));
    }
  }, 15 * 60 * 1000);

  setTimeout(async () => {
    try {
      await ensureLandingPageDirectoryEntries();
    } catch (err) {
      console.error("[LandingRecaps] Directory seed error:", err);
    }
    try {
      await backfillTranscriptSegments();
    } catch (err) {
      console.error("[TranscriptBackfill] Backfill error:", err);
    }
    refreshLandingPageRecaps().catch(err => console.error("[LandingRecaps] Initial refresh error:", err));
  }, 30000);
}

async function ensureLandingPageDirectoryEntries() {
  const { SLUG_TO_ITUNES_ID } = await import("./podcastLandingMap");
  const allDir = await storage.getPodcastDirectory();
  const existingByItunes = new Map(allDir.map((p: any) => [p.itunesId, p]));

  let updated = 0;
  for (const [slug, itunesId] of Object.entries(SLUG_TO_ITUNES_ID)) {
    const existing = existingByItunes.get(itunesId);
    if (existing) {
      if (!existing.hasLandingPage || existing.slug !== slug) {
        await storage.upsertPodcastDirectoryEntry({
          ...existing,
          slug,
          hasLandingPage: true,
        });
        updated++;
      }
    } else {
      try {
        const lookupRes = await fetch(`https://itunes.apple.com/lookup?id=${itunesId}&media=podcast`);
        const lookupData = await lookupRes.json();
        const info = lookupData.results?.[0];
        await storage.upsertPodcastDirectoryEntry({
          itunesId,
          slug,
          name: info?.collectionName || slug,
          artworkUrl: info?.artworkUrl600 || info?.artworkUrl100 || null,
          hasLandingPage: true,
        });
        updated++;
      } catch {
        await storage.upsertPodcastDirectoryEntry({
          itunesId,
          slug,
          name: slug,
          hasLandingPage: true,
        });
        updated++;
      }
    }
  }
  if (updated > 0) {
    console.log(`[LandingRecaps] Ensured ${updated} podcast directory entries with has_landing_page=true`);
  }
}

export async function backfillTranscriptSegments() {
  const { pool: dbPool } = await import("./db");
  const { ITUNES_ID_TO_SLUG } = await import("./podcastLandingMap");
  let totalProcessed = 0;

  while (true) {
    const client = await dbPool.connect();
    try {
      const { rows: transcripts } = await client.query(
        `SELECT et.id, et.podcast_id, et.episode_guid, et.episode_title, et.transcript
         FROM episode_transcripts et
         WHERE NOT EXISTS (
           SELECT 1 FROM transcript_segments ts WHERE ts.episode_guid = et.episode_guid
         )
         LIMIT 50`
      );

      if (transcripts.length === 0) break;

      for (const t of transcripts) {
        try {
          const podcastSlug = ITUNES_ID_TO_SLUG[t.podcast_id] || t.podcast_id;
          const episodeSlug = slugifyEpisodeTitle(t.episode_title);
          const segments = parseTranscriptToSegments(
            t.transcript,
            podcastSlug,
            episodeSlug,
            t.episode_guid,
            t.id
          );
          if (segments.length > 0) {
            await storage.saveTranscriptSegments(segments);
            totalProcessed++;
          }
        } catch (err) {
          console.warn(`[TranscriptBackfill] Error processing ${t.episode_title}:`, err);
        }
      }
    } finally {
      client.release();
    }
  }

  if (totalProcessed > 0) {
    console.log(`[TranscriptBackfill] Backfilled ${totalProcessed} transcripts into segments`);
  }
}

export async function reIngestTranscriptSegments() {
  const { pool: dbPool } = await import("./db");
  const { ITUNES_ID_TO_SLUG } = await import("./podcastLandingMap");
  let upgraded = 0;
  let errors = 0;

  const client = await dbPool.connect();
  try {
    const { rows: transcripts } = await client.query(
      `SELECT DISTINCT et.id, et.podcast_id, et.episode_guid, et.episode_title
       FROM episode_transcripts et
       INNER JOIN transcript_segments ts ON ts.episode_guid = et.episode_guid
       WHERE ts.timestamp_seconds IS NULL
       AND et.podcast_id IN (SELECT itunes_id FROM podcast_directory WHERE has_landing_page = true)
       LIMIT 200`
    );

    if (transcripts.length === 0) {
      console.log("[TranscriptReIngest] No transcripts need re-ingestion");
      return;
    }

    console.log(`[TranscriptReIngest] Re-ingesting ${transcripts.length} transcripts from Taddy for timestamps...`);

    const podcastCache = new Map<string, string>();

    for (const t of transcripts) {
      try {
        const podcastSlug = ITUNES_ID_TO_SLUG[t.podcast_id] || t.podcast_id;
        const episodeSlug = slugifyEpisodeTitle(t.episode_title);

        let taddyPodcastUuid = podcastCache.get(t.podcast_id);
        if (!taddyPodcastUuid) {
          const taddyPodcast = await searchPodcastByItunesId(t.podcast_id);
          if (taddyPodcast?.uuid) {
            taddyPodcastUuid = taddyPodcast.uuid;
            podcastCache.set(t.podcast_id, taddyPodcastUuid);
          }
        }

        if (!taddyPodcastUuid) continue;

        const taddyEpisodes = await getRecentEpisodesWithTranscripts(taddyPodcastUuid, 25);
        const itunesNorm = normalizeTitleForMatch(t.episode_title);
        const taddyMatch = taddyEpisodes.find((te: any) => {
          if (!te.name) return false;
          const taddyNorm = normalizeTitleForMatch(te.name);
          return taddyNorm === itunesNorm || taddyNorm.includes(itunesNorm) || itunesNorm.includes(taddyNorm);
        });

        if (!taddyMatch?.uuid) continue;

        const rawSegments = await getEpisodeTranscriptSegments(taddyMatch.uuid);
        if (!rawSegments || rawSegments.length === 0) continue;

        const hasTimestamps = rawSegments.some(s => s.startTimecode != null);
        if (!hasTimestamps) continue;

        const parsedSegments = parseRawTaddySegments(rawSegments, podcastSlug, episodeSlug, t.episode_guid, t.id);
        if (parsedSegments.length > 0) {
          await storage.saveTranscriptSegments(parsedSegments);
          upgraded++;
          console.log(`[TranscriptReIngest] Upgraded "${t.episode_title}" (${parsedSegments.length} segments with timestamps)`);
        }
      } catch (err) {
        errors++;
        console.warn(`[TranscriptReIngest] Error for "${t.episode_title}":`, err);
      }
    }

    console.log(`[TranscriptReIngest] Complete: ${upgraded} upgraded, ${errors} errors`);
  } finally {
    client.release();
  }
}

export async function backfillAppleEpisodeUrls() {
  const { pool: dbPool } = await import("./db");
  const client = await dbPool.connect();
  try {
    const { rows: recaps } = await client.query(
      `SELECT id, slug, itunes_id, episode_title FROM landing_page_recaps WHERE apple_episode_url IS NULL AND itunes_id IS NOT NULL`
    );
    console.log(`[BackfillAppleUrls] Found ${recaps.length} recaps missing Apple episode URLs`);

    const byItunesId = new Map<string, typeof recaps>();
    for (const r of recaps) {
      const list = byItunesId.get(r.itunes_id) || [];
      list.push(r);
      byItunesId.set(r.itunes_id, list);
    }

    let updated = 0;
    let errors = 0;

    for (const [itunesId, podcastRecaps] of byItunesId) {
      try {
        const lookupUrl = `https://itunes.apple.com/lookup?id=${itunesId}&media=podcast&entity=podcastEpisode&limit=50&sort=recent`;
        const lookupRes = await fetch(lookupUrl);
        const lookupJson = await lookupRes.json();
        const episodes = (lookupJson.results || []).filter((r: any) => r.wrapperType === "podcastEpisode");

        for (const recap of podcastRecaps) {
          const titleNorm = recap.episode_title.toLowerCase().trim();
          const match = episodes.find((ep: any) => {
            const epNorm = (ep.trackName || "").toLowerCase().trim();
            return epNorm === titleNorm || epNorm.includes(titleNorm) || titleNorm.includes(epNorm);
          });
          if (match?.trackViewUrl) {
            const cleanUrl = match.trackViewUrl.replace(/&uo=\d+/, "");
            await client.query(
              `UPDATE landing_page_recaps SET apple_episode_url = $1, audio_url = COALESCE(audio_url, $2) WHERE id = $3`,
              [cleanUrl, match.episodeUrl || null, recap.id]
            );
            updated++;
          }
        }

        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err) {
        errors++;
        console.warn(`[BackfillAppleUrls] Error for iTunes ID ${itunesId}:`, err);
      }
    }

    console.log(`[BackfillAppleUrls] Complete: ${updated} updated, ${errors} errors`);
  } finally {
    client.release();
  }
}
