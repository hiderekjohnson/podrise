import { db } from "../server/db";
import { podcastDirectory } from "../shared/schema";
import { eq, inArray } from "drizzle-orm";

const YOUTUBE_URL_UPDATES: Record<string, string> = {
  "marieforleo": "youtube.com/@marieforleo",
  "wecandohardthings": "youtube.com/@WeCanDoHardThingsShow",
  "areallygoodcry": "youtube.com/@AReallyGoodCry",
  "deargabby": "youtube.com/@GabbyBernstein",
  "almost30": "youtube.com/@Almost30Podcast",
  "gooppodcast": "youtube.com/@goop",
  "goodhang": "youtube.com/@Good-Hang-with-Amy-Poehler",
  "great-chat": "youtube.com/@joshsmithsgreatchatshow",
  "earnyourhappy": "youtube.com/@LoriHarder",
  "reuters-world-news": "youtube.com/@Reuters",
  "associated-press": "youtube.com/@AssociatedPress",
  "news-agents": "youtube.com/@thenewsagents",
  "real-eisman-playbook": "youtube.com/@RealEismanPlaybook",
  "accidental-tech-podcast": "youtube.com/@atpfm",
  "ai-for-humans": "youtube.com/@AIForHumansShow",
  "no-bullshit-leadership": "youtube.com/@YourCEOMentor",
  "memo-by-howard-marks": "youtube.com/@OaktreeCapital",
};

async function main() {
  const slugs = Object.keys(YOUTUBE_URL_UPDATES);

  const existingRows = await db
    .select({ slug: podcastDirectory.slug })
    .from(podcastDirectory)
    .where(inArray(podcastDirectory.slug, slugs));
  const existingSlugs = new Set(existingRows.map(r => r.slug));

  const missingSlugs = slugs.filter(s => !existingSlugs.has(s));
  console.log(`Found ${existingSlugs.size} existing slugs, ${missingSlugs.length} missing`);

  let updated = 0;
  for (const slug of Array.from(existingSlugs)) {
    if (!slug) continue;
    const youtubeUrl = YOUTUBE_URL_UPDATES[slug];
    await db
      .update(podcastDirectory)
      .set({ youtubeUrl, updatedAt: new Date() })
      .where(eq(podcastDirectory.slug, slug));
    console.log(`Updated: ${slug} → ${youtubeUrl}`);
    updated++;
  }

  if (missingSlugs.length > 0) {
    console.log(`\nNot found in podcast_directory (${missingSlugs.length}):`);
    for (const slug of missingSlugs) {
      console.log(`  - ${slug} (youtube_url would be: ${YOUTUBE_URL_UPDATES[slug]})`);
    }
  }

  const verification = await db
    .select({ slug: podcastDirectory.slug, youtubeUrl: podcastDirectory.youtubeUrl, name: podcastDirectory.name })
    .from(podcastDirectory)
    .where(inArray(podcastDirectory.slug, slugs))
    .orderBy(podcastDirectory.slug);

  console.log(`\n--- Verification ---`);
  console.log(`Updated: ${updated}/${slugs.length}`);
  for (const row of verification) {
    console.log(`  ${row.slug}: ${row.youtubeUrl} (${row.name})`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
