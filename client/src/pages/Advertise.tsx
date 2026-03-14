import { useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import {
  Megaphone, Target, Mail, BarChart3, Briefcase, Building2,
  Headphones, Globe, ArrowRight, Shield, TrendingUp, Zap
} from "lucide-react";

const STATS = [
  { label: "Podcasts tracked", value: "275+", icon: Headphones },
  { label: "Episodes analyzed", value: "36,000+", icon: BarChart3 },
  { label: "Topics monitored", value: "50+", icon: Globe },
  { label: "Daily email digests", value: "Thousands", icon: Mail },
];

const TARGETING_OPTIONS = [
  {
    icon: Headphones,
    title: "Podcast Preferences",
    description: "Reach listeners of specific shows. From tech and business podcasts to health, science, and culture — target the exact audience tuned into the conversations that matter to your brand.",
  },
  {
    icon: Briefcase,
    title: "Professional Roles",
    description: "Target by job function — founders, engineers, marketers, product managers, investors, and more. Reach decision-makers where they already spend their attention.",
  },
  {
    icon: Building2,
    title: "Industries",
    description: "Segment by industry verticals like SaaS, fintech, healthcare, e-commerce, and AI. Your message lands with people who live and breathe your market.",
  },
  {
    icon: Target,
    title: "Interest Categories",
    description: "Go beyond demographics. Target users based on the topics they follow — AI, startups, personal finance, leadership, health & wellness, and dozens more.",
  },
];

const AD_FORMATS = [
  {
    icon: Mail,
    title: "Sponsored Email Placements",
    description: "Premium placements inside our daily podcast recap emails. Your message arrives alongside the intelligence our readers start their day with — high attention, high trust.",
    available: true,
  },
  {
    icon: Megaphone,
    title: "Podcast Ad Spots",
    description: "Audio and video ad placements within PodCap-produced podcast content. Reach engaged listeners in the medium they love most.",
    available: false,
  },
  {
    icon: Globe,
    title: "Website Sponsorships",
    description: "Sponsored placements across podcast pages, episode recaps, topic hubs, and the bookstore. High-visibility positions where readers explore and discover.",
    available: false,
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" },
  }),
};

