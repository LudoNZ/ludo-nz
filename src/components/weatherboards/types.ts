/** A point on a wall's top or bottom edge: `x` mm from the wall's left
 * end, `y` mm above the project datum (FFL, top of slab — whatever the
 * elevations are drawn from; negative is fine for a wall dropping below it). */
export interface EdgePoint {
  id: string
  x: number
  y: number
}

/** One edge of a wall, left to right. `left` sits at x = 0 and `right` at
 * x = wall length, so a wall's ends always track its length; `breaks` are
 * the in-between points where a rake starts, peaks or changes pitch —
 * which is how a rake that only starts part way along is described. */
export interface WallEdge {
  left: number
  right: number
  breaks: EdgePoint[]
}

/** A window or door cut out of the cladding. `x` is its left side from
 * the wall's left end, `sill` its bottom above datum (0-ish for a door). */
export interface Opening {
  id: string
  x: number
  sill: number
  width: number
  height: number
  /** Placed by the automatic window layout and free to be re-spaced;
   * cleared the moment it's dragged or its numbers are edited. */
  auto?: boolean
}

/** What finishes each end of a wall. External corners get a facing on
 * each wall (fixed over the board ends) unless they're box corners or mitred;
 * an internal corner gets one scriber, so mark it on one of its two walls. */
export type WallEnd = "externalFacing" | "externalBox" | "internalScriber" | "none"

export interface Wall {
  id: string
  name: string
  lengthMm: number
  top: WallEdge
  bottom: WallEdge
  openings: Opening[]
  leftEnd: WallEnd
  rightEnd: WallEnd
  /** Overrides the project course spacing for this wall only. */
  coverMm: number | null
}

export interface Elevation {
  id: string
  name: string
  walls: Wall[]
}

export interface WeatherboardSettings {
  /** Vertical course spacing — the board's cover, not its width. */
  coverMm: number
  /** Board joins land on studs at these centres, measured from each wall's left end. */
  studSpacingMm: number
  /** Added to every cut piece for squaring / rake trimming / the saw kerf. */
  cutAllowanceMm: number
  /** Board lengths the yard can supply (mm), enabled ones only. */
  stockLengthsMm: number[]
  /** Extra stock on top of the optimised order, for splits and miscuts. */
  sparePercent: number
  /** Face width of corner and opening facings — they sit over the boards. */
  facingWidthMm: number
  /** How far a head flashing runs past the facings, each side. */
  flashingLapMm: number
  /** Lengths facings and scribers come in (mm). */
  trimLengthsMm: number[]
}

export interface WeatherboardProject {
  settings: WeatherboardSettings
  elevations: Elevation[]
}
