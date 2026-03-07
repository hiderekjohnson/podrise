import { useState, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { Loader2, LogOut, Shield, Users, Mail, Calendar, Podcast, Search, Clock, UserCheck, Trash2, BarChart3, TrendingUp, Headphones, Crown, X, Palette, BrainCircuit, FileText, Inbox, Send, Eye } from "lucide-react";
import { motion } from "framer-motion";
const EmailTemplateEditor = lazy(() => import("./EmailTemplateEditor"));
const RecapPromptEditor = lazy(() => import("./RecapPromptEditor"));
const TranscriptLogs = lazy(() => import("./TranscriptLogs"));
const PendingEmails = lazy(() => import("./PendingEmails"));
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

export default function Admin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "analytics" | "template" | "prompt" | "transcripts" | "pending">("pending");
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
        <button
          data-testid="button-admin-logout"
          onClick={() => logoutMutation.mutate()}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Log out
        </button>
      </header>

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
              </div>
              {activeTab !== "analytics" && activeTab !== "template" && activeTab !== "prompt" && activeTab !== "transcripts" && activeTab !== "pending" && (
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
          </motion.div>
        </section>
      </main>

    </div>
  );
}
