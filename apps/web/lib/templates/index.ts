import { projectManagementSaasTemplate } from "./project-management-saas";
import { aiChatSaasTemplate } from "./ai-chat-saas";

export interface TemplateFile {
  path: string;
  content: string;
}

export interface TemplateDefinition {
  key: string;
  name: string;
  description: string;
  keywords: string[];
  uiKeywords?: string[];
  requiredModules: string[];
  requiredRoutes: string[];
  requiredEntities: string[];
  getFiles: () => TemplateFile[];
  getPackageJson: () => Record<string, unknown>;
}

const templateRegistry = new Map<string, TemplateDefinition>();

templateRegistry.set(projectManagementSaasTemplate.key, projectManagementSaasTemplate);
templateRegistry.set(aiChatSaasTemplate.key, aiChatSaasTemplate);

export function getTemplate(key: string): TemplateDefinition | undefined {
  if (key === "ai-chat-saas") {
    return aiChatSaasTemplate;
  }
  return templateRegistry.get(key);
}

export function getAllTemplates(): TemplateDefinition[] {
  return Array.from(templateRegistry.values());
}

export function detectTemplateKey(purpose: string, features: string): string | null {
  const combined = `${purpose} ${features}`.toLowerCase();

  for (const template of templateRegistry.values()) {
    if (template.key === "ai-chat-saas") {
      if (!isTemplateEnabled("ai-chat-saas")) continue;
      const aiKeywordHits = template.keywords.filter((kw) => combined.includes(kw)).length;
      const uiKeywords = template.uiKeywords || [];
      const uiKeywordHits = uiKeywords.filter((kw) => combined.includes(kw)).length;
      if (aiKeywordHits >= 2 && uiKeywordHits >= 1) {
        return template.key;
      }
      continue;
    }

    const matchCount = template.keywords.filter((kw) => combined.includes(kw)).length;
    if (matchCount >= 2) {
      return template.key;
    }
  }
  return null;
}

export function isTemplateEnabled(key: string): boolean {
  if (key === "ai-chat-saas") {
    return process.env.ENABLE_AI_CHAT_TEMPLATE === "1" || process.env.ENABLE_AI_CHAT_TEMPLATE === "true";
  }
  return templateRegistry.has(key);
}
