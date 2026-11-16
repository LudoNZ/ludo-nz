import { SoilType } from "./retainingWallCalc"

/** One row of the reference table a CalcSettings is driven by — banded by
 * "up to this retained height", not a smooth curve, so it reads (and
 * displays) as a real ready-reference table rather than a hidden formula. */
export interface WallSpecRow {
  soil: SoilType
  /** m, this row applies for walls up to and including this retained height */
  maxHeightM: number
  postSizeLabel: string
  /** m, tightest allowed centres at this row's height/soil */
  maxSpacingM: number
  /** fraction of the retained height embedded in undisturbed ground below
   * it (the gravel base pad sits below that again, and isn't counted as
   * structural embedment) */
  embedmentRatio: number
}

/** Every number the calculator actually uses to turn wall length/height/
 * soil into a materials + labour spec, bundled into one editable, saveable
 * unit — this is what the settings panel edits and what "Save as preset"
 * persists. Deliberately excludes the 1.5m engineer-design cutoff: that's
 * a safety/legal threshold (the NZ Building Consent exemption), not a
 * calculation preference, and stays fixed regardless of which settings are
 * active — see ENGINEER_HEIGHT_LIMIT_M in retainingWallCalc.ts. */
export interface CalcSettings {
  referenceTable: WallSpecRow[]
  /** m, drainage/bearing pad under the post, below its embedment */
  gravelBaseAllowanceM: number
  /** hole diameter as a multiple of the post's own width */
  holeDiameterMultiplier: number
  /** m, height of one facing-board course */
  boardCourseHeightM: number
  /** m, the lengths facing boards can be bought in. A board runs as far
   * along the wall as the longest of these allows before it's joined. */
  boardStockLengthsM: number[]
  /** m, compacted drainage gravel layer thickness behind the boards */
  backfillThicknessM: number
  setupHours: number
  hoursPerPost: number
  hoursPerBoard: number
  hoursPerM3Backfill: number
}

export const DEFAULT_CALC_SETTINGS: CalcSettings = {
  referenceTable: [
    { soil: "firmClay", maxHeightM: 0.6, postSizeLabel: "100 x 100mm", maxSpacingM: 1.5, embedmentRatio: 0.5 },
    { soil: "firmClay", maxHeightM: 1.0, postSizeLabel: "100 x 100mm", maxSpacingM: 1.35, embedmentRatio: 0.5 },
    { soil: "firmClay", maxHeightM: 1.5, postSizeLabel: "150 x 150mm", maxSpacingM: 1.2, embedmentRatio: 0.55 },

    { soil: "looseSandy", maxHeightM: 0.6, postSizeLabel: "100 x 100mm", maxSpacingM: 1.3, embedmentRatio: 0.55 },
    { soil: "looseSandy", maxHeightM: 1.0, postSizeLabel: "100 x 100mm", maxSpacingM: 1.15, embedmentRatio: 0.6 },
    { soil: "looseSandy", maxHeightM: 1.5, postSizeLabel: "150 x 150mm", maxSpacingM: 1.0, embedmentRatio: 0.65 },

    { soil: "fill", maxHeightM: 0.6, postSizeLabel: "100 x 100mm", maxSpacingM: 1.2, embedmentRatio: 0.6 },
    { soil: "fill", maxHeightM: 1.0, postSizeLabel: "150 x 150mm", maxSpacingM: 1.05, embedmentRatio: 0.68 },
    { soil: "fill", maxHeightM: 1.5, postSizeLabel: "150 x 150mm", maxSpacingM: 1.0, embedmentRatio: 0.75 },
  ],
  gravelBaseAllowanceM: 0.1,
  holeDiameterMultiplier: 3,
  boardCourseHeightM: 0.2,
  boardStockLengthsM: [4.2, 4.8, 5.4, 6.0],
  backfillThicknessM: 0.15,
  setupHours: 1.5,
  hoursPerPost: 1.5,
  hoursPerBoard: 0.4,
  hoursPerM3Backfill: 0.5,
}

