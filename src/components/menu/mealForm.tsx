"use client"

import React, { useState, useEffect, useCallback } from "react"
import styles from "./mealForm.module.scss"
import Button from "@/components/button/button"
import { Meal, Ingredient } from "./types"

interface MealFormProps {
  meal: Meal | null
  onSave: (name: string, ingredients: Ingredient[], instructions: string) => Promise<void>
  onClose: () => void
}

const MealForm: React.FC<MealFormProps> = ({ meal, onSave, onClose }) => {
  const [name, setName] = useState(meal?.name ?? "")
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    meal?.ingredients?.length ? meal.ingredients : [{ name: "", amount: "" }]
  )
  const [instructions, setInstructions] = useState(meal?.instructions ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const addIngredient = useCallback(() => {
    setIngredients((prev) => [...prev, { name: "", amount: "" }])
  }, [])

  const removeIngredient = useCallback((index: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const updateIngredient = useCallback((index: number, field: keyof Ingredient, value: string) => {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === index ? { ...ing, [field]: value } : ing))
    )
  }, [])

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError("Give your meal a name")
      return
    }

    const validIngredients = ingredients.filter((i) => i.name.trim())
    setSaving(true)
    setError("")
    try {
      await onSave(trimmedName, validIngredients, instructions.trim())
    } catch {
      setError("Something went wrong. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>

        <h2 className={styles.title}>{meal ? "Edit Meal" : "Add a Meal"}</h2>

        {error && <p className={styles.error}>{error}</p>}

        <label className={styles.label}>What&apos;s it called?</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={styles.input}
          placeholder="e.g. Spaghetti Bolognese"
          maxLength={60}
          autoFocus
        />

        <label className={styles.label}>What do you need?</label>
        <div className={styles.ingredientList}>
          {ingredients.map((ing, i) => (
            <div key={i} className={styles.ingredientRow}>
              <input
                type="text"
                value={ing.name}
                onChange={(e) => updateIngredient(i, "name", e.target.value)}
                className={styles.ingredientName}
                placeholder="Ingredient"
                maxLength={40}
              />
              <input
                type="text"
                value={ing.amount}
                onChange={(e) => updateIngredient(i, "amount", e.target.value)}
                className={styles.ingredientAmount}
                placeholder="Amount"
                maxLength={20}
              />
              {ingredients.length > 1 && (
                <button
                  className={styles.removeBtn}
                  onClick={() => removeIngredient(i)}
                  title="Remove"
                >
                  −
                </button>
              )}
            </div>
          ))}
        </div>

        <button className={styles.addIngredientBtn} onClick={addIngredient}>
          + Add ingredient
        </button>

        <label className={styles.label}>How do you make it?</label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className={styles.textarea}
          placeholder="Write the recipe steps here (optional)"
          rows={4}
        />

        <div className={styles.actions}>
          <Button onClick={handleSave} disabled={saving} size="large">
            {saving ? "Saving..." : "Save Meal"}
          </Button>
          <Button onClick={onClose} variant="secondary" size="large">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

export default MealForm
