"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "@/context/auth"
import { loadPriceLibrary, savePriceLibrary } from "@/app/retaining-walls/priceLibraryActions"
import { libraryFromData, PriceLibrary } from "./pricing"

const CACHE_KEY = "retainingWalls.priceLibrary.v1"

const readCache = (uid: string | null): PriceLibrary | null => {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY}:${uid ?? "guest"}`)
    return raw ? libraryFromData(JSON.parse(raw)) : null
  } catch {
    return null
  }
}
const writeCache = (uid: string | null, library: PriceLibrary) => {
  try {
    localStorage.setItem(`${CACHE_KEY}:${uid ?? "guest"}`, JSON.stringify(library))
  } catch {
    // storage full or blocked: the library still works, just not offline
  }
}

// set when a save to the server failed, so the device's copy is newer
// and gets sent up next time, rather than overwritten by the server's
const pendingKey = (uid: string) => `${CACHE_KEY}:pending:${uid}`
const isPending = (uid: string) => {
  try {
    return localStorage.getItem(pendingKey(uid)) === "1"
  } catch {
    return false
  }
}
const setPending = (uid: string, on: boolean) => {
  try {
    if (on) localStorage.setItem(pendingKey(uid), "1")
    else localStorage.removeItem(pendingKey(uid))
  } catch {
    // ignore
  }
}

export type LibraryStatus = "loading" | "ready" | "offline" | "error"

/** The signed-in person's price library. Shown straight away from this
 * device's copy (so it works offline), then refreshed from the server.
 * Signed out, it lives on this device only. Saving updates the device
 * copy at once and the server behind it. */
export function usePriceLibrary() {
  const auth = useAuth()
  const user = auth?.currentUser ?? null
  const uid = user?.uid ?? null
  const [library, setLibrary] = useState<PriceLibrary>(() => libraryFromData(undefined))
  const [status, setStatus] = useState<LibraryStatus>("loading")
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(library)
  latest.current = library

  useEffect(() => {
    if (auth?.authLoading) return
    let cancelled = false
    const cached = readCache(uid)
    if (cached) setLibrary(cached)
    if (!user) {
      setStatus("ready")
      return
    }
    setStatus("loading")
    user
      .getIdToken()
      .then(loadPriceLibrary)
      .then(async ({ library: fromServer, saved }) => {
        if (cancelled) return
        // nothing on the server yet but something on this device (made
        // while signed out), or edits that didn't reach the server: the
        // device's copy wins and is sent up
        const keepLocal = !!cached && (!saved || isPending(uid!))
        const next = keepLocal ? cached! : fromServer
        setLibrary(next)
        writeCache(uid, next)
        setStatus("ready")
        if (keepLocal) {
          await savePriceLibrary(await user.getIdToken(), next)
          setPending(uid!, false)
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.error("Loading the price library failed:", err)
        setStatus(navigator.onLine ? "error" : "offline")
      })
    return () => {
      cancelled = true
    }
  }, [auth?.authLoading, uid, user])

  const save = useCallback(
    async (next: PriceLibrary) => {
      setLibrary(next)
      writeCache(uid, next)
      setError(null)
      if (!user) return
      try {
        const saved = await savePriceLibrary(await user.getIdToken(), next)
        if (uid) setPending(uid, false)
        // a newer edit may have landed while this one was saving
        if (latest.current === next) {
          setLibrary(saved)
          writeCache(uid, saved)
        }
      } catch (err) {
        console.error("Saving the price library failed:", err)
        if (uid) setPending(uid, true)
        setError(navigator.onLine ? "Couldn't save the price library. Try again." : "You're offline: changes are kept on this device, but not saved to your account yet.")
      }
    },
    [uid, user],
  )

  return { library, status, error, save, signedIn: !!user }
}
