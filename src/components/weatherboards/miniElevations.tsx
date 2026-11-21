"use client"

import type { HouseLayout } from "./housePlan"
import type { Wall } from "./types"
import { edgePoints } from "./weatherboardCalc"
import styles from "./weatherboardEditor.module.scss"

type P = { x: number; y: number }

/** An elevation's walls together, small, as they'd be seen from afar,
 * standing back from that face of the house: each where it is on plan
 * left to right, the ones set back behind the ones in front, their tops
 * and bottoms and windows as they are — tap one to focus it. Walls not
 * yet placed on plan go side by side, in order. */
const MiniElevations: React.FC<{
  walls: Wall[]
  layout: HouseLayout
  codes: Map<string, string>
  /** the wall in focus (null: the whole elevation) */
  activeWallId: string | null
  onSelectWall: (wallId: string) => void
}> = ({ walls, layout, codes, activeWallId, onSelectWall }) => {
  if (walls.length < 2) return null
  const ids = new Set(walls.map((w) => w.id))
  const sides = layout.sides.filter((s) => s.wallId && ids.has(s.wallId))
  const placed = walls.every((w) => sides.some((s) => s.wallId === w.id))

  // which way the face looks (out from the house: the sides' right, a → b), and so the viewer's right
  let nx = 0
  let ny = 0
  for (const s of sides) {
    nx += s.b.y - s.a.y
    ny += -(s.b.x - s.a.x)
  }
  const nl = Math.hypot(nx, ny) || 1
  const n = { x: nx / nl, y: ny / nl }
  // (looking at it: facing −n; right of that, on a y-north plan, is (−n.y, n.x))
  const right = { x: -n.y, y: n.x }
  const across = (p: P) => p.x * right.x + p.y * right.y
  const depth = (p: P) => p.x * n.x + p.y * n.y

  /** each wall's pieces: x along the elevation (u) for a stretch of the wall (x0 to x1 along it) */
  const pieces: { wall: Wall; u: (x: number) => number; x0: number; x1: number; depth: number }[] = []
  if (placed) {
    for (const s of sides) {
      const w = walls.find((x) => x.id === s.wallId)!
      const ua = across(s.a)
      const ub = across(s.b)
      const span = s.x1 - s.x0 || 1
      pieces.push({ wall: w, u: (x) => ua + ((ub - ua) * (x - s.x0)) / span, x0: s.x0, x1: s.x1, depth: depth({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }) })
    }
  } else {
    let at = 0
    for (const w of walls) {
      const start = at
      pieces.push({ wall: w, u: (x) => start + x, x0: 0, x1: w.lengthMm, depth: 0 })
      at += w.lengthMm + 400
    }
  }
  // back to front
  pieces.sort((a, b) => a.depth - b.depth)

  /** a wall's edge between x0 and x1, as (u, z) */
  const edge = (w: Wall, which: "top" | "bottom", x0: number, x1: number, u: (x: number) => number) => {
    const pts = edgePoints(w[which], w.lengthMm)
    const zAt = (x: number) => {
      for (let i = 1; i < pts.length; i++) if (x <= pts[i].x) return pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * (x - pts[i - 1].x)) / (pts[i].x - pts[i - 1].x || 1)
      return pts[pts.length - 1].y
    }
    return [x0, ...pts.map((p) => p.x).filter((x) => x > x0 && x < x1), x1].map((x) => ({ u: u(x), z: zAt(x) }))
  }
  const polys = pieces.map((p) => {
    const top = edge(p.wall, "top", p.x0, p.x1, p.u)
    const bottom = edge(p.wall, "bottom", p.x0, p.x1, p.u).reverse()
    const openings = p.wall.openings
      .filter((o) => o.x + o.width > p.x0 && o.x < p.x1)
      .map((o) => {
        const a = p.u(Math.max(p.x0, o.x))
        const b = p.u(Math.min(p.x1, o.x + o.width))
        return { u0: Math.min(a, b), u1: Math.max(a, b), z0: o.sill, z1: o.sill + Math.max(o.height, o.heightRight ?? o.height) }
      })
    return { ...p, pts: [...top, ...bottom], openings }
  })
  const all = polys.flatMap((p) => p.pts)
  const u0 = Math.min(...all.map((p) => p.u))
  const u1 = Math.max(...all.map((p) => p.u))
  const z0 = Math.min(...all.map((p) => p.z))
  const z1 = Math.max(...all.map((p) => p.z))
  const w = Math.max(u1 - u0, 1000)
  const h = Math.max(z1 - z0, 1000)
  const pad = Math.max(w, h) * 0.06
  const sw = Math.max(w, h) / 200
  const y = (z: number) => -z

  return (
    <svg className={styles.miniElevations} viewBox={`${u0 - pad} ${y(z1) - pad} ${w + pad * 2} ${h + pad * 2 + sw * 9}`} role="group" aria-label="This elevation's walls, seen from afar — tap one to focus it">
      {/* the ground */}
      <line x1={u0 - pad} y1={y(z0)} x2={u1 + pad} y2={y(z0)} className={styles.miniGround} strokeWidth={sw * 0.6} />
      {polys.map((p, i) => {
        const on = activeWallId ? p.wall.id === activeWallId : true
        const mu = (Math.min(...p.pts.map((q) => q.u)) + Math.max(...p.pts.map((q) => q.u))) / 2
        return (
          <g
            key={i}
            role="button"
            aria-label={`${codes.get(p.wall.id) ?? ""} ${p.wall.name} — tap to focus it`}
            aria-pressed={p.wall.id === activeWallId}
            style={{ cursor: "pointer" }}
            onClick={() => onSelectWall(p.wall.id)}
          >
            <polygon points={p.pts.map((q) => `${q.u},${y(q.z)}`).join(" ")} className={on && activeWallId ? styles.miniWallOn : styles.miniWall} strokeWidth={sw * (on && activeWallId ? 1.4 : 0.7)} />
            {p.openings.map((o, k) => (
              <rect key={k} x={o.u0} y={y(o.z1)} width={o.u1 - o.u0} height={o.z1 - o.z0} className={styles.miniOpening} strokeWidth={sw * 0.5} pointerEvents="none" />
            ))}
            <text x={mu} y={y(z0) + sw * 6.5} fontSize={sw * 6} textAnchor="middle" className={p.wall.id === activeWallId ? styles.minimapLabelOn : styles.minimapLabel} pointerEvents="none">
              {codes.get(p.wall.id) ?? ""}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default MiniElevations
