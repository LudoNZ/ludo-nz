/** The whole site in 3D: every retaining wall where it's placed on the
 * site plan, the ground in front of it and the earth it holds back, and
 * every stair on it — for seeing how the walls sit together, and for the
 * site proposal.
 *
 * Simpler than one wall's own 3D view (wallRender3d.ts): each wall is
 * posts, one panel of boards a bay and a block of earth behind, with no
 * footings, joins or cap pieces — it's the shape of the job, not the
 * build. Every part is a convex solid, sorted back to front the stairs
 * calculator's way (orderSolids).
 *
 * World axes, metres: x east (= site plan x), y north (= −plan y), z up
 * (= level, every wall's levels taken as on one datum). Pure — no React. */

import { orderSolids, Solid, V3 } from "../stairs/stairRender3d"
import { CameraState, FIT_CAMERA, makeCamera, surfaceAtCentre } from "../render3d/perspective"
import type { RenderScene } from "../retainingWall/wallRender3d"
import { sideNormal } from "../retainingWall/wallPlan"
import type { StairPlacement } from "./siteProject"
import { SiteWall, siteWallProfile, stairRenderExtra, toSite } from "./siteProject"

export interface SiteRenderOptions {
  /** degrees, how far the camera swings round from looking at the walls' faces */
  azimuthDeg: number
  /** degrees above horizontal */
  elevationDeg: number
  /** flown in (full screen); the fitted view if left out */
  camera?: CameraState
}

const BOARD_M = 0.05
const EARTH_BACK_M = 0.9
const GROUND_FRONT_M = 1.0
const MARGIN_M = 2.5

const COLORS = {
  board: "#c9924f",
  post: "#93613a",
  grass: "#9cc46e",
  earthTop: "#5e7f3c",
  soil: "#8a6a4c",
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const centroid = (pts: V3[]): V3 => scale(pts.reduce(add, [0, 0, 0] as V3), 1 / pts.length)
const faceNormal = (pts: V3[]): V3 => {
  let n: V3 = [0, 0, 0]
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])])
  }
  return norm(n)
}
const hexToRgb = (hex: string): V3 => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
const rgbToHex = (c: V3) => "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")

/** faces wound outward with their normals; any face looking up takes `topColor` */
const makeSolid = (faces: { pts: V3[]; color: string }[], topColor?: string): Solid => {
  const mid = centroid(faces.flatMap((f) => f.pts))
  return {
    faces: faces.map((f) => {
      let n = faceNormal(f.pts)
      let pts = f.pts
      if (dot(n, sub(centroid(f.pts), mid)) < 0) {
        pts = [...f.pts].reverse()
        n = scale(n, -1)
      }
      return { pts, normal: n, color: topColor && n[2] > 0.5 ? topColor : f.color }
    }),
  }
}

/** a convex (u, z) profile in a run's frame, extruded across it from n0 to n1 */
const extrude = (at: (u: number, n: number, z: number) => V3, profile: [number, number][], n0: number, n1: number, color: string, topColor?: string): Solid | null => {
  if (n1 - n0 < 1e-4 || profile.length < 3) return null
  const front = profile.map(([u, z]) => at(u, n0, z))
  const back = profile.map(([u, z]) => at(u, n1, z))
  const faces = [
    { pts: front, color },
    { pts: back, color },
  ]
  for (let i = 0; i < profile.length; i++) {
    const j = (i + 1) % profile.length
    faces.push({ pts: [front[i], front[j], back[j], back[i]], color })
  }
  return makeSolid(faces, topColor)
}

