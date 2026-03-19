import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { Loader2, LogOut, Clock, Globe, Settings, FileText, Eye, X, Podcast, Mail, Shield, Check, Palmtree, CalendarOff, PartyPopper, Plus, Sparkles, TrendingUp, HelpCircle, ExternalLink, Trash2, AlertTriangle, Tag, Brain, Rocket, Lightbulb, BarChart3, Wallet, Crown, Users, Megaphone, Handshake, Zap, GitFork, Cpu, LineChart, Building2, Heart, Flame, ArrowUpCircle, Scale, GraduationCap, Palette, Video, UserPlus, Cloud, GitBranch, Layout, Target, Cog, Bot, Coins, Leaf, Hammer, Briefcase } from "lucide-react";
import { TimezoneSelect, getDetectedTimezone } from "@/components/TimezoneSelect";
import { TimePicker } from "@/components/TimePicker";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth, useUpdateUser, useLogout } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PodcastSearch } from "@/components/PodcastSearch";
import ReactMarkdown from "react-markdown";
import { PodRiseWordmark } from "@/components/PodRiseHeader";
import { TOPICS, getCategoryPath, type TopicConfig } from "@/data/topicData";

const TOPIC_ICON_MAP: Record<string, any> = {
  Brain, Rocket, Lightbulb, TrendingUp, BarChart3, Wallet, Crown, Users,
  Megaphone, Handshake, Zap, GitFork, Sparkles, Cpu, LineChart, Building2,
  Heart, Flame, ArrowUpCircle, Scale, GraduationCap, Palette, Video, Globe,
  UserPlus, Cloud, GitBranch, Layout, Target, Cog, Bot, Coins, Leaf, Shield, Hammer, Briefcase,
};

interface SelectedPodcast {
  id: string;
  name: string;
  artworkUrl: string;
  artist?: string;
}

interface RecapData {
  id: number;
  userId: number;
  recapDate: string;
  podcasts: string[];
  summary: string;
  createdAt: string | null;
}

interface LeaderboardPodcast {
  id: string;
  name: string;
  artworkUrl: string;
  userCount: number;
  artist: string;
  genres: string[];
}

type TabKey = "emails" | "settings" | "recaps";

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

function hiResArtwork(url: string) {
  return url.replace(/\/\d+x\d+bb\./, "/200x200bb.");
}

function fixMarkdownLinks(md: string): string {
  return md.replace(/\[([^\]]+)\]\(([^)]*\([^)]*\)[^)]*)\)/g, (match, text, url) => {
    const fixedUrl = url.replace(/\(/g, "%28").replace(/\)/g, "%29");
    return `[${text}](${fixedUrl})`;
  }).replace(/\[Spotify\]\(([^)]*)\)(\S+)/g, (match, url, trailing) => {
    const fullUrl = url + trailing.replace(/\)$/, "");
    const cleanUrl = fullUrl.replace(/\(/g, "%28").replace(/\)/g, "%29");
    return `[Spotify](${cleanUrl})`;
  });
}

