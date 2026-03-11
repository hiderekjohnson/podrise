import { lazy, Suspense } from "react";

const EpisodeRecapPage = lazy(() => import("./EpisodeRecapPage"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" data-testid="page-loader">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function PodcastSubRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <EpisodeRecapPage />
    </Suspense>
  );
}
