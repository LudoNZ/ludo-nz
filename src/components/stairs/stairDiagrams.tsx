"use client"

import DiagramExplorer, { ExploreState } from "@/components/diagramExplorer/diagramExplorer"
import { POST_EMBED, POST_SIZE, Pt, StairInput, StairResult } from "./stairs"
import styles from "./stairDiagrams.module.scss"

const pts = (poly: Pt[]) => poly.map((p) => `${p.x.toFixed(1)},${(-p.y).toFixed(1)}`).join(" ")

/** Zoomed in (full screen), more is drawn: how big a thing of `sizeMm`
 * shows, as a share of the drawing's width, decides what's worth adding.
 * Each layer fades in between its two shares. */
export const STAIR_DETAIL: Record<"steps" | "running" | "boards", [number, number]> = {
  // each step's number
  steps: [0.09, 0.13],
  // each step's height and run from the first step
  running: [0.12, 0.17],
  // each board's width
  boards: [0.05, 0.075],
}

/** 0 → 1 as a thing of `sizeMm` grows on screen past a detail's shares;
 * always 0 when it isn't zoomed in */
export const detailRamp = (zoom: number, viewWidth: number) => {
  const zoomedIn = Math.min(1, Math.max(0, (zoom - 1) / 0.25))
  return (sizeMm: number, [lo, hi]: [number, number]) => zoomedIn * Math.min(1, Math.max(0, ((sizeMm * zoom) / viewWidth - lo) / (hi - lo)))
}

const mm = (v: number) => Math.round(v).toLocaleString("en-NZ")

const DECK_SHOWN = 450 // how much of the deck to draw past the top riser
const JOIST_DEPTH = 190
const JOIST_THICKNESS = 45

/** Side elevation, to scale: ground, the straight stringer with its level
 * and plumb cuts, a wedge block under each tread, and every decking board
 * on the treads (ripped ones picked out) and risers, up to the deck. */
