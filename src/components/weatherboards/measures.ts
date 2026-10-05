/** Dimensions ("measures") and the links between them. Pure, no React.
 *
 * Every wall exposes a few named measures — its width, the top height at
 * each end, and the height of each top-edge break point (a ridge, or
 * where a rake starts). A measure can be *linked* to another measure,
 * its anchor, and then always takes the anchor's value: editing a linked
 * measure edits the anchor, and through it every measure linked to it.
 * Links always point straight at a root anchor — never a chain — so an
 * anchor is simply any measure some other measure links to.
 *
 * Links live on the dependent wall (`wall.links[kind] = anchorKey`). */

import { Elevation, Wall, WeatherboardProject } from "./types"
import { relayoutAutoOpenings } from "./quickWall"

export type MeasureGroup = "width" | "height"

export interface Measure {
  key: string
  wallId: string
  kind: string
  group: MeasureGroup
  elevationId: string
  elevationName: string
  wallName: string
  /** "Width", "Left height", "Ridge", … */
  label: string
  value: number
}

export const measureKey = (wallId: string, kind: string) => `${wallId}|${kind}`

export const parseKey = (key: string) => {
  const i = key.indexOf("|")
  return { wallId: key.slice(0, i), kind: key.slice(i + 1) }
}

export const getMeasure = (wall: Wall, kind: string): number | null => {
  if (kind === "width") return wall.lengthMm
  if (kind === "heightL") return wall.top.left
  if (kind === "heightR") return wall.top.right
  if (kind.startsWith("break:")) return wall.top.breaks.find((b) => `break:${b.id}` === kind)?.y ?? null
  return null
}

/** Sets one measure on a wall. A width change carries a break point that
 * sat at the old midpoint (a gable ridge) to the new midpoint, and
 * re-spaces auto-placed windows to suit the new shape. */
export const setMeasure = (wall: Wall, kind: string, value: number): Wall => {
  if (getMeasure(wall, kind) === value) return wall
  let next: Wall
  if (kind === "width") {
    const oldMid = wall.lengthMm / 2
    next = {
      ...wall,
      lengthMm: value,
      top: {
        ...wall.top,
        breaks: wall.top.breaks.map((b) => (Math.abs(b.x - oldMid) < 1 ? { ...b, x: Math.round(value / 2) } : b)),
      },
    }
  } else if (kind === "heightL") next = { ...wall, top: { ...wall.top, left: value } }
  else if (kind === "heightR") next = { ...wall, top: { ...wall.top, right: value } }
  else if (kind.startsWith("break:"))
    next = { ...wall, top: { ...wall.top, breaks: wall.top.breaks.map((b) => (`break:${b.id}` === kind ? { ...b, y: value } : b)) } }
  else return wall
  return relayoutAutoOpenings(next)
}

/** Whether a top break point is a peak (gable ridge) or somewhere a rake changes. */
const breakLabel = (wall: Wall, id: string) => {
  const b = wall.top.breaks.find((x) => x.id === id)
  if (!b) return "Break"
  return b.y > wall.top.left && b.y > wall.top.right ? "Ridge" : `Break at ${Math.round(b.x)}`
}

export const wallMeasures = (e: Elevation, w: Wall): Measure[] => {
  const base = { wallId: w.id, elevationId: e.id, elevationName: e.name, wallName: w.name }
  const out: Measure[] = [
    { ...base, key: measureKey(w.id, "width"), kind: "width", group: "width", label: "Width", value: w.lengthMm },
    { ...base, key: measureKey(w.id, "heightL"), kind: "heightL", group: "height", label: "Left height", value: w.top.left },
    { ...base, key: measureKey(w.id, "heightR"), kind: "heightR", group: "height", label: "Right height", value: w.top.right },
  ]
  for (const b of [...w.top.breaks].sort((a, c) => a.x - c.x)) {
    if (b.x <= 0 || b.x >= w.lengthMm) continue
    const kind = `break:${b.id}`
    out.push({ ...base, key: measureKey(w.id, kind), kind, group: "height", label: breakLabel(w, b.id), value: b.y })
  }
  return out
}

