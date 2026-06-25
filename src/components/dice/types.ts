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

export interface DiceSession {
  createdAt: Timestamp
  creatorName: string
  players: string[]
  inactivePlayers: string[]
  currentTurnIndex: number
  currentGame: number
  games: GameRecord[]
  customRules: CustomRule[]
}

export interface DiceRoll {
  id: string
  player: string
  die1: number
  die2: number
  total: number
  isRandom: boolean
  game: number
  timestamp: Timestamp
}
