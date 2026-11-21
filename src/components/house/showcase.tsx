"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { buildHouseScene, groupPieces, HouseRenderInput, housePieces, Piece, PlacedHouse } from "@/components/weatherboards/houseRender3d"
import type { V3 } from "@/components/render3d/perspective"
import { concreteTruck } from "./concreteTruck"
import styles from "./showcase.module.scss"

/** A stage of the build: which parts go up in it, its name, an icon and a line of story. */
interface Phase {
  id: string
  title: string
  story: string
  icon: React.ReactNode
  pieces: Piece[]
  /** how long it runs (s) */
  len: number
  /** the pour: the concrete rises in place (house by house), the truck at the chute */
  pour?: boolean
  /** covered up once this stage is done: from then on, not drawn at all (a lighter scene) */
  goneAfter?: string
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
  boxing: ICON("M3 7h18v10H3zM3 7l3-3M21 7l-3-3M7 17v3M17 17v3"),
  dpm: ICON("M3 16c3-2 6 2 9 0s6-2 9 0M3 12c3-2 6 2 9 0s6-2 9 0"),
  frame0: ICON("M4 20V8h16v12M4 8h16M7 8v12M10 8v12M14 8v12M17 8v12M4 20h16"),
  frame1: ICON("M4 20V12h16v8M4 12V5h16v7M7 5v7M11 5v7M15 5v7M19 5v7"),
  frameIn: ICON("M4 4h16v16H4zM12 4v16M4 12h8"),
  cladding: ICON("M4 6h16M4 10h16M4 14h16M4 18h16"),
  pods: ICON("M3 18h18M4 15h4v-4H4zM10 15h4v-4h-4zM16 15h4v-4h-4z"),
  steel: ICON("M3 9h18M3 15h18M7 5v14M12 5v14M17 5v14"),
  spouting: ICON("M3 7h18v3H3zM18 10v10M15 20h6"),
  deck: ICON("M3 14h18v3H3zM5 17v3M19 17v3M3 14l3-4h12l3 4"),
  landscape: ICON("M12 3l-5 8h3l-4 6h12l-4-6h3zM12 17v4M3 21h18"),
  pour: ICON("M2 17h10v-5H6l-2 3H2zM12 17h3M13 9l7-3M14 12l6-2M5 19a1.5 1.5 0 1 0 .01 0M10 19a1.5 1.5 0 1 0 .01 0"),
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
  /** the site round them (with `units`): decks, paving, planting… */
  site?: Piece[]
  name: string
  /** a line of story for each stage, from the house's numbers */
  facts: Partial<Record<string, string>>
  onClose: () => void
}> = ({ input, units, site, name, facts, onClose }) => {
  const model = useMemo(() => (units?.length ? groupPieces(units, new Set(), site) : housePieces(input, new Set())), [input, units, site])
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
    // (room on the south side for the concrete truck's lane)
    if (model.pieces.some((p) => p.member === "slab")) y0 -= 4800
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
    const groups = new Set(ps.filter((p) => p.member === "slab").map((p) => p.group ?? 0)).size
    const framed = ps.some((p) => p.member === "framing")
    const all: Omit<Phase, "icon" | "len">[] = [
      { id: "boxing", title: "Set out & boxing", story: facts.boxing ?? "The site's set out, and the boxing goes up round each slab's edge.", pieces: take((p) => p.member === "boxing"), goneAfter: "pour" },
      { id: "ground", title: "The ground", story: facts.ground ?? "The site's set out and the foundations go down.", pieces: take((p) => p.member === "foundation") },
      { id: "dpm", title: "DPM", story: facts.dpm ?? "The damp-proof membrane goes down over the hardfill and sand, lapped and taped.", pieces: take((p) => p.member === "dpm"), goneAfter: "pour" },
      { id: "pods", title: "Pods", story: facts.pods ?? "The polystyrene pods go down on the membrane.", pieces: take((p) => p.member === "pods"), goneAfter: "pour" },
      { id: "steel", title: "Steel & mesh", story: facts.steel ?? "Bars in the beams and ribs, and the mesh over the top.", pieces: take((p) => p.member === "steel"), goneAfter: "pour" },
      { id: "pour", title: "The pour", story: facts.pour ?? "The concrete truck's here: the slab's poured.", pieces: take((p) => p.member === "slab") },
      { id: "subfloor", title: "The subfloor", story: facts.subfloor ?? "Piles, bearers and joists, and the flooring on top.", pieces: take((p) => p.member === "subfloor") },
      ...(framed
        ? [
            { id: "frame0", title: "Ground floor framing", story: facts.frame0 ?? "The outside walls' frames stand up on the slab: plates, studs, lintels.", pieces: take((p) => p.tag === "frame0"), goneAfter: "cladding" },
            { id: "midfloor", title: "The midfloor", story: facts.midfloor ?? "Joists span the walls below, and the first floor's flooring goes down.", pieces: take((p) => p.member === "midfloor"), goneAfter: "cladding" },
            { id: "frame1", title: "First floor framing", story: facts.frame1 ?? "Upstairs, the outside walls' frames go up.", pieces: take((p) => p.tag === "frame1"), goneAfter: "cladding" },
            { id: "frameIn", title: "Inside walls", story: facts.frameIn ?? "The inside walls are framed, both floors.", pieces: take((p) => p.tag === "frameIn"), goneAfter: "cladding" },
            { id: "roof", title: "The roof", story: facts.roof ?? "The roof goes on.", pieces: take((p) => p.member === "roof") },
            { id: "joinery", title: "Windows & doors", story: facts.joinery ?? "The joinery goes in.", pieces: take((p) => p.member === "joinery" && p.tag !== "in") },
            { id: "cladding", title: "Cladding", story: facts.cladding ?? "The weatherboards go on, course by course — the frames are closed in.", pieces: take((p) => p.member === "wall") },
          ]
        : [
            { id: "walls", title: "The walls", story: facts.walls ?? "The walls stand up round the floor, inside and out.", pieces: take((p) => !p.upper && (p.member === "wall" || p.member === "inside" || p.member === "floor")) },
            { id: "joinery", title: "Windows & doors", story: facts.joinery ?? "The joinery goes in.", pieces: take((p) => !p.upper && p.member === "joinery") },
            { id: "midfloor", title: "The floor above", story: facts.midfloor ?? "Joists span the walls, and the first floor's flooring goes down.", pieces: take((p) => p.member === "midfloor") },
            { id: "upper", title: "Upstairs", story: facts.upper ?? "The first floor's walls and windows.", pieces: take((p) => !!p.upper && (p.member === "wall" || p.member === "inside" || p.member === "floor" || p.member === "joinery")) },
            { id: "roof", title: "The roof", story: facts.roof ?? "The roof goes on.", pieces: take((p) => p.member === "roof") },
          ]),
      { id: "finish", title: "Facings & flashings", story: facts.trims ?? "Facings, scribers and flashings.", pieces: take((p) => p.member === "trims") },
      { id: "spouting", title: "Spouting", story: facts.spouting ?? "The spouting goes up round the eaves, and the downpipes down to the drains.", pieces: take((p) => p.member === "spouting") },
      { id: "deck", title: "Decks", story: facts.deck ?? "The decks go down: framing, then the boards.", pieces: take((p) => p.member === "deck") },
      { id: "landscape", title: "Landscaping", story: facts.landscape ?? "Paving, the driveway, planting, trees and fences.", pieces: take((p) => p.member === "landscape") },
    ]
    const kept = all.filter((x) => x.pieces.length)
    // (the last stage says it's done)
    const last = kept[kept.length - 1]
    if (last && last.id !== "finish" && facts.finish) kept[kept.length - 1] = { ...last, story: `${last.story} ${facts.finish}` }
    else if (last && last.id === "finish") kept[kept.length - 1] = { ...last, title: "Finished", story: `${last.story} ${facts.finish ?? "And it's done."}` }
    return kept
      .map((x) => ({
        ...x,
        icon: ICONS[x.id as keyof typeof ICONS],
        // (the pour runs longer: the truck goes slab to slab)
        len: x.id === "pour" ? PHASE_S * Math.max(1.6, 0.9 * groups + 0.6) : PHASE_S,
        ...(x.id === "pour" ? { pour: true } : {}),
      }))
  }, [model, facts])

  // when each stage starts and ends
  const ends = useMemo(() => phases.reduce<number[]>((acc, p) => [...acc, (acc[acc.length - 1] ?? 0) + p.len], []), [phases])
  const starts = useMemo(() => ends.map((e, k) => e - phases[k].len), [ends, phases])
  const total = ends[ends.length - 1] ?? 0
  /** the stage a moment's in */
  const phaseOf = useCallback(
    (at: number) => {
      const k = ends.findIndex((e) => at < e - 1e-6)
      return k < 0 ? Math.max(0, phases.length - 1) : k
    },
    [ends, phases.length],
  )
  // where the build's got to (s), and where it's going
  const [t, setT] = useState(0)
  const [goal, setGoal] = useState(-1)
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
        const g = auto ? total : goal < 0 ? (ends[0] ?? 0) : goal
        if (Math.abs(g - cur) < 1e-3) return g
        const step = dt * (fast ? FAST : 1)
        return g > cur ? Math.min(g, cur + step) : Math.max(g, cur - step)
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [goal, fast, auto, total, ends])

  const goalAt = goal < 0 ? (ends[0] ?? 0) : goal
  const phaseAt = phaseOf(Math.max(0, t - 1e-3))
  const arrived = Math.abs(goalAt - t) < 1e-3
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
      const kk = Math.max(0, Math.min(phases.length - 1, k))
      const end = ends[kk] ?? 0
      // (to the very next stage at playing speed; further, quickly)
      setFast(Math.abs(kk - phaseOf(Math.max(0, cur - 1e-3))) > 1)
      setGoal(end)
    },
    [phases.length, ends, phaseOf],
  )
  const current = phaseOf(Math.max(0, goalAt - 1e-3))
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
  // the pour: each house's slab in turn, west to east, the truck driving along to it
  const pour = useMemo(() => {
    const k = phases.findIndex((p) => p.pour)
    if (k < 0) return null
    const ph = phases[k]
    const zs = (p: Piece) => p.solid.faces.flatMap((f) => f.pts.map((q) => q[2]))
    const byGroup = new Map<number, Piece[]>()
    for (const p of ph.pieces) byGroup.set(p.group ?? 0, [...(byGroup.get(p.group ?? 0) ?? []), p])
    const all = ph.pieces.flatMap((p) => p.solid.faces.flatMap((f) => f.pts))
    const south = Math.min(...all.map((q) => q[1]))
    const z0 = Math.min(...ph.pieces.flatMap(zs))
    const slabs = [...byGroup.entries()]
      .map(([g, ps]) => {
        const pts = ps.flatMap((p) => p.solid.faces.flatMap((f) => f.pts))
        const xs = pts.map((q) => q[0])
        const top = Math.max(...ps.flatMap(zs))
        const bottom = Math.min(...ps.flatMap(zs))
        return { g, x: (Math.min(...xs) + Math.max(...xs)) / 2, x0: Math.min(...xs), x1: Math.max(...xs), south: Math.min(...pts.map((q) => q[1])), top, bottom }
      })
      .sort((a, b) => a.x - b.x)
    // (in to the first, then each slab: a drive, a pour; then away)
    const IN = 1.1
    const OUT = 0.9
    const each = (ph.len - IN - OUT) / slabs.length
    return { k, slabs, south, z0, IN, OUT, each }
  }, [phases])

  const shown = useMemo(() => {
    const out: Piece[] = []
    // the concrete's level in each house's slab now (null: not started)
    const level = new Map<number, number>()
    let truck: Piece[] = []
    if (pour) {
      const start = starts[pour.k]
      const local = t - start
      const drive = 0.3
      pour.slabs.forEach((sl, i) => {
        const u = Math.max(0, Math.min(1, (local - pour.IN - i * pour.each - drive * pour.each) / ((1 - drive) * pour.each)))
        if (local > pour.IN + i * pour.each + drive * pour.each) level.set(sl.g, sl.bottom + (sl.top - sl.bottom) * u)
      })
      if (local > 0 && local < phases[pour.k].len) {
        // where the truck's back is: driving in, at a slab, between them, away
        const at = (i: number) => pour.slabs[Math.max(0, Math.min(pour.slabs.length - 1, i))].x
        const ease = (v: number) => v * v * (3 - 2 * v)
        let rx: number
        let pouring: (typeof pour.slabs)[number] | null = null
        if (local < pour.IN) rx = at(0) - 16000 * (1 - ease(local / pour.IN))
        else if (local > phases[pour.k].len - pour.OUT) rx = at(pour.slabs.length - 1) + 16000 * ease((local - (phases[pour.k].len - pour.OUT)) / pour.OUT)
        else {
          const i = Math.min(pour.slabs.length - 1, Math.floor((local - pour.IN) / pour.each))
          const w = (local - pour.IN - i * pour.each) / pour.each
          if (w < drive) rx = i === 0 ? at(0) : at(i - 1) + (at(i) - at(i - 1)) * ease(w / drive)
          else {
            rx = at(i)
            pouring = pour.slabs[i]
          }
        }
        const y = pour.south - 3200
        const lvl = pouring ? (level.get(pouring.g) ?? pouring.bottom) : null
        const lip: [number, number, number] | null = pouring ? [rx - 150, pouring.south + 1600, pouring.top + 900] : null
        truck = concreteTruck(rx, y, pour.z0 + 185, t * 2.4, lip, pouring && lvl !== null && lvl < pouring.top - 1 ? lvl : null)
      }
    }
    // (a part of a house's slab sunk in its concrete is out of sight: left out)
    const topOf = (p: Piece) => Math.max(...p.solid.faces.flatMap((f) => f.pts.map((q) => q[2])))
    const buried = (p: Piece) => (p.member === "pods" || p.member === "steel") && (level.get(p.group ?? 0) ?? -Infinity) >= topOf(p) - 1
    phases.forEach((ph, k) => {
      // (covered up and done with: not drawn any more)
      const gone = ph.goneAfter ? phases.findIndex((q) => q.id === ph.goneAfter) : -1
      if (gone >= 0 && t >= ends[gone] - 1e-3) return
      // (the boxing's stripped as the truck leaves)
      const strip = ph.id === "boxing" && pour && gone === pour.k ? Math.max(0, (t - (ends[gone] - pour.OUT)) / pour.OUT) : 0
      const n = ph.pieces.length
      const start = starts[k]
      if (ph.pour) {
        // the concrete rises in place
        for (const p of ph.pieces) {
          const lv = level.get(p.group ?? 0)
          if (lv === undefined) continue
          const zs = p.solid.faces.flatMap((f) => f.pts.map((q) => q[2]))
          const lo = Math.min(...zs)
          const hi = Math.max(...zs)
          const z = Math.min(hi, lv)
          if (z <= lo + 1) continue
          const sc = (z - lo) / (hi - lo || 1)
          out.push({ ...p, solid: { ...p.solid, faces: p.solid.faces.map((f) => ({ ...f, pts: f.pts.map(([x, y, q]): [number, number, number] => [x, y, lo + (q - lo) * sc]) })) } })
        }
        return
      }
      const spread = ph.len - FALL_S - 0.15
      ph.pieces.forEach((p, i) => {
        if (buried(p)) return
        const t0 = start + (n > 1 ? (i / (n - 1)) * spread : 0)
        const u = (t - t0) / FALL_S
        if (u <= 0) return
        out.push(lifted(p, u >= 1 ? (strip > 0 ? DROP_MM * strip * strip : 0) : DROP_MM * (1 - easeOutBack(u))))
      })
    })
    return [...out, ...truck]
  }, [phases, t, pour, starts, ends])

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
            const done = t >= ends[k] - 1e-3
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
          <button type="button" onClick={() => goTo(current - 1)} disabled={current === 0 && t <= (ends[0] ?? 0)}>
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
