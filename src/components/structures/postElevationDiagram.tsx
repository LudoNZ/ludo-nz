"use client"

import { useMemo } from "react"
import { PostSpec, RailSpec } from "./types"
import { formatM, formatMm } from "./format"
import styles from "./postElevationDiagram.module.scss"

/** A to-scale front elevation of a representative section of posts and
 * rails — ground level, each post split into its above-ground and
 * embedded (pile) portions, its hole, and the rail/board courses spanning
 * between posts. Generic to any post+rail structure (reads only PostSpec/
 * RailSpec), so it's exactly as reusable for a future paling fence
 * elevation as the summary cards are. Only ever draws a handful of posts
 * — the repeating unit, not the whole run — since that's what "to scale
 * and legible at once" actually needs. */
const PostElevationDiagram: React.FC<{
  posts: PostSpec
  rails: RailSpec
  /** how many posts to draw in the representative section (default 3, the
   * smallest count that shows two full bays) */
  postsToShow?: number
}> = ({ posts, rails, postsToShow = 3 }) => {
  const geometry = useMemo(() => {
    const n = Math.max(1, Math.min(posts.count, postsToShow))
    const aboveGroundM = Math.max(0, posts.lengthM - posts.embedmentM)
    const spanW = (n - 1) * posts.spacingM
    const scale = Math.max(aboveGroundM + posts.embedmentM, spanW, 1)
    const fontSize = scale * 0.045
    const strokeW = scale * 0.006

    const postXs = Array.from({ length: n }, (_, i) => i * posts.spacingM)
    const railLeft = postXs[0] - posts.widthM / 2
    const railRight = postXs[postXs.length - 1] + posts.widthM / 2

    // dimension callouts sit in a column to the left of the first post's
    // hole; the widest thing in that column is the embedment/height text,
    // so pad enough for a handful of characters at fontSize
    const dimX = railLeft - posts.holeDiameterM / 2 - fontSize * 0.6
    const padLeft = railLeft - dimX + fontSize * 4.5
    // ground-level label sits to the right of the last hole, so pad enough
    // to fit that label's text rather than an arbitrary margin
    const padRight = posts.holeDiameterM / 2 + fontSize * 8
    const padTop = fontSize * 2
    const padBottom = fontSize * 4.5

    const vbMinX = railLeft - padLeft
    const vbMinY = -(padTop + aboveGroundM)
    const vbW = railRight - railLeft + padLeft + padRight
    const vbH = padTop + aboveGroundM + posts.embedmentM + padBottom

    const courseH = rails.courseCount > 0 ? aboveGroundM / rails.courseCount : aboveGroundM
    const groundX1 = vbMinX + fontSize * 0.5
    const groundX2 = railRight + fontSize * 1.3

    return {
      n,
      aboveGroundM,
      viewBox: `${vbMinX} ${vbMinY} ${vbW} ${vbH}`,
      strokeW,
      fontSize,
      postXs,
      courseH,
      railLeft,
      railRight,
      dimX,
      groundX1,
      groundX2,
      truncated: posts.count > n,
    }
  }, [posts, rails, postsToShow])

  const {
    n,
    aboveGroundM,
    viewBox,
    strokeW,
    fontSize,
    postXs,
    courseH,
    railLeft,
    railRight,
    dimX,
    groundX1,
    groundX2,
    truncated,
  } = geometry
  const courses = Array.from({ length: rails.courseCount }, (_, i) => i)

  return (
    <div className={styles.diagramRoot}>
      <svg viewBox={viewBox} className={styles.svg} role="img" aria-label="Post and rail elevation, to scale">
        {/* underground context band, so it's obvious at a glance which part of the picture is buried */}
        <rect x={groundX1} y={0} width={groundX2 - groundX1} height={posts.embedmentM} className={styles.underground} />

        {/* holes, drawn before the posts so the post sits in front of its fill */}
        {postXs.map((x) => (
          <rect
            key={`hole-${x}`}
            x={x - posts.holeDiameterM / 2}
            y={0}
            width={posts.holeDiameterM}
            height={posts.embedmentM}
            rx={posts.holeDiameterM * 0.15}
            className={styles.hole}
          />
        ))}

        {/* rail/board courses, spanning the full shown width */}
        {courses.map((i) => (
          <rect
            key={`course-${i}`}
            x={railLeft}
            y={-aboveGroundM + i * courseH}
            width={railRight - railLeft}
            height={courseH}
            className={styles.rail}
            strokeWidth={strokeW}
          />
        ))}

        {/* posts: above-ground and embedded portions styled distinctly so
            the pile depth reads at a glance */}
        {postXs.map((x) => (
          <g key={`post-${x}`}>
            <rect x={x - posts.widthM / 2} y={-aboveGroundM} width={posts.widthM} height={aboveGroundM} className={styles.postAbove} />
            <rect
              x={x - posts.widthM / 2}
              y={0}
              width={posts.widthM}
              height={posts.embedmentM}
              className={styles.postBelow}
              strokeWidth={strokeW * 0.5}
            />
          </g>
        ))}

        {/* ground line */}
        <line x1={groundX1} y1={0} x2={groundX2} y2={0} className={styles.groundLine} strokeWidth={strokeW} />
        <text x={groundX2 + fontSize * 0.3} y={fontSize * 0.35} fontSize={fontSize} className={styles.dimText}>
          Ground level
        </text>

        {/* height dimension */}
        <g className={styles.dimText} fontSize={fontSize}>
          <line x1={dimX} y1={-aboveGroundM} x2={dimX} y2={0} className={styles.dimLine} strokeWidth={strokeW * 0.7} />
          <line x1={dimX - fontSize * 0.4} y1={-aboveGroundM} x2={dimX + fontSize * 0.4} y2={-aboveGroundM} strokeWidth={strokeW * 0.7} />
          <line x1={dimX - fontSize * 0.4} y1={0} x2={dimX + fontSize * 0.4} y2={0} strokeWidth={strokeW * 0.7} />
          <text x={dimX - fontSize * 0.6} y={-aboveGroundM / 2} textAnchor="end" dominantBaseline="middle">
            {formatM(aboveGroundM)}
          </text>
        </g>

        {/* embedment dimension */}
        <g className={styles.dimText} fontSize={fontSize}>
          <line x1={dimX} y1={0} x2={dimX} y2={posts.embedmentM} className={styles.dimLine} strokeWidth={strokeW * 0.7} />
          <line x1={dimX - fontSize * 0.4} y1={posts.embedmentM} x2={dimX + fontSize * 0.4} y2={posts.embedmentM} strokeWidth={strokeW * 0.7} />
          <text x={dimX - fontSize * 0.6} y={posts.embedmentM / 2} textAnchor="end" dominantBaseline="middle">
            {formatMm(posts.embedmentM)}
          </text>
        </g>

        {/* spacing dimension, between the first two posts */}
        {n > 1 && (
          <g className={styles.dimText} fontSize={fontSize}>
            <line
              x1={postXs[0]}
              y1={posts.embedmentM + fontSize * 0.8}
              x2={postXs[1]}
              y2={posts.embedmentM + fontSize * 0.8}
              className={styles.dimLine}
              strokeWidth={strokeW * 0.7}
            />
            <text x={(postXs[0] + postXs[1]) / 2} y={posts.embedmentM + fontSize * 1.7} textAnchor="middle">
              {formatM(posts.spacingM)} centres
            </text>
          </g>
        )}
      </svg>

      <div className={styles.legend}>
        <span>
          <span className={`${styles.swatch} ${styles.postAboveSwatch}`} /> Post ({posts.sizeLabel})
        </span>
        <span>
          <span className={`${styles.swatch} ${styles.postBelowSwatch}`} /> Post — embedded (pile depth)
        </span>
        <span>
          <span className={`${styles.swatch} ${styles.holeSwatch}`} /> Concrete/gravel fill
        </span>
        <span>
          <span className={`${styles.swatch} ${styles.railSwatch}`} /> {rails.label}
        </span>
      </div>
      {truncated && (
        <p className={styles.hint}>
          Showing {n} of {posts.count} posts to scale — the same spacing repeats along the wall.
        </p>
      )}
    </div>
  )
}

export default PostElevationDiagram
