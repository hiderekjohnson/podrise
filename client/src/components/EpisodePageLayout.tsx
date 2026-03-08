import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Clock, Headphones, FileText, ArrowRight, Mail, X, Search } from "lucide-react";
import { useRegister } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PodCapHeader } from "@/components/PodCapHeader";
import { Footer } from "@/components/Footer";
import { EpisodeCard } from "@/components/EpisodeCard";
import type { PodcastLandingConfig } from "@/data/podcastLandingData";

const APPLE_PODCASTS_SVG = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5">
    <defs><linearGradient id="ap-grad" x1="12" y1="24" x2="12" y2="0" gradientUnits="userSpaceOnUse"><stop stopColor="#822cbe"/><stop offset="1" stopColor="#d94afa"/></linearGradient></defs>
    <rect width="24" height="24" rx="5.4" fill="url(#ap-grad)"/>
    <path d="M12 5.6a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 4.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM12 13.1a1.15 1.15 0 0 0-1.15 1.15v.1l.35 4.3a.8.8 0 0 0 .8.75h.01a.8.8 0 0 0 .8-.75l.34-4.3v-.1A1.15 1.15 0 0 0 12 13.1Z" fill="white"/>
  </svg>
);

const SPOTIFY_SVG = (
  <svg viewBox="0 0 24 24" fill="#1DB954" className="w-3.5 h-3.5"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
);

interface EpisodePageLayoutProps {
  episode: {
    podcastName: string;
    episodeTitle: string;
    publishDate: string;
    artworkUrl: string;
    duration?: string;
    hosts?: string;
    appleEpisodeUrl?: string;
  };
  podcastSlug: string;
  episodeSlug: string;
  podcastConfig: PodcastLandingConfig;
  activeTab: "recap" | "transcript";
  allRecaps?: any[];
  children: React.ReactNode;
  tabSearchOnKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  tabSearchValue?: string;
  tabSearchOnChange?: (val: string) => void;
}

