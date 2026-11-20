"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { OrderPiece, planBoardOrderDetailed } from "./calcSettings"
import { BoardHighlight, WallOrderRows } from "./postProfile"
import { segmentLabel } from "./wallPlan"
import { PartialBoardOrder, PlacedBoardOrder } from "./wallProject"
import styles from "./boardOrderCard.module.scss"

const m = (n: number, dp = 2) => `${n.toFixed(dp)} m`

/** where a piece goes, carried through the order planner with it */
interface PieceTag {
  segmentIndex: number
  /** row in its wall, from 0 at the bottom */
  row: number
  layer: "course" | "topBoard"
  courseRow: number
}

/** The board order, worked out live from the wall's cut list. "Suggested"
 * is what to buy with every length freely available. "Your order" starts
 * the same; type a number against a length to pin it — what the supplier
 * can actually give you, 0 if they have none — and the other lengths
 * re-work themselves to cover the rest.
 *
 * "Partial order" narrows the cut list to chosen walls, and to the first
 * so-many rows of each (counted from the bottom, the top board being the
 * last row) — for ordering a job in stages. It keeps its own pinned
 * counts, so the whole-wall order is still there to come back to.
 *
 * "Place order" (partial view) logs what's on the table as an order
 * placed. Rows already covered by a placed order are left out of the
 * next one, so the partial view always works out just what's still to
 * buy — and "Order everything remaining" selects the lot. */
