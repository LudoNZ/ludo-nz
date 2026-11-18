"use client"

import styles from "./undoToast.module.scss"

/** The floating undo bar: fixed to the bottom of the screen, shown for a
 * few seconds after each change (and after each undo/redo, so a run of
 * accidents can be stepped back through). */
export default function UndoToast({
  message,
  undoCount,
  canRedo,
  onUndo,
  onRedo,
  onClose,
}: {
  message: string
  undoCount: number
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onClose: () => void
}) {
  return (
    <div className={styles.undoToast} role="status" aria-live="polite">
      <span className={styles.message}>{message}</span>
      <div className={styles.buttons}>
        {undoCount > 0 && (
          <button type="button" className={styles.undo} onClick={onUndo}>
            ↶ Undo{undoCount > 1 ? ` (${undoCount})` : ""}
          </button>
        )}
        {canRedo && (
          <button type="button" className={styles.redo} onClick={onRedo}>
            Redo ↷
          </button>
        )}
        <button type="button" className={styles.close} onClick={onClose} aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  )
}
