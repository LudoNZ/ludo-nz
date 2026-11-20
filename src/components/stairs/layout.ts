/** Stairs that turn: flights joined by landings or winders, at any angle.
 *
 * Plan coordinates are in mm, SVG-style (y down). The first flight's
 * bottom riser runs from (0, 0) to (0, width) and it climbs along +x.
 * "Left" is to the walker's left going up.
 *
 * The stair's risers are numbered from the ground up. A flight of k treads
 * takes k risers; a landing takes one (the riser up onto it); w winders
 * take w; the last riser always steps up onto the deck. So
 * total risers = Σ flight treads + landings + Σ winders + 1, and the last
 * flight's tread count is whatever's left over.
 *
 * Winder and landing rules (NZBC D1/AS1, via BRANZ guidance): winder
 * goings are measured at the pitch line, taken here as the centre of the
 * stair width; a landing should be at least as wide as the stair and at
 * least 900 mm long; a private stair rises no more than 4 m between
 * landings. These are flagged in the UI as needing a check against the
 * current D1/AS1. */

import {
  BEARER_POST_SPACING,
  MAIN_PRIVATE,
  POST_EMBED,
  Pt,
  SERVICE,
  SLIVER_MAX,
  STAIR_RULES_REF,
  STRINGER_SPANS,
  StairInput,
  StairResult,
  TurnSpec,
  calculateStairs,
} from "./stairs"

export const MIN_LANDING_LENGTH = 900
export const MAX_RISE_BETWEEN_LANDINGS = 4000
/** shorter board pieces than this (at a winder's point) are left out */
export const MIN_PIECE = 40

// ---- vector helpers ---------------------------------------------------------

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k })
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y
const len = (a: Pt) => Math.hypot(a.x, a.y)
const unit = (a: Pt): Pt => mul(a, 1 / (len(a) || 1))
/** rotate by `rad` (positive = clockwise on screen, y down) */
const rotate = (v: Pt, rad: number): Pt => ({
  x: v.x * Math.cos(rad) - v.y * Math.sin(rad),
  y: v.x * Math.sin(rad) + v.y * Math.cos(rad),
})
/** the walker's left and right of a travel direction (y down) */
export const leftOf = (d: Pt): Pt => ({ x: d.y, y: -d.x })
export const rightOf = (d: Pt): Pt => ({ x: -d.y, y: d.x })

/** Keep the part of a convex polygon where (p − at)·normal ≥ 0. */
export function clipHalfPlane(poly: Pt[], at: Pt, normal: Pt): Pt[] {
  const out: Pt[] = []
  const side = (p: Pt) => dot(sub(p, at), normal)
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const sa = side(a)
    const sb = side(b)
    if (sa >= -1e-6) out.push(a)
    if ((sa >= -1e-6) !== (sb >= -1e-6)) {
      const t = sa / (sa - sb)
      out.push(add(a, mul(sub(b, a), t)))
    }
  }
  return out
}

export function polygonArea(poly: Pt[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}

const perimeter = (poly: Pt[]) => poly.reduce((acc, p, i) => acc + len(sub(poly[(i + 1) % poly.length], p)), 0)

/** Line–line intersection: a + s·da meets b + t·db. */
function intersect(a: Pt, da: Pt, b: Pt, db: Pt): Pt | null {
  const den = da.x * db.y - da.y * db.x
  if (Math.abs(den) < 1e-9) return null
  const s = ((b.x - a.x) * db.y - (b.y - a.y) * db.x) / den
  return add(a, mul(da, s))
}

/** How far two convex polygons overlap (separating axis test): 0 if they
 * only touch or are apart, otherwise the smallest push that separates them. */
export function overlapDepth(a: Pt[], b: Pt[]): number {
  let best = Infinity
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const e = sub(poly[(i + 1) % poly.length], poly[i])
      if (len(e) < 1e-6) continue
      const axis = unit({ x: -e.y, y: e.x })
      const pa = a.map((p) => dot(p, axis))
      const pb = b.map((p) => dot(p, axis))
      const o = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb))
      if (o <= 0) return 0
      best = Math.min(best, o)
    }
  }
  return best
}

/** Drop consecutive duplicate points. */
const dedupe = (poly: Pt[]) =>
  poly.filter((p, i) => {
    const q = poly[(i + poly.length - 1) % poly.length]
    return len(sub(p, q)) > 0.5
  })

// ---- boards on any tread-shaped region --------------------------------------

