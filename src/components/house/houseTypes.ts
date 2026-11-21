/** The House calculator's project: a one-storey house to start, laid out
 * from its ground floor plan up — outside walls, inside walls and rooms
 * — then its roof and what holds it up, and from that the cladding (a
 * linked weatherboard project). Plan coordinates are mm, y down as on
 * screen, like the footprint editor's. */

import type { RoofPlan } from "../weatherboards/types"
import type { ProjectGrid } from "./grid"

export interface Pt {
  x: number
  y: number
}

/** how the plan was started: the outline drawn and walls added inside it,
 * or rooms laid out as boxes and the walls found where they meet */
export type PlanMode = "outline" | "rooms"

export type LoadBearing = "auto" | "yes" | "no"

export type RoomKind = "living" | "bedroom" | "kitchen" | "bathroom" | "laundry" | "hall" | "garage" | "other"

export const ROOM_KIND_LABELS: Record<RoomKind, string> = {
  living: "Living",
  bedroom: "Bedroom",
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  laundry: "Laundry",
  hall: "Hall",
  garage: "Garage",
  other: "Other",
}

/** a room's own colour on the plan */
export const ROOM_KIND_COLOURS: Record<RoomKind, string> = {
  living: "#f3d9a4",
  bedroom: "#c9dcf2",
  kitchen: "#f2c2a2",
  bathroom: "#b8e3df",
  laundry: "#d7cdea",
  hall: "#e4e1da",
  garage: "#d3d3d3",
  other: "#e8ecd0",
}

/** an inside wall, drawn in outline mode: always square on plan */
export interface InsideWall {
  id: string
  a: Pt
  b: Pt
  loadBearing: LoadBearing
}

/** a room's name, pinned to a point inside it (outline mode: the room is
 * whatever space the walls close off round that point) */
export interface RoomTag {
  id: string
  name: string
  kind: RoomKind
  at: Pt
}

/** a room as a box (rooms mode) */
export interface RoomBox {
  id: string
  name: string
  kind: RoomKind
  x: number
  y: number
  w: number
  h: number
}

export interface FloorPlan {
  /** null until the start step's been chosen */
  mode: PlanMode | null
  /** outline mode: the outside face of the outside walls */
  outline: Pt[]
  lockedEdgeLengths: Record<string, number>
  lockedVertexAngles: Record<string, number>
  walls: InsideWall[]
  tags: RoomTag[]
  /** rooms mode */
  boxes: RoomBox[]
  /** rooms mode: load-bearing set by hand on a wall found between rooms,
   * by its key (see floorPlan.ts) */
  overrides: Record<string, LoadBearing>
}

export type RoofFrame = "trusses" | "rafters"

export const ROOF_FRAME_LABELS: Record<RoofFrame, string> = {
  trusses: "Trusses",
  rafters: "Rafters & ceiling joists",
}

export interface HouseSettings {
  /** ground floor to its top plate: the eaves height (and ceiling) of a
   * one-storey house, or of the ground floor's own roof under a second */
  studHeightMm: number
  /** a second storey: its floor's depth over the ground floor's top plate
   * (joists, flooring) */
  floorDepthMm: number
  /** the most the first floor's joists span between walls below */
  floorJoistSpanMm: number
  /** the roof over the parts of the ground floor the first floor doesn't
   * cover: a lean-to up against the storey above, or a hip */
  lowerRoof: { type: "skillion" | "hip"; pitchDeg: number }
  roofFrame: RoofFrame
  /** the roof itself — the same as the weatherboards' 3D roof, minus "auto" */
  roof: RoofPlan
  /** the widest a standard truss spans, wall to wall */
  maxTrussSpanMm: number
  /** the most a ceiling joist spans between supports (from the span
   * tables for its size and centres) */
  ceilingJoistSpanMm: number
  /** the most a rafter spans, eaves to ridge on the slope, before it
   * needs an underpurlin propped off a wall below */
  rafterSpanMm: number
}

/** where the linked weatherboard project lives */
export interface CladdingLink {
  kind: "private" | "public"
  uid?: string
  id: string
}

/** the storey over the ground floor */
export interface UpperFloor {
  plan: FloorPlan
  /** its floor to its top plate */
  studHeightMm: number
}

export interface HouseProject {
  name: string
  /** the ground floor */
  floor: FloorPlan
  /** a first floor over it, or none */
  upper: UpperFloor | null
  /** the setting-out grid every storey snaps to (see grid.ts) */
  grid: ProjectGrid
  settings: HouseSettings
  /** the step the walk-through's on */
  step: number
  link: CladdingLink | null
}

