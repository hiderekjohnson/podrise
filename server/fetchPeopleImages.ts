import fs from "fs";
import path from "path";
import https from "https";
import http from "http";

const PEOPLE_DIR = path.join(process.cwd(), "client", "public", "people");
const PLACEHOLDER_SIZE_THRESHOLD = 5000;
const TARGET_SIZE = 256;

interface PersonRecord {
  slug: string;
  name: string;
  twitterHandle?: string;
  imageUrl: string;
  imageStatus: "resolved" | "pending" | "fallback";
  imageSource?: "local" | "wikimedia" | "twitter" | "fallback";
}

function getExistingImageStatus(slug: string): { exists: boolean; isPlaceholder: boolean } {
  const filePath = path.join(PEOPLE_DIR, `${slug}.png`);
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
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      };

      const mod = url.startsWith("https") ? https : http;
      const req = mod.get(url, { headers: { "User-Agent": "PodCap/1.0 (podcap.io; profile-image-pipeline)" }, timeout: 8000 }, handler);
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    } catch (err) {
      reject(err);
    }
  });
}

async function fetchJson(url: string): Promise<any> {
  const buf = await fetchUrl(url);
  return JSON.parse(buf.toString("utf8"));
}

async function tryWikipedia(name: string, context?: string): Promise<string | null> {
  try {
    const nameParts = name.toLowerCase().split(/\s+/);
    const lastName = nameParts[nameParts.length - 1];
    const firstName = nameParts[0];

    const queries = [name];
    if (context) queries.push(`${name} ${context}`);

    const isNameMatch = (title: string) => {
      const titleLower = title.toLowerCase();
      const titleParts = titleLower.split(/\s+/);
      if (titleLower === name.toLowerCase()) return true;
      if (titleLower.includes(name.toLowerCase())) return true;
      if (name.toLowerCase().includes(titleLower)) return true;
      if (titleParts.includes(lastName) && titleParts.includes(firstName)) return true;
      if (titleParts.includes(lastName) && titleParts.some(p => p.startsWith(firstName.substring(0, 3)))) return true;
      if (titleParts.includes(lastName) && nameParts.some(np => titleParts.some(tp => tp.startsWith(np) || np.startsWith(tp)))) return true;
      return false;
    };

    for (const query of queries) {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5`;
      const searchResult = await fetchJson(searchUrl);
      const results = searchResult?.query?.search;
      if (!results || results.length === 0) continue;

      const bestMatch = results.find((r: any) => isNameMatch(r.title));
      if (!bestMatch) continue;

      const pageTitle = bestMatch.title;
      const imageUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(pageTitle)}&prop=pageimages&pithumbsize=400`;
      const imageResult = await fetchJson(imageUrl);
      const pages = imageResult?.query?.pages;
      if (!pages) continue;

      for (const pageId of Object.keys(pages)) {
        const page = pages[pageId];
        if (page.thumbnail?.source) {
          return page.thumbnail.source;
        }
      }
    }
    return null;
  } catch (err) {
    console.log(`  Wikipedia lookup failed for ${name}: ${(err as Error).message}`);
    return null;
  }
}

async function tryTwitter(handle: string): Promise<string | null> {
  try {
    const cleanHandle = handle.replace(/^https?:\/\/(x\.com|twitter\.com)\//, "").replace(/^@/, "").split("/")[0].trim();
    if (!cleanHandle) return null;

    const unavatarUrl = `https://unavatar.io/x/${cleanHandle}?fallback=false`;
    const buf = await fetchUrl(unavatarUrl);
    if (buf.length < 5000) return null;
    return unavatarUrl;
  } catch {
    return null;
  }
}

async function downloadAndSaveImage(url: string, slug: string, retries = 1): Promise<boolean> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, 1000));
      }
      const buf = await fetchUrl(url);
      if (buf.length < 5000) return false;

      const filePath = path.join(PEOPLE_DIR, `${slug}.png`);
      fs.writeFileSync(filePath, buf);
      console.log(`  Saved image for ${slug} (${(buf.length / 1024).toFixed(1)} KB)`);
      return true;
    } catch (err) {
      const msg = (err as Error).message;
      if (attempt < retries) continue;
      return false;
    }
  }
  return false;
}

function extractTwitterHandle(socialLinks: any): string | null {
  if (!socialLinks?.twitter) return null;
  const url = socialLinks.twitter;
  const match = url.match(/(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]+)/);
  return match ? match[1] : null;
}

