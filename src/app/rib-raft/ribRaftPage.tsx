"use client"

import { useMemo } from "react"
import NumField from "@/components/weatherboards/numField"
import { useStoredState } from "@/components/interviewPrep/useStoredState"
import { RibRaftPanel } from "@/components/house/foundationCards"
import { roomsToOutline } from "@/components/house/floorPlan"
import { DEFAULT_HOUSE } from "@/components/house/houseTypes"
import type { RibRaftSettings } from "@/components/ribRaft/ribRaft"
import styles from "@/components/house/house.module.scss"

interface Box {
  x: number
  y: number
  w: number
  h: number
}
interface Beam {
  axis: "x" | "y"
  at: number
  from: number
  to: number
}
interface State {
  boxes: Box[]
  beams: Beam[]
  settings?: Partial<RibRaftSettings>
}

const PRESETS: { name: string; state: State }[] = [
  { name: "A box, 12 × 8", state: { boxes: [{ x: 0, y: 0, w: 12000, h: 8000 }], beams: [{ axis: "x", at: 6000, from: 0, to: 8000 }] } },
  {
    name: "An L, house and garage",
    state: {
      boxes: [
        { x: 0, y: 2000, w: 5300, h: 7000 },
        { x: 5300, y: 0, w: 3900, h: 5950 },
      ],
      beams: [{ axis: "x", at: 5300, from: 2000, to: 5950 }],
    },
  },
]

/** A rib raft (waffle) slab on its own: its footprint as rectangles pushed
 * together, internal beams under the load-bearing walls, and the pods,
 * ribs, beams, steel, mesh and concrete. */
export default function RibRaftPage() {
  const [state, setState, loaded] = useStoredState<State>("rib-raft-calculator", PRESETS[1].state)
  const outline = useMemo(() => {
    const boxes = state.boxes.filter((b) => b.w > 0 && b.h > 0).map((b, i) => ({ id: `b${i}`, name: "", kind: "other" as const, ...b }))
    return boxes.length ? roomsToOutline({ ...DEFAULT_HOUSE.floor, mode: "rooms", boxes }).outline : []
  }, [state.boxes])
  const beams = state.beams.map((b) => (b.axis === "x" ? { a: { x: b.at, y: b.from }, b: { x: b.at, y: b.to } } : { a: { x: b.from, y: b.at }, b: { x: b.to, y: b.at } }))
  const setBox = (i: number, patch: Partial<Box>) => setState((s) => ({ ...s, boxes: s.boxes.map((b, k) => (k === i ? { ...b, ...patch } : b)) }))
  const setBeam = (i: number, patch: Partial<Beam>) => setState((s) => ({ ...s, beams: s.beams.map((b, k) => (k === i ? { ...b, ...patch } : b)) }))
  if (!loaded) return null

  return (
    <div className={styles.page}>
      <h1>Rib raft slab</h1>
      <p className={styles.intro}>
        A waffle slab — polystyrene pods on a grid, ribs between them, a beam round the edge and under the load-bearing walls, a topping with mesh over
        the lot. Lay out its footprint as rectangles (they join up), add the internal beams, and get the pods, concrete, steel and mesh. Drawing a
        house in the House calculator works it out from the plan instead.
      </p>
      <section className={styles.card}>
        <div className={styles.toolbar}>
          <span className={styles.muted}>Start from:</span>
          {PRESETS.map((p) => (
            <button key={p.name} type="button" className={styles.pill} onClick={() => setState(() => p.state)}>
              {p.name}
            </button>
          ))}
        </div>
        <h3>Footprint</h3>
        <p className={styles.hint}>Each rectangle from its top-left corner (x across, y down), mm. Where they touch, they&apos;re one slab.</p>
        {state.boxes.map((b, i) => (
          <div key={i} className={styles.fields}>
            {(["x", "y", "w", "h"] as const).map((k) => (
              <label key={k}>
                {{ x: "Across", y: "Down", w: "Width", h: "Depth" }[k]}
                <span className={styles.unit}>
                  <NumField value={b[k]} min={k === "w" || k === "h" ? 0 : undefined} step={10} onChange={(v) => setBox(i, { [k]: v })} /> mm
                </span>
              </label>
            ))}
            <button type="button" className={styles.link} onClick={() => setState((s) => ({ ...s, boxes: s.boxes.filter((_, k) => k !== i) }))}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className={styles.pill} onClick={() => setState((s) => ({ ...s, boxes: [...s.boxes, { x: 0, y: 0, w: 3000, h: 3000 }] }))}>
          + Rectangle
        </button>
        <h3>Internal beams</h3>
        <p className={styles.hint}>Under each load-bearing wall: a line down (at an x) or across (at a y), from and to.</p>
        {state.beams.map((b, i) => (
          <div key={i} className={styles.fields}>
            <label>
              Runs
              <select value={b.axis} onChange={(e) => setBeam(i, { axis: e.target.value as Beam["axis"] })}>
                <option value="x">Down, at x</option>
                <option value="y">Across, at y</option>
              </select>
            </label>
            {(["at", "from", "to"] as const).map((k) => (
              <label key={k}>
                {{ at: b.axis === "x" ? "At x" : "At y", from: "From", to: "To" }[k]}
                <span className={styles.unit}>
                  <NumField value={b[k]} step={10} onChange={(v) => setBeam(i, { [k]: v })} /> mm
                </span>
              </label>
            ))}
            <button type="button" className={styles.link} onClick={() => setState((s) => ({ ...s, beams: s.beams.filter((_, k) => k !== i) }))}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className={styles.pill} onClick={() => setState((s) => ({ ...s, beams: [...s.beams, { axis: "x", at: 3000, from: 0, to: 3000 }] }))}>
          + Beam
        </button>
        {outline.length >= 4 && (
          <RibRaftPanel outline={outline} beams={beams} joints={[]} settings={state.settings} setSettings={(settings) => setState((s) => ({ ...s, settings }))} />
        )}
      </section>
    </div>
  )
}
