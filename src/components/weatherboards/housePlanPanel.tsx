"use client"

import { useMemo } from "react"
import PolygonShapeEditor from "@/components/decking/polygonShapeEditor"
import NumField from "./numField"
import HouseRenderView from "./houseRenderView"
import { fillInOrder, chainOrder, chainSteps, chainToFootprint, footprintSides, houseLayout, HouseLayout, planOf, startingFootprint } from "./housePlan"
import { buildRoof, DEFAULT_ROOF, ROOF_COLOURS, ROOF_TYPE_LABELS } from "./roof"
import { wallCodes } from "./takeoff"
import { FootprintPlan, HousePlan, RoofPlan, RoofType, Wall, WeatherboardProject, WeatherboardSettings } from "./types"
import { WallResult } from "./weatherboardCalc"
import styles from "./housePlanPanel.module.scss"

const m = (mm: number) => `${(mm / 1000).toFixed(2)} m`

/** A small plan of the layout: each wall's side labelled with its code,
 * plain sides dashed, and the gap if the chain doesn't close. */
const PlanPreview: React.FC<{ layout: HouseLayout; codes: Map<string, string> }> = ({ layout, codes }) => {
  const pts = layout.sides.flatMap((s) => [s.a, s.b])
  if (!pts.length) return null
  const x0 = Math.min(...pts.map((p) => p.x))
  const x1 = Math.max(...pts.map((p) => p.x))
  const y0 = Math.min(...pts.map((p) => -p.y))
  const y1 = Math.max(...pts.map((p) => -p.y))
  const span = Math.max(x1 - x0, y1 - y0, 1000)
  const pad = span * 0.12
  const sw = span / 220
  const first = layout.sides[0]
  const last = layout.sides[layout.sides.length - 1]
  return (
    <svg className={styles.preview} viewBox={`${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`} role="img" aria-label="The walls on plan">
      {layout.sides.map((s, i) => {
        const mx = (s.a.x + s.b.x) / 2
        const my = -(s.a.y + s.b.y) / 2
        const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) || 1
        // the label just outside the wall (outside is to the right of a → b)
        const ox = ((s.b.y - s.a.y) / len) * sw * 9
        const oy = ((s.b.x - s.a.x) / len) * sw * 9
        return (
          <g key={i}>
            <line x1={s.a.x} y1={-s.a.y} x2={s.b.x} y2={-s.b.y} className={s.wallId ? styles.previewWall : styles.previewPlain} strokeWidth={s.wallId ? sw * 2.2 : sw} strokeDasharray={s.wallId ? undefined : `${sw * 3} ${sw * 3}`} />
            {s.wallId && (
              <text x={mx + ox} y={my + oy} fontSize={sw * 7} textAnchor="middle" dominantBaseline="middle" className={styles.previewLabel}>
                {codes.get(s.wallId) ?? "?"}
              </text>
            )}
          </g>
        )
      })}
      {!layout.closed && first && last && (
        <line x1={last.b.x} y1={-last.b.y} x2={first.a.x} y2={-first.a.y} className={styles.previewGap} strokeWidth={sw} strokeDasharray={`${sw * 2} ${sw * 4}`} />
      )}
      {first && <circle cx={first.a.x} cy={-first.a.y} r={sw * 3} className={styles.previewStart} />}
    </svg>
  )
}

/** The Plan & 3D tab: set out where the walls go on plan — by joining the
 * elevations up round the house, or by drawing the footprint and saying
 * which wall clads each side — and see the house in 3D. */
