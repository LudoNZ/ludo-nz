/** An intertenancy (party) wall of Integra lightweight-concrete panels —
 * e.g. Resene Construction Systems' INTA120a: a 50 mm panel standing in
 * the cavity between the two units' own timber walls, held off each by
 * brackets (two a full panel, on every second stud, the other side's on
 * the studs between), FireWool packed from its top to the roofing and at
 * its outside edges, fire sealant round it.
 *
 * In: each wall's length and its height along it (it runs from the slab to
 * the underside of the roofing, so it follows the roof: a gable's peak, or
 * steps where one unit's roof is higher). Out: panels (sticks of a stock
 * length stood side by side), brackets and their screws, FireWool, sealant,
 * the joints. mm. Pure.
 *
 * An estimate off the usual layout, not the system's spec: check panel
 * sizes, bracket spacing and fixings against the manufacturer's current
 * documents (and the consent drawings) before ordering. */

export interface IntegraSettings {
  /** the panel: its width (side by side along the wall), stock length (up the wall) and thickness */
  panelWidthMm: number
  panelLengthMm: number
  panelThickMm: number
  /** brackets per full-length panel (fewer on a short piece, at least one) */
  bracketsPerPanel: number
  /** screws per bracket: into the frame, and into the panel */
  screwsToFrame: number
  screwsToPanel: number
  /** FireWool: how deep it's packed over the top (to the roofing) and up each outside edge */
  fireWoolTopMm: number
  /** panels lost to breakage and cutting */
  wastePct: number
}

export const DEFAULT_INTEGRA: IntegraSettings = {
  panelWidthMm: 600,
  panelLengthMm: 2700,
  panelThickMm: 50,
  bracketsPerPanel: 2,
  screwsToFrame: 1,
  screwsToPanel: 1,
  fireWoolTopMm: 300,
  wastePct: 5,
}

export const integraFromData = (d: unknown): IntegraSettings => ({ ...DEFAULT_INTEGRA, ...(d && typeof d === "object" ? (d as Partial<IntegraSettings>) : {}) })

/** a party wall: its length, and its top along it (x from one end, z up from the slab) — its bottom's the slab */
export interface PartyWall {
  id: string
  name: string
  lengthMm: number
  top: { x: number; z: number }[]
  /** the bottom, where it isn't the slab (z along it); unset: 0 */
  bottom?: { x: number; z: number }[]
}

export interface IntegraColumn {
  x: number
  w: number
  /** its height at its middle (the tallest along it, for cutting) */
  h: number
  pieces: number
  /** whole panels used for it, and the offcut left */
  offcutMm: number
}

export interface IntegraWallResult {
  wall: PartyWall
  areaM2: number
  columns: IntegraColumn[]
  panels: number
  brackets: number
  screws: number
  /** joints between panels: vertical (side by side) and horizontal (end to end), metres */
  vJointM: number
  hJointM: number
  /** FireWool over the top and up the ends, m² and as metres of top run */
  fireWoolM2: number
  topRunM: number
  sealantM: number
  maxHeightMm: number
}

export interface IntegraResult {
  walls: IntegraWallResult[]
  panels: number
  panelsToOrder: number
  brackets: number
  screws: number
  areaM2: number
  fireWoolM2: number
  sealantM: number
  notes: string[]
}

/** the height of a profile at x (straight between its points) */
const heightAt = (pts: { x: number; z: number }[], x: number) => {
  if (!pts.length) return 0
  const s = [...pts].sort((a, b) => a.x - b.x)
  if (x <= s[0].x) return s[0].z
  for (let i = 1; i < s.length; i++) if (x <= s[i].x) return s[i - 1].z + ((s[i].z - s[i - 1].z) * (x - s[i - 1].x)) / (s[i].x - s[i - 1].x || 1)
  return s[s.length - 1].z
}

