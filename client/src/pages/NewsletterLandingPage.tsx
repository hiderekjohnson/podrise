import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { PodRiseWordmark } from "@/components/PodRiseHeader";
import { trackLandingPageVisit } from "@/lib/landingAnalytics";
import headerImage from "@assets/IMG_9561_1773912784317.jpeg";

export default function NewsletterLandingPage() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();

  useEffect(() => {
    trackLandingPageVisit("newsletter-1");
    document.title = "Your Daily Podcast Briefing | PodRise";
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    setMeta("name", "description", "Get a 2-minute daily briefing of the podcasts you love, so you stay sharp, informed, and ahead.");
    setMeta("property", "og:title", "Your Daily Podcast Briefing | PodRise");
    setMeta("property", "og:description", "Get a 2-minute daily briefing of the podcasts you love, so you stay sharp, informed, and ahead.");
  }, []);

  useEffect(() => {
    if (user) {
      if (!user.emailVerified) navigate("/verify-email");
      else if (!user.onboardingCompleted) navigate("/onboarding");
      else navigate("/dashboard");
    }
  }, [user]);

  return (
    <>
      <style>{`
        @keyframes nl1-fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes nl1-float {
          0%, 100% { transform: rotate(-4deg) translateY(10px); }
          50%      { transform: rotate(-4deg) translateY(-6px); }
        }
        @keyframes nl1-wave {
          0%, 100% { transform: scaleY(1); }
          50%      { transform: scaleY(0.55); }
        }
      `}</style>
      <div
        className="min-h-screen lg:min-h-screen h-[100dvh] lg:h-auto grid grid-cols-1 lg:grid-cols-2 overflow-hidden lg:overflow-visible"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
        data-testid="page-newsletter-landing"
      >
        <div
          className="bg-white flex flex-col justify-start relative z-[1] h-[100dvh] lg:h-auto lg:min-h-screen px-5 py-3 lg:px-[72px] lg:pt-12 lg:pb-16 overflow-hidden lg:overflow-visible"
        >
          <img
            src={headerImage}
            alt="PodRise newsletter preview"
            className="block lg:hidden w-full rounded-lg object-cover mb-2 flex-shrink-0"
            style={{ maxHeight: "24dvh" }}
            data-testid="img-newsletter-header-mobile"
          />

          <div
            className="hidden lg:block mb-12 pt-1"
            style={{ animation: "nl1-fadeUp 0.5s ease both", animationDelay: "0.1s" }}
          >
            <Link href="/" data-testid="link-newsletter-home">
              <PodRiseWordmark />
            </Link>
          </div>

          <div
            className="flex-1 flex flex-col justify-center pt-0 min-h-0"
            style={{ animation: "nl1-fadeUp 0.6s ease both", animationDelay: "0.25s" }}
          >
            <h1
              className="font-bold leading-[1.1] lg:leading-[1.18] tracking-[-0.03em] text-[#09090B] mb-1.5 lg:mb-5 max-w-[520px] text-[20px] lg:text-[clamp(30px,3.2vw,46px)]"
              data-testid="text-newsletter-headline"
            >
              Keep up with your favorite conversations—without listening to hours of podcasts
            </h1>
            <p
              className="text-[13px] lg:text-[16.5px] font-normal leading-[1.45] lg:leading-[1.65] text-[#52525B] max-w-[460px] mb-3 lg:mb-9"
              data-testid="text-newsletter-subheadline"
            >
              Get a 2-minute daily briefing of the podcasts you love, so you stay sharp, informed, and ahead
            </p>

            <div className="max-w-[480px]" data-testid="newsletter-cta-container">
              <a
                href="https://podrise.com/register"
                className="inline-flex items-center justify-center gap-1.5 text-white border-none cursor-pointer whitespace-nowrap hover:translate-y-[-1px] active:scale-[0.98]"
                style={{
                  background: "linear-gradient(145deg, #6366F1, #8B5CF6)",
                  borderRadius: "8px",
                  padding: "13px 22px",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "13px",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase" as const,
                  transition: "all 0.18s ease",
                }}
                data-testid="button-newsletter-register"
              >
                GET YOUR FREE DAILY RECAP
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
            <p
              className="mt-1.5 lg:mt-3.5 text-[11px] lg:text-[13px] text-[#A1A1AA] leading-[1.4] lg:leading-[1.7]"
              data-testid="text-newsletter-footnote"
            >
              Free. No spam. Unsubscribe anytime.<br/>Built for and by podcast lovers 💜
            </p>
          </div>
        </div>

        <div
          className="hidden lg:flex items-center justify-center p-10 lg:p-12 relative overflow-hidden min-h-[420px]"
          style={{ background: "linear-gradient(145deg, #6366F1, #8B5CF6)" }}
        >
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 600,
              height: 600,
              background: "rgba(255,255,255,0.06)",
              top: -180,
              right: -180,
            }}
          />
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 400,
              height: 400,
              background: "rgba(255,255,255,0.05)",
              bottom: -120,
              left: -80,
            }}
          />

          <div
            className="relative z-[1]"
            style={{
              filter: "drop-shadow(0 32px 64px rgba(0,0,0,0.28))",
              animation: "nl1-float 4s ease-in-out infinite, nl1-fadeUp 0.7s ease both",
              animationDelay: "0s, 0.35s",
            }}
            data-testid="phone-mockup"
          >
            <div
              className="bg-white overflow-hidden"
              style={{
                width: 283,
                borderRadius: 44,
                border: "6px solid rgba(255,255,255,0.3)",
                boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
              }}
            >
              <div className="bg-[#111] h-7 flex items-center justify-center">
                <div className="w-[70px] h-2.5 bg-black rounded-full" />
              </div>
              <div className="bg-white">
                <div
                  className="flex items-center gap-2"
                  style={{
                    background: "linear-gradient(145deg, #6366F1, #8B5CF6)",
                    padding: "12px 16px",
                  }}
                >
                  <div
                    className="flex-shrink-0 flex items-center justify-center"
                    style={{
                      width: 22,
                      height: 22,
                      background: "rgba(255,255,255,0.15)",
                      borderRadius: 6,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 28 28" fill="none">
                      <rect x="1" y="11" width="3.5" height="6" rx="1.75" fill="white" opacity="0.5"/>
                      <rect x="6.5" y="7" width="3.5" height="14" rx="1.75" fill="white" opacity="0.75"/>
                      <rect x="12" y="4" width="3.5" height="20" rx="1.75" fill="white"/>
                      <rect x="17.5" y="8" width="3.5" height="12" rx="1.75" fill="white" opacity="0.85"/>
                      <rect x="23" y="5" width="3.5" height="18" rx="1.75" fill="white" opacity="0.6"/>
                    </svg>
                  </div>
                  <span className="text-[11px] font-bold text-white uppercase tracking-[0.06em]">PodRise</span>
                </div>
                <div className="p-[14px_16px]">
                  <div
                    className="flex flex-col gap-[3px] mb-[9px]"
                    style={{
                      background: "#EEF2FF",
                      borderLeft: "2.5px solid #6366F1",
                      borderRadius: "0 5px 5px 0",
                      padding: "7px 9px",
                    }}
                  >
                    <span className="text-[8px] text-[#09090B] leading-[1.5]">
                      We listened to <strong className="text-[#6366F1] font-bold">1 hr 20 min</strong> of your favorite podcasts yesterday so you don't have to.
                    </span>
                    <span className="text-[7px] text-[#71717A] leading-[1.4]">
                      Here's everything worth knowing in a few minutes.
                    </span>
                  </div>
                  <p className="text-[7.5px] text-[#6366F1] font-semibold uppercase tracking-[0.1em] mb-[5px]">
                    In your podcasts today
                  </p>
                  <h2 className="text-[13px] font-bold text-[#09090B] leading-[1.3] tracking-[-0.02em] mb-2">
                    The $10B bet most VCs are quietly making right now
                  </h2>
                  <div
                    className="w-full rounded-[6px] mb-2.5 relative overflow-hidden flex items-center justify-center"
                    style={{ height: 70 }}
                  >
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ background: "linear-gradient(135deg, #c7d2fe 0%, #ddd6fe 100%)" }}
                    >
                      <div className="flex items-center gap-[3px] opacity-60">
                        {[16, 28, 36, 22, 30].map((h, i) => (
                          <span
                            key={i}
                            className="block w-1 bg-[#6366F1] rounded-[2px]"
                            style={{
                              height: h,
                              animation: "nl1-wave 1.2s ease-in-out infinite",
                              animationDelay: `${i * 0.15}s`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="text-[8px] text-[#52525B] leading-[1.6] mb-2">
                    Three separate episodes this week converged on the same thesis: foundation model consolidation is over, and the next decade belongs to vertical AI.
                  </p>
                  <p
                    className="text-[7.5px] text-[#71717A] font-semibold uppercase tracking-[0.1em] pb-1 mb-[5px]"
                    style={{ borderBottom: "1px solid #F0F0F2", margin: "8px 0 5px" }}
                  >
                    Key Takeaways
                  </p>
                  <div
                    className="text-[8px] text-[#52525B] leading-[1.7] mb-[5px]"
                    style={{ paddingLeft: 8, borderLeft: "2px solid #6366F1" }}
                  >
                    Benchmark quietly stopped funding horizontal AI — vertical is the only bet worth making now.
                  </div>
                  <div
                    className="text-[8px] text-[#52525B] leading-[1.7] mb-[5px]"
                    style={{ paddingLeft: 8, borderLeft: "2px solid #6366F1" }}
                  >
                    Two a16z portfolio companies hit $100M ARR in under 18 months by going deep, not broad.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
