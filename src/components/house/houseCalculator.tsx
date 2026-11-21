"use client"

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/context/auth"
import NumField from "@/components/weatherboards/numField"
import HouseRenderView from "@/components/weatherboards/houseRenderView"
import { ROOF_COLOURS } from "@/components/weatherboards/roof"
import { loadProject, newProjectId, ProjectLocation, saveProject } from "@/components/weatherboards/projectStore"
import type { Opening, RoofType, WeatherboardProject, WingSetting } from "@/components/weatherboards/types"
import { floorGraph, isSquare, roomsToOutline } from "./floorPlan"
import { houseCladding, mergeCladding, splitCladdingEdit } from "./houseCladding"
import WeatherboardEditor from "@/components/weatherboards/weatherboardEditor"
import {
  FloorPlan,
  HouseProject,
  HouseSettings,
  LoadBearing,
  newHouseId,
  Pt,
  ROOF_FRAME_LABELS,
  RoofFrame,
  ROOM_KIND_LABELS,
  RoomBox,
  RoomKind,
  STARTING_BOXES,
  STARTING_OUTLINE,
} from "./houseTypes"
import PlanCanvas, { CanvasTool, Selection } from "./planCanvas"
import { GridDim, GridLine, gridOrigin, gridPointAt, GridPoint, MeasureChain, parseMeasures, RulerShow, lineAt as gridLineAt, lineHome as gridLineHome, linesAround, movePlanLine, nearestLine, ProjectGrid, squareUp } from "./grid"
import { analyseHouse, Structure } from "./structure"
import { houseRenderInputFrom } from "./houseRenderInput"
import { claddingFloorOf, insideTarget, outsideAt, outsideTarget, planJoinery, useJoineryEditor } from "./joineryEditor"
import { joineryTypesOf } from "./joinery"
import JoinerySettings from "./joinerySettings"
import { useSharedJoinery } from "./joineryDefaultsStore"
import FramingStep from "./framingStep"
import styles from "./house.module.scss"

// (framing comes last so saved houses stay on the step they were on)
const STEPS = ["Start", "Floor plans", "Roof & structure", "3D", "Cladding", "Framing"] as const

const LEVEL_NAMES = ["Ground floor", "First floor"] as const

const ROOF_TYPES: { value: Exclude<RoofType, "auto">; label: string }[] = [
  { value: "gable", label: "Gable" },
  { value: "hip", label: "Hip" },
  { value: "skillion", label: "Skillion" },
  { value: "none", label: "No roof (yet)" },
]

/** a sensible size for a new room of each kind */
const ROOM_SIZES: Record<RoomKind, [number, number]> = {
  living: [5000, 4200],
  bedroom: [3600, 3200],
  kitchen: [3600, 3000],
  bathroom: [2400, 2400],
  laundry: [1800, 2000],
  hall: [1200, 4000],
  garage: [6000, 6000],
  other: [3000, 3000],
}

const m = (mm: number) => `${(mm / 1000).toFixed(2)} m`

/** The House calculator: a one-storey house, walked through in order —
 * how to start, the ground floor plan (outline and walls, or rooms as
 * boxes), the roof and what holds it up, the house in 3D, then its
 * cladding as a linked weatherboard project kept in step with the plan. */
const HouseCalculator: React.FC<{
  house: HouseProject
  setHouse: (update: (h: HouseProject) => HouseProject) => void
  header: ReactNode
}> = ({ house, setHouse, header }) => {
  // (the shared joinery defaults: a house without its own types follows them)
  useSharedJoinery()
  const floor = house.floor
  const graph = useMemo(() => floorGraph(floor), [floor])
  const upperPlan = house.upper?.plan ?? null
  const upperGraph = useMemo(() => (upperPlan ? floorGraph(upperPlan) : null), [upperPlan])
  const cladding = useMemo(() => houseCladding(house, graph, upperGraph), [house, graph, upperGraph])
  const structures = useMemo(
    () => analyseHouse(graph, upperGraph, house.settings, cladding?.roof ?? null, cladding?.lowerRoofs ?? []),
    [graph, upperGraph, house.settings, cladding],
  )
  const [selection, setSelection] = useState<Selection>(null)
  // which storey the plan and structure steps are on
  const [levelState, setLevelState] = useState(0)
  const level = house.upper ? levelState : 0
  const setLevel = (l: number) => {
    setSelection(null)
    setLevelState(l)
  }
  /** the plan of a storey */
  const setPlanOf = (l: number) => (update: (f: FloorPlan) => FloorPlan) =>
    setHouse((h) => (l === 0 ? { ...h, floor: update(h.floor) } : h.upper ? { ...h, upper: { ...h.upper, plan: update(h.upper.plan) } } : h))
  const step = Math.min(house.step, floor.mode ? STEPS.length - 1 : 0)
  const setStep = (s: number) => {
    setSelection(null)
    setHouse((h) => ({ ...h, step: s }))
  }
  const setSettings = (patch: Partial<HouseSettings>) => setHouse((h) => ({ ...h, settings: { ...h.settings, ...patch } }))

  const canGoOn = [!!floor.mode, graph.outline.length >= 3, true, true, true, false]

  return (
    <div className={styles.page}>
      {header}
      <p className={styles.intro}>
        A one-storey house, from the ground floor plan up: lay out the rooms, see which walls hold the roof up (and where a
        span&apos;s too long), look at it in 3D, and send its outside walls to the weatherboard calculator — kept in step as
        the plan changes.
      </p>

      <ol className={styles.steps}>
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              className={`${styles.step} ${i === step ? styles.stepOn : ""} ${i < step ? styles.stepDone : ""}`}
              onClick={() => setStep(i)}
              disabled={i > 0 && !floor.mode}
              aria-current={i === step ? "step" : undefined}
            >
              <span className={styles.stepNum}>{i + 1}</span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && <StartStep house={house} setHouse={setHouse} />}
      {step === 1 && (
        <FloorsStep
          house={house}
          setHouse={setHouse}
          cladding={cladding}
          level={level}
          setLevel={setLevel}
          graph={graph}
          upperGraph={upperGraph}
          setPlanOf={setPlanOf}
          selection={selection}
          setSelection={setSelection}
        />
      )}
      {step === 2 && (
        <StructureStep
          house={house}
          setSettings={setSettings}
          setHouse={setHouse}
          level={level}
          setLevel={setLevel}
          setFloor={setPlanOf(level)}
          graph={level === 1 && upperGraph ? upperGraph : graph}
          ghost={level === 1 ? graph.outline : undefined}
          structure={level === 1 && structures.upper ? structures.upper : structures.ground}
          lowerRoofs={!!cladding?.lowerRoofs.length}
          roofOk={!!cladding?.roof}
          selection={selection}
          setSelection={setSelection}
        />
      )}
      {step === 3 && cladding && <ThreeDStep house={house} setHouse={setHouse} setPlanOf={setPlanOf} graph={graph} upperGraph={upperGraph} cladding={cladding} structures={structures} />}
      {step === 4 && <CladdingStep house={house} setHouse={setHouse} cladding={cladding} />}
      {step === 5 && (
        <FramingStep
          house={house}
          setHouse={setHouse}
          level={level}
          setLevel={setLevel}
          setPlanOf={setPlanOf}
          graph={graph}
          upperGraph={upperGraph}
          structures={structures}
          cladding={cladding}
          selection={selection}
          setSelection={setSelection}
        />
      )}

      <div className={styles.nav}>
        {step > 0 && (
          <button type="button" className={styles.navBack} onClick={() => setStep(step - 1)}>
            ← {STEPS[step - 1]}
          </button>
        )}
        {step < STEPS.length - 1 && (
          <button type="button" className={styles.navNext} onClick={() => setStep(step + 1)} disabled={!canGoOn[step]}>
            {STEPS[step + 1]} →
          </button>
        )}
      </div>
    </div>
  )
}

// ── 1. start ───────────────────────────────────────────────────────────

const StartStep: React.FC<{ house: HouseProject; setHouse: (u: (h: HouseProject) => HouseProject) => void }> = ({ house, setHouse }) => {
  const choose = (mode: "outline" | "rooms") =>
    setHouse((h) => ({
      ...h,
      step: 1,
      floor: {
        ...h.floor,
        mode,
        outline: h.floor.outline.length ? h.floor.outline : STARTING_OUTLINE,
        boxes: h.floor.boxes.length ? h.floor.boxes : STARTING_BOXES(),
      },
    }))
  return (
    <section className={styles.card}>
      <h2>How do you want to start?</h2>
      <p className={styles.hint}>One storey to start with. Either way ends up as the same plan — and you can turn rooms into walls later.</p>
      <div className={styles.choices}>
        <button type="button" className={`${styles.choice} ${house.floor.mode === "outline" ? styles.choiceOn : ""}`} onClick={() => choose("outline")}>
          <svg viewBox="0 0 120 80" aria-hidden="true">
            <rect x="8" y="8" width="104" height="64" className={styles.choiceOutline} />
            <line x1="60" y1="8" x2="60" y2="50" className={styles.choiceWall} />
            <line x1="60" y1="50" x2="112" y2="50" className={styles.choiceWall} />
          </svg>
          <strong>Draw the outline, then the walls</strong>
          <span>The outside of the house first, then the walls inside it — the rooms are the spaces they close off.</span>
        </button>
        <button type="button" className={`${styles.choice} ${house.floor.mode === "rooms" ? styles.choiceOn : ""}`} onClick={() => choose("rooms")}>
          <svg viewBox="0 0 120 80" aria-hidden="true">
            <rect x="8" y="8" width="56" height="40" className={styles.choiceRoomA} />
            <rect x="64" y="8" width="48" height="40" className={styles.choiceRoomB} />
            <rect x="8" y="48" width="104" height="24" className={styles.choiceRoomC} />
          </svg>
          <strong>Lay out the rooms</strong>
          <span>Rooms as boxes — Living 5 × 4.2, Bedroom 3.6 × 3.2… — pushed together. The walls go where they meet.</span>
        </button>
      </div>
    </section>
  )
}

