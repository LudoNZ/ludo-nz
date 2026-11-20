"use client"

import { useEffect, useRef, useState } from "react"
import Button from "@/components/button/button"
import { PlanPoint, sideNormal, totalLength } from "@/components/retainingWall/wallPlan"
import { newBlankWall, WallProject } from "@/components/retainingWall/wallProject"
import { StoredWallProject, subscribeToProjects } from "@/components/retainingWall/wallProjectStore"
import { newSiteStair, SiteStair, SiteWall, StairPlacement, toSite } from "@/components/site/siteProject"
import { StoredStairProject, subscribeToStairProjects } from "@/components/stairs/stairProjectStore"
import { UnitField } from "../retaining-walls/obstructionsCard"
import { STAIR_COLOR } from "./stairsCard"
import styles from "./siteView.module.scss"

const WALL_COLOR = "#7a5a3a"
const PICKED_COLOR = "#1e6b3a"
/** a dragged wall's end snaps to another wall's end within this */
const SNAP_M = 0.25
/** without a snap, a dragged wall moves in steps of this */
const STEP_M = 0.05

const round = (v: number, step: number) => Math.round(v / step) * step

/** every wall's points on the site */
const sitePoints = (w: SiteWall) => w.wall.planPoints.map(toSite(w))

/** The site from above: every wall where it's been put (retained side
 * shaded), and the stairs coming off them. Drag a wall to move it — its
 * ends snap to the other walls' ends — tap one to pick it. */
