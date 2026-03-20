import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function hiResArtwork(url: string | null): string {
  if (!url) return "";
  if (url.startsWith("/artwork/")) return url;
  return url.replace(/\/\d+x\d+bb\./, "/300x300bb.");
}

const TRACKABLE_DOMAINS = [
  "amazon.com", "amzn.to",
  "blinkist.com", "go.blinkist.com",
  "audible.com", "bookshop.org", "barnesandnoble.com",
  "target.com", "walmart.com",
  "apple.com", "apps.apple.com",
  "open.spotify.com", "podcasts.apple.com",
];

export function trackAffiliateUrl(url: string, name: string, type: "book" | "product", productId?: number | null): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (!TRACKABLE_DOMAINS.some(d => hostname === d || hostname === "www." + d || hostname.endsWith("." + d))) {
      return url;
    }
  } catch {
    return url;
  }
  const params = new URLSearchParams();
  params.set("url", url);
  params.set("name", name);
  params.set("type", type);
  if (productId) params.set("pid", String(productId));
  params.set("ref", window.location.pathname);
  return `/api/track/affiliate-click?${params.toString()}`;
}
