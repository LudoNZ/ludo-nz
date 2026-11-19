import { calcHoleVolumeM3 } from "../structures/postRailCalc"
import { PlanPoint } from "./wallPlan"
import { LaborEstimate } from "../structures/types"
import { boardStockLengths, CalcSettings, findReferenceRow, planBoardOrder, postFitDiameterM, postSectionAreaM2, postWidthM } from "./calcSettings"
import { ENGINEER_HEIGHT_LIMIT_M, SoilType } from "./retainingWallCalc"
import { clearanceAnchors, holeClashes, Obstruction, ObstructionType, obstructionZone, ObstructionZone } from "./obstructions"

/** A post whose ground level and/or top-of-post level has been set by
 * hand, in metres relative to the RL datum (0 = datum). Every other post
 * "rakes" — linearly interpolates — between whichever control points
 * bound it; a post before the first or after the last control point just
 * holds flat at the nearest one. */
export interface ControlPoint {
  groundLevelM: number
  topLevelM: number
  /** corner posts only: the level the wall *after* the corner starts at,
   * when it isn't the same as the wall before it (`topLevelM`). The
   * change happens at the corner post, which stands at the taller of the
   * two. Left out when both walls meet at the same height. */
  topAfterLevelM?: number
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
  /** m, this run's average post centres (its length over its bays) */
  postSpacingM: number
  /** m, its widest bay */
  maxBayM: number
  /** true when every bay is the same width (nothing forces a post in) */
  evenlySpaced: boolean
  /** fixed posts (slots in RunSpacing.fixedPosts) that couldn't be used */
  ignoredFixed: number[]
  /** m, the widest centres the reference table allows here */
  tableMaxSpacingM: number
  /** bays the table alone would give this run */
  tableBayCount: number
  /** true when the post count or spacing was set by hand for this run */
  spacingOverridden: boolean
  /** true when this run's top steps down/up at the posts, a whole number
   * of board courses per bay, instead of following the rake in a line */
  stepped: boolean
  /** true when its bay heights were set by hand (otherwise they're
   * worked out from the rake) */
  stepsEdited: boolean
}

export interface ProfilePost {
  index: number
  /** m, position along the unfolded wall (corners flattened out) */
  xM: number
  /** m, relative to the RL datum */
  groundLevelM: number
  /** the top of the post itself — the taller of the two sides at a corner
   * where the walls meet at different heights */
  topLevelM: number
  /** the level the wall on this post's left (before it) comes up to, and
   * the wall on its right goes on from. Equal to topLevelM everywhere but
   * at a corner whose two walls meet at different heights. */
  topBeforeM: number
  topAfterM: number
  /** topLevelM - groundLevelM */
  retainedHeightM: number
  isControlPoint: boolean
  isCorner: boolean
  /** set when this post is pinned at a distance from one end of its run:
   * which run, and its slot in that run's RunSpacing.fixedPosts */
  fixed: { segmentIndex: number; slot: number } | null
  /** the obstruction this post was put in beside, to keep clear of it */
  clearOf: string | null
  /** obstructions whose clearance zone this post's hole reaches into */
  clashesWith: string[]
  /** true if this post's local retained height is outside DIY territory
   * (over the limit, or <= 0) — its own numbers below are still computed
   * (so the diagram can draw it and flag it), but it's excluded from every
   * materials/labour total */
  needsEngineer: boolean
  sizeLabel: string
  widthM: number
  /** true when this post's size was picked by hand for it alone */
  sizeSet: boolean
  /** the size and hole diameter this post would have without its own
   * size — what the rest of the wall works out to here */
  wallSizeLabel: string
  wallHoleDiameterM: number
  /** true when this post's hole has its own auger size */
  holeSet: boolean
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
  /** m, how far the post itself goes below ground: the hole, less the
   * gravel base pad and any stand-off (the gap left under the post, which
   * is filled with concrete) */
  postDepthM: number
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
  /** m, how far a board covering this bay runs past the bay's own post
   * centres: half the end post's width where the bay is the first or
   * last of an unbroken run (a wall end, a corner, or the edge of an
   * excluded stretch), since a board there runs to the post's outside
   * face rather than stopping at its centre. 0 for a bay mid-run. */
  boardOverrunM: number
  /** m, a level course's board length across this bay: post centre to
   * post centre, plus boardOverrunM */
  boardLengthM: number
  /** m, the top board's length across this bay — along the slope when
   * it's raked — including boardOverrunM */
  topBoardLengthM: number
  /** rise over run of the top of the wall across this bay */
  topSlope: number
  /** m — for a bay in a stepped run, the level top of its boards: the
   * bay is `levelCourseCount` whole courses high, every one of them a
   * level course (there's no separate top board). null otherwise. */
  stepTopM: number | null
  /** courses high, for a bay in a stepped run (even if it's excluded for
   * needing an engineer, when levelCourseCount is 0); null otherwise */
  stepCourseCount: number | null
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
  // this bay's own tops: the left post's right-hand side, the right
  // post's left-hand side (they differ from the post's own top only at a
  // corner where the walls meet at different heights)
  const topAM = a.topAfterM
  const topBM = b.topBeforeM
  const riseM = topBM - topAM
  const baseLevelM = Math.min(a.groundLevelM, b.groundLevelM)
  const ch = boardCourseHeightM
  if (!rakedTopBoard) {
    const fullCourseCount = Math.max(0, Math.floor((Math.min(topAM, topBM) - baseLevelM) / ch + 1e-9))
    const levelTopM = baseLevelM + fullCourseCount * ch
    return { baseLevelM, courseCount: fullCourseCount, fullCourseCount, undersideAM: levelTopM, undersideBM: levelTopM, topBoardLengthM: widthM }
  }
  const slopeLengthM = Math.hypot(widthM, riseM)
  // a board `ch` wide laid on the slope is taller than `ch` measured plumb
  const dropM = widthM > 0 ? (ch * slopeLengthM) / widthM : ch
  const undersideAM = topAM - dropM
  const undersideBM = topBM - dropM
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
  /** where each of those pieces sits, in step with pieceBaysM: the post
   * it starts on, and which level course it's in counting up from 0 at
   * the bottom (-1 for a layer with no rows — the top board, the cap) */
  pieceInfo: { postIndex: number; row: number }[]
  joints: BoardJoint[]
}

