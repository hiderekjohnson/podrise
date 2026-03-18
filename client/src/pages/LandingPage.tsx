import { useState, useEffect } from "react";
import { useLocation, Link, useParams } from "wouter";
import { Loader2, ArrowRight, CheckCircle2 } from "lucide-react";
import { useRegister, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PodRiseWordmark } from "@/components/PodRiseHeader";
import { LANDING_PAGES, getLandingPageBySlug, type LandingPageConfig } from "@/data/landingPageConfig";
import { apiRequest } from "@/lib/queryClient";
import { trackLandingPageVisit } from "@/lib/landingAnalytics";
import NotFound from "./not-found";
import NewsletterLandingPage from "./NewsletterLandingPage";

function LandingPageContent({ config }: { config: LandingPageConfig }) {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  const { toast } = useToast();
  const { mutate: register, isPending } = useRegister();
  const [email, setEmail] = useState("");

  useEffect(() => {
    trackLandingPageVisit(config.slug);
    document.title = `${config.headline} | PodRise`;
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    setMeta("name", "description", config.subheadline);
    setMeta("property", "og:title", `${config.headline} | PodRise`);
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
    if (isPending) return;
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

  const benefits = config.features.map(f => f.title);

  return (
    <div
      className="h-[100dvh] flex flex-col"
      style={{ background: `linear-gradient(160deg, ${config.heroGradientFrom}08 0%, #ffffff 40%, ${config.heroGradientTo}06 100%)` }}
    >
      <header className="shrink-0 w-full px-5 pt-4 pb-2 sm:pt-5 sm:pb-3 flex items-center justify-between">
        <Link href="/" data-testid="link-lp-home">
          <PodRiseWordmark />
        </Link>
        <Link
          href="/auth"
          className="text-[13px] font-semibold text-[#52525B] hover:text-foreground transition-colors"
          data-testid="link-lp-login"
        >
          Log in
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-5 sm:px-6 overflow-y-auto">
        <div className="w-full max-w-[440px] flex flex-col items-center text-center gap-4 sm:gap-5 py-4">
          <span
            className="inline-flex items-center px-3.5 py-1 rounded-full text-[11px] sm:text-[12px] font-bold uppercase tracking-widest"
            style={{
              background: `${config.heroAccent}0F`,
              color: config.heroAccent,
              border: `1px solid ${config.heroAccent}20`,
            }}
            data-testid="badge-target-audience"
          >
            For {config.targetAudience}
          </span>

          <h1
            className="text-[1.6rem] sm:text-[2rem] md:text-[2.4rem] font-display font-extrabold text-[#09090B] leading-[1.12] tracking-[-0.03em]"
            data-testid="text-lp-headline"
          >
            {config.headline}
          </h1>

          <p
            className="text-[14px] sm:text-[15.5px] text-[#52525B] leading-relaxed max-w-[380px]"
            data-testid="text-lp-subheadline"
          >
            {config.subheadline}
          </p>

          <form
            onSubmit={handleSubmit}
            className="w-full mt-1 sm:mt-2"
            data-testid="form-lp-signup"
          >
            <div className="flex flex-col gap-2.5">
              <label htmlFor="lp-email" className="sr-only">Email address</label>
              <input
                id="lp-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                aria-label="Email address"
                className="w-full h-[52px] sm:h-[54px] px-4 bg-white border border-[#E4E4E7] rounded-xl text-[#09090B] text-[16px] focus:outline-none focus:ring-2 focus:border-transparent transition-all placeholder:text-[#A1A1AA] shadow-sm"
                style={{ "--tw-ring-color": `${config.heroAccent}50` } as React.CSSProperties}
                required
                data-testid="input-lp-email"
              />
              <button
                type="submit"
                disabled={isPending}
                aria-busy={isPending}
                className="w-full h-[52px] sm:h-[54px] flex items-center justify-center gap-2.5 rounded-xl font-bold text-[15px] sm:text-[16px] text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${config.heroGradientFrom}, ${config.heroGradientTo})`,
                  boxShadow: `0 4px 14px ${config.heroAccent}35`,
                }}
                data-testid="button-lp-submit"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Signing up...</span>
                  </>
                ) : (
                  <>
                    {config.ctaText}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
            <p className="text-[12px] text-[#A1A1AA] mt-2.5 text-center">
              Free forever. No credit card needed.
            </p>
          </form>

          <div className="w-full mt-2 sm:mt-3 space-y-2">
            {benefits.map((item, i) => (
              <div key={i} className="flex items-center gap-2.5" data-testid={`checklist-item-${i}`}>
                <CheckCircle2
                  className="w-[18px] h-[18px] shrink-0"
                  style={{ color: config.heroAccent }}
                />
                <span className="text-[13px] sm:text-[14px] text-[#3F3F46] font-medium text-left">{item}</span>
              </div>
            ))}
          </div>

          <p
            className="text-[11px] sm:text-[12px] font-semibold uppercase tracking-wider mt-1"
            style={{ color: `${config.heroAccent}90` }}
            data-testid="text-social-proof"
          >
            {config.socialProof}
          </p>
        </div>
      </main>

      <footer className="shrink-0 w-full px-5 pb-4 pt-2 sm:pb-5 flex items-center justify-center gap-5 text-[12px] text-[#A1A1AA]">
        <Link href="/privacy" className="hover:text-[#52525B] transition-colors" data-testid="link-lp-privacy">Privacy</Link>
        <Link href="/terms" className="hover:text-[#52525B] transition-colors" data-testid="link-lp-terms">Terms</Link>
        <Link href="/support" className="hover:text-[#52525B] transition-colors" data-testid="link-lp-support">Support</Link>
      </footer>
    </div>
  );
}

export default function LandingPage() {
  const params = useParams<{ slug: string }>();

  if (params.slug === "newsletter-1") {
    return <NewsletterLandingPage />;
  }

  const config = getLandingPageBySlug(params.slug);

  if (!config) {
    return <NotFound />;
  }

  return <LandingPageContent config={config} />;
}
