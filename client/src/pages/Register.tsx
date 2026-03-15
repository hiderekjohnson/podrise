// See BRAND.md for all typography, color, spacing, and accessibility rules.
import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Loader2, Headphones, Sparkles, Mail } from "lucide-react";
import { useRegister, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PodCapWordmark } from "@/components/PodCapHeader";

export default function Register() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  const { toast } = useToast();
  const { mutate: register, isPending } = useRegister();

  const [email, setEmail] = useState("");
  const searchParams = new URLSearchParams(window.location.search);
  const signupContext = searchParams.get("context") || undefined;

  useEffect(() => {
    document.title = "Create Your Free Account | PodCap";
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    setMeta("name", "description", "Sign up for PodCap — get AI-powered podcast summaries, key insights, and episode recaps delivered to your inbox.");
    setMeta("property", "og:title", "Create Your Free Account | PodCap");
    setMeta("property", "og:description", "Join thousands of professionals who save hours every week with AI podcast intelligence.");
  }, []);

  if (user) {
    if (!user.emailVerified) {
      navigate("/verify-email");
    } else if (!user.onboardingCompleted) {
      navigate("/onboarding");
    } else {
      navigate("/dashboard");
    }
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }

    register(
      { email: email.trim(), podcasts: [], signupContext },
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
    <div className="min-h-screen h-screen flex flex-col lg:flex-row overflow-hidden">
      <a href="#register-form" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg focus:text-[16px] focus:font-semibold" data-testid="link-skip-to-form">
        Skip to sign-up form
      </a>

      {/* Left Hero Panel */}
      <div
        className="relative lg:w-1/2 flex flex-col justify-center overflow-hidden px-8 sm:px-12 lg:px-16 py-10 lg:py-0"
        style={{ background: "linear-gradient(145deg, #6366F1, #8B5CF6)" }}
        data-testid="panel-hero"
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/[0.06]" />
          <div className="absolute bottom-10 -left-16 w-48 h-48 rounded-full bg-white/[0.04]" />
        </div>

        <div className="relative z-10 max-w-md">
          <Link href="/" data-testid="link-home-logo-hero" className="inline-block mb-8">
            <PodCapWordmark variant="dark" />
          </Link>

          <h1
            className="text-[1.75rem] lg:text-[2.25rem] font-display font-bold text-white leading-[1.15] tracking-[-0.03em]"
            data-testid="heading-hero"
          >
            Unlock the knowledge
            <br />
            <span className="font-light" style={{ fontFamily: "var(--font-serif)" }}>
              hidden in audio.
            </span>
          </h1>

          <ul className="mt-6 space-y-3" data-testid="list-benefits">
            <li className="flex items-center gap-3" data-testid="benefit-track">
              <Headphones className="w-4 h-4 text-white/80 flex-shrink-0" />
              <span className="text-[16px] text-white/90">Track your favorite podcasts</span>
            </li>
            <li className="flex items-center gap-3" data-testid="benefit-summaries">
              <Sparkles className="w-4 h-4 text-white/80 flex-shrink-0" />
              <span className="text-[16px] text-white/90">AI summaries & key takeaways</span>
            </li>
            <li className="flex items-center gap-3" data-testid="benefit-inbox">
              <Mail className="w-4 h-4 text-white/80 flex-shrink-0" />
              <span className="text-[16px] text-white/90">Insights delivered to your inbox</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 flex flex-col bg-white dark:bg-zinc-950 overflow-y-auto" data-testid="panel-form">
        <header className="hidden lg:flex justify-end px-8 py-4">
          <Link
            href="/login"
            className="text-[15px] font-semibold text-[#52525B] dark:text-[#A1A1AA] hover:text-primary transition-colors"
            data-testid="link-login-header"
          >
            Have an account? <span className="text-primary">Sign in</span>
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center px-6 sm:px-10">
          <div className="w-full max-w-[400px]">
            <h2
              className="text-[1.75rem] sm:text-[2rem] font-display font-bold text-foreground leading-[1.15] tracking-[-0.02em]"
              data-testid="heading-register"
            >
              Create your free account
            </h2>
            <p className="text-[16px] text-[#52525B] dark:text-[#A1A1AA] mt-1.5 mb-6" data-testid="text-free-messaging">
              100% Free — No credit card required.
            </p>

            <a
              href="/api/auth/google"
              data-testid="button-google-register"
              className="w-full h-[44px] flex items-center justify-center gap-3 rounded-lg font-semibold text-[15px] bg-white dark:bg-zinc-900 border border-[#D4D4D8] dark:border-white/[0.15] text-foreground hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-all"
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </a>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-[#E4E4E7] dark:bg-white/[0.08]" />
              <span className="text-[13px] text-[#A1A1AA] font-medium">OR</span>
              <div className="flex-1 h-px bg-[#E4E4E7] dark:bg-white/[0.08]" />
            </div>

            <form id="register-form" onSubmit={handleSubmit} className="space-y-3" data-testid="form-register">
              <div>
                <label htmlFor="register-email" className="block text-[14px] font-semibold text-foreground mb-1.5">
                  Email address
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    id="register-email"
                    data-testid="input-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="flex-1 h-[44px] px-4 bg-white dark:bg-zinc-900 border border-[#D4D4D8] dark:border-white/[0.15] rounded-lg text-foreground text-[16px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all placeholder:text-[#A1A1AA]"
                    required
                  />
                  <button
                    data-testid="button-register"
                    type="submit"
                    disabled={isPending}
                    aria-busy={isPending}
                    className="h-[44px] px-5 flex items-center justify-center gap-2 rounded-lg font-semibold text-[15px] bg-primary text-primary-foreground hover:bg-[#4F46E5] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] whitespace-nowrap"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="sr-only">Creating account…</span>
                      </>
                    ) : (
                      "Get started"
                    )}
                  </button>
                </div>
              </div>

              <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA]/70 leading-relaxed">
                By signing up you agree to our{" "}
                <Link href="/terms" className="text-primary hover:text-primary/80 underline underline-offset-2" data-testid="link-terms">Terms</Link>
                {" "}and{" "}
                <Link href="/privacy" className="text-primary hover:text-primary/80 underline underline-offset-2" data-testid="link-privacy">Privacy Policy</Link>.
              </p>
            </form>

            <div className="mt-5 pt-4 border-t border-[#E4E4E7] dark:border-white/[0.08]">
              <Link
                href="/login"
                className="flex items-center justify-center w-full h-[44px] rounded-lg border border-[#D4D4D8] dark:border-white/[0.15] text-[15px] font-semibold text-foreground hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-colors"
                data-testid="link-login"
              >
                Have an account? Sign in
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
