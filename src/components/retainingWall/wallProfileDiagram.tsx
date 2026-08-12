"use client"

import { useMemo } from "react"
import { ProfilePost, WallProfile } from "./postProfile"
import { BOARD_COURSE_HEIGHT_M, GRAVEL_BASE_ALLOWANCE_M } from "./retainingWallCalc"
import styles from "./wallProfileDiagram.module.scss"

const formatLevel = (relativeM: number, rlDatumM: number): string =>
  rlDatumM !== 0 ? `RL ${(rlDatumM + relativeM).toFixed(3)}` : `${relativeM.toFixed(2)} m`

/** Boards are laid level, not individually raked — only the very top
 * course follows the slope, cut/set to it, while every course under that
 * stacks level from the lower of the two posts' ground levels. Splits a
 * bay into however many full level courses fit under the *shorter* of its
 * two posts, plus one capping region on top that's level too when the
 * bay isn't actually raked (both posts the same height) and a sloped
 * quadrilateral when it is. */
function bayCourses(a: ProfilePost, b: ProfilePost) {
  const baseLevelM = Math.min(a.groundLevelM, b.groundLevelM)
  const minTopM = Math.min(a.topLevelM, b.topLevelM)
  const fullCourses = Math.max(0, Math.floor((minTopM - baseLevelM) / BOARD_COURSE_HEIGHT_M))
  const levelTopM = baseLevelM + fullCourses * BOARD_COURSE_HEIGHT_M
  const levelCourses = Array.from({ length: fullCourses }, (_, i) => ({
    y0: baseLevelM + i * BOARD_COURSE_HEIGHT_M,
    y1: baseLevelM + (i + 1) * BOARD_COURSE_HEIGHT_M,
  }))
  return { levelCourses, capTopM: levelTopM, capTopAM: a.topLevelM, capTopBM: b.topLevelM }
}

/** Interactive front elevation of a raked (or, with no control points set,
 * perfectly uniform) wall: sloped ground and top-of-wall lines through
 * every post's own level, each post drawn at its own height and embedment,
 * each bay's boards filling the (possibly sloped) area between its two
 * posts. Tap a post to select it — the caller owns what happens with that
 * (see retainingWallsPage.tsx's edit panel). Retaining-wall specific
 * (reads a WallProfile, not the generic PostSpec/RailSpec), unlike the
 * structures/ components, since a raked profile has no single uniform
 * spec to describe it. */
