"use client"

import React, { useState, useMemo } from "react"
import styles from "./optionEditor.module.scss"
import Button from "@/components/button/button"
import { Meal, PantryItem, IngredientCategory, Ingredient, UNITS } from "./types"

export interface SaveOptionData {
  name: string
  ingredients: Ingredient[]
  subMealIds: string[]
}

interface Props {
  availableComponents: Meal[]
  pantryItems: PantryItem[]
  categories: IngredientCategory[]
  onSave: (data: SaveOptionData) => Promise<void>
  onClose: () => void
  initialName?: string
}

interface IngredientSelection {
  pantryItemId: string
  name: string
  amount: string
  unit: string
}

type View = "ingredients" | "components"

export default function OptionEditor({
  availableComponents,
  pantryItems,
  categories,
  onSave,
  onClose,
  initialName = "",
}: Props) {
  const [view, setView] = useState<View>("ingredients")
  const [name, setName] = useState(initialName)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    categories[0]?.name ?? null
  )
  const [ingredientSelections, setIngredientSelections] = useState<IngredientSelection[]>([])
  const [selectedComponentIds, setSelectedComponentIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.order - b.order),
    [categories]
  )

  const uncategorizedItems = useMemo(
    () => pantryItems.filter((p) => !p.category),
    [pantryItems]
  )

  const categoryItems = useMemo(() => {
    const q = search.toLowerCase()
    const items = selectedCategory
      ? pantryItems.filter((p) => p.category === selectedCategory)
      : uncategorizedItems
    return q ? items.filter((p) => p.name.toLowerCase().includes(q)) : items
  }, [pantryItems, selectedCategory, uncategorizedItems, search])

  const allCategoryOptions = useMemo(() => {
    const cats = sortedCategories.map((c) => c.name)
    if (uncategorizedItems.length > 0) cats.push("__uncategorised__")
    return cats
  }, [sortedCategories, uncategorizedItems])

  function toggleIngredient(item: PantryItem) {
    const exists = ingredientSelections.find((s) => s.pantryItemId === item.id)
    if (exists) {
      setIngredientSelections((prev) => prev.filter((s) => s.pantryItemId !== item.id))
    } else {
      setIngredientSelections((prev) => [
        ...prev,
        { pantryItemId: item.id, name: item.name, amount: "", unit: item.unit || "" },
      ])
    }
  }

  function updateSelection(pantryItemId: string, field: "amount" | "unit", value: string) {
    setIngredientSelections((prev) =>
      prev.map((s) => (s.pantryItemId === pantryItemId ? { ...s, [field]: value } : s))
    )
  }

  function toggleComponent(id: string) {
    setSelectedComponentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  async function handleSave() {
    if (!name.trim()) { setError("Give this option a name."); return }
    if (ingredientSelections.length === 0 && selectedComponentIds.length === 0) {
      setError("Add at least one ingredient or component.")
      return
    }
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        ingredients: ingredientSelections.map((s) => ({
          name: s.name,
          amount: s.amount,
          unit: s.unit,
        })),
        subMealIds: selectedComponentIds,
      })
      onClose()
    } catch {
      setError("Failed to save. Try again.")
      setSaving(false)
    }
  }

  const totalSelected = ingredientSelections.length + selectedComponentIds.length

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Add Option</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.nameRow}>
          <input
            className={styles.nameInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Option name (e.g. Chicken Tikka)"
            maxLength={60}
            autoFocus
          />
        </div>

        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewBtn} ${view === "ingredients" ? styles.viewBtnActive : ""}`}
            onClick={() => setView("ingredients")}
          >
            Ingredients
            {ingredientSelections.length > 0 && (
              <span className={styles.badge}>{ingredientSelections.length}</span>
            )}
          </button>
          <button
            className={`${styles.viewBtn} ${view === "components" ? styles.viewBtnActive : ""}`}
            onClick={() => setView("components")}
          >
            Components
            {selectedComponentIds.length > 0 && (
              <span className={styles.badge}>{selectedComponentIds.length}</span>
            )}
          </button>
        </div>

        {view === "ingredients" && (
          <div className={styles.ingredientsView}>
            {sortedCategories.length > 0 && (
              <div className={styles.categoryTabs}>
                {allCategoryOptions.map((cat) => (
                  <button
                    key={cat}
                    className={`${styles.categoryTab} ${selectedCategory === cat || (cat === "__uncategorised__" && selectedCategory === null) ? styles.categoryTabActive : ""}`}
                    onClick={() => setSelectedCategory(cat === "__uncategorised__" ? null : cat)}
                  >
                    {cat === "__uncategorised__" ? "Other" : cat}
                  </button>
                ))}
              </div>
            )}

            {pantryItems.length > 8 && (
              <input
                className={styles.searchInput}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ingredients..."
              />
            )}

            {categoryItems.length === 0 ? (
              <p className={styles.empty}>
                {pantryItems.length === 0
                  ? "No pantry items yet. Add ingredients to your pantry first, or load demo data."
                  : "No items in this category."}
              </p>
            ) : (
              <div className={styles.itemGrid}>
                {categoryItems.map((item) => {
                  const sel = ingredientSelections.find((s) => s.pantryItemId === item.id)
                  const isSelected = !!sel
                  return (
                    <div
                      key={item.id}
                      className={`${styles.itemCard} ${isSelected ? styles.itemCardSelected : ""}`}
                    >
                      <button
                        className={styles.itemToggle}
                        onClick={() => toggleIngredient(item)}
                      >
                        <span className={styles.itemCheck}>{isSelected ? "✓" : "+"}</span>
                        <span className={styles.itemName}>{item.name}</span>
                      </button>
                      {isSelected && (
                        <div className={styles.itemAmountRow}>
                          <input
                            className={styles.amountInput}
                            value={sel.amount}
                            onChange={(e) => updateSelection(item.id, "amount", e.target.value)}
                            placeholder="amount"
                            type="number"
                            min="0"
                          />
                          <select
                            className={styles.unitSelect}
                            value={sel.unit}
                            onChange={(e) => updateSelection(item.id, "unit", e.target.value)}
                          >
                            {UNITS.map((u) => (
                              <option key={u.value} value={u.value}>{u.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {view === "components" && (
          <div className={styles.componentsView}>
            {availableComponents.length === 0 ? (
              <p className={styles.empty}>No components yet. Create sub-meal components first.</p>
            ) : (
              <div className={styles.componentList}>
                {availableComponents.map((comp) => {
                  const isSelected = selectedComponentIds.includes(comp.id)
                  return (
                    <label key={comp.id} className={`${styles.componentItem} ${isSelected ? styles.componentItemSelected : ""}`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleComponent(comp.id)}
                        className={styles.componentCheckbox}
                      />
                      <div className={styles.componentInfo}>
                        <span className={styles.componentName}>{comp.name}</span>
                        {comp.ingredients.length > 0 && (
                          <span className={styles.componentIngredients}>
                            {comp.ingredients.slice(0, 4).map((i) => i.name).join(", ")}
                            {comp.ingredients.length > 4 ? "..." : ""}
                          </span>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {ingredientSelections.length > 0 && (
          <div className={styles.selectedSummary}>
            <span className={styles.selectedLabel}>Selected:</span>
            <div className={styles.selectedChips}>
              {ingredientSelections.map((s) => (
                <span key={s.pantryItemId} className={styles.chip}>
                  {s.name}
                  {s.amount ? ` ${s.amount}${s.unit}` : ""}
                  <button
                    className={styles.chipRemove}
                    onClick={() => setIngredientSelections((prev) => prev.filter((x) => x.pantryItemId !== s.pantryItemId))}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.footer}>
          <span className={styles.count}>
            {totalSelected > 0 ? `${totalSelected} item${totalSelected !== 1 ? "s" : ""} selected` : ""}
          </span>
          <div className={styles.footerBtns}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Option"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
