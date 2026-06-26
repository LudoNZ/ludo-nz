import { Timestamp } from "firebase/firestore"

export interface CustomRule {
  id: string
  text: string
  enabled: boolean
  trigger?: {
    type: "rollSum" | "doubles" | "drought" | "hotNumber"
    value: number
    droughtNumber?: number
    doublesList?: number[]
    hotNumberTotals?: number[]
  }
  action: string
}

export interface GameRecord {
  number: number
  startedAt: Timestamp
}

export interface DiceConfig {
  dice: number[]
}

export const DEFAULT_DICE_CONFIG: DiceConfig = { dice: [6, 6] }

export const DICE_SIDES_OPTIONS = [4, 6, 8, 10, 12, 20]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeDiceConfig(raw: any): DiceConfig {
  if (!raw) return DEFAULT_DICE_CONFIG
  if (Array.isArray(raw.dice) && raw.dice.length > 0) return { dice: raw.dice }
  if (typeof raw.count === "number" && typeof raw.sides === "number") {
    return { dice: Array(raw.count).fill(raw.sides) }
  }
  return DEFAULT_DICE_CONFIG
}

export function formatDiceConfig(config: DiceConfig): string {
  const groups: Record<number, number> = {}
  for (const s of config.dice) groups[s] = (groups[s] || 0) + 1
  return Object.entries(groups)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([sides, count]) => `${count}d${sides}`)
    .join(" + ")
}

export interface DiceSession {
  createdAt: Timestamp
  creatorName: string
  players: string[]
  inactivePlayers: string[]
  currentTurnIndex: number
  currentGame: number
  games: GameRecord[]
  diceConfig: DiceConfig
  customRules: CustomRule[]
}

export interface DiceRoll {
  id: string
  player: string
  dice: number[]
  diceTypes?: number[]
  die1?: number
  die2?: number
  total: number
  isRandom: boolean
  game: number
  timestamp: Timestamp
}

export function getRollDice(roll: DiceRoll): number[] {
  return roll.dice || [roll.die1 ?? 0, roll.die2 ?? 0]
}
