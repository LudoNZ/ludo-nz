"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/context/auth"
import WorkoutTimer from "@/components/exercise/workoutTimer"
import MaxTestForm from "@/components/exercise/maxTestForm"
import { savePullupSession } from "@/components/exercise/data"
import { AssistanceLevel, PullupSet } from "@/components/exercise/types"
import styles from "./sessionPage.module.scss"

const SessionPage = () => {
  const auth = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get("mode") === "max" ? "max" : "workout"
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (auth && !auth.authLoading && !auth.currentUser) {
      router.push("/login")
    }
  }, [auth, router])

  if (!auth?.currentUser) {
    return (
      <div className={styles.sessionPage}>
        <p className={styles.loading}>Checking access...</p>
      </div>
    )
  }

  const uid = auth.currentUser.uid

  const handleWorkoutFinish = async (data: {
    assistanceBands: AssistanceLevel
    targetReps: number
    intervalSeconds: number
    sets: PullupSet[]
    totalReps: number
  }) => {
    setSaving(true)
    await savePullupSession(uid, { ...data, isMaxTest: false })
    router.push("/exercise")
  }

  const handleMaxSave = async (reps: number) => {
    setSaving(true)
    await savePullupSession(uid, {
      assistanceBands: 0,
      isMaxTest: true,
      targetReps: reps,
      intervalSeconds: 0,
      sets: [{ reps, elapsedSeconds: 0 }],
      totalReps: reps,
    })
    router.push("/exercise")
  }

  if (saving) {
    return (
      <div className={styles.sessionPage}>
        <p className={styles.loading}>Saving…</p>
      </div>
    )
  }

  return (
    <div className={styles.sessionPage}>
      <h1>{mode === "max" ? "Max unassisted test" : "Pull-up session"}</h1>
      {mode === "max" ? (
        <MaxTestForm onSave={handleMaxSave} onCancel={() => router.push("/exercise")} />
      ) : (
        <WorkoutTimer onFinish={handleWorkoutFinish} onDiscard={() => router.push("/exercise")} />
      )}
    </div>
  )
}

export default SessionPage
