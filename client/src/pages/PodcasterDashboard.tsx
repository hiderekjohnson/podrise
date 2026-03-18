import { useState, useEffect } from "react";
import { Link, useParams, useLocation } from "wouter";
import { Mic, Save, Loader2, ExternalLink, Tag, Link2, MessageSquare, ArrowLeft, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/Footer";
import { PodRiseWordmark } from "@/components/PodRiseHeader";

type Sponsor = {
  name: string;
  description?: string;
  couponCode?: string;
  url?: string;
  howToRedeem?: string;
};

type EpisodeSponsor = {
  episodeTitle: string;
  episodeSlug: string;
  publishDate: string;
  sponsors: Sponsor[];
};

type DashboardData = {
  claim: {
    id: number;
    podcastSlug: string;
    email: string;
    name: string;
    verified: boolean;
    byline: { text: string; url: string; label: string };
    customSponsors: Sponsor[];
  };
  podcast: {
    name: string;
    artworkUrl: string;
    description: string;
  };
  episodeSponsors: EpisodeSponsor[];
};

function PodcasterLogin({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const loginMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/podcaster/login", { email });
    },
    onSuccess: () => {
      setSent(true);
    },
    onError: (err: any) => {
      toast({ title: "Login failed", description: err?.message || "No account found for this email", variant: "destructive" });
    },
  });

  return (
    <div className="max-w-md mx-auto px-6 py-20">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/[0.07] text-primary text-[14px] font-display font-bold uppercase tracking-widest mb-6">
          <Mic className="w-3.5 h-3.5" />
          Podcaster Dashboard
        </div>
        <h1 className="text-[1.5rem] font-display font-extrabold tracking-[-0.03em] mb-2" data-testid="text-login-title">
          Sign in to your dashboard
        </h1>
        <p className="text-[15px] text-muted-foreground">
          We'll send a login link to your email
        </p>
      </div>

      {sent ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center" data-testid="section-login-sent">
          <CheckCircle2 className="w-10 h-10 text-[#6366F1] mx-auto mb-4" />
          <h3 className="text-lg font-display font-bold mb-2">Check your email</h3>
          <p className="text-[15px] text-muted-foreground">
            We sent a login link to <strong>{email}</strong>. Click it to access your dashboard.
          </p>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!email.trim()) return;
            loginMutation.mutate();
          }}
          className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-4"
          data-testid="form-login"
        >
          <div>
            <label className="block text-[14px] font-display font-semibold mb-1.5">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourpodcast.com"
              required
              className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-[14px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
              data-testid="input-email"
            />
          </div>
          <Button
            type="submit"
            disabled={loginMutation.isPending || !email.trim()}
            className="w-full rounded-xl font-display font-bold text-[14px] h-10"
            data-testid="button-login"
          >
            {loginMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {loginMutation.isPending ? "Sending..." : "Send Login Link"}
          </Button>
        </form>
      )}

      <p className="text-center text-[14px] text-muted-foreground/60 mt-6">
        Don't have an account? <Link href="/podcaster/claim" className="text-primary font-semibold hover:underline" data-testid="link-claim">Claim your podcast first</Link>
      </p>
    </div>
  );
}

