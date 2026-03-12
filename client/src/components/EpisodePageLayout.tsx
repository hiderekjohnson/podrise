import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Calendar, Clock, ArrowRight, ListChecks, ExternalLink } from "lucide-react";
import { SiApplepodcasts, SiSpotify, SiYoutube } from "react-icons/si";
import { useRegister } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PodCapHeader } from "@/components/PodCapHeader";
import { GetRecapsModal } from "@/components/GetRecapsModal";
import { Footer } from "@/components/Footer";
import { EpisodeCard } from "@/components/EpisodeCard";
import type { PodcastLandingConfig } from "@/data/podcastLandingData";

interface EpisodeGuest {
  name: string;
  title?: string;
}

interface PodcastHost {
  name: string;
  photo_url?: string;
}

interface EpisodePageLayoutProps {
  episode: {
    podcastName: string;
    episodeTitle: string;
    publishDate: string;
    artworkUrl: string;
    duration?: string;
    hosts?: string;
    appleEpisodeUrl?: string;
    spotifyEpisodeUrl?: string;
  };
  podcastSlug: string;
  episodeSlug: string;
  podcastConfig: PodcastLandingConfig;
  activeTab?: "recap" | "guests";
  allRecaps?: any[];
  guests?: EpisodeGuest[];
  podcastHosts?: PodcastHost[];
  children: React.ReactNode;
}

export function EpisodePageLayout({
  episode,
  podcastSlug,
  episodeSlug,
  podcastConfig,
  allRecaps = [],
  guests = [],
  podcastHosts = [],
  children,
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
  const spotifyLink = episode.spotifyEpisodeUrl || `https://open.spotify.com/search/${episodeSearchQuery}`;
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

  return (
    <div className="min-h-screen bg-background">
      <PodCapHeader
        rightContent={
          <button
            onClick={() => setShowRecapsModal(true)}
            className="min-h-[44px] px-5 rounded-[10px] font-display font-bold text-[16px] bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:brightness-105 transition-all active:scale-[0.98]"
            data-testid="button-get-recaps"
          >
            Get {episode.podcastName} Recaps
          </button>
        }
      />

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8">
        <section className="w-full max-w-7xl pt-8 sm:pt-12 pb-8 sm:pb-10">
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

              <div className="flex items-center gap-2 justify-center sm:justify-start flex-wrap">
                <Link href={`/podcasts/${podcastSlug}`}>
                  <span className="text-[16px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-podcast-name">
                    {episode.podcastName}
                  </span>
                </Link>
                {podcastHosts.length > 0 && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="text-[16px] text-muted-foreground" data-testid="text-hosts">
                      {podcastHosts.map(h => h.name).join(" and ")}
                    </span>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-1">
                <span className="inline-flex items-center gap-1.5 text-base text-[#3F3F46] dark:text-[#A1A1AA]" data-testid="text-episode-date">
                  <Calendar className="w-3.5 h-3.5 text-[#52525B]" />
                  {formattedDate}
                </span>
                {episode.duration && (
                  <span className="inline-flex items-center gap-1.5 text-base text-[#3F3F46] dark:text-[#A1A1AA]" data-testid="text-episode-duration">
                    <Clock className="w-3.5 h-3.5 text-[#52525B]" />
                    {episode.duration}
                  </span>
                )}
              </div>

              {guests.length > 0 && (
                <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-1" data-testid="header-guests-block">
                  <span className="font-semibold text-foreground">{guests.length === 1 ? "Guest" : "Guests"}:</span>{" "}
                  {guests.map((g, i) => (
                    <span key={i} data-testid={`header-guest-${i}`}>
                      {i > 0 && ", "}
                      {g.name}{g.title ? `, ${g.title}` : ""}
                    </span>
                  ))}
                </p>
              )}

              <div className="flex items-center gap-2.5 mt-2 justify-center sm:justify-start" data-testid="listen-buttons">
                <a
                  href={appleLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-black/[0.04] min-h-[44px] hover:bg-black/[0.07] rounded-lg text-[16px] font-semibold text-[#3F3F46] hover:text-foreground transition-colors"
                  data-testid="link-apple-podcasts"
                  title="Listen on Apple Podcasts"
                >
                  <SiApplepodcasts className="w-4 h-4 text-[#9933CC]" />
                  Apple Podcasts
                  <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                </a>
                <a
                  href={spotifyLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-black/[0.04] min-h-[44px] hover:bg-black/[0.07] rounded-lg text-[16px] font-semibold text-[#3F3F46] hover:text-foreground transition-colors"
                  data-testid="link-spotify"
                  title="Listen on Spotify"
                >
                  <SiSpotify className="w-4 h-4 text-[#1DB954]" />
                  Spotify
                  <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                </a>
                {effectiveYoutubeUrl && (
                  <a
                    href={effectiveYoutubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-black/[0.04] min-h-[44px] hover:bg-black/[0.07] rounded-lg text-[16px] font-semibold text-[#3F3F46] hover:text-foreground transition-colors"
                    data-testid="link-youtube"
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
        </section>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="w-full max-w-7xl"
        >
          {children}
        </motion.div>

        <motion.div
          ref={ctaSectionRef}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="w-full max-w-7xl pb-16 mt-10"
        >
          <div className="bg-primary/[0.03] border border-primary/[0.08] rounded-2xl p-6 sm:p-8" data-testid="section-episode-cta">
            <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
              <div className="flex-1 text-center sm:text-left">
                <h2 className="text-lg sm:text-xl font-display font-extrabold text-foreground leading-snug mb-2">
                  Get {episode.podcastName} recaps in your inbox
                </h2>
                <p className="text-[16px] text-muted-foreground">
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
                  className="flex-1 sm:w-56 h-11 px-4 bg-white border border-black/[0.08] rounded-xl text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/25 transition-all font-medium placeholder:text-muted-foreground/40 shadow-sm shadow-black/[0.03]"
                />
                <button
                  data-testid="button-signup-episode"
                  type="submit"
                  className="h-11 px-5 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-base bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:brightness-105 disabled:opacity-40 transition-all active:scale-[0.98] whitespace-nowrap"
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
            className="w-full max-w-7xl pb-16 mt-2"
            data-testid="section-more-episodes"
          >
            <div className="flex items-center gap-2.5 mb-4">
              <ListChecks className="w-4 h-4 text-primary" />
              <span className="text-base font-bold text-primary uppercase tracking-wider">More {episode.podcastName} Episode Recaps</span>
            </div>
            <div className="space-y-3">
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
                <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-display font-bold text-base bg-primary/[0.06] text-primary hover:bg-primary/[0.1] transition-colors" data-testid="link-all-episodes">
                  View all {episode.podcastName} episodes
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            </div>
          </motion.section>
        )}
      </main>

      <Footer />

      {/* Sticky subscribe bar removed to avoid overlapping with AI chat panel */}

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
