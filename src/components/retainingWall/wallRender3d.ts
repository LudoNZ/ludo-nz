/** A shaded 3D model of a retaining wall, for a presentation view: the
 * plan gives each post and board its place on the ground, the profile
 * gives every level, and this builds the solids (posts, board courses,
 * top board, cap), the ground in front and the retained earth behind,
 * then projects them axonometrically and sorts them back to front.
 *
 * Pure geometry, no React — wallRenderView.tsx draws the result as SVG.
 *
 * World axes: x east (= plan x), y north (= -plan y, since the plan's y
 * points down the screen), z up (= level). */

import { bayCourseLayout, ProfilePost, WallProfile } from "./postProfile"
import { CalcSettings } from "./calcSettings"
import { PlanPoint, RetainedSide, sideNormal } from "./wallPlan"

type V3 = [number, number, number]

export interface RenderOptions {
  /** degrees, how far the camera swings round from square-on to the
   * wall's face (positive = round to the right) */
  azimuthDeg: number
  /** degrees above horizontal */
  elevationDeg: number
  /** posts and concrete below ground, drawn see-through */
  showFootings: boolean
}

export interface RenderPolygon {
  /** "x,y x,y …" in view space */
  points: string
  fill: string
  stroke: string
  opacity?: number
}

export interface RenderScene {
  polygons: RenderPolygon[]
  viewBox: { x: number; y: number; w: number; h: number }
  /** a stroke width that reads at this scale */
  strokeW: number
}

/** ~ a 150 × 50 board */
const BOARD_THICKNESS_M = 0.05
const CAP_THICKNESS_M = 0.045
const CAP_OVERHANG_M = 0.025
/** how far the ground runs out in front, and the earth back behind */
const GROUND_FRONT_M = 1.1
const EARTH_BACK_M = 1.0

const COLORS = {
  board: "#c9924f",
  topBoard: "#b07a3e",
  cap: "#ddb06f",
  post: "#93613a",
  grass: "#86a861",
  earthTop: "#7c9b57",
  soil: "#8a6a4c",
  concrete: "#b9bcc0",
  blocked: "#d9534f",
}

// ── small vector helpers ───────────────────────────────────────────────
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const centroid = (pts: V3[]): V3 => scale(pts.reduce(add, [0, 0, 0] as V3), 1 / pts.length)

/** Newell's method — robust for any planar polygon */
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

// ── solids ─────────────────────────────────────────────────────────────
interface Face {
  pts: V3[]
  color: string
}

/** One thing drawn as a unit: a convex solid (its faces facing away
 * from the camera are dropped, so what's left never overlaps itself) or
 * a single double-sided sheet (ground, earth). */
interface Item {
  faces: Face[]
  /** true = convex closed solid, so cull its back faces */
  solid: boolean
  /** what it's sorted on, back to front, within its layer */
  key: number
  layer: number
  opacity?: number
}

/** a convex solid: point each face's winding outward from the middle */
const orientOutward = (faces: Face[]): Face[] => {
  const mid = centroid(faces.flatMap((f) => f.pts))
  return faces.map((f) => (dot(faceNormal(f.pts), sub(centroid(f.pts), mid)) < 0 ? { ...f, pts: [...f.pts].reverse() } : f))
}

/** A run's local frame at a post: `u` along the run, `n` across it
 * toward the retained ground, z up. */
interface RunFrame {
  origin: V3
  dir: V3
  normal: V3
}

/** Extrudes a convex profile drawn in a run's (u, z) plane across the
 * run from n0 to n1 — a board, a post, a cap. */
const extrude = (frame: RunFrame, profile: [number, number][], n0: number, n1: number, color: string): Face[] => {
  const at = (u: number, z: number, n: number): V3 => {
    const p = add(add(frame.origin, scale(frame.dir, u)), scale(frame.normal, n))
    return [p[0], p[1], z]
  }
  const front = profile.map(([u, z]) => at(u, z, n0))
  const back = profile.map(([u, z]) => at(u, z, n1))
  const faces: Face[] = [
    { pts: front, color },
    { pts: back, color },
  ]
  for (let i = 0; i < profile.length; i++) {
    const j = (i + 1) % profile.length
    faces.push({ pts: [front[i], front[j], back[j], back[i]], color })
  }
  return orientOutward(faces)
}

