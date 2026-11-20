"use client"

import { Modal } from "@/app/elements/Modal/modal"
import { formatM } from "@/components/structures/format"
import { BEARER_TABLE, JoistSpecRow, rowsAtSpacing } from "./frameTables"
import type { FrameLayout } from "./frame"
import styles from "./referenceTableModal.module.scss"

/** The rule-of-thumb tables a frame is sized from — joist spans (the
 * floor or the deck table) and, on bearers, bearer spans between piles —
 * with the rows in use highlighted. Indicative SG8 figures, not a citation
 * of the actual NZS 3604 tables. */
const ReferenceTableModal: React.FC<{ isOpen: boolean; onClose: () => void; frame: FrameLayout }> = ({ isOpen, onClose, frame }) => {
  const usedSpacing = rowsAtSpacing(frame.table, frame.input.joistSpacing)[0]?.spacingMm
  const activeJoist = (r: JoistSpecRow) => r.spacingMm === usedSpacing && r.sizeLabel === frame.joistSize
  const lds = [...new Set(BEARER_TABLE.map((r) => r.loadedDimensionM))].sort((a, b) => a - b)
  const usedLd = lds.find((l) => frame.loadedDimensionM <= l + 1e-6)
  const deck = frame.input.covering === "decking"
  return (
    <Modal isActive={isOpen} closeModal={onClose}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h2>Reference tables</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className={styles.note}>
          Rule-of-thumb spans — indicative SG8 radiata figures for {deck ? "a deck (wet in service, 2 kPa)" : "an inside floor (1.5 kPa)"}, not a
          citation of the actual NZS 3604 tables. What this frame uses is highlighted.
        </p>
        <h3 className={styles.subhead}>Joists</h3>
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
              {frame.table.map((row) => (
                <tr key={`${row.spacingMm}-${row.sizeLabel}`} className={activeJoist(row) ? styles.active : ""}>
                  <td>{row.spacingMm}mm</td>
                  <td>{row.sizeLabel}</td>
                  <td>{formatM(row.maxSpanM, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {frame.bearerSize && (
          <>
            <h3 className={styles.subhead}>Bearers, between piles</h3>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Loaded dimension up to</th>
                    <th>Bearer size</th>
                    <th>Max span</th>
                  </tr>
                </thead>
                <tbody>
                  {BEARER_TABLE.map((row) => (
                    <tr key={`${row.loadedDimensionM}-${row.sizeLabel}`} className={row.loadedDimensionM === usedLd && row.sizeLabel === frame.bearerSize ? styles.active : ""}>
                      <td>{formatM(row.loadedDimensionM, 2)}</td>
                      <td>{row.sizeLabel}</td>
                      <td>{formatM(row.maxSpanM, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.note}>The loaded dimension is the width of floor a bearer carries: half the joist span either side of it.</p>
          </>
        )}
      </div>
    </Modal>
  )
}

export default ReferenceTableModal