export function EpisodePageLayout({
  episode,
  podcastSlug,
  episodeSlug,
  podcastConfig,
  activeTab,
  allRecaps = [],
  children,
  tabSearchOnKeyDown,
  tabSearchValue,
  tabSearchOnChange,
}: EpisodePageLayoutProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [stickyEmail, setStickyEmail] = useState("");
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [stickyDismissed, setStickyDismissed] = useState(false);
  const ctaSectionRef = useRef<HTMLDivElement>(null);
  const register = useRegister();

  const publishDate = new Date(episode.publishDate + "T00:00:00");
  const formattedDate = publishDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const currentIdx = allRecaps.findIndex((r: any) => r.episodeSlug === episodeSlug);
  const previousEpisodes = currentIdx >= 0 ? allRecaps.slice(currentIdx + 1, currentIdx + 6) : [];

  const appleLink = episode.appleEpisodeUrl || `https://podcasts.apple.com/podcast/id${podcastConfig?.itunesId}`;
  const spotifyLink = `https://open.spotify.com/search/${encodeURIComponent(episode.episodeTitle + ' ' + episode.podcastName)}`;

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    register(
      {
        podcasts: [JSON.stringify({ id: podcastConfig.itunesId, name: podcastConfig.name, artworkUrl: podcastConfig.artworkUrl || "" })],
        email: email.trim(),
      },
      {
        onSuccess: () => navigate("/dashboard?welcome=true"),
        onError: (err: any) => {
          toast({
            title: "Something went wrong",
            description: err.message?.includes("400") ? "This email is already registered. Try logging in." : "Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleStickySubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!stickyEmail.trim() || !/^\S+@\S+\.\S+$/.test(stickyEmail)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    register(
      {
        podcasts: [JSON.stringify({ id: podcastConfig.itunesId, name: podcastConfig.name, artworkUrl: podcastConfig.artworkUrl || "" })],
        email: stickyEmail.trim(),
      },
      {
        onSuccess: () => navigate("/dashboard?welcome=true"),
        onError: (err: any) => {
          toast({
            title: "Something went wrong",
            description: err.message?.includes("400") ? "This email is already registered. Try logging in." : "Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  }, [stickyEmail, podcastConfig, register, navigate, toast]);

  const recapUrl = `/podcasts/${podcastSlug}/${episodeSlug}`;
  const transcriptUrl = `/podcasts/${podcastSlug}/${episodeSlug}/transcript`;

  return (
    <div className="min-h-screen bg-background">
      <PodCapHeader />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-10 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex items-start gap-5 sm:gap-6 mb-10">
            <Link href={`/podcasts/${podcastSlug}`}>
              <img
                src={episode.artworkUrl}
                alt={episode.podcastName}
                className="w-[88px] h-[88px] sm:w-28 sm:h-28 rounded-2xl object-cover shadow-lg shadow-black/[0.08] shrink-0 ring-1 ring-black/[0.04] cursor-pointer hover:shadow-xl hover:shadow-black/[0.12] transition-shadow"
                data-testid="img-episode-artwork"
              />
            </Link>
            <div className="min-w-0 pt-1">
              <Link href={`/podcasts/${podcastSlug}`}>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider hover:underline" data-testid="link-podcast-name">
                  <Headphones className="w-3.5 h-3.5" />
                  {episode.podcastName}
                </span>
              </Link>
              <h1 className="text-[22px] sm:text-[28px] font-display font-extrabold text-foreground leading-[1.25] mt-2" data-testid="text-episode-title">
                {episode.episodeTitle}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5" data-testid="text-episode-date">
                  <Calendar className="w-3.5 h-3.5" />
                  {formattedDate}
                </span>
                {episode.duration && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-black/[0.15]" />
                    <span className="flex items-center gap-1.5" data-testid="text-episode-duration">
                      <Clock className="w-3.5 h-3.5" />
                      {episode.duration}
                    </span>
                  </>
                )}
                {episode.hosts && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-black/[0.15]" />
                    <span>{episode.hosts}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 mt-4" data-testid="listen-buttons">
                <a
                  href={appleLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-black/[0.04] dark:bg-white/[0.06] text-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors"
                  data-testid="link-apple-podcasts"
                >
                  {APPLE_PODCASTS_SVG}
                  Listen on Apple Podcasts
                </a>
                <a
                  href={spotifyLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-black/[0.04] dark:bg-white/[0.06] text-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors"
                  data-testid="link-spotify"
                >
                  {SPOTIFY_SVG}
                  Listen on Spotify
                </a>
              </div>
            </div>
          </div>

          <div className="flex items-center border-b border-black/[0.06] mb-10" data-testid="nav-recap-transcript-tabs">
            {activeTab === "recap" ? (
              <span
                className="flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 border-primary text-primary -mb-px"
                data-testid="tab-recap-active"
              >
                <FileText className="w-4 h-4" />
                Episode Recap
              </span>
            ) : (
              <Link href={recapUrl}>
                <span
                  className="flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-black/[0.08] -mb-px transition-colors cursor-pointer"
                  data-testid="tab-recap-link"
                >
                  <FileText className="w-4 h-4" />
                  Episode Recap
                </span>
              </Link>
            )}

            {activeTab === "transcript" ? (
              <span
                className="flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 border-primary text-primary -mb-px"
                data-testid="tab-transcript-active"
              >
                <FileText className="w-4 h-4" />
                Full Transcript
              </span>
            ) : (
              <Link href={transcriptUrl}>
                <span
                  className="flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-black/[0.08] -mb-px transition-colors cursor-pointer"
                  data-testid="tab-transcript-link"
                >
                  <FileText className="w-4 h-4" />
                  Full Transcript
                </span>
              </Link>
            )}

            <div className="ml-auto relative -mb-px hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search episode..."
                autoComplete="off"
                data-testid="input-tab-search"
                value={tabSearchValue}
                onChange={tabSearchOnChange ? (e) => tabSearchOnChange(e.target.value) : undefined}
                className="w-[200px] h-9 pl-[34px] pr-3 border border-black/[0.08] rounded-lg bg-white text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-[3px] focus:ring-primary/10 focus:w-[260px] transition-all"
                onKeyDown={tabSearchOnKeyDown}
              />
            </div>
          </div>
        </motion.div>

        {children}

        <motion.div
          ref={ctaSectionRef}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="relative overflow-hidden bg-gradient-to-br from-primary/[0.06] via-primary/[0.03] to-transparent border border-primary/[0.1] rounded-2xl p-7 sm:p-9 mb-16"
          data-testid="section-episode-cta"
        >
          <div className="absolute -bottom-8 -right-8 opacity-[0.04]">
            <Headphones className="w-40 h-40 text-primary" />
          </div>
          <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 md:gap-10 items-center">
            <div className="flex flex-col gap-4 text-center md:text-left">
              <h2 className="text-xl sm:text-2xl font-display font-extrabold text-foreground leading-snug">
                Get {episode.podcastName} recaps<br className="hidden sm:block" /> in your inbox
              </h2>
              <p className="text-[15px] text-muted-foreground leading-relaxed max-w-md">
                Never miss an episode. PodCap sends you a concise recap of every new {episode.podcastName} episode — free, no app needed.
              </p>
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 mt-1" data-testid="form-signup-episode">
                <input
                  data-testid="input-email-episode"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 h-12 px-4 bg-white dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.1] rounded-xl text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium placeholder:text-muted-foreground/40 shadow-sm shadow-black/[0.03]"
                />
                <button
                  data-testid="button-signup-episode"
                  type="submit"
                  className="h-12 px-6 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-base bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25 hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-all active:scale-[0.98] whitespace-nowrap"
                >
                  Get Free Recaps
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
            <div className="hidden md:flex justify-center">
              <img
                src={episode.artworkUrl}
                alt={episode.podcastName}
                className="w-32 h-32 lg:w-36 lg:h-36 rounded-2xl object-cover shadow-xl shadow-black/[0.08] ring-1 ring-black/[0.04]"
                data-testid="img-cta-artwork"
              />
            </div>
          </div>
        </motion.div>

        {previousEpisodes.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            data-testid="section-more-episodes"
          >
            <h2 className="text-lg font-display font-bold text-foreground mb-5">
              More from {episode.podcastName}
            </h2>
            <div className="space-y-5">
              {previousEpisodes.map((ep: any) => (
                <EpisodeCard
                  key={ep.episodeSlug}
                  episodeSlug={ep.episodeSlug}
                  podcastSlug={podcastSlug}
                  publishDate={ep.publishDate}
                  episodeTitle={ep.episodeTitle}
                  tldl={ep.tldl}
                  duration={ep.duration}
                  testIdPrefix="card-more-episode"
                />
              ))}
            </div>
            <div className="flex justify-center mt-6">
              <Link href={`/podcasts/${podcastSlug}`}>
                <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-display font-bold text-sm bg-primary/[0.06] text-primary hover:bg-primary/[0.1] transition-colors" data-testid="link-all-episodes">
                  View all {episode.podcastName} episodes
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            </div>
          </motion.section>
        )}

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
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center gap-3">
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-8 h-8 rounded-lg bg-primary/[0.08] flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground whitespace-nowrap">
                  Never miss a <span className="text-primary">{episode.podcastName}</span> recap
                </p>
              </div>
              <form onSubmit={handleStickySubmit} className="flex flex-1 gap-2 w-full sm:w-auto" data-testid="form-sticky-signup">
                <input
                  data-testid="input-email-sticky"
                  type="email"
                  value={stickyEmail}
                  onChange={(e) => setStickyEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 h-9 px-3 bg-black/[0.03] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all placeholder:text-muted-foreground/40"
                />
                <button
                  data-testid="button-sticky-signup"
                  type="submit"
                  className="h-9 px-4 rounded-lg font-bold text-sm bg-primary text-primary-foreground shadow-sm hover:brightness-105 transition-all active:scale-[0.98] whitespace-nowrap"
                >
                  Subscribe free
                </button>
              </form>
              <button
                onClick={() => setStickyDismissed(true)}
                className="absolute top-2 right-2 sm:relative sm:top-auto sm:right-auto p-1.5 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-black/[0.04] transition-colors shrink-0"
                data-testid="button-dismiss-sticky"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
