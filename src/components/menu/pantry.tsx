"use client"

import React, { useState, useMemo } from "react"
import styles from "./pantry.module.scss"
import { Meal, getUniqueIngredientNames } from "./types"

interface PantryProps {
  meals: Meal[]
  pantryInStock: string[]
  onToggle: (ingredientName: string, inStock: boolean) => void
}

const Pantry: React.FC<PantryProps> = ({ meals, pantryInStock, onToggle }) => {
  const [search, setSearch] = useState("")

  const stockSet = useMemo(
    () => new Set(pantryInStock.map((n) => n.toLowerCase().trim())),
    [pantryInStock]
  )

  const allIngredients = useMemo(() => getUniqueIngredientNames(meals), [meals])

  const ingredientMealMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const meal of meals) {
      for (const ing of meal.ingredients) {
        const key = ing.name.toLowerCase().trim()
        if (!key) continue
        if (!map.has(key)) map.set(key, [])
        const list = map.get(key)!
        if (!list.includes(meal.name)) list.push(meal.name)
      }
    }
    return map
  }, [meals])

  const filtered = allIngredients.filter((name) =>
    name.toLowerCase().includes(search.toLowerCase())
  )

  const inStockItems = filtered.filter((n) => stockSet.has(n.toLowerCase()))
  const outOfStockItems = filtered.filter((n) => !stockSet.has(n.toLowerCase()))

  if (allIngredients.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyText}>Your pantry is empty</p>
        <p className={styles.emptyHint}>
          Add meals with ingredients and they&apos;ll show up here.
        </p>
      </div>
    )
  }

  const inStockCount = allIngredients.filter((n) => stockSet.has(n.toLowerCase())).length

  return (
    <div className={styles.pantry}>
      <div className={styles.summary}>
        <span className={styles.summaryCount}>{inStockCount}/{allIngredients.length}</span>
        <span className={styles.summaryLabel}>ingredients in stock</span>
      </div>

      {allIngredients.length > 8 && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.search}
          placeholder="Search ingredients..."
        />
      )}

      <div className={styles.list}>
        {outOfStockItems.map((name) => (
          <PantryItem
            key={name}
            name={name}
            inStock={false}
            usedIn={ingredientMealMap.get(name.toLowerCase()) ?? []}
            onToggle={onToggle}
          />
        ))}
        {inStockItems.length > 0 && outOfStockItems.length > 0 && (
          <hr className={styles.divider} />
        )}
        {inStockItems.map((name) => (
          <PantryItem
            key={name}
            name={name}
            inStock={true}
            usedIn={ingredientMealMap.get(name.toLowerCase()) ?? []}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  )
}

interface PantryItemProps {
  name: string
  inStock: boolean
  usedIn: string[]
  onToggle: (name: string, inStock: boolean) => void
}

const PantryItem: React.FC<PantryItemProps> = ({ name, inStock, usedIn, onToggle }) => {
  return (
    <label className={`${styles.item} ${inStock ? styles.itemInStock : ""}`}>
      <input
        type="checkbox"
        checked={inStock}
        onChange={() => onToggle(name, !inStock)}
        className={styles.checkbox}
      />
      <div className={styles.itemInfo}>
        <span className={styles.itemName}>{name}</span>
        {usedIn.length > 0 && (
          <span className={styles.itemUsedIn}>
            {usedIn.slice(0, 3).join(", ")}
            {usedIn.length > 3 && ` +${usedIn.length - 3}`}
          </span>
        )}
      </div>
    </label>
  )
}

export default Pantry
