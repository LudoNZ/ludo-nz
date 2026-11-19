import type { ObstructionType } from "./obstructions"
import { SoilType } from "./retainingWallCalc"

/** One row of the reference table a CalcSettings is driven by — banded by
 * "up to this retained height", not a smooth curve, so it reads (and
 * displays) as a real ready-reference table rather than a hidden formula. */
export interface WallSpecRow {
  soil: SoilType
  /** m, this row applies for walls up to and including this retained height */
  maxHeightM: number
  postSizeLabel: string
  /** m, tightest allowed centres at this row's height/soil */
  maxSpacingM: number
  /** fraction of the retained height embedded in undisturbed ground below
   * it (the gravel base pad sits below that again, and isn't counted as
   * structural embedment) */
  embedmentRatio: number
}

/** Every number the calculator actually uses to turn wall length/height/
 * soil into a materials + labour spec, bundled into one editable, saveable
 * unit — this is what the settings panel edits and what "Save as preset"
 * persists. Deliberately excludes the 1.5m engineer-design cutoff: that's
 * a safety/legal threshold (the NZ Building Consent exemption), not a
 * calculation preference, and stays fixed regardless of which settings are
 * active — see ENGINEER_HEIGHT_LIMIT_M in retainingWallCalc.ts. */
export interface CalcSettings {
  referenceTable: WallSpecRow[]
  /** m, drainage/bearing pad under the post, below its embedment; 0 = no
   * pad (the default — it isn't usual practice here), switched on in the
   * project's Pile setup */
  gravelBaseAllowanceM: number
  /** hole diameter as a multiple of the post's own width */
  holeDiameterMultiplier: number
  /** m, height of one facing-board course */
  boardCourseHeightM: number
  /** m, the lengths facing boards can be bought in. A board runs as far
   * along the wall as the longest of these allows before it's joined. */
  boardStockLengthsM: number[]
  /** m, compacted drainage gravel layer thickness behind the boards */
  backfillThicknessM: number
  setupHours: number
  hoursPerPost: number
  hoursPerBoard: number
  hoursPerM3Backfill: number
  /** m, the standard clearance kept round each type of obstruction in
   * the ground; a type with none uses DEFAULT_OBSTRUCTION_CLEARANCE_M */
  obstructionClearancesM?: Partial<Record<ObstructionType, number>>
}

export const DEFAULT_CALC_SETTINGS: CalcSettings = {
  referenceTable: [
    { soil: "firmClay", maxHeightM: 0.6, postSizeLabel: "100 x 100mm", maxSpacingM: 1.5, embedmentRatio: 0.5 },
    { soil: "firmClay", maxHeightM: 1.0, postSizeLabel: "100 x 100mm", maxSpacingM: 1.35, embedmentRatio: 0.5 },
    { soil: "firmClay", maxHeightM: 1.5, postSizeLabel: "150 x 150mm", maxSpacingM: 1.2, embedmentRatio: 0.55 },

    { soil: "looseSandy", maxHeightM: 0.6, postSizeLabel: "100 x 100mm", maxSpacingM: 1.3, embedmentRatio: 0.55 },
    { soil: "looseSandy", maxHeightM: 1.0, postSizeLabel: "100 x 100mm", maxSpacingM: 1.15, embedmentRatio: 0.6 },
    { soil: "looseSandy", maxHeightM: 1.5, postSizeLabel: "150 x 150mm", maxSpacingM: 1.0, embedmentRatio: 0.65 },

    { soil: "fill", maxHeightM: 0.6, postSizeLabel: "100 x 100mm", maxSpacingM: 1.2, embedmentRatio: 0.6 },
    { soil: "fill", maxHeightM: 1.0, postSizeLabel: "150 x 150mm", maxSpacingM: 1.05, embedmentRatio: 0.68 },
    { soil: "fill", maxHeightM: 1.5, postSizeLabel: "150 x 150mm", maxSpacingM: 1.0, embedmentRatio: 0.75 },
  ],
  gravelBaseAllowanceM: 0,
  holeDiameterMultiplier: 3,
  boardCourseHeightM: 0.15,
  boardStockLengthsM: [4.2, 4.8, 5.4, 6.0],
  backfillThicknessM: 0.15,
  setupHours: 1.5,
  hoursPerPost: 1.5,
  hoursPerBoard: 0.4,
  hoursPerM3Backfill: 0.5,
}

