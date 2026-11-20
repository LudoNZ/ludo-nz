"use client"

import { InputHTMLAttributes, useState } from "react"

/** A number input that can be cleared and typed over: what's typed is
 * kept as typed while it's being edited, and passed on only once it's a
 * number within min–max (so typing "2" on the way to "250" doesn't snap
 * the stair to the minimum). Leaving it empty or out of range puts back
 * the last good value. */
const DraftNumberInput: React.FC<
  Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max"> & {
    value: number
    min?: number
    max?: number
    onValue: (v: number) => void
  }
> = ({ value, min, max, onValue, onBlur, onKeyDown, ...rest }) => {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      value={draft ?? String(value)}
      onChange={(e) => {
        const text = e.target.value
        setDraft(text)
        const n = Number(text)
        if (text.trim() !== "" && Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) onValue(n)
      }}
      onBlur={(e) => {
        setDraft(null)
        onBlur?.(e)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        onKeyDown?.(e)
      }}
    />
  )
}

export default DraftNumberInput