/** Builds and projects the site. Null when there's nothing to draw. */
export function buildSiteScene(walls: SiteWall[], placements: { wall: SiteWall; placement: StairPlacement }[], options: SiteRenderOptions): RenderScene | null {
  const built = walls.flatMap((w) => {
    const profile = siteWallProfile(w.wall)
    if (!profile || profile.posts.length < 2 || w.wall.planPoints.length < 2) return []
    return [{ w, profile, pts: w.wall.planPoints.map(toSite(w)) }]
  })
  if (!built.length) return null
  // the ground everything stands on: the lowest ground of any wall
  const base = Math.min(...built.flatMap(({ profile }) => profile.posts.map((p) => p.groundLevelM)))

  const solids: Solid[] = []
  /** where the camera looks square-on from: the walls' low sides, by length */
  let facing: V3 = [0, 0, 0]

  for (const { w, profile, pts } of built) {
    const { posts, bays, segments } = profile
    const runs = segments.map((seg) => {
      const a = pts[seg.index]
      const b = pts[seg.index + 1]
      const len = Math.hypot(b.xM - a.xM, b.yM - a.yM) || 1
      const n = sideNormal(a, b, w.wall.retainedSide)
      const dir: V3 = [(b.xM - a.xM) / len, -(b.yM - a.yM) / len, 0]
      const normal: V3 = [n.xM, -n.yM, 0]
      facing = add(facing, scale(normal, -seg.lengthM))
      const start: V3 = [a.xM, -a.yM, 0]
      return { seg, at: (u: number, nn: number, z: number): V3 => [start[0] + dir[0] * (u - seg.startXM) + normal[0] * nn, start[1] + dir[1] * (u - seg.startXM) + normal[1] * nn, z] }
    })
    const runOfBay = (left: number) => runs.find((r) => left >= r.seg.startPostIndex && left < r.seg.endPostIndex) ?? runs[runs.length - 1]

    for (const bay of bays) {
      const a = posts[bay.leftIndex]
      const b = posts[bay.rightIndex]
      const run = runOfBay(bay.leftIndex)
      const [topA, topB] = bay.stepTopM !== null ? [bay.stepTopM, bay.stepTopM] : [a.topAfterM, b.topBeforeM]
      const half = Math.max(a.widthM, b.widthM) / 2
      // the boards on the posts' retained side, ground to top
      const face = extrude(run.at, [[a.xM, Math.min(a.groundLevelM, b.groundLevelM)], [b.xM, Math.min(a.groundLevelM, b.groundLevelM)], [b.xM, topB], [a.xM, topA]], half, half + BOARD_M, COLORS.board)
      if (face) solids.push(face)
      // the earth held back, its top the top of the wall
      const earth = extrude(run.at, [[a.xM, base - 0.05], [b.xM, base - 0.05], [b.xM, topB], [a.xM, topA]], half + BOARD_M, half + BOARD_M + EARTH_BACK_M, COLORS.soil, COLORS.earthTop)
      if (earth) solids.push(earth)
      // ground in front, where the wall stands higher than the site's lowest
      if (Math.min(a.groundLevelM, b.groundLevelM) - base > 0.02) {
        const pad = extrude(run.at, [[a.xM, base - 0.05], [b.xM, base - 0.05], [b.xM, b.groundLevelM], [a.xM, a.groundLevelM]], -half - GROUND_FRONT_M, -half, COLORS.soil, COLORS.grass)
        if (pad) solids.push(pad)
      }
    }
    posts.forEach((p, i) => {
      const run = runOfBay(Math.min(i, posts.length - 2))
      const h = p.widthM / 2
      const top = Math.max(p.topBeforeM, p.topAfterM)
      const post = extrude(run.at, [[p.xM - h, p.groundLevelM], [p.xM + h, p.groundLevelM], [p.xM + h, top], [p.xM - h, top]], -h, h, COLORS.post)
      if (post) solids.push(post)
    })
  }

  // the stairs: the wall's own 3D world, put where the wall is on the site
  for (const { wall, placement } of placements) {
    if (!built.some((b) => b.w.id === wall.id)) continue
    const place = toSite(wall)
    for (const s of stairRenderExtra(placement).solids) {
      solids.push(
        makeSolid(
          s.map((f) => ({
            color: f.color,
            pts: f.pts.map(([x, y, z]): V3 => {
              const q = place({ xM: x, yM: -y })
              return [q.xM, -q.yM, z]
            }),
          })),
        ),
      )
    }
  }

  // ── camera ───────────────────────────────────────────────────────────
  if (Math.hypot(facing[0], facing[1]) < 1e-6) facing = [0, -1, 0]
  const baseAz = Math.atan2(facing[1], facing[0])
  const az = baseAz + (options.azimuthDeg * Math.PI) / 180
  const el = (options.elevationDeg * Math.PI) / 180
  const all = solids.flatMap((s) => s.faces.flatMap((f) => f.pts))
  // (the lawn's corners would make the view mostly lawn: fit to the solids)
  const cam = makeCamera(all, az, el, options.camera ?? FIT_CAMERA, 0.08)
  const lightAz = az + (35 * Math.PI) / 180
  const lightEl = (50 * Math.PI) / 180
  const light: V3 = [Math.cos(lightEl) * Math.cos(lightAz), Math.cos(lightEl) * Math.sin(lightAz), Math.sin(lightEl)]

  // ── draw ─────────────────────────────────────────────────────────────
  const polygons: RenderScene["polygons"] = []
  const drawn: { pts: V3[]; normal: V3 }[] = []
  const emit = (pts: V3[], color: string, normal: V3, seamless = false) => {
    const cut = cam.clip(pts)
    if (cut.length < 3) return
    drawn.push({ pts: cut, normal })
    const shade = 0.5 + 0.6 * Math.max(0, dot(normal, light))
    const rgb = hexToRgb(color)
    const fill = rgbToHex(scale(rgb, shade))
    polygons.push({
      points: cut
        .map(cam.project)
        .map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`)
        .join(" "),
      fill,
      stroke: seamless ? fill : rgbToHex(scale(rgb, shade * 0.72)),
    })
  }

  // a lawn round the lot at the lowest ground, drawn first (from under
  // it, there's none to see)
  const gx0 = Math.min(...all.map((p) => p[0])) - MARGIN_M
  const gx1 = Math.max(...all.map((p) => p[0])) + MARGIN_M
  const gy0 = Math.min(...all.map((p) => p[1])) - MARGIN_M
  const gy1 = Math.max(...all.map((p) => p[1])) + MARGIN_M
  if (cam.eye[2] > base)
    emit(
      [
        [gx0, gy0, base],
        [gx1, gy0, base],
        [gx1, gy1, base],
        [gx0, gy1, base],
      ],
      COLORS.grass,
      [0, 0, 1],
      true,
    )

  // flown in close, whatever's wholly behind the camera is left out
  const inView = solids.filter((sd) => sd.faces.some((f) => f.pts.some((p) => cam.ahead(p) > 0)))
  const order = orderSolids(inView, cam.toCam, cam.project, 5e-4, cam.eye)
  order.forEach((k) => inView[k].faces.forEach((f) => cam.sees(f.normal, f.pts[0]) && emit(f.pts, f.color, f.normal)))
  return {
    polygons,
    viewBox: cam.viewBox,
    strokeW: cam.span * 0.0012,
    // (only flown in is there anything to turn round but the middle)
    frame: { ...cam.frame, pivot: options.camera && options.camera !== FIT_CAMERA ? surfaceAtCentre(cam, drawn) : null },
  }
}