/** The row a given settings/height/soil combination is using — whichever
 * band's maxHeightM is the smallest one the retained height still fits
 * under. */
export function findReferenceRow(settings: CalcSettings, retainedHeightM: number, soil: SoilType): WallSpecRow {
  const rows = settings.referenceTable.filter((r) => r.soil === soil).sort((a, b) => a.maxHeightM - b.maxHeightM)
  return rows.find((r) => retainedHeightM <= r.maxHeightM + 1e-6) ?? rows[rows.length - 1]
}

/** Post sizes offered when overriding the table with one size for every
 * post — square sawn posts and round (SED) poles. Any label works as long
 * as it starts with its size in mm and says "round" if it's a pole. */
export const POST_SIZE_OPTIONS = [
  "100 x 100mm",
  "125 x 125mm",
  "150 x 150mm",
  "200 x 200mm",
  "125mm round",
  "150mm round",
  "175mm round",
  "200mm round",
  "225mm round",
  "250mm round",
]

/** Face width (square) or diameter (round) of a post, read off the
 * leading number in its label — "150 x 150mm", "150mm round". */
export function postWidthM(sizeLabel: string): number {
  const mm = parseFloat(sizeLabel)
  return mm >= 50 && mm <= 600 ? mm / 1000 : 0.15
}

export const isRoundPost = (sizeLabel: string): boolean => /round|sed|dia/i.test(sizeLabel)

/** m², the post's cross-section — what it displaces in its hole */
export function postSectionAreaM2(sizeLabel: string): number {
  const w = postWidthM(sizeLabel)
  return isRoundPost(sizeLabel) ? (Math.PI * w * w) / 4 : w * w
}

/** m, the smallest hole the post will physically drop into: its own
 * diameter if round, corner to corner if square */
export function postFitDiameterM(sizeLabel: string): number {
  const w = postWidthM(sizeLabel)
  return isRoundPost(sizeLabel) ? w : w * Math.SQRT2
}

/** The board lengths to plan with, shortest first — falling back to the
 * defaults for settings saved before stock lengths existed (or with
 * nothing usable entered). */
export function boardStockLengths(settings: CalcSettings): number[] {
  const list = Array.isArray(settings.boardStockLengthsM) ? settings.boardStockLengthsM : []
  const valid = Array.from(new Set(list.filter((l) => typeof l === "number" && l >= 0.5 && l <= 12))).sort((a, b) => a - b)
  return valid.length ? valid : DEFAULT_CALC_SETTINGS.boardStockLengthsM
}

export interface BoardOrderLine {
  lengthM: number
  /** boards of this length on the order */
  count: number
  /** true when the count was set by hand rather than worked out */
  fixed: boolean
  /** of count, how many actually get cut into — the rest are spare */
  usedCount: number
}

/** A piece to cut, for the order planner: the bay lengths it spans, and
 * optionally where it goes — the post it starts on (so a piece that has
 * to be split can say where each part lands) and anything else the
 * caller wants handed back with it. */
export interface OrderPiece<T = unknown> {
  baysM: number[]
  startPost?: number
  tag?: T
}

/** One piece as cut from a board on the order. */
export interface BoardCut<T = unknown> {
  lengthM: number
  /** post it starts on / ends on, when the piece said where it starts */
  startPost: number | null
  endPost: number | null
  tag: T | undefined
}

/** One bought board and what's cut out of it, in cutting order. */
export interface OrderedBoard<T = unknown> {
  lengthM: number
  cuts: BoardCut<T>[]
  /** m left over */
  leftM: number
}

/** an offcut longer than this (m) is counted as too much waste */
export const MAX_GOOD_OFFCUT_M = 0.4

export interface BoardOrderPlan<T = unknown> {
  lines: BoardOrderLine[]
  /** every board on the order with its cuts — the cut list */
  boards: OrderedBoard<T>[]
  boardCount: number
  totalLengthM: number
  /** m of the order that ends up as offcuts or spare boards */
  wasteM: number
  /** boards cut into that leave an offcut over MAX_GOOD_OFFCUT_M */
  bigOffcutCount: number
  /** boards that had to be split at a post into shorter pieces because
   * nothing long enough was left to cut them from — each one is an extra
   * join on the wall */
  extraJoins: number
  /** pieces nothing on the order (or available to add) can be cut from */
  uncutCount: number
  uncutLengthM: number
}

