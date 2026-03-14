"use client";

import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Terminal, Database } from "lucide-react";
import { SiGoogle } from "react-icons/si";

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) router.push("/projects");
  }, [session, router]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (session) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold text-foreground" data-testid="text-brand">
            AI Workspace
          </span>
        </div>
        <Button
          data-testid="button-signin-header"
          onClick={() => signIn("google")}
          variant="outline"
          size="sm"
        >
          Sign In
        </Button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-2xl space-y-8">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
            Build software with
            <span className="text-primary"> AI-powered</span> workspace
          </h1>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto">
            Chat with AI to plan, build, and debug applications. Three
            integrated workspace tabs for a complete development experience.
          </p>

          <Button
            data-testid="button-get-started"
            onClick={() => signIn("google")}
            size="lg"
            className="gap-2"
          >
            <SiGoogle className="h-4 w-4" />
            Get Started with Google
          </Button>

          <div className="grid grid-cols-3 gap-4 pt-8 max-w-md mx-auto">
            {[
              { icon: Sparkles, label: "Chat", desc: "AI Assistant" },
              { icon: Terminal, label: "Console", desc: "Build Logs" },
              { icon: Database, label: "Database", desc: "Data Explorer" },
            ].map((tab) => (
              <div
                key={tab.label}
                className="flex flex-col items-center gap-2 p-4 rounded-lg bg-card border border-card-border"
                data-testid={`card-feature-${tab.label.toLowerCase()}`}
              >
                <tab.icon className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium text-foreground">
                  {tab.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {tab.desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-border px-6 py-4 text-center text-sm text-muted-foreground">
        Cloud-agnostic AI workspace
      </footer>
    </div>
  );
}
