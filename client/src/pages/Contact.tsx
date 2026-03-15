import { useState, useEffect } from "react";
import { Footer } from "@/components/Footer";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Send, CheckCircle2, Mail } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";

export default function Contact() {
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

  useEffect(() => {
    const title = "Contact PodCap — Questions, Feedback & Partnership Inquiries | PodCap";
    const desc = "Reach the PodCap team for questions about podcast recaps, episode summaries, partnerships, or feature requests. We'd love to hear from you.";
    document.title = title;
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.content = content;
    };
    setMeta("name", "description", desc);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:url", "https://podcap.io/contact");
    setMeta("property", "og:image", "https://podcap.io/og/og-podcasts.png");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", desc);

    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
    link.href = "https://podcap.io/contact";
    return () => { if (link) link.remove(); };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />

      <main className="flex-1 w-full max-w-xl mx-auto px-4 sm:px-6 py-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full bg-primary/[0.07] text-primary text-base sm:text-lg font-display font-bold uppercase tracking-widest mb-4 mx-auto">
            <Mail className="w-5 h-5" />
            Contact Us
          </div>
          <h1 className="sr-only">Contact Us</h1>
          <p className="text-muted-foreground">Questions, feedback, or just want to say hello. We'd love to hear from you.</p>
        </div>

        <div className="border border-black/[0.06] dark:border-white/[0.08] rounded-2xl bg-white dark:bg-white/[0.04] p-6">
          {submitMutation.isSuccess ? (
            <div className="text-center py-8" data-testid="contact-success">
              <CheckCircle2 className="w-10 h-10 text-[#6366F1] mx-auto mb-3" />
              <p className="text-lg font-semibold">Message sent</p>
              <p className="text-base text-[#52525B] dark:text-[#A1A1AA] mt-1">We'll get back to you as soon as we can.</p>
              <button
                onClick={() => submitMutation.reset()}
                className="mt-4 text-base text-primary font-medium hover:underline"
                data-testid="button-send-another"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-contact">
              <div>
                <label htmlFor="contact-email" className="block text-base font-semibold mb-1.5">Email address</label>
                <input
                  id="contact-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-black/[0.1] dark:border-white/[0.1] bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  data-testid="input-contact-email"
                />
              </div>
              <div>
                <label htmlFor="contact-message" className="block text-base font-semibold mb-1.5">Message</label>
                <textarea
                  id="contact-message"
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder="What's on your mind?"
                  className="w-full px-4 py-2.5 rounded-xl border border-black/[0.1] dark:border-white/[0.1] bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
                  data-testid="input-contact-message"
                />
              </div>
              <button
                type="submit"
                disabled={submitMutation.isPending || !email.trim() || !message.trim()}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-base font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
                data-testid="button-submit-contact"
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
      </main>

      <Footer />
    </div>
  );
}