export const StairElevation: React.FC<{
  input: StairInput
  result: StairResult
  /** what the stair climbs onto (default "Deck") */
  topLabel?: string
}> = ({ input, result, topLabel = "Deck" }) => {
  const { rise: R, going: G, treads, risers, nosing } = result
  const t = input.boardThickness
  const H = input.totalRise
  const riserT = input.riserBoards ? t : 0
  const xTop = treads * G
  const front = -riserT - nosing

  const baseFont = Math.max(H, xTop) * 0.032 + 14
  const pad = baseFont * 3.2
  const minX = front - pad
  const maxX = xTop + DECK_SHOWN + pad * 0.6
  // below ground (positive y up, flipped in svg) — deeper when there are
  // posts to show their footings
  const hasPosts = result.stringer.posts.length > 0
  const minY = hasPosts ? -(POST_EMBED + baseFont * 2.6) : -pad * 0.9
  const maxY = H + pad * 0.8
  const viewBox = `${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`

  // zoomed in, text and lines stay the same size on screen (the stair
  // grows under them), and each step's numbers fade in
  const draw = ({ zoom }: ExploreState) => {
    const font = baseFont / zoom
    const stroke = font * 0.07
    const ramp = detailRamp(zoom, maxX - minX)
    const stepShow = ramp(G, STAIR_DETAIL.steps)
    const runShow = ramp(G, STAIR_DETAIL.running)
    const boardShow = ramp(Math.min(...result.treadBoards.map((b) => b.width), G), STAIR_DETAIL.boards)
    const tagFont = font * 0.8

    const treadRects = []
    const boardTags = []
    for (let i = 1; i <= treads; i++) {
      const x0 = (i - 1) * G + front
      for (const b of result.treadBoards) {
        treadRects.push(
          <rect
            key={`t${i}-${b.offset}`}
            x={x0 + b.offset}
            y={-(i * R)}
            width={b.width}
            height={t}
            className={b.ripped ? styles.boardRipped : styles.board}
            strokeWidth={stroke}
          />,
        )
        if (boardShow > 0)
          boardTags.push(
            <text
              key={`bt${i}-${b.offset}`}
              x={x0 + b.offset + b.width / 2}
              y={-(i * R) + t + tagFont * 1.05}
              fontSize={tagFont * 0.85}
              textAnchor="middle"
              className={b.ripped ? styles.boardTagRipped : styles.boardTag}
              opacity={boardShow}
            >
              {mm(b.width)}
            </text>,
          )
      }
    }

    // each step: its number, and (closer in) how high its tread is and how
    // far its nosing is from the first step's, both from the bottom
    const stepTags = []
    if (stepShow > 0)
      for (let i = 1; i <= treads; i++) {
        const x = (i - 1) * G + front
        const y = -(i * R) - tagFont * 0.45
        stepTags.push(
          <g key={`st${i}`} className={styles.stepTag}>
            {runShow > 0 && (
              <>
                <line x1={x} y1={-(i * R)} x2={x} y2={-(i * R) - tagFont * 3.2 * runShow} strokeWidth={stroke} opacity={runShow} />
                <text x={x + tagFont * 0.3} y={y - tagFont * 1.15} fontSize={tagFont} opacity={runShow} className={styles.stepRunning}>
                  ↑ {mm(i * R)}
                </text>
                <text x={x + tagFont * 0.3} y={y} fontSize={tagFont} opacity={runShow} className={styles.stepRunning}>
                  → {mm((i - 1) * G)}
                </text>
              </>
            )}
            <text
              x={x + G / 2}
              y={-((i - 1) * R) - R * 0.45}
              fontSize={tagFont * 1.1}
              textAnchor="middle"
              dominantBaseline="middle"
              className={styles.stepNumber}
              opacity={stepShow}
            >
              {i}
            </text>
          </g>,
        )
      }

    const riserRects = []
    if (input.riserBoards) {
      for (let j = 1; j <= risers; j++) {
        const x = (j - 1) * G - t
        const base = (j - 1) * R
        for (const b of result.riserBoardPieces) {
          riserRects.push(
            <rect
              key={`r${j}-${b.offset}`}
              x={x}
              y={-(base + b.offset + b.width)}
              width={t}
              height={b.width}
              className={b.ripped ? styles.boardRipped : styles.board}
              strokeWidth={stroke}
            />,
          )
        }
      }
    }

    // deck: boundary joist face is where the stringers plumb-cut against
    const deckBoardX = xTop - riserT - nosing
    const groundHatch = []
    for (let x = minX; x < maxX; x += font * 1.2) {
      groundHatch.push(<line key={x} x1={x} y1={0} x2={x - font * 0.8} y2={font * 0.8} className={styles.hatch} strokeWidth={stroke} />)
    }

    // dimension: one rise and going on the second tread (or first)
    const k = Math.min(2, treads)
    const dimOffset = font * 1.6
    // run dimension drops below any post footings
    const runDimY = hasPosts ? POST_EMBED + font * 0.8 : dimOffset

    return (
        <svg viewBox={viewBox} className={styles.svg} role="img" aria-label="Stair side elevation, to scale">
          {/* ground */}
          {groundHatch}
          <line x1={minX} y1={0} x2={maxX} y2={0} className={styles.ground} strokeWidth={stroke * 2} />

          {/* deck */}
          <rect
            x={xTop}
            y={-(H - t)}
            width={JOIST_THICKNESS}
            height={JOIST_DEPTH}
            className={styles.deckFrame}
            strokeWidth={stroke}
          />
          {/* packing/trimmer under the joist where the stringer's plumb cut
              hangs below it — something solid to bolt the stringer top to */}
          {result.stringer.plumbCutHeight > 0 && result.stringer.polygon.length > 0 && (() => {
            const joistBottom = H - t - JOIST_DEPTH
            const plumbBottom = Math.max(0, result.rise * treads - t - result.stringer.plumbCutHeight)
            return plumbBottom < joistBottom ? (
              <rect
                x={xTop}
                y={-joistBottom}
                width={JOIST_THICKNESS}
                height={joistBottom - plumbBottom}
                className={styles.packing}
                strokeWidth={stroke}
              />
            ) : null
          })()}
          <rect x={xTop + JOIST_THICKNESS} y={-(H - t)} width={DECK_SHOWN} height={JOIST_DEPTH * 0.6} className={styles.deckFrameFaint} />
          <rect x={deckBoardX} y={-H} width={xTop + DECK_SHOWN + JOIST_THICKNESS - deckBoardX} height={t} className={styles.deckBoard} strokeWidth={stroke} />
          <text x={xTop + JOIST_THICKNESS + DECK_SHOWN / 2} y={-H - font * 0.6} fontSize={font} className={styles.label} textAnchor="middle">
            {topLabel}
          </text>

          {/* support posts part way up, set in concrete below ground */}
          {result.stringer.posts.map((p) => (
            <g key={`post${p.x}`}>
              <rect
                x={p.x - POST_SIZE}
                y={0}
                width={POST_SIZE * 2}
                height={POST_EMBED}
                className={styles.footing}
                strokeWidth={stroke}
              />
              <rect
                x={p.x - POST_SIZE / 2}
                y={-p.height}
                width={POST_SIZE}
                height={p.height + POST_EMBED - 50}
                className={styles.post}
                strokeWidth={stroke}
              />
            </g>
          ))}

          {/* stringer */}
          {result.stringer.polygon.length > 0 && (
            <polygon points={pts(result.stringer.polygon)} className={styles.stringer} strokeWidth={stroke} />
          )}

          {/* wedge blocks */}
          {result.wedges.polygons.map((poly, i) => (
            <polygon key={i} points={pts(poly)} className={styles.wedge} strokeWidth={stroke} />
          ))}

          {/* stacked step frames: each box's side joist, with the front and
              back rails in section at its ends */}
          {result.frames.list.map((f) => (
            <g key={f.step}>
              <rect x={f.x0} y={-f.y1} width={f.depth} height={f.height} className={styles.stringer} strokeWidth={stroke} />
              <rect
                x={f.x0}
                y={-f.y1}
                width={input.stringerThickness}
                height={f.height}
                className={styles.wedge}
                strokeWidth={stroke}
              />
              <rect
                x={f.x1 - input.stringerThickness}
                y={-f.y1}
                width={input.stringerThickness}
                height={f.height}
                className={styles.wedge}
                strokeWidth={stroke}
              />
            </g>
          ))}

          {/* outer-stringer type: riser joists end on and nogs, behind the
              near stringer (so drawn see-through, dashed) */}
          {result.riserJoists.nogs
            .filter((n, i, all) => all.findIndex((m) => m.tread === n.tread) === i)
            .map((n) => (
              <rect
                key={`nog${n.tread}`}
                x={n.x0}
                y={-n.y1}
                width={n.x1 - n.x0}
                height={n.y1 - n.y0}
                className={styles.nog}
                strokeWidth={stroke}
              />
            ))}
          {result.riserJoists.list.map((j) => (
            <rect
              key={`rj${j.index}`}
              x={j.x0}
              y={-j.y1}
              width={j.x1 - j.x0}
              height={j.height}
              className={styles.riserJoist}
              strokeWidth={stroke}
            />
          ))}

          {riserRects}
          {treadRects}
          {boardTags}
          {stepTags}

          {/* total rise, in front of the bottom step */}
          <g className={styles.dim}>
            <line x1={front - dimOffset} y1={0} x2={front - dimOffset} y2={-H} strokeWidth={stroke} />
            <line x1={front - dimOffset - font * 0.4} y1={-H} x2={front - dimOffset + font * 0.4} y2={-H} strokeWidth={stroke} />
            <line x1={front - dimOffset - font * 0.4} y1={0} x2={front - dimOffset + font * 0.4} y2={0} strokeWidth={stroke} />
            <text
              x={front - dimOffset - font * 0.5}
              y={-H / 2}
              fontSize={font}
              className={styles.dimText}
              textAnchor="middle"
              transform={`rotate(-90 ${front - dimOffset - font * 0.5} ${-H / 2})`}
            >
              {Math.round(H)} rise
            </text>
          </g>

          {/* total run, below ground */}
          {treads > 0 && (
            <g className={styles.dim}>
              <line x1={0} y1={runDimY} x2={xTop} y2={runDimY} strokeWidth={stroke} />
              <line x1={0} y1={runDimY - font * 0.4} x2={0} y2={runDimY + font * 0.4} strokeWidth={stroke} />
              <line x1={xTop} y1={runDimY - font * 0.4} x2={xTop} y2={runDimY + font * 0.4} strokeWidth={stroke} />
              <text x={xTop / 2} y={runDimY + font * 1.15} fontSize={font} className={styles.dimText} textAnchor="middle">
                {Math.round(result.totalRun)} total run
              </text>
            </g>
          )}

          {/* one step's R and G */}
          {/* (zoomed in, every step's own numbers take over) */}
          {k > 0 && runShow < 1 && (
            <g className={styles.stepDim} opacity={1 - runShow}>
              <text x={(k - 0.5) * G} y={-(k * R) - font * 0.5} fontSize={font * 0.85} textAnchor="middle" className={styles.dimText}>
                Run {Math.round(G)}
              </text>
              <text
                x={(k - 1) * G - (input.riserBoards ? t : 0) - font * 0.3}
                y={-((k - 0.5) * R) + font * 0.3}
                fontSize={font * 0.85}
                textAnchor="end"
                className={styles.dimText}
              >
                Rise {Math.round(R)}
              </text>
            </g>
          )}
        </svg>
    )
  }

  return <DiagramExplorer label="Side view">{draw}</DiagramExplorer>
}

