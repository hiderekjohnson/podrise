import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowRight, Mail, Headphones, Trophy } from "lucide-react";
import { motion } from "framer-motion";
import { useRegister, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

interface LeaderboardPodcast {
  id: string;
  name: string;
  artworkUrl: string;
  userCount: number;
  artist: string;
  genres: string[];
  episodeCount: number;
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

  const filteredPodcasts = podcasts?.filter((p) => p.artworkUrl && p.artworkUrl.startsWith("https://"));

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
    <div className="min-h-screen flex flex-col bg-background">
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center" data-testid="link-home">
          <img src={logoPath} alt="PodCap" className="h-9 object-contain" />
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
              PodCap Leaderboard
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
            <div className="glass-panel overflow-hidden">
              <div className="px-5 sm:px-6 py-4 border-b border-black/[0.06] flex items-center gap-2">
                <Headphones className="w-4 h-4 text-primary" />
                <span className="text-sm font-display font-bold text-foreground">Top Podcasts by Users</span>
              </div>
              <div className="divide-y divide-black/[0.04]">
                {filteredPodcasts?.map((podcast, index) => (
                  <button
                    key={podcast.id}
                    onClick={() => setSelectedPodcast(podcast)}
                    className="flex items-center gap-4 sm:gap-5 px-5 sm:px-6 py-4 w-full text-left transition-colors hover:bg-black/[0.02] group/row"
                    data-testid={`leaderboard-row-${index}`}
                  >
                    <span className="text-xs font-bold text-muted-foreground/50 w-5 text-right shrink-0 tabular-nums" data-testid={`rank-${index}`}>
                      {index + 1}
                    </span>
                    <img
                      src={podcast.artworkUrl}
                      alt={podcast.name}
                      className="w-14 h-14 rounded-xl object-cover shrink-0 shadow-sm shadow-black/[0.08]"
                      data-testid={`artwork-${index}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate" data-testid={`name-${index}`}>
                        {podcast.name}
                      </p>
                      {podcast.artist && (
                        <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                          {podcast.artist}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {podcast.genres?.slice(0, 2).map((genre) => (
                          <span key={genre} className="text-[10px] font-semibold text-muted-foreground/70 bg-black/[0.04] px-2 py-0.5 rounded-full">
                            {genre}
                          </span>
                        ))}
                        {podcast.episodeCount > 0 && (
                          <span className="text-[10px] text-muted-foreground/50">
                            {podcast.episodeCount} ep.
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-full bg-primary/[0.08] text-primary transition-all group-hover/row:bg-primary group-hover/row:text-white group-hover/row:shadow-md group-hover/row:shadow-primary/20" data-testid={`button-recap-${index}`}>
                      Get Recaps
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </button>
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
                  className="w-full h-12 flex items-center justify-center gap-2 rounded-2xl font-display font-bold text-sm bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:brightness-105 transition-all active:scale-[0.98]"
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
                    className="w-full h-14 pl-11 pr-4 bg-white border border-black/[0.08] rounded-2xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/25 transition-all font-medium placeholder:text-muted-foreground/40 shadow-sm shadow-black/[0.03]"
                  />
                </div>
                <button
                  data-testid="button-leaderboard-signup"
                  type="submit"
                  disabled={isPending}
                  className="w-full h-12 flex items-center justify-center gap-2 rounded-2xl font-display font-bold text-sm bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:brightness-105 disabled:opacity-50 transition-all active:scale-[0.98]"
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
          <div className="flex items-center">
            <img src={logoPath} alt="PodCap" className="h-5 object-contain opacity-50" />
          </div>
          <p className="text-xs text-muted-foreground/60 text-center">
            See which podcasts are trending. Create your own free daily recap.
          </p>
        </div>
      </footer>
    </div>
  );
}
