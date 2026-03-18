import { useState } from "react";
import { useLocation } from "wouter";
import { Crown, Check, ArrowLeft, Loader2, Zap, Building2, Users, Clock, Brain, TrendingUp, Shield } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PodRiseWordmark } from "@/components/PodRiseHeader";

const FREE_FEATURES = [
  "Follow as many podcasts as you want",
  "Daily email recap of your shows",
  "Browse topic intelligence",
  "Access podcast & episode pages",
];

const PRO_FEATURES = [
  "Everything in Free",
  "Personalized daily topic briefings",
  "30+ industries, interests & roles",
  "5-minute reads vs 40 hours of podcasts",
  "Know what your boss is listening to",
  "Sound smarter in your next meeting",
  "Recruiting & client intelligence",
  "Team members (coming soon)",
  "Cancel anytime",
];

const ENTERPRISE_FEATURES = [
  "Everything in Pro",
  "Unlimited team members",
  "Custom topic briefings",
  "Dedicated account manager",
  "SSO & admin controls",
  "Priority support",
];

export default function Upgrade() {
  const [, navigate] = useLocation();
  const { data: user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [billingCycle, setBillingCycle] = useState<"annual" | "monthly">("annual");

  const handleSubscribe = async () => {
    if (!user) {
      navigate("/login");
      return;
    }

    setIsCheckingOut(true);
    try {
      const res = await apiRequest("POST", "/api/stripe/create-checkout", { billingCycle });
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

  const monthlyPrice = billingCycle === "annual" ? "$12.50" : "$15";
  const billingLabel = billingCycle === "annual" ? "/mo, billed annually" : "/month";

  if (user?.plan === "pro") {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#09090B]">
        <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
          <a href="/" className="flex items-center">
            <PodRiseWordmark />
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
          <div className="w-14 h-14 rounded-2xl bg-[#6366F1]/10 flex items-center justify-center mx-auto mb-6">
            <Crown className="w-7 h-7 text-[#6366F1]" />
          </div>
          <h1 className="text-2xl font-display font-extrabold text-foreground mb-2" data-testid="text-pro-status">You're on Pulse Pro</h1>
          <p className="text-muted-foreground mb-6">Your personalized daily briefings are active.</p>
          <div className="flex gap-3">
            <button
              data-testid="button-my-pulse"
              onClick={() => navigate("/pulse")}
              className="h-11 px-6 rounded-lg font-display font-bold text-base bg-[#6366F1] text-white"
            >
              My Pulse Topics
            </button>
            <button
              data-testid="button-back-dashboard"
              onClick={() => navigate("/dashboard")}
              className="h-11 px-6 rounded-lg font-display font-bold text-base border border-[#E4E4E7] dark:border-[#27272A] text-foreground"
            >
              Back to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#09090B]">
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center">
          <PodRiseWordmark />
        </a>
        <button
          data-testid="link-back"
          onClick={() => navigate(user ? "/dashboard" : "/")}
          className="flex items-center gap-1.5 text-base font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {user ? "Back to dashboard" : "Back"}
        </button>
      </header>

      <main className="flex-1 px-4 sm:px-6 lg:px-8 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-5xl mx-auto"
        >
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#6366F1]/10 text-[#6366F1] text-sm font-semibold mb-4">
              <Zap className="w-4 h-4" />
              Pulse by PodRise
            </div>
            <h1 className="text-3xl sm:text-4xl font-display font-extrabold text-foreground mb-3" data-testid="text-pricing-title">
              Your career intelligence, delivered daily
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Stop spending 40 hours listening to podcasts. Get 5-minute briefings on the topics that matter to your career, every morning.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 mb-8">
            <button
              data-testid="toggle-monthly"
              onClick={() => setBillingCycle("monthly")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                billingCycle === "monthly"
                  ? "bg-[#09090B] dark:bg-white text-white dark:text-[#09090B]"
                  : "text-[#71717A] hover:text-[#09090B] dark:hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              data-testid="toggle-annual"
              onClick={() => setBillingCycle("annual")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${
                billingCycle === "annual"
                  ? "bg-[#09090B] dark:bg-white text-white dark:text-[#09090B]"
                  : "text-[#71717A] hover:text-[#09090B] dark:hover:text-white"
              }`}
            >
              Annual
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded">
                Best Value
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
            <div className="rounded-2xl border border-[#E4E4E7] dark:border-[#27272A] bg-white dark:bg-[#111114] p-6" data-testid="card-free-tier">
              <h3 className="text-lg font-display font-bold text-foreground mb-1">Free</h3>
              <p className="text-sm text-muted-foreground mb-4">Get started with podcast recaps</p>
              <div className="mb-6">
                <span className="text-3xl font-display font-extrabold text-foreground">$0</span>
                <span className="text-sm text-muted-foreground">/forever</span>
              </div>
              <ul className="space-y-2.5 mb-6">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-[#F4F4F5] dark:bg-[#27272A] flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-[#71717A]" />
                    </div>
                    <span className="text-sm text-[#52525B] dark:text-[#A1A1AA]">{f}</span>
                  </li>
                ))}
              </ul>
              <button
                data-testid="button-free-current"
                onClick={() => navigate(user ? "/dashboard" : "/register")}
                className="w-full h-11 rounded-xl font-display font-bold text-sm border border-[#E4E4E7] dark:border-[#27272A] text-[#52525B] dark:text-[#A1A1AA] hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C22] transition-colors"
              >
                {user ? "Current Plan" : "Get Started Free"}
              </button>
            </div>

            <div className="rounded-2xl border-2 border-[#6366F1] bg-white dark:bg-[#111114] p-6 relative shadow-lg shadow-[#6366F1]/10" data-testid="card-pro-tier">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-[#6366F1] text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                  Most Popular
                </span>
              </div>
              <h3 className="text-lg font-display font-bold text-foreground mb-1 flex items-center gap-2">
                <Crown className="w-5 h-5 text-[#6366F1]" />
                Pro
              </h3>
              <p className="text-sm text-muted-foreground mb-4">Daily topic briefings for your career</p>
              <div className="mb-1">
                <span className="text-3xl font-display font-extrabold text-foreground" data-testid="text-pro-price">{monthlyPrice}</span>
                <span className="text-sm text-muted-foreground">{billingLabel}</span>
              </div>
              {billingCycle === "annual" && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mb-4">
                  Save $30/year vs monthly
                </p>
              )}
              {billingCycle === "monthly" && (
                <p className="text-xs text-muted-foreground mb-4">
                  Cancel anytime
                </p>
              )}
              <ul className="space-y-2.5 mb-6">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-[#6366F1]/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-[#6366F1]" />
                    </div>
                    <span className="text-sm text-foreground font-medium">{f}</span>
                  </li>
                ))}
              </ul>
              <button
                data-testid="button-subscribe"
                onClick={handleSubscribe}
                disabled={isCheckingOut || authLoading}
                className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-sm bg-[#6366F1] text-white shadow-lg shadow-[#6366F1]/20 hover:bg-[#4F46E5] transition-all active:scale-[0.99] disabled:opacity-60"
              >
                {isCheckingOut ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Redirecting to checkout...
                  </>
                ) : (
                  <>
                    <Crown className="w-4 h-4" />
                    {user ? "Upgrade to Pro" : "Get Started"}
                  </>
                )}
              </button>
            </div>

            <div className="rounded-2xl border border-[#E4E4E7] dark:border-[#27272A] bg-white dark:bg-[#111114] p-6" data-testid="card-enterprise-tier">
              <h3 className="text-lg font-display font-bold text-foreground mb-1 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#71717A]" />
                Enterprise
              </h3>
              <p className="text-sm text-muted-foreground mb-4">For teams that need to stay ahead</p>
              <div className="mb-6">
                <span className="text-3xl font-display font-extrabold text-foreground">Custom</span>
              </div>
              <ul className="space-y-2.5 mb-6">
                {ENTERPRISE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-[#F4F4F5] dark:bg-[#27272A] flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-[#71717A]" />
                    </div>
                    <span className="text-sm text-[#52525B] dark:text-[#A1A1AA]">{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href="/contact"
                data-testid="button-contact-enterprise"
                className="w-full h-11 rounded-xl font-display font-bold text-sm border border-[#E4E4E7] dark:border-[#27272A] text-foreground hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C22] transition-colors flex items-center justify-center gap-2"
              >
                Contact Us
              </a>
            </div>
          </div>

          <div className="mt-16 max-w-3xl mx-auto">
            <h2 className="text-2xl font-display font-extrabold text-foreground text-center mb-8" data-testid="text-why-pulse">
              Why Pulse?
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <ValueProp
                icon={<Brain className="w-5 h-5 text-[#6366F1]" />}
                title="Sound smarter in your next meeting"
                description="Get the key insights your colleagues are hearing on top podcasts — distilled into a 5-minute morning read."
              />
              <ValueProp
                icon={<TrendingUp className="w-5 h-5 text-[#6366F1]" />}
                title="Know what your boss is thinking before they say it"
                description="Pulse tracks the podcasts and topics that shape executive thinking, so you're always one step ahead."
              />
              <ValueProp
                icon={<Clock className="w-5 h-5 text-[#6366F1]" />}
                title="5 minutes instead of 40 hours"
                description="Hundreds of podcast hours, distilled into daily briefings personalized to your industry and role."
              />
              <ValueProp
                icon={<Shield className="w-5 h-5 text-[#6366F1]" />}
                title="Never miss the conversation"
                description="Don't be the last to know. Pulse ensures you're always in the loop on the topics that matter."
              />
              <ValueProp
                icon={<Users className="w-5 h-5 text-[#6366F1]" />}
                title="Recruiting & client intelligence"
                description="Know what candidates and clients are consuming. Use podcast intelligence to build rapport and close deals."
              />
              <ValueProp
                icon={<Zap className="w-5 h-5 text-[#6366F1]" />}
                title="Personalized by topic"
                description="Choose from 30+ industries, interests, and roles. Get only what's relevant to your career."
              />
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

function ValueProp({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-xl border border-[#E4E4E7] dark:border-[#27272A] bg-white dark:bg-[#111114] p-5">
      <div className="flex items-center gap-2.5 mb-2">
        {icon}
        <h3 className="text-sm font-display font-bold text-foreground">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
