import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Heart, Search, TrendingUp, Headphones, ArrowRight, Mail, Mic, Globe, ChevronRight, BarChart3, UserCheck, Clock, Zap, Send, CheckCircle2, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/Footer";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

const FEATURED_PODCASTS = [
  { slug: "myfirstmillion", name: "My First Million", description: "Business ideas, side hustles, and startup strategies", artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/fc/be/b0/fcbeb0f0-fb7a-509e-1cd0-ab60222ee7e5/mza_17824311072672278584.jpeg/600x600bb.jpg" },
  { slug: "founders", name: "Founders", description: "Lessons from the biographies of history's greatest entrepreneurs", artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/ed/71/4f/ed714f67-f095-a4ef-f38e-d8c02300666a/mza_11432355988627368701.jpg/600x600bb.jpg" },
  { slug: "allin", name: "All-In Podcast", description: "Tech industry analysis, venture capital insights, and geopolitics", artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts124/v4/c7/d2/92/c7d292ea-44b3-47ff-2f5e-74fa5b23db6c/mza_7005270671777648882.png/600x600bb.jpg" },
  { slug: "acquired", name: "Acquired", description: "Deep-dive stories behind the world's greatest companies", artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/d6/e9/f9/d6e9f92c-8f46-a302-f7a2-144cefbd74bf/mza_16135045473976550452.jpg/600x600bb.jpg" },
  { slug: "hubermanlab", name: "Huberman Lab", description: "Neuroscience-based tools for health, performance, and focus", artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/aa/f1/51/aaf151f6-8661-833a-c9d3-7c4ce22f8868/mza_253061105143942369.jpg/600x600bb.jpg" },
  { slug: "howibuiltthis", name: "How I Built This", description: "The stories behind the world's best-known companies", artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts126/v4/64/45/06/644506b5-c44f-f661-f74e-f63a4b2511bc/mza_14892199991035639268.jpeg/600x600bb.jpg" },
];

function ContactSection() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const submitMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/support", { email, message });
    },
    onSuccess: () => {
      toast({ title: "Message sent", description: "We'll get back to you as soon as possible." });
      setEmail("");
      setMessage("");
      setSent(true);
    },
    onError: () => {
      toast({ title: "Something went wrong", description: "Please try again or email us directly at hello@podcap.io.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !message.trim()) return;
    submitMutation.mutate();
  };

  return (
    <section className="py-16 sm:py-20 bg-muted/30 border-t border-black/[0.04]" data-testid="section-contact">
      <div className="max-w-2xl mx-auto px-6">
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mx-auto mb-5">
            <Headphones className="w-5 h-5 text-emerald-600" />
          </div>
          <h2 className="text-xl sm:text-2xl font-display font-bold mb-3" data-testid="text-contact-title">
            Let's work together
          </h2>
          <p className="text-[15px] text-muted-foreground max-w-md mx-auto leading-relaxed">
            Want to claim your podcast's page, suggest a feature, or explore how PodCap can help your show? We'd love to hear from you.
          </p>
        </div>

        {sent ? (
          <div className="bg-white border border-black/[0.06] rounded-2xl p-8 text-center" data-testid="contact-success">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
            <h3 className="text-lg font-display font-bold mb-2">Message sent</h3>
            <p className="text-[15px] text-muted-foreground">We'll get back to you as soon as possible.</p>
            <button
              onClick={() => setSent(false)}
              className="mt-4 text-[13px] text-primary font-display font-bold hover:underline"
              data-testid="button-send-another"
            >
              Send another message
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white border border-black/[0.06] rounded-2xl p-6 sm:p-8 space-y-4" data-testid="form-contact">
            <div>
              <label htmlFor="podcaster-email" className="block text-[13px] font-display font-semibold mb-1.5">
                Your email
              </label>
              <input
                id="podcaster-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourpodcast.com"
                className="w-full h-10 px-3.5 rounded-xl border border-black/[0.08] bg-background text-[14px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                data-testid="input-email"
              />
            </div>
            <div>
              <label htmlFor="podcaster-message" className="block text-[13px] font-display font-semibold mb-1.5">
                Your message
              </label>
              <textarea
                id="podcaster-message"
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us about your podcast, or what you'd like us to build..."
                rows={4}
                className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.08] bg-background text-[14px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all resize-none"
                data-testid="input-message"
              />
            </div>
            <Button
              type="submit"
              disabled={submitMutation.isPending || !email.trim() || !message.trim()}
              className="w-full rounded-xl font-display font-bold text-[14px] h-10 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
              data-testid="button-submit"
            >
              {submitMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 mr-2" />
              )}
              {submitMutation.isPending ? "Sending..." : "Send Message"}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}

export default function ForPodcasters() {
  useEffect(() => {
    document.title = "For Podcasters | How PodCap Helps Grow Podcast Discovery and Listeners";
    const metaDesc = document.querySelector('meta[name="description"]');
    const desc = "PodCap helps your superfans stay up to date with daily episode recaps. When fans know what each episode covers, they listen to the right ones, boosting engagement, completion rates, and algorithm performance.";
    if (metaDesc) {
      metaDesc.setAttribute("content", desc);
    } else {
      const meta = document.createElement("meta");
      meta.name = "description";
      meta.content = desc;
      document.head.appendChild(meta);
    }
  }, []);

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b border-black/[0.04] bg-white/80 backdrop-blur-md" data-testid="nav-bar">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-6">
          <Link href="/" data-testid="link-home">
            <img src={logoPath} alt="PodCap" className="h-6 object-contain" />
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/podcasts" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-podcasts">
              Top Podcasts
            </Link>
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-login">
              Log In
            </Link>
          </div>
        </div>
      </nav>

      <main className="min-h-screen bg-background">

        {/* ── Hero ── */}
        <section className="relative overflow-hidden pt-20 pb-20 sm:pt-28 sm:pb-24" data-testid="section-hero">
          <div className="absolute inset-0 bg-gradient-to-b from-red-50/30 via-background to-background" />
          <div className="relative max-w-2xl mx-auto px-6 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-50 text-red-500 text-[11px] font-bold uppercase tracking-[0.15em] mb-8" data-testid="badge-love">
              WE <Heart className="w-3.5 h-3.5 fill-red-500" /> PODCASTERS
            </div>
            <h1 className="text-[1.75rem] sm:text-[2.1rem] md:text-[2.5rem] font-display font-extrabold tracking-[-0.03em] leading-[1.15] mb-5" data-testid="text-hero-title">
              Your best fans are falling behind.{" "}
              <span className="text-primary">We help them keep up.</span>
            </h1>
            <p className="text-[17px] sm:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto" data-testid="text-hero-subtitle">
              Even your most dedicated listeners miss episodes. PodCap sends them a short daily recap so they stay connected to your show and come back for the episodes that matter most.
            </p>
          </div>
        </section>

        {/* ── Why Listeners Fall Behind (stats) ── */}
        <section className="py-16 sm:py-20 border-t border-black/[0.04]" data-testid="section-time-gap">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-xl sm:text-2xl font-display font-bold tracking-[-0.02em] mb-2 text-center" data-testid="text-time-gap-title">
              Why listeners fall behind
            </h2>
            <p className="text-[15px] text-muted-foreground text-center max-w-lg mx-auto mb-10">
              Even dedicated fans don't have enough time to listen to every episode they subscribe to.
            </p>

            <div className="grid sm:grid-cols-3 gap-4 mb-12">
              {[
                { value: "6–8", label: "podcasts subscribed", source: "Edison Research – The Infinite Dial" },
                { value: "8 hrs", label: "weekly listening time", source: "Edison Research – Podcast Consumer" },
                { value: "60–120", label: "minutes per episode", source: "Industry average across top podcasts" },
              ].map((stat) => (
                <div key={stat.label} className="bg-white border border-black/[0.06] rounded-2xl py-6 px-5 text-center" data-testid={`stat-${stat.label.replace(/\s+/g, '-')}`}>
                  <p className="text-[2rem] sm:text-[2.25rem] font-display font-extrabold tracking-tight leading-none mb-1.5">{stat.value}</p>
                  <p className="text-[13px] font-display font-semibold text-foreground/70 mb-2">{stat.label}</p>
                  <p className="text-[10px] text-muted-foreground/40 leading-snug">{stat.source}</p>
                </div>
              ))}
            </div>

            <div className="max-w-lg mx-auto text-center">
              <h3 className="text-lg font-display font-bold mb-3">The math doesn't work</h3>
              <p className="text-[15px] leading-[1.75] text-muted-foreground mb-4">
                6–8 podcasts at 60–120 minutes each is 6–16 hours a week. But the average listener only has about 8 hours. Episodes pile up. Listeners fall behind. And once someone feels too far behind, they often stop listening entirely.
              </p>
              <p className="text-[15px] leading-[1.75] font-display font-bold text-foreground">
                PodCap keeps listeners up to date with short daily recaps so they stay connected and jump into the episodes that matter most.
              </p>
            </div>
          </div>
        </section>

        {/* ── Free + Bonus ── */}
        <section className="pb-16 sm:pb-20" data-testid="section-free">
          <div className="max-w-2xl mx-auto px-6">
            <div className="bg-emerald-50/60 border border-emerald-200/30 rounded-2xl py-8 px-8 sm:px-10 text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-600 mb-1.5" data-testid="text-free-label">Oh, and one more thing</p>
              <h2 className="text-xl sm:text-2xl font-display font-extrabold tracking-[-0.02em] mb-3" data-testid="text-free-title">This is completely free for podcasters</h2>
              <p className="text-[15px] leading-[1.7] text-muted-foreground max-w-md mx-auto mb-5">
                No fees, no contracts, no catch. We recap your episodes, send your fans daily updates, and create searchable pages for your show. Remember, we said we love you guys.
              </p>
              <div className="border-t border-emerald-200/40 pt-5 max-w-md mx-auto">
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-600 mb-1.5" data-testid="text-bonus-label">Bonus</p>
                <p className="text-[15px] leading-[1.7] text-muted-foreground">
                  We promote standout episode recaps daily on{" "}
                  <a href="https://x.com/podcap_io" target="_blank" rel="noopener noreferrer" className="text-foreground font-semibold hover:text-primary transition-colors">X</a>,
                  driving new listeners to discover your show who may have never heard of it before.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── We Admire Podcasters ── */}
        <section className="py-16 sm:py-20 bg-muted/30 border-y border-black/[0.04]" data-testid="section-problem">
          <div className="max-w-2xl mx-auto px-6 text-center">
            <div className="w-10 h-10 rounded-xl bg-primary/[0.07] flex items-center justify-center mx-auto mb-5">
              <Mic className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-bold mb-5" data-testid="text-problem-title">
              The problem isn't your content. It's time.
            </h2>
            <div className="text-[15px] sm:text-[16px] leading-[1.8] text-muted-foreground space-y-4 text-left sm:text-center max-w-xl mx-auto">
              <p>
                Running a great podcast is incredibly hard. Showing up consistently, preparing, researching, interviewing, editing, publishing, and keeping an audience engaged takes real skill and discipline. We genuinely admire podcasters.
              </p>
              <p>
                Even your superfans struggle to keep up. They love your show, but they follow other podcasts too. Episodes pile up and once someone falls off for a few weeks, it's hard to come back. Not because they stopped caring, but because there's too much to catch up on.
              </p>
              <p>
                PodCap sends your fans a short daily recap of what each new episode covers. They stay in the loop even on busy days, and when an episode really speaks to them, they go listen.
              </p>
            </div>
          </div>
        </section>

        {/* ── How This Helps (4 cards) ── */}
        <section className="py-16 sm:py-20" data-testid="section-how-helps">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-xl sm:text-2xl font-display font-bold tracking-[-0.02em] mb-2 text-center" data-testid="text-benefits-title">How this helps your podcast</h2>
            <p className="text-[15px] text-muted-foreground text-center max-w-lg mx-auto mb-10">
              When your fans stay connected and listen to the right episodes, everybody wins.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: UserCheck, title: "Keep Your Superfans Close", description: "A daily recap keeps fans connected to your show, even on days they can't press play. They never lose touch.", color: "text-blue-600 bg-blue-50" },
                { icon: TrendingUp, title: "Boost Listens and Completion", description: "Fans who know what an episode is about pick the ones that are right for them. That means higher completion rates.", color: "text-emerald-600 bg-emerald-50" },
                { icon: BarChart3, title: "Better Algorithm Performance", description: "Consistent engagement signals quality to podcast platforms. PodCap helps get your best fans to your best episodes.", color: "text-amber-600 bg-amber-50" },
                { icon: Clock, title: "Prevent the Backlog Drop-Off", description: "Once someone falls a few weeks behind, they rarely come back. A daily recap prevents that from ever happening.", color: "text-purple-600 bg-purple-50" },
              ].map((b) => (
                <div
                  key={b.title}
                  className="bg-white border border-black/[0.06] rounded-2xl p-6 shadow-sm"
                  data-testid={`card-benefit-${b.title.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <div className={`w-10 h-10 rounded-xl ${b.color} flex items-center justify-center mb-3`}>
                    <b.icon className="w-[18px] h-[18px]" />
                  </div>
                  <h3 className="text-[15px] font-display font-bold mb-1">{b.title}</h3>
                  <p className="text-[14px] leading-[1.65] text-muted-foreground">{b.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How It Works (steps) ── */}
        <section className="py-16 sm:py-20 bg-muted/30 border-y border-black/[0.04]" data-testid="section-the-logic">
          <div className="max-w-2xl mx-auto px-6">
            <h2 className="text-xl sm:text-2xl font-display font-bold tracking-[-0.02em] mb-2 text-center" data-testid="text-logic-title">
              The right fans, listening to the right episodes
            </h2>
            <p className="text-[15px] text-muted-foreground text-center max-w-lg mx-auto mb-10">
              Here's how recaps change the dynamic between your show and your audience.
            </p>
            <div className="space-y-5">
              {[
                "Fans subscribe to your podcast on PodCap and get a short daily recap in their inbox.",
                "On busy days, the recap keeps them connected. They know what you talked about, even if they can't listen.",
                "When an episode resonates, they go listen. They already know it's for them, so they're more likely to finish it.",
                "Higher completion rates and consistent engagement send strong signals to podcast algorithms. Your show gets rewarded.",
                "Instead of losing fans to the backlog, you keep them in your orbit. They stay subscribed, stay engaged, and stay loyal.",
              ].map((text, i) => (
                <div key={i} className="flex gap-4 items-start" data-testid={`step-${i + 1}`}>
                  <div className="w-7 h-7 rounded-full bg-primary/[0.07] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-display font-bold text-primary">{i + 1}</span>
                  </div>
                  <p className="text-[15px] leading-[1.7] text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Secondary Benefits ── */}
        <section className="py-16 sm:py-20" data-testid="section-secondary-benefits">
          <div className="max-w-2xl mx-auto px-6">
            <h2 className="text-xl sm:text-2xl font-display font-bold tracking-[-0.02em] mb-2 text-center" data-testid="text-secondary-title">
              More ways PodCap works for you
            </h2>
            <p className="text-[15px] text-muted-foreground text-center max-w-lg mx-auto mb-10">
              Beyond keeping fans engaged, PodCap handles things you probably don't have time for.
            </p>
            <div className="space-y-4">
              {[
                { icon: Search, color: "text-blue-600 bg-blue-50", title: "Your fans are already searching for recaps", desc: "A lot of your superfans are already Googling things like \"podcast name recap.\" PodCap makes sure they land on a quality recap page for your show instead of some random blog post." },
                { icon: Mic, color: "text-emerald-600 bg-emerald-50", title: "Episode summaries, done for you", desc: "Writing up summaries for every episode takes time you don't have. PodCap creates detailed, accurate recaps automatically. Just point your audience to your PodCap page." },
                { icon: Globe, color: "text-purple-600 bg-purple-50", title: "Free discoverability you're not getting today", desc: "Every episode recap is a new indexed page on Google. That's a new entry point for someone who's never heard of your show but is searching for a topic you've covered." },
              ].map((item) => (
                <div key={item.title} className="bg-white border border-black/[0.06] rounded-2xl p-6 flex gap-4 items-start" data-testid={`card-secondary-${item.title.slice(0, 10).replace(/\s+/g, '-').toLowerCase()}`}>
                  <div className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center flex-shrink-0`}>
                    <item.icon className="w-[18px] h-[18px]" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-display font-bold mb-1">{item.title}</h3>
                    <p className="text-[14px] leading-[1.65] text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Why Engagement Scores Matter ── */}
        <section className="py-16 sm:py-20 bg-muted/30 border-y border-black/[0.04]" data-testid="section-engagement">
          <div className="max-w-2xl mx-auto px-6 text-center">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-5">
              <Zap className="w-5 h-5 text-amber-600" />
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-bold mb-5" data-testid="text-engagement-title">
              Why engagement scores matter
            </h2>
            <div className="text-[15px] sm:text-[16px] leading-[1.8] text-muted-foreground space-y-4 text-left sm:text-center max-w-xl mx-auto">
              <p>
                Podcast platforms use engagement signals to decide which shows to recommend. Completion rate, listen frequency, and subscriber retention all factor in. When listeners abandon episodes halfway, it hurts your show's visibility.
              </p>
              <p>
                PodCap helps by making sure fans listen to episodes that are right for them. Instead of pressing play on something they're unsure about and bailing 10 minutes in, they read a quick recap first and only listen when they know it's a good fit. More completed episodes, better metrics, and a stronger signal to the algorithm.
              </p>
            </div>
          </div>
        </section>

        {/* ── Podcast Pages Grid ── */}
        <section className="py-16 sm:py-20" data-testid="section-podcast-pages">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-xl sm:text-2xl font-display font-bold tracking-[-0.02em] mb-2 text-center" data-testid="text-pages-title">
              Custom pages for top podcasts
            </h2>
            <p className="text-[15px] text-muted-foreground text-center max-w-lg mx-auto mb-10">
              We've created dedicated pages for many major podcasts. Fans can sign up for recaps and discover episode summaries in one place.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {FEATURED_PODCASTS.map((podcast) => (
                <Link key={podcast.slug} href={`/podcasts/${podcast.slug}`} className="group" data-testid={`card-podcast-${podcast.slug}`}>
                  <div className="bg-white border border-black/[0.06] rounded-2xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all h-full flex flex-col">
                    <img src={podcast.artworkUrl} alt={podcast.name} className="w-full aspect-square rounded-xl object-cover mb-3" loading="lazy" />
                    <h3 className="font-display font-bold text-[13px] sm:text-[14px] mb-0.5 leading-tight">{podcast.name}</h3>
                    <p className="text-[12px] text-muted-foreground leading-snug mb-3 flex-1 line-clamp-2">{podcast.description}</p>
                    <span className="flex items-center text-primary text-[12px] sm:text-[13px] font-display font-bold">
                      View Page <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            <div className="text-center mt-8">
              <Link href="/podcasts" data-testid="link-browse-all">
                <Button variant="outline" size="sm" className="rounded-xl font-display font-bold text-[13px] h-9 px-5">
                  Browse All Podcasts <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ── Contact Form ── */}
        <ContactSection />

      </main>

      <Footer />
    </>
  );
}
