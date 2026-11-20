/** A Floor Framing project: a rectangle of floor and its frame. Reading
 * one back, and what its card shows. Pure — no React. */

import { buildFrame, DEFAULT_FRAME_INPUT, FrameInput, frameInputFromData, FrameSupport, rectangleOutline } from "./frame"

export interface FloorInput {
  /** mm, along the joists (between walls: the span) */
  lengthMm: number
  /** mm, across the joists */
  widthMm: number
  frame: FrameInput
}

export const DEFAULT_FLOOR: FloorInput = { lengthMm: 3200, widthMm: 4000, frame: { ...DEFAULT_FRAME_INPUT } }

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback)

export const floorInputFromData = (raw: unknown): FloorInput => {
  const d = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>
  // a floor is always under sheets — decks are framed on the decking page
  return {
    lengthMm: num(d.lengthMm, DEFAULT_FLOOR.lengthMm),
    widthMm: num(d.widthMm, DEFAULT_FLOOR.widthMm),
    frame: { ...frameInputFromData(d.frame, DEFAULT_FLOOR.frame), covering: "sheet" },
  }
}

export const floorFrame = (floor: FloorInput) => buildFrame(rectangleOutline(floor.lengthMm, floor.widthMm), "y", floor.frame)

/** What a saved floor's card shows, worked out when it's saved. */
export interface FloorSummary {
  lengthMm: number
  widthMm: number
  support: FrameSupport
  joistSize: string
  joists: number
  sheets: number
  needsEngineer: boolean
}

export const summariseFloor = (floor: FloorInput): FloorSummary => {
  const f = floorFrame(floor)
  return {
    lengthMm: Math.round(floor.lengthMm),
    widthMm: Math.round(floor.widthMm),
    support: floor.frame.support,
    joistSize: f.joistSize,
    joists: f.members.filter((m) => m.kind === "joist").length,
    sheets: f.sheetCount,
    needsEngineer: !!f.needsEngineer,
  }
}
