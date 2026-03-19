import { useState, useEffect, useCallback, useRef } from "react";
import { X, ArrowRight, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { usePageConversion, type PageConversionData } from "@/contexts/PageConversionContext";

const STORAGE_KEY = "podrise_exit_dismissed";
const MIN_TIME_ON_PAGE_MS = 8000;
const SCROLL_THRESHOLD = 0.3;

function getContextualCopy(data: PageConversionData | null) {
  if (!data) {
    return {
      badge: "Before you go",
      heading: "Never miss the key takeaways",
      subtext: "Get AI-generated recaps of every episode from top podcasts — the insights without the hours of listening.",
      cta: "Get free recaps",
    };
  }

  switch (data.pageType) {
    case "podcast": {
      const hostList = data.hosts || [];
      const hostDisplay = hostList.length > 2
        ? `${hostList.slice(0, 2).join(", ")} & more`
        : hostList.join(" & ");
      return {
        badge: `${data.name} Recaps`,
        heading: hostDisplay
          ? `Don't miss ${hostDisplay}'s latest takes`
          : `Never miss a ${data.name} episode`,
        subtext: `Get a free recap every time ${data.name} drops a new episode — key insights in 5 minutes, not ${data.description ? "hours" : "an hour"}.`,
        cta: `Get ${data.name} recaps`,
      };
    }
    case "episode": {
      const hostList = data.hosts || [];
      const podcastDisplayName = data.podcastName || data.name;
      const hostDisplay = hostList.length > 2
        ? `${hostList.slice(0, 2).join(", ")} & more`
        : hostList.join(" & ");
      return {
        badge: `${data.name} Recaps`,
        heading: hostDisplay
          ? `Get every ${podcastDisplayName} recap with ${hostDisplay}`
          : `Never miss a ${podcastDisplayName} recap`,
        subtext: `Liked this recap? Get one every time a new episode drops — free, in your inbox.`,
        cta: `Get ${podcastDisplayName} recaps`,
      };
    }
    case "topic": {
      return {
        badge: `${data.name} Intelligence`,
        heading: `Stay ahead on ${data.name.toLowerCase()}`,
        subtext: `Get a daily briefing with the key insights about ${data.name.toLowerCase()} — delivered to your inbox.`,
        cta: `Get the ${data.name} briefing`,
      };
    }
    case "category": {
      const catLabel = data.categoryType === "industry" ? "industry" : data.categoryType === "role" ? "role" : "interest";
      return {
        badge: "Podcast Intelligence",
        heading: `Get daily ${catLabel} briefings`,
        subtext: `Choose the ${catLabel === "role" ? "roles" : catLabel === "industry" ? "industries" : "topics"} you care about and get a daily briefing with key insights from top podcasts.`,
        cta: "Get started free",
      };
    }
    default:
      return {
        badge: "Before you go",
        heading: "Never miss the key takeaways",
        subtext: "Get AI-generated recaps of every episode from top podcasts — the insights without the hours of listening.",
        cta: "Get free recaps",
      };
  }
}

export function ExitIntentPopup() {
  const [show, setShow] = useState(false);
  const { data: user } = useAuth();
  const { data: pageData } = usePageConversion();
  const triggeredRef = useRef(false);
  const mountTimeRef = useRef(Date.now());
  const hasScrolledRef = useRef(false);

  const copy = getContextualCopy(pageData);

  const dismiss = useCallback(() => {
    setShow(false);
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  }, []);

  const shouldSuppress = useCallback(() => {
    if (user) return true;
    if (!pageData) return true;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return false;
    if (stored === "subscribed") return true;
    const dismissedAt = parseInt(stored, 10);
    if (!isNaN(dismissedAt)) {
      const hoursSince = (Date.now() - dismissedAt) / (1000 * 60 * 60);
      if (hoursSince < 72) return true;
    }
    return false;
  }, [user, pageData]);

  const tryShow = useCallback(() => {
    if (triggeredRef.current) return;
    if (shouldSuppress()) return;
    const elapsed = Date.now() - mountTimeRef.current;
    if (elapsed < MIN_TIME_ON_PAGE_MS) return;
    if (!hasScrolledRef.current) return;
    triggeredRef.current = true;
    setShow(true);
  }, [shouldSuppress]);

  useEffect(() => {
    if (shouldSuppress()) return;

    const handleScroll = () => {
      const scrollPercent = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
      if (scrollPercent > SCROLL_THRESHOLD) {
        hasScrolledRef.current = true;
      }
    };

    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 5 && e.movementY < -5) {
        tryShow();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        tryShow();
      }
    };

    let touchStartY = 0;
    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };
    const handleTouchMove = (e: TouchEvent) => {
      const deltaY = e.touches[0].clientY - touchStartY;
      if (deltaY > 80 && window.scrollY < 10) {
        tryShow();
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, [tryShow, shouldSuppress]);

  const showArtwork = pageData?.artworkUrl && (pageData.pageType === "podcast" || pageData.pageType === "episode");

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="exit-intent-popup">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={dismiss}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative bg-background rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-black/[0.06] dark:border-white/[0.08]"
          >
            <button
              onClick={dismiss}
              className="absolute top-4 right-4 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-colors z-10"
              data-testid="button-close-exit-intent"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-6 sm:p-8">
              {showArtwork && (
                <div className="flex justify-center mb-5">
                  <div className="relative">
                    <div className="absolute -inset-3 bg-primary/[0.06] rounded-2xl blur-xl" />
                    <img
                      src={pageData!.artworkUrl}
                      alt={pageData!.name}
                      className="relative w-20 h-20 rounded-xl shadow-xl ring-1 ring-black/[0.06]"
                    />
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 mb-3 justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-[14px] font-semibold uppercase tracking-[0.12em] text-primary">{copy.badge}</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-display font-bold text-foreground mb-2 leading-tight text-center" data-testid="text-exit-intent-heading">
                {copy.heading}
              </h3>
              <p className="text-[15px] text-muted-foreground leading-relaxed mb-6 text-center">
                {copy.subtext}
              </p>
              <a
                href="https://podrise.com/register"
                className="w-full py-3.5 bg-primary text-primary-foreground font-bold text-[15px] rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                data-testid="button-exit-intent-register"
              >
                {copy.cta}
                <ArrowRight className="w-4 h-4" />
              </a>
              <p className="text-[12px] text-muted-foreground/50 text-center mt-3">
                No spam. Unsubscribe anytime.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
