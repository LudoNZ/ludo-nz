"use client"

import { otherOwner, otherOwnerNote, projectCandidates, withOwner } from "@/components/projects/projectOwner"
import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import EditorHeader from "@/components/weatherboards/editorHeader"
import { WallProject } from "@/components/retainingWall/wallProject"
import {
  deckCorners,
  deckToSite,
  newSiteDeck,
  siteDeckOrder,
  newSiteWall,
  placeStair,
  SiteProject,
  sitePlacements,
  SiteStair,
  siteStairEstimate,
  siteStairOrder,
  siteStairScope,
  SiteWall,
  StairPlacement,
  stairElevationExtra,
  stairRenderExtra,
  toSite,
} from "@/components/site/siteProject"
import StairOrderCard from "@/components/stairs/stairOrderCard"
import type { RenderExtra } from "@/components/retainingWall/wallRender3d"
import type { ElevationExtra } from "@/components/retainingWall/wallProfileDiagram"
import { copySiteToPublic, deleteSiteProject, loadSiteProject, moveSiteToPublic, ProjectLocation, saveSiteProject, siteProjectHref } from "@/components/site/siteProjectStore"
import MakePublicButton from "@/components/projects/makePublicButton"
import RetainingWallEditor, { EditorAddOnContext, EditorAddOns } from "../../retaining-walls/retainingWallEditor"
import StairsCard, { StairsPlanOverlay, wallHostInfo } from "../stairsCard"
import { stairCalculatorHref } from "../stairLink"
import { SitePlan, WallsCard } from "../siteView"
import SiteRenderView from "../siteRenderView"
import SiteEstimate from "../siteEstimate"
import DecksCard from "../decksCard"
import styles from "../siteView.module.scss"

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

const STAIR_ORDER_NOTE =
  "The order plans every stair's pieces together, so offcuts are shared between them (the estimate prices each stair on its own lengths). Post concrete is for 300 mm holes; screws are two per board at each stringer or joist, plus 10%. Handrails, barriers, bolts and fixing the stairs to the walls aren't included."

/** A site project, autosaved a second after each edit and loaded once —
 * last save wins. Two views of it, picked by the URL:
 *  - the site (no `wall`): every wall placed on the site plan, the walls
 *    list (import, add, place, remove) and the stair order for the lot;
 *  - one wall (`&wall=…`): the retaining wall calculator itself on that
 *    wall, with its stairs plugged in (drawn on its plan, elevation and
 *    3D view, their card after its obstructions, priced in its estimate). */
