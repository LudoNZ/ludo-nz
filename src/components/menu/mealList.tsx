"use client"

import React, { useState, useMemo } from "react"
import styles from "./mealList.module.scss"
import Button from "@/components/button/button"
import { Meal, getAllMealIngredients, CATEGORY_LABELS, DIFFICULTY_LABELS, MealCategory } from "./types"

interface MealListProps {
  meals: Meal[]
  pantryInStock: string[]
  onAdd: () => void
  onEdit: (meal: Meal) => void
  onDelete: (mealId: string) => void
  onCreateVariation: (baseMeal: Meal) => void
}

type Filter = "all" | "can-make" | "almost"

const MealList: React.FC<MealListProps> = ({
  meals, pantryInStock, onAdd, onEdit, onDelete, onCreateVariation,
}) => {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const stockSet = useMemo(
    () => new Set(pantryInStock.map((n) => n.toLowerCase().trim())),
    [pantryInStock]
  )

  const mealStock = useMemo(() => {
    const result = new Map<string, { total: number; inStock: number; missing: string[] }>()
    for (const meal of meals) {
      if (meal.isSubMeal) continue
      const allIngs = getAllMealIngredients(meal, meals)
      const uniqueNames = [...new Set(allIngs.map((i) => i.name.toLowerCase().trim()).filter(Boolean))]
      const missing = uniqueNames.filter((n) => !stockSet.has(n))
      result.set(meal.id, {
        total: uniqueNames.length,
        inStock: uniqueNames.length - missing.length,
        missing: missing.map((n) => n.charAt(0).toUpperCase() + n.slice(1)),
      })
    }
    return result
  }, [meals, stockSet])

  const baseMeals = useMemo(() =>
    meals.filter((m) => !m.isSubMeal && !m.parentId),
    [meals]
  )

  const subMealsList = useMemo(() =>
    meals.filter((m) => m.isSubMeal),
    [meals]
  )

  const getVariations = (baseId: string) =>
    meals.filter((m) => m.parentId === baseId)

  const filterMeal = (meal: Meal): boolean => {
    if (filter === "all") return true
    const stock = mealStock.get(meal.id)
    if (!stock || stock.total === 0) return false
    if (filter === "can-make") return stock.missing.length === 0
    if (filter === "almost") return stock.missing.length <= 2 && stock.missing.length > 0
    return true
  }

  const filteredBaseMeals = baseMeals.filter(filterMeal)
  const hasPantryData = pantryInStock.length > 0

  return (
    <div className={styles.mealList}>
      {/* Filter bar */}
      {hasPantryData && meals.some((m) => !m.isSubMeal) && (
        <div className={styles.filterBar}>
          <button
            className={`${styles.filterBtn} ${filter === "all" ? styles.filterActive : ""}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            className={`${styles.filterBtn} ${filter === "can-make" ? styles.filterActive : ""}`}
            onClick={() => setFilter("can-make")}
          >
            Can Make
          </button>
          <button
            className={`${styles.filterBtn} ${filter === "almost" ? styles.filterActive : ""}`}
            onClick={() => setFilter("almost")}
          >
            Almost
          </button>
        </div>
      )}

      {/* Main meals */}
      {filteredBaseMeals.length === 0 && !subMealsList.length ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>
            {filter !== "all" ? "No meals match this filter" : "No meals yet!"}
          </p>
          <p className={styles.emptyHint}>
            {filter !== "all"
              ? "Try adding more items to your pantry, or switch to 'All'."
              : "Add your favourite meals so you can plan your week."}
          </p>
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredBaseMeals.map((meal) => {
            const stock = mealStock.get(meal.id)
            const variations = getVariations(meal.id)
            const isExpanded = expandedId === meal.id

            return (
              <div key={meal.id} className={styles.cardGroup}>
                <MealCard
                  meal={meal}
                  stock={stock}
                  deletingId={deletingId}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onSetDeleting={setDeletingId}
                  onCreateVariation={onCreateVariation}
                  hasVariations={variations.length > 0}
                  isExpanded={isExpanded}
                  onToggleExpand={() => setExpandedId(isExpanded ? null : meal.id)}
                />

                {isExpanded && variations.length > 0 && (
                  <div className={styles.variations}>
                    {variations.map((v) => {
                      const vStock = mealStock.get(v.id)
                      return (
                        <MealCard
                          key={v.id}
                          meal={v}
                          stock={vStock}
                          deletingId={deletingId}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          onSetDeleting={setDeletingId}
                          onCreateVariation={onCreateVariation}
                          isVariation
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Sub-meals / Components */}
      {subMealsList.length > 0 && (
        <div className={styles.subMealsSection}>
          <h3 className={styles.sectionTitle}>Components</h3>
          <div className={styles.grid}>
            {subMealsList.map((meal) => (
              <MealCard
                key={meal.id}
                meal={meal}
                deletingId={deletingId}
                onEdit={onEdit}
                onDelete={onDelete}
                onSetDeleting={setDeletingId}
                onCreateVariation={onCreateVariation}
                isComponent
              />
            ))}
          </div>
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

interface MealCardProps {
  meal: Meal
  stock?: { total: number; inStock: number; missing: string[] }
  deletingId: string | null
  onEdit: (meal: Meal) => void
  onDelete: (mealId: string) => void
  onSetDeleting: (id: string | null) => void
  onCreateVariation: (meal: Meal) => void
  hasVariations?: boolean
  isExpanded?: boolean
  onToggleExpand?: () => void
  isVariation?: boolean
  isComponent?: boolean
}

const MealCard: React.FC<MealCardProps> = ({
  meal, stock, deletingId, onEdit, onDelete, onSetDeleting,
  onCreateVariation, hasVariations, isExpanded, onToggleExpand,
  isVariation, isComponent,
}) => {
  return (
    <div className={`${styles.card} ${isVariation ? styles.variationCard : ""} ${isComponent ? styles.componentCard : ""}`}>
      <div className={styles.cardContent} onClick={() => onEdit(meal)}>
        <h3 className={styles.mealName}>{meal.name}</h3>
        {meal.categories.length > 0 && (
          <div className={styles.categoryBadges}>
            {meal.categories.map((cat) => (
              <span key={cat} className={styles.categoryBadge}>
                {CATEGORY_LABELS[cat as MealCategory]}
              </span>
            ))}
          </div>
        )}
        <div className={styles.cardMeta}>
          <span className={styles.ingredientCount}>
            {meal.ingredients.length} ingredient{meal.ingredients.length !== 1 ? "s" : ""}
          </span>
          {meal.steps.length > 0 && (
            <span className={styles.stepCount}>
              {meal.steps.length} step{meal.steps.length !== 1 ? "s" : ""}
            </span>
          )}
          {meal.subMealIds.length > 0 && (
            <span className={styles.subMealCount}>
              {meal.subMealIds.length} component{meal.subMealIds.length !== 1 ? "s" : ""}
            </span>
          )}
          {meal.difficulty > 0 && (
            <span className={styles.difficultyBadge}>
              {DIFFICULTY_LABELS[meal.difficulty - 1]}
            </span>
          )}
          {meal.rating > 0 && (
            <span className={styles.ratingBadge}>
              {"★".repeat(meal.rating)}
            </span>
          )}
          {meal.maxPerWeek !== null && (
            <span className={styles.freqBadge}>
              max {meal.maxPerWeek}/wk
            </span>
          )}
        </div>
        {stock && stock.total > 0 && (
          <div className={styles.stockBar}>
            <div
              className={styles.stockFill}
              style={{ width: `${(stock.inStock / stock.total) * 100}%` }}
            />
            <span className={styles.stockText}>
              {stock.inStock}/{stock.total} in pantry
              {stock.missing.length > 0 && stock.missing.length <= 3 && (
                <> — need {stock.missing.join(", ")}</>
              )}
            </span>
          </div>
        )}
      </div>

      <div className={styles.cardActions}>
        {hasVariations && (
          <button className={styles.expandBtn} onClick={onToggleExpand} title="Show variations">
            {isExpanded ? "▾" : "▸"} {hasVariations ? "variants" : ""}
          </button>
        )}
        <button className={styles.variationBtn} onClick={() => onCreateVariation(meal)} title="Create variation">
          ⑂
        </button>
        <button className={styles.editBtn} onClick={() => onEdit(meal)} title="Edit">
          ✎
        </button>
        {deletingId === meal.id ? (
          <div className={styles.deleteConfirm}>
            <span className={styles.deleteText}>Delete?</span>
            <button className={styles.deleteYes} onClick={() => { onDelete(meal.id); onSetDeleting(null) }}>
              Yes
            </button>
            <button className={styles.deleteNo} onClick={() => onSetDeleting(null)}>
              No
            </button>
          </div>
        ) : (
          <button className={styles.deleteBtn} onClick={() => onSetDeleting(meal.id)} title="Delete">
            ×
          </button>
        )}
      </div>
    </div>
  )
}

export default MealList
