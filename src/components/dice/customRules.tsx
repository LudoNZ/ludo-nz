"use client"

import React, { useState } from "react"
import styles from "./customRules.module.scss"
import Button from "@/components/button/button"
import { CustomRule } from "./types"

interface CustomRulesProps {
  rules: CustomRule[]
  onAdd: (rule: CustomRule) => void
  onToggle: (ruleId: string) => void
  onRemove: (ruleId: string) => void
}

type TriggerType = "rollSum" | "doubles" | "drought" | "hotNumber"

const DOUBLES_OPTIONS = [0, 1, 2, 3, 4, 5, 6]

const CustomRules: React.FC<CustomRulesProps> = ({ rules, onAdd, onToggle, onRemove }) => {
  const [expanded, setExpanded] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [triggerType, setTriggerType] = useState<TriggerType>("rollSum")
  const [triggerValue, setTriggerValue] = useState(7)
  const [action, setAction] = useState("")

  const handleAdd = () => {
    if (!action.trim()) return

    const rule: CustomRule = {
      id: crypto.randomUUID(),
      text: buildRuleText(triggerType, triggerValue),
      enabled: true,
      trigger: { type: triggerType, value: triggerValue },
      action: action.trim(),
    }

    onAdd(rule)
    setAction("")
    setShowForm(false)
  }

  const resetForm = () => {
    setTriggerType("rollSum")
    setTriggerValue(7)
    setAction("")
  }

  return (
    <div className={styles.rules}>
      <button className={styles.toggle} onClick={() => setExpanded(!expanded)}>
        <h3 className={styles.heading}>
          House Rules ({rules.length})
        </h3>
        <span className={styles.arrow}>{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div className={styles.content}>
          {rules.length === 0 && !showForm && (
            <p className={styles.empty}>No house rules yet</p>
          )}

          {rules.map((rule) => (
            <div key={rule.id} className={`${styles.rule} ${!rule.enabled ? styles.disabled : ""}`}>
              <button
                className={styles.enableToggle}
                onClick={() => onToggle(rule.id)}
                title={rule.enabled ? "Disable" : "Enable"}
              >
                {rule.enabled ? "ON" : "OFF"}
              </button>
              <div className={styles.ruleText}>
                <span className={styles.ruleCondition}>{rule.text}</span>
                <span className={styles.ruleAction}>{rule.action}</span>
              </div>
              <button className={styles.removeBtn} onClick={() => onRemove(rule.id)}>×</button>
            </div>
          ))}

          {showForm ? (
            <div className={styles.form}>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>When</label>
                <select
                  value={triggerType}
                  onChange={(e) => {
                    const t = e.target.value as TriggerType
                    setTriggerType(t)
                    if (t === "rollSum") setTriggerValue(7)
                    else if (t === "doubles") setTriggerValue(0)
                    else if (t === "drought") setTriggerValue(10)
                    else if (t === "hotNumber") setTriggerValue(3)
                  }}
                  className={styles.select}
                >
                  <option value="rollSum">Roll sum equals...</option>
                  <option value="doubles">Doubles rolled</option>
                  <option value="drought">Drought (no 7s for...)</option>
                  <option value="hotNumber">Hot number (same total × in a row)</option>
                </select>
              </div>

              {triggerType === "rollSum" && (
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>Sum</label>
                  <input
                    type="number"
                    min={2}
                    max={12}
                    value={triggerValue}
                    onChange={(e) => setTriggerValue(Number(e.target.value))}
                    className={styles.numberInput}
                  />
                </div>
              )}

              {triggerType === "doubles" && (
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>Which</label>
                  <div className={styles.doublesGrid}>
                    {DOUBLES_OPTIONS.map((v) => (
                      <button
                        key={v}
                        className={`${styles.doublesBtn} ${triggerValue === v ? styles.doublesActive : ""}`}
                        onClick={() => setTriggerValue(v)}
                        type="button"
                      >
                        {v === 0 ? "Any" : `${v}+${v}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {triggerType === "drought" && (
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>Rolls</label>
                  <input
                    type="number"
                    min={3}
                    max={50}
                    value={triggerValue}
                    onChange={(e) => setTriggerValue(Number(e.target.value))}
                    className={styles.numberInput}
                  />
                  <span className={styles.formHint}>rolls without a 7</span>
                </div>
              )}

              {triggerType === "hotNumber" && (
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>Count</label>
                  <input
                    type="number"
                    min={2}
                    max={10}
                    value={triggerValue}
                    onChange={(e) => setTriggerValue(Number(e.target.value))}
                    className={styles.numberInput}
                  />
                  <span className={styles.formHint}>same total in a row</span>
                </div>
              )}

              <div className={styles.formRow}>
                <label className={styles.formLabel}>Then show</label>
                <input
                  type="text"
                  placeholder='e.g. "Robber activated!"'
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className={styles.textInput}
                  maxLength={60}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
              </div>

              <div className={styles.formActions}>
                <Button onClick={handleAdd} disabled={!action.trim()} size="small">
                  Add Rule
                </Button>
                <Button onClick={() => { setShowForm(false); resetForm() }} variant="secondary" size="small">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => { setShowForm(true); resetForm() }} variant="secondary" size="small">
              + Add Rule
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function buildRuleText(type: TriggerType, value: number): string {
  switch (type) {
    case "rollSum":
      return `When roll sum = ${value}`
    case "doubles":
      return value === 0 ? "When any doubles rolled" : `When double ${value}s rolled`
    case "drought":
      return `When ${value} rolls without a 7`
    case "hotNumber":
      return `When same total ${value}× in a row`
  }
}

export default CustomRules
