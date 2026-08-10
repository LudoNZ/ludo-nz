/** Whether a join at row-distance `rowsAway` (0 = same row) and joist-bay
 * offset `baysAway` from another join falls inside the combined exclusion
 * zone, given the two configured thresholds. Shared between the layout
 * algorithm and the JoistExclusionMap editor so the picture always matches
 * what actually gets enforced.
 *
 * - Same row (rowsAway === 0): governed entirely by minSameRowJoinJoists —
 *   a flat "at least this many bays apart" rule.
 * - Adjacent row (rowsAway === 1): governed entirely by minStaggerJoists —
 *   the classic "don't land on/near the previous row's join" rule, at full
 *   width regardless of same-row spacing.
 * - Further rows (2..minStaggerJoists): an additional, tapering exclusion
 *   seeded from minSameRowJoinJoists — the column clearance required
 *   shrinks by one bay per extra row of distance, so the "diagonal" danger
 *   zone narrows the further out you look instead of staying a full-width
 *   band all the way out to minStaggerJoists. */
export function inExclusionZone(
  rowsAway: number,
  baysAway: number,
  minStaggerJoists: number,
  minSameRowJoinJoists: number
): boolean {
  const d = Math.abs(rowsAway)
  const b = Math.abs(baysAway)
  if (d === 0) return b < minSameRowJoinJoists
  if (d === 1) return b < minStaggerJoists
  if (d > minStaggerJoists) return false
  const width = minSameRowJoinJoists - (d - 1)
  return width > 0 && b < width
}
