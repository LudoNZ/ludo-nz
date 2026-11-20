"use client"

import Button from "@/components/button/button"
import FrameForm from "@/components/floorFraming/frameForm"
import FramePlanView from "@/components/floorFraming/framePlanView"
import { rectangleOutline, SHEET_PRESETS, SUPPORT_LABELS } from "@/components/floorFraming/frame"
import { DECK_EDGE_NAMES, deckStairHost, deckTopLevelM, SiteDeck, siteDeckFrame, siteDeckHours, SitePlaced, SiteStair, StairPlacement } from "@/components/site/siteProject"
import { UnitField } from "../retaining-walls/obstructionsCard"
import StairsCard, { StairHostInfo } from "./stairsCard"
import { DECK_COLOR } from "./siteView"
import styles from "../retaining-walls/obstructionsCard.module.scss"

const CORNERS = ["the top-left corner", "the top-right corner", "the bottom-right corner", "the bottom-left corner"]

/** a deck's edges, as somewhere stairs come down from */
const deckHostInfo = (d: SiteDeck): StairHostInfo => ({
  noun: "deck",
  segments: deckStairHost(d).segments,
  locked: false,
  // a new stair comes off the bottom edge, toward you on the plan
  shownSegment: 2,
  endName: (i, which) => CORNERS[(which === "start" ? i : i + 1) % 4],
  segmentName: (i) => DECK_EDGE_NAMES[i] ?? `Edge ${i + 1}`,
})

/** The decks (and floors) on the site: each a rectangle framed by the
 * Floor Framing engine — size, where it sits and how it's turned, the
 * ground under it, what holds it up and what's on top — with stairs off
 * any of its edges, their rise the deck's height. One open at a time. */
