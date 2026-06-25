"use client"

import React, { useState } from "react"
import styles from "./playerJoinForm.module.scss"
import Button from "@/components/button/button"

interface PlayerJoinFormProps {
  onJoin: (name: string) => void
}

const PlayerJoinForm: React.FC<PlayerJoinFormProps> = ({ onJoin }) => {
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
      </div>
    </div>
  )
}

export default PlayerJoinForm
