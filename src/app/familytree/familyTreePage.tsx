"use client"

import React, { useState, useEffect } from "react"
import styles from "./familyTreePage.module.scss"
import { useRouter } from "next/navigation"
import Button from "@/components/button/button"
import { firestore } from "../../../firebase/client"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"
import Link from "next/link"
import { getDemoFamilySeed } from "@/components/familyTree/seedData"
import { FamilyTreeData } from "@/components/familyTree/types"

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
    const raw = localStorage.getItem("familyTree_sessions")
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveSessionToHistory(code: string, name: string, isCreator: boolean) {
  const history = getSessionHistory().filter((s) => s.code !== code)
  history.unshift({ code, name, joinedAt: Date.now(), isCreator })
  if (history.length > 20) history.length = 20
  localStorage.setItem("familyTree_sessions", JSON.stringify(history))
}

type Mode = "create" | "join"
type SeedChoice = "blank" | "demo"

function seedFor(choice: SeedChoice): FamilyTreeData {
  if (choice === "demo") return getDemoFamilySeed()
  return { people: [], relationships: [] }
}

const FamilyTreePage: React.FC = () => {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("create")
  const [name, setName] = useState("")
  const [sessionCode, setSessionCode] = useState("")
  const [seedChoice, setSeedChoice] = useState<SeedChoice>("demo")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<SessionHistory[]>([])
  const [forgetCode, setForgetCode] = useState<string | null>(null)

  const handleForget = (code: string) => {
    const updated = history.filter((s) => s.code !== code)
    setHistory(updated)
    localStorage.setItem("familyTree_sessions", JSON.stringify(updated))
    setForgetCode(null)
  }

  useEffect(() => {
    const lastName = localStorage.getItem("familyTree_lastName") || ""
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
        const snap = await getDoc(doc(firestore, "familyTreeSessions", code))
        if (snap.exists()) {
          setError("That code is already in use. Leave it blank to auto-generate.")
          setLoading(false)
          return
        }
      } else {
        code = generateSessionCode()
        let attempts = 0
        while (attempts < 5) {
          const snap = await getDoc(doc(firestore, "familyTreeSessions", code))
          if (!snap.exists()) break
          code = generateSessionCode()
          attempts++
        }
      }

      const seed = seedFor(seedChoice)

      await setDoc(doc(firestore, "familyTreeSessions", code), {
        createdAt: serverTimestamp(),
        creatorName: name.trim(),
        people: seed.people,
        relationships: seed.relationships,
      })

      localStorage.setItem("familyTree_lastName", name.trim())
      saveSessionToHistory(code, name.trim(), true)
      router.push(`/familytree/${code}`)
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
      const snap = await getDoc(doc(firestore, "familyTreeSessions", code))
      if (!snap.exists()) {
        setError("Session not found. Check the code and try again.")
        return
      }
      localStorage.setItem("familyTree_lastName", name.trim())
      saveSessionToHistory(code, name.trim(), false)
      router.push(`/familytree/${code}`)
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
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Family Tree Research</h1>
        <p className={styles.subtitle}>
          Build out your family tree, track sources, and mark what&apos;s confirmed vs. still unverified.
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
            ? "Start a new tree. You can set a custom code or leave it blank to auto-generate one."
            : "Enter the session code shared by your family member to view or edit their tree."}
        </p>

        {error && <p className={styles.error}>{error}</p>}

        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={styles.input}
          maxLength={30}
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

        {mode === "create" && (
          <>
            <p className={styles.seedLabel}>Start from</p>
            <div className={styles.seedOptions}>
              <label className={styles.seedOption}>
                <input
                  type="radio"
                  name="seed"
                  checked={seedChoice === "demo"}
                  onChange={() => setSeedChoice("demo")}
                />
                <span>
                  Demo data
                  <span className={styles.seedOptionMeta}>Small placeholder Smith family, just to try the app</span>
                </span>
              </label>
              <label className={styles.seedOption}>
                <input
                  type="radio"
                  name="seed"
                  checked={seedChoice === "blank"}
                  onChange={() => setSeedChoice("blank")}
                />
                <span>
                  Blank tree
                  <span className={styles.seedOptionMeta}>Start with nobody added yet</span>
                </span>
              </label>
            </div>
          </>
        )}

        <Button onClick={handleSubmit} disabled={loading}>
          {loading
            ? (mode === "create" ? "Creating..." : "Joining...")
            : (mode === "create" ? "Create Session" : "Join Session")}
        </Button>
      </div>

      {history.length > 0 && (
        <div className={styles.historySection}>
          <h2 className={styles.historyTitle}>Recent Trees</h2>
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
                  <Link href={`/familytree/${s.code}`} className={styles.historyLink}>
                    {s.isCreator ? "Resume" : "Rejoin"}
                  </Link>
                  {forgetCode === s.code ? (
                    <div className={styles.forgetConfirm}>
                      <span className={styles.forgetText}>Forget this tree?</span>
                      <button className={styles.forgetYes} onClick={() => handleForget(s.code)}>Yes</button>
                      <button className={styles.forgetNo} onClick={() => setForgetCode(null)}>No</button>
                    </div>
                  ) : (
                    <button className={styles.forgetBtn} onClick={() => setForgetCode(s.code)} title="Forget tree">×</button>
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

export default FamilyTreePage