const DecksCard: React.FC<{
  decks: SiteDeck[]
  stairs: SiteStair[]
  placements: SitePlaced[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onChange: (decks: SiteDeck[]) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onChangeStairs: (deckId: string, next: SiteStair[]) => void
  selectedStair: string | null
  onSelectStair: (id: string | null) => void
  calculatorHref: (stairId: string) => string
}> = ({ decks, stairs, placements, selectedId, onSelect, onChange, onAdd, onRemove, onChangeStairs, selectedStair, onSelectStair, calculatorHref }) => {
  const update = (id: string, patch: Partial<SiteDeck>) => onChange(decks.map((d) => (d.id === id ? { ...d, ...patch } : d)))

  return (
    <section className={styles.card} id="site-decks">
      <div className={styles.header}>
        <h3>Decks and floors</h3>
        <Button size="small" variant="secondary" onClick={onAdd}>
          Add deck
        </Button>
      </div>
      {decks.length === 0 && (
        <p className={styles.hint}>
          A deck (or a floor under sheets) on the site: its frame — bearers and piles, or a ledger on the house — worked out
          by the Floor Framing engine, drawn on the plan and in 3D, in the order and the estimate. Stairs can come down off
          any of its edges.
        </p>
      )}
      {decks.map((d, n) => {
        const f = siteDeckFrame(d)
        const selected = d.id === selectedId
        const key = (k: string) => `deck-${d.id}-${k}`
        const mine = stairs.filter((s) => s.deckId === d.id)
        const placed = new Map<string, StairPlacement>(placements.filter((p) => p.deck?.id === d.id).map((p) => [p.placement.stair.id, p.placement]))
        const decked = d.frame.covering === "decking"
        return (
          <div key={d.id} className={selected ? styles.itemSelected : styles.item} style={{ borderLeftColor: DECK_COLOR }} onClick={() => !selected && onSelect(d.id)}>
            <div className={styles.itemHeader}>
              <strong>
                {n + 1}. {d.name}
              </strong>
              <span className={styles.itemActions}>
                <button
                  type="button"
                  className={styles.link}
                  aria-expanded={selected}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect(selected ? null : d.id)
                  }}
                >
                  {selected ? "Done" : "Edit"}
                </button>
                <button
                  type="button"
                  className={styles.link}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (window.confirm(`Remove "${d.name}"${mine.length ? ` and its ${mine.length} stair${mine.length > 1 ? "s" : ""}` : ""}?`)) onRemove(d.id)
                  }}
                >
                  Remove
                </button>
              </span>
            </div>
            <p className={styles.summary}>
              {d.lengthM.toFixed(2)} × {d.widthM.toFixed(2)} m · {decked ? "decking" : "sheet floor"} · {SUPPORT_LABELS[d.frame.support].toLowerCase()} · top RL {deckTopLevelM(d).toFixed(3)} ·{" "}
              {f.members.filter((m) => m.kind === "joist").length} joists {f.joistSize.replace("mm", "")}, {f.piles.length} piles · about {siteDeckHours(d)} h
              {mine.length ? ` · ${mine.length} stair${mine.length > 1 ? "s" : ""}` : ""}
            </p>
            {f.needsEngineer && <p className={styles.warn}>⚠ {f.needsEngineer}</p>}
            {f.warnings.map((w) => (
              <p key={w} className={styles.warn}>
                ⚠ {w}
              </p>
            ))}

            {selected && (
              <div onClick={(e) => e.stopPropagation()}>
                <div className={styles.grid} style={{ marginTop: "0.75rem" }}>
                  <div className={styles.field}>
                    <label htmlFor={key("name")}>Name</label>
                    <input
                      id={key("name")}
                      key={`${key("name")}-${d.name}`}
                      type="text"
                      defaultValue={d.name}
                      onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== d.name && update(d.id, { name: e.target.value.trim() })}
                    />
                  </div>
                  <UnitField id={key("length")} label="Length along the joists (m)" value={d.lengthM} scale={1} step={0.1} min={0.3} max={30} onCommit={(v) => v !== null && v >= 0.3 && update(d.id, { lengthM: v })} />
                  <UnitField id={key("width")} label="Width across the joists (m)" value={d.widthM} scale={1} step={0.1} min={0.3} max={30} onCommit={(v) => v !== null && v >= 0.3 && update(d.id, { widthM: v })} />
                  <UnitField id={key("x")} label="First corner, across the site (m)" value={d.xM} scale={1} step={0.1} onCommit={(v) => v !== null && update(d.id, { xM: v })} />
                  <UnitField id={key("y")} label="First corner, down the site (m)" value={d.yM} scale={1} step={0.1} onCommit={(v) => v !== null && update(d.id, { yM: v })} />
                  <UnitField id={key("rot")} label="Turned (°, clockwise)" value={d.rotationDeg} scale={1} step={5} min={-360} max={360} onCommit={(v) => v !== null && update(d.id, { rotationDeg: v })} />
                  <UnitField id={key("ground")} label="Ground under it (RL, m)" value={d.groundLevelM} scale={1} step={0.01} onCommit={(v) => v !== null && update(d.id, { groundLevelM: v })} />
                  <div className={styles.field}>
                    <label htmlFor={key("covering")}>On top</label>
                    <select
                      id={key("covering")}
                      value={d.frame.covering}
                      onChange={(e) => update(d.id, { frame: { ...d.frame, covering: e.target.value === "sheet" ? "sheet" : "decking", sheet: d.frame.sheet ?? { ...SHEET_PRESETS[0].sheet } } })}
                    >
                      <option value="decking">Decking boards (outside)</option>
                      <option value="sheet">Sheet flooring (inside)</option>
                    </select>
                  </div>
                  {decked && (
                    <>
                      <UnitField id={key("bw")} label="Board width (mm)" value={d.boardWidth} scale={1} step={5} min={40} max={300} onCommit={(v) => v !== null && v >= 40 && update(d.id, { boardWidth: v })} />
                      <UnitField id={key("gap")} label="Gap between boards (mm)" value={d.boardGap} scale={1} step={1} min={0} max={20} onCommit={(v) => v !== null && v >= 0 && update(d.id, { boardGap: v })} />
                    </>
                  )}
                </div>
                <p className={styles.status}>
                  Its own plan: joists run along its length, from its first corner (the dot on the site plan). The top of the{" "}
                  {decked ? "decking" : "floor"} is RL {deckTopLevelM(d).toFixed(3)} — the ground plus the height below.
                </p>
                <FrameForm
                  value={d.frame}
                  onChange={(frame) => update(d.id, { frame })}
                  mode={decked ? "deck" : "floor"}
                  supports={["bearers", "ledger"]}
                  showSpacing
                  endLabels={{ start: DECK_EDGE_NAMES[0], end: DECK_EDGE_NAMES[2] }}
                />
                <FramePlanView frame={f} outline={rectangleOutline(d.lengthM * 1000, d.widthM * 1000)} />
                <div style={{ marginTop: "1rem" }}>
                  <StairsCard
                    host={deckHostInfo(d)}
                    wallId=""
                    deckId={d.id}
                    stairs={mine}
                    placements={placed}
                    onChange={(next) => onChangeStairs(d.id, next)}
                    selectedId={selectedStair}
                    onSelect={onSelectStair}
                    calculatorHref={calculatorHref}
                  />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

export default DecksCard
