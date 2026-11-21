/** Joinery types — doors and windows with their usual sizes — and the
 * helpers that keep laying them out quick: the room left on a wall, the
 * head heights already in use to line up with. mm. Pure. */

import type { HouseProject } from "./houseTypes"
import type { OpeningPlace } from "../weatherboards/types"

export interface JoineryType {
  id: string
  name: string
  kind: "door" | "window"
  /** an inside wall's (a door) or an outside wall's (a joinery unit) */
  where: "inside" | "outside"
  width: number
  height: number
  /** a window's head off the floor; unset: the house's head height */
  headMm?: number
  /** what a unit of this type is measured from, and what's held, to start with (unset: from the left, by its head, both held) */
  place?: Omit<OpeningPlace, "xMm" | "zMm">
}

/** the usual NZ sizes to start from: each can be changed, and more added */
export const DEFAULT_JOINERY_TYPES: JoineryType[] = [
  { id: "int-door", name: "Internal door", kind: "door", where: "inside", width: 810, height: 1980 },
  { id: "int-door-wide", name: "Internal door — wide", kind: "door", where: "inside", width: 860, height: 1980 },
  { id: "int-cavity", name: "Cavity slider", kind: "door", where: "inside", width: 810, height: 1980 },
  { id: "int-double", name: "Double doors", kind: "door", where: "inside", width: 1220, height: 1980 },
  { id: "ext-door", name: "External door", kind: "door", where: "outside", width: 860, height: 2000 },
  { id: "ext-french", name: "French doors", kind: "door", where: "outside", width: 1460, height: 2000 },
  { id: "ext-slider", name: "Ranch slider", kind: "door", where: "outside", width: 2400, height: 2000 },
  { id: "win-awning", name: "Awning window", kind: "window", where: "outside", width: 1200, height: 1000 },
  { id: "win-fixed", name: "Fixed window", kind: "window", where: "outside", width: 1200, height: 1200 },
  { id: "win-casement", name: "Casement window", kind: "window", where: "outside", width: 600, height: 1000 },
  { id: "win-sliding", name: "Sliding window", kind: "window", where: "outside", width: 1800, height: 1200 },
  { id: "win-picture", name: "Picture window", kind: "window", where: "outside", width: 2400, height: 1500 },
  { id: "win-bathroom", name: "Bathroom window (obscure)", kind: "window", where: "outside", width: 600, height: 600 },
]

/** the head height windows line up with, off the floor, unless set */
export const DEFAULT_HEAD_MM = 2100

/** the shared defaults (see joineryDefaultsStore.ts), once they've loaded */
let shared: { types: JoineryType[]; headMm: number } | null = null
export const setSharedJoinery = (d: { types: JoineryType[]; headMm: number } | null) => {
  shared = d
}
/** what a house starts from: the shared defaults, or (without them) the built-in ones */
export const baseJoineryTypes = () => shared?.types ?? DEFAULT_JOINERY_TYPES
export const baseHeadMm = () => shared?.headMm ?? DEFAULT_HEAD_MM

/** a house's own types (once it's changed any), else what every house starts from */
export const joineryTypesOf = (h: Pick<HouseProject, "joineryTypes">) => (h.joineryTypes?.length ? h.joineryTypes : baseJoineryTypes())
export const houseHeadOf = (h: Pick<HouseProject, "settings">) => h.settings.joineryHeadMm ?? baseHeadMm()

/** what was laid last, inside or out: the next one starts the same */
export interface LastJoinery {
  typeId: string | null
  kind: "door" | "window"
  width: number
  height: number
  head: number
}

/** the free stretch of a wall round a point (between the units either side, or its ends) */
export function freeGap(taken: { x0: number; x1: number }[], length: number, at: number): [number, number] {
  let lo = 0
  let hi = length
  for (const t of taken) {
    if (t.x1 <= at) lo = Math.max(lo, t.x1)
    else if (t.x0 >= at) hi = Math.min(hi, t.x0)
    // (on top of one: no room)
    else return [at, at]
  }
  return [lo, hi]
}

/** a unit `w` wide as near centred on `at` as fits the gap: its left edge, or null if it won't */
export function fitIn(gap: [number, number], w: number, at: number): number | null {
  if (gap[1] - gap[0] < w - 1) return null
  const x = Math.round((at - w / 2) / 10) * 10
  return Math.min(gap[1] - w, Math.max(gap[0], x))
}

/** the head heights (off their floor) the house's windows and doors already use, most used first */
export function headsUsed(house: HouseProject, floorOf: (wallId: string) => number): number[] {
  const count = new Map<number, number>()
  const add = (h: number) => count.set(Math.round(h / 10) * 10, (count.get(Math.round(h / 10) * 10) ?? 0) + 1)
  for (const j of house.joinery ?? []) add(j.sill - floorOf(j.wallId) + j.height)
  for (const p of [house.floor, house.upper?.plan]) for (const d of p?.doors ?? []) add(d.heightMm)
  add(houseHeadOf(house))
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([h]) => h)
}

/** v to the nearest of `to` within `tol`, else as it is */
export const snapTo = (v: number, to: number[], tol: number) => to.reduce((b, t) => (Math.abs(t - v) < tol && Math.abs(t - v) < Math.abs(b - v) ? t : b), v)
