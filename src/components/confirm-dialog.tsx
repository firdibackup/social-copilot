'use client'

import { CircleHelp, Info, TriangleAlert } from 'lucide-react'
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'

export interface ConfirmOptions {
  title: string
  description?: ReactNode
  /** Default 'Lanjutkan'. */
  confirmLabel?: string
  /** Default 'Batal'. */
  cancelLabel?: string
  /** danger = destructive red confirm button, warning icon. */
  tone?: 'default' | 'danger'
}

export interface AlertOptions {
  title: string
  description?: ReactNode
  /** Default 'Oke'. */
  okLabel?: string
  tone?: 'default' | 'danger'
}

type Request =
  | { id: number; kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void; returnFocus: HTMLElement | null }
  | { id: number; kind: 'alert'; options: AlertOptions; resolve: () => void; returnFocus: HTMLElement | null }

/*
 * A module-level queue, so confirmDialog/alertDialog work from any event handler (not only inside hooks).
 * DialogHost, mounted once in the root layout, shows the head of the queue.
 */
let queue: readonly Request[] = []
let nextId = 1
let hosts = 0
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => queue
const getServerSnapshot = (): readonly Request[] => []

function enqueue(request: Request) {
  queue = [...queue, request]
  emit()
}

function dequeue(id: number) {
  queue = queue.filter((request) => request.id !== id)
  emit()
}

/** Plain text for the native fallback when no host is mounted. */
function plain(title: string, description: ReactNode): string {
  return typeof description === 'string' || typeof description === 'number' ? `${title}\n\n${description}` : title
}

function activeElement(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null
}

/** Asks the owner to confirm; resolves true on confirm, false on cancel, Esc or a click outside. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (hosts === 0) return Promise.resolve(window.confirm(plain(options.title, options.description)))
  return new Promise<boolean>((resolve) => {
    enqueue({ id: nextId++, kind: 'confirm', options, resolve, returnFocus: activeElement() })
  })
}

/** Tells the owner something; resolves once the dialog is dismissed. */
export function alertDialog(options: AlertOptions): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (hosts === 0) {
    window.alert(plain(options.title, options.description))
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    enqueue({ id: nextId++, kind: 'alert', options, resolve, returnFocus: activeElement() })
  })
}

/** Renders queued confirm/alert dialogs. Mount once, at the app root. */
export function DialogHost(): ReactNode {
  const requests = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    hosts++
    return () => {
      hosts--
    }
  }, [])

  const current = requests[0]
  return current ? <QueuedDialog key={current.id} request={current} /> : null
}

const EXIT_MS = 150

const BUTTON =
  'inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:min-h-10 sm:w-auto sm:min-w-24'
const CANCEL = `${BUTTON} border border-hairline bg-white text-ink hover:bg-zinc-50 active:bg-zinc-100`
const PRIMARY = `${BUTTON} bg-accent text-white shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_1px_2px_rgb(20_21_31/0.12)] hover:bg-accent-deep`
const DANGER = `${BUTTON} bg-red-600 text-white shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_1px_2px_rgb(20_21_31/0.12)] hover:bg-red-700 focus-visible:outline-red-600`

function QueuedDialog({ request }: { request: Request }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)
  const settled = useRef(false)
  const pressedBackdrop = useRef(false)
  const [closing, setClosing] = useState(false)
  const titleId = useId()
  const descriptionId = useId()

  const { options } = request
  const danger = options.tone === 'danger'
  const isConfirm = request.kind === 'confirm'

  useEffect(() => {
    const node = dialog.current
    if (!node) return
    if (!node.open) node.showModal()
    // Danger asks are safest on Batal; everything else lands on the action.
    const target = isConfirm && danger ? cancelButton.current : confirmButton.current
    target?.focus()
  }, [isConfirm, danger])

  function settle(confirmed: boolean) {
    if (settled.current) return
    settled.current = true
    // Resolve right away so the caller is not held up by the exit animation.
    if (request.kind === 'confirm') request.resolve(confirmed)
    else request.resolve()

    const finish = () => {
      dialog.current?.close()
      const back = request.returnFocus
      if (back && back.isConnected) back.focus({ preventScroll: true })
      dequeue(request.id)
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) finish()
    else {
      setClosing(true)
      window.setTimeout(finish, EXIT_MS)
    }
  }

  const Icon = danger ? TriangleAlert : isConfirm ? CircleHelp : Info
  const confirmLabel = isConfirm ? (request.options.confirmLabel ?? 'Lanjutkan') : (request.options.okLabel ?? 'Oke')
  const cancelLabel = isConfirm ? (request.options.cancelLabel ?? 'Batal') : null

  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={options.description ? descriptionId : undefined}
      data-closing={closing ? '' : undefined}
      onCancel={(event) => {
        // Esc: animate out through settle instead of the instant native close.
        event.preventDefault()
        settle(false)
      }}
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        // The dialog element itself is only hit outside the panel, on the backdrop; a drag that starts inside the
        // panel and ends outside does not count.
        if (event.target === event.currentTarget && pressedBackdrop.current) settle(false)
      }}
      className="m-auto w-[min(26rem,calc(100%-2rem))] max-w-none overflow-visible rounded-2xl bg-transparent p-0 text-ink transition-[opacity,scale,translate] duration-150 ease-out backdrop:bg-[rgba(20,21,31,0.36)] backdrop:backdrop-blur-[3px] backdrop:transition-opacity backdrop:duration-150 data-closing:translate-y-1 data-closing:scale-[0.97] data-closing:opacity-0 data-closing:backdrop:opacity-0"
    >
      <div className="rounded-2xl border border-hairline bg-white p-5 shadow-[0_24px_60px_-12px_rgb(20_21_31/0.28),0_2px_6px_rgb(20_21_31/0.06)] sm:p-6">
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:gap-4 sm:text-left">
          <span
            aria-hidden="true"
            className={`flex size-11 shrink-0 items-center justify-center rounded-full ring-8 ${
              danger ? 'bg-red-50 text-red-600 ring-red-50/50' : 'bg-accent-soft text-accent ring-accent-soft/40'
            }`}
          >
            <Icon size={20} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 space-y-1.5 sm:pt-1.5">
            <h2 id={titleId} className="text-lg leading-snug font-semibold text-balance text-ink">
              {options.title}
            </h2>
            {options.description ? (
              <div id={descriptionId} className="text-sm leading-relaxed text-pretty text-ink-muted [&_p+p]:mt-2">
                {options.description}
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {cancelLabel !== null && (
            <button ref={cancelButton} type="button" onClick={() => settle(false)} className={CANCEL}>
              {cancelLabel}
            </button>
          )}
          <button ref={confirmButton} type="button" onClick={() => settle(true)} className={danger ? DANGER : PRIMARY}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