const WallProfileDiagram: React.FC<{
  profile: WallProfile
  selectedIndex: number | null
  onSelectPost: (index: number) => void
}> = ({ profile, selectedIndex, onSelectPost }) => {
  const geometry = useMemo(() => {
    const { posts } = profile
    const spanM = posts[posts.length - 1].xM - posts[0].xM
    const tops = posts.map((p) => p.topLevelM)
    const bottoms = posts.map((p) => p.groundLevelM - p.embedmentM)
    const maxTop = Math.max(...tops)
    const minBottom = Math.min(...bottoms)
    const vExtent = Math.max(maxTop - minBottom, 0.5)
    const scale = Math.max(spanM, vExtent, 1)
    const fontSize = scale * 0.045
    const strokeW = scale * 0.006

    const padX = Math.max(...posts.map((p) => p.holeDiameterM / 2)) + fontSize * 8
    const padTop = fontSize * 2.5
    const padBottom = fontSize * 2.5

    const vbMinX = posts[0].xM - padX
    const vbMinY = -(maxTop + padTop)
    const vbW = spanM + padX * 2
    const vbH = maxTop - minBottom + padTop + padBottom

    return { spanM, maxTop, minBottom, fontSize, strokeW, padX, viewBox: `${vbMinX} ${vbMinY} ${vbW} ${vbH}` }
  }, [profile])

  const { fontSize, strokeW, viewBox } = geometry
  const { posts, bays, rlDatumM } = profile

  // SVG y grows downward, but "up" in the real world (higher level) should
  // draw higher on screen — flip every level into draw-space once here
  const y = (levelM: number) => -levelM

  return (
    <div className={styles.diagramRoot}>
      <svg viewBox={viewBox} className={styles.svg} role="img" aria-label="Wall elevation profile, to scale">
        {/* bay board fill: level courses stacked from the ground, same as a
            real build — only the top course actually follows the rake */}
        {bays.map((bay) => {
          const a = posts[bay.leftIndex]
          const b = posts[bay.rightIndex]
          if (bay.needsEngineer) {
            const points = `${a.xM},${y(a.groundLevelM)} ${b.xM},${y(b.groundLevelM)} ${b.xM},${y(b.topLevelM)} ${a.xM},${y(a.topLevelM)}`
            return <polygon key={`bay-${bay.leftIndex}`} points={points} className={styles.bayBlocked} strokeWidth={strokeW} />
          }
          const { levelCourses, capTopM, capTopAM, capTopBM } = bayCourses(a, b)
          return (
            <g key={`bay-${bay.leftIndex}`}>
              {levelCourses.map((c) => (
                <rect
                  key={c.y0}
                  x={a.xM}
                  y={y(c.y1)}
                  width={b.xM - a.xM}
                  height={c.y1 - c.y0}
                  className={styles.bayFill}
                  strokeWidth={strokeW * 0.4}
                />
              ))}
              <polygon
                points={`${a.xM},${y(capTopM)} ${b.xM},${y(capTopM)} ${b.xM},${y(capTopBM)} ${a.xM},${y(capTopAM)}`}
                className={styles.bayFill}
                strokeWidth={strokeW * 0.4}
              />
            </g>
          )
        })}

        {/* holes, drawn before posts so each post sits in front of its own fill */}
        {posts.map((p) => (
          <rect
            key={`hole-${p.index}`}
            x={p.xM - p.holeDiameterM / 2}
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
          const postDepthM = Math.max(0, p.embedmentM - GRAVEL_BASE_ALLOWANCE_M)
          const cls = p.needsEngineer ? styles.postBlocked : styles.postAbove
          return (
            <g key={`post-${p.index}`}>
              <rect x={p.xM - p.widthM / 2} y={y(p.topLevelM)} width={p.widthM} height={p.retainedHeightM} className={cls} />
              <rect
                x={p.xM - p.widthM / 2}
                y={y(p.groundLevelM)}
                width={p.widthM}
                height={postDepthM}
                className={p.needsEngineer ? styles.postBlocked : styles.postBelow}
                strokeWidth={strokeW * 0.5}
              />
              {p.isControlPoint && (
                <circle cx={p.xM} cy={y(p.topLevelM)} r={strokeW * 3} strokeWidth={strokeW * 0.5} className={styles.controlDot} />
              )}
              {p.index === selectedIndex && (
                <rect
                  x={p.xM - p.widthM}
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
                x={p.xM - Math.max(p.widthM, fontSize) / 1.3}
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

        {/* ground and top-of-wall lines, following the actual rake */}
        <polyline
          points={posts.map((p) => `${p.xM},${y(p.groundLevelM)}`).join(" ")}
          className={styles.groundLine}
          strokeWidth={strokeW}
        />
        <polyline
          points={posts.map((p) => `${p.xM},${y(p.topLevelM)}`).join(" ")}
          className={styles.topLine}
          strokeWidth={strokeW * 0.7}
        />
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
          <span className={styles.controlDotSwatch} /> Set by hand — others rake between these
        </span>
        {profile.engineerPostIndices.length > 0 && (
          <span>
            <span className={`${styles.swatch} ${styles.postBlockedSwatch}`} /> Over 1.5m — needs an engineer,
            excluded from totals
          </span>
        )}
      </div>
      <p className={styles.hint}>Tap a post to set its ground level and top level by hand.</p>
    </div>
  )
}

export default WallProfileDiagram
