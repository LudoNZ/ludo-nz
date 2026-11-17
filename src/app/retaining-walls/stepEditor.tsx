"use client"

import styles from "./stepEditor.module.scss"

/** One bay of a stepped wall: the posts it runs between (1-based, as on
 * the elevation) and how many courses high it is. */
export interface StepBay {
  leftPost: number
  rightPost: number
  courses: number
}

/** Edits where a stepped wall's top steps. The wall is a row of bays,
 * each a whole number of courses high; a step is just where the count
 * changes at a post. So:
 *
 * - "◀ / ▶" moves a step one post along — the bay it passes over takes
 *   the height on the other side. A step that lands on another one
 *   merges with it into a double step; one moved off the end of the wall
 *   is gone.
 * - "− / +" on a bay sets exactly how many courses that bay has, for
 *   going by something seen on site rather than by the rake.
 *
 * Counts are always written out in full for the wall (see onSetCounts),
 * which is what makes it "edited" rather than worked out from the rake. */
const StepEditor: React.FC<{
  wallName: string
  bays: StepBay[]
  courseHeightMm: number
  edited: boolean
  onSetCounts: (counts: number[]) => void
  onReset: () => void
}> = ({ wallName, bays, courseHeightMm, edited, onSetCounts, onReset }) => {
  const counts = bays.map((b) => b.courses)
  const set = (j: number, value: number) => onSetCounts(counts.map((c, k) => (k === j ? Math.max(1, Math.min(80, value)) : c)))
  // the step at the post between bay j-1 and bay j
  const steps = bays.slice(1).flatMap((bay, k) => {
    const j = k + 1
    const delta = counts[j] - counts[j - 1]
    return delta === 0 ? [] : [{ j, post: bay.leftPost, delta }]
  })
  const moveLeft = (j: number) => onSetCounts(counts.map((c, k) => (k === j - 1 ? counts[j] : c)))
  const moveRight = (j: number) => onSetCounts(counts.map((c, k) => (k === j ? counts[j - 1] : c)))

  return (
    <div className={styles.editor}>
      <div className={styles.head}>
        <h4>Steps — {wallName}</h4>
        <span className={styles.state}>{edited ? "set by hand" : "worked out from the rake"}</span>
        {edited && (
          <button type="button" className={styles.link} onClick={onReset}>
            Reset to the rake
          </button>
        )}
      </div>
      <p className={styles.hint}>
        Every bay is a whole number of courses ({courseHeightMm} mm each), so the top steps at the posts. Move a step with ◀ ▶ —
        it joins any step it lands on — or set a bay&apos;s height with − / + to follow something you can see on site.
      </p>

      {steps.length === 0 ? (
        <p className={styles.none}>No steps — every bay is the same height.</p>
      ) : (
        <ul className={styles.steps}>
          {steps.map((step) => (
            <li key={step.j}>
              <span className={styles.stepName}>Post #{step.post}</span>
              <span className={step.delta > 0 ? styles.up : styles.down}>
                {step.delta > 0 ? `▲ up ${step.delta}` : `▼ down ${-step.delta}`} course{Math.abs(step.delta) === 1 ? "" : "s"}
              </span>
              <span className={styles.move}>
                <button type="button" aria-label={`Move the step at post ${step.post} one post back`} onClick={() => moveLeft(step.j)}>
                  ◀
                </button>
                <button type="button" aria-label={`Move the step at post ${step.post} one post on`} onClick={() => moveRight(step.j)}>
                  ▶
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.bays}>
        {bays.map((bay, j) => (
          <div key={bay.leftPost} className={styles.bay}>
            <span className={styles.bayName}>
              #{bay.leftPost}–{bay.rightPost}
            </span>
            <button type="button" aria-label={`One course fewer between posts ${bay.leftPost} and ${bay.rightPost}`} disabled={bay.courses <= 1} onClick={() => set(j, bay.courses - 1)}>
              −
            </button>
            <strong>{bay.courses}</strong>
            <button type="button" aria-label={`One course more between posts ${bay.leftPost} and ${bay.rightPost}`} onClick={() => set(j, bay.courses + 1)}>
              +
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default StepEditor
