"use client"

import { useMemo } from "react"
import { planBoardOrderDetailed } from "./calcSettings"
import styles from "./boardOrderCard.module.scss"

const m = (n: number, dp = 2) => `${n.toFixed(dp)} m`

/** The board order, worked out live from the wall's cut list. "Suggested"
 * is what to buy with every length freely available. "Your order" starts
 * the same; type a number against a length to pin it — what the supplier
 * can actually give you, 0 if they have none — and the other lengths
 * re-work themselves to cover the rest. */
const BoardOrderCard: React.FC<{
  /** every piece to cut, as the bay lengths it spans */
  piecesM: number[][]
  stockLengthsM: number[]
  /** pinned counts, keyed by String(lengthM) */
  fixed: Record<string, number>
  onChange: (fixed: Record<string, number>) => void
}> = ({ piecesM, stockLengthsM, fixed, onChange }) => {
  const suggested = useMemo(() => planBoardOrderDetailed(piecesM, stockLengthsM), [piecesM, stockLengthsM])
  const mine = useMemo(() => planBoardOrderDetailed(piecesM, stockLengthsM, fixed), [piecesM, stockLengthsM, fixed])
  const anyFixed = mine.lines.some((l) => l.fixed)
  const neededM = piecesM.reduce((t, p) => t + p.reduce((a, w) => a + w, 0), 0)

  const setCount = (lengthM: number, raw: string) => {
    const next = { ...fixed }
    const n = parseInt(raw, 10)
    if (raw.trim() === "" || !(n >= 0)) delete next[String(lengthM)]
    else next[String(lengthM)] = n
    onChange(next)
  }

  return (
    <div className={styles.card}>
      <h3>Board order — whole wall</h3>
      <p className={styles.intro}>
        Facing boards and the top board together. Type a number against a length to set how many of it you&apos;re
        getting (0 if the supplier has none) — the other lengths adjust to cover the rest. Clear a box to let it work
        itself out again.
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Length</th>
            <th>Suggested</th>
            <th>Your order</th>
          </tr>
        </thead>
        <tbody>
          {mine.lines.map((line, i) => {
            const spare = line.count - line.usedCount
            return (
              <tr key={line.lengthM}>
                <td>{m(line.lengthM, 1)}</td>
                <td>{suggested.lines[i].count}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    aria-label={`${m(line.lengthM, 1)} boards on your order`}
                    className={line.fixed ? styles.fixedInput : undefined}
                    placeholder={`${line.count}`}
                    value={line.fixed ? fixed[String(line.lengthM)] : ""}
                    onChange={(e) => setCount(line.lengthM, e.target.value)}
                  />
                  {line.fixed ? (
                    <button type="button" className={styles.clear} onClick={() => setCount(line.lengthM, "")}>
                      Clear
                    </button>
                  ) : (
                    <span className={styles.auto}>auto</span>
                  )}
                  {spare > 0 && <span className={styles.spare}>{spare} spare</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>Boards</td>
            <td>{suggested.boardCount}</td>
            <td>{mine.boardCount}</td>
          </tr>
          <tr>
            <td>Total length</td>
            <td>{m(suggested.totalLengthM)}</td>
            <td>{m(mine.totalLengthM)}</td>
          </tr>
          <tr>
            <td>Offcuts &amp; spare</td>
            <td>{m(suggested.wasteM)}</td>
            <td>{m(mine.wasteM)}</td>
          </tr>
        </tfoot>
      </table>
      {mine.extraJoins > 0 && (
        <p className={styles.warn}>
          ⚠ {mine.extraJoins} board{mine.extraJoins > 1 ? "s" : ""} had to be split into shorter pieces at a post, because
          nothing long enough was left on this order — {mine.extraJoins} more join{mine.extraJoins > 1 ? "s" : ""} than
          the elevation shows.
        </p>
      )}
      {mine.uncutCount > 0 && (
        <p className={styles.warn}>
          ⚠ This order is short: {mine.uncutCount} piece{mine.uncutCount > 1 ? "s" : ""} ({m(mine.uncutLengthM)}) can&apos;t
          be cut from it. Add boards, or clear a box so that length can make up the difference.
        </p>
      )}
      <p className={styles.note}>
        The wall needs {m(neededM)} of board fixed in place. Worked out longest pieces first, cutting shorter pieces from
        offcuts where they fit — no allowance for saw cuts, damaged boards or waste, so round up as you see fit.
        {anyFixed && (
          <>
            {" "}
            <button type="button" className={styles.clear} onClick={() => onChange({})}>
              Reset to the suggested order
            </button>
          </>
        )}
      </p>
    </div>
  )
}

export default BoardOrderCard
