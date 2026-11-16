import { calcHoleVolumeM3 } from "../structures/postRailCalc"
import { PlanPoint } from "./wallPlan"
import { LaborEstimate } from "../structures/types"
import { boardStockLengths, CalcSettings, findReferenceRow, planBoardOrder, postFitDiameterM, postSectionAreaM2, postWidthM } from "./calcSettings"
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

/** A post whose hole depth (below its own ground level, gravel base pad
 * included) has been set by hand.
 *
 * - "lone": just this post — one that has to go deeper than its
 *   neighbours, say. Nothing else changes.
 * - "rake": a point on the line of hole bottoms, the same way a hand-set
 *   top is a point on the top of the wall. Every post between two rake
 *   points has its hole bottom on the straight line between them; the two
 *   end posts anchor the line at their own worked-out depth unless they've
 *   been set too. */
export interface DepthPoint {
  depthM: number
  mode: "lone" | "rake"
}

/** Keyed by post index. */
export type DepthPoints = Record<number, DepthPoint>

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
  /** m, the widest centres the reference table allows here */
  tableMaxSpacingM: number
  /** bays the table alone would give this run */
  tableBayCount: number
  /** true when the post count or spacing was set by hand for this run */
  spacingOverridden: boolean
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
  /** m, how deep the hole is drilled below this post's ground level —
   * structural embedment plus the gravel base pad */
  embedmentM: number
  /** how this post's depth was set by hand, or null if it's worked out
   * (from the table, a uniform depth, or raked between "rake" posts) */
  depthSet: DepthPoint["mode"] | null
  /** what the reference table alone would give this post — the same as
   * sizeLabel/embedmentM unless a uniform override is in force */
  tableSizeLabel: string
  tableEmbedmentM: number
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
  /** of levelCourseCount, the courses from the bottom up that go in at
   * full height; any above that are cut down to fit under a raked top
   * board */
  fullCourseCount: number
  /** m, the top board's length across this bay — along the slope when
   * it's raked */
  topBoardLengthM: number
  /** rise over run of the top of the wall across this bay */
  topSlope: number
}

/** How one bay's boards stack between posts `a` and `b`. Level courses
 * always start from the lower of the two ground levels.
 *
 * Normally they stop at the last full course under the shorter post, and
 * the top board makes up whatever is left — level underneath, cut to the
 * rake on top.
 *
 * With a raked top board, the top board is a full-height board running
 * parallel to the top of the wall, and the level courses carry on up
 * until they meet its sloping underside — the ones that cross it are cut
 * down to suit. */
export function bayCourseLayout(a: ProfilePost, b: ProfilePost, boardCourseHeightM: number, rakedTopBoard: boolean) {
  const widthM = Math.abs(b.xM - a.xM)
  const riseM = b.topLevelM - a.topLevelM
  const baseLevelM = Math.min(a.groundLevelM, b.groundLevelM)
  const ch = boardCourseHeightM
  if (!rakedTopBoard) {
    const fullCourseCount = Math.max(0, Math.floor((Math.min(a.topLevelM, b.topLevelM) - baseLevelM) / ch + 1e-9))
    const levelTopM = baseLevelM + fullCourseCount * ch
    return { baseLevelM, courseCount: fullCourseCount, fullCourseCount, undersideAM: levelTopM, undersideBM: levelTopM, topBoardLengthM: widthM }
  }
  const slopeLengthM = Math.hypot(widthM, riseM)
  // a board `ch` wide laid on the slope is taller than `ch` measured plumb
  const dropM = widthM > 0 ? (ch * slopeLengthM) / widthM : ch
  const undersideAM = a.topLevelM - dropM
  const undersideBM = b.topLevelM - dropM
  const courseCount = Math.max(0, Math.ceil((Math.max(undersideAM, undersideBM) - baseLevelM) / ch - 1e-9))
  const fullCourseCount = Math.min(courseCount, Math.max(0, Math.floor((Math.min(undersideAM, undersideBM) - baseLevelM) / ch + 1e-9)))
  return { baseLevelM, courseCount, fullCourseCount, undersideAM, undersideBM, topBoardLengthM: slopeLengthM }
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
  /** cut pieces */
  count: number
  totalLengthM: number
  /** pieces that need cutting down along their length to fit under a
   * raked top board — only ever non-zero for the level courses */
  rakeCutCount: number
  /** m, each piece's length (post centre to post centre), in no order */
  pieceLengthsM: number[]
  /** the same pieces, each as the bay lengths it spans — where it could
   * be split at a post if a board that long can't be had */
  pieceBaysM: number[][]
  joints: BoardJoint[]
}

