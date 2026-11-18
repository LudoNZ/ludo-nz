import type { WallProject } from "./wallProject"
import { segmentLabel, segmentLengths } from "./wallPlan"

/** One step back in a wall's edit history: the whole wall as it was
 * before a change, and a short description of what the change did. */
export interface WallHistoryEntry {
  wall: WallProject
  label: string
}

/** How long a run of edits counts as a single change: typing "2.45" into
 * a box, or a length change plus the post levels following their posts
 * straight after it, all undo in one go. */
export const HISTORY_BURST_MS = 1200
/** how many steps back are kept */
export const HISTORY_LIMIT = 100

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const m = (v: number) => `${Number(v.toFixed(3))} m`
const mm = (v: number | null) => (v ? `${Math.round(v)} mm` : "auto")

/** the post numbers (1-based, as the elevation labels them) whose entry differs */
function changedPosts(before: Record<string | number, unknown>, after: Record<string | number, unknown>): number[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys]
    .filter((k) => !same(before[k], after[k]))
    .map((k) => Number(k) + 1)
    .sort((a, b) => a - b)
}

const postsPhrase = (posts: number[], what: string) =>
  posts.length === 1 ? `Post #${posts[0]} ${what}` : `${what[0].toUpperCase()}${what.slice(1)} on ${posts.length} posts`

/** Plain-words summary of the difference between two versions of a wall,
 * e.g. "Wall B length 4.2 m → 4.5 m" — what the undo button offers to put
 * back. Whole-wall changes the user didn't make directly (post levels
 * following their posts after a length change) are left out when there's
 * a more direct change to name. */
export function describeWallChange(before: WallProject, after: WallProject): string {
  const parts: string[] = []

  if (!same(before.planPoints, after.planPoints)) {
    const a = segmentLengths(before.planPoints)
    const b = segmentLengths(after.planPoints)
    if (b.length > a.length) parts.push("Added a corner")
    else if (b.length < a.length) parts.push("Removed a corner")
    else {
      const changed = b.map((len, i) => i).filter((i) => Math.abs(a[i] - b[i]) > 0.0005)
      if (changed.length === 1) {
        const i = changed[0]
        parts.push(`Wall ${segmentLabel(i)} length ${m(a[i])} → ${m(b[i])}`)
      } else if (changed.length > 1) parts.push(`${changed.length} wall lengths`)
      else parts.push("Wall corners moved")
    }
  }
  if (before.retainedHeightM !== after.retainedHeightM)
    parts.push(`Retained height ${m(before.retainedHeightM)} → ${m(after.retainedHeightM)}`)
  if (before.retainedSide !== after.retainedSide) parts.push("Retained side")
  if (before.soil !== after.soil) parts.push("Soil type")
  if (before.rlDatumM !== after.rlDatumM) parts.push(`RL datum ${m(before.rlDatumM)} → ${m(after.rlDatumM)}`)
  if (before.augerDiameterMm !== after.augerDiameterMm)
    parts.push(`Auger ${mm(before.augerDiameterMm)} → ${mm(after.augerDiameterMm)}`)
  if (before.postSizeOverride !== after.postSizeOverride)
    parts.push(`Post size ${before.postSizeOverride ?? "auto"} → ${after.postSizeOverride ?? "auto"}`)
  if (before.holeDepthOverrideMm !== after.holeDepthOverrideMm)
    parts.push(`Hole depth ${mm(before.holeDepthOverrideMm)} → ${mm(after.holeDepthOverrideMm)}`)
  if ((before.pileStandoffMm ?? 0) !== (after.pileStandoffMm ?? 0))
    parts.push(`Pile stand-off ${before.pileStandoffMm ?? 0} mm → ${after.pileStandoffMm ?? 0} mm`)
  if (!same(before.runSpacing, after.runSpacing)) parts.push("Post spacing")
  if (!same(before.steppedWalls, after.steppedWalls)) parts.push("Stepped top")
  if (before.topCapEnabled !== after.topCapEnabled) parts.push(after.topCapEnabled ? "Top cap on" : "Top cap off")
  if (before.rakedTopBoard !== after.rakedTopBoard) parts.push(after.rakedTopBoard ? "Raked top board on" : "Raked top board off")
  if (before.boardsToPostOutside !== after.boardsToPostOutside) parts.push("Board ends")
  if (!same(before.calcSettings, after.calcSettings) || before.calcSettingsName !== after.calcSettingsName)
    parts.push("Calculation settings")
  if (
    !same(before.boardOrderFixed, after.boardOrderFixed) ||
    !same(before.boardOrderPartial, after.boardOrderPartial) ||
    !same(before.boardOrdersPlaced, after.boardOrdersPlaced)
  )
    parts.push("Board order")

  // per-post changes: only worth naming when they're the change itself,
  // not posts renumbered after the layout moved
  const direct = parts.length > 0
  if (!direct) {
    const levels = changedPosts(before.controlPoints, after.controlPoints)
    if (levels.length) parts.push(postsPhrase(levels, "levels"))
    const depths = changedPosts(before.depthPoints, after.depthPoints)
    if (depths.length) parts.push(postsPhrase(depths, "hole depth"))
    const measured = changedPosts(before.measuredHoleDepthsMm ?? {}, after.measuredHoleDepthsMm ?? {})
    if (measured.length) parts.push(postsPhrase(measured, "measured depth"))
    if (!same(before.bayCourses, after.bayCourses)) parts.push("Bay heights")
  }

  if (parts.length === 0) return "Change"
  if (parts.length <= 2) return parts.join(", ")
  return `${parts.slice(0, 2).join(", ")} +${parts.length - 2} more`
}

/** true when the only difference is the lock — locking isn't an edit to undo */
export function onlyLockChanged(before: WallProject, after: WallProject) {
  return same({ ...before, locked: false }, { ...after, locked: false })
}

/** the top-level wall fields that differ (the lock aside), for the
 * activity log — lets reports filter by what kind of thing was changed */
export function changedFields(before: WallProject, after: WallProject): string[] {
  return (Object.keys(after) as (keyof WallProject)[]).filter((k) => k !== "locked" && !same(before[k], after[k])).sort()
}

/** What the editor reports for the activity log: one entry per finished
 * change (a burst of edits, as merged for undo), and one per undo, redo,
 * lock and unlock. */
export interface WallActivity {
  action: "change" | "undo" | "redo" | "lock" | "unlock"
  label: string
  fields: string[]
}
