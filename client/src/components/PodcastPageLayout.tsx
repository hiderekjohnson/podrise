import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, ArrowRight, Clock, Calendar, Mic, Users, Star, Search, Compass, Headphones, Mail, X, Sparkles, ExternalLink, ChevronRight, BookOpen } from "lucide-react";
import { SiApplepodcasts, SiSpotify, SiYoutube } from "react-icons/si";
import { motion, AnimatePresence } from "framer-motion";
import { useRegister } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import { PodCapHeader } from "@/components/PodCapHeader";
import { GetRecapsModal } from "@/components/GetRecapsModal";
import type { PodcastLandingConfig } from "@/data/podcastLandingData";
import { getPodcastCategoryInfo, TOPIC_TO_TOPICS_PAGE_MAP } from "@/data/podcastCategoryData";

export type PodcastTab = "episodes" | "ask" | "about" | "discover" | "books";

interface PodcastPageLayoutProps {
  config: PodcastLandingConfig & { twitterHandle?: string | null };
  activeTab: PodcastTab;
  onTabChange: (tab: PodcastTab) => void;
  children: React.ReactNode;
}

export function PodcastPageLayout({
  config,
  activeTab,
  onTabChange,
  children,
}: PodcastPageLayoutProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { mutate: register, isPending } = useRegister();
  const [email, setEmail] = useState("");
  const [stickyEmail, setStickyEmail] = useState("");
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [stickyDismissed, setStickyDismissed] = useState(false);
  const [showRecapsModal, setShowRecapsModal] = useState(false);
  const ctaSectionRef = useRef<HTMLDivElement>(null);

  const { name, hosts, itunesId, artworkUrl, spotifyUrl, youtubeUrl, totalEpisodes, yearStarted, description, appleRating, appleRatingCount } = config;
  const twitterHandle = config.twitterHandle;
  const categoryInfo = getPodcastCategoryInfo(config);

  const appleUrl = config.appleUrl || `https://podcasts.apple.com/podcast/id${itunesId}`;
  const effectiveSpotifyUrl = spotifyUrl || `https://open.spotify.com/search/${encodeURIComponent(name)}`;

  useEffect(() => {
    if (stickyDismissed) return;
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
  }, [stickyDismissed]);

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

  const tabs: { id: PodcastTab; label: string; icon: typeof Mic }[] = [
    { id: "episodes", label: "Episode Recaps", icon: Mic },
    { id: "discover", label: "Discover", icon: Compass },
    { id: "books", label: "Recommended Reading", icon: BookOpen },
    { id: "ask", label: "Ask About This Podcast", icon: Sparkles },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <PodCapHeader
        rightContent={
          <button
            onClick={() => setShowRecapsModal(true)}
            className="min-h-[44px] px-5 rounded-[10px] font-display font-bold text-[15px] bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:brightness-105 transition-all active:scale-[0.98]"
            data-testid="button-get-recaps"
          >
            Get {name} Recaps
          </button>
        }
      />

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8">
        <section className="w-full max-w-5xl pt-8 sm:pt-12 pb-8 sm:pb-10">
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

              <p className="text-base sm:text-lg text-[#3F3F46] dark:text-[#A1A1AA] leading-relaxed max-w-md line-clamp-3" data-testid="text-description">
                {description ? description.charAt(0).toUpperCase() + description.slice(1) : ""}
              </p>

              {categoryInfo.category && categoryInfo.topics.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[14px] text-muted-foreground justify-center sm:justify-start" data-testid="podcast-category-labels">
                  {categoryInfo.topics.map((topic) => {
                    const insightsSlug = TOPIC_TO_TOPICS_PAGE_MAP[topic.slug];
                    if (!insightsSlug) return null;
                    return (
                      <Link key={topic.slug} href={`/insights/${insightsSlug}`}>
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-muted/60 text-foreground/70 font-medium hover:bg-muted hover:text-foreground transition-colors cursor-pointer" data-testid={`link-topic-${topic.slug}`}>
                          {topic.name}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 mt-1">
                {hosts && (
                  <span className="inline-flex items-center gap-2 text-base text-[#3F3F46] dark:text-[#A1A1AA]" data-testid="text-hosts">
                    <Users className="w-5 h-5 text-[#3F3F46] dark:text-[#A1A1AA]" />
                    <span className="font-medium text-foreground/80">{hosts}</span>
                  </span>
                )}
                {totalEpisodes && (
                  <span className="inline-flex items-center gap-2 text-base text-[#3F3F46] dark:text-[#A1A1AA]" data-testid="text-episodes">
                    <Mic className="w-5 h-5 text-[#3F3F46] dark:text-[#A1A1AA]" />
                    {totalEpisodes}+ episodes
                  </span>
                )}
                {yearStarted && (
                  <span className="inline-flex items-center gap-2 text-base text-[#3F3F46] dark:text-[#A1A1AA]" data-testid="text-since">
                    <Calendar className="w-5 h-5 text-[#3F3F46] dark:text-[#A1A1AA]" />
                    Since {yearStarted}
                  </span>
                )}
                {appleRating && (
                  <span className="inline-flex items-center gap-2 text-base text-[#3F3F46] dark:text-[#A1A1AA]" data-testid="text-apple-rating">
                    <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                    <span className="font-medium text-foreground/80">{appleRating}</span>
                    {appleRatingCount && (
                      <span className="text-muted-foreground/70">({appleRatingCount >= 1000 ? `${(appleRatingCount / 1000).toFixed(appleRatingCount >= 10000 ? 0 : 1)}K` : appleRatingCount.toLocaleString()} ratings)</span>
                    )}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5 mt-2 justify-center sm:justify-start" data-testid="hero-listen-links">
                <a
                  href={appleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-black/[0.04] hover:bg-black/[0.07] rounded-lg text-[15px] font-semibold text-foreground/80 hover:text-foreground transition-colors min-h-[44px]"
                  data-testid="hero-link-apple"
                  title="Listen on Apple Podcasts"
                >
                  <SiApplepodcasts className="w-5 h-5 text-[#9933CC]" />
                  Apple Podcasts
                  <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                </a>
                <a
                  href={effectiveSpotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-black/[0.04] hover:bg-black/[0.07] rounded-lg text-[15px] font-semibold text-foreground/80 hover:text-foreground transition-colors min-h-[44px]"
                  data-testid="hero-link-spotify"
                  title="Listen on Spotify"
                >
                  <SiSpotify className="w-5 h-5 text-[#1DB954]" />
                  Spotify
                  <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                </a>
                {youtubeUrl && (
                  <a
                    href={youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-black/[0.04] hover:bg-black/[0.07] rounded-lg text-[15px] font-semibold text-foreground/80 hover:text-foreground transition-colors min-h-[44px]"
                    data-testid="hero-link-youtube"
                    title="Watch on YouTube"
                  >
                    <SiYoutube className="w-5 h-5 text-[#FF0000]" />
                    YouTube
                    <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        </section>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="w-full max-w-5xl"
        >
          <nav className="sticky top-[68px] z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 bg-background/90 backdrop-blur-md border-b border-black/[0.06] dark:border-white/[0.06] flex items-center gap-1 overflow-x-auto hide-scrollbar mb-8" data-testid="section-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-2 px-4 py-3.5 text-[15px] font-semibold transition-colors border-b-2 -mb-px whitespace-nowrap min-h-[48px] ${
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground hover:border-black/[0.08]"
                }`}
                data-testid={`tab-${tab.id}`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.id === "ask" && (
                  <span className="ml-1 px-2 py-0.5 text-[12px] font-bold uppercase tracking-wider rounded bg-violet-500/10 text-violet-500 leading-none" data-testid="badge-ask-ai">AI</span>
                )}
              </button>
            ))}
          </nav>

          {children}
        </motion.div>

        <motion.section
          ref={ctaSectionRef}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="w-full max-w-5xl pb-16"
        >
          <div className="bg-primary/[0.03] border border-primary/[0.08] rounded-2xl p-6 sm:p-8" data-testid="section-bottom-cta">
            <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
              <div className="flex-1 text-center sm:text-left">
                <h2 className="text-xl sm:text-2xl font-display font-extrabold text-foreground leading-snug mb-2">
                  Get {name} recaps in your inbox
                </h2>
                <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]">
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
      </main>

      <Footer />

      <AnimatePresence>
        {showStickyBar && !stickyDismissed && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-black/95 backdrop-blur-lg border-t border-black/[0.08] dark:border-white/[0.08] shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
            data-testid="sticky-signup-bar"
          >
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row items-center gap-3">
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
                className="absolute top-2 right-2 sm:relative sm:top-auto sm:right-auto p-2 rounded-md text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground hover:bg-black/[0.04] transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
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
