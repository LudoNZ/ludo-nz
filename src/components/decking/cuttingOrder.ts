import { BoardSegment, DeckLayout, RowPlan } from "./layout"

export interface CutStep {
  segment: BoardSegment
  row: RowPlan
}

/** The order boards should physically be cut & placed in: all skeleton rows
 * first (matching the "lay the skeleton first" installation approach), then
 * the fill-in rows — each in row order, boards within a row in start-to-end
 * order. */
export function getCutOrder(layout: DeckLayout): CutStep[] {
  const steps: CutStep[] = []
  for (const row of layout.rows) {
    if (!row.isSkeleton) continue
    for (const segment of row.boards) steps.push({ segment, row })
  }
  for (const row of layout.rows) {
    if (row.isSkeleton) continue
    for (const segment of row.boards) steps.push({ segment, row })
  }
  return steps
}

export function nextCutStep(order: CutStep[], completedSegmentIds: string[]): CutStep | null {
  const done = new Set(completedSegmentIds)
  return order.find((step) => !done.has(step.segment.id)) ?? null
}

export function lastCompletedStep(order: CutStep[], completedSegmentIds: string[]): CutStep | null {
  const done = new Set(completedSegmentIds)
  for (let i = order.length - 1; i >= 0; i--) {
    if (done.has(order[i].segment.id)) return order[i]
  }
  return null
}
