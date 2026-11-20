/** Stair geometry, framing and decking-board layout for a straight flight
 * of external deck stairs.
 *
 * All lengths are in millimetres. Coordinates for the drawings: x runs
 * horizontally from the face of the bottom riser (the front of the first
 * wedge block) back towards the deck, y runs up from the ground, so the
 * finished top of tread i sits at y = i × rise.
 *
 * Rise and going limits are NZ Building Code clause D1 (Acceptable
 * Solution D1/AS1, Table 7): a main private stair is max 190 rise / min
 * 280 going / max 37°, a service stair (not the main way in, e.g. to a
 * back yard or plant area) is allowed up to 220 rise / 220 going / 47°.
 * Both need 2R + G between 550 and 700. */

export type FramingType = "wedge-blocks" | "outer-stringers" | "stacked-frames"

export const FRAMING_LABELS: Record<FramingType, string> = {
  "wedge-blocks": "Straight stringers + wedge blocks",
  "outer-stringers": "Two outer stringers + riser joists",
  "stacked-frames": "Stacked step frames",
}

/** Outer-stringer stairs: each riser joist runs this far below the top of
 * the tread framing beneath it, so nogs this deep fit between joists. */
export const NOG_DEPTH = 90

/** Maximum stringer ("string") spans for SG8 H3.2 45 mm thick timber, as
 * quoted from BRANZ "External stairs for houses". Taken as the length
 * along the stringer between supports (the conservative reading). */
export const STRINGER_SPANS = [
  { depth: 140, span: 1900 },
  { depth: 190, span: 2600 },
  { depth: 240, span: 3300 },
  { depth: 290, span: 4000 },
] as const

/** Allowed span for a stringer depth: the table value for the deepest
 * table size it's at least as deep as; shallower than 140 scales down. */
export function maxStringerSpan(depth: number): number {
  let span: number = (STRINGER_SPANS[0].span * depth) / STRINGER_SPANS[0].depth
  for (const row of STRINGER_SPANS) if (depth >= row.depth - 0.5) span = row.span
  return span
}

/** Intermediate support posts: H5 posts set in concrete. */
export const POST_SIZE = 125
export const POST_EMBED = 450
/** posts along a bearer under several stringers, no further apart than this */
export const BEARER_POST_SPACING = 1200

/** Standard timber depths to rip riser joists from. */
export const TIMBER_DEPTHS = [90, 140, 190, 240, 290]

/** Common NZ decking boards, with the support spacing each can span on a
 * stair tread (thinner boards need closer stringers / joists). */
export const BOARD_PRESETS = [
  { width: 140, thickness: 20, maxSpan: 450 },
  { width: 140, thickness: 32, maxSpan: 600 },
  { width: 90, thickness: 20, maxSpan: 450 },
  { width: 90, thickness: 32, maxSpan: 600 },
] as const

/** Past this many treads, stacked frames get heavy and timber-hungry. */
export const STACKED_FRAMES_SUGGESTED_MAX = 3

export type ComplianceLevel = "main" | "service" | "fail"

export interface StairCategoryRules {
  label: string
  maxRise: number
  minGoing: number
  maxPitchDeg: number
}

export const MAIN_PRIVATE: StairCategoryRules = {
  label: "Main private stair",
  maxRise: 190,
  minGoing: 280,
  maxPitchDeg: 37,
}

export const SERVICE: StairCategoryRules = {
  label: "Service stair",
  maxRise: 220,
  minGoing: 220,
  maxPitchDeg: 47,
}

export const TWO_R_PLUS_G = { min: 550, max: 700 }

/** where the rise, run and pitch limits come from, for the warnings */
export const STAIR_RULES_REF = "NZBC D1/AS1 Table 7"

/** Gap at an open riser (or between balusters) a 100 mm sphere mustn't fit
 * through where young children could be about — NZBC F4. */
export const OPEN_RISER_MAX_GAP = 100

