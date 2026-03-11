import fs from "fs";
import path from "path";
import https from "https";
import http from "http";

const LOGOS_DIR = path.join(process.cwd(), "client", "public", "logos");
const PLACEHOLDER_SIZE_THRESHOLD = 1000;
const LOGO_DEV_TOKEN = "pk_LXNkoTXrTpe8BARnvuKgHA";

function getExistingLogoStatus(slug: string): { exists: boolean; isPlaceholder: boolean } {
  const filePath = path.join(LOGOS_DIR, `${slug}.png`);
  if (!fs.existsSync(filePath)) return { exists: false, isPlaceholder: false };
  const stat = fs.statSync(filePath);
  return { exists: true, isPlaceholder: stat.size < PLACEHOLDER_SIZE_THRESHOLD };
}

function fetchUrl(url: string, redirectCount = 0): Promise<Buffer> {
  if (redirectCount > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    try {
      const handler = (res: http.IncomingMessage) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchUrl(res.headers.location, redirectCount + 1).then(resolve).catch(reject);
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
      protocol.get(url, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 10000 }, handler).on("error", reject);
    } catch (err) {
      reject(err);
    }
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

async function fetchLogoFromLogoDev(slug: string, domain: string): Promise<boolean> {
  const url = `https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}&size=256&format=png`;
  try {
    const data = await fetchUrl(url);
    if (data.length > PLACEHOLDER_SIZE_THRESHOLD) {
      const outPath = path.join(LOGOS_DIR, `${slug}.png`);
      fs.writeFileSync(outPath, data);
      return true;
    }
    return false;
  } catch {
    return false;
  }
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
      console.log(`  ✗ ${company.name} (${company.slug}) - no website URL`);
      noDomain++;
      continue;
    }

    process.stdout.write(`  ${company.name} (${company.domain})... `);

    const success = await fetchLogoFromLogoDev(company.slug, company.domain);
    if (success) {
      const size = fs.statSync(path.join(LOGOS_DIR, `${company.slug}.png`)).size;
      console.log(`✓ (${(size / 1024).toFixed(1)}KB)`);
      resolved++;
    } else {
      console.log(`✗`);
      failed++;
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\n===== Results =====`);
  console.log(`Resolved: ${resolved}`);
  console.log(`Failed: ${failed}`);
  console.log(`No domain: ${noDomain}`);
}

process.on("uncaughtException", (err) => { console.error("Uncaught:", err.message); });
process.on("unhandledRejection", (err: any) => { console.error("Unhandled:", err?.message || err); });
main().catch(console.error);
