"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { BoardDirection, EdgeLabels, formatLength, rakeAngleDeg, rakeLength } from "./types"
import styles from "./deckShapeEditor.module.scss"

/** A bent double-headed arrow: one head pointing along the width, the other
 * along the length, bridged by a quarter-turn — reads as "rotate 90°"
 * rather than "slide back and forth" the way a straight ↔ would. */
const RotateIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M19 5 A14 14 0 0 0 5 19" />
    <path d="M16 8 L19 5 L22 8" />
    <path d="M8 16 L5 19 L8 22" />
  </svg>
)

type EdgeKey = "width" | "sideA" | "sideB" | "rake"
type EditField = "value" | "label" | "angle"
type EditTarget = { key: EdgeKey; field: EditField } | null

const Edge: React.FC<{
  keyName: EdgeKey
  value: number
  label: string
  leftPct: number
  topPct: number
  vertical?: boolean
  /** true for a value that's read-only text, not a tappable chip (a plain
   * calculated readout with nothing to invert it back from) */
  calculated?: boolean
  /** overrides the default mm/integer value editing with degrees (signed,
   * one decimal) — used only by the rake edge's angle */
  angle?: boolean
  /** small read-only line under the value, e.g. "= left side" or a
   * calculated length alongside an editable angle */
  caption?: string
  /** "Reset to auto" affordance — shown only when there's something to
   * reset (sideB has been unlinked from mirroring sideA) */
  onReset?: () => void
  editTarget: EditTarget
  draft: string
  setDraft: (s: string) => void
  onStart: (t: EditTarget, current: string) => void
  onCommit: () => void
  onCancel: () => void
}> = ({
  keyName,
  value,
  label,
  leftPct,
  topPct,
  vertical,
  calculated,
  angle,
  caption,
  onReset,
  editTarget,
  draft,
  setDraft,
  onStart,
  onCommit,
  onCancel,
}) => {
  const style = { left: `${leftPct}%`, top: `${topPct}%` }
  const valueField: EditField = angle ? "angle" : "value"
  const editingValue = editTarget?.key === keyName && editTarget.field === valueField
  const editingLabel = editTarget?.key === keyName && editTarget.field === "label"
  const inputRef = useRef<HTMLInputElement | null>(null)

  // focus + select once, when this chip starts being edited — not on every
  // keystroke. A ref callback (the previous approach) is a new function
  // identity every render, so React was detaching/reattaching it — and
  // therefore re-selecting the whole value — on every character typed,
  // which made each new key overwrite the entire input instead of editing it.
  useEffect(() => {
    if (editingValue || editingLabel) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editingValue, editingLabel])

  const inputProps = {
    ref: inputRef,
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
    onBlur: onCommit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault()
        onCommit()
      }
      if (e.key === "Escape") onCancel()
    },
  }

  if (editingValue) {
    return angle ? (
      <input
        className={styles.dimInput}
        style={style}
        type="number"
        inputMode="decimal"
        step={0.1}
        min={-89}
        max={89}
        aria-label={`${label} angle in degrees`}
        {...inputProps}
      />
    ) : (
      <input className={styles.dimInput} style={style} type="number" inputMode="numeric" min={1} aria-label={`${label} in millimetres`} {...inputProps} />
    )
  }
  if (editingLabel) {
    return <input className={styles.labelInput} style={style} type="text" maxLength={40} aria-label={`Name for this edge`} {...inputProps} />
  }
  const unit = angle ? "°" : "mm"
  const displayValue = angle ? value.toFixed(1) : value.toLocaleString()
  return (
    <div className={`${styles.dimChip} ${vertical ? styles.vertical : ""} ${calculated ? styles.calculated : ""}`} style={style}>
      {calculated ? (
        <span className={styles.dimValue}>
          {displayValue} <span className={styles.dimUnit}>{unit}</span>
        </span>
      ) : (
        <button type="button" className={styles.dimValueBtn} onClick={() => onStart({ key: keyName, field: valueField }, angle ? value.toFixed(1) : String(value))}>
          {displayValue} <span className={styles.dimUnit}>{unit}</span>
        </button>
      )}
      {caption && <span className={styles.dimCaption}>{caption}</span>}
      <button type="button" className={styles.dimLabelBtn} onClick={() => onStart({ key: keyName, field: "label" }, label)}>
        {label || "+ label"}
      </button>
      {onReset && (
        <button type="button" className={styles.resetBtn} onClick={onReset}>
          Reset to auto
        </button>
      )}
    </div>
  )
}

/** Visual editor for the deck's trapezoid shape: a to-scale outline with
 * each measurement shown as a tap-to-edit chip right on the edge it
 * describes (each with its own editable name, e.g. "House wall"). The
 * angled edge is set by degrees rather than length — its length is a
 * calculated readout instead, alongside it. sideB mirrors sideA until
 * deliberately overridden (by editing it directly, or by editing the
 * angle — an equivalent way of setting it). A rotate control flips which
 * way the boards run. */
