import { storage } from "./storage";
import { getUncachableResendClient } from "./resendClient";
import { markdownToEmailHtml, recapHasContent } from "./emailTemplate";
import { generateRecap } from "./recapGenerator";

const SCHEDULER_INTERVAL_MS = 60 * 1000;
const PREGENERATE_HOUR_UTC = 7;
const recentlySent = new Set<string>();
let lastPregenerateDate = "";

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

function shouldSendNow(deliveryTime: string, timezone: string): boolean {
  const parts = deliveryTime.split(":").map(Number);
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return false;
  const [targetHour, targetMinute] = parts;
  const { hours, minutes } = getUserLocalTime(timezone);
  if (hours === -1) return false;
  const targetTotal = targetHour * 60 + targetMinute;
  const currentTotal = hours * 60 + minutes;
  const diff = currentTotal - targetTotal;
  return diff >= 0 && diff <= 60;
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

async function pregenerateAllEmails() {
  const todayUTC = new Date().toISOString().split("T")[0];
  if (lastPregenerateDate === todayUTC) return;

  console.log(`[EmailScheduler] Starting nightly pre-generation for ${todayUTC}...`);
  lastPregenerateDate = todayUTC;

  let users: any[];
  try {
    users = await storage.getAllUsers();
  } catch (err) {
    console.error("[EmailScheduler] Failed to fetch users for pre-generation:", err);
    lastPregenerateDate = "";
    return;
  }

  let recapPrompt: string | undefined;
  try {
    const settings = await storage.getEmailTemplateSettings();
    recapPrompt = settings.recapPrompt || undefined;
  } catch (err) {
    console.error("[EmailScheduler] Failed to load recap prompt:", err);
  }

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    if (!user.podcasts || user.podcasts.length === 0 || !user.email) {
      skipped++;
      continue;
    }

    const timezone = user.deliveryTimezone || "America/New_York";

    try {
      const { start: yesterdayStart, end: yesterdayEnd, label: yesterdayLabel, dateStr } = getYesterdayInTimezone(timezone);

      const existing = await storage.getPendingEmailsForUser(user.id, dateStr);
      if (existing.length > 0) {
        skipped++;
        continue;
      }

      const recaps = await storage.getRecapsByUserId(user.id);
      if (recaps.some(r => r.recapDate === dateStr)) {
        skipped++;
        continue;
      }

      console.log(`[EmailScheduler] Pre-generating recap for user ${user.id} (${user.email})...`);

      const result = await generateRecap(user, yesterdayStart, yesterdayEnd, yesterdayLabel, dateStr, "yesterday", recapPrompt);
      if (!result) {
        console.log(`[EmailScheduler] No new episodes for user ${user.id}, skipping.`);
        skipped++;
        continue;
      }

      if (!recapHasContent(result.summary)) {
        console.warn(`[EmailScheduler] Pre-generated recap for user ${user.id} has 0 episodes — skipping.`);
        skipped++;
        continue;
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
        status: "pending",
      });

      generated++;
      console.log(`[EmailScheduler] Pre-generated email for user ${user.id} scheduled at ${deliveryTime} ${timezone}`);
    } catch (err) {
      console.error(`[EmailScheduler] Pre-generation failed for user ${user.id}:`, err);
      failed++;
    }
  }

  console.log(`[EmailScheduler] Pre-generation complete: ${generated} generated, ${skipped} skipped, ${failed} failed`);

  try {
    const cleaned = await storage.clearOldPendingEmails(7);
    if (cleaned > 0) console.log(`[EmailScheduler] Cleaned up ${cleaned} old pending emails`);
  } catch {}
}

async function sendPendingEmails() {
  let pendingList: any[];
  try {
    pendingList = await storage.getPendingEmails("pending");
  } catch (err) {
    console.error("[EmailScheduler] Failed to fetch pending emails:", err);
    return;
  }

  for (const pending of pendingList) {
    const cacheKey = `${pending.userId}_${pending.recapDate}`;
    if (recentlySent.has(cacheKey)) continue;

    const timezone = pending.timezone || "America/New_York";
    const deliveryTime = pending.scheduledFor || "07:00";

    if (!shouldSendNow(deliveryTime, timezone)) continue;

    recentlySent.add(cacheKey);

    try {
      if (!recapHasContent(pending.summary)) {
        console.warn(`[EmailScheduler] Pending email ${pending.id} has no episode content — marking as error.`);
        await storage.updatePendingEmailStatus(pending.id, "error", "No episode content in recap");
        continue;
      }

      const userDate = getUserLocalDate(timezone);
      const alreadyEmailed = await storage.hasEmailLogForUserOnDate(pending.userId, userDate);
      if (alreadyEmailed) {
        console.log(`[EmailScheduler] User ${pending.userId} already received email today, marking pending as sent.`);
        await storage.updatePendingEmailStatus(pending.id, "sent");
        continue;
      }

      const { client, fromEmail } = await getUncachableResendClient();
      const sendResult = await client.emails.send({
        from: `PodCap Daily <${fromEmail}>`,
        to: pending.recipientEmail,
        subject: pending.subject,
        html: pending.emailHtml,
      });

      if (sendResult.error) {
        console.error(`[EmailScheduler] Resend error for pending ${pending.id}:`, JSON.stringify(sendResult.error));
        await storage.updatePendingEmailStatus(pending.id, "error", sendResult.error.message || "Send failed");
        continue;
      }

      console.log(`[EmailScheduler] Email sent to ${pending.recipientEmail}, id: ${sendResult.data?.id}`);

      await storage.updatePendingEmailStatus(pending.id, "sent");

      await storage.logEmail({
        userId: pending.userId,
        recipientEmail: pending.recipientEmail,
        podcasts: pending.podcasts,
        source: "scheduled",
        emailHtml: pending.emailHtml,
      });
    } catch (err) {
      console.error(`[EmailScheduler] Failed to send pending ${pending.id}:`, err);
      await storage.updatePendingEmailStatus(pending.id, "error", String(err)).catch(() => {});
    }
  }

  if (recentlySent.size > 10000) {
    recentlySent.clear();
  }
}

async function processSchedulerTick() {
  const nowUTC = new Date();
  const hourUTC = nowUTC.getUTCHours();

  if (hourUTC === PREGENERATE_HOUR_UTC) {
    await pregenerateAllEmails();
  }

  await sendPendingEmails();
}

export async function triggerPregeneration() {
  lastPregenerateDate = "";
  await pregenerateAllEmails();
}

export function startEmailScheduler() {
  console.log(`[EmailScheduler] Starting email scheduler (pre-generation at ${PREGENERATE_HOUR_UTC}:00 UTC, delivery check every minute)...`);
  setInterval(processSchedulerTick, SCHEDULER_INTERVAL_MS);
  setTimeout(processSchedulerTick, 5000);
}
