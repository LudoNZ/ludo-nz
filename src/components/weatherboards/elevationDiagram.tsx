"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Opening, WeatherboardSettings } from "./types"
import { WallResult, calculateWall, edgePoints } from "./weatherboardCalc"
import styles from "./elevationDiagram.module.scss"

/** Gap between walls laid side by side, in wall millimetres. */
const WALL_GAP_MM = 600
const SNAP_MM = 10
const MIN_OPENING_MM = 100

type DragMode = "move" | "nw" | "ne" | "sw" | "se"

interface Drag {
  wallId: string
  mode: DragMode
  startX: number
  startY: number
  orig: Opening
  wallLength: number
}

const snap = (v: number) => Math.round(v / SNAP_MM) * SNAP_MM

/** Applies a drag of (dx, dy) world mm to an opening: the body moves it,
 * a corner handle resizes it from that corner with the opposite corner
 * pinned. Kept inside the wall horizontally, never below the minimum size. */
const dragOpening = (d: Drag, dx: number, dy: number): Opening => {
  const o = d.orig
  let { x, sill, width, height } = o
  if (d.mode === "move") {
    x = snap(o.x + dx)
    sill = snap(o.sill + dy)
  } else {
    if (d.mode === "nw" || d.mode === "sw") {
      const right = o.x + o.width
      x = Math.min(snap(o.x + dx), right - MIN_OPENING_MM)
      width = right - x
    } else {
      width = Math.max(MIN_OPENING_MM, snap(o.width + dx))
    }
    if (d.mode === "sw" || d.mode === "se") {
      const head = o.sill + o.height
      sill = Math.min(snap(o.sill + dy), head - MIN_OPENING_MM)
      height = head - sill
    } else {
      height = Math.max(MIN_OPENING_MM, snap(o.height + dy))
    }
  }
  if (d.mode === "move") x = Math.max(0, Math.min(x, d.wallLength - width))
  else if (x < 0) {
    width += x
    x = 0
  } else if (x + width > d.wallLength) width = d.wallLength - x
  return { ...o, x, sill, width, height }
}

/** One elevation drawn to scale: every wall left to right, its outline
 * clipped over the course lines, studs faint behind, each board join as
 * a red tick in its course, and openings that can be dragged around and
 * resized from their corners — so stagger and rake cuts can be checked
 * by eye against the drawings. */
