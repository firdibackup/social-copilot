import knowledge from './hook-knowledge.json'

/** Only structures and their eligibility enter the prompt, never example claims or visual/video recipes. */
export function hookGuide(): string {
  return [
    'Knowledge struktur hook (pilih satu yang paling relevan):',
    ...knowledge.rules.map((rule) => `- ${rule}`),
    ...knowledge.templates.map((template) => `- ${template.structure} — ${template.useWhen}`),
  ].join('\n')
}
