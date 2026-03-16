import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PULSE_INDUSTRIES, PULSE_INTERESTS, PULSE_ROLES, type PulseTopic } from "@/data/pulseTopics";
import { Crown, Zap, Lock, Check, Loader2, X, BarChart3, Bell, TrendingUp, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function MyPulsePage() {
  const { data: user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isPro = user?.plan === "pro";
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const { data: subsData, isLoading } = useQuery<{ subscriptions: { topicSlug: string }[] }>({
    queryKey: ["/api/pulse/subscriptions"],
    enabled: !!user,
  });

  const subscribedSlugs = new Set(subsData?.subscriptions?.map(s => s.topicSlug) || []);

  const toggleMutation = useMutation({
    mutationFn: async ({ topicSlug, subscribe }: { topicSlug: string; subscribe: boolean }) => {
      if (subscribe) {
        await apiRequest("POST", "/api/pulse/subscriptions", { topicSlug });
      } else {
        await apiRequest("DELETE", `/api/pulse/subscriptions/${topicSlug}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pulse/subscriptions"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message || "Failed to update", variant: "destructive" });
    },
  });

  const handleToggle = (slug: string) => {
    if (!isPro) {
      setShowUpgradeModal(true);
      return;
    }
    const isSubscribed = subscribedSlugs.has(slug);
    toggleMutation.mutate({ topicSlug: slug, subscribe: !isSubscribed });
  };

  return (
    <DashboardLayout hideRightSidebar>
      <div className="min-h-screen bg-[#F9F9FB] dark:bg-[#09090B]" data-testid="my-pulse-page">
        <div className="bg-white dark:bg-[#111114] border-b border-[#F0F0F2] dark:border-[#1C1C22]">
          <div className="max-w-4xl mx-auto px-4 md:px-8 py-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-[#6366F1]/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-[#6366F1]" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-display font-extrabold text-foreground" data-testid="text-my-pulse-title">
                  My Pulse
                </h1>
                <p className="text-sm text-muted-foreground">
                  {isPro
                    ? `You're subscribed to ${subscribedSlugs.size} topic${subscribedSlugs.size !== 1 ? "s" : ""}`
                    : "Select topics you're interested in to get daily briefings"
                  }
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 md:px-8 py-5 space-y-8 pb-24 md:pb-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <TopicSection
                title="Industries"
                topics={PULSE_INDUSTRIES}
                subscribedSlugs={subscribedSlugs}
                onToggle={handleToggle}
                isPro={isPro}
                isToggling={toggleMutation.isPending}
              />
              <TopicSection
                title="Interests"
                topics={PULSE_INTERESTS}
                subscribedSlugs={subscribedSlugs}
                onToggle={handleToggle}
                isPro={isPro}
                isToggling={toggleMutation.isPending}
              />
              <TopicSection
                title="Roles"
                topics={PULSE_ROLES}
                subscribedSlugs={subscribedSlugs}
                onToggle={handleToggle}
                isPro={isPro}
                isToggling={toggleMutation.isPending}
              />
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showUpgradeModal && (
          <PulseUpgradeModal
            onClose={() => setShowUpgradeModal(false)}
            onUpgrade={() => navigate("/upgrade")}
          />
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}

function PulseUpgradeModal({ onClose, onUpgrade }: { onClose: () => void; onUpgrade: () => void }) {
  const benefits = [
    {
      icon: BarChart3,
      title: "Daily AI Briefings",
      description: "Get a concise, AI-generated summary of the most important podcast discussions in each topic you follow — delivered every day.",
    },
    {
      icon: TrendingUp,
      title: "Stay Ahead of Trends",
      description: "Pulse surfaces emerging ideas and shifts across industries before they hit the mainstream, so you're always a step ahead.",
    },
    {
      icon: Bell,
      title: "Personalized to You",
      description: "Choose the topics that matter most — from AI and finance to health and marketing — and only get briefings on what you care about.",
    },
    {
      icon: Sparkles,
      title: "Powered by 36,000+ Transcripts",
      description: "Pulse draws from thousands of real podcast conversations, not headlines or social media — giving you deeper, more original insights.",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="pulse-upgrade-modal"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-white dark:bg-[#111114] rounded-2xl border border-[#ECECEE] dark:border-[#1C1C22] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="relative bg-gradient-to-br from-[#6366F1] to-[#4F46E5] rounded-t-2xl p-6 pb-8 text-center">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            data-testid="button-close-upgrade-modal"
          >
            <X className="w-4 h-4 text-white" />
          </button>

          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-display font-extrabold text-white mb-2">
            Unlock Pulse Pro
          </h2>
          <p className="text-white/80 text-sm leading-relaxed max-w-sm mx-auto">
            Subscribe to topics and receive daily AI-powered briefings drawn from thousands of real podcast conversations.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {benefits.map((benefit, i) => (
            <div key={i} className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-[#6366F1]/10 flex items-center justify-center shrink-0 mt-0.5">
                <benefit.icon className="w-4.5 h-4.5 text-[#6366F1]" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-foreground mb-0.5">{benefit.title}</h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{benefit.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 pt-2 space-y-3">
          <button
            onClick={onUpgrade}
            className="w-full py-3 bg-[#6366F1] hover:bg-[#4F46E5] text-white text-[15px] font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            data-testid="button-upgrade-pulse-modal"
          >
            <Crown className="w-4 h-4" />
            Upgrade to Pro
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors font-medium"
            data-testid="button-maybe-later"
          >
            Maybe later
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function TopicSection({
  title,
  topics,
  subscribedSlugs,
  onToggle,
  isPro,
  isToggling,
}: {
  title: string;
  topics: PulseTopic[];
  subscribedSlugs: Set<string>;
  onToggle: (slug: string) => void;
  isPro: boolean;
  isToggling: boolean;
}) {
  return (
    <section>
      <h2 className="text-[12px] font-bold text-[#A1A1AA] uppercase tracking-wider mb-3 px-1" data-testid={`text-section-${title.toLowerCase()}`}>
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {topics.map((topic) => {
          const isSubscribed = subscribedSlugs.has(topic.slug);
          return (
            <motion.button
              key={topic.slug}
              whileTap={{ scale: 0.98 }}
              onClick={() => onToggle(topic.slug)}
              disabled={isPro && isToggling}
              className={`text-left rounded-2xl border p-4 transition-all cursor-pointer ${
                isSubscribed
                  ? "border-[#6366F1] bg-[#6366F1]/5 dark:bg-[#6366F1]/10"
                  : "border-[#ECECEE] dark:border-[#1C1C22] bg-white dark:bg-[#111114] hover:border-[#D4D4D8] dark:hover:border-[#3F3F46]"
              }`}
              data-testid={`topic-card-${topic.slug}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] font-bold text-foreground mb-0.5 truncate">
                    {topic.name}
                  </h3>
                  <p className="text-[12px] text-muted-foreground line-clamp-2">
                    {topic.description}
                  </p>
                </div>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                  isSubscribed
                    ? "bg-[#6366F1] text-white"
                    : !isPro
                      ? "border-2 border-[#D4D4D8] dark:border-[#3F3F46] bg-[#6366F1]/5"
                      : "border-2 border-[#D4D4D8] dark:border-[#3F3F46]"
                }`}>
                  {isSubscribed && <Check className="w-3.5 h-3.5" />}
                  {!isPro && !isSubscribed && <Lock className="w-3 h-3 text-[#6366F1]/50" />}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
