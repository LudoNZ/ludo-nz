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
  /** Trim parts of this unit left out of the order (skip mode). */
  skipParts?: Partial<Record<JoineryPart, boolean>>
}

/** The trim parts a window or door brings: facings (two jambs and a
 * head), scribers (the mouldings against the jamb facings) and the head
 * flashing. */
export type JoineryPart = "facings" | "scribers" | "flashing"

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
  /** Corners part way along the wall, where it steps in or out on plan. */
  corners?: WallCorner[]
  /** Boards left out of the order (existing cladding, someone else's
   * job…): each is a point on the wall, mm from its left end and above
   * datum, and whichever board covers that point isn't counted. Points
   * rather than board ids, so a skip stays on the same patch of wall
   * when other dimensions change. */
  skips?: SkipPoint[]
  leftEnd: WallEnd
  rightEnd: WallEnd
  /** Overrides the project course spacing for this wall only. */
  coverMm: number | null
  /** This wall's linked dimensions: measure kind ("width", "heightL",
   * "heightR", "break:<id>") → the anchor measure key it takes its value
   * from (see measures.ts). Absent or empty means nothing is linked. */
  links?: Record<string, string>
  /** Set while the wall is still edited through the quick form: what the
   * form needs beyond the wall's own dimensions. Cleared by "More
   * options", after which the wall uses the full editor. */
  quick?: QuickMeta
}

/** A corner part way along a wall. Boards can't wrap it, so courses
 * split there; an external corner takes a facing on each side, an
 * internal one a scriber. */
export interface WallCorner {
  id: string
  x: number
  type: "internal" | "external"
}

export interface SkipPoint {
  x: number
  y: number
}

export type QuickShape = "rectangle" | "gable" | "skillion" | "partRake"

export interface QuickMeta {
  shape: QuickShape
  windowWidthMm: number
  windowHeightMm: number
  headMm: number
  /** set once a measurement has been changed — the shape picker hides */
  shapeLocked?: boolean
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
