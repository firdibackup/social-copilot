'use client'

import { useRouter } from 'next/navigation'
import { Fragment, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import type { TextDensity } from '@/lib/density-options'
import type { Idea } from '@/lib/ideas'
import type { ContentJob } from '@/lib/content-jobs'
import { BULLET, readScriptText, scriptLines, scriptToText, slideProblem, splitScriptText } from '@/lib/script-options'
import { generateScriptAction, saveScriptAction } from './content-actions'
import { useSaveBeforeNavigation } from './use-save-before-navigation'
import { useQueryClient } from '@tanstack/react-query'
import { editorKeys, type EditorDetail } from './editor-query'
import { useEditorScope } from './editor-provider'
import { createSaveQueue } from './save-queue'

const AUTOSAVE_MS = 1000
const FAILED = 'Gagal menghubungi server. Coba lagi.'
// Stroked rather than a heavier weight: the formatted copy lies under the textarea and must wrap exactly like it.
const BOLD = '[-webkit-text-stroke:0.45px_currentColor]'

export interface ScriptText {
  text: string
  setText: (text: string) => void
  /** The text read as a script: null while it is a plain topic, an error while a slide can't be made. */
  read: ReturnType<typeof readScriptText>
  /** The AI writes the idea's script into the box. */
  writing: boolean
  /** How the idea's script stands, e.g. "Tersimpan"; null without an idea or a script. */
  saveState: string | null
  saveError: string | null
  /** Writes the idea's script again, replacing the text. */
  write: () => Promise<void>
}

/**
 * A new post's composer text. An idea opened without a script gets one written into it at once; the owner edits it
 * as text, and while it reads as a valid script it is saved on the idea by itself.
 */
export function useScriptText(
  idea: Idea | null,
  canWrite: boolean,
  /** How much text the AI puts on each slide when it writes the script. */
  density: TextDensity,
  onError: (message: string) => void,
  job: ContentJob | null = null,
): ScriptText {
  const router = useRouter()
  const client = useQueryClient()
  const scope = useEditorScope()
  const [text, setText] = useState(() => (idea?.script ? scriptToText(idea.script) : (idea?.title ?? '')))
  const [version, setVersion] = useState(0)
  const [savedVersion, setSavedVersion] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [writing, setWriting] = useState(false)
  const writeLock = useRef(false)
  const queued = job?.status === 'pending' || job?.status === 'running'
  const scriptKey = JSON.stringify(idea?.script ?? null)
  const [seenScript, setSeenScript] = useState(scriptKey)
  if (seenScript !== scriptKey) {
    setSeenScript(scriptKey)
    if (idea?.script && version === savedVersion) setText(scriptToText(idea.script))
  }
  const started = useRef(false)
  const read = readScriptText(text)
  const script = read && 'script' in read ? read.script : null
  const unsaved = idea !== null && read !== null && version !== savedVersion

  const [enqueueSave] = useState(createSaveQueue)
  const persist = (upTo: number) => enqueueSave(upTo, () => saveSnapshot(upTo))
  async function saveSnapshot(upTo: number) {
    if (!idea || !script) return false
    setSaving(true)
    const failure = await saveScriptAction({ ideaId: idea.id, script }).catch(() => FAILED)
    setSaving(false)
    setSaveError(failure)
    if (!failure) setSavedVersion((saved) => Math.max(saved, upTo))
    if (!failure) {
      await client.cancelQueries({ queryKey: [...editorKeys.all(scope), 'detail'] })
      client.setQueriesData<EditorDetail>({ queryKey: [...editorKeys.all(scope), 'detail'] }, (current) =>
        current?.idea?.id === idea.id ? { ...current, idea: { ...current.idea, script } } : current)
    }
    return !failure
  }

  const autosave = useEffectEvent((upTo: number) => {
    if (upTo > savedVersion) void persist(upTo)
  })
  useSaveBeforeNavigation(async () => {
    if (!unsaved) return true
    if (!script) {
      setSaveError('Skrip belum valid. Perbaiki sebelum membuka konten lain.')
      return false
    }
    return persist(version)
  })
  useEffect(() => {
    if (version === 0) return
    const timer = setTimeout(() => autosave(version), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [version])

  useEffect(() => {
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  async function write(rewrite = true) {
    if (!idea || writeLock.current || queued) return
    writeLock.current = true
    setWriting(true)
    const result = await generateScriptAction(idea.id, density, rewrite).catch(() => ({ error: FAILED }))
    writeLock.current = false
    setWriting(false)
    if ('error' in result) {
      onError(result.error)
      return
    }
    // The worker will write the script. Accept its next result over the previous local text.
    setSavedVersion(version)
    setSaveError(null)
    router.replace(`/buat?id=${result.postId}`)
    router.refresh()
  }

  const writeFirst = useEffectEvent(() => {
    if (idea && !job && canWrite) void write(false)
  })
  useEffect(() => {
    if (started.current) return
    started.current = true
    writeFirst()
  }, [])

  return {
    text,
    setText: (next) => {
      setText(next)
      setVersion((value) => value + 1)
    },
    read,
    writing: writing || queued,
    saveState:
      !idea || !read ? null : saving ? 'Menyimpan…' : saveError ? null : unsaved ? 'Belum tersimpan' : 'Tersimpan',
    saveError: idea && read ? saveError : null,
    write,
  }
}

/**
 * The composer's text drawn as a script: slide lines in the accent (red while that slide can't be made), titles bold,
 * point markers in the accent. Plain text stays as it is. Only color and stroke change, never the glyph widths.
 */
export function formatScript(text: string): ReactNode {
  const split = splitScriptText(text)
  if (!split) return text
  const lines = scriptLines(text)
  return text.split('\n').map((line, index) => {
    const { kind, slide } = lines[index]
    const failing = kind === 'slide' && slideProblem(split.slides[slide], slide + 1) !== null
    const bullet = kind === 'body' ? BULLET.exec(line) : null
    return (
      <Fragment key={index}>
        {index > 0 && '\n'}
        {kind === 'slide' ? (
          <span className={`${BOLD} ${failing ? 'text-red-600' : 'text-accent'}`}>{line}</span>
        ) : kind === 'title' ? (
          <span className={BOLD}>{line}</span>
        ) : bullet ? (
          <>
            <span className="text-accent">{bullet[1]}</span>
            {bullet[2]}
          </>
        ) : (
          <span className={kind === 'intro' ? 'text-ink-muted' : undefined}>{line}</span>
        )}
      </Fragment>
    )
  })
}
