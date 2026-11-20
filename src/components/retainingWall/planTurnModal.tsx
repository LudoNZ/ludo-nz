"use client"

import { Modal } from "@/app/elements/Modal/modal"
import { levelRotationFor, normalizeDeg, PlanPoint, RetainedSide, segmentLabel, segmentLengths } from "./wallPlan"
import styles from "./planTurnModal.module.scss"

/** Every way to turn the plan, opened by holding the "Wall … level"
 * button: any wall laid level or stood upright, 15° nudges, and — full
 * screen, where turning isn't saved — making the turn on screen the
 * wall's default. Under the plan every turn here is the default already
 * (it saves as it's made). */
const PlanTurnModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  points: PlanPoint[]
  retainedSide: RetainedSide
  /** degrees, how the plan's turned on screen right now */
  shownDeg: number
  /** degrees, the turn saved with the wall: how it opens */
  savedDeg: number
  /** turn the plan as it's being looked at (saves it, under the plan) */
  onTurnTo: (deg: number) => void
  /** full screen only: save `shownDeg` as the wall's turn */
  onSaveDefault?: () => void
}> = ({ isOpen, onClose, points, retainedSide, shownDeg, savedDeg, onTurnTo, onSaveDefault }) => {
  const lengths = segmentLengths(points)
  const shown = Math.round(normalizeDeg(shownDeg))
  const saved = Math.round(normalizeDeg(savedDeg))
  const isShown = (deg: number) => Math.round(normalizeDeg(deg)) === shown
  const pick = (deg: number) => {
    onTurnTo(deg)
    onClose()
  }

  return (
    <Modal isActive={isOpen} closeModal={onClose}>
      <div className={styles.root} role="dialog" aria-modal="true" aria-label="Turn the plan">
        <div className={styles.head}>
          <h3 className={styles.title}>Turn the plan</h3>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className={styles.note}>
          {onSaveDefault
            ? "Full screen, turning is just for looking — the wall still opens the way it's saved."
            : "Saved with the wall: it opens this way on any device."}
        </p>

        <ul className={styles.walls}>
          {lengths.map((len, i) => {
            const level = levelRotationFor(points, i, retainedSide)
            const upright = levelRotationFor(points, i, retainedSide, true)
            return (
              <li key={i} className={styles.wallRow}>
                <span className={styles.wallName}>
                  Wall {segmentLabel(i)} <span className={styles.wallLen}>{len.toFixed(2)} m</span>
                </span>
                <button type="button" className={`${styles.option} ${isShown(level) ? styles.current : ""}`} onClick={() => pick(level)} aria-label={`Lay wall ${segmentLabel(i)} level`}>
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M3 10h14" />
                  </svg>
                  Level
                </button>
                <button type="button" className={`${styles.option} ${isShown(upright) ? styles.current : ""}`} onClick={() => pick(upright)} aria-label={`Stand wall ${segmentLabel(i)} upright`}>
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M10 3v14" />
                  </svg>
                  Upright
                </button>
              </li>
            )
          })}
        </ul>

        <div className={styles.footer}>
          <span className={styles.angle}>
            Now {shown}°{onSaveDefault && <> · saved {saved}°</>}
          </span>
          <button type="button" className={styles.option} onClick={() => onTurnTo(normalizeDeg(shownDeg - 15))} aria-label="Turn 15° anticlockwise">
            −15°
          </button>
          <button type="button" className={styles.option} onClick={() => onTurnTo(normalizeDeg(shownDeg + 15))} aria-label="Turn 15° clockwise">
            +15°
          </button>
          {shown !== 0 && (
            <button type="button" className={styles.option} onClick={() => pick(0)}>
              As drawn (0°)
            </button>
          )}
        </div>

        {onSaveDefault && (
          <button
            type="button"
            className={styles.saveDefault}
            disabled={shown === saved}
            onClick={() => {
              onSaveDefault()
              onClose()
            }}
          >
            {shown === saved ? `${shown}° is the default` : `Make ${shown}° the default`}
          </button>
        )}
      </div>
    </Modal>
  )
}

export default PlanTurnModal
