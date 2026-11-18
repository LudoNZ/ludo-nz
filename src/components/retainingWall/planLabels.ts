import { PlanPoint, RetainedSide, sideNormal } from "./wallPlan"

/** the plan drawing's viewBox, in plan metres */
export interface LabelViewBox {
  x: number
  y: number
  w: number
  h: number
}

/** Where each run's label goes, so labels don't clash with each other or
 * sit across a wall. Each label tries spots along its own run — the
 * middle first, then nearer either end, then further out — on the low
 * (open) side, then on the retained side beyond the soil band, and takes
 * the first that's clear; if none is, the one with the least overlap.
 * Labels are placed longest run first, since a long run has the most room
 * to give way to its neighbours' labels — shorter runs fit around it. */
export function placeLabels(
  points: PlanPoint[],
  texts: string[],
  lowSide: RetainedSide,
  retainedSide: RetainedSide,
  fontSize: number,
  view: LabelViewBox,
): PlanPoint[] {
  type Box = { x0: number; y0: number; x1: number; y1: number }
  const boxAt = (c: PlanPoint, text: string): Box => {
    // rough monospace metrics for the site font, with a little breathing room
    const w = text.length * fontSize * 0.62 + fontSize * 0.6
    const h = fontSize * 1.5
    return { x0: c.xM - w / 2, y0: c.yM - h / 2, x1: c.xM + w / 2, y1: c.yM + h / 2 }
  }
  const overlapArea = (a: Box, b: Box) =>
    Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
  /** a segment crosses (or lies in) a box: clip it with Liang–Barsky */
  const segmentHits = (a: PlanPoint, b: PlanPoint, box: Box) => {
    let t0 = 0
    let t1 = 1
    const dx = b.xM - a.xM
    const dy = b.yM - a.yM
    const edges: [number, number][] = [
      [-dx, a.xM - box.x0],
      [dx, box.x1 - a.xM],
      [-dy, a.yM - box.y0],
      [dy, box.y1 - a.yM],
    ]
    for (const [p, q] of edges) {
      if (Math.abs(p) < 1e-12) {
        if (q < 0) return false
        continue
      }
      const r = q / p
      if (p < 0) t0 = Math.max(t0, r)
      else t1 = Math.min(t1, r)
      if (t0 > t1) return false
    }
    return true
  }
  const outside = (box: Box) =>
    Math.max(0, view.x - box.x0) + Math.max(0, box.x1 - (view.x + view.w)) + Math.max(0, view.y - box.y0) + Math.max(0, box.y1 - (view.y + view.h))

  const runs = points.slice(0, -1).map((a, i) => ({ i, a, b: points[i + 1], len: Math.hypot(points[i + 1].xM - a.xM, points[i + 1].yM - a.yM) }))
  const order = [...runs].sort((p, q) => q.len - p.len)
  const placed: Box[] = []
  const result: PlanPoint[] = runs.map(() => ({ xM: 0, yM: 0 }))
  for (const { i, a, b } of order) {
    const candidates: PlanPoint[] = []
    for (const [side, offsets] of [
      [lowSide, [2.2, 3.4]],
      [retainedSide, [3.4, 4.6]],
    ] as [RetainedSide, number[]][]) {
      const n = sideNormal(a, b, side)
      for (const off of offsets)
        for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
          candidates.push({ xM: a.xM + (b.xM - a.xM) * t + n.xM * fontSize * off, yM: a.yM + (b.yM - a.yM) * t + n.yM * fontSize * off })
        }
    }
    let best = candidates[0]
    let bestCost = Infinity
    for (const c of candidates) {
      const box = boxAt(c, texts[i])
      let cost = placed.reduce((sum, p) => sum + overlapArea(box, p), 0)
      cost += runs.filter((r) => segmentHits(r.a, r.b, box)).length * fontSize * fontSize * 4
      cost += outside(box) * fontSize
      if (cost < bestCost - 1e-12) {
        best = c
        bestCost = cost
      }
      if (cost === 0) break
    }
    result[i] = best
    placed.push(boxAt(best, texts[i]))
  }
  return result
}
