/** A site project: output from more than one calculator on one site. It
 * starts blank; retaining walls are imported into it (copies of wall
 * projects) or added blank, each placed on the site plan — moved and
 * turned — and stairs come down in front of a wall, each one's top tread
 * pinned to a point along it, its total rise taken from the wall's height
 * there. More kinds of thing (up to a house) to come.
 *
 * Each wall keeps its own plan coordinates (metres, y down, as on screen),
 * and its placement says where that sits on the site (see `toSite`).
 * The stairs calculator works in mm with its own origin (see
 * stairs/layout.ts); `placeStair` maps one onto the other. */

import { DEFAULT_INPUT, StairInput, StairResult, calculateStairs } from "../stairs/stairs"
import { StairLayout, calculateLayout } from "../stairs/layout"
import { profileForWall, wallFromData, WallProject } from "../retainingWall/wallProject"
import { WallProfile } from "../retainingWall/postProfile"
import { PlanPoint, pointAtDistance, RetainedSide, segmentLabel, sideNormal } from "../retainingWall/wallPlan"
import type { Pt } from "../stairs/stairs"
import { StairMember, stairSolids } from "../stairs/stairRender3d"
import type { RenderExtra } from "../retainingWall/wallRender3d"
import type { ElevationExtra } from "../retainingWall/wallProfileDiagram"
import { DEFAULT_ESTIMATE_SETTINGS, estimateSettingsFromData, type AddedMaterial, type EstimateSettings } from "../retainingWall/pricing"
import { stairInputFromData } from "../stairs/stairData"
import { combineOrder, CombinedOrderLine, stairLabourHours, stairOrder, StairOrderLine } from "../stairs/stairMaterials"
import { planMixedStock } from "../stairs/stairs"
import { buildFrame, DEFAULT_DECK_FRAME, FrameInput, frameInputFromData, FrameLayout, pinsFromData, rectangleOutline, splitRun } from "../floorFraming/frame"
import { frameOrder } from "../floorFraming/frameOrder"
import type { RenderBoard } from "../floorFraming/frameRender3d"
import { houseFromData, HouseProject, Pt as HousePt } from "../house/houseTypes"
import { floorGraph } from "../house/floorPlan"

export const MIN_STAIR_ANGLE_DEG = 30
export const MAX_STAIR_ANGLE_DEG = 150

/** which part of the top tread sits at the fixed point */
export type StairAnchor = "centre" | "near" | "far"

export const STAIR_ANCHOR_LABELS: Record<StairAnchor, string> = {
  centre: "Its centre line",
  near: "Its nearer edge",
  far: "Its farther edge",
}

/** how the stair meets the top of the wall */
export type StairTop = "wallRiser" | "onWall"

export const STAIR_TOP_LABELS: Record<StairTop, string> = {
  wallRiser: "The wall is the last riser — the top tread stops at the wall's face",
  onWall: "The top tread is level with the top — the stair has its own last riser",
}

export interface SiteStair {
  id: string
  /** the site wall it comes down from ("" when it's off a deck) */
  wallId: string
  /** or the site deck it comes down from; `segmentIndex` is then the
   * deck's edge (0 top, 1 right, 2 bottom, 3 left, as first placed) */
  deckId: string | null
  /** e.g. "Steps to the lawn" */
  label: string
  /** the wall (run) it comes down from */
  segmentIndex: number
  /** the fixed point is `distanceM` from this end of that wall */
  from: "start" | "end"
  distanceM: number
  /** which part of the top tread sits on the fixed point */
  anchor: StairAnchor
  /** degrees between the wall (walking from its start to its end) and the
   * way down the stair: 90 comes straight out from the wall */
  angleDeg: number
  /** mm above the wall's ground where the stair finishes at the bottom —
   * the ground there's often built up with fill */
  bottomOffsetMm: number
  /** mm above (or below, negative) the top of the wall where it finishes
   * at the top */
  topOffsetMm: number
  top: StairTop
  /** hours to build it, for the estimate; null = a rough allowance from
   * its size (see stairLabourHours) */
  labourHours: number | null
  /** the stairs calculator's inputs; totalRise is kept in step with the
   * wall (the stair opened in the calculator on its own reads it) */
  input: StairInput
}

/** A retaining wall on the site: the whole retaining wall calculator's
 * project, placed. Its plan is turned `rotationDeg` (clockwise on screen)
 * about its first point, and that point put at xM, yM on the site. */
export interface SiteWall {
  id: string
  name: string
  /** where it came from, e.g. the wall project it was copied from */
  source: string
  xM: number
  yM: number
  rotationDeg: number
  wall: WallProject
}

/** A deck — or a floor under sheets — on the site: a rectangle of the
 * Floor Framing engine's frame, `lengthM` along its joists and `widthM`
 * across, placed like a wall: turned `rotationDeg` (clockwise on screen)
 * about its first corner, which sits at xM, yM. Its own plan has x
 * across the joists and y along them, from that corner. The ground
 * under it is at RL `groundLevelM`; its top is `frame.heightMm` above. */
export interface SiteDeck {
  id: string
  name: string
  xM: number
  yM: number
  rotationDeg: number
  lengthM: number
  widthM: number
  groundLevelM: number
  /** mm, decking boards (when it's decked) */
  boardWidth: number
  boardGap: number
  frame: FrameInput
}

/** A house on the site: a copy of a saved House calculator project, put
 * on the plan by the top-left corner of its outline (`xM`, `yM`), turned
 * `rotationDeg` (clockwise on screen) about that corner, its ground floor
 * at RL `floorLevelM`. Drawn on the plan and in 3D only — it's not priced. */
