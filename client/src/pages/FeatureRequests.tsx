import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Send, ArrowRight, Lightbulb, LifeBuoy, CheckCircle2, Sparkles, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import { apiRequest } from "@/lib/queryClient";
import { PodCapWordmark } from "@/components/PodCapHeader";

interface ChangelogEntry {
  title: string;
  description: string;
  link?: { url: string; label: string };
  emoji: string;
  date: string;
}

const changelog: ChangelogEntry[] = [
  {
    title: "Full episode transcripts",
    description: "Every episode now has a full, searchable transcript you can read right alongside the recap.",
    link: { url: "/podcasts/myfirstmillion", label: "Read a transcript" },
    emoji: "📜",
    date: "Mar 7, 2026",
  },
  {
    title: "Search across transcripts",
    description: "Search any keyword across all episodes of a podcast and find exactly where it was discussed, with direct links to the relevant transcript sections.",
    emoji: "🔍",
    date: "Mar 4, 2026",
  },
  {
    title: "Ask AI about any podcast",
    description: "Ask questions about any podcast and get AI-powered answers drawn from real transcripts and episode summaries across the entire show's history.",
    emoji: "🤖",
    date: "Feb 28, 2026",
  },
  {
    title: "Host bios and photos",
    description: "Every podcast page now shows host bios and profile photos pulled from their social media accounts. We love our hosts!",
    emoji: "👤",
    date: "Feb 25, 2026",
  },
  {
    title: "Redesigned episode recaps",
    description: "Episode recap pages now organize content into clean, numbered cards — TLDL, Key Insights, Episode Breakdown, Key Topics, Top Questions, and Ask AI — so you can scan or deep-dive however you prefer.",
    emoji: "✨",
    date: "Feb 21, 2026",
  },
  {
    title: "Key Topics and Top Questions",
    description: "Each episode recap now highlights the main topics discussed and the most interesting questions raised during the episode.",
    emoji: "💡",
    date: "Feb 18, 2026",
  },
  {
    title: "Listen to the full episode",
    description: "Every episode recap now includes direct links to Apple Podcasts and Spotify so you can jump straight to the full episode whenever a summary catches your ear.",
    emoji: "🎧",
    date: "Feb 14, 2026",
  },
  {
    title: "Delete your account",
    description: "Free-tier users can now permanently delete their account and all associated data from the Settings tab in the dashboard. Because your data is yours.",
    emoji: "🗑️",
    date: "Feb 10, 2026",
  },
  {
    title: "Pro plan management",
    description: "Pro subscribers can now view billing history, update their payment method, and manage their subscription directly from the Your Plan tab — no need to dig through emails.",
    emoji: "💳",
    date: "Feb 6, 2026",
  },
  {
    title: "About Us page",
    description: "A lot of people were asking about who built PodCap and why, so we put together an About Us page with the story behind the project and the team.",
    link: { url: "/about", label: "Read our story" },
    emoji: "👋",
    date: "Feb 3, 2026",
  },
  {
    title: "PodCap is now on X",
    description: "We created an X account where we'll be posting our top episode recaps daily. Follow us to discover great episodes and stay in the loop.",
    link: { url: "https://x.com/podcap_io", label: "Follow @podcap_io on X" },
    emoji: "𝕏",
    date: "Jan 30, 2026",
  },
  {
    title: "For Podcasters — we're here to help, not hurt",
    description: "There was some confusion from podcasters that PodCap might lower listening. It's far from the truth. We built a dedicated page to explain how PodCap actually helps podcasters by keeping superfans engaged, boosting completion rates, and improving algorithm performance. We love podcasters, and this service is completely free for creators.",
    link: { url: "/we-heart-podcasters", label: "Read our message to podcasters" },
    emoji: "❤️",
    date: "Jan 27, 2026",
  },
  {
    title: "AI-generated episode recaps on every podcast page",
    description: "Each podcast page now features a real AI-powered episode summary so you can preview exactly what your daily podcast recap looks like before signing up.",
    link: { url: "/podcasts/joerogan", label: "Read Joe Rogan's latest episode summary" },
    emoji: "📝",
    date: "Jan 23, 2026",
  },
  {
    title: "Dedicated podcast summary pages for individual shows",
    description: "Podcasters reached out and asked for their own sign-up pages — so we built them. Each page is a hub for that podcast's daily recaps, episode summaries, and show info. If you're a podcaster and want your own page, we'd love to hear from you.",
    link: { url: "/podcasts/myfirstmillion", label: "See the My First Million podcast summary page" },
    emoji: "🎙️",
    date: "Jan 20, 2026",
  },
  {
    title: "Help & Support center",
    description: "Sorry we didn't think of this sooner — you can now reach us anytime with questions, issues, or feedback about your podcast summaries.",
    link: { url: "/support", label: "Visit the PodCap support page" },
    emoji: "💬",
    date: "Jan 17, 2026",
  },
  {
    title: "PodCap Pro — unlimited podcast summaries",
    description: "Follow more than 3 podcasts with our Pro plan for $9.99/month. Get unlimited AI-powered podcast recaps and episode summaries delivered to your inbox daily.",
    emoji: "⭐",
    date: "Jan 14, 2026",
  },
  {
    title: "Top podcasts directory",
    description: "Browse and discover the top podcasts on PodCap. Each show has its own dedicated page with episode summaries, show details, and one-click sign-up for daily recaps.",
    link: { url: "/podcasts", label: "Explore the top podcast summaries" },
    emoji: "📊",
    date: "Jan 11, 2026",
  },
  {
    title: "View and re-send past recaps from your dashboard",
    description: "Your daily podcast recaps aren't just emails anymore. Log in to your PodCap account to browse all your previous episode summaries — and re-send any recap to your inbox if you need it again.",
    emoji: "📂",
    date: "Jan 8, 2026",
  },
  {
    title: "No new episodes? No email",
    description: "We turned off recap emails on days when none of your podcasts dropped a new episode. One less unnecessary email in your inbox — you're welcome.",
    emoji: "📭",
    date: "Jan 5, 2026",
  },
  {
    title: "Vacation mode for your daily podcast recaps",
    description: "Going on a trip? Pause your daily podcast summaries until a specific date. You can update or cancel vacation mode anytime from your dashboard settings.",
    emoji: "🏖️",
    date: "Jan 3, 2026",
  },
  {
    title: "Custom delivery time for podcast summaries",
    description: "Choose exactly when you'd like to receive your daily podcast recap. Early bird or night owl — your AI-powered episode summary arrives on your schedule.",
    emoji: "⏰",
    date: "Jan 1, 2026",
  },
];