export default function PodcasterDashboard() {
  const { toast } = useToast();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [, setLocation] = useLocation();
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  const [bylineText, setBylineText] = useState("");
  const [bylineUrl, setBylineUrl] = useState("");
  const [bylineLabel, setBylineLabel] = useState("");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");
    if (token) {
      fetch(`/api/podcaster/verify?token=${token}`, { credentials: "include" })
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.podcasts?.length > 0) {
            setIsAuthed(true);
            setLocation(`/podcaster/dashboard/${data.podcasts[0]}`);
          } else if (data.success) {
            setIsAuthed(true);
          } else {
            toast({ title: "Login link expired", description: "Please request a new one", variant: "destructive" });
            setIsAuthed(false);
          }
        })
        .catch(() => setIsAuthed(false));
    } else {
      setIsAuthed(true);
    }
  }, []);

  const { data, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ["/api/podcaster/dashboard", slug],
    enabled: isAuthed === true && !!slug,
    retry: false,
  });

  useEffect(() => {
    if (data?.claim) {
      setBylineText(data.claim.byline.text);
      setBylineUrl(data.claim.byline.url);
      setBylineLabel(data.claim.byline.label);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/podcaster/dashboard/${slug}`, {
        bylineText,
        bylineUrl: bylineUrl || "",
        bylineLabel,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/podcaster/dashboard", slug] });
      toast({ title: "Saved", description: "Your changes have been saved" });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Something went wrong", variant: "destructive" });
    },
  });

  if (isAuthed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!slug || (isError && !data)) {
    return (
      <>
        <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
          <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-6">
            <Link href="/" data-testid="link-home"><PodRiseWordmark /></Link>
          </div>
        </nav>
        <PodcasterLogin onSuccess={() => setIsAuthed(true)} />
        <Footer />
      </>
    );
  }

  const uniqueSponsors = new Map<string, { sponsor: Sponsor; count: number; episodes: string[] }>();
  (data?.episodeSponsors || []).forEach((ep) => {
    ep.sponsors.forEach((s) => {
      const key = s.name.toLowerCase().trim();
      if (!uniqueSponsors.has(key)) {
        uniqueSponsors.set(key, { sponsor: s, count: 0, episodes: [] });
      }
      const entry = uniqueSponsors.get(key)!;
      entry.count++;
      if (!entry.episodes.includes(ep.episodeTitle)) {
        entry.episodes.push(ep.episodeTitle);
      }
    });
  });
  const sortedSponsors = [...uniqueSponsors.values()].sort((a, b) => b.count - a.count);

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md" data-testid="nav-bar">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-6">
          <Link href="/" data-testid="link-home"><PodRiseWordmark /></Link>
          {data?.claim && (
            <span className="text-[14px] text-muted-foreground">{data.claim.email}</span>
          )}
        </div>
      </nav>

      <main className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <Link href="/we-heart-podcasters" className="inline-flex items-center gap-1.5 text-[14px] text-muted-foreground hover:text-foreground mb-6 transition-colors" data-testid="link-back">
            <ArrowLeft className="w-3.5 h-3.5" />
            For Podcasters
          </Link>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-card border border-border rounded-2xl p-6 animate-pulse">
                  <div className="h-5 bg-muted rounded w-1/3 mb-3" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : data ? (
            <>
              <div className="flex items-center gap-4 mb-8">
                {data.podcast.artworkUrl && (
                  <img src={data.podcast.artworkUrl} alt="" className="w-16 h-16 rounded-xl object-cover" />
                )}
                <div>
                  <h1 className="text-xl font-display font-extrabold tracking-[-0.02em]" data-testid="text-podcast-name">
                    {data.podcast.name}
                  </h1>
                  <div className="flex items-center gap-2 mt-1">
                    {data.claim.verified ? (
                      <span className="inline-flex items-center gap-1 text-[12px] font-display font-bold text-[#6366F1] bg-[#EEF2FF] px-2 py-0.5 rounded-full" data-testid="badge-verified">
                        <CheckCircle2 className="w-3 h-3" /> Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[12px] font-display font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full" data-testid="badge-pending">
                        <Clock className="w-3 h-3" /> Pending Verification
                      </span>
                    )}
                    <Link href={`/podcasts/${slug}`} className="text-[14px] text-primary font-semibold hover:underline inline-flex items-center gap-0.5" data-testid="link-podcast-page">
                      View Page <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>

              {!data.claim.verified && (
                <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/30 dark:border-amber-800/30 rounded-2xl p-5 mb-6" data-testid="section-pending-notice">
                  <div className="flex gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[14px] font-display font-semibold text-foreground mb-1">Verification pending</p>
                      <p className="text-[14px] text-muted-foreground leading-relaxed">
                        Your claim is being reviewed. Once verified, you'll be able to customize your byline and sponsor information. Changes won't appear on your podcast pages until then.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <section className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-6" data-testid="section-byline">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <h2 className="text-[16px] font-display font-bold">Custom Byline</h2>
                </div>
                <p className="text-[14px] text-muted-foreground mb-5 leading-relaxed">
                  This message appears on every page and email recap featuring your podcast. Use it to promote your merch store, YouTube channel, newsletter, or anything else.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[14px] font-display font-semibold mb-1.5">Message</label>
                    <input
                      type="text"
                      value={bylineText}
                      onChange={(e) => setBylineText(e.target.value)}
                      placeholder="e.g., New episodes every Tuesday and Thursday"
                      maxLength={200}
                      className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-[14px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                      data-testid="input-byline-text"
                    />
                    <p className="text-[12px] text-muted-foreground/50 mt-1">{bylineText.length}/200</p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[14px] font-display font-semibold mb-1.5">Link Label</label>
                      <input
                        type="text"
                        value={bylineLabel}
                        onChange={(e) => setBylineLabel(e.target.value)}
                        placeholder="e.g., Visit Our Store"
                        maxLength={60}
                        className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-[14px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                        data-testid="input-byline-label"
                      />
                    </div>
                    <div>
                      <label className="block text-[14px] font-display font-semibold mb-1.5">Link URL</label>
                      <input
                        type="url"
                        value={bylineUrl}
                        onChange={(e) => setBylineUrl(e.target.value)}
                        placeholder="https://yourstore.com"
                        className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-[14px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                        data-testid="input-byline-url"
                      />
                    </div>
                  </div>

                  {bylineText && (
                    <div className="mt-4 p-4 bg-primary/[0.04] border border-primary/10 rounded-xl">
                      <p className="text-[12px] font-display font-bold text-muted-foreground/60 uppercase tracking-wider mb-2">Preview</p>
                      <div className="flex items-center gap-2 text-[14px]">
                        <Mic className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-foreground">{bylineText}</span>
                        {bylineLabel && bylineUrl && (
                          <a href={bylineUrl} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold hover:underline inline-flex items-center gap-0.5 shrink-0">
                            {bylineLabel} <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || !data.claim.verified}
                    className="rounded-xl font-display font-bold text-[14px] h-10 px-6"
                    data-testid="button-save-byline"
                  >
                    {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-2" />}
                    {saveMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </section>

              <section className="bg-card border border-border rounded-2xl p-6 sm:p-8" data-testid="section-sponsors">
                <div className="flex items-center gap-2 mb-1">
                  <Tag className="w-4 h-4 text-primary" />
                  <h2 className="text-[16px] font-display font-bold">Your Sponsors</h2>
                </div>
                <p className="text-[14px] text-muted-foreground mb-5 leading-relaxed">
                  These sponsors were detected in your episodes. They're displayed on your recap pages and in email recaps sent to your subscribers.
                </p>

                {sortedSponsors.length === 0 ? (
                  <div className="text-center py-8">
                    <Tag className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
                    <p className="text-[14px] text-muted-foreground">No sponsors detected yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sortedSponsors.map(({ sponsor, count }) => (
                      <div key={sponsor.name} className="flex items-start gap-3 p-3.5 bg-muted/30 rounded-xl" data-testid={`sponsor-${sponsor.name.toLowerCase().replace(/\s+/g, '-')}`}>
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Tag className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-[14px] font-display font-bold truncate">{sponsor.name}</p>
                            <span className="text-[12px] font-display font-bold text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded-full shrink-0">
                              {count} {count === 1 ? "episode" : "episodes"}
                            </span>
                          </div>
                          {sponsor.description && (
                            <p className="text-[14px] text-muted-foreground line-clamp-2">{sponsor.description}</p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-1.5">
                            {sponsor.couponCode && (
                              <span className="inline-flex items-center gap-1 text-[12px] font-mono font-bold text-[#6366F1] bg-[#EEF2FF] px-2 py-0.5 rounded">
                                {sponsor.couponCode}
                              </span>
                            )}
                            {sponsor.url && (
                              <a href={sponsor.url.startsWith("http") ? sponsor.url : `https://${sponsor.url}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline">
                                <Link2 className="w-3 h-3" />
                                {(() => { try { return new URL(sponsor.url.startsWith("http") ? sponsor.url : `https://${sponsor.url}`).hostname.replace("www.", ""); } catch { return sponsor.url; } })()}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[14px] text-muted-foreground/50 mt-5 leading-relaxed">
                  Sponsors are automatically extracted from your episode content. Contact us if you'd like to update or add sponsor information.
                </p>
              </section>
            </>
          ) : null}
        </div>
      </main>

      <Footer />
    </>
  );
}
