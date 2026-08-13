"use client"

import { Modal } from "@/app/elements/Modal/modal"
import { JoistSpecRow } from "@/components/midFloorFraming/floorSettings"
import { formatM } from "@/components/structures/format"
import styles from "./joistReferenceTableModal.module.scss"

const isSameRow = (a: JoistSpecRow, b: JoistSpecRow) => a.spacingMm === b.spacingMm && a.sizeLabel === b.sizeLabel

/** The rule-of-thumb span table this calculator looks up by spacing and
 * span, laid out as a real table with whichever row matches the current
 * inputs highlighted. Indicative SG8/single-span figures, not a citation
 * of the actual NZS 3604 span tables — see the page's own disclaimer. */
const JoistReferenceTableModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  referenceTable: JoistSpecRow[]
  activeRow: JoistSpecRow | null
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
        Rule-of-thumb spans by joist spacing and size — indicative SG8 radiata figures for a single
        span under standard residential floor loading, not a citation of the actual NZS 3604 span
        tables. Your current selection is highlighted; a span past every row here is outside what
        this tool can spec at all.
      </p>
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>Spacing</th>
              <th>Joist size</th>
              <th>Max span</th>
            </tr>
          </thead>
          <tbody>
            {referenceTable.map((row) => {
              const active = activeRow != null && isSameRow(row, activeRow)
              return (
                <tr key={`${row.spacingMm}-${row.sizeLabel}`} className={active ? styles.active : ""}>
                  <td>{row.spacingMm}mm</td>
                  <td>{row.sizeLabel}</td>
                  <td>{formatM(row.maxSpanM, 2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  </Modal>
)

export default JoistReferenceTableModal
