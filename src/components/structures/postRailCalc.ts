/** Structure-agnostic math shared by any post-and-rail build — retaining
 * walls, paling fences, anything spaced out along a run and filled in
 * between. No knowledge of what's being built lives here; that's the
 * domain calculator's job (see retainingWall/retainingWallCalc.ts). */

/** Evenly spaces posts along a run no wider than maxSpacingM apart, rather
 * than leaving an odd leftover gap at one end: works out how many bays
 * that forces, then spreads posts across the actual run length. */
export function calcPostLayout(
  runLengthM: number,
  maxSpacingM: number
): { postCount: number; bayCount: number; actualSpacingM: number } {
  const bayCount = Math.max(1, Math.ceil(runLengthM / maxSpacingM))
  const actualSpacingM = runLengthM / bayCount
  return { postCount: bayCount + 1, bayCount, actualSpacingM }
}

/** Cylindrical posthole fill volume (concrete or compacted gravel). */
export function calcHoleVolumeM3(diameterM: number, depthM: number): number {
  const r = diameterM / 2
  return Math.PI * r * r * depthM
}

/** How many stock-length pieces are needed to cover a total linear run —
 * simple butt-jointed coverage, not a cutting plan (see the decking
 * calculator's layout engine for that level of detail; this is meant to
 * stay a rough materials estimate). */
export function calcLinearPieceCount(totalLengthM: number, standardLengthM: number): number {
  if (standardLengthM <= 0) return 0
  return Math.max(0, Math.ceil(totalLengthM / standardLengthM))
}