export const SitePlan: React.FC<{
  walls: SiteWall[]
  placements: { wall: SiteWall; placement: StairPlacement }[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** live while dragging; `done` once it's let go */
  onMove: (id: string, xM: number, yM: number, done: boolean) => void
  onOpen: (id: string) => void
}> = ({ walls, placements, selectedId, onSelect, onMove, onOpen }) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ id: string; start: PlanPoint; from: { xM: number; yM: number }; at: { xM: number; yM: number } | null } | null>(null)
  // the view is fitted to what's there when a drag starts, and held while it
  // goes on (a moving view under the pointer would fight the drag)
  const [heldView, setHeldView] = useState<string | null>(null)

  const all = [...walls.flatMap(sitePoints), ...placements.flatMap(({ wall, placement }) => placement.treads.flat().map(toSite(wall)))]
  const xs = all.map((p) => p.xM)
  const ys = all.map((p) => p.yM)
  const pad = 2
  const minX = (xs.length ? Math.min(...xs) : 0) - pad
  const minY = (ys.length ? Math.min(...ys) : 0) - pad
  const rawW = Math.max(8, (xs.length ? Math.max(...xs) : 0) + pad - minX)
  const h = Math.max(5, (ys.length ? Math.max(...ys) : 0) + pad - minY)
  // never narrower than 16:10, so the plan fills the width of the page
  const w = Math.max(rawW, h * 1.6)
  const fitted = `${minX - (w - rawW) / 2} ${minY} ${w} ${h}`
  const viewBox = heldView ?? fitted
  const [, , vw] = viewBox.split(" ").map(Number)
  const stroke = vw / 160
  const font = vw / 55

  const toPlan = (e: { clientX: number; clientY: number }): PlanPoint | null => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { xM: pt.x, yM: pt.y }
  }

  // where a dragged wall goes: snapped end to end with another wall if
  // one's close, else on the step
  const placeAt = (id: string, xM: number, yM: number) => {
    const wall = walls.find((x) => x.id === id)
    if (!wall) return { xM, yM }
    const moved = { ...wall, xM, yM }
    const pts = sitePoints(moved)
    const ends = [pts[0], pts[pts.length - 1]]
    let best: { dx: number; dy: number; d: number } | null = null
    for (const other of walls) {
      if (other.id === id) continue
      const op = sitePoints(other)
      for (const a of ends)
        for (const b of [op[0], op[op.length - 1]]) {
          const d = Math.hypot(b.xM - a.xM, b.yM - a.yM)
          if (d < SNAP_M && (!best || d < best.d)) best = { dx: b.xM - a.xM, dy: b.yM - a.yM, d }
        }
    }
    return best ? { xM: xM + best.dx, yM: yM + best.dy } : { xM: round(xM, STEP_M), yM: round(yM, STEP_M) }
  }

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current
      const p = d && toPlan(e)
      if (!d || !p) return
      const dx = p.xM - d.start.xM
      const dy = p.yM - d.start.yM
      if (!d.at && Math.hypot(dx, dy) < stroke * 2) return
      d.at = placeAt(d.id, d.from.xM + dx, d.from.yM + dy)
      onMove(d.id, d.at.xM, d.at.yM, false)
    }
    const up = () => {
      const d = drag.current
      drag.current = null
      setHeldView(null)
      if (d?.at) onMove(d.id, d.at.xM, d.at.yM, true)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
    }
  })

  // 1 m grid lines across the view
  const [gx, gy, gw, gh] = viewBox.split(" ").map(Number)
  const grid: { x1: number; y1: number; x2: number; y2: number }[] = []
  for (let x = Math.ceil(gx); x <= gx + gw; x++) grid.push({ x1: x, y1: gy, x2: x, y2: gy + gh })
  for (let y = Math.ceil(gy); y <= gy + gh; y++) grid.push({ x1: gx, y1: y, x2: gx + gw, y2: y })

  return (
    <div className={styles.planWrap}>
      <svg ref={svgRef} viewBox={viewBox} className={styles.plan} role="img" aria-label="Site plan" onPointerDown={(e) => e.target === e.currentTarget && onSelect(null)}>
        <g stroke="currentColor" strokeOpacity={0.08} strokeWidth={stroke * 0.3} pointerEvents="none">
          {grid.map((l, i) => (
            <line key={i} {...l} />
          ))}
        </g>
        {walls.map((wall) => {
          const pts = sitePoints(wall)
          const picked = wall.id === selectedId
          const color = picked ? PICKED_COLOR : WALL_COLOR
          // the retained side, shaded along each run
          const shade = pts.slice(1).map((b, i) => {
            const a = pts[i]
            const n = sideNormal(a, b, wall.wall.retainedSide)
            const o = 0.35
            return `${a.xM},${a.yM} ${b.xM},${b.yM} ${b.xM + n.xM * o},${b.yM + n.yM * o} ${a.xM + n.xM * o},${a.yM + n.yM * o}`
          })
          // label at the middle of the longest run
          let li = 0
          pts.slice(1).forEach((b, i) => {
            const l = Math.hypot(b.xM - pts[i].xM, b.yM - pts[i].yM)
            const best = Math.hypot(pts[li + 1].xM - pts[li].xM, pts[li + 1].yM - pts[li].yM)
            if (l > best) li = i
          })
          const mid = pts.length > 1 ? { xM: (pts[li].xM + pts[li + 1].xM) / 2, yM: (pts[li].yM + pts[li + 1].yM) / 2 } : pts[0]
          const n = pts.length > 1 ? sideNormal(pts[li], pts[li + 1], wall.wall.retainedSide) : { xM: 0, yM: -1 }
          return (
            <g
              key={wall.id}
              className={styles.wall}
              onPointerDown={(e) => {
                const p = toPlan(e)
                if (!p) return
                e.preventDefault()
                onSelect(wall.id)
                setHeldView(fitted)
                drag.current = { id: wall.id, start: p, from: { xM: wall.xM, yM: wall.yM }, at: null }
              }}
              onDoubleClick={() => onOpen(wall.id)}
            >
              {shade.map((poly, i) => (
                <polygon key={i} points={poly} fill={color} fillOpacity={picked ? 0.28 : 0.16} />
              ))}
              <polyline
                points={pts.map((p) => `${p.xM},${p.yM}`).join(" ")}
                fill="none"
                stroke={color}
                strokeWidth={stroke * (picked ? 1.6 : 1.2)}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* a wide invisible line, easier to grab */}
              <polyline points={pts.map((p) => `${p.xM},${p.yM}`).join(" ")} fill="none" stroke="transparent" strokeWidth={stroke * 8} />
              <circle cx={pts[0].xM} cy={pts[0].yM} r={stroke * 1.3} fill={color} />
              <text
                x={mid.xM + n.xM * (0.35 + font * 0.9)}
                y={mid.yM + n.yM * (0.35 + font * 0.9)}
                fontSize={font}
                textAnchor={n.xM > 0.5 ? "start" : n.xM < -0.5 ? "end" : "middle"}
                dominantBaseline="middle"
                fill={color}
                fontWeight={600}
                pointerEvents="none"
              >
                {wall.name}
              </text>
            </g>
          )
        })}
        {placements.map(({ wall, placement }) => {
          const t = toSite(wall)
          return (
            <g key={placement.stair.id} pointerEvents="none">
              {placement.treads.map((poly, i) => (
                <polygon
                  key={i}
                  points={poly.map((q) => t(q)).map((q) => `${q.xM},${q.yM}`).join(" ")}
                  fill={STAIR_COLOR}
                  fillOpacity={0.22}
                  stroke={STAIR_COLOR}
                  strokeWidth={stroke * 0.35}
                  strokeLinejoin="round"
                />
              ))}
            </g>
          )
        })}
        {/* 1 m scale */}
        <g transform={`translate(${gx + gw * 0.03} ${gy + gh - gh * 0.05})`} pointerEvents="none">
          <line x1={0} y1={0} x2={1} y2={0} stroke="currentColor" strokeWidth={stroke * 0.6} />
          <text x={1 + font * 0.4} y={0} fontSize={font * 0.8} dominantBaseline="middle" fill="currentColor" opacity={0.7}>
            1 m
          </text>
        </g>
      </svg>
      {walls.length === 0 && <p className={styles.empty}>No walls yet — import one of your retaining walls below, or add a blank one.</p>}
    </div>
  )
}

