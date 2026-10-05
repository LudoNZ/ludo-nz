/** Scribers, facings and flashings for one wall. Pure math, no React.
 *
 * Rule-of-thumb NZ bevel-back detailing:
 * - external corner with facings: one facing per wall, full height of
 *   that wall end (the other wall brings its own)
 * - internal corner: one scriber full height, counted on the wall it's
 *   marked on
 * - each opening: two jamb facings running up past the head to the top
 *   of the head facing, a head facing across both jambs, a scriber
 *   against each jamb facing, and a head flashing past both facings
 * Sill trims are left to the joinery. */

import { Wall, WallEnd, WeatherboardSettings } from "./types"
import { edgePoints } from "./weatherboardCalc"

export type TrimKind = "facing" | "scriber" | "flashing"

export interface TrimPiece {
  kind: TrimKind
  length: number
  label: string
}

export const TRIM_LABELS: Record<TrimKind, string> = {
  facing: "Facings",
  scriber: "Scribers",
  flashing: "Head flashings",
}

export const calculateTrims = (wall: Wall, s: WeatherboardSettings, prefix: string): TrimPiece[] => {
  const L = wall.lengthMm
  if (L <= 0) return []
  const fw = Math.max(0, s.facingWidthMm ?? 0)
  const lap = Math.max(0, s.flashingLapMm ?? 0)
  const top = edgePoints(wall.top, L)
  const bottom = edgePoints(wall.bottom, L)
  const out: TrimPiece[] = []

  const end = (type: WallEnd | undefined, height: number, side: string) => {
    if (height <= 0) return
    const label = `${prefix} · ${side} corner`
    if ((type ?? "externalFacing") === "externalFacing") out.push({ kind: "facing", length: Math.ceil(height), label })
    else if (type === "internalScriber") out.push({ kind: "scriber", length: Math.ceil(height), label })
  }
  end(wall.leftEnd, top[0].y - bottom[0].y, "left")
  end(wall.rightEnd, top[top.length - 1].y - bottom[bottom.length - 1].y, "right")

  ;(wall.openings ?? []).forEach((o, i) => {
    if (o.width <= 0 || o.height <= 0) return
    const label = `${prefix} · opening ${i + 1}`
    out.push(
      { kind: "facing", length: Math.ceil(o.height + fw), label: `${label} jamb` },
      { kind: "facing", length: Math.ceil(o.height + fw), label: `${label} jamb` },
      { kind: "facing", length: Math.ceil(o.width + fw * 2), label: `${label} head` },
      { kind: "scriber", length: Math.ceil(o.height + fw), label: `${label} jamb` },
      { kind: "scriber", length: Math.ceil(o.height + fw), label: `${label} jamb` },
      { kind: "flashing", length: Math.ceil(o.width + fw * 2 + lap * 2), label },
    )
  })

  return out
}
