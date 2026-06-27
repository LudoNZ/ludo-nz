"use client"

import React, { useState, useMemo } from "react"
import styles from "./pantry.module.scss"
import Button from "@/components/button/button"
import { PantryItem, Meal, IngredientCategory, UNITS, normalizeKey } from "./types"

interface PantryProps {
  meals: Meal[]
  pantryItems: PantryItem[]
  categories: IngredientCategory[]
  onUpdate: (itemId: string, updates: Partial<PantryItem>) => void
  onAdd: (name: string, unit: string, isStaple: boolean, category?: string) => void
  onDelete: (itemId: string) => void
  onAddAllFromMeals: () => void
  onAddCategory: (name: string) => void
  onDeleteCategory: (id: string) => void
  onReorderCategories: (reordered: IngredientCategory[]) => void
}

const Pantry: React.FC<PantryProps> = ({
  meals, pantryItems, categories,
  onUpdate, onAdd, onDelete, onAddAllFromMeals,
  onAddCategory, onDeleteCategory,
}) => {
  const [search, setSearch] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState("")
  const [newUnit, setNewUnit] = useState("")
  const [newStaple, setNewStaple] = useState(false)
  const [newCategory, setNewCategory] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [newCatName, setNewCatName] = useState("")
  const [selectedViewCategory, setSelectedViewCategory] = useState<string | "all" | "uncategorised">("all")

  const ingredientMealMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const meal of meals) {
      for (const ing of meal.ingredients) {
        const key = normalizeKey(ing.name)
        if (!key) continue
        if (!map.has(key)) map.set(key, [])
        const list = map.get(key)!
        if (!list.includes(meal.name)) list.push(meal.name)
      }
    }
    return map
  }, [meals])

  const missingFromPantry = useMemo(() => {
    const pantryNames = new Set(pantryItems.map((p) => normalizeKey(p.name)))
    const allIngNames = new Set<string>()
    for (const meal of meals) {
      for (const ing of meal.ingredients) {
        const key = normalizeKey(ing.name)
        if (key && !pantryNames.has(key)) allIngNames.add(key)
      }
    }
    return allIngNames.size
  }, [meals, pantryItems])

  function sortItems(items: PantryItem[]) {
    return [...items].sort((a, b) => {
      const aLow = a.quantity <= a.lowStockThreshold
      const bLow = b.quantity <= b.lowStockThreshold
      const aEmpty = a.quantity <= 0
      const bEmpty = b.quantity <= 0
      if (aEmpty && a.isStaple && !(bEmpty && b.isStaple)) return -1
      if (bEmpty && b.isStaple && !(aEmpty && a.isStaple)) return 1
      if (aLow && !bLow) return -1
      if (bLow && !aLow) return 1
      if (a.isStaple && !b.isStaple) return -1
      if (b.isStaple && !a.isStaple) return 1
      return a.name.localeCompare(b.name)
    })
  }

  const q = search.toLowerCase()

  const filteredItems = useMemo(() => {
    const base = q
      ? pantryItems.filter((p) => p.name.toLowerCase().includes(q))
      : pantryItems.filter((p) => {
          if (selectedViewCategory === "all") return true
          if (selectedViewCategory === "uncategorised") return !p.category
          return p.category === selectedViewCategory
        })
    return sortItems(base)
  }, [pantryItems, q, selectedViewCategory])

  const categoryGroups = useMemo(() => {
    if (q || selectedViewCategory !== "all") return null

    const groups: { label: string; items: PantryItem[] }[] = []
    for (const cat of categories) {
      const items = sortItems(pantryItems.filter((p) => p.category === cat.name))
      if (items.length > 0) groups.push({ label: cat.name, items })
    }
    const uncategorised = sortItems(pantryItems.filter((p) => !p.category))
    if (uncategorised.length > 0) groups.push({ label: "Other", items: uncategorised })
    return groups
  }, [pantryItems, categories, q, selectedViewCategory])

  const lowStockCount = pantryItems.filter(
    (p) => p.quantity <= p.lowStockThreshold || (p.isStaple && p.quantity <= 0)
  ).length

  const handleAdd = () => {
    if (!newName.trim()) return
    onAdd(newName.trim(), newUnit, newStaple, newCategory || undefined)
    setNewName("")
    setNewUnit("")
    setNewStaple(false)
    setNewCategory("")
    setShowAddForm(false)
  }

  const handleAddCategory = () => {
    if (!newCatName.trim()) return
    onAddCategory(newCatName.trim())
    setNewCatName("")
  }

  function renderItem(item: PantryItem) {
    const isLow = item.quantity <= item.lowStockThreshold && item.quantity > 0
    const isEmpty = item.quantity <= 0
    const isAlert = item.isStaple && isEmpty
    const isEditing = editingId === item.id
    const usedIn = ingredientMealMap.get(normalizeKey(item.name)) ?? []

    return (
      <div
        key={item.id}
        className={`${styles.item} ${isAlert ? styles.itemAlert : ""} ${isEmpty ? styles.itemEmpty : ""} ${isLow ? styles.itemLow : ""}`}
      >
        <div className={styles.itemMain} onClick={() => setEditingId(isEditing ? null : item.id)}>
          <div className={styles.itemLeft}>
            {item.isStaple && <span className={styles.stapleIcon}>◆</span>}
            <span className={styles.itemName}>{item.name}</span>
          </div>
          <div className={styles.itemRight}>
            <span className={styles.itemQty}>
              {item.quantity}{item.unit ? ` ${item.unit}` : ""}
            </span>
            {isAlert && <span className={styles.alertIcon}>!</span>}
            {isLow && !isAlert && <span className={styles.lowIcon}>↓</span>}
          </div>
        </div>

        {isEditing && (
          <div className={styles.itemEdit}>
            <div className={styles.editRow}>
              <label className={styles.editLabel}>Quantity</label>
              <div className={styles.qtyControls}>
                <button
                  className={styles.qtyBtn}
                  onClick={() => onUpdate(item.id, { quantity: Math.max(0, item.quantity - 1) })}
                >
                  −
                </button>
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => onUpdate(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                  className={styles.qtyInput}
                  min={0}
                  step="any"
                />
                <button
                  className={styles.qtyBtn}
                  onClick={() => onUpdate(item.id, { quantity: item.quantity + 1 })}
                >
                  +
                </button>
              </div>
            </div>

            <div className={styles.editRow}>
              <label className={styles.editLabel}>Unit</label>
              <select
                value={item.unit}
                onChange={(e) => onUpdate(item.id, { unit: e.target.value })}
                className={styles.editSelect}
              >
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>

            <div className={styles.editRow}>
              <label className={styles.editLabel}>Category</label>
              <select
                value={item.category ?? ""}
                onChange={(e) => onUpdate(item.id, { category: e.target.value || undefined })}
                className={styles.editSelect}
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.editRow}>
              <label className={styles.editLabel}>Low stock at</label>
              <input
                type="number"
                value={item.lowStockThreshold}
                onChange={(e) => onUpdate(item.id, { lowStockThreshold: parseFloat(e.target.value) || 0 })}
                className={styles.thresholdInput}
                min={0}
                step="any"
              />
            </div>

            <div className={styles.editRow}>
              <label className={styles.stapleCheck}>
                <input
                  type="checkbox"
                  checked={item.isStaple}
                  onChange={(e) => onUpdate(item.id, { isStaple: e.target.checked })}
                />
                Staple item (always show, alert when empty)
              </label>
            </div>

            {usedIn.length > 0 && (
              <p className={styles.usedIn}>
                Used in: {usedIn.slice(0, 4).join(", ")}
                {usedIn.length > 4 && ` +${usedIn.length - 4}`}
              </p>
            )}

            <div className={styles.editActions}>
              {deletingId === item.id ? (
                <div className={styles.deleteConfirm}>
                  <span>Remove from pantry?</span>
                  <button className={styles.deleteYes} onClick={() => { onDelete(item.id); setDeletingId(null); setEditingId(null) }}>Yes</button>
                  <button className={styles.deleteNo} onClick={() => setDeletingId(null)}>No</button>
                </div>
              ) : (
                <button className={styles.removeLink} onClick={() => setDeletingId(item.id)}>
                  Remove
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={styles.pantry}>
      {/* Summary */}
      <div className={styles.summary}>
        <span className={styles.summaryCount}>{pantryItems.length}</span>
        <span className={styles.summaryLabel}>items tracked</span>
        {lowStockCount > 0 && (
          <span className={styles.alertBadge}>{lowStockCount} low</span>
        )}
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <Button onClick={() => setShowAddForm(!showAddForm)} variant="secondary" size="medium">
          + Add Item
        </Button>
        {missingFromPantry > 0 && (
          <Button onClick={onAddAllFromMeals} variant="secondary" size="medium">
            + Add {missingFromPantry} from meals
          </Button>
        )}
        <button
          className={styles.manageCatsBtn}
          onClick={() => setShowCategoryManager(!showCategoryManager)}
        >
          {showCategoryManager ? "Done" : "Categories"}
        </button>
      </div>

      {/* Category manager */}
      {showCategoryManager && (
        <div className={styles.categoryManager}>
          <div className={styles.categoryManagerHeader}>
            <span className={styles.categoryManagerTitle}>Ingredient Categories</span>
          </div>
          <div className={styles.categoryList}>
            {categories.length === 0 && (
              <p className={styles.noCats}>No categories yet. Add one below.</p>
            )}
            {categories.map((cat) => (
              <div key={cat.id} className={styles.categoryRow}>
                <span className={styles.catName}>{cat.name}</span>
                <button
                  className={styles.catDeleteBtn}
                  onClick={() => onDeleteCategory(cat.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className={styles.addCatRow}>
            <input
              className={styles.addCatInput}
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
              placeholder="New category name"
            />
            <Button size="small" onClick={handleAddCategory}>Add</Button>
          </div>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className={styles.addForm}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Item name"
            className={styles.addInput}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <select
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            className={styles.addUnit}
          >
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
          {categories.length > 0 && (
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className={styles.addUnit}
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          )}
          <label className={styles.stapleToggle}>
            <input type="checkbox" checked={newStaple} onChange={(e) => setNewStaple(e.target.checked)} />
            Staple
          </label>
          <Button onClick={handleAdd} size="small">Add</Button>
        </div>
      )}

      {/* Category filter tabs (shown when categories exist and not searching) */}
      {categories.length > 0 && !q && (
        <div className={styles.categoryFilterTabs}>
          <button
            className={`${styles.filterTab} ${selectedViewCategory === "all" ? styles.filterTabActive : ""}`}
            onClick={() => setSelectedViewCategory("all")}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`${styles.filterTab} ${selectedViewCategory === cat.name ? styles.filterTabActive : ""}`}
              onClick={() => setSelectedViewCategory(cat.name)}
            >
              {cat.name}
            </button>
          ))}
          {pantryItems.some((p) => !p.category) && (
            <button
              className={`${styles.filterTab} ${selectedViewCategory === "uncategorised" ? styles.filterTabActive : ""}`}
              onClick={() => setSelectedViewCategory("uncategorised")}
            >
              Other
            </button>
          )}
        </div>
      )}

      {/* Search */}
      {pantryItems.length > 8 && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.search}
          placeholder="Search pantry..."
        />
      )}

      {/* Items */}
      {pantryItems.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>Pantry is empty</p>
          <p className={styles.emptyHint}>Add items manually or pull them in from your meals.</p>
        </div>
      ) : categoryGroups && categories.length > 0 ? (
        <div className={styles.groupedList}>
          {categoryGroups.map((group) => (
            <div key={group.label} className={styles.categoryGroup}>
              <div className={styles.categoryGroupHeader}>{group.label}</div>
              <div className={styles.list}>
                {group.items.map(renderItem)}
              </div>
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>No matches</p>
          <p className={styles.emptyHint}>Try a different search.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {filteredItems.map(renderItem)}
        </div>
      )}
    </div>
  )
}

export default Pantry
