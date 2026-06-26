"use client"

import React, { useState, useEffect, useCallback } from "react"
import styles from "./menuSessionPage.module.scss"
import { useParams } from "next/navigation"
import { firestore } from "../../../../firebase/client"
import {
  doc, collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  serverTimestamp, Timestamp, query, orderBy,
} from "firebase/firestore"
import { MenuSession, Meal, DayPlan, MealSlot, DAYS } from "@/components/menu/types"
import MealList from "@/components/menu/mealList"
import MealForm from "@/components/menu/mealForm"
import WeeklyPlan from "@/components/menu/weeklyPlan"
import ShoppingList from "@/components/menu/shoppingList"
import Link from "next/link"

type Tab = "meals" | "plan" | "shopping"

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

  useEffect(() => {
    const unsubSession = onSnapshot(doc(firestore, "menuSessions", code), (snap) => {
      if (!snap.exists()) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setSession(snap.data() as MenuSession)
      setLoading(false)
    })

    const mealsQuery = query(
      collection(firestore, "menuSessions", code, "meals"),
      orderBy("createdAt", "asc")
    )
    const unsubMeals = onSnapshot(mealsQuery, (snap) => {
      setMeals(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Meal)))
    })

    return () => {
      unsubSession()
      unsubMeals()
    }
  }, [code])

  const handleAddMeal = useCallback(async (name: string, ingredients: { name: string; amount: string }[], instructions: string) => {
    await addDoc(collection(firestore, "menuSessions", code, "meals"), {
      name,
      ingredients,
      instructions,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    setShowForm(false)
  }, [code])

  const handleUpdateMeal = useCallback(async (mealId: string, name: string, ingredients: { name: string; amount: string }[], instructions: string) => {
    await updateDoc(doc(firestore, "menuSessions", code, "meals", mealId), {
      name,
      ingredients,
      instructions,
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
    setShowForm(true)
  }, [])

  const handleCloseForm = useCallback(() => {
    setShowForm(false)
    setEditingMeal(null)
  }, [])

  const handleGeneratePlan = useCallback(async () => {
    if (meals.length === 0) return

    const shuffled = [...meals].sort(() => Math.random() - 0.5)
    const days: DayPlan[] = DAYS.map((day, i) => {
      const lunchMeal = shuffled[i % shuffled.length]
      let dinnerMeal = shuffled[(i + Math.ceil(shuffled.length / 2)) % shuffled.length]
      if (dinnerMeal.id === lunchMeal.id && shuffled.length > 1) {
        dinnerMeal = shuffled[(i + 1) % shuffled.length]
      }
      return {
        day,
        lunch: { mealId: lunchMeal.id, mealName: lunchMeal.name },
        dinner: { mealId: dinnerMeal.id, mealName: dinnerMeal.name },
      }
    })

    const now = new Date()
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    const weekLabel = `Week of ${monday.toLocaleDateString("en-NZ", { month: "long", day: "numeric" })}`

    await updateDoc(doc(firestore, "menuSessions", code), {
      activePlan: {
        createdAt: Timestamp.now(),
        weekLabel,
        days,
      },
    })
  }, [code, meals])

  const handleSwapMeal = useCallback(async (dayIndex: number, slot: "lunch" | "dinner") => {
    if (!session?.activePlan || meals.length === 0) return

    const currentPlan = session.activePlan
    const currentSlot = currentPlan.days[dayIndex][slot]
    const available = meals.filter((m) => m.id !== currentSlot?.mealId)
    const pick = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : meals[Math.floor(Math.random() * meals.length)]

    const newSlot: MealSlot = { mealId: pick.id, mealName: pick.name }
    const updatedDays = currentPlan.days.map((d, i) =>
      i === dayIndex ? { ...d, [slot]: newSlot } : d
    )

    await updateDoc(doc(firestore, "menuSessions", code), {
      activePlan: { ...currentPlan, days: updatedDays },
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
          My Meals
        </button>
        <button
          className={`${styles.tab} ${activeTab === "plan" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("plan")}
        >
          This Week
        </button>
        <button
          className={`${styles.tab} ${activeTab === "shopping" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("shopping")}
        >
          Shopping List
        </button>
      </div>

      <div className={styles.content}>
        {activeTab === "meals" && (
          <MealList
            meals={meals}
            onAdd={() => setShowForm(true)}
            onEdit={handleEditMeal}
            onDelete={handleDeleteMeal}
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
          onSave={editingMeal
            ? (name, ingredients, instructions) => handleUpdateMeal(editingMeal.id, name, ingredients, instructions)
            : handleAddMeal
          }
          onClose={handleCloseForm}
        />
      )}
    </div>
  )
}

export default MenuSessionPage
