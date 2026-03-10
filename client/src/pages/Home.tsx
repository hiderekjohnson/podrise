import { useLocation } from "wouter";
import { ArrowRight, Headphones, Search, Sparkles, Library, Users, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Footer } from "@/components/Footer";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { PEOPLE_DIRECTORY } from "@/data/entityDirectoryData";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

const FEATURED_PODCAST_SLUGS = [
  "joerogan", "lexfridman", "hubermanlab", "myfirstmillion", "allin",
  "theprof", "acquired", "shawnryanshow", "morningbrew", "onpurpose",
  "worklifeadamgrant", "smartless",
];

const FEATURED_PEOPLE_SLUGS = [
  "elon-musk", "sam-altman", "andrew-huberman", "alex-hormozi",
  "codie-sanchez", "naval-ravikant", "lex-fridman", "scott-galloway",
  "brene-brown", "tim-ferriss", "mark-cuban", "gary-vaynerchuk",
];

function hiResArtwork(url: string) {
  return url.replace(/\/\d+x\d+bb\./, "/300x300bb.");
}

function SEOHead() {
  const title = "PodCap — The World's Searchable Library of Podcast Knowledge";
  const description = "PodCap turns podcast episodes into searchable, discoverable knowledge. Get daily recaps, AI-powered summaries, full transcripts, and insights from thousands of the world's most popular and influential podcasts.";

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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead />

      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center" data-testid="link-home">
          <img src={logoPath} alt="PodCap" className="h-9 object-contain" />
        </a>
        <div className="flex items-center gap-3">
          <button
            data-testid="link-get-started-nav"
            onClick={() => navigate("/get-started")}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-xs font-semibold text-primary tracking-wide uppercase hover:bg-primary/15 transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            Build Your Recap
          </button>
          <button
            data-testid="link-login"
            onClick={() => navigate("/login")}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Log in
          </button>
        </div>
      </header>

      <main className="flex-1">

        <section className="w-full max-w-4xl mx-auto text-center px-4 sm:px-6 pt-16 sm:pt-24 pb-16 sm:pb-20">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="flex flex-col items-center gap-6">
            <h1 className="text-[2.5rem] sm:text-[3.25rem] md:text-[4rem] font-display font-extrabold text-foreground leading-[1.06] tracking-[-0.03em] max-w-3xl" data-testid="text-headline">
              The world's searchable library of podcast knowledge
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-xl leading-relaxed font-medium">
              Search, skim, and stay current on the world's best podcasts — without listening to every full episode.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
              <button
                data-testid="button-hero-cta"
                onClick={() => navigate("/get-started")}
                className="h-12 px-8 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-[15px] bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:brightness-105 transition-all active:scale-[0.98]"
              >
                Build Your Recap
                <ArrowRight className="w-4.5 h-4.5" />
              </button>
              <button
                data-testid="button-browse-podcasts"
                onClick={() => navigate("/podcasts")}
                className="h-12 px-8 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-[15px] bg-card border border-border text-foreground hover:bg-accent transition-colors"
              >
                Browse Podcasts
              </button>
            </div>
          </motion.div>
        </section>

        <section className="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-20 sm:pb-24">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-card border border-border rounded-2xl p-7 sm:p-8 flex flex-col gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-lg font-display font-bold text-foreground">Unlock podcast insights</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Every episode is distilled into the key ideas, notable quotes, and actionable takeaways — so you get the value without the time commitment.
              </p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-7 sm:p-8 flex flex-col gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                <Search className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-lg font-display font-bold text-foreground">Searchable and skimmable</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Browse recaps by podcast, topic, guest, or company. Find exactly the conversation you're looking for in seconds, not hours.
              </p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-7 sm:p-8 flex flex-col gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                <Headphones className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-lg font-display font-bold text-foreground">Never fall behind</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Get a personalized daily email with recaps of your favorite shows. Stay current on every podcast you follow — even the ones you can't listen to.
              </p>
            </div>
          </motion.div>
        </section>

        <section className="w-full bg-card/50 border-y border-border py-16 sm:py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground tracking-[-0.02em]">
                Explore top podcasts
              </h2>
              <p className="text-base text-muted-foreground mt-3 max-w-lg mx-auto">
                We cover thousands of the world's most popular and influential podcast shows. Browse episodes, read recaps, and get daily summaries delivered to your inbox.
              </p>
            </motion.div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
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
                        <span className="text-white text-xs font-bold">Get Recaps →</span>
                      </div>
                    </div>
                    <p className="mt-2.5 text-sm font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                      {podcast.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{podcast.category}</p>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="text-center mt-10">
              <button
                data-testid="button-view-all-podcasts"
                onClick={() => navigate("/podcasts")}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-card border border-border text-sm font-bold text-foreground hover:bg-accent transition-colors"
              >
                View all podcasts
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        <section className="w-full py-16 sm:py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground tracking-[-0.02em]">
                Notable voices across podcasts
              </h2>
              <p className="text-base text-muted-foreground mt-3 max-w-lg mx-auto">
                The most influential founders, investors, and thinkers who shape the conversations across the podcast ecosystem.
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
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-border group-hover:border-primary/30 transition-colors shadow-sm">
                      <img
                        src={person.imageUrl}
                        alt={person.name}
                        className="w-full h-full object-cover group-hover:scale-[1.05] transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `/people/default-avatar.png`;
                        }}
                      />
                    </div>
                    <p className="mt-3 text-sm font-bold text-foreground group-hover:text-primary transition-colors leading-snug">
                      {person.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
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
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-card border border-border text-sm font-bold text-foreground hover:bg-accent transition-colors"
              >
                View all people
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        <section className="w-full bg-foreground text-background py-16 sm:py-20">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="flex flex-col items-center gap-6">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                <Library className="w-6 h-6 text-white/80" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-display font-extrabold leading-[1.1] tracking-[-0.02em]">
                We're organizing the world's podcast knowledge
              </h2>
              <p className="text-base sm:text-lg text-white/60 max-w-xl leading-relaxed">
                Millions of hours of conversations happen across podcasts every year. The best ideas, the sharpest analysis, the most honest debates — locked inside audio files that most people will never hear. PodCap is changing that.
              </p>
              <p className="text-base sm:text-lg text-white/60 max-w-xl leading-relaxed">
                We're building the infrastructure to make podcast knowledge searchable, skimmable, and accessible to everyone — episode by episode, idea by idea.
              </p>
              <a
                href="/about"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-white/50 hover:text-white/80 transition-colors mt-2"
                data-testid="link-about-vision"
              >
                Read our story
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </motion.div>
          </div>
        </section>

        <section className="w-full py-16 sm:py-20">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="flex flex-col items-center gap-6">
              <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground tracking-[-0.02em]">
                Start getting smarter about podcasts
              </h2>
              <p className="text-base text-muted-foreground max-w-md">
                Choose your favorite shows, and we'll send you a daily recap with the key ideas from every new episode. Free forever.
              </p>
              <button
                data-testid="button-bottom-cta"
                onClick={() => navigate("/get-started")}
                className="h-12 px-8 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-[15px] bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:brightness-105 transition-all active:scale-[0.98]"
              >
                Build Your Recap
                <ArrowRight className="w-4.5 h-4.5" />
              </button>
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function SampleEpisode({
  name,
  episode,
  guest,
  guestTitle,
  length,
  tldr,
  discussion,
  discussionLabel,
  insights,
  hook,
  color,
}: {
  name: string;
  episode: string;
  guest?: string;
  guestTitle?: string;
  length: string;
  tldr: string;
  discussion: string;
  discussionLabel: string;
  insights: string[];
  hook: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-black/[0.06] overflow-hidden shadow-sm shadow-black/[0.03]">
      <div className={`${color} px-5 py-3.5`}>
        <p className="text-xs font-bold text-white uppercase tracking-[0.15em]">{name}</p>
      </div>
      <div className="p-5 space-y-4 bg-white">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">Episode</p>
            <p className="font-medium text-foreground mt-0.5">{episode}</p>
          </div>
          {guest && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">{guestTitle === "Hosts" || guestTitle === "Host" ? guestTitle : "Guest"}</p>
              <p className="font-medium text-foreground mt-0.5">{guest}</p>
              {guestTitle && guestTitle !== "Hosts" && guestTitle !== "Host" && (
                <p className="text-xs text-muted-foreground">{guestTitle}</p>
              )}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">Length</p>
            <p className="font-medium text-foreground mt-0.5">{length}</p>
          </div>
        </div>

        <div className="bg-black/[0.02] rounded-lg p-3.5">
          <p className="text-xs font-bold text-primary uppercase tracking-wider mb-1">TLDR</p>
          <p className="text-sm text-foreground">{tldr}</p>
        </div>

        <div>
          <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-wider mb-1.5">{discussionLabel}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{discussion}</p>
        </div>

        <div>
          <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-wider mb-2">Key Insights</p>
          <ul className="space-y-1.5">
            {insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
                {insight}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-start gap-2.5 bg-gradient-to-r from-primary/[0.04] to-transparent rounded-lg p-3.5 border-l-2 border-primary/30">
          <Quote className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-foreground italic">{hook}</p>
        </div>
      </div>
    </div>
  );
}
