"use client"

import React, { useState } from "react"
import styles from "./playerJoinForm.module.scss"
import Button from "@/components/button/button"

interface PlayerJoinFormProps {
  onJoin: (name: string) => void
  onSpectate: () => void
}

const PlayerJoinForm: React.FC<PlayerJoinFormProps> = ({ onJoin, onSpectate }) => {
  const lastUsedName = typeof window !== "undefined"
    ? localStorage.getItem("diceTracker_lastPlayerName") || ""
    : ""
  const [name, setName] = useState(lastUsedName)

  const handleSubmit = () => {
    if (!name.trim()) return
    onJoin(name.trim())
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.form}>
        <h2>Join Session</h2>
        <p>Enter your name to start rolling dice</p>
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={styles.input}
          maxLength={20}
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        <Button onClick={handleSubmit} disabled={!name.trim()}>
          Join
        </Button>
        <button className={styles.spectateBtn} onClick={onSpectate}>
          Spectate without joining
        </button>
      </div>
    </div>
  )
}

export default PlayerJoinForm
