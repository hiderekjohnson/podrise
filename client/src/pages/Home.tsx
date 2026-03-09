import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Mail, X, Headphones, BookOpen, Zap, Clock, Quote, MessageCircle, Search, Sparkles, Library, Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  const description = "Search, skim, and stay current on the world's best podcasts without listening to every episode. PodCap turns hours of audio into actionable insights.";

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
  const [showSampleEmail, setShowSampleEmail] = useState(false);

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
            <button
              data-testid="link-sample-email"
              onClick={() => setShowSampleEmail(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary/70 hover:text-primary transition-colors mt-1"
            >
              <Mail className="w-4 h-4" />
              See a sample recap email
            </button>
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
                We cover 250+ of the world's most popular shows. Browse episodes, read recaps, and get daily summaries delivered to your inbox.
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
                          (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(person.name)}&size=96&background=1a8cff&color=fff&bold=true`;
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

      <AnimatePresence>
        {showSampleEmail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8 px-4"
            onClick={() => setShowSampleEmail(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.25 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-black/[0.06] bg-white/95 backdrop-blur rounded-t-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Mail className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">PodCap Daily</p>
                    <p className="text-xs text-muted-foreground">Sample email preview</p>
                  </div>
                </div>
                <button
                  data-testid="button-close-sample"
                  onClick={() => setShowSampleEmail(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/[0.04] transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 sm:px-8 py-6 sm:py-8 space-y-8">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">Subject</p>
                  <p className="text-base font-bold text-foreground">PodCap Daily, 6 hours of podcasts summarized in 10 minutes</p>
                </div>

                <div className="border-t border-black/[0.06]" />

                <div className="text-center space-y-3">
                  <div className="flex items-center justify-center gap-2">
                    <img src={logoPath} alt="PodCap" className="h-7 object-contain" />
                    <span className="font-display font-extrabold text-lg text-foreground">Daily</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Your favorite podcasts, summarized in one email</p>
                </div>

                <div className="border-t border-black/[0.06]" />

                <div>
                  <p className="text-xl font-display font-bold text-foreground">Good morning Derek.</p>
                  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                    <p>You follow <strong className="text-foreground">5 podcasts</strong> today</p>
                    <p>Total listening time: <strong className="text-foreground">6 hours 3 minutes</strong></p>
                    <p>Your recap: <strong className="text-foreground">10 minute read</strong></p>
                  </div>
                  <p className="text-sm text-muted-foreground/70 mt-3">American Optimist · Moonshots · My First Million · Founders · Driverless Digest</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-primary/[0.04] rounded-xl p-3 text-center">
                    <Headphones className="w-4 h-4 text-primary mx-auto mb-1" />
                    <p className="text-lg font-display font-extrabold text-foreground">5</p>
                    <p className="text-xs text-muted-foreground">Podcasts</p>
                  </div>
                  <div className="bg-primary/[0.04] rounded-xl p-3 text-center">
                    <Clock className="w-4 h-4 text-primary mx-auto mb-1" />
                    <p className="text-lg font-display font-extrabold text-foreground">6h 03m</p>
                    <p className="text-xs text-muted-foreground">Total runtime</p>
                  </div>
                  <div className="bg-primary/[0.04] rounded-xl p-3 text-center">
                    <BookOpen className="w-4 h-4 text-primary mx-auto mb-1" />
                    <p className="text-lg font-display font-extrabold text-foreground">10 min</p>
                    <p className="text-xs text-muted-foreground">Your recap</p>
                  </div>
                  <div className="bg-green-500/[0.06] rounded-xl p-3 text-center">
                    <Zap className="w-4 h-4 text-green-600 mx-auto mb-1" />
                    <p className="text-lg font-display font-extrabold text-green-700">5h 53m</p>
                    <p className="text-xs text-green-600/80">Time saved</p>
                  </div>
                </div>

                <div className="border-t border-black/[0.06]" />

                <div>
                  <p className="text-xs font-bold text-foreground uppercase tracking-[0.15em] mb-4">Big Ideas Today</p>
                  <div className="space-y-3">
                    {[
                      { emoji: "\ud83d\ude80", text: "NASA may build a permanent moon base by 2028", source: "American Optimist" },
                      { emoji: "\ud83e\udd16", text: "AI could replace large parts of the consulting industry", source: "Moonshots" },
                      { emoji: "\ud83d\udcb0", text: "Vertical AI startups may become the biggest investment opportunity in AI", source: "My First Million" },
                      { emoji: "\ud83e\udde0", text: "The most successful careers come from obsessive preparation", source: "Founders" },
                      { emoji: "\ud83d\ude97", text: 'Many "self-driving" cars still rely on remote human operators', source: "Driverless Digest" },
                    ].map((item, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <span className="text-lg leading-none mt-0.5">{item.emoji}</span>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{item.text}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Source: {item.source}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-black/[0.06]" />

                <SampleEpisode
                  name="AMERICAN OPTIMIST"
                  episode="Jared Isaacman's Vision for NASA"
                  guest="Jared Isaacman"
                  guestTitle="Astronaut and founder of Shift4"
                  length="1 hr 12 min"
                  tldr="NASA's next phase focuses on returning to the moon and building permanent infrastructure there that could support a real space economy."
                  discussion="Joe Lonsdale pushes Isaacman on whether NASA's timeline is realistic. Isaacman argues the real goal isn't symbolic moon landings, it's building infrastructure that enables fuel production, mining, and manufacturing in space."
                  discussionLabel="What They Talk About"
                  insights={[
                    "NASA aims to land astronauts on the moon again by 2028",
                    "Lunar ice could be converted into rocket fuel",
                    "Nuclear propulsion could shorten deep space missions",
                    "The moon could become a fueling station for Mars exploration",
                  ]}
                  hook={`"The moon isn't the destination. It's the gas station."`}
                  color="bg-blue-500"
                />

                <SampleEpisode
                  name="MY FIRST MILLION"
                  episode="Where Investors Are Betting in the AI Economy"
                  guest="Sam Parr and Shaan Puri"
                  guestTitle="Hosts"
                  length="1 hr 22 min"
                  tldr="The biggest AI opportunities may not come from building new AI models but from applying AI to specific industries."
                  discussion="Sam asks whether AI will destroy SaaS companies. Shaan argues many SaaS tools will be replaced by AI-powered workflows."
                  discussionLabel="What They Talk About"
                  insights={[
                    "Vertical AI startups may outperform general AI startups",
                    "AI assistants with the most user context will win",
                    "Many SaaS companies may be replaced by AI tools",
                    "Content creation remains one of the best ways to attract opportunity",
                  ]}
                  hook={`"The next Salesforce won't be software. It'll be an AI employee."`}
                  color="bg-amber-500"
                />

                <div className="border-t border-black/[0.06]" />

                <div className="rounded-xl bg-gradient-to-br from-primary/[0.05] to-primary/[0.02] border border-primary/10 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <MessageCircle className="w-4 h-4 text-primary" />
                    <p className="text-xs font-bold text-foreground uppercase tracking-[0.15em]">Conversation Ammo</p>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">If you repeat one idea today, make it this:</p>
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full h-fit mt-0.5 shrink-0">Space</span>
                      <p className="text-sm text-foreground">Someone argued the moon will become the "gas station for Mars missions."</p>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full h-fit mt-0.5 shrink-0">AI</span>
                      <p className="text-sm text-foreground">AI tools may soon replace large parts of the consulting industry.</p>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full h-fit mt-0.5 shrink-0">Startups</span>
                      <p className="text-sm text-foreground">Investors are increasingly betting on AI companies focused on specific industries instead of general AI platforms.</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-black/[0.06]" />

                <div className="text-center space-y-2 pt-2 pb-4">
                  <p className="text-lg font-display font-extrabold text-foreground">That's your PodCap Daily.</p>
                  <p className="text-sm text-muted-foreground">6 hours of podcasts summarized in 10 minutes.</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
