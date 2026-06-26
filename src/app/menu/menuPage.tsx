"use client"

import React, { useState, useEffect } from "react"
import styles from "./menuPage.module.scss"
import { useRouter } from "next/navigation"
import Button from "@/components/button/button"
import { firestore } from "../../../firebase/client"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"
import Link from "next/link"

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
    const raw = localStorage.getItem("menu_sessions")
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveSessionToHistory(code: string, name: string, isCreator: boolean) {
  const history = getSessionHistory().filter((s) => s.code !== code)
  history.unshift({ code, name, joinedAt: Date.now(), isCreator })
  if (history.length > 20) history.length = 20
  localStorage.setItem("menu_sessions", JSON.stringify(history))
}

type Mode = "create" | "join"

const MenuPage: React.FC = () => {
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
    localStorage.setItem("menu_sessions", JSON.stringify(updated))
    setForgetCode(null)
  }

  useEffect(() => {
    const lastName = localStorage.getItem("menu_lastCreatorName") || ""
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
          setError("Code must be 6 characters")
          setLoading(false)
          return
        }
        const snap = await getDoc(doc(firestore, "menuSessions", code))
        if (snap.exists()) {
          setError("That code is already in use. Leave it blank to auto-generate.")
          setLoading(false)
          return
        }
      } else {
        code = generateSessionCode()
        let attempts = 0
        while (attempts < 5) {
          const snap = await getDoc(doc(firestore, "menuSessions", code))
          if (!snap.exists()) break
          code = generateSessionCode()
          attempts++
        }
      }

      await setDoc(doc(firestore, "menuSessions", code), {
        createdAt: serverTimestamp(),
        creatorName: name.trim(),
        activePlan: null,
      })

      localStorage.setItem("menu_lastCreatorName", name.trim())
      saveSessionToHistory(code, name.trim(), true)
      router.push(`/menu/${code}`)
    } catch {
      setError("Failed to create menu. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async () => {
    const code = sessionCode.trim().toUpperCase()
    if (code.length !== 6) {
      setError("Enter a 6-character code")
      return
    }
    setError("")
    setLoading(true)

    try {
      const snap = await getDoc(doc(firestore, "menuSessions", code))
      if (!snap.exists()) {
        setError("Menu not found. Check the code and try again.")
        setLoading(false)
        return
      }
      if (name.trim()) {
        localStorage.setItem("menu_lastCreatorName", name.trim())
      }
      saveSessionToHistory(code, name.trim() || "Guest", false)
      router.push(`/menu/${code}`)
    } catch {
      setError("Failed to join menu. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = () => {
    if (mode === "create") handleCreate()
    else handleJoin()
  }

  return (
    <div className={styles.menuPage}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Menu</h1>
        <p className={styles.subtitle}>
          Plan your family meals for the week
        </p>
      </section>

      <div className={styles.card}>
        <div className={styles.toggle}>
          <button
            className={`${styles.toggleBtn} ${mode === "create" ? styles.active : ""}`}
            onClick={() => { setMode("create"); setError("") }}
          >
            Create a Menu
          </button>
          <button
            className={`${styles.toggleBtn} ${mode === "join" ? styles.active : ""}`}
            onClick={() => { setMode("join"); setError("") }}
          >
            Join a Menu
          </button>
        </div>

        <p className={styles.description}>
          {mode === "create"
            ? "Start a new menu. Share the code with your family so they can join too."
            : "Enter the code from a family member to join their menu."}
        </p>

        {error && <p className={styles.error}>{error}</p>}

        {mode === "create" && (
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={styles.input}
            maxLength={20}
          />
        )}

        <input
          type="text"
          placeholder={mode === "create" ? "Menu code (optional, auto-generated)" : "Menu code (e.g. A7K2M9)"}
          value={sessionCode}
          onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
          className={styles.input}
          maxLength={6}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />

        <Button onClick={handleSubmit} disabled={loading} size="large">
          {loading
            ? (mode === "create" ? "Creating..." : "Joining...")
            : (mode === "create" ? "Create Menu" : "Join Menu")}
        </Button>
      </div>

      {history.length > 0 && (
        <div className={styles.historySection}>
          <h2 className={styles.historyTitle}>Recent Menus</h2>
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
                  <Link href={`/menu/${s.code}`} className={styles.historyLink}>
                    Open
                  </Link>
                  {forgetCode === s.code ? (
                    <div className={styles.forgetConfirm}>
                      <span className={styles.forgetText}>Forget?</span>
                      <button className={styles.forgetYes} onClick={() => handleForget(s.code)}>Yes</button>
                      <button className={styles.forgetNo} onClick={() => setForgetCode(null)}>No</button>
                    </div>
                  ) : (
                    <button className={styles.forgetBtn} onClick={() => setForgetCode(s.code)} title="Forget menu">×</button>
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

export default MenuPage
