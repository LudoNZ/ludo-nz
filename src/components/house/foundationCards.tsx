"use client"

import { useMemo } from "react"
import NumField from "@/components/weatherboards/numField"
import { edgePoints } from "@/components/weatherboards/weatherboardCalc"
import type { PlanSide } from "@/components/weatherboards/housePlan"
import { DEFAULT_RIB_RAFT, ribRaft, ribRaftFromData, RibRaftSettings } from "../ribRaft/ribRaft"
import { DEFAULT_INTEGRA, integraFromData, integraWalls, IntegraSettings, PartyWall } from "../intertenancy/integraWall"
import { FloorGraph, simplify } from "./floorPlan"
import type { Cladding } from "./houseCladding"
import { HouseProject, HouseSettings, onParty, Pt } from "./houseTypes"
import type { Structure } from "./structure"
import styles from "./house.module.scss"

const m = (mm: number, dp = 1) => `${(mm / 1000).toFixed(dp)} m`

/** The slab's rib raft as the house stands: the ground floor's outline its
 * edge, an internal beam under each load-bearing wall, a free joint under
 * each party wall — its pods laid out, and the takeoff. */
export const RibRaftCard: React.FC<{
  house: HouseProject
  graph: FloorGraph
  structure: Structure
  setSettings: (patch: Partial<HouseSettings>) => void
}> = ({ house, graph, structure, setSettings }) => {
  const outline = useMemo(() => simplify(graph.outline), [graph])
  const beams = graph.walls.filter((w) => structure.inside.get(w.id)?.loadBearing).map((w) => ({ a: w.a, b: w.b }))
  const joints = outline.flatMap((p, i) => (onParty(house.floor.party, p, outline[(i + 1) % outline.length]) ? [i] : []))
  return (
    <RibRaftPanel
      outline={outline}
      beams={beams}
      joints={joints}
      settings={house.settings.ribRaft}
      setSettings={(ribRaft) => setSettings({ ribRaft })}
      beamsFrom="load-bearing walls"
    />
  )
}

