import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Loader2, LogOut, Clock, Globe, Settings, FileText, Eye, X, Podcast, Sparkles, Crown, CreditCard, Mail, Shield, Check } from "lucide-react";
import { TimezoneSelect, getDetectedTimezone } from "@/components/TimezoneSelect";
import { TimePicker } from "@/components/TimePicker";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth, useUpdateUser, useLogout } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PodcastSearch } from "@/components/PodcastSearch";
import ReactMarkdown from "react-markdown";
import logoPath from "@assets/Podcap_logo_1772731291095.png";

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


export default function Dashboard() {
  const [, navigate] = useLocation();
  const { data: user, isLoading, isFetching } = useAuth();
  const { mutate: updateUser, isPending: isUpdating } = useUpdateUser();
  const { mutate: logout } = useLogout();
  const { toast } = useToast();

  const hasInvalidatedAuth = useRef(false);
  useEffect(() => {
    if (!hasInvalidatedAuth.current) {
      hasInvalidatedAuth.current = true;
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    }
  }, []);

  const [activeTab, setActiveTab] = useState<"settings" | "recaps">("settings");
  const [podcasts, setPodcasts] = useState<SelectedPodcast[]>([]);
  const [email, setEmail] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [deliveryTime, setDeliveryTime] = useState("07:00");
  const [deliveryTimezone, setDeliveryTimezone] = useState(() => getDetectedTimezone());
  const [loggingOut, setLoggingOut] = useState(false);
  const [viewingRecap, setViewingRecap] = useState<RecapData | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoSave = useCallback((fields: Record<string, any>) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    setAutoSaveStatus("saving");
    autoSaveTimer.current = setTimeout(() => {
      updateUser(fields, {
        onSuccess: () => {
          setAutoSaveStatus("saved");
          savedTimer.current = setTimeout(() => setAutoSaveStatus("idle"), 2000);
        },
        onError: () => {
          setAutoSaveStatus("idle");
          toast({ title: "Failed to save", description: "Your changes could not be saved.", variant: "destructive" });
        },
      });
    }, 800);
  }, [updateUser, toast]);

  const handleEmailChange = useCallback((val: string) => {
    setEmail(val);
    if (emailDebounce.current) clearTimeout(emailDebounce.current);
    if (val.includes("@") && val.includes(".")) {
      emailDebounce.current = setTimeout(() => {
        autoSave({ email: val });
      }, 1200);
    }
  }, [autoSave]);

  const isPro = user?.plan === "pro";

  const { data: impersonationStatus } = useQuery<{ impersonating: boolean; userId?: number }>({
    queryKey: ["/api/auth/impersonation-status"],
  });

  const stopImpersonating = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/stop-impersonating"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/impersonation-status"] });
      navigate("/admin");
    },
  });

  const { data: recaps, isLoading: recapsLoading } = useQuery<RecapData[]>({
    queryKey: ["/api/recaps"],
    enabled: !!user,
  });

  const { data: subscriptionData } = useQuery<{ subscription: any; plan: string }>({
    queryKey: ["/api/stripe/subscription"],
    enabled: !!user && isPro,
  });

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);

  const handleCancelSubscription = async () => {
    setIsCanceling(true);
    try {
      const res = await apiRequest("POST", "/api/stripe/cancel-subscription");
      const data = await res.json();
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        queryClient.invalidateQueries({ queryKey: ["/api/stripe/subscription"] });
        setShowCancelModal(false);
        toast({ title: "Subscription canceled", description: "You're now on the free plan." });
      } else {
        toast({ title: "Cannot cancel", description: data.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to cancel subscription.", variant: "destructive" });
    } finally {
      setIsCanceling(false);
    }
  };

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

  const sendEmail = useMutation({
    mutationFn: (recapId: number) => apiRequest("POST", "/api/recaps/send-email", { recapId }),
    onSuccess: () => {
      toast({ title: "Email sent!", description: "Check your inbox for the recap." });
    },
    onError: (err: Error) => {
      toast({ title: "Email failed", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (user) {
      setPodcasts(parsePodcasts(user.podcasts));
      setEmail(user.email);
      setDeliveryTime(user.deliveryTime || "07:00");
      setDeliveryTimezone(user.deliveryTimezone || "America/New_York");
    }
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "true" && user) {
      apiRequest("POST", "/api/stripe/sync-subscription")
        .then((res) => res.json())
        .then((data) => {
          if (data.plan === "pro") {
            queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
            toast({ title: "Welcome to Pro!", description: "You now have unlimited podcast summaries." });
          }
        })
        .catch(() => {});
      window.history.replaceState({}, "", "/dashboard");
    }
  }, [user]);

  if (isLoading || isFetching) {
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

  const podcastsOverLimit = podcasts.length > 3;
  const podcastsToRemove = podcasts.length - 3;

  return (
    <div className="min-h-screen flex flex-col">
      <AnimatePresence>
        {showCancelModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowCancelModal(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl shadow-2xl shadow-black/20 w-full max-w-sm p-8 flex flex-col items-center gap-5 text-center"
              data-testid="modal-cancel-subscription"
            >
              <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
                <CreditCard className="w-7 h-7 text-red-500" />
              </div>
              <div className="space-y-2">
                <h3 className="font-display font-extrabold text-xl text-foreground" data-testid="modal-cancel-title">
                  Cancel your subscription?
                </h3>
                {podcastsOverLimit ? (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    The free plan supports up to 3 podcasts. You currently have <span className="font-semibold text-foreground">{podcasts.length}</span> selected.
                    Please remove {podcastsToRemove} podcast{podcastsToRemove > 1 ? "s" : ""} from your list before canceling.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    You'll lose access to unlimited podcasts and be moved to the free plan (up to 3 podcasts). This takes effect immediately.
                  </p>
                )}
              </div>
              <div className="w-full space-y-2.5">
                {podcastsOverLimit ? (
                  <button
                    data-testid="button-remove-podcasts-first"
                    onClick={() => setShowCancelModal(false)}
                    className="w-full h-12 flex items-center justify-center gap-2 rounded-2xl font-display font-bold text-sm bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-all active:scale-[0.98]"
                  >
                    Remove podcasts first
                  </button>
                ) : (
                  <button
                    data-testid="button-confirm-cancel"
                    onClick={handleCancelSubscription}
                    disabled={isCanceling}
                    className="w-full h-12 flex items-center justify-center gap-2 rounded-2xl font-display font-bold text-sm bg-red-500 text-white shadow-lg shadow-red-500/20 hover:bg-red-600 disabled:opacity-50 transition-all active:scale-[0.98]"
                  >
                    {isCanceling ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Canceling...
                      </>
                    ) : (
                      "Yes, cancel subscription"
                    )}
                  </button>
                )}
                <button
                  data-testid="button-keep-subscription"
                  onClick={() => setShowCancelModal(false)}
                  className="w-full h-10 flex items-center justify-center rounded-2xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-black/[0.03] transition-colors"
                >
                  {podcastsOverLimit ? "Never mind" : "Keep my subscription"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {impersonationStatus?.impersonating && (
        <div className="w-full bg-amber-500 text-white px-4 py-2.5 flex items-center justify-center gap-3" data-testid="banner-impersonating">
          <Shield className="w-4 h-4" />
          <span className="text-sm font-semibold">
            Viewing as {user?.email}
          </span>
          <button
            data-testid="button-stop-impersonating"
            onClick={() => stopImpersonating.mutate()}
            disabled={stopImpersonating.isPending}
            className="ml-2 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-md text-xs font-bold transition-colors"
          >
            {stopImpersonating.isPending ? "Returning..." : "Back to Admin"}
          </button>
        </div>
      )}
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center" data-testid="img-logo">
          <img
            src={logoPath}
            alt="PodCap"
            className="h-20 -my-5 object-contain"
          />
        </a>
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
          <div className="flex bg-black/[0.04] p-1.5 rounded-2xl w-full max-w-xs mx-auto mb-8">
            <button
              data-testid="tab-settings"
              onClick={() => setActiveTab("settings")}
              className={`relative flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5 ${activeTab === "settings" ? "text-primary" : "text-muted-foreground"}`}
            >
              {activeTab === "settings" && (
                <motion.div
                  layoutId="dashboardTabSwitch"
                  className="absolute inset-0 bg-white shadow-sm rounded-xl border border-black/[0.04]"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <Settings className="w-4 h-4 relative z-10" />
              <span className="relative z-10">Settings</span>
            </button>
            <button
              data-testid="tab-recaps"
              onClick={() => setActiveTab("recaps")}
              className={`relative flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5 ${activeTab === "recaps" ? "text-primary" : "text-muted-foreground"}`}
            >
              {activeTab === "recaps" && (
                <motion.div
                  layoutId="dashboardTabSwitch"
                  className="absolute inset-0 bg-white shadow-sm rounded-xl border border-black/[0.04]"
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
                <div className="glass-panel p-6 sm:p-10 flex flex-col gap-10">
                  <section className="flex flex-col gap-4">
                    <h2 className="text-lg font-display font-bold text-foreground">
                      Your podcasts
                    </h2>
                    <PodcastSearch
                      selectedPodcasts={podcasts}
                      onAdd={handleAdd}
                      onRemove={handleRemove}
                      maxSelection={isPro ? undefined : 3}
                    />
                  </section>

                  <div className="border-t border-black/[0.06]" />

                  <section className="flex flex-col gap-4">
                    <h2 className="text-lg font-display font-bold text-foreground">
                      Email recap delivery time
                    </h2>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-2">
                          <Clock className="w-3.5 h-3.5" />
                          Time
                        </label>
                        <TimePicker
                          value={deliveryTime}
                          onChange={(t) => { setDeliveryTime(t); autoSave({ deliveryTime: t }); }}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-2">
                          <Globe className="w-3.5 h-3.5" />
                          Timezone
                        </label>
                        <TimezoneSelect
                          value={deliveryTimezone}
                          onChange={(tz) => { setDeliveryTimezone(tz); autoSave({ deliveryTimezone: tz }); }}
                        />
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
                          onChange={(e) => handleEmailChange(e.target.value)}
                          autoFocus
                          className="flex-1 h-14 px-5 bg-white border border-black/[0.08] rounded-2xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/25 transition-all font-medium shadow-sm shadow-black/[0.03]"
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

                  {isPro && (
                  <>
                  <div className="border-t border-black/[0.06]" />
                  <section className="flex flex-col gap-4">
                    <h2 className="text-lg font-display font-bold text-foreground">
                      Subscription
                    </h2>
                    <div className="rounded-2xl border border-black/[0.06] bg-black/[0.02] p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Crown className="w-5 h-5 text-primary" />
                          <span className="font-display font-bold text-foreground">PodCap Pro</span>
                          <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">Active</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Monthly fee</span>
                        <span className="font-semibold text-foreground">$9.99/month</span>
                      </div>
                      {subscriptionData?.subscription?.current_period_end && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Next billing date</span>
                          <span className="font-semibold text-foreground">
                            {new Date(
                              typeof subscriptionData.subscription.current_period_end === "number"
                                ? subscriptionData.subscription.current_period_end * 1000
                                : subscriptionData.subscription.current_period_end
                            ).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                          </span>
                        </div>
                      )}
                      <div className="pt-1">
                        <button
                          data-testid="button-cancel-subscription"
                          onClick={() => setShowCancelModal(true)}
                          className="text-sm font-medium text-red-500 hover:text-red-600 transition-colors"
                        >
                          Cancel subscription
                        </button>
                      </div>
                    </div>
                  </section>
                  </>
                  )}

                  <AnimatePresence>
                    {autoSaveStatus !== "idle" && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground py-2"
                      >
                        {autoSaveStatus === "saving" ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5 text-green-500" />
                            <span className="text-green-600">Saved</span>
                          </>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
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
                        className="inline-flex items-center gap-2 px-6 h-12 rounded-2xl font-display font-bold text-sm bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
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
                <div className="flex items-center gap-2">
                  <button
                    data-testid="button-send-email"
                    onClick={() => sendEmail.mutate(viewingRecap.id)}
                    disabled={sendEmail.isPending}
                    className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-all disabled:opacity-50"
                  >
                    {sendEmail.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                    Send to Email
                  </button>
                  <button
                    data-testid="button-close-recap"
                    onClick={() => setViewingRecap(null)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/[0.04] transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
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
