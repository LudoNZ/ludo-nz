/** How much decking board a deck's shape actually needs — a different
 * question from layout.ts's computeDeckLayout, which plans *which
 * specific stock lengths* cover it. Total lineal metres needed is
 * provably independent of how many joins a row ends up with, for plain
 * butt joints: every row is fully covered by contiguous, non-overlapping
 * segments, so summed segment length always equals the row's own span no
 * matter how it's split. That means this doesn't need Inventory/join-
 * planning at all — just the row positions themselves, which is why
 * computeFieldCoverageLinealMm below deliberately mirrors only the row-
 * span part of computeDeckLayout's setup (same lengthAt/widthAt/
 * polygonSpanAtY/polygonSpanAtX calls, same rowCount/pitch math) rather
 * than calling it — no Inventory, no stock, no skeleton/fill-in split,
 * none of that is relevant to "how much material is needed". Feeds
 * boardOrderPrediction.ts's target quantity for "Calculate quantity
 * order" (deckForm.tsx). */

import { polygonBounds, polygonSpanAtX, polygonSpanAtY } from "./polygon"
import { DeckConfig, lengthAt, rakeLength, widthAt } from "./types"

/** Total lineal mm of field board needed to cover the deck's area —
 * every row's full span, summed. See this module's own doc comment for
 * why this doesn't need to know anything about available stock. */
export function computeFieldCoverageLinealMm(config: DeckConfig): number {
  const { width, sideA, sideB, boardWidth, boardGap, points } = config
  const pitch = boardWidth + boardGap
  if (pitch <= 0) return 0
  const intoRake = config.boardDirection !== "alongRake"
  const isPolygon = Array.isArray(points) && points.length >= 3
  const bounds = isPolygon ? polygonBounds(points!) : null
  const maxLen = Math.max(sideA, sideB)

  const rowAxisOrigin = isPolygon ? (intoRake ? bounds!.minY : bounds!.minX) : 0
  const rowAxisExtent = isPolygon
    ? intoRake
      ? bounds!.maxY - bounds!.minY
      : bounds!.maxX - bounds!.minX
    : intoRake
      ? width
      : maxLen
  const rowCount = Math.max(1, Math.ceil(rowAxisExtent / pitch))

  // Same epsilon-nudge as layout.ts's own row setup — a scanline query
  // exactly on the polygon's own max boundary always misses (see
  // polygon.ts's polygonSpanAtY/X doc comment).
  const nudgeInside = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo + 1e-6), hi - 1e-6)

  let totalMm = 0
  for (let i = 0; i < rowCount; i++) {
    const rowStart = rowAxisOrigin + i * pitch
    const rowEnd = Math.min(rowStart + boardWidth, rowAxisOrigin + rowAxisExtent)

    let targetLength: number
    if (isPolygon) {
      const b = bounds!
      if (intoRake) {
        const spanStart = polygonSpanAtY(points!, nudgeInside(rowStart, b.minY, b.maxY))
        const spanEnd = polygonSpanAtY(points!, nudgeInside(rowEnd, b.minY, b.maxY))
        if (!spanStart && !spanEnd) continue // this row band falls entirely outside the shape
        const lo = Math.min(spanStart?.xMin ?? Infinity, spanEnd?.xMin ?? Infinity)
        const hi = Math.max(spanStart?.xMax ?? -Infinity, spanEnd?.xMax ?? -Infinity)
        targetLength = hi - lo
      } else {
        const spanStart = polygonSpanAtX(points!, nudgeInside(rowStart, b.minX, b.maxX))
        const spanEnd = polygonSpanAtX(points!, nudgeInside(rowEnd, b.minX, b.maxX))
        if (!spanStart && !spanEnd) continue
        const lo = Math.min(spanStart?.yMin ?? Infinity, spanEnd?.yMin ?? Infinity)
        const hi = Math.max(spanStart?.yMax ?? -Infinity, spanEnd?.yMax ?? -Infinity)
        targetLength = hi - lo
      }
    } else {
      targetLength = intoRake
        ? Math.max(lengthAt(config, rowStart), lengthAt(config, rowEnd))
        : Math.max(widthAt(config, rowStart), widthAt(config, rowEnd))
    }
    if (targetLength < 1) continue // deck has tapered to nothing here
    totalMm += targetLength
  }
  return totalMm
}

/** Total lineal mm of extra edge board — a perimeter frame (edgeExtraBoards
 * value 1) or a dressed/skirted edge (2-3) — on top of the field boards.
 * Trapezoid edge lengths come straight off sideA/sideB/width/rakeLength;
 * polygon edge lengths from consecutive points, same indexing
 * lockedEdgeLengths already uses. */
export function computeEdgeExtraLinealMm(config: DeckConfig): number {
  const { points, edgeExtraBoards } = config
  const isPolygon = Array.isArray(points) && points.length >= 3
  let totalMm = 0

  if (isPolygon) {
    const n = points!.length
    for (let i = 0; i < n; i++) {
      const count = edgeExtraBoards[String(i)] ?? 0
      if (count <= 0) continue
      const a = points![i]
      const b = points![(i + 1) % n]
      totalMm += Math.hypot(b.x - a.x, b.y - a.y) * count
    }
  } else {
    const edges: { key: string; length: number }[] = [
      { key: "sideA", length: config.sideA },
      { key: "sideB", length: config.sideB },
      { key: "width", length: config.width },
      { key: "rake", length: rakeLength(config) },
    ]
    for (const edge of edges) {
      const count = edgeExtraBoards[edge.key] ?? 0
      if (count > 0) totalMm += edge.length * count
    }
  }
  return totalMm
}

/** The full target quantity "Calculate quantity order" predicts against —
 * field coverage plus every edge's extra boards. No wastage margin baked
 * in: this is exactly what the shape needs, not a padded estimate. */
export function computeTotalOrderLinealMm(config: DeckConfig): number {
  return computeFieldCoverageLinealMm(config) + computeEdgeExtraLinealMm(config)
}
