"use client"

import { LaborEstimate } from "./types"
import SpecCard from "./specCard"

const formatHours = (h: number): string => `${h.toFixed(1)} hr`

/** Renders a LaborEstimate — generic to any post+rail+infill build, same
 * reasoning as PostsSummary/RailsSummary/InfillSummary. */
const LaborSummary: React.FC<{ estimate: LaborEstimate }> = ({ estimate }) => (
  <SpecCard
    title="Rough labour estimate"
    rows={[
      { label: "Setup & marking out", value: formatHours(estimate.setupHours) },
      { label: "Posts (dig, set, fill)", value: formatHours(estimate.postsHours) },
      { label: "Rails / facing boards", value: formatHours(estimate.railsHours) },
      { label: "Infill", value: formatHours(estimate.infillHours) },
      { label: "Total", value: formatHours(estimate.totalHours) },
    ]}
    note="Rough guide for one experienced DIYer working alone — add time for a helper-dependent job, hard ground, or bad weather."
  />
)

export default LaborSummary