/** Below this a ripped board is too thin to fix without it splitting. */
export const MIN_RIP = 30
/** A last ripped board narrower than this isn't cut at all: it's left
 * out (a sliver that small isn't worth a board, and does nothing), and
 * the boards before it stay where they are. */
export const SLIVER_MAX = 20

/** Auto nosing only picks a whole-board fit when the overhang it gives is
 * within this range — otherwise falls back to DEFAULT_NOSING plus a rip. */
export const AUTO_NOSING_MAX = 40
export const DEFAULT_NOSING = 20

export const STOCK_LENGTHS_M = [2.4, 3.0, 3.6, 4.2, 4.8, 5.4, 6.0]

const SAW_KERF = 5

/** the riser's ripped board: at the top (under the tread above) or the
 * bottom (on the tread below) */
export type RiserRip = "top" | "bottom"

export interface StairInput {
  totalRise: number
  /** null = the fewest risers that keep every rise within 190 */
  risers: number | null
  going: number
  width: number
  framing: FramingType
  /** null = auto: stringers sized off the span table, frames off their height */
  stringerDepth: number | null
  stringerThickness: number
  maxStringerSpacing: number
  boardWidth: number
  boardGap: number
  boardThickness: number
  /** null = auto (a whole number of boards covers each tread exactly) */
  nosing: number | null
  riserBoards: boolean
  /** mm between riser boards (0 = tight) */
  riserBoardGap: number
  /** where the riser's ripped (narrower) board goes */
  riserRip: RiserRip
  /** a tread's boards ripped to a width by hand, front to back (null or
   * missing = full width; the last board is always ripped to fit) */
  treadBoardSizes: (number | null)[]
  /** the same for a riser's boards, in the order they're laid */
  riserBoardSizes: (number | null)[]
  /** flights from the ground up; the last always takes whatever risers are
   * left over (treads: null). One flight and no turns = a straight stair. */
  flights: FlightSpec[]
  /** turns.length === flights.length − 1; turn i joins flight i to i + 1 */
  turns: TurnSpec[]
}

export const DEFAULT_INPUT: StairInput = {
  totalRise: 1000,
  risers: null,
  going: MAIN_PRIVATE.minGoing,
  width: 1000,
  framing: "wedge-blocks",
  stringerDepth: null,
  stringerThickness: 45,
  maxStringerSpacing: 450,
  boardWidth: 140,
  boardGap: 5,
  boardThickness: 20,
  nosing: null,
  riserBoards: false,
  riserBoardGap: 0,
  riserRip: "top",
  treadBoardSizes: [],
  riserBoardSizes: [],
  flights: [{ treads: null }],
  turns: [],
}

export interface FlightSpec {
  /** null = the remainder (only the last flight) */
  treads: number | null
}

export type TurnKind = "landing" | "winders"
export type TurnDirection = "left" | "right"

export interface TurnSpec {
  kind: TurnKind
  direction: TurnDirection
  /** degrees, 1–180; 90 is a quarter turn, 180 a U-turn */
  angle: number
  /** number of winder treads (kind "winders") */
  winders: number
}

export const DEFAULT_TURN: TurnSpec = { kind: "landing", direction: "left", angle: 90, winders: 3 }

export interface Pt {
  x: number
  y: number
}

export interface BoardPiece {
  /** distance back from the front (nosing) edge of the tread */
  offset: number
  width: number
  ripped: boolean
  /** which board it is in the order they're laid (front to back on a
   * tread; from the ripped end's far side on a riser) — the key a width
   * set by hand is kept under */
  index: number
}

export interface StockPlan {
  lengthM: number
  piecesPerLength: number
  lengths: number
  totalM: number
}

export interface MixedStockPlan {
  lengthM: number
  lengths: number
  totalM: number
}

/** One box of the stacked-frames stair: a rectangular frame of timber on
 * edge, sitting on the frame below and one going shorter than it. */
export interface StepFrame {
  step: number
  x0: number
  x1: number
  y0: number
  y1: number
  height: number
  /** front to back, outside of the frame */
  depth: number
  /** the front-to-back joists, between the front and back rails */
  joistLength: number
}

