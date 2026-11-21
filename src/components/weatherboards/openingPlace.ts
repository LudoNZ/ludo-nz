/** Where a window or door is held on its wall: measured from the wall's
 * left or right end, or from its middle, and up to its sill or its head —
 * each measurement locked (held as the wall or the unit changes) or not.
 * mm, x along the wall from its left end, z up from datum. Pure. */

import type { Opening, OpeningPlace } from "./types"

/** to start with: from the left, by its head, both held */
export const DEFAULT_PLACE: Omit<OpeningPlace, "xMm" | "zMm"> = { x: "left", z: "head", lockX: true, lockZ: true }

const top = (o: Opening) => Math.max(o.height, o.heightRight ?? o.height)
export const headOf = (o: Opening) => o.sill + top(o)

/** its place along the wall, measured the way `x` says: its left edge from the left end, its right edge from the right end, or its middle off the wall's middle */
export const measureX = (o: Opening, length: number, x: OpeningPlace["x"]) => (x === "left" ? o.x : x === "right" ? length - (o.x + o.width) : o.x + o.width / 2 - length / 2)
/** its height measured the way `z` says: its sill, or its head */
export const measureZ = (o: Opening, z: OpeningPlace["z"]) => (z === "sill" ? o.sill : headOf(o))
/** its left edge, from a measurement along the wall */
export const xFrom = (o: Opening, length: number, x: OpeningPlace["x"], mm: number) => (x === "left" ? mm : x === "right" ? length - mm - o.width : length / 2 + mm - o.width / 2)
/** its sill, from a measurement up */
export const sillFrom = (o: Opening, z: OpeningPlace["z"], mm: number) => (z === "sill" ? mm : mm - top(o))

/** measured again where it is now (it's been moved by hand), the way it's measured (or the default) */
export function remeasure(o: Opening, length: number, defaults: Omit<OpeningPlace, "xMm" | "zMm"> = DEFAULT_PLACE): Opening {
  const p = o.place ?? { ...defaults, xMm: 0, zMm: 0 }
  return { ...o, place: { ...p, xMm: measureX(o, length, p.x), zMm: measureZ(o, p.z) } }
}

/** held where its locks say, on a wall `length` long (the wall, or its size, has changed) */
export function held(o: Opening, length: number): Opening {
  const p = o.place
  if (!p) return o
  return { ...o, x: p.lockX ? xFrom(o, length, p.x, p.xMm) : o.x, sill: p.lockZ ? sillFrom(o, p.z, p.zMm) : o.sill }
}
