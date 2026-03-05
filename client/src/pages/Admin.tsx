import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2, LogOut, Shield, Users, Mail, Calendar, Podcast, Search, Send, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import faviconPath from "@assets/image_1772642558577.png";

interface AdminUser {
  id: number;
  email: string;
  podcasts: string[];
  readingLength: number;
  deliveryTime: string;
  deliveryTimezone: string;
  createdAt: string | null;
}

interface EmailLogEntry {
  id: number;
  userId: number;
  recipientEmail: string;
  podcasts: string[];
  source: string;
  sentAt: string | null;
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
  const [activeTab, setActiveTab] = useState<"users" | "emails">("users");

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
      queryClient.removeQueries({ queryKey: ["/api/admin/email-logs"] });
    },
  });

  const { data: users, isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAdmin,
  });

  const { data: emailLogs, isLoading: emailLogsLoading } = useQuery<EmailLogEntry[]>({
    queryKey: ["/api/admin/email-logs"],
    enabled: isAdmin,
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
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigate("/")}>
            <img src={faviconPath} alt="PodCap icon" className="w-8 h-8 object-contain" />
            <span className="font-display font-bold text-lg text-foreground">PodCap</span>
          </div>
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

  const filteredEmails = (emailLogs || []).filter((log) =>
    log.recipientEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.podcasts.some((p) => parsePodcastName(p).toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <img src={faviconPath} alt="PodCap icon" className="w-8 h-8 object-contain" />
          <span className="font-display font-bold text-lg text-foreground">PodCap</span>
          <span className="ml-1 px-2 py-0.5 bg-primary/10 text-primary text-xs font-bold rounded-md uppercase tracking-wide">Admin</span>
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
                  data-testid="tab-email-logs"
                  onClick={() => { setActiveTab("emails"); setSearchTerm(""); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    activeTab === "emails"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <Send className="w-4 h-4" />
                  Email Log
                  <span className="ml-0.5 px-1.5 py-0.5 bg-black/[0.05] rounded-md text-xs font-semibold">
                    {emailLogs?.length ?? 0}
                  </span>
                </button>
              </div>
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
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/[0.04]">
                          {filteredUsers.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-5 py-12 text-center text-sm text-muted-foreground">
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
                                    <p>{user.readingLength} min read</p>
                                    <p>{user.deliveryTime} · {user.deliveryTimezone?.replace("America/", "").replace("_", " ") || "ET"}</p>
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

            {activeTab === "emails" && (
              <>
                {emailLogsLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="glass-panel rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full" data-testid="table-admin-email-logs">
                        <thead>
                          <tr className="border-b border-black/[0.06] bg-black/[0.02]">
                            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">Recipient</th>
                            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">Sent At</th>
                            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">Podcasts Summarized</th>
                            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">Source</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/[0.04]">
                          {filteredEmails.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-5 py-12 text-center text-sm text-muted-foreground">
                                {searchTerm ? "No emails match your search." : "No emails sent yet."}
                              </td>
                            </tr>
                          ) : (
                            filteredEmails.map((log) => (
                              <tr key={log.id} className="hover:bg-black/[0.015] transition-colors" data-testid={`row-email-log-${log.id}`}>
                                <td className="px-5 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                      <Mail className="w-4 h-4 text-primary" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold text-foreground" data-testid={`text-email-recipient-${log.id}`}>{log.recipientEmail}</p>
                                      <p className="text-xs text-muted-foreground">User #{log.userId}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-5 py-4">
                                  <div className="flex items-center gap-1.5 text-sm text-foreground">
                                    <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                    <span data-testid={`text-email-sent-${log.id}`}>{formatDate(log.sentAt)}</span>
                                  </div>
                                </td>
                                <td className="px-5 py-4">
                                  <div className="flex flex-wrap gap-1.5" data-testid={`text-email-podcasts-${log.id}`}>
                                    {log.podcasts.length === 0 ? (
                                      <span className="text-xs text-muted-foreground italic">None</span>
                                    ) : (
                                      log.podcasts.map((p, i) => (
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
                                  <span
                                    data-testid={`text-email-source-${log.id}`}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                      log.source === "scheduled"
                                        ? "bg-green-50 text-green-700"
                                        : "bg-blue-50 text-blue-700"
                                    }`}
                                  >
                                    {log.source === "scheduled" ? (
                                      <Clock className="w-3 h-3" />
                                    ) : (
                                      <Send className="w-3 h-3" />
                                    )}
                                    {log.source === "scheduled" ? "Scheduled" : "Manual"}
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
          </motion.div>
        </section>
      </main>
    </div>
  );
}
