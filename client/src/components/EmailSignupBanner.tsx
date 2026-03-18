import { useState } from "react";
import { useLocation } from "wouter";
import { Mail, ArrowRight, Loader2 } from "lucide-react";
import { useRegister } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export function EmailSignupBanner() {
  const [email, setEmail] = useState("");
  const [, navigate] = useLocation();
  const { mutate: register, isPending } = useRegister();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }

    register(
      { email: email.trim(), podcasts: [], signupSource: "homepage_banner", signupSourceDetail: "email_signup_banner" },
      {
        onSuccess: () => navigate("/verify-email"),
        onError: (err) => {
          const isDuplicate = err.message?.includes("already exists");
          toast({
            title: isDuplicate ? "Account already exists" : "Something went wrong",
            description: isDuplicate
              ? "An account with this email already exists. Try logging in instead."
              : "Please try again in a moment.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <section
      className="w-full relative overflow-hidden"
      data-testid="section-email-signup-banner"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-[#4F46E5] via-[#6D28D9] to-[#7C3AED]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.12),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(99,102,241,0.3),transparent_60%)]" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-12 lg:py-14 flex flex-col lg:flex-row items-center gap-6 lg:gap-16">
        <div className="flex-1 text-center lg:text-left min-w-0">
          <h2
            className="text-[1.375rem] sm:text-[1.625rem] lg:text-[1.875rem] font-display font-extrabold text-white leading-[1.15] tracking-[-0.02em]"
            data-testid="text-banner-headline"
          >
            Never miss what your favorite podcasts are talking about
          </h2>
          <p
            className="mt-2.5 text-[15px] sm:text-[16px] text-white/75 font-medium leading-relaxed max-w-md mx-auto lg:mx-0"
            data-testid="text-banner-subtext"
          >
            Get a daily email recap of every new episode from the podcasts you love — read it in 5 minutes over coffee.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto lg:min-w-[440px] lg:max-w-[480px]"
          data-testid="form-email-signup"
        >
          <div className="relative flex-1">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#6366F1]/40 pointer-events-none" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
              className="w-full pl-11 pr-4 py-3 sm:py-3.5 rounded-xl bg-white/95 backdrop-blur-sm text-[15px] font-medium text-gray-900 placeholder:text-gray-400 border-0 outline-none focus:ring-2 focus:ring-white/50 focus:bg-white transition-all shadow-sm"
              style={{ minHeight: '48px' }}
              data-testid="input-banner-email"
              disabled={isPending}
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center justify-center gap-2 px-6 sm:px-7 py-3 sm:py-3.5 rounded-xl bg-white text-[#4F46E5] text-[15px] font-bold hover:bg-white/95 hover:shadow-xl transition-all duration-200 active:scale-[0.97] disabled:opacity-60 whitespace-nowrap shadow-lg shadow-black/[0.08]"
            style={{ minHeight: '48px' }}
            data-testid="button-banner-subscribe"
          >
            {isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Get Started Free
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </section>
  );
}
