import { Elevation, Opening, Wall, WallEdge, WallEnd, WeatherboardProject, WeatherboardSettings } from "./types"

export const STOCK_LENGTHS_MM = [4200, 4800, 5400, 6000]

export const DEFAULT_SETTINGS: WeatherboardSettings = {
  coverMm: 130,
  studSpacingMm: 600,
  cutAllowanceMm: 0,
  stockLengthsMm: STOCK_LENGTHS_MM,
  sparePercent: 5,
  facingWidthMm: 65,
  flashingLapMm: 30,
  trimLengthsMm: STOCK_LENGTHS_MM,
}

export const WALL_END_LABELS: Record<WallEnd, string> = {
  externalFacing: "External corner — facing",
  externalBox: "External corner — box / mitre",
  internalScriber: "Internal corner — scriber",
  none: "No trim (abuts)",
}

export const newId = () => Math.random().toString(36).slice(2, 10)

const flat = (y: number): WallEdge => ({ left: y, right: y, breaks: [] })

export type WallShape = "rectangle" | "gable" | "skillion" | "partRake"

export const WALL_SHAPE_LABELS: Record<WallShape, string> = {
  rectangle: "Rectangle",
  gable: "Gable end",
  skillion: "Skillion",
  partRake: "Rake part way",
}

/** Rough starting shapes — every one is just a top edge, so they keep
 * the wall's current length, stud height and bottom edge and only
 * reshape the top. Edit the numbers after. */
export const applyShape = (wall: Wall, shape: WallShape): Wall => {
  const L = wall.lengthMm
  const h = wall.top.left
  const rise = Math.round((L / 2) * Math.tan((25 * Math.PI) / 180)) // 25° pitch
  const top: WallEdge =
    shape === "rectangle"
      ? flat(h)
      : shape === "gable"
        ? { left: h, right: h, breaks: [{ id: newId(), x: Math.round(L / 2), y: h + rise }] }
        : shape === "skillion"
          ? { left: h, right: h + Math.round(L * Math.tan((10 * Math.PI) / 180)), breaks: [] }
          : {
              left: h,
              right: h + Math.round((L / 2) * Math.tan((25 * Math.PI) / 180)),
              breaks: [{ id: newId(), x: Math.round(L / 2), y: h }],
            }
  return { ...wall, top }
}

export const newWall = (name: string): Wall => ({
  id: newId(),
  name,
  lengthMm: 4800,
  top: flat(2400),
  bottom: flat(0),
  openings: [],
  leftEnd: "externalFacing",
  rightEnd: "externalFacing",
  coverMm: null,
})

/** A new opening centred in the wall — window-sized, sill at 900. */
export const newOpening = (wall: Wall): Opening => {
  const width = Math.min(1200, Math.max(300, wall.lengthMm - 200))
  return { id: newId(), x: Math.round((wall.lengthMm - width) / 2 / 10) * 10, sill: wall.bottom.left + 900, width, height: 1200 }
}

/** An elevation starts empty — its "+ Add wall" tab builds Wall 1. */
export const newElevation = (name: string): Elevation => ({
  id: newId(),
  name,
  walls: [],
})

export const DEFAULT_PROJECT: WeatherboardProject = {
  settings: DEFAULT_SETTINGS,
  elevations: [
    {
      id: "north",
      name: "North",
      walls: [
        {
          id: "n1",
          name: "Living",
          lengthMm: 7200,
          top: flat(2400),
          bottom: flat(0),
          openings: [
            { id: "n1w", x: 900, sill: 900, width: 1800, height: 1300 },
            { id: "n1d", x: 4200, sill: 0, width: 1800, height: 2100 },
          ],
          leftEnd: "externalFacing",
          rightEnd: "internalScriber",
          coverMm: null,
        },
        {
          id: "n2",
          name: "Garage (ground falls)",
          lengthMm: 6000,
          top: flat(2400),
          bottom: { left: 0, right: -450, breaks: [{ id: "n2b", x: 2400, y: 0 }] },
          openings: [],
          leftEnd: "none",
          rightEnd: "externalFacing",
          coverMm: null,
        },
      ],
    },
    {
      id: "east",
      name: "East",
      walls: [
        {
          id: "e1",
          name: "Gable end",
          lengthMm: 8400,
          top: { left: 2400, right: 2400, breaks: [{ id: "e1b", x: 4200, y: 4360 }] },
          bottom: flat(0),
          openings: [{ id: "e1w", x: 3600, sill: 2600, width: 1200, height: 900 }],
          leftEnd: "externalFacing",
          rightEnd: "externalFacing",
          coverMm: null,
        },
      ],
    },
  ],
}

export const ELEVATION_NAMES = ["North", "East", "South", "West"]

/** A fresh take-off: default settings and an empty tab per compass side. */
export const newBlankProject = (): WeatherboardProject => ({
  settings: DEFAULT_SETTINGS,
  elevations: ELEVATION_NAMES.map(newElevation),
})

/** localStorage key for the example project — edits to it stay in this browser. */
export const EXAMPLE_STORAGE_KEY = "weatherboards.project.v1"
