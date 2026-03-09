import { useParams } from "wouter";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { BookOpen, ExternalLink, Loader2, BookMarked, Wrench, Globe, Mail, GraduationCap, Headphones, Video, FileText, Server, Package } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getPodcastBySlug } from "../data/podcastLandingData";
import { EpisodePageLayout } from "@/components/EpisodePageLayout";

interface Resource {
  name: string;
  type: string;
  description: string;
  url: string | null;
  author: string | null;
  context: string;
}

function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
  } catch {}
  return null;
}

const typeConfig: Record<string, { icon: typeof BookOpen; label: string; color: string; bg: string }> = {
  book: { icon: BookMarked, label: "Book", color: "text-amber-600", bg: "bg-amber-50" },
  tool: { icon: Wrench, label: "Tool", color: "text-blue-600", bg: "bg-blue-50" },
  app: { icon: Package, label: "App", color: "text-purple-600", bg: "bg-purple-50" },
  website: { icon: Globe, label: "Website", color: "text-emerald-600", bg: "bg-emerald-50" },
  newsletter: { icon: Mail, label: "Newsletter", color: "text-rose-600", bg: "bg-rose-50" },
  course: { icon: GraduationCap, label: "Course", color: "text-indigo-600", bg: "bg-indigo-50" },
  podcast: { icon: Headphones, label: "Podcast", color: "text-orange-600", bg: "bg-orange-50" },
  video: { icon: Video, label: "Video", color: "text-red-600", bg: "bg-red-50" },
  article: { icon: FileText, label: "Article", color: "text-cyan-600", bg: "bg-cyan-50" },
  service: { icon: Server, label: "Service", color: "text-teal-600", bg: "bg-teal-50" },
  other: { icon: BookOpen, label: "Resource", color: "text-gray-600", bg: "bg-gray-50" },
};

function getTypeConfig(type: string) {
  return typeConfig[type] || typeConfig.other;
}

