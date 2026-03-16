import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Link } from "wouter";
import {
  Copy, MessageSquare, Share2, Check, Lock, Trophy, Users,
  Send, Star, Crown, Gift, Zap, Award, Target, Rocket
} from "lucide-react";
import { SiWhatsapp, SiX, SiLinkedin, SiFacebook } from "react-icons/si";

interface ReferralTier {
  id: number;
  threshold: number;
  rewardName: string;
  rewardDescription: string;
  imageUrl: string | null;
  sortOrder: number;
  active: boolean;
}

interface ReferralStats {
  referralCode: string;
  referralLink: string;
  count: number;
  currentTier: ReferralTier | null;
  nextTier: ReferralTier | null;
  tiers: ReferralTier[];
}

interface LeaderboardEntry {
  userId: number;
  displayName: string;
  count: number;
}

const TIER_ICONS = [Users, Star, Zap, Award, Crown, Rocket, Trophy];
const TIER_COLORS = [
  "from-blue-500 to-blue-600",
  "from-emerald-500 to-emerald-600",
  "from-purple-500 to-purple-600",
  "from-orange-500 to-orange-600",
  "from-pink-500 to-pink-600",
  "from-indigo-500 to-indigo-600",
  "from-yellow-500 to-amber-500",
];

export default function PodSquad() {
  const { data: user } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  useEffect(() => {
    document.title = "The Pod Squad — Referrals Get Rewarded | PodCap";
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    setMeta("property", "og:title", "The Pod Squad — Referrals Get Rewarded | PodCap");
    setMeta("property", "og:description", "Join The Pod Squad! Share PodCap with friends and unlock exclusive rewards as they sign up.");
    setMeta("property", "og:image", "https://podcap.io/podcap-og-image.png");
    setMeta("property", "og:url", "https://podcap.io/pod-squad");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", "The Pod Squad — Referrals Get Rewarded | PodCap");
    setMeta("name", "twitter:description", "Join The Pod Squad! Share PodCap with friends and unlock exclusive rewards.");
    setMeta("name", "twitter:image", "https://podcap.io/podcap-og-image.png");
  }, []);

  const { data: stats, isLoading: statsLoading } = useQuery<ReferralStats>({
    queryKey: ["/api/referrals/my-stats"],
    enabled: !!user,
  });

  const { data: leaderboard } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/referrals/leaderboard"],
  });

  const sendInviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/referrals/send-invite", { email });
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Invite sent!", description: "Your friend will receive an email invitation." });
      setInviteEmail("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  const handleCopyLink = () => {
    if (stats?.referralLink) {
      navigator.clipboard.writeText(stats.referralLink);
      setCopied(true);
      toast({ title: "Link copied!" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareText = `I've been using PodCap to get AI-powered podcast summaries and it's awesome. Check it out!`;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F9F9FB] dark:bg-[#09090B] flex items-center justify-center" data-testid="pod-squad-unauthenticated">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2" data-testid="heading-pod-squad">The Pod Squad</h1>
          <p className="text-[#52525B] dark:text-[#A1A1AA] mb-6">Sign up or log in to start earning rewards by sharing PodCap with friends.</p>
          <div className="flex gap-3 justify-center">
            <Link href="/register" className="px-6 py-3 bg-[#6366F1] text-white rounded-xl font-semibold hover:bg-[#4F46E5] transition-colors" data-testid="link-register">Sign Up</Link>
            <Link href="/login" className="px-6 py-3 border border-[#D4D4D8] dark:border-[#27272A] rounded-xl font-semibold text-foreground hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-colors" data-testid="link-login">Log In</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout hideRightSidebar>
      <div className="min-h-screen bg-[#F9F9FB] dark:bg-[#09090B]" data-testid="pod-squad-page">
        {/* Hero Banner with Reward Tiers */}
        <div
          className="relative overflow-hidden"
          style={{ background: "linear-gradient(145deg, #6366F1, #8B5CF6)" }}
          data-testid="hero-banner"
        >
          <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/[0.06]" />
            <div className="absolute bottom-10 -left-16 w-48 h-48 rounded-full bg-white/[0.04]" />
            <div className="absolute top-1/2 right-1/4 w-32 h-32 rounded-full bg-white/[0.03]" />
          </div>
          <div className="relative z-10 max-w-4xl mx-auto px-4 md:px-8 pt-8 md:pt-10 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.15] text-white/90 text-[13px] font-semibold mb-3" data-testid="badge-pod-squad">
              <Trophy className="w-4 h-4" />
              THE POD SQUAD
            </div>
            <h1 className="text-[1.75rem] md:text-[2.25rem] font-bold text-white leading-[1.1] tracking-[-0.03em] mb-2" data-testid="heading-hero">
              Referrals Get Rewarded
            </h1>
            <p className="text-[15px] md:text-[17px] text-white/80 max-w-lg mx-auto mb-8">
              Share PodCap with friends. As they sign up, you'll unlock exclusive rewards.
            </p>

            {/* Reward Tier Cards - Horizontal Row */}
            {!statsLoading && stats?.tiers && stats.tiers.length > 0 && (
              <div className="pb-8">
                <div className="flex gap-3 md:gap-4 overflow-x-auto pb-2 px-1 justify-start md:justify-center scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {stats.tiers.map((tier, i) => {
                    const isUnlocked = stats.count >= tier.threshold;
                    const isNext = stats.nextTier?.id === tier.id;
                    const Icon = TIER_ICONS[i % TIER_ICONS.length];

                    return (
                      <div
                        key={tier.id}
                        className={`relative flex-shrink-0 w-[120px] md:w-[140px] rounded-2xl p-3 md:p-4 text-center transition-all ${
                          isUnlocked
                            ? "bg-white/[0.25] ring-2 ring-white/40"
                            : isNext
                            ? "bg-white/[0.18] ring-2 ring-white/30"
                            : "bg-white/[0.10]"
                        }`}
                        data-testid={`tier-card-${tier.id}`}
                      >
                        {isUnlocked && (
                          <div className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                            <Check className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                        {isNext && (
                          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-yellow-400 text-yellow-900 text-[10px] font-bold rounded-full uppercase tracking-wide">
                            Next
                          </div>
                        )}
                        <div className={`w-14 h-14 md:w-16 md:h-16 mx-auto mb-2 rounded-xl flex items-center justify-center ${
                          isUnlocked
                            ? "bg-white/[0.3]"
                            : "bg-white/[0.15]"
                        }`}>
                          {tier.imageUrl ? (
                            <img
                              src={tier.imageUrl}
                              alt={tier.rewardName}
                              className={`w-10 h-10 md:w-12 md:h-12 object-contain ${!isUnlocked && !isNext ? "opacity-50 grayscale" : ""}`}
                            />
                          ) : (
                            <Icon className={`w-7 h-7 md:w-8 md:h-8 ${
                              isUnlocked ? "text-white" : isNext ? "text-white/80" : "text-white/40"
                            }`} />
                          )}
                        </div>
                        <p className={`text-[13px] md:text-[14px] font-bold leading-tight mb-1 ${
                          isUnlocked ? "text-white" : isNext ? "text-white/90" : "text-white/50"
                        }`}>
                          {tier.rewardName}
                        </p>
                        <p className={`text-[22px] md:text-[26px] font-extrabold leading-none ${
                          isUnlocked ? "text-white" : isNext ? "text-white/80" : "text-white/40"
                        }`}>
                          {tier.threshold}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Referral Count + Progress Bar */}
        <div className="max-w-3xl mx-auto px-4 md:px-8 -mt-4 relative z-20">
          <div className="rounded-2xl bg-white dark:bg-[#111114] border border-[#ECECEE] dark:border-[#1C1C22] shadow-lg p-4 md:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4" data-testid="referral-count-badge">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#6366F1] flex items-center justify-center">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-[13px] text-[#52525B] dark:text-[#A1A1AA] font-medium">Your Referral Count</p>
                <p className="text-[28px] font-extrabold text-[#09090B] dark:text-white leading-none" data-testid="text-referral-count">{stats?.count ?? 0}</p>
              </div>
            </div>
            {stats?.nextTier && (
              <div className="flex-1 w-full sm:w-auto">
                <div className="flex justify-between text-[13px] mb-1.5">
                  <span className="text-[#52525B] dark:text-[#A1A1AA] font-medium">
                    You're only <span className="font-bold text-[#6366F1]">{stats.nextTier.threshold - stats.count} referrals</span> away from winning
                  </span>
                </div>
                <p className="text-[15px] font-bold text-[#09090B] dark:text-white mb-2">{stats.nextTier.rewardName}!</p>
                <div className="h-2.5 bg-[#F4F4F5] dark:bg-[#1C1C22] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (stats.count / stats.nextTier.threshold) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            {!stats?.nextTier && stats?.count !== undefined && stats.count > 0 && (
              <div className="flex-1">
                <p className="text-[15px] font-bold text-[#6366F1]">All rewards unlocked! You're a legend.</p>
              </div>
            )}
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 space-y-8">
          {/* Share Section */}
          <section data-testid="share-section">
            <h2 className="text-[18px] font-bold text-foreground mb-4">Share Your Link</h2>
            <div className="rounded-2xl bg-white dark:bg-[#111114] border border-[#ECECEE] dark:border-[#1C1C22] p-5 space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={stats?.referralLink || "Loading..."}
                  className="flex-1 text-[15px] text-[#09090B] dark:text-white bg-[#F9F9FB] dark:bg-[#09090B] rounded-xl px-4 py-3 border border-[#ECECEE] dark:border-[#27272A] font-mono text-[13px]"
                  data-testid="input-referral-link"
                />
                <button
                  onClick={handleCopyLink}
                  className="px-5 py-3 bg-[#6366F1] text-white rounded-xl font-semibold flex items-center gap-2 hover:bg-[#4F46E5] transition-colors active:scale-95 whitespace-nowrap"
                  data-testid="button-copy-link"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied!" : "Copy Link"}
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <a
                  href={`sms:?body=${encodeURIComponent(`${shareText} ${stats?.referralLink || ""}`)}`}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#34C759] text-white rounded-xl font-semibold hover:bg-[#2DB84D] transition-colors"
                  data-testid="button-text-friend"
                >
                  <MessageSquare className="w-4 h-4" />
                  Text a Friend
                </a>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${stats?.referralLink || ""}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#25D366] text-white rounded-xl font-semibold hover:bg-[#1EBE5C] transition-colors"
                  data-testid="button-whatsapp"
                >
                  <SiWhatsapp className="w-4 h-4" />
                  WhatsApp
                </a>
              </div>

              <div className="flex gap-2">
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(stats?.referralLink || "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border border-[#ECECEE] dark:border-[#27272A] rounded-xl text-[13px] font-semibold text-foreground hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-colors"
                  data-testid="button-twitter"
                >
                  <SiX className="w-3.5 h-3.5" />
                  Twitter
                </a>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(stats?.referralLink || "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border border-[#ECECEE] dark:border-[#27272A] rounded-xl text-[13px] font-semibold text-foreground hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-colors"
                  data-testid="button-linkedin"
                >
                  <SiLinkedin className="w-3.5 h-3.5" />
                  LinkedIn
                </a>
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(stats?.referralLink || "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border border-[#ECECEE] dark:border-[#27272A] rounded-xl text-[13px] font-semibold text-foreground hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-colors"
                  data-testid="button-facebook"
                >
                  <SiFacebook className="w-3.5 h-3.5" />
                  Facebook
                </a>
              </div>

              <div className="pt-3 border-t border-[#F4F4F5] dark:border-[#1C1C22]">
                <p className="text-[13px] font-semibold text-[#52525B] dark:text-[#A1A1AA] mb-2">Share via Email</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (inviteEmail.trim()) sendInviteMutation.mutate(inviteEmail.trim());
                  }}
                  className="flex gap-2"
                  data-testid="form-email-invite"
                >
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="friend@email.com"
                    className="flex-1 text-[15px] text-[#09090B] dark:text-white bg-[#F9F9FB] dark:bg-[#09090B] rounded-xl px-4 py-2.5 border border-[#ECECEE] dark:border-[#27272A] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 placeholder:text-[#A1A1AA]"
                    data-testid="input-invite-email"
                  />
                  <button
                    type="submit"
                    disabled={sendInviteMutation.isPending}
                    className="px-5 py-2.5 bg-[#6366F1] text-white rounded-xl font-semibold flex items-center gap-2 hover:bg-[#4F46E5] disabled:opacity-50 transition-colors"
                    data-testid="button-send-invite"
                  >
                    <Send className="w-4 h-4" />
                    Send
                  </button>
                </form>
              </div>
            </div>
          </section>

          {/* Leaderboard */}
          <section data-testid="leaderboard-section">
            <h2 className="text-[18px] font-bold text-foreground mb-4">Leaderboard</h2>
            <div className="rounded-2xl bg-white dark:bg-[#111114] border border-[#ECECEE] dark:border-[#1C1C22] overflow-hidden">
              {(!leaderboard || leaderboard.length === 0) ? (
                <div className="px-5 py-8 text-center text-[#A1A1AA]">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-[14px] font-medium">No referrals yet — be the first!</p>
                </div>
              ) : (
                <div className="divide-y divide-[#F4F4F5] dark:divide-[#1C1C22]">
                  {leaderboard.map((entry, i) => (
                    <div
                      key={entry.userId}
                      className="flex items-center gap-3 px-5 py-3"
                      data-testid={`leaderboard-entry-${entry.userId}`}
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0 ${
                        i === 0
                          ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                          : i === 1
                          ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                          : i === 2
                          ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                          : "bg-[#F4F4F5] dark:bg-[#1C1C22] text-[#71717A]"
                      }`}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[14px] font-semibold text-foreground truncate block">
                          {entry.displayName}
                        </span>
                      </div>
                      <span className="text-[14px] font-bold text-[#6366F1]" data-testid={`leaderboard-count-${entry.userId}`}>
                        {entry.count} {entry.count === 1 ? "referral" : "referrals"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <p className="text-center text-[12px] text-[#A1A1AA] dark:text-[#52525B]">
            * By participating in the Referral Program, you agree to abide by these <Link href="/terms" className="underline hover:text-[#6366F1]">Referral Program Terms and Conditions</Link>.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
