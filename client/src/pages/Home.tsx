import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useRegister, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PodcastSearch } from "@/components/PodcastSearch";
import logoPath from "@assets/image_1772641542609.png";
import faviconPath from "@assets/image_1772642558577.png";

interface SelectedPodcast {
  id: string;
  name: string;
  artworkUrl: string;
}

const READING_LENGTHS = [5, 10, 15, 20];

export default function Home() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  const { toast } = useToast();
  const { mutate: register, isPending } = useRegister();

  const [selectedPodcasts, setSelectedPodcasts] = useState<SelectedPodcast[]>([]);
  const [readingLength, setReadingLength] = useState<number>(10);
  const [email, setEmail] = useState("");

  if (user) {
    navigate("/dashboard");
    return null;
  }

  const handleAdd = (podcast: SelectedPodcast) => {
    setSelectedPodcasts((prev) => [...prev, podcast]);
  };

  const handleRemove = (id: string) => {
    setSelectedPodcasts((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSubmit = () => {
    if (selectedPodcasts.length === 0) {
      toast({
        title: "Almost there!",
        description: "Please select at least one podcast.",
        variant: "destructive",
      });
      return;
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    register(
      {
        podcasts: selectedPodcasts.map((p) => JSON.stringify(p)),
        readingLength,
        email,
      },
      {
        onSuccess: () => {
          toast({
            title: "Success!",
            description: "Your digest has been created. Redirecting to your dashboard...",
          });
          navigate("/dashboard");
        },
        onError: (err) => {
          toast({
            title: "Something went wrong",
            description: err.message.includes("400")
              ? "An account with this email already exists. Try logging in."
              : err.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <img
            src={faviconPath}
            alt="PodCap icon"
            className="w-8 h-8 object-contain"
          />
          <span className="font-display font-bold text-lg text-foreground">PodCap</span>
        </div>
        <button
          data-testid="link-login"
          onClick={() => navigate("/login")}
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Log in
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-16">
        <section className="w-full max-w-3xl text-center pt-10 sm:pt-16 pb-10 sm:pb-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center"
          >
            <h1
              data-testid="text-headline"
              className="text-[1.75rem] sm:text-4xl md:text-[2.65rem] font-display font-extrabold text-foreground leading-[1.15] tracking-tight"
            >
              <span className="block">Your favorite podcasts,</span>
              <span className="block">summarized in one <span className="text-primary">daily email</span>.</span>
            </h1>
            <p className="mt-5 text-base sm:text-[1.1rem] text-muted-foreground font-medium tracking-wide uppercase">
              Start free with up to 3 podcasts
            </p>
          </motion.div>
        </section>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="w-full max-w-2xl"
        >
          <div className="glass-panel rounded-2xl sm:rounded-3xl p-5 sm:p-8 flex flex-col gap-10">
            <section className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">1</span>
                <div>
                  <h2 className="text-lg font-display font-bold text-foreground">
                    Choose podcasts to recap
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Start with up to 3 podcasts for free.
                  </p>
                </div>
              </div>
              <div className="pl-10">
                <PodcastSearch
                  selectedPodcasts={selectedPodcasts}
                  onAdd={handleAdd}
                  onRemove={handleRemove}
                  maxSelection={3}
                />
              </div>
            </section>

            <div className="border-t border-black/[0.06]" />

            <section className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">2</span>
                <h2 className="text-lg font-display font-bold text-foreground">
                  How long should your daily recap take to read?
                </h2>
              </div>
              <div className="pl-10">
                <div className="flex bg-black/[0.04] p-1 rounded-xl w-full max-w-sm">
                  {READING_LENGTHS.map((length) => {
                    const isActive = readingLength === length;
                    return (
                      <button
                        key={length}
                        data-testid={`button-reading-${length}`}
                        onClick={() => setReadingLength(length)}
                        className={`
                          relative flex-1 py-2.5 text-sm font-semibold rounded-[10px] transition-all duration-300
                          ${isActive ? "text-primary" : "text-muted-foreground"}
                        `}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="activeTab"
                            className="absolute inset-0 bg-white shadow-sm rounded-[10px] border border-black/[0.04]"
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          />
                        )}
                        <span className="relative z-10">{length} min</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <div className="border-t border-black/[0.06]" />

            <section className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">3</span>
                <h2 className="text-lg font-display font-bold text-foreground">
                  Where should we send your daily recap?
                </h2>
              </div>
              <div className="pl-10 space-y-4">
                <input
                  data-testid="input-email"
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 px-4 bg-black/[0.03] border border-black/[0.06] rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium"
                />
                <p className="text-xs text-muted-foreground">
                  You'll receive one email each day with summaries from the podcasts you selected.
                </p>
              </div>
            </section>

            <button
              data-testid="button-finish"
              onClick={handleSubmit}
              disabled={isPending}
              className="w-full h-14 flex items-center justify-center gap-2.5 rounded-xl font-display font-bold text-base bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.99]"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating your recap...
                </>
              ) : (
                <>
                  Create My Daily Recap
                  <ArrowRight className="w-4.5 h-4.5" />
                </>
              )}
            </button>

            <p className="text-center text-sm text-muted-foreground -mt-3">
              Free for up to 3 podcasts. No credit card required.
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
