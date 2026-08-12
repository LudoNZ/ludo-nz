/** Shared shapes for any "posts + rails + infill" structure calculator —
 * retaining walls today, a paling fence (or anything else built the same
 * way) later. A domain calculator (e.g. retainingWall/retainingWallCalc.ts)
 * works out these numbers from its own inputs; the structures/ components
 * just know how to display them, with no knowledge of what they're for. */

export interface PostSpec {
  /** e.g. "100 x 100mm" */
  sizeLabel: string
  /** m, evenly divided across the run — see calcPostLayout */
  spacingM: number
  count: number
  /** m, total post length including embedment */
  lengthM: number
  embedmentM: number
  holeDiameterM: number
  /** m³, concrete or compacted gravel per hole */
  holeVolumeM3: number
  /** m³, holeVolumeM3 × count */
  totalFillVolumeM3: number
}

export interface RailSpec {
  /** e.g. "Facing boards (200mm sleepers)" or "Rails (2 per bay)" */
  label: string
  /** how many courses/rows stacked to reach the required height (1 for a
   * simple fence rail set, several for a stacked-board retaining wall) */
  courseCount: number
  /** m, total linear length needed across every course */
  totalLengthM: number
  /** m, assumed stock length each piece is cut from */
  standardLengthM: number
  boardCount: number
}

export interface InfillSpec {
  /** e.g. "Drainage backfill" or "Palings" */
  label: string
  /** m³, when the infill is a volume (backfill, gravel) */
  volumeM3?: number
  /** count, when the infill is discrete pieces (palings) */
  count?: number
  note?: string
}

export interface LaborEstimate {
  setupHours: number
  postsHours: number
  railsHours: number
  infillHours: number
  totalHours: number
}
