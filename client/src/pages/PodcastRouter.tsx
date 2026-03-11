import { useParams } from "wouter";
import { ALL_CATEGORY_SLUGS } from "@/data/podcastCategoryData";
import { lazy, Suspense } from "react";

const PodcastCategoryPage = lazy(() => import("./PodcastCategoryPage"));
const PodcastLandingGeneric = lazy(() => import("./PodcastLandingGeneric"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" data-testid="page-loader">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function PodcastRouter() {
  const { slug } = useParams<{ slug: string }>();

  if (slug && ALL_CATEGORY_SLUGS.includes(slug)) {
    return (
      <Suspense fallback={<PageLoader />}>
        <PodcastCategoryPage />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <PodcastLandingGeneric />
    </Suspense>
  );
}
