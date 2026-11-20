"use client"

import { useEffect, useState } from "react"

/** A number input that keeps its own text while typing, so clearing it
 * or typing "-" on the way to a negative doesn't snap back — only a
 * value that parses gets committed upward. */
const NumField: React.FC<{
  value: number
  onChange: (v: number) => void
  id?: string
  min?: number
  /** anything typed over it is applied as `max` (the box keeps what was
   * typed until it's left) */
  max?: number
  step?: number
  className?: string
  ariaLabel?: string
  disabled?: boolean
  /** step arrows land on whole multiples of `step` (5 → 6, not 5.1 → 6.1
   * off a 0.1 minimum). `min` is still enforced on what's typed, and any
   * value can still be typed by hand. */
  snapToStep?: boolean
}> = ({ value, onChange, id, min, max, step = 1, className, ariaLabel, disabled, snapToStep }) => {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    // what's typed stays while it's what's in use (a number over `max`
    // is in use as `max`)
    setText((t) => (t.trim() !== "" && (max !== undefined ? Math.min(max, Number(t)) : Number(t)) === value ? t : String(value)))
  }, [value, max])

  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      // the browser counts steps from `min`; leaving it off counts from 0
      min={snapToStep ? undefined : min}
      step={step}
      className={className}
      aria-label={ariaLabel}
      disabled={disabled}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value.trim() !== "" && Number.isFinite(n) && (min === undefined || n >= min)) onChange(max !== undefined ? Math.min(max, n) : n)
      }}
      onBlur={() => setText(String(value))}
    />
  )
}

export default NumField
