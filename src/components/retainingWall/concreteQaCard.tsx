"use client"

import { useState } from "react"
import { concreteForDepthM3, setMeasuredDepth } from "./concreteQa"
import type { ProfilePost } from "./postProfile"
import styles from "./concreteQaCard.module.scss"

const m3 = (v: number) => `${v.toFixed(3)} m³`
const signedM3 = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(3)} m³`

/** Concrete Quantity Check: every pile numbered, with its planned hole depth
 * and concrete. Enter the depth each hole actually measures and its
 * concrete is worked out again from that, so the order can be corrected
 * before the pour. Measurements are saved with the wall (keyed by post
 * index, mm), and left editable when the wall is locked — this is done on
 * site, after the wall's set up. */
const ConcreteQaCard: React.FC<{
  /** the piles to check (those counted in the materials above) */
  posts: ProfilePost[]
  gravelBaseM: number
  /** m, gap left under each post (concrete-filled) */
  standoffM?: number
  /** mm, keyed by post index */
  measuredMm: Record<string, number>
  onChange: (next: Record<string, number>) => void
  title?: string
  /** opens the one-pile-at-a-time full screen view */
  onSpeedRun?: () => void
}> = ({ posts, gravelBaseM, standoffM = 0, measuredMm, onChange, title = "Concrete Quantity Check", onSpeedRun }) => {
  const anyMeasured = posts.some((p) => measuredMm[p.index] > 0)
  const [open, setOpen] = useState(anyMeasured)
  // the text in each box while typing, so "1" on the way to "1200" isn't
  // saved and re-rendered as a hole 1 mm deep
  const [drafts, setDrafts] = useState<Record<number, string>>({})

  const rows = posts.map((p) => {
    const measured = measuredMm[p.index] > 0 ? measuredMm[p.index] / 1000 : null
    const planned = p.concreteVolumeM3
    const actual = measured !== null ? concreteForDepthM3(p, measured, gravelBaseM, standoffM) : planned
    return { post: p, measured, planned, actual }
  })
  const measuredCount = rows.filter((r) => r.measured !== null).length
  const plannedTotal = rows.reduce((s, r) => s + r.planned, 0)
  const actualTotal = rows.reduce((s, r) => s + r.actual, 0)
  const diff = actualTotal - plannedTotal

  /** saves a box's value; blank, or back at the planned depth, means the
   * hole matches the plan, so there's nothing to keep */
  const commit = (post: ProfilePost, text: string) =>
    onChange(setMeasuredDepth(measuredMm, post, text.trim() === "" ? null : Number(text)))

  return (
    <div className={styles.qaCard} id="rw-qa">
      <div className={styles.header}>
        <h3>{title}</h3>
        <div className={styles.headerButtons}>
          {onSpeedRun && posts.length > 0 && (
            <button type="button" className={styles.speedRun} onClick={onSpeedRun}>
              Speed run
            </button>
          )}
          <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Close" : anyMeasured ? `Open table (${measuredCount} measured)` : "Open table"}
          </button>
        </div>
      </div>
      {!open && (
        <p className={styles.lead}>
          Measure each hole once it&apos;s drilled and enter its depth here, to correct the concrete before you order.
        </p>
      )}

      {open && (
        <>
          <p className={styles.lead}>
            Measure each hole from the ground at the post down to the bottom of the hole, before the gravel pad goes in. Each box
            starts at the planned depth and steps 50 mm at a time; leave it there where the hole matches the plan.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Pile</th>
                  <th scope="col">Hole Ø</th>
                  <th scope="col">Planned depth</th>
                  <th scope="col">Measured depth</th>
                  <th scope="col">Concrete</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ post, measured, planned, actual }) => {
                  const plannedMm = Math.round(post.embedmentM * 1000)
                  const draft = drafts[post.index]
                  // shows the planned depth until measured, so the step arrows start from it
                  const value = draft ?? String(measured !== null ? Math.round(measured * 1000) : plannedMm)
                  const delta = measured !== null ? Math.round(measured * 1000) - plannedMm : 0
                  return (
                    <tr key={post.index} className={measured !== null ? styles.measuredRow : undefined}>
                      <th scope="row">
                        #{post.index + 1}
                        {post.isCorner && <span className={styles.tag}>corner</span>}
                      </th>
                      <td>{Math.round(post.holeDiameterM * 1000)} mm</td>
                      <td>{plannedMm} mm</td>
                      <td>
                        <span className={styles.inputCell}>
                          <input
                            type="number"
                            inputMode="numeric"
                            // steps count from min: this keeps them on the planned depth ± 50s
                            min={plannedMm % 50}
                            step={50}
                            className={measured === null ? styles.asPlanned : undefined}
                            aria-label={`Pile ${post.index + 1} measured depth in millimetres`}
                            value={value}
                            onChange={(e) => {
                              const text = e.target.value
                              setDrafts((d) => ({ ...d, [post.index]: text }))
                              if (text.trim() === "" || Number(text) >= 100) commit(post, text)
                            }}
                            onBlur={(e) => {
                              commit(post, e.target.value)
                              setDrafts((d) => {
                                const next = { ...d }
                                delete next[post.index]
                                return next
                              })
                            }}
                          />
                          mm
                        </span>
                        {measured !== null && delta !== 0 && (
                          <span className={delta < 0 ? styles.short : styles.deep}>
                            {delta > 0 ? "+" : "−"}
                            {Math.abs(delta)} mm {delta < 0 ? "shallow" : "deep"}
                          </span>
                        )}
                      </td>
                      <td>
                        {m3(actual)}
                        {measured !== null && Math.abs(actual - planned) >= 0.0005 && (
                          <span className={styles.was}>plan {m3(planned)}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <dl className={styles.totals}>
            <div>
              <dt>Planned concrete</dt>
              <dd>{m3(plannedTotal)}</dd>
            </div>
            <div>
              <dt>As measured{measuredCount < rows.length ? ` (${measuredCount} of ${rows.length} measured, the rest as planned)` : ""}</dt>
              <dd>{m3(actualTotal)}</dd>
            </div>
            <div>
              <dt>Difference</dt>
              <dd className={diff > 0.0005 ? styles.deep : diff < -0.0005 ? styles.short : undefined}>{signedM3(diff)}</dd>
            </div>
            <div className={styles.orderRow}>
              <dt>Order, as measured + 10% waste</dt>
              <dd>{m3(actualTotal * 1.1)}</dd>
            </div>
          </dl>

          {measuredCount > 0 && (
            <button type="button" className={styles.clear} onClick={() => onChange(Object.fromEntries(Object.entries(measuredMm).filter(([k]) => !posts.some((p) => String(p.index) === k))))}>
              Clear these measurements
            </button>
          )}
          {rows.some((r) => r.measured !== null && r.measured * 1000 < Math.round(r.post.embedmentM * 1000)) && (
            <p className={styles.warn}>
              ⚠ A hole shallower than planned gives the post less embedment than the reference table asks for. Dig it out to depth
              rather than just ordering less concrete.
            </p>
          )}
        </>
      )}
    </div>
  )
}

export default ConcreteQaCard
