"use client"

import { ReactNode, useMemo, useState } from "react"
import SpecCard from "@/components/structures/specCard"
import { DiagramLegend, StairElevation, StairPlan } from "@/components/stairs/stairDiagrams"
import {
  BOARD_PRESETS,
  DEFAULT_INPUT,
  FRAMING_LABELS,
  POST_EMBED,
  POST_SIZE,
  NOG_DEPTH,
  FramingType,
  STACKED_FRAMES_SUGGESTED_MAX,
  MAIN_PRIVATE,
  MIN_RIP,
  OPEN_RISER_MAX_GAP,
  SERVICE,
  StairInput,
  TWO_R_PLUS_G,
  calculateStairs,
} from "@/components/stairs/stairs"
import { calculateLayout, resolveFlightTreads } from "@/components/stairs/layout"
import TurnedPlan from "@/components/stairs/turnedPlan"
import StairRenderView from "@/components/stairs/stairRenderView"
import { planMixedStock } from "@/components/stairs/stairs"
import { combineOrder, stairOrder } from "@/components/stairs/stairMaterials"
import StairOrderCard from "@/components/stairs/stairOrderCard"
import LayoutEditor from "./layoutEditor"
import DraftNumberInput from "./draftNumberInput"
import StepDetailModal from "./stepDetailModal"
import SectionRail, { RailSection } from "../retaining-walls/sectionRail"
import { ElevationIcon, MaterialsIcon, OrderIcon, PlanViewIcon, Render3DIcon, SlidersIcon, TopIcon } from "@/components/icons/icons"
import styles from "./stairsPage.module.scss"
import specStyles from "@/components/structures/specCard.module.scss"

const mm = (v: number) => `${Math.round(v)} mm`
/** the most a stair can rise, or run, in all: 100 m */
const MAX_TOTAL_MM = 100_000
const m = (v: number) => `${(v / 1000).toFixed(2)} m`

/** ok / service-only / fail for one dimension against the main and
 * service stair limits ("max" for rise, "min" for going). */
const levelOf = (v: number, main: number, service: number, kind: "max" | "min") => {
  const within = (lim: number) => (kind === "max" ? v <= lim + 0.05 : v >= lim - 0.05)
  return within(main) ? "readoutOk" : within(service) ? "readoutService" : "readoutFail"
}

const NumberField: React.FC<{
  id: string
  label: string
  hint?: string
  value: number
  min?: number
  max?: number
  step?: number
  unit?: string
  onChange: (v: number) => void
}> = ({ id, label, hint, value, min, max, step = 1, unit = "mm", onChange }) => (
  <div className={styles.field}>
    <label htmlFor={id}>{label}</label>
    {hint && <span className={styles.hint}>{hint}</span>}
    <div className={styles.numberUnit}>
      <DraftNumberInput id={id} min={min} max={max} step={step} value={Number(value.toFixed(1))} onValue={onChange} />
      <span>{unit}</span>
    </div>
  </div>
)

/** Straight flight of deck stairs between the ground and a deck: rise and
 * going worked out against NZBC D1, framed as straight stringers with
 * wedge blocks screwed on top to make each step, and the decking boards
 * laid out on every tread (and riser, if closed) — to-scale side and plan
 * views, plus a cut list. */
