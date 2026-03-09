import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Search, TrendingUp, ArrowRight, Mic, Globe, ChevronRight, BarChart3, UserCheck, Clock, Zap, Send, CheckCircle2, Loader2, Library, Sparkles, BookOpen, Layers } from "lucide-react";
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
  { slug: "lexfridman", name: "Lex Fridman Podcast", description: "Deep conversations about science, technology, and the human condition", artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/1e/0a/80/1e0a8048-7226-d9f8-534d-03bfb3b327e2/mza_13182599832498912880.jpg/600x600bb.jpg" },
  { slug: "onpurpose", name: "On Purpose with Jay Shetty", description: "Insights on mindfulness, relationships, and personal growth", artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/2d/89/bb/2d89bb29-40e4-b81d-0dfe-81c6f4ed1828/mza_18131490782293498498.jpg/600x600bb.jpg" },
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
    <section className="py-16 sm:py-20" data-testid="section-contact">
      <div className="max-w-2xl mx-auto px-6">
        <div className="text-center mb-8">
          <h2 className="text-xl sm:text-2xl font-display font-bold mb-3" data-testid="text-contact-title">
            Get your podcast on PodCap
          </h2>
          <p className="text-[15px] text-muted-foreground max-w-md mx-auto leading-relaxed">
            We're building the most comprehensive podcast knowledge platform on the internet. If you host a podcast, we'd love to include your show.
          </p>
        </div>

        {sent ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center" data-testid="contact-success">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
            <h3 className="text-lg font-display font-bold mb-2">Message sent</h3>
            <p className="text-[15px] text-muted-foreground">We'll get back to you as soon as possible.</p>
            <button
              onClick={() => setSent(false)}
              className="mt-4 text-sm text-primary font-display font-bold hover:underline"
              data-testid="button-send-another"
            >
              Send another message
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-4" data-testid="form-contact">
            <div>
              <label htmlFor="podcaster-email" className="block text-sm font-display font-semibold mb-1.5">
                Your email
              </label>
              <input
                id="podcaster-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourpodcast.com"
                className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-[14px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                data-testid="input-email"
              />
            </div>
            <div>
              <label htmlFor="podcaster-message" className="block text-sm font-display font-semibold mb-1.5">
                Tell us about your podcast
              </label>
              <textarea
                id="podcaster-message"
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Share your podcast name, what it's about, or any questions you have..."
                rows={4}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-[14px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all resize-none"
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
              {submitMutation.isPending ? "Sending..." : "Submit"}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}

export default function ForPodcasters() {
  useEffect(() => {
    document.title = "For Podcasters — How PodCap Helps Your Show Reach More People | PodCap";
    const desc = "PodCap turns your podcast episodes into searchable, discoverable knowledge assets. Increase discoverability, deepen audience engagement, and extend the life of every conversation.";
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    setMeta("name", "description", desc);
    setMeta("property", "og:title", "For Podcasters — How PodCap Helps Your Show Reach More People");
    setMeta("property", "og:description", desc);
  }, []);

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md" data-testid="nav-bar">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-6">
          <Link href="/" data-testid="link-home">
            <img src={logoPath} alt="PodCap" className="h-6 object-contain" />
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/get-started" data-testid="link-nav-get-started">
              <div className="flex items-center gap-1.5 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-xs font-semibold text-primary tracking-wide uppercase hover:bg-primary/15 transition-colors">
                <Zap className="w-3.5 h-3.5" />
                Build Your Recap
              </div>
            </Link>
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-login">
              Log In
            </Link>
          </div>
        </div>
      </nav>

      <main className="min-h-screen bg-background">

        <section className="relative overflow-hidden pt-20 pb-16 sm:pt-28 sm:pb-20" data-testid="section-hero">
          <div className="relative max-w-3xl mx-auto px-6 text-center">
            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-primary/[0.07] text-primary text-sm font-display font-bold uppercase tracking-widest mb-8" data-testid="badge-podcasters">
              <Mic className="w-4 h-4" />
              For Podcasters
            </div>
            <h1 className="text-[1.75rem] sm:text-[2.25rem] md:text-[2.75rem] font-display font-extrabold tracking-[-0.03em] leading-[1.12] mb-6" data-testid="text-hero-title">
              Your episodes deserve a longer life than 48 hours
            </h1>
            <p className="text-[17px] sm:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto" data-testid="text-hero-subtitle">
              Most podcast episodes get a burst of downloads after release and then disappear. PodCap turns every episode into a searchable, discoverable knowledge asset that keeps working for your show long after publish day.
            </p>
          </div>
        </section>

        <section className="py-16 sm:py-20 border-t border-border" data-testid="section-problem">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-xl sm:text-2xl font-display font-bold tracking-[-0.02em] mb-3" data-testid="text-problem-title">
                The podcast discovery problem
              </h2>
              <p className="text-[15px] text-muted-foreground max-w-lg mx-auto leading-relaxed">
                Podcasts contain some of the most valuable conversations happening today. But the ideas inside them are hard to find, hard to search, and hard to share.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 mb-12">
              {[
                { value: "90%", label: "of episode value is locked in audio", detail: "Not indexed by search engines" },
                { value: "48 hrs", label: "typical download window", detail: "Then episodes fade from feeds" },
                { value: "60%+", label: "of listeners fall behind", detail: "Episodes pile up faster than people can listen" },
              ].map((stat) => (
                <div key={stat.label} className="bg-card border border-border rounded-2xl py-6 px-5 text-center">
                  <p className="text-[2rem] sm:text-[2.25rem] font-display font-extrabold tracking-tight leading-none mb-1.5">{stat.value}</p>
                  <p className="text-sm font-display font-semibold text-foreground/70 mb-1">{stat.label}</p>
                  <p className="text-xs text-muted-foreground/50 leading-snug">{stat.detail}</p>
                </div>
              ))}
            </div>

            <div className="max-w-xl mx-auto text-center">
              <p className="text-[15px] leading-[1.75] text-muted-foreground">
                You spend hours preparing, recording, and editing each episode. But once it publishes, the ideas inside are only accessible to people who have the time to listen from start to finish. Everyone else moves on.
              </p>
              <p className="text-[15px] leading-[1.75] font-display font-bold text-foreground mt-4">
                PodCap makes your content findable, skimmable, and shareable — so your best ideas travel further.
              </p>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20 bg-card/50 border-y border-border" data-testid="section-what-podcap-does">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-xl sm:text-2xl font-display font-bold tracking-[-0.02em] mb-3">
                What PodCap creates for your show
              </h2>
              <p className="text-[15px] text-muted-foreground max-w-lg mx-auto leading-relaxed">
                Every episode on PodCap becomes a rich, structured page of knowledge — automatically.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: BookOpen, title: "AI-powered episode recaps", description: "Each episode gets a detailed summary with key takeaways, notable quotes, topic breakdowns, and chapter-by-chapter analysis. Your content, made scannable.", color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" },
                { icon: Search, title: "Full searchable transcripts", description: "Every word from every episode becomes searchable text. Listeners can find exactly the conversation they're looking for in seconds.", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" },
                { icon: Globe, title: "SEO-indexed episode pages", description: "Each recap is a new page indexed by Google. Someone searching for a topic you've covered can discover your show for the first time.", color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30" },
                { icon: Sparkles, title: "AI Q&A about your podcast", description: "Listeners can ask questions about your show and get AI-powered answers drawn from real transcripts. Your episodes become a knowledge base.", color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30" },
                { icon: Layers, title: "Guest and topic pages", description: "Guests who appear on your show get their own profile pages. Topics discussed across your episodes are cross-referenced and linked.", color: "text-rose-600 bg-rose-50 dark:bg-rose-950/30" },
                { icon: Clock, title: "Daily recap emails", description: "Your fans can subscribe to daily email recaps. They stay connected to your show even on busy days and come back for the episodes that resonate.", color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30" },
              ].map((item) => (
                <div
                  key={item.title}
                  className="bg-card border border-border rounded-2xl p-6"
                  data-testid={`card-feature-${item.title.slice(0, 12).replace(/\s+/g, '-').toLowerCase()}`}
                >
                  <div className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center mb-3`}>
                    <item.icon className="w-[18px] h-[18px]" />
                  </div>
                  <h3 className="text-[15px] font-display font-bold mb-1">{item.title}</h3>
                  <p className="text-[14px] leading-[1.65] text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20" data-testid="section-how-helps">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-xl sm:text-2xl font-display font-bold tracking-[-0.02em] mb-3" data-testid="text-benefits-title">
                How this helps your podcast grow
              </h2>
              <p className="text-[15px] text-muted-foreground max-w-lg mx-auto leading-relaxed">
                PodCap creates durable value from every episode you publish.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: Globe, title: "Discoverability beyond the feed", description: "Every recap is a Google-indexed page. People searching for topics you've covered find your show organically — even years after the episode aired.", color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" },
                { icon: UserCheck, title: "Deeper audience connection", description: "Fans who read recaps stay engaged with your show even when they can't listen. They never lose touch, and they come back for the episodes that matter most.", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" },
                { icon: TrendingUp, title: "Stronger engagement metrics", description: "Listeners who preview a recap before pressing play are more intentional. They're more likely to finish episodes, which sends the signals platforms reward.", color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30" },
                { icon: BarChart3, title: "Long-tail value from every episode", description: "Your back catalog keeps generating new listeners. Old episodes become permanent, searchable assets instead of disappearing into the archive.", color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30" },
              ].map((b) => (
                <div
                  key={b.title}
                  className="bg-card border border-border rounded-2xl p-6"
                  data-testid={`card-benefit-${b.title.toLowerCase().replace(/\s+/g, '-').slice(0, 20)}`}
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

        <section className="py-16 sm:py-20 bg-foreground text-background" data-testid="section-vision">
          <div className="max-w-2xl mx-auto px-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mx-auto mb-6">
              <Library className="w-6 h-6 text-white/80" />
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-bold mb-5">
              We're building podcast infrastructure
            </h2>
            <div className="text-[15px] sm:text-[16px] leading-[1.8] text-white/60 space-y-4 max-w-xl mx-auto">
              <p>
                Podcasts are where the most interesting people in the world share their deepest thinking. But unlike articles or books, podcast content is trapped in audio — unsearchable, unskimmable, and invisible to the web.
              </p>
              <p>
                PodCap is building the infrastructure to change that. We're turning every episode into structured, searchable knowledge — connecting ideas across shows, guests, and topics. When someone searches for an idea your podcast discussed, they should find it.
              </p>
              <p className="text-white/80 font-display font-bold">
                We believe great podcast content deserves to be as discoverable as any article on the internet.
              </p>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20" data-testid="section-free">
          <div className="max-w-2xl mx-auto px-6">
            <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/30 dark:border-emerald-800/30 rounded-2xl py-8 px-8 sm:px-10 text-center">
              <h2 className="text-xl sm:text-2xl font-display font-extrabold tracking-[-0.02em] mb-3" data-testid="text-free-title">Completely free for podcasters</h2>
              <p className="text-[15px] leading-[1.7] text-muted-foreground max-w-md mx-auto mb-5">
                There's no cost, no contract, and no catch. PodCap creates episode recaps, searchable transcripts, and discovery pages for your show automatically. Our goal is to make your content more valuable — not to gatekeep it.
              </p>
              <div className="border-t border-emerald-200/40 dark:border-emerald-800/30 pt-5 max-w-md mx-auto">
                <p className="text-[15px] leading-[1.7] text-muted-foreground">
                  We also promote standout episodes daily on{" "}
                  <a href="https://x.com/podcap_io" target="_blank" rel="noopener noreferrer" className="text-foreground font-semibold hover:text-primary transition-colors">@podcap_io</a>,
                  helping new listeners discover your show.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20 bg-card/50 border-y border-border" data-testid="section-podcast-pages">
          <div className="max-w-4xl mx-auto px-6">
            <div className="text-center mb-10">
              <h2 className="text-xl sm:text-2xl font-display font-bold tracking-[-0.02em] mb-3" data-testid="text-pages-title">
                250+ podcasts on the platform
              </h2>
              <p className="text-[15px] text-muted-foreground max-w-lg mx-auto leading-relaxed">
                From indie shows to the world's most popular podcasts, we're building the most comprehensive library of podcast knowledge on the internet.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {FEATURED_PODCASTS.map((podcast) => (
                <Link key={podcast.slug} href={`/podcasts/${podcast.slug}`} className="group" data-testid={`card-podcast-${podcast.slug}`}>
                  <div className="bg-card border border-border rounded-2xl p-3.5 hover:border-primary/30 hover:shadow-md transition-all h-full flex flex-col">
                    <img src={podcast.artworkUrl} alt={podcast.name} className="w-full aspect-square rounded-xl object-cover mb-3 group-hover:scale-[1.02] transition-transform" loading="lazy" />
                    <h3 className="font-display font-bold text-sm mb-0.5 leading-tight group-hover:text-primary transition-colors">{podcast.name}</h3>
                    <p className="text-xs text-muted-foreground leading-snug flex-1 line-clamp-2">{podcast.description}</p>
                    <span className="flex items-center text-primary text-xs font-display font-bold mt-2">
                      View Page <ChevronRight className="w-3 h-3 ml-0.5" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            <div className="text-center mt-8">
              <Link href="/podcasts" data-testid="link-browse-all">
                <Button variant="outline" size="sm" className="rounded-xl font-display font-bold text-sm h-9 px-5">
                  Browse All Podcasts <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <ContactSection />

      </main>

      <Footer />
    </>
  );
}
