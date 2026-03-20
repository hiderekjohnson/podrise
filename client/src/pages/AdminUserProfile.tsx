import { useState, useRef, useEffect, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Mail, User, Calendar, Globe, Shield, CreditCard,
  Link2, Bookmark, MousePointerClick, Send, Eye, Clock,
  Loader2, Save, X, UserCheck, Trash2, ChevronDown, ChevronRight,
  Podcast, Tag, MapPin, Languages, Cake, Users as UsersIcon, ExternalLink
} from "lucide-react";

interface UserProfile {
  id: number;
  email: string;
  podcasts: string[];
  industries: string[];
  interests: string[];
  roles: string[];
  topicFrequencies: Record<string, any>;
  deliveryTime: string;
  deliveryTimezone: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  plan: string;
  vacationUntil: string | null;
  emailVerified: boolean;
  signupSource: string | null;
  signupSourceDetail: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceType: string | null;
  googleId: string | null;
  onboardingCompleted: boolean;
  displayName: string | null;
  birthday: string | null;
  gender: string | null;
  location: string | null;
  language: string | null;
  referralCode: string | null;
  referredBy: number | null;
  createdAt: string | null;
  lastLoginAt: string | null;
}

interface EmailStats {
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  lastEmailDate: string | null;
}

interface RecentEmail {
  id: number;
  recipientEmail: string;
  podcasts: string[];
  recapDate: string;
  subject: string;
  status: string;
  sentAt: string | null;
  emailOpenedAt: string | null;
  firstClickedAt: string | null;
  createdAt: string;
}

interface EmailClickEntry {
  id: number;
  emailId: number;
  url: string;
  clickedAt: string;
}

interface BookmarkEntry {
  id: number;
  episodeSlug: string;
  podcastSlug: string;
  createdAt: string;
}

interface ReferralEntry {
  id: number;
  referredUserId: number;
  referredEmail: string;
  status: string;
  createdAt: string;
  verifiedAt: string | null;
}

interface ReferredByUser {
  id: number;
  email: string;
  displayName: string | null;
}

interface AdminInfo {
  isAdmin: boolean;
  role: string | null;
}

interface ProfileData {
  user: UserProfile;
  adminInfo: AdminInfo;
  emailStats: EmailStats;
  recentEmails: RecentEmail[];
  emailClicks: EmailClickEntry[];
  bookmarks: BookmarkEntry[];
  referralsMade: ReferralEntry[];
  referredByUser: ReferredByUser | null;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function parsePodcastName(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.name) return parsed.name;
  } catch {}
  return raw;
}

const TAB_SECTIONS = [
  { key: "identity", label: "Identity & Personal", icon: User },
  { key: "account", label: "Account Status", icon: Shield },
  { key: "acquisition", label: "Acquisition", icon: Globe },
  { key: "podcasts", label: "Podcasts", icon: Podcast },
  { key: "preferences", label: "Preferences", icon: Tag },
  { key: "email-settings", label: "Email Settings", icon: Clock },
  { key: "email-history", label: "Email History", icon: Send },
  { key: "email-clicks", label: "Email Clicks", icon: MousePointerClick },
  { key: "referrals", label: "Referrals", icon: UsersIcon },
  { key: "bookmarks", label: "Bookmarks", icon: Bookmark },
  { key: "stripe", label: "Stripe", icon: CreditCard },
] as const;