const ElevationDiagram: React.FC<{
  results: WallResult[]
  /** A wall being set up on "+ Add wall": drawn dashed, not interactive. */
  draftWallId?: string | null
  settings: WeatherboardSettings
  activeWallId?: string | null
  selectedOpeningId?: string | null
  onSelectWall?: (wallId: string) => void
  onSelectOpening?: (wallId: string, openingId: string) => void
  onOpeningChange?: (wallId: string, opening: Opening) => void
}> = ({ results, draftWallId, settings, activeWallId, selectedOpeningId, onSelectWall, onSelectOpening, onOpeningChange }) => {
  const fw = settings.facingWidthMm
  const lap = settings.flashingLapMm
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<Drag | null>(null)
  // While dragging, the opening lives here and only its own wall is
  // recalculated; the project (and with it the whole-order optimiser,
  // storage and autosave) only hears about it once on release.
  const [preview, setPreview] = useState<{ wallId: string; opening: Opening } | null>(null)
  const previewRef = useRef(preview)
  previewRef.current = preview

  const shown = useMemo(() => {
    if (!preview) return results
    return results.map((r) =>
      r.wall.id !== preview.wallId
        ? r
        : calculateWall(
            { ...r.wall, openings: (r.wall.openings ?? []).map((o) => (o.id === preview.opening.id ? preview.opening : o)) },
            settings,
          ),
    )
  }, [results, preview, settings])

  // Touch browsers start scrolling the page a few pixels into a drag and
  // cancel the pointer — and iOS ignores touch-action on SVG shapes — so
  // block the scroll natively, but only while an opening is held.
  const hasSvg = results.some((r) => r.wall.lengthMm > 0 && r.maxY > r.minY)
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const block = (e: TouchEvent) => {
      if (dragRef.current || (e.target as Element | null)?.closest?.("[data-draggable]")) e.preventDefault()
    }
    svg.addEventListener("touchstart", block, { passive: false })
    svg.addEventListener("touchmove", block, { passive: false })
    return () => {
      svg.removeEventListener("touchstart", block)
      svg.removeEventListener("touchmove", block)
    }
  }, [hasSvg])

  const drawable = shown.filter((r) => r.wall.lengthMm > 0 && r.maxY > r.minY)
  if (drawable.length === 0) return <p className={styles.empty}>Add a wall with a length and height to see it here.</p>

  const minY = Math.min(...drawable.map((r) => r.minY))
  const maxY = Math.max(...drawable.map((r) => r.maxY))
  const totalW = drawable.reduce((s, r) => s + r.wall.lengthMm, 0) + WALL_GAP_MM * (drawable.length - 1)
  const H = maxY - minY
  const font = Math.max(totalW, H * 2) / 45
  const pad = font * 1.5
  const vbX = -pad
  const vbY = -maxY - pad
  const vbW = totalW + pad * 2
  const vbH = H + pad * 2 + font * 2.6
  const stroke = font / 12
  const handle = font * 0.7

  const offsets: number[] = []
  drawable.reduce((x, r) => {
    offsets.push(x)
    return x + r.wall.lengthMm + WALL_GAP_MM
  }, 0)

  // client px → wall mm (SVG y runs down, wall heights run up)
  const toWorld = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: -p.y }
  }

  const startDrag = (e: React.PointerEvent, r: WallResult, o: Opening, mode: DragMode) => {
    e.stopPropagation()
    // no text selection or native drag kicking in mid-move
    e.preventDefault()
    onSelectOpening?.(r.wall.id, o.id)
    if (!onOpeningChange) return
    const w = toWorld(e.clientX, e.clientY)
    if (!w) return
    // capture on the svg itself — it never re-renders away mid-drag the
    // way a handle can
    try {
      svgRef.current?.setPointerCapture(e.pointerId)
    } catch {
      // pointer already gone — the drag still works while it stays over the svg
    }
    dragRef.current = { wallId: r.wall.id, mode, startX: w.x, startY: w.y, orig: o, wallLength: r.wall.lengthMm }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const w = toWorld(e.clientX, e.clientY)
    if (!w) return
    const next = dragOpening(d, w.x - d.startX, w.y - d.startY)
    const cur = previewRef.current?.opening ?? d.orig
    if (cur.x === next.x && cur.sill === next.sill && cur.width === next.width && cur.height === next.height) return
    setPreview({ wallId: d.wallId, opening: next })
  }

  const endDrag = () => {
    const d = dragRef.current
    dragRef.current = null
    const p = previewRef.current
    if (d && p) onOpeningChange?.(p.wallId, p.opening)
    setPreview(null)
  }

  return (
    <svg
      ref={svgRef}
      className={styles.svg}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      role="img"
      aria-label="Elevation with board courses and openings"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={() => dragRef.current && endDrag()}
    >
      {drawable.map((r, wi) => {
        const x0 = offsets[wi]
        const L = r.wall.lengthMm
        const top = edgePoints(r.wall.top, L)
        const bottom = edgePoints(r.wall.bottom, L)
        const outline = [...top, ...[...bottom].reverse()].map((p) => `${x0 + p.x},${-p.y}`).join(" ")
        const clipId = `wb-clip-${r.wall.id}`

        return (
          <g
            key={r.wall.id}
            className={r.wall.id === draftWallId ? styles.draft : r.wall.id === activeWallId ? styles.active : undefined}
          >
            <defs>
              <clipPath id={clipId}>
                <polygon points={outline} />
              </clipPath>
            </defs>
            <polygon
              points={outline}
              className={`${styles.wall} ${onSelectWall && r.wall.id !== draftWallId ? styles.clickable : ""}`}
              onClick={() => r.wall.id !== draftWallId && onSelectWall?.(r.wall.id)}
            />
            <g clipPath={`url(#${clipId})`}>
              {r.studs.map((x) => (
                <line key={`s${x}`} x1={x0 + x} x2={x0 + x} y1={-r.maxY} y2={-r.minY} className={styles.stud} strokeWidth={stroke} />
              ))}
              {r.courses.map((c) => (
                <line key={`c${c.index}`} x1={x0} x2={x0 + L} y1={-c.bottom} y2={-c.bottom} className={styles.course} strokeWidth={stroke} />
              ))}
              {r.courses.flatMap((c) =>
                c.joins.map((x) => (
                  <line
                    key={`j${c.index}-${x}`}
                    x1={x0 + x}
                    x2={x0 + x}
                    y1={-c.bottom}
                    y2={-c.top}
                    className={styles.join}
                    strokeWidth={stroke * 3}
                  />
                )),
              )}
              {(["leftEnd", "rightEnd"] as const).map((key) => {
                const type = r.wall[key] ?? "externalFacing"
                if (type !== "externalFacing" && type !== "internalScriber") return null
                const w = type === "externalFacing" ? fw : Math.max(fw / 2, stroke * 4)
                return (
                  <rect
                    key={key}
                    x={key === "leftEnd" ? x0 : x0 + L - w}
                    y={-r.maxY}
                    width={w}
                    height={r.maxY - r.minY}
                    className={type === "externalFacing" ? styles.facing : styles.scriber}
                  />
                )
              })}
            </g>
            <polygon points={outline} className={styles.outline} strokeWidth={stroke * 2} />

            {(r.wall.openings ?? []).map((o) => {
              const selected = o.id === selectedOpeningId
              const ox = x0 + o.x
              const oy = -(o.sill + o.height)
              const corners: [DragMode, number, number][] = [
                ["nw", ox, oy],
                ["ne", ox + o.width, oy],
                ["sw", ox, oy + o.height],
                ["se", ox + o.width, oy + o.height],
              ]
              return (
                <g key={o.id}>
                  <rect x={ox - fw} y={oy - fw} width={o.width + fw * 2} height={o.height + fw} className={styles.facing} />
                  <line
                    x1={ox - fw - lap}
                    x2={ox + o.width + fw + lap}
                    y1={oy - fw}
                    y2={oy - fw}
                    className={styles.flashing}
                    strokeWidth={stroke * 3}
                  />
                  <rect
                    x={ox}
                    y={oy}
                    width={o.width}
                    height={o.height}
                    className={`${styles.opening} ${selected ? styles.openingSelected : ""}`}
                    strokeWidth={stroke * 2}
                    data-draggable={r.wall.id === draftWallId ? undefined : true}
                    onPointerDown={(e) => r.wall.id !== draftWallId && startDrag(e, r, o, "move")}
                  />
                  {selected && (
                    <>
                      {corners.map(([mode, cx, cy]) => (
                        <rect
                          key={mode}
                          x={cx - handle / 2}
                          y={cy - handle / 2}
                          width={handle}
                          height={handle}
                          className={`${styles.handle} ${styles[mode]}`}
                          strokeWidth={stroke}
                          data-draggable
                          onPointerDown={(e) => startDrag(e, r, o, mode)}
                        />
                      ))}
                      <text
                        x={ox + o.width / 2}
                        y={oy + o.height / 2}
                        fontSize={font * 0.7}
                        className={styles.openingLabel}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {o.width} × {o.height}
                      </text>
                    </>
                  )}
                </g>
              )
            })}

            <text x={x0 + L / 2} y={-minY + font * 1.3} fontSize={font} className={styles.label} textAnchor="middle">
              {r.wall.name || "Wall"}
            </text>
            <text x={x0 + L / 2} y={-minY + font * 2.4} fontSize={font * 0.8} className={styles.dim} textAnchor="middle">
              {(L / 1000).toFixed(2)} m · {r.courses.length} courses
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default ElevationDiagram
