import { Timestamp } from "firebase/firestore"

export interface Ingredient {
  name: string
  amount: string
}

export interface Meal {
  id: string
  name: string
  ingredients: Ingredient[]
  instructions: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface MealSlot {
  mealId: string
  mealName: string
}

export interface DayPlan {
  day: string
  lunch: MealSlot | null
  dinner: MealSlot | null
}

export interface WeeklyPlan {
  createdAt: Timestamp
  weekLabel: string
  days: DayPlan[]
}

export interface MenuSession {
  createdAt: Timestamp
  creatorName: string
  activePlan: WeeklyPlan | null
}

export interface ShoppingItem {
  name: string
  amounts: string[]
  displayAmount: string
}

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
