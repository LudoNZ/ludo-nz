"use client"

import { useEffect } from "react"
import { createPortal } from "react-dom"
import { openingTrims } from "./trims"
import { JoineryPart, Opening, WeatherboardSettings } from "./types"
import styles from "./joinerySkipModal.module.scss"

const PARTS: { part: JoineryPart; label: string; what: (lengths: number[]) => string }[] = [
  {
    part: "facings",
    label: "Facings",
    what: (l) => (l.length ? `2 jambs ${l[0]} + head ${l[2]} mm` : "—"),
  },
  {
    part: "scribers",
    label: "Scribers (mouldings)",
    what: (l) => (l.length ? `2 × ${l[0]} mm against the jamb facings` : "—"),
  },
  {
    part: "flashing",
    label: "Head flashing",
    what: (l) => (l.length ? `${l[0]} mm` : "—"),
  },
]

/** Skip mode, tapping a window or door: leave out the whole unit's trims
 * in one tap, or pick which parts — facings, scribers, head flashing.
 * Every change applies straight away. */
const JoinerySkipModal: React.FC<{
  title: string
  opening: Opening
  settings: WeatherboardSettings
  onChange: (skipParts: Opening["skipParts"]) => void
  onClose: () => void
}> = ({ title, opening, settings, onChange, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const trims = openingTrims(opening, settings)
  const skip = opening.skipParts ?? {}
  const all = PARTS.every(({ part }) => skip[part])
  const none = PARTS.every(({ part }) => !skip[part])
  const setAll = (on: boolean) =>
    onChange(on ? { facings: true, scribers: true, flashing: true } : undefined)
  const toggle = (part: JoineryPart, on: boolean) => {
    const next = { ...skip, [part]: on }
    onChange(PARTS.some(({ part: p }) => next[p]) ? next : undefined)
  }

  return createPortal(
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.header}>
          <h2>{title}</h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <p className={styles.size}>
          {opening.width} × {opening.height} mm, sill {opening.sill}
        </p>

        <button
          type="button"
          className={`${styles.whole} ${all ? styles.wholeOn : ""}`}
          aria-pressed={all}
          onClick={() => setAll(!all)}
        >
          {all ? "✓ Whole unit skipped — tap to count it again" : "Skip the whole unit"}
        </button>

        <div className={styles.parts}>
          {PARTS.map(({ part, label, what }) => (
            <label key={part} className={`${styles.part} ${skip[part] ? styles.partSkipped : ""}`}>
              <input type="checkbox" checked={!!skip[part]} onChange={(e) => toggle(part, e.target.checked)} />
              <span className={styles.partText}>
                <strong>Skip {label.toLowerCase()}</strong>
                <span>{what(trims[part])}</span>
              </span>
            </label>
          ))}
        </div>

        <div className={styles.footer}>
          <span className={styles.status}>
            {none ? "Everything for this unit is counted." : all ? "Nothing for this unit is counted." : "Some parts skipped."}
          </span>
          <button type="button" className={styles.done} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default JoinerySkipModal
