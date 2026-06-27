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
  MenuSession, Meal, DayPlan, MealSlot, DAYS,
  getUniqueIngredientNames,
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

    return () => {
      unsubSession()
      unsubMeals()
    }
  }, [code])

  const allIngredientNames = useMemo(() => getUniqueIngredientNames(meals), [meals])
  const subMeals = useMemo(() => meals.filter((m) => m.isSubMeal), [meals])

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

  const handleTogglePantryItem = useCallback(async (ingredientName: string, inStock: boolean) => {
    const current = session?.pantryInStock ?? []
    const normalized = ingredientName.toLowerCase().trim()
    const updated = inStock
      ? [...current.filter((n) => n !== normalized), normalized]
      : current.filter((n) => n !== normalized)
    await updateDoc(doc(firestore, "menuSessions", code), { pantryInStock: updated })
  }, [code, session])

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
            pantryInStock={session?.pantryInStock ?? []}
            onAdd={() => { setEditingMeal(null); setVariationParent(null); setShowForm(true) }}
            onEdit={handleEditMeal}
            onDelete={handleDeleteMeal}
            onCreateVariation={handleCreateVariation}
          />
        )}

        {activeTab === "pantry" && (
          <Pantry
            meals={meals}
            pantryInStock={session?.pantryInStock ?? []}
            onToggle={handleTogglePantryItem}
          />
        )}

        {activeTab === "plan" && (
          <WeeklyPlan
            plan={session?.activePlan ?? null}
            meals={meals}
            onGenerate={handleGeneratePlan}
            onSwap={handleSwapMeal}
          />
        )}

        {activeTab === "shopping" && (
          <ShoppingList
            plan={session?.activePlan ?? null}
            meals={meals}
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
