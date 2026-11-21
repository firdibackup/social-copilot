import knowledge from './hook-knowledge.json'

export type HookTemplate = { id: string; structure: string; use_when: string }

/** General rules always apply; only retrieved structures enter the prompt, never example claims. */
export function hookGuide(templates: HookTemplate[] = []): string {
  return [
    'Knowledge struktur hook (pilih satu yang paling relevan):',
    ...knowledge.rules.map((rule) => `- ${rule}`),
    ...templates.slice(0, 3).map((template) => `- ${template.structure} — ${template.use_when}`),
  ].join('\n')
}