export default function FeatureRequests() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "What's New — PodCap Updates, Features & Changelog";

    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };

    setMeta("name", "description", "See what we've shipped — AI-powered podcast recaps, searchable transcripts, episode summaries, people and topic pages, and more. Follow PodCap's journey building the world's searchable library of podcast knowledge.");
    setMeta("name", "keywords", "podcast recap updates, podcast summary features, PodCap changelog, searchable transcripts, AI podcast knowledge, episode recap platform");
    setMeta("property", "og:title", "What's New — PodCap Updates, Features & Changelog");
    setMeta("property", "og:description", "See what we've shipped — AI-powered podcast recaps, searchable transcripts, episode summaries, and more. Follow PodCap's journey.");
    setMeta("property", "og:url", "https://podcap.io/updates");
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", "PodCap");

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) { canonical = document.createElement("link"); canonical.setAttribute("rel", "canonical"); document.head.appendChild(canonical); }
    canonical.setAttribute("href", "https://podcap.io/updates");

    let jsonLd = document.querySelector('script[data-seo="updates"]');
    if (!jsonLd) { jsonLd = document.createElement("script"); jsonLd.setAttribute("type", "application/ld+json"); jsonLd.setAttribute("data-seo", "updates"); document.head.appendChild(jsonLd); }
    jsonLd.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "What's New — PodCap Updates, Features & Changelog",
      "description": "See what we've shipped — AI-powered podcast recaps, searchable transcripts, podcast summaries, and more. Follow PodCap's journey building the world's searchable library of podcast knowledge.",
      "url": "https://podcap.io/updates",
      "publisher": { "@type": "Organization", "name": "PodCap", "url": "https://podcap.io" },
    });

    return () => {
      const ld = document.querySelector('script[data-seo="updates"]');
      if (ld) ld.remove();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast({ title: "Please describe your idea", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      await apiRequest("POST", "/api/support", {
        email: email || "anonymous",
        subject: "Feature Request",
        message: `[FEATURE REQUEST]\n\n${message}`,
      });
      setSent(true);
      toast({ title: "Thanks for the idea!", description: "We read every suggestion." });
    } catch {
      toast({ title: "Something went wrong", description: "Please try again or email us directly.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="sticky top-0 z-50 w-full border-b border-black/[0.04] bg-white/80 backdrop-blur-md" data-testid="nav-bar">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-6">
          <a href="/" className="flex items-center" data-testid="link-home">
            <PodCapWordmark />
          </a>
          <div className="flex items-center gap-4">
            <Link href="/get-started" data-testid="link-nav-get-started">
              <div className="flex items-center gap-1.5 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-xs font-semibold text-primary tracking-wide uppercase hover:bg-primary/15 transition-colors">
                <Zap className="w-3.5 h-3.5" />
                Build Your Recap
              </div>
            </Link>
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-login">
              Log In
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8">

        <section className="w-full max-w-2xl pt-10 sm:pt-16 pb-12 text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full bg-primary/[0.07] text-primary text-base sm:text-lg font-display font-bold uppercase tracking-widest">
              <Sparkles className="w-5 h-5" />
              What's New
            </div>
            <h1 className="sr-only">What's New at PodCap</h1>
            <p className="text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
              Everything we've shipped to build the world's searchable library of podcast knowledge.
            </p>
          </motion.div>
        </section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-2xl pb-16"
        >
          <div className="space-y-3">
            {changelog.map((entry, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.15 + i * 0.04 }}
                data-testid={`changelog-entry-${i}`}
              >
                <div className="bg-white border border-black/[0.06] rounded-2xl p-5 sm:p-6 hover:border-black/[0.1] transition-colors">
                  <div className="flex gap-4">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-black/[0.02] flex items-center justify-center text-xl">
                      {entry.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground/50 font-medium mb-1">{entry.date}</p>
                      <h3 className="text-[15px] font-bold text-foreground leading-snug mb-1.5">{entry.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{entry.description}</p>
                      {entry.link && (
                        <a
                          href={entry.link.url}
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors mt-3"
                          data-testid={`changelog-link-${i}`}
                        >
                          {entry.link.label}
                          <ArrowRight className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        <motion.section
          ref={formRef}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="w-full max-w-2xl pb-20"
        >
          <div className="bg-white border border-black/[0.06] rounded-2xl p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                <Lightbulb className="w-4.5 h-4.5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-base font-display font-bold text-foreground">What should we build next?</h2>
                <p className="text-xs text-muted-foreground">We read every suggestion — your ideas shape PodCap.</p>
              </div>
            </div>

            {sent ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center" data-testid="section-sent-confirmation">
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-sm font-semibold text-foreground">Thanks for the idea!</p>
                <p className="text-sm text-muted-foreground max-w-xs">We read every suggestion and will reach out if we have questions.</p>
                <button
                  onClick={() => { setSent(false); setMessage(""); setEmail(""); }}
                  className="text-sm font-medium text-primary hover:text-primary/80 transition-colors mt-1"
                  data-testid="button-submit-another"
                >
                  Submit another idea
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-feature-request">
                <div>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="I'd love it if PodCap could..."
                    rows={3}
                    className="w-full px-4 py-3 bg-white border border-black/[0.08] rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/25 transition-all resize-none"
                    data-testid="textarea-feature-request"
                  />
                </div>
                <div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com (optional)"
                    className="w-full h-11 px-4 bg-white border border-black/[0.08] rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/25 transition-all"
                    data-testid="input-email"
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <a
                    href="/support"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="link-support"
                  >
                    <LifeBuoy className="w-3.5 h-3.5" />
                    Need help? Contact support
                  </a>
                  <button
                    type="submit"
                    disabled={sending}
                    className="h-10 px-5 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-sm bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                    data-testid="button-submit-feature"
                  >
                    {sending ? "Sending..." : (
                      <>
                        Send Idea
                        <Send className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </motion.section>

      </main>

      <Footer />
    </div>
  );
}
