import { calcHoleVolumeM3, calcPostLayout } from "../structures/postRailCalc"
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

/** Keyed by post index; presence (true) marks that post as a corner —
 * where the wall changes direction in plan. A facing board physically
 * can't run past a corner, so board runs always break there regardless of
 * whether a standard-length board would otherwise have reached further;
 * see the run-splitting in buildWallProfile below. */
export type CornerPosts = Record<number, true>

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
  isCorner: boolean
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
  /** full-height level facing-board courses stacked from the ground —
   * not counting the top/perimeter board, which is always the final
   * piece on top of these (see WallProfile.topBoard) */
  levelCourseCount: number
  levelBoardLengthM: number
}

/** One category of board (regular facing courses, the top/perimeter
 * board, or the optional top cap) planned into real cut pieces — see the
 * run/piece loops in buildWallProfile. */
export interface BoardLayerSummary {
  count: number
  /** of count, how many are cut as one continuous length across two bays
   * (the preferred, stronger layout) vs. broken to a single bay because a
   * corner, an excluded bay, or the standard board length forced it */
  twoSpanCount: number
  oneSpanCount: number
  totalLengthM: number
}

export interface WallProfile {
  rlDatumM: number
  postSpacingM: number
  posts: ProfilePost[]
  bays: ProfileBay[]
  postsBySize: { sizeLabel: string; count: number }[]
  totalFillVolumeM3: number
  /** regular level facing-board courses */
  boards: BoardLayerSummary
  /** the continuous perimeter/capping board along the very top of the
   * wall, following the rake — always present (one per valid bay) */
  topBoard: BoardLayerSummary
  /** an extra flat board laid over the top board/post tops for a
   * finished look and to protect end grain — null when not enabled */
  topCap: BoardLayerSummary | null
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

/** Groups bays into unbroken runs: contiguous, and not separated by a
 * corner post. An excluded (needsEngineer) bay already breaks contiguity
 * on its own, since it's missing from `bays` entirely by the time this
 * runs (callers pass only the valid ones in). */
function groupIntoRuns(validBays: ProfileBay[], posts: ProfilePost[]): ProfileBay[][] {
  const runs: ProfileBay[][] = []
  for (const bay of validBays) {
    const lastRun = runs[runs.length - 1]
    const prevBay = lastRun?.[lastRun.length - 1]
    const breaksRun = !prevBay || prevBay.rightIndex !== bay.leftIndex || posts[prevBay.rightIndex].isCorner
    if (breaksRun) runs.push([bay])
    else lastRun.push(bay)
  }
  return runs
}

/** Plans a board layer that has exactly one segment per bay running the
 * bay's full width (the top/perimeter board, and the optional top cap) —
 * simpler than the level-course planner below since there's no per-row
 * presence check, every valid bay always has one. Same preference: pair
 * two bays into one continuous piece wherever it fits the standard board
 * length, otherwise fall back to a single bay. */
function planUniformBoardLayer(runs: ProfileBay[][], standardBoardLengthM: number): BoardLayerSummary {
  const totalLengthM = runs.reduce((sum, run) => sum + run.reduce((s, b) => s + b.widthM, 0), 0)
  let twoSpanCount = 0
  let oneSpanCount = 0
  for (const run of runs) {
    let i = 0
    while (i < run.length) {
      const bay = run[i]
      const next = run[i + 1]
      const pairs = Boolean(next) && bay.widthM + next!.widthM <= standardBoardLengthM + 1e-6
      if (pairs) {
        twoSpanCount++
        i += 2
      } else {
        oneSpanCount++
        i += 1
      }
    }
  }
  return { count: twoSpanCount + oneSpanCount, twoSpanCount, oneSpanCount, totalLengthM }
}

/** Plans the regular level-course facing boards: unlike the top board/cap,
 * a given course row only exists in a bay once its height needs that many
 * courses, so rows are walked one at a time and only paired across bays
 * where the row actually continues into the neighbour. */
function planLevelCourseBoards(runs: ProfileBay[][], standardBoardLengthM: number): BoardLayerSummary {
  const totalLengthM = runs.reduce((sum, run) => sum + run.reduce((s, b) => s + b.levelBoardLengthM, 0), 0)
  let twoSpanCount = 0
  let oneSpanCount = 0
  for (const run of runs) {
    const maxCourses = Math.max(0, ...run.map((b) => b.levelCourseCount))
    for (let k = 0; k < maxCourses; k++) {
      const rowBays = run.filter((b) => b.levelCourseCount > k)
      let i = 0
      while (i < rowBays.length) {
        const bay = rowBays[i]
        const next = rowBays[i + 1]
        const pairs = Boolean(next) && next.leftIndex === bay.rightIndex
        const pairWidthM = pairs ? bay.widthM + next!.widthM : 0
        if (pairs && pairWidthM <= standardBoardLengthM + 1e-6) {
          twoSpanCount++
          i += 2
        } else {
          oneSpanCount++
          i += 1
        }
      }
    }
  }
  return { count: twoSpanCount + oneSpanCount, twoSpanCount, oneSpanCount, totalLengthM }
}

/** Builds the full per-post, per-bay profile for a raked (or, with no
 * control points set, perfectly uniform) wall. Post count and spacing are
 * still established once from the base wallLengthM/retainedHeightM/soil
 * inputs (same reference-table lookup as the uniform calculator) — a
 * raking wall keeps uniform post centres for constructability, it's each
 * post's own size/embedment/hole and each bay's own board coursing that
 * varies with the local height. Any post or bay whose local height is
 * outside DIY territory is flagged (needsEngineer) and excluded from every
 * total rather than silently under-specified.
 *
 * Board coursing is planned as real cut pieces, not just a total-length
 * divide: a course run breaks at any corner post (a board can't physically
 * run past one) and at any excluded bay, and within each unbroken run it
 * prefers a single piece spanning two bays at a time — same reasoning as
 * lapped fence rails, fewer joints is stronger — falling back to a
 * single-bay piece wherever a pair wouldn't fit the standard board length
 * or there's an odd bay left over.
 *
 * On top of the level courses, every bay also gets a top/perimeter board —
 * the piece that actually follows the rake and ties the wall together
 * along its whole top edge, planned the same two-span-preferred way. An
 * optional top cap (topCapEnabled) adds one more such layer on top of
 * that, for a finished look and to protect end grain. */
export function buildWallProfile(
  wallLengthM: number,
  retainedHeightM: number,
  soil: SoilType,
  controlPoints: ControlPoints,
  cornerPosts: CornerPosts,
  topCapEnabled: boolean,
  rlDatumM: number,
  settings: CalcSettings
): WallProfile | null {
  if (!(wallLengthM > 0) || !(retainedHeightM > 0)) return null

  const layoutRow = findReferenceRow(settings, Math.min(retainedHeightM, ENGINEER_HEIGHT_LIMIT_M), soil)
  const { postCount, actualSpacingM } = calcPostLayout(wallLengthM, layoutRow.maxSpacingM)

  // Both end posts always anchor the rake — at the page's default level
  // unless the user has explicitly overridden that particular end — so
  // editing one end (or any single interior post) blends back to the
  // default at the far side instead of flat-extending across the whole
  // wall. Only synthesised for resolving levels; isControlPoint below
  // still reflects just what the user actually set.
  const lastIndex = postCount - 1
  const effectiveControlPoints: ControlPoints = { ...controlPoints }
  if (effectiveControlPoints[0] === undefined) effectiveControlPoints[0] = DEFAULT_LEVEL(retainedHeightM)
  if (effectiveControlPoints[lastIndex] === undefined) effectiveControlPoints[lastIndex] = DEFAULT_LEVEL(retainedHeightM)

  const sortedCpIndices = Object.keys(effectiveControlPoints)
    .map(Number)
    .filter((i) => i >= 0 && i < postCount)
    .sort((a, b) => a - b)

  const posts: ProfilePost[] = Array.from({ length: postCount }, (_, i) => {
    const { groundLevelM, topLevelM } = resolveLevel(i, effectiveControlPoints, sortedCpIndices, retainedHeightM)
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
      isCorner: Boolean(cornerPosts[i]),
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
    // level courses fill from the lower of the two ground levels up to the
    // lower of the two top levels — the shorter side's own top — same
    // geometry the diagram draws; whatever's left above that (always
    // something, even if it's a full course's worth) is the top board,
    // not counted here
    const baseLevelM = Math.min(a.groundLevelM, b.groundLevelM)
    const minTopM = Math.min(a.topLevelM, b.topLevelM)
    const levelCourseCount = needsEngineer ? 0 : Math.max(0, Math.floor((minTopM - baseLevelM) / settings.boardCourseHeightM))
    bays.push({
      leftIndex: a.index,
      rightIndex: b.index,
      widthM,
      heightM,
      needsEngineer,
      levelCourseCount,
      levelBoardLengthM: needsEngineer ? 0 : widthM * levelCourseCount,
    })
  }

  const validPosts = posts.filter((p) => !p.needsEngineer)
  const sizeCounts = new Map<string, number>()
  for (const p of validPosts) sizeCounts.set(p.sizeLabel, (sizeCounts.get(p.sizeLabel) ?? 0) + 1)

  const validBays = bays.filter((b) => !b.needsEngineer)
  const runs = groupIntoRuns(validBays, posts)

  const boards = planLevelCourseBoards(runs, settings.standardBoardLengthM)
  const topBoard = planUniformBoardLayer(runs, settings.standardBoardLengthM)
  const topCap = topCapEnabled ? planUniformBoardLayer(runs, settings.standardBoardLengthM) : null

  const totalBackfillVolumeM3 = validBays.reduce((sum, b) => sum + b.widthM * b.heightM * settings.backfillThicknessM, 0)
  const totalFillVolumeM3 = validPosts.reduce((sum, p) => sum + p.holeVolumeM3, 0)

  const totalBoardCount = boards.count + topBoard.count + (topCap?.count ?? 0)
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
    boards,
    topBoard,
    topCap,
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
