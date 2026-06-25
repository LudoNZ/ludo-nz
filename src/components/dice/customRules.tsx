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

type TriggerType = "total" | "doubles" | "streak"

const CustomRules: React.FC<CustomRulesProps> = ({ rules, onAdd, onToggle, onRemove }) => {
  const [expanded, setExpanded] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [triggerType, setTriggerType] = useState<TriggerType>("total")
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
                  onChange={(e) => setTriggerType(e.target.value as TriggerType)}
                  className={styles.select}
                >
                  <option value="total">Total equals...</option>
                  <option value="doubles">Doubles rolled</option>
                  <option value="streak">Same total streak of...</option>
                </select>
              </div>

              {triggerType !== "doubles" && (
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>
                    {triggerType === "total" ? "Value" : "Streak count"}
                  </label>
                  <input
                    type="number"
                    min={triggerType === "total" ? 2 : 2}
                    max={triggerType === "total" ? 12 : 10}
                    value={triggerValue}
                    onChange={(e) => setTriggerValue(Number(e.target.value))}
                    className={styles.numberInput}
                  />
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
                <Button onClick={() => setShowForm(false)} variant="secondary" size="small">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setShowForm(true)} variant="secondary" size="small">
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
    case "total":
      return `When total = ${value}`
    case "doubles":
      return `When doubles rolled`
    case "streak":
      return `When ${value}× same total in a row`
  }
}

export default CustomRules