// ── 2. ground floor ────────────────────────────────────────────────────

/** The floor plans: a tab per storey (and adding a first floor), the
 * plan of the one that's open, and the first floor's own heights. */
const FloorsStep: React.FC<{
  house: HouseProject
  setHouse: (u: (h: HouseProject) => HouseProject) => void
  cladding: ReturnType<typeof houseCladding>
  level: number
  setLevel: (l: number) => void
  graph: ReturnType<typeof floorGraph>
  upperGraph: ReturnType<typeof floorGraph> | null
  setPlanOf: (l: number) => (u: (f: FloorPlan) => FloorPlan) => void
  selection: Selection
  setSelection: (s: Selection) => void
}> = ({ house, setHouse, cladding, level, setLevel, graph, upperGraph, setPlanOf, selection, setSelection }) => {
  const [adding, setAdding] = useState(false)
  // windows and doors, placed on the plan
  const joinery = useJoineryEditor(house, setHouse, setPlanOf, cladding ? claddingFloorOf(cladding) : () => 0)
  const kitFor = (storey: 0 | 1): JoineryKit => {
    const g = storey === 1 ? upperGraph : graph
    const plan = storey === 1 ? house.upper?.plan : house.floor
    const doors = (plan?.doors ?? []).flatMap((d) => {
      const w = g?.walls.find((x) => x.id === d.wallId)
      if (!w) return []
      const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1
      const at = (t: number) => ({ x: w.a.x + ((w.b.x - w.a.x) * t) / L, y: w.a.y + ((w.b.y - w.a.y) * t) / L })
      return [{ id: d.id, a: at(d.atMm - d.widthMm / 2), b: at(d.atMm + d.widthMm / 2) }]
    })
    return {
      placing: joinery.placing,
      setPlacing: joinery.setPlacing,
      marks: cladding ? planJoinery(cladding, storey) : [],
      doors,
      onPlace: (hit, p) => {
        if (hit.kind === "edge") {
          const o = cladding && outsideAt(cladding, storey, p)
          const t = o && cladding && outsideTarget(cladding, o.wallId, o.x)
          if (t) joinery.open(t)
        } else if (g) {
          const w = g.walls.find((x) => x.id === hit.id)
          if (!w) return
          const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1
          const t = insideTarget(house, g, storey, w.id, ((p.x - w.a.x) * (w.b.x - w.a.x) + (p.y - w.a.y) * (w.b.y - w.a.y)) / L)
          if (t) joinery.open(t)
        }
      },
      onPick: (id) => {
        const j = (house.joinery ?? []).find((x) => x.id === id)
        if (j && cladding) {
          const t = outsideTarget(cladding, j.wallId, 0, { editId: id })
          if (t) joinery.open(t)
          return
        }
        const d = plan?.doors.find((x) => x.id === id)
        const t = d && g && insideTarget(house, g, storey, d.wallId, 0, { editId: id })
        if (t) joinery.open(t)
      },
    }
  }
  const addUpper = (mode: "outline" | "rooms") => {
    const outline = graph.outline.length >= 3 ? graph.outline : STARTING_OUTLINE
    const xs = outline.map((p) => p.x)
    const ys = outline.map((p) => p.y)
    const [x0, y0] = [Math.min(...xs), Math.min(...ys)]
    const [w, h] = [Math.max(...xs) - x0, Math.max(...ys) - y0]
    // rooms to start from: two bedrooms and a bathroom off a landing, over the ground floor
    const boxes: RoomBox[] = [
      { id: newHouseId(), name: "Bedroom", kind: "bedroom", x: x0, y: y0, w: Math.round(w / 2 / 100) * 100, h: Math.round((h * 0.6) / 100) * 100 },
      { id: newHouseId(), name: "Bedroom 2", kind: "bedroom", x: x0 + Math.round(w / 2 / 100) * 100, y: y0, w: w - Math.round(w / 2 / 100) * 100, h: Math.round((h * 0.6) / 100) * 100 },
      { id: newHouseId(), name: "Bathroom", kind: "bathroom", x: x0, y: y0 + Math.round((h * 0.6) / 100) * 100, w: Math.round(w / 3 / 100) * 100, h: h - Math.round((h * 0.6) / 100) * 100 },
      {
        id: newHouseId(),
        name: "Landing",
        kind: "hall",
        x: x0 + Math.round(w / 3 / 100) * 100,
        y: y0 + Math.round((h * 0.6) / 100) * 100,
        w: w - Math.round(w / 3 / 100) * 100,
        h: h - Math.round((h * 0.6) / 100) * 100,
      },
    ]
    setHouse((hs) => ({
      ...hs,
      upper: {
        studHeightMm: hs.settings.studHeightMm,
        plan: { mode, outline: outline.map((p) => ({ ...p })), lockedEdgeLengths: {}, lockedVertexAngles: {}, walls: [], tags: [], boxes, overrides: {}, doors: [] },
      },
    }))
    setAdding(false)
    setLevel(1)
  }
  const upper = house.upper
  /** a gridline to a new place, taking whatever's on it along — on every storey */
  const moveGridline = (line: { key: string; axis: "x" | "y"; at: number }, to: number, reset = false) =>
    setHouse((h) => {
      const moved = { ...h.grid.moved }
      if (reset) delete moved[line.key]
      else moved[line.key] = to
      return {
        ...h,
        grid: { ...h.grid, moved },
        floor: movePlanLine(h.floor, line.axis, line.at, to),
        upper: h.upper ? { ...h.upper, plan: movePlanLine(h.upper.plan, line.axis, line.at, to) } : null,
      }
    })
  const setGrid = (u: (g: ProjectGrid) => ProjectGrid) => setHouse((h) => ({ ...h, grid: u(h.grid) }))
  const gridProps = { grid: house.grid, onMoveGridline: moveGridline, setGrid }
  return (
    <>
      <div className={styles.toggle} role="tablist" aria-label="Storey">
        <button type="button" role="tab" aria-selected={level === 0 && !adding} className={level === 0 && !adding ? styles.toggleOn : ""} onClick={() => (setAdding(false), setLevel(0))}>
          Ground floor
        </button>
        {upper ? (
          <button type="button" role="tab" aria-selected={level === 1} className={level === 1 ? styles.toggleOn : ""} onClick={() => setLevel(1)}>
            First floor
          </button>
        ) : (
          <button type="button" role="tab" aria-selected={adding} className={adding ? styles.toggleOn : ""} onClick={() => setAdding(true)}>
            + Add a first floor
          </button>
        )}
      </div>

      {adding && !upper ? (
        <section className={styles.card}>
          <h2>A first floor</h2>
          <p className={styles.hint}>Over the ground floor — all of it, or part (the rest gets its own lower roof). Start it either way:</p>
          <div className={styles.choices}>
            <button type="button" className={styles.choice} onClick={() => addUpper("outline")}>
              <strong>The ground floor&apos;s outline, then walls</strong>
              <span>Starts the same shape as the ground floor — move the corners in to set it back — then draw its walls.</span>
            </button>
            <button type="button" className={styles.choice} onClick={() => addUpper("rooms")}>
              <strong>Lay out the rooms</strong>
              <span>Bedrooms, a bathroom and a landing to start, over the ground floor — drag and resize them; the ground floor shows faintly under them.</span>
            </button>
          </div>
        </section>
      ) : level === 1 && upper && upperGraph ? (
        <>
          <FloorStep plan={upper.plan} title="First floor" setFloor={setPlanOf(1)} graph={upperGraph} ghost={graph.outline} selection={selection} setSelection={setSelection} {...gridProps} joineryKit={kitFor(1)} />
          <section className={styles.card}>
            <div className={styles.fields}>
              <label>
                First floor stud height
                <span className={styles.unit}>
                  <NumField value={upper.studHeightMm} min={1800} step={50} onChange={(v) => setHouse((h) => (h.upper ? { ...h, upper: { ...h.upper, studHeightMm: v } } : h))} /> mm
                </span>
              </label>
              <label>
                Floor depth between storeys
                <span className={styles.unit}>
                  <NumField value={house.settings.floorDepthMm} min={100} step={10} onChange={(v) => setHouse((h) => ({ ...h, settings: { ...h.settings, floorDepthMm: v } }))} /> mm
                </span>
                <span className={styles.muted}>joists and flooring, over the ground floor&apos;s top plate</span>
              </label>
            </div>
            <button
              type="button"
              className={styles.danger}
              onClick={() => {
                if (!window.confirm("Remove the first floor and everything on it?")) return
                setSelection(null)
                setLevel(0)
                setHouse((h) => ({ ...h, upper: null }))
              }}
            >
              Remove the first floor
            </button>
          </section>
        </>
      ) : (
        <FloorStep plan={house.floor} title="Ground floor" setFloor={setPlanOf(0)} graph={graph} selection={selection} setSelection={setSelection} {...gridProps} joineryKit={kitFor(0)} />
      )}
      {!adding && <JoinerySettings house={house} setHouse={setHouse} />}
      {joinery.modal}
    </>
  )
}