/** The row a given settings/height/soil combination is using — whichever
 * band's maxHeightM is the smallest one the retained height still fits
 * under. */
export function findReferenceRow(settings: CalcSettings, retainedHeightM: number, soil: SoilType): WallSpecRow {
  const rows = settings.referenceTable.filter((r) => r.soil === soil).sort((a, b) => a.maxHeightM - b.maxHeightM)
  return rows.find((r) => retainedHeightM <= r.maxHeightM + 1e-6) ?? rows[rows.length - 1]
}

/** Post sizes offered when overriding the table with one size for every
 * post — square sawn posts and round (SED) poles. Any label works as long
 * as it starts with its size in mm and says "round" if it's a pole. */
export const POST_SIZE_OPTIONS = [
  "100 x 100mm",
  "125 x 125mm",
  "150 x 150mm",
  "200 x 200mm",
  "125mm round",
  "150mm round",
  "175mm round",
  "200mm round",
  "225mm round",
  "250mm round",
]

/** Face width (square) or diameter (round) of a post, read off the
 * leading number in its label — "150 x 150mm", "150mm round". */
export function postWidthM(sizeLabel: string): number {
  const mm = parseFloat(sizeLabel)
  return mm >= 50 && mm <= 600 ? mm / 1000 : 0.15
}

export const isRoundPost = (sizeLabel: string): boolean => /round|sed|dia/i.test(sizeLabel)

/** m², the post's cross-section — what it displaces in its hole */
export function postSectionAreaM2(sizeLabel: string): number {
  const w = postWidthM(sizeLabel)
  return isRoundPost(sizeLabel) ? (Math.PI * w * w) / 4 : w * w
}

/** m, the smallest hole the post will physically drop into: its own
 * diameter if round, corner to corner if square */
export function postFitDiameterM(sizeLabel: string): number {
  const w = postWidthM(sizeLabel)
  return isRoundPost(sizeLabel) ? w : w * Math.SQRT2
}

/** The board lengths to plan with, shortest first — falling back to the
 * defaults for settings saved before stock lengths existed (or with
 * nothing usable entered). */
export function boardStockLengths(settings: CalcSettings): number[] {
  const list = Array.isArray(settings.boardStockLengthsM) ? settings.boardStockLengthsM : []
  const valid = Array.from(new Set(list.filter((l) => typeof l === "number" && l >= 0.5 && l <= 12))).sort((a, b) => a - b)
  return valid.length ? valid : DEFAULT_CALC_SETTINGS.boardStockLengthsM
}

/** Works out what to buy for a list of cut pieces: longest pieces first,
 * each cut from the leftover of a length already on the list if it fits
 * (tightest fit first), otherwise from a new length — the shortest one
 * it fits in. A piece longer than every stock length is counted as one
 * of the longest. Saw cuts aren't allowed for. */
export function planBoardOrder(pieceLengthsM: number[], stockLengthsM: number[]): { lengthM: number; count: number }[] {
  const stocks = [...stockLengthsM].sort((a, b) => a - b)
  if (stocks.length === 0) return []
  const open: { lengthM: number; leftM: number }[] = []
  for (const piece of [...pieceLengthsM].sort((a, b) => b - a)) {
    let best: { lengthM: number; leftM: number } | null = null
    for (const board of open) {
      if (board.leftM + 1e-6 >= piece && (!best || board.leftM < best.leftM)) best = board
    }
    if (best) {
      best.leftM -= piece
      continue
    }
    const lengthM = stocks.find((l) => l + 1e-6 >= piece) ?? stocks[stocks.length - 1]
    open.push({ lengthM, leftM: Math.max(0, lengthM - piece) })
  }
  const counts = new Map<number, number>()
  for (const board of open) counts.set(board.lengthM, (counts.get(board.lengthM) ?? 0) + 1)
  return Array.from(counts.entries())
    .map(([lengthM, count]) => ({ lengthM, count }))
    .sort((a, b) => a.lengthM - b.lengthM)
}
