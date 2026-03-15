import { generateAndSavePulse, topicKeywordsMap } from "./pulseGenerator";
import { pool } from "./db";

const TOPIC_NAMES: Record<string, string> = {
  "ai": "Artificial Intelligence",
  "venture-capital": "Venture Capital",
  "saas": "SaaS",
  "defense-tech": "Defense Tech",
  "climate-energy": "Climate & Energy",
  "crypto-web3": "Crypto & Web3",
  "robotics": "Robotics",
  "technology": "Technology",
  "media-content": "Media & Content",
  "economics": "Economics",
  "open-source": "Open Source",
  "automation": "Automation",
  "health-longevity": "Health & Longevity",
  "psychology": "Psychology",
  "productivity": "Productivity",
  "decision-making": "Decision Making",
  "creativity": "Creativity",
  "personal-finance": "Personal Finance",
  "geopolitics": "Geopolitics",
  "peak-performance": "Peak Performance",
  "self-improvement": "Self Improvement",
  "negotiation": "Negotiation",
  "investing": "Investing",
  "future-of-work": "Future of Work",
  "marketing": "Marketing",
  "sales": "Sales",
  "leadership": "Leadership",
  "creator-economy": "Creator Economy",
  "career-growth": "Career Growth",
  "entrepreneurship": "Entrepreneurship",
  "startups": "Startups",
  "bootstrapping": "Bootstrapping",
  "side-hustles": "Side Hustles",
  "product-management": "Product Management",
  "product-market-fit": "Product Market Fit",
  "women-in-business": "Women in Business",
  "young-entrepreneurs": "Young Entrepreneurs",
};

export async function generatePulsesForDate(dateStr: string) {
  const slugs = Object.keys(topicKeywordsMap);
  console.log(`[DailyPulse] Generating pulses for ${slugs.length} topics on ${dateStr}`);

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const slug of slugs) {
    const name = TOPIC_NAMES[slug] || slug;
    try {
      const pulse = await generateAndSavePulse(slug, dateStr, name);
      if (pulse) {
        console.log(`[DailyPulse] ✓ ${name}: ${pulse.episodeCount} episodes`);
        success++;
      } else {
        skipped++;
      }
    } catch (err: any) {
      console.error(`[DailyPulse] ✗ ${name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`[DailyPulse] ${dateStr} complete: ${success} generated, ${skipped} skipped, ${failed} failed`);
  return { success, skipped, failed };
}

async function getDatesNeedingPulses(maxDays: number = 7): Promise<string[]> {
  const expectedTopicCount = Object.keys(topicKeywordsMap).length;
  const minPulsesPerDate = Math.floor(expectedTopicCount * 0.8);

  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT lpr.publish_date
      FROM landing_page_recaps lpr
      LEFT JOIN topic_pulses tp ON tp.publish_date::text = lpr.publish_date::text
      WHERE lpr.publish_date::date >= (CURRENT_DATE - $1::int)
        AND lpr.publish_date::date < CURRENT_DATE
      GROUP BY lpr.publish_date
      HAVING COUNT(DISTINCT tp.topic_slug) < $2
      ORDER BY lpr.publish_date DESC
    `, [maxDays, minPulsesPerDate]);
    return rows.map(r => {
      if (r.publish_date instanceof Date) {
        return r.publish_date.toISOString().split("T")[0];
      }
      return String(r.publish_date);
    });
  } catch (err) {
    console.error("[DailyPulse] Failed to check for dates needing pulses:", err);
    return [];
  }
}

async function backfillMissingPulses() {
  const missingDates = await getDatesNeedingPulses(7);
  if (missingDates.length === 0) {
    console.log("[DailyPulse] No missing pulse dates found — all recent dates have sufficient coverage");
    return;
  }

  console.log(`[DailyPulse] Backfill: found ${missingDates.length} date(s) needing pulses: ${missingDates.join(", ")}`);

  for (const dateStr of missingDates) {
    try {
      const result = await generatePulsesForDate(dateStr);
      console.log(`[DailyPulse] Backfill for ${dateStr}: ${result.success} generated, ${result.skipped} skipped, ${result.failed} failed`);
    } catch (err) {
      console.error(`[DailyPulse] Backfill failed for ${dateStr}:`, err);
    }
  }
}

export function startDailyPulseScheduler() {
  const SEVEN_AM_UTC_HOUR = 7;
  const CHECK_INTERVAL = 60 * 60 * 1000;
  let lastRunDate: string | null = null;

  async function checkAndRun() {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const todayStr = now.toISOString().split("T")[0];

    if (utcHour >= SEVEN_AM_UTC_HOUR && lastRunDate !== todayStr) {
      lastRunDate = todayStr;
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      console.log(`[DailyPulse] Starting daily pulse generation for ${yesterdayStr}`);
      try {
        await generatePulsesForDate(yesterdayStr);
      } catch (err) {
        console.error("[DailyPulse] Daily generation failed:", err);
      }
    }
  }

  setTimeout(async () => {
    try {
      await backfillMissingPulses();
    } catch (err) {
      console.error("[DailyPulse] Startup backfill failed:", err);
    }
  }, 10000);

  checkAndRun();
  setInterval(checkAndRun, CHECK_INTERVAL);
  console.log(`[DailyPulse] Scheduler started — will generate pulses daily at ~${SEVEN_AM_UTC_HOUR}:00 UTC`);
}
