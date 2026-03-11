import fs from "fs";
import path from "path";
import https from "https";
import http from "http";

const LOGOS_DIR = path.join(process.cwd(), "client", "public", "logos");
const PLACEHOLDER_SIZE_THRESHOLD = 1000;

function getExistingLogoStatus(slug: string): { exists: boolean; isPlaceholder: boolean; size: number } {
  const filePath = path.join(LOGOS_DIR, `${slug}.png`);
  if (!fs.existsSync(filePath)) return { exists: false, isPlaceholder: false, size: 0 };
  const stat = fs.statSync(filePath);
  return { exists: true, isPlaceholder: stat.size < PLACEHOLDER_SIZE_THRESHOLD, size: stat.size };
}

function fetchUrl(url: string, maxRedirects = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) { reject(new Error("Too many redirects")); return; }
    const handler = (res: http.IncomingMessage) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location, maxRedirects - 1).then(resolve).catch(reject);
        return;
      }
      if (!res.statusCode || res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    };
    const protocol = url.startsWith("https") ? https : http;
    protocol.get(url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" }, timeout: 10000 }, handler).on("error", reject);
  });
}

function extractDomain(websiteUrl: string): string | null {
  try {
    const url = new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function tryFetchLogo(slug: string, domain: string, companyName: string): Promise<boolean> {
  const sources = [
    { name: "Clearbit", url: `https://logo.clearbit.com/${domain}?size=256` },
    { name: "Unavatar", url: `https://unavatar.io/${domain}?fallback=false` },
    { name: "DuckDuckGo", url: `https://icons.duckduckgo.com/ip3/${domain}.ico` },
    { name: "Google HD", url: `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128` },
  ];

  for (const source of sources) {
    try {
      const data = await fetchUrl(source.url);
      if (data.length > PLACEHOLDER_SIZE_THRESHOLD) {
        const outPath = path.join(LOGOS_DIR, `${slug}.png`);
        fs.writeFileSync(outPath, data);
        console.log(`    ✓ ${source.name} (${(data.length / 1024).toFixed(1)}KB)`);
        return true;
      }
    } catch {}
  }
  return false;
}

async function main() {
  const { COMPANIES_DIRECTORY } = await import("../client/src/data/entityDirectoryData");

  if (!fs.existsSync(LOGOS_DIR)) {
    fs.mkdirSync(LOGOS_DIR, { recursive: true });
  }

  console.log(`Found ${COMPANIES_DIRECTORY.length} companies in directory`);

  const missing: Array<{ slug: string; name: string; domain: string | null }> = [];

  for (const company of COMPANIES_DIRECTORY) {
    const status = getExistingLogoStatus(company.slug);
    if (status.exists && !status.isPlaceholder) continue;

    const domain = company.details?.website ? extractDomain(company.details.website) : null;
    missing.push({ slug: company.slug, name: company.name, domain });
  }

  console.log(`${missing.length} companies need logos\n`);

  let resolved = 0;
  let failed = 0;
  let noDomain = 0;

  for (const company of missing) {
    if (!company.domain) {
      console.log(`  ✗ ${company.name} (${company.slug}) — no website URL`);
      noDomain++;
      continue;
    }

    process.stdout.write(`  ${company.name} (${company.domain})... `);

    try {
      const success = await tryFetchLogo(company.slug, company.domain, company.name);
      if (!success) {
        console.log(`✗ No usable logo found`);
        failed++;
      } else {
        resolved++;
      }
    } catch (err: any) {
      console.log(`✗ Error: ${err.message}`);
      failed++;
    }

    await new Promise((r) => setTimeout(r, 800));
  }

  console.log(`\n===== Results =====`);
  console.log(`Resolved: ${resolved}`);
  console.log(`Failed: ${failed}`);
  console.log(`No domain: ${noDomain}`);
  console.log(`Total missing: ${missing.length}`);
}

main().catch(console.error);