/** A rib raft on any square-cornered outline: its pods drawn, its settings, its takeoff. */
export const RibRaftPanel: React.FC<{
  outline: Pt[]
  beams: { a: Pt; b: Pt }[]
  joints: number[]
  settings: Partial<RibRaftSettings> | undefined
  setSettings: (s: Partial<RibRaftSettings> | undefined) => void
  /** what the internal beams are under */
  beamsFrom?: string
}> = ({ outline, beams, joints, settings, setSettings, beamsFrom = "internal beams" }) => {
  const st = ribRaftFromData(settings)
  const set = (patch: Partial<RibRaftSettings>) => setSettings({ ...(settings ?? {}), ...patch })
  const r = useMemo(() => ribRaft({ outline, beams, joints }, st), [outline, JSON.stringify(beams), JSON.stringify(joints), JSON.stringify(st)]) // eslint-disable-line react-hooks/exhaustive-deps
  if (outline.length < 4) return null
  const xs = outline.map((p) => p.x)
  const ys = outline.map((p) => p.y)
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  const w = Math.max(...xs) - x0
  const h = Math.max(...ys) - y0
  const pad = Math.max(w, h) * 0.04
  const rows: [string, string, string][] = [
    ["Pods", `${st.podMm} × ${st.podMm} × ${st.podHeightMm}`, `${r.podsToBuy} (${r.fullPods} whole, ${r.cutPods} cut)`],
    ["Concrete", `${st.concreteMpa} MPa, ${r.depthMm} deep`, `${r.concreteToOrderM3.toFixed(1)} m³ (${r.concreteM3.toFixed(2)} net)`],
    ["Mesh", st.meshName, `${r.meshSheets} sheets`],
    ...r.bars.map((b): [string, string, string] => [b.what, st.barName, `${m(b.lengthMm * b.count)}`]),
    ["Corner bars", `${st.barName}, ${st.cornerBarLegMm} legs`, `${r.cornerBars}`],
    ...(r.reentrantBars ? [["Inside-corner bars", `${st.barName} × ${st.reentrantBarMm}`, `${r.reentrantBars}`] as [string, string, string]] : []),
    ["Bars to buy", `${st.barName} × ${st.barStockMm}, lapped ${st.barLapMm}`, `${r.barsToBuy} (${r.barMetres.toFixed(0)} m)`],
    ...(r.jointMm ? [["Free joint dowels", "R16 × 500 @ 600", `${r.dowels} (${m(r.jointMm)} of joint)`] as [string, string, string]] : []),
    ["DPM", "laps and up the beams", `${r.dpmM2} m²`],
    ["Hardfill", `AP40, ${st.hardfillMm} min`, `${r.hardfillM3} m³`],
    ["Sand blinding", `${st.sandMm}`, `${r.sandM3} m³`],
    ["Boxing", `${r.depthMm} + deep`, `${r.boxingM} m`],
    ["Pod spacers / bar chairs", "", `${r.spacers} / ${r.chairs}`],
  ]
  return (
    <div className={styles.panel}>
      <h3>Rib raft slab</h3>
      <p className={styles.hint}>
        {r.areaM2.toFixed(1)} m², {m(r.perimeterMm)} round: a {st.edgeBeamMm} edge beam all round
        {beams.length ? `, a ${st.internalBeamMm} beam under each of the ${beams.length} ${beamsFrom}` : ""}
        {joints.length ? `, a free joint along the party wall${joints.length > 1 ? "s" : ""}` : ""}, {st.podMm} pods with {st.ribMm} ribs between, {st.toppingMm} topping. An estimate off the usual
        engineer&apos;s notes — the engineer&apos;s plan sets out the beams and what&apos;s in them.
      </p>
      <svg
        viewBox={`${x0 - pad} ${y0 - pad} ${w + pad * 2} ${h + pad * 2}`}
        style={{ width: "100%", maxHeight: 420, background: "var(--color-background, transparent)" }}
        role="img"
        aria-label={`The rib raft's pods: ${r.fullPods} whole, ${r.cutPods} cut`}
      >
        <polygon points={outline.map((p) => `${p.x},${p.y}`).join(" ")} fill="#9d9a94" stroke="#55524d" strokeWidth={Math.max(w, h) / 400} />
        {r.pods.map((p, i) => (
          <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.cut ? "#f2d3a2" : "#eef0f2"} stroke="#7c7a75" strokeWidth={Math.max(w, h) / 1200} />
        ))}
        {joints.map((i) => {
          const a = outline[i]
          const b = outline[(i + 1) % outline.length]
          return <line key={`j${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#c0392b" strokeWidth={Math.max(w, h) / 250} strokeDasharray={`${Math.max(w, h) / 80} ${Math.max(w, h) / 120}`} />
        })}
      </svg>
      <p className={styles.muted}>Grey: concrete (beams and ribs). White: whole pods. Tan: cut pods. Red dashes: a free joint to the next unit.</p>
      <div className={styles.fields}>
        <label>
          Pods
          <select value={st.podHeightMm} onChange={(e) => set({ podHeightMm: Number(e.target.value) })}>
            {[220, 300].map((v) => (
              <option key={v} value={v}>
                {st.podMm} × {st.podMm} × {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Set out
          <select value={st.setout} onChange={(e) => set({ setout: e.target.value as RibRaftSettings["setout"] })}>
            <option value="corner">From each corner&apos;s beams</option>
            <option value="centred">Centred (even cuts both sides)</option>
          </select>
        </label>
        <label>
          Edge beam
          <span className={styles.unit}>
            <NumField value={st.edgeBeamMm} min={200} step={10} onChange={(v) => set({ edgeBeamMm: v })} /> mm
          </span>
        </label>
        <label>
          Ribs
          <span className={styles.unit}>
            <NumField value={st.ribMm} min={75} step={5} onChange={(v) => set({ ribMm: v })} /> mm
          </span>
        </label>
        <label>
          Topping
          <span className={styles.unit}>
            <NumField value={st.toppingMm} min={75} step={5} onChange={(v) => set({ toppingMm: v })} /> mm
          </span>
        </label>
        <label>
          Concrete
          <span className={styles.unit}>
            <NumField value={st.concreteMpa} min={17.5} step={2.5} onChange={(v) => set({ concreteMpa: v })} /> MPa
          </span>
        </label>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.cutList}>
          <thead>
            <tr>
              <th>What</th>
              <th>Size</th>
              <th>Quantity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([a, b, c]) => (
              <tr key={a}>
                <td>{a}</td>
                <td>{b}</td>
                <td>{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.notes.length > 0 && (
        <ul className={styles.hint}>
          {r.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {JSON.stringify(st) !== JSON.stringify(DEFAULT_RIB_RAFT) && (
        <button type="button" className={styles.link} onClick={() => setSettings(undefined)}>
          Back to the usual rib raft
        </button>
      )}
    </div>
  )
}

/** a side's point x along its wall (world) */
const pointOn = (s: PlanSide, x: number) => {
  const t = (x - s.x0) / (s.x1 - s.x0 || 1)
  return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t }
}

/** The party walls, as the house stands, each up from the slab to the
 * underside of the roofing — over both storeys where the first floor's
 * party wall stands on the ground floor's. */
export function partyWallsOf(cladding: Cladding): PartyWall[] {
  const sidesOf = (layout: { sides: PlanSide[] } | null) => (layout?.sides ?? []).filter((s) => s.wallId && cladding.party.has(s.wallId))
  const ground = sidesOf(cladding.ground)
  const upper = sidesOf(cladding.upper)
  const used = new Set<PlanSide>()
  const out: PartyWall[] = []
  const profile = (s: PlanSide, which: "top" | "bottom") => {
    const w = cladding.walls.get(s.wallId!)!
    return edgePoints(w[which], w.lengthMm).filter((p) => p.x >= s.x0 - 1 && p.x <= s.x1 + 1)
  }
  for (const g of ground) {
    const L = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y)
    const d = { x: (g.b.x - g.a.x) / L, y: (g.b.y - g.a.y) / L }
    const along = (p: { x: number; y: number }) => (p.x - g.a.x) * d.x + (p.y - g.a.y) * d.y
    const off = (p: { x: number; y: number }) => Math.abs((p.x - g.a.x) * d.y - (p.y - g.a.y) * d.x)
    const gTop = profile(g, "top").map((p) => ({ x: along(pointOn(g, p.x)), z: p.y }))
    // the first floor's party wall over it, if any: its top, along this one
    const over = upper.filter((u) => off(u.a) < 5 && off(u.b) < 5)
    let top = gTop
    for (const u of over) {
      used.add(u)
      const uTop = profile(u, "top").map((p) => ({ x: along(pointOn(u, p.x)), z: p.y }))
      const lo = Math.min(...uTop.map((p) => p.x))
      const hi = Math.max(...uTop.map((p) => p.x))
      top = [...top.filter((p) => p.x < lo - 1 || p.x > hi + 1), ...uTop].sort((a, b) => a.x - b.x)
    }
    const w = cladding.walls.get(g.wallId!)!
    out.push({ id: g.wallId!, name: over.length ? `${w.name} (both storeys)` : w.name, lengthMm: Math.round(L), top: top.map((p) => ({ x: Math.max(0, Math.min(L, p.x)), z: p.z })) })
  }
  // (a first-floor party wall standing on no ground-floor one: from its own bottom)
  for (const u of upper) {
    if (used.has(u)) continue
    const w = cladding.walls.get(u.wallId!)!
    const shift = (p: { x: number; y: number }) => ({ x: p.x - u.x0, z: p.y })
    out.push({ id: u.wallId!, name: w.name, lengthMm: Math.round(u.x1 - u.x0), top: profile(u, "top").map(shift), bottom: profile(u, "bottom").map(shift) })
  }
  return out
}

/** The party walls' Integra panels: each wall's panels, brackets, FireWool, sealant. */
export const IntegraCard: React.FC<{
  house: HouseProject
  cladding: Cladding
  setSettings: (patch: Partial<HouseSettings>) => void
}> = ({ house, cladding, setSettings }) => {
  const walls = useMemo(() => partyWallsOf(cladding), [cladding])
  return <IntegraPanel walls={walls} settings={house.settings.integra} setSettings={(integra) => setSettings({ integra })} />
}

/** Integra party walls, any shape: the settings and the takeoff, wall by wall. */
export const IntegraPanel: React.FC<{
  walls: PartyWall[]
  settings: Partial<IntegraSettings> | undefined
  setSettings: (s: Partial<IntegraSettings> | undefined) => void
}> = ({ walls, settings, setSettings }) => {
  const st = integraFromData(settings)
  const set = (patch: Partial<IntegraSettings>) => setSettings({ ...(settings ?? {}), ...patch })
  const r = useMemo(() => integraWalls(walls, st), [walls, JSON.stringify(st)]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!walls.length) return null
  return (
    <div className={styles.panel}>
      <h3>Intertenancy walls (Integra)</h3>
      <p className={styles.hint}>
        Each party wall: {st.panelThickMm} mm Integra panels from the slab to the underside of the roofing, standing between the two units&apos; own frames, held by
        brackets ({st.bracketsPerPanel} a panel, alternating sides), FireWool over the top and up the ends, fire sealant round it.
      </p>
      <div className={styles.fields}>
        <label>
          Panel width
          <span className={styles.unit}>
            <NumField value={st.panelWidthMm} min={300} step={1} onChange={(v) => set({ panelWidthMm: v })} /> mm
          </span>
        </label>
        <label>
          Panel length
          <span className={styles.unit}>
            <NumField value={st.panelLengthMm} min={1000} step={1} onChange={(v) => set({ panelLengthMm: v })} /> mm
          </span>
        </label>
        <label>
          Brackets a panel
          <NumField value={st.bracketsPerPanel} min={1} step={1} onChange={(v) => set({ bracketsPerPanel: v })} />
        </label>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.cutList}>
          <thead>
            <tr>
              <th>Wall</th>
              <th>Size</th>
              <th>Panels</th>
              <th>Brackets</th>
              <th>FireWool</th>
            </tr>
          </thead>
          <tbody>
            {r.walls.map((w) => (
              <tr key={w.wall.id}>
                <td>{w.wall.name}</td>
                <td>
                  {m(w.wall.lengthMm, 2)} long, up to {m(w.maxHeightMm, 2)} ({w.areaM2.toFixed(1)} m²)
                </td>
                <td>{w.panels}</td>
                <td>{w.brackets}</td>
                <td>{w.fireWoolM2.toFixed(1)} m²</td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>To order</strong>
              </td>
              <td>
                {r.areaM2.toFixed(1)} m² of wall, {r.sealantM.toFixed(0)} m of fire sealant
              </td>
              <td>
                <strong>{r.panelsToOrder}</strong>
              </td>
              <td>
                {r.brackets} ({r.screws} screws)
              </td>
              <td>{r.fireWoolM2.toFixed(1)} m²</td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul className={styles.hint}>
        {r.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      {JSON.stringify(st) !== JSON.stringify(DEFAULT_INTEGRA) && (
        <button type="button" className={styles.link} onClick={() => setSettings(undefined)}>
          Back to the usual panels
        </button>
      )}
    </div>
  )
}
