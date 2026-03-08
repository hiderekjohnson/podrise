import { useParams, Link, useLocation } from "wouter";
import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Calendar, Clock, Lightbulb, Quote, ArrowRight, Headphones, FileText, Mail, X } from "lucide-react";
import { SiApplepodcasts, SiSpotify } from "react-icons/si";
import { useQuery } from "@tanstack/react-query";
import { getPodcastBySlug } from "../data/podcastLandingData";
import { useRegister } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

export default function EpisodeRecapPage() {
  const params = useParams<{ podcastSlug: string; episodeSlug: string }>();
  const podcastSlug = params.podcastSlug || "";
  const episodeSlug = params.episodeSlug || "";
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [stickyEmail, setStickyEmail] = useState("");
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [stickyDismissed, setStickyDismissed] = useState(false);
  const ctaSectionRef = useRef<HTMLDivElement>(null);
  const register = useRegister();

  const { data: episode, isLoading: episodeLoading } = useQuery<any>({
    queryKey: ["/api/podcasts", podcastSlug, "recaps", episodeSlug],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${podcastSlug}/recaps/${episodeSlug}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!podcastSlug && !!episodeSlug,
  });

  const { data: allRecaps = [] } = useQuery<any[]>({
    queryKey: ["/api/podcasts", podcastSlug, "recaps"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${podcastSlug}/recaps?limit=50`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!podcastSlug,
  });

  const podcastConfig = getPodcastBySlug(podcastSlug);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [podcastSlug, episodeSlug]);

  useEffect(() => {
    if (!episode) {
      document.title = "Episode Not Found | PodCap";
      return;
    }

    const pageTitle = `${episode.episodeTitle} — ${episode.podcastName} Recap | PodCap`;
    const pageDescription = episode.tldl.slice(0, 155) + (episode.tldl.length > 155 ? "..." : "");
    const canonicalUrl = `https://podcap.io/podcasts/${podcastSlug}/${episodeSlug}`;

    document.title = pageTitle;

    const setMeta = (selector: string, attr: string, value: string) => {
      let el = document.querySelector(selector);
      if (el) {
        el.setAttribute(attr, value);
      } else {
        const meta = document.createElement("meta");
        if (selector.includes("property=")) {
          meta.setAttribute("property", selector.match(/property="([^"]+)"/)?.[1] || "");
        } else if (selector.includes("name=")) {
          meta.setAttribute("name", selector.match(/name="([^"]+)"/)?.[1] || "");
        }
        meta.setAttribute(attr, value);
        document.head.appendChild(meta);
      }
    };

    setMeta('meta[name="description"]', "content", pageDescription);
    setMeta('meta[property="og:title"]', "content", pageTitle);
    setMeta('meta[property="og:description"]', "content", pageDescription);
    setMeta('meta[property="og:image"]', "content", episode.artworkUrl);
    setMeta('meta[property="og:url"]', "content", canonicalUrl);
    setMeta('meta[property="og:type"]', "content", "article");
    setMeta('meta[name="twitter:title"]', "content", pageTitle);
    setMeta('meta[name="twitter:description"]', "content", pageDescription);
    setMeta('meta[name="twitter:image"]', "content", episode.artworkUrl);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    return () => {
      document.title = "PodCap | Daily Podcast Recaps from Your Favorite Shows";
      if (canonical) canonical.remove();
    };
  }, [episode, podcastSlug, episodeSlug]);

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

  const handleStickySubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!stickyEmail.trim() || !/^\S+@\S+\.\S+$/.test(stickyEmail)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    if (!podcastConfig) return;
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    if (!podcastConfig) return;

    register(
      {
        podcasts: [JSON.stringify({ id: podcastConfig.itunesId, name: podcastConfig.name, artworkUrl: podcastConfig.artworkUrl || "" })],
        email: email.trim(),
      },
      {
        onSuccess: () => {
          navigate("/dashboard?welcome=true");
        },
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

  if (episodeLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!episode || !podcastConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-display font-bold text-foreground mb-3" data-testid="text-not-found">Episode not found</h1>
          <p className="text-muted-foreground mb-6">This episode recap doesn't exist yet.</p>
          <Link href={podcastConfig ? `/podcasts/${podcastSlug}` : "/podcasts"}>
            <span className="text-primary font-semibold hover:underline" data-testid="link-back">
              {podcastConfig ? `Back to ${podcastConfig.name}` : "Browse all podcasts"}
            </span>
          </Link>
        </div>
      </div>
    );
  }

  const publishDate = new Date(episode.publishDate + "T00:00:00");
  const formattedDate = publishDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const whatHappenedParagraphs = episode.whatHappened.split("\n\n").filter(Boolean);

  const currentIdx = allRecaps.findIndex((r: any) => r.episodeSlug === episodeSlug);
  const previousEpisodes = currentIdx >= 0 ? allRecaps.slice(currentIdx + 1, currentIdx + 6) : [];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-black/[0.04]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center">
          <Link href="/">
            <img src={logoPath} alt="PodCap" className="h-7" data-testid="link-home-logo" />
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-10 pb-24">

        <motion.article
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex items-start gap-5 sm:gap-6 mb-10">
            <img
              src={episode.artworkUrl}
              alt={episode.podcastName}
              className="w-[88px] h-[88px] sm:w-28 sm:h-28 rounded-2xl object-cover shadow-lg shadow-black/[0.08] shrink-0 ring-1 ring-black/[0.04]"
              data-testid="img-episode-artwork"
            />
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
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5" data-testid="text-episode-date">
                  <Calendar className="w-3.5 h-3.5" />
                  {formattedDate}
                </span>
                <span className="w-1 h-1 rounded-full bg-black/[0.15]" />
                <span className="flex items-center gap-1.5" data-testid="text-episode-duration">
                  <Clock className="w-3.5 h-3.5" />
                  {episode.duration}
                </span>
                <span className="w-1 h-1 rounded-full bg-black/[0.15]" />
                <span>{episode.hosts}</span>
              </div>
              <div className="flex items-center gap-2 mt-4" data-testid="listen-buttons">
                <a
                  href={episode.appleEpisodeUrl || `https://podcasts.apple.com/podcast/id${podcastConfig?.itunesId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-black/[0.04] dark:bg-white/[0.06] text-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors"
                  data-testid="link-apple-podcasts"
                >
                  <SiApplepodcasts className="w-3.5 h-3.5 text-[#9933CC]" />
                  Listen on Apple Podcasts
                </a>
                <a
                  href={`https://open.spotify.com/search/${encodeURIComponent(episode.episodeTitle + ' ' + episode.podcastName)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-black/[0.04] dark:bg-white/[0.06] text-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors"
                  data-testid="link-spotify"
                >
                  <SiSpotify className="w-3.5 h-3.5 text-[#1DB954]" />
                  Listen on Spotify
                </a>
              </div>
            </div>
          </div>

          <div className="flex items-center border-b border-black/[0.06] mb-10" data-testid="nav-recap-transcript-tabs">
            <span
              className="flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 border-primary text-primary -mb-px"
              data-testid="tab-recap-active"
            >
              <FileText className="w-4 h-4" />
              Episode Recap
            </span>
            <a
              href={`/podcasts/${podcastSlug}/${episodeSlug}/transcript`}
              className="flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-black/[0.08] -mb-px transition-colors"
              data-testid="tab-transcript-link"
            >
              <FileText className="w-4 h-4" />
              Full Transcript
            </a>
          </div>

          <div className="relative bg-gradient-to-br from-primary/[0.05] to-primary/[0.02] border border-primary/[0.1] rounded-2xl px-6 py-5 sm:px-7 sm:py-6 mb-12" data-testid="section-tldl">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/[0.1]">
                <Clock className="w-3.5 h-3.5 text-primary" />
              </span>
              <span className="text-xs font-bold text-primary uppercase tracking-wider">TLDL — Too Long, Didn't Listen</span>
            </div>
            <p className="text-[17px] leading-[1.85] text-foreground font-medium">{episode.tldl}</p>
          </div>

          {whatHappenedParagraphs.length > 0 && (
            <section className="mb-12" data-testid="section-what-happened">
              <h2 className="text-xl sm:text-[22px] font-display font-bold text-foreground mb-5 flex items-center gap-2.5">
                <span className="w-1 h-6 rounded-full bg-primary" />
                What Happened
              </h2>
              <div className="space-y-5">
                {whatHappenedParagraphs.map((paragraph, i) => (
                  <p key={i} className="text-[17px] leading-[1.85] text-muted-foreground">
                    {i === 0 && <span className="text-foreground font-semibold">{paragraph.split(" ").slice(0, 3).join(" ")} </span>}
                    {i === 0 ? paragraph.split(" ").slice(3).join(" ") : paragraph}
                  </p>
                ))}
              </div>
            </section>
          )}

          {episode.keyInsights.length > 0 && (
            <section className="mb-12" data-testid="section-key-insights">
              <h2 className="text-xl sm:text-[22px] font-display font-bold text-foreground mb-5 flex items-center gap-2.5">
                <span className="w-1 h-6 rounded-full bg-amber-400" />
                Key Insights
              </h2>
              <div className="grid gap-3">
                {episode.keyInsights.map((insight, i) => (
                  <div
                    key={i}
                    className="flex gap-4 items-start bg-white dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.08] rounded-xl px-5 py-4 shadow-sm shadow-black/[0.02]"
                    data-testid={`insight-${i}`}
                  >
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                      <Lightbulb className="w-4 h-4" />
                    </span>
                    <p className="text-[16px] leading-[1.7] text-muted-foreground">{insight}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {episode.quote && (
            <section className="mb-12" data-testid="section-quote">
              <div className="relative bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl px-6 py-6 sm:px-8 sm:py-7 overflow-hidden">
                <div className="absolute top-4 right-5 opacity-[0.04]">
                  <Quote className="w-24 h-24 text-foreground" />
                </div>
                <div className="relative">
                  <Quote className="w-5 h-5 text-primary/40 mb-3" />
                  <blockquote className="text-[18px] sm:text-[20px] leading-[1.7] text-foreground font-medium italic">
                    "{episode.quote}"
                  </blockquote>
                  {episode.quoteAttribution && (
                    <p className="mt-4 text-sm font-semibold text-muted-foreground">
                      — {episode.quoteAttribution}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}
          <p className="text-sm text-muted-foreground mb-12" data-testid="section-transcript-link">
            Prefer the source material?{" "}
            <a
              href={`/podcasts/${podcastSlug}/${episodeSlug}/transcript`}
              className="text-primary font-medium hover:underline"
              data-testid="link-full-transcript"
            >
              Read the full transcript
            </a>
          </p>
        </motion.article>

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
            <div className="space-y-2.5">
              {previousEpisodes
                .map((ep: any) => {
                  const d = new Date(ep.publishDate + "T00:00:00");
                  const fmt = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  return (
                    <Link key={ep.episodeSlug} href={`/podcasts/${podcastSlug}/${ep.episodeSlug}`}>
                      <div className="bg-white border border-black/[0.06] rounded-xl px-5 py-4 hover:shadow-md hover:shadow-black/[0.04] hover:border-primary/[0.15] transition-all cursor-pointer group" data-testid={`card-more-episode-${ep.episodeSlug}`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <Calendar className="w-3.5 h-3.5 text-muted-foreground/40" />
                          <span className="text-xs font-semibold text-muted-foreground/60">{fmt}</span>
                          {ep.duration && (
                            <>
                              <span className="w-0.5 h-0.5 rounded-full bg-black/[0.12]" />
                              <span className="text-xs text-muted-foreground/50">{ep.duration}</span>
                            </>
                          )}
                        </div>
                        <p className="text-[15px] font-bold text-foreground group-hover:text-primary transition-colors leading-snug">{ep.episodeTitle}</p>
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary/50 group-hover:text-primary transition-colors mt-2">
                          See full episode recap
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </Link>
                  );
                })}
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

        <footer className="mt-16 pt-8 border-t border-black/[0.06] text-center">
          <Link href="/">
            <img src={logoPath} alt="PodCap" className="h-6 mx-auto mb-3 opacity-40" />
          </Link>
          <p className="text-xs text-muted-foreground">
            PodCap is not affiliated with {episode.podcastName}. Recaps are generated from publicly available episode information.
          </p>
        </footer>
      </main>

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
