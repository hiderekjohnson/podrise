import { useState, useEffect, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { Loader2, LogOut, Shield, Users, Mail, Calendar, Podcast, Search, Clock, UserCheck, Trash2, BarChart3, TrendingUp, Headphones, Crown, X, Palette, BrainCircuit, FileText, Inbox, Send, Eye, Rss, Key, Database } from "lucide-react";
import { motion } from "framer-motion";
const EmailTemplateEditor = lazy(() => import("./EmailTemplateEditor"));
const RecapPromptEditor = lazy(() => import("./RecapPromptEditor"));
const TranscriptLogs = lazy(() => import("./TranscriptLogs"));
const PendingEmails = lazy(() => import("./PendingEmails"));
const PodcastDirectory = lazy(() => import("./PodcastDirectory"));
const RssFeedsManager = lazy(() => import("./RssFeedsManager"));
const HostsManager = lazy(() => import("./HostsManager"));
const BackfillTracker = lazy(() => import("./BackfillTracker"));
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

interface AdminUser {
  id: number;
  email: string;
  podcasts: string[];
  deliveryTime: string;
  deliveryTimezone: string;
  createdAt: string | null;
}

interface AnalyticsData {
  totalUsers: number;
  totalRecaps: number;
  totalEmailsSent: number;
  proUsers: number;
  totalRuntimeMinutes: number;
  topPodcasts: { name: string; artworkUrl: string; count: number }[];
  userGrowth: { date: string; newUsers: number; totalUsers: number }[];
  emailActivity: { date: string; count: number }[];
  emailOpenStats: { totalSent: number; totalOpened: number; openRate: number };
  openRateTrend: { date: string; sent: number; opened: number; rate: number }[];
}

function parsePodcastName(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.name) return parsed.name;
  } catch {}
  return raw;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function BatchExpansionPanel() {
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<any>(null);
  const [polling, setPolling] = useState(false);

  const startExpansion = async () => {
    if (!confirm("This will expand all podcasts to 50 episodes each. This process fetches transcripts from Taddy and generates AI recaps — it may take a while. Continue?")) return;
    try {
      setIsRunning(true);
      const res = await fetch("/api/admin/batch-expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ target: 50 }),
      });
      if (res.status === 409) {
        toast({ title: "Already Running", description: "Batch expansion is already in progress." });
        setPolling(true);
        pollProgress();
        return;
      }
      if (!res.ok) throw new Error("Failed to start");
      toast({ title: "Batch Expansion Started", description: "Expanding all podcasts to 50 episodes. Check progress below." });
      setPolling(true);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to start", variant: "destructive" });
      setIsRunning(false);
    }
  };

  const pollProgress = async () => {
    try {
      const res = await fetch("/api/admin/batch-expand/progress", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setProgress(data);
        if (data.status === "running") {
          setPolling(true);
          setIsRunning(true);
        } else {
          setPolling(false);
          setIsRunning(false);
        }
      }
    } catch {}
  };

  useEffect(() => {
    pollProgress();
  }, []);

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(pollProgress, 3000);
    return () => clearInterval(interval);
  }, [polling]);

  return (
    <div className="glass-panel rounded-2xl p-5" data-testid="action-batch-expand">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Headphones className="w-4 h-4 text-primary" />
            Batch Episode Expansion
          </h3>
          <p className="text-xs text-muted-foreground mt-1">Expand all podcasts to 50 episodes each via Taddy transcripts + AI recaps.</p>
        </div>
        <button
          data-testid="button-batch-expand"
          onClick={startExpansion}
          disabled={isRunning}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors whitespace-nowrap disabled:opacity-50"
        >
          {isRunning ? "Running..." : "Start Expansion"}
        </button>
      </div>

      {progress && progress.status !== "idle" && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${progress.status === "running" ? "bg-emerald-500 animate-pulse" : progress.status === "completed" ? "bg-blue-500" : "bg-red-500"}`} />
            <span className="text-xs font-semibold text-foreground capitalize">{progress.status}</span>
            {progress.currentPodcast && <span className="text-xs text-muted-foreground">— {progress.currentPodcast}</span>}
          </div>

          {progress.podcastsTotal > 0 && (
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.round((progress.podcastsProcessed / progress.podcastsTotal) * 100)}%` }}
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-2">
              <p className="text-lg font-bold text-emerald-600">{progress.episodesCreated}</p>
              <p className="text-xs text-muted-foreground">Created</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900/30 rounded-xl p-2">
              <p className="text-lg font-bold text-muted-foreground">{progress.episodesSkipped}</p>
              <p className="text-xs text-muted-foreground">Skipped</p>
            </div>
            <div className="bg-red-50 dark:bg-red-950/30 rounded-xl p-2">
              <p className="text-lg font-bold text-red-500">{progress.episodesFailed}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Podcasts: {progress.podcastsProcessed}/{progress.podcastsTotal}
            {progress.startedAt && <> · Started {new Date(progress.startedAt).toLocaleTimeString()}</>}
            {progress.completedAt && <> · Finished {new Date(progress.completedAt).toLocaleTimeString()}</>}
          </p>

          {progress.errors.length > 0 && (
            <details className="text-xs">
              <summary className="text-red-500 cursor-pointer font-medium">
                {progress.errors.length} error(s)
              </summary>
              <div className="mt-1 max-h-32 overflow-y-auto space-y-1">
                {progress.errors.map((e: string, i: number) => (
                  <p key={i} className="text-red-400 text-xs break-all">{e}</p>
                ))}
              </div>
            </details>
          )}

          {!polling && progress.status !== "idle" && (
            <button
              onClick={() => { setPolling(true); pollProgress(); }}
              className="text-xs text-primary hover:underline"
            >
              Refresh Status
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface TaskProgress {
  status: "idle" | "running" | "completed" | "error";
  startedAt: string | null;
  completedAt: string | null;
  currentPodcast?: string;
  podcastsProcessed?: number;
  podcastsTotal?: number;
}

interface LandingRecapProgress extends TaskProgress {
  recapsCreated: number;
  recapsSkipped: number;
  errors: number;
}

interface BatchExpansionProgress extends TaskProgress {
  episodesCreated: number;
  episodesSkipped: number;
  episodesFailed: number;
  errors: string[];
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return "";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const sec = Math.floor((end - start) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return `${min}m ${remSec}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function estimateTimeRemaining(processed: number, total: number, startedAt: string | null): string {
  if (!startedAt || processed === 0 || total === 0) return "Calculating...";
  const elapsed = Date.now() - new Date(startedAt).getTime();
  const perItem = elapsed / processed;
  const remaining = perItem * (total - processed);
  const sec = Math.floor(remaining / 1000);
  if (sec < 60) return `~${sec}s remaining`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `~${min}m remaining`;
  const hr = Math.floor(min / 60);
  return `~${hr}h ${min % 60}m remaining`;
}

function TaskCard({
  title,
  description,
  status,
  startedAt,
  completedAt,
  currentItem,
  processed,
  total,
  stats,
  onTrigger,
  triggerLabel,
  triggerDisabled,
  errorList,
}: {
  title: string;
  description: string;
  status: "idle" | "running" | "completed" | "error";
  startedAt: string | null;
  completedAt: string | null;
  currentItem?: string;
  processed?: number;
  total?: number;
  stats: { label: string; value: number; color: string }[];
  onTrigger: () => void;
  triggerLabel: string;
  triggerDisabled: boolean;
  errorList?: string[];
}) {
  const pct = (processed && total && total > 0) ? Math.round((processed / total) * 100) : 0;
  const statusColor = status === "running" ? "bg-emerald-500" : status === "completed" ? "bg-blue-500" : status === "error" ? "bg-red-500" : "bg-gray-400";
  const statusLabel = status === "idle" ? "Idle" : status === "running" ? "Running" : status === "completed" ? "Completed" : "Error";

  return (
    <div className="glass-panel rounded-2xl p-5" data-testid={`task-card-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Headphones className="w-4 h-4 text-primary" />
            {title}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        <button
          onClick={onTrigger}
          disabled={triggerDisabled}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-colors whitespace-nowrap disabled:opacity-50"
          data-testid={`button-trigger-${title.toLowerCase().replace(/\s+/g, "-")}`}
        >
          {status === "running" ? "Running..." : triggerLabel}
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-block w-2 h-2 rounded-full ${statusColor} ${status === "running" ? "animate-pulse" : ""}`} />
        <span className="text-xs font-semibold text-foreground">{statusLabel}</span>
        {status === "running" && currentItem && (
          <span className="text-xs text-muted-foreground truncate max-w-[200px]">— {currentItem}</span>
        )}
      </div>

      {(status === "running" || status === "completed" || status === "error") && total && total > 0 && (
        <>
          <div className="w-full bg-muted rounded-full h-2.5 mb-2">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${status === "error" ? "bg-red-500" : "bg-primary"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
            <span>{processed}/{total} podcasts ({pct}%)</span>
            {status === "running" && processed !== undefined && (
              <span>{estimateTimeRemaining(processed, total, startedAt)}</span>
            )}
          </div>
        </>
      )}

      {stats.length > 0 && (status !== "idle") && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {stats.map((s) => (
            <div key={s.label} className={`${s.color} rounded-xl p-2 text-center`}>
              <p className="text-lg font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {(status !== "idle") && (
        <p className="text-xs text-muted-foreground">
          {startedAt && <>Started {new Date(startedAt).toLocaleString()}</>}
          {completedAt && <> · Finished {new Date(completedAt).toLocaleString()}</>}
          {status === "running" && startedAt && <> · Elapsed: {formatDuration(startedAt, null)}</>}
          {status === "completed" && startedAt && completedAt && <> · Took {formatDuration(startedAt, completedAt)}</>}
        </p>
      )}

      {errorList && errorList.length > 0 && (
        <details className="text-xs mt-2">
          <summary className="text-red-500 cursor-pointer font-medium">{errorList.length} error(s)</summary>
          <div className="mt-1 max-h-32 overflow-y-auto space-y-1">
            {errorList.map((e, i) => (
              <p key={i} className="text-red-400 text-xs break-all">{e}</p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function UpdatesPanel() {
  const { toast } = useToast();
  const [progress, setProgress] = useState<{
    landingRecaps: LandingRecapProgress;
    batchExpansion: BatchExpansionProgress;
  } | null>(null);

  const fetchProgress = async () => {
    try {
      const res = await fetch("/api/admin/updates/progress", { credentials: "include" });
      if (res.ok) {
        setProgress(await res.json());
      }
    } catch {}
  };

  useEffect(() => {
    fetchProgress();
  }, []);

  useEffect(() => {
    const hasRunning = progress?.landingRecaps?.status === "running" || progress?.batchExpansion?.status === "running";
    if (!hasRunning) {
      const slow = setInterval(fetchProgress, 10000);
      return () => clearInterval(slow);
    }
    const fast = setInterval(fetchProgress, 3000);
    return () => clearInterval(fast);
  }, [progress?.landingRecaps?.status, progress?.batchExpansion?.status]);

  const triggerLandingRecaps = async () => {
    if (!confirm("Start a landing page recap refresh? This fetches latest episodes for all podcasts and generates AI recaps.")) return;
    try {
      const res = await fetch("/api/admin/updates/trigger-landing-recaps", {
        method: "POST",
        credentials: "include",
      });
      if (res.status === 409) {
        toast({ title: "Already Running", description: "Landing recap refresh is already in progress." });
      } else if (res.ok) {
        toast({ title: "Started", description: "Landing recap refresh started." });
      } else {
        throw new Error("Failed");
      }
      fetchProgress();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to start", variant: "destructive" });
    }
  };

  const triggerBatchExpansion = async () => {
    if (!confirm("Start batch episode expansion? This will expand all podcasts to 50 episodes each via Taddy transcripts + AI recaps. May take a while.")) return;
    try {
      const res = await fetch("/api/admin/updates/trigger-batch-expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ target: 50 }),
      });
      if (res.status === 409) {
        toast({ title: "Already Running", description: "Batch expansion is already in progress." });
      } else if (res.ok) {
        toast({ title: "Started", description: "Batch expansion started." });
      } else {
        throw new Error("Failed");
      }
      fetchProgress();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to start", variant: "destructive" });
    }
  };

  const lr = progress?.landingRecaps;
  const be = progress?.batchExpansion;

  const anyRunning = lr?.status === "running" || be?.status === "running";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-lg font-bold text-foreground" data-testid="text-updates-title">Background Updates</h2>
          <p className="text-sm text-muted-foreground">Monitor and trigger data processing tasks.</p>
        </div>
        {anyRunning && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-emerald-600">Tasks Running</span>
          </div>
        )}
      </div>

      <TaskCard
        title="Landing Page Recaps"
        description="Fetch latest episodes for all podcasts and generate AI recaps (runs daily at startup)."
        status={lr?.status || "idle"}
        startedAt={lr?.startedAt || null}
        completedAt={lr?.completedAt || null}
        currentItem={lr?.currentPodcast}
        processed={lr?.podcastsProcessed}
        total={lr?.podcastsTotal}
        stats={[
          { label: "Created", value: lr?.recapsCreated || 0, color: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600" },
          { label: "Skipped", value: lr?.recapsSkipped || 0, color: "bg-gray-50 dark:bg-gray-900/30 text-muted-foreground" },
          { label: "Errors", value: lr?.errors || 0, color: "bg-red-50 dark:bg-red-950/30 text-red-500" },
        ]}
        onTrigger={triggerLandingRecaps}
        triggerLabel="Run Now"
        triggerDisabled={lr?.status === "running"}
      />

      <TaskCard
        title="Batch Episode Expansion"
        description="Expand all podcasts to 50 episodes each via Taddy transcripts + AI recaps."
        status={be?.status || "idle"}
        startedAt={be?.startedAt || null}
        completedAt={be?.completedAt || null}
        currentItem={be?.currentPodcast}
        processed={be?.podcastsProcessed}
        total={be?.podcastsTotal}
        stats={[
          { label: "Created", value: be?.episodesCreated || 0, color: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600" },
          { label: "Skipped", value: be?.episodesSkipped || 0, color: "bg-gray-50 dark:bg-gray-900/30 text-muted-foreground" },
          { label: "Failed", value: be?.episodesFailed || 0, color: "bg-red-50 dark:bg-red-950/30 text-red-500" },
        ]}
        onTrigger={triggerBatchExpansion}
        triggerLabel="Start Expansion"
        triggerDisabled={be?.status === "running"}
        errorList={be?.errors}
      />
    </div>
  );
}

export default function Admin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "analytics" | "template" | "prompt" | "transcripts" | "pending" | "directory" | "rss" | "hosts" | "updates" | "backfill">("pending");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: adminAuth, isLoading: authLoading } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/me"],
    retry: false,
  });

  const isAdmin = adminAuth?.isAdmin === true;

  const loginMutation = useMutation({
    mutationFn: (pw: string) => apiRequest("POST", "/api/admin/login", { password: pw }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/me"] });
      toast({ title: "Welcome", description: "Admin access granted." });
    },
    onError: () => {
      toast({ title: "Access denied", description: "Invalid admin password.", variant: "destructive" });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/logout"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/me"] });
      queryClient.removeQueries({ queryKey: ["/api/admin/users"] });
    },
  });

  const [showChangePw, setShowChangePw] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const changePwMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      apiRequest("POST", "/api/admin/change-password", data),
    onSuccess: () => {
      toast({ title: "Password updated", description: "Your admin password has been changed." });
      setShowChangePw(false);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message || "Could not change password.", variant: "destructive" });
    },
  });

  const { data: users, isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAdmin,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/admin/analytics"],
    enabled: isAdmin,
  });

  const impersonateMutation = useMutation({
    mutationFn: (userId: number) => apiRequest("POST", "/api/admin/impersonate", { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      navigate("/dashboard");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to impersonate user.", variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: number) => apiRequest("DELETE", `/api/admin/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setConfirmDeleteId(null);
      toast({ title: "User deleted", description: "The user account has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete user.", variant: "destructive" });
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) loginMutation.mutate(password);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
          <a href="/" className="flex items-center">
            <img src={logoPath} alt="PodCap" className="h-9 object-contain" />
          </a>
        </header>

        <main className="flex-1 flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-sm"
          >
            <div className="glass-panel rounded-2xl p-8 flex flex-col items-center gap-6">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Shield className="w-7 h-7 text-primary" />
              </div>
              <div className="text-center">
                <h1 className="text-xl font-display font-bold text-foreground mb-1">Admin Access</h1>
                <p className="text-sm text-muted-foreground">Enter the admin password to continue</p>
              </div>
              <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
                <input
                  data-testid="input-admin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Admin password"
                  autoFocus
                  className="w-full h-12 px-4 bg-black/[0.03] border border-black/[0.06] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium placeholder:text-muted-foreground/50"
                />
                <button
                  data-testid="button-admin-login"
                  type="submit"
                  disabled={loginMutation.isPending || !password.trim()}
                  className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-sm bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.99]"
                >
                  {loginMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Log In"
                  )}
                </button>
              </form>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  const filteredUsers = (users || []).filter((u) =>
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.podcasts.some((p) => parsePodcastName(p).toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <a href="/" className="flex items-center">
            <img src={logoPath} alt="PodCap" className="h-9 object-contain" />
          </a>
          <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-bold rounded-md uppercase tracking-wide">Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            data-testid="button-change-password"
            onClick={() => setShowChangePw(!showChangePw)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Key className="w-4 h-4" />
            Change Password
          </button>
          <button
            data-testid="button-admin-logout"
            onClick={() => logoutMutation.mutate()}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      </header>

      {showChangePw && (
        <div className="w-full max-w-md mx-auto px-4 mb-4">
          <div className="bg-white border border-black/[0.06] rounded-xl p-5 shadow-sm" data-testid="section-change-password">
            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" />
              Change Admin Password
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newPw !== confirmPw) {
                  toast({ title: "Mismatch", description: "New passwords don't match.", variant: "destructive" });
                  return;
                }
                changePwMutation.mutate({ currentPassword: currentPw, newPassword: newPw });
              }}
              className="space-y-3"
            >
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                placeholder="Current password"
                className="w-full h-10 px-3 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30"
                data-testid="input-current-password"
              />
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="New password (min 6 characters)"
                className="w-full h-10 px-3 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30"
                data-testid="input-new-password"
              />
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Confirm new password"
                className="w-full h-10 px-3 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30"
                data-testid="input-confirm-password"
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={!currentPw || !newPw || !confirmPw || newPw.length < 6 || changePwMutation.isPending}
                  className="h-9 px-4 rounded-lg font-bold text-sm bg-primary text-white hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  data-testid="button-submit-password"
                >
                  {changePwMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update Password"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowChangePw(false); setCurrentPw(""); setNewPw(""); setConfirmPw(""); }}
                  className="h-9 px-4 rounded-lg font-bold text-sm text-muted-foreground hover:text-foreground hover:bg-black/[0.04] transition-all"
                  data-testid="button-cancel-password"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-16">
        <section className="w-full max-w-5xl pt-8 pb-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2">
                <button
                  data-testid="tab-pending"
                  onClick={() => { setActiveTab("pending"); setSearchTerm(""); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    activeTab === "pending"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <Inbox className="w-4 h-4" />
                  Email Log
                </button>
                <button
                  data-testid="tab-users"
                  onClick={() => { setActiveTab("users"); setSearchTerm(""); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    activeTab === "users"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Users
                  <span className="ml-0.5 px-1.5 py-0.5 bg-black/[0.05] rounded-md text-xs font-semibold">
                    {users?.length ?? 0}
                  </span>
                </button>
                <button
                  data-testid="tab-analytics"
                  onClick={() => { setActiveTab("analytics"); setSearchTerm(""); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    activeTab === "analytics"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  Analytics
                </button>
                <button
                  data-testid="tab-template"
                  onClick={() => { setActiveTab("template"); setSearchTerm(""); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    activeTab === "template"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <Palette className="w-4 h-4" />
                  Template
                </button>
                <button
                  data-testid="tab-prompt"
                  onClick={() => { setActiveTab("prompt"); setSearchTerm(""); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    activeTab === "prompt"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <BrainCircuit className="w-4 h-4" />
                  AI Prompt
                </button>
                <button
                  data-testid="tab-transcripts"
                  onClick={() => { setActiveTab("transcripts"); setSearchTerm(""); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    activeTab === "transcripts"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Transcripts
                </button>
                <button
                  data-testid="tab-directory"
                  onClick={() => { setActiveTab("directory"); setSearchTerm(""); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    activeTab === "directory"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <Podcast className="w-4 h-4" />
                  Podcasts
                </button>
                <button
                  data-testid="tab-rss"
                  onClick={() => { setActiveTab("rss"); setSearchTerm(""); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    activeTab === "rss"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <Rss className="w-4 h-4" />
                  RSS Feeds
                </button>
                <button
                  data-testid="tab-hosts"
                  onClick={() => { setActiveTab("hosts"); setSearchTerm(""); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    activeTab === "hosts"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  Hosts
                </button>
                <button
                  data-testid="tab-updates"
                  onClick={() => { setActiveTab("updates"); setSearchTerm(""); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    activeTab === "updates"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <TrendingUp className="w-4 h-4" />
                  Updates
                </button>
                <button
                  data-testid="tab-backfill"
                  onClick={() => { setActiveTab("backfill"); setSearchTerm(""); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    activeTab === "backfill"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <Database className="w-4 h-4" />
                  Backfill
                </button>
              </div>
              {activeTab !== "analytics" && activeTab !== "template" && activeTab !== "prompt" && activeTab !== "transcripts" && activeTab !== "pending" && activeTab !== "directory" && activeTab !== "rss" && activeTab !== "hosts" && activeTab !== "updates" && activeTab !== "backfill" && (
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    data-testid="input-admin-search"
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={activeTab === "users" ? "Search users or podcasts..." : "Search by email or podcast..."}
                    className="w-full h-10 pl-10 pr-4 bg-black/[0.03] border border-black/[0.06] rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium placeholder:text-muted-foreground/50"
                  />
                </div>
              )}
            </div>

            {activeTab === "users" && (
              <>
                {usersLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="glass-panel rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full" data-testid="table-admin-users">
                        <thead>
                          <tr className="border-b border-black/[0.06] bg-black/[0.02]">
                            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">User</th>
                            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">Signed Up</th>
                            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">Podcasts</th>
                            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">Settings</th>
                            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/[0.04]">
                          {filteredUsers.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-5 py-12 text-center text-sm text-muted-foreground">
                                {searchTerm ? "No users match your search." : "No users yet."}
                              </td>
                            </tr>
                          ) : (
                            filteredUsers.map((user) => (
                              <tr key={user.id} className="hover:bg-black/[0.015] transition-colors" data-testid={`row-admin-user-${user.id}`}>
                                <td className="px-5 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                      <Mail className="w-4 h-4 text-primary" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold text-foreground" data-testid={`text-user-email-${user.id}`}>{user.email}</p>
                                      <p className="text-xs text-muted-foreground">ID: {user.id}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-5 py-4">
                                  <div className="flex items-center gap-1.5 text-sm text-foreground">
                                    <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                    <span data-testid={`text-user-signup-${user.id}`}>{formatDate(user.createdAt)}</span>
                                  </div>
                                </td>
                                <td className="px-5 py-4">
                                  <div className="flex flex-wrap gap-1.5" data-testid={`text-user-podcasts-${user.id}`}>
                                    {user.podcasts.length === 0 ? (
                                      <span className="text-xs text-muted-foreground italic">None</span>
                                    ) : (
                                      user.podcasts.map((p, i) => (
                                        <span
                                          key={i}
                                          className="inline-flex items-center gap-1 bg-secondary text-foreground px-2 py-0.5 rounded-full text-xs font-medium max-w-[180px] truncate"
                                        >
                                          <Podcast className="w-3 h-3 text-primary shrink-0" />
                                          {parsePodcastName(p)}
                                        </span>
                                      ))
                                    )}
                                  </div>
                                </td>
                                <td className="px-5 py-4">
                                  <div className="text-xs text-muted-foreground space-y-0.5">
                                    <p>{user.deliveryTime} · {user.deliveryTimezone?.replace("America/", "").replace("_", " ") || "ET"}</p>
                                  </div>
                                </td>
                                <td className="px-5 py-4">
                                  <div className="flex items-center gap-2">
                                    <button
                                      data-testid={`button-impersonate-${user.id}`}
                                      onClick={() => impersonateMutation.mutate(user.id)}
                                      disabled={impersonateMutation.isPending}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-primary border border-primary/20 hover:bg-primary/5 transition-colors disabled:opacity-50"
                                    >
                                      <UserCheck className="w-3.5 h-3.5" />
                                      Impersonate
                                    </button>
                                    {confirmDeleteId === user.id ? (
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          data-testid={`button-confirm-delete-${user.id}`}
                                          onClick={() => deleteUserMutation.mutate(user.id)}
                                          disabled={deleteUserMutation.isPending}
                                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
                                        >
                                          {deleteUserMutation.isPending ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                          ) : (
                                            "Confirm"
                                          )}
                                        </button>
                                        <button
                                          data-testid={`button-cancel-delete-${user.id}`}
                                          onClick={() => setConfirmDeleteId(null)}
                                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground border border-black/10 hover:bg-black/[0.03] transition-colors"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        data-testid={`button-delete-${user.id}`}
                                        onClick={() => setConfirmDeleteId(user.id)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Delete
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === "analytics" && (
              <>
                {analyticsLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : analytics ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                      <div className="glass-panel rounded-2xl p-5" data-testid="stat-total-users">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Users className="w-4.5 h-4.5 text-primary" />
                          </div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Users</span>
                        </div>
                        <p className="text-3xl font-bold text-foreground">{analytics.totalUsers}</p>
                      </div>
                      <div className="glass-panel rounded-2xl p-5" data-testid="stat-pro-users">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
                            <Crown className="w-4.5 h-4.5 text-amber-500" />
                          </div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pro</span>
                        </div>
                        <p className="text-3xl font-bold text-foreground">{analytics.proUsers}</p>
                      </div>
                      <div className="glass-panel rounded-2xl p-5" data-testid="stat-total-recaps">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center">
                            <TrendingUp className="w-4.5 h-4.5 text-green-500" />
                          </div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recaps</span>
                        </div>
                        <p className="text-3xl font-bold text-foreground">{analytics.totalRecaps}</p>
                      </div>
                      <div className="glass-panel rounded-2xl p-5" data-testid="stat-emails-sent">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <Mail className="w-4.5 h-4.5 text-blue-500" />
                          </div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Emails</span>
                        </div>
                        <p className="text-3xl font-bold text-foreground">{analytics.totalEmailsSent}</p>
                      </div>
                      <div className="glass-panel rounded-2xl p-5" data-testid="stat-total-runtime">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
                            <Headphones className="w-4.5 h-4.5 text-purple-500" />
                          </div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Runtime</span>
                        </div>
                        <p className="text-3xl font-bold text-foreground">
                          {analytics.totalRuntimeMinutes >= 60
                            ? `${Math.floor(analytics.totalRuntimeMinutes / 60)}h ${analytics.totalRuntimeMinutes % 60}m`
                            : `${analytics.totalRuntimeMinutes}m`}
                        </p>
                      </div>
                    </div>

                    <div className="glass-panel rounded-2xl p-5 flex items-center justify-between" data-testid="action-landing-recaps">
                      <div>
                        <h3 className="text-sm font-bold text-foreground">Landing Page Example Recaps</h3>
                        <p className="text-xs text-muted-foreground mt-1">Generate AI recaps for all ~50 podcast landing pages using their latest episodes.</p>
                      </div>
                      <button
                        data-testid="button-generate-landing-recaps"
                        onClick={async () => {
                          if (!confirm("This will generate example recaps for all 50 landing pages. It may take several minutes. Continue?")) return;
                          try {
                            const res = await apiRequest("POST", "/api/admin/generate-landing-recaps");
                            const reader = res.body?.getReader();
                            if (reader) {
                              const decoder = new TextDecoder();
                              let successCount = 0;
                              while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                const lines = decoder.decode(value).split("\n").filter(Boolean);
                                for (const line of lines) {
                                  try {
                                    const data = JSON.parse(line);
                                    if (data.status === "success") successCount++;
                                    if (data.done) {
                                      toast({ title: "Landing Recaps Generated", description: `${data.success}/${data.total} recaps created successfully.` });
                                    }
                                  } catch {}
                                }
                              }
                            }
                          } catch (err: any) {
                            toast({ title: "Error", description: err?.message || "Failed to generate landing recaps", variant: "destructive" });
                          }
                        }}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors whitespace-nowrap"
                      >
                        Generate All
                      </button>
                    </div>

                    <div className="glass-panel rounded-2xl p-5 flex items-center justify-between" data-testid="action-enrich-metadata">
                      <div>
                        <h3 className="text-sm font-bold text-foreground">Enrich Podcast Metadata</h3>
                        <p className="text-xs text-muted-foreground mt-1">Auto-generate About, Known For, Host Bios, and other metadata for podcasts missing it.</p>
                      </div>
                      <button
                        data-testid="button-enrich-metadata"
                        onClick={async () => {
                          if (!confirm("This will use AI to generate about info, host bios, and known-for for all podcasts missing this metadata. Continue?")) return;
                          try {
                            await apiRequest("POST", "/api/admin/enrich-podcast-metadata");
                            toast({ title: "Enrichment Started", description: "Podcast metadata enrichment is running in the background." });
                          } catch (err: any) {
                            toast({ title: "Error", description: err?.message || "Failed to start enrichment", variant: "destructive" });
                          }
                        }}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors whitespace-nowrap"
                      >
                        Enrich All
                      </button>
                    </div>

                    <div className="glass-panel rounded-2xl p-5 flex items-center justify-between" data-testid="action-backfill-topics">
                      <div>
                        <h3 className="text-sm font-bold text-foreground">Backfill Key Topics & Questions</h3>
                        <p className="text-xs text-muted-foreground mt-1">Generate key topics and top questions for all recaps that don't have them yet.</p>
                      </div>
                      <button
                        data-testid="button-backfill-topics"
                        onClick={async () => {
                          if (!confirm("This will backfill key topics and top questions for all existing recaps. This may take a while. Continue?")) return;
                          try {
                            await apiRequest("POST", "/api/admin/backfill-topics-questions");
                            toast({ title: "Backfill Started", description: "Key topics and questions backfill is running in the background." });
                          } catch (err: any) {
                            toast({ title: "Error", description: err?.message || "Failed to start backfill", variant: "destructive" });
                          }
                        }}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-violet-500 text-white hover:bg-violet-600 transition-colors whitespace-nowrap"
                      >
                        Start Backfill
                      </button>
                    </div>

                    <div className="glass-panel rounded-2xl p-5 flex items-center justify-between" data-testid="action-backfill-show-notes">
                      <div>
                        <h3 className="text-sm font-bold text-foreground">Backfill Show Notes</h3>
                        <p className="text-xs text-muted-foreground mt-1">Fetch and store show notes from Taddy for all episodes that don't have them yet.</p>
                      </div>
                      <button
                        data-testid="button-backfill-show-notes"
                        onClick={async () => {
                          if (!confirm("This will fetch show notes from Taddy for all existing recaps. This may take a while due to API rate limits. Continue?")) return;
                          try {
                            await apiRequest("POST", "/api/admin/backfill-show-notes");
                            toast({ title: "Backfill Started", description: "Show notes backfill is running in the background. Check server logs for progress." });
                          } catch (err: any) {
                            toast({ title: "Error", description: err?.message || "Failed to start backfill", variant: "destructive" });
                          }
                        }}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors whitespace-nowrap"
                      >
                        Start Backfill
                      </button>
                    </div>

                    <div className="glass-panel rounded-2xl p-5 flex items-center justify-between" data-testid="action-clear-sponsors-cache">
                      <div>
                        <h3 className="text-sm font-bold text-foreground">Clear Sponsors Cache</h3>
                        <p className="text-xs text-muted-foreground mt-1">Clear cached sponsor data so it re-extracts using show notes + transcript on next visit.</p>
                      </div>
                      <button
                        data-testid="button-clear-sponsors-cache"
                        onClick={async () => {
                          if (!confirm("This will clear all cached sponsor data. Sponsors will be re-extracted (with show notes) the next time someone visits an episode. Continue?")) return;
                          try {
                            await apiRequest("POST", "/api/admin/clear-sponsors-cache");
                            toast({ title: "Cache Cleared", description: "Sponsors will be re-extracted with show notes on next visit." });
                          } catch (err: any) {
                            toast({ title: "Error", description: err?.message || "Failed to clear cache", variant: "destructive" });
                          }
                        }}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors whitespace-nowrap"
                      >
                        Clear Cache
                      </button>
                    </div>

                    <BatchExpansionPanel />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="glass-panel rounded-2xl p-6" data-testid="chart-top-podcasts">
                        <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                          <Podcast className="w-4 h-4 text-primary" />
                          Top Podcasts by Users
                        </h3>
                        {analytics.topPodcasts.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">No data yet</p>
                        ) : (
                          <div className="space-y-3">
                            {analytics.topPodcasts.map((podcast, i) => {
                              const maxCount = analytics.topPodcasts[0]?.count || 1;
                              return (
                                <div key={i} className="flex items-center gap-3" data-testid={`podcast-rank-${i}`}>
                                  <span className="text-xs font-bold text-muted-foreground w-5 text-right">{i + 1}</span>
                                  {podcast.artworkUrl ? (
                                    <img
                                      src={podcast.artworkUrl}
                                      alt=""
                                      className="w-8 h-8 rounded-lg object-cover shrink-0"
                                    />
                                  ) : (
                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                      <Podcast className="w-4 h-4 text-primary" />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-foreground truncate">{podcast.name}</p>
                                    <div className="mt-1 h-1.5 bg-black/[0.04] rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-primary/60 rounded-full transition-all"
                                        style={{ width: `${(podcast.count / maxCount) * 100}%` }}
                                      />
                                    </div>
                                  </div>
                                  <span className="text-sm font-bold text-foreground shrink-0 tabular-nums">
                                    {podcast.count} {podcast.count === 1 ? "user" : "users"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="glass-panel rounded-2xl p-6" data-testid="chart-user-growth">
                        <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-green-500" />
                          User Growth
                        </h3>
                        {analytics.userGrowth.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">No data yet</p>
                        ) : (
                          <div className="space-y-1">
                            {(() => {
                              const maxTotal = Math.max(...analytics.userGrowth.map(d => d.totalUsers), 1);
                              return analytics.userGrowth.map((point, i) => (
                                <div key={i} className="flex items-center gap-3 py-1.5" data-testid={`growth-row-${i}`}>
                                  <span className="text-xs font-medium text-muted-foreground w-20 shrink-0">
                                    {new Date(point.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  </span>
                                  <div className="flex-1 h-2 bg-black/[0.04] rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-green-500/60 rounded-full transition-all"
                                      style={{ width: `${(point.totalUsers / maxTotal) * 100}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-bold text-foreground w-16 text-right tabular-nums">
                                    {point.totalUsers} total
                                  </span>
                                  {point.newUsers > 0 && (
                                    <span className="text-xs font-semibold text-green-600 w-12 text-right">
                                      +{point.newUsers}
                                    </span>
                                  )}
                                </div>
                              ));
                            })()}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="glass-panel rounded-2xl p-5" data-testid="stat-emails-tracked">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <Send className="w-4.5 h-4.5 text-blue-500" />
                          </div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sent</span>
                        </div>
                        <p className="text-3xl font-bold text-foreground">{analytics.emailOpenStats?.totalSent ?? 0}</p>
                      </div>
                      <div className="glass-panel rounded-2xl p-5" data-testid="stat-emails-opened">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center">
                            <Eye className="w-4.5 h-4.5 text-green-500" />
                          </div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Opened</span>
                        </div>
                        <p className="text-3xl font-bold text-foreground">{analytics.emailOpenStats?.totalOpened ?? 0}</p>
                      </div>
                      <div className="glass-panel rounded-2xl p-5" data-testid="stat-open-rate">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                            <TrendingUp className="w-4.5 h-4.5 text-emerald-500" />
                          </div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Open Rate</span>
                        </div>
                        <p className="text-3xl font-bold text-foreground">{analytics.emailOpenStats?.openRate ?? 0}%</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="glass-panel rounded-2xl p-6" data-testid="chart-email-activity">
                        <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                          <Mail className="w-4 h-4 text-blue-500" />
                          Email Activity
                        </h3>
                        {analytics.emailActivity.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">No emails sent yet</p>
                        ) : (
                          <div className="space-y-1">
                            {(() => {
                              const maxEmails = Math.max(...analytics.emailActivity.map(d => d.count), 1);
                              const recent = analytics.emailActivity.slice(-14);
                              return recent.map((point, i) => (
                                <div key={i} className="flex items-center gap-3 py-1.5" data-testid={`email-day-${i}`}>
                                  <span className="text-xs font-medium text-muted-foreground w-20 shrink-0">
                                    {new Date(point.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  </span>
                                  <div className="flex-1 h-2 bg-black/[0.04] rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-blue-500/60 rounded-full transition-all"
                                      style={{ width: `${(point.count / maxEmails) * 100}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-bold text-foreground w-16 text-right tabular-nums">
                                    {point.count} sent
                                  </span>
                                </div>
                              ));
                            })()}
                          </div>
                        )}
                      </div>

                      <div className="glass-panel rounded-2xl p-6" data-testid="chart-open-rate-trend">
                        <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                          <Eye className="w-4 h-4 text-green-500" />
                          Open Rate Trend
                        </h3>
                        {!analytics.openRateTrend || analytics.openRateTrend.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">No tracking data yet</p>
                        ) : (
                          <div className="space-y-1">
                            {(() => {
                              const recent = analytics.openRateTrend.slice(-14);
                              return recent.map((point, i) => (
                                <div key={i} className="flex items-center gap-3 py-1.5" data-testid={`open-rate-day-${i}`}>
                                  <span className="text-xs font-medium text-muted-foreground w-20 shrink-0">
                                    {new Date(point.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  </span>
                                  <div className="flex-1 h-2 bg-black/[0.04] rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${point.rate >= 50 ? "bg-green-500/60" : point.rate >= 25 ? "bg-amber-500/60" : "bg-red-500/40"}`}
                                      style={{ width: `${point.rate}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-bold text-foreground w-20 text-right tabular-nums">
                                    {point.rate}% ({point.opened}/{point.sent})
                                  </span>
                                </div>
                              ));
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            )}

            {activeTab === "template" && (
              <Suspense fallback={
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              }>
                <EmailTemplateEditor />
              </Suspense>
            )}

            {activeTab === "prompt" && (
              <Suspense fallback={
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              }>
                <RecapPromptEditor />
              </Suspense>
            )}

            {activeTab === "transcripts" && (
              <Suspense fallback={
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              }>
                <TranscriptLogs />
              </Suspense>
            )}

            {activeTab === "pending" && (
              <Suspense fallback={
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              }>
                <PendingEmails />
              </Suspense>
            )}

            {activeTab === "directory" && (
              <Suspense fallback={
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              }>
                <PodcastDirectory />
              </Suspense>
            )}

            {activeTab === "rss" && (
              <Suspense fallback={
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              }>
                <RssFeedsManager />
              </Suspense>
            )}

            {activeTab === "hosts" && (
              <Suspense fallback={
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              }>
                <HostsManager />
              </Suspense>
            )}
            {activeTab === "updates" && (
              <UpdatesPanel />
            )}
            {activeTab === "backfill" && (
              <Suspense fallback={
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              }>
                <BackfillTracker />
              </Suspense>
            )}
          </motion.div>
        </section>
      </main>

    </div>
  );
}