const DeckShapeEditor: React.FC<{
  width: number
  sideA: number
  sideB: number
  sideBLinked: boolean
  boardDirection: BoardDirection
  edgeLabels: EdgeLabels
  onWidthChange: (n: number) => void
  onSideAChange: (n: number) => void
  onSideBChange: (n: number) => void
  onSideBReset: () => void
  onRakeAngleChange: (deg: number) => void
  onDirectionChange: (d: BoardDirection) => void
  onLabelChange: (key: keyof EdgeLabels, label: string) => void
}> = ({
  width,
  sideA,
  sideB,
  sideBLinked,
  boardDirection,
  edgeLabels,
  onWidthChange,
  onSideAChange,
  onSideBChange,
  onSideBReset,
  onRakeAngleChange,
  onDirectionChange,
  onLabelChange,
}) => {
  const intoRake = boardDirection !== "alongRake"
  const [editTarget, setEditTarget] = useState<EditTarget>(null)
  const [draft, setDraft] = useState("")

  const { viewBox, vbMinX, vbMinY, vbW, vbH, maxLen, strokeW } = useMemo(() => {
    const maxLen = Math.max(sideA, sideB, 1)
    const w = Math.max(width, 1)
    const scale = Math.max(maxLen, w)
    const padLeft = maxLen * 0.16
    const padRight = maxLen * 0.2
    const padTop = w * 0.3
    const padBottom = w * 0.42
    const vbMinX = -padLeft
    const vbMinY = -padTop
    const vbW = maxLen + padLeft + padRight
    const vbH = w + padTop + padBottom
    return { viewBox: `${vbMinX} ${vbMinY} ${vbW} ${vbH}`, vbMinX, vbMinY, vbW, vbH, maxLen, strokeW: scale * 0.006 }
  }, [width, sideA, sideB])

  const toPct = (x: number, y: number) => ({
    leftPct: ((x - vbMinX) / vbW) * 100,
    topPct: ((y - vbMinY) / vbH) * 100,
  })

  const sideAPos = toPct(sideA / 2, -width * 0.05)
  const sideBPos = toPct(sideB / 2, width * 1.08)
  const widthPos = toPct(-maxLen * 0.05, width / 2)
  const rakePos = toPct(Math.max(sideA, sideB) + maxLen * 0.12, width / 2)
  const rotatePos = toPct(maxLen * 0.5, width * 0.5)

  const startEdit = (target: EditTarget, current: string) => {
    setDraft(current)
    setEditTarget(target)
  }
  const cancelEdit = () => setEditTarget(null)
  const commitEdit = () => {
    if (!editTarget) return
    if (editTarget.field === "label") {
      onLabelChange(editTarget.key, draft.trim())
      setEditTarget(null)
      return
    }
    if (editTarget.field === "angle") {
      const deg = parseFloat(draft)
      if (!isNaN(deg)) onRakeAngleChange(deg)
      setEditTarget(null)
      return
    }
    const n = Math.round(parseFloat(draft))
    if (!isNaN(n) && n > 0) {
      if (editTarget.key === "width") onWidthChange(n)
      else if (editTarget.key === "sideA") onSideAChange(n)
      else if (editTarget.key === "sideB") onSideBChange(n)
    }
    setEditTarget(null)
  }

  // faint parallel lines previewing which way the boards will run
  const lineCount = 7
  const previewLines = Array.from({ length: lineCount }, (_, i) => (i + 1) / (lineCount + 1))

  const edgeProps = { editTarget, draft, setDraft, onStart: startEdit, onCommit: commitEdit, onCancel: cancelEdit }

  return (
    <div className={styles.editor}>
      <div className={styles.shapeWrap}>
        <svg viewBox={viewBox} className={styles.svg} role="img" aria-label="Deck shape, tap a measurement or label to edit it">
          <path d={`M0,0 L${sideA},0 L${sideB},${width} L0,${width} Z`} className={styles.outline} strokeWidth={strokeW * 1.6} />
          <line x1={sideA} y1={0} x2={sideB} y2={width} className={styles.rakeEdge} strokeWidth={strokeW * 1.6} />
          {intoRake
            ? previewLines.map((f) => (
                <line key={f} x1={f * maxLen} y1={0} x2={f * maxLen} y2={width} className={styles.previewLine} strokeWidth={strokeW} />
              ))
            : previewLines.map((f) => (
                <line key={f} x1={0} y1={f * width} x2={maxLen} y2={f * width} className={styles.previewLine} strokeWidth={strokeW} />
              ))}
        </svg>

        <button
          type="button"
          className={styles.rotateBtn}
          style={{ left: `${rotatePos.leftPct}%`, top: `${rotatePos.topPct}%` }}
          onClick={() => onDirectionChange(intoRake ? "alongRake" : "intoRake")}
          aria-label={`Boards currently run ${intoRake ? "into" : "along"} the rake — tap to rotate 90°`}
        >
          <RotateIcon className={intoRake ? undefined : styles.rotated} />
          <span className={styles.rotateLabel}>{intoRake ? "Into the rake" : "Along the rake"}</span>
        </button>

        <Edge keyName="sideA" value={sideA} label={edgeLabels.sideA} leftPct={sideAPos.leftPct} topPct={sideAPos.topPct} {...edgeProps} />
        <Edge
          keyName="sideB"
          value={sideB}
          label={edgeLabels.sideB}
          leftPct={sideBPos.leftPct}
          topPct={sideBPos.topPct}
          caption={sideBLinked ? "= left side" : undefined}
          onReset={sideBLinked ? undefined : onSideBReset}
          {...edgeProps}
        />
        <Edge keyName="width" value={width} label={edgeLabels.width} leftPct={widthPos.leftPct} topPct={widthPos.topPct} vertical {...edgeProps} />
        <Edge
          keyName="rake"
          value={rakeAngleDeg({ sideA, sideB, width })}
          label={edgeLabels.rake}
          leftPct={rakePos.leftPct}
          topPct={rakePos.topPct}
          vertical
          angle
          caption={`≈ ${formatLength(rakeLength({ sideA, sideB, width }))} run`}
          {...edgeProps}
        />
      </div>
      <p className={styles.hint}>
        Tap the angled edge to set its angle directly — the right side recalculates from it. Tap
        a name to relabel any edge.
      </p>
    </div>
  )
}

export default DeckShapeEditor
