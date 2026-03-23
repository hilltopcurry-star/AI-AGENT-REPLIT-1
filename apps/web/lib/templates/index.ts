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
let initialized = false;

export function registerTemplate(template: TemplateDefinition) {
  templateRegistry.set(template.key, template);
}

function ensureInitialized() {
  if (!initialized) {
    initialized = true;
    require("./project-management-saas");
  }
}

export function getTemplate(key: string): TemplateDefinition | undefined {
  ensureInitialized();
  return templateRegistry.get(key);
}

export function getAllTemplates(): TemplateDefinition[] {
  ensureInitialized();
  return Array.from(templateRegistry.values());
}

export function detectTemplateKey(purpose: string, features: string): string | null {
  ensureInitialized();
  const combined = `${purpose} ${features}`.toLowerCase();
  for (const template of templateRegistry.values()) {
    const matchCount = template.keywords.filter((kw) => combined.includes(kw)).length;
    if (matchCount >= 2) {
      return template.key;
    }
  }
  return null;
}
