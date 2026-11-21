"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import DiagramExplorer from "@/components/diagramExplorer/diagramExplorer"
import { useFlyCamera } from "@/components/render3d/useFlyCamera"
import type { CameraFrame } from "@/components/render3d/perspective"
import { sceneFromSolids } from "@/components/stairs/stairRender3d"
import StairOrderCard from "@/components/stairs/stairOrderCard"
import { combineOrder } from "@/components/stairs/stairMaterials"
import NumField from "@/components/weatherboards/numField"
import { loadProject } from "@/components/weatherboards/projectStore"
import type { Opening } from "@/components/weatherboards/types"
import type { Cladding } from "./houseCladding"
import renderStyles from "@/components/stairs/stairRenderView.module.scss"
import { FloorGraph } from "./floorPlan"
import { Door, FloorPlan, FramingSettings, HouseProject, newHouseId, Pt } from "./houseTypes"
import PlanCanvas, { Selection } from "./planCanvas"
import type { Structure } from "./structure"
import {
  FRAMING_LAYER_LABELS,
  FramedWall,
  FramingLayer,
  framingOrder,
  framingSolids,
  cutList,
  HouseFraming,
  houseFraming,
  MEMBER_COLOURS,
  MEMBER_LABELS,
  memberCounts,
  MemberKind,
} from "./wallFraming"
import styles from "./house.module.scss"

const LEVEL_NAMES = ["Ground floor", "First floor"] as const
const LAYERS: FramingLayer[] = ["outside", "inside", "plates", "studs", "openings", "nogs", "junctions", "upper"]

/** p on a → b (ends included) */
const onSide = (p: Pt, a: Pt, b: Pt) => {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L
  return t >= -5 && t <= L + 5 && Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / L < 5
}

/** a door's opening on plan, from where it is along its wall line */
const doorOnPlan = (d: Door, a: Pt, b: Pt) => {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
  const at = (t: number) => ({ x: a.x + u.x * t, y: a.y + u.y * t })
  return { a: at(d.atMm - d.widthMm / 2), b: at(d.atMm + d.widthMm / 2) }
}

/** which end of the wall line a door's measured from, in words */
const startName = (a: Pt, b: Pt) =>
  Math.abs(a.y - b.y) <= Math.abs(a.x - b.x) ? (a.x <= b.x ? "left" : "right") : a.y <= b.y ? "top" : "bottom"

/** One wall's frame, square on — from outside the house, for an outside
 * wall — every member to scale, the openings, and its length and height. */
