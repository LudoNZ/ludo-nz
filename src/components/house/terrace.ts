/** A terrace: several houses — townhouses, each its own house project —
 * stood side by side on one site, to see and showcase as one building.
 * Each unit's plan is its own (mm, y down, from its own corner); the
 * terrace says where that corner stands (x across, y down) and its floor
 * level against the others (z up). Pure. */

import { houseFromData, HouseProject } from "./houseTypes"

export interface TerraceUnit {
  id: string
  house: HouseProject
  x: number
  y: number
  z: number
}

export interface Terrace {
  name: string
  units: TerraceUnit[]
}

export const EMPTY_TERRACE: Terrace = { name: "My terrace", units: [] }

export const newUnitId = () => Math.random().toString(36).slice(2, 10)

/** whatever storage or a file had, made whole */
export function terraceFromData(d: unknown): Terrace {
  const o = (d && typeof d === "object" ? d : {}) as Partial<Terrace> & { kind?: string; terrace?: unknown }
  if (o.kind === "ludo-terrace" && o.terrace) return terraceFromData(o.terrace)
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0)
  return {
    name: typeof o.name === "string" && o.name ? o.name : EMPTY_TERRACE.name,
    units: (Array.isArray(o.units) ? o.units : [])
      .filter((u) => u && typeof u === "object" && u.house)
      .map((u) => ({ id: typeof u.id === "string" ? u.id : newUnitId(), house: houseFromData(u.house), x: num(u.x), y: num(u.y), z: num(u.z) })),
  }
}

export const terraceToJson = (t: Terrace) => JSON.stringify({ kind: "ludo-terrace", version: 1, terrace: t }, null, 1)

/** a house's ground floor's extent across (for setting the next one alongside) */
export const widthOf = (h: HouseProject) => {
  const xs = h.floor.outline.map((p) => p.x)
  return xs.length ? Math.max(...xs) - Math.min(...xs) : 0
}
