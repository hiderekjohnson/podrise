import { useState, useEffect } from "react";
import { Zap, Send, CheckCircle2, Loader2, TrendingUp, Building2, BookOpen, Shield, Mail, Users, Settings, Target, Briefcase, LineChart } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";

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
      toast({ title: "Message sent", description: "We will be in touch shortly." });
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
        <h3 className="text-lg font-display font-bold mb-2">We will be in touch</h3>
        <p className="text-[16px] text-muted-foreground">A member of our team will follow up within one business day.</p>
        <button
          onClick={() => setSent(false)}
          className="mt-4 text-base text-primary font-display font-bold hover:underline"
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
        <label htmlFor="enterprise-email" className="block text-base font-display font-semibold mb-1.5">
          Work email
        </label>
        <input
          id="enterprise-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-[16px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
          data-testid="input-enterprise-email"
        />
      </div>
      <div>
        <label htmlFor="enterprise-message" className="block text-base font-display font-semibold mb-1.5">
          What topics does your team need to track?
        </label>
        <textarea
          id="enterprise-message"
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us about your organization, the topics that matter to your team, and how you'd like to stay informed..."
          rows={4}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-[16px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all resize-none"
          data-testid="input-enterprise-message"
        />
      </div>
      <Button
        type="submit"
        disabled={submitMutation.isPending || !email.trim() || !message.trim()}
        className="w-full rounded-xl font-display font-bold text-[16px] h-10 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
        data-testid="button-enterprise-submit"
      >
        {submitMutation.isPending ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Send className="w-3.5 h-3.5 mr-2" />
        )}
        {submitMutation.isPending ? "Sending..." : "Request a Demo"}
      </Button>
    </form>
  );
}

