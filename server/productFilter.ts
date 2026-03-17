const KNOWN_SPONSOR_BRANDS = new Set([
  "ag1", "athletic greens", "drinkag1",
  "delete me", "deleteme", "joindeleteme",
  "baselane",
  "stan store",
  "simply safe", "simplysafe",
  "uber eats", "ubereats",
  "tempo.fit",
  "mercury",
  "phyla",
  "ollie",
  "eight sleep", "eightsleep", "8sleep",
  "ritual",
  "cook unity", "cookunity",
  "hubspot",
  "bearskin",
  "lear capital",
  "graza",
  "element electrolyte", "lmnt",
  "function health",
  "momentous",
  "our place",
  "sundays for dogs",
  "waking up",
  "betterhelp", "better help",
  "squarespace",
  "athletic brewing",
  "shopify",
  "stamps.com",
  "ziprecruiter",
  "indeed",
  "manscaped",
  "liquid iv", "liquid i.v.",
  "helix sleep",
  "babbel",
  "masterclass",
  "calm",
  "noom",
  "bombas",
  "magic spoon",
  "athletic greens",
  "blinkist",
  "expressvpn",
  "nordvpn",
  "surfshark",
  "freshbooks",
  "hellofresh",
  "blue apron",
  "daily harvest",
  "built bar",
  "policy genius", "policygenius",
  "rocket money",
  "juve", "joovv",
  "david protein",
]);

const SPONSOR_URL_PATTERNS = [
  /\/(tyt|redacted|pivot|crooked|huberman|ferriss|daddy|podcast|pod|show)\/?$/i,
  /\/slash/i,
  /walmart\.com\/clorox/i,
];

const SPONSOR_CONTEXT_PATTERNS = [
  /\bsponsor(?:ed|s)?\b/i,
  /brought to you by/i,
  /promo code/i,
  /\buse code\b/i,
  /discount code/i,
  /special offer/i,
  /\bad read\b/i,
];

export interface ProductCandidate {
  name: string;
  company?: string | null;
  purchaseUrl?: string | null;
  context?: string | null;
  mentionType?: string | null;
  category?: string | null;
}

export interface FilterResult {
  isFiltered: boolean;
  reason: string | null;
}

export function isLikelySponsorProduct(product: ProductCandidate): FilterResult {
  const nameLower = (product.name || "").toLowerCase().trim();
  const companyLower = (product.company || "").toLowerCase().trim();
  const urlLower = (product.purchaseUrl || "").toLowerCase();
  const contextLower = (product.context || "").toLowerCase();
  const mentionType = (product.mentionType || "").toLowerCase();

  const isAdMention = mentionType === "ad_read" || mentionType === "sponsorship";

  if (!isAdMention) {
    for (const brand of KNOWN_SPONSOR_BRANDS) {
      if (nameLower.includes(brand) || companyLower.includes(brand)) {
        return { isFiltered: true, reason: "sponsor_ad" };
      }
    }

    if (nameLower === "ag1" || nameLower === "ag-1" || nameLower === "agz" || companyLower === "ag1") {
      return { isFiltered: true, reason: "sponsor_ad" };
    }

    for (const pattern of SPONSOR_URL_PATTERNS) {
      if (pattern.test(urlLower)) {
        return { isFiltered: true, reason: "sponsor_ad" };
      }
    }

    for (const pattern of SPONSOR_CONTEXT_PATTERNS) {
      if (pattern.test(contextLower)) {
        return { isFiltered: true, reason: "sponsor_ad" };
      }
    }
  }

  if (urlLower.includes("amazon.com/s?k=")) {
    return { isFiltered: true, reason: "not_specific_brand" };
  }

  if (
    (companyLower === "various" || companyLower === "various brands" || companyLower === "n/a" || companyLower === "") &&
    (/\b(setup|system|strategy|monitoring|offerings|method)\b/i.test(nameLower))
  ) {
    return { isFiltered: true, reason: "not_specific_brand" };
  }

  if (contextLower.includes("invested in") || contextLower.includes("portfolio company")) {
    return { isFiltered: true, reason: "investment_context" };
  }

  return { isFiltered: false, reason: null };
}