/** A riser joist across the stair (outer-stringer framing), seen end on. */
export interface RiserJoist {
  /** 1 = bottom riser; the last one is the ledger against the deck */
  index: number
  x0: number
  x1: number
  y0: number
  y1: number
  height: number
  ledger: boolean
}

/** A nog between two riser joists, on an intermediate support line. */
export interface Nog {
  tread: number
  x0: number
  x1: number
  y0: number
  y1: number
}

/** A support line under the stringers part way up. */
export interface SupportPost {
  x: number
  /** ground to the underside of the stringer */
  height: number
}

export interface StairResult {
  risers: number
  treads: number
  rise: number
  going: number
  totalRun: number
  pitchDeg: number
  twoRPlusG: number
  compliance: ComplianceLevel
  /** a fail reason per broken rule (empty when compliant at some level) */
  failures: string[]
  /** shown when it only passes as a service stair */
  serviceNotes: string[]
  fewestRisersMain: number
  fewestRisersService: number

  nosing: number
  nosingAuto: boolean
  treadDepth: number
  treadBoards: BoardPiece[]
  /** a sliver at the back of each tread too thin to cut, left out (mm; 0
   * when there isn't one) — see SLIVER_MAX */
  treadSliver: number
  /** whole-board-fit nosing worth suggesting when the current layout has a rip */
  suggestedNosing: number | null
  riserHeight: number
  riserBoardPieces: BoardPiece[]
  /** as treadSliver, on each riser */
  riserSliver: number
  openRiserGap: number

  /** what carries the tread boards: stringers, or the frames' joists */
  supports: {
    count: number
    spacing: number
    /** centre-line positions across the width, from the left */
    positions: number[]
  }
  /** stringer / frame timber depth actually used */
  timberDepth: number
  depthAuto: boolean
  stringer: {
    /** allowed span for the depth used */
    maxSpan: number
    /** spans the stringer is split into by the support posts */
    spans: number
    posts: SupportPost[]
    /** posts per support line (more than the stringers carry a bearer) */
    postsPerLine: number
    bearer: boolean
    postLength: number
    angleDeg: number
    topEdgeLength: number
    polygon: Pt[]
    /** horizontal distance from the bottom riser face back to the toe */
    toeX: number
    plumbCutHeight: number
    levelCutLength: number
    stock: StockPlan | null
  }
  wedges: {
    perStringer: number
    total: number
    hypotenuse: number
    /** bottom block loses this off its point so it sits flat on the ground */
    bottomTrim: number
    polygons: Pt[][]
    /** board length to cut them all from */
    stockLengthM: number
    /** true: paired into R × G rectangles split on the diagonal; false: the
     * rise is wider than the stock, so they nest long-side-to-the-edge */
    rectangles: boolean
    fitsInStringerOffcuts: boolean
    /** depth of board the wedges are cut from */
    stockDepth: number
    needsWiderBoard: boolean
  }
  frames: {
    list: StepFrame[]
    /** each frame: front rail, back rail and this many joists between */
    joistsPerFrame: number
    railLength: number
    pieceCount: number
    linealM: number
    stock: MixedStockPlan | null
    /** tallest frame is deeper than the timber */
    timberTooShallow: boolean
    tallest: number
  }
  riserJoists: {
    list: RiserJoist[]
    length: number
    tallest: number
    /** smallest standard depth that covers the tallest joist, or null if none does */
    ripFrom: number | null
    stock: StockPlan | null
    nogs: Nog[]
    /** nog lines across the width (where middle stringers would be) */
    nogLines: number[]
    nogStock: MixedStockPlan | null
    nogLinealM: number
  }
  boards: {
    treadPieces: number
    riserPieces: number
    pieceLength: number
    stock: StockPlan | null
    linealM: number
  }
  screws: number
}

/** Fewest risers that keep the rise within a maximum. */
export const fewestRisers = (totalRise: number, maxRise: number) => Math.max(1, Math.ceil(totalRise / maxRise - 1e-9))

