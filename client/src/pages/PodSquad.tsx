import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Link } from "wouter";
import {
  Copy, MessageSquare, Check, Lock, Trophy, Users,
  Send, Star, Crown, Zap, Award, Target, Rocket,
  BookUser, ChevronRight
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

const DEFAULT_INVITE_MESSAGE = `Hey, I highly recommend checking out PodCap — it's an awesome platform that gives you AI-powered summaries of the best podcasts. It saves me hours every week staying on top of great conversations. Best of all, it's free! Give it a try using my personal invite link below:`;

export default function PodSquad() {
  const { data: user } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [inviteEmails, setInviteEmails] = useState("");
  const [inviteMessage, setInviteMessage] = useState(DEFAULT_INVITE_MESSAGE);
  const [showContactsPicker, setShowContactsPicker] = useState(false);

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
    mutationFn: async (emails: string) => {
      const emailList = emails.split(",").map(e => e.trim()).filter(Boolean);
      const results = [];
      for (const email of emailList) {
        const res = await apiRequest("POST", "/api/referrals/send-invite", { email });
        results.push(await res.json());
      }
      return results;
    },
    onSuccess: (results) => {
      toast({ title: "Invites sent!", description: `${results.length} invitation${results.length > 1 ? "s" : ""} sent successfully.` });
      setInviteEmails("");
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

  const handleAddContacts = async () => {
    if ("contacts" in navigator && "ContactsManager" in window) {
      try {
        const contacts = await (navigator as any).contacts.select(["email"], { multiple: true });
        const emails = contacts
          .flatMap((c: any) => c.email || [])
          .filter(Boolean)
          .join(", ");
        if (emails) {
          setInviteEmails(prev => prev ? `${prev}, ${emails}` : emails);
          toast({ title: "Contacts added!" });
        }
      } catch {
        toast({ title: "Could not access contacts", variant: "destructive" });
      }
    } else {
      setShowContactsPicker(true);
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
          <div className="relative z-10 max-w-5xl mx-auto px-4 md:px-8 pt-8 md:pt-10 text-center">
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

            {!statsLoading && stats?.tiers && stats.tiers.length > 0 && (
              <div className="pb-8">
                <div className="flex gap-3 md:gap-4 overflow-x-auto pb-2 px-1 justify-start md:justify-center" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
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
                          isUnlocked ? "bg-white/[0.3]" : "bg-white/[0.15]"
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
                <p className="text-[12px] text-white/50 mt-3">
                  * By participating in the Referral Program, you agree to abide by these{" "}
                  <Link href="/terms" className="underline hover:text-white/80">Referral Program Terms and Conditions</Link>.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Referral Count Banner */}
        <div className="max-w-5xl mx-auto px-4 md:px-8 -mt-4 relative z-20">
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
                <p className="text-[13px] text-[#52525B] dark:text-[#A1A1AA] font-medium mb-0.5">
                  You're only <span className="font-bold text-[#6366F1]">{stats.nextTier.threshold - stats.count} referrals</span> away from winning
                </p>
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

        {/* Two Column: Share (left) + Leaderboard (right) */}
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left Column - Share */}
            <div className="lg:col-span-3 space-y-6">
              {/* Share your link */}
              <section data-testid="share-section">
                <h2 className="text-[18px] font-bold text-foreground mb-1">Share your link</h2>
                <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] mb-4">Rack up referrals by sharing your unique link.</p>
                <div className="rounded-2xl bg-white dark:bg-[#111114] border border-[#ECECEE] dark:border-[#1C1C22] p-5 space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={stats?.referralLink || "Loading..."}
                      className="flex-1 text-[#09090B] dark:text-white bg-[#F9F9FB] dark:bg-[#09090B] rounded-xl px-4 py-3 border border-[#ECECEE] dark:border-[#27272A] font-mono text-[13px]"
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
                </div>
              </section>

              {/* Share via email */}
              <section data-testid="email-invite-section">
                <h2 className="text-[18px] font-bold text-foreground mb-1">Share via email</h2>
                <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] mb-4">
                  Invite people to subscribe to PodCap by entering their emails. (We'll automatically add your referral link!)
                </p>
                <div className="rounded-2xl bg-white dark:bg-[#111114] border border-[#ECECEE] dark:border-[#1C1C22] p-5 space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inviteEmails}
                      onChange={(e) => setInviteEmails(e.target.value)}
                      placeholder="To: (enter contact's email)"
                      className="flex-1 text-[15px] text-[#09090B] dark:text-white bg-[#F9F9FB] dark:bg-[#09090B] rounded-xl px-4 py-3 border border-[#ECECEE] dark:border-[#27272A] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 placeholder:text-[#A1A1AA]"
                      data-testid="input-invite-emails"
                    />
                    <button
                      onClick={handleAddContacts}
                      className="px-4 py-3 bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] rounded-xl font-semibold flex items-center gap-2 hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] transition-colors whitespace-nowrap"
                      data-testid="button-add-contacts"
                    >
                      <BookUser className="w-4 h-4" />
                      Add From Contacts
                    </button>
                  </div>
                  <p className="text-[12px] text-[#A1A1AA]">Separate multiple emails with commas.</p>
                  <textarea
                    value={inviteMessage}
                    onChange={(e) => setInviteMessage(e.target.value)}
                    rows={5}
                    className="w-full text-[14px] text-[#09090B] dark:text-white bg-[#F9F9FB] dark:bg-[#09090B] rounded-xl px-4 py-3 border border-[#ECECEE] dark:border-[#27272A] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 resize-y"
                    data-testid="textarea-invite-message"
                  />
                  <button
                    onClick={() => {
                      if (inviteEmails.trim()) sendInviteMutation.mutate(inviteEmails.trim());
                    }}
                    disabled={sendInviteMutation.isPending || !inviteEmails.trim()}
                    className="px-6 py-3 bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] rounded-xl font-semibold flex items-center gap-2 hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] disabled:opacity-50 transition-colors"
                    data-testid="button-send-invite"
                  >
                    <Send className="w-4 h-4" />
                    Send The Invite
                  </button>
                </div>
              </section>

              {/* Share on social */}
              <section data-testid="social-share-section">
                <h2 className="text-[18px] font-bold text-foreground mb-1">Share on social</h2>
                <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] mb-4">Rack up referrals by sharing on your social channels.</p>
                <div className="flex gap-2">
                  <a
                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(stats?.referralLink || "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-11 h-11 flex items-center justify-center rounded-xl bg-[#1877F2] text-white hover:opacity-90 transition-opacity"
                    data-testid="button-facebook"
                  >
                    <SiFacebook className="w-5 h-5" />
                  </a>
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(stats?.referralLink || "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-11 h-11 flex items-center justify-center rounded-xl bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] hover:opacity-90 transition-opacity"
                    data-testid="button-twitter"
                  >
                    <SiX className="w-4 h-4" />
                  </a>
                  <a
                    href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(stats?.referralLink || "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-11 h-11 flex items-center justify-center rounded-xl bg-[#0A66C2] text-white hover:opacity-90 transition-opacity"
                    data-testid="button-linkedin"
                  >
                    <SiLinkedin className="w-5 h-5" />
                  </a>
                  <button
                    onClick={handleCopyLink}
                    className="h-11 px-4 flex items-center justify-center gap-2 rounded-xl bg-[#F4F4F5] dark:bg-[#1C1C22] text-[#09090B] dark:text-white text-[13px] font-semibold hover:bg-[#E4E4E7] dark:hover:bg-[#27272A] transition-colors"
                    data-testid="button-copy-social"
                  >
                    <Copy className="w-4 h-4" />
                    Copy
                  </button>
                </div>
              </section>
            </div>

            {/* Right Column - Leaderboard */}
            <div className="lg:col-span-2">
              <section data-testid="leaderboard-section" className="sticky top-4">
                <h2 className="text-[18px] font-bold text-foreground mb-1">Leaderboard</h2>
                <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] mb-4">See how you stack up against other members.</p>
                <div className="rounded-2xl bg-white dark:bg-[#111114] border border-[#ECECEE] dark:border-[#1C1C22] overflow-hidden">
                  {(!leaderboard || leaderboard.length === 0) ? (
                    <div className="px-5 py-10 text-center text-[#A1A1AA]">
                      <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      <p className="text-[15px] font-semibold text-foreground mb-1">No referrals yet</p>
                      <p className="text-[13px]">Be the first to share and climb the board!</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#F4F4F5] dark:divide-[#1C1C22]">
                      {leaderboard.map((entry, i) => {
                        const isCurrentUser = entry.userId === (user as any)?.id;
                        return (
                          <div
                            key={entry.userId}
                            className={`flex items-center gap-3 px-4 py-3 ${isCurrentUser ? "bg-[#6366F1]/[0.05]" : ""}`}
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
                              <span className={`text-[14px] font-semibold truncate block ${isCurrentUser ? "text-[#6366F1]" : "text-foreground"}`}>
                                {entry.displayName} {isCurrentUser && "(You)"}
                              </span>
                            </div>
                            <span className="text-[13px] font-bold text-[#6366F1]" data-testid={`leaderboard-count-${entry.userId}`}>
                              {entry.count}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>

        {/* Monitor Your Progress */}
        <div className="max-w-5xl mx-auto px-4 md:px-8 pb-12">
          <h2 className="text-[20px] font-bold text-foreground mb-1">Monitor your progress</h2>
          <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] mb-6">Track your referrals and unlock rewards as you go.</p>

          {statsLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              {stats?.tiers.map((tier, i) => {
                const isUnlocked = stats.count >= tier.threshold;
                const isNext = stats.nextTier?.id === tier.id;
                const Icon = TIER_ICONS[i % TIER_ICONS.length];
                const prevThreshold = i > 0 ? stats.tiers[i - 1].threshold : 0;
                const progress = isNext
                  ? Math.min(100, ((stats.count - prevThreshold) / (tier.threshold - prevThreshold)) * 100)
                  : isUnlocked ? 100 : 0;

                return (
                  <div
                    key={tier.id}
                    className={`rounded-2xl border p-5 transition-all ${
                      isNext
                        ? "bg-white dark:bg-[#111114] border-[#6366F1]/30 ring-2 ring-[#6366F1]/15 shadow-sm"
                        : isUnlocked
                        ? "bg-white dark:bg-[#111114] border-[#ECECEE] dark:border-[#1C1C22]"
                        : "bg-[#FAFAFA] dark:bg-[#0A0A0C] border-[#ECECEE] dark:border-[#1C1C22] opacity-50"
                    }`}
                    data-testid={`progress-tier-${tier.id}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isUnlocked
                          ? "bg-[#6366F1]/10 text-[#6366F1]"
                          : "bg-[#F4F4F5] dark:bg-[#1C1C22] text-[#A1A1AA]"
                      }`}>
                        {isUnlocked ? <Icon className="w-5 h-5" /> : <Lock className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[16px] font-bold ${isUnlocked || isNext ? "text-foreground" : "text-[#A1A1AA]"}`}>
                            {tier.rewardName}
                          </span>
                          <span className={`text-[13px] font-medium px-2 py-0.5 rounded-full ${
                            isUnlocked
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-[#F4F4F5] dark:bg-[#1C1C22] text-[#A1A1AA]"
                          }`}>
                            {isUnlocked ? "Unlocked" : `${tier.threshold} referrals`}
                          </span>
                        </div>
                        <p className={`text-[14px] mt-0.5 ${isUnlocked || isNext ? "text-[#52525B] dark:text-[#A1A1AA]" : "text-[#A1A1AA] dark:text-[#52525B]"}`}>
                          {tier.rewardDescription}
                        </p>
                        {(isNext || isUnlocked) && (
                          <div className="mt-3">
                            <div className="flex justify-between text-[12px] text-[#A1A1AA] mb-1">
                              <span>{isUnlocked ? tier.threshold : stats.count} / {tier.threshold}</span>
                              <span>{isUnlocked ? "Complete!" : `${tier.threshold - stats.count} to go`}</span>
                            </div>
                            <div className="h-2 bg-[#F4F4F5] dark:bg-[#1C1C22] rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  isUnlocked
                                    ? "bg-green-500"
                                    : "bg-gradient-to-r from-[#6366F1] to-[#8B5CF6]"
                                }`}
                                style={{ width: `${progress}%` }}
                                data-testid={`progress-bar-${tier.id}`}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Contact Picker Modal */}
        {showContactsPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowContactsPicker(false)}>
            <div
              className="bg-white dark:bg-[#111114] rounded-2xl w-full max-w-md mx-4 overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              data-testid="contacts-picker-modal"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#ECECEE] dark:border-[#1C1C22]">
                <h3 className="text-[18px] font-bold text-foreground">Choose Your Address Book</h3>
                <button
                  onClick={() => setShowContactsPicker(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C22] transition-colors text-[#52525B]"
                  data-testid="button-close-contacts"
                >
                  ✕
                </button>
              </div>
              <div className="divide-y divide-[#F4F4F5] dark:divide-[#1C1C22]">
                {[
                  { name: "Sign in with Google", icon: "🔵", action: () => { window.open(`https://contacts.google.com/`, "_blank"); setShowContactsPicker(false); } },
                  { name: "Yahoo", icon: "🟣", action: () => { window.open("https://mail.yahoo.com/contacts", "_blank"); setShowContactsPicker(false); } },
                  { name: "Outlook.com", icon: "🔷", action: () => { window.open("https://outlook.live.com/people/", "_blank"); setShowContactsPicker(false); } },
                  { name: "iCloud", icon: "☁️", action: () => { window.open("https://www.icloud.com/contacts/", "_blank"); setShowContactsPicker(false); } },
                ].map((provider) => (
                  <button
                    key={provider.name}
                    onClick={provider.action}
                    className="w-full flex items-center gap-4 px-6 py-4 hover:bg-[#F9F9FB] dark:hover:bg-[#09090B] transition-colors text-left"
                    data-testid={`contact-provider-${provider.name.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    <span className="text-[20px]">{provider.icon}</span>
                    <span className="text-[15px] font-medium text-foreground">{provider.name}</span>
                    <ChevronRight className="w-4 h-4 text-[#A1A1AA] ml-auto" />
                  </button>
                ))}
              </div>
              <div className="px-6 py-4 bg-[#F9F9FB] dark:bg-[#09090B]">
                <p className="text-[12px] text-[#A1A1AA] text-center">
                  Copy emails from your address book and paste them into the email field above.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
