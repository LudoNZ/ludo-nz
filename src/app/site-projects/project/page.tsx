"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import EditorHeader from "@/components/weatherboards/editorHeader"
import { WallProject } from "@/components/retainingWall/wallProject"
import {
  placeStair,
  SiteProject,
  SiteStair,
  siteStairEstimate,
  siteStairOrder,
  siteStairScope,
  StairPlacement,
  stairElevationExtra,
  stairRenderExtra,
} from "@/components/site/siteProject"
import StairOrderCard from "@/components/stairs/stairOrderCard"
import type { RenderExtra } from "@/components/retainingWall/wallRender3d"
import type { ElevationExtra } from "@/components/retainingWall/wallProfileDiagram"
import { deleteSiteProject, loadSiteProject, ProjectLocation, saveSiteProject } from "@/components/site/siteProjectStore"
import RetainingWallEditor, { EditorAddOnContext, EditorAddOns } from "../../retaining-walls/retainingWallEditor"
import StairsCard, { StairsPlanOverlay } from "../stairsCard"
import { stairCalculatorHref } from "../stairLink"

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
  const changeStairsRef = useRef(changeStairs)
  changeStairsRef.current = changeStairs

  // a stair edited in the calculator on its own (another tab) saves
  // straight to the project: pick that up on coming back, unless there's
  // something here still to save
  useEffect(() => {
    if (!location) return
    const onVisible = async () => {
      if (document.visibilityState !== "visible" || pending.current) return
      try {
        const found = await loadSiteProject(location, projectId)
        const site = latest.current.site
        if (!found || !site || pending.current) return
        if (JSON.stringify(found.site.stairs) === JSON.stringify(site.stairs)) return
        latest.current.site = { ...site, stairs: found.site.stairs }
        setStairs(found.site.stairs)
      } catch {
        // offline or refused: keep what's here
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [location, projectId])

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
    // keep each stair's saved rise in step with the wall, so the stair
    // opened in the calculator on its own shows the same stair (after
    // this render: it's a change of the project's state)
    const stale = [...value.values()].filter((p) => p.stair.input.totalRise !== p.input.totalRise)
    if (stale.length) {
      const rises = new Map(stale.map((p) => [p.stair.id, p.input.totalRise]))
      setTimeout(() => {
        const site = latest.current.site
        if (!site) return
        const next = site.stairs.map((st) => (rises.has(st.id) && st.input.totalRise !== rises.get(st.id) ? { ...st, input: { ...st.input, totalRise: rises.get(st.id) as number } } : st))
        if (next.every((st, i) => st === site.stairs[i])) return
        changeStairsRef.current(next)
      }, 0)
    }
    return value
  }

  // the stairs as 3D solids, rebuilt only when the placements change (the
  // 3D view memoises on this array)
  const extrasCache = useRef<{ from: Map<string, StairPlacement>; value: RenderExtra[] } | null>(null)
  const extrasFor = (ctx: EditorAddOnContext) => {
    const placements = placementsFor(ctx)
    if (extrasCache.current?.from === placements) return extrasCache.current.value
    const value = [...placements.values()].map(stairRenderExtra)
    extrasCache.current = { from: placements, value }
    return value
  }

  const elevationCache = useRef<{ from: Map<string, StairPlacement>; value: ElevationExtra[] } | null>(null)
  const elevationFor = (ctx: EditorAddOnContext) => {
    const placements = placementsFor(ctx)
    if (elevationCache.current?.from === placements) return elevationCache.current.value
    const profile = ctx.profile
    const value = profile
      ? [...placements.values()].map((p) => stairElevationExtra(p, ctx.planPoints, profile)).filter((e): e is ElevationExtra => e !== null)
      : []
    elevationCache.current = { from: placements, value }
    return value
  }
  const pickStair = (id: string) => {
    setSelectedStair(id)
    document.getElementById("site-stairs")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const addOns: EditorAddOns = {
    render3d: extrasFor,
    elevation: elevationFor,
    onSelectElevationExtra: pickStair,
    selectedElevationExtraId: selectedStair,
    rail: [
      { id: "site-stairs", label: "Stairs", icon: <StairIcon /> },
      ...(stairs.length ? [{ id: "site-stair-order", label: "Stair order", icon: <StairIcon /> }] : []),
    ],
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
    planShapes: (ctx) => [...placementsFor(ctx).values()].flatMap((p) => p.treads),
    cards: (ctx) => {
      const placements = placementsFor(ctx)
      return (
        <>
          <StairsCard
            ctx={ctx}
            stairs={stairs}
            placements={placements}
            onChange={changeStairs}
            selectedId={selectedStair}
            onSelect={setSelectedStair}
            calculatorHref={(stairId) => stairCalculatorHref(projectId, stairId)}
          />
          {placements.size > 0 && (
            <div id="site-stair-order">
              <StairOrderCard
                title={placements.size > 1 ? "Stair material order — all stairs" : "Stair material order"}
                lines={siteStairOrder([...placements.values()])}
                intro="What to order for the stairs, as stock lengths. The wall's own boards and posts are in its materials and board order below."
                note="Each stair is cut from its own lengths (offcuts aren't shared between stairs). Post concrete is for 300 mm holes; screws are two per board at each stringer or joist, plus 10%. Handrails, barriers, bolts and the fixing of the top to the wall aren't included. The same lines, priced, are in the estimate."
              />
            </div>
          )}
        </>
      )
    },
    estimate: (ctx) => siteStairEstimate([...placementsFor(ctx).values()]),
    scope: (ctx) => siteStairScope([...placementsFor(ctx).values()], ctx.profile?.segments.length ?? 1),
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
