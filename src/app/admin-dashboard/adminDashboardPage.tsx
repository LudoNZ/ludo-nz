"use client"

import React, { useState, useEffect } from "react"
import styles from "./adminDashboardPage.module.scss"
import Link from "next/link"
import { useAuth } from "@/context/auth"
import { useRouter } from "next/navigation"

interface SessionSummary {
  code: string
  creatorName: string
  players: string[]
  currentGame: number
  rollCount: number
  createdAt: string | null
}

type Filter = "recent" | "popular"

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
        const res = await fetch(`/api/admin/dice-sessions?filter=${filter}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.detail || data.error || "Failed to fetch")
        setSessions(data.sessions)
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
              <span className={styles.colDate}>Created</span>
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
                <span className={styles.colDate}>
                  {s.createdAt
                    ? new Date(s.createdAt).toLocaleDateString(undefined, {
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
