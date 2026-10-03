"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/auth"
import { getCourse, getSeedSql } from "@/components/interviewPrep/actions"
import CourseView from "@/components/interviewPrep/courseView"
import { firestoreProgressStore } from "@/components/interviewPrep/progressData"
import type { Course } from "@/components/interviewPrep/types"
import styles from "./interviewPrepPage.module.scss"

/** Signed-in users only: redirects to /login otherwise, then fetches the
 * course content with a fresh ID token. */
const InterviewPrepPage = () => {
  const auth = useAuth()
  const router = useRouter()
  const [course, setCourse] = useState<Course | null>(null)
  const [error, setError] = useState<string | null>(null)
  const user = auth?.currentUser ?? null
  const uid = user?.uid
  // one store per signed-in user; a new instance each render would make the
  // course view resubscribe to Firestore on every render
  const store = useMemo(() => (uid ? firestoreProgressStore(uid) : null), [uid])
  // stable identity: the seed card fetches once on mount
  const loadSeedSql = useCallback(() => user!.getIdToken().then(getSeedSql), [user])

  useEffect(() => {
    if (auth && !auth.authLoading && !auth.currentUser) router.push("/login")
  }, [auth, router])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    user
      .getIdToken()
      .then(getCourse)
      .then((c) => !cancelled && setCourse(c))
      .catch((err) => {
        console.error("Loading interview prep course failed:", err)
        if (!cancelled) setError("Couldn't load the course. Try refreshing the page.")
      })
    return () => {
      cancelled = true
    }
  }, [user])

  if (!user || !store || (!course && !error)) {
    return (
      <div className={styles.interviewPrepPage}>
        <p className={styles.muted}>{user ? "Loading course..." : "Checking access..."}</p>
      </div>
    )
  }
  if (!course) {
    return (
      <div className={styles.interviewPrepPage}>
        <p className={styles.muted}>{error}</p>
      </div>
    )
  }
  return <CourseView course={course} store={store} loadSeedSql={loadSeedSql} />
}


export default InterviewPrepPage
