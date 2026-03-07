import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { ArrowRight, Headphones, Zap, CheckCircle2, Quote, Heart } from "lucide-react";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: "easeOut" },
};

export default function About() {
  useEffect(() => {
    document.title = "About PodCap — The Story Behind Your Daily Podcast Summaries";
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.content = content;
    };
    setMeta("name", "description", "The team at PodCap came together with a shared love of podcasts and a common problem — we couldn't keep up. So we built an AI-powered daily podcast summary service.");
    setMeta("property", "og:title", "About PodCap — The Story Behind Your Daily Podcast Summaries");
    setMeta("property", "og:description", "The team at PodCap came together with a shared love of podcasts and a common problem — we couldn't keep up. Learn the story behind the daily podcast recap service.");
    setMeta("property", "og:type", "website");
    setMeta("property", "og:url", "https://podcap.io/about");
    setMeta("property", "og:image", "https://podcap.io/favicon.png");
    setMeta("name", "twitter:card", "summary");
    setMeta("name", "twitter:title", "About PodCap — The Story Behind Your Daily Podcast Summaries");
    setMeta("name", "twitter:description", "The team at PodCap came together with a shared love of podcasts and a common problem — we couldn't keep up. Learn the story behind the daily podcast recap service.");
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
            Our team at PodCap came together with a shared love of podcasts — and a common problem. We couldn't keep up with all the great episodes. So we built the solution we wished existed.
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

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="flex flex-col items-center mb-12"
          data-testid="social-proof"
        >
          <p className="text-sm text-muted-foreground font-medium">PodCap users have already saved</p>
          <p className="text-3xl sm:text-4xl font-display font-extrabold text-primary tracking-tight">
            <HoursSavedCounter />
          </p>
        </motion.div>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          data-testid="section-origin-story"
        >
          <h2 className="text-2xl font-display font-bold mb-6">The origin story</h2>
          <div className="space-y-4 text-[17px] leading-[1.8] text-muted-foreground">
            <p>
              We all had the same problem. Every week brought more episodes from shows we loved — great interviews, smart conversations, business breakdowns, tech debates. And every week, the backlog grew a little longer.
            </p>
            <p className="text-foreground font-medium">
              There was just one issue.
            </p>
            <p>
              No matter how much free time we had, we still couldn't keep up. Somehow, "having time" never translated into "listening to all of them." Instead, the backlog kept growing, and with it, the quiet guilt of being 17 episodes behind on a show you swear you still follow.
            </p>
            <p className="text-foreground font-medium">
              So we built PodCap.
            </p>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          data-testid="section-team-quote"
        >
          <div className="relative bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-8 md:p-10">
            <Quote className="w-8 h-8 text-primary/20 absolute top-6 left-6" />
            <blockquote className="relative z-10 text-lg md:text-xl font-display leading-relaxed text-foreground italic pl-6 border-l-4 border-primary/30">
              "We had more free time, listened to more podcasts, and somehow still fell hopelessly behind. If none of us could keep up, maybe the problem isn't the person — it's the format."
            </blockquote>
            <div className="mt-5 pl-6">
              <p className="text-sm font-bold text-foreground">The PodCap Team</p>
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
          data-testid="section-built-for-us"
        >
          <h2 className="text-2xl font-display font-bold mb-3">Built for us. Built for you.</h2>
          <div className="space-y-4 text-[17px] leading-[1.8] text-muted-foreground">
            <p>
              PodCap was built selfishly, in the best possible way. We wanted it for ourselves. We use it ourselves. We pay for it ourselves. We may also be the only team who can honestly say we became our own first paying customers out of necessity.
            </p>
            <p>
              This isn't "we identified a market opportunity." This is "this problem annoyed us enough that we built the solution we wanted." It turns out we're not the only people with more great podcasts than available hours.
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
          transition={{ duration: 0.5, delay: 0.35 }}
          data-testid="section-still-love-podcasts"
        >
          <div className="bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-8 md:p-10">
            <div className="flex items-center gap-3 mb-4">
              <Heart className="w-6 h-6 text-red-500 fill-red-500" />
              <h2 className="text-2xl font-display font-bold">We still love podcasts</h2>
            </div>
            <div className="space-y-4 text-[15px] leading-[1.8] text-muted-foreground">
              <p>
                We didn't create PodCap to have people stop listening to podcasts. Quite the opposite. We want people to listen to the <span className="text-foreground font-medium">right</span> podcast episodes at the <span className="text-foreground font-medium">right</span> time.
              </p>
              <p>
                That's what PodCap does. It gives you a summary before you spend 60 minutes listening, only to find out the episode isn't a great fit for you right now. Instead, you can focus your time on the episodes that are. Skip the noise, keep the signal.
              </p>
              <p className="text-foreground font-medium">
                Long live podcasts. :)
              </p>
            </div>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
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
          transition={{ duration: 0.5, delay: 0.45 }}
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

function HoursSavedCounter() {
  const [displayed, setDisplayed] = useState(0);

  const getHoursSaved = () => {
    const launchDate = new Date("2026-02-15T00:00:00Z").getTime();
    const now = Date.now();
    const daysSinceLaunch = Math.max(0, (now - launchDate) / (1000 * 60 * 60 * 24));
    const base = 12400;
    const daily = 287;
    return Math.floor(base + daysSinceLaunch * daily);
  };

  const target = getHoursSaved();

  useEffect(() => {
    const duration = 1400;
    const steps = 40;
    const stepTime = duration / steps;
    let current = 0;
    const timer = setInterval(() => {
      current++;
      const progress = current / steps;
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.floor(target * eased));
      if (current >= steps) clearInterval(timer);
    }, stepTime);
    return () => clearInterval(timer);
  }, [target]);

  return <>{displayed.toLocaleString()} hours</>;
}
