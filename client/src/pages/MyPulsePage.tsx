import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PULSE_INDUSTRIES, PULSE_INTERESTS, PULSE_ROLES, type PulseTopic } from "@/data/pulseTopics";
import { Zap, Check, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function MyPulsePage() {
  const { data: user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"industries" | "interests" | "roles">("industries");

  const industriesRef = useRef<HTMLDivElement>(null);
  const interestsRef = useRef<HTMLDivElement>(null);
  const rolesRef = useRef<HTMLDivElement>(null);

  const scrollToSection = useCallback((tab: "industries" | "interests" | "roles") => {
    setActiveTab(tab);
    const refMap = { industries: industriesRef, interests: interestsRef, roles: rolesRef };
    const el = refMap[tab].current;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

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
    const isSubscribed = subscribedSlugs.has(slug);
    toggleMutation.mutate({ topicSlug: slug, subscribe: !isSubscribed });
  };

  return (
    <DashboardLayout>
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
                  {subscribedSlugs.size > 0
                    ? `You're subscribed to ${subscribedSlugs.size} topic${subscribedSlugs.size !== 1 ? "s" : ""}`
                    : "Select topics you're interested in to get daily briefings"
                  }
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="sticky top-0 z-30 bg-white/90 dark:bg-[#111114]/90 backdrop-blur-md border-b border-[#F0F0F2] dark:border-[#1C1C22]">
          <div className="max-w-4xl mx-auto px-4 md:px-8">
            <div className="flex items-center gap-1 py-2 overflow-x-auto hide-scrollbar">
              {(["industries", "interests", "roles"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => scrollToSection(tab)}
                  className={`px-4 py-2.5 text-[15px] font-semibold rounded-lg whitespace-nowrap transition-colors ${
                    activeTab === tab
                      ? "bg-[#6366F1]/[0.12] text-[#6366F1]"
                      : "text-[#A1A1AA] hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C22] hover:text-[#52525B]"
                  }`}
                  data-testid={`pulse-tab-${tab}`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
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
              <div ref={industriesRef} className="scroll-mt-28">
                <TopicSection
                  title="Industries"
                  topics={PULSE_INDUSTRIES}
                  subscribedSlugs={subscribedSlugs}
                  onToggle={handleToggle}
                  isToggling={toggleMutation.isPending}
                />
              </div>
              <div ref={interestsRef} className="scroll-mt-28">
                <TopicSection
                  title="Interests"
                  topics={PULSE_INTERESTS}
                  subscribedSlugs={subscribedSlugs}
                  onToggle={handleToggle}
                  isToggling={toggleMutation.isPending}
                />
              </div>
              <div ref={rolesRef} className="scroll-mt-28">
                <TopicSection
                  title="Roles"
                  topics={PULSE_ROLES}
                  subscribedSlugs={subscribedSlugs}
                  onToggle={handleToggle}
                  isToggling={toggleMutation.isPending}
                />
              </div>
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
  isToggling,
}: {
  title: string;
  topics: PulseTopic[];
  subscribedSlugs: Set<string>;
  onToggle: (slug: string) => void;
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
              disabled={isToggling}
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
