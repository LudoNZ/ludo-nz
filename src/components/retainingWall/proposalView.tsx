"use client"

import { useEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import { CalcSettings } from "./calcSettings"
import type { ProfileTotals, WallProfile } from "./postProfile"
import { BLANK_COMPANY, CompanyDetails, Estimate, EstimateSettings, formatNzd, ProposalDetails } from "./pricing"
import { PlanPoint, RetainedSide, segmentLabel, totalLength } from "./wallPlan"
import { OBSTRUCTION_TYPES } from "./obstructions"
import { buildRenderScene, RenderExtra } from "./wallRender3d"
import styles from "./proposalView.module.scss"

/** the attribute on <html> while a proposal is printing */
const PRINT_ATTR = "data-print-proposal"
/** the overlay's id: everything else on the page is left out of the print */
const ROOT_ID = "proposal-print-root"

const longDate = (d: Date) => d.toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })
const qtyText = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(q < 10 ? 2 : 1))

/** A blank field prints as its placeholder, in brackets, so it's plain
 * what still needs filling in. */
const Field: React.FC<{ value: string; placeholder: string; block?: boolean }> = ({ value, placeholder, block }) =>
  value.trim() ? (
    block ? (
      <>
        {value.split("\n").map((line, i) => (
          <span key={i} className={styles.line}>
            {line}
          </span>
        ))}
      </>
    ) : (
      <>{value}</>
    )
  ) : (
    <span className={styles.placeholder}>[{placeholder}]</span>
  )

/** The scope of works, written from the wall itself. */
function scopeItems(profile: WallProfile, totals: ProfileTotals, planPoints: PlanPoint[], topCapEnabled: boolean, settings: EstimateSettings, extra: string[] = []): string[] {
  const valid = totals.postIndices.map((i) => profile.posts[i])
  const lengthM = totalLength(planPoints)
  const runs = planPoints.length - 1
  const maxH = Math.max(0, ...valid.map((p) => p.retainedHeightM))
  const minH = Math.min(...valid.map((p) => p.retainedHeightM))
  const sizes = totals.postsBySize.map((s) => `${s.count} × ${s.sizeLabel}`).join(" and ")
  const spacingMm = Math.round(Math.max(...profile.segments.map((s) => s.postSpacingM)) * 1000)
  const dias = totals.holeDiametersM.map((d) => `${Math.round(d * 1000)} mm`).join(" / ")
  const depth =
    Math.round(totals.minHoleDepthM * 1000) === Math.round(totals.maxHoleDepthM * 1000)
      ? `${Math.round(totals.maxHoleDepthM * 1000)} mm`
      : `${Math.round(totals.minHoleDepthM * 1000)}–${Math.round(totals.maxHoleDepthM * 1000)} mm`
  const boards = totals.boardOrder.reduce((s, o) => s + o.count, 0)
  const items = [
    `Set out and build a timber pole retaining wall ${lengthM.toFixed(1)} m long${runs > 1 ? `, in ${runs} straight runs` : ""}, retaining ${
      Math.abs(maxH - minH) < 0.05 ? `${maxH.toFixed(2)} m` : `${minH.toFixed(2)}–${maxH.toFixed(2)} m`
    } of ground.`,
    `Supply and install ${sizes} H5 treated posts at up to ${spacingMm} mm centres, concreted into ${dias} diameter holes ${depth} deep.`,
    `Supply and fix H4 treated facing boards to the posts (${boards} boards), finished with a top board along the top of the wall${topCapEnabled ? " and a capping board over it" : ""}.`,
  ]
  if (settings.includeDrainage) items.push("Drainage behind the wall: a drainage coil bedded in free-draining metal, led to an outlet.")
  items.push(...extra)
  for (const x of settings.extraLines) if (x.description.trim()) items.push(x.description.trim().replace(/\.?$/, "."))
  items.push("Clean up the work area on completion.")
  return items
}

/** A construction proposal for the wall, ready to print or save as a PDF:
 * letterhead, client and site, the 3D render, scope of works, the priced
 * breakdown (markup built into each line), exclusions, terms and an
 * acceptance block. The details are edited in the panel beside it and
 * kept with the wall; company details come from the price library, and
 * anything blank prints as a [placeholder]. */
