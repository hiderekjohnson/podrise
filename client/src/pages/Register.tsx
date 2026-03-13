import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Loader2 } from "lucide-react";
import { useRegister, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PodCapWordmark } from "@/components/PodCapHeader";

export default function Register() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  const { toast } = useToast();
  const { mutate: register, isPending } = useRegister();

  const [email, setEmail] = useState("");

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
      { email: email.trim(), podcasts: [] },
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
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col">
      <header className="w-full px-6 sm:px-10 py-5">
        <Link href="/" data-testid="link-home-logo">
          <PodCapWordmark />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-[440px]">
          <div className="text-center mb-8">
            <h1 className="text-[1.75rem] sm:text-[2rem] font-display font-extrabold text-foreground leading-[1.15] tracking-[-0.02em]" data-testid="heading-register">
              Create your free account
            </h1>
            <p className="text-[15px] sm:text-[16px] text-[#52525B] dark:text-[#A1A1AA] mt-2">
              100% free. No credit card needed.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-register">
            <div>
              <label htmlFor="register-email" className="block text-[14px] font-semibold text-foreground mb-1.5">
                Email address <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-3">
                <input
                  id="register-email"
                  data-testid="input-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="flex-1 h-[44px] px-4 bg-white dark:bg-zinc-900 border border-[#D4D4D8] dark:border-white/[0.15] rounded-lg text-foreground text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all placeholder:text-[#A1A1AA]"
                  required
                />
                <button
                  data-testid="button-register"
                  type="submit"
                  disabled={isPending}
                  aria-busy={isPending}
                  className="h-[44px] px-5 flex items-center justify-center gap-2 rounded-lg font-semibold text-[15px] bg-primary text-primary-foreground hover:brightness-105 disabled:opacity-40 transition-all active:scale-[0.98] whitespace-nowrap"
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

            <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA]/70 leading-relaxed">
              By creating an account, you agree to our{" "}
              <Link href="/terms" className="text-primary hover:text-primary/80 underline underline-offset-2" data-testid="link-terms">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-primary hover:text-primary/80 underline underline-offset-2" data-testid="link-privacy">
                Privacy Policy
              </Link>.
              We may contact you with relevant content and services. You can unsubscribe at any time.
            </p>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-[#E4E4E7] dark:bg-white/[0.08]" />
            <span className="text-[13px] text-[#A1A1AA] font-medium">OR</span>
            <div className="flex-1 h-px bg-[#E4E4E7] dark:bg-white/[0.08]" />
          </div>

          <Link
            href="/login"
            className="flex items-center justify-center w-full h-[44px] rounded-lg border border-[#D4D4D8] dark:border-white/[0.15] text-[15px] font-semibold text-foreground hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-colors"
            data-testid="link-login"
          >
            Have an account? Sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
