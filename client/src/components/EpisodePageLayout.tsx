import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Clock, Headphones, FileText, ArrowRight, Mail, X, Search, Users, BookOpen } from "lucide-react";
import { SiApplepodcasts, SiSpotify, SiYoutube } from "react-icons/si";
import { useRegister } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PodCapHeader } from "@/components/PodCapHeader";
import { GetRecapsModal } from "@/components/GetRecapsModal";
import { Footer } from "@/components/Footer";
import { EpisodeCard } from "@/components/EpisodeCard";
import type { PodcastLandingConfig } from "@/data/podcastLandingData";

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
  activeTab: "recap" | "transcript" | "guests" | "resources";
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
  const [showRecapsModal, setShowRecapsModal] = useState(false);
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
  const episodeSearchQuery = encodeURIComponent(episode.episodeTitle + ' ' + episode.podcastName);
  const spotifyLink = `https://open.spotify.com/search/${episodeSearchQuery}`;
  const youtubeSearchLink = `https://www.youtube.com/results?search_query=${episodeSearchQuery}`;
  const effectiveYoutubeUrl = podcastConfig.youtubeUrl ? youtubeSearchLink : undefined;

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
  const guestsUrl = `/podcasts/${podcastSlug}/${episodeSlug}/guests`;
  const resourcesUrl = `/podcasts/${podcastSlug}/${episodeSlug}/resources`;

  return (
    <div className="min-h-screen bg-background">
      <PodCapHeader
        rightContent={
          <button
            onClick={() => setShowRecapsModal(true)}
            className="h-7 px-3 rounded-md font-display font-bold text-xs bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:brightness-105 transition-all active:scale-[0.98]"
            data-testid="button-get-recaps"
          >
            Get Recaps
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
            <Link href={`/podcasts/${podcastSlug}`}>
              <div className="relative shrink-0 cursor-pointer">
                <div className="absolute -inset-4 bg-primary/[0.06] rounded-[2rem] blur-2xl" />
                <img
                  src={episode.artworkUrl}
                  alt={episode.podcastName}
                  className="relative w-48 h-48 sm:w-52 sm:h-52 rounded-2xl shadow-2xl shadow-black/[0.12] object-cover ring-1 ring-black/[0.04] hover:shadow-[0_20px_60px_-12px_rgba(0,0,0,0.2)] transition-shadow"
                  data-testid="img-episode-artwork"
                />
              </div>
            </Link>

            <div className="flex flex-col gap-3 text-center sm:text-left flex-1 min-w-0">
              <h1
                className="text-[1.75rem] sm:text-[2rem] lg:text-[2.25rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.025em]"
                data-testid="text-episode-title"
              >
                {episode.episodeTitle}
              </h1>

              <Link href={`/podcasts/${podcastSlug}`}>
                <p className="text-[15px] sm:text-base text-muted-foreground leading-relaxed max-w-md hover:text-foreground transition-colors cursor-pointer" data-testid="link-podcast-name">
                  {episode.podcastName}
                </p>
              </Link>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-1">
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="text-episode-date">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground/50" />
                  {formattedDate}
                </span>
                {episode.duration && (
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="text-episode-duration">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground/50" />
                    {episode.duration}
                  </span>
                )}
                {episode.hosts && (
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="text-hosts">
                    <Users className="w-3.5 h-3.5 text-muted-foreground/50" />
                    <span className="font-medium text-foreground/80">{episode.hosts}</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5 mt-2 justify-center sm:justify-start" data-testid="listen-buttons">
                <a
                  href={appleLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black/[0.04] hover:bg-black/[0.07] rounded-lg text-xs font-semibold text-foreground/80 hover:text-foreground transition-colors"
                  data-testid="link-apple-podcasts"
                  title="Listen on Apple Podcasts"
                >
                  <SiApplepodcasts className="w-4 h-4 text-[#9933CC]" />
                  Apple Podcasts
                </a>
                <a
                  href={spotifyLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black/[0.04] hover:bg-black/[0.07] rounded-lg text-xs font-semibold text-foreground/80 hover:text-foreground transition-colors"
                  data-testid="link-spotify"
                  title="Listen on Spotify"
                >
                  <SiSpotify className="w-4 h-4 text-[#1DB954]" />
                  Spotify
                </a>
                {effectiveYoutubeUrl && (
                  <a
                    href={effectiveYoutubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black/[0.04] hover:bg-black/[0.07] rounded-lg text-xs font-semibold text-foreground/80 hover:text-foreground transition-colors"
                    data-testid="link-youtube"
                    title="Watch on YouTube"
                  >
                    <SiYoutube className="w-4 h-4 text-[#FF0000]" />
                    YouTube
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
          className="w-full max-w-4xl"
        >
          <div className="flex items-center border-b border-black/[0.06] mb-8" data-testid="nav-recap-transcript-tabs">
            {activeTab === "recap" ? (
              <span
                className="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 border-primary text-primary -mb-px"
                data-testid="tab-recap-active"
              >
                <FileText className="w-4 h-4" />
                Episode Recap
              </span>
            ) : (
              <Link href={recapUrl}>
                <span
                  className="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-black/[0.08] -mb-px transition-colors cursor-pointer"
                  data-testid="tab-recap-link"
                >
                  <FileText className="w-4 h-4" />
                  Episode Recap
                </span>
              </Link>
            )}

            {activeTab === "transcript" ? (
              <span
                className="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 border-primary text-primary -mb-px"
                data-testid="tab-transcript-active"
              >
                <FileText className="w-4 h-4" />
                Full Transcript
              </span>
            ) : (
              <Link href={transcriptUrl}>
                <span
                  className="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-black/[0.08] -mb-px transition-colors cursor-pointer"
                  data-testid="tab-transcript-link"
                >
                  <FileText className="w-4 h-4" />
                  Full Transcript
                </span>
              </Link>
            )}

            {activeTab === "guests" ? (
              <span
                className="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 border-primary text-primary -mb-px"
                data-testid="tab-guests-active"
              >
                <Users className="w-4 h-4" />
                Guests
              </span>
            ) : (
              <Link href={guestsUrl}>
                <span
                  className="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-black/[0.08] -mb-px transition-colors cursor-pointer"
                  data-testid="tab-guests-link"
                >
                  <Users className="w-4 h-4" />
                  Guests
                </span>
              </Link>
            )}

            {activeTab === "resources" ? (
              <span
                className="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 border-primary text-primary -mb-px"
                data-testid="tab-resources-active"
              >
                <BookOpen className="w-4 h-4" />
                Resources
              </span>
            ) : (
              <Link href={resourcesUrl}>
                <span
                  className="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-black/[0.08] -mb-px transition-colors cursor-pointer"
                  data-testid="tab-resources-link"
                >
                  <BookOpen className="w-4 h-4" />
                  Resources
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
                className="w-[200px] h-9 pl-[34px] pr-3 border border-black/[0.08] rounded-lg bg-white text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-[3px] focus:ring-primary/10 focus:w-[260px] transition-all"
                onKeyDown={tabSearchOnKeyDown}
              />
            </div>
          </div>

          {children}
        </motion.div>

        <motion.div
          ref={ctaSectionRef}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="w-full max-w-4xl pb-16"
        >
          <div className="bg-primary/[0.03] border border-primary/[0.08] rounded-2xl p-6 sm:p-8" data-testid="section-episode-cta">
            <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
              <div className="flex-1 text-center sm:text-left">
                <h2 className="text-lg sm:text-xl font-display font-extrabold text-foreground leading-snug mb-2">
                  Get {episode.podcastName} recaps in your inbox
                </h2>
                <p className="text-sm text-muted-foreground">
                  We'll send a recap whenever a new episode drops.
                </p>
              </div>
              <form onSubmit={handleSubmit} className="flex gap-2.5 w-full sm:w-auto" data-testid="form-signup-episode">
                <input
                  data-testid="input-email-episode"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 sm:w-56 h-11 px-4 bg-white border border-black/[0.08] rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/25 transition-all font-medium placeholder:text-muted-foreground/40 shadow-sm shadow-black/[0.03]"
                />
                <button
                  data-testid="button-signup-episode"
                  type="submit"
                  className="h-11 px-5 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-sm bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:brightness-105 disabled:opacity-40 transition-all active:scale-[0.98] whitespace-nowrap"
                >
                  Get Started
                </button>
              </form>
            </div>
          </div>
        </motion.div>

        {previousEpisodes.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="w-full max-w-4xl pb-16"
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

      <GetRecapsModal
        open={showRecapsModal}
        onClose={() => setShowRecapsModal(false)}
        podcastName={episode.podcastName}
        artworkUrl={episode.artworkUrl}
        itunesId={podcastConfig.itunesId}
      />
    </div>
  );
}
