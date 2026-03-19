import { useState, useEffect } from "react";
import { X, ArrowRight, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { data: user } = useAuth();

  useEffect(() => {
    if (user || dismissed) return;
    const handleScroll = () => {
      setShow(window.scrollY > scrollThreshold);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [user, dismissed, scrollThreshold]);

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
            <a
              href="https://podrise.com/register"
              className="h-10 px-4 rounded-lg font-bold text-[14px] bg-primary text-primary-foreground shadow-sm hover:brightness-105 transition-all active:scale-[0.98] whitespace-nowrap flex items-center gap-1.5"
              data-testid="button-sticky-register"
            >
              Sign Up Free <ArrowRight className="w-3.5 h-3.5" />
            </a>
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
