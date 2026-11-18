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
        Add landings or winders to turn the stair. The last flight takes whatever risers are left.
      </span>
      <ol className={styles.layoutList}>
        {flights.map((f, i) => {
          const last = i === flights.length - 1
          const turn = turns[i]
          return (
            <li key={i}>
              <div className={styles.layoutRow}>
                <span className={styles.layoutName}>Flight {i + 1}</span>
                {last ? (
                  <span className={`${styles.layoutValue} ${treads[i] < 0 ? styles.layoutError : ""}`}>
                    {treads[i]} tread{treads[i] === 1 ? "" : "s"} (the rest)
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
                  </div>
                )}
              </div>

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
        + Add a turn
      </button>
    </div>
  )
}

export default LayoutEditor
