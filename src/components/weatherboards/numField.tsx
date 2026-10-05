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
  step?: number
  className?: string
  ariaLabel?: string
}> = ({ value, onChange, id, min, step = 1, className, ariaLabel }) => {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText((t) => (Number(t) === value && t.trim() !== "" ? t : String(value)))
  }, [value])

  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      min={min}
      step={step}
      className={className}
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value.trim() !== "" && Number.isFinite(n) && (min === undefined || n >= min)) onChange(n)
      }}
      onBlur={() => setText(String(value))}
    />
  )
}

export default NumField
