"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import EditorHeader from "@/components/weatherboards/editorHeader"
import { WallProject } from "@/components/retainingWall/wallProject"
import { placeStair, SiteProject, SiteStair, StairPlacement } from "@/components/site/siteProject"
import { deleteSiteProject, loadSiteProject, ProjectLocation, saveSiteProject } from "@/components/site/siteProjectStore"
import RetainingWallEditor, { EditorAddOnContext, EditorAddOns } from "../../retaining-walls/retainingWallEditor"
import StairsCard, { StairsPlanOverlay } from "../stairsCard"

const SAVE_DELAY_MS = 1000

type LoadState = "loading" | "ready" | "missing" | "offline" | "error"

const LOAD_TEXT: Record<Exclude<LoadState, "ready">, string> = {
  loading: "Loading…",
  missing: "That site project doesn't exist, or it's someone else's private project.",
  offline: "You're offline, and this project hasn't been opened on this device before.",
  error: "Couldn't load that site project.",
}

const StairIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 21h5v-5h5v-5h5V6h3" />
  </svg>
)

/** A site project: a retaining wall and the stairs that come down off it,
 * autosaved a second after each edit. Loaded once, like a wall project —
 * last save wins. The wall is the retaining wall calculator itself; the
 * stairs plug into it (drawn on its plan, their card after its
 * obstructions). */
const SiteProjectEditor = () => {
  const auth = useAuth()
  const router = useRouter()
  const projectId = useSearchParams().get("id") ?? ""
  const [location, setLocation] = useState<ProjectLocation | null>(null)
  const [initialWall, setInitialWall] = useState<WallProject | null>(null)
  const [stairs, setStairs] = useState<SiteStair[]>([])
  const [selectedStair, setSelectedStair] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [loadState, setLoadState] = useState<LoadState>("loading")
  const [dirty, setDirty] = useState(false)
  const [unsynced, setUnsynced] = useState(0)
  const [failed, setFailed] = useState(false)

  const latest = useRef<{ location: ProjectLocation | null; site: SiteProject | null; name: string }>({ location: null, site: null, name: "" })
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
      let unreachable = false
      for (const loc of candidates) {
        try {
          const found = await loadSiteProject(loc, projectId)
          if (cancelled) return
          if (found) {
            latest.current.site = found.site
            setLocation(loc)
            setInitialWall(found.site.wall)
            setStairs(found.site.stairs)
            setName(found.name)
            setLoadState("ready")
            return
          }
        } catch (err) {
          if (cancelled) return
          unreachable = true
          if (navigator.onLine) console.error("Loading site project failed", err)
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
    const { location: loc, site, name: n } = latest.current
    if (!pending.current || !loc || !site) return
    pending.current = false
    setDirty(false)
    setUnsynced((c) => c + 1)
    saveSiteProject(loc, projectId, n, site)
      .then(() => setFailed(false))
      .catch((err) => {
        console.error("Saving site project failed", err)
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

  const handleWallChange = useCallback(
    (wall: WallProject) => {
      const site = latest.current.site
      if (!site || site.wall === wall) return
      latest.current.site = { ...site, wall }
      schedule()
    },
    [schedule],
  )

  const changeStairs = (next: SiteStair[]) => {
    setStairs(next)
    if (latest.current.site) latest.current.site = { ...latest.current.site, stairs: next }
    schedule()
  }

  // every stair worked out against the wall as it is — once per change of
  // the wall or the stairs, shared by the plan and the card
  const placementCache = useRef<{ key: unknown[]; value: Map<string, StairPlacement> } | null>(null)
  const placementsFor = (ctx: EditorAddOnContext) => {
    const key = [ctx.profile, ctx.planPoints, ctx.retainedSide, stairs]
    const hit = placementCache.current
    if (hit && hit.key.every((k, i) => k === key[i])) return hit.value
    const value = new Map<string, StairPlacement>()
    for (const s of stairs) {
      const p = placeStair(s, ctx.planPoints, ctx.retainedSide, ctx.profile)
      if (p) value.set(s.id, p)
    }
    placementCache.current = { key, value }
    return value
  }

  const addOns: EditorAddOns = {
    rail: [{ id: "site-stairs", label: "Stairs", icon: <StairIcon /> }],
    planOverlay: (ctx, sizes) => (
      <StairsPlanOverlay
        placements={[...placementsFor(ctx).values()]}
        selectedId={selectedStair}
        onSelect={(id) => {
          setSelectedStair(id)
          document.getElementById("site-stairs")?.scrollIntoView({ behavior: "smooth", block: "start" })
        }}
        {...sizes}
      />
    ),
    planPoints: (ctx) => [...placementsFor(ctx).values()].flatMap((p) => p.treads.flat()),
    cards: (ctx) => (
      <StairsCard ctx={ctx} stairs={stairs} placements={placementsFor(ctx)} onChange={changeStairs} selectedId={selectedStair} onSelect={setSelectedStair} />
    ),
  }

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
    void deleteSiteProject(location, projectId)
    router.push("/site-projects")
  }

  if (loadState !== "ready" || !initialWall || !location) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1rem", textAlign: "center" }}>
        <p style={{ opacity: 0.75, marginBottom: "1rem" }}>{LOAD_TEXT[loadState === "ready" ? "loading" : loadState]}</p>
        {loadState !== "loading" && <Link href="/site-projects">← All site projects</Link>}
      </div>
    )
  }

  const statusText = failed ? "Couldn't save — your changes will retry on the next edit" : dirty ? "Unsaved changes…" : unsynced > 0 ? "Saving…" : "All changes saved"

  return (
    <RetainingWallEditor
      key={`${location.kind}-${projectId}`}
      initial={initialWall}
      onChange={handleWallChange}
      projectName={name}
      addOns={addOns}
      header={
        <EditorHeader
          backHref="/site-projects"
          name={name}
          onRename={rename}
          badge={location.kind === "public" ? "Public site" : "Private site"}
          status={
            <>
              {statusText}
              {location.kind === "public" && " · anyone with the link can edit"}
            </>
          }
          actions={
            location.kind === "private" ? (
              <Button size="small" variant="danger" onClick={remove}>
                Delete project
              </Button>
            ) : null
          }
        />
      }
    />
  )
}

export default function SiteProjectPage() {
  return (
    <Suspense fallback={<p style={{ padding: "3rem 1rem", textAlign: "center", opacity: 0.75 }}>Loading…</p>}>
      <SiteProjectEditor />
    </Suspense>
  )
}