/** a vertical prism on a footprint (world xy) — a round post */
const prism = (footprint: [number, number][], z0: number, z1: number, color: string): Face[] => {
  const bottom = footprint.map(([x, y]): V3 => [x, y, z0])
  const top = footprint.map(([x, y]): V3 => [x, y, z1])
  const faces: Face[] = [
    { pts: bottom, color },
    { pts: top, color },
  ]
  for (let i = 0; i < footprint.length; i++) {
    const j = (i + 1) % footprint.length
    faces.push({ pts: [bottom[i], bottom[j], top[j], top[i]], color })
  }
  return orientOutward(faces)
}

/** Cuts a convex (u, z) polygon down to the part at or under the line
 * z = z0 + slope·(u − u0). */
const clipUnder = (poly: [number, number][], u0: number, z0: number, slope: number): [number, number][] => {
  const f = ([u, z]: [number, number]) => z0 + slope * (u - u0) - z
  const out: [number, number][] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const fa = f(a)
    const fb = f(b)
    if (fa >= 0) out.push(a)
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

/** a one-sided cut face, wound to face `outward` so it's culled from behind */
const facing = (pts: V3[], outward: V3, color: string): Face => ({ pts: dot(faceNormal(pts), outward) < 0 ? [...pts].reverse() : pts, color })

const isRound = (p: ProfilePost) => /round/i.test(p.sizeLabel)

// ── the scene ──────────────────────────────────────────────────────────

/** Builds and projects the whole wall. Returns null if there's nothing
 * to draw. */
export function buildRenderScene(
  profile: WallProfile,
  planPoints: PlanPoint[],
  retainedSide: RetainedSide,
  settings: CalcSettings,
  topCapEnabled: boolean,
  options: RenderOptions
): RenderScene | null {
  const { posts, bays, segments } = profile
  if (posts.length < 2 || planPoints.length < 2) return null

  const toWorld = (p: PlanPoint): V3 => [p.xM, -p.yM, 0]
  // each run's direction and its normal toward the retained ground, in world space
  const runs = segments.map((seg) => {
    const a = planPoints[seg.index]
    const b = planPoints[seg.index + 1]
    const len = Math.hypot(b.xM - a.xM, b.yM - a.yM) || 1
    const dir: V3 = [(b.xM - a.xM) / len, -(b.yM - a.yM) / len, 0]
    const n = sideNormal(a, b, retainedSide)
    return { seg, start: toWorld(a), dir, normal: [n.xM, -n.yM, 0] as V3 }
  })
  const runOfBay = (leftIndex: number) => runs.find((r) => leftIndex >= r.seg.startPostIndex && leftIndex < r.seg.endPostIndex) ?? runs[runs.length - 1]
  const runOfPost = (i: number) => runOfBay(Math.min(i, posts.length - 2))
  /** the frame at a post, set in the given run */
  const frameAt = (postIndex: number, run = runOfPost(postIndex)): RunFrame => ({
    origin: add(run.start, scale(run.dir, posts[postIndex].xM - run.seg.startXM)),
    dir: run.dir,
    normal: run.normal,
  })
  /** the point `n` across the wall from a post — mitred at a corner, so
   * the ground and earth strips either side of it meet up */
  const acrossAt = (postIndex: number, n: number, z: number, run = runOfPost(postIndex)): V3 => {
    const post = posts[postIndex]
    let offset = scale(run.normal, n)
    if (post.isCorner) {
      const before = runOfBay(postIndex - 1)
      const after = runOfBay(postIndex)
      const mid = norm(add(before.normal, after.normal))
      const cosHalf = Math.max(dot(mid, before.normal), 0.6)
      offset = scale(mid, n / cosHalf)
    }
    const p = add(frameAt(postIndex, run).origin, offset)
    return [p[0], p[1], z]
  }

  const ch = settings.boardCourseHeightM
  const t = BOARD_THICKNESS_M
  // posts are centred on the wall line; the boards go on their retained
  // side, so the ground pushes them onto the posts
  const postHalf = (p: ProfilePost) => p.widthM / 2
  const boardFront = (p: ProfilePost) => postHalf(p)
  const maxHalf = Math.max(...posts.map(postHalf))
  const earthFrontN = maxHalf + t

  const lowestGround = Math.min(...posts.map((p) => p.groundLevelM))
  const deepest = Math.min(...posts.map((p) => p.groundLevelM - p.embedmentM))
  const slabBottom = options.showFootings ? deepest - 0.15 : lowestGround - 0.3

  const items: Item[] = []
  const LAYER = { ground: 0, earth: 1, footing: 2, wall: 3 }

  /** where each bay's top is, at each of its two ends */
  const bayTops = bays.map((bay) => {
    const a = posts[bay.leftIndex]
    const b = posts[bay.rightIndex]
    return bay.stepTopM !== null ? [bay.stepTopM, bay.stepTopM] : [a.topAfterM, b.topBeforeM]
  })

  /** how far the wall's ends reach past the end posts' centres */
  const endReach = (i: number) => (i === 0 || i === posts.length - 1 ? postHalf(posts[i]) : 0)

  // ── ground in front, running under the wall ──────────────────────────
  bays.forEach((bay) => {
    const run = runOfBay(bay.leftIndex)
    const a = posts[bay.leftIndex]
    const b = posts[bay.rightIndex]
    const ext = (i: number, n: number, z: number) => {
      const reach = i === bay.leftIndex ? -endReach(i) : endReach(i)
      return add(acrossAt(i, n, z, run), scale(run.dir, reach))
    }
    const aFront = ext(a.index, -GROUND_FRONT_M, a.groundLevelM)
    const bFront = ext(b.index, -GROUND_FRONT_M, b.groundLevelM)
    const aBack = ext(a.index, earthFrontN, a.groundLevelM)
    const bBack = ext(b.index, earthFrontN, b.groundLevelM)
    items.push({ faces: [{ pts: [aFront, bFront, bBack, aBack], color: COLORS.grass }], solid: false, key: 0, layer: LAYER.ground })
    // the cut edge of the ground along the front
    items.push({
      faces: [facing([aFront, bFront, [bFront[0], bFront[1], slabBottom], [aFront[0], aFront[1], slabBottom]], scale(run.normal, -1), COLORS.soil)],
      solid: true,
      key: 1,
      layer: LAYER.ground,
    })
  })

  // ── retained earth behind ────────────────────────────────────────────
  // a block from the back of the boards to EARTH_BACK_M behind them,
  // its top just under the top of the wall
  const earthDrop = 0.02
  bays.forEach((bay, k) => {
    const run = runOfBay(bay.leftIndex)
    const [topA, topB] = bayTops[k]
    const ext = (i: number, n: number, z: number) => {
      const reach = i === bay.leftIndex ? -endReach(i) : endReach(i)
      return add(acrossAt(i, n, z, run), scale(run.dir, reach))
    }
    const pts = [
      ext(bay.leftIndex, earthFrontN, topA - earthDrop),
      ext(bay.rightIndex, earthFrontN, topB - earthDrop),
      ext(bay.rightIndex, earthFrontN + EARTH_BACK_M, topB - earthDrop),
      ext(bay.leftIndex, earthFrontN + EARTH_BACK_M, topA - earthDrop),
    ]
    items.push({ faces: [{ pts, color: COLORS.earthTop }], solid: false, key: 0, layer: LAYER.earth })
    // its back, seen only when the camera's round behind this run
    const back = [pts[3], pts[2], [pts[2][0], pts[2][1], slabBottom] as V3, [pts[3][0], pts[3][1], slabBottom] as V3]
    items.push({ faces: [facing(back, run.normal, COLORS.soil)], solid: true, key: 2, layer: LAYER.earth })
    // a riser where the next bay's earth starts at a different level
    const next = bayTops[k + 1]
    if (next && Math.abs(next[0] - topB) > 1e-4) {
      const i = bay.rightIndex
      items.push({
        faces: [
          {
            pts: [
              acrossAt(i, earthFrontN, topB - earthDrop),
              acrossAt(i, earthFrontN + EARTH_BACK_M, topB - earthDrop),
              acrossAt(i, earthFrontN + EARTH_BACK_M, next[0] - earthDrop),
              acrossAt(i, earthFrontN, next[0] - earthDrop),
            ],
            color: COLORS.soil,
          },
        ],
        solid: false,
        key: 1,
        layer: LAYER.earth,
      })
    }
  })
  // the cut ends: ground and earth seen in section at each end of the wall
  const endSection = (i: number, top: number, outward: number) => {
    const run = runOfPost(i)
    const p = posts[i]
    const at = (n: number, z: number) => add(acrossAt(i, n, z, run), scale(run.dir, outward * endReach(i)))
    const pts = [
      at(-GROUND_FRONT_M, p.groundLevelM),
      at(earthFrontN, p.groundLevelM),
      at(earthFrontN, top - earthDrop),
      at(earthFrontN + EARTH_BACK_M, top - earthDrop),
      at(earthFrontN + EARTH_BACK_M, slabBottom),
      at(-GROUND_FRONT_M, slabBottom),
    ]
    return {
      faces: [facing(pts, scale(run.dir, outward), COLORS.soil)],
      solid: true,
      key: 2,
      layer: LAYER.earth,
    }
  }
  if (bays.length) {
    items.push(endSection(0, bayTops[0][0], -1))
    items.push(endSection(posts.length - 1, bayTops[bays.length - 1][1], 1))
  }

  // ── boards ───────────────────────────────────────────────────────────
  /** every wall item, with the posts/bays it touches, for sorting */
  const wallItems: { item: Item; bay?: number; post?: number }[] = []
  bays.forEach((bay, k) => {
    const run = runOfBay(bay.leftIndex)
    const a = posts[bay.leftIndex]
    const b = posts[bay.rightIndex]
    const frame = frameAt(a.index, run)
    const width = b.xM - a.xM
    const overrun = bay.boardOverrunM
    // a board's overrun goes on whichever end is the end of a run of boards
    const prevBay = bays[k - 1]
    const nextBay = bays[k + 1]
    const runStart = !prevBay || prevBay.needsEngineer || a.isCorner
    const runEnd = !nextBay || nextBay.needsEngineer || b.isCorner
    const u0 = runStart ? -overrun : 0
    const u1 = runEnd ? width + overrun : width
    const n0 = Math.max(boardFront(a), boardFront(b))
    const n1 = n0 + t
    const [topA, topB] = bayTops[k]
    const slope = width > 0 ? (topB - topA) / width : 0

    if (bay.needsEngineer) {
      const faces = extrude(frame, [[0, Math.min(a.groundLevelM, b.groundLevelM)], [width, Math.min(a.groundLevelM, b.groundLevelM)], [width, topB], [0, topA]], n0, n1, COLORS.blocked)
      wallItems.push({ item: { faces, solid: true, key: 0, layer: LAYER.wall, opacity: 0.45 }, bay: k })
      return
    }

    const layout =
      bay.stepTopM !== null
        ? { baseLevelM: Math.min(a.groundLevelM, b.groundLevelM), courseCount: bay.levelCourseCount, undersideAM: bay.stepTopM, undersideBM: bay.stepTopM }
        : bayCourseLayout(a, b, ch, profile.rakedTopBoard)
    const { baseLevelM, undersideAM, undersideBM } = layout
    const underSlope = width > 0 ? (undersideBM - undersideAM) / width : 0
    for (let c = 0; c < layout.courseCount; c++) {
      const z0 = baseLevelM + c * ch
      const z1 = z0 + ch
      const rect: [number, number][] = [
        [u0, z0],
        [u1, z0],
        [u1, z1],
        [u0, z1],
      ]
      const prof = clipUnder(rect, 0, undersideAM, underSlope)
      if (prof.length < 3) continue
      wallItems.push({ item: { faces: extrude(frame, prof, n0, n1, COLORS.board), solid: true, key: 0, layer: LAYER.wall }, bay: k })
    }
    // the top board: from the courses' underside line up to the top
    if (bay.stepTopM === null) {
      const prof: [number, number][] = [
        [u0, undersideAM + underSlope * u0],
        [u1, undersideAM + underSlope * u1],
        [u1, topA + slope * u1],
        [u0, topA + slope * u0],
      ]
      if (topA + slope * u0 - (undersideAM + underSlope * u0) > 1e-4 || topA + slope * u1 - (undersideAM + underSlope * u1) > 1e-4)
        wallItems.push({ item: { faces: extrude(frame, prof, n0, n1, COLORS.topBoard), solid: true, key: 0, layer: LAYER.wall }, bay: k })
    }
    if (topCapEnabled) {
      const prof: [number, number][] = [
        [u0 - CAP_OVERHANG_M, topA + slope * (u0 - CAP_OVERHANG_M)],
        [u1 + CAP_OVERHANG_M, topA + slope * (u1 + CAP_OVERHANG_M)],
        [u1 + CAP_OVERHANG_M, topA + slope * (u1 + CAP_OVERHANG_M) + CAP_THICKNESS_M],
        [u0 - CAP_OVERHANG_M, topA + slope * (u0 - CAP_OVERHANG_M) + CAP_THICKNESS_M],
      ]
      const faces = extrude(frame, prof, -Math.max(postHalf(a), postHalf(b)) - CAP_OVERHANG_M, n1 + CAP_OVERHANG_M, COLORS.cap)
      wallItems.push({ item: { faces, solid: true, key: 0, layer: LAYER.wall + 1 }, bay: k })
    }
  })

  // ── posts ────────────────────────────────────────────────────────────
  posts.forEach((p) => {
    const color = p.needsEngineer ? COLORS.blocked : COLORS.post
    const half = postHalf(p)
    // at a corner, square posts sit square to the wall after it
    const frame = frameAt(p.index)
    const footprint: [number, number][] = isRound(p)
      ? Array.from({ length: 12 }, (_, k) => {
          const a = (k / 12) * Math.PI * 2
          return [frame.origin[0] + Math.cos(a) * half, frame.origin[1] + Math.sin(a) * half]
        })
      : (
          [
            [-half, -half],
            [half, -half],
            [half, half],
            [-half, half],
          ] as [number, number][]
        ).map(([u, n]) => [frame.origin[0] + frame.dir[0] * u + frame.normal[0] * n, frame.origin[1] + frame.dir[1] * u + frame.normal[1] * n])
    wallItems.push({ item: { faces: prism(footprint, p.groundLevelM, p.topLevelM, color), solid: true, key: 0, layer: LAYER.wall, opacity: p.needsEngineer ? 0.7 : undefined }, post: p.index })

    if (options.showFootings) {
      const postBottom = p.groundLevelM - Math.max(0, p.embedmentM - settings.gravelBaseAllowanceM)
      const r = p.holeDiameterM / 2
      const hole: [number, number][] = Array.from({ length: 14 }, (_, k) => {
        const a = (k / 14) * Math.PI * 2
        return [frame.origin[0] + Math.cos(a) * r, frame.origin[1] + Math.sin(a) * r]
      })
      items.push({ faces: prism(hole, p.groundLevelM - p.embedmentM, p.groundLevelM - 0.005, COLORS.concrete), solid: true, key: 0, layer: LAYER.footing, opacity: 0.55 })
      items.push({ faces: prism(footprint, postBottom, p.groundLevelM - 0.004, COLORS.post), solid: true, key: 1, layer: LAYER.footing, opacity: 0.8 })
    }
  })

  // ── camera ───────────────────────────────────────────────────────────
  // square-on is looking at the wall's face from the low side: the
  // length-weighted average of the runs' outward normals
  let face: V3 = [0, 0, 0]
  runs.forEach((r) => (face = add(face, scale(r.normal, -r.seg.lengthM))))
  if (Math.hypot(face[0], face[1]) < 1e-6) face = scale(runs[0].normal, -1)
  const baseAz = Math.atan2(face[1], face[0])
  const az = baseAz + (options.azimuthDeg * Math.PI) / 180
  const el = (options.elevationDeg * Math.PI) / 180
  /** from the scene toward the camera */
  const toCam: V3 = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)]
  const right: V3 = norm([-toCam[1], toCam[0], 0])
  const up = cross(toCam, right)
  // a sun high and round to the left of the camera, so the face is lit
  // and the tops and ends read as different planes
  const lightAz = az + (35 * Math.PI) / 180
  const lightEl = (45 * Math.PI) / 180
  const light: V3 = [Math.cos(lightEl) * Math.cos(lightAz), Math.cos(lightEl) * Math.sin(lightAz), Math.sin(lightEl)]

  const depth = (p: V3) => dot(p, toCam)
  const project = (p: V3): [number, number] => [dot(p, right), -dot(p, up)]

  // sort keys: back to front by depth; a post goes after the boards of
  // the bays either side of it (they're behind it), a cap after both
  wallItems.forEach((w) => (w.item.key = depth(centroid(w.item.faces.flatMap((f) => f.pts)))))
  const bayKey = new Map<number, number>()
  wallItems.forEach((w) => w.bay !== undefined && w.item.layer === LAYER.wall && bayKey.set(w.bay, Math.max(bayKey.get(w.bay) ?? -Infinity, w.item.key)))
  const postKey = new Map<number, number>()
  wallItems.forEach((w) => {
    if (w.post === undefined) return
    const around = [w.post - 1, w.post].map((k) => bayKey.get(k)).filter((k): k is number => k !== undefined)
    w.item.key = Math.max(w.item.key, ...around) + 1e-6
    postKey.set(w.post, w.item.key)
  })
  wallItems.forEach((w) => {
    if (w.bay === undefined || w.item.layer !== LAYER.wall + 1) return
    const bay = bays[w.bay]
    w.item.key = Math.max(w.item.key, postKey.get(bay.leftIndex) ?? -Infinity, postKey.get(bay.rightIndex) ?? -Infinity) + 2e-6
    w.item.layer = LAYER.wall
  })
  // a run seen from behind (the camera's round on its retained side) is
  // mostly hidden by its own earth: draw it before the earth, so the
  // earth covers it — only a cap stays on top
  const backFacing = (run: (typeof runs)[number]) => dot(run.normal, toCam) > 0
  wallItems.forEach((w) => {
    if (w.item.layer !== LAYER.wall || w.item.faces[0]?.color === COLORS.cap) return
    const behind =
      w.bay !== undefined
        ? backFacing(runOfBay(bays[w.bay].leftIndex))
        : [w.post! - 1, w.post!].filter((k) => k >= 0 && k < bays.length).every((k) => backFacing(runOfBay(bays[k].leftIndex)))
    if (behind) w.item.layer = LAYER.earth - 0.5
  })
  items.forEach((it) => {
    if (it.layer !== LAYER.ground) it.key = depth(centroid(it.faces.flatMap((f) => f.pts))) + it.key * 1e-6
  })
  const all = [...items, ...wallItems.map((w) => w.item)].sort((a, b) => a.layer - b.layer || a.key - b.key)

  const polygons: RenderPolygon[] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  all.forEach((it) => {
    it.faces.forEach((f) => {
      let n = faceNormal(f.pts)
      const towards = dot(n, toCam)
      if (it.solid && towards <= 1e-6) return
      if (!it.solid && towards < 0) n = scale(n, -1)
      if (!it.solid && Math.abs(towards) < 1e-6) return
      const lambert = Math.max(0, dot(n, light))
      const shade = 0.5 + 0.6 * lambert
      const rgb = hexToRgb(f.color)
      const fill = rgbToHex(scale(rgb, shade))
      // the ground and earth are drawn in strips, a bay at a time;
      // outline them in their own colour so the strips join up seamlessly
      const stroke = it.layer === LAYER.ground || it.layer === LAYER.earth ? fill : rgbToHex(scale(rgb, shade * 0.72))
      const pts2 = f.pts.map(project)
      pts2.forEach(([x, y]) => {
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      })
      polygons.push({ points: pts2.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(" "), fill, stroke, opacity: it.opacity })
    })
  })
  if (!polygons.length) return null
  const span = Math.max(maxX - minX, maxY - minY)
  const pad = span * 0.05
  return {
    polygons,
    viewBox: { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 },
    strokeW: span * 0.0012,
  }
}
