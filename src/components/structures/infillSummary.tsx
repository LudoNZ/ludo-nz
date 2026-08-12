"use client"

import { InfillSpec } from "./types"
import { formatM3 } from "./format"
import SpecCard from "./specCard"

/** Renders an InfillSpec — a volume (retaining-wall drainage backfill) or
 * a piece count (fence palings), whichever the domain calculator filled
 * in. Reusable either way since it only branches on which field is set. */
const InfillSummary: React.FC<{ spec: InfillSpec }> = ({ spec }) => {
  const rows: { label: string; value: string }[] = []
  if (spec.volumeM3 !== undefined) rows.push({ label: "Volume", value: formatM3(spec.volumeM3) })
  if (spec.count !== undefined) rows.push({ label: "Count", value: `${spec.count}` })

  return <SpecCard title={spec.label} rows={rows} note={spec.note} />
}

export default InfillSummary
