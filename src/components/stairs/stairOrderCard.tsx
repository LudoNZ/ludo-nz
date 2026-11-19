"use client"

import { useState } from "react"
import { CombinedOrderLine, orderLineText, StairOrderKind } from "./stairMaterials"
import styles from "./stairOrderCard.module.scss"

const KIND_LABELS: Record<StairOrderKind, string> = {
  timber: "Framing timber",
  posts: "Posts",
  decking: "Decking",
  concrete: "Concrete",
  screws: "Fixings",
}

const qty = (l: CombinedOrderLine) => (l.lengthM !== null ? `${l.count} × ${l.lengthM.toFixed(1)} m` : l.unit === "m³" ? `${l.count.toFixed(2)} m³` : `${l.count}`)

/** The material order for one stair or several: what to ask the supplier
 * for, grouped by kind, with what each line is for — and a button to copy
 * it as plain text for an email or message to the yard. */
const StairOrderCard: React.FC<{
  title?: string
  lines: CombinedOrderLine[]
  intro?: string
  note?: string
  /** show what each line is for */
  showUses?: boolean
}> = ({ title = "Material order", lines, intro, note, showUses = true }) => {
  const [copied, setCopied] = useState(false)
  if (!lines.length) return null
  const text = [title, ...lines.map(orderLineText)].join("\n")
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  let lastKind: StairOrderKind | null = null
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <h3>{title}</h3>
        <button type="button" className={styles.copy} onClick={copy}>
          {copied ? "Copied" : "Copy as text"}
        </button>
      </div>
      {intro && <p className={styles.intro}>{intro}</p>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Qty</th>
              <th>Material</th>
            </tr>
          </thead>
          <tbody>
            {lines.flatMap((l, i) => {
              const rows = []
              if (l.kind !== lastKind) {
                lastKind = l.kind
                rows.push(
                  <tr key={`g-${l.kind}`} className={styles.group}>
                    <td colSpan={2}>{KIND_LABELS[l.kind]}</td>
                  </tr>,
                )
              }
              rows.push(
                <tr key={i}>
                  <td className={styles.qty}>{qty(l)}</td>
                  <td>
                    {l.material}
                    {showUses && <span className={styles.uses}>{l.uses.join(" · ")}</span>}
                  </td>
                </tr>,
              )
              return rows
            })}
          </tbody>
        </table>
      </div>
      {note && <p className={styles.note}>{note}</p>}
    </div>
  )
}

export default StairOrderCard