/** A hand-set post layout for one run, replacing the reference table's
 * spacing: either a fixed number of bays (posts thrown in or taken out —
 * always re-spaced evenly), or the widest centres to allow, which the
 * bay count is then worked out from as the run's length changes. */
export interface RunSpacing {
  bayCount?: number
  maxSpacingM?: number
  /** posts pinned at a set distance from one end of the run — the posts
   * between them (and the run's ends) are spread evenly as usual */
  fixedPosts?: FixedPost[]
}

/** A post held at `distanceM` from the run's start or end post, measured
 * centre to centre. Measured from one chosen end, so changing the far
 * end of the wall leaves it where it is. */
export interface FixedPost {
  from: "start" | "end"
  distanceM: number
}

/** closest two pinned posts can be, or one to a run's end post */
export const MIN_FIXED_GAP_M = 0.1

/** A post forced in at a set place along a run, either pinned by hand
 * (`fixed`, its slot in RunSpacing.fixedPosts) or put in to keep clear of
 * something in the ground (`clear`, the obstruction's id). */
export type RunAnchorTag = { kind: "fixed"; slot: number } | { kind: "clear"; obstructionId: string }

export interface RunLayout {
  /** m from the run's start, every post after its first — the last one
   * is the run's end post, at its full length */
  offsetsM: number[]
  /** in step with offsetsM: why that post is where it is, if it's forced */
  tags: (RunAnchorTag | null)[]
  /** slots of fixed posts that couldn't be used: past the end of the
   * run, or too close to its end or to another fixed post */
  ignoredFixed: number[]
}

/** Where the posts go along one straight run: forced posts (pinned by
 * hand, or put in either side of an obstruction) split it into stretches,
 * and each stretch is spread out evenly — no wider than the spacing in
 * force, or, with a post count set, that many bays shared out so the
 * widest bay is as narrow as it can be. */
export function layoutRun(
  lengthM: number,
  tableMaxSpacingM: number,
  spacing: RunSpacing | null | undefined,
  extraAnchors: { atM: number; tag: RunAnchorTag }[] = []
): RunLayout {
  const wanted: { atM: number; tag: RunAnchorTag }[] = [
    ...(spacing?.fixedPosts ?? []).map((f, slot) => ({
      atM: f.from === "end" ? lengthM - f.distanceM : f.distanceM,
      tag: { kind: "fixed", slot } as RunAnchorTag,
    })),
    ...extraAnchors,
  ].sort((a, b) => a.atM - b.atM)
  const anchors: { atM: number; tag: RunAnchorTag }[] = []
  const ignoredFixed: number[] = []
  for (const a of wanted) {
    const prev = anchors.length ? anchors[anchors.length - 1].atM : 0
    const ok = Number.isFinite(a.atM) && a.atM - prev >= MIN_FIXED_GAP_M - 1e-9 && lengthM - a.atM >= MIN_FIXED_GAP_M - 1e-9
    if (ok) anchors.push(a)
    else if (a.tag.kind === "fixed") ignoredFixed.push(a.tag.slot)
  }
  const breaks = [0, ...anchors.map((a) => a.atM), lengthM]
  const spans = breaks.slice(1).map((b, i) => b - breaks[i])
  // the stretch between the two posts either side of an obstruction is
  // one bay, bridging it — a post in the middle would land in it
  const bridged = spans.map((_, i) => {
    const a = anchors[i - 1]?.tag
    const b = anchors[i]?.tag
    return a?.kind === "clear" && b?.kind === "clear" && a.obstructionId === b.obstructionId
  })

  let bays: number[]
  if (spacing?.bayCount && spacing.bayCount >= 1) {
    // that many bays in all (at least one per stretch), each one added
    // where it narrows the widest bay most
    const total = Math.min(MAX_RUN_BAYS, Math.max(spans.length, Math.round(spacing.bayCount)))
    bays = spans.map(() => 1)
    for (let n = spans.length; n < total; n++) {
      let widest = -1
      spans.forEach((len, i) => {
        if (!bridged[i] && (widest < 0 || len / bays[i] > spans[widest] / bays[widest] + 1e-9)) widest = i
      })
      if (widest < 0) break
      bays[widest]++
    }
  } else {
    const maxM = spacing?.maxSpacingM && spacing.maxSpacingM > 0 ? spacing.maxSpacingM : tableMaxSpacingM
    bays = spans.map((len, i) => (bridged[i] ? 1 : Math.min(MAX_RUN_BAYS, bayCountFor(len, maxM))))
  }

  const offsetsM: number[] = []
  const tags: (RunAnchorTag | null)[] = []
  spans.forEach((len, i) => {
    for (let k = 1; k <= bays[i]; k++) {
      offsetsM.push(k === bays[i] ? breaks[i + 1] : breaks[i] + (len * k) / bays[i])
      tags.push(k === bays[i] && i < anchors.length ? anchors[i].tag : null)
    }
  })
  return { offsetsM, tags, ignoredFixed }
}

