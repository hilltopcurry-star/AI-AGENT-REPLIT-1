import { projectManagementSaasTemplate } from "./project-management-saas";

export interface TemplateFile {
  path: string;
  content: string;
}

export interface TemplateDefinition {
  key: string;
  name: string;
  description: string;
  keywords: string[];
  requiredModules: string[];
  requiredRoutes: string[];
  requiredEntities: string[];
  getFiles: () => TemplateFile[];
  getPackageJson: () => Record<string, unknown>;
}

const templateRegistry = new Map<string, TemplateDefinition>();

templateRegistry.set(projectManagementSaasTemplate.key, projectManagementSaasTemplate);

export function getTemplate(key: string): TemplateDefinition | undefined {
  return templateRegistry.get(key);
}

export function getAllTemplates(): TemplateDefinition[] {
  return Array.from(templateRegistry.values());
}

export function detectTemplateKey(purpose: string, features: string): string | null {
  const combined = `${purpose} ${features}`.toLowerCase();
  for (const template of templateRegistry.values()) {
    const matchCount = template.keywords.filter((kw) => combined.includes(kw)).length;
    if (matchCount >= 2) {
      return template.key;
    }
  }
  return null;
}
