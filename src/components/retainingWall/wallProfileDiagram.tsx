"use client"

import DiagramExplorer, { ExploreState, screenPx } from "@/components/diagramExplorer/diagramExplorer"
import { useId, useMemo } from "react"
import { bayCourseLayout, BoardHighlight, WallProfile } from "./postProfile"
import { segmentLabel } from "./wallPlan"
import { OBSTRUCTION_TYPES } from "./obstructions"
import { CalcSettings, shortPostSize as shortSize } from "./calcSettings"
import styles from "./wallProfileDiagram.module.scss"

const formatLevel = (relativeM: number, rlDatumM: number): string =>
  rlDatumM !== 0 ? `RL ${(rlDatumM + relativeM).toFixed(3)}` : `${relativeM.toFixed(2)} m`

/** Interactive front elevation of a raked (or, with no control points set,
 * perfectly uniform) wall: sloped ground and top-of-wall lines through
 * every post's own level, each post drawn at its own height and embedment,
 * each bay's boards filling the (possibly sloped) area between its two
 * posts. Tap a post to select it — the caller owns what happens with that
 * (see retainingWallsPage.tsx's edit panel). `segmentIndex` narrows the
 * view to one straight run of the plan (corner post to corner post);
 * without it the whole wall is drawn unfolded flat, each run labelled.
 * `mirrored` flips the view left-to-right, for a wall whose face is seen
 * from the side that puts its start on the right. Retaining-wall specific
 * (reads a WallProfile, not the generic PostSpec/RailSpec), unlike the
 * structures/ components, since a raked profile has no single uniform
 * spec to describe it. */
/** Something from another calculator drawn on the elevation (a stair
 * coming down off the wall), seen from the low side: where it spans
 * along the wall and the levels it works to. */
export interface ElevationExtra {
  id: string
  segmentIndex: number
  /** m along the unfolded wall */
  fromXM: number
  toXM: number
  /** the wall's ground there, and where the stair finishes at the bottom
   * (higher where there's fill) and the top */
  groundM: number
  bottomM: number
  topM: number
  /** the top of each tread */
  treadLevelsM: number[]
  /** the point it's pinned to, m along the wall */
  fixedXM: number
  label: string
}

const EXTRA_COLOR = "#4f6378"
const FILL_COLOR = "#a0805a"
const EMPTY_EXTRAS: ElevationExtra[] = []

/** Zoomed in (full screen), more is drawn: how wide the narrowest bay
 * shows on screen, in px, decides what's worth adding. Each layer fades
 * in between its two widths. */
const DETAIL: Record<"tags" | "levels" | "courses", [number, number]> = {
  // each post's number, and how far it is from the start of its wall
  tags: [70, 100],
  // each post's top and ground level, and its hole's depth
  levels: [130, 170],
  // each bay's courses
  courses: [240, 300],
}
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const mm = (m: number) => `${Math.round(m * 1000)}`

/** about the font size the drawing will use, before its extent is known */
const fontGuess = (posts: { xM: number }[]) => Math.max(posts[posts.length - 1].xM - posts[0].xM, 1) * 0.045

