"use client"

import { useState } from "react"
import Button from "@/components/button/button"
import { DeckConfig, sideBFromRakeAngle, StockItem } from "./types"
import DeckShapeEditor from "./deckShapeEditor"
import JoistExclusionMap from "./joistExclusionMap"
import styles from "./deckForm.module.scss"

type StockRow = { key: number; lengthText: string; quantity: number }

type FormState = Omit<DeckConfig, "id" | "updatedAt" | "stock"> & {
  stockRows: StockRow[]
}

let stockRowKeySeq = 0
const nextKey = () => stockRowKeySeq++

const toStockRows = (stock: StockItem[]): StockRow[] =>
  stock.length
    ? stock.map((s) => ({ key: nextKey(), lengthText: (s.length / 1000).toString(), quantity: s.quantity }))
    : [{ key: nextKey(), lengthText: "", quantity: 1 }]

const toFormState = (deck: Omit<DeckConfig, "id" | "updatedAt">): FormState => ({
  ...deck,
  stockRows: toStockRows(deck.stock),
})

const DeckForm: React.FC<{
  initial: Omit<DeckConfig, "id" | "updatedAt">
  onSave: (deck: Omit<DeckConfig, "id" | "updatedAt">) => void
  onCancel?: () => void
  saveLabel?: string
}> = ({ initial, onSave, onCancel, saveLabel = "Save" }) => {
  const [state, setState] = useState<FormState>(toFormState(initial))

  const num = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setState((s) => ({ ...s, [key]: Number(e.target.value) || 0 }))

  const updateRow = (key: number, patch: Partial<StockRow>) =>
    setState((s) => ({ ...s, stockRows: s.stockRows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }))

  const addRow = () => setState((s) => ({ ...s, stockRows: [...s.stockRows, { key: nextKey(), lengthText: "", quantity: 1 }] }))

  const removeRow = (key: number) =>
    setState((s) => ({ ...s, stockRows: s.stockRows.filter((r) => r.key !== key) }))

  const sortRows = () =>
    setState((s) => ({
      ...s,
      stockRows: [...s.stockRows].sort((a, b) => {
        const la = parseFloat(a.lengthText)
        const lb = parseFloat(b.lengthText)
        if (isNaN(la) && isNaN(lb)) return 0
        if (isNaN(la)) return 1 // blanks sort to the end
        if (isNaN(lb)) return -1
        return la - lb
      }),
    }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const stock: StockItem[] = state.stockRows
      .map((r) => ({ length: Math.round(parseFloat(r.lengthText) * 1000), quantity: Math.max(0, Math.round(r.quantity)) }))
      .filter((s) => !isNaN(s.length) && s.length > 0 && s.quantity > 0)
      .sort((a, b) => a.length - b.length)

    onSave({
      name: state.name,
      width: state.width,
      sideA: state.sideA,
      sideB: state.sideB,
      sideBLinked: state.sideBLinked,
      edgeLabels: state.edgeLabels,
      joistSpacing: state.joistSpacing,
      firstBaySpacing: state.firstBaySpacing,
      boardWidth: state.boardWidth,
      boardGap: state.boardGap,
      joinExclusions: state.joinExclusions,
      minStaggerJoists: state.minStaggerJoists,
      minSameRowJoinJoists: state.minSameRowJoinJoists,
      minEdgeJoists: state.minEdgeJoists,
      boardDirection: state.boardDirection,
      skeletonInterval: state.skeletonInterval,
      lengthBias: state.lengthBias,
      layoutSeed: state.layoutSeed,
      completedSegmentIds: state.completedSegmentIds,
      lockedRows: state.lockedRows,
      manualJoins: state.manualJoins,
      cutLog: state.cutLog,
      activeCutSegmentId: state.activeCutSegmentId,
      activeCutAccumulatedMs: state.activeCutAccumulatedMs,
      stock,
    })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label htmlFor="name">Deck name</label>
        <input
          id="name"
          type="text"
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          required
        />
      </div>

      <div className={styles.field}>
        <label>Deck shape</label>
        <span className={styles.hint}>Tap a measurement to edit it · tap the arrow to rotate the boards 90°</span>
        <DeckShapeEditor
          width={state.width}
          sideA={state.sideA}
          sideB={state.sideB}
          sideBLinked={state.sideBLinked}
          boardDirection={state.boardDirection}
          edgeLabels={state.edgeLabels}
          onWidthChange={(n) => setState((s) => ({ ...s, width: n }))}
          onSideAChange={(n) => setState((s) => ({ ...s, sideA: n, sideB: s.sideBLinked ? n : s.sideB }))}
          onSideBChange={(n) => setState((s) => ({ ...s, sideB: n, sideBLinked: false }))}
          onSideBReset={() => setState((s) => ({ ...s, sideBLinked: true, sideB: s.sideA }))}
          onRakeAngleChange={(deg) =>
            setState((s) => ({ ...s, sideB: sideBFromRakeAngle(s.sideA, s.width, deg), sideBLinked: false }))
          }
          onDirectionChange={(d) => setState((s) => ({ ...s, boardDirection: d }))}
          onLabelChange={(key, label) => setState((s) => ({ ...s, edgeLabels: { ...s.edgeLabels, [key]: label } }))}
        />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="boardWidth">Board width (mm)</label>
          <input id="boardWidth" type="number" min={10} value={state.boardWidth} onChange={num("boardWidth")} required />
        </div>
        <div className={styles.field}>
          <label htmlFor="boardGap">Board gap (mm)</label>
          <input id="boardGap" type="number" min={0} value={state.boardGap} onChange={num("boardGap")} required />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="joistSpacing">Joist centres (mm)</label>
          <span className={styles.hint}>For every bay after the first</span>
          <input
            id="joistSpacing"
            type="number"
            min={50}
            value={state.joistSpacing}
            onChange={num("joistSpacing")}
            required
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="firstBaySpacing">First bay (mm)</label>
          <span className={styles.hint}>Off the ledger/bearer — same as above if uniform</span>
          <input
            id="firstBaySpacing"
            type="number"
            min={50}
            value={state.firstBaySpacing}
            onChange={num("firstBaySpacing")}
            required
          />
        </div>
      </div>

      <div className={styles.field}>
        <label>Join spacing</label>
        <span className={styles.hint}>
          Where a red × sits, a join can&apos;t repeat that many rows and that many joist bays from
          another join — tap any cell to allow or forbid it
        </span>
        <JoistExclusionMap
          cells={state.joinExclusions}
          onChange={(cells) => setState((s) => ({ ...s, joinExclusions: cells }))}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="minEdgeJoists">Min. joist bays from row edge</label>
        <span className={styles.hint}>No join within this many bays of either end of a row</span>
        <input
          id="minEdgeJoists"
          type="number"
          min={0}
          value={state.minEdgeJoists}
          onChange={num("minEdgeJoists")}
          required
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="skeletonInterval">Skeleton row interval</label>
        <span className={styles.hint}>
          Every Nth row is laid first from your longest stock, staggered against the previous
          skeleton row; the rows in between are filled in afterwards from a randomised mix
        </span>
        <input
          id="skeletonInterval"
          type="number"
          min={2}
          value={state.skeletonInterval}
          onChange={num("skeletonInterval")}
          required
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="lengthBias">Stock length preference</label>
        <span className={styles.hint}>
          Nudges which length gets picked for a fill-in join when more than one on hand could reach —
          crank it toward &quot;shorter&quot; to burn through leftover offcuts first, or &quot;longer&quot;
          to save them and reach for fuller lengths instead. Doesn&apos;t affect skeleton rows or a
          row that finishes cleanly in one board — those stay waste-minimised either way.
        </span>
        <input
          id="lengthBias"
          type="range"
          min={-100}
          max={100}
          step={10}
          value={Math.round(state.lengthBias * 100)}
          onChange={(e) => setState((s) => ({ ...s, lengthBias: Number(e.target.value) / 100 }))}
        />
        <div className={styles.sliderLabels}>
          <span>Favour shorter</span>
          <span>Neutral</span>
          <span>Favour longer</span>
        </div>
      </div>

      <div className={styles.field}>
        <label>Board stock on hand</label>
        <span className={styles.hint}>Length (m) and how many of that length you have</span>
        <div className={styles.stockList}>
          {state.stockRows.map((row) => (
            <div key={row.key} className={styles.stockRow}>
              <input
                type="number"
                step="0.1"
                min={0}
                placeholder="Length (m)"
                value={row.lengthText}
                onChange={(e) => updateRow(row.key, { lengthText: e.target.value })}
                onBlur={sortRows}
                aria-label="Board length in metres"
              />
              <span className={styles.stockX}>×</span>
              <input
                type="number"
                min={0}
                value={row.quantity}
                onChange={(e) => updateRow(row.key, { quantity: Number(e.target.value) || 0 })}
                aria-label="Quantity"
              />
              <button
                type="button"
                className={styles.removeRow}
                onClick={() => removeRow(row.key)}
                aria-label="Remove this length"
              >
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
        </div>
      </div>

      <div className={styles.actions}>
        <Button type="submit" size="large" onClick={() => {}}>
          {saveLabel}
        </Button>
        {onCancel && (
          <Button size="medium" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}

export default DeckForm
