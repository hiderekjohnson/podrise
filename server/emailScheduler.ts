import { storage } from "./storage";
import { openai } from "./replit_integrations/image/client";
import { searchPodcastByItunesId, getRecentEpisodesWithTranscripts } from "./taddyClient";
import { getUncachableResendClient } from "./resendClient";
import { markdownToEmailHtml } from "./emailTemplate";

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
  const podcastInfos: { name: string; id: string }[] = user.podcasts.map((raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      return { name: parsed.name || raw, id: parsed.id || raw };
    } catch {
      return { name: raw, id: raw };
    }
  });

  const { start: yesterdayStart, end: yesterdayEnd, label: yesterdayLabel, dateStr } = getYesterdayInTimezone(timezone);

  const episodeData: string[] = [];
  let hasAnyEpisodes = false;
  let hasTranscripts = false;

  for (const podcast of podcastInfos) {
    try {
      const lookupUrl = `https://itunes.apple.com/lookup?id=${podcast.id}&media=podcast&entity=podcastEpisode&limit=20&sort=recent`;
      const lookupRes = await fetch(lookupUrl);
      const lookupJson = await lookupRes.json();
      const episodes = (lookupJson.results || []).filter((r: any) => {
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
          console.warn(`[EmailScheduler] Taddy lookup failed for ${podcast.name}:`, taddyErr);
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
    return null;
  }

  const readingMinutes = user.readingLength || 10;

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

  const content = completion.choices[0]?.message?.content;
  if (!content) return null;
  return { summary: content, dateStr };
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

    try {
      const { dateStr } = getYesterdayInTimezone(timezone);
      if (await hasRecapForDate(user.id, dateStr)) {
        recentlySent.add(cacheKey);
        continue;
      }

      console.log(`[EmailScheduler] Processing user ${user.id} (${user.email})...`);

      const result = await generateRecapForUser(user, timezone);
      if (!result) {
        console.log(`[EmailScheduler] No new episodes for user ${user.id}, skipping email.`);
        recentlySent.add(cacheKey);
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
        subject: `☕ Your PodCap Daily — ${new Date().toLocaleDateString("en-US", { timeZone: timezone, weekday: "long", month: "short", day: "numeric" })}`,
        html: emailHtml,
      });

      if (sendResult.error) {
        console.error(`[EmailScheduler] Resend error for user ${user.id}:`, JSON.stringify(sendResult.error));
        continue;
      }

      recentlySent.add(cacheKey);
      console.log(`[EmailScheduler] Email sent to ${user.email}, id: ${sendResult.data?.id}`);
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
