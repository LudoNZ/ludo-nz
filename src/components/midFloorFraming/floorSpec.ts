import { calcPostLayout } from "../structures/postRailCalc"
import { blockingRowsForSpan, findJoistRow, FloorSettings, SupportMethod } from "./floorSettings"

export interface FloorLaborEstimate {
  setupHours: number
  joistHours: number
  hangerHours: number
  blockingHours: number
  flooringHours: number
  totalHours: number
}

export interface FloorSpec {
  spanM: number
  widthM: number
  spacingMm: number
  supportMethod: SupportMethod
  /** true if spanM is beyond every size this tool's reference table
   * covers at the chosen spacing — no materials are produced for that */
  needsEngineer: boolean
  sizeLabel: string | null
  /** evenly re-spaced to fit widthM exactly, same reasoning as decking's
   * joist grid — never quite the nominal spacingMm but always at or
   * under it */
  actualSpacingM: number
  joistCount: number
  /** joistCount × spanM — the timber actually covering the floor, before
   * accounting for standard stock lengths */
  totalJoistCoverageM: number
  /** one stock length per joist, so this is joistCount unless spanM
   * exceeds the assumed standard stock length — see lengthExceedsStock */
  joistPieceCount: number
  /** true if spanM > standardJoistLengthM — a real length, just not an
   * off-the-shelf one; doesn't block the spec the way needsEngineer does */
  lengthExceedsStock: boolean
  hangerCount: number
  hangerFixingCount: number
  skewNailFixingCount: number
  blockingRowCount: number
  blockingPieceCount: number
  blockingFixingCount: number
  flooringAreaM2: number
  flooringSheetCount: number
  flooringFixingCount: number
  labor: FloorLaborEstimate
}

/** Builds the full joist/hanger/blocking/flooring materials spec for a
 * single-span mid-floor between two support lines spanM apart, widthM
 * across. A flat, uniform spec, not a raked/per-element one like the
 * retaining wall's — a mid-floor is a simple rectangle spanning between
 * two fixed levels, there's no equivalent of a rake to model here. */
export function buildFloorSpec(
  spanM: number,
  widthM: number,
  spacingMm: number,
  supportMethod: SupportMethod,
  settings: FloorSettings
): FloorSpec | null {
  if (!(spanM > 0) || !(widthM > 0) || !(spacingMm > 0)) return null

  const row = findJoistRow(settings, spacingMm, spanM)
  const needsEngineer = row === null
  const sizeLabel = row?.sizeLabel ?? null

  const { postCount: joistCount, actualSpacingM } = calcPostLayout(widthM, spacingMm / 1000)

  if (needsEngineer) {
    return {
      spanM,
      widthM,
      spacingMm,
      supportMethod,
      needsEngineer,
      sizeLabel,
      actualSpacingM,
      joistCount,
      totalJoistCoverageM: 0,
      joistPieceCount: 0,
      lengthExceedsStock: false,
      hangerCount: 0,
      hangerFixingCount: 0,
      skewNailFixingCount: 0,
      blockingRowCount: 0,
      blockingPieceCount: 0,
      blockingFixingCount: 0,
      flooringAreaM2: 0,
      flooringSheetCount: 0,
      flooringFixingCount: 0,
      labor: { setupHours: settings.setupHours, joistHours: 0, hangerHours: 0, blockingHours: 0, flooringHours: 0, totalHours: settings.setupHours },
    }
  }

  const lengthExceedsStock = spanM > settings.standardJoistLengthM
  const totalJoistCoverageM = joistCount * spanM
  const joistPieceCount = joistCount

  const hangerCount = supportMethod === "hangers" ? joistCount * 2 : 0
  const hangerFixingCount = hangerCount * settings.nailsPerHanger
  const skewNailFixingCount = supportMethod === "onTop" ? joistCount * 2 * settings.nailsPerSkewNailedEnd : 0

  const blockingRowCount = blockingRowsForSpan(settings, spanM)
  const blockingPieceCount = blockingRowCount * Math.max(0, joistCount - 1)
  const blockingFixingCount = blockingPieceCount * settings.nailsPerBlockingPiece

  const flooringAreaM2 = spanM * widthM
  const sheetAreaM2 = settings.flooringSheetLengthM * settings.flooringSheetWidthM
  const flooringSheetCount = Math.ceil((flooringAreaM2 * settings.flooringWasteFactor) / sheetAreaM2)
  const flooringFixingCount = flooringSheetCount * settings.screwsPerFlooringSheet

  const joistHours = joistCount * settings.hoursPerJoist
  const hangerHours = hangerCount * settings.hoursPerHanger
  const blockingHours = blockingPieceCount * settings.hoursPerBlockingPiece
  const flooringHours = flooringSheetCount * settings.hoursPerFlooringSheet
  const totalHours = settings.setupHours + joistHours + hangerHours + blockingHours + flooringHours

  return {
    spanM,
    widthM,
    spacingMm,
    supportMethod,
    needsEngineer,
    sizeLabel,
    actualSpacingM,
    joistCount,
    totalJoistCoverageM,
    joistPieceCount,
    lengthExceedsStock,
    hangerCount,
    hangerFixingCount,
    skewNailFixingCount,
    blockingRowCount,
    blockingPieceCount,
    blockingFixingCount,
    flooringAreaM2,
    flooringSheetCount,
    flooringFixingCount,
    labor: { setupHours: settings.setupHours, joistHours, hangerHours, blockingHours, flooringHours, totalHours },
  }
}
