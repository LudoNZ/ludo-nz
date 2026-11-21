"use client"

import { otherOwner, otherOwnerNote, projectCandidates } from "@/components/projects/projectOwner"
import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import EditorHeader from "@/components/weatherboards/editorHeader"
import { StairInput } from "@/components/stairs/stairs"
import { copyStairToPublic, deleteStairProject, loadStairProject, moveStairToPublic, ProjectLocation, saveStairProject } from "@/components/stairs/stairProjectStore"
import MakePublicButton from "@/components/projects/makePublicButton"
import CopyLinkButton from "@/components/projects/copyLinkButton"
import StairsPage from "../stairsPage"

const SAVE_DELAY_MS = 1000

type LoadState = "loading" | "ready" | "missing" | "offline" | "error"

const LOAD_TEXT: Record<Exclude<LoadState, "ready">, string> = {
  loading: "Loading…",
  missing: "That stair doesn't exist, or it's someone else's private stair.",
  offline: "You're offline, and this stair hasn't been opened on this device before.",
  error: "Couldn't load that stair.",
}

/** A saved stair: the calculator on it, saved a second after each change
 * (and on leaving). Loaded once — last save wins. */
const StairProjectEditor = () => {
  const auth = useAuth()
  const router = useRouter()
  const search = useSearchParams()
  const projectId = search.get("id") ?? ""
  // an admin opening someone else's private stair (see projectOwner.ts)
  const owner = search.get("owner")
  const [location, setLocation] = useState<ProjectLocation | null>(null)
  const [name, setName] = useState("")
  const [input, setInput] = useState<StairInput | null>(null)
  const [loadState, setLoadState] = useState<LoadState>("loading")
  const [dirty, setDirty] = useState(false)
  const [unsynced, setUnsynced] = useState(0)
  const [failed, setFailed] = useState(false)

  const latest = useRef<{ location: ProjectLocation | null; input: StairInput | null; name: string }>({ location: null, input: null, name: "" })
  latest.current = { location, input, name }
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
      const candidates: ProjectLocation[] = projectCandidates(uid, owner)
      let unreachable = false
      for (const loc of candidates) {
        try {
          const found = await loadStairProject(loc, projectId)
          if (cancelled) return
          if (found) {
            setInput(found.stair)
            setLocation(loc)
            setName(found.name)
            setLoadState("ready")
            return
          }
        } catch (err) {
          if (cancelled) return
          unreachable = true
          if (navigator.onLine) console.error("Loading stair failed", err)
        }
      }
      setLoadState(!unreachable ? "missing" : navigator.onLine ? "error" : "offline")
    })()
    return () => {
      cancelled = true
    }
  }, [auth, auth?.authLoading, auth?.currentUser, projectId, owner])

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const { location: loc, input: stair, name: n } = latest.current
    if (!pending.current || !loc || !stair) return
    pending.current = false
    setDirty(false)
    setUnsynced((c) => c + 1)
    saveStairProject(loc, projectId, n, stair)
      .then(() => setFailed(false))
      .catch((err) => {
        console.error("Saving stair failed", err)
        pending.current = true
        setFailed(true)
      })
      .finally(() => setUnsynced((c) => c - 1))
  }, [projectId])

  const schedule = useCallback(() => {
    pending.current = true
    setDirty(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY_MS)
  }, [flush])

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

  if (loadState !== "ready" || !input || !location) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1rem", textAlign: "center" }}>
        <p style={{ opacity: 0.75, marginBottom: "1rem" }}>{LOAD_TEXT[loadState === "ready" ? "loading" : loadState]}</p>
        {loadState !== "loading" && <Link href="/stairs">← All stairs</Link>}
      </div>
    )
  }

  const change = (next: StairInput) => {
    latest.current.input = next
    setInput(next)
    schedule()
  }
  const rename = (n: string) => {
    latest.current.name = n
    setName(n)
    schedule()
  }
  const remove = async () => {
    if (location.kind !== "private") return
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return
    pending.current = false
    if (timer.current) clearTimeout(timer.current)
    void deleteStairProject(location, projectId)
    router.push("/stairs")
  }

  /** moves it to the public ones (same id, same link) and carries on there */
  const makePublic = async () => {
    if (location.kind !== "private") return
    // the move writes the latest stair itself, so drop any save still waiting
    pending.current = false
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setDirty(false)
    try {
      await moveStairToPublic(location.uid, projectId, name, latest.current.input ?? input)
      setLocation({ kind: "public" })
    } catch (err) {
      pending.current = true
      throw err
    }
  }

  const statusText = failed ? "Couldn't save — your changes will retry on the next edit" : dirty ? "Unsaved changes…" : unsynced > 0 ? "Saving…" : "All changes saved"

  return (
    <StairsPage
      value={input}
      onChange={change}
      header={
        <EditorHeader
          backHref="/stairs"
          backLabel="← All stairs"
          name={name}
          onRename={rename}
          badge={location.kind === "public" ? "Public stair" : "Private stair"}
          status={
            <>
              {statusText}
              {location.kind === "public" && " · anyone with the link can edit"}
              {otherOwner(location, auth?.currentUser?.uid) && otherOwnerNote(location.kind === "private" ? location.uid : "")}
            </>
          }
          actions={
            location.kind === "private" ? (
              <>
                <MakePublicButton name={name} what="stair" onMove={makePublic} onCopy={() => copyStairToPublic(name, latest.current.input ?? input)} />
                <Button size="small" variant="danger" onClick={remove}>
                  Delete stair
                </Button>
              </>
            ) : (
              <CopyLinkButton />
            )
          }
        />
      }
    />
  )
}

export default function StairProjectPage() {
  return (
    <Suspense fallback={<p style={{ padding: "3rem 1rem", textAlign: "center", opacity: 0.75 }}>Loading…</p>}>
      <StairProjectEditor />
    </Suspense>
  )
}
