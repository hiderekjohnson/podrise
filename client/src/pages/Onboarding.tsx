import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, ChevronRight, Podcast, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PodCapWordmark } from "@/components/PodCapHeader";
import { INDUSTRIES, INTERESTS, ROLES } from "@/data/topicData";

interface SuggestedPodcast {
  slug: string;
  name: string;
  artworkUrl: string;
  category: string | null;
  description: string | null;
  followers: number | null;
}

interface SuggestionsData {
  podcasts: SuggestedPodcast[];
  followedSlugs: string[];
  followedTopics: {
    industries: string[];
    interests: string[];
    roles: string[];
  };
  context: string;
  needsOnboarding: boolean;
}

function hiResArtwork(url: string): string {
  if (!url) return "";
  if (url.startsWith("/artwork/")) return url;
  return url.replace(/\/\d+x\d+bb\./, "/100x100bb.");
}

const TOPIC_SECTIONS = [
  { key: "industries" as const, label: "Industries", items: INDUSTRIES.slice(0, 12) },
  { key: "interests" as const, label: "Interests", items: INTERESTS.slice(0, 12) },
  { key: "roles" as const, label: "Roles", items: ROLES.slice(0, 8) },
];

export default function Onboarding() {
  const { data: user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [selectedPodcasts, setSelectedPodcasts] = useState<Set<string>>(new Set());
  const [selectedTopics, setSelectedTopics] = useState<{
    industries: Set<string>;
    interests: Set<string>;
    roles: Set<string>;
  }>({
    industries: new Set(),
    interests: new Set(),
    roles: new Set(),
  });

  useEffect(() => {
    document.title = "Set Up Your Feed | PodCap";
  }, []);

  const { data: suggestions, isLoading } = useQuery<SuggestionsData>({
    queryKey: ["/api/onboarding/suggestions"],
    queryFn: async () => {
      const res = await fetch("/api/onboarding/suggestions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load suggestions");
      return res.json();
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (suggestions) {
      setSelectedPodcasts(new Set(suggestions.followedSlugs));
      setSelectedTopics({
        industries: new Set(suggestions.followedTopics.industries),
        interests: new Set(suggestions.followedTopics.interests),
        roles: new Set(suggestions.followedTopics.roles),
      });
    }
  }, [suggestions]);

  useEffect(() => {
    if (user && user.onboardingCompleted) {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/onboarding/complete", {
        podcasts: Array.from(selectedPodcasts),
        industries: Array.from(selectedTopics.industries),
        interests: Array.from(selectedTopics.interests),
        roles: Array.from(selectedTopics.roles),
      });
      return res.json();
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["/api/auth/me"], updatedUser);
      navigate("/dashboard?welcome=true");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save preferences", variant: "destructive" });
    },
  });

  const togglePodcast = (slug: string) => {
    setSelectedPodcasts(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const toggleTopic = (category: "industries" | "interests" | "roles", slug: string) => {
    setSelectedTopics(prev => {
      const next = { ...prev, [category]: new Set(prev[category]) };
      if (next[category].has(slug)) next[category].delete(slug);
      else next[category].add(slug);
      return next;
    });
  };

  const { isLoading: authLoading } = useQuery({ queryKey: ["/api/auth/me"] });

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/register");
    }
  }, [authLoading, user, navigate]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-[#6366F1]" />
      </div>
    );
  }

  const totalSteps = 2;
  const progress = ((step + 1) / totalSteps) * 100;

  const totalTopicsSelected =
    selectedTopics.industries.size +
    selectedTopics.interests.size +
    selectedTopics.roles.size;

  return (
    <div className="min-h-screen bg-white" data-testid="onboarding-page">
      <header className="sticky top-0 z-40 bg-white border-b border-[#F0F0F2]">
        <div className="max-w-[600px] mx-auto px-4 h-14 flex items-center justify-between">
          <PodCapWordmark />
          <button
            onClick={() => {
              completeMutation.mutate();
            }}
            className="text-[15px] font-semibold text-[#A1A1AA] hover:text-[#52525B] transition-colors"
            data-testid="onboarding-skip"
          >
            Skip
          </button>
        </div>
        <div className="h-1 bg-[#F0F0F2]">
          <motion.div
            className="h-full bg-[#6366F1] rounded-r-full"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </header>

      <div className="max-w-[600px] mx-auto px-4">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="podcasts"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <div className="pt-8 pb-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-[#EEF2FF] flex items-center justify-center">
                    <Podcast className="w-5 h-5 text-[#6366F1]" />
                  </div>
                  <div>
                    <h1 className="text-[1.5rem] font-bold text-[#09090B] leading-tight" data-testid="onboarding-podcast-heading">
                      Follow podcasts you love
                    </h1>
                    <p className="text-[15px] text-[#71717A] mt-0.5">
                      We'll surface recaps and insights from your picks
                    </p>
                  </div>
                </div>
              </div>

              {isLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-[#6366F1]" />
                </div>
              ) : (
                <div className="space-y-0 divide-y divide-[#F0F0F2]">
                  {suggestions?.podcasts.map((podcast) => {
                    const isSelected = selectedPodcasts.has(podcast.slug);
                    return (
                      <button
                        key={podcast.slug}
                        onClick={() => togglePodcast(podcast.slug)}
                        className="w-full flex items-center gap-3 py-3.5 text-left hover:bg-[#FAFAFE] transition-colors"
                        data-testid={`onboarding-podcast-${podcast.slug}`}
                      >
                        <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                          {podcast.artworkUrl ? (
                            <img
                              src={hiResArtwork(podcast.artworkUrl)}
                              alt={podcast.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full bg-[#EEF2FF] flex items-center justify-center">
                              <Podcast className="w-5 h-5 text-[#6366F1]" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[15px] text-[#09090B] truncate">
                            {podcast.name}
                          </p>
                          {podcast.category && (
                            <p className="text-[13px] text-[#A1A1AA] truncate">{podcast.category}</p>
                          )}
                        </div>
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                            isSelected
                              ? "bg-[#6366F1] text-white"
                              : "border-2 border-[#D4D4D8] text-transparent"
                          }`}
                        >
                          <Check className="w-4 h-4" strokeWidth={3} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="sticky bottom-0 bg-white border-t border-[#F0F0F2] py-4 mt-4">
                <button
                  onClick={() => setStep(1)}
                  className="w-full h-[48px] flex items-center justify-center gap-2 rounded-full font-bold text-[15px] bg-[#09090B] text-white hover:bg-[#1a1a2e] transition-all active:scale-[0.98]"
                  data-testid="onboarding-next-podcasts"
                >
                  {selectedPodcasts.size > 0 ? `Next — ${selectedPodcasts.size} selected` : "Next"}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="topics"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <div className="pt-8 pb-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-[#EEF2FF] flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-[#6366F1]" />
                  </div>
                  <div>
                    <h1 className="text-[1.5rem] font-bold text-[#09090B] leading-tight" data-testid="onboarding-topics-heading">
                      What are you interested in?
                    </h1>
                    <p className="text-[15px] text-[#71717A] mt-0.5">
                      Get daily intelligence on topics that matter to you
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6 pb-4">
                {TOPIC_SECTIONS.map(({ key, label, items }) => (
                  <div key={key}>
                    <h2 className="text-[13px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-3">
                      {label}
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {items.map((topic) => {
                        const isSelected = selectedTopics[key].has(topic.slug);
                        return (
                          <button
                            key={topic.slug}
                            onClick={() => toggleTopic(key, topic.slug)}
                            className={`px-4 py-2 rounded-full text-[14px] font-medium transition-all ${
                              isSelected
                                ? "bg-[#6366F1] text-white"
                                : "bg-[#F4F4F5] text-[#52525B] hover:bg-[#E4E4E7]"
                            }`}
                            data-testid={`onboarding-topic-${topic.slug}`}
                          >
                            {topic.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="sticky bottom-0 bg-white border-t border-[#F0F0F2] py-4 mt-4">
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(0)}
                    className="h-[48px] px-6 flex items-center justify-center rounded-full font-bold text-[15px] border border-[#D4D4D8] text-[#09090B] hover:bg-[#F4F4F5] transition-all"
                    data-testid="onboarding-back-topics"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => completeMutation.mutate()}
                    disabled={completeMutation.isPending}
                    className="flex-1 h-[48px] flex items-center justify-center gap-2 rounded-full font-bold text-[15px] bg-[#6366F1] text-white hover:bg-[#4F46E5] disabled:opacity-50 transition-all active:scale-[0.98]"
                    data-testid="onboarding-finish"
                  >
                    {completeMutation.isPending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : totalTopicsSelected > 0 ? (
                      `Create my feed — ${selectedPodcasts.size + totalTopicsSelected} picks`
                    ) : selectedPodcasts.size > 0 ? (
                      `Create my feed — ${selectedPodcasts.size} picks`
                    ) : (
                      "Create my feed"
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
