"use client"

import { useEffect, useRef, useState } from "react"
import NumField from "@/components/weatherboards/numField"
import { fitIn, JoineryType, LastJoinery } from "./joinery"
import styles from "./house.module.scss"

/** What's being added or changed on a wall: an outside wall's joinery unit
 * (window or door, with its schedule ID) or an inside wall's door. mm, x
 * along the wall from its start, head up off its floor. */
export interface JoineryDraft {
  where: "inside" | "outside"
  id?: string
  typeId: string | null
  kind: "door" | "window"
  /** the schedule's ID: outside joinery only */
  code: string
  name: string
  /** its left edge along the wall */
  x: number
  width: number
  height: number
  /** its top, off the floor (a door's is its height) */
  head: number
}

const LAST = "__last"

/** The window or door just placed (or tapped), to confirm: its type —
 * filling in that type's size, which can be changed, or kept as a new type
 * — its ID and name, size, head height and place. Enter saves, Escape
 * cancels. */
const JoineryModal: React.FC<{
  draft: JoineryDraft
  wallName: string
  /** the wall's length, and the free stretch the unit's in (for what fits) */
  length: number
  gap: [number, number]
  types: JoineryType[]
  /** the house's head height, and the heads already in use, to line up with */
  houseHead: number
  heads: number[]
  last?: LastJoinery
  /** the next free ID for a kind */
  nextCode: (kind: "window" | "door") => string
  onSave: (d: JoineryDraft) => void
  /** a type added, or a type's default changed */
  onSaveType: (t: JoineryType) => void
  onDelete?: () => void
  onCancel: () => void
}> = ({ draft, wallName, length, gap, types, houseHead, heads, last, nextCode, onSave, onSaveType, onDelete, onCancel }) => {
  const [d, setD] = useState<JoineryDraft>(draft)
  const [newType, setNewType] = useState<string | null>(null)
  // (the name first: type it, or just Enter to add it as it is)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => first.current?.focus(), [])
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onCancel()
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [onCancel])
  const set = (patch: Partial<JoineryDraft>) => setD((x) => ({ ...x, ...patch }))
  const outside = d.where === "outside"
  const mid = d.x + d.width / 2
  const fits = (w: number) => fitIn(gap, w, mid) !== null
  const type = types.find((t) => t.id === d.typeId)
  const headOf = (t: { kind: string; height: number; headMm?: number }) => (t.kind === "door" ? t.height : (t.headMm ?? houseHead))

  /** take on a type's (or the last one's) size, kept centred where it was, and fitted */
  const take = (t: { id: string | null; kind: "door" | "window"; width: number; height: number; head: number }) => {
    const x = fitIn(gap, t.width, mid) ?? Math.max(0, Math.min(length - t.width, Math.round((mid - t.width / 2) / 10) * 10))
    setD((x0) => ({
      ...x0,
      typeId: t.id,
      kind: t.kind,
      width: t.width,
      height: t.height,
      head: t.head,
      x,
      // (the ID follows its kind while it's the one suggested)
      code: x0.code === nextCode(x0.kind) || !x0.code ? nextCode(t.kind) : x0.code,
    }))
  }
  const sill = d.head - d.height
  const changedFromType = type && (type.width !== d.width || type.height !== d.height || (d.kind === "window" && headOf(type) !== d.head))
  const title = `${draft.id ? "" : "New "}${outside ? (d.kind === "door" ? "outside door" : "window") : "inside door"}`
  const overEnd = d.x < 0 || d.x + d.width > length + 1
  const clash = !fits(d.width) && !(d.x >= gap[0] - 1 && d.x + d.width <= gap[1] + 1)

  return (
    <div className={styles.modalBack} onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault()
          if (!overEnd) onSave(d)
        }}
      >
        <h3>
          {title.charAt(0).toUpperCase() + title.slice(1)} <span className={styles.muted}>— {wallName}</span>
        </h3>
        <div className={styles.fields}>
          <label style={{ flex: "1 1 100%" }}>
            Type
            <select
              value={d.typeId ?? ""}
              onChange={(e) => {
                const v = e.target.value
                if (v === LAST && last) take({ id: last.typeId, kind: last.kind, width: last.width, height: last.height, head: last.head })
                else {
                  const t = types.find((x) => x.id === v)
                  if (t) take({ id: t.id, kind: t.kind, width: t.width, height: t.height, head: headOf(t) })
                  else set({ typeId: null })
                }
              }}
            >
              {last && (
                <option value={LAST}>
                  Same as the last one — {last.width} × {last.height}
                  {last.kind === "window" ? `, head ${last.head}` : ""}
                </option>
              )}
              {(["door", "window"] as const)
                .filter((k) => outside || k === "door")
                .map((k) => (
                  <optgroup key={k} label={k === "door" ? "Doors" : "Windows"}>
                    {types
                      .filter((t) => t.kind === k)
                      .map((t) => (
                        <option key={t.id} value={t.id} disabled={!fits(t.width)}>
                          {t.name} — {t.width} × {t.height}
                          {fits(t.width) ? "" : " (won't fit here)"}
                        </option>
                      ))}
                  </optgroup>
                ))}
              <option value="">Its own size (no type)</option>
            </select>
          </label>
          {outside && (
            <label>
              Joinery ID
              <input value={d.code} onChange={(e) => set({ code: e.target.value })} placeholder="W01" />
            </label>
          )}
          <label>
            Name
            <input ref={first} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder={outside ? (d.kind === "door" ? "Front door" : "Kitchen window") : "Bedroom 1 door"} />
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
              <NumField value={d.height} min={200} step={10} onChange={(v) => set(d.kind === "door" ? { height: v, head: v } : { height: v })} /> mm
            </span>
          </label>
          {d.kind === "window" && (
            <label>
              Head height
              <span className={styles.unit}>
                <NumField value={d.head} min={d.height} step={10} onChange={(v) => set({ head: v })} /> mm
              </span>
              <span className={styles.muted}>off the floor — sill at {sill}</span>
            </label>
          )}
          <label>
            Left edge from the wall&apos;s start
            <span className={styles.unit}>
              <NumField value={d.x} min={0} step={10} onChange={(v) => set({ x: v })} /> mm
            </span>
          </label>
        </div>
        {d.kind === "window" && (
          <div className={styles.toolbar}>
            <span className={styles.muted}>Line the head up with:</span>
            {heads.slice(0, 6).map((h) => (
              <button key={h} type="button" className={`${styles.pill} ${h === d.head ? styles.pillOn : ""}`} onClick={() => set({ head: h })}>
                {h}
                {h === houseHead ? " (the house's)" : ""}
              </button>
            ))}
          </div>
        )}
        {(overEnd || clash) && <p className={styles.warn}>{overEnd ? "It runs past the end of the wall." : "It overlaps another window or door on this wall."}</p>}
        {newType !== null ? (
          <div className={styles.toolbar}>
            <input autoFocus value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="Type name, e.g. Laundry door" aria-label="New type's name" />
            <button
              type="button"
              className={styles.pill}
              disabled={!newType.trim()}
              onClick={() => {
                const t: JoineryType = {
                  id: `t-${Math.random().toString(36).slice(2, 8)}`,
                  name: newType.trim(),
                  kind: d.kind,
                  where: d.where,
                  width: d.width,
                  height: d.height,
                  ...(d.kind === "window" && d.head !== houseHead ? { headMm: d.head } : {}),
                }
                onSaveType(t)
                set({ typeId: t.id })
                setNewType(null)
              }}
            >
              Keep as a new type
            </button>
            <button type="button" className={styles.link} onClick={() => setNewType(null)}>
              Never mind
            </button>
          </div>
        ) : (
          <div className={styles.toolbar}>
            <button type="button" className={styles.link} onClick={() => setNewType("")}>
              + Keep this size as a new type
            </button>
            {changedFromType && type && (
              <button
                type="button"
                className={styles.link}
                onClick={() =>
                  onSaveType({ ...type, width: d.width, height: d.height, ...(d.kind === "window" ? (d.head === houseHead ? { headMm: undefined } : { headMm: d.head }) : {}) })
                }
              >
                Make this {type.name}&apos;s default
              </button>
            )}
          </div>
        )}
        <div className={styles.toolbar}>
          <button type="submit" className={`${styles.pill} ${styles.pillOn}`} disabled={overEnd}>
            {draft.id ? "Save" : "Add it"}
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
