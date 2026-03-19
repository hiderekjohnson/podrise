const UTM_STORAGE_KEY = "utm_params";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export interface UtmParams {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
}

export function captureUtmParams(): void {
  const params = new URLSearchParams(window.location.search);
  const hasUtm = UTM_KEYS.some((key) => params.has(key));
  if (!hasUtm) return;

  const utmData: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const val = params.get(key);
    if (val) utmData[key] = val;
  }

  if (Object.keys(utmData).length > 0) {
    sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utmData));
  }
}

export function getGoogleOAuthUrl(): string {
  const base = "/api/auth/google";
  try {
    const raw = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (!raw) return base;
    const data = JSON.parse(raw);
    const params = new URLSearchParams();
    for (const key of UTM_KEYS) {
      if (data[key]) params.set(key, data[key]);
    }
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  } catch {
    return base;
  }
}

export function getStoredUtmParams(): UtmParams {
  try {
    const raw = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return {
      utmSource: data.utm_source || undefined,
      utmMedium: data.utm_medium || undefined,
      utmCampaign: data.utm_campaign || undefined,
      utmContent: data.utm_content || undefined,
      utmTerm: data.utm_term || undefined,
    };
  } catch {
    return {};
  }
}
