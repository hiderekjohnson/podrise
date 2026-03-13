import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Mail, ArrowRight, Loader2, Check, Zap } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface InlineEmailCTAProps {
  type: "industry" | "interest" | "role" | "podcast";
  slug: string;
  name: string;
  artworkUrl?: string;
  hosts?: string;
  variant?: "card" | "gradient" | "minimal";
  className?: string;
}

export function InlineEmailCTA({ type, slug, name, artworkUrl, hosts, variant = "card", className = "" }: InlineEmailCTAProps) {
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useAuth();

  const subscribe = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/subscriptions/quick-subscribe", {
        email,
        type,
        slug,
        name,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: `Subscribed to ${name}`,
        description: data.isNew ? "Your account has been created." : "Added to your subscriptions.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't subscribe",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    subscribe.mutate();
  };

  if (user) return null;

  const isPodcast = type === "podcast";
  const label = isPodcast ? "recap" : "briefing";

  const hostList = hosts?.split(/,\s*|&\s*|\sand\s/i).map(h => h.trim()).filter(Boolean) || [];
  const hostDisplay = hostList.length > 2
    ? `${hostList.slice(0, 2).join(", ")} & more`
    : hostList.length > 0 ? hostList.join(" & ") : "";

  if (success) {
    return (
      <div className={`rounded-2xl border border-[#6366F1]/20 bg-[#EEF2FF] p-5 ${className}`} data-testid="inline-cta-success">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#6366F1]/10 flex items-center justify-center shrink-0">
            <Check className="w-5 h-5 text-[#6366F1]" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-foreground">Subscribed to {name}</p>
            <Link href="/dashboard" className="text-[14px] font-medium text-primary hover:underline flex items-center gap-1 mt-0.5" data-testid="link-inline-cta-dashboard">
              Manage your subscriptions <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "gradient") {
    return (
      <div className={`rounded-2xl overflow-hidden ${className}`} data-testid="inline-email-cta">
        <div className="relative bg-gradient-to-r from-primary/[0.08] via-primary/[0.04] to-transparent border border-primary/[0.12] p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            {artworkUrl && isPodcast && (
              <img src={artworkUrl} alt={name} className="w-16 h-16 rounded-xl shadow-lg ring-1 ring-black/[0.06] shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="text-[12px] font-bold uppercase tracking-[0.15em] text-primary">
                  {isPodcast ? "Never miss an episode" : `${name} Intelligence`}
                </span>
              </div>
              <h3 className="text-lg font-display font-bold text-foreground leading-snug">
                {isPodcast
                  ? hostDisplay
                    ? `Get every ${name} recap — ${hostDisplay}'s key insights, delivered free`
                    : `Get free ${name} recaps in your inbox`
                  : `Get the daily ${name.toLowerCase()} ${label}`}
              </h3>
              <p className="text-[14px] text-muted-foreground mt-1">
                {isPodcast
                  ? `A 5-minute recap every time a new episode drops.`
                  : `Key insights from top podcasts, synthesized daily.`}
              </p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="flex gap-2 mt-4" data-testid="form-inline-cta">
            <div className="relative flex-1">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full pl-10 pr-4 py-3 text-[14px] bg-white dark:bg-card border border-black/[0.08] dark:border-white/[0.08] rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                data-testid="input-inline-cta-email"
              />
            </div>
            <button
              type="submit"
              disabled={subscribe.isPending}
              className="px-5 py-3 bg-primary text-primary-foreground font-bold text-[14px] rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap flex items-center gap-1.5"
              data-testid="button-inline-cta-subscribe"
            >
              {subscribe.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Subscribe free <ArrowRight className="w-3.5 h-3.5" /></>}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (variant === "minimal") {
    return (
      <div className={`rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-card p-4 sm:p-5 ${className}`} data-testid="inline-email-cta-minimal">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {artworkUrl && isPodcast && (
            <img src={artworkUrl} alt={name} className="w-12 h-12 rounded-lg shadow-sm ring-1 ring-black/[0.06] shrink-0" />
          )}
          {!isPodcast && (
            <div className="w-10 h-10 rounded-lg bg-primary/[0.08] flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-foreground">
              {isPodcast
                ? `Get ${name} recaps in your inbox`
                : `Get the daily ${name.toLowerCase()} ${label}`}
            </p>
            <p className="text-[14px] text-muted-foreground mt-0.5">
              {isPodcast
                ? `Free recap every new episode${hostDisplay ? ` from ${hostDisplay}` : ""}.`
                : "Key podcast insights delivered daily."}
            </p>
          </div>
          <form onSubmit={handleSubmit} className="flex gap-2 w-full sm:w-auto shrink-0" data-testid="form-inline-cta-minimal">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="flex-1 sm:w-44 h-10 px-3 text-[14px] bg-background border border-black/[0.08] dark:border-white/[0.08] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              data-testid="input-inline-cta-email-minimal"
            />
            <button
              type="submit"
              disabled={subscribe.isPending}
              className="h-10 px-4 bg-primary text-primary-foreground font-bold text-[14px] rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap"
              data-testid="button-inline-cta-subscribe-minimal"
            >
              {subscribe.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Subscribe"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-white/[0.03] overflow-hidden ${className}`} data-testid="inline-email-cta-card">
      <div className="p-6 sm:p-8">
        <div className="flex items-start gap-5">
          {artworkUrl && isPodcast && (
            <div className="relative shrink-0 hidden sm:block">
              <div className="absolute -inset-2 bg-primary/[0.04] rounded-xl blur-lg" />
              <img src={artworkUrl} alt={name} className="relative w-20 h-20 rounded-xl shadow-xl ring-1 ring-black/[0.06]" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="text-[12px] font-bold uppercase tracking-[0.15em] text-primary">
                {isPodcast ? "Free recaps" : "Daily briefing"}
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-display font-bold text-foreground leading-snug mb-1.5">
              {isPodcast
                ? hostDisplay
                  ? `${hostDisplay}'s best insights — in your inbox`
                  : `Get ${name} recaps delivered free`
                : `The ${name.toLowerCase()} ${label} you'll actually read`}
            </h3>
            <p className="text-[14px] text-muted-foreground leading-relaxed">
              {isPodcast
                ? `Every time ${name} drops a new episode, we'll send you the key takeaways in 5 minutes.`
                : `We synthesize insights about ${name.toLowerCase()} from top podcasts into one daily briefing.`}
            </p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2 mt-5" data-testid="form-inline-cta-card">
          <div className="relative flex-1">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              className="w-full pl-10 pr-4 py-3 text-[15px] bg-card border border-black/[0.08] dark:border-white/[0.08] rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
              data-testid="input-inline-cta-email-card"
            />
          </div>
          <button
            type="submit"
            disabled={subscribe.isPending}
            className="px-6 py-3 bg-primary text-primary-foreground font-bold text-[15px] rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap flex items-center gap-1.5"
            data-testid="button-inline-cta-subscribe-card"
          >
            {subscribe.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Subscribe free <ArrowRight className="w-3.5 h-3.5" /></>}
          </button>
        </form>
        <p className="text-[12px] text-muted-foreground/40 mt-2.5">
          No spam. Unsubscribe anytime.
        </p>
      </div>
    </div>
  );
}
