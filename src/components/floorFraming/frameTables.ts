/** The rule-of-thumb reference tables and rates the floor framing engine
 * (frame.ts) is driven by. Indicative figures in the spirit of NZS 3604 —
 * SG8 radiata, standard residential loading — not a substitute for the
 * actual span tables or an engineered design.
 *
 * Two joist tables: one for an inside floor under sheet flooring (dry, 1.5
 * kPa), one for a deck under decking boards (wet in service, 2 kPa), which
 * spans a little less at every size. */

/** One row of a joist span table: at these centres, this size spans up to
 * maxSpanM (between supports, single span). */
export interface JoistSpecRow {
  spacingMm: number
  /** e.g. "140 x 45mm" */
  sizeLabel: string
  maxSpanM: number
}

/** One row of the bearer table: this size, carrying joists over this
 * loaded dimension (half the joist span each side of it), spans up to
 * maxSpanM between piles. */
export interface BearerSpecRow {
  /** m, up to and including */
  loadedDimensionM: number
  sizeLabel: string
  maxSpanM: number
}

export const JOIST_SIZES = ["90 x 45mm", "140 x 45mm", "190 x 45mm", "240 x 45mm", "290 x 45mm"] as const
export const BEARER_SIZES = ["90 x 70mm", "140 x 70mm", "190 x 70mm"] as const

const table = (spans: Record<number, number[]>): JoistSpecRow[] =>
  Object.entries(spans).flatMap(([spacing, row]) => row.map((maxSpanM, i) => ({ spacingMm: Number(spacing), sizeLabel: JOIST_SIZES[i], maxSpanM })))

/** inside floor, under sheet flooring — the table the mid-floor
 * calculator has always used */
export const FLOOR_JOIST_TABLE: JoistSpecRow[] = table({
  400: [1.65, 2.6, 3.4, 4.0, 4.5],
  450: [1.55, 2.45, 3.2, 3.8, 4.3],
  600: [1.3, 2.1, 2.75, 3.3, 3.7],
})

/** a deck, under decking boards: wet in service, a heavier floor load */
export const DECK_JOIST_TABLE: JoistSpecRow[] = table({
  400: [1.3, 2.1, 2.8, 3.5, 4.1],
  450: [1.2, 2.0, 2.65, 3.3, 3.9],
  600: [1.05, 1.75, 2.35, 2.9, 3.4],
})

export const BEARER_TABLE: BearerSpecRow[] = [
  { loadedDimensionM: 1.2, sizeLabel: "90 x 70mm", maxSpanM: 1.4 },
  { loadedDimensionM: 1.2, sizeLabel: "140 x 70mm", maxSpanM: 2.2 },
  { loadedDimensionM: 1.2, sizeLabel: "190 x 70mm", maxSpanM: 2.9 },
  { loadedDimensionM: 1.65, sizeLabel: "90 x 70mm", maxSpanM: 1.2 },
  { loadedDimensionM: 1.65, sizeLabel: "140 x 70mm", maxSpanM: 1.9 },
  { loadedDimensionM: 1.65, sizeLabel: "190 x 70mm", maxSpanM: 2.5 },
  { loadedDimensionM: 2.3, sizeLabel: "90 x 70mm", maxSpanM: 1.0 },
  { loadedDimensionM: 2.3, sizeLabel: "140 x 70mm", maxSpanM: 1.6 },
  { loadedDimensionM: 2.3, sizeLabel: "190 x 70mm", maxSpanM: 2.1 },
  { loadedDimensionM: 3.0, sizeLabel: "140 x 70mm", maxSpanM: 1.4 },
  { loadedDimensionM: 3.0, sizeLabel: "190 x 70mm", maxSpanM: 1.85 },
]

/** "140 x 45mm" → depth 140, thickness 45 */
export function parseSize(label: string): { depth: number; thick: number } {
  const m = label.match(/(\d+)\s*x\s*(\d+)/)
  return m ? { depth: Number(m[1]), thick: Number(m[2]) } : { depth: 140, thick: 45 }
}

/** The smallest size at these centres whose span covers spanM, or null
 * if even the biggest falls short. */
export function findJoistRow(rows: JoistSpecRow[], spacingMm: number, spanM: number): JoistSpecRow | null {
  const at = rowsAtSpacing(rows, spacingMm)
  return at.find((r) => spanM <= r.maxSpanM + 1e-6) ?? null
}

