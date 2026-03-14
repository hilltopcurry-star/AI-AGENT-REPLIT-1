import { Sparkles, Brain, Zap, Globe, Shield, MessageSquare } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background" data-testid="landing-page">
      <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="w-4.5 h-4.5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">AI Chat</span>
          </div>
          <a
            href="/api/login"
            className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity text-sm"
            data-testid="button-login"
          >
            Sign In
          </a>
        </div>
      </nav>

      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
            Your Intelligent{" "}
            <span className="text-primary">AI Assistant</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Chat with an advanced AI that remembers your entire conversation, responds in any language, 
            and provides expert-level assistance across every domain.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <a
              href="/api/login"
              className="px-8 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-opacity text-base"
              data-testid="button-get-started"
            >
              Start Chatting
            </a>
          </div>
        </div>
      </section>

      <section className="py-20 px-6 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Built for Power Users
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Brain,
                title: "Long Memory",
                desc: "Maintains full conversation context with intelligent summarization. Never loses track of your discussion.",
              },
              {
                icon: Zap,
                title: "Streaming Responses",
                desc: "Real-time streaming for instant feedback. See responses as they're generated, word by word.",
              },
              {
                icon: Globe,
                title: "Multi-Language",
                desc: "Automatically responds in your language. Supports English, Urdu, Hindi, Arabic, Vietnamese, and more.",
              },
              {
                icon: Shield,
                title: "Honest & Accurate",
                desc: "Never bluffs or halluccinates. If unsure, it says so. You can trust the answers you receive.",
              },
              {
                icon: MessageSquare,
                title: "ChatGPT-Style UI",
                desc: "Clean, modern interface with dark mode, conversation management, and markdown support.",
              },
              {
                icon: Sparkles,
                title: "Expert Intelligence",
                desc: "Powered by the latest AI models. Expert-level knowledge in coding, writing, analysis, and more.",
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="bg-card border border-border rounded-xl p-6 hover:shadow-md transition-shadow"
              >
                <feature.icon className="w-10 h-10 text-primary mb-4" />
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm text-muted-foreground">
          <span>AI Chat</span>
          <span>Powered by Advanced AI</span>
        </div>
      </footer>
    </div>
  );
}
