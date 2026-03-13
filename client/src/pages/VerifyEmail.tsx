import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Loader2, CheckCircle2, XCircle, Mail, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SiteHeader } from "@/components/SiteHeader";
import { Footer } from "@/components/Footer";

export default function VerifyEmail() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  const [status, setStatus] = useState<"verifying" | "success" | "error" | "check-inbox">(
    token ? "verifying" : "check-inbox"
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    document.title = token ? "Verifying Email | PodCap" : "Check Your Inbox | PodCap";
  }, [token]);

  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (res.ok) {
          setStatus("success");
          if (data.user) {
            queryClient.setQueryData(["/api/auth/me"], data.user);
          }
        } else {
          setStatus("error");
          setErrorMessage(data.message || "Verification failed");
        }
      } catch {
        setStatus("error");
        setErrorMessage("Something went wrong. Please try again.");
      }
    })();
  }, [token]);

  const handleResend = async () => {
    setResending(true);
    try {
      const res = await apiRequest("POST", "/api/auth/resend-verification");
      if (res.ok) {
        setResent(true);
      }
    } catch {
    } finally {
      setResending(false);
    }
  };

  if (status === "check-inbox") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SiteHeader />
        <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-[440px]"
          >
            <div className="bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.08] rounded-2xl shadow-xl shadow-black/[0.04] p-8 sm:p-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/[0.08] flex items-center justify-center mx-auto mb-6">
                <Mail className="w-8 h-8 text-primary" />
              </div>

              <h1 className="text-[1.5rem] sm:text-[1.75rem] font-display font-extrabold text-foreground leading-tight tracking-[-0.025em] mb-3" data-testid="heading-check-inbox">
                Check your inbox
              </h1>

              <p className="text-[15px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed mb-2">
                We sent a confirmation link to
              </p>
              {user?.email && (
                <p className="text-[16px] font-bold text-foreground mb-6" data-testid="text-email-sent">
                  {user.email}
                </p>
              )}
              <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA]/70 leading-relaxed mb-8">
                Click the link in the email to verify your account. The link expires in 24 hours.
              </p>

              <div className="space-y-3">
                <button
                  data-testid="button-resend-verification"
                  onClick={handleResend}
                  disabled={resending || resent}
                  className="w-full h-[48px] flex items-center justify-center gap-2 rounded-xl font-display font-bold text-[15px] bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:brightness-105 disabled:opacity-40 transition-all active:scale-[0.98]"
                >
                  {resending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : resent ? (
                    "Email sent!"
                  ) : (
                    "Resend verification email"
                  )}
                </button>
              </div>

              <p className="text-[14px] text-[#A1A1AA] mt-6">
                Don't see the email? Check your spam folder.
              </p>
            </div>
          </motion.div>
        </main>
        <Footer />
      </div>
    );
  }

  if (status === "verifying") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SiteHeader />
        <main className="flex-1 flex items-center justify-center px-4 py-16">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
            <p className="text-[16px] font-semibold text-foreground" data-testid="text-verifying">
              Verifying your email...
            </p>
          </motion.div>
        </main>
        <Footer />
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SiteHeader />
        <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-[440px]"
          >
            <div className="bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.08] rounded-2xl shadow-xl shadow-black/[0.04] p-8 sm:p-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#EEF2FF] flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-8 h-8 text-[#6366F1]" />
              </div>

              <h1 className="text-[1.5rem] sm:text-[1.75rem] font-display font-extrabold text-foreground leading-tight tracking-[-0.025em] mb-3" data-testid="heading-verified">
                Email verified!
              </h1>

              <p className="text-[15px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed mb-8">
                Your account is now active. You're all set to start receiving podcast intelligence.
              </p>

              <button
                data-testid="button-go-dashboard"
                onClick={() => navigate("/dashboard?welcome=true")}
                className="w-full h-[48px] flex items-center justify-center gap-2 rounded-xl font-display font-bold text-[15px] bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:brightness-105 transition-all active:scale-[0.98]"
              >
                Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-[440px]"
        >
          <div className="bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.08] rounded-2xl shadow-xl shadow-black/[0.04] p-8 sm:p-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>

            <h1 className="text-[1.5rem] sm:text-[1.75rem] font-display font-extrabold text-foreground leading-tight tracking-[-0.025em] mb-3" data-testid="heading-error">
              Verification failed
            </h1>

            <p className="text-[15px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed mb-8" data-testid="text-error">
              {errorMessage}
            </p>

            <div className="space-y-3">
              <Link href="/register">
                <button
                  data-testid="button-try-again"
                  className="w-full h-[48px] flex items-center justify-center gap-2 rounded-xl font-display font-bold text-[15px] bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:brightness-105 transition-all active:scale-[0.98]"
                >
                  Create a new account
                </button>
              </Link>
              <Link href="/login">
                <button
                  data-testid="button-login-instead"
                  className="w-full h-[44px] flex items-center justify-center gap-2 rounded-xl font-display font-bold text-[14px] text-[#52525B] dark:text-[#A1A1AA] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-all"
                >
                  Sign in to existing account
                </button>
              </Link>
            </div>
          </div>
        </motion.div>
      </main>
      <Footer />
    </div>
  );
}