export const allMeasures = (project: WeatherboardProject): Measure[] =>
  project.elevations.flatMap((e) => e.walls.flatMap((w) => wallMeasures(e, w)))

/** dependent key → anchor key, across the whole project */
export const linkMap = (project: WeatherboardProject): Map<string, string> => {
  const map = new Map<string, string>()
  for (const e of project.elevations)
    for (const w of e.walls) for (const [kind, anchor] of Object.entries(w.links ?? {})) map.set(measureKey(w.id, kind), anchor)
  return map
}

export const rootOf = (key: string, links: Map<string, string>): string => {
  let k = key
  for (let i = 0; i < 20 && links.has(k); i++) k = links.get(k) as string
  return k
}

/** anchor key → how many measures link to it */
export const anchorCounts = (links: Map<string, string>): Map<string, number> => {
  const counts = new Map<string, number>()
  for (const a of links.values()) counts.set(a, (counts.get(a) ?? 0) + 1)
  return counts
}

const mapWalls = (project: WeatherboardProject, fn: (w: Wall) => Wall): WeatherboardProject => {
  let changed = false
  const elevations = project.elevations.map((e) => {
    let wallsChanged = false
    const walls = e.walls.map((w) => {
      const n = fn(w)
      if (n !== w) wallsChanged = true
      return n
    })
    if (!wallsChanged) return e
    changed = true
    return { ...e, walls }
  })
  return changed ? { ...project, elevations } : project
}

const setLinks = (w: Wall, links: Record<string, string>): Wall => {
  const { links: _old, ...rest } = w
  void _old
  return Object.keys(links).length ? { ...rest, links } : (rest as Wall)
}

/** Brings the project's links back to a sound state and copies every
 * anchor's value onto the measures linked to it:
 * - links from or to measures that no longer exist are dropped — when an
 *   anchor disappears, its first dependent takes over as the new anchor
 *   for the rest, so a linked group survives deleting its anchor
 * - chains are flattened to point straight at their root */
export const applyLinks = (project: WeatherboardProject): WeatherboardProject => {
  const exists = new Set(allMeasures(project).map((m) => m.key))
  const raw = linkMap(project)

  // promote a dependent wherever the anchor has gone
  const orphaned = new Map<string, string[]>()
  for (const [dep, anchor] of raw) {
    if (!exists.has(dep)) continue
    if (!exists.has(anchor)) orphaned.set(anchor, [...(orphaned.get(anchor) ?? []), dep])
  }
  const links = new Map<string, string>()
  for (const [dep, anchor] of raw) if (exists.has(dep) && exists.has(anchor) && dep !== anchor) links.set(dep, anchor)
  for (const deps of orphaned.values()) {
    const [heir, ...rest] = deps
    for (const d of rest) links.set(d, heir)
  }
  // flatten chains, drop anything that loops back on itself
  const flat = new Map<string, string>()
  for (const dep of links.keys()) {
    const root = rootOf(dep, links)
    if (root !== dep && !links.has(root)) flat.set(dep, root)
  }

  const valueOf = new Map(allMeasures(project).map((m) => [m.key, m.value]))
  return mapWalls(project, (w) => {
    const own: Record<string, string> = {}
    let next = w
    for (const [dep, anchor] of flat) {
      const { wallId, kind } = parseKey(dep)
      if (wallId !== w.id) continue
      own[kind] = anchor
      const v = valueOf.get(anchor)
      if (v !== undefined) next = setMeasure(next, kind, v)
    }
    const before = JSON.stringify(w.links ?? {})
    if (before !== JSON.stringify(own)) next = setLinks(next, own)
    return next
  })
}

const findWall = (project: WeatherboardProject, wallId: string) =>
  project.elevations.flatMap((e) => e.walls).find((w) => w.id === wallId)

