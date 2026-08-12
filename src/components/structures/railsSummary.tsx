"use client"

import { RailSpec } from "./types"
import { formatM } from "./format"
import SpecCard from "./specCard"

/** Renders a RailSpec — for a retaining wall that's stacked horizontal
 * facing boards; for a fence it'd be the top/mid/bottom rail set. Reusable
 * either way, since it only ever reads the generic spec shape. */
const RailsSummary: React.FC<{ spec: RailSpec }> = ({ spec }) => (
  <SpecCard
    title={spec.label}
    rows={[
      { label: "Courses", value: `${spec.courseCount}` },
      { label: "Total length", value: formatM(spec.totalLengthM) },
      { label: "Standard length assumed", value: formatM(spec.standardLengthM, 1) },
      { label: "Boards needed", value: `${spec.boardCount}` },
    ]}
    note="Assumes simple butt joints at whole-board lengths — not an optimised cutting plan."
  />
)

export default RailsSummary
