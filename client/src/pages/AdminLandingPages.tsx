import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Copy, Check, ExternalLink, ChevronDown, ChevronUp, Save } from "lucide-react";
import { LANDING_PAGES } from "@/data/landingPageConfig";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface LandingPageAnalytics {
  visitsBySlug: Record<string, { totalVisits: number; uniqueVisits: number }>;
  signupsBySlug: Record<string, { totalSignups: number; verifiedUsers: number }>;
  utmBySlug: Record<string, { utmSource: string; utmMedium: string; utmCampaign: string; visits: number }[]>;
  timeSeriesBySlug: Record<string, { date: string; visits: number }[]>;
}

interface PixelSettings {
  verificationTags: string;
  pixels: {
    facebook: string;
    tiktok: string;
    googleAds: string;
    twitter: string;
    linkedin: string;
    pinterest: string;
    snapchat: string;
    custom: string;
  };
}

const PIXEL_PLATFORMS = [
  { key: "facebook" as const, label: "Facebook / Meta" },
  { key: "tiktok" as const, label: "TikTok" },
  { key: "googleAds" as const, label: "Google Ads" },
  { key: "twitter" as const, label: "Twitter / X" },
  { key: "linkedin" as const, label: "LinkedIn" },
  { key: "pinterest" as const, label: "Pinterest" },
  { key: "snapchat" as const, label: "Snapchat" },
  { key: "custom" as const, label: "Custom" },
] as const;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: "Copied!", description: "URL copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-lg hover:bg-black/[0.05] transition-colors"
      data-testid={`button-copy-${text}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
    </button>
  );
}

function populateFormFromSettings(
  settings: PixelSettings,
  setVerificationTags: (v: string) => void,
  setPixels: (p: Record<string, string>) => void,
) {
  setVerificationTags(settings.verificationTags || "");
  const p: Record<string, string> = {};
  for (const platform of PIXEL_PLATFORMS) {
    p[platform.key] = settings.pixels?.[platform.key] || "";
  }
  setPixels(p);
}

function AdPixelsPanel() {
  const { toast } = useToast();
  const [verificationTagsOpen, setVerificationTagsOpen] = useState(true);
  const [trackingPixelsOpen, setTrackingPixelsOpen] = useState(true);
  const [verificationTags, setVerificationTags] = useState("");
  const [pixels, setPixels] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);

  const { data, isLoading } = useQuery<PixelSettings>({
    queryKey: ["/api/admin/site-settings/pixels"],
  });

  useEffect(() => {
    if (data && !initialized) {
      populateFormFromSettings(data, setVerificationTags, setPixels);
      setInitialized(true);
    }
  }, [data, initialized]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", "/api/admin/site-settings/pixels", {
        verificationTags,
        pixels,
      });
      return response.json() as Promise<{ ok: boolean; settings: PixelSettings }>;
    },
    onSuccess: async (result) => {
      if (result?.settings) {
        populateFormFromSettings(result.settings, setVerificationTags, setPixels);
        queryClient.setQueryData(["/api/admin/site-settings/pixels"], result.settings);
      } else {
        await queryClient.invalidateQueries({ queryKey: ["/api/admin/site-settings/pixels"] });
      }
      toast({ title: "Saved", description: "Ad pixels & verification tags updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-6 space-y-4" data-testid="panel-ad-pixels">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-foreground" data-testid="heading-ad-pixels">Ad Pixels & Verification</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Manage tracking pixels and domain verification tags injected into every page</p>
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          data-testid="button-save-pixels"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save
        </button>
      </div>

      <div className="border border-black/[0.06] rounded-xl overflow-hidden">
        <button
          onClick={() => setVerificationTagsOpen(!verificationTagsOpen)}
          className="w-full flex items-center justify-between px-4 py-3 bg-black/[0.02] hover:bg-black/[0.04] transition-colors text-left"
          data-testid="button-toggle-verification-tags"
        >
          <span className="text-sm font-semibold text-foreground">Domain Verification Tags</span>
          {verificationTagsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {verificationTagsOpen && (
          <div className="p-4">
            <p className="text-xs text-muted-foreground mb-2">
              Paste domain verification meta tags (e.g. &lt;meta name="facebook-domain-verification" content="..." /&gt;). These are injected into the &lt;head&gt; of every page.
            </p>
            <textarea
              value={verificationTags}
              onChange={(e) => setVerificationTags(e.target.value)}
              placeholder='<meta name="facebook-domain-verification" content="abc123" />'
              className="w-full h-24 px-3 py-2 text-xs font-mono rounded-lg border border-black/[0.08] bg-black/[0.02] focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
              data-testid="textarea-verification-tags"
            />
          </div>
        )}
      </div>

      <div className="border border-black/[0.06] rounded-xl overflow-hidden">
        <button
          onClick={() => setTrackingPixelsOpen(!trackingPixelsOpen)}
          className="w-full flex items-center justify-between px-4 py-3 bg-black/[0.02] hover:bg-black/[0.04] transition-colors text-left"
          data-testid="button-toggle-tracking-pixels"
        >
          <span className="text-sm font-semibold text-foreground">Tracking Pixels</span>
          {trackingPixelsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {trackingPixelsOpen && (
          <div className="p-4 space-y-4">
            {PIXEL_PLATFORMS.map((platform) => (
              <div key={platform.key}>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  {platform.label}
                </label>
                <textarea
                  value={pixels[platform.key] || ""}
                  onChange={(e) =>
                    setPixels((prev) => ({ ...prev, [platform.key]: e.target.value }))
                  }
                  placeholder={`Paste your ${platform.label} pixel/tag code here...`}
                  className="w-full h-20 px-3 py-2 text-xs font-mono rounded-lg border border-black/[0.08] bg-black/[0.02] focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
                  data-testid={`textarea-pixel-${platform.key}`}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminLandingPages() {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  const { data: analytics, isLoading, error } = useQuery<LandingPageAnalytics>({
    queryKey: ["/api/admin/landing-pages/analytics"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 text-destructive" data-testid="error-landing-pages">
        <p className="text-sm font-medium">Failed to load landing page analytics. Please try again.</p>
      </div>
    );
  }

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground" data-testid="heading-landing-pages">Landing Pages</h2>
          <p className="text-sm text-muted-foreground">Performance metrics for Facebook ad landing pages</p>
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" data-testid="table-landing-pages">
            <thead>
              <tr className="border-b border-black/[0.06] bg-black/[0.02]">
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">URL</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Visits</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Unique Visits</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Signups</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Verified</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Conv. Rate</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Verif. Rate</th>
                <th className="text-center px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Details</th>
              </tr>
            </thead>
              {LANDING_PAGES.map((page) => {
                const visits = analytics?.visitsBySlug[page.slug] || { totalVisits: 0, uniqueVisits: 0 };
                const signups = analytics?.signupsBySlug[page.slug] || { totalSignups: 0, verifiedUsers: 0 };
                const convRate = visits.totalVisits > 0 ? ((signups.totalSignups / visits.totalVisits) * 100).toFixed(1) : "0.0";
                const verifRate = signups.totalSignups > 0 ? ((signups.verifiedUsers / signups.totalSignups) * 100).toFixed(1) : "0.0";
                const fullUrl = `${baseUrl}/lp/${page.slug}`;
                const isExpanded = expandedSlug === page.slug;
                const utmData = analytics?.utmBySlug[page.slug] || [];
                const timeData = analytics?.timeSeriesBySlug[page.slug] || [];

                return (
                  <tbody key={page.slug}>
                    <tr
                      className="border-b border-black/[0.04] hover:bg-black/[0.01] transition-colors"
                      data-testid={`row-landing-page-${page.slug}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ background: page.heroAccent }}
                          />
                          <span className="font-semibold text-sm text-foreground">{page.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs text-muted-foreground bg-black/[0.04] px-2 py-0.5 rounded">/lp/{page.slug}</code>
                          <CopyButton text={fullUrl} />
                          <a
                            href={`/lp/${page.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg hover:bg-black/[0.05] transition-colors"
                            data-testid={`link-preview-${page.slug}`}
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                          </a>
                        </div>
                      </td>
                      <td className="text-right px-4 py-3 text-sm font-semibold tabular-nums" data-testid={`stat-total-visits-${page.slug}`}>
                        {visits.totalVisits.toLocaleString()}
                      </td>
                      <td className="text-right px-4 py-3 text-sm tabular-nums text-muted-foreground" data-testid={`stat-unique-visits-${page.slug}`}>
                        {visits.uniqueVisits.toLocaleString()}
                      </td>
                      <td className="text-right px-4 py-3 text-sm font-semibold tabular-nums" data-testid={`stat-signups-${page.slug}`}>
                        {signups.totalSignups.toLocaleString()}
                      </td>
                      <td className="text-right px-4 py-3 text-sm tabular-nums text-muted-foreground" data-testid={`stat-verified-${page.slug}`}>
                        {signups.verifiedUsers.toLocaleString()}
                      </td>
                      <td className="text-right px-4 py-3 text-sm font-semibold tabular-nums" data-testid={`stat-conv-rate-${page.slug}`}>
                        {convRate}%
                      </td>
                      <td className="text-right px-4 py-3 text-sm tabular-nums text-muted-foreground" data-testid={`stat-verif-rate-${page.slug}`}>
                        {verifRate}%
                      </td>
                      <td className="text-center px-4 py-3">
                        <button
                          onClick={() => setExpandedSlug(isExpanded ? null : page.slug)}
                          className="p-1.5 rounded-lg hover:bg-black/[0.05] transition-colors"
                          data-testid={`button-expand-${page.slug}`}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr data-testid={`row-details-${page.slug}`}>
                        <td colSpan={9} className="px-4 py-4 bg-black/[0.01]">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div>
                              <h4 className="text-sm font-bold text-foreground mb-3">UTM Breakdown</h4>
                              {utmData.length > 0 ? (
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-black/[0.06]">
                                      <th className="text-left py-1.5 text-xs font-semibold text-muted-foreground">Source</th>
                                      <th className="text-left py-1.5 text-xs font-semibold text-muted-foreground">Medium</th>
                                      <th className="text-left py-1.5 text-xs font-semibold text-muted-foreground">Campaign</th>
                                      <th className="text-right py-1.5 text-xs font-semibold text-muted-foreground">Visits</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {utmData.slice(0, 10).map((utm, i) => (
                                      <tr key={i} className="border-b border-black/[0.03]">
                                        <td className="py-1.5">{utm.utmSource}</td>
                                        <td className="py-1.5 text-muted-foreground">{utm.utmMedium}</td>
                                        <td className="py-1.5 text-muted-foreground">{utm.utmCampaign}</td>
                                        <td className="text-right py-1.5 font-semibold tabular-nums">{utm.visits}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <p className="text-sm text-muted-foreground">No UTM data yet</p>
                              )}
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-foreground mb-3">Daily Visits (Last 30 Days)</h4>
                              {timeData.length > 0 ? (
                                <div className="space-y-1">
                                  {timeData.slice(-14).map((d, i) => {
                                    const maxVisits = Math.max(...timeData.map(t => t.visits));
                                    const widthPct = maxVisits > 0 ? (d.visits / maxVisits) * 100 : 0;
                                    return (
                                      <div key={i} className="flex items-center gap-2 text-xs">
                                        <span className="w-16 text-muted-foreground tabular-nums shrink-0">
                                          {new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                        </span>
                                        <div className="flex-1 h-4 bg-black/[0.03] rounded-full overflow-hidden">
                                          <div
                                            className="h-full rounded-full transition-all"
                                            style={{ width: `${widthPct}%`, background: page.heroAccent }}
                                          />
                                        </div>
                                        <span className="w-8 text-right font-semibold tabular-nums">{d.visits}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">No visit data yet</p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
          </table>
        </div>
      </div>

      <AdPixelsPanel />
    </div>
  );
}
