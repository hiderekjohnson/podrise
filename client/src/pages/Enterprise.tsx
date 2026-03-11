import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Search, Globe, BarChart3, Zap, Send, CheckCircle2, Loader2, Database, Layers, TrendingUp, Building2, BookOpen, Shield } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/Footer";
import { PodCapWordmark } from "@/components/PodCapHeader";

function EnterpriseContactForm() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const submitMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/support", { email, message: `[Enterprise Inquiry] ${message}` });
    },
    onSuccess: () => {
      toast({ title: "Message sent", description: "We'll be in touch shortly." });
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

  if (sent) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center max-w-lg mx-auto" data-testid="enterprise-contact-success">
        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
        <h3 className="text-lg font-display font-bold mb-2">We'll be in touch</h3>
        <p className="text-[15px] text-muted-foreground">A member of our team will follow up within one business day.</p>
        <button
          onClick={() => setSent(false)}
          className="mt-4 text-sm text-primary font-display font-bold hover:underline"
          data-testid="button-send-another"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-4 max-w-lg mx-auto" data-testid="form-enterprise-contact">
      <div>
        <label htmlFor="enterprise-email" className="block text-sm font-display font-semibold mb-1.5">
          Work email
        </label>
        <input
          id="enterprise-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-[14px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
          data-testid="input-enterprise-email"
        />
      </div>
      <div>
        <label htmlFor="enterprise-message" className="block text-sm font-display font-semibold mb-1.5">
          How can PodCap help your team?
        </label>
        <textarea
          id="enterprise-message"
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us about your organization and what you're looking for..."
          rows={4}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-[14px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all resize-none"
          data-testid="input-enterprise-message"
        />
      </div>
      <Button
        type="submit"
        disabled={submitMutation.isPending || !email.trim() || !message.trim()}
        className="w-full rounded-xl font-display font-bold text-[14px] h-10 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
        data-testid="button-enterprise-submit"
      >
        {submitMutation.isPending ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Send className="w-3.5 h-3.5 mr-2" />
        )}
        {submitMutation.isPending ? "Sending..." : "Get in Touch"}
      </Button>
    </form>
  );
}

