import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import Home from "./pages/Home";
import NotFound from "./pages/not-found";
import { ExitIntentPopup } from "@/components/ExitIntentPopup";
import { PageConversionProvider } from "@/contexts/PageConversionContext";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Upgrade = lazy(() => import("./pages/Upgrade"));
const Admin = lazy(() => import("./pages/Admin"));
const PodcastRouter = lazy(() => import("./pages/PodcastRouter"));
const PodcastSubRouter = lazy(() => import("./pages/PodcastSubRouter"));
const PodcastsExplorer = lazy(() => import("./pages/PodcastsExplorer"));

const EpisodeGuestsPage = lazy(() => import("./pages/EpisodeGuestsPage"));
const EpisodeArchivePage = lazy(() => import("./pages/EpisodeArchivePage"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Support = lazy(() => import("./pages/Support"));
const FeatureRequests = lazy(() => import("./pages/FeatureRequests"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const WeHeartPodcasters = lazy(() => import("./pages/ForPodcasters"));
const PeopleDirectory = lazy(() => import("./pages/PeopleDirectory"));
const PersonDetailPage = lazy(() => import("./pages/PersonDetailPage"));
const CompaniesDirectory = lazy(() => import("./pages/CompaniesDirectory"));
const CompanyDetailPage = lazy(() => import("./pages/CompanyDetailPage"));
const GetStarted = lazy(() => import("./pages/GetStarted"));
const Register = lazy(() => import("./pages/Register"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const Enterprise = lazy(() => import("./pages/Enterprise"));
const TopicsDirectory = lazy(() => import("./pages/TopicsDirectory"));
const TopicDetailPage = lazy(() => import("./pages/TopicDetailPage"));
const PodcasterClaim = lazy(() => import("./pages/PodcasterClaim"));
const PodcasterDashboard = lazy(() => import("./pages/PodcasterDashboard"));
const Bookstore = lazy(() => import("./pages/Bookstore"));
const BookDetailPage = lazy(() => import("./pages/BookDetailPage"));
const Shop = lazy(() => import("./pages/Shop"));
const TrendsPage = lazy(() => import("./pages/TrendsPage"));
const TopicPulsePage = lazy(() => import("./pages/TopicPulsePage"));
const CategoryDirectory = lazy(() => import("./pages/CategoryDirectory"));
const Advertise = lazy(() => import("./pages/Advertise"));

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
        <Route path="/bookstore" component={Bookstore} />
        <Route path="/bookstore/:bookSlug" component={BookDetailPage} />
        <Route path="/shop" component={Shop} />
        <Route path="/podcasts/:slug/episodes" component={EpisodeArchivePage} />
        <Route path="/podcasts/:podcastSlug/:episodeSlug/guests" component={EpisodeGuestsPage} />
        <Route path="/podcasts/:podcastSlug/:episodeSlug" component={PodcastSubRouter} />
        <Route path="/podcasts/:slug" component={PodcastRouter} />
        <Route path="/podcasts" component={PodcastsExplorer} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/terms" component={Terms} />
        <Route path="/support" component={Support} />
        <Route path="/updates" component={FeatureRequests} />
        <Route path="/about" component={About} />
        <Route path="/contact" component={Contact} />
        <Route path="/advertise" component={Advertise} />
        <Route path="/we-heart-podcasters" component={WeHeartPodcasters} />
        <Route path="/people/:slug" component={PersonDetailPage} />
        <Route path="/people" component={PeopleDirectory} />
        <Route path="/companies/:slug" component={CompanyDetailPage} />
        <Route path="/companies" component={CompaniesDirectory} />
        <Route path="/get-started">{() => { window.location.replace("/register"); return null; }}</Route>
        <Route path="/register" component={Register} />
        <Route path="/verify-email" component={VerifyEmail} />
        <Route path="/enterprise" component={Enterprise} />
        <Route path="/trends" component={TrendsPage} />
        <Route path="/industries/:slug/pulse/:date" component={TopicPulsePage} />
        <Route path="/industries/:slug/pulse" component={TopicPulsePage} />
        <Route path="/industries/:slug" component={TopicDetailPage} />
        <Route path="/industries" component={CategoryDirectory} />
        <Route path="/interests/:slug/pulse/:date" component={TopicPulsePage} />
        <Route path="/interests/:slug/pulse" component={TopicPulsePage} />
        <Route path="/interests/:slug" component={TopicDetailPage} />
        <Route path="/interests" component={CategoryDirectory} />
        <Route path="/roles/:slug/pulse/:date" component={TopicPulsePage} />
        <Route path="/roles/:slug/pulse" component={TopicPulsePage} />
        <Route path="/roles/:slug" component={TopicDetailPage} />
        <Route path="/roles" component={CategoryDirectory} />
        <Route path="/insights/:slug/pulse/:date" component={TopicPulsePage} />
        <Route path="/insights/:slug/pulse" component={TopicPulsePage} />
        <Route path="/insights/:slug" component={TopicDetailPage} />
        <Route path="/insights" component={TopicsDirectory} />
        <Route path="/topics/:slug/pulse/:date" component={TopicPulsePage} />
        <Route path="/topics/:slug/pulse" component={TopicPulsePage} />
        <Route path="/topics/:slug" component={TopicDetailPage} />
        <Route path="/topics" component={TopicsDirectory} />
        <Route path="/podcaster/claim" component={PodcasterClaim} />
        <Route path="/podcaster/verify" component={PodcasterDashboard} />
        <Route path="/podcaster/dashboard/:slug" component={PodcasterDashboard} />
        <Route path="/podcaster/dashboard" component={PodcasterDashboard} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PageConversionProvider>
        <TooltipProvider>
          <Router />
          <ExitIntentPopup />
          <Toaster />
        </TooltipProvider>
      </PageConversionProvider>
    </QueryClientProvider>
  );
}

export default App;
