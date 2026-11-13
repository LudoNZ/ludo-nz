"use client"

import { useEffect, useState } from "react"
import styles from "./finance.module.scss"

/** Number input that lets you clear and retype without snapping back to 0. */
const NumberField: React.FC<{
  label?: string
  value: number
  onChange: (v: number) => void
  prefix?: string
  suffix?: string
  step?: number
  min?: number
  max?: number
  disabled?: boolean
  /** Render only the input (no label wrapper), for inline rows. */
  bare?: boolean
}> = ({ label, value, onChange, prefix, suffix, step = 1, min = 0, max, disabled, bare }) => {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    if (Number(text) !== value) setText(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const input = (
    <span className={styles.numberInput}>
      {prefix && <span className={styles.affix}>{prefix}</span>}
      <input
        type="number"
        inputMode="decimal"
        value={text}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          setText(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value !== "" && Number.isFinite(n)) {
            onChange(Math.min(max ?? Infinity, Math.max(min, n)))
          }
        }}
        onBlur={() => setText(String(value))}
      />
      {suffix && <span className={styles.affix}>{suffix}</span>}
    </span>
  )

  if (bare) return input
  return (
    <div className={styles.field}>
      <label>{label}</label>
      {input}
    </div>
  )
}

export default NumberField