/** Lay boards from the front edge back, full width where they fit (or
 * the width a board's been ripped to by hand, `sizes[i]`, never wider
 * than a full board), the last one ripped to whatever's left. */
export function layBoards(depth: number, boardWidth: number, gap: number, sizes: (number | null)[] = []): BoardPiece[] {
  return layBoardsLeavingSliver(depth, boardWidth, gap, sizes).pieces
}

/** layBoards, and how wide a last sliver (under SLIVER_MAX) left out was
 * (0 when nothing was) — never one sized by hand, nor the only board. */
export function layBoardsLeavingSliver(
  depth: number,
  boardWidth: number,
  gap: number,
  sizes: (number | null)[] = [],
): { pieces: BoardPiece[]; leftOut: number } {
  const pieces: BoardPiece[] = []
  let pos = 0
  while (depth - pos > 0.5 && pieces.length < 200) {
    const set = sizes[pieces.length]
    const want = set != null && set > 0 ? Math.min(boardWidth, set) : boardWidth
    const w = Math.min(want, depth - pos)
    pieces.push({ offset: pos, width: w, ripped: w < boardWidth - 0.5, index: pieces.length })
    pos += w + gap
  }
  const last = pieces[pieces.length - 1]
  if (pieces.length > 1 && last.ripped && last.width < SLIVER_MAX && !(sizes[last.index] != null && sizes[last.index]! > 0)) {
    pieces.pop()
    return { pieces, leftOut: last.width }
  }
  return { pieces, leftOut: 0 }
}

/** Widths that split `depth` into equal boards no wider than a full one,
 * with `gap` between — for a tread or riser that presents evenly. */
export function evenBoardSizes(depth: number, boardWidth: number, gap: number): number[] {
  const n = Math.max(1, Math.ceil((depth + gap) / (boardWidth + gap) - 1e-9))
  const w = Math.floor(((depth - gap * (n - 1)) / n) * 10) / 10
  return Array(n).fill(w)
}

/** Overhang that makes k whole boards (and their gaps) cover the tread
 * exactly — the smallest such k with an overhang of zero or more. */
function wholeBoardNosing(going: number, extra: number, boardWidth: number, gap: number): number {
  for (let k = 1; k < 20; k++) {
    const nosing = k * boardWidth + (k - 1) * gap - going - extra
    if (nosing >= 0) return nosing
  }
  return DEFAULT_NOSING
}

/** Cheapest standard length to cut equal pieces from. */
export function planStock(pieceLength: number, pieces: number, lengthsM = STOCK_LENGTHS_M): StockPlan | null {
  if (pieces <= 0) return null
  let best: StockPlan | null = null
  for (const lengthM of lengthsM) {
    const per = Math.floor((lengthM * 1000 + SAW_KERF) / (pieceLength + SAW_KERF))
    if (per < 1) continue
    const lengths = Math.ceil(pieces / per)
    const plan = { lengthM, piecesPerLength: per, lengths, totalM: lengths * lengthM }
    if (!best || plan.totalM < best.totalM - 1e-9) best = plan
  }
  return best
}

/** Cheapest standard length to cut a mix of piece lengths from, packed
 * longest first into whichever length is already open (first fit). */
export function planMixedStock(pieces: number[], lengthsM = STOCK_LENGTHS_M): MixedStockPlan | null {
  if (pieces.length === 0) return null
  const sorted = [...pieces].sort((a, b) => b - a)
  let best: MixedStockPlan | null = null
  for (const lengthM of lengthsM) {
    const L = lengthM * 1000
    if (sorted[0] > L) continue
    const free: number[] = []
    for (const p of sorted) {
      const i = free.findIndex((f) => f >= p)
      if (i >= 0) free[i] -= p + SAW_KERF
      else free.push(L - p - SAW_KERF)
    }
    const plan = { lengthM, lengths: free.length, totalM: free.length * lengthM }
    if (!best || plan.totalM < best.totalM - 1e-9) best = plan
  }
  return best
}

