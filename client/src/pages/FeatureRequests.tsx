import { useState } from "react";
import { motion } from "framer-motion";
import { Rocket, Send, Sparkles, Calendar, ExternalLink, ArrowRight, Lightbulb, LifeBuoy, CheckCircle2, PartyPopper } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import { apiRequest } from "@/lib/queryClient";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

interface ChangelogEntry {
  date: string;
  title: string;
  description: string;
  link?: { url: string; label: string };
  emoji: string;
}

const changelog: ChangelogEntry[] = [
  {
    date: "March 2026",
    title: "Example recaps on podcast pages",
    description: "Each individual podcast page now shows a real AI-generated recap so you can see exactly what you'll get before signing up.",
    link: { url: "/podcasts/joerogan", label: "See an example" },
    emoji: "📝",
  },
  {
    date: "March 2026",
    title: "Individual podcast sign-up pages",
    description: "We had multiple podcasters reach out and say they wanted their own sign-up pages just for their podcast — so we built them. If you're a podcaster and want your own page, reach out to us!",
    link: { url: "/podcasts/myfirstmillion", label: "See an example" },
    emoji: "🎙️",
  },
  {
    date: "March 2026",
    title: "Help & Support page",
    description: "Sorry we didn't think of this sooner — you can now reach us anytime with questions, issues, or feedback.",
    link: { url: "/support", label: "Visit support" },
    emoji: "💬",
  },
  {
    date: "March 2026",
    title: "PodCap Pro — unlimited podcasts",
    description: "You can now follow more than 3 podcasts with our new Pro tier for $9.99/month. Get unlimited podcast recaps delivered daily.",
    emoji: "⭐",
  },
  {
    date: "March 2026",
    title: "Podcast Deals page",
    description: "We now extract sponsor deals, promo codes, and special offers mentioned in podcast episodes so you never miss a deal.",
    link: { url: "/podcast-deals", label: "Browse deals" },
    emoji: "🏷️",
  },
  {
    date: "March 2026",
    title: "Most Popular Podcasts directory",
    description: "Browse and discover the most popular podcasts on PodCap, with individual pages for each one.",
    link: { url: "/podcasts", label: "Explore podcasts" },
    emoji: "📊",
  },
  {
    date: "February 2026",
    title: "Vacation mode",
    description: "Going on a trip? Put your daily recaps on pause until a specific date. You can update or cancel vacation mode anytime from your settings.",
    emoji: "🏖️",
  },
  {
    date: "February 2026",
    title: "Custom delivery time",
    description: "Choose exactly when you'd like to receive your daily recap. Early bird or night owl — your digest arrives on your schedule.",
    emoji: "⏰",
  },
];

export default function FeatureRequests() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

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

        <section className="w-full max-w-3xl pt-10 sm:pt-16 pb-14 text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-2">
              <Rocket className="w-7 h-7 text-primary" />
            </div>
            <h1
              className="text-[2rem] sm:text-[2.5rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.025em]"
              data-testid="heading-main"
            >
              What's New & What's Next
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
              See what we've been building and tell us what you'd love to see next.
            </p>
          </motion.div>
        </section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-3xl pb-16"
        >
          <div className="bg-white border border-black/[0.06] rounded-2xl p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <Lightbulb className="w-4.5 h-4.5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-base font-display font-bold text-foreground">Submit a Feature Request</h2>
                <p className="text-xs text-muted-foreground">We read every suggestion — your ideas shape PodCap.</p>
              </div>
            </div>

            {sent ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center" data-testid="section-sent-confirmation">
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-sm font-semibold text-foreground">Thanks for the idea!</p>
                <p className="text-sm text-muted-foreground">We read every suggestion and will reach out if we have questions.</p>
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
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Your idea</label>
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
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Email (optional — so we can follow up)</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full h-11 px-4 bg-white border border-black/[0.08] rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/25 transition-all"
                    data-testid="input-email"
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <a
                    href="/support"
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="link-support"
                  >
                    <LifeBuoy className="w-3.5 h-3.5" />
                    Having an issue? Contact support instead
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

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full max-w-3xl pb-20"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <PartyPopper className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-display font-extrabold text-foreground" data-testid="heading-changelog">Changelog</h2>
              <p className="text-xs text-muted-foreground">Everything we've shipped so far.</p>
            </div>
          </div>

          <div className="relative">
            <div className="absolute left-[15px] top-2 bottom-2 w-px bg-black/[0.06]" />

            <div className="space-y-1">
              {changelog.map((entry, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.25 + i * 0.04 }}
                  className="relative pl-10 py-4 group"
                  data-testid={`changelog-entry-${i}`}
                >
                  <div className="absolute left-[9px] top-[22px] w-[13px] h-[13px] rounded-full bg-white border-2 border-primary/30 group-hover:border-primary transition-colors" />

                  <div className="bg-white border border-black/[0.06] rounded-xl p-5 hover:border-black/[0.1] transition-colors">
                    <div className="flex items-start gap-3">
                      <span className="text-xl leading-none mt-0.5">{entry.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-bold text-foreground">{entry.title}</h3>
                        </div>
                        <p className="text-xs text-muted-foreground/60 mb-2 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {entry.date}
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed">{entry.description}</p>
                        {entry.link && (
                          <a
                            href={entry.link.url}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors mt-2"
                            data-testid={`changelog-link-${i}`}
                          >
                            {entry.link.label}
                            <ArrowRight className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              More coming soon. Have an idea?{" "}
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="text-primary font-medium hover:text-primary/80 transition-colors"
                data-testid="button-scroll-to-top"
              >
                Tell us what you'd like to see
              </button>
            </p>
          </div>
        </motion.section>

      </main>

      <Footer />
    </div>
  );
}