/** The walls on the site: import one of your retaining wall projects (a
 * copy) or start a blank one, then name it, place it (or drag it on the
 * plan) and open it in the retaining wall calculator. */
export const WallsCard: React.FC<{
  walls: SiteWall[]
  stairs: SiteStair[]
  uid: string | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  onChange: (walls: SiteWall[]) => void
  onAdd: (wall: WallProject, name: string, source: string) => void
  /** a stair copied in from a stair project, on one of the site's walls */
  onAddStair: (stair: SiteStair) => void
  onRemove: (id: string) => void
  onOpen: (id: string) => void
}> = ({ walls, stairs, uid, selectedId, onSelect, onChange, onAdd, onAddStair, onRemove, onOpen }) => {
  const [kind, setKind] = useState<"wall" | "stair">("wall")
  const [projects, setProjects] = useState<{ public: StoredWallProject[]; private: StoredWallProject[] }>({ public: [], private: [] })
  const [stairProjects, setStairProjects] = useState<{ public: StoredStairProject[]; private: StoredStairProject[] }>({ public: [], private: [] })
  const [pick, setPick] = useState("")
  const [stairPick, setStairPick] = useState("")
  const [stairWall, setStairWall] = useState("")
  useEffect(() => subscribeToProjects({ kind: "public" }, (data) => setProjects((p) => ({ ...p, public: data }))), [])
  useEffect(() => subscribeToStairProjects({ kind: "public" }, (data) => setStairProjects((p) => ({ ...p, public: data }))), [])
  useEffect(() => {
    if (!uid) {
      setProjects((p) => ({ ...p, private: [] }))
      setStairProjects((p) => ({ ...p, private: [] }))
      return
    }
    const offWalls = subscribeToProjects({ kind: "private", uid }, (data) => setProjects((p) => ({ ...p, private: data })))
    const offStairs = subscribeToStairProjects({ kind: "private", uid }, (data) => setStairProjects((p) => ({ ...p, private: data })))
    return () => {
      offWalls()
      offStairs()
    }
  }, [uid])

  const update = (id: string, patch: Partial<SiteWall>) => onChange(walls.map((w) => (w.id === id ? { ...w, ...patch } : w)))
  const chosen = [...projects.private, ...projects.public].find((w) => `${w.location.kind}:${w.id}` === pick)
  const chosenStair = [...stairProjects.private, ...stairProjects.public].find((s) => `${s.location.kind}:${s.id}` === stairPick)
  // the wall an imported stair comes off: the one picked here, else the
  // one picked on the plan, else the first
  const stairOn = walls.find((w) => w.id === stairWall) ?? walls.find((w) => w.id === selectedId) ?? walls[0] ?? null

  const importStair = () => {
    if (!chosenStair || !stairOn) return
    const pts = stairOn.wall.planPoints
    const firstRunM = pts.length > 1 ? Math.hypot(pts[1].xM - pts[0].xM, pts[1].yM - pts[0].yM) : 1
    const s = newSiteStair(stairOn.id, 0, firstRunM)
    onAddStair({ ...s, label: chosenStair.name, input: { ...chosenStair.stair } })
    onSelect(stairOn.id)
    setStairPick("")
  }

  return (
    <section className={styles.card}>
      <h2>Retaining walls</h2>
      <div className={styles.kindSwitch} role="group" aria-label="What to import">
        <span>Import</span>
        <button type="button" className={kind === "wall" ? styles.kindOn : styles.kind} aria-pressed={kind === "wall"} onClick={() => setKind("wall")}>
          A wall
        </button>
        <button type="button" className={kind === "stair" ? styles.kindOn : styles.kind} aria-pressed={kind === "stair"} onClick={() => setKind("stair")}>
          A stair
        </button>
      </div>
      {kind === "stair" ? (
        <>
          <div className={styles.addRow}>
            <select value={stairPick} onChange={(e) => setStairPick(e.target.value)} aria-label="Stair project to import">
              <option value="">Pick a stair project to import…</option>
              {stairProjects.private.length > 0 && (
                <optgroup label="Your stair projects">
                  {stairProjects.private.map((s) => (
                    <option key={s.id} value={`private:${s.id}`}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {stairProjects.public.length > 0 && (
                <optgroup label="Public stair projects">
                  {stairProjects.public.map((s) => (
                    <option key={s.id} value={`public:${s.id}`}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {walls.length > 1 && (
              <select value={stairOn?.id ?? ""} onChange={(e) => setStairWall(e.target.value)} aria-label="Wall the stair comes off">
                {walls.map((w) => (
                  <option key={w.id} value={w.id}>
                    Off {w.name}
                  </option>
                ))}
              </select>
            )}
            <Button size="small" disabled={!chosenStair || !stairOn} onClick={importStair}>
              Import
            </Button>
          </div>
          <p className={styles.hint}>
            {walls.length === 0
              ? "A stair comes down off a wall — import or add a wall first."
              : `An imported stair is a copy, placed halfway along the first run of ${stairOn?.name ?? "the wall"}. Its rise comes from the wall there; move or change it in Edit wall & stairs.`}
          </p>
        </>
      ) : (
        <>
          <div className={styles.addRow}>
            <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Wall project to import">
              <option value="">Pick a wall project to import…</option>
              {projects.private.length > 0 && (
                <optgroup label="Your wall projects">
                  {projects.private.map((w) => (
                    <option key={w.id} value={`private:${w.id}`}>
                      {w.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {projects.public.length > 0 && (
                <optgroup label="Public wall projects">
                  {projects.public.map((w) => (
                    <option key={w.id} value={`public:${w.id}`}>
                      {w.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <Button
              size="small"
              disabled={!chosen}
              onClick={() => {
                if (!chosen) return
                onAdd(chosen.wall, chosen.name, `Copied from the wall project "${chosen.name}"`)
                setPick("")
              }}
            >
              Import
            </Button>
            <Button size="small" variant="secondary" onClick={() => onAdd(newBlankWall(), `Wall ${walls.length + 1}`, "")}>
              Add a blank wall
            </Button>
          </div>
          <p className={styles.hint}>
            An imported wall is a copy: changes here don&apos;t change the wall project it came from. Drag a wall on the plan to
            move it — its ends snap to other walls&apos; ends — or set where its first post goes and how far it&apos;s turned.
          </p>
        </>
      )}

      {walls.map((w) => {
        const picked = w.id === selectedId
        const count = stairs.filter((s) => s.wallId === w.id).length
        const key = (f: string) => `sw-${w.id}-${f}`
        return (
          <div key={w.id} className={picked ? styles.itemPicked : styles.item} onClick={() => !picked && onSelect(w.id)}>
            <div className={styles.itemHead}>
              <strong>{w.name}</strong>
              <span className={styles.meta}>
                {totalLength(w.wall.planPoints).toFixed(2)} m · {w.wall.retainedHeightM.toFixed(2)} m high · {count} stair{count === 1 ? "" : "s"}
              </span>
              <span className={styles.itemActions}>
                <Button size="small" onClick={() => onOpen(w.id)}>
                  Edit wall{count ? " & stairs" : ""}
                </Button>
                <button
                  type="button"
                  className={styles.link}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (window.confirm(`Remove ${w.name}${count ? ` and its ${count} stair${count === 1 ? "" : "s"}` : ""} from the site?`)) onRemove(w.id)
                  }}
                >
                  Remove
                </button>
              </span>
            </div>
            {w.source && <p className={styles.meta}>{w.source}</p>}
            {picked && (
              <div className={styles.fields}>
                <div className={styles.field}>
                  <label htmlFor={key("name")}>Name</label>
                  <input
                    id={key("name")}
                    key={`${key("name")}-${w.name}`}
                    defaultValue={w.name}
                    maxLength={60}
                    onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== w.name && update(w.id, { name: e.target.value.trim() })}
                  />
                </div>
                <UnitField id={key("x")} label="First post — across (m)" value={w.xM} scale={1} step={0.05} onCommit={(v) => v !== null && update(w.id, { xM: v })} />
                <UnitField id={key("y")} label="First post — down (m)" value={w.yM} scale={1} step={0.05} onCommit={(v) => v !== null && update(w.id, { yM: v })} />
                <div className={styles.field}>
                  <label htmlFor={key("rot")}>Turned (° clockwise)</label>
                  <div className={styles.rotate}>
                    <button type="button" onClick={() => update(w.id, { rotationDeg: (((w.rotationDeg - 15) % 360) + 360) % 360 })} aria-label="Turn 15° anticlockwise">
                      ↺
                    </button>
                    <input
                      id={key("rot")}
                      key={`${key("rot")}-${w.rotationDeg}`}
                      type="number"
                      step={1}
                      defaultValue={Math.round(w.rotationDeg * 10) / 10}
                      onBlur={(e) => {
                        const v = Number(e.target.value)
                        if (e.target.value !== "" && Number.isFinite(v)) update(w.id, { rotationDeg: ((v % 360) + 360) % 360 })
                      }}
                    />
                    <button type="button" onClick={() => update(w.id, { rotationDeg: (w.rotationDeg + 15) % 360 })} aria-label="Turn 15° clockwise">
                      ↻
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
