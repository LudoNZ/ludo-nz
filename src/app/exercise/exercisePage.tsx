"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import GoalLadder from "@/components/exercise/goalLadder"
import PullupChart from "@/components/exercise/pullupChart"
import SessionHistory from "@/components/exercise/sessionHistory"
import { deletePullupSession, subscribeToPullupSessions } from "@/components/exercise/data"
import { PullupSession } from "@/components/exercise/types"
import styles from "./exercisePage.module.scss"

const ExercisePage = () => {
  const auth = useAuth()
  const router = useRouter()
  const [sessions, setSessions] = useState<PullupSession[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (auth && !auth.authLoading && !auth.currentUser) {
      router.push("/login")
    }
  }, [auth, router])

  useEffect(() => {
    if (!auth?.currentUser) return
    const unsubscribe = subscribeToPullupSessions(auth.currentUser.uid, (data) => {
      setSessions(data)
      setLoaded(true)
    })
    return () => unsubscribe()
  }, [auth?.currentUser])

  if (!auth?.currentUser) {
    return (
      <div className={styles.exercisePage}>
        <p className={styles.loading}>Checking access...</p>
      </div>
    )
  }

  const handleDelete = (id: string) => {
    if (confirm("Delete this session?")) {
      deletePullupSession(auth.currentUser!.uid, id)
    }
  }

  return (
    <div className={styles.exercisePage}>
      <h1>Exercise</h1>
      <p className={styles.subtitle}>
        Assisted pull-up tracker — drop a bungee once you clear 10 clean sets of 10.
      </p>

      <div className={styles.cta}>
        <Link href="/exercise/session?mode=workout">
          <Button size="large" onClick={() => {}}>
            Start workout session
          </Button>
        </Link>
        <Link href="/exercise/session?mode=max">
          <Button size="large" variant="secondary" onClick={() => {}}>
            Log max unassisted test
          </Button>
        </Link>
      </div>

      <section>
        <h2>Goal progress</h2>
        <div className={styles.card}>
          <GoalLadder sessions={sessions} />
        </div>
      </section>

      <section>
        <h2>Progress over time</h2>
        <div className={styles.card}>
          {loaded ? <PullupChart sessions={sessions} /> : <p className={styles.loading}>Loading…</p>}
        </div>
      </section>

      <section>
        <h2>Session history</h2>
        <SessionHistory sessions={sessions} onDelete={handleDelete} />
      </section>
    </div>
  )
}

export default ExercisePage