/** most bays a single run can be given by hand */
const MAX_RUN_BAYS = 200

export interface ProfileOverrides {
  /** per run, in step with the segment lengths passed in: true = the top
   * of that run steps at the posts instead of following the rake */
  steppedWalls?: (boolean | null | undefined)[] | null
  /** hand-set courses per bay of a stepped run, keyed by the bay's left
   * post index. A run with none of its bays here is worked out from the
   * rake — the nearest whole number of courses to its height mid-bay. */
  bayCourses?: Record<number, number> | null
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
  /** build option: boards run to the outside face of the post at each
   * end of a wall (the default) rather than stopping at its centre —
   * see ProfileBay.boardOverrunM. Only `false` turns it off. */
  boardsToPostOutside?: boolean
  /** hole depths set by hand on individual posts — see DepthPoint */
  depthPoints?: DepthPoints | null
  /** build option rather than an override: the top board is a full board
   * laid on the rake, with the level courses under it cut down to suit —
   * see bayCourseLayout */
  rakedTopBoard?: boolean
  /** m — the post is held this far up off the gravel base pad, and the
   * gap under it filled with concrete (0 = it stands on the pad) */
  pileStandoffM?: number | null
  /** with no wall-wide size set: size each post from the table at its own
   * height (bigger posts where the wall is taller) instead of giving
   * every post the biggest size any of them needs */
  gradePostSizes?: boolean
  /** sizes picked by hand for individual posts, keyed by post index —
   * these win over every wall-wide setting */
  postSizes?: Record<number, string> | null
  /** m, the auger for individual holes, keyed by post index. Only used on
   * a post that has its own size (postSizes); the rest of the wall keeps
   * the wall's auger. */
  holeDiametersM?: Record<number, number> | null
  /** things in the ground the wall crosses: posts are put either side of
   * one rather than in its clearance zone */
  obstructions?: Obstruction[] | null
  /** m, the standard clearance per type of obstruction */
  obstructionClearancesM?: Partial<Record<ObstructionType, number>> | null
}

/** m³ of concrete for one hole `embedmentM` deep: the hole above its
 * gravel base pad, less the part of that taken up by the post — which
 * stops `standoffM` short of the pad, so the gap under it is concrete. */
