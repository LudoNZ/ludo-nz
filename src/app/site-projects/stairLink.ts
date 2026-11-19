/** The stairs calculator opened on one stair of a site project: edits
 * there save back to the project. */
export const stairCalculatorHref = (projectId: string, stairId: string) =>
  `/stairs?site=${encodeURIComponent(projectId)}&stair=${encodeURIComponent(stairId)}`
