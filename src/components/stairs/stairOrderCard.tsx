"use client"

import { useMemo, useState } from "react"
import { BoardOrderPlan, planBoardOrderDetailed } from "@/components/retainingWall/calcSettings"
import { CombinedOrderLine, orderLineText, StairOrderKind } from "./stairMaterials"
import { SAW_KERF, STOCK_LENGTHS_M } from "./stairs"
import styles from "./stairOrderCard.module.scss"

const KIND_LABELS: Record<StairOrderKind, string> = {
  timber: "Framing timber",
  posts: "Posts",
  decking: "Decking",
  concrete: "Concrete",
  screws: "Fixings",
}
const KIND_ORDER: StairOrderKind[] = ["timber", "posts", "decking", "concrete", "screws"]

/** what the supplier can actually give: per material (`kind|material`),
 * how many of each length (keyed by String(lengthM)) — 0 for none */
export type StairOrderPins = Record<string, Record<string, number>>

const qty = (l: CombinedOrderLine) => (l.lengthM !== null ? `${l.count} × ${l.lengthM.toFixed(1)} m` : l.unit === "m³" ? `${l.count.toFixed(2)} m³` : `${l.count}`)
const lengthText = (m: number) => `${m.toFixed(1)} m`

interface MaterialGroup {
  key: string
  kind: StairOrderKind
  material: string
  uses: string[]
  /** every piece cut from this material (mm) */
  pieces: number[]
}

/** The material order for one stair or several, worked out live from the
 * cut list, like the retaining wall's board order. For each timber,
 * post and decking material, "Suggested" is what to buy with every
 * length freely available; "Your order" starts the same — type a number
 * against a length to pin it to what the supplier actually has (0 if
 * they've none) and the other lengths re-work themselves to cover the
 * rest. Concrete and screws are listed as they are. "Copy as text" copies
 * your order. */
