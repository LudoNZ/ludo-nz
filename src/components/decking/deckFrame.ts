/** A deck's frame: the deck's outline and board direction handed to the
 * shared floor framing engine. Boards run across the joists, so the
 * joists run along the deck's row-stacking axis. Pure. */

import { buildFrame, DEFAULT_DECK_FRAME, FrameInput, FrameLayout } from "../floorFraming/frame"
import { DeckPoint } from "./polygon"
import { DeckConfig } from "./types"

type DeckShape = Pick<DeckConfig, "width" | "sideA" | "sideB" | "points" | "boardDirection">

/** the deck's outline in plan mm: its polygon, or the trapezoid's corners */
export function deckOutline(config: DeckShape): DeckPoint[] {
  if (Array.isArray(config.points) && config.points.length >= 3) return config.points
  return [
    { x: 0, y: 0 },
    { x: config.sideA, y: 0 },
    { x: config.sideB, y: config.width },
    { x: 0, y: config.width },
  ]
}

/** boards into the rake run along x, so the joists run along y */
export const deckJoistAxis = (config: Pick<DeckConfig, "boardDirection">): "x" | "y" => (config.boardDirection === "alongRake" ? "x" : "y")

/** the frame's settings with the deck's own spacing */
export function deckFrameInput(config: Pick<DeckConfig, "frame" | "joistSpacing" | "firstBaySpacing">): FrameInput {
  const f = config.frame ?? DEFAULT_DECK_FRAME
  const first = config.firstBaySpacing && config.firstBaySpacing !== config.joistSpacing ? config.firstBaySpacing : null
  return { ...f, covering: "decking", support: f.support === "walls" ? "bearers" : f.support, joistSpacing: config.joistSpacing, firstBaySpacing: first }
}

/** The deck's frame laid out, or null if it hasn't got one. */
export function deckFrameLayout(config: DeckShape & Pick<DeckConfig, "frame" | "joistSpacing" | "firstBaySpacing">): FrameLayout | null {
  if (!config.frame) return null
  return buildFrame(deckOutline(config), deckJoistAxis(config), deckFrameInput(config))
}

/** names for the joists' two ends, for where a ledger goes */
export function deckEndLabels(config: Pick<DeckConfig, "points" | "boardDirection" | "edgeLabels">): { start: string; end: string } {
  const polygon = Array.isArray(config.points) && config.points.length >= 3
  if (deckJoistAxis(config) === "y") return polygon ? { start: "Top edge", end: "Bottom edge" } : { start: config.edgeLabels.sideA, end: config.edgeLabels.sideB }
  return polygon ? { start: "Left edge", end: "Right edge" } : { start: config.edgeLabels.width, end: config.edgeLabels.rake }
}
