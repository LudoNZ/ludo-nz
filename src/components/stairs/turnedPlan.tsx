"use client"

import DiagramExplorer, { ExploreState, screenPx } from "@/components/diagramExplorer/diagramExplorer"
import { POST_SIZE, Pt, StairInput } from "./stairs"
import { StairLayout, Strip } from "./layout"
import { detailRamp, STAIR_DETAIL } from "./stairDiagrams"
import styles from "./stairDiagrams.module.scss"

const pts = (poly: Pt[]) => poly.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const centroid = (poly: Pt[]): Pt => ({
  x: poly.reduce((a, p) => a + p.x, 0) / poly.length,
  y: poly.reduce((a, p) => a + p.y, 0) / poly.length,
})

const boardClass = (s: Strip) => (s.ripped ? styles.boardRipped : s.tapered ? styles.boardTapered : styles.board)

/** The whole turned stair from above, to scale: every flight's tread
 * boards, the landings and winders with their (tapered) boards, the
 * stringers / joists dashed underneath, posts, the levels at each turn,
 * and the deck it climbs to. */
const TurnedPlan: React.FC<{ input: StairInput; layout: StairLayout }> = ({ input, layout }) => {
  const { bbox } = layout
  const span = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY)
  const baseFont = span * 0.028 + 14
  const pad = baseFont * 2.5
  const viewW = bbox.maxX - bbox.minX + pad * 2
  const viewBox = `${bbox.minX - pad} ${bbox.minY - pad} ${viewW} ${bbox.maxY - bbox.minY + pad * 2}`
  const b = input.stringerThickness

  const [dA, dB] = layout.deckEdge
  const dd = layout.deckDir
  const deckPoly = [dA, dB, { x: dB.x + dd.x * 400, y: dB.y + dd.y * 400 }, { x: dA.x + dd.x * 400, y: dA.y + dd.y * 400 }]

  const first = layout.flights[0]
  const arrowFrom = first ? mid(first.startL, first.startR) : { x: 0, y: 0 }
  const arrowLen = Math.min(input.going * 1.5, 500)
  const arrowTo = first ? { x: arrowFrom.x + first.dir.x * arrowLen, y: arrowFrom.y + first.dir.y * arrowLen } : arrowFrom

  // every step bottom to top — flight treads, landings and winders — with
  // where it sits, how high it is, and how far its front is from the
  // first step's along the walking line (the middle of the width)
  const steps = [
    ...layout.flights.flatMap((f) =>
      f.treadPolys.map((poly, j) => ({ riser: f.baseRiser + j + 1, at: centroid(poly), height: f.baseHeight + (j + 1) * f.sub.rise, going: f.sub.going })),
    ),
    ...layout.turns.flatMap((t) => t.regions.map((r) => ({ riser: r.riser, at: centroid(r.poly), height: r.height, going: r.going }))),
  ].sort((a, b) => a.riser - b.riser)
  let walked = 0
  const placedSteps = steps.map((st, n) => {
    const from = walked
    walked += st.going
    return { ...st, n: n + 1, from }
  })
  const typicalGoing = layout.flights.find((f) => f.treads > 0)?.sub.going ?? input.going

  const draw = (view: ExploreState) => {
    const { zoom } = view
    // zoomed in, text keeps a readable size on screen (a phone shows the
    // drawing much smaller than a desktop) — the fitted view's as it was
    const toPx = screenPx(view, viewW, bbox.maxY - bbox.minY + pad * 2)
    const zoomedIn = Math.min(1, Math.max(0, (zoom - 1) / 0.4))
    const font = Math.max(baseFont / zoom, toPx(17) * zoomedIn)
    const stroke = font * 0.06
    const ramp = detailRamp(zoom, viewW)
    const stepShow = ramp(typicalGoing, STAIR_DETAIL.steps)
    const runShow = ramp(typicalGoing, STAIR_DETAIL.running)
    const tagFont = Math.max(font * 0.8, toPx(16))

    return (
        <svg viewBox={viewBox} className={`${styles.svg} ${styles.turnedSvg}`} role="img" aria-label="Stair plan view, to scale">
          <defs>
            <marker id="stairUpArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" className={styles.arrowHead} />
            </marker>
          </defs>

          {/* deck */}
          <polygon points={pts(deckPoly)} className={styles.deckBoard} />
          <text {...centroid(deckPoly)} fontSize={font} className={styles.label} textAnchor="middle" dominantBaseline="middle">
            Deck
          </text>

          {/* turns: outline, boards, winder lines */}
          {layout.turns.map((t) => (
            <g key={`turn${t.index}`}>
              <polygon points={pts(t.polygon)} className={styles.turnFill} strokeWidth={stroke} />
              {t.regions.map((r, ri) =>
                r.boards.map((s, si) => (
                  <polygon key={`${ri}-${si}`} points={pts(s.poly)} className={boardClass(s)} strokeWidth={stroke} />
                )),
              )}
              {t.spec.kind === "winders" &&
                t.regions.map((r, ri) => (
                  <line
                    key={`ray${ri}`}
                    x1={r.frontA.x}
                    y1={r.frontA.y}
                    x2={r.frontB.x}
                    y2={r.frontB.y}
                    className={styles.riserLine}
                    strokeWidth={stroke * 2}
                  />
                ))}
            </g>
          ))}

          {/* flights: boards */}
          {layout.flights.map((f) =>
            f.boards.map((s, si) => (
              <polygon key={`f${f.index}-${si}`} points={pts(s.poly)} className={boardClass(s)} strokeWidth={stroke} />
            )),
          )}

          {/* stringers / joists under each flight, dashed on top */}
          {layout.flights.map((f) =>
            f.supportLines.map(([p, q], i) => (
              <line
                key={`s${f.index}-${i}`}
                x1={p.x}
                y1={p.y}
                x2={q.x}
                y2={q.y}
                className={styles.stringerLine}
                strokeWidth={b}
              />
            )),
          )}

          {/* posts: under turns, and span posts under flights */}
          {[...layout.turns.flatMap((t) => t.posts.map((p) => p.p)), ...layout.flights.flatMap((f) => f.posts)].map((p, i) => (
            <rect
              key={`post${i}`}
              x={p.x - POST_SIZE / 2}
              y={p.y - POST_SIZE / 2}
              width={POST_SIZE}
              height={POST_SIZE}
              className={styles.post}
              strokeWidth={stroke}
            />
          ))}

          {/* levels and labels */}
          {layout.turns.map((t) => (
            <text
              key={`lvl${t.index}`}
              {...centroid(t.polygon)}
              fontSize={font * 0.85}
              className={styles.planLabel}
                  strokeWidth={font * 0.15}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {t.spec.kind === "landing"
                ? `Landing +${Math.round(t.regions[0].height)}`
                : `${t.regions.length} winders`}
            </text>
          ))}
          {layout.flights
            .filter((f) => f.treads > 0)
            .map((f) => {
              const c = centroid([f.startL, f.startR, ...f.treadPolys[f.treadPolys.length - 1].slice(1, 3)])
              return (
                <text
                  key={`fl${f.index}`}
                  {...c}
                  fontSize={font * 0.85}
                  className={styles.planLabel}
                  strokeWidth={font * 0.15}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  Run {f.index + 1}
                </text>
              )
            })}

          {first && (
            <g>
              <line
                x1={arrowFrom.x}
                y1={arrowFrom.y}
                x2={arrowTo.x}
                y2={arrowTo.y}
                className={styles.upArrow}
                strokeWidth={stroke * 3}
                markerEnd="url(#stairUpArrow)"
              />
              <text
                x={arrowFrom.x - first.dir.x * font * 1.2}
                y={arrowFrom.y - first.dir.y * font * 1.2}
                fontSize={font}
                className={styles.dimText}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                UP
              </text>
            </g>
          )}

          {/* zoomed in: each step's number, then its height and its distance
              along the walking line from the first step */}
          {stepShow > 0 &&
            placedSteps.map((st) => (
              <g key={`step${st.riser}`} opacity={stepShow}>
                <text
                  x={st.at.x}
                  y={st.at.y - (runShow > 0 ? tagFont * 0.7 * runShow : 0)}
                  fontSize={tagFont * 1.3}
                  className={styles.planLabel}
                  strokeWidth={tagFont * 0.2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {st.n}
                </text>
                {runShow > 0 && (
                  <text
                    x={st.at.x}
                    y={st.at.y + tagFont * 0.75}
                    fontSize={tagFont * 0.8}
                    className={styles.planLabel}
                    strokeWidth={tagFont * 0.15}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    opacity={runShow}
                  >
                    ↑ {Math.round(st.height)} · → {Math.round(st.from)}
                  </text>
                )}
              </g>
            ))}
        </svg>
    )
  }

  return <DiagramExplorer label="Plan, from above">{draw}</DiagramExplorer>
}

export default TurnedPlan