/** Clip a polygon to y ≥ 0 (Sutherland–Hodgman against one edge). */
function clipAboveGround(poly: Pt[]): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const aIn = a.y >= -1e-9
    const bIn = b.y >= -1e-9
    if (aIn) out.push(a)
    if (aIn !== bIn) {
      const t = a.y / (a.y - b.y)
      out.push({ x: a.x + t * (b.x - a.x), y: 0 })
    }
  }
  return out
}

export function calculateStairs(input: StairInput): StairResult {
  const H = Math.max(input.totalRise, 1)
  const fewestRisersMain = fewestRisers(H, MAIN_PRIVATE.maxRise)
  const fewestRisersService = fewestRisers(H, SERVICE.maxRise)
  const risers = Math.max(1, Math.round(input.risers ?? fewestRisersMain))
  const treads = risers - 1
  const R = H / risers
  const G = Math.max(input.going, 1)
  const t = input.boardThickness
  const pitchDeg = (Math.atan2(R, G) * 180) / Math.PI
  const twoRPlusG = 2 * R + G

  // ---- compliance --------------------------------------------------------
  const check = (rules: StairCategoryRules) => {
    const broken: string[] = []
    const what = rules.label.toLowerCase()
    if (R > rules.maxRise + 0.05)
      broken.push(`rise ${Math.round(R)} mm is over the ${rules.maxRise} mm maximum for a ${what} (${STAIR_RULES_REF})`)
    if (G < rules.minGoing - 0.05)
      broken.push(`run ${Math.round(G)} mm is under the ${rules.minGoing} mm minimum for a ${what} (${STAIR_RULES_REF})`)
    if (pitchDeg > rules.maxPitchDeg + 0.05)
      broken.push(`pitch ${pitchDeg.toFixed(1)}° is steeper than the ${rules.maxPitchDeg}° maximum for a ${what} (${STAIR_RULES_REF})`)
    return broken
  }
  const twoRBroken: string[] = []
  if (twoRPlusG < TWO_R_PLUS_G.min) twoRBroken.push(`2 × rise + run is ${Math.round(twoRPlusG)} mm, under the ${TWO_R_PLUS_G.min} mm minimum (it must be ${TWO_R_PLUS_G.min}–${TWO_R_PLUS_G.max} mm, NZBC D1/AS1) — with this rise, a run of at least ${Math.ceil(TWO_R_PLUS_G.min - 2 * R)} mm`)
  if (twoRPlusG > TWO_R_PLUS_G.max) twoRBroken.push(`2 × rise + run is ${Math.round(twoRPlusG)} mm, over the ${TWO_R_PLUS_G.max} mm maximum (it must be ${TWO_R_PLUS_G.min}–${TWO_R_PLUS_G.max} mm, NZBC D1/AS1) — with this rise, a run of ${Math.floor(TWO_R_PLUS_G.max - 2 * R)} mm or less`)
  const mainBroken = [...check(MAIN_PRIVATE), ...twoRBroken]
  const serviceBroken = [...check(SERVICE), ...twoRBroken]
  const compliance: ComplianceLevel =
    treads === 0 ? "main" : mainBroken.length === 0 ? "main" : serviceBroken.length === 0 ? "service" : "fail"
  const failures = compliance === "fail" ? serviceBroken : []
  const serviceNotes = compliance === "service" ? mainBroken : []

  // ---- decking boards on the treads -------------------------------------
  const riserT = input.riserBoards ? t : 0
  const nosingAuto = input.nosing === null
  let nosing: number
  if (nosingAuto) {
    const fit = wholeBoardNosing(G, riserT, input.boardWidth, input.boardGap)
    nosing = fit <= AUTO_NOSING_MAX ? fit : DEFAULT_NOSING
  } else {
    nosing = Math.max(0, input.nosing ?? 0)
  }
  const treadDepth = G + riserT + nosing
  const { pieces: treadBoards, leftOut: treadSliver } = layBoardsLeavingSliver(treadDepth, input.boardWidth, input.boardGap, input.treadBoardSizes)
  const hasRip = treadBoards.some((b) => b.ripped)
  const fitNosing = wholeBoardNosing(G, riserT, input.boardWidth, input.boardGap)
  const suggestedNosing = hasRip && fitNosing <= AUTO_NOSING_MAX && Math.abs(fitNosing - nosing) > 0.5 ? fitNosing : null

  // riser boards stack up from the tread below to the underside of the
  // tread above (offsets from the bottom), the ripped one at the top or
  // the bottom
  const riserHeight = R - t
  const riserLay = input.riserBoards ? layBoardsLeavingSliver(riserHeight, input.boardWidth, Math.max(0, input.riserBoardGap), input.riserBoardSizes) : { pieces: [], leftOut: 0 }
  const riserLaid = riserLay.pieces
  const riserSliver = riserLay.leftOut
  const riserBoardPieces =
    input.riserRip === "bottom" ? riserLaid.map((b) => ({ ...b, offset: riserHeight - b.offset - b.width })).reverse() : riserLaid
  const openRiserGap = input.riserBoards ? 0 : riserHeight

  // ---- stringers ---------------------------------------------------------
  // straight (uncut) stringer; its top edge runs through the bottom-front
  // and top-back corners of every wedge: y = (R/G)·x − t
  const slope = R / G
  const cos = Math.cos(Math.atan(slope))
  const xTopEarly = treads * G
  const stringerLength = treads > 0 ? Math.hypot(xTopEarly - t / slope, slope * xTopEarly - t) : 0
  const tallestFrameEarly = treads >= 2 ? R : R - t
  const autoDepth =
    input.framing === "stacked-frames"
      ? (TIMBER_DEPTHS.find((d) => d >= tallestFrameEarly - 0.5) ?? 290)
      : (STRINGER_SPANS.find((r) => r.span >= stringerLength)?.depth ?? 290)
  const D = input.stringerDepth ?? autoDepth
  const vDepth = D / cos // vertical depth of the stringer
  const xTop = treads * G // plumb cut against the deck's boundary joist
  const yTopAtTop = slope * xTop - t
  const toeX = t / slope // where the top edge meets the ground
  const heelX = (t + vDepth) / slope // where the bottom edge meets the ground

  let polygon: Pt[] = []
  let topEdgeLength = 0
  let plumbCutHeight = 0
  let levelCutLength = 0
  // both stringer types draw the same straight stringer and wedges; the
  // outer-stringer type just has two of them, joists and nogs between
  const wedgeFraming = input.framing !== "stacked-frames"
  const outerOnly = input.framing === "outer-stringers"
  if (treads > 0 && wedgeFraming) {
    // level cut on the ground from toe to heel, plumb cut against the deck
    // (if the stringer is deep enough to reach the ground there, the level
    // cut just runs all the way back)
    const bottomAtTop = Math.max(0, yTopAtTop - vDepth)
    polygon =
      heelX < xTop
        ? [
            { x: toeX, y: 0 },
            { x: heelX, y: 0 },
            { x: xTop, y: bottomAtTop },
            { x: xTop, y: yTopAtTop },
          ]
        : [
            { x: toeX, y: 0 },
            { x: xTop, y: 0 },
            { x: xTop, y: yTopAtTop },
          ]
    topEdgeLength = Math.hypot(xTop - toeX, yTopAtTop)
    plumbCutHeight = yTopAtTop - bottomAtTop
    levelCutLength = Math.min(heelX, xTop) - toeX
  }

  const b = input.stringerThickness
  const clearWidth = Math.max(input.width - b, 1)
  const spaces = Math.max(1, Math.ceil(clearWidth / Math.max(input.maxStringerSpacing, 100) - 1e-9))
  const supportCount = treads > 0 ? spaces + 1 : 0
  const stringerCount = wedgeFraming ? (outerOnly ? Math.min(2, supportCount) : supportCount) : 0
  const spacing = clearWidth / spaces
  const positions = Array.from({ length: supportCount }, (_, i) => b / 2 + i * spacing)
  const stringerStock = planStock(topEdgeLength + 20, stringerCount)

  // ---- support posts part way up (span too long for the stringer size) ----
  const maxSpan = maxStringerSpan(D)
  const spans = treads > 0 && wedgeFraming ? Math.max(1, Math.ceil(topEdgeLength / maxSpan - 1e-9)) : 1
  const posts: SupportPost[] = []
  for (let k = 1; k < spans; k++) {
    const x = toeX + (k / spans) * (xTop - toeX)
    posts.push({ x, height: Math.max(0, slope * x - t - vDepth) })
  }
  // two stringers: a post straight under each; more: a bearer across under
  // them all, on posts at its ends and no more than BEARER_POST_SPACING apart
  const bearer = stringerCount > 2
  const postsPerLine = bearer ? Math.ceil(input.width / BEARER_POST_SPACING) + 1 : stringerCount
  const postLength = posts.reduce((mx, p) => Math.max(mx, p.height), 0) + POST_EMBED

  // ---- wedge blocks ------------------------------------------------------
  const wedgePolys: Pt[][] = []
  for (let i = 1; i <= (wedgeFraming ? treads : 0); i++) {
    const tri = [
      { x: (i - 1) * G, y: i * R - t }, // front top (under the nosing)
      { x: i * G, y: i * R - t }, // back top
      { x: (i - 1) * G, y: (i - 1) * R - t }, // front bottom
    ]
    wedgePolys.push(clipAboveGround(tri))
  }
  const hypotenuse = Math.hypot(R, G)
  const wedgeTotal = treads * stringerCount
  // two wedges per R × G rectangle, cut on the diagonal
  const wedgeRunPerStringer = Math.ceil(treads / 2) * (G + SAW_KERF)
  const offcutPerStringer = stringerStock
    ? (stringerStock.lengthM * 1000) / stringerStock.piecesPerLength - topEdgeLength - 20
    : 0
  const fitsInStringerOffcuts = stringerStock !== null && stringerStock.piecesPerLength === 1 && offcutPerStringer >= wedgeRunPerStringer
  // the triangle's height off its long side — the narrowest board it fits
  const altitude = (R * G) / hypotenuse
  // from the stringer offcuts when they're deep enough, else the smallest
  // standard board that takes an R × G rectangle
  const wedgeStockDepth = R <= D ? D : (TIMBER_DEPTHS.find((d) => d >= R) ?? 290)
  const rectangles = R <= wedgeStockDepth
  const wedgeStockLengthM = rectangles
    ? (Math.ceil(wedgeTotal / 2) * (G + SAW_KERF)) / 1000
    : (Math.ceil((wedgeTotal + 1) / 2) * (hypotenuse + SAW_KERF)) / 1000

  // ---- stacked step frames -------------------------------------------------
  // step k's frame runs from its own riser face all the way back to the
  // deck, sitting on the framing of step k − 1 (the bottom one on the
  // ground), its top a board thickness under the finished tread
  const frameList: StepFrame[] = []
  if (!wedgeFraming) {
    for (let k = 1; k <= treads; k++) {
      const x0 = (k - 1) * G
      const x1 = treads * G
      const y0 = k === 1 ? 0 : (k - 1) * R - t
      const y1 = k * R - t
      frameList.push({ step: k, x0, x1, y0, y1, height: y1 - y0, depth: x1 - x0, joistLength: x1 - x0 - 2 * b })
    }
  }
  const framePieces = frameList.flatMap((f) => [
    input.width,
    input.width,
    ...Array<number>(supportCount).fill(Math.max(f.joistLength, 0)),
  ])
  const tallestFrame = frameList.reduce((mx, f) => Math.max(mx, f.height), 0)

  // ---- riser joists and nogs (outer-stringer framing) ---------------------
  // joist i sits behind riser face i, from the top of tread i's framing down
  // to NOG_DEPTH below the top of tread i−1's framing (the ground for the
  // bottom one); the last is a ledger in front of the deck's boundary joist
  const joistList: RiserJoist[] = []
  const nogs: Nog[] = []
  const nogLines = outerOnly ? positions.slice(1, -1) : []
  if (outerOnly && treads > 0) {
    for (let i = 1; i <= risers; i++) {
      const ledger = i === risers
      const x0 = ledger ? treads * G - b : (i - 1) * G
      const y1 = i * R - t
      const y0 = Math.max(0, (i - 1) * R - t - NOG_DEPTH)
      joistList.push({ index: i, x0, x1: x0 + b, y0, y1, height: y1 - y0, ledger })
    }
    for (let i = 1; i <= treads; i++) {
      const x0 = joistList[i - 1].x1
      const x1 = joistList[i].x0
      for (let n = 0; n < nogLines.length; n++) nogs.push({ tread: i, x0, x1, y0: i * R - t - NOG_DEPTH, y1: i * R - t })
    }
  }
  const joistLength = Math.max(input.width - 2 * b, 0)
  const tallestJoist = joistList.reduce((mx, j) => Math.max(mx, j.height), 0)
  const nogPieces = nogs.map((n) => n.x1 - n.x0)

  // ---- board order ---------------------------------------------------------
  const treadPieces = treads * treadBoards.length
  // top riser (deck edge) gets boards too
  const riserPieces = input.riserBoards ? risers * riserBoardPieces.length : 0
  const pieceLength = input.width
  const boardStock = planStock(pieceLength, treadPieces + riserPieces)
  const linealM = ((treadPieces + riserPieces) * pieceLength) / 1000

  // two screws per board per stringer / joist; riser boards screw into the
  // wedge or frame faces
  const screws = 2 * (treadPieces + riserPieces) * supportCount

  return {
    risers,
    treads,
    rise: R,
    going: G,
    totalRun: treads * G,
    pitchDeg,
    twoRPlusG,
    compliance,
    failures,
    serviceNotes,
    fewestRisersMain,
    fewestRisersService,
    nosing,
    nosingAuto,
    treadDepth,
    treadBoards,
    treadSliver,
    suggestedNosing,
    riserHeight,
    riserBoardPieces,
    riserSliver,
    openRiserGap,
    supports: { count: supportCount, spacing, positions },
    timberDepth: D,
    depthAuto: input.stringerDepth === null,
    stringer: {
      maxSpan,
      spans,
      posts,
      postsPerLine,
      bearer,
      postLength,
      angleDeg: pitchDeg,
      topEdgeLength,
      polygon,
      toeX,
      plumbCutHeight,
      levelCutLength,
      stock: stringerStock,
    },
    wedges: {
      perStringer: treads,
      total: wedgeTotal,
      hypotenuse,
      bottomTrim: treads > 0 && wedgeFraming ? t : 0,
      polygons: wedgePolys,
      stockLengthM: wedgeStockLengthM,
      fitsInStringerOffcuts,
      rectangles,
      stockDepth: wedgeStockDepth,
      needsWiderBoard: altitude > wedgeStockDepth,
    },
    frames: {
      list: frameList,
      joistsPerFrame: supportCount,
      railLength: input.width,
      pieceCount: framePieces.length,
      linealM: framePieces.reduce((a, p) => a + p, 0) / 1000,
      stock: planMixedStock(framePieces),
      timberTooShallow: tallestFrame > D + 0.5,
      tallest: tallestFrame,
    },
    riserJoists: {
      list: joistList,
      length: joistLength,
      tallest: tallestJoist,
      ripFrom: TIMBER_DEPTHS.find((d) => d >= tallestJoist - 0.5) ?? null,
      stock: planStock(joistLength, joistList.length),
      nogs,
      nogLines,
      nogStock: planMixedStock(nogPieces),
      nogLinealM: nogPieces.reduce((a, p) => a + p, 0) / 1000,
    },
    boards: { treadPieces, riserPieces, pieceLength, stock: boardStock, linealM },
    screws,
  }
}
