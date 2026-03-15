import { generateAndSavePulse, topicKeywordsMap } from "./pulseGenerator";

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

async function main() {
  const args = process.argv.slice(2);
  let dates: string[] = [];

  for (const arg of args) {
    if (arg.startsWith("--dates=")) {
      dates = arg.replace("--dates=", "").split(",");
    }
  }

  if (dates.length === 0) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    dates = [yesterday.toISOString().split("T")[0]];
    console.log(`No dates specified, defaulting to yesterday: ${dates[0]}`);
  }

  const slugs = Object.keys(topicKeywordsMap);
  console.log(`Generating pulses for ${slugs.length} topics across ${dates.length} date(s): ${dates.join(", ")}\n`);

  let totalSuccess = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const date of dates) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`DATE: ${date}`);
    console.log(`${"=".repeat(60)}`);

    let success = 0;
    let skipped = 0;
    let failed = 0;

    for (const slug of slugs) {
      const name = TOPIC_NAMES[slug] || slug;
      const idx = success + skipped + failed + 1;
      try {
        console.log(`  [${idx}/${slugs.length}] ${name}...`);
        const pulse = await generateAndSavePulse(slug, date, name);
        if (pulse) {
          console.log(`    ✓ "${pulse.headline}" (${pulse.episodeCount} episodes)`);
          success++;
        } else {
          console.log(`    — No relevant episodes`);
          skipped++;
        }
      } catch (err: any) {
        console.error(`    ✗ Error: ${err.message}`);
        failed++;
      }
    }

    console.log(`\n  ${date} results: ${success} generated, ${skipped} skipped, ${failed} failed`);
    totalSuccess += success;
    totalSkipped += skipped;
    totalFailed += failed;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`TOTAL: ${totalSuccess} generated, ${totalSkipped} skipped, ${totalFailed} failed`);
  console.log(`${"=".repeat(60)}`);
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
