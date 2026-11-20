"use client"

import { useMemo, useState } from "react"
import type { DeckPoint } from "../decking/polygon"
import { FrameLayout, FrameMember } from "./frame"
import styles from "./framePlanView.module.scss"

type Layer = "sheets" | "piles" | "bearers" | "joists" | "blocking"

const LAYER_LABELS: Record<Layer, string> = {
  sheets: "Flooring sheets",
  piles: "Piles",
  bearers: "Bearers / ledger",
  joists: "Joists",
  blocking: "Blocking / nogs",
}

const pts = (p: DeckPoint[]) => p.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")

/** Top-down plan of a frame, to scale, from the ground up: piles, bearers
 * (or the walls), ledger, rims and joists, blocking and nogs, and — under
 * sheet flooring — every sheet as it's laid, cut pieces shaded. Each
 * layer can be hidden to see what's underneath. */
const FramePlanView: React.FC<{ frame: FrameLayout; outline: DeckPoint[] }> = ({ frame, outline }) => {
  const [hidden, setHidden] = useState<ReadonlySet<Layer>>(() => new Set())
  const { toPlan, bounds } = frame
  const view = useMemo(() => {
    const xs = outline.map((p) => p.x)
    const ys = outline.map((p) => p.y)
    const x0 = Math.min(...xs)
    const y0 = Math.min(...ys)
    const w = Math.max(...xs) - x0
    const h = Math.max(...ys) - y0
    const size = Math.max(w, h, 1000)
    const pad = size * 0.09
    return { x0, y0, w, h, size, pad, font: size * 0.032, stroke: size * 0.0016 }
  }, [outline])

  const rect = (m: FrameMember) => {
    const half = m.thick / 2
    const c =
      m.runs === "u"
        ? [toPlan(m.from, m.at - half), toPlan(m.to, m.at - half), toPlan(m.to, m.at + half), toPlan(m.from, m.at + half)]
        : [toPlan(m.at - half, m.from), toPlan(m.at + half, m.from), toPlan(m.at + half, m.to), toPlan(m.at - half, m.to)]
    return pts(c)
  }
  const of = (...kinds: FrameMember["kind"][]) => frame.members.filter((m) => kinds.includes(m.kind))
  const has = (l: Layer) => !hidden.has(l)
  const layers: Layer[] = [
    ...(frame.sheets.length ? (["sheets"] as Layer[]) : []),
    ...(frame.piles.length ? (["piles"] as Layer[]) : []),
    ...(of("bearer", "ledger").length ? (["bearers"] as Layer[]) : []),
    "joists",
    ...(of("blocking", "nog").length ? (["blocking"] as Layer[]) : []),
  ]
  const toggle = (l: Layer) =>
    setHidden((h) => {
      const next = new Set(h)
      if (!next.delete(l)) next.add(l)
      return next
    })

  const { x0, y0, w, h, pad, font, stroke } = view
  const pile = 125
  const hangerEnds = frame.input.support === "walls" && frame.input.hangers
  const joists = of("joist")

  return (
    <div className={styles.root}>
      <svg viewBox={`${x0 - pad} ${y0 - pad} ${w + pad * 2} ${h + pad * 2}`} className={styles.svg} role="img" aria-label="Framing plan, to scale">
        <polygon points={pts(outline)} className={styles.outline} strokeWidth={stroke} />
        {of("wall").map((m, i) => (
          <polygon key={`w${i}`} points={rect(m)} className={styles.wall} strokeWidth={stroke * 0.5} />
        ))}
        {has("bearers") &&
          of("bearer").map((m, i) => <polygon key={`b${i}`} points={rect(m)} className={styles.bearer} strokeWidth={stroke * 0.5} />)}
        {has("piles") &&
          frame.piles.map((p, i) => {
            const c = toPlan(p.u, p.v)
            return <rect key={`p${i}`} x={c.x - pile / 2} y={c.y - pile / 2} width={pile} height={pile} className={styles.pile} strokeWidth={stroke * 0.5} />
          })}
        {has("blocking") &&
          of("blocking", "nog").map((m, i) => <polygon key={`n${i}`} points={rect(m)} className={m.kind === "nog" ? styles.nog : styles.blocking} strokeWidth={stroke * 0.4} />)}
        {has("joists") &&
          of("joist", "rim").map((m, i) => <polygon key={`j${i}`} points={rect(m)} className={m.kind === "rim" ? styles.rim : styles.joist} strokeWidth={stroke * 0.4} />)}
        {has("bearers") &&
          of("ledger").map((m, i) => <polygon key={`l${i}`} points={rect(m)} className={styles.ledger} strokeWidth={stroke * 0.5} />)}
        {has("joists") &&
          hangerEnds &&
          joists.flatMap((j) =>
            [j.from, j.to].map((u, k) => {
              const a = toPlan(u + (k ? 0 : -25), j.at - j.thick)
              const b = toPlan(u + (k ? 25 : 0), j.at + j.thick)
              return <rect key={`h${j.at}-${k}`} x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} className={styles.hanger} />
            }),
          )}
        {has("sheets") &&
          frame.sheets.map((s, i) => (
            <polygon
              key={`s${i}`}
              points={pts([toPlan(s.u0, s.v0), toPlan(s.u0, s.v1), toPlan(s.u1, s.v1), toPlan(s.u1, s.v0)])}
              className={s.cut ? styles.sheetCut : styles.sheet}
              strokeWidth={stroke * 0.8}
            />
          ))}

        <text x={x0 + w / 2} y={y0 - font * 0.8} className={styles.dim} fontSize={font} textAnchor="middle">
          {(w / 1000).toFixed(2)} m
        </text>
        <text x={x0 - font * 0.8} y={y0 + h / 2} className={styles.dim} fontSize={font} textAnchor="middle" transform={`rotate(-90 ${x0 - font * 0.8} ${y0 + h / 2})`}>
          {(h / 1000).toFixed(2)} m
        </text>
        <text x={x0 + w / 2} y={y0 + h + font * 1.6} className={styles.dim} fontSize={font * 0.85} textAnchor="middle">
          Joists run {frame.joistAxis === "y" ? "up and down" : "across"} the plan, {((bounds.uMax - bounds.uMin) / 1000).toFixed(2)} m
        </text>
      </svg>

      <div className={styles.legend} role="group" aria-label="Layers shown">
        {layers.map((l) => (
          <label key={l} className={styles.layer}>
            <input type="checkbox" checked={has(l)} onChange={() => toggle(l)} />
            <span className={`${styles.swatch} ${styles[`sw_${l}`]}`} />
            {LAYER_LABELS[l]}
          </label>
        ))}
      </div>
    </div>
  )
}

export default FramePlanView
