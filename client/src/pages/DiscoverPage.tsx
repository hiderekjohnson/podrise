import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Search, TrendingUp, Loader2, Check, ChevronRight, Building2, Briefcase, Lightbulb, X, ArrowLeft } from "lucide-react";
import { TOPICS, type TopicConfig } from "@/data/topicData";
import { BottomNav } from "@/components/BottomNav";
import { FeedHeader } from "@/components/FeedHeader";

interface DirectoryPodcast {
  slug: string;
  name: string;
  artworkUrl: string;
  description?: string;
  category?: string;
}

function TopicChip({ topic, isSubscribed, onToggle }: {
  topic: TopicConfig;
  isSubscribed: boolean;
  onToggle: (slug: string, subscribe: boolean) => void;
}) {
  return (
    <button
      onClick={() => onToggle(topic.slug, !isSubscribed)}
      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-semibold transition-all active:scale-95 ${
        isSubscribed
          ? "bg-[#6366F1] text-white shadow-sm shadow-[#6366F1]/20"
          : "bg-[#F4F4F5] text-[#3F3F46] hover:bg-[#E4E4E7]"
      }`}
      data-testid={`discover-topic-${topic.slug}`}
    >
      {isSubscribed && <Check className="w-3 h-3" strokeWidth={3} />}
      {topic.name}
    </button>
  );
}

function PodcastRow({ podcast, rank }: { podcast: DirectoryPodcast; rank?: number }) {
  return (
    <Link href={`/podcasts/${podcast.slug}`}>
      <div className="flex items-center gap-3 py-3 px-1 active:bg-[#F9F9FB] transition-colors" data-testid={`discover-podcast-${podcast.slug}`}>
        {rank !== undefined && (
          <span className="text-[13px] font-bold text-[#C4C4CC] w-5 text-right flex-shrink-0 tabular-nums">{rank}</span>
        )}
        <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#F4F4F5] flex-shrink-0 ring-[0.5px] ring-black/5">
          <img src={podcast.artworkUrl} alt={podcast.name} className="w-full h-full object-cover" loading="lazy" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-[#09090B] truncate">{podcast.name}</p>
          {podcast.category && <p className="text-[12px] text-[#A1A1AA] mt-0.5">{podcast.category}</p>}
        </div>
        <ChevronRight className="w-4 h-4 text-[#D4D4D8] flex-shrink-0" />
      </div>
    </Link>
  );
}

export default function DiscoverPage() {
  const { data: user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
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

  const trendingPodcasts = directoryData?.slice(0, 25) || [];

  const filteredPodcasts = searchQuery.length >= 2
    ? (directoryData || []).filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const sections = [
    { key: "trending" as const, label: "Trending", icon: TrendingUp },
    { key: "industries" as const, label: "Industries", icon: Building2 },
    { key: "interests" as const, label: "Interests", icon: Lightbulb },
    { key: "roles" as const, label: "Roles", icon: Briefcase },
  ];

  return (
    <div className="min-h-screen bg-white" data-testid="discover-page">
      <FeedHeader />

      <div className="sticky top-[52px] z-30 bg-white border-b border-[#F0F0F2]">
        <div className="max-w-[600px] mx-auto px-4 py-2.5">
          <div className="relative flex items-center gap-2">
            {searchFocused && (
              <button
                onClick={() => { setSearchFocused(false); setSearchQuery(""); }}
                className="w-9 h-9 flex items-center justify-center flex-shrink-0"
                aria-label="Close search"
                data-testid="discover-search-back"
              >
                <ArrowLeft className="w-5 h-5 text-[#09090B]" />
              </button>
            )}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A1A1AA]" />
              <input
                type="text"
                placeholder="Search podcasts and topics"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                className="w-full bg-[#F4F4F5] rounded-full py-2.5 pl-10 pr-10 text-[15px] text-[#09090B] placeholder:text-[#A1A1AA] focus:outline-none focus:bg-[#ECECEE] transition-colors"
                data-testid="discover-search-input"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-[#A1A1AA] flex items-center justify-center"
                  aria-label="Clear search"
                  data-testid="discover-search-clear"
                >
                  <X className="w-3 h-3 text-white" strokeWidth={3} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[600px] mx-auto">
        {searchQuery.length >= 2 ? (
          <div className="px-4 py-3">
            {filteredPodcasts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[15px] text-[#71717A]">No results for "{searchQuery}"</p>
              </div>
            ) : (
              <div className="divide-y divide-[#F4F4F5]">
                {filteredPodcasts.slice(0, 20).map((p) => (
                  <PodcastRow key={p.slug} podcast={p} />
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
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-bold whitespace-nowrap transition-all active:scale-95 ${
                    activeSection === key
                      ? "bg-[#09090B] text-white"
                      : "bg-[#F4F4F5] text-[#52525B] hover:bg-[#E4E4E7]"
                  }`}
                  data-testid={`discover-section-${key}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {activeSection === "trending" && (
              <div className="px-4 pt-2 pb-4">
                <h3 className="text-[18px] font-bold text-[#09090B] mb-1">Popular Podcasts</h3>
                <p className="text-[13px] text-[#A1A1AA] mb-3">The most followed shows on PodCap</p>
                {loadingDirectory ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-[#6366F1]" />
                  </div>
                ) : (
                  <div className="divide-y divide-[#F4F4F5]">
                    {trendingPodcasts.map((p, i) => (
                      <PodcastRow key={p.slug} podcast={p} rank={i + 1} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeSection === "industries" && (
              <div className="px-4 pt-2 pb-4">
                <h3 className="text-[18px] font-bold text-[#09090B] mb-1">Industries</h3>
                <p className="text-[13px] text-[#A1A1AA] mb-4">Get daily briefings for your industry</p>
                <div className="flex flex-wrap gap-2">
                  {industries.map((t) => (
                    <TopicChip
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
              <div className="px-4 pt-2 pb-4">
                <h3 className="text-[18px] font-bold text-[#09090B] mb-1">Interests</h3>
                <p className="text-[13px] text-[#A1A1AA] mb-4">Follow topics you care about</p>
                <div className="flex flex-wrap gap-2">
                  {interests.map((t) => (
                    <TopicChip
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
              <div className="px-4 pt-2 pb-4">
                <h3 className="text-[18px] font-bold text-[#09090B] mb-1">Roles</h3>
                <p className="text-[13px] text-[#A1A1AA] mb-4">Get insights tailored to your role</p>
                <div className="flex flex-wrap gap-2">
                  {roles.map((t) => (
                    <TopicChip
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
        <div className="h-[60px]" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
      </div>
      <BottomNav currentPath={location} />
    </div>
  );
}
