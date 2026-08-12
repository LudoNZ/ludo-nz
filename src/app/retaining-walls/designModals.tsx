"use client"

import { useRef, useState } from "react"
import { Modal } from "@/app/elements/Modal/modal"
import Button from "@/components/button/button"
import { SavedWallDesign } from "@/components/retainingWall/retainingWallData"
import styles from "./designModals.module.scss"

/** Name-and-save: the current wall (dimensions, RL profile, control
 * points, and whichever calc settings are active) becomes a new,
 * immutable, publicly-listed entry — see firestore.rules, update/delete
 * are disabled entirely, so this is a one-way "save a copy" rather than
 * an editable document. */
export const SaveDesignModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  onSave: (name: string) => Promise<void>
}> = ({ isOpen, onClose, onSave }) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    const name = inputRef.current?.value.trim()
    if (!name) {
      setError("Give it a name first.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(name)
      onClose()
    } catch {
      setError("Couldn't save — try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isActive={isOpen} closeModal={onClose}>
      <div className={styles.content}>
        <h2>Save this wall</h2>
        <p className={styles.note}>Saved publicly — anyone with the link (or browsing Open) can see it.</p>
        <input
          ref={inputRef}
          type="text"
          maxLength={100}
          placeholder="e.g. Back yard retaining wall"
          className={styles.nameInput}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
        />
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <Button size="small" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button size="small" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}

const formatDate = (d: Date) => d.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })

/** Browse every publicly-saved wall design and load one in. */
export const OpenDesignModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  designs: SavedWallDesign[]
  onOpen: (design: SavedWallDesign) => void
}> = ({ isOpen, onClose, designs, onOpen }) => (
  <Modal isActive={isOpen} closeModal={onClose}>
    <div className={styles.content}>
      <h2>Open a saved wall</h2>
      {designs.length === 0 ? (
        <p className={styles.note}>Nothing saved yet — hit the save icon once you&apos;ve got a wall set up.</p>
      ) : (
        <ul className={styles.designList}>
          {designs.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className={styles.designRow}
                onClick={() => {
                  onOpen(d)
                  onClose()
                }}
              >
                <span className={styles.designName}>{d.name}</span>
                <span className={styles.designMeta}>
                  {d.wallLengthM}m · {d.retainedHeightM}m · {formatDate(d.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.actions}>
        <Button size="small" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  </Modal>
)
