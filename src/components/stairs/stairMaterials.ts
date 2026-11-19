/** What to buy for a stair, line by line, from the stairs calculator's
 * cut list: framing timber, decking, posts, concrete for them and screws.
 * Each line is stock as bought (so many lengths of so long), with what
 * it's for, so the lines from several stairs can be added up into one
 * order (see `combineOrder`). Pure — no React. */

import { POST_EMBED, POST_SIZE, NOG_DEPTH, StairInput, StairResult, planMixedStock, planStock } from "./stairs"
import type { StairLayout } from "./layout"

export type StairOrderKind = "timber" | "decking" | "posts" | "concrete" | "screws"

export interface StairOrderLine {
  kind: StairOrderKind
  /** what it's for, e.g. "Stringers" */
  use: string
  /** what to ask the supplier for, e.g. "140 × 45 SG8 H3.2" */
  material: string
  /** the size a price is matched on, e.g. "140 x 45" */
  size: string
  /** lengths bought (lengthM set), or the quantity in `unit` */
  count: number
  lengthM: number | null
  unit: string
  detail?: string
}

/** hole for a stair post: this wide, POST_EMBED deep */
export const STAIR_POST_HOLE_MM = 300

const framing = (depth: number, t: number) => ({ material: `${depth} × ${t} SG8 H3.2`, size: `${depth} x ${t}` })
const decking = (input: StairInput) => ({ material: `${input.boardWidth} × ${input.boardThickness} decking`, size: `${input.boardWidth} x ${input.boardThickness}` })
const postConcreteM3 = (posts: number) => {
  const r = STAIR_POST_HOLE_MM / 2000
  const deep = POST_EMBED / 1000
  const post = POST_SIZE / 1000
  return posts * (Math.PI * r * r * deep - post * post * deep)
}

/** The framing of one straight run: stringers and wedges, outer stringers
 * with riser joists and nogs, or stacked frames — and posts under long
 * stringers. `name` prefixes each use on a turned stair ("Run 2 — "). */
function runLines(r: StairResult, input: StairInput, name: string): StairOrderLine[] {
  const lines: StairOrderLine[] = []
  if (r.treads <= 0) return lines
  const t = input.stringerThickness
  const push = (use: string, depth: number, plan: { lengthM: number; lengths: number } | null, detail?: string) => {
    if (plan && plan.lengths > 0) lines.push({ kind: "timber", use: `${name}${use}`, ...framing(depth, t), count: plan.lengths, lengthM: plan.lengthM, unit: "lengths", detail })
  }

  if (input.framing === "stacked-frames") {
    push("Step frames", r.timberDepth, r.frames.stock, `${r.frames.list.length} frames, ${r.frames.linealM.toFixed(1)} m cut`)
    return lines
  }

  const stringers = input.framing === "outer-stringers" ? Math.min(2, r.supports.count) : r.supports.count
  push("Stringers", r.timberDepth, r.stringer.stock, `${stringers} at ${Math.round(r.stringer.topEdgeLength)} mm`)
  if (!r.wedges.fitsInStringerOffcuts && r.wedges.total > 0) {
    // the wedges' run of board, in whole stock lengths
    push("Wedge blocks", r.wedges.stockDepth, planMixedStock([r.wedges.stockLengthM * 1000]) ?? buyRun(r.wedges.stockLengthM), `${r.wedges.total} wedges`)
  }
  if (input.framing === "outer-stringers") {
    if (r.riserJoists.ripFrom) push("Riser joists", r.riserJoists.ripFrom, r.riserJoists.stock, `${r.riserJoists.list.length} × ${Math.round(r.riserJoists.length)} mm, ripped to depth`)
    push("Nogs", NOG_DEPTH, r.riserJoists.nogStock, `${r.riserJoists.nogs.length} nogs`)
  }

  const posts = r.stringer.posts.length * r.stringer.postsPerLine
  if (posts > 0) {
    const plan = planStock(r.stringer.postLength, posts)
    if (plan)
      lines.push({
        kind: "posts",
        use: `${name}Support posts`,
        material: `${POST_SIZE} × ${POST_SIZE} H5 post`,
        size: `${POST_SIZE} x ${POST_SIZE}mm`,
        count: plan.lengths,
        lengthM: plan.lengthM,
        unit: "lengths",
        detail: `${posts} posts up to ${Math.round(r.stringer.postLength)} mm`,
      })
    if (r.stringer.bearer) push("Bearers", r.timberDepth, planStock(input.width, r.stringer.posts.length), `${r.stringer.posts.length} × ${input.width} mm`)
    lines.push(concreteLine(`${name}Post holes`, posts))
  }
  return lines
}

