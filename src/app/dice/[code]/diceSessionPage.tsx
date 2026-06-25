"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import styles from "./diceSessionPage.module.scss"
import Link from "next/link"
import { firestore } from "../../../../firebase/client"
import {
  doc,
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore"
import { DiceSession, DiceRoll, CustomRule } from "@/components/dice/types"
import PlayerJoinForm from "@/components/dice/playerJoinForm"
import SessionHeader from "@/components/dice/sessionHeader"
import DiceRoller from "@/components/dice/diceRoller"
import RollHistory, { RollAlert, checkRollTriggers } from "@/components/dice/rollHistory"
import RollStats from "@/components/dice/rollStats"
import CustomRules from "@/components/dice/customRules"

interface DiceSessionPageProps {
  code: string
}

const DiceSessionPage: React.FC<DiceSessionPageProps> = ({ code }) => {
  const [session, setSession] = useState<DiceSession | null>(null)
  const [rolls, setRolls] = useState<DiceRoll[]>([])
  const [playerName, setPlayerName] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState("")
  const [alerts, setAlerts] = useState<RollAlert[]>([])
  const [activeTab, setActiveTab] = useState<"history" | "stats">("history")
  const sessionRef = useRef<DiceSession | null>(null)
  const rollsRef = useRef<DiceRoll[]>([])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    rollsRef.current = rolls
  }, [rolls])

  useEffect(() => {
    const stored = localStorage.getItem(`diceTracker_playerName_${code}`)
    if (stored) setPlayerName(stored)
  }, [code])

  useEffect(() => {
    const sessionDoc = doc(firestore, "diceSessions", code)
    const unsubSession = onSnapshot(sessionDoc, (snap) => {
      if (!snap.exists()) {
        setNotFound(true)
        return
      }
      setSession(snap.data() as DiceSession)
    })

    const rollsQuery = query(
      collection(firestore, "diceSessions", code, "rolls"),
      orderBy("timestamp", "asc")
    )
    const unsubRolls = onSnapshot(rollsQuery, (snap) => {
      const newRolls: DiceRoll[] = []
      snap.forEach((d) => {
        newRolls.push({ id: d.id, ...d.data() } as DiceRoll)
      })
      setRolls(newRolls)

      // Check triggers for the most recent roll
      snap.docChanges().forEach((change) => {
        if (change.type === "added" && sessionRef.current) {
          const roll = { id: change.doc.id, ...change.doc.data() } as DiceRoll
          const newAlerts = checkRollTriggers(roll, newRolls, sessionRef.current.customRules)
          if (newAlerts.length > 0) {
            setAlerts((prev) => [...prev, ...newAlerts])
          }
        }
      })
    })

    return () => {
      unsubSession()
      unsubRolls()
    }
  }, [code])

  const handleJoin = useCallback(async (name: string) => {
    localStorage.setItem(`diceTracker_playerName_${code}`, name)
    localStorage.setItem("diceTracker_lastPlayerName", name)
    setPlayerName(name)

    try {
      const history = JSON.parse(localStorage.getItem("diceTracker_sessions") || "[]")
        .filter((s: { code: string }) => s.code !== code)
      history.unshift({ code, name, joinedAt: Date.now(), isCreator: false })
      if (history.length > 20) history.length = 20
      localStorage.setItem("diceTracker_sessions", JSON.stringify(history))
    } catch { /* ignore */ }

    try {
      await updateDoc(doc(firestore, "diceSessions", code), {
        players: arrayUnion(name),
      })
    } catch {
      setError("Failed to join session")
    }
  }, [code])

  const handleRoll = useCallback(async (die1: number, die2: number, isRandom: boolean) => {
    if (!playerName) return
    setError("")

    try {
      await addDoc(collection(firestore, "diceSessions", code, "rolls"), {
        player: playerName,
        die1,
        die2,
        total: die1 + die2,
        isRandom,
        timestamp: serverTimestamp(),
      })
    } catch {
      setError("Failed to log roll. Please try again.")
    }
  }, [code, playerName])

  const handleAddRule = useCallback(async (rule: CustomRule) => {
    if (!session) return
    try {
      await updateDoc(doc(firestore, "diceSessions", code), {
        customRules: [...session.customRules, rule],
      })
    } catch {
      setError("Failed to add rule")
    }
  }, [code, session])

  const handleToggleRule = useCallback(async (ruleId: string) => {
    if (!session) return
    const updated = session.customRules.map((r) =>
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    )
    try {
      await updateDoc(doc(firestore, "diceSessions", code), { customRules: updated })
    } catch {
      setError("Failed to update rule")
    }
  }, [code, session])

  const handleRemoveRule = useCallback(async (ruleId: string) => {
    if (!session) return
    const updated = session.customRules.filter((r) => r.id !== ruleId)
    try {
      await updateDoc(doc(firestore, "diceSessions", code), { customRules: updated })
    } catch {
      setError("Failed to remove rule")
    }
  }, [code, session])

  if (notFound) {
    return (
      <div className={styles.sessionPage}>
        <div className={styles.notFound}>
          <h2>Session Not Found</h2>
          <p>The session code &quot;{code}&quot; doesn&apos;t exist or has expired.</p>
          <Link href="/dice" className={styles.backLink}>← Back to Dice Tracker</Link>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className={styles.sessionPage}>
        <p className={styles.loading}>Loading session...</p>
      </div>
    )
  }

  return (
    <div className={styles.sessionPage}>
      {!playerName && <PlayerJoinForm onJoin={handleJoin} />}

      <SessionHeader code={code} session={session} />

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.layout}>
        <div className={styles.leftCol}>
          {playerName && (
            <DiceRoller
              playerName={playerName}
              onRoll={handleRoll}
            />
          )}
          <CustomRules
            rules={session.customRules}
            onAdd={handleAddRule}
            onToggle={handleToggleRule}
            onRemove={handleRemoveRule}
          />
        </div>

        <div className={styles.rightCol}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === "history" ? styles.activeTab : ""}`}
              onClick={() => setActiveTab("history")}
            >
              History
            </button>
            <button
              className={`${styles.tab} ${activeTab === "stats" ? styles.activeTab : ""}`}
              onClick={() => setActiveTab("stats")}
            >
              Stats
            </button>
          </div>

          {activeTab === "history" && <RollHistory rolls={rolls} alerts={alerts} />}
          {activeTab === "stats" && <RollStats rolls={rolls} />}
        </div>
      </div>

      <Link href="/dice" className={styles.backLink}>← Back to Dice Tracker</Link>
    </div>
  )
}

export default DiceSessionPage
