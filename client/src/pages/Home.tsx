import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Mail, Sparkles, Clock, TrendingUp, Headphones, CheckCircle2, Zap, Flame } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { useAuth } from "@/hooks/use-auth";
import { hiResArtwork } from "@/lib/utils";

const FEATURED_PODCAST_SLUGS = [
  "joerogan", "melrobbins", "hubermanlab", "myfirstmillion",
  "callherdaddy", "acquired", "pivot", "goal-digger",
  "allin", "smartless", "daretolead", "diaryofaceo",
];

function SEOHead() {
  const title = "PodRise — Every Podcast You Follow, Recapped Daily";
  const description = "Get the key takeaways from every new episode delivered to your inbox each morning. Read in 5 minutes, stay informed all day. Free forever.";

  if (typeof document !== "undefined") {
    document.title = title;
    const setOrCreate = (selector: string, attr: string, value: string) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement("meta");
        const [k, v] = attr === "name" ? ["name", selector.match(/name="([^"]+)"/)?.[1] || ""] : ["property", selector.match(/property="([^"]+)"/)?.[1] || ""];
        el.setAttribute(k, v);
        document.head.appendChild(el);
      }
      el.setAttribute("content", value);
    };
    setOrCreate('meta[name="description"]', "name", description);
    setOrCreate('meta[property="og:title"]', "property", title);
    setOrCreate('meta[property="og:description"]', "property", description);
    setOrCreate('meta[property="og:image"]', "property", "https://podrise.com/podrise-og-image.png");
    setOrCreate('meta[name="twitter:card"]', "name", "summary_large_image");
    setOrCreate('meta[name="twitter:title"]', "name", title);
    setOrCreate('meta[name="twitter:description"]', "name", description);
  }
  return null;
}

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.12 } } },
  item: { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] } } },
};