export function holeConcreteM3(holeDiameterM: number, embedmentM: number, gravelBaseM: number, standoffM: number, sizeLabel: string): number {
  const concreteDepthM = Math.max(0, embedmentM - gravelBaseM)
  const postDepthM = Math.max(0, concreteDepthM - Math.max(0, standoffM))
  return Math.max(0, calcHoleVolumeM3(holeDiameterM, concreteDepthM) - postSectionAreaM2(sizeLabel) * postDepthM)
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

/** An obstruction's zone along the unfolded wall, with what it means
 * for the posts as laid out. */
export interface ProfileObstruction extends ObstructionZone {
  /** m, the ground level where it crosses */
  groundLevelM: number
  /** posts whose holes reach into its clearance zone */
  clashPostIndices: number[]
  /** m, the bay it crosses under — between those two posts' centres —
   * or null if it's past the end of the wall */
  spanM: number | null
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
  obstructions: ProfileObstruction[]
}

const DEFAULT_LEVEL = (retainedHeightM: number): ControlPoint => ({ groundLevelM: 0, topLevelM: retainedHeightM })

/** A post's resolved levels: ground, and the top as the wall before it
 * (topLevelM) and after it (topAfterLevelM) see it. */
interface ResolvedLevel {
  groundLevelM: number
  topLevelM: number
  topAfterLevelM: number
}

/** Resolves post `i`'s ground/top level: its own control point if it has
 * one, else linearly interpolated (by distance along the wall, `postXs`)
 * between the nearest control points
 * bracketing it, else held flat at whichever single control point is
 * nearest, else the uniform default if there are no control points at
 * all yet. `sortedCpIndices` must be sorted ascending.
 *
 * A control point on a corner can carry a second top (topAfterLevelM):
 * posts before it rake up to its own top, and posts after it rake on from
 * the second one. */
function resolveLevel(
  i: number,
  controlPoints: ControlPoints,
  sortedCpIndices: number[],
  retainedHeightM: number,
  postXs: number[]
): ResolvedLevel {
  const same = (c: ControlPoint): ResolvedLevel => ({ groundLevelM: c.groundLevelM, topLevelM: c.topLevelM, topAfterLevelM: c.topLevelM })
  if (controlPoints[i]) {
    const cp = controlPoints[i]
    return { groundLevelM: cp.groundLevelM, topLevelM: cp.topLevelM, topAfterLevelM: cp.topAfterLevelM ?? cp.topLevelM }
  }
  if (sortedCpIndices.length === 0) return same(DEFAULT_LEVEL(retainedHeightM))

  let before: number | undefined
  let after: number | undefined
  for (const ci of sortedCpIndices) {
    if (ci <= i) before = ci
    if (ci >= i && after === undefined) after = ci
  }
  // a post past the last control point carries on from its far side;
  // one before the first reaches back to its near side
  if (before === undefined) return same(controlPoints[after!])
  if (after === undefined) {
    const cp = controlPoints[before]
    return same({ ...cp, topLevelM: cp.topAfterLevelM ?? cp.topLevelM })
  }

  // by distance along the wall, so a wide bay rises (or falls) more than a narrow one
  const span = postXs[after] - postXs[before]
  const t = span > 0 ? (postXs[i] - postXs[before]) / span : (i - before) / (after - before)
  const cpBefore = controlPoints[before]
  const cpAfter = controlPoints[after]
  const fromTop = cpBefore.topAfterLevelM ?? cpBefore.topLevelM
  return same({
    groundLevelM: cpBefore.groundLevelM + (cpAfter.groundLevelM - cpBefore.groundLevelM) * t,
    topLevelM: fromTop + (cpAfter.topLevelM - fromTop) * t,
  })
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
 * of a retaining wall, so for every unbroken stretch, in this order:
 *
 * 1. as few pieces as will cover it — a piece runs on across as many
 *    bays as the longest board allows (`maxLengthM`) and only ever ends
 *    on a post, and a stretch that fits in one board is never joined;
 * 2. no piece covering just one bay wherever that can be avoided, so a
 *    join never lands on the first post in from an end when the pieces
 *    can be shared out differently (4 + 1 bays becomes 3 + 2);
 * 3. joins staggered row to row, like coursed brickwork, so they don't
 *    stack on one post. `phase` 0 puts the longest boards at the start
 *    of the stretch; `phase` 1 is planned to keep its joins off the
 *    posts a phase 0 row joins on, with its longest boards toward the
 *    far end. Only when no layout with the same number of pieces can do
 *    that (the stretch is an exact number of full boards) does a phase 1
 *    row take one extra piece. */
function planPieces(
  bays: ProfileBay[],
  maxLengthM: number,
  phase: 0 | 1,
  lengthOf: (bay: ProfileBay) => number = (bay) => bay.boardLengthM
): { start: number; end: number }[] {
  const pieces: { start: number; end: number }[] = []
  const fits = (lengthM: number) => lengthM <= maxLengthM + 1e-6

  type Plan = { pieces: number; singles: number; shared: number; ends: number[] }
  /** Best way to cut bays first..last, by `order` of priority. `avoid`
   * holds the bay indices another row's pieces end on (its joins);
   * `longFirst` breaks ties toward a longer first piece. */
  const solve = (first: number, last: number, order: "fewest" | "staggered", avoid: Set<number>, longFirst: boolean): Plan => {
    const key = (p: { pieces: number; singles: number; shared: number }) =>
      order === "fewest" ? [p.pieces, p.singles, p.shared] : [p.shared, p.pieces, p.singles]
    const better = (a: number[], b: number[]) => {
      for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] < b[k]
      return false
    }
    // best[i - first]: the best plan for bays i..last; one past the end is empty
    const best: (Plan & { next: number })[] = []
    best[last + 1 - first] = { pieces: 0, singles: 0, shared: 0, ends: [], next: -1 }
    for (let i = last; i >= first; i--) {
      const reach: number[] = []
      let length = 0
      for (let j = i; j <= last; j++) {
        length += lengthOf(bays[j])
        // a single bay is always a piece, even one too long for any board
        if (j > i && !fits(length)) break
        reach.push(j)
      }
      if (longFirst) reach.reverse()
      let chosen: (Plan & { next: number }) | null = null
      for (const j of reach) {
        const rest = best[j + 1 - first]
        const candidate = {
          pieces: rest.pieces + 1,
          singles: rest.singles + (j === i ? 1 : 0),
          shared: rest.shared + (j < last && avoid.has(j) ? 1 : 0),
          ends: [],
          next: j,
        }
        if (!chosen || better(key(candidate), key(chosen))) chosen = candidate
      }
      best[i - first] = chosen!
    }
    const ends: number[] = []
    for (let i = first; i <= last; i = ends[ends.length - 1] + 1) ends.push(best[i - first].next)
    const { pieces: count, singles, shared } = best[0]
    return { pieces: count, singles, shared, ends }
  }

  let i = 0
  while (i < bays.length) {
    // the unbroken stretch starting here (the row may skip bays that are
    // too low to have this course)
    let last = i
    while (last + 1 < bays.length && bays[last + 1].leftIndex === bays[last].rightIndex) last++
    const base = solve(i, last, "fewest", new Set(), true)
    let plan = base
    if (phase === 1 && base.pieces > 1) {
      const avoid = new Set(base.ends.slice(0, -1))
      plan = solve(i, last, "fewest", avoid, false)
      if (plan.shared > 0) {
        const staggered = solve(i, last, "staggered", avoid, false)
        if (staggered.pieces <= plan.pieces + 1) plan = staggered
      }
    }
    let start = i
    for (const end of plan.ends) {
      pieces.push({ start, end })
      start = end + 1
    }
    i = last + 1
  }
  return pieces
}

/** the longest a top cap piece runs before it's joined */
const CAP_MAX_LENGTH_M = 6

type LayerAgg = {
  totalLengthM: number
  rakeCutCount: number
  pieceLengthsM: number[]
  pieceBaysM: number[][]
  pieceInfo: { postIndex: number; row: number }[]
  joints: BoardJoint[]
}

/** Folds a planned piece list into running totals plus the joints between
 * consecutive pieces that butt up on a shared post. `levelAtPost` gives
 * the height to draw that joint at, specific to which layer/row it's on. */
function accumulatePieces(
  agg: LayerAgg,
  bays: ProfileBay[],
  pieces: { start: number; end: number }[],
  levelAtPost: (postIndex: number) => number,
  layer: BoardJoint["layer"],
  lengthOf: (bay: ProfileBay) => number = (bay) => bay.boardLengthM,
  isRakeCut: (bay: ProfileBay) => boolean = () => false,
  row = -1
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
    agg.pieceInfo.push({ postIndex: bays[p.start].leftIndex, row })
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
  const newAgg = (): LayerAgg => ({ totalLengthM: 0, rakeCutCount: 0, pieceLengthsM: [], pieceBaysM: [], pieceInfo: [], joints: [] })
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
        (bay) => k >= bay.fullCourseCount,
        k
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
    // a stepped bay has no separate top board — its top course is just
    // another level course — so only the other bays have one
    for (const bay of run.filter((b) => b.stepTopM === null)) {
      const stretch = stretches[stretches.length - 1]
      const sameRake = stretch && Math.abs(stretch[stretch.length - 1].topSlope - bay.topSlope) < 1e-4
      if (stretch && (!rakedTopBoard || sameRake)) stretch.push(bay)
      else stretches.push([bay])
    }
    stretches.forEach((stretch, idx) => {
      const topBoardPieces = planPieces(stretch, maxLengthM, (maxCourses % 2) as 0 | 1, (bay) => bay.topBoardLengthM)
      accumulatePieces(topBoardAgg, stretch, topBoardPieces, (postIndex) => posts[postIndex].topLevelM, "topBoard", (bay) => bay.topBoardLengthM)
      const nextStretch = stretches[idx + 1]
      // a rake change forces a join at the post where two stretches meet —
      // unless a stepped bay sits between them, where there's no board
      if (nextStretch && nextStretch[0].leftIndex === stretch[stretch.length - 1].rightIndex) {
        const postIndex = stretch[stretch.length - 1].rightIndex
        topBoardAgg.joints.push({ postIndex, levelM: posts[postIndex].topLevelM, layer: "topBoard" })
      }
    })

    if (topCapEnabled) {
      // the cap is one flat board, so it can't carry on across a step
      const capStretches: ProfileBay[][] = []
      for (const bay of run) {
        const stretch = capStretches[capStretches.length - 1]
        const last = stretch?.[stretch.length - 1]
        const stepsApart = last && (last.stepTopM !== null || bay.stepTopM !== null) && !(last.stepTopM !== null && bay.stepTopM !== null && Math.abs(last.stepTopM - bay.stepTopM) < 1e-6)
        if (stretch && !stepsApart) stretch.push(bay)
        else capStretches.push([bay])
      }
      // the cap sits on top, clear of the boards' joins, so it isn't
      // staggered against them: just the fewest pieces (so the fewest
      // joins), no piece over CAP_MAX_LENGTH_M (or the longest stock length)
      const capMaxLengthM = Math.min(maxLengthM, CAP_MAX_LENGTH_M)
      for (const stretch of capStretches) {
        const capPieces = planPieces(stretch, capMaxLengthM, 0)
        accumulatePieces(topCapAgg, stretch, capPieces, (postIndex) => posts[postIndex].topLevelM + capThicknessM, "topCap")
      }
    }
  }

  const finalize = (agg: LayerAgg): BoardLayerSummary => ({
    count: agg.pieceLengthsM.length,
    totalLengthM: agg.totalLengthM,
    rakeCutCount: agg.rakeCutCount,
    pieceLengthsM: agg.pieceLengthsM,
    pieceBaysM: agg.pieceBaysM,
    pieceInfo: agg.pieceInfo,
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
    .map((r) => layoutRun(r.l, maxSpacingM, r.spacing).offsetsM.length)
}

/** Every run's posts as fractions of the way along it (0 to 1, the
 * run's start post first) — the post layout to compare when deciding
 * how hand-set values follow their posts after a change. */
export const postFractions = (profile: WallProfile): number[][] =>
  profile.segments.map((seg) =>
    profile.posts
      .slice(seg.startPostIndex, seg.endPostIndex + 1)
      .map((p) => Math.round(((p.xM - seg.startXM) / seg.lengthM) * 1e5) / 1e5)
  )

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
  const runsIn = segmentLengthsM
    .map((l, i) => ({ l, spacing: overrides.runSpacing?.[i], stepped: overrides.steppedWalls?.[i] }))
    .filter((r) => r.l > 0)
  const runLengthsM = runsIn.map((r) => r.l)
  if (runLengthsM.length === 0 || !(retainedHeightM > 0)) return null

  const layoutRow = findReferenceRow(settings, Math.min(retainedHeightM, ENGINEER_HEIGHT_LIMIT_M), soil)

  // lay every run out end to end: each run's first post is the previous
  // run's last (the shared corner post), so only the very first run
  // contributes its own starting post
  const postXs: number[] = [0]
  const fixedAt = new Map<number, { segmentIndex: number; slot: number }>()
  const clearAt = new Map<number, string>()
  // for deciding where posts go round an obstruction, before any post's
  // own size or depth is known: the hole the wall-wide settings give
  const layoutHoleDiameterM =
    augerDiameterM ?? postWidthM(postSizeOverride ?? layoutRow.postSizeLabel) * settings.holeDiameterMultiplier
  const layoutHoleDepthM =
    holeDepthOverrideM ?? Math.min(retainedHeightM, ENGINEER_HEIGHT_LIMIT_M) * layoutRow.embedmentRatio + settings.gravelBaseAllowanceM
  const obstructions = overrides.obstructions ?? []
  const cornerIndices = new Set<number>()
  const segments: ProfileSegment[] = []
  let runStartXM = 0
  runLengthsM.forEach((lengthM, index) => {
    const spacing = runsIn[index].spacing
    const stepped = Boolean(runsIn[index].stepped)
    const tableBayCount = bayCountFor(lengthM, layoutRow.maxSpacingM)
    // posts either side of anything in the ground the holes would reach
    const seg = { startXM: runStartXM, lengthM }
    const plain = layoutRun(lengthM, layoutRow.maxSpacingM, spacing)
    const anchors = obstructions
      .filter((o) => o.segmentIndex === index)
      .flatMap((o) =>
        clearanceAnchors(obstructionZone(o, seg, overrides.obstructionClearancesM ?? undefined), runStartXM, lengthM, [0, ...plain.offsetsM], layoutHoleDiameterM, layoutHoleDepthM).map(
          (atM) => ({ atM, tag: { kind: "clear", obstructionId: o.id } as RunAnchorTag })
        )
      )
    const layout = anchors.length ? layoutRun(lengthM, layoutRow.maxSpacingM, spacing, anchors) : plain
    const bayCount = layout.offsetsM.length
    const startPostIndex = postXs.length - 1
    const xs = [0, ...layout.offsetsM]
    layout.offsetsM.forEach((x, k) => {
      postXs.push(runStartXM + x)
      const tag = layout.tags[k]
      if (tag?.kind === "fixed") fixedAt.set(postXs.length - 1, { segmentIndex: index, slot: tag.slot })
      if (tag?.kind === "clear") clearAt.set(postXs.length - 1, tag.obstructionId)
    })
    const endPostIndex = postXs.length - 1
    const bayWidths = xs.slice(1).map((x, k) => x - xs[k])
    segments.push({ index, startPostIndex, endPostIndex, startXM: runStartXM, endXM: runStartXM + lengthM, lengthM,
      postSpacingM: lengthM / bayCount,
      maxBayM: Math.max(...bayWidths),
      evenlySpaced: Math.max(...bayWidths) - Math.min(...bayWidths) < 0.0005,
      ignoredFixed: layout.ignoredFixed,
      tableMaxSpacingM: layoutRow.maxSpacingM,
      tableBayCount,
      spacingOverridden: Boolean((spacing?.bayCount && spacing.bayCount >= 1) || (spacing?.maxSpacingM && spacing.maxSpacingM > 0) || spacing?.fixedPosts?.length),
      stepped,
      stepsEdited: false,
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
  // a second top only means something on a corner — if the corner has
  // since gone, that post is just a post
  for (const [key, cp] of Object.entries(effectiveControlPoints)) {
    if (cp.topAfterLevelM !== undefined && !cornerIndices.has(Number(key))) effectiveControlPoints[Number(key)] = { groundLevelM: cp.groundLevelM, topLevelM: cp.topLevelM }
  }
  if (effectiveControlPoints[0] === undefined) effectiveControlPoints[0] = DEFAULT_LEVEL(retainedHeightM)
  if (effectiveControlPoints[lastIndex] === undefined) effectiveControlPoints[lastIndex] = DEFAULT_LEVEL(retainedHeightM)

  const sortedCpIndices = Object.keys(effectiveControlPoints)
    .map(Number)
    .filter((i) => i >= 0 && i < postCount)
    .sort((a, b) => a - b)

  const posts: ProfilePost[] = Array.from({ length: postCount }, (_, i) => {
    const resolved = resolveLevel(i, effectiveControlPoints, sortedCpIndices, retainedHeightM, postXs)
    const groundLevelM = resolved.groundLevelM
    const topBeforeM = resolved.topLevelM
    const topAfterM = cornerIndices.has(i) ? resolved.topAfterLevelM : resolved.topLevelM
    // a corner pile has to cater for the taller of the walls it joins
    const topLevelM = Math.max(topBeforeM, topAfterM)
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
      topBeforeM,
      topAfterM,
      retainedHeightM: localHeightM,
      isControlPoint: Boolean(controlPoints[i]),
      isCorner: cornerIndices.has(i),
      fixed: fixedAt.get(i) ?? null,
      clearOf: clearAt.get(i) ?? null,
      clashesWith: [],
      needsEngineer,
      sizeLabel,
      widthM,
      sizeSet: false,
      holeSet: false,
      wallSizeLabel: sizeLabel,
      wallHoleDiameterM: holeDiameterM,
      embedmentM,
      depthSet: null,
      tableSizeLabel,
      tableEmbedmentM,
      holeDiameterM,
      holeVolumeM3,
      concreteVolumeM3,
      postDepthM: 0, // set once every hole's depth is known, below
    }
  })

  /** gives post `p` a size (and, optionally, its own hole diameter), and
   * works its hole out again to suit */
  const resizePost = (p: ProfilePost, sizeLabel: string, holeDiameterM: number | null = null) => {
    p.sizeLabel = sizeLabel
    p.widthM = postWidthM(sizeLabel)
    p.holeDiameterM = holeDiameterM ?? augerDiameterM ?? p.widthM * settings.holeDiameterMultiplier
    p.holeVolumeM3 = calcHoleVolumeM3(p.holeDiameterM, p.embedmentM)
    const concreteDepthM = Math.max(0, p.embedmentM - settings.gravelBaseAllowanceM)
    p.concreteVolumeM3 = Math.max(0, calcHoleVolumeM3(p.holeDiameterM, concreteDepthM) - postSectionAreaM2(sizeLabel) * concreteDepthM)
  }

  // By default every pile on the wall is the same: the biggest size the
  // table calls for at any post (a pile at the tall end sets it for all).
  // Grading leaves each post on the table's size for its own height
  // instead. Picking a size for the whole wall overrides both.
  if (!postSizeOverride && !overrides.gradePostSizes) {
    const sizable = posts.filter((p) => !p.needsEngineer)
    if (sizable.length > 0) {
      const biggest = sizable.reduce((best, p) =>
        postSectionAreaM2(p.tableSizeLabel) > postSectionAreaM2(best) + 1e-9 ? p.tableSizeLabel : best, sizable[0].tableSizeLabel)
      for (const p of posts) resizePost(p, biggest)
    }
  }

  // sizes picked for single posts win over all of that, and a post with
  // its own size can have its own auger
  for (const p of posts) {
    p.wallSizeLabel = p.sizeLabel
    p.wallHoleDiameterM = p.holeDiameterM
    const size = overrides.postSizes?.[p.index]
    if (!size) continue
    const hole = overrides.holeDiametersM?.[p.index]
    resizePost(p, size, hole && hole > 0 ? hole : null)
    p.sizeSet = true
    p.holeSet = Boolean(hole && hole > 0)
  }

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

  // with every hole's depth settled: the concrete and how far the post
  // goes down, allowing for any stand-off under the post
  const standoffM = Math.max(0, overrides.pileStandoffM ?? 0)
  for (const p of posts) {
    p.concreteVolumeM3 = holeConcreteM3(p.holeDiameterM, p.embedmentM, settings.gravelBaseAllowanceM, standoffM, p.sizeLabel)
    p.postDepthM = Math.max(0, p.embedmentM - settings.gravelBaseAllowanceM - standoffM)
  }

  // the obstructions' zones, and which holes reach into them as built
  const obstructionZones: ProfileObstruction[] = obstructions.map((o) => {
    const segment = segments[o.segmentIndex]
    const zone = obstructionZone(o, segment, overrides.obstructionClearancesM ?? undefined)
    const clashPostIndices = posts.filter((p) => holeClashes(zone, p.xM, p.holeDiameterM, p.embedmentM)).map((p) => p.index)
    for (const i of clashPostIndices) posts[i].clashesWith.push(o.id)
    // ground level where it crosses, between the posts either side
    const after = posts.findIndex((p) => p.xM >= zone.centreXM - 1e-9)
    const a = posts[Math.max(0, after - 1)]
    const b = posts[Math.max(0, after)]
    const t = b && a && b.xM > a.xM ? (zone.centreXM - a.xM) / (b.xM - a.xM) : 0
    const groundLevelM = a && b ? a.groundLevelM + (b.groundLevelM - a.groundLevelM) * t : 0
    // the bay it's bridged by, if it's between two posts
    const spanM = a && b && after > 0 && b.xM > zone.centreXM ? b.xM - a.xM : null
    return { ...zone, groundLevelM, clashPostIndices, spanM }
  })

  // Stepped runs: every bay is a whole number of courses high, so the top
  // of the wall is a staircase with its steps at the posts. Worked out
  // from the rake unless the run's bay heights were set by hand.
  const ch = settings.boardCourseHeightM
  const MAX_STEP_COURSES = 80
  const stepCourses = new Map<number, number>() // bay left post index -> courses
  for (const seg of segments) {
    if (!seg.stepped) continue
    const manual = Array.from({ length: seg.endPostIndex - seg.startPostIndex }, (_, k) => overrides.bayCourses?.[seg.startPostIndex + k])
    seg.stepsEdited = manual.some((c) => typeof c === "number" && c >= 1)
    for (let i = seg.startPostIndex; i < seg.endPostIndex; i++) {
      const a = posts[i]
      const b = posts[i + 1]
      const base = Math.min(a.groundLevelM, b.groundLevelM)
      const auto = Math.round(((a.topAfterM + b.topBeforeM) / 2 - base) / ch)
      const set = overrides.bayCourses?.[i]
      stepCourses.set(i, Math.min(MAX_STEP_COURSES, Math.max(1, seg.stepsEdited && typeof set === "number" && set >= 1 ? Math.round(set) : auto)))
    }
  }
  const stepTopOf = (i: number): number | null => {
    const courses = stepCourses.get(i)
    return courses === undefined ? null : Math.min(posts[i].groundLevelM, posts[i + 1].groundLevelM) + courses * ch
  }
  // a post stands as high as the tallest bay beside it — a stepped bay's
  // flat top, or, beside one that isn't stepped, that wall's own rake
  if (stepCourses.size > 0) {
    for (const p of posts) {
      const sides: number[] = []
      let anyStepped = false
      if (p.index > 0) {
        const top = stepTopOf(p.index - 1)
        anyStepped = anyStepped || top !== null
        sides.push(top ?? p.topBeforeM)
      }
      if (p.index < posts.length - 1) {
        const top = stepTopOf(p.index)
        anyStepped = anyStepped || top !== null
        sides.push(top ?? p.topAfterM)
      }
      if (!anyStepped) continue
      p.topLevelM = Math.max(...sides)
      p.retainedHeightM = p.topLevelM - p.groundLevelM
      p.needsEngineer = p.retainedHeightM > ENGINEER_HEIGHT_LIMIT_M || p.retainedHeightM <= 0
    }
  }

  const bays: ProfileBay[] = []
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i]
    const b = posts[i + 1]
    const needsEngineer = a.needsEngineer || b.needsEngineer
    const widthM = b.xM - a.xM
    const stepTopM = stepTopOf(i)
    // how tall the wall is across this bay — its own side of each post,
    // not the taller pile a corner may stand on
    const heightM = stepTopM !== null ? stepTopM - Math.min(a.groundLevelM, b.groundLevelM) : Math.max(a.topAfterM - a.groundLevelM, b.topBeforeM - b.groundLevelM)
    const layout =
      stepTopM === null
        ? bayCourseLayout(a, b, settings.boardCourseHeightM, rakedTopBoard)
        : {
            courseCount: stepCourses.get(i)!,
            fullCourseCount: stepCourses.get(i)!,
            topBoardLengthM: 0,
          }
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
      boardOverrunM: 0,
      boardLengthM: widthM,
      topBoardLengthM: layout.topBoardLengthM,
      topSlope: widthM > 0 ? (b.topBeforeM - a.topAfterM) / widthM : 0,
      stepTopM,
      stepCourseCount: stepCourses.get(i) ?? null,
    })
  }

  // boards run to the outside face of the post at each end of an
  // unbroken run, not just to its centre (unless that's switched off)
  const endRuns = overrides.boardsToPostOutside === false ? [] : groupIntoRuns(bays.filter((b) => !b.needsEngineer), posts)
  for (const run of endRuns) {
    const first = run[0]
    const last = run[run.length - 1]
    for (const [bay, overrunM] of [
      [first, posts[first.leftIndex].widthM / 2],
      [last, posts[last.rightIndex].widthM / 2],
    ] as const) {
      bay.boardOverrunM += overrunM
      bay.boardLengthM += overrunM
      bay.topBoardLengthM += overrunM
    }
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
    obstructions: obstructionZones,
  }
}

