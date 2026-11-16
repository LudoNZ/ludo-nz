"use client"

import { useId, useMemo } from "react"
import { bayCourseLayout, BoardHighlight, WallProfile } from "./postProfile"
import { segmentLabel } from "./wallPlan"
import { CalcSettings } from "./calcSettings"
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
const WallProfileDiagram: React.FC<{
  profile: WallProfile
  settings: CalcSettings
  topCapEnabled: boolean
  selectedIndex: number | null
  onSelectPost: (index: number) => void
  segmentIndex?: number | null
  mirrored?: boolean
  /** boards to pick out — the ones cut from a chosen length on the order */
  highlight?: BoardHighlight[]
}> = ({ profile, settings, topCapEnabled, selectedIndex, onSelectPost, segmentIndex = null, mirrored = false, highlight = [] }) => {
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
    const bottoms = posts.map((p) => p.groundLevelM - p.embedmentM)
    const maxTop = Math.max(...tops)
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
  }, [profile, settings.boardCourseHeightM, topCapEnabled, fromIndex, toIndex, mirrored])

  const { fontSize, strokeW, viewBox, maxTop } = geometry
  const { rlDatumM } = profile
  // `allPosts` stays the full list, since bays and joints refer to posts
  // by index; `posts`/`bays` are just what this view actually draws
  const allPosts = profile.posts
  const posts = allPosts.filter((p) => inView(p.index))
  const bays = profile.bays.filter((b) => inView(b.leftIndex) && inView(b.rightIndex))

  // SVG y grows downward, but "up" in the real world (higher level) should
  // draw higher on screen — flip every level into draw-space once here
  const y = (levelM: number) => -levelM

  return (
    <div className={styles.diagramRoot}>
      <svg viewBox={viewBox} className={styles.svg} role="img" aria-label="Wall elevation profile, to scale">
        {/* bay board fill: level courses stacked from the ground, same as a
            real build — only the top course actually follows the rake */}
        {bays.map((bay) => {
          const a = allPosts[bay.leftIndex]
          const b = allPosts[bay.rightIndex]
          const ax = X(a.xM)
          const bx = X(b.xM)
          if (bay.needsEngineer) {
            const points = `${ax},${y(a.groundLevelM)} ${bx},${y(b.groundLevelM)} ${bx},${y(b.topLevelM)} ${ax},${y(a.topLevelM)}`
            return <polygon key={`bay-${bay.leftIndex}`} points={points} className={styles.bayBlocked} strokeWidth={strokeW} />
          }
          const ch = settings.boardCourseHeightM
          const layout = bayCourseLayout(a, b, ch, profile.rakedTopBoard)
          const { baseLevelM, undersideAM, undersideBM } = layout
          const capTopAM = a.topLevelM
          const capTopBM = b.topLevelM
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

        {/* holes, drawn before posts so each post sits in front of its own fill */}
        {posts.map((p) => (
          <rect
            key={`hole-${p.index}`}
            x={X(p.xM) - p.holeDiameterM / 2}
            y={y(p.groundLevelM)}
            width={p.holeDiameterM}
            height={p.embedmentM}
            rx={p.holeDiameterM * 0.15}
            className={styles.hole}
          />
        ))}

        {/* posts: above and embedded portions, stopping short of the hole
            floor by the gravel base allowance, same as the uniform diagram */}
        {posts.map((p) => {
          const postDepthM = Math.max(0, p.embedmentM - settings.gravelBaseAllowanceM)
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
              {p.index === selectedIndex && (
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
                onClick={() => onSelectPost(p.index)}
                role="button"
                aria-label={`Post ${p.index + 1} — ground ${formatLevel(p.groundLevelM, rlDatumM)}, top ${formatLevel(p.topLevelM, rlDatumM)}${p.needsEngineer ? " — needs engineer design" : ""} — tap to edit`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onSelectPost(p.index)
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
          points={posts.map((p) => `${X(p.xM)},${y(p.topLevelM)}`).join(" ")}
          className={styles.topLine}
          strokeWidth={strokeW * 0.7}
        />

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

        {/* whole-wall view of a wall with corners: name each run above it,
            matching the plan's labels */}
        {!segment &&
          profile.segments.length > 1 &&
          profile.segments.map((seg) => (
            <text
              key={`seg-${seg.index}`}
              x={X((seg.startXM + seg.endXM) / 2)}
              y={y(maxTop) - fontSize * 1.1}
              fontSize={fontSize}
              textAnchor="middle"
              className={styles.segmentLabel}
            >
              {segmentLabel(seg.index)}
            </text>
          ))}
      </svg>

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
