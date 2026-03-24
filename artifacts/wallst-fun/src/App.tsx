import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { RootLayout } from "@/components/layout/RootLayout";
import Dashboard from "@/pages/dashboard";
import LiveTradesPage from "@/pages/live-trades";
import PortfolioPage from "@/pages/portfolio";
import XFeedPage from "@/pages/x-feed";
import ScopePage from "@/pages/scope";
import AgentBioPage from "@/pages/agent-bio";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <RootLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/live-trades" component={LiveTradesPage} />
        <Route path="/portfolio" component={PortfolioPage} />
        <Route path="/x-feed" component={XFeedPage} />
        <Route path="/viral-trends" component={ScopePage} />
        <Route path="/agent-bio" component={AgentBioPage} />
        <Route component={NotFound} />
      </Switch>
    </RootLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
