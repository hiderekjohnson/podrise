import { storage } from "./server/storage";
import { PODCAST_LANDINGS } from "./client/src/data/podcastLandingData";
import { db } from "./server/db";
import { podcastDirectory, landingPageRecaps } from "./shared/schema";
import { eq, sql } from "drizzle-orm";
import * as fs from "fs";

const PROGRESS_FILE = "/tmp/recap_progress.json";
const LOG_FILE = "/tmp/recap_backfill.log";

function log(msg: string) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

function saveProgress(progress: Record<string, any>) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function loadProgress(): Record<string, any> {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8")); } catch { return {}; }
}

async function main() {
  log("=== STEP 1: Register new podcasts in directory ===");
  
  const existingEntries = await storage.getPodcastDirectory();
  const existingIds = new Set(existingEntries.map((e: any) => e.itunesId));
  
  const newPodcasts = PODCAST_LANDINGS.filter(p => !existingIds.has(p.itunesId));
  log(`Found ${newPodcasts.length} podcasts not yet in directory (out of ${PODCAST_LANDINGS.length} total)`);
  
  let registered = 0;
  for (const p of newPodcasts) {
    try {
      await storage.upsertPodcastDirectoryEntry({
        itunesId: p.itunesId,
        slug: p.slug,
        name: p.name,
        hosts: p.hosts,
        category: p.category,
        description: p.description,
        keywords: p.keywords,
        faqTopics: p.faqTopics,
        artworkUrl: p.artworkUrl,
        appleUrl: p.appleUrl || null,
        spotifyUrl: p.spotifyUrl || null,
        youtubeUrl: p.youtubeUrl || null,
        avgEpisodeLength: p.avgEpisodeLength || null,
        frequency: p.frequency || null,
        totalEpisodes: p.totalEpisodes || null,
        yearStarted: p.yearStarted || null,
        knownFor: p.knownFor || null,
        hostBios: p.hostBios || null,
        relatedSlugs: p.relatedSlugs || null,
        aboutPodcast: p.aboutPodcast || null,
        hasLandingPage: true,
      } as any);
      registered++;
    } catch (e: any) {
      log(`  ERROR registering ${p.slug}: ${e.message}`);
    }
  }
  
  log(`Registered ${registered} new podcasts`);
  
  log("=== STEP 2: Trigger recap generation via existing system ===");
  log("Now calling refreshLandingPageRecaps(true) to generate recaps for all landing page podcasts...");
  
  const { refreshLandingPageRecaps, batchExpandEpisodes, getLandingRecapProgress } = await import("./server/emailScheduler");
  
  refreshLandingPageRecaps(true);
  
  log("Recap generation triggered in background. Monitoring progress...");
  
  let lastUpdate = "";
  let staleCount = 0;
  const maxStale = 60;
  
  while (true) {
    await new Promise(r => setTimeout(r, 10000));
    
    const progress = getLandingRecapProgress();
    const update = `Status: ${progress.status} | Podcast: ${progress.currentPodcast} | ${progress.podcastsProcessed}/${progress.podcastsTotal} | Created: ${progress.recapsCreated} | Skipped: ${progress.recapsSkipped} | Errors: ${progress.errors}`;
    
    if (update !== lastUpdate) {
      log(update);
      lastUpdate = update;
      staleCount = 0;
    } else {
      staleCount++;
    }
    
    if (progress.status === "completed" || progress.status === "error") {
      log(`Landing recap refresh ${progress.status}!`);
      break;
    }
    
    if (progress.status === "idle") {
      log("Process went idle, likely completed.");
      break;
    }
    
    if (staleCount > maxStale) {
      log("WARNING: Progress stale for 10 minutes, may be stuck.");
      break;
    }
  }
  
  log("=== STEP 3: Check coverage ===");
  const allDir = await storage.getPodcastDirectory();
  const landingPodcasts = allDir.filter((p: any) => p.hasLandingPage);
  
  const coverage: Record<string, any> = {};
  let under10 = 0;
  let zero = 0;
  
  for (const p of landingPodcasts) {
    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(landingPageRecaps)
      .where(eq(landingPageRecaps.slug, p.slug!));
    const count = Number(result?.count || 0);
    coverage[p.slug!] = count;
    if (count < 10) under10++;
    if (count === 0) zero++;
  }
  
  log(`Coverage: ${landingPodcasts.length} podcasts total`);
  log(`  With 10+ recaps: ${landingPodcasts.length - under10}`);
  log(`  Under 10 recaps: ${under10}`);
  log(`  Zero recaps: ${zero}`);
  
  saveProgress(coverage);
  
  if (under10 > 0) {
    log("\nPodcasts with <10 recaps:");
    Object.entries(coverage)
      .filter(([, count]) => (count as number) < 10)
      .sort((a, b) => (a[1] as number) - (b[1] as number))
      .forEach(([slug, count]) => log(`  ${slug}: ${count} recaps`));
  }
  
  log("\n=== BACKFILL PROCESS COMPLETE ===");
}

main().catch(e => {
  log(`FATAL: ${e.message}`);
  console.error(e);
  process.exit(1);
});
