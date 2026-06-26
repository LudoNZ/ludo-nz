"use client"

import React, { useState } from "react"
import styles from "./customRules.module.scss"
import Button from "@/components/button/button"
import { CustomRule, DiceConfig, DEFAULT_DICE_CONFIG } from "./types"
import { SOUND_OPTIONS, playSound } from "./sounds"

interface CustomRulesProps {
  rules: CustomRule[]
  triggerCounts: Map<string, number>
  diceConfig: DiceConfig
  onAdd: (rule: CustomRule) => void
  onUpdate: (rule: CustomRule) => void
  onToggle: (ruleId: string) => void
  onRemove: (ruleId: string) => void
}

type TriggerType = "rollSum" | "doubles" | "drought" | "hotNumber"

const ALL_TOTALS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

const CustomRules: React.FC<CustomRulesProps> = ({ rules, triggerCounts, diceConfig, onAdd, onUpdate, onToggle, onRemove }) => {
  const config = diceConfig || DEFAULT_DICE_CONFIG
  const [expanded, setExpanded] = useState(false)
  const [formMode, setFormMode] = useState<"closed" | "add" | "edit">("closed")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const [triggerType, setTriggerType] = useState<TriggerType>("rollSum")
  const [triggerValue, setTriggerValue] = useState(7)
  const [droughtNumber, setDroughtNumber] = useState(7)
  const [droughtOngoing, setDroughtOngoing] = useState(false)
  const [selectedDoubles, setSelectedDoubles] = useState<Set<number>>(new Set([1, 2, 3, 4, 5, 6]))
  const [selectedHotTotals, setSelectedHotTotals] = useState<Set<number>>(new Set(ALL_TOTALS))
  const [selectedDiceIndices, setSelectedDiceIndices] = useState<Set<number>>(new Set(config.dice.map((_, i) => i)))
  const [selectedSumValues, setSelectedSumValues] = useState<Set<number>>(new Set([7]))
  const [selectedDroughtNumbers, setSelectedDroughtNumbers] = useState<Set<number>>(new Set([7]))
  const [action, setAction] = useState("")
  const [selectedSound, setSelectedSound] = useState("alert")

  const toggleDouble = (v: number) => {
    const next = new Set(selectedDoubles)
    if (next.has(v)) next.delete(v); else next.add(v)
    setSelectedDoubles(next)
  }
  const toggleAllDoubles = () => {
    setSelectedDoubles(selectedDoubles.size === 6 ? new Set() : new Set([1, 2, 3, 4, 5, 6]))
  }
  const toggleHotTotal = (v: number) => {
    const next = new Set(selectedHotTotals)
    if (next.has(v)) next.delete(v); else next.add(v)
    setSelectedHotTotals(next)
  }
  const toggleAllHotTotals = () => {
    setSelectedHotTotals(selectedHotTotals.size === ALL_TOTALS.length ? new Set() : new Set(ALL_TOTALS))
  }
  const activeDice = Array.from(selectedDiceIndices)
  const sumMin = activeDice.length > 0 ? activeDice.length : 1
  const sumMax = activeDice.length > 0 ? activeDice.reduce((s, i) => s + config.dice[i], 0) : 6
  const allSumValues = Array.from({ length: sumMax - sumMin + 1 }, (_, i) => sumMin + i)

  const toggleSumValue = (v: number) => {
    const next = new Set(selectedSumValues)
    if (next.has(v)) { if (next.size > 1) next.delete(v) } else next.add(v)
    setSelectedSumValues(next)
  }
  const toggleAllSums = () => {
    setSelectedSumValues(selectedSumValues.size === allSumValues.length ? new Set([allSumValues[0]]) : new Set(allSumValues))
  }

  const toggleDroughtNumber = (v: number) => {
    const next = new Set(selectedDroughtNumbers)
    if (next.has(v)) { if (next.size > 1) next.delete(v) } else next.add(v)
    setSelectedDroughtNumbers(next)
  }
  const toggleAllDroughtNumbers = () => {
    setSelectedDroughtNumbers(selectedDroughtNumbers.size === allSumValues.length ? new Set([allSumValues[0]]) : new Set(allSumValues))
  }

  const toggleDieIndex = (i: number) => {
    const next = new Set(selectedDiceIndices)
    if (next.has(i)) { if (next.size > 1) next.delete(i) } else next.add(i)
    setSelectedDiceIndices(next)
  }
  const toggleAllDice = () => {
    const all = config.dice.map((_, i) => i)
    setSelectedDiceIndices(selectedDiceIndices.size === all.length ? new Set([0]) : new Set(all))
  }

  const resetForm = () => {
    setTriggerType("rollSum")
    setTriggerValue(7)
    setDroughtNumber(7)
    setDroughtOngoing(false)
    setSelectedDoubles(new Set([1, 2, 3, 4, 5, 6]))
    setSelectedHotTotals(new Set(ALL_TOTALS))
    setSelectedDiceIndices(new Set(config.dice.map((_, i) => i)))
    setSelectedSumValues(new Set([7]))
    setSelectedDroughtNumbers(new Set([7]))
    setAction("")
    setSelectedSound("alert")
    setEditingId(null)
  }

  const loadRule = (rule: CustomRule) => {
    const t = rule.trigger
    setTriggerType(t?.type || "rollSum")
    setTriggerValue(t?.value ?? 7)
    setDroughtNumber(t?.droughtNumber ?? 7)
    setSelectedDoubles(new Set(t?.doublesList || [1, 2, 3, 4, 5, 6]))
    setSelectedHotTotals(new Set(t?.hotNumberTotals || ALL_TOTALS))
    setSelectedDiceIndices(new Set(t?.diceIndices || config.dice.map((_, i) => i)))
    setSelectedSumValues(new Set(t?.sumValues || [t?.value ?? 7]))
    setSelectedDroughtNumbers(new Set(t?.droughtNumbers || [t?.droughtNumber ?? 7]))
    setDroughtOngoing(t?.droughtOngoing ?? false)
    setAction(rule.action)
    setSelectedSound(rule.sound || "alert")
    setEditingId(rule.id)
  }

  const buildRule = (): CustomRule => {
    const sumValues = triggerType === "rollSum" ? Array.from(selectedSumValues).sort((a, b) => a - b) : undefined
    const droughtNumbers = triggerType === "drought" ? Array.from(selectedDroughtNumbers).sort((a, b) => a - b) : undefined
    const doublesList = triggerType === "doubles" ? Array.from(selectedDoubles).sort() : undefined
    const hotNumberTotals = triggerType === "hotNumber" ? Array.from(selectedHotTotals).sort((a, b) => a - b) : undefined
    const allDice = selectedDiceIndices.size === config.dice.length
    const diceIndices = allDice ? undefined : Array.from(selectedDiceIndices).sort((a, b) => a - b)

    return {
      id: editingId || crypto.randomUUID(),
      text: buildRuleText(triggerType, triggerValue, droughtNumber, doublesList, hotNumberTotals, sumValues, droughtNumbers, droughtOngoing),
      enabled: true,
      trigger: {
        type: triggerType,
        value: triggerValue,
        ...(triggerType === "drought" ? { droughtNumber, droughtNumbers, droughtOngoing } : {}),
        ...(triggerType === "doubles" ? { doublesList } : {}),
        ...(triggerType === "hotNumber" ? { hotNumberTotals } : {}),
        ...(triggerType === "rollSum" ? { sumValues } : {}),
        ...(diceIndices ? { diceIndices } : {}),
      },
      action: action.trim(),
      sound: selectedSound,
    }
  }

  const handleSubmit = () => {
    if (!action.trim()) return
    if (triggerType === "rollSum" && selectedSumValues.size === 0) return
    if (triggerType === "doubles" && selectedDoubles.size === 0) return
    if (triggerType === "hotNumber" && selectedHotTotals.size === 0) return

    const rule = buildRule()
    if (formMode === "edit") {
      onUpdate(rule)
    } else {
      onAdd(rule)
    }
    setFormMode("closed")
    resetForm()
  }

  const handleEdit = (rule: CustomRule) => {
    loadRule(rule)
    setFormMode("edit")
  }

  const renderForm = () => (
    <div className={styles.form}>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>When</label>
        <select value={triggerType} onChange={(e) => {
          const t = e.target.value as TriggerType
          setTriggerType(t)
          if (t === "rollSum") setTriggerValue(7)
          else if (t === "doubles") setTriggerValue(0)
          else if (t === "drought") setTriggerValue(10)
          else if (t === "hotNumber") setTriggerValue(3)
        }} className={styles.select}>
          <option value="rollSum">Roll sum equals...</option>
          <option value="doubles">Doubles rolled</option>
          <option value="drought">Drought (no number for...)</option>
          <option value="hotNumber">Hot number (same total × in a row)</option>
        </select>
      </div>

      {config.dice.length > 1 && (
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Applies to</label>
          <div className={styles.doublesGrid}>
            <button className={`${styles.doublesBtn} ${selectedDiceIndices.size === config.dice.length ? styles.doublesActive : ""}`}
              onClick={toggleAllDice} type="button">All</button>
            {config.dice.map((sides, i) => (
              <button key={i} className={`${styles.doublesBtn} ${selectedDiceIndices.has(i) ? styles.doublesActive : ""}`}
                onClick={() => toggleDieIndex(i)} type="button">D{i + 1} (d{sides})</button>
            ))}
          </div>
        </div>
      )}

      {triggerType === "rollSum" && (
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Sum</label>
          <div className={styles.doublesGrid}>
            <button className={`${styles.doublesBtn} ${selectedSumValues.size === allSumValues.length ? styles.doublesActive : ""}`}
              onClick={toggleAllSums} type="button">All</button>
            {allSumValues.map((v) => (
              <button key={v} className={`${styles.doublesBtn} ${selectedSumValues.has(v) ? styles.doublesActive : ""}`}
                onClick={() => toggleSumValue(v)} type="button">{v}</button>
            ))}
          </div>
        </div>
      )}

      {triggerType === "doubles" && (
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Which</label>
          <div className={styles.doublesGrid}>
            <button className={`${styles.doublesBtn} ${selectedDoubles.size === 6 ? styles.doublesActive : ""}`}
              onClick={toggleAllDoubles} type="button">All</button>
            {[1, 2, 3, 4, 5, 6].map((v) => (
              <button key={v} className={`${styles.doublesBtn} ${selectedDoubles.has(v) ? styles.doublesActive : ""}`}
                onClick={() => toggleDouble(v)} type="button">{v}+{v}</button>
            ))}
          </div>
        </div>
      )}

      {triggerType === "drought" && (
        <>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Without</label>
            <div className={styles.doublesGrid}>
              <button className={`${styles.doublesBtn} ${selectedDroughtNumbers.size === allSumValues.length ? styles.doublesActive : ""}`}
                onClick={toggleAllDroughtNumbers} type="button">All</button>
              {allSumValues.map((v) => (
                <button key={v} className={`${styles.doublesBtn} ${selectedDroughtNumbers.has(v) ? styles.doublesActive : ""}`}
                  onClick={() => toggleDroughtNumber(v)} type="button">{v}</button>
              ))}
            </div>
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>For</label>
            <input type="number" min={3} max={50} value={triggerValue}
              onChange={(e) => setTriggerValue(Number(e.target.value))} className={styles.numberInput} />
            <span className={styles.formHint}>rolls without it</span>
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Mode</label>
            <div className={styles.doublesGrid}>
              <button
                className={`${styles.doublesBtn} ${!droughtOngoing ? styles.doublesActive : ""}`}
                onClick={() => setDroughtOngoing(false)}
                type="button"
              >
                Reset
              </button>
              <button
                className={`${styles.doublesBtn} ${droughtOngoing ? styles.doublesActive : ""}`}
                onClick={() => setDroughtOngoing(true)}
                type="button"
              >
                Ongoing
              </button>
            </div>
            <span className={styles.formHint}>{droughtOngoing ? "alerts every roll" : "resets counter"}</span>
          </div>
        </>
      )}

      {triggerType === "hotNumber" && (
        <>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Totals</label>
            <div className={styles.doublesGrid}>
              <button className={`${styles.doublesBtn} ${selectedHotTotals.size === ALL_TOTALS.length ? styles.doublesActive : ""}`}
                onClick={toggleAllHotTotals} type="button">All</button>
              {ALL_TOTALS.map((v) => (
                <button key={v} className={`${styles.doublesBtn} ${selectedHotTotals.has(v) ? styles.doublesActive : ""}`}
                  onClick={() => toggleHotTotal(v)} type="button">{v}</button>
              ))}
            </div>
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Count</label>
            <input type="number" min={2} max={10} value={triggerValue}
              onChange={(e) => setTriggerValue(Number(e.target.value))} className={styles.numberInput} />
            <span className={styles.formHint}>times in a row</span>
          </div>
        </>
      )}

      <div className={styles.formRow}>
        <label className={styles.formLabel}>Then show</label>
        <input type="text" placeholder='e.g. "Robber activated!"' value={action}
          onChange={(e) => setAction(e.target.value)} className={styles.textInput} maxLength={60}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel}>Sound</label>
        <div className={styles.soundGrid}>
          {SOUND_OPTIONS.map((s) => (
            <button key={s.id}
              className={`${styles.soundBtn} ${selectedSound === s.id ? styles.soundActive : ""}`}
              onClick={() => { setSelectedSound(s.id); playSound(s.id) }} type="button">{s.name}</button>
          ))}
        </div>
      </div>

      <div className={styles.formActions}>
        <Button onClick={handleSubmit} disabled={!action.trim()} size="small">
          {formMode === "edit" ? "Save" : "Add Rule"}
        </Button>
        <Button onClick={() => { setFormMode("closed"); resetForm() }} variant="secondary" size="small">
          Cancel
        </Button>
      </div>
    </div>
  )

  return (
    <div className={styles.rules}>
      <button className={styles.toggle} onClick={() => setExpanded(!expanded)}>
        <h3 className={styles.heading}>House Rules ({rules.length})</h3>
        <span className={styles.arrow}>{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div className={styles.content}>
          {rules.length === 0 && formMode === "closed" && (
            <p className={styles.empty}>No house rules yet</p>
          )}

          {rules.map((rule) => (
            <React.Fragment key={rule.id}>
              {formMode === "edit" && editingId === rule.id ? (
                renderForm()
              ) : (
                <div className={`${styles.rule} ${!rule.enabled ? styles.disabled : ""}`}>
                  <button className={styles.enableToggle} onClick={() => onToggle(rule.id)}
                    title={rule.enabled ? "Disable" : "Enable"}>{rule.enabled ? "ON" : "OFF"}</button>
                  <div className={styles.ruleText}>
                    <span className={styles.ruleCondition}>
                      {rule.text}
                      {rule.trigger?.diceIndices && (
                        <span className={styles.diceScope}>
                          {" "}[{rule.trigger.diceIndices.map((i) => `D${i + 1}`).join(", ")}]
                        </span>
                      )}
                    </span>
                    <span className={styles.ruleAction}>
                      {rule.action}
                      {rule.sound && rule.sound !== "none" && (
                        <span className={styles.soundLabel}>{rule.sound}</span>
                      )}
                      {(triggerCounts.get(rule.id) ?? 0) > 0 && (
                        <span className={styles.triggerCount}>×{triggerCounts.get(rule.id)}</span>
                      )}
                    </span>
                  </div>
                  <div className={styles.ruleActions}>
                    <button className={styles.editBtn} onClick={() => handleEdit(rule)} title="Edit">✎</button>
                    {confirmDeleteId === rule.id ? (
                      <div className={styles.confirmDelete}>
                        <span className={styles.confirmLabel}>Delete?</span>
                        <button className={styles.confirmYes} onClick={() => { onRemove(rule.id); setConfirmDeleteId(null) }}>Yes</button>
                        <button className={styles.confirmNo} onClick={() => setConfirmDeleteId(null)}>No</button>
                      </div>
                    ) : (
                      <button className={styles.removeBtn} onClick={() => setConfirmDeleteId(rule.id)}>×</button>
                    )}
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}

          {formMode === "add" ? (
            renderForm()
          ) : formMode === "closed" ? (
            <Button onClick={() => { resetForm(); setFormMode("add") }} variant="secondary" size="small">
              + Add Rule
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}

function buildRuleText(type: TriggerType, value: number, droughtNum?: number, doublesList?: number[], hotTotals?: number[], sumValues?: number[], droughtNumbers?: number[], droughtOngoing?: boolean): string {
  switch (type) {
    case "rollSum":
      if (sumValues && sumValues.length === 1) return `When roll sum = ${sumValues[0]}`
      if (sumValues) return `When roll sum is ${sumValues.join(", ")}`
      return `When roll sum = ${value}`
    case "doubles":
      if (!doublesList || doublesList.length === 6) return "When any doubles rolled"
      return `When doubles: ${doublesList.map((d) => `${d}+${d}`).join(", ")}`
    case "drought":
      const suffix = droughtOngoing ? " (ongoing)" : ""
      if (droughtNumbers && droughtNumbers.length === 1) return `When ${value} rolls without a ${droughtNumbers[0]}${suffix}`
      if (droughtNumbers && droughtNumbers.length > 1) return `When ${value} rolls without ${droughtNumbers.join(", ")}${suffix}`
      return `When ${value} rolls without a ${droughtNum ?? 7}${suffix}`
    case "hotNumber":
      if (!hotTotals || hotTotals.length === ALL_TOTALS.length) return `When any total ${value}× in a row`
      return `When ${hotTotals.join("/")} rolled ${value}× in a row`
  }
}

export default CustomRules
