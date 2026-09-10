"use client"

import { useEffect, useMemo, useState } from "react"
import SpecCard from "@/components/structures/specCard"
import { formatM } from "@/components/structures/format"
import TensionDiagram from "@/components/tension/tensionDiagram"
import {
  CAUTION_MULTIPLIER,
  DANGER_MULTIPLIER,
  GRAVITY_MS2,
  calculateTension,
  minSagM,
  sagFromAngle,
} from "@/components/tension/tension"
import styles from "./tensionPage.module.scss"

type SagMode = "distance" | "angle"
type LoadUnit = "kg" | "N"

const PRESETS: { id: string; label: string; description: string; spanM: number; sagM: number; loadKg: number }[] = [
  {
    id: "tarp",
    label: "Tarp ridge line",
    description: "Long, shallow sag, light load — plenty of margin.",
    spanM: 4,
    sagM: 0.4,
    loadKg: 3,
  },
  {
    id: "highline",
    label: "Highline",
    description: "A person's weight over a long span — the sag is what keeps tension survivable.",
    spanM: 20,
    sagM: 1,
    loadKg: 80,
  },
  {
    id: "towstrap",
    label: "Tow strap, rigged too tight",
    description: "Barely any sag under a vehicle-scale load — exactly the setup that snaps straps.",
    spanM: 6,
    sagM: 0.15,
    loadKg: 1000,
  },
]

const formatKgf = (v: number) => `${Math.round(v).toLocaleString()} kgf`
const formatN = (v: number) => `${Math.round(v).toLocaleString()} N`
const formatDeg = (v: number) => `${v.toFixed(1)}°`
const formatFactor = (v: number) => `${v.toFixed(1)}×`

/** Symmetric two-leg tightline calculator: span, sag (or sag angle), and a
 * midpoint load in, tension per leg and a "how much worse than a straight
 * hang" multiplier out, redrawn live as a to-scale SVG. */
