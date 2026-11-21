"use client"

import { useRef, useState } from "react"
import { FloorGraph, simplify } from "./floorPlan"
import { GridLine, gridLines, gridOrigin, gridPointAt, GridPoint, nearestLine, ProjectGrid, RulerShow } from "./grid"
import { Pt, ROOM_KIND_COLOURS, RoomBox } from "./houseTypes"
import type { Structure } from "./structure"
import styles from "./house.module.scss"

export type Selection =
  | { kind: "wall"; id: string }
  | { kind: "room"; index: number }
  | { kind: "box"; id: string }
  /** a side of the outline (outline tool) */
  | { kind: "edge"; index: number }
  | { kind: "gridline"; key: string; axis: "x" | "y" }
  /** a measurement drawn on the grid */
  | { kind: "dim"; id: string }
  /** a section of the roof, by its key (see HouseSettings.roofSections) */
  | { kind: "section"; key: string }
  /** a ruler: the one down the left (y) or along the top (x), or a row typed in (id) */
  | { kind: "ruler"; axis: "x" | "y"; id?: string }
  | null

/** what the plan can do here: pick things, draw inside walls, shape the
 * outline, measure between grid points, or make a grid point 0,0 */
export type CanvasTool = "select" | "draw" | "outline" | "measure" | "origin"

const GRID = 100
const m2 = (a: number) => `${a.toFixed(1)} m²`

/** The ground floor plan, to scale: rooms coloured by kind and named,
 * outside and inside walls (load-bearing ones in red, once the structure's
 * been worked out), and — depending on the step — drawing inside walls,
 * moving room boxes, or picking a wall or room. mm, y down. */
