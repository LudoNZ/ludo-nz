"use client"

import { DEFAULT_TURN, FlightSpec, TurnSpec } from "@/components/stairs/stairs"
import styles from "./stairsPage.module.scss"

const ANGLE_PRESETS = [45, 90, 180]

/** Flights joined by turns, edited as a list: each flight's tread count
 * (the last one takes whatever's left), and each turn's type, direction,
 * angle and winder count. */
const LayoutEditor: React.FC<{
  flights: FlightSpec[]
  turns: TurnSpec[]
  /** resolved tread count per flight (the last is the remainder) */
  treads: number[]
  onChange: (flights: FlightSpec[], turns: TurnSpec[]) => void
}> = ({ flights, turns, treads, onChange }) => {
  const setFlight = (i: number, n: number) =>
    onChange(
      flights.map((f, j) => (j === i ? { treads: Math.max(0, n) } : f)),
      turns,
    )
  const setTurn = (i: number, patch: Partial<TurnSpec>) =>
    onChange(
      flights,
      turns.map((t, j) => (j === i ? { ...t, ...patch } : t)),
    )

  const addTurn = () => {
    // split what the last flight has now roughly in half around the new turn
    const lastTreads = Math.max(0, treads[treads.length - 1] ?? 0)
    const before = Math.max(0, Math.floor((lastTreads - 1) / 2))
    onChange([...flights.slice(0, -1), { treads: before }, { treads: null }], [...turns, { ...DEFAULT_TURN }])
  }

  /** Put a new turn part way up flight i, splitting it: half its treads
   * before the turn, the rest (less the turn's riser) in a new run after. */
  const insertTurn = (i: number) => {
    if (i === flights.length - 1) return addTurn()
    const k = Math.max(0, treads[i])
    const before = Math.floor(k / 2)
    const after = Math.max(0, k - before - 1)
    onChange(
      [...flights.slice(0, i), { treads: before }, { treads: after }, ...flights.slice(i + 1)],
      [...turns.slice(0, i), { ...DEFAULT_TURN }, ...turns.slice(i)],
    )
  }

  const removeTurn = (i: number) => {
    const turnRisers = turns[i].kind === "landing" ? 1 : Math.max(1, turns[i].winders)
    const merged: FlightSpec =
      i + 1 === flights.length - 1
        ? { treads: null }
        : { treads: (flights[i].treads ?? 0) + (flights[i + 1].treads ?? 0) + turnRisers }
    onChange([...flights.slice(0, i), merged, ...flights.slice(i + 2)], turns.filter((_, j) => j !== i))
  }

  return (
    <div className={styles.field}>
      <label>Flights &amp; turns</label>
      <span className={styles.hint}>
        Add landings or winders to turn the stair. Each run between turns is a staircase of the framing type below,
        with its own side view. Set a run to &quot;No run&quot; to put two turns back to back (one riser between
        them). The last run takes whatever risers are left.
      </span>
      <ol className={styles.layoutList}>
        {flights.map((f, i) => {
          const last = i === flights.length - 1
          const turn = turns[i]
          return (
            <li key={i}>
              <div className={styles.layoutRow}>
                <span className={styles.layoutName}>{i === 0 ? "Run 1 (from the ground)" : `Run ${i + 1}`}</span>
                {last ? (
                  <span className={`${styles.layoutValue} ${treads[i] < 0 ? styles.layoutError : ""}`}>
                    {treads[i] === 0
                      ? "no run, the last riser goes straight up onto the deck"
                      : `${treads[i]} tread${treads[i] === 1 ? "" : "s"} (the rest), up to the deck`}
                  </span>
                ) : (f.treads ?? 0) === 0 && i > 0 ? (
                  <span className={styles.layoutValue}>
                    No run, turns back to back{" "}
                    <button type="button" className={styles.textButton} onClick={() => setFlight(i, 1)}>
                      Add a run
                    </button>
                  </span>
                ) : (
                  <div className={styles.stepper}>
                    <button
                      type="button"
                      aria-label={`One fewer tread on flight ${i + 1}`}
                      disabled={(f.treads ?? 0) <= 0}
                      onClick={() => setFlight(i, (f.treads ?? 0) - 1)}
                    >
                      −
                    </button>
                    <span className={styles.stepperValue}>{f.treads ?? 0}</span>
                    <button
                      type="button"
                      aria-label={`One more tread on flight ${i + 1}`}
                      onClick={() => setFlight(i, (f.treads ?? 0) + 1)}
                    >
                      +
                    </button>
                    <span className={styles.hint}>treads</span>
                    {i > 0 && (
                      <button type="button" className={styles.textButton} onClick={() => setFlight(i, 0)}>
                        No run
                      </button>
                    )}
                  </div>
                )}
              </div>
              {!last && treads[i] >= 2 && (
                <button type="button" className={styles.insertTurn} onClick={() => insertTurn(i)}>
                  + Turn part way up run {i + 1}
                </button>
              )}

              {turn && (
                <div className={styles.turnRow}>
                  <div className={styles.layoutRow}>
                    <span className={styles.layoutName}>Turn {i + 1}</span>
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => removeTurn(i)}
                      aria-label={`Remove turn ${i + 1}`}
                      title="Remove this turn (joins the flights either side)"
                    >
                      ✕
                    </button>
                  </div>
                  <div className={styles.segmented}>
                    {(["landing", "winders"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        className={turn.kind === k ? styles.presetActive : ""}
                        aria-pressed={turn.kind === k}
                        onClick={() => setTurn(i, { kind: k })}
                      >
                        {k === "landing" ? "Landing" : "Winders"}
                      </button>
                    ))}
                  </div>
                  <div className={styles.segmented}>
                    {(["left", "right"] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={turn.direction === d ? styles.presetActive : ""}
                        aria-pressed={turn.direction === d}
                        onClick={() => setTurn(i, { direction: d })}
                      >
                        {d === "left" ? "↰ Left" : "Right ↱"}
                      </button>
                    ))}
                  </div>
                  <div className={styles.turnNumbers}>
                    <div className={styles.numberUnit}>
                      <input
                        type="number"
                        aria-label={`Turn ${i + 1} angle`}
                        min={1}
                        max={180}
                        step={5}
                        value={turn.angle}
                        onChange={(e) =>
                          e.target.value !== "" &&
                          setTurn(i, { angle: Math.min(180, Math.max(1, Number(e.target.value))) })
                        }
                      />
                      <span>°</span>
                    </div>
                    {ANGLE_PRESETS.map((a) => (
                      <button
                        key={a}
                        type="button"
                        className={`${styles.textButton} ${turn.angle === a ? styles.presetActive : ""}`}
                        onClick={() => setTurn(i, { angle: a })}
                      >
                        {a}°
                      </button>
                    ))}
                  </div>
                  {turn.kind === "winders" && (
                    <div className={styles.stepper}>
                      <button
                        type="button"
                        aria-label="One fewer winder"
                        disabled={turn.winders <= 1}
                        onClick={() => setTurn(i, { winders: turn.winders - 1 })}
                      >
                        −
                      </button>
                      <span className={styles.stepperValue}>{turn.winders}</span>
                      <button
                        type="button"
                        aria-label="One more winder"
                        onClick={() => setTurn(i, { winders: turn.winders + 1 })}
                      >
                        +
                      </button>
                      <span className={styles.hint}>winders</span>
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <button type="button" className={styles.textButton} onClick={addTurn}>
        + Add a turn after run {flights.length}
      </button>
    </div>
  )
}

export default LayoutEditor
