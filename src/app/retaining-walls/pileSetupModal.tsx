"use client"

import { useEffect, useRef, useState } from "react"
import { Modal } from "@/app/elements/Modal/modal"
import { isRoundPost, POST_SIZE_OPTIONS, postWidthM } from "@/components/retainingWall/calcSettings"
import { holeConcreteM3 } from "@/components/retainingWall/postProfile"
import styles from "./pileSetupModal.module.scss"

/** The project's standard pile, as edited here. null = worked out (Auto). */
export interface PileSetup {
  postSize: string | null
  /** mm */
  holeDepthMm: number | null
  /** mm */
  augerMm: number | null
  /** mm, the gravel base pad (part of the calculation settings) */
  gravelPadMm: number
  /** mm, gap left under the post, filled with concrete */
  standoffMm: number
}

type Handle = "depth" | "diameter" | "gravel" | "standoff"

const ABOVE_GROUND_MM = 350
/** the pad's thickness when it's switched on and hadn't been set before */
const DEFAULT_GRAVEL_PAD_MM = 100
const snap = (v: number, to: number) => Math.round(v / to) * to
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Sets up the standard pile for the project in a cross-section of one
 * hole, to scale: drag the hole's floor for its depth, its side for the
 * auger, the top of the gravel pad, and the bottom of the post to stand
 * it off the pad (the gap is filled with concrete, so it adds to the
 * concrete). Each value can be typed instead, and depth, auger and post
 * size can go back to Auto (worked out per post). Nothing changes on the
 * wall until Apply. */
const PileSetupModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  value: PileSetup
  /** what Auto works out to for the pile drawn (the wall's tallest) */
  auto: { postSize: string; holeDepthMm: number; holeDepthRangeMm: [number, number]; augerMm: number }
  onApply: (next: PileSetup) => void
  /** m³, the whole wall's concrete with these settings */
  previewTotalM3: (setup: PileSetup) => number
}> = ({ isOpen, onClose, value, auto, onApply, previewTotalM3 }) => {
  const [draft, setDraft] = useState<PileSetup>(value)
  const [dragging, setDragging] = useState<Handle | null>(null)
  // the thickness to go back to when the pad is ticked on again
  const lastGravel = useRef(value.gravelPadMm || DEFAULT_GRAVEL_PAD_MM)
  const svgRef = useRef<SVGSVGElement>(null)

  // start from the wall's current setup each time it's opened (not on
  // every render while open, which would throw away what's being dragged)
  const valueRef = useRef(value)
  valueRef.current = value
  useEffect(() => {
    if (isOpen) setDraft(valueRef.current)
  }, [isOpen])

  // Auto depths include the gravel pad, so they move with it
  const gravelShift = draft.gravelPadMm - value.gravelPadMm
  const autoDepth = auto.holeDepthMm + gravelShift
  const autoRange: [number, number] = [auto.holeDepthRangeMm[0] + gravelShift, auto.holeDepthRangeMm[1] + gravelShift]

  const postSize = draft.postSize ?? auto.postSize
  const postW = postWidthM(postSize) * 1000
  const depth = draft.holeDepthMm ?? autoDepth
  const dia = draft.augerMm ?? auto.augerMm
  const gravel = draft.gravelPadMm
  const hasGravel = gravel > 0
  const standoff = draft.standoffMm
  const postBottom = Math.max(0, depth - gravel - standoff) // mm below ground
  const concreteDepth = Math.max(0, depth - gravel)
  const holeConcrete = holeConcreteM3(dia / 1000, depth / 1000, gravel / 1000, standoff / 1000, postSize)
  const total = previewTotalM3(draft)

  // the drawing, in mm: x across the hole, y down from ground level
  const halfW = Math.max(dia, 400) * 1.1
  // the hole sits off to the right, leaving the left for the dimensions
  // and their labels; on the right just a little soil past the hole's side
  const rightRoom = dia / 2 + 250
  const vb = { x: -halfW - 700, y: -ABOVE_GROUND_MM - 60, w: halfW + 700 + rightRoom, h: ABOVE_GROUND_MM + 60 + depth + 200 }
  const unit = vb.w / 100 // a "pixel" at this scale, for strokes and text
  const font = unit * 3.4

  const toSvg = (e: React.PointerEvent) => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: pt.x, y: pt.y }
  }

  const onMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const p = toSvg(e)
    if (!p) return
    setDraft((d) => {
      const dDepth = d.holeDepthMm ?? auto.holeDepthMm + (d.gravelPadMm - value.gravelPadMm)
      switch (dragging) {
        case "depth":
          return { ...d, holeDepthMm: clamp(snap(p.y, 50), d.gravelPadMm + d.standoffMm + 200, 4000) }
        case "diameter":
          return { ...d, augerMm: clamp(snap(Math.abs(p.x) * 2, 25), Math.ceil((postW * (isRoundPost(postSize) ? 1 : Math.SQRT2)) / 25) * 25, 1200) }
        case "gravel":
          // dragged right down it stays a thin pad; untick it to have none
          return { ...d, gravelPadMm: clamp(snap(dDepth - p.y, 10), 10, dDepth - d.standoffMm - 200) }
        case "standoff":
          return { ...d, standoffMm: clamp(snap(dDepth - d.gravelPadMm - p.y, 50), 0, dDepth - d.gravelPadMm - 200) }
      }
    })
  }

  const handleProps = (h: Handle) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      setDragging(h)
    },
    className: `${styles.handle} ${dragging === h ? styles.handleActive : ""}`,
    role: "slider",
    tabIndex: 0,
  })

  const numberRow = (label: string, val: number | null, autoVal: number | null, step: number, set: (v: number | null) => void, hint?: string) => (
    <div className={styles.row}>
      <label>
        <span className={styles.rowLabel}>{label}</span>
        <span className={styles.inputWrap}>
          <input
            type="number"
            inputMode="numeric"
            step={step}
            min={0}
            value={val ?? autoVal ?? 0}
            className={val === null ? styles.autoValue : undefined}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (e.target.value.trim() !== "" && n >= 0) set(Math.round(n))
            }}
          />
          mm
        </span>
      </label>
      {autoVal !== null && (
        <button type="button" className={val === null ? styles.autoOn : styles.autoBtn} onClick={() => set(null)} disabled={val === null}>
          {val === null ? "Auto" : "Back to auto"}
        </button>
      )}
      {hint && <span className={styles.rowHint}>{hint}</span>}
    </div>
  )

  return (
    <Modal isActive={isOpen} closeModal={onClose}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h2>Pile setup</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className={styles.note}>
          The standard pile for this project. Drag the blue handles on the drawing, or type the numbers. Auto values are worked
          out per post from the reference table; the drawing shows the wall&apos;s tallest post.
        </p>

        <div className={styles.layout}>
          <svg
            ref={svgRef}
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            className={styles.svg}
            onPointerMove={onMove}
            onPointerUp={() => setDragging(null)}
            onPointerCancel={() => setDragging(null)}
            role="img"
            aria-label="Cross-section of one pile hole"
          >
            {/* ground either side of the hole */}
            <rect x={vb.x} y={0} width={vb.w} height={vb.h} className={styles.soil} />
            <line x1={vb.x} x2={vb.x + vb.w} y1={0} y2={0} className={styles.groundLine} strokeWidth={unit * 0.5} />
            <text x={vb.x + unit * 2} y={-unit * 1.5} fontSize={font} className={styles.label}>
              ground
            </text>

            {/* the hole: gravel pad at the bottom, concrete above it */}
            {hasGravel && <rect x={-dia / 2} y={depth - gravel} width={dia} height={gravel} className={styles.gravel} />}
            <rect x={-dia / 2} y={0} width={dia} height={concreteDepth} className={styles.concrete} />
            {/* the post: above ground, then down into the hole, short of the pad by the stand-off */}
            <rect x={-postW / 2} y={-ABOVE_GROUND_MM} width={postW} height={ABOVE_GROUND_MM + postBottom} className={styles.post} />
            {standoff > 0 && (
              <text x={0} y={postBottom + standoff / 2} fontSize={font * 0.8} textAnchor="middle" dominantBaseline="central" className={styles.inside}>
                concrete
              </text>
            )}

            {/* dimensions, just to the left of the hole: post, gap and gravel
                beside it, the overall depth a step further out */}
            {(() => {
              const x = -dia / 2 - unit * 2.5
              const dim = (y0: number, y1: number, text: string, off = 0) =>
                y1 - y0 > 0 && (
                  <g>
                    <line x1={x - off} x2={x - off} y1={y0} y2={y1} className={styles.dim} strokeWidth={unit * 0.3} />
                    <line x1={x - off - unit} x2={x - off + unit} y1={y0} y2={y0} className={styles.dim} strokeWidth={unit * 0.3} />
                    <line x1={x - off - unit} x2={x - off + unit} y1={y1} y2={y1} className={styles.dim} strokeWidth={unit * 0.3} />
                    <text x={x - off - unit * 1.5} y={(y0 + y1) / 2} fontSize={font * 0.85} textAnchor="end" dominantBaseline="central" className={styles.dimText}>
                      {text}
                    </text>
                  </g>
                )
              return (
                <>
                  {dim(0, depth, `${depth}`, unit * 22)}
                  {dim(0, postBottom, `post ${postBottom}`)}
                  {dim(postBottom, postBottom + standoff, `gap ${standoff}`)}
                  {dim(depth - gravel, depth, `gravel ${gravel}`)}
                </>
              )
            })()}
            <text x={0} y={depth + unit * 6} fontSize={font * 0.9} textAnchor="middle" className={styles.dimText}>
              Ø {dia}
            </text>

            {/* drag handles */}
            <g {...handleProps("depth")} aria-label="Hole depth" aria-valuenow={depth}>
              <line x1={-dia / 2} x2={dia / 2} y1={depth} y2={depth} strokeWidth={unit * 1.1} />
              <rect x={-dia / 2 - unit * 3} y={depth - unit * 3} width={dia + unit * 6} height={unit * 6} className={styles.hit} />
            </g>
            <g {...handleProps("diameter")} aria-label="Hole diameter" aria-valuenow={dia}>
              <line x1={dia / 2} x2={dia / 2} y1={unit * 2} y2={concreteDepth - unit * 2} strokeWidth={unit * 1.1} />
              <rect x={dia / 2 - unit * 3} y={0} width={unit * 6} height={concreteDepth} className={styles.hit} />
            </g>
            {hasGravel && (
            <g {...handleProps("gravel")} aria-label="Gravel pad thickness" aria-valuenow={gravel}>
              <line x1={-dia / 2} x2={-postW / 2 - unit} y1={depth - gravel} y2={depth - gravel} strokeWidth={unit * 0.9} />
              <line x1={postW / 2 + unit} x2={dia / 2} y1={depth - gravel} y2={depth - gravel} strokeWidth={unit * 0.9} />
              <rect x={-dia / 2} y={depth - gravel - unit * 2.5} width={dia} height={unit * 5} className={styles.hit} />
            </g>
            )}
            <g {...handleProps("standoff")} aria-label="Gap under the post" aria-valuenow={standoff}>
              <line x1={-postW / 2} x2={postW / 2} y1={postBottom} y2={postBottom} strokeWidth={unit * 1.1} />
              <circle cx={0} cy={postBottom} r={unit * 1.8} />
              <rect x={-postW / 2 - unit * 2} y={postBottom - unit * 3} width={postW + unit * 4} height={unit * 6} className={styles.hit} />
            </g>
          </svg>

          <div className={styles.fields}>
            <div className={styles.row}>
              <label>
                <span className={styles.rowLabel}>Post size</span>
                <select value={draft.postSize ?? ""} onChange={(e) => setDraft((d) => ({ ...d, postSize: e.target.value || null }))}>
                  <option value="">Auto — {auto.postSize}</option>
                  {POST_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                  {draft.postSize && !POST_SIZE_OPTIONS.includes(draft.postSize) && <option value={draft.postSize}>{draft.postSize}</option>}
                </select>
              </label>
            </div>
            {numberRow(
              "Hole depth",
              draft.holeDepthMm,
              autoDepth,
              50,
              (v) => setDraft((d) => ({ ...d, holeDepthMm: v })),
              draft.holeDepthMm === null && autoRange[0] !== autoRange[1]
                ? `Auto varies by post: ${autoRange[0]}–${autoRange[1]} mm`
                : undefined,
            )}
            {numberRow("Hole Ø (auger)", draft.augerMm, auto.augerMm, 25, (v) => setDraft((d) => ({ ...d, augerMm: v })))}
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={hasGravel}
                onChange={(e) => {
                  if (!e.target.checked) lastGravel.current = draft.gravelPadMm || lastGravel.current
                  setDraft((d) => ({ ...d, gravelPadMm: e.target.checked ? lastGravel.current : 0 }))
                }}
              />
              Gravel pad in the bottom of the hole
            </label>
            {hasGravel && numberRow("Gravel pad", draft.gravelPadMm, null, 10, (v) => setDraft((d) => ({ ...d, gravelPadMm: v ?? 0 })))}
            {numberRow(
              "Gap under post",
              draft.standoffMm,
              null,
              50,
              (v) => setDraft((d) => ({ ...d, standoffMm: v ?? 0 })),
              "How far the post sits off the gravel pad. The gap fills with concrete.",
            )}

            <dl className={styles.figures}>
              <div>
                <dt>Concrete, this hole</dt>
                <dd>{holeConcrete.toFixed(3)} m³</dd>
              </div>
              <div>
                <dt>Concrete, whole wall</dt>
                <dd>{total.toFixed(3)} m³</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancel} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.apply}
            onClick={() => {
              onApply(draft)
              onClose()
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default PileSetupModal
