import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { Loader2, LogOut, Shield, Users, Mail, Calendar, Podcast, Search, UserCheck, Trash2, BarChart3, TrendingUp, Headphones, FileText, Inbox, Rss, Database, Settings, ShoppingBag, MousePointerClick, DollarSign, Megaphone, Wrench, List, AlertTriangle, Gift, BookOpen, ToggleLeft, Plus, X, ArrowUpDown, ExternalLink, CheckSquare, Square, MinusSquare, ShieldCheck, ShieldOff, Radio, Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { motion } from "framer-motion";
const PendingEmails = lazy(() => import("./PendingEmails"));
const RssFeedsManager = lazy(() => import("./RssFeedsManager"));
const HostsManager = lazy(() => import("./HostsManager"));
const AnalyticsAcquisition = lazy(() => import("./AnalyticsAcquisition"));
const AdminShopManagement = lazy(() => import("./AdminShopManagement"));
const AnalyticsAffiliates = lazy(() => import("./AnalyticsAffiliates"));
const AnalyticsGrowth = lazy(() => import("./AnalyticsGrowth"));
const AnalyticsEmail = lazy(() => import("./AnalyticsEmail"));
const AnalyticsElevenLabs = lazy(() => import("./AnalyticsElevenLabs"));
const AnalyticsFeatures = lazy(() => import("./AnalyticsFeatures"));
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
const BackfillManager = lazy(() => import("./BackfillManager"));
const AdminMTurk = lazy(() => import("./AdminMTurk"));
const AdminAlerts = lazy(() => import("./AdminAlerts"));
const AdminTranscriptPipeline = lazy(() => import("./AdminTranscriptPipeline"));
const AdminDemoEmail = lazy(() => import("./AdminDemoEmail"));
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
  channel?: string | null;
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

function FixPendingEmailLinks() {
  const { toast } = useToast();
  const fixMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/fix-pending-email-links"),
    onSuccess: async (res: Response) => {
      const data = await res.json();
      toast({
        title: "Episode links fixed",
        description: `Scanned ${data.scanned} pending emails, fixed ${data.fixed} record${data.fixed !== 1 ? "s" : ""}.`,
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to fix pending email links.", variant: "destructive" });
    },
  });

  return (
    <div className="mt-6 p-4 border border-black/[0.06] dark:border-white/[0.06] rounded-xl" data-testid="section-fix-email-links">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-foreground" data-testid="text-fix-email-links-title">Fix Episode Links in Pending Emails</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Scan pending emails for old-format episode URLs (missing /podcasts/ prefix) and rewrite them.</p>
        </div>
        <button
          data-testid="button-fix-email-links"
          onClick={() => fixMutation.mutate()}
          disabled={fixMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-primary text-primary-foreground shadow-sm hover:shadow-md transition-all disabled:opacity-50 shrink-0"
        >
          {fixMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Wrench className="w-4 h-4" />
          )}
          {fixMutation.isPending ? "Fixing..." : "Fix Links"}
        </button>
      </div>
    </div>
  );
}

export default function Admin() {
  const { path: adminPath, navigate: adminNavigate } = useAdminPath();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");

  type TabType = "cms" | "users" | "advertisers" | "landing-pages" | "product-features" | "internal-tools" | "advanced" | "admin-users";
  type ProductFeaturesSubTabType = "shop" | "categories" | "referrals" | "support-kb";
  type InternalToolsSubTabType = "mturk" | "pending" | "analytics" | "errors" | "alerts" | "pipeline" | "demo-email";
  type AnalyticsSubTabType = "acquisition" | "affiliates" | "growth" | "email" | "elevenlabs" | "features";
  type AdvancedSubTabType = "rss" | "hosts" | "api-costs" | "feature-flags" | "backfill";

  const productFeaturesSubTabs: ProductFeaturesSubTabType[] = ["shop", "categories", "referrals", "support-kb"];
  const internalToolsSubTabs: InternalToolsSubTabType[] = ["mturk", "pending", "analytics", "errors", "alerts", "pipeline", "demo-email"];
  const analyticsSubTabs: AnalyticsSubTabType[] = ["acquisition", "affiliates", "growth", "email", "elevenlabs", "features"];
  const advancedSubTabs: AdvancedSubTabType[] = ["rss", "hosts", "api-costs", "feature-flags", "backfill"];

  const deriveTabFromPath = useCallback((path: string): { tab: TabType; productFeaturesSub: ProductFeaturesSubTabType; internalToolsSub: InternalToolsSubTabType; analyticsSub: AnalyticsSubTabType; advancedSub: AdvancedSubTabType } => {
    const result = {
      tab: "cms" as TabType,
      productFeaturesSub: "shop" as ProductFeaturesSubTabType,
      internalToolsSub: "mturk" as InternalToolsSubTabType,
      analyticsSub: "acquisition" as AnalyticsSubTabType,
      advancedSub: "rss" as AdvancedSubTabType,
    };
    const segments = path.replace(/^\/admin\/?/, "").split("/").filter(Boolean);
    if (segments.length === 0) return result;
    const first = segments[0];

    if (first === "cms") { result.tab = "cms"; return result; }
    if (first === "users") { result.tab = "users"; return result; }
    if (first === "advertisers") { result.tab = "advertisers"; return result; }
    if (first === "landing-pages") { result.tab = "landing-pages"; return result; }
    if (first === "admin-users") { result.tab = "admin-users"; return result; }

    if (first === "product-features") {
      result.tab = "product-features";
      if (segments[1] && productFeaturesSubTabs.includes(segments[1] as ProductFeaturesSubTabType)) {
        result.productFeaturesSub = segments[1] as ProductFeaturesSubTabType;
      }
      if (first === "product-features" && segments[1] === "shop" && segments[2] === "book" && segments[3]) {
        result.productFeaturesSub = "shop";
      }
      return result;
    }
    if ((["shop", "categories", "referrals", "support-kb"] as string[]).includes(first)) {
      result.tab = "product-features";
      result.productFeaturesSub = first as ProductFeaturesSubTabType;
      if (first === "shop" && segments[1] === "book" && segments[2]) {
        result.productFeaturesSub = "shop";
      }
      return result;
    }

    if (first === "internal-tools") {
      result.tab = "internal-tools";
      const sub = segments[1];
      if (sub === "analytics") {
        result.internalToolsSub = "analytics";
        if (segments[2] && analyticsSubTabs.includes(segments[2] as AnalyticsSubTabType)) {
          result.analyticsSub = segments[2] as AnalyticsSubTabType;
        }
      } else if (sub && (["mturk", "pending", "errors", "alerts"] as string[]).includes(sub)) {
        result.internalToolsSub = sub as InternalToolsSubTabType;
      }
      return result;
    }
    if ((["mturk", "pending", "errors", "alerts"] as string[]).includes(first)) {
      result.tab = "internal-tools";
      result.internalToolsSub = first as InternalToolsSubTabType;
      return result;
    }
    if (first === "analytics") {
      result.tab = "internal-tools";
      result.internalToolsSub = "analytics";
      if (segments[1] && analyticsSubTabs.includes(segments[1] as AnalyticsSubTabType)) {
        result.analyticsSub = segments[1] as AnalyticsSubTabType;
      }
      return result;
    }

    if (first === "advanced") {
      result.tab = "advanced";
      if (segments[1] && advancedSubTabs.includes(segments[1] as AdvancedSubTabType)) {
        result.advancedSub = segments[1] as AdvancedSubTabType;
      }
      return result;
    }

    return result;
  }, []);

  const initialState = deriveTabFromPath(adminPath);
  const [activeTab, setActiveTab] = useState<TabType>(initialState.tab);
  const [productFeaturesSubTab, setProductFeaturesSubTab] = useState<ProductFeaturesSubTabType>(initialState.productFeaturesSub);
  const [internalToolsSubTab, setInternalToolsSubTab] = useState<InternalToolsSubTabType>(initialState.internalToolsSub);
  const [analyticsSubTab, setAnalyticsSubTab] = useState<AnalyticsSubTabType>(initialState.analyticsSub);
  const [advancedSubTab, setAdvancedSubTab] = useState<AdvancedSubTabType>(initialState.advancedSub);

  useEffect(() => {
    const derived = deriveTabFromPath(adminPath);
    setActiveTab(derived.tab);
    setProductFeaturesSubTab(derived.productFeaturesSub);
    setInternalToolsSubTab(derived.internalToolsSub);
    setAnalyticsSubTab(derived.analyticsSub);
    setAdvancedSubTab(derived.advancedSub);
  }, [adminPath, deriveTabFromPath]);

  const switchTab = useCallback((tab: TabType) => {
    setActiveTab(tab);
    setSearchTerm("");
    if (tab === "product-features") {
      adminNavigate(`/admin/product-features/shop`);
    } else if (tab === "internal-tools") {
      adminNavigate(`/admin/internal-tools/mturk`);
    } else if (tab === "advanced") {
      adminNavigate(`/admin/advanced/rss`);
    } else {
      adminNavigate(`/admin/${tab}`);
    }
  }, [adminNavigate]);

  const switchProductFeaturesSubTab = useCallback((sub: ProductFeaturesSubTabType) => {
    setProductFeaturesSubTab(sub);
    adminNavigate(`/admin/product-features/${sub}`);
  }, [adminNavigate]);

  const switchInternalToolsSubTab = useCallback((sub: InternalToolsSubTabType) => {
    setInternalToolsSubTab(sub);
    if (sub === "analytics") {
      adminNavigate(`/admin/internal-tools/analytics/acquisition`);
    } else {
      adminNavigate(`/admin/internal-tools/${sub}`);
    }
  }, [adminNavigate]);

  const switchAnalyticsSubTab = useCallback((sub: AnalyticsSubTabType) => {
    setAnalyticsSubTab(sub);
    adminNavigate(`/admin/internal-tools/analytics/${sub}`);
  }, [adminNavigate]);

  const switchAdvancedSubTab = useCallback((sub: AdvancedSubTabType) => {
    setAdvancedSubTab(sub);
    adminNavigate(`/admin/advanced/${sub}`);
  }, [adminNavigate]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const { data: adminAuth, isLoading: authLoading, error: adminAuthError } = useQuery<{ isAdmin: boolean } | null>({
    queryKey: ["/api/admin/me"],
    retry: false,
    queryFn: async () => {
      const res = await fetch("/api/admin/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (res.status === 403) {
        const data = await res.json();
        throw new Error(data.message || "Access denied");
      }
      if (!res.ok) throw new Error("Failed to check admin auth");
      return res.json();
    },
  });

  const isAdmin = adminAuth?.isAdmin === true;
  const isAccessDenied = adminAuthError?.message?.includes("Access denied") || adminAuthError?.message?.includes("admin privileges");

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/logout"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/me"] });
      queryClient.removeQueries({ queryKey: ["/api/admin/users"] });
    },
  });

  const [userSortBy, setUserSortBy] = useState<"signedUp" | "lastLogin">("signedUp");
  const [userStatusFilter, setUserStatusFilter] = useState<UserStatusFilter>("all");
  const [channelFilter, setChannelFilter] = useState<string>("");

  const { data: usersData, isLoading: usersLoading } = useQuery<{ users: AdminUser[]; totalCount: number }>({
    queryKey: ["/api/admin/users", userSortBy, channelFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (userSortBy === "lastLogin") params.set("sortBy", "lastLogin");
      if (channelFilter) params.set("channel", channelFilter);
      const qs = params.toString();
      const res = await fetch(`/api/admin/users${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    enabled: isAdmin,
  });

  const users = usersData?.users;
  const totalUserCount = usersData?.totalCount ?? 0;


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
      adminNavigate("/dashboard");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to impersonate user.", variant: "destructive" });
    },
  });

  useEffect(() => {
    setSelectedUserIds(new Set());
    setShowBulkDeleteConfirm(false);
  }, [searchTerm, channelFilter, userStatusFilter, userSortBy]);

  const bulkDeleteMutation = useMutation({
    mutationFn: (userIds: number[]) => apiRequest("POST", "/api/admin/users/bulk-delete", { userIds }),
    onSuccess: async (res: Response) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setSelectedUserIds(new Set());
      setShowBulkDeleteConfirm(false);
      const failCount = data.failures?.length || 0;
      if (failCount > 0) {
        toast({ title: "Partially deleted", description: `${data.deleted} user(s) deleted, ${failCount} failed.`, variant: "destructive" });
      } else {
        toast({ title: "Users deleted", description: `${data.deleted} user(s) deleted successfully.` });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete users.", variant: "destructive" });
    },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: (params: { userIds: number[]; emailVerified: boolean }) => apiRequest("POST", "/api/admin/users/bulk-status", params),
    onSuccess: async (res: Response) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setSelectedUserIds(new Set());
      toast({ title: "Status updated", description: `${data.updated} user(s) updated successfully.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update user status.", variant: "destructive" });
    },
  });

  const toggleUserSelection = useCallback((userId: number) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

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
        <header className="w-full px-4 sm:px-6 lg:px-10 xl:px-16 py-5 flex items-center justify-between">
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
              {isAccessDenied ? (
                <>
                  <div className="text-center">
                    <h1 className="text-xl font-display font-bold text-foreground mb-1" data-testid="text-access-denied-title">Access Denied</h1>
                    <p className="text-sm text-muted-foreground" data-testid="text-access-denied-message">Your account does not have admin privileges. Only @podrise.com accounts with admin access can sign in here.</p>
                  </div>
                  <a
                    href="/dashboard"
                    data-testid="link-back-to-dashboard"
                    className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-sm bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-[0.99]"
                  >
                    Back to Dashboard
                  </a>
                </>
              ) : (
                <>
                  <div className="text-center">
                    <h1 className="text-xl font-display font-bold text-foreground mb-1" data-testid="text-admin-login-title">Admin Access</h1>
                    <p className="text-sm text-muted-foreground">Sign in with your @podrise.com Google account</p>
                  </div>
                  <a
                    href="/api/auth/google?redirect=/admin"
                    data-testid="button-admin-google-login"
                    className="w-full h-12 flex items-center justify-center gap-3 rounded-xl font-display font-bold text-sm bg-white border border-black/[0.08] text-foreground shadow-sm hover:shadow-md hover:bg-gray-50 transition-all active:scale-[0.99]"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Sign in with Google
                  </a>
                </>
              )}
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

  const visibleIds = filteredUsers.map(u => u.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedUserIds.has(id));
  const someSelected = visibleIds.some(id => selectedUserIds.has(id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(visibleIds));
    }
  };

  const isDev = import.meta.env.DEV;

  return (
    <div className="min-h-screen flex flex-col">
      {isDev && (
        <div className="w-full bg-amber-500/15 border-b border-amber-500/30 px-4 sm:px-6 lg:px-10 xl:px-16 py-3" data-testid="banner-dev-warning">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <p className="text-sm font-medium text-amber-400">
              <span className="font-bold">Dev Environment</span> — Changes made here won't appear on the live site. Approve/reject products and manage data on the <a href="https://podrise.com/admin" target="_blank" rel="noopener noreferrer" className="underline font-bold hover:text-amber-300">production admin</a> instead.
            </p>
          </div>
        </div>
      )}
      {impersonationStatus?.impersonating && (
        <div className="w-full bg-amber-500 text-white px-4 sm:px-6 lg:px-10 xl:px-16 py-2.5 flex items-center justify-center gap-3" data-testid="banner-admin-impersonating">
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
      <header className="w-full px-4 sm:px-6 lg:px-10 xl:px-16 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/" className="flex items-center">
            <PodRiseWordmark />
          </a>
          <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-bold rounded-md uppercase tracking-wide">Admin</span>
        </div>
        <div className="flex items-center gap-3">
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

      <main className="flex-1 flex flex-col px-4 sm:px-6 lg:px-10 xl:px-16 pb-16">
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
                  data-testid="tab-landing-pages"
                  onClick={() => switchTab("landing-pages")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap ${
                    activeTab === "landing-pages"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <MousePointerClick className="w-4 h-4" />
                  Advertising
                </button>
                <button
                  data-testid="tab-product-features"
                  onClick={() => switchTab("product-features")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap ${
                    activeTab === "product-features"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <ShoppingBag className="w-4 h-4" />
                  Product Features
                </button>
                <button
                  data-testid="tab-internal-tools"
                  onClick={() => switchTab("internal-tools")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap ${
                    activeTab === "internal-tools"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  <Wrench className="w-4 h-4" />
                  Internal Tools
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
                  <Database className="w-4 h-4" />
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
                    data-testid="filter-channel"
                    value={channelFilter}
                    onChange={(e) => setChannelFilter(e.target.value)}
                    className="h-10 px-3 bg-black/[0.03] border border-black/[0.06] rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium"
                  >
                    <option value="">All Channels</option>
                    <option value="Organic Search">Organic Search</option>
                    <option value="Paid Search">Paid Search</option>
                    <option value="Direct">Direct</option>
                    <option value="Referral">Referral</option>
                    <option value="Organic Social">Organic Social</option>
                    <option value="Paid Social">Paid Social</option>
                    <option value="Email">Email</option>
                    <option value="Display">Display</option>
                    <option value="Affiliate">Affiliate</option>
                    <option value="Unassigned">Unassigned</option>
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
                            <th className="w-10 px-3 py-3">
                              <button
                                data-testid="checkbox-select-all"
                                onClick={toggleSelectAll}
                                className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                              >
                                {allSelected ? (
                                  <CheckSquare className="w-4 h-4 text-primary" />
                                ) : someSelected ? (
                                  <MinusSquare className="w-4 h-4 text-primary" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>
                            </th>
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
                            <th className="w-10 px-3 py-3"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/[0.04]">
                          {filteredUsers.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">
                                {(searchTerm || channelFilter || userStatusFilter !== "all") ? "No users match your filters." : "No users yet."}
                              </td>
                            </tr>
                          ) : (
                            filteredUsers.map((user) => (
                              <tr key={user.id} className="hover:bg-black/[0.015] transition-colors cursor-pointer" data-testid={`row-admin-user-${user.id}`} onClick={() => adminNavigate(`/admin/users/${user.id}`)}>
                                <td className="w-10 px-3 py-4" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    data-testid={`checkbox-user-${user.id}`}
                                    onClick={() => toggleUserSelection(user.id)}
                                    className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    {selectedUserIds.has(user.id) ? (
                                      <CheckSquare className="w-4 h-4 text-primary" />
                                    ) : (
                                      <Square className="w-4 h-4" />
                                    )}
                                  </button>
                                </td>
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
                                      <p className="text-xs text-muted-foreground">ID: {user.id}{user.channel ? ` · ${user.channel}` : ""}{user.signupSource ? ` · ${user.signupSource}` : ""}</p>
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
                                <td className="w-10 px-3 py-4" onClick={(e) => e.stopPropagation()}>
                                  <a
                                    href={`/admin/users/${user.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    data-testid={`link-open-new-tab-${user.id}`}
                                    className="flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                                    title="Open in new tab"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </a>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {selectedUserIds.size > 0 && (
                      <div className="sticky bottom-4 mx-4 mb-4 mt-2" data-testid="bulk-action-bar">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-3 rounded-xl bg-primary/5 border border-primary/20 shadow-lg backdrop-blur-sm">
                          <span className="text-sm font-semibold text-foreground" data-testid="text-selected-count">
                            {selectedUserIds.size} user{selectedUserIds.size !== 1 ? "s" : ""} selected
                          </span>
                          <div className="flex items-center flex-wrap gap-2">
                            <button
                              data-testid="button-bulk-verify"
                              onClick={() => bulkStatusMutation.mutate({ userIds: Array.from(selectedUserIds), emailVerified: true })}
                              disabled={bulkStatusMutation.isPending}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                            >
                              {bulkStatusMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                              Mark Verified
                            </button>
                            <button
                              data-testid="button-bulk-unverify"
                              onClick={() => bulkStatusMutation.mutate({ userIds: Array.from(selectedUserIds), emailVerified: false })}
                              disabled={bulkStatusMutation.isPending}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-50"
                            >
                              {bulkStatusMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
                              Mark Unverified
                            </button>
                            <button
                              data-testid="button-bulk-delete"
                              onClick={() => setShowBulkDeleteConfirm(true)}
                              disabled={bulkDeleteMutation.isPending}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                            <button
                              data-testid="button-clear-selection"
                              onClick={() => { setSelectedUserIds(new Set()); setShowBulkDeleteConfirm(false); }}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground border border-black/10 hover:bg-black/[0.03] transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                              Clear
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <Dialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
                  <DialogContent data-testid="dialog-bulk-delete">
                    <DialogHeader>
                      <DialogTitle>Delete {selectedUserIds.size} user{selectedUserIds.size !== 1 ? "s" : ""}?</DialogTitle>
                      <DialogDescription>
                        This action cannot be undone. All selected user accounts and their associated data will be permanently removed.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <button
                        data-testid="button-bulk-delete-cancel"
                        onClick={() => setShowBulkDeleteConfirm(false)}
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground border border-black/10 hover:bg-black/[0.03] transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        data-testid="button-bulk-delete-confirm"
                        onClick={() => bulkDeleteMutation.mutate(Array.from(selectedUserIds))}
                        disabled={bulkDeleteMutation.isPending}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        {bulkDeleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        {bulkDeleteMutation.isPending ? "Deleting..." : "Delete Users"}
                      </button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
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

            {activeTab === "advertisers" && (
              <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                <AdvertisersAdmin />
              </Suspense>
            )}

            {activeTab === "landing-pages" && (
              <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                <AdminLandingPages />
              </Suspense>
            )}

            {activeTab === "admin-users" && (
              <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                <AdminUsersManager />
              </Suspense>
            )}

            {activeTab === "product-features" && (
              <div className="space-y-5">
                <div className="flex items-center gap-1 bg-black/[0.03] dark:bg-white/[0.06] rounded-xl p-1" data-testid="product-features-sub-tabs">
                  {([
                    { key: "shop" as const, label: "Shop", icon: ShoppingBag },
                    { key: "categories" as const, label: "Categories", icon: List },
                    { key: "referrals" as const, label: "Referrals", icon: Gift },
                    { key: "support-kb" as const, label: "Support KB", icon: BookOpen },
                  ]).map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      data-testid={`product-features-subtab-${key}`}
                      onClick={() => switchProductFeaturesSubTab(key)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                        productFeaturesSubTab === key
                          ? "bg-white dark:bg-zinc-800 text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>

                {productFeaturesSubTab === "shop" && (
                  <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                    <AdminShopManagement bookId={(() => {
                      const match = adminPath.match(/\/(?:admin\/)?(?:product-features\/)?shop\/book\/(\d+)/);
                      return match ? parseInt(match[1], 10) : undefined;
                    })()} />
                  </Suspense>
                )}
                {productFeaturesSubTab === "categories" && (
                  <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                    <AdminCategoriesManager />
                  </Suspense>
                )}
                {productFeaturesSubTab === "referrals" && (
                  <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                    <AdminReferrals />
                  </Suspense>
                )}
                {productFeaturesSubTab === "support-kb" && (
                  <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                    <AdminSupportKB />
                  </Suspense>
                )}
              </div>
            )}

            {activeTab === "internal-tools" && (
              <div className="space-y-5">
                <div className="flex items-center gap-1 bg-black/[0.03] dark:bg-white/[0.06] rounded-xl p-1" data-testid="internal-tools-sub-tabs">
                  {([
                    { key: "mturk" as const, label: "Mech Turk", icon: Headphones },
                    { key: "pending" as const, label: "Email Log", icon: Inbox },
                    { key: "analytics" as const, label: "Analytics", icon: BarChart3 },
                    { key: "errors" as const, label: "Errors", icon: AlertTriangle },
                    { key: "alerts" as const, label: "Alerts", icon: Shield },
                    { key: "pipeline" as const, label: "Pipeline", icon: Radio },
                    { key: "demo-email" as const, label: "Demo Email", icon: Send },
                  ]).map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      data-testid={`internal-tools-subtab-${key}`}
                      onClick={() => switchInternalToolsSubTab(key)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                        internalToolsSubTab === key
                          ? "bg-white dark:bg-zinc-800 text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>

                {internalToolsSubTab === "mturk" && (
                  <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                    <AdminMTurk />
                  </Suspense>
                )}
                {internalToolsSubTab === "pending" && (
                  <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
                    <PendingEmails />
                  </Suspense>
                )}
                {internalToolsSubTab === "analytics" && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-1 bg-black/[0.03] dark:bg-white/[0.06] rounded-xl p-1" data-testid="analytics-sub-tabs">
                      {([
                        { key: "acquisition" as const, label: "User Acquisition", icon: Users },
                        { key: "affiliates" as const, label: "Affiliates", icon: MousePointerClick },
                        { key: "growth" as const, label: "User Growth", icon: TrendingUp },
                        { key: "email" as const, label: "Email", icon: Mail },
                        { key: "elevenlabs" as const, label: "ElevenLabs", icon: Headphones },
                        { key: "features" as const, label: "Features", icon: BarChart3 },
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
                    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
                      {analyticsSubTab === "acquisition" && <AnalyticsAcquisition />}
                      {analyticsSubTab === "affiliates" && <AnalyticsAffiliates />}
                      {analyticsSubTab === "growth" && <AnalyticsGrowth />}
                      {analyticsSubTab === "email" && <AnalyticsEmail />}
                      {analyticsSubTab === "elevenlabs" && <AnalyticsElevenLabs />}
                      {analyticsSubTab === "features" && <AnalyticsFeatures />}
                    </Suspense>
                  </div>
                )}
                {internalToolsSubTab === "errors" && (
                  <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                    <AdminErrorLogs />
                  </Suspense>
                )}
                {internalToolsSubTab === "alerts" && (
                  <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                    <AdminAlerts />
                  </Suspense>
                )}
                {internalToolsSubTab === "pipeline" && (
                  <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                    <AdminTranscriptPipeline />
                  </Suspense>
                )}

                {internalToolsSubTab === "demo-email" && (
                  <Suspense fallback={<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                    <AdminDemoEmail />
                  </Suspense>
                )}

                <FixPendingEmailLinks />
              </div>
            )}

            {activeTab === "advanced" && (
              <div>
                <div className="flex items-center gap-1 mb-5 bg-black/[0.03] rounded-xl p-1" data-testid="advanced-sub-tabs">
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
                </div>

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
                {advancedSubTab === "backfill" && (
                  <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
                    <BackfillManager />
                  </Suspense>
                )}
              </div>
            )}
          </motion.div>
        </section>
      </main>

    </div>
  );
}
