import { projectManagementSaasTemplate } from "./project-management-saas";
import { aiChatSaasTemplate } from "./ai-chat-saas";
import { aiVideoGeneratorSaasTemplate } from "./ai-video-generator-saas";

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

export interface TemplateMatchResult {
  templateKey: string | null;
  reason: string;
  scores: { key: string; score: number; threshold: number; matched: string[] }[];
}

const templateRegistry = new Map<string, TemplateDefinition>();

templateRegistry.set(projectManagementSaasTemplate.key, projectManagementSaasTemplate);
templateRegistry.set(aiChatSaasTemplate.key, aiChatSaasTemplate);
templateRegistry.set(aiVideoGeneratorSaasTemplate.key, aiVideoGeneratorSaasTemplate);

export function getTemplate(key: string): TemplateDefinition | undefined {
  return templateRegistry.get(key);
}

export function getAllTemplates(): TemplateDefinition[] {
  return Array.from(templateRegistry.values());
}

export function detectTemplateKeyWithReason(purpose: string, features: string): TemplateMatchResult {
  const combined = `${purpose} ${features}`.toLowerCase();
  const scores: TemplateMatchResult["scores"] = [];
  let bestMatch: string | null = null;
  let bestScore = 0;
  let bestReason = "";

  for (const template of templateRegistry.values()) {
    if (template.key === "ai-chat-saas") {
      if (!isTemplateEnabled("ai-chat-saas")) {
        scores.push({ key: template.key, score: 0, threshold: 2, matched: ["(disabled via ENABLE_AI_CHAT_TEMPLATE)"] });
        continue;
      }
      const matchedKeywords = template.keywords.filter((kw) => combined.includes(kw));
      const uiKeywords = template.uiKeywords || [];
      const matchedUiKeywords = uiKeywords.filter((kw) => combined.includes(kw));
      const totalScore = matchedKeywords.length + matchedUiKeywords.length;
      scores.push({
        key: template.key,
        score: totalScore,
        threshold: 3,
        matched: [...matchedKeywords.map(k => `kw:${k}`), ...matchedUiKeywords.map(k => `ui:${k}`)],
      });
      if (matchedKeywords.length >= 2 && matchedUiKeywords.length >= 1) {
        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestMatch = template.key;
          bestReason = `Matched ${matchedKeywords.length} keywords [${matchedKeywords.join(", ")}] + ${matchedUiKeywords.length} UI keywords [${matchedUiKeywords.join(", ")}]`;
        }
      }
      continue;
    }

    const matchedKeywords = template.keywords.filter((kw) => combined.includes(kw));
    scores.push({
      key: template.key,
      score: matchedKeywords.length,
      threshold: 2,
      matched: matchedKeywords,
    });
    if (matchedKeywords.length >= 2 && matchedKeywords.length > bestScore) {
      bestScore = matchedKeywords.length;
      bestMatch = template.key;
      bestReason = `Matched ${matchedKeywords.length} keywords [${matchedKeywords.join(", ")}]`;
    }
  }

  if (!bestMatch) {
    const availableKeys = Array.from(templateRegistry.keys()).join(", ");
    bestReason = `No template matched. Available templates: [${availableKeys}]. Scores: ${scores.map(s => `${s.key}=${s.score}/${s.threshold}`).join(", ")}`;
  }

  return { templateKey: bestMatch, reason: bestReason, scores };
}

export function detectTemplateKey(purpose: string, features: string): string | null {
  return detectTemplateKeyWithReason(purpose, features).templateKey;
}

export function isTemplateEnabled(key: string): boolean {
  if (key === "ai-chat-saas") {
    return process.env.ENABLE_AI_CHAT_TEMPLATE === "1" || process.env.ENABLE_AI_CHAT_TEMPLATE === "true";
  }
  return templateRegistry.has(key);
}