export default function EpisodeResourcesPage() {
  const params = useParams<{ podcastSlug: string; episodeSlug: string }>();
  const podcastSlug = params.podcastSlug || "";
  const episodeSlug = params.episodeSlug || "";

  const { data: episode, isLoading: episodeLoading } = useQuery<any>({
    queryKey: ["/api/podcasts", podcastSlug, "recaps", episodeSlug],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${podcastSlug}/recaps/${episodeSlug}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!podcastSlug && !!episodeSlug,
  });

  const { data: allRecaps = [] } = useQuery<any[]>({
    queryKey: ["/api/podcasts", podcastSlug, "recaps"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${podcastSlug}/recaps?limit=50`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!podcastSlug,
  });

  const { data: resourcesData, isLoading: resourcesLoading, isError: resourcesError } = useQuery<{ resources: Resource[] }>({
    queryKey: ["/api/podcasts", podcastSlug, episodeSlug, "resources"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${podcastSlug}/${episodeSlug}/resources`);
      if (!res.ok) throw new Error("Failed to load resources");
      return res.json();
    },
    enabled: !!podcastSlug && !!episodeSlug,
    retry: 1,
  });

  const resources = resourcesData?.resources || [];
  const podcastConfig = getPodcastBySlug(podcastSlug);

  const books = resources.filter(r => r.type === "book");
  const tools = resources.filter(r => r.type === "tool" || r.type === "app" || r.type === "service");
  const other = resources.filter(r => !["book", "tool", "app", "service"].includes(r.type));

  useEffect(() => {
    if (episode && podcastConfig) {
      document.title = `${episode.episodeTitle} — Resources | ${episode.podcastName} | PodCap`;

      const desc = `Books, tools, and resources mentioned in "${episode.episodeTitle}" on ${episode.podcastName}. Find every recommendation with direct links.`;

      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute("content", desc);
      else {
        const meta = document.createElement("meta");
        meta.name = "description";
        meta.content = desc;
        document.head.appendChild(meta);
      }

      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute("content", `${episode.episodeTitle} — Resources | ${episode.podcastName}`);
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute("content", desc);
    }
  }, [episode, podcastConfig, resources]);

  if (episodeLoading || !episode || !podcastConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="page-loader">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  function ResourceCard({ resource, idx }: { resource: Resource; idx: number }) {
    const config = getTypeConfig(resource.type);
    const Icon = config.icon;
    const safe = safeUrl(resource.url);
    const isAmazon = safe?.includes("amazon.com");

    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: idx * 0.05 }}
        className="bg-white border border-black/[0.06] rounded-xl overflow-hidden hover:border-black/[0.1] transition-colors"
        data-testid={`card-resource-${idx}`}
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-5 h-5 ${config.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-[15px] font-display font-bold tracking-tight truncate" data-testid={`text-resource-name-${idx}`}>
                  {resource.name}
                </h3>
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${config.bg} ${config.color} shrink-0`}>
                  {config.label}
                </span>
              </div>
              {resource.author && (
                <p className="text-xs text-muted-foreground font-medium mb-1.5" data-testid={`text-resource-author-${idx}`}>
                  by {resource.author}
                </p>
              )}
              <p className="text-sm text-foreground/75 leading-relaxed mb-2" data-testid={`text-resource-desc-${idx}`}>
                {resource.description}
              </p>
              {resource.context && (
                <p className="text-xs text-muted-foreground italic mb-3">
                  "{resource.context}"
                </p>
              )}
              {safe && (
                <a
                  href={safe}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary/[0.08] hover:bg-primary/[0.14] rounded-lg text-xs font-semibold text-primary transition-colors"
                  data-testid={`link-resource-${idx}`}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {isAmazon ? "View on Amazon" : "Visit"}
                </a>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  function ResourceSection({ title, items, startIdx }: { title: string; items: Resource[]; startIdx: number }) {
    if (items.length === 0) return null;
    return (
      <div className="mb-8">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4" data-testid={`text-section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
          {title}
        </h3>
        <div className="space-y-3">
          {items.map((resource, idx) => (
            <ResourceCard key={resource.name + idx} resource={resource} idx={startIdx + idx} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <EpisodePageLayout
      episode={episode}
      podcastSlug={podcastSlug}
      episodeSlug={episodeSlug}
      podcastConfig={podcastConfig}
      activeTab="resources"
      allRecaps={allRecaps}
    >
      <div className="max-w-3xl mx-auto" data-testid="resources-content">
        {resourcesLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4" data-testid="resources-loading">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground font-medium">Extracting resources from transcript...</p>
          </div>
        ) : resourcesError ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center" data-testid="resources-error">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
              <BookOpen className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <p className="text-lg font-display font-bold text-foreground mb-1">Unable to load resources</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                We couldn't extract the resources for this episode right now. Please try again later.
              </p>
            </div>
          </div>
        ) : resources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center" data-testid="resources-empty">
            <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
              <BookOpen className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-lg font-display font-bold text-foreground mb-1">No resources found</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                No books, tools, or resources were mentioned in this episode.
              </p>
            </div>
          </div>
        ) : (
          <div data-testid="resources-list">
            <div className="text-center mb-8">
              <h2 className="text-xl font-display font-bold tracking-tight mb-2" data-testid="text-resources-heading">
                {resources.length} {resources.length === 1 ? "Resource" : "Resources"} Mentioned
              </h2>
              <p className="text-sm text-muted-foreground">
                Books, tools, and recommendations from "{episode.episodeTitle}"
              </p>
            </div>

            <ResourceSection title="Books" items={books} startIdx={0} />
            <ResourceSection title="Tools & Apps" items={tools} startIdx={books.length} />
            <ResourceSection title="Other Resources" items={other} startIdx={books.length + tools.length} />

            {books.length > 0 && (
              <p className="text-[11px] text-muted-foreground/60 text-center mt-6">
                Book links may include affiliate tags. Purchasing through these links supports PodCap at no extra cost to you.
              </p>
            )}
          </div>
        )}
      </div>
    </EpisodePageLayout>
  );
}