export const DEFAULT_SETTINGS: HouseSettings = {
  studHeightMm: 2400,
  floorDepthMm: 300,
  floorJoistSpanMm: 4200,
  lowerRoof: { type: "skillion", pitchDeg: 15 },
  roofFrame: "trusses",
  roof: { type: "gable", pitchDeg: 25, eavesMm: 450, vergeMm: 300, colour: "#3f4449" },
  maxTrussSpanMm: 12000,
  ceilingJoistSpanMm: 3600,
  rafterSpanMm: 3600,
}

export const newHouseId = () => Math.random().toString(36).slice(2, 10)

export const DEFAULT_HOUSE: HouseProject = {
  name: "My house",
  floor: { mode: null, outline: [], lockedEdgeLengths: {}, lockedVertexAngles: {}, walls: [], tags: [], boxes: [], overrides: {} },
  upper: null,
  grid: { stepMm: 500, moved: {} },
  settings: DEFAULT_SETTINGS,
  step: 0,
  link: null,
}

/** a plain box to start drawing from: 12 × 8 m */
export const STARTING_OUTLINE: Pt[] = [
  { x: 0, y: 0 },
  { x: 12000, y: 0 },
  { x: 12000, y: 8000 },
  { x: 0, y: 8000 },
]

/** a first few rooms to start from: a simple three-bedroom layout, 12 × 8 m */
export const STARTING_BOXES = (): RoomBox[] => [
  { id: newHouseId(), name: "Living", kind: "living", x: 0, y: 0, w: 6000, h: 4800 },
  { id: newHouseId(), name: "Kitchen", kind: "kitchen", x: 6000, y: 0, w: 3000, h: 4800 },
  { id: newHouseId(), name: "Bedroom 1", kind: "bedroom", x: 9000, y: 0, w: 3000, h: 4800 },
  { id: newHouseId(), name: "Bedroom 2", kind: "bedroom", x: 0, y: 4800, w: 3600, h: 3200 },
  { id: newHouseId(), name: "Bathroom", kind: "bathroom", x: 3600, y: 4800, w: 2400, h: 3200 },
  { id: newHouseId(), name: "Hall", kind: "hall", x: 6000, y: 4800, w: 2400, h: 3200 },
  { id: newHouseId(), name: "Bedroom 3", kind: "bedroom", x: 8400, y: 4800, w: 3600, h: 3200 },
]

/** whatever an older version (or a hand-edit) left in storage, made whole */
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

const planFromData = (d: unknown): FloorPlan => {
  const f = (d && typeof d === "object" ? d : {}) as Partial<FloorPlan>
  return {
    mode: f.mode === "outline" || f.mode === "rooms" ? f.mode : null,
    outline: arr<Pt>(f.outline),
    lockedEdgeLengths: f.lockedEdgeLengths ?? {},
    lockedVertexAngles: f.lockedVertexAngles ?? {},
    walls: arr<InsideWall>(f.walls),
    tags: arr<RoomTag>(f.tags),
    boxes: arr<RoomBox>(f.boxes),
    overrides: f.overrides ?? {},
  }
}

export function houseFromData(d: unknown): HouseProject {
  const o = (d && typeof d === "object" ? d : {}) as Partial<HouseProject>
  const u = o.upper && typeof o.upper === "object" ? o.upper : null
  return {
    name: typeof o.name === "string" && o.name ? o.name : DEFAULT_HOUSE.name,
    floor: planFromData(o.floor),
    grid:
      o.grid && typeof o.grid === "object" && typeof o.grid.stepMm === "number"
        ? { stepMm: o.grid.stepMm, moved: o.grid.moved && typeof o.grid.moved === "object" ? o.grid.moved : {} }
        : { stepMm: 500, moved: {} },
    upper: u ? { plan: planFromData(u.plan), studHeightMm: typeof u.studHeightMm === "number" ? u.studHeightMm : DEFAULT_SETTINGS.studHeightMm } : null,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(o.settings ?? {}),
      roof: { ...DEFAULT_SETTINGS.roof, ...(o.settings?.roof ?? {}) },
      lowerRoof: { ...DEFAULT_SETTINGS.lowerRoof, ...(o.settings?.lowerRoof ?? {}) },
    },
    step: typeof o.step === "number" ? o.step : 0,
    link: o.link && typeof o.link === "object" && typeof o.link.id === "string" ? o.link : null,
  }
}
