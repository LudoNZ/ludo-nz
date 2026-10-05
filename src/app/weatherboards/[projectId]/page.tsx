"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import EditorHeader from "@/components/weatherboards/editorHeader"
import WeatherboardEditor from "@/components/weatherboards/weatherboardEditor"
import { deleteProject, loadProject, ProjectLocation, saveProject } from "@/components/weatherboards/projectStore"
import { WeatherboardProject } from "@/components/weatherboards/types"

const SAVE_DELAY_MS = 1000

type SaveStatus = "saved" | "pending" | "saving" | "error"

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: "All changes saved",
  pending: "Unsaved changes…",
  saving: "Saving…",
  error: "Couldn't save — your changes will retry on the next edit",
}

/** A saved project, public or private, autosaved a second after each
 * edit. Loaded once rather than subscribed to, so someone else editing
 * the same public project can't yank the page out from under you —
 * last save wins. */
export default function WeatherboardProjectPage() {
  const auth = useAuth()
  const router = useRouter()
  const { projectId } = useParams<{ projectId: string }>()
  const [location, setLocation] = useState<ProjectLocation | null>(null)
  const [project, setProject] = useState<WeatherboardProject | null>(null)
  const [name, setName] = useState("")
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing" | "error">("loading")
  const [status, setStatus] = useState<SaveStatus>("saved")

  // latest values for the debounced / unmount save to read
  const latest = useRef<{ location: ProjectLocation | null; project: WeatherboardProject | null; name: string }>({
    location: null,
    project: null,
    name: "",
  })
  latest.current = { location, project, name }
  const pending = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!auth || auth.authLoading) return
    let cancelled = false
    const uid = auth.currentUser?.uid
    ;(async () => {
      try {
        const candidates: ProjectLocation[] = [{ kind: "public" }, ...(uid ? [{ kind: "private" as const, uid }] : [])]
        for (const loc of candidates) {
          const found = await loadProject(loc, projectId)
          if (cancelled) return
          if (found) {
            setLocation(loc)
            setProject({ settings: found.settings, elevations: found.elevations })
            setName(found.name)
            setLoadState("ready")
            return
          }
        }
        setLoadState("missing")
      } catch (err) {
        console.error("Loading weatherboard project failed", err)
        if (!cancelled) setLoadState("error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [auth, auth?.authLoading, auth?.currentUser, projectId])

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const { location: loc, project: p, name: n } = latest.current
    if (!pending.current || !loc || !p) return
    pending.current = false
    setStatus("saving")
    try {
      await saveProject(loc, projectId, n, p)
      setStatus(pending.current ? "pending" : "saved")
    } catch (err) {
      console.error("Saving weatherboard project failed", err)
      pending.current = true
      setStatus("error")
    }
  }, [projectId])

  const schedule = useCallback(() => {
    pending.current = true
    setStatus("pending")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY_MS)
  }, [flush])

  // save anything still pending when leaving the page, and warn on a tab
  // close that would lose it
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current) e.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => {
      window.removeEventListener("beforeunload", warn)
      void flush()
    }
  }, [flush])

  const update = useCallback(
    (fn: (prev: WeatherboardProject) => WeatherboardProject) => {
      setProject((p) => (p ? fn(p) : p))
      schedule()
    },
    [schedule],
  )

  const rename = (n: string) => {
    setName(n)
    schedule()
  }

  const remove = async () => {
    if (!location || location.kind !== "private") return
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return
    pending.current = false
    if (timer.current) clearTimeout(timer.current)
    await deleteProject(location, projectId)
    router.push("/weatherboards")
  }

  if (loadState !== "ready" || !project || !location) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1rem", textAlign: "center" }}>
        <p style={{ opacity: 0.75, marginBottom: "1rem" }}>
          {loadState === "loading"
            ? "Loading…"
            : loadState === "missing"
              ? "That project doesn't exist, or it's someone else's private project."
              : "Couldn't load that project."}
        </p>
        {loadState !== "loading" && <Link href="/weatherboards">← All projects</Link>}
      </div>
    )
  }

  return (
    <WeatherboardEditor
      project={project}
      setProject={update}
      header={
        <EditorHeader
          name={name}
          onRename={rename}
          badge={location.kind === "public" ? "Public" : "Private"}
          status={
            <>
              {STATUS_TEXT[status]}
              {location.kind === "public" && " · anyone with the link can edit"}
            </>
          }
          actions={
            location.kind === "private" ? (
              <Button size="small" variant="danger" onClick={remove}>
                Delete project
              </Button>
            ) : undefined
          }
        />
      }
    />
  )
}