const TABS: { key: TabKey; label: string; icon: typeof Podcast }[] = [
  { key: "emails", label: "My Emails", icon: Mail },
  { key: "recaps", label: "Recaps", icon: FileText },
  { key: "settings", label: "Settings", icon: Settings },
];

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { data: user, isLoading, isFetching } = useAuth();
  const { mutate: updateUser, isPending: isUpdating } = useUpdateUser();
  const { mutate: logout } = useLogout();
  const { toast } = useToast();

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/account", { confirmation: "DELETE" });
    },
    onSuccess: () => {
      queryClient.clear();
      navigate("/");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to delete account", variant: "destructive" });
    },
  });

  const hasInvalidatedAuth = useRef(false);
  useEffect(() => {
    if (!hasInvalidatedAuth.current) {
      hasInvalidatedAuth.current = true;
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    }
  }, []);

  const [activeTab, setActiveTab] = useState<TabKey>("emails");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [podcasts, setPodcasts] = useState<SelectedPodcast[]>([]);
  const [email, setEmail] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [deliveryTime, setDeliveryTime] = useState("07:00");
  const [deliveryTimezone, setDeliveryTimezone] = useState(() => getDetectedTimezone());
  const [loggingOut, setLoggingOut] = useState(false);
  const [viewingRecap, setViewingRecap] = useState<RecapData | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const discoverRef = useRef<HTMLDivElement>(null);
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

  const { data: leaderboardData } = useQuery<LeaderboardPodcast[]>({
    queryKey: ["/api/leaderboard"],
    enabled: !!user,
  });

  const [vacationUntil, setVacationUntil] = useState<string | null>(null);
  const [vacationInput, setVacationInput] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [showWelcome, setShowWelcome] = useState(false);

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
      setVacationUntil((user as any).vacationUntil || null);
    }
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("welcome") === "true") {
      setShowWelcome(true);
      window.history.replaceState({}, "", "/dashboard");
    }
    if (params.get("tab")) {
      const t = params.get("tab") as TabKey;
      if (["emails", "settings", "recaps"].includes(t)) setActiveTab(t);
      else if (t === "podcasts" || t === "topics") setActiveTab("emails");
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

  if (user && !user.emailVerified) {
    navigate("/verify-email");
    return null;
  }

  const serializePodcasts = (list: SelectedPodcast[]) =>
    list.map((p) => JSON.stringify(p));

  const handleAdd = (podcast: SelectedPodcast) => {
    setPodcasts((prev) => {
      if (prev.some(p => p.id === podcast.id)) return prev;
      const newList = [...prev, podcast];
      updateUser(
        { podcasts: serializePodcasts(newList) },
        {
          onError: () => {
            if (user) setPodcasts(parsePodcasts(user.podcasts));
            toast({ title: "Failed to update", description: "Could not update your podcast list.", variant: "destructive" });
          },
        }
      );
      return newList;
    });
  };

  const handleRemove = (id: string) => {
    setPodcasts((prev) => {
      const newList = prev.filter((p) => p.id !== id);
      updateUser(
        { podcasts: serializePodcasts(newList) },
        {
          onError: () => {
            if (user) setPodcasts(parsePodcasts(user.podcasts));
            toast({ title: "Failed to update", description: "Could not update your podcast list.", variant: "destructive" });
          },
        }
      );
      return newList;
    });
  };

  const handleSuggestionAdd = (podcast: { id: string; name: string; artworkUrl: string; artist?: string }) => {
    handleAdd(podcast);
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

  const selectedIds = new Set(podcasts.map(p => p.id));
  const popularPodcasts = (leaderboardData || []).filter(p => !selectedIds.has(p.id)).slice(0, 6);
  const popularIds = new Set(popularPodcasts.map(p => p.id));

  const userGenres = new Set<string>();
  if (leaderboardData) {
    for (const p of podcasts) {
      const match = leaderboardData.find(l => l.id === p.id);
      if (match) match.genres.forEach(g => userGenres.add(g));
    }
  }
  const recommendedPodcasts = (leaderboardData || [])
    .filter(p => !selectedIds.has(p.id) && !popularIds.has(p.id) && p.genres.some(g => userGenres.has(g)))
    .slice(0, 6);

  return (
    <div className="min-h-screen flex flex-col bg-[#f8f9fb]">
      <AnimatePresence>
        {showWelcome && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowWelcome(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 16 }}
              transition={{ duration: 0.35, type: "spring", bounce: 0.3 }}
              className="bg-white rounded-2xl shadow-2xl shadow-black/20 w-full max-w-md p-8 flex flex-col items-center gap-5 text-center"
              data-testid="modal-welcome"
            >
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <PartyPopper className="w-8 h-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="font-display font-extrabold text-2xl text-foreground" data-testid="text-welcome-title">
                  You're all set!
                </h3>
                <p className="text-base text-[#52525B] dark:text-[#A1A1AA] leading-relaxed">
                  Your podcast recap is locked and loaded. If any of your favorite shows drop a new episode today, you'll get your first digest <span className="font-semibold text-foreground">tomorrow morning</span>.
                </p>
              </div>
              <div className="w-full rounded-xl bg-primary/[0.04] border border-primary/10 p-4">
                <p className="text-[15px] text-muted-foreground">
                  We've saved PodRise listeners an estimated <span className="font-bold text-primary">2,400+ hours</span> of listening time. We're excited to start saving you some too.
                </p>
              </div>
              <button
                data-testid="button-close-welcome"
                onClick={() => setShowWelcome(false)}
                className="w-full h-12 flex items-center justify-center gap-2 rounded-2xl font-display font-bold text-base bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-105 transition-all active:scale-[0.98]"
              >
                Let's go!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {impersonationStatus?.impersonating && (
        <div className="w-full bg-amber-500 text-white px-4 py-2.5 flex items-center justify-center gap-3" data-testid="banner-impersonating">
          <Shield className="w-4 h-4" />
          <span className="text-base font-semibold">Viewing as {user?.email}</span>
          <button
            data-testid="button-stop-impersonating"
            onClick={() => stopImpersonating.mutate()}
            disabled={stopImpersonating.isPending}
            className="ml-2 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-md text-[15px] font-bold transition-colors"
          >
            {stopImpersonating.isPending ? "Returning..." : "Back to Admin"}
          </button>
        </div>
      )}

      <header className="sticky top-0 z-40 w-full border-b border-black/[0.06] bg-white/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center" data-testid="img-logo">
            <PodRiseWordmark />
          </a>
          <div className="flex items-center gap-4">
            <a
              href="/help"
              data-testid="link-help"
              className="flex items-center gap-1.5 text-base font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Help</span>
            </a>
            <button
              data-testid="button-logout"
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-base font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-16">
        <div className="flex items-center gap-1 bg-white border border-black/[0.06] rounded-xl p-1 mb-6 overflow-x-auto hide-scrollbar" data-testid="nav-tabs">
          {TABS.map(tab => (
            <button
              key={tab.key}
              data-testid={`tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-base font-semibold whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "emails" && (() => {
            const userIndustries: string[] = (user as any)?.industries || [];
            const userInterests: string[] = (user as any)?.interests || [];
            const userRoles: string[] = (user as any)?.roles || [];
            const hasPodcastRecap = podcasts.length > 0;
            const industryCount = userIndustries.length;
            const roleCount = userRoles.length;
            const interestCount = userInterests.length;

            const completenessItems = [
              { label: "Podcast Recap", done: hasPodcastRecap, target: "1 podcast recap" },
              { label: "2+ Industries", done: industryCount >= 2, target: `${industryCount}/2 industries` },
              { label: "1+ Role", done: roleCount >= 1, target: `${roleCount}/1 role` },
              { label: "2+ Interests", done: interestCount >= 2, target: `${interestCount}/2 interests` },
            ];
            const completedCount = completenessItems.filter(i => i.done).length;
            const completenessPercent = Math.round((completedCount / completenessItems.length) * 100);

            const renderTopicSection = (
              category: "industry" | "interest" | "role",
              sectionTitle: string,
              sectionSubtitle: string,
              sectionIcon: any,
              recommendedCount: number,
              fieldName: string,
              userSlugs: string[],
            ) => {
              const subscribedTopics = TOPICS.filter(t => t.category === category && userSlugs.includes(t.slug));
              const availableTopics = TOPICS.filter(t => t.category === category && !userSlugs.includes(t.slug));
              const isExpanded = expandedSection === fieldName;
              const nudge = userSlugs.length < recommendedCount;
              const SIcon = sectionIcon;

              return (
                <div className="bg-white border border-black/[0.06] rounded-2xl overflow-hidden" data-testid={`section-${fieldName}`}>
                  <div className="px-6 pt-5 pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-primary/[0.08] flex items-center justify-center">
                          <SIcon className="w-4.5 h-4.5 text-primary" />
                        </div>
                        <div>
                          <h2 className="text-base font-display font-bold text-foreground" data-testid={`heading-${fieldName}`}>
                            {sectionTitle}
                          </h2>
                          <p className="text-[13px] text-muted-foreground">{sectionSubtitle}</p>
                        </div>
                      </div>
                      <span className="text-[14px] font-semibold text-muted-foreground bg-black/[0.04] px-2.5 py-1 rounded-full">
                        {subscribedTopics.length} email{subscribedTopics.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  {subscribedTopics.length > 0 ? (
                    <div className="px-6 pb-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {subscribedTopics.map((topic) => {
                          const TIcon = TOPIC_ICON_MAP[topic.icon] || Sparkles;
                          return (
                            <div
                              key={topic.slug}
                              className="group flex items-center gap-3 p-3 rounded-xl border border-primary/15 bg-primary/[0.03] transition-all"
                              data-testid={`topic-subscribed-${topic.slug}`}
                            >
                              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${topic.color} flex items-center justify-center shrink-0`}>
                                <TIcon className="w-4 h-4 text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-semibold text-foreground truncate">{topic.name}</p>
                                <p className="text-[12px] text-muted-foreground">Daily briefing</p>
                              </div>
                              <button
                                onClick={() => {
                                  const newList = userSlugs.filter(s => s !== topic.slug);
                                  updateUser({ [fieldName]: newList });
                                }}
                                className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground/30 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                                data-testid={`button-unsubscribe-${topic.slug}`}
                                aria-label={`Unsubscribe from ${topic.name}`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="px-6 pb-4">
                      <div className="flex items-center gap-3 p-4 rounded-xl bg-black/[0.02] border border-dashed border-black/[0.08]" data-testid={`empty-${fieldName}`}>
                        <SIcon className="w-5 h-5 text-muted-foreground/40" />
                        <p className="text-[14px] text-muted-foreground">
                          No {sectionTitle.toLowerCase()} emails yet. Add some to start receiving daily briefings.
                        </p>
                      </div>
                    </div>
                  )}

                  {nudge && subscribedTopics.length > 0 && (
                    <div className="px-6 pb-3">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <p className="text-[13px] text-amber-700">
                          We recommend {recommendedCount}+ {category === "industry" ? "industries" : category === "role" ? "roles" : "interests"} for the best coverage.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="px-6 pb-5 border-t border-black/[0.04]">
                    <button
                      onClick={() => setExpandedSection(isExpanded ? null : fieldName)}
                      className="flex items-center gap-1.5 text-[14px] font-semibold text-primary hover:text-primary/80 transition-colors mt-3"
                      data-testid={`button-add-more-${fieldName}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {isExpanded ? "Hide options" : `Add ${category === "industry" ? "industries" : category === "role" ? "roles" : "interests"}`}
                    </button>
                    <AnimatePresence>
                      {isExpanded && availableTopics.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="flex flex-wrap gap-2 mt-3">
                            {availableTopics.map((topic) => {
                              const TIcon = TOPIC_ICON_MAP[topic.icon] || Sparkles;
                              return (
                                <button
                                  key={topic.slug}
                                  onClick={() => {
                                    const newList = [...userSlugs, topic.slug];
                                    updateUser({ [fieldName]: newList });
                                  }}
                                  className="group flex items-center gap-2 px-3 py-2 rounded-xl border border-black/[0.06] bg-white hover:border-primary/20 hover:bg-primary/[0.02] transition-all cursor-pointer"
                                  data-testid={`button-subscribe-${topic.slug}`}
                                >
                                  <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${topic.color} flex items-center justify-center`}>
                                    <TIcon className="w-3 h-3 text-white" />
                                  </div>
                                  <span className="text-[14px] font-medium text-foreground group-hover:text-primary transition-colors">{topic.name}</span>
                                  <Plus className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              );
            };

            return (
              <motion.div
                key="emails"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="space-y-5"
              >
                {completenessPercent < 100 && (
                  <div className="bg-white border border-black/[0.06] rounded-2xl p-5" data-testid="section-completeness">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <p className="text-[14px] font-bold text-foreground">Email Portfolio</p>
                      </div>
                      <span className="text-[13px] font-semibold text-primary" data-testid="text-completeness-percent">{completenessPercent}% complete</span>
                    </div>
                    <div className="w-full h-2 bg-black/[0.06] rounded-full overflow-hidden mb-3" data-testid="progress-completeness">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${completenessPercent}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="h-full bg-primary rounded-full"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {completenessItems.map((item) => (
                        <div
                          key={item.label}
                          data-testid={`chip-completeness-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium ${
                            item.done
                              ? "bg-primary/[0.08] text-primary"
                              : "bg-black/[0.03] text-muted-foreground"
                          }`}
                        >
                          {item.done ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          {item.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-white border border-black/[0.06] rounded-2xl overflow-hidden" data-testid="section-podcast-recap">
                  <div className="px-6 pt-5 pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-primary/[0.08] flex items-center justify-center">
                          <Podcast className="w-4.5 h-4.5 text-primary" />
                        </div>
                        <div>
                          <h2 className="text-base font-display font-bold text-foreground" data-testid="heading-podcast-recap">
                            Podcast Recap
                          </h2>
                          <p className="text-[13px] text-muted-foreground">One bundled email with recaps from all your shows</p>
                        </div>
                      </div>
                      <span className="text-[14px] font-semibold text-muted-foreground bg-black/[0.04] px-2.5 py-1 rounded-full" data-testid="text-podcast-count">
                        {podcasts.length} podcast{podcasts.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  {podcasts.length > 0 ? (
                    <div className="px-6 pb-4">
                      <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-1">
                        <AnimatePresence initial={false}>
                          {podcasts.map((podcast) => (
                            <motion.div
                              key={podcast.id}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              transition={{ duration: 0.2 }}
                              data-testid={`card-podcast-${podcast.id}`}
                              className="flex flex-col items-center gap-2 shrink-0 group relative w-20"
                            >
                              <div className="relative">
                                {podcast.artworkUrl ? (
                                  <img
                                    src={hiResArtwork(podcast.artworkUrl)}
                                    alt={podcast.name}
                                    className="w-16 h-16 rounded-xl object-cover shadow-sm"
                                    data-testid={`img-podcast-${podcast.id}`}
                                  />
                                ) : (
                                  <div className="w-16 h-16 rounded-xl bg-primary/[0.08] flex items-center justify-center">
                                    <Podcast className="w-7 h-7 text-primary" />
                                  </div>
                                )}
                                <button
                                  data-testid={`button-remove-podcast-${podcast.id}`}
                                  onClick={() => handleRemove(podcast.id)}
                                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-black/10 shadow-sm flex items-center justify-center text-muted-foreground/50 hover:text-red-500 hover:border-red-200 transition-colors opacity-0 group-hover:opacity-100"
                                  aria-label={`Remove ${podcast.name}`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                              <p className="text-[13px] font-medium text-foreground text-center leading-tight line-clamp-2 w-full" data-testid={`text-podcast-name-${podcast.id}`}>
                                {podcast.name}
                              </p>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                      {podcasts.length < 3 && (
                        <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <p className="text-[13px] text-amber-700">
                            Add more podcasts to get a richer daily recap.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="px-6 pb-4">
                      <div className="flex items-center gap-3 p-4 rounded-xl bg-black/[0.02] border border-dashed border-black/[0.08]" data-testid="empty-podcasts">
                        <Podcast className="w-5 h-5 text-muted-foreground/40" />
                        <p className="text-[14px] text-muted-foreground">
                          No podcasts yet. Search below to start getting daily recaps.
                        </p>
                      </div>
                    </div>
                  )}

                  <div ref={discoverRef} className="px-6 pb-5 border-t border-black/[0.04]">
                    <div className="pt-3">
                      <PodcastSearch
                        selectedPodcasts={podcasts}
                        onAdd={handleAdd}
                      />
                    </div>

                    {popularPodcasts.length > 0 && (
                      <div className="mt-4">
                        <div className="flex items-center gap-2 mb-3">
                          <TrendingUp className="w-3.5 h-3.5 text-primary" />
                          <h3 className="text-[13px] font-bold text-foreground uppercase tracking-wider" data-testid="heading-popular">
                            Popular
                          </h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {popularPodcasts.slice(0, 4).map(podcast => (
                            <button
                              key={podcast.id}
                              data-testid={`button-suggest-popular-${podcast.id}`}
                              onClick={() => handleSuggestionAdd({ id: podcast.id, name: podcast.name, artworkUrl: podcast.artworkUrl, artist: podcast.artist })}
                              className="flex items-center gap-3 p-2.5 rounded-xl border border-black/[0.04] hover:border-primary/20 hover:bg-primary/[0.02] transition-all group text-left"
                            >
                              {podcast.artworkUrl ? (
                                <img src={hiResArtwork(podcast.artworkUrl)} alt={podcast.name} className="w-10 h-10 rounded-lg object-cover shrink-0 shadow-sm" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-primary/[0.08] flex items-center justify-center shrink-0">
                                  <Podcast className="w-5 h-5 text-primary" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-semibold text-foreground leading-snug truncate">{podcast.name}</p>
                                <p className="text-[12px] text-muted-foreground truncate">{podcast.artist}</p>
                              </div>
                              <Plus className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary shrink-0 transition-colors" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {renderTopicSection("industry", "Industry Intel", "Daily briefings on the industries you follow", Globe, 2, "industries", userIndustries)}
                {renderTopicSection("role", "Role Intelligence", "Insights tailored to your professional role", Briefcase, 1, "roles", userRoles)}
                {renderTopicSection("interest", "Interest Digest", "Daily updates on topics you care about", Lightbulb, 2, "interests", userInterests)}
              </motion.div>
            );
          })()}

          {activeTab === "recaps" && (
            <motion.div
              key="recaps"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
              <div className="bg-white border border-black/[0.06] rounded-2xl overflow-hidden">
                {recapsLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : !recaps || recaps.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                      <FileText className="w-7 h-7 text-primary" />
                    </div>
                    <h3 className="text-lg font-display font-bold text-foreground mb-1">No recaps yet</h3>
                    <p className="text-base text-[#52525B] dark:text-[#A1A1AA] max-w-xs">
                      Your first recap will arrive after your next scheduled delivery time.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="px-6 pt-6 pb-3 flex items-center justify-between">
                      <h2 className="text-lg font-display font-bold text-foreground">Daily Recaps</h2>
                      <span className="text-[15px] font-semibold text-muted-foreground bg-black/[0.04] px-2.5 py-1 rounded-full">
                        {recaps.length} recap{recaps.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="px-6 pb-6">
                      <div className="divide-y divide-black/[0.04]">
                        {recaps.map((recap) => (
                          <div key={recap.id} className="flex items-center gap-4 py-4" data-testid={`row-recap-${recap.id}`}>
                            <div className="w-10 h-10 rounded-xl bg-primary/[0.06] flex items-center justify-center shrink-0">
                              <FileText className="w-4.5 h-4.5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-base font-semibold text-foreground">{formatRecapDate(recap.recapDate)}</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {recap.podcasts.slice(0, 3).map((p, i) => (
                                  <span key={i} className="text-[15px] text-muted-foreground">{parsePodcastName(p)}{i < Math.min(recap.podcasts.length, 3) - 1 ? "," : ""}</span>
                                ))}
                                {recap.podcasts.length > 3 && (
                                  <span className="text-[15px] text-muted-foreground">+{recap.podcasts.length - 3} more</span>
                                )}
                              </div>
                            </div>
                            <button
                              data-testid={`button-view-recap-${recap.id}`}
                              onClick={() => setViewingRecap(recap)}
                              className="shrink-0 h-8 px-3 rounded-lg flex items-center gap-1.5 text-[15px] font-semibold text-primary hover:bg-primary/[0.06] transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "settings" && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              <div className="bg-white border border-black/[0.06] rounded-2xl overflow-hidden">
                <div className="px-6 pt-6 pb-2">
                  <h2 className="text-lg font-display font-bold text-foreground">Delivery Schedule</h2>
                  <p className="text-base text-[#52525B] dark:text-[#A1A1AA] mt-1">Choose when to receive your daily recap email.</p>
                </div>
                <div className="px-6 pb-6 pt-3">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <label className="flex items-center gap-1.5 text-[15px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        <Clock className="w-3.5 h-3.5" />
                        Time
                      </label>
                      <TimePicker
                        value={deliveryTime}
                        onChange={(t) => { setDeliveryTime(t); autoSave({ deliveryTime: t }); }}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="flex items-center gap-1.5 text-[15px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        <Globe className="w-3.5 h-3.5" />
                        Timezone
                      </label>
                      <TimezoneSelect
                        value={deliveryTimezone}
                        onChange={(tz) => { setDeliveryTimezone(tz); autoSave({ deliveryTimezone: tz }); }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-black/[0.06] rounded-2xl overflow-hidden">
                <div className="px-6 pt-6 pb-2">
                  <h2 className="text-lg font-display font-bold text-foreground">Email Address</h2>
                  <p className="text-base text-[#52525B] dark:text-[#A1A1AA] mt-1">Where we send your daily recap.</p>
                </div>
                <div className="px-6 pb-6 pt-3">
                  {editingEmail ? (
                    <div className="flex items-center gap-3">
                      <input
                        data-testid="input-edit-email"
                        type="email"
                        value={email}
                        onChange={(e) => handleEmailChange(e.target.value)}
                        autoFocus
                        className="flex-1 h-11 px-4 bg-white border border-black/[0.08] rounded-xl text-[17px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/25 transition-all font-medium"
                      />
                      <button
                        data-testid="button-edit-email"
                        onClick={() => setEditingEmail(false)}
                        className="h-11 px-4 rounded-xl text-base font-semibold bg-primary text-white hover:brightness-105 transition-all"
                      >
                        Done
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span data-testid="text-user-email" className="text-base font-medium text-foreground truncate">{email}</span>
                      </div>
                      <button
                        data-testid="button-edit-email"
                        onClick={() => setEditingEmail(true)}
                        className="text-[15px] font-semibold text-primary hover:text-primary/80 transition-colors shrink-0"
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white border border-black/[0.06] rounded-2xl overflow-hidden">
                <div className="px-6 pt-6 pb-2">
                  <div className="flex items-center gap-2">
                    <Palmtree className="w-4.5 h-4.5 text-amber-500" />
                    <h2 className="text-lg font-display font-bold text-foreground">Vacation Mode</h2>
                  </div>
                  <p className="text-base text-[#52525B] dark:text-[#A1A1AA] mt-1">Pause your daily recaps while you're away.</p>
                </div>
                <div className="px-6 pb-6 pt-3">
                  {vacationUntil ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4" data-testid="section-vacation-active">
                      <p className="text-base font-semibold text-foreground mb-1">
                        Recaps paused until {new Date(vacationUntil + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                      </p>
                      <p className="text-[15px] text-muted-foreground mb-3">You won't receive emails until this date.</p>
                      <div className="flex items-center gap-2">
                        <input
                          data-testid="input-vacation-update"
                          type="date"
                          value={vacationInput || vacationUntil}
                          min={new Date().toISOString().split("T")[0]}
                          onChange={(e) => setVacationInput(e.target.value)}
                          className="h-9 px-3 bg-white border border-black/[0.08] rounded-lg text-[17px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all"
                        />
                        {vacationInput && vacationInput !== vacationUntil && (
                          <button
                            data-testid="button-update-vacation"
                            onClick={() => { setVacationUntil(vacationInput); autoSave({ vacationUntil: vacationInput }); setVacationInput(""); }}
                            className="h-9 px-3 rounded-lg text-[15px] font-semibold bg-primary text-white hover:brightness-105 transition-all"
                          >
                            Update
                          </button>
                        )}
                        <button
                          data-testid="button-cancel-vacation"
                          onClick={() => { setVacationUntil(null); setVacationInput(""); autoSave({ vacationUntil: null }); }}
                          className="h-9 px-3 rounded-lg text-[15px] font-semibold text-red-500 hover:bg-red-50 transition-all flex items-center gap-1"
                        >
                          <CalendarOff className="w-3 h-3" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <input
                        data-testid="input-vacation-date"
                        type="date"
                        value={vacationInput}
                        min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                        onChange={(e) => setVacationInput(e.target.value)}
                        className="h-9 px-3 bg-white border border-black/[0.08] rounded-lg text-[17px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all"
                      />
                      <button
                        data-testid="button-enable-vacation"
                        disabled={!vacationInput}
                        onClick={() => {
                          setVacationUntil(vacationInput);
                          autoSave({ vacationUntil: vacationInput });
                          setVacationInput("");
                          toast({ title: "Vacation mode enabled", description: `Your recaps are paused until ${new Date(vacationInput + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })}.` });
                        }}
                        className="h-9 px-4 rounded-lg text-[15px] font-bold bg-primary text-white shadow-sm shadow-primary/20 hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                      >
                        <Palmtree className="w-3.5 h-3.5" />
                        Enable
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <AnimatePresence>
                {autoSaveStatus !== "idle" && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="flex items-center justify-center gap-1.5 text-base text-[#52525B] dark:text-[#A1A1AA] py-1"
                  >
                    {autoSaveStatus === "saving" ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving...</>
                    ) : (
                      <><Check className="w-3.5 h-3.5 text-[#6366F1]" /><span className="text-[#6366F1]">Saved</span></>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-6 pt-5 border-t border-border">
                <button
                  data-testid="button-delete-account"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-base text-[#52525B] dark:text-[#A1A1AA] hover:text-red-500 transition-colors"
                >
                  Delete account
                </button>
              </div>

              {showDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}>
                  <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()} data-testid="section-delete-confirm">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                      <h3 className="text-lg font-display font-bold text-red-600">Delete Account</h3>
                    </div>
                    <p className="text-base text-[#52525B] dark:text-[#A1A1AA] mt-2">
                      This will permanently delete your account, saved podcasts, recap history, and all email data. This action cannot be undone.
                    </p>
                    <div className="mt-4">
                      <label className="text-[15px] font-semibold text-red-700 mb-1.5 block">
                        Type <span className="font-mono bg-red-100 px-1.5 py-0.5 rounded">DELETE</span> to confirm
                      </label>
                      <input
                        data-testid="input-delete-confirm"
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="DELETE"
                        className="h-9 w-full px-3 bg-white border border-red-200 rounded-lg text-[17px] text-foreground focus:outline-none focus:ring-2 focus:ring-red-300 transition-all font-mono"
                        autoComplete="off"
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-4">
                      <button
                        data-testid="button-confirm-delete"
                        disabled={deleteConfirmText !== "DELETE" || deleteAccountMutation.isPending}
                        onClick={() => deleteAccountMutation.mutate()}
                        className="h-9 px-4 rounded-lg text-[15px] font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                      >
                        {deleteAccountMutation.isPending ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" />Deleting...</>
                        ) : (
                          <><Trash2 className="w-3.5 h-3.5" />Delete my account</>
                        )}
                      </button>
                      <button
                        data-testid="button-cancel-delete"
                        onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
                        className="h-9 px-3 rounded-lg text-[15px] font-semibold text-muted-foreground hover:bg-gray-100 transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
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
                    <p className="text-base font-bold text-foreground">Daily Recap</p>
                    <p className="text-[15px] text-muted-foreground">{formatRecapDate(viewingRecap.recapDate)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    data-testid="button-send-email"
                    onClick={() => sendEmail.mutate(viewingRecap.id)}
                    disabled={sendEmail.isPending}
                    className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-[15px] font-medium text-primary hover:bg-primary/10 transition-all disabled:opacity-50"
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
                    <span key={i} className="inline-flex items-center gap-1 bg-black/[0.04] text-foreground px-2.5 py-1 rounded-full text-[15px] font-medium">
                      <Podcast className="w-3 h-3 text-primary" />
                      {parsePodcastName(p)}
                    </span>
                  ))}
                </div>
                <div className="prose prose-sm max-w-none text-foreground break-words" style={{ overflowWrap: "anywhere" }} data-testid="text-recap-summary">
                  <ReactMarkdown
                    components={{
                      a: ({ href, children, ...props }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline" {...props}>{children}<ExternalLink className="w-3 h-3 text-muted-foreground/40 inline" /></a>
                      ),
                    }}
                  >{fixMarkdownLinks(viewingRecap.summary)}</ReactMarkdown>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="max-w-5xl mx-auto px-4 sm:px-6 py-6 mt-4">
        <p className="text-[15px] text-muted-foreground/50 text-center">© {new Date().getFullYear()} PodRise. All rights reserved.</p>
      </footer>
    </div>
  );
}
