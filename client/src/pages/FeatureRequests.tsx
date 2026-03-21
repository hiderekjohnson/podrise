import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Send, ArrowRight, Lightbulb, LifeBuoy, CheckCircle2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import { apiRequest } from "@/lib/queryClient";
import { SiteHeader } from "@/components/SiteHeader";

interface ChangelogEntry {
  title: string;
  description: string;
  link: { url: string; label: string };
  emoji: string;
  date: string;
}

const changelog: ChangelogEntry[] = [
  {
    title: "AI-powered sponsor filtering keeps the Pod Shop honest",
    description: "We built an AI algorithm that automatically detects and filters out sponsored ads, paid placements, and affiliate pitches from the Pod Shop — so only genuine host recommendations make the cut. If a host truly loves a product and talks about it organically, it stays. If it's a read-from-a-script ad spot, it's gone. Sorry, AG1.",
    link: { url: "/shop", label: "See what hosts actually recommend" },
    emoji: "🛡️",
    date: "Mar 15, 2026",
  },
  {
    title: "Pod Shop — discover what podcast hosts genuinely recommend",
    description: "Ever heard a host rave about a product and wanted to find it later? The Pod Shop collects every tool, book, service, and product that podcast hosts organically recommend — not the paid ads, just the stuff they actually use. Filter by podcast, browse by category, or search for something specific. It's like a curated marketplace powered by real host enthusiasm.",
    link: { url: "/shop", label: "Browse the Pod Shop" },
    emoji: "🛍️",
    date: "Mar 13, 2026",
  },
  {
    title: "Pod Shop search by podcast",
    description: "Wondering which books your favorite podcast has recommended over the years? You can now search the Pod Shop by podcast name to see every book mentioned across all episodes of a specific show. It's a great way to build a reading list curated by hosts you trust.",
    link: { url: "/shop", label: "Search books by podcast" },
    emoji: "📖",
    date: "Feb 27, 2026",
  },
  {
    title: "Advertise on PodRise",
    description: "We opened up advertising for brands that want to reach an engaged audience of podcast enthusiasts, professionals, and curious minds. Choose from multiple ad formats, target by topic or audience interest, and connect with listeners who are actively seeking knowledge. Everything is transparent — no hidden placements.",
    link: { url: "/advertise", label: "See advertising options" },
    emoji: "📣",
    date: "Feb 23, 2026",
  },
  {
    title: "Podcasters can now claim their show",
    description: "If you host a podcast, you can now officially claim your show on PodRise. Once verified, you can set a custom byline, manage how your sponsors appear, and control your show's presence on the platform. It takes about 30 seconds and gives you full ownership of your PodRise page.",
    link: { url: "/podcaster/claim", label: "Claim your podcast" },
    emoji: "✅",
    date: "Feb 21, 2026",
  },
  {
    title: "Mobile layout improvements across the entire site",
    description: "We spent a full week reworking layouts, tap targets, and typography to make PodRise feel truly native on phones and tablets. Episode recaps, podcast pages, the Pod Shop, and every other section now adapt beautifully to smaller screens. If you've been using PodRise on desktop, give it a try on your phone — it's a much better experience now.",
    link: { url: "/podcasts", label: "Try it on your phone" },
    emoji: "📱",
    date: "Feb 19, 2026",
  },
  {
    title: "Curated book recommendations from episodes",
    description: "Every podcast page and episode recap now surfaces books mentioned by hosts and guests. We built a dedicated Pod Shop with curated shelves, ratings, and host context so you can discover your next great read from the podcasts you already love — no more scrambling to remember that title someone mentioned at minute 47.",
    link: { url: "/shop", label: "Browse the Pod Shop" },
    emoji: "📚",
    date: "Feb 15, 2026",
  },
  {
    title: "Direct quotes from every episode",
    description: "Sometimes the best part of a podcast is a single sentence that stops you in your tracks. We now pull up to five of the most insightful quotes from each episode, complete with speaker attribution and context. Share them, save them, or just enjoy the highlights without committing to a full hour of listening.",
    link: { url: "/podcasts/hubaborherman", label: "See quotes in an episode recap" },
    emoji: "💬",
    date: "Feb 13, 2026",
  },
  {
    title: "Higher quality episode recaps with better insights",
    description: "We completely rebuilt our AI recap engine from the ground up for clarity and accuracy. Recaps now feature better-structured key insights, smarter guest detection from episode titles, and cleaner formatting so the important details stand out. If you tried PodRise early on and found recaps hit-or-miss, give them another look — the difference is night and day.",
    link: { url: "/podcasts", label: "Read improved recaps" },
    emoji: "✨",
    date: "Feb 11, 2026",
  },
  {
    title: "Ask AI about any podcast",
    description: "Have a question about a podcast but don't want to scrub through hours of episodes? Our Ask AI feature lets you type a natural-language question about any show and get an instant answer drawn from the full history of episode recaps and summaries. It's like having a research assistant who's listened to every single episode.",
    link: { url: "/podcasts/allin", label: "Try Ask AI on All-In Podcast" },
    emoji: "🤖",
    date: "Feb 9, 2026",
  },
  {
    title: "Host bios and photos on every podcast page",
    description: "We pulled in host bios and profile photos from social media so every podcast page now feels more personal and complete. Knowing who's behind the mic makes a difference — especially when you're deciding whether to follow a new show. It's a small touch, but it makes the whole experience feel more human.",
    link: { url: "/podcasts/myfirstmillion", label: "See host profiles in action" },
    emoji: "👤",
    date: "Feb 7, 2026",
  },
  {
    title: "Redesigned episode recaps for faster scanning",
    description: "Episode recap pages got a major facelift. Content is now organized into clean, numbered cards — Key Insights, What Happened, Guests, Quotes, and Ask AI — so you can scan quickly for the bits you care about or deep-dive into the full breakdown. It's the same information, just much easier to navigate.",
    link: { url: "/podcasts/joerogan", label: "See the new recap layout" },
    emoji: "🎨",
    date: "Feb 5, 2026",
  },
  {
    title: "Listen to the full episode from any recap",
    description: "Every episode recap now includes direct links to Apple Podcasts and Spotify so you can jump straight to the full episode whenever a summary catches your ear. We built PodRise to help you discover great podcast content, not replace it — and now it's one tap from recap to full listen.",
    link: { url: "/podcasts", label: "Find an episode to listen to" },
    emoji: "🎧",
    date: "Jan 31, 2026",
  },
  {
    title: "Delete your account and all your data",
    description: "Free-tier users can now permanently delete their account and all associated data from the Settings tab in the dashboard. Your data is yours — and if you ever decide PodRise isn't for you, we make it painless to leave. No hoops, no retention dark patterns, just a clean exit.",
    link: { url: "/dashboard", label: "Manage your account settings" },
    emoji: "🗑️",
    date: "Jan 29, 2026",
  },
  {
    title: "Account management in your dashboard",
    description: "You can now manage your account settings, update your email, adjust delivery preferences, and view your recap history all from your dashboard. We want managing PodRise to be as smooth as using it.",
    link: { url: "/dashboard", label: "Manage your account" },
    emoji: "💳",
    date: "Jan 27, 2026",
  },
  {
    title: "About Us — the story behind PodRise",
    description: "A lot of people were asking who built PodRise and why, so we put together a proper About page with the story behind the project. We're a small team that believes podcast knowledge shouldn't be locked behind hours of listening — and we wanted to share that mission more clearly.",
    link: { url: "/about", label: "Read our story" },
    emoji: "👋",
    date: "Jan 25, 2026",
  },
  {
    title: "PodRise is now on X",
    description: "We created an X account where we post our top episode recaps daily. If you want a low-commitment way to discover great podcast episodes and stay in the loop on new PodRise features, give us a follow. We're posting the good stuff, not just announcements.",
    link: { url: "https://x.com/podrise_hq", label: "Follow @podrise_hq on X" },
    emoji: "𝕏",
    date: "Jan 23, 2026",
  },
  {
    title: "For Podcasters — we're here to help, not hurt",
    description: "Some podcasters worried that PodRise might lower their listen counts. The opposite is true. We built a dedicated page explaining how PodRise actually helps creators — by keeping superfans engaged between episodes, boosting completion rates for listeners who preview first, and improving algorithm performance through consistent engagement. This service is completely free for creators, and we love the people who make podcasts.",
    link: { url: "/we-heart-podcasters", label: "Read our message to podcasters" },
    emoji: "❤️",
    date: "Jan 21, 2026",
  },
  {
    title: "AI-generated episode recaps on every podcast page",
    description: "Each podcast page now features a real AI-powered episode summary so you can preview exactly what your daily recap looks like before signing up. No more guessing whether PodRise is worth it — just visit any podcast page and read the latest recap for yourself. It's the best way to see the quality before you commit.",
    link: { url: "/podcasts/joerogan", label: "Read Joe Rogan's latest episode summary" },
    emoji: "📝",
    date: "Jan 19, 2026",
  },
  {
    title: "Dedicated podcast pages for individual shows",
    description: "Every podcast on PodRise now has its own dedicated page — a hub for daily recaps, episode summaries, show info, and one-click sign-up. Podcasters asked for this so they could share a clean link with their audience, and listeners love having a single place to catch up on their favorite show.",
    link: { url: "/podcasts/myfirstmillion", label: "See the My First Million page" },
    emoji: "🎙️",
    date: "Jan 17, 2026",
  },
  {
    title: "Help & Support center",
    description: "Sorry we didn't think of this sooner — you can now reach us anytime with questions, issues, or feedback about your podcast summaries. Whether something looks off in a recap or you have an idea for a feature, the Support center is the fastest way to get our attention.",
    link: { url: "/contact", label: "Visit the contact page" },
    emoji: "🆘",
    date: "Jan 15, 2026",
  },
  {
    title: "Unlimited podcast summaries for everyone",
    description: "PodRise is now completely free with no limits on how many podcasts you can follow. Add as many shows as you want and get unlimited AI-powered podcast recaps and episode summaries delivered to your inbox daily.",
    link: { url: "/register", label: "Get started for free" },
    emoji: "⭐",
    date: "Jan 13, 2026",
  },
  {
    title: "Top podcasts directory",
    description: "We launched a browsable directory of the top podcasts on PodRise. Each show has its own page with episode summaries, show details, and one-click sign-up for daily recaps. It's the easiest way to discover new shows and see what other PodRise users are following.",
    link: { url: "/podcasts", label: "Browse top podcasts" },
    emoji: "📊",
    date: "Jan 11, 2026",
  },
  {
    title: "View and re-send past recaps from your dashboard",
    description: "Your daily podcast recaps aren't just emails anymore. Log in to your dashboard to browse all your previous episode summaries — and re-send any recap to your inbox if you need it again. It's your personal archive of podcast knowledge, organized by date and show.",
    link: { url: "/dashboard", label: "Browse your recap archive" },
    emoji: "📂",
    date: "Jan 9, 2026",
  },
  {
    title: "No new episodes? No email",
    description: "We turned off recap emails on days when none of your followed podcasts dropped a new episode. It sounds obvious, but a lot of newsletter products don't do this. One less unnecessary email in your inbox — you're welcome.",
    link: { url: "/dashboard", label: "Manage your email preferences" },
    emoji: "📭",
    date: "Jan 5, 2026",
  },
  {
    title: "Vacation mode for your daily podcast recaps",
    description: "Going on a trip? Pause your daily podcast summaries until a specific date and they'll automatically resume when you're back. You can update or cancel vacation mode anytime from your dashboard settings. Because even podcast superfans deserve a break.",
    link: { url: "/dashboard", label: "Set up vacation mode" },
    emoji: "🏖️",
    date: "Jan 3, 2026",
  },
  {
    title: "PodRise is live — your daily AI podcast recap starts now",
    description: "Today we're launching PodRise, the easiest way to stay on top of your favorite podcasts without listening to every episode. Sign up, pick your shows, and get a concise AI-powered recap delivered to your inbox every morning. We built this because we love podcasts but can't listen to everything — and we think you'll love it too. Welcome aboard.",
    link: { url: "/", label: "Get started with PodRise" },
    emoji: "🚀",
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
    document.title = "What's New — PodRise Updates, Features & Product Changelog | PodRise";

    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };

    const desc = "See what we've shipped — AI podcast recaps, episode summaries, topic intelligence, and more. Follow PodRise's product journey and request features.";
    setMeta("name", "description", desc);
    setMeta("name", "keywords", "podcast recap updates, podcast summary features, PodRise changelog, AI podcast knowledge, episode recap platform");
    setMeta("property", "og:title", "What's New — PodRise Updates, Features & Product Changelog | PodRise");
    setMeta("property", "og:description", desc);
    setMeta("property", "og:url", "https://podrise.com/updates");
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", "PodRise");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:site", "@podrise_hq");
    setMeta("name", "twitter:title", "What's New — PodRise Updates, Features & Product Changelog | PodRise");
    setMeta("name", "twitter:description", desc);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) { canonical = document.createElement("link"); canonical.setAttribute("rel", "canonical"); document.head.appendChild(canonical); }
    canonical.setAttribute("href", "https://podrise.com/updates");

    let jsonLd = document.querySelector('script[data-seo="updates"]');
    if (!jsonLd) { jsonLd = document.createElement("script"); jsonLd.setAttribute("type", "application/ld+json"); jsonLd.setAttribute("data-seo", "updates"); document.head.appendChild(jsonLd); }
    jsonLd.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "What's New - PodRise Updates, Features & Changelog",
      "description": "See what we've shipped - AI-powered podcast recaps, podcast summaries, and more. Follow PodRise's journey building the world's searchable library of podcast knowledge.",
      "url": "https://podrise.com/updates",
      "publisher": { "@type": "Organization", "name": "PodRise", "url": "https://podrise.com" },
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
      <SiteHeader />

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
            <h1 className="sr-only">What's New at PodRise</h1>
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
                      <p className="text-[15px] text-muted-foreground/50 font-medium mb-1">{entry.date}</p>
                      <h3 className="text-[15px] font-bold text-foreground leading-snug mb-1.5">{entry.title}</h3>
                      <p className="text-base text-[#52525B] dark:text-[#A1A1AA] leading-relaxed">{entry.description}</p>
                      <a
                        href={entry.link.url}
                        className="inline-flex items-center gap-1.5 text-base font-medium text-primary hover:text-primary/80 transition-colors mt-3"
                        data-testid={`changelog-link-${i}`}
                      >
                        {entry.link.label}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </a>
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
                <p className="text-[15px] text-muted-foreground">We read every suggestion - your ideas shape PodRise.</p>
              </div>
            </div>

            {sent ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center" data-testid="section-sent-confirmation">
                <div className="w-12 h-12 rounded-full bg-[#6366F1]/10 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-[#6366F1]" />
                </div>
                <p className="text-base font-semibold text-foreground">Thanks for the idea!</p>
                <p className="text-base text-[#52525B] dark:text-[#A1A1AA] max-w-xs">We read every suggestion and will reach out if we have questions.</p>
                <button
                  onClick={() => { setSent(false); setMessage(""); setEmail(""); }}
                  className="text-base font-medium text-primary hover:text-primary/80 transition-colors mt-1"
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
                    placeholder="I'd love it if PodRise could..."
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
                    href="/contact"
                    className="flex items-center gap-1.5 text-[15px] text-muted-foreground hover:text-foreground transition-colors"
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
