/** What to buy for a floor frame, line by line, in the same shape as the
 * stairs' order (see stairs/stairMaterials.ts), so it goes through the
 * same live order card: framing timber with the pieces cut from it, piles,
 * concrete, flooring sheets and fixings. Pure — no React. */

import { planMixedStock } from "../stairs/stairs"
import type { StairOrderLine } from "../stairs/stairMaterials"
import { FrameLayout, FrameMember, sheetMaterial } from "./frame"
import { DEFAULT_FRAME_SETTINGS, FrameSettings } from "./frameTables"

const size = (label: string) => label.replace("mm", "").replace(" x ", " × ").trim()

const USES: Partial<Record<FrameMember["kind"], string>> = {
  joist: "Joists",
  rim: "Rim joists",
  ledger: "Ledger",
  bearer: "Bearers",
  blocking: "Blocking",
  nog: "Nogs",
}

export interface FrameOrderOptions {
  /** decking boards' joist crossings, for the decking screws */
  boardCrossings?: number
}

export function frameOrder(f: FrameLayout, options: FrameOrderOptions = {}, settings: FrameSettings = DEFAULT_FRAME_SETTINGS): StairOrderLine[] {
  const lines: StairOrderLine[] = []
  const deck = f.input.covering === "decking"

  // timber, a line per use — the card plans each material's pieces together
  const byUse = new Map<string, { material: string; size: string; pieces: number[] }>()
  for (const m of f.members) {
    const use = USES[m.kind]
    if (!use || !m.pieces.length) continue
    const label = m.kind === "bearer" ? f.bearerSize! : m.kind === "nog" ? `${m.depth} x ${m.thick}mm` : f.joistSize
    // a ledger is bolted to the house: always treated for outside
    const treat = m.kind === "ledger" ? "H3.2" : f.treatment
    const key = `${use}|${label}|${treat}`
    const hit = byUse.get(key) ?? { material: `${size(label)} SG8 ${treat}`, size: size(label).replace(" × ", " x "), pieces: [] }
    hit.pieces.push(...m.pieces)
    byUse.set(key, hit)
  }
  for (const [key, { material, size: sz, pieces }] of byUse) {
    const use = key.split("|")[0]
    const plan = planMixedStock(pieces)
    const longest = Math.max(...pieces)
    lines.push({
      kind: "timber",
      use,
      material,
      size: sz,
      count: plan ? plan.lengths : pieces.length,
      // longer than any stock length: listed as they're cut, to special order
      lengthM: plan ? plan.lengthM : Math.ceil(longest / 300) * 0.3,
      unit: "lengths",
      detail: `${pieces.length} piece${pieces.length === 1 ? "" : "s"}, ${(pieces.reduce((a, p) => a + p, 0) / 1000).toFixed(1)} m`,
      pieces: plan ? pieces : undefined,
    })
  }

  if (f.piles.length) {
    const pieces = f.piles.map((p) => p.length)
    const plan = planMixedStock(pieces)
    lines.push({
      kind: "posts",
      use: "Piles",
      material: `${settings.pileSize} × ${settings.pileSize} H5 pile`,
      size: `${settings.pileSize} x ${settings.pileSize}mm`,
      count: plan ? plan.lengths : f.piles.length,
      lengthM: plan ? plan.lengthM : 3.6,
      unit: "lengths",
      detail: `${f.piles.length} piles up to ${Math.max(...pieces)} mm (${settings.pileEmbedMm} mm in the ground)`,
      pieces: plan ? pieces : undefined,
    })
    const r = settings.pileHoleDiameterMm / 2000
    const hole = Math.PI * r * r * (settings.pileHoleDepthMm / 1000)
    const pile = (settings.pileSize / 1000) ** 2 * (settings.pileEmbedMm / 1000)
    lines.push({
      kind: "concrete",
      use: "Pile footings",
      material: "Concrete",
      size: "",
      count: Number((f.piles.length * (hole - pile)).toFixed(3)),
      lengthM: null,
      unit: "m³",
      detail: `${f.piles.length} holes ${settings.pileHoleDiameterMm} mm across, ${settings.pileHoleDepthMm} deep`,
    })
  }

  if (!deck && f.sheetCount > 0)
    lines.push({
      kind: "sheets",
      use: "Flooring",
      material: sheetMaterial(f.input.sheet),
      size: "",
      count: f.sheetCount,
      lengthM: null,
      unit: "sheets",
      detail: `${f.sheets.length} pieces laid, ${f.sheets.filter((s) => s.cut).length} cut`,
    })

  const galv = deck ? "hot-dip galv" : "galv"
  const each = (use: string, material: string, count: number, detail?: string) =>
    count > 0 && lines.push({ kind: "screws", use, material, size: "", count, lengthM: null, unit: "each", detail })
  each("Joist hangers", `${size(f.joistSize)} joist hangers, ${galv}`, f.hangerCount)
  each("Joist hangers", `30 × 3.15 ${galv} hanger nails`, f.hangerCount * settings.nailsPerHanger)
  const nails = f.skewNails + f.rimNails + f.blockingNails
  each("Framing nails", `90 × 3.15 ${galv} nails`, Math.ceil(nails * 1.1), `${nails} + 10% spare`)
  each("Piles to bearers", `${galv} wire dogs`, f.wireDogs)
  each("Ledger", "M12 × 200 galv bolts, washers and 12 mm spacers", f.ledgerBolts, `at ${settings.ledgerBoltSpacingMm} mm, staggered`)
  if (!deck) each("Flooring", "Flooring screws", Math.ceil(f.sheetScrews * 1.1), `${f.sheetScrews} + 10% spare`)
  if (deck && options.boardCrossings) {
    const screws = options.boardCrossings * settings.screwsPerBoardCrossing
    each("Decking boards", "Stainless decking screws", Math.ceil(screws * 1.1), `${screws} + 10% spare`)
  }
  return lines
}
