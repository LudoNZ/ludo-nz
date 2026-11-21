/** A little concrete truck for the showcase's pour: chassis, wheels, cab
 * with its windscreen, the drum (turning, striped so you can see it turn),
 * the hopper, and a chute swung out from the back to where it's pouring —
 * with the concrete running down it while it pours. World mm, x east, y
 * north, z up; it faces east, its back (the chute end) at `rearX`. Pure. */

import { makeSolid, Solid } from "../stairs/stairRender3d"
import type { V3 } from "../render3d/perspective"
import type { Piece } from "../weatherboards/houseRender3d"

const C = { chassis: "#3d4247", wheel: "#1e2124", cab: "#eeece6", glass: "#2f4254", drum: "#e8762b", stripe: "#f6f2e8", chute: "#9aa0a6", concrete: "#a8a49b" }

const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string): Solid => {
  const p = (x: number, y: number, z: number): V3 => [x, y, z]
  return makeSolid([
    { pts: [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)], color },
    { pts: [p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0), p(x1, y0, z0)], color },
    { pts: [p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1)], color },
    { pts: [p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1)], color },
    { pts: [p(x1, y1, z0), p(x0, y1, z0), p(x0, y1, z1), p(x1, y1, z1)], color },
    { pts: [p(x0, y1, z0), p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1)], color },
  ])
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
const norm = (a: V3): V3 => {
  const l = Math.hypot(...a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** the drum: an eight-sided barrel from a to b, turned by `turn` (rad), its sides striped */
function drum(a: V3, b: V3, r: number, turn: number): Solid {
  const ax = norm(sub(b, a))
  const u = norm(cross(ax, [0, 0, 1]))
  const v = cross(u, ax)
  const ring = (c: V3, rr: number) => Array.from({ length: 8 }, (_, k) => {
    const f = turn + (k * Math.PI) / 4
    return add(add(c, u, rr * Math.cos(f)), v, rr * Math.sin(f))
  })
  const ra = ring(a, r * 0.72)
  const rb = ring(b, r)
  return makeSolid([
    ...ra.map((p, k) => ({ pts: [p, ra[(k + 1) % 8], rb[(k + 1) % 8], rb[k]], color: k % 2 ? C.stripe : C.drum })),
    { pts: [...ra].reverse(), color: C.drum },
    { pts: rb, color: C.drum },
  ])
}

/** a flat chute from a (its top) to b (its lip), `w` wide */
function chute(a: V3, b: V3, w: number): Solid {
  const d = norm(sub(b, a))
  const side = norm(cross(d, [0, 0, 1]))
  const s = (p: V3, k: number): V3 => add(p, side, (k * w) / 2)
  const down = (p: V3): V3 => [p[0], p[1], p[2] - 120]
  const top = [s(a, -1), s(a, 1), s(b, 1), s(b, -1)]
  return makeSolid([
    { pts: top, color: C.chute },
    { pts: top.map(down).reverse(), color: C.chute },
    { pts: [top[0], top[1], down(top[1]), down(top[0])], color: C.chute },
    { pts: [top[1], top[2], down(top[2]), down(top[1])], color: C.chute },
    { pts: [top[2], top[3], down(top[3]), down(top[2])], color: C.chute },
    { pts: [top[3], top[0], down(top[0]), down(top[3])], color: C.chute },
  ])
}

/** The truck, its back at (rearX, y) on the ground at `groundZ`; the chute's lip at `to` (null: stowed); concrete running from it down to `pourZ` while it pours (null: not). */
export function concreteTruck(rearX: number, y: number, groundZ: number, turn: number, to: V3 | null, pourZ: number | null): Piece[] {
  const z = (h: number) => groundZ + h
  const out: Piece[] = []
  const put = (solid: Solid) => out.push({ solid, member: "trims" })
  put(box(rearX, rearX + 8000, y - 1150, y + 1150, z(650), z(1050), C.chassis))
  for (const wx of [900, 2300, 6900])
    for (const s of [-1, 1]) put(box(rearX + wx - 500, rearX + wx + 500, y + s * 1100 - 180, y + s * 1100 + 180, z(0), z(1000), C.wheel))
  put(box(rearX + 6200, rearX + 8100, y - 1200, y + 1200, z(1050), z(3200), C.cab))
  put(box(rearX + 8100, rearX + 8160, y - 1000, y + 1000, z(2150), z(3000), C.glass))
  put(drum([rearX + 700, y, z(3000)], [rearX + 5800, y, z(2250)], 1150, turn))
  put(box(rearX - 250, rearX + 450, y - 450, y + 450, z(2700), z(3300), C.drum))
  const top: V3 = [rearX - 150, y, z(2600)]
  const lip: V3 = to ?? [rearX - 1200, y, z(2000)]
  put(chute(top, lip, 450))
  if (pourZ !== null && to) put(box(lip[0] - 160, lip[0] + 160, lip[1] - 160, lip[1] + 160, pourZ, lip[2] - 60, C.concrete))
  return out
}
