import { calcHoleVolumeM3, calcLinearPieceCount, calcPostLayout } from "../structures/postRailCalc"
import { InfillSpec, LaborEstimate, PostSpec, RailSpec } from "../structures/types"

export type SoilType = "firmClay" | "looseSandy" | "fill"

export const SOIL_LABELS: Record<SoilType, string> = {
  firmClay: "Firm clay",
  looseSandy: "Loose or sandy soil",
  fill: "Made-up or fill ground",
}

/** Above this retained height, a DIY spec isn't offered at all — see
 * calcRetainingWall. Matches the common NZ Building Consent exemption
 * threshold for an un-surcharged retaining wall. */
export const ENGINEER_HEIGHT_LIMIT_M = 1.5

/** One row of the reference table this whole calculator is driven by —
 * banded by "up to this retained height", not a smooth curve, so it reads
 * (and displays) as a real ready-reference table rather than a hidden
 * formula. A post embeds deeper, proportionally, than a simple fence post
 * would: it has to resist the retained soil's lateral (overturning)
 * pressure over its whole embedded length, not just wind load on an
 * above-ground picket area, so embedmentRatio is deliberately well above
 * the "bury a third of the post" rule of thumb a fence gets away with. */
export interface WallSpecRow {
  soil: SoilType
  /** m, this row applies for walls up to and including this retained height */
  maxHeightM: number
  postSizeLabel: string
  /** m, tightest allowed centres at this row's height/soil */
  maxSpacingM: number
  /** fraction of the retained height embedded in undisturbed ground below
   * it (the gravel base pad sits below that again — see
   * GRAVEL_BASE_ALLOWANCE_M — and isn't counted as structural embedment) */
  embedmentRatio: number
}

export const REFERENCE_TABLE: WallSpecRow[] = [
  { soil: "firmClay", maxHeightM: 0.6, postSizeLabel: "100 x 100mm", maxSpacingM: 1.5, embedmentRatio: 0.5 },
  { soil: "firmClay", maxHeightM: 1.0, postSizeLabel: "100 x 100mm", maxSpacingM: 1.35, embedmentRatio: 0.5 },
  { soil: "firmClay", maxHeightM: 1.5, postSizeLabel: "150 x 150mm", maxSpacingM: 1.2, embedmentRatio: 0.55 },

  { soil: "looseSandy", maxHeightM: 0.6, postSizeLabel: "100 x 100mm", maxSpacingM: 1.3, embedmentRatio: 0.55 },
  { soil: "looseSandy", maxHeightM: 1.0, postSizeLabel: "100 x 100mm", maxSpacingM: 1.15, embedmentRatio: 0.6 },
  { soil: "looseSandy", maxHeightM: 1.5, postSizeLabel: "150 x 150mm", maxSpacingM: 1.0, embedmentRatio: 0.65 },

  { soil: "fill", maxHeightM: 0.6, postSizeLabel: "100 x 100mm", maxSpacingM: 1.2, embedmentRatio: 0.6 },
  { soil: "fill", maxHeightM: 1.0, postSizeLabel: "150 x 150mm", maxSpacingM: 1.05, embedmentRatio: 0.68 },
  { soil: "fill", maxHeightM: 1.5, postSizeLabel: "150 x 150mm", maxSpacingM: 1.0, embedmentRatio: 0.75 },
]

/** The row this calculator is using for a given soil/height — whichever
 * band's maxHeightM is the smallest one the retained height still fits
 * under. Exported so the page can highlight exactly this row when it
 * shows the reference table. */
export function findReferenceRow(retainedHeightM: number, soil: SoilType): WallSpecRow {
  const rows = REFERENCE_TABLE.filter((r) => r.soil === soil).sort((a, b) => a.maxHeightM - b.maxHeightM)
  return rows.find((r) => retainedHeightM <= r.maxHeightM + 1e-6) ?? rows[rows.length - 1]
}

// constants outside the table — construction detail, not soil/height-
// dependent design values. Exported for postProfile.ts, which needs the
// same constants for its own per-post version of this same calculation.
export const GRAVEL_BASE_ALLOWANCE_M = 0.1 // drainage/bearing pad under the post, below its embedment
export const HOLE_DIAMETER_MULTIPLIER = 3 // hole ~3x the post's own width — common rule of thumb
export const BOARD_COURSE_HEIGHT_M = 0.2 // 200mm treated-pine sleeper
export const STANDARD_BOARD_LENGTH_M = 3.0
export const BACKFILL_THICKNESS_M = 0.15 // compacted drainage gravel behind the boards