export interface SiteHouse {
  id: string
  name: string
  /** where it was copied from, for the card ("" for none) */
  source: string
  /** the house project it was copied from, to update it from again */
  from: { kind: "private" | "public"; uid?: string; id: string } | null
  xM: number
  yM: number
  rotationDeg: number
  floorLevelM: number
  house: HouseProject
}

export interface SiteProject {
  walls: SiteWall[]
  stairs: SiteStair[]
  decks: SiteDeck[]
  houses: SiteHouse[]
  /** what's typed into the decks' live order */
  deckOrderPins: Record<string, Record<string, number>>
  /** pricing for the whole job (markup, extra lines, the proposal's
   * details); null until it's first changed — see siteEstimateSettings */
  estimate: EstimateSettings | null
}

export const newBlankSite = (): SiteProject => ({ walls: [], stairs: [], decks: [], houses: [], deckOrderPins: {}, estimate: null })

/** The site's pricing, or until it's been set, the first wall's (with
 * every wall's extra lines). */
export const siteEstimateSettings = (site: SiteProject): EstimateSettings =>
  site.estimate ?? (site.walls.length ? { ...site.walls[0].wall.estimate, extraLines: site.walls.flatMap((w) => w.wall.estimate.extraLines) } : DEFAULT_ESTIMATE_SETTINGS)

const randomId = () => Math.random().toString(36).slice(2, 10)

export const newSiteWall = (wall: WallProject, name: string, source: string, at: { xM: number; yM: number }): SiteWall => ({
  id: randomId(),
  name,
  source,
  xM: at.xM,
  yM: at.yM,
  rotationDeg: 0,
  wall,
})

export const newSiteStair = (wallId: string, segmentIndex: number, segLengthM: number, deckId: string | null = null): SiteStair => ({
  id: randomId(),
  wallId: deckId ? "" : wallId,
  deckId,
  label: "",
  segmentIndex,
  from: "start",
  distanceM: Math.round((segLengthM / 2) * 100) / 100,
  anchor: "centre",
  angleDeg: 90,
  bottomOffsetMm: 0,
  topOffsetMm: 0,
  top: "wallRiser",
  labourHours: null,
  input: { ...DEFAULT_INPUT },
})

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback)

export const newSiteDeck = (name: string, at: { xM: number; yM: number }, groundLevelM = 0): SiteDeck => ({
  id: randomId(),
  name,
  xM: at.xM,
  yM: at.yM,
  rotationDeg: 0,
  lengthM: 3,
  widthM: 4,
  groundLevelM,
  boardWidth: 140,
  boardGap: 5,
  frame: { ...DEFAULT_DECK_FRAME },
})

const deckFromSiteData = (raw: unknown, n: number): SiteDeck | null => {
  if (typeof raw !== "object" || raw === null) return null
  const d = raw as Record<string, unknown>
  const pos = (v: unknown, fallback: number) => Math.max(0.3, num(v, fallback))
  const frame = frameInputFromData(d.frame, DEFAULT_DECK_FRAME)
  return {
    id: typeof d.id === "string" && d.id ? d.id : randomId(),
    name: typeof d.name === "string" && d.name ? d.name : `Deck ${n + 1}`,
    xM: num(d.xM, 0),
    yM: num(d.yM, 0),
    rotationDeg: num(d.rotationDeg, 0),
    lengthM: pos(d.lengthM, 3),
    widthM: pos(d.widthM, 4),
    groundLevelM: num(d.groundLevelM, 0),
    boardWidth: Math.max(40, num(d.boardWidth, 140)),
    boardGap: Math.max(0, num(d.boardGap, 5)),
    // on a site, a frame stands on the ground (not between walls)
    frame: { ...frame, support: frame.support === "walls" ? "bearers" : frame.support },
  }
}

export const newSiteHouse = (house: HouseProject, name: string, source: string, from: SiteHouse["from"], at: { xM: number; yM: number }, floorLevelM = 0): SiteHouse => ({
  id: randomId(),
  name,
  source,
  from,
  xM: at.xM,
  yM: at.yM,
  rotationDeg: 0,
  floorLevelM,
  house,
})

const houseFromSiteData = (raw: unknown, n: number): SiteHouse | null => {
  if (typeof raw !== "object" || raw === null) return null
  const h = raw as Record<string, unknown>
  const f = h.from as Record<string, unknown> | null | undefined
  return {
    id: typeof h.id === "string" && h.id ? h.id : randomId(),
    name: typeof h.name === "string" && h.name ? h.name : `House ${n + 1}`,
    source: typeof h.source === "string" ? h.source : "",
    from:
      f && typeof f === "object" && typeof f.id === "string" && (f.kind === "private" || f.kind === "public")
        ? { kind: f.kind, id: f.id, ...(typeof f.uid === "string" ? { uid: f.uid } : {}) }
        : null,
    xM: num(h.xM, 0),
    yM: num(h.yM, 0),
    rotationDeg: num(h.rotationDeg, 0),
    floorLevelM: num(h.floorLevelM, 0),
    house: houseFromData(h.house),
  }
}

export { stairInputFromData }

const wallFromSiteData = (raw: unknown, n: number): SiteWall | null => {
  if (typeof raw !== "object" || raw === null) return null
  const w = raw as Record<string, unknown>
  return {
    id: typeof w.id === "string" && w.id ? w.id : randomId(),
    name: typeof w.name === "string" && w.name ? w.name : `Wall ${n + 1}`,
    source: typeof w.source === "string" ? w.source : "",
    xM: num(w.xM, 0),
    yM: num(w.yM, 0),
    rotationDeg: num(w.rotationDeg, 0),
    wall: wallFromData(w.wall),
  }
}

