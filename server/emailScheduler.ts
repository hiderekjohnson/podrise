import { storage } from "./storage";
import { getUncachableResendClient } from "./resendClient";
import { markdownToEmailHtml } from "./emailTemplate";
import { generateRecap } from "./recapGenerator";

const SCHEDULER_INTERVAL_MS = 60 * 1000;
const recentlySent = new Set<string>();

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
  return diff >= 0 && diff <= 2;
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

async function generateRecapForUser(user: any, timezone: string): Promise<{ summary: string; dateStr: string } | null> {
  const { start: yesterdayStart, end: yesterdayEnd, label: yesterdayLabel, dateStr } = getYesterdayInTimezone(timezone);
  return generateRecap(user, yesterdayStart, yesterdayEnd, yesterdayLabel, dateStr);
}

async function hasRecapForDate(userId: number, dateStr: string): Promise<boolean> {
  const recaps = await storage.getRecapsByUserId(userId);
  return recaps.some((r) => r.recapDate === dateStr);
}

async function processUsers() {
  let users: any[];
  try {
    users = await storage.getAllUsers();
  } catch (err) {
    console.error("[EmailScheduler] Failed to fetch users:", err);
    return;
  }

  for (const user of users) {
    if (!user.podcasts || user.podcasts.length === 0 || !user.email) continue;

    const timezone = user.deliveryTimezone || "America/New_York";
    const deliveryTime = user.deliveryTime || "07:00";
    const userDate = getUserLocalDate(timezone);
    const cacheKey = `${user.id}_${userDate}`;

    if (recentlySent.has(cacheKey)) continue;
    if (!shouldSendNow(deliveryTime, timezone)) continue;

    recentlySent.add(cacheKey);

    try {
      const { dateStr } = getYesterdayInTimezone(timezone);
      if (await hasRecapForDate(user.id, dateStr)) {
        continue;
      }

      const alreadyEmailed = await storage.hasEmailLogForUserOnDate(user.id, userDate);
      if (alreadyEmailed) {
        console.log(`[EmailScheduler] User ${user.id} already received email today (${userDate}), skipping.`);
        continue;
      }

      console.log(`[EmailScheduler] Processing user ${user.id} (${user.email})...`);

      const result = await generateRecapForUser(user, timezone);
      if (!result) {
        console.log(`[EmailScheduler] No new episodes for user ${user.id}, skipping email.`);
        continue;
      }

      await storage.createRecap({
        userId: user.id,
        recapDate: result.dateStr,
        podcasts: user.podcasts,
        summary: result.summary,
      });

      const emailHtml = markdownToEmailHtml(result.summary, user.email);

      const { client, fromEmail } = await getUncachableResendClient();
      const sendResult = await client.emails.send({
        from: `PodCap Daily <${fromEmail}>`,
        to: user.email,
        subject: `☕ Your PodCap Daily Recap — ${new Date().toLocaleDateString("en-US", { timeZone: timezone, weekday: "long", month: "short", day: "numeric" })}`,
        html: emailHtml,
      });

      if (sendResult.error) {
        console.error(`[EmailScheduler] Resend error for user ${user.id}:`, JSON.stringify(sendResult.error));
        continue;
      }

      console.log(`[EmailScheduler] Email sent to ${user.email}, id: ${sendResult.data?.id}`);

      await storage.logEmail({
        userId: user.id,
        recipientEmail: user.email,
        podcasts: user.podcasts,
        source: "scheduled",
        emailHtml,
      });
    } catch (err) {
      console.error(`[EmailScheduler] Failed for user ${user.id}:`, err);
    }
  }

  if (recentlySent.size > 10000) {
    recentlySent.clear();
  }
}

export function startEmailScheduler() {
  console.log("[EmailScheduler] Starting email scheduler (checking every minute)...");
  setInterval(processUsers, SCHEDULER_INTERVAL_MS);
  setTimeout(processUsers, 5000);
}
