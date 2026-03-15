import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Search, TrendingUp, Loader2, Plus, Check, ChevronRight, Podcast, Building2, Briefcase, Lightbulb } from "lucide-react";
import { TOPICS, getCategoryPath, type TopicConfig } from "@/data/topicData";
import { PodcastSearch } from "@/components/PodcastSearch";
import { BottomNav } from "@/components/BottomNav";
import { FeedHeader } from "@/components/FeedHeader";

interface DirectoryPodcast {
  slug: string;
  name: string;
  artworkUrl: string;
  description?: string;
  category?: string;
}

function TopicPill({ topic, isSubscribed, onToggle }: {
  topic: TopicConfig;
  isSubscribed: boolean;
  onToggle: (slug: string, subscribe: boolean) => void;
}) {
  return (
    <button
      onClick={() => onToggle(topic.slug, !isSubscribed)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all ${
        isSubscribed
          ? "bg-[#6366F1] text-white"
          : "bg-[#F7F7FC] text-[#52525B] hover:bg-[#EEEEF5]"
      }`}
      data-testid={`discover-topic-${topic.slug}`}
    >
      {isSubscribed && <Check className="w-3.5 h-3.5" />}
      {topic.name}
    </button>
  );
}

export default function DiscoverPage() {
  const { data: user } = useAuth();
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSection, setActiveSection] = useState<"trending" | "industries" | "interests" | "roles">("trending");

  const { data: directoryData, isLoading: loadingDirectory } = useQuery<DirectoryPodcast[]>({
    queryKey: ["/api/podcasts/directory"],
  });

  const userIndustries = user?.industries || [];
  const userInterests = user?.interests || [];
  const userRoles = user?.roles || [];

  const industries = TOPICS.filter((t) => t.category === "industry");
  const interests = TOPICS.filter((t) => t.category === "interest");
  const roles = TOPICS.filter((t) => t.category === "role");

  const topicMutation = useMutation({
    mutationFn: async ({ slug, category, subscribe }: { slug: string; category: string; subscribe: boolean }) => {
      const field = category === "industry" ? "industries" : category === "interest" ? "interests" : "roles";
      const current = user ? (user as any)[field] || [] : [];
      const updated = subscribe
        ? [...current, slug]
        : current.filter((s: string) => s !== slug);
      const res = await apiRequest("POST", "/api/users/update", { [field]: updated });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update topics", variant: "destructive" });
    },
  });

  const handleTopicToggle = (slug: string, category: string, subscribe: boolean) => {
    if (!user) {
      toast({ title: "Sign in required", description: "Log in to subscribe to topics", variant: "destructive" });
      return;
    }
    topicMutation.mutate({ slug, category, subscribe });
  };

  const trendingPodcasts = directoryData?.slice(0, 20) || [];

  const filteredPodcasts = searchQuery.length >= 2
    ? (directoryData || []).filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const sections = [
    { key: "trending", label: "Trending", icon: TrendingUp },
    { key: "industries", label: "Industries", icon: Building2 },
    { key: "interests", label: "Interests", icon: Lightbulb },
    { key: "roles", label: "Roles", icon: Briefcase },
  ] as const;

  return (
    <div className="min-h-screen bg-white" data-testid="discover-page">
      <FeedHeader />
      <div className="sticky top-12 z-30 bg-white/95 backdrop-blur-sm border-b border-[#F0F0F2] px-4 py-3">
        <div className="max-w-[600px] mx-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[#A1A1AA]" />
            <input
              type="text"
              placeholder="Search podcasts, topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#F7F7FC] border border-[#F0F0F2] rounded-full py-2.5 pl-10 pr-4 text-[15px] text-[#09090B] placeholder:text-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1]"
              data-testid="discover-search-input"
            />
          </div>
        </div>
      </div>

      <div className="max-w-[600px] mx-auto">
        {searchQuery.length >= 2 ? (
          <div className="px-4 py-4">
            <h3 className="text-sm font-semibold text-[#A1A1AA] uppercase tracking-wider mb-3">Results</h3>
            {filteredPodcasts.length === 0 ? (
              <p className="text-[#52525B] text-sm py-8 text-center">No podcasts found for "{searchQuery}"</p>
            ) : (
              <div className="space-y-1">
                {filteredPodcasts.slice(0, 20).map((p) => (
                  <Link key={p.slug} href={`/podcasts/${p.slug}`}>
                    <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#F7F7FC] transition-colors" data-testid={`discover-result-${p.slug}`}>
                      <div className="w-11 h-11 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                        <img src={p.artworkUrl} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[15px] font-medium text-[#09090B] truncate block">{p.name}</span>
                        {p.category && <span className="text-xs text-[#A1A1AA]">{p.category}</span>}
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#A1A1AA] flex-shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
              {sections.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveSection(key)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                    activeSection === key
                      ? "bg-[#09090B] text-white"
                      : "bg-[#F7F7FC] text-[#52525B] hover:bg-[#EEEEF5]"
                  }`}
                  data-testid={`discover-section-${key}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {activeSection === "trending" && (
              <div className="px-4 py-4">
                <h3 className="text-lg font-semibold text-[#09090B] mb-4">Popular Podcasts</h3>
                {loadingDirectory ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-[#6366F1]" />
                  </div>
                ) : (
                  <div className="space-y-1">
                    {trendingPodcasts.map((p, i) => (
                      <Link key={p.slug} href={`/podcasts/${p.slug}`}>
                        <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#F7F7FC] transition-colors" data-testid={`discover-podcast-${p.slug}`}>
                          <span className="text-sm font-mono text-[#A1A1AA] w-6 text-right flex-shrink-0">{i + 1}</span>
                          <div className="w-11 h-11 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                            <img src={p.artworkUrl} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-[15px] font-medium text-[#09090B] truncate block">{p.name}</span>
                            {p.category && <span className="text-xs text-[#A1A1AA]">{p.category}</span>}
                          </div>
                          <ChevronRight className="w-4 h-4 text-[#A1A1AA] flex-shrink-0" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeSection === "industries" && (
              <div className="px-4 py-4">
                <h3 className="text-lg font-semibold text-[#09090B] mb-2">Industries</h3>
                <p className="text-sm text-[#52525B] mb-4">Get daily pulse briefings for your industry</p>
                <div className="flex flex-wrap gap-2">
                  {industries.map((t) => (
                    <TopicPill
                      key={t.slug}
                      topic={t}
                      isSubscribed={userIndustries.includes(t.slug)}
                      onToggle={(slug, sub) => handleTopicToggle(slug, "industry", sub)}
                    />
                  ))}
                </div>
              </div>
            )}

            {activeSection === "interests" && (
              <div className="px-4 py-4">
                <h3 className="text-lg font-semibold text-[#09090B] mb-2">Interests</h3>
                <p className="text-sm text-[#52525B] mb-4">Follow topics you care about</p>
                <div className="flex flex-wrap gap-2">
                  {interests.map((t) => (
                    <TopicPill
                      key={t.slug}
                      topic={t}
                      isSubscribed={userInterests.includes(t.slug)}
                      onToggle={(slug, sub) => handleTopicToggle(slug, "interest", sub)}
                    />
                  ))}
                </div>
              </div>
            )}

            {activeSection === "roles" && (
              <div className="px-4 py-4">
                <h3 className="text-lg font-semibold text-[#09090B] mb-2">Roles</h3>
                <p className="text-sm text-[#52525B] mb-4">Get insights tailored to your role</p>
                <div className="flex flex-wrap gap-2">
                  {roles.map((t) => (
                    <TopicPill
                      key={t.slug}
                      topic={t}
                      isSubscribed={userRoles.includes(t.slug)}
                      onToggle={(slug, sub) => handleTopicToggle(slug, "role", sub)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        <div className="h-16" />
      </div>
      <BottomNav currentPath={location} />
    </div>
  );
}
