"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Opening, WeatherboardSettings } from "./types"
import { WallResult, calculateWall, edgePoints } from "./weatherboardCalc"
import { measureKey } from "./measures"
import { boardId, boardLabel } from "./takeoff"
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
  settings: WeatherboardSettings
  activeWallId?: string | null
  selectedOpeningId?: string | null
  onSelectWall?: (wallId: string) => void
  onSelectOpening?: (wallId: string, openingId: string) => void
  onOpeningChange?: (wallId: string, opening: Opening) => void
  /** dependent measure key → anchor key, for the 🔗 / ⚓ markers */
  links?: Map<string, string>
  anchors?: Map<string, number>
  /** Clicking a dimension: its measure key and where it sits on screen. */
  onEditMeasure?: (key: string, at: DOMRect) => void
  /** A corner dragged sideways to `x` (mm from the wall's left end). */
  onCornerMove?: (wallId: string, cornerId: string, x: number) => void
  /** "N1"-style code per wall, for board ids matching the cut list */
  wallCodes?: Map<string, string>
  /** board id → numbered stock board it's cut from */
  stockBoardOf?: Map<string, number>
  /** show each board's length (and stock board) beside its label */
  showLengths?: boolean
  /** "Skip boards" mode: tap (or drag across) boards to leave them out */
  skipMode?: boolean
  onSkip?: (wallId: string, courseIndex: number, pieceIndex: number, skip: boolean) => void
  /** skip mode: a window or door tapped — choose which of its trims to skip */
  onJoineryTap?: (wallId: string, openingId: string) => void
}> = ({
  links,
  anchors,
  onEditMeasure,
  onCornerMove,
  wallCodes,
  stockBoardOf,
  showLengths, skipMode, onSkip, onJoineryTap, results, settings, activeWallId, selectedOpeningId, onSelectWall, onSelectOpening, onOpeningChange }) => {
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
  // skip-mode painting: whether this stroke skips or counts boards, and
  // which boards it has already done
  const paintRef = useRef<{ skip: boolean; done: Set<string>; last: { x: number; y: number } } | null>(null)

  // same idea for a corner being dragged sideways
  const cornerDragRef = useRef<{ wallId: string; cornerId: string; startX: number; origX: number; wallLength: number } | null>(null)
  const [cornerPreview, setCornerPreview] = useState<{ wallId: string; cornerId: string; x: number } | null>(null)
  const cornerPreviewRef = useRef(cornerPreview)
  cornerPreviewRef.current = cornerPreview

  const shown = useMemo(() => {
    if (!preview && !cornerPreview) return results
    return results.map((r) => {
      let wall = r.wall
      if (preview?.wallId === wall.id)
        wall = { ...wall, openings: (wall.openings ?? []).map((o) => (o.id === preview.opening.id ? preview.opening : o)) }
      if (cornerPreview?.wallId === wall.id)
        wall = { ...wall, corners: (wall.corners ?? []).map((c) => (c.id === cornerPreview.cornerId ? { ...c, x: cornerPreview.x } : c)) }
      return wall === r.wall ? r : calculateWall(wall, settings)
    })
  }, [results, preview, cornerPreview, settings])

  // Touch browsers start scrolling the page a few pixels into a drag and
  // cancel the pointer — and iOS ignores touch-action on SVG shapes — so
  // block the scroll natively, but only while an opening is held.
  const hasSvg = results.some((r) => r.wall.lengthMm > 0 && r.maxY > r.minY)
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const block = (e: TouchEvent) => {
      if (dragRef.current || paintRef.current || (e.target as Element | null)?.closest?.("[data-draggable]")) e.preventDefault()
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
  const sumL = drawable.reduce((s, r) => s + r.wall.lengthMm, 0)
  const H = maxY - minY
  const font = Math.max(sumL + WALL_GAP_MM * (drawable.length - 1), H * 2) / 45
  // walls sit far enough apart for a height dimension on each side
  const gap = Math.max(WALL_GAP_MM, font * 3.4)
  const totalW = sumL + gap * (drawable.length - 1)
  const pad = font * 1.5
  const side = font * 1.8 // room for the outermost height dimensions
  const vbX = -pad - side
  const vbY = -maxY - pad
  const vbW = totalW + (pad + side) * 2
  const vbH = H + pad * 2 + font * 4.6
  const stroke = font / 12
  const handle = font * 0.7
  const dimY = -minY + font * 0.8 // width dimension line, under every wall

  const offsets: number[] = []
  drawable.reduce((x, r) => {
    offsets.push(x)
    return x + r.wall.lengthMm + gap
  }, 0)

  const dimText = (wallId: string, kind: string, value: number) => {
    const key = measureKey(wallId, kind)
    const mark = links?.has(key) ? " 🔗" : anchors?.has(key) ? " ⚓" : ""
    return { key, text: `${Math.round(value)}${mark}`, linked: !!links?.has(key), anchor: !!anchors?.has(key) }
  }
  const dimClass = (d: { linked: boolean; anchor: boolean }, editable: boolean) =>
    `${styles.dimLabel} ${d.linked ? styles.dimLinked : d.anchor ? styles.dimAnchor : ""} ${editable ? styles.dimEditable : ""}`

  // client px → wall mm (SVG y runs down, wall heights run up)
  const toWorld = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: -p.y }
  }

  /** The board under a screen point, worked out from the drawing's own
   * geometry (not the DOM), so painting keeps up however fast the pointer
   * moves: "wallId|course|piece", or null between boards. */
  const boardAt = (clientX: number, clientY: number): string | null => {
    const w = toWorld(clientX, clientY)
    if (!w) return null
    for (let i = 0; i < drawable.length; i++) {
      const r = drawable[i]
      const x = w.x - offsets[i]
      if (x < 0 || x > r.wall.lengthMm) continue
      const c = r.courses.find((cc) => w.y >= cc.bottom && w.y < cc.top)
      const pi = c ? c.pieces.findIndex((p) => x >= p.start && x <= p.end) : -1
      return c && pi >= 0 ? `${r.wall.id}|${c.index}|${pi}` : null
    }
    return null
  }

  const startPaint = (e: React.PointerEvent, key: string, skippedNow: boolean) => {
    e.stopPropagation()
    e.preventDefault()
    const [wallId, ci, pi] = key.split("|")
    paintRef.current = { skip: !skippedNow, done: new Set([key]), last: { x: e.clientX, y: e.clientY } }
    try {
      svgRef.current?.setPointerCapture(e.pointerId)
    } catch {
      // pointer already gone — painting still works while it stays over the svg
    }
    onSkip?.(wallId, Number(ci), Number(pi), !skippedNow)
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

  const startCornerDrag = (e: React.PointerEvent, r: WallResult, cornerId: string, x: number) => {
    e.stopPropagation()
    e.preventDefault()
    if (!onCornerMove) return
    const w = toWorld(e.clientX, e.clientY)
    if (!w) return
    try {
      svgRef.current?.setPointerCapture(e.pointerId)
    } catch {
      // pointer already gone — the drag still works while it stays over the svg
    }
    cornerDragRef.current = { wallId: r.wall.id, cornerId, startX: w.x, origX: x, wallLength: r.wall.lengthMm }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const paint = paintRef.current
    if (paint) {
      // walk the path since the last event in small steps, so a quick
      // swipe still catches every board it crosses
      const { x: x1, y: y1 } = paint.last
      const steps = Math.max(1, Math.ceil(Math.hypot(e.clientX - x1, e.clientY - y1) / 3))
      for (let i = 1; i <= steps; i++) {
        const key = boardAt(x1 + ((e.clientX - x1) * i) / steps, y1 + ((e.clientY - y1) * i) / steps)
        if (key && !paint.done.has(key)) {
          paint.done.add(key)
          const [wallId, ci, pi] = key.split("|")
          onSkip?.(wallId, Number(ci), Number(pi), paint.skip)
        }
      }
      paint.last = { x: e.clientX, y: e.clientY }
      return
    }
    const cd = cornerDragRef.current
    if (cd) {
      const w = toWorld(e.clientX, e.clientY)
      if (!w) return
      const x = Math.max(SNAP_MM * 10, Math.min(cd.wallLength - SNAP_MM * 10, snap(cd.origX + w.x - cd.startX)))
      if (cornerPreviewRef.current?.x !== x) setCornerPreview({ wallId: cd.wallId, cornerId: cd.cornerId, x })
      return
    }
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
    if (paintRef.current) {
      paintRef.current = null
      return
    }
    const cd = cornerDragRef.current
    if (cd) {
      cornerDragRef.current = null
      const p = cornerPreviewRef.current
      if (p) onCornerMove?.(p.wallId, p.cornerId, p.x)
      setCornerPreview(null)
      return
    }
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
      onLostPointerCapture={() => (dragRef.current || cornerDragRef.current || paintRef.current) && endDrag()}
    >
      <defs>
        <pattern id="wb-skip-hatch" patternUnits="userSpaceOnUse" width={font * 0.35} height={font * 0.35} patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={font * 0.35} className={styles.skipHatch} strokeWidth={stroke * 1.5} />
        </pattern>
      </defs>
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
            className={r.wall.id === activeWallId ? styles.active : undefined}
          >
            <defs>
              <clipPath id={clipId}>
                <polygon points={outline} />
              </clipPath>
            </defs>
            <polygon
              points={outline}
              className={`${styles.wall} ${onSelectWall ? styles.clickable : ""}`}
              onClick={() => onSelectWall?.(r.wall.id)}
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
              {/* boards left out of the order: hatched, still in place */}
              {r.courses.flatMap((c) =>
                c.pieces
                  .filter((p) => p.skipped)
                  .map((p) => (
                    <g key={`k${c.index}-${p.start}`} className={styles.skipped}>
                      <rect x={x0 + p.start} y={-c.top} width={p.end - p.start} height={c.top - c.bottom} />
                      <rect
                        x={x0 + p.start}
                        y={-c.top}
                        width={p.end - p.start}
                        height={c.top - c.bottom}
                        fill="url(#wb-skip-hatch)"
                      />
                    </g>
                  )),
              )}
              {/* row numbers at the start of each course, and every board's
                  label ("3a") — with its length and stock board on request */}
              {(() => {
                const ts = Math.min(font * 0.55, r.coverMm * 0.62)
                const charW = ts * 0.58
                const code = wallCodes?.get(r.wall.id) ?? ""
                return r.courses.map((c) => {
                  const y = -(c.bottom + c.top) / 2
                  const rowX = x0 + (c.runs[0]?.start ?? 0) + ts * 0.25
                  const rowEnd = rowX + String(c.index).length * charW + ts * 0.3
                  return (
                    <g key={`l${c.index}`} className={styles.boardLabels}>
                      <text x={rowX} y={y} fontSize={ts} dominantBaseline="central" className={styles.rowLabel}>
                        {c.index}
                      </text>
                      {c.pieces.map((p, i) => {
                        const label = boardLabel(c.index, i)
                        const len = Math.ceil(p.cutLength - 1e-6)
                        const stock = stockBoardOf?.get(boardId(code, c.index, i))
                        const long = `${label} ${len}${stock ? ` #${stock}` : ""}`
                        // centred on the board, clear of the row number for the first one
                        const mid = (p.start + p.end) / 2
                        const room = i === 0 ? Math.min(p.end - p.start, 2 * (mid - (rowEnd - x0))) : p.end - p.start
                        const fits = (t: string) => t.length * charW + ts * 0.4 < room
                        const text = showLengths && fits(long) ? long : fits(label) ? label : null
                        if (!text) return null
                        return (
                          <text
                            key={i}
                            x={x0 + mid}
                            y={y}
                            fontSize={ts}
                            textAnchor="middle"
                            dominantBaseline="central"
                            className={styles.boardLabel}
                          >
                            {text}
                          </text>
                        )
                      })}
                    </g>
                  )
                })
              })()}
              {(r.wall.corners ?? [])
                .filter((c) => c.x > 0 && c.x < L)
                .map((c) =>
                  c.type === "external" ? (
                    <rect key={c.id} x={x0 + c.x - fw} y={-r.maxY} width={fw * 2} height={r.maxY - r.minY} className={styles.facing} />
                  ) : (
                    <rect
                      key={c.id}
                      x={x0 + c.x - Math.max(fw / 4, stroke * 2)}
                      y={-r.maxY}
                      width={Math.max(fw / 2, stroke * 4)}
                      height={r.maxY - r.minY}
                      className={styles.scriber}
                    />
                  ),
                )}
            </g>
            <polygon points={outline} className={styles.outline} strokeWidth={stroke * 2} />
            {/* corner grab strips — under the openings so those still win */}
            {(r.wall.corners ?? [])
              .filter((c) => c.x > 0 && c.x < L)
              .map((c) => (
                <g key={c.id}>
                  <line
                    x1={x0 + c.x}
                    x2={x0 + c.x}
                    y1={-r.maxY - font * 0.3}
                    y2={-r.minY}
                    className={c.type === "external" ? styles.cornerExternal : styles.cornerInternal}
                    strokeWidth={stroke * 2}
                    strokeDasharray={`${font * 0.3} ${font * 0.2}`}
                  />
                  <text x={x0 + c.x} y={-r.maxY - font * 0.45} fontSize={font * 0.6} textAnchor="middle" className={styles.cornerLabel}>
                    {c.type === "external" ? "ext" : "int"} {Math.round(c.x)}
                  </text>
                  <rect
                    x={x0 + c.x - font * 0.4}
                    y={-r.maxY}
                    width={font * 0.8}
                    height={r.maxY - r.minY}
                    className={styles.cornerGrab}
                    data-draggable
                    onPointerDown={(e) => startCornerDrag(e, r, c.id, c.x)}
                  />
                </g>
              ))}

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
                  <rect
                    x={ox - fw}
                    y={oy - fw}
                    width={o.width + fw * 2}
                    height={o.height + fw}
                    className={`${styles.facing} ${o.skipParts?.facings ? styles.trimSkipped : ""}`}
                  />
                  {o.skipParts?.facings && (
                    <rect x={ox - fw} y={oy - fw} width={o.width + fw * 2} height={o.height + fw} fill="url(#wb-skip-hatch)" pointerEvents="none" />
                  )}
                  <line
                    x1={ox - fw - lap}
                    x2={ox + o.width + fw + lap}
                    y1={oy - fw}
                    y2={oy - fw}
                    className={`${styles.flashing} ${o.skipParts?.flashing ? styles.flashingSkipped : ""}`}
                    strokeWidth={stroke * 3}
                    strokeDasharray={o.skipParts?.flashing ? `${font * 0.25} ${font * 0.2}` : undefined}
                  />
                  <rect
                    x={ox}
                    y={oy}
                    width={o.width}
                    height={o.height}
                    className={`${styles.opening} ${selected ? styles.openingSelected : ""}`}
                    strokeWidth={stroke * 2}
                    data-draggable
                    onPointerDown={(e) => startDrag(e, r, o, "move")}
                  />
                  {o.skipParts && (
                    <text
                      x={ox + o.width / 2}
                      y={oy + o.height - font * 0.35}
                      fontSize={Math.min(font * 0.55, o.width / 7)}
                      textAnchor="middle"
                      className={styles.joinerySkippedNote}
                    >
                      {o.skipParts.facings && o.skipParts.scribers && o.skipParts.flashing ? "trims skipped" : "some trims skipped"}
                    </text>
                  )}
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

            {(() => {
              const editable = !!onEditMeasure && !skipMode
              const click = (key: string) => (e: React.MouseEvent<SVGTextElement>) => {
                if (!editable) return
                e.stopPropagation()
                onEditMeasure?.(key, e.currentTarget.getBoundingClientRect())
              }
              const tick = font * 0.3
              const w = dimText(r.wall.id, "width", L)
              const hl = dimText(r.wall.id, "heightL", r.wall.top.left)
              const hr = dimText(r.wall.id, "heightR", r.wall.top.right)
              const lx = x0 - font * 0.55
              const rx = x0 + L + font * 0.55
              const bl = bottom[0].y
              const br = bottom[bottom.length - 1].y
              return (
                <g className={styles.dims} strokeWidth={stroke}>
                  {/* width, under the wall */}
                  <line x1={x0} x2={x0} y1={-bl + tick} y2={dimY + tick} className={styles.dimExt} />
                  <line x1={x0 + L} x2={x0 + L} y1={-br + tick} y2={dimY + tick} className={styles.dimExt} />
                  <line x1={x0} x2={x0 + L} y1={dimY} y2={dimY} className={styles.dimLine} />
                  <text
                    x={x0 + L / 2}
                    y={dimY + font * 1.05}
                    fontSize={font * 0.8}
                    textAnchor="middle"
                    className={dimClass(w, editable)}
                    onClick={click(w.key)}
                  >
                    {w.text}
                  </text>
                  {/* height at each end, datum to top */}
                  {(
                    [
                      [hl, lx, bl, r.wall.top.left, -1],
                      [hr, rx, br, r.wall.top.right, 1],
                    ] as const
                  ).map(([d, x, y0, y1, dir]) => (
                    <g key={d.key}>
                      <line x1={x} x2={x} y1={-y0} y2={-y1} className={styles.dimLine} />
                      <line x1={x - tick} x2={x + tick} y1={-y1} y2={-y1} className={styles.dimLine} />
                      <line x1={x - tick} x2={x + tick} y1={-y0} y2={-y0} className={styles.dimLine} />
                      <text
                        x={x + dir * font * 0.45}
                        y={-(y0 + y1) / 2}
                        fontSize={font * 0.8}
                        textAnchor="middle"
                        transform={`rotate(-90 ${x + dir * font * 0.45} ${-(y0 + y1) / 2})`}
                        dominantBaseline={dir < 0 ? "auto" : "hanging"}
                        className={dimClass(d, editable)}
                        onClick={click(d.key)}
                      >
                        {d.text}
                      </text>
                    </g>
                  ))}
                  {/* each top break point: ridge, or where a rake starts */}
                  {r.wall.top.breaks
                    .filter((b) => b.x > 0 && b.x < L)
                    .map((b) => {
                      const d = dimText(r.wall.id, `break:${b.id}`, b.y)
                      return (
                        <g key={b.id}>
                          <circle cx={x0 + b.x} cy={-b.y} r={font * 0.14} className={styles.dimPoint} />
                          <text
                            x={x0 + b.x}
                            y={-b.y - font * 0.4}
                            fontSize={font * 0.8}
                            textAnchor="middle"
                            className={dimClass(d, editable)}
                            onClick={click(d.key)}
                          >
                            {d.text}
                          </text>
                        </g>
                      )
                    })}
                </g>
              )
            })()}

            <text x={x0 + L / 2} y={dimY + font * 2.3} fontSize={font} className={styles.label} textAnchor="middle">
              {wallCodes?.get(r.wall.id) ? `${wallCodes.get(r.wall.id)} · ` : ""}
              {r.wall.name || "Wall"}
            </text>
            <text x={x0 + L / 2} y={dimY + font * 3.3} fontSize={font * 0.75} className={styles.dim} textAnchor="middle">
              {r.courses.length} courses
            </text>

            {/* skip mode: every board becomes a tap target, above everything else */}
            {skipMode &&
              r.courses.flatMap((c) =>
                c.pieces.map((p, i) => {
                  const key = `${r.wall.id}|${c.index}|${i}`
                  return (
                    <rect
                      key={`hit${key}`}
                      x={x0 + p.start}
                      y={-c.top}
                      width={p.end - p.start}
                      height={c.top - c.bottom}
                      className={styles.skipTarget}
                      data-skip={key}
                      data-draggable
                      onPointerDown={(e) => startPaint(e, key, !!p.skipped)}
                    />
                  )
                }),
              )}
            {/* …and each window or door, above the boards, opens its trims */}
            {skipMode &&
              (r.wall.openings ?? []).map((o) => (
                <rect
                  key={`jt${o.id}`}
                  x={x0 + o.x - fw}
                  y={-(o.sill + o.height) - fw}
                  width={o.width + fw * 2}
                  height={o.height + fw}
                  className={styles.joineryTarget}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                  }}
                  onClick={() => onJoineryTap?.(r.wall.id, o.id)}
                />
              ))}
          </g>
        )
      })}
    </svg>
  )
}

export default ElevationDiagram
