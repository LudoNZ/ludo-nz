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
  /** a line across each wing, the way the framing spans, for the plan */
  spans: { a: Pt; b: Pt }[]
  warnings: string[]
  notes: string[]
}

const m = (mm: number) => `${(mm / 1000).toFixed(1)} m`

export function analyseStructure(graph: FloorGraph, settings: HouseSettings, roof: Roof | null): Structure {
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
      spans.push({ a: at(mid, lo), b: at(mid, hi) })
    }

    const lines: number[] = []
    for (let t = r0 + 150; t < r1 - 149; t += 300) lines.push(t)
    if (!lines.length) lines.push((r0 + r1) / 2)
    let longest = 0

    // rafters too long on the slope want underpurlins, propped off walls near the middle
    const rafterRun = roof.type === "skillion" ? width : width / 2
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
    if (roof.type === "hip") outside[i] = { loadBearing: true, reason: "The hip end's framing sits on it." }
    else outside[i] = { loadBearing: false, reason: roof.type === "gable" ? "A gable end: it carries the gable, not the roof's weight." : "The roof spans past it." }
  })
  if (girders) notes.push("Where the roof's wings meet, the framing lands on a girder truss or valley beam — check its supports with the truss maker or the span tables.")
  notes.push("A guide for laying out the plan: confirm sizes and spans with NZS 3604's tables (or your truss maker, or an engineer).")
  return { outside, inside: insideV, spans, warnings, notes }
}