/** How a new board's length is picked when a piece has nowhere to go: the
 * shortest it fits in (what the planner used to do), the one that leaves
 * the least offcut once the rest of it is filled, or the shortest that
 * leaves a good (small) offcut. */
type StockRule = "shortest" | "least-offcut" | "shortest-good"

/** Works out what to buy for a list of cut pieces — each piece given as
 * the bay widths it spans, so it can be split at a post if it has to be.
 *
 * `fixedCounts` (keyed by `String(lengthM)`) pins how many of a length
 * are on the order — what the supplier actually has, 0 for none — and
 * every other length makes up the difference. Longest pieces go first,
 * each cut from the tightest-fitting leftover of a board already on the
 * order. Otherwise a new board is bought. Which length is a judgement
 * call that can't be made one board at a time (a longer board that takes
 * three pieces can leave a lone piece needing a board of its own), so
 * the whole order is planned under three rules for choosing it — see
 * StockRule — and the plan that wastes least is the one returned.
 * Offcuts over MAX_GOOD_OFFCUT_M are the thing being avoided: a short
 * piece isn't given a long board it barely uses when a longer one would
 * take two of them with a hand's width left over.
 *
 * A piece too long for anything left is split at a post into parts that
 * do fit. Saw cuts aren't allowed for. */
export function planBoardOrderDetailed<T = unknown>(
  piecesM: (number[] | OrderPiece<T>)[],
  stockLengthsM: number[],
  fixedCounts: Record<string, number> = {}
): BoardOrderPlan<T> {
  const rules: StockRule[] = ["least-offcut", "shortest-good", "shortest"]
  let best: BoardOrderPlan<T> | null = null
  const key = (plan: BoardOrderPlan<T>) => [
    plan.uncutCount,
    plan.extraJoins,
    Math.round(plan.wasteM * 100), // to the centimetre
    plan.bigOffcutCount,
    plan.boardCount,
  ]
  for (const rule of rules) {
    const plan = planBoardOrderWith(piecesM, stockLengthsM, fixedCounts, rule)
    if (!best) {
      best = plan
      continue
    }
    const a = key(plan)
    const b = key(best)
    for (let k = 0; k < a.length; k++) {
      if (a[k] === b[k]) continue
      if (a[k] < b[k]) best = plan
      break
    }
  }
  return best as BoardOrderPlan<T>
}

