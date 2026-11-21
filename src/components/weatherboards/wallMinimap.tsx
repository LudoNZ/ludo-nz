"use client"

import type { HouseLayout } from "./housePlan"
import styles from "./weatherboardEditor.module.scss"

/** The whole floor plan, small, beside a wall's elevation — each storey's,
 * one over the other (the ones above tinted, lined up as built): the wall in
 * focus picked out (with an eye outside it, where the elevation's seen
 * from), the rest of its elevation's walls a shade darker, every wall
 * labelled with its code — tap one to open it. World mm, y north. */
const WallMinimap: React.FC<{
  /** the ground floor's layout first, then each storey above */
  layouts: { name: string; layout: HouseLayout }[]
  codes: Map<string, string>
  /** the wall in focus (null: the whole elevation, "View all") */
  activeWallId: string | null
  /** the open elevation's walls */
  elevationWallIds: Set<string>
  onSelectWall: (wallId: string) => void
}> = ({ layouts, codes, activeWallId, elevationWallIds, onSelectWall }) => {
  const allSides = layouts.flatMap((l) => l.layout.sides)
  if (!allSides.some((s) => s.wallId)) return null
  const pts = allSides.flatMap((s) => [s.a, s.b])
  const x0 = Math.min(...pts.map((p) => p.x))
  const x1 = Math.max(...pts.map((p) => p.x))
  const y0 = Math.min(...pts.map((p) => -p.y))
  const y1 = Math.max(...pts.map((p) => -p.y))
  const span = Math.max(x1 - x0, y1 - y0, 1000)
  const pad = span * 0.22
  const sw = span / 120
  const focus = (id: string | null) => (activeWallId ? id === activeWallId : !!id && elevationWallIds.has(id))
  // the eye: outside the wall in focus (outside is to the right of a → b), looking at it
  const eyes = allSides
    .filter((s) => s.wallId && focus(s.wallId))
    .map((s) => {
      const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) || 1
      const n = { x: (s.b.y - s.a.y) / len, y: -(s.b.x - s.a.x) / len }
      const m = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }
      return { at: { x: m.x + n.x * pad * 0.6, y: -(m.y + n.y * pad * 0.6) }, to: { x: m.x + n.x * pad * 0.15, y: -(m.y + n.y * pad * 0.15) } }
    })
  const name = activeWallId ? `wall ${codes.get(activeWallId) ?? ""}` : "this elevation's walls"
  return (
    <svg
      className={styles.minimap}
      viewBox={`${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`}
      role="img"
      aria-label={`The floor plan, with ${name} picked out`}
    >
      {layouts.map(({ name, layout }, li) => (
        <g key={name}>
          {/* each floor, faint (the ones above tinted, over the one below) */}
          {layout.closed && <polygon points={layout.sides.map((s) => `${s.a.x},${-s.a.y}`).join(" ")} className={li ? styles.minimapUpper : styles.minimapFloor} strokeWidth={sw * 0.6} />}
          {layout.sides.map((s, i) => {
        const on = focus(s.wallId)
        const mine = !!s.wallId && elevationWallIds.has(s.wallId)
        const cls = !s.wallId ? styles.minimapPlain : on ? styles.minimapFocus : mine ? styles.minimapElevation : styles.minimapWall
        const mx = (s.a.x + s.b.x) / 2
        const my = -(s.a.y + s.b.y) / 2
        const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) || 1
        // the code just inside the wall
        // (each storey's a step further in, so walls one over the other don't share a spot)
        const inset = sw * (8 + li * 10)
        const ix = (-(s.b.y - s.a.y) / len) * inset
        const iy = (-(s.b.x - s.a.x) / len) * inset
        return (
          <g key={`${li}-${i}`}>
            <line
              x1={s.a.x}
              y1={-s.a.y}
              x2={s.b.x}
              y2={-s.b.y}
              className={cls}
              strokeWidth={sw * (on ? 2.6 : s.wallId ? 1.4 : 0.8)}
              strokeDasharray={s.wallId ? undefined : `${sw * 2} ${sw * 2}`}
              strokeLinecap="round"
            />
            {s.wallId && (
              <>
                <text x={mx + ix} y={my + iy} fontSize={sw * (on ? 10 : 8.5)} textAnchor="middle" dominantBaseline="middle" className={on ? styles.minimapLabelOn : styles.minimapLabel}>
                  {codes.get(s.wallId) ?? "?"}
                </text>
                {!on && (
                  <line
                    x1={s.a.x}
                    y1={-s.a.y}
                    x2={s.b.x}
                    y2={-s.b.y}
                    stroke="transparent"
                    strokeWidth={sw * 7}
                    style={{ cursor: "pointer" }}
                    role="button"
                    aria-label={`Open wall ${codes.get(s.wallId) ?? ""}`}
                    onClick={() => onSelectWall(s.wallId!)}
                  />
                )}
              </>
            )}
          </g>
        )
      })}
        </g>
      ))}
      {/* which tint is which storey */}
      {layouts.length > 1 &&
        layouts.slice(1).map((l, i) => (
          <g key={`k${l.name}`} pointerEvents="none">
            <rect x={x0 - pad * 0.85} y={y1 + pad * 0.25 - i * sw * 7} width={sw * 6} height={sw * 4} className={styles.minimapUpper} strokeWidth={sw * 0.5} />
            <text x={x0 - pad * 0.85 + sw * 8} y={y1 + pad * 0.25 - i * sw * 7 + sw * 3.5} fontSize={sw * 5} className={styles.minimapLabel}>
              {l.name}
            </text>
          </g>
        ))}
      {eyes.map((e, i) => {
        const dx = e.to.x - e.at.x
        const dy = e.to.y - e.at.y
        const L = Math.hypot(dx, dy) || 1
        const u = { x: dx / L, y: dy / L }
        const h = sw * 3
        return (
          <g key={`eye${i}`} className={styles.minimapEye} pointerEvents="none">
            <line x1={e.at.x} y1={e.at.y} x2={e.to.x} y2={e.to.y} strokeWidth={sw * 0.9} />
            <path d={`M${e.to.x - u.x * h - u.y * h * 0.7},${e.to.y - u.y * h + u.x * h * 0.7}L${e.to.x},${e.to.y}L${e.to.x - u.x * h + u.y * h * 0.7},${e.to.y - u.y * h - u.x * h * 0.7}`} strokeWidth={sw * 0.9} fill="none" />
            <circle cx={e.at.x} cy={e.at.y} r={sw * 1.6} />
          </g>
        )
      })}
    </svg>
  )
}

export default WallMinimap
