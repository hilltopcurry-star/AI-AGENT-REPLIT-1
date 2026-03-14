import { Switch, Route } from "wouter";
import { useAuth } from "./hooks/use-auth";
import LandingPage from "./pages/landing";
import ChatPage from "./pages/chat";
import Sidebar from "./components/sidebar";
import { useState } from "react";
import { Menu, X } from "lucide-react";

function App() {
  const { isLoading, isAuthenticated } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background" data-testid="loading-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <button
        className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-background border border-border shadow-md"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        data-testid="button-toggle-sidebar"
      >
        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 fixed md:relative z-40 transition-transform duration-200 ease-in-out`}>
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      <Switch>
        <Route path="/" component={ChatPage} />
        <Route path="/chat/:id" component={ChatPage} />
        <Route>
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">Page not found</p>
          </div>
        </Route>
      </Switch>
    </div>
  );
}

export default App;
