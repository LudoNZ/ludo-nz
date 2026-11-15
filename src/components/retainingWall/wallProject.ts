/** A retaining wall as one saveable unit — everything the editor needs to
 * reproduce a wall exactly: its shape in plan, the base inputs, hand-set
 * post levels, and a snapshot of the calc settings it was worked out
 * with (a snapshot, not a preset id, so a project never changes under
 * you because a preset was edited later). */

import { CalcSettings, DEFAULT_CALC_SETTINGS } from "./calcSettings"
import { buildWallProfile, ControlPoints, legacyPlan, ProfileOverrides } from "./postProfile"
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
  /** keyed by post index */
  controlPoints: ControlPoints
  topCapEnabled: boolean
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
  controlPoints: {},
  topCapEnabled: false,
  calcSettings: DEFAULT_CALC_SETTINGS,
  calcSettingsName: "Default",
})

export const DEFAULT_WALL: WallProject = newBlankWall()

const isPoint = (p: unknown): p is PlanPoint =>
  typeof p === "object" && p !== null && Number.isFinite((p as PlanPoint).xM) && Number.isFinite((p as PlanPoint).yM)

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
    controlPoints: typeof d.controlPoints === "object" && d.controlPoints !== null ? (d.controlPoints as ControlPoints) : {},
    topCapEnabled: Boolean(d.topCapEnabled),
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

export const overridesForWall = (wall: Pick<WallProject, "augerDiameterMm" | "postSizeOverride" | "holeDepthOverrideMm">): ProfileOverrides => ({
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