/** a run of board longer than any stock length: whole 6 m lengths and a
 * shorter one to finish */
const buyRun = (m: number) => ({ lengthM: 6, lengths: Math.ceil(m / 6 - 1e-9) })

const concreteLine = (use: string, posts: number): StairOrderLine => ({
  kind: "concrete",
  use,
  material: "Concrete",
  size: "",
  count: Number(postConcreteM3(posts).toFixed(3)),
  lengthM: null,
  unit: "m³",
  detail: `${posts} holes ${STAIR_POST_HOLE_MM} mm across, ${POST_EMBED} deep`,
})

export interface StairOrderOptions {
  /** the stair has its own top tread in front of a wall (or other edge)
   * rather than stepping onto the deck: frame and board one more tread */
  extraTopTread?: boolean
}

/** Everything to buy for one stair. */
export function stairOrder(input: StairInput, r: StairResult, layout: StairLayout | null, options: StairOrderOptions = {}): StairOrderLine[] {
  const lines: StairOrderLine[] = []
  const t = input.stringerThickness
  const turned = layout !== null && layout.turns.length > 0
  const boardPieces: number[] = []
  let screws = 0

  if (turned) {
    for (const f of layout.flights) {
      lines.push(...runLines(f.sub, f.subInput, `Run ${f.index + 1} — `))
      screws += f.sub.screws
    }
    for (const turn of layout.turns) {
      const name = `Turn ${turn.index + 1} — `
      const pieces = turn.frames.flatMap((fr) => [fr.perimeter, ...fr.joists])
      const plan = planMixedStock(pieces)
      if (plan)
        lines.push({
          kind: "timber",
          use: `${name}${turn.spec.kind === "landing" ? "landing frame" : "winder frames"}`,
          ...framing(turn.joistDepth, t),
          count: plan.lengths,
          lengthM: plan.lengthM,
          unit: "lengths",
          detail: `${(pieces.reduce((a, p) => a + p, 0) / 1000).toFixed(1)} m cut`,
        })
      if (!turn.onPads && turn.posts.length) {
        const posts = planStock(turn.postLength, turn.posts.length)
        if (posts)
          lines.push({
            kind: "posts",
            use: `${name}posts`,
            material: `${POST_SIZE} × ${POST_SIZE} H5 post`,
            size: `${POST_SIZE} x ${POST_SIZE}mm`,
            count: posts.lengths,
            lengthM: posts.lengthM,
            unit: "lengths",
            detail: `${turn.posts.length} posts at ${Math.round(turn.postLength)} mm`,
          })
        lines.push(concreteLine(`${name}post holes`, turn.posts.length))
      }
    }
    boardPieces.push(...layout.boardPieces)
    // the turns' boards: two screws a board at each joist it crosses (~3)
    const flightBoards = layout.flights.reduce((a, f) => a + f.sub.boards.treadPieces + f.sub.boards.riserPieces, 0)
    screws += Math.max(0, layout.boardPieces.length - flightBoards) * 6
  } else {
    lines.push(...runLines(r, input, ""))
    screws += r.screws
    for (let i = 0; i < r.boards.treadPieces + r.boards.riserPieces; i++) boardPieces.push(r.boards.pieceLength)
  }

  if (options.extraTopTread && r.treads >= 0) {
    // a frame the width of the stair, a going deep, joists at the support spacing
    const joists = Math.max(2, r.supports.count)
    const pieces = [input.width, input.width, ...Array(joists).fill(Math.max(100, r.going - 2 * t))]
    const plan = planMixedStock(pieces)
    if (plan) lines.push({ kind: "timber", use: "Top tread frame", ...framing(NOG_DEPTH, t), count: plan.lengths, lengthM: plan.lengthM, unit: "lengths", detail: `2 × ${input.width} + ${joists} joists` })
    const boards = r.treadBoards.length + (input.riserBoards ? r.riserBoardPieces.length : 0)
    for (let i = 0; i < boards; i++) boardPieces.push(input.width)
    screws += 2 * boards * joists
  }

  // decking: equal pieces cut from one length where they're all the same
  if (boardPieces.length) {
    const same = boardPieces.every((p) => Math.abs(p - boardPieces[0]) < 0.5)
    const plan = same ? planStock(boardPieces[0], boardPieces.length) : planMixedStock(boardPieces)
    if (plan)
      lines.push({
        kind: "decking",
        use: "Treads" + (input.riserBoards ? " and risers" : ""),
        ...decking(input),
        count: plan.lengths,
        lengthM: plan.lengthM,
        unit: "lengths",
        detail: `${boardPieces.length} pieces${same ? ` at ${Math.round(boardPieces[0])} mm` : ""}`,
      })
  }
  if (screws > 0) lines.push({ kind: "screws", use: "Decking screws", material: "Stainless decking screws", size: "", count: Math.ceil(screws * 1.1), lengthM: null, unit: "each", detail: `${screws} + 10% spare` })
  return lines
}

