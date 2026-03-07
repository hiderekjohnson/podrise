import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Send, ArrowRight, Lightbulb, LifeBuoy, CheckCircle2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import { apiRequest } from "@/lib/queryClient";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

interface ChangelogEntry {
  title: string;
  description: string;
  link?: { url: string; label: string };
  emoji: string;
}

const changelog: ChangelogEntry[] = [
  {
    title: "PodCap is now on X",
    description: "We created an X account where we'll be posting our top episode recaps daily. Follow us to discover great episodes and stay in the loop.",
    link: { url: "https://x.com/podcap_io", label: "Follow @podcap_io on X" },
    emoji: "𝕏",
  },
  {
    title: "For Podcasters — we're here to help, not hurt",
    description: "There was some confusion from podcasters that PodCap might lower listening. It's far from the truth. We built a dedicated page to explain how PodCap actually helps podcasters by keeping superfans engaged, boosting completion rates, and improving algorithm performance. We love podcasters, and this service is completely free for creators.",
    link: { url: "/for-podcasters", label: "Read our message to podcasters" },
    emoji: "❤️",
  },
  {
    title: "AI-generated episode recaps on every podcast page",
    description: "Each podcast page now features a real AI-powered episode summary so you can preview exactly what your daily podcast recap looks like before signing up.",
    link: { url: "/podcasts/joerogan", label: "Read Joe Rogan's latest episode summary" },
    emoji: "📝",
  },
  {
    title: "Dedicated podcast summary pages for individual shows",
    description: "Podcasters reached out and asked for their own sign-up pages — so we built them. Each page is a hub for that podcast's daily recaps, episode summaries, and show info. If you're a podcaster and want your own page, we'd love to hear from you.",
    link: { url: "/podcasts/myfirstmillion", label: "See the My First Million podcast summary page" },
    emoji: "🎙️",
  },
  {
    title: "Help & Support center",
    description: "Sorry we didn't think of this sooner — you can now reach us anytime with questions, issues, or feedback about your podcast summaries.",
    link: { url: "/support", label: "Visit the PodCap support page" },
    emoji: "💬",
  },
  {
    title: "PodCap Pro — unlimited podcast summaries",
    description: "Follow more than 3 podcasts with our Pro plan for $9.99/month. Get unlimited AI-powered podcast recaps and episode summaries delivered to your inbox daily.",
    emoji: "⭐",
  },
  {
    title: "Top podcasts directory",
    description: "Browse and discover the top podcasts on PodCap. Each show has its own dedicated page with episode summaries, show details, and one-click sign-up for daily recaps.",
    link: { url: "/podcasts", label: "Explore the top podcast summaries" },
    emoji: "📊",
  },
  {
    title: "View and re-send past recaps from your dashboard",
    description: "Your daily podcast recaps aren't just emails anymore. Log in to your PodCap account to browse all your previous episode summaries — and re-send any recap to your inbox if you need it again.",
    emoji: "📂",
  },
  {
    title: "No new episodes? No email",
    description: "We turned off recap emails on days when none of your podcasts dropped a new episode. One less unnecessary email in your inbox — you're welcome.",
    emoji: "📭",
  },
  {
    title: "Vacation mode for your daily podcast recaps",
    description: "Going on a trip? Pause your daily podcast summaries until a specific date. You can update or cancel vacation mode anytime from your dashboard settings.",
    emoji: "🏖️",
  },
  {
    title: "Custom delivery time for podcast summaries",
    description: "Choose exactly when you'd like to receive your daily podcast recap. Early bird or night owl — your AI-powered episode summary arrives on your schedule.",
    emoji: "⏰",
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
    document.title = "PodCap Updates — New Podcast Summary Features & Changelog";

    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };

    setMeta("name", "description", "See the latest PodCap features — AI-powered podcast summaries, episode recaps, custom delivery times, vacation mode, podcast deals, and more. Request new features for your daily podcast digest.");
    setMeta("name", "keywords", "podcast summary updates, podcast recap features, PodCap changelog, podcast digest features, AI podcast summary, episode recap updates");
    setMeta("property", "og:title", "PodCap Updates — New Podcast Summary Features & Changelog");
    setMeta("property", "og:description", "See the latest PodCap features for AI-powered podcast summaries and episode recaps. Request new features for your daily podcast digest.");
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
      "name": "PodCap Updates — Podcast Summary Features & Changelog",
      "description": "See the latest features for AI-powered podcast summaries and daily episode recaps on PodCap.",
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

        <section className="w-full max-w-2xl pt-10 sm:pt-16 pb-12 text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="flex items-center gap-2 px-3.5 py-1.5 bg-primary/[0.06] border border-primary/[0.1] rounded-full">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary tracking-wide uppercase">Product Updates</span>
            </div>
            <h1
              className="text-[2rem] sm:text-[2.5rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.025em]"
              data-testid="heading-main"
            >
              What's New at PodCap
            </h1>
            <p className="text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
              Everything we've shipped to make your daily podcast summaries better.
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
