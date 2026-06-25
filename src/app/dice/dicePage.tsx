"use client"

import React, { useState } from "react"
import styles from "./dicePage.module.scss"
import { useRouter } from "next/navigation"
import Button from "@/components/button/button"
import { firestore } from "../../../firebase/client"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function generateSessionCode(): string {
  let code = ""
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}

const DicePage: React.FC = () => {
  const router = useRouter()
  const [createName, setCreateName] = useState("")
  const [joinCode, setJoinCode] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!createName.trim()) {
      setError("Enter your name to create a session")
      return
    }
    setError("")
    setLoading(true)

    try {
      let code = generateSessionCode()
      let exists = true
      let attempts = 0

      while (exists && attempts < 5) {
        const snap = await getDoc(doc(firestore, "diceSessions", code))
        if (!snap.exists()) {
          exists = false
        } else {
          code = generateSessionCode()
          attempts++
        }
      }

      await setDoc(doc(firestore, "diceSessions", code), {
        createdAt: serverTimestamp(),
        creatorName: createName.trim(),
        players: [createName.trim()],
        customRules: [],
      })

      localStorage.setItem(`diceTracker_playerName_${code}`, createName.trim())
      localStorage.setItem("diceTracker_lastPlayerName", createName.trim())
      router.push(`/dice/${code}`)
    } catch {
      setError("Failed to create session. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase()
    if (code.length !== 6) {
      setError("Session code must be 6 characters")
      return
    }
    setError("")
    setLoading(true)

    try {
      const snap = await getDoc(doc(firestore, "diceSessions", code))
      if (!snap.exists()) {
        setError("Session not found. Check the code and try again.")
        return
      }
      router.push(`/dice/${code}`)
    } catch {
      setError("Failed to join session. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.dicePage}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Dice Roll Tracker</h1>
        <p className={styles.subtitle}>
          Track dice rolls, view stats, and manage house rules for your Catan games
        </p>
      </section>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.cards}>
        <div className={styles.card}>
          <h2>Create Session</h2>
          <p>Start a new dice tracking session and share the code with your friends.</p>
          <input
            type="text"
            placeholder="Your name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            className={styles.input}
            maxLength={20}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? "Creating..." : "Create Session"}
          </Button>
        </div>

        <div className={styles.card}>
          <h2>Join Session</h2>
          <p>Enter a session code to join an existing dice tracking session.</p>
          <input
            type="text"
            placeholder="Session code (e.g. A7K2M9)"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            className={styles.input}
            maxLength={6}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          />
          <Button onClick={handleJoin} disabled={loading}>
            {loading ? "Joining..." : "Join Session"}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default DicePage
