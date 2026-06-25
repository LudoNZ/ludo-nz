"use client"

import React, { useState } from "react"
import styles from "./sessionHeader.module.scss"
import { DiceSession } from "./types"

interface SessionHeaderProps {
  code: string
  session: DiceSession
}

const SessionHeader: React.FC<SessionHeaderProps> = ({ code, session }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  const sessionAge = session.createdAt?.toDate
    ? getRelativeTime(session.createdAt.toDate())
    : "just now"

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
          {session.players.map((p) => (
            <span key={p} className={styles.playerTag}>{p}</span>
          ))}
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
