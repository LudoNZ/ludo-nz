export type AssistanceLevel = 0 | 1 | 2 | 3

export const ASSISTANCE_LEVELS: AssistanceLevel[] = [3, 2, 1, 0]

export const BAND_KG = 34

export interface PullupSet {
  reps: number
  /** seconds elapsed in the session when this set was logged */
  elapsedSeconds: number
}

export interface PullupSession {
  id: string
  createdAt: Date
  assistanceBands: AssistanceLevel
  isMaxTest: boolean
  targetReps: number
  intervalSeconds: number
  sets: PullupSet[]
  totalReps: number
  notes?: string
}

export const GOAL_SETS = 10

export function assistanceLabel(bands: AssistanceLevel): string {
  if (bands === 0) return "Unassisted"
  return `${bands} strap${bands > 1 ? "s" : ""} (${bands * BAND_KG}kg)`
}

export function cleanSetsCount(session: PullupSession): number {
  return session.sets.filter((s) => s.reps >= session.targetReps).length
}

/** Best (highest) count of full-target sets achieved in a single session, per band level. */
export function bestCleanSetsByLevel(
  sessions: PullupSession[]
): Record<AssistanceLevel, number> {
  const best: Record<AssistanceLevel, number> = { 3: 0, 2: 0, 1: 0, 0: 0 }
  for (const s of sessions) {
    if (s.isMaxTest) continue
    const clean = cleanSetsCount(s)
    if (clean > best[s.assistanceBands]) best[s.assistanceBands] = clean
  }
  return best
}

/** The band level the athlete should currently be focused on: the highest-assistance
 * level not yet cleared (10 clean sets), or null if 0-band goal has been cleared. */
export function currentFocusLevel(
  best: Record<AssistanceLevel, number>
): AssistanceLevel | null {
  for (const level of ASSISTANCE_LEVELS) {
    if (best[level] < GOAL_SETS) return level
  }
  return null
}
