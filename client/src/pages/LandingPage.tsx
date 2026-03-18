import { useState, useEffect } from "react";
import { useLocation, Link, useParams } from "wouter";
import { Loader2, Clock, Zap, Mail, Headphones, Sparkles, Search, TrendingUp, Target, Briefcase, CheckCircle2, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useRegister, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PodCapWordmark } from "@/components/PodCapHeader";
import { LANDING_PAGES, getLandingPageBySlug, type LandingPageConfig } from "@/data/landingPageConfig";
import { apiRequest } from "@/lib/queryClient";
import NotFound from "./not-found";

const ICON_MAP: Record<string, typeof Clock> = {
  clock: Clock,
  zap: Zap,
  mail: Mail,
  headphones: Headphones,
  sparkles: Sparkles,
  search: Search,
  "trending-up": TrendingUp,
  target: Target,
  briefcase: Briefcase,
};

function trackVisit(slug: string) {
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

function LandingPageContent({ config }: { config: LandingPageConfig }) {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  const { toast } = useToast();
  const { mutate: register, isPending } = useRegister();
  const [email, setEmail] = useState("");

  useEffect(() => {
    trackVisit(config.slug);
    document.title = `${config.headline} | PodCap`;
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    setMeta("name", "description", config.subheadline);
    setMeta("property", "og:title", `${config.headline} | PodCap`);
    setMeta("property", "og:description", config.subheadline);
  }, [config.slug]);

  useEffect(() => {
    if (user) {
      if (!user.emailVerified) navigate("/verify-email");
      else if (!user.onboardingCompleted) navigate("/onboarding");
      else navigate("/dashboard");
    }
  }, [user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }

    register(
      {
        email: email.trim(),
        podcasts: [],
        signupContext: `landing_page_${config.slug}`,
      },
      {
        onSuccess: () => navigate("/verify-email"),
        onError: (err) => {
          toast({
            title: "Something went wrong",
            description: err.message?.includes("400")
              ? "An account with this email already exists. Try logging in instead."
              : "Please try again in a moment.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-zinc-950">
      <header className="w-full px-6 py-5 flex items-center justify-center">
        <Link href="/" data-testid="link-lp-home">
          <PodCapWordmark />
        </Link>
      </header>

      <main className="flex-1">
        <section className="w-full max-w-4xl mx-auto text-center px-5 sm:px-6 pt-12 sm:pt-20 pb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center gap-6"
          >
            <span
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-bold uppercase tracking-wider"
              style={{
                background: `${config.heroAccent}10`,
                color: config.heroAccent,
                border: `1px solid ${config.heroAccent}20`,
              }}
              data-testid="badge-target-audience"
            >
              For {config.targetAudience}
            </span>

            <h1
              className="text-[1.75rem] sm:text-[2.5rem] md:text-[3rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.03em] max-w-3xl"
              data-testid="text-lp-headline"
            >
              {config.headline}
            </h1>

            <p
              className="text-lg sm:text-xl text-[#52525B] dark:text-[#A1A1AA] max-w-2xl leading-relaxed font-medium"
              data-testid="text-lp-subheadline"
            >
              {config.subheadline}
            </p>

            <form
              onSubmit={handleSubmit}
              className="w-full max-w-md mt-4"
              data-testid="form-lp-signup"
            >
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="flex-1 h-[52px] px-4 bg-white dark:bg-zinc-900 border border-[#D4D4D8] dark:border-white/[0.15] rounded-xl text-foreground text-[16px] focus:outline-none focus:ring-2 transition-all placeholder:text-[#A1A1AA]"
                  style={{ "--tw-ring-color": `${config.heroAccent}40` } as React.CSSProperties}
                  required
                  data-testid="input-lp-email"
                />
                <button
                  type="submit"
                  disabled={isPending}
                  className="h-[52px] px-6 flex items-center justify-center gap-2 rounded-xl font-bold text-[15px] text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] whitespace-nowrap"
                  style={{ background: `linear-gradient(135deg, ${config.heroGradientFrom}, ${config.heroGradientTo})` }}
                  data-testid="button-lp-submit"
                >
                  {isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      {config.ctaText}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
              <p className="text-[13px] text-[#A1A1AA] mt-3">
                100% free. No credit card required.
              </p>
            </form>
          </motion.div>
        </section>

        <section className="w-full max-w-5xl mx-auto px-5 sm:px-6 pb-20">
          <div className="text-center mb-4">
            <p
              className="text-sm font-bold uppercase tracking-wider"
              style={{ color: config.heroAccent }}
              data-testid="text-social-proof"
            >
              {config.socialProof}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            {config.features.map((feature, i) => {
              const Icon = ICON_MAP[feature.icon] || Zap;
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 * (i + 1) }}
                  className="p-6 rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-zinc-900/50"
                  data-testid={`card-feature-${i}`}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: `${config.heroAccent}12` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: config.heroAccent }} />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-[15px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed">{feature.description}</p>
                </motion.div>
              );
            })}
          </div>
        </section>

        <section className="w-full max-w-3xl mx-auto px-5 sm:px-6 pb-20">
          <div
            className="rounded-2xl p-8 sm:p-12 text-center text-white"
            style={{ background: `linear-gradient(135deg, ${config.heroGradientFrom}, ${config.heroGradientTo})` }}
            data-testid="section-bottom-cta"
          >
            <h2 className="text-2xl sm:text-3xl font-display font-bold mb-3">
              Ready to get started?
            </h2>
            <p className="text-white/80 mb-6 text-lg">
              Join PodCap for free and start getting smarter about podcasts today.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 justify-center items-center max-w-md mx-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="flex-1 w-full h-[48px] px-4 bg-white/10 border border-white/20 rounded-xl text-white text-[16px] focus:outline-none focus:ring-2 focus:ring-white/30 transition-all placeholder:text-white/50"
                required
                data-testid="input-lp-email-bottom"
              />
              <button
                type="submit"
                disabled={isPending}
                className="h-[48px] px-6 flex items-center justify-center gap-2 rounded-xl font-bold text-[15px] bg-white disabled:opacity-50 transition-all active:scale-[0.98] whitespace-nowrap"
                style={{ color: config.heroAccent }}
                data-testid="button-lp-submit-bottom"
              >
                {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Get started free"}
              </button>
            </form>
          </div>
        </section>

        <section className="w-full max-w-3xl mx-auto px-5 sm:px-6 pb-16">
          <div className="space-y-4">
            {[
              "AI-powered summaries from 500+ top podcasts",
              "Key takeaways, quotes, and actionable insights",
              "Daily email delivery at the time you choose",
              "Browse by topic, industry, or interest",
              "100% free to get started",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3" data-testid={`checklist-item-${i}`}>
                <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" style={{ color: config.heroAccent }} />
                <span className="text-[15px] text-foreground font-medium">{item}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="w-full px-6 py-8 border-t border-black/[0.06] dark:border-white/[0.08]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" data-testid="link-lp-footer-home">
            <PodCapWordmark />
          </Link>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground transition-colors" data-testid="link-lp-privacy">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors" data-testid="link-lp-terms">Terms</Link>
            <Link href="/support" className="hover:text-foreground transition-colors" data-testid="link-lp-support">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function LandingPage() {
  const params = useParams<{ slug: string }>();
  const config = getLandingPageBySlug(params.slug);

  if (!config) {
    return <NotFound />;
  }

  return <LandingPageContent config={config} />;
}
