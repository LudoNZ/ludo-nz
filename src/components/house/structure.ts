/** What holds the roof up: which walls are load-bearing, and where a span
 * runs past what the framing can do.
 *
 * Each wing of the roof (roof.ts) spans square to its ridge. Lines are run
 * across every wing, 300 mm apart; on each, the supports are the walls
 * running along the ridge that it crosses — outside walls, and inside ones
 * not set "not load-bearing" — and the house's inside stretches between them.
 *
 *  - Trusses span outside wall to outside wall: those walls are load-
 *    bearing (and with a hip, the hip ends too), and a span past the
 *    standard truss span is flagged. Inside walls aren't needed.
 *  - Rafters and ceiling joists: the ceiling joists span between walls,
 *    so inside walls are picked, furthest first, to keep every span within
 *    the joists' limit — those are load-bearing, and a stretch with no wall
 *    near enough is flagged, naming the room. Rafters too long on the slope
 *    need underpurlins, propped off a wall near the middle.
 *
 * A guide for laying out the plan, not a design: spans and loads are for
 * the span tables (NZS 3604) or an engineer to confirm. mm, y down. */

import { FloorGraph, inside } from "./floorPlan"
import { HouseSettings, Pt } from "./houseTypes"
import type { Roof } from "../weatherboards/roof"

export interface Verdict {
  loadBearing: boolean
  reason: string
}

export interface Structure {
  /** per side of the outline (side i runs from point i to i + 1) */
  outside: Verdict[]
  /** per inside wall, by id */
  inside: Map<string, Verdict>
  /** a line across each wing, the way the framing spans, for the plan —
   * and the roof wing's key, to turn it by (see HouseSettings.turnedSpans) */
  spans: { a: Pt; b: Pt; key?: string; type?: "gable" | "hip" | "skillion"; wing?: Pt[] }[]
  warnings: string[]
  notes: string[]
}

const m = (mm: number) => `${(mm / 1000).toFixed(1)} m`

