import { useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Headphones, Zap, Mail, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/use-auth";

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.12 } } },
  item: { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] } } },
};

function SEOHead() {
  const title = "How It Works | PodRise — Daily Podcast Recaps in 3 Simple Steps";
  const description = "Pick your favorite podcasts, and PodRise sends you a daily email recap with the key takeaways from every new episode. Free forever. No credit card required.";

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

const steps = [
  {
    step: 1,
    icon: Headphones,
    title: "Pick the podcasts you love",
    desc: "Choose from hundreds of top podcasts across business, tech, health, culture, and more. Browse by industry, interest, or role to find exactly what matters to you.",
  },
  {
    step: 2,
    icon: Zap,
    title: "We recap every new episode",
    desc: "As soon as a new episode drops, we distill it into key takeaways, notable quotes, and everything you need to know — in minutes, not hours.",
  },
  {
    step: 3,
    icon: Mail,
    title: "Get your daily email briefing",
    desc: "Every morning, one beautifully formatted email with recaps of all your podcasts' latest episodes. Read it over coffee and start your day fully informed.",
  },
];

export default function HowItWorks() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();

  useEffect(() => {
    if (user) {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  if (user) return null;

  return (
    <div className="min-h-screen flex flex-col bg-background overflow-x-clip">
      <SEOHead />
      <SiteHeader />

      <main className="flex-1">

        <section className="w-full max-w-4xl mx-auto text-center px-5 sm:px-6 pt-16 sm:pt-24 lg:pt-28 pb-12 sm:pb-16">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger.container}
            className="flex flex-col items-center gap-5 sm:gap-6"
          >
            <motion.div variants={stagger.item}>
              <span
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/[0.07] border border-primary/[0.12] text-primary text-[13px] sm:text-[14px] font-semibold uppercase tracking-[0.08em]"
                data-testid="badge-how-it-works"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Simple by Design
              </span>
            </motion.div>

            <motion.h1
              variants={stagger.item}
              className="text-[1.625rem] sm:text-[2.25rem] md:text-[2.75rem] lg:text-[3rem] font-display font-extrabold text-foreground leading-[1.08] tracking-[-0.035em] max-w-[720px]"
              data-testid="text-how-it-works-title"
            >
              Stay informed in
              <span className="bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] bg-clip-text text-transparent"> three simple steps</span>
            </motion.h1>

            <motion.p
              variants={stagger.item}
              className="text-[16px] sm:text-[18px] lg:text-[19px] text-[#52525B] dark:text-[#A1A1AA] max-w-[560px] leading-[1.6] font-medium"
              data-testid="text-how-it-works-subtitle"
            >
              No apps to download. No feeds to check. Just the insights you care about, delivered to your inbox every morning.
            </motion.p>
          </motion.div>
        </section>

        <section className="w-full max-w-4xl mx-auto px-5 sm:px-6 pb-20 sm:pb-24 lg:pb-28">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger.container}
            className="flex flex-col gap-6 sm:gap-8"
          >
            {steps.map((card) => (
              <motion.div
                key={card.step}
                variants={stagger.item}
                className="relative bg-card border border-border rounded-2xl p-7 sm:p-9 flex flex-col sm:flex-row items-start gap-5 sm:gap-7 hover:border-primary/15 hover:shadow-lg hover:shadow-primary/[0.04] transition-all duration-300"
                data-testid={`card-step-${card.step}`}
              >
                <div className="flex-shrink-0">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10 flex items-center justify-center">
                    <card.icon className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-primary/50">
                    Step {card.step}
                  </span>
                  <h2
                    className="text-[20px] sm:text-[22px] font-display font-bold text-foreground leading-snug"
                    data-testid={`text-step-title-${card.step}`}
                  >
                    {card.title}
                  </h2>
                  <p className="text-[15px] sm:text-[16px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed max-w-[520px]">
                    {card.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        <section className="w-full max-w-4xl mx-auto px-5 sm:px-6 pb-20 sm:pb-28 lg:pb-32">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
            className="text-center flex flex-col items-center gap-5 sm:gap-6"
          >
            <h2
              className="text-[1.375rem] sm:text-[1.75rem] lg:text-[2rem] font-display font-extrabold text-foreground tracking-[-0.02em] max-w-[600px]"
              data-testid="text-cta-heading"
            >
              That's it. Ready to get started?
            </h2>
            <p
              className="text-[16px] sm:text-[18px] text-[#52525B] dark:text-[#A1A1AA] max-w-[480px] leading-[1.6] font-medium"
              data-testid="text-cta-subheading"
            >
              Join thousands of professionals who save hours every week with daily podcast recaps.
            </p>

            <button
              data-testid="button-cta-sign-up"
              onClick={() => navigate("/register")}
              className="min-h-[52px] px-10 flex items-center justify-center gap-2.5 rounded-xl font-display font-bold text-[16px] bg-gradient-to-r from-[#6366F1] to-[#7C3AED] text-white hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-[1px] transition-all duration-200 active:scale-[0.98]"
            >
              Start Getting Daily Recaps
              <ArrowRight className="w-[18px] h-[18px]" />
            </button>

            <p
              className="text-[14px] text-muted-foreground/70"
              data-testid="text-cta-reassurance"
            >
              Free forever. No credit card required.
            </p>
          </motion.div>
        </section>

      </main>

      <Footer />
    </div>
  );
}