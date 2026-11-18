"use client"

import { Pt, StairInput, StairResult } from "./stairs"
import styles from "./stairDiagrams.module.scss"

const pts = (poly: Pt[]) => poly.map((p) => `${p.x.toFixed(1)},${(-p.y).toFixed(1)}`).join(" ")

const DECK_SHOWN = 450 // how much of the deck to draw past the top riser
const JOIST_DEPTH = 190
const JOIST_THICKNESS = 45

/** Side elevation, to scale: ground, the straight stringer with its level
 * and plumb cuts, a wedge block under each tread, and every decking board
 * on the treads (ripped ones picked out) and risers, up to the deck. */
export const StairElevation: React.FC<{ input: StairInput; result: StairResult }> = ({ input, result }) => {
  const { rise: R, going: G, treads, risers, nosing } = result
  const t = input.boardThickness
  const H = input.totalRise
  const riserT = input.riserBoards ? t : 0
  const xTop = treads * G
  const front = -riserT - nosing

  const font = Math.max(H, xTop) * 0.032 + 14
  const pad = font * 3.2
  const minX = front - pad
  const maxX = xTop + DECK_SHOWN + pad * 0.6
  const minY = -pad * 0.9 // below ground (positive y up, flipped in svg)
  const maxY = H + pad * 0.8
  const viewBox = `${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`
  const stroke = font * 0.07

  const treadRects = []
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
    }
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
        Deck
      </text>

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
          <line x1={0} y1={dimOffset} x2={xTop} y2={dimOffset} strokeWidth={stroke} />
          <line x1={0} y1={dimOffset - font * 0.4} x2={0} y2={dimOffset + font * 0.4} strokeWidth={stroke} />
          <line x1={xTop} y1={dimOffset - font * 0.4} x2={xTop} y2={dimOffset + font * 0.4} strokeWidth={stroke} />
          <text x={xTop / 2} y={dimOffset + font * 1.15} fontSize={font} className={styles.dimText} textAnchor="middle">
            {Math.round(result.totalRun)} run
          </text>
        </g>
      )}

      {/* one step's R and G */}
      {k > 0 && (
        <g className={styles.stepDim}>
          <text x={(k - 0.5) * G} y={-(k * R) - font * 0.5} fontSize={font * 0.85} textAnchor="middle" className={styles.dimText}>
            G {Math.round(G)}
          </text>
          <text
            x={(k - 1) * G - (input.riserBoards ? t : 0) - font * 0.3}
            y={-((k - 0.5) * R) + font * 0.3}
            fontSize={font * 0.85}
            textAnchor="end"
            className={styles.dimText}
          >
            R {Math.round(R)}
          </text>
        </g>
      )}
    </svg>
  )
}

/** Looking down on the stair: each tread's boards running across the
 * width, the stringers dashed underneath, the deck at the top. */
export const StairPlan: React.FC<{ input: StairInput; result: StairResult }> = ({ input, result }) => {
  const { going: G, treads, nosing } = result
  const W = input.width
  const riserT = input.riserBoards ? input.boardThickness : 0
  const xTop = treads * G
  const front = -riserT - nosing
  const font = Math.max(W, xTop) * 0.032 + 14
  const pad = font * 2.4
  const minX = front - pad
  const maxX = xTop + 300 + pad * 0.5
  const viewBox = `${minX} ${-pad} ${maxX - minX} ${W + pad * 2.2}`
  const stroke = font * 0.07

  const stacked = input.framing === "stacked-frames"
  const outer = input.framing === "outer-stringers"
  const supportStart = stacked ? 0 : result.stringer.toeX
  const b = input.stringerThickness
  const stringerLines = outer ? [result.supports.positions[0], result.supports.positions.at(-1)!] : result.supports.positions

  const boards = []
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
    }
  }

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
    </svg>
  )
}

export const DiagramLegend: React.FC<{ riserBoards: boolean; hasRip: boolean; stacked: boolean; outer: boolean }> = ({
  riserBoards,
  hasRip,
  stacked,
  outer,
}) => (
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
    {hasRip && (
      <li>
        <span className={`${styles.swatch} ${styles.boardRipped}`} /> Ripped board
      </li>
    )}
  </ul>
)
