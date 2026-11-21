"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { buildHouseScene, groupPieces, HouseRenderInput, housePieces, Piece, PlacedHouse } from "@/components/weatherboards/houseRender3d"
import type { V3 } from "@/components/render3d/perspective"
import styles from "./showcase.module.scss"

/** A stage of the build: which parts go up in it, its name, an icon and a line of story. */
interface Phase {
  id: string
  title: string
  story: string
  icon: React.ReactNode
  pieces: Piece[]
}

/** each stage's length, and how long each part takes to fall into place (s) */
const PHASE_S = 3.2
const FALL_S = 0.95
/** how high the parts fall from (mm above where they land) */
const DROP_MM = 9000
/** a jump's speed, against playing */
const FAST = 7

const ICON = (d: string) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
)
const ICONS = {
  ground: ICON("M3 18h18M5 18v-3h4v3M10 18v-3h4v3M15 18v-3h4v3"),
  subfloor: ICON("M3 10h18M3 14h18M6 6v12M10 6v12M14 6v12M18 6v12"),
  walls: ICON("M4 20V8h16v12M4 8l8-4 8 4M8 20v-8M12 20v-8M16 20v-8"),
  joinery: ICON("M5 4h14v16H5zM12 4v16M5 12h14"),
  midfloor: ICON("M3 9h18v3H3zM3 15h18M7 12v3M12 12v3M17 12v3"),
  upper: ICON("M4 20V12h16v8M4 12V6h16v6M9 20v-4h6v4"),
  roof: ICON("M2 13l10-8 10 8M5 11v8h14v-8"),
  finish: ICON("M12 3l2.3 5.2 5.7.5-4.3 3.8 1.3 5.6L12 15.2 7 18.1l1.3-5.6L4 8.7l5.7-.5z"),
}