const WallElevation: React.FC<{ wall: FramedWall }> = ({ wall }) => {
  const L = wall.lengthMm
  const H = Math.max(wall.heightMm, ...wall.members.map((m) => m.z1))
  const pad = 250
  const font = Math.max(L, H) / 38
  const y = (z: number) => H - z
  const kinds = [...new Set(wall.members.map((m) => m.kind))] as MemberKind[]
  return (
    <>
      <svg viewBox={`${-pad} ${-pad} ${L + pad * 2} ${H + pad * 2 + font}`} className={styles.elevation} role="img" aria-label={`The frame of ${wall.name}`}>
        {wall.members.map((m, i) => {
          const title = <title>{`${MEMBER_LABELS[m.kind]}: ${m.plies > 1 ? `${m.plies} × ` : ""}${m.size}, ${m.length} mm`}</title>
          const common = { fill: MEMBER_COLOURS[m.kind], stroke: "#5b4630", strokeWidth: Math.max(L, H) / 900 }
          return m.poly ? (
            <polygon key={i} points={m.poly.map(([x, z]) => `${x},${y(z)}`).join(" ")} {...common}>
              {title}
            </polygon>
          ) : (
            <rect key={i} x={m.x0} y={y(m.z1)} width={m.x1 - m.x0} height={m.z1 - m.z0} {...common}>
              {title}
            </rect>
          )
        })}
        {wall.openings.map((o) => {
          const bottom = o.sill ?? 0
          return (
            <g key={o.id} pointerEvents="none">
              <rect x={o.x0} y={y(o.head)} width={o.x1 - o.x0} height={o.head - bottom} fill="none" stroke="currentColor" strokeOpacity={0.45} strokeWidth={Math.max(L, H) / 700} strokeDasharray="40 30" />
              <text x={(o.x0 + o.x1) / 2} y={y((o.head + bottom) / 2)} fontSize={font * 0.8} textAnchor="middle" dominantBaseline="middle" fill="currentColor" opacity={0.7}>
                {o.label}
              </text>
            </g>
          )
        })}
        <g fill="currentColor" fontSize={font}>
          <line x1={0} y1={H + pad * 0.45} x2={L} y2={H + pad * 0.45} stroke="currentColor" strokeWidth={Math.max(L, H) / 700} />
          <text x={L / 2} y={H + pad * 0.45 + font * 1.1} textAnchor="middle">
            {L} mm
          </text>
          <text x={-pad * 0.35} y={H / 2} textAnchor="middle" transform={`rotate(-90 ${-pad * 0.35} ${H / 2})`}>
            {H} mm
          </text>
        </g>
      </svg>
      <ul className={styles.legend}>
        {kinds.map((k) => (
          <li key={k}>
            <span style={{ background: MEMBER_COLOURS[k] }} />
            {MEMBER_LABELS[k]}
          </li>
        ))}
      </ul>
    </>
  )
}

/** Every wall's framing in 3D: swing it round, hide a layer. */
const FramingRenderView: React.FC<{ framing: HouseFraming; twoStorey: boolean }> = ({ framing, twoStorey }) => {
  const [azimuthDeg, setAzimuthDeg] = useState(-35)
  const [elevationDeg, setElevationDeg] = useState(30)
  const [hidden, setHidden] = useState<ReadonlySet<FramingLayer>>(() => new Set())
  const svgRef = useRef<SVGSVGElement>(null)
  const frameRef = useRef<CameraFrame | null>(null)
  const { camera, explore, beforeTurn } = useFlyCamera(svgRef, frameRef)
  const handleOrbit = useCallback(
    (dx: number, dy: number) => {
      beforeTurn()
      setAzimuthDeg((a) => ((((a - dx * 0.4 + 180) % 360) + 360) % 360) - 180)
      setElevationDeg((e) => Math.min(85, Math.max(5, e + dy * 0.3)))
    },
    [beforeTurn],
  )
  const solids = useMemo(() => framingSolids(framing, hidden), [framing, hidden])
  const scene = useMemo(() => sceneFromSolids(solids, ((-90 + azimuthDeg) * Math.PI) / 180, (elevationDeg * Math.PI) / 180, camera), [solids, azimuthDeg, elevationDeg, camera])
  frameRef.current = scene?.frame ?? null
  const layers = LAYERS.filter((l) => l !== "upper" || twoStorey)
  const toggles = (
    <div className={renderStyles.members} role="group" aria-label="Parts shown">
      {layers.map((l) => (
        <label key={l} className={renderStyles.memberToggle}>
          <input
            type="checkbox"
            checked={!hidden.has(l)}
            onChange={() =>
              setHidden((h) => {
                const next = new Set(h)
                if (!next.delete(l)) next.add(l)
                return next
              })
            }
          />
          {FRAMING_LAYER_LABELS[l]}
        </label>
      ))}
    </div>
  )
  return (
    <div className={renderStyles.renderRoot}>
      <DiagramExplorer label="Framing 3D view" onOrbit={handleOrbit} camera={explore} headerTools={toggles}>
        {scene ? (
          <svg ref={svgRef} viewBox={`${scene.viewBox.x} ${scene.viewBox.y} ${scene.viewBox.w} ${scene.viewBox.h}`} className={renderStyles.svg} role="img" aria-label="3D view of the walls' framing">
            <rect x={scene.viewBox.x - scene.viewBox.w * 10} y={scene.viewBox.y - scene.viewBox.h * 10} width={scene.viewBox.w * 21} height={scene.viewBox.h * 21} fill="#eef3f7" />
            {scene.polygons.map((p, i) => (
              <polygon key={i} points={p.points} fill={p.fill} stroke={p.stroke} strokeWidth={scene.strokeW} strokeLinejoin="round" />
            ))}
          </svg>
        ) : (
          <p className={renderStyles.empty}>Nothing to show — tick a part.</p>
        )}
      </DiagramExplorer>
      {toggles}
      <div className={renderStyles.controls}>
        <label className={renderStyles.slider}>
          <span>Turn</span>
          <input type="range" min={-180} max={180} step={1} value={Math.round(azimuthDeg)} onChange={(e) => setAzimuthDeg(Number(e.target.value))} />
        </label>
        <label className={renderStyles.slider}>
          <span>Tilt</span>
          <input type="range" min={5} max={85} step={1} value={Math.round(elevationDeg)} onChange={(e) => setElevationDeg(Number(e.target.value))} />
        </label>
      </div>
    </div>
  )
}

