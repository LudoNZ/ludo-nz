/** Reading a saved stair back: the stairs calculator's inputs, and the
 * brief figures a saved stair's card shows. Pure — no React. */

import { calculateStairs, ComplianceLevel, DEFAULT_INPUT, FlightSpec, FRAMING_LABELS, FramingType, StairInput, TurnSpec } from "./stairs"

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback)
/** board widths set by hand: numbers over 0, or null for a full board */
const sizesFromData = (v: unknown): (number | null)[] =>
  Array.isArray(v) ? v.slice(0, 50).map((x) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : null)) : []
const numOrNull = (v: unknown, fallback: number | null) => (v === null ? null : typeof v === "number" && Number.isFinite(v) ? v : fallback)

/** A saved StairInput, anything missing or the wrong shape taken from the
 * calculator's defaults. */
export const stairInputFromData = (raw: unknown): StairInput => {
  const d = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>
  const D = DEFAULT_INPUT
  const flights: FlightSpec[] =
    Array.isArray(d.flights) && d.flights.length > 0 ? d.flights.map((f) => ({ treads: numOrNull((f as Record<string, unknown>)?.treads, null) })) : D.flights
  const turns: TurnSpec[] = Array.isArray(d.turns)
    ? d.turns
        .filter((t) => typeof t === "object" && t !== null)
        .map((t) => ({
          kind: t.kind === "winders" ? "winders" : "landing",
          direction: t.direction === "right" ? "right" : "left",
          angle: num(t.angle, 90),
          winders: num(t.winders, 3),
        }))
    : D.turns
  return {
    totalRise: num(d.totalRise, D.totalRise),
    risers: numOrNull(d.risers, D.risers),
    going: num(d.going, D.going),
    width: num(d.width, D.width),
    framing: typeof d.framing === "string" && d.framing in FRAMING_LABELS ? (d.framing as FramingType) : D.framing,
    stringerDepth: numOrNull(d.stringerDepth, D.stringerDepth),
    stringerThickness: num(d.stringerThickness, D.stringerThickness),
    maxStringerSpacing: num(d.maxStringerSpacing, D.maxStringerSpacing),
    boardWidth: num(d.boardWidth, D.boardWidth),
    boardGap: num(d.boardGap, D.boardGap),
    boardThickness: num(d.boardThickness, D.boardThickness),
    nosing: numOrNull(d.nosing, D.nosing),
    riserBoards: typeof d.riserBoards === "boolean" ? d.riserBoards : D.riserBoards,
    riserBoardGap: Math.max(0, num(d.riserBoardGap, D.riserBoardGap)),
    riserRip: d.riserRip === "bottom" ? "bottom" : "top",
    leaveOutSlivers: typeof d.leaveOutSlivers === "boolean" ? d.leaveOutSlivers : D.leaveOutSlivers,
    treadBoardSizes: sizesFromData(d.treadBoardSizes),
    riserBoardSizes: sizesFromData(d.riserBoardSizes),
    // one more flight than turns, always
    flights: flights.length === turns.length + 1 ? flights : [...turns.map(() => ({ treads: null })), { treads: null }],
    turns,
  }
}

/** What a saved stair's card shows, worked out when it's saved. */
export interface StairSummary {
  totalRiseMm: number
  totalRunMm: number
  widthMm: number
  risers: number
  riseMm: number
  runMm: number
  turns: number
  compliance: ComplianceLevel
}

export const summariseStair = (input: StairInput): StairSummary => {
  const r = calculateStairs(input)
  return {
    totalRiseMm: Math.round(input.totalRise),
    totalRunMm: Math.round(r.totalRun),
    widthMm: Math.round(input.width),
    risers: r.risers,
    riseMm: Math.round(r.rise),
    runMm: Math.round(r.going),
    turns: input.turns.length,
    compliance: r.compliance,
  }
}