export default function Enterprise() {
  useEffect(() => {
    const title = "Enterprise — Podcast Intelligence & Knowledge Infrastructure | PodCap";
    const desc = "PodCap turns podcast content into structured, searchable knowledge for enterprise teams. Monitor topics, discover insights, and surface important discussions across thousands of podcast conversations.";
    document.title = title;
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    setMeta("name", "description", desc);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:url", "https://podcap.io/enterprise");
    setMeta("property", "og:type", "website");
  }, []);

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md" data-testid="nav-bar">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-6">
          <Link href="/" data-testid="link-home">
            <PodCapWordmark />
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
          <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-background to-background" />
          <div className="relative max-w-3xl mx-auto px-6 text-center">
            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-primary/[0.07] text-primary text-sm font-display font-bold uppercase tracking-widest mb-8" data-testid="badge-enterprise">
              <Building2 className="w-4 h-4" />
              Enterprise
            </div>
            <h1 className="text-[1.75rem] sm:text-[2.25rem] md:text-[2.75rem] font-display font-extrabold tracking-[-0.03em] leading-[1.12] mb-6" data-testid="text-hero-title">
              Podcast intelligence{" "}
              <span className="text-primary">for teams that need to know</span>
            </h1>
            <p className="text-[17px] sm:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto" data-testid="text-hero-subtitle">
              Podcasts have become one of the most important sources of expert insight, market signals, and emerging ideas. PodCap makes that knowledge searchable, structured, and accessible at scale.
            </p>
          </div>
        </section>

        <section className="py-16 sm:py-20 border-t border-border" data-testid="section-problem">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-xl sm:text-2xl font-display font-bold tracking-[-0.02em] mb-3" data-testid="text-problem-title">
                The knowledge is there. The access isn't.
              </h2>
              <p className="text-[15px] text-muted-foreground max-w-xl mx-auto leading-relaxed">
                Every week, thousands of podcast episodes surface expert analysis, industry signals, and strategic conversations that matter to your business. But that knowledge is locked inside hours of audio — unsearchable, unstructured, and invisible to your team.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { value: "4M+", label: "active podcasts worldwide", detail: "Rapidly growing knowledge layer" },
                { value: "95%", label: "of podcast content is unsearchable", detail: "Trapped inside long-form audio" },
                { value: "70hrs", label: "of new episodes published per minute", detail: "Impossible to monitor manually" },
              ].map((stat) => (
                <div key={stat.label} className="bg-card border border-border rounded-2xl py-6 px-5 text-center">
                  <p className="text-[2rem] sm:text-[2.25rem] font-display font-extrabold tracking-tight leading-none mb-1.5">{stat.value}</p>
                  <p className="text-sm font-display font-semibold text-foreground/70 mb-1">{stat.label}</p>
                  <p className="text-xs text-muted-foreground/50 leading-snug">{stat.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20 bg-card/50 border-y border-border" data-testid="section-platform">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-xl sm:text-2xl font-display font-bold tracking-[-0.02em] mb-3">
                A structured knowledge layer for podcast content
              </h2>
              <p className="text-[15px] text-muted-foreground max-w-xl mx-auto leading-relaxed">
                PodCap processes podcast episodes into structured, queryable data — turning conversations into searchable knowledge your team can actually use.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: Search, title: "Search across conversations", description: "Full-text search across transcripts, summaries, and episode metadata. Find the exact discussion you're looking for across thousands of episodes.", color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" },
                { icon: BarChart3, title: "Topic monitoring", description: "Track mentions of companies, people, products, and ideas across the podcast ecosystem. Know when your market is being discussed.", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" },
                { icon: Layers, title: "Structured knowledge extraction", description: "AI-powered extraction of key insights, quotes, guest appearances, and topic breakdowns from every episode processed.", color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30" },
                { icon: Database, title: "API access", description: "Programmatic access to structured podcast data. Integrate podcast intelligence into your existing tools and workflows.", color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30" },
                { icon: Globe, title: "Cross-show intelligence", description: "Connect ideas, guests, and topics across different podcasts. Surface patterns and emerging themes your competitors might miss.", color: "text-rose-600 bg-rose-50 dark:bg-rose-950/30" },
                { icon: BookOpen, title: "Knowledge summaries", description: "Concise, accurate episode recaps with key takeaways, notable quotes, and structured chapter analysis — generated automatically.", color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30" },
              ].map((item) => (
                <div
                  key={item.title}
                  className="bg-card border border-border rounded-2xl p-6"
                  data-testid={`card-capability-${item.title.slice(0, 12).replace(/\s+/g, '-').toLowerCase()}`}
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

        <section className="py-16 sm:py-20" data-testid="section-use-cases">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-xl sm:text-2xl font-display font-bold tracking-[-0.02em] mb-3">
                Built for teams that move on information
              </h2>
              <p className="text-[15px] text-muted-foreground max-w-xl mx-auto leading-relaxed">
                Podcast intelligence is relevant anywhere expert conversations, market signals, and emerging ideas matter.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { title: "Investment & Research", description: "Monitor founder interviews, earnings commentary, and sector discussions across the podcast landscape. Surface signals before they appear in traditional media.", icon: TrendingUp, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" },
                { title: "Media & Podcast Networks", description: "Understand what's being discussed across your catalog and beyond. Identify trending topics, cross-promote content, and measure the knowledge footprint of your shows.", icon: Globe, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" },
                { title: "Corporate Strategy", description: "Track how your company, competitors, and industry are being discussed in long-form expert conversations. Podcast mentions often signal shifting sentiment early.", icon: Building2, color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30" },
                { title: "Knowledge & Education", description: "Turn podcast conversations into structured learning resources. Build searchable archives of expert knowledge organized by topic, guest, and key insight.", icon: BookOpen, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30" },
              ].map((uc) => (
                <div
                  key={uc.title}
                  className="bg-card border border-border rounded-2xl p-6"
                  data-testid={`card-usecase-${uc.title.slice(0, 12).replace(/\s+/g, '-').toLowerCase()}`}
                >
                  <div className={`w-10 h-10 rounded-xl ${uc.color} flex items-center justify-center mb-3`}>
                    <uc.icon className="w-[18px] h-[18px]" />
                  </div>
                  <h3 className="text-[15px] font-display font-bold mb-1">{uc.title}</h3>
                  <p className="text-[14px] leading-[1.65] text-muted-foreground">{uc.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20 bg-foreground text-background" data-testid="section-vision">
          <div className="max-w-2xl mx-auto px-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mx-auto mb-6">
              <Shield className="w-6 h-6 text-white/80" />
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-bold mb-5">
              The infrastructure layer for podcast knowledge
            </h2>
            <div className="text-[15px] sm:text-[16px] leading-[1.8] text-white/60 space-y-4 max-w-xl mx-auto">
              <p>
                PodCap is building the structured data layer that makes podcast content accessible to machines and teams alike. We process episodes into searchable transcripts, extract entities and topics, link ideas across shows, and create knowledge graphs from conversations.
              </p>
              <p>
                Today we cover thousands of the world's most popular and influential podcast shows. The platform is expanding, and enterprise partnerships help us prioritize coverage that matters to your organization.
              </p>
              <p className="text-white/80 font-display font-bold">
                We believe podcast content will become one of the most important knowledge layers on the internet. We're building the tools to make that useful.
              </p>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20" data-testid="section-cta">
          <div className="max-w-2xl mx-auto px-6">
            <div className="text-center mb-8">
              <h2 className="text-xl sm:text-2xl font-display font-bold mb-3" data-testid="text-cta-title">
                Explore what podcast intelligence can do for your team
              </h2>
              <p className="text-[15px] text-muted-foreground max-w-md mx-auto leading-relaxed">
                We're working with a select group of organizations to shape the enterprise product. If podcast content matters to your work, we'd like to hear from you.
              </p>
            </div>

            <EnterpriseContactForm />
          </div>
        </section>

      </main>

      <Footer />
    </>
  );
}