/** A hand-set post layout for one run, replacing the reference table's
 * spacing: either a fixed number of bays (posts thrown in or taken out —
 * always re-spaced evenly), or the widest centres to allow, which the
 * bay count is then worked out from as the run's length changes. */
export interface RunSpacing {
  bayCount?: number
  maxSpacingM?: number
}

/** most bays a single run can be given by hand */
const MAX_RUN_BAYS = 200

export interface ProfileOverrides {
  /** per run, in step with the segment lengths passed in; a missing or
   * null entry keeps that run on the table's spacing */
  runSpacing?: (RunSpacing | null | undefined)[] | null
  /** m — the auger the holes are actually being drilled with. Without
   * it, each hole is sized off its own post
   * (settings.holeDiameterMultiplier). */
  augerDiameterM?: number | null
  /** every post is this size, e.g. "150mm round" */
  postSizeLabel?: string | null
  /** m — every hole is drilled this deep below its post's ground level,
   * gravel base pad included */
  holeDepthM?: number | null
  /** hole depths set by hand on individual posts — see DepthPoint */
  depthPoints?: DepthPoints | null
  /** build option rather than an override: the top board is a full board
   * laid on the rake, with the level courses under it cut down to suit —
   * see bayCourseLayout */
  rakedTopBoard?: boolean
}

/** The materials and labour for a set of posts and bays — the whole
 * wall, or just one of its runs. */
export interface ProfileTotals {
  /** posts counted here, ascending (engineer-excluded ones left out) */
  postIndices: number[]
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
  /** m, shallowest and deepest hole */
  minHoleDepthM: number
  maxHoleDepthM: number
  /** true if any post is too big to drop into its hole (its diagonal is
   * wider than the hole) — only possible with a hand-picked auger */
  augerTooSmall: boolean
  /** posts whose overridden hole depth is shallower than the reference
   * table asks for at their height */
  shallowHolePostIndices: number[]
  /** posts whose overridden size is smaller than the table's */
  undersizedPostIndices: number[]
  /** regular level facing-board courses */
  boards: BoardLayerSummary
  /** the continuous perimeter/capping board along the very top of the
   * wall, following the rake — always present (one per valid bay) */
  topBoard: BoardLayerSummary
  /** an extra flat board laid over the top board/post tops for a
   * finished look and to protect end grain — null when not enabled */
  topCap: BoardLayerSummary | null
  /** what to buy, by stock length, for the facing courses and the top
   * board together (the same boards) — offcuts reused where they fit */
  boardOrder: { lengthM: number; count: number }[]
  /** the same for the top cap, a separate order; empty when not enabled */
  topCapOrder: { lengthM: number; count: number }[]
  totalBackfillVolumeM3: number
  labor: LaborEstimate
}

