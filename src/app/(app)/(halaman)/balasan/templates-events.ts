/** The + Auto DM button and the ✎ next to template chips sit apart from Aturan Auto DM; this event opens it. */
const EVENT = 'balasan:aturan'

export interface OpenRulesDetail {
  /** Also open the form for a new rule. */
  newRule: boolean
}

export function openRules(newRule: boolean): void {
  window.dispatchEvent(new CustomEvent<OpenRulesDetail>(EVENT, { detail: { newRule } }))
}

export function onOpenRules(listener: (detail: OpenRulesDetail) => void): () => void {
  const handle = (event: Event) => listener((event as CustomEvent<OpenRulesDetail>).detail)
  window.addEventListener(EVENT, handle)
  return () => window.removeEventListener(EVENT, handle)
}
