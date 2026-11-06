import { Timestamp } from "firebase/firestore"

// A recipe that can be cooked step by step in Cook mode. Kept separate
// from Meal (which drives planning/pantry maths) because recipes are
// free-text: "1 3/4 cups milk (any type)" doesn't need to be parsed.

export interface RecipeIngredient {
  id: string
  text: string
}

export type StepTimerMode = "countdown" | "stopwatch"

export interface StepTimer {
  mode: StepTimerMode
  /** Countdown length; ignored for stopwatches. */
  seconds: number
  label: string
}

export interface BatchPhase {
  label: string
  /** Rough target, shown as a hint and to flag a phase as over. */
  targetSeconds: number | null
}

export interface RecipeStep {
  id: string
  text: string
  timer: StepTimer | null
  /** Set when this step repeats in batches (e.g. one pancake at a time). */
  batch: { label: string; phases: BatchPhase[] } | null
}

export interface Recipe {
  id: string
  name: string
  description: string
  servings: string
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
  notes: string[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

// --- Live cook state (one doc per recipe, shared across devices) ---

export interface TimerState {
  /** Epoch ms when the timer was last started; null while paused. */
  startedAt: number | null
  /** Time accumulated before the current run. */
  accumulatedMs: number
}

export interface BatchRecord {
  n: number
  startedAt: number
  /** Epoch ms each phase finished (length grows as phases are ticked off). */
  phaseEnds: number[]
  endedAt: number | null
}

export interface CookState {
  recipeId: string
  checked: string[]
  currentStep: number
  doneSteps: string[]
  timers: Record<string, TimerState>
  batches: BatchRecord[]
  startedAt: number
  updatedAt: number
}

export interface CookLog {
  id: string
  recipeId: string
  recipeName: string
  startedAt: number
  finishedAt: number
  batches: BatchRecord[]
  phaseLabels: string[]
}

export function newId(): string {
  return Math.random().toString(36).substring(2, 8)
}

export function timerElapsedMs(t: TimerState | undefined, now: number): number {
  if (!t) return 0
  return t.accumulatedMs + (t.startedAt != null ? now - t.startedAt : 0)
}

export function formatDuration(ms: number, showTenths = false): string {
  const neg = ms < 0
  const abs = Math.abs(ms)
  const totalSec = showTenths ? abs / 1000 : Math.floor(abs / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec - m * 60
  const sStr = showTenths ? s.toFixed(1).padStart(4, "0") : String(s).padStart(2, "0")
  return `${neg ? "-" : ""}${m}:${sStr}`
}

/** Durations of each phase of a batch (ms), plus the total if finished. */
export function batchPhaseDurations(b: BatchRecord): { phases: number[]; total: number | null } {
  const phases: number[] = []
  let prev = b.startedAt
  for (const end of b.phaseEnds) {
    phases.push(end - prev)
    prev = end
  }
  return { phases, total: b.endedAt != null ? b.endedAt - b.startedAt : null }
}

export const PANCAKE_RECIPE: Omit<Recipe, "id" | "createdAt" | "updatedAt"> = {
  name: "Fluffy Pancakes",
  description:
    "Simple, fluffy pancakes from scratch. Not too sweet, so go wild with toppings. The key is batter that spreads easily but not too thinly.",
  servings: "~10 pancakes",
  ingredients: [
    { id: "flour", text: "2 cups plain / all purpose flour (see note 1)" },
    { id: "bp", text: "4 tsp baking powder (NOT baking soda / bi-carb)" },
    { id: "sugar", text: "1/4 cup white sugar (caster is best, not essential)" },
    { id: "salt", text: "Pinch of salt" },
    { id: "egg", text: "1 large egg (~50g in shell)" },
    { id: "milk", text: "1 3/4 cups milk (any type, any fat %)" },
    { id: "vanilla", text: "1 tsp vanilla extract or essence" },
    { id: "butter", text: "4 tsp butter, for cooking" },
  ],
  steps: [
    {
      id: "dry",
      text: "Whisk dry: place flour, baking powder, sugar and salt in a bowl and whisk to combine.",
      timer: null,
      batch: null,
    },
    {
      id: "wet",
      text: "Add wet ingredients: add egg, milk and vanilla. Whisk until lump free, no longer than 30 seconds.",
      timer: { mode: "countdown", seconds: 30, label: "Whisk" },
      batch: null,
    },
    {
      id: "pan",
      text: "Heat a non-stick pan (medium on a strong stove, medium-high on a weak one). Add about 1/2 tsp butter and swirl to melt, then mostly wipe it off with paper towel. This avoids a dodgy first pancake.",
      timer: { mode: "stopwatch", seconds: 0, label: "Pan heating" },
      batch: null,
    },
    {
      id: "cook",
      text: "Pour 1/4 cup batter into the middle of the pan and spread to an ~11cm circle. When bubbles rise to the surface (~30s), flip and cook the other side until golden (30–45s). Keep warm in a low oven. Add more butter every 2–3 pancakes.",
      timer: null,
      batch: {
        label: "Pancake",
        phases: [
          { label: "Side 1 (bubbles)", targetSeconds: 30 },
          { label: "Side 2 (golden)", targetSeconds: 45 },
        ],
      },
    },
    {
      id: "serve",
      text: "Serve with toppings of choice!",
      timer: null,
      batch: null,
    },
  ],
  notes: [
    "Flour: replace flour + baking powder with 2 cups + 1 tbsp self raising flour. Whole wheat flour also works.",
    "Stove temp: bubbles should take ~30s to appear, then 30–45s on the other side until golden, about 1 minute per pancake. Adjust as you go, or run 2 pans at once.",
    "Toppings: butter, maple syrup, fruit sauces, jam, cream, lemon + sugar, bacon + maple syrup, yoghurt, macerated strawberries (1 cup chopped strawberries + 1 tbsp sugar, leave 10 min).",
    "Pre-made mix: put the flour, salt, baking powder and sugar in a ziplock bag or jar. Add egg, vanilla and milk when you want a batch. To shake the batter in the bottle, it needs to be 1.5L or larger.",
  ],
}
