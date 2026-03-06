import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Upgrade from "./pages/Upgrade";
import Admin from "./pages/Admin";
import PodcastLandingGeneric from "./pages/PodcastLandingGeneric";
import EpisodeRecapPage from "./pages/EpisodeRecapPage";
import EpisodeArchivePage from "./pages/EpisodeArchivePage";
import Leaderboard from "./pages/Leaderboard";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Support from "./pages/Support";
import PodcastDeals from "./pages/PodcastDeals";
import FeatureRequests from "./pages/FeatureRequests";
import About from "./pages/About";
import Contact from "./pages/Contact";
import NotFound from "./pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/upgrade" component={Upgrade} />
      <Route path="/admin" component={Admin} />
      <Route path="/podcasts/:slug/episodes" component={EpisodeArchivePage} />
      <Route path="/podcasts/:podcastSlug/:episodeSlug" component={EpisodeRecapPage} />
      <Route path="/podcasts/:slug" component={PodcastLandingGeneric} />
      <Route path="/podcasts" component={Leaderboard} />
      <Route path="/podcast-deals" component={PodcastDeals} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/support" component={Support} />
      <Route path="/updates" component={FeatureRequests} />
      <Route path="/about" component={About} />
      <Route path="/contact" component={Contact} />
      <Route component={NotFound} />
    </Switch>
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
