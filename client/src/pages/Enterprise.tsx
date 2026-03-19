import { useState, useEffect } from "react";
import { Zap, Send, CheckCircle2, Loader2, TrendingUp, Building2, BookOpen, Shield, Mail, Users, Settings, Target, Briefcase, LineChart, ArrowRight, Clock, BarChart3, Lock, Globe, Podcast, MessageSquare, Layers, Sliders, Eye, FileText } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { Link } from "wouter";

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
      toast({ title: "Something went wrong", description: "Please try again or email us directly at hello@podrise.com.", variant: "destructive" });
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
        <CheckCircle2 className="w-10 h-10 text-[#6366F1] mx-auto mb-4" />
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
          What does your team need to track?
        </label>
        <textarea
          id="enterprise-message"
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us about your organization, the industries and roles you want to cover, and how many team members need access..."
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
    const title = "Enterprise Podcast Intelligence for Teams & Organizations | PodRise";
    const desc = "Custom podcast intelligence for your team. Automated briefings by industry, role, and topic — so everyone stays ahead without listening to a single episode.";
    document.title = title;
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    setMeta("name", "description", desc);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:url", "https://podrise.com/enterprise");
    setMeta("property", "og:type", "website");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", desc);
  }, []);

  return (
    <>
      <SiteHeader />

      <main className="min-h-screen bg-background">

        <section className="relative overflow-hidden pt-20 pb-16 sm:pt-28 sm:pb-20" data-testid="section-hero">
          <div className="absolute inset-0 bg-[#F7F7FC]" />
          <div className="relative max-w-3xl mx-auto px-6 text-center">
            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-primary/[0.07] text-primary text-base font-display font-bold uppercase tracking-widest mb-8" data-testid="badge-enterprise">
              <Building2 className="w-4 h-4" />
              Enterprise
            </div>
            <h1 className="text-[1.75rem] sm:text-[2.25rem] md:text-[2.75rem] font-display font-extrabold tracking-[-0.03em] leading-[1.12] mb-6" data-testid="text-hero-title">
              Your whole team stays ahead of your industry —{" "}
              <span className="text-primary">automatically, every day</span>
            </h1>
            <p className="text-[17px] sm:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto mb-8" data-testid="text-hero-subtitle">
              Custom intelligence briefings by industry, role, and interest — delivered to every employee who needs them. No listening required. Your team reads a briefing in minutes and knows what the smartest people in your space are saying.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap mb-10">
              <button
                onClick={() => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" })}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-primary text-white text-base font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:bg-primary/90 transition-all hover:-translate-y-0.5"
                data-testid="link-hero-cta"
              >
                Request a Demo <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                "AI & Technology",
                "Healthcare",
                "Finance",
                "Marketing",
                "CEO & Founders",
                "Product Management",
              ].map((q) => (
                <span key={q} className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-primary/[0.06] border border-primary/10 text-[15px] text-primary/80 font-medium">
                  {q}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20 border-t border-border" data-testid="section-intelligence-gap">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-4">
              <p className="text-[14px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3">The Podcast Intelligence Gap</p>
              <h2 className="text-xl sm:text-2xl font-display font-bold tracking-[-0.02em] mb-3" data-testid="text-gap-title">
                Your industry is talking. You are missing it.
              </h2>
              <p className="text-[16px] text-muted-foreground max-w-xl mx-auto leading-relaxed mb-10">
                Every day, thousands of hours of expert conversation, competitor strategy, and market intelligence are published in podcast form — and virtually none of it reaches your desk.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 mb-12">
              {[
                { value: "70,000+", label: "new episodes today", detail: "A new podcast episode drops every single second" },
                { value: "3,000 hrs", label: "of new audio today", detail: "125 straight days of listening — just from today" },
                { value: "500+", label: "brand new shows this week", detail: "New voices entering the conversation constantly" },
              ].map((stat) => (
                <div key={stat.label} className="bg-card border border-border rounded-2xl py-6 px-5 text-center">
                  <p className="text-[2rem] sm:text-[2.25rem] font-display font-extrabold tracking-tight leading-none mb-1.5">{stat.value}</p>
                  <p className="text-[16px] font-display font-semibold text-foreground mb-1">{stat.label}</p>
                  <p className="text-[14px] text-muted-foreground leading-snug">{stat.detail}</p>
                </div>
              ))}
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 sm:p-8">
              <h3 className="text-lg font-display font-bold mb-4">The business problem</h3>
              <p className="text-[16px] text-muted-foreground leading-relaxed mb-6">
                Podcasts have become where real conversations happen — and businesses have no way to listen. Executives, analysts, journalists, and competitors speak candidly on podcasts in ways they never would in press releases or earnings calls. It is where narratives form, where reputations shift, and where markets move — before anyone writes it down.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { icon: Eye, title: "Competitor intelligence", desc: "Your competitors' executives are giving unscripted interviews — discussing strategy, product direction, and market views — and you are not in the room." },
                  { icon: MessageSquare, title: "Brand & reputation monitoring", desc: "Your company, leadership, and products are being discussed — positively and negatively — in conversations your PR team will never see." },
                  { icon: TrendingUp, title: "Emerging narratives", desc: "Industry trends and opinions form in podcasts weeks before they show up in news articles, analyst reports, or competitor press releases." },
                  { icon: Lock, title: "Inaccessible by design", desc: "Audio cannot be searched, skimmed, or ctrl+F'd. Every minute of insight requires a minute of listening — and there are 3,000 hours of new content today alone." },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-3 p-4 rounded-xl bg-muted/30">
                    <item.icon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[15px] font-semibold text-foreground mb-0.5">{item.title}</p>
                      <p className="text-[14px] text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20 bg-card/50 border-y border-border" data-testid="section-intelligence-briefings">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-12">
              <p className="text-[14px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3">Intelligence & Briefings</p>
              <h2 className="text-xl sm:text-2xl font-display font-bold tracking-[-0.02em] mb-3">
                Custom briefings built around your business
              </h2>
              <p className="text-[16px] text-muted-foreground max-w-xl mx-auto leading-relaxed">
                Every employee gets the intelligence that matters to their role, their industry, and their interests — delivered automatically.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: Layers, title: "Industry & role-based briefings", description: "Custom briefings built around specific industries, roles, and topics relevant to your business. Your marketing team gets different briefings than your engineering team — automatically.", color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" },
                { icon: Clock, title: "Frequency control", description: "Daily, weekly, or real-time briefings. Choose the cadence that fits your team's workflow, and change it anytime.", color: "text-[#6366F1] bg-[#EEF2FF] dark:bg-[#6366F1]/10" },
                { icon: Mail, title: "Delivered to the whole team", description: "Intelligence briefings delivered directly to your team's inboxes or Slack channels. Everyone stays current without logging in or searching.", color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30" },
                { icon: Podcast, title: "Custom podcast monitoring", description: "Track specific shows relevant to your industry. We monitor them daily and surface the insights your team needs to know.", color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30" },
                { icon: Target, title: "Competitor monitoring", description: "Surface what is being said about your competitors across podcasts. Know when they are mentioned, what is being said, and how sentiment is shifting.", color: "text-rose-600 bg-rose-50 dark:bg-rose-950/30" },
                { icon: BarChart3, title: "Industry trend reports", description: "On-demand reports showing trending discussions, emerging themes, and momentum shifts across your selected topics and industries.", color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30" },
              ].map((item) => (
                <div
                  key={item.title}
                  className="bg-card border border-border rounded-2xl p-6"
                  data-testid={`card-intel-${item.title.slice(0, 12).replace(/\s+/g, '-').toLowerCase()}`}
                >
                  <div className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center mb-3`}>
                    <item.icon className="w-[18px] h-[18px]" />
                  </div>
                  <h3 className="text-[16px] font-display font-bold mb-1">{item.title}</h3>
                  <p className="text-[15px] leading-[1.65] text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20" data-testid="section-team-management">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-12">
              <p className="text-[14px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3">Team Management</p>
              <h2 className="text-xl sm:text-2xl font-display font-bold tracking-[-0.02em] mb-3">
                Built for teams, managed by admins
              </h2>
              <p className="text-[16px] text-muted-foreground max-w-xl mx-auto leading-relaxed">
                Full control over who gets what, with admin tools that make team intelligence effortless.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: Settings, title: "Admin dashboard", description: "Manage all users, topics, and delivery preferences from one central panel. Add or remove employees and adjust what gets delivered as priorities shift." },
                { icon: Users, title: "Role-based customization", description: "Assign industries, roles, and interests per employee or department. The marketing team gets marketing intelligence. The engineering team gets technology briefings." },
                { icon: LineChart, title: "Usage analytics", description: "See what your team is reading and engaging with. Understand which topics get the most attention and which briefings drive the most value." },
                { icon: Sliders, title: "Flexible team structure", description: "Organize by department, function, or project. Each group can have its own set of industries, interests, and roles to track." },
              ].map((item) => (
                <div
                  key={item.title}
                  className="bg-card border border-border rounded-2xl p-6"
                  data-testid={`card-team-${item.title.slice(0, 12).replace(/\s+/g, '-').toLowerCase()}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
                    <item.icon className="w-[18px] h-[18px] text-foreground" />
                  </div>
                  <h3 className="text-[16px] font-display font-bold mb-1">{item.title}</h3>
                  <p className="text-[15px] leading-[1.65] text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20 bg-card/50 border-y border-border" data-testid="section-integrations-security">
          <div className="max-w-3xl mx-auto px-6">
            <div className="grid md:grid-cols-2 gap-10">
              <div>
                <p className="text-[14px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3">Access & Integrations</p>
                <h3 className="text-lg font-display font-bold mb-5">Fits into your existing workflow</h3>
                <div className="space-y-3">
                  {[
                    { icon: MessageSquare, label: "Slack integration", desc: "Briefings delivered directly into team channels" },
                    { icon: Mail, label: "Custom branded emails", desc: "Your brand, your briefings, your schedule" },
                    { icon: Globe, label: "API access", desc: "Pull intelligence into your internal tools and dashboards" },
                    { icon: Lock, label: "SSO", desc: "Single sign-on for easy employee access" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border">
                      <item.icon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[15px] font-semibold text-foreground">{item.label}</p>
                        <p className="text-[14px] text-muted-foreground">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[14px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3">Security & Control</p>
                <h3 className="text-lg font-display font-bold mb-5">Enterprise-grade security</h3>
                <div className="space-y-3">
                  {[
                    { icon: Shield, label: "Custom data retention", desc: "Set policies that match your compliance requirements" },
                    { icon: Lock, label: "Admin approval", desc: "Control who joins your workspace" },
                    { icon: Users, label: "Private team workspace", desc: "Isolated environment for your organization" },
                    { icon: FileText, label: "Monthly intelligence reports", desc: "Leadership-ready reports with trend tracking over time" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border">
                      <item.icon className="w-5 h-5 text-foreground/60 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[15px] font-semibold text-foreground">{item.label}</p>
                        <p className="text-[14px] text-muted-foreground">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20" data-testid="section-use-cases">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-xl sm:text-2xl font-display font-bold tracking-[-0.02em] mb-3">
                Who uses PodRise Enterprise
              </h2>
              <p className="text-[16px] text-muted-foreground max-w-xl mx-auto leading-relaxed">
                Any team that needs to know what the smartest people in their industry are saying — without spending hours listening.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { title: "Venture Capital & Private Equity", description: "Track founder interviews, market sentiment, and sector trends. Your analysts get daily intelligence on what the smartest people in your sectors are saying — before it shows up in pitch decks.", icon: TrendingUp, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" },
                { title: "Corporate Strategy & Innovation", description: "Monitor how your industry, competitors, and emerging technologies are being discussed by experts. Daily briefings on your strategic priorities keep leadership informed.", icon: Briefcase, color: "text-[#6366F1] bg-[#EEF2FF] dark:bg-[#6366F1]/10" },
                { title: "Communications & PR Teams", description: "Know when your company, executives, or industry gets mentioned on influential podcasts. Track the narrative around key topics and respond faster.", icon: Building2, color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30" },
                { title: "Research & Consulting", description: "Give your research team a daily feed of expert perspectives. Intelligence briefings surface quotes, data points, and analysis that traditional research tools miss entirely.", icon: BookOpen, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30" },
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
                  <p className="text-[15px] leading-[1.65] text-muted-foreground">{uc.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20 bg-foreground text-background" data-testid="section-how-it-works">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-xl sm:text-2xl font-display font-bold mb-3">
                How it works
              </h2>
              <p className="text-[16px] text-white/60 max-w-xl mx-auto leading-relaxed">
                Think of it as a research analyst who listens to every relevant podcast, every day, and sends your team the highlights before their morning coffee.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-6">
              {[
                { step: "01", title: "Tell us what matters", desc: "Choose the industries, roles, and interests your team needs to track. Assign different topics to different departments." },
                { step: "02", title: "We monitor everything", desc: "Our AI processes every new episode across hundreds of podcasts daily — extracting insights, quotes, trends, and competitor mentions." },
                { step: "03", title: "Your team gets briefed", desc: "Custom briefings arrive in email or Slack on your schedule. Each team member gets intelligence tailored to their role." },
              ].map((item) => (
                <div key={item.step} className="text-center">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4">
                    <span className="text-lg font-display font-extrabold text-white/70">{item.step}</span>
                  </div>
                  <h3 className="text-[16px] font-display font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-[15px] text-white/50 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20" data-testid="section-explore-topics">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h2 className="text-xl sm:text-2xl font-display font-bold tracking-[-0.02em] mb-3">
              Explore what we cover
            </h2>
            <p className="text-[16px] text-muted-foreground max-w-xl mx-auto leading-relaxed mb-8">
              Explore the podcasts, people, and companies we already track — each with AI-powered recaps and discovery tools.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/podcasts"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-border bg-card text-base font-semibold hover:border-primary/30 hover:shadow-sm transition-all"
                data-testid="link-browse-podcasts"
              >
                <Building2 className="w-4 h-4 text-primary" />
                Podcasts
              </Link>
              <Link
                href="/people"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-border bg-card text-base font-semibold hover:border-primary/30 hover:shadow-sm transition-all"
                data-testid="link-browse-people"
              >
                <Zap className="w-4 h-4 text-primary" />
                People
              </Link>
              <Link
                href="/companies"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-border bg-card text-base font-semibold hover:border-primary/30 hover:shadow-sm transition-all"
                data-testid="link-browse-companies"
              >
                <Briefcase className="w-4 h-4 text-primary" />
                Companies
              </Link>
            </div>
          </div>
        </section>

        <section id="contact" className="py-16 sm:py-20 border-t border-border" data-testid="section-cta">
          <div className="max-w-2xl mx-auto px-6">
            <div className="text-center mb-8">
              <h2 className="text-xl sm:text-2xl font-display font-bold mb-3" data-testid="text-cta-title">
                Get podcast intelligence built for your team
              </h2>
              <p className="text-[16px] text-muted-foreground max-w-md mx-auto leading-relaxed">
                Tell us about your team and the industries you need to track. We will show you what a custom intelligence briefing looks like for your organization.
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
