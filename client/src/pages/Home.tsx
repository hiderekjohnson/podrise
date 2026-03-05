import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, ArrowRight, Mail, X, Pencil, Podcast, Clock, Headphones, BookOpen, Zap, Quote, MessageCircle, Trophy } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRegister, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PodcastSearch } from "@/components/PodcastSearch";
import { Footer } from "@/components/Footer";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

function hiResArtwork(url: string) {
  return url.replace(/\/\d+x\d+bb\./, "/300x300bb.");
}

interface SelectedPodcast {
  id: string;
  name: string;
  artworkUrl: string;
}

export default function Home() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  const { toast } = useToast();
  const { mutate: register, isPending } = useRegister();

  const [selectedPodcasts, setSelectedPodcasts] = useState<SelectedPodcast[]>([]);
  const [email, setEmail] = useState("");
  const [showSampleEmail, setShowSampleEmail] = useState(false);
  const [podcastsLocked, setPodcastsLocked] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const emailSectionRef = useRef<HTMLElement>(null);

  if (user) {
    navigate("/dashboard");
    return null;
  }

  const handleAdd = (podcast: SelectedPodcast) => {
    const updated = [...selectedPodcasts, podcast];
    setSelectedPodcasts(updated);
    if (updated.length >= 3) {
      setPodcastsLocked(true);
      setTimeout(() => {
        emailSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => emailRef.current?.focus(), 400);
      }, 300);
    }
  };

  const handleRemove = (id: string) => {
    setSelectedPodcasts((prev) => prev.filter((p) => p.id !== id));
  };

  const handleUnlockPodcasts = () => {
    setPodcastsLocked(false);
  };

  const handleSubmit = () => {
    if (selectedPodcasts.length === 0) {
      toast({
        title: "Almost there!",
        description: "Please select at least one podcast.",
        variant: "destructive",
      });
      return;
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    register(
      {
        podcasts: selectedPodcasts.map((p) => JSON.stringify(p)),


        email,
      },
      {
        onSuccess: () => {
          toast({
            title: "Success!",
            description: "Your digest has been created. Redirecting to your dashboard...",
          });
          navigate("/dashboard");
        },
        onError: (err) => {
          toast({
            title: "Something went wrong",
            description: err.message.includes("400")
              ? "An account with this email already exists. Try logging in."
              : err.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center">
          <img
            src={logoPath}
            alt="PodCap"
            className="h-9 object-contain"
          />
        </a>
        <div className="flex items-center gap-3">
          <button
            data-testid="link-podcasts"
            onClick={() => navigate("/podcasts")}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full text-xs font-semibold text-amber-600 tracking-wide uppercase hover:bg-amber-500/15 transition-colors"
          >
            <Trophy className="w-3.5 h-3.5" />
            Most Popular
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

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-16">
        <section className="w-full max-w-3xl text-center pt-14 sm:pt-20 pb-12 sm:pb-14">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center gap-5"
          >
            <h1
              data-testid="text-headline"
              className="text-[2rem] sm:text-[2.75rem] md:text-[3.25rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.02em]"
            >
              Your favorite podcasts recapped daily
            </h1>
            <h2 className="text-base sm:text-lg text-muted-foreground font-medium">
              We listen so you don't have to.
            </h2>
            <button
              data-testid="link-sample-email"
              onClick={() => setShowSampleEmail(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors mt-1"
            >
              <Mail className="w-4 h-4" />
              See sample email
            </button>
          </motion.div>
        </section>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="w-full max-w-2xl"
        >
          <div className="glass-panel p-6 sm:p-10 flex flex-col gap-10">
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-foreground text-center">
              Create Your Podcast Recap
            </h2>
            <section className="flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <span className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0 transition-colors ${podcastsLocked ? "bg-green-500 text-white" : "bg-primary text-primary-foreground"}`}>
                  {podcastsLocked ? "✓" : "1"}
                </span>
                <div className="flex-1">
                  <h2 className="text-lg font-display font-bold text-foreground">
                    {podcastsLocked ? "Your podcasts" : "Choose podcasts to recap"}
                  </h2>
                </div>
                {podcastsLocked && (
                  <button
                    data-testid="button-change-podcasts"
                    onClick={handleUnlockPodcasts}
                    className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Change
                  </button>
                )}
              </div>

              <AnimatePresence mode="wait">
                {podcastsLocked ? (
                  <motion.div
                    key="locked"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="pl-10"
                  >
                    <div className="grid grid-cols-3 gap-3">
                      {selectedPodcasts.map((podcast) => (
                        <div
                          key={podcast.id}
                          className="bg-white border border-black/[0.06] rounded-2xl p-3 pb-3.5"
                        >
                          {podcast.artworkUrl ? (
                            <img
                              src={hiResArtwork(podcast.artworkUrl)}
                              alt={podcast.name}
                              className="w-full aspect-square rounded-xl object-cover shadow-sm shadow-black/[0.06]"
                            />
                          ) : (
                            <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center">
                              <Podcast className="w-10 h-10 text-primary" />
                            </div>
                          )}
                          <p className="mt-2.5 text-[13px] font-semibold text-foreground leading-snug line-clamp-2">{podcast.name}</p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="unlocked"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="pl-10 space-y-5"
                  >
                    <PodcastSearch
                      selectedPodcasts={selectedPodcasts}
                      onAdd={handleAdd}
                      onRemove={handleRemove}
                      maxSelection={3}
                    />
                    {selectedPodcasts.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-foreground">Selected podcasts <span className="text-muted-foreground font-semibold">({selectedPodcasts.length}/3)</span></p>
                        <p className="text-xs text-muted-foreground mb-2">Pick up to 3 to start. You can add or remove podcasts anytime.</p>
                        <div className="grid grid-cols-3 gap-3">
                          {selectedPodcasts.map((podcast) => (
                            <div
                              key={podcast.id}
                              className="bg-white border border-black/[0.06] rounded-2xl p-3 pb-3.5 relative group"
                            >
                              <button
                                data-testid={`button-remove-selected-${podcast.id}`}
                                onClick={() => handleRemove(podcast.id)}
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                              >
                                ×
                              </button>
                              {podcast.artworkUrl ? (
                                <img
                                  src={hiResArtwork(podcast.artworkUrl)}
                                  alt={podcast.name}
                                  className="w-full aspect-square rounded-xl object-cover shadow-sm shadow-black/[0.06]"
                                />
                              ) : (
                                <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center">
                                  <Podcast className="w-10 h-10 text-primary" />
                                </div>
                              )}
                              <p className="mt-2.5 text-[13px] font-semibold text-foreground leading-snug line-clamp-2">{podcast.name}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            <div className="border-t border-black/[0.06]" />

            <section ref={emailSectionRef} className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <span className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0 mt-0.5 transition-colors ${email.includes("@") && email.includes(".") ? "bg-green-500 text-white" : "bg-primary text-primary-foreground"}`}>
                  {email.includes("@") && email.includes(".") ? "✓" : "2"}
                </span>
                <div>
                  <h2 className="text-lg font-display font-bold text-foreground">
                    Where should we send your recap?
                  </h2>
                </div>
              </div>
              <div className="pl-10 space-y-4">
                <input
                  ref={emailRef}
                  data-testid="input-email"
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-14 px-5 bg-white border border-black/[0.08] rounded-2xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/25 transition-all font-medium shadow-sm shadow-black/[0.03]"
                />
              </div>
            </section>

            <div className="flex flex-col items-center gap-2">
              <button
                data-testid="button-finish"
                onClick={handleSubmit}
                disabled={isPending}
                className="w-full h-14 flex items-center justify-center gap-2.5 rounded-2xl font-display font-bold text-base bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating your recap...
                  </>
                ) : (
                  <>
                    Start My Daily Recap
                    <ArrowRight className="w-4.5 h-4.5" />
                  </>
                )}
              </button>
              <p className="text-xs text-muted-foreground">
                Free for up to 3 podcasts. No credit card required.
              </p>
            </div>
          </div>
        </motion.div>
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
                    <p className="text-[11px] text-muted-foreground">Podcasts</p>
                  </div>
                  <div className="bg-primary/[0.04] rounded-xl p-3 text-center">
                    <Clock className="w-4 h-4 text-primary mx-auto mb-1" />
                    <p className="text-lg font-display font-extrabold text-foreground">6h 03m</p>
                    <p className="text-[11px] text-muted-foreground">Total runtime</p>
                  </div>
                  <div className="bg-primary/[0.04] rounded-xl p-3 text-center">
                    <BookOpen className="w-4 h-4 text-primary mx-auto mb-1" />
                    <p className="text-lg font-display font-extrabold text-foreground">10 min</p>
                    <p className="text-[11px] text-muted-foreground">Your recap</p>
                  </div>
                  <div className="bg-green-500/[0.06] rounded-xl p-3 text-center">
                    <Zap className="w-4 h-4 text-green-600 mx-auto mb-1" />
                    <p className="text-lg font-display font-extrabold text-green-700">5h 53m</p>
                    <p className="text-[11px] text-green-600/80">Time saved</p>
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
                  name="MOONSHOTS"
                  episode="AI, Geopolitics, and the Future of Work"
                  guest="Ian Hogarth"
                  guestTitle="AI investor and policy expert"
                  length="1 hr 48 min"
                  tldr="AI development is accelerating globally and may disrupt industries that rely heavily on analysis, research, and consulting."
                  discussion="Peter Diamandis argues AI will massively increase productivity. Hogarth argues it could collapse industries built around expensive knowledge work."
                  discussionLabel="What They Debate"
                  insights={[
                    "AI models are entering recursive self-improvement cycles",
                    "Consulting firms may face major disruption",
                    "Countries like India may position themselves as AI-neutral hubs",
                    "Regulation may become the biggest geopolitical battleground",
                  ]}
                  hook={`"The first trillion-dollar AI companies may replace consulting firms."`}
                  color="bg-purple-500"
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

                <SampleEpisode
                  name="FOUNDERS"
                  episode="#413 — Running Down a Dream"
                  guest="David Senra"
                  guestTitle="Host"
                  length="58 minutes"
                  tldr="The most successful founders pursue careers they are deeply obsessed with and invest heavily in preparation and long-term relationships."
                  discussion="The episode explores how many successful founders publicly committed to their ambitions early in life and treated preparation as a competitive advantage."
                  discussionLabel="What Senra Focuses On"
                  insights={[
                    "Saying your goals out loud can increase commitment",
                    "Preparation often beats motivation",
                    "Mentors dramatically accelerate learning",
                    "Strong peer networks compound success",
                  ]}
                  hook={`"Most people want the result without the obsession."`}
                  color="bg-emerald-500"
                />

                <SampleEpisode
                  name="DRIVERLESS DIGEST"
                  episode="Inside Waymo's Remote Assistance Program"
                  length="43 minutes"
                  tldr='Many autonomous vehicles still rely on remote human operators to help navigate difficult situations.'
                  discussion="Remote assistance teams monitor fleets and help vehicles handle edge cases that current AI systems cannot fully resolve."
                  discussionLabel="What They Explain"
                  insights={[
                    "Remote operators assist vehicles during complex scenarios",
                    "Communication latency can introduce safety risks",
                    "Regulators may require licensing for remote operators",
                    "Fully autonomous driving remains technically difficult",
                  ]}
                  hook={`"The hardest part of autonomy is the 0.1% of weird situations."`}
                  color="bg-rose-500"
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
            <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Episode</p>
            <p className="font-medium text-foreground mt-0.5">{episode}</p>
          </div>
          {guest && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">{guestTitle === "Hosts" || guestTitle === "Host" ? guestTitle : "Guest"}</p>
              <p className="font-medium text-foreground mt-0.5">{guest}</p>
              {guestTitle && guestTitle !== "Hosts" && guestTitle !== "Host" && (
                <p className="text-xs text-muted-foreground">{guestTitle}</p>
              )}
            </div>
          )}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Length</p>
            <p className="font-medium text-foreground mt-0.5">{length}</p>
          </div>
        </div>

        <div className="bg-black/[0.02] rounded-lg p-3.5">
          <p className="text-[11px] font-bold text-primary uppercase tracking-wider mb-1">TLDR</p>
          <p className="text-sm text-foreground">{tldr}</p>
        </div>

        <div>
          <p className="text-[11px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-1.5">{discussionLabel}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{discussion}</p>
        </div>

        <div>
          <p className="text-[11px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-2">Key Insights</p>
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