/** Sets a measure's value — on its anchor if it's linked, so the whole
 * linked group moves together. */
export const editMeasure = (project: WeatherboardProject, key: string, value: number): WeatherboardProject => {
  const target = rootOf(key, linkMap(project))
  const { wallId, kind } = parseKey(target)
  if (!findWall(project, wallId)) return project
  return applyLinks(mapWalls(project, (w) => (w.id === wallId ? setMeasure(w, kind, value) : w)))
}

/** Links `key` to `anchorKey` (or that anchor's own root). Anything that
 * was linked to `key` follows it onto the new anchor. */
export const linkMeasure = (project: WeatherboardProject, key: string, anchorKey: string): WeatherboardProject => {
  const links = linkMap(project)
  const anchor = rootOf(anchorKey, links)
  if (anchor === key || rootOf(anchor, links) === key) return project
  const { wallId } = parseKey(key)
  const repointed = new Map(links)
  repointed.set(key, anchor)
  for (const [dep, a] of links) if (a === key) repointed.set(dep, anchor)
  return applyLinks(
    mapWalls(project, (w) => {
      const own: Record<string, string> = {}
      for (const [dep, a] of repointed) {
        const p = parseKey(dep)
        if (p.wallId === w.id) own[p.kind] = a
      }
      if (w.id !== wallId && JSON.stringify(own) === JSON.stringify(w.links ?? {})) return w
      return setLinks(w, own)
    }),
  )
}

/** Unlinks `key`; it keeps its current value. */
export const unlinkMeasure = (project: WeatherboardProject, key: string): WeatherboardProject => {
  const { wallId, kind } = parseKey(key)
  return mapWalls(project, (w) => {
    if (w.id !== wallId || !w.links?.[kind]) return w
    const own = { ...w.links }
    delete own[kind]
    return setLinks(w, own)
  })
}

/** After a wall was edited through its own form: any of its linked
 * measures that changed push their new value to their anchor, then
 * links are re-applied so the group stays in step. */
export const syncWallEdit = (project: WeatherboardProject, before: Wall, after: Wall): WeatherboardProject => {
  let p = project
  for (const kind of Object.keys(after.links ?? {})) {
    const v = getMeasure(after, kind)
    if (v !== null && v !== getMeasure(before, kind)) p = editMeasure(p, measureKey(after.id, kind), v)
  }
  return applyLinks(p)
}

export const OPPOSITE: Record<string, string> = { North: "South", South: "North", East: "West", West: "East" }

/** The logical starting links for a new wall at the end of `elevation`:
 * - width ← the matching wall (same position) on the opposite elevation
 * - heights ← the project's first wall (all elevations share one plate
 *   height), else for the very first wall, right ← its own left
 * - ridge ← the opposite elevation's matching gable ridge */
export interface DefaultLinks {
  width?: string
  height?: string
  ridge?: string
}

export const defaultLinksFor = (project: WeatherboardProject, elevationId: string): DefaultLinks => {
  const elevation = project.elevations.find((e) => e.id === elevationId)
  if (!elevation) return {}
  const links = linkMap(project)
  const index = elevation.walls.length
  const opposite = project.elevations.find((e) => e.name === OPPOSITE[elevation.name])
  const twin = opposite?.walls[index]
  const first = project.elevations.flatMap((e) => e.walls)[0]
  const twinRidge = twin?.top.breaks.find((b) => b.y > twin.top.left && b.y > twin.top.right)
  return {
    width: twin ? rootOf(measureKey(twin.id, "width"), links) : undefined,
    height: first ? rootOf(measureKey(first.id, "heightL"), links) : undefined,
    ridge: twin && twinRidge ? rootOf(measureKey(twin.id, `break:${twinRidge.id}`), links) : undefined,
  }
}

export const describe = (m: Measure | undefined) => (m ? `${m.elevationName} · ${m.wallName} · ${m.label}` : "a removed measurement")
