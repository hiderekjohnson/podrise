import { useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { ArrowRight, Headphones, Zap, CheckCircle2, Quote, Heart, Smile, MapPin } from "lucide-react";
import { SiLinkedin, SiSpotify } from "react-icons/si";
import { useQuery } from "@tanstack/react-query";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

interface FounderPodcast {
  id: string;
  name: string;
  artistName: string;
  artworkUrl: string;
}

function hiResArtwork(url: string) {
  return url.replace(/\/\d+x\d+bb\./, "/200x200bb.");
}

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: "easeOut" },
};

export default function About() {
  const { data: founderPodcasts, isLoading: podcastsLoading } = useQuery<FounderPodcast[]>({
    queryKey: ["/api/founder-podcasts"],
    select: (data: any) => data.podcasts,
  });

  useEffect(() => {
    document.title = "About PodCap — The Story Behind Your Daily Podcast Summaries";
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.content = content;
    };
    setMeta("name", "description", "PodCap was built by Derek Johnson after 15 years running Tatango.com. Even semi-retired, he couldn't keep up with his favorite podcasts. So he built an AI-powered daily podcast summary service.");
    setMeta("property", "og:title", "About PodCap — The Story Behind Your Daily Podcast Summaries");
    setMeta("property", "og:description", "PodCap was built by Derek Johnson because even semi-retirement wasn't enough to catch up on podcasts. Learn the founder story behind the daily podcast recap service.");
    setMeta("property", "og:type", "website");
    setMeta("property", "og:url", "https://podcap.io/about");
    setMeta("property", "og:image", "https://podcap.io/favicon.png");
    setMeta("name", "twitter:card", "summary");
    setMeta("name", "twitter:title", "About PodCap — The Story Behind Your Daily Podcast Summaries");
    setMeta("name", "twitter:description", "PodCap was built by Derek Johnson because even semi-retirement wasn't enough to catch up on podcasts. Learn the founder story behind the daily podcast recap service.");
    setMeta("name", "twitter:image", "https://podcap.io/favicon.png");

    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
    link.href = "https://podcap.io/about";

    return () => { if (link) link.remove(); };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center" data-testid="link-home">
          <img src={logoPath} alt="PodCap" className="h-9 object-contain" />
        </a>
        <div className="flex items-center gap-4">
          <Link href="/podcasts" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-podcasts">
            Most Popular
          </Link>
          <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-login">
            Log In
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full">
        <motion.section
          className="max-w-3xl mx-auto px-6 pt-12 pb-16 text-center"
          {...fadeUp}
          data-testid="section-hero"
        >
          <p className="text-sm font-semibold text-primary tracking-wide uppercase mb-4">About PodCap</p>
          <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight leading-[1.15] mb-6" data-testid="text-hero-title">
            Built for people who love podcasts,<br className="hidden md:block" /> but have lives.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-8">
            PodCap started with a simple problem: even after building and running a company for 15 years, and then finally having more time, Derek Johnson still could not keep up with his podcast queue.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-md shadow-primary/20 hover:bg-primary/90 transition-all"
              data-testid="link-get-summaries"
            >
              Get Free Summaries
              <ArrowRight className="w-4 h-4" />
            </a>
            <Link
              href="/updates"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-black/[0.08] dark:border-white/[0.1] text-sm font-bold text-foreground hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-all"
              data-testid="link-whats-new"
            >
              See What's New
            </Link>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          data-testid="section-founder-story"
        >
          <h2 className="text-2xl font-display font-bold mb-6">The origin story</h2>
          <div className="space-y-4 text-[17px] leading-[1.8] text-muted-foreground">
            <p>
              Derek Johnson founded <a href="https://www.tatango.com" target="_blank" rel="noopener noreferrer" className="text-foreground font-medium hover:text-primary transition-colors">Tatango.com</a> and spent 15 years building it into a leading SMS marketing platform that helped nonprofits raise over $1 billion. After finally stepping back into something resembling semi-retirement, he expected to have more time for things he enjoyed. One of those things was podcasts.
            </p>
            <p className="text-foreground font-medium">
              There was just one issue.
            </p>
            <p>
              Even with more free time than he'd had in over a decade, he still could not keep up. Every week brought more episodes from favorite shows. Great interviews. Smart conversations. Business breakdowns. Tech debates. Weird startup ideas. Somehow, "having time" still did not translate into "listening to all of them."
            </p>
            <p>
              Instead, the backlog kept growing, and with it, the quiet guilt of being 17 episodes behind on a show you swear you still follow.
            </p>
            <p className="text-foreground font-medium">
              So he built PodCap.
            </p>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          data-testid="section-founder-quote"
        >
          <div className="relative bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-8 md:p-10">
            <Quote className="w-8 h-8 text-primary/20 absolute top-6 left-6" />
            <blockquote className="relative z-10 text-lg md:text-xl font-display leading-relaxed text-foreground italic pl-6 border-l-4 border-primary/30">
              "I had more free time, listened to more podcasts, and somehow still fell hopelessly behind. If a semi-retired person can't keep up, maybe the problem isn't the person."
            </blockquote>
            <div className="mt-5 pl-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-foreground">Derek Johnson</p>
                <p className="text-xs text-muted-foreground">Founder of PodCap &middot; Previously founded Tatango.com (15 years)</p>
              </div>
              <a
                href="https://www.linkedin.com/in/derekjohnson/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0A66C2] hover:text-[#004182] transition-colors"
                data-testid="link-linkedin"
              >
                <SiLinkedin className="w-4 h-4" />
                Connect on LinkedIn
              </a>
            </div>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          data-testid="section-what-is-podcap"
        >
          <h2 className="text-2xl font-display font-bold mb-3">What PodCap actually is</h2>
          <p className="text-[17px] leading-[1.8] text-muted-foreground mb-8">
            PodCap listens to your favorite podcasts and sends you short, useful AI-powered summaries so you can stay caught up without spending hours every week trying to clear your queue. It's a daily podcast recap for people who love podcasts but don't have unlimited time, focus, or patience.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-6 text-center" data-testid="card-value-prop-1">
              <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center mx-auto mb-3">
                <Headphones className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm font-bold text-foreground mb-1">Follow more podcasts</p>
              <p className="text-xs text-muted-foreground leading-relaxed">Subscribe to everything that interests you without falling behind.</p>
            </div>
            <div className="bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-6 text-center" data-testid="card-value-prop-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center mx-auto mb-3">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm font-bold text-foreground mb-1">Get the gist fast</p>
              <p className="text-xs text-muted-foreground leading-relaxed">Key insights and takeaways from every episode, delivered daily.</p>
            </div>
            <div className="bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-6 text-center" data-testid="card-value-prop-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm font-bold text-foreground mb-1">Decide what's worth it</p>
              <p className="text-xs text-muted-foreground leading-relaxed">Choose which episodes deserve your full attention.</p>
            </div>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          data-testid="section-built-for-me"
        >
          <h2 className="text-2xl font-display font-bold mb-3">Founder. Owner. Customer.</h2>
          <div className="space-y-4 text-[17px] leading-[1.8] text-muted-foreground">
            <p>
              PodCap was built selfishly, in the best possible way. Derek wanted it for himself. He uses it himself. He pays for it himself. He may also be the only founder who can honestly say he became his own first paying customer out of necessity.
            </p>
            <p>
              This isn't "we identified a market opportunity." This is "this problem annoyed me enough that I built the solution I wanted." It turns out he's not the only person with more great podcasts than available hours.
            </p>
            <p className="text-sm italic text-muted-foreground/80">
              No productivity guilt required.
            </p>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          data-testid="section-derek-podcasts"
        >
          <h2 className="text-2xl font-display font-bold mb-3">Derek's podcast recaps</h2>
          <p className="text-[15px] leading-[1.8] text-muted-foreground mb-6">
            These are the podcasts Derek actually follows on PodCap. Every morning, he gets a recap of each new episode so he can decide what's worth a full listen. You can get the same recaps, free.
          </p>
          {podcastsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-4 flex items-center gap-3 animate-pulse">
                  <div className="w-12 h-12 rounded-lg bg-muted shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : founderPodcasts && founderPodcasts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="grid-founder-podcasts">
              {founderPodcasts.map((podcast) => (
                <div
                  key={podcast.id}
                  className="bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-4 flex items-center gap-3"
                  data-testid={`card-podcast-${podcast.id}`}
                >
                  <img
                    src={hiResArtwork(podcast.artworkUrl)}
                    alt={podcast.name}
                    className="w-12 h-12 rounded-lg object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{podcast.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{podcast.artistName}</p>
                  </div>
                  <a
                    href={`/?podcast=${podcast.id}`}
                    className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors"
                    data-testid={`link-get-recaps-${podcast.id}`}
                  >
                    Get Recaps
                  </a>
                </div>
              ))}
            </div>
          ) : null}
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          data-testid="section-who-its-for"
        >
          <h2 className="text-2xl font-display font-bold mb-3">Who it's for</h2>
          <p className="text-[17px] leading-[1.8] text-muted-foreground mb-6">
            If your podcast app looks like an unread inbox from 2017, you're in the right place. PodCap is for people who:
          </p>
          <div className="space-y-3">
            {[
              "Subscribe to too many podcasts (and aren't sorry about it)",
              "Genuinely want to keep up with every show",
              "Are tired of falling behind and feeling vaguely guilty about it",
              "Want the key ideas without giving up hours every day",
              "Still want to choose when something is worth listening to in full",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-primary mt-1 shrink-0" />
                <p className="text-[15px] text-muted-foreground">{item}</p>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          data-testid="section-still-love-podcasts"
        >
          <div className="bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-8 md:p-10">
            <div className="flex items-center gap-3 mb-4">
              <Heart className="w-6 h-6 text-red-500 fill-red-500" />
              <h2 className="text-2xl font-display font-bold">I still love podcasts</h2>
            </div>
            <div className="space-y-4 text-[15px] leading-[1.8] text-muted-foreground">
              <p>
                I didn't create PodCap to have people stop listening to podcasts. Quite the opposite. I want people to listen to the <span className="text-foreground font-medium">right</span> podcast episodes at the <span className="text-foreground font-medium">right</span> time.
              </p>
              <p>
                That's what PodCap does. It gives you a summary before you spend 60 minutes listening, only to find out the episode isn't a great fit for you right now. Instead, you can focus your time on the episodes that are. Skip the noise, keep the signal.
              </p>
              <p className="text-foreground font-medium">
                Long live podcasts. :)
              </p>
            </div>
            <div className="mt-8 pt-6 border-t border-black/[0.06] dark:border-white/[0.06]">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Derek's podcast setup</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#1DB954]/10 flex items-center justify-center shrink-0">
                    <SiSpotify className="w-4 h-4 text-[#1DB954]" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Favorite podcast app</p>
                    <p className="text-sm font-semibold text-foreground">Spotify</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Headphones className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Favorite podcast</p>
                    <a href="/podcasts/myfirstmillion" className="text-sm font-semibold text-foreground hover:text-primary transition-colors" data-testid="link-fav-podcast">My First Million</a>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Smile className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Favorite podcast headphones</p>
                    <p className="text-sm font-semibold text-foreground">AirPods</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Favorite place to listen</p>
                    <p className="text-sm font-semibold text-foreground">On a walk</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45 }}
          data-testid="section-whats-new"
        >
          <div className="bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-8">
            <h2 className="text-xl font-display font-bold mb-3">Constantly improving</h2>
            <p className="text-[15px] leading-[1.8] text-muted-foreground mb-5">
              We're constantly improving PodCap — adding features, refining summaries, and making it easier to keep up with the podcasts you care about. This isn't a "set it and forget it" project. It's an active product with real momentum.
            </p>
            <Link
              href="/updates"
              className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:text-primary/80 transition-colors"
              data-testid="link-visit-whats-new"
            >
              Visit What's New
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          data-testid="section-final-cta"
        >
          <div className="text-center bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 rounded-2xl p-10 md:p-14">
            <h2 className="text-2xl md:text-3xl font-display font-bold mb-3">
              Keep up with your favorite podcasts.
            </h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              Without pretending you have time for all of them.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <a
                href="/"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-md shadow-primary/20 hover:bg-primary/90 transition-all"
                data-testid="link-cta-get-summaries"
              >
                Get Free Summaries
                <ArrowRight className="w-4 h-4" />
              </a>
              <Link
                href="/podcasts"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-black/[0.08] dark:border-white/[0.1] text-sm font-bold text-foreground hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-all"
                data-testid="link-cta-browse"
              >
                Browse Podcasts
              </Link>
            </div>
          </div>
        </motion.section>
      </main>

      <Footer />
    </div>
  );
}
