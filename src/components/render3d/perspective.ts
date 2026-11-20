/** A perspective camera for the shaded 3D views (stairs, retaining walls,
 * site), that can fly in.
 *
 * The camera orbits a target (azimuth round, elevation up) from a
 * distance. At the fitted view it stands far enough back (a few times the
 * scene's size) that the scene looks nearly as it would square-on, and
 * fits the view box. Zooming in moves the camera closer — not a bigger
 * picture — so it can go right up to a joint, and in among the framing:
 * whatever's behind it is cut away (`clip`).
 *
 * Projected coordinates are the same units as the world (mm or m), with
 * the target at 0,0: at the target's distance, `zoom` 2 draws twice as
 * big. The view box is always the fitted one, so a drawing's stroke
 * widths stay the same on screen however close it's flown.
 *
 * Pure geometry, no React. */

export type V3 = [number, number, number]
export type V2 = [number, number]

/** where a zoomed / panned camera is: how close (fitted = 1) and the
 * point in the world it's looking at (null = the fitted view's middle).
 * A world point, so turning the view swings round what's being looked at. */
export interface CameraState {
  zoom: number
  look: V3 | null
}

export const FIT_CAMERA: CameraState = { zoom: 1, look: null }

/** what's needed to move a camera across the screen: its sideways and
 * up directions, and what it's looking at now */
export interface CameraFrame {
  right: V3
  up: V3
  look: V3
  eye: V3
  /** how far back the camera stands at the fit (zoom = this ÷ distance) */
  fitDistance: number
  /** the nearest surface at the middle of the screen, if any: what turning
   * swings round once it's flown in (see pivotOn) */
  pivot: V3 | null
}

/** how many times the scene's size the camera stands back at the fit */
const STAND_BACK = 3
export const MIN_CAMERA_ZOOM = 0.6
export const MAX_CAMERA_ZOOM = 60

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

export interface Camera {
  /** unit, from the target toward the camera */
  toCam: V3
  right: V3
  up: V3
  /** where the camera is */
  eye: V3
  /** on screen, in the fitted view box's units (a point behind the
   * camera is pushed to just in front of it — `clip` faces first) */
  project: (p: V3) => V2
  /** how far in front of the camera, along its view */
  ahead: (p: V3) => number
  /** a face's outside is toward the camera */
  sees: (normal: V3, onFace: V3) => boolean
  /** a face cut to what's in front of the camera (may come back empty) */
  clip: (pts: V3[]) => V3[]
  /** the fitted view, in projected units */
  viewBox: { x: number; y: number; w: number; h: number }
  /** the fitted view's size, for stroke widths */
  span: number
  /** for zooming and panning it (see zoomCameraAt) */
  frame: CameraFrame
}

/** `points` are what the fit frames (the solids, not a lawn round them);
 * `pad` the share of the fitted span left round them. */