/** Looking down on the stair: each tread's boards running across the
 * width, the stringers dashed underneath, the deck at the top. */
export const StairPlan: React.FC<{ input: StairInput; result: StairResult }> = ({ input, result }) => {
  const { going: G, treads, nosing } = result
  const W = input.width
  const riserT = input.riserBoards ? input.boardThickness : 0
  const xTop = treads * G
  const front = -riserT - nosing
  const baseFont = Math.max(W, xTop) * 0.032 + 14
  const pad = baseFont * 2.4
  const minX = front - pad
  const maxX = xTop + 300 + pad * 0.5
  const viewBox = `${minX} ${-pad} ${maxX - minX} ${W + pad * 2.2}`

  const draw = ({ zoom }: ExploreState) => {
    const font = baseFont / zoom
    const stroke = font * 0.07
    const ramp = detailRamp(zoom, maxX - minX)
    const stepShow = ramp(G, STAIR_DETAIL.steps)
    const runShow = ramp(G, STAIR_DETAIL.running)
    const boardShow = ramp(Math.min(...result.treadBoards.map((b) => b.width), G), STAIR_DETAIL.boards)
    const tagFont = font * 0.8

    const stacked = input.framing === "stacked-frames"
    const outer = input.framing === "outer-stringers"
    const supportStart = stacked ? 0 : result.stringer.toeX
    const b = input.stringerThickness
    const stringerLines = outer ? [result.supports.positions[0], result.supports.positions.at(-1)!] : result.supports.positions

    const boards = []
    const tags = []
    for (let i = 1; i <= treads; i++) {
      const x0 = (i - 1) * G + front
      for (const b of result.treadBoards) {
        boards.push(
          <rect
            key={`${i}-${b.offset}`}
            x={x0 + b.offset}
            y={0}
            width={b.width}
            height={W}
            className={b.ripped ? styles.boardRipped : styles.board}
            strokeWidth={stroke}
          />,
        )
        // each board's width, along it near the far edge
        if (boardShow > 0) {
          const bx = x0 + b.offset + b.width / 2
          const by = W * 0.82
          tags.push(
            <text
              key={`bw${i}-${b.offset}`}
              x={bx}
              y={by}
              fontSize={tagFont * 0.85}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(-90 ${bx} ${by})`}
              className={styles.planLabel}
              strokeWidth={tagFont * 0.15}
              opacity={boardShow}
            >
              {mm(b.width)}
              {b.ripped ? " rip" : ""}
            </text>,
          )
        }
      }
      // the step's number in the middle of its tread, and its nosing's
      // distance from the first step's (and its height) at the near edge
      if (stepShow > 0)
        tags.push(
          <g key={`st${i}`}>
            <text
              x={x0 + G / 2}
              y={W / 2}
              fontSize={tagFont * 1.3}
              textAnchor="middle"
              dominantBaseline="middle"
              className={styles.planLabel}
              strokeWidth={tagFont * 0.2}
              opacity={stepShow}
            >
              {i}
            </text>
            {runShow > 0 && (
              <>
                <line x1={x0} y1={-tagFont * 0.2} x2={x0} y2={-tagFont * 2.3} className={styles.stepTick} strokeWidth={stroke} opacity={runShow} />
                <text x={x0 + tagFont * 0.25} y={-tagFont * 1.55} fontSize={tagFont} className={styles.stepRunning} opacity={runShow}>
                  ↑ {mm(i * result.rise)}
                </text>
                <text x={x0 + tagFont * 0.25} y={-tagFont * 0.45} fontSize={tagFont} className={styles.stepRunning} opacity={runShow}>
                  → {mm((i - 1) * G)}
                </text>
              </>
            )}
          </g>,
        )
    }
    // each stringer's centre from the near edge, at the bottom of the stair
    if (runShow > 0)
      stringerLines.forEach((y, n) =>
        tags.push(
          <text
            key={`sy${n}`}
            x={front - tagFont * 0.4}
            y={y}
            fontSize={tagFont * 0.85}
            textAnchor="end"
            dominantBaseline="middle"
            className={styles.stepRunning}
            opacity={runShow}
          >
            {mm(y)}
          </text>,
        ),
      )

    return (
        <svg viewBox={viewBox} className={`${styles.svg} ${styles.planSvg}`} role="img" aria-label="Stair plan view, to scale">
          <rect x={xTop - riserT - nosing} y={-pad * 0.4} width={maxX - xTop} height={W + pad * 0.8} className={styles.deckBoard} />
          <text x={xTop + 150} y={W / 2} fontSize={font} className={styles.label} textAnchor="middle" dominantBaseline="middle">
            Deck
          </text>
          {boards}
          {result.riserJoists.list.map((j) => (
            <rect
              key={`rj${j.index}`}
              x={j.x0}
              y={b}
              width={j.x1 - j.x0}
              height={W - 2 * b}
              className={styles.stringerHidden}
              strokeWidth={stroke}
            />
          ))}
          {result.riserJoists.nogs.map((n, i) => {
            const lines = result.riserJoists.nogLines
            const y = lines[i % lines.length]
            return (
              <rect
                key={`nog${i}`}
                x={n.x0}
                y={y - b / 2}
                width={n.x1 - n.x0}
                height={b}
                className={styles.stringerHidden}
                strokeWidth={stroke}
              />
            )
          })}
          {stringerLines.map((y) => (
            <rect
              key={y}
              x={supportStart}
              y={y - input.stringerThickness / 2}
              width={xTop - supportStart}
              height={input.stringerThickness}
              className={styles.stringerHidden}
              strokeWidth={stroke}
            />
          ))}
          <text x={(front + xTop) / 2} y={W + pad * 1.2} fontSize={font} className={styles.dimText} textAnchor="middle">
            {Math.round(W)} wide · {outer
              ? `2 stringers, nogs between at ${Math.round(result.supports.spacing)} centres`
              : `${result.supports.count} ${stacked ? "joists per frame" : "stringers"} at ${Math.round(result.supports.spacing)} centres`}
          </text>
          {tags}
        </svg>
    )
  }

  return <DiagramExplorer label="Plan, from above">{draw}</DiagramExplorer>
}

export const DiagramLegend: React.FC<{
  riserBoards: boolean
  hasRip: boolean
  stacked: boolean
  outer: boolean
  posts?: boolean
  angled?: boolean
}> = ({ riserBoards, hasRip, stacked, outer, posts, angled }) => (
  <ul className={styles.legend}>
    <li>
      <span className={`${styles.swatch} ${styles.stringer}`} /> {stacked ? "Frame side joists" : "Stringer"}
    </li>
    <li>
      <span className={`${styles.swatch} ${styles.wedge}`} /> {stacked ? "Front & back rails" : "Wedge blocks"}
    </li>
    {outer && (
      <li>
        <span className={`${styles.swatch} ${styles.riserJoist}`} /> Riser joists &amp; nogs (behind the stringer)
      </li>
    )}
    <li>
      <span className={`${styles.swatch} ${styles.board}`} /> {riserBoards ? "Tread & riser boards" : "Tread boards"}
    </li>
    {posts && (
      <li>
        <span className={`${styles.swatch} ${styles.post}`} /> Support posts (in concrete)
      </li>
    )}
    {angled && (
      <li>
        <span className={`${styles.swatch} ${styles.boardTapered}`} /> Angled cut
      </li>
    )}
    {hasRip && (
      <li>
        <span className={`${styles.swatch} ${styles.boardRipped}`} /> Ripped board
      </li>
    )}
  </ul>
)