export const siteFromData = (raw: unknown): SiteProject => {
  const d = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>
  // the first site projects held one wall, as `wall`: it becomes the
  // first site wall, where it was
  const walls: SiteWall[] = Array.isArray(d.walls)
    ? d.walls.map(wallFromSiteData).filter((w): w is SiteWall => w !== null)
    : typeof d.wall === "object" && d.wall !== null
      ? (() => {
          const wall = wallFromData(d.wall)
          const p0 = wall.planPoints[0] ?? { xM: 0, yM: 0 }
          return [{ id: "w1", name: "Wall 1", source: "", xM: p0.xM, yM: p0.yM, rotationDeg: 0, wall }]
        })()
      : []
  const firstWall = walls[0]?.id ?? ""
  const decks = (Array.isArray(d.decks) ? d.decks : []).map(deckFromSiteData).filter((x): x is SiteDeck => x !== null)
  const stairs = (Array.isArray(d.stairs) ? d.stairs : [])
    .filter((s) => typeof s === "object" && s !== null)
    .map(
      (s): SiteStair => ({
        id: typeof s.id === "string" && s.id ? s.id : randomId(),
        deckId: typeof s.deckId === "string" && s.deckId ? s.deckId : null,
        wallId: typeof s.deckId === "string" && s.deckId ? "" : typeof s.wallId === "string" && s.wallId ? s.wallId : firstWall,
        label: typeof s.label === "string" ? s.label : "",
        segmentIndex: typeof s.segmentIndex === "number" && s.segmentIndex >= 0 ? Math.round(s.segmentIndex) : 0,
        from: s.from === "end" ? "end" : "start",
        distanceM: Math.max(0, num(s.distanceM, 0)),
        anchor: s.anchor === "near" || s.anchor === "far" ? s.anchor : "centre",
        angleDeg: Math.min(MAX_STAIR_ANGLE_DEG, Math.max(MIN_STAIR_ANGLE_DEG, num(s.angleDeg, 90))),
        bottomOffsetMm: num(s.bottomOffsetMm, 0),
        topOffsetMm: num(s.topOffsetMm, 0),
        top: s.top === "onWall" ? "onWall" : "wallRiser",
        labourHours: typeof s.labourHours === "number" && Number.isFinite(s.labourHours) && s.labourHours >= 0 ? s.labourHours : null,
        input: stairInputFromData(s.input),
      }),
    )
  const houses = (Array.isArray(d.houses) ? d.houses : []).map(houseFromSiteData).filter((x): x is SiteHouse => x !== null)
  return { walls, stairs, decks, houses, deckOrderPins: pinsFromData(d.deckOrderPins), estimate: typeof d.estimate === "object" && d.estimate !== null ? estimateSettingsFromData(d.estimate) : null }
}

