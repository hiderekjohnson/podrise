import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Loader2, Mail, Shield, Zap, BookOpen, Bell } from "lucide-react";
import { motion } from "framer-motion";
import { useRegister, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { SiteHeader } from "@/components/SiteHeader";
import { Footer } from "@/components/Footer";

export default function Register() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  const { toast } = useToast();
  const { mutate: register, isPending } = useRegister();

  const [email, setEmail] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    document.title = "Create Your Free Account | PodCap";
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    setMeta("name", "description", "Sign up for PodCap — get AI-powered podcast summaries, key insights, and episode recaps delivered to your inbox. Free forever.");
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

    if (!agreedToTerms) {
      toast({ title: "Terms required", description: "Please agree to the Terms of Service and Privacy Policy to continue.", variant: "destructive" });
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

  const benefits = [
    { icon: Zap, title: "AI Episode Recaps", desc: "Key takeaways from every episode in minutes, not hours" },
    { icon: BookOpen, title: "Books & Resources", desc: "Every book and resource mentioned, linked and organized" },
    { icon: Bell, title: "Daily Intelligence", desc: "Curated briefings on the topics you care about" },
    { icon: Shield, title: "100% Free", desc: "No credit card required. Unsubscribe anytime" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />

      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-12 sm:py-16">
        <div className="w-full max-w-[960px] flex flex-col lg:flex-row gap-10 lg:gap-16 items-center lg:items-start">

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="flex-1 max-w-md lg:max-w-none lg:pt-4"
          >
            <h1 className="text-[1.75rem] sm:text-[2.25rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.025em] mb-3" data-testid="heading-register">
              Your podcast intelligence layer
            </h1>
            <p className="text-base sm:text-lg text-[#3F3F46] dark:text-[#A1A1AA] leading-relaxed mb-8 max-w-md">
              Stop listening to hours of podcasts. Get the insights that matter, delivered to your inbox.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {benefits.map((b, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 + i * 0.08 }}
                  className="flex gap-3 items-start"
                  data-testid={`benefit-${i}`}
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/[0.08] flex items-center justify-center shrink-0 mt-0.5">
                    <b.icon className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-[15px] font-bold text-foreground">{b.title}</p>
                    <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] leading-snug mt-0.5">{b.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="w-full max-w-[400px] shrink-0"
          >
            <div className="bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.08] rounded-2xl shadow-xl shadow-black/[0.04] p-6 sm:p-8">
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/[0.08] flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-xl font-display font-extrabold text-foreground" data-testid="heading-form">
                  Create your free account
                </h2>
                <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] mt-1.5">
                  No credit card required
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-register">
                <div>
                  <label htmlFor="register-email" className="block text-[14px] font-semibold text-foreground mb-1.5">
                    Email address
                  </label>
                  <input
                    id="register-email"
                    data-testid="input-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full h-[48px] px-4 bg-background border-[1.5px] border-[#D4D4D8] dark:border-white/[0.12] rounded-xl text-foreground text-[16px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium placeholder:text-[#A1A1AA]"
                    required
                  />
                </div>

                <div className="flex items-start gap-2.5">
                  <input
                    id="agree-terms"
                    data-testid="checkbox-terms"
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-[#D4D4D8] text-primary focus:ring-primary/20 accent-primary cursor-pointer"
                  />
                  <label htmlFor="agree-terms" className="text-[13px] text-[#52525B] dark:text-[#A1A1AA] leading-snug cursor-pointer select-none">
                    I agree to the{" "}
                    <Link href="/terms" className="text-primary hover:text-primary/80 underline underline-offset-2" data-testid="link-terms">
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" className="text-primary hover:text-primary/80 underline underline-offset-2" data-testid="link-privacy">
                      Privacy Policy
                    </Link>
                  </label>
                </div>

                <button
                  data-testid="button-register"
                  type="submit"
                  disabled={isPending}
                  className="w-full h-[48px] flex items-center justify-center gap-2 rounded-xl font-display font-bold text-[16px] bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:brightness-105 disabled:opacity-40 transition-all active:scale-[0.98]"
                >
                  {isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    "Get Started — It's Free"
                  )}
                </button>
              </form>

              <p className="text-center text-[13px] text-[#71717A] dark:text-[#A1A1AA]/70 mt-5">
                Already have an account?{" "}
                <Link href="/login" className="text-primary font-semibold hover:text-primary/80 transition-colors" data-testid="link-login">
                  Sign in
                </Link>
              </p>

              <div className="mt-6 pt-5 border-t border-black/[0.06] dark:border-white/[0.06]">
                <div className="flex items-center justify-center gap-5 text-[12px] text-[#A1A1AA]">
                  <span className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    Secure & encrypted
                  </span>
                  <span className="w-px h-3 bg-black/[0.08] dark:bg-white/[0.08]" />
                  <span>No spam, ever</span>
                  <span className="w-px h-3 bg-black/[0.08] dark:bg-white/[0.08]" />
                  <span>Unsubscribe anytime</span>
                </div>
              </div>
            </div>

            <p className="text-center text-[12px] text-[#A1A1AA] mt-4 px-4">
              By creating an account, you consent to receive email communications from PodCap. You can manage your preferences or unsubscribe at any time from your dashboard.
            </p>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
