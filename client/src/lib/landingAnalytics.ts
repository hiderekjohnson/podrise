import { apiRequest } from "@/lib/queryClient";

export function trackLandingPageVisit(slug: string) {
  const params = new URLSearchParams(window.location.search);
  const sessionId = sessionStorage.getItem("lp_session") || crypto.randomUUID();
  sessionStorage.setItem("lp_session", sessionId);

  apiRequest("POST", "/api/landing-pages/visit", {
    pageSlug: slug,
    sessionId,
    utmSource: params.get("utm_source") || undefined,
    utmMedium: params.get("utm_medium") || undefined,
    utmCampaign: params.get("utm_campaign") || undefined,
    utmContent: params.get("utm_content") || undefined,
    utmTerm: params.get("utm_term") || undefined,
  }).catch(() => {});
}
