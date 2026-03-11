import { useLocation, Link } from "wouter";
import { ArrowRight, Search, Sparkles, Library, Users, TrendingUp, BarChart3, Globe, Building2, Mic, BookOpen } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Footer } from "@/components/Footer";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { PEOPLE_DIRECTORY } from "@/data/entityDirectoryData";
import { PodCapWordmark } from "@/components/PodCapHeader";

const FEATURED_PODCAST_SLUGS = [
  "joerogan", "melrobbins", "hubermanlab", "myfirstmillion",
  "callherdaddy", "acquired", "pivot", "goal-digger",
  "allin", "smartless", "daretolead", "diaryofaceo",
];

const FEATURED_PEOPLE_SLUGS = [
  "elon-musk", "mel-robbins", "andrew-huberman", "kara-swisher",
  "alex-hormozi", "brene-brown", "sam-altman", "codie-sanchez",
  "scott-galloway", "hala-taha", "tim-ferriss", "alex-cooper",
];

function hiResArtwork(url: string) {
  return url.replace(/\/\d+x\d+bb\./, "/300x300bb.");
}

function SEOHead() {
  const title = "PodCap — Podcast Intelligence for Decision-Makers";
  const description = "PodCap tracks, analyzes, and synthesizes the world's most influential podcasts. Search transcripts, discover insights by topic, company, or person, and get analyst-grade briefings delivered to your inbox.";

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
  }
  return null;
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

  const featuredPeople = FEATURED_PEOPLE_SLUGS
    .map(slug => PEOPLE_DIRECTORY.find(p => p.slug === slug))
    .filter(Boolean);

  const totalPodcasts = PODCAST_LANDINGS.length;
  const totalPeople = PEOPLE_DIRECTORY.length;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead />

      <header className="w-full px-6 min-h-[68px] flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center" data-testid="link-home">
          <PodCapWordmark />
        </a>
        <div className="flex items-center gap-2">
          <button
            data-testid="link-browse-nav"
            onClick={() => navigate("/podcasts")}
            className="text-[15px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors min-h-[44px] px-3 hidden sm:block"
          >
            Browse
          </button>
          <button
            data-testid="link-topics-nav"
            onClick={() => navigate("/topics")}
            className="text-[15px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors min-h-[44px] px-3 hidden sm:block"
          >
            Topics
          </button>
          <button
            data-testid="link-login-nav"
            onClick={() => navigate("/login")}
            className="text-[15px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors min-h-[44px] px-3"
          >
            Log in
          </button>
          <button
            data-testid="link-create-account-nav"
            onClick={() => navigate("/get-started")}
            className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background rounded-lg text-[15px] font-semibold hover:bg-foreground/90 transition-colors min-h-[44px]"
          >
            Create Account
          </button>
        </div>
      </header>

      <main className="flex-1">

        <section className="w-full max-w-4xl mx-auto text-center px-4 sm:px-6 pt-16 sm:pt-24 pb-16 sm:pb-20">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="flex flex-col items-center gap-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/[0.06] border border-primary/10 text-primary text-[13px] font-semibold uppercase tracking-wider" data-testid="badge-tagline">
              <BarChart3 className="w-3.5 h-3.5" />
              Podcast Intelligence Platform
            </div>
            <h1 className="text-[2.5rem] sm:text-[3.25rem] md:text-[3.75rem] font-display font-extrabold text-foreground leading-[1.06] tracking-[-0.03em] max-w-3xl" data-testid="text-headline">
              The world's searchable library of podcast knowledge
            </h1>
            <p className="text-lg sm:text-xl text-[#3F3F46] dark:text-[#A1A1AA] max-w-2xl leading-relaxed font-medium" data-testid="text-subheadline">
              We track, analyze, and synthesize everything being said across the world's most influential podcasts. Search transcripts, discover insights by topic, and get analyst-grade briefings — without listening to every episode.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
              <button
                data-testid="button-hero-explore"
                onClick={() => navigate("/podcasts")}
                className="min-h-[52px] px-8 flex items-center justify-center gap-2 rounded-[10px] font-display font-bold text-[17px] bg-foreground text-background hover:bg-foreground/90 transition-all active:scale-[0.98]"
              >
                Explore Podcasts
                <ArrowRight className="w-5 h-5" />
              </button>
              <button
                data-testid="button-hero-topics"
                onClick={() => navigate("/topics")}
                className="min-h-[52px] px-8 flex items-center justify-center gap-2 rounded-[10px] font-display font-bold text-[17px] bg-card border-2 border-border text-foreground hover:bg-muted/60 transition-colors"
              >
                Browse Topics
              </button>
            </div>
          </motion.div>
        </section>

        <section className="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-20 sm:pb-24">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-card border border-border rounded-2xl p-7 sm:p-8 flex flex-col gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Search className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-display font-bold text-foreground" data-testid="text-value-prop-1">Search every conversation</h3>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] leading-relaxed">
                Full transcripts, indexed and searchable. Find exactly what was said about any topic, company, or person across thousands of podcast episodes.
              </p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-7 sm:p-8 flex flex-col gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-display font-bold text-foreground" data-testid="text-value-prop-2">Analyst-grade briefings</h3>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] leading-relaxed">
                Every episode distilled into structured intelligence: key arguments, notable quotes, companies discussed, and actionable takeaways you can act on.
              </p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-7 sm:p-8 flex flex-col gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-display font-bold text-foreground" data-testid="text-value-prop-3">Intelligence, delivered</h3>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] leading-relaxed">
                Subscribe to any podcast and receive daily briefings in your inbox. Like having a research analyst digesting every episode and sending you what matters.
              </p>
            </div>
          </motion.div>
        </section>

        <section className="w-full bg-card/50 border-y border-border py-16 sm:py-20" data-testid="section-coverage">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              <div>
                <p className="text-3xl sm:text-4xl font-display font-extrabold text-foreground" data-testid="stat-podcasts">{totalPodcasts}+</p>
                <p className="text-[15px] text-[#3F3F46] dark:text-[#A1A1AA] mt-1 font-medium">Podcasts tracked</p>
              </div>
              <div>
                <p className="text-3xl sm:text-4xl font-display font-extrabold text-foreground" data-testid="stat-people">{totalPeople}+</p>
                <p className="text-[15px] text-[#3F3F46] dark:text-[#A1A1AA] mt-1 font-medium">People profiled</p>
              </div>
              <div>
                <p className="text-3xl sm:text-4xl font-display font-extrabold text-foreground" data-testid="stat-episodes">1,000+</p>
                <p className="text-[15px] text-[#3F3F46] dark:text-[#A1A1AA] mt-1 font-medium">Episodes analyzed</p>
              </div>
              <div>
                <p className="text-3xl sm:text-4xl font-display font-extrabold text-foreground" data-testid="stat-topics">30+</p>
                <p className="text-[15px] text-[#3F3F46] dark:text-[#A1A1AA] mt-1 font-medium">Topics covered</p>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="w-full py-16 sm:py-20" data-testid="section-nav-grid">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground tracking-[-0.02em]" data-testid="text-explore-heading">
                Explore the intelligence layer
              </h2>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-3 max-w-xl mx-auto">
                Navigate podcast knowledge by the dimension that matters most to you.
              </p>
            </motion.div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="/podcasts" className="block">
                <div className="group bg-card border border-border rounded-xl p-6 hover:border-primary/20 hover:shadow-md transition-all cursor-pointer h-full" data-testid="nav-card-podcasts">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                    <Mic className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">Podcasts</h3>
                  <p className="text-[15px] text-[#3F3F46] dark:text-[#A1A1AA] mt-1 leading-relaxed">Browse {totalPodcasts}+ shows with episode recaps, transcripts, and AI-powered analysis.</p>
                </div>
              </Link>
              <Link href="/topics" className="block">
                <div className="group bg-card border border-border rounded-xl p-6 hover:border-primary/20 hover:shadow-md transition-all cursor-pointer h-full" data-testid="nav-card-topics">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                    <TrendingUp className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">Topics</h3>
                  <p className="text-[15px] text-[#3F3F46] dark:text-[#A1A1AA] mt-1 leading-relaxed">Track what's being said across podcasts on AI, crypto, leadership, markets, and more.</p>
                </div>
              </Link>
              <Link href="/people" className="block">
                <div className="group bg-card border border-border rounded-xl p-6 hover:border-primary/20 hover:shadow-md transition-all cursor-pointer h-full" data-testid="nav-card-people">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">People</h3>
                  <p className="text-[15px] text-[#3F3F46] dark:text-[#A1A1AA] mt-1 leading-relaxed">Discover {totalPeople}+ founders, investors, and leaders across the podcast ecosystem.</p>
                </div>
              </Link>
              <Link href="/companies" className="block">
                <div className="group bg-card border border-border rounded-xl p-6 hover:border-primary/20 hover:shadow-md transition-all cursor-pointer h-full" data-testid="nav-card-companies">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">Companies</h3>
                  <p className="text-[15px] text-[#3F3F46] dark:text-[#A1A1AA] mt-1 leading-relaxed">See what's being said about the companies shaping technology, business, and culture.</p>
                </div>
              </Link>
            </div>
          </div>
        </section>

        <section className="w-full bg-card/50 border-y border-border py-16 sm:py-20" data-testid="section-featured-podcasts">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground tracking-[-0.02em]" data-testid="text-podcasts-heading">
                Podcasts we cover
              </h2>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-3 max-w-lg mx-auto">
                From business strategy to science, culture, and technology — we analyze the world's most influential podcast conversations.
              </p>
            </motion.div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
              {featuredPodcasts.map((podcast, i) => (
                <motion.div
                  key={podcast.slug}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                >
                  <div
                    className="group cursor-pointer"
                    onClick={() => navigate(`/podcasts/${podcast.slug}`)}
                    data-testid={`card-podcast-${podcast.slug}`}
                  >
                    <div className="relative rounded-2xl overflow-hidden shadow-sm shadow-black/[0.06] border border-border">
                      <img
                        src={hiResArtwork(podcast.artworkUrl)}
                        alt={podcast.name}
                        className="w-full aspect-square object-cover group-hover:scale-[1.03] transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-3">
                        <span className="text-white text-[15px] font-bold">View Intelligence →</span>
                      </div>
                    </div>
                    <p className="mt-2.5 text-base font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                      {podcast.name}
                    </p>
                    <p className="text-[15px] text-[#3F3F46] dark:text-[#A1A1AA] mt-0.5 line-clamp-1">{podcast.category}</p>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="text-center mt-10">
              <button
                data-testid="button-view-all-podcasts"
                onClick={() => navigate("/podcasts")}
                className="inline-flex items-center gap-2 px-7 py-4 rounded-[10px] bg-card border-2 border-border text-[17px] font-bold text-foreground hover:bg-muted/60 transition-colors min-h-[52px]"
              >
                View all {totalPodcasts}+ podcasts
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </section>

        <section className="w-full py-16 sm:py-20" data-testid="section-featured-people">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground tracking-[-0.02em]" data-testid="text-people-heading">
                Voices shaping the conversation
              </h2>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-3 max-w-lg mx-auto">
                Track what the most influential founders, investors, journalists, and thought leaders are saying across podcasts.
              </p>
            </motion.div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
              {featuredPeople.map((person, i) => (
                <motion.div
                  key={person.slug}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                >
                  <div
                    className="group cursor-pointer flex flex-col items-center text-center"
                    onClick={() => navigate(`/people/${person.slug}`)}
                    data-testid={`card-person-home-${person.slug}`}
                  >
                    <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-border group-hover:border-primary/30 transition-colors shadow-sm">
                      <img
                        src={person.imageUrl}
                        alt={person.name}
                        className="w-full h-full object-cover group-hover:scale-[1.05] transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `/people/default-avatar.png`;
                        }}
                      />
                    </div>
                    <p className="mt-3 text-base font-bold text-foreground group-hover:text-primary transition-colors leading-snug">
                      {person.name}
                    </p>
                    <p className="text-[15px] text-[#3F3F46] dark:text-[#A1A1AA] mt-0.5 line-clamp-2 leading-relaxed">
                      {person.title}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="text-center mt-10">
              <button
                data-testid="button-view-all-people"
                onClick={() => navigate("/people")}
                className="inline-flex items-center gap-2 px-7 py-4 rounded-[10px] bg-card border-2 border-border text-[17px] font-bold text-foreground hover:bg-muted/60 transition-colors min-h-[52px]"
              >
                View all people
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </section>

        <section className="w-full bg-foreground text-background py-16 sm:py-20" data-testid="section-vision">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="flex flex-col items-center gap-6">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                <Library className="w-6 h-6 text-white/80" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-display font-extrabold leading-[1.1] tracking-[-0.02em]" data-testid="text-vision-heading">
                Podcast intelligence for the information age
              </h2>
              <p className="text-base sm:text-lg text-white/70 max-w-xl leading-relaxed">
                Millions of hours of conversations happen across podcasts every year — the sharpest analysis, the most candid insights, the earliest signals on emerging trends. Most of this intelligence is locked inside audio files that decision-makers will never have time to hear.
              </p>
              <p className="text-base sm:text-lg text-white/70 max-w-xl leading-relaxed">
                PodCap is building the infrastructure to make this knowledge searchable, structured, and actionable — turning podcast conversations into a competitive advantage.
              </p>
              <a
                href="/about"
                className="inline-flex items-center gap-2 text-base font-semibold text-white/60 hover:text-white/90 transition-colors mt-2 min-h-[44px]"
                data-testid="link-about-vision"
              >
                Read our story
                <ArrowRight className="w-4 h-4" />
              </a>
            </motion.div>
          </div>
        </section>

        <section className="w-full py-16 sm:py-20" data-testid="section-cta-bottom">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="flex flex-col items-center gap-6">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground tracking-[-0.02em]" data-testid="text-cta-heading">
                Get podcast intelligence delivered
              </h2>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] max-w-lg">
                Choose the podcasts you follow. We'll analyze every new episode and deliver structured briefings to your inbox — key insights, notable quotes, and the takeaways that matter.
              </p>
              <button
                data-testid="button-bottom-cta"
                onClick={() => navigate("/get-started")}
                className="min-h-[52px] px-8 flex items-center justify-center gap-2 rounded-[10px] font-display font-bold text-[17px] bg-foreground text-background hover:bg-foreground/90 transition-all active:scale-[0.98]"
              >
                Create Your Free Account
                <ArrowRight className="w-5 h-5" />
              </button>
              <p className="text-[13px] text-muted-foreground">Free forever. No credit card required.</p>
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
