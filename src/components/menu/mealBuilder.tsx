"use client"

import React, { useState, useRef, useMemo, useCallback, useEffect } from "react"
import styles from "./mealBuilder.module.scss"
import Button from "@/components/button/button"
import { MealTemplate, Meal, DAYS, getAllMealIngredients, Ingredient } from "./types"

interface Props {
  template: MealTemplate
  allMeals: Meal[]
  onBack: () => void
  onSaveMeal: (name: string, subMealIds: string[]) => Promise<string>
  onPlanMeal: (mealId: string, mealName: string, day: string, slot: "lunch" | "dinner") => Promise<void>
}

function mergeIngredients(lists: Ingredient[][]): Ingredient[] {
  const merged: Ingredient[] = []
  for (const list of lists) {
    for (const ing of list) {
      if (!ing.name.trim()) continue
      const existing = merged.find(
        (m) => m.name.toLowerCase().trim() === ing.name.toLowerCase().trim() && m.unit === ing.unit
      )
      if (existing) {
        const a = parseFloat(existing.amount) || 0
        const b = parseFloat(ing.amount) || 0
        existing.amount = String(Math.round((a + b) * 100) / 100)
      } else {
        merged.push({ ...ing })
      }
    }
  }
  return merged
}

export default function MealBuilder({ template, allMeals, onBack, onSaveMeal, onPlanMeal }: Props) {
  const sectionsWithOptions = template.sections.filter((s) =>
    s.optionIds.some((id) => allMeals.find((m) => m.id === id))
  )

  const [selectedIndices, setSelectedIndices] = useState<Record<string, number>>(
    Object.fromEntries(sectionsWithOptions.map((s) => [s.id, 0]))
  )
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [showIngredients, setShowIngredients] = useState(false)
  const [mealName, setMealName] = useState("")
  const [showPlanPicker, setShowPlanPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedConfirm, setSavedConfirm] = useState(false)

  const touchStartX = useRef<Record<string, number>>({})

  const selectedOptions = useMemo(() => {
    return sectionsWithOptions
      .filter((s) => !skipped.has(s.id))
      .map((s) => {
        const options = s.optionIds.map((id) => allMeals.find((m) => m.id === id)).filter(Boolean) as Meal[]
        const idx = selectedIndices[s.id] ?? 0
        return options[idx % options.length] ?? null
      })
      .filter(Boolean) as Meal[]
  }, [sectionsWithOptions, selectedIndices, skipped, allMeals])

  const autoName = useMemo(() => {
    const names = selectedOptions.map((m) => m.name).join(" / ")
    return names ? `${template.name} — ${names}` : template.name
  }, [template.name, selectedOptions])

  useEffect(() => {
    setMealName(autoName)
  }, [autoName])

  const aggregatedIngredients = useMemo(() => {
    const lists = selectedOptions.map((m) => getAllMealIngredients(m, allMeals))
    return mergeIngredients(lists)
  }, [selectedOptions, allMeals])

  const selectedSubMealIds = useMemo(() => selectedOptions.map((m) => m.id), [selectedOptions])

  function cycleOption(sectionId: string, direction: 1 | -1) {
    const section = sectionsWithOptions.find((s) => s.id === sectionId)
    if (!section) return
    const options = section.optionIds.filter((id) => allMeals.find((m) => m.id === id))
    if (options.length <= 1) return
    setSelectedIndices((prev) => {
      const cur = prev[sectionId] ?? 0
      const next = ((cur + direction) + options.length) % options.length
      return { ...prev, [sectionId]: next }
    })
    setSavedId(null)
    setSavedConfirm(false)
  }

  function onTouchStart(sectionId: string, e: React.TouchEvent) {
    touchStartX.current[sectionId] = e.touches[0].clientX
  }

  function onTouchEnd(sectionId: string, e: React.TouchEvent) {
    const start = touchStartX.current[sectionId]
    if (start === undefined) return
    const delta = e.changedTouches[0].clientX - start
    if (Math.abs(delta) > 40) {
      cycleOption(sectionId, delta < 0 ? 1 : -1)
    }
  }

  async function handleSave() {
    if (!mealName.trim()) return
    setSaving(true)
    try {
      const id = await onSaveMeal(mealName.trim(), selectedSubMealIds)
      setSavedId(id)
      setSavedConfirm(true)
      setTimeout(() => setSavedConfirm(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  async function handlePlanPick(day: string, slot: "lunch" | "dinner") {
    setSaving(true)
    try {
      let id = savedId
      if (!id) {
        id = await onSaveMeal(mealName.trim() || autoName, selectedSubMealIds)
        setSavedId(id)
      }
      await onPlanMeal(id, mealName.trim() || autoName, day, slot)
      setShowPlanPicker(false)
      setSavedConfirm(true)
      setTimeout(() => setSavedConfirm(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.builder}>
      <div className={styles.builderHeader}>
        <button className={styles.backBtn} onClick={onBack}>← Back</button>
        <h2 className={styles.builderTitle}>{template.name}</h2>
      </div>

      <div className={styles.sections}>
        {sectionsWithOptions.length === 0 && (
          <p className={styles.noSections}>
            This template has no sections with components yet. Edit the template to add some.
          </p>
        )}

        {sectionsWithOptions.map((section) => {
          const options = section.optionIds
            .map((id) => allMeals.find((m) => m.id === id))
            .filter(Boolean) as Meal[]
          if (options.length === 0) return null

          const isSkipped = skipped.has(section.id)
          const idx = selectedIndices[section.id] ?? 0
          const current = options[idx % options.length]
          const ingredients = getAllMealIngredients(current, allMeals)
          const ingredientPreview = ingredients
            .slice(0, 4)
            .map((i) => i.name)
            .join(", ")
          const hasMore = ingredients.length > 4

          return (
            <div
              key={section.id}
              className={`${styles.sectionRow} ${isSkipped ? styles.sectionSkipped : ""}`}
              onTouchStart={(e) => onTouchStart(section.id, e)}
              onTouchEnd={(e) => onTouchEnd(section.id, e)}
            >
              <div className={styles.sectionMeta}>
                <span className={styles.sectionName}>{section.name.toUpperCase()}</span>
                {section.isOptional && (
                  <button
                    className={`${styles.skipToggle} ${isSkipped ? styles.skipToggleActive : ""}`}
                    onClick={() => setSkipped((prev) => {
                      const next = new Set(prev)
                      next.has(section.id) ? next.delete(section.id) : next.add(section.id)
                      return next
                    })}
                  >
                    {isSkipped ? "include" : "skip"}
                  </button>
                )}
              </div>

              {!isSkipped && (
                <div className={styles.optionRow}>
                  <button
                    className={styles.arrowBtn}
                    onClick={() => cycleOption(section.id, -1)}
                    disabled={options.length <= 1}
                    aria-label="Previous option"
                  >
                    ←
                  </button>

                  <div className={styles.optionCard}>
                    <span className={styles.optionName}>{current.name}</span>
                    {ingredientPreview && (
                      <span className={styles.optionIngredients}>
                        {ingredientPreview}{hasMore ? "..." : ""}
                      </span>
                    )}
                    {options.length > 1 && (
                      <span className={styles.optionDots}>
                        {options.map((_, i) => (
                          <span
                            key={i}
                            className={`${styles.dot} ${i === idx % options.length ? styles.dotActive : ""}`}
                          />
                        ))}
                      </span>
                    )}
                  </div>

                  <button
                    className={styles.arrowBtn}
                    onClick={() => cycleOption(section.id, 1)}
                    disabled={options.length <= 1}
                    aria-label="Next option"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {showIngredients && aggregatedIngredients.length > 0 && (
        <div className={styles.ingredientsPanel}>
          <h3 className={styles.ingredientsPanelTitle}>All Ingredients</h3>
          <ul className={styles.ingredientsList}>
            {aggregatedIngredients.map((ing, i) => (
              <li key={i} className={styles.ingredientItem}>
                <span className={styles.ingredientName}>{ing.name}</span>
                {(ing.amount || ing.unit) && (
                  <span className={styles.ingredientAmount}>
                    {ing.amount} {ing.unit}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.actions}>
        <div className={styles.nameRow}>
          <input
            className={styles.nameInput}
            value={mealName}
            onChange={(e) => setMealName(e.target.value)}
            placeholder={autoName}
            maxLength={80}
          />
        </div>

        <div className={styles.actionBtns}>
          <button
            className={`${styles.ingredientsToggle} ${showIngredients ? styles.ingredientsToggleActive : ""}`}
            onClick={() => setShowIngredients((v) => !v)}
          >
            {showIngredients ? "▲" : "▼"} Ingredients
          </button>

          <Button
            variant="secondary"
            onClick={handleSave}
            disabled={saving || selectedSubMealIds.length === 0}
          >
            {savedConfirm && !showPlanPicker ? "Saved ✓" : saving ? "Saving..." : "Save"}
          </Button>

          <Button
            variant="primary"
            onClick={() => setShowPlanPicker(true)}
            disabled={saving || selectedSubMealIds.length === 0}
          >
            Plan This Meal
          </Button>
        </div>
      </div>

      {showPlanPicker && (
        <div className={styles.overlay} onClick={() => setShowPlanPicker(false)}>
          <div className={styles.planPickerModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.planPickerHeader}>
              <h3>Add to Plan</h3>
              <button className={styles.closeBtn} onClick={() => setShowPlanPicker(false)}>✕</button>
            </div>
            <p className={styles.planPickerMealName}>{mealName || autoName}</p>
            <div className={styles.dayGrid}>
              {DAYS.map((day) => (
                <div key={day} className={styles.dayColumn}>
                  <span className={styles.dayLabel}>{day.slice(0, 3)}</span>
                  <button
                    className={styles.slotBtn}
                    onClick={() => handlePlanPick(day, "lunch")}
                    disabled={saving}
                  >
                    Lunch
                  </button>
                  <button
                    className={styles.slotBtn}
                    onClick={() => handlePlanPick(day, "dinner")}
                    disabled={saving}
                  >
                    Dinner
                  </button>
                </div>
              ))}
            </div>
            {savedConfirm && <p className={styles.planConfirm}>Added to plan ✓</p>}
          </div>
        </div>
      )}
    </div>
  )
}
