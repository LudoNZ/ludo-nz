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
import site from "./siteView.module.scss"

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
    <section className={site.card} id="site-decks">
      <div className={site.headRow}>
        <h2>Decks and floors</h2>
        <Button size="small" variant="secondary" onClick={onAdd}>
          Add deck
        </Button>
      </div>
      {decks.length === 0 && (
        <p className={site.hint}>
          A deck (or a floor under sheets) on the site: its frame — bearers and piles, or a ledger on the house — worked out
          by the Floor Framing engine, drawn on the plan and in 3D, in the order and the estimate. Stairs can come down off
          any of its edges.
        </p>
      )}
      {decks.map((d) => {
        const f = siteDeckFrame(d)
        const picked = d.id === selectedId
        const key = (k: string) => `deck-${d.id}-${k}`
        const mine = stairs.filter((s) => s.deckId === d.id)
        const placed = new Map<string, StairPlacement>(placements.filter((p) => p.deck?.id === d.id).map((p) => [p.placement.stair.id, p.placement]))
        const decked = d.frame.covering === "decking"
        const joists = f.members.filter((m) => m.kind === "joist").length
        return (
          <div key={d.id} className={picked ? site.itemPicked : site.item} style={picked ? undefined : { borderLeftColor: DECK_COLOR }} onClick={() => !picked && onSelect(d.id)}>
            <div className={site.itemHead}>
              <strong>{d.name}</strong>
              <span className={site.meta}>
                {d.lengthM.toFixed(2)} × {d.widthM.toFixed(2)} m · {d.frame.heightMm} mm high · {mine.length} stair{mine.length === 1 ? "" : "s"}
              </span>
              <span className={site.itemActions}>
                <Button
                  size="small"
                  variant={picked ? "secondary" : "primary"}
                  onClick={() => onSelect(picked ? null : d.id)}
                >
                  {picked ? "Done" : `Edit deck${mine.length ? " & stairs" : ""}`}
                </Button>
                <button
                  type="button"
                  className={site.link}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (window.confirm(`Remove ${d.name}${mine.length ? ` and its ${mine.length} stair${mine.length > 1 ? "s" : ""}` : ""} from the site?`)) onRemove(d.id)
                  }}
                >
                  Remove
                </button>
              </span>
            </div>
            <p className={site.meta}>
              {decked ? "Decking" : "Sheet floor"} {SUPPORT_LABELS[d.frame.support].toLowerCase()} · {joists} joists {f.joistSize.replace("mm", "").replace(" x ", " × ")} · {f.piles.length} piles · top RL{" "}
              {deckTopLevelM(d).toFixed(3)} · about {siteDeckHours(d)} h
            </p>
            {[...(f.needsEngineer ? [f.needsEngineer] : []), ...f.warnings].map((w) => (
              <p key={w} className={styles.warn}>
                ⚠ {w}
              </p>
            ))}

            {picked && (
              <div onClick={(e) => e.stopPropagation()}>
                <div className={site.fields}>
                  <div className={site.field}>
                    <label htmlFor={key("name")}>Name</label>
                    <input
                      id={key("name")}
                      key={`${key("name")}-${d.name}`}
                      defaultValue={d.name}
                      maxLength={60}
                      onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== d.name && update(d.id, { name: e.target.value.trim() })}
                    />
                  </div>
                  <UnitField id={key("length")} label="Length (m)" value={d.lengthM} scale={1} step={0.1} min={0.3} max={30} onCommit={(v) => v !== null && v >= 0.3 && update(d.id, { lengthM: v })} />
                  <UnitField id={key("width")} label="Width (m)" value={d.widthM} scale={1} step={0.1} min={0.3} max={30} onCommit={(v) => v !== null && v >= 0.3 && update(d.id, { widthM: v })} />
                  <UnitField id={key("x")} label="First corner — across (m)" value={d.xM} scale={1} step={0.05} onCommit={(v) => v !== null && update(d.id, { xM: v })} />
                  <UnitField id={key("y")} label="First corner — down (m)" value={d.yM} scale={1} step={0.05} onCommit={(v) => v !== null && update(d.id, { yM: v })} />
                  <div className={site.field}>
                    <label htmlFor={key("rot")}>Turned (° clockwise)</label>
                    <div className={site.rotate}>
                      <button type="button" onClick={() => update(d.id, { rotationDeg: (((d.rotationDeg - 15) % 360) + 360) % 360 })} aria-label="Turn 15° anticlockwise">
                        ↺
                      </button>
                      <input
                        id={key("rot")}
                        key={`${key("rot")}-${d.rotationDeg}`}
                        type="number"
                        step={1}
                        defaultValue={Math.round(d.rotationDeg * 10) / 10}
                        onBlur={(e) => {
                          const v = Number(e.target.value)
                          if (e.target.value !== "" && Number.isFinite(v)) update(d.id, { rotationDeg: ((v % 360) + 360) % 360 })
                        }}
                      />
                      <button type="button" onClick={() => update(d.id, { rotationDeg: (d.rotationDeg + 15) % 360 })} aria-label="Turn 15° clockwise">
                        ↻
                      </button>
                    </div>
                  </div>
                  <UnitField id={key("ground")} label="Ground under it (RL, m)" value={d.groundLevelM} scale={1} step={0.01} onCommit={(v) => v !== null && update(d.id, { groundLevelM: v })} />
                  <div className={site.field}>
                    <label htmlFor={key("covering")}>On top</label>
                    <select
                      id={key("covering")}
                      value={d.frame.covering}
                      onChange={(e) => update(d.id, { frame: { ...d.frame, covering: e.target.value === "sheet" ? "sheet" : "decking", sheet: d.frame.sheet ?? { ...SHEET_PRESETS[0].sheet } } })}
                    >
                      <option value="decking">Decking</option>
                      <option value="sheet">Sheet flooring</option>
                    </select>
                  </div>
                  {decked && (
                    <>
                      <UnitField id={key("bw")} label="Board width (mm)" value={d.boardWidth} scale={1} step={5} min={40} max={300} onCommit={(v) => v !== null && v >= 40 && update(d.id, { boardWidth: v })} />
                      <UnitField id={key("gap")} label="Gap between boards (mm)" value={d.boardGap} scale={1} step={1} min={0} max={20} onCommit={(v) => v !== null && v >= 0 && update(d.id, { boardGap: v })} />
                    </>
                  )}
                </div>
                <p className={site.hint}>
                  The joists run along its length, from its first corner (the dot on the site plan). The top of the {decked ? "decking" : "floor"} is RL{" "}
                  {deckTopLevelM(d).toFixed(3)} — the ground plus its height, below.
                </p>
                <h3 className={site.subhead}>Frame</h3>
                <FrameForm
                  value={d.frame}
                  onChange={(frame) => update(d.id, { frame })}
                  mode={decked ? "deck" : "floor"}
                  supports={["bearers", "ledger"]}
                  showSpacing
                  endLabels={{ start: DECK_EDGE_NAMES[0], end: DECK_EDGE_NAMES[2] }}
                />
                <div className={site.planBox}>
                  <FramePlanView frame={f} outline={rectangleOutline(d.lengthM * 1000, d.widthM * 1000)} />
                </div>
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
            )}
          </div>
        )
      })}
    </section>
  )
}

export default DecksCard