async function resolvePersonImage(person: { slug: string; name: string; title?: string; socialLinks?: any }): Promise<{ source: string; resolved: boolean }> {
  const { exists, isPlaceholder } = getExistingImageStatus(person.slug);

  if (exists && !isPlaceholder) {
    return { source: "local", resolved: true };
  }

  console.log(`\nResolving image for: ${person.name} (${person.slug})`);

  const wikiUrl = await tryWikipedia(person.name, person.title);
  if (wikiUrl) {
    console.log(`  Found Wikipedia image: ${wikiUrl.substring(0, 80)}...`);
    const saved = await downloadAndSaveImage(wikiUrl, person.slug);
    if (saved) return { source: "wikimedia", resolved: true };
  }

  const twitterHandle = extractTwitterHandle(person.socialLinks);
  if (twitterHandle) {
    console.log(`  Trying Twitter (@${twitterHandle})...`);
    const twitterUrl = await tryTwitter(twitterHandle);
    if (twitterUrl) {
      const saved = await downloadAndSaveImage(twitterUrl, person.slug);
      if (saved) return { source: "twitter", resolved: true };
    }
  }

  const defaultAvatarPath = path.join(PEOPLE_DIR, "default-avatar.png");
  const personPath = path.join(PEOPLE_DIR, `${person.slug}.png`);
  if (fs.existsSync(defaultAvatarPath)) {
    fs.copyFileSync(defaultAvatarPath, personPath);
    console.log(`  No image found, set to default avatar`);
  } else {
    console.log(`  No image found, keeping fallback`);
  }
  return { source: "fallback", resolved: false };
}

export async function runImagePipeline(peopleData: { slug: string; name: string; title?: string; socialLinks?: any }[], onlyMissing = true): Promise<{
  total: number;
  resolved: number;
  skipped: number;
  failed: number;
  results: { slug: string; name: string; source: string; resolved: boolean }[];
}> {
  const results: { slug: string; name: string; source: string; resolved: boolean }[] = [];
  let resolved = 0;
  let skipped = 0;
  let failed = 0;

  if (!fs.existsSync(PEOPLE_DIR)) {
    fs.mkdirSync(PEOPLE_DIR, { recursive: true });
  }

  const toProcess: typeof peopleData = [];
  for (const person of peopleData) {
    if (onlyMissing) {
      const { exists, isPlaceholder } = getExistingImageStatus(person.slug);
      if (exists && !isPlaceholder) {
        skipped++;
        results.push({ slug: person.slug, name: person.name, source: "local", resolved: true });
        continue;
      }
    }
    toProcess.push(person);
  }

  console.log(`${toProcess.length} people need images (${skipped} already have good images)`);

  const CONCURRENCY = 2;
  for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
    const batch = toProcess.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(person => resolvePersonImage(person).catch(() => ({ source: "error", resolved: false }))));

    for (let j = 0; j < batch.length; j++) {
      const person = batch[j];
      const result = batchResults[j];
      results.push({ slug: person.slug, name: person.name, ...result });

      if (result.resolved && result.source !== "local") {
        resolved++;
      } else if (!result.resolved) {
        failed++;
      } else {
        skipped++;
      }
    }

    const processed = Math.min(i + CONCURRENCY, toProcess.length);
    if (processed % 10 === 0 || processed === toProcess.length) {
      console.log(`  Progress: ${processed}/${toProcess.length} (${resolved} resolved, ${failed} failed)`);
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  return { total: peopleData.length, resolved, skipped, failed, results };
}

const isMainModule = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("fetchPeopleImages.ts");
if (isMainModule) {
  process.on("uncaughtException", (err) => { console.error("Uncaught:", err.message); });
  process.on("unhandledRejection", (err: any) => { console.error("Unhandled:", err?.message || err); });
  (async () => {
    const { PEOPLE_DIRECTORY } = await import("../client/src/data/entityDirectoryData");

    const people = PEOPLE_DIRECTORY.map((p: any) => ({
      slug: p.slug,
      name: p.name,
      title: p.title,
      socialLinks: p.socialLinks,
    }));

    console.log(`Found ${people.length} people in directory`);
    console.log(`Checking for missing or placeholder images...\n`);

    const result = await runImagePipeline(people, true);
    console.log(`\n--- Results ---`);
    console.log(`Total: ${result.total}`);
    console.log(`Already had images: ${result.skipped}`);
    console.log(`Newly resolved: ${result.resolved}`);
    console.log(`Still missing: ${result.failed}`);

    const newlyResolved = result.results.filter(r => r.source !== "local" && r.resolved);
    if (newlyResolved.length > 0) {
      console.log(`\nNewly resolved:`);
      for (const r of newlyResolved) {
        console.log(`  ${r.name} (${r.slug}) via ${r.source}`);
      }
    }

    const stillMissing = result.results.filter(r => !r.resolved);
    if (stillMissing.length > 0) {
      console.log(`\nStill missing:`);
      for (const r of stillMissing) {
        console.log(`  ${r.name} (${r.slug})`);
      }
    }
  })();
}