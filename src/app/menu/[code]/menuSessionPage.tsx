"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import styles from "./menuSessionPage.module.scss"
import { useParams } from "next/navigation"
import { firestore } from "../../../../firebase/client"
import {
  doc, collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  serverTimestamp, Timestamp, query, orderBy,
} from "firebase/firestore"
import {
  MenuSession, Meal, DayPlan, MealSlot, PantryItem, DAYS,
  getUniqueIngredientNames, getAllMealIngredients,
  parseAmount, convertAmount, normalizeKey,
} from "@/components/menu/types"
import MealList from "@/components/menu/mealList"
import MealForm from "@/components/menu/mealForm"
import WeeklyPlan from "@/components/menu/weeklyPlan"
import ShoppingList from "@/components/menu/shoppingList"
import Pantry from "@/components/menu/pantry"
import Link from "next/link"

type Tab = "meals" | "pantry" | "plan" | "shopping"

export interface SaveMealData {
  name: string
  isSubMeal: boolean
  parentId: string | null
  categories: string[]
  ingredients: { name: string; amount: string; unit: string }[]
  subMealIds: string[]
  steps: { id: string; text: string; afterStepIds: string[]; subMealId?: string }[]
  difficulty: number
  rating: number
  maxPerWeek: number | null
}

const MenuSessionPage: React.FC = () => {
  const params = useParams()
  const code = (params.code as string).toUpperCase()

  const [session, setSession] = useState<MenuSession | null>(null)
  const [meals, setMeals] = useState<Meal[]>([])
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([])
  const [activeTab, setActiveTab] = useState<Tab>("meals")
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null)
  const [variationParent, setVariationParent] = useState<Meal | null>(null)

  useEffect(() => {
    const unsubSession = onSnapshot(doc(firestore, "menuSessions", code), (snap) => {
      if (!snap.exists()) {
        setNotFound(true)
        setLoading(false)
        return
      }
      const data = snap.data()
      setSession({
        ...data,
        pantryInStock: data.pantryInStock ?? [],
      } as MenuSession)
      setLoading(false)
    })

    const mealsQuery = query(
      collection(firestore, "menuSessions", code, "meals"),
      orderBy("createdAt", "asc")
    )
    const unsubMeals = onSnapshot(mealsQuery, (snap) => {
      setMeals(snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          isSubMeal: data.isSubMeal ?? false,
          parentId: data.parentId ?? null,
          categories: data.categories ?? [],
          subMealIds: data.subMealIds ?? [],
          steps: data.steps ?? [],
          ingredients: data.ingredients ?? [],
          difficulty: data.difficulty ?? 0,
          rating: data.rating ?? 0,
          maxPerWeek: data.maxPerWeek ?? null,
        } as Meal
      }))
    })

    const pantryQuery = query(
      collection(firestore, "menuSessions", code, "pantry"),
      orderBy("updatedAt", "desc")
    )
    const unsubPantry = onSnapshot(pantryQuery, (snap) => {
      setPantryItems(snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        isStaple: d.data().isStaple ?? false,
        lowStockThreshold: d.data().lowStockThreshold ?? 0,
        quantity: d.data().quantity ?? 0,
      } as PantryItem)))
    })

    return () => {
      unsubSession()
      unsubMeals()
      unsubPantry()
    }
  }, [code])

  const allIngredientNames = useMemo(() => getUniqueIngredientNames(meals), [meals])
  const subMeals = useMemo(() => meals.filter((m) => m.isSubMeal), [meals])

  const pantryStockNames = useMemo(() =>
    pantryItems.filter((p) => p.quantity > 0).map((p) => normalizeKey(p.name)),
    [pantryItems]
  )

  // --- Meal CRUD ---
  const handleSaveMeal = useCallback(async (data: SaveMealData) => {
    await addDoc(collection(firestore, "menuSessions", code, "meals"), {
      name: data.name,
      isSubMeal: data.isSubMeal,
      parentId: data.parentId,
      categories: data.categories,
      ingredients: data.ingredients,
      subMealIds: data.subMealIds,
      steps: data.steps,
      difficulty: data.difficulty,
      rating: data.rating,
      maxPerWeek: data.maxPerWeek,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    setShowForm(false)
    setVariationParent(null)
  }, [code])

  const handleUpdateMeal = useCallback(async (mealId: string, data: SaveMealData) => {
    await updateDoc(doc(firestore, "menuSessions", code, "meals", mealId), {
      name: data.name,
      isSubMeal: data.isSubMeal,
      parentId: data.parentId,
      categories: data.categories,
      ingredients: data.ingredients,
      subMealIds: data.subMealIds,
      steps: data.steps,
      difficulty: data.difficulty,
      rating: data.rating,
      maxPerWeek: data.maxPerWeek,
      updatedAt: serverTimestamp(),
    })
    setEditingMeal(null)
    setShowForm(false)
  }, [code])

  const handleDeleteMeal = useCallback(async (mealId: string) => {
    await deleteDoc(doc(firestore, "menuSessions", code, "meals", mealId))
  }, [code])

  const handleEditMeal = useCallback((meal: Meal) => {
    setEditingMeal(meal)
    setVariationParent(null)
    setShowForm(true)
  }, [])

  const handleCreateVariation = useCallback((baseMeal: Meal) => {
    setEditingMeal(null)
    setVariationParent(baseMeal)
    setShowForm(true)
  }, [])

  const handleCloseForm = useCallback(() => {
    setShowForm(false)
    setEditingMeal(null)
    setVariationParent(null)
  }, [])

  // --- Pantry CRUD ---
  const handlePantryUpdate = useCallback(async (itemId: string, updates: Partial<PantryItem>) => {
    await updateDoc(doc(firestore, "menuSessions", code, "pantry", itemId), {
      ...updates,
      updatedAt: serverTimestamp(),
    })
  }, [code])

  const handlePantryAdd = useCallback(async (name: string, unit: string, isStaple: boolean) => {
    await addDoc(collection(firestore, "menuSessions", code, "pantry"), {
      name,
      quantity: 0,
      unit,
      isStaple,
      lowStockThreshold: 0,
      updatedAt: serverTimestamp(),
    })
  }, [code])

  const handlePantryDelete = useCallback(async (itemId: string) => {
    await deleteDoc(doc(firestore, "menuSessions", code, "pantry", itemId))
  }, [code])

  const handleAddAllFromMeals = useCallback(async () => {
    const pantryNames = new Set(pantryItems.map((p) => normalizeKey(p.name)))
    const toAdd = new Map<string, string>()
    for (const meal of meals) {
      for (const ing of meal.ingredients) {
        const key = normalizeKey(ing.name)
        if (key && !pantryNames.has(key) && !toAdd.has(key)) {
          toAdd.set(key, ing.unit || "")
        }
      }
    }
    const batch: Promise<unknown>[] = []
    for (const [name, unit] of toAdd) {
      batch.push(addDoc(collection(firestore, "menuSessions", code, "pantry"), {
        name: name.charAt(0).toUpperCase() + name.slice(1),
        quantity: 0,
        unit,
        isStaple: false,
        lowStockThreshold: 0,
        updatedAt: serverTimestamp(),
      }))
    }
    await Promise.all(batch)
  }, [code, meals, pantryItems])

  // --- Eat meal (deplete pantry) ---
  const handleEatMeal = useCallback(async (dayIndex: number, slot: "lunch" | "dinner") => {
    if (!session?.activePlan) return
    const mealSlot = session.activePlan.days[dayIndex][slot]
    if (!mealSlot) return

    const meal = meals.find((m) => m.id === mealSlot.mealId)
    if (!meal) return

    const allIngs = getAllMealIngredients(meal, meals)
    const pantryMap = new Map(pantryItems.map((p) => [normalizeKey(p.name), p]))

    const depletions: { pantryId: string; newQty: number }[] = []
    const newPantryItems: { name: string; qty: number; unit: string }[] = []

    for (const ing of allIngs) {
      const key = normalizeKey(ing.name)
      if (!key) continue
      const amount = parseAmount(ing.amount)
      if (amount === null || amount <= 0) continue

      const pantryItem = pantryMap.get(key)
      if (pantryItem) {
        let deduction = amount
        if (ing.unit && pantryItem.unit && ing.unit !== pantryItem.unit) {
          const converted = convertAmount(amount, ing.unit, pantryItem.unit)
          if (converted !== null) {
            deduction = converted
          } else {
            continue
          }
        }
        const newQty = Math.max(0, pantryItem.quantity - deduction)
        depletions.push({ pantryId: pantryItem.id, newQty })
      } else {
        newPantryItems.push({ name: ing.name.trim(), qty: 0, unit: ing.unit || "" })
      }
    }

    const updates: Promise<unknown>[] = []

    for (const { pantryId, newQty } of depletions) {
      updates.push(updateDoc(doc(firestore, "menuSessions", code, "pantry", pantryId), {
        quantity: Math.round(newQty * 100) / 100,
        updatedAt: serverTimestamp(),
      }))
    }

    const existingPantryNames = new Set(pantryItems.map((p) => normalizeKey(p.name)))
    for (const item of newPantryItems) {
      const key = normalizeKey(item.name)
      if (!existingPantryNames.has(key)) {
        existingPantryNames.add(key)
        updates.push(addDoc(collection(firestore, "menuSessions", code, "pantry"), {
          name: item.name.charAt(0).toUpperCase() + key.slice(1),
          quantity: 0,
          unit: item.unit,
          isStaple: false,
          lowStockThreshold: 0,
          updatedAt: serverTimestamp(),
        }))
      }
    }

    updates.push(addDoc(collection(firestore, "menuSessions", code, "consumptionLog"), {
      mealId: mealSlot.mealId,
      mealName: mealSlot.mealName,
      date: serverTimestamp(),
      ingredients: allIngs
        .filter((i) => parseAmount(i.amount) !== null)
        .map((i) => ({ name: i.name, amount: parseAmount(i.amount)!, unit: i.unit || "" })),
    }))

    const eatenKey = slot === "lunch" ? "lunchEaten" : "dinnerEaten"
    const updatedDays = session.activePlan.days.map((d, i) =>
      i === dayIndex ? { ...d, [eatenKey]: true } : d
    )
    updates.push(updateDoc(doc(firestore, "menuSessions", code), {
      activePlan: { ...session.activePlan, days: updatedDays },
    }))

    await Promise.all(updates)
  }, [code, session, meals, pantryItems])

  // --- Plan generation ---
  const handleGeneratePlan = useCallback(async () => {
    const mainMeals = meals.filter((m) => !m.isSubMeal)
    if (mainMeals.length === 0) return

    const lunchPool = mainMeals.filter((m) => m.categories.length === 0 || m.categories.includes("lunch"))
    const dinnerPool = mainMeals.filter((m) => m.categories.length === 0 || m.categories.includes("dinner"))

    const usageCount = new Map<string, number>()

    function pickMeal(pool: Meal[], exclude?: string): MealSlot | null {
      const shuffled = [...pool].sort(() => Math.random() - 0.5)
      for (const meal of shuffled) {
        if (meal.id === exclude) continue
        const count = usageCount.get(meal.id) ?? 0
        if (meal.maxPerWeek !== null && count >= meal.maxPerWeek) continue
        usageCount.set(meal.id, count + 1)
        return { mealId: meal.id, mealName: meal.name }
      }
      if (shuffled.length > 0) {
        const fallback = shuffled[0]
        usageCount.set(fallback.id, (usageCount.get(fallback.id) ?? 0) + 1)
        return { mealId: fallback.id, mealName: fallback.name }
      }
      return null
    }

    const days: DayPlan[] = DAYS.map((day) => {
      const lunch = pickMeal(lunchPool)
      const dinner = pickMeal(dinnerPool, lunch?.mealId)
      return { day, lunch, dinner }
    })

    const now = new Date()
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    const weekLabel = `Week of ${monday.toLocaleDateString("en-NZ", { month: "long", day: "numeric" })}`

    await updateDoc(doc(firestore, "menuSessions", code), {
      activePlan: { createdAt: Timestamp.now(), weekLabel, days },
    })
  }, [code, meals])

  const handleSwapMeal = useCallback(async (dayIndex: number, slot: "lunch" | "dinner") => {
    if (!session?.activePlan) return
    const mainMeals = meals.filter((m) => !m.isSubMeal)
    const pool = mainMeals.filter((m) => m.categories.length === 0 || m.categories.includes(slot))
    if (pool.length === 0) return

    const currentSlot = session.activePlan.days[dayIndex][slot]
    const available = pool.filter((m) => m.id !== currentSlot?.mealId)
    const pick = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : pool[Math.floor(Math.random() * pool.length)]

    const newSlot: MealSlot = { mealId: pick.id, mealName: pick.name }
    const updatedDays = session.activePlan.days.map((d, i) =>
      i === dayIndex ? { ...d, [slot]: newSlot } : d
    )

    await updateDoc(doc(firestore, "menuSessions", code), {
      activePlan: { ...session.activePlan, days: updatedDays },
    })
  }, [code, session, meals])

  if (loading) {
    return (
      <div className={styles.sessionPage}>
        <p className={styles.loading}>Loading menu...</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className={styles.sessionPage}>
        <div className={styles.notFound}>
          <h1>Menu not found</h1>
          <p>The code <strong>{code}</strong> doesn&apos;t match any menu.</p>
          <Link href="/menu" className={styles.backLink}>Go back</Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.sessionPage}>
      <div className={styles.header}>
        <Link href="/menu" className={styles.backArrow}>←</Link>
        <div className={styles.headerInfo}>
          <h1 className={styles.title}>Menu</h1>
          <span className={styles.code}>{code}</span>
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "meals" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("meals")}
        >
          Meals
        </button>
        <button
          className={`${styles.tab} ${activeTab === "pantry" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("pantry")}
        >
          Pantry
        </button>
        <button
          className={`${styles.tab} ${activeTab === "plan" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("plan")}
        >
          Plan
        </button>
        <button
          className={`${styles.tab} ${activeTab === "shopping" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("shopping")}
        >
          Shop
        </button>
      </div>

      <div className={styles.content}>
        {activeTab === "meals" && (
          <MealList
            meals={meals}
            pantryInStock={pantryStockNames}
            onAdd={() => { setEditingMeal(null); setVariationParent(null); setShowForm(true) }}
            onEdit={handleEditMeal}
            onDelete={handleDeleteMeal}
            onCreateVariation={handleCreateVariation}
          />
        )}

        {activeTab === "pantry" && (
          <Pantry
            meals={meals}
            pantryItems={pantryItems}
            onUpdate={handlePantryUpdate}
            onAdd={handlePantryAdd}
            onDelete={handlePantryDelete}
            onAddAllFromMeals={handleAddAllFromMeals}
          />
        )}

        {activeTab === "plan" && (
          <WeeklyPlan
            plan={session?.activePlan ?? null}
            meals={meals}
            onGenerate={handleGeneratePlan}
            onSwap={handleSwapMeal}
            onEat={handleEatMeal}
          />
        )}

        {activeTab === "shopping" && (
          <ShoppingList
            plan={session?.activePlan ?? null}
            meals={meals}
            pantryItems={pantryItems}
            onGoToPlan={() => setActiveTab("plan")}
          />
        )}
      </div>

      {showForm && (
        <MealForm
          meal={editingMeal}
          variationParent={variationParent}
          allIngredientNames={allIngredientNames}
          availableSubMeals={subMeals}
          allMeals={meals}
          onSave={editingMeal
            ? (data) => handleUpdateMeal(editingMeal.id, data)
            : handleSaveMeal
          }
          onClose={handleCloseForm}
        />
      )}
    </div>
  )
}

export default MenuSessionPage