const PlanCanvas: React.FC<{
  graph: FloorGraph
  /** the storey below's outline, faint, to line up with (and snap to) */
  ghost?: Pt[]
  /** rooms mode: the boxes, to drag about */
  boxes?: RoomBox[]
  structure?: Structure | null
  tool?: CanvasTool
  selection: Selection
  onSelect: (s: Selection) => void
  /** outline mode: a wall drawn */
  onDrawWall?: (a: Pt, b: Pt) => void
  /** rooms mode: a box moved */
  onMoveBox?: (id: string, x: number, y: number) => void
  /** rooms mode: a box resized by a corner */
  onResizeBox?: (id: string, rect: { x: number; y: number; w: number; h: number }) => void
  /** the setting-out grid, drawn and snapped to */
  grid?: ProjectGrid
  /** outline tool: the outline reshaped (kept square, on the grid) */
  onOutlineChange?: (pts: Pt[]) => void
  /** a gridline dragged to a new place */
  onMoveGridline?: (line: GridLine, to: number) => void
  /** doors in the inside walls: each one's opening on plan, `picked` drawn out */
  doors?: { id: string; a: Pt; b: Pt; picked?: boolean }[]
  /** the outside walls can be picked too (as an edge of the outline) */
  pickOutside?: boolean
  /** measure tool: a measurement drawn between two grid points */
  onAddDim?: (a: GridPoint, b: GridPoint) => void
  /** origin tool: a grid point made 0,0 */
  onSetOrigin?: (p: GridPoint) => void
  /** select tool: an inside wall dragged across to a new line */
  onMoveWall?: (id: string, a: Pt, b: Pt) => void
  /** snap drawn and dragged walls to the gridlines and walls nearby (Shift held: never) */
  snapOn?: boolean
  /** the roof's sections can be picked, by their span arrows */
  pickSections?: boolean
  /** the rulers can be picked (id: a row typed in; null: a new row, from its +) */
  onRuler?: (axis: "x" | "y", id?: string | null) => void
  /** the outside walls' windows and doors on plan (tap one: onPickJoinery) */
  joinery?: { id: string; a: Pt; b: Pt; door: boolean }[]
  onPickJoinery?: (id: string) => void
  /** placing windows and doors: tapping a wall (outside or inside) places one there */
  placing?: boolean
  onPlace?: (hit: { kind: "edge"; index: number } | { kind: "wall"; id: string }, p: Pt) => void
}> = ({ graph, ghost, boxes, structure, tool = "select", selection, onSelect, onDrawWall, onMoveBox, onResizeBox, grid, onOutlineChange, onMoveGridline, doors, pickOutside, onAddDim, onSetOrigin, onMoveWall, snapOn = true, pickSections, joinery, onPickJoinery, placing, onPlace, onRuler }) => {
  const svgRef = useRef<SVGSVGElement>(null)
  // (state to draw them, refs so a quick pointer-up reads the latest)
  const [draft, setDraftState] = useState<{ a: Pt; b: Pt } | null>(null)
  const [drag, setDragState] = useState<{ id: string; dx: number; dy: number; x: number; y: number } | null>(null)
  // a corner being dragged: the box as it's being resized
  const [resize, setResizeState] = useState<{ id: string; fx: number; fy: number; x: number; y: number; w: number; h: number } | null>(null)
  const draftRef = useRef(draft)
  const dragRef = useRef(drag)
  const resizeRef = useRef(resize)
  const setResize = (r: typeof resize) => {
    resizeRef.current = r
    setResizeState(r)
  }
  const setDraft = (d: typeof draft) => {
    draftRef.current = d
    setDraftState(d)
  }
  const setDrag = (d: typeof drag) => {
    dragRef.current = d
    setDragState(d)
  }
  // a corner or side of the outline being dragged: where it started, and as it is
  const [odrag, setOdragState] = useState<{ kind: "corner" | "edge"; index: number; base: Pt[]; pts: Pt[]; moved: boolean } | null>(null)
  const odragRef = useRef(odrag)
  const setOdrag = (d: typeof odrag) => {
    odragRef.current = d
    setOdragState(d)
  }
  // a gridline being dragged
  const [gdrag, setGdragState] = useState<{ line: GridLine; at: number } | null>(null)
  // an inside wall being dragged across: which way it moves, from where, and where it is
  const [wdrag, setWdragState] = useState<{ id: string; axis: "x" | "y"; base: number; from: number; at: number } | null>(null)
  const wdragRef = useRef(wdrag)
  const setWdrag = (d: typeof wdrag) => {
    wdragRef.current = d
    setWdragState(d)
  }
  const gdragRef = useRef(gdrag)
  const setGdrag = (d: typeof gdrag) => {
    gdragRef.current = d
    setGdragState(d)
  }

  // a grid point being measured from, and the one under the pointer
  const [pending, setPending] = useState<GridPoint | null>(null)
  const [hover, setHover] = useState<GridPoint | null>(null)

  const pts = [...graph.outline, ...(ghost ?? []), ...(boxes ?? []).flatMap((b) => [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }])]
  if (!pts.length) pts.push({ x: 0, y: 0 }, { x: 10000, y: 8000 })
  const cx0 = Math.min(...pts.map((p) => p.x))
  const cx1 = Math.max(...pts.map((p) => p.x))
  const cy0 = Math.min(...pts.map((p) => p.y))
  const cy1 = Math.max(...pts.map((p) => p.y))
  // (more room left and top, for the grid's measurements)
  // (and more for each row of measurements typed in)
  const rows = Math.max(0, ...(["x", "y"] as const).map((a) => (grid?.chains ?? []).filter((c) => c.axis === a).length))
  const lead = grid ? 1500 + Math.max(cx1 - cx0, cy1 - cy0) * (0.15 + 0.06 * rows) : 1500
  const x0 = cx0 - lead
  const x1 = cx1 + 1500
  const y0 = cy0 - lead
  const y1 = cy1 + 1500
  const span = Math.max(x1 - x0, y1 - y0)
  const sw = span / 400
  const gl = grid ? gridLines(grid, x0 - 5000, x1 + 5000, y0 - 5000, y1 + 5000) : null
  const gxs = gl?.xs.map((l) => l.at) ?? []
  const gys = gl?.ys.map((l) => l.at) ?? []
  const origin = grid ? gridOrigin(grid) : { x: 0, y: 0 }
  /** mm, as a plan's written */
  const mm = (v: number) => `${Math.round(v)}`
  /** the gridline crossing nearest a point */
  const nearestPoint = (p: Pt): GridPoint | null => {
    if (!gl?.xs.length || !gl.ys.length) return null
    const near = (ls: GridLine[], v: number) => ls.reduce((b, l) => (Math.abs(l.at - v) < Math.abs(b.at - v) ? l : b), ls[0])
    return { x: near(gl.xs, p.x).key, y: near(gl.ys, p.y).key }
  }
  const pointing = (tool === "measure" && !!onAddDim) || (tool === "origin" && !!onSetOrigin)

  /** a pointer on the plan, in mm */
  const toPlan = (e: React.PointerEvent): Pt => {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse())
    return { x: p.x, y: p.y }
  }
  /** how many mm a few screen pixels is, for snapping */
  const pxMm = (px: number) => {
    const r = svgRef.current?.getBoundingClientRect()
    return r ? (px * (x1 - x0)) / r.width : px * 20
  }
  // snap to the walls' lines nearby, else the grid
  const lines = {
    xs: [...graph.outline.map((p) => p.x), ...graph.walls.flatMap((w) => [w.a.x, w.b.x]), ...(ghost ?? []).map((p) => p.x)],
    ys: [...graph.outline.map((p) => p.y), ...graph.walls.flatMap((w) => [w.a.y, w.b.y]), ...(ghost ?? []).map((p) => p.y)],
  }
  // (snapping off, or Shift held: to the nearest 10 mm only)
  const free = (e: React.PointerEvent) => !snapOn || e.shiftKey
  const snap = (v: number, to: number[], loose = false) => {
    if (loose) return Math.round(v / 10) * 10
    const tol = pxMm(10)
    const near = to.reduce<number | null>((b, x) => (Math.abs(x - v) < tol && (b === null || Math.abs(x - v) < Math.abs(b - v)) ? x : b), null)
    return near ?? Math.round(v / GRID) * GRID
  }
  // (the walls nearby, and the gridlines)
  const snapPt = (p: Pt, loose = false): Pt => ({ x: snap(p.x, [...lines.xs, ...gxs], loose), y: snap(p.y, [...lines.ys, ...gys], loose) })
  /** square to the plan: whichever way it's gone furthest */
  const square = (a: Pt, b: Pt): Pt => (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y })

  const down = (e: React.PointerEvent) => {
    if (pointing && grid) {
      const g = nearestPoint(toPlan(e))
      if (!g) return
      if (tool === "origin") onSetOrigin?.(g)
      else if (!pending) setPending(g)
      else {
        if (g.x !== pending.x || g.y !== pending.y) onAddDim?.(pending, g)
        setPending(null)
      }
      return
    }
    if (tool !== "draw" || !onDrawWall) return
    const a = snapPt(toPlan(e), free(e))
    setDraft({ a, b: a })
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    if (pointing) {
      const g = nearestPoint(toPlan(e))
      if (g?.x !== hover?.x || g?.y !== hover?.y) setHover(g)
      return
    }
    const od = odragRef.current
    if (od) {
      // the corner (or side) goes to the gridlines nearest; the walls either
      // side of it go with it, so every corner stays square
      const p = toPlan(e)
      const sx = nearestLine(p.x, gxs.length ? gxs : [Math.round(p.x / GRID) * GRID])
      const sy = nearestLine(p.y, gys.length ? gys : [Math.round(p.y / GRID) * GRID])
      const base = od.base
      const n = base.length
      const k = od.index
      const plumb = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < Math.abs(a.y - b.y)
      const prev = (k - 1 + n) % n
      const next = (k + 1) % n
      let out: Pt[] = base.map((q) => ({ ...q }))
      if (od.kind === "corner") {
        out[k] = { x: sx, y: sy }
        if (plumb(base[prev], base[k])) out[prev].x = sx
        else out[prev].y = sy
        if (plumb(base[k], base[next])) out[next].x = sx
        else out[next].y = sy
      } else {
        // the side slides square to itself; where the wall either side runs
        // on the same way (a side split for a step), its end stays put and a
        // short return wall joins them — the step
        const along = plumb(base[k], base[next])
        const shift = (q: Pt): Pt => (along ? { x: sx, y: q.y } : { x: q.x, y: sy })
        const sameBefore = plumb(base[prev], base[k]) === along
        const sameAfter = plumb(base[next], base[(next + 1) % n]) === along
        out = []
        for (let i = 0; i < n; i++) {
          if (i === k) {
            if (sameBefore) out.push({ ...base[k] })
            out.push(shift(base[k]))
          } else if (i === next) {
            out.push(shift(base[next]))
            if (sameAfter) out.push({ ...base[next] })
          } else out.push({ ...base[i] })
        }
      }
      const moved = out.length !== base.length || out.some((q, i) => q.x !== base[i].x || q.y !== base[i].y)
      setOdrag({ ...od, pts: out, moved: od.moved || moved })
      return
    }
    const wd = wdragRef.current
    if (wd) {
      const v = wd.base + toPlan(e)[wd.axis] - wd.from
      // (to the other walls' lines and the gridlines, not its own)
      const own = graph.walls.find((w) => w.id === wd.id)
      const to = (wd.axis === "x" ? [...lines.xs, ...gxs] : [...lines.ys, ...gys]).filter((x) => !own || Math.abs(x - own.a[wd.axis]) >= 1)
      setWdrag({ ...wd, at: snap(v, to, free(e)) })
      return
    }
    const gd = gdragRef.current
    if (gd) {
      const p = toPlan(e)
      setGdrag({ ...gd, at: Math.round(p[gd.line.axis] / 10) * 10 })
      return
    }
    const draft = draftRef.current
    const drag = dragRef.current
    const resize = resizeRef.current
    if (resize && boxes) {
      // the corner snaps to another room's edge nearby, else the grid; the
      // opposite corner (fx, fy) stays put
      const p = toPlan(e)
      const others = boxes.filter((b) => b.id !== resize.id)
      const tol = pxMm(12)
      const fit = (v: number, edges: number[]) => {
        const near = edges.reduce<number | null>((b, x) => (Math.abs(x - v) < tol && (b === null || Math.abs(x - v) < Math.abs(b - v)) ? x : b), null)
        return near ?? Math.round(v / GRID) * GRID
      }
      const MIN = 600
      let cx = fit(p.x, [...others.flatMap((b) => [b.x, b.x + b.w]), ...(ghost ?? []).map((q) => q.x), ...gxs])
      let cy = fit(p.y, [...others.flatMap((b) => [b.y, b.y + b.h]), ...(ghost ?? []).map((q) => q.y), ...gys])
      // never smaller than a cupboard, nor turned inside out
      if (Math.abs(cx - resize.fx) < MIN) cx = resize.fx + (cx >= resize.fx ? MIN : -MIN)
      if (Math.abs(cy - resize.fy) < MIN) cy = resize.fy + (cy >= resize.fy ? MIN : -MIN)
      setResize({ ...resize, x: Math.min(cx, resize.fx), y: Math.min(cy, resize.fy), w: Math.abs(cx - resize.fx), h: Math.abs(cy - resize.fy) })
      return
    }
    if (draft) {
      const b = square(draft.a, snapPt(toPlan(e), free(e)))
      setDraft({ a: draft.a, b })
    } else if (drag && boxes && onMoveBox) {
      const p = toPlan(e)
      const box = boxes.find((b) => b.id === drag.id)!
      // snap an edge to another room's edge, else the grid
      const others = boxes.filter((b) => b.id !== drag.id)
      const ex = [...others.flatMap((b) => [b.x, b.x + b.w]), ...(ghost ?? []).map((q) => q.x), ...gxs]
      const ey = [...others.flatMap((b) => [b.y, b.y + b.h]), ...(ghost ?? []).map((q) => q.y), ...gys]
      const tol = pxMm(12)
      const fit = (v: number, size: number, edges: number[]) => {
        let best: number | null = null
        for (const e of edges)
          for (const cand of [e, e - size]) if (Math.abs(cand - v) < tol && (best === null || Math.abs(cand - v) < Math.abs(best - v))) best = cand
        return best ?? Math.round(v / GRID) * GRID
      }
      setDrag({ ...drag, x: fit(p.x - drag.dx, box.w, ex), y: fit(p.y - drag.dy, box.h, ey) })
    }
  }
  const up = () => {
    const od = odragRef.current
    if (od) {
      if (od.moved) {
        onOutlineChange?.(simplify(od.pts))
        // (the corners may have changed under a picked side)
        onSelect(null)
      } else if (od.kind === "edge") onSelect({ kind: "edge", index: od.index })
      setOdrag(null)
    }
    const wd = wdragRef.current
    if (wd) {
      const w = graph.walls.find((x) => x.id === wd.id)
      if (w && Math.abs(wd.at - wd.base) >= 1) onMoveWall?.(w.id, { ...w.a, [wd.axis]: wd.at }, { ...w.b, [wd.axis]: wd.at })
      setWdrag(null)
    }
    const gd = gdragRef.current
    if (gd) {
      if (Math.abs(gd.at - gd.line.at) >= 1) onMoveGridline?.(gd.line, gd.at)
      else onSelect({ kind: "gridline", key: gd.line.key, axis: gd.line.axis })
      setGdrag(null)
    }
    const draft = draftRef.current
    const drag = dragRef.current
    const resize = resizeRef.current
    if (resize) {
      onResizeBox?.(resize.id, { x: resize.x, y: resize.y, w: resize.w, h: resize.h })
      setResize(null)
    }
    if (draft) {
      if (Math.hypot(draft.b.x - draft.a.x, draft.b.y - draft.a.y) >= 300) onDrawWall?.(draft.a, draft.b)
      setDraft(null)
    }
    if (drag) {
      onMoveBox?.(drag.id, drag.x, drag.y)
      setDrag(null)
    }
  }

  const lb = (id: string) => structure?.inside.get(id)?.loadBearing ?? false
  const outline = odrag?.pts ?? graph.outline
  const drawing = tool === "draw" && !!onDrawWall

  return (
    <svg
      ref={svgRef}
      className={`${styles.plan} ${drawing || pointing ? styles.planDrawing : ""}`}
      viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={() => (up(), setHover(null))}
      role="img"
      aria-label="Ground floor plan"
    >
      {/* the grid: the project's gridlines (a moved one picked out), or a metre grid */}
      {gl
        ? [...gl.xs, ...gl.ys].map((l) => {
            const at = gdrag?.line.key === l.key ? gdrag.at : l.at
            const sel = selection?.kind === "gridline" && selection.key === l.key
            const cls = sel || gdrag?.line.key === l.key ? styles.gridPicked : l.moved ? styles.gridMoved : styles.grid
            return l.axis === "x" ? (
              <line key={l.key} x1={at} y1={y0} x2={at} y2={y1} className={cls} strokeWidth={sw * (l.moved || sel ? 0.7 : 0.3)} />
            ) : (
              <line key={l.key} x1={x0} y1={at} x2={x1} y2={at} className={cls} strokeWidth={sw * (l.moved || sel ? 0.7 : 0.3)} />
            )
          })
        : [
            ...Array.from({ length: Math.ceil((x1 - x0) / 1000) + 1 }, (_, i) => Math.ceil(x0 / 1000) * 1000 + i * 1000).map((x) => (
              <line key={`gx${x}`} x1={x} y1={y0} x2={x} y2={y1} className={styles.grid} strokeWidth={sw * 0.3} />
            )),
            ...Array.from({ length: Math.ceil((y1 - y0) / 1000) + 1 }, (_, i) => Math.ceil(y0 / 1000) * 1000 + i * 1000).map((y) => (
              <line key={`gy${y}`} x1={x0} y1={y} x2={x1} y2={y} className={styles.grid} strokeWidth={sw * 0.3} />
            )),
          ]}

      {/* rooms */}
      {boxes
        ? boxes.map((b) => {
            const r = resize?.id === b.id ? resize : drag?.id === b.id ? { ...b, x: drag.x, y: drag.y } : b
            const sel = selection?.kind === "box" && selection.id === b.id
            return (
              <rect
                key={b.id}
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                fill={ROOM_KIND_COLOURS[b.kind]}
                className={`${styles.box} ${sel ? styles.boxSelected : ""}`}
                strokeWidth={sel ? sw * 2 : sw * 0.8}
                onPointerDown={(e) => {
                  if (tool === "draw") return
                  e.stopPropagation()
                  onSelect({ kind: "box", id: b.id })
                  if (!onMoveBox) return
                  const p = toPlan(e)
                  setDrag({ id: b.id, dx: p.x - b.x, dy: p.y - b.y, x: b.x, y: b.y })
                  ;(e.target as Element).setPointerCapture?.(e.pointerId)
                }}
              />
            )
          })
        : graph.rooms.map((r, i) => {
            const sel = selection?.kind === "room" && selection.index === i
            return (
              <g key={i} onClick={() => tool === "select" && onSelect({ kind: "room", index: i })} className={styles.room}>
                {r.cells.map((c, k) => (
                  <rect key={k} x={c.x} y={c.y} width={c.w} height={c.h} fill={ROOM_KIND_COLOURS[r.kind]} opacity={sel ? 1 : 0.75} stroke="none" />
                ))}
              </g>
            )
          })}

      {/* the storey below */}
      {ghost && ghost.length > 2 && (
        <polygon points={ghost.map((p) => `${p.x},${p.y}`).join(" ")} className={styles.ghost} strokeWidth={sw * 1.6} strokeDasharray={`${sw * 5} ${sw * 3}`} pointerEvents="none" />
      )}

      {/* the outside walls */}
      {outline.map((a, i) => {
        const b = outline[(i + 1) % outline.length]
        const v = structure?.outside[i]
        const sel = pickOutside && selection?.kind === "edge" && selection.index === i
        return (
          <g key={`o${i}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`${v?.loadBearing ? styles.wallLB : styles.wallOut} ${sel ? styles.wallSelected : ""}`} strokeWidth={sw * (sel ? 4.2 : 3.2)} strokeLinecap="square" />
            {pickOutside && tool === "select" && (
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth={sw * 10}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  if (placing && onPlace) onPlace({ kind: "edge", index: i }, toPlan(e as unknown as React.PointerEvent))
                  else onSelect({ kind: "edge", index: i })
                }}
                style={{ cursor: placing ? "copy" : "pointer" }}
              />
            )}
          </g>
        )
      })}

      {/* the inside walls */}
      {graph.walls.map((wall) => {
        const sel = selection?.kind === "wall" && selection.id === wall.id
        const w = wdrag?.id === wall.id ? { ...wall, a: { ...wall.a, [wdrag.axis]: wdrag.at }, b: { ...wall.b, [wdrag.axis]: wdrag.at } } : wall
        // which way it moves: square to itself (a slanted one stays put)
        const axis = Math.abs(w.a.x - w.b.x) < 1 ? "x" : Math.abs(w.a.y - w.b.y) < 1 ? "y" : null
        const movable = !!onMoveWall && !!axis
        return (
          <g key={w.id}>
            <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} className={`${lb(w.id) ? styles.wallLB : styles.wallIn} ${sel ? styles.wallSelected : ""}`} strokeWidth={sw * (sel ? 2.8 : 2)} strokeLinecap="square" />
            {tool === "select" && (
              <line
                x1={w.a.x}
                y1={w.a.y}
                x2={w.b.x}
                y2={w.b.y}
                stroke="transparent"
                strokeWidth={sw * 10}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  if (placing || !movable || !axis) return
                  onSelect({ kind: "wall", id: w.id })
                  const at = w.a[axis]
                  setWdrag({ id: w.id, axis, base: at, from: toPlan(e)[axis], at })
                  ;(e.target as Element).setPointerCapture?.(e.pointerId)
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (placing && onPlace) onPlace({ kind: "wall", id: w.id }, toPlan(e as unknown as React.PointerEvent))
                  else onSelect({ kind: "wall", id: w.id })
                }}
                style={{ cursor: placing ? "copy" : movable ? (axis === "x" ? "ew-resize" : "ns-resize") : "pointer" }}
              />
            )}
            {wdrag?.id === w.id && (
              <text
                x={axis === "x" ? w.a.x + sw * 6 : (w.a.x + w.b.x) / 2}
                y={axis === "x" ? (w.a.y + w.b.y) / 2 : w.a.y - sw * 6}
                textAnchor={axis === "x" ? "start" : "middle"}
                dominantBaseline="middle"
                fontSize={sw * 7}
                className={styles.gridLabel}
                pointerEvents="none"
              >
                {mm(wdrag.at - origin[wdrag.axis])}
              </text>
            )}
          </g>
        )
      })}

      {/* doors: a gap in the wall, and the leaf swung open */}
      {doors?.map((d) => {
        const L = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) || 1
        const n = { x: -(d.b.y - d.a.y) / L, y: (d.b.x - d.a.x) / L }
        const tip = { x: d.a.x + n.x * L, y: d.a.y + n.y * L }
        return (
          <g key={`d${d.id}`} className={d.picked ? styles.doorPicked : styles.door}>
            {onPickJoinery && !placing && (
              <line
                x1={d.a.x}
                y1={d.a.y}
                x2={d.b.x}
                y2={d.b.y}
                stroke="transparent"
                strokeWidth={sw * 8}
                style={{ cursor: "pointer" }}
                role="button"
                aria-label="Door — tap to change it"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => (e.stopPropagation(), onPickJoinery(d.id))}
              />
            )}
            <line x1={d.a.x} y1={d.a.y} x2={d.b.x} y2={d.b.y} className={styles.doorGap} strokeWidth={sw * 2.6} pointerEvents="none" />
            <line x1={d.a.x} y1={d.a.y} x2={tip.x} y2={tip.y} strokeWidth={sw * 0.9} pointerEvents="none" />
            <path d={`M${tip.x},${tip.y} A${L},${L} 0 0 ${n.x * (d.b.y - d.a.y) - n.y * (d.b.x - d.a.x) > 0 ? 0 : 1} ${d.b.x},${d.b.y}`} fill="none" strokeWidth={sw * 0.6} strokeDasharray={`${sw * 2} ${sw * 1.5}`} pointerEvents="none" />
          </g>
        )
      })}

      {/* the outside walls' windows (three lines across the wall) and doors (a leaf swung out) */}
      {joinery?.map((j) => {
        const L = Math.hypot(j.b.x - j.a.x, j.b.y - j.a.y) || 1
        const n = { x: -(j.b.y - j.a.y) / L, y: (j.b.x - j.a.x) / L }
        const t = sw * 1.6
        const off = (p: Pt, k: number) => ({ x: p.x + n.x * t * k, y: p.y + n.y * t * k })
        const line = (k: number) => {
          const [p, q] = [off(j.a, k), off(j.b, k)]
          return `M${p.x},${p.y}L${q.x},${q.y}`
        }
        return (
          <g key={`j${j.id}`} className={styles.joinery}>
            <line x1={j.a.x} y1={j.a.y} x2={j.b.x} y2={j.b.y} className={styles.doorGap} strokeWidth={sw * 3.4} pointerEvents="none" />
            <path d={j.door ? `${line(-1)}${line(1)}` : `${line(-1)}${line(0)}${line(1)}`} strokeWidth={sw * 0.7} fill="none" pointerEvents="none" />
            <path d={`M${off(j.a, -1).x},${off(j.a, -1).y}L${off(j.a, 1).x},${off(j.a, 1).y}M${off(j.b, -1).x},${off(j.b, -1).y}L${off(j.b, 1).x},${off(j.b, 1).y}`} strokeWidth={sw * 0.7} pointerEvents="none" />
            {onPickJoinery && !placing && (
              <line
                x1={j.a.x}
                y1={j.a.y}
                x2={j.b.x}
                y2={j.b.y}
                stroke="transparent"
                strokeWidth={sw * 8}
                style={{ cursor: "pointer" }}
                role="button"
                aria-label={`${j.door ? "Door" : "Window"} — tap to change it`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => (e.stopPropagation(), onPickJoinery(j.id))}
              />
            )}
          </g>
        )
      })}

      {/* which way the roof framing spans */}
      {structure?.spans.map((s, i) => {
        const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) || 1
        const d = { x: (s.b.x - s.a.x) / len, y: (s.b.y - s.a.y) / len }
        const head = (p: Pt, k: 1 | -1) => `M${p.x - d.x * k * sw * 8 + d.y * sw * 5},${p.y - d.y * k * sw * 8 - d.x * sw * 5}L${p.x},${p.y}L${p.x - d.x * k * sw * 8 - d.y * sw * 5},${p.y - d.y * k * sw * 8 + d.x * sw * 5}`
        const pickable = pickSections && !!s.key
        const sel = pickable && selection?.kind === "section" && selection.key === s.key
        const pick = () => s.key && onSelect({ kind: "section", key: s.key })
        const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }
        return (
          <g key={`s${i}`} className={sel ? styles.spanPicked : styles.span}>
            {sel && s.wing && <polygon points={s.wing.map((p) => `${p.x},${p.y}`).join(" ")} className={styles.sectionPicked} strokeWidth={sw * 1.4} pointerEvents="none" />}
            <line x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} strokeWidth={sw * (sel ? 1.6 : 0.9)} strokeDasharray={`${sw * 4} ${sw * 3}`} />
            <path d={`${head(s.b, 1)}${head(s.a, -1)}`} strokeWidth={sw * (sel ? 1.6 : 0.9)} fill="none" />
            {pickable && (
              <>
                <line
                  x1={s.a.x}
                  y1={s.a.y}
                  x2={s.b.x}
                  y2={s.b.y}
                  stroke="transparent"
                  strokeWidth={sw * 10}
                  style={{ cursor: "pointer" }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => (e.stopPropagation(), pick())}
                />
                <g
                  role="button"
                  aria-label={`Roof section ${i + 1}${s.type ? `, ${s.type}` : ""} — tap to turn it or change its roof`}
                  style={{ cursor: "pointer" }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => (e.stopPropagation(), pick())}
                >
                  <circle cx={mid.x} cy={mid.y} r={sw * 7} className={styles.spanBadge} strokeWidth={sw * 0.9} />
                  <path
                    d={`M${mid.x + sw * 3.5},${mid.y - sw * 1}A${sw * 3.6},${sw * 3.6} 0 1 0 ${mid.x + sw * 1.2},${mid.y + sw * 3.4}`}
                    fill="none"
                    strokeWidth={sw * 0.9}
                  />
                  <path d={`M${mid.x + sw * 1.8},${mid.y - sw * 1.4}L${mid.x + sw * 3.7},${mid.y - sw * 0.8}L${mid.x + sw * 4.3},${mid.y - sw * 2.9}`} fill="none" strokeWidth={sw * 0.9} />
                </g>
              </>
            )}
          </g>
        )
      })}

      {/* room names */}
      {graph.rooms.map((r, i) => {
        const box = boxes?.find((b) => b.id === r.id)
        const at =
          box && resize?.id === box.id
            ? { x: resize.x + resize.w / 2, y: resize.y + resize.h / 2 }
            : box && drag?.id === box.id
              ? { x: drag.x + box.w / 2, y: drag.y + box.h / 2 }
              : box
                ? { x: box.x + box.w / 2, y: box.y + box.h / 2 }
                : r.label
        return (
          <text key={`t${i}`} x={at.x} y={at.y} textAnchor="middle" className={styles.roomLabel} fontSize={sw * 9} pointerEvents="none">
            <tspan x={at.x} dy={-sw * 2}>
              {r.name}
            </tspan>
            <tspan x={at.x} dy={sw * 11} className={styles.roomArea} fontSize={sw * 7}>
              {box && resize?.id === box.id ? `${(resize.w / 1000).toFixed(1)} × ${(resize.h / 1000).toFixed(1)} m` : m2(r.areaM2)}
            </tspan>
          </text>
        )
      })}

      {/* the selected room's corners, to drag */}
      {boxes &&
        onResizeBox &&
        selection?.kind === "box" &&
        (() => {
          const b = boxes.find((x) => x.id === selection.id)
          if (!b) return null
          const r = resize?.id === b.id ? resize : drag?.id === b.id ? { ...b, x: drag.x, y: drag.y } : b
          const corners: [number, number][] = [
            [r.x, r.y],
            [r.x + r.w, r.y],
            [r.x + r.w, r.y + r.h],
            [r.x, r.y + r.h],
          ]
          return corners.map(([cx, cy], k) => {
            // the corner across from this one stays put
            const [fx, fy] = corners[(k + 2) % 4]
            return (
              <g key={`h${k}`}>
                <circle cx={cx} cy={cy} r={sw * 4} className={styles.handle} strokeWidth={sw * 1.2} pointerEvents="none" />
                <circle
                  cx={cx}
                  cy={cy}
                  r={sw * 11}
                  fill="transparent"
                  style={{ cursor: k % 2 ? "nesw-resize" : "nwse-resize" }}
                  role="button"
                  aria-label={`Drag to resize ${b.name}`}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    setResize({ id: b.id, fx, fy, x: b.x, y: b.y, w: b.w, h: b.h })
                    ;(e.target as Element).setPointerCapture?.(e.pointerId)
                  }}
                />
              </g>
            )
          })
        })()}

      {/* shaping the outline: each side's length, a handle on each side and corner */}
      {tool === "outline" &&
        onOutlineChange &&
        outline.map((a, i) => {
          const b = outline[(i + 1) % outline.length]
          const len = Math.hypot(b.x - a.x, b.y - a.y)
          const sel = selection?.kind === "edge" && selection.index === i && !odrag
          const plumb = Math.abs(a.x - b.x) < Math.abs(a.y - b.y)
          // the length, just outside the wall (outside: away from the middle)
          const cx = outline.reduce((s, p) => s + p.x, 0) / outline.length
          const cy = outline.reduce((s, p) => s + p.y, 0) / outline.length
          const mx = (a.x + b.x) / 2
          const my = (a.y + b.y) / 2
          const off = sw * 10
          const lx = plumb ? mx + (mx >= cx ? off : -off) : mx
          const ly = plumb ? my : my + (my >= cy ? off : -off)
          const start = (kind: "corner" | "edge") => (e: React.PointerEvent) => {
            e.stopPropagation()
            const base = graph.outline.map((q) => ({ ...q }))
            setOdrag({ kind, index: i, base, pts: base, moved: false })
            ;(e.target as Element).setPointerCapture?.(e.pointerId)
          }
          return (
            <g key={`oh${i}`}>
              {sel && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={styles.wallSelected} strokeWidth={sw * 4.2} strokeLinecap="square" pointerEvents="none" />}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth={sw * 10}
                style={{ cursor: plumb ? "ew-resize" : "ns-resize" }}
                role="button"
                aria-label={`Outside wall ${i + 1}, ${(len / 1000).toFixed(2)} m — drag to move it, tap to pick it`}
                onPointerDown={start("edge")}
              />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={sw * 7} className={styles.roomLabel} pointerEvents="none">
                {(len / 1000).toFixed(2)}
              </text>
              <circle cx={a.x} cy={a.y} r={sw * 4} className={styles.handle} strokeWidth={sw * 1.2} pointerEvents="none" />
              <circle
                cx={a.x}
                cy={a.y}
                r={sw * 11}
                fill="transparent"
                style={{ cursor: "move" }}
                role="button"
                aria-label={`Corner ${i + 1} — drag to move it`}
                onPointerDown={start("corner")}
              />
            </g>
          )
        })}

      {/* the gridlines' tabs, to drag one along (or tap to type where it goes) */}
      {gl &&
        onMoveGridline &&
        [...gl.xs.filter((l) => l.at > x0 && l.at < x1), ...gl.ys.filter((l) => l.at > y0 && l.at < y1)].map((l) => {
          const at = gdrag?.line.key === l.key ? gdrag.at : l.at
          const sel = (selection?.kind === "gridline" && selection.key === l.key) || gdrag?.line.key === l.key
          const [cx, cy] = l.axis === "x" ? [at, y0 + sw * 6] : [x0 + sw * 6, at]
          return (
            <g key={`gt${l.key}`}>
              <circle cx={cx} cy={cy} r={sw * (sel ? 4 : 2.6)} className={sel ? styles.gridTabPicked : l.moved ? styles.gridTabMoved : styles.gridTab} />
              {(l.moved || sel || Math.abs(at - origin[l.axis]) < 1) && (
                <text
                  x={l.axis === "x" ? cx : cx + sw * 6}
                  y={l.axis === "x" ? cy + sw * 9 : cy}
                  textAnchor={l.axis === "x" ? "middle" : "start"}
                  dominantBaseline="middle"
                  fontSize={sw * 6}
                  className={styles.gridLabel}
                  pointerEvents="none"
                >
                  {mm(at - origin[l.axis])}
                </text>
              )}
              {!pointing && <circle
                cx={cx}
                cy={cy}
                r={sw * 8}
                fill="transparent"
                style={{ cursor: l.axis === "x" ? "ew-resize" : "ns-resize" }}
                role="button"
                aria-label={`Gridline at ${mm(l.at - origin[l.axis])} mm — drag to move it, tap to type where`}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  setGdrag({ line: l, at: l.at })
                  ;(e.target as Element).setPointerCapture?.(e.pointerId)
                }}
              />}
            </g>
          )
        })}

      {/* the grid's measurements down the left and along the top: from 0,0
          to each moved line and the house's ends — and under them, the rows
          typed in — each showing its gaps, its running measurements, or both */}
      {gl &&
        (["x", "y"] as const).map((axis) => {
          const ls = axis === "x" ? gl.xs : gl.ys
          const lo = axis === "x" ? x0 : y0
          const hi = axis === "x" ? x1 : y1
          const live = (l: GridLine) => (gdrag?.line.key === l.key ? gdrag.at : l.at)
          const auto = [
            origin[axis],
            ...ls.filter((l) => l.moved || gdrag?.line.key === l.key).map(live),
            ...(outline.length ? [Math.min(...outline.map((p) => p[axis])), Math.max(...outline.map((p) => p[axis]))] : []),
          ]
            .filter((v) => v > lo && v < hi)
            .sort((a, b) => a - b)
            .filter((v, i, a) => i === 0 || v - a[i - 1] >= 1)
          const base = (axis === "x" ? y0 : x0) + sw * 34
          const t = sw * 3
          const P = (along: number, across: number) => (axis === "x" ? { x: along, y: across } : { x: across, y: along })
          const rot = (at: Pt) => (axis === "y" ? `rotate(-90 ${at.x} ${at.y})` : undefined)
          const chains = (grid?.chains ?? []).filter((c) => c.axis === axis)
          /** a row of marks at `r` across: ticks, the gaps between and/or each one's distance on from `from` */
          const row = (key: string, marks: number[], r: number, show: RulerShow, from: number, picked: boolean, onPick?: () => void) => {
            if (marks.length < 2) return null
            const a = P(marks[0], r)
            const z = P(marks[marks.length - 1], r)
            const between = show !== "running"
            const running = show !== "between"
            let lastShown = -Infinity
            return (
              <g key={key} className={picked ? styles.rulerPicked : styles.ruler} pointerEvents={onPick ? undefined : "none"}>
                <line x1={a.x} y1={a.y} x2={z.x} y2={z.y} strokeWidth={sw * (picked ? 1.1 : 0.6)} />
                {marks.map((v) => {
                  const p = P(v, r - t)
                  const q = P(v, r + t)
                  const tk = P(v, r)
                  return (
                    <g key={v}>
                      <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} strokeWidth={sw * 0.6} />
                      <line x1={tk.x - t * 0.7} y1={tk.y + t * 0.7} x2={tk.x + t * 0.7} y2={tk.y - t * 0.7} strokeWidth={sw * 0.9} />
                    </g>
                  )
                })}
                {between &&
                  marks.slice(1).map((v, i) => {
                    const at = P((v + marks[i]) / 2, r - sw * 2.5)
                    const gap = v - marks[i]
                    return gap < sw * 14 ? null : (
                      <text key={`g${v}`} x={at.x} y={at.y} textAnchor="middle" fontSize={sw * 5.5} className={styles.rulerLabel} transform={rot(at)}>
                        {mm(gap)}
                      </text>
                    )
                  })}
                {running &&
                  marks.map((v) => {
                    // (one too close to the last shown is left off)
                    if (v - lastShown < sw * 12) return null
                    lastShown = v
                    const at = P(v, between ? r + sw * 7 : r - sw * 2.5)
                    return (
                      <text key={`r${v}`} x={at.x} y={at.y} textAnchor="middle" fontSize={sw * 5} className={styles.rulerRunning} transform={rot(at)}>
                        {mm(v - from)}
                      </text>
                    )
                  })}
                {onPick && (
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={z.x}
                    y2={z.y}
                    stroke="transparent"
                    strokeWidth={sw * 9}
                    style={{ cursor: "pointer" }}
                    role="button"
                    aria-label="Measurements — tap to change them"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => (e.stopPropagation(), onPick())}
                  />
                )}
              </g>
            )
          }
          const plusAt = P((auto.length ? auto[0] : origin[axis]) - sw * 11, base)
          return (
            <g key={`ruler${axis}`}>
              {row("auto", auto, base, grid?.rulerShow?.[axis] ?? "between", origin[axis], selection?.kind === "ruler" && selection.axis === axis && !selection.id, onRuler && (() => onRuler(axis)))}
              {chains.map((c, k) => {
                const marks = [origin[axis] + c.start]
                for (const st of c.steps) marks.push(marks[marks.length - 1] + st)
                return row(c.id, marks, base + sw * 16 * (k + 1), c.show, marks[0], selection?.kind === "ruler" && selection.id === c.id, onRuler && (() => onRuler(axis, c.id)))
              })}
              {onRuler && tool === "measure" && (
                <g
                  className={styles.rulerPlus}
                  role="button"
                  aria-label={`Add measurements ${axis === "x" ? "along the top" : "down the left"}`}
                  style={{ cursor: "pointer" }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => (e.stopPropagation(), onRuler(axis, null))}
                >
                  <circle cx={plusAt.x} cy={plusAt.y} r={sw * 5.5} strokeWidth={sw * 0.8} />
                  <path d={`M${plusAt.x - sw * 3},${plusAt.y}H${plusAt.x + sw * 3}M${plusAt.x},${plusAt.y - sw * 3}V${plusAt.y + sw * 3}`} strokeWidth={sw * 1.1} />
                </g>
              )}
            </g>
          )
        })}

      {/* 0,0 */}
      {grid && origin.x > x0 && origin.x < x1 && origin.y > y0 && origin.y < y1 && (
        <g className={styles.origin} pointerEvents="none">
          <circle cx={origin.x} cy={origin.y} r={sw * 4} strokeWidth={sw * 0.8} fill="none" />
          <path d={`M${origin.x - sw * 7},${origin.y}H${origin.x + sw * 7}M${origin.x},${origin.y - sw * 7}V${origin.y + sw * 7}`} strokeWidth={sw * 0.6} />
          <text x={origin.x - sw * 5} y={origin.y - sw * 5} textAnchor="end" fontSize={sw * 5.5} className={styles.originLabel}>
            0,0
          </text>
        </g>
      )}

      {/* measurements drawn between grid points */}
      {grid?.dims?.map((d) => {
        const live = (p: GridPoint): Pt => {
          const q = gridPointAt(grid, p)
          if (gdrag) {
            if (gdrag.line.key === p.x) q.x = gdrag.at
            if (gdrag.line.key === p.y) q.y = gdrag.at
          }
          return q
        }
        const sel = selection?.kind === "dim" && selection.id === d.id
        return <Dim key={d.id} a={live(d.a)} b={live(d.b)} sw={sw} picked={sel} onPick={tool === "draw" || pointing ? undefined : () => onSelect({ kind: "dim", id: d.id })} />
      })}

      {/* measuring: the point to measure from, and the one under the pointer */}
      {pointing && grid && hover && (
        <g pointerEvents="none">
          {pending && <Dim a={gridPointAt(grid, pending)} b={gridPointAt(grid, hover)} sw={sw} draft />}
          {pending && <circle cx={gridPointAt(grid, pending).x} cy={gridPointAt(grid, pending).y} r={sw * 3.5} className={styles.handle} strokeWidth={sw * 1.2} />}
          <circle cx={gridPointAt(grid, hover).x} cy={gridPointAt(grid, hover).y} r={sw * 3.5} className={styles.handle} strokeWidth={sw * 1.2} />
          {tool === "origin" && (
            <text x={gridPointAt(grid, hover).x + sw * 6} y={gridPointAt(grid, hover).y - sw * 6} fontSize={sw * 6} className={styles.originLabel}>
              make this 0,0
            </text>
          )}
        </g>
      )}

      {/* the wall being drawn */}
      {draft && (
        <g pointerEvents="none">
          <line x1={draft.a.x} y1={draft.a.y} x2={draft.b.x} y2={draft.b.y} className={styles.wallDraft} strokeWidth={sw * 2} strokeLinecap="square" />
          <text x={(draft.a.x + draft.b.x) / 2} y={(draft.a.y + draft.b.y) / 2 - sw * 6} textAnchor="middle" fontSize={sw * 8} className={styles.roomLabel}>
            {(Math.hypot(draft.b.x - draft.a.x, draft.b.y - draft.a.y) / 1000).toFixed(2)} m
          </text>
        </g>
      )}
    </svg>
  )
}

/** A measurement on the plan: the line, a tick at each end, its length in mm
 * along it (and the across and down, if it's on the slant). */
const Dim: React.FC<{ a: Pt; b: Pt; sw: number; picked?: boolean; draft?: boolean; onPick?: () => void }> = ({ a, b, sw, picked, draft, onPick }) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const L = Math.hypot(dx, dy)
  if (L < 1) return null
  const u = { x: dx / L, y: dy / L }
  const n = { x: -u.y, y: u.x }
  const t = sw * 4
  // the writing reads left to right, or upwards
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI
  if (ang > 90 || ang <= -90) ang += 180
  const side = ang === (Math.atan2(dy, dx) * 180) / Math.PI ? -1 : 1
  const m = { x: (a.x + b.x) / 2 + n.x * sw * 4 * side, y: (a.y + b.y) / 2 + n.y * sw * 4 * side }
  const slant = Math.abs(dx) >= 1 && Math.abs(dy) >= 1
  const tick = (p: Pt) => `M${p.x - (u.x + n.x) * t * 0.7},${p.y - (u.y + n.y) * t * 0.7}L${p.x + (u.x + n.x) * t * 0.7},${p.y + (u.y + n.y) * t * 0.7}M${p.x - n.x * t},${p.y - n.y * t}L${p.x + n.x * t},${p.y + n.y * t}`
  return (
    <g className={picked ? styles.dimPicked : draft ? styles.dimDraft : styles.dim}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={sw * (picked ? 1.2 : 0.8)} strokeDasharray={draft ? `${sw * 3} ${sw * 2}` : undefined} pointerEvents="none" />
      <path d={tick(a) + tick(b)} strokeWidth={sw * 0.9} fill="none" pointerEvents="none" />
      <text x={m.x} y={m.y} textAnchor="middle" dominantBaseline="middle" fontSize={sw * 6} transform={`rotate(${ang} ${m.x} ${m.y})`} className={styles.dimLabel} pointerEvents="none">
        {Math.round(L)}
        {slant ? ` (${Math.round(Math.abs(dx))} × ${Math.round(Math.abs(dy))})` : ""}
      </text>
      {onPick && (
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="transparent"
          strokeWidth={sw * 8}
          style={{ cursor: "pointer" }}
          role="button"
          aria-label={`Measurement, ${Math.round(L)} mm`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onPick()
          }}
        />
      )}
    </g>
  )
}

export default PlanCanvas
