/** The site round the houses: decks, paving, the driveway, chip, planting,
 * trees and fences — each an item on plan (mm, y down, as the terrace
 * sets its houses out), drawn from the lawn up. Pure. */

import { makeSolid, Solid } from "../stairs/stairRender3d"
import type { V3 } from "../render3d/perspective"
import type { Piece } from "../weatherboards/houseRender3d"

export type LandscapeKind = "deck" | "pavers" | "concrete" | "chip" | "planting" | "tree" | "fence" | "picket"

export const LANDSCAPE_LABELS: Record<LandscapeKind, string> = {
  deck: "Deck",
  pavers: "Pavers",
  concrete: "Concrete (driveway, paths)",
  chip: "Chip",
  planting: "Planting",
  tree: "Tree",
  fence: "Fence, paling",
  picket: "Fence, picket",
}

/** An area (x, y its top-left corner, w × h), a tree (x, y its middle, w its
 * spread), or a fence (from x, y, running w across and h down: one's 0) */
export interface LandscapeItem {
  id: string
  kind: LandscapeKind
  x: number
  y: number
  w: number
  h: number
  /** a deck's top, a tree's or fence's height (mm, above the lawn) */
  height?: number
  /** a deck's boards run across (x) or down (y) */
  along?: "x" | "y"
}

export const LANDSCAPE_DEFAULT_HEIGHT: Partial<Record<LandscapeKind, number>> = { deck: 400, tree: 4500, fence: 1800, picket: 1000 }

const C = {
  deckBoard: "#9a6a43",
  deckFrame: "#5d4330",
  pavers: "#c3bcae",
  concrete: "#aeaaa2",
  chip: "#d3c8b2",
  mulch: "#5d4636",
  shrub: "#557f3e",
  shrub2: "#6c9449",
  trunk: "#6a4f36",
  canopy: "#4d7a39",
  canopy2: "#5f8f45",
  paling: "#d8d2c4",
  picket: "#f3f1ea",
  post: "#bcb5a5",
}

/** a box on plan (y down) from z0 to z1 */
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string): Solid => {
  const [a, b] = [Math.min(x0, x1), Math.max(x0, x1)]
  const [c, d] = [-Math.max(y0, y1), -Math.min(y0, y1)]
  const p = (x: number, y: number, z: number): V3 => [x, y, z]
  return makeSolid([
    { pts: [p(a, c, z1), p(b, c, z1), p(b, d, z1), p(a, d, z1)], color },
    { pts: [p(a, c, z0), p(a, d, z0), p(b, d, z0), p(b, c, z0)], color },
    { pts: [p(a, c, z0), p(b, c, z0), p(b, c, z1), p(a, c, z1)], color },
    { pts: [p(b, c, z0), p(b, d, z0), p(b, d, z1), p(b, c, z1)], color },
    { pts: [p(b, d, z0), p(a, d, z0), p(a, d, z1), p(b, d, z1)], color },
    { pts: [p(a, d, z0), p(a, c, z0), p(a, c, z1), p(a, d, z1)], color },
  ])
}

/** an eight-sided frustum round (x, y down) from z0 (radius r0) to z1 (radius r1) */
const frustum = (x: number, y: number, z0: number, z1: number, r0: number, r1: number, color: string, turn = 0): Solid => {
  const ring = (z: number, r: number) => Array.from({ length: 8 }, (_, k): V3 => [x + r * Math.cos(turn + (k * Math.PI) / 4), -y + r * Math.sin(turn + (k * Math.PI) / 4), z])
  const lo = ring(z0, r0)
  const hi = ring(z1, r1)
  return makeSolid([{ pts: hi, color }, { pts: [...lo].reverse(), color }, ...lo.map((_, k) => ({ pts: [lo[k], lo[(k + 1) % 8], hi[(k + 1) % 8], hi[k]], color }))])
}

/** a little hash, for the same shrubs every time */
const rnd = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return v - Math.floor(v)
}

