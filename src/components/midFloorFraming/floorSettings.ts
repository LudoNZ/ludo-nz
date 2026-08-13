/** How the joists land on their two support lines (both walls, both
 * bearers, or one of each) — a whole-floor choice for v1 rather than a
 * per-joist one, since mixing methods on the same floor is unusual. */
export type SupportMethod = "onTop" | "hangers"

export const SUPPORT_METHOD_LABELS: Record<SupportMethod, string> = {
  onTop: "Sitting on top (skew-nailed)",
  hangers: "Hung with joist hangers",
}

/** One row of the span reference table a FloorSettings is driven by —
 * banded by spacing and joist size, same "reads as a real ready-reference
 * table" reasoning as the retaining wall calculator's WallSpecRow. Rule of
 * thumb figures (SG8 radiata, single span, standard residential floor
 * loading) — indicative, not a substitute for the actual NZS 3604 span
 * tables or a specific engineering design. */
export interface JoistSpecRow {
  /** mm, centres this row applies at */
  spacingMm: number
  /** e.g. "140 x 45mm" */
  sizeLabel: string
  /** m, this size/spacing combination spans up to and including this */
  maxSpanM: number
}

export interface FloorSettings {
  referenceTable: JoistSpecRow[]
  /** m, assumed stock length a joist is ordered/cut from */
  standardJoistLengthM: number
  /** total fixings (both ends combined) for one joist hanger */
  nailsPerHanger: number
  /** total fixings (both ends combined) for one joist end skew-nailed
   * straight to a top plate/bearer, when not hung */
  nailsPerSkewNailedEnd: number
  /** bands of "up to this span, this many full-width blocking rows" —
   * NZS 3604 requires solid blocking/strutting between joists past a
   * certain depth/span so they can't roll under load */
  blockingRowBands: { upToSpanM: number; rows: number }[]
  /** fixings for one blocking piece (both ends combined) */
  nailsPerBlockingPiece: number
  /** m, standard flooring sheet (particleboard/ply) */
  flooringSheetLengthM: number
  flooringSheetWidthM: number
  /** multiplier over raw area for trimming/laps — sheets are never a
   * perfect tile of an arbitrary floor shape */
  flooringWasteFactor: number
  /** fixings (screws) per flooring sheet, rule of thumb rather than a
   * geometric screw-pattern model */
  screwsPerFlooringSheet: number
  setupHours: number
  /** placing and fixing one joist — the same either way; hangers add
   * hoursPerHanger on top of this, not instead of it */
  hoursPerJoist: number
  hoursPerHanger: number
  hoursPerBlockingPiece: number
  hoursPerFlooringSheet: number
}

export const DEFAULT_FLOOR_SETTINGS: FloorSettings = {
  referenceTable: [
    { spacingMm: 400, sizeLabel: "90 x 45mm", maxSpanM: 1.65 },
    { spacingMm: 400, sizeLabel: "140 x 45mm", maxSpanM: 2.6 },
    { spacingMm: 400, sizeLabel: "190 x 45mm", maxSpanM: 3.4 },
    { spacingMm: 400, sizeLabel: "240 x 45mm", maxSpanM: 4.0 },
    { spacingMm: 400, sizeLabel: "290 x 45mm", maxSpanM: 4.5 },

    { spacingMm: 450, sizeLabel: "90 x 45mm", maxSpanM: 1.55 },
    { spacingMm: 450, sizeLabel: "140 x 45mm", maxSpanM: 2.45 },
    { spacingMm: 450, sizeLabel: "190 x 45mm", maxSpanM: 3.2 },
    { spacingMm: 450, sizeLabel: "240 x 45mm", maxSpanM: 3.8 },
    { spacingMm: 450, sizeLabel: "290 x 45mm", maxSpanM: 4.3 },

    { spacingMm: 600, sizeLabel: "90 x 45mm", maxSpanM: 1.3 },
    { spacingMm: 600, sizeLabel: "140 x 45mm", maxSpanM: 2.1 },
    { spacingMm: 600, sizeLabel: "190 x 45mm", maxSpanM: 2.75 },
    { spacingMm: 600, sizeLabel: "240 x 45mm", maxSpanM: 3.3 },
    { spacingMm: 600, sizeLabel: "290 x 45mm", maxSpanM: 3.7 },
  ],
  standardJoistLengthM: 4.8,
  nailsPerHanger: 10,
  nailsPerSkewNailedEnd: 2,
  blockingRowBands: [
    { upToSpanM: 2.5, rows: 0 },
    { upToSpanM: 4.0, rows: 1 },
    { upToSpanM: Infinity, rows: 2 },
  ],
  nailsPerBlockingPiece: 4,
  flooringSheetLengthM: 2.4,
  flooringSheetWidthM: 1.2,
  flooringWasteFactor: 1.1,
  screwsPerFlooringSheet: 24,
  setupHours: 1,
  hoursPerJoist: 0.3,
  hoursPerHanger: 0.15,
  hoursPerBlockingPiece: 0.2,
  hoursPerFlooringSheet: 0.35,
}

/** The row a given spacing/span combination resolves to — the smallest
 * size at that spacing whose table span still covers what's needed, same
 * "smallest that's still enough" reasoning as everywhere else in these
 * calculators. Null if even the largest listed size at this spacing falls
 * short — outside this tool's reference table entirely. */
export function findJoistRow(settings: FloorSettings, spacingMm: number, spanM: number): JoistSpecRow | null {
  const rows = settings.referenceTable.filter((r) => r.spacingMm === spacingMm).sort((a, b) => a.maxSpanM - b.maxSpanM)
  return rows.find((r) => spanM <= r.maxSpanM + 1e-6) ?? null
}

/** How many full-width blocking rows a given span needs, per
 * blockingRowBands (smallest band whose upToSpanM still covers it). */
export function blockingRowsForSpan(settings: FloorSettings, spanM: number): number {
  const band = settings.blockingRowBands.find((b) => spanM <= b.upToSpanM + 1e-6)
  return band ? band.rows : 0
}
