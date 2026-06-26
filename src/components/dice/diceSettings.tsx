"use client"

import React, { useState } from "react"
import styles from "./diceSettings.module.scss"
import Button from "@/components/button/button"
import { DiceConfig, DICE_SIDES_OPTIONS, formatDiceConfig } from "./types"

interface DiceSettingsProps {
  config: DiceConfig
  audioEnabled: boolean
  onSave: (config: DiceConfig) => void
  onToggleAudio: (enabled: boolean) => void
}

const DiceSettings: React.FC<DiceSettingsProps> = ({ config, audioEnabled, onSave, onToggleAudio }) => {
  const [open, setOpen] = useState(false)
  const [dice, setDice] = useState<number[]>(config.dice)

  const handleOpen = () => {
    setDice([...config.dice])
    setOpen(true)
  }

  const handleSave = () => {
    if (dice.length === 0) return
    onSave({ dice })
    setOpen(false)
  }

  const setDieSides = (index: number, sides: number) => {
    setDice((prev) => {
      const next = [...prev]
      next[index] = sides
      return next
    })
  }

  const addDie = () => {
    if (dice.length >= 6) return
    setDice((prev) => [...prev, 6])
  }

  const removeDie = (index: number) => {
    if (dice.length <= 1) return
    setDice((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <>
      <button className={styles.gearBtn} onClick={handleOpen} title="Dice Settings">
        <svg viewBox="0 0 24 24" className={styles.gearIcon}>
          <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1s.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64L19.43 12.97Z" />
        </svg>
      </button>

      {open && (
        <div className={styles.overlay}>
          <div className={styles.panel}>
            <h3>Dice Settings</h3>

            <div className={styles.audioRow}>
              <span className={styles.audioLabel}>Sound</span>
              <button
                className={`${styles.audioToggle} ${audioEnabled ? styles.audioOn : styles.audioOff}`}
                onClick={() => onToggleAudio(!audioEnabled)}
              >
                {audioEnabled ? "ON" : "OFF"}
              </button>
            </div>

            <div className={styles.diceList}>
              {dice.map((sides, i) => (
                <div key={i} className={styles.dieRow}>
                  <span className={styles.dieNum}>Die {i + 1}</span>
                  <div className={styles.options}>
                    {DICE_SIDES_OPTIONS.map((s) => (
                      <button
                        key={s}
                        className={`${styles.optionBtn} ${sides === s ? styles.optionActive : ""}`}
                        onClick={() => setDieSides(i, s)}
                      >
                        d{s}
                      </button>
                    ))}
                  </div>
                  <button
                    className={styles.removeBtn}
                    onClick={() => removeDie(i)}
                    disabled={dice.length <= 1}
                    title="Remove die"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {dice.length < 6 && (
              <button className={styles.addDieBtn} onClick={addDie}>
                + Add Die
              </button>
            )}

            <p className={styles.preview}>{formatDiceConfig({ dice })}</p>

            <div className={styles.actions}>
              <Button onClick={handleSave} size="small">Save</Button>
              <Button onClick={() => setOpen(false)} variant="secondary" size="small">Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default DiceSettings
