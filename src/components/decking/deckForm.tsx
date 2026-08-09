"use client"

import { useState } from "react"
import Button from "@/components/button/button"
import { BoardDirection, DeckConfig } from "./types"
import styles from "./deckForm.module.scss"

type FormState = Omit<DeckConfig, "id" | "updatedAt" | "stockLengths"> & {
  stockLengthsText: string
}

const toFormState = (deck: Omit<DeckConfig, "id" | "updatedAt">): FormState => ({
  ...deck,
  stockLengthsText: deck.stockLengths.map((mm) => (mm / 1000).toString()).join(", "),
})

const DeckForm: React.FC<{
  initial: Omit<DeckConfig, "id" | "updatedAt">
  onSave: (deck: Omit<DeckConfig, "id" | "updatedAt">) => void
  onCancel?: () => void
  saveLabel?: string
}> = ({ initial, onSave, onCancel, saveLabel = "Save" }) => {
  const [state, setState] = useState<FormState>(toFormState(initial))

  const num = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setState((s) => ({ ...s, [key]: Number(e.target.value) || 0 }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const stockLengths = state.stockLengthsText
      .split(",")
      .map((v) => parseFloat(v.trim()))
      .filter((v) => !isNaN(v) && v > 0)
      .map((v) => Math.round(v * 1000))
      .sort((a, b) => a - b)

    onSave({
      name: state.name,
      width: state.width,
      sideA: state.sideA,
      sideB: state.sideB,
      joistSpacing: state.joistSpacing,
      boardWidth: state.boardWidth,
      boardGap: state.boardGap,
      minStagger: state.minStagger,
      boardDirection: state.boardDirection,
      stockLengths,
    })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label htmlFor="name">Deck name</label>
        <input
          id="name"
          type="text"
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          required
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="width">Width (mm)</label>
        <span className={styles.hint}>Across the deck — perpendicular to the boards</span>
        <input id="width" type="number" min={100} value={state.width} onChange={num("width")} required />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="sideA">Square-end length (mm)</label>
          <input id="sideA" type="number" min={100} value={state.sideA} onChange={num("sideA")} required />
        </div>
        <div className={styles.field}>
          <label htmlFor="sideB">Raked-end length (mm)</label>
          <input id="sideB" type="number" min={100} value={state.sideB} onChange={num("sideB")} required />
        </div>
      </div>

      <div className={styles.field}>
        <label>Board direction</label>
        <span className={styles.hint}>
          Which way the boards run relative to the raked end
        </span>
        <div className={styles.segmented}>
          <button
            type="button"
            className={state.boardDirection !== "alongRake" ? styles.active : ""}
            onClick={() => setState((s) => ({ ...s, boardDirection: "intoRake" as BoardDirection }))}
          >
            Into the rake
          </button>
          <button
            type="button"
            className={state.boardDirection === "alongRake" ? styles.active : ""}
            onClick={() => setState((s) => ({ ...s, boardDirection: "alongRake" as BoardDirection }))}
          >
            Along the rake
          </button>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="boardWidth">Board width (mm)</label>
          <input id="boardWidth" type="number" min={10} value={state.boardWidth} onChange={num("boardWidth")} required />
        </div>
        <div className={styles.field}>
          <label htmlFor="boardGap">Board gap (mm)</label>
          <input id="boardGap" type="number" min={0} value={state.boardGap} onChange={num("boardGap")} required />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="joistSpacing">Joist centres (mm)</label>
          <input
            id="joistSpacing"
            type="number"
            min={50}
            value={state.joistSpacing}
            onChange={num("joistSpacing")}
            required
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="minStagger">Min. join stagger (mm)</label>
          <input
            id="minStagger"
            type="number"
            min={0}
            value={state.minStagger}
            onChange={num("minStagger")}
            required
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="stockLengths">Available board lengths (m)</label>
        <span className={styles.hint}>Comma-separated, e.g. 3.6, 4.2, 4.8, 5.4, 6.0</span>
        <input
          id="stockLengths"
          type="text"
          value={state.stockLengthsText}
          onChange={(e) => setState((s) => ({ ...s, stockLengthsText: e.target.value }))}
          required
        />
      </div>

      <div className={styles.actions}>
        <Button type="submit" size="large" onClick={() => {}}>
          {saveLabel}
        </Button>
        {onCancel && (
          <Button size="medium" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}

export default DeckForm