/** what a storey's plan needs to place windows and doors (see FloorsStep) */
interface JoineryKit {
  placing: boolean
  setPlacing: (u: (v: boolean) => boolean) => void
  /** the outside walls' windows and doors, and the inside walls' doors, on plan */
  marks: { id: string; a: Pt; b: Pt; door: boolean }[]
  doors: { id: string; a: Pt; b: Pt }[]
  onPlace: (hit: { kind: "edge"; index: number } | { kind: "wall"; id: string }, p: Pt) => void
  onPick: (id: string) => void
}

const FloorStep: React.FC<{
  plan: FloorPlan
  title: string
  setFloor: (u: (f: FloorPlan) => FloorPlan) => void
  graph: ReturnType<typeof floorGraph>
  /** the storey below's outline, shown faintly to line up with */
  ghost?: Pt[]
  selection: Selection
  setSelection: (s: Selection) => void
  grid: ProjectGrid
  onMoveGridline: (line: { key: string; axis: "x" | "y"; at: number }, to: number, reset?: boolean) => void
  setGrid: (u: (g: ProjectGrid) => ProjectGrid) => void
  joineryKit?: JoineryKit
}> = ({ plan, title, setFloor, graph, ghost, selection, setSelection, grid, onMoveGridline, setGrid, joineryKit: kit }) => {
  const floor = plan
  const [part, setPart] = useState<"outside" | "inside">("inside")
  const [tool, setTool] = useState<CanvasTool>("draw")
  const [snapOn, setSnapOn] = useState(true)
  const [newKind, setNewKind] = useState<RoomKind>("bedroom")

  if (floor.mode === "rooms") {
    const box = selection?.kind === "box" ? floor.boxes.find((b) => b.id === selection.id) : undefined
    const setBox = (id: string, patch: Partial<RoomBox>) => setFloor((f) => ({ ...f, boxes: f.boxes.map((b) => (b.id === id ? { ...b, ...patch } : b)) }))
    const addRoom = () => {
      const [w, h] = ROOM_SIZES[newKind]
      const right = floor.boxes.length ? Math.max(...floor.boxes.map((b) => b.x + b.w)) : 0
      const top = floor.boxes.length ? Math.min(...floor.boxes.map((b) => b.y)) : 0
      const count = floor.boxes.filter((b) => b.kind === newKind).length
      const id = newHouseId()
      setFloor((f) => ({ ...f, boxes: [...f.boxes, { id, name: `${ROOM_KIND_LABELS[newKind]}${count ? ` ${count + 1}` : ""}`, kind: newKind, x: right, y: top, w, h }] }))
      setSelection({ kind: "box", id })
    }
    return (
      <section className={styles.card}>
        <h2>{title} — rooms</h2>
        <p className={styles.hint}>
          Drag a room to move it, or tap it and drag a corner to resize it — both snap to the grid and to the rooms beside it. Tap one to name it or type its size.
        </p>
        <PlanCanvas
          graph={graph}
          ghost={ghost}
          grid={grid}
          boxes={floor.boxes}
          selection={selection}
          onSelect={setSelection}
          onMoveBox={(id, x, y) => setBox(id, { x, y })}
          onResizeBox={(id, r) => setBox(id, r)}
        />
        <div className={styles.toolbar}>
          <select value={newKind} onChange={(e) => setNewKind(e.target.value as RoomKind)} aria-label="Kind of room to add">
            {(Object.keys(ROOM_KIND_LABELS) as RoomKind[]).map((k) => (
              <option key={k} value={k}>
                {ROOM_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <button type="button" className={styles.pill} onClick={addRoom}>
            + Add room
          </button>
          <button
            type="button"
            className={styles.pill}
            onClick={() => {
              setSelection(null)
              setFloor((f) => roomsToOutline(f))
            }}
          >
            Turn into walls to draw on →
          </button>
        </div>
        {box && (
          <div className={styles.panel}>
            <div className={styles.fields}>
              <label>
                Name
                <input value={box.name} onChange={(e) => setBox(box.id, { name: e.target.value })} />
              </label>
              <label>
                Kind
                <select value={box.kind} onChange={(e) => setBox(box.id, { kind: e.target.value as RoomKind })}>
                  {(Object.keys(ROOM_KIND_LABELS) as RoomKind[]).map((k) => (
                    <option key={k} value={k}>
                      {ROOM_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Width
                <span className={styles.unit}>
                  <NumField value={box.w} min={300} step={100} onChange={(v) => setBox(box.id, { w: v })} /> mm
                </span>
              </label>
              <label>
                Depth
                <span className={styles.unit}>
                  <NumField value={box.h} min={300} step={100} onChange={(v) => setBox(box.id, { h: v })} /> mm
                </span>
              </label>
            </div>
            <button
              type="button"
              className={styles.danger}
              onClick={() => {
                setSelection(null)
                setFloor((f) => ({ ...f, boxes: f.boxes.filter((b) => b.id !== box.id) }))
              }}
            >
              Remove room
            </button>
          </div>
        )}
        <RoomList graph={graph} />
        <Warnings list={graph.warnings} />
      </section>
    )
  }

  // outline mode
  const wall = selection?.kind === "wall" ? floor.walls.find((w) => w.id === selection.id) : undefined
  const room = selection?.kind === "room" ? graph.rooms[selection.index] : undefined
  const setWall = (id: string, a: Pt, b: Pt) => setFloor((f) => ({ ...f, walls: f.walls.map((w) => (w.id === id ? { ...w, a, b } : w)) }))
  const nameRoom = (patch: { name?: string; kind?: RoomKind }) => {
    if (!room) return
    setFloor((f) => {
      const existing = f.tags.find((t) => t.id && t.id === room.id)
      if (existing) return { ...f, tags: f.tags.map((t) => (t.id === existing.id ? { ...t, ...patch } : t)) }
      return { ...f, tags: [...f.tags, { id: newHouseId(), name: room.name, kind: room.kind, at: room.label, ...patch }] }
    })
  }
  const vertical = wall ? Math.abs(wall.a.x - wall.b.x) < 1 : false
  /** a wall moved across to a new line; the walls butting into it stretch to meet it */
  const moveWall = (id: string, a: Pt, b: Pt) =>
    setFloor((f) => {
      const old = f.walls.find((w) => w.id === id)
      if (!old) return f
      const axis = Math.abs(old.a.x - old.b.x) < 1 ? "x" : Math.abs(old.a.y - old.b.y) < 1 ? "y" : null
      const other = axis === "x" ? "y" : "x"
      const lo = axis ? Math.min(old.a[other], old.b[other]) - 1 : 0
      const hi = axis ? Math.max(old.a[other], old.b[other]) + 1 : 0
      const on = (p: Pt) => !!axis && Math.abs(p[axis] - old.a[axis]) < 1 && p[other] >= lo && p[other] <= hi
      const carry = (p: Pt): Pt => (axis && on(p) ? { ...p, [axis]: a[axis] } : p)
      return { ...f, walls: f.walls.map((w) => (w.id === id ? { ...w, a, b } : { ...w, a: carry(w.a), b: carry(w.b) })) }
    })
  // (the fields measure from 0,0)
  const o = gridOrigin(grid)
  const op = vertical ? o.x : o.y
  const or = vertical ? o.y : o.x

  return (
    <section className={styles.card}>
      <h2>{title} — outline and walls</h2>
      <div className={styles.toggle} role="tablist">
        <button type="button" role="tab" aria-selected={part === "outside"} className={part === "outside" ? styles.toggleOn : ""} onClick={() => setPart("outside")}>
          Outside walls
        </button>
        <button type="button" role="tab" aria-selected={part === "inside"} className={part === "inside" ? styles.toggleOn : ""} onClick={() => setPart("inside")}>
          Inside walls &amp; rooms
        </button>
      </div>

      {part === "outside" ? (
        <OutlineEditor
          outline={floor.outline}
          setOutline={(outline) => setFloor((f) => ({ ...f, outline, lockedEdgeLengths: {}, lockedVertexAngles: {} }))}
          graph={graph}
          ghost={ghost}
          grid={grid}
          onMoveGridline={onMoveGridline}
          setGrid={setGrid}
          selection={selection}
          setSelection={setSelection}
        />
      ) : (
        <>
          <p className={styles.hint}>
            {tool === "draw"
              ? "Drag across the plan to draw a wall — it snaps square, to the grid and to the walls nearby (hold Shift not to). Switch to Select to name a room or change a wall."
              : tool === "select"
                ? "Drag a wall to move it — the walls butting into it stretch to meet it; hold Shift not to snap. Tap a room to name it, or a wall to set whether it's load-bearing, or remove it."
                : GRID_TOOL_HINTS[tool]}
          </p>
          <div className={styles.toolbar}>
            <div className={styles.toggle} role="radiogroup" aria-label="Tool">
              <button type="button" role="radio" aria-checked={tool === "draw"} className={tool === "draw" ? styles.toggleOn : ""} onClick={() => setTool("draw")}>
                Draw walls
              </button>
              <button type="button" role="radio" aria-checked={tool === "select"} className={tool === "select" ? styles.toggleOn : ""} onClick={() => setTool("select")}>
                Select
              </button>
              <GridToolButtons tool={tool} setTool={setTool} />
            </div>
            <label className={styles.check}>
              <input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} /> Snap to gridlines and walls
            </label>
            {snapOn && <span className={styles.muted}>(hold Shift not to)</span>}
          </div>
          {kit && (
            <div className={styles.toolbar}>
              <button type="button" className={`${styles.pill} ${kit.placing ? styles.pillOn : ""}`} aria-pressed={kit.placing} onClick={() => kit.setPlacing((v) => !v)} aria-keyshortcuts="W">
                Place windows &amp; doors <kbd className={styles.kbd}>W</kbd>
              </button>
              <span className={styles.muted}>
                {kit.placing ? "Tap a wall, outside or in, where one goes — it starts like the last one you laid. Tap one laid to change it. W or Escape to stop." : "Tap a window or door to change it."}
              </span>
            </div>
          )}
          <PlanCanvas
            graph={graph}
            ghost={ghost}
            grid={grid}
            tool={kit?.placing ? "select" : tool}
            pickOutside={kit?.placing}
            placing={kit?.placing}
            onPlace={kit?.onPlace}
            joinery={kit?.marks}
            doors={kit?.doors}
            onPickJoinery={kit?.onPick}
            selection={selection}
            onSelect={setSelection}
            onDrawWall={(a, b) => setFloor((f) => ({ ...f, walls: [...f.walls, { id: newHouseId(), a, b, loadBearing: "auto" }] }))}
            onMoveWall={moveWall}
            snapOn={snapOn}
            {...gridToolProps(setGrid, setSelection, () => setTool("select"))}
            onRuler={(axis, id) => setSelection({ kind: "ruler", axis, ...(id === null ? { id: NEW_ROW } : id ? { id } : {}) })}
          />
          <RulerPanel grid={grid} setGrid={setGrid} selection={selection} setSelection={setSelection} />
          <DimPanel grid={grid} setGrid={setGrid} selection={selection} setSelection={setSelection} />
          {wall && (
            <div className={styles.panel}>
              <div className={styles.fields}>
                <label>
                  {grid.origin ? (vertical ? "Across from 0,0" : "Down from 0,0") : vertical ? "Across from the left" : "Down from the top"}
                  <span className={styles.unit}>
                    <NumField
                      value={Math.round(vertical ? wall.a.x : wall.a.y) - op}
                      step={100}
                      onChange={(n) => {
                        const v = n + op
                        if (vertical) moveWall(wall.id, { ...wall.a, x: v }, { ...wall.b, x: v })
                        else moveWall(wall.id, { ...wall.a, y: v }, { ...wall.b, y: v })
                      }}
                    />{" "}
                    mm
                  </span>
                </label>
                <label>
                  From
                  <span className={styles.unit}>
                    <NumField
                      value={Math.round(vertical ? Math.min(wall.a.y, wall.b.y) : Math.min(wall.a.x, wall.b.x)) - or}
                      step={100}
                      onChange={(n) => {
                        const v = n + or
                        const hi = vertical ? Math.max(wall.a.y, wall.b.y) : Math.max(wall.a.x, wall.b.x)
                        if (v >= hi) return
                        if (vertical) setWall(wall.id, { ...wall.a, y: v }, { ...wall.b, y: hi })
                        else setWall(wall.id, { ...wall.a, x: v }, { ...wall.b, x: hi })
                      }}
                    />{" "}
                    mm
                  </span>
                </label>
                <label>
                  To
                  <span className={styles.unit}>
                    <NumField
                      value={Math.round(vertical ? Math.max(wall.a.y, wall.b.y) : Math.max(wall.a.x, wall.b.x)) - or}
                      step={100}
                      onChange={(n) => {
                        const v = n + or
                        const lo = vertical ? Math.min(wall.a.y, wall.b.y) : Math.min(wall.a.x, wall.b.x)
                        if (v <= lo) return
                        if (vertical) setWall(wall.id, { ...wall.a, y: lo }, { ...wall.b, y: v })
                        else setWall(wall.id, { ...wall.a, x: lo }, { ...wall.b, x: v })
                      }}
                    />{" "}
                    mm
                  </span>
                </label>
                <LoadBearingField
                  value={wall.loadBearing}
                  onChange={(v) => setFloor((f) => ({ ...f, walls: f.walls.map((w) => (w.id === wall.id ? { ...w, loadBearing: v } : w)) }))}
                />
              </div>
              <span className={styles.muted}>{m(Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y))} long</span>
              <button
                type="button"
                className={styles.danger}
                onClick={() => {
                  setSelection(null)
                  setFloor((f) => ({ ...f, walls: f.walls.filter((w) => w.id !== wall.id) }))
                }}
              >
                Remove wall
              </button>
            </div>
          )}
          {room && (
            <div className={styles.panel}>
              <div className={styles.fields}>
                <label>
                  Name
                  <input value={room.name} onChange={(e) => nameRoom({ name: e.target.value })} />
                </label>
                <label>
                  Kind
                  <select value={room.kind} onChange={(e) => nameRoom({ kind: e.target.value as RoomKind })}>
                    {(Object.keys(ROOM_KIND_LABELS) as RoomKind[]).map((k) => (
                      <option key={k} value={k}>
                        {ROOM_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <span className={styles.muted}>{room.areaM2.toFixed(1)} m²</span>
            </div>
          )}
          <RoomList graph={graph} />
          <Warnings list={graph.warnings} />
        </>
      )}
    </section>
  )
}

/** The outside walls on the plan: corners and sides dragged on to the
 * gridlines, kept square as they go; a side picked can take a step, the
 * whole lot can be squared back up; a gridline dragged (or typed) to where a
 * wall should go takes what's on it with it. */
const OutlineEditor: React.FC<{
  outline: Pt[]
  setOutline: (pts: Pt[]) => void
  graph: ReturnType<typeof floorGraph>
  ghost?: Pt[]
  grid: ProjectGrid
  onMoveGridline: (line: { key: string; axis: "x" | "y"; at: number }, to: number, reset?: boolean) => void
  setGrid: (u: (g: ProjectGrid) => ProjectGrid) => void
  selection: Selection
  setSelection: (s: Selection) => void
}> = ({ outline, setOutline, graph, ghost, grid, onMoveGridline, setGrid, selection, setSelection }) => {
  const [tool, setTool] = useState<CanvasTool>("outline")
  const lines = linesAround(grid, [...outline, ...(ghost ?? [])])
  const edge = selection?.kind === "edge" && selection.index < outline.length ? selection.index : null
  const gridline = selection?.kind === "gridline" ? selection : null
  // where a picked gridline is now, and where it'd be unmoved (from 0,0)
  const o = gridline ? gridOrigin(grid)[gridline.axis] : 0
  const lineAt = gridline ? gridLineAt(grid, gridline.key) : 0
  const lineHome = gridline ? gridLineHome(grid, gridline.key) : 0

  /** a picked side split in three, on the gridlines nearest its thirds — drag the middle out for a step */
  const addStep = (i: number) => {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    const plumb = Math.abs(a.x - b.x) < Math.abs(a.y - b.y)
    const axis = plumb ? "y" : "x"
    const ls = plumb ? lines.ys : lines.xs
    const lo = Math.min(a[axis], b[axis])
    const hi = Math.max(a[axis], b[axis])
    const inner = ls.filter((v) => v > lo + 1 && v < hi - 1)
    if (inner.length < 2) return
    let p1 = nearestLine(a[axis] + (b[axis] - a[axis]) / 3, inner)
    let p2 = nearestLine(a[axis] + ((b[axis] - a[axis]) * 2) / 3, inner)
    if (p1 === p2) {
      const k = inner.indexOf(p1)
      p2 = inner[k + 1] ?? inner[k - 1]
      if ((p2 - p1) * (b[axis] - a[axis]) < 0) [p1, p2] = [p2, p1]
    }
    const at = (v: number): Pt => (plumb ? { x: a.x, y: v } : { x: v, y: a.y })
    const next = [...outline.slice(0, i + 1), at(p1), at(p2), ...outline.slice(i + 1)]
    setOutline(next)
    setSelection({ kind: "edge", index: i + 1 })
  }
  const square = isSquare(outline) && outline.every((p) => lines.xs.some((x) => Math.abs(x - p.x) < 1) && lines.ys.some((y) => Math.abs(y - p.y) < 1))

  return (
    <>
      <p className={styles.hint}>
        The outside face of the outside walls, on the grid. Drag a corner or a wall — it snaps to the gridlines and every corner stays square.
        Tap a wall to put a step in it. The gridlines are every {grid.stepMm / 1000} m: drag one by its dot along the top or side to where a wall
        should go (whatever&apos;s on it comes too), or tap the dot to type where. The measurements down the left and along the top run from 0,0
        to each line you&apos;ve moved.
      </p>
      <div className={styles.toolbar}>
        <div className={styles.toggle} role="radiogroup" aria-label="Tool">
          <button type="button" role="radio" aria-checked={tool === "outline"} className={tool === "outline" ? styles.toggleOn : ""} onClick={() => setTool("outline")}>
            Shape walls
          </button>
          <GridToolButtons tool={tool} setTool={setTool} />
        </div>
      </div>
      <PlanCanvas
        graph={graph}
        ghost={ghost}
        grid={grid}
        tool={tool}
        selection={selection}
        onSelect={setSelection}
        onOutlineChange={setOutline}
        onMoveGridline={(line: GridLine, to: number) => onMoveGridline(line, to)}
        {...gridToolProps(setGrid, setSelection, () => setTool("outline"))}
        onRuler={(axis, id) => setSelection({ kind: "ruler", axis, ...(id === null ? { id: NEW_ROW } : id ? { id } : {}) })}
      />
      <RulerPanel grid={grid} setGrid={setGrid} selection={selection} setSelection={setSelection} />
      {/* (below the plan, so it doesn't shift under the pointer as the tool changes) */}
      {tool !== "outline" && <p className={styles.hint}>{GRID_TOOL_HINTS[tool]}</p>}
      <DimPanel grid={grid} setGrid={setGrid} selection={selection} setSelection={setSelection} />
      <div className={styles.toolbar}>
        <button type="button" className={styles.pill} disabled={square} onClick={() => {
            setOutline(squareUp(outline, lines))
            setSelection(null)
          }}>
          Square it up
        </button>
        {!square && <span className={styles.muted}>Puts every wall back level or plumb, on its nearest gridline.</span>}
      </div>
      {edge !== null && (
        <div className={styles.panel}>
          <p>
            <strong>Wall {edge + 1}</strong>{" "}
            {(Math.hypot(outline[(edge + 1) % outline.length].x - outline[edge].x, outline[(edge + 1) % outline.length].y - outline[edge].y) / 1000).toFixed(2)} m. Drag
            it to move it, or put a step in it: it splits in three and the middle can be dragged out (drag it back flush and the step goes).
          </p>
          <button type="button" className={styles.pill} onClick={() => addStep(edge)}>
            Put a step in it
          </button>
        </div>
      )}
      {gridline && (
        <div className={styles.panel}>
          <div className={styles.fields}>
            <label>
              {grid.origin ? (gridline.axis === "x" ? "Gridline across from 0,0" : "Gridline down from 0,0") : gridline.axis === "x" ? "Gridline across from the left" : "Gridline down from the top"}
              <span className={styles.unit}>
                <NumField value={lineAt - o} step={10} onChange={(v) => onMoveGridline({ key: gridline.key, axis: gridline.axis, at: lineAt }, v + o)} /> mm
              </span>
            </label>
          </div>
          {lineAt !== lineHome && (
            <button type="button" className={styles.pill} onClick={() => onMoveGridline({ key: gridline.key, axis: gridline.axis, at: lineAt }, lineHome, true)}>
              Put it back to {lineHome - o} mm
            </button>
          )}
          <button
            type="button"
            className={styles.pill}
            onClick={() => setGrid((g) => ({ ...g, origin: { ...(g.origin ?? { x: "x:0", y: "y:0" }), [gridline.axis]: gridline.key } }))}
            disabled={Math.abs(lineAt - o) < 1}
          >
            Make this line 0
          </button>
        </div>
      )}
      {!isSquare(outline) && <Warnings list={["A corner isn't square — Square it up, or rooms and load-bearing walls can't be worked out."]} />}
    </>
  )
}

const GRID_TOOL_HINTS: Partial<Record<CanvasTool, string>> = {
  measure: "Tap a grid point, then another — the measurement stays on the plan (every storey) and follows its gridlines when they move. Tap a measurement afterwards to remove it.",
  origin: "Tap the grid point everything should be measured from — it becomes 0,0, and the measurements and fields all count from it.",
}

/** the grid's own tools, beside a plan's others */
const GridToolButtons: React.FC<{ tool: CanvasTool; setTool: (t: CanvasTool) => void }> = ({ tool, setTool }) => (
  <>
    <button type="button" role="radio" aria-checked={tool === "measure"} className={tool === "measure" ? styles.toggleOn : ""} onClick={() => setTool("measure")}>
      Measure
    </button>
    <button type="button" role="radio" aria-checked={tool === "origin"} className={tool === "origin" ? styles.toggleOn : ""} onClick={() => setTool("origin")}>
      Set 0,0
    </button>
  </>
)

/** what a plan needs to measure and set 0,0; `done` is the tool to go back to once 0,0's set */
const gridToolProps = (setGrid: (u: (g: ProjectGrid) => ProjectGrid) => void, setSelection: (s: Selection) => void, done: () => void) => ({
  onAddDim: (a: GridPoint, b: GridPoint) => {
    const id = newHouseId()
    setGrid((g) => ({ ...g, dims: [...(g.dims ?? []), { id, a, b } satisfies GridDim] }))
  },
  onSetOrigin: (p: GridPoint) => {
    setGrid((g) => ({ ...g, origin: p }))
    setSelection(null)
    done()
  },
})

const SHOWS: { value: RulerShow; label: string }[] = [
  { value: "between", label: "In between" },
  { value: "running", label: "Running" },
  { value: "both", label: "Both" },
]
/** the rulers' new-row mode, in a ruler selection's id */
const NEW_ROW = "+"

/** A ruler picked (or its + tapped): what the one down the left or along
 * the top shows, and the rows of measurements typed in under it — a list
 * of gaps (or running measurements) from a start, each row showing its
 * gaps, its running measurements, or both. */
const RulerPanel: React.FC<{ grid: ProjectGrid; setGrid: (u: (g: ProjectGrid) => ProjectGrid) => void; selection: Selection; setSelection: (s: Selection) => void }> = ({
  grid,
  setGrid,
  selection,
  setSelection,
}) => {
  const sel = selection?.kind === "ruler" ? selection : null
  const chain = sel?.id && sel.id !== NEW_ROW ? grid.chains?.find((c) => c.id === sel.id) : undefined
  const adding = sel?.id === NEW_ROW
  // the list as typed, and whether it's gaps or running measurements
  const [text, setText] = useState("")
  const [typedAs, setTypedAs] = useState<"gaps" | "running">("gaps")
  const [start, setStart] = useState(0)
  const [show, setShow] = useState<RulerShow>("both")
  const key = sel ? `${sel.axis}${sel.id ?? ""}` : ""
  const [loadedFor, setLoadedFor] = useState("")
  if (key !== loadedFor) {
    // (a row picked: its numbers to change; a new one: a blank list)
    setLoadedFor(key)
    setText(chain ? chain.steps.join(" ") : "")
    setTypedAs("gaps")
    setStart(chain?.start ?? 0)
    setShow(chain?.show ?? "both")
  }
  if (!sel) return null
  const way = sel.axis === "x" ? "along the top" : "down the left"
  const nums = parseMeasures(text)
  // running measurements typed: each on from the start, in order
  const steps = typedAs === "gaps" ? nums : nums.map((v, i) => v - (i ? nums[i - 1] : 0))
  const ok = steps.length > 0 && steps.every((v) => v > 0)
  const save = () => {
    if (!ok) return
    const id = chain?.id ?? newHouseId()
    const c: MeasureChain = { id, axis: sel.axis, start, steps, show }
    setGrid((g) => ({ ...g, chains: chain ? (g.chains ?? []).map((x) => (x.id === id ? c : x)) : [...(g.chains ?? []), c] }))
    setSelection({ kind: "ruler", axis: sel.axis, id })
  }
  const showToggle = (value: RulerShow, onChange: (v: RulerShow) => void) => (
    <div className={styles.toggle} role="radiogroup" aria-label="Show">
      {SHOWS.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? styles.toggleOn : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
  if (!chain && !adding)
    return (
      <div className={styles.panel}>
        <p>
          <strong>The measurements {way}</strong> — from 0,0 to each line you&apos;ve moved and the house&apos;s ends.
        </p>
        {showToggle(grid.rulerShow?.[sel.axis] ?? "between", (v) => setGrid((g) => ({ ...g, rulerShow: { ...(g.rulerShow ?? {}), [sel.axis]: v } })))}
        <div className={styles.toolbar}>
          <button type="button" className={styles.pill} onClick={() => setSelection({ kind: "ruler", axis: sel.axis, id: NEW_ROW })}>
            + Add a row of measurements {way}
          </button>
        </div>
      </div>
    )
  return (
    <div className={styles.panel}>
      <p>
        <strong>{adding ? `A row of measurements ${way}` : `Measurements ${way}`}</strong> — type them in, any way apart (1200 900 2400, or
        1200, 900, 2400).
      </p>
      <div className={styles.fields}>
        <label style={{ flex: "2 1 18rem" }}>
          Measurements
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="1200 900 2400"
            inputMode="decimal"
          />
          <span className={styles.muted}>
            {ok
              ? `${steps.length} gap${steps.length === 1 ? "" : "s"}, ${steps.reduce((a, b) => a + b, 0)} mm in all`
              : nums.length
                ? "Running measurements need to go up each time."
                : "mm"}
          </span>
        </label>
        <label>
          Starting
          <span className={styles.unit}>
            <NumField value={start} step={10} onChange={setStart} /> mm
          </span>
          <span className={styles.muted}>from 0,0</span>
        </label>
      </div>
      <div className={styles.toolbar}>
        <span className={styles.muted}>Typed as</span>
        <div className={styles.toggle} role="radiogroup" aria-label="Typed as">
          {(["gaps", "running"] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={typedAs === v} className={typedAs === v ? styles.toggleOn : ""} onClick={() => setTypedAs(v)}>
              {v === "gaps" ? "Gaps between" : "Running from the start"}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.toolbar}>
        <span className={styles.muted}>Show</span>
        {showToggle(show, (v) => {
          setShow(v)
          // (a row already there shows it straight away)
          if (chain) setGrid((g) => ({ ...g, chains: (g.chains ?? []).map((x) => (x.id === chain.id ? { ...x, show: v } : x)) }))
        })}
      </div>
      <div className={styles.toolbar}>
        <button type="button" className={`${styles.pill} ${styles.pillOn}`} disabled={!ok} onClick={save}>
          {adding ? "Add the row" : "Save"}
        </button>
        {chain && (
          <button
            type="button"
            className={styles.danger}
            onClick={() => {
              setGrid((g) => ({ ...g, chains: (g.chains ?? []).filter((x) => x.id !== chain.id) }))
              setSelection(null)
            }}
          >
            Remove the row
          </button>
        )}
        <button type="button" className={styles.link} onClick={() => setSelection(null)}>
          Close
        </button>
      </div>
    </div>
  )
}

/** a measurement picked: what it measures, and to take it off */
const DimPanel: React.FC<{ grid: ProjectGrid; setGrid: (u: (g: ProjectGrid) => ProjectGrid) => void; selection: Selection; setSelection: (s: Selection) => void }> = ({
  grid,
  setGrid,
  selection,
  setSelection,
}) => {
  const d = selection?.kind === "dim" ? grid.dims?.find((x) => x.id === selection.id) : undefined
  const o = gridOrigin(grid)
  const isOrigin = !grid.origin || (grid.origin.x === "x:0" && grid.origin.y === "y:0")
  return (
    <>
      {d &&
        (() => {
          const a = gridPointAt(grid, d.a)
          const b = gridPointAt(grid, d.b)
          const at = (p: { x: number; y: number }) => `${Math.round(p.x - o.x)}, ${Math.round(p.y - o.y)}`
          return (
            <div className={styles.panel}>
              <p>
                <strong>{Math.round(Math.hypot(b.x - a.x, b.y - a.y))} mm</strong> — from {at(a)} to {at(b)}
                {Math.abs(b.x - a.x) >= 1 && Math.abs(b.y - a.y) >= 1 && ` (${Math.round(Math.abs(b.x - a.x))} across, ${Math.round(Math.abs(b.y - a.y))} down)`}
              </p>
              <button
                type="button"
                className={styles.danger}
                onClick={() => {
                  setSelection(null)
                  setGrid((g) => ({ ...g, dims: (g.dims ?? []).filter((x) => x.id !== d.id) }))
                }}
              >
                Remove measurement
              </button>
            </div>
          )
        })()}
      {(!!grid.dims?.length || !isOrigin) && (
        <div className={styles.toolbar}>
          {!!grid.dims?.length && (
            <button
              type="button"
              className={styles.pill}
              onClick={() => {
                if (!window.confirm(`Take all ${grid.dims!.length} measurements off the plan?`)) return
                setSelection(null)
                setGrid((g) => ({ ...g, dims: [] }))
              }}
            >
              Clear measurements
            </button>
          )}
          {!isOrigin && (
            <button type="button" className={styles.pill} onClick={() => setGrid((g) => ({ ...g, origin: undefined }))}>
              Put 0,0 back to the start
            </button>
          )}
        </div>
      )}
    </>
  )
}

const LoadBearingField: React.FC<{ value: LoadBearing; onChange: (v: LoadBearing) => void }> = ({ value, onChange }) => (
  <label>
    Load-bearing
    <select value={value} onChange={(e) => onChange(e.target.value as LoadBearing)}>
      <option value="auto">Worked out from the roof</option>
      <option value="yes">Yes — load-bearing</option>
      <option value="no">No — never</option>
    </select>
  </label>
)

const RoomList: React.FC<{ graph: ReturnType<typeof floorGraph> }> = ({ graph }) => {
  if (!graph.rooms.length) return null
  const total = graph.rooms.reduce((s, r) => s + r.areaM2, 0)
  return (
    <ul className={styles.rooms}>
      {graph.rooms.map((r, i) => (
        <li key={i}>
          <span>
            {r.name} <span className={styles.muted}>· {ROOM_KIND_LABELS[r.kind]}</span>
          </span>
          <span>{r.areaM2.toFixed(1)} m²</span>
        </li>
      ))}
      <li className={styles.total}>
        <span>Floor area (inside the outline)</span>
        <span>{total.toFixed(1)} m²</span>
      </li>
    </ul>
  )
}

const Warnings: React.FC<{ list: string[] }> = ({ list }) =>
  list.length ? (
    <ul className={styles.warnings}>
      {list.map((w) => (
        <li key={w}>⚠ {w}</li>
      ))}
    </ul>
  ) : null

// ── 3. roof & structure ────────────────────────────────────────────────

const StructureStep: React.FC<{
  house: HouseProject
  setSettings: (p: Partial<HouseSettings>) => void
  setHouse: (u: (h: HouseProject) => HouseProject) => void
  level: number
  setLevel: (l: number) => void
  setFloor: (u: (f: FloorPlan) => FloorPlan) => void
  graph: ReturnType<typeof floorGraph>
  ghost?: Pt[]
  structure: Structure
  lowerRoofs: boolean
  roofOk: boolean
  selection: Selection
  setSelection: (s: Selection) => void
}> = ({ house, setSettings, setHouse, level, setLevel, setFloor, graph, ghost, structure, lowerRoofs, roofOk, selection, setSelection }) => {
  const st = house.settings
  const roof = st.roof
  const setRoof = (patch: Partial<HouseSettings["roof"]>) => setSettings({ roof: { ...roof, ...patch } })
  const wall = selection?.kind === "wall" ? graph.walls.find((w) => w.id === selection.id) : undefined
  const verdict = wall ? structure.inside.get(wall.id) : undefined
  // a roof section picked by its span arrow: its own settings over the house's
  const section = selection?.kind === "section" ? structure.spans.find((s) => s.key === selection.key) : undefined
  const sectionSet = section?.key ? st.roofSections?.[section.key] : undefined
  const setSection = (key: string, patch: Partial<WingSetting>) =>
    setHouse((h) => {
      const all = { ...(h.settings.roofSections ?? {}) }
      const next = { ...(all[key] ?? {}), ...patch }
      if (!next.turned) delete next.turned
      if (!next.type) delete next.type
      if (Object.keys(next).length) all[key] = next
      else delete all[key]
      return { ...h, settings: { ...h.settings, roofSections: all } }
    })
  const lowerKey = section?.key?.startsWith("l:")
  const defaultType = lowerKey ? st.lowerRoof.type : roof.type === "auto" || roof.type === "none" ? "gable" : roof.type
  const setLB = (id: string, v: LoadBearing) =>
    setFloor((f) =>
      f.mode === "rooms"
        ? { ...f, overrides: { ...f.overrides, [id]: v } }
        : { ...f, walls: f.walls.map((w) => (w.id === id ? { ...w, loadBearing: v } : w)) },
    )
  const lbInside = graph.walls.filter((w) => structure.inside.get(w.id)?.loadBearing)
  const lbOutside = structure.outside.filter((v) => v.loadBearing).length

  return (
    <section className={styles.card}>
      <h2>Roof &amp; structure</h2>
      <div className={styles.fields}>
        <label>
          Roof (the house&apos;s default)
          <select value={roof.type === "auto" ? "gable" : roof.type} onChange={(e) => setRoof({ type: e.target.value as RoofType })}>
            {ROOF_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pitch
          <span className={styles.unit}>
            <NumField value={roof.pitchDeg ?? 25} min={1} max={60} step={0.5} onChange={(v) => setRoof({ pitchDeg: v })} /> °
          </span>
        </label>
        <label>
          Small wings off a gable end
          <select value={roof.bumpOuts ?? "gable"} onChange={(e) => setRoof({ bumpOuts: e.target.value as "gable" | "leanTo" })}>
            <option value="gable">A gable, falling back to a valley at the wall</option>
            <option value="leanTo">A lean-to against the wall</option>
          </select>
        </label>
        <label>
          {house.upper ? "Ground floor stud height" : "Stud height"}
          <span className={styles.unit}>
            <NumField value={st.studHeightMm} min={1800} step={50} onChange={(v) => setSettings({ studHeightMm: v })} /> mm
          </span>
        </label>
        {house.upper && (
          <label>
            First floor stud height
            <span className={styles.unit}>
              <NumField value={house.upper.studHeightMm} min={1800} step={50} onChange={(v) => setHouse((h) => (h.upper ? { ...h, upper: { ...h.upper, studHeightMm: v } } : h))} /> mm
            </span>
          </label>
        )}
        <label>
          Eaves
          <span className={styles.unit}>
            <NumField value={roof.eavesMm} min={0} step={50} onChange={(v) => setRoof({ eavesMm: v })} /> mm
          </span>
        </label>
        <label>
          Verge
          <span className={styles.unit}>
            <NumField value={roof.vergeMm} min={0} step={50} onChange={(v) => setRoof({ vergeMm: v })} /> mm
          </span>
        </label>
      </div>
      <div className={styles.swatches} role="radiogroup" aria-label="Roof colour">
        {ROOF_COLOURS.map((c) => (
          <button key={c.hex} type="button" role="radio" aria-checked={roof.colour === c.hex} className={`${styles.swatch} ${roof.colour === c.hex ? styles.swatchOn : ""}`} onClick={() => setRoof({ colour: c.hex })}>
            <span style={{ background: c.hex }} />
            {c.name}
          </button>
        ))}
      </div>

      {house.upper && lowerRoofs && (
        <div className={styles.fields}>
          <label>
            Lower roof
            <select value={st.lowerRoof.type} onChange={(e) => setSettings({ lowerRoof: { ...st.lowerRoof, type: e.target.value as "skillion" | "hip" } })}>
              <option value="skillion">Lean-to, up against the first floor</option>
              <option value="hip">Hip</option>
            </select>
            <span className={styles.muted}>over the ground floor the first floor doesn&apos;t cover</span>
          </label>
          <label>
            Lower roof pitch
            <span className={styles.unit}>
              <NumField value={st.lowerRoof.pitchDeg} min={1} max={60} step={0.5} onChange={(v) => setSettings({ lowerRoof: { ...st.lowerRoof, pitchDeg: v } })} /> °
            </span>
          </label>
        </div>
      )}

      <h3>What holds it up</h3>
      <div className={styles.toggle} role="radiogroup" aria-label="Roof framing">
        {(Object.keys(ROOF_FRAME_LABELS) as RoofFrame[]).map((f) => (
          <button key={f} type="button" role="radio" aria-checked={st.roofFrame === f} className={st.roofFrame === f ? styles.toggleOn : ""} onClick={() => setSettings({ roofFrame: f })}>
            {ROOF_FRAME_LABELS[f]}
          </button>
        ))}
      </div>
      <div className={styles.fields}>
        {st.roofFrame === "trusses" ? (
          <label>
            Longest standard truss
            <span className={styles.unit}>
              <NumField value={st.maxTrussSpanMm} min={3000} step={100} onChange={(v) => setSettings({ maxTrussSpanMm: v })} /> mm
            </span>
            <span className={styles.muted}>wall to wall — ask your truss maker</span>
          </label>
        ) : (
          <>
            <label>
              Ceiling joists span up to
              <span className={styles.unit}>
                <NumField value={st.ceilingJoistSpanMm} min={1000} step={100} onChange={(v) => setSettings({ ceilingJoistSpanMm: v })} /> mm
              </span>
              <span className={styles.muted}>from the span tables, for your size and centres</span>
            </label>
            <label>
              Rafters span up to
              <span className={styles.unit}>
                <NumField value={st.rafterSpanMm} min={1000} step={100} onChange={(v) => setSettings({ rafterSpanMm: v })} /> mm
              </span>
              <span className={styles.muted}>on the slope, before underpurlins</span>
            </label>
          </>
        )}
      </div>

      {house.upper && (
        <div className={styles.fields}>
          <label>
            First floor joists span up to
            <span className={styles.unit}>
              <NumField value={st.floorJoistSpanMm} min={1000} step={100} onChange={(v) => setSettings({ floorJoistSpanMm: v })} /> mm
            </span>
            <span className={styles.muted}>between the ground floor&apos;s walls — from the span tables</span>
          </label>
        </div>
      )}

      {house.upper && (
        <div className={styles.toggle} role="tablist" aria-label="Storey">
          {LEVEL_NAMES.map((n, l) => (
            <button key={n} type="button" role="tab" aria-selected={level === l} className={level === l ? styles.toggleOn : ""} onClick={() => setLevel(l)}>
              {n}
            </button>
          ))}
        </div>
      )}
      <p className={styles.hint}>
        Load-bearing walls are in red; the dashed arrows are the way the {st.roofFrame === "trusses" ? "trusses" : "ceiling joists and rafters"}
        {house.upper && level === 0 ? " and the first floor's joists" : ""} span. Tap an inside wall to see why, or to set it by hand. Tap a
        roof section&apos;s arrow (or its ↻) to turn its framing 90° or give it its own kind of roof.
      </p>
      <PlanCanvas
        graph={graph}
        ghost={ghost}
        grid={house.grid}
        structure={structure}
        selection={selection}
        onSelect={(s) => setSelection(s?.kind === "wall" || s?.kind === "section" ? s : null)}
        pickSections
      />
      {section?.key && (
        <div className={styles.panel}>
          <p>
            <strong>Roof section</strong> — {lowerKey ? "the ground floor's lower roof" : "the main roof"}: {section.type ?? defaultType}
            {sectionSet?.turned ? ", turned by hand" : ""}. The {st.roofFrame === "trusses" ? "trusses span" : "rafters and ceiling joists span"} the way
            the arrow points.
          </p>
          <div className={styles.fields}>
            <label>
              Its roof
              <select value={sectionSet?.type ?? ""} onChange={(e) => setSection(section.key!, { type: (e.target.value || undefined) as WingSetting["type"] })}>
                <option value="">The house&apos;s ({defaultType})</option>
                <option value="gable">Gable</option>
                <option value="hip">Hip</option>
                <option value="skillion">Skillion</option>
              </select>
            </label>
          </div>
          <div className={styles.toolbar}>
            <button type="button" className={styles.pill} onClick={() => setSection(section.key!, { turned: !sectionSet?.turned })}>
              ↻ Turn the span 90°
            </button>
            {sectionSet && (
              <button type="button" className={styles.pill} onClick={() => setSection(section.key!, { turned: false, type: undefined })}>
                Back to the house&apos;s
              </button>
            )}
          </div>
        </div>
      )}
      {!!Object.keys(st.roofSections ?? {}).length && !section && (
        <div className={styles.toolbar}>
          <span className={styles.muted}>
            {Object.keys(st.roofSections ?? {}).length} roof section{Object.keys(st.roofSections ?? {}).length === 1 ? "" : "s"} set by hand.
          </span>
          <button type="button" className={styles.pill} onClick={() => setSettings({ roofSections: {} })}>
            Put them all back
          </button>
        </div>
      )}
      {wall && verdict && (
        <div className={styles.panel}>
          <p>
            <strong>{verdict.loadBearing ? "Load-bearing." : "Not load-bearing."}</strong> {verdict.reason}
          </p>
          <div className={styles.fields}>
            <LoadBearingField value={wall.loadBearing} onChange={(v) => setLB(wall.id, v)} />
          </div>
        </div>
      )}
      {roofOk ? (
        <p className={styles.summary}>
          {lbOutside} of {structure.outside.length} outside walls and {lbInside.length} of {graph.walls.length} inside walls are load-bearing.
        </p>
      ) : (
        <p className={styles.hint}>No roof yet — pick one to work out what holds it up.</p>
      )}
      <Warnings list={structure.warnings} />
      {structure.notes.map((n) => (
        <p key={n} className={styles.hint}>
          {n}
        </p>
      ))}
    </section>
  )
}

// ── 4. 3D ──────────────────────────────────────────────────────────────

const ThreeDStep: React.FC<{
  house: HouseProject
  setHouse: (u: (h: HouseProject) => HouseProject) => void
  setPlanOf: (l: number) => (u: (f: FloorPlan) => FloorPlan) => void
  graph: ReturnType<typeof floorGraph>
  upperGraph: ReturnType<typeof floorGraph> | null
  cladding: NonNullable<ReturnType<typeof houseCladding>>
  structures: ReturnType<typeof analyseHouse>
}> = ({ house, setHouse, setPlanOf, graph, upperGraph, cladding, structures }) => {
  const input = useMemo(() => houseRenderInputFrom(house, graph, upperGraph, cladding, structures), [cladding, graph, upperGraph, house, structures])
  // windows and doors placed on the outside walls straight off the 3D view
  const floorOf = (wallId: string) => (wallId.startsWith("us") ? cladding.upperFloorZ : 0)
  const joinery = useJoineryEditor(house, setHouse, setPlanOf, floorOf)
  const onPick = (hit: { wallId: string; x: number; z: number }) => {
    if (hit.wallId.startsWith("in:")) {
      // an inside wall: a door on its line
      const [, s, lineId] = hit.wallId.split(":")
      const storey = s === "1" ? 1 : 0
      const g = storey === 1 ? upperGraph : graph
      const floor = storey === 1 ? cladding.upperFloorZ : 0
      const plan = storey === 1 ? house.upper?.plan : house.floor
      const on = plan?.doors.find((d) => d.wallId === lineId && Math.abs(hit.x - d.atMm) <= d.widthMm / 2 && hit.z - floor <= d.heightMm)
      const t = g && insideTarget(house, g, storey, lineId, hit.x, { z: hit.z - floor, ...(on ? { editId: on.id } : {}) })
      if (t) joinery.open(t)
      return
    }
    const w = cladding.walls.get(hit.wallId)
    if (!w) return
    const floor = floorOf(w.id)
    // on one already there (of the house's own): change it
    const on = (house.joinery ?? []).find((j) => j.wallId === w.id && hit.x >= j.x && hit.x <= j.x + j.width && hit.z >= j.sill && hit.z <= j.sill + j.height)
    const taken = w.openings.filter((o) => o.id !== on?.id).map((o) => ({ id: o.id, x0: o.x, x1: o.x + o.width }))
    joinery.open({ where: "outside", wallId: w.id, floor, wallName: w.name, length: w.lengthMm, taken, at: hit.x, z: hit.z - floor, ...(on ? { editId: on.id } : {}) })
  }
  return (
    <section className={styles.card}>
      <h2>The house in 3D</h2>
      <p className={styles.hint}>
        Untick Roof to look inside{house.upper ? ", and First floor to see the ground floor" : ""} — load-bearing walls are the warm ones. Drag to swing it
        round; the magnifier flies in.
      </p>
      <div className={styles.toolbar}>
        <button type="button" className={`${styles.pill} ${joinery.placing ? styles.pillOn : ""}`} aria-pressed={joinery.placing} onClick={() => joinery.setPlacing((v) => !v)} aria-keyshortcuts="W">
          Place windows &amp; doors <kbd className={styles.kbd}>W</kbd>
        </button>
        <span className={styles.muted}>
          {joinery.placing
            ? "Tap a wall where one goes, outside or in (untick Roof to see in), or one you've placed to change it — fly in with the magnifier to get close. W or Escape to stop."
            : "Then tap a wall, outside or in."}
        </span>
      </div>
      <HouseRenderView input={input} fileName={house.name.replace(/\W+/g, "-").toLowerCase() || "house"} picking={joinery.placing} onPick={onPick} />
      <JoinerySettings house={house} setHouse={setHouse} />
      {joinery.modal}
    </section>
  )
}

// ── 5. cladding ────────────────────────────────────────────────────────

const CladdingStep: React.FC<{
  house: HouseProject
  setHouse: (u: (h: HouseProject) => HouseProject) => void
  cladding: ReturnType<typeof houseCladding>
}> = ({ house, setHouse, cladding }) => {
  const auth = useAuth()
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const link = house.link
  const location = (l: NonNullable<HouseProject["link"]>): ProjectLocation => (l.kind === "private" ? { kind: "private", uid: l.uid ?? "" } : { kind: "public" })

  const create = async (kind: "private" | "public") => {
    if (!cladding) return
    const uid = auth?.currentUser?.uid
    if (kind === "private" && !uid) return
    const loc: ProjectLocation = kind === "private" ? { kind, uid: uid as string } : { kind }
    setBusy(true)
    setStatus("Creating…")
    try {
      const id = newProjectId(loc)
      await saveProject(loc, id, `${house.name} — cladding`, cladding.project)
      setHouse((h) => ({ ...h, link: { kind, ...(uid && kind === "private" ? { uid } : {}), id } }))
      setStatus("Created — it'll keep in step with the plan from here.")
    } catch (err) {
      console.error("Creating the cladding project failed", err)
      setStatus("Couldn't create it — try again in a moment.")
    } finally {
      setBusy(false)
    }
  }

  // linked: push the house's walls across whenever they change
  const claddingJson = useMemo(() => (cladding ? JSON.stringify([cladding.project, house.claddingState?.settings ?? null]) : ""), [cladding, house.claddingState?.settings])
  const lastSent = useRef<string | null>(null)
  useEffect(() => {
    if (!link || !cladding || claddingJson === lastSent.current) return
    const timer = setTimeout(async () => {
      try {
        setStatus("Updating the weatherboards…")
        const loc = location(link)
        const existing = await loadProject(loc, link.id)
        // (the house's own calculator's settings win, once it has any)
        const merged = mergeCladding(existing ? { settings: existing.settings, elevations: existing.elevations, plan: existing.plan } : null, cladding.project)
        if (house.claddingState) merged.settings = house.claddingState.settings
        await saveProject(loc, link.id, existing?.name ?? `${house.name} — cladding`, merged)
        lastSent.current = claddingJson
        setStatus("Weatherboards up to date with the plan.")
      } catch (err) {
        console.error("Updating the cladding project failed", err)
        setStatus("Couldn't update the weatherboards — it'll try again on the next change.")
      }
    }, 1200)
    return () => clearTimeout(timer)
    // (location's derived from link)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link, claddingJson])

  // the weatherboard calculator, right here: the house's walls (their shape
  // and their windows and doors), under its own settings, skips and corners
  const project = useMemo(() => (cladding ? mergeCladding(house.claddingState ?? null, cladding.project) : null), [cladding, house.claddingState])
  const houseWallIds = useMemo(() => new Set(cladding ? [...cladding.walls.keys()] : []), [cladding])
  const projectRef = useRef(project)
  projectRef.current = project
  const setProject = useCallback(
    (update: (prev: WeatherboardProject) => WeatherboardProject) => {
      const before = projectRef.current
      if (!before) return
      const next = update(before)
      // (several edits in one go each build on the last)
      projectRef.current = next
      setHouse((h) => {
        const { state, joinery } = splitCladdingEdit(before, next, houseWallIds, h.joinery ?? [])
        return { ...h, claddingState: state, joinery }
      })
    },
    [houseWallIds, setHouse],
  )
  // a linked project from before: bring its settings, skips and windows in, once
  const importLinked = async () => {
    if (!link || !cladding) return
    setBusy(true)
    setStatus("Bringing in the linked project…")
    try {
      const p = await loadProject(location(link), link.id)
      if (!p) {
        setStatus("The linked project couldn't be found.")
        return
      }
      const before = cladding.project
      const next = mergeCladding({ settings: p.settings, elevations: p.elevations, plan: p.plan }, before)
      setHouse((h) => {
        const { state, joinery } = splitCladdingEdit(before, next, houseWallIds, h.joinery ?? [])
        return { ...h, claddingState: state, joinery }
      })
      setStatus("Brought in — its settings, skipped boards and windows and doors are the house's now.")
    } catch (err) {
      console.error("Bringing in the linked project failed", err)
      setStatus("Couldn't load the linked project — are you offline?")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.card}>
      <h2>Cladding — the weatherboards</h2>
      <p className={styles.hint}>
        Every outside wall, in the elevation it faces, named after the room behind it, its top off the roof (gable ends raked) and its windows and
        doors as laid — worked out course by course, with joins on staggered studs and the most economical order. The plan owns each wall&apos;s
        shape; set the boards, skip boards, add or move windows and doors here (they&apos;re the house&apos;s, so the framing and 3D follow).
      </p>
      {!cladding || !project ? (
        <p className={styles.muted}>The outside walls need a closed outline first — draw it in Floor plans.</p>
      ) : (
        <WeatherboardEditor
          project={project}
          setProject={setProject}
          header={null}
          embedded
          openingTypeDefault={(o) => {
            // (the house's own windows and doors carry their type)
            const typeId = (o as Opening & { typeId?: string }).typeId
            const type = typeId ? joineryTypesOf(house).find((t) => t.id === typeId) : undefined
            if (!type) return undefined
            return {
              name: type.name,
              place: type.place,
              save: (place) => setHouse((h) => ({ ...h, joineryTypes: joineryTypesOf(h).map((t) => (t.id === type.id ? { ...t, place } : t)) })),
            }
          }}
        />
      )}

      <h3>A weatherboard project of its own</h3>
      <p className={styles.hint}>
        Optional: a separate weatherboard project, kept in step with the house, to share or open on its own.
        {link && !house.claddingState && " One's linked from before — bring what was done there into the house:"}
      </p>
      {link && !house.claddingState && (
        <div className={styles.toolbar}>
          <button type="button" className={styles.pill} disabled={busy} onClick={importLinked}>
            Bring in the linked project&apos;s settings, skips and windows
          </button>
        </div>
      )}
      {link ? (
        <div className={styles.toolbar}>
          <Link className={styles.pill} href={`/weatherboards/${link.id}`}>
            Open the weatherboards →
          </Link>
          <button type="button" className={styles.pill} onClick={() => setHouse((h) => ({ ...h, link: null }))}>
            Unlink
          </button>
        </div>
      ) : (
        <div className={styles.toolbar}>
          {auth?.currentUser && (
            <button type="button" className={styles.pill} disabled={busy || !cladding} onClick={() => create("private")}>
              Create a private weatherboard project
            </button>
          )}
          <button type="button" className={styles.pill} disabled={busy || !cladding} onClick={() => create("public")}>
            Create a public weatherboard project
          </button>
        </div>
      )}
      {status && <p className={styles.hint}>{status}</p>}
    </section>
  )
}

export default HouseCalculator