export function analyseStructure(graph: FloorGraph, settings: HouseSettings, roof: Roof | null, keyOf: (wing: number) => string = (w) => `m:${w}`): Structure {
  const outline = graph.outline
  const n = outline.length
  const outside: Verdict[] = outline.map(() => ({ loadBearing: false, reason: "" }))
  const insideV = new Map<string, Verdict>()
  const warnings: string[] = []
  const notes: string[] = []
  const spans: Structure["spans"] = []
  const hand = (lb: string): Verdict | null =>
    lb === "yes" ? { loadBearing: true, reason: "Set as load-bearing by hand." } : lb === "no" ? { loadBearing: false, reason: "Set as not load-bearing by hand." } : null
  for (const w of graph.walls) insideV.set(w.id, hand(w.loadBearing) ?? { loadBearing: false, reason: "Not needed to hold up the roof or ceiling." })

  if (!roof || n < 3) {
    if (n >= 3) notes.push("With no roof, there's nothing on the walls to work out.")
    return { outside, inside: insideV, spans, warnings, notes }
  }

  const trusses = settings.roofFrame === "trusses"
  const roomAt = (p: Pt) => graph.rooms.find((r) => r.cells.some((c) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h))
  const seen = new Set<string>()
  const warnOnce = (_key: string, text: string) => {
    if (seen.has(text)) return
    seen.add(text)
    warnings.push(text)
  }
  let girders = false
  const pitch = (roof.pitchDeg * Math.PI) / 180

  // the wings on screen (y down)
  const onScreen = roof.wings.map((w) => ({ corners: w.corners.map((p) => ({ x: p.x, y: -p.y })), ridge: { x: w.ridge.x, y: -w.ridge.y } }))
  const inRect = (c: Pt[], p: Pt) => {
    const xs = c.map((q) => q.x)
    const ys = c.map((q) => q.y)
    return p.x >= Math.min(...xs) - 1 && p.x <= Math.max(...xs) + 1 && p.y >= Math.min(...ys) - 1 && p.y <= Math.max(...ys) + 1
  }

  roof.wings.forEach((_wing, wi) => {
    const corners = onScreen[wi].corners
    const r = onScreen[wi].ridge
    const s = { x: -r.y, y: r.x }
    const dot = (p: Pt, d: Pt) => p.x * d.x + p.y * d.y
    const rs = corners.map((p) => dot(p, r))
    const ss = corners.map((p) => dot(p, s))
    const [r0, r1] = [Math.min(...rs), Math.max(...rs)]
    const [s0, s1] = [Math.min(...ss), Math.max(...ss)]
    const width = s1 - s0
    const at = (t: number, sig: number): Pt => ({ x: r.x * t + s.x * sig, y: r.y * t + s.y * sig })
    /** a line across the framing carries on through the wings beside it
     * whose ridge runs the same way (one truss spans them both); it stops
     * where it meets a wing running across it — a valley or girder */
    const reach = (t: number): [number, number] => {
      const parallel = onScreen.filter((w) => Math.abs(w.ridge.x * r.x + w.ridge.y * r.y) > 0.99)
      let lo = s0
      let hi = s1
      for (let guard = 0; guard < 20; guard++) {
        const before = [lo, hi]
        for (const w of parallel) {
          if (inRect(w.corners, at(t, hi + 10))) hi = Math.max(hi, ...w.corners.map((p) => dot(p, s)))
          if (inRect(w.corners, at(t, lo - 10))) lo = Math.min(lo, ...w.corners.map((p) => dot(p, s)))
        }
        if (before[0] === lo && before[1] === hi) break
      }
      return [lo, hi]
    }
    {
      const mid = (r0 + r1) / 2
      const [lo, hi] = reach(mid)
      spans.push({ a: at(mid, lo), b: at(mid, hi), key: keyOf(wi), type: roof.wings[wi].type, wing: corners })
    }

    const lines: number[] = []
    for (let t = r0 + 150; t < r1 - 149; t += 300) lines.push(t)
    if (!lines.length) lines.push((r0 + r1) / 2)
    let longest = 0

    // rafters too long on the slope want underpurlins, propped off walls near the middle
    const rafterRun = roof.wings[wi].type === "skillion" ? width : width / 2
    const rafterSlope = rafterRun / Math.cos(pitch)
    const needsProps = !trusses && rafterSlope > settings.rafterSpanMm
    let propped = false

    for (const t of lines) {
      type Support = { sig: number; side?: number; wall?: string; junction?: boolean }
      const sup: Support[] = []
      const along = (a: Pt, b: Pt) => Math.abs(dot({ x: b.x - a.x, y: b.y - a.y }, s)) < 1
      const covers = (a: Pt, b: Pt) => Math.min(dot(a, r), dot(b, r)) <= t + 1 && Math.max(dot(a, r), dot(b, r)) >= t - 1
      outline.forEach((a, i) => {
        const b = outline[(i + 1) % n]
        if (along(a, b) && covers(a, b)) sup.push({ sig: dot(a, s), side: i })
      })
      for (const w of graph.walls) if (w.loadBearing !== "no" && along(w.a, w.b) && covers(w.a, w.b)) sup.push({ sig: dot(w.a, s), wall: w.id })
      // where this wing meets another, the other's roof carries it (a girder or valley)
      const [lo, hi] = reach(t)
      for (const sig of [lo, hi]) if (!sup.some((x) => Math.abs(x.sig - sig) < 5)) sup.push({ sig, junction: true })
      const list = sup.filter((x) => x.sig >= lo - 5 && x.sig <= hi + 5).sort((a, b) => a.sig - b.sig)
      // the stretches inside the house, between supports
      let run: Support[] = []
      const finish = () => {
        if (run.length >= 2) analyseRun(run, t)
        run = []
      }
      for (let k = 0; k + 1 < list.length; k++) {
        const mid = at(t, (list[k].sig + list[k + 1].sig) / 2)
        if (list[k + 1].sig - list[k].sig < 5) continue
        if (inside(outline, mid)) {
          if (!run.length) run.push(list[k])
          run.push(list[k + 1])
        } else finish()
      }
      finish()

      function analyseRun(run: Support[], t: number) {
        const A = run[0]
        const B = run[run.length - 1]
        const ends = [A, B]
        for (const e of ends) {
          if (e.side !== undefined) outside[e.side] = { loadBearing: true, reason: trusses ? "The trusses sit on it." : "The rafters and ceiling joists sit on it." }
          if (e.junction) girders = true
        }
        if (trusses) {
          longest = Math.max(longest, B.sig - A.sig)
          return
        }
        // ceiling joists: reach as far as they can each time
        let cur = A
        let k = 0
        while (B.sig - cur.sig > settings.ceilingJoistSpanMm + 1) {
          let pick = -1
          for (let j = k + 1; j < run.length - 1; j++) if (run[j].sig - cur.sig <= settings.ceilingJoistSpanMm + 1) pick = j
          if (pick < 0) {
            // nothing near enough: the next support along, and the gap's flagged
            const nextIdx = k + 1
            const gap = run[nextIdx].sig - cur.sig
            const room = roomAt(at(t, (cur.sig + run[nextIdx].sig) / 2))
            warnOnce(
              `cj:${wi}:${Math.round(cur.sig / 100)}:${Math.round(run[nextIdx].sig / 100)}`,
              `Ceiling joists across ${room ? room.name : "the house"} would span ${m(gap)} — more than the ${m(settings.ceilingJoistSpanMm)} set. Add a load-bearing wall (or a beam) part way across.`,
            )
            k = nextIdx
            cur = run[k]
            // (the joists still land on it, past the gap)
            const landed = cur.wall ? insideV.get(cur.wall) : undefined
            if (cur.wall && landed && !landed.loadBearing) insideV.set(cur.wall, { loadBearing: true, reason: "Carries the ceiling joists." })
            continue
          }
          const w = run[pick].wall
          if (w) {
            const v = insideV.get(w)
            if (v && !v.loadBearing) insideV.set(w, { loadBearing: true, reason: `Carries the ceiling joists (keeps them within ${m(settings.ceilingJoistSpanMm)}).` })
          }
          k = pick
          cur = run[pick]
        }
        if (needsProps) {
          const middle = (s0 + s1) / 2
          for (const x of run)
            if (x.wall && Math.abs(x.sig - middle) <= width / 4) {
              propped = true
              const v = insideV.get(x.wall)
              if (v && !v.loadBearing) insideV.set(x.wall, { loadBearing: true, reason: "Props the underpurlins under the rafters." })
              else if (v && !v.reason.includes("underpurlins")) insideV.set(x.wall, { loadBearing: true, reason: `${v.reason} Props the underpurlins too.` })
            }
        }
      }
    }
    if (trusses && longest > settings.maxTrussSpanMm)
      warnings.push(`The trusses here span ${m(longest)} — past the ${m(settings.maxTrussSpanMm)} set for a standard truss. Check with the truss maker, or add a load-bearing wall for girder trusses.`)
    if (needsProps && !propped)
      warnings.push(`The rafters run ${m(rafterSlope)} on the slope — past the ${m(settings.rafterSpanMm)} set — and want underpurlins, but there's no wall near the middle of the house (under the ridge) to prop them off. Add a load-bearing wall there, or use trusses.`)
  })

  // what's left of the outside walls
  outline.forEach((a, i) => {
    if (outside[i].loadBearing) return
    // (the kind of roof over it: the section it's under, just inside it)
    const b = outline[(i + 1) % n]
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const nudge = [1, -1].map((k) => ({ x: mid.x - ((b.y - a.y) / L) * 50 * k, y: mid.y + ((b.x - a.x) / L) * 50 * k }))
    const wing = onScreen.findIndex((w) => nudge.some((p) => inRect(w.corners, p) && inside(outline, p)))
    const type = wing >= 0 ? roof.wings[wing].type : roof.type
    if (type === "hip") outside[i] = { loadBearing: true, reason: "The hip end's framing sits on it." }
    else outside[i] = { loadBearing: false, reason: type === "gable" ? "A gable end: it carries the gable, not the roof's weight." : "The roof spans past it." }
  })
  if (girders) notes.push("Where the roof's wings meet, the framing lands on a girder truss or valley beam — check its supports with the truss maker or the span tables.")
  notes.push("A guide for laying out the plan: confirm sizes and spans with NZS 3604's tables (or your truss maker, or an engineer).")
  return { outside, inside: insideV, spans, warnings, notes }
}

