import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Loader2, ArrowRight, Clock, Mail, ChevronDown, ExternalLink, Calendar, Mic, Users, Star } from "lucide-react";
import { motion } from "framer-motion";
import { useRegister, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import { ExampleRecapSection } from "@/components/ExampleRecapSection";
import { getPodcastBySlug } from "@/data/podcastLandingData";
import type { PodcastLandingConfig } from "@/data/podcastLandingData";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

function generatePodcapFaqItems(name: string) {
  return [
    {
      q: "What is PodCap?",
      a: "PodCap is an independent service that generates concise daily summaries of podcast episodes. We analyze real transcripts and deliver the key insights, quotes, and takeaways straight to your inbox — so you can stay informed even when you don't have time to listen.",
    },
    {
      q: "How does PodCap work?",
      a: "Every day, PodCap checks for new episodes from the podcasts you follow, pulls real transcripts when available, and generates a detailed digest. You'll get the biggest takeaways, specific insights, memorable quotes, and conversation starters — all formatted for a quick read over your morning coffee.",
    },
    {
      q: "How much does PodCap cost?",
      a: `PodCap is free for up to 3 podcasts. If you want unlimited podcast summaries, you can upgrade to PodCap Pro for $9.99/month. The ${name} summary is included in the free plan.`,
    },
    {
      q: "Can I get summaries of other podcasts too?",
      a: "Yes! Once you create your free PodCap account, you can add up to 3 podcasts to your daily digest. Choose from thousands of popular podcasts. Upgrade to PodCap Pro for unlimited podcasts.",
    },
    {
      q: "When will I receive my daily summary?",
      a: "You choose your preferred delivery time during setup. Most listeners pick early morning so the recap is waiting in their inbox when they wake up. You can customize your timezone and delivery schedule from your dashboard.",
    },
  ];
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

    setMeta("name", "description", `Get free daily ${name} podcast summaries and episode recaps. ${name} podcast recap of every new episode by ${hosts} — ${description} delivered to your inbox.`);
    setMeta("name", "keywords", `${name} podcast summary, ${name} episode summary, ${name} podcast recap, ${name} recap, ${keywords}, podcast summary, daily podcast recap`);
    setMeta("property", "og:title", `${name} Podcast Summary, Latest Episode Recap | PodCap`);
    setMeta("property", "og:description", `Daily ${name} podcast summaries and episode recaps. ${description.charAt(0).toUpperCase() + description.slice(1)} — delivered free to your inbox.`);
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
    setMeta("name", "twitter:description", `Free daily ${name} podcast summaries and episode recaps delivered to your inbox.`);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) { canonical = document.createElement("link"); canonical.setAttribute("rel", "canonical"); document.head.appendChild(canonical); }
    canonical.setAttribute("href", url);

    let jsonLd = document.querySelector('script[data-seo="podcast-landing"]');
    if (!jsonLd) { jsonLd = document.createElement("script"); jsonLd.setAttribute("type", "application/ld+json"); jsonLd.setAttribute("data-seo", "podcast-landing"); document.head.appendChild(jsonLd); }
    jsonLd.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": `${name} Podcast Summary, Latest Episode Recap`,
      "description": `Free daily ${name} podcast summary and episode recap. ${description.charAt(0).toUpperCase() + description.slice(1)} delivered to your inbox.`,
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
  const podcapFaqItems = generatePodcapFaqItems(name);
  const appleUrl = `https://podcasts.apple.com/podcast/id${itunesId}`;
  const effectiveSpotifyUrl = spotifyUrl || `https://open.spotify.com/search/${encodeURIComponent(name)}`;

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

        <section className="w-full max-w-5xl pt-10 sm:pt-16 pb-14 sm:pb-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center"
          >
            <div className="flex flex-col gap-6 order-2 md:order-1">
              <h1
                className="text-[2rem] sm:text-[2.5rem] lg:text-[3rem] font-display font-extrabold text-foreground leading-[1.08] tracking-[-0.025em]"
                data-testid="heading-main"
              >
                {name} Podcast Summaries
              </h1>

              <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed">
                Get a short summary of every new {name} episode, delivered to your inbox.
              </p>

              <p className="text-base text-muted-foreground/80 leading-relaxed">
                Each recap explains who the guest was, what they talked about, and the key ideas from the episode — all in a quick 2 to 3 minute read.
              </p>

              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 mt-1" data-testid="form-signup">
                <div className="flex-1 relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground/40" />
                  <input
                    data-testid="input-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full h-[3.25rem] pl-12 pr-4 bg-white border border-black/[0.08] rounded-xl text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/25 transition-all font-medium placeholder:text-muted-foreground/40 shadow-sm shadow-black/[0.03]"
                  />
                </div>
                <button
                  data-testid="button-signup"
                  type="submit"
                  disabled={isPending}
                  className="h-[3.25rem] px-7 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-base bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25 hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-all active:scale-[0.98] whitespace-nowrap"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      Get Free Summaries
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <p className="text-sm text-muted-foreground/60 italic">
                Free forever for up to 3 podcasts. No credit card required.
              </p>
            </div>

            {artworkUrl && (
              <div className="flex justify-center order-1 md:order-2">
                <div className="relative">
                  <div className="absolute -inset-6 bg-primary/[0.04] rounded-[2.5rem] blur-3xl" />
                  <img
                    src={artworkUrl}
                    alt={`${name} Podcast Cover Art`}
                    className="relative w-64 h-64 sm:w-72 sm:h-72 md:w-80 md:h-80 lg:w-[22rem] lg:h-[22rem] rounded-2xl shadow-2xl shadow-black/[0.10] object-cover"
                    data-testid="img-podcast-artwork"
                  />
                </div>
              </div>
            )}
          </motion.div>
        </section>


        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="w-full max-w-4xl pb-6"
        >
          <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground text-center mb-3" data-testid="heading-example-intro">
            Podcast Recap Example
          </h2>
          <p className="text-base text-muted-foreground text-center mb-8 max-w-xl mx-auto leading-relaxed">
            Here's exactly what lands in your inbox — a real recap from a recent {name} episode.
          </p>
        </motion.section>

        <ExampleRecapSection slug={slug || ""} podcastName={name} hideHeading />


        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="w-full max-w-3xl pb-20"
        >
          <div className="bg-primary/[0.03] border border-primary/[0.08] rounded-2xl p-8 sm:p-12 text-center flex flex-col items-center gap-5" data-testid="section-mid-cta">
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-foreground leading-snug">
              Receive free podcast summaries directly to your email when a new episode drops
            </h2>
            <p className="text-base text-muted-foreground max-w-md leading-relaxed">
              No app needed. No ads. Just the key takeaways from {name} — in your inbox every morning.
            </p>
            <form onSubmit={handleSubmit} className="w-full max-w-md flex flex-col sm:flex-row gap-3 mt-1" data-testid="form-signup-mid">
              <input
                data-testid="input-email-mid"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 h-12 px-4 bg-white border border-black/[0.08] rounded-xl text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/25 transition-all font-medium placeholder:text-muted-foreground/40 shadow-sm shadow-black/[0.03]"
              />
              <button
                data-testid="button-signup-mid"
                type="submit"
                disabled={isPending}
                className="h-12 px-6 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-base bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25 hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-all active:scale-[0.98] whitespace-nowrap"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Get Started Free"}
              </button>
            </form>
          </div>
        </motion.section>


        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full max-w-4xl pb-20"
          data-testid="section-about-podcast"
        >
          <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground text-center mb-10">
            About the {name} Podcast
          </h2>

          {snapshotItems.length > 0 && (
            <div className="mb-10" data-testid="section-snapshot">
              <h3 className="text-base font-display font-bold text-foreground mb-4">Podcast Snapshot</h3>
              <div className={`grid gap-4 grid-cols-2 ${snapshotItems.length <= 2 ? "sm:grid-cols-2" : snapshotItems.length === 3 ? "sm:grid-cols-3" : snapshotItems.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3 lg:grid-cols-5"}`}>
                {snapshotItems.map((item, i) => (
                  <div key={i} className="bg-white border border-black/[0.06] rounded-xl px-5 py-5 text-center" data-testid={`snapshot-${item.label.toLowerCase().replace(/\s/g, "-")}`}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{item.label}</p>
                    <p className="text-base font-bold text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {knownFor && knownFor.length > 0 && (
            <div className="mb-10" data-testid="section-known-for">
              <h3 className="text-base font-display font-bold text-foreground mb-4">What {name} Is Known For</h3>
              <div className="bg-white border border-black/[0.06] rounded-2xl p-7">
                <ul className="space-y-4">
                  {knownFor.map((item, i) => (
                    <li key={i} className="flex items-start gap-3.5" data-testid={`known-for-${i}`}>
                      <span className="shrink-0 mt-2.5 w-2 h-2 rounded-full bg-primary" />
                      <span className="text-[15px] text-foreground/80 leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {hostBios && hostBios.length > 0 && (
            <div className="mb-10" data-testid="section-host-bios">
              <h3 className="text-base font-display font-bold text-foreground mb-4">
                {hostBios.length === 1 ? "About the Host" : "About the Hosts"}
              </h3>
              <div className={`grid gap-5 ${hostBios.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
                {hostBios.map((host, i) => (
                  <div key={i} className="bg-white border border-black/[0.06] rounded-2xl p-6" data-testid={`host-bio-${i}`}>
                    <div className="flex items-center gap-3.5 mb-4">
                      <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Users className="w-5 h-5 text-primary" />
                      </div>
                      <h4 className="text-base font-display font-bold text-foreground">{host.name}</h4>
                    </div>
                    <p className="text-[15px] text-muted-foreground leading-relaxed">{host.bio}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-10" data-testid="section-listen">
            <h3 className="text-base font-display font-bold text-foreground mb-4">How to Listen</h3>
            <div className="bg-white border border-black/[0.06] rounded-2xl p-6">
              <p className="text-[15px] text-muted-foreground mb-5">
                Listen to {name} on your favorite podcast platform:
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href={appleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 px-5 py-3 bg-black/[0.03] hover:bg-black/[0.06] border border-black/[0.06] rounded-xl text-[15px] font-medium text-foreground transition-colors"
                  data-testid="link-apple-podcasts"
                >
                  Apple Podcasts
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                </a>
                <a
                  href={effectiveSpotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 px-5 py-3 bg-black/[0.03] hover:bg-black/[0.06] border border-black/[0.06] rounded-xl text-[15px] font-medium text-foreground transition-colors"
                  data-testid="link-spotify"
                >
                  Spotify
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                </a>
                {youtubeUrl && (
                  <a
                    href={youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2.5 px-5 py-3 bg-black/[0.03] hover:bg-black/[0.06] border border-black/[0.06] rounded-xl text-[15px] font-medium text-foreground transition-colors"
                    data-testid="link-youtube"
                  >
                    YouTube
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {relatedPodcasts.length > 0 && (
            <div data-testid="section-related-podcasts">
              <h3 className="text-base font-display font-bold text-foreground mb-4">
                People who follow {name} also get recaps of
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {relatedPodcasts.map((rp) => (
                  <a
                    key={rp.slug}
                    href={`/podcasts/${rp.slug}`}
                    className="bg-white border border-black/[0.06] rounded-2xl p-5 flex flex-col items-center gap-4 hover:border-black/[0.12] hover:shadow-md hover:shadow-black/[0.04] transition-all group"
                    data-testid={`related-podcast-${rp.slug}`}
                  >
                    {rp.artworkUrl && (
                      <img src={rp.artworkUrl} alt={rp.name} className="w-20 h-20 rounded-xl object-cover shadow-md shadow-black/[0.06]" />
                    )}
                    <div className="text-center min-w-0 w-full">
                      <p className="text-base font-bold text-foreground truncate group-hover:text-primary transition-colors">{rp.name}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{rp.category}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </motion.section>


        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="w-full max-w-4xl pb-20"
          data-testid="section-about-podcap"
        >
          <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground text-center mb-10">
            About PodCap
          </h2>

          <div className="bg-white border border-black/[0.06] rounded-2xl p-7 sm:p-9 mb-8">
            <div className="flex items-center gap-3 mb-5">
              <img src={logoPath} alt="PodCap" className="h-8 object-contain" />
            </div>
            <p className="text-[15px] text-foreground/80 leading-relaxed mb-5">
              PodCap is a podcast summary service that delivers concise daily recaps of your favorite podcasts straight to your inbox. We analyze real episode transcripts and extract the key insights, quotes, and takeaways — so you can stay informed in minutes instead of hours.
            </p>
            <p className="text-[15px] text-foreground/80 leading-relaxed mb-5">
              <span className="font-semibold">Our mission:</span> make the world's best podcast content accessible to everyone, even when life gets busy. Whether you're catching up on one show or following a dozen, PodCap keeps you in the loop.
            </p>
            <p className="text-sm text-muted-foreground/70 leading-relaxed italic">
              PodCap is not affiliated with, endorsed by, or sponsored by {name}, {hosts}, or any podcast listed on this site. We are an independent service that provides summaries as a convenience for listeners.
            </p>
          </div>

          <div className="space-y-3" data-testid="section-podcap-faq">
            {podcapFaqItems.map((item, i) => (
              <div
                key={i}
                className="bg-white border border-black/[0.06] rounded-xl overflow-hidden"
                data-testid={`faq-item-${i}`}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left gap-4"
                  data-testid={`faq-toggle-${i}`}
                >
                  <span className="text-[15px] font-semibold text-foreground">{item.q}</span>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-200 ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 -mt-1">
                    <p className="text-[15px] text-muted-foreground leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="text-center mt-8">
            <a
              href="/"
              className="inline-flex items-center gap-2 text-base font-semibold text-primary hover:text-primary/80 transition-colors"
              data-testid="link-podcap-home"
            >
              Visit podcap.io
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </motion.section>

      </main>

      <Footer />
    </div>
  );
}
