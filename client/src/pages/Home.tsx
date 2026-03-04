import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Search, X, Headphones, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRegister, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PodcastCard } from "@/components/PodcastCard";

const MOCK_PODCASTS = [
  { id: 'joe-rogan', name: 'Joe Rogan Experience', initials: 'JR', color: 'bg-red-100 text-red-700' },
  { id: 'all-in', name: 'All-In Podcast', initials: 'AI', color: 'bg-blue-100 text-blue-700' },
  { id: 'huberman', name: 'Huberman Lab', initials: 'HL', color: 'bg-emerald-100 text-emerald-700' },
  { id: 'acquired', name: 'Acquired', initials: 'AC', color: 'bg-purple-100 text-purple-700' },
  { id: 'my-first-million', name: 'My First Million', initials: 'MM', color: 'bg-amber-100 text-amber-700' },
  { id: 'lex-fridman', name: 'Lex Fridman Podcast', initials: 'LF', color: 'bg-slate-100 text-slate-700' },
  { id: 'hbr-ideacast', name: 'HBR IdeaCast', initials: 'HB', color: 'bg-orange-100 text-orange-700' },
  { id: 'tim-ferriss', name: 'The Tim Ferriss Show', initials: 'TF', color: 'bg-teal-100 text-teal-700' },
];

const READING_LENGTHS = [5, 10, 15, 20];

export default function Home() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  const { toast } = useToast();
  const { mutate: register, isPending } = useRegister();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [readingLength, setReadingLength] = useState<number>(10);
  const [email, setEmail] = useState("");

  if (user) {
    navigate("/dashboard");
    return null;
  }

  const filteredPodcasts = !searchQuery
    ? MOCK_PODCASTS
    : MOCK_PODCASTS.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      );

  const togglePodcast = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedPodcastsList = MOCK_PODCASTS.filter(p => selectedIds.has(p.id));

  const handleSubmit = () => {
    if (selectedIds.size === 0) {
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
        podcasts: Array.from(selectedIds),
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
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-6 shadow-inner">
          <Headphones className="w-8 h-8" />
        </div>
        <h1 className="text-3xl md:text-5xl font-display font-bold text-foreground mb-4">
          Your Daily Podcast Brief
        </h1>
        <p className="text-lg text-muted-foreground max-w-lg mx-auto">
          Get the best insights from your favorite shows condensed into a quick, readable daily digest.
        </p>
      </div>

      <div className="w-full max-w-3xl glass-panel rounded-3xl p-6 sm:p-10 flex flex-col gap-12 relative overflow-hidden">
        <section className="flex flex-col gap-6">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm">1</span>
              Which podcasts do you want?
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base ml-11">
              Choose up to 3 to start... you can always select more later.
            </p>
          </div>

          <div className="ml-0 sm:ml-11 space-y-4">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5 transition-colors group-focus-within:text-primary" />
              <input
                data-testid="input-search-podcasts"
                type="text"
                placeholder="Search podcasts (e.g. 'Huberman')"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-14 pl-12 pr-4 bg-black/[0.03] border border-black/[0.05] rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-[300px] overflow-y-auto p-1 hide-scrollbar">
              <AnimatePresence>
                {filteredPodcasts.map(podcast => (
                  <PodcastCard
                    key={podcast.id}
                    podcast={podcast}
                    isSelected={selectedIds.has(podcast.id)}
                    onClick={() => togglePodcast(podcast.id)}
                  />
                ))}
              </AnimatePresence>
              {filteredPodcasts.length === 0 && (
                <div className="col-span-full py-8 text-center text-muted-foreground">
                  No podcasts found matching "{searchQuery}"
                </div>
              )}
            </div>

            {selectedPodcastsList.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-4 border-t border-border/50">
                <AnimatePresence>
                  {selectedPodcastsList.map(podcast => (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      key={podcast.id}
                      className="flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-sm font-semibold"
                    >
                      {podcast.name}
                      <button
                        data-testid={`button-remove-podcast-${podcast.id}`}
                        onClick={() => togglePodcast(podcast.id)}
                        className="p-0.5 rounded-full transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm">2</span>
              Set your reading length
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base ml-11">
              How much time do you have to read every day?
            </p>
          </div>

          <div className="ml-0 sm:ml-11">
            <div className="flex bg-black/[0.04] p-1.5 rounded-2xl w-full max-w-md">
              {READING_LENGTHS.map(length => {
                const isActive = readingLength === length;
                return (
                  <button
                    key={length}
                    data-testid={`button-reading-${length}`}
                    onClick={() => setReadingLength(length)}
                    className={`
                      relative flex-1 py-3 text-sm sm:text-base font-semibold rounded-xl transition-all duration-300
                      ${isActive ? 'text-primary' : 'text-muted-foreground'}
                    `}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 bg-white shadow-sm rounded-xl border border-black/[0.04]"
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

        <section className="flex flex-col gap-6">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm">3</span>
              Where should we send it?
            </h2>
          </div>

          <div className="ml-0 sm:ml-11 space-y-6">
            <input
              data-testid="input-email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-14 px-4 bg-black/[0.03] border border-black/[0.05] rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium text-lg"
            />

            <div className="space-y-4 pt-4">
              <button
                data-testid="button-finish"
                onClick={handleSubmit}
                disabled={isPending}
                className="w-full h-16 flex items-center justify-center gap-2 rounded-2xl font-display font-bold text-lg bg-primary text-primary-foreground shadow-xl shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating your digest...
                  </>
                ) : (
                  "Finish & Create My Daily Podcast Digest"
                )}
              </button>

              <p className="text-center text-sm text-muted-foreground">
                We'll send you your first daily brief right now, based on the last week. <br className="hidden sm:block" />
                Future briefs will only cover the previous day.
              </p>

              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <button
                  data-testid="link-login"
                  onClick={() => navigate("/login")}
                  className="text-primary font-semibold"
                >
                  Log in
                </button>
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
