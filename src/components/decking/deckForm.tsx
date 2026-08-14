"use client"

import { useEffect, useRef, useState } from "react"
import Button from "@/components/button/button"
import { StoredProject } from "./data"
import { DeckConfig, sideBFromRakeAngle } from "./types"
import { insertMidpointOnLongestEdge, isSimplePolygon } from "./polygon"
import DeckShapeEditor from "./deckShapeEditor"
import PolygonShapeEditor from "./polygonShapeEditor"
import JoistExclusionMap from "./joistExclusionMap"
import styles from "./deckForm.module.scss"

// Board stock on hand lives in its own always-editable section on the
// deck detail page (boardStockPanel.tsx) now, not here — this form just
// carries `stock` through unchanged on save, same as any other field it
// doesn't offer its own control for.
type FormState = Omit<DeckConfig, "id" | "updatedAt">

const DeckForm: React.FC<{
  initial: Omit<DeckConfig, "id" | "updatedAt">
  /** projects this deck is eligible to join — already filtered to its own
   * location by the caller (a private deck can only pool with a private
   * project under the same account, a public deck only a public one). */
  projects: StoredProject[]
  onSave: (deck: Omit<DeckConfig, "id" | "updatedAt">) => void
  onCancel?: () => void
  saveLabel?: string
}> = ({ initial, projects, onSave, onCancel, saveLabel = "Save" }) => {
  const [state, setState] = useState<FormState>(initial)

  // Every field in this form funnels through setState, so rather than
  // hand-tracking "did this particular field change" at dozens of call
  // sites, just watch the whole state object: the initial mount's render
  // doesn't count (nothing's been touched yet), but any state update after
  // that — no matter which field it came from — means there's now
  // something unsaved. Once true it stays true for the rest of this form's
  // life; it only resets by unmounting (closing/reopening the editor).
  const isFirstRender = useRef(true)
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setDirty(true)
  }, [state])

  const num = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setState((s) => ({ ...s, [key]: Number(e.target.value) || 0 }))

  const isPolygon = Boolean(state.points && state.points.length >= 3)
  const shapeInvalid = isPolygon && !isSimplePolygon(state.points!)

  // Switches the form into polygon mode: the first press seeds points
  // from the current sideA/sideB/width (so the shape starts as exactly
  // what's on screen already) before adding the corner just asked for;
  // every press after that just adds one more. Once in polygon mode the
  // form stays there — see DeckConfig.points' doc comment.
  const handleAddCorner = () =>
    setState((s) => {
      const base = s.points && s.points.length >= 3
        ? s.points
        : [
            { x: 0, y: 0 },
            { x: s.sideA, y: 0 },
            { x: s.sideB, y: s.width },
            { x: 0, y: s.width },
          ]
      return { ...s, points: insertMidpointOnLongestEdge(base) }
    })

  // `state` is exactly Omit<DeckConfig, "id"|"updatedAt"> now (no more
  // stockRows override needing translation back), so it can go straight
  // through — no hand-listed field-by-field spread to keep in sync with
  // DeckConfig by hand every time a field's added (bitten by that once
  // already this session — see saveDeckWith in deckDetailPage.tsx).
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (shapeInvalid) return // the shape editor already shows why, inline
    onSave(state)
  }

  return (
    <form className={`${styles.form} ${dirty ? styles.formWithStickyActions : ""}`} onSubmit={handleSubmit}>
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

      {projects.length > 0 && (
        <div className={styles.field}>
          <label htmlFor="project">Project</label>
          <span className={styles.hint}>
            Share this deck&apos;s board stock with a project&apos;s pool instead of tracking its own
          </span>
          <select
            id="project"
            value={state.projectId ?? ""}
            onChange={(e) => {
              const projectId = e.target.value || undefined
              // joining/switching gets a fresh, later claim-order value
              // (see projectOrder's doc comment) — freely reorderable
              // afterwards from the project page
              setState((s) => ({ ...s, projectId, projectOrder: projectId ? Date.now() : s.projectOrder }))
            }}
          >
            <option value="">None — track its own stock</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.field}>
        <label>Deck shape</label>
        {isPolygon ? (
          <>
            <span className={styles.hint}>
              Drag a corner to reshape the deck, or tap a corner or side to type an exact angle or length
            </span>
            <PolygonShapeEditor
              points={state.points!}
              lockedEdgeLengths={state.lockedEdgeLengths}
              lockedVertexAngles={state.lockedVertexAngles}
              boardDirection={state.boardDirection}
              onShapeChange={(points, lockedEdgeLengths, lockedVertexAngles) =>
                setState((s) => ({ ...s, points, lockedEdgeLengths, lockedVertexAngles }))
              }
              onDirectionChange={(d) => setState((s) => ({ ...s, boardDirection: d }))}
            />
          </>
        ) : (
          <>
            <span className={styles.hint}>Tap a measurement to edit it, or grab and drag it to resize · tap the arrow to rotate the boards 90°</span>
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
            <button type="button" className={styles.addCornerLink} onClick={handleAddCorner}>
              + Add a corner to make an irregular shape
            </button>
          </>
        )}
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

      {shapeInvalid && <p className={styles.shapeInvalidNote}>⚠ Fix the crossed shape above before saving.</p>}
      <div className={`${styles.actions} ${dirty ? styles.actionsSticky : ""}`}>
        <Button type="submit" size="large" onClick={() => {}} disabled={shapeInvalid}>
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
