"use client"

import { LaborEstimate } from "./types"
import SpecCard from "./specCard"

const formatHours = (h: number): string => `${h.toFixed(1)} hr`

/** Renders a LaborEstimate — generic to any post+rail+infill build, same
 * reasoning as PostsSummary/RailsSummary/InfillSummary. The infill row's
 * label is overridable since "infill" means something different per
 * structure (a retaining wall's is backfill placement; a fence's would be
 * hanging palings) and the generic word alone reads as unclear on its own. */
const LaborSummary: React.FC<{ estimate: LaborEstimate; infillLabel?: string }> = ({
  estimate,
  infillLabel = "Infill",
}) => (
  <SpecCard
    title="Rough labour estimate"
    rows={[
      { label: "Setup & marking out", value: formatHours(estimate.setupHours) },
      { label: "Posts (dig, set, fill)", value: formatHours(estimate.postsHours) },
      { label: "Rails / facing boards", value: formatHours(estimate.railsHours) },
      { label: infillLabel, value: formatHours(estimate.infillHours) },
      { label: "Total", value: formatHours(estimate.totalHours) },
    ]}
    note="Rough guide for one experienced DIYer working alone — add time for a helper-dependent job, hard ground, or bad weather."
  />
)

export default LaborSummary
