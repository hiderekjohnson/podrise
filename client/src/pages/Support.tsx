import { useState } from "react";
import { Link } from "wouter";
import { Footer } from "@/components/Footer";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, Send, CheckCircle2, HelpCircle, Mail, Clock, Zap, CreditCard, Shield } from "lucide-react";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

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
      question: "How does PodCap decide which episodes to include?",
      answer: "Every day, PodCap checks for new episodes released the previous calendar day in your timezone. For example, if your delivery is set to 7:00 AM on Friday, we look for episodes that were published on Thursday (from midnight Thursday to midnight Friday in your timezone). This means you always get a recap of yesterday's episodes, with the freshest content possible.",
    },
    {
      question: "What happens if none of my podcasts released a new episode?",
      answer: "If none of your selected podcasts published a new episode the previous day, we simply skip that day — no email is sent. We don't want to clutter your inbox with empty recaps. You'll only hear from us when there's something new to catch up on.",
    },
    {
      question: "When will I receive my daily recap?",
      answer: "Your recap is generated at your chosen delivery time each day. You can set your preferred time and timezone from your dashboard. Most people choose a morning time so they can catch up over coffee.",
    },
    {
      question: "Can I change my podcast selections?",
      answer: "Yes! You can update your podcast selections anytime from your dashboard. Just search for new podcasts and add or remove them. Changes take effect starting with your next daily recap.",
    },
    {
      question: "How many podcasts can I follow?",
      answer: "Free users can follow up to 3 podcasts. Pro subscribers can follow unlimited podcasts and get access to longer, more detailed recaps.",
    },
    {
      question: "What does the Pro plan include?",
      answer: "The Pro plan ($9.99/month) gives you unlimited podcast selections, longer and more detailed daily recaps, and priority support. You can upgrade anytime from your dashboard.",
    },
    {
      question: "How do I cancel my Pro subscription?",
      answer: "You can manage your subscription from your dashboard. Click the \"Manage Subscription\" button to access Stripe's customer portal where you can cancel anytime. Your Pro benefits continue until the end of your billing period.",
    },
    {
      question: "How does PodCap create the recaps?",
      answer: "We use AI to analyze real podcast transcripts and create concise, accurate summaries. Every fact, quote, and insight in your recap comes directly from the actual episode transcript — nothing is made up or guessed.",
    },
    {
      question: "I'm not receiving my emails. What should I do?",
      answer: "First, check your spam or junk folder — sometimes recap emails end up there. If you find them there, mark them as \"not spam\" so future emails go to your inbox. Also make sure the email address on your account is correct (you can check this on your dashboard). If you're still not receiving emails, contact us using the form below.",
    },
    {
      question: "Is my data safe?",
      answer: "Yes. We only collect your email address and podcast preferences. We don't sell your data to anyone. Payment processing is handled securely by Stripe — we never see or store your credit card details. You can read our full Privacy Policy for more details.",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center" data-testid="link-home">
          <img src={logoPath} alt="PodCap" className="h-9 object-contain" />
        </a>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-login">
            Log In
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-10">
        <div className="text-center mb-12">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <HelpCircle className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">Help & Support</h1>
          <p className="text-muted-foreground">Find answers to common questions or get in touch with our team.</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
            <div className="flex flex-col items-center text-center p-5 rounded-xl border border-black/[0.06] bg-white">
              <Clock className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm font-semibold">Quick Responses</p>
              <p className="text-xs text-muted-foreground mt-1">We typically reply within a few hours.</p>
            </div>
            <div className="flex flex-col items-center text-center p-5 rounded-xl border border-black/[0.06] bg-white">
              <Shield className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm font-semibold">Privacy First</p>
              <p className="text-xs text-muted-foreground mt-1">Your data is secure and never shared.</p>
            </div>
            <div className="flex flex-col items-center text-center p-5 rounded-xl border border-black/[0.06] bg-white">
              <Zap className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm font-semibold">Real Humans</p>
              <p className="text-xs text-muted-foreground mt-1">Every message is read by our team.</p>
            </div>
          </div>

          <h2 className="text-xl font-bold mb-5 flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            <span>Contact Us</span>
          </h2>

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
                  <label htmlFor="support-email" className="block text-sm font-semibold mb-1.5">Your email</label>
                  <input
                    id="support-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
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
