/** A retaining wall as one saveable unit — everything the editor needs to
 * reproduce a wall exactly: its shape in plan, the base inputs, hand-set
 * post levels, and a snapshot of the calc settings it was worked out
 * with (a snapshot, not a preset id, so a project never changes under
 * you because a preset was edited later). */

import { CalcSettings, DEFAULT_CALC_SETTINGS } from "./calcSettings"
import { buildWallProfile, ControlPoints, DepthPoints, legacyPlan, ProfileOverrides, RunSpacing } from "./postProfile"
import { SavedWallDesign } from "./retainingWallData"
import { SOIL_LABELS, SoilType } from "./retainingWallCalc"
import { PlanPoint, RetainedSide, segmentLengths, straightPlan, totalLength } from "./wallPlan"

export interface WallProject {
  planPoints: PlanPoint[]
  retainedSide: RetainedSide
  retainedHeightM: number
  soil: SoilType
  rlDatumM: number
  /** mm; null = size each hole off its own post */
  augerDiameterMm: number | null
  /** e.g. "150mm round"; null = each post's size comes from the table */
  postSizeOverride: string | null
  /** mm, drilled depth below ground; null = worked out per post */
  holeDepthOverrideMm: number | null
  /** hand-set post count/spacing per wall, in step with the plan's runs;
   * null (or missing) = that wall uses the table's spacing */
  runSpacing: (RunSpacing | null)[]
  /** the board order as actually placed: boards per stock length pinned
   * by hand, keyed by the length in metres as text ("6", "5.4"). A
   * length with no entry is worked out to cover whatever's left. */
  boardOrderFixed: Record<string, number>
  /** keyed by post index */
  controlPoints: ControlPoints
  /** hole depths set by hand on individual posts, keyed by post index */
  depthPoints: DepthPoints
  topCapEnabled: boolean
  /** top board laid on the rake as a full board, with the level boards
   * under it cut down to suit */
  rakedTopBoard: boolean
  /** boards at each end of a wall are measured to the outside face of
   * the end post (true) or to its centre (false) */
  boardsToPostOutside: boolean
  /** set once the project is set up: the editor makes every input read
   * only until it's unlocked again, so nothing gets changed by accident */
  locked: boolean
  calcSettings: CalcSettings
  calcSettingsName: string
}

/** What a project card shows — worked out when a project is saved, so
 * the projects page doesn't have to rebuild every wall to list them. */
export interface WallSummary {
  wallLengthM: number
  walls: number
  /** tallest retained height anywhere along the wall */
  maxHeightM: number
  posts: number
  boards: number
  concreteM3: number
  needsEngineer: boolean
}

/** the scratch wall's localStorage key — see retaining-walls/scratch */
export const SCRATCH_STORAGE_KEY = "retainingWalls.scratch.v1"

export const newBlankWall = (): WallProject => ({
  planPoints: straightPlan(5),
  retainedSide: "left",
  retainedHeightM: 1,
  soil: "firmClay",
  rlDatumM: 0,
  augerDiameterMm: null,
  postSizeOverride: null,
  holeDepthOverrideMm: null,
  runSpacing: [],
  boardOrderFixed: {},
  controlPoints: {},
  depthPoints: {},
  topCapEnabled: false,
  rakedTopBoard: false,
  boardsToPostOutside: true,
  locked: false,
  calcSettings: DEFAULT_CALC_SETTINGS,
  calcSettingsName: "Default",
})

export const DEFAULT_WALL: WallProject = newBlankWall()

const isPoint = (p: unknown): p is PlanPoint =>
  typeof p === "object" && p !== null && Number.isFinite((p as PlanPoint).xM) && Number.isFinite((p as PlanPoint).yM)

const runSpacingFromData = (raw: unknown): RunSpacing | null => {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as RunSpacing
  if (typeof r.bayCount === "number" && r.bayCount >= 1) return { bayCount: Math.round(r.bayCount) }
  if (typeof r.maxSpacingM === "number" && r.maxSpacingM > 0) return { maxSpacingM: r.maxSpacingM }
  return null
}

/** Reads a stored wall defensively — anything missing or malformed falls
 * back to the blank wall's value, so a document saved by an older (or
 * newer) version of the editor still opens. */