export default function Enterprise() {
  useEffect(() => {
    const title = "Enterprise - Podcast Intelligence for Teams | PodCap";
    const desc = "Give your team a daily edge. PodCap Enterprise delivers custom intelligence briefings on the topics your organization needs to track -- so your team always knows what the smartest people in your industry are saying.";
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
      <SiteHeader />

      <main className="min-h-screen bg-background">

        <section className="relative overflow-hidden pt-20 pb-16 sm:pt-28 sm:pb-20" data-testid="section-hero">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-background to-background" />
          <div className="relative max-w-3xl mx-auto px-6 text-center">
            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-primary/[0.07] text-primary text-base font-display font-bold uppercase tracking-widest mb-8" data-testid="badge-enterprise">
              <Building2 className="w-4 h-4" />
              Enterprise
            </div>
            <h1 className="text-[1.75rem] sm:text-[2.25rem] md:text-[2.75rem] font-display font-extrabold tracking-[-0.03em] leading-[1.12] mb-6" data-testid="text-hero-title">
              Custom podcast intelligence,{" "}
              <span className="text-primary">delivered to your team daily</span>
            </h1>
            <p className="text-[17px] sm:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto mb-6" data-testid="text-hero-subtitle">
              Your team picks the topics. We monitor hundreds of podcasts and deliver daily intelligence briefings -- the key insights, quotes, and trends distilled into something your team can read in minutes. No listening required.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                "AI & machine learning",
                "Fintech & payments",
                "Healthcare innovation",
                "Cybersecurity",
                "Climate & energy",
              ].map((q) => (
                <span key={q} className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-primary/[0.06] border border-primary/10 text-[16px] text-primary/80 font-medium">
                  {q}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20 border-t border-border" data-testid="section-problem">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-xl sm:text-2xl font-display font-bold tracking-[-0.02em] mb-3" data-testid="text-problem-title">
                Your industry's best thinking is locked inside podcasts
              </h2>
              <p className="text-[16px] text-muted-foreground max-w-xl mx-auto leading-relaxed">
                Every week, executives, founders, and analysts share insights on podcasts that never make it into reports, newsletters, or search results. Your competitors may be listening. Your team does not have the time. That is where we come in.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { value: "200+", label: "podcasts monitored daily", detail: "Across business, tech, finance, and more" },
                { value: "Daily", label: "Intelligence briefings delivered", detail: "Custom topics, every morning" },
                { value: "Minutes", label: "to read, not hours to listen", detail: "We distill, your team decides" },
              ].map((stat) => (
                <div key={stat.label} className="bg-card border border-border rounded-2xl py-6 px-5 text-center">
                  <p className="text-[2rem] sm:text-[2.25rem] font-display font-extrabold tracking-tight leading-none mb-1.5">{stat.value}</p>
                  <p className="text-[16px] font-display font-semibold text-[#3F3F46] mb-1">{stat.label}</p>
                  <p className="text-[16px] text-[#52525B] leading-snug">{stat.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20 bg-card/50 border-y border-border" data-testid="section-platform">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-xl sm:text-2xl font-display font-bold tracking-[-0.02em] mb-3">
                What your team gets
              </h2>
              <p className="text-[16px] text-muted-foreground max-w-xl mx-auto leading-relaxed">
                PodCap Enterprise is built around what actually helps teams stay informed -- daily briefings they will read, dashboards they will check, and data they can act on.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: Zap, title: "Custom intelligence briefings", description: "Daily AI-synthesized briefings on the topics your organization cares about. Each briefing distills what podcasts are saying into a concise, readable summary -- delivered by email or accessible on your dashboard.", color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" },
                { icon: Target, title: "Choose your topics", description: "Your team selects the topics they need to track -- AI, fintech, healthcare, regulatory changes, competitor activity, whatever matters to your business. We handle the monitoring across hundreds of shows.", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" },
                { icon: LineChart, title: "Topic dashboard", description: "A dedicated dashboard showing trending discussions, key quotes, and emerging themes across your selected topics. See what is gaining momentum before it hits mainstream coverage.", color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30" },
                { icon: Mail, title: "Team-wide email delivery", description: "Intelligence briefings delivered directly to your team's inboxes on your schedule. Everyone stays current without needing to log in, search, or listen to anything.", color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30" },
                { icon: Users, title: "Multi-seat access", description: "Give your entire team access to the PodCap platform -- search across episodes, explore topics in depth, and dive into full recaps when a briefing sparks their interest.", color: "text-rose-600 bg-rose-50 dark:bg-rose-950/30" },
                { icon: Settings, title: "Admin controls", description: "Manage topics, team members, and delivery preferences from a central admin panel. Add new topics as your priorities shift. Adjust what gets delivered and to whom.", color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30" },
              ].map((item) => (
                <div
                  key={item.title}
                  className="bg-card border border-border rounded-2xl p-6"
                  data-testid={`card-capability-${item.title.slice(0, 12).replace(/\s+/g, '-').toLowerCase()}`}
                >
                  <div className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center mb-3`}>
                    <item.icon className="w-[18px] h-[18px]" />
                  </div>
                  <h3 className="text-[16px] font-display font-bold mb-1">{item.title}</h3>
                  <p className="text-[16px] leading-[1.65] text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20" data-testid="section-use-cases">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-xl sm:text-2xl font-display font-bold tracking-[-0.02em] mb-3">
                Who uses PodCap Enterprise
              </h2>
              <p className="text-[16px] text-muted-foreground max-w-xl mx-auto leading-relaxed">
                Any team that needs to know what the smartest people in their industry are saying -- without spending hours listening.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { title: "Venture Capital & Private Equity", description: "Track founder interviews, market sentiment, and sector trends across the podcast ecosystem. Your analysts get daily intelligence on what the smartest people in your sectors are saying -- before it shows up in pitch decks.", icon: TrendingUp, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" },
                { title: "Corporate Strategy & Innovation", description: "Monitor how your industry, competitors, and emerging technologies are being discussed by experts. Daily briefings on your strategic priorities keep leadership informed without adding to their calendar.", icon: Briefcase, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" },
                { title: "Communications & PR Teams", description: "Know when your company, executives, or industry gets mentioned on influential podcasts. Track the narrative around key topics and respond faster with full context from the actual conversations.", icon: Building2, color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30" },
                { title: "Research & Consulting", description: "Give your research team a daily feed of expert perspectives on the topics they cover. Intelligence briefings surface quotes, data points, and analysis from podcast conversations that traditional research tools miss entirely.", icon: BookOpen, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30" },
              ].map((uc) => (
                <div
                  key={uc.title}
                  className="bg-card border border-border rounded-2xl p-6"
                  data-testid={`card-usecase-${uc.title.slice(0, 12).replace(/\s+/g, '-').toLowerCase()}`}
                >
                  <div className={`w-10 h-10 rounded-xl ${uc.color} flex items-center justify-center mb-3`}>
                    <uc.icon className="w-[18px] h-[18px]" />
                  </div>
                  <h3 className="text-[16px] font-display font-bold mb-1">{uc.title}</h3>
                  <p className="text-[16px] leading-[1.65] text-muted-foreground">{uc.description}</p>
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
              How it works
            </h2>
            <div className="text-[16px] sm:text-[16px] leading-[1.8] text-white/60 space-y-4 max-w-xl mx-auto">
              <p>
                We monitor hundreds of the world's most influential podcasts daily. When new episodes drop, our AI processes every conversation -- extracting key insights, notable quotes, guest perspectives, and emerging themes.
              </p>
              <p>
                Your team tells us which topics matter. We build custom intelligence briefings around those topics and deliver them on your schedule. Each briefing is a concise, well-sourced summary your team can read in a few minutes -- with links to full recaps when they want to go deeper.
              </p>
              <p className="text-white/80 font-display font-bold">
                Think of it as a research analyst who listens to every relevant podcast, every day, and sends your team the highlights before their morning coffee.
              </p>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20" data-testid="section-cta">
          <div className="max-w-2xl mx-auto px-6">
            <div className="text-center mb-8">
              <h2 className="text-xl sm:text-2xl font-display font-bold mb-3" data-testid="text-cta-title">
                Get podcast intelligence built for your team
              </h2>
              <p className="text-[16px] text-muted-foreground max-w-md mx-auto leading-relaxed">
                Tell us what topics your team needs to track. We will show you what a custom intelligence briefing looks like for your organization.
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
