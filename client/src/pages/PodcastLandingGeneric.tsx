import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Loader2, ArrowRight, Headphones, Zap, Clock, Mail, ChevronDown, ExternalLink, Calendar, Mic, Users, Star } from "lucide-react";
import { motion } from "framer-motion";
import { useRegister, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import { ExampleRecapSection } from "@/components/ExampleRecapSection";
import { getPodcastBySlug, PODCAST_LANDINGS } from "@/data/podcastLandingData";
import type { PodcastLandingConfig } from "@/data/podcastLandingData";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

function generateFaqItems(name: string, hosts: string, faqTopics: string, category: string) {
  return [
    {
      q: `What is PodCap's ${name} daily summary?`,
      a: `PodCap delivers a concise AI-powered recap of the latest ${name} podcast episodes straight to your inbox every morning. Each summary covers the key insights on ${faqTopics} — so you stay informed even when you don't have time to listen.`,
    },
    {
      q: `How does the ${name} podcast summary work?`,
      a: `Every day, PodCap checks for new ${name} episodes, pulls real transcripts when available, and uses AI to generate a detailed digest. You'll get the biggest takeaways, specific insights, memorable quotes, and conversation starters — all formatted for a quick read over your morning coffee.`,
    },
    {
      q: `Is this an official ${name} product?`,
      a: `No. PodCap is an independent podcast summary service and is not affiliated with, endorsed by, or sponsored by ${name} or ${hosts}. We're fans who built a tool to help other listeners keep up with the show.`,
    },
    {
      q: "Can I get summaries of other podcasts too?",
      a: "Yes! Once you create your free PodCap account, you can add up to 3 podcasts to your daily digest. Choose from thousands of popular podcasts. Upgrade to PodCap Pro for unlimited podcasts.",
    },
    {
      q: `When will I receive my daily ${name} summary?`,
      a: "You choose your preferred delivery time during setup. Most listeners pick early morning so the recap is waiting in their inbox when they wake up. You can also customize your timezone and delivery schedule from your dashboard.",
    },
    {
      q: "How much does PodCap cost?",
      a: `PodCap is free for up to 3 podcasts. If you want unlimited podcast summaries, you can upgrade to PodCap Pro for $9.99/month. The ${name} summary is included in the free plan.`,
    },
  ];
}

function estimateTimeSaved(avgLength?: number, totalEpisodes?: number): { hoursSaved: number; readTime: number } | null {
  if (!avgLength || !totalEpisodes) return null;
  const estimatedRecaps = Math.min(totalEpisodes, Math.floor(totalEpisodes * 0.3));
  const readTime = 3;
  const hoursSaved = Math.round((estimatedRecaps * (avgLength - readTime)) / 60);
  return hoursSaved > 10 ? { hoursSaved, readTime } : null;
}

export default function PodcastLandingGeneric() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const config = getPodcastBySlug(slug || "");

  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  const { toast } = useToast();
  const { mutate: register, isPending } = useRegister();
  const [email, setEmail] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    if (!config) return;

    const { name, slug: s, keywords, hosts, description, artworkUrl } = config;
    const url = `https://podcap.io/podcasts/${s}`;

    document.title = `${name} Podcast Summary, Latest Episode Recap | PodCap`;

    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };

    setMeta("name", "description", `Get free daily ${name} podcast summaries and episode recaps. AI-powered ${name} podcast recap of every new episode by ${hosts} — ${description} delivered to your inbox.`);
    setMeta("name", "keywords", `${name} podcast summary, ${name} episode summary, ${name} podcast recap, ${name} recap, ${keywords}, podcast summary, daily podcast recap`);
    setMeta("property", "og:title", `${name} Podcast Summary, Latest Episode Recap | PodCap`);
    setMeta("property", "og:description", `AI-powered daily ${name} podcast summaries and episode recaps. ${description.charAt(0).toUpperCase() + description.slice(1)} — delivered free to your inbox.`);
    setMeta("property", "og:url", url);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", "PodCap");
    if (artworkUrl) {
      setMeta("property", "og:image", artworkUrl);
      setMeta("name", "twitter:card", "summary_large_image");
      setMeta("name", "twitter:image", artworkUrl);
    } else {
      setMeta("name", "twitter:card", "summary");
    }
    setMeta("name", "twitter:title", `${name} Podcast Summary, Latest Episode Recap | PodCap`);
    setMeta("name", "twitter:description", `Free daily AI-powered ${name} podcast summaries and episode recaps delivered to your inbox.`);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) { canonical = document.createElement("link"); canonical.setAttribute("rel", "canonical"); document.head.appendChild(canonical); }
    canonical.setAttribute("href", url);

    let jsonLd = document.querySelector('script[data-seo="podcast-landing"]');
    if (!jsonLd) { jsonLd = document.createElement("script"); jsonLd.setAttribute("type", "application/ld+json"); jsonLd.setAttribute("data-seo", "podcast-landing"); document.head.appendChild(jsonLd); }
    jsonLd.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": `${name} Podcast Summary, Latest Episode Recap`,
      "description": `Free daily AI-powered ${name} podcast summary and episode recap. ${description.charAt(0).toUpperCase() + description.slice(1)} delivered to your inbox.`,
      "url": url,
      "publisher": { "@type": "Organization", "name": "PodCap", "url": "https://podcap.io" },
      "about": { "@type": "PodcastSeries", "name": name },
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD", "description": `Free daily ${name} podcast recap delivered by email` },
    });

    return () => {
      const ld = document.querySelector('script[data-seo="podcast-landing"]');
      if (ld) ld.remove();
    };
  }, [config]);

  if (!config) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
          <a href="/" className="flex items-center" data-testid="link-home">
            <img src={logoPath} alt="PodCap" className="h-9 object-contain" />
          </a>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Podcast not found</h1>
            <p className="text-muted-foreground mb-4">We couldn't find a landing page for this podcast.</p>
            <a href="/podcasts" className="text-primary hover:underline">Browse all podcasts</a>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (user) {
    navigate("/dashboard");
    return null;
  }

  const { name, hosts, category, faqTopics, description: desc, itunesId, artworkUrl, spotifyUrl, youtubeUrl, avgEpisodeLength, frequency, totalEpisodes, yearStarted, knownFor, hostBios, relatedSlugs } = config;
  const faqItems = generateFaqItems(name, hosts, faqTopics, category);
  const appleUrl = `https://podcasts.apple.com/podcast/id${itunesId}`;
  const effectiveSpotifyUrl = spotifyUrl || `https://open.spotify.com/search/${encodeURIComponent(name)}`;
  const hasExternalLinks = true;
  const timeSaved = estimateTimeSaved(avgEpisodeLength, totalEpisodes);

  const relatedPodcasts = (relatedSlugs || [])
    .map(s => getPodcastBySlug(s))
    .filter((p): p is PodcastLandingConfig => !!p)
    .slice(0, 3);

  const snapshotItems = [
    category ? { icon: Star, label: "Category", value: category } : null,
    avgEpisodeLength ? { icon: Clock, label: "Avg. Episode", value: `${avgEpisodeLength} min` } : null,
    frequency ? { icon: Calendar, label: "Frequency", value: frequency } : null,
    totalEpisodes ? { icon: Mic, label: "Episodes", value: `${totalEpisodes.toLocaleString()}+` } : null,
    yearStarted ? { icon: Calendar, label: "Since", value: `${yearStarted}` } : null,
  ].filter(Boolean) as { icon: typeof Star; label: string; value: string }[];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }

    register(
      {
        podcasts: [JSON.stringify({ id: itunesId, name, artworkUrl: artworkUrl || "" })],
        email,
      },
      {
        onSuccess: () => {
          navigate("/dashboard?welcome=true");
        },
        onError: (err) => {
          toast({
            title: "Something went wrong",
            description: err.message.includes("400")
              ? "An account with this email already exists. Try logging in."
              : err.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center" data-testid="link-home">
          <img src={logoPath} alt="PodCap" className="h-9 object-contain" />
        </a>
        <a
          href="/login"
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          data-testid="link-login"
        >
          Log in
        </a>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8">

        <section className="w-full max-w-3xl pt-10 sm:pt-16 pb-14 sm:pb-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center text-center gap-6"
          >
            {artworkUrl && (
              <div className="relative mb-2">
                <div className="absolute -inset-3 bg-primary/[0.06] rounded-[2rem] blur-2xl" />
                <img
                  src={artworkUrl}
                  alt={`${name} Podcast Cover Art`}
                  className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-2xl shadow-xl shadow-black/[0.08] object-cover"
                  data-testid="img-podcast-artwork"
                />
              </div>
            )}

            <div className="space-y-3">
              <h1
                className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.025em]"
                data-testid="heading-main"
              >
                {name}{" "}
                <span className="text-primary">podcast summary</span>,{" "}
                daily
              </h1>
              <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
                AI-powered {name} recaps from {hosts} — delivered free to your inbox every morning.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="w-full max-w-md flex flex-col sm:flex-row gap-3 mt-2" data-testid="form-signup">
              <div className="flex-1 relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                <input
                  data-testid="input-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full h-12 pl-11 pr-4 bg-white border border-black/[0.08] rounded-xl text-foreground text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/25 transition-all font-medium placeholder:text-muted-foreground/40 shadow-sm shadow-black/[0.03]"
                />
              </div>
              <button
                data-testid="button-signup"
                type="submit"
                disabled={isPending}
                className="h-12 px-6 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-[15px] bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25 hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-all active:scale-[0.98] whitespace-nowrap"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    Get Free Recaps
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <p className="text-[13px] text-muted-foreground/60 italic">
              Free forever for up to 3 podcasts. No credit card required.
            </p>

            {hasExternalLinks && (
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-2">
                {appleUrl && (
                  <a
                    href={appleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="link-apple-podcasts"
                  >
                    Apple Podcasts
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {effectiveSpotifyUrl && (
                  <a
                    href={effectiveSpotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="link-spotify"
                  >
                    Spotify
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {youtubeUrl && (
                  <a
                    href={youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="link-youtube"
                  >
                    YouTube
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </motion.div>
        </section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-3xl pb-16"
        >
          {timeSaved && avgEpisodeLength && (
            <div className="bg-primary/[0.04] border border-primary/[0.08] rounded-2xl px-6 py-5 text-center mb-6" data-testid="section-time-saved">
              <p className="text-sm sm:text-base font-display font-bold text-foreground">
                Save up to <span className="text-primary">{timeSaved.hoursSaved.toLocaleString()} hours</span> — read a {timeSaved.readTime}-min recap instead of a {avgEpisodeLength}-min episode.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-black/[0.06] rounded-2xl p-5 text-center" data-testid="feature-ai">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Zap className="w-4.5 h-4.5 text-primary" />
              </div>
              <h3 className="text-sm font-display font-bold text-foreground mb-1.5">AI-Powered Recaps</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Key ideas, quotes, and insights extracted from real {name} transcripts.
              </p>
            </div>
            <div className="bg-white border border-black/[0.06] rounded-2xl p-5 text-center" data-testid="feature-inbox">
              <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                <Mail className="w-4.5 h-4.5 text-green-600" />
              </div>
              <h3 className="text-sm font-display font-bold text-foreground mb-1.5">Delivered by Email</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                No app to open. Your recap is waiting in your inbox every morning.
              </p>
            </div>
            <div className="bg-white border border-black/[0.06] rounded-2xl p-5 text-center" data-testid="feature-time">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
                <Clock className="w-4.5 h-4.5 text-amber-600" />
              </div>
              <h3 className="text-sm font-display font-bold text-foreground mb-1.5">3-Minute Read</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Each {avgEpisodeLength ? `${avgEpisodeLength}-min` : "full"} episode condensed into a quick summary.
              </p>
            </div>
          </div>
        </motion.section>

        <ExampleRecapSection slug={slug || ""} podcastName={name} />

        {snapshotItems.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="w-full max-w-3xl pb-16"
            data-testid="section-snapshot"
          >
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-foreground text-center mb-6">
              About {name}
            </h2>
            <div className={`grid gap-3 grid-cols-2 ${snapshotItems.length <= 2 ? "sm:grid-cols-2" : snapshotItems.length === 3 ? "sm:grid-cols-3" : snapshotItems.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3 lg:grid-cols-5"}`}>
              {snapshotItems.map((item, i) => (
                <div key={i} className="bg-white border border-black/[0.06] rounded-xl px-4 py-4 text-center" data-testid={`snapshot-${item.label.toLowerCase().replace(/\s/g, "-")}`}>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">{item.label}</p>
                  <p className="text-sm font-bold text-foreground">{item.value}</p>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {knownFor && knownFor.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="w-full max-w-3xl pb-16"
            data-testid="section-known-for"
          >
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-foreground text-center mb-6">
              What {name} Is Known For
            </h2>
            <div className="bg-white border border-black/[0.06] rounded-2xl p-6">
              <ul className="space-y-3">
                {knownFor.map((item, i) => (
                  <li key={i} className="flex items-start gap-3" data-testid={`known-for-${i}`}>
                    <span className="shrink-0 mt-2 w-1.5 h-1.5 rounded-full bg-primary" />
                    <span className="text-sm text-foreground/80 leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.section>
        )}

        {hostBios && hostBios.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="w-full max-w-3xl pb-16"
            data-testid="section-host-bios"
          >
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-foreground text-center mb-6">
              About the {hostBios.length === 1 ? "Host" : "Hosts"}
            </h2>
            <div className={`grid gap-4 ${hostBios.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
              {hostBios.map((host, i) => (
                <div key={i} className="bg-white border border-black/[0.06] rounded-2xl p-5" data-testid={`host-bio-${i}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="text-sm font-display font-bold text-foreground">{host.name}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{host.bio}</p>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="w-full max-w-3xl pb-16"
        >
          <h2 className="text-xl sm:text-2xl font-display font-extrabold text-foreground text-center mb-6" data-testid="heading-faq">
            Frequently Asked Questions
          </h2>
          <div className="space-y-2">
            {faqItems.map((item, i) => (
              <div
                key={i}
                className="bg-white border border-black/[0.06] rounded-xl overflow-hidden"
                data-testid={`faq-item-${i}`}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left gap-3"
                  data-testid={`faq-toggle-${i}`}
                >
                  <span className="text-sm font-semibold text-foreground">{item.q}</span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 -mt-1">
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="w-full max-w-2xl pb-16"
        >
          <div className="glass-panel rounded-2xl p-8 sm:p-10 text-center flex flex-col items-center gap-4">
            {artworkUrl && (
              <img
                src={artworkUrl}
                alt={name}
                className="w-14 h-14 rounded-xl object-cover shadow-md shadow-black/[0.08]"
                data-testid="img-podcast-artwork-bottom"
              />
            )}
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-foreground">
              Start getting {name} recaps
            </h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Enter your email and get your first AI-powered recap tomorrow morning.
            </p>
            <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col sm:flex-row gap-3 mt-1" data-testid="form-signup-bottom">
              <input
                data-testid="input-email-bottom"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 h-11 px-4 bg-white border border-black/[0.08] rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/25 transition-all font-medium placeholder:text-muted-foreground/40 shadow-sm shadow-black/[0.03]"
              />
              <button
                data-testid="button-signup-bottom"
                type="submit"
                disabled={isPending}
                className="h-11 px-5 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-sm bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25 hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-all active:scale-[0.98] whitespace-nowrap"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Get Started Free"}
              </button>
            </form>
          </div>
        </motion.section>

        {relatedPodcasts.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="w-full max-w-3xl pb-16"
            data-testid="section-related-podcasts"
          >
            <h2 className="text-lg font-display font-bold text-foreground text-center mb-5">
              Listeners also follow
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {relatedPodcasts.map((rp) => (
                <a
                  key={rp.slug}
                  href={`/podcasts/${rp.slug}`}
                  className="bg-white border border-black/[0.06] rounded-xl px-4 py-3.5 flex items-center gap-3 hover:border-black/[0.12] transition-all group"
                  data-testid={`related-podcast-${rp.slug}`}
                >
                  {rp.artworkUrl && (
                    <img src={rp.artworkUrl} alt={rp.name} className="w-10 h-10 rounded-lg object-cover shadow-sm shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{rp.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{rp.category}</p>
                  </div>
                </a>
              ))}
            </div>
          </motion.section>
        )}
      </main>

      <Footer />
    </div>
  );
}
