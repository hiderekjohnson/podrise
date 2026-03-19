import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, ArrowRight, Clock, Calendar, Mic, Users, Star, Search, Compass, Headphones, Mail, X, Sparkles, ExternalLink, ChevronRight, BookOpen, ShoppingBag, Shield, Heart } from "lucide-react";
import { SiApplepodcasts, SiSpotify, SiYoutube } from "react-icons/si";
import { motion, AnimatePresence } from "framer-motion";
import { useRegister, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { GetRecapsModal } from "@/components/GetRecapsModal";
import type { PodcastLandingConfig } from "@/data/podcastLandingData";
import { useSetConversion } from "@/contexts/PageConversionContext";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export type PodcastTab = "episodes" | "about" | "discover" | "books" | "shop" | "get-recaps";

interface PodcastPageLayoutProps {
  config: PodcastLandingConfig & { twitterHandle?: string | null };
  children: React.ReactNode;
  activeTab?: PodcastTab;
  onTabChange?: (tab: PodcastTab) => void;
}

export function PodcastPageLayout({
  config,
  children,
}: PodcastPageLayoutProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: authUser } = useAuth();
  const isLoggedIn = !!authUser;
  const { mutate: register, isPending } = useRegister();
  const [email, setEmail] = useState("");
  const [stickyEmail, setStickyEmail] = useState("");
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [stickyDismissed, setStickyDismissed] = useState(false);
  const [showRecapsModal, setShowRecapsModal] = useState(false);
  const [activeSection, setActiveSection] = useState("section-episodes");
  const ctaSectionRef = useRef<HTMLDivElement>(null);

  const { name, hosts, itunesId, artworkUrl, spotifyUrl, youtubeUrl, totalEpisodes, yearStarted, description, appleRating, appleRatingCount } = config;
  const twitterHandle = config.twitterHandle;

  useSetConversion({
    pageType: "podcast",
    name,
    slug: config.slug,
    artworkUrl,
    hosts: hosts ? hosts.split(/,\s*|&\s*|\sand\s/i).map(h => h.trim()).filter(Boolean) : [],
    description,
  });

  const appleUrl = config.appleUrl || `https://podcasts.apple.com/podcast/id${itunesId}`;
  const effectiveSpotifyUrl = spotifyUrl || `https://open.spotify.com/search/${encodeURIComponent(name)}`;

  const { data: followData } = useQuery<{ followedSlugs: string[] }>({
    queryKey: ["/api/feed/followed-slugs"],
    enabled: isLoggedIn,
  });

  const isFollowing = followData?.followedSlugs?.includes(config.slug) ?? false;

  const followMutation = useMutation({
    mutationFn: async ({ follow }: { follow: boolean }) => {
      const endpoint = follow ? "/api/feed/follow" : "/api/feed/unfollow";
      await apiRequest("POST", endpoint, { podcastSlug: config.slug });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-slugs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update subscription", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (isLoggedIn || stickyDismissed) return;
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const threshold = 600;
      const ctaEl = ctaSectionRef.current;
      const ctaInView = ctaEl
        ? ctaEl.getBoundingClientRect().top < window.innerHeight - 60 && ctaEl.getBoundingClientRect().bottom > 60
        : false;
      setShowStickyBar(scrollY > threshold && !ctaInView);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isLoggedIn, stickyDismissed]);

  useEffect(() => {
    const sectionIds = [
      "section-episodes",
      "section-discover",
      "section-shop",
    ];

    const handleScroll = () => {
      const offset = (isLoggedIn ? 0 : 68) + 52 + 40;
      let current = sectionIds[0];
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= offset) {
          current = id;
        }
      }
      setActiveSection(current);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isLoggedIn]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const headerHeight = isLoggedIn ? 0 : 68;
    const navHeight = 52;
    const offset = headerHeight + navHeight + 16;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  };

  const doRegister = useCallback((emailVal: string) => {
    if (!emailVal.trim() || !/^\S+@\S+\.\S+$/.test(emailVal)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    register(
      {
        podcasts: [JSON.stringify({ id: itunesId, name, artworkUrl: artworkUrl || "" })],
        email: emailVal.trim(),
      },
      {
        onSuccess: () => navigate("/dashboard?welcome=true"),
        onError: (err) => {
          toast({
            title: "Something went wrong",
            description: err.message?.includes("400")
              ? "An account with this email already exists. Try logging in."
              : err.message,
            variant: "destructive",
          });
        },
      }
    );
  }, [itunesId, name, artworkUrl, register, navigate, toast]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doRegister(email);
  };

  const handleStickySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doRegister(stickyEmail);
  };

  const navItems: { id: string; label: string; icon: typeof Mic; accent?: boolean; action?: () => void; beta?: boolean }[] = [
    { id: "section-episodes", label: "Episode Recaps", icon: Mic },
    { id: "section-discover", label: "Discover", icon: Compass },
    { id: "section-shop", label: "Shop", icon: ShoppingBag, beta: true },
    ...(isLoggedIn
      ? []
      : [{ id: "get-recaps-modal", label: "Get Recaps", icon: Mail, accent: true, action: () => setShowRecapsModal(true) }]
    ),
  ];

  return (
    <div className={`min-h-screen flex flex-col overflow-x-clip ${isLoggedIn ? "pb-[calc(80px+env(safe-area-inset-bottom,0px))] md:pb-0" : ""}`}>
      {!isLoggedIn && <SiteHeader />}

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8">
        {!isLoggedIn && <section className="w-full max-w-7xl pt-8 sm:pt-12 pb-8 sm:pb-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-center sm:items-start"
          >
            {artworkUrl && (
              <div className="relative shrink-0">
                <div className="absolute -inset-4 bg-primary/[0.06] rounded-[2rem] blur-2xl" />
                <img
                  src={artworkUrl}
                  alt={`${name} Podcast Cover Art`}
                  className="relative w-52 h-52 sm:w-56 sm:h-56 rounded-2xl shadow-2xl shadow-black/[0.12] object-cover ring-1 ring-black/[0.04]"
                  data-testid="img-podcast-artwork"
                />
              </div>
            )}

            <div className="flex flex-col gap-3 text-center sm:text-left flex-1 min-w-0">
              <h1
                className="text-[1.75rem] sm:text-[2rem] lg:text-[2.25rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.025em]"
                data-testid="heading-main"
              >
                {name}
              </h1>

              <p className="text-base sm:text-lg text-[#52525B] dark:text-[#A1A1AA] leading-relaxed max-w-md line-clamp-3" data-testid="text-description">
                {description ? description.charAt(0).toUpperCase() + description.slice(1) : ""}
              </p>


              <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 mt-1">
                {hosts && (
                  <span className="inline-flex items-center gap-2 text-base text-[#52525B] dark:text-[#A1A1AA]" data-testid="text-hosts">
                    <Users className="w-5 h-5 text-[#52525B] dark:text-[#A1A1AA]" />
                    <span className="font-medium text-[#52525B]">{hosts}</span>
                  </span>
                )}
                {totalEpisodes && (
                  <span className="inline-flex items-center gap-2 text-base text-[#52525B] dark:text-[#A1A1AA]" data-testid="text-episodes">
                    <Mic className="w-5 h-5 text-[#52525B] dark:text-[#A1A1AA]" />
                    {totalEpisodes}+ episodes
                  </span>
                )}
                {yearStarted && (
                  <span className="inline-flex items-center gap-2 text-base text-[#52525B] dark:text-[#A1A1AA]" data-testid="text-since">
                    <Calendar className="w-5 h-5 text-[#52525B] dark:text-[#A1A1AA]" />
                    Since {yearStarted}
                  </span>
                )}
                {appleRating && (
                  <span className="inline-flex items-center gap-2 text-base text-[#52525B] dark:text-[#A1A1AA]" data-testid="text-apple-rating">
                    <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                    <span className="font-medium text-[#52525B]">{appleRating}</span>
                    {appleRatingCount && (
                      <span className="text-[#52525B]">({appleRatingCount >= 1000 ? `${(appleRatingCount / 1000).toFixed(appleRatingCount >= 10000 ? 0 : 1)}K` : appleRatingCount.toLocaleString()} ratings)</span>
                    )}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 mt-2 justify-center sm:justify-start" data-testid="hero-listen-links">
                {isLoggedIn && (
                  <>
                    <button
                      onClick={() => followMutation.mutate({ follow: !isFollowing })}
                      disabled={followMutation.isPending}
                      className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[15px] sm:text-[16px] font-semibold min-h-[44px] whitespace-nowrap shrink-0 transition-all active:scale-[0.98] ${
                        isFollowing
                          ? "bg-primary/[0.08] text-primary border border-primary/20 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                          : "bg-primary text-white hover:bg-[#4F46E5] shadow-sm shadow-primary/20"
                      }`}
                      data-testid="button-follow-podcast"
                    >
                      {followMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Heart className={`w-4 h-4 ${isFollowing ? "fill-current" : ""}`} />
                          {isFollowing ? "Following" : "Follow"}
                        </>
                      )}
                    </button>
                  </>
                )}
                <a
                  href={appleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 bg-black/[0.04] hover:bg-black/[0.07] rounded-lg text-[15px] sm:text-[16px] font-semibold text-[#52525B] hover:text-foreground transition-colors min-h-[44px] whitespace-nowrap shrink-0"
                  data-testid="hero-link-apple"
                  title="Listen on Apple Podcasts"
                >
                  <SiApplepodcasts className="w-4 h-4 text-[#9933CC]" />
                  Apple Podcasts
                  <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                </a>
                <a
                  href={effectiveSpotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 bg-black/[0.04] hover:bg-black/[0.07] rounded-lg text-[15px] sm:text-[16px] font-semibold text-[#52525B] hover:text-foreground transition-colors min-h-[44px] whitespace-nowrap shrink-0"
                  data-testid="hero-link-spotify"
                  title="Listen on Spotify"
                >
                  <SiSpotify className="w-4 h-4 text-[#1DB954]" />
                  Spotify
                  <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                </a>
                {youtubeUrl && (
                  <a
                    href={youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 bg-black/[0.04] hover:bg-black/[0.07] rounded-lg text-[15px] sm:text-[16px] font-semibold text-[#52525B] hover:text-foreground transition-colors min-h-[44px] whitespace-nowrap shrink-0"
                    data-testid="hero-link-youtube"
                    title="Watch on YouTube"
                  >
                    <SiYoutube className="w-4 h-4 text-[#FF0000]" />
                    YouTube
                    <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        </section>}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="w-full max-w-7xl"
        >
          <nav className={`sticky ${isLoggedIn ? "top-0" : "top-[68px]"} z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2.5 bg-background/90 backdrop-blur-md border-b border-black/[0.06] dark:border-white/[0.06] flex items-center gap-2 overflow-x-auto hide-scrollbar mb-8`} data-testid="section-tabs">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => item.action ? item.action() : scrollTo(item.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-[16px] font-semibold min-h-[44px] rounded-lg whitespace-nowrap transition-colors ${
                  item.action
                    ? "text-primary/70 hover:text-primary hover:bg-primary/[0.06]"
                    : activeSection === item.id
                      ? "bg-primary/[0.12] text-primary"
                      : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"
                }`}
                data-testid={`tab-${item.id.replace("section-", "")}`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
                {item.beta && (
                  <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white shadow-sm shadow-[#6366F1]/25 border border-[#818CF8]/30 dark:border-[#6366F1]/40 dark:shadow-[#6366F1]/20" data-testid="tab-badge-beta">
                    <Shield className="w-2.5 h-2.5" />
                    Beta
                  </span>
                )}
              </button>
            ))}
          </nav>

          {children}
        </motion.div>

        {!isLoggedIn && (
          <motion.section
            ref={ctaSectionRef}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="w-full max-w-7xl pb-16"
          >
            <div className="bg-primary/[0.03] border border-primary/[0.08] rounded-2xl p-6 sm:p-8" data-testid="section-bottom-cta">
              <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
                <div className="flex-1 text-center sm:text-left">
                  <h2 className="text-xl sm:text-2xl font-display font-extrabold text-foreground leading-snug mb-2">
                    Get {name} recaps in your inbox
                  </h2>
                  <p className="text-base text-[#52525B] dark:text-[#A1A1AA]">
                    We'll send a recap whenever a new episode drops.
                  </p>
                </div>
                <form onSubmit={handleSubmit} className="flex gap-2.5 w-full sm:w-auto" data-testid="form-signup-bottom">
                  <input
                    data-testid="input-email-bottom"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="flex-1 sm:w-56 h-[52px] px-4 bg-white border-[1.5px] border-[#D4D4D8] rounded-xl text-foreground text-[17px] focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/25 transition-all font-medium placeholder:text-[#71717A] shadow-sm shadow-black/[0.03]"
                  />
                  <button
                    data-testid="button-signup-bottom"
                    type="submit"
                    disabled={isPending}
                    className="min-h-[52px] px-6 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-[17px] bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:brightness-105 disabled:opacity-40 transition-all active:scale-[0.98] whitespace-nowrap"
                  >
                    {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Get Started"}
                  </button>
                </form>
              </div>
            </div>
          </motion.section>
        )}
      </main>

      {!isLoggedIn && <Footer />}

      <AnimatePresence>
        {!isLoggedIn && showStickyBar && !stickyDismissed && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-black/95 backdrop-blur-lg border-t border-black/[0.08] dark:border-white/[0.08] shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
            data-testid="sticky-signup-bar"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row items-center gap-3">
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-10 h-10 rounded-lg bg-primary/[0.08] flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <p className="text-base font-semibold text-foreground whitespace-nowrap">
                  Never miss a <span className="text-primary">{name}</span> recap
                </p>
              </div>
              <form onSubmit={handleStickySubmit} className="flex flex-1 gap-2 w-full sm:w-auto" data-testid="form-sticky-signup">
                <input
                  data-testid="input-email-sticky"
                  type="email"
                  value={stickyEmail}
                  onChange={(e) => setStickyEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 h-[44px] px-4 bg-black/[0.03] dark:bg-white/[0.06] border-[1.5px] border-[#D4D4D8] dark:border-white/[0.08] rounded-lg text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all placeholder:text-[#71717A]"
                />
                <button
                  data-testid="button-sticky-signup"
                  type="submit"
                  className="min-h-[44px] px-5 rounded-lg font-bold text-base bg-primary text-primary-foreground shadow-sm hover:brightness-105 transition-all active:scale-[0.98] whitespace-nowrap"
                >
                  Subscribe free
                </button>
              </form>
              <button
                onClick={() => setStickyDismissed(true)}
                className="absolute top-2 right-2 sm:relative sm:top-auto sm:right-auto p-2 rounded-md text-[#52525B] dark:text-[#A1A1AA] hover:text-foreground hover:bg-black/[0.04] transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                data-testid="button-dismiss-sticky"
                aria-label="Dismiss"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <GetRecapsModal
        open={showRecapsModal}
        onClose={() => setShowRecapsModal(false)}
        podcastName={name}
        artworkUrl={artworkUrl}
        itunesId={itunesId}
      />
    </div>
  );
}
