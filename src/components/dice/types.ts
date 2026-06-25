import { Timestamp } from "firebase/firestore"

export interface CustomRule {
  id: string
  text: string
  enabled: boolean
  trigger?: {
    type: "rollSum" | "doubles" | "drought" | "hotNumber"
    value: number
  }
  action: string
}

export interface DiceSession {
  createdAt: Timestamp
  creatorName: string
  players: string[]
  customRules: CustomRule[]
}

export interface DiceRoll {
  id: string
  player: string
  die1: number
  die2: number
  total: number
  isRandom: boolean
  timestamp: Timestamp
}