export const SETUP_HOURS = 1.5
export const HOURS_PER_POST = 1.5 // dig, set, plumb, fill — doubled, the original rate ran light for real-world digging
export const HOURS_PER_BOARD = 0.4 // doubled for the same reason
export const HOURS_PER_M3_BACKFILL = 0.5

export function calcPostSpacingM(retainedHeightM: number, soil: SoilType): number {
  return findReferenceRow(retainedHeightM, soil).maxSpacingM
}

export function calcPostSizeLabel(retainedHeightM: number, soil: SoilType): string {
  return findReferenceRow(retainedHeightM, soil).postSizeLabel
}

export function postWidthM(sizeLabel: string): number {
  return sizeLabel.startsWith("100") ? 0.1 : 0.15
}

export interface RetainingWallResult {
  posts: PostSpec
  rails: RailSpec
  infill: InfillSpec
  labor: LaborEstimate
  referenceRow: WallSpecRow
}

/** Full DIY spec for a timber-post-and-board retaining wall, or null if
 * the retained height is over the engineer-design threshold — callers
 * must show the "get a chartered engineer" warning instead of any of
 * this, never a partial/best-effort spec above that height. */
export function calcRetainingWall(wallLengthM: number, retainedHeightM: number, soil: SoilType): RetainingWallResult | null {
  if (retainedHeightM > ENGINEER_HEIGHT_LIMIT_M) return null
  if (!(wallLengthM > 0) || !(retainedHeightM > 0)) return null

  const referenceRow = findReferenceRow(retainedHeightM, soil)
  const { postCount, actualSpacingM } = calcPostLayout(wallLengthM, referenceRow.maxSpacingM)

  const embedmentM = retainedHeightM * referenceRow.embedmentRatio + GRAVEL_BASE_ALLOWANCE_M
  const sizeLabel = referenceRow.postSizeLabel
  const widthM = postWidthM(sizeLabel)
  const holeDiameterM = widthM * HOLE_DIAMETER_MULTIPLIER
  const holeVolumeM3 = calcHoleVolumeM3(holeDiameterM, embedmentM)

  const posts: PostSpec = {
    sizeLabel,
    widthM,
    spacingM: actualSpacingM,
    count: postCount,
    lengthM: embedmentM + retainedHeightM,
    embedmentM,
    holeDiameterM,
    holeVolumeM3,
    totalFillVolumeM3: holeVolumeM3 * postCount,
    baseAllowanceM: GRAVEL_BASE_ALLOWANCE_M,
  }

  // facing boards run horizontally, stacked from ground level to the top
  // of the retained height — each course spans the wall's full length
  const courseCount = Math.ceil(retainedHeightM / BOARD_COURSE_HEIGHT_M)
  const totalLengthM = wallLengthM * courseCount
  const boardCount = calcLinearPieceCount(totalLengthM, STANDARD_BOARD_LENGTH_M)

  const rails: RailSpec = {
    label: `Facing boards (${Math.round(BOARD_COURSE_HEIGHT_M * 1000)}mm sleepers)`,
    courseCount,
    totalLengthM,
    standardLengthM: STANDARD_BOARD_LENGTH_M,
    boardCount,
  }

  // a retaining wall's "infill" is what goes in behind the boards rather
  // than between rails — free-draining gravel to relieve the hydrostatic
  // pressure that would otherwise build up against the facing
  const backfillVolumeM3 = wallLengthM * retainedHeightM * BACKFILL_THICKNESS_M
  const infill: InfillSpec = {
    label: "Drainage backfill",
    volumeM3: backfillVolumeM3,
    note: `Compacted free-draining gravel, roughly a ${Math.round(BACKFILL_THICKNESS_M * 1000)}mm layer behind the facing boards.`,
  }

  const postsHours = postCount * HOURS_PER_POST
  const railsHours = boardCount * HOURS_PER_BOARD
  const infillHours = backfillVolumeM3 * HOURS_PER_M3_BACKFILL
  const labor: LaborEstimate = {
    setupHours: SETUP_HOURS,
    postsHours,
    railsHours,
    infillHours,
    totalHours: SETUP_HOURS + postsHours + railsHours + infillHours,
  }

  return { posts, rails, infill, labor, referenceRow }
}
