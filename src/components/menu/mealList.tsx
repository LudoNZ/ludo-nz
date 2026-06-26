"use client"

import React, { useState } from "react"
import styles from "./mealList.module.scss"
import Button from "@/components/button/button"
import { Meal } from "./types"

interface MealListProps {
  meals: Meal[]
  onAdd: () => void
  onEdit: (meal: Meal) => void
  onDelete: (mealId: string) => void
}

const MealList: React.FC<MealListProps> = ({ meals, onAdd, onEdit, onDelete }) => {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  return (
    <div className={styles.mealList}>
      {meals.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>No meals yet!</p>
          <p className={styles.emptyHint}>Add your favourite meals so you can plan your week.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {meals.map((meal) => (
            <div key={meal.id} className={styles.card}>
              <div className={styles.cardContent} onClick={() => onEdit(meal)}>
                <h3 className={styles.mealName}>{meal.name}</h3>
                <span className={styles.ingredientCount}>
                  {meal.ingredients.length} ingredient{meal.ingredients.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className={styles.cardActions}>
                <button className={styles.editBtn} onClick={() => onEdit(meal)} title="Edit">
                  ✎
                </button>
                {deletingId === meal.id ? (
                  <div className={styles.deleteConfirm}>
                    <span className={styles.deleteText}>Delete?</span>
                    <button className={styles.deleteYes} onClick={() => { onDelete(meal.id); setDeletingId(null) }}>
                      Yes
                    </button>
                    <button className={styles.deleteNo} onClick={() => setDeletingId(null)}>
                      No
                    </button>
                  </div>
                ) : (
                  <button className={styles.deleteBtn} onClick={() => setDeletingId(meal.id)} title="Delete">
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.addSection}>
        <Button onClick={onAdd} size="large">
          + Add a Meal
        </Button>
      </div>
    </div>
  )
}

export default MealList
