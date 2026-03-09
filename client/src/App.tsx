import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import Home from "./pages/Home";
import NotFound from "./pages/not-found";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Upgrade = lazy(() => import("./pages/Upgrade"));
const Admin = lazy(() => import("./pages/Admin"));
const PodcastLandingGeneric = lazy(() => import("./pages/PodcastLandingGeneric"));
const EpisodeRecapPage = lazy(() => import("./pages/EpisodeRecapPage"));
const EpisodeTranscriptPage = lazy(() => import("./pages/EpisodeTranscriptPage"));
const EpisodeGuestsPage = lazy(() => import("./pages/EpisodeGuestsPage"));
const EpisodeArchivePage = lazy(() => import("./pages/EpisodeArchivePage"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Support = lazy(() => import("./pages/Support"));
const FeatureRequests = lazy(() => import("./pages/FeatureRequests"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const ForPodcasters = lazy(() => import("./pages/ForPodcasters"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" data-testid="page-loader">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/upgrade" component={Upgrade} />
        <Route path="/admin" component={Admin} />
        <Route path="/podcasts/:slug/episodes" component={EpisodeArchivePage} />
        <Route path="/podcasts/:podcastSlug/:episodeSlug/transcript" component={EpisodeTranscriptPage} />
        <Route path="/podcasts/:podcastSlug/:episodeSlug/guests" component={EpisodeGuestsPage} />
        <Route path="/podcasts/:podcastSlug/:episodeSlug" component={EpisodeRecapPage} />
        <Route path="/podcasts/:slug" component={PodcastLandingGeneric} />
        <Route path="/podcasts" component={Leaderboard} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/terms" component={Terms} />
        <Route path="/support" component={Support} />
        <Route path="/updates" component={FeatureRequests} />
        <Route path="/about" component={About} />
        <Route path="/contact" component={Contact} />
        <Route path="/for-podcasters" component={ForPodcasters} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
