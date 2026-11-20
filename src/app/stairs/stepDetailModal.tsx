"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Modal } from "@/app/elements/Modal/modal"
import { calculateStairs, RiserRip, StairInput } from "@/components/stairs/stairs"
import DraftNumberInput from "./draftNumberInput"
import pile from "../retaining-walls/pileSetupModal.module.scss"
import styles from "./stepDetailModal.module.scss"

type Handle = "nosing" | "run"

/** depth of the framing drawn under each tread (a wedge block, a joist…) */
const FRAMING_MM = 70
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const mmText = (v: number) => `${Math.round(v)}`

/** The step detail: one step of the stair in cross-section, to scale —
 * the tread below, the riser, the tread above and the next riser — with
 * every decking board as it's laid, ripped ones picked out. Drag the
 * front of the tread for the nosing, or the next riser for the run, or
 * type the numbers: board size and gap, and boards on the risers (their
 * gap, and whether the ripped one goes at the top or the bottom).
 * Every change goes straight onto the stair, and saves with it; Undo
 * changes puts it back as it was when this was opened. The rise isn't set here: it's the total rise over the
 * risers. */
const StepDetailModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  value: StairInput
  /** every change, as it's made: the stair saves as usual */
  onChange: (next: StairInput) => void
  /** the most a step's run can be (so the stair stays within its cap) */
  maxRun: number
}> = ({ isOpen, onClose, value, onChange, maxRun }) => {
  const draft = value
  const [dragging, setDragging] = useState<Handle | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // the stair as it was when this was opened, to undo back to
  const valueRef = useRef(value)
  valueRef.current = value
  const [opened, setOpened] = useState<StairInput | null>(null)
  useEffect(() => {
    if (isOpen) setOpened(valueRef.current)
  }, [isOpen])
  // the latest stair, so a fast drag builds on the last change, not the
  // stair as it was at this render
  const live = useRef(value)
  live.current = value

  const r = useMemo(() => calculateStairs(draft), [draft])
  const set = <K extends keyof StairInput>(key: K, v: StairInput[K]) => {
    if (live.current[key] === v) return
    live.current = { ...live.current, [key]: v }
    onChange(live.current)
  }
  const changed = opened !== null && JSON.stringify(opened) !== JSON.stringify(value)

  const R = r.rise
  const G = r.going
  const t = draft.boardThickness
  const riserT = draft.riserBoards ? t : 0
  const nosing = r.nosing

  // the drawing, in mm: x along the stair from the riser face (0), z up
  // from the top of the tread below; the svg's y is −z
  const x0 = -G - riserT - nosing - 60
  const x1 = G + Math.max(140, G * 0.45)
  const z0 = -t - FRAMING_MM - 50
  const z1 = 2 * R + 60
  const vb = { x: x0, y: -z1, w: x1 - x0, h: z1 - z0 }
  const unit = vb.w / 100
  const font = unit * 3.2

  /** one tread's boards, its riser face at `face`, its top at `top` */
  const tread = (key: string, face: number, top: number, ghost = false) => {
    const front = face - riserT - nosing
    return (
      <g key={key} className={ghost ? styles.ghost : undefined}>
        <rect x={face} y={-(top - t)} width={G} height={FRAMING_MM} className={styles.framing} strokeWidth={unit * 0.25} />
        {r.treadBoards.map((b) => (
          <rect
            key={b.offset}
            x={front + b.offset}
            y={-top}
            width={b.width}
            height={t}
            className={b.ripped ? styles.boardRipped : styles.board}
            strokeWidth={unit * 0.25}
          />
        ))}
      </g>
    )
  }
  /** one riser's boards, in front of the riser face at `face`, from `base` up */
  const riser = (key: string, face: number, base: number, ghost = false) =>
    draft.riserBoards && (
      <g key={key} className={ghost ? styles.ghost : undefined}>
        {r.riserBoardPieces.map((b) => (
          <rect
            key={b.offset}
            x={face - t}
            y={-(base + b.offset + b.width)}
            width={t}
            height={b.width}
            className={b.ripped ? styles.boardRipped : styles.board}
            strokeWidth={unit * 0.25}
          />
        ))}
      </g>
    )

  const toSvg = (e: React.PointerEvent) => {
    const ctm = svgRef.current?.getScreenCTM()
    if (!ctm) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: p.x, z: -p.y }
  }
  const onMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const p = toSvg(e)
    if (!p) return
    if (dragging === "nosing") set("nosing", clamp(Math.round(-p.x - riserT), 0, 60))
    else set("going", clamp(Math.round(p.x / 5) * 5, 150, maxRun))
  }
  const handleProps = (h: Handle) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      setDragging(h)
    },
    className: `${pile.handle} ${dragging === h ? pile.handleActive : ""}`,
    role: "slider",
    tabIndex: 0,
  })

  /** a dimension line, horizontal (z fixed) or vertical (x fixed) */
  const hDim = (xa: number, xb: number, z: number, text: string) =>
    xb - xa > 0.5 && (
      <g>
        <line x1={xa} x2={xb} y1={-z} y2={-z} className={pile.dim} strokeWidth={unit * 0.3} />
        <line x1={xa} x2={xa} y1={-z - unit} y2={-z + unit} className={pile.dim} strokeWidth={unit * 0.3} />
        <line x1={xb} x2={xb} y1={-z - unit} y2={-z + unit} className={pile.dim} strokeWidth={unit * 0.3} />
        <text x={(xa + xb) / 2} y={-z - unit * 1.5} fontSize={font * 0.85} textAnchor="middle" className={pile.dimText}>
          {text}
        </text>
      </g>
    )
  const vDim = (x: number, za: number, zb: number, text: string) =>
    zb - za > 0.5 && (
      <g>
        <line x1={x} x2={x} y1={-za} y2={-zb} className={pile.dim} strokeWidth={unit * 0.3} />
        <line x1={x - unit} x2={x + unit} y1={-za} y2={-za} className={pile.dim} strokeWidth={unit * 0.3} />
        <line x1={x - unit} x2={x + unit} y1={-zb} y2={-zb} className={pile.dim} strokeWidth={unit * 0.3} />
        <text x={x + unit * 1.5} y={-(za + zb) / 2} fontSize={font * 0.85} dominantBaseline="central" className={pile.dimText}>
          {text}
        </text>
      </g>
    )

  const numberRow = (label: string, val: number, step: number, min: number, max: number, onValue: (v: number) => void, extra?: React.ReactNode, hint?: string) => (
    <div className={pile.row}>
      <label>
        <span className={pile.rowLabel}>{label}</span>
        <span className={pile.inputWrap}>
          <DraftNumberInput value={val} step={step} min={min} max={max} onValue={onValue} />
          mm
        </span>
      </label>
      {extra}
      {hint && <span className={pile.rowHint}>{hint}</span>}
    </div>
  )
  const boardsText = (list: { width: number; ripped: boolean }[]) => list.map((b) => (b.ripped ? `${mmText(b.width)} rip` : mmText(b.width))).join(" + ")

  const frontX = -riserT - nosing
  return (
    <Modal isActive={isOpen} closeModal={onClose}>
      <div className={pile.content}>
        <div className={pile.header}>
          <h2>Step detail</h2>
          <button type="button" className={pile.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className={pile.note}>
          One step in cross-section, to scale. Drag the blue handles — the front of the tread for the nosing, the next
          riser for the run — or type the numbers. Changes go straight onto the stair; every step is built the same.
        </p>

        <div className={styles.layout}>
          <div>
            <svg
              ref={svgRef}
              viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
              className={pile.svg}
              onPointerMove={onMove}
              onPointerUp={() => setDragging(null)}
              onPointerCancel={() => setDragging(null)}
              role="img"
              aria-label="Cross-section of one step"
            >
              {tread("below", -G, 0)}
              {riser("riser", 0, 0)}
              {tread("above", 0, R)}
              {riser("nextRiser", G, R, true)}
              {tread("nextTread", G, 2 * R, true)}

              {hDim(0, G, R + unit * 6, `run ${mmText(G)}`)}
              {hDim(frontX, -riserT, R + unit * 6, `${mmText(nosing)}`)}
              {vDim(G + unit * 3, R, 2 * R, `rise ${mmText(R)}`)}
              {hDim(frontX, frontX + r.treadDepth, R - t - FRAMING_MM - unit * 5, `tread ${mmText(r.treadDepth)}`)}

              {/* drag handles */}
              <g {...handleProps("nosing")} aria-label="Nosing overhang" aria-valuenow={Math.round(nosing)}>
                <line x1={frontX} x2={frontX} y1={-(R - t - unit * 2)} y2={-(R + unit * 3)} strokeWidth={unit * 0.9} />
                <circle cx={frontX} cy={-(R - t / 2)} r={unit * 1.6} />
                <rect x={frontX - unit * 3} y={-(R + unit * 4)} width={unit * 6} height={t + unit * 7} className={pile.hit} />
              </g>
              <g {...handleProps("run")} aria-label="Run of each step" aria-valuenow={Math.round(G)}>
                <line x1={G} x2={G} y1={-(R - t - FRAMING_MM)} y2={-(R + unit * 3)} strokeWidth={unit * 0.9} />
                <circle cx={G} cy={-(R - t - FRAMING_MM / 2)} r={unit * 1.6} />
                <rect x={G - unit * 3} y={-(R + unit * 4)} width={unit * 6} height={t + FRAMING_MM + unit * 4} className={pile.hit} />
              </g>
            </svg>
            <div className={styles.legend}>
              <span>
                <i className={styles.swatchBoard} /> Decking board
              </span>
              <span>
                <i className={styles.swatchRipped} /> Ripped board
              </span>
              <span>
                <i className={styles.swatchFraming} /> Framing
              </span>
              <span>
                <i className={styles.swatchHandle} /> Drag to change
              </span>
            </div>
          </div>

          <div className={styles.fields}>
            {numberRow("Run (each step)", Math.round(draft.going), 5, 150, maxRun, (v) => set("going", v))}
            {numberRow(
              "Nosing overhang",
              Math.round(nosing),
              1,
              0,
              60,
              (v) => set("nosing", v),
              <button type="button" className={draft.nosing === null ? pile.autoOn : pile.autoBtn} onClick={() => set("nosing", null)} disabled={draft.nosing === null}>
                {draft.nosing === null ? "Auto" : "Back to auto"}
              </button>,
              draft.nosing === null ? "Auto: whole boards cover each tread, where that gives a sensible overhang." : undefined,
            )}
            {numberRow("Board width", draft.boardWidth, 5, 40, 300, (v) => set("boardWidth", v))}
            {numberRow("Board thickness", draft.boardThickness, 1, 10, 50, (v) => set("boardThickness", v))}
            {numberRow("Gap between tread boards", draft.boardGap, 1, 0, 15, (v) => set("boardGap", v))}

            <label className={`${pile.check} ${styles.wide}`}>
              <input type="checkbox" checked={draft.riserBoards} onChange={(e) => set("riserBoards", e.target.checked)} />
              Decking boards on the risers
            </label>
            {draft.riserBoards && (
              <>
                {numberRow("Gap between riser boards", draft.riserBoardGap, 1, 0, 50, (v) => set("riserBoardGap", v), undefined, "0 for boards tight together.")}
                <div className={pile.row}>
                  <label>
                    <span className={pile.rowLabel}>Ripped riser board</span>
                    <select id="riserRip" className={styles.select} value={draft.riserRip} onChange={(e) => set("riserRip", e.target.value as RiserRip)}>
                      <option value="top">At the top, under the tread</option>
                      <option value="bottom">At the bottom, on the tread below</option>
                    </select>
                  </label>
                </div>
              </>
            )}

            <dl className={`${pile.figures} ${styles.wide}`}>
              <div>
                <dt>Rise</dt>
                <dd>{mmText(R)} mm</dd>
              </div>
              <div>
                <dt>Per tread</dt>
                <dd>{boardsText(r.treadBoards)}</dd>
              </div>
              {draft.riserBoards && (
                <div>
                  <dt>Per riser</dt>
                  <dd>{boardsText(r.riserBoardPieces)}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        <div className={pile.footer}>
          <button type="button" className={pile.cancel} onClick={() => opened && onChange(opened)} disabled={!changed}>
            Undo changes
          </button>
          <button type="button" className={pile.apply} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default StepDetailModal
