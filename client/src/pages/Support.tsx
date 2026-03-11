import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Footer } from "@/components/Footer";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, Send, CheckCircle2, HelpCircle, Mail, Zap } from "lucide-react";
import { PodCapWordmark } from "@/components/PodCapHeader";

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-black/[0.06] rounded-xl overflow-hidden" data-testid={`faq-item`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-black/[0.01] transition-colors"
        data-testid="button-faq-toggle"
      >
        <span className="text-sm font-semibold text-foreground pr-4">{question}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-black/[0.04] pt-3">
          {answer}
        </div>
      )}
    </div>
  );
}

export default function Support() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const submitMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/support", { email, message });
    },
    onSuccess: () => {
      toast({ title: "Message sent", description: "We'll get back to you as soon as possible." });
      setEmail("");
      setMessage("");
    },
    onError: () => {
      toast({ title: "Something went wrong", description: "Please try again or email us directly at support@podcap.io.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !message.trim()) return;
    submitMutation.mutate();
  };

  const faqs = [
    {
      question: "How does PodCap decide which podcast episodes to include in my daily recap?",
      answer: "PodCap automatically checks for new podcast episodes released the previous calendar day in your timezone. For example, if your daily podcast summary is set to arrive at 7:00 AM on Friday, we look for episodes published on Thursday (midnight to midnight in your timezone). This ensures your podcast recap always covers yesterday's freshest content so you never miss an episode.",
    },
    {
      question: "What happens if none of my podcasts released a new episode yesterday?",
      answer: "If none of your selected podcasts published a new episode, PodCap simply skips that day — no email is sent. We don't clutter your inbox with empty podcast summaries. You'll only receive a daily podcast digest when there's new content to catch up on.",
    },
    {
      question: "When will I receive my daily podcast summary?",
      answer: "Your podcast recap is generated and delivered at your chosen time each day. You can set your preferred delivery time and timezone from your dashboard. Most listeners choose a morning delivery so they can read their podcast summaries over coffee and decide what to listen to during their commute.",
    },
    {
      question: "Can I change which podcasts are included in my recap?",
      answer: "Yes! You can update your podcast selections anytime from your dashboard. Search for new shows and add or remove them with one click. Changes take effect starting with your next daily podcast digest — no waiting required.",
    },
    {
      question: "How many podcasts can I follow with PodCap?",
      answer: "Free users can follow up to 3 podcasts and receive daily podcast summaries for each. Pro subscribers get unlimited podcast selections and access to longer, more detailed AI-powered recaps that go deeper into each episode's key takeaways.",
    },
    {
      question: "What does the PodCap Pro plan include?",
      answer: "The Pro plan ($9.99/month) unlocks unlimited podcast selections, longer and more detailed daily podcast recaps with richer episode summaries, and priority support. You can upgrade anytime from your dashboard and start receiving enhanced podcast digests immediately.",
    },
    {
      question: "How do I cancel my Pro subscription?",
      answer: "You can manage your subscription from your dashboard. Click the \"Manage Subscription\" button to access Stripe's customer portal where you can cancel anytime. Your Pro benefits — including unlimited podcast summaries — continue until the end of your billing period.",
    },
    {
      question: "How does PodCap create such accurate podcast recaps?",
      answer: "PodCap uses advanced AI to analyze real podcast transcripts and create concise, accurate episode summaries. Every fact, quote, and insight in your daily podcast digest comes directly from the actual episode transcript — nothing is fabricated or guessed. This makes PodCap one of the most reliable podcast summary services available.",
    },
    {
      question: "I'm not receiving my daily podcast recap emails. What should I do?",
      answer: "First, check your spam or junk folder — sometimes podcast summary emails end up there. If you find them, mark them as \"not spam\" so future podcast digests go to your inbox. Also verify the email address on your dashboard is correct. If you're still not receiving your daily podcast recaps, reach out using the contact form below and we'll help troubleshoot.",
    },
    {
      question: "Is my data safe with PodCap?",
      answer: "Absolutely. We only collect your email address and podcast preferences — the minimum needed to deliver your daily podcast summaries. We never sell your data to anyone. Payment processing is handled securely by Stripe, so we never see or store your credit card details.",
    },
    {
      question: "Can I delete my account?",
      answer: "Yes, you can delete your account at any time from your dashboard. Please note that this is permanent — deleting your account removes all your data, including your saved podcast selections, previous podcast recaps and episode summaries, delivery preferences, and subscription details. This action cannot be undone, so make sure you no longer need access to your recap history before proceeding.",
    },
  ];

  useEffect(() => {
    document.title = "Help & Support — PodCap | Podcast Recaps, Summaries & Transcripts";
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.content = content;
    };
    setMeta("name", "description", "Find answers about PodCap's AI-powered podcast recaps, episode summaries, searchable transcripts, delivery settings, Pro plan features, and more. Get help or contact our team.");
    setMeta("property", "og:title", "Help & Support — PodCap | Podcast Recaps, Summaries & Transcripts");
    setMeta("property", "og:description", "Get answers about podcast recaps, episode summaries, searchable transcripts, delivery timing, and your subscription. Contact the PodCap support team.");
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
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

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-10">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full bg-primary/[0.07] text-primary text-base sm:text-lg font-display font-bold uppercase tracking-widest mb-4 mx-auto">
            <HelpCircle className="w-5 h-5" />
            Help & Support
          </div>
          <h1 className="sr-only">Help & Support</h1>
          <p className="text-muted-foreground">Find answers to common questions about your daily podcast recaps, or get in touch with our team.</p>
        </div>

        <section className="mb-14">
          <h2 className="text-xl font-bold mb-5 flex items-center gap-2">
            <span>Frequently Asked Questions</span>
          </h2>
          <div className="space-y-2" data-testid="faq-list">
            {faqs.map((faq, i) => (
              <FAQItem key={i} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        </section>

        <section className="mb-14">
          <h2 className="text-xl font-bold mb-5 flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            <span>Contact Us</span>
          </h2>
          <p className="text-sm text-muted-foreground mb-5">
            Can't find the answer you're looking for above? Send us a message below and we'll get back to you as soon as we can.
          </p>

          <div className="border border-black/[0.06] rounded-2xl bg-white p-6">
            {submitMutation.isSuccess ? (
              <div className="text-center py-8" data-testid="support-success">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                <p className="text-lg font-semibold">Message sent!</p>
                <p className="text-sm text-muted-foreground mt-1">We'll get back to you as soon as we can.</p>
                <button
                  onClick={() => submitMutation.reset()}
                  className="mt-4 text-sm text-primary font-medium hover:underline"
                  data-testid="button-send-another"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-support">
                <div>
                  <label htmlFor="support-email" className="block text-sm font-semibold mb-1.5">Your PodCap email address</label>
                  <input
                    id="support-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="The email you use to log in to PodCap"
                    className="w-full px-4 py-2.5 rounded-xl border border-black/[0.1] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    data-testid="input-support-email"
                  />
                </div>
                <div>
                  <label htmlFor="support-message" className="block text-sm font-semibold mb-1.5">How can we help?</label>
                  <textarea
                    id="support-message"
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={5}
                    placeholder="Describe your issue or question..."
                    className="w-full px-4 py-2.5 rounded-xl border border-black/[0.1] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
                    data-testid="input-support-message"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitMutation.isPending || !email.trim() || !message.trim()}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
                  data-testid="button-submit-support"
                >
                  {submitMutation.isPending ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Send Message
                </button>
              </form>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
