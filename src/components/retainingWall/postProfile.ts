import { calcHoleVolumeM3, calcLinearPieceCount, calcPostLayout } from "../structures/postRailCalc"
import { LaborEstimate } from "../structures/types"
import { CalcSettings, findReferenceRow, postWidthM } from "./calcSettings"
import { ENGINEER_HEIGHT_LIMIT_M, SoilType } from "./retainingWallCalc"

/** A post whose ground level and/or top-of-post level has been set by
 * hand, in metres relative to the RL datum (0 = datum). Every other post
 * "rakes" — linearly interpolates — between whichever control points
 * bound it; a post before the first or after the last control point just
 * holds flat at the nearest one. */
export interface ControlPoint {
  groundLevelM: number
  topLevelM: number
}

/** Keyed by post index. */
export type ControlPoints = Record<number, ControlPoint>

export interface ProfilePost {
  index: number
  /** m, position along the wall */
  xM: number
  /** m, relative to the RL datum */
  groundLevelM: number
  topLevelM: number
  /** topLevelM - groundLevelM */
  retainedHeightM: number
  isControlPoint: boolean
  /** true if this post's local retained height is outside DIY territory
   * (over the limit, or <= 0) — its own numbers below are still computed
   * (so the diagram can draw it and flag it), but it's excluded from every
   * materials/labour total */
  needsEngineer: boolean
  sizeLabel: string
  widthM: number
  embedmentM: number
  holeDiameterM: number
  holeVolumeM3: number
}

export interface ProfileBay {
  leftIndex: number
  rightIndex: number
  widthM: number
  /** taller of the two bounding posts' retained heights — boards have to
   * cover the taller side regardless of how the ground line reads */
  heightM: number
  needsEngineer: boolean
  courseCount: number
  boardLengthM: number
}

export interface WallProfile {
  rlDatumM: number
  postSpacingM: number
  posts: ProfilePost[]
  bays: ProfileBay[]
  postsBySize: { sizeLabel: string; count: number }[]
  totalFillVolumeM3: number
  totalBoardCount: number
  totalBoardLengthM: number
  totalBackfillVolumeM3: number
  labor: LaborEstimate
  engineerPostIndices: number[]
}

const DEFAULT_LEVEL = (retainedHeightM: number): ControlPoint => ({ groundLevelM: 0, topLevelM: retainedHeightM })

/** Resolves post `i`'s ground/top level: its own control point if it has
 * one, else linearly interpolated between the nearest control points
 * bracketing it, else held flat at whichever single control point is
 * nearest, else the uniform default if there are no control points at
 * all yet. `sortedCpIndices` must be sorted ascending. */
function resolveLevel(
  i: number,
  controlPoints: ControlPoints,
  sortedCpIndices: number[],
  retainedHeightM: number
): ControlPoint {
  if (controlPoints[i]) return controlPoints[i]
  if (sortedCpIndices.length === 0) return DEFAULT_LEVEL(retainedHeightM)

  let before: number | undefined
  let after: number | undefined
  for (const ci of sortedCpIndices) {
    if (ci <= i) before = ci
    if (ci >= i && after === undefined) after = ci
  }
  if (before === undefined) return controlPoints[after!]
  if (after === undefined) return controlPoints[before]
  if (before === after) return controlPoints[before]

  const t = (i - before) / (after - before)
  const cpBefore = controlPoints[before]
  const cpAfter = controlPoints[after]
  return {
    groundLevelM: cpBefore.groundLevelM + (cpAfter.groundLevelM - cpBefore.groundLevelM) * t,
    topLevelM: cpBefore.topLevelM + (cpAfter.topLevelM - cpBefore.topLevelM) * t,
  }
}

/** Builds the full per-post, per-bay profile for a raked (or, with no
 * control points set, perfectly uniform) wall. Post count and spacing are
 * still established once from the base wallLengthM/retainedHeightM/soil
 * inputs (same reference-table lookup as the uniform calculator) — a
 * raking wall keeps uniform post centres for constructability, it's each
 * post's own size/embedment/hole and each bay's own board coursing that
 * varies with the local height. Any post or bay whose local height is
 * outside DIY territory is flagged (needsEngineer) and excluded from every
 * total rather than silently under-specified. */
