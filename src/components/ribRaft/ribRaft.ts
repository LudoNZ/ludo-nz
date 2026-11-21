/** A rib raft (waffle) slab on its footprint, set out the way the
 * engineers draw them (e.g. Firth RibRaft, or a specific design like
 * "1100 × 1100 × 300 pods, 100 ribs, 300 edge beams, 85 topping"):
 *
 *  - a 300 edge beam all round, under the outside walls;
 *  - a 300 internal beam under each load-bearing wall;
 *  - pods laid on a grid from one corner (or centred), a rib between each;
 *  - a strip too narrow for a cut pod goes concrete instead — the beam
 *    widens, up to its most (500, the usual note) — and one wider gets a
 *    pod cut to fit;
 *  - an 85 topping with one layer of mesh over the lot.
 *
 * From that, the takeoff: pods (full and cut), concrete, mesh sheets, the
 * bars in the beams and ribs (with laps), corner bars, DPM, hardfill and
 * sand blinding, boxing. Plan mm, y down; orthogonal outlines. Pure.
 *
 * It's an estimate off the usual notes, not a design: the engineer's
 * drawings say where the beams go, what's in them, and the pour. */

export interface Pt {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface RibRaftSettings {
  /** pods are square, this size on plan, and this tall */
  podMm: number
  podHeightMm: number
  ribMm: number
  edgeBeamMm: number
  /** an edge beam can be widened to this to save cutting a thin pod */
  maxEdgeBeamMm: number
  internalBeamMm: number
  toppingMm: number
  /** where the pod grid starts: from the top-left corner's edge beams, or centred so each side's left-over is the same */
  setout: "corner" | "centred"
  /** mesh (e.g. SE62): its sheet, and the lap (two cross wires, ≥ 225) */
  meshName: string
  meshSheetW: number
  meshSheetH: number
  meshLapMm: number
  /** the reinforcing bar, its stock length, and its lap */
  barName: string
  barStockMm: number
  barLapMm: number
  /** bars in each: an edge beam's top and bottom, an internal beam's, a rib's */
  edgeBarsTop: number
  edgeBarsBottom: number
  internalBars: number
  ribBars: number
  /** how far a rib's bar runs on into the beam at each end */
  ribAnchorMm: number
  /** corner bars at each outside corner (top and bottom), each leg this long */
  cornerBarLegMm: number
  /** an inside (re-entrant) corner's diagonal bars: how many, how long */
  reentrantBars: number
  reentrantBarMm: number
  hardfillMm: number
  sandMm: number
  /** on concrete, mesh and pods */
  wastePct: number
  concreteMpa: number
}

export const DEFAULT_RIB_RAFT: RibRaftSettings = {
  podMm: 1100,
  podHeightMm: 300,
  ribMm: 100,
  edgeBeamMm: 300,
  maxEdgeBeamMm: 500,
  internalBeamMm: 300,
  toppingMm: 85,
  setout: "corner",
  meshName: "SE62 500E",
  meshSheetW: 6000,
  meshSheetH: 2400,
  meshLapMm: 225,
  barName: "HD12",
  barStockMm: 6000,
  barLapMm: 700,
  edgeBarsTop: 1,
  edgeBarsBottom: 2,
  internalBars: 2,
  ribBars: 1,
  ribAnchorMm: 200,
  cornerBarLegMm: 450,
  reentrantBars: 2,
  reentrantBarMm: 1200,
  hardfillMm: 75,
  sandMm: 25,
  wastePct: 5,
  concreteMpa: 20,
}

/** the setting a house project's slab carries (a partial: unset is the default) */
export const ribRaftFromData = (d: unknown): RibRaftSettings => ({ ...DEFAULT_RIB_RAFT, ...(d && typeof d === "object" ? (d as Partial<RibRaftSettings>) : {}) })

export interface RibRaftInput {
  /** the slab's edge (outside face of the edge beams) */
  outline: Pt[]
  /** load-bearing walls over it: an internal beam under each (axis-square lines) */
  beams?: { a: Pt; b: Pt }[]
  /** the outline's sides that are a free joint to the next slab (a party wall): R16 dowels across, by side index */
  joints?: number[]
}

export interface PodPiece extends Rect {
  /** "full", or cut to fit */
  cut: boolean
  /** a cut pod that isn't a plain rectangle (cut round a corner) */
  odd?: boolean
  area: number
}

export interface BarLine {
  what: string
  /** total length of bar, mm, before laps */
  lengthMm: number
  /** bars in the line (top + bottom, or one) */
  count: number
}

export interface RibRaftResult {
  areaM2: number
  perimeterMm: number
  depthMm: number
  pods: PodPiece[]
  fullPods: number
  cutPods: number
  /** cut pods worth of whole pods to buy (each cut one from a whole pod; pieces of two halves share one) */
  podsToBuy: number
  /** the ribs between pods: their total length */
  ribMm: number
  /** each rib's run beam to beam (for drawing and its bar) */
  ribRuns: { a: Pt; b: Pt }[]
  internalBeamMm: number
  bands: Rect[]
  concreteM3: number
  concreteToOrderM3: number
  meshSheets: number
  bars: BarLine[]
  /** stock bars (each `barStockMm`) to cover every line with laps */
  barsToBuy: number
  barMetres: number
  outsideCorners: number
  insideCorners: number
  cornerBars: number
  reentrantBars: number
  /** free joints to the next slab: their length, and the dowels across (R16 × 500 @ 600) */
  jointMm: number
  dowels: number
  dpmM2: number
  hardfillM3: number
  sandM3: number
  boxingM: number
  /** pod spacers (4 to a pod) and bar chairs (one a metre of bar, one a square metre of mesh) */
  spacers: number
  chairs: number
  notes: string[]
}

const EPS = 0.5

const insidePoly = (pts: Pt[], p: Pt) => {
  let ins = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) ins = !ins
  }
  return ins
}

