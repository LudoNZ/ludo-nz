"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import styles from "./mealForm.module.scss"
import Button from "@/components/button/button"
import { Meal, Ingredient, CookingStep, UNITS, generateStepId, MEAL_CATEGORIES, MealCategory, CATEGORY_LABELS, DIFFICULTY_LABELS } from "./types"
import { SaveMealData } from "@/app/menu/[code]/menuSessionPage"

interface MealFormProps {
  meal: Meal | null
  variationParent: Meal | null
  allIngredientNames: string[]
  availableSubMeals: Meal[]
  allMeals: Meal[]
  onSave: (data: SaveMealData) => Promise<void>
  onClose: () => void
}

const MealForm: React.FC<MealFormProps> = ({
  meal, variationParent, allIngredientNames, availableSubMeals, allMeals, onSave, onClose,
}) => {
  const source = meal ?? variationParent

  const [name, setName] = useState(
    variationParent ? `${variationParent.name} (variation)` : (meal?.name ?? "")
  )
  const [isSubMeal, setIsSubMeal] = useState(source?.isSubMeal ?? false)
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    source?.ingredients?.length ? [...source.ingredients] : [{ name: "", amount: "", unit: "" }]
  )
  const [selectedSubMealIds, setSelectedSubMealIds] = useState<string[]>(source?.subMealIds ?? [])
  const [steps, setSteps] = useState<CookingStep[]>(
    source?.steps?.length
      ? source.steps.map((s) => ({ ...s }))
      : [{ id: generateStepId(), text: "", afterStepIds: [] }]
  )
  const [categories, setCategories] = useState<MealCategory[]>(source?.categories ?? [])
  const [difficulty, setDifficulty] = useState(source?.difficulty ?? 0)
  const [rating, setRating] = useState(source?.rating ?? 0)
  const [maxPerWeek, setMaxPerWeek] = useState<string>(
    source?.maxPerWeek !== null && source?.maxPerWeek !== undefined ? String(source.maxPerWeek) : ""
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const [activeAutocomplete, setActiveAutocomplete] = useState<number | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const autocompleteRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setActiveAutocomplete(null)
        setSuggestions([])
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  // --- Ingredients ---
  const addIngredient = useCallback(() => {
    setIngredients((prev) => [...prev, { name: "", amount: "", unit: "" }])
  }, [])

  const removeIngredient = useCallback((index: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const updateIngredient = useCallback((index: number, field: keyof Ingredient, value: string) => {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === index ? { ...ing, [field]: value } : ing))
    )
    if (field === "name") {
      if (value.length >= 1) {
        const matches = allIngredientNames.filter(
          (n) => n.toLowerCase().includes(value.toLowerCase()) && n.toLowerCase() !== value.toLowerCase()
        )
        setSuggestions(matches.slice(0, 6))
        setActiveAutocomplete(index)
      } else {
        setSuggestions([])
        setActiveAutocomplete(null)
      }
    }
  }, [allIngredientNames])

  const selectSuggestion = useCallback((index: number, value: string) => {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === index ? { ...ing, name: value } : ing))
    )
    setSuggestions([])
    setActiveAutocomplete(null)
  }, [])

  // --- Steps ---
  const addStep = useCallback(() => {
    setSteps((prev) => [...prev, { id: generateStepId(), text: "", afterStepIds: [] }])
  }, [])

  const removeStep = useCallback((index: number) => {
    setSteps((prev) => {
      const removedId = prev[index].id
      return prev
        .filter((_, i) => i !== index)
        .map((s) => ({ ...s, afterStepIds: s.afterStepIds.filter((id) => id !== removedId) }))
    })
  }, [])

  const updateStepText = useCallback((index: number, text: string) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, text } : s)))
  }, [])

  const toggleStepDependency = useCallback((stepIndex: number, depId: string) => {
    setSteps((prev) => prev.map((s, i) => {
      if (i !== stepIndex) return s
      const has = s.afterStepIds.includes(depId)
      return {
        ...s,
        afterStepIds: has
          ? s.afterStepIds.filter((id) => id !== depId)
          : [...s.afterStepIds, depId],
      }
    }))
  }, [])

  const setStepSubMeal = useCallback((stepIndex: number, subMealId: string | undefined) => {
    setSteps((prev) => prev.map((s, i) => {
      if (i !== stepIndex) return s
      const updated = { ...s, subMealId }
      if (subMealId) {
        const subMeal = allMeals.find((m) => m.id === subMealId)
        if (subMeal && !updated.text) {
          updated.text = `Make the ${subMeal.name}`
        }
      }
      return updated
    }))
  }, [allMeals])

  // --- Sub-meals ---
  const toggleSubMeal = useCallback((subMealId: string) => {
    setSelectedSubMealIds((prev) =>
      prev.includes(subMealId)
        ? prev.filter((id) => id !== subMealId)
        : [...prev, subMealId]
    )
  }, [])

  // --- Save ---
  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError("Give your meal a name")
      return
    }

    const validIngredients = ingredients.filter((i) => i.name.trim())
    const validSteps = steps.filter((s) => s.text.trim())

    setSaving(true)
    setError("")
    try {
      await onSave({
        name: trimmedName,
        isSubMeal,
        parentId: variationParent ? variationParent.id : (meal?.parentId ?? null),
        categories,
        ingredients: validIngredients,
        subMealIds: selectedSubMealIds,
        steps: validSteps,
        difficulty,
        rating,
        maxPerWeek: maxPerWeek ? parseInt(maxPerWeek, 10) : null,
      })
    } catch {
      setError("Something went wrong. Try again.")
    } finally {
      setSaving(false)
    }
  }

  const filteredSubMeals = availableSubMeals.filter((sm) =>
    !meal || sm.id !== meal.id
  )

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>

        <h2 className={styles.title}>
          {meal ? "Edit Meal" : variationParent ? "Create Variation" : "Add a Meal"}
        </h2>

        {variationParent && (
          <p className={styles.variationNote}>Based on: {variationParent.name}</p>
        )}

        {error && <p className={styles.error}>{error}</p>}

        {/* Name */}
        <label className={styles.label}>What&apos;s it called?</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={styles.input}
          placeholder="e.g. Spaghetti Bolognese"
          maxLength={80}
          autoFocus
        />

        {/* Type toggle */}
        <div className={styles.typeToggle}>
          <button
            className={`${styles.typeBtn} ${!isSubMeal ? styles.typeBtnActive : ""}`}
            onClick={() => setIsSubMeal(false)}
          >
            Full Meal
          </button>
          <button
            className={`${styles.typeBtn} ${isSubMeal ? styles.typeBtnActive : ""}`}
            onClick={() => setIsSubMeal(true)}
          >
            Component
          </button>
          <span className={styles.typeHint}>
            {isSubMeal ? "A part of other meals (e.g. white sauce)" : "A complete meal"}
          </span>
        </div>

        {/* Categories */}
        {!isSubMeal && (
          <>
            <label className={styles.label}>When do you eat it?</label>
            <div className={styles.categoryRow}>
              {MEAL_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  className={`${styles.categoryBtn} ${categories.includes(cat) ? styles.categoryBtnActive : ""}`}
                  onClick={() => setCategories((prev) =>
                    prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
                  )}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Difficulty + Rating + Frequency */}
        <div className={styles.metaRow}>
          <div className={styles.metaGroup}>
            <label className={styles.metaLabel}>Difficulty</label>
            <div className={styles.difficultyRow}>
              {DIFFICULTY_LABELS.map((label, i) => (
                <button
                  key={label}
                  className={`${styles.difficultyBtn} ${difficulty === i + 1 ? styles.difficultyActive : ""}`}
                  onClick={() => setDifficulty(difficulty === i + 1 ? 0 : i + 1)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.metaGroup}>
            <label className={styles.metaLabel}>Rating</label>
            <div className={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  className={`${styles.starBtn} ${rating >= star ? styles.starActive : ""}`}
                  onClick={() => setRating(rating === star ? 0 : star)}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
        </div>

        {!isSubMeal && (
          <div className={styles.frequencyRow}>
            <label className={styles.metaLabel}>Max per week</label>
            <input
              type="number"
              value={maxPerWeek}
              onChange={(e) => setMaxPerWeek(e.target.value)}
              className={styles.frequencyInput}
              placeholder="No limit"
              min={1}
              max={14}
            />
          </div>
        )}

        {/* Sub-meals / Components */}
        {filteredSubMeals.length > 0 && (
          <>
            <label className={styles.label}>Uses components</label>
            <div className={styles.subMealList}>
              {filteredSubMeals.map((sm) => (
                <label key={sm.id} className={styles.subMealItem}>
                  <input
                    type="checkbox"
                    checked={selectedSubMealIds.includes(sm.id)}
                    onChange={() => toggleSubMeal(sm.id)}
                  />
                  <span>{sm.name}</span>
                </label>
              ))}
            </div>
          </>
        )}

        {/* Ingredients */}
        <label className={styles.label}>Ingredients</label>
        <div className={styles.ingredientList} ref={autocompleteRef}>
          {ingredients.map((ing, i) => (
            <div key={i} className={styles.ingredientRow}>
              <div className={styles.ingredientNameWrap}>
                <input
                  type="text"
                  value={ing.name}
                  onChange={(e) => updateIngredient(i, "name", e.target.value)}
                  className={styles.ingredientName}
                  placeholder="Ingredient"
                  maxLength={40}
                />
                {activeAutocomplete === i && suggestions.length > 0 && (
                  <div className={styles.autocomplete}>
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        className={styles.autocompleteItem}
                        onMouseDown={(e) => { e.preventDefault(); selectSuggestion(i, s) }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="text"
                value={ing.amount}
                onChange={(e) => updateIngredient(i, "amount", e.target.value)}
                className={styles.ingredientAmount}
                placeholder="Qty"
                maxLength={10}
              />
              <select
                value={ing.unit}
                onChange={(e) => updateIngredient(i, "unit", e.target.value)}
                className={styles.ingredientUnit}
              >
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
              {ingredients.length > 1 && (
                <button className={styles.removeBtn} onClick={() => removeIngredient(i)} title="Remove">
                  −
                </button>
              )}
            </div>
          ))}
        </div>
        <button className={styles.addBtn} onClick={addIngredient}>
          + Add ingredient
        </button>

        {/* Steps */}
        <label className={styles.label}>Steps</label>
        <div className={styles.stepList}>
          {steps.map((step, i) => (
            <div key={step.id} className={styles.stepRow}>
              <span className={styles.stepNumber}>{i + 1}</span>
              <div className={styles.stepContent}>
                <input
                  type="text"
                  value={step.text}
                  onChange={(e) => updateStepText(i, e.target.value)}
                  className={styles.stepInput}
                  placeholder={`Step ${i + 1}`}
                  maxLength={200}
                />

                {/* Predecessor links */}
                {i > 0 && (
                  <div className={styles.stepMeta}>
                    <span className={styles.stepMetaLabel}>After:</span>
                    <div className={styles.stepDeps}>
                      {steps.slice(0, i).map((dep, depIdx) => (
                        <button
                          key={dep.id}
                          className={`${styles.stepDepBtn} ${step.afterStepIds.includes(dep.id) ? styles.stepDepActive : ""}`}
                          onClick={() => toggleStepDependency(i, dep.id)}
                          title={dep.text || `Step ${depIdx + 1}`}
                        >
                          {depIdx + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sub-meal reference */}
                {filteredSubMeals.length > 0 && (
                  <div className={styles.stepMeta}>
                    <select
                      value={step.subMealId ?? ""}
                      onChange={(e) => setStepSubMeal(i, e.target.value || undefined)}
                      className={styles.stepSubMealSelect}
                    >
                      <option value="">No component</option>
                      {filteredSubMeals.map((sm) => (
                        <option key={sm.id} value={sm.id}>Uses: {sm.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {steps.length > 1 && (
                <button className={styles.removeBtn} onClick={() => removeStep(i)} title="Remove step">
                  −
                </button>
              )}
            </div>
          ))}
        </div>
        <button className={styles.addBtn} onClick={addStep}>
          + Add step
        </button>

        <div className={styles.actions}>
          <Button onClick={handleSave} disabled={saving} size="large">
            {saving ? "Saving..." : "Save"}
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
