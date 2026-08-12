"use client"

import { PostSpec } from "./types"
import { formatM, formatM3, formatMm } from "./format"
import SpecCard from "./specCard"

/** Renders a PostSpec — reusable as-is by any post-and-rail calculator,
 * not just retaining walls. */
const PostsSummary: React.FC<{ spec: PostSpec; note?: string }> = ({ spec, note }) => (
  <SpecCard
    title="Posts"
    rows={[
      { label: "Size", value: spec.sizeLabel },
      { label: "Count", value: `${spec.count}` },
      { label: "Spacing (centres)", value: formatM(spec.spacingM) },
      { label: "Post length", value: formatM(spec.lengthM) },
      { label: "Embedment depth", value: formatMm(spec.embedmentM) },
      { label: "Hole diameter", value: formatMm(spec.holeDiameterM) },
      { label: "Fill per hole", value: formatM3(spec.holeVolumeM3) },
      { label: "Total fill (concrete/gravel)", value: formatM3(spec.totalFillVolumeM3) },
    ]}
    note={note}
  />
)

export default PostsSummary
