"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import styles from "./cookMode.module.scss"
import { firestore } from "../../../firebase/client"
import {
  doc, setDoc, deleteDoc, addDoc, collection, arrayUnion, arrayRemove,
  serverTimestamp, deleteField,
} from "firebase/firestore"
import {
  Recipe, RecipeStep, CookState, CookLog, BatchRecord, TimerState,
  timerElapsedMs, formatDuration, batchPhaseDurations,
} from "./recipeTypes"

interface Props {
  code: string
  recipe: Recipe
  cook: CookState | null
  logs: CookLog[]
  onBack: () => void
  onEdit: () => void
}

// --- Alarm sound (Web Audio, no asset needed) ---
let audioCtx: AudioContext | null = null
function primeAudio() {
  try {
    if (!audioCtx) audioCtx = new AudioContext()
    if (audioCtx.state === "suspended") void audioCtx.resume()
  } catch { /* audio unsupported */ }
}
function beep() {
  try {
    primeAudio()
    if (!audioCtx) return
    const t0 = audioCtx.currentTime
    for (let i = 0; i < 3; i++) {
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.35)
      gain.gain.exponentialRampToValueAtTime(0.4, t0 + i * 0.35 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.35 + 0.25)
      osc.connect(gain).connect(audioCtx.destination)
      osc.start(t0 + i * 0.35)
      osc.stop(t0 + i * 0.35 + 0.3)
    }
  } catch { /* ignore */ }
  try { navigator.vibrate?.([300, 150, 300, 150, 300]) } catch { /* ignore */ }
}

// --- Screen wake lock ---
function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen")
      } catch { /* denied, e.g. low battery */ }
    }
    void acquire()
    // Locks are released when the tab is hidden; take it back on return.
    const onVis = () => { if (document.visibilityState === "visible" && !cancelled) void acquire() }
    document.addEventListener("visibilitychange", onVis)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVis)
      void lock?.release().catch(() => {})
    }
  }, [enabled])
}

