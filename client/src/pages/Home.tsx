import { useLocation, Link } from "wouter";
import { ArrowRight, Mail, Sparkles, Clock, Users, TrendingUp, Building2, Mic, Headphones, CheckCircle2, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { EmailSignupBanner } from "@/components/EmailSignupBanner";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { useAuth } from "@/hooks/use-auth";

const FEATURED_PODCAST_SLUGS = [
  "joerogan", "melrobbins", "hubermanlab", "myfirstmillion",
  "callherdaddy", "acquired", "pivot", "goal-digger",
  "allin", "smartless", "daretolead", "diaryofaceo",
];

function hiResArtwork(url: string) {
  return url.replace(/\/\d+x\d+bb\./, "/300x300bb.");
}

function SEOHead() {
  const title = "PodRise — Daily Recaps of Your Favorite Podcasts, Delivered to Your Inbox";
  const description = "Stay up to date with every podcast you love. PodRise sends you a daily email recap with the key takeaways from every new episode — read it in 5 minutes, stay informed all day.";

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
      <EmailSignupBanner />

      <main className="flex-1">

        {/* ── Hero ── */}
        <section className="w-full max-w-4xl mx-auto text-center px-5 sm:px-6 pt-14 sm:pt-20 lg:pt-24 pb-14 sm:pb-18 lg:pb-20">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger.container}
            className="flex flex-col items-center gap-5 sm:gap-6"
          >
            <motion.div variants={stagger.item}>
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/[0.07] border border-primary/[0.12] text-primary text-[13px] sm:text-[14px] font-semibold uppercase tracking-[0.08em]" data-testid="badge-tagline">
                <Mail className="w-3.5 h-3.5" />
                Daily Podcast Recaps
              </span>
            </motion.div>

            <motion.h1
              variants={stagger.item}
              className="text-[1.625rem] sm:text-[2.25rem] md:text-[2.75rem] lg:text-[3rem] font-display font-extrabold text-foreground leading-[1.08] tracking-[-0.035em] max-w-[720px]"
              data-testid="text-headline"
            >
              Stay up to date with every podcast you love
              <span className="bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] bg-clip-text text-transparent"> — in 5 minutes a day</span>
            </motion.h1>

            <motion.p
              variants={stagger.item}
              className="text-[16px] sm:text-[18px] lg:text-[19px] text-[#52525B] dark:text-[#A1A1AA] max-w-[580px] leading-[1.6] font-medium"
              data-testid="text-subheadline"
            >
              Pick your favorite podcasts, and we'll send you a daily email with the key takeaways from every new episode. No more falling behind.
            </motion.p>

            <motion.div variants={stagger.item} className="flex flex-col sm:flex-row items-center gap-3 mt-1 w-full sm:w-auto">
              <button
                data-testid="button-hero-get-started"
                onClick={() => navigate("/register")}
                className="w-full sm:w-auto min-h-[52px] px-8 flex items-center justify-center gap-2.5 rounded-xl font-display font-bold text-[16px] bg-gradient-to-r from-[#6366F1] to-[#7C3AED] text-white hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-[1px] transition-all duration-200 active:scale-[0.98]"
              >
                Start Getting Daily Recaps
                <ArrowRight className="w-[18px] h-[18px]" />
              </button>
              <button
                data-testid="button-hero-browse"
                onClick={() => navigate("/podcasts")}
                className="w-full sm:w-auto min-h-[52px] px-6 flex items-center justify-center gap-2.5 rounded-xl font-display font-bold text-[16px] border-2 border-border text-foreground hover:border-foreground/20 hover:bg-muted/40 transition-all duration-200 active:scale-[0.98]"
              >
                <Headphones className="w-[18px] h-[18px]" />
                Browse Podcasts
              </button>
            </motion.div>

            <motion.p variants={stagger.item} className="text-[14px] text-muted-foreground/70" data-testid="text-hero-note">
              Free forever. No credit card required.
            </motion.p>
          </motion.div>
        </section>

        {/* ── How It Works ── */}
        <section className="w-full max-w-6xl mx-auto px-5 sm:px-6 pb-16 sm:pb-20 lg:pb-24">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.4 }} className="text-center mb-8 sm:mb-10">
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-primary mb-2.5">How it works</p>
            <h2 className="text-[1.375rem] sm:text-[1.75rem] lg:text-[2rem] font-display font-extrabold text-foreground tracking-[-0.02em]" data-testid="text-how-it-works-heading">
              Three steps to never miss a podcast insight again
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
              { step: 1, icon: Headphones, title: "Pick the podcasts you love", desc: "Choose from hundreds of top podcasts across business, tech, health, culture, and more — or browse by industry, interest, or role." },
              { step: 2, icon: Zap, title: "We recap every new episode", desc: "As soon as a new episode drops, we distill it into key takeaways, notable quotes, and everything you need to know — in minutes, not hours." },
              { step: 3, icon: Mail, title: "Get your daily email briefing", desc: "Every morning, one email with recaps of all your podcasts' latest episodes. Read it over coffee and start your day fully informed." },
            ].map((card) => (
              <motion.div
                key={card.step}
                variants={stagger.item}
                className="relative bg-card border border-border rounded-2xl p-6 sm:p-7 flex flex-col gap-4 hover:border-primary/15 hover:shadow-lg hover:shadow-primary/[0.04] transition-all duration-300"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/15 to-accent/10 flex items-center justify-center flex-shrink-0">
                    <card.icon className="w-[22px] h-[22px] text-primary" />
                  </div>
                  <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-primary/50">Step {card.step}</span>
                </div>
                <h3 className="text-[17px] sm:text-[18px] font-display font-bold text-foreground leading-snug" data-testid={`text-value-prop-${card.step}`}>
                  {card.title}
                </h3>
                <p className="text-[15px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed">
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
                  The podcasts you follow keep growing. Your free time doesn't.
                </h2>
                <p className="text-[15px] sm:text-[16px] text-[#52525B] dark:text-[#A1A1AA] mt-3 max-w-lg mx-auto leading-relaxed">
                  PodRise gives you back the time you wish you had — without missing anything important.
                </p>
              </div>

              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={stagger.container}
                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
              >
                {[
                  { icon: Clock, title: "Save hours every week", desc: "Stop choosing which episodes to skip. Get the key insights from every episode of every podcast you follow, all in one daily email." },
                  { icon: CheckCircle2, title: "Never fall behind", desc: "Whether it's industry trends, career advice, or personal growth — you'll always know what your favorite hosts and guests are talking about." },
                  { icon: TrendingUp, title: "Stay sharp for work", desc: "Use podcast insights to stay ahead in your job. Know what leaders in your field are saying before your colleagues do." },
                  { icon: Sparkles, title: "Discover what matters", desc: "PodRise highlights the topics, people, and ideas being discussed across podcasts — so you catch the signal, not the noise." },
                ].map((item) => (
                  <motion.div
                    key={item.title}
                    variants={stagger.item}
                    className="flex gap-4 p-5 sm:p-6 bg-card border border-border rounded-xl hover:border-primary/15 hover:shadow-md transition-all duration-300"
                    data-testid={`card-why-${item.title.slice(0, 10).replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/12 to-accent/8 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <item.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[16px] sm:text-[17px] font-bold text-foreground leading-snug">{item.title}</h3>
                      <p className="text-[14px] sm:text-[15px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed mt-1.5">{item.desc}</p>
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
                Hundreds of top podcasts, recapped daily
              </h2>
              <p className="text-[15px] sm:text-[16px] text-[#52525B] dark:text-[#A1A1AA] mt-3 max-w-lg mx-auto leading-relaxed">
                From business and technology to health, culture, and personal growth — pick the shows you care about and we'll handle the rest.
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
                    <p className="mt-2.5 text-[14px] sm:text-[15px] font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors duration-200">
                      {podcast.name}
                    </p>
                    <p className="text-[13px] sm:text-[14px] text-[#71717A] dark:text-[#A1A1AA] mt-0.5 line-clamp-1">{podcast.category}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="text-center mt-10 sm:mt-12">
              <button
                data-testid="button-view-all-podcasts"
                onClick={() => navigate("/podcasts")}
                className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl bg-card border-2 border-border text-[16px] font-bold text-foreground hover:border-foreground/15 hover:bg-muted/40 hover:-translate-y-[1px] transition-all duration-200 min-h-[52px]"
              >
                Browse all podcasts
                <ArrowRight className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>
        </section>

        {/* ── Browse By Category ── */}
        <section className="w-full py-14 sm:py-16 lg:py-20 border-y border-border bg-gradient-to-b from-card/40 to-background" data-testid="section-nav-grid">
          <div className="max-w-6xl mx-auto px-5 sm:px-6">
            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.4 }} className="text-center mb-8 sm:mb-10">
              <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-primary mb-2.5">Browse</p>
              <h2 className="text-[1.375rem] sm:text-[1.75rem] lg:text-[2rem] font-display font-extrabold text-foreground tracking-[-0.02em]" data-testid="text-explore-heading">
                Find podcasts for your world
              </h2>
              <p className="text-[15px] sm:text-[16px] text-[#52525B] dark:text-[#A1A1AA] mt-3 max-w-lg mx-auto leading-relaxed">
                Browse by what matters to you and start getting daily recaps right away.
              </p>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger.container}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
            >
              {[
                { href: "/industries", icon: Building2, title: "By Industry", desc: "Tech, finance, healthcare, real estate — get daily recaps from podcasts that cover your industry." },
                { href: "/interests", icon: Sparkles, title: "By Interest", desc: "AI, leadership, personal finance, health — follow the topics you care about across all the best podcasts." },
                { href: "/roles", icon: Users, title: "By Role", desc: "Founder, marketer, engineer, investor — see the podcasts that people in your role are following." },
                { href: "/podcasts", icon: Mic, title: "By Podcast", desc: "Already know what you listen to? Search for specific shows and start getting their recaps delivered daily." },
              ].map((card) => (
                <motion.div key={card.href} variants={stagger.item}>
                  <Link href={card.href} className="block h-full">
                    <div
                      className="group bg-card border border-border rounded-xl p-5 sm:p-6 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/[0.04] hover:-translate-y-[2px] transition-all duration-300 cursor-pointer h-full"
                      data-testid={`nav-card-${card.title.split(' ')[1]?.toLowerCase()}`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/12 to-accent/8 flex items-center justify-center mb-3.5">
                        <card.icon className="w-5 h-5 text-primary" />
                      </div>
                      <h3 className="text-[16px] sm:text-[17px] font-bold text-foreground group-hover:text-primary transition-colors duration-200">{card.title}</h3>
                      <p className="text-[14px] sm:text-[15px] text-[#52525B] dark:text-[#A1A1AA] mt-1.5 leading-relaxed">{card.desc}</p>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── Vision ── */}
        <section className="w-full relative overflow-hidden py-16 sm:py-20 lg:py-24" data-testid="section-vision">
          <div className="absolute inset-0 bg-foreground" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(99,102,241,0.15),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(139,92,246,0.1),transparent_60%)]" />

          <div className="relative max-w-3xl mx-auto px-5 sm:px-6 text-center">
            <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }} className="flex flex-col items-center gap-5 sm:gap-6">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.08] border border-white/[0.08] flex items-center justify-center">
                <Headphones className="w-6 h-6 text-white/70" />
              </div>
              <h2 className="text-[1.375rem] sm:text-[1.75rem] lg:text-[2rem] font-display font-extrabold text-white leading-[1.12] tracking-[-0.02em]" data-testid="text-vision-heading">
                You love podcasts. You just don't have time to listen to all of them.
              </h2>
              <div className="flex flex-col gap-4 max-w-xl">
                <p className="text-[15px] sm:text-[17px] text-white/60 leading-[1.7]">
                  The average podcast listener follows 7 shows but only has time to listen to 2 or 3. That means you're constantly missing episodes packed with ideas, trends, and conversations that matter.
                </p>
                <p className="text-[15px] sm:text-[17px] text-white/60 leading-[1.7]">
                  PodRise fixes that. We recap every episode of every podcast you follow and deliver it all to your inbox each morning — so you stay fully up to date without needing an extra hour in the day.
                </p>
              </div>
              <a
                href="/about"
                className="inline-flex items-center gap-2 text-[15px] font-semibold text-white/40 hover:text-white/80 transition-colors duration-200 mt-1 min-h-[44px]"
                data-testid="link-about-vision"
              >
                Read our story
                <ArrowRight className="w-4 h-4" />
              </a>
            </motion.div>
          </div>
        </section>

        {/* ── Bottom CTA ── */}
        <section className="w-full py-16 sm:py-20 lg:py-24" data-testid="section-cta-bottom">
          <div className="max-w-3xl mx-auto px-5 sm:px-6 text-center">
            <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }} className="flex flex-col items-center gap-5 sm:gap-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/12 to-accent/8 flex items-center justify-center">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-[1.375rem] sm:text-[1.75rem] lg:text-[2rem] font-display font-extrabold text-foreground tracking-[-0.02em] leading-[1.12]" data-testid="text-cta-heading">
                Your favorite podcasts, recapped and delivered every morning
              </h2>
              <p className="text-[15px] sm:text-[16px] text-[#52525B] dark:text-[#A1A1AA] max-w-lg leading-relaxed">
                Sign up free, pick the podcasts you want to follow, and tomorrow morning you'll wake up to a daily recap of everything you missed — the key insights, notable quotes, and takeaways that matter.
              </p>
              <button
                data-testid="button-bottom-cta"
                onClick={() => navigate("/register")}
                className="min-h-[52px] px-8 flex items-center justify-center gap-2.5 rounded-xl font-display font-bold text-[16px] bg-gradient-to-r from-[#6366F1] to-[#7C3AED] text-white hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-[1px] transition-all duration-200 active:scale-[0.98]"
              >
                Get Your Daily Recap — Free
                <ArrowRight className="w-[18px] h-[18px]" />
              </button>
              <p className="text-[13px] sm:text-[14px] text-muted-foreground/60">No credit card required. Unsubscribe anytime.</p>
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
