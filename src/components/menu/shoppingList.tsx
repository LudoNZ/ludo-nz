"use client"

import React, { useState, useMemo, useCallback } from "react"
import styles from "./shoppingList.module.scss"
import Button from "@/components/button/button"
import { WeeklyPlan, Meal, ShoppingItem, getAllMealIngredients } from "./types"

interface ShoppingListProps {
  plan: WeeklyPlan | null
  meals: Meal[]
  onGoToPlan: () => void
}

function buildShoppingList(plan: WeeklyPlan, meals: Meal[]): ShoppingItem[] {
  const mealMap = new Map(meals.map((m) => [m.id, m]))
  const aggregated = new Map<string, { amount: string; unit: string }[]>()

  for (const day of plan.days) {
    for (const slot of [day.lunch, day.dinner]) {
      if (!slot) continue
      const meal = mealMap.get(slot.mealId)
      if (!meal) continue
      const allIngs = getAllMealIngredients(meal, meals)
      for (const ing of allIngs) {
        const key = ing.name.toLowerCase().trim()
        if (!key) continue
        if (!aggregated.has(key)) aggregated.set(key, [])
        if (ing.amount) {
          aggregated.get(key)!.push({ amount: ing.amount, unit: ing.unit || "" })
        }
      }
    }
  }

  return Array.from(aggregated.entries())
    .map(([name, entries]) => {
      const display = entries
        .map((e) => `${e.amount}${e.unit ? ` ${e.unit}` : ""}`)
        .join(", ")
      return {
        name: name.charAt(0).toUpperCase() + name.slice(1),
        entries,
        displayAmount: display,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

const ShoppingList: React.FC<ShoppingListProps> = ({ plan, meals, onGoToPlan }) => {
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)

  const items = useMemo(() => {
    if (!plan) return []
    return buildShoppingList(plan, meals)
  }, [plan, meals])

  const toggleItem = useCallback((name: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const clearChecks = useCallback(() => {
    setChecked(new Set())
  }, [])

  const copyList = useCallback(async () => {
    const text = items
      .filter((item) => !checked.has(item.name))
      .map((item) => `${item.name}${item.displayAmount ? ` — ${item.displayAmount}` : ""}`)
      .join("\n")

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may not be available
    }
  }, [items, checked])

  if (!plan) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyText}>No plan yet!</p>
        <p className={styles.emptyHint}>Make a weekly plan first, then your shopping list will appear here.</p>
        <div className={styles.emptyAction}>
          <Button onClick={onGoToPlan} size="large">Go to Plan</Button>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyText}>No ingredients yet!</p>
        <p className={styles.emptyHint}>Add ingredients to your meals and they will show up here.</p>
      </div>
    )
  }

  const unchecked = items.filter((i) => !checked.has(i.name))
  const checkedItems = items.filter((i) => checked.has(i.name))

  return (
    <div className={styles.shoppingList}>
      <div className={styles.actions}>
        <Button onClick={copyList} variant="secondary" size="medium">
          {copied ? "Copied!" : "Copy List"}
        </Button>
        {checked.size > 0 && (
          <Button onClick={clearChecks} variant="secondary" size="medium">
            Clear Checks
          </Button>
        )}
      </div>

      <div className={styles.list}>
        {unchecked.map((item) => (
          <label key={item.name} className={styles.item}>
            <input
              type="checkbox"
              checked={false}
              onChange={() => toggleItem(item.name)}
              className={styles.checkbox}
            />
            <span className={styles.itemName}>{item.name}</span>
            {item.displayAmount && (
              <span className={styles.itemAmount}>{item.displayAmount}</span>
            )}
          </label>
        ))}

        {checkedItems.length > 0 && (
          <>
            {unchecked.length > 0 && <hr className={styles.divider} />}
            {checkedItems.map((item) => (
              <label key={item.name} className={`${styles.item} ${styles.itemChecked}`}>
                <input
                  type="checkbox"
                  checked={true}
                  onChange={() => toggleItem(item.name)}
                  className={styles.checkbox}
                />
                <span className={styles.itemName}>{item.name}</span>
                {item.displayAmount && (
                  <span className={styles.itemAmount}>{item.displayAmount}</span>
                )}
              </label>
            ))}
          </>
        )}
      </div>

      <p className={styles.summary}>
        {checked.size} of {items.length} items checked
      </p>
    </div>
  )
}

export default ShoppingList
