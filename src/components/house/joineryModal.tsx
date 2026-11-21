"use client"

import { useEffect, useRef, useState } from "react"
import NumField from "@/components/weatherboards/numField"
import styles from "./house.module.scss"

/** What's being added or changed: an outside wall's joinery unit (window or
 * door, with its schedule ID), or an inside wall's door. mm. */
export type JoineryDraft =
  /** (sill: up from the ground floor, as the weatherboards keep it; floor: the wall's floor, the same way) */
  | { where: "outside"; id?: string; kind: "window" | "door"; code: string; name: string; x: number; sill: number; floor: number; width: number; height: number }
  | { where: "inside"; id?: string; name: string; at: number; width: number; height: number }

/** The window or door just drawn (or tapped) on a wall's elevation, to
 * confirm: its ID and name, size and place. Enter saves, Escape cancels. */
const JoineryModal: React.FC<{
  draft: JoineryDraft
  wallName: string
  /** the next free IDs, for when the kind changes */
  nextCode: (kind: "window" | "door") => string
  onSave: (d: JoineryDraft) => void
  onDelete?: () => void
  onCancel: () => void
}> = ({ draft, wallName, nextCode, onSave, onDelete, onCancel }) => {
  const [d, setD] = useState<JoineryDraft>(draft)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    first.current?.focus()
    first.current?.select()
  }, [])
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onCancel()
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [onCancel])
  const set = (patch: Partial<JoineryDraft>) => setD((x) => ({ ...x, ...patch }) as JoineryDraft)
  const editing = !!draft.id
  const title =
    d.where === "outside" ? `${editing ? "" : "New "}${d.kind === "door" ? "outside door" : "window"}` : `${editing ? "Inside" : "New inside"} door`

  return (
    <div className={styles.modalBack} onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault()
          onSave(d)
        }}
      >
        <h3>
          {title.charAt(0).toUpperCase() + title.slice(1)} <span className={styles.muted}>— {wallName}</span>
        </h3>
        {d.where === "outside" ? (
          <>
            <div className={styles.toggle} role="radiogroup" aria-label="Kind">
              {(["window", "door"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={d.kind === k}
                  className={d.kind === k ? styles.toggleOn : ""}
                  onClick={() =>
                    // (a door stands on the floor, a window's sill goes back to 900 off it if it was on the floor; the
                    // ID follows its kind if it was the suggested one)
                    set({
                      kind: k,
                      sill: k === "door" ? d.floor : d.sill - d.floor < 100 ? d.floor + 900 : d.sill,
                      code: d.code === nextCode(d.kind) ? nextCode(k) : d.code,
                    })
                  }
                >
                  {k === "window" ? "Window" : "Door"}
                </button>
              ))}
            </div>
            <div className={styles.fields}>
              <label>
                Joinery ID
                <input ref={first} value={d.code} onChange={(e) => set({ code: e.target.value })} placeholder="W01" />
              </label>
              <label>
                Name
                <input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder={d.kind === "door" ? "Front door" : "Kitchen window"} />
              </label>
              <label>
                Width
                <span className={styles.unit}>
                  <NumField value={d.width} min={200} step={10} onChange={(v) => set({ width: v })} /> mm
                </span>
              </label>
              <label>
                Height
                <span className={styles.unit}>
                  <NumField value={d.height} min={200} step={10} onChange={(v) => set({ height: v })} /> mm
                </span>
              </label>
              {d.kind === "window" && (
                <label>
                  Sill height
                  <span className={styles.unit}>
                    <NumField value={d.sill - d.floor} min={0} step={10} onChange={(v) => set({ sill: v + d.floor })} /> mm
                  </span>
                  <span className={styles.muted}>off the floor</span>
                </label>
              )}
              <label>
                Left edge from the wall&apos;s start
                <span className={styles.unit}>
                  <NumField value={d.x} min={0} step={10} onChange={(v) => set({ x: v })} /> mm
                </span>
              </label>
            </div>
          </>
        ) : (
          <div className={styles.fields}>
            <label>
              Name
              <input ref={first} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Bedroom 1 door" />
            </label>
            <label>
              Leaf width
              <span className={styles.unit}>
                <NumField value={d.width} min={400} max={2400} step={10} onChange={(v) => set({ width: v })} /> mm
              </span>
            </label>
            <label>
              Leaf height
              <span className={styles.unit}>
                <NumField value={d.height} min={1500} max={2700} step={10} onChange={(v) => set({ height: v })} /> mm
              </span>
            </label>
            <label>
              Its middle from the wall line&apos;s start
              <span className={styles.unit}>
                <NumField value={d.at} min={0} step={10} onChange={(v) => set({ at: v })} /> mm
              </span>
            </label>
          </div>
        )}
        <div className={styles.toolbar}>
          <button type="submit" className={styles.pill}>
            {editing ? "Save" : "Add it"}
          </button>
          <button type="button" className={styles.link} onClick={onCancel}>
            Cancel
          </button>
          {onDelete && (
            <button type="button" className={styles.danger} onClick={onDelete}>
              Remove
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

export default JoineryModal
