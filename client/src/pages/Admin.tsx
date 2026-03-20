import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { Loader2, LogOut, Shield, Users, Mail, Calendar, Podcast, Search, UserCheck, Trash2, BarChart3, TrendingUp, Headphones, FileText, Inbox, Rss, Key, Database, Settings, ShoppingBag, MousePointerClick, DollarSign, Megaphone, Wrench, List, AlertTriangle, Gift, BookOpen, ToggleLeft, Plus, X, ArrowUpDown } from "lucide-react";
import { motion } from "framer-motion";
const PendingEmails = lazy(() => import("./PendingEmails"));
const RssFeedsManager = lazy(() => import("./RssFeedsManager"));
const HostsManager = lazy(() => import("./HostsManager"));
const BackfillTracker = lazy(() => import("./BackfillTracker"));
const EpisodePagesTracker = lazy(() => import("./EpisodePagesTracker"));
const AnalyticsAcquisition = lazy(() => import("./AnalyticsAcquisition"));
const AdminShopManagement = lazy(() => import("./AdminShopManagement"));
const AnalyticsAffiliates = lazy(() => import("./AnalyticsAffiliates"));
const AnalyticsGrowth = lazy(() => import("./AnalyticsGrowth"));
const AnalyticsEmail = lazy(() => import("./AnalyticsEmail"));
const ApiUsageDashboard = lazy(() => import("./ApiUsageDashboard"));
const AdvertisersAdmin = lazy(() => import("./AdvertisersAdmin"));
const AdminUsersManager = lazy(() => import("./AdminUsersManager"));
const AdminCategoriesManager = lazy(() => import("./AdminCategoriesManager"));
const AdminErrorLogs = lazy(() => import("./AdminErrorLogs"));
const AdminReferrals = lazy(() => import("./AdminReferrals"));
const AdminSupportKB = lazy(() => import("./AdminSupportKB"));
const AdminCMS = lazy(() => import("./AdminCMS"));
const AdminLandingPages = lazy(() => import("./AdminLandingPages"));
const AdminFeatureFlags = lazy(() => import("./AdminFeatureFlags"));
const AdminMTurk = lazy(() => import("./AdminMTurk"));
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PodRiseWordmark } from "@/components/PodRiseHeader";

interface AdminUser {
  id: number;
  email: string;
  podcasts: string[];
  deliveryTime: string;
  deliveryTimezone: string;
  createdAt: string | null;
  lastLoginAt: string | null;
  emailVerified?: boolean;
  onboardingCompleted?: boolean;
  signupSource?: string | null;
}

type UserStatusFilter = "all" | "active" | "pending-verification" | "pending-onboarding";

