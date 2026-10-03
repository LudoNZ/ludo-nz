"use client"

import { useEffect, useMemo, useState } from "react"
import LessonView from "./lessonView"
import type { ProgressStore } from "./progressStore"
import { useStoredState } from "./useStoredState"
import {
  buildPlan,
  moduleProgress,
  parseLocalDate,
  weakestModules,
  type Confidence,
  type Done,
} from "./plan"
import type { Course, Lesson } from "./types"
import styles from "./courseView.module.scss"

const CONFIDENCE_LABELS = ["", "Lost", "Shaky", "Getting there", "Solid", "Interview-ready"]

const formatHours = (minutes: number) => {
  const h = minutes / 60
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`
}
const formatDay = (d: Date) => d.toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" })

/** The course itself: modules → lessons, with done checkboxes and
 * per-module confidence kept in a ProgressStore (Firestore, per user, on the
 * real page), a readiness summary, and a day-by-day plan once an interview
 * date is set in the outline. */
const CourseView: React.FC<{ course: Course; store: ProgressStore }> = ({ course, store }) => {
  const [done, setDone] = useState<Done>({})
  const [confidence, setConfidence] = useState<Confidence>({})
  const [progressLoaded, setProgressLoaded] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // a per-device view preference, so it stays in the browser
  const [coreOnly, setCoreOnly] = useStoredState<boolean>("interviewPrep.coreOnly.v1", false)
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({})
  const [openLesson, setOpenLesson] = useState<string | null>(null)
  // "today" only exists on the client — the page itself is prerendered
  const [today, setToday] = useState<Date | null>(null)

  const allLessons = useMemo(() => course.modules.flatMap((m) => m.lessons), [course])
  const lessonModule = useMemo(
    () => new Map(course.modules.flatMap((m) => m.lessons.map((l) => [l.id, m.id] as const))),
    [course],
  )

  useEffect(() => setToday(new Date()), [])

  useEffect(
    () =>
      store.subscribe(
        (p) => {
          setDone(p.done)
          setConfidence(p.confidence)
          setProgressLoaded(true)
        },
        (err) => {
          console.error("Loading interview prep progress failed:", err)
          setSaveError("Couldn't load your saved progress.")
        },
      ),
    [store],
  )

  // optimistic: update locally, then write; the snapshot listener
  // reconciles, and a failed write is surfaced rather than silently lost
  const save = (write: Promise<void>) =>
    write.then(
      () => setSaveError(null),
      (err) => {
        console.error("Saving interview prep progress failed:", err)
        setSaveError("Couldn't save your last change. Check your connection and try again.")
      },
    )

  // deep link: #sql/joins-aggregates opens that lesson
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    const moduleId = lessonModule.get(id)
    if (!moduleId) return
    setOpenModules((o) => ({ ...o, [moduleId]: true }))
    setOpenLesson(id)
    requestAnimationFrame(() => document.getElementById(`lesson-${id}`)?.scrollIntoView())
  }, [lessonModule])

  const toggleLesson = (id: string) => {
    const next = openLesson === id ? null : id
    setOpenLesson(next)
    history.replaceState(null, "", next ? `#${next}` : window.location.pathname)
  }

  const toggleDone = (id: string) => {
    const next = !done[id]
    setDone((d) => ({ ...d, [id]: next }))
    save(store.setLessonDone(id, next))
  }

  const rateModule = (moduleId: string, level: number) => {
    const next = confidence[moduleId] === level ? null : level
    setConfidence((c) => {
      const copy = { ...c }
      if (next === null) delete copy[moduleId]
      else copy[moduleId] = next
      return copy
    })
    save(store.setModuleConfidence(moduleId, next))
  }

  const progress = course.modules.map((m) => moduleProgress(m, done, confidence))
  const doneCount = allLessons.filter((l) => done[l.id]).length
  const coreLessons = allLessons.filter((l) => l.core)
  const coreDone = coreLessons.filter((l) => done[l.id]).length
  const minutesLeft = allLessons.filter((l) => !done[l.id]).reduce((s, l) => s + l.minutes, 0)
  const pct = Math.round((doneCount / allLessons.length) * 100)
  const weakest = weakestModules(progress)
  const unrated = progress.filter((p) => p.confidence === null).length
  const nextUp = allLessons.find((l) => l.core && !done[l.id]) ?? allLessons.find((l) => !done[l.id])
  const plan = today ? buildPlan(course, done, today) : null

  const jumpTo = (lesson: Lesson) => {
    const moduleId = lessonModule.get(lesson.id)!
    setOpenModules((o) => ({ ...o, [moduleId]: true }))
    setOpenLesson(lesson.id)
    history.replaceState(null, "", `#${lesson.id}`)
    requestAnimationFrame(() => document.getElementById(`lesson-${lesson.id}`)?.scrollIntoView({ behavior: "smooth" }))
  }

  return (
    <div className={styles.interviewPrepPage}>
      <h1>Interview prep</h1>
      <p className={styles.intro}>
        Full-stack engineer interview prep, in priority order: SQL first, then testing, then AWS. Every lesson has an
        explanation, a worked example, exercises with hidden solutions, and a two-minute question to answer out loud.
        Progress and confidence ratings are saved to your account.
      </p>
      {saveError && (
        <p className={styles.saveError} role="alert">
          {saveError}
        </p>
      )}

      <section className={styles.summary} aria-label="Progress and readiness">
        <div className={styles.progressBlock}>
          <div className={styles.progressLabel}>
            <strong>
              {doneCount} / {allLessons.length} lessons
            </strong>
            <span>
              core {coreDone}/{coreLessons.length} · {formatHours(minutesLeft)} left
            </span>
          </div>
          <div
            className={styles.progressBar}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Course progress"
          >
            <div style={{ width: `${progressLoaded ? pct : 0}%` }} />
          </div>
          {nextUp && (
            <p className={styles.nextUp}>
              Next up:{" "}
              <button type="button" className={styles.linkButton} onClick={() => jumpTo(nextUp)}>
                {nextUp.title}
              </button>{" "}
              ({nextUp.minutes} min)
            </p>
          )}
        </div>

        <div className={styles.readiness}>
          <h2>Readiness</h2>
          {unrated === progress.length ? (
            <p className={styles.muted}>
              Rate your confidence in each module (1–5) below. Your weakest modules will show here.
            </p>
          ) : (
            <>
              <p className={styles.muted}>Weakest first. Spend your next session here.</p>
              <ol className={styles.weakList}>
                {weakest.map((p) => (
                  <li key={p.module.id}>
                    <span>{p.module.title}</span>
                    <span className={styles.weakMeta}>
                      {p.confidence ? `${p.confidence}/5 ${CONFIDENCE_LABELS[p.confidence]}` : "not rated"} · {p.done}/
                      {p.total} done
                    </span>
                  </li>
                ))}
              </ol>
              {unrated > 0 && <p className={styles.muted}>{unrated} module(s) not rated yet.</p>}
            </>
          )}
        </div>
      </section>

      <section className={styles.plan} aria-label="Study plan">
        <h2>Day-by-day plan</h2>
        {!course.interviewDate ? (
          <p className={styles.muted}>
            Interview date not set yet. Set <code>interviewDate</code> in{" "}
            <code>src/content/interview-prep/course.ts</code> to get a plan that packs the lessons you haven&apos;t
            done into the days you have left ({course.hoursPerDay}h a day), with the mock interview on the last day.
          </p>
        ) : !plan ? null : plan.days.length === 0 ? (
          <p className={styles.muted}>
            The interview date ({formatDay(parseLocalDate(course.interviewDate))}) is today or past. Do the mock
            interview and readiness checklist, then rest. Good luck.
          </p>
        ) : (
          <>
            <p className={styles.muted}>
              Interview: {formatDay(parseLocalDate(course.interviewDate))}. {plan.days.length} study day(s) at{" "}
              {course.hoursPerDay}h. Re-plans as you tick lessons off.
              {plan.coreOnly && " Not everything fits, so this plans core lessons only."}
              {plan.overBudgetMinutes > 0 &&
                ` Still ${formatHours(plan.overBudgetMinutes)} over budget, so some days run long.`}
            </p>
            <ol className={styles.days}>
              {plan.days.map((day, i) => (
                <li key={i}>
                  <div className={styles.dayHeader}>
                    <strong>{formatDay(day.date)}</strong>
                    <span>{day.minutes ? formatHours(day.minutes) : "rest / review"}</span>
                  </div>
                  {day.lessons.length > 0 && (
                    <ul>
                      {day.lessons.map((l) => (
                        <li key={l.id}>
                          <button type="button" className={styles.linkButton} onClick={() => jumpTo(l)}>
                            {l.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <div className={styles.toolbar}>
        <label className={styles.coreToggle}>
          <input type="checkbox" checked={coreOnly} onChange={() => setCoreOnly((c) => !c)} />
          Short on time: show core lessons only
        </label>
      </div>

      <ol className={styles.modules}>
        {progress.map(({ module: m, done: mDone, total, coreDone: mCoreDone, coreTotal, confidence: conf }, mi) => {
          const open = !!openModules[m.id]
          const lessons = coreOnly ? m.lessons.filter((l) => l.core) : m.lessons
          const coreMinutes = m.lessons.filter((l) => l.core).reduce((s, l) => s + l.minutes, 0)
          return (
            <li key={m.id} className={styles.module}>
              <div className={styles.moduleHeader}>
                <button
                  type="button"
                  className={styles.moduleToggle}
                  onClick={() => setOpenModules((o) => ({ ...o, [m.id]: !open }))}
                  aria-expanded={open}
                >
                  <span className={styles.chevron} aria-hidden>
                    {open ? "▾" : "▸"}
                  </span>
                  <span className={styles.moduleTitle}>
                    {mi + 1}. {m.title}
                  </span>
                </button>
                <span className={styles.moduleMeta}>
                  {m.hours}h · core {formatHours(coreMinutes)} · {mDone}/{total} done
                  {mCoreDone < coreTotal ? ` · ${coreTotal - mCoreDone} core left` : " · core done"}
                </span>
              </div>
              <p className={styles.moduleSummary}>{m.summary}</p>

              <div className={styles.confidence} role="radiogroup" aria-label={`Confidence in ${m.title}`}>
                <span>Confidence:</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={conf === n}
                    title={CONFIDENCE_LABELS[n]}
                    className={conf === n ? styles.confidenceActive : undefined}
                    onClick={() => rateModule(m.id, n)}
                  >
                    {n}
                  </button>
                ))}
                <span className={styles.muted}>{conf ? CONFIDENCE_LABELS[conf] : "not rated"}</span>
              </div>

              {open && (
                <ol className={styles.lessons}>
                  {lessons.map((l) => {
                    const lessonOpen = openLesson === l.id
                    return (
                      <li key={l.id} id={`lesson-${l.id}`} className={styles.lesson}>
                        <div className={styles.lessonRow}>
                          <input
                            type="checkbox"
                            checked={!!done[l.id]}
                            onChange={() => toggleDone(l.id)}
                            aria-label={`Mark "${l.title}" done`}
                          />
                          <button
                            type="button"
                            className={styles.lessonToggle}
                            onClick={() => toggleLesson(l.id)}
                            aria-expanded={lessonOpen}
                          >
                            <span className={done[l.id] ? styles.lessonDone : undefined}>{l.title}</span>
                          </button>
                          <span className={styles.lessonMeta}>
                            {l.core && <span className={styles.coreBadge}>core</span>}
                            {l.minutes} min
                          </span>
                        </div>
                        {lessonOpen && (
                          <>
                            <LessonView lesson={l} />
                            <label className={styles.doneFooter}>
                              <input type="checkbox" checked={!!done[l.id]} onChange={() => toggleDone(l.id)} />
                              Done with this lesson
                            </label>
                          </>
                        )}
                      </li>
                    )
                  })}
                </ol>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default CourseView
