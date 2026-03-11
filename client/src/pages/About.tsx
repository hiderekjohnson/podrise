import { useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { ArrowRight, Headphones, Zap, CheckCircle2, Quote, Heart, Clock, Mail, Sparkles, Search, BookOpen, Globe, BarChart3 } from "lucide-react";
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
    setMeta("name", "description", "PodCap is turning podcast episodes into searchable, discoverable knowledge. Get AI-powered podcast recaps, podcast summaries, and structured insights so great ideas travel further.");
    setMeta("property", "og:title", "About PodCap - Building the World's Searchable Library of Podcast Knowledge");
    setMeta("property", "og:description", "PodCap is turning podcast episodes into searchable, discoverable knowledge. Get AI-powered podcast recaps, podcast summaries, and structured insights so great ideas travel further.");
    setMeta("property", "og:type", "website");
    setMeta("property", "og:url", "https://podcap.io/about");
    setMeta("property", "og:image", "https://podcap.io/favicon.png");
    setMeta("name", "twitter:card", "summary");
    setMeta("name", "twitter:title", "About PodCap - Building the World's Searchable Library of Podcast Knowledge");
    setMeta("name", "twitter:description", "PodCap is turning podcast episodes into searchable, discoverable knowledge. Get AI-powered podcast recaps, podcast summaries, and structured insights so great ideas travel further.");
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
            Google indexed the web. We're indexing the conversation.
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed mb-10">
            150 million hours of podcast content exist today. That's longer than all of recorded human civilization. The world's best thinkers are sharing everything in audio nobody can search. Until now.
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

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12 }}
          className="max-w-3xl mx-auto px-6 mb-16"
          data-testid="section-stat-block"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { value: "150M+", label: "hours of podcast content", sublabel: "exist today" },
              { value: "12,000+", label: "years of civilization", sublabel: "and podcasts have surpassed it" },
              { value: "2,000x", label: "more content than", sublabel: "Netflix's entire library" },
              { value: "80,000+", label: "new hours published", sublabel: "every single day" },
            ].map((stat, i) => (
              <div
                key={i}
                className="bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-4 sm:p-5 text-center"
                data-testid={`stat-card-${i}`}
              >
                <p className="text-2xl sm:text-3xl font-display font-extrabold text-primary tracking-tight mb-1">{stat.value}</p>
                <p className="text-[13px] sm:text-[14px] font-semibold text-foreground leading-snug">{stat.label}</p>
                <p className="text-[12px] sm:text-[13px] text-muted-foreground/70 leading-snug mt-0.5">{stat.sublabel}</p>
              </div>
            ))}
          </div>
        </motion.section>

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
              Every day, 80,000 new hours of podcast content are published. Founders, investors, scientists, economists, and operators are sharing their best thinking in long-form conversations that go deeper than any article or tweet ever could.
            </p>
            <p className="text-foreground font-semibold text-lg">
              The problem? Almost none of it is searchable.
            </p>
            <p>
              While you slept last night, more than 3,000 hours of new audio dropped every hour. The breakthrough insight you need is probably already out there, buried in an episode you'll never find. Every contrarian take, every playbook, every hard-won lesson - recorded, published, and lost.
            </p>
            <p>
              You'd need 9 years of continuous listening just to catch up on what dropped this week.
            </p>
            <p className="text-foreground font-semibold text-lg">
              Nobody can keep up. That's the point - you shouldn't have to.
            </p>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          data-testid="section-netflix-comparison"
        >
          <div className="relative bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-8 sm:p-10 shadow-sm overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/40 via-primary to-primary/40 rounded-t-2xl" />
            <div className="flex items-center gap-2.5 mb-6">
              <BarChart3 className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-display font-bold text-foreground">The Scale Problem, Visualized</h3>
            </div>
            <p className="text-[15px] text-muted-foreground mb-6">
              Netflix spent decades building a 50,000-hour library. Podcasters create that much content every 12 hours.
            </p>
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[14px] font-semibold text-foreground">Netflix</span>
                  <span className="text-[13px] text-muted-foreground font-medium">~50,000 hours</span>
                </div>
                <div className="h-5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-red-400 to-red-500"
                    initial={{ width: 0 }}
                    animate={{ width: "2.5%" }}
                    transition={{ duration: 1.2, delay: 0.6, ease: "easeOut" }}
                  />
                </div>
                <p className="text-[12px] text-muted-foreground/60 mt-1">Built over 25+ years</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[14px] font-semibold text-foreground">Podcasts</span>
                  <span className="text-[13px] text-muted-foreground font-medium">~150,000,000 hours</span>
                </div>
                <div className="h-5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary"
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 1.8, delay: 0.9, ease: "easeOut" }}
                  />
                </div>
                <p className="text-[12px] text-muted-foreground/60 mt-1">2,000x more content - and growing by 80,000+ hours every day</p>
              </div>
            </div>
            <p className="text-[15px] text-foreground font-semibold mt-6 text-center">
              A trillion dollars of business insight, locked in audio files nobody can search.
            </p>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-6 pb-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          data-testid="section-team-quote"
        >
          <div className="relative bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-8 sm:p-10 md:p-12 shadow-sm">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/40 via-primary to-primary/40 rounded-t-2xl" />
            <Quote className="w-10 h-10 text-primary/10 mb-4" />
            <blockquote className="text-xl sm:text-2xl font-display leading-relaxed text-foreground italic mb-8">
              "Millions of hours of the world's most valuable conversations have already been recorded. Founders sharing exactly how they built their companies. Scientists explaining breakthroughs. Investors revealing how they really think. It's all been said - but until now, there's been no way to search through that immense library of human knowledge. That's what we're building."
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
          transition={{ duration: 0.5, delay: 0.35 }}
          data-testid="section-what-we-do"
        >
          <h2 className="text-2xl sm:text-3xl font-display font-bold mb-3 text-center">What PodCap does today</h2>
          <p className="text-[17px] leading-[1.85] text-muted-foreground mb-10 text-center max-w-2xl mx-auto">
            We process thousands of podcast episodes every week, turning hours of audio into structured, searchable knowledge. Instead of spending your day trying to keep up, you get the key ideas in minutes.
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
          transition={{ duration: 0.5, delay: 0.4 }}
          data-testid="section-bigger-vision"
        >
          <div className="max-w-3xl mx-auto px-6">
            <div className="flex items-center gap-3 mb-4 justify-center">
              <Globe className="w-6 h-6 text-primary" />
              <h2 className="text-2xl sm:text-3xl font-display font-bold">The bigger vision</h2>
            </div>
            <p className="text-muted-foreground text-center mb-10 max-w-2xl mx-auto text-[17px] leading-[1.85]">
              The vision goes far beyond recaps. We're building the search engine for human conversation - every podcast, every word, searchable.
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
          transition={{ duration: 0.5, delay: 0.45 }}
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
          transition={{ duration: 0.5, delay: 0.48 }}
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
                  We didn't build PodCap to replace podcasts. We built it to make them more powerful. Every episode you've ever loved is full of ideas worth revisiting, sharing, and acting on. PodCap turns that audio into searchable, structured knowledge that's easy to find and easy to use.
                </p>
                <p>
                  For listeners, that means spending less time sifting through episodes and more time on the ones that matter. For creators, it means your best ideas don't disappear after publish day. Your content becomes discoverable, quotable, and actionable for your audience long after the episode drops.
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
              <h3 className="text-lg font-display font-bold mb-2">Explore insights</h3>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] leading-relaxed mb-4">
                Track what's being said across podcasts on the topics that matter to you.
              </p>
              <Link
                href="/insights"
                className="inline-flex items-center gap-1.5 text-base font-bold text-primary hover:text-primary/80 transition-colors"
                data-testid="link-browse-insights"
              >
                Explore Insights
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
                While you slept, 80,000 hours of new content dropped. We read it for you.
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
                  href="/insights"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.1] text-base font-bold text-foreground shadow-sm hover:shadow-md transition-all"
                  data-testid="link-cta-browse"
                >
                  Explore Insights
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
