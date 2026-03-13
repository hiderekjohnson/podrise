import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Mail, X, ArrowRight, Loader2, Check, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { usePageConversion, type PageConversionData } from "@/contexts/PageConversionContext";

const STORAGE_KEY = "podcap_exit_dismissed";
const MIN_TIME_ON_PAGE_MS = 8000;
const SCROLL_THRESHOLD = 0.3;

function getContextualCopy(data: PageConversionData | null) {
  if (!data) {
    return {
      badge: "Before you go",
      heading: "Never miss the key takeaways",
      subtext: "Get AI-generated recaps of every episode from top podcasts — the insights without the hours of listening.",
      cta: "Get free recaps",
      subscribeType: "interest" as const,
      subscribeSlug: "general",
      subscribeName: "PodCap Recaps",
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
        subscribeType: "podcast" as const,
        subscribeSlug: data.slug,
        subscribeName: data.name,
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
        subscribeType: "podcast" as const,
        subscribeSlug: data.podcastSlug || data.slug,
        subscribeName: podcastDisplayName,
      };
    }
    case "topic": {
      const label = data.categoryType === "industry" ? "industry" : data.categoryType === "role" ? "role" : "topic";
      return {
        badge: `${data.name} Intelligence`,
        heading: `Stay ahead on ${data.name.toLowerCase()}`,
        subtext: `Get a daily briefing with the key insights about ${data.name.toLowerCase()} from ${data.podcastCount ? `${data.podcastCount}+` : "top"} podcasts — delivered to your inbox.`,
        cta: `Get the ${data.name} briefing`,
        subscribeType: data.categoryType || "interest",
        subscribeSlug: data.slug,
        subscribeName: data.name,
      };
    }
    case "category": {
      const catLabel = data.categoryType === "industry" ? "industry" : data.categoryType === "role" ? "role" : "interest";
      return {
        badge: "Podcast Intelligence",
        heading: `Get daily ${catLabel} briefings`,
        subtext: `Choose the ${catLabel === "role" ? "roles" : catLabel === "industry" ? "industries" : "topics"} you care about and get a daily briefing with key insights from top podcasts.`,
        cta: "Get started free",
        subscribeType: data.categoryType || "interest",
        subscribeSlug: "general",
        subscribeName: `PodCap ${data.name}`,
      };
    }
    default:
      return {
        badge: "Before you go",
        heading: "Never miss the key takeaways",
        subtext: "Get AI-generated recaps of every episode from top podcasts — the insights without the hours of listening.",
        cta: "Get free recaps",
        subscribeType: "interest" as const,
        subscribeSlug: "general",
        subscribeName: "PodCap Recaps",
      };
  }
}

export function ExitIntentPopup() {
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useAuth();
  const { data: pageData } = usePageConversion();
  const triggeredRef = useRef(false);
  const mountTimeRef = useRef(Date.now());
  const hasScrolledRef = useRef(false);

  const copy = getContextualCopy(pageData);

  const subscribe = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/subscriptions/quick-subscribe", {
        email,
        type: copy.subscribeType,
        slug: copy.subscribeSlug,
        name: copy.subscribeName,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSuccess(true);
      setIsNewUser(data.isNew);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      localStorage.setItem(STORAGE_KEY, "subscribed");
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't subscribe",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    subscribe.mutate();
  };

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
              {success ? (
                <div className="text-center py-4">
                  {showArtwork && (
                    <img src={pageData!.artworkUrl} alt={pageData!.name} className="w-16 h-16 rounded-xl mx-auto mb-4 shadow-lg" />
                  )}
                  <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                    <Check className="w-7 h-7 text-green-600" />
                  </div>
                  <h3 className="text-xl font-display font-bold text-foreground mb-2" data-testid="text-exit-intent-success">
                    You're in!
                  </h3>
                  <p className="text-[15px] text-muted-foreground mb-4">
                    {isNewUser ? "We created your account. " : ""}
                    {pageData?.pageType === "podcast" || pageData?.pageType === "episode"
                      ? `You'll get a recap every time ${pageData.podcastName || pageData.name} drops a new episode.`
                      : "Check your inbox for podcast recaps."}
                  </p>
                  <Link href="/dashboard" onClick={dismiss}>
                    <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-primary hover:underline cursor-pointer" data-testid="link-exit-intent-dashboard">
                      Go to your dashboard <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </Link>
                </div>
              ) : (
                <>
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
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                      <input
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoFocus
                        className="w-full pl-11 pr-4 py-3.5 text-[15px] bg-card border border-black/[0.1] dark:border-white/[0.1] rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
                        data-testid="input-exit-intent-email"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={subscribe.isPending}
                      className="w-full py-3.5 bg-primary text-primary-foreground font-bold text-[15px] rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      data-testid="button-exit-intent-subscribe"
                    >
                      {subscribe.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          {copy.cta}
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>
                  <p className="text-[12px] text-muted-foreground/50 text-center mt-3">
                    No spam. Unsubscribe anytime.
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
