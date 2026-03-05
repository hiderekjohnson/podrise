import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowRight, Mail, Headphones, Trophy } from "lucide-react";
import { motion } from "framer-motion";
import { useRegister, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import faviconPath from "@assets/image_1772642558577.png";

interface LeaderboardPodcast {
  id: string;
  name: string;
  artworkUrl: string;
  userCount: number;
}

export default function Leaderboard() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  const { toast } = useToast();
  const { mutate: register, isPending } = useRegister();
  const [selectedPodcast, setSelectedPodcast] = useState<LeaderboardPodcast | null>(null);
  const [email, setEmail] = useState("");

  const { data: podcasts, isLoading } = useQuery<LeaderboardPodcast[]>({
    queryKey: ["/api/leaderboard"],
  });

  const maxCount = podcasts?.[0]?.userCount || 1;

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPodcast) return;
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }

    register(
      {
        podcasts: [JSON.stringify({ id: selectedPodcast.id, name: selectedPodcast.name, artworkUrl: selectedPodcast.artworkUrl })],
        email,
      },
      {
        onSuccess: () => {
          toast({ title: "You're in!", description: `Your ${selectedPodcast.name} digest is set up. Redirecting...` });
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
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-white via-blue-50/30 to-white">
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center gap-2.5" data-testid="link-home">
          <img src={faviconPath} alt="PodCap icon" className="w-8 h-8 object-contain" />
          <span className="font-display font-bold text-lg text-foreground">PodCap</span>
        </a>
        <div className="flex items-center gap-4">
          {user ? (
            <a
              href="/dashboard"
              className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              data-testid="link-dashboard"
            >
              Dashboard
            </a>
          ) : (
            <a
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-login"
            >
              Log in
            </a>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-16">
        <section className="w-full max-w-3xl pt-8 sm:pt-14 pb-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center text-center gap-3"
          >
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full">
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-semibold text-amber-600 tracking-wide uppercase">Most Popular</span>
            </div>
            <h1
              className="text-2xl sm:text-3xl md:text-4xl font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.02em]"
              data-testid="heading-leaderboard"
            >
              Top Podcasts on PodCap
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground max-w-lg">
              See which podcasts our users are getting daily recaps for. Pick one to start your own free digest.
            </p>
          </motion.div>
        </section>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="w-full max-w-2xl"
          >
            <div className="glass-panel rounded-2xl sm:rounded-3xl overflow-hidden">
              <div className="px-5 sm:px-6 py-4 border-b border-black/[0.06] flex items-center gap-2">
                <Headphones className="w-4 h-4 text-primary" />
                <span className="text-sm font-display font-bold text-foreground">Top Podcasts by Users</span>
              </div>
              <div className="divide-y divide-black/[0.04]">
                {podcasts?.map((podcast, index) => (
                  <div
                    key={podcast.id}
                    className="flex items-center gap-3 sm:gap-4 px-5 sm:px-6 py-3.5 hover:bg-black/[0.01] transition-colors"
                    data-testid={`leaderboard-row-${index}`}
                  >
                    <span className="text-sm font-bold text-muted-foreground w-6 text-right shrink-0" data-testid={`rank-${index}`}>
                      {index + 1}
                    </span>
                    <img
                      src={podcast.artworkUrl}
                      alt={podcast.name}
                      className="w-10 h-10 rounded-lg object-cover shadow-sm shrink-0"
                      data-testid={`artwork-${index}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate" data-testid={`name-${index}`}>
                        {podcast.name}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-primary/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/60 rounded-full transition-all"
                            style={{ width: `${Math.max((podcast.userCount / maxCount) * 100, 8)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0" data-testid={`count-${index}`}>
                          {podcast.userCount}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedPodcast(podcast)}
                      className="shrink-0 px-3 py-1.5 text-xs font-bold text-primary bg-primary/8 hover:bg-primary/15 border border-primary/15 rounded-lg transition-all active:scale-[0.97]"
                      data-testid={`button-recap-${index}`}
                    >
                      Create Daily Recap
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </main>

      {selectedPodcast && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedPodcast(null); }}
          data-testid="modal-signup"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 w-full max-w-md flex flex-col items-center gap-5"
          >
            <img
              src={selectedPodcast.artworkUrl}
              alt={selectedPodcast.name}
              className="w-20 h-20 rounded-2xl shadow-lg"
              data-testid="modal-artwork"
            />
            <div className="text-center">
              <h2 className="text-lg font-display font-extrabold text-foreground" data-testid="modal-title">
                Get daily recaps of {selectedPodcast.name}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Enter your email and we'll send you an AI-powered summary every time a new episode drops.
              </p>
            </div>
            {user ? (
              <div className="w-full flex flex-col items-center gap-3">
                <p className="text-sm text-muted-foreground">You're already signed in.</p>
                <button
                  onClick={() => navigate("/dashboard")}
                  className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-sm bg-primary text-primary-foreground shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
                  data-testid="button-go-dashboard"
                >
                  Go to Dashboard
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <form onSubmit={handleSignup} className="w-full flex flex-col gap-3" data-testid="form-leaderboard-signup">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <input
                    data-testid="input-leaderboard-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    autoFocus
                    className="w-full h-12 pl-11 pr-4 bg-white border border-black/[0.08] rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium placeholder:text-muted-foreground/40 shadow-sm"
                  />
                </div>
                <button
                  data-testid="button-leaderboard-signup"
                  type="submit"
                  disabled={isPending}
                  className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-sm bg-primary text-primary-foreground shadow-md hover:shadow-lg disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      Get Free Summaries
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
                <p className="text-xs text-muted-foreground/60 text-center">
                  Free forever for up to 3 podcasts. No credit card required.
                </p>
              </form>
            )}
            <button
              onClick={() => setSelectedPodcast(null)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-close-modal"
            >
              Cancel
            </button>
          </motion.div>
        </div>
      )}

      <footer className="w-full border-t border-black/[0.06] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={faviconPath} alt="PodCap" className="w-5 h-5 object-contain" />
            <span className="text-sm font-semibold text-muted-foreground">PodCap</span>
          </div>
          <p className="text-xs text-muted-foreground/60 text-center">
            See which podcasts are trending. Create your own free daily recap.
          </p>
        </div>
      </footer>
    </div>
  );
}
