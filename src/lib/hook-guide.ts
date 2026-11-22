import knowledge from './hook-knowledge.json'

export type HookTemplate = { id: string; structure: string; use_when: string }

/**
 * Rules, mechanisms and patterns to avoid always apply; retrieved structures are optional support. Mechanisms carry
 * one weak and one strong example each, never fixed sentence templates: v1 handed the writer headline formulas
 * ("Benarkah …?", "Sebelum …, periksa N hal") and every hook came out as the same few moulds. Examples come from
 * unrelated niches, only show the pattern, and are not brand facts.
 */
export function hookGuide(templates: HookTemplate[] = []): string {
  return [
    'Knowledge hook (mekanisme, bukan kalimat cetakan; contoh hanya menunjukkan pola, jangan salin kata atau faktanya):',
    ...knowledge.rules.map((rule) => `- ${rule}`),
    'Mekanisme hook (pilih yang paling cocok dengan isi dan bukti):',
    ...knowledge.mechanisms.map((m) => `- ${m.name}: ${m.how} Lemah: "${m.bad}". Kuat: "${m.good}".`),
    'Hindari:',
    ...knowledge.avoid.map((rule) => `- ${rule}`),
    ...(templates.length > 0
      ? ['Struktur pendukung dari pustaka (opsional; pakai hanya kalau lebih tajam dari mekanisme di atas):', ...templates.slice(0, 3).map((template) => `- ${template.structure} — ${template.use_when}`)]
      : []),
  ].join('\n')
}

/** What a content slide must carry. Patterns show a shape with an unrelated niche; they are not brand facts. */
export function slideGuide(): string {
  return [
    'Knowledge slide isi (pola, bukan cetakan; contoh hanya menunjukkan bentuk, jangan salin kata atau faktanya):',
    ...knowledge.slideRules.map((rule) => `- ${rule}`),
    'Pola slide isi (pilih yang cocok dengan poinnya, variasikan antar slide):',
    ...knowledge.slidePatterns.map((pattern) => `- ${pattern.name} (${pattern.use}) Contoh bentuk: "${pattern.example}"`),
  ].join('\n')
}
