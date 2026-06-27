import { Timestamp } from "firebase/firestore"

export const UNITS = [
  { value: "", label: "—" },
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "ml", label: "ml" },
  { value: "L", label: "L" },
  { value: "cups", label: "cups" },
  { value: "tbsp", label: "tbsp" },
  { value: "tsp", label: "tsp" },
  { value: "pieces", label: "pcs" },
  { value: "slices", label: "slices" },
  { value: "whole", label: "whole" },
  { value: "pinch", label: "pinch" },
  { value: "bunch", label: "bunch" },
  { value: "can", label: "can" },
  { value: "packet", label: "pkt" },
] as const

export interface Ingredient {
  name: string
  amount: string
  unit: string
}

export interface CookingStep {
  id: string
  text: string
  afterStepIds: string[]
  subMealId?: string
}

export interface Meal {
  id: string
  name: string
  isSubMeal: boolean
  parentId: string | null
  ingredients: Ingredient[]
  subMealIds: string[]
  steps: CookingStep[]
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
  pantryInStock: string[]
}

export interface ShoppingItem {
  name: string
  entries: { amount: string; unit: string }[]
  displayAmount: string
}

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

export function generateStepId(): string {
  return Math.random().toString(36).substring(2, 8)
}

export function getAllMealIngredients(meal: Meal, allMeals: Meal[], visited?: Set<string>): Ingredient[] {
  const seen = visited ?? new Set<string>()
  if (seen.has(meal.id)) return []
  seen.add(meal.id)

  const ingredients = [...meal.ingredients]
  for (const subId of meal.subMealIds) {
    const subMeal = allMeals.find((m) => m.id === subId)
    if (subMeal) {
      ingredients.push(...getAllMealIngredients(subMeal, allMeals, seen))
    }
  }
  return ingredients
}

export function getUniqueIngredientNames(meals: Meal[]): string[] {
  const names = new Set<string>()
  for (const meal of meals) {
    for (const ing of meal.ingredients) {
      if (ing.name.trim()) names.add(ing.name.trim().toLowerCase())
    }
  }
  return Array.from(names).sort().map((n) => n.charAt(0).toUpperCase() + n.slice(1))
}