function getUserStatus(user: AdminUser): { label: string; color: string } {
  if (!user.emailVerified) {
    return { label: "Pending Verification", color: "bg-yellow-100 text-yellow-700" };
  }
  if (!user.onboardingCompleted) {
    return { label: "Pending Onboarding", color: "bg-blue-100 text-blue-700" };
  }
  return { label: "Active", color: "bg-green-100 text-green-700" };
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

function TabloidHeadlineBackfillPanel() {
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<any>(null);
  const [polling, setPolling] = useState(false);

  const startBackfill = async () => {
    if (!confirm("This will generate tabloid headlines for all episodes missing them. It runs in the background using AI. Continue?")) return;
    try {
      setIsRunning(true);
      const res = await fetch("/api/admin/backfill-tabloid-headlines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (res.status === 409) {
        toast({ title: "Already Running", description: "Tabloid headline backfill is already in progress." });
        setPolling(true);
        pollProgress();
        return;
      }
      if (!res.ok) throw new Error("Failed to start");
      toast({ title: "Backfill Started", description: "Generating tabloid headlines for all episodes. Check progress below." });
      setPolling(true);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to start", variant: "destructive" });
      setIsRunning(false);
    }
  };

  const pollProgress = async () => {
    try {
      const res = await fetch("/api/admin/tabloid-backfill-progress", { credentials: "include" });
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
    <div className="glass-panel rounded-2xl p-5" data-testid="action-backfill-tabloid-headlines">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Backfill Tabloid Headlines
          </h3>
          <p className="text-xs text-muted-foreground mt-1">Generate tabloid-style headlines and sub-headlines for all episodes missing them.</p>
        </div>
        <button
          data-testid="button-backfill-tabloid-headlines"
          onClick={startBackfill}
          disabled={isRunning}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-500 text-white hover:bg-indigo-600 transition-colors whitespace-nowrap disabled:opacity-50"
        >
          {isRunning ? "Running..." : "Start Backfill"}
        </button>
      </div>

      {progress && progress.status !== "idle" && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${progress.status === "running" ? "bg-indigo-500 animate-pulse" : progress.status === "completed" ? "bg-blue-500" : "bg-red-500"}`} />
            <span className="text-xs font-semibold text-foreground capitalize">{progress.status}</span>
          </div>

          {progress.total > 0 && (
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.round((progress.processed / progress.total) * 100)}%` }}
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-xl p-2">
              <p className="text-lg font-bold text-indigo-600" data-testid="text-tabloid-generated">{progress.generated}</p>
              <p className="text-xs text-muted-foreground">Generated</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900/30 rounded-xl p-2">
              <p className="text-lg font-bold text-muted-foreground" data-testid="text-tabloid-processed">{progress.processed}/{progress.total}</p>
              <p className="text-xs text-muted-foreground">Processed</p>
            </div>
            <div className="bg-red-50 dark:bg-red-950/30 rounded-xl p-2">
              <p className="text-lg font-bold text-red-500" data-testid="text-tabloid-errors">{progress.errors}</p>
              <p className="text-xs text-muted-foreground">Errors</p>
            </div>
          </div>

          {!polling && progress.status !== "idle" && (
            <button
              onClick={() => { setPolling(true); pollProgress(); }}
              className="text-xs text-primary hover:underline"
              data-testid="button-refresh-tabloid-status"
            >
              Refresh Status
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BatchExpansionPanel() {
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<any>(null);
  const [polling, setPolling] = useState(false);

  const startExpansion = async () => {
    if (!confirm("This will expand all podcasts to 50 episodes each. This process fetches transcripts from Taddy and generates AI recaps - it may take a while. Continue?")) return;
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
            {progress.currentPodcast && <span className="text-xs text-muted-foreground">- {progress.currentPodcast}</span>}
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

function useAdminPath() {
  const [location, wouterNavigate] = useLocation();
  const browserPath = typeof window !== 'undefined' ? window.location.pathname : location;
  const fullPath = browserPath.startsWith("/admin") ? browserPath : `/admin${location}`;
  const adminNavigate = useCallback((targetFullPath: string) => {
    const isNested = !location.startsWith("/admin");
    if (isNested) {
      const relative = targetFullPath.startsWith("/admin") ? targetFullPath.slice(6) || "/" : targetFullPath;
      wouterNavigate(relative);
    } else {
      wouterNavigate(targetFullPath);
    }
  }, [location, wouterNavigate]);
  return { path: fullPath, navigate: adminNavigate };
}

export default function Admin() {
  const { path: adminPath, navigate: adminNavigate } = useAdminPath();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  type TabType = "users" | "analytics" | "pending" | "directory" | "shop" | "advertisers" | "admin-users" | "categories" | "advanced" | "errors" | "referrals" | "support-kb" | "cms" | "landing-pages" | "mturk";
  type AnalyticsSubTabType = "acquisition" | "affiliates" | "growth" | "email";
  type AdvancedSubTabType = "backfill" | "rss" | "hosts" | "api-costs" | "feature-flags";
  type BackfillSubTabType = "transcripts" | "pages" | "tools";

  const allTabs: TabType[] = ["users", "analytics", "pending", "directory", "shop", "advertisers", "admin-users", "categories", "advanced", "errors", "referrals", "support-kb", "cms", "landing-pages", "mturk"];
  const analyticsSubTabs: AnalyticsSubTabType[] = ["acquisition", "affiliates", "growth", "email"];
  const advancedSubTabs: AdvancedSubTabType[] = ["backfill", "rss", "hosts", "api-costs", "feature-flags"];
  const backfillSubTabs: BackfillSubTabType[] = ["transcripts", "pages", "tools"];

  const deriveTabFromPath = useCallback((path: string): { tab: TabType; analyticsSub: AnalyticsSubTabType; advancedSub: AdvancedSubTabType; backfillSub: BackfillSubTabType } => {
    const result = { tab: "advanced" as TabType, analyticsSub: "acquisition" as AnalyticsSubTabType, advancedSub: "backfill" as AdvancedSubTabType, backfillSub: "transcripts" as BackfillSubTabType };
    const segments = path.replace(/^\/admin\/?/, "").split("/").filter(Boolean);
    if (segments.length === 0) { return result; }
    const firstSeg = segments[0] as TabType;
    if (firstSeg === "cms") {
      result.tab = "cms";
      return result;
    }
    if (allTabs.includes(firstSeg)) {
      result.tab = firstSeg;
    }
    if (firstSeg === "analytics" && segments[1] && analyticsSubTabs.includes(segments[1] as AnalyticsSubTabType)) {
      result.analyticsSub = segments[1] as AnalyticsSubTabType;
    }
    if (firstSeg === "advanced" && segments[1] && advancedSubTabs.includes(segments[1] as AdvancedSubTabType)) {
      result.advancedSub = segments[1] as AdvancedSubTabType;
      if (segments[1] === "backfill" && segments[2] && backfillSubTabs.includes(segments[2] as BackfillSubTabType)) {
        result.backfillSub = segments[2] as BackfillSubTabType;
      }
    }
    return result;
  }, []);

  const initialState = deriveTabFromPath(adminPath);
  const [activeTab, setActiveTab] = useState<TabType>(initialState.tab);
  const [analyticsSubTab, setAnalyticsSubTab] = useState<AnalyticsSubTabType>(initialState.analyticsSub);
  const [advancedSubTab, setAdvancedSubTab] = useState<AdvancedSubTabType>(initialState.advancedSub);
  const [backfillSubTab, setBackfillSubTab] = useState<BackfillSubTabType>(initialState.backfillSub);

  useEffect(() => {
    const derived = deriveTabFromPath(adminPath);
    setActiveTab(derived.tab);
    setAnalyticsSubTab(derived.analyticsSub);
    setAdvancedSubTab(derived.advancedSub);
    setBackfillSubTab(derived.backfillSub);
  }, [adminPath, deriveTabFromPath]);

  const switchTab = useCallback((tab: TabType) => {
    setActiveTab(tab);
    setSearchTerm("");
    if (tab === "analytics") {
      adminNavigate(`/admin/analytics/acquisition`);
    } else if (tab === "advanced") {
      adminNavigate(`/admin/advanced/backfill/transcripts`);
    } else {
      adminNavigate(`/admin/${tab}`);
    }
  }, [adminNavigate]);

  const switchAnalyticsSubTab = useCallback((sub: AnalyticsSubTabType) => {
    setAnalyticsSubTab(sub);
    adminNavigate(`/admin/analytics/${sub}`);
  }, [adminNavigate]);

  const switchAdvancedSubTab = useCallback((sub: AdvancedSubTabType) => {
    setAdvancedSubTab(sub);
    if (sub === "backfill") {
      adminNavigate(`/admin/advanced/backfill/${backfillSubTab}`);
    } else {
      adminNavigate(`/admin/advanced/${sub}`);
    }
  }, [adminNavigate, backfillSubTab]);

  const switchBackfillSubTab = useCallback((sub: BackfillSubTabType) => {
    setBackfillSubTab(sub);
    adminNavigate(`/admin/advanced/backfill/${sub}`);
  }, [adminNavigate]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: adminAuth, isLoading: authLoading } = useQuery<{ isAdmin: boolean } | null>({
    queryKey: ["/api/admin/me"],
    retry: false,
    queryFn: async () => {
      const res = await fetch("/api/admin/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to check admin auth");
      return res.json();
    },
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

  const [userSortBy, setUserSortBy] = useState<"signedUp" | "lastLogin">("signedUp");
  const [userStatusFilter, setUserStatusFilter] = useState<UserStatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("");

  const { data: usersData, isLoading: usersLoading } = useQuery<{ users: AdminUser[]; totalCount: number }>({
    queryKey: ["/api/admin/users", userSortBy, sourceFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (userSortBy === "lastLogin") params.set("sortBy", "lastLogin");
      if (sourceFilter) params.set("source", sourceFilter);
      const qs = params.toString();
      const res = await fetch(`/api/admin/users${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    enabled: isAdmin,
  });

  const users = usersData?.users;
  const totalUserCount = usersData?.totalCount ?? 0;

  const { data: signupSources } = useQuery<string[]>({
    queryKey: ["/api/admin/users/sources"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users/sources", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sources");
      return res.json();
    },
    enabled: isAdmin,
  });

  const { data: impersonationStatus } = useQuery<{ impersonating: boolean; userId?: number }>({
    queryKey: ["/api/auth/impersonation-status"],
    enabled: isAdmin,
  });

  const stopImpersonatingMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/stop-impersonating"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/impersonation-status"] });
      toast({ title: "Impersonation ended", description: "You are now viewing as yourself." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to stop impersonating.", variant: "destructive" });
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: (userId: number) => apiRequest("POST", "/api/admin/impersonate", { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/impersonation-status"] });
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
        <header className="w-full px-6 lg:px-10 xl:px-16 py-5 flex items-center justify-between">
          <a href="/" className="flex items-center">
            <PodRiseWordmark />
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

  const filteredUsers = (users || []).filter((u) => {
    const matchesSearch = u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.podcasts.some((p) => parsePodcastName(p).toLowerCase().includes(searchTerm.toLowerCase()));
    if (!matchesSearch) return false;
    if (userStatusFilter === "all") return true;
    const status = getUserStatus(u);
    if (userStatusFilter === "active") return status.label === "Active";
    if (userStatusFilter === "pending-verification") return status.label === "Pending Verification";
    if (userStatusFilter === "pending-onboarding") return status.label === "Pending Onboarding";
    return true;
  });

  const isDev = import.meta.env.DEV;

  return (
    <div className="min-h-screen flex flex-col">
      {isDev && (
        <div className="w-full bg-amber-500/15 border-b border-amber-500/30 px-6 lg:px-10 xl:px-16 py-3" data-testid="banner-dev-warning">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <p className="text-sm font-medium text-amber-400">
              <span className="font-bold">Dev Environment</span> — Changes made here won't appear on the live site. Approve/reject products and manage data on the <a href="https://podrise.com/admin" target="_blank" rel="noopener noreferrer" className="underline font-bold hover:text-amber-300">production admin</a> instead.
            </p>
          </div>
        </div>
      )}
      {impersonationStatus?.impersonating && (
        <div className="w-full bg-amber-500 text-white px-6 lg:px-10 xl:px-16 py-2.5 flex items-center justify-center gap-3" data-testid="banner-admin-impersonating">
          <Shield className="w-4 h-4" />
          <span className="text-sm font-semibold">You are currently impersonating user ID {impersonationStatus.userId}</span>
          <button
            data-testid="button-admin-stop-impersonating"
            onClick={() => stopImpersonatingMutation.mutate()}
            disabled={stopImpersonatingMutation.isPending}
            className="ml-2 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-md text-sm font-bold transition-colors"
          >
            {stopImpersonatingMutation.isPending ? "Stopping..." : "Stop Impersonating"}
          </button>
        </div>
      )}
      <header className="w-full px-6 lg:px-10 xl:px-16 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/" className="flex items-center">
            <PodRiseWordmark />
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

      <main className="flex-1 flex flex-col px-6 lg:px-10 xl:px-16 pb-16">
        <section className="w-full pt-8 pb-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex items-center gap-2 overflow-x-auto pb-2 -mb-2 scrollbar-thin scrollbar-thumb-muted/30 scrollbar-track-transparent max-w-full">
                <button
                  data-testid="tab-cms"
                  onClick={() => { setActiveTab("cms"); setSearchTerm(""); adminNavigate("/admin/cms/podcasts"); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap ${
                    activeTab === "cms"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  CMS
                </button>
                <button
                  data-testid="tab-pending"
                  onClick={() => switchTab("pending")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap ${
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
                  onClick={() => switchTab("users")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap ${
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
                  onClick={() => switchTab("analytics")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap ${
                    activeTab === "analytics"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  Analytics
                </button>
                <button
                  data-testid="tab-shop"
                  onClick={() => switchTab("shop")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap ${
                    activeTab === "shop"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <ShoppingBag className="w-4 h-4" />
                  Shop
                </button>
                <button
                  data-testid="tab-categories"
                  onClick={() => switchTab("categories")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap ${
                    activeTab === "categories"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <List className="w-4 h-4" />
                  Categories
                </button>
                <button
                  data-testid="tab-advertisers"
                  onClick={() => switchTab("advertisers")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap ${
                    activeTab === "advertisers"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <Megaphone className="w-4 h-4" />
                  Advertisers
                </button>
                <button
                  data-testid="tab-admin-users"
                  onClick={() => switchTab("admin-users")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap ${
                    activeTab === "admin-users"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  Admins
                </button>
                <button
                  data-testid="tab-referrals"
                  onClick={() => switchTab("referrals")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap ${
                    activeTab === "referrals"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <Gift className="w-4 h-4" />
                  Referrals
                </button>
                <button
                  data-testid="tab-errors"
                  onClick={() => switchTab("errors")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap ${
                    activeTab === "errors"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                  Errors
                </button>
                <button
                  data-testid="tab-support-kb"
                  onClick={() => switchTab("support-kb")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap ${
                    activeTab === "support-kb"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  Support KB
                </button>
                <button
                  data-testid="tab-landing-pages"
                  onClick={() => switchTab("landing-pages")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap ${
                    activeTab === "landing-pages"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <MousePointerClick className="w-4 h-4" />
                  Landing Pages
                </button>
                <button
                  data-testid="tab-mturk"
                  onClick={() => switchTab("mturk")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap ${
                    activeTab === "mturk"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <Headphones className="w-4 h-4" />
                  Mech. Turk
                </button>
                <button
                  data-testid="tab-advanced"
                  onClick={() => switchTab("advanced")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap ${
                    activeTab === "advanced"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <Wrench className="w-4 h-4" />
                  Advanced
                </button>
              </div>
              {activeTab === "users" && (
                <div className="flex flex-wrap items-center gap-3 w-full">
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      data-testid="input-admin-search"
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search users or podcasts..."
                      className="w-full h-10 pl-10 pr-4 bg-black/[0.03] border border-black/[0.06] rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium placeholder:text-muted-foreground/50"
                    />
                  </div>
                  <select
                    data-testid="filter-source"
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    className="h-10 px-3 bg-black/[0.03] border border-black/[0.06] rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium"
                  >
                    <option value="">All Sources</option>
                    {(signupSources || []).map((s) => (
                      <option key={s} value={s}>{s.startsWith("utm:") ? `UTM: ${s.slice(4)}` : s}</option>
                    ))}
                  </select>
                  <select
                    data-testid="select-user-status-filter"
                    value={userStatusFilter}
                    onChange={(e) => setUserStatusFilter(e.target.value as UserStatusFilter)}
                    className="h-10 px-3 bg-black/[0.03] border border-black/[0.06] rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="pending-verification">Pending Verification</option>
                    <option value="pending-onboarding">Pending Onboarding</option>
                  </select>
                  <span className="text-xs text-muted-foreground font-medium ml-auto" data-testid="text-user-count">
                    Showing {filteredUsers.length} of {totalUserCount} users
                  </span>
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
                            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">Status</th>
                            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">
                              <button
                                data-testid="sort-signed-up"
                                onClick={() => setUserSortBy("signedUp")}
                                className={`flex items-center gap-1 hover:text-foreground transition-colors ${userSortBy === "signedUp" ? "text-foreground" : ""}`}
                              >
                                Signed Up
                                {userSortBy === "signedUp" && <ArrowUpDown className="w-3 h-3" />}
                              </button>
                            </th>
                            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">
                              <button
                                data-testid="sort-last-login"
                                onClick={() => setUserSortBy("lastLogin")}
                                className={`flex items-center gap-1 hover:text-foreground transition-colors ${userSortBy === "lastLogin" ? "text-foreground" : ""}`}
                              >
                                Last Login
                                {userSortBy === "lastLogin" && <ArrowUpDown className="w-3 h-3" />}
                              </button>
                            </th>
                            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">Podcasts</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/[0.04]">
                          {filteredUsers.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-5 py-12 text-center text-sm text-muted-foreground">
                                {(searchTerm || sourceFilter || userStatusFilter !== "all") ? "No users match your filters." : "No users yet."}
                              </td>
                            </tr>
                          ) : (
                            filteredUsers.map((user) => (
                              <tr key={user.id} className="hover:bg-black/[0.015] transition-colors cursor-pointer" data-testid={`row-admin-user-${user.id}`} onClick={() => adminNavigate(`/admin/users/${user.id}`)}>
                                <td className="px-5 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                      <Mail className="w-4 h-4 text-primary" />
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <p className="text-sm font-semibold text-foreground" data-testid={`text-user-email-${user.id}`}>{user.email}</p>
                                        <span
                                          data-testid={`badge-user-status-${user.id}`}
                                          className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none ${
                                            user.emailVerified
                                              ? "bg-emerald-100 text-emerald-700"
                                              : "bg-amber-100 text-amber-700"
                                          }`}
                                        >
                                          {user.emailVerified ? "Active" : "Pending"}
                                        </span>
                                      </div>
                                      <p className="text-xs text-muted-foreground">ID: {user.id}{user.signupSource ? ` · ${user.signupSource}` : ""}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-5 py-4">
                                  {(() => {
                                    const status = getUserStatus(user);
                                    return (
                                      <span
                                        data-testid={`badge-user-status-${user.id}`}
                                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${status.color}`}
                                      >
                                        {status.label}
                                      </span>
                                    );
                                  })()}
                                </td>
                                <td className="px-5 py-4">
                                  <div className="flex items-center gap-1.5 text-sm text-foreground">
                                    <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                    <span data-testid={`text-user-signup-${user.id}`}>{formatDate(user.createdAt)}</span>
                                  </div>
                                </td>
                                <td className="px-5 py-4">
                                  <div className="flex items-center gap-1.5 text-sm" data-testid={`text-user-last-login-${user.id}`}>
                                    {user.lastLoginAt ? (
                                      <>
                                        <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                        <span className="text-foreground">{formatDate(user.lastLoginAt)}</span>
                                      </>
                                    ) : (
                                      <span className="text-muted-foreground italic">Never</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-5 py-4">
                                  <span className="text-sm text-foreground" data-testid={`text-user-podcasts-${user.id}`}>
                                    {user.podcasts.length === 0 ? (
                                      <span className="text-muted-foreground italic">None</span>
                                    ) : (
                                      `${user.podcasts.length} ${user.podcasts.length === 1 ? "podcast" : "podcasts"}`
                                    )}
                                  </span>
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
              <div className="space-y-6">
                <div className="flex items-center gap-1 bg-black/[0.03] dark:bg-white/[0.06] rounded-xl p-1" data-testid="analytics-sub-tabs">
                  {([
                    { key: "acquisition" as const, label: "User Acquisition", icon: Users },
                    { key: "affiliates" as const, label: "Affiliates", icon: MousePointerClick },
                    { key: "growth" as const, label: "User Growth", icon: TrendingUp },
                    { key: "email" as const, label: "Email", icon: Mail },
                  ]).map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      data-testid={`analytics-tab-${key}`}
                      onClick={() => switchAnalyticsSubTab(key)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                        analyticsSubTab === key
                          ? "bg-white dark:bg-zinc-800 text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>

                <Suspense fallback={
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                }>
                  {analyticsSubTab === "acquisition" && <AnalyticsAcquisition />}
                  {analyticsSubTab === "affiliates" && <AnalyticsAffiliates />}
                  {analyticsSubTab === "growth" && <AnalyticsGrowth />}
                  {analyticsSubTab === "email" && <AnalyticsEmail />}
                </Suspense>
              </div>
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

            {activeTab === "cms" && (
              <Suspense fallback={
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              }>
                <AdminCMS />
              </Suspense>
            )}

            {activeTab === "advanced" && (
              <div>
                <div className="flex items-center gap-1 mb-5 bg-black/[0.03] rounded-xl p-1" data-testid="advanced-sub-tabs">
                  <button
                    data-testid="advanced-subtab-backfill"
                    onClick={() => switchAdvancedSubTab("backfill")}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                      advancedSubTab === "backfill"
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Database className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                    Backfill
                  </button>
                  <button
                    data-testid="advanced-subtab-rss"
                    onClick={() => switchAdvancedSubTab("rss")}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                      advancedSubTab === "rss"
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Rss className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                    RSS Feeds
                  </button>
                  <button
                    data-testid="advanced-subtab-hosts"
                    onClick={() => switchAdvancedSubTab("hosts")}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                      advancedSubTab === "hosts"
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                    Hosts
                  </button>
                  <button
                    data-testid="advanced-subtab-api-costs"
                    onClick={() => switchAdvancedSubTab("api-costs")}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                      advancedSubTab === "api-costs"
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <DollarSign className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                    API Costs
                  </button>
                  <button
                    data-testid="advanced-subtab-feature-flags"
                    onClick={() => switchAdvancedSubTab("feature-flags")}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                      advancedSubTab === "feature-flags"
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ToggleLeft className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                    Feature Flags
                  </button>
                </div>

                {advancedSubTab === "backfill" && (
                  <div>
                    <div className="flex items-center gap-1 mb-5 bg-black/[0.03] rounded-xl p-1" data-testid="backfill-sub-tabs">
                      <button
                        data-testid="subtab-transcripts"
                        onClick={() => switchBackfillSubTab("transcripts")}
                        className={`flex-1 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                          backfillSubTab === "transcripts"
                            ? "bg-white text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Database className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                        Episode Transcripts
                      </button>
                      <button
                        data-testid="subtab-pages"
                        onClick={() => switchBackfillSubTab("pages")}
                        className={`flex-1 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                          backfillSubTab === "pages"
                            ? "bg-white text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                        Episode Pages
                      </button>
                      <button
                        data-testid="subtab-tools"
                        onClick={() => switchBackfillSubTab("tools")}
                        className={`flex-1 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                          backfillSubTab === "tools"
                            ? "bg-white text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Settings className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                        Tools
                      </button>
                    </div>
                    <Suspense fallback={
                      <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      </div>
                    }>
                      {backfillSubTab === "transcripts" && <BackfillTracker />}
                      {backfillSubTab === "pages" && <EpisodePagesTracker />}
                      {backfillSubTab === "tools" && (
                    <div className="space-y-4" data-testid="backfill-tools">
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

                      <div className="glass-panel rounded-2xl p-5 flex items-center justify-between" data-testid="action-backfill-books">
                        <div>
                          <h3 className="text-sm font-bold text-foreground">Backfill Books from Transcripts</h3>
                          <p className="text-xs text-muted-foreground mt-1">Run dedicated AI book extraction on episodes that currently have no books. Processes 10 at a time.</p>
                        </div>
                        <button
                          data-testid="button-backfill-books"
                          onClick={async () => {
                            if (!confirm("This will run AI book extraction on up to 10 episodes without books. Each episode costs ~1 API call. Continue?")) return;
                            try {
                              const res = await apiRequest("POST", "/api/admin/backfill-books", { limit: 10 });
                              const data = await res.json();
                              toast({ title: "Book Backfill Complete", description: `Processed ${data.processed} episodes, found ${data.booksFound} books total.` });
                            } catch (err: any) {
                              toast({ title: "Error", description: err?.message || "Failed to run book backfill", variant: "destructive" });
                            }
                          }}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors whitespace-nowrap"
                        >
                          Extract Books (10)
                        </button>
                      </div>

                      <div className="glass-panel rounded-2xl p-5 flex items-center justify-between" data-testid="action-delete-dupe-books">
                        <div>
                          <h3 className="text-sm font-bold text-foreground">Clean Duplicate Books</h3>
                          <p className="text-xs text-muted-foreground mt-1">Remove duplicate book entries (Atomic Habits, Snowball, Founders, etc.)</p>
                        </div>
                        <button
                          data-testid="button-delete-dupe-books"
                          onClick={async () => {
                            try {
                              const res = await apiRequest("POST", "/api/admin/delete-duplicate-books");
                              const data = await res.json();
                              toast({ title: "Duplicates Removed", description: `Deleted ${data.count} duplicate book entries.` });
                            } catch (err: any) {
                              toast({ title: "Error", description: err?.message || "Failed to delete duplicates", variant: "destructive" });
                            }
                          }}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500 text-white hover:bg-red-600 transition-colors whitespace-nowrap"
                        >
                          Clean Dupes
                        </button>
                      </div>

                      <div className="glass-panel rounded-2xl p-5 flex items-center justify-between" data-testid="action-backfill-quotes">
                        <div>
                          <h3 className="text-sm font-bold text-foreground">Backfill Episode Quotes</h3>
                          <p className="text-xs text-muted-foreground mt-1">Generate shareable quotes for all episodes that don't have them yet. Runs in background.</p>
                        </div>
                        <button
                          data-testid="button-backfill-quotes"
                          onClick={async () => {
                            if (!confirm("This will generate quotes for all episodes missing them (~3,990 episodes). It runs in the background. Continue?")) return;
                            try {
                              await apiRequest("POST", "/api/admin/updates/trigger-quote-backfill");
                              toast({ title: "Quote Backfill Started", description: "Generating quotes for all episodes. Check progress below." });
                            } catch (err: any) {
                              toast({ title: "Error", description: err?.message || "Failed to start quote backfill", variant: "destructive" });
                            }
                          }}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-violet-500 text-white hover:bg-violet-600 transition-colors whitespace-nowrap"
                        >
                          Start Backfill
                        </button>
                      </div>

                      <TabloidHeadlineBackfillPanel />

                      <BatchExpansionPanel />
                    </div>
                  )}
                    </Suspense>
                  </div>
                )}

                {advancedSubTab === "rss" && (
                  <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
                    <RssFeedsManager />
                  </Suspense>
                )}

                {advancedSubTab === "hosts" && (
                  <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
                    <HostsManager />
                  </Suspense>
                )}

                {advancedSubTab === "api-costs" && (
                  <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
                    <ApiUsageDashboard />
                  </Suspense>
                )}
                {advancedSubTab === "feature-flags" && (
                  <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
                    <AdminFeatureFlags />
                  </Suspense>
                )}
              </div>
            )}
            {activeTab === "shop" && (
              <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                <AdminShopManagement />
              </Suspense>
            )}
            {activeTab === "advertisers" && (
              <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                <AdvertisersAdmin />
              </Suspense>
            )}
            {activeTab === "admin-users" && (
              <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                <AdminUsersManager />
              </Suspense>
            )}
            {activeTab === "categories" && (
              <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                <AdminCategoriesManager />
              </Suspense>
            )}
            {activeTab === "errors" && (
              <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                <AdminErrorLogs />
              </Suspense>
            )}
            {activeTab === "referrals" && (
              <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                <AdminReferrals />
              </Suspense>
            )}
            {activeTab === "support-kb" && (
              <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                <AdminSupportKB />
              </Suspense>
            )}
            {activeTab === "landing-pages" && (
              <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                <AdminLandingPages />
              </Suspense>
            )}
            {activeTab === "mturk" && (
              <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                <AdminMTurk />
              </Suspense>
            )}
          </motion.div>
        </section>
      </main>

    </div>
  );
}