/** the rows at the nearest tabled spacing at or above this one (a spacing
 * between rows is read off the wider one, the safe side) */
export function rowsAtSpacing(rows: JoistSpecRow[], spacingMm: number): JoistSpecRow[] {
  const spacings = [...new Set(rows.map((r) => r.spacingMm))].sort((a, b) => a - b)
  const use = spacings.find((s) => s >= spacingMm - 1e-6) ?? null
  if (use === null) return []
  return rows.filter((r) => r.spacingMm === use).sort((a, b) => a.maxSpanM - b.maxSpanM)
}

/** how far this size spans at these centres (0 if it's not tabled there) */
export function joistMaxSpanM(rows: JoistSpecRow[], spacingMm: number, sizeLabel: string): number {
  return rowsAtSpacing(rows, spacingMm).find((r) => r.sizeLabel === sizeLabel)?.maxSpanM ?? 0
}

/** how far this bearer spans between piles at this loaded dimension (0 if
 * the loaded dimension's past the table, or the size isn't tabled there) */
export function bearerMaxSpanM(sizeLabel: string, loadedDimensionM: number): number {
  const lds = [...new Set(BEARER_TABLE.map((r) => r.loadedDimensionM))].sort((a, b) => a - b)
  const ld = lds.find((l) => loadedDimensionM <= l + 1e-6)
  if (ld === undefined) return 0
  return BEARER_TABLE.find((r) => r.loadedDimensionM === ld && r.sizeLabel === sizeLabel)?.maxSpanM ?? 0
}

/** Rates and rules the frame is costed with. */
export interface FrameSettings {
  /** bands of "up to this span between supports, this many rows of solid
   * blocking" — so deep joists can't roll under load */
  blockingRowBands: { upToSpanM: number; rows: number }[]
  /** mm, longest length a joist, bearer or rim is bought in */
  maxStockLengthMm: number
  /** a pile's depth into the ground, and its footing hole */
  pileSize: number
  pileEmbedMm: number
  pileHoleDiameterMm: number
  pileHoleDepthMm: number
  /** the tallest an ordinary (unbraced) pile stands above the ground */
  maxOrdinaryPileHeightMm: number
  /** a joist end past its last support, before it's worth a warning */
  maxCantileverMm: number
  /** a deck this high needs a barrier (NZBC F4) */
  barrierHeightMm: number
  ledgerBoltSpacingMm: number
  nailsPerHanger: number
  nailsPerSkewNailedEnd: number
  nailsPerBlockingPiece: number
  nailsPerJoistToRim: number
  wireDogsPerPile: number
  screwsPerSheet: number
  /** decking screws at each joist a board crosses */
  screwsPerBoardCrossing: number
  setupHours: number
  hoursPerJoist: number
  hoursPerHanger: number
  hoursPerBlockingPiece: number
  hoursPerPile: number
  hoursPerBearerM: number
  hoursPerLedgerM: number
  hoursPerSheet: number
}

export const DEFAULT_FRAME_SETTINGS: FrameSettings = {
  blockingRowBands: [
    { upToSpanM: 2.5, rows: 0 },
    { upToSpanM: 4.0, rows: 1 },
    { upToSpanM: Infinity, rows: 2 },
  ],
  maxStockLengthMm: 6000,
  pileSize: 125,
  pileEmbedMm: 450,
  pileHoleDiameterMm: 350,
  pileHoleDepthMm: 550,
  maxOrdinaryPileHeightMm: 600,
  maxCantileverMm: 450,
  barrierHeightMm: 1000,
  ledgerBoltSpacingMm: 800,
  nailsPerHanger: 10,
  nailsPerSkewNailedEnd: 2,
  nailsPerBlockingPiece: 4,
  nailsPerJoistToRim: 3,
  wireDogsPerPile: 2,
  screwsPerSheet: 24,
  screwsPerBoardCrossing: 2,
  setupHours: 1,
  hoursPerJoist: 0.3,
  hoursPerHanger: 0.15,
  hoursPerBlockingPiece: 0.2,
  hoursPerPile: 1,
  hoursPerBearerM: 0.25,
  hoursPerLedgerM: 0.5,
  hoursPerSheet: 0.35,
}

export function blockingRowsForSpan(settings: FrameSettings, spanM: number): number {
  const band = settings.blockingRowBands.find((b) => spanM <= b.upToSpanM + 1e-6)
  return band ? band.rows : 0
}
