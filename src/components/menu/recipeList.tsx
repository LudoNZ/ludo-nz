"use client"

import React, { useState } from "react"
import styles from "./recipes.module.scss"
import { Recipe, CookState } from "./recipeTypes"

interface Props {
  recipes: Recipe[]
  cooks: CookState[]
  onOpen: (recipe: Recipe) => void
  onNew: () => void
  onAddPancakes: () => Promise<void>
}

export default function RecipeList({ recipes, cooks, onOpen, onNew, onAddPancakes }: Props) {
  const [adding, setAdding] = useState(false)
  const cooking = new Set(cooks.map((c) => c.recipeId))
  const hasPancakes = recipes.some((r) => /pancake/i.test(r.name))

  const addPancakes = async () => {
    setAdding(true)
    try { await onAddPancakes() } finally { setAdding(false) }
  }

  return (
    <div className={styles.list}>
      <p className={styles.prompt}>What are you cooking?</p>

      {recipes.length > 0 && (
        <div className={styles.grid}>
          {recipes.map((r) => {
            const timed = r.steps.filter((s) => s.timer || s.batch).length
            return (
              <button key={r.id} className={styles.card} onClick={() => onOpen(r)}>
                {cooking.has(r.id) && <span className={styles.badge}>Cooking now</span>}
                <span className={styles.cardName}>{r.name}</span>
                <span className={styles.cardMeta}>
                  {r.ingredients.length} ingredients · {r.steps.length} steps
                  {timed > 0 && ` · ${timed} timed`}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className={styles.listActions}>
        <button className={styles.primaryBtn} onClick={onNew}>+ New recipe</button>
        {!hasPancakes && (
          <button className={styles.secondaryBtn} onClick={addPancakes} disabled={adding}>
            {adding ? "Adding..." : "Add fluffy pancakes recipe"}
          </button>
        )}
      </div>
    </div>
  )
}