export function buildWallProfile(
  wallLengthM: number,
  retainedHeightM: number,
  soil: SoilType,
  controlPoints: ControlPoints,
  rlDatumM: number,
  settings: CalcSettings
): WallProfile | null {
  if (!(wallLengthM > 0) || !(retainedHeightM > 0)) return null

  const layoutRow = findReferenceRow(settings, Math.min(retainedHeightM, ENGINEER_HEIGHT_LIMIT_M), soil)
  const { postCount, actualSpacingM } = calcPostLayout(wallLengthM, layoutRow.maxSpacingM)

  const sortedCpIndices = Object.keys(controlPoints)
    .map(Number)
    .filter((i) => i >= 0 && i < postCount)
    .sort((a, b) => a - b)

  const posts: ProfilePost[] = Array.from({ length: postCount }, (_, i) => {
    const { groundLevelM, topLevelM } = resolveLevel(i, controlPoints, sortedCpIndices, retainedHeightM)
    const localHeightM = topLevelM - groundLevelM
    const needsEngineer = localHeightM > ENGINEER_HEIGHT_LIMIT_M || localHeightM <= 0
    // clamp purely for the lookup/drawing below — a post over the limit
    // still gets *some* geometry so the diagram can render and flag it,
    // it just never counts toward materials
    const row = findReferenceRow(settings, Math.min(Math.max(localHeightM, 0.01), ENGINEER_HEIGHT_LIMIT_M), soil)
    const sizeLabel = row.postSizeLabel
    const widthM = postWidthM(sizeLabel)
    const embedmentM = Math.max(0.01, localHeightM) * row.embedmentRatio + settings.gravelBaseAllowanceM
    const holeDiameterM = widthM * settings.holeDiameterMultiplier
    const holeVolumeM3 = calcHoleVolumeM3(holeDiameterM, embedmentM)
    return {
      index: i,
      xM: i * actualSpacingM,
      groundLevelM,
      topLevelM,
      retainedHeightM: localHeightM,
      isControlPoint: Boolean(controlPoints[i]),
      needsEngineer,
      sizeLabel,
      widthM,
      embedmentM,
      holeDiameterM,
      holeVolumeM3,
    }
  })

  const bays: ProfileBay[] = []
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i]
    const b = posts[i + 1]
    const needsEngineer = a.needsEngineer || b.needsEngineer
    const heightM = Math.max(a.retainedHeightM, b.retainedHeightM)
    const widthM = b.xM - a.xM
    const courseCount = needsEngineer ? 0 : Math.ceil(heightM / settings.boardCourseHeightM)
    bays.push({
      leftIndex: a.index,
      rightIndex: b.index,
      widthM,
      heightM,
      needsEngineer,
      courseCount,
      boardLengthM: needsEngineer ? 0 : widthM * courseCount,
    })
  }

  const validPosts = posts.filter((p) => !p.needsEngineer)
  const sizeCounts = new Map<string, number>()
  for (const p of validPosts) sizeCounts.set(p.sizeLabel, (sizeCounts.get(p.sizeLabel) ?? 0) + 1)

  const validBays = bays.filter((b) => !b.needsEngineer)
  const totalBoardLengthM = validBays.reduce((sum, b) => sum + b.boardLengthM, 0)
  const totalBoardCount = calcLinearPieceCount(totalBoardLengthM, settings.standardBoardLengthM)
  const totalBackfillVolumeM3 = validBays.reduce((sum, b) => sum + b.widthM * b.heightM * settings.backfillThicknessM, 0)
  const totalFillVolumeM3 = validPosts.reduce((sum, p) => sum + p.holeVolumeM3, 0)

  const postsHours = validPosts.length * settings.hoursPerPost
  const railsHours = totalBoardCount * settings.hoursPerBoard
  const infillHours = totalBackfillVolumeM3 * settings.hoursPerM3Backfill

  return {
    rlDatumM,
    postSpacingM: actualSpacingM,
    posts,
    bays,
    postsBySize: Array.from(sizeCounts.entries()).map(([sizeLabel, count]) => ({ sizeLabel, count })),
    totalFillVolumeM3,
    totalBoardCount,
    totalBoardLengthM,
    totalBackfillVolumeM3,
    labor: {
      setupHours: settings.setupHours,
      postsHours,
      railsHours,
      infillHours,
      totalHours: settings.setupHours + postsHours + railsHours + infillHours,
    },
    engineerPostIndices: posts.filter((p) => p.needsEngineer).map((p) => p.index),
  }
}
