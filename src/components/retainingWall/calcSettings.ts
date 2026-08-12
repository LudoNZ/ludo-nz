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
  /** m, assumed stock length a board is cut from */
  standardBoardLengthM: number
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
  standardBoardLengthM: 3.0,
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

export function postWidthM(sizeLabel: string): number {
  return sizeLabel.startsWith("100") ? 0.1 : 0.15
}