export default function CookMode({ code, recipe, cook, logs, onBack, onEdit }: Props) {
  const cookRef = useMemo(() => doc(firestore, "menuSessions", code, "cooks", recipe.id), [code, recipe.id])
  const [now, setNow] = useState(() => Date.now())
  const [keepAwake, setKeepAwake] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [saving, setSaving] = useState(false)
  const stepRefs = useRef<Record<string, HTMLLIElement | null>>({})
  const firedAlarms = useRef<Set<string>>(new Set())

  useWakeLock(keepAwake)

  const checked = useMemo(() => new Set(cook?.checked ?? []), [cook?.checked])
  const doneSteps = useMemo(() => new Set(cook?.doneSteps ?? []), [cook?.doneSteps])
  const timers = useMemo(() => cook?.timers ?? {}, [cook?.timers])
  const batches = useMemo(() => cook?.batches ?? [], [cook?.batches])
  const currentStep = Math.min(cook?.currentStep ?? 0, Math.max(recipe.steps.length - 1, 0))

  const anyRunning =
    Object.values(timers).some((t) => t.startedAt != null) ||
    batches.some((b) => b.endedAt == null)

  useEffect(() => {
    if (!anyRunning) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [anyRunning])

  // Fire the alarm once when a running countdown crosses zero.
  useEffect(() => {
    for (const step of recipe.steps) {
      const t = timers[step.id]
      if (!step.timer || step.timer.mode !== "countdown" || !t || t.startedAt == null) continue
      const key = `${step.id}:${t.startedAt}`
      if (timerElapsedMs(t, now) >= step.timer.seconds * 1000 && !firedAlarms.current.has(key)) {
        // Don't alarm for countdowns that already ran out before this page loaded.
        const overBy = timerElapsedMs(t, now) - step.timer.seconds * 1000
        firedAlarms.current.add(key)
        if (overBy < 3000) beep()
      }
    }
  }, [now, timers, recipe.steps])

  const write = useCallback((data: Record<string, unknown>) => {
    const base = cook ? {} : {
      recipeId: recipe.id, checked: [], currentStep: 0, doneSteps: [],
      timers: {}, batches: [], startedAt: Date.now(),
    }
    return setDoc(cookRef, { ...base, ...data, updatedAt: Date.now() }, { merge: true })
  }, [cook, cookRef, recipe.id])

  // --- Ingredients ---
  const toggleIngredient = (id: string) => {
    void write({ checked: checked.has(id) ? arrayRemove(id) : arrayUnion(id) })
  }

  // --- Steps ---
  const goToStep = (i: number) => {
    const clamped = Math.max(0, Math.min(recipe.steps.length - 1, i))
    void write({ currentStep: clamped })
    const step = recipe.steps[clamped]
    if (step) stepRefs.current[step.id]?.scrollIntoView({ behavior: "smooth", block: "center" })
  }
  const toggleStepDone = (step: RecipeStep) => {
    void write({ doneSteps: doneSteps.has(step.id) ? arrayRemove(step.id) : arrayUnion(step.id) })
  }
  const completeAndNext = () => {
    const step = recipe.steps[currentStep]
    if (!step) return
    const next = Math.min(recipe.steps.length - 1, currentStep + 1)
    void write({ doneSteps: arrayUnion(step.id), currentStep: next })
    const nextStep = recipe.steps[next]
    if (nextStep) stepRefs.current[nextStep.id]?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  // --- Step timers ---
  const setTimer = (stepId: string, t: TimerState | null) => {
    void write({ timers: { [stepId]: t ?? deleteField() } })
  }
  const startTimer = (stepId: string) => {
    primeAudio()
    const t = timers[stepId]
    setTimer(stepId, { startedAt: Date.now(), accumulatedMs: t?.accumulatedMs ?? 0 })
  }
  const pauseTimer = (stepId: string) => {
    const t = timers[stepId]
    if (!t || t.startedAt == null) return
    setTimer(stepId, { startedAt: null, accumulatedMs: timerElapsedMs(t, Date.now()) })
  }

  // --- Batches ---
  const batchStep = recipe.steps.find((s) => s.batch)
  const phases = batchStep?.batch?.phases ?? []
  const writeBatches = (next: BatchRecord[]) => write({ batches: next })

  const startBatch = () => {
    primeAudio()
    const n = batches.reduce((max, b) => Math.max(max, b.n), 0) + 1
    void writeBatches([...batches, { n, startedAt: Date.now(), phaseEnds: [], endedAt: null }])
  }
  const advanceBatch = (n: number) => {
    const t = Date.now()
    void writeBatches(batches.map((b) => {
      if (b.n !== n || b.endedAt != null) return b
      const phaseEnds = [...b.phaseEnds, t]
      return { ...b, phaseEnds, endedAt: phaseEnds.length >= Math.max(phases.length, 1) ? t : null }
    }))
  }
  const removeBatch = (n: number) => {
    void writeBatches(batches.filter((b) => b.n !== n))
  }

  // --- Finish / reset ---
  const finish = async () => {
    setSaving(true)
    try {
      const finished = batches.filter((b) => b.endedAt != null)
      await addDoc(collection(firestore, "menuSessions", code, "cookLogs"), {
        recipeId: recipe.id,
        recipeName: recipe.name,
        startedAt: cook?.startedAt ?? Date.now(),
        finishedAt: Date.now(),
        batches: finished,
        phaseLabels: phases.map((p) => p.label),
        createdAt: serverTimestamp(),
      })
      await deleteDoc(cookRef)
      setKeepAwake(false)
    } finally {
      setSaving(false)
    }
  }
  const reset = async () => {
    await deleteDoc(cookRef)
    setConfirmReset(false)
  }

  // --- Derived ---
  const activeTimers = recipe.steps.filter((s) => s.timer && timers[s.id])
  const activeBatches = batches.filter((b) => b.endedAt == null)
  const finishedBatches = batches.filter((b) => b.endedAt != null)
  const ingredientsDone = recipe.ingredients.filter((i) => checked.has(i.id)).length

  return (
    <div className={styles.cookMode}>
      <div className={styles.topRow}>
        <button className={styles.backBtn} onClick={onBack}>← Recipes</button>
        <div className={styles.topActions}>
          <label className={styles.awakeToggle} title="Keep the screen on while cooking">
            <input type="checkbox" checked={keepAwake} onChange={(e) => setKeepAwake(e.target.checked)} />
            Keep screen on
          </label>
          <button className={styles.linkBtn} onClick={onEdit}>Edit</button>
        </div>
      </div>

      <h2 className={styles.recipeName}>{recipe.name}</h2>
      {recipe.description && <p className={styles.description}>{recipe.description}</p>}
      {recipe.servings && <p className={styles.servings}>Makes {recipe.servings}</p>}

      {(activeTimers.length > 0 || activeBatches.length > 0) && (
        <div className={styles.timerBar}>
          {activeTimers.map((s) => {
            const t = timers[s.id]
            const elapsed = timerElapsedMs(t, now)
            const isCountdown = s.timer!.mode === "countdown"
            const remaining = s.timer!.seconds * 1000 - elapsed
            const over = isCountdown && remaining <= 0
            return (
              <button
                key={s.id}
                className={`${styles.chip} ${over ? styles.chipAlert : ""} ${t.startedAt == null ? styles.chipPaused : ""}`}
                onClick={() => goToStep(recipe.steps.indexOf(s))}
              >
                <span className={styles.chipLabel}>{s.timer!.label || `Step ${recipe.steps.indexOf(s) + 1}`}</span>
                <span className={styles.chipTime}>
                  {isCountdown
                    ? (over ? `+${formatDuration(-remaining)}` : formatDuration(remaining + 999))
                    : formatDuration(elapsed)}
                </span>
              </button>
            )
          })}
          {activeBatches.map((b) => {
            const phaseIdx = b.phaseEnds.length
            const phaseStart = b.phaseEnds[phaseIdx - 1] ?? b.startedAt
            const target = phases[phaseIdx]?.targetSeconds
            const elapsed = now - phaseStart
            const over = target != null && elapsed >= target * 1000
            return (
              <button
                key={`b${b.n}`}
                className={`${styles.chip} ${over ? styles.chipAlert : ""}`}
                onClick={() => batchStep && goToStep(recipe.steps.indexOf(batchStep))}
              >
                <span className={styles.chipLabel}>
                  {batchStep?.batch?.label} #{b.n} · {phases[phaseIdx]?.label ?? "Cooking"}
                </span>
                <span className={styles.chipTime}>{formatDuration(elapsed)}</span>
              </button>
            )
          })}
        </div>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h3>Ingredients</h3>
          <span className={styles.count}>{ingredientsDone}/{recipe.ingredients.length}</span>
        </div>
        <ul className={styles.ingredients}>
          {recipe.ingredients.map((ing) => (
            <li key={ing.id}>
              <label className={`${styles.ingredient} ${checked.has(ing.id) ? styles.ingredientDone : ""}`}>
                <input type="checkbox" checked={checked.has(ing.id)} onChange={() => toggleIngredient(ing.id)} />
                <span>{ing.text}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h3>Steps</h3>
          <span className={styles.count}>Step {currentStep + 1} of {recipe.steps.length}</span>
        </div>
        <ol className={styles.steps}>
          {recipe.steps.map((step, i) => {
            const isCurrent = i === currentStep
            const isDone = doneSteps.has(step.id)
            return (
              <li
                key={step.id}
                ref={(el) => { stepRefs.current[step.id] = el }}
                className={`${styles.step} ${isCurrent ? styles.stepCurrent : ""} ${isDone ? styles.stepDone : ""}`}
              >
                <div className={styles.stepHead}>
                  <button
                    className={`${styles.stepCheck} ${isDone ? styles.stepCheckOn : ""}`}
                    onClick={() => toggleStepDone(step)}
                    aria-label={isDone ? "Mark step not done" : "Mark step done"}
                  >
                    {isDone ? "✓" : i + 1}
                  </button>
                  <button className={styles.stepText} onClick={() => goToStep(i)}>
                    {step.text}
                  </button>
                </div>

                {step.timer && (
                  <StepTimerView
                    step={step}
                    state={timers[step.id]}
                    now={now}
                    onStart={() => startTimer(step.id)}
                    onPause={() => pauseTimer(step.id)}
                    onReset={() => setTimer(step.id, null)}
                  />
                )}

                {step.batch && (
                  <div className={styles.batchPanel}>
                    {activeBatches.map((b) => {
                      const phaseIdx = b.phaseEnds.length
                      const phaseStart = b.phaseEnds[phaseIdx - 1] ?? b.startedAt
                      const phase = phases[phaseIdx]
                      const elapsed = now - phaseStart
                      const target = phase?.targetSeconds ?? null
                      const pct = target ? Math.min(100, (elapsed / (target * 1000)) * 100) : 0
                      const isLast = phaseIdx >= phases.length - 1
                      const nextLabel = isLast ? "Done" : `Next: ${phases[phaseIdx + 1].label}`
                      return (
                        <div key={b.n} className={styles.activeBatch}>
                          <div className={styles.activeBatchHead}>
                            <span>{step.batch!.label} #{b.n}</span>
                            <span className={styles.phaseLabel}>{phase?.label ?? "Cooking"}</span>
                            <button className={styles.discardBtn} onClick={() => removeBatch(b.n)} title="Discard this batch">✕</button>
                          </div>
                          <div className={`${styles.bigTime} ${target && elapsed >= target * 1000 ? styles.bigTimeOver : ""}`}>
                            {formatDuration(elapsed, true)}
                            {target != null && <span className={styles.target}> / ~{target}s</span>}
                          </div>
                          {target != null && (
                            <div className={styles.progress}><div style={{ width: `${pct}%` }} /></div>
                          )}
                          <button className={styles.primaryBtn} onClick={() => advanceBatch(b.n)}>
                            {phases.length === 0 ? "Done" : nextLabel}
                          </button>
                        </div>
                      )
                    })}

                    <button className={activeBatches.length ? styles.secondaryBtn : styles.primaryBtn} onClick={startBatch}>
                      {activeBatches.length ? "+ Start another (2nd pan)" : `Start ${step.batch.label.toLowerCase()} #${batches.reduce((m, b) => Math.max(m, b.n), 0) + 1}`}
                    </button>

                    {finishedBatches.length > 0 && (
                      <BatchTable batches={finishedBatches} phases={phases.map((p) => p.label)} targets={phases.map((p) => p.targetSeconds)} onRemove={removeBatch} />
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>

        <div className={styles.stepNav}>
          <button className={styles.secondaryBtn} onClick={() => goToStep(currentStep - 1)} disabled={currentStep === 0}>
            ← Back
          </button>
          <button className={styles.primaryBtn} onClick={completeAndNext} disabled={doneSteps.has(recipe.steps[currentStep]?.id) && currentStep === recipe.steps.length - 1}>
            {currentStep === recipe.steps.length - 1 ? "Mark done" : "Done, next step →"}
          </button>
        </div>
      </section>

      {recipe.notes.length > 0 && (
        <section className={styles.section}>
          <h3>Notes</h3>
          <ol className={styles.notes}>
            {recipe.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ol>
        </section>
      )}

      {cook && (
        <section className={styles.finishRow}>
          {confirmReset ? (
            <div className={styles.confirm}>
              <span>Clear ticks, timers and batches?</span>
              <button className={styles.dangerBtn} onClick={reset}>Clear</button>
              <button className={styles.secondaryBtn} onClick={() => setConfirmReset(false)}>Keep</button>
            </div>
          ) : (
            <>
              <button className={styles.secondaryBtn} onClick={() => setConfirmReset(true)}>Reset</button>
              <button className={styles.primaryBtn} onClick={finish} disabled={saving}>
                {saving ? "Saving..." : finishedBatches.length ? `Finish & save ${finishedBatches.length} ${batchStep?.batch?.label.toLowerCase() ?? "batch"}${finishedBatches.length === 1 ? "" : "s"}` : "Finish cooking"}
              </button>
            </>
          )}
        </section>
      )}

      {logs.length > 0 && (
        <section className={styles.section}>
          <h3>Past cooks</h3>
          <ul className={styles.logs}>
            {logs.map((log) => <LogRow key={log.id} log={log} code={code} />)}
          </ul>
        </section>
      )}
    </div>
  )
}

function StepTimerView({ step, state, now, onStart, onPause, onReset }: {
  step: RecipeStep
  state: TimerState | undefined
  now: number
  onStart: () => void
  onPause: () => void
  onReset: () => void
}) {
  const timer = step.timer!
  const elapsed = timerElapsedMs(state, now)
  const running = state?.startedAt != null
  const isCountdown = timer.mode === "countdown"
  const remaining = timer.seconds * 1000 - elapsed
  const over = isCountdown && remaining <= 0
  const pct = isCountdown && timer.seconds > 0 ? Math.min(100, (elapsed / (timer.seconds * 1000)) * 100) : 0

  return (
    <div className={`${styles.stepTimer} ${over ? styles.stepTimerOver : ""}`}>
      <div className={styles.stepTimerInfo}>
        <span className={styles.stepTimerLabel}>
          {isCountdown ? "⏲" : "⏱"} {timer.label || (isCountdown ? "Timer" : "Stopwatch")}
        </span>
        <span className={styles.stepTimerTime}>
          {isCountdown
            ? (over ? `Time! +${formatDuration(-remaining)}` : formatDuration(remaining + 999))
            : formatDuration(elapsed)}
        </span>
      </div>
      {isCountdown && <div className={styles.progress}><div style={{ width: `${pct}%` }} /></div>}
      <div className={styles.stepTimerBtns}>
        {running
          ? <button className={styles.secondaryBtn} onClick={onPause}>Pause</button>
          : <button className={styles.primaryBtn} onClick={onStart}>{state ? "Resume" : "Start"}</button>}
        {state && <button className={styles.linkBtn} onClick={onReset}>Reset</button>}
      </div>
    </div>
  )
}

function BatchTable({ batches, phases, targets, onRemove }: {
  batches: BatchRecord[]
  phases: string[]
  targets?: (number | null)[]
  onRemove?: (n: number) => void
}) {
  const rows = batches.map((b) => ({ b, ...batchPhaseDurations(b) }))
  const avg = (vals: number[]) => vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null
  const phaseAvgs = phases.map((_, i) => avg(rows.map((r) => r.phases[i]).filter((v): v is number => v != null)))
  const totalAvg = avg(rows.map((r) => r.total).filter((v): v is number => v != null))
  const showPhases = phases.length > 1

  return (
    <div className={styles.tableWrap}>
      <table className={styles.batchTable}>
        <thead>
          <tr>
            <th>#</th>
            {showPhases && phases.map((p) => <th key={p}>{p.replace(/\s*\(.*\)$/, "")}</th>)}
            <th>Total</th>
            {onRemove && <th aria-label="Remove" />}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ b, phases: ph, total }) => (
            <tr key={b.n}>
              <td>{b.n}</td>
              {showPhases && phases.map((_, i) => {
                const target = targets?.[i]
                const v = ph[i]
                const off = target != null && v != null && Math.abs(v / 1000 - target) > target * 0.33
                return <td key={i} className={off ? styles.offTarget : ""}>{v != null ? formatDuration(v, true) : "—"}</td>
              })}
              <td>{total != null ? formatDuration(total, true) : "—"}</td>
              {onRemove && (
                <td><button className={styles.discardBtn} onClick={() => onRemove(b.n)} title="Remove">✕</button></td>
              )}
            </tr>
          ))}
        </tbody>
        {rows.length > 1 && (
          <tfoot>
            <tr>
              <td>Avg</td>
              {showPhases && phaseAvgs.map((v, i) => <td key={i}>{v != null ? formatDuration(v, true) : "—"}</td>)}
              <td>{totalAvg != null ? formatDuration(totalAvg, true) : "—"}</td>
              {onRemove && <td />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function LogRow({ log, code }: { log: CookLog; code: string }) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const date = new Date(log.finishedAt)
  const totals = log.batches.map((b) => batchPhaseDurations(b).total).filter((v): v is number => v != null)
  const avg = totals.length ? totals.reduce((a, v) => a + v, 0) / totals.length : null

  return (
    <li className={styles.logRow}>
      <button className={styles.logSummary} onClick={() => setOpen(!open)}>
        <span>{date.toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" })}, {date.toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit" })}</span>
        <span className={styles.logMeta}>
          {log.batches.length} batch{log.batches.length === 1 ? "" : "es"}
          {avg != null && ` · avg ${formatDuration(avg, true)}`}
          {` · ${formatDuration(log.finishedAt - log.startedAt)} total`}
        </span>
      </button>
      {open && (
        <div className={styles.logDetail}>
          {log.batches.length > 0
            ? <BatchTable batches={log.batches} phases={log.phaseLabels} />
            : <p className={styles.muted}>No batches recorded.</p>}
          {confirmDelete ? (
            <div className={styles.confirm}>
              <span>Delete this log?</span>
              <button className={styles.dangerBtn} onClick={() => deleteDoc(doc(firestore, "menuSessions", code, "cookLogs", log.id))}>Delete</button>
              <button className={styles.secondaryBtn} onClick={() => setConfirmDelete(false)}>Keep</button>
            </div>
          ) : (
            <button className={styles.linkBtn} onClick={() => setConfirmDelete(true)}>Delete log</button>
          )}
        </div>
      )}
    </li>
  )
}