/** A board piece as the order card needs it: the bay lengths it spans,
 * the post it starts on (it runs on to startPost + baysM.length), and
 * which board it is in the elevation — a level course (courseRow counts
 * up from 0 at the bottom of its bay) or the top board. */
export interface WallOrderPiece {
  baysM: number[]
  startPost: number
  layer: "course" | "topBoard"
  courseRow: number
}

/** One wall's boards for ordering: its rows from the bottom up — every
 * level course, then the top board as the last row — each row a list of
 * pieces. */
export interface WallOrderRows {
  segmentIndex: number
  rows: WallOrderPiece[][]
}

/** The facing boards and top board of every wall, split up by wall and
 * by row, so an order can be made for part of the job. (The top cap is
 * ordered separately.) */
export function boardRowsByWall(profile: WallProfile): WallOrderRows[] {
  const segmentOf = (postIndex: number) =>
    profile.segments.find((seg) => postIndex >= seg.startPostIndex && postIndex < seg.endPostIndex)?.index ?? profile.segments.length - 1
  const courses = profile.segments.map(() => [] as WallOrderPiece[][])
  const tops = profile.segments.map(() => [] as WallOrderPiece[])
  profile.boards.pieceInfo.forEach((info, i) => {
    const rows = courses[segmentOf(info.postIndex)]
    ;(rows[info.row] ??= []).push({ baysM: profile.boards.pieceBaysM[i], startPost: info.postIndex, layer: "course", courseRow: info.row })
  })
  profile.topBoard.pieceInfo.forEach((info, i) =>
    tops[segmentOf(info.postIndex)].push({ baysM: profile.topBoard.pieceBaysM[i], startPost: info.postIndex, layer: "topBoard", courseRow: -1 })
  )
  return profile.segments.map((seg) => ({
    segmentIndex: seg.index,
    // a sparse row (no bay on this wall tall enough for it) is dropped
    rows: [...Array.from(courses[seg.index], (row) => row ?? []).filter((row) => row.length > 0), ...(tops[seg.index].length ? [tops[seg.index]] : [])],
  }))
}

/** A board to pick out on the elevation: the posts it runs between and
 * which board it is there. */
export interface BoardHighlight {
  startPost: number
  endPost: number
  layer: "course" | "topBoard"
  courseRow: number
}