function planBoardOrderWith<T>(
  piecesM: (number[] | OrderPiece<T>)[],
  stockLengthsM: number[],
  fixedCounts: Record<string, number>,
  rule: StockRule
): BoardOrderPlan<T> {
  const stocks = [...stockLengthsM].sort((a, b) => a - b)
  const isFixed = (l: number) => Number.isFinite(fixedCounts[String(l)]) && fixedCounts[String(l)] >= 0
  const autoStocks = stocks.filter((l) => !isFixed(l))
  const longestAuto = autoStocks.length ? autoStocks[autoStocks.length - 1] : 0
  const boards: { lengthM: number; leftM: number; used: boolean; cuts: BoardCut<T>[] }[] = []
  for (const l of stocks) {
    if (isFixed(l))
      for (let i = 0; i < Math.min(5000, Math.floor(fixedCounts[String(l)])); i++) boards.push({ lengthM: l, leftM: l, used: false, cuts: [] })
  }

  const sum = (bays: number[]) => bays.reduce((t, w) => t + w, 0)
  const queue = piecesM
    .map((p): OrderPiece<T> => (Array.isArray(p) ? { baysM: p } : p))
    .filter((p) => p.baysM.length > 0)
    .map((p) => ({ bays: p.baysM, lengthM: sum(p.baysM), startPost: p.startPost ?? null, tag: p.tag }))
  const cutOf = (piece: (typeof queue)[number]): BoardCut<T> => ({
    lengthM: piece.lengthM,
    startPost: piece.startPost,
    endPost: piece.startPost === null ? null : piece.startPost + piece.bays.length,
    tag: piece.tag,
  })
  queue.sort((a, b) => a.lengthM - b.lengthM) // longest last, so pop() takes it
  let extraJoins = 0
  let uncutCount = 0
  let uncutLengthM = 0

  /** what's left of a board of this length once the piece and then the
   * longest waiting pieces that fit have been cut from it */
  const offcutIfFilled = (lengthM: number, pieceM: number) => {
    let left = lengthM - pieceM
    for (let q = queue.length - 1; q >= 0 && left > 1e-6; q--) if (queue[q].lengthM <= left + 1e-6) left -= queue[q].lengthM
    return Math.max(0, left)
  }

  while (queue.length) {
    const piece = queue.pop()!
    let open: (typeof boards)[number] | null = null
    for (const board of boards) {
      if (board.leftM + 1e-6 >= piece.lengthM && (!open || board.leftM < open.leftM)) open = board
    }
    if (open) {
      open.leftM = Math.max(0, open.leftM - piece.lengthM)
      open.used = true
      open.cuts.push(cutOf(piece))
      continue
    }
    const fitting = autoStocks.filter((l) => l + 1e-6 >= piece.lengthM)
    if (fitting.length > 0) {
      let lengthM = fitting[0]
      if (rule !== "shortest" && fitting.length > 1) {
        const offcuts = fitting.map((l) => offcutIfFilled(l, piece.lengthM))
        const good = offcuts.map((o) => o <= MAX_GOOD_OFFCUT_M + 1e-6)
        if (rule === "shortest-good") {
          const first = good.indexOf(true)
          if (first >= 0) lengthM = fitting[first]
        }
        if (rule === "least-offcut" || !good.includes(true)) {
          // an acceptable offcut beats an excessive one; then the smaller
          // offcut wins (within a millimetre, the shorter board — cheaper)
          let pick = 0
          for (let i = 1; i < fitting.length; i++) {
            if ((good[i] && !good[pick]) || (good[i] === good[pick] && offcuts[i] < offcuts[pick] - 0.001)) pick = i
          }
          lengthM = fitting[pick]
        }
      }
      boards.push({ lengthM, leftM: Math.max(0, lengthM - piece.lengthM), used: true, cuts: [cutOf(piece)] })
      continue
    }
    // nothing long enough: split at a post into a part that fits the
    // longest thing still to be had, and the rest
    const longestLeftM = Math.max(longestAuto, ...boards.map((b) => b.leftM))
    let take = 0
    let takenM = 0
    while (take < piece.bays.length - 1 && takenM + piece.bays[take] <= longestLeftM + 1e-6) takenM += piece.bays[take++]
    if (take === 0) {
      uncutCount++
      uncutLengthM += piece.lengthM
      continue
    }
    extraJoins++
    queue.push(
      { ...piece, bays: piece.bays.slice(0, take), lengthM: takenM },
      {
        ...piece,
        bays: piece.bays.slice(take),
        lengthM: piece.lengthM - takenM,
        startPost: piece.startPost === null ? null : piece.startPost + take,
      }
    )
    queue.sort((a, b) => a.lengthM - b.lengthM)
  }

  const lines: BoardOrderLine[] = stocks.map((l) => {
    const mine = boards.filter((b) => b.lengthM === l)
    return { lengthM: l, count: mine.length, fixed: isFixed(l), usedCount: mine.filter((b) => b.used).length }
  })
  const totalLengthM = boards.reduce((t, b) => t + b.lengthM, 0)
  return {
    lines,
    boards: boards
      .map(({ lengthM, cuts, leftM }) => ({ lengthM, cuts, leftM }))
      .sort((a, b) => a.lengthM - b.lengthM || b.cuts.length - a.cuts.length),
    boardCount: boards.length,
    totalLengthM,
    wasteM: boards.reduce((t, b) => t + b.leftM, 0),
    bigOffcutCount: boards.filter((b) => b.used && b.leftM > MAX_GOOD_OFFCUT_M + 1e-6).length,
    extraJoins,
    uncutCount,
    uncutLengthM,
  }
}

/** The plain suggested order: what to buy with every length available. */
export function planBoardOrder(piecesM: number[][], stockLengthsM: number[]): { lengthM: number; count: number }[] {
  return planBoardOrderDetailed(piecesM, stockLengthsM)
    .lines.filter((l) => l.count > 0)
    .map(({ lengthM, count }) => ({ lengthM, count }))
}
