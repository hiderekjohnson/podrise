import { lazy, Suspense } from "react";
import { AuthAwareLayout } from "@/components/AuthAwareLayout";

const PodcastLandingGeneric = lazy(() => import("./PodcastLandingGeneric"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" data-testid="page-loader">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function PodcastRouter() {
  return (
    <AuthAwareLayout hideRightSidebar>
      <Suspense fallback={<PageLoader />}>
        <PodcastLandingGeneric />
      </Suspense>
    </AuthAwareLayout>
  );
}
