import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Copy, Check, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { LANDING_PAGES } from "@/data/landingPageConfig";
import { useToast } from "@/hooks/use-toast";

interface LandingPageAnalytics {
  visitsBySlug: Record<string, { totalVisits: number; uniqueVisits: number }>;
  signupsBySlug: Record<string, { totalSignups: number; verifiedUsers: number }>;
  utmBySlug: Record<string, { utmSource: string; utmMedium: string; utmCampaign: string; visits: number }[]>;
  timeSeriesBySlug: Record<string, { date: string; visits: number }[]>;
}

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
    </div>
  );
}
