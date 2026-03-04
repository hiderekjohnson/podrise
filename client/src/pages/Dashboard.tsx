import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, LogOut, ArrowRight, Save } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth, useUpdateUser, useLogout } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PodcastSearch } from "@/components/PodcastSearch";
import faviconPath from "@assets/image_1772642558577.png";

interface SelectedPodcast {
  id: string;
  name: string;
  artworkUrl: string;
}

function parsePodcasts(raw: string[]): SelectedPodcast[] {
  return raw.map((item) => {
    try {
      const parsed = JSON.parse(item);
      if (parsed && typeof parsed === "object" && parsed.id) return parsed;
    } catch {}
    return { id: item, name: item, artworkUrl: "" };
  });
}

const READING_LENGTHS = [5, 10, 15, 20];

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { data: user, isLoading } = useAuth();
  const { mutate: updateUser, isPending: isUpdating } = useUpdateUser();
  const { mutate: logout } = useLogout();
  const { toast } = useToast();

  const [podcasts, setPodcasts] = useState<SelectedPodcast[]>([]);
  const [readingLength, setReadingLength] = useState(10);
  const [email, setEmail] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (user) {
      setPodcasts(parsePodcasts(user.podcasts));
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

  const serializePodcasts = (list: SelectedPodcast[]) =>
    list.map((p) => JSON.stringify(p));

  const handleAdd = (podcast: SelectedPodcast) => {
    const newList = [...podcasts, podcast];
    setPodcasts(newList);
    updateUser(
      { podcasts: serializePodcasts(newList) },
      {
        onError: () => {
          if (user) setPodcasts(parsePodcasts(user.podcasts));
          toast({
            title: "Failed to update",
            description: "Could not update your podcast list.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleRemove = (id: string) => {
    const newList = podcasts.filter((p) => p.id !== id);
    setPodcasts(newList);
    updateUser(
      { podcasts: serializePodcasts(newList) },
      {
        onError: () => {
          if (user) setPodcasts(parsePodcasts(user.podcasts));
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
      { email, readingLength, podcasts: serializePodcasts(podcasts) },
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

  return (
    <div className="min-h-screen flex flex-col">
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <img
            src={faviconPath}
            alt="PodCap icon"
            className="w-8 h-8 object-contain"
            data-testid="img-logo"
          />
          <span className="font-display font-bold text-lg text-foreground">PodCap</span>
        </div>
        <button
          data-testid="button-logout"
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Log out
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-16">
        <section className="w-full max-w-3xl text-center pt-10 sm:pt-14 pb-10 sm:pb-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center gap-3"
          >
            <h1
              className="text-[1.75rem] sm:text-4xl md:text-[2.65rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.02em]"
            >
              Manage Your Recap
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground/80">
              Update your podcasts, reading length, and email below.
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
                    Your podcasts
                  </h2>
                </div>
              </div>
              <div className="pl-10">
                <PodcastSearch
                  selectedPodcasts={podcasts}
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
                            layoutId="dashboardTab"
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
              <div className="pl-10">
                {editingEmail ? (
                  <div className="flex items-center gap-3">
                    <input
                      data-testid="input-edit-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoFocus
                      className="flex-1 h-12 px-4 bg-black/[0.03] border border-black/[0.06] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium"
                    />
                    <button
                      data-testid="button-edit-email"
                      onClick={() => setEditingEmail(false)}
                      className="text-sm font-semibold text-primary shrink-0"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span
                      data-testid="text-user-email"
                      className="text-foreground font-medium"
                    >
                      {email}
                    </span>
                    <button
                      data-testid="button-edit-email"
                      onClick={() => setEditingEmail(true)}
                      className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            </section>

            <div className="flex flex-col items-center gap-2">
              <button
                data-testid="button-save-all"
                onClick={handleSaveAll}
                disabled={isUpdating}
                className="w-full h-14 flex items-center justify-center gap-2.5 rounded-xl font-display font-bold text-base bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.99]"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