// ── a first floor ───────────────────────────────────────────────────────

const onSeg = (p: Pt, a: Pt, b: Pt, tol: number) => {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len)
  if (t < -tol / len || t > 1 + tol / len) return false
  return Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len < tol
}

/** the rooms either side of a wall, to name it by */
const describeWall = (graph: FloorGraph, a: Pt, b: Pt) => {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }
  const at = (p: Pt) => graph.rooms.find((r) => r.cells.some((c) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h))?.name
  const names = [...new Set([at({ x: mid.x + n.x * 200, y: mid.y + n.y * 200 }), at({ x: mid.x - n.x * 200, y: mid.y - n.y * 200 })].filter(Boolean))]
  return names.length === 2 ? `the wall between ${names[0]} and ${names[1]}` : names.length ? `the ${names[0]} wall` : "a wall"
}

export interface HouseStructure {
  ground: Structure
  upper: Structure | null
}

/** What holds a one- or two-storey house up. With a first floor:
 *  - upstairs is worked out like a one-storey house under the main roof;
 *  - the first floor's joists span between the ground floor's walls (the
 *    shorter way, over the first floor) — walls they need are load-bearing,
 *    and a span past the joists' limit is flagged;
 *  - a load-bearing wall upstairs needs a wall (or a beam) under it;
 *  - the ground floor's own lower roof is worked out as before. */
