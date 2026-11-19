/** Things in the ground the wall has to cross — a pipe, a cable, a tree
 * root — each with a clearance zone kept clear as a safety buffer. Pure
 * geometry: where an obstruction's zone lands along the unfolded wall,
 * whether a post hole reaches into it, and where to put posts either side
 * of it so none has to. */

export type ObstructionType = "stormwater" | "sewer" | "water" | "power" | "gas" | "comms" | "drainCoil" | "treeRoot" | "other"

export const OBSTRUCTION_TYPES: Record<ObstructionType, { label: string; shape: "round" | "box"; color: string }> = {
  stormwater: { label: "Stormwater pipe", shape: "round", color: "#4a90c2" },
  sewer: { label: "Sewer pipe", shape: "round", color: "#8c6d3f" },
  water: { label: "Water main", shape: "round", color: "#2f6fd6" },
  power: { label: "Power cable", shape: "round", color: "#d64545" },
  gas: { label: "Gas pipe", shape: "round", color: "#e0b100" },
  comms: { label: "Fibre / comms", shape: "round", color: "#e07b1a" },
  drainCoil: { label: "Drain coil", shape: "round", color: "#3f9d5a" },
  treeRoot: { label: "Tree root", shape: "round", color: "#6b4f2a" },
  other: { label: "Other", shape: "box", color: "#7a7a7a" },
}

export const OBSTRUCTION_TYPE_LIST = Object.keys(OBSTRUCTION_TYPES) as ObstructionType[]

/** m — the standard clearance for each type until it's set in the
 * obstructions card. One figure for all to start with: set your own. */
export const DEFAULT_OBSTRUCTION_CLEARANCE_M = 0.3

export interface Obstruction {
  id: string
  type: ObstructionType
  /** e.g. "SW 100 to sump" */
  label: string
  /** the wall (run) it crosses */
  segmentIndex: number
  /** its centreline crosses `distanceM` from this end of that wall */
  from: "start" | "end"
  distanceM: number
  /** degrees between the wall (walking from its start to its end) and
   * the obstruction, turning toward the retained ground: 90 crosses
   * square, under 90 leans toward the wall's end on the retained side */
  angleDeg: number
  /** m, ground level down to the top of it */
  depthM: number
  /** m, its width (a pipe's outside diameter) */
  sizeM: number
  /** m, kept clear all round it; null = the standard for its type */
  clearanceM: number | null
}

export const MIN_ANGLE_DEG = 15
export const MAX_ANGLE_DEG = 165

/** the clearance in force for an obstruction */
export const clearanceFor = (o: Obstruction, standard: Partial<Record<ObstructionType, number>> | undefined): number =>
  o.clearanceM ?? standard?.[o.type] ?? DEFAULT_OBSTRUCTION_CLEARANCE_M

/** Where an obstruction is, measured along the unfolded wall. */
export interface ObstructionZone {
  obstruction: Obstruction
  clearanceM: number
  /** m along the unfolded wall, where its centreline crosses */
  centreXM: number
  /** m, half its own width measured along the wall (wider when it
   * crosses at an angle) */
  coreHalfM: number
  /** m, half the clearance zone's width along the wall */
  zoneHalfM: number
  /** m below ground: the top and bottom of the clearance zone (the top
   * no higher than the ground) */
  zoneTopDepthM: number
  zoneBottomDepthM: number
  /** false when it crosses past either end of its wall, or the wall's gone */
  onWall: boolean
}

const sinOf = (deg: number) => Math.sin((Math.min(MAX_ANGLE_DEG, Math.max(MIN_ANGLE_DEG, deg)) * Math.PI) / 180)

/** An obstruction's zone along the wall, given the start (along the
 * unfolded wall) and length of the wall it crosses — undefined if that
 * wall's gone. */
