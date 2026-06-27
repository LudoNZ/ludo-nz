"use client"

import React, { useState, useMemo, useCallback } from "react"
import styles from "./shoppingList.module.scss"
import Button from "@/components/button/button"
import {
  WeeklyPlan, Meal, PantryItem, ShoppingItem,
  getAllMealIngredients, parseAmount, convertAmount, normalizeKey,
} from "./types"

interface ShoppingListProps {
  plan: WeeklyPlan | null
  meals: Meal[]
  pantryItems: PantryItem[]
  onGoToPlan: () => void
}

function buildShoppingList(plan: WeeklyPlan, meals: Meal[], pantryItems: PantryItem[]): ShoppingItem[] {
  const mealMap = new Map(meals.map((m) => [m.id, m]))
  const pantryMap = new Map(pantryItems.map((p) => [normalizeKey(p.name), p]))

  const needed = new Map<string, { total: number; unit: string; entries: { amount: string; unit: string }[] }>()

  for (const day of plan.days) {
    for (const slot of [day.lunch, day.dinner]) {
      if (!slot) continue
      const meal = mealMap.get(slot.mealId)
      if (!meal) continue
      const allIngs = getAllMealIngredients(meal, meals)
      for (const ing of allIngs) {
        const key = normalizeKey(ing.name)
        if (!key) continue

        if (!needed.has(key)) {
          needed.set(key, { total: 0, unit: ing.unit || "", entries: [] })
        }
        const entry = needed.get(key)!
        const amount = parseAmount(ing.amount)
        if (amount !== null) {
          if (ing.unit && entry.unit && ing.unit !== entry.unit) {
            const converted = convertAmount(amount, ing.unit, entry.unit)
            entry.total += converted ?? amount
          } else {
            entry.total += amount
            if (!entry.unit && ing.unit) entry.unit = ing.unit
          }
        }
        if (ing.amount) {
          entry.entries.push({ amount: ing.amount, unit: ing.unit || "" })
        }
      }
    }
  }

  // Low-stock staples not in the plan
  for (const item of pantryItems) {
    if (!item.isStaple) continue
    const key = normalizeKey(item.name)
    if (item.quantity <= item.lowStockThreshold && !needed.has(key)) {
      needed.set(key, { total: 0, unit: item.unit, entries: [] })
    }
  }

  const result: ShoppingItem[] = []
  for (const [key, data] of needed) {
    const pantryItem = pantryMap.get(key)
    const have = pantryItem ? pantryItem.quantity : 0
    let haveConverted = have
    if (pantryItem && pantryItem.unit && data.unit && pantryItem.unit !== data.unit) {
      const conv = convertAmount(have, pantryItem.unit, data.unit)
      if (conv !== null) haveConverted = conv
    }

    const toBuy = Math.max(0, data.total - haveConverted)
    const isStapleLow = pantryItem?.isStaple && pantryItem.quantity <= pantryItem.lowStockThreshold

    if (toBuy <= 0 && !isStapleLow) continue

    const displayParts: string[] = []
    if (toBuy > 0) {
      displayParts.push(`${Math.round(toBuy * 10) / 10}${data.unit ? ` ${data.unit}` : ""}`)
    }
    if (isStapleLow && toBuy <= 0) {
      displayParts.push("restock")
    }

    result.push({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      needed: Math.round(data.total * 10) / 10,
      have: Math.round(haveConverted * 10) / 10,
      toBuy: Math.round(toBuy * 10) / 10,
      unit: data.unit,
      entries: data.entries,
      displayAmount: displayParts.join(" — "),
    })
  }

  return result.sort((a, b) => {
    const aStaple = pantryMap.get(normalizeKey(a.name))?.isStaple ?? false
    const bStaple = pantryMap.get(normalizeKey(b.name))?.isStaple ?? false
    if (aStaple && !bStaple) return -1
    if (bStaple && !aStaple) return 1
    return a.name.localeCompare(b.name)
  })
}

const ShoppingList: React.FC<ShoppingListProps> = ({ plan, meals, pantryItems, onGoToPlan }) => {
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)

  const items = useMemo(() => {
    if (!plan) return []
    return buildShoppingList(plan, meals, pantryItems)
  }, [plan, meals, pantryItems])

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
        <p className={styles.emptyText}>All stocked up!</p>
        <p className={styles.emptyHint}>Your pantry has everything you need for this week.</p>
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
            <div className={styles.itemInfo}>
              <span className={styles.itemName}>{item.name}</span>
              {item.toBuy > 0 && item.have > 0 && (
                <span className={styles.itemDetail}>
                  need {item.needed}{item.unit ? ` ${item.unit}` : ""}, have {item.have}
                </span>
              )}
            </div>
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
                <div className={styles.itemInfo}>
                  <span className={styles.itemName}>{item.name}</span>
                </div>
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
