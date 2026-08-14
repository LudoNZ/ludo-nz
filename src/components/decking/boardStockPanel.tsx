"use client"

import { useState } from "react"
import { Modal } from "@/app/elements/Modal/modal"
import Button from "@/components/button/button"
import { StockItem } from "./types"
import styles from "./boardStockPanel.module.scss"

type StockRow = { key: number; lengthText: string; quantity: number }

let stockRowKeySeq = 0
const nextKey = () => stockRowKeySeq++

const toStockRows = (stock: StockItem[]): StockRow[] =>
  stock.length
    ? stock.map((s) => ({ key: nextKey(), lengthText: (s.length / 1000).toString(), quantity: s.quantity }))
    : [{ key: nextKey(), lengthText: "", quantity: 1 }]

const toStockItems = (rows: StockRow[]): StockItem[] =>
  rows
    .map((r) => ({ length: Math.round(parseFloat(r.lengthText) * 1000), quantity: Math.max(0, Math.round(r.quantity)) }))
    .filter((s) => !isNaN(s.length) && s.length > 0 && s.quantity > 0)
    .sort((a, b) => a.length - b.length)

const formatLineal = (mm: number): string => {
  const m = mm / 1000
  return `${m.toFixed(m % 1 === 0 ? 0 : 1)}m`
}

/** Plain-text version of the same rows, meant for pasting somewhere else
 * entirely (a messaging app to a supplier or a builder) rather than
 * reading on screen — one length per line, plain "3.6m × 20" style (no
 * markdown/HTML, since a chat app would just show the raw asterisks/etc.
 * back), a blank line, then the same board-count/lineal totals the panel
 * already shows. Built off whatever's currently in the rows (including
 * an uncommitted in-progress edit) so it always matches what's on screen
 * right now. */
const buildReport = (rows: StockRow[], title: string): string => {
  const items = toStockItems(rows)
  const lines = items.map((s) => `${formatLineal(s.length)} × ${s.quantity}`)
  const totalBoards = items.reduce((sum, s) => sum + s.quantity, 0)
  const totalLinealMm = items.reduce((sum, s) => sum + s.length * s.quantity, 0)
  return [title, "", ...lines, "", `Total: ${totalBoards} boards, ${formatLineal(totalLinealMm)} lineal`].join("\n")
}

/** Standalone, always-editable inventory of board lengths on hand — split
 * out of the main deck-edit form (deckForm.tsx) so it's adjustable any
 * time you're looking at a deck, not just while also mid-edit on its
 * shape/joist settings/etc. Autosaves each change straight back to the
 * deck: a length/quantity edit commits on blur (so you can freely retype
 * a value without a save firing on every keystroke — same reasoning as
 * DraftNumberInput elsewhere in this app), while add/remove/sort commit
 * immediately, since those are already a single deliberate action. */
const BoardStockPanel: React.FC<{
  stock: StockItem[]
  onChange: (stock: StockItem[]) => void
  /** heads the copyable report — e.g. the deck or project's own name.
   * Defaults to a generic label so the prop can stay optional wherever
   * that context isn't available. */
  reportTitle?: string
}> = ({ stock, onChange, reportTitle = "Board stock" }) => {
  const [rows, setRows] = useState<StockRow[]>(() => toStockRows(stock))
  const [reportOpen, setReportOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const commit = (nextRows: StockRow[]) => {
    setRows(nextRows)
    onChange(toStockItems(nextRows))
  }

  const editRow = (key: number, patch: Partial<StockRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const commitRows = () => commit(rows)

  const addRow = () => commit([...rows, { key: nextKey(), lengthText: "", quantity: 1 }])

  const removeRow = (key: number) => commit(rows.filter((r) => r.key !== key))

  const sortRows = () =>
    commit(
      [...rows].sort((a, b) => {
        const la = parseFloat(a.lengthText)
        const lb = parseFloat(b.lengthText)
        if (isNaN(la) && isNaN(lb)) return 0
        if (isNaN(la)) return 1 // blanks sort to the end
        if (isNaN(lb)) return -1
        return la - lb
      })
    )

  // live totals off whatever's currently in the rows (including an
  // in-progress, not-yet-committed edit) so the summary updates as you type
  const totalBoards = rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)
  const totalLinealMm = rows.reduce((sum, r) => {
    const lengthM = parseFloat(r.lengthText)
    const qty = Number(r.quantity) || 0
    return sum + (isNaN(lengthM) ? 0 : lengthM * 1000 * qty)
  }, 0)

  const report = buildReport(rows, reportTitle)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard API unavailable/blocked (older browser, insecure
      // context) — the textarea below is still there to select by hand
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.summary}>
        <div className={styles.stat}>
          <strong>{totalBoards}</strong>
          <span>boards on hand</span>
        </div>
        <div className={styles.stat}>
          <strong>{formatLineal(totalLinealMm)}</strong>
          <span>total lineal</span>
        </div>
      </div>

      <div className={styles.stockList}>
        {rows.map((row) => (
          <div key={row.key} className={styles.stockRow}>
            <input
              type="number"
              step="0.1"
              min={0}
              placeholder="Length (m)"
              value={row.lengthText}
              onChange={(e) => editRow(row.key, { lengthText: e.target.value })}
              onBlur={commitRows}
              aria-label="Board length in metres"
            />
            <span className={styles.stockX}>×</span>
            <input
              type="number"
              min={0}
              value={row.quantity}
              onChange={(e) => editRow(row.key, { quantity: Number(e.target.value) || 0 })}
              onBlur={commitRows}
              aria-label="Quantity"
            />
            <button type="button" className={styles.removeRow} onClick={() => removeRow(row.key)} aria-label="Remove this length">
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className={styles.stockActions}>
        <Button size="small" variant="secondary" onClick={addRow}>
          Add length
        </Button>
        <Button size="small" variant="secondary" onClick={sortRows}>
          Sort by size
        </Button>
        <Button size="small" variant="secondary" onClick={() => setReportOpen(true)}>
          View report
        </Button>
      </div>

      <Modal isActive={reportOpen} closeModal={() => setReportOpen(false)}>
        <div className={styles.reportPanel}>
          <div className={styles.reportHeader}>
            <span>Board stock report</span>
            <button type="button" className={styles.closeBtn} onClick={() => setReportOpen(false)} aria-label="Close">
              ✕
            </button>
          </div>
          <p className={styles.hint}>Plain text — copy and paste it straight into a message.</p>
          <textarea className={styles.reportText} readOnly value={report} onFocus={(e) => e.currentTarget.select()} rows={report.split("\n").length} />
          <Button size="medium" onClick={handleCopy}>
            {copied ? "Copied ✓" : "Copy to clipboard"}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export default BoardStockPanel
