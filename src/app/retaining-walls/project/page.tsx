"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import EditorHeader from "@/components/weatherboards/editorHeader"
import { WallProject } from "@/components/retainingWall/wallProject"
import { deleteProject, loadProject, makeProjectPublic, ProjectLocation, saveProject } from "@/components/retainingWall/wallProjectStore"
import { activityProject, logWallActivity } from "@/components/retainingWall/wallActivity"
import type { WallActivity } from "@/components/retainingWall/wallHistory"
import RetainingWallEditor from "../retainingWallEditor"

const SAVE_DELAY_MS = 1000

type LoadState = "loading" | "ready" | "missing" | "offline" | "error"

const LOAD_TEXT: Record<Exclude<LoadState, "ready">, string> = {
  loading: "Loading…",
  missing: "That project doesn't exist, or it's someone else's private project.",
  offline: "You're offline, and this project hasn't been opened on this device before — it'll load once you're back online.",
  error: "Couldn't load that project.",
}

const useOnline = () => {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine)
    sync()
    window.addEventListener("online", sync)
    window.addEventListener("offline", sync)
    return () => {
      window.removeEventListener("online", sync)
      window.removeEventListener("offline", sync)
    }
  }, [])
  return online
}

/** A saved wall, public or private, autosaved a second after each edit.
 *
 * The project id is a query parameter (/retaining-walls/project?id=…)
 * rather than a path segment, so every project is the same static page —
 * which is what lets the service worker serve it offline for any id,
 * including a project created with no signal.
 *
 * Loaded once rather than subscribed to, so the same wall open somewhere
 * else can't yank the page out from under you: last save wins, and
 * another device picks the changes up when it next opens (or reloads)
 * the project.
 *
 * A save is handed to Firestore, which keeps it on the device at once
 * and sends it when it can — so with no connection the wall is still
 * safe (it survives a reload), just not yet on the server. */
