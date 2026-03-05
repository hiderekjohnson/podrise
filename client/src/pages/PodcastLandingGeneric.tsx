import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Loader2, ArrowRight, Headphones, Zap, Clock, Mail, ChevronDown, ChevronUp } from "lucide-react";
import { motion } from "framer-motion";
import { useRegister, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import { getPodcastBySlug } from "@/data/podcastLandingData";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

function generateFaqItems(name: string, hosts: string, faqTopics: string, category: string) {
  return [
    {
      q: `What is PodCap's ${name} daily summary?`,
      a: `PodCap delivers a concise AI-powered recap of the latest ${name} podcast episodes straight to your inbox every morning. Each summary covers the key insights on ${faqTopics} — so you stay informed even when you don't have time to listen.`,
    },
    {
      q: `How does the ${name} podcast summary work?`,
      a: `Every day, PodCap checks for new ${name} episodes, pulls real transcripts when available, and uses AI to generate a detailed digest. You'll get the biggest takeaways, specific insights, memorable quotes, and conversation starters — all formatted for a quick read over your morning coffee.`,
    },
    {
      q: `Is this an official ${name} product?`,
      a: `No. PodCap is an independent podcast summary service and is not affiliated with, endorsed by, or sponsored by ${name} or ${hosts}. We're fans who built a tool to help other listeners keep up with the show.`,
    },
    {
      q: "Can I get summaries of other podcasts too?",
      a: "Yes! Once you create your free PodCap account, you can add up to 3 podcasts to your daily digest. Choose from thousands of popular podcasts. Upgrade to PodCap Pro for unlimited podcasts.",
    },
    {
      q: `What topics does ${name} cover?`,
      a: `${name} is a ${category.toLowerCase()} podcast hosted by ${hosts} that covers ${faqTopics}.`,
    },
    {
      q: `When will I receive my daily ${name} summary?`,
      a: "You choose your preferred delivery time during setup. Most listeners pick early morning so the recap is waiting in their inbox when they wake up. You can also customize your timezone and delivery schedule from your dashboard.",
    },
    {
      q: "How much does PodCap cost?",
      a: `PodCap is free for up to 3 podcasts. If you want unlimited podcast summaries, you can upgrade to PodCap Pro for $9.99/month. The ${name} summary is included in the free plan.`,
    },
    {
      q: `What if ${name} doesn't release an episode today?`,
      a: `PodCap only sends you a digest when there are new episodes. If ${name} (or your other selected podcasts) didn't release anything, you won't receive an empty email — we respect your inbox.`,
    },
  ];
}

export default function PodcastLandingGeneric() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const config = getPodcastBySlug(slug || "");

  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  const { toast } = useToast();
  const { mutate: register, isPending } = useRegister();
  const [email, setEmail] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    if (!config) return;

    const { name, slug: s, keywords, hosts, description } = config;
    const url = `https://podcap.io/podcasts/${s}`;

    document.title = `${name} Podcast Summary & Recap — Daily Episode Recaps | PodCap`;

    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };

    setMeta("name", "description", `Get free daily ${name} podcast summaries and episode recaps. AI-powered ${name} podcast recap of every new episode by ${hosts} — ${description} delivered to your inbox.`);
    setMeta("name", "keywords", `${name} podcast summary, ${name} episode summary, ${name} podcast recap, ${name} recap, ${keywords}, podcast summary, daily podcast recap`);
    setMeta("property", "og:title", `${name} Podcast Summary & Recap — Free Daily Episode Recaps | PodCap`);
    setMeta("property", "og:description", `AI-powered daily ${name} podcast summaries and episode recaps. ${description.charAt(0).toUpperCase() + description.slice(1)} — delivered free to your inbox.`);
    setMeta("property", "og:url", url);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", "PodCap");
    setMeta("name", "twitter:card", "summary");
    setMeta("name", "twitter:title", `${name} Podcast Summary & Recap | PodCap`);
    setMeta("name", "twitter:description", `Free daily AI-powered ${name} podcast summaries and episode recaps delivered to your inbox.`);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) { canonical = document.createElement("link"); canonical.setAttribute("rel", "canonical"); document.head.appendChild(canonical); }
    canonical.setAttribute("href", url);

    let jsonLd = document.querySelector('script[data-seo="podcast-landing"]');
    if (!jsonLd) { jsonLd = document.createElement("script"); jsonLd.setAttribute("type", "application/ld+json"); jsonLd.setAttribute("data-seo", "podcast-landing"); document.head.appendChild(jsonLd); }
    jsonLd.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": `${name} Podcast Summary & Recap`,
      "description": `Free daily AI-powered ${name} podcast summary and episode recap. ${description.charAt(0).toUpperCase() + description.slice(1)} delivered to your inbox.`,
      "url": url,
      "publisher": { "@type": "Organization", "name": "PodCap", "url": "https://podcap.io" },
      "about": { "@type": "PodcastSeries", "name": name },
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD", "description": `Free daily ${name} podcast recap delivered by email` },
    });

    return () => {
      const ld = document.querySelector('script[data-seo="podcast-landing"]');
      if (ld) ld.remove();
    };
  }, [config]);

  if (!config) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
          <a href="/" className="flex items-center" data-testid="link-home">
            <img src={logoPath} alt="PodCap" className="h-9 object-contain" />
          </a>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Podcast not found</h1>
            <p className="text-muted-foreground mb-4">We couldn't find a landing page for this podcast.</p>
            <a href="/podcasts" className="text-primary hover:underline">Browse all podcasts</a>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (user) {
    navigate("/dashboard");
    return null;
  }

  const { name, hosts, category, faqTopics, description: desc } = config;
  const faqItems = generateFaqItems(name, hosts, faqTopics, category);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }

    register(
      {
        podcasts: [JSON.stringify({ id: slug, name, artworkUrl: config.artworkUrl || "" })],
        email,
      },
      {
        onSuccess: () => {
          toast({ title: "You're in!", description: `Your ${name} digest is set up. Redirecting...` });
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
        <a href="/" className="flex items-center" data-testid="link-home">
          <img src={logoPath} alt="PodCap" className="h-9 object-contain" />
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
            className="flex flex-col items-center gap-6"
          >
            {config.artworkUrl && (
              <img
                src={config.artworkUrl}
                alt={name}
                className="w-28 h-28 sm:w-36 sm:h-36 rounded-3xl object-cover shadow-xl shadow-black/10"
                data-testid="img-podcast-artwork"
              />
            )}

            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/8 border border-primary/15 rounded-full">
              <Headphones className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary tracking-wide uppercase">Free Daily Podcast Summary & Recap</span>
            </div>

            <h1
              className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.02em] text-center"
              data-testid="heading-main"
            >
              {name}{" "}
              <span className="text-primary">podcast summary</span>,{" "}
              daily
            </h1>

            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed text-center max-w-2xl">
              Get a free AI-powered {name} podcast recap and episode summary
              delivered to your inbox every morning. All the {desc} from {hosts} — without listening to the full episode.
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

            <p className="text-xs text-muted-foreground/60 text-center">
              Free forever for up to 3 podcasts. No credit card required.
            </p>
          </motion.div>
        </section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="w-full max-w-4xl pb-16"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="glass-panel rounded-2xl p-6 flex flex-col items-center text-center gap-3" data-testid="feature-ai">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-display font-bold text-foreground">AI-Powered Recaps</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Real transcript analysis extracts the best ideas, quotes, and
                actionable insights from every {name} episode.
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
                Each episode can be 30–180 minutes. Your PodCap recap takes 5 minutes to read
                and covers everything worth knowing.
              </p>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="w-full max-w-3xl pb-20"
        >
          <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground text-center mb-8" data-testid="heading-faq">
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {faqItems.map((item, i) => (
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
          transition={{ duration: 0.5, delay: 0.5 }}
          className="w-full max-w-2xl pb-20"
        >
          <div className="glass-panel rounded-3xl p-8 sm:p-10 text-center flex flex-col items-center gap-5">
            {config.artworkUrl ? (
              <img
                src={config.artworkUrl}
                alt={name}
                className="w-16 h-16 rounded-xl object-cover shadow-md shadow-black/10"
                data-testid="img-podcast-artwork-bottom"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
                <Headphones className="w-8 h-8 text-primary" />
              </div>
            )}
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-foreground">
              Start getting {name} recaps today
            </h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Join thousands of listeners who save time with PodCap's AI-powered podcast summaries.
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

      <Footer />
    </div>
  );
}