export default function Advertise() {
  useEffect(() => {
    document.title = "Advertise with PodCap - Reach Podcast Listeners at Scale";
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.content = content;
    };
    const desc = "Reach highly engaged podcast listeners through targeted email sponsorships. PodCap delivers precision targeting by podcast, role, industry, and interest — without selling user data.";
    setMeta("name", "description", desc);
    setMeta("property", "og:title", "Advertise with PodCap");
    setMeta("property", "og:description", desc);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:url", "https://podcap.io/advertise");
    setMeta("property", "og:image", "https://podcap.io/favicon.png");
    setMeta("name", "twitter:card", "summary");
    setMeta("name", "twitter:title", "Advertise with PodCap");
    setMeta("name", "twitter:description", desc);
    setMeta("name", "twitter:image", "https://podcap.io/favicon.png");

    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
    link.href = "https://podcap.io/advertise";
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
            <Megaphone className="w-5 h-5" />
            Advertise
          </div>
          <h1 className="text-[1.75rem] sm:text-[2rem] md:text-[2.35rem] font-display font-extrabold tracking-[-0.03em] leading-[1.15] mb-5 max-w-2xl mx-auto" data-testid="text-hero-title">
            Reach the most engaged podcast listeners on the internet
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed mb-10">
            PodCap readers are curious, ambitious professionals who start their day with podcast intelligence.
            Put your brand in front of them with precision targeting they'll actually appreciate.
          </p>
          <a
            href="mailto:advertise@podcap.io?subject=Advertising%20Inquiry"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-primary text-white text-base font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:bg-primary/90 transition-all hover:-translate-y-0.5"
            data-testid="link-contact-advertising"
          >
            Get in Touch
            <ArrowRight className="w-4 h-4" />
          </a>
        </motion.section>

        <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-16" data-testid="section-stats">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {STATS.map((stat, i) => (
              <motion.div
                key={stat.label}
                className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.03] p-5 text-center"
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i}
                data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <stat.icon className="w-5 h-5 text-primary mx-auto mb-2" />
                <div className="text-2xl font-display font-extrabold tracking-tight mb-1">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-20" data-testid="section-why-podcap">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-[1.35rem] sm:text-[1.6rem] font-display font-extrabold tracking-[-0.02em] mb-3" data-testid="text-why-title">
              Why advertise with PodCap?
            </h2>
            <p className="text-base text-muted-foreground max-w-lg mx-auto">
              We know exactly what our readers care about — because they told us. Every user selects their podcasts, roles, industries, and interests when they sign up.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-5">
            {TARGETING_OPTIONS.map((option, i) => (
              <motion.div
                key={option.title}
                className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.03] p-6"
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i}
                data-testid={`targeting-${option.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/[0.08] flex items-center justify-center">
                    <option.icon className="w-[18px] h-[18px] text-primary" />
                  </div>
                  <h3 className="text-base font-display font-bold">{option.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{option.description}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-20" data-testid="section-privacy-promise">
          <motion.div
            className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-8 sm:p-10 text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <Shield className="w-8 h-8 text-primary mx-auto mb-4" />
            <h2 className="text-[1.2rem] sm:text-[1.4rem] font-display font-extrabold tracking-[-0.02em] mb-3" data-testid="text-privacy-promise">
              We never sell your data
            </h2>
            <p className="text-base text-muted-foreground max-w-lg mx-auto leading-relaxed">
              PodCap does not share personal information like names or emails with advertisers.
              Instead, we use the intelligence we have — which podcasts you follow, your role, your industry, and your interests — to show you offers that are genuinely relevant.
              Advertisers reach audience segments, not individuals. Your data stays with us.
            </p>
          </motion.div>
        </section>

        <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-20" data-testid="section-ad-formats">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-[1.35rem] sm:text-[1.6rem] font-display font-extrabold tracking-[-0.02em] mb-3" data-testid="text-formats-title">
              Ad Formats
            </h2>
            <p className="text-base text-muted-foreground max-w-lg mx-auto">
              Multiple ways to reach our audience, from email placements to future podcast and web sponsorships.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-3 gap-5">
            {AD_FORMATS.map((format, i) => (
              <motion.div
                key={format.title}
                className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.03] p-6 flex flex-col"
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i}
                data-testid={`format-${format.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <div className="w-10 h-10 rounded-lg bg-primary/[0.08] flex items-center justify-center mb-4">
                  <format.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-base font-display font-bold mb-2">{format.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1">{format.description}</p>
                <div className="mt-4">
                  {format.available ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary bg-primary/[0.08] px-2.5 py-1 rounded-full">
                      <Zap className="w-3 h-3" />
                      Available Now
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-full">
                      <TrendingUp className="w-3 h-3" />
                      Coming Soon
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-20" data-testid="section-how-it-works">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-[1.35rem] sm:text-[1.6rem] font-display font-extrabold tracking-[-0.02em] mb-3" data-testid="text-how-title">
              How it works
            </h2>
          </motion.div>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { step: "1", title: "Tell us your goals", desc: "Share your target audience, budget, and campaign objectives. We'll recommend the best format and targeting mix." },
              { step: "2", title: "We match your audience", desc: "Using podcast preferences, roles, industries, and interests, we build a segment that aligns perfectly with your ideal customer." },
              { step: "3", title: "Your ad goes live", desc: "Your message reaches thousands of engaged readers in their daily podcast intelligence email — or across our platform." },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                className="text-center"
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i}
              >
                <div className="w-10 h-10 rounded-full bg-primary text-white font-display font-bold text-lg flex items-center justify-center mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="text-base font-display font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-20 text-center" data-testid="section-cta">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-[1.35rem] sm:text-[1.6rem] font-display font-extrabold tracking-[-0.02em] mb-4" data-testid="text-cta-title">
              Ready to reach podcast listeners?
            </h2>
            <p className="text-base text-muted-foreground max-w-lg mx-auto mb-8">
              Whether you're launching a product, growing a newsletter, or building brand awareness — we'll help you reach the right people.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <a
                href="mailto:advertise@podcap.io?subject=Advertising%20Inquiry"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-primary text-white text-base font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:bg-primary/90 transition-all hover:-translate-y-0.5"
                data-testid="link-cta-contact"
              >
                Contact Us
                <ArrowRight className="w-4 h-4" />
              </a>
              <Link
                href="/about"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl border border-black/[0.08] dark:border-white/[0.08] text-base font-bold hover:bg-accent/5 transition-all"
                data-testid="link-learn-more"
              >
                Learn About PodCap
              </Link>
            </div>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
