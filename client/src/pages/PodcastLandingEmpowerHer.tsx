import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, ArrowRight, Headphones, Zap, Clock, Mail, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { useRegister, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import faviconPath from "@assets/image_1772642558577.png";

const PODCAST = {
  id: "1444456380",
  name: "empowerHER",
  artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/7f/d5/91/7fd591fe-a825-c9e3-bb6e-03f6e80588a9/mza_13023608203325049565.jpg/600x600bb.jpg",
};

const APPLE_URL = "https://podcasts.apple.com/us/podcast/empowerher/id1444456380";

const FAQ_ITEMS = [
  {
    q: "What is PodCap's empowerHER daily summary?",
    a: "PodCap delivers a concise AI-powered recap of the latest empowerHER podcast episodes straight to your inbox every morning. Each summary covers the key insights on personal growth, confidence, faith, business, and empowerment discussed by Kacia Ghetmiri — so you stay inspired even when you don't have time to listen.",
  },
  {
    q: "How does the empowerHER podcast summary work?",
    a: "Every day, PodCap checks for new empowerHER episodes, pulls real transcripts when available, and uses AI to generate a detailed digest. You'll get the biggest takeaways, motivational insights, actionable advice, and standout quotes — all formatted for a quick read over your morning coffee.",
  },
  {
    q: "Is this an official empowerHER product?",
    a: "No. PodCap is an independent podcast summary service and is not affiliated with, endorsed by, or sponsored by empowerHER or Kacia Ghetmiri. We're fans who built a tool to help other listeners keep up with the show.",
  },
  {
    q: "Can I get summaries of other podcasts too?",
    a: "Yes! Once you create your free PodCap account, you can add up to 3 podcasts to your daily digest. Popular choices include The Diary of a CEO, My First Million, The Joe Rogan Experience, and hundreds more. Upgrade to PodCap Pro for unlimited podcasts.",
  },
  {
    q: "What topics does empowerHER cover?",
    a: "empowerHER is a podcast hosted by Kacia Ghetmiri that covers personal development, women's empowerment, faith, confidence, entrepreneurship, relationships, health, and mindset. It's designed to help women live boldly and create the lives they dream of.",
  },
  {
    q: "When will I receive my daily empowerHER summary?",
    a: "You choose your preferred delivery time during setup. Most listeners pick early morning so the recap is waiting in their inbox when they wake up. You can also customize your timezone and delivery schedule from your dashboard.",
  },
  {
    q: "How much does PodCap cost?",
    a: "PodCap is free for up to 3 podcasts. If you want unlimited podcast summaries, you can upgrade to PodCap Pro for $9.99/month. The empowerHER summary is included in the free plan.",
  },
  {
    q: "What if empowerHER doesn't release an episode today?",
    a: "PodCap only sends you a digest when there are new episodes. If empowerHER (or your other selected podcasts) didn't release anything, you won't receive an empty email — we respect your inbox.",
  },
];

export default function PodcastLandingEmpowerHer() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  const { toast } = useToast();
  const { mutate: register, isPending } = useRegister();
  const [email, setEmail] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    document.title = "empowerHER Podcast Summary — Free Daily Recap | PodCap";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", "Get a free AI-powered daily summary of the empowerHER podcast by Kacia Ghetmiri. Personal growth, empowerment, faith, and confidence insights delivered to your inbox every morning.");
    }
    const ogTitle = document.querySelector('meta[property="og:title"]') || document.createElement("meta");
    ogTitle.setAttribute("property", "og:title");
    ogTitle.setAttribute("content", "empowerHER Podcast Summary — Free Daily Recap | PodCap");
    if (!ogTitle.parentElement) document.head.appendChild(ogTitle);
    const ogDesc = document.querySelector('meta[property="og:description"]') || document.createElement("meta");
    ogDesc.setAttribute("property", "og:description");
    ogDesc.setAttribute("content", "AI-powered daily summaries of empowerHER by Kacia Ghetmiri. Personal growth, empowerment, and inspiration — delivered free to your inbox.");
    if (!ogDesc.parentElement) document.head.appendChild(ogDesc);
    const ogImage = document.querySelector('meta[property="og:image"]') || document.createElement("meta");
    ogImage.setAttribute("property", "og:image");
    ogImage.setAttribute("content", PODCAST.artworkUrl);
    if (!ogImage.parentElement) document.head.appendChild(ogImage);
  }, []);

  if (user) {
    navigate("/dashboard");
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }

    register(
      {
        podcasts: [JSON.stringify(PODCAST)],
        email,
      },
      {
        onSuccess: () => {
          toast({ title: "You're in!", description: "Your empowerHER digest is set up. Redirecting..." });
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
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-white via-blue-50/30 to-white">
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center gap-2.5" data-testid="link-home">
          <img src={faviconPath} alt="PodCap icon" className="w-8 h-8 object-contain" />
          <span className="font-display font-bold text-lg text-foreground">PodCap</span>
        </a>
        <a
          href="/login"
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          data-testid="link-login"
        >
          Log in
        </a>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8">
        <section className="w-full max-w-4xl pt-8 sm:pt-16 pb-12 sm:pb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16"
          >
            <div className="flex flex-col items-center lg:items-start gap-6 flex-1">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/8 border border-primary/15 rounded-full">
                <Headphones className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-primary tracking-wide uppercase">Free Daily Podcast Summary</span>
              </div>

              <h1
                className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.02em] text-center lg:text-left"
                data-testid="heading-main"
              >
                Never miss an episode of{" "}
                <span className="text-primary">empowerHER</span>
              </h1>

              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed text-center lg:text-left max-w-lg">
                Get an AI-powered summary of every new empowerHER episode
                delivered to your inbox. All the personal growth insights, empowerment
                strategies, and inspiration from Kacia Ghetmiri — in a quick morning read.
              </p>

              <form onSubmit={handleSubmit} className="w-full max-w-md flex flex-col sm:flex-row gap-3" data-testid="form-signup">
                <div className="flex-1 relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <input
                    data-testid="input-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full h-14 pl-11 pr-4 bg-white border border-black/[0.08] rounded-2xl text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium placeholder:text-muted-foreground/40 shadow-sm"
                  />
                </div>
                <button
                  data-testid="button-signup"
                  type="submit"
                  disabled={isPending}
                  className="h-14 px-7 flex items-center justify-center gap-2.5 rounded-2xl font-display font-bold text-base bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] whitespace-nowrap"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      Get Free Summaries
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <p className="text-xs text-muted-foreground/60 text-center lg:text-left">
                Free forever for up to 3 podcasts. No credit card required.
              </p>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="shrink-0"
            >
              <div className="relative">
                <div className="absolute -inset-4 bg-primary/5 rounded-[2rem] blur-2xl" />
                <img
                  src={PODCAST.artworkUrl}
                  alt="empowerHER Podcast Cover Art"
                  className="relative w-56 h-56 sm:w-72 sm:h-72 lg:w-80 lg:h-80 rounded-3xl shadow-2xl shadow-black/10 object-cover"
                  data-testid="img-podcast-artwork"
                />
              </div>
            </motion.div>
          </motion.div>
        </section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="w-full max-w-4xl pb-16"
        >
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href={APPLE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-5 py-3 bg-white border border-black/[0.08] rounded-xl text-sm font-semibold text-foreground hover:bg-black/[0.02] hover:border-black/[0.12] transition-all shadow-sm"
              data-testid="link-apple-podcasts"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 2a8 8 0 110 16 8 8 0 010-16zm0 3a2.5 2.5 0 100 5 2.5 2.5 0 000-5zm0 6.5c-1.38 0-2.5.672-2.5 1.5v2.5c0 .414.336.75.75.75h3.5a.75.75 0 00.75-.75V15c0-.828-1.12-1.5-2.5-1.5z" fill="currentColor"/>
              </svg>
              Listen on Apple Podcasts
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
            </a>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="w-full max-w-4xl pb-16"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="glass-panel rounded-2xl p-6 flex flex-col items-center text-center gap-3" data-testid="feature-ai">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-display font-bold text-foreground">AI-Powered Recaps</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Real transcript analysis extracts the best insights, advice, and
                motivational takeaways from every empowerHER episode.
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-6 flex flex-col items-center text-center gap-3" data-testid="feature-inbox">
              <div className="w-11 h-11 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Mail className="w-5 h-5 text-green-500" />
              </div>
              <h3 className="font-display font-bold text-foreground">Straight to Your Inbox</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Wake up to a polished summary every morning. No app to open, no feed to
                scroll — just the highlights delivered by email.
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-6 flex flex-col items-center text-center gap-3" data-testid="feature-time">
              <div className="w-11 h-11 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
              <h3 className="font-display font-bold text-foreground">Save Hours Every Week</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Each episode can be 30–60 minutes. Your PodCap recap takes 5 minutes to read
                and covers everything worth knowing.
              </p>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="w-full max-w-3xl pb-20"
        >
          <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground text-center mb-8" data-testid="heading-faq">
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item, i) => (
              <div
                key={i}
                className="glass-panel rounded-2xl overflow-hidden"
                data-testid={`faq-item-${i}`}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left gap-4"
                  data-testid={`faq-toggle-${i}`}
                >
                  <span className="font-display font-bold text-foreground text-sm sm:text-base">{item.q}</span>
                  {openFaq === i ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 -mt-1">
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="w-full max-w-2xl pb-20"
        >
          <div className="glass-panel rounded-3xl p-8 sm:p-10 text-center flex flex-col items-center gap-5">
            <img
              src={PODCAST.artworkUrl}
              alt="empowerHER"
              className="w-16 h-16 rounded-xl shadow-lg"
            />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-foreground">
              Start getting empowerHER recaps today
            </h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Join listeners who save time with PodCap's AI-powered podcast summaries.
              Enter your email and get your first recap tomorrow morning.
            </p>
            <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col sm:flex-row gap-3" data-testid="form-signup-bottom">
              <input
                data-testid="input-email-bottom"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 h-12 px-4 bg-white border border-black/[0.08] rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium placeholder:text-muted-foreground/40 shadow-sm"
              />
              <button
                data-testid="button-signup-bottom"
                type="submit"
                disabled={isPending}
                className="h-12 px-5 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-sm bg-primary text-primary-foreground shadow-md hover:shadow-lg disabled:opacity-50 transition-all active:scale-[0.98] whitespace-nowrap"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Get Started Free"}
              </button>
            </form>
          </div>
        </motion.section>
      </main>

      <footer className="w-full border-t border-black/[0.06] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={faviconPath} alt="PodCap" className="w-5 h-5 object-contain" />
            <span className="text-sm font-semibold text-muted-foreground">PodCap</span>
          </div>
          <p className="text-xs text-muted-foreground/60 text-center">
            PodCap is not affiliated with empowerHER or Kacia Ghetmiri.
            All trademarks belong to their respective owners.
          </p>
        </div>
      </footer>
    </div>
  );
}
