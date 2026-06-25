"use client"

import React, { useState, useRef } from "react"
import styles from "./sessionHeader.module.scss"
import { DiceSession } from "./types"

interface SessionHeaderProps {
  code: string
  session: DiceSession
  currentPlayer: string | null
  onReorder: (players: string[]) => void
  onToggleActive: (player: string) => void
  onAddPlayer: (name: string) => void
}

const SessionHeader: React.FC<SessionHeaderProps> = ({
  code,
  session,
  currentPlayer,
  onReorder,
  onToggleActive,
  onAddPlayer,
}) => {
  const [copied, setCopied] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const dragItem = useRef<number | null>(null)
  const dragOver = useRef<number | null>(null)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  const handleDragStart = (index: number) => {
    dragItem.current = index
  }

  const handleDragEnter = (index: number) => {
    dragOver.current = index
  }

  const handleDragEnd = () => {
    if (dragItem.current === null || dragOver.current === null) return
    if (dragItem.current === dragOver.current) return

    const reordered = [...session.players]
    const [moved] = reordered.splice(dragItem.current, 1)
    reordered.splice(dragOver.current, 0, moved)

    dragItem.current = null
    dragOver.current = null
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
        <span className={styles.label}>Players (drag to reorder)</span>
        <div className={styles.playerList}>
          {session.players.map((p, i) => {
            const isInactive = inactive.has(p)
            const isCurrent = p === currentPlayer && !isInactive
            return (
              <div
                key={p}
                className={`${styles.playerTag} ${isInactive ? styles.inactive : ""} ${isCurrent ? styles.current : ""}`}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragEnter={() => handleDragEnter(i)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
              >
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
              + Add
            </button>
          )}
        </div>
      </div>
      <div className={styles.age}>
        <span className={styles.label}>Started</span>
        <span>{sessionAge}</span>
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