export function integraWall(wall: PartyWall, st: IntegraSettings = DEFAULT_INTEGRA): IntegraWallResult {
  const L = wall.lengthMm
  const bottom = (x: number) => (wall.bottom ? heightAt(wall.bottom, x) : 0)
  const h = (x: number) => Math.max(0, heightAt(wall.top, x) - bottom(x))
  // the profile's bends, to find each column's tallest point
  const bends = [...wall.top.map((p) => p.x), ...(wall.bottom ?? []).map((p) => p.x)]
  const columns: IntegraColumn[] = []
  let panels = 0
  let brackets = 0
  let hJoint = 0
  // (offcuts carried on to start the next column, if long enough)
  const offcuts: number[] = []
  for (let x = 0; x < L - 1; x += st.panelWidthMm) {
    const w = Math.min(st.panelWidthMm, L - x)
    const xs = [x, x + w, ...bends.filter((b) => b > x && b < x + w)]
    const tall = Math.max(...xs.map(h))
    if (tall <= 0) continue
    let left = tall
    let pieces = 0
    let offcut = 0
    while (left > 1) {
      // an offcut that covers what's left, else a new panel
      const k = offcuts.findIndex((o) => o >= left)
      if (k >= 0 && left < st.panelLengthMm) {
        offcuts.splice(k, 1)
        pieces++
        left = 0
        break
      }
      panels++
      pieces++
      const used = Math.min(left, st.panelLengthMm)
      brackets += Math.max(1, Math.round((st.bracketsPerPanel * used) / st.panelLengthMm))
      if (st.panelLengthMm - used > 300) offcuts.push(st.panelLengthMm - used)
      offcut = st.panelLengthMm - used
      left -= used
    }
    hJoint += (pieces - 1) * w
    columns.push({ x, w, h: tall, pieces, offcutMm: offcut })
  }
  // the area under the profile
  const xs = [...new Set([0, L, ...bends.filter((b) => b > 0 && b < L)])].sort((a, b) => a - b)
  let area = 0
  let topRun = 0
  for (let i = 0; i + 1 < xs.length; i++) {
    area += ((h(xs[i]) + h(xs[i + 1])) / 2) * (xs[i + 1] - xs[i])
    topRun += Math.hypot(xs[i + 1] - xs[i], heightAt(wall.top, xs[i + 1]) - heightAt(wall.top, xs[i]))
  }
  const maxH = Math.max(0, ...xs.map(h))
  const vJoint = columns.slice(1).reduce((t, c) => t + Math.min(c.h, columns[columns.indexOf(c) - 1].h), 0)
  const ends = h(0) + h(L)
  return {
    wall,
    areaM2: area / 1e6,
    columns,
    panels,
    brackets,
    screws: brackets * (st.screwsToFrame + st.screwsToPanel),
    vJointM: vJoint / 1000,
    hJointM: hJoint / 1000,
    fireWoolM2: ((topRun + ends) * st.fireWoolTopMm) / 1e6,
    topRunM: topRun / 1000,
    sealantM: (topRun + ends + L) / 1000,
    maxHeightMm: maxH,
  }
}

export function integraWalls(walls: PartyWall[], st: IntegraSettings = DEFAULT_INTEGRA): IntegraResult {
  const rs = walls.map((w) => integraWall(w, st))
  const sum = (f: (r: IntegraWallResult) => number) => rs.reduce((t, r) => t + f(r), 0)
  const panels = sum((r) => r.panels)
  const notes: string[] = []
  if (rs.some((r) => r.maxHeightMm > 2 * st.panelLengthMm)) notes.push("Over two panels tall: the horizontal joints want staggering — see the system's details.")
  notes.push("Check panel sizes, bracket spacing and fixings against the manufacturer's current documents before ordering.")
  return {
    walls: rs,
    panels,
    panelsToOrder: Math.ceil(panels * (1 + st.wastePct / 100)),
    brackets: sum((r) => r.brackets),
    screws: sum((r) => r.screws),
    areaM2: sum((r) => r.areaM2),
    fireWoolM2: sum((r) => r.fireWoolM2),
    sealantM: sum((r) => r.sealantM),
    notes,
  }
}
