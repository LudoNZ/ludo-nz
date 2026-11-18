"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { CalcSettings } from "./calcSettings"
import { concreteForDepthM3, setMeasuredDepth } from "./concreteQa"
import type { ProfilePost, WallProfile } from "./postProfile"
import { segmentLabel } from "./wallPlan"
import { PlanPoint, RetainedSide } from "./wallPlan"
import WallRenderView from "./wallRenderView"
import styles from "./concreteSpeedRun.module.scss"

const STEP_MM = 50
const m3 = (v: number) => `${v.toFixed(3)} m³`

/** The concrete QA check, one pile at a time, full screen: the 3D view on
 * the top half (footings showing) with the pile in focus picked out in blue, and big controls for
 * that pile's measured depth on the bottom half, so it can be run through
 * hole by hole on site with one thumb. Tapping a post in the drawing jumps
 * to it. Every change saves straight away, same as the table. */
const ConcreteSpeedRun: React.FC<{
  profile: WallProfile
  settings: CalcSettings
  topCapEnabled: boolean
  planPoints: PlanPoint[]
  retainedSide: RetainedSide
  /** the piles to run through, in order */
  posts: ProfilePost[]
  /** m, gap left under each post (concrete-filled) */
  standoffM: number
  measuredMm: Record<string, number>
  onChange: (next: Record<string, number>) => void
  onClose: () => void
}> = ({ profile, settings, topCapEnabled, planPoints, retainedSide, posts, standoffM, measuredMm, onChange, onClose }) => {
  const gravelBaseM = settings.gravelBaseAllowanceM
  // start at the first pile not measured yet
  const [at, setAt] = useState(() => Math.max(0, posts.findIndex((p) => !(measuredMm[p.index] > 0))))
  const [draft, setDraft] = useState<string | null>(null)
  const post = posts[Math.min(at, posts.length - 1)]

  // full screen: stop the page behind scrolling, Escape closes
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  if (!post) return null

  const plannedMm = Math.round(post.embedmentM * 1000)
  const measured = measuredMm[post.index] > 0 ? measuredMm[post.index] : null
  const currentMm = measured ?? plannedMm
  const delta = currentMm - plannedMm
  const concrete = measured !== null ? concreteForDepthM3(post, measured / 1000, gravelBaseM, standoffM) : post.concreteVolumeM3
  const measuredCount = posts.filter((p) => measuredMm[p.index] > 0).length
  const total = posts.reduce(
    (sum, p) => sum + (measuredMm[p.index] > 0 ? concreteForDepthM3(p, measuredMm[p.index] / 1000, gravelBaseM, standoffM) : p.concreteVolumeM3),
    0,
  )
  const plannedTotal = posts.reduce((sum, p) => sum + p.concreteVolumeM3, 0)

  const save = (mm: number | null) => onChange(setMeasuredDepth(measuredMm, post, mm))
  const go = (i: number) => {
    setDraft(null)
    setAt(Math.max(0, Math.min(posts.length - 1, i)))
  }
  // the wall the pile is on; a corner pile shows with the wall it ends
  const segment =
    profile.segments.length > 1 ? profile.segments.find((s) => post.index >= s.startPostIndex && post.index <= s.endPostIndex) ?? null : null

  // on the body, so no transformed or clipped ancestor can trap the fixed layer
  return createPortal(
    <div className={styles.speedRun} role="dialog" aria-modal="true" aria-label="Concrete Quantity Check speed run">
      <div className={styles.top}>
        <div className={styles.topBar}>
          <span>
            {segment ? `Wall ${segmentLabel(segment.index)} · ` : ""}
            {measuredCount} of {posts.length} measured
          </span>
          <button type="button" className={styles.close} onClick={onClose}>
            Done
          </button>
        </div>
        <div className={styles.drawing}>
          <WallRenderView
            profile={profile}
            planPoints={planPoints}
            retainedSide={retainedSide}
            settings={settings}
            topCapEnabled={topCapEnabled}
            focusPostIndex={post.index}
            onSelectPost={(i) => {
              const k = posts.findIndex((p) => p.index === i)
              if (k !== -1) go(k)
            }}
            showFootingsInitially
            compact
          />
        </div>
      </div>

      <div className={styles.bottom}>
        <div className={styles.pileHead}>
          <h2>
            Pile #{post.index + 1}
            {post.isCorner && <span className={styles.tag}>corner</span>}
          </h2>
          <span className={styles.count}>
            {at + 1} / {posts.length}
          </span>
        </div>
        <p className={styles.planned}>
          Planned {plannedMm} mm deep · {Math.round(post.holeDiameterM * 1000)} mm hole
        </p>

        <div className={styles.stepper}>
          <button type="button" aria-label={`${STEP_MM} mm shallower`} onClick={() => { setDraft(null); save(currentMm - STEP_MM) }}>
            −{STEP_MM}
          </button>
          <label className={styles.depthBox}>
            <input
              type="number"
              inputMode="numeric"
              min={plannedMm % STEP_MM}
              step={STEP_MM}
              aria-label={`Pile ${post.index + 1} measured depth in millimetres`}
              className={measured === null ? styles.asPlanned : undefined}
              value={draft ?? String(currentMm)}
              onChange={(e) => {
                setDraft(e.target.value)
                const n = Number(e.target.value)
                if (e.target.value.trim() === "") save(null)
                else if (n >= 100) save(n)
              }}
              onBlur={() => setDraft(null)}
            />
            <span>mm</span>
          </label>
          <button type="button" aria-label={`${STEP_MM} mm deeper`} onClick={() => { setDraft(null); save(currentMm + STEP_MM) }}>
            +{STEP_MM}
          </button>
        </div>

        <p className={delta < 0 ? styles.short : delta > 0 ? styles.deep : styles.onPlan}>
          {delta === 0 ? "As planned" : `${Math.abs(delta)} mm ${delta < 0 ? "shallower" : "deeper"} than planned`}
          {delta < 0 && " — dig it out to depth"}
          {measured !== null && (
            <button type="button" className={styles.reset} onClick={() => { setDraft(null); save(null) }}>
              Reset to plan
            </button>
          )}
        </p>

        <dl className={styles.figures}>
          <div>
            <dt>This pile</dt>
            <dd>
              {m3(concrete)}
              {Math.abs(concrete - post.concreteVolumeM3) >= 0.0005 && <small> plan {m3(post.concreteVolumeM3)}</small>}
            </dd>
          </div>
          <div>
            <dt>All piles, as measured</dt>
            <dd>
              {m3(total)}
              {Math.abs(total - plannedTotal) >= 0.0005 && <small> plan {m3(plannedTotal)}</small>}
            </dd>
          </div>
          <div>
            <dt>Order + 10%</dt>
            <dd>{m3(total * 1.1)}</dd>
          </div>
        </dl>

        <div className={styles.nav}>
          <button type="button" onClick={() => go(at - 1)} disabled={at === 0}>
            ◀ Previous
          </button>
          {at < posts.length - 1 ? (
            <button type="button" className={styles.next} onClick={() => go(at + 1)}>
              Next pile ▶
            </button>
          ) : (
            <button type="button" className={styles.next} onClick={onClose}>
              Finish
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default ConcreteSpeedRun
