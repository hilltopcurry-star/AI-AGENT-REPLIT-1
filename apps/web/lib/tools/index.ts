import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { setMemory } from "@/lib/memory";
import { detectTemplateKeyWithReason, getTemplate } from "@/lib/templates";

export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (input: ToolInput, context: { userId: string; projectId: string; chatMessages?: { role: string; content: string }[] }) => Promise<ToolResult>;
}

const saveProjectSpec: Tool = {
  name: "save_project_spec",
  description: "Save or update the project specification. Use this after gathering enough information from the user to create a plan.",
  inputSchema: {
    type: "object",
    properties: {
      purpose: { type: "string", description: "What the app does" },
      features: { type: "string", description: "Comma-separated list of features" },
      techStack: { type: "string", description: "Technology preferences" },
      architecture: { type: "string", description: "Architecture overview" },
      milestones: { type: "string", description: "Milestone plan" },
    },
    required: ["purpose", "features"],
  },
  run: async (input, { projectId, chatMessages }) => {
    const purpose = input.purpose as string;
    const features = input.features as string;

    const userPrompts = (chatMessages || [])
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" ");

    const combinedPurpose = userPrompts ? `${purpose} ${userPrompts}` : purpose;
    const combinedFeatures = features;

    console.log(`[SPEC] detectTemplateKey inputLen=${combinedPurpose.length + combinedFeatures.length} preview="${(combinedPurpose + " " + combinedFeatures).slice(0, 120)}"`);

    const matchResult = detectTemplateKeyWithReason(combinedPurpose, combinedFeatures);
    const templateKey = matchResult.templateKey;

    console.log(`[SPEC] Selected templateKey: ${templateKey || "none"}`);
    console.log(`[SPEC] Selection reason: ${matchResult.reason}`);
    for (const s of matchResult.scores) {
      console.log(`[SPEC]   candidate=${s.key} score=${s.score}/${s.threshold} matched=[${s.matched.join(", ")}]`);
    }

    const template = templateKey ? getTemplate(templateKey) : undefined;

    const spec: Record<string, unknown> = {
      purpose,
      features,
      techStack: (input.techStack as string) || "Next.js + Prisma + TailwindCSS",
      architecture: (input.architecture as string) || "",
      milestones: (input.milestones as string) || "",
      generatedBy: "llm",
      createdAt: new Date().toISOString(),
    };

    if (templateKey && template) {
      spec.templateKey = templateKey;
      spec.requiredModules = template.requiredModules;
      spec.requiredRoutes = template.requiredRoutes;
      spec.requiredEntities = template.requiredEntities;
      console.log(`[SPEC] detected templateKey=${templateKey}`);
      console.log(`[SPEC] requiredRoutes=${template.requiredRoutes.length}`);
      console.log(`[SPEC] requiredEntities=${template.requiredEntities.join(",")}`);
    } else {
      console.log(`[SPEC] no template detected for purpose="${purpose.slice(0, 60)}"`);
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { specJson: spec as Prisma.InputJsonValue },
    });

    return {
      success: true,
      message: templateKey
        ? `Project specification saved with template "${templateKey}".`
        : "Project specification saved successfully.",
      data: spec,
    };
  },
};

const setMemoryTool: Tool = {
  name: "set_memory",
  description: "Store a user preference or project detail for future conversations. Use when the user expresses a stable preference (e.g., preferred tech stack, design theme, auth method).",
  inputSchema: {
    type: "object",
    properties: {
      key: { type: "string", description: "Memory key (e.g., 'preferred_stack', 'auth_method', 'design_theme')" },
      value: { type: "string", description: "The value to remember" },
      scope: { type: "string", enum: ["user", "project"], description: "Whether this applies to the user globally or just this project" },
    },
    required: ["key", "value", "scope"],
  },
  run: async (input, { userId, projectId }) => {
    const key = input.key as string;
    const value = input.value as string;
    const scope = (input.scope as "user" | "project") || "project";

    await setMemory({
      userId,
      projectId: scope === "project" ? projectId : undefined,
      scope,
      key,
      value,
    });

    return {
      success: true,
      message: `Remembered: ${key} = ${value}`,
    };
  },
};

export const tools: Tool[] = [saveProjectSpec, setMemoryTool];

export function getToolDefinitions() {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

export async function executeTool(
  name: string,
  args: ToolInput,
  context: { userId: string; projectId: string; chatMessages?: { role: string; content: string }[] }
): Promise<ToolResult> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return { success: false, message: `Unknown tool: ${name}` };
  }
  return tool.run(args, context);
}