const ProjectEditor = () => {
  const auth = useAuth()
  const router = useRouter()
  const projectId = useSearchParams().get("id") ?? ""
  const online = useOnline()
  const [location, setLocation] = useState<ProjectLocation | null>(null)
  // what the editor mounts with — it owns the wall from there on
  const [initial, setInitial] = useState<WallProject | null>(null)
  const [name, setName] = useState("")
  const [loadState, setLoadState] = useState<LoadState>("loading")
  // edits made but not yet handed to Firestore (the debounce window)
  const [dirty, setDirty] = useState(false)
  // saves handed to Firestore that the server hasn't confirmed yet
  const [unsynced, setUnsynced] = useState(0)
  const [failed, setFailed] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState(false)
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null)

  // latest values for the debounced / unmount save to read
  const latest = useRef<{ location: ProjectLocation | null; wall: WallProject | null; name: string }>({
    location: null,
    wall: null,
    name: "",
  })
  latest.current.location = location
  latest.current.name = name
  const pending = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!auth || auth.authLoading) return
    if (!projectId) {
      setLoadState("missing")
      return
    }
    let cancelled = false
    const uid = auth.currentUser?.uid
    ;(async () => {
      const candidates: ProjectLocation[] = [{ kind: "public" }, ...(uid ? [{ kind: "private" as const, uid }] : [])]
      // one place failing to answer (offline and never cached there)
      // mustn't stop the other being tried
      let unreachable = false
      for (const loc of candidates) {
        try {
          const found = await loadProject(loc, projectId)
          if (cancelled) return
          if (found) {
            latest.current.wall = found.wall
            setLocation(loc)
            setInitial(found.wall)
            setName(found.name)
            setLoadState("ready")
            return
          }
        } catch (err) {
          if (cancelled) return
          unreachable = true
          if (navigator.onLine) console.error("Loading retaining wall project failed", err)
        }
      }
      setLoadState(!unreachable ? "missing" : navigator.onLine ? "error" : "offline")
    })()
    return () => {
      cancelled = true
    }
  }, [auth, auth?.authLoading, auth?.currentUser, projectId])

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const { location: loc, wall, name: n } = latest.current
    if (!pending.current || !loc || !wall) return
    pending.current = false
    setDirty(false)
    setUnsynced((count) => count + 1)
    // not awaited: offline this doesn't settle until the connection is
    // back, and the wall is already safe on the device by then
    saveProject(loc, projectId, n, wall)
      .then(() => setFailed(false))
      .catch((err) => {
        console.error("Saving retaining wall project failed", err)
        pending.current = true
        setFailed(true)
      })
      .finally(() => setUnsynced((count) => count - 1))
  }, [projectId])

  const schedule = useCallback(() => {
    pending.current = true
    setDirty(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY_MS)
  }, [flush])

  // hand over anything still waiting when leaving the page, and warn on
  // a tab close inside the debounce window (the only time an edit isn't
  // yet on the device)
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current) e.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => {
      window.removeEventListener("beforeunload", warn)
      flush()
    }
  }, [flush])

  const handleWallChange = useCallback(
    (wall: WallProject) => {
      latest.current.wall = wall
      schedule()
    },
    [schedule],
  )

  // log each change against this project, under the name it has now
  const handleActivity = useCallback(
    (activity: WallActivity) => {
      const loc = latest.current.location
      if (!loc) return
      logWallActivity(activityProject(loc, projectId, latest.current.name), activity, auth?.currentUser ?? null)
    },
    [projectId, auth?.currentUser],
  )

  const rename = (n: string) => {
    setName(n)
    latest.current.name = n
    schedule()
  }

  const remove = async () => {
    if (!location || location.kind !== "private") return
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return
    pending.current = false
    if (timer.current) clearTimeout(timer.current)
    // same as a save: don't wait on the server when there isn't one
    void deleteProject(location, projectId)
    if (navigator.onLine) router.push("/retaining-walls")
    else window.location.assign("/retaining-walls")
  }

  /** Puts this project's link on the clipboard, for sharing. */
  const copyLink = async () => {
    const url = window.location.href
    let ok = false
    try {
      await navigator.clipboard.writeText(url)
      ok = true
    } catch {
      // older browsers, or a page not served over https: fall back to
      // copying out of a throwaway text box
      const box = document.createElement("textarea")
      box.value = url
      box.setAttribute("readonly", "")
      box.style.position = "fixed"
      box.style.opacity = "0"
      document.body.appendChild(box)
      box.select()
      try {
        ok = document.execCommand("copy")
      } catch {
        ok = false
      }
      document.body.removeChild(box)
    }
    setCopied(ok ? "yes" : "failed")
    setTimeout(() => setCopied(null), 2500)
  }

  /** Moves this private project to the public ones (same id, same link). */
  const makePublic = async () => {
    const wall = latest.current.wall
    if (!location || location.kind !== "private" || !wall) return
    if (
      !window.confirm(
        `Make "${name}" public? Anyone with the link will be able to see and edit it, and it will be listed under public projects. It can't be made private again.`,
      )
    )
      return
    // the move writes the latest wall itself, so drop any save still waiting
    pending.current = false
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setDirty(false)
    setPublishing(true)
    setPublishError(false)
    try {
      await makeProjectPublic(location.uid, projectId, name, wall)
      // the editor remounts for the new location — start it from the wall as it is now
      setInitial(wall)
      setLocation({ kind: "public" })
    } catch (err) {
      console.error("Making retaining wall project public failed", err)
      pending.current = true
      setPublishError(true)
    } finally {
      setPublishing(false)
    }
  }

  if (loadState !== "ready" || !initial || !location) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1rem", textAlign: "center" }}>
        <p style={{ opacity: 0.75, marginBottom: "1rem" }}>{LOAD_TEXT[loadState === "ready" ? "loading" : loadState]}</p>
        {loadState !== "loading" && <Link href="/retaining-walls">← All projects</Link>}
      </div>
    )
  }

  const statusText = publishing
    ? "Making public…"
    : publishError
      ? "Couldn't make it public — check your connection and try again"
      : failed
    ? "Couldn't save — your changes will retry on the next edit"
    : dirty
      ? "Unsaved changes…"
      : !online
        ? "Offline — changes are kept on this device and sync when you're back online"
        : unsynced > 0
          ? "Saving…"
          : "All changes saved"

  return (
    <RetainingWallEditor
      // a different project (or location) is a different wall — remount
      // rather than carry the previous one's edits over
      key={`${location.kind}-${projectId}`}
      initial={initial}
      onChange={handleWallChange}
      onActivity={handleActivity}
      projectName={name}
      header={
        <EditorHeader
          backHref="/retaining-walls"
          name={name}
          onRename={rename}
          badge={location.kind === "public" ? "Public" : "Private"}
          status={
            <>
              {statusText}
              {location.kind === "public" && online && " · anyone with the link can edit"}
            </>
          }
          actions={
            location.kind === "private" ? (
              <>
                <Button size="small" variant="secondary" onClick={makePublic} disabled={!online || publishing}>
                  {publishing ? "Making public…" : "Make public"}
                </Button>
                <Button size="small" variant="danger" onClick={remove} disabled={publishing}>
                  Delete project
                </Button>
              </>
            ) : (
              <Button size="small" variant="secondary" onClick={copyLink}>
                {copied === "yes" ? "Link copied ✓" : copied === "failed" ? "Couldn't copy — use the address bar" : "Copy link"}
              </Button>
            )
          }
        />
      }
    />
  )
}

// useSearchParams needs a Suspense boundary for the page to be built as
// one static shell (which is the whole point — see ProjectEditor)
export default function RetainingWallProjectPage() {
  return (
    <Suspense fallback={<p style={{ padding: "3rem 1rem", textAlign: "center", opacity: 0.75 }}>Loading…</p>}>
      <ProjectEditor />
    </Suspense>
  )
}