const SiteProjectEditor = () => {
  const auth = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const projectId = params.get("id") ?? ""
  // an admin opening someone else's private project (see projectOwner.ts)
  const owner = params.get("owner")
  const wallParam = params.get("wall")
  const [location, setLocation] = useState<ProjectLocation | null>(null)
  const [name, setName] = useState("")
  const [loadState, setLoadState] = useState<LoadState>("loading")
  const [dirty, setDirty] = useState(false)
  const [unsynced, setUnsynced] = useState(0)
  const [failed, setFailed] = useState(false)
  const [selectedStair, setSelectedStair] = useState<string | null>(null)
  const [selectedWall, setSelectedWall] = useState<string | null>(null)
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null)
  // the project lives in `latest` (so the wall editor's own changes don't
  // re-render the page round it); this re-renders when the page needs it
  const [, setVersion] = useState(0)
  const rerender = () => setVersion((v) => v + 1)

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
      const candidates: ProjectLocation[] = projectCandidates(uid, owner)
      let unreachable = false
      for (const loc of candidates) {
        try {
          const found = await loadSiteProject(loc, projectId)
          if (cancelled) return
          if (found) {
            latest.current.site = found.site
            setLocation(loc)
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
  }, [auth, auth?.authLoading, auth?.currentUser, projectId, owner])

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

  /** change the project and save it soon */
  const commit = (next: SiteProject) => {
    latest.current.site = next
    schedule()
    rerender()
  }

  // the wall editor's changes: kept and saved, no re-render (it already
  // shows them)
  const wallParamRef = useRef(wallParam)
  wallParamRef.current = wallParam
  const handleWallChange = useCallback(
    (wall: WallProject) => {
      const site = latest.current.site
      const id = wallParamRef.current
      if (!site || !id) return
      const current = site.walls.find((w) => w.id === id)
      if (!current || current.wall === wall) return
      latest.current.site = { ...site, walls: site.walls.map((w) => (w.id === id ? { ...w, wall } : w)) }
      schedule()
    },
    [schedule],
  )

  const changeStairs = (wallId: string, next: SiteStair[]) => {
    const site = latest.current.site
    if (!site) return
    commit({ ...site, stairs: [...site.stairs.filter((s) => s.wallId !== wallId), ...next] })
  }
  const changeStairsRef = useRef(changeStairs)
  changeStairsRef.current = changeStairs
  const changeDeckStairs = (deckId: string, next: SiteStair[]) => {
    const site = latest.current.site
    if (!site) return
    commit({ ...site, stairs: [...site.stairs.filter((s) => s.deckId !== deckId), ...next] })
  }

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
        setVersion((v) => v + 1)
      } catch {
        // offline or refused: keep what's here
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [location, projectId])

  // ---- one wall: its stairs, worked out against the wall as the editor
  // has it now — once per change of the wall or the stairs ----
  const placementCache = useRef<{ key: unknown[]; value: Map<string, StairPlacement> } | null>(null)
  const placementsFor = (ctx: EditorAddOnContext) => {
    const stairs = latest.current.site?.stairs ?? []
    const key = [ctx.profile, ctx.planPoints, ctx.retainedSide, stairs, wallParam]
    const hit = placementCache.current
    if (hit && hit.key.every((k, i) => k === key[i])) return hit.value
    const value = new Map<string, StairPlacement>()
    for (const s of stairs) {
      if (s.wallId !== wallParam) continue
      const p = placeStair(s, ctx.planPoints, ctx.retainedSide, ctx.profile)
      if (p) value.set(s.id, p)
    }
    placementCache.current = { key, value }
    // keep each stair's saved rise in step with the wall, so the stair
    // opened in the calculator on its own shows the same stair (after
    // this render: it's a change of the project's state)
    const stale = [...value.values()].filter((p) => p.stair.input.totalRise !== p.input.totalRise)
    if (stale.length && wallParam) {
      const rises = new Map(stale.map((p) => [p.stair.id, p.input.totalRise]))
      const wallId = wallParam
      setTimeout(() => {
        const site = latest.current.site
        if (!site) return
        const mine = site.stairs.filter((s) => s.wallId === wallId)
        const next = mine.map((st) => (rises.has(st.id) && st.input.totalRise !== rises.get(st.id) ? { ...st, input: { ...st.input, totalRise: rises.get(st.id) as number } } : st))
        if (next.every((st, i) => st === mine[i])) return
        changeStairsRef.current(wallId, next)
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

  const site = latest.current.site
  // every stair placed, worked out once per change of the walls or stairs
  const sitePlacementCache = useRef<{ walls: unknown; stairs: unknown; decks: unknown; value: ReturnType<typeof sitePlacements> } | null>(null)
  const placedOnSite = (s: SiteProject) => {
    const hit = sitePlacementCache.current
    if (hit && hit.walls === s.walls && hit.stairs === s.stairs && hit.decks === s.decks) return hit.value
    const value = sitePlacements(s)
    sitePlacementCache.current = { walls: s.walls, stairs: s.stairs, decks: s.decks, value }
    // keep a deck stair's saved rise in step with the deck (as the wall
    // editor does for a wall's), after this render
    const stale = value.filter((p) => p.deck && p.placement.stair.input.totalRise !== p.placement.input.totalRise)
    if (stale.length) {
      const rises = new Map(stale.map((p) => [p.placement.stair.id, p.placement.input.totalRise]))
      setTimeout(() => {
        const cur = latest.current.site
        if (!cur) return
        let changed = false
        const stairs = cur.stairs.map((st) => {
          const r = rises.get(st.id)
          if (r === undefined || st.input.totalRise === r) return st
          changed = true
          return { ...st, input: { ...st.input, totalRise: r } }
        })
        if (changed) commit({ ...cur, stairs })
      }, 0)
    }
    return value
  }
  const wallStairs = site?.stairs.filter((s) => s.wallId === wallParam) ?? []

  const addOns: EditorAddOns = {
    render3d: extrasFor,
    elevation: elevationFor,
    onSelectElevationExtra: pickStair,
    selectedElevationExtraId: selectedStair,
    rail: [
      { id: "site-stairs", label: "Stairs", icon: <StairIcon /> },
      ...(wallStairs.length ? [{ id: "site-stair-order", label: "Stair order", icon: <StairIcon /> }] : []),
    ],
    planOverlay: (ctx, sizes) => <StairsPlanOverlay placements={[...placementsFor(ctx).values()]} selectedId={selectedStair} onSelect={pickStair} {...sizes} />,
    planShapes: (ctx) => [...placementsFor(ctx).values()].flatMap((p) => p.treads),
    cards: (ctx) => {
      const placements = placementsFor(ctx)
      return (
        <>
          <StairsCard
            host={wallHostInfo(ctx)}
            wallId={wallParam ?? ""}
            stairs={wallStairs}
            placements={placements}
            onChange={(next) => wallParam && changeStairs(wallParam, next)}
            selectedId={selectedStair}
            onSelect={setSelectedStair}
            calculatorHref={(stairId) => withOwner(stairCalculatorHref(projectId, stairId), owner, auth?.currentUser?.uid)}
          />
          {placements.size > 0 && (
            <div id="site-stair-order">
              <StairOrderCard
                title={placements.size > 1 ? "Stair material order — this wall's stairs" : "Stair material order"}
                lines={siteStairOrder([...placements.values()])}
                intro="What to order for the stairs on this wall, as stock lengths. The wall's own boards and posts are in its materials and board order below; every wall's stairs together are on the site page."
                note={`${STAIR_ORDER_NOTE} The same lines, priced, are in the estimate.`}
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

  if (loadState !== "ready" || !site || !location) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1rem", textAlign: "center" }}>
        <p style={{ opacity: 0.75, marginBottom: "1rem" }}>{LOAD_TEXT[loadState === "ready" ? "loading" : loadState]}</p>
        {loadState !== "loading" && <Link href="/site-projects">← All site projects</Link>}
      </div>
    )
  }

  const statusText = failed ? "Couldn't save — your changes will retry on the next edit" : dirty ? "Unsaved changes…" : unsynced > 0 ? "Saving…" : "All changes saved"
  const status = (
    <>
      {statusText}
      {location.kind === "public" && " · anyone with the link can edit"}
      {otherOwner(location, auth?.currentUser?.uid) && otherOwnerNote(location.kind === "private" ? location.uid : "")}
    </>
  )
  const siteHref = withOwner(siteProjectHref(projectId), otherOwner(location, auth?.currentUser?.uid))
  const openWall = (id: string) => {
    flush()
    router.push(`${siteHref}&wall=${encodeURIComponent(id)}`)
  }

  // ---- one wall ----
  const editing = wallParam ? site.walls.find((w) => w.id === wallParam) : undefined
  if (wallParam && editing) {
    return (
      <RetainingWallEditor
        key={`${location.kind}-${projectId}-${editing.id}`}
        initial={editing.wall}
        onChange={handleWallChange}
        projectName={`${name} — ${editing.name}`}
        addOns={addOns}
        header={
          <EditorHeader
            backHref={siteHref}
            backLabel={`← ${name || "The site"}`}
            name={editing.name}
            onRename={(n) => {
              const s = latest.current.site
              if (s) commit({ ...s, walls: s.walls.map((w) => (w.id === editing.id ? { ...w, name: n } : w)) })
            }}
            badge="Wall on a site"
            status={status}
          />
        }
      />
    )
  }

  /** moves it to the public ones (same id, same link) and carries on there */
  const makePublic = async () => {
    if (location.kind !== "private") return
    // the move writes the latest site itself, so drop any save still waiting
    pending.current = false
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setDirty(false)
    try {
      await moveSiteToPublic(location.uid, projectId, latest.current.name, latest.current.site ?? site)
      setLocation({ kind: "public" })
    } catch (err) {
      pending.current = true
      throw err
    }
  }

  // ---- the site ----
  const placements = placedOnSite(site)
  const addWall = (wall: WallProject, wallName: string, source: string) => {
    // to the right of whatever's there already, level with its top
    const pts = site.walls.flatMap((w) => w.wall.planPoints.map(toSite(w)))
    const at = pts.length ? { xM: Math.ceil(Math.max(...pts.map((p) => p.xM)) + 2), yM: Math.floor(Math.min(...pts.map((p) => p.yM))) } : { xM: 0, yM: 0 }
    const used = new Set(site.walls.map((w) => w.name))
    let unique = wallName
    for (let n = 2; used.has(unique); n++) unique = `${wallName} (${n})`
    const added = newSiteWall(wall, unique, source, at)
    commit({ ...site, walls: [...site.walls, added] })
    setSelectedWall(added.id)
  }
  const addDeck = () => {
    // to the right of whatever's there, on the lowest ground there is
    const pts = [...site.walls.flatMap((w) => w.wall.planPoints.map(toSite(w))), ...site.decks.flatMap((d) => deckCorners(d).map(deckToSite(d)))]
    const at = pts.length ? { xM: Math.ceil(Math.max(...pts.map((p) => p.xM)) + 2), yM: Math.floor(Math.min(...pts.map((p) => p.yM))) } : { xM: 0, yM: 0 }
    const grounds = placements.map((p) => p.placement.groundLevelM)
    const added = newSiteDeck(`Deck ${site.decks.length + 1}`, at, grounds.length ? Math.min(...grounds) : 0)
    commit({ ...site, decks: [...site.decks, added] })
    setSelectedDeck(added.id)
  }
  const deckOrder = siteDeckOrder(site.decks)

  return (
    <div className={styles.page}>
      <EditorHeader
        backHref="/site-projects"
        name={name}
        onRename={rename}
        badge={location.kind === "public" ? "Public site" : "Private site"}
        status={status}
        actions={
          location.kind === "private" ? (
            <>
              <MakePublicButton name={name} what="site project" onMove={makePublic} onCopy={() => copySiteToPublic(name, latest.current.site ?? site)} />
              <Button size="small" variant="danger" onClick={remove}>
                Delete project
              </Button>
            </>
          ) : null
        }
      />
      <SitePlan
        walls={site.walls}
        placements={placements}
        decks={site.decks}
        selectedDeckId={selectedDeck}
        onSelectDeck={(id) => {
          setSelectedDeck(id)
          setSelectedWall(null)
          document.getElementById("site-decks")?.scrollIntoView({ behavior: "smooth", block: "start" })
        }}
        selectedId={selectedWall}
        onSelect={(id) => {
          setSelectedWall(id)
          if (id) setSelectedDeck(null)
        }}
        onOpen={openWall}
        onMove={(id, xM, yM, done) => {
          const s = latest.current.site
          if (!s) return
          const next = { ...s, walls: s.walls.map((w) => (w.id === id ? { ...w, xM, yM } : w)) }
          if (done) commit(next)
          else {
            latest.current.site = next
            rerender()
          }
        }}
      />
      <WallsCard
        walls={site.walls}
        stairs={site.stairs}
        uid={auth?.currentUser?.uid ?? null}
        selectedId={selectedWall}
        onSelect={setSelectedWall}
        onChange={(walls: SiteWall[]) => commit({ ...site, walls })}
        onAdd={addWall}
        onAddStair={(stair) => commit({ ...site, stairs: [...site.stairs, stair] })}
        onRemove={(id) => {
          commit({ ...site, walls: site.walls.filter((w) => w.id !== id), stairs: site.stairs.filter((s) => s.wallId !== id) })
          if (selectedWall === id) setSelectedWall(null)
        }}
        onOpen={openWall}
      />
      <DecksCard
        decks={site.decks}
        stairs={site.stairs}
        placements={placements}
        selectedId={selectedDeck}
        onSelect={setSelectedDeck}
        onChange={(decks) => commit({ ...site, decks })}
        onAdd={addDeck}
        onRemove={(id) => {
          commit({ ...site, decks: site.decks.filter((d) => d.id !== id), stairs: site.stairs.filter((s) => s.deckId !== id) })
          if (selectedDeck === id) setSelectedDeck(null)
        }}
        onChangeStairs={changeDeckStairs}
        selectedStair={selectedStair}
        onSelectStair={setSelectedStair}
        calculatorHref={(stairId) => withOwner(stairCalculatorHref(projectId, stairId), owner, auth?.currentUser?.uid)}
      />
      <SiteRenderView walls={site.walls} placements={placements} decks={site.decks} />
      {placements.length > 0 && (
        <StairOrderCard
          title="Stair material order — the whole site"
          lines={siteStairOrder(placements.map((p) => p.placement))}
          intro="Every stair on every wall and deck, as stock lengths to order. A wall's stairs are added and changed in the wall (Edit wall & stairs); a deck's, in the deck above."
          note={STAIR_ORDER_NOTE}
        />
      )}
      {deckOrder.length > 0 && (
        <StairOrderCard
          title="Deck and floor order — the whole site"
          lines={deckOrder}
          intro="Every deck's framing, piles, concrete, boards or sheets, and fixings. Framing timber is planned from every deck's cut pieces together."
          pins={site.deckOrderPins}
          onPinsChange={(deckOrderPins) => commit({ ...site, deckOrderPins })}
        />
      )}
      <div id="site-estimate">
        <SiteEstimate site={site} placements={placements} projectName={name} onChange={(estimate) => commit({ ...site, estimate })} />
      </div>
    </div>
  )
}

export default function SiteProjectPage() {
  return (
    <Suspense fallback={<p style={{ padding: "3rem 1rem", textAlign: "center", opacity: 0.75 }}>Loading…</p>}>
      <SiteProjectEditor />
    </Suspense>
  )
}
