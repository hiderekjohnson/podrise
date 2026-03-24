import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Save, Users, Trophy, Edit2, Upload, ExternalLink, BarChart3, TrendingUp, UserPlus, CheckCircle, Gift, Package, Check, Undo2 } from "lucide-react";

interface ReferralTier {
  id: number;
  threshold: number;
  rewardName: string;
  rewardDescription: string;
  imageUrl: string | null;
  sortOrder: number;
  active: boolean;
}

interface TierFormData {
  threshold: number;
  rewardName: string;
  rewardDescription: string;
  imageUrl: string;
  sortOrder: number;
  active: boolean;
}

interface LeaderboardEntry {
  userId: number;
  displayName: string | null;
  email: string;
  count: number;
  currentTier: { name: string; threshold: number } | null;
}

interface ReferralStatsData {
  totalReferrals: number;
  verifiedReferrals: number;
  pendingReferrals: number;
  conversionRate: number;
  activeReferrers: number;
  totalUsers: number;
  referredUsers: number;
  last7Days: number;
  topChannels: { source: string | null; count: number }[];
}

interface FulfillmentUser {
  fulfillmentId: number;
  userId: number;
  email: string;
  displayName: string | null;
  status: "unsent" | "sent";
  sentAt: string | null;
  createdAt: string;
  referralCount: number;
}

interface FulfillmentTier {
  tier: { id: number; threshold: number; rewardName: string; imageUrl: string | null };
  users: FulfillmentUser[];
}

