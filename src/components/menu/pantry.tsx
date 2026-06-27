"use client"

import React, { useState, useMemo } from "react"
import styles from "./pantry.module.scss"
import Button from "@/components/button/button"
import { PantryItem, Meal, UNITS, normalizeKey } from "./types"

interface PantryProps {
  meals: Meal[]
  pantryItems: PantryItem[]
  onUpdate: (itemId: string, updates: Partial<PantryItem>) => void
  onAdd: (name: string, unit: string, isStaple: boolean) => void
  onDelete: (itemId: string) => void
  onAddAllFromMeals: () => void
}

const Pantry: React.FC<PantryProps> = ({
  meals, pantryItems, onUpdate, onAdd, onDelete, onAddAllFromMeals,
}) => {
  const [search, setSearch] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState("")
  const [newUnit, setNewUnit] = useState("")
  const [newStaple, setNewStaple] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  const filtered = pantryItems
    .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
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

  const lowStockCount = pantryItems.filter(
    (p) => p.quantity <= p.lowStockThreshold || (p.isStaple && p.quantity <= 0)
  ).length

  const handleAdd = () => {
    if (!newName.trim()) return
    onAdd(newName.trim(), newUnit, newStaple)
    setNewName("")
    setNewUnit("")
    setNewStaple(false)
    setShowAddForm(false)
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
      </div>

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
          <label className={styles.stapleToggle}>
            <input type="checkbox" checked={newStaple} onChange={(e) => setNewStaple(e.target.checked)} />
            Staple
          </label>
          <Button onClick={handleAdd} size="small">Add</Button>
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
      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>
            {pantryItems.length === 0 ? "Pantry is empty" : "No matches"}
          </p>
          <p className={styles.emptyHint}>
            {pantryItems.length === 0
              ? "Add items manually or pull them in from your meals."
              : "Try a different search."}
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {filtered.map((item) => {
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
          })}
        </div>
      )}
    </div>
  )
}

export default Pantry
