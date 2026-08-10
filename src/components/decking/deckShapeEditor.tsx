"use client"

import { useMemo, useState } from "react"
import { BoardDirection } from "./types"
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

type DimKey = "width" | "sideA" | "sideB"

const Dim: React.FC<{
  keyName: DimKey
  value: number
  name: string
  leftPct: number
  topPct: number
  vertical?: boolean
  editing: DimKey | null
  draft: string
  setDraft: (s: string) => void
  onStart: (k: DimKey, v: number) => void
  onCommit: () => void
  onCancel: () => void
}> = ({ keyName, value, name, leftPct, topPct, vertical, editing, draft, setDraft, onStart, onCommit, onCancel }) => {
  const style = { left: `${leftPct}%`, top: `${topPct}%` }
  if (editing === keyName) {
    return (
      <input
        className={styles.dimInput}
        style={style}
        type="number"
        inputMode="numeric"
        min={1}
        value={draft}
        ref={(el) => {
          if (el) {
            el.focus()
            el.select()
          }
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            onCommit()
          }
          if (e.key === "Escape") onCancel()
        }}
        aria-label={`${name} in millimetres`}
      />
    )
  }
  return (
    <button
      type="button"
      className={`${styles.dimChip} ${vertical ? styles.vertical : ""}`}
      style={style}
      onClick={() => onStart(keyName, value)}
    >
      <span className={styles.dimValue}>{value.toLocaleString()}</span>
      <span className={styles.dimUnit}>mm</span>
      <span className={styles.dimName}>{name}</span>
    </button>
  )
}

/** Visual editor for the deck's trapezoid shape: a to-scale outline with the
 * three measurements shown as tap-to-edit chips right on the edge they
 * describe, and a rotate control that flips which way the boards run. */
const DeckShapeEditor: React.FC<{
  width: number
  sideA: number
  sideB: number
  boardDirection: BoardDirection
  onWidthChange: (n: number) => void
  onSideAChange: (n: number) => void
  onSideBChange: (n: number) => void
  onDirectionChange: (d: BoardDirection) => void
}> = ({ width, sideA, sideB, boardDirection, onWidthChange, onSideAChange, onSideBChange, onDirectionChange }) => {
  const intoRake = boardDirection !== "alongRake"
  const [editing, setEditing] = useState<DimKey | null>(null)
  const [draft, setDraft] = useState("")

  const { viewBox, vbMinX, vbMinY, vbW, vbH, maxLen, strokeW } = useMemo(() => {
    const maxLen = Math.max(sideA, sideB, 1)
    const w = Math.max(width, 1)
    const scale = Math.max(maxLen, w)
    const padLeft = maxLen * 0.16
    const padRight = maxLen * 0.1
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
  const rotatePos = toPct(maxLen * 0.52, width * 0.5)

  const startEdit = (key: DimKey, current: number) => {
    setDraft(String(current))
    setEditing(key)
  }
  const cancelEdit = () => setEditing(null)
  const commitEdit = () => {
    if (!editing) return
    const n = Math.round(parseFloat(draft))
    if (!isNaN(n) && n > 0) {
      if (editing === "width") onWidthChange(n)
      else if (editing === "sideA") onSideAChange(n)
      else onSideBChange(n)
    }
    setEditing(null)
  }

  // faint parallel lines previewing which way the boards will run
  const lineCount = 7
  const previewLines = Array.from({ length: lineCount }, (_, i) => (i + 1) / (lineCount + 1))

  return (
    <div className={styles.editor}>
      <div className={styles.shapeWrap}>
        <svg viewBox={viewBox} className={styles.svg} role="img" aria-label="Deck shape, tap a measurement to edit it">
          <path d={`M0,0 L${sideA},0 L${sideB},${width} L0,${width} Z`} className={styles.outline} strokeWidth={strokeW * 1.6} />
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

        <Dim
          keyName="sideA"
          value={sideA}
          name="square end"
          leftPct={sideAPos.leftPct}
          topPct={sideAPos.topPct}
          editing={editing}
          draft={draft}
          setDraft={setDraft}
          onStart={startEdit}
          onCommit={commitEdit}
          onCancel={cancelEdit}
        />
        <Dim
          keyName="sideB"
          value={sideB}
          name="raked end"
          leftPct={sideBPos.leftPct}
          topPct={sideBPos.topPct}
          editing={editing}
          draft={draft}
          setDraft={setDraft}
          onStart={startEdit}
          onCommit={commitEdit}
          onCancel={cancelEdit}
        />
        <Dim
          keyName="width"
          value={width}
          name="width"
          leftPct={widthPos.leftPct}
          topPct={widthPos.topPct}
          vertical
          editing={editing}
          draft={draft}
          setDraft={setDraft}
          onStart={startEdit}
          onCommit={commitEdit}
          onCancel={cancelEdit}
        />
      </div>
    </div>
  )
}

export default DeckShapeEditor
