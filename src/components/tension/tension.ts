/** Pure physics for the tightline tension calculator: a symmetric two-leg
 * line — think tarp ridge line, highline, tow strap between two anchors —
 * with a single load W hung at the midpoint of span L, sagging a vertical
 * distance d below the anchor line.
 *
 * This is the simplified two-straight-legs model (each leg a straight
 * line from anchor to load), not a full catenary — no rope stretch, no
 * distributed self-weight. Good enough for the visualization and for
 * practical rigging use; not a substitute for manufacturer working-load
 * ratings.
 *
 *   h = L / 2                    half-span
 *   theta = atan(d / h)          sag angle, from the anchor line
 *   legLength = sqrt(h^2 + d^2)
 *   T = W / (2 * sin(theta))     tension per leg
 *
 * As d -> 0, theta -> 0 and T -> Infinity — a "dead straight" line under
 * any load at all is the classic rigging trap. Sag is floored well above
 * zero (see minSagM) so the maths never actually divides by zero.
 */

export const GRAVITY_MS2 = 9.80665

// Below this fraction of the span, treat sag as this floor rather than
// literally zero. theta -> 0 sends T -> Infinity, and a numeric input can
// always be typed down to 0 regardless of a slider's min.
const MIN_SAG_FRACTION_OF_SPAN = 0.0001 // 0.01%

export type WarningLevel = "none" | "caution" | "danger"

export const CAUTION_MULTIPLIER = 10
export const DANGER_MULTIPLIER = 20

export interface TensionInputs {
  spanM: number
  sagM: number
  loadKg: number
}

export interface TensionResult {
  halfSpanM: number
  /** Sag actually used, after flooring — what the diagram should draw. */
  sagM: number
  sagAngleRad: number
  sagAngleDeg: number
  legLengthM: number
  tensionPerLegN: number
  tensionPerLegKgf: number
  /** T ÷ (W / 2) — how many times worse than a straight vertical hang. */
  multiplicationFactor: number
  warningLevel: WarningLevel
}

/** Floor for sag so theta never hits exactly zero. */
export function minSagM(spanM: number): number {
  return Math.max(spanM * MIN_SAG_FRACTION_OF_SPAN, 1e-6)
}

/** Sag distance implied by a target sag angle — the inverse of theta =
 * atan(d / h), used by the "set the angle directly" input mode. */
export function sagFromAngle(spanM: number, angleRad: number): number {
  const halfSpanM = spanM / 2
  return halfSpanM * Math.tan(angleRad)
}

export function calculateTension({ spanM, sagM, loadKg }: TensionInputs): TensionResult {
  const halfSpanM = spanM / 2
  const clampedSagM = Math.max(sagM, minSagM(spanM))

  const sagAngleRad = Math.atan(clampedSagM / halfSpanM)
  const legLengthM = Math.sqrt(halfSpanM ** 2 + clampedSagM ** 2)

  const loadN = loadKg * GRAVITY_MS2
  const tensionPerLegN = loadN / (2 * Math.sin(sagAngleRad))
  const tensionPerLegKgf = tensionPerLegN / GRAVITY_MS2

  // T / (W/2) reduces to 1 / sin(theta) — independent of the load itself,
  // so it stays meaningful even at W = 0 (unlike dividing by a possibly-
  // zero static half-load).
  const multiplicationFactor = 1 / Math.sin(sagAngleRad)

  const warningLevel: WarningLevel =
    multiplicationFactor > DANGER_MULTIPLIER ? "danger" : multiplicationFactor > CAUTION_MULTIPLIER ? "caution" : "none"

  return {
    halfSpanM,
    sagM: clampedSagM,
    sagAngleRad,
    sagAngleDeg: (sagAngleRad * 180) / Math.PI,
    legLengthM,
    tensionPerLegN,
    tensionPerLegKgf,
    multiplicationFactor,
    warningLevel,
  }
}
