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
import PodcastLandingMFM from "./pages/PodcastLanding";
import PodcastLandingEmpowerHer from "./pages/PodcastLandingEmpowerHer";
import Leaderboard from "./pages/Leaderboard";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import NotFound from "./pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/upgrade" component={Upgrade} />
      <Route path="/admin" component={Admin} />
      <Route path="/podcasts/myfirstmillion" component={PodcastLandingMFM} />
      <Route path="/podcasts/empowerher" component={PodcastLandingEmpowerHer} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
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
