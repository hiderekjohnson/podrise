import { storage } from "./storage";
import type { PixelSettings } from "@shared/schema";

let cachedSettings: PixelSettings | null = null;
let cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

export function invalidatePixelCache(): void {
  cachedSettings = null;
  cachedAt = 0;
}

async function getPixelSettings(): Promise<PixelSettings | null> {
  if (cachedSettings && Date.now() - cachedAt < CACHE_TTL) {
    return cachedSettings;
  }
  try {
    const raw = await storage.getSiteSetting("pixels");
    if (!raw) return null;
    cachedSettings = raw as PixelSettings;
    cachedAt = Date.now();
    return cachedSettings;
  } catch (err) {
    console.error("[PixelInjector] Error fetching pixel settings:", err);
    return null;
  }
}

export async function injectPixels(html: string): Promise<string> {
  const settings = await getPixelSettings();
  if (!settings) return html;

  let headContent = "";
  let bodyContent = "";

  if (settings.verificationTags?.trim()) {
    headContent += settings.verificationTags.trim() + "\n";
  }

  const pixels = settings.pixels || {};
  for (const [, snippet] of Object.entries(pixels)) {
    if (!snippet?.trim()) continue;

    const scriptMatches = snippet.match(/<script[\s\S]*?<\/script>/gi) || [];
    const linkMatches = snippet.match(/<link[^>]*\/?>/gi) || [];
    for (const s of [...scriptMatches, ...linkMatches]) {
      headContent += s + "\n";
    }

    const noscriptMatches = snippet.match(/<noscript[\s\S]*?<\/noscript>/gi) || [];
    for (const ns of noscriptMatches) {
      bodyContent += ns + "\n";
    }

    let remaining = snippet;
    for (const ns of noscriptMatches) {
      remaining = remaining.replace(ns, "");
    }
    for (const s of scriptMatches) {
      remaining = remaining.replace(s, "");
    }
    const topLevelImgs = remaining.match(/<img[^>]*\/?>/gi) || [];
    for (const img of topLevelImgs) {
      bodyContent += img + "\n";
    }
  }

  if (headContent) {
    html = html.replace("</head>", `${headContent}</head>`);
  }

  if (bodyContent) {
    html = html.replace(/<body(\s[^>]*)?>/, (match) => `${match}\n${bodyContent}`);
  }

  return html;
}