function EmailRecapPreview() {
  const [artworkFailed, setArtworkFailed] = useState(false);
  const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 30, rotateX: 8 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.3 : 0.7, delay: prefersReducedMotion ? 0.15 : 0.5, ease: [0.25, 0.1, 0.25, 1] }}
      className="w-full max-w-md mx-auto lg:mx-0"
      style={{ perspective: 1200 }}
      data-testid="card-email-recap-preview"
    >
      <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-primary/[0.12]">
        <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-primary/30 via-accent/20 to-primary/20 pointer-events-none" />

        <div className="relative bg-card/95 backdrop-blur-sm rounded-2xl border border-white/20">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Headphones className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-[14px] font-bold text-foreground tracking-[-0.01em]">PodRise</span>
            </div>
            <span className="text-[12px] text-muted-foreground font-medium">Daily Recap</span>
          </div>

          <div className="px-5 py-4">
            <div className="flex items-start gap-3.5 mb-4">
              {artworkFailed ? (
                <div className="w-[52px] h-[52px] rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Flame className="w-6 h-6 text-white" />
                </div>
              ) : (
                <img
                  src="/artwork/entrepreneursonfire.jpg"
                  alt="Entrepreneurs on Fire"
                  className="w-[52px] h-[52px] rounded-xl object-cover flex-shrink-0 shadow-sm"
                  onError={() => setArtworkFailed(true)}
                />
              )}
              <div className="min-w-0">
                <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-primary">Entrepreneurs On Fire</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">21 min · Mar 16, 2026 · with Rachel Dove</p>
              </div>
            </div>

            <h3 className="text-[15px] sm:text-[16px] font-bold text-foreground leading-snug mb-4 tracking-[-0.01em]">
              From Fired to Famous — Airbnb Employee Writes Best-Selling Book for Hosts
            </h3>

            <div className="rounded-xl bg-gradient-to-br from-primary/[0.04] to-accent/[0.03] border border-primary/[0.08] p-4">
              <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-primary mb-3">Key Takeaways</p>
              <ul className="space-y-2.5">
                {[
                  "Airbnb's culture fueled creativity that led to an entrepreneurial breakthrough outside the company",
                  "Providing excellent guest experiences is crucial for hosts to boost rankings and drive repeat bookings",
                  "Direct bookings are a growing trend helping hosts bypass platform fees and improve margins",
                ].map((point, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[13px] sm:text-[13.5px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.55]">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/50 flex-shrink-0" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="px-5 py-3 border-t border-border/50 flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground font-medium">+ 4 more recaps in today's email</span>
            <span className="text-[12px] font-semibold text-primary">Read full recap →</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function RegisterCTA({ testIdPrefix, label = "Get Started" }: { testIdPrefix: string; label?: string }) {
  return (
    <a
      href="https://podrise.com/register"
      className="inline-flex items-center justify-center gap-2 px-6 sm:px-7 py-3 sm:py-3.5 rounded-xl bg-gradient-to-r from-[#6366F1] to-[#7C3AED] text-white text-[15px] font-bold hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-[1px] transition-all duration-200 active:scale-[0.97] whitespace-nowrap"
      style={{ minHeight: '48px' }}
      data-testid={`button-${testIdPrefix}-register`}
    >
      {label}
      <ArrowRight className="w-4 h-4" />
    </a>
  );
}

export default function Home() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  if (user) {
    navigate("/dashboard");
    return null;
  }

  const featuredPodcasts = FEATURED_PODCAST_SLUGS
    .map(slug => PODCAST_LANDINGS.find(p => p.slug === slug))
    .filter(Boolean) as typeof PODCAST_LANDINGS;

  return (
    <div className="min-h-screen flex flex-col bg-background overflow-x-clip">
      <SEOHead />
      <SiteHeader />

      <main className="flex-1">

        {/* ── Hero ── */}
        <section className="w-full max-w-6xl mx-auto px-5 sm:px-6 pt-14 sm:pt-20 lg:pt-24 pb-14 sm:pb-18 lg:pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 lg:gap-14 items-start">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={stagger.container}
              className="flex flex-col items-center lg:items-start text-center lg:text-left gap-5 sm:gap-6"
              style={{ gridColumn: '1', gridRow: '1' }}
            >
              <motion.div variants={stagger.item}>
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/[0.07] border border-primary/[0.12] text-primary text-[13px] sm:text-[14px] font-semibold uppercase tracking-[0.08em]" data-testid="badge-tagline">
                  <Mail className="w-3.5 h-3.5" />
                  Daily Podcast Recaps
                </span>
              </motion.div>

              <motion.h1
                variants={stagger.item}
                className="text-[1.625rem] sm:text-[2.25rem] md:text-[2.75rem] lg:text-[3rem] font-display font-extrabold text-foreground leading-[1.08] tracking-[-0.035em] max-w-[640px]"
                data-testid="text-headline"
              >
                Every podcast you follow,
                <span className="bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] bg-clip-text text-transparent"> recapped daily</span>
              </motion.h1>

              <motion.p
                variants={stagger.item}
                className="text-[15px] sm:text-[17px] lg:text-[18px] text-[#52525B] dark:text-[#A1A1AA] max-w-[480px] leading-[1.6] font-medium"
                data-testid="text-subheadline"
              >
                Get the key takeaways from every new episode delivered to your inbox each morning. Read in 5 minutes, stay informed all day.
              </motion.p>
            </motion.div>

            <div className="lg:row-span-2 lg:pt-4">
              <EmailRecapPreview />
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.36, ease: [0.25, 0.1, 0.25, 1] }}
              className="flex flex-col items-center lg:items-start gap-3"
            >
              <RegisterCTA testIdPrefix="hero" />
              <p className="text-[14px] text-muted-foreground/70" data-testid="text-hero-note">
                Free forever. No credit card required.
              </p>
            </motion.div>
          </div>
        </section>

        {/* ── How It Works ── */}
        <section className="w-full max-w-5xl mx-auto px-5 sm:px-6 pb-16 sm:pb-20 lg:pb-24">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.4 }} className="text-center mb-8 sm:mb-10">
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-primary mb-2.5">How it works</p>
            <h2 className="text-[1.375rem] sm:text-[1.75rem] lg:text-[2rem] font-display font-extrabold text-foreground tracking-[-0.02em]" data-testid="text-how-it-works-heading">
              From subscribe to smart in three steps
            </h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger.container}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5"
          >
            {[
              { step: 1, icon: Headphones, title: "Pick your podcasts", desc: "Choose from hundreds of top shows across business, tech, health, and culture." },
              { step: 2, icon: Zap, title: "We recap every episode", desc: "New episode drops? We distill it into key takeaways and notable quotes — instantly." },
              { step: 3, icon: Mail, title: "Read your daily briefing", desc: "One email each morning with every recap. Read over coffee, stay informed all day." },
            ].map((card) => (
              <motion.div
                key={card.step}
                variants={stagger.item}
                className="relative bg-card border border-border rounded-2xl p-6 sm:p-7 flex flex-col gap-3.5 hover:border-primary/15 hover:shadow-lg hover:shadow-primary/[0.04] transition-all duration-300"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-accent/10 flex items-center justify-center flex-shrink-0">
                    <card.icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-primary/50">Step {card.step}</span>
                </div>
                <h3 className="text-[16px] sm:text-[17px] font-display font-bold text-foreground leading-snug" data-testid={`text-value-prop-${card.step}`}>
                  {card.title}
                </h3>
                <p className="text-[14px] sm:text-[15px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed">
                  {card.desc}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* ── Why People Love PodRise ── */}
        <section className="w-full py-14 sm:py-16 lg:py-20 border-y border-border bg-gradient-to-b from-card/60 to-background" data-testid="section-why-podrise">
          <div className="max-w-5xl mx-auto px-5 sm:px-6">
            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
              <div className="text-center mb-8 sm:mb-10">
                <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-primary mb-2.5">Why PodRise</p>
                <h2 className="text-[1.375rem] sm:text-[1.75rem] lg:text-[2rem] font-display font-extrabold text-foreground tracking-[-0.02em]" data-testid="text-why-heading">
                  More podcasts, less time. We solve that.
                </h2>
              </div>

              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={stagger.container}
                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
              >
                {[
                  { icon: Clock, title: "Save hours every week", desc: "Key insights from every episode, every podcast — in one daily email." },
                  { icon: CheckCircle2, title: "Never fall behind", desc: "Industry trends, career advice, personal growth — always know what's being discussed." },
                  { icon: TrendingUp, title: "Stay ahead at work", desc: "Know what leaders in your field are saying before your colleagues do." },
                  { icon: Sparkles, title: "Catch the signal", desc: "We surface the topics, people, and ideas that matter across all your shows." },
                ].map((item) => (
                  <motion.div
                    key={item.title}
                    variants={stagger.item}
                    className="flex gap-3.5 p-5 sm:p-6 bg-card border border-border rounded-xl hover:border-primary/15 hover:shadow-md transition-all duration-300"
                    data-testid={`card-why-${item.title.slice(0, 10).replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/12 to-accent/8 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <item.icon className="w-[18px] h-[18px] text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[15px] sm:text-[16px] font-bold text-foreground leading-snug">{item.title}</h3>
                      <p className="text-[13px] sm:text-[14px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed mt-1">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ── Featured Podcasts ── */}
        <section className="w-full py-16 sm:py-20 lg:py-24" data-testid="section-featured-podcasts">
          <div className="max-w-7xl mx-auto px-5 sm:px-6">
            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.4 }} className="text-center mb-8 sm:mb-10">
              <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-primary mb-2.5">Popular podcasts</p>
              <h2 className="text-[1.375rem] sm:text-[1.75rem] lg:text-[2rem] font-display font-extrabold text-foreground tracking-[-0.02em]" data-testid="text-podcasts-heading">
                Hundreds of top shows, recapped daily
              </h2>
              <p className="text-[14px] sm:text-[15px] text-[#52525B] dark:text-[#A1A1AA] mt-2.5 max-w-md mx-auto leading-relaxed">
                Business, tech, health, culture, and more — pick what you care about.
              </p>
            </motion.div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-5">
              {featuredPodcasts.map((podcast, i) => (
                <motion.div
                  key={podcast.slug}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: i * 0.04, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  <div
                    className="group cursor-pointer"
                    onClick={() => navigate(`/podcasts/${podcast.slug}`)}
                    data-testid={`card-podcast-${podcast.slug}`}
                  >
                    <div className="relative rounded-2xl overflow-hidden shadow-sm shadow-black/[0.06] border border-border group-hover:shadow-lg group-hover:shadow-black/[0.08] group-hover:-translate-y-1 transition-all duration-300">
                      <img
                        src={hiResArtwork(podcast.artworkUrl)}
                        alt={podcast.name}
                        className="w-full aspect-square object-cover group-hover:scale-[1.04] transition-transform duration-500 ease-out"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                        <span className="text-white text-[14px] sm:text-[15px] font-bold">View Recaps →</span>
                      </div>
                    </div>
                    <p className="mt-2 text-[13px] sm:text-[14px] font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors duration-200">
                      {podcast.name}
                    </p>
                    <p className="text-[12px] sm:text-[13px] text-[#71717A] dark:text-[#A1A1AA] mt-0.5 line-clamp-1">{podcast.category}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="text-center mt-10 sm:mt-12">
              <button
                data-testid="button-view-all-podcasts"
                onClick={() => navigate("/podcasts")}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-card border-2 border-border text-[15px] font-bold text-foreground hover:border-foreground/15 hover:bg-muted/40 hover:-translate-y-[1px] transition-all duration-200 min-h-[48px]"
              >
                Browse all podcasts
                <ArrowRight className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>
        </section>

        {/* ── Bottom CTA ── */}
        <section className="w-full py-12 sm:py-14 lg:py-16" data-testid="section-cta-bottom">
          <div className="max-w-3xl mx-auto px-5 sm:px-6">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
              className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary/[0.03] px-6 sm:px-10 py-10 sm:py-12 text-center"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-accent/[0.04] pointer-events-none" />
              <div className="relative flex flex-col items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-accent/10 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-[1.25rem] sm:text-[1.5rem] lg:text-[1.75rem] font-display font-extrabold text-foreground tracking-[-0.02em] leading-[1.15]" data-testid="text-cta-heading">
                  Your daily podcast briefing starts tomorrow
                </h2>
                <RegisterCTA testIdPrefix="bottom-cta" label="Get Started Free" />
                <p className="text-[13px] text-muted-foreground/60">No credit card required. Unsubscribe anytime.</p>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