function CollapsibleSection({ title, icon: Icon, defaultOpen = true, children, badge, sectionRef }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string | number;
  sectionRef?: React.Ref<HTMLDivElement>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div ref={sectionRef} className="glass-panel rounded-2xl overflow-hidden scroll-mt-20" data-testid={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-black/[0.02] transition-colors"
        data-testid={`toggle-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {badge !== undefined && (
            <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-0.5 rounded-full">{badge}</span>
          )}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-black/[0.06]">{children}</div>}
    </div>
  );
}

function InfoRow({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-black/[0.04] last:border-0">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-sm text-foreground text-right max-w-[60%] break-all" data-testid={testId}>{value || "—"}</span>
    </div>
  );
}

export default function AdminUserProfile() {
  const [, params] = useRoute("/admin/users/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const userId = params?.id ? parseInt(params.id, 10) : NaN;

  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState<Record<string, any>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(TAB_SECTIONS[0].key);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const tabBarRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const isScrollingToSection = useRef(false);

  const scrollToSection = useCallback((key: string) => {
    const el = sectionRefs.current[key];
    if (el) {
      isScrollingToSection.current = true;
      setActiveTab(key);
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => { isScrollingToSection.current = false; }, 800);
    }
  }, []);

  useEffect(() => {
    if (activeTabRef.current && tabBarRef.current) {
      const tabBar = tabBarRef.current;
      const tab = activeTabRef.current;
      const tabLeft = tab.offsetLeft;
      const tabWidth = tab.offsetWidth;
      const barWidth = tabBar.offsetWidth;
      const scrollLeft = tabBar.scrollLeft;

      if (tabLeft < scrollLeft) {
        tabBar.scrollTo({ left: tabLeft - 16, behavior: "smooth" });
      } else if (tabLeft + tabWidth > scrollLeft + barWidth) {
        tabBar.scrollTo({ left: tabLeft + tabWidth - barWidth + 16, behavior: "smooth" });
      }
    }
  }, [activeTab]);

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

  const { data, isLoading, error } = useQuery<ProfileData>({
    queryKey: ["/api/admin/users", userId, "profile"],
    enabled: !isNaN(userId) && !!adminAuth?.isAdmin,
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${userId}/profile`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch user profile");
      return res.json();
    },
  });

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const visibleSections = new Map<string, number>();

    TAB_SECTIONS.forEach(({ key }) => {
      const el = sectionRefs.current[key];
      if (!el) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              visibleSections.set(key, entry.intersectionRatio);
            } else {
              visibleSections.delete(key);
            }
          });

          if (!isScrollingToSection.current && visibleSections.size > 0) {
            let topKey: string = key;
            let topY = Infinity;
            visibleSections.forEach((_, k) => {
              const sEl = sectionRefs.current[k];
              if (sEl) {
                const rect = sEl.getBoundingClientRect();
                if (rect.top < topY && rect.top >= -rect.height / 2) {
                  topY = rect.top;
                  topKey = k;
                }
              }
            });
            setActiveTab(topKey);
          }
        },
        { threshold: [0, 0.25, 0.5], rootMargin: "-80px 0px 0px 0px" }
      );

      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (fields: Record<string, any>) => apiRequest("PATCH", `/api/admin/users/${userId}/profile`, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId, "profile"] });
      setEditing(false);
      setEditFields({});
      toast({ title: "Updated", description: "User profile updated successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update user.", variant: "destructive" });
    },
  });

  const adminToggleMutation = useMutation({
    mutationFn: (grant: boolean) => apiRequest("POST", `/api/admin/users/${userId}/admin-toggle`, { grant }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId, "profile"] });
      toast({ title: "Updated", description: "Admin status updated successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to update admin status.", variant: "destructive" });
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", "/api/admin/impersonate", { userId: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      navigate("/dashboard");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to impersonate user.", variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Deleted", description: "User account has been deleted." });
      navigate("/admin");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete user.", variant: "destructive" });
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="loading-auth">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!adminAuth?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="not-authorized">
        <p className="text-muted-foreground">Not authorized</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="loading-profile">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" data-testid="error-profile">
        <p className="text-muted-foreground">Failed to load user profile</p>
        <button onClick={() => navigate("/admin")} className="text-primary text-sm hover:underline" data-testid="link-back-error">Back to Admin</button>
      </div>
    );
  }

  const { user, adminInfo, emailStats, recentEmails, emailClicks, bookmarks, referralsMade, referredByUser } = data;

  const startEditing = () => {
    setEditing(true);
    setEditFields({
      displayName: user.displayName || "",
      birthday: user.birthday || "",
      gender: user.gender || "",
      location: user.location || "",
      language: user.language || "",
      plan: user.plan || "free",
      deliveryTime: user.deliveryTime || "07:00",
      deliveryTimezone: user.deliveryTimezone || "America/New_York",
      vacationUntil: user.vacationUntil || "",
      emailVerified: user.emailVerified,
      onboardingCompleted: user.onboardingCompleted,
    });
  };

  const handleSave = () => {
    const fields: Record<string, any> = {};
    if (editFields.displayName !== (user.displayName || "")) fields.displayName = editFields.displayName || null;
    if (editFields.birthday !== (user.birthday || "")) fields.birthday = editFields.birthday || null;
    if (editFields.gender !== (user.gender || "")) fields.gender = editFields.gender || null;
    if (editFields.location !== (user.location || "")) fields.location = editFields.location || null;
    if (editFields.language !== (user.language || "")) fields.language = editFields.language || null;
    if (editFields.plan !== user.plan) fields.plan = editFields.plan;
    if (editFields.deliveryTime !== user.deliveryTime) fields.deliveryTime = editFields.deliveryTime;
    if (editFields.deliveryTimezone !== user.deliveryTimezone) fields.deliveryTimezone = editFields.deliveryTimezone;
    if (editFields.vacationUntil !== (user.vacationUntil || "")) fields.vacationUntil = editFields.vacationUntil || null;
    if (editFields.emailVerified !== user.emailVerified) fields.emailVerified = editFields.emailVerified;
    if (editFields.onboardingCompleted !== user.onboardingCompleted) fields.onboardingCompleted = editFields.onboardingCompleted;

    if (Object.keys(fields).length === 0) {
      setEditing(false);
      return;
    }
    updateMutation.mutate(fields);
  };

  const openRate = emailStats.totalSent > 0 ? ((emailStats.totalOpened / emailStats.totalSent) * 100).toFixed(1) : "0";
  const clickRate = emailStats.totalSent > 0 ? ((emailStats.totalClicked / emailStats.totalSent) * 100).toFixed(1) : "0";

  return (
    <div className="min-h-screen bg-background" data-testid="admin-user-profile">
      <div className="w-full px-6 lg:px-10 xl:px-16 py-8">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate("/admin")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Users
          </button>
          <div className="flex items-center gap-2">
            {!editing ? (
              <button
                onClick={startEditing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-primary border border-primary/20 hover:bg-primary/5 transition-colors"
                data-testid="button-edit"
              >
                <Save className="w-3.5 h-3.5" />
                Edit
              </button>
            ) : (
              <>
                <button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
                  data-testid="button-save"
                >
                  {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save
                </button>
                <button
                  onClick={() => { setEditing(false); setEditFields({}); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground border border-black/10 hover:bg-black/[0.03] transition-colors"
                  data-testid="button-cancel-edit"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
              </>
            )}
            <button
              onClick={() => impersonateMutation.mutate(userId)}
              disabled={impersonateMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-primary border border-primary/20 hover:bg-primary/5 transition-colors disabled:opacity-50"
              data-testid="button-impersonate"
            >
              <UserCheck className="w-3.5 h-3.5" />
              Impersonate
            </button>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
                data-testid="button-delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => deleteUserMutation.mutate(userId)}
                  disabled={deleteUserMutation.isPending}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
                  data-testid="button-confirm-delete"
                >
                  {deleteUserMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm Delete"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground border border-black/10 hover:bg-black/[0.03] transition-colors"
                  data-testid="button-cancel-delete"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="glass-panel rounded-2xl px-6 py-5 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Mail className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground" data-testid="text-user-email">{user.email}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <span data-testid="text-user-id">ID: {user.id}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${user.plan === "pro" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`} data-testid="text-user-plan">
                  {user.plan}
                </span>
                {user.emailVerified && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700" data-testid="text-verified">verified</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="glass-panel rounded-xl px-4 py-3 text-center">
            <p className="text-2xl font-bold text-foreground" data-testid="stat-emails-sent">{emailStats.totalSent}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Emails Sent</p>
          </div>
          <div className="glass-panel rounded-xl px-4 py-3 text-center">
            <p className="text-2xl font-bold text-foreground" data-testid="stat-emails-opened">{emailStats.totalOpened}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Opened ({openRate}%)</p>
          </div>
          <div className="glass-panel rounded-xl px-4 py-3 text-center">
            <p className="text-2xl font-bold text-foreground" data-testid="stat-emails-clicked">{emailStats.totalClicked}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Clicked ({clickRate}%)</p>
          </div>
          <div className="glass-panel rounded-xl px-4 py-3 text-center">
            <p className="text-2xl font-bold text-foreground" data-testid="stat-last-email">{formatDate(emailStats.lastEmailDate)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Last Email</p>
          </div>
        </div>

        <div
          ref={tabBarRef}
          className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-black/[0.08] mb-6 -mx-4 px-4 overflow-x-auto hide-scrollbar"
          data-testid="tab-navigation"
        >
          <div className="flex gap-1 min-w-max py-2">
            {TAB_SECTIONS.map(({ key, label, icon: TabIcon }) => (
              <button
                key={key}
                ref={activeTab === key ? activeTabRef : undefined}
                onClick={() => scrollToSection(key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === key
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:bg-black/[0.04] hover:text-foreground"
                }`}
                data-testid={`tab-${key}`}
              >
                <TabIcon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <CollapsibleSection title="Identity & Personal" icon={User} sectionRef={(el) => { sectionRefs.current["identity"] = el; }}>
            <div className="pt-3">
              {editing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Display Name</label>
                      <input
                        data-testid="input-displayName"
                        value={editFields.displayName}
                        onChange={(e) => setEditFields({ ...editFields, displayName: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-black/[0.03] border border-black/[0.06] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Birthday</label>
                      <input
                        data-testid="input-birthday"
                        type="date"
                        value={editFields.birthday}
                        onChange={(e) => setEditFields({ ...editFields, birthday: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-black/[0.03] border border-black/[0.06] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Gender</label>
                      <input
                        data-testid="input-gender"
                        value={editFields.gender}
                        onChange={(e) => setEditFields({ ...editFields, gender: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-black/[0.03] border border-black/[0.06] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Location</label>
                      <input
                        data-testid="input-location"
                        value={editFields.location}
                        onChange={(e) => setEditFields({ ...editFields, location: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-black/[0.03] border border-black/[0.06] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Language</label>
                      <input
                        data-testid="input-language"
                        value={editFields.language}
                        onChange={(e) => setEditFields({ ...editFields, language: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-black/[0.03] border border-black/[0.06] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow label="Email" value={user.email} testId="info-email" />
                  <InfoRow label="Display Name" value={user.displayName} testId="info-displayName" />
                  <InfoRow label="Birthday" value={user.birthday} testId="info-birthday" />
                  <InfoRow label="Gender" value={user.gender} testId="info-gender" />
                  <InfoRow label="Location" value={user.location} testId="info-location" />
                  <InfoRow label="Language" value={user.language} testId="info-language" />
                  <InfoRow label="Google ID" value={user.googleId} testId="info-googleId" />
                </>
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Account Status" icon={Shield} sectionRef={(el) => { sectionRefs.current["account"] = el; }}>
            <div className="pt-3">
              {editing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Plan</label>
                      <select
                        data-testid="select-plan"
                        value={editFields.plan}
                        onChange={(e) => setEditFields({ ...editFields, plan: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-black/[0.03] border border-black/[0.06] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="free">free</option>
                        <option value="pro">pro</option>
                      </select>
                    </div>
                    <div className="flex items-end gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          data-testid="checkbox-emailVerified"
                          type="checkbox"
                          checked={editFields.emailVerified}
                          onChange={(e) => setEditFields({ ...editFields, emailVerified: e.target.checked })}
                          className="rounded"
                        />
                        Email Verified
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          data-testid="checkbox-onboardingCompleted"
                          type="checkbox"
                          checked={editFields.onboardingCompleted}
                          onChange={(e) => setEditFields({ ...editFields, onboardingCompleted: e.target.checked })}
                          className="rounded"
                        />
                        Onboarding Done
                      </label>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow
                    label="Account Status"
                    value={(() => {
                      if (!user.emailVerified) {
                        return <span data-testid="badge-profile-status" className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">Pending Verification</span>;
                      }
                      if (!user.onboardingCompleted) {
                        return <span data-testid="badge-profile-status" className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Pending Onboarding</span>;
                      }
                      return <span data-testid="badge-profile-status" className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Active</span>;
                    })()}
                    testId="info-status"
                  />
                  <InfoRow label="Plan" value={<span className={`px-2 py-0.5 rounded-full text-xs font-medium ${user.plan === "pro" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>{user.plan}</span>} testId="info-plan" />
                  <InfoRow label="Email Verified" value={user.emailVerified ? "Yes" : "No"} testId="info-emailVerified" />
                  <InfoRow label="Onboarding" value={user.onboardingCompleted ? "Completed" : "Not completed"} testId="info-onboarding" />
                  <InfoRow label="Last Login" value={formatDateTime(user.lastLoginAt)} testId="info-lastLogin" />
                  <InfoRow label="Signed Up" value={formatDateTime(user.createdAt)} testId="info-signedUp" />
                  <div className="flex items-center justify-between py-2 border-t border-black/[0.04] mt-2">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Admin Access</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {adminInfo?.isAdmin && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700" data-testid="badge-admin-role">{adminInfo.role}</span>
                      )}
                      {user.email?.endsWith("@podrise.com") ? (
                        <button
                          data-testid="button-admin-toggle"
                          onClick={() => adminToggleMutation.mutate(!adminInfo?.isAdmin)}
                          disabled={adminToggleMutation.isPending}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${adminInfo?.isAdmin ? "bg-purple-500" : "bg-gray-300"} ${adminToggleMutation.isPending ? "opacity-50" : ""}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${adminInfo?.isAdmin ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground" data-testid="text-admin-restricted">@podrise.com only</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Acquisition" icon={Globe} defaultOpen={false} sectionRef={(el) => { sectionRefs.current["acquisition"] = el; }}>
            <div className="pt-3">
              <InfoRow label="Signup Source" value={user.signupSource} testId="info-signupSource" />
              <InfoRow label="Source Detail" value={user.signupSourceDetail} testId="info-signupSourceDetail" />
              <InfoRow label="UTM Source" value={user.utmSource} testId="info-utmSource" />
              <InfoRow label="UTM Medium" value={user.utmMedium} testId="info-utmMedium" />
              <InfoRow label="UTM Campaign" value={user.utmCampaign} testId="info-utmCampaign" />
              <InfoRow label="UTM Content" value={user.utmContent} testId="info-utmContent" />
              <InfoRow label="UTM Term" value={user.utmTerm} testId="info-utmTerm" />
              <InfoRow label="IP Address" value={user.ipAddress} testId="info-ipAddress" />
              <InfoRow label="User Agent" value={<span className="text-xs">{user.userAgent}</span>} testId="info-userAgent" />
              <InfoRow label="Device Type" value={user.deviceType} testId="info-deviceType" />
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Podcasts Following" icon={Podcast} badge={user.podcasts.length} sectionRef={(el) => { sectionRefs.current["podcasts"] = el; }}>
            <div className="pt-3">
              {user.podcasts.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No podcasts</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {user.podcasts.map((p, i) => {
                    let name = p;
                    let slug = "";
                    try {
                      const parsed = JSON.parse(p);
                      if (parsed?.name) name = parsed.name;
                      if (parsed?.slug) slug = parsed.slug;
                    } catch {}
                    return (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 bg-secondary text-foreground px-3 py-1.5 rounded-full text-xs font-medium"
                        data-testid={`podcast-${i}`}
                      >
                        <Podcast className="w-3 h-3 text-primary shrink-0" />
                        {slug ? (
                          <a href={`/podcasts/${slug}`} className="hover:underline" target="_blank" rel="noopener noreferrer">{name}</a>
                        ) : name}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Content Preferences" icon={Tag} defaultOpen={false} sectionRef={(el) => { sectionRefs.current["preferences"] = el; }}>
            <div className="pt-3">
              <InfoRow label="Industries" value={user.industries.length > 0 ? user.industries.join(", ") : null} testId="info-industries" />
              <InfoRow label="Interests" value={user.interests.length > 0 ? user.interests.join(", ") : null} testId="info-interests" />
              <InfoRow label="Roles" value={user.roles.length > 0 ? user.roles.join(", ") : null} testId="info-roles" />
              <InfoRow label="Topic Frequencies" value={
                user.topicFrequencies && Object.keys(user.topicFrequencies).length > 0
                  ? <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(user.topicFrequencies, null, 2)}</pre>
                  : null
              } testId="info-topicFrequencies" />
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Email Settings" icon={Clock} sectionRef={(el) => { sectionRefs.current["email-settings"] = el; }}>
            <div className="pt-3">
              {editing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Delivery Time</label>
                      <input
                        data-testid="input-deliveryTime"
                        type="time"
                        value={editFields.deliveryTime}
                        onChange={(e) => setEditFields({ ...editFields, deliveryTime: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-black/[0.03] border border-black/[0.06] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Timezone</label>
                      <input
                        data-testid="input-deliveryTimezone"
                        value={editFields.deliveryTimezone}
                        onChange={(e) => setEditFields({ ...editFields, deliveryTimezone: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-black/[0.03] border border-black/[0.06] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Vacation Until</label>
                      <input
                        data-testid="input-vacationUntil"
                        type="date"
                        value={editFields.vacationUntil}
                        onChange={(e) => setEditFields({ ...editFields, vacationUntil: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-black/[0.03] border border-black/[0.06] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow label="Delivery Time" value={user.deliveryTime} testId="info-deliveryTime" />
                  <InfoRow label="Timezone" value={user.deliveryTimezone} testId="info-timezone" />
                  <InfoRow label="Vacation Until" value={user.vacationUntil} testId="info-vacationUntil" />
                </>
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Email History" icon={Send} badge={emailStats.totalSent} sectionRef={(el) => { sectionRefs.current["email-history"] = el; }}>
            <div className="pt-3">
              {recentEmails.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No emails sent yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-emails">
                    <thead>
                      <tr className="border-b border-black/[0.06]">
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2">Date</th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2">Subject</th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2">Status</th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2">Opened</th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2">Clicked</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.04]">
                      {recentEmails.map((email) => (
                        <tr key={email.id} data-testid={`row-email-${email.id}`}>
                          <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(email.recapDate)}</td>
                          <td className="py-2 pr-3 text-xs text-foreground max-w-[200px] truncate">{email.subject}</td>
                          <td className="py-2 pr-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              email.status === "sent" ? "bg-green-100 text-green-700" :
                              email.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                              email.status === "failed" ? "bg-red-100 text-red-700" :
                              "bg-gray-100 text-gray-600"
                            }`}>{email.status}</span>
                          </td>
                          <td className="py-2 pr-3">
                            {email.emailOpenedAt ? (
                              <span className="flex items-center gap-1 text-xs text-green-600"><Eye className="w-3 h-3" />{formatDate(email.emailOpenedAt)}</span>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2">
                            {email.firstClickedAt ? (
                              <span className="flex items-center gap-1 text-xs text-blue-600"><MousePointerClick className="w-3 h-3" />{formatDate(email.firstClickedAt)}</span>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Email Clicks" icon={MousePointerClick} badge={emailClicks.length} defaultOpen={false} sectionRef={(el) => { sectionRefs.current["email-clicks"] = el; }}>
            <div className="pt-3">
              {emailClicks.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No clicks recorded</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {emailClicks.map((click) => (
                    <div key={click.id} className="flex items-center justify-between py-1.5 border-b border-black/[0.04] last:border-0" data-testid={`row-click-${click.id}`}>
                      <a href={click.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate max-w-[70%] flex items-center gap-1">
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        {click.url}
                      </a>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(click.clickedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Referral Info" icon={UsersIcon} badge={referralsMade.length} sectionRef={(el) => { sectionRefs.current["referrals"] = el; }}>
            <div className="pt-3">
              <InfoRow label="Referral Code" value={user.referralCode} testId="info-referralCode" />
              <InfoRow
                label="Referred By"
                value={referredByUser ? (
                  <a href={`/admin/users/${referredByUser.id}`} className="text-primary hover:underline" data-testid="link-referrer">
                    {referredByUser.displayName || referredByUser.email} (#{referredByUser.id})
                  </a>
                ) : null}
                testId="info-referredBy"
              />
              <InfoRow label="Referrals Made" value={referralsMade.length} testId="info-referralCount" />
              {referralsMade.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {referralsMade.map((ref) => (
                    <div key={ref.id} className="flex items-center justify-between py-1.5 border-b border-black/[0.04] last:border-0" data-testid={`row-referral-${ref.id}`}>
                      <a href={`/admin/users/${ref.referredUserId}`} className="text-xs text-primary hover:underline">
                        {ref.referredEmail || `User #${ref.referredUserId}`}
                      </a>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ref.status === "verified" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>{ref.status}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(ref.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Bookmarks" icon={Bookmark} badge={bookmarks.length} defaultOpen={false} sectionRef={(el) => { sectionRefs.current["bookmarks"] = el; }}>
            <div className="pt-3">
              {bookmarks.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No bookmarks</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {bookmarks.map((bk) => (
                    <div key={bk.id} className="flex items-center justify-between py-1.5 border-b border-black/[0.04] last:border-0" data-testid={`row-bookmark-${bk.id}`}>
                      <a href={`/podcasts/${bk.podcastSlug}/${bk.episodeSlug}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate max-w-[70%] flex items-center gap-1">
                        <Bookmark className="w-3 h-3 shrink-0" />
                        {bk.podcastSlug} / {bk.episodeSlug}
                      </a>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(bk.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Stripe" icon={CreditCard} defaultOpen={false} sectionRef={(el) => { sectionRefs.current["stripe"] = el; }}>
            <div className="pt-3">
              <InfoRow label="Customer ID" value={user.stripeCustomerId} testId="info-stripeCustomerId" />
              <InfoRow label="Subscription ID" value={user.stripeSubscriptionId} testId="info-stripeSubscriptionId" />
            </div>
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}