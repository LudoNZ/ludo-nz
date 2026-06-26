"use client"

import React, { useState, useEffect } from "react"
import styles from "./dicePage.module.scss"
import { useRouter } from "next/navigation"
import Button from "@/components/button/button"
import { firestore } from "../../../firebase/client"
import { doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp, Timestamp } from "firebase/firestore"
import Link from "next/link"
import { DEFAULT_DICE_CONFIG } from "@/components/dice/types"

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function generateSessionCode(): string {
  let code = ""
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}

interface SessionHistory {
  code: string
  name: string
  joinedAt: number
  isCreator: boolean
}

function getSessionHistory(): SessionHistory[] {
  try {
    const raw = localStorage.getItem("diceTracker_sessions")
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveSessionToHistory(code: string, name: string, isCreator: boolean) {
  const history = getSessionHistory().filter((s) => s.code !== code)
  history.unshift({ code, name, joinedAt: Date.now(), isCreator })
  if (history.length > 20) history.length = 20
  localStorage.setItem("diceTracker_sessions", JSON.stringify(history))
}

type Mode = "create" | "join"

const DicePage: React.FC = () => {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("create")
  const [name, setName] = useState("")
  const [sessionCode, setSessionCode] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<SessionHistory[]>([])
  const [forgetCode, setForgetCode] = useState<string | null>(null)

  const handleForget = (code: string) => {
    const updated = history.filter((s) => s.code !== code)
    setHistory(updated)
    localStorage.setItem("diceTracker_sessions", JSON.stringify(updated))
    localStorage.removeItem(`diceTracker_playerName_${code}`)
    setForgetCode(null)
  }

  useEffect(() => {
    const lastName = localStorage.getItem("diceTracker_lastPlayerName") || ""
    setName(lastName)
    setHistory(getSessionHistory())
  }, [])

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Enter your name")
      return
    }
    setError("")
    setLoading(true)

    try {
      let code = sessionCode.trim().toUpperCase()

      if (code) {
        if (code.length !== 6) {
          setError("Session code must be 6 characters")
          setLoading(false)
          return
        }
        const snap = await getDoc(doc(firestore, "diceSessions", code))
        if (snap.exists()) {
          setError("That code is already in use. Leave it blank to auto-generate.")
          setLoading(false)
          return
        }
      } else {
        code = generateSessionCode()
        let attempts = 0
        while (attempts < 5) {
          const snap = await getDoc(doc(firestore, "diceSessions", code))
          if (!snap.exists()) break
          code = generateSessionCode()
          attempts++
        }
      }

      await setDoc(doc(firestore, "diceSessions", code), {
        createdAt: serverTimestamp(),
        creatorName: name.trim(),
        players: [name.trim()],
        inactivePlayers: [],
        currentTurnIndex: 0,
        currentGame: 1,
        games: [{ number: 1, startedAt: Timestamp.now() }],
        diceConfig: DEFAULT_DICE_CONFIG,
        customRules: [],
      })

      localStorage.setItem(`diceTracker_playerName_${code}`, name.trim())
      localStorage.setItem("diceTracker_lastPlayerName", name.trim())
      saveSessionToHistory(code, name.trim(), true)
      router.push(`/dice/${code}`)
    } catch {
      setError("Failed to create session. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async () => {
    if (!name.trim()) {
      setError("Enter your name")
      return
    }
    const code = sessionCode.trim().toUpperCase()
    if (code.length !== 6) {
      setError("Enter a 6-character session code")
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
      localStorage.setItem(`diceTracker_playerName_${code}`, name.trim())
      localStorage.setItem("diceTracker_lastPlayerName", name.trim())
      saveSessionToHistory(code, name.trim(), false)
      await updateDoc(doc(firestore, "diceSessions", code), {
        players: arrayUnion(name.trim()),
      })
      router.push(`/dice/${code}`)
    } catch {
      setError("Failed to join session. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = () => {
    if (mode === "create") handleCreate()
    else handleJoin()
  }

  return (
    <div className={styles.dicePage}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Dice Roll Tracker</h1>
        <p className={styles.subtitle}>
          Track dice rolls, view stats, and manage house rules for your Catan games
        </p>
      </section>

      <div className={styles.card}>
        <div className={styles.toggle}>
          <button
            className={`${styles.toggleBtn} ${mode === "create" ? styles.active : ""}`}
            onClick={() => { setMode("create"); setError("") }}
          >
            Create Session
          </button>
          <button
            className={`${styles.toggleBtn} ${mode === "join" ? styles.active : ""}`}
            onClick={() => { setMode("join"); setError("") }}
          >
            Join Session
          </button>
        </div>

        <p className={styles.description}>
          {mode === "create"
            ? "Start a new session. You can set a custom code or leave it blank to auto-generate one."
            : "Enter the session code shared by your friend to join their game."}
        </p>

        {error && <p className={styles.error}>{error}</p>}

        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={styles.input}
          maxLength={20}
        />

        <input
          type="text"
          placeholder={mode === "create" ? "Session code (optional, auto-generated)" : "Session code (e.g. A7K2M9)"}
          value={sessionCode}
          onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
          className={styles.input}
          maxLength={6}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />

        <Button onClick={handleSubmit} disabled={loading}>
          {loading
            ? (mode === "create" ? "Creating..." : "Joining...")
            : (mode === "create" ? "Create Session" : "Join Session")}
        </Button>
      </div>

      {history.length > 0 && (
        <div className={styles.historySection}>
          <h2 className={styles.historyTitle}>Recent Sessions</h2>
          <div className={styles.historyList}>
            {history.map((s) => (
              <div key={s.code} className={styles.historyItem}>
                <div className={styles.historyInfo}>
                  <span className={styles.historyCode}>{s.code}</span>
                  <span className={styles.historyMeta}>
                    {s.name} · {s.isCreator ? "created" : "joined"} · {formatAge(s.joinedAt)}
                  </span>
                </div>
                <div className={styles.historyActions}>
                  <Link href={`/dice/${s.code}`} className={styles.historyLink}>
                    {s.isCreator ? "Resume" : "Rejoin"}
                  </Link>
                  {forgetCode === s.code ? (
                    <div className={styles.forgetConfirm}>
                      <span className={styles.forgetText}>Forget this session?</span>
                      <button className={styles.forgetYes} onClick={() => handleForget(s.code)}>Yes</button>
                      <button className={styles.forgetNo} onClick={() => setForgetCode(null)}>No</button>
                    </div>
                  ) : (
                    <button className={styles.forgetBtn} onClick={() => setForgetCode(s.code)} title="Forget session">×</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function formatAge(timestamp: number): string {
  const diffMs = Date.now() - timestamp
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return "yesterday"
  return `${diffDays}d ago`
}

export default DicePage
