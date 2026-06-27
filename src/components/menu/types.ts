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

export const MEAL_CATEGORIES = ["breakfast", "lunch", "dinner", "dessert"] as const
export type MealCategory = typeof MEAL_CATEGORIES[number]

export const CATEGORY_LABELS: Record<MealCategory, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  dessert: "Dessert",
}

export const DIFFICULTY_LABELS = ["Easy", "Medium", "Hard"] as const

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
  categories: MealCategory[]
  ingredients: Ingredient[]
  subMealIds: string[]
  steps: CookingStep[]
  difficulty: number
  rating: number
  maxPerWeek: number | null
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
  lunchEaten?: boolean
  dinnerEaten?: boolean
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

export interface PantryItem {
  id: string
  name: string
  quantity: number
  unit: string
  isStaple: boolean
  lowStockThreshold: number
  updatedAt: Timestamp
  category?: string
}

export interface IngredientCategory {
  id: string
  name: string
  order: number
  createdAt: Timestamp
}

export interface ConsumptionEntry {
  id: string
  mealId: string
  mealName: string
  date: Timestamp
  ingredients: { name: string; amount: number; unit: string }[]
}

export interface ShoppingItem {
  name: string
  needed: number
  have: number
  toBuy: number
  unit: string
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

export function parseAmount(amount: string): number | null {
  const num = parseFloat(amount)
  return isNaN(num) ? null : num
}

const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
  g: { kg: 0.001 },
  kg: { g: 1000 },
  ml: { L: 0.001 },
  L: { ml: 1000 },
  tsp: { tbsp: 1 / 3 },
  tbsp: { tsp: 3 },
}

export function convertAmount(amount: number, fromUnit: string, toUnit: string): number | null {
  if (fromUnit === toUnit) return amount
  return UNIT_CONVERSIONS[fromUnit]?.[toUnit] != null
    ? amount * UNIT_CONVERSIONS[fromUnit][toUnit]
    : null
}

export function normalizeKey(name: string): string {
  return name.toLowerCase().trim()
}

export function generateSectionId(): string {
  return Math.random().toString(36).substring(2, 8)
}

export interface TemplateSection {
  id: string
  name: string
  isOptional: boolean
  optionIds: string[]
}

export interface MealTemplate {
  id: string
  name: string
  sections: TemplateSection[]
  createdAt: Timestamp
  updatedAt: Timestamp
}
