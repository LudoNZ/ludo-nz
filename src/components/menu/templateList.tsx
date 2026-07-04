"use client"

import React, { useState } from "react"
import styles from "./templateList.module.scss"
import { MealTemplate, Meal } from "./types"
import PlanPicker from "./planPicker"

interface PlanPickerState {
  mealId: string
  mealName: string
}

interface Props {
  templates: MealTemplate[]
  savedMeals: Meal[]
  onSelectTemplate: (template: MealTemplate) => void
  onNewTemplate: () => void
  onEditTemplate: (template: MealTemplate) => void
  onDeleteTemplate: (id: string) => void
  onPlanSavedMeal: (mealId: string, mealName: string, day: string, slot: "lunch" | "dinner") => void
  onDeleteSavedMeal: (id: string) => void
  onLoadDemoData?: () => Promise<void>
}

export default function TemplateList({
  templates,
  savedMeals,
  onSelectTemplate,
  onNewTemplate,
  onEditTemplate,
  onDeleteTemplate,
  onPlanSavedMeal,
  onDeleteSavedMeal,
  onLoadDemoData,
}: Props) {
  const [planPicker, setPlanPicker] = useState<PlanPickerState | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmDeleteMeal, setConfirmDeleteMeal] = useState<string | null>(null)
  const [loadingDemo, setLoadingDemo] = useState(false)
  const [demoLoaded, setDemoLoaded] = useState(false)

  async function handleLoadDemo() {
    if (!onLoadDemoData || loadingDemo) return
    setLoadingDemo(true)
    try {
      await onLoadDemoData()
      setDemoLoaded(true)
    } finally {
      setLoadingDemo(false)
    }
  }

  async function handlePlanPick(day: string, slot: "lunch" | "dinner") {
    if (!planPicker) return
    onPlanSavedMeal(planPicker.mealId, planPicker.mealName, day, slot)
  }

  return (
    <div className={styles.templateList}>
      <p className={styles.prompt}>What are you making?</p>

      {templates.length === 0 && onLoadDemoData && !demoLoaded && (
        <div className={styles.demoPrompt}>
          <p className={styles.demoText}>Start fresh or load demo data to explore the builder.</p>
          <button
            className={styles.demoBtn}
            onClick={handleLoadDemo}
            disabled={loadingDemo}
          >
            {loadingDemo ? "Loading demo..." : "Load Demo Data"}
          </button>
        </div>
      )}

      <div className={styles.templateGrid}>
        {templates.map((t) => (
          <div key={t.id} className={styles.templateCard}>
            <button
              className={styles.templateCardMain}
              onClick={() => onSelectTemplate(t)}
            >
              <span className={styles.templateName}>{t.name}</span>
              <span className={styles.templateMeta}>
                {t.sections.length} section{t.sections.length !== 1 ? "s" : ""}
              </span>
            </button>
            <div className={styles.templateCardActions}>
              <button
                className={styles.iconBtn}
                onClick={(e) => { e.stopPropagation(); onEditTemplate(t) }}
                title="Edit template"
              >
                ✎
              </button>
              {confirmDelete === t.id ? (
                <>
                  <button className={styles.confirmBtn} onClick={() => { onDeleteTemplate(t.id); setConfirmDelete(null) }}>Yes</button>
                  <button className={styles.cancelBtn} onClick={() => setConfirmDelete(null)}>No</button>
                </>
              ) : (
                <button
                  className={styles.iconBtn}
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(t.id) }}
                  title="Delete template"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}

        <button className={styles.newTemplateCard} onClick={onNewTemplate}>
          <span className={styles.newTemplateIcon}>+</span>
          <span className={styles.newTemplateLabel}>New Type</span>
        </button>
      </div>

      {savedMeals.length > 0 && (
        <div className={styles.savedSection}>
          <h2 className={styles.savedHeading}>Saved Meals</h2>
          <div className={styles.savedList}>
            {savedMeals.map((meal) => (
              <div key={meal.id} className={styles.savedMeal}>
                <span className={styles.savedMealName}>{meal.name}</span>
                <div className={styles.savedMealActions}>
                  <button
                    className={styles.planBtn}
                    onClick={() => setPlanPicker({ mealId: meal.id, mealName: meal.name })}
                  >
                    Plan
                  </button>
                  {confirmDeleteMeal === meal.id ? (
                    <>
                      <button className={styles.confirmBtn} onClick={() => { onDeleteSavedMeal(meal.id); setConfirmDeleteMeal(null) }}>Yes</button>
                      <button className={styles.cancelBtn} onClick={() => setConfirmDeleteMeal(null)}>No</button>
                    </>
                  ) : (
                    <button
                      className={styles.iconBtn}
                      onClick={() => setConfirmDeleteMeal(meal.id)}
                      title="Delete meal"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {planPicker && (
        <PlanPicker
          mealName={planPicker.mealName}
          onPick={handlePlanPick}
          onClose={() => setPlanPicker(null)}
        />
      )}
    </div>
  )
}
