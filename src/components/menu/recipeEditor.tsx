"use client"

import React, { useState } from "react"
import styles from "./recipes.module.scss"
import {
  Recipe, RecipeStep, RecipeIngredient, BatchPhase, StepTimerMode, newId,
} from "./recipeTypes"

export type SaveRecipeData = Omit<Recipe, "id" | "createdAt" | "updatedAt">

interface Props {
  recipe: Recipe | null
  onSave: (data: SaveRecipeData) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}

/** Keep ingredient ids stable across edits so ticked items stay ticked. */
function linesToIngredients(text: string, prev: RecipeIngredient[]): RecipeIngredient[] {
  const byText = new Map(prev.map((i) => [i.text.trim(), i.id]))
  const used = new Set<string>()
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line, idx) => {
    let id = byText.get(line)
    if (!id || used.has(id)) id = prev[idx] && !used.has(prev[idx].id) ? prev[idx].id : newId()
    used.add(id)
    return { id, text: line }
  })
}

function emptyStep(): RecipeStep {
  return { id: newId(), text: "", timer: null, batch: null }
}

function splitSeconds(total: number): [string, string] {
  return [String(Math.floor(total / 60)), String(total % 60)]
}

export default function RecipeEditor({ recipe, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(recipe?.name ?? "")
  const [description, setDescription] = useState(recipe?.description ?? "")
  const [servings, setServings] = useState(recipe?.servings ?? "")
  const [ingredientsText, setIngredientsText] = useState(recipe?.ingredients.map((i) => i.text).join("\n") ?? "")
  const [steps, setSteps] = useState<RecipeStep[]>(recipe?.steps.length ? recipe.steps.map((s) => ({ ...s })) : [emptyStep()])
  const [notesText, setNotesText] = useState(recipe?.notes.join("\n\n") ?? "")
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState("")

  const updateStep = (id: string, patch: Partial<RecipeStep>) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  const moveStep = (i: number, dir: -1 | 1) =>
    setSteps((prev) => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const setTimerMode = (step: RecipeStep, mode: StepTimerMode | "none") => {
    if (mode === "none") updateStep(step.id, { timer: null })
    else updateStep(step.id, { timer: { mode, seconds: step.timer?.seconds || 60, label: step.timer?.label ?? "" } })
  }

  const setTimerSeconds = (step: RecipeStep, mins: string, secs: string) => {
    if (!step.timer) return
    const total = Math.max(0, (parseInt(mins) || 0) * 60 + (parseInt(secs) || 0))
    updateStep(step.id, { timer: { ...step.timer, seconds: total } })
  }

  const setPhases = (step: RecipeStep, phases: BatchPhase[]) => {
    if (!step.batch) return
    updateStep(step.id, { batch: { ...step.batch, phases } })
  }

  const handleSave = async () => {
    if (!name.trim()) { setError("Give the recipe a name"); return }
    const cleanSteps = steps
      .filter((s) => s.text.trim())
      .map((s) => ({
        ...s,
        text: s.text.trim(),
        batch: s.batch
          ? { label: s.batch.label.trim() || "Batch", phases: s.batch.phases.filter((p) => p.label.trim()) }
          : null,
      }))
    if (cleanSteps.length === 0) { setError("Add at least one step"); return }
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        servings: servings.trim(),
        ingredients: linesToIngredients(ingredientsText, recipe?.ingredients ?? []),
        steps: cleanSteps,
        notes: notesText.split(/\n\s*\n/).map((n) => n.trim()).filter(Boolean),
      })
    } catch {
      setError("Couldn't save. Try again.")
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2>{recipe ? "Edit recipe" : "New recipe"}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          <label className={styles.field}>
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fluffy Pancakes" />
          </label>
          <label className={styles.field}>
            <span>Description</span>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Makes</span>
            <input value={servings} onChange={(e) => setServings(e.target.value)} placeholder="~10 pancakes" />
          </label>
          <label className={styles.field}>
            <span>Ingredients <em>(one per line)</em></span>
            <textarea rows={6} value={ingredientsText} onChange={(e) => setIngredientsText(e.target.value)} placeholder={"2 cups plain flour\n4 tsp baking powder"} />
          </label>

          <div className={styles.field}>
            <span>Steps</span>
            <ol className={styles.stepEditors}>
              {steps.map((step, i) => {
                const [mins, secs] = splitSeconds(step.timer?.seconds ?? 0)
                return (
                  <li key={step.id} className={styles.stepEditor}>
                    <div className={styles.stepEditorHead}>
                      <strong>{i + 1}</strong>
                      <div className={styles.stepEditorBtns}>
                        <button onClick={() => moveStep(i, -1)} disabled={i === 0} title="Move up">↑</button>
                        <button onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} title="Move down">↓</button>
                        <button onClick={() => setSteps((p) => p.filter((s) => s.id !== step.id))} disabled={steps.length === 1} title="Remove step">✕</button>
                      </div>
                    </div>
                    <textarea rows={3} value={step.text} onChange={(e) => updateStep(step.id, { text: e.target.value })} placeholder="What to do" />

                    <div className={styles.inlineRow}>
                      <label>
                        Timer
                        <select value={step.timer?.mode ?? "none"} onChange={(e) => setTimerMode(step, e.target.value as StepTimerMode | "none")}>
                          <option value="none">None</option>
                          <option value="countdown">Countdown</option>
                          <option value="stopwatch">Stopwatch</option>
                        </select>
                      </label>
                      {step.timer?.mode === "countdown" && (
                        <span className={styles.duration}>
                          <input type="number" min={0} value={mins} onChange={(e) => setTimerSeconds(step, e.target.value, secs)} aria-label="Minutes" />m
                          <input type="number" min={0} max={59} value={secs} onChange={(e) => setTimerSeconds(step, mins, e.target.value)} aria-label="Seconds" />s
                        </span>
                      )}
                      {step.timer && (
                        <input
                          className={styles.grow}
                          value={step.timer.label}
                          onChange={(e) => updateStep(step.id, { timer: { ...step.timer!, label: e.target.value } })}
                          placeholder="Timer label"
                        />
                      )}
                    </div>

                    <label className={styles.checkRow}>
                      <input
                        type="checkbox"
                        checked={!!step.batch}
                        onChange={(e) => updateStep(step.id, {
                          batch: e.target.checked ? { label: "Batch", phases: [{ label: "Side 1", targetSeconds: null }, { label: "Side 2", targetSeconds: null }] } : null,
                        })}
                      />
                      Repeat in batches and time each one
                    </label>

                    {step.batch && (
                      <div className={styles.batchEditor}>
                        <label className={styles.inlineRow}>
                          Each batch is a
                          <input className={styles.grow} value={step.batch.label} onChange={(e) => updateStep(step.id, { batch: { ...step.batch!, label: e.target.value } })} placeholder="Pancake" />
                        </label>
                        <span className={styles.hint}>Phases (tap through each one while cooking):</span>
                        {step.batch.phases.map((p, pi) => (
                          <div key={pi} className={styles.inlineRow}>
                            <input className={styles.grow} value={p.label} placeholder="Phase name" onChange={(e) => setPhases(step, step.batch!.phases.map((x, xi) => xi === pi ? { ...x, label: e.target.value } : x))} />
                            <input
                              type="number" min={0} className={styles.narrow} placeholder="target s"
                              value={p.targetSeconds ?? ""}
                              onChange={(e) => setPhases(step, step.batch!.phases.map((x, xi) => xi === pi ? { ...x, targetSeconds: e.target.value === "" ? null : Math.max(0, parseInt(e.target.value) || 0) } : x))}
                              aria-label="Target seconds"
                            />s
                            <button className={styles.iconBtn} onClick={() => setPhases(step, step.batch!.phases.filter((_, xi) => xi !== pi))}>✕</button>
                          </div>
                        ))}
                        <button className={styles.linkBtn} onClick={() => setPhases(step, [...step.batch!.phases, { label: "", targetSeconds: null }])}>+ Add phase</button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
            <button className={styles.linkBtn} onClick={() => setSteps((p) => [...p, emptyStep()])}>+ Add step</button>
          </div>

          <label className={styles.field}>
            <span>Notes <em>(blank line between notes)</em></span>
            <textarea rows={5} value={notesText} onChange={(e) => setNotesText(e.target.value)} />
          </label>

          {error && <p className={styles.error}>{error}</p>}
        </div>

        <div className={styles.footer}>
          {recipe && onDelete && (
            confirmDelete ? (
              <span className={styles.confirm}>
                Delete recipe?
                <button className={styles.dangerBtn} onClick={() => void onDelete()}>Delete</button>
                <button className={styles.secondaryBtn} onClick={() => setConfirmDelete(false)}>Keep</button>
              </span>
            ) : (
              <button className={styles.linkBtnDanger} onClick={() => setConfirmDelete(true)}>Delete</button>
            )
          )}
          <span className={styles.spacer} />
          <button className={styles.secondaryBtn} onClick={onClose}>Cancel</button>
          <button className={styles.primaryBtn} onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  )
}
