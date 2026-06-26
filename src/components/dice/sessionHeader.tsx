"use client"

import React, { useState } from "react"
import styles from "./sessionHeader.module.scss"
import { DiceSession, DiceConfig, formatDiceConfig } from "./types"
import DiceSettings from "./diceSettings"

interface SessionHeaderProps {
  code: string
  session: DiceSession
  currentPlayer: string | null
  onReorder: (players: string[]) => void
  onToggleActive: (player: string) => void
  onAddPlayer: (name: string) => void
  diceConfig: DiceConfig
  audioEnabled: boolean
  onDiceConfigChange: (config: DiceConfig) => void
  onToggleAudio: (enabled: boolean) => void
}

const SessionHeader: React.FC<SessionHeaderProps> = ({
  code,
  session,
  currentPlayer,
  onReorder,
  onToggleActive,
  onAddPlayer,
  diceConfig,
  audioEnabled,
  onDiceConfigChange,
  onToggleAudio,
}) => {
  const [copied, setCopied] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  const movePlayer = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= session.players.length) return
    const reordered = [...session.players]
    const temp = reordered[index]
    reordered[index] = reordered[target]
    reordered[target] = temp
    onReorder(reordered)
  }

  const handleAddSubmit = () => {
    const name = newName.trim()
    if (!name) return
    if (session.players.includes(name)) return
    onAddPlayer(name)
    setNewName("")
    setAdding(false)
  }

  const sessionAge = session.createdAt?.toDate
    ? getRelativeTime(session.createdAt.toDate())
    : "just now"

  const inactive = new Set(session.inactivePlayers || [])

  return (
    <div className={styles.header}>
      <div className={styles.codeSection}>
        <span className={styles.label}>Session Code</span>
        <button className={styles.code} onClick={handleCopy} title="Copy code">
          {code}
          <span className={styles.copyHint}>{copied ? "Copied!" : "Click to copy"}</span>
        </button>
      </div>
      <div className={styles.players}>
        <span className={styles.label}>Players</span>
        <div className={styles.playerList}>
          {session.players.map((p, i) => {
            const isInactive = inactive.has(p)
            const isCurrent = p === currentPlayer && !isInactive
            return (
              <div
                key={p}
                className={`${styles.playerTag} ${isInactive ? styles.inactive : ""} ${isCurrent ? styles.current : ""}`}
              >
                <div className={styles.moveButtons}>
                  <button
                    className={styles.moveBtn}
                    onClick={() => movePlayer(i, -1)}
                    disabled={i === 0}
                    title="Move left"
                  >
                    ‹
                  </button>
                  <button
                    className={styles.moveBtn}
                    onClick={() => movePlayer(i, 1)}
                    disabled={i === session.players.length - 1}
                    title="Move right"
                  >
                    ›
                  </button>
                </div>
                <span className={styles.playerName}>{p}</span>
                <button
                  className={styles.toggleBtn}
                  onClick={() => onToggleActive(p)}
                  title={isInactive ? "Activate" : "Deactivate"}
                >
                  {isInactive ? "OFF" : "ON"}
                </button>
              </div>
            )
          })}
          {adding ? (
            <div className={styles.addForm}>
              <input
                type="text"
                placeholder="Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={styles.addInput}
                maxLength={20}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddSubmit()
                  if (e.key === "Escape") { setAdding(false); setNewName("") }
                }}
              />
              <button className={styles.addConfirm} onClick={handleAddSubmit}>+</button>
              <button className={styles.addCancel} onClick={() => { setAdding(false); setNewName("") }}>×</button>
            </div>
          ) : (
            <button className={styles.addBtn} onClick={() => setAdding(true)}>
              + Player
            </button>
          )}
        </div>
      </div>
      <div className={styles.age}>
        <span className={styles.label}>Started</span>
        <span>{sessionAge}</span>
      </div>
      <div className={styles.diceSection}>
        <span className={styles.label}>Dice</span>
        <div className={styles.diceDisplay}>
          <span className={styles.diceLabel}>{formatDiceConfig(diceConfig)}</span>
          <DiceSettings
            config={diceConfig}
            audioEnabled={audioEnabled}
            onSave={onDiceConfigChange}
            onToggleAudio={onToggleAudio}
          />
        </div>
      </div>
    </div>
  )
}

function getRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.floor(diffHours / 24)}d ago`
}

export default SessionHeader
