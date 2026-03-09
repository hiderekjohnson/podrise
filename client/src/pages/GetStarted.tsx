import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Loader2, ArrowRight, Podcast } from "lucide-react";
import { motion } from "framer-motion";
import { useRegister, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PodcastSearch } from "@/components/PodcastSearch";
import { Footer } from "@/components/Footer";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

function hiResArtwork(url: string) {
  return url.replace(/\/\d+x\d+bb\./, "/300x300bb.");
}

interface SelectedPodcast {
  id: string;
  name: string;
  artworkUrl: string;
}

function SEOHead() {
  const title = "Build Your Custom Podcast Recap — PodCap";
  const description = "Choose your favorite podcasts and get personalized podcast recaps and podcast summaries delivered daily. AI-powered key takeaways, searchable transcripts, and insights — stay current in minutes.";

  if (typeof document !== "undefined") {
    document.title = title;
    const setOrCreate = (selector: string, attr: string, value: string) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement("meta");
        const [k, v] = attr === "name" ? ["name", selector.match(/name="([^"]+)"/)?.[1] || ""] : ["property", selector.match(/property="([^"]+)"/)?.[1] || ""];
        el.setAttribute(k, v);
        document.head.appendChild(el);
      }
      el.setAttribute("content", value);
    };
    setOrCreate('meta[name="description"]', "name", description);
    setOrCreate('meta[property="og:title"]', "property", title);
    setOrCreate('meta[property="og:description"]', "property", description);
  }
  return null;
}

export default function GetStarted() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  const { toast } = useToast();
  const { mutate: register, isPending } = useRegister();

  const [selectedPodcasts, setSelectedPodcasts] = useState<SelectedPodcast[]>([]);
  const [email, setEmail] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const emailSectionRef = useRef<HTMLElement>(null);

  if (user) {
    navigate("/dashboard");
    return null;
  }

  const handleAdd = (podcast: SelectedPodcast) => {
    const updated = [...selectedPodcasts, podcast];
    setSelectedPodcasts(updated);
    if (updated.length >= 3) {
      setTimeout(() => {
        emailSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => emailRef.current?.focus(), 400);
      }, 300);
    }
  };

  const handleRemove = (id: string) => {
    setSelectedPodcasts((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSubmit = () => {
    if (selectedPodcasts.length === 0) {
      toast({ title: "Almost there!", description: "Please select at least one podcast.", variant: "destructive" });
      return;
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    register(
      { podcasts: selectedPodcasts.map((p) => JSON.stringify(p)), email },
      {
        onSuccess: () => navigate("/dashboard?welcome=true"),
        onError: (err) => {
          toast({
            title: "Something went wrong",
            description: err.message.includes("400") ? "An account with this email already exists. Try logging in." : err.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead />
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center" data-testid="link-home">
          <img src={logoPath} alt="PodCap" className="h-9 object-contain" />
        </a>
        <div className="flex items-center gap-3">
          <button
            data-testid="link-login"
            onClick={() => navigate("/login")}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Log in
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-20">
        <section className="w-full max-w-2xl text-center pt-10 sm:pt-16 pb-8">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="flex flex-col items-center gap-4">
            <h1 className="text-3xl sm:text-4xl md:text-[2.75rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.025em]" data-testid="text-headline">
              Build Your Custom Podcast Recap
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-lg leading-relaxed">
              Choose the podcasts you follow, enter your email, and get a personalized daily recap with the key ideas from every new episode.
            </p>
          </motion.div>
        </section>

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }} className="w-full max-w-2xl">
          <div className="glass-panel p-6 sm:p-10 flex flex-col gap-10">
            <section className="flex flex-col gap-5">
              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0 mt-0.5 bg-primary text-primary-foreground">1</span>
                <div className="flex-1">
                  <h2 className="text-lg font-display font-bold text-foreground">Choose podcasts to recap</h2>
                  <p className="text-sm text-muted-foreground mt-1">Pick up to 3 to start. You can add or remove podcasts anytime.</p>
                </div>
              </div>

              <div className="pl-10 space-y-5">
                <PodcastSearch selectedPodcasts={selectedPodcasts} onAdd={handleAdd} onRemove={handleRemove} maxSelection={3} />
                {selectedPodcasts.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-2">Selected podcasts <span className="text-muted-foreground font-semibold">({selectedPodcasts.length}/3)</span></p>
                    <div className="grid grid-cols-3 gap-3">
                      {selectedPodcasts.map((podcast) => (
                        <div key={podcast.id} className="bg-white border border-black/[0.06] rounded-2xl p-3 pb-3.5 relative group">
                          <button
                            data-testid={`button-remove-selected-${podcast.id}`}
                            onClick={() => handleRemove(podcast.id)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                          >
                            ×
                          </button>
                          {podcast.artworkUrl ? (
                            <img src={hiResArtwork(podcast.artworkUrl)} alt={podcast.name} className="w-full aspect-square rounded-xl object-cover shadow-sm shadow-black/[0.06]" />
                          ) : (
                            <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center">
                              <Podcast className="w-10 h-10 text-primary" />
                            </div>
                          )}
                          <p className="mt-2.5 text-sm font-semibold text-foreground leading-snug line-clamp-2">{podcast.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <div className="border-t border-black/[0.06]" />

            <section ref={emailSectionRef} className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0 mt-0.5 bg-primary text-primary-foreground">2</span>
                <div>
                  <h2 className="text-lg font-display font-bold text-foreground">Where should we send your recap?</h2>
                  <p className="text-sm text-muted-foreground mt-1">All your podcast recaps in one daily email.</p>
                </div>
              </div>
              <div className="pl-10 space-y-4">
                <input
                  ref={emailRef}
                  data-testid="input-email"
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 px-4 bg-white border border-black/[0.08] rounded-xl text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/25 transition-all font-medium shadow-sm shadow-black/[0.03]"
                />
              </div>
            </section>

            <div className="flex flex-col items-center gap-2 pl-10">
              <button
                data-testid="button-finish"
                onClick={handleSubmit}
                disabled={isPending || selectedPodcasts.length === 0 || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)}
                className="w-auto px-8 h-11 flex items-center justify-center gap-2 rounded-lg font-display font-bold text-[15px] bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25 hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:brightness-100 transition-all active:scale-[0.98]"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating your recap...
                  </>
                ) : (
                  <>
                    Start My Daily Recap
                    <ArrowRight className="w-4.5 h-4.5" />
                  </>
                )}
              </button>
              <p className="text-sm text-muted-foreground italic">Free forever for up to 3 podcasts.</p>
            </div>
          </div>
        </motion.div>

        <section className="w-full max-w-2xl mt-12 text-center">
          <div className="bg-card border border-border rounded-xl p-6 sm:p-8">
            <h3 className="text-lg font-display font-bold text-foreground mb-3">What you'll get</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-muted-foreground">
              <div className="flex flex-col items-center gap-2">
                <span className="text-2xl">📬</span>
                <p className="font-medium text-foreground">Daily email</p>
                <p>One recap covering all your selected podcasts</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="text-2xl">⚡</span>
                <p className="font-medium text-foreground">Key insights</p>
                <p>The big ideas, quotes, and takeaways from each episode</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="text-2xl">🎯</span>
                <p className="font-medium text-foreground">Personalized</p>
                <p>Choose exactly which podcasts matter to you</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
