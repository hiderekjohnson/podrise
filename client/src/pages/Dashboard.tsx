import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Search, X, Check, Plus, Loader2, LogOut, Mail, Save } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, useUpdateUser, useLogout } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";

const ALL_PODCASTS = [
  { id: "joe-rogan", name: "Joe Rogan", initials: "JR", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  { id: "all-in", name: "All-In Podcast", initials: "AI", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { id: "huberman", name: "Huberman Lab", initials: "HL", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  { id: "acquired", name: "Acquired", initials: "AC", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  { id: "my-first-million", name: "My First Million", initials: "MM", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  { id: "lex-fridman", name: "Lex Fridman", initials: "LF", color: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400" },
  { id: "hbr-ideacast", name: "HBR IdeaCast", initials: "HB", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  { id: "tim-ferriss", name: "The Tim Ferriss Show", initials: "TF", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
  { id: "the-daily", name: "The Daily", initials: "TD", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" },
  { id: "invest-best", name: "Invest Like the Best", initials: "IB", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
];

const READING_MARKS = [5, 10, 15, 20];

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { data: user, isLoading } = useAuth();
  const { mutate: updateUser, isPending: isUpdating } = useUpdateUser();
  const { mutate: logout } = useLogout();
  const { toast } = useToast();

  const [podcasts, setPodcasts] = useState<string[]>([]);
  const [readingLength, setReadingLength] = useState(10);
  const [email, setEmail] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (user) {
      setPodcasts(user.podcasts);
      setReadingLength(user.readingLength);
      setEmail(user.email);
    }
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user && !loggingOut) {
    navigate("/login");
    return null;
  }

  const togglePodcast = (id: string) => {
    const newPodcasts = podcasts.includes(id)
      ? podcasts.filter((p) => p !== id)
      : [...podcasts, id];
    setPodcasts(newPodcasts);
    updateUser(
      { podcasts: newPodcasts },
      {
        onError: () => {
          setPodcasts(user.podcasts);
          toast({
            title: "Failed to update",
            description: "Could not update your podcast list.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleSaveAll = () => {
    updateUser(
      { email, readingLength, podcasts },
      {
        onSuccess: () => {
          setEditingEmail(false);
          toast({ title: "Saved", description: "Your preferences have been updated." });
        },
        onError: (err) => {
          toast({
            title: "Failed to save",
            description: err.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleLogout = () => {
    setLoggingOut(true);
    logout(undefined, {
      onSuccess: () => navigate("/"),
    });
  };

  const filteredPodcasts = searchQuery
    ? ALL_PODCASTS.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : ALL_PODCASTS;

  const selectedPodcastData = ALL_PODCASTS.filter((p) =>
    podcasts.includes(p.id)
  );

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
            Manage Your Daily Podcast Digest
            <br />
            <span className="text-muted-foreground text-lg md:text-xl font-semibold">
              Subscriptions & Preferences
            </span>
          </h1>
          <button
            data-testid="button-logout"
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 glass-panel rounded-2xl p-6">
            <h2 className="font-display font-bold text-lg mb-1">
              Manage Your Source Podcasts
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Choose from our catalog or search for more.
            </p>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4 max-h-[400px] overflow-y-auto hide-scrollbar p-1">
              <AnimatePresence>
                {selectedPodcastData.map((podcast) => (
                  <motion.button
                    key={podcast.id}
                    layout
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    type="button"
                    onClick={() => togglePodcast(podcast.id)}
                    data-testid={`card-podcast-selected-${podcast.id}`}
                    className="relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-primary bg-primary/5 transition-colors"
                  >
                    <div className="absolute -top-1 -right-1 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-md">
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    </div>
                    <div className="absolute -top-1 -left-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-md cursor-pointer">
                      <X className="w-3 h-3" strokeWidth={3} />
                    </div>
                    <div
                      className={`w-16 h-16 sm:w-20 sm:h-20 rounded-xl flex items-center justify-center text-lg font-display font-bold ${podcast.color}`}
                    >
                      {podcast.initials}
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-foreground text-center line-clamp-2">
                      {podcast.name}
                    </span>
                  </motion.button>
                ))}
                {filteredPodcasts
                  .filter((p) => !podcasts.includes(p.id))
                  .map((podcast) => (
                    <motion.button
                      key={podcast.id}
                      layout
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      type="button"
                      onClick={() => togglePodcast(podcast.id)}
                      data-testid={`card-podcast-${podcast.id}`}
                      className="relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-transparent transition-colors"
                    >
                      <div
                        className={`w-16 h-16 sm:w-20 sm:h-20 rounded-xl flex items-center justify-center text-lg font-display font-bold ${podcast.color}`}
                      >
                        {podcast.initials}
                      </div>
                      <span className="text-xs sm:text-sm font-semibold text-foreground text-center line-clamp-2">
                        {podcast.name}
                      </span>
                    </motion.button>
                  ))}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <input
                  data-testid="input-search-podcasts"
                  type="text"
                  placeholder="Search millions of podcasts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 bg-black/[0.03] border border-black/[0.05] rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                />
              </div>
              <button
                data-testid="button-add-podcast"
                className="h-10 px-4 flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
              >
                <Plus className="w-4 h-4" />
                Add New Podcast
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="glass-panel rounded-2xl p-6">
              <h2 className="font-display font-bold text-lg mb-6">
                Fine-Tune Your Reading Length
              </h2>
              <div className="px-2">
                <Slider
                  data-testid="slider-reading-length"
                  value={[readingLength]}
                  onValueChange={([val]) => setReadingLength(val)}
                  min={5}
                  max={20}
                  step={5}
                  className="mb-4"
                />
                <div className="flex justify-between text-sm text-muted-foreground font-medium">
                  {READING_MARKS.map((mark) => (
                    <span
                      key={mark}
                      className={
                        readingLength === mark
                          ? "text-foreground font-bold"
                          : ""
                      }
                    >
                      {mark} min
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-6">
              <h2 className="font-display font-bold text-lg mb-4">
                Receive Your Daily Digest
              </h2>
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                {editingEmail ? (
                  <input
                    data-testid="input-edit-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    className="flex-1 h-10 px-3 bg-black/[0.03] border border-black/[0.05] rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                  />
                ) : (
                  <span
                    data-testid="text-user-email"
                    className="flex-1 text-foreground"
                  >
                    {email}
                  </span>
                )}
                <button
                  data-testid="button-edit-email"
                  onClick={() => setEditingEmail(!editingEmail)}
                  className="text-sm font-medium text-muted-foreground border border-border rounded-lg px-3 py-1.5"
                >
                  {editingEmail ? "Done" : "Edit email"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-center mt-8">
          <button
            data-testid="button-save-all"
            onClick={handleSaveAll}
            disabled={isUpdating}
            className="h-14 px-12 flex items-center justify-center gap-2 rounded-2xl font-display font-bold text-lg bg-foreground text-background border-2 border-dashed border-foreground/30 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isUpdating ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Save className="w-5 h-5" />
                SAVE ALL CHANGES
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
