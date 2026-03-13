import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Mic, Search, Send, CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/Footer";
import { PodCapWordmark } from "@/components/PodCapHeader";

type PodcastOption = {
  slug: string;
  name: string;
  artwork_url: string | null;
};

export default function PodcasterClaim() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<"search" | "form" | "done">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPodcast, setSelectedPodcast] = useState<PodcastOption | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const { data: podcasts } = useQuery<PodcastOption[]>({
    queryKey: ["/api/podcasts/directory"],
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/podcaster/claim", {
        podcastSlug: selectedPodcast!.slug,
        email,
        name,
      });
    },
    onSuccess: () => {
      setStep("done");
    },
    onError: (err: any) => {
      const msg = err?.message || "Something went wrong";
      toast({ title: "Couldn't submit claim", description: msg, variant: "destructive" });
    },
  });

  const filtered = (podcasts || []).filter(
    (p) => searchQuery.length >= 2 && p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md" data-testid="nav-bar">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-6">
          <Link href="/" data-testid="link-home">
            <PodCapWordmark />
          </Link>
          <Link href="/we-heart-podcasters" className="text-[15px] font-display font-semibold text-muted-foreground hover:text-foreground transition-colors" data-testid="link-back-podcasters">
            For Podcasters
          </Link>
        </div>
      </nav>

      <main className="min-h-screen bg-background">
        <div className="max-w-xl mx-auto px-6 py-20">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/[0.07] text-primary text-[14px] font-display font-bold uppercase tracking-widest mb-6" data-testid="badge-claim">
              <Mic className="w-3.5 h-3.5" />
              Claim Your Podcast
            </div>
            <h1 className="text-[1.75rem] sm:text-[2rem] font-display font-extrabold tracking-[-0.03em] leading-tight mb-3" data-testid="text-claim-title">
              Take control of your podcast page
            </h1>
            <p className="text-[15px] text-muted-foreground leading-relaxed max-w-md mx-auto">
              Claiming lets you customize your sponsor information, add a personal byline, and ensure your listeners see exactly what you want them to see.
            </p>
          </div>

          {step === "search" && (
            <div className="bg-card border border-border rounded-2xl p-6 sm:p-8" data-testid="section-search">
              <label className="block text-[15px] font-display font-semibold mb-2">
                Find your podcast
              </label>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Start typing your podcast name..."
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-border bg-background text-[14px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                  data-testid="input-podcast-search"
                />
              </div>

              {searchQuery.length >= 2 && (
                <div className="max-h-72 overflow-y-auto space-y-1.5" data-testid="list-search-results">
                  {filtered.length === 0 ? (
                    <p className="text-[14px] text-muted-foreground text-center py-6">
                      No podcasts found matching "{searchQuery}"
                    </p>
                  ) : (
                    filtered.slice(0, 15).map((podcast) => (
                      <button
                        key={podcast.slug}
                        onClick={() => {
                          setSelectedPodcast(podcast);
                          setStep("form");
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
                        data-testid={`button-select-${podcast.slug}`}
                      >
                        {podcast.artwork_url ? (
                          <img src={podcast.artwork_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <Mic className="w-4 h-4 text-muted-foreground/40" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-display font-semibold truncate">{podcast.name}</p>
                          <p className="text-[14px] text-muted-foreground truncate">podcap.io/podcasts/{podcast.slug}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              )}

              <p className="text-[14px] text-muted-foreground/60 mt-4 text-center">
                Don't see your podcast? <Link href="/contact" className="text-primary font-semibold hover:underline">Get it added</Link>
              </p>
            </div>
          )}

          {step === "form" && selectedPodcast && (
            <div className="bg-card border border-border rounded-2xl p-6 sm:p-8" data-testid="section-claim-form">
              <div className="flex items-center gap-3 mb-6 p-3 bg-muted/30 rounded-xl">
                {selectedPodcast.artwork_url ? (
                  <img src={selectedPodcast.artwork_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                    <Mic className="w-5 h-5 text-muted-foreground/40" />
                  </div>
                )}
                <div>
                  <p className="text-[15px] font-display font-bold">{selectedPodcast.name}</p>
                  <button onClick={() => { setStep("search"); setSelectedPodcast(null); }} className="text-[14px] text-primary font-semibold hover:underline" data-testid="button-change-podcast">
                    Change
                  </button>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!email.trim() || !name.trim()) return;
                  claimMutation.mutate();
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-[14px] font-display font-semibold mb-1.5">Your name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Sam Parr"
                    required
                    className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-[14px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                    data-testid="input-name"
                  />
                </div>
                <div>
                  <label className="block text-[14px] font-display font-semibold mb-1.5">Your email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@yourpodcast.com"
                    required
                    className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-[14px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                    data-testid="input-email"
                  />
                  <p className="text-[12px] text-muted-foreground/60 mt-1">
                    We'll send a verification to confirm you host this podcast
                  </p>
                </div>
                <Button
                  type="submit"
                  disabled={claimMutation.isPending || !email.trim() || !name.trim()}
                  className="w-full rounded-xl font-display font-bold text-[14px] h-10 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                  data-testid="button-submit-claim"
                >
                  {claimMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5 mr-2" />
                  )}
                  {claimMutation.isPending ? "Submitting..." : "Claim This Podcast"}
                </Button>
              </form>
            </div>
          )}

          {step === "done" && (
            <div className="bg-card border border-border rounded-2xl p-8 text-center" data-testid="section-claim-success">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <h2 className="text-lg font-display font-bold mb-2">Claim submitted</h2>
              <p className="text-[15px] text-muted-foreground mb-1">
                We'll verify your ownership of <strong>{selectedPodcast?.name}</strong> and get back to you at <strong>{email}</strong>.
              </p>
              <p className="text-[14px] text-muted-foreground/60 mt-3">
                Once verified, you'll be able to customize your sponsor information and add a personal byline to your podcast pages.
              </p>
              <Link href="/we-heart-podcasters">
                <Button variant="outline" className="mt-6 rounded-xl font-display font-bold text-[14px]" data-testid="button-back-podcasters">
                  Back to For Podcasters
                </Button>
              </Link>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}
