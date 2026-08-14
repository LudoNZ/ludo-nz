"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/context/auth"
import { StoredProject, subscribeToProjects } from "./data"

/** Same private+public dual-subscription pattern deckingPage.tsx/
 * deckDetailPage.tsx/cutModePage.tsx already run for decks, factored out
 * here since projects need the identical loading dance in three places —
 * the two-place duplication decks already have is a tolerated pre-
 * existing pattern, but a third copy of the same boilerplate on brand
 * new code is worth avoiding from the start. */
export function useProjectsList() {
  const auth = useAuth()
  const [publicProjects, setPublicProjects] = useState<StoredProject[]>([])
  const [publicLoaded, setPublicLoaded] = useState(false)
  const [privateProjects, setPrivateProjects] = useState<StoredProject[]>([])
  const [privateLoaded, setPrivateLoaded] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeToProjects({ kind: "public" }, (data) => {
      setPublicProjects(data)
      setPublicLoaded(true)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!auth || auth.authLoading) return // still resolving — wait rather than flash "none"
    if (!auth.currentUser) {
      setPrivateProjects([])
      setPrivateLoaded(true)
      return
    }
    const unsubscribe = subscribeToProjects({ kind: "private", uid: auth.currentUser.uid }, (data) => {
      setPrivateProjects(data)
      setPrivateLoaded(true)
    })
    return () => unsubscribe()
  }, [auth, auth?.authLoading, auth?.currentUser])

  return {
    projects: [...privateProjects, ...publicProjects],
    privateProjects,
    publicProjects,
    loaded: publicLoaded && privateLoaded,
  }
}
