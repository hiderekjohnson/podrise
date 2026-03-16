import { useState, useEffect, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { Loader2, LogOut, Shield, Users, Mail, Calendar, Podcast, Search, UserCheck, Trash2, BarChart3, TrendingUp, Headphones, FileText, Inbox, Rss, Key, Database, Settings, ShoppingBag, MousePointerClick, DollarSign, Megaphone, Wrench, List, AlertTriangle, Gift, BookOpen } from "lucide-react";
import { motion } from "framer-motion";
const PendingEmails = lazy(() => import("./PendingEmails"));
const PodcastDirectory = lazy(() => import("./PodcastDirectory"));
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
const AdminListsManager = lazy(() => import("./AdminListsManager"));
const AdminErrorLogs = lazy(() => import("./AdminErrorLogs"));
const AdminReferrals = lazy(() => import("./AdminReferrals"));
const AdminSupportKB = lazy(() => import("./AdminSupportKB"));
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PodCapWordmark } from "@/components/PodCapHeader";

interface AdminUser {
  id: number;
  email: string;
  podcasts: string[];
  deliveryTime: string;
  deliveryTimezone: string;
  createdAt: string | null;
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

export default function Admin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "analytics" | "pending" | "directory" | "shop" | "advertisers" | "admin-users" | "lists" | "advanced" | "errors" | "referrals" | "support-kb">("advanced");
  const [analyticsSubTab, setAnalyticsSubTab] = useState<"acquisition" | "affiliates" | "growth" | "email">("acquisition");
  const [advancedSubTab, setAdvancedSubTab] = useState<"backfill" | "rss" | "hosts" | "api-costs">("backfill");
  const [backfillSubTab, setBackfillSubTab] = useState<"transcripts" | "pages" | "tools">("transcripts");
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

  const { data: users, isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
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
            <PodCapWordmark />
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

  const isDev = import.meta.env.DEV;

  return (
    <div className="min-h-screen flex flex-col">
      {isDev && (
        <div className="w-full bg-amber-500/15 border-b border-amber-500/30 px-6 py-3" data-testid="banner-dev-warning">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <p className="text-sm font-medium text-amber-400">
              <span className="font-bold">Dev Environment</span> — Changes made here won't appear on the live site. Approve/reject products and manage data on the <a href="https://podcap.replit.app/admin" target="_blank" rel="noopener noreferrer" className="underline font-bold hover:text-amber-300">production admin</a> instead.
            </p>
          </div>
        </div>
      )}
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <a href="/" className="flex items-center">
            <PodCapWordmark />
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
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex items-center gap-2 overflow-x-auto pb-2 -mb-2 scrollbar-thin scrollbar-thumb-muted/30 scrollbar-track-transparent max-w-full">
                <button
                  data-testid="tab-pending"
                  onClick={() => { setActiveTab("pending"); setSearchTerm(""); }}
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
                  onClick={() => { setActiveTab("users"); setSearchTerm(""); }}
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
                  onClick={() => { setActiveTab("analytics"); setSearchTerm(""); }}
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
                  data-testid="tab-directory"
                  onClick={() => { setActiveTab("directory"); setSearchTerm(""); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap ${
                    activeTab === "directory"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <Podcast className="w-4 h-4" />
                  Podcasts
                </button>
                <button
                  data-testid="tab-shop"
                  onClick={() => { setActiveTab("shop"); setSearchTerm(""); }}
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
                  data-testid="tab-lists"
                  onClick={() => { setActiveTab("lists"); setSearchTerm(""); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap ${
                    activeTab === "lists"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <List className="w-4 h-4" />
                  Lists
                </button>
                <button
                  data-testid="tab-advertisers"
                  onClick={() => { setActiveTab("advertisers"); setSearchTerm(""); }}
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
                  onClick={() => { setActiveTab("admin-users"); setSearchTerm(""); }}
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
                  onClick={() => { setActiveTab("referrals"); setSearchTerm(""); }}
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
                  onClick={() => { setActiveTab("errors"); setSearchTerm(""); }}
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
                  onClick={() => { setActiveTab("support-kb"); setSearchTerm(""); }}
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
                  data-testid="tab-advanced"
                  onClick={() => { setActiveTab("advanced"); setSearchTerm(""); }}
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
                      onClick={() => setAnalyticsSubTab(key)}
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

            {activeTab === "directory" && (
              <Suspense fallback={
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              }>
                <PodcastDirectory />
              </Suspense>
            )}

            {activeTab === "advanced" && (
              <div>
                <div className="flex items-center gap-1 mb-5 bg-black/[0.03] rounded-xl p-1" data-testid="advanced-sub-tabs">
                  <button
                    data-testid="advanced-subtab-backfill"
                    onClick={() => setAdvancedSubTab("backfill")}
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
                    onClick={() => setAdvancedSubTab("rss")}
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
                    onClick={() => setAdvancedSubTab("hosts")}
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
                    onClick={() => setAdvancedSubTab("api-costs")}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                      advancedSubTab === "api-costs"
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <DollarSign className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                    API Costs
                  </button>
                </div>

                {advancedSubTab === "backfill" && (
                  <div>
                    <div className="flex items-center gap-1 mb-5 bg-black/[0.03] rounded-xl p-1" data-testid="backfill-sub-tabs">
                      <button
                        data-testid="subtab-transcripts"
                        onClick={() => setBackfillSubTab("transcripts")}
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
                        onClick={() => setBackfillSubTab("pages")}
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
                        onClick={() => setBackfillSubTab("tools")}
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

                      <div className="glass-panel rounded-2xl p-5 flex items-center justify-between" data-testid="action-backfill-spotify-urls">
                        <div>
                          <h3 className="text-sm font-bold text-foreground">Backfill Spotify Episode URLs</h3>
                          <p className="text-xs text-muted-foreground mt-1">Search Spotify for direct episode links for all recaps missing them.</p>
                        </div>
                        <button
                          data-testid="button-backfill-spotify-urls"
                          onClick={async () => {
                            if (!confirm("This will search Spotify for direct episode URLs for all existing recaps. This may take a while. Continue?")) return;
                            try {
                              await apiRequest("POST", "/api/admin/backfill-spotify-episode-urls");
                              toast({ title: "Backfill Started", description: "Spotify episode URL backfill is running in the background." });
                            } catch (err: any) {
                              toast({ title: "Error", description: err?.message || "Failed to start backfill", variant: "destructive" });
                            }
                          }}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-green-500 text-white hover:bg-green-600 transition-colors whitespace-nowrap"
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
            {activeTab === "lists" && (
              <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                <AdminListsManager />
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
          </motion.div>
        </section>
      </main>

    </div>
  );
}
