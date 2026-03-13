import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Mail, Check, ArrowRight, Loader2, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface NewsletterSignupProps {
  type: "industry" | "interest" | "role" | "podcast";
  slug: string;
  name: string;
  variant?: "inline" | "card" | "banner";
  className?: string;
}

export function NewsletterSignup({ type, slug, name, variant = "card", className = "" }: NewsletterSignupProps) {
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      setIsNew(data.isNew);
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

  const frequencyLabel = type === "podcast" ? "recap" : "briefing";
  const typeLabel = type === "industry" ? "industry" : type === "interest" ? "interest" : type === "role" ? "role" : "podcast";

  if (success) {
    return (
      <div className={`rounded-2xl border border-green-500/20 bg-green-500/[0.04] p-5 ${className}`} data-testid="newsletter-success">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center shrink-0 mt-0.5">
            <Check className="w-4 h-4 text-green-600" />
          </div>
          <div className="flex-1">
            <p className="text-[15px] font-semibold text-foreground">
              You're subscribed to {name}
            </p>
            <p className="text-[14px] text-muted-foreground mt-1">
              {isNew ? "We created your account. " : ""}You'll get a daily {frequencyLabel} in your inbox.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-primary hover:underline"
                data-testid="link-manage-subscriptions"
              >
                Manage subscriptions
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <form onSubmit={handleSubmit} className={`flex gap-2 ${className}`} data-testid={`newsletter-form-${type}-${slug}`}>
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full pl-10 pr-4 py-2.5 text-[14px] bg-card border border-black/[0.1] dark:border-white/[0.1] rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
            data-testid="input-newsletter-email"
          />
        </div>
        <button
          type="submit"
          disabled={subscribe.isPending}
          className="px-4 py-2.5 bg-primary text-primary-foreground font-semibold text-[14px] rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
          data-testid="button-newsletter-subscribe"
        >
          {subscribe.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Subscribe"}
        </button>
      </form>
    );
  }

  if (variant === "banner") {
    return (
      <div className={`rounded-2xl bg-gradient-to-r from-primary/[0.06] via-primary/[0.03] to-transparent border border-primary/[0.12] p-5 sm:p-6 ${className}`} data-testid={`newsletter-banner-${type}-${slug}`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-[16px] font-bold text-foreground">
              Get a daily {frequencyLabel} on {name}
            </p>
            <p className="text-[14px] text-muted-foreground mt-1">
              The key insights from across {type === "podcast" ? "every episode" : "top podcasts"}, delivered to your inbox.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="flex gap-2 shrink-0">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-[220px] pl-10 pr-4 py-2.5 text-[14px] bg-card border border-black/[0.1] dark:border-white/[0.1] rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
                data-testid="input-newsletter-email"
              />
            </div>
            <button
              type="submit"
              disabled={subscribe.isPending}
              className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-[14px] rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
              data-testid="button-newsletter-subscribe"
            >
              {subscribe.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Subscribe"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-5 sm:p-6 ${className}`} data-testid={`newsletter-card-${type}-${slug}`}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-xl bg-primary/[0.08] flex items-center justify-center">
          <Mail className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-[15px] font-bold text-foreground">
            Get updates on {name}
          </p>
        </div>
      </div>
      <p className="text-[14px] text-muted-foreground mb-4">
        A daily {frequencyLabel} with the key insights from top podcasts about {name.toLowerCase()}, straight to your inbox.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full pl-10 pr-4 py-2.5 text-[14px] bg-background border border-black/[0.1] dark:border-white/[0.1] rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
            data-testid="input-newsletter-email"
          />
        </div>
        <button
          type="submit"
          disabled={subscribe.isPending}
          className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-[14px] rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
          data-testid="button-newsletter-subscribe"
        >
          {subscribe.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Subscribe"}
        </button>
      </form>
    </div>
  );
}

interface NewsletterModalProps {
  type: "industry" | "interest" | "role" | "podcast";
  slug: string;
  name: string;
  isOpen: boolean;
  onClose: () => void;
}

export function NewsletterModal({ type, slug, name, isOpen, onClose }: NewsletterModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="newsletter-modal">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-xl max-w-md w-full p-6 border border-black/[0.06] dark:border-white/[0.08]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-close-modal"
        >
          <X className="w-5 h-5" />
        </button>
        <NewsletterSignup type={type} slug={slug} name={name} variant="card" />
      </div>
    </div>
  );
}