/** a rectangle wholly inside an orthogonal outline: its corners in (or on the edge) and no corner of the outline inside it */
const rectInside = (poly: Pt[], x0: number, y0: number, x1: number, y1: number) => {
  const pull = (v: number, lo: number, hi: number) => Math.min(hi - EPS, Math.max(lo + EPS, v))
  const corners = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ].map((p) => ({ x: pull(p.x, x0, x1), y: pull(p.y, y0, y1) }))
  if (!corners.every((p) => insidePoly(poly, p))) return false
  return !poly.some((v) => v.x > x0 + EPS && v.x < x1 - EPS && v.y > y0 + EPS && v.y < y1 - EPS)
}

export const polyArea = (pts: Pt[]) => Math.abs(pts.reduce((s, p, i) => s + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0) / 2)

const uniq = (vals: number[]) => {
  const s = [...vals].sort((a, b) => a - b)
  return s.filter((v, i) => i === 0 || v - s[i - 1] > EPS)
}

/** stock bars for a line of bar this long, with laps */
const stockFor = (len: number, stock: number, lap: number) => (len <= 0 ? 0 : len <= stock ? 1 : 1 + Math.ceil((len - stock) / Math.max(1, stock - lap)))

export function ribRaft(input: RibRaftInput, s: RibRaftSettings = DEFAULT_RIB_RAFT): RibRaftResult {
  const poly = input.outline
  const notes: string[] = []
  const n = poly.length
  const empty: RibRaftResult = {
    areaM2: 0,
    perimeterMm: 0,
    depthMm: s.podHeightMm + s.toppingMm,
    pods: [],
    fullPods: 0,
    cutPods: 0,
    podsToBuy: 0,
    ribMm: 0,
    ribRuns: [],
    internalBeamMm: 0,
    bands: [],
    concreteM3: 0,
    concreteToOrderM3: 0,
    meshSheets: 0,
    bars: [],
    barsToBuy: 0,
    barMetres: 0,
    outsideCorners: 0,
    insideCorners: 0,
    cornerBars: 0,
    reentrantBars: 0,
    jointMm: 0,
    dowels: 0,
    dpmM2: 0,
    hardfillM3: 0,
    sandM3: 0,
    boxingM: 0,
    spacers: 0,
    chairs: 0,
    notes,
  }
  if (n < 4) return empty
  const xsAll = poly.map((p) => p.x)
  const ysAll = poly.map((p) => p.y)
  const minX = Math.min(...xsAll)
  const maxX = Math.max(...xsAll)
  const minY = Math.min(...ysAll)
  const maxY = Math.max(...ysAll)
  const e = s.edgeBeamMm
  const pitch = s.podMm + s.ribMm
  // (a strip narrower than this goes concrete: the beam, rib and strip together no wider than the beam's most)
  const minCut = Math.max(50, s.maxEdgeBeamMm - s.edgeBeamMm - s.ribMm)

  // the internal beams' bands, clipped to the slab
  const bands: Rect[] = (input.beams ?? []).map(({ a, b }) => {
    const hw = s.internalBeamMm / 2
    const x0 = Math.max(minX, Math.min(a.x, b.x) - (Math.abs(a.x - b.x) < EPS ? hw : 0))
    const x1 = Math.min(maxX, Math.max(a.x, b.x) + (Math.abs(a.x - b.x) < EPS ? hw : 0))
    const y0 = Math.max(minY, Math.min(a.y, b.y) - (Math.abs(a.y - b.y) < EPS ? hw : 0))
    const y1 = Math.min(maxY, Math.max(a.y, b.y) + (Math.abs(a.y - b.y) < EPS ? hw : 0))
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  })
  const inBand = (p: Pt) => bands.some((r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h)

  // where pods can go: a point with the edge beam's width of slab all round it, off the internal beams
  const cutsX = uniq([...xsAll.flatMap((x) => [x - e, x + e]), ...bands.flatMap((r) => [r.x, r.x + r.w])])
  const cutsY = uniq([...ysAll.flatMap((y) => [y - e, y + e]), ...bands.flatMap((r) => [r.y, r.y + r.h])])

  // the slab cut into compartments by the internal beams: each laid out from its own corner
  const fineX = uniq([...xsAll, ...bands.flatMap((r) => [r.x, r.x + r.w])])
  const fineY = uniq([...ysAll, ...bands.flatMap((r) => [r.y, r.y + r.h])])
  const compOf = new Map<string, number>()
  const cellKey = (i: number, j: number) => `${i},${j}`
  const live = (i: number, j: number) => {
    if (i < 0 || j < 0 || i + 1 >= fineX.length || j + 1 >= fineY.length) return false
    const mid = { x: (fineX[i] + fineX[i + 1]) / 2, y: (fineY[j] + fineY[j + 1]) / 2 }
    return insidePoly(poly, mid) && !inBand(mid)
  }
  const comps: { x0: number; y0: number; x1: number; y1: number }[] = []
  for (let i = 0; i + 1 < fineX.length; i++)
    for (let j = 0; j + 1 < fineY.length; j++) {
      if (compOf.has(cellKey(i, j)) || !live(i, j)) continue
      const id = comps.length
      const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
      const stack = [[i, j]]
      compOf.set(cellKey(i, j), id)
      while (stack.length) {
        const [a, b] = stack.pop()!
        box.x0 = Math.min(box.x0, fineX[a])
        box.x1 = Math.max(box.x1, fineX[a + 1])
        box.y0 = Math.min(box.y0, fineY[b])
        box.y1 = Math.max(box.y1, fineY[b + 1])
        for (const [c, d] of [
          [a + 1, b],
          [a - 1, b],
          [a, b + 1],
          [a, b - 1],
        ])
          if (!compOf.has(cellKey(c, d)) && live(c, d)) {
            compOf.set(cellKey(c, d), id)
            stack.push([c, d])
          }
      }
      comps.push(box)
    }
  const compAt = (p: Pt) => {
    const i = fineX.findIndex((x, k) => k + 1 < fineX.length && p.x >= x && p.x <= fineX[k + 1])
    const j = fineY.findIndex((y, k) => k + 1 < fineY.length && p.y >= y && p.y <= fineY[k + 1])
    return compOf.get(cellKey(i, j)) ?? -1
  }

  /** a pod's spot clipped to where pods can go in its compartment: the covered cells */
  const clip = (r: Rect, comp: number) => {
    const xs = uniq([r.x, r.x + r.w, ...cutsX.filter((x) => x > r.x && x < r.x + r.w)])
    const ys = uniq([r.y, r.y + r.h, ...cutsY.filter((y) => y > r.y && y < r.y + r.h)])
    const cells: Rect[] = []
    for (let i = 0; i + 1 < xs.length; i++)
      for (let j = 0; j + 1 < ys.length; j++) {
        const c = { x: xs[i], y: ys[j], w: xs[i + 1] - xs[i], h: ys[j + 1] - ys[j] }
        const mid = { x: c.x + c.w / 2, y: c.y + c.h / 2 }
        if (inBand(mid) || compAt(mid) !== comp) continue
        if (rectInside(poly, c.x - e, c.y - e, c.x + c.w + e, c.y + c.h + e)) cells.push(c)
      }
    return cells
  }

  /** where a compartment's grid starts along one axis: in from the edge beam (or the internal beam's face), or centred */
  // (a beam's face across this axis: a plumb band's sides for x, a level band's for y)
  const onBandFace = (v: number, axis: "x" | "y") =>
    bands.some((r) => (axis === "x" ? r.h > r.w && (Math.abs(r.x - v) < EPS || Math.abs(r.x + r.w - v) < EPS) : r.w > r.h && (Math.abs(r.y - v) < EPS || Math.abs(r.y + r.h - v) < EPS)))
  const startOf = (lo: number, hi: number, axis: "x" | "y") => {
    const inLo = onBandFace(lo, axis) ? 0 : e
    const inHi = onBandFace(hi, axis) ? 0 : e
    if (s.setout === "corner") return lo + inLo
    const span = hi - lo - inLo - inHi + s.ribMm
    const rem = span - Math.floor(span / pitch) * pitch
    return lo + inLo + rem / 2
  }

  const grid = new Map<string, PodPiece>()
  const pods: PodPiece[] = []
  const lines: { comp: number; ox: number; oy: number; cols: number; rows: number }[] = []
  comps.forEach((c, comp) => {
    const ox = startOf(c.x0, c.x1, "x")
    const oy = startOf(c.y0, c.y1, "y")
    const cols = Math.ceil((c.x1 - ox) / pitch) + 1
    const rows = Math.ceil((c.y1 - oy) / pitch) + 1
    lines.push({ comp, ox, oy, cols, rows })
    for (let i = -1; i < cols; i++)
      for (let j = -1; j < rows; j++) {
        const r = { x: ox + i * pitch, y: oy + j * pitch, w: s.podMm, h: s.podMm }
        const cells = clip(r, comp)
        if (!cells.length) continue
        const area = cells.reduce((t, k) => t + k.w * k.h, 0)
        const x0 = Math.min(...cells.map((k) => k.x))
        const y0 = Math.min(...cells.map((k) => k.y))
        const x1 = Math.max(...cells.map((k) => k.x + k.w))
        const y1 = Math.max(...cells.map((k) => k.y + k.h))
        const full = area >= s.podMm * s.podMm - 1
        // (too thin to bother cutting: concrete)
        if (!full && Math.min(x1 - x0, y1 - y0) < minCut) continue
        const p: PodPiece = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cut: !full, area, ...(Math.abs(area - (x1 - x0) * (y1 - y0)) > 1 ? { odd: true } : {}) }
        pods.push(p)
        grid.set(`${comp}:${i},${j}`, p)
      }
  })
  const fullPods = pods.filter((p) => !p.cut).length
  const cut = pods.filter((p) => p.cut)
  // (two cuts under half a pod each come out of one)
  const halves = cut.filter((p) => p.area <= (s.podMm * s.podMm) / 2 + 1).length
  const podsToBuy = Math.ceil((fullPods + (cut.length - halves) + Math.ceil(halves / 2)) * (1 + s.wastePct / 100))

  // ribs: between neighbouring pods, run on through the crossings to the beams either end
  const ribRuns: { a: Pt; b: Pt }[] = []
  let ribMm = 0
  const runsAlong = (lineAt: (k: number) => number, pairs: [number, number][]) => {
    // pairs: overlap intervals along the rib line; merged across the crossings
    const iv = pairs.sort((a, b) => a[0] - b[0])
    const merged: [number, number][] = []
    for (const [a, b] of iv) {
      const last = merged[merged.length - 1]
      if (last && a <= last[1] + s.ribMm + EPS) last[1] = Math.max(last[1], b)
      else merged.push([a, b])
    }
    return merged.map(([a, b]) => ({ a, b, at: lineAt(0) }))
  }
  for (const { comp, ox, oy, cols, rows } of lines) {
    // vertical ribs (between columns i and i+1)
    for (let i = -1; i < cols; i++) {
      const x = ox + i * pitch + s.podMm + s.ribMm / 2
      const pairs: [number, number][] = []
      for (let j = -1; j < rows; j++) {
        const l = grid.get(`${comp}:${i},${j}`)
        const r = grid.get(`${comp}:${i + 1},${j}`)
        if (!l || !r) continue
        const a = Math.max(l.y, r.y)
        const b = Math.min(l.y + l.h, r.y + r.h)
        if (b - a > EPS) {
          pairs.push([a, b])
          ribMm += b - a
        }
      }
      for (const run of runsAlong(() => x, pairs)) ribRuns.push({ a: { x, y: run.a }, b: { x, y: run.b } })
    }
    // horizontal ribs (between rows j and j+1)
    for (let j = -1; j < rows; j++) {
      const y = oy + j * pitch + s.podMm + s.ribMm / 2
      const pairs: [number, number][] = []
      for (let i = -1; i < cols; i++) {
        const t = grid.get(`${comp}:${i},${j}`)
        const b0 = grid.get(`${comp}:${i},${j + 1}`)
        if (!t || !b0) continue
        const a = Math.max(t.x, b0.x)
        const b = Math.min(t.x + t.w, b0.x + b0.w)
        if (b - a > EPS) {
          pairs.push([a, b])
          ribMm += b - a
        }
      }
      for (const run of runsAlong(() => y, pairs)) ribRuns.push({ a: { x: run.a, y }, b: { x: run.b, y } })
    }
  }

  // the outline: its length, corners (outside or in), free joints
  let perimeter = 0
  let outsideCorners = 0
  let insideCorners = 0
  const ccw = poly.reduce((t, p, i) => t + p.x * poly[(i + 1) % n].y - poly[(i + 1) % n].x * p.y, 0) > 0
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    const c = poly[(i + 2) % n]
    perimeter += Math.hypot(b.x - a.x, b.y - a.y)
    const turn = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(turn) < EPS) continue
    // (y down: a clockwise-on-screen outline turns right at its outside corners)
    if (turn > 0 === ccw) outsideCorners++
    else insideCorners++
  }
  const jointMm = (input.joints ?? []).reduce((t, i) => {
    const a = poly[i % n]
    const b = poly[(i + 1) % n]
    return t + (a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0)
  }, 0)
  const dowels = (input.joints ?? []).reduce((t, i) => {
    const a = poly[i % n]
    const b = poly[(i + 1) % n]
    return t + (a && b ? Math.max(0, Math.floor((Math.hypot(b.x - a.x, b.y - a.y) - 2 * e) / 600) + 1) : 0)
  }, 0)

  const area = polyArea(poly)
  const depth = s.podHeightMm + s.toppingMm
  const podVol = pods.reduce((t, p) => t + p.area, 0) * s.podHeightMm
  const concreteM3 = (area * depth - podVol) / 1e9
  const concreteToOrderM3 = Math.ceil(concreteM3 * (1 + s.wastePct / 100) * 5) / 5

  // internal beams: their length inside the edge beams
  const internalBeamMm = (input.beams ?? []).reduce((t, { a, b }) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const onEdge = (p: Pt) => poly.some((q, i) => {
      const r = poly[(i + 1) % n]
      const L = Math.hypot(r.x - q.x, r.y - q.y) || 1
      return Math.abs((r.x - q.x) * (p.y - q.y) - (r.y - q.y) * (p.x - q.x)) / L < 5 && Math.min(q.x, r.x) - 5 <= p.x && p.x <= Math.max(q.x, r.x) + 5 && Math.min(q.y, r.y) - 5 <= p.y && p.y <= Math.max(q.y, r.y) + 5
    })
    return t + Math.max(0, len - (onEdge(a) ? e : 0) - (onEdge(b) ? e : 0))
  }, 0)

  // the bars
  const edgeLine = perimeter - 4 * (e / 2) // (round the beam's middle, near enough)
  const bars: BarLine[] = [
    { what: `Edge beams: ${s.edgeBarsTop} top, ${s.edgeBarsBottom} bottom`, lengthMm: edgeLine, count: s.edgeBarsTop + s.edgeBarsBottom },
    ...(internalBeamMm > 0 ? [{ what: `Internal beams: ${s.internalBars} bottom`, lengthMm: internalBeamMm, count: s.internalBars }] : []),
  ]
  let barsToBuy = 0
  let barMetres = 0
  for (const b of bars) {
    barsToBuy += b.count * stockFor(b.lengthMm, s.barStockMm, s.barLapMm)
    barMetres += (b.count * b.lengthMm) / 1000
  }
  // each rib's bar, run by run (anchored into the beams at both ends)
  let ribBarMm = 0
  let ribStock = 0
  for (const r of ribRuns) {
    const len = Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y) + 2 * s.ribAnchorMm
    ribBarMm += len * s.ribBars
    ribStock += s.ribBars * stockFor(len, s.barStockMm, s.barLapMm)
  }
  if (ribRuns.length) bars.push({ what: `Ribs: ${s.ribBars} bottom, into the beams ${s.ribAnchorMm} each end`, lengthMm: ribBarMm / Math.max(1, s.ribBars), count: s.ribBars })
  barsToBuy += ribStock
  barMetres += ribBarMm / 1000
  const cornerBars = outsideCorners * (s.edgeBarsTop + s.edgeBarsBottom) + insideCorners * s.edgeBarsBottom
  const reentrantBars = insideCorners * s.reentrantBars
  // (corner and diagonal bars cut from stock: as many as come out of a bar)
  const perStock = (len: number) => Math.max(1, Math.floor(s.barStockMm / len))
  barsToBuy += Math.ceil(cornerBars / perStock(s.cornerBarLegMm * 2)) + Math.ceil(reentrantBars / perStock(s.reentrantBarMm))
  barMetres += (cornerBars * s.cornerBarLegMm * 2 + reentrantBars * s.reentrantBarMm) / 1000

  const sheet = (s.meshSheetW - s.meshLapMm) * (s.meshSheetH - s.meshLapMm)
  const meshSheets = Math.ceil((area / sheet) * (1 + s.wastePct / 100))

  if (pods.some((p) => p.odd)) notes.push("Some pods are cut round a corner — set those out on site.")
  if (insideCorners) notes.push(`${insideCorners} inside corner${insideCorners === 1 ? "" : "s"}: ${s.reentrantBars} × ${s.barName} ${s.reentrantBarMm} long across each, as the usual note.`)
  if (jointMm) notes.push("A free joint to the next slab: each side its own edge beam, with R16 × 500 dowels @ 600 across (debonded one side).")

  return {
    areaM2: area / 1e6,
    perimeterMm: perimeter,
    depthMm: depth,
    pods,
    fullPods,
    cutPods: cut.length,
    podsToBuy,
    ribMm,
    ribRuns,
    internalBeamMm,
    bands,
    concreteM3,
    concreteToOrderM3,
    meshSheets,
    bars,
    barsToBuy,
    barMetres,
    outsideCorners,
    insideCorners,
    cornerBars,
    reentrantBars,
    jointMm,
    dowels,
    dpmM2: Math.ceil(((area + perimeter * (depth + 300)) / 1e6) * 1.1),
    hardfillM3: Math.ceil(((area * s.hardfillMm) / 1e9) * 10) / 10,
    sandM3: Math.ceil(((area * s.sandMm) / 1e9) * 10) / 10,
    boxingM: Math.ceil(perimeter / 1000),
    spacers: pods.length * 4,
    chairs: Math.ceil(barMetres + area / 1e6),
    notes,
  }
}