export function makeCamera(points: V3[], azimuthRad: number, elevationRad: number, state: CameraState = FIT_CAMERA, pad = 0.03): Camera {
  const toCam: V3 = [Math.cos(elevationRad) * Math.cos(azimuthRad), Math.cos(elevationRad) * Math.sin(azimuthRad), Math.sin(elevationRad)]
  const right: V3 = norm([-toCam[1], toCam[0], 0])
  const up = cross(toCam, right)

  const lo: V3 = [Infinity, Infinity, Infinity]
  const hi: V3 = [-Infinity, -Infinity, -Infinity]
  for (const p of points)
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], p[i])
      hi[i] = Math.max(hi[i], p[i])
    }
  const size = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1
  const fitDistance = size * STAND_BACK

  const lens = (target: V3, distance: number) => {
    const eye = add(target, mul(toCam, distance))
    const near = fitDistance * 0.002
    const ahead = (p: V3) => -dot(sub(p, eye), toCam)
    const project = (p: V3): V2 => {
      const r = sub(p, eye)
      const z = Math.max(near, -dot(r, toCam))
      return [(dot(r, right) * fitDistance) / z, (-dot(r, up) * fitDistance) / z]
    }
    return { eye, near, ahead, project }
  }

  const bounds = (target: V3) => {
    const { project } = lens(target, fitDistance)
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const p of points) {
      const [x, y] = project(p)
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
    }
    return { x0, x1, y0, y1 }
  }
  // the fit: looking at the middle of the box, then shifted so the
  // projected scene's middle is the view's middle
  const first = bounds(mul(add(lo, hi), 0.5))
  const target = add(mul(add(lo, hi), 0.5), add(mul(right, (first.x0 + first.x1) / 2), mul(up, -(first.y0 + first.y1) / 2)))
  const fit = bounds(target)
  const fitSpan = Math.max(fit.x1 - fit.x0, fit.y1 - fit.y0) || 1
  const margin = fitSpan * pad
  const viewBox = { x: fit.x0 - margin, y: fit.y0 - margin, w: fit.x1 - fit.x0 + margin * 2, h: fit.y1 - fit.y0 + margin * 2 }

  // the camera as zoomed and panned: closer, looking at its own point
  const looked = state.look ?? target
  const { eye, near, ahead, project } = lens(looked, fitDistance / state.zoom)

  const clip = (pts: V3[]): V3[] => {
    const out: V3[] = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      const da = ahead(a) - near
      const db = ahead(b) - near
      if (da >= 0) out.push(a)
      if (da >= 0 !== db >= 0) out.push(add(a, mul(sub(b, a), da / (da - db))))
    }
    return out
  }

  return {
    toCam,
    right,
    up,
    eye,
    project,
    ahead,
    sees: (normal, onFace) => dot(normal, sub(eye, onFace)) > 0,
    clip,
    viewBox,
    span: fitSpan,
    frame: { right, up, look: looked, eye, fitDistance: fitDistance, pivot: null },
  }
}

/** Inside a polygon on screen? (crossings) */
const inside2 = (pts: V2[], x: number, y: number) => {
  let ins = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins
  }
  return ins
}

/** Of the faces drawn, the nearest point on one at the middle of the
 * screen (where the camera looks), or null. Faces as drawn: clipped, in
 * world space, with their projected points. */
export function surfaceAtCentre(cam: Camera, faces: { pts: V3[]; normal: V3 }[]): V3 | null {
  const dir = mul(cam.toCam, -1)
  let best: { t: number; p: V3 } | null = null
  for (const f of faces) {
    if (f.pts.length < 3) continue
    if (!inside2(f.pts.map(cam.project), 0, 0)) continue
    const along = dot(f.normal, dir)
    if (Math.abs(along) < 1e-9) continue
    const t = dot(f.normal, sub(f.pts[0], cam.eye)) / along
    if (t > 0 && (!best || t < best.t)) best = { t, p: add(cam.eye, mul(dir, t)) }
  }
  return best?.p ?? null
}

/** Ready to turn: looking at the surface in the middle of the screen
 * from where the camera already is, so the view doesn't move but turning
 * swings round what's there (not a point in mid-air behind it). */
export const pivotOn = (c: CameraState, frame: CameraFrame): CameraState => {
  if (!frame.pivot || (c.zoom === 1 && !c.look)) return c
  const d = Math.hypot(...sub(frame.pivot, frame.eye))
  if (d < 1e-9) return c
  return { zoom: Math.min(MAX_CAMERA_ZOOM, Math.max(MIN_CAMERA_ZOOM, frame.fitDistance / d)), look: frame.pivot }
}

/** The camera zoomed by `k` about a point on screen (projected units,
 * the looked-at point at 0,0), which stays where it is. */
export const zoomCameraAt = (c: CameraState, frame: CameraFrame, k: number, at: V2): CameraState => {
  const zoom = Math.min(MAX_CAMERA_ZOOM, Math.max(MIN_CAMERA_ZOOM, c.zoom * k))
  const shift = 1 / c.zoom - 1 / zoom
  return { zoom, look: add(frame.look, add(mul(frame.right, at[0] * shift), mul(frame.up, -at[1] * shift))) }
}

/** The camera slid so the scene moves by (dx, dy) on screen (projected
 * units). */
export const panCamera = (c: CameraState, frame: CameraFrame, dx: number, dy: number): CameraState => ({
  ...c,
  look: add(frame.look, add(mul(frame.right, -dx / c.zoom), mul(frame.up, dy / c.zoom))),
})
