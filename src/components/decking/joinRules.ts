/** A single forbidden cell in the join-exclusion grid: `d` joist rows away
 * (0 = same row) and `b` joist bays away, both non-negative. Symmetric —
 * toggling one cell forbids joins that distance/offset apart in every
 * direction (above/below, left/right), so the same {d,b} pair covers up to
 * four mirrored positions in the visual grid. */
export interface JoinExclusionCell {
  d: number
  b: number
}

function key(d: number, b: number): string {
  return `${d}:${b}`
}

export function exclusionSetFromCells(cells: JoinExclusionCell[]): Set<string> {
  return new Set(cells.map((c) => key(Math.abs(c.d), Math.abs(c.b))))
}

/** Whether a join `rowsAway` rows and `baysAway` bays from another falls in
 * the given exclusion set. Direction-agnostic, per the type above. */
export function isExcluded(rowsAway: number, baysAway: number, exclusions: Set<string>): boolean {
  return exclusions.has(key(Math.abs(rowsAway), Math.abs(baysAway)))
}

/** The largest row-distance and bay-offset present in a cell set (0 if
 * empty) — how far the layout algorithm needs to look, and how far the
 * visual grid needs to reach to show every toggled cell. */
export function exclusionBounds(cells: JoinExclusionCell[]): { maxD: number; maxB: number } {
  let maxD = 0
  let maxB = 0
  for (const c of cells) {
    if (Math.abs(c.d) > maxD) maxD = Math.abs(c.d)
    if (Math.abs(c.b) > maxB) maxB = Math.abs(c.b)
  }
  return { maxD, maxB }
}

/** The old two-threshold rule (adjacent-row stagger + same-row spacing,
 * tapering beyond the immediate neighbour), expanded into an explicit cell
 * list — used to seed a new deck's default pattern and to migrate decks
 * saved before per-cell toggling existed. */
export function defaultExclusionCells(minStaggerJoists: number, minSameRowJoinJoists: number): JoinExclusionCell[] {
  const cells: JoinExclusionCell[] = []
  const maxD = Math.max(minStaggerJoists, 0)
  const maxB = Math.max(minSameRowJoinJoists, 0)
  for (let d = 0; d <= maxD; d++) {
    for (let b = 0; b <= maxB; b++) {
      if (d === 0 && b === 0) continue
      if (taperedRule(d, b, minStaggerJoists, minSameRowJoinJoists)) cells.push({ d, b })
    }
  }
  return cells
}

function taperedRule(d: number, b: number, minStaggerJoists: number, minSameRowJoinJoists: number): boolean {
  if (d === 0) return b < minSameRowJoinJoists
  if (d === 1) return b < minStaggerJoists
  if (d > minStaggerJoists) return false
  const width = minSameRowJoinJoists - (d - 1)
  return width > 0 && b < width
}