export interface CombinedOrderLine {
  kind: StairOrderKind
  material: string
  size: string
  lengthM: number | null
  unit: string
  count: number
  /** what the lines added up are for */
  uses: string[]
}

const KIND_ORDER: StairOrderKind[] = ["timber", "posts", "decking", "concrete", "screws"]

/** Lines from several stairs added up: the same material at the same
 * length becomes one line. Biggest timber first within each kind. */
export function combineOrder(lines: { line: StairOrderLine; from: string }[]): CombinedOrderLine[] {
  const map = new Map<string, CombinedOrderLine>()
  for (const { line, from } of lines) {
    const key = `${line.kind}|${line.material}|${line.lengthM ?? ""}|${line.unit}`
    const hit = map.get(key)
    const use = from ? `${from}: ${line.use}` : line.use
    if (hit) {
      hit.count += line.count
      if (!hit.uses.includes(use)) hit.uses.push(use)
    } else map.set(key, { kind: line.kind, material: line.material, size: line.size, lengthM: line.lengthM, unit: line.unit, count: line.count, uses: [use] })
  }
  return [...map.values()]
    .map((l) => (l.unit === "m³" ? { ...l, count: Number(l.count.toFixed(3)) } : l))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.material.localeCompare(a.material, undefined, { numeric: true }) || (b.lengthM ?? 0) - (a.lengthM ?? 0))
}

/** a combined line as text, e.g. "3 × 4.8 m 140 × 45 SG8 H3.2" */
export const orderLineText = (l: { count: number; lengthM: number | null; unit: string; material: string }) =>
  l.lengthM !== null ? `${l.count} × ${l.lengthM.toFixed(1)} m  ${l.material}` : `${l.unit === "m³" ? l.count.toFixed(2) : l.count} ${l.unit === "each" ? "" : `${l.unit} `}${l.material}`.replace(/\s+/g, " ")

/** A rough labour allowance for building a stair, hours: setting out and
 * the top fixing, then each tread, each turn, each support post. */
export function stairLabourHours(r: StairResult, layout: StairLayout | null): number {
  const turns = layout?.turns ?? []
  const treads = layout && turns.length ? layout.flights.reduce((a, f) => a + f.treads, 0) : r.treads
  const posts = layout && turns.length ? layout.flights.reduce((a, f) => a + f.sub.stringer.posts.length * f.sub.stringer.postsPerLine, 0) + turns.reduce((a, t) => a + (t.onPads ? 0 : t.posts.length), 0) : r.stringer.posts.length * r.stringer.postsPerLine
  return Math.round((3 + treads * 1.25 + turns.length * 6 + posts * 0.75) * 2) / 2
}
