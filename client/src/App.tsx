import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import Home from "./pages/Home";
import NotFound from "./pages/not-found";
import { ExitIntentPopup } from "@/components/ExitIntentPopup";
import { PageConversionProvider } from "@/contexts/PageConversionContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthAwareLayout } from "@/components/AuthAwareLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { useMetaPixelEvents } from "@/hooks/use-meta-pixel-events";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminSetup = lazy(() => import("./pages/AdminSetup"));
const PodcastRouter = lazy(() => import("./pages/PodcastRouter"));
const PodcastSubRouter = lazy(() => import("./pages/PodcastSubRouter"));
const PodcastsExplorer = lazy(() => import("./pages/PodcastsExplorer"));

const EpisodeGuestsPage = lazy(() => import("./pages/EpisodeGuestsPage"));
const EpisodeArchivePage = lazy(() => import("./pages/EpisodeArchivePage"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Cookies = lazy(() => import("./pages/Cookies"));
const Terms = lazy(() => import("./pages/Terms"));
const Support = lazy(() => import("./pages/Support"));
const FeatureRequests = lazy(() => import("./pages/FeatureRequests"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const WeHeartPodcasters = lazy(() => import("./pages/ForPodcasters"));
const GetStarted = lazy(() => import("./pages/GetStarted"));
const Register = lazy(() => import("./pages/Register"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const Enterprise = lazy(() => import("./pages/Enterprise"));
const TopicsDirectory = lazy(() => import("./pages/TopicsDirectory"));
const TopicDetailPage = lazy(() => import("./pages/TopicDetailPage"));
const PodcasterClaim = lazy(() => import("./pages/PodcasterClaim"));
const PodcasterDashboard = lazy(() => import("./pages/PodcasterDashboard"));
const ShopPage = lazy(() => import("./pages/Bookstore"));
const ShopDetailRouter = lazy(() => import("./pages/ShopDetailRouter"));

const FeedPage = lazy(() => import("./pages/FeedPage"));
const DiscoverPage = lazy(() => import("./pages/DiscoverPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const HelpPage = lazy(() => import("./pages/HelpPage"));
const BookmarksPage = lazy(() => import("./pages/BookmarksPage"));
const LogoutPage = lazy(() => import("./pages/LogoutPage"));

const TopicPulsePage = lazy(() => import("./pages/TopicPulsePage"));
const CategoryDirectory = lazy(() => import("./pages/CategoryDirectory"));
const Advertise = lazy(() => import("./pages/Advertise"));
const Disclosure = lazy(() => import("./pages/Disclosure"));
const PodSquad = lazy(() => import("./pages/PodSquad"));
const MyPulsePage = lazy(() => import("./pages/MyPulsePage"));
const MyPodcastsPage = lazy(() => import("./pages/MyPodcastsPage"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const YouTubeReviewPage = lazy(() => import("./pages/YouTubeReviewPage"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" data-testid="page-loader">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function FeatureFlagGuard({ flag, children }: { flag: string; children: React.ReactNode }) {
  const { isEnabled, isLoading } = useFeatureFlags();
  if (isLoading) return <PageLoader />;
  if (!isEnabled(flag)) return <Redirect to="/dashboard" />;
  return <>{children}</>;
}

function PulseGatedTopicPulsePage() {
  return <FeatureFlagGuard flag="pulse"><TopicPulsePage /></FeatureFlagGuard>;
}

function PulseGatedMyPulsePage() {
  return <FeatureFlagGuard flag="pulse"><MyPulsePage /></FeatureFlagGuard>;
}


function MetaPixelEvents() {
  useMetaPixelEvents();
  return null;
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <MetaPixelEvents />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/logout" component={LogoutPage} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/dashboard" component={FeedPage} />
        <Route path="/dashboard/legacy" component={Dashboard} />
        <Route path="/discover" component={DiscoverPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/help" component={HelpPage} />
        <Route path="/bookmarks" component={BookmarksPage} />
        <Route path="/my-podcasts" component={MyPodcastsPage} />
        <Route path="/admin/setup" component={AdminSetup} />
        <Route path="/admin" component={Admin} />
        <Route path="/shop">{() => <AuthAwareLayout><Suspense fallback={<PageLoader />}><ShopPage /></Suspense></AuthAwareLayout>}</Route>
        <Route path="/shop/:slug">{() => <AuthAwareLayout><Suspense fallback={<PageLoader />}><ShopDetailRouter /></Suspense></AuthAwareLayout>}</Route>
        <Route path="/podcasts/:slug/episodes">{() => <AuthAwareLayout><EpisodeArchivePage /></AuthAwareLayout>}</Route>
        <Route path="/podcasts/:podcastSlug/:episodeSlug/guests">{() => <AuthAwareLayout><EpisodeGuestsPage /></AuthAwareLayout>}</Route>
        <Route path="/podcasts/:podcastSlug/:episodeSlug" component={PodcastSubRouter} />
        <Route path="/podcasts/:slug" component={PodcastRouter} />
        <Route path="/podcasts" component={PodcastsExplorer} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/cookies">{() => <AuthAwareLayout><Cookies /></AuthAwareLayout>}</Route>
        <Route path="/terms" component={Terms} />
        <Route path="/support" component={Support} />
        <Route path="/updates" component={FeatureRequests} />
        <Route path="/about" component={About} />
        <Route path="/how-it-works" component={HowItWorks} />
        <Route path="/contact" component={Contact} />
        <Route path="/advertise" component={Advertise} />
        <Route path="/disclosure" component={Disclosure} />
        <Route path="/we-heart-podcasters" component={WeHeartPodcasters} />
        <Route path="/people/:slug">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/people">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/companies/:slug">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/companies">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/get-started">{() => { window.location.replace("/register"); return null; }}</Route>
        <Route path="/lp/:slug" component={LandingPage} />
        <Route path="/register" component={Register} />
        <Route path="/verify-email" component={VerifyEmail} />
        <Route path="/pod-squad" component={PodSquad} />
        <Route path="/refer">{() => { window.location.replace("/pod-squad"); return null; }}</Route>
        <Route path="/enterprise" component={Enterprise} />
        <Route path="/trends">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/industries/:slug/pulse/:date">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/industries/:slug/pulse">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/industries/:slug">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/industries">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/interests/:slug/pulse/:date">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/interests/:slug/pulse">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/interests/:slug">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/interests">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/roles/:slug/pulse/:date">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/roles/:slug/pulse">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/roles/:slug">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/roles">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/insights/:slug/pulse/:date">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/insights/:slug/pulse">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/insights/:slug">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/insights">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/topics/:slug/pulse/:date">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/topics/:slug/pulse">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/topics/:slug">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/topics">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/upgrade">{() => { window.location.replace("/dashboard"); return null; }}</Route>
        <Route path="/pulse">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/podcaster/claim" component={PodcasterClaim} />
        <Route path="/podcaster/verify" component={PodcasterDashboard} />
        <Route path="/podcaster/dashboard/:slug" component={PodcasterDashboard} />
        <Route path="/podcaster/dashboard" component={PodcasterDashboard} />
        <Route path="/youtube-review/:token" component={YouTubeReviewPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <PageConversionProvider>
            <TooltipProvider>
              <Router />
              <ExitIntentPopup />
              <Toaster />
            </TooltipProvider>
          </PageConversionProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
