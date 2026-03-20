import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Link } from "wouter";
import {
  Copy, Check, Trophy, Users,
  Star, Crown, Zap, Award,
  Mail
} from "lucide-react";
import { SiWhatsapp, SiX, SiLinkedin } from "react-icons/si";

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
  pendingCount: number;
  currentTier: ReferralTier | null;
  nextTier: ReferralTier | null;
  tiers: ReferralTier[];
}

interface LeaderboardEntry {
  userId: number;
  displayName: string;
  count: number;
}

const TIER_EMOJIS = ["⭐", "⚡", "🏅", "👑", "🏆"];

const SHARE_CHANNELS = [
  {
    key: "imessage",
    label: "iMessage",
    icon: "💬",
    bg: "bg-[#34C759]",
    getHref: (link: string, text: string) =>
      `sms:?body=${encodeURIComponent(`${text} ${link}`)}`,
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    icon: null,
    iconComponent: SiWhatsapp,
    bg: "bg-[#25D366]",
    getHref: (link: string, text: string) =>
      `https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`,
  },
  {
    key: "x",
    label: "X",
    icon: null,
    iconComponent: SiX,
    bg: "bg-[#09090B] dark:bg-[#E4E4E7]",
    iconClass: "text-white dark:text-[#09090B]",
    getHref: (link: string, text: string) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`,
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    icon: null,
    iconComponent: SiLinkedin,
    bg: "bg-[#0A66C2]",
    getHref: (link: string) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`,
  },
  {
    key: "gmail",
    label: "Gmail",
    icon: "✉️",
    bg: "bg-[#EA4335]",
    getHref: (link: string, text: string) =>
      `https://mail.google.com/mail/?view=cm&body=${encodeURIComponent(`${text} ${link}`)}&su=${encodeURIComponent("Check out PodRise")}`,
  },
  {
    key: "outlook",
    label: "Outlook",
    icon: "📧",
    bg: "bg-[#0078D4]",
    getHref: (link: string, text: string) =>
      `https://outlook.live.com/mail/0/deeplink/compose?body=${encodeURIComponent(`${text} ${link}`)}&subject=${encodeURIComponent("Check out PodRise")}`,
  },
  {
    key: "yahoo",
    label: "Yahoo",
    icon: "📨",
    bg: "bg-[#6001D2]",
    getHref: (link: string, text: string) =>
      `https://compose.mail.yahoo.com/?body=${encodeURIComponent(`${text} ${link}`)}&subject=${encodeURIComponent("Check out PodRise")}`,
  },
  {
    key: "mail",
    label: "Mail",
    icon: null,
    iconComponent: Mail,
    bg: "bg-[#52525B]",
    getHref: (link: string, text: string) =>
      `mailto:?body=${encodeURIComponent(`${text} ${link}`)}&subject=${encodeURIComponent("Check out PodRise")}`,
  },
];

