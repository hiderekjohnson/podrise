import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, LogOut, Save, Clock, Globe, Settings, FileText, Eye, X, Podcast, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth, useUpdateUser, useLogout } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PodcastSearch } from "@/components/PodcastSearch";
import ReactMarkdown from "react-markdown";
import faviconPath from "@assets/image_1772642558577.png";

interface SelectedPodcast {
  id: string;
  name: string;
  artworkUrl: string;
}

interface RecapData {
  id: number;
  userId: number;
  recapDate: string;
  podcasts: string[];
  summary: string;
  createdAt: string | null;
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

function parsePodcastName(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.name) return parsed.name;
  } catch {}
  return raw;
}

const READING_LENGTHS = [5, 10, 15, 20];

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Central Europe (CET)" },
  { value: "Europe/Berlin", label: "Berlin (CET)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
  { value: "Australia/Perth", label: "Perth (AWST)" },
];

const DELIVERY_TIMES = [
  { value: "05:00", label: "5:00 AM" },
  { value: "06:00", label: "6:00 AM" },
  { value: "07:00", label: "7:00 AM" },
  { value: "08:00", label: "8:00 AM" },
  { value: "09:00", label: "9:00 AM" },
  { value: "10:00", label: "10:00 AM" },
  { value: "12:00", label: "12:00 PM" },
  { value: "17:00", label: "5:00 PM" },
  { value: "20:00", label: "8:00 PM" },
];

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { data: user, isLoading } = useAuth();
  const { mutate: updateUser, isPending: isUpdating } = useUpdateUser();
  const { mutate: logout } = useLogout();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"settings" | "recaps">("settings");
  const [podcasts, setPodcasts] = useState<SelectedPodcast[]>([]);
  const [readingLength, setReadingLength] = useState(10);
  const [email, setEmail] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [deliveryTime, setDeliveryTime] = useState("07:00");
  const [deliveryTimezone, setDeliveryTimezone] = useState("America/New_York");
  const [loggingOut, setLoggingOut] = useState(false);
  const [viewingRecap, setViewingRecap] = useState<RecapData | null>(null);

  const { data: recaps, isLoading: recapsLoading } = useQuery<RecapData[]>({
    queryKey: ["/api/recaps"],
    enabled: !!user,
  });

  const generateRecap = useMutation({
    mutationFn: () => apiRequest("POST", "/api/recaps/generate"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recaps"] });
      toast({ title: "Recap generated!", description: "Your daily podcast digest is ready to view." });
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (user) {
      setPodcasts(parsePodcasts(user.podcasts));
      setReadingLength(user.readingLength);
      setEmail(user.email);
      setDeliveryTime(user.deliveryTime || "07:00");
      setDeliveryTimezone(user.deliveryTimezone || "America/New_York");
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
      { email, readingLength, podcasts: serializePodcasts(podcasts), deliveryTime, deliveryTimezone },
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

  const formatRecapDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
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
        <section className="w-full max-w-3xl text-center pt-10 sm:pt-14 pb-6 sm:pb-8">
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
          </motion.div>
        </section>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="w-full max-w-2xl"
        >
          <div className="flex bg-black/[0.04] p-1 rounded-xl w-full max-w-xs mx-auto mb-6">
            <button
              data-testid="tab-settings"
              onClick={() => setActiveTab("settings")}
              className={`relative flex-1 py-2.5 text-sm font-semibold rounded-[10px] transition-all duration-300 flex items-center justify-center gap-1.5 ${activeTab === "settings" ? "text-primary" : "text-muted-foreground"}`}
            >
              {activeTab === "settings" && (
                <motion.div
                  layoutId="dashboardTabSwitch"
                  className="absolute inset-0 bg-white shadow-sm rounded-[10px] border border-black/[0.04]"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <Settings className="w-4 h-4 relative z-10" />
              <span className="relative z-10">Settings</span>
            </button>
            <button
              data-testid="tab-recaps"
              onClick={() => setActiveTab("recaps")}
              className={`relative flex-1 py-2.5 text-sm font-semibold rounded-[10px] transition-all duration-300 flex items-center justify-center gap-1.5 ${activeTab === "recaps" ? "text-primary" : "text-muted-foreground"}`}
            >
              {activeTab === "recaps" && (
                <motion.div
                  layoutId="dashboardTabSwitch"
                  className="absolute inset-0 bg-white shadow-sm rounded-[10px] border border-black/[0.04]"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <FileText className="w-4 h-4 relative z-10" />
              <span className="relative z-10">Daily Recaps</span>
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === "settings" ? (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <div className="glass-panel rounded-2xl sm:rounded-3xl p-5 sm:p-8 flex flex-col gap-10">
                  <section className="flex flex-col gap-4">
                    <h2 className="text-lg font-display font-bold text-foreground">
                      Your podcasts
                    </h2>
                    <PodcastSearch
                      selectedPodcasts={podcasts}
                      onAdd={handleAdd}
                      onRemove={handleRemove}
                      maxSelection={3}
                    />
                  </section>

                  <div className="border-t border-black/[0.06]" />

                  <section className="flex flex-col gap-4">
                    <h2 className="text-lg font-display font-bold text-foreground">
                      How long should your daily recap take to read?
                    </h2>
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
                  </section>

                  <div className="border-t border-black/[0.06]" />

                  <section className="flex flex-col gap-4">
                    <h2 className="text-lg font-display font-bold text-foreground">
                      Delivery time
                    </h2>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-2">
                          <Clock className="w-3.5 h-3.5" />
                          Time
                        </label>
                        <select
                          data-testid="select-delivery-time"
                          value={deliveryTime}
                          onChange={(e) => setDeliveryTime(e.target.value)}
                          className="w-full h-12 px-4 bg-black/[0.03] border border-black/[0.06] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium appearance-none cursor-pointer"
                        >
                          {DELIVERY_TIMES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-2">
                          <Globe className="w-3.5 h-3.5" />
                          Timezone
                        </label>
                        <select
                          data-testid="select-delivery-timezone"
                          value={deliveryTimezone}
                          onChange={(e) => setDeliveryTimezone(e.target.value)}
                          className="w-full h-12 px-4 bg-black/[0.03] border border-black/[0.06] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium appearance-none cursor-pointer"
                        >
                          {TIMEZONES.map((tz) => (
                            <option key={tz.value} value={tz.value}>{tz.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </section>

                  <div className="border-t border-black/[0.06]" />

                  <section className="flex flex-col gap-4">
                    <h2 className="text-lg font-display font-bold text-foreground">
                      Where should we send your daily recap?
                    </h2>
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
            ) : (
              <motion.div
                key="recaps"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <div className="glass-panel rounded-2xl sm:rounded-3xl p-5 sm:p-8">
                  {recapsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : !recaps || recaps.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                        <FileText className="w-7 h-7 text-primary" />
                      </div>
                      <h3 className="text-lg font-display font-bold text-foreground mb-1">
                        No recaps yet
                      </h3>
                      <p className="text-sm text-muted-foreground max-w-sm mb-5">
                        Generate your first AI-powered podcast digest now, or check back after your scheduled delivery time.
                      </p>
                      <button
                        data-testid="button-generate-recap"
                        onClick={() => generateRecap.mutate()}
                        disabled={generateRecap.isPending}
                        className="inline-flex items-center gap-2 px-6 h-12 rounded-xl font-display font-bold text-sm bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.99]"
                      >
                        {generateRecap.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            Generate Recap Now
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-5">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                          {recaps.length} recap{recaps.length !== 1 ? "s" : ""}
                        </h3>
                        <button
                          data-testid="button-generate-recap"
                          onClick={() => generateRecap.mutate()}
                          disabled={generateRecap.isPending}
                          className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg font-semibold text-sm bg-primary text-primary-foreground shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                        >
                          {generateRecap.isPending ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5" />
                              Generate
                            </>
                          )}
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                      <table className="w-full" data-testid="table-recaps">
                        <thead>
                          <tr className="border-b border-black/[0.06]">
                            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 pr-4">Date</th>
                            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 pr-4">Podcasts</th>
                            <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3">Summary</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/[0.04]">
                          {recaps.map((recap) => (
                            <tr key={recap.id} className="group" data-testid={`row-recap-${recap.id}`}>
                              <td className="py-4 pr-4 text-sm font-medium text-foreground whitespace-nowrap">
                                {formatRecapDate(recap.recapDate)}
                              </td>
                              <td className="py-4 pr-4">
                                <div className="flex flex-wrap gap-1.5">
                                  {recap.podcasts.map((p, i) => (
                                    <span
                                      key={i}
                                      className="inline-flex items-center gap-1 bg-secondary text-foreground px-2 py-0.5 rounded-full text-xs font-medium"
                                    >
                                      <Podcast className="w-3 h-3 text-primary" />
                                      {parsePodcastName(p)}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="py-4 text-right">
                                <button
                                  data-testid={`button-view-recap-${recap.id}`}
                                  onClick={() => setViewingRecap(recap)}
                                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                                >
                                  <Eye className="w-4 h-4" />
                                  View
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </main>

      <AnimatePresence>
        {viewingRecap && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8 px-4"
            onClick={() => setViewingRecap(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.25 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-black/[0.06] bg-white/95 backdrop-blur rounded-t-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Daily Recap</p>
                    <p className="text-xs text-muted-foreground">{formatRecapDate(viewingRecap.recapDate)}</p>
                  </div>
                </div>
                <button
                  data-testid="button-close-recap"
                  onClick={() => setViewingRecap(null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/[0.04] transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 sm:px-8 py-6 sm:py-8">
                <div className="flex flex-wrap gap-1.5 mb-6">
                  {viewingRecap.podcasts.map((p, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 bg-secondary text-foreground px-2.5 py-1 rounded-full text-xs font-medium"
                    >
                      <Podcast className="w-3 h-3 text-primary" />
                      {parsePodcastName(p)}
                    </span>
                  ))}
                </div>
                <div className="prose prose-sm max-w-none text-foreground" data-testid="text-recap-summary">
                  <ReactMarkdown>{viewingRecap.summary}</ReactMarkdown>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