export function obstructionZone(
  o: Obstruction,
  seg: { startXM: number; lengthM: number } | undefined,
  standard?: Partial<Record<ObstructionType, number>>
): ObstructionZone {
  const clearanceM = Math.max(0, clearanceFor(o, standard))
  const along = seg ? (o.from === "end" ? seg.lengthM - o.distanceM : o.distanceM) : 0
  const s = sinOf(o.angleDeg)
  return {
    obstruction: o,
    clearanceM,
    centreXM: (seg?.startXM ?? 0) + along,
    coreHalfM: o.sizeM / 2 / s,
    zoneHalfM: (o.sizeM / 2 + clearanceM) / s,
    zoneTopDepthM: Math.max(0, o.depthM - clearanceM),
    zoneBottomDepthM: o.depthM + o.sizeM + clearanceM,
    onWall: Boolean(seg) && along >= 0 && along <= (seg?.lengthM ?? 0),
  }
}

/** true when a hole (centred `xM` along the wall, `diameterM` across,
 * drilled `depthM` below its ground) reaches into the zone */
export const holeClashes = (zone: ObstructionZone, xM: number, diameterM: number, depthM: number): boolean =>
  zone.onWall && Math.abs(xM - zone.centreXM) < zone.zoneHalfM + diameterM / 2 - 1e-6 && depthM > zone.zoneTopDepthM + 1e-6

/** a hair of room past the zone for a post put in beside it */
export const CLEAR_MARGIN_M = 0.02

/** Where to put a post either side of an obstruction (m from its wall's
 * start) so neither hole reaches into the zone — or none, when the holes
 * there as laid out don't reach it (too shallow, or already clear). */
export function clearanceAnchors(
  zone: ObstructionZone,
  segStartXM: number,
  segLengthM: number,
  postOffsetsM: number[],
  holeDiameterM: number,
  holeDepthM: number
): number[] {
  if (!zone.onWall) return []
  const clash = postOffsetsM.some((x) => holeClashes(zone, segStartXM + x, holeDiameterM, holeDepthM))
  if (!clash) return []
  const reach = zone.zoneHalfM + holeDiameterM / 2 + CLEAR_MARGIN_M
  const c = zone.centreXM - segStartXM
  return [c - reach, c + reach].filter((x) => x > 0 && x < segLengthM)
}

/** A fresh obstruction across the middle of a wall. */
export const newObstruction = (segmentIndex: number, segLengthM: number, type: ObstructionType = "stormwater"): Obstruction => ({
  id: Math.random().toString(36).slice(2, 10),
  type,
  label: "",
  segmentIndex,
  from: "start",
  distanceM: Math.round((segLengthM / 2) * 100) / 100,
  angleDeg: 90,
  depthM: 0.4,
  sizeM: 0.11,
  clearanceM: null,
})

export const obstructionsFromData = (raw: unknown): Obstruction[] =>
  (Array.isArray(raw) ? raw : [])
    .filter((o) => typeof o === "object" && o !== null)
    .map((o) => ({
      id: typeof o.id === "string" && o.id ? o.id : Math.random().toString(36).slice(2, 10),
      type: (typeof o.type === "string" && o.type in OBSTRUCTION_TYPES ? o.type : "other") as ObstructionType,
      label: typeof o.label === "string" ? o.label : "",
      segmentIndex: typeof o.segmentIndex === "number" && o.segmentIndex >= 0 ? Math.round(o.segmentIndex) : 0,
      from: (o.from === "end" ? "end" : "start") as "start" | "end",
      distanceM: typeof o.distanceM === "number" && o.distanceM >= 0 ? o.distanceM : 0,
      angleDeg: typeof o.angleDeg === "number" ? Math.min(MAX_ANGLE_DEG, Math.max(MIN_ANGLE_DEG, o.angleDeg)) : 90,
      depthM: typeof o.depthM === "number" && o.depthM >= 0 ? o.depthM : 0.4,
      sizeM: typeof o.sizeM === "number" && o.sizeM > 0 ? o.sizeM : 0.1,
      clearanceM: typeof o.clearanceM === "number" && o.clearanceM >= 0 ? o.clearanceM : null,
    }))
