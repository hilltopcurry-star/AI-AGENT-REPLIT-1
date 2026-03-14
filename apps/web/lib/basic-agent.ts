import type { AgentMode } from "./mock-agent";

interface BasicAgentInput {
  message: string;
  mode: AgentMode;
  projectSpec?: Record<string, unknown> | null;
}

interface BasicAgentResponse {
  response: string;
  shouldCreateJob: boolean;
  showConfirmButton?: boolean;
}

const LARGE_OUTPUT_KEYWORDS = [
  "5000 word", "10000 word", "write me a full", "generate a complete",
  "write an entire", "long document", "full report", "detailed essay",
  "write a book", "comprehensive guide",
];

const BUILD_EXACT = "build it";

function isLargeOutputRequest(msg: string): boolean {
  const lower = msg.toLowerCase();
  return LARGE_OUTPUT_KEYWORDS.some((kw) => lower.includes(kw));
}

export function processBasicMessage(input: BasicAgentInput): BasicAgentResponse {
  const { message, mode, projectSpec } = input;
  const lower = message.toLowerCase().trim();

  if (mode === "Build") {
    if (lower === BUILD_EXACT) {
      return {
        response: "**Mock build simulation started.** Switch to the **Console** tab to watch the simulated build logs.\n\nThis is a Phase-1 mock build — no files will be created or modified. Each log line is a real `JobLog` row in the database, streamed to the Console via SSE.",
        shouldCreateJob: true,
      };
    }

    const hasSpec = !!projectSpec;
    if (hasSpec) {
      return {
        response: "Your project plan is ready. Type exactly **Build it** to start the build. Basic Mode can still run builds if you have credits.",
        shouldCreateJob: false,
        showConfirmButton: true,
      };
    }

    return {
      response: "Switch to **Plan** mode first to create a project plan, then come back to **Build** mode and type **Build it**.",
      shouldCreateJob: false,
    };
  }

  if (isLargeOutputRequest(lower)) {
    return {
      response: "Basic Mode can't generate large documents. Add AI quota from the [Billing page](/billing) or ask for a shorter outline.",
      shouldCreateJob: false,
    };
  }

  if (mode === "Plan") {
    if (projectSpec) {
      return {
        response: "You already have a project plan saved. You can switch to **Build** mode and type **Build it** to start building, or tell me what you'd like to change about the plan.",
        shouldCreateJob: false,
      };
    }
    return {
      response: "I'm running in Basic Mode right now, so I can't do full AI planning. Could you describe your project in a few sentences? I'll help with what I can, or you can add AI quota from the [Billing page](/billing) for the full planning experience.",
      shouldCreateJob: false,
    };
  }

  if (mode === "Improve") {
    if (!projectSpec) {
      return {
        response: "No project spec found yet. Switch to **Plan** mode first to create one, then I can suggest improvements.",
        shouldCreateJob: false,
      };
    }
    return {
      response: "Here are some common improvements to consider:\n\n- **Performance**: Add caching and lazy loading\n- **Security**: Enable rate limiting and input validation\n- **UX**: Add loading states and error boundaries\n\nFor detailed AI-powered analysis, add AI quota from the [Billing page](/billing).",
      shouldCreateJob: false,
    };
  }

  if (mode === "Debug") {
    return {
      response: "I'm in Basic Mode, so I can offer general debugging guidance:\n\n1. Check the **Console** tab for error logs\n2. Verify data in the **Database** tab\n3. Look for common issues: missing env vars, type errors, async race conditions\n\nCould you describe the specific issue you're seeing?",
      shouldCreateJob: false,
    };
  }

  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    return {
      response: "Hello! I'm currently in Basic Mode. I can help with general questions and you can still build and deploy your project. For full AI capabilities, add AI quota from the [Billing page](/billing).",
      shouldCreateJob: false,
    };
  }

  if (lower.includes("help") || lower.includes("what can you do")) {
    return {
      response: "I'm in Basic Mode. Here's what I can help with:\n\n- **Discuss**: Answer general questions about your project\n- **Plan**: Basic guidance (full AI planning needs quota)\n- **Build**: Run builds if you have credits (type **Build it**)\n- **Improve**: General improvement suggestions\n- **Debug**: Guided debugging steps\n\nFor full AI responses, add quota from the [Billing page](/billing).",
      shouldCreateJob: false,
    };
  }

  return {
    response: "Thanks for your message. I'm in Basic Mode right now, so my responses are limited. I can still help with building and deploying your project. What would you like to do?",
    shouldCreateJob: false,
  };
}
