import { useEffect } from "react";
import { useLocation, Link, useParams } from "wouter";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { PodRiseWordmark } from "@/components/PodRiseHeader";
import { LANDING_PAGES, getLandingPageBySlug, type LandingPageConfig } from "@/data/landingPageConfig";
import { trackLandingPageVisit } from "@/lib/landingAnalytics";
import NotFound from "./not-found";
import NewsletterLandingPage from "./NewsletterLandingPage";

function LandingPageContent({ config }: { config: LandingPageConfig }) {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();

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

          <div className="w-full mt-1 sm:mt-2" data-testid="lp-cta-container">
            <a
              href="https://podrise.com/register"
              className="w-full h-[52px] sm:h-[54px] flex items-center justify-center gap-2.5 rounded-xl font-bold text-[15px] sm:text-[16px] text-white transition-all active:scale-[0.98] shadow-lg"
              style={{
                background: `linear-gradient(135deg, ${config.heroGradientFrom}, ${config.heroGradientTo})`,
                boxShadow: `0 4px 14px ${config.heroAccent}35`,
              }}
              data-testid="button-lp-register"
            >
              {config.ctaText}
              <ArrowRight className="w-4 h-4" />
            </a>
            <p className="text-[12px] text-[#A1A1AA] mt-2.5 text-center">
              Free forever. No credit card needed.
            </p>
          </div>

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
        <Link href="/contact" className="hover:text-[#52525B] transition-colors" data-testid="link-lp-support">Contact</Link>
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