const StairOrderCard: React.FC<{
  title?: string
  lines: CombinedOrderLine[]
  intro?: string
  note?: string
  /** show what each line is for */
  showUses?: boolean
  /** pinned counts, kept with the stair; without them they're kept here
   * until the page is left */
  pins?: StairOrderPins
  onPinsChange?: (pins: StairOrderPins) => void
}> = ({ title = "Material order", lines, intro, note, showUses = true, pins: pinsProp, onPinsChange }) => {
  const [copied, setCopied] = useState(false)
  const [localPins, setLocalPins] = useState<StairOrderPins>({})
  const pins = pinsProp ?? localPins
  const setPins = onPinsChange ?? setLocalPins

  // lengths with their pieces are re-planned by material; the rest as given
  const { groups, others } = useMemo(() => {
    const map = new Map<string, MaterialGroup>()
    const others: CombinedOrderLine[] = []
    for (const l of lines) {
      if (l.lengthM === null || !l.pieces?.length) {
        others.push(l)
        continue
      }
      const key = `${l.kind}|${l.material}`
      const g = map.get(key) ?? { key, kind: l.kind, material: l.material, uses: [], pieces: [] }
      g.pieces.push(...l.pieces)
      for (const u of l.uses) if (!g.uses.includes(u)) g.uses.push(u)
      map.set(key, g)
    }
    return { groups: [...map.values()], others }
  }, [lines])

  const plans = useMemo(
    () =>
      groups.map((g) => {
        // each piece takes its length and a saw cut
        const piecesM = g.pieces.map((p) => [(p + SAW_KERF) / 1000])
        const suggested = planBoardOrderDetailed(piecesM, STOCK_LENGTHS_M)
        const mine = planBoardOrderDetailed(piecesM, STOCK_LENGTHS_M, pins[g.key] ?? {})
        return { g, suggested, mine }
      }),
    [groups, pins],
  )

  if (!lines.length) return null

  const setCount = (key: string, lengthM: number, raw: string) => {
    const next = { ...(pins[key] ?? {}) }
    const n = parseInt(raw, 10)
    if (raw.trim() === "" || !(n >= 0)) delete next[String(lengthM)]
    else next[String(lengthM)] = n
    const all = { ...pins, [key]: next }
    if (Object.keys(next).length === 0) delete all[key]
    setPins(all)
  }
  const anyPinned = Object.keys(pins).some((k) => groups.some((g) => g.key === k))

  const mineText = (plan: BoardOrderPlan, material: string) =>
    plan.lines.filter((l) => l.count > 0).map((l) => `${l.count} × ${lengthText(l.lengthM)}  ${material}`)
  const text = [
    title,
    ...KIND_ORDER.flatMap((kind) => [
      ...plans.filter((p) => p.g.kind === kind).flatMap((p) => mineText(p.mine, p.g.material)),
      ...others.filter((l) => l.kind === kind).map(orderLineText),
    ]),
  ].join("\n")
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <h3>{title}</h3>
        <span className={styles.headActions}>
          {anyPinned && (
            <button type="button" className={styles.copy} onClick={() => setPins({})}>
              Clear what&apos;s typed
            </button>
          )}
          <button type="button" className={styles.copy} onClick={copy}>
            {copied ? "Copied" : "Copy as text"}
          </button>
        </span>
      </div>
      {intro && <p className={styles.intro}>{intro}</p>}
      <p className={styles.intro}>
        Type a number against a length to set how many of it you&apos;re getting, or tap Not in stock if the supplier has
        none, and the other lengths re-work to cover the rest. Clear a box to let it work itself out again.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Length</th>
              <th>Suggested</th>
              <th>Your order</th>
            </tr>
          </thead>
          {KIND_ORDER.map((kind) => {
            const kindPlans = plans.filter((p) => p.g.kind === kind)
            const kindOthers = others.filter((l) => l.kind === kind)
            if (!kindPlans.length && !kindOthers.length) return null
            return (
              <tbody key={kind}>
                <tr className={styles.group}>
                  <td colSpan={3}>{KIND_LABELS[kind]}</td>
                </tr>
                {kindPlans.map(({ g, suggested, mine }) => {
                  const pinned = pins[g.key] ?? {}
                  // the lengths in either order, or typed against
                  const shown = mine.lines.filter((l, i) => l.count > 0 || suggested.lines[i].count > 0 || l.fixed)
                  return [
                    <tr key={`${g.key}-head`} className={styles.material}>
                      <td colSpan={3}>
                        <strong>{g.material}</strong>
                        {showUses && <span className={styles.uses}>{g.uses.join(" · ")}</span>}
                      </td>
                    </tr>,
                    ...shown.map((line) => {
                      const i = mine.lines.indexOf(line)
                      const spare = line.count - line.usedCount
                      return (
                        <tr key={`${g.key}-${line.lengthM}`}>
                          <td className={styles.length}>{lengthText(line.lengthM)}</td>
                          <td className={styles.qty}>{suggested.lines[i].count}</td>
                          <td className={styles.mine}>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              inputMode="numeric"
                              aria-label={`${lengthText(line.lengthM)} of ${g.material} on your order`}
                              className={line.fixed ? styles.fixedInput : undefined}
                              placeholder={`${line.count}`}
                              value={line.fixed ? pinned[String(line.lengthM)] : ""}
                              onChange={(e) => setCount(g.key, line.lengthM, e.target.value)}
                            />
                            {line.fixed ? (
                              <button type="button" className={styles.clear} onClick={() => setCount(g.key, line.lengthM, "")}>
                                {pinned[String(line.lengthM)] === 0 ? "Back in stock" : "Clear"}
                              </button>
                            ) : (
                              <>
                                <span className={styles.auto}>auto</span>
                                <button
                                  type="button"
                                  className={styles.clear}
                                  title="The supplier has none of this length: order 0 and make it up from the others"
                                  onClick={() => setCount(g.key, line.lengthM, "0")}
                                >
                                  Not in stock
                                </button>
                              </>
                            )}
                            {spare > 0 && <span className={styles.spare}>{spare} spare</span>}
                          </td>
                        </tr>
                      )
                    }),
                    <tr key={`${g.key}-sum`} className={styles.sum}>
                      <td>
                        {g.pieces.length} piece{g.pieces.length === 1 ? "" : "s"}
                      </td>
                      <td>
                        {suggested.boardCount} · {suggested.totalLengthM.toFixed(1)} m
                      </td>
                      <td>
                        {mine.boardCount} · {mine.totalLengthM.toFixed(1)} m
                        {mine.uncutCount > 0 && (
                          <span className={styles.warn}>
                            {" "}
                            ⚠ {mine.uncutCount} piece{mine.uncutCount === 1 ? "" : "s"} longer than any length left
                          </span>
                        )}
                      </td>
                    </tr>,
                  ]
                })}
                {kindOthers.map((l, i) => (
                  <tr key={`${kind}-other-${i}`}>
                    <td colSpan={2}>
                      {l.material}
                      {showUses && <span className={styles.uses}>{l.uses.join(" · ")}</span>}
                    </td>
                    <td className={styles.qty}>{qty(l)}</td>
                  </tr>
                ))}
              </tbody>
            )
          })}
        </table>
      </div>
      {note && <p className={styles.note}>{note}</p>}
    </div>
  )
}

export default StairOrderCard