export interface Strip {
  poly: Pt[]
  /** longest extent along the board */
  length: number
  /** extent across the board */
  width: number
  ripped: boolean
  /** cut on an angle (winders, angled landings) */
  tapered: boolean
}

/** Decking boards laid parallel to a front (riser) edge A→B, from the
 * nosing back, clipped to the region. `n` points from the front edge into
 * the tread. The nosing pushes the front edge's points forward. */
export function boardStrips(
  region: Pt[],
  a: Pt,
  n: Pt,
  nosing: number,
  boardWidth: number,
  gap: number,
): Strip[] {
  const e = { x: -n.y, y: n.x } // along the board
  const off = (p: Pt) => dot(sub(p, a), n)
  const clip = region.map((p) => (Math.abs(off(p)) < 0.5 ? sub(p, mul(n, nosing)) : p))
  const depth = Math.max(...clip.map(off))
  const strips: Strip[] = []
  for (let s0 = -nosing; s0 < depth - 0.5; s0 += boardWidth + gap) {
    const s1 = Math.min(s0 + boardWidth, depth)
    let poly = clipHalfPlane(clip, add(a, mul(n, s0)), n)
    poly = clipHalfPlane(poly, add(a, mul(n, s1)), mul(n, -1))
    if (poly.length < 3) continue
    const along = poly.map((p) => dot(sub(p, a), e))
    const length = Math.max(...along) - Math.min(...along)
    const width = s1 - s0
    // slivers right at a winder's point aren't worth a board, nor a last
    // one too thin to cut (left out, as on a straight stair)
    if (length < MIN_PIECE) continue
    if (s1 >= depth - 0.5 && width < SLIVER_MAX && s0 > -nosing) continue
    const tapered = polygonArea(poly) < length * width * 0.985
    strips.push({ poly, length, width, ripped: width < boardWidth - 0.5, tapered })
  }
  return strips
}

// ---- layout -----------------------------------------------------------------

export interface PlanFlight {
  index: number
  treads: number
  /** risers below this flight's bottom tread */
  baseRiser: number
  baseHeight: number
  topHeight: number
  /** bottom riser, walker's left and right ends */
  startL: Pt
  startR: Pt
  dir: Pt
  treadPolys: Pt[][]
  boards: Strip[]
  /** support lines (stringers / joists) in plan, bottom to top */
  supportLines: [Pt, Pt][]
  /** span posts under the stringers */
  posts: Pt[]
  /** this flight worked out as a straight stair of its own */
  sub: StairResult
  subInput: StairInput
}

export interface TurnRegion {
  poly: Pt[]
  riser: number
  height: number
  frontA: Pt
  frontB: Pt
  /** unit direction of travel across this tread (front edge → back) */
  normal: Pt
  /** going at the pitch line (centre of the width) */
  going: number
  /** going at the outside edge */
  outerGoing: number
  boards: Strip[]
}

export interface TurnFrame {
  /** 1 = the base platform on posts; higher frames sit on the one below */
  level: number
  poly: Pt[]
  height: number
  perimeter: number
  joists: number[]
}

export interface PlanTurn {
  index: number
  spec: TurnSpec
  polygon: Pt[]
  pivot: Pt
  regions: TurnRegion[]
  frames: TurnFrame[]
  /** depth along the incoming direction (landing length) */
  length: number
  joistDepth: number
  posts: { p: Pt; height: number }[]
  postLength: number
  onPads: boolean
  /** riser board lengths (one per region) */
  riserLengths: number[]
}

export interface StairLayout {
  flights: PlanFlight[]
  turns: PlanTurn[]
  deckEdge: [Pt, Pt]
  deckDir: Pt
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
  errors: string[]
  notes: string[]
  /** every decking board piece length, for the board order */
  boardPieces: number[]
  /** tapered / angled pieces among them */
  taperedPieces: number
  /** longest climb with no landing */
  maxRiseBetweenLandings: number
}

/** Fill in each flight's tread count (the last one takes the remainder). */
export function resolveFlightTreads(input: StairInput, totalRisers: number): { treads: number[]; remainder: number } {
  const turnRisers = input.turns.reduce((acc, t) => acc + (t.kind === "landing" ? 1 : Math.max(1, t.winders)), 0)
  const fixed = input.flights.slice(0, -1).reduce((acc, f) => acc + Math.max(0, f.treads ?? 0), 0)
  const remainder = totalRisers - 1 - turnRisers - fixed
  const treads = input.flights.map((f, i) => (i === input.flights.length - 1 ? remainder : Math.max(0, f.treads ?? 0)))
  return { treads, remainder }
}