const easeOutBack = (t: number) => {
  // (lands with a little settle)
  const c = 1.4
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

/** a part `dz` up, every face and line */
const lifted = (p: Piece, dz: number): Piece =>
  dz === 0
    ? p
    : {
        ...p,
        solid: { ...p.solid, faces: p.solid.faces.map((f) => ({ ...f, pts: f.pts.map(([x, y, z]): V3 => [x, y, z + dz]) })) },
        ...(p.lines ? { lines: p.lines.map(([a, b]): [V3, V3] => [[a[0], a[1], a[2] + dz], [b[0], b[1], b[2] + dz]]) } : {}),
      }

/** The house, built before your eyes: every part falls out of the sky into
 * place, stage by stage — the ground, the subfloor, the walls, the windows
 * and doors, the floor above and its walls, the roof, the finishing — the
 * camera slowly circling. Next (→) plays the next stage; tap a stage on the
 * story line to run there quickly (back too: the parts fly back up). */
const Showcase: React.FC<{
  input: HouseRenderInput
  /** more than one house (a terrace), each where it stands: built together, stage by stage across them all */
  units?: PlacedHouse[]
  name: string
  /** a line of story for each stage, from the house's numbers */
  facts: Partial<Record<string, string>>
  onClose: () => void
}> = ({ input, units, name, facts, onClose }) => {
  const model = useMemo(() => (units?.length ? groupPieces(units, new Set()) : housePieces(input, new Set())), [input, units])
  // the finished house's box, for framing the view on it (its corners frame it as well as every point, and cheaply)
  const fitTo = useMemo((): V3[] => {
    let [x0, y0, z0, x1, y1, z1] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
    for (const p of model.pieces)
      for (const f of p.solid.faces)
        for (const [x, y, z] of f.pts) {
          x0 = Math.min(x0, x)
          y0 = Math.min(y0, y)
          z0 = Math.min(z0, z)
          x1 = Math.max(x1, x)
          y1 = Math.max(y1, y)
          z1 = Math.max(z1, z)
        }
    return [x0, x1].flatMap((x) => [y0, y1].flatMap((y) => [z0, z1].map((z): V3 => [x, y, z])))
  }, [model])

  const phases: Phase[] = useMemo(() => {
    const ps = model.pieces
    const take = (f: (p: Piece) => boolean) =>
      ps
        .filter(f)
        // (bottom up, then across: the way they'd go on)
        .map((p) => ({ p, z: Math.min(...p.solid.faces.flatMap((fc) => fc.pts.map((q) => q[2]))), x: Math.min(...p.solid.faces.flatMap((fc) => fc.pts.map((q) => q[0] + q[1] * 0.3))) }))
        .sort((a, b) => Math.round(a.z / 200) - Math.round(b.z / 200) || a.x - b.x)
        .map((x) => x.p)
    const all: Omit<Phase, "icon">[] = [
      { id: "ground", title: "The ground", story: facts.ground ?? "The site's set out and the foundations go down.", pieces: take((p) => p.member === "foundation") },
      { id: "subfloor", title: "The subfloor", story: facts.subfloor ?? "Piles, bearers and joists, and the flooring on top.", pieces: take((p) => p.member === "subfloor") },
      {
        id: "walls",
        title: "The walls",
        story: facts.walls ?? "The walls stand up round the floor, inside and out.",
        pieces: take((p) => !p.upper && (p.member === "wall" || p.member === "inside" || p.member === "floor")),
      },
      { id: "joinery", title: "Windows & doors", story: facts.joinery ?? "The joinery goes in.", pieces: take((p) => !p.upper && p.member === "joinery") },
      { id: "midfloor", title: "The floor above", story: facts.midfloor ?? "Joists span the walls, and the first floor's flooring goes down.", pieces: take((p) => p.member === "midfloor") },
      {
        id: "upper",
        title: "Upstairs",
        story: facts.upper ?? "The first floor's walls and windows.",
        pieces: take((p) => !!p.upper && (p.member === "wall" || p.member === "inside" || p.member === "floor" || p.member === "joinery")),
      },
      { id: "roof", title: "The roof", story: facts.roof ?? "The roof goes on.", pieces: take((p) => p.member === "roof") },
      { id: "finish", title: "Finished", story: facts.finish ?? "Facings, scribers and flashings — and it's done.", pieces: take((p) => p.member === "trims") },
    ]
    return all.filter((x) => x.pieces.length).map((x) => ({ ...x, icon: ICONS[x.id as keyof typeof ICONS] }))
  }, [model, facts])

  const total = phases.length * PHASE_S
  // where the build's got to (s), and where it's going
  const [t, setT] = useState(0)
  const [goal, setGoal] = useState(PHASE_S)
  const [fast, setFast] = useState(false)
  const [auto, setAuto] = useState(false)
  const tRef = useRef(t)
  tRef.current = t
  // the camera's slow turn
  const [az, setAz] = useState(-40)

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      // (a slow frame catches up, rather than the build going in slow motion)
      const dt = Math.min(0.5, (now - last) / 1000)
      last = now
      setAz((a) => a + dt * 4)
      setT((cur) => {
        const g = auto ? total : goal
        if (Math.abs(g - cur) < 1e-3) return g
        const step = dt * (fast ? FAST : 1)
        return g > cur ? Math.min(g, cur + step) : Math.max(g, cur - step)
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [goal, fast, auto, total])

  const phaseAt = Math.min(phases.length - 1, Math.floor(Math.max(0, t - 1e-3) / PHASE_S))
  const arrived = Math.abs(goal - t) < 1e-3
  useEffect(() => {
    if (arrived) setFast(false)
  }, [arrived])
  useEffect(() => {
    if (auto && t >= total - 1e-3) {
      setAuto(false)
      setGoal(total)
    }
  }, [auto, t, total])

  /** run to the end of stage k: at playing speed to the next, quickly further */
  const goTo = useCallback(
    (k: number) => {
      setAuto(false)
      const cur = tRef.current
      const end = (Math.max(0, Math.min(phases.length - 1, k)) + 1) * PHASE_S
      setFast(Math.abs(end - cur) > PHASE_S + 0.01)
      setGoal(end)
    },
    [phases.length],
  )
  const current = Math.max(0, Math.round(goal / PHASE_S) - 1)
  /** play the rest, or pause where it's got to (and play again from the start once it's built) */
  const togglePlay = useCallback(() => {
    setFast(false)
    setAuto((a) => {
      if (a) {
        setGoal(tRef.current)
        return false
      }
      if (tRef.current >= total - 1e-3) {
        setT(0)
        tRef.current = 0
      }
      return true
    })
  }, [total])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowRight") goTo(current + 1)
      else if (e.key === "ArrowLeft") goTo(current - 1)
      else if (e.key === " ") {
        e.preventDefault()
        togglePlay()
      } else return
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [current, goTo, onClose, togglePlay])

  // each part where it is at time t: not yet started (out of sight), falling, or landed
  const shown = useMemo(() => {
    const out: Piece[] = []
    phases.forEach((ph, k) => {
      const n = ph.pieces.length
      const start = k * PHASE_S
      const spread = PHASE_S - FALL_S - 0.15
      ph.pieces.forEach((p, i) => {
        const t0 = start + (n > 1 ? (i / (n - 1)) * spread : 0)
        const u = (t - t0) / FALL_S
        if (u <= 0) return
        out.push(lifted(p, u >= 1 ? 0 : DROP_MM * (1 - easeOutBack(u))))
      })
    })
    return out
  }, [phases, t])

  const scene = useMemo(() => buildHouseScene({ ...model, pieces: shown.length ? shown : [], floor: null }, { azimuthDeg: az, elevationDeg: 24, fitTo }), [model, shown, az, fitTo])

  // painted on a canvas, not as SVG: hundreds of shapes a frame
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    const w = cv.clientWidth
    const h = cv.clientHeight
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
    }
    const ctx = cv.getContext("2d")
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const sky = ctx.createLinearGradient(0, 0, 0, cv.height)
    sky.addColorStop(0, "#cfe3f3")
    sky.addColorStop(1, "#f7fbff")
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, cv.width, cv.height)
    if (!scene) return
    // the view box, fitted in the middle (as an SVG's "meet")
    const vb = scene.viewBox
    const k = Math.min(cv.width / vb.w, cv.height / vb.h)
    ctx.setTransform(k, 0, 0, k, (cv.width - vb.w * k) / 2 - vb.x * k, (cv.height - vb.h * k) / 2 - vb.y * k)
    ctx.lineJoin = "round"
    for (const it of scene.items) {
      if (it.kind === "poly") {
        const path = new Path2D(`M${it.points.replace(/ /g, "L")}Z`)
        ctx.fillStyle = it.fill
        ctx.fill(path)
        ctx.strokeStyle = it.stroke
        ctx.lineWidth = scene.strokeW
        ctx.stroke(path)
      } else {
        ctx.strokeStyle = it.stroke
        ctx.lineWidth = scene.strokeW * 0.8
        ctx.stroke(new Path2D(it.d))
      }
    }
  }, [scene])
  const ph = phases[phaseAt]

  return createPortal(
    <div className={styles.root} role="dialog" aria-modal="true" aria-label={`${name} — the build`}>
      <div className={styles.stage}>
        <canvas ref={canvasRef} className={styles.svg} role="img" aria-label={`${name}, ${ph?.title ?? ""}`} />
      </div>

      <header className={styles.top}>
        <h2>{name}</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close the showcase">
          ×
        </button>
      </header>

      <footer className={styles.bottom}>
        {ph && (
          <div className={styles.caption} key={ph.id}>
            <span className={styles.step}>
              {phaseAt + 1} / {phases.length}
            </span>
            <h3>{ph.title}</h3>
            <p>{ph.story}</p>
          </div>
        )}
        <ol className={styles.story} aria-label="The build, stage by stage">
          {phases.map((p, k) => {
            const done = t >= (k + 1) * PHASE_S - 1e-3
            const on = k === phaseAt
            return (
              <li key={p.id} className={`${styles.dot} ${done ? styles.done : ""} ${on ? styles.on : ""}`}>
                <button type="button" onClick={() => goTo(k)} aria-current={on ? "step" : undefined} aria-label={`${k + 1}. ${p.title}`} title={p.title}>
                  {p.icon}
                </button>
                <span>{p.title}</span>
              </li>
            )
          })}
        </ol>
        <div className={styles.controls}>
          <button type="button" onClick={() => goTo(current - 1)} disabled={current === 0 && t <= PHASE_S}>
            ◀ Back
          </button>
          <button type="button" onClick={togglePlay}>
            {auto ? "❚❚ Pause" : t >= total - 1e-3 ? "↻ Again" : "▶ Play all"}
          </button>
          <button type="button" className={styles.next} onClick={() => goTo(current + 1)} disabled={current >= phases.length - 1 && arrived}>
            Next ▶
          </button>
        </div>
      </footer>
    </div>,
    document.body,
  )
}

export default Showcase