const ORDER_NOTE =
  "Every wall's plates, studs, nogs and the framing round its windows and doors, planned from the cut pieces together. Plates longer than 6 m are joined over a stud. Lintel sizes are the setting above, not worked out — check them against NZS 3604 (or have them engineered) for each span and what's over it. Fixings, bracing, building wrap and the first floor's own floor framing aren't included."

/** The walls' framing, outside and inside: settings, doors added to the
 * inside walls on the plan (the outside walls' windows and doors come from
 * the linked weatherboard project), the picked wall's frame in elevation,
 * all of it in 3D, the cut list and the order. */
const FramingStep: React.FC<{
  house: HouseProject
  setHouse: (u: (h: HouseProject) => HouseProject) => void
  level: number
  setLevel: (l: number) => void
  setPlanOf: (l: number) => (u: (f: FloorPlan) => FloorPlan) => void
  graph: FloorGraph
  upperGraph: FloorGraph | null
  structures: { ground: Structure; upper: Structure | null }
  cladding: Cladding | null
  selection: Selection
  setSelection: (s: Selection) => void
}> = ({ house, setHouse, level, setLevel, setPlanOf, graph, upperGraph, structures, cladding, selection, setSelection }) => {
  const st = house.settings.framing
  const setFraming = (patch: Partial<FramingSettings>) => setHouse((h) => ({ ...h, settings: { ...h.settings, framing: { ...h.settings.framing, ...patch } } }))
  // the outside walls' windows and doors: the linked weatherboard project's
  const link = house.link
  const [openings, setOpenings] = useState<Map<string, Opening[]> | null>(null)
  const [loadNote, setLoadNote] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (!link) {
      setOpenings(null)
      return
    }
    let cancelled = false
    setLoadNote("Loading the windows and doors…")
    loadProject(link.kind === "private" ? { kind: "private", uid: link.uid ?? "" } : { kind: "public" }, link.id)
      .then((p) => {
        if (cancelled) return
        if (!p) {
          setOpenings(null)
          setLoadNote("The linked weatherboard project couldn't be found.")
          return
        }
        setOpenings(new Map(p.elevations.flatMap((e) => e.walls).map((w) => [w.id, w.openings ?? []])))
        setLoadNote(null)
      })
      .catch(() => !cancelled && setLoadNote("Couldn't load the weatherboard project's windows and doors — are you offline?"))
    return () => {
      cancelled = true
    }
  }, [link, reload])

  const framing = useMemo(() => houseFraming(house, graph, upperGraph, structures, cladding, openings), [house, graph, upperGraph, structures, cladding, openings])
  const order = useMemo(() => combineOrder(framingOrder(framing).map((line) => ({ line, from: "" }))), [framing])
  const cuts = useMemo(() => cutList(framing), [framing])

  const g = level === 1 && upperGraph ? upperGraph : graph
  const plan = level === 1 && house.upper ? house.upper.plan : house.floor
  const setPlan = setPlanOf(level)
  const storeyWalls = framing.walls.filter((w) => w.storey === level)
  const pickedId = selection?.kind === "wall" ? selection.id : null
  const lineOf = g.walls.find((w) => w.id === pickedId)
  const edge = selection?.kind === "edge" && g.outline.length >= 3 ? { a: g.outline[selection.index], b: g.outline[(selection.index + 1) % g.outline.length] } : null
  const framed = edge
    ? storeyWalls.find((w) => w.outside && w.side && onSide({ x: (edge.a.x + edge.b.x) / 2, y: (edge.a.y + edge.b.y) / 2 }, w.side.a, w.side.b))
    : storeyWalls.find((w) => !w.outside && w.id === pickedId)
  const doorsHere = plan.doors.filter((d) => d.wallId === pickedId)
  const [pickedDoor, setPickedDoor] = useState<string | null>(null)

  const planDoors = plan.doors.flatMap((d) => {
    const w = g.walls.find((x) => x.id === d.wallId)
    return w ? [{ id: d.id, ...doorOnPlan(d, w.a, w.b), picked: d.id === pickedDoor }] : []
  })
  const setDoor = (id: string, patch: Partial<Door>) => setPlan((f) => ({ ...f, doors: f.doors.map((d) => (d.id === id ? { ...d, ...patch } : d)) }))
  const addDoor = () => {
    if (!lineOf) return
    const L = Math.hypot(lineOf.b.x - lineOf.a.x, lineOf.b.y - lineOf.a.y)
    const d: Door = { id: newHouseId(), wallId: lineOf.id, atMm: Math.round(L / 2 / 10) * 10, widthMm: 810, heightMm: 1980 }
    setPlan((f) => ({ ...f, doors: [...f.doors, d] }))
    setPickedDoor(d.id)
  }

  const totals = memberCounts(framing.walls.flatMap((w) => w.members))
  const studs = (totals.get("stud") ?? 0) + (totals.get("trimmer") ?? 0) + (totals.get("jack") ?? 0) + (totals.get("cripple") ?? 0) + (totals.get("junction") ?? 0)
  const allOpenings = framing.walls.reduce((a, w) => a + w.openings.length, 0)
  const outsideCount = framing.walls.filter((w) => w.outside).length
  const warnings = framing.walls.flatMap((w) => w.warnings.map((x) => `${w.name}: ${x}`))

  return (
    <section className={styles.card}>
      <h2>Framing — the walls</h2>
      <p className={styles.hint}>
        Every wall framed stick by stick, outside and in: plates, studs at centres, rows of nogs, extra studs at corners and where walls
        meet, and round each window and door its trimming studs, a lintel (load-bearing walls) or a head, and a sill under a window. Tap a
        wall to see its frame; add an inside wall&apos;s doors here. The outside walls&apos; windows and doors come from the linked weatherboard
        project{house.settings.roofFrame === "rafters" ? ", and their gables are framed up to the rafters" : "; under trusses, their gables are the gable trusses"}.
      </p>
      {!link && <p className={styles.muted}>No weatherboard project linked yet — link one in Cladding and add the windows and doors there to frame them.</p>}
      {loadNote && <p className={styles.muted}>{loadNote}</p>}
      {link && !loadNote && (
        <p className={styles.muted}>
          Windows and doors from the linked weatherboard project.{" "}
          <button type="button" className={styles.link} onClick={() => setReload((k) => k + 1)}>
            Reload them
          </button>
        </p>
      )}
      <div className={styles.fields}>
        <label>
          Studs, plates &amp; nogs
          <select
            value={`${st.studDepthMm}x${st.studThickMm}`}
            onChange={(e) => {
              const [d, t] = e.target.value.split("x").map(Number)
              setFraming({ studDepthMm: d, studThickMm: t })
            }}
          >
            {[
              [90, 45],
              [70, 45],
              [90, 35],
            ].map(([d, t]) => (
              <option key={`${d}x${t}`} value={`${d}x${t}`}>
                {d} × {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Grade &amp; treatment
          <input defaultValue={st.grade} key={st.grade} maxLength={30} onBlur={(e) => e.target.value.trim() && setFraming({ grade: e.target.value.trim() })} />
        </label>
        <label>
          Stud centres
          <select value={st.studCentresMm} onChange={(e) => setFraming({ studCentresMm: Number(e.target.value) })}>
            {[400, 450, 480, 600].map((c) => (
              <option key={c} value={c}>
                {c} mm
              </option>
            ))}
          </select>
        </label>
        <label>
          Nog rows at most
          <span className={styles.unit}>
            <NumField value={st.nogMaxMm} min={300} max={1350} step={50} onChange={(v) => setFraming({ nogMaxMm: v })} /> mm apart
          </span>
        </label>
        <label>
          Lintels (load-bearing)
          <select value={st.lintelDepthMm} onChange={(e) => setFraming({ lintelDepthMm: Number(e.target.value) })}>
            {[140, 190, 240, 290].map((dp) => (
              <option key={dp} value={dp}>
                2 × {dp} × {st.studThickMm}
              </option>
            ))}
          </select>
          <span className={styles.muted}>check against NZS 3604 for the span</span>
        </label>
        <label>
          Opening over the door leaf
          <span className={styles.unit}>
            +<NumField value={st.doorWidthAllowanceMm} min={0} max={200} step={5} onChange={(v) => setFraming({ doorWidthAllowanceMm: v })} /> wide
          </span>
          <span className={styles.unit}>
            +<NumField value={st.doorHeightAllowanceMm} min={0} max={200} step={5} onChange={(v) => setFraming({ doorHeightAllowanceMm: v })} /> high
          </span>
        </label>
        <label>
          Opening over a window or outside door
          <span className={styles.unit}>
            +<NumField value={st.windowWidthAllowanceMm} min={0} max={200} step={5} onChange={(v) => setFraming({ windowWidthAllowanceMm: v })} /> wide
          </span>
          <span className={styles.unit}>
            +<NumField value={st.windowHeightAllowanceMm} min={0} max={200} step={5} onChange={(v) => setFraming({ windowHeightAllowanceMm: v })} /> high
          </span>
        </label>
        <label style={{ flexDirection: "row", alignItems: "center" }}>
          <input type="checkbox" checked={st.doubleTopPlateLB} onChange={(e) => setFraming({ doubleTopPlateLB: e.target.checked })} />
          Double top plate on load-bearing walls
        </label>
      </div>

      {house.upper && (
        <div className={styles.toggle} role="tablist" aria-label="Storey">
          {LEVEL_NAMES.map((n, l) => (
            <button key={n} type="button" role="tab" aria-selected={level === l} className={level === l ? styles.toggleOn : ""} onClick={() => setLevel(l)}>
              {n}
            </button>
          ))}
        </div>
      )}
      <PlanCanvas
        graph={g}
        grid={house.grid}
        structure={level === 1 ? structures.upper : structures.ground}
        selection={selection}
        onSelect={(s) => {
          setSelection(s?.kind === "wall" || s?.kind === "edge" ? s : null)
          setPickedDoor(null)
        }}
        doors={planDoors}
        pickOutside
      />
      {g.walls.length === 0 && <p className={styles.hint}>No inside walls on this storey yet — draw them in Floor plans.</p>}

      {framed && (
        <div className={styles.panel}>
          <p>
            <strong>{framed.outside ? `Outside wall — ${framed.name}` : framed.name}</strong> — {framed.lengthMm} mm long, {framed.heightMm} mm to the top plate,{" "}
            {framed.loadBearing ? "load-bearing" : "not load-bearing"}. {[...memberCounts(framed.members)].map(([k, n]) => `${n} ${MEMBER_LABELS[k].toLowerCase()}`).join(", ")}.
            {framed.outside && " Seen from outside, the way the weatherboards draw it."}
          </p>
          {lineOf && doorsHere.map((d, i) => (
            <div key={d.id} className={styles.doorRow} onClick={() => setPickedDoor(d.id)}>
              <strong>Door {i + 1}</strong>
              <label>
                Leaf width{" "}
                <span className={styles.unit}>
                  <NumField value={d.widthMm} min={400} max={2400} step={10} onChange={(v) => setDoor(d.id, { widthMm: v })} /> mm
                </span>
              </label>
              <label>
                Leaf height{" "}
                <span className={styles.unit}>
                  <NumField value={d.heightMm} min={1500} max={2700} step={10} onChange={(v) => setDoor(d.id, { heightMm: v })} /> mm
                </span>
              </label>
              <label>
                Its middle from the {startName(lineOf.a, lineOf.b)} end{" "}
                <span className={styles.unit}>
                  <NumField value={d.atMm} min={0} step={10} onChange={(v) => setDoor(d.id, { atMm: v })} /> mm
                </span>
              </label>
              <button type="button" className={styles.link} onClick={() => setPlan((f) => ({ ...f, doors: f.doors.filter((x) => x.id !== d.id) }))}>
                Remove
              </button>
            </div>
          ))}
          {lineOf && (
            <button type="button" className={styles.navBack} onClick={addDoor}>
              + Add a door
            </button>
          )}
          {framed.warnings.map((w) => (
            <p key={w} className={styles.muted}>
              {w}
            </p>
          ))}
          <div style={{ flex: "1 1 100%" }}>
            <WallElevation wall={framed} />
          </div>
        </div>
      )}

      <p className={styles.summary}>
        {outsideCount} outside and {framing.walls.length - outsideCount} inside wall{framing.walls.length - outsideCount === 1 ? "" : "s"}, {allOpenings} opening{allOpenings === 1 ? "" : "s"}: {studs} studs of all kinds, {totals.get("nog") ?? 0} nogs, {totals.get("lintel") ? `${totals.get("lintel")} lintel${totals.get("lintel") === 1 ? "" : "s"}, ` : ""}
        {Math.round(framing.walls.reduce((a, w) => a + w.lengthMm, 0) / 100) / 10} m of wall.
      </p>
      {framing.notes.map((n) => (
        <p key={n} className={styles.muted}>
          {n}
        </p>
      ))}
      {warnings.length > 0 && (
        <ul className={styles.hint}>
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {framing.walls.length > 0 && (
        <>
          <h3>All the framing in 3D</h3>
          <FramingRenderView framing={framing} twoStorey={!!house.upper} />
          <h3>Cut list</h3>
          <div className={styles.tableWrap}>
            <table className={styles.cutList}>
              <thead>
                <tr>
                  <th>Walls</th>
                  <th>Member</th>
                  <th>Size</th>
                  <th>Pieces</th>
                  <th>Lengths (mm)</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {cuts.map((r) => (
                  <tr key={`${r.outside}|${r.kind}|${r.size}`}>
                    <td>{r.outside ? "Outside" : "Inside"}</td>
                    <td>
                      <span className={styles.swatchDot} style={{ background: MEMBER_COLOURS[r.kind] }} />
                      {MEMBER_LABELS[r.kind]}
                    </td>
                    <td>{r.size}</td>
                    <td>{r.pieces}</td>
                    <td>{r.lengths.map(([l, n]) => `${n} × ${l}`).join(", ")}</td>
                    <td>{r.totalM.toFixed(1)} m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <StairOrderCard title="Framing order — the walls" lines={order} intro="What to buy for every wall's frame, outside and in, as stock lengths." note={ORDER_NOTE} />
        </>
      )}
    </section>
  )
}

export default FramingStep
