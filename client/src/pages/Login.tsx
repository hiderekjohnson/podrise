import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Mail, ArrowRight, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getGoogleOAuthUrl } from "@/lib/utmCapture";
import { useMutation } from "@tanstack/react-query";
import { PodRiseWordmark } from "@/components/PodRiseHeader";

export default function Login() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: (email: string) => apiRequest("POST", "/api/auth/login", { email }),
    onSuccess: () => {
      setEmailSent(true);
    },
    onError: (err: any) => {
      toast({
        title: "Login failed",
        description: err.message.includes("404")
          ? "No account found with this email. Please sign up first."
          : err.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const hasShownError = useRef(false);
  useEffect(() => {
    if (hasShownError.current) return;
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error === "expired") {
      hasShownError.current = true;
      setErrorMessage("That login link has expired or was already used. Please request a new one.");
    } else if (error === "invalid") {
      hasShownError.current = true;
      setErrorMessage("That login link is invalid. Please try again.");
    }
  }, []);

  if (user) {
    navigate(user.onboardingCompleted === false ? "/onboarding" : "/dashboard");
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }
    loginMutation.mutate(email);
  };

  if (emailSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-8">
            <PodRiseWordmark />
          </div>
        </div>

        <div className="w-full max-w-sm glass-panel rounded-2xl p-6 sm:p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#EEF2FF] flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-[#6366F1]" />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground mb-2" data-testid="text-check-email">
            Check Your Email
          </h1>
          <p className="text-muted-foreground text-base mb-1">
            We sent a login link to
          </p>
          <p className="font-semibold text-foreground text-base mb-5" data-testid="text-sent-email">
            {email}
          </p>
          <p className="text-muted-foreground text-[15px] mb-6">
            The link expires in 15 minutes. Check your spam folder if you don't see it.
          </p>
          <button
            data-testid="button-back-to-login"
            onClick={() => { setEmailSent(false); loginMutation.reset(); }}
            className="text-[14px] text-primary font-semibold hover:underline min-h-[44px]"
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 sm:px-6 lg:px-8">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center mb-8">
          <PodRiseWordmark />
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-3">
          Welcome Back
        </h1>
        <p className="text-base text-muted-foreground max-w-md mx-auto">
          Enter your email and we'll send you a login link.
        </p>
      </div>

      {errorMessage && (
        <div className="w-full max-w-sm mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4" data-testid="alert-login-error">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      <div className="w-full max-w-sm glass-panel rounded-2xl p-6 sm:p-8">
        <a
          href={getGoogleOAuthUrl()}
          data-testid="button-google-login"
          className="w-full h-12 flex items-center justify-center gap-3 rounded-xl font-semibold text-[15px] bg-white dark:bg-zinc-900 border border-[#D4D4D8] dark:border-white/[0.15] text-foreground hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-all"
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </a>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-[#E4E4E7] dark:bg-white/[0.08]" />
          <span className="text-[13px] text-[#A1A1AA] font-medium">OR</span>
          <div className="flex-1 h-px bg-[#E4E4E7] dark:bg-white/[0.08]" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="relative group">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5 transition-colors group-focus-within:text-primary" />
            <input
              data-testid="input-login-email"
              type="email"
              name="email"
              id="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 pl-12 pr-4 bg-black/[0.03] border border-black/[0.06] rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium"
            />
          </div>

          <button
            data-testid="button-login"
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-base bg-primary text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loginMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Send Login Link
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-5 text-center">
          <p className="text-base text-[#52525B] dark:text-[#A1A1AA]">
            Don't have an account?{" "}
            <button
              data-testid="link-signup"
              onClick={() => navigate("/")}
              className="text-primary font-semibold hover:underline"
            >
              Sign up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
