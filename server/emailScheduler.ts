import { storage } from "./storage";
import { getUncachableResendClient } from "./resendClient";
import { markdownToEmailHtml, recapHasContent } from "./emailTemplate";
import { generateRecap, type ParsedEpisode } from "./recapGenerator";
import { ITUNES_ID_TO_SLUG } from "./podcastLandingMap";

const SCHEDULER_INTERVAL_MS = 60 * 1000;
const ADMIN_NOTIFY_EMAIL = "hiderekjohnson@gmail.com";
const recentlyGenerated = new Set<string>();

async function sendAdminNotification(userEmail: string, subject: string) {
  const { client, fromEmail } = await getUncachableResendClient();
  await client.emails.send({
    from: `PodCap System <${fromEmail}>`,
    to: ADMIN_NOTIFY_EMAIL,
    subject: `⚡ New email pending approval`,
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
      podcasts: user.podcasts,
      summary: result.summary,
    });

    await storage.createPendingEmail({
      userId: user.id,
      recipientEmail: user.email,
      podcasts: user.podcasts,
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

  const { client, fromEmail } = await getUncachableResendClient();
  const sendResult = await client.emails.send({
    from: `PodCap Daily <${fromEmail}>`,
    to: pending.recipientEmail,
    subject: pending.subject,
    html: pending.emailHtml,
  });

  if (sendResult.error) {
    await storage.updatePendingEmailStatus(pending.id, "error", sendResult.error.message || "Send failed");
    throw new Error(sendResult.error.message || "Send failed");
  }

  console.log(`[EmailScheduler] Held email ${pending.id} sent to ${pending.recipientEmail}, id: ${sendResult.data?.id}`);
  await storage.updatePendingEmailStatus(pending.id, "sent");

  await storage.logEmail({
    userId: pending.userId,
    recipientEmail: pending.recipientEmail,
    podcasts: pending.podcasts,
    source: pending.source || "scheduled",
    emailHtml: pending.emailHtml,
  });
}

export function startEmailScheduler() {
  console.log(`[EmailScheduler] Starting email scheduler (per-user generation at delivery time, emails held for review)...`);
  setInterval(processSchedulerTick, SCHEDULER_INTERVAL_MS);
  setTimeout(processSchedulerTick, 5000);
}
