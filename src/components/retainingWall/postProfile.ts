import { calcHoleVolumeM3 } from "../structures/postRailCalc"
import { PlanPoint } from "./wallPlan"
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

/** Keyed by post index; presence (true) marks that post as a corner.
 * Corners now come from the plan (every interior plan vertex gets a
 * shared corner post — see buildWallProfile), so this is only still
 * written to saved designs for older readers, and read back to rebuild a
 * plan for designs saved before plans existed (see legacyPlan). */
export type CornerPosts = Record<number, true>

/** One straight run of the wall between two plan vertices — "Wall A",
 * "Wall B"… Its two end posts are shared with its neighbours. */
export interface ProfileSegment {
  index: number
  startPostIndex: number
  endPostIndex: number
  /** m, along the unfolded wall */
  startXM: number
  endXM: number
  lengthM: number
  /** m, this run's own even post centres */
  postSpacingM: number
}

export interface ProfilePost {
  index: number
  /** m, position along the unfolded wall (corners flattened out) */
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
  /** m³, the whole drilled hole */
  holeVolumeM3: number
  /** m³, what actually gets poured: the hole above the gravel base pad,
   * less the space the post itself takes up */
  concreteVolumeM3: number
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
  /** one per straight run in plan, in order */
  segments: ProfileSegment[]
  posts: ProfilePost[]
  bays: ProfileBay[]
  postsBySize: { sizeLabel: string; count: number }[]
  totalFillVolumeM3: number
  /** m³, concrete to order before any waste allowance — every hole above
   * its gravel base pad, less the posts' own volume */
  totalConcreteVolumeM3: number
  /** m³, the gravel base pads under the posts */
  totalGravelBaseVolumeM3: number
  /** distinct hole diameters in use, m, ascending — one value when an
   * auger size is set, otherwise one per post size */
  holeDiametersM: number[]
  /** true if any post is too big to drop into its hole (its diagonal is
   * wider than the hole) — only possible with a hand-picked auger */
  augerTooSmall: boolean
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

/** Bays needed to cover one straight run at no more than maxSpacingM
 * centres. The epsilon keeps a run that's an exact multiple of the
 * spacing from tipping into one extra bay on floating-point noise. */
const bayCountFor = (lengthM: number, maxSpacingM: number): number => Math.max(1, Math.ceil(lengthM / maxSpacingM - 1e-9))

/** Bay count per run for a given shape — two shapes with the same counts
 * have the same post indices, so hand-set post levels (keyed by index)
 * stay valid when moving between them. */
export function segmentBayCounts(segmentLengthsM: number[], retainedHeightM: number, soil: SoilType, settings: CalcSettings): number[] {
  if (!(retainedHeightM > 0)) return []
  const { maxSpacingM } = findReferenceRow(settings, Math.min(retainedHeightM, ENGINEER_HEIGHT_LIMIT_M), soil)
  return segmentLengthsM.filter((l) => l > 0).map((l) => bayCountFor(l, maxSpacingM))
}

/** Rebuilds a plan for a design saved before plans existed: a straight
 * wall, with a (still in-line) plan vertex at each post that had been
 * flagged as a corner — which reproduces the same posts at the same
 * indices, so the design's hand-set levels still land on the right ones. */
export function legacyPlan(
  wallLengthM: number,
  retainedHeightM: number,
  soil: SoilType,
  cornerPosts: CornerPosts,
  settings: CalcSettings
): PlanPoint[] {
  const { maxSpacingM } = findReferenceRow(settings, Math.min(retainedHeightM, ENGINEER_HEIGHT_LIMIT_M), soil)
  const bayCount = bayCountFor(wallLengthM, maxSpacingM)
  const cornerXs = Object.keys(cornerPosts)
    .map(Number)
    .filter((i) => i > 0 && i < bayCount)
    .sort((a, b) => a - b)
    .map((i) => (wallLengthM * i) / bayCount)
  return [0, ...cornerXs, wallLengthM].map((xM) => ({ xM, yM: 0 }))
}

/** Builds the full per-post, per-bay profile for a raked (or, with no
 * control points set, perfectly uniform) wall, unfolded flat: the wall's
 * straight runs (from the plan) laid end to end. Each run is spaced out
 * on its own — evenly, no wider than the reference table's centres for
 * the base retainedHeightM/soil — with one shared corner post wherever
 * two runs meet; it's each post's own size/embedment/hole and each bay's
 * own board coursing that varies with the local height. Any post or bay whose local height is
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
  segmentLengthsM: number[],
  retainedHeightM: number,
  soil: SoilType,
  controlPoints: ControlPoints,
  topCapEnabled: boolean,
  rlDatumM: number,
  settings: CalcSettings,
  /** m — the auger the holes are actually being drilled with. Every hole
   * is this diameter regardless of post size; without it, each hole is
   * sized off its own post (settings.holeDiameterMultiplier). */
  augerDiameterM: number | null = null
): WallProfile | null {
  const runLengthsM = segmentLengthsM.filter((l) => l > 0)
  if (runLengthsM.length === 0 || !(retainedHeightM > 0)) return null

  const layoutRow = findReferenceRow(settings, Math.min(retainedHeightM, ENGINEER_HEIGHT_LIMIT_M), soil)

  // lay every run out end to end: each run's first post is the previous
  // run's last (the shared corner post), so only the very first run
  // contributes its own starting post
  const postXs: number[] = [0]
  const cornerIndices = new Set<number>()
  const segments: ProfileSegment[] = []
  let runStartXM = 0
  runLengthsM.forEach((lengthM, index) => {
    const bayCount = bayCountFor(lengthM, layoutRow.maxSpacingM)
    const startPostIndex = postXs.length - 1
    for (let k = 1; k <= bayCount; k++) postXs.push(runStartXM + (lengthM * k) / bayCount)
    const endPostIndex = postXs.length - 1
    segments.push({ index, startPostIndex, endPostIndex, startXM: runStartXM, endXM: runStartXM + lengthM, lengthM, postSpacingM: lengthM / bayCount })
    if (index < runLengthsM.length - 1) cornerIndices.add(endPostIndex)
    runStartXM += lengthM
  })
  const postCount = postXs.length

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
    const holeDiameterM = augerDiameterM && augerDiameterM > 0 ? augerDiameterM : widthM * settings.holeDiameterMultiplier
    const holeVolumeM3 = calcHoleVolumeM3(holeDiameterM, embedmentM)
    // the post stops on top of the gravel base pad, so concrete only
    // fills the hole above the pad, around the post
    const concreteDepthM = Math.max(0, embedmentM - settings.gravelBaseAllowanceM)
    const concreteVolumeM3 = Math.max(0, calcHoleVolumeM3(holeDiameterM, concreteDepthM) - widthM * widthM * concreteDepthM)
    return {
      index: i,
      xM: postXs[i],
      groundLevelM,
      topLevelM,
      retainedHeightM: localHeightM,
      isControlPoint: Boolean(controlPoints[i]),
      isCorner: cornerIndices.has(i),
      needsEngineer,
      sizeLabel,
      widthM,
      embedmentM,
      holeDiameterM,
      holeVolumeM3,
      concreteVolumeM3,
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
    segments,
    posts,
    bays,
    postsBySize: Array.from(sizeCounts.entries()).map(([sizeLabel, count]) => ({ sizeLabel, count })),
    totalFillVolumeM3,
    totalConcreteVolumeM3: validPosts.reduce((sum, p) => sum + p.concreteVolumeM3, 0),
    totalGravelBaseVolumeM3: validPosts.reduce(
      (sum, p) => sum + calcHoleVolumeM3(p.holeDiameterM, Math.min(settings.gravelBaseAllowanceM, p.embedmentM)),
      0
    ),
    holeDiametersM: Array.from(new Set(validPosts.map((p) => Math.round(p.holeDiameterM * 1000) / 1000))).sort((a, b) => a - b),
    augerTooSmall: validPosts.some((p) => p.widthM * Math.SQRT2 > p.holeDiameterM + 1e-9),
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
