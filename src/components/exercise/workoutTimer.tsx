"use client"

import { useEffect, useRef, useState } from "react"
import Button from "@/components/button/button"
import { ASSISTANCE_LEVELS, AssistanceLevel, GOAL_SETS, PullupSet } from "./types"
import styles from "./workoutTimer.module.scss"

const INTERVAL_OPTIONS = [90, 120, 150, 180]

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}:${rem.toString().padStart(2, "0")}`
}

function playBeep(ctx: AudioContext) {
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    osc.connect(gain)
    gain.connect(ctx.destination)
    const now = ctx.currentTime
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)
    osc.start(now)
    osc.stop(now + 0.4)
  } catch {
    // audio not available — ignore
  }
}

type Props = {
  onFinish: (data: {
    assistanceBands: AssistanceLevel
    targetReps: number
    intervalSeconds: number
    sets: PullupSet[]
    totalReps: number
  }) => void
  onDiscard: () => void
}

const WorkoutTimer: React.FC<Props> = ({ onFinish, onDiscard }) => {
  const [phase, setPhase] = useState<"setup" | "running">("setup")
  const [bands, setBands] = useState<AssistanceLevel>(3)
  const [targetReps, setTargetReps] = useState(10)
  const [intervalSeconds, setIntervalSeconds] = useState(120)
  const [muted, setMuted] = useState(false)

  const [sets, setSets] = useState<PullupSet[]>([])
  const [repsInput, setRepsInput] = useState(10)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [running, setRunning] = useState(false)

  const accumulatedMsRef = useRef(0)
  const resumeAtRef = useRef(0)
  const lastBoundaryRef = useRef(0)
  const audioCtxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const ms = accumulatedMsRef.current + (Date.now() - resumeAtRef.current)
      setElapsedMs(ms)

      const boundary = Math.floor(ms / 1000 / intervalSeconds)
      if (boundary > lastBoundaryRef.current) {
        lastBoundaryRef.current = boundary
        if (!muted && audioCtxRef.current) playBeep(audioCtxRef.current)
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(200)
        }
      }
    }, 200)
    return () => clearInterval(id)
  }, [running, intervalSeconds, muted])

  const start = () => {
    try {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtxRef.current = new AudioCtx()
    } catch {
      audioCtxRef.current = null
    }
    accumulatedMsRef.current = 0
    resumeAtRef.current = Date.now()
    lastBoundaryRef.current = 0
    setElapsedMs(0)
    setRepsInput(targetReps)
    setSets([])
    setRunning(true)
    setPhase("running")
  }

  const togglePause = () => {
    if (running) {
      accumulatedMsRef.current += Date.now() - resumeAtRef.current
      setRunning(false)
    } else {
      resumeAtRef.current = Date.now()
      setRunning(true)
    }
  }

  const logSet = () => {
    setSets((prev) => [...prev, { reps: repsInput, elapsedSeconds: Math.round(elapsedMs / 1000) }])
    setRepsInput(targetReps)
  }

  const finish = () => {
    setRunning(false)
    const totalReps = sets.reduce((sum, s) => sum + s.reps, 0)
    onFinish({ assistanceBands: bands, targetReps, intervalSeconds, sets, totalReps })
  }

  const discard = () => {
    if (sets.length === 0 || confirm("Discard this session? Logged sets will be lost.")) {
      setRunning(false)
      onDiscard()
    }
  }

  if (phase === "setup") {
    return (
      <div className={styles.setup}>
        <div className={styles.field}>
          <label>Assistance level</label>
          <div className={styles.segmented}>
            {ASSISTANCE_LEVELS.map((level) => (
              <button
                key={level}
                className={bands === level ? styles.active : ""}
                onClick={() => setBands(level)}
                type="button"
              >
                {level === 0 ? "None" : `${level} strap${level > 1 ? "s" : ""}`}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="targetReps">Target reps per set</label>
          <input
            id="targetReps"
            type="number"
            min={1}
            value={targetReps}
            onChange={(e) => setTargetReps(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="interval">Interval</label>
          <select
            id="interval"
            value={intervalSeconds}
            onChange={(e) => setIntervalSeconds(Number(e.target.value))}
          >
            {INTERVAL_OPTIONS.map((secs) => (
              <option key={secs} value={secs}>
                Every {formatClock(secs)}
              </option>
            ))}
          </select>
        </div>

        <Button size="large" onClick={start}>
          Start session
        </Button>
      </div>
    )
  }

  const elapsedSeconds = elapsedMs / 1000
  const inInterval = elapsedSeconds % intervalSeconds
  const nextIn = intervalSeconds - inInterval
  const progressPct = (inInterval / intervalSeconds) * 100
  const totalReps = sets.reduce((sum, s) => sum + s.reps, 0)

  return (
    <div className={styles.running}>
      <button
        className={styles.muteToggle}
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? "Unmute interval cue" : "Mute interval cue"}
        type="button"
      >
        {muted ? "🔇" : "🔔"}
      </button>

      <div className={styles.elapsed}>{formatClock(elapsedSeconds)}</div>

      <div className={styles.nextSetBlock}>
        <div className={styles.nextLabel}>Next set in</div>
        <div className={styles.nextTime}>{formatClock(nextIn)}</div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className={styles.stepper}>
        <button type="button" onClick={() => setRepsInput((r) => Math.max(0, r - 1))}>
          −
        </button>
        <span className={styles.repsValue}>{repsInput}</span>
        <button type="button" onClick={() => setRepsInput((r) => r + 1)}>
          +
        </button>
      </div>
      <div className={styles.repsLabel}>reps this set</div>

      <div className={styles.controls}>
        <Button size="large" onClick={logSet}>
          Log set
        </Button>
        <Button size="medium" variant="secondary" onClick={togglePause}>
          {running ? "Pause" : "Resume"}
        </Button>
      </div>

      <div className={styles.stats}>
        <span>
          <strong>{sets.length}</strong>/{GOAL_SETS} sets
        </span>
        <span>
          <strong>{totalReps}</strong> total reps
        </span>
      </div>

      {!!sets.length && (
        <div className={styles.setList}>
          {sets.map((s, i) => (
            <span key={i} className={`${styles.setChip} ${s.reps < targetReps ? styles.short : ""}`}>
              #{i + 1}: {s.reps} @ {formatClock(s.elapsedSeconds)}
            </span>
          ))}
        </div>
      )}

      <div className={styles.controls}>
        <Button size="medium" onClick={finish} disabled={sets.length === 0}>
          Finish &amp; save
        </Button>
        <Button size="medium" variant="danger" onClick={discard}>
          Discard
        </Button>
      </div>
    </div>
  )
}

export default WorkoutTimer