export interface WallProfile extends ProfileTotals {
  rlDatumM: number
  /** true when the top board is laid on the rake — see bayCourseLayout */
  rakedTopBoard: boolean
  /** one per straight run in plan, in order */
  segments: ProfileSegment[]
  posts: ProfilePost[]
  bays: ProfileBay[]
  /** the same breakdown for each run on its own, in step with
   * `segments`. A corner post is counted with the run it finishes (so
   * only wall A counts its own starting post) and setup time is left
   * out, which makes the runs add up to the whole-wall totals less
   * setup. */
  segmentTotals: ProfileTotals[]
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

/** Plans one ordered list of bays into pieces. Joins are the weak points
 * of a retaining wall, so every row uses as few pieces as will cover it:
 * a piece runs on across as many bays as the longest board allows
 * (`maxLengthM`) and only ever ends on a post, and a stretch of wall that
 * fits in one board is never joined.
 *
 * `phase` staggers the joins that are left, like coursed brickwork, so
 * they don't all stack on one post. Phase 0 lays full-length boards from
 * the start of the stretch, leaving the short piece at the far end;
 * phase 1 lays them from the far end back, leaving the short piece at
 * the start — the same number of pieces, with every join on a different
 * post. Only when that can't move the joins (the stretch is an exact
 * number of full boards) does a phase 1 row take one extra piece,
 * starting with a board about half the full length. */
function planPieces(bays: ProfileBay[], maxLengthM: number, phase: 0 | 1): { start: number; end: number }[] {
  const pieces: { start: number; end: number }[] = []
  const fits = (lengthM: number) => lengthM <= maxLengthM + 1e-6
  // full-length boards from bay `first`, working toward bay `last`
  const fromStart = (first: number, last: number) => {
    const out: { start: number; end: number }[] = []
    let i = first
    while (i <= last) {
      let end = i
      let length = bays[i].widthM
      while (end < last && fits(length + bays[end + 1].widthM)) length += bays[++end].widthM
      out.push({ start: i, end })
      i = end + 1
    }
    return out
  }
  // the same, from bay `last` working back toward bay `first`
  const fromEnd = (first: number, last: number) => {
    const out: { start: number; end: number }[] = []
    let i = last
    while (i >= first) {
      let start = i
      let length = bays[i].widthM
      while (start > first && fits(length + bays[start - 1].widthM)) length += bays[--start].widthM
      out.unshift({ start, end: i })
      i = start - 1
    }
    return out
  }

  let i = 0
  while (i < bays.length) {
    // the unbroken stretch starting here (the row may skip bays that are
    // too low to have this course)
    let last = i
    while (last + 1 < bays.length && bays[last + 1].leftIndex === bays[last].rightIndex) last++
    const forward = fromStart(i, last)
    if (phase === 0 || forward.length === 1) pieces.push(...forward)
    else {
      const backward = fromEnd(i, last)
      const moved = backward.length !== forward.length || backward.some((p, k) => p.end !== forward[k].end)
      if (moved) pieces.push(...backward)
      else {
        const half = Math.max(1, Math.floor((forward[0].end - i + 1) / 2))
        pieces.push({ start: i, end: i + half - 1 }, ...fromStart(i + half, last))
      }
    }
    i = last + 1
  }
  return pieces
}

type LayerAgg = { totalLengthM: number; rakeCutCount: number; pieceLengthsM: number[]; pieceBaysM: number[][]; joints: BoardJoint[] }

/** Folds a planned piece list into running totals plus the joints between
 * consecutive pieces that butt up on a shared post. `levelAtPost` gives
 * the height to draw that joint at, specific to which layer/row it's on. */
function accumulatePieces(
  agg: LayerAgg,
  bays: ProfileBay[],
  pieces: { start: number; end: number }[],
  levelAtPost: (postIndex: number) => number,
  layer: BoardJoint["layer"],
  lengthOf: (bay: ProfileBay) => number = (bay) => bay.widthM,
  isRakeCut: (bay: ProfileBay) => boolean = () => false
) {
  pieces.forEach((p, idx) => {
    let lengthM = 0
    let rakeCut = false
    const baysM: number[] = []
    for (let i = p.start; i <= p.end; i++) {
      baysM.push(lengthOf(bays[i]))
      lengthM += lengthOf(bays[i])
      if (isRakeCut(bays[i])) rakeCut = true
    }
    if (rakeCut) agg.rakeCutCount++
    agg.pieceLengthsM.push(lengthM)
    agg.pieceBaysM.push(baysM)
    agg.totalLengthM += lengthM
    const next = pieces[idx + 1]
    if (next && bays[next.start].leftIndex === bays[p.end].rightIndex) {
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
  topCapEnabled: boolean,
  rakedTopBoard: boolean
): { boards: BoardLayerSummary; topBoard: BoardLayerSummary; topCap: BoardLayerSummary | null } {
  const newAgg = (): LayerAgg => ({ totalLengthM: 0, rakeCutCount: 0, pieceLengthsM: [], pieceBaysM: [], joints: [] })
  const courseAgg = newAgg()
  const topBoardAgg = newAgg()
  const topCapAgg = newAgg()
  const ch = settings.boardCourseHeightM
  const stocks = boardStockLengths(settings)
  const maxLengthM = stocks[stocks.length - 1]
  // schematic cap thickness, kept in sync with the diagram's own constant
  const capThicknessM = ch * 0.25

  for (const run of runs) {
    const maxCourses = Math.max(0, ...run.map((b) => b.levelCourseCount))
    for (let k = 0; k < maxCourses; k++) {
      const rowBays = run.filter((b) => b.levelCourseCount > k)
      const pieces = planPieces(rowBays, maxLengthM, (k % 2) as 0 | 1)
      accumulatePieces(
        courseAgg,
        rowBays,
        pieces,
        (postIndex) => posts[postIndex].groundLevelM + (k + 0.5) * ch,
        "course",
        undefined,
        (bay) => k >= bay.fullCourseCount
      )
    }

    // continue the alternation up from wherever the level courses left off,
    // so the top board's joint doesn't land back on the same post as the
    // course immediately below it
    // A raked top board is one straight board on the slope, so it can't
    // carry on past a post where the rake changes — it's joined (mitred)
    // there. Otherwise the top board is cut to the rake bay by bay and
    // can run straight through.
    const stretches: ProfileBay[][] = []
    for (const bay of run) {
      const stretch = stretches[stretches.length - 1]
      const sameRake = stretch && Math.abs(stretch[stretch.length - 1].topSlope - bay.topSlope) < 1e-4
      if (stretch && (!rakedTopBoard || sameRake)) stretch.push(bay)
      else stretches.push([bay])
    }
    stretches.forEach((stretch, idx) => {
      const topBoardPieces = planPieces(stretch, maxLengthM, (maxCourses % 2) as 0 | 1)
      accumulatePieces(topBoardAgg, stretch, topBoardPieces, (postIndex) => posts[postIndex].topLevelM, "topBoard", (bay) => bay.topBoardLengthM)
      if (idx < stretches.length - 1) {
        const postIndex = stretch[stretch.length - 1].rightIndex
        topBoardAgg.joints.push({ postIndex, levelM: posts[postIndex].topLevelM, layer: "topBoard" })
      }
    })

    if (topCapEnabled) {
      const capPieces = planPieces(run, maxLengthM, ((maxCourses + 1) % 2) as 0 | 1)
      accumulatePieces(topCapAgg, run, capPieces, (postIndex) => posts[postIndex].topLevelM + capThicknessM, "topCap")
    }
  }

  const finalize = (agg: LayerAgg): BoardLayerSummary => ({
    count: agg.pieceLengthsM.length,
    totalLengthM: agg.totalLengthM,
    rakeCutCount: agg.rakeCutCount,
    pieceLengthsM: agg.pieceLengthsM,
    pieceBaysM: agg.pieceBaysM,
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

const resolveBayCount = (lengthM: number, tableMaxSpacingM: number, spacing: RunSpacing | null | undefined): number => {
  if (spacing?.bayCount && spacing.bayCount >= 1) return Math.min(MAX_RUN_BAYS, Math.round(spacing.bayCount))
  if (spacing?.maxSpacingM && spacing.maxSpacingM > 0) return Math.min(MAX_RUN_BAYS, bayCountFor(lengthM, spacing.maxSpacingM))
  return bayCountFor(lengthM, tableMaxSpacingM)
}

/** Bay count per run for a given shape — two shapes with the same counts
 * have the same post indices, so hand-set post levels (keyed by index)
 * stay valid when moving between them. */
export function segmentBayCounts(
  segmentLengthsM: number[],
  retainedHeightM: number,
  soil: SoilType,
  settings: CalcSettings,
  runSpacing: (RunSpacing | null | undefined)[] | null = null
): number[] {
  if (!(retainedHeightM > 0)) return []
  const { maxSpacingM } = findReferenceRow(settings, Math.min(retainedHeightM, ENGINEER_HEIGHT_LIMIT_M), soil)
  return segmentLengthsM
    .map((l, i) => ({ l, spacing: runSpacing?.[i] }))
    .filter((r) => r.l > 0)
    .map((r) => resolveBayCount(r.l, maxSpacingM, r.spacing))
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
 * divide: a course breaks at any corner post (a board can't physically
 * run past one) and at any excluded bay, and in between each board runs
 * on over as many posts as the longest stock length allows — fewer
 * joints is stronger. Where a stretch is too long for one board, each
 * row's joints are staggered onto different posts than the row below it
 * (and the top board and top cap continue that same alternation), so
 * joints never all stack on one post. */
export function buildWallProfile(
  segmentLengthsM: number[],
  retainedHeightM: number,
  soil: SoilType,
  controlPoints: ControlPoints,
  topCapEnabled: boolean,
  rlDatumM: number,
  settings: CalcSettings,
  overrides: ProfileOverrides = {}
): WallProfile | null {
  const augerDiameterM = overrides.augerDiameterM && overrides.augerDiameterM > 0 ? overrides.augerDiameterM : null
  const postSizeOverride = overrides.postSizeLabel || null
  const holeDepthOverrideM = overrides.holeDepthM && overrides.holeDepthM > 0 ? overrides.holeDepthM : null
  const rakedTopBoard = Boolean(overrides.rakedTopBoard)
  const runsIn = segmentLengthsM.map((l, i) => ({ l, spacing: overrides.runSpacing?.[i] })).filter((r) => r.l > 0)
  const runLengthsM = runsIn.map((r) => r.l)
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
    const spacing = runsIn[index].spacing
    const tableBayCount = bayCountFor(lengthM, layoutRow.maxSpacingM)
    const bayCount = resolveBayCount(lengthM, layoutRow.maxSpacingM, spacing)
    const startPostIndex = postXs.length - 1
    for (let k = 1; k <= bayCount; k++) postXs.push(runStartXM + (lengthM * k) / bayCount)
    const endPostIndex = postXs.length - 1
    segments.push({ index, startPostIndex, endPostIndex, startXM: runStartXM, endXM: runStartXM + lengthM, lengthM,
      postSpacingM: lengthM / bayCount,
      tableMaxSpacingM: layoutRow.maxSpacingM,
      tableBayCount,
      spacingOverridden: Boolean((spacing?.bayCount && spacing.bayCount >= 1) || (spacing?.maxSpacingM && spacing.maxSpacingM > 0)),
    })
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
    const tableSizeLabel = row.postSizeLabel
    const tableEmbedmentM = Math.max(0.01, localHeightM) * row.embedmentRatio + settings.gravelBaseAllowanceM
    const sizeLabel = postSizeOverride ?? tableSizeLabel
    const widthM = postWidthM(sizeLabel)
    const embedmentM = holeDepthOverrideM ?? tableEmbedmentM
    const holeDiameterM = augerDiameterM ?? widthM * settings.holeDiameterMultiplier
    const holeVolumeM3 = calcHoleVolumeM3(holeDiameterM, embedmentM)
    // the post stops on top of the gravel base pad, so concrete only
    // fills the hole above the pad, around the post
    const concreteDepthM = Math.max(0, embedmentM - settings.gravelBaseAllowanceM)
    const concreteVolumeM3 = Math.max(0, calcHoleVolumeM3(holeDiameterM, concreteDepthM) - postSectionAreaM2(sizeLabel) * concreteDepthM)
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
      depthSet: null,
      tableSizeLabel,
      tableEmbedmentM,
      holeDiameterM,
      holeVolumeM3,
      concreteVolumeM3,
    }
  })

  // hand-set hole depths, applied over the worked-out ones above
  const depthPoints = overrides.depthPoints ?? {}
  const setDepth = (p: ProfilePost, depthM: number, depthSet: ProfilePost["depthSet"]) => {
    p.embedmentM = Math.max(0.05, depthM)
    p.depthSet = depthSet
    p.holeVolumeM3 = calcHoleVolumeM3(p.holeDiameterM, p.embedmentM)
    const concreteDepthM = Math.max(0, p.embedmentM - settings.gravelBaseAllowanceM)
    p.concreteVolumeM3 = Math.max(0, calcHoleVolumeM3(p.holeDiameterM, concreteDepthM) - postSectionAreaM2(p.sizeLabel) * concreteDepthM)
  }
  const validDepth = (i: number) => {
    const d = depthPoints[i]
    return d && d.depthM > 0 ? d : null
  }
  const rakeIndices = posts.map((p) => p.index).filter((i) => validDepth(i)?.mode === "rake")
  if (rakeIndices.length > 0) {
    // the line of hole bottoms: through every rake point, anchored at
    // each end of the wall on that end post's own worked-out bottom
    const anchor = new Map<number, number>() // post index -> bottom level, m
    anchor.set(0, posts[0].groundLevelM - posts[0].embedmentM)
    anchor.set(lastIndex, posts[lastIndex].groundLevelM - posts[lastIndex].embedmentM)
    for (const i of rakeIndices) anchor.set(i, posts[i].groundLevelM - depthPoints[i].depthM)
    const anchorIndices = Array.from(anchor.keys()).sort((a, b) => a - b)
    for (const p of posts) {
      if (anchor.has(p.index)) continue
      const before = [...anchorIndices].reverse().find((i) => i < p.index)!
      const after = anchorIndices.find((i) => i > p.index)!
      const span = posts[after].xM - posts[before].xM
      const t = span > 0 ? (p.xM - posts[before].xM) / span : 0
      const bottomM = anchor.get(before)! + (anchor.get(after)! - anchor.get(before)!) * t
      setDepth(p, p.groundLevelM - bottomM, null)
    }
    for (const i of rakeIndices) setDepth(posts[i], depthPoints[i].depthM, "rake")
  }
  for (const p of posts) {
    const d = validDepth(p.index)
    if (d?.mode === "lone") setDepth(p, d.depthM, "lone")
  }

  const bays: ProfileBay[] = []
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i]
    const b = posts[i + 1]
    const needsEngineer = a.needsEngineer || b.needsEngineer
    const heightM = Math.max(a.retainedHeightM, b.retainedHeightM)
    const widthM = b.xM - a.xM
    const layout = bayCourseLayout(a, b, settings.boardCourseHeightM, rakedTopBoard)
    const levelCourseCount = needsEngineer ? 0 : layout.courseCount
    bays.push({
      leftIndex: a.index,
      rightIndex: b.index,
      widthM,
      heightM,
      needsEngineer,
      levelCourseCount,
      levelBoardLengthM: needsEngineer ? 0 : widthM * levelCourseCount,
      fullCourseCount: needsEngineer ? 0 : layout.fullCourseCount,
      topBoardLengthM: layout.topBoardLengthM,
      topSlope: widthM > 0 ? (b.topLevelM - a.topLevelM) / widthM : 0,
    })
  }

  const totalsFor = (countedPosts: ProfilePost[], countedBays: ProfileBay[], setupHours: number): ProfileTotals => {
    const validPosts = countedPosts.filter((p) => !p.needsEngineer)
    const sizeCounts = new Map<string, number>()
    for (const p of validPosts) sizeCounts.set(p.sizeLabel, (sizeCounts.get(p.sizeLabel) ?? 0) + 1)

    const validBays = countedBays.filter((b) => !b.needsEngineer)
    const runs = groupIntoRuns(validBays, posts)
    const { boards, topBoard, topCap } = planBoardLayers(runs, posts, settings, topCapEnabled, rakedTopBoard)

    const totalBackfillVolumeM3 = validBays.reduce((sum, b) => sum + b.widthM * b.heightM * settings.backfillThicknessM, 0)
    const totalBoardCount = boards.count + topBoard.count + (topCap?.count ?? 0)
    const postsHours = validPosts.length * settings.hoursPerPost
    const railsHours = totalBoardCount * settings.hoursPerBoard
    const infillHours = totalBackfillVolumeM3 * settings.hoursPerM3Backfill
    const depths = validPosts.map((p) => p.embedmentM)

    return {
      postIndices: validPosts.map((p) => p.index),
      postsBySize: Array.from(sizeCounts.entries()).map(([sizeLabel, count]) => ({ sizeLabel, count })),
      totalFillVolumeM3: validPosts.reduce((sum, p) => sum + p.holeVolumeM3, 0),
      totalConcreteVolumeM3: validPosts.reduce((sum, p) => sum + p.concreteVolumeM3, 0),
      totalGravelBaseVolumeM3: validPosts.reduce(
        (sum, p) => sum + calcHoleVolumeM3(p.holeDiameterM, Math.min(settings.gravelBaseAllowanceM, p.embedmentM)),
        0
      ),
      holeDiametersM: Array.from(new Set(validPosts.map((p) => Math.round(p.holeDiameterM * 1000) / 1000))).sort((a, b) => a - b),
      minHoleDepthM: depths.length ? Math.min(...depths) : 0,
      maxHoleDepthM: depths.length ? Math.max(...depths) : 0,
      augerTooSmall: validPosts.some((p) => postFitDiameterM(p.sizeLabel) > p.holeDiameterM + 1e-9),
      shallowHolePostIndices: validPosts.filter((p) => p.embedmentM < p.tableEmbedmentM - 1e-6).map((p) => p.index),
      undersizedPostIndices: validPosts.filter((p) => p.widthM < postWidthM(p.tableSizeLabel) - 1e-6).map((p) => p.index),
      boards,
      topBoard,
      topCap,
      boardOrder: planBoardOrder([...boards.pieceBaysM, ...topBoard.pieceBaysM], boardStockLengths(settings)),
      topCapOrder: topCap ? planBoardOrder(topCap.pieceBaysM, boardStockLengths(settings)) : [],
      totalBackfillVolumeM3,
      labor: {
        setupHours,
        postsHours,
        railsHours,
        infillHours,
        totalHours: setupHours + postsHours + railsHours + infillHours,
      },
    }
  }

  return {
    ...totalsFor(posts, bays, settings.setupHours),
    rlDatumM,
    rakedTopBoard,
    segments,
    posts,
    bays,
    segmentTotals: segments.map((seg) =>
      totalsFor(
        // the corner post a run starts on belongs to the run before it
        posts.filter((p) => p.index <= seg.endPostIndex && (seg.index === 0 ? p.index >= seg.startPostIndex : p.index > seg.startPostIndex)),
        bays.filter((b) => b.leftIndex >= seg.startPostIndex && b.rightIndex <= seg.endPostIndex),
        0
      )
    ),
    engineerPostIndices: posts.filter((p) => p.needsEngineer).map((p) => p.index),
  }
}