const ProposalView: React.FC<{
  profile: WallProfile
  totals: ProfileTotals
  estimate: Estimate
  settings: EstimateSettings
  onChange: (next: EstimateSettings) => void
  company: CompanyDetails
  onEditCompany: () => void
  planPoints: PlanPoint[]
  retainedSide: RetainedSide
  calcSettings: CalcSettings
  topCapEnabled: boolean
  projectName?: string
  /** called when the proposal is sent to print, for the activity log */
  onPrinted?: (label: string) => void
  onClose: () => void
  /** things from other calculators drawn with the wall in the render */
  extras?: RenderExtra[]
  /** scope items from other calculators (stairs), after the wall's own */
  extraScope?: string[]
}> = ({ profile, totals, estimate, settings, onChange, company, onEditCompany, planPoints, retainedSide, calcSettings, topCapEnabled, projectName, onPrinted, onClose, extras, extraScope }) => {
  const c = { ...BLANK_COMPANY, ...company }
  const p = settings.proposal
  const setP = (patch: Partial<ProposalDetails>) => onChange({ ...settings, proposal: { ...p, ...patch } })

  const scene = useMemo(
    () => buildRenderScene(profile, planPoints, retainedSide, calcSettings, topCapEnabled, { azimuthDeg: -32, elevationDeg: 24, showFootings: false }, [], extras),
    [profile, planPoints, retainedSide, calcSettings, topCapEnabled, extras],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const handlePrint = () => {
    onPrinted?.(
      // the client's name is left out: it's the user's customer, not theirs to share
      `Printed a proposal${p.reference.trim() ? ` (${p.reference.trim()})` : ""}, ${formatNzd(estimate.totalIncGst)} incl GST`,
    )
    const root = document.documentElement
    const pageStyle = document.createElement("style")
    // a CSS module can't hold @page or bare body rules, so they go in here.
    // Everything but the proposal is taken out of the layout (not just
    // hidden), so the rest of the page doesn't print as blank pages after it
    pageStyle.textContent = `@page { size: A4; margin: 14mm 14mm 16mm; } @media print { body > *:not(#${ROOT_ID}) { display: none !important; } html, body { overflow: visible !important; height: auto !important; background: #fff !important; } }`
    document.head.appendChild(pageStyle)
    root.setAttribute(PRINT_ATTR, "")
    const done = () => {
      root.removeAttribute(PRINT_ATTR)
      pageStyle.remove()
      window.removeEventListener("afterprint", done)
    }
    window.addEventListener("afterprint", done)
    window.print()
  }

  const dated = p.date ? new Date(p.date) : new Date()
  const validUntil = new Date(dated.getTime() + p.validDays * 86_400_000)
  const priced = estimate.lines.filter((l) => l.unitCost !== null)
  const unpriced = estimate.lines.length - priced.length
  const scope = scopeItems(profile, totals, planPoints, topCapEnabled, settings, extraScope)
  const exclusions = p.exclusions.split("\n").map((s) => s.trim()).filter(Boolean)
  const sell = (v: number) => v * estimate.sellFactor

  return createPortal(
    <div id={ROOT_ID} className={styles.overlay} role="dialog" aria-modal="true" aria-label="Construction proposal">
      <aside className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>Proposal</h2>
          <button type="button" className={styles.close} onClick={onClose}>
            Close
          </button>
        </div>
        <button type="button" className={styles.print} onClick={handlePrint}>
          Print / save as PDF
        </button>
        {(estimate.staleCount > 0 || unpriced > 0) && (
          <p className={styles.warn}>
            {unpriced > 0 && `⚠ ${unpriced} item${unpriced === 1 ? " has" : "s have"} no price and ${unpriced === 1 ? "is" : "are"} left out. `}
            {estimate.staleCount > 0 && `⚠ ${estimate.staleCount} price${estimate.staleCount === 1 ? " is" : "s are"} over 3 months old — confirm before sending.`}
          </p>
        )}
        <label>
          <span>Client name</span>
          <input value={p.clientName} placeholder="Client name" onChange={(e) => setP({ clientName: e.target.value })} />
        </label>
        <label>
          <span>Site address</span>
          <textarea rows={2} value={p.siteAddress} placeholder="Site address" onChange={(e) => setP({ siteAddress: e.target.value })} />
        </label>
        <div className={styles.pair}>
          <label>
            <span>Reference</span>
            <input value={p.reference} placeholder="Q-0001" onChange={(e) => setP({ reference: e.target.value })} />
          </label>
          <label>
            <span>Valid for (days)</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={p.validDays}
              onChange={(e) => {
                const n = Math.round(Number(e.target.value))
                if (n >= 1) setP({ validDays: n })
              }}
            />
          </label>
        </div>
        <label>
          <span>Date</span>
          <input type="date" value={p.date} onChange={(e) => setP({ date: e.target.value })} />
          <small>Blank uses today&apos;s date.</small>
        </label>
        <label>
          <span>Introduction</span>
          <textarea
            rows={3}
            value={p.intro}
            placeholder="Thank you for the opportunity to quote… (blank: a standard opening)"
            onChange={(e) => setP({ intro: e.target.value })}
          />
        </label>
        <label>
          <span>Exclusions (one per line)</span>
          <textarea rows={6} value={p.exclusions} onChange={(e) => setP({ exclusions: e.target.value })} />
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={p.showRates} onChange={(e) => setP({ showRates: e.target.checked })} />
          Show quantities and rates
        </label>
        <button type="button" className={styles.linkBtn} onClick={onEditCompany}>
          Edit company details (letterhead) →
        </button>
      </aside>

      <div className={styles.stage}>
        <article className={styles.doc}>
          <header className={styles.letterhead}>
            <div className={styles.brand}>
              {c.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- a data: URL, nothing for next/image to optimise
                <img className={styles.logoImg} src={c.logo} alt={c.name.trim() || "Company logo"} />
              ) : (
                <div className={styles.logo} aria-hidden="true">
                  {c.name.trim() ? c.name.trim().slice(0, 1).toUpperCase() : "LOGO"}
                </div>
              )}
              <div>
                <div className={styles.companyName}>
                  <Field value={c.name} placeholder="Company name" />
                </div>
                <div className={styles.tagline}>
                  <Field value={c.tagline} placeholder="Tagline" />
                </div>
              </div>
            </div>
            <div className={styles.contact}>
              <Field value={c.address} placeholder="Address" block />
              <span className={styles.line}>
                <Field value={c.phone} placeholder="Phone" />
              </span>
              <span className={styles.line}>
                <Field value={c.email} placeholder="Email" />
              </span>
              {c.website.trim() && <span className={styles.line}>{c.website}</span>}
            </div>
          </header>

          <div className={styles.titleRow}>
            <div>
              <div className={styles.kicker}>Construction proposal</div>
              <h1 className={styles.title}>Timber retaining wall{projectName ? ` — ${projectName}` : ""}</h1>
            </div>
            <dl className={styles.meta}>
              <div>
                <dt>Reference</dt>
                <dd>
                  <Field value={p.reference} placeholder="Ref" />
                </dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{longDate(dated)}</dd>
              </div>
              <div>
                <dt>Valid until</dt>
                <dd>{longDate(validUntil)}</dd>
              </div>
            </dl>
          </div>

          <section className={styles.parties}>
            <div>
              <h3>Prepared for</h3>
              <p>
                <Field value={p.clientName} placeholder="Client name" />
              </p>
            </div>
            <div>
              <h3>Site</h3>
              <p>
                <Field value={p.siteAddress} placeholder="Site address" block />
              </p>
            </div>
          </section>

          <p className={styles.intro}>
            {p.intro.trim() ||
              `Thank you for the opportunity to price this work. Below is our proposal to build a timber pole retaining wall at the site above, with the scope of works, a full price breakdown and what's not included.`}
          </p>

          {scene && (
            <figure className={styles.figure}>
              <svg viewBox={`${scene.viewBox.x} ${scene.viewBox.y} ${scene.viewBox.w} ${scene.viewBox.h}`} className={styles.render} role="img" aria-label="3D view of the proposed wall">
                <defs>
                  <linearGradient id="proposalSky" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#eef3f7" />
                    <stop offset="1" stopColor="#ffffff" />
                  </linearGradient>
                </defs>
                <rect x={scene.viewBox.x} y={scene.viewBox.y} width={scene.viewBox.w} height={scene.viewBox.h} fill="url(#proposalSky)" />
                {/* the proposal prints: obstructions without their clearance shell */}
                {scene.polygons.filter((poly) => !poly.clearance).map((poly, i) => (
                  <polygon key={i} points={poly.points} fill={poly.fill} stroke={poly.stroke} strokeWidth={scene.strokeW} strokeLinejoin="round" opacity={poly.opacity} />
                ))}
              </svg>
              <figcaption>
                Proposed wall, {totalLength(planPoints).toFixed(1)} m long. Illustration only — not to scale for setting out.
              </figcaption>
            </figure>
          )}

          <section className={styles.section}>
            <h2>Scope of works</h2>
            <ul className={styles.scope}>
              {scope.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </section>

          {profile.obstructions.length > 0 && (
            <section className={styles.section}>
              <h2>Services and obstructions</h2>
              <p className={styles.obstructionNote}>
                Known services and obstructions along the wall line, with the clearance kept round each. Posts are set
                either side so no hole is dug within the clearance. Positions are to the centre line, along the wall.
              </p>
              <table className={styles.prices}>
                <thead>
                  <tr>
                    <th scope="col">What</th>
                    <th scope="col">Where</th>
                    <th scope="col" className={styles.num}>
                      Angle
                    </th>
                    <th scope="col" className={styles.num}>
                      Depth to top
                    </th>
                    <th scope="col" className={styles.num}>
                      Size
                    </th>
                    <th scope="col" className={styles.num}>
                      Clearance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {profile.obstructions.map((z) => {
                    const o = z.obstruction
                    const count = profile.segments.length
                    const wall = count > 1 ? `wall ${segmentLabel(o.segmentIndex)}` : "the wall"
                    const end =
                      o.from === "start"
                        ? o.segmentIndex === 0
                          ? `the start of ${wall}`
                          : `corner ${segmentLabel(o.segmentIndex - 1)}/${segmentLabel(o.segmentIndex)}`
                        : o.segmentIndex === count - 1
                          ? `the end of ${wall}`
                          : `corner ${segmentLabel(o.segmentIndex)}/${segmentLabel(o.segmentIndex + 1)}`
                    return (
                      <tr key={o.id}>
                        <td>
                          {OBSTRUCTION_TYPES[o.type].label}
                          {o.label && <span className={styles.lineDetail}>{o.label}</span>}
                        </td>
                        <td>
                          {o.distanceM.toFixed(2)} m from {end}
                        </td>
                        <td className={styles.num}>{o.angleDeg}°</td>
                        <td className={styles.num}>{Math.round(o.depthM * 1000)} mm</td>
                        <td className={styles.num}>{Math.round(o.sizeM * 1000)} mm</td>
                        <td className={styles.num}>{Math.round(z.clearanceM * 1000)} mm</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>
          )}

          <section className={styles.section}>
            <h2>Price breakdown</h2>
            <table className={styles.prices}>
              <thead>
                <tr>
                  <th scope="col">Description</th>
                  {p.showRates && (
                    <>
                      <th scope="col" className={styles.num}>
                        Qty
                      </th>
                      <th scope="col" className={styles.num}>
                        Rate
                      </th>
                    </>
                  )}
                  <th scope="col" className={styles.num}>
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {priced.map((l) => (
                  <tr key={l.key}>
                    <td>
                      {l.description}
                      {l.detail && !l.manual && <span className={styles.lineDetail}>{l.detail}</span>}
                    </td>
                    {p.showRates && (
                      <>
                        <td className={styles.num}>
                          {qtyText(l.quantity)} {l.unit}
                        </td>
                        <td className={styles.num}>{formatNzd(sell(l.unitCost!))}</td>
                      </>
                    )}
                    <td className={styles.num}>{formatNzd(sell(l.cost))}</td>
                  </tr>
                ))}
                {estimate.contingency > 0 && (
                  <tr>
                    <td>
                      Contingency allowance ({settings.contingencyPct}%)
                      <span className={styles.lineDetail}>for ground conditions found while drilling</span>
                    </td>
                    {p.showRates && <td colSpan={2} />}
                    <td className={styles.num}>{formatNzd(estimate.contingency)}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={p.showRates ? 3 : 1}>
                    Total excl GST
                  </th>
                  <td className={styles.num}>{formatNzd(estimate.totalExGst)}</td>
                </tr>
                <tr>
                  <th scope="row" colSpan={p.showRates ? 3 : 1}>
                    GST ({settings.gstPct}%)
                  </th>
                  <td className={styles.num}>{formatNzd(estimate.gst)}</td>
                </tr>
                <tr className={styles.grand}>
                  <th scope="row" colSpan={p.showRates ? 3 : 1}>
                    Total incl GST
                  </th>
                  <td className={styles.num}>{formatNzd(estimate.totalIncGst)}</td>
                </tr>
              </tfoot>
            </table>
          </section>

          {exclusions.length > 0 && (
            <section className={styles.section}>
              <h2>Not included</h2>
              <ul className={styles.exclusions}>
                {exclusions.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
          )}

          <section className={styles.section}>
            <h2>Terms</h2>
            <ul className={styles.exclusions}>
              <li>
                Payment: <Field value={c.paymentTerms} placeholder="Payment terms" />
              </li>
              <li>This proposal is valid until {longDate(validUntil)}. Prices may be reviewed after that date.</li>
              <li>Any variations to the scope of works will be agreed in writing and priced before they go ahead.</li>
            </ul>
          </section>

          <section className={`${styles.section} ${styles.acceptance}`}>
            <h2>Acceptance</h2>
            <p>I accept this proposal and the terms above, and authorise the work to go ahead.</p>
            <div className={styles.signatures}>
              <div>
                <span className={styles.sigLine} />
                <span>Name</span>
              </div>
              <div>
                <span className={styles.sigLine} />
                <span>Signature</span>
              </div>
              <div>
                <span className={styles.sigLine} />
                <span>Date</span>
              </div>
            </div>
          </section>

          <footer className={styles.footer}>
            <span>
              <Field value={c.name} placeholder="Company name" />
            </span>
            {c.gstNumber.trim() ? <span>GST {c.gstNumber}</span> : <span className={styles.placeholder}>[GST number]</span>}
            <span>
              <Field value={p.reference} placeholder="Ref" />
            </span>
          </footer>
        </article>
      </div>
    </div>,
    document.body,
  )
}

export default ProposalView
