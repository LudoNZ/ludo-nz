"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
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
  arrayRemove,
  serverTimestamp,
  Timestamp,
  query,
  orderBy,
} from "firebase/firestore"
import { DiceSession, DiceRoll, CustomRule, DiceConfig, normalizeDiceConfig } from "@/components/dice/types"
import PlayerJoinForm from "@/components/dice/playerJoinForm"
import SessionHeader from "@/components/dice/sessionHeader"
import DiceRoller from "@/components/dice/diceRoller"
import RollHistory, { RollAlert, checkRollTriggers } from "@/components/dice/rollHistory"
import RollStats from "@/components/dice/rollStats"
import CustomRules from "@/components/dice/customRules"
import DiceSettings from "@/components/dice/diceSettings"
import { playSound } from "@/components/dice/sounds"

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
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([])
  const toastIdRef = useRef(0)
  const [activeTab, setActiveTab] = useState<"history" | "stats" | "archive">("history")
  const [archiveGameView, setArchiveGameView] = useState<number | null>(null)
  const sessionRef = useRef<DiceSession | null>(null)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const activePlayers = useMemo(() => {
    if (!session) return []
    const inactive = new Set(session.inactivePlayers || [])
    return session.players.filter((p) => !inactive.has(p))
  }, [session])

  const currentPlayer = useMemo(() => {
    if (activePlayers.length === 0) return null
    const index = (session?.currentTurnIndex ?? 0) % activePlayers.length
    return activePlayers[index]
  }, [activePlayers, session?.currentTurnIndex])

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
      const data = snap.data()
      setSession({
        ...data,
        inactivePlayers: data.inactivePlayers || [],
        currentTurnIndex: data.currentTurnIndex ?? 0,
        currentGame: data.currentGame ?? 1,
        games: data.games || [],
        diceConfig: normalizeDiceConfig(data.diceConfig),
      } as DiceSession)
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

      snap.docChanges().forEach((change) => {
        if (change.type === "added" && sessionRef.current) {
          const roll = { id: change.doc.id, ...change.doc.data() } as DiceRoll
          const newAlerts = checkRollTriggers(roll, newRolls, sessionRef.current.customRules)
          if (newAlerts.length > 0) {
            setAlerts((prev) => [...prev, ...newAlerts])
            for (const a of newAlerts) {
              playSound(a.sound || "alert")
            }
            if (navigator.vibrate) navigator.vibrate([200, 100, 200])
            for (const a of newAlerts) {
              const id = ++toastIdRef.current
              setToasts((prev) => [...prev, { id, message: a.message }])
              setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id))
              }, 4000)
            }
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

  const advanceTurn = useCallback(async () => {
    if (!session) return
    const nextIndex = (session.currentTurnIndex ?? 0) + 1
    try {
      await updateDoc(doc(firestore, "diceSessions", code), {
        currentTurnIndex: nextIndex,
      })
    } catch { /* ignore */ }
  }, [code, session])

  const handleNewGame = useCallback(async () => {
    if (!session) return
    const nextGame = (session.currentGame ?? 1) + 1
    const updatedGames = [...(session.games || []), { number: nextGame, startedAt: Timestamp.now() }]
    try {
      await updateDoc(doc(firestore, "diceSessions", code), {
        currentGame: nextGame,
        currentTurnIndex: 0,
        games: updatedGames,
      })
    } catch {
      setError("Failed to start new game")
    }
  }, [code, session])

  const handleDiceConfigChange = useCallback(async (config: DiceConfig) => {
    try {
      await updateDoc(doc(firestore, "diceSessions", code), { diceConfig: config })
    } catch {
      setError("Failed to update dice settings")
    }
  }, [code])

  const handleRoll = useCallback(async (dice: number[], isRandom: boolean) => {
    if (!currentPlayer) return
    setError("")

    try {
      await addDoc(collection(firestore, "diceSessions", code, "rolls"), {
        player: currentPlayer,
        dice,
        diceTypes: session?.diceConfig.dice ?? [6, 6],
        total: dice.reduce((s, v) => s + v, 0),
        isRandom,
        game: session?.currentGame ?? 1,
        timestamp: serverTimestamp(),
      })

      if (session && !session.players.includes(currentPlayer)) {
        await updateDoc(doc(firestore, "diceSessions", code), {
          players: arrayUnion(currentPlayer),
        })
      }

      await advanceTurn()
    } catch {
      setError("Failed to log roll. Please try again.")
    }
  }, [code, currentPlayer, session, advanceTurn])

  const handleAddPlayer = useCallback(async (name: string) => {
    try {
      await updateDoc(doc(firestore, "diceSessions", code), {
        players: arrayUnion(name),
      })
    } catch {
      setError("Failed to add player")
    }
  }, [code])

  const handleReorder = useCallback(async (newOrder: string[]) => {
    try {
      await updateDoc(doc(firestore, "diceSessions", code), {
        players: newOrder,
      })
    } catch {
      setError("Failed to reorder players")
    }
  }, [code])

  const handleToggleActive = useCallback(async (player: string) => {
    if (!session) return
    const inactive = new Set(session.inactivePlayers || [])
    try {
      if (inactive.has(player)) {
        await updateDoc(doc(firestore, "diceSessions", code), {
          inactivePlayers: arrayRemove(player),
        })
      } else {
        await updateDoc(doc(firestore, "diceSessions", code), {
          inactivePlayers: arrayUnion(player),
        })
      }
    } catch {
      setError("Failed to update player status")
    }
  }, [code, session])

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

  const triggerCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of alerts) {
      counts.set(a.ruleId, (counts.get(a.ruleId) || 0) + 1)
    }
    return counts
  }, [alerts])

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

      <div className={styles.headerBar}>
        <SessionHeader
          code={code}
          session={session}
          currentPlayer={currentPlayer}
          onReorder={handleReorder}
          onToggleActive={handleToggleActive}
          onAddPlayer={handleAddPlayer}
        />
        <DiceSettings
          config={session.diceConfig}
          onSave={handleDiceConfigChange}
        />
      </div>

      {toasts.length > 0 && (
        <div className={styles.toastContainer}>
          {toasts.map((t) => (
            <div key={t.id} className={styles.toast}>
              {t.message}
            </div>
          ))}
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.layout}>
        <div className={styles.leftCol}>
          {currentPlayer && (
            <DiceRoller
              currentPlayer={currentPlayer}
              diceConfig={session.diceConfig}
              onRoll={handleRoll}
            />
          )}
          <CustomRules
            rules={session.customRules}
            triggerCounts={triggerCounts}
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
            {(session.games || []).length > 1 && (
              <button
                className={`${styles.tab} ${activeTab === "archive" ? styles.activeTab : ""}`}
                onClick={() => setActiveTab("archive")}
              >
                Archive
              </button>
            )}
          </div>

          {activeTab === "history" && (
            <RollHistory
              rolls={rolls.filter((r) => (r.game || 1) === (session.currentGame ?? 1))}
              alerts={alerts}
              currentGame={session.currentGame ?? 1}
              onNewGame={handleNewGame}
            />
          )}
          {activeTab === "stats" && (
            <RollStats
              rolls={rolls}
              currentGame={session.currentGame ?? 1}
              diceConfig={session.diceConfig}
            />
          )}
          {activeTab === "archive" && (
            <div className={styles.archive}>
              <h3 className={styles.archiveHeading}>Archived Games</h3>
              <div className={styles.archiveList}>
                {(session.games || [])
                  .filter((g) => g.number !== (session.currentGame ?? 1))
                  .map((g) => {
                    const gameRolls = rolls.filter((r) => (r.game || 1) === g.number)
                    const startDate = g.startedAt?.toDate
                      ? g.startedAt.toDate().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "Unknown"
                    return (
                      <button
                        key={g.number}
                        className={`${styles.archiveItem} ${archiveGameView === g.number ? styles.archiveActive : ""}`}
                        onClick={() => setArchiveGameView(archiveGameView === g.number ? null : g.number)}
                      >
                        <span className={styles.archiveGameNum}>Game {g.number}</span>
                        <span className={styles.archiveMeta}>{startDate} · {gameRolls.length} rolls</span>
                      </button>
                    )
                  })}
              </div>
              {archiveGameView !== null && (
                <>
                  <RollHistory
                    rolls={rolls.filter((r) => (r.game || 1) === archiveGameView)}
                    alerts={alerts}
                    currentGame={archiveGameView}
                    onNewGame={() => {}}
                    readOnly
                  />
                  <RollStats
                    rolls={rolls.filter((r) => (r.game || 1) === archiveGameView)}
                    currentGame={archiveGameView}
                    diceConfig={session.diceConfig}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <Link href="/dice" className={styles.backLink}>← Back to Dice Tracker</Link>
    </div>
  )
}

export default DiceSessionPage
