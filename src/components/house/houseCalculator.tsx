"use client"

import { ReactNode, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/context/auth"
import PolygonShapeEditor from "@/components/decking/polygonShapeEditor"
import NumField from "@/components/weatherboards/numField"
import HouseRenderView from "@/components/weatherboards/houseRenderView"
import { houseLayout } from "@/components/weatherboards/housePlan"
import { ROOF_COLOURS } from "@/components/weatherboards/roof"
import { calculateWall } from "@/components/weatherboards/weatherboardCalc"
import { DEFAULT_SETTINGS as WB_DEFAULTS } from "@/components/weatherboards/data"
import { loadProject, newProjectId, ProjectLocation, saveProject } from "@/components/weatherboards/projectStore"
import type { RoofType } from "@/components/weatherboards/types"
import { floorGraph, isSquare, roomsToOutline } from "./floorPlan"
import { houseCladding, mergeCladding } from "./houseCladding"
import {
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
import { analyseStructure } from "./structure"
import styles from "./house.module.scss"

const STEPS = ["Start", "Ground floor", "Roof & structure", "3D", "Cladding"] as const

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
  const floor = house.floor
  const graph = useMemo(() => floorGraph(floor), [floor])
  const cladding = useMemo(() => houseCladding(house, graph), [house, graph])
  const structure = useMemo(() => analyseStructure(graph, house.settings, cladding?.roof ?? null), [graph, house.settings, cladding])
  const [selection, setSelection] = useState<Selection>(null)
  const step = Math.min(house.step, floor.mode ? STEPS.length - 1 : 0)
  const setStep = (s: number) => {
    setSelection(null)
    setHouse((h) => ({ ...h, step: s }))
  }
  const setFloor = (update: (f: HouseProject["floor"]) => HouseProject["floor"]) => setHouse((h) => ({ ...h, floor: update(h.floor) }))
  const setSettings = (patch: Partial<HouseSettings>) => setHouse((h) => ({ ...h, settings: { ...h.settings, ...patch } }))

  const canGoOn = [!!floor.mode, graph.outline.length >= 3, true, true, false]

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
      {step === 1 && <FloorStep house={house} setFloor={setFloor} graph={graph} selection={selection} setSelection={setSelection} />}
      {step === 2 && (
        <StructureStep house={house} setSettings={setSettings} setFloor={setFloor} graph={graph} structure={structure} roofOk={!!cladding?.roof} selection={selection} setSelection={setSelection} />
      )}
      {step === 3 && cladding && <ThreeDStep house={house} graph={graph} cladding={cladding} structure={structure} />}
      {step === 4 && <CladdingStep house={house} setHouse={setHouse} cladding={cladding} />}

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

const FloorStep: React.FC<{
  house: HouseProject
  setFloor: (u: (f: HouseProject["floor"]) => HouseProject["floor"]) => void
  graph: ReturnType<typeof floorGraph>
  selection: Selection
  setSelection: (s: Selection) => void
}> = ({ house, setFloor, graph, selection, setSelection }) => {
  const floor = house.floor
  const [part, setPart] = useState<"outside" | "inside">("inside")
  const [tool, setTool] = useState<CanvasTool>("draw")
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
        <h2>Ground floor — rooms</h2>
        <p className={styles.hint}>
          Drag a room to move it, or tap it and drag a corner to resize it — both snap to the grid and to the rooms beside it. Tap one to name it or type its size.
        </p>
        <PlanCanvas graph={graph} boxes={floor.boxes} selection={selection} onSelect={setSelection} onMoveBox={(id, x, y) => setBox(id, { x, y })} onResizeBox={(id, r) => setBox(id, r)} />
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

  return (
    <section className={styles.card}>
      <h2>Ground floor — outline and walls</h2>
      <div className={styles.toggle} role="tablist">
        <button type="button" role="tab" aria-selected={part === "outside"} className={part === "outside" ? styles.toggleOn : ""} onClick={() => setPart("outside")}>
          Outside walls
        </button>
        <button type="button" role="tab" aria-selected={part === "inside"} className={part === "inside" ? styles.toggleOn : ""} onClick={() => setPart("inside")}>
          Inside walls &amp; rooms
        </button>
      </div>

      {part === "outside" ? (
        <>
          <p className={styles.hint}>
            The outside face of the outside walls. Drag a corner, or tap a side or corner to type its length or angle; + Add corner for an L
            or a step. Keep the corners square for rooms and load-bearing walls to work out.
          </p>
          <PolygonShapeEditor
            points={floor.outline}
            lockedEdgeLengths={floor.lockedEdgeLengths}
            lockedVertexAngles={floor.lockedVertexAngles}
            ariaName="House outline"
            onShapeChange={(outline, lockedEdgeLengths, lockedVertexAngles) => setFloor((f) => ({ ...f, outline, lockedEdgeLengths, lockedVertexAngles }))}
          />
          {!isSquare(floor.outline) && <Warnings list={["A corner isn't square — rooms and load-bearing walls need square corners for now."]} />}
        </>
      ) : (
        <>
          <p className={styles.hint}>
            {tool === "draw"
              ? "Drag across the plan to draw a wall — it snaps square, to the grid and to the walls nearby. Switch to Select to name a room or change a wall."
              : "Tap a room to name it, or a wall to move it, set whether it's load-bearing, or remove it."}
          </p>
          <div className={styles.toolbar}>
            <div className={styles.toggle} role="radiogroup" aria-label="Tool">
              <button type="button" role="radio" aria-checked={tool === "draw"} className={tool === "draw" ? styles.toggleOn : ""} onClick={() => setTool("draw")}>
                Draw walls
              </button>
              <button type="button" role="radio" aria-checked={tool === "select"} className={tool === "select" ? styles.toggleOn : ""} onClick={() => setTool("select")}>
                Select
              </button>
            </div>
          </div>
          <PlanCanvas
            graph={graph}
            tool={tool}
            selection={selection}
            onSelect={setSelection}
            onDrawWall={(a, b) => setFloor((f) => ({ ...f, walls: [...f.walls, { id: newHouseId(), a, b, loadBearing: "auto" }] }))}
          />
          {wall && (
            <div className={styles.panel}>
              <div className={styles.fields}>
                <label>
                  {vertical ? "Across from the left" : "Down from the top"}
                  <span className={styles.unit}>
                    <NumField
                      value={Math.round(vertical ? wall.a.x : wall.a.y)}
                      step={100}
                      onChange={(v) => {
                        if (vertical) setWall(wall.id, { ...wall.a, x: v }, { ...wall.b, x: v })
                        else setWall(wall.id, { ...wall.a, y: v }, { ...wall.b, y: v })
                      }}
                    />{" "}
                    mm
                  </span>
                </label>
                <label>
                  From
                  <span className={styles.unit}>
                    <NumField
                      value={Math.round(vertical ? Math.min(wall.a.y, wall.b.y) : Math.min(wall.a.x, wall.b.x))}
                      step={100}
                      onChange={(v) => {
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
                      value={Math.round(vertical ? Math.max(wall.a.y, wall.b.y) : Math.max(wall.a.x, wall.b.x))}
                      step={100}
                      onChange={(v) => {
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
  setFloor: (u: (f: HouseProject["floor"]) => HouseProject["floor"]) => void
  graph: ReturnType<typeof floorGraph>
  structure: ReturnType<typeof analyseStructure>
  roofOk: boolean
  selection: Selection
  setSelection: (s: Selection) => void
}> = ({ house, setSettings, setFloor, graph, structure, roofOk, selection, setSelection }) => {
  const st = house.settings
  const roof = st.roof
  const setRoof = (patch: Partial<HouseSettings["roof"]>) => setSettings({ roof: { ...roof, ...patch } })
  const wall = selection?.kind === "wall" ? graph.walls.find((w) => w.id === selection.id) : undefined
  const verdict = wall ? structure.inside.get(wall.id) : undefined
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
          Roof
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
          Stud height
          <span className={styles.unit}>
            <NumField value={st.studHeightMm} min={1800} step={50} onChange={(v) => setSettings({ studHeightMm: v })} /> mm
          </span>
        </label>
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

      <p className={styles.hint}>
        Load-bearing walls are in red; the dashed arrows are the way the {st.roofFrame === "trusses" ? "trusses" : "ceiling joists and rafters"} span. Tap an
        inside wall to see why, or to set it by hand.
      </p>
      <PlanCanvas graph={graph} structure={structure} selection={selection} onSelect={(s) => setSelection(s?.kind === "wall" ? s : null)} />
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
  graph: ReturnType<typeof floorGraph>
  cladding: NonNullable<ReturnType<typeof houseCladding>>
  structure: ReturnType<typeof analyseStructure>
}> = ({ house, graph, cladding, structure }) => {
  const input = useMemo(() => {
    const layout = houseLayout(cladding.project)
    const walls = new Map(cladding.project.elevations.flatMap((e) => e.walls).map((w) => [w.id, w]))
    const results = new Map([...walls.values()].map((w) => [w.id, calculateWall(w, WB_DEFAULTS)]))
    const extras = graph.walls.map((w) => ({
      a: { x: w.a.x, y: -w.a.y },
      b: { x: w.b.x, y: -w.b.y },
      height: house.settings.studHeightMm,
      thickness: 110,
      color: structure.inside.get(w.id)?.loadBearing ? "#c98f7a" : "#ece8df",
    }))
    return { layout, walls, results, settings: WB_DEFAULTS, roof: cladding.roof, roofColour: house.settings.roof.colour, extras }
  }, [cladding, graph, house.settings, structure])
  return (
    <section className={styles.card}>
      <h2>The house in 3D</h2>
      <p className={styles.hint}>Untick Roof to look inside — load-bearing walls are the warm ones. Drag to swing it round; the magnifier flies in.</p>
      <HouseRenderView input={input} fileName={house.name.replace(/\W+/g, "-").toLowerCase() || "house"} />
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
  const claddingJson = useMemo(() => (cladding ? JSON.stringify(cladding.project) : ""), [cladding])
  const lastSent = useRef<string | null>(null)
  useEffect(() => {
    if (!link || !cladding || claddingJson === lastSent.current) return
    const timer = setTimeout(async () => {
      try {
        setStatus("Updating the weatherboards…")
        const loc = location(link)
        const existing = await loadProject(loc, link.id)
        const merged = mergeCladding(existing ? { settings: existing.settings, elevations: existing.elevations, plan: existing.plan } : null, cladding.project)
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

  return (
    <section className={styles.card}>
      <h2>Cladding</h2>
      <p className={styles.hint}>
        Every outside wall goes to the weatherboard calculator, in the elevation it faces, named after the room behind it, with its top off the
        roof (gable ends raked). Add the windows and doors there; the house keeps each wall&apos;s shape in step with the plan, and leaves what you add.
      </p>
      {cladding && (
        <ul className={styles.rooms}>
          {cladding.project.elevations.map((e) => (
            <li key={e.id}>
              <span>
                {e.name} <span className={styles.muted}>· {e.walls.map((w) => w.name).join(", ")}</span>
              </span>
              <span>{m(e.walls.reduce((s, w) => s + w.lengthMm, 0))}</span>
            </li>
          ))}
        </ul>
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
