"use client"

import { useMemo } from "react"
import NumField from "@/components/weatherboards/numField"
import { useStoredState } from "@/components/interviewPrep/useStoredState"
import { IntegraPanel } from "@/components/house/foundationCards"
import type { IntegraSettings, PartyWall } from "@/components/intertenancy/integraWall"
import styles from "@/components/house/house.module.scss"

interface WallIn {
  name: string
  lengthMm: number
  leftMm: number
  rightMm: number
  /** a gable's peak, part way along (0: none) */
  peakMm: number
  peakAtMm: number
}
interface State {
  walls: WallIn[]
  settings?: Partial<IntegraSettings>
}

const START: State = {
  walls: [
    { name: "Two storeys, under a gable", lengthMm: 7000, leftMm: 5330, rightMm: 5330, peakMm: 7500, peakAtMm: 3500 },
    { name: "Garages, under a gable", lengthMm: 5950, leftMm: 2610, rightMm: 2610, peakMm: 4470, peakAtMm: 2975 },
  ],
}

/** Integra (lightweight concrete) intertenancy walls on their own: each
 * wall's length and its height at each end (and a gable's peak), and the
 * panels, brackets, FireWool and sealant. */
export default function IntertenancyPage() {
  const [state, setState, loaded] = useStoredState<State>("intertenancy-calculator", START)
  const walls: PartyWall[] = useMemo(
    () =>
      state.walls.map((w, i) => ({
        id: `p${i}`,
        name: w.name || `Wall ${i + 1}`,
        lengthMm: w.lengthMm,
        top: [
          { x: 0, z: w.leftMm },
          ...(w.peakMm > 0 && w.peakAtMm > 0 && w.peakAtMm < w.lengthMm ? [{ x: w.peakAtMm, z: w.peakMm }] : []),
          { x: w.lengthMm, z: w.rightMm },
        ],
      })),
    [state.walls],
  )
  const setWall = (i: number, patch: Partial<WallIn>) => setState((s) => ({ ...s, walls: s.walls.map((w, k) => (k === i ? { ...w, ...patch } : w)) }))
  if (!loaded) return null
  return (
    <div className={styles.page}>
      <h1>Intertenancy walls</h1>
      <p className={styles.intro}>
        A party wall between two units, of Integra lightweight-concrete panels standing between each unit&apos;s own timber frame — slab to the underside of
        the roofing. Give each wall its length and its height at each end (and a gable&apos;s peak), and get the panels, brackets, FireWool and sealant. In the
        House calculator, mark a wall as a party wall and it&apos;s worked out from the roof.
      </p>
      <section className={styles.card}>
        {state.walls.map((w, i) => (
          <div key={i} className={styles.fields}>
            <label>
              Name
              <input value={w.name} onChange={(e) => setWall(i, { name: e.target.value })} />
            </label>
            {(
              [
                ["lengthMm", "Length"],
                ["leftMm", "Height, left end"],
                ["rightMm", "Height, right end"],
                ["peakMm", "Peak (0: none)"],
                ["peakAtMm", "Peak from the left"],
              ] as const
            ).map(([k, label]) => (
              <label key={k}>
                {label}
                <span className={styles.unit}>
                  <NumField value={w[k]} min={0} step={10} onChange={(v) => setWall(i, { [k]: v })} /> mm
                </span>
              </label>
            ))}
            <button type="button" className={styles.link} onClick={() => setState((s) => ({ ...s, walls: s.walls.filter((_, k) => k !== i) }))}>
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={styles.pill}
          onClick={() => setState((s) => ({ ...s, walls: [...s.walls, { name: "", lengthMm: 6000, leftMm: 2400, rightMm: 2400, peakMm: 0, peakAtMm: 3000 }] }))}
        >
          + Wall
        </button>
        <IntegraPanel walls={walls} settings={state.settings} setSettings={(settings) => setState((s) => ({ ...s, settings }))} />
      </section>
    </div>
  )
}
