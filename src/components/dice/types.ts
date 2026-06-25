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
  count: number
  sides: number
}

export const DEFAULT_DICE_CONFIG: DiceConfig = { count: 2, sides: 6 }

export const DICE_SIDES_OPTIONS = [4, 6, 8, 10, 12, 20]

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