/** An item's solids, from the lawn (z 0) up: each a piece — decks under "deck", the rest "landscape". */
export function landscapePieces(items: LandscapeItem[]): Piece[] {
  const out: Piece[] = []
  const put = (solid: Solid, member: "deck" | "landscape", lines?: [V3, V3][], lineColor?: string) => out.push({ solid, member, ...(lines ? { lines, lineColor } : {}) })
  for (const it of items) {
    const x0 = Math.min(it.x, it.x + it.w)
    const x1 = Math.max(it.x, it.x + it.w)
    const y0 = Math.min(it.y, it.y + it.h)
    const y1 = Math.max(it.y, it.y + it.h)
    const H = it.height ?? LANDSCAPE_DEFAULT_HEIGHT[it.kind] ?? 0
    if (it.kind === "deck") {
      const top = Math.max(150, H)
      // its framing, under the boards, then the boards (140, 5 apart) the way they run
      put(box(x0 + 60, x1 - 60, y0 + 60, y1 - 60, 0, top - 25, C.deckFrame), "deck")
      const along = it.along ?? (x1 - x0 >= y1 - y0 ? "x" : "y")
      const span = along === "x" ? y1 - y0 : x1 - x0
      for (let o = 0; o + 60 < span; o += 145) {
        const w = Math.min(140, span - o)
        put(along === "x" ? box(x0, x1, y0 + o, y0 + o + w, top - 25, top, C.deckBoard) : box(x0 + o, x0 + o + w, y0, y1, top - 25, top, C.deckBoard), "deck")
      }
      continue
    }
    if (it.kind === "pavers" || it.kind === "concrete" || it.kind === "chip") {
      const t = it.kind === "chip" ? 30 : 50
      const step = it.kind === "pavers" ? 600 : it.kind === "concrete" ? 3000 : 0
      const lines: [V3, V3][] = []
      if (step) {
        for (let x = x0 + step; x < x1 - 10; x += step) lines.push([[x, -y0, t + 1], [x, -y1, t + 1]])
        for (let y = y0 + step; y < y1 - 10; y += step) lines.push([[x0, -y, t + 1], [x1, -y, t + 1]])
      }
      put(box(x0, x1, y0, y1, 0, t, C[it.kind]), "landscape", lines, "rgba(60,55,50,0.35)")
      continue
    }
    if (it.kind === "planting") {
      put(box(x0, x1, y0, y1, 0, 80, C.mulch), "landscape")
      // shrubs, scattered a metre or so apart
      let k = 0
      for (let x = x0 + 450; x < x1 - 200; x += 900)
        for (let y = y0 + 450; y < y1 - 200; y += 900) {
          k++
          const r = 280 + rnd(k + x) * 180
          const jx = (rnd(k * 3 + y) - 0.5) * 300
          const jy = (rnd(k * 7 + x) - 0.5) * 300
          put(frustum(x + jx, y + jy, 80, 380 + r, r, r * 0.45, k % 2 ? C.shrub : C.shrub2, k), "landscape")
        }
      continue
    }
    if (it.kind === "tree") {
      const r = Math.max(400, it.w / 2)
      put(box(it.x - 90, it.x + 90, it.y - 90, it.y + 90, 0, H * 0.45, C.trunk), "landscape")
      put(frustum(it.x, it.y, H * 0.35, H * 0.7, r * 0.75, r, C.canopy), "landscape")
      put(frustum(it.x, it.y, H * 0.7, H, r, r * 0.35, C.canopy2, 0.4), "landscape")
      continue
    }
    if (it.kind === "fence" || it.kind === "picket") {
      const L = Math.hypot(it.w, it.h)
      if (L < 100) continue
      const level = Math.abs(it.h) < Math.abs(it.w)
      const color = it.kind === "picket" ? C.picket : C.paling
      // the palings as one face, with their gaps drawn; posts every 2.4 m
      const lines: [V3, V3][] = []
      const gap = it.kind === "picket" ? 120 : 150
      for (let d = gap; d < L - 20; d += gap) {
        const px = it.x + (it.w * d) / L
        const py = it.y + (it.h * d) / L
        const off = level ? [0, 15] : [15, 0]
        lines.push([[px + off[0], -(py + off[1]), 60], [px + off[0], -(py + off[1]), H - 30]])
      }
      put(level ? box(x0, x1, it.y - 12, it.y + 12, 60, H, color) : box(it.x - 12, it.x + 12, y0, y1, 60, H, color), "landscape", lines, "rgba(80,70,55,0.35)")
      for (let d = 0; d <= L + 1; d += Math.min(2400, L)) {
        const px = it.x + (it.w * d) / L
        const py = it.y + (it.h * d) / L
        put(box(px - 50, px + 50, py - 50, py + 50, 0, H + 60, C.post), "landscape")
      }
    }
  }
  return out
}
