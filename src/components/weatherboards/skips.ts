/** Marking boards "don't count". Pure, no React.
 *
 * A skip is a point on the wall (see Wall.skips); a board is skipped when
 * a point falls inside it. Skipping a board drops a point at its centre;
 * counting it again removes every point inside it. */

import { Wall } from "./types"
import { WallResult } from "./weatherboardCalc"

export const setBoardSkipped = (wall: Wall, result: WallResult, courseIndex: number, pieceIndex: number, skip: boolean): Wall => {
  const course = result.courses.find((c) => c.index === courseIndex)
  const piece = course?.pieces[pieceIndex]
  if (!course || !piece || !!piece.skipped === skip) return wall
  const inside = (k: { x: number; y: number }) =>
    k.y >= course.bottom && k.y < course.top && k.x >= piece.start && k.x <= piece.end
  const skips = skip
    ? [...(wall.skips ?? []), { x: Math.round((piece.start + piece.end) / 2), y: Math.round((course.bottom + course.top) / 2) }]
    : (wall.skips ?? []).filter((k) => !inside(k))
  if (skips.length) return { ...wall, skips }
  const { skips: _gone, ...rest } = wall
  void _gone
  return rest
}

export interface SkipTotals {
  boards: number
  mm: number
}

export const skipTotals = (results: WallResult[]): SkipTotals => {
  let boards = 0
  let mm = 0
  for (const r of results)
    for (const c of r.courses)
      for (const p of c.pieces)
        if (p.skipped) {
          boards++
          mm += p.cutLength
        }
  return { boards, mm }
}
