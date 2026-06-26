"use client"

import React, { useState } from "react"
import styles from "./weeklyPlan.module.scss"
import Button from "@/components/button/button"
import { WeeklyPlan as WeeklyPlanType, Meal } from "./types"

interface WeeklyPlanProps {
  plan: WeeklyPlanType | null
  meals: Meal[]
  onGenerate: () => Promise<void>
  onSwap: (dayIndex: number, slot: "lunch" | "dinner") => Promise<void>
}

const WeeklyPlan: React.FC<WeeklyPlanProps> = ({ plan, meals, onGenerate, onSwap }) => {
  const [generating, setGenerating] = useState(false)
  const [swapping, setSwapping] = useState<string | null>(null)
  const [expandedMeal, setExpandedMeal] = useState<string | null>(null)

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      await onGenerate()
    } finally {
      setGenerating(false)
    }
  }

  const handleSwap = async (dayIndex: number, slot: "lunch" | "dinner") => {
    const key = `${dayIndex}-${slot}`
    setSwapping(key)
    try {
      await onSwap(dayIndex, slot)
    } finally {
      setSwapping(null)
    }
  }

  const getMealDetails = (mealId: string): Meal | undefined => {
    return meals.find((m) => m.id === mealId)
  }

  if (meals.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyText}>Add some meals first!</p>
        <p className={styles.emptyHint}>Go to &quot;My Meals&quot; and add meals before making a plan.</p>
      </div>
    )
  }

  return (
    <div className={styles.weeklyPlan}>
      <div className={styles.generateSection}>
        <Button onClick={handleGenerate} disabled={generating} size="large">
          {generating ? "Making plan..." : plan ? "New Plan" : "Make a Plan!"}
        </Button>
        {plan && <span className={styles.weekLabel}>{plan.weekLabel}</span>}
      </div>

      {plan && (
        <div className={styles.planGrid}>
          {plan.days.map((day, dayIndex) => (
            <div key={day.day} className={styles.dayCard}>
              <h3 className={styles.dayName}>{day.day}</h3>

              {(["lunch", "dinner"] as const).map((slot) => {
                const mealSlot = day[slot]
                const mealDetail = mealSlot ? getMealDetails(mealSlot.mealId) : null
                const isExpanded = expandedMeal === `${dayIndex}-${slot}`

                return (
                  <div key={slot} className={styles.mealSlot}>
                    <span className={styles.slotLabel}>{slot === "lunch" ? "Lunch" : "Dinner"}</span>
                    <div className={styles.slotContent}>
                      {mealSlot ? (
                        <>
                          <button
                            className={styles.mealNameBtn}
                            onClick={() => setExpandedMeal(isExpanded ? null : `${dayIndex}-${slot}`)}
                          >
                            {mealSlot.mealName}
                          </button>
                          <button
                            className={styles.swapBtn}
                            onClick={() => handleSwap(dayIndex, slot)}
                            disabled={swapping === `${dayIndex}-${slot}`}
                            title="Pick a different meal"
                          >
                            {swapping === `${dayIndex}-${slot}` ? "..." : "↻"}
                          </button>
                        </>
                      ) : (
                        <span className={styles.noMeal}>—</span>
                      )}
                    </div>

                    {isExpanded && mealDetail && (
                      <div className={styles.mealPreview}>
                        {mealDetail.ingredients.length > 0 && (
                          <div className={styles.previewIngredients}>
                            {mealDetail.ingredients.map((ing, i) => (
                              <span key={i} className={styles.previewIngredient}>
                                {ing.name}{ing.amount ? ` (${ing.amount})` : ""}
                              </span>
                            ))}
                          </div>
                        )}
                        {mealDetail.instructions && (
                          <p className={styles.previewInstructions}>{mealDetail.instructions}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default WeeklyPlan