const HousePlanPanel: React.FC<{
  project: WeatherboardProject
  setProject: (update: (prev: WeatherboardProject) => WeatherboardProject) => void
  results: Map<string, WallResult[]>
  settings: WeatherboardSettings
}> = ({ project, setProject, results, settings }) => {
  const plan = planOf(project)
  const setPlan = (update: (p: HousePlan) => HousePlan) => setProject((p) => ({ ...p, plan: update(planOf(p)) }))
  const layout = useMemo(() => houseLayout(project), [project])
  const codes = useMemo(() => wallCodes(project.elevations), [project.elevations])
  const walls = useMemo(() => new Map(project.elevations.flatMap((e) => e.walls).map((w): [string, Wall] => [w.id, w])), [project.elevations])
  const wallResults = useMemo(() => {
    const out = new Map<string, WallResult>()
    for (const rs of results.values()) for (const r of rs) out.set(r.wall.id, r)
    return out
  }, [results])
  const roofPlan = plan.roof ?? DEFAULT_ROOF
  const roof = useMemo(() => buildRoof(layout, walls, roofPlan), [layout, walls, roofPlan])
  const setRoof = (patch: Partial<RoofPlan>) => setPlan((p) => ({ ...p, roof: { ...(p.roof ?? DEFAULT_ROOF), ...patch } }))
  const renderInput = useMemo(
    () => ({ layout, walls, results: wallResults, settings, roof, roofColour: roofPlan.colour }),
    [layout, walls, wallResults, settings, roof, roofPlan.colour],
  )

  const order = chainOrder(project.elevations, plan.chain).filter((e) => e.walls.length)
  const steps = chainSteps(project.elevations, plan.chain)
  const move = (index: number, by: -1 | 1) =>
    setPlan((p) => {
      const ids = chainOrder(project.elevations, p.chain)
        .filter((e) => e.walls.length)
        .map((e) => e.id)
      const j = index + by
      if (j < 0 || j >= ids.length) return p
      ;[ids[index], ids[j]] = [ids[j], ids[index]]
      return { ...p, chain: { ...p.chain, order: ids } }
    })
  const setStep = (key: string, v: number) =>
    setPlan((p) => {
      const next = { ...p.chain.steps }
      if (v) next[key] = v
      else delete next[key]
      return { ...p, chain: { ...p.chain, steps: next } }
    })

  const useFootprint = () =>
    setPlan((p) => ({ ...p, method: "footprint", footprint: p.footprint ?? startingFootprint({ ...project, plan: p }) }))
  const setFootprint = (update: (fp: FootprintPlan) => FootprintPlan) =>
    setPlan((p) => (p.footprint ? { ...p, footprint: update(p.footprint) } : p))
  const fp = plan.footprint
  const sideLengths = useMemo(() => {
    if (!fp) return []
    const out: number[] = fp.points.map(() => 0)
    for (const s of footprintSides(fp)) out[s.index] = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)
    return out
  }, [fp])

  return (
    <section className={styles.panel}>
      <div className={styles.card}>
        <h2>Where the walls go on plan</h2>
        <div className={styles.toggle} role="radiogroup" aria-label="How the walls are set out">
          <button
            type="button"
            role="radio"
            aria-checked={plan.method === "chain"}
            className={plan.method === "chain" ? styles.toggleOn : ""}
            onClick={() => setPlan((p) => ({ ...p, method: "chain" }))}
          >
            Join up the elevations
          </button>
          <button type="button" role="radio" aria-checked={plan.method === "footprint"} className={plan.method === "footprint" ? styles.toggleOn : ""} onClick={useFootprint}>
            Draw the footprint
          </button>
        </div>

        {plan.method === "chain" ? (
          <>
            <p className={styles.hint}>
              Each elevation runs on from the last and turns the corner: its right-hand end (seen from outside) meets the next
              one&apos;s left. Compass-named elevations face their own way. Where the face steps in or out between walls, or at a
              corner along a wall, give the step.
            </p>
            <div className={styles.chainGrid}>
              <div>
                <h3>Going round</h3>
                <ol className={styles.order}>
                  {order.map((e, i) => (
                    <li key={e.id}>
                      <span>
                        {e.name} <span className={styles.muted}>· {m(e.walls.reduce((s, w) => s + w.lengthMm, 0))}</span>
                      </span>
                      <span className={styles.orderButtons}>
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${e.name} earlier`}>
                          ↑
                        </button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`Move ${e.name} later`}>
                          ↓
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
                {steps.length > 0 && (
                  <>
                    <h3>Steps in or out</h3>
                    <p className={styles.hint}>mm — + steps out toward you, − steps back</p>
                    <ul className={styles.steps}>
                      {steps.map((s) => (
                        <li key={s.key}>
                          <span>{s.label}</span>
                          <span className={styles.unit}>
                            <NumField value={s.value} step={50} onChange={(v) => setStep(s.key, v)} ariaLabel={`Step at ${s.label}`} />
                            mm
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <PlanPreview layout={layout} codes={codes} />
            </div>
          </>
        ) : fp ? (
          <>
            <p className={styles.hint}>
              Drag the corners, or tap a side or corner to type its length or angle, then say which wall clads each side. A wall
              with corners along it carries on over the next sides.
            </p>
            <PolygonShapeEditor
              points={fp.points}
              lockedEdgeLengths={fp.lockedEdgeLengths}
              lockedVertexAngles={fp.lockedVertexAngles}
              ariaName="House footprint"
              sideNames={fp.sides.map((id) => (id ? (codes.get(id) ?? null) : null))}
              onShapeChange={(points, lockedEdgeLengths, lockedVertexAngles) =>
                setFootprint((f) => ({
                  points,
                  lockedEdgeLengths,
                  lockedVertexAngles,
                  // a corner added or taken away: keep the sides that are still there
                  sides: points.length === f.points.length ? f.sides : points.map((_, i) => f.sides[i] ?? null),
                }))
              }
            />
            <ul className={styles.sides}>
              {fp.points.map((_, i) => (
                <li key={i}>
                  <span>
                    Side {i + 1} <span className={styles.muted}>· {m(sideLengths[i] ?? 0)}</span>
                  </span>
                  <select
                    value={fp.sides[i] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value || null
                      setFootprint((f) => ({ ...f, sides: f.points.map((__, k) => (k === i ? v : (f.sides[k] ?? null))) }))
                    }}
                    aria-label={`Wall on side ${i + 1}`}
                  >
                    <option value="">— no wall (plain) —</option>
                    {project.elevations.map((e) => (
                      <optgroup key={e.id} label={e.name}>
                        {e.walls.map((w) => (
                          <option key={w.id} value={w.id}>
                            {codes.get(w.id)} {w.name} · {m(w.lengthMm)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
            <div className={styles.actions}>
              <button type="button" onClick={() => setFootprint((f) => fillInOrder(project, f))}>
                Fill the sides with the walls in order
              </button>
              <button
                type="button"
                onClick={() => {
                  const fresh = chainToFootprint(project)
                  if (fresh) setFootprint(() => fresh)
                }}
              >
                Start again from the joined-up elevations
              </button>
            </div>
            {layout.unplaced.length > 0 && (
              <p className={styles.hint}>Not on any side yet: {layout.unplaced.map((w) => `${codes.get(w.id)} ${w.name}`).join(", ")}</p>
            )}
          </>
        ) : null}

        {layout.warnings.map((w) => (
          <p key={w} className={styles.warning}>
            ⚠ {w}
          </p>
        ))}
      </div>

      <div className={styles.card}>
        <h2>Roof</h2>
        <div className={styles.roofGrid}>
          <label>
            Roof
            <select value={roofPlan.type} onChange={(e) => setRoof({ type: e.target.value as RoofType })}>
              {(Object.keys(ROOF_TYPE_LABELS) as RoofType[]).map((t) => (
                <option key={t} value={t}>
                  {t === "auto" && roof ? `${ROOF_TYPE_LABELS.auto} (${ROOF_TYPE_LABELS[roof.type].toLowerCase()})` : ROOF_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Pitch
            <span className={styles.unit}>
              <NumField
                value={Math.round((roofPlan.pitchDeg ?? roof?.pitchDeg ?? 25) * 10) / 10}
                min={1}
                max={60}
                step={0.5}
                disabled={roofPlan.pitchDeg === null}
                onChange={(v) => setRoof({ pitchDeg: v })}
                ariaLabel="Roof pitch"
              />
              °
            </span>
            <span className={styles.check}>
              <input
                type="checkbox"
                checked={roofPlan.pitchDeg === null}
                onChange={(e) => setRoof({ pitchDeg: e.target.checked ? null : Math.round((roof?.pitchDeg ?? 25) * 10) / 10 })}
              />
              From the walls
            </span>
          </label>
          <label>
            Eaves overhang
            <span className={styles.unit}>
              <NumField value={roofPlan.eavesMm} min={0} step={50} onChange={(v) => setRoof({ eavesMm: v })} ariaLabel="Eaves overhang" />
              mm
            </span>
          </label>
          <label>
            Verge overhang
            <span className={styles.unit}>
              <NumField value={roofPlan.vergeMm} min={0} step={50} onChange={(v) => setRoof({ vergeMm: v })} ariaLabel="Verge overhang" />
              mm
            </span>
            <span className={styles.muted}>past a gable end</span>
          </label>
        </div>
        <div className={styles.swatches} role="radiogroup" aria-label="Roof colour">
          {ROOF_COLOURS.map((c) => (
            <button
              key={c.hex}
              type="button"
              role="radio"
              aria-checked={roofPlan.colour === c.hex}
              className={`${styles.swatch} ${roofPlan.colour === c.hex ? styles.swatchOn : ""}`}
              onClick={() => setRoof({ colour: c.hex })}
            >
              <span style={{ background: c.hex }} />
              {c.name}
            </button>
          ))}
        </div>
        {roofPlan.type !== "none" && !layout.closed && (
          <p className={styles.hint}>The roof goes on once the walls go right round the house (or the footprint&apos;s drawn).</p>
        )}
        {roof && (
          <p className={styles.hint}>
            {ROOF_TYPE_LABELS[roof.type]} at {roof.pitchDeg.toFixed(1)}°, from the eaves at {roof.eavesZ} mm.
            {roof.notes.length ? ` ${roof.notes.join(" ")}` : ""}
          </p>
        )}
      </div>

      <div className={styles.card}>
        <h2>3D view</h2>
        {layout.sides.some((s) => s.wallId) ? (
          <HouseRenderView input={renderInput} />
        ) : (
          <p className={styles.hint}>Add some walls to the elevations, then they&apos;ll stand up here.</p>
        )}
      </div>
    </section>
  )
}

export default HousePlanPanel