export function calculateLayout(input: StairInput, whole: StairResult): StairLayout {
  const R = whole.rise
  const G = whole.going
  const W = input.width
  const t = input.boardThickness
  const nosing = whole.nosing
  const riserT = input.riserBoards ? t : 0
  const errors: string[] = []
  const notes: string[] = []

  const { treads, remainder } = resolveFlightTreads(input, whole.risers)
  if (remainder < 0)
    errors.push(
      `Not enough risers for these flights and turns — ${-remainder} short. Add risers or take treads off a flight.`,
    )

  const flights: PlanFlight[] = []
  const turns: PlanTurn[] = []
  const boardPieces: number[] = []
  let taperedPieces = 0

  let startL: Pt = { x: 0, y: 0 }
  let dir: Pt = { x: 1, y: 0 }
  let riser = 0 // risers climbed so far
  let sinceLanding = 0
  let maxRiseBetweenLandings = 0

  for (let fi = 0; fi < input.flights.length; fi++) {
    const k = Math.max(0, treads[fi])
    const startR = add(startL, mul(rightOf(dir), W))
    const toWorld = (along: number, across: number) => add(add(startL, mul(dir, along)), mul(rightOf(dir), across))

    // the flight as its own straight stair: k treads, k + 1 risers
    const subInput: StairInput = {
      ...input,
      totalRise: (k + 1) * R,
      risers: k + 1,
      flights: [{ treads: null }],
      turns: [],
    }
    const flightCalc = calculateStairs(subInput)

    const treadPolys: Pt[][] = []
    const boards: Strip[] = []
    for (let i = 1; i <= k; i++) {
      const a = toWorld((i - 1) * G, 0)
      treadPolys.push([a, toWorld(i * G, 0), toWorld(i * G, W), toWorld((i - 1) * G, W)])
      // tread i's front edge is its riser face (plus a riser board)
      const front = toWorld((i - 1) * G - riserT, 0)
      const region = [front, toWorld(i * G, 0), toWorld(i * G, W), toWorld((i - 1) * G - riserT, W)]
      const strips = boardStrips(region, front, dir, nosing, input.boardWidth, input.boardGap)
      boards.push(...strips)
      boardPieces.push(...strips.map(() => W))
      if (input.riserBoards) boardPieces.push(...flightCalc.riserBoardPieces.map(() => W))
    }
    // the flight's top riser (onto the turn or the deck)
    if (input.riserBoards) boardPieces.push(...flightCalc.riserBoardPieces.map(() => W))

    const outer = input.framing === "outer-stringers"
    const lines = flightCalc.supports.positions.filter((_, i, all) => !outer || i === 0 || i === all.length - 1)
    const startAlong = input.framing === "stacked-frames" ? 0 : flightCalc.stringer.toeX
    const supportLines: [Pt, Pt][] =
      k > 0 ? lines.map((y) => [toWorld(startAlong, y), toWorld(k * G, y)] as [Pt, Pt]) : []
    const posts = flightCalc.stringer.posts.flatMap((p) => lines.map((y) => toWorld(p.x, y)))

    flights.push({
      index: fi,
      treads: k,
      baseRiser: riser,
      baseHeight: riser * R,
      topHeight: (riser + k + 1) * R,
      startL,
      startR,
      dir,
      treadPolys,
      boards,
      supportLines,
      posts,
      sub: flightCalc,
      subInput,
    })

    riser += k
    sinceLanding += k
    const endL = toWorld(k * G, 0)
    const endR = toWorld(k * G, W)

    const spec = input.turns[fi]
    if (!spec) {
      startL = endL
      break
    }

    // ---- the turn -----------------------------------------------------------
    const theta = (Math.min(Math.max(spec.angle, 1), 180) * Math.PI) / 180
    const left = spec.direction === "left"
    const rot = left ? -theta : theta
    const sgn = left ? -1 : 1
    const P = left ? endL : endR
    const o0 = left ? rightOf(dir) : leftOf(dir) // pivot → outer corner
    const Q = add(P, mul(o0, W))
    const o1 = rotate(o0, rot)
    const Q2 = add(P, mul(o1, W))
    const d1 = rotate(dir, rot)
    let polygon: Pt[]
    if (theta < Math.PI / 2 - 1e-6) {
      const corner = intersect(Q, dir, Q2, d1) ?? add(Q, mul(dir, W))
      polygon = [P, Q, corner, Q2]
    } else {
      polygon = dedupe([P, Q, add(Q, mul(dir, W)), sub(Q2, mul(d1, W)), Q2])
    }
    // keep vertices in a consistent winding for clipping
    const length = Math.max(...polygon.map((p) => dot(sub(p, P), dir)))

    const regions: TurnRegion[] = []
    const count = spec.kind === "landing" ? 1 : Math.max(1, Math.round(spec.winders))
    const step = theta / count
    for (let j = 1; j <= count; j++) {
      const u0 = rotate(o0, sgn * step * (j - 1))
      const u1 = rotate(o0, sgn * step * j)
      let poly = polygon
      if (spec.kind === "winders") {
        // between ray j−1 and ray j, out from the pivot
        poly = clipHalfPlane(poly, P, mul({ x: -u0.y, y: u0.x }, sgn))
        poly = clipHalfPlane(poly, P, mul({ x: -u1.y, y: u1.x }, -sgn))
      }
      const level = riser + j
      // front edge: the incoming riser line for a landing / first winder,
      // otherwise ray j−1 from the pivot to the polygon boundary
      let frontA: Pt
      let frontB: Pt
      let n: Pt
      if (spec.kind === "landing" || j === 1) {
        frontA = endL
        frontB = endR
        n = dir
      } else {
        const onRay = poly.filter((p) => Math.abs(dot(sub(p, P), { x: -u0.y, y: u0.x })) < 0.5)
        const far = onRay.reduce((best, p) => (dot(sub(p, P), u0) > dot(sub(best, P), u0) ? p : best), P)
        frontA = P
        frontB = far
        n = mul({ x: -u0.y, y: u0.x }, sgn)
      }
      const strips = boardStrips(poly, frontA, n, nosing, input.boardWidth, input.boardGap)
      boardPieces.push(...strips.map((s) => s.length))
      taperedPieces += strips.filter((s) => s.tapered).length
      const pitchR = W / 2
      const going =
        spec.kind === "landing" ? length : 2 * pitchR * Math.sin(step / 2) // chord at the pitch line
      const outerGoing = spec.kind === "landing" ? length : 2 * W * Math.sin(step / 2)
      regions.push({
        poly,
        riser: level,
        height: level * R,
        frontA,
        frontB,
        normal: unit(n),
        going,
        outerGoing,
        boards: strips,
      })
    }
    const riserLengths = regions.map((r) => len(sub(r.frontB, r.frontA)))
    if (input.riserBoards) for (const l of riserLengths) boardPieces.push(...Array(Math.max(1, Math.ceil((R - t) / input.boardWidth))).fill(l))

    // ---- framing: a platform on posts, winders stacked on it -------------
    const maxSpan = Math.max(...polygon.map((p) => Math.max(...polygon.map((q) => len(sub(p, q))))))
    const joistDepth = STRINGER_SPANS.find((r) => r.span >= Math.min(maxSpan, W * 1.5))?.depth ?? 290
    const frames: TurnFrame[] = []
    for (let j = 1; j <= count; j++) {
      let poly = polygon
      if (spec.kind === "winders") {
        const u0 = rotate(o0, sgn * step * (j - 1))
        poly = clipHalfPlane(poly, P, mul({ x: -u0.y, y: u0.x }, sgn))
      }
      // joists run front to back (along the travel) under this level's own
      // tread, at the board span spacing across it — square to the boards
      const travel = regions[j - 1].normal
      const across = { x: -travel.y, y: travel.x }
      const own = regions[j - 1].poly
      const offs = own.map((p) => dot(sub(p, P), across))
      const lo = Math.min(...offs)
      const hi = Math.max(...offs)
      const spaces = Math.max(1, Math.ceil((hi - lo) / Math.max(input.maxStringerSpacing, 100)))
      const joists: number[] = []
      for (let s = 1; s < spaces; s++) {
        const o = lo + ((hi - lo) * s) / spaces
        let strip = clipHalfPlane(own, add(P, mul(across, o - 10)), across)
        strip = clipHalfPlane(strip, add(P, mul(across, o + 10)), mul(across, -1))
        if (strip.length >= 3) {
          const along = strip.map((p) => dot(sub(p, P), travel))
          joists.push(Math.max(...along) - Math.min(...along))
        }
      }
      const height = j === 1 ? joistDepth : R
      frames.push({ level: j, poly, height, perimeter: perimeter(poly), joists })
    }

    // posts round the base platform: at every corner and no more than
    // BEARER_POST_SPACING apart along each edge
    const baseTop = (riser + 1) * R - t
    const postHeight = baseTop - joistDepth
    const onPads = postHeight < 150
    const turnPosts: { p: Pt; height: number }[] = []
    if (!onPads) {
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i]
        const b = polygon[(i + 1) % polygon.length]
        const parts = Math.max(1, Math.ceil(len(sub(b, a)) / BEARER_POST_SPACING))
        for (let s = 0; s < parts; s++) turnPosts.push({ p: add(a, mul(sub(b, a), s / parts)), height: postHeight })
      }
    }

    turns.push({
      index: fi,
      spec,
      polygon,
      pivot: P,
      regions,
      frames,
      length,
      joistDepth,
      posts: turnPosts,
      postLength: postHeight + POST_EMBED,
      onPads,
      riserLengths,
    })

    // checks
    if (spec.kind === "landing") {
      if (length < MIN_LANDING_LENGTH - 0.5)
        notes.push(`Turn ${fi + 1}: the landing is ${Math.round(length)} mm long — landings must be at least ${MIN_LANDING_LENGTH} mm long (NZBC D1/AS1).`)
      maxRiseBetweenLandings = Math.max(maxRiseBetweenLandings, (sinceLanding + 1) * R)
      sinceLanding = 0
    } else {
      sinceLanding += count
      const g = regions[0].going
      if (g < SERVICE.minGoing - 0.5)
        notes.push(
          `Turn ${fi + 1}: each winder's run is only ${Math.round(g)} mm at the centre of the stair — under even the ${SERVICE.minGoing} mm minimum for a service stair (${STAIR_RULES_REF}). Use fewer winders or a landing.`,
        )
      else if (g < MAIN_PRIVATE.minGoing - 0.5)
        notes.push(
          `Turn ${fi + 1}: each winder's run is ${Math.round(g)} mm at the centre of the stair — under the ${MAIN_PRIVATE.minGoing} mm minimum for a main private stair (${STAIR_RULES_REF}); OK for a service stair.`,
        )
    }

    riser += count
    // next flight starts on the outgoing edge
    startL = left ? P : Q2
    dir = d1
  }

  maxRiseBetweenLandings = Math.max(maxRiseBetweenLandings, (sinceLanding + 1) * R)
  if (input.turns.length > 0 && maxRiseBetweenLandings > MAX_RISE_BETWEEN_LANDINGS)
    notes.push(
      `There's a ${(maxRiseBetweenLandings / 1000).toFixed(2)} m climb with no landing — a private stair needs a landing at least every ${MAX_RISE_BETWEEN_LANDINGS / 1000} m of height (${STAIR_RULES_REF}).`,
    )

  // does the stair run into itself? (e.g. two left turns on short runs)
  const pieces: { name: string; poly: Pt[] }[] = []
  for (const f of flights) {
    if (f.treads > 0) {
      const end = mul(f.dir, f.treads * G)
      pieces.push({ name: `run ${f.index + 1}`, poly: [f.startL, add(f.startL, end), add(f.startR, end), f.startR] })
    }
    const tn = turns[f.index]
    if (tn) pieces.push({ name: `turn ${tn.index + 1}`, poly: tn.polygon })
  }
  const clashes = new Set<string>()
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++)
      if (overlapDepth(pieces[i].poly, pieces[j].poly) > 5) clashes.add(`${pieces[j].name} runs into ${pieces[i].name}`)
  if (clashes.size)
    errors.push(
      `The stair overlaps itself: ${[...clashes].join(", ")}. Turn the other way, change the angle, or make a run longer.`,
    )

  const last = flights[flights.length - 1]
  const lastEndL = last ? add(last.startL, mul(last.dir, last.treads * G)) : startL
  const deckDir = last ? last.dir : dir
  const deckEdge: [Pt, Pt] = [lastEndL, add(lastEndL, mul(rightOf(deckDir), W))]

  const all: Pt[] = [
    ...flights.flatMap((f) => [f.startL, f.startR, ...f.treadPolys.flat()]),
    ...turns.flatMap((tn) => tn.polygon),
    ...deckEdge,
    ...deckEdge.map((p) => add(p, mul(deckDir, 400))),
  ]
  const bbox = {
    minX: Math.min(...all.map((p) => p.x)),
    minY: Math.min(...all.map((p) => p.y)),
    maxX: Math.max(...all.map((p) => p.x)),
    maxY: Math.max(...all.map((p) => p.y)),
  }

  return {
    flights,
    turns,
    deckEdge,
    deckDir,
    bbox,
    errors,
    notes,
    boardPieces,
    taperedPieces,
    maxRiseBetweenLandings,
  }
}
