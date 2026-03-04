import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, LogOut, Mail, Save } from "lucide-react";
import { useAuth, useUpdateUser, useLogout } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";
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

const READING_MARKS = [5, 10, 15, 20];

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
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <img
              src={faviconPath}
              alt="PodCap"
              className="w-9 h-9 object-contain"
              data-testid="img-logo"
            />
            <div>
              <h1 className="text-lg md:text-xl font-display font-bold text-foreground leading-tight">
                PodCap Dashboard
              </h1>
              <span className="text-muted-foreground text-xs font-medium">
                Subscriptions & Preferences
              </span>
            </div>
          </div>
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
              Search and add podcasts, or remove ones you no longer want.
            </p>

            <PodcastSearch
              selectedPodcasts={podcasts}
              onAdd={handleAdd}
              onRemove={handleRemove}
              maxSelection={3}
            />
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
                <div className="flex justify-between gap-1 text-sm text-muted-foreground font-medium">
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