const StairsPage: React.FC<{
  /** set when the stair is part of something else (a site project): it
   * owns the inputs, and the page drops its own heading */
  value?: StairInput
  onChange?: (input: StairInput) => void
  /** the total rise is set from outside (the height of the wall the stair
   * comes down from) — shown read only, with why */
  riseNote?: string
  /** in place of the page's own heading and intro (a stair opened from a
   * site project) */
  header?: ReactNode
  /** the stair has its own top tread (stepping onto a wall, not a deck):
   * its frame and boards go in the order */
  extraTopTread?: boolean
}> = ({ value, onChange, riseNote, header, extraTopTread }) => {
  const [own, setOwn] = useState<StairInput>(DEFAULT_INPUT)
  const [stepDetailOpen, setStepDetailOpen] = useState(false)
  const [codeInfoOpen, setCodeInfoOpen] = useState(false)
  const input = value ?? own
  const setInput = (next: StairInput | ((s: StairInput) => StairInput)) => {
    const resolved = typeof next === "function" ? next(input) : next
    if (value) onChange?.(resolved)
    else setOwn(resolved)
  }
  const embedded = value !== undefined && header === undefined
  const set = <K extends keyof StairInput>(key: K, v: StairInput[K]) => setInput((s) => ({ ...s, [key]: v }))

  const r = useMemo(() => calculateStairs(input), [input])
  const turned = input.turns.length > 0
  // each step's run, so the whole stair runs no more than MAX_TOTAL_MM
  const maxGoing = Math.floor(MAX_TOTAL_MM / Math.max(1, r.treads))
  const layout = useMemo(() => (turned ? calculateLayout(input, r) : null), [turned, input, r])
  // the 3D view works off the plan layout for straight stairs too
  const renderLayout = useMemo(() => layout ?? calculateLayout(input, r), [layout, input, r])
  const flightTreads = resolveFlightTreads(input, r.risers).treads
  const order = useMemo(
    () => combineOrder(stairOrder(input, r, layout, { extraTopTread }).map((line) => ({ line, from: "" }))),
    [input, r, layout, extraTopTread],
  )

  const stacked = input.framing === "stacked-frames"
  const outer = input.framing === "outer-stringers"
  const stringerCount = outer ? 2 : r.supports.count
  const hasRip = r.treadBoards.some((b) => b.ripped)
  const rip = r.treadBoards.find((b) => b.ripped)
  const riserRip = r.riserBoardPieces.find((b) => b.ripped)

  const complianceText =
    r.compliance === "main"
      ? `Meets ${MAIN_PRIVATE.label.toLowerCase()} limits (rise ≤ ${MAIN_PRIVATE.maxRise}, run ≥ ${MAIN_PRIVATE.minGoing}, ≤ ${MAIN_PRIVATE.maxPitchDeg}°, 2 × rise + run ${TWO_R_PLUS_G.min}–${TWO_R_PLUS_G.max}).`
      : r.compliance === "service"
        ? `Only OK as a service stair (rise ≤ ${SERVICE.maxRise}, run ≥ ${SERVICE.minGoing}, ≤ ${SERVICE.maxPitchDeg}°) — ${r.serviceNotes.join("; ")}. A service stair is one that isn't the main way up, e.g. down to a back yard, shed or plant area. Not for the main entrance stair.`
        : `Doesn't meet the Building Code even as a service stair: ${r.failures.join("; ")}.`

  const notes: string[] = []
  // a sliver at the back of the tread that the next riser board stands
  // on is hidden under it, so it doesn't matter how thin it is
  const ripUnderRiser = !!rip && input.riserBoards && rip.offset >= r.treadDepth - input.boardThickness - 0.5
  if (rip && rip.width < MIN_RIP && !ripUnderRiser)
    notes.push(
      `The back board on each tread is ripped to only ${mm(rip.width)} — too thin to fix well. Change the nosing or run so boards fit.`,
    )
  if (riserRip && riserRip.width < MIN_RIP)
    notes.push(
      `The ${input.riserRip === "bottom" ? "bottom" : "top"} riser board is ripped to only ${mm(riserRip.width)} — change the gap between riser boards, or use a narrower board for the risers.`,
    )
  if (!input.riserBoards && r.treads > 0 && r.openRiserGap > OPEN_RISER_MAX_GAP)
    notes.push(
      `Open risers leave a ${mm(r.openRiserGap)} gap. Where young children could use the stair, openings must stop a 100 mm sphere passing through (NZBC clause F4, Safety from falling) — add riser boards or a batten.`,
    )
  if (r.wedges.needsWiderBoard)
    notes.push(
      `The wedges are too big for standard timber — the rise is over 290 mm.`,
    )
  if (input.boardThickness <= 25 && input.maxStringerSpacing > 450)
    notes.push(`${mm(input.boardThickness)} boards shouldn't span more than about 450 mm — bring the supports closer.`)
  if (outer && r.treads > 0 && r.riserJoists.ripFrom === null)
    notes.push(
      `The riser joists need to be ${mm(r.riserJoists.tallest)} deep — deeper than 290 mm stock. Lower the rise or double up.`,
    )
  if (stacked && r.frames.timberTooShallow)
    notes.push(
      `The tallest frame is ${mm(r.frames.tallest)} high — deeper than the ${mm(r.timberDepth)} timber. Use deeper timber or a packer on top.`,
    )
  if (stacked && r.treads > STACKED_FRAMES_SUGGESTED_MAX)
    notes.push(
      `${r.treads} stacked frames is a lot of timber and weight — past ${STACKED_FRAMES_SUGGESTED_MAX} steps the stringer and wedge blocks are usually the better build.`,
    )

  // the side panel for getting round the page, as the retaining wall
  // calculator has (not when it's inside a wall's page, which has its own)
  const railSections: RailSection[] = [
    { id: "st-top", label: "Top", icon: <TopIcon /> },
    { id: "st-inputs", label: "Stair & boards", icon: <SlidersIcon /> },
    { id: "st-plan", label: "From above", icon: <PlanViewIcon /> },
    { id: "st-side", label: "Side view", icon: <ElevationIcon /> },
    { id: "st-3d", label: "3D view", icon: <Render3DIcon /> },
    { id: "st-materials", label: "Materials", icon: <MaterialsIcon /> },
    { id: "st-order", label: "Order", icon: <OrderIcon /> },
  ]

  return (
    <div className={embedded ? styles.embedded : styles.stairsPage} id={embedded ? undefined : "st-top"}>
      {!embedded && <SectionRail sections={railSections} />}
      {header}
      {!embedded && header === undefined && (
        <>
          <h1>Stairs Calculator</h1>
          <p className={styles.intro}>
            A straight flight of deck stairs from the ground up to a deck. Set the height and it works out the fewest
            steps that meet the Building Code, frames them on straight stringers with wedge blocks, and shows exactly
            where the decking boards land on every tread.
          </p>
        </>
      )}

      <div className={styles.layout}>
        <form className={styles.form} onSubmit={(e) => e.preventDefault()} id={embedded ? undefined : "st-inputs"}>
          <fieldset>
            <legend>Stair</legend>
            <div className={styles.pair}>
            {riseNote ? (
              <div className={styles.field}>
                <label>Total rise</label>
                <span className={styles.hint}>{riseNote}</span>
                <strong>{mm(input.totalRise)}</strong>
              </div>
            ) : (
              <NumberField
                id="rise"
                label="Total rise"
                hint="Ground to the top of the deck boards"
                value={input.totalRise}
                min={100}
                max={MAX_TOTAL_MM}
                step={10}
                onChange={(v) => set("totalRise", Math.min(MAX_TOTAL_MM, Math.max(100, v)))}
              />
            )}
            {!layout && r.treads > 0 && (
              // the run of every step together: setting it sets each
              // step's run (to the whole mm), so the two stay in step
              <NumberField
                id="totalRun"
                label="Total run"
                hint={`Across ${r.treads} tread${r.treads === 1 ? "" : "s"}; sets each step's run`}
                value={r.totalRun}
                min={100 * r.treads}
                max={MAX_TOTAL_MM}
                step={10}
                onChange={(v) => set("going", Math.max(100, Math.floor(Math.min(MAX_TOTAL_MM, v) / r.treads)))}
              />
            )}
            </div>
            <div className={styles.field}>
              <label>Risers (steps up)</label>
              <span className={styles.hint}>
                {input.risers === null
                  ? `Auto — fewest that keep the rise ≤ ${MAIN_PRIVATE.maxRise} mm`
                  : "Set by hand"}
              </span>
              <div className={styles.stepper}>
                <button
                  type="button"
                  onClick={() => set("risers", Math.max(2, r.risers - 1))}
                  aria-label="One fewer riser"
                  disabled={r.risers <= 2}
                >
                  −
                </button>
                <span className={styles.stepperValue}>{r.risers}</span>
                <button type="button" onClick={() => set("risers", r.risers + 1)} aria-label="One more riser">
                  +
                </button>
                {input.risers !== null && (
                  <button type="button" className={styles.textButton} onClick={() => set("risers", null)}>
                    Auto
                  </button>
                )}
                {r.fewestRisersService < r.fewestRisersMain && r.risers !== r.fewestRisersService && (
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => set("risers", r.fewestRisersService)}
                    title={`Fewest risers at up to ${SERVICE.maxRise} mm — service stairs only`}
                  >
                    Squeeze ({r.fewestRisersService})
                  </button>
                )}
              </div>
              {/* live readout, so stepping risers up and down shows the
                  rise (and run) change right here */}
              <dl className={styles.readout}>
                <div className={styles[levelOf(r.rise, MAIN_PRIVATE.maxRise, SERVICE.maxRise, "max")]}>
                  <dt>Rise</dt>
                  <dd>{mm(r.rise)}</dd>
                </div>
                <div className={styles[levelOf(r.going, MAIN_PRIVATE.minGoing, SERVICE.minGoing, "min")]}>
                  <dt>Run</dt>
                  <dd>{mm(r.going)}</dd>
                </div>
                <div>
                  <dt>Treads</dt>
                  <dd>{r.treads}</dd>
                </div>
                <div>
                  <dt>{layout ? "Footprint" : "Total run"}</dt>
                  <dd>
                    {layout
                      ? `${((layout.bbox.maxX - layout.bbox.minX) / 1000).toFixed(1)}×${((layout.bbox.maxY - layout.bbox.minY) / 1000).toFixed(1)}`
                      : m(r.totalRun)}
                  </dd>
                </div>
              </dl>
            </div>
            <NumberField
              id="going"
              label="Run (each step)"
              hint={`Front to back of each step, nosing to nosing — min ${MAIN_PRIVATE.minGoing} (${SERVICE.minGoing} service)`}
              value={input.going}
              min={150}
              max={maxGoing}
              step={5}
              onChange={(v) => set("going", Math.min(maxGoing, Math.max(100, v)))}
            />
            <NumberField
              id="width"
              label="Stair width"
              value={input.width}
              min={300}
              max={6000}
              step={50}
              onChange={(v) => set("width", Math.max(300, v))}
            />
            <LayoutEditor
              flights={input.flights}
              turns={input.turns}
              treads={flightTreads}
              onChange={(flights, turns) => setInput((s) => ({ ...s, flights, turns }))}
            />
          </fieldset>

          <fieldset>
            <legend>Framing</legend>
            <div className={styles.field}>
              <label htmlFor="framing">Type</label>
              <select
                id="framing"
                value={input.framing}
                onChange={(e) => set("framing", e.target.value as FramingType)}
              >
                {(Object.keys(FRAMING_LABELS) as FramingType[]).map((f) => (
                  <option key={f} value={f}>
                    {FRAMING_LABELS[f]}
                  </option>
                ))}
              </select>
              <span className={styles.hint}>
                {outer
                  ? `Just the two outside stringers, with wedge blocks. Between them a joist at each riser runs from the top of its tread down to ${NOG_DEPTH} mm below the tread beneath, so ${NOG_DEPTH} mm nogs fit between the joists for the boards to fix to.`
                  : stacked
                  ? "A flat, level frame for each step, running all the way back to the deck. Each one sits on the frame below and is one step's run shorter. Best for small stairs."
                  : "An uncut stringer at the stair's pitch, with a right-angle triangle block (rise × run) fixed on top for each tread."}
              </span>
            </div>
            <div className={styles.row}>
              <div className={styles.field}>
                <div className={styles.fieldHeader}>
                  <label htmlFor="sDepth">{stacked ? "Timber depth" : "Stringer depth"}</label>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={input.stringerDepth === null}
                      onChange={(e) => set("stringerDepth", e.target.checked ? null : r.timberDepth)}
                    />
                    Auto
                  </label>
                </div>
                <div className={styles.numberUnit}>
                  <DraftNumberInput
                    id="sDepth"
                    min={90}
                    max={300}
                    step={10}
                    value={r.timberDepth}
                    disabled={input.stringerDepth === null}
                    onValue={(v) => set("stringerDepth", Math.max(90, v))}
                  />
                  <span>mm</span>
                </div>
              </div>
              <NumberField
                id="sThick"
                label="Thickness"
                value={input.stringerThickness}
                min={35}
                max={90}
                step={5}
                onChange={(v) => set("stringerThickness", Math.max(20, v))}
              />
            </div>
            {!stacked && (
              <span className={styles.hint}>
                {input.stringerDepth === null
                  ? r.stringer.posts.length
                    ? `Auto: no size spans ${m(r.stringer.topEdgeLength)} in one go, so 290 with support posts (BRANZ SG8 spans: 140 → 1.9 m, 190 → 2.6 m, 240 → 3.3 m, 290 → 4.0 m).`
                    : `Auto: the smallest size that spans ${m(r.stringer.topEdgeLength)} (BRANZ SG8 spans: 140 → 1.9 m, 190 → 2.6 m, 240 → 3.3 m, 290 → 4.0 m).`
                  : `A ${r.timberDepth} stringer spans ${m(r.stringer.maxSpan)}`}
                {r.stringer.posts.length > 0 &&
                  ` ${r.stringer.posts.length === 1 ? "A support post line is" : `${r.stringer.posts.length} support post lines are`} added part way up.`}
              </span>
            )}
            <NumberField
              id="sSpacing"
              label={stacked ? "Max joist spacing" : outer ? "Max nog spacing" : "Max stringer spacing"}
              hint="What the tread boards can span: 450 for 20 mm boards, 600 for 32 mm"
              value={input.maxStringerSpacing}
              min={300}
              max={900}
              step={50}
              onChange={(v) => set("maxStringerSpacing", Math.max(200, v))}
            />
          </fieldset>

          <fieldset>
            <legend>Decking boards</legend>
            <div className={styles.presetRow}>
              {BOARD_PRESETS.map((b) => {
                const active = input.boardWidth === b.width && input.boardThickness === b.thickness
                return (
                  <button
                    key={`${b.width}x${b.thickness}`}
                    type="button"
                    className={`${styles.textButton} ${active ? styles.presetActive : ""}`}
                    aria-pressed={active}
                    onClick={() =>
                      setInput((s) => ({
                        ...s,
                        boardWidth: b.width,
                        boardThickness: b.thickness,
                        maxStringerSpacing: b.maxSpan,
                      }))
                    }
                  >
                    {b.width} × {b.thickness}
                  </button>
                )
              })}
            </div>
            <div className={styles.row}>
              <NumberField
                id="bWidth"
                label="Width"
                value={input.boardWidth}
                min={40}
                max={300}
                step={5}
                onChange={(v) => set("boardWidth", Math.max(40, v))}
              />
              <NumberField
                id="bThick"
                label="Thickness"
                value={input.boardThickness}
                min={15}
                max={50}
                onChange={(v) => set("boardThickness", Math.max(10, v))}
              />
              <NumberField
                id="bGap"
                label="Gap"
                value={input.boardGap}
                min={0}
                max={15}
                onChange={(v) => set("boardGap", Math.max(0, v))}
              />
            </div>
            <div className={styles.field}>
              <div className={styles.fieldHeader}>
                <label htmlFor="nosing">Nosing overhang</label>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={input.nosing === null}
                    onChange={(e) => set("nosing", e.target.checked ? null : Math.round(r.nosing))}
                  />
                  Auto
                </label>
              </div>
              <span className={styles.hint}>
                {input.nosing === null
                  ? "Set so whole boards cover each tread, where that gives a sensible overhang"
                  : "How far the front board overhangs the riser"}
              </span>
              <div className={styles.numberUnit}>
                {/* typing a nosing sets it by hand (Auto goes off) */}
                <DraftNumberInput
                  id="nosing"
                  min={0}
                  max={60}
                  value={Math.round(r.nosing)}
                  onValue={(v) => set("nosing", Math.max(0, v))}
                />
                <span>mm</span>
              </div>
            </div>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={input.riserBoards}
                onChange={(e) => set("riserBoards", e.target.checked)}
              />
              Close the risers with decking boards
            </label>
            <button type="button" className={styles.textButton} onClick={() => setStepDetailOpen(true)}>
              Edit the step detail…
            </button>
          </fieldset>
        </form>
        <StepDetailModal
          isOpen={stepDetailOpen}
          onClose={() => setStepDetailOpen(false)}
          value={input}
          onChange={(next) => setInput(next)}
          maxRun={Math.max(150, maxGoing)}
        />

        <div className={styles.results}>
          <div className={`${styles.compliance} ${styles[r.compliance]}`}>
            <div className={styles.complianceHead}>
              <strong>
                {r.risers} risers of {mm(r.rise)} · {r.treads} treads of {mm(r.going)} · {m(r.totalRun)} total run ·{" "}
                {r.pitchDeg.toFixed(1)}°
              </strong>
              <button
                type="button"
                className={`${specStyles.infoButton} ${codeInfoOpen ? specStyles.infoOpen : ""}`}
                aria-expanded={codeInfoOpen}
                aria-controls="stair-code-info"
                aria-label={codeInfoOpen ? "Hide when the Building Code applies" : "When does the Building Code apply?"}
                title={codeInfoOpen ? "Hide" : "When does the Building Code apply?"}
                onClick={() => setCodeInfoOpen((o) => !o)}
              >
                i
              </button>
            </div>
            <p>{complianceText}</p>
            {codeInfoOpen && (
              <div id="stair-code-info" className={styles.codeInfo}>
                <p>Whether the Building Code applies depends on what the stair is for:</p>
                <ul>
                  <li>
                    <strong>It&apos;s part of an access route</strong> (the normal way from the house or deck to the yard
                    or a gate): clause D1 applies. D1/AS1 is the easy way to show it complies, and a stair that fails the
                    checks above falls outside it.
                  </li>
                  <li>
                    <strong>It&apos;s a garden or landscape step</strong> up a bank or retaining wall, away from the
                    building: it&apos;s often not treated as an access route. It may also be exempt building work,
                    although exempt work still has to meet the Code where the Code applies. Landscape steps are often
                    built with long treads deliberately.
                  </li>
                </ul>
                <p>Your council or building consent authority can confirm which applies on your site.</p>
              </div>
            )}
          </div>

          {layout ? (
            <>
              {layout.errors.map((e) => (
                <p key={e} className={styles.error}>
                  ✕ {e}
                </p>
              ))}
              <div className={styles.diagramCard} id={embedded ? undefined : "st-plan"}>
                <h2>From above</h2>
                <TurnedPlan input={input} layout={layout} />
                <DiagramLegend
                  riserBoards={input.riserBoards}
                  hasRip={layout.flights.some((f) => f.boards.some((b) => b.ripped)) || layout.turns.some((t) => t.regions.some((g) => g.boards.some((b) => b.ripped)))}
                  angled={layout.taperedPieces > 0}
                  stacked={stacked}
                  outer={outer}
                  posts={layout.turns.some((t) => t.posts.length > 0) || layout.flights.some((f) => f.posts.length > 0)}
                />
              </div>
              {layout.flights
                .filter((f) => f.treads > 0)
                .map((f) => {
                  const next = layout.turns[f.index]
                  const top = next ? (next.spec.kind === "landing" ? "Landing" : "Winder") : "Deck"
                  return (
                    <div key={f.index} className={styles.diagramCard} id={!embedded && f.index === 0 ? "st-side" : undefined}>
                      <h2>
                        Run {f.index + 1} side view: {f.baseHeight > 0 ? `+${Math.round(f.baseHeight)}` : "ground"} up to{" "}
                        {top.toLowerCase()} at +{Math.round(f.topHeight)}
                      </h2>
                      <StairElevation input={f.subInput} result={f.sub} topLabel={top} />
                    </div>
                  )
                })}
            </>
          ) : r.treads === 0 ? (
            <p className={styles.note}>That&apos;s a single step — no stair framing needed.</p>
          ) : (
            <>
              <div className={styles.diagramCard} id={embedded ? undefined : "st-side"}>
                <h2>Side view</h2>
                <StairElevation input={input} result={r} />
                <DiagramLegend riserBoards={input.riserBoards} hasRip={hasRip || !!riserRip} stacked={stacked} outer={outer} posts={r.stringer.posts.length > 0} />
              </div>
              <div className={styles.diagramCard} id={embedded ? undefined : "st-plan"}>
                <h2>From above</h2>
                <StairPlan input={input} result={r} />
              </div>
            </>
          )}

          {r.treads > 0 && (
            <div className={styles.diagramCard} id={embedded ? undefined : "st-3d"}>
              <h2>3D view</h2>
              <StairRenderView
                input={input}
                layout={renderLayout}
                caption={`${r.risers} risers of ${mm(r.rise)} · ${r.treads} treads of ${mm(r.going)} · ${mm(input.width)} wide · ${FRAMING_LABELS[input.framing].toLowerCase()}`}
              />
            </div>
          )}

          {r.suggestedNosing !== null && (
            <p className={styles.tip}>
              Tip: a {mm(r.suggestedNosing)} nosing would cover each tread in whole boards, no rip.{" "}
              <button
                type="button"
                className={styles.textButton}
                onClick={() => set("nosing", Math.round(r.suggestedNosing!))}
              >
                Use it
              </button>
            </p>
          )}
          {[...notes, ...(layout?.notes ?? [])].map((n) => (
            <p key={n} className={styles.note}>
              ⚠ {n}
            </p>
          ))}

          {layout && (
            <div className={styles.resultsGrid} id={embedded ? undefined : "st-materials"}>
              <SpecCard
                title="Steps"
                rows={[
                  { label: "Rise", value: `${r.risers} × ${mm(r.rise)}` },
                  { label: "Run", value: mm(r.going) },
                  { label: "Pitch", value: `${r.pitchDeg.toFixed(1)}°` },
                  { label: "2 × rise + run", value: mm(r.twoRPlusG) },
                  {
                    label: "Longest climb",
                    value: `${m(layout.maxRiseBetweenLandings)} between landings`,
                  },
                ]}
              />
              <SpecCard
                title="Runs"
                rows={layout.flights.map((f) => ({
                  label: `Run ${f.index + 1}`,
                  value:
                    f.treads === 0
                      ? "no run, one riser between the turns"
                      : stacked
                        ? `${f.treads} treads, ${f.sub.frames.list.length} stacked frames`
                        : `${f.treads} treads · ${outer ? 2 : f.sub.supports.count} × ${f.sub.timberDepth}×${input.stringerThickness} at ${mm(f.sub.stringer.topEdgeLength)}${f.sub.stringer.posts.length ? ` · ${f.sub.stringer.posts.length} post line${f.sub.stringer.posts.length > 1 ? "s" : ""}` : ""}`,
                }))}
                note="Each flight is framed like a straight stair of its own (the framing type and sizes above), from the ground or the turn below up to the next turn or the deck. Its stringers sit on the landing or winder platform below and plumb-cut against the edge of the one above."
                noteToggle
              />
              {layout.turns.map((t) => (
                <SpecCard
                  key={t.index}
                  title={`Turn ${t.index + 1}: ${t.spec.angle}° ${t.spec.direction}, ${t.spec.kind === "landing" ? "landing" : `${t.regions.length} winders`}`}
                  rows={[
                    ...(t.spec.kind === "landing"
                      ? [
                          { label: "Level", value: `+${Math.round(t.regions[0].height)}` },
                          { label: "Length", value: mm(t.length) },
                        ]
                      : [
                          {
                            label: "Levels",
                            value: t.regions.map((g) => `+${Math.round(g.height)}`).join(", "),
                          },
                          { label: "Run at centre", value: mm(t.regions[0].going) },
                          { label: "Run at outside", value: mm(t.regions[0].outerGoing) },
                        ]),
                    {
                      label: "Platform",
                      value: `${m(t.frames[0].perimeter)} round, ${t.joistDepth}×${input.stringerThickness} joists${t.frames[0].joists.length ? ` + ${t.frames[0].joists.length} inside` : ""}`,
                    },
                    ...t.frames.slice(1).map((fr) => ({
                      label: `Winder frame ${fr.level}`,
                      value: `${mm(fr.height)} high, ${m(fr.perimeter)} round${fr.joists.length ? ` + ${fr.joists.length} joists` : ""}`,
                    })),
                    {
                      label: "Posts",
                      value: t.onPads
                        ? "sits on pads (too low for posts)"
                        : `${t.posts.length} × ${POST_SIZE}×${POST_SIZE} H5, ${mm(t.postLength)} long`,
                    },
                  ]}
                  note={
                    t.spec.kind === "landing"
                      ? `A platform: a frame of ${t.joistDepth} × ${input.stringerThickness} round the outside with joists at the board-span spacing inside, on ${POST_SIZE} × ${POST_SIZE} H5 posts set ${POST_EMBED} mm in concrete at the corners (and no more than 1.2 m apart). Landings want to be at least as wide as the stair and 900 mm long.`
                      : `The bottom winder is a platform covering the whole turn, on posts like a landing. Each winder above is a frame ${mm(r.rise)} high sitting on the one below, covering its own tread and every winder after it, so the winders stack up like the stacked-frames stair. Winder runs are taken at the centre of the stair width (the pitch line). They converge to a point at the inside corner, which wants a newel post. Check winder rules against D1/AS1.`
                  }
                  noteToggle
                />
              ))}
              {(() => {
                const stock = planMixedStock(layout.boardPieces)
                return (
                  <SpecCard
                    title="Decking boards"
                    rows={[
                      { label: "Pieces", value: `${layout.boardPieces.length}` },
                      { label: "Angled cuts", value: `${layout.taperedPieces}` },
                      {
                        label: "Total",
                        value: `${(layout.boardPieces.reduce((a, p) => a + p, 0) / 1000).toFixed(1)} m`,
                      },
                      { label: "Buy", value: stock ? `${stock.lengths} × ${stock.lengthM.toFixed(1)} m` : "—" },
                    ]}
                    note="Boards on flights run across the stair. On a landing they run parallel to its front edge, and on each winder parallel to that winder's nosing, so the back boards are cut on an angle (shown in amber)."
                    noteToggle
                  />
                )
              })()}
            </div>
          )}

          {!layout && r.treads > 0 && (
            <div className={styles.resultsGrid} id={embedded ? undefined : "st-materials"}>
              <SpecCard
                title="Steps"
                rows={[
                  { label: "Rise", value: `${r.risers} × ${mm(r.rise)}` },
                  { label: "Run", value: `${r.treads} × ${mm(r.going)}` },
                  { label: "Total run", value: mm(r.totalRun) },
                  { label: "Pitch", value: `${r.pitchDeg.toFixed(1)}°` },
                  { label: "2 × rise + run", value: mm(r.twoRPlusG) },
                ]}
                note="The top riser steps up onto the deck itself, so there's one fewer tread than risers."
                noteToggle
              />
              {stacked ? (
                <SpecCard
                  title="Step frames"
                  rows={[
                    {
                      label: "Frames",
                      value: `${r.frames.list.length}, stacked`,
                    },
                    {
                      label: "Each frame",
                      value: `2 rails × ${mm(r.frames.railLength)} + ${r.frames.joistsPerFrame} joists at ${mm(r.supports.spacing)}`,
                    },
                    ...r.frames.list.map((f) => ({
                      label: `Step ${f.step}`,
                      value: `${mm(f.depth)} deep × ${mm(f.height)} high (joists ${mm(f.joistLength)})`,
                    })),
                    {
                      label: "Timber",
                      value: `${r.timberDepth} × ${input.stringerThickness}, ${r.frames.linealM.toFixed(1)} m`,
                    },
                    {
                      label: "Buy",
                      value: r.frames.stock
                        ? `${r.frames.stock.lengths} × ${r.frames.stock.lengthM.toFixed(1)} m`
                        : "—",
                    },
                  ]}
                  note={`Each frame is a front rail and back rail across the width with joists between them front to back, timber on edge. The bottom frame sits on the ground or pavers and is ${mm(r.frames.list[0]?.height ?? 0)} high. Every frame above is ${mm(r.rise)} high, sits on the frame below, runs back to the deck, and starts one going (${mm(r.going)}) further back. Rip the timber down to each frame's height. Fix each frame down to the one below and the top one to the deck.`}
                  noteToggle
                />
              ) : (
                <>
                  <SpecCard
                    title="Stringers"
                    rows={[
                      {
                        label: "Count",
                        value: outer
                          ? `2, ${mm(input.width - input.stringerThickness)} apart`
                          : `${stringerCount} at ${mm(r.supports.spacing)} centres`,
                      },
                      {
                        label: "Size",
                        value: `${r.timberDepth} × ${input.stringerThickness}${r.depthAuto ? " (auto)" : ""}`,
                      },
                      {
                        label: "Span",
                        value: `${m(r.stringer.topEdgeLength / r.stringer.spans)} of ${m(r.stringer.maxSpan)} allowed`,
                      },
                      {
                        label: "Support posts",
                        value: r.stringer.posts.length
                          ? `${r.stringer.posts.length} line${r.stringer.posts.length > 1 ? "s" : ""} × ${r.stringer.postsPerLine} posts${r.stringer.bearer ? " + bearer" : ""}`
                          : "none needed",
                      },
                      ...(r.stringer.posts.length
                        ? [
                            {
                              label: "Posts",
                              value: `${POST_SIZE} × ${POST_SIZE} H5, up to ${mm(r.stringer.postLength)} long (${POST_EMBED} in the ground)`,
                            },
                          ]
                        : []),
                      {
                        label: "Length (top edge)",
                        value: mm(r.stringer.topEdgeLength),
                      },
                      {
                        label: "Angle",
                        value: `${r.stringer.angleDeg.toFixed(1)}°`,
                      },
                      {
                        label: "Level cut (foot)",
                        value: mm(r.stringer.levelCutLength),
                      },
                      {
                        label: "Plumb cut (top)",
                        value: mm(r.stringer.plumbCutHeight),
                      },
                      {
                        label: "Buy",
                        value: r.stringer.stock
                          ? `${r.stringer.stock.lengths} × ${r.stringer.stock.lengthM.toFixed(1)} m${r.stringer.stock.piecesPerLength > 1 ? ` (${r.stringer.stock.piecesPerLength} per length)` : ""}`
                          : "—",
                      },
                    ]}
                    note={`Uncut — the top edge runs ${mm(input.boardThickness)} below the corners of the treads, so each wedge's long side sits flat on it. The foot is a level cut on the pad, the top a plumb cut against the deck's boundary joist, ${mm(r.rise)} below the top of the joist. Size is checked against the BRANZ maximum spans for SG8 H3.2 45 mm stringers, measured along the stringer. When the stringer is longer than its size can span, posts set in concrete hold it up part way, evenly spaced${r.stringer.bearer ? ", with a bearer across under all the stringers" : ", one under each stringer"}.`}
                    noteToggle
                  />
                  <SpecCard
                    title="Wedge blocks"
                    rows={[
                      {
                        label: "Per stringer",
                        value: `${r.wedges.perStringer}`,
                      },
                      { label: "Total", value: `${r.wedges.total}` },
                      {
                        label: "Legs",
                        value: `${mm(r.rise)} × ${mm(r.going)}`,
                      },
                      { label: "Long side", value: mm(r.wedges.hypotenuse) },
                      {
                        label: "Cut from",
                        value: `${r.wedges.stockLengthM.toFixed(2)} m of ${r.wedges.stockDepth} × ${input.stringerThickness}`,
                      },
                    ]}
                    note={`${r.wedges.rectangles ? `Cut ${mm(r.rise)} × ${mm(r.going)} rectangles and split each on the diagonal for two wedges.` : `The rise is wider than the board, so cut them nested, long side along the board edge, alternating up and down.`} The going leg goes on top (the tread), the rise leg faces forward (the riser). The bottom wedge has ${mm(r.wedges.bottomTrim)} trimmed off its point so it sits flat on the pad. Glue and screw each one to the stringer.`}
                    noteToggle
                  />
                  {outer && (
                    <SpecCard
                      title="Riser joists & nogs"
                      rows={[
                        {
                          label: "Riser joists",
                          value: `${r.riserJoists.list.length} × ${mm(r.riserJoists.length)}`,
                        },
                        ...r.riserJoists.list.map((j) => ({
                          label: j.ledger ? "Ledger (deck)" : `Riser ${j.index}`,
                          value: `${mm(j.height)} deep`,
                        })),
                        {
                          label: "Rip from",
                          value: r.riserJoists.ripFrom
                            ? `${r.riserJoists.ripFrom} × ${input.stringerThickness}`
                            : "deeper than 290 stock",
                        },
                        {
                          label: "Buy (joists)",
                          value: r.riserJoists.stock
                            ? `${r.riserJoists.stock.lengths} × ${r.riserJoists.stock.lengthM.toFixed(1)} m`
                            : "—",
                        },
                        {
                          label: "Nogs",
                          value: r.riserJoists.nogs.length
                            ? `${r.riserJoists.nogs.length} × ${NOG_DEPTH} × ${input.stringerThickness}, ${r.riserJoists.nogLinealM.toFixed(1)} m`
                            : "none needed",
                        },
                        ...(r.riserJoists.nogStock
                          ? [
                              {
                                label: "Buy (nogs)",
                                value: `${r.riserJoists.nogStock.lengths} × ${r.riserJoists.nogStock.lengthM.toFixed(1)} m`,
                              },
                            ]
                          : []),
                      ]}
                      note={`Each joist sits behind its riser face, spanning between the stringers. It runs from the top of its own tread framing down to ${NOG_DEPTH} mm below the top of the tread below, so it screws through the wedge and the stringer. The bottom one stops on the ground. The top one is a ledger fixed to the face of the deck's boundary joist. ${NOG_DEPTH} mm nogs go between each pair of joists, flush with the tread framing, on the lines where middle stringers would be (${r.riserJoists.nogLines.length} per tread at ${mm(r.supports.spacing)} centres). The tread boards fix to those.`}
                      noteToggle
                    />
                  )}
                </>
              )}
              <SpecCard
                title="Decking boards"
                rows={[
                  {
                    label: "Per tread",
                    value: r.treadBoards
                      .map((b) => (b.ripped ? `${mm(b.width)} rip` : `${Math.round(b.width)}`))
                      .join(" + "),
                  },
                  { label: "Nosing", value: mm(r.nosing) },
                  { label: "Tread depth", value: mm(r.treadDepth) },
                  ...(input.riserBoards
                    ? [
                        {
                          label: "Per riser",
                          value: r.riserBoardPieces
                            .map((b) => (b.ripped ? `${mm(b.width)} rip` : `${Math.round(b.width)}`))
                            .join(" + "),
                        },
                      ]
                    : []),
                  {
                    label: "Pieces",
                    value: `${r.boards.treadPieces + r.boards.riserPieces} × ${mm(r.boards.pieceLength)}`,
                  },
                  {
                    label: "Buy",
                    value: r.boards.stock
                      ? `${r.boards.stock.lengths} × ${r.boards.stock.lengthM.toFixed(1)} m (${r.boards.stock.piecesPerLength} per length)`
                      : "—",
                  },
                  { label: "Screws", value: `~${r.screws}` },
                ]}
                note="Boards are laid from the front edge back, full width first, so any rip ends up at the back of the tread, tucked against the next riser where it's least noticed."
                noteToggle
              />
            </div>
          )}
        </div>
      </div>

      <div id={embedded ? undefined : "st-order"} />
      <StairOrderCard
        lines={order}
        intro="Everything above as stock lengths to order: framing in SG8 H3.2, posts H5, decking at the board size set."
        note={`Lengths are the cheapest standard length to cut the pieces from (offcuts used where they fit, a 5 mm saw cut each), with no other waste allowance. Post concrete is for 300 mm holes; screws are two per board at each stringer or joist, plus 10%.${extraTopTread ? " Includes the top tread's frame and boards." : ""} Handrails, barriers, fixings to the deck and bolts aren't included.`}
      />

      <p className={styles.disclaimer}>
        Rise and run limits are from NZ Building Code clause D1 (D1/AS1): main private stairs max{" "}
        {MAIN_PRIVATE.maxRise} mm rise and min {MAIN_PRIVATE.minGoing} mm run. Service stairs, ones that aren&apos;t
        the main way up, are allowed up to {SERVICE.maxRise} mm rise and down to {SERVICE.minGoing} mm run. Use that
        only if you really have to squeeze a stair in. Handrails and barriers (D1 / F4) aren&apos;t covered here; check
        them for your stair. It&apos;s a rule-of-thumb guide, not a substitute for your building consent documents.
      </p>
    </div>
  )
}

export default StairsPage
