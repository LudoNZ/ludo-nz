"use client"

import React, { useState, useEffect } from "react"
import styles from "./templateForm.module.scss"
import Button from "@/components/button/button"
import { MealTemplate, TemplateSection, Meal, PantryItem, IngredientCategory, generateSectionId } from "./types"
import OptionEditor, { SaveOptionData } from "./optionEditor"

export interface SaveTemplateData {
  name: string
  sections: TemplateSection[]
}

interface Props {
  template: MealTemplate | null
  availableSubMeals: Meal[]
  pantryItems: PantryItem[]
  categories: IngredientCategory[]
  onSave: (data: SaveTemplateData) => Promise<void>
  onClose: () => void
  onCreateOption: (data: SaveOptionData) => Promise<string>
}

export default function TemplateForm({
  template,
  availableSubMeals,
  pantryItems,
  categories,
  onSave,
  onClose,
  onCreateOption,
}: Props) {
  const [name, setName] = useState(template?.name ?? "")
  const [sections, setSections] = useState<TemplateSection[]>(
    template?.sections?.length
      ? template.sections.map((s) => ({ ...s, optionIds: [...s.optionIds] }))
      : [{ id: generateSectionId(), name: "", isOptional: false, optionIds: [] }]
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [optionEditorSection, setOptionEditorSection] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (optionEditorSection) {
          setOptionEditorSection(null)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, optionEditorSection])

  function updateSection(id: string, patch: Partial<TemplateSection>) {
    setSections((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s))
  }

  function addSection() {
    setSections((prev) => [...prev, { id: generateSectionId(), name: "", isOptional: false, optionIds: [] }])
  }

  function removeSection(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id))
  }

  function removeOption(sectionId: string, mealId: string) {
    setSections((prev) => prev.map((s) =>
      s.id === sectionId ? { ...s, optionIds: s.optionIds.filter((id) => id !== mealId) } : s
    ))
  }

  async function handleOptionSave(data: SaveOptionData) {
    if (!optionEditorSection) return
    const newId = await onCreateOption(data)
    setSections((prev) => prev.map((s) =>
      s.id === optionEditorSection
        ? { ...s, optionIds: [...s.optionIds, newId] }
        : s
    ))
    setOptionEditorSection(null)
  }

  async function handleSave() {
    if (!name.trim()) { setError("Template needs a name."); return }
    const validSections = sections.filter((s) => s.name.trim())
    if (validSections.length === 0) { setError("Add at least one named section."); return }
    setSaving(true)
    try {
      await onSave({ name: name.trim(), sections: validSections })
      onClose()
    } catch {
      setError("Failed to save. Please try again.")
      setSaving(false)
    }
  }

  const currentSectionForEditor = optionEditorSection
    ? sections.find((s) => s.id === optionEditorSection)
    : null

  const componentsForSection = optionEditorSection
    ? availableSubMeals.filter((m) => !sections
        .find((s) => s.id === optionEditorSection)
        ?.optionIds.includes(m.id))
    : availableSubMeals

  return (
    <>
      <div
        className={styles.overlay}
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className={styles.modal}>
          <div className={styles.modalHeader}>
            <h2 className={styles.modalTitle}>{template ? "Edit Template" : "New Template"}</h2>
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          </div>

          <div className={styles.body}>
            <div className={styles.field}>
              <label className={styles.label}>Name</label>
              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Pizza, Pasta, Burgers"
                maxLength={60}
                autoFocus
              />
            </div>

            <div className={styles.sectionsArea}>
              <label className={styles.label}>Sections</label>

              {sections.map((section, sIdx) => {
                const sectionOptions = section.optionIds
                  .map((id) => availableSubMeals.find((m) => m.id === id))
                  .filter(Boolean) as Meal[]

                return (
                  <div key={section.id} className={styles.sectionCard}>
                    <div className={styles.sectionHeader}>
                      <span className={styles.sectionNumber}>{sIdx + 1}</span>
                      <input
                        className={styles.sectionNameInput}
                        value={section.name}
                        onChange={(e) => updateSection(section.id, { name: e.target.value })}
                        placeholder="Section name (e.g. Protein, Sauce)"
                        maxLength={40}
                      />
                      <label className={styles.optionalLabel}>
                        <input
                          type="checkbox"
                          checked={section.isOptional}
                          onChange={(e) => updateSection(section.id, { isOptional: e.target.checked })}
                        />
                        Optional
                      </label>
                      <button
                        className={styles.removeSectionBtn}
                        onClick={() => removeSection(section.id)}
                        title="Remove section"
                      >
                        ✕
                      </button>
                    </div>

                    {sectionOptions.length > 0 && (
                      <div className={styles.optionList}>
                        {sectionOptions.map((meal) => (
                          <div key={meal.id} className={styles.optionChip}>
                            <span>{meal.name}</span>
                            <button
                              className={styles.removeOptionBtn}
                              onClick={() => removeOption(section.id, meal.id)}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className={styles.addOptionArea}>
                      <button
                        className={styles.addOptionBtn}
                        onClick={() => setOptionEditorSection(section.id)}
                      >
                        + Add Option
                      </button>
                      {sectionOptions.length === 0 && (
                        <span className={styles.addOptionHint}>
                          Add options that users can swipe through
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}

              <button className={styles.addSectionBtn} onClick={addSection}>
                + Add Section
              </button>
            </div>

            {error && <p className={styles.error}>{error}</p>}
          </div>

          <div className={styles.footer}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Template"}
            </Button>
          </div>
        </div>
      </div>

      {optionEditorSection && (
        <OptionEditor
          availableComponents={componentsForSection}
          pantryItems={pantryItems}
          categories={categories}
          initialName={currentSectionForEditor?.name ? `${currentSectionForEditor.name} Option` : ""}
          onSave={handleOptionSave}
          onClose={() => setOptionEditorSection(null)}
        />
      )}
    </>
  )
}