const WallProfileDiagram: React.FC<{
  profile: WallProfile
  settings: CalcSettings
  topCapEnabled: boolean
  selectedIndex: number | null
  /** more posts picked out along with it — see "Select multiple" */
  selectedIndices?: number[]
  /** `additive` when shift/ctrl/cmd was held: add to the selection */
  onSelectPost: (index: number, additive: boolean) => void
  /** an obstruction to pick out, and what tapping one does */
  selectedObstructionId?: string | null
  onSelectObstruction?: (id: string) => void
  segmentIndex?: number | null
  mirrored?: boolean
  /** boards to pick out — the ones cut from a chosen length on the order */
  highlight?: BoardHighlight[]
  /** shown between the drawing and the legend — the selected post's
   * controls, right where it was picked */
  belowDrawing?: React.ReactNode
  /** things from other calculators in front of the wall (stairs) */
  extras?: ElevationExtra[]
  /** tapping one of them */
  onSelectExtra?: (id: string) => void
  selectedExtraId?: string | null
}> = ({ profile, settings, topCapEnabled, selectedIndex, selectedIndices = [], onSelectPost, selectedObstructionId = null, onSelectObstruction, segmentIndex = null, mirrored = false, highlight = [], belowDrawing, extras = EMPTY_EXTRAS, onSelectExtra, selectedExtraId = null }) => {
  const clipId = useId()
  const segment = segmentIndex !== null ? profile.segments[segmentIndex] : undefined
  const fromIndex = segment ? segment.startPostIndex : 0
  const toIndex = segment ? segment.endPostIndex : profile.posts.length - 1
  const inView = (postIndex: number) => postIndex >= fromIndex && postIndex <= toIndex
  // draw-space x: the unfolded distance along the wall, negated when the
  // view is mirrored (everything below is symmetric about a post's own
  // centre, so flipping the centres is all a mirror needs)
  const X = (xM: number) => (mirrored ? -xM : xM)

  const geometry = useMemo(() => {
    const posts = profile.posts.slice(fromIndex, toIndex + 1)
    const spanM = posts[posts.length - 1].xM - posts[0].xM
    // leave room above the highest post top for the optional top cap's
    // schematic sliver, same thickness used when actually drawing it
    const capThicknessM = topCapEnabled ? settings.boardCourseHeightM * 0.25 : 0
    const tops = posts.map((p) => p.topLevelM + capThicknessM)
    const fromX = posts[0].xM
    const toX = posts[posts.length - 1].xM
    const zonesHere = profile.obstructions.filter((z) => z.onWall && z.centreXM >= fromX - 1e-6 && z.centreXM <= toX + 1e-6)
    // room under the deepest hole, or the deepest obstruction's clearance
    const bottoms = [...posts.map((p) => p.groundLevelM - p.embedmentM), ...zonesHere.map((z) => z.groundLevelM - z.zoneBottomDepthM - fontGuess(posts) * 1.6)]
    const extrasHere = extras.filter((e) => segmentIndex === null || e.segmentIndex === segmentIndex)
    const maxTop = Math.max(...tops, ...extrasHere.map((e) => e.topM + fontGuess(posts) * 0.9))
    const minBottom = Math.min(...bottoms)
    const vExtent = Math.max(maxTop - minBottom, 0.5)
    const scale = Math.max(spanM, vExtent, 1)
    const fontSize = scale * 0.045
    const strokeW = scale * 0.006

    const padX = Math.max(...posts.map((p) => p.holeDiameterM / 2)) + fontSize * 8
    const padTop = fontSize * 2.5
    // room under the deepest hole for the post-spacing dimension line
    const padBottom = fontSize * 3.2

    const vbMinX = (mirrored ? -posts[posts.length - 1].xM : posts[0].xM) - padX
    const vbMinY = -(maxTop + padTop)
    const vbW = spanM + padX * 2
    const vbH = maxTop - minBottom + padTop + padBottom

    return { spanM, maxTop, minBottom, fontSize, strokeW, padX, viewBox: `${vbMinX} ${vbMinY} ${vbW} ${vbH}` }
  }, [profile, settings.boardCourseHeightM, topCapEnabled, fromIndex, toIndex, mirrored, extras, segmentIndex])
  const extrasHere = extras.filter((e) => segmentIndex === null || e.segmentIndex === segmentIndex)

  const { fontSize: baseFont, strokeW: baseStroke, viewBox, maxTop } = geometry
  const obstructionsHere = profile.obstructions.filter(
    (z) => z.onWall && z.centreXM >= profile.posts[fromIndex].xM - 1e-6 && z.centreXM <= profile.posts[toIndex].xM + 1e-6
  )
  const mixedSizes = new Set(profile.posts.filter((p) => !p.needsEngineer).map((p) => p.sizeLabel)).size > 1
  const { rlDatumM } = profile
  // `allPosts` stays the full list, since bays and joints refer to posts
  // by index; `posts`/`bays` are just what this view actually draws
  const allPosts = profile.posts
  const posts = allPosts.filter((p) => inView(p.index))
  const bays = profile.bays.filter((b) => inView(b.leftIndex) && inView(b.rightIndex))

  // SVG y grows downward, but "up" in the real world (higher level) should
  // draw higher on screen — flip every level into draw-space once here
  const y = (levelM: number) => -levelM

  // the top of the wall: straight between post tops, or — through a
  // stepped bay — a level run with a vertical at each post it steps at
  const topLinePoints = (() => {
    const pts: string[] = []
    posts.forEach((p, k) => {
      const before = bays.find((bay) => bay.rightIndex === p.index)
      const after = bays.find((bay) => bay.leftIndex === p.index)
      const x = X(p.xM)
      if (k > 0) pts.push(`${x},${y(before && before.stepTopM !== null ? before.stepTopM : p.topBeforeM)}`)
      if (k < posts.length - 1) pts.push(`${x},${y(after && after.stepTopM !== null ? after.stepTopM : p.topAfterM)}`)
    })
    return pts.join(" ")
  })()

  // full screen, zoomed in: text and lines stay the same size on screen
  // (and readable on a phone), and more detail comes in the closer it gets
  const [, , vbW, vbH] = viewBox.split(" ").map(Number)
  const minBayM = Math.min(...bays.map((bay) => bay.widthM), 100)
  /** a post's number (and size, when they're mixed), and how far it is
   * from the start of its wall — at a corner, both walls', a line each
   * (where it ends the one wall, then "B 0" for the one it starts) */
  const postTag = (p: (typeof posts)[number]) => {
    const runs = profile.segments.filter((g) => p.index >= g.startPostIndex && p.index <= g.endPostIndex)
    const running = runs.map((g) => (p.index === g.startPostIndex ? `${segmentLabel(g.index)} 0` : mm(p.xM - g.startXM)))
    return { name: mixedSizes ? `${p.index + 1} · ${shortSize(p.sizeLabel)}` : `${p.index + 1}`, running }
  }
  /** lines in the tallest post tag (number, then running distances) */
  const tagLines = Math.max(1, ...posts.map((p) => postTag(p).running.length)) + 1

  const draw = (view: ExploreState) => {
    const { zoom } = view
    const toPx = screenPx(view, vbW, vbH)
    const zoomedIn = clamp01((zoom - 1) / 0.4)
    const fontSize = Math.max(baseFont / zoom, toPx(17) * zoomedIn)
    const strokeW = baseStroke / zoom
    const tagFont = Math.max(fontSize * 0.7, toPx(16))
    // the narrowest bay's width on screen, in px
    const bayPx = toPx(1) ? minBayM / toPx(1) : 0
    const ramp = ([lo, hi]: [number, number]) => zoomedIn * clamp01((bayPx - lo) / (hi - lo))
    const tagShow = ramp(DETAIL.tags)
    const levelShow = ramp(DETAIL.levels)
    const courseShow = ramp(DETAIL.courses)
    return (
      <svg viewBox={viewBox} className={styles.svg} role="img" aria-label="Wall elevation profile, to scale">
        {/* bay board fill: level courses stacked from the ground, same as a
            real build — only the top course actually follows the rake */}
        {bays.map((bay) => {
          const a = allPosts[bay.leftIndex]
          const b = allPosts[bay.rightIndex]
          const ax = X(a.xM)
          const bx = X(b.xM)
          if (bay.needsEngineer) {
            const points = `${ax},${y(a.groundLevelM)} ${bx},${y(b.groundLevelM)} ${bx},${y(b.topBeforeM)} ${ax},${y(a.topAfterM)}`
            return <polygon key={`bay-${bay.leftIndex}`} points={points} className={styles.bayBlocked} strokeWidth={strokeW} />
          }
          const ch = settings.boardCourseHeightM
          // a stepped bay is whole level courses to a flat top; any other
          // bay follows the rake (cut to it, or with a raked top board)
          const layout =
            bay.stepTopM !== null
              ? {
                  baseLevelM: Math.min(a.groundLevelM, b.groundLevelM),
                  courseCount: bay.levelCourseCount,
                  undersideAM: bay.stepTopM,
                  undersideBM: bay.stepTopM,
                }
              : bayCourseLayout(a, b, ch, profile.rakedTopBoard)
          const { baseLevelM, undersideAM, undersideBM } = layout
          const capTopAM = bay.stepTopM ?? a.topAfterM
          const capTopBM = bay.stepTopM ?? b.topBeforeM
          // purely a schematic sliver on top of the top board — real
          // thickness isn't tracked (no calc setting for it), just enough
          // to read as a distinct capping layer at any wall scale
          const capThicknessM = ch * 0.25
          const bayClip = `${clipId}-bay-${bay.leftIndex}`
          return (
            <g key={`bay-${bay.leftIndex}`}>
              {/* level courses, each drawn full height and then clipped to
                  the top board's underside — so with a raked top board
                  the courses it crosses show cut down to suit */}
              <clipPath id={bayClip}>
                <polygon points={`${ax},${y(baseLevelM)} ${bx},${y(baseLevelM)} ${bx},${y(undersideBM)} ${ax},${y(undersideAM)}`} />
              </clipPath>
              <g clipPath={`url(#${bayClip})`}>
                {Array.from({ length: layout.courseCount }, (_, k) => (
                  <rect
                    key={k}
                    x={Math.min(ax, bx)}
                    y={y(baseLevelM + (k + 1) * ch)}
                    width={Math.abs(bx - ax)}
                    height={ch}
                    className={styles.bayFill}
                    strokeWidth={strokeW * 0.4}
                  />
                ))}
                {/* tint over the boards picked out from the order */}
                {Array.from({ length: layout.courseCount }, (_, k) => (
                  <rect
                    key={`hl-${k}`}
                    x={Math.min(ax, bx)}
                    y={y(baseLevelM + (k + 1) * ch)}
                    width={Math.abs(bx - ax)}
                    height={ch}
                    className={styles.boardHighlight}
                    visibility={
                      highlight.some((h) => h.layer === "course" && h.courseRow === k && h.startPost <= bay.leftIndex && bay.leftIndex < h.endPost)
                        ? "visible"
                        : "hidden"
                    }
                  />
                ))}
              </g>
              {/* top/perimeter board — the piece that follows the rake:
                  cut to it on top only, or (raked) a full board on the slope */}
              <polygon
                points={`${ax},${y(undersideAM)} ${bx},${y(undersideBM)} ${bx},${y(capTopBM)} ${ax},${y(capTopAM)}`}
                className={styles.topBoardFill}
                strokeWidth={strokeW * 0.4}
              />
              {highlight.some((h) => h.layer === "topBoard" && h.startPost <= bay.leftIndex && bay.leftIndex < h.endPost) && (
                <polygon
                  points={`${ax},${y(undersideAM)} ${bx},${y(undersideBM)} ${bx},${y(capTopBM)} ${ax},${y(capTopAM)}`}
                  className={styles.boardHighlight}
                />
              )}
              {topCapEnabled && (
                <polygon
                  points={`${ax},${y(capTopAM)} ${bx},${y(capTopBM)} ${bx},${y(capTopBM + capThicknessM)} ${ax},${y(capTopAM + capThicknessM)}`}
                  className={styles.topCapFill}
                  strokeWidth={strokeW * 0.3}
                />
              )}
            </g>
          )
        })}

        {/* obstructions in the ground: the clearance zone dashed round it,
            the thing itself (stretched along the wall when it crosses at
            an angle), and for the one picked out, how far it is from the
            end it's measured from */}
        {obstructionsHere.map((z) => {
          const o = z.obstruction
          const type = OBSTRUCTION_TYPES[o.type]
          const cx = X(z.centreXM)
          const g = z.groundLevelM
          const picked = o.id === selectedObstructionId
          const seg = profile.segments[o.segmentIndex]
          const endX = o.from === "start" ? seg.startXM : seg.endXM
          const dimY = y(g - z.zoneBottomDepthM) + fontSize * 0.7
          const label = o.label || type.label
          return (
            <g
              key={`ob-${o.id}`}
              className={styles.obstruction}
              onClick={() => onSelectObstruction?.(o.id)}
              role={onSelectObstruction ? "button" : undefined}
              aria-label={`${label}, ${o.distanceM.toFixed(2)} m along — tap to pick it out`}
            >
              <rect
                x={cx - z.zoneHalfM}
                y={y(g - z.zoneTopDepthM)}
                width={z.zoneHalfM * 2}
                height={z.zoneBottomDepthM - z.zoneTopDepthM}
                fill={type.color}
                fillOpacity={picked ? 0.22 : 0.12}
                stroke={type.color}
                strokeWidth={strokeW * (picked ? 0.8 : 0.5)}
                strokeDasharray={`${strokeW * 2} ${strokeW * 1.5}`}
              />
              {type.shape === "round" ? (
                <ellipse cx={cx} cy={y(g - o.depthM - o.sizeM / 2)} rx={z.coreHalfM} ry={o.sizeM / 2} fill={type.color} />
              ) : (
                <rect x={cx - z.coreHalfM} y={y(g - o.depthM)} width={z.coreHalfM * 2} height={o.sizeM} fill={type.color} />
              )}
              {picked ? (
                <g>
                  <line x1={X(endX)} x2={cx} y1={dimY} y2={dimY} stroke={type.color} strokeWidth={strokeW * 0.5} />
                  <line x1={X(endX)} x2={X(endX)} y1={dimY - fontSize * 0.3} y2={dimY + fontSize * 0.3} stroke={type.color} strokeWidth={strokeW * 0.5} />
                  <line x1={cx} x2={cx} y1={dimY - fontSize * 0.3} y2={dimY + fontSize * 0.3} stroke={type.color} strokeWidth={strokeW * 0.5} />
                  <text x={(X(endX) + cx) / 2} y={dimY + fontSize * 0.9} fontSize={fontSize * 0.6} textAnchor="middle" fill={type.color}>
                    {label} · {Math.round(o.distanceM * 1000)}
                  </text>
                </g>
              ) : (
                <text x={cx} y={dimY + fontSize * 0.2} fontSize={fontSize * 0.5} textAnchor="middle" fill={type.color}>
                  {label}
                </text>
              )}
            </g>
          )
        })}

        {/* holes, drawn before posts so each post sits in front of its own fill */}
        {posts.map((p) => (
          <rect
            key={`hole-${p.index}`}
            x={X(p.xM) - p.holeDiameterM / 2}
            y={y(p.groundLevelM)}
            width={p.holeDiameterM}
            height={p.embedmentM}
            rx={p.holeDiameterM * 0.15}
            className={p.clashesWith.length ? styles.holeClash : styles.hole}
          />
        ))}

        {/* posts: above and embedded portions, stopping short of the hole
            floor by the gravel base pad and any stand-off under the post */}
        {posts.map((p) => {
          const postDepthM = p.postDepthM
          const cls = p.needsEngineer ? styles.postBlocked : styles.postAbove
          const px = X(p.xM)
          return (
            <g key={`post-${p.index}`}>
              <rect x={px - p.widthM / 2} y={y(p.topLevelM)} width={p.widthM} height={p.retainedHeightM} className={cls} />
              <rect
                x={px - p.widthM / 2}
                y={y(p.groundLevelM)}
                width={p.widthM}
                height={postDepthM}
                className={p.needsEngineer ? styles.postBlocked : styles.postBelow}
                strokeWidth={strokeW * 0.5}
              />
              {p.isControlPoint && (
                <circle cx={px} cy={y(p.topLevelM)} r={strokeW * 3} strokeWidth={strokeW * 0.5} className={styles.controlDot} />
              )}
              {p.depthSet && (
                <circle
                  cx={px}
                  cy={y(p.groundLevelM - p.embedmentM)}
                  r={strokeW * 3}
                  strokeWidth={strokeW * 0.5}
                  className={p.depthSet === "rake" ? styles.depthDotRake : styles.depthDotLone}
                />
              )}
              {/* pinned at a set distance: a pin head over the post */}
              {p.fixed && (
                <path
                  d={`M ${px} ${y(p.groundLevelM) + fontSize * 0.05} l ${-fontSize * 0.25} ${fontSize * 0.45} h ${fontSize * 0.5} z`}
                  className={styles.fixedMark}
                  strokeWidth={strokeW * 0.4}
                />
              )}
              {p.isCorner && (
                <rect
                  x={px - strokeW * 3}
                  y={y(p.groundLevelM) - strokeW * 3}
                  width={strokeW * 6}
                  height={strokeW * 6}
                  transform={`rotate(45 ${px} ${y(p.groundLevelM)})`}
                  strokeWidth={strokeW * 0.5}
                  className={styles.cornerMark}
                />
              )}
              {(p.index === selectedIndex || selectedIndices.includes(p.index)) && (
                <rect
                  x={px - p.widthM}
                  y={y(p.topLevelM) - fontSize * 0.6}
                  width={p.widthM * 2}
                  height={p.retainedHeightM + p.embedmentM + fontSize * 0.6}
                  className={styles.selectedRing}
                  strokeWidth={strokeW}
                />
              )}
              {/* generous invisible tap target — the post itself is often
                  too thin to reliably hit on a phone */}
              <rect
                x={px - Math.max(p.widthM, fontSize) / 1.3}
                y={y(p.topLevelM)}
                width={Math.max(p.widthM, fontSize) * 1.6}
                height={p.retainedHeightM + p.embedmentM}
                className={styles.hitArea}
                onClick={(e) => onSelectPost(p.index, e.shiftKey || e.ctrlKey || e.metaKey)}
                role="button"
                aria-label={`Post ${p.index + 1} — ground ${formatLevel(p.groundLevelM, rlDatumM)}, top ${formatLevel(p.topLevelM, rlDatumM)}${p.needsEngineer ? " — needs engineer design" : ""} — tap to edit`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onSelectPost(p.index, e.shiftKey || e.ctrlKey || e.metaKey)
                  }
                }}
              />
            </g>
          )
        })}

        {/* board joints — every piece runs bay-to-bay, so a joint always
            lands exactly on a post; these just mark where. Course joints
            are kept subtle since there can be many, stacked one per row;
            top board/cap joints are bolder since there's at most one per
            post and they matter more structurally */}
        {[...profile.boards.joints, ...profile.topBoard.joints, ...(profile.topCap?.joints ?? [])].filter((j) => inView(j.postIndex)).map((j, idx) => {
          const p = allPosts[j.postIndex]
          const px = X(p.xM)
          const ch = settings.boardCourseHeightM
          // a vertical line on the post, the height of the board that's
          // cut there: a course is centred on its level, the top board
          // hangs down from the top of the wall, the cap sits above it
          const [fromM, toM] =
            j.layer === "course"
              ? [j.levelM - ch / 2, j.levelM + ch / 2]
              : j.layer === "topBoard"
                ? [j.levelM - ch, j.levelM]
                : [j.levelM - ch * 0.25, j.levelM]
          const cls = j.layer === "course" ? styles.jointMarkCourse : j.layer === "topBoard" ? styles.jointMarkTopBoard : styles.jointMarkTopCap
          return (
            <line
              key={`joint-${j.layer}-${j.postIndex}-${idx}`}
              x1={px}
              x2={px}
              y1={y(fromM)}
              y2={y(toM)}
              className={cls}
              strokeWidth={strokeW * (j.layer === "course" ? 0.6 : 0.8)}
            />
          )
        })}

        {/* ground and top-of-wall lines, following the actual rake */}
        <polyline
          points={posts.map((p) => `${X(p.xM)},${y(p.groundLevelM)}`).join(" ")}
          className={styles.groundLine}
          strokeWidth={strokeW}
        />
        <polyline
          points={topLinePoints}
          className={styles.topLine}
          strokeWidth={strokeW * 0.7}
        />
        {/* with posts of more than one size on the wall, each post's size
            over its top — underlined where it was picked for that post */}
        {mixedSizes &&
          posts.map((p, k) => {
            const label = shortSize(p.sizeLabel)
            // no wider than the gap to the nearer neighbouring post
            const gapM = Math.min(...[posts[k - 1], posts[k + 1]].filter(Boolean).map((q) => Math.abs(q.xM - p.xM)))
            const size = Math.min(fontSize * 0.6, (gapM * 0.9) / (label.length * 0.62))
            return (
              <text
                key={`size-${p.index}`}
                x={X(p.xM)}
                y={y(p.topLevelM) - fontSize * (topCapEnabled ? 0.9 : 0.5)}
                fontSize={size}
                textAnchor="middle"
                className={p.sizeSet ? styles.sizeLabelSet : styles.sizeLabel}
                opacity={1 - tagShow}
              >
                {label}
              </text>
            )
          })}
        {/* how far each step goes up (+) or down (−), in courses, over its post */}
        {posts.map((p) => {
          const before = bays.find((bay) => bay.rightIndex === p.index)
          const after = bays.find((bay) => bay.leftIndex === p.index)
          if (!before || !after || before.stepTopM === null || after.stepTopM === null) return null
          const delta = after.levelCourseCount - before.levelCourseCount
          if (delta === 0) return null
          return (
            <text
              key={`step-${p.index}`}
              x={X(p.xM)}
              y={y(Math.max(before.stepTopM, after.stepTopM)) - fontSize * 0.55}
              fontSize={fontSize * 0.8}
              textAnchor="middle"
              className={styles.stepLabel}
            >
              {delta > 0 ? `+${delta}` : `−${-delta}`}
            </text>
          )
        })}

        {/* post centres, dimensioned under the deepest hole: a tick at
            every post and each bay's spacing in mm. The text shrinks to
            fit its own bay, so a long wall's dimensions stay apart. */}
        {(() => {
          const dimY = y(geometry.minBottom) + fontSize * 0.9
          const tick = fontSize * 0.35
          return (
            <g className={styles.spacingDim}>
              <line x1={X(posts[0].xM)} x2={X(posts[posts.length - 1].xM)} y1={dimY} y2={dimY} strokeWidth={strokeW * 0.5} />
              {posts.map((p) => (
                <line key={`dim-tick-${p.index}`} x1={X(p.xM)} x2={X(p.xM)} y1={dimY - tick} y2={dimY + tick} strokeWidth={strokeW * 0.5} />
              ))}
              {bays.map((bay) => {
                const label = `${Math.round(bay.widthM * 1000)}`
                const size = Math.min(fontSize * 0.8, bay.widthM / (label.length * 0.68))
                return (
                  <text
                    key={`dim-${bay.leftIndex}`}
                    x={X((allPosts[bay.leftIndex].xM + allPosts[bay.rightIndex].xM) / 2)}
                    y={dimY + tick + size}
                    fontSize={size}
                    textAnchor="middle"
                  >
                    {label}
                  </text>
                )
              })}
            </g>
          )
        })()}

        {/* stairs and the like, in front of the wall: the fill under a
            raised bottom, the stair's outline and a line at every tread,
            the point it's pinned to marked at the top */}
        {extrasHere.map((e) => {
          const x0 = Math.min(X(e.fromXM), X(e.toXM))
          const x1 = Math.max(X(e.fromXM), X(e.toXM))
          const picked = e.id === selectedExtraId
          return (
            <g
              key={`extra-${e.id}`}
              onClick={() => onSelectExtra?.(e.id)}
              style={onSelectExtra ? { cursor: "pointer" } : undefined}
              role={onSelectExtra ? "button" : undefined}
              aria-label={`${e.label} — tap to pick it out`}
            >
              {e.bottomM - e.groundM > 0.003 && (
                <rect x={x0 - 0.3} y={y(e.bottomM)} width={x1 - x0 + 0.6} height={e.bottomM - e.groundM} fill={FILL_COLOR} fillOpacity={0.8} />
              )}
              <rect
                x={x0}
                y={y(e.topM)}
                width={x1 - x0}
                height={e.topM - e.bottomM}
                fill={EXTRA_COLOR}
                fillOpacity={picked ? 0.95 : 0.85}
                stroke={EXTRA_COLOR}
                strokeWidth={strokeW * (picked ? 1 : 0.7)}
              />
              {e.treadLevelsM.map((lv, k) => (
                <line key={k} x1={x0} x2={x1} y1={y(lv)} y2={y(lv)} stroke="#f3e3c8" strokeWidth={strokeW * 0.6} />
              ))}
              <circle cx={X(e.fixedXM)} cy={y(e.topM)} r={strokeW * 1.6} fill="#fff" stroke={EXTRA_COLOR} strokeWidth={strokeW * 0.5} />
              <text x={(x0 + x1) / 2} y={y(e.topM) - fontSize * 0.55} fontSize={fontSize * 0.55} textAnchor="middle" fill={EXTRA_COLOR} fontWeight={600}>
                {e.label}
              </text>
            </g>
          )
        })}

        {/* whole-wall view of a wall with corners: name each run above it,
            matching the plan's labels */}
        {!segment &&
          profile.segments.length > 1 &&
          profile.segments.map((seg) => (
            <text
              key={`seg-${seg.index}`}
              x={X((seg.startXM + seg.endXM) / 2)}
              y={y(maxTop) - fontSize * 1.1 - tagShow * tagFont * 1.15 * (tagLines + 0.3)}
              fontSize={fontSize}
              textAnchor="middle"
              className={styles.segmentLabel}
            >
              {segmentLabel(seg.index)}
            </text>
          ))}

        {/* zoomed in: each bay's courses, then each post's number and
            how far along its wall it is, then its levels and hole depth */}
        {courseShow > 0 &&
          bays
            .filter((bay) => !bay.needsEngineer)
            .map((bay) => {
              const a = allPosts[bay.leftIndex]
              const b = allPosts[bay.rightIndex]
              const count = bay.stepTopM !== null ? bay.levelCourseCount : bayCourseLayout(a, b, settings.boardCourseHeightM, profile.rakedTopBoard).courseCount
              return (
                <text
                  key={`courses-${bay.leftIndex}`}
                  x={X((a.xM + b.xM) / 2)}
                  // half way up the bay, clear of the levels at its ends
                  y={y((Math.max(a.groundLevelM, b.groundLevelM) + Math.min(a.topAfterM, b.topBeforeM)) / 2)}
                  dominantBaseline="central"
                  fontSize={tagFont * 0.9}
                  textAnchor="middle"
                  className={styles.detailLabel}
                  strokeWidth={tagFont * 0.2}
                  opacity={courseShow}
                >
                  {count} × {mm(settings.boardCourseHeightM)} + top
                </text>
              )
            })}
        {tagShow > 0 &&
          posts.map((p) => {
            const tag = postTag(p)
            const px = X(p.xM)
            const before = bays.find((bay) => bay.rightIndex === p.index)
            const after = bays.find((bay) => bay.leftIndex === p.index)
            const stepped = !!before && !!after && before.stepTopM !== null && after.stepTopM !== null && before.levelCourseCount !== after.levelCourseCount
            const top = Math.max(p.topLevelM, p.topBeforeM, p.topAfterM, before?.stepTopM ?? -Infinity, after?.stepTopM ?? -Infinity)
            const base = y(top) - (topCapEnabled ? settings.boardCourseHeightM * 0.25 : 0) - tagFont * 0.5 - (stepped ? fontSize * 1.1 : 0)
            return (
              <g key={`tag-${p.index}`} opacity={tagShow} className={styles.postTag}>
                <text x={px} y={base - tagFont * 1.1 * tag.running.length} fontSize={tagFont} textAnchor="middle" fontWeight={700} strokeWidth={tagFont * 0.2}>
                  {tag.name}
                </text>
                {tag.running.map((line, k) => (
                  <text key={k} x={px} y={base - tagFont * 1.1 * (tag.running.length - 1 - k)} fontSize={tagFont * 0.9} textAnchor="middle" strokeWidth={tagFont * 0.2}>
                    {line}
                  </text>
                ))}
              </g>
            )
          })}
        {levelShow > 0 &&
          posts.map((p) => {
            const x = X(p.xM) + (mirrored ? -1 : 1) * (p.widthM / 2 + tagFont * 0.3)
            const anchor = mirrored ? "end" : "start"
            const label = (at: number, text: string, key: string) => (
              <text key={key} x={x} y={at} fontSize={tagFont * 0.85} textAnchor={anchor} className={styles.detailLabel} strokeWidth={tagFont * 0.2}>
                {text}
              </text>
            )
            return (
              <g key={`levels-${p.index}`} opacity={levelShow}>
                {label(y(p.topLevelM) + tagFont * 1.1, `top ${formatLevel(p.topLevelM, rlDatumM)}`, "top")}
                {label(y(p.groundLevelM) - tagFont * 0.4, `ground ${formatLevel(p.groundLevelM, rlDatumM)}`, "ground")}
                {label(y(p.groundLevelM - p.embedmentM) - tagFont * 0.4, `hole ${mm(p.embedmentM)} deep`, "hole")}
              </g>
            )
          })}
      </svg>
    )
  }

  return (
    <div className={styles.diagramRoot}>
      <DiagramExplorer label="Wall elevation">{draw}</DiagramExplorer>

      {belowDrawing}

      <div className={styles.legend}>
        <span>
          <span className={`${styles.swatch} ${styles.postAboveSwatch}`} /> Post
        </span>
        <span>
          <span className={`${styles.swatch} ${styles.holeSwatch}`} /> Concrete/gravel fill
        </span>
        <span>
          <span className={`${styles.swatch} ${styles.bayFillSwatch}`} /> Facing boards
        </span>
        <span>
          <span className={`${styles.swatch} ${styles.topBoardFillSwatch}`} /> Top/perimeter board
        </span>
        {topCapEnabled && (
          <span>
            <span className={`${styles.swatch} ${styles.topCapFillSwatch}`} /> Top cap
          </span>
        )}
        {highlight.length > 0 && (
          <span>
            <span className={`${styles.swatch} ${styles.boardHighlightSwatch}`} /> Boards cut from the length picked in the
            board order
          </span>
        )}
        <span>
          <span className={styles.controlDotSwatch} /> Set by hand — others rake between these
        </span>
        {mixedSizes && (
          <span>
            <span className={styles.sizeLabelSwatch}>Ø150</span> Post size (□ square, Ø round) — underlined where it was
            picked for that post
          </span>
        )}
        {profile.posts.some((p) => p.depthSet === "rake") && (
          <span>
            <span className={`${styles.controlDotSwatch} ${styles.depthRakeSwatch}`} /> Hole depth set — holes between
            rake to the next set depth
          </span>
        )}
        {profile.posts.some((p) => p.depthSet === "lone") && (
          <span>
            <span className={`${styles.controlDotSwatch} ${styles.depthLoneSwatch}`} /> Hole depth set for this post only
          </span>
        )}
        {bays.some((bay) => bay.stepTopM !== null) && (
          <span>
            <span className={`${styles.swatch} ${styles.stepSwatch}`} /> Step in the top of the wall — courses up (+) or
            down (−) at the post
          </span>
        )}
        {extrasHere.length > 0 && (
          <span>
            <span className={styles.stairSwatch} /> Stairs in front of the wall, a line at each tread; fill under a raised
            bottom shown below them
          </span>
        )}
        {obstructionsHere.length > 0 && (
          <span>
            <span className={styles.obstructionSwatch} /> Obstruction in the ground, its clearance zone dashed round it
          </span>
        )}
        {profile.posts.some((p) => p.clashesWith.length) && (
          <span>
            <span className={`${styles.swatch} ${styles.holeClashSwatch}`} /> Hole reaching into an obstruction&apos;s
            clearance zone
          </span>
        )}
        {profile.posts.some((p) => p.fixed) && (
          <span>
            <span className={styles.fixedMarkSwatch} /> Post fixed at a set distance from a corner or wall end
          </span>
        )}
        <span>
          <span className={styles.cornerMarkSwatch} /> Corner post — boards break here, never run through
        </span>
        <span>
          <span className={styles.jointTickSwatch} /> Board joint — staggered row to row, always lands on a post
        </span>
        {profile.engineerPostIndices.length > 0 && (
          <span>
            <span className={`${styles.swatch} ${styles.postBlockedSwatch}`} /> Over 1.5m — needs an engineer,
            excluded from totals
          </span>
        )}
      </div>
      <p className={styles.hint}>
        Dimensions along the bottom are post centres in mm. Tap a post to set its ground level, top level or hole depth by hand.
      </p>
    </div>
  )
}

export default WallProfileDiagram
