"use client"

import { newId } from "./data"
import NumField from "./numField"
import { Wall, WallCorner } from "./types"
import styles from "./cornersEditor.module.scss"

/** Where a new corner goes: the middle of the widest stretch of wall
 * between its ends and existing corners, snapped to 100 mm. */
const nextCornerX = (wall: Wall) => {
  const xs = [0, ...(wall.corners ?? []).map((c) => c.x).sort((a, b) => a - b), wall.lengthMm]
  let best = 0
  for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > xs[best + 1] - xs[best]) best = i - 1
  return Math.round((xs[best] + xs[best + 1]) / 2 / 100) * 100
}

/** Corners part way along a wall — where it steps in or out on plan.
 * Also draggable sideways on the elevation. */
const CornersEditor: React.FC<{ wall: Wall; onChange: (corners: WallCorner[]) => void }> = ({ wall, onChange }) => {
  const corners = [...(wall.corners ?? [])].sort((a, b) => a.x - b.x)
  const add = (type: WallCorner["type"]) => onChange([...corners, { id: newId(), x: nextCornerX(wall), type }])

  return (
    <div className={styles.corners}>
      <div className={styles.header}>
        <span className={styles.title}>Corners along the wall</span>
        <button type="button" className={styles.add} onClick={() => add("external")}>
          + External corner
        </button>
        <button type="button" className={styles.add} onClick={() => add("internal")}>
          + Internal corner
        </button>
      </div>
      {corners.length === 0 ? (
        <span className={styles.hint}>
          Where the wall steps in or out on plan. Boards stop at a corner; external corners get a facing each side,
          internal ones a scriber.
        </span>
      ) : (
        corners.map((c) => (
          <div key={c.id} className={styles.row}>
            <div className={styles.toggle} role="radiogroup" aria-label="Corner type">
              {(["external", "internal"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={c.type === t}
                  className={c.type === t ? styles.on : ""}
                  onClick={() => onChange(corners.map((x) => (x.id === c.id ? { ...x, type: t } : x)))}
                >
                  {t === "external" ? "External" : "Internal"}
                </button>
              ))}
            </div>
            <span>at</span>
            <span className={styles.unitInput}>
              <NumField
                value={c.x}
                min={1}
                step={100}
                ariaLabel="Corner distance from left end"
                onChange={(v) => onChange(corners.map((x) => (x.id === c.id ? { ...x, x: v } : x)))}
              />
              mm
            </span>
            <button
              type="button"
              className={styles.remove}
              aria-label="Remove corner"
              onClick={() => onChange(corners.filter((x) => x.id !== c.id))}
            >
              ×
            </button>
            {(c.x <= 0 || c.x >= wall.lengthMm) && <span className={styles.warn}>outside the wall — ignored</span>}
          </div>
        ))
      )}
    </div>
  )
}

export default CornersEditor