export default function AdminReferrals() {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<"stats" | "tiers" | "leaderboard" | "fulfillment">("stats");
  const [editingTier, setEditingTier] = useState<ReferralTier | null>(null);
  const [newTier, setNewTier] = useState(false);
  const [form, setForm] = useState<TierFormData>({ threshold: 0, rewardName: "", rewardDescription: "", imageUrl: "", sortOrder: 0, active: true });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: referralStats, isLoading: statsLoading } = useQuery<ReferralStatsData>({
    queryKey: ["/api/admin/referral-stats"],
  });

  const { data: tiers, isLoading: tiersLoading } = useQuery<ReferralTier[]>({
    queryKey: ["/api/admin/referral-tiers"],
  });

  const { data: leaderboard, isLoading: leaderboardLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/admin/referral-leaderboard"],
  });

  const { data: fulfillmentData, isLoading: fulfillmentLoading } = useQuery<FulfillmentTier[]>({
    queryKey: ["/api/admin/referral-fulfillments"],
    enabled: subTab === "fulfillment",
  });

  const toggleFulfillmentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "sent" | "unsent" }) => {
      const res = await apiRequest("PATCH", `/api/admin/referral-fulfillments/${id}`, { status });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referral-fulfillments"] });
      toast({ title: "Status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update", variant: "destructive" });
    },
  });

  const createTierMutation = useMutation({
    mutationFn: async (data: TierFormData) => {
      const res = await apiRequest("POST", "/api/admin/referral-tiers", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referral-tiers"] });
      toast({ title: "Tier created" });
      setNewTier(false);
      resetForm();
    },
  });

  const updateTierMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<TierFormData> }) => {
      const res = await apiRequest("PATCH", `/api/admin/referral-tiers/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referral-tiers"] });
      toast({ title: "Tier updated" });
      setEditingTier(null);
      resetForm();
    },
  });

  const deleteTierMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/referral-tiers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referral-tiers"] });
      toast({ title: "Tier deleted" });
    },
  });

  const resetForm = () => setForm({ threshold: 0, rewardName: "", rewardDescription: "", imageUrl: "", sortOrder: 0, active: true });

  const startEdit = (tier: ReferralTier) => {
    setEditingTier(tier);
    setNewTier(false);
    setForm({
      threshold: tier.threshold,
      rewardName: tier.rewardName,
      rewardDescription: tier.rewardDescription ?? "",
      imageUrl: tier.imageUrl || "",
      sortOrder: tier.sortOrder,
      active: tier.active,
    });
  };

  const handleSave = () => {
    const data = { ...form, imageUrl: form.imageUrl || null };
    if (editingTier) {
      updateTierMutation.mutate({ id: editingTier.id, data: data as any });
    } else {
      createTierMutation.mutate({ ...form, imageUrl: form.imageUrl || "" });
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Image must be under 5MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      if (editingTier) {
        formData.append("tierId", String(editingTier.id));
      }
      const res = await fetch("/api/admin/referral-tiers/upload-image", { method: "POST", body: formData });
      if (res.ok) {
        const result = await res.json() as { imageUrl: string };
        setForm({ ...form, imageUrl: result.imageUrl });
        toast({ title: "Image uploaded" });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/referral-tiers"] });
      } else {
        const err = await res.json().catch(() => ({ message: "Upload failed" })) as { message: string };
        toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4" data-testid="admin-referrals">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setSubTab("stats")}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            subTab === "stats" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid="subtab-stats"
        >
          <BarChart3 className="w-4 h-4 inline mr-1.5" />
          Overview
        </button>
        <button
          onClick={() => setSubTab("tiers")}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            subTab === "tiers" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid="subtab-tiers"
        >
          <Trophy className="w-4 h-4 inline mr-1.5" />
          Tiers
        </button>
        <button
          onClick={() => setSubTab("leaderboard")}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            subTab === "leaderboard" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid="subtab-leaderboard"
        >
          <Users className="w-4 h-4 inline mr-1.5" />
          Leaderboard
        </button>
        <button
          onClick={() => setSubTab("fulfillment")}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            subTab === "fulfillment" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid="subtab-fulfillment"
        >
          <Gift className="w-4 h-4 inline mr-1.5" />
          Fulfillment
        </button>
      </div>

      {subTab === "stats" && (
        <div className="space-y-4" data-testid="referral-stats-section">
          {statsLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : referralStats ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl border p-4 bg-white dark:bg-[#111114]" data-testid="stat-total-referrals">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold mb-1">
                    <UserPlus className="w-3.5 h-3.5" />
                    Total Referrals
                  </div>
                  <div className="text-2xl font-bold text-foreground">{referralStats.totalReferrals}</div>
                  <div className="text-xs text-muted-foreground mt-1">{referralStats.last7Days} in last 7 days</div>
                </div>
                <div className="rounded-xl border p-4 bg-white dark:bg-[#111114]" data-testid="stat-verified">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold mb-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Verified
                  </div>
                  <div className="text-2xl font-bold text-green-600">{referralStats.verifiedReferrals}</div>
                  <div className="text-xs text-muted-foreground mt-1">{referralStats.pendingReferrals} pending</div>
                </div>
                <div className="rounded-xl border p-4 bg-white dark:bg-[#111114]" data-testid="stat-conversion">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold mb-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    Conversion Rate
                  </div>
                  <div className="text-2xl font-bold text-foreground">{referralStats.conversionRate}%</div>
                  <div className="text-xs text-muted-foreground mt-1">verified / total</div>
                </div>
                <div className="rounded-xl border p-4 bg-white dark:bg-[#111114]" data-testid="stat-referrers">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold mb-1">
                    <Users className="w-3.5 h-3.5" />
                    Active Referrers
                  </div>
                  <div className="text-2xl font-bold text-foreground">{referralStats.activeReferrers}</div>
                  <div className="text-xs text-muted-foreground mt-1">{referralStats.referredUsers} of {referralStats.totalUsers} users referred</div>
                </div>
              </div>

              {referralStats.topChannels.length > 0 && (
                <div className="rounded-xl border p-4 bg-white dark:bg-[#111114]" data-testid="stat-channels">
                  <h3 className="text-sm font-bold text-foreground mb-3">Top Referral Channels</h3>
                  <div className="space-y-2">
                    {referralStats.topChannels.map((ch, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-sm text-foreground capitalize">{ch.source || "Unknown"}</span>
                        <span className="text-sm font-bold text-primary">{ch.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {subTab === "tiers" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold">Reward Tiers</h3>
            <button
              onClick={() => { setNewTier(true); setEditingTier(null); resetForm(); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
              data-testid="button-add-tier"
            >
              <Plus className="w-4 h-4" />
              Add Tier
            </button>
          </div>

          {(newTier || editingTier) && (
            <div className="bg-white dark:bg-[#111114] border border-[#ECECEE] dark:border-[#1C1C22] rounded-xl p-4 space-y-3" data-testid="tier-form">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Threshold</label>
                  <input type="number" value={form.threshold} onChange={e => setForm({ ...form, threshold: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-[#ECECEE] dark:border-[#27272A] rounded-lg text-sm bg-background" data-testid="input-tier-threshold" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Sort Order</label>
                  <input type="number" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-[#ECECEE] dark:border-[#27272A] rounded-lg text-sm bg-background" data-testid="input-tier-sort" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Reward Name</label>
                <input type="text" value={form.rewardName} onChange={e => setForm({ ...form, rewardName: e.target.value })}
                  className="w-full px-3 py-2 border border-[#ECECEE] dark:border-[#27272A] rounded-lg text-sm bg-background" data-testid="input-tier-name" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Description</label>
                <input type="text" value={form.rewardDescription} onChange={e => setForm({ ...form, rewardDescription: e.target.value })}
                  className="w-full px-3 py-2 border border-[#ECECEE] dark:border-[#27272A] rounded-lg text-sm bg-background" data-testid="input-tier-desc" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Reward Image</label>
                <div className="flex gap-2 items-center">
                  <input type="text" value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })}
                    placeholder="https://... or upload"
                    className="flex-1 px-3 py-2 border border-[#ECECEE] dark:border-[#27272A] rounded-lg text-sm bg-background" data-testid="input-tier-image" />
                  <input type="file" ref={fileInputRef} accept="image/*" onChange={handleImageUpload} className="hidden" />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-2 border border-[#ECECEE] dark:border-[#27272A] rounded-lg text-sm font-semibold hover:bg-muted/50 disabled:opacity-50"
                    data-testid="button-upload-image"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Upload
                  </button>
                </div>
                {form.imageUrl && (
                  <div className="mt-2 flex items-center gap-2">
                    <img src={form.imageUrl} alt="Tier reward" className="w-12 h-12 rounded-lg object-cover border border-[#ECECEE] dark:border-[#27272A]" />
                    <button onClick={() => setForm({ ...form, imageUrl: "" })} className="text-xs text-red-500 hover:underline">Remove</button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="tier-active" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })}
                  className="rounded" data-testid="input-tier-active" />
                <label htmlFor="tier-active" className="text-sm font-medium">Active</label>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={createTierMutation.isPending || updateTierMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
                  data-testid="button-save-tier">
                  <Save className="w-4 h-4" /> {editingTier ? "Update" : "Create"}
                </button>
                <button onClick={() => { setNewTier(false); setEditingTier(null); resetForm(); }}
                  className="px-4 py-2 border border-[#ECECEE] dark:border-[#27272A] rounded-lg text-sm font-semibold"
                  data-testid="button-cancel-tier">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {tiersLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-2">
              {tiers?.map(tier => (
                <div key={tier.id} className="flex items-center gap-3 bg-white dark:bg-[#111114] border border-[#ECECEE] dark:border-[#1C1C22] rounded-xl p-3" data-testid={`admin-tier-${tier.id}`}>
                  {tier.imageUrl ? (
                    <img src={tier.imageUrl} alt={tier.rewardName} className="w-8 h-8 rounded-lg object-cover" />
                  ) : (
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${tier.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {tier.threshold}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-bold block">{tier.rewardName}</span>
                    <span className="text-xs text-muted-foreground">{tier.rewardDescription}</span>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tier.active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                    {tier.active ? "Active" : "Inactive"}
                  </span>
                  <button onClick={() => startEdit(tier)} className="p-1.5 hover:bg-muted rounded-lg" data-testid={`button-edit-tier-${tier.id}`}>
                    <Edit2 className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button onClick={() => { if (confirm("Delete this tier?")) deleteTierMutation.mutate(tier.id); }}
                    className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" data-testid={`button-delete-tier-${tier.id}`}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === "leaderboard" && (
        <div>
          <h3 className="text-lg font-bold mb-4">Referral Leaderboard</h3>
          {leaderboardLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : !leaderboard || leaderboard.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No referrals recorded yet.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#111114] border border-[#ECECEE] dark:border-[#1C1C22] rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F4F4F5] dark:border-[#1C1C22]">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Rank</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">User</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Current Tier</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Referrals</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4F4F5] dark:divide-[#1C1C22]">
                  {leaderboard.map((entry, i) => (
                    <tr key={entry.userId} className="hover:bg-muted/30" data-testid={`admin-leaderboard-${entry.userId}`}>
                      <td className="px-4 py-2.5 font-bold text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <div>
                            <span className="font-semibold">{entry.displayName || "—"}</span>
                            <span className="text-muted-foreground ml-1.5">{entry.email}</span>
                          </div>
                          <a
                            href={`/admin?tab=users&userId=${entry.userId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-primary transition-colors"
                            title="View user in Admin"
                            data-testid={`link-user-${entry.userId}`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {entry.currentTier ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                            <Trophy className="w-3 h-3" />
                            {entry.currentTier.name}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-primary">{entry.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === "fulfillment" && (
        <div className="space-y-6" data-testid="fulfillment-section">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Gift Fulfillment</h3>
            <p className="text-xs text-muted-foreground">Mark gifts as sent when shipped</p>
          </div>

          {fulfillmentLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : !fulfillmentData || fulfillmentData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Gift className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No tier achievements yet</p>
              <p className="text-xs mt-1">Users will appear here when they hit referral milestones</p>
            </div>
          ) : (
            fulfillmentData.map(({ tier, users }) => {
              const unsentCount = users.filter(u => u.status === "unsent").length;
              return (
                <div key={tier.id} className="rounded-xl border border-[#ECECEE] dark:border-[#1C1C22] overflow-hidden" data-testid={`fulfillment-tier-${tier.id}`}>
                  <div className="flex items-center gap-3 px-4 py-3 bg-[#FAFAFA] dark:bg-[#0C0C10] border-b border-[#ECECEE] dark:border-[#1C1C22]">
                    {tier.imageUrl ? (
                      <img src={tier.imageUrl} alt={tier.rewardName} className="w-8 h-8 rounded-lg object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Package className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-bold text-foreground">{tier.rewardName}</span>
                      <span className="text-xs text-muted-foreground ml-2">{tier.threshold} referrals</span>
                    </div>
                    {unsentCount > 0 && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" data-testid={`unsent-badge-${tier.id}`}>
                        {unsentCount} unsent
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{users.length} total</span>
                  </div>

                  {users.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      No users have reached this tier yet
                    </div>
                  ) : (
                    <div className="divide-y divide-[#F4F4F5] dark:divide-[#1C1C22]">
                      {users.map(user => (
                        <div key={user.fulfillmentId} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20" data-testid={`fulfillment-user-${user.fulfillmentId}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-foreground truncate">{user.displayName || user.email}</span>
                              {user.displayName && <span className="text-xs text-muted-foreground truncate">{user.email}</span>}
                              <a
                                href={`/admin?tab=users&userId=${user.userId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-0.5 hover:bg-muted rounded text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
                                data-testid={`fulfillment-link-user-${user.userId}`}
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-xs text-muted-foreground">
                                {user.referralCount} referrals
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Achieved {new Date(user.createdAt).toLocaleDateString()}
                              </span>
                              {user.sentAt && (
                                <span className="text-xs text-muted-foreground">
                                  Sent {new Date(user.sentAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>

                          <button
                            onClick={() => toggleFulfillmentMutation.mutate({
                              id: user.fulfillmentId,
                              status: user.status === "unsent" ? "sent" : "unsent",
                            })}
                            disabled={toggleFulfillmentMutation.isPending}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                              user.status === "sent"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50"
                                : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50"
                            }`}
                            data-testid={`fulfillment-toggle-${user.fulfillmentId}`}
                          >
                            {user.status === "sent" ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                Sent
                              </>
                            ) : (
                              <>
                                <Gift className="w-3.5 h-3.5" />
                                Mark Sent
                              </>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
