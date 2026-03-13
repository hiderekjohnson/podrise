import { useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { ArrowRight, Headphones, Zap, CheckCircle2, Quote, Heart, Clock, Mail, Sparkles, Search, BookOpen, Globe, BarChart3 } from "lucide-react";
import derekPhoto from "@assets/Derek_Johnson_nobg.png";
import { SiteHeader } from "@/components/SiteHeader";

export default function About() {
  useEffect(() => {
    document.title = "About PodCap - The Intelligence Layer for Podcasts";
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.content = content;
    };
    setMeta("name", "description", "PodCap is the intelligence layer on top of podcasts. We monitor hundreds of the world's top shows and deliver structured briefings so you always know what the smartest people in your industry are talking about.");
    setMeta("property", "og:title", "About PodCap - The Intelligence Layer for Podcasts");
    setMeta("property", "og:description", "PodCap is the intelligence layer on top of podcasts. We monitor hundreds of the world's top shows and deliver structured briefings so you always know what the smartest people in your industry are talking about.");
    setMeta("property", "og:type", "website");
    setMeta("property", "og:url", "https://podcap.io/about");
    setMeta("property", "og:image", "https://podcap.io/favicon.png");
    setMeta("name", "twitter:card", "summary");
    setMeta("name", "twitter:title", "About PodCap - The Intelligence Layer for Podcasts");
    setMeta("name", "twitter:description", "PodCap is the intelligence layer on top of podcasts. We monitor hundreds of the world's top shows and deliver structured briefings so you always know what the smartest people in your industry are talking about.");
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
          className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-12 text-center"
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
            We are building the intelligence layer on top of podcasts
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed mb-10">
            The world's best thinkers are sharing everything on podcasts -- but nobody has time to listen to all of it. PodCap monitors hundreds of the top shows and delivers structured intelligence so you always know what matters.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a
              href="/"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-primary text-white text-base font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:bg-primary/90 transition-all hover:-translate-y-0.5"
              data-testid="link-get-summaries"
            >
              Get Started Free
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
          className="max-w-3xl mx-auto px-4 sm:px-6 mb-16"
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
                <p className="text-[16px] font-semibold text-foreground leading-snug">{stat.label}</p>
                <p className="text-[16px] text-[#3F3F46] leading-snug mt-0.5">{stat.sublabel}</p>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-4 sm:px-6 pb-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          data-testid="section-the-problem"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-black/[0.06] dark:to-white/[0.06]" />
            <h2 className="text-[16px] font-bold uppercase tracking-[0.2em] text-[#52525B]">The Gap</h2>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-black/[0.06] dark:to-white/[0.06]" />
          </div>
          <div className="space-y-5 text-[17px] leading-[1.85] text-muted-foreground max-w-2xl mx-auto">
            <p>
              Every day, thousands of new podcast episodes are published. Founders, investors, scientists, economists, and operators are sharing their best thinking in long-form conversations that go deeper than any article or tweet ever could.
            </p>
            <p className="text-foreground font-semibold text-lg">
              The problem? Nobody has time to listen to all of it.
            </p>
            <p>
              The breakthrough insight you need is probably already out there, discussed in an episode you will never get to. Every contrarian take, every playbook, every hard-won lesson -- recorded, published, and effectively invisible to anyone who was not already listening.
            </p>
            <p>
              There is too much signal and not enough time. That is exactly why we built PodCap.
            </p>
            <p className="text-foreground font-semibold text-lg">
              You should not have to listen to everything to know what matters. That is our job.
            </p>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-4 sm:px-6 pb-20"
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
            <p className="text-[16px] text-muted-foreground mb-6">
              Netflix spent decades building a 50,000-hour library. Podcasters create that much content every 12 hours. The intelligence inside those conversations is staggering -- if you have the time to find it.
            </p>
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[16px] font-semibold text-foreground">Netflix</span>
                  <span className="text-[16px] text-muted-foreground font-medium">~50,000 hours</span>
                </div>
                <div className="h-5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-red-400 to-red-500"
                    initial={{ width: 0 }}
                    animate={{ width: "2.5%" }}
                    transition={{ duration: 1.2, delay: 0.6, ease: "easeOut" }}
                  />
                </div>
                <p className="text-[16px] text-[#52525B] mt-1">Built over 25+ years</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[16px] font-semibold text-foreground">Podcasts</span>
                  <span className="text-[16px] text-muted-foreground font-medium">~150,000,000 hours</span>
                </div>
                <div className="h-5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary"
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 1.8, delay: 0.9, ease: "easeOut" }}
                  />
                </div>
                <p className="text-[16px] text-[#52525B] mt-1">2,000x more content - and growing by 80,000+ hours every day</p>
              </div>
            </div>
            <p className="text-[16px] text-foreground font-semibold mt-6 text-center">
              A trillion dollars of business insight, locked in audio that nobody has time to get through.
            </p>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-4 sm:px-6 pb-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          data-testid="section-team-quote"
        >
          <div className="relative bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-8 sm:p-10 md:p-12 shadow-sm">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/40 via-primary to-primary/40 rounded-t-2xl" />
            <Quote className="w-10 h-10 text-primary/10 mb-4" />
            <blockquote className="text-xl sm:text-2xl font-display leading-relaxed text-foreground italic mb-8">
              "The smartest people in every industry are sharing everything on podcasts. Founders explaining exactly how they built their companies. Scientists describing breakthroughs. Investors revealing how they really think. But nobody can keep up with all of it. We are building the intelligence layer that makes sure you never miss what matters -- without having to listen to everything yourself."
            </blockquote>
            <div className="flex items-center gap-4">
              <img src={derekPhoto} alt="Derek Johnson" className="w-14 h-14 rounded-full object-cover object-top bg-gradient-to-br from-primary/10 to-primary/5 ring-2 ring-primary/10 ring-offset-2 ring-offset-background" />
              <div>
                <p className="text-[16px] font-bold text-foreground">Derek Johnson</p>
                <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]">Founder, PodCap</p>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-4 sm:px-6 pb-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          data-testid="section-what-we-do"
        >
          <h2 className="text-2xl sm:text-3xl font-display font-bold mb-3 text-center">What PodCap does today</h2>
          <p className="text-[17px] leading-[1.85] text-muted-foreground mb-10 text-center max-w-2xl mx-auto">
            We monitor hundreds of the world's top podcasts and deliver structured intelligence so you always know what the smartest people in your industry are saying. Two paths in, same result: you stay current in minutes, not hours.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { icon: Headphones, title: "Pick industries or podcasts", desc: "Follow the topics that matter to your work, or choose specific shows. Either way, you stay current.", color: "from-blue-500/10 to-blue-600/5", iconColor: "text-blue-500" },
              { icon: Zap, title: "Get analyst-grade briefings", desc: "Key insights, notable quotes, and takeaways from every episode -- distilled into intelligence you can act on.", color: "from-amber-500/10 to-amber-600/5", iconColor: "text-amber-500" },
              { icon: CheckCircle2, title: "Know what matters", desc: "Spend your listening time on the episodes that truly deserve your attention.", color: "from-emerald-500/10 to-emerald-600/5", iconColor: "text-emerald-500" },
            ].map((item, i) => (
              <div key={i} className="group bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-7 text-center hover:shadow-md hover:-translate-y-1 transition-all duration-300" data-testid={`card-value-prop-${i + 1}`}>
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center mx-auto mb-4`}>
                  <item.icon className={`w-6 h-6 ${item.iconColor}`} />
                </div>
                <p className="text-[16px] font-bold text-foreground mb-1.5">{item.title}</p>
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
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div className="flex items-center gap-3 mb-4 justify-center">
              <Globe className="w-6 h-6 text-primary" />
              <h2 className="text-2xl sm:text-3xl font-display font-bold">The bigger vision</h2>
            </div>
            <p className="text-muted-foreground text-center mb-10 max-w-2xl mx-auto text-[17px] leading-[1.85]">
              The vision goes beyond episode briefings. We are building the complete intelligence layer for the podcast ecosystem -- so every important idea is discoverable, structured, and actionable.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
              {[
                { icon: BookOpen, title: "Every episode analyzed", desc: "Structured intelligence for every conversation, across every show we cover.", color: "from-violet-500/10 to-violet-600/5", iconColor: "text-violet-500" },
                { icon: Search, title: "Every conversation accessible", desc: "Find exactly what was said about any topic, company, or person across the podcast world.", color: "from-cyan-500/10 to-cyan-600/5", iconColor: "text-cyan-500" },
                { icon: Sparkles, title: "Every insight delivered", desc: "Surface the most important ideas being discussed across your industry, delivered to you daily.", color: "from-rose-500/10 to-rose-600/5", iconColor: "text-rose-500" },
              ].map((item, i) => (
                <div key={i} className="group bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-7 text-center hover:shadow-md hover:-translate-y-1 transition-all duration-300" data-testid={`card-vision-${i + 1}`}>
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center mx-auto mb-4`}>
                    <item.icon className={`w-6 h-6 ${item.iconColor}`} />
                  </div>
                  <p className="text-[16px] font-bold text-foreground mb-1.5">{item.title}</p>
                  <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="max-w-2xl mx-auto space-y-5 text-[17px] leading-[1.85] text-muted-foreground">
              <p>
                Today, podcasts are one of the most valuable sources of ideas on the internet -- but the intelligence inside them is only accessible to people with hours to listen.
              </p>
              <p className="text-foreground font-semibold text-lg text-center">
                We believe that will change.
              </p>
              <p>
                PodCap is building the infrastructure that turns the world's podcast conversations into structured, actionable intelligence -- so you always know what the sharpest minds in your field are saying.
              </p>
            </div>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-4 sm:px-6 py-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45 }}
          data-testid="section-where-were-headed"
        >
          <h2 className="text-2xl sm:text-3xl font-display font-bold mb-3 text-center">Where we are headed</h2>
          <p className="text-muted-foreground mb-10 text-center max-w-lg mx-auto">
            Over time, PodCap will become the place where you can:
          </p>
          <div className="max-w-xl mx-auto space-y-4">
            {[
              "Get briefings on any podcast episode in minutes",
              "Track what the smartest people in any industry are saying",
              "Stay ahead of the conversations shaping your field, without listening to everything",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-4 bg-white dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.06] rounded-xl px-5 py-4">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                </div>
                <p className="text-[16px] text-foreground leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-foreground font-semibold text-lg mt-8">
            In other words, your intelligence layer for the world's most important conversations.
          </p>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-4 sm:px-6 pb-20"
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
                  We did not build PodCap to replace podcasts. We built it to make them more powerful. Every episode you have ever loved is full of ideas worth revisiting, sharing, and acting on. PodCap turns that audio into structured intelligence that is easy to find and easy to use.
                </p>
                <p>
                  For listeners, that means spending less time trying to keep up and more time on the episodes that truly deserve your attention. For creators, it means your best ideas do not disappear after publish day. Your content becomes discoverable and actionable for your audience long after the episode drops.
                </p>
                <p>
                  We are also committed to supporting the creators who make these shows. <a href="/we-heart-podcasters" className="text-primary font-medium hover:underline">Find out how we support podcasters</a>.
                </p>
                <p className="text-foreground font-semibold text-lg">
                  Long live podcasts.
                </p>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-4 sm:px-6 pb-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          data-testid="section-whats-new"
        >
          <div className="flex items-stretch gap-5 flex-col sm:flex-row">
            <div className="flex-1 bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-7 shadow-sm">
              <h3 className="text-lg font-display font-bold mb-2">Constantly improving</h3>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] leading-relaxed mb-4">
                We are constantly improving PodCap -- adding features, refining analysis, and making it easier to stay informed.
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
                Track what is being said across podcasts on the topics that matter to you.
              </p>
              <Link
                href="/topics"
                className="inline-flex items-center gap-1.5 text-base font-bold text-primary hover:text-primary/80 transition-colors"
                data-testid="link-browse-topics"
              >
                Explore Topics
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </motion.section>

        <motion.section
          className="max-w-3xl mx-auto px-4 sm:px-6 pb-24"
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
                While you slept, thousands of hours of new podcasts dropped. We distilled them for you.
              </h2>
              <p className="text-lg text-muted-foreground mb-10 max-w-md mx-auto">
                Your intelligence layer for the world's most important conversations.
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <a
                  href="/"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-primary text-white text-base font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:bg-primary/90 transition-all hover:-translate-y-0.5"
                  data-testid="link-cta-get-summaries"
                >
                  Get Started Free
                  <ArrowRight className="w-4 h-4" />
                </a>
                <Link
                  href="/topics"
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
