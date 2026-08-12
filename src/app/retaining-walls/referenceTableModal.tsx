"use client"

import { Modal } from "@/app/elements/Modal/modal"
import { WallSpecRow } from "@/components/retainingWall/calcSettings"
import { SOIL_LABELS } from "@/components/retainingWall/retainingWallCalc"
import { formatM, formatMm } from "@/components/structures/format"
import styles from "./referenceTableModal.module.scss"

const isSameRow = (a: WallSpecRow, b: WallSpecRow) => a.soil === b.soil && a.maxHeightM === b.maxHeightM

/** The rule-of-thumb table the active calc settings are driven by, laid
 * out as a real table with whichever row matches the current inputs
 * highlighted — so it's never a black-box formula, you can see exactly
 * which band you landed in and what every other band looks like. Shows
 * whichever settings are currently active (Default or a saved custom
 * profile), not always the same fixed table. Not a citation of a specific
 * code clause: a construction rule of thumb, same as the rest of this
 * calculator, and the same 1.5m cutoff still applies above it. */
const ReferenceTableModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  referenceTable: WallSpecRow[]
  activeRow: WallSpecRow | null
}> = ({ isOpen, onClose, referenceTable, activeRow }) => (
  <Modal isActive={isOpen} closeModal={onClose}>
    <div className={styles.content}>
      <div className={styles.header}>
        <h2>Reference table</h2>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <p className={styles.note}>
        Rule-of-thumb bands this calculator looks up by soil type and retained height — not a
        citation of a specific code table. Embedment is shown here at each band&apos;s tallest
        wall (its conservative design case); your actual figure scales with the exact height you
        entered. Your current selection is highlighted.
      </p>
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>Soil</th>
              <th>Up to</th>
              <th>Post size</th>
              <th>Max spacing</th>
              <th>Embedment*</th>
            </tr>
          </thead>
          <tbody>
            {referenceTable.map((row) => {
              const active = activeRow != null && isSameRow(row, activeRow)
              return (
                <tr key={`${row.soil}-${row.maxHeightM}`} className={active ? styles.active : ""}>
                  <td>{SOIL_LABELS[row.soil]}</td>
                  <td>{formatM(row.maxHeightM, 1)}</td>
                  <td>{row.postSizeLabel}</td>
                  <td>{formatM(row.maxSpacingM, 2)}</td>
                  <td>{formatMm(row.embedmentRatio * row.maxHeightM)}*</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className={styles.footnote}>
        * plus a ~100mm gravel base pad under the post for drainage and bearing — not counted as
        structural embedment.
      </p>
    </div>
  </Modal>
)

export default ReferenceTableModal
