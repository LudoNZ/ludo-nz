"use client"

import React, { useState, useEffect } from "react"
import styles from "./adminDashboardPage.module.scss"
import Link from "next/link"
import { useAuth } from "@/context/auth"
import { useRouter } from "next/navigation"
import { firestore } from "../../../firebase/client"
import { collection, getDocs, getCountFromServer, query, orderBy, limit } from "firebase/firestore"

interface SessionSummary {
  code: string
  creatorName: string
  players: string[]
  currentGame: number
  rollCount: number
  rulesCount: number
  diceType: string
  createdAt: Date | null
  lastPlayed: Date | null
}

type Filter = "recent" | "popular" | "active"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatDice(config: any): string {
  if (!config) return "2d6"
  const dice: number[] = Array.isArray(config.dice) ? config.dice :
    (typeof config.count === "number" && typeof config.sides === "number")
      ? Array(config.count).fill(config.sides) : [6, 6]
  const groups: Record<number, number> = {}
  for (const s of dice) groups[s] = (groups[s] || 0) + 1
  return Object.entries(groups)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([sides, count]) => `${count}d${sides}`)
    .join(", ")
}

export const AdminDashboardPage = () => {
  const auth = useAuth()
  const router = useRouter()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [filter, setFilter] = useState<Filter>("recent")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (auth && !auth.currentUser) {
      router.push("/")
    }
  }, [auth, router])

  useEffect(() => {
    if (!auth?.customClaims?.admin) return
    const fetchSessions = async () => {
      setLoading(true)
      setError("")
      try {
        const snap = await getDocs(collection(firestore, "diceSessions"))

        const sessions: SessionSummary[] = await Promise.all(
          snap.docs.map(async (doc) => {
            const data = doc.data()
            const rollsRef = collection(firestore, "diceSessions", doc.id, "rolls")
            const rollsSnap = await getCountFromServer(query(rollsRef))
            const lastRollSnap = await getDocs(query(rollsRef, orderBy("timestamp", "desc"), limit(1)))
            const lastPlayed = lastRollSnap.docs[0]?.data()?.timestamp?.toDate?.() || null
            return {
              code: doc.id,
              creatorName: data.creatorName || "—",
              players: data.players || [],
              currentGame: data.currentGame ?? 1,
              rollCount: rollsSnap.data().count,
              rulesCount: (data.customRules || []).length,
              diceType: formatDice(data.diceConfig),
              createdAt: data.createdAt?.toDate?.() || null,
              lastPlayed,
            }
          })
        )

        if (filter === "popular") {
          sessions.sort((a, b) => b.rollCount - a.rollCount)
        } else if (filter === "active") {
          sessions.sort((a, b) => {
            if (!a.lastPlayed && !b.lastPlayed) return 0
            if (!a.lastPlayed) return 1
            if (!b.lastPlayed) return -1
            return b.lastPlayed.getTime() - a.lastPlayed.getTime()
          })
        } else {
          sessions.sort((a, b) => {
            if (!a.createdAt || !b.createdAt) return 0
            return b.createdAt.getTime() - a.createdAt.getTime()
          })
        }
        sessions.length = Math.min(sessions.length, 10)

        setSessions(sessions)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load sessions")
      } finally {
        setLoading(false)
      }
    }
    fetchSessions()
  }, [filter, auth?.customClaims?.admin])

  if (!auth?.customClaims?.admin) {
    return (
      <div className={styles.adminDashboardPage}>
        <p className={styles.loading}>Checking access...</p>
      </div>
    )
  }

  return (
    <div className={styles.adminDashboardPage}>
      <h1>Admin Dashboard</h1>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Dice Sessions</h2>
          <div className={styles.filterToggle}>
            <button
              className={`${styles.filterBtn} ${filter === "recent" ? styles.filterActive : ""}`}
              onClick={() => setFilter("recent")}
            >
              Last 10
            </button>
            <button
              className={`${styles.filterBtn} ${filter === "popular" ? styles.filterActive : ""}`}
              onClick={() => setFilter("popular")}
            >
              Top 10
            </button>
            <button
              className={`${styles.filterBtn} ${filter === "active" ? styles.filterActive : ""}`}
              onClick={() => setFilter("active")}
            >
              Recently Played
            </button>
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {loading ? (
          <p className={styles.loading}>Loading sessions...</p>
        ) : sessions.length === 0 ? (
          <p className={styles.empty}>No sessions found</p>
        ) : (
          <div className={styles.table}>
            <div className={styles.tableHeader}>
              <span className={styles.colCode}>Code</span>
              <span className={styles.colCreator}>Creator</span>
              <span className={styles.colPlayers}>Players</span>
              <span className={styles.colGames}>Games</span>
              <span className={styles.colRolls}>Rolls</span>
              <span className={styles.colRules}>Rules</span>
              <span className={styles.colDice}>Dice</span>
              <span className={styles.colDate}>Created</span>
              <span className={styles.colDate}>Last Played</span>
            </div>
            {sessions.map((s) => (
              <Link
                key={s.code}
                href={`/dice/${s.code}`}
                className={styles.tableRow}
              >
                <span className={styles.colCode}>{s.code}</span>
                <span className={styles.colCreator}>{s.creatorName}</span>
                <span className={styles.colPlayers}>{s.players.join(", ")}</span>
                <span className={styles.colGames}>{s.currentGame}</span>
                <span className={styles.colRolls}>{s.rollCount}</span>
                <span className={styles.colRules}>{s.rulesCount}</span>
                <span className={styles.colDice}>{s.diceType}</span>
                <span className={styles.colDate}>
                  {s.createdAt
                    ? s.createdAt.toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </span>
                <span className={styles.colDate}>
                  {s.lastPlayed
                    ? s.lastPlayed.toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
