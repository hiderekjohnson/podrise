import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PULSE_INDUSTRIES, PULSE_INTERESTS, PULSE_ROLES, type PulseTopic } from "@/data/pulseTopics";
import { Crown, Zap, Lock, Check, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function MyPulsePage() {
  const { data: user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isPro = user?.plan === "pro";

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
    if (!isPro) return;
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
                    : "Upgrade to Pro to get personalized briefings"
                  }
                </p>
              </div>
            </div>
          </div>
        </div>

        {!isPro && (
          <div className="max-w-4xl mx-auto px-4 md:px-8 pt-5">
            <div className="rounded-2xl border-2 border-[#6366F1]/30 bg-[#6366F1]/5 dark:bg-[#6366F1]/10 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4" data-testid="upgrade-prompt">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Lock className="w-4 h-4 text-[#6366F1]" />
                  <h3 className="text-sm font-display font-bold text-foreground">Pro plan required</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Subscribe to Pulse Pro to select topics and receive personalized daily briefings.
                </p>
              </div>
              <button
                data-testid="button-upgrade-pulse"
                onClick={() => navigate("/upgrade")}
                className="px-5 py-2.5 bg-[#6366F1] text-white text-sm font-bold rounded-xl hover:bg-[#4F46E5] transition-colors whitespace-nowrap flex items-center gap-2"
              >
                <Crown className="w-4 h-4" />
                Upgrade to Pro
              </button>
            </div>
          </div>
        )}

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
    </DashboardLayout>
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
              disabled={!isPro || isToggling}
              className={`text-left rounded-2xl border p-4 transition-all ${
                isSubscribed
                  ? "border-[#6366F1] bg-[#6366F1]/5 dark:bg-[#6366F1]/10"
                  : "border-[#ECECEE] dark:border-[#1C1C22] bg-white dark:bg-[#111114] hover:border-[#D4D4D8] dark:hover:border-[#3F3F46]"
              } ${!isPro ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}`}
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
                    : "border-2 border-[#D4D4D8] dark:border-[#3F3F46]"
                }`}>
                  {isSubscribed && <Check className="w-3.5 h-3.5" />}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