export function analyseHouse(
  graph: FloorGraph,
  upperGraph: FloorGraph | null,
  settings: HouseSettings,
  roof: Roof | null,
  lowerRoofs: Roof[],
): HouseStructure {
  if (!upperGraph || upperGraph.outline.length < 3) return { ground: analyseStructure(graph, settings, roof), upper: null }
  const upper = analyseStructure(upperGraph, settings, roof)
  // the ground floor under its own roofs (if any of it's uncovered)
  const lower: Roof | null = lowerRoofs.length ? { ...lowerRoofs[0], faces: lowerRoofs.flatMap((r) => r.faces), wings: lowerRoofs.flatMap((r) => r.wings) } : null
  const lowerKeys = lowerRoofs.flatMap((r, ri) => r.wings.map((_, wi) => `l:${ri}:${wi}`))
  const ground = analyseStructure(graph, settings, lower, (wi) => lowerKeys[wi])
  // (the lean-to's high side bears on the storey above, not a girder)
  ground.notes = ground.notes.filter((n) => !n.includes("girder") && !n.includes("no roof"))
  const out = graph.outline
  const n = out.length
  const up = upperGraph.outline
  const m = (mm: number) => `${(mm / 1000).toFixed(1)} m`
  const mark = (v: Verdict | undefined, reason: string): Verdict =>
    !v || !v.loadBearing ? { loadBearing: true, reason } : v.reason.includes(reason) ? v : { loadBearing: true, reason: `${v.reason} ${reason}` }
  // not under the lower roof: an outside wall carries the storey above
  out.forEach((a, i) => {
    const b = out[(i + 1) % n]
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    if (up.some((p, k) => onSeg(mid, p, up[(k + 1) % up.length], 5))) ground.outside[i] = mark(ground.outside[i], "Carries the first floor's wall above.")
  })

  // ── the first floor's joists ─────────────────────────────────────────
  type Seg = { a: Pt; b: Pt; side?: number; wall?: string }
  const segs: Seg[] = [...out.map((a, i) => ({ a, b: out[(i + 1) % n], side: i })), ...graph.walls.filter((w) => w.loadBearing !== "no").map((w) => ({ a: w.a, b: w.b, wall: w.id }))]
  const roomAt = (p: Pt) => graph.rooms.find((r) => r.cells.some((c) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h))
  /** the joists running along `axis`: per line across the first floor, the
   * runs of supports inside both floors */
  const runsAlong = (axis: "x" | "y") => {
    const other = axis === "x" ? "y" : "x"
    const lo = Math.min(...up.map((p) => p[other]))
    const hi = Math.max(...up.map((p) => p[other]))
    const lines: { t: number; runs: Seg[][]; sig: (s: Seg) => number }[] = []
    const sig = (s: Seg) => s.a[axis]
    for (let t = lo + 150; t < hi - 149; t += 300) {
      const at = (v: number): Pt => (axis === "x" ? { x: v, y: t } : { x: t, y: v })
      const sup = segs
        .filter((s) => Math.abs(s.a[axis] - s.b[axis]) < 1 && Math.min(s.a[other], s.b[other]) <= t + 1 && Math.max(s.a[other], s.b[other]) >= t - 1)
        .sort((p, q) => sig(p) - sig(q))
      const runs: Seg[][] = []
      let run: Seg[] = []
      for (let k = 0; k + 1 < sup.length; k++) {
        if (sig(sup[k + 1]) - sig(sup[k]) < 5) continue
        const mid = at((sig(sup[k]) + sig(sup[k + 1])) / 2)
        if (inside(out, mid) && inside(up, mid)) {
          if (!run.length) run.push(sup[k])
          run.push(sup[k + 1])
        } else if (run.length) {
          runs.push(run)
          run = []
        }
      }
      if (run.length) runs.push(run)
      lines.push({ t, runs, sig })
    }
    const worst = Math.max(0, ...lines.flatMap((l) => l.runs.flatMap((r) => r.slice(1).map((s, k) => sig(s) - sig(r[k])))))
    return { lines, worst, at: (t: number, v: number): Pt => (axis === "x" ? { x: v, y: t } : { x: t, y: v }) }
  }
  const byX = runsAlong("x")
  const byY = runsAlong("y")
  const joists = byY.worst < byX.worst ? byY : byX
  const max = settings.floorJoistSpanMm
  const seen = new Set<string>()
  let longest: { a: Pt; b: Pt; len: number } | null = null
  for (const line of joists.lines)
    for (const run of line.runs) {
      const A = run[0]
      const B = run[run.length - 1]
      for (const e of [A, B]) if (e.side !== undefined) ground.outside[e.side] = mark(ground.outside[e.side], "Carries the first floor's joists.")
      const len = line.sig(B) - line.sig(A)
      if (!longest || len > longest.len) longest = { a: joists.at(line.t, line.sig(A)), b: joists.at(line.t, line.sig(B)), len }
      let k = 0
      while (line.sig(run[run.length - 1]) - line.sig(run[k]) > max + 1) {
        let pick = -1
        for (let j = k + 1; j < run.length - 1; j++) if (line.sig(run[j]) - line.sig(run[k]) <= max + 1) pick = j
        if (pick < 0) {
          const gap = line.sig(run[k + 1]) - line.sig(run[k])
          const room = roomAt(joists.at(line.t, (line.sig(run[k]) + line.sig(run[k + 1])) / 2))
          const text = `The first floor's joists over ${room ? room.name : "the ground floor"} would span ${m(gap)} — more than the ${m(max)} set. Add a load-bearing wall or a beam under them.`
          if (!seen.has(text)) {
            seen.add(text)
            ground.warnings.push(text)
          }
          pick = k + 1
        }
        const w = run[pick].wall
        if (w) ground.inside.set(w, mark(ground.inside.get(w), "Carries the first floor's joists."))
        k = pick
      }
    }
  if (longest) ground.spans.push({ a: longest.a, b: longest.b })

  // ── load-bearing walls upstairs need something under them ───────────
  const below = [...out.map((a, i) => ({ a, b: out[(i + 1) % n], side: i as number | undefined, wall: undefined as string | undefined })), ...graph.walls.map((w) => ({ a: w.a, b: w.b, side: undefined, wall: w.id }))]
  const check = (a: Pt, b: Pt, what: string) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    let bare = 0
    const steps = Math.max(2, Math.round(len / 300))
    for (let k = 0; k <= steps; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps }
      // (only walls running the same way: one crossing under it isn't holding it up)
      const under = below.filter((s) => Math.abs((s.b.x - s.a.x) * (b.y - a.y) - (s.b.y - s.a.y) * (b.x - a.x)) < 1e-3 * len * Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) && onSeg(p, s.a, s.b, 60))
      if (!under.length) bare++
      for (const s of under) {
        if (s.wall) ground.inside.set(s.wall, mark(ground.inside.get(s.wall), "Carries the load-bearing wall above."))
        if (s.side !== undefined) ground.outside[s.side] = mark(ground.outside[s.side], "Carries the load-bearing wall above.")
      }
    }
    if (bare / (steps + 1) > 0.15)
      ground.warnings.push(`Upstairs, ${what} is load-bearing, but ${m((len * bare) / (steps + 1))} of it has no wall under it on the ground floor — add a wall or a beam below.`)
  }
  for (const w of upperGraph.walls) if (upper.inside.get(w.id)?.loadBearing) check(w.a, w.b, describeWall(upperGraph, w.a, w.b))
  up.forEach((a, i) => {
    const b = up[(i + 1) % up.length]
    if (upper.outside[i]?.loadBearing) check(a, b, `the outside wall of ${describeWall(upperGraph, a, b).replace(/^the | wall$/g, "")}`)
  })
  ground.outside = ground.outside.map((v) => (v.loadBearing || v.reason ? v : { loadBearing: false, reason: "Doesn't carry the roof or the floor above." }))
  return { ground, upper }
}
