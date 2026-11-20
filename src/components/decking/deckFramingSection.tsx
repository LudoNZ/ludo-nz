"use client"

import { useMemo, useState } from "react"
import Button from "@/components/button/button"
import FrameForm from "@/components/floorFraming/frameForm"
import FramePlanView from "@/components/floorFraming/framePlanView"
import FrameSpecCards from "@/components/floorFraming/frameSpecCards"
import FrameRenderView from "@/components/floorFraming/frameRenderView"
import ReferenceTableModal from "@/components/floorFraming/referenceTableModal"
import { DEFAULT_DECK_FRAME, FrameInput } from "@/components/floorFraming/frame"
import { frameOrder } from "@/components/floorFraming/frameOrder"
import { combineOrder, StairOrderLine } from "@/components/stairs/stairMaterials"
import StairOrderCard from "@/components/stairs/stairOrderCard"
import { deckEndLabels, deckFrameLayout, deckOutline } from "./deckFrame"
import { DeckLayout } from "./layout"
import { DeckConfig } from "./types"
import styles from "./deckFramingSection.module.scss"

/** joists each board crosses, ends included — two screws at each */
function boardCrossings(layout: DeckLayout): number {
  let n = 0
  for (const row of layout.rows) for (const b of row.boards) n += layout.joistPositions.filter((j) => j >= b.start - 1 && j <= b.end + 1).length
  return n
}

/** A deck's framing: what holds it up — bearers and piles, or a ledger on
 * the house — on the same engine as the Floor Framing calculator, laid
 * out under this deck's outline. The boards then go on its joists. With a
 * plan, the results, a 3D view with the boards on, and the deck's whole
 * order — framing, piles, concrete, boards and fixings — live. */
const DeckFramingSection: React.FC<{
  config: DeckConfig
  layout: DeckLayout
  onFrameChange: (frame: FrameInput | null) => void
}> = ({ config, layout, onFrameChange }) => {
  const [showTables, setShowTables] = useState(false)
  const frame = useMemo(() => deckFrameLayout(config), [config])
  const outline = useMemo(() => deckOutline(config), [config])
  const boards = useMemo(
    () => ({
      list: layout.rows.flatMap((r) => r.boards.map((b) => ({ start: b.start, end: b.end, rowStart: r.rowStart, rowEnd: r.rowEnd }))),
      runsAlong: config.boardDirection === "alongRake" ? ("y" as const) : ("x" as const),
    }),
    [layout, config.boardDirection],
  )
  const renderInput = useMemo(() => (frame ? { frame, boards } : null), [frame, boards])
  const order = useMemo(() => {
    if (!frame) return []
    const deckBoards: StairOrderLine[] = layout.shoppingList
      .filter((s) => s.used > 0)
      .map((s) => ({
        kind: "decking",
        use: "Decking boards",
        material: `${config.boardWidth} × ${frame.input.boardThicknessMm} decking`,
        size: `${config.boardWidth} x ${frame.input.boardThicknessMm}`,
        count: s.used,
        lengthM: s.stockLength / 1000,
        unit: "lengths",
      }))
    return combineOrder([...frameOrder(frame, { boardCrossings: boardCrossings(layout) }), ...deckBoards].map((line) => ({ line, from: "" })))
  }, [frame, layout, config.boardWidth])

  if (!config.frame || !frame || !renderInput)
    return (
      <div className={styles.empty}>
        <p>
          Work out what holds this deck up — bearers and piles, or a ledger on the house — and the boards go on the
          frame&apos;s own joists. You get the framing plan, a 3D view and the full order.
        </p>
        <Button size="small" onClick={() => onFrameChange({ ...DEFAULT_DECK_FRAME })}>
          Add framing
        </Button>
      </div>
    )

  const set = (f: FrameInput) => onFrameChange(f)
  const remove = () => {
    if (window.confirm("Take the framing off this deck? Its settings and order are lost; the boards go back on a plain joist grid.")) onFrameChange(null)
  }

  return (
    <div className={styles.section}>
      <FrameForm value={config.frame} onChange={set} mode="deck" endLabels={deckEndLabels(config)} />
      <p className={styles.hint}>
        Joist spacing ({config.joistSpacing} mm{config.firstBaySpacing !== config.joistSpacing ? `, first bay ${config.firstBaySpacing}` : ""}) is set
        with the deck&apos;s shape — edit the deck to change it. The frame puts a joist on each edge and spaces the rest
        evenly, at or under that.
      </p>
      <div className={styles.links}>
        <button type="button" className={styles.link} onClick={() => setShowTables(true)}>
          Reference tables →
        </button>
        <button type="button" className={styles.link} onClick={remove}>
          Remove framing
        </button>
      </div>
      <ReferenceTableModal isOpen={showTables} onClose={() => setShowTables(false)} frame={frame} />

      {frame.needsEngineer && <p className={styles.engineer}>⚠ {frame.needsEngineer} Past what this tool should specify — get it designed.</p>}
      {frame.warnings.length > 0 && (
        <ul className={styles.warnings}>
          {frame.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}

      <div className={styles.card}>
        <h3>Framing plan</h3>
        <FramePlanView frame={frame} outline={outline} />
      </div>
      <div className={styles.grid}>
        <FrameSpecCards frame={frame} />
      </div>
      <div className={styles.card}>
        <h3>3D view</h3>
        <FrameRenderView input={renderInput} fileName={`${config.name || "deck"}-3d`} />
      </div>
      <StairOrderCard
        title="Deck order"
        lines={order}
        intro="Framing, piles, concrete, the decking boards this layout uses, and fixings. Framing timber is planned from the cut pieces; the boards are the lengths the layout cuts from."
        pins={config.frame.orderPins}
        onPinsChange={(orderPins) => set({ ...config.frame!, orderPins })}
      />
    </div>
  )
}

export default DeckFramingSection
