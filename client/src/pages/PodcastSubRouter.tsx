import { useParams } from "wouter";
import { ALL_CATEGORY_SLUGS } from "@/data/podcastCategoryData";
import { lazy, Suspense } from "react";

const PodcastTopicPage = lazy(() => import("./PodcastTopicPage"));
const EpisodeRecapPage = lazy(() => import("./EpisodeRecapPage"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" data-testid="page-loader">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function PodcastSubRouter() {
  const { podcastSlug } = useParams<{ podcastSlug: string; episodeSlug: string }>();

  if (podcastSlug && ALL_CATEGORY_SLUGS.includes(podcastSlug)) {
    return (
      <Suspense fallback={<PageLoader />}>
        <PodcastTopicPage />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <EpisodeRecapPage />
    </Suspense>
  );
}