const TensionPage = () => {
  const [spanM, setSpanM] = useState(10)
  const [sagM, setSagM] = useState(1)
  const [sagMode, setSagMode] = useState<SagMode>("distance")
  const [loadKg, setLoadKg] = useState(80)
  const [loadUnit, setLoadUnit] = useState<LoadUnit>("kg")

  // keep sag in range whenever the span changes underneath it — a sag
  // that was fine at the old span can end up past the new span/2 ceiling,
  // or (rarely) below the new floor
  useEffect(() => {
    const min = minSagM(spanM)
    const max = spanM / 2
    setSagM((s) => Math.min(Math.max(s, min), max))
  }, [spanM])

  const result = useMemo(() => calculateTension({ spanM, sagM, loadKg }), [spanM, sagM, loadKg])

  const sagMinM = minSagM(spanM)
  const sagMaxM = spanM / 2
  const sagAngleMinDeg = (Math.atan(sagMinM / (spanM / 2)) * 180) / Math.PI
  const sagAngleMaxDeg = (Math.atan(sagMaxM / (spanM / 2)) * 180) / Math.PI // = 45°

  const setSagDistance = (v: number) => setSagM(Math.min(Math.max(v, sagMinM), sagMaxM))
  const setSagAngleDeg = (deg: number) => {
    const clampedDeg = Math.min(Math.max(deg, sagAngleMinDeg), sagAngleMaxDeg)
    setSagM(sagFromAngle(spanM, (clampedDeg * Math.PI) / 180))
  }

  const loadDisplayValue = loadUnit === "kg" ? loadKg : loadKg * GRAVITY_MS2
  const loadMin = loadUnit === "kg" ? 1 : GRAVITY_MS2
  const loadMax = loadUnit === "kg" ? 1000 : 1000 * GRAVITY_MS2
  const setLoadDisplay = (v: number) => setLoadKg(loadUnit === "kg" ? v : v / GRAVITY_MS2)

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setSpanM(p.spanM)
    setSagM(p.sagM)
    setLoadKg(p.loadKg)
    setSagMode("distance")
  }

  const warningText =
    result.warningLevel === "danger"
      ? `⚠ ${formatFactor(result.multiplicationFactor)} the straight-hang load — approaching infinite tension as the line flattens out`
      : result.warningLevel === "caution"
        ? `⚠ ${formatFactor(result.multiplicationFactor)} the straight-hang load — add more sag if you can`
        : null

  return (
    <div className={styles.tensionPage}>
      <h1>Tightline Tension Calculator</h1>
      <p className={styles.intro}>
        A load hung mid-span on a tensioned line — tarp ridge line, highline, tow strap between two anchors — pulls
        far harder on the anchors than its own weight once the line runs anywhere near straight. Set the span, sag
        and load below to see the anchor tension and sag angle update live.
      </p>

      <div className={styles.presets}>
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className={styles.presetButton} onClick={() => applyPreset(p)} title={p.description}>
            {p.label}
          </button>
        ))}
      </div>

      <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
        <div className={styles.field}>
          <label htmlFor="span">Span (L)</label>
          <span className={styles.hint}>Horizontal distance between anchors</span>
          <div className={styles.sliderRow}>
            <input
              id="span"
              type="range"
              min={1}
              max={100}
              step={0.1}
              value={spanM}
              onChange={(e) => setSpanM(Number(e.target.value))}
            />
            <div className={styles.numberUnit}>
              <input
                type="number"
                min={1}
                max={100}
                step={0.1}
                value={spanM}
                onChange={(e) => setSpanM(Number(e.target.value) || 1)}
              />
              <span>m</span>
            </div>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldHeader}>
            <label htmlFor="sag">{sagMode === "distance" ? "Sag distance (d)" : "Sag angle (θ)"}</label>
            <div className={styles.modeToggle}>
              <button
                type="button"
                className={sagMode === "distance" ? styles.modeActive : ""}
                onClick={() => setSagMode("distance")}
              >
                Distance
              </button>
              <button type="button" className={sagMode === "angle" ? styles.modeActive : ""} onClick={() => setSagMode("angle")}>
                Angle
              </button>
            </div>
          </div>
          <span className={styles.hint}>
            {sagMode === "distance"
              ? "Vertical drop of the load below the anchor line — more sag means less tension"
              : "Angle each leg makes with the anchor line — a bigger angle means less tension"}
          </span>
          {sagMode === "distance" ? (
            <div className={styles.sliderRow}>
              <input
                id="sag"
                type="range"
                min={sagMinM}
                max={sagMaxM}
                step={(sagMaxM - sagMinM) / 500 || 0.001}
                value={result.sagM}
                onChange={(e) => setSagDistance(Number(e.target.value))}
              />
              <div className={styles.numberUnit}>
                <input
                  type="number"
                  min={sagMinM}
                  max={sagMaxM}
                  step={0.01}
                  value={Number(result.sagM.toFixed(3))}
                  onChange={(e) => setSagDistance(Number(e.target.value) || sagMinM)}
                />
                <span>m</span>
              </div>
            </div>
          ) : (
            <div className={styles.sliderRow}>
              <input
                id="sag"
                type="range"
                min={sagAngleMinDeg}
                max={sagAngleMaxDeg}
                step={0.1}
                value={result.sagAngleDeg}
                onChange={(e) => setSagAngleDeg(Number(e.target.value))}
              />
              <div className={styles.numberUnit}>
                <input
                  type="number"
                  min={sagAngleMinDeg}
                  max={sagAngleMaxDeg}
                  step={0.1}
                  value={Number(result.sagAngleDeg.toFixed(1))}
                  onChange={(e) => setSagAngleDeg(Number(e.target.value) || sagAngleMinDeg)}
                />
                <span>°</span>
              </div>
            </div>
          )}
        </div>

        <div className={styles.field}>
          <div className={styles.fieldHeader}>
            <label htmlFor="load">Load weight (W)</label>
            <div className={styles.modeToggle}>
              <button type="button" className={loadUnit === "kg" ? styles.modeActive : ""} onClick={() => setLoadUnit("kg")}>
                kg
              </button>
              <button type="button" className={loadUnit === "N" ? styles.modeActive : ""} onClick={() => setLoadUnit("N")}>
                N
              </button>
            </div>
          </div>
          <div className={styles.sliderRow}>
            <input
              id="load"
              type="range"
              min={loadMin}
              max={loadMax}
              step={loadUnit === "kg" ? 1 : 1}
              value={loadDisplayValue}
              onChange={(e) => setLoadDisplay(Number(e.target.value))}
            />
            <div className={styles.numberUnit}>
              <input
                type="number"
                min={loadMin}
                max={loadMax}
                value={Math.round(loadDisplayValue)}
                onChange={(e) => setLoadDisplay(Number(e.target.value) || loadMin)}
              />
              <span>{loadUnit}</span>
            </div>
          </div>
        </div>
      </form>

      <div className={`${styles.diagramCard} ${styles[result.warningLevel]}`}>
        <TensionDiagram spanM={spanM} result={result} />
        {warningText && <p className={styles.warningText}>{warningText}</p>}
      </div>

      <div className={styles.resultsGrid}>
        <SpecCard
          title="Tension per leg"
          rows={[
            { label: "Force", value: formatKgf(result.tensionPerLegKgf) },
            { label: "In Newtons", value: formatN(result.tensionPerLegN) },
          ]}
        />
        <SpecCard
          title="Geometry"
          rows={[
            { label: "Sag angle", value: formatDeg(result.sagAngleDeg) },
            { label: "Leg length", value: formatM(result.legLengthM) },
            { label: "Half-span", value: formatM(result.halfSpanM) },
          ]}
        />
        <SpecCard
          title="Multiplication factor"
          rows={[{ label: "vs. straight hang", value: formatFactor(result.multiplicationFactor) }]}
          note={`Caution above ${CAUTION_MULTIPLIER}×, danger above ${DANGER_MULTIPLIER}× — that's how much harder each anchor is pulled than if the load just hung straight down.`}
        />
      </div>

      <p className={styles.explainer}>
        <strong>T = W / (2 · sin θ)</strong> — tension per leg equals the load divided by twice the sine of the sag
        angle. As the line flattens (θ → 0), tension climbs toward infinity, which is why a &quot;dead
        straight&quot; rigged line is dangerous under any load at all.
      </p>

      <p className={styles.disclaimer}>
        Simplified two-straight-legs model (not a full catenary), symmetric load at the midpoint only. Good for
        practical rigging estimates — not a substitute for a manufacturer&apos;s working-load rating.
      </p>
    </div>
  )
}

export default TensionPage
