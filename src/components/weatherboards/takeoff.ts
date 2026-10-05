/** The whole-project take-off — every wall's courses packed into one
 * board order, plus trims — shared by the editor and the brief summary
 * stored on each saved project for its card. Pure math, no React. */

import { CuttingPlan, optimiseCutting, Piece } from "./cuttingStock"
import { DEFAULT_SETTINGS } from "./data"
import { calculateTrims, TrimPiece } from "./trims"
import { Elevation, WeatherboardProject, WeatherboardSettings } from "./types"
import { calculateWall, WallResult } from "./weatherboardCalc"

/** Projects saved before a setting existed pick up its default. */
export const withDefaults = (settings: Partial<WeatherboardSettings> | undefined): WeatherboardSettings => ({
  ...DEFAULT_SETTINGS,
  ...settings,
})

export const calculateResults = (elevations: Elevation[], settings: WeatherboardSettings): Map<string, WallResult[]> => {
  const byElevation = new Map<string, WallResult[]>()
  for (const e of elevations) byElevation.set(e.id, e.walls.map((w) => calculateWall(w, settings)))
  return byElevation
}

export const planBoards = (
  elevations: Elevation[],
  results: Map<string, WallResult[]>,
  settings: WeatherboardSettings,
): CuttingPlan => {
  const pieces: Piece[] = []
  for (const e of elevations) {
    for (const r of results.get(e.id) ?? []) {
      for (const c of r.courses) {
        for (const p of c.pieces) {
          pieces.push({ length: Math.ceil(p.cutLength - 1e-6), label: `${e.name} · ${r.wall.name} · course ${c.index}` })
        }
      }
    }
  }
  return optimiseCutting(pieces, settings.stockLengthsMm)
}

export interface TrimTakeoff {
  facing: CuttingPlan
  scriber: CuttingPlan
  /** [length mm, count], longest first */
  flashings: [number, number][]
  flashingTotalMm: number
}

export const planTrims = (elevations: Elevation[], settings: WeatherboardSettings): TrimTakeoff => {
  const all: TrimPiece[] = elevations.flatMap((e) => e.walls.flatMap((w) => calculateTrims(w, settings, `${e.name} · ${w.name}`)))
  const ofKind = (k: TrimPiece["kind"]) => all.filter((t) => t.kind === k)
  const flashings = new Map<number, number>()
  for (const f of ofKind("flashing")) flashings.set(f.length, (flashings.get(f.length) ?? 0) + 1)
  return {
    facing: optimiseCutting(ofKind("facing"), settings.trimLengthsMm),
    scriber: optimiseCutting(ofKind("scriber"), settings.trimLengthsMm),
    flashings: [...flashings.entries()].sort((a, b) => b[0] - a[0]),
    flashingTotalMm: ofKind("flashing").reduce((sum, f) => sum + f.length, 0),
  }
}

/** What a project card shows — computed when a project is saved, so the
 * projects page never has to run the optimiser once per card. */
export interface ProjectSummary {
  elevations: number
  walls: number
  openings: number
  areaM2: number
  boards: number
  boardsMm: number
  /** stock length → count, longest first */
  order: { length: number; count: number }[]
  wastePct: number
  facings: number
  scribers: number
  flashings: number
}

export const summarise = (project: WeatherboardProject): ProjectSummary => {
  const settings = withDefaults(project.settings)
  const results = calculateResults(project.elevations, settings)
  const plan = planBoards(project.elevations, results, settings)
  const trims = planTrims(project.elevations, settings)
  const walls = project.elevations.flatMap((e) => e.walls)
  return {
    elevations: project.elevations.length,
    walls: walls.length,
    openings: walls.reduce((s, w) => s + (w.openings ?? []).length, 0),
    areaM2: Math.round([...results.values()].flat().reduce((s, r) => s + r.netAreaM2, 0) * 100) / 100,
    boards: plan.boards.length,
    boardsMm: plan.totalStockMm,
    order: [...plan.order].reverse(),
    wastePct: plan.totalStockMm > 0 ? Math.round((1 - plan.totalCutMm / plan.totalStockMm) * 1000) / 10 : 0,
    facings: trims.facing.boards.length,
    scribers: trims.scriber.boards.length,
    flashings: trims.flashings.reduce((s, [, n]) => s + n, 0),
  }
}
