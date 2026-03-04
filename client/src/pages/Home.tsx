import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ArrowRight, Mail, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRegister, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PodcastSearch } from "@/components/PodcastSearch";
import logoPath from "@assets/image_1772641542609.png";
import faviconPath from "@assets/image_1772642558577.png";

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

  if (user) {
    navigate("/dashboard");
    return null;
  }

  const handleAdd = (podcast: SelectedPodcast) => {
    setSelectedPodcasts((prev) => [...prev, podcast]);
  };

  const handleRemove = (id: string) => {
    setSelectedPodcasts((prev) => prev.filter((p) => p.id !== id));
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
        readingLength: 10,
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
        <div className="flex items-center gap-2.5">
          <img
            src={faviconPath}
            alt="PodCap icon"
            className="w-8 h-8 object-contain"
          />
          <span className="font-display font-bold text-lg text-foreground">PodCap</span>
        </div>
        <button
          data-testid="link-login"
          onClick={() => navigate("/login")}
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Log in
        </button>
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
              <span className="block">Your favorite podcasts,</span>
              <span className="block">summarized in one <span className="text-primary">daily email</span>.</span>
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground/80">
              Free for up to 3 podcasts
            </p>
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
          <div className="glass-panel rounded-2xl sm:rounded-3xl p-5 sm:p-8 flex flex-col gap-10">
            <section className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">1</span>
                <div>
                  <h2 className="text-lg font-display font-bold text-foreground">
                    Choose podcasts to recap
                  </h2>
                </div>
              </div>
              <div className="pl-10">
                <PodcastSearch
                  selectedPodcasts={selectedPodcasts}
                  onAdd={handleAdd}
                  onRemove={handleRemove}
                  maxSelection={3}
                />
              </div>
            </section>

            <div className="border-t border-black/[0.06]" />

            <section className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">2</span>
                <h2 className="text-lg font-display font-bold text-foreground">
                  Where should we send your daily recap?
                </h2>
              </div>
              <div className="pl-10 space-y-4">
                <input
                  data-testid="input-email"
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 px-4 bg-black/[0.03] border border-black/[0.06] rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium"
                />
              </div>
            </section>

            <div className="flex flex-col items-center gap-2">
              <button
                data-testid="button-finish"
                onClick={handleSubmit}
                disabled={isPending}
                className="w-full h-14 flex items-center justify-center gap-2.5 rounded-xl font-display font-bold text-base bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.99]"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating your recap...
                  </>
                ) : (
                  <>
                    Create My Daily Recap
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

              <div className="px-6 sm:px-8 py-6 sm:py-8 space-y-6">
                <div className="space-y-1">
                  <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground/60 uppercase tracking-wider">Subject</span>
                  </div>
                  <p className="text-base font-bold text-foreground">PodCap Daily — Your favorite podcasts, summarized in one email.</p>
                </div>

                <div className="border-t border-black/[0.06]" />

                <div className="space-y-1">
                  <p className="text-lg font-display font-bold text-foreground">Good morning, Derek.</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-2">
                    <span>You follow <strong className="text-foreground">5 podcasts</strong> today.</span>
                    <span>Total listening time: <strong className="text-foreground">6 hours 3 minutes</strong></span>
                    <span>Your recap: <strong className="text-foreground">10 minute read</strong></span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">American Optimist • Moonshots • My First Million • Founders • Driverless Digest</p>
                </div>

                <div className="border-t border-black/[0.06]" />

                <div className="space-y-2">
                  <p className="text-sm font-bold text-foreground uppercase tracking-wider">TLDR — The Biggest Ideas From Your Podcasts Today</p>
                  <div className="space-y-2 text-sm">
                    <p>🚀 <strong>NASA is planning a permanent moon base by 2028</strong><br /><span className="text-muted-foreground">Source: American Optimist</span></p>
                    <p>🤖 <strong>AI could replace large parts of the consulting industry</strong><br /><span className="text-muted-foreground">Source: Moonshots</span></p>
                    <p>💰 <strong>Vertical AI startups may become the biggest investment opportunity in AI</strong><br /><span className="text-muted-foreground">Source: My First Million</span></p>
                    <p>🧠 <strong>The most successful careers come from obsessive preparation and long-term focus</strong><br /><span className="text-muted-foreground">Source: Founders</span></p>
                    <p>🚗 <strong>Many "self-driving" cars still rely on remote human operators</strong><br /><span className="text-muted-foreground">Source: Driverless Digest</span></p>
                  </div>
                </div>

                <div className="border-t border-black/[0.06]" />

                <SamplePodcastSection
                  name="American Optimist"
                  episode="Jared Isaacman's Vision for NASA"
                  published="February 2026"
                  length="1 hr 12 min"
                  tldr="NASA's next phase focuses on returning to the moon, building a permanent lunar base, and developing a real space economy powered by nuclear energy and lunar resources."
                  whyItMatters="This episode explains how the moon could become the launchpad for a real space economy, including fuel production, mining, and manufacturing in orbit."
                  insights={[
                    "NASA aims to land astronauts on the moon again by 2028",
                    "Lunar ice could be converted into rocket fuel for deeper missions",
                    "Nuclear propulsion may enable long-duration exploration",
                    "The long-term goal is a self-sustaining space economy",
                  ]}
                />

                <div className="border-t border-black/[0.06]" />

                <SamplePodcastSection
                  name="Moonshots"
                  episode="AI, Geopolitics, and the Future of Work"
                  published="February 2026"
                  length="1 hr 48 min"
                  tldr="AI development is accelerating globally, potentially disrupting industries from consulting to cybersecurity while raising major ethical and geopolitical questions."
                  whyItMatters="AI tools may soon automate complex professional work that previously required large teams of analysts and consultants."
                  insights={[
                    "AI models are entering a phase of recursive self-improvement",
                    "Consulting firms may face major disruption",
                    "Countries like India are positioning themselves as AI-neutral hubs",
                    "AI could displace large numbers of white-collar jobs",
                  ]}
                />

                <div className="border-t border-black/[0.06]" />

                <SamplePodcastSection
                  name="My First Million"
                  episode="Where Investors Are Betting in the AI Economy"
                  published="February 2026"
                  length="1 hr 22 min"
                  tldr="The biggest AI opportunities may lie in industry-specific software rather than competing directly with large AI platforms."
                  whyItMatters="Most successful AI companies may not build general models. Instead they will apply AI to specific industries and workflows."
                  insights={[
                    "Vertical AI startups may outperform general AI startups",
                    "AI assistants with the most user context will win",
                    "Many SaaS companies risk being replaced by AI tools",
                    "Content creation remains one of the best ways to attract opportunity",
                  ]}
                />

                <div className="border-t border-black/[0.06]" />

                <SamplePodcastSection
                  name="Founders"
                  episode="#413 — Running Down a Dream"
                  published="February 2026"
                  length="58 min"
                  tldr="The most successful people pursue careers they are deeply obsessed with and invest heavily in preparation, mentorship, and long-term relationships."
                  whyItMatters="Long-term success often comes from deep curiosity and persistence, not short-term motivation."
                  insights={[
                    "Saying your goals out loud can turn dreams into commitments",
                    "Preparation is often more important than motivation",
                    "Mentors accelerate learning dramatically",
                    "Strong peer networks compound success",
                  ]}
                />

                <div className="border-t border-black/[0.06]" />

                <SamplePodcastSection
                  name="Driverless Digest"
                  episode="Inside Waymo's Remote Assistance Program"
                  published="February 2026"
                  length="43 min"
                  tldr='Many autonomous vehicles rely on remote human assistance, raising questions about whether today&#39;s systems are truly "fully autonomous."'
                  whyItMatters="Understanding the limitations of current self-driving technology is critical as robotaxi services expand globally."
                  insights={[
                    "Remote operators assist vehicles in difficult situations",
                    "Communication latency can introduce safety risks",
                    "Regulators may require stronger licensing standards",
                    "True full autonomy remains a major technical challenge",
                  ]}
                />

                <div className="border-t border-black/[0.06]" />

                <div className="text-center space-y-1 pt-2 pb-4">
                  <p className="text-base font-display font-bold text-foreground">That's your PodCap Daily.</p>
                  <p className="text-sm text-muted-foreground">6 hours of podcasts summarized in 10 minutes.</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SamplePodcastSection({
  name,
  episode,
  published,
  length,
  tldr,
  whyItMatters,
  insights,
}: {
  name: string;
  episode: string;
  published: string;
  length: string;
  tldr: string;
  whyItMatters: string;
  insights: string[];
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-base font-display font-bold text-foreground">{name}</p>
        <p className="text-sm text-muted-foreground">Episode: {episode}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Published: {published} · Length: {length}</p>
      </div>
      <div className="space-y-2 text-sm">
        <div>
          <p className="font-semibold text-foreground text-xs uppercase tracking-wider mb-0.5">TLDR</p>
          <p className="text-muted-foreground">{tldr}</p>
        </div>
        <div>
          <p className="font-semibold text-foreground text-xs uppercase tracking-wider mb-0.5">Why It Matters</p>
          <p className="text-muted-foreground">{whyItMatters}</p>
        </div>
        <div>
          <p className="font-semibold text-foreground text-xs uppercase tracking-wider mb-1">Key Insights</p>
          <ul className="space-y-1">
            {insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-muted-foreground">
                <span className="text-primary mt-1.5 w-1 h-1 rounded-full bg-primary shrink-0" />
                {insight}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
