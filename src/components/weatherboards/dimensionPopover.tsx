"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Measure, describe } from "./measures"
import styles from "./dimensionPopover.module.scss"

/** Opens beside a clicked dimension: type a new value (Enter saves, Esc
 * closes) and switch its link on or off. Turning the link on opens the
 * picker; editing a linked value edits its anchor, so the note says how
 * many other dimensions will move with it. */
const DimensionPopover: React.FC<{
  measure: Measure
  /** the anchor it's linked to, if it is */
  anchor: Measure | null
  /** how many dimensions link to this one (it's an anchor) */
  dependents: number
  /** how many move along with an edit, besides this one */
  groupSize: number
  at: DOMRect
  onCommit: (value: number) => void
  onLink: () => void
  onUnlink: () => void
  onClose: () => void
}> = ({ measure, anchor, dependents, groupSize, at, onCommit, onLink, onUnlink, onClose }) => {
  const [text, setText] = useState(String(Math.round(measure.value)))
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("pointerdown", onDown, true)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  const commit = () => {
    const n = Number(text)
    if (text.trim() !== "" && Number.isFinite(n) && n > 0) onCommit(Math.round(n))
    onClose()
  }

  // sit under the clicked label, kept on screen
  const width = 280
  const left = Math.min(Math.max(8, at.left + at.width / 2 - width / 2), window.innerWidth - width - 8)
  const below = at.bottom + 8
  const top = below + 230 > window.innerHeight ? Math.max(8, at.top - 238) : below

  return createPortal(
    <div ref={ref} className={styles.popover} style={{ left, top, width }} role="dialog" aria-label={describe(measure)}>
      <div className={styles.title}>{describe(measure)}</div>
      <form
        className={styles.row}
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          commit()
        }}
      >
        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={measure.label}
        />
        <span className={styles.unit}>mm</span>
        <button type="submit" className={styles.save}>
          Set
        </button>
      </form>
      {groupSize > 0 && (
        <p className={styles.note}>
          Changes {groupSize} linked dimension{groupSize === 1 ? "" : "s"} too.
        </p>
      )}
      <label className={styles.switchRow}>
        <input
          type="checkbox"
          role="switch"
          checked={!!anchor}
          onChange={(e) => (e.target.checked ? onLink() : onUnlink())}
        />
        <span className={styles.switch} aria-hidden="true" />
        <span>{anchor ? <>Linked to {describe(anchor)}</> : "Link to another dimension…"}</span>
      </label>
      {dependents > 0 && !anchor && (
        <p className={styles.note}>
          ⚓ Anchor — {dependents} dimension{dependents === 1 ? " takes" : "s take"} their value from this one.
        </p>
      )}
    </div>,
    document.body,
  )
}

export default DimensionPopover
