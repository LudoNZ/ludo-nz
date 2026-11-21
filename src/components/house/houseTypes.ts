/** The House calculator's project: a one-storey house to start, laid out
 * from its ground floor plan up — outside walls, inside walls and rooms
 * — then its roof and what holds it up, and from that the cladding (a
 * linked weatherboard project). Plan coordinates are mm, y down as on
 * screen, like the footprint editor's. */

import type { Opening, RoofPlan, WingSetting } from "../weatherboards/types"
import type { JoineryType, LastJoinery } from "./joinery"
import { gridFromData, type ProjectGrid } from "./grid"

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

/** a door in an inside wall: its leaf's size, and where its middle is
 * along the wall, from the wall's first end (`a`) */
export interface Door {
  id: string
  name?: string
  /** the joinery type it was laid as (see joinery.ts) */
  typeId?: string
  /** the inside wall's id (outline mode) or key (rooms mode, see floorPlan.ts) */
  wallId: string
  atMm: number
  widthMm: number
  heightMm: number
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
  /** doors in the inside walls */
  doors: Door[]
}

export type RoofFrame = "trusses" | "rafters"

export const ROOF_FRAME_LABELS: Record<RoofFrame, string> = {
  trusses: "Trusses",
  rafters: "Rafters & ceiling joists",
}

/** How the inside walls are framed (see wallFraming.ts). */
export interface FramingSettings {
  /** studs, plates and nogs: depth across the wall × thickness, mm */
  studDepthMm: number
  studThickMm: number
  /** what the timber's asked for as, after the size */
  grade: string
  studCentresMm: number
  /** nog rows no further apart than this (and from the plates) */
  nogMaxMm: number
  /** a second top plate on the load-bearing walls */
  doubleTopPlateLB: boolean
  /** a load-bearing wall's lintel: two of this depth × the stud
   * thickness, side by side (to be checked against NZS 3604) */
  lintelDepthMm: number
  /** the frame's opening over a door's leaf: jambs and packing */
  doorWidthAllowanceMm: number
  doorHeightAllowanceMm: number
  /** the frame's opening over a window or outside door's joinery unit */
  windowWidthAllowanceMm: number
  windowHeightAllowanceMm: number
}

export const DEFAULT_FRAMING: FramingSettings = {
  studDepthMm: 90,
  studThickMm: 45,
  grade: "SG8 H1.2",
  studCentresMm: 600,
  nogMaxMm: 800,
  doubleTopPlateLB: true,
  lintelDepthMm: 190,
  doorWidthAllowanceMm: 60,
  doorHeightAllowanceMm: 40,
  windowWidthAllowanceMm: 20,
  windowHeightAllowanceMm: 20,
}

export interface HouseSettings {
  /** the head height off the floor windows line up with (unless their type says) */
  joineryHeadMm?: number
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
  /** each roof section set by hand — its framing turned 90°, its own kind
   * of roof — by key: "m:<wing>" on the main roof, "l:<roof>:<wing>" on the
   * ground floor's lower roofs (the house's roof settings are the default) */
  roofSections?: Record<string, WingSetting>
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
  /** the inside walls' framing */
  framing: FramingSettings
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
  /** windows and doors drawn on the outside walls (in Framing), each on its
   * cladding wall (by id) as the weatherboards place them: x from the wall's
   * start, sill up from the ground floor */
  joinery: HouseJoinery[]
  /** the joinery types to lay from, each with its default size; unset: the usual ones */
  joineryTypes?: JoineryType[]
  /** what was laid last, inside and out, for the next to start the same */
  lastJoinery?: Partial<Record<"inside" | "outside", LastJoinery>>
}

export interface HouseJoinery extends Opening {
  wallId: string
  typeId?: string
}

/** the house's own joinery's ids start so, to tell them from the weatherboard project's */
export const HOUSE_JOINERY = "hj-"

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
  framing: DEFAULT_FRAMING,
}

export const newHouseId = () => Math.random().toString(36).slice(2, 10)

export const DEFAULT_HOUSE: HouseProject = {
  name: "My house",
  floor: { mode: null, outline: [], lockedEdgeLengths: {}, lockedVertexAngles: {}, walls: [], tags: [], boxes: [], overrides: {}, doors: [] },
  upper: null,
  grid: { stepMm: 500, moved: {} },
  settings: DEFAULT_SETTINGS,
  step: 0,
  link: null,
  joinery: [],
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
    doors: arr<Door>(f.doors).filter((d) => d && typeof d.wallId === "string" && typeof d.atMm === "number" && typeof d.widthMm === "number" && typeof d.heightMm === "number"),
  }
}

export function houseFromData(d: unknown): HouseProject {
  const o = (d && typeof d === "object" ? d : {}) as Partial<HouseProject>
  const u = o.upper && typeof o.upper === "object" ? o.upper : null
  return {
    name: typeof o.name === "string" && o.name ? o.name : DEFAULT_HOUSE.name,
    floor: planFromData(o.floor),
    grid: gridFromData(o.grid),
    upper: u ? { plan: planFromData(u.plan), studHeightMm: typeof u.studHeightMm === "number" ? u.studHeightMm : DEFAULT_SETTINGS.studHeightMm } : null,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(o.settings ?? {}),
      roof: { ...DEFAULT_SETTINGS.roof, ...(o.settings?.roof ?? {}) },
      lowerRoof: { ...DEFAULT_SETTINGS.lowerRoof, ...(o.settings?.lowerRoof ?? {}) },
      framing: { ...DEFAULT_FRAMING, ...(o.settings?.framing ?? {}) },
    },
    step: typeof o.step === "number" ? o.step : 0,
    link: o.link && typeof o.link === "object" && typeof o.link.id === "string" ? o.link : null,
    ...(Array.isArray(o.joineryTypes) && o.joineryTypes.length ? { joineryTypes: o.joineryTypes } : {}),
    ...(o.lastJoinery && typeof o.lastJoinery === "object" ? { lastJoinery: o.lastJoinery } : {}),
    joinery: arr<HouseJoinery>(o.joinery).filter(
      (j) => j && typeof j.id === "string" && typeof j.wallId === "string" && [j.x, j.sill, j.width, j.height].every((v) => typeof v === "number"),
    ),
  }
}
