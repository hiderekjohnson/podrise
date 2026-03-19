export const PODCAST_ENRICHMENT_FIELDS = [
  { key: "description", label: "Description" },
  { key: "artwork_url", label: "Artwork" },
  { key: "apple_url", label: "Apple URL" },
  { key: "spotify_url", label: "Spotify URL" },
  { key: "youtube_url", label: "YouTube URL" },
  { key: "twitter_handle", label: "Twitter" },
  { key: "website_url", label: "Website" },
  { key: "category", label: "Category" },
  { key: "frequency", label: "Frequency" },
  { key: "about_podcast", label: "About Podcast" },
  { key: "hosts", label: "Hosts", altKey: "hosts_data", isArray: true },
  { key: "known_for", label: "Known For", isArray: true },
] as const;

export const EPISODE_ENRICHMENT_FIELDS = [
  { key: "transcript", label: "Transcript" },
  { key: "key_insights", label: "Key Insights", isArray: true },
  { key: "guests", label: "Guests", isArray: true },
  { key: "resources", label: "Resources", isArray: true },
  { key: "show_notes", label: "Show Notes" },
  { key: "tabloid_headline", label: "Tabloid" },
] as const;

export type EnrichmentField = {
  key: string;
  label: string;
  altKey?: string;
  isArray?: boolean;
};

const EMPTY_SENTINELS = new Set(["", "[]", "null"]);

function isValueFilled(val: any, isArray: boolean): boolean {
  if (val == null) return false;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (EMPTY_SENTINELS.has(trimmed)) return false;
    if (isArray) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) && parsed.length > 0;
      } catch {
        return true;
      }
    }
    return true;
  }
  return true;
}

export function computeEnrichmentFromRecord(
  record: Record<string, any>,
  fields: readonly EnrichmentField[]
): { score: number; fieldStatus: { label: string; filled: boolean }[] } {
  const fieldStatus = fields.map((f) => {
    let filled = isValueFilled(record[f.key], !!f.isArray);
    if (!filled && f.altKey) {
      filled = isValueFilled(record[f.altKey], true);
    }
    return { label: f.label, filled };
  });
  const filledCount = fieldStatus.filter((f) => f.filled).length;
  const score = fields.length > 0 ? Math.round((filledCount / fields.length) * 100) : 0;
  return { score, fieldStatus };
}
