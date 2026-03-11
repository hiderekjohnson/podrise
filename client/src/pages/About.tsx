import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { ArrowRight, Headphones, Zap, CheckCircle2, Quote, Heart, Clock, Mail, Sparkles, Search, BookOpen, Globe } from "lucide-react";
import derekPhoto from "@assets/Derek_Johnson_nobg.png";
import { SiteHeader } from "@/components/SiteHeader";

export default function About() {
  useEffect(() => {
    document.title = "About PodCap - Building the World's Searchable Library of Podcast Knowledge";
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.content = content;
    };
    setMeta("name", "description", "PodCap is turning podcast episodes into searchable, discoverable knowledge. Get AI-powered podcast recaps, podcast summaries, full transcripts, and structured insights so great ideas travel further.");
    setMeta("property", "og:title", "About PodCap - Building the World's Searchable Library of Podcast Knowledge");
    setMeta("property", "og:description", "PodCap is turning podcast episodes into searchable, discoverable knowledge. Get AI-powered podcast recaps, podcast summaries, full transcripts, and structured insights so great ideas travel further.");
    setMeta("property", "og:type", "website");
    setMeta("property", "og:url", "https://podcap.io/about");
    setMeta("property", "og:image", "https://podcap.io/favicon.png");
    setMeta("name", "twitter:card", "summary");
    setMeta("name", "twitter:title", "About PodCap - Building the World's Searchable Library of Podcast Knowledge");
    setMeta("name", "twitter:description", "PodCap is turning podcast episodes into searchable, discoverable knowledge. Get AI-powered podcast recaps, podcast summaries, full transcripts, and structured insights so great ideas travel further.");
    setMeta("name", "twitter:image", "https://podcap.io/favicon.png");

    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
    link.href = "https://podcap.io/about";

    return () => { if (link) link.remove(); };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />

      <main className="flex-1 w-full">
        <motion.section
          className="max-w-3xl mx-auto px-6 pt-16 sm:pt-24 pb-12 text-center"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          data-testid="section-hero"
        >
          <div className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full bg-primary/[0.07] text-primary text-base sm:text-lg font-display font-bold uppercase tracking-widest mb-6">
            <Sparkles className="w-5 h-5" />
            About PodCap
          </div>
          <h1 className="text-[1.75rem] sm:text-[2rem] md:text-[2.35rem] font-display font-extrabold tracking-[-0.03em] leading-[1.15] mb-5 max-w-2xl mx-auto" data-testid="text-hero-title">
            The world's best ideas are locked inside audio. We're changing that.
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed mb-10">
            Podcasts have quietly become one of the largest knowledge platforms in the world. PodCap is building the infrastructure to make that knowledge accessible to everyone.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a
              href="/"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-primary text-white text-base font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:bg-primary/90 transition-all hover:-translate-y-0.5"
              data-testid="link-get-summaries"
            >
              Get Free Summaries
              <ArrowRight className="w-4 h-4" />
            </a>
            <Link
              href="/updates"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl border border-black/[0.08] dark:border-white/[0.1] text-base font-bold text-foreground hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-all"
              data-testid="link-whats-new"
            >
              See What's New
            </Link>
          </div>
        </motion.section>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="max-w-md mx-auto mb-16 px-6"
          data-testid="social-proof"
        >
          <div className="relative overflow-hidden bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] border border-primary/[0.08] rounded-2xl px-8 py-6 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(var(--primary)/0.08),transparent_70%)]" />
            <p className="relative text-base text-[#3F3F46] dark:text-[#A1A1AA] font-medium mb-1">PodCap users have already saved</p>
            <p className="relative text-4xl sm:text-5xl font-display font-extrabold text-primary tracking-tight">
              <HoursSavedCounter />
            </p>
          </div>
        </motion.div>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          data-testid="section-the-problem"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-black/[0.06] dark:to-white/[0.06]" />
            <h2 className="text-[15px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">The Problem</h2>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-black/[0.06] dark:to-white/[0.06]" />
          </div>
          <div className="space-y-5 text-[17px] leading-[1.85] text-muted-foreground max-w-2xl mx-auto">
            <p>
              Every week, thousands of conversations happen between founders, investors, scientists, economists, authors, and operators. Some of the best ideas on the internet are now being shared in long-form podcast conversations instead of written articles.
            </p>
            <p className="text-foreground font-semibold text-lg">
              There's just one problem.
            </p>
            <p>
              Almost all of that knowledge is locked inside audio.
            </p>
            <p>
              If you want to learn what was said in an episode, you usually have to listen to the entire conversation. Two hours here. Three hours there. Multiply that by dozens of shows and hundreds of episodes. Even the most dedicated listeners can't keep up.
            </p>
            <p className="text-foreground font-semibold text-lg">
              PodCap was built to solve this.
            </p>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          data-testid="section-team-quote"
        >
          <div className="relative bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-8 sm:p-10 md:p-12 shadow-sm">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/40 via-primary to-primary/40 rounded-t-2xl" />
            <Quote className="w-10 h-10 text-primary/10 mb-4" />
            <blockquote className="text-xl sm:text-2xl font-display leading-relaxed text-foreground italic mb-8">
              "After I stepped back from running my company, I had more free time and started listening to a lot more podcasts. The funny thing is, even with more time, I kept falling hopelessly behind. That's when it hit me. If even someone with time on their hands can't keep up, maybe the problem isn't the person. It's the format."
            </blockquote>
            <div className="flex items-center gap-4">
              <img src={derekPhoto} alt="Derek Johnson" className="w-14 h-14 rounded-full object-cover object-top bg-gradient-to-br from-primary/10 to-primary/5 ring-2 ring-primary/10 ring-offset-2 ring-offset-background" />
              <div>
                <p className="text-[15px] font-bold text-foreground">Derek Johnson</p>
                <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]">Founder, PodCap</p>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          data-testid="section-what-we-do"
        >
          <h2 className="text-2xl sm:text-3xl font-display font-bold mb-3 text-center">What PodCap does today</h2>
          <p className="text-[17px] leading-[1.85] text-muted-foreground mb-10 text-center max-w-2xl mx-auto">
            We recap podcast episodes and extract the key ideas so you can quickly understand what was discussed, what mattered, and what's worth listening to. Instead of spending hours catching up, you can skim the most important insights in minutes.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { icon: Headphones, title: "Follow more podcasts", desc: "Subscribe to everything that interests you without falling behind.", color: "from-blue-500/10 to-blue-600/5", iconColor: "text-blue-500" },
              { icon: Zap, title: "Get the gist fast", desc: "Key insights and takeaways from every episode, delivered daily.", color: "from-amber-500/10 to-amber-600/5", iconColor: "text-amber-500" },
              { icon: CheckCircle2, title: "Decide what's worth it", desc: "Choose which episodes deserve your full attention.", color: "from-emerald-500/10 to-emerald-600/5", iconColor: "text-emerald-500" },
            ].map((item, i) => (
              <div key={i} className="group bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-7 text-center hover:shadow-md hover:-translate-y-1 transition-all duration-300" data-testid={`card-value-prop-${i + 1}`}>
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center mx-auto mb-4`}>
                  <item.icon className={`w-6 h-6 ${item.iconColor}`} />
                </div>
                <p className="text-[15px] font-bold text-foreground mb-1.5">{item.title}</p>
                <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section
          className="w-full py-20 bg-gradient-to-b from-black/[0.015] to-transparent dark:from-white/[0.02]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          data-testid="section-bigger-vision"
        >
          <div className="max-w-3xl mx-auto px-6">
            <div className="flex items-center gap-3 mb-4 justify-center">
              <Globe className="w-6 h-6 text-primary" />
              <h2 className="text-2xl sm:text-3xl font-display font-bold">The bigger vision</h2>
            </div>
            <p className="text-muted-foreground text-center mb-10 max-w-2xl mx-auto text-[17px] leading-[1.85]">
              But the vision goes far beyond recaps. Our long-term goal is to build the most complete library of podcast knowledge ever created.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
              {[
                { icon: BookOpen, title: "Every episode summarized", desc: "A comprehensive recap for every conversation, across every show.", color: "from-violet-500/10 to-violet-600/5", iconColor: "text-violet-500" },
                { icon: Search, title: "Every conversation searchable", desc: "Search across millions of podcast conversations to find exactly what you need.", color: "from-cyan-500/10 to-cyan-600/5", iconColor: "text-cyan-500" },
                { icon: Sparkles, title: "Every insight discoverable", desc: "Surface the most important ideas shared across the entire podcast ecosystem.", color: "from-rose-500/10 to-rose-600/5", iconColor: "text-rose-500" },
              ].map((item, i) => (
                <div key={i} className="group bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-7 text-center hover:shadow-md hover:-translate-y-1 transition-all duration-300" data-testid={`card-vision-${i + 1}`}>
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center mx-auto mb-4`}>
                    <item.icon className={`w-6 h-6 ${item.iconColor}`} />
                  </div>
                  <p className="text-[15px] font-bold text-foreground mb-1.5">{item.title}</p>
                  <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="max-w-2xl mx-auto space-y-5 text-[17px] leading-[1.85] text-muted-foreground">
              <p>
                Today, podcasts are one of the most valuable sources of ideas on the internet, but they remain largely invisible to search engines and difficult to navigate for listeners.
              </p>
              <p className="text-foreground font-semibold text-lg text-center">
                We believe that will change.
              </p>
              <p>
                Just as Wikipedia organized the world's written knowledge, PodCap is building the infrastructure to organize the world's podcast conversations.
              </p>
            </div>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-6 py-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          data-testid="section-where-were-headed"
        >
          <h2 className="text-2xl sm:text-3xl font-display font-bold mb-3 text-center">Where we're headed</h2>
          <p className="text-muted-foreground mb-10 text-center max-w-lg mx-auto">
            Over time, PodCap will become the place where you can:
          </p>
          <div className="max-w-xl mx-auto space-y-4">
            {[
              "Understand any podcast episode in minutes",
              "Search across millions of podcast conversations",
              "Discover the most important ideas shared across the entire podcast ecosystem",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-4 bg-white dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.06] rounded-xl px-5 py-4">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                </div>
                <p className="text-[15px] text-foreground leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-foreground font-semibold text-lg mt-8">
            In other words, the fastest way to learn from the world's podcasts.
          </p>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.42 }}
          data-testid="section-how-it-works"
        >
          <div className="relative overflow-hidden bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-8 sm:p-10 md:p-12 shadow-sm">
            <div className="space-y-5 text-[17px] leading-[1.85] text-muted-foreground max-w-2xl mx-auto">
              <p>
                The podcast industry continues to grow rapidly, with millions of shows and billions of hours of audio produced every year. But the tools for navigating that content have barely evolved.
              </p>
              <p className="text-foreground font-semibold text-lg">
                We think the next generation of podcast platforms won't just distribute audio.
              </p>
              <p>
                They'll make the knowledge inside podcasts accessible.
              </p>
              <p className="text-foreground font-semibold text-lg">
                That's what PodCap is building.
              </p>
            </div>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45 }}
          data-testid="section-still-love-podcasts"
        >
          <div className="relative overflow-hidden bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-8 sm:p-10 md:p-12 shadow-sm">
            <div className="absolute top-0 right-0 w-40 h-40 bg-red-500/[0.04] rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-5">
                <Heart className="w-7 h-7 text-red-500 fill-red-500" />
                <h2 className="text-2xl sm:text-3xl font-display font-bold">We still love podcasts</h2>
              </div>
              <div className="space-y-4 text-[17px] leading-[1.85] text-muted-foreground">
                <p>
                  We didn't create PodCap to have people stop listening to podcasts. Quite the opposite. We want people to listen to the <span className="text-foreground font-medium">right</span> podcast episodes at the <span className="text-foreground font-medium">right</span> time.
                </p>
                <p>
                  That's what PodCap does. It gives you a summary before you spend 60 minutes listening, only to find out the episode isn't a great fit for you right now. Instead, you can focus your time on the episodes that are. Skip the noise, keep the signal.
                </p>
                <p>
                  We're also committed to supporting the creators who make these shows. <a href="/we-heart-podcasters" className="text-primary font-medium hover:underline">Find out how we support podcasters</a>.
                </p>
                <p className="text-foreground font-semibold text-lg">
                  Long live podcasts. :)
                </p>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          data-testid="section-whats-new"
        >
          <div className="flex items-stretch gap-5 flex-col sm:flex-row">
            <div className="flex-1 bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-7 shadow-sm">
              <h3 className="text-lg font-display font-bold mb-2">Constantly improving</h3>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] leading-relaxed mb-4">
                We're constantly improving PodCap. Adding features, refining summaries, and making it easier to keep up.
              </p>
              <Link
                href="/updates"
                className="inline-flex items-center gap-1.5 text-base font-bold text-primary hover:text-primary/80 transition-colors"
                data-testid="link-visit-whats-new"
              >
                Visit What's New
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="flex-1 bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-7 shadow-sm">
              <h3 className="text-lg font-display font-bold mb-2">Browse podcasts</h3>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] leading-relaxed mb-4">
                See which podcasts other users follow, explore recaps, and find your next favorite show.
              </p>
              <Link
                href="/podcasts"
                className="inline-flex items-center gap-1.5 text-base font-bold text-primary hover:text-primary/80 transition-colors"
                data-testid="link-browse-podcasts"
              >
                Browse Podcasts
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-24"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.55 }}
          data-testid="section-final-cta"
        >
          <div className="relative overflow-hidden text-center rounded-2xl p-12 md:p-16">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.08] via-primary/[0.04] to-primary/[0.08]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,hsl(var(--primary)/0.12),transparent_60%)]" />
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-display font-extrabold mb-4 tracking-[-0.02em]">
                We listen so you don't have to.
              </h2>
              <p className="text-lg text-muted-foreground mb-10 max-w-md mx-auto">
                The fastest way to learn from the world's podcasts.
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <a
                  href="/"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-primary text-white text-base font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:bg-primary/90 transition-all hover:-translate-y-0.5"
                  data-testid="link-cta-get-summaries"
                >
                  Get Free Summaries
                  <ArrowRight className="w-4 h-4" />
                </a>
                <Link
                  href="/podcasts"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.1] text-base font-bold text-foreground shadow-sm hover:shadow-md transition-all"
                  data-testid="link-cta-browse"
                >
                  Browse Podcasts
                </Link>
              </div>
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
