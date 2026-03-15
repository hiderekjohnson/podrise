import { useState, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Mail, X, Loader2, ArrowRight, Check, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface StickyEmailBarProps {
  type: "industry" | "interest" | "role" | "podcast";
  slug: string;
  name: string;
  artworkUrl?: string;
  hosts?: string;
  scrollThreshold?: number;
}

export function StickyEmailBar({ type, slug, name, artworkUrl, hosts, scrollThreshold = 500 }: StickyEmailBarProps) {
  const [email, setEmail] = useState("");
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useAuth();

  const [isNewUser, setIsNewUser] = useState(false);

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
      setIsNewUser(data.isNew);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: data.isNew ? `Subscribed to ${name}` : `Added to your daily ${label}!`,
        description: data.isNew ? "Your account has been created." : "Go to your dashboard to manage all your subscriptions.",
      });
      setTimeout(() => setDismissed(true), 5000);
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't subscribe",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (user || dismissed) return;
    const handleScroll = () => {
      setShow(window.scrollY > scrollThreshold);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [user, dismissed, scrollThreshold]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    subscribe.mutate();
  }, [email, subscribe]);

  if (user || dismissed) return null;

  const isPodcast = type === "podcast";
  const label = isPodcast ? "recap" : "briefing";
  const hostList = hosts?.split(/,\s*|&\s*|\sand\s/i).map(h => h.trim()).filter(Boolean) || [];
  const hostShort = hostList.length > 0 ? hostList[0] : "";

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-black/95 backdrop-blur-lg border-t border-black/[0.08] dark:border-white/[0.08] shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
          data-testid="sticky-email-bar"
        >
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center gap-3">
            {success ? (
              <div className="flex items-center gap-2 text-[#6366F1] font-semibold text-[15px]" data-testid="sticky-bar-success">
                <Check className="w-4 h-4" />
                {isNewUser ? `Subscribed to ${name}!` : `Added to your daily ${label}!`}
                {!isNewUser && (
                  <Link href="/dashboard" className="ml-2 underline hover:text-[#6366F1]/80 transition-colors" data-testid="link-sticky-bar-dashboard">
                    Go to dashboard
                  </Link>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2.5 shrink-0">
                  {artworkUrl && isPodcast ? (
                    <img src={artworkUrl} alt={name} className="w-9 h-9 rounded-lg shadow-sm ring-1 ring-black/[0.06] shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-primary/[0.08] flex items-center justify-center shrink-0">
                      <Zap className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <p className="text-[14px] sm:text-[15px] font-semibold text-foreground">
                    {isPodcast
                      ? <>Never miss a <span className="text-primary">{name}</span> {label}{hostShort ? ` with ${hostShort}` : ""}</>
                      : <>Get the daily <span className="text-primary">{name}</span> {label}</>}
                  </p>
                </div>
                <form onSubmit={handleSubmit} className="flex flex-1 gap-2 w-full sm:w-auto" data-testid="form-sticky-email">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    className="flex-1 h-10 px-3.5 bg-black/[0.03] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.08] rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all placeholder:text-muted-foreground/40"
                    data-testid="input-sticky-email"
                  />
                  <button
                    type="submit"
                    disabled={subscribe.isPending}
                    className="h-10 px-4 rounded-lg font-bold text-[14px] bg-primary text-primary-foreground shadow-sm hover:brightness-105 transition-all active:scale-[0.98] whitespace-nowrap flex items-center gap-1.5"
                    data-testid="button-sticky-subscribe"
                  >
                    {subscribe.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <>Subscribe <ArrowRight className="w-3.5 h-3.5" /></>}
                  </button>
                </form>
              </>
            )}
            <button
              onClick={() => setDismissed(true)}
              className="absolute top-2 right-2 sm:relative sm:top-auto sm:right-auto p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-black/[0.04] transition-colors shrink-0"
              data-testid="button-dismiss-sticky-bar"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
