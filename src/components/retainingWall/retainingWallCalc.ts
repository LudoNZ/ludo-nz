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

// tightest/loosest spacing per soil type, in metres, at 0m and at the
// engineer-limit height respectively — interpolated between the two by
// calcPostSpacingM so spacing tightens smoothly as height (or how loose
// the ground is) increases, never leaving the 1.0-1.5m band asked for
const SOIL_SPACING_M: Record<SoilType, { atZeroHeight: number; atLimitHeight: number }> = {
  firmClay: { atZeroHeight: 1.5, atLimitHeight: 1.2 },
  looseSandy: { atZeroHeight: 1.3, atLimitHeight: 1.0 },
  fill: { atZeroHeight: 1.2, atLimitHeight: 1.0 },
}

/** m, retained height below which a post steps from 100x100 to 150x150 —
 * see calcPostSizeLabel. */
const POST_SIZE_STEP_HEIGHT_M = 1.0

// rule-of-thumb constants — all in one place so they're easy to see and
// tune together, rather than scattered through the calculation
const GRAVEL_BASE_ALLOWANCE_M = 0.1 // under the post, below its embedment
const HOLE_DIAMETER_MULTIPLIER = 3 // hole ~3x the post's own width
const BOARD_COURSE_HEIGHT_M = 0.2 // 200mm treated-pine sleeper
const STANDARD_BOARD_LENGTH_M = 3.0
const BACKFILL_THICKNESS_M = 0.15 // compacted drainage gravel behind the boards

const SETUP_HOURS = 1.5
const HOURS_PER_POST = 0.75
const HOURS_PER_BOARD = 0.2
const HOURS_PER_M3_BACKFILL = 0.5

/** Tighter for a taller wall and for looser ground, interpolated linearly
 * between each soil type's 0m and engineer-limit-height spacing. */
export function calcPostSpacingM(retainedHeightM: number, soil: SoilType): number {
  const { atZeroHeight, atLimitHeight } = SOIL_SPACING_M[soil]
  const t = Math.min(1, Math.max(0, retainedHeightM / ENGINEER_HEIGHT_LIMIT_M))
  return atZeroHeight - (atZeroHeight - atLimitHeight) * t
}

export function calcPostSizeLabel(retainedHeightM: number): string {
  return retainedHeightM < POST_SIZE_STEP_HEIGHT_M ? "100 x 100mm" : "150 x 150mm"
}

function postWidthM(sizeLabel: string): number {
  return sizeLabel.startsWith("100") ? 0.1 : 0.15
}

export interface RetainingWallResult {
  posts: PostSpec
  rails: RailSpec
  infill: InfillSpec
  labor: LaborEstimate
}

/** Full DIY spec for a timber-post-and-board retaining wall, or null if
 * the retained height is over the engineer-design threshold — callers
 * must show the "get a chartered engineer" warning instead of any of
 * this, never a partial/best-effort spec above that height. */
export function calcRetainingWall(wallLengthM: number, retainedHeightM: number, soil: SoilType): RetainingWallResult | null {
  if (retainedHeightM > ENGINEER_HEIGHT_LIMIT_M) return null
  if (!(wallLengthM > 0) || !(retainedHeightM > 0)) return null

  const spacingM = calcPostSpacingM(retainedHeightM, soil)
  const { postCount, actualSpacingM } = calcPostLayout(wallLengthM, spacingM)

  const embedmentM = retainedHeightM / 3 + GRAVEL_BASE_ALLOWANCE_M
  const sizeLabel = calcPostSizeLabel(retainedHeightM)
  const holeDiameterM = postWidthM(sizeLabel) * HOLE_DIAMETER_MULTIPLIER
  const holeVolumeM3 = calcHoleVolumeM3(holeDiameterM, embedmentM)

  const posts: PostSpec = {
    sizeLabel,
    spacingM: actualSpacingM,
    count: postCount,
    lengthM: embedmentM + retainedHeightM,
    embedmentM,
    holeDiameterM,
    holeVolumeM3,
    totalFillVolumeM3: holeVolumeM3 * postCount,
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

  return { posts, rails, infill, labor }
}
