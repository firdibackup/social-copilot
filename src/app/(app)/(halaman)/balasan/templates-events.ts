/** The ✎ next to the template chips sits apart from Template balasan; this event opens it. */
const EVENT = 'balasan:template'

export function openTemplates(): void {
  window.dispatchEvent(new Event(EVENT))
}

export function onOpenTemplates(listener: () => void): () => void {
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