export const wallFromData = (data: unknown): WallProject => {
  const d = (typeof data === "object" && data !== null ? data : {}) as Partial<WallProject>
  const blank = newBlankWall()
  const points = Array.isArray(d.planPoints) ? d.planPoints.filter(isPoint) : []
  const settings = d.calcSettings
  return {
    planPoints: points.length >= 2 ? points : blank.planPoints,
    retainedSide: d.retainedSide === "right" ? "right" : "left",
    retainedHeightM: typeof d.retainedHeightM === "number" && d.retainedHeightM > 0 ? d.retainedHeightM : blank.retainedHeightM,
    soil: typeof d.soil === "string" && d.soil in SOIL_LABELS ? (d.soil as SoilType) : blank.soil,
    rlDatumM: typeof d.rlDatumM === "number" && Number.isFinite(d.rlDatumM) ? d.rlDatumM : 0,
    augerDiameterMm: typeof d.augerDiameterMm === "number" && d.augerDiameterMm > 0 ? d.augerDiameterMm : null,
    postSizeOverride: typeof d.postSizeOverride === "string" && d.postSizeOverride ? d.postSizeOverride : null,
    holeDepthOverrideMm: typeof d.holeDepthOverrideMm === "number" && d.holeDepthOverrideMm > 0 ? d.holeDepthOverrideMm : null,
    runSpacing: Array.isArray(d.runSpacing) ? d.runSpacing.map(runSpacingFromData) : [],
    boardOrderFixed: Object.fromEntries(
      Object.entries(typeof d.boardOrderFixed === "object" && d.boardOrderFixed !== null ? d.boardOrderFixed : {}).filter(
        ([, n]) => typeof n === "number" && n >= 0
      )
    ),
    controlPoints: typeof d.controlPoints === "object" && d.controlPoints !== null ? (d.controlPoints as ControlPoints) : {},
    depthPoints: Object.fromEntries(
      Object.entries(typeof d.depthPoints === "object" && d.depthPoints !== null ? d.depthPoints : {})
        .filter(([, v]) => typeof v === "object" && v !== null && typeof v.depthM === "number" && v.depthM > 0)
        .map(([k, v]) => [k, { depthM: v.depthM, mode: v.mode === "rake" ? "rake" : "lone" }])
    ) as DepthPoints,
    topCapEnabled: Boolean(d.topCapEnabled),
    rakedTopBoard: Boolean(d.rakedTopBoard),
    boardsToPostOutside: d.boardsToPostOutside !== false,
    locked: Boolean(d.locked),
    calcSettings:
      settings && Array.isArray(settings.referenceTable) && settings.referenceTable.length > 0
        ? { ...DEFAULT_CALC_SETTINGS, ...settings }
        : blank.calcSettings,
    calcSettingsName: typeof d.calcSettingsName === "string" && d.calcSettingsName ? d.calcSettingsName : "Default",
  }
}

/** A wall saved the old way (an immutable public "design") as a project. */
export const wallFromDesign = (design: SavedWallDesign): WallProject =>
  wallFromData({
    planPoints:
      design.planPoints ?? legacyPlan(design.wallLengthM, design.retainedHeightM, design.soil, design.cornerPosts, design.calcSettings),
    retainedSide: design.retainedSide,
    retainedHeightM: design.retainedHeightM,
    soil: design.soil,
    rlDatumM: design.rlDatumM,
    augerDiameterMm: design.augerDiameterMm,
    controlPoints: design.controlPoints,
    topCapEnabled: design.topCapEnabled,
    calcSettings: design.calcSettings,
    calcSettingsName: `From "${design.name}"`,
  })

export const overridesForWall = (wall: Pick<WallProject, "augerDiameterMm" | "postSizeOverride" | "holeDepthOverrideMm" | "runSpacing" | "rakedTopBoard" | "depthPoints" | "boardsToPostOutside">): ProfileOverrides => ({
  runSpacing: wall.runSpacing,
  rakedTopBoard: wall.rakedTopBoard,
  boardsToPostOutside: wall.boardsToPostOutside,
  depthPoints: wall.depthPoints,
  augerDiameterM: wall.augerDiameterMm ? wall.augerDiameterMm / 1000 : null,
  postSizeLabel: wall.postSizeOverride,
  holeDepthM: wall.holeDepthOverrideMm ? wall.holeDepthOverrideMm / 1000 : null,
})

export const profileForWall = (wall: WallProject) =>
  buildWallProfile(
    segmentLengths(wall.planPoints),
    wall.retainedHeightM,
    wall.soil,
    wall.controlPoints,
    wall.topCapEnabled,
    wall.rlDatumM,
    wall.calcSettings,
    overridesForWall(wall)
  )

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp

export const summariseWall = (wall: WallProject): WallSummary => {
  const profile = profileForWall(wall)
  return {
    wallLengthM: round(totalLength(wall.planPoints), 2),
    walls: wall.planPoints.length - 1,
    maxHeightM: round(profile ? Math.max(...profile.posts.map((p) => p.retainedHeightM)) : wall.retainedHeightM, 2),
    posts: profile ? profile.posts.length - profile.engineerPostIndices.length : 0,
    boards: profile ? profile.boards.count + profile.topBoard.count + (profile.topCap?.count ?? 0) : 0,
    concreteM3: round(profile?.totalConcreteVolumeM3 ?? 0, 2),
    needsEngineer: profile ? profile.engineerPostIndices.length > 0 : false,
  }
}
