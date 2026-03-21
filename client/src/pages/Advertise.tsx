import { useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import {
  Megaphone, Target, Mail, Headphones, Globe,
  ArrowRight, Shield, Zap, Mic2, ShoppingBag, Podcast, Users, BarChart3
} from "lucide-react";


const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" },
  }),
};

export default function Advertise() {
  useEffect(() => {
    document.title = "Advertise with PodRise — Hyper-Targeted Podcast Advertising | PodRise";
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.content = content;
    };
    const desc = "Hyper-target ads based on what podcasts people actually listen to. Reach engaged listeners with precision — whether you're a podcaster growing your show or a brand reaching your ideal audience.";
    setMeta("name", "description", desc);
    setMeta("property", "og:title", "Advertise with PodRise — Hyper-Targeted Podcast Advertising | PodRise");
    setMeta("property", "og:description", desc);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:url", "https://podrise.com/advertise");
    setMeta("property", "og:image", "https://podrise.com/og/og-advertise.png");
    setMeta("property", "og:site_name", "PodRise");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:site", "@podrise_hq");
    setMeta("name", "twitter:title", "Advertise with PodRise — Hyper-Targeted Podcast Advertising | PodRise");
    setMeta("name", "twitter:description", desc);
    setMeta("name", "twitter:image", "https://podrise.com/og/og-advertise.png");

    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
    link.href = "https://podrise.com/advertise";
    return () => { if (link) link.remove(); };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />

      <main className="flex-1 w-full">
        {/* Hero */}
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
            We know what they listen to. You decide what they see.
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed mb-10">
            PodRise users tell us exactly which podcasts they follow. That means you can hyper-target ads to the listeners who matter most — with precision no other platform can match.
          </p>
          <a
            href="mailto:advertise@podrise.com?subject=Advertising%20Inquiry"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-primary text-white text-base font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:bg-primary/90 transition-all hover:-translate-y-0.5"
            data-testid="link-contact-advertising"
          >
            Get in Touch
            <ArrowRight className="w-4 h-4" />
          </a>
        </motion.section>

        {/* Hyper-Targeting Section */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-20" data-testid="section-hyper-targeting">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-[1.35rem] sm:text-[1.6rem] font-display font-extrabold tracking-[-0.02em] mb-3" data-testid="text-targeting-title">
              Podcast-based hyper-targeting
            </h2>
            <p className="text-base text-muted-foreground max-w-lg mx-auto">
              Every PodRise user selects the podcasts they follow when they sign up. We use that listening data to deliver your ads to exactly the right audience — no guesswork, no wasted impressions.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-3 gap-5">
            {[
              {
                icon: Headphones,
                title: "Know What They Listen To",
                description: "Users tell us their favorite shows — from true crime and tech to business and wellness. You target listeners of the exact podcasts that align with your audience.",
              },
              {
                icon: Target,
                title: "Precision You Can't Get Elsewhere",
                description: "No other ad platform knows podcast listening preferences at this level. Reach fans of specific shows, genres, or networks with unmatched accuracy.",
              },
              {
                icon: BarChart3,
                title: "Higher Relevance, Better Results",
                description: "Ads matched to listening preferences feel relevant, not intrusive. That means higher engagement, better click-through, and real ROI for every dollar you spend.",
              },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.03] p-6"
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i}
                data-testid={`targeting-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/[0.08] flex items-center justify-center">
                    <item.icon className="w-[18px] h-[18px] text-primary" />
                  </div>
                  <h3 className="text-base font-display font-bold">{item.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Advertiser Types */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-20" data-testid="section-advertiser-types">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-[1.35rem] sm:text-[1.6rem] font-display font-extrabold tracking-[-0.02em] mb-3" data-testid="text-advertiser-types-title">
              Two ways to advertise
            </h2>
            <p className="text-base text-muted-foreground max-w-lg mx-auto">
              Whether you're growing a podcast or promoting a product, PodRise connects you with the listeners who are most likely to care.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Podcasters & Networks — the unique differentiator */}
            <motion.div
              className="rounded-2xl border-2 border-primary/30 bg-primary/[0.03] p-8 flex flex-col relative overflow-hidden"
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={0}
              data-testid="card-podcasters-networks"
            >
              <div className="absolute top-4 right-4">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary bg-primary/[0.1] px-3 py-1.5 rounded-full">
                  <Zap className="w-3 h-3" />
                  Only on PodRise
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary/[0.1] flex items-center justify-center mb-5">
                <Mic2 className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-display font-extrabold mb-3" data-testid="text-podcasters-title">
                Podcasters & Podcast Networks
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5 flex-1">
                This is something you can't do anywhere else. Promote your podcast directly to PodRise listeners who already follow similar shows. Reach people who are actively discovering new podcasts — and put your show in front of the exact audience that's most likely to subscribe.
              </p>
              <ul className="space-y-2.5 mb-6">
                {[
                  { icon: Podcast, text: "Promote your show to fans of similar podcasts" },
                  { icon: Users, text: "Grow your subscriber base with hyper-targeted reach" },
                  { icon: Target, text: "Target by genre, topic, or specific competing shows" },
                  { icon: Mail, text: "Sponsored placements in daily podcast recap emails" },
                ].map((item) => (
                  <li key={item.text} className="flex items-start gap-2.5 text-sm">
                    <item.icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
              <a
                href="mailto:advertise@podrise.com?subject=Podcast%20Advertising%20Inquiry"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:bg-primary/90 transition-all hover:-translate-y-0.5 w-fit"
                data-testid="link-podcasters-cta"
              >
                Promote Your Podcast
                <ArrowRight className="w-4 h-4" />
              </a>
            </motion.div>

            {/* Brands */}
            <motion.div
              className="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.03] p-8 flex flex-col"
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={1}
              data-testid="card-brands"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/[0.08] flex items-center justify-center mb-5">
                <ShoppingBag className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-display font-extrabold mb-3" data-testid="text-brands-title">
                Brands & Products
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5 flex-1">
                Advertise your product or service to podcast listeners who are already interested in your category. Whether it's a SaaS tool for business podcast fans or a wellness product for health show listeners — we match your brand to the right ears.
              </p>
              <ul className="space-y-2.5 mb-6">
                {[
                  { icon: Headphones, text: "Target listeners of podcasts relevant to your product" },
                  { icon: BarChart3, text: "Drive conversions with high-intent, engaged audiences" },
                  { icon: Mail, text: "Sponsored email placements, web ads, and more" },
                  { icon: Globe, text: "Reach across all PodRise surfaces and formats" },
                ].map((item) => (
                  <li key={item.text} className="flex items-start gap-2.5 text-sm">
                    <item.icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
              <a
                href="mailto:advertise@podrise.com?subject=Brand%20Advertising%20Inquiry"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-primary/30 text-primary text-sm font-bold hover:bg-primary/[0.05] transition-all w-fit"
                data-testid="link-brands-cta"
              >
                Advertise Your Brand
                <ArrowRight className="w-4 h-4" />
              </a>
            </motion.div>
          </div>
        </section>

        {/* Privacy Promise */}
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
              Hyper-targeted, never invasive
            </h2>
            <p className="text-base text-muted-foreground max-w-lg mx-auto leading-relaxed">
              PodRise never sells personal information like names or emails to advertisers.
              We use podcast listening preferences to match ads to audience segments — not individuals.
              Advertisers get precision targeting. Users get ads that actually matter to them. Your data stays with us.
            </p>
          </motion.div>
        </section>

        {/* CTA */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-20 text-center" data-testid="section-cta">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-[1.35rem] sm:text-[1.6rem] font-display font-extrabold tracking-[-0.02em] mb-4" data-testid="text-cta-title">
              Ready to reach the right listeners?
            </h2>
            <p className="text-base text-muted-foreground max-w-lg mx-auto mb-8">
              Whether you're a podcaster growing your audience or a brand reaching your ideal customers — we'll connect you with the listeners who matter most.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <a
                href="mailto:advertise@podrise.com?subject=Advertising%20Inquiry"
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
                Learn About PodRise
              </Link>
            </div>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
