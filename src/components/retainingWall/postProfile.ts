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

/** A board piece boundary that lands mid-run (not a run's own start/end,
 * which is already either a corner or a wall end, not a "joint" between
 * two pieces of the same layer). Every piece always runs bay-to-bay, so a
 * joint always lands exactly on a post — there's no floating/off-post
 * case in this model; `levelM` is just where on that post to draw it. */
export interface BoardJoint {
  postIndex: number
  /** m, relative to the RL datum */
  levelM: number
  layer: "course" | "topBoard" | "topCap"
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
  joints: BoardJoint[]
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

/** Plans one ordered list of bays into pieces: pairs two bays into one
 * continuous length wherever they're physically adjacent and fit the
 * standard board length, otherwise a single bay. `phase` offsets where
 * pairing starts — 0 pairs (0,1)(2,3)…, 1 leaves bay 0 on its own first
 * so pairing shifts to (1,2)(3,4)… — the mechanism staggered joints are
 * built from: calling this with an alternating phase row to row moves
 * each row's joints to different posts, like coursed brickwork, instead
 * of stacking every row's joint on the same post. */
function planPieces(bays: ProfileBay[], standardBoardLengthM: number, phase: 0 | 1): { start: number; end: number }[] {
  const pieces: { start: number; end: number }[] = []
  let i = 0
  if (phase === 1 && bays.length > 0) {
    pieces.push({ start: 0, end: 0 })
    i = 1
  }
  while (i < bays.length) {
    const bay = bays[i]
    const next = bays[i + 1]
    const adjacent = Boolean(next) && next.leftIndex === bay.rightIndex
    const pairs = adjacent && bay.widthM + next!.widthM <= standardBoardLengthM + 1e-6
    if (pairs) {
      pieces.push({ start: i, end: i + 1 })
      i += 2
    } else {
      pieces.push({ start: i, end: i })
      i += 1
    }
  }
  return pieces
}

/** Folds a planned piece list into running totals plus the joints between
 * consecutive pieces (always at the post shared by the two pieces —
 * there's no other place a piece boundary can fall). `levelAtPost` gives
 * the height to draw that joint at, specific to which layer/row it's on. */
function accumulatePieces(
  agg: { twoSpanCount: number; oneSpanCount: number; totalLengthM: number; joints: BoardJoint[] },
  bays: ProfileBay[],
  pieces: { start: number; end: number }[],
  lengthOf: (bay: ProfileBay) => number,
  levelAtPost: (postIndex: number) => number,
  layer: BoardJoint["layer"]
) {
  pieces.forEach((p, idx) => {
    if (p.end > p.start) agg.twoSpanCount++
    else agg.oneSpanCount++
    for (let i = p.start; i <= p.end; i++) agg.totalLengthM += lengthOf(bays[i])
    const next = pieces[idx + 1]
    if (next) {
      const jointPostIndex = bays[p.end].rightIndex
      agg.joints.push({ postIndex: jointPostIndex, levelM: levelAtPost(jointPostIndex), layer })
    }
  })
}

/** Plans every board layer for every run in one pass, so joint staggering
 * can carry its alternating phase upward — row to row through the level
 * courses, then on into the top board and (if enabled) the top cap —
 * without every row starting back at the same phase. Each run stagger-
 * plans independently, since runs are already split at corners and
 * excluded bays; a corner always forces a break there regardless of
 * phase, so staggering never needs to (and can't) continue across one. */
function planBoardLayers(
  runs: ProfileBay[][],
  posts: ProfilePost[],
  settings: CalcSettings,
  topCapEnabled: boolean
): { boards: BoardLayerSummary; topBoard: BoardLayerSummary; topCap: BoardLayerSummary | null } {
  const courseAgg = { twoSpanCount: 0, oneSpanCount: 0, totalLengthM: 0, joints: [] as BoardJoint[] }
  const topBoardAgg = { twoSpanCount: 0, oneSpanCount: 0, totalLengthM: 0, joints: [] as BoardJoint[] }
  const topCapAgg = { twoSpanCount: 0, oneSpanCount: 0, totalLengthM: 0, joints: [] as BoardJoint[] }
  const ch = settings.boardCourseHeightM
  // schematic cap thickness, kept in sync with the diagram's own constant
  const capThicknessM = ch * 0.25

  for (const run of runs) {
    const maxCourses = Math.max(0, ...run.map((b) => b.levelCourseCount))
    for (let k = 0; k < maxCourses; k++) {
      const rowBays = run.filter((b) => b.levelCourseCount > k)
      const phase: 0 | 1 = (k % 2) as 0 | 1
      const pieces = planPieces(rowBays, settings.standardBoardLengthM, phase)
      accumulatePieces(
        courseAgg,
        rowBays,
        pieces,
        (bay) => bay.widthM,
        (postIndex) => posts[postIndex].groundLevelM + (k + 0.5) * ch,
        "course"
      )
    }

    // continue the alternation up from wherever the level courses left off,
    // so the top board's joint doesn't land back on the same post as the
    // course immediately below it
    const topBoardPhase: 0 | 1 = (maxCourses % 2) as 0 | 1
    const topBoardPieces = planPieces(run, settings.standardBoardLengthM, topBoardPhase)
    accumulatePieces(topBoardAgg, run, topBoardPieces, (bay) => bay.widthM, (postIndex) => posts[postIndex].topLevelM, "topBoard")

    if (topCapEnabled) {
      const capPhase: 0 | 1 = ((maxCourses + 1) % 2) as 0 | 1
      const capPieces = planPieces(run, settings.standardBoardLengthM, capPhase)
      accumulatePieces(
        topCapAgg,
        run,
        capPieces,
        (bay) => bay.widthM,
        (postIndex) => posts[postIndex].topLevelM + capThicknessM,
        "topCap"
      )
    }
  }

  const finalize = (agg: typeof courseAgg): BoardLayerSummary => ({
    count: agg.twoSpanCount + agg.oneSpanCount,
    twoSpanCount: agg.twoSpanCount,
    oneSpanCount: agg.oneSpanCount,
    totalLengthM: agg.totalLengthM,
    joints: agg.joints,
  })

  return {
    boards: finalize(courseAgg),
    topBoard: finalize(topBoardAgg),
    topCap: topCapEnabled ? finalize(topCapAgg) : null,
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
 * total rather than silently under-specified.
 *
 * Board coursing is planned as real cut pieces, not just a total-length
 * divide: a course run breaks at any corner post (a board can't physically
 * run past one) and at any excluded bay, and within each unbroken run it
 * prefers a single piece spanning two bays at a time — same reasoning as
 * lapped fence rails, fewer joints is stronger. Where a run's long enough
 * that joints can't be avoided, each row's joints are staggered onto
 * different posts than the row below it (and the top board and top cap
 * continue that same alternation), so joints never all stack on one post
 * — except at a corner, which always forces every row to break there
 * regardless, since a board can't physically run past one. */
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
  const { boards, topBoard, topCap } = planBoardLayers(runs, posts, settings, topCapEnabled)

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
