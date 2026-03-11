import { useState } from "react";
import { useLocation } from "wouter";
import { Crown, Check, ArrowLeft, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PodCapWordmark } from "@/components/PodCapHeader";

const FEATURES = [
  "Unlimited podcast summaries",
  "Daily email with all your recaps",
  "Adjustable reading length",
  "Cancel anytime",
];

export default function Upgrade() {
  const [, navigate] = useLocation();
  const { data: user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const handleSubscribe = async () => {
    if (!user) {
      navigate("/login");
      return;
    }

    setIsCheckingOut(true);
    try {
      const res = await apiRequest("POST", "/api/stripe/create-checkout");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({ title: "Error", description: "Could not start checkout. Please try again.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to start checkout", variant: "destructive" });
    } finally {
      setIsCheckingOut(false);
    }
  };

  if (user?.plan === "pro") {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
          <a href="/" className="flex items-center">
            <PodCapWordmark />
          </a>
          <button
            data-testid="link-back"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-1.5 text-base font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to dashboard
          </button>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center px-4 pb-16">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Crown className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-display font-extrabold text-foreground mb-2">You're on Pro</h1>
          <p className="text-muted-foreground mb-6">You already have unlimited podcast summaries.</p>
          <button
            data-testid="button-back-dashboard"
            onClick={() => navigate("/dashboard")}
            className="h-11 px-6 rounded-lg font-display font-bold text-base bg-primary text-primary-foreground"
          >
            Back to Dashboard
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center">
          <PodCapWordmark />
        </a>
        <button
          data-testid="link-back"
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1.5 text-base font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Crown className="w-7 h-7 text-primary" />
          </div>

          <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground mb-2">
            Upgrade to Pro
          </h1>
          <p className="text-muted-foreground mb-8">
            Get unlimited podcast summaries delivered daily.
          </p>

          <div className="glass-panel rounded-2xl p-6 sm:p-8 text-left">
            <div className="text-center mb-6">
              <span className="text-4xl font-display font-extrabold text-foreground">$9.99</span>
              <span className="text-lg text-muted-foreground font-medium">/month</span>
            </div>

            <ul className="space-y-3 mb-8">
              {FEATURES.map((feature) => (
                <li key={feature} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-primary" />
                  </div>
                  <span className="text-base font-medium text-foreground">{feature}</span>
                </li>
              ))}
            </ul>

            <button
              data-testid="button-subscribe"
              onClick={handleSubscribe}
              disabled={isCheckingOut || authLoading}
              className="w-full h-14 flex items-center justify-center gap-2.5 rounded-xl font-display font-bold text-base bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-[0.99] disabled:opacity-60"
            >
              {isCheckingOut ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Redirecting to checkout...
                </>
              ) : (
                <>
                  <Crown className="w-4.5 h-4.5" />
                  Subscribe Now
                </>
              )}
            </button>
            <p className="text-center text-[15px] text-muted-foreground mt-3">
              Cancel anytime. No questions asked.
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