const AVATAR_COLORS = [
  "bg-[#6366F1] text-white",
  "bg-[#EC4899] text-white",
  "bg-[#F59E0B] text-white",
  "bg-[#10B981] text-white",
  "bg-[#8B5CF6] text-white",
  "bg-[#EF4444] text-white",
  "bg-[#3B82F6] text-white",
  "bg-[#14B8A6] text-white",
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function PodSquad() {
  const { data: user } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.title = "The Pod Squad — Referrals Get Rewarded | PodRise";
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    setMeta("property", "og:title", "The Pod Squad — Referrals Get Rewarded | PodRise");
    setMeta("property", "og:description", "Join The Pod Squad! Share PodRise with friends and unlock exclusive rewards as they sign up.");
    setMeta("property", "og:image", "https://podrise.com/podrise-og-image.png");
    setMeta("property", "og:url", "https://podrise.com/pod-squad");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", "The Pod Squad — Referrals Get Rewarded | PodRise");
    setMeta("name", "twitter:description", "Join The Pod Squad! Share PodRise with friends and unlock exclusive rewards.");
    setMeta("name", "twitter:image", "https://podrise.com/podrise-og-image.png");
  }, []);

  const { data: stats, isLoading: statsLoading } = useQuery<ReferralStats>({
    queryKey: ["/api/referrals/my-stats"],
    enabled: !!user,
  });

  const { data: leaderboard } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/referrals/leaderboard"],
  });

  const handleCopyLink = () => {
    if (stats?.referralLink) {
      navigator.clipboard.writeText(stats.referralLink);
      setCopied(true);
      toast({ title: "Link copied!" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareText = `Have you seen this? Tracks your favorite podcasts and sends you the key takeaways without listening. Free:`;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F9F9FB] dark:bg-[#09090B] flex items-center justify-center" data-testid="pod-squad-unauthenticated">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2" data-testid="heading-pod-squad">The Pod Squad</h1>
          <p className="text-[#52525B] dark:text-[#A1A1AA] mb-6">Sign up or log in to start earning rewards by sharing PodRise with friends.</p>
          <div className="flex gap-3 justify-center">
            <Link href="/register" className="px-6 py-3 bg-[#6366F1] text-white rounded-xl font-semibold hover:bg-[#4F46E5] transition-colors" data-testid="link-register">Sign Up</Link>
            <Link href="/login" className="px-6 py-3 border border-[#D4D4D8] dark:border-[#27272A] rounded-xl font-semibold text-foreground hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-colors" data-testid="link-login">Log In</Link>
          </div>
        </div>
      </div>
    );
  }

  const renderLeaderboard = (variant: "sidebar" | "mobile") => {
    const suffix = variant === "sidebar" ? "-sidebar" : "-mobile";
    return (
      <div data-testid={`leaderboard-section${suffix}`}>
        <div className="rounded-2xl bg-white dark:bg-[#111114] border border-[#ECECEE] dark:border-[#1C1C22] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#F4F4F5] dark:border-[#1C1C22]">
            <h2 className="text-[16px] font-bold text-foreground flex items-center gap-2" data-testid={`heading-leaderboard${suffix}`}>
              <Trophy className="w-4 h-4 text-[#F59E0B]" />
              Leaderboard
            </h2>
          </div>

          {(!leaderboard || leaderboard.length === 0) ? (
            <div className="px-5 py-10 text-center text-[#A1A1AA]">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-[15px] font-semibold text-foreground mb-1" data-testid={`text-leaderboard-empty${suffix}`}>No referrals yet</p>
              <p className="text-[13px]">Be the first to share and climb the board!</p>
            </div>
          ) : (
            <div className="divide-y divide-[#F4F4F5] dark:divide-[#1C1C22]">
              {leaderboard.map((entry, i) => {
                const isCurrentUser = entry.userId === (user as any)?.id;
                const rankStyle =
                  i === 0
                    ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 ring-1 ring-yellow-300 dark:ring-yellow-700"
                    : i === 1
                    ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 ring-1 ring-gray-300 dark:ring-gray-600"
                    : i === 2
                    ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 ring-1 ring-orange-300 dark:ring-orange-700"
                    : "bg-[#F4F4F5] dark:bg-[#1C1C22] text-[#71717A]";
                const avatarColor = AVATAR_COLORS[i % AVATAR_COLORS.length];

                return (
                  <div
                    key={entry.userId}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                      isCurrentUser ? "bg-[#6366F1]/[0.06] dark:bg-[#6366F1]/[0.1]" : ""
                    }`}
                    data-testid={`leaderboard-entry-${entry.userId}${suffix}`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${rankStyle}`}>
                      {i + 1}
                    </div>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0 ${avatarColor}`}>
                      {getInitials(entry.displayName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[13px] font-semibold truncate ${isCurrentUser ? "text-[#6366F1]" : "text-foreground"}`}>
                          {entry.displayName}
                        </span>
                        {isCurrentUser && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#6366F1] text-white flex-shrink-0" data-testid={`badge-you-${entry.userId}${suffix}`}>
                            You
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[13px] font-bold text-[#6366F1] flex-shrink-0" data-testid={`leaderboard-count-${entry.userId}${suffix}`}>
                      {entry.count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const leaderboardSidebar = (
    <aside
      className="w-[312px] flex-shrink-0 bg-[#F7F7FC] dark:bg-[#09090B] flex flex-col h-screen sticky top-0"
      data-testid="right-sidebar"
    >
      <div className="flex-1 overflow-y-auto px-4 py-[14px] hide-scrollbar">
        {renderLeaderboard("sidebar")}
      </div>
    </aside>
  );

  return (
    <DashboardLayout customRightSidebar={leaderboardSidebar}>
      <div className="min-h-screen bg-[#F9F9FB] dark:bg-[#09090B] pb-24 md:pb-8" data-testid="pod-squad-page">
        <div className="px-4 md:px-6 py-6 md:py-8 space-y-6">
          {/* Hero Banner */}
          <div
            className="relative overflow-hidden rounded-2xl"
            style={{ background: "linear-gradient(145deg, #6366F1, #8B5CF6)" }}
            data-testid="hero-banner"
          >
            <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
              <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-white/[0.06]" />
              <div className="absolute bottom-8 -left-12 w-36 h-36 rounded-full bg-white/[0.04]" />
            </div>
            <div className="relative z-10 p-6 md:p-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.15] text-white/90 text-[12px] font-semibold mb-3" data-testid="badge-pod-squad">
                <Trophy className="w-3.5 h-3.5" />
                THE POD SQUAD
              </div>
              <h1 className="text-[1.5rem] md:text-[1.75rem] font-bold text-white leading-[1.15] tracking-[-0.02em] mb-2" data-testid="heading-hero">
                Refer friends. Get gear.
              </h1>
              <p className="text-[14px] md:text-[15px] text-white/75 mb-5 leading-relaxed max-w-md">
                Share PodRise with friends. As they sign up, you'll unlock exclusive rewards.
              </p>
              {!statsLoading && (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.2] backdrop-blur-sm" data-testid="stat-pill-referrals">
                  <Users className="w-4 h-4 text-white/80" />
                  <span className="text-[14px] font-bold text-white" data-testid="text-referral-count">{stats?.count ?? 0}</span>
                  <span className="text-[13px] text-white/70">referral{(stats?.count ?? 0) !== 1 ? "s" : ""}</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Reward Tiers */}
            {!statsLoading && stats?.tiers && stats.tiers.length > 0 && (
              <div className="rounded-2xl bg-white dark:bg-[#111114] border border-[#ECECEE] dark:border-[#1C1C22] p-5 md:p-6" data-testid="tier-list">
                <h2 className="text-[15px] font-bold text-foreground mb-3 flex items-center gap-2">
                  <Star className="w-4 h-4 text-[#F59E0B]" />
                  Reward Tiers
                </h2>
                <div className="space-y-2">
                  {stats.tiers.map((tier, i) => {
                    const isUnlocked = stats.count >= tier.threshold;
                    const isNext = stats.nextTier?.id === tier.id;
                    const emoji = TIER_EMOJIS[i % TIER_EMOJIS.length];

                    return (
                      <div
                        key={tier.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                          isNext
                            ? "bg-[#EEF2FF] dark:bg-[#6366F1]/10 ring-1 ring-[#6366F1]/30"
                            : isUnlocked
                            ? "bg-[#F0FDF4] dark:bg-green-900/10"
                            : "bg-[#F9F9FB] dark:bg-[#09090B]"
                        }`}
                        data-testid={`tier-card-${tier.id}`}
                      >
                        <span className="text-[18px] flex-shrink-0">{emoji}</span>
                        <span className={`text-[13px] font-semibold flex-1 min-w-0 truncate ${
                          isUnlocked || isNext ? "text-foreground" : "text-[#A1A1AA]"
                        }`}>
                          {tier.rewardName}
                        </span>
                        <span className={`text-[12px] font-bold flex-shrink-0 ${
                          isUnlocked ? "text-green-600 dark:text-green-400" : isNext ? "text-[#6366F1]" : "text-[#A1A1AA]"
                        }`}>
                          {tier.threshold} refs
                        </span>
                        {isNext && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#6366F1] text-white uppercase tracking-wide flex-shrink-0" data-testid={`tier-up-next-${tier.id}`}>
                            Up next
                          </span>
                        )}
                        {isUnlocked && (
                          <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Share Card */}
            <div className="rounded-2xl bg-white dark:bg-[#111114] border border-[#ECECEE] dark:border-[#1C1C22] p-5 md:p-6" data-testid="share-section">
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#F9F9FB] dark:bg-[#09090B] border border-[#ECECEE] dark:border-[#27272A] cursor-pointer group hover:border-[#6366F1]/40 transition-colors mb-6"
                onClick={handleCopyLink}
                data-testid="input-referral-link"
              >
                <span className="flex-1 text-[13px] font-mono text-[#52525B] dark:text-[#A1A1AA] truncate">
                  {stats?.referralLink || "Loading..."}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[12px] font-semibold transition-all ${
                    copied
                      ? "bg-green-500 text-white"
                      : "bg-[#6366F1] text-white group-hover:bg-[#4F46E5]"
                  }`}
                  data-testid="button-copy-link"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied!" : "Copy"}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-5" data-testid="share-channels">
                {SHARE_CHANNELS.map((channel) => {
                  const href = channel.getHref(stats?.referralLink || "", shareText);
                  const isExternal = href.startsWith("http");
                  const IconComp = channel.iconComponent;
                  return (
                    <a
                      key={channel.key}
                      href={href}
                      target={isExternal ? "_blank" : undefined}
                      rel={isExternal ? "noopener noreferrer" : undefined}
                      className="flex flex-col items-center gap-1.5 group/icon"
                      data-testid={`share-${channel.key}`}
                    >
                      <div className={`w-10 h-10 rounded-xl ${channel.bg} flex items-center justify-center transition-transform group-hover/icon:scale-110`}>
                        {channel.icon ? (
                          <span className="text-[18px]">{channel.icon}</span>
                        ) : IconComp ? (
                          <IconComp className={`w-4.5 h-4.5 ${channel.iconClass || "text-white"}`} style={{ width: 18, height: 18 }} />
                        ) : null}
                      </div>
                      <span className="text-[11px] font-medium text-[#71717A] dark:text-[#A1A1AA]">{channel.label}</span>
                    </a>
                  );
                })}
              </div>

              <p className="text-[11px] text-[#A1A1AA] dark:text-[#52525B]">
                By participating in the Referral Program, you agree to abide by these{" "}
                <Link href="/terms" className="underline hover:text-[#6366F1] transition-colors" data-testid="link-referral-terms">Referral Program Terms and Conditions</Link>.
              </p>
            </div>
          </div>

          <div className="xl:hidden">
            {renderLeaderboard("mobile")}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