const BoardOrderCard: React.FC<{
  /** every wall's boards, by row from the bottom up */
  walls: WallOrderRows[]
  stockLengthsM: number[]
  /** pinned counts for the whole-wall order, keyed by String(lengthM) */
  fixed: Record<string, number>
  onChange: (fixed: Record<string, number>) => void
  partial: PartialBoardOrder
  onPartialChange: (partial: PartialBoardOrder) => void
  /** orders already placed, oldest first */
  placed: PlacedBoardOrder[]
  onPlacedChange: (placed: PlacedBoardOrder[]) => void
  /** the boards cut from the length picked in the table (none = []), for
   * the elevation to pick out */
  onHighlight: (boards: BoardHighlight[]) => void
}> = ({ walls, stockLengthsM, fixed, onChange, partial, onPartialChange, placed, onPlacedChange, onHighlight }) => {
  const isPartial = partial.enabled
  /** rows of this wall in the partial order — all of them until told otherwise */
  const rowsFor = (wall: WallOrderRows) => Math.min(wall.rows.length, partial.wallRows[String(wall.segmentIndex)] ?? wall.rows.length)

  /** rows of each wall a placed order already covers, keyed by wall index */
  const coveredRows = useMemo(() => {
    const covered = new Map<number, Set<number>>()
    for (const order of placed)
      for (const w of order.walls) {
        const rows = covered.get(w.segmentIndex) ?? new Set<number>()
        for (let r = w.fromRow; r < w.toRow; r++) rows.add(r)
        covered.set(w.segmentIndex, rows)
      }
    return covered
  }, [placed])
  const orderedCount = (wall: WallOrderRows) => wall.rows.filter((_, r) => coveredRows.get(wall.segmentIndex)?.has(r)).length

  /** the rows this order is for: in partial view, each selected wall's
   * rows up to its chosen count that no placed order has covered yet */
  const selection = useMemo(
    () =>
      walls.map((wall) => {
        const upTo = partial.enabled ? Math.min(wall.rows.length, partial.wallRows[String(wall.segmentIndex)] ?? wall.rows.length) : wall.rows.length
        const rows = Array.from({ length: upTo }, (_, r) => r).filter((r) => !partial.enabled || !coveredRows.get(wall.segmentIndex)?.has(r))
        return { wall, rows }
      }),
    [walls, partial.enabled, partial.wallRows, coveredRows],
  )
  const piecesM = useMemo(
    () =>
      selection.flatMap(({ wall, rows }) =>
        rows.flatMap((r) =>
          wall.rows[r].map(
            (piece): OrderPiece<PieceTag> => ({
              baysM: piece.baysM,
              startPost: piece.startPost,
              tag: { segmentIndex: wall.segmentIndex, row: r, layer: piece.layer, courseRow: piece.courseRow },
            }),
          ),
        ),
      ),
    [selection],
  )
  const activeFixed = isPartial ? partial.fixed : fixed
  const setActiveFixed = (next: Record<string, number>) => (isPartial ? onPartialChange({ ...partial, fixed: next }) : onChange(next))

  const suggested = useMemo(() => planBoardOrderDetailed(piecesM, stockLengthsM), [piecesM, stockLengthsM])
  const mine = useMemo(() => planBoardOrderDetailed(piecesM, stockLengthsM, activeFixed), [piecesM, stockLengthsM, activeFixed])
  const anyFixed = mine.lines.some((l) => l.fixed)
  const neededM = piecesM.reduce((t, p) => t + p.baysM.reduce((a, w) => a + w, 0), 0)

  // the length picked in the table: its boards are picked out on the
  // elevation and listed, cut by cut, under the table
  const [pickedLength, setPickedLength] = useState<number | null>(null)
  const [showAllCuts, setShowAllCuts] = useState(false)
  const picked = pickedLength !== null && stockLengthsM.includes(pickedLength) ? pickedLength : null
  const highlight = useMemo(
    () =>
      picked === null
        ? []
        : mine.boards
            .filter((board) => board.lengthM === picked)
            .flatMap((board) => board.cuts)
            .filter((cut) => cut.startPost !== null && cut.endPost !== null && cut.tag)
            .map((cut): BoardHighlight => ({ startPost: cut.startPost!, endPost: cut.endPost!, layer: cut.tag!.layer, courseRow: cut.tag!.courseRow })),
    [mine, picked],
  )
  const lastHighlight = useRef("[]")
  useEffect(() => {
    const json = JSON.stringify(highlight)
    if (json === lastHighlight.current) return
    lastHighlight.current = json
    onHighlight(highlight)
  }, [highlight, onHighlight])
  const whereOf = (tag: PieceTag | undefined, startPost: number | null, endPost: number | null) =>
    !tag
      ? ""
      : `${walls.length > 1 ? `Wall ${segmentLabel(tag.segmentIndex)}, ` : ""}${tag.layer === "topBoard" ? "top board" : `row ${tag.row + 1}`}${
          startPost !== null && endPost !== null ? `, posts #${startPost + 1}–#${endPost + 1}` : ""
        }`
  // each board numbered within its own length: "5.4 m board 3"
  const cutListBoards = useMemo(() => {
    const seen = new Map<number, number>()
    return mine.boards.map((board) => {
      const number = (seen.get(board.lengthM) ?? 0) + 1
      seen.set(board.lengthM, number)
      return { board, number }
    })
  }, [mine]).filter(({ board }) => showAllCuts || board.lengthM === picked)

  const setCount = (lengthM: number, raw: string) => {
    const next = { ...activeFixed }
    const n = parseInt(raw, 10)
    if (raw.trim() === "" || !(n >= 0)) delete next[String(lengthM)]
    else next[String(lengthM)] = n
    setActiveFixed(next)
  }

  const setWallRows = (wall: WallOrderRows, rows: number) =>
    onPartialChange({
      ...partial,
      wallRows: { ...partial.wallRows, [String(wall.segmentIndex)]: Math.max(0, Math.min(wall.rows.length, Math.round(rows))) },
    })

  const totalRows = walls.reduce((t, wall) => t + wall.rows.length, 0)
  const totalOrdered = walls.reduce((t, wall) => t + orderedCount(wall), 0)
  const selectEverything = () =>
    onPartialChange({ ...partial, enabled: true, wallRows: Object.fromEntries(walls.map((wall) => [String(wall.segmentIndex), wall.rows.length])) })

  const placeOrder = () => {
    // each wall's rows as runs of consecutive rows
    const ranges: PlacedBoardOrder["walls"] = []
    for (const { wall, rows } of selection) {
      for (const r of rows) {
        const last = ranges[ranges.length - 1]
        if (last && last.segmentIndex === wall.segmentIndex && last.toRow === r) last.toRow = r + 1
        else ranges.push({ segmentIndex: wall.segmentIndex, fromRow: r, toRow: r + 1 })
      }
    }
    if (ranges.length === 0) return
    onPlacedChange([
      ...placed,
      {
        id: Date.now().toString(36),
        placedAt: new Date().toISOString(),
        walls: ranges,
        lines: mine.lines.filter((l) => l.count > 0).map(({ lengthM, count }) => ({ lengthM, count })),
        boardCount: mine.boardCount,
        totalLengthM: mine.totalLengthM,
      },
    ])
    // the next order starts from the suggestion again
    onPartialChange({ ...partial, fixed: {} })
  }

  const removeOrder = (order: PlacedBoardOrder, number: number) => {
    if (!window.confirm(`Remove order ${number} from the log? Its rows will count as still to order.`)) return
    onPlacedChange(placed.filter((o) => o.id !== order.id))
  }

  const describeRows = (order: PlacedBoardOrder) =>
    order.walls
      .map((w) => {
        const total = walls.find((wall) => wall.segmentIndex === w.segmentIndex)?.rows.length
        const rows = w.toRow - w.fromRow === 1 ? `row ${w.fromRow + 1}` : `rows ${w.fromRow + 1}–${w.toRow}`
        return `${walls.length > 1 ? `${segmentLabel(w.segmentIndex)}: ` : ""}${rows}${total !== undefined && w.toRow >= total ? " (incl. top board)" : ""}`
      })
      .join(" · ")
  const when = (iso: string) => {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
  }

  const selectedWalls = walls.filter((wall) => rowsFor(wall) > 0)
  const title = !isPartial
    ? "Board order — whole wall"
    : selectedWalls.length === 0
      ? "Board order — partial (nothing selected)"
      : `Board order — partial: ${walls.length > 1 ? `wall${selectedWalls.length > 1 ? "s" : ""} ${selectedWalls.map((w) => segmentLabel(w.segmentIndex)).join(", ")}` : `${rowsFor(walls[0])} of ${walls[0].rows.length} rows`}`

  return (
    <div className={styles.card}>
      <div className={styles.titleRow}>
        <h3>{title}</h3>
        <button
          type="button"
          className={isPartial ? styles.modeOn : styles.mode}
          aria-pressed={isPartial}
          onClick={() => onPartialChange({ ...partial, enabled: !isPartial })}
        >
          {isPartial ? "Partial order ✓ — back to whole wall" : "Partial order…"}
        </button>
      </div>
      <p className={styles.intro}>
        Facing boards and the top board together. Type a number against a length to set how many of it you&apos;re
        getting, or tap Not in stock if the supplier has none — the other lengths adjust to cover the rest. Clear a box
        to let it work itself out again.
      </p>

      {isPartial && (
        <div className={styles.partial}>
          <p className={styles.partialHint}>
            Tick the walls to order for, and how many rows of each. Rows count up from the bottom; the last row is the top
            board.
          </p>
          {walls.map((wall) => {
            const rows = rowsFor(wall)
            const total = wall.rows.length
            const name = walls.length > 1 ? `Wall ${segmentLabel(wall.segmentIndex)}` : "Wall"
            return (
              <div key={wall.segmentIndex} className={styles.wallRow}>
                <label className={styles.wallTick}>
                  <input type="checkbox" checked={rows > 0} onChange={(e) => setWallRows(wall, e.target.checked ? total : 0)} />
                  <span>{name}</span>
                </label>
                <span className={styles.rowStepper}>
                  <button type="button" aria-label={`One row fewer for ${name}`} disabled={rows <= 0} onClick={() => setWallRows(wall, rows - 1)}>
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={total}
                    step={1}
                    inputMode="numeric"
                    aria-label={`Rows to order for ${name}`}
                    value={rows}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10)
                      if (n >= 0) setWallRows(wall, n)
                    }}
                  />
                  <span>/ {total} rows</span>
                  <button type="button" aria-label={`One row more for ${name}`} disabled={rows >= total} onClick={() => setWallRows(wall, rows + 1)}>
                    +
                  </button>
                </span>
                <span className={styles.wallNote}>
                  {rows === 0
                    ? "not in this order"
                    : rows === total
                      ? "all rows, top board included"
                      : `bottom ${rows} row${rows > 1 ? "s" : ""} — top board not included`}
                  {orderedCount(wall) > 0 &&
                    ` · ${orderedCount(wall)} already ordered, ${selection.find((sel) => sel.wall === wall)?.rows.length ?? 0} new in this order`}
                </span>
              </div>
            )
          })}
          <div className={styles.partialActions}>
            <button type="button" className={styles.secondaryButton} onClick={selectEverything} disabled={totalOrdered >= totalRows}>
              Order everything remaining
            </button>
            <span className={styles.wallNote}>
              {totalOrdered === 0
                ? "No orders placed yet."
                : totalOrdered >= totalRows
                  ? "Every row has been ordered."
                  : `${totalOrdered} of ${totalRows} rows ordered so far — the table below only covers rows not yet ordered.`}
            </span>
          </div>
        </div>
      )}

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
              <tr key={line.lengthM} className={picked === line.lengthM ? styles.pickedRow : undefined}>
                <td>
                  <button
                    type="button"
                    className={picked === line.lengthM ? styles.lengthPicked : styles.lengthPick}
                    aria-pressed={picked === line.lengthM}
                    title="Show these boards on the elevation, and their cuts below"
                    onClick={() => setPickedLength(picked === line.lengthM ? null : line.lengthM)}
                  >
                    {m(line.lengthM, 1)}
                  </button>
                </td>
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
                    value={line.fixed ? activeFixed[String(line.lengthM)] : ""}
                    onChange={(e) => setCount(line.lengthM, e.target.value)}
                  />
                  {line.fixed ? (
                    <button type="button" className={styles.clear} onClick={() => setCount(line.lengthM, "")}>
                      {activeFixed[String(line.lengthM)] === 0 ? "Back in stock" : "Clear"}
                    </button>
                  ) : (
                    <>
                      <span className={styles.auto}>auto</span>
                      <button
                        type="button"
                        className={styles.clear}
                        title="The supplier has none of this length: order 0 and make it up from the others"
                        onClick={() => setCount(line.lengthM, "0")}
                      >
                        Not in stock
                      </button>
                    </>
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
          <tr title="Boards cut into that leave an offcut longer than 400 mm">
            <td>Offcuts over 400 mm</td>
            <td>{suggested.bigOffcutCount}</td>
            <td>{mine.bigOffcutCount}</td>
          </tr>
        </tfoot>
      </table>
      <p className={styles.pickHint}>
        {picked === null
          ? "Tap a length to pick out its boards on the elevation and list its cuts. "
          : `${m(picked, 1)} boards are picked out in blue on the elevation above. `}
        <button type="button" className={styles.clear} onClick={() => setShowAllCuts((v) => !v)}>
          {showAllCuts ? "Hide the full cut list" : "Show the full cut list"}
        </button>
      </p>
      {(showAllCuts || picked !== null) && (
        <div className={styles.cutList}>
          <h4>{showAllCuts ? "Cut list — every board on your order" : `Cut list — ${m(picked!, 1)} boards`}</h4>
          {cutListBoards.length === 0 ? (
            <p className={styles.wallNote}>No boards of this length on your order.</p>
          ) : (
            <ol>
              {cutListBoards.map(({ board, number }) => (
                <li key={`${board.lengthM}-${number}`}>
                  <span className={styles.cutBoard}>
                    {m(board.lengthM, 1)} board {number}
                  </span>
                  {board.cuts.length === 0 ? (
                    <span className={styles.wallNote}>spare — not cut</span>
                  ) : (
                    <ul>
                      {board.cuts.map((cut, k) => (
                        <li key={k}>
                          <strong>{Math.round(cut.lengthM * 1000)} mm</strong> — {whereOf(cut.tag, cut.startPost, cut.endPost)}
                        </li>
                      ))}
                      <li className={styles.wallNote}>{board.leftM > 0.0005 ? `offcut ${Math.round(board.leftM * 1000)} mm` : "no offcut"}</li>
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
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
      {isPartial && (
        <div className={styles.placeRow}>
          <button type="button" className={styles.placeButton} onClick={placeOrder} disabled={piecesM.length === 0}>
            Place order
          </button>
          <span className={styles.wallNote}>
            {piecesM.length === 0
              ? "Nothing new to order in this selection."
              : `Logs your order of ${mine.boardCount} board${mine.boardCount === 1 ? "" : "s"} (${m(mine.totalLengthM)}) below, and takes these rows off what's left to order.`}
          </span>
        </div>
      )}
      {placed.length > 0 && (
        <div className={styles.log}>
          <h4>Orders placed</h4>
          <ol>
            {placed.map((order, i) => (
              <li key={order.id}>
                <div className={styles.logHead}>
                  <strong>Order {i + 1}</strong>
                  <span>{when(order.placedAt)}</span>
                  <button type="button" className={styles.clear} onClick={() => removeOrder(order, i + 1)}>
                    Remove
                  </button>
                </div>
                <div className={styles.logLines}>
                  {order.lines.map((l) => `${l.count} × ${m(l.lengthM, 1)}`).join(", ") || "no boards"} — {order.boardCount} board
                  {order.boardCount === 1 ? "" : "s"}, {m(order.totalLengthM)}
                </div>
                <div className={styles.logRows}>{describeRows(order)}</div>
              </li>
            ))}
          </ol>
          <p className={styles.logTotal}>
            Ordered in total: {placed.reduce((t, o) => t + o.boardCount, 0)} boards, {m(placed.reduce((t, o) => t + o.totalLengthM, 0))} ·{" "}
            {totalOrdered} of {totalRows} rows covered
            {totalOrdered < totalRows && !isPartial && (
              <>
                {" · "}
                <button type="button" className={styles.clear} onClick={selectEverything}>
                  Order everything remaining
                </button>
              </>
            )}
          </p>
        </div>
      )}
      <p className={styles.note}>
        {isPartial ? "This part of the job" : "The wall"} needs {m(neededM)} of board fixed in place. Worked out longest
        pieces first, cutting shorter pieces from offcuts where they fit, and choosing each new board&apos;s length to
        leave the least offcut (a longer board that takes two pieces beats a short one barely used; offcuts over 400 mm
        are avoided where the lengths available allow) — no allowance for saw cuts, damaged boards or
        waste, so round up as you see fit.
        {isPartial && " The partial order keeps its own numbers; the whole-wall order is unchanged underneath."}
        {anyFixed && (
          <>
            {" "}
            <button type="button" className={styles.clear} onClick={() => setActiveFixed({})}>
              Reset to the suggested order
            </button>
          </>
        )}
      </p>
    </div>
  )
}

export default BoardOrderCard