/** A wall's own plan point → the site plan. */
export const toSite = (w: Pick<SiteWall, "xM" | "yM" | "rotationDeg" | "wall">) => {
  const p0 = w.wall.planPoints[0] ?? { xM: 0, yM: 0 }
  const a = (w.rotationDeg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return (p: PlanPoint): PlanPoint => {
    const x = p.xM - p0.xM
    const y = p.yM - p0.yM
    return { xM: w.xM + x * c - y * s, yM: w.yM + x * s + y * c }
  }
}

// a wall's profile, worked out once per version of the wall
const profiles = new WeakMap<WallProject, WallProfile | null>()
export const siteWallProfile = (wall: WallProject): WallProfile | null => {
  if (!profiles.has(wall)) profiles.set(wall, profileForWall(wall))
  return profiles.get(wall) ?? null
}

/** A stair placed on what it comes off, and how to put that on the site. */
export interface SitePlaced {
  wall: SiteWall | null
  deck: SiteDeck | null
  placement: StairPlacement
  /** the host's own plan (where the placement is) → the site */
  place: (p: PlanPoint) => PlanPoint
}

/** Every stair placed on its wall or deck (in that one's own plan). */
export const sitePlacements = (site: SiteProject): SitePlaced[] =>
  site.stairs.flatMap((st): SitePlaced[] => {
    if (st.deckId) {
      const deck = site.decks.find((d) => d.id === st.deckId)
      if (!deck) return []
      const placement = placeStairOn(st, deckStairHost(deck))
      return placement ? [{ wall: null, deck, placement, place: deckToSite(deck) }] : []
    }
    const wall = site.walls.find((w) => w.id === st.wallId)
    if (!wall) return []
    const placement = placeStair(st, wall.wall.planPoints, wall.wall.retainedSide, siteWallProfile(wall.wall))
    return placement ? [{ wall, deck: null, placement, place: toSite(wall) }] : []
  })

// ── houses ─────────────────────────────────────────────────────────────

/** a house's outlines on its own plan (mm, y down), and the corner it's
 * placed by: the top left of both storeys together */
export interface HouseOutlines {
  ground: HousePt[]
  upper: HousePt[] | null
  origin: HousePt
}
const outlineCache = new WeakMap<HouseProject, HouseOutlines>()
export const houseOutlines = (house: HouseProject): HouseOutlines => {
  let o = outlineCache.get(house)
  if (!o) {
    const ground = floorGraph(house.floor).outline
    const upper = house.upper ? floorGraph(house.upper.plan).outline : null
    const all = [...ground, ...(upper ?? [])]
    const origin = all.length ? { x: Math.min(...all.map((p) => p.x)), y: Math.min(...all.map((p) => p.y)) } : { x: 0, y: 0 }
    o = { ground, upper: upper && upper.length >= 3 ? upper : null, origin }
    outlineCache.set(house, o)
  }
  return o
}

/** A point on the house's own plan (mm, y down) → the site (m). */
export const houseToSite = (h: Pick<SiteHouse, "xM" | "yM" | "rotationDeg" | "house">) => {
  const { origin } = houseOutlines(h.house)
  const a = (h.rotationDeg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return (p: HousePt): PlanPoint => {
    const x = (p.x - origin.x) / 1000
    const y = (p.y - origin.y) / 1000
    return { xM: h.xM + x * c - y * s, yM: h.yM + x * s + y * c }
  }
}

// ── decks ──────────────────────────────────────────────────────────────

/** A deck's own plan point (m) → the site. */
export const deckToSite = (d: Pick<SiteDeck, "xM" | "yM" | "rotationDeg">) => {
  const a = (d.rotationDeg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return (p: PlanPoint): PlanPoint => ({ xM: d.xM + p.xM * c - p.yM * s, yM: d.yM + p.xM * s + p.yM * c })
}

/** its corners in its own plan, round it clockwise on screen from the first */
export const deckCorners = (d: Pick<SiteDeck, "lengthM" | "widthM">): PlanPoint[] => [
  { xM: 0, yM: 0 },
  { xM: d.widthM, yM: 0 },
  { xM: d.widthM, yM: d.lengthM },
  { xM: 0, yM: d.lengthM },
]

export const DECK_EDGE_NAMES = ["Top edge", "Right edge", "Bottom edge", "Left edge"]

/** m, RL of the top of the deck */
export const deckTopLevelM = (d: SiteDeck) => d.groundLevelM + d.frame.heightMm / 1000

const deckFrames = new WeakMap<SiteDeck, FrameLayout>()
/** The deck's frame, worked out once per version of the deck (its own
 * plan, mm: joists along y). */
export const siteDeckFrame = (d: SiteDeck): FrameLayout => {
  let f = deckFrames.get(d)
  if (!f) {
    f = buildFrame(rectangleOutline(d.lengthM * 1000, d.widthM * 1000), "y", d.frame)
    deckFrames.set(d, f)
  }
  return f
}

/** The deck's boards, rows across the joists, each row joined over a
 * joist where it's longer than a board (its own plan, mm). */
export function siteDeckBoards(d: SiteDeck): { boards: RenderBoard[]; pieces: number[] } {
  if (d.frame.covering !== "decking") return { boards: [], pieces: [] }
  const f = siteDeckFrame(d)
  const W = d.widthM * 1000
  const L = d.lengthM * 1000
  const pitch = d.boardWidth + d.boardGap
  const boards: RenderBoard[] = []
  const pieces: number[] = []
  for (let y = 0, row = 0; y < L - 1; y += pitch, row++) {
    const run = splitRun(0, W, 6000, f.joistPositions)
    // every other row starts from the far end, so the joins stagger
    let x = row % 2 ? W : 0
    for (const len of row % 2 ? [...run].reverse() : run) {
      const [a, b] = row % 2 ? [x - len, x] : [x, x + len]
      boards.push({ start: a, end: b, rowStart: y, rowEnd: Math.min(y + d.boardWidth, L) })
      pieces.push(len)
      x = row % 2 ? a : b
    }
  }
  return { boards, pieces }
}

/** The edges of a deck as somewhere stairs come down from: level all
 * round, the ground at its ground, the top at its top. */
export function deckStairHost(d: SiteDeck): StairHost {
  const c = deckCorners(d)
  const points = [...c, c[0]]
  let at = 0
  const segments = c.map((a, i) => {
    const b = points[i + 1]
    const lengthM = Math.hypot(b.xM - a.xM, b.yM - a.yM)
    const seg = { index: i, startXM: at, endXM: at + lengthM, lengthM }
    at += lengthM
    return seg
  })
  const levels = { groundLevelM: d.groundLevelM, topLevelM: deckTopLevelM(d), postWidthM: 0 }
  return {
    points,
    segments,
    outward: (i) => {
      const a = points[i]
      const b = points[i + 1]
      const len = Math.hypot(b.xM - a.xM, b.yM - a.yM) || 1
      // round clockwise on screen (y down), outside is to the left
      return { xM: (b.yM - a.yM) / len, yM: -(b.xM - a.xM) / len }
    },
    levelsAt: () => levels,
  }
}

/** The wall's levels at a point along it (m), straight-line between the
 * posts either side. */
export const levelsAt = (profile: WallProfile, xM: number): { groundLevelM: number; topLevelM: number; postWidthM: number } | null => {
  const posts = profile.posts
  if (!posts.length) return null
  if (xM <= posts[0].xM) return { groundLevelM: posts[0].groundLevelM, topLevelM: posts[0].topLevelM, postWidthM: posts[0].widthM }
  for (let i = 1; i < posts.length; i++) {
    const a = posts[i - 1]
    const b = posts[i]
    if (xM <= b.xM) {
      const t = b.xM > a.xM ? (xM - a.xM) / (b.xM - a.xM) : 0
      const lerp = (p: number, q: number) => p + (q - p) * t
      return { groundLevelM: lerp(a.groundLevelM, b.groundLevelM), topLevelM: lerp(a.topLevelM, b.topLevelM), postWidthM: Math.max(a.widthM, b.widthM) }
    }
  }
  const last = posts[posts.length - 1]
  return { groundLevelM: last.groundLevelM, topLevelM: last.topLevelM, postWidthM: last.widthM }
}

/** Somewhere a stair comes down from: a line of runs (a wall's plan, or
 * a deck's edges), the way out from each run (the low side), and the
 * levels along it. */
export interface StairHost {
  points: PlanPoint[]
  segments: { index: number; startXM: number; endXM: number; lengthM: number }[]
  outward: (segmentIndex: number) => PlanPoint
  /** at m along the unfolded line: the ground and the top, and how far
   * its face stands out from the line (half a post) */
  levelsAt: (xM: number) => { groundLevelM: number; topLevelM: number; postWidthM: number } | null
}

export const wallStairHost = (points: PlanPoint[], retainedSide: RetainedSide, profile: WallProfile): StairHost => {
  const lowSide: RetainedSide = retainedSide === "left" ? "right" : "left"
  return {
    points,
    segments: profile.segments,
    outward: (i) => sideNormal(points[i], points[i + 1], lowSide),
    levelsAt: (x) => levelsAt(profile, x),
  }
}

/** A stair worked out where it sits on the wall. */
export interface StairPlacement {
  stair: SiteStair
  /** m along the unfolded wall, the middle of the top tread's back edge */
  centreXM: number
  /** the fixed point itself, m along the unfolded wall */
  fixedXM: number
  /** m, the ground in front of the wall and the top of the wall there */
  groundLevelM: number
  topLevelM: number
  /** m, where the stair finishes at the bottom and the top: the wall's
   * levels with the stair's offsets */
  bottomLevelM: number
  stairTopLevelM: number
  /** the calculator's inputs with the rise taken off the wall */
  input: StairInput
  result: StairResult
  layout: StairLayout
  /** stair-plan mm → wall plan m */
  toPlan: (p: Pt) => PlanPoint
  /** in wall plan coordinates: every tread, landing and winder */
  treads: PlanPoint[][]
  /** the edge it lands on at the top, where it meets the wall */
  topEdge: [PlanPoint, PlanPoint]
  /** the fixed point on the wall's face */
  fixedPoint: PlanPoint
  /** what's wrong with where it is, if anything */
  problems: string[]
}

const clampAngle = (deg: number) => Math.min(MAX_STAIR_ANGLE_DEG, Math.max(MIN_STAIR_ANGLE_DEG, deg))

/** Works out a stair where it's pinned: the wall's height there sets its
 * rise, and its plan is turned and moved so the top step meets the low
 * face of the wall with the chosen part of it on the fixed point. Null
 * while the wall isn't worked out, or the stair's wall is gone. */
export function placeStair(stair: SiteStair, points: PlanPoint[], retainedSide: RetainedSide, profile: WallProfile | null): StairPlacement | null {
  if (!profile) return null
  return placeStairOn(stair, wallStairHost(points, retainedSide, profile))
}

/** placeStair on any host: a wall, or a deck's edge */
export function placeStairOn(stair: SiteStair, host: StairHost): StairPlacement | null {
  const { points } = host
  const seg = host.segments[stair.segmentIndex]
  const a = points[stair.segmentIndex]
  const b = points[stair.segmentIndex + 1]
  if (!seg || !a || !b) return null
  const problems: string[] = []

  const theta = (clampAngle(stair.angleDeg) * Math.PI) / 180
  const sin = Math.sin(theta)
  // half the top tread measured along the wall (longer when it comes off
  // at an angle)
  const halfAlongM = stair.input.width / 2000 / sin
  const along = stair.from === "end" ? seg.lengthM - stair.distanceM : stair.distanceM
  // toward the far end from the end it's measured from
  const awaySign = stair.from === "end" ? -1 : 1
  const shift = stair.anchor === "near" ? halfAlongM * awaySign : stair.anchor === "far" ? -halfAlongM * awaySign : 0
  const centreAlong = along + shift
  const centreXM = seg.startXM + centreAlong
  const fixedXM = seg.startXM + along

  if (centreAlong - halfAlongM < -1e-6 || centreAlong + halfAlongM > seg.lengthM + 1e-6)
    problems.push(stair.deckId ? "It runs past the corner of the deck — move it in, or make it narrower." : "It runs past the end of its wall — move it in, or make it narrower.")

  const levels = host.levelsAt(Math.min(seg.endXM, Math.max(seg.startXM, centreXM)))
  if (!levels) return null
  const bottomLevelM = levels.groundLevelM + stair.bottomOffsetMm / 1000
  const stairTopLevelM = levels.topLevelM + stair.topOffsetMm / 1000
  const riseMm = Math.round((stairTopLevelM - bottomLevelM) * 1000)
  if (riseMm < 100) problems.push(`It's only ${Math.max(0, riseMm)} mm from the bottom to the top there — too little for a step.`)
  const input: StairInput = { ...stair.input, totalRise: Math.max(100, riseMm) }
  const result = calculateStairs(input)
  const layout = calculateLayout(input, result)

  // the wall's frame there: along it, and out toward the low ground
  const len = Math.hypot(b.xM - a.xM, b.yM - a.yM) || 1
  const u = { xM: (b.xM - a.xM) / len, yM: (b.yM - a.yM) / len }
  const n = host.outward(stair.segmentIndex)
  // the way down the stair, and the way up
  const down = { xM: Math.cos(theta) * u.xM + Math.sin(theta) * n.xM, yM: Math.cos(theta) * u.yM + Math.sin(theta) * n.yM }
  const up = { x: -down.xM, y: -down.yM }

  // where the top tread meets the wall: on the low face of the posts
  const onLine = pointAtDistance(points, centreXM)
  const faceM = levels.postWidthM / 2
  // off at an angle the top edge isn't along the wall: push it out till
  // its back corner touches the face (the gap at the other corner is
  // filled in on site)
  const outM = faceM + (stair.input.width / 2000) * Math.abs(Math.cos(theta))
  // a top tread level with the top sits in front of the wall, so the
  // stair's own last riser is a going further out
  const topTreadM = stair.top === "onWall" ? result.going / 1000 : 0
  const topMid = { xM: onLine.xM + n.xM * outM + down.xM * topTreadM, yM: onLine.yM + n.yM * outM + down.yM * topTreadM }
  const fixedOnLine = pointAtDistance(points, fixedXM)
  const fixedPoint = { xM: fixedOnLine.xM + n.xM * faceM, yM: fixedOnLine.yM + n.yM * faceM }

  // turn the stair's plan so its climb runs `up`, then move the middle
  // of its top edge onto topMid (both y down: a turn, never a mirror)
  const [eL, eR] = layout.deckEdge
  const mid = { x: (eL.x + eR.x) / 2, y: (eL.y + eR.y) / 2 }
  const rot = Math.atan2(up.y, up.x) - Math.atan2(layout.deckDir.y, layout.deckDir.x)
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  const toPlan = (p: Pt): PlanPoint => {
    const x = (p.x - mid.x) / 1000
    const y = (p.y - mid.y) / 1000
    return { xM: topMid.xM + x * c - y * s, yM: topMid.yM + x * s + y * c }
  }

  const treads = [...layout.flights.flatMap((f) => f.treadPolys), ...layout.turns.map((t) => t.polygon)].map((poly) => poly.map(toPlan))
  if (topTreadM > 0) {
    // the top tread, between the wall and the last riser
    const [l, r] = [toPlan(eL), toPlan(eR)]
    const back = (q: PlanPoint) => ({ xM: q.xM - down.xM * topTreadM, yM: q.yM - down.yM * topTreadM })
    treads.push([l, r, back(r), back(l)])
  }
  if (layout.errors.length) problems.push(...layout.errors)

  return {
    stair,
    centreXM,
    fixedXM,
    groundLevelM: levels.groundLevelM,
    topLevelM: levels.topLevelM,
    bottomLevelM,
    stairTopLevelM,
    input,
    result,
    layout,
    toPlan,
    treads,
    topEdge: [toPlan(eL), toPlan(eR)],
    fixedPoint,
    problems,
  }
}

// ── the stair in the wall's 3D view ────────────────────────────────────

const FILL_COLOR = "#a0805a"
/** the fill under a raised bottom runs this far past the stair */
const FILL_MARGIN_M = 0.3

/** convex hull of plan points */
const hullOf = (pts: PlanPoint[]): PlanPoint[] => {
  const p = [...pts].sort((a, b) => a.xM - b.xM || a.yM - b.yM)
  if (p.length < 3) return p
  const turn = (o: PlanPoint, a: PlanPoint, b: PlanPoint) => (a.xM - o.xM) * (b.yM - o.yM) - (a.yM - o.yM) * (b.xM - o.xM)
  const half = (list: PlanPoint[]) => {
    const h: PlanPoint[] = []
    for (const q of list) {
      while (h.length >= 2 && turn(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop()
      h.push(q)
    }
    h.pop()
    return h
  }
  return [...half(p), ...half([...p].reverse())]
}

/** A placed stair as solids in the wall's 3D world (metres, y = −plan y,
 * z = level): every part from the stairs calculator's model (less its
 * deck — the wall is the top), standing on its bottom level, and a pad of
 * fill under it where the ground's built up. */
export function stairRenderExtra(p: StairPlacement): RenderExtra {
  type V3 = [number, number, number]
  const toWall = ([x, y, z]: V3): V3 => {
    const q = p.toPlan({ x, y: -y })
    return [q.xM, -q.yM, p.bottomLevelM + z / 1000]
  }
  const solids: RenderExtra["solids"] = []
  const fillUp = p.bottomLevelM - p.groundLevelM
  if (fillUp > 0.005) {
    const hull = hullOf(p.treads.flat())
    const mid = hull.reduce((acc, q) => ({ xM: acc.xM + q.xM / hull.length, yM: acc.yM + q.yM / hull.length }), { xM: 0, yM: 0 })
    const out = hull.map((q) => {
      const d = Math.hypot(q.xM - mid.xM, q.yM - mid.yM) || 1
      return { xM: q.xM + ((q.xM - mid.xM) / d) * FILL_MARGIN_M, yM: q.yM + ((q.yM - mid.yM) / d) * FILL_MARGIN_M }
    })
    const bottom = out.map((q): V3 => [q.xM, -q.yM, p.groundLevelM + 0.004])
    const top = out.map((q): V3 => [q.xM, -q.yM, p.bottomLevelM])
    const faces = [
      { pts: bottom, color: FILL_COLOR },
      { pts: top, color: FILL_COLOR },
      ...out.map((_, i) => {
        const j = (i + 1) % out.length
        return { pts: [bottom[i], bottom[j], top[j], top[i]], color: FILL_COLOR }
      }),
    ]
    solids.push(faces)
  }
  for (const s of stairSolids(p.input, p.layout, NO_DECK)) solids.push(s.faces.map((f) => ({ pts: f.pts.map(toWall), color: f.color })))
  return { solids }
}

const NO_DECK: ReadonlySet<StairMember> = new Set<StairMember>(["deck"])

// ── the stair on the wall's elevation ──────────────────────────────────

/** A placed stair as seen on the wall's elevation, looking at the face of
 * the wall from the low side. */
export function stairElevationExtra(p: StairPlacement, points: PlanPoint[], profile: WallProfile): ElevationExtra | null {
  const seg = profile.segments[p.stair.segmentIndex]
  const a = points[p.stair.segmentIndex]
  const b = points[p.stair.segmentIndex + 1]
  if (!seg || !a || !b) return null
  const len = Math.hypot(b.xM - a.xM, b.yM - a.yM) || 1
  const along = (q: PlanPoint) => seg.startXM + ((q.xM - a.xM) * (b.xM - a.xM) + (q.yM - a.yM) * (b.yM - a.yM)) / len
  const xs = p.treads.flat().map(along)
  const rise = p.result.rise / 1000
  const levels = Array.from({ length: Math.max(0, p.result.risers - 1) }, (_, k) => p.bottomLevelM + (k + 1) * rise)
  return {
    id: p.stair.id,
    segmentIndex: p.stair.segmentIndex,
    fromXM: Math.min(...xs),
    toXM: Math.max(...xs),
    groundM: p.groundLevelM,
    bottomM: p.bottomLevelM,
    topM: p.stairTopLevelM,
    treadLevelsM: levels,
    fixedXM: p.fixedXM,
    label: `${p.stair.label || "Stairs"} · ${p.result.risers} × ${Math.round(p.result.rise)}`,
  }
}

// ── what the stairs need: the order, the estimate, the proposal ───────

/** Everything to buy for one placed stair — with its own top tread when
 * it's level with the top of the wall. */
export const placedStairOrder = (p: StairPlacement): StairOrderLine[] => stairOrder(p.input, p.result, p.layout, { extraTopTread: p.stair.top === "onWall" })

export const placedStairName = (p: StairPlacement, n: number) => p.stair.label || `Stairs ${n + 1}`

/** hours to build it: set by hand, or the rough allowance */
export const placedStairHours = (p: StairPlacement) => p.stair.labourHours ?? stairLabourHours(p.result, p.layout)

/** Every stair's order added up, with which stair each line is for. */
export const siteStairOrder = (placements: StairPlacement[]): CombinedOrderLine[] =>
  combineOrder(placements.flatMap((p, n) => placedStairOrder(p).map((line) => ({ line, from: placements.length > 1 ? placedStairName(p, n) : "" }))))

const normSize = (v: string) => v.replace(/\s/g, "").toLowerCase()
const stockText = (lines: CombinedOrderLine[]) => lines.map((l) => `${l.count} × ${l.lengthM?.toFixed(1)} m`).join(", ")

/** The stairs as estimate lines: timber and decking by the metre (one line
 * a size, every length added up), posts by the metre, post concrete with
 * 10% over, screws each, and labour. */
export function siteStairEstimate(placements: StairPlacement[]): AddedMaterial[] {
  if (!placements.length) return []
  const order = siteStairOrder(placements)
  const out: AddedMaterial[] = []
  const byMaterial = new Map<string, CombinedOrderLine[]>()
  for (const l of order) if (l.lengthM !== null) byMaterial.set(`${l.kind}|${l.material}`, [...(byMaterial.get(`${l.kind}|${l.material}`) ?? []), l])
  for (const lines of byMaterial.values()) {
    const first = lines[0]
    const metres = lines.reduce((a, l) => a + l.count * (l.lengthM ?? 0), 0)
    out.push({
      key: `stairs:${first.kind}:${normSize(first.size)}`,
      category: first.kind === "posts" ? "posts" : "timber",
      description: `Stairs — ${first.material}`,
      detail: stockText(lines),
      quantity: Number(metres.toFixed(2)),
      unit: "m",
      size: first.size,
    })
  }
  const concrete = order.filter((l) => l.kind === "concrete").reduce((a, l) => a + l.count, 0)
  if (concrete > 0)
    out.push({ key: "stairs:concrete", category: "concrete", description: "Stairs — concrete for posts", detail: `${concrete.toFixed(3)} m³ + 10% waste`, quantity: Number((concrete * 1.1).toFixed(3)), unit: "m³" })
  const screws = order.filter((l) => l.kind === "screws").reduce((a, l) => a + l.count, 0)
  if (screws > 0) out.push({ key: "stairs:screws", category: "fixings", description: "Stairs — decking screws", quantity: screws, unit: "each", priceUnit: "each" })
  const hours = placements.reduce((a, p) => a + placedStairHours(p), 0)
  if (hours > 0)
    out.push({
      key: "stairs:labour",
      category: "labour",
      description: "Labour — stairs",
      detail: placements.map((p, n) => `${placedStairName(p, n)}: ${placedStairHours(p)} h`).join(", "),
      quantity: Number(hours.toFixed(1)),
      unit: "hours",
    })
  return out
}

/** The stairs in the proposal's scope of works, one item each. */
export function siteStairScope(placements: StairPlacement[], wallCount: number, wallName?: string): string[] {
  return placements.map((p) => {
    const { input: i, result: r, stair: st } = p
    const run = wallCount > 1 ? `wall ${segmentLabel(st.segmentIndex)}` : "the wall"
    const wall = wallName ? (wallCount > 1 ? `${wallName} (${run})` : wallName) : run
    const turns = p.layout.turns.length
    const framing =
      i.framing === "stacked-frames" ? "stacked timber step frames" : i.framing === "outer-stringers" ? "two outer stringers with riser joists" : "timber stringers with wedge blocks"
    const name = st.label ? `${st.label}: build` : "Build"
    const fill = st.bottomOffsetMm > 0 ? `, landing on ground built up ${Math.round(st.bottomOffsetMm)} mm` : ""
    const top = st.top === "wallRiser" ? ", the wall being the top riser" : ", with its top tread level with the top of the wall"
    const posts = r.stringer.posts.length > 0 || p.layout.turns.some((t) => !t.onPads && t.posts.length) ? " Support posts concreted in." : ""
    return `${name} a timber stair down from ${wall}, ${i.width} mm wide: ${r.risers} risers of ${Math.round(r.rise)} mm and runs of ${Math.round(r.going)} mm${turns ? `, with ${turns} turn${turns > 1 ? "s" : ""}` : ""}${top}${fill}. Framed in H3.2 ${framing}, with ${i.boardWidth} × ${i.boardThickness} decking treads${i.riserBoards ? " and riser boards" : ""}.${posts}`
  })
}

// ── what the decks need: the order, the estimate, the proposal ────────

/** decking boards laid, hours a square metre */
const DECK_BOARD_HOURS_PER_M2 = 0.5

/** Everything to buy for one deck: its frame's order, and its boards. */
export function siteDeckOrderLines(d: SiteDeck): StairOrderLine[] {
  const f = siteDeckFrame(d)
  if (f.needsEngineer) return []
  const { boards, pieces } = siteDeckBoards(d)
  const crossings = boards.reduce((a, b) => a + f.joistPositions.filter((j) => j >= b.start - 1 && j <= b.end + 1).length, 0)
  const lines = frameOrder(f, { boardCrossings: crossings })
  if (pieces.length) {
    const plan = planMixedStock(pieces)
    const t = d.frame.boardThicknessMm
    lines.push({
      kind: "decking",
      use: "Decking boards",
      material: `${d.boardWidth} × ${t} decking`,
      size: `${d.boardWidth} x ${t}`,
      count: plan ? plan.lengths : pieces.length,
      lengthM: plan ? plan.lengthM : 6,
      unit: "lengths",
      detail: `${pieces.length} pieces`,
      pieces: plan ? pieces : undefined,
    })
  }
  return lines
}

/** hours to build a deck: its frame, and its boards */
export const siteDeckHours = (d: SiteDeck) => {
  const f = siteDeckFrame(d)
  const boards = d.frame.covering === "decking" ? d.lengthM * d.widthM * DECK_BOARD_HOURS_PER_M2 : 0
  return Math.round((f.labour.totalHours + boards) * 2) / 2
}

/** Every deck's order added up, with which deck each line is for. */
export const siteDeckOrder = (decks: SiteDeck[]): CombinedOrderLine[] =>
  combineOrder(decks.flatMap((d) => siteDeckOrderLines(d).map((line) => ({ line, from: decks.length > 1 ? d.name : "" }))))

/** The decks as estimate lines, the same way as the stairs: timber and
 * decking by the metre a size, piles by the metre, concrete with 10%
 * over, sheets and fixings each, and labour. */
export function siteDeckEstimate(decks: SiteDeck[]): AddedMaterial[] {
  const priced = decks.filter((d) => !siteDeckFrame(d).needsEngineer)
  if (!priced.length) return []
  const order = siteDeckOrder(priced)
  const out: AddedMaterial[] = []
  const byMaterial = new Map<string, CombinedOrderLine[]>()
  for (const l of order) if (l.lengthM !== null) byMaterial.set(`${l.kind}|${l.material}`, [...(byMaterial.get(`${l.kind}|${l.material}`) ?? []), l])
  for (const lines of byMaterial.values()) {
    const first = lines[0]
    const metres = lines.reduce((a, l) => a + l.count * (l.lengthM ?? 0), 0)
    out.push({
      key: `decks:${first.kind}:${normSize(first.size)}`,
      category: first.kind === "posts" ? "posts" : "timber",
      description: `Decks — ${first.material}`,
      detail: stockText(lines),
      quantity: Number(metres.toFixed(2)),
      unit: "m",
      size: first.size,
    })
  }
  const concrete = order.filter((l) => l.kind === "concrete").reduce((a, l) => a + l.count, 0)
  if (concrete > 0)
    out.push({ key: "decks:concrete", category: "concrete", description: "Decks — concrete for piles", detail: `${concrete.toFixed(3)} m³ + 10% waste`, quantity: Number((concrete * 1.1).toFixed(3)), unit: "m³" })
  for (const l of order.filter((x) => x.kind === "sheets"))
    out.push({ key: `decks:sheets:${normSize(l.material)}`, category: "other", description: `Floors — ${l.material}`, quantity: l.count, unit: "each", priceUnit: "each" })
  for (const l of order.filter((x) => x.kind === "screws"))
    out.push({ key: `decks:fixings:${normSize(l.material)}`, category: "fixings", description: `Decks — ${l.material}`, quantity: l.count, unit: "each", priceUnit: "each" })
  const hours = priced.reduce((a, d) => a + siteDeckHours(d), 0)
  if (hours > 0)
    out.push({
      key: "decks:labour",
      category: "labour",
      description: "Labour — decks",
      detail: priced.map((d) => `${d.name}: ${siteDeckHours(d)} h`).join(", "),
      quantity: Number(hours.toFixed(1)),
      unit: "hours",
    })
  return out
}

/** The decks in the proposal's scope of works, one item each. */
export function siteDeckScope(decks: SiteDeck[]): string[] {
  return decks.map((d) => {
    const f = siteDeckFrame(d)
    const decked = d.frame.covering === "decking"
    const what = decked ? "timber deck" : "timber floor"
    const held =
      d.frame.support === "ledger"
        ? `hung off a ledger bolted to the house and carried on ${f.members.filter((m) => m.kind === "bearer").length} bearer line${f.members.filter((m) => m.kind === "bearer").length === 1 ? "" : "s"}`
        : `on ${f.members.filter((m) => m.kind === "bearer").length} bearer lines`
    const top = decked ? `${d.boardWidth} × ${d.frame.boardThicknessMm} decking` : `${d.frame.sheet.thicknessMm} mm ${d.frame.sheet.kind === "ply" ? "ply" : "particleboard"} flooring`
    return `${d.name}: build a ${d.lengthM.toFixed(2)} × ${d.widthM.toFixed(2)} m ${what}, ${d.frame.heightMm} mm off the ground — ${f.joistSize.replace("mm", "").replace(" x ", " × ")} ${f.treatment} joists at ${f.actualSpacingMm} mm ${held}, on ${f.piles.length} H5 piles concreted in, finished in ${top}.`
  })
}
